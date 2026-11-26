#!/usr/bin/env node
// lnglint: linter for MoW:AS2 .lng localization files and GoH .po/.pot. usage: node lnglint.js <folder>
//   [--game <dir> [--mods a,b] [--exe as64|mowas_2|mowas2|goh]] [-q] [--format text|json|sarif] [-o file]
//   --game: compare with the vanilla text of that install (vcompare.js); --exe names the game (goh: vanilla .pot keys, GHLOC-01)
//   --no-game: no vanilla compare, also when an install is known from AS2_GAME / as2.json
// rules: lim LOC-03..08 + GLYPH is info (not counted).
// LOC-21: (include "p") is expanded first (lib/lnginc): key checks run on the expanded set, text checks once per .inc part, a finding
//   names the part and its line. LNG_INCLUDE_MISSING LNG_INCLUDE_CYCLE (also too deep); info LNG_INC_UNUSED (.inc under a text
//   folder no .lng includes, one per folder), LNG_DEFINE ((define ..) not expanded). A file with no include line: old path, same output.
// Author: Imperator_Aug (ARSENAL, ia-d73f5242)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const path = require('path'), pak = require('../lib/pak');
const { expandIncludes } = require('../lib/lnginc');
const { readText } = require('../lib/enc'), sdl = require('../lib/sdl'), { createReport, walkFiles, relPath, each } = require('../lib/report'), cli = require('../lib/cli');

// non-ASCII as \u escapes: literal NBSP etc. get lost when source is copied around
const LAT = /[A-Za-zÀ-ɏ]/, CYR = /[Ѐ-ӿ]/, WORD = /[A-Za-zÀ-ɏЀ-ӿ]+/g;
const GLY = /[‐-―‘-‟… −]/;

// chars in the GLY range that vanilla localization.pak itself uses (31x U+2019, 12x U+2013, 1x U+2018 in mission/single, UI-1 count):
// vanilla renders them in game, so flagging them is noise. The rest of the range stays flagged [T]
const GLY_VANILLA = new Set([0x2013, 0x2018, 0x2019]);

function lintText(rep, rel, line, s) {
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '<') { i++; continue; }
    if (s[i + 1] === '<') { i += 2; continue; }
    if (!/[A-Za-z\/]/.test(s[i + 1] || '')) {
      rep.add(rel, line, 'TAG_STRAY', `stray '<' in "${s.slice(i, i + 12)}"; use '<<' or &lt;`); i++; continue;
    }
    const j = s.indexOf('>', i);
    if (j < 0) { rep.add(rel, line, 'TAG_UNCLOSED', `tag without '>' swallows rest of text: "${s.slice(i, i + 20)}"`); break; }
    const body = s.slice(i + 1, j);
    if (body === 'c/') rep.add(rel, line, 'WARN_TAG_CSLASH', `'<c/>' spelling unverified (use </c>)`);
    else if (body.includes('<')) rep.add(rel, line, 'TAG_STRAY', `'<' inside tag "<${body.slice(0, 20)}"`);
    i = j + 1;
  }
  for (const w of s.replace(/<[^<>]*>/g, ' ').match(WORD) || [])
    if (LAT.test(w) && CYR.test(w)) rep.add(rel, line, 'MIXED_SCRIPT', `word mixes Latin and Cyrillic: "${w}"`);
  const g = [...s].find(c => GLY.test(c) && !GLY_VANILLA.has(c.codePointAt(0)));
  if (g) rep.info(rel, line, 'GLYPH', `U+${g.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} may render as box [T]`);
}

// ---- (include "p") in a .lng (LOC-21 [V]: the engine expands includes before it reads keys; lib/lnginc). A file with no include
// line takes the old path unchanged. One with includes is linted on the expanded lines: a finding names the file (root or .inc
// part) and that file's own line; a part included twice reports its text findings once (ctx.seen)
const HAS_INC = /\(\s*include\s+"/i;
const hasInclude = lines => lines.some(l => HAS_INC.test(l));
// where a .lng sits: vrel (path under the text root), textDir (real text root), resDir (real resource/ for rooted includes)
function incOpts(root, file) {
  const rel = relPath(root, file), vrel = rel.replace(/^(.*\/)?(localization|interface\/text)\//i, '');
  const textDir = path.resolve(root, rel.slice(0, rel.length - vrel.length) || '.');
  const resDir = /^localization$/i.test(path.basename(textDir)) ? path.join(path.dirname(textDir), 'resource')
    : /[\\/]interface[\\/]text$/i.test(textDir) ? path.resolve(textDir, '..', '..') : undefined;
  return { vrel, textDir, resDir };
}
const INC_CODE = { INCLUDE_MISSING: 'LNG_INCLUDE_MISSING', INCLUDE_CYCLE: 'LNG_INCLUDE_CYCLE', INCLUDE_DEPTH: 'LNG_INCLUDE_CYCLE', INCLUDE_FATAL: 'ENC_BOM' };

function lintFile(rep, file, root, ctx, buf) {
  const rel = relPath(root, file);
  const r = readText(buf !== undefined ? buf : file, 'utf8');
  if (r.fatal) return rep.add(rel, 1, 'ENC_BOM', r.fatal);
  for (const ln of r.badLines) rep.add(rel, ln, 'ENC_UTF8', 'invalid UTF-8 bytes (cp1251 saved by mistake?)');
  if (!ctx || !hasInclude(r.lines)) return lintLines(rep, rel, r.lines, file);
  const io = incOpts(root, file);
  ctx.textDirs.add(io.textDir.toLowerCase());
  const self = path.resolve(file).toLowerCase();
  // a finding located in a part: once per run (the part may be included by several files or twice)
  const put = (kind, f, line, code, msg) => {
    const pr = relPath(root, f);
    if (path.resolve(f).toLowerCase() !== self) { const k = pr + ':' + line + ':' + code + ':' + msg; if (ctx.seen.has(k)) return; ctx.seen.add(k); }
    rep[kind](pr, line, code, msg);
  };
  const x = expandIncludes(file, io.vrel, { textDir: io.textDir, resDir: io.resDir, onError: (code, msg, at) => {
    if (code === 'DEFINE_SKIPPED') return put('info', at.file, at.line, 'LNG_DEFINE', msg);
    put('add', at.file, at.line, INC_CODE[code] || 'LNG_INCLUDE_MISSING', msg + (code === 'INCLUDE_MISSING' ? ': the engine reads no keys from it (LOC-21)' : ' (LOC-21)'));
  } });
  if (x.fatal) return;
  for (const pf of x.files.slice(1)) {   // encoding of each part, once
    const k = path.resolve(pf).toLowerCase();
    ctx.included.add(k);
    if (ctx.parts.has(k)) continue;
    ctx.parts.add(k);
    const pr = readText(pf, 'utf8');
    for (const ln of pr.badLines) put('add', pf, ln, 'ENC_UTF8', 'invalid UTF-8 bytes (cp1251 saved by mistake?)');
  }
  const map = l => { const o = x.origin[l - 1] || { file, line: l }; return { file: o.file, rel: relPath(root, o.file), line: o.line }; };
  const mrep = { add: (r0, l, c, m) => { const o = map(l); put('add', o.file, o.line, c, m); }, info: (r0, l, c, m) => { const o = map(l); put('info', o.file, o.line, c, m); } };
  lintLines(mrep, rel, x.lines, file, map);
}
// .inc files under a text folder that no .lng includes: one info per folder (parked parts are expected; the engine reads none of them)
function unusedParts(rep, folder, ctx) {
  const by = new Map();
  for (const f of walkFiles(folder, /\.inc$/i)) {
    const rel = relPath(folder, f), abs = path.resolve(f).toLowerCase();
    if (ctx.included.has(abs)) continue;
    if (!/(^|\/)(localization|interface\/text)\//i.test(rel) && ![...ctx.textDirs].some(d => abs.startsWith(d + path.sep))) continue;
    const d = path.posix.dirname(rel);
    (by.get(d) || by.set(d, []).get(d)).push(rel);
  }
  for (const [d, list] of by) rep.info(list[0], 1, 'LNG_INC_UNUSED', `${list.length} .inc file(s) in ${d}/ not included by any .lng: the engine reads no keys from them (parked?) (LOC-21)`);
}
// the rules that need only the text: lines of one .lng file (used by lintFile, and by lintBuffer for an editor buffer)
// map (optional, expanded include lines): line -> {rel, line} of the file that holds it, for the DUP_KEY "duplicates" text
function lintLines(rep, rel, lines, file, map) {
  const err = (line, code, msg) => rep.add(rel, line, code, msg);
  const at = (cur, prev) => { if (!map) return `line ${prev}`; const a = map(prev), b = map(cur); return a.rel === b.rel ? `line ${a.line}` : `${a.rel}:${a.line}`; };
  const tree = sdl.parseLines(lines, err, { resync: 'nextQuote' });

  // bare words in value position (names may be bare; the `tags` header is a bare name)
  (function bare(n) {
    for (const v of n.vals) if (v.t === 'w' && n.name !== null && n.name.toLowerCase() !== 'tags' && !/^(\((include|define|undef)|\))$/i.test(v.v)) err(v.line, 'WARN_BARE', `unquoted token "${v.v}" in block "${n.name}"`);
    n.kids.forEach(bare);
  })(tree);

  // key = <file title>/<nested names>; title dropped for '#' files; path relative to virtual /interface/text/
  const vrel = rel.replace(/^(.*\/)?(localization|interface\/text)\//i, '');
  const base = path.basename(file, path.extname(file));
  const dir = path.dirname(vrel) === '.' ? '' : path.dirname(vrel) + '/';
  const prefix = dir + (base.startsWith('#') ? '' : base + '/');
  const seen = new Map();
  function visit(n, kp) {
    const key = kp + n.name;
    for (const v of n.vals) if (v.t === 's') lintText(rep, rel, v.line, v.v);
    if (n.kids.length) return n.kids.forEach(c => visit(c, key + '/'));
    const prev = seen.get(key.toLowerCase());
    const txt = n.vals.filter(v => v.t === 's').map(v => v.v).join('');
    if (prev) {
      const msg = `"${key}" duplicates ${at(n.line, prev.line)}${prev.key !== key ? ` (case-only: "${prev.key}")` : ''}; later wins`;
      // identical text = harmless copy-paste redundancy (engine still logs redefinition): info only
      if (prev.txt === txt) rep.info(rel, n.line, 'DUP_KEY_SAME', msg + ' (same text)'); else err(n.line, 'DUP_KEY', msg);
    } else seen.set(key.toLowerCase(), { line: n.line, key, txt });
  }
  for (const n of tree.kids) {
    if (n.name === null) continue;
    if (n.name.toLowerCase() === 'tags') n.kids.forEach(c => visit(c, prefix)); else visit(n, prefix);
  }
  const f = tree.kids[0];
  if (!f || (f.name || '').toLowerCase() !== 'tags') err(f ? f.line : 1, 'NO_TAGS', 'file does not start with {tags ...}');
}

// ---- GoH gettext text (.po/.pot, loose or inside the folder's paks; GOHMOD-3). key = msgctxt (lng.js reads the same).
// shown text = msgstr, or msgid when msgstr is empty [I: gettext rule, GoH .pot ship empty msgstr]. tag/script rules = lintText.
// codes: PO_SYNTAX (unclosed string, msgstr before msgid), PO_NO_MSGSTR (entry ends without msgid/msgstr), DUP_KEY (same msgctxt+msgid,
// other text), PO_NO_CTXT (entry with text but no msgctxt), PO_FUZZY (entry flagged '#, fuzzy'): GoH shows no text for both, the key
// shows raw (GHLOC-06 [V] ); the header (msgid "" with no msgctxt) may be fuzzy, vanilla writes it so (GHLOC-11).
// info PO_LAX (forms vanilla ships), PO_TAG_NO_GT, DUP_KEY_SAME
// out (optional array): every entry pushed as {ctx, id, str, line, fuzzy} (raw escapes kept; poEntries below unescapes them)
const poUn = s => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
function lintPo(rep, rel, buf, out) {
  const r = readText(buf, 'utf8');
  if (r.fatal) return rep.add(rel, 1, 'ENC_BOM', r.fatal);
  for (const ln of r.badLines) rep.add(rel, ln, 'ENC_UTF8', 'invalid UTF-8 bytes (cp1251 saved by mistake?)');
  const s = buf.subarray(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0).toString('utf8');
  // vanilla GoH .pot break strict gettext and still ship (GOHMOD-3 [V] 84 lines in default.pak): raw newline inside a string,
  // ';' comment lines, keyword without a string, text after a closing quote, msgid twice. The GoH reader takes them [I], so
  // they are one info PO_LAX per kind per file, not errors; what text the game then shows is [T]
  const lax = new Map(), laxAt = (n, why) => { const x = lax.get(why); if (x) x.n++; else lax.set(why, { line: n, n: 1 }); };
  const toks = [];
  let i = 0, line = 1, bol = true;
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') { line++; i++; bol = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '﻿') { i++; continue; }
    if (bol && (c === '#' || c === ';')) {
      if (c === ';') laxAt(line, "';' comment line");
      const e = s.indexOf('\n', i), l = s.slice(i, e < 0 ? s.length : e);
      if (/^#,.*\bfuzzy\b/.test(l)) toks.push({ t: 'f', line });
      i = e < 0 ? s.length : e; continue;
    }
    bol = false;
    if (c === '"') {
      const n = line; let j = i + 1, v = '';
      while (j < s.length && s[j] !== '"') { if (s[j] === '\\' && j + 1 < s.length) { v += s[j] + s[j + 1]; j += 2; continue; } if (s[j] === '\n') { line++; laxAt(line, 'raw line break inside a string'); } if (s[j] !== '\r') v += s[j] === '\n' ? '\n' : s[j]; j++; }
      if (j >= s.length) { rep.add(rel, n, 'PO_SYNTAX', 'string not closed before end of file'); break; }
      toks.push({ t: 's', v, line: n }); i = j + 1; continue;
    }
    let j = i; while (j < s.length && !/[\s"]/.test(s[j])) j++;
    const w = s.slice(i, j);
    toks.push({ t: /^(msgctxt|msgid|msgid_plural|msgstr(\[\d+\])?)$/.test(w) ? 'k' : 'x', v: w, line }); i = j;
  }
  const seen = new Map();
  // vanilla dlg_frontend.pot writes "<f(roboto_mono)<c(25 25 25)>": a ( ) tag with no '>' before the next tag. GoH ships it [V], so info
  const tagRep = { info: rep.info.bind(rep), add: (f, l, c, m) => c === 'TAG_STRAY' && /inside tag "<[a-z]\([^()<>]*\)</i.test(m) ? rep.info(f, l, 'PO_TAG_NO_GT', m + ' (vanilla GoH writes this form [I])') : rep.add(f, l, c, m) };
  let cur = null, st = null, fz = 0;
  const flush = () => {
    if (!cur) return;
    const e = cur; cur = null; st = null;
    if (e.id === null || e.str === null) return rep.add(rel, e.line, 'PO_NO_MSGSTR', `entry "${poUn(e.ctx || e.id || '').slice(0, 40)}" has no ${e.id === null ? 'msgid' : 'msgstr'} [I: not seen in vanilla GoH]`);
    if (e.ctx === null && e.id === '') return;   // header
    if (out) out.push({ ctx: e.ctx, id: e.id, str: e.str, line: e.line, fuzzy: !!e.fuzzy });
    const nm = poUn(e.ctx !== null ? e.ctx : e.id).slice(0, 40);
    if (e.ctx === null) rep.add(rel, e.line, 'PO_NO_CTXT', `entry "${nm}" has no msgctxt: GoH keys text by msgctxt and shows nothing for it (GHLOC-06)`);
    if (e.fuzzy) rep.add(rel, e.fuzzy, 'PO_FUZZY', `entry "${nm}" is flagged fuzzy: GoH shows no text for it; drop the flag before shipping (GHLOC-06)`);
    const txt = poUn(e.str !== '' ? e.str : e.id);
    lintText(tagRep, rel, e.str !== '' ? e.sLine : e.iLine, txt);
    const k = (e.ctx || '') + '\u0004' + e.id, prev = seen.get(k), name = poUn(e.ctx !== null ? e.ctx : e.id);
    if (!prev) seen.set(k, { line: e.line, txt });
    else if (prev.txt === txt) rep.info(rel, e.line, 'DUP_KEY_SAME', `"${name}" duplicates line ${prev.line} (same text)`);
    else rep.add(rel, e.line, 'DUP_KEY', `"${name}" duplicates line ${prev.line} with other text; which one GoH shows is not known [T]`);
  };
  toks.forEach((t, k) => {
    if (t.t === 'k' && toks[k + 1] && toks[k + 1].t !== 's' || t.t === 'k' && !toks[k + 1]) laxAt(t.line, 'keyword without a string (read as "")');
    if (t.t === 'f') { fz = t.line; return; }   // '#, fuzzy': belongs to the entry that starts next
    if (t.t === 'x') return laxAt(t.line, 'text outside quotes');
    if (t.t === 's') { if (!cur || !st) return laxAt(t.line, 'string with no keyword'); if (st === 'ctx') cur.ctx += t.v; else if (st === 'id') cur.id += t.v; else if (st === 'str') cur.str += t.v; return; }
    if (t.v === 'msgctxt') { flush(); cur = { ctx: '', id: null, str: null, line: t.line, sLine: t.line, fuzzy: fz }; fz = 0; st = 'ctx'; }
    else if (t.v === 'msgid') {
      if (cur && cur.id !== null && cur.str === null) { laxAt(t.line, 'msgid twice in one entry (later kept)'); cur.id = ''; }
      else { if (!cur || cur.id !== null) { flush(); cur = { ctx: null, id: null, str: null, line: t.line, sLine: t.line, fuzzy: fz }; fz = 0; } cur.id = ''; }
      st = 'id'; cur.iLine = t.line;
    } else if (t.v === 'msgid_plural') st = 'plural';
    else if (!cur || cur.id === null) { rep.add(rel, t.line, 'PO_SYNTAX', `${t.v} before any msgid`); st = null; }
    else if (cur.str === null || t.v === 'msgstr[0]') { cur.str = ''; cur.sLine = t.line; st = 'str'; }
    else st = 'strN';
  });
  flush();
  for (const [why, x] of lax) rep.info(rel, x.line, 'PO_LAX', `${why}: ${x.n}x in this file, first here; strict gettext rejects it, vanilla GoH ships it [I]`);
}
// .po/.pot entries of the folder's paks (GoH mods ship localizations/<lang>.pak). AS2 paks hold no .po: their output is unchanged
function poFiles(folder) {
  const out = [];
  for (const f of walkFiles(folder, /\.(po|pot)$/i)) out.push({ rel: relPath(folder, f), read: () => require('fs').readFileSync(f) });
  for (const f of walkFiles(folder, /\.pak$/i)) {
    let L; try { L = pak.list(f); } catch (e) { continue; }
    for (const e of L) if (/\.pot?$/i.test(e.name)) out.push({ rel: relPath(folder, f) + '!' + e.name, read: () => pak.read(L, e) });
  }
  return out;
}

// poEntries(buf) -> [{ctx, id, str, text, line}] the entries of one .po/.pot that GoH turns into text: msgctxt set, not fuzzy
// (GHLOC-06); text = msgstr, or msgid when msgstr is empty. Used by vcompare for the GoH vanilla base set and the mod side.
function poEntries(buf) {
  const all = [], none = () => {};
  lintPo({ add: none, info: none }, '', buf, all);
  return all.filter(e => e.ctx !== null && !e.fuzzy).map(e => ({ ctx: poUn(e.ctx), id: poUn(e.id), str: poUn(e.str), text: poUn(e.str !== '' ? e.str : e.id), line: e.line }));
}

// run({folder, gameDir?, mods?, exe?}) -> report (no printing). exe: vfs exe of the vanilla compare ('as64'|'mowas_2'|'goh'; none = the vfs pick)
// runAsync(opts, ra) -> Promise<report>: the same, the .lng files read through ra (a readAhead stand-in: the lib/modset read-once
// pass, ctx.js), each added in walk order; ra closed at the end. A file ra does not give is read here as in run
function run(opts) { const g = body(opts, null); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
async function runAsync(opts, ra) {
  try { const g = body(opts, ra); let r = g.next(); while (!r.done) { if (r.value) await r.value; r = g.next(); } return r.value; } finally { if (ra) ra.close(); }
}
function* body(opts, ra) {
  const rep = createReport();
  const ctx = { seen: new Set(), parts: new Set(), included: new Set(), textDirs: new Set() };
  const files = walkFiles(opts.folder, /.lng$/i);
  if (ra) for (const f of files) ra.add(f, f);
  for (const f of files) {
    let b;
    if (ra) { const w = ra.wait(f); if (w) yield w; b = ra.take(f); }
    each([f], opts.folder, rep, f => lintFile(rep, f, opts.folder, ctx, b));
  }
  unusedParts(rep, opts.folder, ctx);
  for (const p of poFiles(opts.folder)) { try { lintPo(rep, p.rel, p.read()); } catch (e) { rep.add(p.rel, 0, 'CRASH', e.message); } }
  if (opts.gameDir) require('./vcompare').compare(rep, opts);
  return rep;
}

// exports set before the CLI runs: vcompare requires this file back (poEntries, poFiles) while the CLI is main
module.exports = { run, runAsync, main, lintBuffer, poEntries, poFiles, incOpts, hasInclude };
// --exe as64|mowas_2|mowas2|goh (lib/cli common): the game of the vanilla compare. goh with no --game: the GoH install (lib/gamedir goh)
// main(argv, {ra}): the CLI (sync, as before) and ctx.js, the read-once module form (ra = the pass's reader: a promise that
// rejects on an error, so the pass runs lnglint as a program instead)
function main(argv, { ra } = {}) {
  // --no-game: no vanilla compare even when an install is known (lib/cli fills --game from AS2_GAME / as2.json): the report of
  // run({folder}) alone, which is what the GUI's text task asks for in a child process
  const o = cli.parse(argv, { flags: ['--no-game'] });
  if (!o.pos[0]) { console.error('usage: node lnglint.js <folder> [--game <dir> [--mods a,b] [--exe as64|mowas_2|mowas2|goh] | --no-game] [-q] [--format text|json|sarif] [-o file]'); process.exit(0); }
  const opts = { folder: o.pos[0], gameDir: o.x['no-game'] ? undefined : o.gameDir, mods: o.mods, exe: o.exe };
  if (!ra) return cli.printReport(run(opts), o, { tool: 'lnglint' });
  return runAsync(opts, ra).then(rep => cli.printReport(rep, o, { tool: 'lnglint' }));
}
if (require.main === module) cli.run(() => main(process.argv.slice(2)));
// lintBuffer(rel, text) -> [{ line, code, msg, info }]   one .lng text that is not on disk (the Editor's buffer); rel names the file
function lintBuffer(rel, text) {
  const out = [], rep = { add: (r, line, code, msg) => out.push({ line, code, msg, info: false }), info: (r, line, code, msg) => out.push({ line, code, msg, info: true }) };
  lintLines(rep, String(rel || 'x.lng').replace(/\\/g, '/'), String(text == null ? '' : text).replace(/^﻿/, '').split(/\r?\n/), String(rel || 'x.lng'));
  return out;
}
