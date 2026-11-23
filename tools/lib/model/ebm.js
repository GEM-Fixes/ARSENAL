// model/ebm: the game's bitmap descriptions (.ebm, .tex): small SDL text files that name the picture(s) a texture is made of.
// They are text (the Editor edits them); this reader lets the picture viewer show the picture a description points at.
// Reads only, pure. [V,]
//   parse(text|Buffer) -> { root: 'bitmap'|'reference'|null, ref, frames: [{file, delay}], keys: {axis, filtering, mipmap,
//     alphachannel, blend, ...}, error }
//   frameKey(descKey, file) -> the game key a frame name means: '/' = from resource/, else next to the description
//   candidates(key) -> keys to try for a frame name without an extension, in the game's order (later wins: see FMT-04)
// Shapes seen in the game: `{bitmap {Axis 4 10} {Filtering 1} {AlphaChannel 0} {Blend None} {Frame "mine_f.dds"}}` (814 .ebm,
// inventory/ and texture/), `{Bitmap {Filtering 1} {Mipmap 0} ... {Frame "tex0_0.dds"}}` (61 .tex, CRLF), and `{reference "x"}`.
// `Frame "file" [delay] {Axis x y}`; several Frame blocks = an animation. A ';' starts a comment to the end of the line.
// Author: Imperator_Aug (ARSENAL, ia-210f7f63)
'use strict';

function tokens(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ';') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '{' || c === '}') { out.push(c); i++; continue; }
    if (c === '"') { let j = i + 1, v = ''; while (j < s.length && s[j] !== '"') { if (s[j] === '\\' && j + 1 < s.length) j++; v += s[j++]; } out.push({ s: v }); i = j + 1; continue; }
    if (/\s/.test(c)) { i++; continue; }
    let j = i; while (j < s.length && !/[\s{};"]/.test(s[j])) j++;
    out.push({ w: s.slice(i, j) }); i = j;
  }
  return out;
}
// tokens -> nested blocks [{name, vals, kids}]
function blocks(tk) {
  const root = { name: '', vals: [], kids: [] }, st = [root];
  for (let i = 0; i < tk.length; i++) {
    const t = tk[i], top = st[st.length - 1];
    if (t === '{') { const nx = tk[i + 1], b = { name: nx && nx.w != null ? nx.w : '', vals: [], kids: [] }; if (nx && nx.w != null) i++; top.kids.push(b); st.push(b); }
    else if (t === '}') { if (st.length > 1) st.pop(); }
    else top.vals.push(t.s != null ? t.s : t.w);
  }
  return root;
}

function parse(src) {
  const s = Buffer.isBuffer(src) ? src.toString('latin1') : String(src || '');
  const out = { root: null, ref: null, frames: [], keys: {}, error: null };
  const b = blocks(tokens(s.replace(/^﻿/, ''))), top = b.kids[0];
  if (!top) return Object.assign(out, { error: 'no block: not a bitmap description' });
  const nm = top.name.toLowerCase();
  if (nm === 'reference') { out.root = 'reference'; out.ref = top.vals[0] || null; if (!out.ref) out.error = 'reference without a name'; return out; }
  if (nm !== 'bitmap') return Object.assign(out, { error: 'the file starts with {' + top.name + '}, not {bitmap} or {reference}' });
  out.root = 'bitmap';
  for (const k of top.kids) {
    const key = k.name.toLowerCase();
    if (key === 'frame') out.frames.push({ file: k.vals[0] || '', delay: k.vals[1] != null ? Number(k.vals[1]) : null });
    else out.keys[key] = k.vals.length ? k.vals.join(' ') : true;
  }
  if (!out.frames.length) out.error = 'no Frame in the description';
  return out;
}

// game keys are lower case with forward slashes, under resource/
function frameKey(descKey, file) {
  let f = String(file || '').replace(/\\/g, '/').trim().toLowerCase();
  if (!f) return null;
  if (f.startsWith('/')) return 'resource' + f;
  const dir = String(descKey || '').toLowerCase().replace(/[^/]*$/, '');
  const parts = (dir + f).split('/'), out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  const k = out.join('/');
  return k.startsWith('resource/') ? k : 'resource/' + k;
}
const DESC = ['.ebm', '.tex'], IMAGES = ['.dds', '.tga', '.bmp', '.jpg', '.png'];
// a name without an extension: the descriptions first (.tex beats .ebm), then the pictures (a later one beats an earlier one)
function candidates(key) {
  if (/\.[a-z0-9]{2,4}$/i.test(key.split('/').pop())) return [key];
  return DESC.slice().reverse().map(e => key + e).concat(IMAGES.slice().reverse().map(e => key + e));
}

module.exports = { parse, frameKey, candidates, DESC, IMAGES };
