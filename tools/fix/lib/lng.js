// fix/lng: a mod .lng at a vanilla path replaces the file whole (LOC-01, LOC-18) -> vanilla keys show raw.
// merge: mod file bytes kept, the vanilla leaf keys it lacks are appended inside its {tags} block (UTF-8, LOC-05); mod keys win.
//   plan(ctx) -> { edits:[{kind:'lng', key, out, before, after, added:n}], cant:[{key,code,msg}], seen:n }
//   check(before, after, baseBuf) -> null | reason     (gate: key sets, mod texts unchanged, lnglint no growth)
//   GoH (c.exe 'goh'): a mod .pot at a vanilla .pot path is merged the same way by msgctxt (mergePot, potParse); patch path localizations/default/...
// Author: Imperator_Aug (ARSENAL, ia-0ffe9b02)
const fs = require('fs'), os = require('os'), path = require('path');
const sdl = require('../../lib/sdl'), vfs = require('../../lib/vfs');
const { readText } = require('../../lib/enc');

const LOC_ROOT = 'resource/interface/text/';
const esc = t => t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t');

function bodyOf(buf) {   // -> { bom: Buffer, text } | null (utf16/32 BOM or invalid UTF-8)
  const r = readText(buf, 'utf8');
  if (r.fatal || r.badLines.length) return { bad: r.fatal || 'invalid UTF-8 at line ' + r.badLines[0] };
  const bom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  return { bom: bom ? buf.subarray(0, 3) : Buffer.alloc(0), text: buf.subarray(bom ? 3 : 0).toString('utf8') };
}

// o.firstWins: a key written twice keeps its first text (GoH inside one file, GHLOC-08); default: the later one (as64 LOC-04)
function parse(text, o = {}) {
  const raw = text.split('\n'), lines = raw.map(l => l.replace(/\r$/, ''));
  const starts = []; { let p = 0; for (const l of raw) { starts.push(p); p += l.length + 1; } }
  const toks = sdl.tokenize(lines, () => {}, { resync: 'nextQuote' });
  const root = { name: null, vals: [], kids: [], close: null }, st = [root];
  let named = true;
  for (const k of toks) {
    const cur = st[st.length - 1];
    if (k.t === '{') { const n = { name: null, vals: [], kids: [], close: null, line: k.line }; cur.kids.push(n); st.push(n); named = false; }
    else if (k.t === '}') { if (st.length > 1) st.pop().close = k; named = true; }
    else if (!named) { cur.name = k.v; named = true; }
    else cur.vals.push(k);
  }
  const tags = root.kids.find(k => (k.name || '').toLowerCase() === 'tags');
  const leaves = new Map();
  const visit = (n, kp) => {
    if (n.name === null) return;
    const p = kp.concat([n.name]);
    if (n.kids.length) return n.kids.forEach(x => visit(x, p));
    const lk = p.map(s => s.toLowerCase()).join('/');
    if (o.firstWins && leaves.has(lk)) return;
    leaves.set(lk, { names: p, vals: n.vals.filter(v => v.t === 's').map(v => v.v) });
  };
  if (tags) tags.kids.forEach(x => visit(x, []));
  return { tags, leaves, raw, starts };
}

function emit(missing, eol) {   // trie of name paths -> nested text
  const trie = new Map();
  for (const l of missing) {
    let m = trie;
    l.names.forEach((nm, i) => {
      const k = nm.toLowerCase();
      if (!m.has(k)) m.set(k, { name: nm, kids: new Map(), leaf: null });
      const e = m.get(k);
      if (i === l.names.length - 1) e.leaf = l.vals; else m = e.kids;
    });
  }
  const out = [];
  (function w(m, d) {
    const ind = '\t'.repeat(d);
    for (const e of m.values()) {
      if (e.leaf && !e.kids.size) out.push(`${ind}{"${esc(e.name)}"${e.leaf.map(v => ' "' + esc(v) + '"').join('')}}`);
      else { out.push(`${ind}{"${esc(e.name)}"`); w(e.kids, d + 1); out.push(ind + '}'); }
    }
  })(trie, 1);
  return out.join(eol) + eol;
}

function merge(modBuf, baseBuf) {   // -> { buf, added } | { cant:[code,msg] } | { same:true }
  const m = bodyOf(modBuf), b = bodyOf(baseBuf);
  if (m.bad) return { cant: ['FIX_LNG_NOT_UTF8', 'mod file is not valid UTF-8 (' + m.bad + '); not transcoded, resave it as UTF-8 (LOC-05)'] };
  if (b.bad) return { cant: ['FIX_LNG_BASE_UNREADABLE', 'replaced file is not valid UTF-8 (' + b.bad + ')'] };
  const pm = parse(m.text), pb = parse(b.text);
  if (!pm.tags || !pm.tags.close) return { cant: ['FIX_LNG_NO_TAGS', 'mod file has no closed {tags block: cannot place the vanilla keys'] };
  const missing = [...pb.leaves].filter(([k]) => !pm.leaves.has(k)).map(x => x[1]);
  if (!missing.length) return { same: true };
  const eol = /\r\n/.test(m.text) ? '\r\n' : /\n/.test(m.text) ? '\n' : '\r\n';
  const cl = pm.tags.close, off = pm.starts[cl.line - 1] + cl.col - 1, ls = pm.starts[cl.line - 1];
  const solo = m.text.slice(ls, off).trim() === '';
  const ins = emit(missing, eol);
  const text = solo ? m.text.slice(0, ls) + ins + m.text.slice(ls) : m.text.slice(0, off) + eol + ins + m.text.slice(off);
  return { buf: Buffer.concat([m.bom, Buffer.from(text, 'utf8')]), added: missing.length };
}

// ---- GoH .pot (gettext template, GHLOC-01, GHLOC-06 [V]): entries split by blank lines; key = msgctxt, lower case; an entry without msgctxt
// (the header) is no text. A mod .pot at a vanilla path replaces the file at that vfs key, so vanilla entries it lacks show as the raw key [I]:
// the vanilla entries are appended whole (their own bytes, comments too) after the mod's, mod entries win, UTF-8.
function potParse(text) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n', blocks = [], keys = new Map();
  let cur = [];
  const flush = () => { if (!cur.length) return; const b = { lines: cur, key: null }; for (const l of cur) { const m = /^msgctxt\s+"((?:[^"\\]|\\.)*)"\s*$/.exec(l); if (m) { b.key = m[1].toLowerCase(); break; } } blocks.push(b); if (b.key !== null && !keys.has(b.key)) keys.set(b.key, b); cur = []; };
  for (const l of text.split(/\r?\n/)) { if (l.trim() === '') flush(); else cur.push(l); }
  flush();
  return { eol, blocks, keys };
}
function mergePot(modBuf, baseBuf) {   // -> { buf, added } | { cant:[code,msg] } | { same:true }
  const m = bodyOf(modBuf), b = bodyOf(baseBuf);
  if (m.bad) return { cant: ['FIX_LNG_NOT_UTF8', 'mod .pot is not valid UTF-8 (' + m.bad + '); resave it as UTF-8 (GHLOC-06)'] };
  if (b.bad) return { cant: ['FIX_LNG_BASE_UNREADABLE', 'replaced .pot is not valid UTF-8 (' + b.bad + ')'] };
  const pm = potParse(m.text), pb = potParse(b.text);
  const missing = [...pb.keys].filter(([k]) => !pm.keys.has(k)).map(x => x[1]);
  if (!missing.length) return { same: true };
  const eol = pm.eol, body = m.text.replace(/(\r?\n)*$/, '');
  const text = body + (body ? eol + eol : '') + missing.map(x => x.lines.join(eol)).join(eol + eol) + eol;
  return { buf: Buffer.concat([m.bom, Buffer.from(text, 'utf8')]), added: missing.length };
}

// GoH (c.exe 'goh'): text files are .pot (vanilla has no .lng) and .lng under localizations/<lang>/interface/text/ (GHLOC-01); vfs mounts the
// 'default' language at resource/ (the fallback), so the patch file goes to localizations/default/<the rest of the key>
function plan(c) {
  const edits = [], cant = [], goh = c.exe === 'goh';
  let seen = 0;
  for (const [key, rec] of c.v.files) {
    const pot = goh && key.endsWith('.pot');
    if (!key.startsWith(LOC_ROOT) || !(key.endsWith('.lng') || pot) || !c.mineOf(rec)) continue;
    const brec = c.vb.files.get(key);
    if (!brec) continue;
    seen++;
    const before = vfs.readRec(rec), base = vfs.readRec(brec);
    const r = pot ? mergePot(before, base) : merge(before, base);
    if (r.cant) { cant.push({ key, code: r.cant[0], msg: r.cant[1] }); continue; }
    if (r.same) continue;
    const out = goh ? 'localizations/default/' + key.slice('resource/'.length) : 'localization/' + key.slice(LOC_ROOT.length);
    edits.push({ kind: 'lng', key, out, before, after: r.buf, base, added: r.added, over: brec.layer, pot });
  }
  return { edits, cant, seen };
}

function checkPot(e) {
  const a = potParse(bodyOf(e.after).text), m = potParse(bodyOf(e.before).text), b = potParse(bodyOf(e.base).text);
  for (const k of b.keys.keys()) if (!a.keys.has(k)) return `vanilla key ${k} still missing`;
  for (const [k, x] of m.keys) { const y = a.keys.get(k); if (!y || y.lines.join('\n') !== x.lines.join('\n')) return `mod key ${k} changed`; }
  if (a.keys.size !== new Set([...m.keys.keys(), ...b.keys.keys()]).size) return 'merged key count differs from union';
  return null;
}

// gate: every base key present, mod texts unchanged, lnglint finds nothing new in the merged file (.pot: the same by msgctxt, no lnglint)
function check(e) {
  if (e.pot) return checkPot(e);
  const a = parse(bodyOf(e.after).text), m = parse(bodyOf(e.before).text), b = parse(bodyOf(e.base).text);
  for (const k of b.leaves.keys()) if (!a.leaves.has(k)) return `vanilla key ${k} still missing`;
  for (const [k, l] of m.leaves) { const x = a.leaves.get(k); if (!x || x.vals.join('\u0000') !== l.vals.join('\u0000')) return `mod key ${k} changed`; }
  if (a.leaves.size !== new Set([...m.leaves.keys(), ...b.leaves.keys()]).size) return 'merged key count differs from union';
  const lint = require('../../lnglint/lnglint');
  const count = buf => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fixlng-'));
    try {
      const f = path.join(d, e.out); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
      return lint.run({ folder: d }).counts;
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  };
  const cb = count(e.before), ca = count(e.after);
  for (const k of Object.keys(ca)) if (ca[k] > (cb[k] || 0)) return `lnglint: new ${k} x${ca[k] - (cb[k] || 0)}`;
  return null;
}

module.exports = { plan, check, merge, parse, mergePot, potParse, LOC_ROOT };
