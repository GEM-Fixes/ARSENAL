// model/edit/ply: meshes and materials of the built-in model editor (contract tools/lib/model/edit/README.md; rows PLY, MAT of
// tools/soedit/parity.md). Ops take the document's current bytes and return only the files that change; nothing here touches
// the disk. Mesh bytes are always written through tools/lib/model/ply.js write (SUBM stays SUBM, unknown chunks kept), batch
// logic is tools/soedit/ops/plyops.js (merge, merge child, demerge by part/material, tweak, info), .mdl text through mdl.js
// edit() and sdlwrite splices (every byte outside an edited span kept), .mtl text through sdlwrite (CRLF, bytes kept).
//
// Names: a mesh is named by its document rel (`rel`), a bone by its path or name (`bone`), a part by its index (`part`).
//   View file names in the .mdl and material names in a .ply are relative to the file that names them ('/x' = resource root).
//   Textures named in a .mtl: relative to the .mtl, '/x' = resource root, '$/x' = texture/common/x (tools/binhdr/ply.js texBase).
//
// Ops (args):
//   ply.attach    { bone, rel | name, data? (base64 .ply), kind? 'VolumeView'|'View', overwrite? }   mesh on a bone (replaces its mesh)
//   ply.detach    { bone, drop? }                    bone loses its mesh views; drop: the file leaves the document when unused
//   ply.replace   { rel, data (base64) | from (rel) } same name, other mesh bytes
//   ply.rename    { rel, to }                        file renamed, every .mdl view naming it rewritten
//   ply.transform { rel, matrix? (12) | move [3], turn [deg x y z], scale n|[3], keepWinding? }
//   ply.scale     { rel, factor n|[3] }      ply.mirror { rel, axis 'x'|'y'|'z' }     ply.flip { rel, parts? }
//   ply.normals   { rel, smooth? 'index'|'position', tangents? }   ply.tangents { rel }   ply.weld { rel, tolerance? }   ply.bounds { rel }
//   ply.lods      { bone, files: [rel], off? }      LOD list of a bone ({LODView {View a} {View b} ..}); one file = plain view
//   ply.skin      { rel, rename: { from, to } } | { rel, clamp: true }
//   ply.merge     { rel, from, matrix?, out? }       (PLY-01/02)     ply.mergeChild { bone }  (PLY-03)
//   ply.demerge   { bone, by: 'parts'|'material'|'islands', recentre?, keepParent? }  (PLY-04)
//   ply.tweak     { rel, parts?, set?, clear?, vset?, vclear?, material? { from, to }, force? }  (PLY-05/07)
//   ply.import    { obj (text), mtl? [{ name, text }], name, bone?, units? 'metres'|'units'|n, axis? 'y-up'|'z-up', tangents?, overwrite? }
//   mat.set       { rel, part ('all'|n), name, create? }    mat.textures { rel, part, textures: [names] }
//   mat.edit      { rel, type?, set?: { key: value|null }, flags?: { flag: bool } }    mat.create { name|rel, type?, set?, flags?, overwrite? }
// States: ply.list, ply.get { rel }, ply.export { rel, units?, axis? } -> { name, obj, mtl } (texts), mat.list, mat.get { rel }.
// Texture found/missing: a texture file in doc.files (any of .dds .tga .ebm .bmp .tex .jpg .png), else doc.exists(rel) or
//   doc.fetch(rel) (the mod over the game) when the core gives one, remembered per document; else missing.
// Engine winding: front faces are clockwise against the right-handed cross product (40 vanilla meshes, 2005 of 2005 triangles
//   whose stored normals agree); OBJ is counter-clockwise, so import and export swap two corners.
// OBJ axes: 'y-up' (default, what most programs write: +Y up, -Z forward) -> game (+X forward, +Y left, +Z up): (x, y, z) ->
//   (-z, -x, y), a proper rotation. 'z-up' = taken as is. Units: 'metres' (default) x20, 'units' x1, or a number.
// Author: Imperator_Aug (ARSENAL, ia-14bd77f1)
'use strict';
const pp = require('path').posix;
const P = require('../ply'), M = require('../mdl'), OBJ = require('../obj'), sw = require('../../sdlwrite');
const O = require('../../../soedit/ops/plyops');

const lc = s => String(s == null ? '' : s).toLowerCase();
const fail = msg => { throw new Error(msg); };
const TEX_EXTS = ['.dds', '.tga', '.ebm', '.bmp', '.tex', '.jpg', '.png'];
const VIEW_KINDS = ['View', 'VolumeView'];

// ---------- document helpers ----------
function fileKey(doc, rel) {
  if (!rel) return null;
  const has = k => { const f = doc.files.get(k); return f && f.bytes ? k : null; };
  if (doc.files.has(rel)) return has(rel);
  const l = lc(rel);
  for (const k of doc.files.keys()) if (lc(k) === l) return has(k);
  return null;
}
const resRoot = doc => (/^resource\//i.test(doc.mdl) ? 'resource/' : '');
// a name as written in `baseRel` (a .mdl, .ply or .mtl) -> { rel, exists }
function resolveName(doc, name, baseRel, addExt) {
  let n = String(name || '').replace(/\\/g, '/');
  let rel;
  if (n.startsWith('//')) rel = n.slice(2);
  else if (n.startsWith('/')) rel = resRoot(doc) + n.slice(1);
  else rel = pp.normalize(pp.join(pp.dirname(baseRel || doc.mdl), n));
  let k = fileKey(doc, rel);
  if (!k && addExt && !/\.[^/.]+$/.test(rel)) { const k2 = fileKey(doc, rel + addExt); if (k2) k = k2; else rel += addExt; }
  return { rel: k || rel, exists: !!k };
}
const nameFor = (doc, rel, baseRel) => pp.relative(pp.dirname(baseRel || doc.mdl), rel) || pp.basename(rel);
const checkName = s => { if (!/^[\x20-\x7e]+$/.test(String(s))) fail('File names must use plain latin letters, digits and signs.'); if (/["{}]/.test(s)) fail('File names cannot hold quotes or braces.'); return s; };
const quote = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const fromB64 = s => { const b = Buffer.from(String(s || ''), 'base64'); if (!b.length) fail('No file data was given.'); return b; };

function model(doc) {
  const m = doc.read(doc.mdl);
  if (!m || m.error && !m.bones) fail('The model file could not be read' + (m && m.error ? ': ' + m.error : '.'));
  return m;
}
function bone(m, ref) {
  const b = M.findBone(m, ref);
  if (!b) fail(`There is no bone called ${ref}.`);
  return b;
}
function mdlEdit(m, changes) {
  try { return M.edit(m, changes); } catch (e) { fail('The model file could not be changed: ' + String(e.message).replace(/^mdl: /, '')); }
}
// every mesh a bone draws: [{ bone, boneName, view, lod, lodKind, file, rel, exists, off }]
function meshRefs(doc, m) {
  m = m || model(doc);
  const out = [];
  for (const b of m.bones) for (const v of b.views || []) {
    if (v.kind !== 'LODView' && !VIEW_KINDS.includes(v.kind)) continue;
    const list = v.kind === 'LODView' ? v.lods.map((l, i) => ({ kind: l.kind, file: l.file, lod: i })) : [{ kind: v.kind, file: v.file, lod: null }];
    for (const l of list) {
      if (!l.file || /\.[^/.]+$/.test(l.file) && !/\.ply$/i.test(l.file)) continue;
      const r = resolveName(doc, l.file, doc.mdl, '.ply');
      out.push({ bone: b.path, boneName: b.name, view: v.kind, lodKind: l.kind, lod: l.lod, file: l.file, rel: r.rel, exists: r.exists, off: !!v.off });
    }
  }
  return out;
}
function readPly(doc, rel) {
  const k = fileKey(doc, rel);
  if (!k) fail(`The mesh ${rel} is not in this model.`);
  const o = doc.read(k);
  if (!o || o.error) fail(`The mesh ${k} could not be read${o && o.error ? ': ' + o.error : '.'}`);
  return { k, o };
}
function encode(o) { try { return P.write(o); } catch (e) { fail('The mesh could not be written: ' + String(e.message).replace(/^ply\.\w+: /, '')); } }
function checkPly(buf, what) {
  const o = P.parse(buf);
  if (o.error) fail(`${what} is not a mesh file the game reads: ${o.error}`);
  return o;
}
// result helper: drop files whose bytes did not change
function result(doc, files, info) {
  const out = {};
  for (const [rel, b] of Object.entries(files)) {
    const k = fileKey(doc, rel) || rel, cur = doc.files.get(k);
    if (b && cur && cur.bytes && Buffer.compare(cur.bytes, b) === 0) continue;
    if (b === null && !cur) continue;
    out[k] = b;
  }
  return { files: out, info: info || {} };
}

// bone mesh view: remove every mesh view of the bone (bytes in), then, when `set` is given, add it
function setBoneViews(mdlBytes, bonePath, set) {
  let m = M.parse(mdlBytes);
  const b = bone(m, bonePath);
  const kinds = [...new Set((b.views || []).filter(v => v.kind === 'LODView' || VIEW_KINDS.includes(v.kind)).map(v => v.kind))];
  let buf = kinds.length ? mdlEdit(m, kinds.map(k => ({ op: 'setKey', bone: b.path, key: k, value: null }))) : Buffer.from(mdlBytes);
  if (!set) return buf;
  m = M.parse(buf);
  if (set.lods) {
    const raw = set.lods.map(n => `{${set.lodKind || 'View'} ${quote(n)}}`).join(' ') + (set.off ? ' {OFF}' : '');
    return mdlEdit(m, [{ op: 'setKey', bone: b.path, key: 'LODView', value: { raw } }]);
  }
  return mdlEdit(m, [{ op: 'setKey', bone: b.path, key: set.kind || 'VolumeView', value: set.name }]);
}
const meshKindOf = b => { const v = (b.views || []).find(x => VIEW_KINDS.includes(x.kind)); if (v) return v.kind; const l = (b.views || []).find(x => x.kind === 'LODView'); return l && l.lods[0] && VIEW_KINDS.includes(l.lods[0].kind) ? l.lods[0].kind : 'VolumeView'; };
// rewrite every View/VolumeView string (also inside LODView) whose file resolves to oldRel -> newName
function rewriteRefs(doc, mdlBytes, oldRel, newName) {
  const t = sw.parse(mdlBytes);
  let hits = 0;
  (function walk(n) {
    for (const c of n.items || []) {
      if (c.type !== 'block') continue;
      if ((c.name === 'view' || c.name === 'volumeview') && c.items[1] && c.items[1].type === 'string') {
        const s = c.items[1].text.slice(1, -1);
        if (lc(resolveName(doc, s, doc.mdl, '.ply').rel) === lc(oldRel)) { sw.setValue(c, quote(newName), 1); hits++; }
      }
      walk(c);
    }
  })(t.root);
  return { bytes: sw.serialize(t), hits };
}

// ---------- geometry ----------
const comps = (v, key) => ((v.layout || []).find(e => e.key === key) || {}).comps || 0;
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function rotMatrix(deg) {
  const [ax, ay, az] = (deg || [0, 0, 0]).map(d => (Number(d) || 0) * Math.PI / 180);
  const X = [1, 0, 0, 0, Math.cos(ax), Math.sin(ax), 0, -Math.sin(ax), Math.cos(ax), 0, 0, 0];
  const Y = [Math.cos(ay), 0, -Math.sin(ay), 0, 1, 0, Math.sin(ay), 0, Math.cos(ay), 0, 0, 0];
  const Z = [Math.cos(az), Math.sin(az), 0, -Math.sin(az), Math.cos(az), 0, 0, 0, 1, 0, 0, 0];
  return M.mul(M.mul(X, Y), Z);
}
function matrixOf(args) {
  if (args.matrix) {
    const m = Array.from(args.matrix, Number);
    if (m.length !== 12 || m.some(x => !Number.isFinite(x))) fail('A matrix needs 12 numbers: the x, y and z axis rows, then the position.');
    return m;
  }
  let s = args.scale == null ? [1, 1, 1] : Array.isArray(args.scale) ? args.scale.map(Number) : [1, 1, 1].map(() => Number(args.scale));
  if (s.length !== 3 || s.some(x => !Number.isFinite(x) || x === 0)) fail('Scale needs one number or three, none of them 0.');
  let m = [s[0], 0, 0, 0, s[1], 0, 0, 0, s[2], 0, 0, 0];
  if (args.turn) m = M.mul(m, rotMatrix(args.turn));
  if (args.move) {
    const t = Array.from(args.move, Number);
    if (t.length !== 3 || t.some(x => !Number.isFinite(x))) fail('Move needs three numbers.');
    m = m.slice(); m[9] += t[0]; m[10] += t[1]; m[11] += t[2];
  }
  return m;
}
const isIdent = m => m.every((x, i) => Math.abs(x - IDENT[i]) < 1e-12);

// smooth normals from triangles (engine winding), area weighted. byPosition: vertices at one place share a normal
function computeNormals(pos, pc, idx, count, byPosition) {
  const acc = new Float64Array(count * 3);
  let group = null;
  if (byPosition) {
    const seen = new Map(); group = new Int32Array(count);
    for (let i = 0; i < count; i++) { const k = pos[i * pc] + ',' + pos[i * pc + 1] + ',' + pos[i * pc + 2]; let g = seen.get(k); if (g == null) { g = i; seen.set(k, i); } group[i] = g; }
  }
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a >= count || b >= count || c >= count) continue;
    const e1 = [0, 1, 2].map(q => pos[b * pc + q] - pos[a * pc + q]), e2 = [0, 1, 2].map(q => pos[c * pc + q] - pos[a * pc + q]);
    // clockwise front: n = e2 x e1
    const n = [e2[1] * e1[2] - e2[2] * e1[1], e2[2] * e1[0] - e2[0] * e1[2], e2[0] * e1[1] - e2[1] * e1[0]];
    for (const v of [a, b, c]) { const g = group ? group[v] : v; acc[g * 3] += n[0]; acc[g * 3 + 1] += n[1]; acc[g * 3 + 2] += n[2]; }
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const g = group ? group[i] : i;
    const x = acc[g * 3], y = acc[g * 3 + 1], z = acc[g * 3 + 2], l = Math.hypot(x, y, z);
    if (l > 0) { out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l; } else out[i * 3 + 2] = 1;
  }
  return out;
}
// tangents (x y z w) from positions, normals, uv0
function computeTangents(pos, pc, nrm, nc, uv, uc, idx, count) {
  const t1 = new Float64Array(count * 3), t2 = new Float64Array(count * 3);
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a >= count || b >= count || c >= count) continue;
    const e1 = [0, 1, 2].map(q => pos[b * pc + q] - pos[a * pc + q]), e2 = [0, 1, 2].map(q => pos[c * pc + q] - pos[a * pc + q]);
    const du1 = uv[b * uc] - uv[a * uc], dv1 = uv[b * uc + 1] - uv[a * uc + 1], du2 = uv[c * uc] - uv[a * uc], dv2 = uv[c * uc + 1] - uv[a * uc + 1];
    const d = du1 * dv2 - du2 * dv1; if (!d) continue;
    const r = 1 / d;
    const s = [0, 1, 2].map(q => (e1[q] * dv2 - e2[q] * dv1) * r), t = [0, 1, 2].map(q => (e2[q] * du1 - e1[q] * du2) * r);
    for (const v of [a, b, c]) for (let q = 0; q < 3; q++) { t1[v * 3 + q] += s[q]; t2[v * 3 + q] += t[q]; }
  }
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const n = [nrm[i * nc], nrm[i * nc + 1], nrm[i * nc + 2]], s = [t1[i * 3], t1[i * 3 + 1], t1[i * 3 + 2]];
    const dn = n[0] * s[0] + n[1] * s[1] + n[2] * s[2];
    let x = s[0] - n[0] * dn, y = s[1] - n[1] * dn, z = s[2] - n[2] * dn, l = Math.hypot(x, y, z);
    if (!(l > 1e-12)) { // no uv change: any vector across the normal
      const o = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], d2 = o[0] * n[0] + o[1] * n[1] + o[2] * n[2];
      x = o[0] - n[0] * d2; y = o[1] - n[1] * d2; z = o[2] - n[2] * d2; l = Math.hypot(x, y, z);
    }
    x /= l; y /= l; z /= l;
    const b = [n[1] * z - n[2] * y, n[2] * x - n[0] * z, n[0] * y - n[1] * x];
    const w = b[0] * t2[i * 3] + b[1] * t2[i * 3 + 1] + b[2] * t2[i * 3 + 2] < 0 ? -1 : 1;
    out.set([x, y, z, w], i * 4);
  }
  return out;
}
const allTriangles = o => { const out = []; for (let i = 0; i < o.parts.length; i++) out.push(...P.partTriangles(o, i)); return out.length || !o.indices ? out : Array.from(o.indices); };

// a mesh from faces of `o` (sorted face numbers): parts = runs of faces of one source part; vertices re-based by P.split
function subsetFaces(o, faces) {
  const part = new Int32Array(o.indices.length / 3).fill(-1);
  o.parts.forEach((p, i) => { for (let f = p.firstFace; f < p.firstFace + p.faceCount; f++) if (f < part.length) part[f] = i; });
  const idx = [], parts = [];
  let cur = null;
  for (const f of faces) {
    const pi = part[f];
    if (pi < 0) continue;
    if (!cur || cur.src !== pi) { cur = { ...o.parts[pi], src: pi, firstFace: idx.length / 3, faceCount: 0 }; parts.push(cur); }
    idx.push(o.indices[f * 3], o.indices[f * 3 + 1], o.indices[f * 3 + 2]); cur.faceCount++;
  }
  parts.forEach(p => delete p.src);
  const tmp = { ...o, parts, indices: o.indices instanceof Uint32Array ? Uint32Array.from(idx) : Uint16Array.from(idx), grid: null };
  return P.split(tmp, parts.map((_, i) => i));
}
function islands(o) {
  const nf = Math.floor(o.indices.length / 3), parent = new Int32Array(nf).map((_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const owner = new Map();
  for (let f = 0; f < nf; f++) for (let c = 0; c < 3; c++) {
    const v = o.indices[f * 3 + c], g = owner.get(v);
    if (g == null) owner.set(v, f); else { const a = find(f), b = find(g); if (a !== b) parent[a] = b; }
  }
  const used = new Set(); o.parts.forEach(p => { for (let f = p.firstFace; f < p.firstFace + p.faceCount; f++) used.add(f); });
  const groups = new Map();
  for (let f = 0; f < nf; f++) { if (!used.has(f)) continue; const r = find(f); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); }
  return [...groups.values()];
}

// new EPLY from a mesh in game space with engine winding: { positions, normals|null, uvs|null, indices, groups: [{ material, firstFace, faceCount }] }
function buildPly(mesh, opts = {}) {
  const n = mesh.positions.length / 3;
  if (!n) fail('The mesh has no vertices.');
  if (n > 65535) fail(`The mesh has ${n} vertices after splitting at texture seams; a model mesh holds at most 65535. Split it into several files first.`);
  const tangents = opts.tangents !== false;
  const flags = (P.F.normals | P.F.material | (tangents ? P.F.detail : 0)) >>> 0;
  const stride = tangents ? 48 : 32;
  const layout = P.partLayout({ tag: 'MESH', fvf: 0x112, flags }, stride);
  const normals = mesh.normals || computeNormals(mesh.positions, 3, mesh.indices, n, false);
  const uvs = mesh.uvs || new Float32Array(n * 2);
  const v = { count: n, stride, flags: 7, layout, layoutPart: 0, mixed: false, raw: null, position: Float32Array.from(mesh.positions), normal: Float32Array.from(normals), uv0: Float32Array.from(uvs) };
  if (tangents) v.tangent = computeTangents(v.position, 3, v.normal, 3, v.uv0, 2, mesh.indices, n);
  const parts = mesh.groups.map(g => ({ tag: 'MESH', fvf: 0x112, firstFace: g.firstFace, faceCount: g.faceCount, flags, textureFlags: undefined,
    material: g.material, inlineMaterial: null, textures: null, boneMap: null }));
  const o = { magic: 'EPLY', bounds: null, skin: null, parts, vertices: v, indices: Uint16Array.from(mesh.indices), basis: null, grid: null, mirrored: false, chunks: null, error: null };
  o.bounds = P.bounds(o);
  return encode(o);
}
const AXES = {
  'y-up': { to: p => [-p[2], -p[0], p[1]], from: g => [-g[1], g[2], -g[0]] },
  'z-up': { to: p => p, from: g => g },
};
function unitsOf(u) {
  if (u == null || u === 'metres' || u === 'meters' || u === 'm') return 20;
  if (u === 'units') return 1;
  const x = Number(u); if (!(x > 0)) fail('Units must be metres, game units or a number above 0.'); return x;
}
const safeBase = s => String(s || '').replace(/\.[^.]*$/, '').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '') || 'mesh';

// ---------- .mtl text ----------
const MTL_TEX = ['diffuse', 'bump', 'specular', 'envmap', 'mask', 'diffuse1', 'lightmap', 'height'];
const MTL_FLAGS = ['tile', 'glow', 'nolight', 'full_specular', 'emitsheat', 'translucency', 'alphatocoverage', 'no_outlines', 'fakereflection'];
const MTL_TYPES = ['simple', 'bump', 'envmap', 'multiply', 'layered', 'ocean'];
const BLENDS = ['none', 'test', 'blend', 'add', 'sub'];
function mtlRead(buf) {
  let t;
  try { t = sw.parse(buf); } catch (e) { return { error: e.message }; }
  const mat = t.root.items.find(x => x.type === 'block' && x.name === 'material');
  if (!mat) return { t, error: 'no {material ..} block' };
  const typeNode = mat.items[1] && mat.items[1].type === 'atom' ? mat.items[1] : null;
  const keys = mat.items.filter(x => x.type === 'block').map(b => ({ key: b.name, word: b.items[0] ? b.items[0].text : '', args: b.items.slice(1).filter(x => x.type !== 'block').map(x => (x.type === 'string' ? x.text.slice(1, -1) : x.text)), node: b, sub: b.items.some(x => x.type === 'block') }));
  return { t, mat, type: typeNode ? lc(typeNode.text) : null, typeNode, keys, error: null };
}
function mtlValueText(key, v) {
  const k = lc(key);
  if (MTL_TEX.includes(k)) { checkName(v); return quote(v); }
  if (k === 'blend') { if (!BLENDS.includes(lc(v))) fail('Blend must be one of: ' + BLENDS.join(', ') + '.'); return lc(v); }
  if (k === 'color') {
    const a = (Array.isArray(v) ? v : String(v).trim().split(/\s+/)).map(Number);
    if (a.length < 3 || a.length > 4 || a.some(x => !Number.isFinite(x))) fail('Colour needs three or four numbers: red, green, blue and gloss.');
    return quote(a.join(' '));
  }
  if (typeof v === 'number' || /^[-+]?(\d+\.?\d*|\.\d+)$/.test(String(v))) return String(Number(v));
  checkName(v); return quote(v);
}
function mtlApply(buf, change) {     // one change, bytes in, bytes out
  const r = mtlRead(buf);
  if (r.error) fail('The material file could not be read: ' + r.error);
  const { t, mat } = r;
  if (change.type) {
    const ty = lc(change.type);
    if (!MTL_TYPES.includes(ty)) fail('Material type must be one of: ' + MTL_TYPES.join(', ') + '.');
    if (r.typeNode) { if (lc(r.typeNode.text) === ty) return buf; sw.setValue(r.typeNode, ty); }
    else t.splices.push({ start: mat.items[0].end, end: mat.items[0].end, text: ' ' + ty });
    return sw.serialize(t);
  }
  const k = lc(change.key), hit = r.keys.filter(x => x.key === k);
  if (change.flag) {
    if (change.on) { if (hit.length) return buf; sw.insertChild(mat, mat.items.length, '{' + change.key + '}'); }
    else { if (!hit.length) return buf; hit.forEach(h => sw.removeNode(h.node)); }
    return sw.serialize(t);
  }
  if (change.value == null || change.value === '') { if (!hit.length) return buf; hit.forEach(h => sw.removeNode(h.node)); return sw.serialize(t); }
  const text = '{' + (hit[0] ? hit[0].word : change.key) + ' ' + mtlValueText(k, change.value) + '}';
  if (hit.length) {
    const h = hit[hit.length - 1];
    if (h.sub) fail(`{${change.key}} holds sub-blocks: change it in the text.`);
    if (buf.toString('latin1', h.node.start, h.node.end) === text) return buf;
    t.splices.push({ start: h.node.start, end: h.node.end, text });
  } else sw.insertChild(mat, mat.items.length, text);
  return sw.serialize(t);
}
function mtlChanges(args) {
  const ch = [];
  if (args.type) ch.push({ type: args.type });
  for (const [k, v] of Object.entries(args.set || {})) { if (!/^[a-z_][\w]*$/i.test(k)) fail(`${k} is not a material key.`); ch.push({ key: k, value: v }); }
  for (const [k, v] of Object.entries(args.flags || {})) { if (!MTL_FLAGS.includes(lc(k))) fail(`${k} is not a material switch (${MTL_FLAGS.join(', ')}).`); ch.push({ key: k, flag: true, on: !!v }); }
  return ch;
}
function mtlNew(type, diffuse) {
  const lines = ['{material ' + (type || 'simple')];
  if (diffuse) lines.push('\t{diffuse ' + quote(diffuse) + '}');
  lines.push('}', '');
  return Buffer.from(lines.join('\r\n'), 'latin1');
}

// texture lookup
function texBase(doc, value, baseRel) {
  const l = String(value).replace(/\\/g, '/');
  const rr = resRoot(doc);
  if (l.startsWith('$/')) return pp.normalize(rr + 'texture/common/' + l.slice(2));
  if (l.startsWith('/')) return pp.normalize(rr + l.slice(1));
  return pp.normalize(pp.join(pp.dirname(baseRel), l));
}
function texFind(doc, value, baseRel) {
  if (!value) return { value, rel: null, found: false, how: 'empty' };
  if (String(value).startsWith('#')) return { value, rel: null, found: true, how: 'alias' };
  const base = texBase(doc, value, baseRel), lb = lc(base), hasExt = TEX_EXTS.includes(lc(pp.extname(base)));
  for (const k of doc.files.keys()) {
    const lk = lc(k), f = doc.files.get(k);
    if (!f || !f.bytes) continue;
    if (hasExt ? lk === lb : TEX_EXTS.some(e => lk === lb + e)) return { value, rel: k, found: true, how: 'document' };
  }
  const on = onDisk(doc);
  if (on) for (const e of hasExt ? [''] : TEX_EXTS) if (on(base + e)) return { value, rel: base + e, found: true, how: 'game or mod' };
  return { value, rel: base, found: false, how: 'missing' };
}
// a file outside the document, in the mod or the game: doc.exists(rel) when the core has it, else doc.fetch(rel) (the real core:
// it reads the bytes, so the answer is kept per document; textures are not edited by these ops)
const SEEN = new WeakMap();
function onDisk(doc) {
  const ask = typeof doc.exists === 'function' ? r => doc.exists(r) : typeof doc.fetch === 'function' ? r => !!doc.fetch(r) : null;
  if (!ask) return null;
  if (!SEEN.has(doc)) SEEN.set(doc, new Map());
  const memo = SEEN.get(doc);
  return r => { const k = lc(r); if (!memo.has(k)) { let y = false; try { y = !!ask(r); } catch (e) { y = false; } memo.set(k, y); } return memo.get(k); };
}
function mtlInfo(doc, rel) {
  const k = fileKey(doc, rel);
  if (!k) return { rel, exists: false };
  const f = doc.files.get(k), r = mtlRead(f.bytes);
  const out = { rel: k, exists: true, from: f.from || null, dirty: !!f.dirty, text: f.bytes.toString('latin1'), error: r.error || null, type: r.type || null, keys: [], flags: [], textures: [] };
  if (r.error) return out;
  for (const x of r.keys) {
    if (MTL_FLAGS.includes(x.key) && !x.args.length) out.flags.push(x.key);
    else out.keys.push({ key: x.key, args: x.args, sub: x.sub });
    if (MTL_TEX.includes(x.key) && x.args[0]) out.textures.push(Object.assign({ key: x.key }, texFind(doc, x.args[0], k)));
  }
  return out;
}

// ---------- ops ----------
const ops = {};
const op = (name, apply, check) => { ops[name] = check ? { apply, check } : { apply }; };
const plyRel = (doc, args) => { if (!args.rel) fail('Pick a mesh first.'); return readPly(doc, args.rel); };
const geomOp = (doc, args, fn) => { const { k, o } = plyRel(doc, args); return result(doc, { [k]: encode(fn(o)) }); };

op('ply.attach', (doc, args) => {
  const m = model(doc), b = bone(m, args.bone);
  let rel, files = {};
  if (args.data) {
    const buf = fromB64(args.data); checkPly(buf, 'That file');
    rel = args.rel || resolveName(doc, checkName(/\.ply$/i.test(args.name || '') ? args.name : (args.name || b.name) + '.ply'), doc.mdl).rel;
    if (fileKey(doc, rel) && !args.overwrite) fail(`A mesh called ${rel} is already in this model. Pick another name or allow replacing it.`);
    files[rel] = buf;
  } else {
    if (!args.rel) fail('Pick a mesh file to put on the bone.');
    rel = readPly(doc, args.rel).k;
  }
  const name = nameFor(doc, rel);
  files[doc.mdl] = setBoneViews(m.bytes, b.path, { kind: args.kind && VIEW_KINDS.includes(args.kind) ? args.kind : meshKindOf(b), name });
  return result(doc, files, { bone: b.path, rel, name });
});
op('ply.detach', (doc, args) => {
  const m = model(doc), b = bone(m, args.bone);
  const mine = meshRefs(doc, m).filter(r => r.bone === b.path);
  if (!mine.length) fail(`The bone ${b.name} has no mesh.`);
  const buf = setBoneViews(m.bytes, b.path, null), files = { [doc.mdl]: buf };
  if (args.drop) {
    const left = meshRefs(doc, M.parse(buf));
    for (const r of mine) if (r.exists && !left.some(x => lc(x.rel) === lc(r.rel))) files[r.rel] = null;
  }
  return result(doc, files, { bone: b.path, removed: mine.map(r => r.rel) });
});
op('ply.replace', (doc, args) => {
  const { k, o } = plyRel(doc, args);
  const buf = args.data ? fromB64(args.data) : args.from ? doc.files.get(readPly(doc, args.from).k).bytes : fail('Give the new mesh: a file or another mesh of this model.');
  const n = checkPly(buf, 'The new mesh'), warn = [];
  if (!!o.skin !== !!n.skin) warn.push(n.skin ? 'The new mesh is skinned and the old one was not.' : 'The old mesh was skinned and the new one is not.');
  if (o.skin && n.skin && o.skin.join() !== n.skin.join()) warn.push('The skin bones differ: ' + n.skin.join(', ') + '.');
  return result(doc, { [k]: Buffer.from(buf) }, { warnings: warn });
});
op('ply.rename', (doc, args) => {
  const { k } = plyRel(doc, args);
  let to = checkName(String(args.to || '').trim());
  if (!to) fail('Give the new file name.');
  if (!/\.ply$/i.test(to)) to += '.ply';
  const nrel = to.includes('/') ? pp.normalize(to) : pp.join(pp.dirname(k), to);
  if (lc(nrel) === lc(k)) fail('That is already its name.');
  if (fileKey(doc, nrel)) fail(`A file called ${nrel} is already in this model.`);
  const rr = rewriteRefs(doc, doc.files.get(fileKey(doc, doc.mdl)).bytes, k, nameFor(doc, nrel));
  const files = { [nrel]: Buffer.from(doc.files.get(k).bytes), [k]: null };
  if (rr.hits) files[doc.mdl] = rr.bytes;
  return result(doc, files, { from: k, to: nrel, views: rr.hits });
});
op('ply.transform', (doc, args) => {
  const m = matrixOf(args);
  if (isIdent(m)) fail('That change does nothing: give a move, a turn, a scale or a matrix.');
  return geomOp(doc, args, o => P.transform(o, m, { keepWinding: !!args.keepWinding }));
});
op('ply.scale', (doc, args) => {
  const f = args.factor;
  const m = matrixOf({ scale: f == null ? 1 : f });
  if (isIdent(m)) fail('A scale of 1 does nothing.');
  return geomOp(doc, args, o => P.transform(o, m));
});
op('ply.mirror', (doc, args) => {
  const a = { x: 0, y: 1, z: 2 }[lc(args.axis)];
  if (a == null) fail('Mirror across x, y or z.');
  const s = [1, 1, 1]; s[a] = -1;
  return geomOp(doc, args, o => P.transform(o, matrixOf({ scale: s })));
});
op('ply.flip', (doc, args) => geomOp(doc, args, o => {
  if (!o.indices) fail('The mesh has no triangles.');
  const sel = args.parts == null || args.parts === 'all' ? o.parts.map((_, i) => i) : [].concat(args.parts).map(Number);
  for (const i of sel) if (!o.parts[i]) fail(`There is no part ${i}.`);
  const ix = o.indices.slice(), v = { ...o.vertices }, touched = new Set();
  for (const i of sel) {
    const p = o.parts[i], a = Math.max(0, p.firstFace * 3), b = Math.min(ix.length, (p.firstFace + p.faceCount) * 3);
    for (let q = a; q + 2 < b; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; touched.add(ix[q]); touched.add(ix[q + 1]); touched.add(ix[q + 2]); }
  }
  const nc = comps(v, 'normal'), tc = comps(v, 'tangent');
  if (v.normal && nc >= 3) { v.normal = new Float32Array(v.normal); for (const k of touched) for (let c = 0; c < 3; c++) v.normal[k * nc + c] = -v.normal[k * nc + c]; }
  if (v.tangent && tc >= 4) { v.tangent = new Float32Array(v.tangent); for (const k of touched) v.tangent[k * tc + 3] = -v.tangent[k * tc + 3]; }
  return { ...o, indices: ix, vertices: v };
}));
function needNormals(o) {
  const v = o.vertices;
  if (!v || !v.position) fail('The mesh has no vertices.');
  if (v.mixed) fail('The parts of this mesh read the vertices in different layouts, so normals cannot be rebuilt safely.');
  if (!v.normal || comps(v, 'normal') < 3) fail('This mesh stores no normals (the game makes them face up), so there is nothing to rebuild.');
}
function withTangents(o, v) {
  const tc = comps(v, 'tangent'), uc = comps(v, 'uv0');
  if (!v.tangent || tc < 4) return false;
  if (!v.uv0 || uc < 2) fail('Tangents need texture coordinates and this mesh has none.');
  v.tangent = computeTangents(v.position, comps(v, 'position'), v.normal, comps(v, 'normal'), v.uv0, uc, allTriangles(o), v.count);
  return true;
}
op('ply.normals', (doc, args) => geomOp(doc, args, o => {
  needNormals(o);
  const v = { ...o.vertices }, nc = comps(v, 'normal');
  const n = computeNormals(v.position, comps(v, 'position'), allTriangles(o), v.count, args.smooth === 'position');
  const out = new Float32Array(v.normal);
  for (let i = 0; i < v.count; i++) for (let c = 0; c < 3; c++) out[i * nc + c] = n[i * 3 + c];
  v.normal = out;
  if (args.tangents !== false) withTangents(o, v);
  return { ...o, vertices: v };
}));
op('ply.tangents', (doc, args) => geomOp(doc, args, o => {
  needNormals(o);
  const v = { ...o.vertices };
  if (!withTangents(o, v)) fail('This mesh stores no tangents (only bump meshes do).');
  return { ...o, vertices: v };
}));
op('ply.weld', (doc, args) => {
  const { k, o } = plyRel(doc, args), v = o.vertices;
  if (!v || !v.count || !o.indices) fail('The mesh has no vertices.');
  if (v.mixed) fail('The parts of this mesh read the vertices in different layouts, so they cannot be welded safely.');
  const tol = args.tolerance == null ? 0.001 : Number(args.tolerance);
  if (!(tol > 0)) fail('The tolerance must be above 0.');
  const covered = new Uint8Array(v.stride);
  for (const e of v.layout) for (let i = 0; i < e.size; i++) covered[e.offset + i] = 1;
  const keyOf = i => {
    const parts = [];
    for (const e of v.layout) {
      const a = v[e.key]; if (!a) continue;
      const q = e.key === 'position' ? tol : e.type <= 3 ? 1e-4 : 0;
      for (let c = 0; c < e.comps; c++) parts.push(q ? Math.round(a[i * e.comps + c] / q) : a[i * e.comps + c]);
    }
    if (v.raw) for (let b = 0; b < v.stride; b++) if (!covered[b]) parts.push(v.raw[i * v.stride + b]);
    return parts.join(',');
  };
  const first = new Map(), map = new Int32Array(v.count);
  for (let i = 0; i < v.count; i++) { const kk = keyOf(i); const f = first.get(kk); map[i] = f == null ? i : f; if (f == null) first.set(kk, i); }
  const ix = o.indices.slice();
  let changed = 0;
  for (let i = 0; i < ix.length; i++) if (ix[i] < v.count && map[ix[i]] !== ix[i]) { ix[i] = map[ix[i]]; changed++; }
  if (!changed) return { files: {}, info: { before: v.count, after: v.count } };
  const out = P.split({ ...o, indices: ix }, o.parts.map((_, i) => i));
  return result(doc, { [k]: encode(out) }, { before: v.count, after: out.vertices.count });
});
op('ply.bounds', (doc, args) => {
  const { k, o } = plyRel(doc, args);
  const b = P.bounds(o);
  if (!b) fail('The mesh has no vertices to measure.');
  return result(doc, { [k]: encode({ ...o, bounds: b }) }, { bounds: Array.from(b) });
});
op('ply.lods', (doc, args) => {
  const m = model(doc), b = bone(m, args.bone);
  const list = [].concat(args.files || []).filter(Boolean);
  if (!list.length) fail('Give at least one mesh: the first is the nearest level of detail.');
  const names = list.map(r => nameFor(doc, readPly(doc, r).k));
  const kind = meshKindOf(b);
  const set = list.length === 1 && !args.off ? { kind, name: names[0] } : { lods: names, lodKind: kind, off: !!args.off };
  return result(doc, { [doc.mdl]: setBoneViews(m.bytes, b.path, set) }, { bone: b.path, lods: names });
});
op('ply.skin', (doc, args) => geomOp(doc, args, o => {
  if (args.rename) {
    if (!o.skin) fail('This mesh is not skinned.');
    const from = String(args.rename.from || ''), to = checkName(String(args.rename.to || '').trim());
    if (!to) fail('Give the new bone name.');
    const fi = o.skin.findIndex(n => lc(n) === lc(from));
    if (fi < 0) fail(`The skin has no bone called ${from}.`);
    const ti = o.skin.findIndex(n => lc(n) === lc(to));
    if (ti < 0) { const skin = o.skin.slice(); skin[fi] = to; return { ...o, skin }; }
    // the name is already there: point everything at it (the old slot stays, unused)
    const parts = o.parts.map(p => (p.boneMap ? { ...p, boneMap: p.boneMap.map(x => (x === fi + 1 ? ti + 1 : x)) } : p));
    let v = o.vertices;
    if (v && v.boneIndex && o.parts.some(p => p.flags & P.F.skinned && !(p.flags & P.F.boneMap))) {
      v = { ...v, boneIndex: Uint8Array.from(v.boneIndex, x => (x === fi ? ti : x)) };
    }
    return { ...o, parts, vertices: v };
  }
  if (args.clamp) {
    const v = o.vertices;
    if (!v || !v.weight) fail('This mesh stores no skin weights.');
    const w = Float32Array.from(v.weight, x => (Number.isNaN(x) ? 1 : Math.min(1, Math.max(0, x))));
    return { ...o, vertices: { ...v, weight: w } };
  }
  fail('Say what to do with the skin: rename a bone or clamp the weights.');
}));
op('ply.merge', (doc, args) => {
  const a = plyRel(doc, args), b = readPly(doc, args.from || fail('Pick the mesh to add.'));
  let r;
  try { r = O.merge(a.o, b.o, { matrixB: args.matrix ? matrixOf({ matrix: args.matrix }) : null }); } catch (e) { fail(e.message); }
  let target = a.k;
  if (args.out) {
    let out = checkName(String(args.out)); if (!/\.ply$/i.test(out)) out += '.ply';
    target = out.includes('/') ? pp.normalize(out) : pp.join(pp.dirname(a.k), out);
    if (fileKey(doc, target) && lc(fileKey(doc, target)) !== lc(a.k)) fail(`A file called ${target} is already in this model.`);
  }
  return result(doc, { [target]: encode(r.ply) }, { out: target, changed: r.changed });
});
op('ply.mergeChild', (doc, args) => {
  const m = model(doc), child = bone(m, args.bone);
  const parent = child.parent && m.bones.find(b => b.path === child.parent);
  if (!parent) fail(`The bone ${child.name} has no parent.`);
  if (m.bones.some(b => b.parent === child.path)) fail(`The bone ${child.name} has bones under it: merge those first.`);
  if (!child.exact) fail(`The position of ${child.name} is written in a form that is not read exactly here.`);
  const refs = meshRefs(doc, m), cm = refs.find(r => r.bone === child.path && (r.lod == null || r.lod === 0));
  if (!cm || !cm.exists) fail(`The bone ${child.name} has no mesh${cm ? ' (' + cm.rel + ' is missing)' : ''}.`);
  const pm = refs.find(r => r.bone === parent.path && (r.lod == null || r.lod === 0));
  if (pm && !pm.exists) fail(`The parent mesh ${pm.rel} is missing.`);
  if (pm && pm.view === 'LODView') fail(`The parent ${parent.name} has levels of detail: merge into one of its files by hand.`);
  let r;
  try { r = O.mergeChildIntoParent(pm ? readPly(doc, pm.rel).o : null, readPly(doc, cm.rel).o, child.matrix, { rebind: { from: child.name, to: parent.name } }); } catch (e) { fail(e.message); }
  const target = pm ? pm.rel : pp.join(pp.dirname(cm.rel), safeBase(parent.name) + '_merged_' + safeBase(child.name) + '.ply');
  if (!pm && fileKey(doc, target)) fail(`A file called ${target} is already in this model.`);
  let mdl = setBoneViews(m.bytes, child.path, null);
  if (!pm) mdl = setBoneViews(mdl, parent.path, { kind: meshKindOf(child), name: nameFor(doc, target) });
  const files = { [target]: encode(r.ply), [doc.mdl]: mdl };
  return result(doc, files, { out: target, changed: r.changed.concat(child.sequences && child.sequences.length ? ['The child bone has animation: the merged mesh is frozen where the bone rests.'] : []) });
});
op('ply.demerge', (doc, args) => {
  const m = model(doc), b = bone(m, args.bone);
  const ref = meshRefs(doc, m).find(r => r.bone === b.path && (r.lod == null || r.lod === 0));
  if (!ref || !ref.exists) fail(`The bone ${b.name} has no mesh to split.`);
  const { k, o } = readPly(doc, ref.rel);
  const by = args.by || 'parts';
  let groups;
  if (by === 'islands') {
    if (o.magic !== 'EPLY') fail('Map meshes cannot be split into pieces here.');
    if (!o.indices) fail('The mesh has no triangles.');
    groups = islands(o).map((faces, i) => {
      let ply = subsetFaces(o, faces), offset = null;
      if (args.recentre && ply.bounds) { const c = [0, 1, 2].map(q => (ply.bounds[q] + ply.bounds[q + 3]) / 2); ply = P.transform(ply, [1, 0, 0, 0, 1, 0, 0, 0, 1, -c[0], -c[1], -c[2]]); offset = c; }
      return { ply, offset, key: 'piece ' + (i + 1) };
    });
  } else {
    try { groups = O.demerge(o, by === 'material' ? 'material' : 'parts', { recentre: !!args.recentre }).map(g => ({ ply: g.ply, offset: g.offset ? g.offset.slice(9) : null, key: g.key })); } catch (e) { fail(e.message); }
  }
  groups = groups.filter(g => g.ply.parts.length);
  if (groups.length < 2 && !args.keepParent) fail('The mesh has only one piece by that rule: nothing to split.');
  if (groups.length > 200) fail(`That would make ${groups.length} pieces. Pick another rule.`);
  const base = pp.join(pp.dirname(k), pp.basename(k).replace(/\.ply$/i, ''));
  const boneNames = new Set(m.bones.map(x => lc(x.name)));
  const files = {}, made = [];
  let n = 0;
  for (const g of groups) {
    let rel, bn;
    do { n++; const nnn = String(n).padStart(3, '0'); rel = `${base}_demerge_${nnn}.ply`; bn = `${b.name}_part_${nnn}`; } while (fileKey(doc, rel) || files[rel] || boneNames.has(lc(bn)));
    files[rel] = encode(g.ply); boneNames.add(lc(bn));
    made.push({ rel, bone: bn, offset: g.offset, key: g.key });
  }
  let mdl = args.keepParent ? Buffer.from(m.bytes) : setBoneViews(m.bytes, b.path, null);
  const mm = M.parse(mdl), node = bone(mm, b.path).node, kind = meshKindOf(b);
  for (const x of made) {
    const pos = x.offset && x.offset.some(v => v) ? ` {Position ${x.offset.map(M.fmtNum).join(' ')}}` : '';
    sw.insertChild(node, node.items.length, `{bone ${quote(x.bone)}${pos} {${kind} ${quote(nameFor(doc, x.rel))}}}`);
  }
  mdl = sw.serialize(mm.tree);
  if (M.parse(mdl).error) fail('The model file could not be changed for the new bones.');
  files[doc.mdl] = mdl;
  return result(doc, files, { pieces: made });
});
op('ply.tweak', (doc, args) => geomOp(doc, args, o => {
  let r;
  try {
    r = O.tweak(o, { meshFlagsSet: args.set, meshFlagsClear: args.clear, vertexFlagsSet: args.vset, vertexFlagsClear: args.vclear,
      material: args.material || null, parts: args.parts == null ? 'all' : args.parts, force: !!args.force });
  } catch (e) { fail(e.message); }
  return r.ply;
}));
op('ply.import', (doc, args) => {
  const parsed = OBJ.parse(String(args.obj || ''));
  if (parsed.error) fail('The OBJ file could not be used: ' + parsed.error + '.');
  const mesh = OBJ.toMesh(parsed);
  const s = unitsOf(args.units), ax = AXES[args.axis || 'y-up'] || fail('Axis must be y-up or z-up.');
  const n = mesh.positions.length / 3, pos = new Float32Array(n * 3), nrm = mesh.normals ? new Float32Array(n * 3) : null, uv = mesh.uvs ? new Float32Array(n * 2) : null;
  for (let i = 0; i < n; i++) {
    const p = ax.to([mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]);
    pos.set(p.map(x => x * s), i * 3);
    if (nrm) { const q = ax.to([mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]]), l = Math.hypot(...q) || 1; nrm.set(q.map(x => x / l), i * 3); }
    if (uv) { uv[i * 2] = mesh.uvs[i * 2]; uv[i * 2 + 1] = 1 - mesh.uvs[i * 2 + 1]; }
  }
  const idx = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < idx.length; i += 3) { idx[i] = mesh.indices[i]; idx[i + 1] = mesh.indices[i + 2]; idx[i + 2] = mesh.indices[i + 1]; }
  const base = safeBase(args.name || 'imported');
  const dir = pp.dirname(doc.mdl), rel = pp.join(dir, base + '.ply');
  if (fileKey(doc, rel) && !args.overwrite) fail(`A mesh called ${rel} is already in this model. Pick another name or allow replacing it.`);
  const libs = [].concat(args.mtl || []).flatMap(x => OBJ.parseMtl(x && x.text || ''));
  const files = {}, mats = [];
  const groups = mesh.groups.map(g => {
    const mname = safeBase(g.material || base), mrel = pp.join(dir, mname + '.mtl');
    if (!fileKey(doc, mrel) && !files[mrel]) {
      const lib = libs.find(x => x.name === g.material);
      const tex = lib && lib.map_Kd ? safeBase(pp.basename(String(lib.map_Kd).replace(/\\/g, '/'))) : mname;
      files[mrel] = mtlNew('simple', tex); mats.push(mrel);
    }
    return { material: mname + '.mtl', firstFace: g.firstFace, faceCount: g.faceCount };
  });
  files[rel] = buildPly({ positions: pos, normals: nrm, uvs: uv, indices: idx, groups }, { tangents: args.tangents !== false });
  if (args.bone) {
    const m = model(doc), b = bone(m, args.bone);
    files[doc.mdl] = setBoneViews(m.bytes, b.path, { kind: meshKindOf(b), name: nameFor(doc, rel) });
  }
  return result(doc, files, { rel, vertices: n, triangles: idx.length / 3, materials: mats, warnings: parsed.warnings.slice(0, 20), normalsMade: !mesh.normals, uvsMissing: !mesh.uvs });
});

op('mat.set', (doc, args) => {
  const { k, o } = plyRel(doc, args);
  let name = checkName(String(args.name || '').trim());
  if (!name) fail('Give the material name.');
  if (!/\.mtl$/i.test(name)) name += '.mtl';
  const sel = args.part == null || args.part === 'all' ? o.parts.map((_, i) => i) : [Number(args.part)];
  let x = o;
  for (const i of sel) { if (!o.parts[i]) fail(`There is no part ${args.part}.`); x = P.setMaterial(x, i, name); }
  const files = { [k]: encode(x) };
  const mr = resolveName(doc, name, k);
  if (args.create && !mr.exists) files[mr.rel] = mtlNew('simple', safeBase(pp.basename(name)));
  return result(doc, files, { material: name, rel: mr.rel, exists: mr.exists });
});
op('mat.textures', (doc, args) => geomOp(doc, args, o => {
  const i = Number(args.part), p = o.parts[i];
  if (!p) fail(`There is no part ${args.part}.`);
  if (p.flags & P.F.material) fail('This part uses a material file: change the textures in that material instead.');
  const n = P.textureNameCount(p), list = [].concat(args.textures || []).map(s => (s ? checkName(String(s)) : ''));
  if (list.length > n) fail(`This part has room for ${n} texture name${n === 1 ? '' : 's'}.`);
  while (list.length < n) list.push((p.textures || [])[list.length] || '');
  const parts = o.parts.slice(); parts[i] = { ...p, textures: list };
  return { ...o, parts };
}));
op('mat.edit', (doc, args) => {
  if (!args.rel) fail('Pick a material first.');
  const k = fileKey(doc, args.rel);
  if (!k) fail(`The material ${args.rel} is not in this model.`);
  const ch = mtlChanges(args);
  if (!ch.length) fail('Nothing to change.');
  let buf = doc.files.get(k).bytes;
  for (const c of ch) buf = mtlApply(buf, c);
  return result(doc, { [k]: buf });
});
op('mat.create', (doc, args) => {
  let rel = args.rel;
  if (!rel) { let n = checkName(String(args.name || '').trim()); if (!n) fail('Give the material name.'); if (!/\.mtl$/i.test(n)) n += '.mtl'; rel = pp.join(pp.dirname(doc.mdl), n); }
  if (fileKey(doc, rel) && !args.overwrite) fail(`A material called ${rel} is already in this model.`);
  let buf = mtlNew(args.type && MTL_TYPES.includes(lc(args.type)) ? lc(args.type) : 'simple', null);
  for (const c of mtlChanges({ set: args.set, flags: args.flags })) buf = mtlApply(buf, c);
  return { files: { [rel]: buf }, info: { rel } };
});

// ---------- states ----------
function partFacts(doc, k, o, i) {
  const p = o.parts[i], tris = P.partTriangles(o, i);
  const f = { index: i, tag: p.tag, flags: p.flags >>> 0, flagNames: O.flagNames(p.flags >>> 0), triangles: Math.floor(tris.length / 3), vertices: new Set(tris).size,
    material: p.material || null, inline: !!p.inlineMaterial, textures: p.textures || null, materialRel: null, materialFound: null, textureFound: null, boneMap: p.boneMap || null };
  if (p.material) { const r = resolveName(doc, p.material, k); f.materialRel = r.rel; f.materialFound = r.exists; }
  if (p.textures) f.textureFound = p.textures.map(t => (t ? texFind(doc, t, k).found : null));
  return f;
}
function meshFacts(doc, rel) {
  const k = fileKey(doc, rel);
  if (!k) return { exists: false };
  const f = doc.files.get(k), o = doc.read(k);
  if (!o || o.error) return { exists: true, rel: k, error: (o && o.error) || 'unreadable' };
  const v = o.vertices;
  return { exists: true, rel: k, from: f.from || null, dirty: !!f.dirty, error: null, magic: o.magic, vertices: v ? v.count : 0, triangles: o.indices ? Math.floor(o.indices.length / 3) : 0,
    skinned: O.flagNames(o.parts.reduce((a, p) => a | p.flags, 0)).includes('skinned') || !!o.skin, skin: o.skin || null,
    bounds: o.bounds ? Array.from(o.bounds) : null, mirrored: !!o.mirrored, vertexFlags: v ? v.flags || 0 : 0,
    parts: o.parts.map((_, i) => partFacts(doc, k, o, i)) };
}
const state = {};
state['ply.list'] = doc => {
  const m = model(doc), refs = meshRefs(doc, m);
  const meshes = refs.map((r, i) => Object.assign({ colour: i }, r, meshFacts(doc, r.rel), { exists: r.exists }));
  const used = new Set(refs.map(r => lc(r.rel)));
  const loose = [];
  for (const [k, f] of doc.files) if (f && f.bytes && (f.kind === 'ply' || /\.ply$/i.test(k)) && !used.has(lc(k))) loose.push(Object.assign({ rel: k }, meshFacts(doc, k)));
  return { meshes, loose, missing: meshes.filter(x => !x.exists).length, bones: m.bones.map(b => ({ path: b.path, name: b.name, parent: b.parent })) };
};
state['ply.get'] = (doc, q) => {
  const { k, o } = readPly(doc, (q && q.rel) || fail('Pick a mesh first.'));
  const info = O.info(o), v = o.vertices;
  return Object.assign(info, meshFacts(doc, k), {
    usedBy: meshRefs(doc).filter(r => lc(r.rel) === lc(k)).map(r => ({ bone: r.bone, view: r.view, lod: r.lod })),
    uvCount: v ? v.layout.filter(e => /^uv\d+$/.test(e.key)).length : 0, hasNormals: !!(v && v.normal), hasTangents: !!(v && v.tangent),
    canNormals: !!(v && v.normal && !v.mixed), canWeld: !!(v && v.count && !v.mixed), flagList: Object.keys(O.FLAG_NAMES),
  });
};
state['ply.export'] = (doc, q) => {
  q = q || {};
  const { k, o } = readPly(doc, q.rel || fail('Pick a mesh first.'));
  const s = unitsOf(q.units), ax = AXES[q.axis || 'y-up'] || fail('Axis must be y-up or z-up.');
  const pos = [], nrm = [], uv = [], idx = [], groups = [], mats = new Map();
  let haveN = true, haveT = true;
  o.parts.forEach((p, i) => {
    const a = P.partAttributes(o, i) || {}, map = new Map(), first = idx.length / 3, tris = P.partTriangles(o, i);
    const pc = ((a.layout || []).find(e => e.key === 'position') || {}).comps || 3, nc = ((a.layout || []).find(e => e.key === 'normal') || {}).comps || 3;
    if (!a.position) return;
    if (!a.normal) haveN = false; if (!a.uv0) haveT = false;
    const vid = x => {
      let q2 = map.get(x); if (q2 != null) return q2;
      q2 = pos.length / 3; map.set(x, q2);
      const g = ax.from([a.position[x * pc], a.position[x * pc + 1], a.position[x * pc + 2]]); pos.push(...g.map(c => c / s));
      if (a.normal) nrm.push(...ax.from([a.normal[x * nc], a.normal[x * nc + 1], a.normal[x * nc + 2]])); else nrm.push(0, 0, 1);
      if (a.uv0) uv.push(a.uv0[x * 2], 1 - a.uv0[x * 2 + 1]); else uv.push(0, 0);
      return q2;
    };
    for (let t = 0; t + 2 < tris.length; t += 3) idx.push(vid(tris[t]), vid(tris[t + 2]), vid(tris[t + 1]));
    const mname = safeBase(p.material ? pp.basename(p.material) : (p.textures || []).find(Boolean) ? pp.basename(p.textures.find(Boolean)) : 'part' + i);
    groups.push({ material: mname, firstFace: first, faceCount: idx.length / 3 - first });
    if (!mats.has(mname)) {
      let tex = null;
      if (p.material) { const mi = mtlInfo(doc, resolveName(doc, p.material, k).rel); const d = (mi.textures || []).find(t => t.key === 'diffuse'); if (d) tex = d.found && d.rel ? pp.basename(d.rel) : pp.basename(d.value); }
      else if ((p.textures || []).find(Boolean)) { const t = texFind(doc, p.textures.find(Boolean), k); tex = t.found && t.rel ? pp.basename(t.rel) : pp.basename(t.value); }
      mats.set(mname, { name: mname, map_Kd: tex });
    }
  });
  const name = pp.basename(k).replace(/\.ply$/i, '');
  const obj = OBJ.write({ positions: pos, normals: haveN ? nrm : null, uvs: haveT ? uv : null, indices: idx, groups }, { name, mtllib: name + '.mtl' });
  return { name, obj, mtl: OBJ.writeMtl([...mats.values()]), vertices: pos.length / 3, triangles: idx.length / 3, skinned: !!o.skin };
};
state['mat.list'] = doc => {
  const refs = meshRefs(doc), seen = new Map(), partTex = [];
  const plys = new Set(refs.filter(r => r.exists).map(r => r.rel));
  for (const [k, f] of doc.files) if (f && f.bytes && (f.kind === 'ply' || /\.ply$/i.test(k))) plys.add(k);
  for (const k of plys) {
    const o = doc.read(k); if (!o || o.error) continue;
    o.parts.forEach((p, i) => {
      if (p.material) {
        const r = resolveName(doc, p.material, k), key = lc(r.rel);
        if (!seen.has(key)) seen.set(key, { rel: r.rel, name: p.material, usedBy: [] });
        seen.get(key).usedBy.push({ mesh: k, part: i });
      } else if (p.textures) p.textures.forEach((t, j) => { if (t) partTex.push(Object.assign({ mesh: k, part: i, slot: j }, texFind(doc, t, k))); });
      else if (p.inlineMaterial) partTex.push({ mesh: k, part: i, inline: true });
    });
  }
  for (const [k, f] of doc.files) if (f && f.bytes && (f.kind === 'mtl' || /\.mtl$/i.test(k)) && !seen.has(lc(k))) seen.set(lc(k), { rel: k, name: pp.basename(k), usedBy: [] });
  const materials = [...seen.values()].map(x => { const i = mtlInfo(doc, x.rel); delete i.text; return Object.assign(x, i); });
  const all = materials.flatMap(m => (m.textures || []).map(t => Object.assign({ material: m.rel }, t))).concat(partTex.filter(t => !t.inline));
  return { materials, partTextures: partTex, found: all.filter(t => t.found), missing: all.filter(t => !t.found), missingMaterials: materials.filter(m => !m.exists && m.usedBy.length),
    types: MTL_TYPES, flags: MTL_FLAGS, textureKeys: MTL_TEX, blends: BLENDS };
};
state['mat.get'] = (doc, q) => {
  if (!q || !q.rel) fail('Pick a material first.');
  return mtlInfo(doc, q.rel);
};

module.exports = { ops, state, _t: { buildPly, computeNormals, computeTangents, matrixOf, resolveName, meshRefs, mtlApply, mtlRead, texFind, islands, subsetFaces, AXES } };
