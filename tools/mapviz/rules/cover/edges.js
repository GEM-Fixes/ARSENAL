// cover edges (MV-COV): stage A of design 5.4 and the helpers the other cover files share (rules.md 4 of waves C and D).
//   U the engine's cover measures in world units [V]
//   edges(doc, catalog, objects, o?) -> items of cover.edges.json (coverEdge, coverRing, coverSector)
//   geometry: ccw, inPoly, clipConvex, segsCross (SegmentsCross port), segHitsPoly, distToPoly, fpShape
//   grids: frameOf, latticeH, groundAt, typeAt, bandAt, cellOf
// Stage A shows an edge of an object's footprint when the object has a bullet volume (entry.cover.hard), its band is not
// none, it has no tag nocover and the engine's edge walk can lay a cover on it: an edge >= 0.4 m whose single run of
// probes is wider than 0.4 m. A 0.6 m edge gives a run of 0.325 m: no cover, no edge.
// Author: Imperator_Aug (ARSENAL, ia-779439ed)
'use strict';

const UPM = 20;
//  (all x g_unitsPerMeter) and the file-scope values of [V]
const U = {
  near: 0.6 * UPM, gap: 0.1 * UPM, placeStep: 0.7 * UPM, placeRadius: 0.3 * UPM, shortReach: 0.35 * UPM,
  rowStep: 0.7 * UPM * 1.7320508 * 0.5,
  high: 1.64 * UPM, mid: 1.31 * UPM, kneel: 1.26 * UPM, low: 0.7 * UPM, lying: 0.3 * UPM,
  probeRadius: 0.4 * UPM, wallReach: 0.85 * UPM, threatFar: 1.35 * UPM, threatNear: 0.45 * UPM,
  wallMargin: 1.5 * UPM, climb: 1.05 * UPM, meter: UPM,
  probeStep: 0.1 * UPM, probeReach: 0.5 * UPM, gapTol: 0.1 * UPM, minWall: 0.4 * UPM,
};
// Measure's seven heights, lowest first
U.levels = [U.lying, U.probeRadius, U.low, U.wallReach, U.kneel, U.threatFar, U.high];
const BANDS = ['none', 'lie', 'low', 'kneel', 'squat', 'stand'];   // = entcat BANDS
const BAND_M = [0.3, 0.4, 0.85, 1.35, 1.64];                        // design 5.4 band table
const OBSTACLE_FP = new Set(['obb', 'circle', 'poly', 'fit']);       // footprint kinds that are obstacle zones
const r2 = x => Math.round(x * 100) / 100;
const r3 = x => Math.round(x * 1000) / 1000;
const lc = s => String(s == null ? '' : s).toLowerCase();

function bandOfM(m) {
  if (!(m >= BAND_M[0])) return 0;
  let b = 1;
  for (let i = 1; i < BAND_M.length; i++) if (m >= BAND_M[i]) b = i + 1;
  return b;
}

// ---------------------------------------------------------------- geometry
function area2(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) { const q = p[i], r = p[(i + 1) % n]; a += q[0] * r[1] - r[0] * q[1]; }
  return a;
}
// counter-clockwise copy with repeated closing points dropped
function ccw(pts) {
  const p = [];
  for (const q of pts || []) {
    if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
    const l = p[p.length - 1];
    if (l && Math.abs(l[0] - q[0]) < 1e-9 && Math.abs(l[1] - q[1]) < 1e-9) continue;
    p.push([q[0], q[1]]);
  }
  if (p.length > 1 && Math.abs(p[0][0] - p[p.length - 1][0]) < 1e-9 && Math.abs(p[0][1] - p[p.length - 1][1]) < 1e-9) p.pop();
  return area2(p) < 0 ? p.reverse() : p;
}
function inPoly(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
// Cyrus-Beck: the part [t0, t1] of segment p0->p1 inside a convex counter-clockwise polygon, or null
function clipConvex(h, p0, p1) {
  if (h.length < 3) return null;
  let t0 = 0, t1 = 1;
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const nx = -(b[1] - a[1]), ny = b[0] - a[0];             // inward normal of a CCW edge
    const num = nx * (p0[0] - a[0]) + ny * (p0[1] - a[1]);   // >= 0 inside
    const den = nx * dx + ny * dy;
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
    if (t0 > t1) return null;
  }
  return [t0, t1];
}
// SegmentsCross [V]
function segsCross(a0, a1, b0, b1) {
  const e = 1e-5;
  const ax = b1[0] - b0[0], ay = b1[1] - b0[1];       // across
  const lx = a1[0] - a0[0], ly = a1[1] - a0[1];       // along
  const ox = a0[0] - b0[0], oy = a0[1] - b0[1];       // offset
  const den = ay * lx - ax * ly;
  if (e > Math.abs(den)) return false;
  if (e > Math.abs(ax) && e > Math.abs(ay)) return false;
  const t = (oy * ax - ox * ay) / den;
  if (!(t >= 0 && t <= 1)) return false;
  const u = e > Math.abs(ax) ? (t * ly + oy) / ay : (t * lx + ox) / ax;
  return u >= 0 && u <= 1;
}
// does segment p0->p1 touch polygon p (any shape)
function segHitsPoly(p, p0, p1) {
  if (!p || p.length < 2) return false;
  if (p.length >= 3 && (inPoly(p, p0[0], p0[1]) || inPoly(p, p1[0], p1[1]))) return true;
  for (let i = 0; i < p.length; i++) if (segsCross(p0, p1, p[i], p[(i + 1) % p.length])) return true;
  return false;
}
function distSeg(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L > 0 ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
function distToPoly(p, x, y) {
  if (p.length >= 3 && inPoly(p, x, y)) return 0;
  let d = Infinity;
  for (let i = 0; i < p.length; i++) d = Math.min(d, distSeg(x, y, p[i], p[(i + 1) % p.length]));
  return d;
}
function aabb(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
// an object's footprint as the cover scan walks it: a circle (centre, radius) or a counter-clockwise polygon; null when
// the object has no obstacle zone (box-proj, decal, none)
function fpShape(o) {
  const fp = o && o.fp;
  if (!fp || !OBSTACLE_FP.has(fp.kind) || !Array.isArray(fp.pts) || fp.pts.length < 3) return null;
  const pts = ccw(fp.pts);
  if (pts.length < 3 || Math.abs(area2(pts)) < 1e-9) return null;
  if (fp.kind === 'circle') {
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x; cy += y; }
    cx /= pts.length; cy /= pts.length;
    let r = 0;
    for (const [x, y] of pts) r += Math.hypot(x - cx, y - cy);
    return { kind: 'circle', c: [cx, cy], r: r / pts.length, pts, box: aabb(pts) };
  }
  return { kind: 'poly', pts, box: aabb(pts) };
}

// ---------------------------------------------------------------- grids (README 4.2, 4.3)
function frameOf(grids) {
  const g = (grids && (grids.gtype || grids.height)) || null;
  if (!g) return null;
  return { w: g.w, h: g.h, cell: g.cell, ox: g.ox, oy: g.oy };
}
function cellOf(f, x, y) {
  const i = Math.floor((x - f.ox) / f.cell), j = Math.floor((y - f.oy) / f.cell);
  return i < 0 || j < 0 || i >= f.w || j >= f.h ? null : { i, j };
}
// the lattice height at point (i, j) in u, null outside or nodata
function latticeH(g, i, j) {
  if (!g || i < 0 || j < 0 || i >= g.w || j >= g.h) return null;
  const v = g.data[j * g.w + i];
  if (g.nodata !== null && g.nodata !== undefined && v === g.nodata) return null;
  return v * (g.scale === undefined ? 1 : g.scale) + (g.offset || 0);
}
let heightAtFn = null;
function groundAt(g, x, y) {
  if (!g) return null;
  if (!heightAtFn) heightAtFn = require('../../lib/mapkit').heightAt;
  const h = heightAtFn(g, x, y);
  return h === null || !Number.isFinite(h) ? null : h;
}
function cellVal(g, x, y) {
  if (!g) return null;
  const i = Math.floor((x - g.ox) / g.cell), j = Math.floor((y - g.oy) / g.cell);
  if (i < 0 || j < 0 || i >= g.w || j >= g.h) return null;
  return g.data[j * g.w + i];
}
const typeAt = (grids, x, y) => cellVal(grids && grids.gtype, x, y);
const bandAt = (grids, x, y) => cellVal(grids && (grids.band || grids['water.band']), x, y);

// ---------------------------------------------------------------- stage A
// the width of a uniform run of probes on an edge of length len (u): AddEdge's probe walk and RefineRunEnd when every
// probe reads the same
function uniformRunWidth(len) {
  const usable = len - U.probeStep * 2;
  let steps = Math.floor(usable / U.probeReach);
  if (steps <= 1) steps = 1;
  const stepGap = steps >= 2 ? (usable - steps * U.probeReach) / (steps - 1) : 0;
  let along = U.probeStep, to = along;
  for (let s = steps; s > 0; s--) { along += U.probeReach * 0.5; to = along; along += U.probeReach * 0.5 + stepGap; }
  let upper = len - U.probeStep;
  while (upper - to > U.gapTol) to = (upper + to) * 0.5;   // every probe reads the same type
  return to - U.probeStep;
}
const circleSteps = r => Math.floor(r * 2 * Math.PI / U.placeStep);

// the height factor of a placed object against its def (place() zMin/zMax carry the entity scale)
function scaleOf(o, en) {
  if (en && en.box && Number.isFinite(o.zMax) && Number.isFinite(o.zMin)) {
    const dz = en.box.max[2] - en.box.min[2];
    if (dz > 1e-9) return (o.zMax - o.zMin) / dz;
  }
  return 1;
}
function nocover(en) { return !!(en && Array.isArray(en.props) && en.props.some(p => lc(p) === 'nocover')); }

function sortItems(items) {
  const key = it => [it.uid === null || it.uid === undefined ? -1 : it.uid, it.a ? it.a[0] : it.x, it.a ? it.a[1] : it.y];
  return items.sort((p, q) => {
    const a = key(p), b = key(q);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  });
}

// edges(doc, catalog, objects, o?) o {mode}: coverEdge per walkable edge, coverRing per circle footprint with r >= 0.33 m,
// coverSector per SP {Covers} sector (of o.mode when given). Counts on the non-enumerable `counts`
// {objects, nocover, vaultable, edges, rings, sectors}. coverEdge and coverRing carry vaultable: entry.vaultable === true
// (goh fences, logs and the like that infantry vault; always false on as64 and mowas2, the same item shape on all three).
function edges(doc, catalog, objects, o) {
  o = o || {};
  const entries = (catalog && catalog.entries) || {};
  const items = [], counts = { objects: 0, nocover: 0, vaultable: 0, edges: 0, rings: 0, sectors: 0 };
  for (const ob of objects || []) {
    const en = entries[lc(ob.def)];
    if (!en || !en.cover) continue;
    if (nocover(en)) { counts.nocover++; continue; }
    if (!en.cover.hard || en.category === 'placed_unit') continue;
    const sh = fpShape(ob);
    if (!sh) continue;
    const topM = Number.isFinite(en.cover.top) ? en.cover.top * scaleOf(ob, en) / UPM : 0;
    const band = bandOfM(topM);
    if (!band) continue;
    counts.objects++;
    // goh obstacles.reg flag_vaultable: infantry vault it (GHMOV-13) [V]; null/false on as64 and mowas2, so always false there
    const vaultable = en.vaultable === true;
    if (vaultable) counts.vaultable++;
    if (sh.kind === 'circle') {
      if (circleSteps(sh.r) <= 2) continue;
      items.push({ kind: 'coverRing', uid: ob.uid, def: lc(ob.def), x: r2(sh.c[0]), y: r2(sh.c[1]), r: r2(sh.r), band, topM: r3(topM), vaultable });
      counts.rings++;
      continue;
    }
    const p = sh.pts;
    for (let i = 0; i < p.length; i++) {
      const s = p[i], e = p[(i + 1) % p.length];
      const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
      if (len < U.minWall || !(uniformRunWidth(len) > U.minWall)) continue;
      // the scan side (outside) is the right of s->e on a CCW outline; a = the end with the lower x (then y)
      const swap = e[0] < s[0] - 1e-9 || (Math.abs(e[0] - s[0]) <= 1e-9 && e[1] < s[1]);
      const a = swap ? e : s, b = swap ? s : e;
      items.push({ kind: 'coverEdge', uid: ob.uid, def: lc(ob.def), a: [r2(a[0]), r2(a[1])], b: [r2(b[0]), r2(b[1])], lenM: r3(len / UPM), band,
        topM: r3(topM), side: swap ? 1 : -1, hard: true, vaultable });
      counts.edges++;
    }
  }
  for (const c of (doc && doc.covers) || []) {
    if (o.mode && c.mode && c.mode !== o.mode) continue;
    items.push({ kind: 'coverSector', mode: c.mode === undefined ? null : c.mode, sector: c.sector === undefined ? null : c.sector,
      x: Number.isFinite(c.x) ? r2(c.x) : null, y: Number.isFinite(c.y) ? r2(c.y) : null, raw: c.raw === undefined ? null : c.raw });
    counts.sectors++;
  }
  sortItems(items);
  Object.defineProperty(items, 'counts', { value: counts, enumerable: false });
  return items;
}

module.exports = {
  UPM, U, BANDS, BAND_M, OBSTACLE_FP, bandOfM, r2, r3, lc,
  area2, ccw, inPoly, clipConvex, segsCross, segHitsPoly, distToPoly, aabb, fpShape,
  frameOf, cellOf, latticeH, groundAt, typeAt, bandAt,
  uniformRunWidth, circleSteps, scaleOf, nocover, sortItems, edges,
};
