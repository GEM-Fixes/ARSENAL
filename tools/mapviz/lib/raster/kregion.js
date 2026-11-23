// kregion: connected regions and the distance transform, and their pool kernel (tools/mapviz/README.md 1.2, 1.5, 4.4;
// design 3 and 5.1: one label per connected region of a water band). Self-contained: node built-ins only (README 1.5).
//   regions(mask, o?) -> {grid (u32 'regions', 0 none), list:[{id, area, cx, cy, ax, ay}]}
//        mask = numeric grid, a nonzero value (not nodata) is in. o.conn = 4 (default: cells that share a side) or 8.
//        Ids 1.. in the order a row-major scan from row 0 (min world y), column 0 meets the regions. area in m2
//        (cells x cell^2 / upm^2); cx, cy = centroid of the cell centres; ax, ay = label anchor: the region's cell farthest
//        from the region's edge (outside the mask and the map edge both count as edge), ties to the one nearest the
//        centroid, then the first in scan order. Positions in world u.
//   distance(mask, o?) -> f32 'distance' grid, u: for every nonzero cell the Euclidean distance (cell centre to cell centre)
//        to the nearest zero or nodata cell; 0 on those. o.edge = true counts the cells just outside the map as zero.
//        No zero cell and no edge: Infinity. Exact (Felzenszwalb and Huttenlocher 2012, separable squared distances).
//   o.tick(done, total) (both): optional progress hook, at least every 100 ms of work and once at the end (README 7)
//   run(task, io) -> exit code    kernel: task.args = {fn:'regions'|'distance', conn?, edge?}; inputs[0] = mask.mvg;
//        writes <task.out>/regions.mvg + regions.json ({v:1, list}) or <task.out>/distance.mvg
// Author: Imperator_Aug (ARSENAL, ia-1f4cedc6)
'use strict';
const fs = require('fs'), path = require('path');

const NUMERIC = { u8: 1, i8: 1, u16: 1, i16: 1, u32: 1, i32: 1, f32: 1 };
const BIG = 1e20;

function fail(code, msg) { const e = new Error('raster: ' + msg); e.code = code; return e; }

// ticker(o, total) -> step(n = 1): o.tick(done, total), at least every TICK_MS of work and once at the end; a copy of
// kterrain.js ticker (kernels hold no relative require)
const TICK_MS = 100;
function ticker(o, total) {
  const f = o && o.tick != null ? o.tick : null;
  if (f !== null && typeof f !== 'function') throw fail('RASTER_ARG', 'o.tick must be a function (done, total)');
  if (!f) { const none = () => {}; none.end = none; return none; }
  const T = Math.max(1, Math.round(total) || 1);
  let done = 0, last = Date.now();
  const step = n => {
    done += n === undefined ? 1 : n;
    const t = Date.now();
    if (t - last >= TICK_MS) { last = t; f(done < T ? Math.floor(done) : T, T); }
  };
  step.end = () => f(T, T);
  return step;
}

// in-mask as Uint8Array (1 in, 0 out); NaN raw values refused
function inMask(g, what, tk) {
  if (!g || typeof g !== 'object' || !g.data || typeof g.data.length !== 'number') throw fail('RASTER_GRID', what + ' is not a grid object');
  if (!NUMERIC[g.etype]) throw fail('RASTER_ETYPE', what + ' must be a numeric grid, not etype ' + g.etype);
  if (!(Number.isInteger(g.w) && Number.isInteger(g.h) && g.w > 0 && g.h > 0) || g.data.length !== g.w * g.h) throw fail('RASTER_GRID', what + ' size and data differ');
  if (!(g.cell > 0)) throw fail('RASTER_GRID', what + ' cell must be > 0');
  const n = g.w * g.h, d = g.data, m = new Uint8Array(n), nd = g.nodata == null ? null : g.nodata;
  for (let k = 0; k < n; k++) {
    if (tk && k % g.w === 0) tk(0);
    const v = d[k];
    if (v !== v) throw fail('RASTER_NAN', what + ' holds NaN at column ' + (k % g.w) + ', row ' + ((k / g.w) | 0));
    m[k] = v !== 0 && (nd === null || v !== nd) ? 1 : 0;
  }
  return m;
}

// 1-D squared distance transform of f (length n) into d; v, z scratch (n and n + 1)
function edt1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let p = v[k], s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
    while (s <= z[k]) {            // z[0] = -Infinity stops it at k = 0
      k--; p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
    }
    k++;
    v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

// squared distance in cells from every cell to the nearest feature cell (feat[k] = 1); edge: a feature ring outside
// tk: optional ticker step, one call per row of the fill, per column and per row of the passes (2 h + w, + 4 with edge)
function sqDist(feat, w, h, edge, tk) {
  const W = edge ? w + 2 : w, H = edge ? h + 2 : h, o = edge ? 1 : 0, n = W * H;
  const g = new Float64Array(n);           // zeros: the edge frame of the edge form
  if (!edge) for (let j = 0, k = 0; j < H; j++) { for (let i = 0; i < W; i++, k++) g[k] = BIG; if (tk) tk(0); }
  for (let j = 0; j < h; j++) { for (let i = 0; i < w; i++) g[(j + o) * W + i + o] = feat[j * w + i] ? 0 : BIG; if (tk) tk(); }
  const L = Math.max(W, H), f = new Float64Array(L), d = new Float64Array(L), v = new Int32Array(L), z = new Float64Array(L + 1);
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) f[j] = g[j * W + i];
    edt1(f, H, d, v, z);
    for (let j = 0; j < H; j++) g[j * W + i] = d[j];
    if (tk) tk();
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) f[i] = g[j * W + i];
    edt1(f, W, d, v, z);
    for (let i = 0; i < W; i++) g[j * W + i] = d[i];
    if (tk) tk();
  }
  if (!edge) return g;
  const out = new Float64Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = g[(j + 1) * W + i + 1];
  return out;
}

function distance(mask, o) {
  o = o || {};
  const w = mask && mask.w, h = mask && mask.h;
  const tk = ticker(o, (2 * h + w + 4) + h);
  const m = inMask(mask, 'mask', tk), n = w * h;
  const feat = new Uint8Array(n);
  for (let k = 0; k < n; k++) { if (k % w === 0) tk(0); feat[k] = m[k] ? 0 : 1; }
  const d2 = sqDist(feat, w, h, !!o.edge, tk), out = new Float32Array(n);
  for (let j = 0, k = 0; j < h; j++, tk()) for (let i = 0; i < w; i++, k++) out[k] = d2[k] >= BIG / 2 ? Infinity : Math.sqrt(d2[k]) * mask.cell;
  tk.end();
  return { name: o.name || 'distance', w, h, cell: mask.cell, ox: mask.ox, oy: mask.oy, etype: 'f32', sample: mask.sample || 'cell', scale: 1,
    offset: 0, nodata: null, meta: { unit: 'u', edge: !!o.edge }, data: out };
}

function regions(mask, o) {
  o = o || {};
  const conn = o.conn == null ? 4 : Number(o.conn);
  if (conn !== 4 && conn !== 8) throw fail('RASTER_ARG', 'regions conn must be 4 or 8, got ' + o.conn);
  const w = mask && mask.w, h = mask && mask.h;
  // progress: rows of the labelling, the ids, the sums, the distance (sqDist) and the anchors
  const tk = ticker(o, 4 * h + (2 * h + w + 4));
  const m = inMask(mask, 'mask', tk), n = w * h;
  // union-find over provisional labels
  const lab = new Int32Array(n), parent = [0];
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!m[k]) continue;
      const nb = [];
      if (i > 0 && m[k - 1]) nb.push(lab[k - 1]);
      if (j > 0 && m[k - w]) nb.push(lab[k - w]);
      if (conn === 8 && j > 0) {
        if (i > 0 && m[k - w - 1]) nb.push(lab[k - w - 1]);
        if (i < w - 1 && m[k - w + 1]) nb.push(lab[k - w + 1]);
      }
      if (!nb.length) { const l = parent.length; parent.push(l); lab[k] = l; continue; }
      let mn = nb[0];
      for (const x of nb) if (x < mn) mn = x;
      lab[k] = mn;
      for (const x of nb) unite(mn, x);
    }
    tk();
  }
  // final ids in scan order
  const idOf = new Int32Array(parent.length);
  let next = 0;
  const out = new Uint32Array(n);
  for (let j = 0, k = 0; j < h; j++, tk()) {
    for (let i = 0; i < w; i++, k++) {
      if (!m[k]) continue;
      const r = find(lab[k]);
      if (!idOf[r]) idOf[r] = ++next;
      out[k] = idOf[r];
    }
  }
  const cnt = new Float64Array(next + 1), si = new Float64Array(next + 1), sj = new Float64Array(next + 1);
  for (let j = 0, k = 0; j < h; j++, tk()) {
    for (let i = 0; i < w; i++, k++) {
      const id = out[k];
      if (!id) continue;
      cnt[id]++; si[id] += i; sj[id] += j;
    }
  }
  const feat = new Uint8Array(n);
  for (let k = 0; k < n; k++) feat[k] = m[k] ? 0 : 1;
  const d2 = sqDist(feat, w, h, true, tk);
  const best = new Int32Array(next + 1).fill(-1), bd = new Float64Array(next + 1).fill(-1), bc = new Float64Array(next + 1);
  for (let j = 0, k = 0; j < h; j++, tk()) {
    for (let i = 0; i < w; i++, k++) {
      const id = out[k];
      if (!id) continue;
      const mi = si[id] / cnt[id], mj = sj[id] / cnt[id];
      const dc = (i - mi) * (i - mi) + (j - mj) * (j - mj);
      if (d2[k] > bd[id] || (d2[k] === bd[id] && dc < bc[id])) { bd[id] = d2[k]; bc[id] = dc; best[id] = k; }
    }
  }
  tk.end();
  const half = mask.sample === 'lattice' ? 0 : 0.5, cell = mask.cell;
  const upm = mask.meta && mask.meta.upm > 0 ? mask.meta.upm : 20;
  const list = [];
  for (let id = 1; id <= next; id++) {
    const b = best[id], bi = b % w, bj = (b - bi) / w;
    list.push({
      id,
      area: cnt[id] * cell * cell / (upm * upm),
      cx: mask.ox + (si[id] / cnt[id] + half) * cell, cy: mask.oy + (sj[id] / cnt[id] + half) * cell,
      ax: mask.ox + (bi + half) * cell, ay: mask.oy + (bj + half) * cell,
    });
  }
  const grid = { name: o.name || 'regions', w, h, cell, ox: mask.ox, oy: mask.oy, etype: 'u32', sample: mask.sample || 'cell', scale: 1,
    offset: 0, nodata: null, meta: { conn, count: next }, data: out };
  return { grid, list };
}

function run(task, io) {
  const a = (task && task.args) || {};
  const input = task && task.inputs && task.inputs[0];
  if (!input || !task.out) throw fail('RASTER_ARG', 'kregion task needs inputs[0] (a mask grid) and out');
  const mask = io.readGrid(input);
  if (io.progress) io.progress.stage('kregion.' + a.fn, 1);
  if (a.fn === 'regions') {
    const r = regions(mask, { conn: a.conn });
    io.writeGrid(path.join(task.out, 'regions.mvg'), r.grid);
    const file = path.join(task.out, 'regions.json'), tmp = file + '.tmp' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, list: r.list }) + '\n');
    fs.renameSync(tmp, file);
  } else if (a.fn === 'distance') {
    io.writeGrid(path.join(task.out, 'distance.mvg'), distance(mask, { edge: a.edge }));
  } else throw fail('RASTER_ARG', 'kregion fn must be regions or distance, not ' + a.fn);
  if (io.progress) io.progress.step(1);
  return 0;
}

module.exports = { run, regions, distance, sqDist, edt1, ticker };
