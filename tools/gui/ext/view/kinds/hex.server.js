// view kind hex, server side (the reference kind: see ../README.md). The framework's GET /api/x/view/hex pages the bytes; this file adds
// a search that walks the file in 1 MB slices (a deflated pak entry is inflated as a stream, never loaded whole):
//   GET /api/x/view/hex/find?<ref>&from=<byte>&hex=<pairs> | &text=<utf-8 text>
//     -> { at, len, next, size, done }   at = the first match at or after from (-1 = none yet); a call stops after 64 MB or 2 s and
//        says where to go on (next) unless the end was reached (done)
// exts: none. hex is the fallback: the page opens any file nobody else claims as bytes.
// Author: Imperator_Aug (ARSENAL, ia-2a5e2abf)
'use strict';
const R = require('../ref');

const CH = 1 << 20, BUDGET = 64 << 20, MS = 2000, MAXN = 256;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

function needleOf(sp) {
  const hx = sp.get('hex'), tx = sp.get('text');
  let n;
  if (hx != null && hx !== '') {
    const s = hx.replace(/[\s,]+/g, '').replace(/^0x/i, '');
    if (!/^([0-9a-f]{2})+$/i.test(s)) throw bad('hex: byte pairs like 45 50 4C 59 are needed');
    n = Buffer.from(s, 'hex');
  } else if (tx != null && tx !== '') n = Buffer.from(tx, 'utf8');
  else throw bad('Type what to find: text or bytes.');
  if (n.length > MAXN) throw bad('At most ' + MAXN + ' bytes can be looked for.');
  return n;
}
async function find(url, body, ctx) {
  const sp = url.searchParams, needle = needleOf(sp), from = Number(sp.get('from') || 0);
  if (!Number.isFinite(from) || from < 0 || Math.floor(from) !== from) throw bad('from: a byte offset from 0 is needed');
  const r = R.resolve(ctx, R.refOfQuery(url)), size = r.size, t0 = Date.now();
  let pos = from, tail = Buffer.alloc(0);
  while (pos < size) {
    const b = await R.readRange(r.src, pos, CH);
    if (!b.length) break;
    const w = tail.length ? Buffer.concat([tail, b]) : b, base = pos - tail.length, i = w.indexOf(needle);
    if (i >= 0) return { at: base + i, len: needle.length, next: base + i + 1, size, done: false };
    tail = w.subarray(Math.max(0, w.length - (needle.length - 1)));
    if (needle.length === 1) tail = Buffer.alloc(0);
    pos += b.length;
    if (pos < size && (pos - from >= BUDGET || Date.now() - t0 > MS)) return { at: -1, len: needle.length, next: pos - tail.length, size, done: false };
  }
  return { at: -1, len: needle.length, next: size, size, done: true };
}

module.exports = {
  exts: [],
  routes: { 'GET /api/x/view/hex/find': find },
  remote: ['GET /api/x/view/hex/find'],
  _find: find,
};
