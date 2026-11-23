// paint/painted/kuwahara: the Painted relief filter (design 9, paint contract draft 4.3 and 10.8) and its pool kernel
// (kernel name paint/painted/kuwahara, README 1.5). Node built-ins only, no relative require, so a pool child or a later
// in-process worker can start it from source text.
//   filter(src, W, H, r, n, j0, j1, tick?) -> Uint8ClampedArray of rows j0..j1-1 (rgba8, alpha copied)
//     src = rgba8 data W x H; r = disc radius in px; n = sectors (8 and 4 by integer octants / quadrants, others by angle);
//     tick(rowsDone) is called after every row (the caller throws there on cancel)
//   sectors(r, n) -> [[dx, dy]..] per sector (centre pixel in every sector; a border offset in both sectors beside it)
//   run(task, io) -> 0   task.args = {W, H, r, n, j0, j1, input, outName}; reads args.input (the whole picture, rgba8),
//     writes args.outName = the rows j0..j1-1 as an rgba8 grid (oy moved to row j0) into task.out
// Generalised Kuwahara: for each sector of the disc, the mean colour and the variance (summed over r, g, b); the result is
// the mean of the sector means weighted by 1 / (1 + v)^2. Pixels past the edge repeat the edge pixel. Integer sums,
// IEEE double for the weights: the same input gives the same bytes on every run.
// Author: Imperator_Aug (ARSENAL, ia-f7a0e8ac)
'use strict';

function sectorOf(dx, dy, n) {
  if (n === 8) {
    // half-open octants [45 k, 45 (k + 1)) degrees: the four quarter turns of one rule, so all 8 sectors are equal
    if (dx > 0 && dy >= 0) return dy < dx ? 0 : 1;
    if (dx <= 0 && dy > 0) return dy > -dx ? 2 : 3;
    if (dx < 0 && dy <= 0) return -dy < -dx ? 4 : 5;
    return dx < -dy ? 6 : 7;
  }
  if (n === 4) {
    if (dx > 0 && dy >= 0) return 0;
    if (dx <= 0 && dy > 0) return 1;
    if (dx < 0 && dy <= 0) return 2;
    return 3;
  }
  let a = Math.atan2(dy, dx);
  if (a < 0) a += 2 * Math.PI;
  return Math.min(n - 1, Math.floor(a / (2 * Math.PI / n)));
}

// the sectors a disc offset belongs to: a point on a sector border (an axis, or a diagonal when n = 8) belongs to both
// sectors beside it, so every sector holds the same offsets turned (equal sizes, no direction preferred)
function sectorsOf(dx, dy, n) {
  if (n === 8 || n === 4) {
    if (dy === 0 && dx > 0) return n === 8 ? [7, 0] : [3, 0];
    if (dx === 0 && dy > 0) return n === 8 ? [1, 2] : [0, 1];
    if (dy === 0 && dx < 0) return n === 8 ? [3, 4] : [1, 2];
    if (dx === 0 && dy < 0) return n === 8 ? [5, 6] : [2, 3];
    if (n === 8 && dx === dy) return dx > 0 ? [0, 1] : [4, 5];
    if (n === 8 && dx === -dy) return dx < 0 ? [2, 3] : [6, 7];
  }
  return [sectorOf(dx, dy, n)];
}

function sectors(r, n) {
  const out = [];
  for (let k = 0; k < n; k++) out.push([[0, 0]]);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (dx * dx + dy * dy > r * r) continue;
      for (const s of sectorsOf(dx, dy, n)) out[s].push([dx, dy]);
    }
  }
  return out;
}

function check(src, W, H, r, n, j0, j1) {
  if (!(Number.isInteger(W) && W > 0 && Number.isInteger(H) && H > 0)) throw new Error('kuwahara: W and H must be positive integers');
  if (!src || src.length !== W * H * 4) throw new Error('kuwahara: the picture is not W x H x 4 bytes');
  if (!(Number.isInteger(r) && r >= 1 && r <= 64)) throw new Error('kuwahara: radius must be an integer 1..64, got ' + r);
  if (!(Number.isInteger(n) && n >= 2 && n <= 16)) throw new Error('kuwahara: sectors must be an integer 2..16, got ' + n);
  if (!(Number.isInteger(j0) && Number.isInteger(j1) && j0 >= 0 && j1 <= H && j1 > j0)) throw new Error('kuwahara: rows ' + j0 + '..' + j1 + ' are outside 0..' + H);
}

function filter(src, W, H, r, n, j0, j1, tick) {
  if (j0 === undefined) j0 = 0;
  if (j1 === undefined) j1 = H;
  check(src, W, H, r, n, j0, j1);
  const N = W * H;
  const R = new Int32Array(N), G = new Int32Array(N), B = new Int32Array(N), S = new Int32Array(N);
  for (let p = 0, k = 0; p < N; p++, k += 4) {
    const a = src[k], b = src[k + 1], c = src[k + 2];
    R[p] = a; G[p] = b; B[p] = c; S[p] = a * a + b * b + c * c;
  }
  const sec = sectors(r, n);
  const offs = sec.map(list => Int32Array.from(list.map(d => d[1] * W + d[0])));
  const dxs = sec.map(list => Int32Array.from(list.map(d => d[0])));
  const dys = sec.map(list => Int32Array.from(list.map(d => d[1])));
  const cnt = sec.map(list => list.length);
  const out = new Uint8ClampedArray((j1 - j0) * W * 4);
  for (let j = j0; j < j1; j++) {
    const inner = j >= r && j < H - r;
    for (let i = 0; i < W; i++) {
      const p = j * W + i;
      const fast = inner && i >= r && i < W - r;
      let wr = 0, wg = 0, wb = 0, ws = 0;
      for (let s = 0; s < n; s++) {
        let sr = 0, sg = 0, sb = 0, ss = 0;
        const m = cnt[s];
        if (fast) {
          const o = offs[s];
          for (let q = 0; q < m; q++) { const t = p + o[q]; sr += R[t]; sg += G[t]; sb += B[t]; ss += S[t]; }
        } else {
          const ox = dxs[s], oy = dys[s];
          for (let q = 0; q < m; q++) {
            let x = i + ox[q], y = j + oy[q];
            if (x < 0) x = 0; else if (x >= W) x = W - 1;
            if (y < 0) y = 0; else if (y >= H) y = H - 1;
            const t = y * W + x;
            sr += R[t]; sg += G[t]; sb += B[t]; ss += S[t];
          }
        }
        // variance summed over the channels: (m ss - (sr^2 + sg^2 + sb^2)) / m^2 (integers until the division)
        const v = (m * ss - (sr * sr + sg * sg + sb * sb)) / (m * m);
        const t1 = 1 + v, w = 1 / (t1 * t1);
        wr += w * sr / m; wg += w * sg / m; wb += w * sb / m; ws += w;
      }
      const d = ((j - j0) * W + i) * 4;
      out[d] = Math.round(wr / ws); out[d + 1] = Math.round(wg / ws); out[d + 2] = Math.round(wb / ws); out[d + 3] = src[p * 4 + 3];
    }
    if (tick) tick(j - j0 + 1);
  }
  return out;
}

function run(task, io) {
  const A = task && task.args;
  if (!A || typeof A.input !== 'string' || typeof A.outName !== 'string') throw new Error('kuwahara: task args need input and outName');
  const prog = io.progress || { check() {} };
  const pic = io.readGrid(A.input);
  if (pic.etype !== 'rgba8' || pic.w !== A.W || pic.h !== A.H) throw new Error('kuwahara: ' + A.input + ' is not an rgba8 picture of ' + A.W + ' x ' + A.H);
  const rows = filter(pic.data, A.W, A.H, A.r, A.n, A.j0, A.j1, () => prog.check());
  const cy = pic.meta && pic.meta.cellY > 0 ? pic.meta.cellY : pic.cell;
  io.writeGrid(A.outName, { name: 'pic.painted.band', w: A.W, h: A.j1 - A.j0, cell: pic.cell, ox: pic.ox, oy: pic.oy + A.j0 * cy,
    etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: Object.assign({}, pic.meta || {}, { j0: A.j0, j1: A.j1 }), data: rows });
  return 0;
}

module.exports = { sectors, sectorOf, sectorsOf, filter, run };
