// sketch (MV-PNT3): tree squiggle stamps (design 9: one stamp per tree entity; thumbnail: one per cluster) and forest
// ground with no tree entity (ground type 10, which only GoH maps hold, reaches here through the shared woodMask).
//   clusters(points, link) -> [{x, y, n, uid}]   single link: centroids that chain within `link` u (paint contract
//     open point 7, 200 u = 10 m); one cluster per chain at its mean; sorted by the smallest uid, then x, y
//   squiggle(C, P, frame, x, y, r, seed) -> px points of a closed loopy ring, shape seeded by world position
//   draw(ctx) -> {trees, treeStamps, forestStamps}
// Author: Imperator_Aug (ARSENAL, ia-7b3b7c11)
'use strict';

const LINK = 200;          // u, 10 m: thumbnail cluster link (open point 7)
const FOREST_STEP = 160;   // u, 8 m: lattice of forest stamps on wood ground with no tree entity [I]
const FOREST_CLEAR = 120;  // u, 6 m: a forest stamp is left out this close to a tree entity [I]

function clusters(points, link) {
  const n = points.length, parent = new Int32Array(n);
  for (let k = 0; k < n; k++) parent[k] = k;
  const find = k => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
  // a hash of cells of `link` u: only neighbours in the 3 x 3 block can chain
  const cells = new Map();
  const key = (a, b) => a + ',' + b;
  for (let k = 0; k < n; k++) {
    const p = points[k], a = Math.floor(p.x / link), b = Math.floor(p.y / link), kk = key(a, b);
    if (!cells.has(kk)) cells.set(kk, []);
    cells.get(kk).push(k);
  }
  const l2 = link * link;
  for (let k = 0; k < n; k++) {
    const p = points[k], a = Math.floor(p.x / link), b = Math.floor(p.y / link);
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      const list = cells.get(key(a + da, b + db));
      if (!list) continue;
      for (const m of list) {
        if (m <= k) continue;
        const q = points[m], dx = q.x - p.x, dy = q.y - p.y;
        if (dx * dx + dy * dy <= l2) { const ra = find(k), rb = find(m); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); }
      }
    }
  }
  const acc = new Map();
  for (let k = 0; k < n; k++) {
    const r = find(k), p = points[k];
    let c = acc.get(r);
    if (!c) { c = { sx: 0, sy: 0, n: 0, uid: p.uid }; acc.set(r, c); }
    c.sx += p.x; c.sy += p.y; c.n++;
    if (p.uid < c.uid) c.uid = p.uid;
  }
  const out = [];
  for (const c of acc.values()) out.push({ x: c.sx / c.n, y: c.sy / c.n, n: c.n, uid: c.uid });
  out.sort((a, b) => a.uid - b.uid || a.x - b.x || a.y - b.y);
  return out;
}

// a closed ring of N points: radius r px x (1 + bumps), bump count and phase from a hash of the world position
function squiggle(C, P, frame, x, y, r, seed) {
  const hx = Math.round(x * 4), hy = Math.round(y * 4);
  const h = P.hash(hx, hy, seed + 101) >>> 0;
  const k = 5 + (h % 3), phase = (h >>> 8) / 16777216 * Math.PI * 2;
  const [cx, cy] = C.toPx(frame, x, y);
  const N = r < 4 ? 14 : 22;
  const pts = [];
  for (let t = 0; t < N; t++) {
    const a = t / N * Math.PI * 2;
    const q = 1 + 0.22 * Math.sin(k * a + phase) + 0.08 * (P.hash(hx + t, hy, seed + 103) / 4294967296 - 0.5);
    pts.push([cx + Math.cos(a) * r * q, cy - Math.sin(a) * r * q]);
  }
  return pts;
}

// ctx: {grid, frame, input, opts, pal, C, P, I, seed, step(frac), hasObjects}
function draw(ctx) {
  const { grid, frame, opts, pal, C, P, I, seed } = ctx;
  const col = C.color(pal.tree || pal.graphite);
  const minW = Math.max(1, opts.minStroke || 1);
  const pxU = Math.max(frame.sx, frame.sy);
  const trees = ctx.hasObjects ? I.treePoints(ctx.input) : [];
  let stamps = 0, forest = 0;
  if (opts.thumb) {
    const cl = clusters(trees, LINK);
    for (let k = 0; k < cl.length; k++) {
      const c = cl[k];
      const r = Math.min(9, Math.max(3, 60 / pxU) + Math.sqrt(c.n) * 0.6);
      C.strokePath(ctx.grid, squiggle(C, P, frame, c.x, c.y, r, seed), minW, col, { closed: true, cap: 'round' });
      stamps++;
    }
  } else {
    const r = Math.min(7, Math.max(2.5, 60 / pxU));
    for (let k = 0; k < trees.length; k++) {
      if ((k & 1023) === 0) ctx.step(0.8 * k / Math.max(1, trees.length));
      const t = trees[k];
      C.strokePath(grid, squiggle(C, P, frame, t.x, t.y, r, seed), minW, col, { closed: true, cap: 'round' });
      stamps++;
    }
  }
  // forest ground with no tree entity: stamps on a jittered world lattice where the shared wood mask is set
  if (ctx.wood) {
    const near = new Map();
    for (const t of trees) {
      const kk = Math.floor(t.x / FOREST_CLEAR) + ',' + Math.floor(t.y / FOREST_CLEAR);
      if (!near.has(kk)) near.set(kk, []);
      near.get(kk).push(t);
    }
    const clear = (x, y) => {
      const a = Math.floor(x / FOREST_CLEAR), b = Math.floor(y / FOREST_CLEAR);
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
        const l = near.get((a + da) + ',' + (b + db));
        if (l) for (const t of l) if ((t.x - x) * (t.x - x) + (t.y - y) * (t.y - y) < FOREST_CLEAR * FOREST_CLEAR) return false;
      }
      return true;
    };
    const step = opts.thumb ? FOREST_STEP * 2 : FOREST_STEP;
    const r = opts.thumb ? Math.min(9, Math.max(3, 120 / pxU)) : Math.min(7, Math.max(2.5, 60 / pxU));
    const x1 = frame.x0 + frame.W * frame.sx, y1 = frame.y0 + frame.H * frame.sy;
    for (let j = Math.floor(frame.y0 / step); j < Math.ceil(y1 / step); j++) {
      for (let i = Math.floor(frame.x0 / step); i < Math.ceil(x1 / step); i++) {
        const h = P.hash(i, j, seed + 211) >>> 0;
        const x = (i + 0.5 + 0.5 * (h / 4294967296 - 0.5)) * step, y = (j + 0.5 + 0.5 * ((h & 0xffff) / 65536 - 0.5)) * step;
        const pi = Math.floor((x - frame.x0) / frame.sx), pj = Math.floor((y - frame.y0) / frame.sy);
        if (pi < 0 || pj < 0 || pi >= frame.W || pj >= frame.H || !ctx.wood[pj * frame.W + pi]) continue;
        if (!clear(x, y)) continue;
        C.strokePath(grid, squiggle(C, P, frame, x, y, r, seed), minW, col, { closed: true, cap: 'round' });
        forest++;
      }
    }
  }
  ctx.step(1);
  return { trees: trees.length, treeStamps: stamps, forestStamps: forest };
}

module.exports = { LINK, FOREST_STEP, FOREST_CLEAR, clusters, squiggle, draw };
