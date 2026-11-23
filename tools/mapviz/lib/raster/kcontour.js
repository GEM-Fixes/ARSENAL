// kcontour: contour lines of a height grid and its pool kernel (tools/mapviz/README.md sections 1.2, 1.5, 5.3; design 3).
// Self-contained: node built-ins only, no relative require (README 1.5).
//   contourInterval(height) -> metres     0.5, 1, 2 or 5: the smallest that gives at most MAX_LEVELS lines over the relief,
//        relief = 99.5th - 0.5th percentile of the heights (a lone pit or spike does not set the interval) [I]
//   contours(height, o?) -> {interval, lines:[{level, index, pts}], labels:[{x, y, level, angle}]}
//        o = {interval (m), simplify (u, default 0.2 cell), labels (default true)}. Marching squares on the lattice with
//        linear interpolation; a corner >= the level is above it; saddles by the cell's mean. Lines are joined into
//        polylines that are closed (last point = first) or run from map edge to map edge (or to a nodata hole), with the
//        higher ground on the left. A one-cell-wide crest exactly on a level is drawn once: a chain equal to another
//        reversed is dropped, and so is a chain that retraces itself (no area, every segment run once each way). level in m; pts, x, y in world u (0.1 u); index = every fifth level (level / interval a
//        multiple of 5). Labels sit on index lines where the line is straight over a window, spaced along the line and
//        apart from each other; angle in degrees counter-clockwise from +x in the world frame, kept in (-90, 90] so text
//        reads upright with north up. Never baked into a picture: the page draws contours.json. o.tick(done, total):
//        optional progress hook, at least every 100 ms of work and once at the end (README 7).
//   vector(result) -> {v:1, kind:'vector', name:'contours', items}   the contours.json product (README 5.3)
//   run(task, io) -> exit code    kernel: task.inputs[0] = height.mvg, task.args = {interval?}; writes <task.out>/contours.json
// Author: Imperator_Aug (ARSENAL, ia-3b24866a)
'use strict';
const fs = require('fs'), path = require('path');

const INTERVALS = [0.5, 1, 2, 5];
const MAX_LEVELS = 30;
const NUMERIC = { u8: 1, i8: 1, u16: 1, i16: 1, u32: 1, i32: 1, f32: 1 };

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

// tk: optional ticker step, poked (no count) once per row
function values(g, what, tk) {
  if (!g || typeof g !== 'object' || !g.data || typeof g.data.length !== 'number') throw fail('RASTER_GRID', what + ' is not a grid object');
  if (!NUMERIC[g.etype]) throw fail('RASTER_ETYPE', what + ' must be a numeric grid, not etype ' + g.etype);
  if (!(Number.isInteger(g.w) && Number.isInteger(g.h) && g.w > 0 && g.h > 0) || g.data.length !== g.w * g.h) throw fail('RASTER_GRID', what + ' size and data differ');
  if (!(g.cell > 0)) throw fail('RASTER_GRID', what + ' cell must be > 0');
  if (g.sample !== 'lattice') throw fail('RASTER_SAMPLE', what + ' must have lattice samples, not ' + g.sample);
  const n = g.w * g.h, d = g.data, out = new Float64Array(n), w = g.w;
  const sc = g.scale == null ? 1 : g.scale, of = g.offset == null ? 0 : g.offset, nd = g.nodata == null ? null : g.nodata;
  for (let k0 = 0; k0 < n; k0 += w) {
    if (tk) tk(0);
    for (let k = k0, e = k0 + w; k < e; k++) {
      const v = d[k];
      if (v !== v) throw fail('RASTER_NAN', what + ' holds NaN at column ' + (k % g.w) + ', row ' + ((k / g.w) | 0));
      out[k] = nd !== null && v === nd ? NaN : v * sc + of;
    }
  }
  return out;
}
const upmOf = g => (g.meta && g.meta.upm > 0 ? g.meta.upm : 20);

// p-th quantile (0..1) of the valid values; a deterministic stride sample of at most 2^20 values
function quantiles(H, ps) {
  const n = H.length, step = Math.max(1, Math.floor(n / (1 << 20)));
  const s = [];
  for (let k = 0; k < n; k += step) if (H[k] === H[k]) s.push(H[k]);
  if (!s.length) return ps.map(() => NaN);
  const a = Float64Array.from(s).sort();
  return ps.map(p => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))]);
}

function intervalFor(reliefM) {
  for (const iv of INTERVALS) if (reliefM / iv <= MAX_LEVELS) return iv;
  return INTERVALS[INTERVALS.length - 1];
}
function contourInterval(height) { return intervalOf(values(height, 'height'), upmOf(height)); }
function intervalOf(H, upm) {
  const q = quantiles(H, [0.005, 0.995]);
  const relief = q[0] === q[0] ? (q[1] - q[0]) / upm : 0;
  return intervalFor(relief);
}

// ---------------------------------------------------------------- marching squares
// edge ids: horizontal edge (i,j)-(i+1,j) = 2*(j*w+i); vertical edge (i,j)-(i,j+1) = 2*(j*w+i)+1
// cell edges in counter-clockwise order: e0 south, e1 east, e2 north, e3 west; corners v0 SW, v1 SE, v2 NE, v3 NW.
function trace(H, w, h, levelsU, tk) {
  // per level: Map start edge -> end edge
  const nl = levelsU.length, next = [];
  for (let t = 0; t < nl; t++) next.push(new Map());
  if (!nl) return next;
  const L0 = levelsU.length ? levelsU[0] : 0, IV = levelsU.length > 1 ? levelsU[1] - levelsU[0] : 1;
  const e = new Int32Array(4), bin = new Uint8Array(4), vv = new Float64Array(4);
  for (let j = 0; j < h - 1; j++) {
    if (tk) tk();
    for (let i = 0; i < w - 1; i++) {
      const k = j * w + i;
      const v0 = H[k], v1 = H[k + 1], v2 = H[k + w + 1], v3 = H[k + w];
      if (!(v0 === v0 && v1 === v1 && v2 === v2 && v3 === v3)) continue;
      let lo = v0, hi = v0;
      if (v1 < lo) lo = v1; if (v1 > hi) hi = v1; if (v2 < lo) lo = v2; if (v2 > hi) hi = v2; if (v3 < lo) lo = v3; if (v3 > hi) hi = v3;
      if (lo === hi) continue;
      // levels L with lo < L <= hi
      let t0 = Math.floor((lo - L0) / IV) + 1, t1 = Math.floor((hi - L0) / IV);
      if (t0 < 0) t0 = 0;
      if (t1 > nl - 1) t1 = nl - 1;
      while (t0 > 0 && levelsU[t0 - 1] > lo) t0--;
      while (t0 <= t1 && levelsU[t0] <= lo) t0++;
      while (t1 < nl - 1 && levelsU[t1 + 1] <= hi) t1++;
      while (t1 >= t0 && levelsU[t1] > hi) t1--;
      if (t0 > t1) continue;
      e[0] = 2 * k; e[1] = 2 * (k + 1) + 1; e[2] = 2 * (k + w); e[3] = 2 * k + 1;
      vv[0] = v0; vv[1] = v1; vv[2] = v2; vv[3] = v3;
      for (let t = t0; t <= t1; t++) {
        const L = levelsU[t], m = next[t];
        for (let c = 0; c < 4; c++) bin[c] = vv[c] >= L ? 1 : 0;
        // CCW edge c runs corner c -> corner c+1; in->out edges start a segment, out->in edges end one
        const outs = [], ins = [];
        for (let c = 0; c < 4; c++) {
          const a = bin[c], b = bin[(c + 1) & 3];
          if (a && !b) outs.push(c); else if (!a && b) ins.push(c);
        }
        if (outs.length === 1) { m.set(e[outs[0]], e[ins[0]]); continue; }
        // saddle: high connected through the centre -> pair with the next out->in edge counter-clockwise, else clockwise
        const highJoined = (v0 + v1 + v2 + v3) / 4 >= L;
        for (const s of outs) {
          let pick = -1;
          for (let d = 1; d < 4; d++) {
            const c = highJoined ? (s + d) & 3 : (s - d + 4) & 3;
            if (ins.indexOf(c) >= 0) { pick = c; break; }
          }
          m.set(e[s], e[pick]);
        }
      }
    }
  }
  return next;
}

function edgePoint(H, w, ox, oy, cell, id, L) {
  const c = id >> 1, i = c % w, j = (c - i) / w;
  const a = H[c], b = (id & 1) ? H[c + w] : H[c + 1];
  const t = (L - a) / (b - a);
  return (id & 1) ? [ox + i * cell, oy + (j + t) * cell] : [ox + (i + t) * cell, oy + j * cell];
}

function chains(m) {
  const ends = new Set(m.values());
  const starts = Array.from(m.keys()).sort((a, b) => a - b);
  const used = new Set(), out = [];
  const walk = (s, closed) => {
    const ids = [s];
    let cur = s;
    used.add(s);
    for (;;) {
      const nx = m.get(cur);
      if (nx === undefined) break;
      ids.push(nx);
      if (nx === s) break;
      if (used.has(nx)) break;
      used.add(nx);
      cur = nx;
    }
    out.push({ ids, closed: ids.length > 2 && ids[ids.length - 1] === s });
  };
  for (const s of starts) if (!ends.has(s) && !used.has(s)) walk(s, false);
  for (const s of starts) if (!used.has(s)) walk(s, true);
  return out;
}

// a = b reversed, point for point
function sameReversed(a, b) {
  const n = a.length;
  if (b.length !== n) return false;
  for (let k = 0; k < n; k++) if (a[k][0] !== b[n - 1 - k][0] || a[k][1] !== b[n - 1 - k][1]) return false;
  return true;
}

// a chain that starts and ends on one point, encloses no area and runs every segment once each way (a crest inside
// the map traced up one side and back down the other)
function retraces(raw, cell) {
  const n = raw.length, a = raw[0], b = raw[n - 1];
  if (n < 3 || a[0] !== b[0] || a[1] !== b[1]) return false;
  let ar = 0;
  for (let k = 0; k + 1 < n; k++) ar += raw[k][0] * raw[k + 1][1] - raw[k + 1][0] * raw[k][1];
  if (Math.abs(ar / 2) > 0.01 * cell * cell) return false;
  const seg = new Map();
  for (let k = 0; k + 1 < n; k++) {
    const p = raw[k], q = raw[k + 1], key = p[0] + ',' + p[1] + '>' + q[0] + ',' + q[1];
    seg.set(key, (seg.get(key) || 0) + 1);
  }
  for (const [key, c] of seg) {
    const i = key.indexOf('>');
    if (seg.get(key.slice(i + 1) + '>' + key.slice(0, i)) !== c) return false;
  }
  return true;
}

// Douglas-Peucker, iterative; keeps the first and last point
function simplify(pts, tol) {
  const n = pts.length;
  if (n < 3 || !(tol > 0)) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]], t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L2 = dx * dx + dy * dy;
    let best = -1, bd = t2;
    for (let k = a + 1; k < b; k++) {
      const px = pts[k][0] - ax, py = pts[k][1] - ay;
      let d2;
      if (L2 === 0) d2 = px * px + py * py;
      else { const cr = px * dy - py * dx; d2 = cr * cr / L2; }
      if (d2 > bd) { bd = d2; best = k; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(pts[k]);
  return out;
}

const r1 = v => Math.round(v * 10) / 10;

// point and chord at arc position s along pts with cumulative lengths cum
function pointAt(pts, cum, s) {
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const seg = cum[hi] - cum[lo], t = seg > 0 ? (s - cum[lo]) / seg : 0;
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t, lo, hi];
}

function placeLabels(lines, cell, upm, out, tk) {
  const hw = Math.max(6 * upm, 4 * cell);           // half the straight window, u
  const gap = 100 * upm, apart = 30 * upm;           // along one line; between any two labels
  for (const ln of lines) {
    if (tk) tk(0);
    if (!ln.index) continue;
    const pts = ln.raw, n = pts.length;
    if (n < 2) continue;
    const cum = new Float64Array(n);
    for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const total = cum[n - 1];
    if (total < 4 * hw) continue;
    let last = -Infinity;
    for (let s = 2 * hw; s <= total - 2 * hw; s += hw / 2) {
      if (s - last < gap) continue;
      const A = pointAt(pts, cum, s - hw), B = pointAt(pts, cum, s + hw), P = pointAt(pts, cum, s);
      const dx = B[0] - A[0], dy = B[1] - A[1], chord = Math.hypot(dx, dy);
      if (chord < 0.97 * 2 * hw) continue;
      let dev = 0;
      for (let k = A[3]; k <= B[2]; k++) {
        const d = Math.abs((pts[k][0] - A[0]) * dy - (pts[k][1] - A[1]) * dx) / chord;
        if (d > dev) dev = d;
      }
      if (dev > 0.1 * hw) continue;
      const x = r1(P[0]), y = r1(P[1]);
      let clash = false;
      for (const o of out) if (Math.hypot(o.x - x, o.y - y) < apart) { clash = true; break; }
      if (clash) continue;
      let ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
      out.push({ x, y, level: ln.level, angle: r1(ang) });
      last = s;
    }
  }
  return out;
}

function contours(height, o) {
  o = o || {};
  // progress: the rows of the trace, one step per level (at most MAX_LEVELS when the interval is automatic, counted as
  // such), one for the labels and one for the simplify; the reads before and the lines inside the last two poke it
  const tk = ticker(o, ((height && height.h) - 1) + MAX_LEVELS + 2);
  const H = values(height, 'height', tk);
  const w = height.w, h = height.h, cell = height.cell, upm = upmOf(height);
  const interval = o.interval == null ? intervalOf(H, upm) : Number(o.interval);
  if (!(interval > 0) || !Number.isFinite(interval)) throw fail('RASTER_ARG', 'contour interval must be a number > 0 m, got ' + o.interval);
  tk(0);
  const tol = o.simplify == null ? 0.2 * cell : Number(o.simplify);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < H.length; k++) { const v = H[k]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  tk(0);
  const ivU = interval * upm, ks = [];
  if (lo < hi) {
    const k0 = Math.floor(lo / ivU) + 1, k1 = Math.floor(hi / ivU);
    if (k1 - k0 > 100000) throw fail('RASTER_ARG', 'contour interval ' + interval + ' m gives over 100000 levels');
    for (let k = k0; k <= k1; k++) if (k * ivU > lo && k * ivU <= hi) ks.push(k);
  }
  const levelsU = ks.map(k => k * ivU);
  const nexts = trace(H, w, h, levelsU, tk);
  const lines = [];
  const lvlStep = ks.length > MAX_LEVELS ? MAX_LEVELS / ks.length : 1;
  for (let t = 0; t < ks.length; t++) {
    tk(lvlStep);
    const L = levelsU[t], level = ks[t] * interval, index = ks[t] % 5 === 0;
    const kept = new Map();                                // "first|last" point key -> raw lists kept at this level
    for (const ch of chains(nexts[t])) {
      const raw = [];
      for (const id of ch.ids) {
        const p = edgePoint(H, w, height.ox, height.oy, cell, id, L);
        const q = raw[raw.length - 1];
        if (!q || q[0] !== p[0] || q[1] !== p[1]) raw.push(p);
      }
      if (raw.length < 2) continue;
      // a one-cell-wide crest exactly on the level is a zero-width above-region: the cells on both sides trace a line
      // along it, so it comes out twice (one chain and the same points reversed) or as one chain that retraces itself
      if (retraces(raw, cell)) continue;
      const a = raw[0], b = raw[raw.length - 1];
      const rev = kept.get(b[0] + ',' + b[1] + '|' + a[0] + ',' + a[1]);
      if (rev && rev.some(o => sameReversed(o, raw))) continue;
      const key = a[0] + ',' + a[1] + '|' + b[0] + ',' + b[1];
      if (kept.has(key)) kept.get(key).push(raw); else kept.set(key, [raw]);
      lines.push({ level, index, raw });
    }
  }
  const labels = o.labels === false ? [] : placeLabels(lines, cell, upm, [], tk);
  tk();
  const outLines = lines.map(l => {
    tk(0);
    const s = simplify(l.raw, tol).map(p => [r1(p[0]), r1(p[1])]);
    const pts = [];
    for (const p of s) { const q = pts[pts.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p); }
    return { level: l.level, index: l.index, pts };
  }).filter(l => l.pts.length >= 2);
  tk.end();
  return { interval, lines: outLines, labels };
}

function vector(res) {
  const items = [];
  for (const l of res.lines) items.push({ kind: 'contour', level: l.level, index: l.index, pts: l.pts });
  for (const b of res.labels) items.push({ kind: 'contourLabel', level: b.level, x: b.x, y: b.y, angle: b.angle });
  return { v: 1, kind: 'vector', name: 'contours', items };
}

function run(task, io) {
  const a = (task && task.args) || {};
  const input = task && task.inputs && task.inputs[0];
  if (!input || !task.out) throw fail('RASTER_ARG', 'kcontour task needs inputs[0] (height.mvg) and out');
  const height = io.readGrid(input);
  if (io.progress) io.progress.stage('kcontour', 1);
  const res = contours(height, { interval: a.interval });
  fs.mkdirSync(task.out, { recursive: true });
  const file = path.join(task.out, 'contours.json'), tmp = file + '.tmp' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(vector(res)) + '\n');
  fs.renameSync(tmp, file);
  if (io.progress) io.progress.step(1);
  return 0;
}

module.exports = { run, contours, contourInterval, intervalFor, vector, simplify, INTERVALS, MAX_LEVELS };
