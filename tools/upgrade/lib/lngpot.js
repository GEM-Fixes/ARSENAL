// .lng <-> gettext .pot. key = <file title>/<nested names>, title dropped for # files (LOC-10); subfolder prepended. .pot msgctxt = the full key (PORT-42)
// Author: Imperator_Aug (ARSENAL, ia-b17a32da)
const sdl = require('../../lib/sdl');
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '');
const unesc = s => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
const HEADER = n => `#, fuzzy\nmsgid ""\nmsgstr ""\n"Project-Id-Version: ${esc(n)}\\n"\n"Language: en\\n"\n"MIME-Version: 1.0\\n"\n"Content-Type: text/plain; charset=UTF-8\\n"\n"Content-Transfer-Encoding: 8bit\\n"\n"Plural-Forms: nplurals=INTEGER; plural=EXPRESSION;\\n"\n"POT-Creation-Date: \\n"\n"PO-Revision-Date: \\n"\n"Last-Translator: \\n"\n"Language-Team: \\n"\n`;

// rel = path under the localization folder, e.g. mission/x.lng or #dlg.lng. returns [[key, text]] (sdl keeps escapes raw)
function lngKeys(buf, rel) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3);
  const lines = buf.toString('utf8').split(/\r?\n/), top = sdl.parseLines(lines, () => {});
  const root = sdl.kids(top, 'tags')[0], out = [];
  if (!root) return out;
  const parts = rel.replace(/\.lng$/i, '').split('/'), file = parts.pop(), pre = [...parts];
  if (!file.startsWith('#')) pre.push(file);
  const walk = (n, p) => {
    const k = [...p, String(n.name)];
    if (n.vals.length && !n.kids.length) out.push([k.join('/'), n.vals.map(v => String(v.v)).join('')]);
    for (const c of n.kids) walk(c, k);
  };
  for (const c of root.kids) walk(c, pre);
  return out;
}
function toPot(keys, name) {
  const seen = new Set(), L = [HEADER(name)];
  for (const [k, t] of keys) {
    if (seen.has(k.toLowerCase())) continue;   // a repeat key is one msgctxt; the engine's later-wins order is lost across a split, reported by the caller
    seen.add(k.toLowerCase());
    L.push(`msgctxt "${k.replace(/"/g, '\\"')}"\nmsgid "${t}"\nmsgstr ""\n`);
  }
  return { text: L.join('\n'), n: seen.size, dups: keys.length - seen.size };
}
function potKeys(text) {
  const out = []; let ctx = null, id = null, st = null;
  const flush = () => { if (ctx !== null && id !== null) out.push([unesc(ctx), id]); ctx = id = null; };
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim(); let m;
    if ((m = /^msgctxt\s+"(.*)"$/.exec(l))) { flush(); ctx = m[1]; st = 'ctx'; }
    else if ((m = /^msgid\s+"(.*)"$/.exec(l))) { id = m[1]; st = 'id'; }
    else if (/^msgstr\b/.test(l)) st = 'str';
    else if ((m = /^"(.*)"$/.exec(l))) { if (st === 'id') id += m[1]; else if (st === 'ctx') ctx += m[1]; }
  }
  flush();
  return out;
}
// potMerge(oldBuf, keys, name) -> {buf, added, replaced, kept}: a true merge into an existing .pot. Every byte of the old file stays
// (header, comments, other entries, msgstr, line endings, a BOM); only the entries of `keys` are touched. keys = [[msgctxt, escaped msgid]]
// (JS strings, written as UTF-8); a repeat key in keys: the last wins. An entry whose msgctxt is already there gets its msgid lines
// replaced (nothing when the text is the same); its msgstr is kept when empty, set to the new text when it was the old msgid, else kept
// with a "#, fuzzy" line so a translator sees it. A new key is added at the end with the file's own line ending. No old file (null or
// empty): the plain toPot text (LF), as before.
function potMerge(oldBuf, keys, name) {
  const want = new Map();
  for (const [k, t] of keys) want.set(String(k).toLowerCase(), [String(k), String(t)]);
  if (!oldBuf || !oldBuf.length) { const t = toPot([...want.values()], name); return { buf: Buffer.from(t.text, 'utf8'), added: t.n, replaced: 0, kept: 0 }; }
  const L = s => Buffer.from(s, 'utf8').toString('latin1');   // JS text -> byte string of its UTF-8
  const src = Buffer.from(oldBuf).toString('latin1'), eol = src.includes('\r\n') ? '\r\n' : '\n';
  // each line keeps its own ending (seps[k] follows line k; the last line has none); a new line takes the file's ending
  const parts = src.split(/(\r?\n)/);
  const seps = parts.filter((x, i) => i % 2 === 1), ls = parts.filter((x, i) => i % 2 === 0);
  // entries: msgctxt line (+ "..." continuations), msgid (+ cont), msgstr (+ cont)
  const q = /^\s*"(.*)"\s*$/;
  const ents = [];
  for (let i = 0; i < ls.length; i++) {
    const m = /^\s*msgctxt\s+"(.*)"\s*$/.exec(ls[i]); if (!m) continue;
    let ctx = m[1], j = i + 1, mm;
    while (j < ls.length && (mm = q.exec(ls[j]))) { ctx += mm[1]; j++; }
    const idM = j < ls.length && /^\s*msgid\s+"(.*)"\s*$/.exec(ls[j]); if (!idM) continue;
    const id0 = j; let id = idM[1]; j++;
    while (j < ls.length && (mm = q.exec(ls[j]))) { id += mm[1]; j++; }
    const stM = j < ls.length && /^\s*msgstr\s+"(.*)"\s*$/.exec(ls[j]);
    const st0 = stM ? j : -1; let st = stM ? stM[1] : ''; if (stM) { j++; while (j < ls.length && (mm = q.exec(ls[j]))) { st += mm[1]; j++; } }
    ents.push({ i, id0, st0, end: j, ctx: unesc(ctx).toLowerCase(), id, st });
    i = j - 1;
  }
  const edits = [];   // [from, to, newLines] on line indexes, applied from the end
  let replaced = 0, kept = 0;
  for (const e of ents) {
    const w = want.get(Buffer.from(e.ctx, 'latin1').toString('utf8').toLowerCase()) || want.get(e.ctx); if (!w) continue;
    want.delete(String(w[0]).toLowerCase());
    const nid = L(w[1]);
    if (nid === e.id) { kept++; continue; }
    const fuzzyAbove = e.i > 0 && /^#,.*\bfuzzy\b/.test(ls[e.i - 1]);
    if (e.st0 < 0) edits.push([e.id0, e.end, ['msgid "' + nid + '"', 'msgstr ""']]);
    else if (e.st === '') edits.push([e.id0, e.st0, ['msgid "' + nid + '"']]);
    else if (e.st === e.id) edits.push([e.id0, e.end, ['msgid "' + nid + '"', 'msgstr "' + nid + '"']]);
    else { edits.push([e.id0, e.st0, ['msgid "' + nid + '"']]); if (!fuzzyAbove) edits.push([e.i, e.i, ['#, fuzzy']]); }
    replaced++;
  }
  edits.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  for (const [a, b, nl] of edits) {
    const atEnd = b >= ls.length && b > a, s = seps[a] || seps[a - 1] || eol;
    ls.splice(a, b - a, ...nl);
    seps.splice(a, Math.min(b, seps.length) - a, ...nl.slice(0, atEnd ? nl.length - 1 : nl.length).map(() => s));
  }
  let out = ls.map((x, i) => x + (i < seps.length ? seps[i] : '')).join('');
  const add = [...want.values()];
  if (add.length) {
    if (!/\r?\n$/.test(out)) out += eol;
    for (const [k, t] of add) out += eol + 'msgctxt "' + L(k).replace(/"/g, '\\"') + '"' + eol + 'msgid "' + L(t) + '"' + eol + 'msgstr ""' + eol;
  }
  return { buf: Buffer.from(out, 'latin1'), added: add.length, replaced, kept };
}
// a # file keeps the whole key. a path segment that is both text and a block goes back flat [I]
function toLng(keys) {
  const root = new Map();
  let clash = 0;
  for (const [k, t] of keys) {
    const ps = k.split('/'); let m = root, ok = true;
    for (const p of ps.slice(0, -1)) { let c = m.get(p); if (c === undefined) m.set(p, c = new Map()); if (!(c instanceof Map)) { ok = false; break; } m = c; }
    if (!ok || m.get(ps[ps.length - 1]) instanceof Map) { clash++; continue; }
    m.set(ps[ps.length - 1], t);
  }
  const w = (m, ind) => [...m].map(([k, v]) => (v instanceof Map ? `${ind}{"${k}"\r\n${w(v, ind + '\t')}\r\n${ind}}` : `${ind}{"${k}" "${v}"}`)).join('\r\n');
  return { text: `{tags\r\n${w(root, '\t')}\r\n}\r\n`, clash };
}
module.exports = { lngKeys, toPot, potKeys, potMerge, toLng };
