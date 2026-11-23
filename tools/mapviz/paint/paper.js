// paint paper (MV-PNT1): the only random source of paint, paper and grain (paint contract 4.8). Light at load.
//   hash(ix, iy, seed) -> u32          integer mix, no float
//   noise(x, y, scale, seed) -> 0..1   value noise on a lattice of `scale` world u, smoothstep bilinear
//   fbm(x, y, o) -> 0..1               o = {scale (u, default 40), octaves 4, gain 0.5, seed}
//   paper(frame, color, o) -> grid     rgba8 on the frame, alpha 255: colour x (1 + grain x (2 fbm - 1)); o = {grain, scale, seed}
//   grain(grid, frame, amount, o)      in place, the same multiply on an existing picture; o = {scale (u, default 8), seed,
//                                      tick?: called with no argument every 16 rows, a throw (cancel) ends the pass}
// Noise is seeded by world position and the seed, never by pixel index: a 512 px and a 2048 px picture of one map share
// the grain pattern in world space (paint contract 0).
// Author: Imperator_Aug (ARSENAL, ia-da9339d8)
'use strict';

function hash(ix, iy, seed) {
  let h = Math.imul((ix | 0) ^ 0x27d4eb2d, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15) ^ Math.imul((iy | 0) ^ 0x165667b1, 0xc2b2ae35), 0x27d4eb2f);
  h ^= Math.imul((seed | 0) ^ 0x9e3779b9, 0x61c88647);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

const INV = 1 / 4294967296;
const smooth = t => t * t * (3 - 2 * t);

function noise(x, y, scale, seed) {
  const s = scale > 0 ? scale : 1;
  const gx = x / s, gy = y / s;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = smooth(gx - ix), fy = smooth(gy - iy);
  const a = hash(ix, iy, seed) * INV, b = hash(ix + 1, iy, seed) * INV;
  const c = hash(ix, iy + 1, seed) * INV, d = hash(ix + 1, iy + 1, seed) * INV;
  const top = a + (b - a) * fx, bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

function fbm(x, y, o) {
  o = o || {};
  const scale = o.scale > 0 ? o.scale : 40, oct = Number.isInteger(o.octaves) && o.octaves > 0 ? o.octaves : 4;
  const gain = o.gain === undefined ? 0.5 : o.gain, seed = o.seed === undefined ? 1 : o.seed | 0;
  let sum = 0, amp = 1, norm = 0, sc = scale;
  for (let k = 0; k < oct; k++) {
    sum += amp * noise(x, y, sc, (seed + Math.imul(k, 0x3c6ef372)) | 0);
    norm += amp; amp *= gain; sc /= 2;
  }
  return norm ? sum / norm : 0.5;
}

function rgbaOf(c) {
  if (Array.isArray(c) || ArrayBuffer.isView(c)) return [c[0] | 0, c[1] | 0, c[2] | 0, c[3] === undefined ? 255 : c[3] | 0];
  return require('./canvas').color(c);
}

function paper(frame, color, o) {
  o = o || {};
  const cv = require('./canvas');
  const c = rgbaOf(color);
  const g = cv.create(frame, [c[0], c[1], c[2], 255]);
  const amount = Number(o.grain) || 0;
  if (amount) grain(g, frame, amount, { scale: o.scale > 0 ? o.scale : 40, seed: o.seed });
  return g;
}

function grain(grid, frame, amount, o) {
  o = o || {};
  const a = Number(amount) || 0;
  if (!a) return grid;
  const scale = o.scale > 0 ? o.scale : 8, seed = o.seed === undefined ? 1 : o.seed | 0;
  const W = grid.w, H = grid.h, d = grid.data;
  const x0 = frame.x0, y0 = frame.y0, sx = frame.sx, sy = frame.sy;
  const fo = { scale, seed }, tick = typeof o.tick === 'function' ? o.tick : null;
  for (let j = 0; j < H; j++) {
    if (tick && j && j % 16 === 0) tick();
    const y = y0 + (j + 0.5) * sy;
    for (let i = 0; i < W; i++) {
      const k = 1 + a * (2 * fbm(x0 + (i + 0.5) * sx, y, fo) - 1);
      const p = (j * W + i) * 4;
      d[p] = Math.round(d[p] * k); d[p + 1] = Math.round(d[p + 1] * k); d[p + 2] = Math.round(d[p + 2] * k);
    }
  }
  return grid;
}

module.exports = { hash, noise, fbm, paper, grain };
