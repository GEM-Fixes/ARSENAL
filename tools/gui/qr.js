// qr: a small QR code encoder for the phone link (no dependencies, no network). Byte mode, error correction level M, versions 1..10
// (10-M holds 213 bytes; a 120 character link needs version 7). ISO/IEC 18004 layout: finders, timing, alignment, format and
// version bits, zig-zag placement, eight masks with the four penalty rules, Reed-Solomon over GF(256) with 0x11D.
//   encode(text) -> {version, size, mask, modules: [[bool]]}   (row major, true = dark)   path(qr) -> SVG path data, one unit per module
// Author: Imperator_Aug (ARSENAL, ia-946e70a2)
'use strict';

// level M, per version: [ec codewords per block, blocks of group 1, data codewords per block in group 1, blocks of group 2]
// (group 2 blocks hold one data codeword more)
const M_TABLE = [null, [10, 1, 16, 0], [16, 1, 28, 0], [26, 1, 44, 0], [18, 2, 32, 0], [24, 2, 43, 0], [16, 4, 27, 0], [18, 4, 31, 0],
  [22, 2, 38, 2], [22, 3, 36, 2], [26, 4, 43, 1]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const MAXV = 10, FORMAT_M = 0;   // level bits: L=01 M=00 Q=11 H=10

function dataCodewords(v) { const t = M_TABLE[v]; return t[1] * t[2] + t[3] * (t[2] + 1); }
function capacity(v) { return Math.floor((dataCodewords(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8); }

// ---- Reed-Solomon (GF(256), primitive 0x11D, generator roots 2^0..2^(n-1))
function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
function rsDivisor(n) {
  const r = new Array(n).fill(0); r[n - 1] = 1; let root = 1;
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { r[j] = gfMul(r[j], root); if (j + 1 < n) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
  return r;
}
function rsRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < div.length; i++) r[i] ^= gfMul(div[i], f); }
  return r;
}

// ---- BCH bits
function formatBits(mask) {
  const data = (FORMAT_M << 3) | mask; let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function versionBits(v) { let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); return (v << 12) | rem; }
const bit = (x, i) => ((x >>> i) & 1) !== 0;

// the data codewords (mode 0100, count, bytes, terminator, pad) then interleaved blocks with their EC codewords
function codewords(bytes, v) {
  const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  const cap = dataCodewords(v) * 8;
  put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
  for (let p = 0xEC; data.length < dataCodewords(v); p ^= 0xEC ^ 0x11) data.push(p);
  const [ec, n1, d1, n2] = M_TABLE[v], div = rsDivisor(ec), blocks = [];
  let k = 0;
  for (let i = 0; i < n1 + n2; i++) { const len = d1 + (i < n1 ? 0 : 1), d = data.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, div) }); }
  const out = [];
  for (let i = 0; i <= d1; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.e[i]);
  return { data, out, blocks };
}

function grid(v) {
  const size = 17 + 4 * v, mod = [], fn = [];
  for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
  const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[v], last = al.length - 1;
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const g = { v, size, mod, fn, set };
  drawFormat(g, 0);   // reserves the format area; drawn again with the chosen mask
  if (v >= 7) { const b = versionBits(v); for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); } }
  return g;
}
function drawFormat(g, mask) {
  const b = formatBits(mask), s = g.size, set = g.set;
  for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
  set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
  for (let i = 0; i < 8; i++) set(s - 1 - i, 8, bit(b, i));
  for (let i = 8; i < 15; i++) set(8, s - 15 + i, bit(b, i));
  set(8, s - 8, true);   // the dark module
}
// the zig-zag order of the data modules: two columns at a time from the right, up then down, column 6 (timing) skipped
function dataOrder(g) {
  const s = g.size, order = [];
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < s; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? s - 1 - vert : vert;
      if (!g.fn[y][x]) order.push([x, y]);
    }
  }
  return order;
}
const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
function applyMask(g, m) { const f = MASKS[m]; for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (!g.fn[y][x] && f(x, y)) g.mod[y][x] = !g.mod[y][x]; }

function penalty(mod) {
  const n = mod.length; let p = 0, dark = 0;
  const line = get => {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) run++;
      else { if (run >= 5) p += 3 + run - 5; run = 1; }
    }
    // finder-like: 1011101 with four light modules on one side
    for (let i = 0; i + 7 <= n; i++) {
      if (!(get(i) && !get(i + 1) && get(i + 2) && get(i + 3) && get(i + 4) && !get(i + 5) && get(i + 6))) continue;
      const lightBefore = i >= 4 && !get(i - 1) && !get(i - 2) && !get(i - 3) && !get(i - 4);
      const lightAfter = i + 11 <= n && !get(i + 7) && !get(i + 8) && !get(i + 9) && !get(i + 10);
      if (lightBefore || lightAfter) p += 40;
    }
  };
  for (let y = 0; y < n; y++) line(x => mod[y][x]);
  for (let x = 0; x < n; x++) line(y => mod[y][x]);
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
  for (const r of mod) for (const c of r) if (c) dark++;
  p += 10 * Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n));
  return p;
}

function encode(text, opt = {}) {
  const bytes = Buffer.from(String(text), 'utf8');
  let v = 1; while (v <= MAXV && capacity(v) < bytes.length) v++;
  if (v > MAXV) throw new Error('qr: text over ' + capacity(MAXV) + ' bytes');
  const cw = codewords(bytes, v).out;
  let best = null;
  for (let m = 0; m < 8; m++) {
    if (opt.mask != null && opt.mask !== m) continue;
    const g = grid(v), order = dataOrder(g);
    order.forEach(([x, y], i) => { g.mod[y][x] = i < cw.length * 8 ? bit(cw[i >>> 3], 7 - (i & 7)) : false; });
    applyMask(g, m); drawFormat(g, m);
    const p = penalty(g.mod);
    if (!best || p < best.p) best = { p, g, m };
  }
  return { version: v, size: best.g.size, mask: best.m, modules: best.g.mod };
}
// SVG path data of the dark modules (a quiet zone of 4 is the caller's viewBox: -4 -4 size+8 size+8)
function path(qr) {
  const out = [];
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (!qr.modules[y][x]) continue;
    let w = 1; while (x + w < qr.size && qr.modules[y][x + w]) w++;
    out.push('M' + x + ' ' + y + 'h' + w + 'v1h-' + w + 'z'); x += w - 1;
  }
  return out.join('');
}

module.exports = { M_TABLE, encode, path, capacity, formatBits, versionBits, rsDivisor, rsRemainder, codewords, grid, dataOrder, MASKS };
