#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-0f452946)
// lng: translation round trip over a mod's text keys. rows LOC-01 LOC-05 LOC-10 LOC-17 LOC-18
//   node tools/lng/lng.js extract <mod> --out f.tsv [--lang l]
//   node tools/lng/lng.js merge <mod> f.tsv --out <folder> [--all] [--dry-run]
// extract: every key of every .lng (UTF-8, loose or inside the mod's paks) and GoH .pot (localizations/<lang>/interface/text/..) to a TSV:
//   file \t key \t source \t translation \t context     (tab/newline/backslash escaped as \t \n \\ ; translation empty = untranslated;
//   .pot rows start with the file's current msgstr). --lang l: only localizations/<l>/ .pot (AS2 has one lng set, LOC-17)
// merge: writes translation into a copy under --out at the SAME relative path as the mod's own file (packed ones go loose to resource/<name>),
//   byte-preserving elsewhere, key set unchanged. only files with a changed row are written (--all: every file in the TSV).
//   never writes under <mod>; a path the mod does not already own is an unknown row, so no vanilla path is ever created (LOC-01, LOC-18).
// codes: LNG_ENC (file skipped) LNG_ROW_UNKNOWN LNG_ROW_STALE (source column differs from the mod now; row skipped) LNG_DUP_KEY
//   WARN_LNG_PARAM_MISMATCH WARN_LNG_TAG_MISMATCH (translation row still written) LNG_OUT_IS_SOURCE LNG_BAD_TSV
//   info: LNG_UNTRANSLATED (count) LNG_KEY_NOT_IN_TSV (count)
// (include "p") in a .lng (LOC-21, lib/lnginc; split mods): extract lists the keys of each part with the part as the file column
//   (key = full key under the including .lng); merge writes a part's rows back into that part, byte-preserving, at its own path.
//   LNG_INCLUDE_MISSING LNG_INCLUDE_CYCLE (extract): an include with no file / looping; its keys are not listed. A .lng with no
//   include line takes the old path unchanged.
const fs = require('fs'), path = require('path');
const sdl = require('../lib/sdl'), pak = require('../lib/pak'), { readText } = require('../lib/enc'), lnginc = require('../lib/lnginc');
const { createReport, walkFiles } = require('../lib/report');

const PARAM = /%[-+ 0#]*\d*(?:\.\d+)?[sdfiuxXc]|\{\d+\}/g, TAG = /<\/?[a-zA-Z][^<>]*>/g;
const ms = (s, re) => (s.match(re) || []).sort().join(' ');
const tsvEsc = s => s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
const tsvUn = s => s.replace(/\\(.)/g, (m, c) => (c === 't' ? '\t' : c === 'n' ? '\n' : c === 'r' ? '\r' : c === '\\' ? '\\' : m));
const lngEsc = t => t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t');
const potEsc = lngEsc, potUn = s => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));

// ---- mod files: [{id (tsv file column), kind 'lng'|'pot', rel (key path base), write (path under --out), read()}] ----
function modFiles(mod, lang) {
  const out = [];
  const kindOf = n => (/\.lng$/i.test(n) ? 'lng' : /\.pot?$/i.test(n) ? 'pot' : null);   // .po = a translated GoH file (Valour ru.pak), same gettext layout as .pot
  const relOf = (n, kind) => {
    const m = kind === 'pot' ? (/(?:^|\/)localizations\/([^/]+)\/interface\/text\/(.*)$/i.exec(n) || /^([^/]+)\/interface\/text\/(.*)$/i.exec(n)) : /(?:^|\/)(?:localization|interface\/text)\/(.*)$/i.exec(n);
    if (kind === 'pot') return m ? { lang: m[1], rel: m[2] } : { lang: null, rel: n };
    return { lang: null, rel: m ? m[1] : n };
  };
  const take = (id, n, kind, write, read, opener) => {
    const r = relOf(n, kind);
    if (kind === 'pot' && lang && r.lang && r.lang.toLowerCase() !== lang.toLowerCase()) return;
    // open(vkey) -> {buf, file (TSV file id), write} | null: target of an (include "p") in this .lng (LOC-21), under the same text root
    out.push({ id, kind, rel: r.rel, write, read, open: opener && opener(n.slice(0, n.length - r.rel.length)) });
  };
  for (const f of walkFiles(mod, /\.(lng|pot?|pak)$/i)) {
    const rel = path.relative(mod, f).replace(/\\/g, '/');
    if (/\.pak$/i.test(rel)) {
      let L; try { L = pak.list(f); } catch (e) { continue; }
      const pdir = path.posix.dirname(rel), wr = n => (pdir === '.' ? '' : pdir + '/') + n;
      // a part in the same pak: entry <text root of the .lng> + p
      const pakOpen = pre => vk => {
        if (!vk.toLowerCase().startsWith(lnginc.TEXT_ROOT)) return null;
        const want = (pre + vk.slice(lnginc.TEXT_ROOT.length)).toLowerCase(), e = L.find(x => x.name.toLowerCase() === want);
        return e ? { buf: pak.read(L, e), file: rel + '!' + e.name, write: wr(e.name) } : null;
      };
      for (const e of L) {
        const k = kindOf(e.name); if (!k) continue;
        take(rel + '!' + e.name, e.name, k, wr(e.name), () => pak.read(L, e), k === 'lng' && pakOpen);
      }
    } else take(rel, rel, kindOf(rel), rel, () => fs.readFileSync(f), kindOf(rel) === 'lng' && looseOpen(mod));
  }
  return out;
}
// a loose part: <mod>/<text root of the .lng> + p; a rooted path outside the text root: <mod>/resource/...
const looseOpen = mod => pre => vk => {
  const low = vk.toLowerCase();
  const p = low.startsWith(lnginc.TEXT_ROOT) ? pre + vk.slice(lnginc.TEXT_ROOT.length) : low.startsWith('resource/') ? vk : null;
  if (!p) return null;
  const f = path.join(mod, p);
  try { if (!fs.statSync(f).isFile()) return null; } catch { return null; }
  return { buf: fs.readFileSync(f), file: p, write: p };
};

// ---- parsers: → {rows:[{key,text,line,ctx,...edit info}], lines, bom, eol} ----
function decode(buf) {
  const r = readText(buf, 'utf8');
  if (r.fatal || r.badLines.length) return { err: r.fatal || `invalid UTF-8 at line ${r.badLines[0]} (LOC-05)` };
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  return { bom, lines: buf.subarray(bom ? 3 : 0).toString('utf8').split('\n') };
}
function parseLng(buf, rel) {
  const d = decode(buf); if (d.err) return d;
  const top = sdl.parseLines(d.lines, () => {}, { resync: 'nextQuote' });
  const parts = rel.replace(/\.lng$/i, '').split('/'), file = parts.pop(), pre = [...parts];
  if (!file.startsWith('#')) pre.push(file);
  const rows = [];
  const walk = (n, p) => {
    if (n.name === null) return;
    const k = [...p, String(n.name)];
    const sv = n.vals.filter(v => v.t === 's');
    if (sv.length && !n.kids.length) rows.push({ key: k.join('/'), text: sv.map(v => v.v).join(''), line: n.line, toks: sv });
    for (const c of n.kids) walk(c, k);
  };
  for (const t of top.kids) if ((t.name || '').toLowerCase() === 'tags') for (const c of t.kids) walk(c, pre);
  d.rows = rows;
  return d;
}
function parsePot(buf) {
  const d = decode(buf); if (d.err) return d;
  const rows = []; let cur = null, st = null, cmt = [];
  const flush = () => { if (cur && cur.ctx !== null && cur.sStart >= 0) rows.push({ key: potUn(cur.ctx), text: potUn(cur.id), tr: potUn(cur.str), line: cur.line, sStart: cur.sStart, sEnd: cur.sEnd, ctxc: cur.cmt }); cur = null; };
  d.lines.forEach((raw, i) => {
    const l = raw.replace(/\r$/, '').trim(); let m;
    if (l.startsWith('#')) { if (cur && cur.sStart >= 0) flush(); cmt.push(l.replace(/^#[.:,]?\s*/, '')); return; }
    if ((m = /^msgctxt\s+"(.*)"$/.exec(l))) { flush(); cur = { ctx: m[1], id: '', str: '', line: i + 1, sStart: -1, sEnd: -1, cmt: cmt.join(' ') }; cmt = []; st = 'ctx'; }
    else if (!cur) { if (l === '') cmt = []; }
    else if ((m = /^msgid\s+"(.*)"$/.exec(l))) { cur.id = m[1]; st = 'id'; }
    else if ((m = /^msgstr\s+"(.*)"$/.exec(l))) { cur.str = m[1]; cur.sStart = cur.sEnd = i; st = 'str'; }
    else if ((m = /^"(.*)"$/.exec(l))) { if (st === 'ctx') cur.ctx += m[1]; else if (st === 'id') cur.id += m[1]; else if (st === 'str') { cur.str += m[1]; cur.sEnd = i; } }
  });
  flush();
  d.rows = rows;
  return d;
}
const parse = (f, buf) => (f.kind === 'pot' ? parsePot(buf) : parseLng(buf, f.rel));

// ---- .lng with (include "p") lines (LOC-21 [V]: the engine expands includes before it reads keys; lib/lnginc) ----
// -> {rows (whole expanded set, each with file = the unit that holds it), units: Map file id -> {bom, lines, rows, write} | {err}}
// unit = the root .lng or one part; its rows carry toks with line/col in that file's own lines, so merge edits the part in place.
// A part included twice keeps the first place in its unit rows (one text there). override: Map id -> Buffer (merge re-check)
const HAS_INC = /\(\s*include\s+"/i, INC = /^\(\s*include\s+"([^"]*)"\s*\)/i;
const hasInc = buf => HAS_INC.test(buf.toString('latin1'));
function parseInc(f, buf, override, onError) {
  const d = decode(buf); if (d.err) return d;
  const bufs = new Map([[f.id, buf]]), writes = new Map([[f.id, f.write]]);
  const open = vk => {
    const o = f.open && f.open(vk); if (!o) return null;
    const b = override && override.has(o.file) ? override.get(o.file) : o.buf;
    bufs.set(o.file, b); writes.set(o.file, o.write);
    return { buf: b, file: o.file };
  };
  const p = lnginc.parseLng(buf, f.rel, { open, file: f.id, onError });
  if (p.fatal) return { err: p.fatal };
  const units = new Map();
  const unit = id => {
    let u = units.get(id);
    if (!u) {
      const dd = decode(bufs.get(id));
      u = dd.err ? { err: dd.err, rows: [] } : { bom: dd.bom, lines: dd.lines, plain: dd.lines.map(l => l.replace(/\r$/, '')), rows: [], write: writes.get(id), pos: new Set() };
      units.set(id, u);
    }
    return u;
  };
  // column of each expanded line in its own file: a line cut by an include goes on after the (include "..") text
  const off = [], st = new Map();
  p.lines.forEach((piece, i) => {
    const o = p.origin[i], u = unit(o.file);
    if (u.err) return off.push(0);
    const k = o.file + '\0' + o.line, full = u.plain[o.line - 1] || '';
    let s = st.get(k); if (s === undefined || s < 0) s = 0;
    off.push(s);
    const end = s + piece.length;
    if (end >= full.length) st.set(k, -1); else { const m = INC.exec(full.slice(end)); st.set(k, end + (m ? m[0].length : 0)); }
  });
  const parts = f.rel.replace(/\.lng$/i, '').split('/'), file = parts.pop(), pre = [...parts];
  if (!file.startsWith('#')) pre.push(file);
  const rows = [];
  const walk = (n, kp) => {
    if (n.name === null) return;
    const k = [...kp, String(n.name)];
    const sv = n.vals.filter(v => v.t === 's');
    if (sv.length && !n.kids.length) {
      const o = p.origin[n.line - 1], u = unit(o.file);
      const toks = sv.map(t => ({ file: p.origin[t.line - 1].file, line: p.origin[t.line - 1].line, col: t.col + off[t.line - 1] }));
      const row = { key: k.join('/'), text: sv.map(v => v.v).join(''), line: o.line, toks, file: o.file };
      rows.push(row);
      const pk = toks[0].line + ':' + toks[0].col;
      if (!u.err && toks.every(t => t.file === o.file) && !u.pos.has(pk)) { u.pos.add(pk); u.rows.push(row); row.listed = true; }
    }
    for (const c of n.kids) walk(c, k);
  };
  for (const t of p.root.kids) if ((t.name || '').toLowerCase() === 'tags') for (const c of t.kids) walk(c, pre);
  return { bom: d.bom, lines: d.lines, rows, units };
}
const incError = rep => (code, msg, at) => { if (code !== 'DEFINE_SKIPPED') rep.add(at.file, at.line, code === 'INCLUDE_CYCLE' || code === 'INCLUDE_DEPTH' ? 'LNG_INCLUDE_CYCLE' : 'LNG_INCLUDE_MISSING', msg + ': its keys are not extracted (LOC-21)'); };

function extract(mod, o, rep) {
  const L = ['file\tkey\tsource\ttranslation\tcontext'];
  let nrows = 0, nfiles = 0;
  for (const f of modFiles(mod, o.lang)) {
    const buf = f.read();
    const d = f.kind === 'lng' && hasInc(buf) ? parseInc(f, buf, null, incError(rep)) : parse(f, buf);
    if (d.err) { rep.add(f.id, 0, 'LNG_ENC', d.err); continue; }
    nfiles += d.units ? [...d.units.values()].filter(u => !u.err).length : 1;
    if (d.units) for (const [id, u] of d.units) if (u.err) rep.add(id, 0, 'LNG_ENC', u.err);
    const seen = new Set();
    for (const r of d.rows) {
      const lk = r.key.toLowerCase();
      if (seen.has(lk)) rep.add(r.file || f.id, r.line, 'LNG_DUP_KEY', `"${r.key}" repeats; later wins in game, rows pair by order on merge`);
      seen.add(lk);
      if (d.units && !r.listed) continue;   // a part's text listed once (the first place it is included)
      const ps = ms(r.text, PARAM);
      L.push([r.file || f.id, r.key, r.text, r.tr || '', `L${r.line}${ps ? ' params=' + ps : ''}${r.ctxc ? ' ' + r.ctxc : ''}`].map(tsvEsc).join('\t'));
      nrows++;
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  fs.writeFileSync(o.out, L.join('\n') + '\n');
  rep.info('extract', 0, 'LNG_EXTRACTED', `${nrows} rows, ${nfiles} files -> ${o.out}`);
}

function merge(mod, tsv, o, rep) {
  const rel = path.relative(path.resolve(mod), path.resolve(o.out));
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) { rep.add(o.out, 0, 'LNG_OUT_IS_SOURCE', '--out is or lies inside the source mod; source is never written'); return; }
  const lines = fs.readFileSync(tsv, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0].split('\t').slice(0, 4).join() !== 'file,key,source,translation') { rep.add(tsv, 1, 'LNG_BAD_TSV', 'header must start file,key,source,translation'); return; }
  const rowsBy = new Map();
  lines.slice(1).forEach((l, i) => {
    if (!l) return;
    const c = l.split('\t');
    if (c.length < 4) { rep.add(tsv, i + 2, 'LNG_BAD_TSV', `${c.length} columns, need 4+`); return; }
    const [file, key, src, tr] = c.map(tsvUn);
    (rowsBy.get(file) || rowsBy.set(file, []).get(file)).push({ key, src, tr, line: i + 2 });
  });
  // file ids: every .lng/.pot of the mod, and for a .lng with includes each unit (root + parts) it reads (LOC-21)
  const files = new Map();
  for (const f of modFiles(mod, null)) {
    if (f.kind === 'lng') {
      const b = f.read();
      if (hasInc(b)) { const pd = parseInc(f, b); if (!pd.err) { for (const uid of pd.units.keys()) if (!files.has(uid)) files.set(uid, { unitOf: f, id: uid }); continue; } }
    }
    files.set(f.id, f);
  }
  // one TSV file id -> {kind, d (bom, lines, rows), write, reparse(buf)}; a unit re-reads its root .lng with the part swapped in
  const target = (id, f) => {
    if (!f.unitOf) { const buf = f.read(); return { kind: f.kind, d: parse(f, buf), write: f.write, reparse: b => parse(f, b) }; }
    const root = f.unitOf, rb = root.read(), pd = parseInc(root, rb);
    const pick = q => (q.err ? q : q.units.get(id) || { err: 'no longer included by ' + root.id });
    return { kind: 'lng', d: pick(pd), write: (pd.units && pd.units.get(id) || {}).write, reparse: b => pick(id === root.id ? parseInc(root, b) : parseInc(root, rb, new Map([[id, b]]))) };
  };
  let untr = 0, applied = 0, wrote = 0, notIn = 0;
  for (const [id, rows] of rowsBy) {
    const f = files.get(id);
    if (!f) { for (const r of rows) rep.add(tsv, r.line, 'LNG_ROW_UNKNOWN', `file "${id}" is not a text file of this mod; not created (LOC-01/LOC-18)`); continue; }
    const t = target(id, f), d = t.d;
    if (d.err) { rep.add(id, 0, 'LNG_ENC', d.err); continue; }
    const byKey = new Map();
    for (const r of d.rows) { const k = r.key.toLowerCase(); (byKey.get(k) || byKey.set(k, []).get(k)).push(r); }
    const used = new Map(), edits = [];
    for (const r of rows) {
      const k = r.key.toLowerCase(), n = used.get(k) || 0; used.set(k, n + 1);
      const node = (byKey.get(k) || [])[n];
      if (!node) { rep.add(tsv, r.line, 'LNG_ROW_UNKNOWN', `key "${r.key}" not in ${id}`); continue; }
      if (node.text !== r.src) { rep.add(tsv, r.line, 'LNG_ROW_STALE', `"${r.key}" source changed since extract; row skipped`); continue; }
      if (r.tr === '' || r.tr === node.text) { untr++; continue; }
      if (t.kind === 'pot' && r.tr === node.tr) continue;
      if (ms(r.tr, PARAM) !== ms(node.text, PARAM)) rep.add(tsv, r.line, 'WARN_LNG_PARAM_MISMATCH', `"${r.key}" placeholders [${ms(r.tr, PARAM)}] differ from source [${ms(node.text, PARAM)}]`);
      if (ms(r.tr, TAG) !== ms(node.text, TAG)) rep.add(tsv, r.line, 'WARN_LNG_TAG_MISMATCH', `"${r.key}" tags [${ms(r.tr, TAG)}] differ from source [${ms(node.text, TAG)}]`);
      edits.push({ node, tr: r.tr });
    }
    notIn += d.rows.length - used.size;
    if (!edits.length && !o.all) continue;
    const lines2 = d.lines.slice();
    if (t.kind === 'lng') {
      const flat = [];
      for (const e of edits) e.node.toks.forEach((t, i) => flat.push({ t, v: i ? '' : e.tr }));
      flat.sort((a, b) => b.t.line - a.t.line || b.t.col - a.t.col);
      for (const x of flat) {
        const L = lines2[x.t.line - 1]; let j = x.t.col; // after opening quote
        while (j < L.length && L[j] !== '"') j += L[j] === '\\' ? 2 : 1;
        lines2[x.t.line - 1] = L.slice(0, x.t.col - 1) + '"' + lngEsc(x.v) + '"' + L.slice(j + 1);
      }
    } else {
      for (const e of edits.sort((a, b) => b.node.sStart - a.node.sStart)) {
        const cr = /\r$/.test(lines2[e.node.sStart]) ? '\r' : '';
        lines2.splice(e.node.sStart, e.node.sEnd - e.node.sStart + 1, `msgstr "${potEsc(e.tr)}"${cr}`);
      }
    }
    applied += edits.length;
    // .lng is game text data: always CRLF (a LF source is normalized); .pot (GoH gettext) keeps the source's line ends
    const body = t.kind === 'lng' ? lines2.map(l => l.replace(/\r$/, '')).join('\r\n') : lines2.join('\n');
    const outBuf = Buffer.concat([d.bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(body, 'utf8')]);
    // key-preserving check (a part: its root .lng re-read with the merged part in place)
    const d2 = t.reparse(outBuf);
    if (d2.err || d2.rows.map(r => r.key).join('\n') !== d.rows.map(r => r.key).join('\n')) { rep.add(id, 0, 'LNG_ENC', 'merged file would change its key set; not written'); continue; }
    wrote++;
    if (!o.dryRun) { const dest = path.join(o.out, t.write); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, outBuf); }
  }
  // FIX-PORT (tools-mod:30): a new --out folder was not a mod (no mod.info): copy the source's, CRLF (tools-other:70); an existing one is kept
  const srcInfo = path.join(mod, 'mod.info'), outInfo = path.join(o.out, 'mod.info');
  if (wrote && !fs.existsSync(outInfo)) {
    if (!fs.existsSync(srcInfo)) rep.add(o.out, 0, 'WARN_LNG_NO_MODINFO', `source has no mod.info to copy: ${o.out} is not a loadable mod until it gets one`);
    else {
      if (!o.dryRun) require('../lib/modinfotext').writeModInfo(outInfo, fs.readFileSync(srcInfo));
      rep.info('merge', 0, 'LNG_MODINFO_COPIED', `mod.info ${o.dryRun ? 'would be' : ''} copied from the source mod (CRLF) so ${o.out} loads as a mod; it carries the source's name, rename it to tell the two apart [T: listed in the mod menu]`.replace('  ', ' '));
    }
  }
  if (untr) rep.info('merge', 0, 'LNG_UNTRANSLATED', `${untr} rows without a translation (source text kept)`);
  if (notIn) rep.info('merge', 0, 'LNG_KEY_NOT_IN_TSV', `${notIn} keys of listed files have no TSV row`);
  rep.info('merge', 0, 'LNG_MERGED', `${applied} rows applied, ${wrote} files ${o.dryRun ? 'planned' : 'written'}`);
}

function main() {
  const USAGE = 'usage: ARSENAL lng extract <mod> --out f.tsv [--lang l] | as2 lng merge <mod> f.tsv --out <folder> [--all] [--dry-run]';
  if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); }
  const a = process.argv.slice(2), cmd = a.shift(), o = { all: false }, pos = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--out') o.out = a[++i]; else if (a[i] === '--lang') o.lang = a[++i];
    else if (a[i] === '--all') o.all = true; else if (a[i] === '--dry-run') o.dryRun = true;
    else if (a[i] === '-q') o.q = true; else pos.push(a[i]);
  }
  const rep = createReport();
  if (cmd === 'extract' && pos.length === 1 && o.out) extract(pos[0], o, rep);
  else if (cmd === 'merge' && pos.length === 2 && o.out) merge(pos[0], pos[1], o, rep);
  else { console.error(USAGE); process.exit(2); }
  rep.print({ showInfo: !o.q });
}
if (require.main === module) main();
