// sketch (MV-PNT3): crest lines (design 9): ridge and peak cells of raster's landform class at the larger radius
// (landform.r50, 1 m cells), thinned to centre lines (Zhang-Suen), traced as the longest path of each piece (repeated on
// what is left, so a long branch is kept as its own line), kept when at least 10 m long. Not MV-STR's masking crests.
// Lines are found on the landform grid in world units, so every picture size draws the same lines.
//   lines(lf, o?) -> [{pts:[[x,y]..] (world u, cell centres, simplified), lenM}]   o = {minM (10), codes ([1, 4]), tick(frac 0..1)}
// o.tick is called every TICK_OPS units of work (thinning visits, sweep pops, piece cells), so a cancel gets in on a
// big map (paint contract 4.3); a throw from it ends lines().
// Author: Imperator_Aug (ARSENAL, ia-91a2bd48)
'use strict';

const MIN_M = 10;
const UPM = 20;
const TICK_OPS = 32768;

// work counter: poke(n, frac) adds n units and calls tick(frac) each TICK_OPS units
function counter(tick) {
  let ops = 0;
  return (n, frac) => { if (!tick) return; ops += n; if (ops >= TICK_OPS) { ops = 0; tick(frac); } };
}

function thin(m, w, h, poke) {
  poke = poke || (() => {});
  // Zhang-Suen on a 0/1 mask, in place; only pixels still set are visited
  let list = [];
  for (let k = 0; k < m.length; k++) if (m[k]) list.push(k);
  const nb = k => {
    const i = k % w, j = (k - i) / w;
    const g = (di, dj) => { const a = i + di, b = j + dj; return a >= 0 && b >= 0 && a < w && b < h ? m[b * w + a] : 0; };
    // P2..P9 clockwise from north (north = +j here; the rule is symmetric under the flip)
    return [g(0, 1), g(1, 1), g(1, 0), g(1, -1), g(0, -1), g(-1, -1), g(-1, 0), g(-1, 1)];
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del = [];
      for (const k of list) {
        poke(1, 0);
        if (!m[k]) continue;
        const p = nb(k);
        let B = 0, A = 0;
        for (let t = 0; t < 8; t++) { B += p[t]; if (!p[t] && p[(t + 1) % 8]) A++; }
        if (B < 2 || B > 6 || A !== 1) continue;
        if (pass === 0 ? (p[0] * p[2] * p[4] === 0 && p[2] * p[4] * p[6] === 0) : (p[0] * p[2] * p[6] === 0 && p[0] * p[4] * p[6] === 0)) del.push(k);
      }
      for (const k of del) m[k] = 0;
      if (del.length) changed = true;
    }
    list = list.filter(k => m[k]);
  }
  return list;
}

const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

// farthest pixel (by step length, diagonal sqrt 2) from `start` inside `set`; returns {far, dist, prev}
function sweep(start, set, w, poke) {
  const dist = new Map([[start, 0]]), prev = new Map([[start, -1]]);
  // Dijkstra on a sparse set; queue as a sorted array is fine for line-shaped sets (few pixels in the front)
  const q = [[0, start]];
  let far = start, fd = 0;
  while (q.length) {
    let bi = 0;
    for (let t = 1; t < q.length; t++) if (q[t][0] < q[bi][0] || (q[t][0] === q[bi][0] && q[t][1] < q[bi][1])) bi = t;
    if (poke) poke(1 + (q.length >> 4), null);
    const [dk, k] = q[bi];
    q[bi] = q[q.length - 1]; q.pop();
    if (dk > dist.get(k)) continue;
    if (dk > fd || (dk === fd && k < far)) { fd = dk; far = k; }
    const i = k % w, j = (k - i) / w;
    for (const [di, dj] of D8) {
      const n = (j + dj) * w + (i + di);
      if (i + di < 0 || i + di >= w || !set.has(n)) continue;
      const nd = dk + (di && dj ? Math.SQRT2 : 1);
      if (!dist.has(n) || nd < dist.get(n) - 1e-12) { dist.set(n, nd); prev.set(n, k); q.push([nd, n]); }
    }
  }
  return { far, dist: fd, prev };
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const L = Math.hypot(bx - ax, by - ay);
    let best = -1, bd = tol;
    for (let k = a + 1; k < b; k++) {
      const d = L > 0 ? Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L : Math.hypot(pts[k][0] - ax, pts[k][1] - ay);
      if (d > bd) { bd = d; best = k; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((p, k) => keep[k]);
}

function lines(lf, o) {
  o = o || {};
  const minM = o.minM === undefined ? MIN_M : o.minM;
  const codes = o.codes || [1, 4];
  const w = lf.w, h = lf.h, cell = lf.cell, d = lf.data;
  const m = new Uint8Array(w * h);
  for (let k = 0; k < m.length; k++) if (codes.includes(d[k])) m[k] = 1;
  const tick = typeof o.tick === 'function' ? o.tick : null;
  let frac = 0;
  const poke = counter(tick ? (f => tick(f === null ? frac : f)) : null);
  const skel = thin(m, w, h, n => poke(n, 0));
  const total = Math.max(1, skel.length);
  let gone = 0;
  const left = new Set(skel);
  const out = [];
  const toM = cell / UPM;
  // pieces: 8-connected components of the skeleton, in index order
  skel.sort((a, b) => a - b);
  for (const s of skel) {
    if (!left.has(s)) continue;
    // component of s
    const comp = new Set([s]), st = [s];
    while (st.length) {
      const k = st.pop(), i = k % w, j = (k - i) / w;
      for (const [di, dj] of D8) {
        const n = (j + dj) * w + (i + di);
        if (i + di < 0 || i + di >= w || !left.has(n) || comp.has(n)) continue;
        comp.add(n); st.push(n);
      }
    }
    for (const k of comp) left.delete(k);
    gone += comp.size;
    poke(comp.size, null);
    frac = 0.3 + 0.7 * (gone - comp.size) / total;
    // longest paths, repeated on what is left of the piece
    const todo = [comp];
    while (todo.length) {
      const set = todo.pop();
      if (set.size * Math.SQRT2 * toM < minM) continue;
      let s0 = Infinity;
      for (const k of set) if (k < s0) s0 = k;
      const a = sweep(s0, set, w, poke).far;
      const b = sweep(a, set, w, poke);
      if (b.dist * toM < minM) continue;
      const path = [];
      for (let k = b.far; k !== -1; k = b.prev.get(k)) path.push(k);
      for (const k of path) set.delete(k);
      const pts = path.map(k => { const i = k % w, j = (k - i) / w; return [lf.ox + (i + 0.5) * cell, lf.oy + (j + 0.5) * cell]; });
      out.push({ pts: simplify(pts, 0.75 * cell), lenM: Math.round(b.dist * toM * 10) / 10 });
      // what is left splits into pieces again
      const rest = new Set(set);
      while (rest.size) {
        let r0 = Infinity;
        for (const k of rest) if (k < r0) r0 = k;
        const c = new Set([r0]), q = [r0];
        while (q.length) {
          const k = q.pop(), i = k % w, j = (k - i) / w;
          for (const [di, dj] of D8) {
            const n = (j + dj) * w + (i + di);
            if (i + di < 0 || i + di >= w || !rest.has(n) || c.has(n)) continue;
            c.add(n); q.push(n);
          }
        }
        for (const k of c) rest.delete(k);
        todo.push(c);
      }
    }
  }
  // stable order: longest first, then first point
  out.sort((p, q) => q.lenM - p.lenM || p.pts[0][0] - q.pts[0][0] || p.pts[0][1] - q.pts[0][1]);
  return out;
}

// ctx: {grid, frame, input, opts, pal, C, step(frac)}
function draw(ctx, list) {
  const { grid, frame, opts, pal, C } = ctx;
  const col = C.color(pal.crest || pal.graphite);
  const k = opts.thumb ? 1.5 : 1;
  const dash = (pal.crestDash || [6, 3, 1, 3]).map(v => v * k);
  const w = Math.max(opts.minStroke || 1, opts.thumb ? 2 : 1.5);
  for (const l of list) {
    let px = l.pts.map(p => C.toPx(frame, p[0], p[1]));
    if (typeof C.wobble === 'function' && px.length > 2) px = C.wobble(px, { amp: 0.6, wave: 24, seed: ctx.seed, frame });
    C.strokePath(grid, px, w, col, { dash, cap: 'butt' });
  }
  ctx.step(1);
  return list.length;
}

module.exports = { MIN_M, lines, draw, thin, simplify };
