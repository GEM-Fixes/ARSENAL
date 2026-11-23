// recipe "texts and translation": write or change text lines (.lng), add the lines the game looks for and does not find (loccover),
// or bring a translated table back (lng extract and merge). Lines are gen text ops: the core's gen run ends with gen's text finish
// (lng-add per key: byte preserving, UTF-8, the {tags} root, CRLF for a new file, lnglint on the new lines; a key the game already
// has goes into a mod copy of that game file, LOC-19). The Check step runs recipe.check: lnglint and loccover over the mod.
// Branch target: a parent passes the keys it needs (picker.pass or recipe.pass: {keys: [{key, text}] | ['key']}); values() preselects
// them and the parent gets {file, keys} back as result. Contract: ../README.md. Own routes under /api/x/task/r/text/ (GET only).
// Author: Imperator_Aug (ARSENAL, ia-79b0cfbe)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const TOOLS = path.resolve(__dirname, '..', '..', '..', '..');

const FAMILY = {
  name: 'desc/entity/', squad: 'desc/squad/', soldier: 'desc/human/mp/', weapon: 'desc/weapon/', info: 'info/entity/',
  armour: 'info/armor_angle/', part: 'component/', map: 'mission/multi/', unitlist: 'units/', ui: '', other: '',
};
const ROOTS = /^(desc|info|component|mission|units|mp|actionbar|options|interface|menu|dlg|tips)\//i;
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'gen';
const fileOf = mod => '#' + slug(path.basename(String(mod || ''))) + '.lng';
const FILE_RE = '^([A-Za-z0-9_#+.-]+/)*[A-Za-z0-9_#+.-]+\\.lng$';
const LINE_RE = '^[^=]*[^=\\s][^=]*=.*\\S';
const esc = t => String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t');
const unesc = t => String(t).replace(/\\(.)/g, (m, ch) => ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === '\\' ? '\\' : ch === '"' ? '"' : m);
const PARAM = /%[-+ 0#]*\d*(?:\.\d+)?[sdfiuxXc]|\{\d+\}/g;
const params = s => (String(s).match(PARAM) || []).sort().join(' ');

// ---------- the text sets: lowercase key -> {key, text (decoded), file (rel under localization/)}
function keysOfLng(buf, rel) {
  const out = [];
  try { for (const [k, t] of require(path.join(TOOLS, 'upgrade', 'lib', 'lngpot')).lngKeys(buf, rel)) out.push({ key: k, text: t, file: rel }); } catch (e) { /* unreadable: no keys */ }
  return out;
}
const VAN = new Map();
function vanilla(game) {
  if (!game) return new Map();
  const f = path.join(game, 'localization.pak');
  let st = null; try { st = fs.statSync(f); } catch (e) { return new Map(); }
  const id = f + '|' + st.mtimeMs, hit = VAN.get(game);
  if (hit && hit.id === id) return hit.map;
  const pak = require(path.join(TOOLS, 'lib', 'pak')), map = new Map();
  const ents = pak.list(f);
  for (const e of ents) {
    if (!/\.lng$/i.test(e.name)) continue;
    let b; try { b = pak.read(ents, e); } catch (x) { continue; }
    for (const r of keysOfLng(b, e.name.replace(/\\/g, '/'))) map.set(r.key.toLowerCase(), r);
  }
  VAN.set(game, { id, map });
  return map;
}
function walk(dir, rel, out) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    if (e.isDirectory()) walk(path.join(dir, e.name), rel + e.name + '/', out);
    else if (/\.lng$/i.test(e.name)) out.push(rel + e.name);
  }
  return out;
}
function modTexts(mod) {
  const map = new Map(), root = path.join(String(mod || ''), 'localization');
  for (const rel of walk(root, '', [])) { let b; try { b = fs.readFileSync(path.join(root, rel)); } catch (e) { continue; } for (const r of keysOfLng(b, rel)) map.set(r.key.toLowerCase(), Object.assign(r, { mod: true })); }
  return map;
}
function current(game, mod) { const m = new Map(vanilla(game)); for (const [k, r] of modTexts(mod)) m.set(k, r); return m; }

// ---------- the two whole-mod tools (loccover, lnglint) as child processes (PERF A1): with ctx.runTool the tool runs beside the
// server (the one server thread stays free; the child belongs to the request's job, so the footer's Cancel kills it) and prints its
// report as JSON into a temp file. -> {j: the report (null when the tool gave none), r: the runTool answer} | {stopped: true}.
// The report is what rep.toJSON gives in process: no .lintrc is read (--no-rc), as the call in process reads none
let SEQ = 0;
const hasTool = ctx => !!(ctx && typeof ctx.runTool === 'function');
async function toolJson(ctx, tool, args) {
  const out = path.join(ctx.tmpRoot || require('os').tmpdir(), 'task', 'text-' + process.pid + '-' + Date.now().toString(36) + '-' + (++SEQ) + '.json');
  await fs.promises.mkdir(path.dirname(out), { recursive: true });
  const r = await ctx.runTool(tool, tool + '/' + tool + '.js', args.concat(['--format', 'json', '--no-rc', '-o', out]), { timeoutMs: 1800000 });
  let j = null; try { j = JSON.parse(await fs.promises.readFile(out, 'utf8')); } catch (e) { j = null; } finally { try { await fs.promises.rm(out, { force: true }); } catch (e) { /* temp */ } }
  if ((r && r.cancelled) || (ctx.job && ctx.job.cancelled)) return { stopped: true };   // JOBS: the footer's Cancel killed the tool
  return { j, r: r || {} };
}
// lnglint over the mod's text files -> the report as JSON ({findings, info, ...}) | {stopped: true}; throws what lnglint threw
async function lintJson(ctx, mod) {
  if (!hasTool(ctx)) return require(path.join(TOOLS, 'lnglint', 'lnglint')).run({ folder: mod }).toJSON({ tool: 'lnglint' });
  const t = await toolJson(ctx, 'lnglint', [mod, '--no-game']);
  if (t.stopped) return t;
  if (!t.j) throw new Error(String(t.r.stderr || t.r.stdout || '').trim().split(/\r?\n/).slice(-1)[0].replace(/^error: /, '') || 'lnglint gave no report');
  return t.j;
}

// ---------- lines the game looks for and does not find (loccover; a child process when the caller has ctx.runTool, else in process)
// -> rows; rows.stopped = true (and no rows) when the footer's Cancel killed the tool
const MISS = new Map();
async function missing(game, mod, exe, ctx) {
  if (!mod || !fs.existsSync(mod)) return [];
  const id = [game, mod, exe].join('|'), hit = MISS.get(id);
  if (hit && Date.now() - hit.at < 30000) return hit.rows;
  let j;
  if (hasTool(ctx)) {
    const t = await toolJson(ctx, 'loccover', [mod].concat(game ? ['--game', game] : [], exe ? ['--exe', exe] : [], ['-q']));
    if (t.stopped) return Object.assign([], { stopped: true });
    if (!t.j) return [];
    j = t.j;
  } else {
    let rep; try { rep = require(path.join(TOOLS, 'loccover', 'loccover')).check({ folder: mod, gameDir: game || undefined, exe: exe || undefined }).rep; } catch (e) { return []; }
    j = rep.toJSON({ tool: 'loccover' });
  }
  const rows = [], seen = new Set();
  for (const f of j.findings || []) {
    let key = null, m;
    if (f.code === 'LOC_NAME_MISSING' && (m = /no (desc\/human\/\S+?) ->/.exec(f.msg))) key = m[1];
    else if (f.code === 'LOC_NAME_MISSING' && (m = /card "([^"]+)": no desc\/entity\//.exec(f.msg))) key = (/\(.+\)$/.test(m[1]) ? 'desc/squad/' : 'desc/entity/') + m[1];
    else if (f.code === 'LOC_INFO_MISSING' && (m = /none of (\S+)/.exec(f.msg))) key = m[1];
    else if (f.code === 'LOC_HOW_SIDEKEY' && (m = /need (desc\/squad\/\S+?) \(/.exec(f.msg))) key = m[1].replace(/;$/, '');
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    rows.push({ key, code: f.code, file: f.file, line: f.line, msg: f.msg, text: key.split('/').pop().replace(/\(.+\)$/, '') });
  }
  MISS.set(id, { at: Date.now(), rows });
  return rows;
}

// "key = text" lines -> [{key, text (as typed, escapes kept)}]; a bare key gets the family's start. A key with a slash, or one the game
// or the mod already has (known: lowercase keys), is a whole key and is used as it is, so a found line never gets a second start
function parseLines(list, family, known) {
  const pre = FAMILY[family] || '', out = [];
  for (const raw of [].concat(list || [])) {
    if (raw && typeof raw === 'object') { if (raw.key) out.push({ key: String(raw.key).trim(), text: raw.text == null ? '' : esc(raw.text) }); continue; }
    const s = String(raw || ''), i = s.indexOf('=');
    if (i < 0) continue;
    let key = s.slice(0, i).trim(); const text = s.slice(i + 1).trim();
    if (!key) continue;
    if (pre && !ROOTS.test(key) && !key.includes('/') && !(known && known.has(key.toLowerCase()))) key = pre + key;
    out.push({ key, text });
  }
  return out;
}

// lines -> the gen text items (gen's text finish writes them: lng-add per key, UTF-8, the {tags} root, CRLF for a new file, a key the
// game already has into a mod copy of that game file, LOC-19) and notes for the lines left out
function textItems(o) {
  const van = vanilla(o.game), mine = modTexts(o.mod), notes = [], items = [], keys = {};
  const sizeOf = f => { let n = 0; for (const r of van.values()) if (r.file === f) n++; return n; };
  for (const ln of o.lines) {
    const lk = ln.key.toLowerCase(), cur = mine.get(lk) || van.get(lk), text = unesc(ln.text);
    if (cur && cur.text === text) continue;                                             // unchanged: nothing to write
    if (cur && params(cur.text) !== params(text)) notes.push('text ' + ln.key + ': the % numbers differ from the game text (' + (params(cur.text) || 'none') + ' now, ' + (params(text) || 'none') + ' new); the game fills them in order (LOC-28)');
    let file = o.file;
    if (mine.has(lk)) {                                                                  // the key already lives in a mod file: change it there
      if (!o.force) { notes.push('text ' + ln.key + ' skipped: it is already in ' + mine.get(lk).file + ' and "replace a line" is off'); continue; }
      file = mine.get(lk).file;
    } else if (van.has(lk)) {
      if (!o.replace) { notes.push('text ' + ln.key + ' skipped: the game has this key in ' + van.get(lk).file + ' and a line in your own file would lose to it (LOC-19)'); continue; }
      file = '';                                                                         // gen's finish puts it into a mod copy of the game file
      notes.push('text: ' + ln.key + ' is a game key; your mod gets a whole copy of ' + van.get(lk).file + ' (' + sizeOf(van.get(lk).file) + ' lines) with the line changed: it replaces the game file, so a game update to that file will not show while your mod is on (LOC-01)');
    }
    items.push(file ? { key: ln.key, text, file } : { key: ln.key, text });
    keys[ln.key] = text;
  }
  return { items, notes, keys };
}

// ---------- a translated table as the programs save it -> the table lng merge reads (UTF-8, Tab, the header first), with a plain
// message per problem. Taken: UTF-8 (with or without BOM), UTF-16 (Excel "Unicode Text", with or without BOM); Tab, comma or semicolon
// between columns (Excel CSV UTF-8, LibreOffice Text CSV); cells in quotes ("" inside); rows above the header (Excel's Column1 row).
// Refused, each with what to do: an old character set (ANSI: not UTF-8, letters lost), no header, formula results, letters turned
// into question marks, no translated row; rows whose source no longer matches the mod are refused after a dry lng merge (checkTable)
const HEAD = ['file', 'key', 'source', 'translation'];
function decodeTable(buf) {
  let b = Buffer.from(buf || []);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  else if (b[0] === 0xff && b[1] === 0xfe) return { text: b.subarray(2).toString('utf16le'), enc: 'UTF-16' };
  else if (b[0] === 0xfe && b[1] === 0xff) { const s = Buffer.from(b.subarray(2)); s.swap16 && s.length % 2 === 0 && s.swap16(); return { text: s.toString('utf16le'), enc: 'UTF-16' }; }
  else {
    let ev = 0, od = 0; const n = Math.min(b.length, 4096);
    for (let i = 0; i < n; i++) if (b[i] === 0) { if (i % 2) od++; else ev++; }
    if (n > 8 && od > n / 4) return { text: b.subarray(0, b.length - (b.length % 2)).toString('utf16le'), enc: 'UTF-16' };
    if (n > 8 && ev > n / 4) { const s = Buffer.from(b.subarray(0, b.length - (b.length % 2))); s.swap16(); return { text: s.toString('utf16le'), enc: 'UTF-16' }; }
  }
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), enc: 'UTF-8' }; } catch (e) { return { error: 'ansi' }; }
}
// one record per row; a cell in quotes may hold the delimiter, a line break and "" for a quote; a quote not closing a cell is text
function splitTable(text, d) {
  const recs = []; let rec = [], i = 0; const n = text.length;
  const endCell = k => k >= n || text[k] === d || text[k] === '\n' || text[k] === '\r';
  while (i <= n) {
    let cell = '';
    if (text[i] === '"') {
      let j = i + 1, s = '', closed = false;
      while (j < n) { if (text[j] === '"') { if (text[j + 1] === '"') { s += '"'; j += 2; continue; } closed = true; break; } s += text[j++]; }
      if (closed && endCell(j + 1)) { cell = s; i = j + 1; } else { while (!endCell(i)) cell += text[i++]; }
    } else { while (!endCell(i)) cell += text[i++]; }
    rec.push(cell);
    if (i >= n) { recs.push(rec); break; }
    if (text[i] === d) { i++; continue; }
    if (text[i] === '\r' && text[i + 1] === '\n') i++;
    i++; recs.push(rec); rec = [];
  }
  return recs;
}
const FORMULA = /^#(NAME\?|VALUE!|REF!|N\/A|DIV\/0!|NUM!|NULL!)$/;
// a problem with the table: {code, ...words}; the words are said by the lang row task.text.e.<code> (en here, every language on the page)
const LANG = require('./text.lang');
function say(p) {
  const r = LANG.find(x => x[0] === 'task.text.e.' + p.code);
  return String(r ? r[1] : p.code).replace(/\{(\w+)\}/g, (m, n) => (p[n] != null ? String(p[n]) : m));
}
function readTable(buf) {
  const probs = [], dec = decodeTable(buf);
  if (dec.error) return { probs: [{ code: 'ansi' }], rows: [] };
  const text = dec.text.replace(/^﻿/, '');
  let recs = null, at = -1;
  for (const d of ['\t', ',', ';']) {
    const r = splitTable(text, d), h = r.slice(0, 5).findIndex(x => HEAD.every((k, i) => String(x[i] || '').trim().toLowerCase() === k));
    if (h >= 0) { recs = r; at = h; break; }
  }
  if (!recs) return { probs: [{ code: 'head' }], rows: [], enc: dec.enc };
  const rows = [], cell = s => String(s == null ? '' : s).replace(/\r\n|\r|\n/g, '\\n').replace(/\t/g, '\\t');
  for (let k = at + 1; k < recs.length; k++) {
    const c = recs[k], row = k + 1;
    if (!c.some(x => String(x).trim() !== '')) continue;
    if (c.length < 4) { probs.push({ code: 'cols', row, n: c.length }); continue; }
    const r = { row, file: cell(c[0]), key: cell(c[1]), src: cell(c[2]), tr: cell(c[3]), ctx: cell(c[4]) };
    const f = [r.file, r.key, r.src, r.tr].find(x => FORMULA.test(x.trim()));
    if (f) probs.push({ code: 'formula', row, key: r.key, v: f.trim() });
    else if (r.tr && /\?{2,}/.test(r.tr) && !/\?{2,}/.test(r.src)) probs.push({ code: 'qmarks', row, key: r.key });
    rows.push(r);
  }
  const tsv = ['file\tkey\tsource\ttranslation\tcontext'].concat(rows.map(r => [r.file, r.key, r.src, r.tr, r.ctx].join('\t'))).join('\n') + '\n';
  if (!rows.some(r => r.tr.trim() !== '')) probs.push({ code: 'empty' });
  return { probs, rows, tsv, enc: dec.enc };
}
// the whole check: read the table, then a dry lng merge over the mod (translated rows whose source is not what the mod has now, rows of a
// key or file the mod does not have). ok only with no problem; the normalized table is written to <dir>/table-checked.tsv for the merge.
// -> {ok, probs:[{code,...}], errors (en, one per problem), rows, translated, enc, file}
// lng runs as a child process either way. checkTable / mergeTable: spawnSync, for a caller with no ctx.runTool (the sync entry).
// checkTableAsync / mergeTableAsync(o, ctx): the same steps and the same answer with the child started through ctx.runTool, so the
// server thread stays free and the child belongs to the request's job (the footer's Cancel kills it: {stopped: true})
const lngSync = args => { const r = cp.spawnSync(process.execPath, [path.join(TOOLS, 'lng', 'lng.js')].concat(args), { encoding: 'utf8', timeout: 120000, windowsHide: true, env: Object.assign({}, process.env, { AS2_NO_STEAM: '1' }) }); return { status: r.status, text: String(r.stdout || '') + String(r.stderr || '') }; };
async function lngTool(ctx, args) {
  const r = (await ctx.runTool('lng', 'lng/lng.js', args, { timeoutMs: 120000 })) || {};
  return { status: r.code, text: String(r.stdout || '') + String(r.stderr || ''), stopped: !!(r.cancelled || (ctx.job && ctx.job.cancelled)) };
}
function checkPre(o) {
  const t = readTable(o.buf), out = { ok: false, probs: t.probs.slice(), rows: t.rows.length, translated: t.rows.filter(r => r.tr.trim() !== '').length, file: null, enc: t.enc || null };
  const st = { t, out, dry: null, args: null };
  if (t.tsv && !out.probs.some(p => p.code === 'empty')) {
    fs.mkdirSync(o.dir, { recursive: true });
    const file = path.join(o.dir, 'table-checked.tsv'); fs.writeFileSync(file, t.tsv, 'utf8'); out.file = file;
    st.dry = path.join(o.dir, 'dry-' + Date.now().toString(36));
    st.args = ['merge', o.mod, file, '--out', st.dry, '--dry-run'];
  }
  return st;
}
function checkPost(st, r) {
  const t = st.t, out = st.out;
  if (st.args) {
    try { fs.rmSync(st.dry, { recursive: true, force: true }); } catch (e) { /* temp */ }
    const said = r.text, stale = [], unknown = [];
    for (const l of said.split(/\r?\n/)) {
      const m = /:(\d+): (LNG_ROW_STALE|LNG_ROW_UNKNOWN|LNG_BAD_TSV)\b/.exec(l);
      if (!m) continue;
      if (m[2] === 'LNG_BAD_TSV') { out.probs.push({ code: 'unread', w: l.replace(/^.*?: LNG_BAD_TSV /, '').trim() }); continue; }
      const row = t.rows[Number(m[1]) - 2];
      if (!row || row.tr.trim() === '') continue;                                    // an untranslated row changes nothing
      (m[2] === 'LNG_ROW_STALE' ? stale : unknown).push(row);
    }
    const some = a => a.slice(0, 5).map(x => x.row + ' (' + x.key + ')').join(', ') + (a.length > 5 ? ', ...' : '');
    if (stale.length) out.probs.push({ code: 'stale', n: stale.length, list: some(stale) });
    if (unknown.length) out.probs.push({ code: 'unknown', n: unknown.length, list: some(unknown) });
    if (r.status !== 0 && !said.trim()) out.probs.push({ code: 'stopped' });
  }
  out.errors = out.probs.map(say);
  out.ok = !out.probs.length;
  return out;
}
function checkTable(o) { const st = checkPre(o); return checkPost(st, st.args ? lngSync(st.args) : null); }
async function checkTableAsync(o, ctx) {
  if (!hasTool(ctx)) return checkTable(o);
  const st = checkPre(o), r = st.args ? await lngTool(ctx, st.args) : null;
  if (r && r.stopped) { try { fs.rmSync(st.dry, { recursive: true, force: true }); } catch (e) { /* temp */ } return { stopped: true }; }
  return checkPost(st, r);
}

// picker.check at upload (README Changes 50): a table that cannot be read at all (old character set, no header row, no translation) is
// refused by the core upload in the page's language; the rows (formula results, lost letters, sources that differ from the mod) are
// checked right after by the page through GET r/text/table, which knows the mod, and listed one by one
function tableUpload(f) {
  const p = readTable(f && f.bytes).probs.find(x => ['ansi', 'head', 'empty'].includes(x.code));
  return p ? { key: 'task.text.e.' + p.code, params: p, why: say(p) } : null;
}

// a translated table (lng merge) -> the changed .lng files, at the same place in the mod
function mergePre(o) {
  const outDir = path.join(o.staging, 'm-' + Date.now().toString(36));
  const args = ['merge', o.mod, o.tsv, '--out', outDir];
  if (o.all) args.push('--all');
  return { outDir, args };
}
function mergePost(st, r) {
  const outDir = st.outDir, text = r.text;
  const errs = text.split(/\r?\n/).filter(l => /\b(LNG_BAD_TSV|LNG_OUT_IS_SOURCE|LNG_ENC)\b/.test(l));
  if (r.status !== 0 && !fs.existsSync(outDir) || errs.length) { try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) { /* temp */ } throw bad('The table could not be merged: ' + (errs.join(' ') || text.trim().split(/\r?\n/).slice(-2).join(' ')) + '. Nothing was written.'); }
  const notes = text.split(/\r?\n/).filter(l => /WARN_LNG_|LNG_ROW_|LNG_UNTRANSLATED/.test(l) && !/WARN_LNG_NO_MODINFO/.test(l)).slice(0, 20).map(l => 'table: ' + l.trim());
  const files = [];
  (function rd(d, rel) {
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) { if (e.isDirectory()) rd(path.join(d, e.name), rel + e.name + '/'); else files.push({ rel: rel + e.name, buf: fs.readFileSync(path.join(d, e.name)) }); }
  })(outDir, '');
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) { /* temp */ }
  return { files, notes };
}
function mergeTable(o) { const st = mergePre(o); return mergePost(st, lngSync(st.args)); }
async function mergeTableAsync(o, ctx) {
  if (!hasTool(ctx)) return mergeTable(o);
  const st = mergePre(o), r = await lngTool(ctx, st.args);
  if (r.stopped) { try { fs.rmSync(st.outDir, { recursive: true, force: true }); } catch (e) { /* temp */ } return { stopped: true }; }
  return mergePost(st, r);
}

// ---------- own routes (/api/x/task/r/text/...)
function modParam(ctx, m) {
  const mod = String(m || '');
  if (!mod || !path.isAbsolute(mod)) throw bad('Pick your mod first.');
  if (ctx && ctx.pathOk && !ctx.pathOk(path.resolve(mod))) throw Object.assign(bad('view only on this device', 403), { key: 'rmt.viewOnly' });
  if (!fs.existsSync(mod)) throw bad('The mod folder is not there: ' + mod, 404);
  return path.resolve(mod);
}
const qp = (u, k) => (u && u.searchParams ? u.searchParams.get(k) || '' : '');
const gameOf = ctx => { try { return (ctx.game && ctx.game()) || null; } catch (e) { return null; } };
const exeOf = g => (g === 'mowas2' ? 'mowas_2' : g === 'as64' ? 'as64' : '');
// the GoH branch (text.goh.js) and the game a task works for: the draft's game or a word given, else the request's, else as64
const GH = () => require('./text.goh');
const AS2 = ['as64', 'mowas2'];
function gidOf(ctx, d) {
  let x = d && (typeof d === 'string' ? d : d.game);
  if (!x && ctx) { try { x = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch (e) { x = null; } }
  return require('../../../../lib/games').idOf(x) || 'as64';
}
const gohDirOf = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } };
// a route's game: ?game=, else the request's (ctx.task, ctx.gameId(): the page's game sent with every request, gui.js); '' = none
const gameQ = (u, ctx) => { const g = qp(u, 'game'); if (g) return g; if (ctx && ctx.task && ctx.task.id) return ctx.task.id; try { return (ctx && typeof ctx.gameId === 'function' ? ctx.gameId() : ctx && ctx.gameId) || ''; } catch (e) { return ''; } };
// the route's exe: an explicit ?game= as before; a game only implied by the request (ctx) gives an exe only when it is not as64, so the
// AS64 tab keeps loccover's no-exe path (shared vanilla index and cache tag)
const exeQ = (u, ctx) => { const g = gameQ(u, ctx); return qp(u, 'game') ? exeOf(g) : (g && g !== 'as64' ? exeOf(g) : ''); };
const routes = {
  // lines the game looks for in this mod and does not find
  'GET /api/x/task/r/text/missing': async (u, b, ctx) => {
    const mod = modParam(ctx, qp(u, 'mod')), rows = await missing(gameOf(ctx), mod, exeQ(u, ctx), ctx);
    return rows.stopped ? { stopped: true } : { mod, rows };
  },
  // lnglint over the mod's text files
  'GET /api/x/task/r/text/lint': async (u, b, ctx) => {
    const mod = modParam(ctx, qp(u, 'mod')), j = await lintJson(ctx, mod);
    if (j.stopped) return { stopped: true };
    return { mod, findings: (j.findings || []).slice(0, 500), info: (j.info || []).length };
  },
  // the translation table (lng extract): {tsv, rows}
  'GET /api/x/task/r/text/extract': async (u, b, ctx) => {
    const mod = modParam(ctx, qp(u, 'mod')), out = path.join(ctx.tmpRoot || require('os').tmpdir(), 'task', 'text-' + process.pid + '-' + Date.now().toString(36) + '.tsv');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const r = await ctx.runTool('lng', 'lng/lng.js', ['extract', mod, '--out', out, '-q'], { timeoutMs: 120000 });
    let tsv = ''; try { tsv = fs.readFileSync(out, 'utf8'); } catch (e) { tsv = ''; } finally { try { fs.rmSync(out, { force: true }); } catch (e) { /* temp */ } }
    if (r.cancelled || (ctx.job && ctx.job.cancelled)) return { stopped: true };   // JOBS: the footer's Cancel killed the tool (the answer is 499)
    if (!tsv) throw bad('The table could not be made: ' + String(r.stderr || r.stdout || '').trim().split(/\r?\n/).slice(-2).join(' '));
    return { mod, tsv, rows: Math.max(0, tsv.split('\n').filter(Boolean).length - 1), name: slug(path.basename(mod)) + '-text.tsv' };
  },
  // the brought table checked right after the upload: {ok, errors (plain, one per problem), rows, translated, enc}
  'GET /api/x/task/r/text/table': async (u, b, ctx) => {
    const D = require('../lib/draft'), id = qp(u, 'draft'), d = D.load(ctx, id), mod = modParam(ctx, d.mod);
    const name = qp(u, 'name'); let buf;
    try { buf = fs.readFileSync(D.stagedPath(ctx, id, name)); } catch (e) { throw bad('The table is not there: bring it again.', 404); }
    const dir = path.join(ctx.tmpRoot || require('os').tmpdir(), 'task', 'tchk-' + process.pid + '-' + Date.now().toString(36));
    try { const r = await checkTableAsync({ buf, mod, dir }, ctx); delete r.file; return r; } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ } }
  },
  // lines found by words in their key, text or file (the game's and the mod's; a file name from the finder's Browse lists that file's
  // lines): [{key, text (escaped as typed), file, mod}], the first 30; total = every line that matched
  'POST /api/x/task/r/text/goh': (u, b, ctx) => GH().gohRoute(u, b, ctx),
  'GET /api/x/task/r/text/find': async (u, b, ctx) => {
    const mod = modParam(ctx, qp(u, 'mod')), ws = qp(u, 'q').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8), rows = [], cap = 30;
    if (!ws.length) return { mod, rows, more: false, total: 0 };
    if (gidOf(ctx, qp(u, 'game')) === 'goh') return Object.assign({ mod }, GH().find(gohDirOf(ctx), mod, ws));
    let total = 0;
    for (const r of current(gameOf(ctx), mod).values()) {
      const hay = (r.key + ' ' + r.text + ' ' + (r.file || '')).toLowerCase(); if (!ws.every(w => hay.includes(w))) continue;
      total++;
      if (rows.length < cap) rows.push({ key: r.key, text: esc(r.text), file: r.file, mod: !!r.mod });
    }
    return { mod, rows, more: total > rows.length, total };
  },
};

module.exports = {
  id: 'text',
  verbs: ['make', 'change'],
  // Gates of Hell (text.goh.js): lines go into a .pot of the mod through lng-add --exe goh; missing lines and translate refuse there
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 160,
  title: { make: 'task.text.tm', change: 'task.text.t' },
  test: 'task.text.test',
  census: 'text',
  groups: [
    { id: 'job', title: 'task.text.g.job', essential: true, q: [
      { id: 'what', kind: 'choice', ask: 'task.text.q.what', help: 'task.text.h.what', covers: ['check.loccover'], limits: { values: ['lines', 'missing', 'translate'], limit: 'LOC-02' } },
    ] },
    { id: 'lines', title: 'task.text.g.lines', essential: true, q: [
      { id: 'family', kind: 'choice', ask: 'task.text.q.family', help: 'task.text.h.family', covers: ['key.unit_name', 'key.squad', 'key.human', 'key.weapon', 'key.info', 'key.armor_angle', 'key.component', 'key.mission', 'key.unit_reg', 'key.ui'], limits: { values: Object.keys(FAMILY), limit: 'LOC-11' }, when: { what: 'lines' } },
      { id: 'lines', kind: 'tlines', ask: 'task.text.q.lines', help: 'task.text.h.lines', covers: ['add.key', 'add.text', 'add.items', 'fmt.tags', 'fmt.escapes', 'fmt.placeholders'], limits: { re: LINE_RE, limit: 'LOC-28' }, when: { what: ['lines', 'missing'] } },
    ] },
    { id: 'table', title: 'task.text.g.table', essential: true, q: [
      { id: 'table', kind: 'tsv', ask: 'task.text.q.table', help: 'task.text.h.table', covers: ['tr.extract_out', 'tr.merge_in'], picker: { sources: ['file'], kinds: ['text', '.tsv', '.txt', '.csv'], check: tableUpload }, when: { what: 'translate' } },
      { id: 'all', kind: 'yesno', ask: 'task.text.q.all', help: 'task.text.h.all', covers: ['tr.merge_all'], when: { what: 'translate' } },
    ] },
    { id: 'more', title: 'task.text.g.more', essential: false, q: [
      { id: 'file', kind: 'text', ask: 'task.text.q.file', help: 'task.text.h.file', covers: ['add.file', 'file.hash_name'], limits: { re: FILE_RE, limit: 'LOC-01' }, when: { what: ['lines', 'missing'], $game: AS2 } },
      { id: 'file_goh', kind: 'text', ask: 'task.text.q.file_goh', help: 'task.text.h.file_goh', covers: ['goh.pot'], limits: { re: '^[A-Za-z0-9_+.-]{1,60}\\.pot$', limit: 'GHLOC-08' }, when: { what: 'lines', $game: ['goh'] } },
      { id: 'force', kind: 'yesno', ask: 'task.text.q.force', help: 'task.text.h.force', covers: ['add.force'], limits: { limit: 'LOC-04' }, when: { what: ['lines', 'missing'], $game: AS2 } },
      { id: 'replace', kind: 'yesno', ask: 'task.text.q.replace', help: 'task.text.h.replace', covers: ['file.replace'], limits: { limit: 'LOC-19' }, when: { what: ['lines', 'missing'], $game: AS2 } },
    ] },
  ],
  kept: [
    ['add.mod', 'set by the core, not a question: the built in Mod step picks the mod; lines are written only into it'],
    ['add.dry', 'set by the core, not a question: the Review step runs the plan (gen in plan mode lists every line), the Write step writes'],
    ['add.lang', 'no tool step: the game reads one text set for every language (LOC-17); lng-add takes --lang as information only'],
    ['fmt.encoding', 'set by the tool, not a choice: always UTF-8 with the {tags} root and CRLF in a new file: lng-add keeps the bytes and refuses a file that is not UTF-8 (LOC-05)'],
    ['check.lnglint', 'set by the tool, not a choice: the gen text finish runs lnglint on every line it writes, and the Check step of this task (recipe.check) runs lnglint over the mod'],
    ['check.exe', 'set by the tool, not a choice: the game picked in the header (AS64 or MoW:AS2) is the one loccover reads'],
    ['check.lngdup', 'no tool step yet in this task: fix --only lngdup writes a separate patch mod, not the picked one (the fix task runs it); this task changes a key in the file that already has it, so it adds no duplicate, and the Check step lists duplicates lnglint finds'],
  ],
  checklist: ['task.text.c.names', 'task.text.c.info', 'task.text.c.log'],
  values: async (ctx, base, opt) => {
    if (gidOf(ctx, opt && opt.game) === 'goh') {
      const mod = ctx.mod || '', out = { what: 'lines', file_goh: GH().TEXT_FILE, family: 'name', lines: [] };
      const pass = opt && opt.pass, keys = pass && Array.isArray(pass.keys) && pass.keys.length ? pass.keys.map(k => (typeof k === 'string' ? { key: k } : k)).filter(k => k && k.key) : null;
      if (keys) {
        const cur = GH().texts(gohDirOf(ctx), mod);
        out.lines = keys.map(k => k.key + ' = ' + (k.text != null ? esc(k.text) : cur.has(String(k.key).toLowerCase()) ? cur.get(String(k.key).toLowerCase()).text : ''));
        if (pass.for) out.family = 'other';
      }
      return out;
    }
    const game = gameOf(ctx), mod = ctx.mod || '';
    const out = { what: 'lines', file: fileOf(mod), family: 'name', force: true, replace: true, all: false, lines: [] };
    const pass = opt && opt.pass, keys = pass && Array.isArray(pass.keys) && pass.keys.length ? pass.keys.map(k => (typeof k === 'string' ? { key: k } : k)).filter(k => k && k.key) : null;
    if (keys) {
      const cur = current(game, mod);
      out.lines = keys.map(k => k.key + ' = ' + (k.text != null ? esc(k.text) : cur.has(String(k.key).toLowerCase()) ? esc(cur.get(String(k.key).toLowerCase()).text) : ''));
      if (pass.for) out.family = 'other';
      return out;
    }
    const miss = await missing(game, mod, exeOf(ctx.gameId), ctx);
    if (miss.length) { out.what = 'missing'; out.lines = miss.map(r => r.key + ' = ' + r.text); }
    return out;
  },
  compile: async (draft, c) => {
    if (gidOf(null, c.game) === 'goh') return GH().compile(draft, c, { parseLines, unesc, params });
    const mod = c.mod;
    if (!mod || !path.isAbsolute(mod)) throw bad('Pick your mod first: texts are written only into the mod you picked.');
    const what = String(c.value('what') || 'lines'), notes = [], copies = [];
    if (what === 'translate') {
      const staged = [].concat(c.value('table') || []).filter(Boolean);
      if (c.kept('table') || !staged.length) return { notes: ['translation: no table brought back yet; nothing to write'], result: { file: null, keys: {} } };
      let buf; try { buf = fs.readFileSync(staged[0]); } catch (e) { throw bad('The brought table is gone: bring it again.'); }
      // the request's ctx.runTool and job (compile.js makeCctx hands them on): lng runs beside the server; a stop ends the compile
      const tctx = { runTool: c.runTool, job: c.job }, halt = () => bad('Stopped: the translated table was not read to the end. Nothing was written.');
      const chk = await checkTableAsync({ buf, mod, dir: path.join(c.staging, 'table-check') }, tctx);
      if (chk.stopped) throw halt();
      if (!chk.ok) throw bad('The translated table cannot be used yet: ' + chk.errors.join(' '));
      const m = await mergeTableAsync({ mod, tsv: chk.file, all: !!c.value('all'), staging: c.staging }, tctx);
      if (m.stopped) throw halt();
      m.files.forEach((f, i) => { const n = 'table-' + i + '.lng'; fs.mkdirSync(c.staging, { recursive: true }); fs.writeFileSync(path.join(c.staging, n), f.buf); copies.push({ staged: n, to: f.rel }); });
      if (!m.files.length) notes.push('translation: no line changed, nothing to write');
      return { copies, notes: notes.concat(m.notes), result: { file: m.files.length ? m.files[0].rel : null, keys: {} } };
    }
    const file = String(c.value('file') || fileOf(mod));
    if (!new RegExp(FILE_RE).test(file)) throw bad('That is not a text file name: ' + file.slice(0, 80));
    const lines = parseLines(c.value('lines'), what === 'lines' ? String(c.value('family') || 'name') : 'other', new Set(current(c.gameDir, mod).keys()));
    if (!lines.length) return { notes: ['text: no lines to write'], result: { file, keys: {} } };
    const t = textItems({ game: c.gameDir, mod, file, lines, force: c.value('force') !== false, replace: c.value('replace') !== false });
    if (!t.items.length) return { notes: notes.concat(t.notes, ['text: every line already reads like that; nothing to write']), result: { file, keys: {} } };
    return { gen: { ops: [{ op: 'text', items: t.items }] }, notes: notes.concat(t.notes), result: { file, keys: t.keys } };
  },
  // the Check step: lnglint and loccover over the mod as written
  check: async (draft, ctx) => {
    const mod = draft.mod, cards = [];
    if (!mod || !fs.existsSync(mod)) return [{ title: 'texts', lines: ['The mod folder is not there.'], level: 'error' }];
    // GoH: lnglint and loccover read the AS2 .lng set; the .pot entries are listed and checked in game [T]
    if (gidOf(ctx, draft) === 'goh') {
      const dir = path.join(mod, GH().TEXT_DIR), pots = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.pot$/i.test(f)) : [];
      return [{ title: 'texts', lines: pots.length ? pots.map(f => GH().TEXT_DIR + f).concat(['Start the game with the mod and look at the texts [T].']) : ['No .pot text file in the mod yet.'], level: pots.length ? 'ok' : 'warn' }];
    }
    let lint = []; try { lint = ((await lintJson(ctx, mod)).findings || []); } catch (e) { cards.push({ title: 'lnglint', lines: [String(e.message || e)], level: 'error' }); }
    cards.push({ title: 'lnglint', lines: lint.length ? lint.slice(0, 50).map(f => f.file + (f.line ? ':' + f.line : '') + ' ' + f.code + ' ' + f.msg) : ['No problem in the text files.'], level: lint.some(f => !/^WARN_/.test(f.code)) ? 'error' : lint.length ? 'warn' : 'ok' });
    MISS.clear();
    const miss = await missing(gameOf(ctx), mod, exeOf(draft.game), ctx);
    cards.push({ title: 'loccover', lines: miss.length ? miss.slice(0, 50).map(r => r.key + ': ' + r.msg) : ['Every name and info line the game looks for is there.'], level: miss.length ? 'warn' : 'ok' });
    return cards;
  },
  routes,
  _t: { gameQ, exeQ, parseLines, textItems, mergeTable, mergeTableAsync, tableUpload, readTable, decodeTable, splitTable, checkTable, checkTableAsync, missing, MISS, lintJson, current, vanilla, modTexts, fileOf, FAMILY, esc, unesc },
};
