// npp: the Notepad++ pack (contract: tools/ide/README.md, brief: "Notepad++ pack").
//   status(o) plan(o) install(o) uninstall(o) open(o)
//   o = { settingsDir?, exe?, theme?, launcher?:{file,args}, functionList?:true, extSkip?:[ext]|'a,b',
//         running?:true|false|'unknown' (tests), spawn? (tests), failAt?:n (tests: stop install before write n) }
// Writes only inside the Notepad++ settings folder, only paths the plan lists, after a backup of every file it changes.
// Every write goes to a temp name in the same folder and is renamed over the target; the manifest is written even when
// an install stops half way (partial:true), so uninstall can always undo what was done.
// Never touches langs.xml, stylers.xml, config.xml; never writes the install folder (auto-completion is staged and the
// user copies it with one elevated command). Text edits are line inserts/removals: every other byte stays.
// There is no force/bypass: a refusal always stops plan, install and uninstall.
// Author: Imperator_Aug (ARSENAL, ia-14f72e19)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const gen = require('./gen');
const platform = require('../../lib/platform');
const X = require('./xml');

const VERSION = 1;
const THEME_NAME = 'GEM2.xml';
const UDL_FILE = gen.LANG + '.udl.xml';
const AC_FILE = gen.LANG + '.xml';
const AC_REL = 'arsenal/autoCompletion/' + AC_FILE;
const PREFIX = 'ARSENAL:';
const NEVER = new Set(['langs.xml', 'stylers.xml', 'config.xml']);
const HARD = new Set(['NO_NPP', 'RUNNING', 'RUN_UNKNOWN', 'PORTABLE', 'CLOUD', 'NO_THEME', 'NO_SETTINGS']);
const ACTIONS = new Set(['new', 'merge', 'stage']);
const THEME_CAP = 16 << 20;
const DEFAULT_THEME = path.join(__dirname, '..', '..', '..', '..', 'run', 'npp', THEME_NAME);

const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const exists = p => { try { fs.statSync(p); return true; } catch (e) { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const readMaybe = p => { try { return fs.readFileSync(p); } catch (e) { return null; } };
const norm = p => path.resolve(p).toLowerCase();
const rel = (S, p) => path.relative(S, p).split(path.sep).join('/');

// ---------- status ----------
function reg(key) {
  try {
    const r = cp.spawnSync('reg', ['query', key, '/ve'], { shell: false, encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const m = /REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(r.stdout || '');
    return m ? m[1].replace(/^"|"$/g, '') : null;
  } catch (e) { return null; }
}

function findExe(o) {
  if (o && o.exe !== undefined) return o.exe && exists(o.exe) ? path.resolve(o.exe) : null;
  const cand = [];
  if (platform.isWin()) {
    const dir = reg('HKLM\\SOFTWARE\\Notepad++'); if (dir) cand.push(path.join(dir, 'notepad++.exe'));
    const ap = reg('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\notepad++.exe'); if (ap) cand.push(ap);
  }
  for (const v of ['ProgramFiles', 'ProgramW6432', 'ProgramFiles(x86)']) if (process.env[v]) cand.push(path.join(process.env[v], 'Notepad++', 'notepad++.exe'));
  for (const c of cand) if (exists(c) && !isDir(c)) return path.resolve(c);
  return null;
}

function versionOf(exe) {
  const b = exe && readMaybe(path.join(path.dirname(exe), 'change.log'));
  if (!b) return null;
  const m = /v(\d+(?:\.\d+)+)/.exec(b.toString('latin1').split(/\r?\n/)[0]);
  return m ? m[1] : null;
}

// tasklist result -> true | false | 'unknown'. Fails closed: an error, a non-zero exit, a timeout (signal) or output with
// neither a CSV row nor an "INFO:" line means we cannot tell.
function parseTasklist(r) {
  if (!r || r.error || r.signal || r.status !== 0) return 'unknown';
  const out = String(r.stdout || '');
  if (/^\s*"notepad\+\+\.exe"\s*,/im.test(out)) return true;
  if (/^\s*"[^"\r\n]*"\s*,\s*"/m.test(out) || /^\s*INFO:/m.test(out)) return false;
  return 'unknown';
}

function isRunning(o) {
  if (o && o.running !== undefined) return o.running === 'unknown' ? 'unknown' : !!o.running;
  if (!platform.isWin()) return false;   // Notepad++ is a Windows program
  // the whole process list (no image filter): it always has CSV rows, so a localised "INFO:" line is not needed
  let r;
  try { r = cp.spawnSync('tasklist', ['/FO', 'CSV', '/NH'], { shell: false, encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 16 << 20 }); }
  catch (e) { return 'unknown'; }
  return parseTasklist(r);
}

const manifestPath = s => path.join(s, 'arsenal', 'manifest.json');
const isStr = v => typeof v === 'string';
function manifestShape(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'not an object';
  if (!Array.isArray(m.files)) return 'files is not a list';
  for (const f of m.files) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return 'a files entry is not an object';
    if (!isStr(f.path) || !f.path) return 'a files entry has no path';
    if (!isStr(f.sha1) || !/^[0-9a-f]{40}$/.test(f.sha1)) return 'a files entry has no sha1';
    if (!ACTIONS.has(f.action)) return 'a files entry has an unknown action';
    if (f.wrap !== undefined && f.wrap !== null && (typeof f.wrap !== 'object' || !isStr(f.wrap.orig) || !isStr(f.wrap.made))) return 'a files entry has a bad wrap';
    if (f.replaced !== undefined && !isStr(f.replaced)) return 'a files entry has a bad replaced';
  }
  if (!Array.isArray(m.commands) || !m.commands.every(isStr)) return 'commands is not a list of strings';
  if (!Array.isArray(m.dirs) || !m.dirs.every(isStr)) return 'dirs is not a list of strings';
  return null;
}
// { state: 'none'|'bad'|'ok', man, why }
function loadManifest(s) {
  if (!s) return { state: 'none' };
  const b = readMaybe(manifestPath(s));
  if (!b) return { state: 'none' };
  let m; try { m = JSON.parse(b.toString('utf8')); } catch (e) { return { state: 'bad', why: 'not JSON' }; }
  const why = manifestShape(m);
  return why ? { state: 'bad', why } : { state: 'ok', man: m };
}
function readManifest(s) { const r = loadManifest(s); return r.state === 'ok' ? r.man : null; }

function status(o) {
  o = o || {};
  const exe = findExe(o);
  const portable = !!(exe && exists(path.join(path.dirname(exe), 'doLocalConf.xml')));
  const appdata = process.env.APPDATA ? path.join(process.env.APPDATA, 'Notepad++') : null;
  const settingsDir = o.settingsDir ? path.resolve(o.settingsDir) : portable ? path.dirname(exe) : appdata;
  const cloud = !!(settingsDir && exists(path.join(settingsDir, 'cloud', 'choice')));
  const running = isRunning(o);
  const lm = loadManifest(settingsDir);
  const problems = [];
  if (!exe) problems.push('NO_NPP');
  if (running === true) problems.push('RUNNING');
  if (running === 'unknown') problems.push('RUN_UNKNOWN');
  if (portable) problems.push('PORTABLE');
  if (cloud) problems.push('CLOUD');
  if (!settingsDir || !isDir(settingsDir)) problems.push('NO_SETTINGS');
  if (lm.state === 'bad') problems.push('BAD_MANIFEST');
  return { exe, version: versionOf(exe), settingsDir, running, portable, cloud, installed: { manifest: lm.man || null }, problems };
}

const MSG = {
  RUNNING: 'Notepad++ is running. Close it first: it rewrites its settings files when it exits.',
  RUN_UNKNOWN: 'Could not tell whether Notepad++ is running (the process list did not answer). Close Notepad++, then try again.',
  PORTABLE: 'This Notepad++ is portable (doLocalConf.xml next to the exe). Not supported: copy the files by hand.',
  CLOUD: 'Notepad++ keeps its settings in a cloud folder (cloud\\choice). Not supported.',
  BAD_MANIFEST: 'arsenal\\manifest.json is damaged or not written by ARSENAL; nothing was changed. Move it away and remove the ARSENAL files by hand.',
};
// refusals shared by plan, install and uninstall
function envRefusals(st) {
  const r = [];
  if (st.running === true) r.push({ code: 'RUNNING', msg: MSG.RUNNING });
  if (st.running === 'unknown') r.push({ code: 'RUN_UNKNOWN', msg: MSG.RUN_UNKNOWN });
  if (st.portable) r.push({ code: 'PORTABLE', msg: MSG.PORTABLE });
  if (st.cloud) r.push({ code: 'CLOUD', msg: MSG.CLOUD });
  return r;
}

// ---------- path safety ----------
// a symlink or junction on abs or on any parent below S (Node reports junctions as symbolic links)
function hasLink(S, abs) {
  const top = norm(S); let p = path.resolve(abs);
  while (norm(p) !== top) {
    try { if (fs.lstatSync(p).isSymbolicLink()) return true; } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') return true; }
    const up = path.dirname(p); if (up === p) return true; p = up;
  }
  return false;
}
function realOf(p) { try { return fs.realpathSync.native(p); } catch (e) { return fs.realpathSync(p); } }
// the deepest existing parent of p, resolved, stays inside realpath(S) (separator-aware)
function realInside(S, p) {
  let rs, d = path.dirname(path.resolve(p));
  try { rs = realOf(S); } catch (e) { return false; }
  while (!exists(d)) { const up = path.dirname(d); if (up === d) return false; d = up; }
  let rd; try { rd = realOf(d); } catch (e) { return false; }
  const a = rs.toLowerCase(), b = rd.toLowerCase(), base = a.endsWith(path.sep) ? a : a + path.sep;
  return b === a || b.startsWith(base);
}
function mergeOk(S) { return new Set([norm(path.join(S, 'shortcuts.xml')), norm(path.join(S, 'functionList', 'overrideMap.xml'))]); }
// why a manifest path may not be touched, or null. kind: 'new'|'stage'|'merge'|'dir'|'backup'
function entryProblem(S, r, kind) {
  if (!isStr(r) || !r) return 'empty path';
  if (path.isAbsolute(r) || /^[A-Za-z]:/.test(r)) return 'absolute path';
  const abs = path.resolve(S, r), rr = path.relative(S, abs);
  if (!rr || rr.startsWith('..') || path.isAbsolute(rr)) return 'outside the settings folder';
  if (kind !== 'dir' && NEVER.has(path.basename(abs).toLowerCase())) return 'langs.xml, stylers.xml and config.xml are never touched';
  if (kind === 'merge' && !mergeOk(S).has(norm(abs))) return 'only shortcuts.xml and functionList\\overrideMap.xml hold merged lines';
  if (kind === 'backup' && !rel(S, abs).toLowerCase().startsWith('arsenal-backup/')) return 'a backup must be under arsenal-backup';
  if (hasLink(S, abs)) return 'a symlink or junction on the way';
  return null;
}
function guardWrite(S, allow, p) {
  if (allow && !allow.has(norm(p))) throw new Error('npp: write outside the allowlist: ' + p);
  const rr = path.relative(S, path.resolve(p));
  if (!rr || rr.startsWith('..') || path.isAbsolute(rr)) throw new Error('npp: write outside the settings folder: ' + p);
  if (hasLink(S, p)) throw new Error('npp: a symlink or junction is on the way to ' + p);
  if (!realInside(S, p)) throw new Error('npp: ' + p + ' resolves outside the settings folder');
}
// temp name in the same folder, then rename over the target: a failure never leaves a truncated file
function writeAtomic(p, buf) {
  const tmp = p + '.arsenal-tmp-' + process.pid;
  try { fs.writeFileSync(tmp, buf); fs.renameSync(tmp, p); }
  catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* gone */ } throw e; }
}

// ---------- text merges ----------
function q(s) { s = String(s); return /[\s"]/.test(s) || !s ? '"' + s.replace(/"/g, '') + '"' : s; }

function defaultLauncher() {
  let sea = false; try { sea = require('node:sea').isSea(); } catch (e) { sea = false; }
  return sea ? { file: process.execPath, args: ['ide'] } : { file: process.execPath, args: [path.join(__dirname, '..', 'ide.js')] };
}

const VK = { K: 75, G: 71, V: 86 };
function commands(launcher) {
  const L = launcher || defaultLauncher();
  const base = [q(L.file)].concat((L.args || []).map(q)).join(' ');
  return [
    { name: PREFIX + ' check this file', key: VK.K, line: base + ' check "$(FULL_CURRENT_PATH)" --pause' },
    { name: PREFIX + ' open in GUI', key: VK.G, line: base + ' send "$(FULL_CURRENT_PATH)" $(CURRENT_LINE) $(CURRENT_COLUMN)' },
    { name: PREFIX + ' show vanilla', key: VK.V, line: base + ' vanilla "$(FULL_CURRENT_PATH)"' },
  ];
}

// drop every element matched by re (outside comments); a line holding only that element goes with its line end
function dropElements(t, re) {
  const ms = X.findAll(t, re); let out = t, removed = [];
  for (let i = ms.length - 1; i >= 0; i--) {
    const m = ms[i], a = m.index, b = a + m[0].length, ls = X.lineStart(out, a);
    let le = out.indexOf('\n', b); le = le < 0 ? out.length : le + 1;
    const before = out.slice(ls, a), after = out.slice(b, le).replace(/\r?\n$/, '');
    if (!before.trim() && !after.trim()) { removed.unshift(out.slice(ls, le)); out = out.slice(0, ls) + out.slice(le); }
    else { removed.unshift(m[0]); out = out.slice(0, a) + out.slice(b); }
  }
  return { text: out, removed };
}

// insert whole lines right before the last open-tag close (outside comments); handles a self-closed or missing block.
// wrap = {orig, made}: after our lines are dropped again, `made` is put back to `orig` (exact bytes).
function insertInBlock(t, tag, lines, parentClose) {
  const eol = X.eolOf(t);
  const close = X.findAll(t, new RegExp('</' + tag + '\\s*>', 'g')).pop();
  if (close) {
    const ls = X.lineStart(t, close.index), pre = t.slice(ls, close.index), ce = close.index + close[0].length;
    const lead = /^[ \t]*/.exec(pre)[0];
    const indent = lines.indent || lead + '\t';
    const body = lines.map(l => indent + l + eol).join('');
    if (!pre.trim()) return { text: t.slice(0, ls) + body + t.slice(ls), at: ls, inserted: body, wrap: null };
    // the close tag shares its line (e.g. <X></X>): it moves to its own line; remember how to take that out again
    const wrap = { orig: t.slice(ls, ce), made: pre + eol + lead + t.slice(close.index, ce) };
    return { text: t.slice(0, close.index) + eol + body + lead + t.slice(close.index), at: close.index, inserted: eol + body, wrap };
  }
  const self = X.findAll(t, new RegExp('<' + tag + '\\s*/>', 'g')).pop();
  if (self) {
    const ls = X.lineStart(t, self.index), pre = t.slice(ls, self.index), ind = pre.trim() ? '' : pre;
    const indent = ind + '\t';
    const made = '<' + tag + '>' + eol + ind + '</' + tag + '>';
    const full = '<' + tag + '>' + eol + lines.map(l => indent + l + eol).join('') + ind + '</' + tag + '>';
    return { text: t.slice(0, self.index) + full + t.slice(self.index + self[0].length), at: self.index, inserted: full, wrap: { orig: self[0], made } };
  }
  const pc = X.findAll(t, new RegExp('</' + parentClose + '\\s*>', 'g')).pop();
  if (!pc) return null;
  const ls = X.lineStart(t, pc.index), pre = t.slice(ls, pc.index), ind = (pre.trim() ? '' : pre) + '\t';
  const block = ind + '<' + tag + '>' + eol + lines.map(l => ind + '\t' + l + eol).join('') + ind + '</' + tag + '>' + eol;
  const made = ind + '<' + tag + '>' + eol + ind + '</' + tag + '>' + eol;
  const at = pre.trim() ? pc.index : ls;
  return { text: t.slice(0, at) + block + t.slice(at), at, inserted: block, wrap: { orig: '', made } };
}

function unwrap(t, wrap) {
  if (wrap && wrap.made && t.includes(wrap.made)) { const i = t.lastIndexOf(wrap.made); t = t.slice(0, i) + wrap.orig + t.slice(i + wrap.made.length); }
  return t;
}

function lineNo(t, p) { let n = 1; for (let i = 0; i < p; i++) if (t.charCodeAt(i) === 10) n++; return n; }

function diffOf(file, removed, insText, at, after) {
  const L = ['--- ' + file, '+++ ' + file];
  for (const r of removed) for (const l of r.replace(/\r?\n$/, '').split(/\r?\n/)) L.push('- ' + l);
  L.push('@@ line ' + lineNo(after, at) + ' @@');
  for (const l of insText.replace(/^\r?\n/, '').replace(/\r?\n$/, '').split(/\r?\n/)) L.push('+ ' + l);
  return L.join('\n');
}

const ARS_CMD = /<Command\s+name="ARSENAL:[^"]*"[^>]*>[^<]*<\/Command>/g;
const ATTR = (s, n) => { const m = new RegExp('\\b' + n + '\\s*=\\s*"([^"]*)"').exec(s); return m ? m[1] : null; };

function takenKeys(t) {
  const set = new Set();
  for (const m of X.findAll(t, /<(Command|Macro|Shortcut|PluginCommand|ScintKey|NextKey)\b[^>]*>/g)) {
    const k = +ATTR(m[0], 'Key'); if (!k) continue;
    set.add([ATTR(m[0], 'Ctrl') === 'yes', ATTR(m[0], 'Alt') === 'yes', ATTR(m[0], 'Shift') === 'yes', k].join());
  }
  return set;
}

// latin1 view keeps every byte; our inserted text is UTF-8 bytes seen as latin1
const u2l = s => Buffer.from(s, 'utf8').toString('latin1');

function mergeShortcuts(buf, cmds) {
  const t0 = buf.toString('latin1');
  const dropped = dropElements(t0, ARS_CMD);
  const t = dropped.text, taken = takenKeys(t), keyless = [];
  const lines = cmds.map(c => {
    const free = !taken.has([true, true, true, c.key].join());
    if (!free) keyless.push(c.name);
    const k = free ? c.key : 0;
    return u2l(`<Command name="${X.esc(c.name)}" Ctrl="${k ? 'yes' : 'no'}" Alt="${k ? 'yes' : 'no'}" Shift="${k ? 'yes' : 'no'}" Key="${k}">${X.esc(c.line)}</Command>`);
  });
  // indent like an existing uncommented Command
  const ex = X.findAll(t, /<Command\b/g)[0];
  if (ex) { const ls = X.lineStart(t, ex.index), pre = t.slice(ls, ex.index); if (!pre.trim()) lines.indent = pre; }
  const r = insertInBlock(t, 'UserDefinedCommands', lines, 'NotepadPlus');
  if (!r) return null;
  return { buf: Buffer.from(r.text, 'latin1'), keyless, wrap: r.wrap, diff: diffOf('shortcuts.xml', dropped.removed, r.inserted, r.at, r.text) };
}

function unmergeShortcuts(buf, wrap) {
  return Buffer.from(unwrap(dropElements(buf.toString('latin1'), ARS_CMD).text, wrap), 'latin1');
}

const ASSOC = `<association id="${gen.FL_FILE}" userDefinedLangName="${gen.LANG}"/>`;
const ASSOC_RE = new RegExp('<association\\s+id\\s*=\\s*"' + gen.FL_FILE.replace(/[.\-]/g, '\\$&') + '"[^>]*/>', 'g');
const MIN_OVERRIDE = '<?xml version="1.0" encoding="UTF-8" ?>\r\n<NotepadPlus>\r\n\t<functionList>\r\n\t\t<associationMap>\r\n\t\t</associationMap>\r\n\t</functionList>\r\n</NotepadPlus>\r\n';

function mergeOverride(buf) {
  const t0 = buf.toString('latin1'), dropped = dropElements(t0, ASSOC_RE), t = dropped.text;
  const lines = [ASSOC];
  const ex = X.findAll(t, /<association\b/g).pop();
  if (ex) { const ls = X.lineStart(t, ex.index), pre = t.slice(ls, ex.index); if (!pre.trim()) lines.indent = pre; }
  const r = insertInBlock(t, 'associationMap', lines, 'functionList');
  if (!r) return null;
  return { buf: Buffer.from(r.text, 'latin1'), wrap: r.wrap, diff: diffOf('overrideMap.xml', dropped.removed, r.inserted, r.at, r.text) };
}
function unmergeOverride(buf, wrap) {
  return Buffer.from(unwrap(dropElements(buf.toString('latin1'), ASSOC_RE).text, wrap), 'latin1');
}

const MIN_SHORTCUTS = '<?xml version="1.0" encoding="UTF-8" ?>\r\n<NotepadPlus>\r\n\t<InternalCommands />\r\n\t<Macros />\r\n\t<UserDefinedCommands>\r\n\t</UserDefinedCommands>\r\n\t<PluginCommands />\r\n\t<ScintillaKeys />\r\n</NotepadPlus>\r\n';

// the whole file is checked (up to THEME_CAP; larger files are refused by plan with their own message)
function isTheme(buf) {
  if (!buf || buf.length > THEME_CAP) return false;
  const t = buf.toString('latin1');
  return /<NotepadPlus[\s>]/.test(t) && (/<LexerStyles[\s>]/.test(t) || /<GlobalStyles[\s>]/.test(t)) && !X.wellFormed(t);
}

// ---------- plan ----------
function target(list, p, action, why, content, extra) {
  const t = Object.assign({ path: p, action, why }, extra || {});
  Object.defineProperty(t, 'content', { value: content, enumerable: false });
  list.push(t); return t;
}

// a generated file we own: new, skip (same bytes), or replace. A file that is not the one ARSENAL wrote (no manifest
// entry with its hash) is the user's: backed up, recorded as `replaced` and put back on uninstall.
function ownFile(list, p, buf, why, ours) {
  const cur = readMaybe(p);
  if (cur && sha1(cur) === sha1(buf)) return target(list, p, 'skip', 'already there, same content');
  if (!cur) return target(list, p, 'new', why, buf);
  if (ours(p, cur)) return target(list, p, 'new', why + '; replaces an older ARSENAL copy (backed up)', buf);
  return target(list, p, 'new', 'replace (your file is backed up and put back on uninstall): ' + why, buf, { replace: true });
}

function plan(o) {
  o = o || {};
  const st = status(o), S = st.settingsDir, refuse = [], targets = [], elevated = [];
  const say = (code, msg) => refuse.push({ code, msg });
  if (st.problems.includes('NO_NPP')) say('NO_NPP', 'Notepad++ was not found (registry, Program Files). Install it or pass --exe.');
  for (const r of envRefusals(st)) refuse.push(r);
  if (st.problems.includes('NO_SETTINGS')) say('NO_SETTINGS', 'The Notepad++ settings folder does not exist: ' + S + '. Start Notepad++ once, then close it.');
  const lm = loadManifest(S);
  if (lm.state === 'bad') say('BAD_MANIFEST', MSG.BAD_MANIFEST + ' (' + lm.why + ')');
  const themeSrc = o.theme ? path.resolve(o.theme) : DEFAULT_THEME;
  let themeBuf = null, themeBig = false;
  try { const sz = fs.statSync(themeSrc).size; if (sz > THEME_CAP) themeBig = true; else themeBuf = fs.readFileSync(themeSrc); } catch (e) { themeBuf = null; }
  if (themeBig) say('NO_THEME', 'The theme ' + themeSrc + ' is larger than 16 MB; a Notepad++ theme is far smaller. Pass --theme with the path to your GEM2.xml.');
  else if (!isTheme(themeBuf)) say('NO_THEME', 'No Notepad++ theme at ' + themeSrc + '. Pass --theme with the path to your GEM2.xml.');
  const out = { ok: false, refuse, targets, elevated, settingsDir: S, exe: st.exe, notes: [], exts: [] };
  if (!S) return out;
  const d = gen.load(o);
  const installDir = st.exe ? path.dirname(st.exe) : null;
  const prevFiles = new Map(((lm.man && lm.man.files) || []).map(f => [f.path, f]));
  const ours = (p, cur) => { const f = prevFiles.get(rel(S, p)); return !!(f && f.sha1 === sha1(cur)); };

  // 1 theme
  if (themeBuf && isTheme(themeBuf)) {
    const dst = path.join(S, 'themes', THEME_NAME), cur = readMaybe(dst);
    if (!cur) target(targets, dst, 'new', 'your GEM2 theme (byte copy)', themeBuf);
    else if (sha1(cur) === sha1(themeBuf)) target(targets, dst, 'skip', 'already there, same file');
    else { target(targets, dst, 'skip', 'a different themes\\GEM2.xml is already there; left as it is'); say('THEME_DIFFERENT', 'A different themes\\GEM2.xml is already in Notepad++; it was left alone. The rest installs.'); }
  }
  // 2 UDL
  out.exts = gen.exts(d);
  ownFile(targets, path.join(S, 'userDefineLangs', UDL_FILE), Buffer.from(gen.udl(d), 'utf8'), 'language GEM2-AS2 for game files (; comments, {} folding, GEM2 colours)', ours);
  out.notes.push('Notepad++ will open these extensions as GEM2-AS2 game text: ' + out.exts.join(' ') + ' (leave some out with --ext-skip a,b)');
  // 3 function list (opt-in)
  const fl = path.join(S, 'functionList');
  const stockFl = installDir ? path.join(installDir, 'functionList') : null;
  const flExists = isDir(fl);
  const stockList = !flExists && stockFl && isDir(stockFl) ? fs.readdirSync(stockFl).sort().filter(f => /\.xml$/i.test(f) && f.toLowerCase() !== 'overridemap.xml' && f.toLowerCase() !== gen.FL_FILE && !isDir(path.join(stockFl, f))) : [];
  if (o.functionList !== true) {
    out.notes.push('Function list is off. Turn it on with --function-list to list {blocks} and (define in the Function List panel.' +
      (flExists ? '' : ' Notepad++ then reads parsers from the settings folder only, so the stock parsers' + (stockList.length ? ' (' + stockList.length + ' files)' : '') + ' are copied there; they stay at this Notepad++ version (no updates) until you uninstall.'));
  } else {
    if (stockList.length) {
      out.notes.push('Notepad++ reads functionList from the settings folder only when that folder exists, so the stock parsers (' + stockList.length + ' files) are copied there first; they stay at this Notepad++ version until you uninstall.');
      for (const f of stockList) target(targets, path.join(fl, f), 'new', 'stock function list copied from the install folder', fs.readFileSync(path.join(stockFl, f)));
    }
    ownFile(targets, path.join(fl, gen.FL_FILE), Buffer.from(gen.functionList(), 'utf8'), 'function list: top-level blocks and (define', ours);
    const om = path.join(fl, 'overrideMap.xml'), omCur = readMaybe(om);
    if (omCur) {
      const m = mergeOverride(omCur);
      if (!m) say('BAD_OVERRIDEMAP', 'overrideMap.xml has no associationMap; left alone.');
      else if (m.buf.equals(omCur)) target(targets, om, 'skip', 'association already there');
      else target(targets, om, 'merge', 'adds one association line for GEM2-AS2', m.buf, { diff: m.diff, wrap: m.wrap });
    } else {
      const base = (stockFl && readMaybe(path.join(stockFl, 'overrideMap.xml'))) || Buffer.from(MIN_OVERRIDE);
      const m = mergeOverride(base) || mergeOverride(Buffer.from(MIN_OVERRIDE));
      target(targets, om, 'new', 'overrideMap.xml (stock copy) with the GEM2-AS2 association', m.buf);
    }
  }
  // 4 auto-completion (install folder only: staged + one elevated copy)
  const ac = gen.autoCompletion(d), acBuf = Buffer.from(ac.text, 'utf8');
  const staged = path.join(S, 'arsenal', 'autoCompletion', AC_FILE);
  const stCur = readMaybe(staged);
  if (stCur && sha1(stCur) === sha1(acBuf)) target(targets, staged, 'skip', 'staged copy already there');
  else target(targets, staged, 'stage', `auto-completion (${ac.words} words, ${ac.funcs} with hints); Notepad++ reads it from the install folder only`, acBuf);
  if (installDir) {
    const to = path.join(installDir, 'autoCompletion', AC_FILE), toCur = readMaybe(to);
    if (!toCur || sha1(toCur) !== sha1(acBuf)) {
      const e = { from: staged, to, cmd: `copy /Y "${staged}" "${to}"` };
      if (toCur) {
        const prevAc = prevFiles.get(AC_REL);
        e.overwrites = !(prevAc && prevAc.sha1 === sha1(toCur));
        out.notes.push(e.overwrites
          ? 'The install folder already has a different ' + to + ' (not the one ARSENAL staged); the copy command replaces it. Keep a copy first if it is yours.'
          : 'The install folder has an older ARSENAL ' + to + '; the copy command updates it.');
      }
      elevated.push(e);
    }
  }
  // 5 shortcuts
  const sc = path.join(S, 'shortcuts.xml'), scCur = readMaybe(sc), cmds = commands(o.launcher);
  const base = scCur || Buffer.from(MIN_SHORTCUTS);
  const m = mergeShortcuts(base, cmds);
  if (!m) say('BAD_SHORTCUTS', 'shortcuts.xml has no NotepadPlus root; left alone.');
  else {
    for (const n of m.keyless) out.notes.push(`"${n}": its key Ctrl+Alt+Shift+${String.fromCharCode(cmds.find(c => c.name === n).key)} is already used; installed without a key (set one in Settings > Shortcut Mapper > Run commands).`);
    if (scCur && m.buf.equals(scCur)) target(targets, sc, 'skip', 'Run menu commands already there');
    else target(targets, sc, scCur ? 'merge' : 'new', 'Run menu: ' + cmds.map(c => c.name).join(', '), m.buf, { diff: m.diff, wrap: m.wrap, commands: cmds.map(c => c.name), keyless: m.keyless });
  }
  for (const t of targets) if (NEVER.has(path.basename(t.path).toLowerCase())) throw new Error('npp: refusing to touch ' + t.path);
  out.ok = !refuse.some(r => HARD.has(r.code) || r.code.startsWith('BAD_'));
  return out;
}

// ---------- install / uninstall ----------
function missingDirs(S, p) { const out = []; let d = path.dirname(p); while (norm(d).startsWith(norm(S) + path.sep) && !exists(d)) { out.push(d); d = path.dirname(d); } return out; }

function install(o) {
  o = o || {};
  const p = plan(o);
  const res = Object.assign({}, p, { backup: null, manifest: null, written: [] });
  if (!p.ok) return res;
  const S = p.settingsDir, writes = p.targets.filter(t => t.action !== 'skip');
  const mp = manifestPath(S), prev = readManifest(S);
  if (!writes.length) { res.manifest = prev ? mp : null; return res; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bdir = path.join(S, 'arsenal-backup', stamp);
  const allow = new Set(writes.map(t => norm(t.path)).concat([norm(mp)]));
  const dirs = new Set((prev && prev.dirs) || []);
  const files = new Map(((prev && prev.files) || []).map(f => [f.path, f]));
  const backupOf = new Map();
  let err = null, i = 0;
  try {
    for (const t of writes) guardWrite(S, allow, t.path);
    // backups first
    for (const t of writes) {
      if (!exists(t.path)) continue;
      const b = path.join(bdir, path.relative(S, t.path));
      guardWrite(S, null, b);
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.copyFileSync(t.path, b);
      backupOf.set(t.path, b);
      res.backup = bdir;
    }
    // writes: temp name + rename, one manifest entry per file actually written
    for (const t of writes) {
      if (o.failAt === i++) throw new Error('stopped before writing ' + t.path + ' (test)');
      guardWrite(S, allow, t.path);
      for (const d of missingDirs(S, t.path)) dirs.add(rel(S, d));
      fs.mkdirSync(path.dirname(t.path), { recursive: true });
      writeAtomic(t.path, t.content);
      res.written.push(t.path);
      const r = rel(S, t.path), old = files.get(r);
      const action = t.action === 'merge' || (old && old.action === 'merge') ? 'merge' : t.action;
      const e = { path: r, sha1: sha1(t.content), action };
      if (t.wrap || (old && old.wrap)) e.wrap = t.wrap || old.wrap;
      if (t.replace && backupOf.has(t.path)) e.replaced = rel(S, backupOf.get(t.path));
      else if (old && old.replaced) e.replaced = old.replaced;
      files.set(r, e);
    }
  } catch (e) { err = e; }
  finally {
    const man = { version: VERSION, time: new Date().toISOString(), files: [...files.values()], commands: commands(o.launcher).map(c => c.name), dirs: [...dirs].sort() };
    if (err) { man.partial = true; man.error = String(err.message || err); }
    if (res.written.length || prev || err) {
      try {
        guardWrite(S, allow, mp);
        for (const d of missingDirs(S, mp)) { dirs.add(rel(S, d)); man.dirs = [...dirs].sort(); }
        fs.mkdirSync(path.dirname(mp), { recursive: true });
        writeAtomic(mp, JSON.stringify(man, null, 2) + '\n');
        res.manifest = mp;
      } catch (e2) { err = err || e2; if (err !== e2) err = new Error(err.message + '; the manifest could not be written either: ' + e2.message); }
    }
  }
  if (err) { res.ok = false; res.partial = true; res.error = String(err.message || err); }
  return res;
}

function uninstall(o) {
  o = o || {};
  const st = status(o), S = st.settingsDir, out = { removed: [], kept: [], refuse: envRefusals(st), elevated: [] };
  if (out.refuse.length) return out;
  const lm = loadManifest(S);
  if (lm.state === 'none') { out.note = 'nothing installed (no arsenal\\manifest.json)'; return out; }
  const mp = manifestPath(S);
  const mpBad = lm.state === 'bad' ? lm.why : entryProblem(S, rel(S, mp), 'new');
  if (mpBad) { out.refuse.push({ code: 'BAD_MANIFEST', msg: MSG.BAD_MANIFEST + ' (' + mpBad + ')' }); return out; }
  const man = lm.man;
  if (man.partial) out.note = 'the last install stopped half way' + (man.error ? ' (' + man.error + ')' : '') + '; removing what it wrote';
  const allow = new Set([norm(mp)]), todo = [];
  let acSha = null;
  for (const f of man.files) {
    let why = entryProblem(S, f.path, f.action);
    if (!why && f.replaced) { const w2 = entryProblem(S, f.replaced, 'backup'); if (w2) why = 'its backup ' + f.replaced + ': ' + w2; }
    if (why) { out.kept.push({ path: f.path, why: 'refused (' + why + '); left in place' }); continue; }
    const abs = path.resolve(S, f.path);
    allow.add(norm(abs)); todo.push({ f, abs });
    if (f.path === AC_REL) acSha = f.sha1;
  }
  for (const { f, abs } of todo) {
    try {
      const cur = readMaybe(abs);
      if (f.action === 'merge') {
        if (!cur) continue;
        const b = path.basename(abs).toLowerCase();
        const nb = b === 'shortcuts.xml' ? unmergeShortcuts(cur, f.wrap) : unmergeOverride(cur, f.wrap);
        if (!nb.equals(cur)) { guardWrite(S, allow, abs); writeAtomic(abs, nb); out.removed.push(abs + ' (our lines)'); }
        continue;
      }
      if (cur && sha1(cur) !== f.sha1) { out.kept.push({ path: abs, why: 'changed since install (hash differs); left in place' }); continue; }
      if (cur) { guardWrite(S, allow, abs); fs.unlinkSync(abs); out.removed.push(abs); }
      if (f.replaced) {
        const bk = readMaybe(path.resolve(S, f.replaced));
        if (bk) { guardWrite(S, allow, abs); writeAtomic(abs, bk); out.removed.push(abs + ' (your earlier file put back from ' + f.replaced + ')'); }
        else out.kept.push({ path: abs, why: 'your earlier file should be in ' + f.replaced + ' but that backup is gone' });
      }
    } catch (e) { out.kept.push({ path: abs, why: 'could not change it: ' + e.message }); }
  }
  guardWrite(S, allow, mp); fs.unlinkSync(mp);
  for (const d of man.dirs.slice().sort((a, b) => b.length - a.length)) {
    if (entryProblem(S, d, 'dir')) continue;
    const abs = path.resolve(S, d);
    try { if (isDir(abs) && !fs.readdirSync(abs).length) fs.rmdirSync(abs); } catch (e) { /* keep */ }
  }
  const acInst = st.exe && path.join(path.dirname(st.exe), 'autoCompletion', AC_FILE);
  const acCur = acInst && readMaybe(acInst);
  if (acCur) {
    if (acSha && sha1(acCur) === acSha) out.elevated.push({ from: null, to: acInst, cmd: `del "${acInst}"` });
    else out.kept.push({ path: acInst, why: 'not the auto-completion file ARSENAL staged; left alone (no del suggested)' });
  }
  return out;
}

// ---------- open ----------
function open(o) {
  o = o || {};
  const file = o.file && path.resolve(o.file);
  if (!file || !exists(file)) return { ok: false, error: 'no such file: ' + (o.file || '') };
  const exe = o.exe !== undefined ? o.exe : findExe(o);
  if (!exe) return { ok: false, error: 'Notepad++ was not found' };
  const line = Math.max(1, parseInt(o.line, 10) || 1), col = Math.max(1, parseInt(o.col, 10) || 1);
  const args = ['-n' + line, '-c' + col].concat(o.readOnly ? ['-ro'] : [], [file]);
  const spawn = o.spawn || cp.spawn;
  const ch = spawn(exe, args, { shell: false, detached: true, stdio: 'ignore', windowsHide: false });
  if (ch && typeof ch.unref === 'function') ch.unref();
  return { ok: true, exe, args };
}

module.exports = { status, plan, install, uninstall, open, commands, mergeShortcuts, unmergeShortcuts, mergeOverride, unmergeOverride, isTheme, parseTasklist, manifestShape, entryProblem, realInside, DEFAULT_THEME, PREFIX, THEME_CAP };
