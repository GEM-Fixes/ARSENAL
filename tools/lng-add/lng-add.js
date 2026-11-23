#!/usr/bin/env node
// lng-add: add/replace one key in a mod's UTF-8 .lng, byte-preserving elsewhere (CRLF/LF, BOM, indent kept). rows LOC-01,03..08,10.
//   node tools/lng-add/lng-add.js <mod dir> --file <rel .lng> --key <full key> --text "<t>" [--lang all] [--game G] [--exe as64|mowas_2|goh] [--loc code] [--force] [--dry-run]
// --file: path under the mod's localization/ (virtual /interface/text/), e.g. desc.lng or '#mymod.lng'; created if missing ({tags}).
// --key: key as the game sees it: <file title>/<nested names> (title dropped for '#' files, LOC-10), e.g. desc/entity/foo.
// --text escapes: \n \t \\ \" are read as escapes (real newline/tab/quote/backslash), then re-escaped for the .lng (LOC-06).
// codes: LNG_KEY_EXISTS (refused w/o --force) LNG_KEY_PREFIX LNG_KEY_IS_BLOCK LNG_ENC LNG_FILE_REPLACES_VANILLA
//   WARN_LNG_KEY_SHADOWS_VANILLA (key in another vanilla file: vanilla wins, LOC-19 [V]; names the copy-whole-file route) LNG_LINT_<code> (new lnglint finding) WARN_TEXT_LONG
// --lang: engine has one lng set (LOC-17): accepted, no-op.
//   [--exe as64|mowas_2|mowas2|goh] [--loc <code>]: the game (lib/games). none = as before: the --game folder's own exe
//     (as64.exe -> as64, binaries/x64/call_to_arms.exe -> goh, else mowas_2). --exe goh without --game: the GoH install.
//   vanilla keys: localization.pak, and on as64 also the loose as64/core/localization/ (mounted after base on as64.exe only).
//   GoH (GHLOC-01, GHLOC-09, GHVFS-04 [V]): the file goes to localizations/<code>/interface/text/<file> (--loc, default 'default';
//     a mod's root localization/ is never read). --file .lng = the same {tags} form and key rule as AS2; --file .pot (codes default
//     and en only, GHLOC-05) or .po (other codes): one gettext entry, key = msgctxt (no file prefix), .pot text in msgid with
//     msgstr "" (shown as msgid, GHLOC-06), .po text in msgstr; a #, fuzzy flag on a replaced entry is dropped (fuzzy = no text).
//     vanilla keys from localizations/<code>.pak and localizations/<code>/ (.pot, .lng); a key in another vanilla file:
//     GoH keeps the text of the file read later (.pot before .lng, then sorted names, GHLOC-08 [I]): WARN_LNG_KEY_SHADOWS_VANILLA
//     only when vanilla would win.
// Author: Imperator_Aug (ARSENAL, ia-d70d1f36)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const sdl = require('../lib/sdl'), pak = require('../lib/pak'), { readText } = require('../lib/enc');
const { createReport } = require('../lib/report');
const games = require('../lib/games');

const DEFAULT_GAME = require('../lib/gamedir').resolve().dir;
// the game folder and vfs exe of a run: --exe first, else the folder's own exe (vfs order)
function gameOf(o) {
  const game = o.game || (o.exe === 'goh' ? games.install('goh').dir : DEFAULT_GAME);
  let exe = o.exe;
  if (!exe) exe = game && fs.existsSync(path.join(game, 'as64.exe')) ? 'as64' : game && fs.existsSync(path.join(game, 'binaries', 'x64', 'call_to_arms.exe')) ? 'goh' : 'mowas_2';
  return { game, exe };
}

// tokens -> tree with open/close positions
function tree(lines) {
  const toks = sdl.tokenize(lines, () => {}, { resync: 'nextQuote' });
  const root = { name: null, line: 0, vals: [], kids: [], close: null }, st = [root];
  let named = true;
  for (const k of toks) {
    const cur = st[st.length - 1];
    if (k.t === '{') { const n = { name: null, line: k.line, vals: [], kids: [], open: k, close: null }; cur.kids.push(n); st.push(n); named = false; }
    else if (k.t === '}') { if (st.length > 1) st.pop().close = k; named = true; }
    else if (!named) { cur.name = k.v; named = true; }
    else cur.vals.push(k);
  }
  return root;
}

function esc(t) { return t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t'); }
function unesc(t) { // CLI input: \n \t \\ \" as escapes
  return t.replace(/\\(.)/g, (m, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c === '\\' ? '\\' : c === '"' ? '"' : m);
}

// vanilla key sets: Map lower key -> vanilla virtual file (relative path under interface/text/)
// one .lng (name = path under interface/text/) into keys
function lngKeys(keys, name, buf) {
  const r = readText(buf, 'utf8');
  if (r.fatal) return;
  const rt = sdl.parseLines(r.lines, () => {}, { resync: 'nextQuote' });
  const base = path.posix.basename(name, path.posix.extname(name)), dir = path.posix.dirname(name);
  const prefix = (dir === '.' ? '' : dir + '/') + (base.startsWith('#') ? '' : base + '/');
  for (const t of rt.kids) {
    if (!t.name) continue;
    const visit = (n, kp) => { const key = kp + n.name; if (n.kids.length) n.kids.forEach(c => visit(c, key + '/')); else keys.set(key.toLowerCase(), name); };
    if (t.name.toLowerCase() === 'tags') t.kids.forEach(c => visit(c, prefix)); else visit(t, prefix);
  }
}
// loose files under dir -> [{name (rel, '/'), read()}]
function looseFiles(dir, re) {
  const out = [];
  (function walk(d, rel) {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (re.test(e.name)) out.push({ name: r, read: () => fs.readFileSync(path.join(d, e.name)) });
    }
  })(dir, '');
  return out;
}
// AS2: localization.pak, then (as64.exe only) the loose as64/core/localization/ mounted after it (lib/vfs step 3c)
function vanillaKeys(game, exe) {
  const f = path.join(game || '', 'localization.pak');
  const keys = new Map(), files = new Set();
  if (!game || !fs.existsSync(f)) return null;
  const ents = pak.list(f);
  for (const e of ents) {
    if (!/\.lng$/i.test(e.name)) continue;
    files.add(e.name.toLowerCase());
    lngKeys(keys, e.name, pak.read(ents, e));
  }
  if (exe === 'as64') for (const x of looseFiles(path.join(game, 'as64', 'core', 'localization'), /\.lng$/i)) { files.add(x.name.toLowerCase()); lngKeys(keys, x.name, x.read()); }
  return { keys, files };
}
// GoH: localizations/<code>.pak (entries <code>/interface/text/...) and localizations/<code>/interface/text/ (.pot, .po, .lng)
function vanillaKeysGoh(game, code) {
  const ld = path.join(game || '', 'localizations'), keys = new Map(), files = new Set();
  if (!game || !fs.existsSync(ld)) return null;
  const pre = code.toLowerCase() + '/interface/text/';
  const take = (name, buf) => {
    files.add(name.toLowerCase());
    if (/\.lng$/i.test(name)) lngKeys(keys, name, buf);
    else for (const en of parsePo(buf.toString('utf8')).entries) if (en.ctx !== null && !en.fuzzy && !keys.has(en.ctx.toLowerCase())) keys.set(en.ctx.toLowerCase(), name);
  };
  const pk = path.join(ld, code + '.pak');
  if (fs.existsSync(pk)) {
    const ents = pak.list(pk);
    for (const e of ents) { const n = e.name.replace(/\\/g, '/'); if (n.toLowerCase().startsWith(pre) && /\.(pot|po|lng)$/i.test(n)) take(n.slice(pre.length), pak.read(ents, e)); }
  }
  for (const x of looseFiles(path.join(ld, code, 'interface', 'text'), /\.(pot|po|lng)$/i)) take(x.name, x.read());
  return { keys, files };
}

// gettext .po/.pot (GHLOC-06): entries with their line span; strings joined, escapes kept as written
function parsePo(src) {
  const lines = src.split('\n').map(l => l.replace(/\r$/, '')), entries = [];
  let cur = null, field = null;
  const str = l => { const m = /^\s*"(.*)"\s*$/.exec(l); return m ? m[1] : null; };
  const flush = () => { if (cur && (cur.id !== null || cur.ctx !== null)) entries.push(cur); cur = null; field = null; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { flush(); continue; }
    if (!cur) cur = { start: i, end: i, ctx: null, id: null, str: null, fuzzy: false, ctxLine: -1 };
    cur.end = i;
    if (/^#,.*\bfuzzy\b/.test(l)) { cur.fuzzy = true; continue; }
    if (l.startsWith('#')) continue;
    const m = /^(msgctxt|msgid|msgstr)\s+"(.*)"\s*$/.exec(l);
    if (m) { if (m[1] === 'msgctxt' && cur.id !== null) { flush(); cur = { start: i, end: i, ctx: null, id: null, str: null, fuzzy: false, ctxLine: -1 }; }
      field = m[1] === 'msgctxt' ? 'ctx' : m[1] === 'msgid' ? 'id' : 'str'; cur[field] = m[2]; if (field === 'ctx') cur.ctxLine = i; continue; }
    const s = str(l);
    if (s !== null && field) cur[field] += s;
  }
  flush();
  return { lines, entries };
}
// GHLOC-01/05: .pot is read for the default language (codes default, en); .po for the other codes
function potKindOk(file, code) {
  const c = code.toLowerCase(), fb = c === 'default' || c === 'en';
  if (/\.pot$/i.test(file) && !fb) return `a .pot is read only for the language codes default and en (GHLOC-05); for "${code}" write a .po`;
  if (/\.po$/i.test(file) && fb) return `a .po under "${code}" is never read: codes default and en load .pot and .lng only (GHLOC-05); write a .pot`;
  return null;
}
// add or replace one gettext entry -> {out, replaced} | {code, msg, line}
function editPo(src, key, text, kind, force, eol) {
  const { lines, entries } = parsePo(src);
  const hit = entries.find(e => e.ctx !== null && e.ctx.toLowerCase() === key.toLowerCase());   // GoH: first in a file stays (GHLOC-08)
  const block = ['msgctxt "' + esc(key) + '"', 'msgid "' + esc(text) + '"', 'msgstr "' + (kind === 'po' ? esc(text) : '') + '"'];
  if (hit) {
    if (!force) return { code: 'LNG_KEY_EXISTS', line: hit.ctxLine + 1, msg: `"${key}" already defined (GoH keeps the first entry of a file, GHLOC-08); use --force to replace` };
    let a = hit.ctxLine;
    const keep = lines.slice(hit.start, a).filter(l => !/^#,.*\bfuzzy\b/.test(l));   // comments kept, fuzzy dropped (fuzzy = no text)
    const out = [...lines.slice(0, hit.start), ...keep, ...block, ...lines.slice(hit.end + 1)];
    return { out: out.join(eol), replaced: true };
  }
  let body = src.replace(/(\r?\n)*$/, '');
  return { out: (body ? body + eol + eol : '') + block.join(eol) + eol, replaced: false };
}
function potHeader(title, eol) {
  return ['#, fuzzy', 'msgid ""', 'msgstr ""', `"Project-Id-Version: ${esc(title)}\\n"`, '"Language: en\\n"', '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=UTF-8\\n"', '"Content-Transfer-Encoding: 8bit\\n"', ''].join(eol);
}

function lint(root) {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'lnglint', 'lnglint.js'), root, '-q'], { encoding: 'utf8' });
  const out = [];
  for (const l of (r.stdout || '').split(/\r?\n/)) { const m = l.match(/^(.*?):(\d+): (\S+) (.*)$/); if (m) out.push({ code: m[3], msg: m[4], line: +m[2] }); }
  return out;
}

function run(o) {
  const rep = createReport();
  const G = gameOf(o), goh = G.exe === 'goh', code = o.loc || 'default';
  if (goh && !/^[A-Za-z0-9_]+$/.test(code)) { console.error('--loc must be a language folder code like default, en, ru'); return { fail: 2, rep }; }
  const textDir = goh ? `localizations/${code}/interface/text/` : 'localization/';
  const rel = textDir + o.file.replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.join(o.dir, rel);
  const subj = rel;
  if (!goh && !/\.lng$/i.test(abs)) { console.error('--file must be a .lng'); return { fail: 2, rep }; }
  if (goh && !/\.(lng|pot|po)$/i.test(abs)) { console.error('--file must be a .lng, .pot or .po (Gates of Hell text, GHLOC-01)'); return { fail: 2, rep }; }
  const text = unesc(o.text);
  if (text.length > 2000) rep.add(subj, 0, 'WARN_TEXT_LONG', `text is ${text.length} chars; very long strings are untested [I]`);
  if (goh && /\.pot?$/i.test(abs)) return runPo(o, rep, { rel, abs, subj, text, code, G });

  // read existing bytes
  let buf = null, bom = false;
  if (fs.existsSync(abs)) {
    buf = fs.readFileSync(abs);
    const r = readText(buf, 'utf8');
    if (r.fatal || r.badLines.length) { rep.add(subj, r.badLines[0] || 1, 'LNG_ENC', r.fatal || 'file is not valid UTF-8 (LOC-05); not touched'); return { fail: 1, rep }; }
    bom = buf[0] === 0xEF;
  }
  let src = buf ? buf.toString('utf8') : '{tags\r\n}\r\n';
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const eol = /\r\n/.test(src) ? '\r\n' : /\n/.test(src) ? '\n' : '\r\n';
  const lines = src.split('\n').map(l => l.replace(/\r$/, ''));
  const starts = []; { let p = 0; for (const l of src.split('\n')) { starts.push(p); p += l.length + 1; } }
  const off = (line, col) => starts[line - 1] + col - 1;
  const rt = tree(lines);

  // key relative to file prefix (LOC-10)
  const base = path.basename(abs, path.extname(abs));
  const sub = path.posix.dirname(o.file.replace(/\\/g, '/'));
  const prefix = (sub === '.' ? '' : sub + '/') + (base.startsWith('#') ? '' : base + '/');
  if (!o.key.toLowerCase().startsWith(prefix.toLowerCase()) || o.key.length === prefix.length) {
    rep.add(subj, 0, 'LNG_KEY_PREFIX', `key "${o.key}" must start with "${prefix}" for this file (key = file title/nested names; '#' files have no title, LOC-10)`);
    return { fail: 1, rep };
  }
  const segs = o.key.slice(prefix.length).split('/');
  if (segs.some(s => !s || /["{}]/.test(s))) { rep.add(subj, 0, 'LNG_KEY_PREFIX', `bad key segment in "${o.key}" (empty or has quote/brace)`); return { fail: 1, rep }; }

  // locate
  let top = rt.kids.find(k => (k.name || '').toLowerCase() === 'tags');
  if (!top) { rep.add(subj, 1, 'LNG_NO_TAGS', 'file has no {tags block; not touched'); return { fail: 1, rep }; }
  let cur = top, depth = 0, leaf = null;
  while (depth < segs.length) {
    const hits = cur.kids.filter(k => (k.name || '').toLowerCase() === segs[depth].toLowerCase());
    // prefer a hit that can continue the path; for the last segment later definition wins
    if (depth === segs.length - 1) { leaf = hits.filter(h => !h.kids.length && h.vals.length).pop() || null; if (!leaf && hits.some(h => h.kids.length)) { rep.add(subj, hits[0].line, 'LNG_KEY_IS_BLOCK', `"${o.key}" is a block with children, not a text`); return { fail: 1, rep }; } break; }
    const nxt = hits.filter(h => h.kids.length || !h.vals.length).pop();
    if (!nxt) break;
    cur = nxt; depth++;
  }
  if (leaf) {
    if (!o.force) { rep.add(subj, leaf.line, 'LNG_KEY_EXISTS', `"${o.key}" already defined (LOC-04: later wins, would log redefinition); use --force to replace`); return { fail: 1, rep }; }
  } else if (depth === segs.length - 1 && cur.kids.some(k => (k.name || '').toLowerCase() === segs[depth].toLowerCase() && (k.kids.length === 0 && k.vals.length))) {
    // unreachable (leaf would be set); guard
  }

  let out;
  const entry = `{"${segs[segs.length - 1]}" "${esc(text)}"}`;
  if (leaf) { // replace value tokens: from first token to just before the leaf's close brace (trailing space kept)
    const a = off(leaf.vals[0].line, leaf.vals[0].col), cl = leaf.close ? off(leaf.close.line, leaf.close.col) : src.length;
    const ws = src.slice(a, cl).match(/\s*$/)[0];
    out = src.slice(0, a) + `"${esc(text)}"` + ws + src.slice(cl);
  } else {
    // wrap remaining segments (cur has path segs[0..depth-1]); new chain {seg {seg ... {leaf "t"}}}
    let chain = entry;
    for (let i = segs.length - 2; i >= depth; i--) chain = `{"${segs[i]}" ${chain}}`;
    if (!cur.close) { rep.add(subj, cur.line, 'LNG_BRACES', 'block never closed; not touched'); return { fail: 1, rep }; }
    const cp_ = off(cur.close.line, cur.close.col);
    const lineStart = starts[cur.close.line - 1], before = src.slice(lineStart, cp_);
    if (/^[ \t]*$/.test(before)) { // close brace alone on its line: new line before it, indent = child indent
      const kid = cur.kids.length ? cur.kids[cur.kids.length - 1] : null;
      let ind = kid ? (lines[kid.line - 1].match(/^[ \t]*/)[0]) : before + '\t';
      out = src.slice(0, lineStart) + ind + chain + eol + src.slice(lineStart);
    } else {
      out = src.slice(0, cp_) + chain + src.slice(cp_);
    }
  }

  // vanilla checks
  const game = G.game;
  const vrel = o.file.replace(/\\/g, '/').toLowerCase();
  const van = goh ? null : vanillaKeys(game, G.exe);
  if (goh) vanillaGoh(rep, subj, G, code, vrel, o.key, !buf);
  else if (!van) rep.info(subj, 0, 'NO_VANILLA', `no localization.pak under ${game}; vanilla checks skipped`);
  else {
    if (!buf && van.files.has(vrel)) rep.add(subj, 0, 'LNG_FILE_REPLACES_VANILLA', `new file has the vanilla path ${o.file}: replaces vanilla file whole, all its other keys show raw (LOC-01); use a '#' file`);
    const vf = van.keys.get(o.key.toLowerCase());
    if (vf && vf.toLowerCase() !== vrel) rep.add(subj, 0, 'WARN_LNG_KEY_SHADOWS_VANILLA', `key also defined in vanilla ${vf}: that file still loads after this one and vanilla wins (LOC-19 [V]); to change the text, copy the whole vanilla ${vf} into the mod's localization/ (it then replaces vanilla) and edit the key there: lng-add --file ${vf} --force, or patch-entity on the copy`);
    else if (vf) rep.info(subj, 0, 'REPLACES_VANILLA_KEY', `key exists in vanilla ${vf}, which this mod file replaces whole (LOC-01)`);
  }

  // lint old vs new (temp copies at the same relative path): report only new findings
  const lintRel = goh ? 'localization/' + o.file.replace(/\\/g, '/').replace(/^\/+/, '') : rel;   // lnglint reads localization/: same .lng form on GoH (GHLOC-09)
  const lt = side => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lngadd-')), f = path.join(d, lintRel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, side);
    const r = lint(d); fs.rmSync(d, { recursive: true, force: true }); return r;
  };
  const newBuf = Buffer.from((bom ? '\ufeff' : '') + out, 'utf8');
  const oldF = buf ? lt(buf) : [];
  const pool = oldF.map(f => f.code + '|' + f.msg);
  for (const f of lt(newBuf)) {
    const i = pool.indexOf(f.code + '|' + f.msg);
    if (i >= 0) pool.splice(i, 1); else rep.add(subj, f.line, 'LNG_LINT_' + f.code, f.msg);
  }
  return { rep, abs, newBuf, replaced: !!leaf, rel };
}

// GoH vanilla checks (GHLOC-08 [I] for the order between files): vrel = file path under interface/text/, lower case
const kindRank = f => (/\.pot$/i.test(f) ? 0 : /\.po$/i.test(f) ? 1 : 2);   // fallback .pot then .lng; primary .mo .po .lng
function vanillaGoh(rep, subj, G, code, vrel, key, isNew) {
  const van = vanillaKeysGoh(G.game, code);
  if (!van) { rep.info(subj, 0, 'NO_VANILLA', `no localizations/ under ${G.game}; vanilla checks skipped`); return; }
  if (isNew && van.files.has(vrel)) rep.add(subj, 0, 'LNG_FILE_REPLACES_VANILLA', `new file has the vanilla path ${vrel}: the mod's file replaces that vanilla file whole and its other keys show raw (GHVFS-04, inside localizations/ the last mod wins [I]); use a file name of your own`);
  const vf = van.keys.get(key.toLowerCase());   // .lng and gettext keys share one table (GHLOC-01)
  if (!vf) return;
  if (vf.toLowerCase() === vrel) { rep.info(subj, 0, 'REPLACES_VANILLA_KEY', `key exists in vanilla ${vf}, which this mod file replaces whole`); return; }
  const modLater = kindRank(vrel) !== kindRank(vf) ? kindRank(vrel) > kindRank(vf) : vrel > vf.toLowerCase();
  if (modLater) rep.info(subj, 0, 'OVERRIDES_VANILLA_KEY', `key also in vanilla ${vf}; this file is read after it, so its text is kept (GHLOC-08 [I])`);
  else rep.add(subj, 0, 'WARN_LNG_KEY_SHADOWS_VANILLA', `key also defined in vanilla ${vf}, which Gates of Hell reads after this file, so vanilla's text is kept (later file wins: .pot before .lng, then sorted names, GHLOC-08 [I]); use a file whose name sorts after ${path.posix.basename(vf)}, or copy the whole vanilla ${vf} into the mod and edit the key there (--file ${vf} --force)`);
}

// GoH gettext file (.pot for default/en, .po otherwise): one msgctxt entry
function runPo(o, rep, a) {
  const kind = /\.pot$/i.test(a.abs) ? 'pot' : 'po';
  const why = potKindOk(a.abs, a.code);
  if (why) { rep.add(a.subj, 0, 'LNG_PO_KIND', why); return { fail: 1, rep }; }
  if (!o.key || /["\r\n]/.test(o.key)) { rep.add(a.subj, 0, 'LNG_KEY_PREFIX', `bad key "${o.key}" (empty, or has a quote or line break)`); return { fail: 1, rep }; }
  let buf = null, bom = false;
  if (fs.existsSync(a.abs)) {
    buf = fs.readFileSync(a.abs);
    const r = readText(buf, 'utf8');
    if (r.fatal || r.badLines.length) { rep.add(a.subj, r.badLines[0] || 1, 'LNG_ENC', r.fatal || 'file is not valid UTF-8; not touched'); return { fail: 1, rep }; }
    bom = buf[0] === 0xEF;
  }
  let src = buf ? buf.toString('utf8') : null;
  if (src && src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const eol = src && /\r\n/.test(src) ? '\r\n' : src && /\n/.test(src) ? '\n' : '\r\n';
  if (src === null) src = potHeader(path.basename(a.abs, path.extname(a.abs)), eol);
  const e = editPo(src, o.key, a.text, kind, o.force, eol);
  if (e.code) { rep.add(a.subj, e.line, e.code, e.msg); return { fail: 1, rep }; }
  if (!a.text) rep.add(a.subj, 0, 'WARN_TEXT_EMPTY', 'empty text: the game shows an empty string');
  vanillaGoh(rep, a.subj, a.G, a.code, o.file.replace(/\\/g, '/').toLowerCase(), o.key, !buf);
  // read back: the key must be found once, with the text
  const back = parsePo(e.out).entries.filter(x => x.ctx !== null && x.ctx.toLowerCase() === o.key.toLowerCase());
  if (back.length !== 1 || (kind === 'pot' ? back[0].id : back[0].str) !== esc(a.text) || back[0].fuzzy) { rep.add(a.subj, 0, 'LNG_PO_READBACK', 'entry not read back as written; not touched'); return { fail: 1, rep }; }
  return { rep, abs: a.abs, newBuf: Buffer.from((bom ? '﻿' : '') + e.out, 'utf8'), replaced: e.replaced, rel: a.rel };
}

function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => argv[++i];
    if (a === '--file') o.file = nx(); else if (a === '--key') o.key = nx(); else if (a === '--text') o.text = nx();
    else if (a === '--lang') o.lang = nx(); else if (a === '--game') o.game = nx(); else if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dry = true; else if (a === '-q') o.q = true;
    else if (a === '--exe') { const g = games.get(nx()); if (!g) { console.error('--exe must be as64, mowas_2 (mowas2) or goh'); process.exit(2); } o.exe = g.exe; }
    else if (a === '--loc') o.loc = nx();
    else if (a.startsWith('-')) { console.error('unknown arg ' + a); process.exit(2); } else o.dir = a;
  }
  if (!o.dir || !o.file || !o.key || o.text === undefined) { console.error('usage: node tools/lng-add/lng-add.js <mod dir> --file <rel .lng|.pot|.po> --key <full key> --text "<t>" [--lang all] [--game G] [--exe as64|mowas_2|goh] [--loc code] [--force] [--dry-run] [-q]'); process.exit(2); }
  if (o.exe === 'goh' && !o.game && !games.install('goh').dir) { console.error('no Gates of Hell install found: pass --game <GoH folder>'); process.exit(2); }
  if (!fs.existsSync(o.dir) || !fs.statSync(o.dir).isDirectory()) { console.error('not a directory: ' + o.dir); process.exit(2); }
  {   // no write into a Gates of Hell install (writeguard, brief settled point); AS2 runs keep their old checks
    const wg = require('../lib/writeguard'), g = gameOf(o), hit = wg.detectInstall(o.dir);
    if (g.exe === 'goh' || (hit && hit.kind === 'goh')) { const why = wg.refuseWrite(o.dir, { game: g.game, purpose: 'add a text key' }); if (why) { console.error('lng-add: ' + why); process.exit(2); } }
  }
  const r = run(o);
  if (o.lang && o.lang !== 'all') r.rep.info(o.file, 0, 'LANG_NOOP', 'engine has one lng set (LOC-17); --lang ignored');
  if (!r.fail) {
    if (o.dry) console.log(`would ${r.replaced ? 'replace' : 'add'} ${o.key} in ${r.rel}`);
    else { fs.mkdirSync(path.dirname(r.abs), { recursive: true }); fs.writeFileSync(r.abs, r.newBuf); console.log(`${r.replaced ? 'replaced' : 'added'} ${o.key} in ${r.rel}`); }
  }
  r.rep.print({ showInfo: !o.q });
  process.exit(r.fail ? 1 : 0);
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { run, esc, unesc, parsePo, editPo };
