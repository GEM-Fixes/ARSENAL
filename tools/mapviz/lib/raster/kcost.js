// kcost: cost fields with back-pointers and k randomised least-cost paths, and their pool kernel (tools/mapviz/README.md
// 1.2, 1.5; design 3 and 5.2: path cost = length x (groundCost + 1 + heightCost), the cost.<kind> layer). Self-contained:
// node built-ins only (README 1.5).
//   costField(cost, seeds, o?) -> {dist (f32 '<name>.dist', nodata -1), back (u8 '<name>.back'), cost, seeds}
//        cost = numeric cell grid of cost factors; a value < 0, nodata or not finite blocks the cell. Moves to the 8
//        neighbours; step cost = step length in u x the mean factor of the two cells; a diagonal step needs both side cells
//        open (no corner cutting) [I]. seeds = [[x, y] | {x, y} (world u) | {i, j} (cell)]; a seed outside the grid or on a
//        blocked cell is skipped; none left -> RASTER_ARG. back codes: 0 none (a seed or unreached), 1..8 = the
//        neighbour this cell is reached from: 1 east, 2 north-east, 3 north, 4 north-west, 5 west, 6 south-west, 7 south,
//        8 south-east. Ties go to the lower cell index (a fixed heap order), so the same input gives the same bytes.
//        o.name = layer name stem (default 'costfield'). cost and seeds are carried for paths(). o.tick(done, total):
//        optional progress hook, at least every 100 ms of work and once at the end (README 7).
//   paths(cf, from, to, k, seed) -> [[[x, y], ..], ..]   up to k distinct least-cost paths from `from` to `to` (world u,
//        cell centres, only the points where the direction changes): path 1 is the least-cost path (traced on cf.back when
//        `from` is a seed of cf, else A*), each further path is the least-cost path over the cost times a smooth value
//        noise (1 + 1.0 x noise, lattice 16 cells, an integer hash of the cell and seed: no Math.random) times 2 on cells
//        an earlier path used (surveys/terrain.md: penalise reuse x2) [I], found by a weighted A* (at most 1.5 x that
//        least cost, see below). [] when `to` cannot be reached. Up to 4 x k attempts; duplicates are dropped.
//   run(task, io) -> exit code    kernel: task.args = {seeds, name?}; inputs[0] = cost grid; writes <out>/<name>.dist.mvg,
//        <out>/<name>.back.mvg
// Author: Imperator_Aug (ARSENAL, ia-34570259)
'use strict';
const path = require('path');

const NUMERIC = { u8: 1, i8: 1, u16: 1, i16: 1, u32: 1, i32: 1, f32: 1 };
const DX = [0, 1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 0, 1, 1, 1, 0, -1, -1, -1];
const SQ2 = Math.SQRT2;

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

// cost factors as Float64Array, -1 = blocked
function factors(g) {
  if (!g || typeof g !== 'object' || !g.data || typeof g.data.length !== 'number') throw fail('RASTER_GRID', 'cost is not a grid object');
  if (!NUMERIC[g.etype]) throw fail('RASTER_ETYPE', 'cost must be a numeric grid, not etype ' + g.etype);
  if (!(Number.isInteger(g.w) && Number.isInteger(g.h) && g.w > 0 && g.h > 0) || g.data.length !== g.w * g.h) throw fail('RASTER_GRID', 'cost size and data differ');
  if (!(g.cell > 0)) throw fail('RASTER_GRID', 'cost cell must be > 0');
  const n = g.w * g.h, d = g.data, out = new Float64Array(n);
  const sc = g.scale == null ? 1 : g.scale, of = g.offset == null ? 0 : g.offset, nd = g.nodata == null ? null : g.nodata;
  for (let k = 0; k < n; k++) {
    const v = d[k];
    if (nd !== null && v === nd) { out[k] = -1; continue; }
    const p = v * sc + of;
    out[k] = p >= 0 && p < Infinity ? p : -1;
  }
  return out;
}

// binary min-heap of (key, index), ties by index
function Heap() {
  let keys = new Float64Array(1024), ids = new Int32Array(1024), n = 0;
  const less = (a, b) => keys[a] < keys[b] || (keys[a] === keys[b] && ids[a] < ids[b]);
  const swap = (a, b) => { const k = keys[a]; keys[a] = keys[b]; keys[b] = k; const i = ids[a]; ids[a] = ids[b]; ids[b] = i; };
  return {
    get size() { return n; },
    push(key, id) {
      if (n === keys.length) {
        const k2 = new Float64Array(n * 2), i2 = new Int32Array(n * 2);
        k2.set(keys); i2.set(ids); keys = k2; ids = i2;
      }
      keys[n] = key; ids[n] = id;
      let c = n++;
      while (c > 0) { const p = (c - 1) >> 1; if (!less(c, p)) break; swap(c, p); c = p; }
    },
    pop(out) {      // out[0] = key, returns id
      const id = ids[0]; out[0] = keys[0];
      n--;
      if (n > 0) {
        keys[0] = keys[n]; ids[0] = ids[n];
        let p = 0;
        for (;;) {
          const l = 2 * p + 1, r = l + 1;
          let m = p;
          if (l < n && less(l, m)) m = l;
          if (r < n && less(r, m)) m = r;
          if (m === p) break;
          swap(p, m); p = m;
        }
      }
      return id;
    },
  };
}

function cellOf(g, s) {
  const half = g.sample === 'lattice' ? 0.5 : 0;
  if (Array.isArray(s)) s = { x: s[0], y: s[1] };
  if (!s || typeof s !== 'object') return -1;
  let i, j;
  if (Number.isInteger(s.i) && Number.isInteger(s.j)) { i = s.i; j = s.j; }
  else if (Number.isFinite(s.x) && Number.isFinite(s.y)) { i = Math.floor((s.x - g.ox) / g.cell + half); j = Math.floor((s.y - g.oy) / g.cell + half); }
  else return -1;
  return i >= 0 && j >= 0 && i < g.w && j < g.h ? j * g.w + i : -1;
}

// Dijkstra (target < 0) or A* to one target. C = factors (-1 blocked); a NaN entry is filled on first use by lazy(k)
// (paths: the randomised factors of a cell are made only where the search looks). heur = null (none), {hmin} (octile
// distance x the smallest factor) or {arr} (a per-cell lower bound of the cost to the target, e.g. an exact distance
// field of the unperturbed costs). Returns {dist, back}.
// tk: optional ticker step, called with 4096 per 4096 cells settled
function search(C, w, h, cell, starts, target, heur, lazy, tk) {
  let pops = 0;
  const n = w * h, dist = new Float64Array(n).fill(Infinity), back = new Uint8Array(n), done = new Uint8Array(n);
  const heap = Heap(), kv = [0];
  const ti = target >= 0 ? target % w : 0, tj = target >= 0 ? (target - ti) / w : 0;
  const hmin = heur && heur.hmin > 0 ? heur.hmin : 0, harr = heur && heur.arr ? heur.arr : null, wt = heur && heur.wt > 0 ? heur.wt : 1;
  const hfun = k => {
    if (target < 0) return 0;
    if (harr) { const v = harr[k]; return v >= 0 ? v * wt : 0; }
    if (!hmin) return 0;
    const i = k % w, j = (k - i) / w, dx = Math.abs(i - ti), dy = Math.abs(j - tj);
    return (Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy)) * cell * hmin;
  };
  const val = k => { const v = C[k]; return v === v ? v : lazy(k); };
  for (const s of starts) { if (dist[s] !== 0) { dist[s] = 0; heap.push(hfun(s), s); } }
  while (heap.size) {
    const k = heap.pop(kv);
    if (done[k]) continue;
    done[k] = 1;
    if (tk && ++pops === 4096) { pops = 0; tk(4096); }
    if (k === target) break;
    const i = k % w, j = (k - i) / w, d = dist[k], ck = val(k);
    for (let c = 1; c <= 8; c++) {
      const ni = i + DX[c], nj = j + DY[c];
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nk = nj * w + ni;
      if (done[nk]) continue;
      const cn = val(nk);
      if (cn < 0) continue;
      const diag = DX[c] !== 0 && DY[c] !== 0;
      if (diag && (val(k + DX[c]) < 0 || val(k + DY[c] * w) < 0)) continue;
      const nd = d + (diag ? SQ2 * cell : cell) * (ck + cn) * 0.5;
      if (nd < dist[nk]) {
        dist[nk] = nd;
        back[nk] = ((c + 3) & 7) + 1;      // the opposite direction: from nk back to k
        heap.push(nd + hfun(nk), nk);
      }
    }
  }
  return { dist, back };
}

function costField(cost, seeds, o) {
  o = o || {};
  const C = factors(cost), w = cost.w, h = cost.h, n = w * h;
  if (!Array.isArray(seeds)) throw fail('RASTER_ARG', 'seeds must be a list of [x, y], {x, y} or {i, j}');
  const starts = [];
  for (const s of seeds) { const k = cellOf(cost, s); if (k >= 0 && C[k] >= 0 && starts.indexOf(k) < 0) starts.push(k); }
  if (!starts.length) throw fail('RASTER_ARG', 'no seed on an open cell inside the grid');
  // progress over 2 n: the blocked cells at once, the open cells as they are settled (each once at most), the output rows
  const tk = ticker(o, 2 * n);
  let open = 0;
  for (let k0 = 0; k0 < n; k0 += w) { for (let k = k0, e = k0 + w; k < e; k++) if (C[k] >= 0) open++; tk(0); }
  tk(n - open);
  const r = search(C, w, h, cost.cell, starts, -1, null, null, tk);
  const dist = new Float32Array(n);
  for (let j = 0, k = 0; j < h; j++, tk(w)) for (let i = 0; i < w; i++, k++) dist[k] = r.dist[k] === Infinity ? -1 : r.dist[k];
  tk.end();
  const stem = o.name || 'costfield';
  const base = { w, h, cell: cost.cell, ox: cost.ox, oy: cost.oy, sample: cost.sample || 'cell', scale: 1, offset: 0 };
  return {
    dist: Object.assign({ name: stem + '.dist', etype: 'f32', nodata: -1, meta: { unit: 'u x factor' }, data: dist }, base),
    back: Object.assign({ name: stem + '.back', etype: 'u8', nodata: null,
      meta: { codes: ['none', 'e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'] }, data: r.back }, base),
    cost, seeds: starts.slice(),
  };
}

// 32-bit integer hash -> [0, 1)
function hash3(a, b, c) {
  let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
const NOISE_CELLS = 16, NOISE_AMP = 1.0, REUSE = 2, ALT_WEIGHT = 1.5;
function noiseAt(i, j, s) {
  const gi = Math.floor(i / NOISE_CELLS), gj = Math.floor(j / NOISE_CELLS);
  let fx = i / NOISE_CELLS - gi, fy = j / NOISE_CELLS - gj;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash3(gi, gj, s), b = hash3(gi + 1, gj, s), c = hash3(gi, gj + 1, s), d = hash3(gi + 1, gj + 1, s);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function toPts(g, cells) {
  const half = g.sample === 'lattice' ? 0 : 0.5, out = [];
  for (let t = 0; t < cells.length; t++) {
    const k = cells[t], i = k % g.w, j = (k - i) / g.w;
    // straight on: the same index step in and out (steps between 8-neighbours are distinct when w > 2)
    if (g.w > 2 && t > 0 && t < cells.length - 1 && k - cells[t - 1] === cells[t + 1] - k) continue;
    out.push([g.ox + (i + half) * g.cell, g.oy + (j + half) * g.cell]);
  }
  return out;
}

function traceBack(back, w, from, to) {
  const cells = [to];
  let k = to, guard = back.length + 1;
  while (k !== from && guard-- > 0) {
    const c = back[k];
    if (!c) return null;
    const i = k % w + DX[c], j = (k - k % w) / w + DY[c];
    k = j * w + i;
    cells.push(k);
  }
  return k === from ? cells.reverse() : null;
}

// the hash lattice of one noise pass: (gw + 2) x (gh + 2) values, so noise at a cell costs 4 reads, not 4 hashes
function noiseLattice(w, h, s) {
  const gw = Math.floor((w - 1) / NOISE_CELLS) + 2, gh = Math.floor((h - 1) / NOISE_CELLS) + 2, L = new Float64Array(gw * gh);
  for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) L[gj * gw + gi] = hash3(gi, gj, s);
  return { gw, L };
}
// = noiseAt(i, j, s) for i, j >= 0, read from the lattice
function noiseFrom(nl, i, j) {
  const gi = Math.floor(i / NOISE_CELLS), gj = Math.floor(j / NOISE_CELLS);
  let fx = i / NOISE_CELLS - gi, fy = j / NOISE_CELLS - gj;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const L = nl.L, q = gj * nl.gw + gi;
  return (L[q] * (1 - fx) + L[q + 1] * fx) * (1 - fy) + (L[q + nl.gw] * (1 - fx) + L[q + nl.gw + 1] * fx) * fy;
}

// Speed: every further path is a weighted A* search run backwards (from `to` to `from`) whose heuristic is
// ALT_WEIGHT x the exact distance from `from` over the plain factors (cf.dist when `from` is the only seed of cf, else
// one Dijkstra here). The plain distance is a lower bound of the perturbed one (noise >= 0, reuse >= 1); weighted by 1.5
// (the mean perturbed factor) the search is bounded-suboptimal: a further path costs at most 1.5 x the least perturbed
// cost [I]. Exact (weight 1) took 11.3 s for k = 3 corner to corner on a 2400 x 2400 grid, weight 1.5 takes 0.3 s.
// The randomised factors are made only for the cells the search touches.
function paths(cf, from, to, k, seed) {
  if (!cf || !cf.cost || !cf.back || !cf.dist) throw fail('RASTER_ARG', 'paths needs the result of costField');
  k = k == null ? 1 : Number(k);
  seed = seed == null ? 1 : Number(seed);
  if (!Number.isInteger(k) || k < 1 || k > 64) throw fail('RASTER_ARG', 'paths k must be an integer 1..64, got ' + k);
  if (!Number.isInteger(seed)) throw fail('RASTER_ARG', 'paths seed must be an integer, got ' + seed);
  const g = cf.cost, w = g.w, h = g.h, n = w * h, C = factors(g);
  const a = cellOf(g, from), b = cellOf(g, to);
  if (a < 0 || b < 0) throw fail('RASTER_ARG', 'paths from and to must lie inside the grid');
  if (C[a] < 0 || C[b] < 0) return [];
  // the plain distance field from a and path 1
  let H = null, first = null;
  const only = cf.seeds && cf.seeds.length === 1 && cf.seeds[0] === a && cf.dist.data && cf.dist.data.length === n;
  if (only) {
    const D = cf.dist.data;
    H = new Float64Array(n);
    for (let t = 0; t < n; t++) H[t] = D[t] < 0 ? -1 : D[t] * (1 - 1e-6);    // f32 rounding: keep it a lower bound
    first = traceBack(cf.back.data, w, a, b);
  } else {
    const r = search(C, w, h, g.cell, [a], -1, null);
    H = r.dist;
    first = r.dist[b] < Infinity ? traceBack(r.back, w, a, b) : null;
  }
  if (!first) return [];
  const out = [], seen = new Set(), used = new Uint8Array(n);
  const add = cells => {
    const key = cells.join(',');
    if (seen.has(key)) return;
    seen.add(key);
    for (const c of cells) used[c] = 1;
    out.push(toPts(g, cells));
  };
  add(first);
  const P = new Float64Array(n);
  for (let p = 1; out.length < k && p < 4 * k; p++) {
    const nl = noiseLattice(w, h, Math.imul(seed, 7919) + p);
    P.fill(NaN);
    const lazy = t => {
      const c = C[t];
      if (c < 0) return (P[t] = -1);
      const i = t % w, j = (t - i) / w;
      return (P[t] = c * (1 + NOISE_AMP * noiseFrom(nl, i, j)) * (used[t] ? REUSE : 1));
    };
    const r = search(P, w, h, g.cell, [b], a, { arr: H, wt: ALT_WEIGHT }, lazy);
    const back = r.dist[a] < Infinity ? traceBack(r.back, w, b, a) : null;
    if (back) add(back.reverse());
  }
  return out;
}

function run(task, io) {
  const a = (task && task.args) || {};
  const input = task && task.inputs && task.inputs[0];
  if (!input || !task.out) throw fail('RASTER_ARG', 'kcost task needs inputs[0] (a cost grid) and out');
  const cost = io.readGrid(input);
  if (io.progress) io.progress.stage('kcost', 1);
  const cf = costField(cost, a.seeds, { name: a.name });
  io.writeGrid(path.join(task.out, cf.dist.name + '.mvg'), cf.dist);
  io.writeGrid(path.join(task.out, cf.back.name + '.mvg'), cf.back);
  if (io.progress) io.progress.step(1);
  return 0;
}

module.exports = { run, costField, paths, noiseAt, noiseLattice, noiseFrom, hash3 };
