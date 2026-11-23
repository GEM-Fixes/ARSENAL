// model/scene: a whole model put together in world space (bones, meshes, collision volumes), posed from an animation,
// as shapes for trace.js and as compact JSON for a browser 3D view. Pure: no file IO (sceneload.js does the IO).
// Contract: tools/lib/model/README.md. Matrices: number[12] (plain arrays), matrix 43 order rows x, y, z, t; row
// vectors, p' = p.x*X + p.y*Y + p.z*Z + T; "a followed by b" = mdl.mul(a, b). Forward +X, up +Z, 20 units per metre.
//
// Engine rules used (all [V] read in the source, file:line):
//   bone world = local followed by parent world ( ComposeWorld). Parametric bones at rest
//                  use AdjustLocal = identity [I] (as mdl.js).
//   volume world = volume matrix followed by bone world: transform.matrix.Multiply(desc->matrix
//                  bone->GetWorld); bone found by name at Link (:169).
//   (1) polyhedron: reads the .vol points in bone-volume space
//       computes center = mean of points (16 random points inside the hull,; NOT the
//       mean vertex), subtracts it from every vertex, and adds
//       center * basis to the volume matrix t once (flags.centered). Net: world point = volPoint * volMatrix * boneWorld
//       i.e. the .vol points are used exactly as stored, through the volume's own matrix. The random centre cancels.
//   (2) box {Box x y z}: FULL sizes; halves them (halfSize = size*0.5) and the box is centred on the volume
//       matrix origin (read).
//       cylinder {Cylinder r h}: radius r, full height h along local Z, centred: -h/2..+h/2.
//       sphere {Sphere r}: centred on the origin. Shapes here carry the numbers as written; trace.js does the halving.
//   (3) views: View/SpriteView/VolumeView/ParticleView/DecalView each AddView with lod 0 + allLods; inside {LODView ..}
//       the n-th entry gets lod n, allLods false, the last one allLods = !OFF. Render draws a
//       poly view when slot.lod == lod or (allLods and lod > slot.lod), lod 0 when the state has none:
//       LOD entry 0 = the nearest/most detailed level; it is the one shown here. The mesh is drawn with the bone's world
//       matrix as is (mesh->Render(context, matrix)): no extra
//       offset. MROR only sets the mesh's mirrored flag (winding/culling), it does not
//       move vertices; carried as `mirrored`. {VolumeView "x.ply"} is a resource view;
//       {View "x"} opens x as an SDL view file (:48-54): taken as a mesh only when the name ends in .ply (as tools/unitbox).
//   animation (pose): state animator builds local = ToMatrix(slerped quat), t = lerped position, z negated when mirrored
//       then bone->SetLocal(local) (local =
//       matrix): the animation matrix REPLACES the rest local. Bones the animation does not key (info.transform < 0) keep
//       their local (:346). Frames between keys: anm.matrixAt (engine Slerp + lerp).
//   Skinned meshes (ply SKIN) are placed like static ones (bone world) [I]: the vertex skinning is not applied.
//
// Exports:
//   build(model, files) -> scene. model = mdl.parse(..); files = { get(nameAsWrittenInTheMdl) -> Buffer|null }.
//     scene = {
//       bones:   [{ name, path, parent: index|-1, parentPath, local: number[12], rest: number[12], world: number[12],
//                   visible: bool, views: [{ kind, file, lods: [file]|null, off }] }]          (mdl tree order)
//       meshes:  [{ bone: path, boneIndex, file, kind ('VolumeView'|'View'|'LODView'), world, ply: parsed|null, mirrored,
//                   skinned, localBounds: [6]|null }]
//       volumes: [{ id, name, bone: path|null, boneIndex, kind, local, world: number[12]|null, file, size, radius, length,
//                   vol: parsed .vol|null, shape: trace.js shape|null }]
//         shape = { id, kind:'box', matrix, size } | { id, kind:'cylinder', matrix, radius, length } | { id, kind:'sphere',
//                   matrix, radius } | { id, kind:'polyhedron', matrix, triangles: number[9*T] local, sides: number[T] }
//         matrix = the volume's world matrix; polyhedron sides = the .vol SIDE bytes 1..6 (what trace.js reads, it
//         converts with sideFromVolByte); no shape when the bone is not found (engine: Link fails) or the .vol is missing.
//       obstacles, areas: as mdl.js (2D, model space)
//       bounds: { min, max } | null  world AABB of meshes + volumes; meshBounds, volumeBounds the same for each alone
//       missing: [file names files.get returned null for]; problems: [string]
//     }
//   pose(scene, anm, frame) -> new scene (input untouched): bone.local = anm.matrixAt(anm, bone by name, frame) or the
//     rest local; worlds, meshes, volumes, shapes and bounds recomputed. bone.visible = last VISI/show/hide event for the
//     bone at or before `frame` (anm frames), else the rest visibility.
//   shapes(scene) -> [shape] for trace.traceAll (volumes with a shape).
//   toJSON(scene, { meshes: true|false }) -> plain JSON (JSON.stringify-able), shape "scene/1":
//     { format: 'scene/1', units: 20, bounds: {min,max}|null, missing: [names],
//       bones:   [{ name, path, parent: index|-1, world: [12], visible }],
//       meshes:  [{ bone: index, file, world: [12], mirrored, skinned, parts: [part] }]   (parts [] when meshes:false or
//                 no ply). part = { material: string|null (mtl name, else first texture name), textures: [names],
//                 vertexCount, indexCount, positions: b64 Float32Array(3*vertexCount) LOCAL (draw with world),
//                 normals: b64 Float32Array(3*vertexCount)|null, uv0: b64 Float32Array(2*vertexCount)|null (D3D, v down),
//                 indices: b64 Uint32Array(indexCount) into this part's own vertex arrays, 3 per triangle }
//       volumes: [{ id, name, bone: index|-1, kind, world: [12]|null, size: [x,y,z] (box, full), radius, length (cylinder
//                 full height along local Z; sphere radius), file, triangleCount, triangles: b64 Float32Array(9*T) local
//                 (polyhedron), sides: [1..6 per triangle] (.vol bytes; 1 front +X 2 top +Z 3 left +Y 4 right -Y 5 rear -X
//                 6 bottom -Z) }] }
//     b64 = base64 of the little-endian typed array bytes. A local point goes to world as p * world (row vector, above).
//   b64(typedArray) -> string; unb64(str, Float32Array|Uint32Array) -> typed array; aabb(matrix, min, max) -> {min,max}
//   lodCount(model) -> levels of the longest {LODView} (1 when none); atLod(model, n) -> model whose LODViews show entry n
//   shapes2(model.obstacles | model.areas) -> [{ name, kind, center, extent, axis, radius, vertices }] for the 3D view
// Author: Imperator_Aug (ARSENAL, ia-d0bb6a75)
'use strict';
const mdlLib = require('./mdl'), plyLib = require('./ply'), volLib = require('./vol'), anmLib = require('./anm');

const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const mul = (a, b) => mdlLib.mul(Array.from(a), Array.from(b));
const tp = (m, x, y, z) => [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]];

function emptyBox() { return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; }
function addPt(b, p) { for (let c = 0; c < 3; c++) { if (p[c] < b.min[c]) b.min[c] = p[c]; if (p[c] > b.max[c]) b.max[c] = p[c]; } }
function addBox(b, o) { if (o) { addPt(b, o.min); addPt(b, o.max); } }
function done(b) { return b.min[0] === Infinity ? null : b; }
function aabb(m, mn, mx) {
  const b = emptyBox();
  for (let c = 0; c < 8; c++) addPt(b, tp(m, c & 1 ? mx[0] : mn[0], c & 2 ? mx[1] : mn[1], c & 4 ? mx[2] : mn[2]));
  return b;
}

function isPly(n) { return typeof n === 'string' && /\.ply$/i.test(n); }
// the mesh a bone shows at LOD 0
function meshViews(b) {
  const out = [];
  for (const v of b.views || []) {
    if (v.kind === 'VolumeView' && isPly(v.file)) out.push({ kind: 'VolumeView', file: v.file });
    else if (v.kind === 'View' && isPly(v.file)) out.push({ kind: 'View', file: v.file });
    else if (v.kind === 'LODView' && v.lods && v.lods[0] && isPly(v.lods[0].file)) out.push({ kind: 'LODView', file: v.lods[0].file });
  }
  return out;
}

function restVisible(b) { return !(b.visibility === 0 || b.visibility === false || b.visibility === '0'); }

function build(model, files) {
  const cache = new Map(), missing = [], problems = [];
  const get = name => {
    const k = String(name).toLowerCase();
    if (cache.has(k)) return cache.get(k);
    let buf = null;
    try { buf = files && files.get ? files.get(name) : null; } catch (e) { buf = null; }
    if (!buf) missing.push(name);
    cache.set(k, buf || null);
    return buf || null;
  };
  const index = new Map();
  const bones = (model.bones || []).map((b, i) => {
    index.set(b.path, i);
    return {
      name: b.name, path: b.path, parent: -1, parentPath: b.parent, rest: Array.from(b.matrix || ID), local: Array.from(b.matrix || ID),
      world: null, visible: restVisible(b), restVisible: restVisible(b),
      views: (b.views || []).map(v => ({ kind: v.kind, file: v.file, lods: v.lods ? v.lods.map(l => l.file) : null, off: !!v.off })),
    };
  });
  for (const b of bones) b.parent = b.parentPath != null && index.has(b.parentPath) ? index.get(b.parentPath) : -1;
  const meshes = [];
  (model.bones || []).forEach((b, i) => {
    for (const mv of meshViews(b)) {
      const buf = get(mv.file);
      let p = null;
      if (buf) { p = plyLib.parse(buf); if (p.error) problems.push(mv.file + ': ' + p.error); }
      meshes.push({ bone: b.path, boneIndex: i, file: mv.file, kind: mv.kind, world: null, ply: p, mirrored: !!(p && p.mirrored),
        skinned: !!(p && p.skin && p.skin.length), localBounds: p ? plyLib.bounds(p) : null });
    }
  });
  const volumes = (model.volumes || []).map(v => {
    const bi = v.bone != null && index.has(v.bone) ? index.get(v.bone) : -1;
    if (bi < 0) problems.push('volume ' + v.id + ': bone "' + (v.boneName || v.bone) + '" not in the skeleton');
    let vol = null;
    if (v.kind && v.kind.toLowerCase() === 'polyhedron' && v.file) {
      const buf = get(v.file);
      if (buf) { vol = volLib.parse(buf); if (vol.error) problems.push(v.file + ': ' + vol.error); }
    }
    return { id: v.id, name: v.name, bone: bi >= 0 ? v.bone : null, boneIndex: bi, kind: v.kind ? v.kind.toLowerCase() : null,
      local: Array.from(v.matrix || ID), world: null, file: v.file || null, size: v.size || null, radius: v.radius, length: v.length, vol, shape: null };
  });
  const scene = { bones, meshes, volumes, obstacles: model.obstacles || [], areas: model.areas || [], bounds: null,
    meshBounds: null, volumeBounds: null, missing, problems };
  return place(scene);
}

// recompute worlds, shapes, bounds from bone locals (bones are in tree order: parents first)
function place(s) {
  for (const b of s.bones) b.world = b.parent >= 0 && s.bones[b.parent].world ? mul(b.local, s.bones[b.parent].world) : b.local.slice();
  const mb = emptyBox(), vb = emptyBox();
  for (const m of s.meshes) {
    m.world = s.bones[m.boneIndex].world;
    if (m.localBounds) addBox(mb, aabb(m.world, m.localBounds.slice(0, 3), m.localBounds.slice(3, 6)));
  }
  for (const v of s.volumes) {
    v.world = v.boneIndex >= 0 ? mul(v.local, s.bones[v.boneIndex].world) : null;
    v.shape = v.world ? shapeOf(v) : null;
    v.worldBounds = v.shape ? shapeBounds(v.shape) : null;
    addBox(vb, v.worldBounds);
  }
  s.meshBounds = done(mb); s.volumeBounds = done(vb);
  const all = emptyBox(); addBox(all, s.meshBounds); addBox(all, s.volumeBounds);
  s.bounds = done(all);
  return s;
}

function shapeOf(v) {
  const base = { id: v.id, kind: v.kind, matrix: v.world };
  if (v.kind === 'box' && v.size) return Object.assign(base, { size: v.size.slice() });
  if (v.kind === 'cylinder' && v.radius != null) return Object.assign(base, { radius: v.radius, length: v.length });
  if (v.kind === 'sphere' && v.radius != null) return Object.assign(base, { radius: v.radius });
  if (v.kind === 'polyhedron' && v.vol) {
    const tris = volLib.triangles(v.vol), triangles = [], sides = [];
    for (const t of tris) { for (const x of t.p) triangles.push(x); sides.push(t.side == null ? 1 : t.side); }
    return Object.assign(base, { triangles, sides });
  }
  return null;
}

function shapeBounds(sh) {
  const m = sh.matrix;
  if (sh.kind === 'box') { const h = sh.size.map(x => x / 2); return aabb(m, h.map(x => -x), h); }
  if (sh.kind === 'cylinder') { const r = sh.radius, h = (sh.length || 0) / 2; return aabb(m, [-r, -r, -h], [r, r, h]); }
  if (sh.kind === 'sphere') { const r = sh.radius; return aabb(m, [-r, -r, -r], [r, r, r]); }
  if (sh.kind === 'polyhedron') {
    const b = emptyBox(), t = sh.triangles;
    for (let i = 0; i < t.length; i += 3) addPt(b, tp(m, t[i], t[i + 1], t[i + 2]));
    return done(b);
  }
  return null;
}

function anmBoneIndex(anm, name) {
  const low = String(name).toLowerCase();
  return (anm.bones || []).findIndex(n => String(n).toLowerCase() === low);
}
function visibleAt(anm, bi, frame) {
  let vis = null;
  const fr = anm.frame || [];
  for (let f = 0; f <= frame && f < fr.length; f++) { const r = fr[f] && fr[f][bi]; if (r && r.visible != null) vis = r.visible; }
  return vis;
}

function pose(scene, anm, frame) {
  const s = Object.assign({}, scene, {
    bones: scene.bones.map(b => Object.assign({}, b, { views: b.views })),
    meshes: scene.meshes.map(m => Object.assign({}, m)),
    volumes: scene.volumes.map(v => Object.assign({}, v)),
  });
  for (const b of s.bones) {
    const bi = anm ? anmBoneIndex(anm, b.name) : -1;
    let m = null;
    if (bi >= 0) { try { m = anmLib.matrixAt(anm, bi, frame); } catch (e) { m = null; } }
    b.local = m ? Array.from(m) : b.rest.slice();
    const v = bi >= 0 ? visibleAt(anm, bi, frame) : null;
    b.visible = v == null ? b.restVisible : v;
  }
  return place(s);
}

function shapes(scene) { return scene.volumes.filter(v => v.shape).map(v => v.shape); }

function b64(ta) { return Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64'); }
function unb64(str, Type) { const b = Buffer.from(str, 'base64'); const c = new Uint8Array(b.length); c.set(b); return new Type(c.buffer); }

function meshParts(p) {
  const out = [];
  if (!p || !p.parts) return out;
  for (let i = 0; i < p.parts.length; i++) {
    const part = p.parts[i], ix = plyLib.partTriangles(p, i);
    let at = null;
    try { at = plyLib.partAttributes(p, i); } catch (e) { at = null; }
    const pos = at && at.position;
    if (!pos) continue;
    const map = new Map(), keep = [];
    const idx = new Uint32Array(ix.length);
    for (let k = 0; k < ix.length; k++) {
      const g = ix[k];
      let l = map.get(g);
      if (l === undefined) { l = keep.length; map.set(g, l); keep.push(g); }
      idx[k] = l;
    }
    const pick = (src, n) => {
      if (!src) return null;
      const o = new Float32Array(keep.length * n);
      for (let k = 0; k < keep.length; k++) for (let c = 0; c < n; c++) o[k * n + c] = src[keep[k] * n + c];
      return b64(o);
    };
    const textures = part.textures || [];
    out.push({ material: part.material || textures[0] || null, textures: textures.slice(), vertexCount: keep.length, indexCount: idx.length,
      positions: pick(pos, 3), normals: pick(at.normal, 3), uv0: pick(at.uv0, 2), indices: b64(idx) });
  }
  return out;
}

function toJSON(scene, opt = {}) {
  const r = a => (a ? Array.from(a, Number) : null);
  return {
    format: 'scene/1', units: 20,
    bounds: scene.bounds ? { min: scene.bounds.min.slice(), max: scene.bounds.max.slice() } : null,
    missing: scene.missing.slice(),
    bones: scene.bones.map(b => ({ name: b.name, path: b.path, parent: b.parent, world: r(b.world), visible: b.visible })),
    meshes: scene.meshes.map(m => ({ bone: m.boneIndex, file: m.file, world: r(m.world), mirrored: m.mirrored, skinned: m.skinned,
      parts: opt.meshes === false ? [] : meshParts(m.ply) })),
    volumes: scene.volumes.map(v => {
      const o = { id: v.id, name: v.name, bone: v.boneIndex, kind: v.kind, world: r(v.world) };
      if (v.kind === 'box') o.size = v.size ? v.size.slice() : null;
      else if (v.kind === 'cylinder') { o.radius = v.radius; o.length = v.length; }
      else if (v.kind === 'sphere') o.radius = v.radius;
      else if (v.kind === 'polyhedron') {
        o.file = v.file;
        const sh = v.shape || (v.vol ? shapeOf(Object.assign({}, v, { world: ID })) : null);
        o.triangleCount = sh ? sh.sides.length : 0;
        o.triangles = sh ? b64(Float32Array.from(sh.triangles)) : null;
        o.sides = sh ? sh.sides.slice() : [];
      }
      return o;
    }),
  };
}

// LOD levels: lodCount(model) = the longest {LODView} (1 when none); atLod(model, n) = a shallow copy of the model where every
// {LODView} shows its n-th entry (the last one when it has fewer), so build() draws that level. n = 0 gives the model as it is.
function lodCount(model) {
  let n = 1;
  for (const b of (model && model.bones) || []) for (const v of b.views || []) if (v.kind === 'LODView' && v.lods) n = Math.max(n, v.lods.filter(l => l.file).length);
  return n;
}
function atLod(model, lod) {
  if (!lod || !model || !model.bones) return model;
  return Object.assign({}, model, {
    bones: model.bones.map(b => Object.assign({}, b, {
      views: (b.views || []).map(v => {
        if (v.kind !== 'LODView' || !v.lods || !v.lods.length) return v;
        const l = v.lods.filter(x => x.file), pick = l[Math.min(lod, l.length - 1)];
        return pick ? Object.assign({}, v, { lods: [pick], file: pick.file }) : v;
      }),
    })),
  });
}
// obstacles and areas of a parsed .mdl as the 3D view draws them (2D, model space)
function shapes2(list) {
  const nums = a => (Array.isArray(a) ? a.map(Number) : null);
  return (list || []).map(o => {
    const s = o.shape || {};
    return { name: o.name || null, kind: s.kind || o.kind || null, center: nums(s.center), extent: nums(s.extent), axis: nums(s.axis),
      radius: s.radius == null ? null : Number(s.radius), vertices: (s.vertices || []).map(nums) };
  });
}

module.exports = { build, pose, shapes, toJSON, b64, unb64, aabb, lodCount, atLod, shapes2 };
