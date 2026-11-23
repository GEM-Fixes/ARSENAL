// model/ddsenc: DXT1 (BC1) encoder for map pictures a game loads (mapviz previews; design 10, contract README 1.3). Pure, sync.
//   encode(rgba, w, h, { mips: true, best: false }) -> Buffer   DX9 DDS, DXT1, 4-colour mode only, full mip chain to 1x1
//     (box filter, premultiplied), mip count and linear size in the header. w and h must be positive multiples of 4, else
//     an Error with code DDSENC_SIZE (also when rgba holds fewer than w * h * 4 bytes). Mips whose sides are not a
//     multiple of 4 are padded to whole blocks by repeating the last column and row.
//   encodeBlock(rgba16px, best) -> Buffer(8)   one block from 16 pixels (64 bytes, rows of 4, top row first)
//   mipChain(rgba, w, h) -> [{ w, h, rgba }]   level 0 is the input; each next level halves (min 1) by a 2x2 box filter
//     on premultiplied colour, (c * a + 127) / 255, un-premultiplied with rounding; a group whose mean alpha is 0 keeps
//     the plain mean of its colour (so a fully transparent picture keeps its colour in every mip).
// Encoder (design 10): flat block -> single-colour tables; else principal axis by integer power iteration, endpoints at the
// two extreme pixels, then two least-squares refinements from the indices; also the block's mean colour; the candidate
// with the least error wins. best: cluster fit over every ordered split of the pixels along the axis into 4 runs.
// Error = luminance-weighted (38, 75, 15 of 128) squared difference on stored values, against the palette a decoder
// makes (565 expanded by bit copy, interpolants (2a + b) / 3 rounded down). Always c0 > c1 (4-colour mode); equal
// endpoints are nudged one 565 step apart. Alpha is not stored (opaque output). No dithering. Integer maths only:
// every value is an integer, divisions are floored, so the bytes are the same on every machine.
// Header as the shipped previews and minimaps of MoW:AS2 and GoH: flags 0xa1007, caps 0x401008, linear size = top level.
// Author: Imperator_Aug (ARSENAL, ia-edf0dafc)
'use strict';

const WR = 38, WG = 75, WB = 15;
const E5 = new Uint8Array(32), E6 = new Uint8Array(64), Q5 = new Uint8Array(256), Q6 = new Uint8Array(256);
for (let q = 0; q < 32; q++) E5[q] = (q << 3) | (q >> 2);
for (let q = 0; q < 64; q++) E6[q] = (q << 2) | (q >> 4);
for (let v = 0; v < 256; v++) {
  let b5 = 0, b6 = 0;
  for (let q = 1; q < 32; q++) if (Math.abs(E5[q] - v) < Math.abs(E5[b5] - v)) b5 = q;
  for (let q = 1; q < 64; q++) if (Math.abs(E6[q] - v) < Math.abs(E6[b6] - v)) b6 = q;
  Q5[v] = b5; Q6[v] = b6;
}
// single colour: endpoints (a, b) whose index-2 colour (2a + b) / 3 is nearest to v; small spread breaks ties (as stb_dxt)
let S5 = null, S6 = null;
function single(E, n) {
  const t = new Uint16Array(256);
  for (let v = 0; v < 256; v++) {
    let best = -1, bs = 0;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const s = 100 * Math.abs((((2 * E[a] + E[b]) / 3) | 0) - v) + 3 * Math.abs(E[a] - E[b]);
      if (best < 0 || s < bs) { bs = s; best = (a << 8) | b; }
    }
    t[v] = best;
  }
  return t;
}

const PR = new Int32Array(4), PG = new Int32Array(4), PB = new Int32Array(4);
const ALPHA = [3, 0, 2, 1];   // weight of c0 (x3) per index
let T0 = 0, T1 = 0, TB = 0, TE = 0;   // last tryPair result
let B0 = 0, B1 = 0, BB = 0, BE = -1;  // best so far

const pack = (r, g, b) => (Q5[r] << 11) | (Q6[g] << 5) | Q5[b];
const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v);
const rnd = (num, den) => Math.floor((2 * num + den) / (2 * den));   // den > 0: nearest integer of num / den

function tryPair(px, c0, c1) {
  if (c0 < c1) { const t = c0; c0 = c1; c1 = t; }
  if (c0 === c1) {
    if (c0 & 31) c1 = c0 - 1; else if (c0 & 0x7e0) c1 = c0 - 32; else if (c0 & 0xf800) c1 = c0 - 2048; else { c0 = 1; c1 = 0; }
  }
  const ar = E5[c0 >> 11], ag = E6[(c0 >> 5) & 63], ab = E5[c0 & 31];
  const br = E5[c1 >> 11], bg = E6[(c1 >> 5) & 63], bb = E5[c1 & 31];
  PR[0] = ar; PR[1] = br; PR[2] = ((2 * ar + br) / 3) | 0; PR[3] = ((ar + 2 * br) / 3) | 0;
  PG[0] = ag; PG[1] = bg; PG[2] = ((2 * ag + bg) / 3) | 0; PG[3] = ((ag + 2 * bg) / 3) | 0;
  PB[0] = ab; PB[1] = bb; PB[2] = ((2 * ab + bb) / 3) | 0; PB[3] = ((ab + 2 * bb) / 3) | 0;
  let bits = 0, err = 0;
  for (let i = 0; i < 16; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    let bk = 0, be = -1;
    for (let k = 0; k < 4; k++) {
      const dr = r - PR[k], dg = g - PG[k], db = b - PB[k], e = WR * dr * dr + WG * dg * dg + WB * db * db;
      if (be < 0 || e < be) { be = e; bk = k; }
    }
    bits |= bk << (2 * i); err += be;
  }
  T0 = c0; T1 = c1; TB = bits >>> 0; TE = err;
  if (BE < 0 || TE < BE) { B0 = T0; B1 = T1; BB = TB; BE = TE; }
}

// least squares endpoints from the indices of the best pair; false when the indices do not fix two endpoints
function lsq(px) {
  let AA = 0, BBs = 0, AB = 0, axr = 0, axg = 0, axb = 0, bxr = 0, bxg = 0, bxb = 0;
  for (let i = 0; i < 16; i++) {
    const a = ALPHA[(BB >>> (2 * i)) & 3], b = 3 - a, r = px[i * 4], g = px[i * 4 + 1], bl = px[i * 4 + 2];
    AA += a * a; BBs += b * b; AB += a * b;
    axr += a * r; axg += a * g; axb += a * bl; bxr += b * r; bxg += b * g; bxb += b * bl;
  }
  const det = AA * BBs - AB * AB;
  if (det <= 0) return false;
  const c0 = pack(clamp(rnd(3 * (BBs * axr - AB * bxr), det)), clamp(rnd(3 * (BBs * axg - AB * bxg), det)), clamp(rnd(3 * (BBs * axb - AB * bxb), det)));
  const c1 = pack(clamp(rnd(3 * (AA * bxr - AB * axr), det)), clamp(rnd(3 * (AA * bxg - AB * axg), det)), clamp(rnd(3 * (AA * bxb - AB * axb), det)));
  tryPair(px, c0, c1);
  return true;
}

const ORD = new Int32Array(16), PROJ = new Float64Array(16);
const SR = new Int32Array(17), SG = new Int32Array(17), SBl = new Int32Array(17);

// --best: every split of the pixels, sorted along the axis, into 4 runs (indices 0, 2, 3, 1); closed-form error per split
function clusterFit(px) {
  for (let i = 0; i < 16; i++) ORD[i] = i;
  const o = Array.prototype.slice.call(ORD).sort((x, y) => (PROJ[y] - PROJ[x]) || (x - y));
  for (let i = 0; i < 16; i++) {
    const p = o[i] * 4;
    SR[i + 1] = SR[i] + px[p]; SG[i + 1] = SG[i] + px[p + 1]; SBl[i + 1] = SBl[i] + px[p + 2];
  }
  let bestE = 0, bc0 = -1, bc1 = -1;
  for (let n0 = 0; n0 <= 16; n0++) for (let n1 = 0; n0 + n1 <= 16; n1++) for (let n2 = 0; n0 + n1 + n2 <= 16; n2++) {
    const k1 = n0, k2 = n0 + n1, k3 = n0 + n1 + n2, n3 = 16 - k3;
    const AA = 9 * n0 + 4 * n1 + n2, BBs = n1 + 4 * n2 + 9 * n3, AB = 2 * n1 + 2 * n2, det = AA * BBs - AB * AB;
    if (det <= 0) continue;
    let E = 0, c0 = 0, c1 = 0;
    for (let c = 0; c < 3; c++) {
      const S = c === 0 ? SR : c === 1 ? SG : SBl;
      const X0 = S[k1], X1 = S[k2] - S[k1], X2 = S[k3] - S[k2], X3 = S[16] - S[k3];
      const AX = 3 * X0 + 2 * X1 + X2, BX = X1 + 2 * X2 + 3 * X3;
      const a = clamp(rnd(3 * (BBs * AX - AB * BX), det)), b = clamp(rnd(3 * (AA * BX - AB * AX), det));
      let A, B, w;
      if (c === 1) { A = E6[Q6[a]]; B = E6[Q6[b]]; w = WG; c0 |= Q6[a] << 5; c1 |= Q6[b] << 5; }
      else { A = E5[Q5[a]]; B = E5[Q5[b]]; w = c === 0 ? WR : WB; c0 |= Q5[a] << (c === 0 ? 11 : 0); c1 |= Q5[b] << (c === 0 ? 11 : 0); }
      E += w * (A * A * AA + B * B * BBs + 2 * A * B * AB - 6 * A * AX - 6 * B * BX);
    }
    if (bc0 < 0 || E < bestE) { bestE = E; bc0 = c0; bc1 = c1; }
  }
  if (bc0 >= 0) tryPair(px, bc0, bc1);
}

function encodeInto(px, best, out, off) {
  BE = -1;
  const r0 = px[0], g0 = px[1], b0 = px[2];
  let flat = true, sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < 16; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    sr += r; sg += g; sb += b;
    if (r !== r0 || g !== g0 || b !== b0) flat = false;
  }
  if (!S5) { S5 = single(E5, 32); S6 = single(E6, 64); }
  const mr = (sr + 8) >> 4, mg = (sg + 8) >> 4, mb = (sb + 8) >> 4;
  const s5r = S5[mr], s6g = S6[mg], s5b = S5[mb];
  tryPair(px, ((s5r >> 8) << 11) | ((s6g >> 8) << 5) | (s5b >> 8), ((s5r & 255) << 11) | ((s6g & 255) << 5) | (s5b & 255));
  if (!flat) {
    let crr = 0, cgg = 0, cbb = 0, crg = 0, crb = 0, cgb = 0;
    for (let i = 0; i < 16; i++) {
      const dr = 16 * px[i * 4] - sr, dg = 16 * px[i * 4 + 1] - sg, db = 16 * px[i * 4 + 2] - sb;
      crr += dr * dr; cgg += dg * dg; cbb += db * db; crg += dr * dg; crb += dr * db; cgb += dg * db;
    }
    let vr, vg, vb;   // start from the row of the largest diagonal
    if (crr >= cgg && crr >= cbb) { vr = crr; vg = crg; vb = crb; } else if (cgg >= cbb) { vr = crg; vg = cgg; vb = cgb; } else { vr = crb; vg = cgb; vb = cbb; }
    for (let it = 0; it < 8; it++) {
      const m = Math.max(Math.abs(vr), Math.abs(vg), Math.abs(vb));
      if (m === 0) break;
      vr = Math.trunc(vr * 1024 / m); vg = Math.trunc(vg * 1024 / m); vb = Math.trunc(vb * 1024 / m);
      const nr = crr * vr + crg * vg + crb * vb, ng = crg * vr + cgg * vg + cgb * vb, nb = crb * vr + cgb * vg + cbb * vb;
      if (nr === 0 && ng === 0 && nb === 0) break;
      vr = nr; vg = ng; vb = nb;
    }
    const m = Math.max(Math.abs(vr), Math.abs(vg), Math.abs(vb)) || 1;
    vr = Math.trunc(vr * 1024 / m); vg = Math.trunc(vg * 1024 / m); vb = Math.trunc(vb * 1024 / m);
    let imin = 0, imax = 0;
    for (let i = 0; i < 16; i++) {
      PROJ[i] = (16 * px[i * 4] - sr) * vr + (16 * px[i * 4 + 1] - sg) * vg + (16 * px[i * 4 + 2] - sb) * vb;
      if (PROJ[i] < PROJ[imin]) imin = i;
      if (PROJ[i] > PROJ[imax]) imax = i;
    }
    tryPair(px, pack(px[imax * 4], px[imax * 4 + 1], px[imax * 4 + 2]), pack(px[imin * 4], px[imin * 4 + 1], px[imin * 4 + 2]));
    for (let it = 0; it < 2; it++) if (!lsq(px)) break;
    if (best) { clusterFit(px); lsq(px); }
  }
  out.writeUInt16LE(B0, off); out.writeUInt16LE(B1, off + 2); out.writeUInt32LE(BB, off + 4);
}

function sizeError(msg) { const e = new Error('ddsenc: ' + msg); e.code = 'DDSENC_SIZE'; return e; }

function encodeBlock(rgba16px, best) {
  if (!rgba16px || !(rgba16px.length >= 64)) throw sizeError('a block needs 16 pixels (64 bytes)');
  const out = Buffer.alloc(8);
  encodeInto(rgba16px, !!best, out, 0);
  return out;
}

function mipChain(rgba, w, h) {
  const out = [{ w, h, rgba }];
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), o = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      const y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
      for (let x = 0; x < nw; x++) {
        const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1);
        const p = [(y0 * w + x0) * 4, (y0 * w + x1) * 4, (y1 * w + x0) * 4, (y1 * w + x1) * 4];
        let sa = 0;
        for (let k = 0; k < 4; k++) sa += rgba[p[k] + 3];
        const A = (sa + 2) >> 2, d = (y * nw + x) * 4;
        for (let c = 0; c < 3; c++) {
          let s = 0;
          if (A === 0) { for (let k = 0; k < 4; k++) s += rgba[p[k] + c]; o[d + c] = (s + 2) >> 2; continue; }
          for (let k = 0; k < 4; k++) { const a = rgba[p[k] + 3]; s += ((rgba[p[k] + c] * a + 127) / 255) | 0; }
          const P = (s + 2) >> 2, v = ((P * 255 + (A >> 1)) / A) | 0;
          o[d + c] = v > 255 ? 255 : v;
        }
        o[d + 3] = A;
      }
    }
    out.push({ w: nw, h: nh, rgba: o });
    rgba = o; w = nw; h = nh;
  }
  return out;
}

function encode(rgba, w, h, opt) {
  opt = opt || {};
  const mips = opt.mips !== false, best = !!opt.best;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0 || w % 4 || h % 4) throw sizeError('size ' + w + 'x' + h + ' is not a multiple of 4');
  if (!rgba || !(rgba.length >= w * h * 4)) throw sizeError('rgba holds ' + (rgba ? rgba.length : 0) + ' bytes, ' + (w * h * 4) + ' needed for ' + w + 'x' + h);
  const levels = mips ? mipChain(rgba, w, h) : [{ w, h, rgba }];
  const bytes = L => ((L.w + 3) >> 2) * ((L.h + 3) >> 2) * 8;
  let total = 128;
  for (const L of levels) total += bytes(L);
  const buf = Buffer.alloc(total);
  buf.write('DDS ', 0, 'latin1');
  buf.writeUInt32LE(124, 4);
  buf.writeUInt32LE(0x1007 | 0x80000 | (levels.length > 1 ? 0x20000 : 0), 8);   // CAPS HEIGHT WIDTH PIXELFORMAT LINEARSIZE (+MIPMAPCOUNT)
  buf.writeUInt32LE(h, 12); buf.writeUInt32LE(w, 16); buf.writeUInt32LE(bytes(levels[0]), 20);
  buf.writeUInt32LE(levels.length, 28);
  buf.writeUInt32LE(32, 76); buf.writeUInt32LE(4, 80); buf.write('DXT1', 84, 'latin1');
  buf.writeUInt32LE(0x1000 | (levels.length > 1 ? 0x400008 : 0), 108);           // TEXTURE (+COMPLEX MIPMAP)
  const px = new Uint8Array(64);
  let off = 128;
  for (const L of levels) {
    const bw = (L.w + 3) >> 2, bh = (L.h + 3) >> 2, s = L.rgba;
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      for (let i = 0; i < 16; i++) {
        const x = Math.min(L.w - 1, bx * 4 + (i & 3)), y = Math.min(L.h - 1, by * 4 + (i >> 2)), q = (y * L.w + x) * 4;
        px[i * 4] = s[q]; px[i * 4 + 1] = s[q + 1]; px[i * 4 + 2] = s[q + 2]; px[i * 4 + 3] = s[q + 3];
      }
      encodeInto(px, best, buf, off);
      off += 8;
    }
  }
  return buf;
}

module.exports = { encode, encodeBlock, mipChain };
