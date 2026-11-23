// entcat geom: 2D and 3D helpers for footprints (tools/mapviz/README.md 1.7, section 4).
//   meshPoints(volume) -> [[x,y,z]]       the engine's GetMesh points of one scene.js volume, entity space
//   fitObb(pts2) / fitCircle(pts2) (9 steps over 0..90 deg) / GetCircle (mean, max distance)
//   fit(pts2) -> {kind:'obb'|'circle', ...}  FitObstacleShape: the OBB when the circle covers more, else the circle
//   hull(pts2) -> convex hull, counter-clockwise, no repeated point      obbCorners, circlePoly, transform, aabb2
// Engine: (GetObb2, GetCircle), (FitObstacleShape)
//  (cylinder mesh, 10 segments). Sphere mesh = 14 points [I: the engine uses its debug
// sphere vertices].
// Author: Imperator_Aug (ARSENAL, ia-562869ab)
'use strict';

const CYLINDER_SEGMENTS = 10;
const OBB_STEPS = 9;
const CIRCLE_SIDES = 16;   // a circle footprint drawn as a 16-gon [I]

// row-vector matrix (scene.js / mdl.js matrix 43 order): p' = p.x*X + p.y*Y + p.z*Z + T
const xf = (m, p) => [0, 1, 2].map(j => p[0] * m[j] + p[1] * m[3 + j] + p[2] * m[6 + j] + m[9 + j]);

function meshPoints(v) {
  const sh = v && v.shape;
  if (!sh || !sh.matrix) return [];
  const m = sh.matrix, out = [];
  if (sh.kind === 'box') {
    const [a, b, c] = (sh.size || [0, 0, 0]).map(x => Number(x) / 2);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(xf(m, [sx * a, sy * b, sz * c]));
  } else if (sh.kind === 'cylinder') {
    const r = Number(sh.radius) || 0, h = (Number(sh.length) || 0) / 2;
    for (let i = CYLINDER_SEGMENTS - 1; i >= 0; i--) {
      const t = i * (2 * Math.PI / CYLINDER_SEGMENTS), x = Math.cos(t) * r, y = Math.sin(t) * r;
      out.push(xf(m, [x, y, -h]), xf(m, [x, y, h]));
    }
  } else if (sh.kind === 'sphere') {
    const r = Number(sh.radius) || 0, d = r / Math.sqrt(3);
    for (const p of [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]]) out.push(xf(m, p));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(xf(m, [sx * d, sy * d, sz * d]));
  } else if (sh.kind === 'polyhedron') {
    const t = sh.triangles || [], seen = new Set();
    for (let i = 0; i + 2 < t.length; i += 3) {
      const k = t[i] + ',' + t[i + 1] + ',' + t[i + 2];
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(xf(m, [t[i], t[i + 1], t[i + 2]]));
    }
  }
  return out;
}

function fitObb(pts) {
  let best = null;
  for (let i = 0; i < OBB_STEPS; i++) {
    const a = i * (Math.PI / 2) / OBB_STEPS, ax = Math.cos(a), ay = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of pts) {
      const u = ax * x + ay * y, v = ay * x - ax * y;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const w = u1 - u0, h = v1 - v0, area = w * h;
    if (!best || best.area > area) {
      const u = (u0 + u1) / 2, v = (v0 + v1) / 2;
      best = { kind: 'obb', center: [ax * u + ay * v, ay * u - ax * v], half: [w / 2, h / 2], axis: [ax, ay], area };
    }
  }
  return best;
}

function fitCircle(pts) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  let r = 0;
  for (const [x, y] of pts) r = Math.max(r, Math.hypot(x - cx, y - cy));
  return { kind: 'circle', center: [cx, cy], radius: r, area: r * r * Math.PI };
}

// FitObstacleShape: circleArea > obbArea -> OBB, else the circle (ties keep the circle, as the engine)
function fit(pts) {
  if (!pts.length) return null;
  const c = fitCircle(pts), o = fitObb(pts);
  return c.area > o.area ? o : c;
}
// the same fit from a hull and the mean of the full cloud (the circle centre is the mean of every point, not of the hull)
function fitFromHull(hullPts, mean) {
  if (!hullPts.length) return null;
  const o = fitObb(hullPts);
  let r = 0;
  for (const [x, y] of hullPts) r = Math.max(r, Math.hypot(x - mean[0], y - mean[1]));
  const c = { kind: 'circle', center: mean.slice(), radius: r, area: r * r * Math.PI };
  return c.area > o.area ? o : c;
}

function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
function hull(pts) {
  const p = pts.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const u = [];
  for (const q of p) { if (u.length && u[u.length - 1][0] === q[0] && u[u.length - 1][1] === q[1]) continue; u.push(q); }
  if (u.length < 3) return u;
  const lo = [], hi = [];
  for (const q of u) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = u.length - 1; i >= 0; i--) { const q = u[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}

function obbCorners(center, half, axis) {
  const [cx, cy] = center, [hx, hy] = half, [ax, ay] = axis, px = -ay, py = ax;   // counter-clockwise
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [cx + ax * hx * s + px * hy * t, cy + ay * hx * s + py * hy * t]);
}
function circlePoly(center, r) {
  const out = [];
  for (let i = 0; i < CIRCLE_SIDES; i++) { const a = i * 2 * Math.PI / CIRCLE_SIDES; out.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]); }
  return out;
}
function aabb2(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return pts.length ? [x0, y0, x1, y1] : null;
}
// entity space -> world: scale, then yaw (degrees counter-clockwise from +x), then the position
function transform(pts, placed, rotate) {
  const s = placed.scale == null ? 1 : Number(placed.scale), a = (rotate === false ? 0 : Number(placed.yaw) || 0) * Math.PI / 180;
  const c = Math.cos(a), n = Math.sin(a), X = Number(placed.x) || 0, Y = Number(placed.y) || 0;
  return pts.map(([x, y]) => [X + c * x * s - n * y * s, Y + n * x * s + c * y * s]);
}
// numbers in products: 4 decimals, -0 -> 0 (same bytes on every run)
const r4 = x => { const v = Math.round(x * 1e4) / 1e4; return v === 0 ? 0 : v; };
const rpts = pts => pts.map(p => p.map(r4));

module.exports = { meshPoints, fitObb, fitCircle, fit, fitFromHull, hull, obbCorners, circlePoly, aabb2, transform, xf, r4, rpts,
  CYLINDER_SEGMENTS, OBB_STEPS, CIRCLE_SIDES };
