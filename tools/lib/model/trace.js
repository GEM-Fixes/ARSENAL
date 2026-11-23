// model/trace: a ray against collision volumes, the way the engine traces them step 5).
// Pure functions, plain data in and out, engine units (20 per metre). Mirrors in double
// precision (the engine works in float32; results agree to ~1e-4 except at exact edges and corners).
//
// Matrices: number[12] or Float32Array(12), the engine's matrix 43 row-major as stored: rows x, y, z (basis), t
// (translation) = [xx,xy,xz, yx,yy,yz, zx,zy,zz, tx,ty,tz]. A local point p goes to p.x*X + p.y*Y + p.z*Z + T.
// Shape `matrix` = the volume's world matrix (bone world matrix times the volume's own matrix).
// The ray parameter t is in units of `ray.dir`: the engine moves the ray into local space with the inverse matrix
// (frame, , general inverse ), so t is the same in world and local space.
//
// Shapes (local space, as the engine builds them):
//   box        { matrix, size:[x,y,z] }  FULL size as written in `{box x y z}`; the engine halves it and centres the
//              box on the matrix origin.
//   cylinder   { matrix, radius, length } `{cylinder radius height}`: axis = local Z, centred on the origin, from
//              -length/2 to +length/2 ("Upright along z" ).
//   sphere { matrix, radius } centred on the origin (sphere).
//   polyhedron { matrix, triangles:[x,y,z, x,y,z, x,y,z, ...] flat local positions, 9 numbers per triangle,
//              sides?:[byte per triangle] the .vol SIDE bytes (1..6) }. Faces in .vol order. The engine moves the
//              vertices to their mean and the volume matrix by the same amount (,
//               ): a no-op for placement, so vertices are used as given.
//              Vanilla .vol winding: cross(b-a, c-a) points INTO the solid on all 14978 faces of 891 files checked;
//              the hit normal is minus that (:1264), so outward.
//
// Sides: SIDE.* are the engine's material numbers, 0-based = box face =
// = index into the volume's {thickness} sides (spot.side = hit.material
// ). The .vol SIDE byte is this number + 1.
//   0 FRONT (+X)  1 TOP (+Z)  2 LEFT (+Y)  3 RIGHT (-Y)  4 REAR (-X)  5 BOTTOM (-Z)   (box local axes)
// How a side is picked:
//   box the face the ray crosses, by its local axis.
//   cylinder always 0 FRONT, enter and exit (hit.enterMaterial = 0,; caps and wall only change the normal).
//   sphere     always 0 FRONT (:596).
//   polyhedron the SIDE byte of the first face inserted into the BSP node whose plane the ray crosses (:1265); a
//              byte > 6 reads as FRONT, a 0 byte as -1 (:1396; volume hit stores it as uint8 255). No `sides` here
//              = FRONT (the engine indexes an empty list: lim FMT-06).
//
// Exports
//   rayBox(ray, box) / rayCylinder(ray, cyl) / raySphere(ray, sphere) / rayPolyhedron(ray, poly) / rayShape(ray, s)
//     ray = { origin:[x,y,z], dir:[x,y,z] (any length, not zero) }
//     -> null (miss: engine TRACE_MISS) or { tIn, tOut, pointIn, pointOut, normalIn, normalOut (unit, world),
//        sideIn, sideOut, inside, length }.
//     inside = the origin is in the shape (engine TRACE_INSIDE): tIn 0, pointIn = origin, and as
//     normalIn = the unit ray direction, sideIn = FRONT. Only hits ahead count:
//     a shape wholly behind the origin misses. length = path inside (polyhedron: summed over its inner spans).
//   traceAll(ray, shapes) -> hits sorted by tIn (ties keep input order), each the ray* result plus { id, kind }.
//     shape.kind = 'box'|'cylinder'|'sphere'|'polyhedron' (or inferred from the fields), shape.id passed through.
//   traceEvents(ray, shapes) -> the engine's volume hit list: { id, t, enter, inside, side, normal, point } for every
//     enter and exit, sorted by t. An inside start enters at t 0.001 unless shape.hole
//     (VOLUME_INSIDE_ENTER_OFFSET).
//   SIDE, SIDE_NAMES, sideName(n) -> 'front'.. or 'side?n'; sideFromVolByte(b) -> engine side of a .vol SIDE byte.
//   angleOfIncidence(dir, normal) -> degrees from the surface normal, 0 = head on, 0..90 (abs of the cosine).
//   lineOfSightThickness(thickness, angleDeg) -> thickness / cos(angle) (plain geometry, no engine caps).
//   transformPoint(m, p), transformDir(m, d), invert(m) (general, null if singular), invertRigid(m), unit(v).
// Author: Imperator_Aug (ARSENAL, ia-cedcd916)
'use strict';

const SIDE = Object.freeze({ FRONT: 0, TOP: 1, LEFT: 2, RIGHT: 3, REAR: 4, BOTTOM: 5 });
const SIDE_NAMES = Object.freeze(['front', 'top', 'left', 'right', 'rear', 'bottom']);
const sideName = n => SIDE_NAMES[n] || 'side?' + n;
const sideFromVolByte = b => (b > 6 ? SIDE.FRONT : b - 1);

const HUGE_DISTANCE = 1e38;     //
const STEP_PAST = 2e-4;         //
const PARALLEL = 1e-4;          // box axis test
const INSIDE_ENTER_OFFSET = 0.001;

// ---- vector and matrix helpers ----
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const along = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
function unit(v) {
  const l = Math.sqrt(dot(v, v));
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
}
function transformPoint(m, p) {
  return [p[0] * m[0] + p[1] * m[3] + p[2] * m[6] + m[9],
    p[0] * m[1] + p[1] * m[4] + p[2] * m[7] + m[10],
    p[0] * m[2] + p[1] * m[5] + p[2] * m[8] + m[11]];
}
function transformDir(m, d) {
  return [d[0] * m[0] + d[1] * m[3] + d[2] * m[6], d[0] * m[1] + d[1] * m[4] + d[2] * m[7],
    d[0] * m[2] + d[1] * m[5] + d[2] * m[8]];
}
// general affine inverse; null when the basis is singular
function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-12) || !Number.isFinite(det)) return null;
  const r = 1 / det;
  const o = [A * r, (c * h - b * i) * r, (b * f - c * e) * r,
    B * r, (a * i - c * g) * r, (c * d - a * f) * r,
    C * r, (b * g - a * h) * r, (a * e - b * d) * r, 0, 0, 0];
  o[9] = -(o[3] * m[10] + o[0] * m[9] + o[6] * m[11]);
  o[10] = -(o[4] * m[10] + o[1] * m[9] + o[7] * m[11]);
  o[11] = -(o[5] * m[10] + o[2] * m[9] + o[8] * m[11]);
  return o;
}
// inverse of a rotation+translation (orthonormal basis): transpose the basis
function invertRigid(m) {
  const o = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8], 0, 0, 0];
  o[9] = -(m[9] * o[0] + m[10] * o[3] + m[11] * o[6]);
  o[10] = -(m[9] * o[1] + m[10] * o[4] + m[11] * o[7]);
  o[11] = -(m[9] * o[2] + m[10] * o[5] + m[11] * o[8]);
  return o;
}

// ray into local space, or null (zero dir, bad matrix)
function local(ray, shape) {
  if (!ray || !ray.origin || !ray.dir || !shape || !shape.matrix) return null;
  if (!(dot(ray.dir, ray.dir) > 0) || !ray.dir.every(Number.isFinite) || !ray.origin.every(Number.isFinite)) return null;
  const inv = invert(shape.matrix);
  if (!inv) return null;
  return { start: transformPoint(inv, ray.origin), step: transformDir(inv, ray.dir) };
}

// build the result from local enter/exit data ( for the inside case)
function result(ray, m, enter, exit, inside, length) {
  const r = {
    tIn: inside ? 0 : enter.t, tOut: exit.t,
    pointIn: inside ? ray.origin.slice(0, 3) : along(ray.origin, ray.dir, enter.t),
    pointOut: along(ray.origin, ray.dir, exit.t),
    normalIn: inside ? unit(ray.dir) : unit(transformDir(m, enter.normal)),
    normalOut: unit(transformDir(m, exit.normal)),
    sideIn: inside ? SIDE.FRONT : enter.material, sideOut: exit.material,
    inside: !!inside,
    length: length !== undefined ? length : (inside ? exit.t : exit.t - enter.t),
  };
  return r;
}

// ---- box: , ----
const BOX_FACES = [ // axis, sign, material, in the engine's test order
  [0, 1, SIDE.FRONT], [0, -1, SIDE.REAR], [1, 1, SIDE.LEFT], [1, -1, SIDE.RIGHT], [2, 1, SIDE.TOP], [2, -1, SIDE.BOTTOM]];
function rayBox(ray, box) {
  const L = local(ray, box);
  if (!L || !box.size) return null;
  const h = [box.size[0] * 0.5, box.size[1] * 0.5, box.size[2] * 0.5];
  const { start, step } = L;
  const crossings = [];
  for (const [axis, sign, material] of BOX_FACES) {
    if (!(Math.abs(step[axis]) > PARALLEL)) continue;
    const t = (sign * h[axis] - start[axis]) / step[axis];
    const p = along(start, step, t);
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    // strictly inside the other two half sizes: a ray through an exact edge or corner misses that face
    if (h[u] > Math.abs(p[u]) && h[v] > Math.abs(p[v])) {
      const normal = [0, 0, 0]; normal[axis] = sign;
      crossings.push({ t, normal, material });
    }
  }
  if (crossings.length < 2) return null;
  const [c0, c1] = crossings;
  if (0 > c0.t && 0 > c1.t) return null;
  const [enter, exit] = c1.t > c0.t ? [c0, c1] : [c1, c0];
  return result(ray, box.matrix, enter, exit, 0 > enter.t);
}

// ---- cylinder: , ----
function rayCylinder(ray, cyl) {
  const L = local(ray, cyl);
  if (!L) return null;
  const { start, step } = L;
  const R = cyl.radius, hh = cyl.length * 0.5;
  const TOP = 0, BOTTOM = 1, WALL = 2;
  let enterPart = WALL, exitPart = WALL, enter, exit;
  if (1e-5 > Math.abs(step[0]) && 1e-5 > Math.abs(step[1])) {
    if (start[0] * start[0] + start[1] * start[1] > R * R) return null;
    enter = (hh - start[2]) / step[2];
    exit = (-hh - start[2]) / step[2];
    if (enter > exit) [enter, exit] = [exit, enter];
    if (enter * step[2] + start[2] > 0) { enterPart = TOP; exitPart = BOTTOM; } else { enterPart = BOTTOM; exitPart = TOP; }
  } else {
    const a = step[0] * step[0] + step[1] * step[1];
    const b = start[0] * step[0] * 2 + start[1] * step[1] * 2;
    const c = start[0] * start[0] + start[1] * start[1] - R * R;
    const disc = b * b - c * a * 4;
    if (0 > disc) return null;
    const root = Math.sqrt(disc), scale = 1 / (a + a);
    enter = (-b - root) * scale;
    exit = (root - b) * scale;
    const enterZ = enter * step[2] + start[2], exitZ = exit * step[2] + start[2];
    const above = (enterZ > hh) + (exitZ > hh), below = (-hh > enterZ) + (-hh > exitZ);
    const crosses = !(above === 2 || below === 2);
    if (above === 1) {
      if (enterZ > hh) { enter = (hh - start[2]) / step[2]; enterPart = TOP; }
      if (exitZ > hh) { exit = (hh - start[2]) / step[2]; exitPart = TOP; }
    }
    if (below === 1) {
      if (-hh > enterZ) { enter = (-hh - start[2]) / step[2]; enterPart = BOTTOM; }
      if (-hh > exitZ) { exit = (-hh - start[2]) / step[2]; exitPart = BOTTOM; }
    }
    if (!crosses) return null;
  }
  if (0 > enter && 0 > exit) return null;
  const normalOf = (part, t) => (part === TOP ? [0, 0, 1] : part === BOTTOM ? [0, 0, -1]
    : [start[0] + step[0] * t, start[1] + step[1] * t, 0]);
  return result(ray, cyl.matrix, { t: enter, normal: normalOf(enterPart, enter), material: SIDE.FRONT },
    { t: exit, normal: normalOf(exitPart, exit), material: SIDE.FRONT }, 0 > enter);
}

// ---- sphere: , ----
function raySphere(ray, sphere) {
  const L = local(ray, sphere);
  if (!L) return null;
  const { start, step } = L;
  const a = dot(step, step), b = 2 * dot(start, step), c = dot(start, start) - sphere.radius * sphere.radius;
  const disc = b * b - c * a * 4;
  if (disc < 0) return null;
  const root = Math.sqrt(disc), scale = 1 / (a + a);
  const enter = (-b - root) * scale, exit = (root - b) * scale;
  if (enter < 0 && exit < 0) return null;
  return result(ray, sphere.matrix, { t: enter, normal: along(start, step, enter), material: SIDE.FRONT },
    { t: exit, normal: along(start, step, exit), material: SIDE.FRONT }, enter < 0);
}

// ---- polyhedron: BSP of the faces (node) traced as ----
function plane3(a, b, c) { // csgplane 3(a,b,c)
  const n = cross(sub(b, a), sub(c, a));
  const l2 = dot(n, n);
  const normal = l2 > 1e-12 ? unit(n) : [0, 0, 1];
  return { normal, d: -dot(a, normal) };
}
const planeDist = (pl, p) => dot(pl.normal, p) + pl.d;
function planeCross(origin, dir, pl) { //
  const cosine = dot(pl.normal, dir);
  if (cosine > -PARALLEL && PARALLEL > cosine) return HUGE_DISTANCE;
  return (-pl.d - dot(pl.normal, origin)) / cosine;
}
function newNode(parent, face) {
  return { parent, front: null, back: null, faces: [face], plane: plane3(face.v[0], face.v[1], face.v[2]), crossing: 0 };
}
function insert(node, face) { //  + Classify (0.1 unit tolerance); a face across a plane goes both ways
  let bits = 0;
  for (let i = 2; i >= 0; --i) {
    const d = planeDist(node.plane, face.v[i]);
    if (d < -0.1) bits |= 2; else if (d > 0.1) bits |= 1;
  }
  if (!bits) { node.faces.push(face); return; }
  if (bits & 1) { if (node.front) insert(node.front, face); else node.front = newNode(node, face); }
  if (bits & 2) { if (node.back) insert(node.back, face); else node.back = newNode(node, face); }
}

// the BSP tree of a polyhedron (built once per shape object, cached on a hidden WeakMap)
const trees = new WeakMap();
function treeOf(poly) {
  const tri = poly.triangles;
  let tree = trees.get(poly);
  if (tree && tree.src === tri && tree.sides === poly.sides) return tree.root;
  if (!tri || tri.length < 9) return null;
  let root = null;
  for (let f = 0; f + 8 < tri.length; f += 9) {
    const v = [[tri[f], tri[f + 1], tri[f + 2]], [tri[f + 3], tri[f + 4], tri[f + 5]], [tri[f + 6], tri[f + 7], tri[f + 8]]];
    const k = f / 9;
    const material = poly.sides && poly.sides[k] !== undefined ? sideFromVolByte(poly.sides[k]) : SIDE.FRONT;
    const face = { v, material };
    if (!root) root = newNode(null, face); else insert(root, face);
  }
  trees.set(poly, { src: tri, sides: poly.sides, root });
  return root;
}

function rayPolyhedron(ray, poly) {
  const L = local(ray, poly);
  if (!L) return null;
  const root = treeOf(poly);
  if (!root) return null;
  const { start, step } = L;
  const crossings = [];
  let point = start, t = 0, lastT = -HUGE_DISTANCE, node = root, crossed = null, lastSide = 0;
  for (let guard = 0; guard < 100000; guard++) { // guard: the engine loops until no plane is ahead
    let side;
    for (;;) {
      node.crossing = planeCross(start, step, node.plane);
      if (planeDist(node.plane, point) > 0) {
        side = 1;
        if (!node.front) break;
        node = node.front;
      } else {
        side = 2;
        if (!node.back) break;
        node = node.back;
      }
    }
    if (lastSide && lastSide !== side && Math.abs(t - lastT) > 1e-4) {
      const n = crossed.plane.normal;
      crossings.push({ t, normal: [-n[0], -n[1], -n[2]], material: crossed.faces[0].material });
      lastT = t;
    }
    lastSide = side;
    let nearest = HUGE_DISTANCE;
    crossed = null;
    for (;;) {
      if (node.crossing > t && nearest > node.crossing) { nearest = node.crossing; crossed = node; }
      if (!node.parent) break;
      node = node.parent;
    }
    if (!crossed) break;
    t = nearest;
    point = along(start, step, t + STEP_PAST);
  }
  if (!crossings.length) return null;
  const n = crossings.length;
  if (n & 1) {
    let length = crossings[0].t;
    for (let i = n >> 1; i >= 1; --i) length += crossings[i * 2].t - crossings[i * 2 - 1].t;
    return result(ray, poly.matrix, null, crossings[0], true, length);
  }
  let length = 0;
  for (let i = (n >> 1) - 1; i >= 0; --i) length += crossings[i * 2 + 1].t - crossings[i * 2].t;
  return result(ray, poly.matrix, crossings[0], crossings[n - 1], false, length);
}

// ---- several shapes ----
function kindOf(s) {
  if (s.kind) return s.kind;
  if (s.triangles) return 'polyhedron';
  if (s.size) return 'box';
  if (s.length !== undefined) return 'cylinder';
  if (s.radius !== undefined) return 'sphere';
  return null;
}
const BY_KIND = { box: rayBox, cylinder: rayCylinder, sphere: raySphere, polyhedron: rayPolyhedron };
function rayShape(ray, shape) {
  const f = shape && BY_KIND[kindOf(shape)];
  return f ? f(ray, shape) : null;
}
function traceAll(ray, shapes) {
  const hits = [];
  (shapes || []).forEach((s, i) => {
    const h = rayShape(ray, s);
    if (h) hits.push(Object.assign({ id: s.id, kind: kindOf(s), order: i }, h));
  });
  hits.sort((a, b) => a.tIn - b.tIn || a.order - b.order);
  for (const h of hits) delete h.order;
  return hits;
}
//  for every shape, then sorted along the ray
function traceEvents(ray, shapes) {
  const ev = [];
  let k = 0;
  for (const h of traceAll(ray, shapes)) {
    const s = shapes.find(x => x.id === h.id);
    const tIn = h.inside ? (s && s.hole ? 0 : INSIDE_ENTER_OFFSET) : h.tIn;
    ev.push({ id: h.id, t: tIn, enter: true, inside: h.inside, side: h.sideIn, normal: h.normalIn,
      point: along(ray.origin, ray.dir, tIn), k: k++ });
    ev.push({ id: h.id, t: h.tOut, enter: false, inside: h.inside, side: h.sideOut, normal: h.normalOut,
      point: h.pointOut, k: k++ });
  }
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  for (const e of ev) delete e.k;
  return ev;
}

// ---- plain geometry helpers ----
function angleOfIncidence(dir, normal) {
  const c = Math.abs(dot(unit(dir), unit(normal)));
  return Math.acos(Math.min(1, c)) * 180 / Math.PI;
}
function lineOfSightThickness(thickness, angleDeg) {
  const c = Math.cos(angleDeg * Math.PI / 180);
  return Math.abs(c) < 1e-12 ? Infinity : thickness / c;
}

module.exports = {
  SIDE, SIDE_NAMES, sideName, sideFromVolByte,
  rayBox, rayCylinder, raySphere, rayPolyhedron, rayShape, traceAll, traceEvents,
  angleOfIncidence, lineOfSightThickness,
  transformPoint, transformDir, invert, invertRigid, unit,
};
