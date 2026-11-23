// model/edit/vol: collision volumes, obstacles and areas of the model editor (contract tools/lib/model/edit/README.md;
// parity rows VOL-01..16 and OBST-01..03 in tools/soedit/parity.md).
//
// Ops take a document ({ mdl, files: Map rel -> { rel, kind, bytes }, read(rel)? }) and return
// { files: { rel: Buffer | null }, info }; they never touch the disk and leave every byte they do not change as it was
// (.mdl edits are splices through tools/lib/model/mdl.js edit() or tools/lib/sdlwrite.js; .vol through vol.js write()).
// A refused op throws an Error with a plain sentence and changes nothing.
//
// Ids: a volume is '<bone path>/<name>' (mdl.js). An obstacle or area is 'obstacle:<n>' / 'area:<n>' (n = order in the
// file, from 0); its name is shown beside it. Sizes in engine units (20 per metre); thickness as written (mm).
// Thickness sides in the order trace.js and the armor part use: 0 front, 1 top, 2 left, 3 right, 4 rear, 5 bottom.
//
// Ops (args):
//   vol.add          { bone, name?, kind: box|cylinder|sphere|polyhedron, size | radius,length | radius | file, matrix?,
//                      data? (base64 .vol bytes: a new .vol file next to the .mdl), fromBox? (true: new .vol from size) }
//   vol.addFromMesh  { bone, name?, how: box|cylinder|sphere|hull, axis? x|y|z (cylinder), file? (hull: new .vol name) }
//   vol.delete       { volume, dropFile? }          vol.rename { volume, name }
//   vol.duplicate    { volume, name?, bone? }        vol.setBone { volume, bone }
//   vol.setShape     { volume, kind?, size?, radius?, length?, file? }
//   vol.setMatrix    { volume, matrix (12) }         vol.setPosition { volume, position [3] }
//   vol.setOrientation { volume, orientation (9) | angles [x,y,z] degrees }
//   vol.transform    { volume, move?, rotate? [x,y,z] degrees, scale? [x,y,z] }  (SOEdit's 2D drag, VOL-16)
//   vol.round        { volume?, step? }              (VOL-08; all box/cylinder/sphere volumes when no volume)
//   vol.fit          { volume, kind?, axis? }        (VOL-10, VOL-12 done right)
//   vol.setThickness { volume, all?: number|null, sides?: { front..bottom: number|null } | number[6] }
//   vol.setProps     { volume, tags?: string[]|null, component?, density?, material? }  (null removes the key)
//   vol.toPolyhedron { volume, file?, segments? }    box or cylinder -> new .vol
//   vol.toBox        { volume }                      polyhedron -> box around its .vol, centred
//   vol.volTransform { file | volume, matrix? | move?, rotate?, scale?, mirror?: x|y|z }
//   vol.volSides     { file | volume, triangles: [i..], side: 1..6 | name } | { file | volume, auto: true }
//   obst.add         { type: obstacle|area, name?, kind: Obb2|Circle2|Polygon2, center, extent, axis, radius, vertices, rotate?, tags? }
//   obst.set         { id, name?, kind?, center?, extent?, axis?, radius?, vertices?, rotate?, tags? }
//   obst.delete      { id }
// States: vol.list { bone?, q? } -> { volumes: [entry], bones: [{ path, name, mesh }], vols: [rel] };
//   vol.get { volume } -> entry + { world, vol: { vertices, triangles, sides: {1..6: n}, bounds, warnings } | null };
//   obst.list -> { obstacles: [o], areas: [o] }.
// Author: Imperator_Aug (ARSENAL, ia-cf0b5acb)
'use strict';
const M = require('../mdl'), V = require('../vol'), P = require('../ply'), sw = require('../../sdlwrite');
const plyops = require('../../../soedit/ops/plyops');

const SIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom'];       // trace.js / armor order
const SIDE_BYTE = { front: 1, top: 2, left: 3, right: 4, rear: 5, bottom: 6 };
const KINDS = ['box', 'cylinder', 'sphere', 'polyhedron'];
const OKINDS = { obb2: 'Obb2', circle2: 'Circle2', polygon2: 'Polygon2' };
const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

const fail = msg => { throw new Error(msg); };
const isNum = x => typeof x === 'number' && isFinite(x);
const lc = s => String(s == null ? '' : s).toLowerCase();
const dirOf = k => { k = String(k || '').replace(/\\/g, '/'); return k.slice(0, k.lastIndexOf('/') + 1); };
const base = k => { k = String(k || '').replace(/\\/g, '/'); return k.slice(k.lastIndexOf('/') + 1); };

// ---------- document access ----------
function mdlRel(doc) { if (!doc || !doc.mdl || !doc.files || !doc.files.get(doc.mdl)) fail('No model is open.'); return doc.mdl; }
// the document's bytes, else (a file the model names that the document does not hold yet) the mod over the game through the core
function bytesOf(doc, rel) {
  const f = doc.files.get(rel); if (f) return f.bytes;
  if (rel && typeof doc.fetch === 'function') { try { return doc.fetch(rel) || null; } catch (e) { return null; } }
  return null;
}
function model(doc) {
  const m = M.parse(bytesOf(doc, mdlRel(doc)));
  if (m.error && !m.tree) fail('The model file cannot be read: ' + m.error);
  return m;
}
function readModel(doc) {      // read-only (cached by the core when it has read())
  const rel = mdlRel(doc);
  if (typeof doc.read === 'function') { try { const m = doc.read(rel); if (m && m.volumes) return m; } catch (e) { /* fall back */ } }
  return M.parse(bytesOf(doc, rel));
}
// a name as written in the .mdl (relative to its folder, '/x' = resource/x) -> the rel key in doc.files, or null
function relOf(doc, name) {
  if (!name) return null;
  const n = String(name).replace(/\\/g, '/'), dir = dirOf(doc.mdl);
  const cands = [];
  if (n.startsWith('//')) cands.push(n.slice(2));
  else if (n.startsWith('/')) cands.push('resource' + n, n.slice(1));
  else {
    const parts = (dir + n).split('/'), out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }
    cands.push(out.join('/'));
  }
  const more = []; for (const c of cands) { more.push(c); if (/^resource\//i.test(c)) more.push(c.slice(9)); else more.push('resource/' + c); }
  const keys = [...doc.files.keys()];
  for (const c of more) { const hit = keys.find(k => lc(k) === lc(c)); if (hit) return hit; }
  // not in the document: a file of the mod or the game (core doc.exists), as its resource/ path
  if (typeof doc.exists === 'function') for (const c of more) if (/^resource\//i.test(c)) { try { if (doc.exists(c)) return c; } catch (e) { /* not there */ } }
  return null;
}
function readVol(doc, rel) {
  if (typeof doc.read === 'function') { try { const o = doc.read(rel); if (o && o.vertices) return o; } catch (e) { /* fall back */ } }
  return V.parse(bytesOf(doc, rel));
}
function readPly(doc, rel) {
  if (typeof doc.read === 'function') { try { const o = doc.read(rel); if (o && o.parts) return o; } catch (e) { /* fall back */ } }
  return P.parse(bytesOf(doc, rel));
}

// ---------- lookups and checks ----------
function needVolume(m, ref) {
  if (ref == null || ref === '') fail('Pick a volume first.');
  const r = lc(ref);
  const v = m.volumes.find(x => lc(x.id) === r) || m.volumes.find(x => lc(x.name) === r);
  if (!v) fail('There is no volume "' + ref + '" in this model.');
  return v;
}
function needBone(m, ref) {
  if (ref == null || ref === '') fail('Pick a bone first.');
  const b = M.findBone(m, ref);
  if (!b) fail('There is no bone "' + ref + '" in this model.');
  // the engine finds a volume's bone by name, first in tree order: a second bone with the same name cannot be reached
  const first = M.findBone(m, b.name, true);
  if (first !== b) fail('Bone "' + b.path + '" has the same name as "' + first.path + '"; the game would link the volume to the first one. Rename one of them first.');
  return b;
}
function checkName(m, name, except) {
  if (typeof name !== 'string' || !name.trim()) fail('Give the volume a name.');
  if (name !== name.trim()) fail('A volume name cannot start or end with a space.');
  if (/["{}\r\n\t]/.test(name)) fail('A volume name cannot hold quotes, braces, tabs or line breaks.');
  if (/[^\x20-\x7e]/.test(name)) fail('Use plain latin letters, digits and signs in a volume name.');
  const dup = m.volumes.find(v => v !== except && lc(v.name) === lc(name));
  if (dup) fail('There is already a volume named "' + dup.name + '" (' + dup.id + ').');
  return name;
}
function freeName(m, stem) {
  const has = n => m.volumes.some(v => lc(v.name) === lc(n));
  if (stem !== 'volume' && !has(stem)) return stem;
  for (let i = 0; i < 10000; i++) if (!has(stem + i)) return stem + i;
  fail('No free volume name.');
}
const pos = (x, what) => { if (!isNum(x) || x <= 0) fail(what + ' must be a number above zero.'); return x; };
function checkShape(kind, a) {
  kind = lc(kind);
  if (!KINDS.includes(kind)) fail('The shape must be a box, a cylinder, a sphere or a polyhedron.');
  if (kind === 'box') { if (!Array.isArray(a.size) || a.size.length !== 3) fail('A box needs three sizes.'); a.size.forEach((x, i) => pos(x, ['Length', 'Width', 'Height'][i])); }
  if (kind === 'cylinder') { pos(a.radius, 'The radius'); pos(a.length, 'The height'); }
  if (kind === 'sphere') pos(a.radius, 'The radius');
  return kind;
}
function checkMatrix(mx, n = 12) {
  if (!mx || mx.length !== n) fail('A matrix needs ' + n + ' numbers.');
  const out = Array.from(mx, Number);
  if (!out.every(isFinite)) fail('Every number of the matrix must be a number.');
  if (n === 12 || n === 9) { const d = det(out); if (!d || Math.abs(d) < 1e-9) fail('The orientation is flat (its axes do not span space).'); }
  return out;
}
const det = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
function vec(a, n, what) {
  if (!Array.isArray(a) || a.length !== n) fail(what + ' needs ' + n + ' numbers.');
  const o = a.map(Number); if (!o.every(isFinite)) fail(what + ': every value must be a number.'); return o;
}

// ---------- matrices (row vectors, mdl.mul(a, b) = a then b) ----------
function rot(axis, deg) {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), cl = x => (Math.abs(x) < 1e-12 ? 0 : x);
  const C = cl(c), S = cl(s);
  if (axis === 0) return [1, 0, 0, 0, C, S, 0, -S, C, 0, 0, 0];
  if (axis === 1) return [C, 0, -S, 0, 1, 0, S, 0, C, 0, 0, 0];
  return [C, S, 0, -S, C, 0, 0, 0, 1, 0, 0, 0];
}
// SOEdit's 2D drag order ( FixVolumeGeometry): glRotate X, Y, Z then glScale on top of the matrix
// i.e. a point is scaled, turned about Z, then Y, then X, then placed by the old matrix.
function eulerLocal(deg) { return M.mul(M.mul(rot(2, deg[2] || 0), rot(1, deg[1] || 0)), rot(0, deg[0] || 0)); }
const clean = x => (Math.abs(x) < 1e-9 ? 0 : parseFloat(x.toPrecision(9)));
const cleanM = m => m.map(clean);

// ---------- .mdl splice helpers ----------
const isBlk = n => n && (n.type === 'block' || n.type === 'list');
const kw = n => (n.items[0] && n.items[0].type === 'atom') ? n.items[0].text.toLowerCase() : '';
const kids = n => n.items.filter(isBlk);
const argsOf = n => n.items.slice(1).filter(x => !isBlk(x));
function finish(m) {
  const sp = m.tree.splices.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  let p = 0; for (const s of sp) { if (s.start < p) fail('Two changes touch the same place in the model file.'); p = Math.max(p, s.end); }
  return sw.serialize(m.tree);
}
const put = (m, start, end, text) => m.tree.splices.push({ start, end, text });
const eolOf = src => (/\r\n/.test(src) || !/\n/.test(src) ? '\r\n' : '\n');
const unitOf = src => (/\n\t/.test(src) ? '\t' : '  ');
function lineIndent(src, p) { let s = p; while (s > 0 && src[s - 1] !== '\n' && src[s - 1] !== '\r') s--; return /^[ \t]*/.exec(src.slice(s))[0]; }
const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const f = x => M.fmtNum(x);
function mdlEdit(doc, changes) {
  const m = model(doc);
  try { return M.edit(m, changes); } catch (e) { fail(String(e.message || e).replace(/^mdl: /, 'The model file cannot be changed: ')); }
}
const out1 = (doc, bytes, info, extra) => ({ files: Object.assign({ [doc.mdl]: bytes }, extra || {}), info: info || {} });
const idOf = (bonePath, name) => (bonePath || '') + '/' + name;

// ---------- entries for the page ----------
function thick(v) {
  const t = v.thickness;
  const o = { all: t ? t.all : null, set: !!t };
  SIDES.forEach(s => { o[s] = t && t.sides[s] != null && !isNaN(t.sides[s]) ? t.sides[s] : (t && t.all != null ? t.all : 0); });
  o.list = SIDES.map(s => o[s]);
  return o;
}
function entry(doc, m, v) {
  return { id: v.id, name: v.name, bone: v.bone, boneName: v.boneName, orphan: v.orphan, kind: v.kind, shapes: v.shapes,
    size: v.size, radius: v.radius, length: v.length, file: v.file, fileRel: v.file ? relOf(doc, v.file) : null,
    matrix: v.matrix, position: v.matrix.slice(9), exact: v.exact, form: v.form, thickness: thick(v),
    tags: v.tags, component: v.component, density: v.density, material: v.material, unknown: v.unknown };
}
function meshOf(doc, m, b) {
  for (const w of b.views || []) {
    if (!/^(View|VolumeView|LODView)$/i.test(w.kind)) continue;
    const nm = w.file || (w.lods && w.lods[0] && w.lods[0].file);
    if (!nm) continue;
    return { name: nm, rel: relOf(doc, nm) || relOf(doc, /\.\w+$/.test(nm) ? null : nm + '.ply') };
  }
  return null;
}
function meshPoints(doc, m, b) {
  const mesh = meshOf(doc, m, b);
  if (!mesh) fail('Bone "' + b.name + '" has no mesh to fit to.');
  if (!mesh.rel) fail('The mesh "' + mesh.name + '" of bone "' + b.name + '" is not open with this model.');
  const ply = readPly(doc, mesh.rel);
  if (ply.error && !ply.vertices) fail('The mesh "' + mesh.name + '" cannot be read: ' + ply.error);
  const pts = plyops.usedPoints(ply);
  if (!pts.length) fail('The mesh "' + mesh.name + '" has no points.');
  return { pts, ply, mesh };
}

// ---------- convex hull (incremental; faces wound as vanilla .vol: cross(b-a, c-a) points inward) ----------
function hull(points) {
  const key = p => p.join(','), seen = new Set(), P3 = [];
  for (const p of points) { const k = key(p); if (!seen.has(k)) { seen.add(k); P3.push(p); } }
  if (P3.length < 4) fail('The mesh has fewer than four distinct points: no solid can be made from it.');
  if (P3.length > 60000) fail('The mesh has too many points for a hull (' + P3.length + ').');
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let ext = 0; for (const p of P3) for (const c of p) ext = Math.max(ext, Math.abs(c));
  const eps = Math.max(ext, 1) * 1e-7;
  let i0 = 0; P3.forEach((p, i) => { if (p[0] < P3[i0][0]) i0 = i; });
  let i1 = -1, best = 0; P3.forEach((p, i) => { const d = Math.hypot(...sub(p, P3[i0])); if (d > best) { best = d; i1 = i; } });
  let i2 = -1; best = 0; const e01 = sub(P3[i1], P3[i0]);
  P3.forEach((p, i) => { const d = Math.hypot(...cr(e01, sub(p, P3[i0]))); if (d > best) { best = d; i2 = i; } });
  if (i1 < 0 || i2 < 0 || best < eps) fail('The mesh is a line: no solid can be made from it.');
  const n012 = cr(e01, sub(P3[i2], P3[i0]));
  let i3 = -1; best = 0; P3.forEach((p, i) => { const d = Math.abs(dot(n012, sub(p, P3[i0]))); if (d > best) { best = d; i3 = i; } });
  if (i3 < 0 || best / Math.hypot(...n012) < eps) fail('The mesh is flat: no solid can be made from it.');
  const inside = [0, 1, 2].map(c => (P3[i0][c] + P3[i1][c] + P3[i2][c] + P3[i3][c]) / 4);
  let faces = [];
  const mk = (a, b, c) => {
    let n = cr(sub(P3[b], P3[a]), sub(P3[c], P3[a]));
    if (dot(n, sub(inside, P3[a])) > 0) { const t = b; b = c; c = t; n = n.map(x => -x); }   // outward, counter-clockwise from outside
    const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    return { v: [a, b, c], n, d: dot(n, P3[a]), dead: false };
  };
  faces.push(mk(i0, i1, i2), mk(i0, i1, i3), mk(i0, i2, i3), mk(i1, i2, i3));
  const used = new Set([i0, i1, i2, i3]);
  for (let pi = 0; pi < P3.length; pi++) {
    if (used.has(pi)) continue;
    const p = P3[pi], vis = faces.filter(fc => !fc.dead && dot(fc.n, p) - fc.d > eps);
    if (!vis.length) continue;
    const edges = new Map();
    for (const fc of vis) { fc.dead = true; for (let k = 0; k < 3; k++) { const a = fc.v[k], b = fc.v[(k + 1) % 3]; edges.set(a + ',' + b, [a, b]); } }
    for (const [k, [a, b]] of edges) if (!edges.has(b + ',' + a)) {
      let n = cr(sub(P3[b], P3[a]), sub(p, P3[a])); const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
      faces.push({ v: [a, b, pi], n, d: dot(n, P3[a]), dead: false });
    }
    faces = faces.filter(fc => !fc.dead);
  }
  return { points: P3, faces };
}

// a .vol object from outward-wound triangles; sides from the outward normal turned into the vehicle frame (rot9)
function volFromOutward(points, tris, rot9) {
  const posA = [], sides = [];
  for (const [a, b, c] of tris) {
    const A = points[a], B = points[b], C = points[c];
    posA.push(...A, ...C, ...B);                       // reversed: vanilla winding
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const r = rot9 ? [0, 1, 2].map(j => n[0] * rot9[j] + n[1] * rot9[3 + j] + n[2] * rot9[6 + j]) : n;
    sides.push(V.faceSideFromNormal(r));
  }
  return V.fromTriangles(posA, sides);
}
function prism(radius, length, segs) {
  const pts = [], tris = [], h = length / 2;
  for (let i = 0; i < segs; i++) { const a = 2 * Math.PI * i / segs; pts.push([radius * Math.cos(a), radius * Math.sin(a), -h], [radius * Math.cos(a), radius * Math.sin(a), h]); }
  const bc = pts.length, tc = bc + 1; pts.push([0, 0, -h], [0, 0, h]);
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs, b0 = 2 * i, t0 = 2 * i + 1, b1 = 2 * j, t1 = 2 * j + 1;
    tris.push([b0, b1, t1], [b0, t1, t0], [tc, t0, t1], [bc, b1, b0]);
  }
  return { pts, tris };
}

// new .vol file next to the .mdl: returns { rel, name }
function newVolFile(doc, m, wanted, stem) {
  let name = wanted ? String(wanted).replace(/\\/g, '/') : null;
  if (name) {
    if (/[^\x21-\x7e]/.test(name) || /["{}]/.test(name)) fail('Use plain latin letters, digits and signs in a file name, no spaces.');
    if (!/\.vol$/i.test(name)) name += '.vol';
    if (name.includes('/')) fail('Give a file name without folders; the file goes next to the model.');
    if (relOf(doc, name)) fail('A file named "' + name + '" is already open with this model.');
  } else {
    for (let i = 0; i < 10000; i++) { const n = stem + (i ? i : '') + '.vol'; if (!relOf(doc, n)) { name = n; break; } }
  }
  return { rel: dirOf(doc.mdl) + name, name };
}
function polyUsers(m, file) { return m.volumes.filter(v => v.kind === 'polyhedron' && v.file && lc(v.file) === lc(file)); }

// ---------- thickness ----------
function sidesArg(s) {
  if (s == null) return {};
  if (Array.isArray(s)) { if (s.length !== 6) fail('Give six thickness values: front, top, left, right, rear, bottom.'); const o = {}; SIDES.forEach((k, i) => { o[k] = s[i]; }); return o; }
  const o = {}; for (const [k, x] of Object.entries(s)) { if (!SIDES.includes(lc(k))) fail('"' + k + '" is not a side (front, top, left, right, rear, bottom).'); o[lc(k)] = x; }
  return o;
}
function setThickness(m, v, all, sides) {
  const src = m.tree.src;
  const check = (x, w) => { if (x === null) return; if (!isNum(x) || x < 0) fail('The thickness of the ' + w + ' must be a number, zero or more.'); };
  if (all !== undefined) check(all, 'whole volume');
  for (const [k, x] of Object.entries(sides)) check(x, k + ' side');
  const blocks = kids(v.node).filter(c => kw(c) === 'thickness');
  const th = blocks[blocks.length - 1];
  if (!th) {
    const subs = Object.entries(sides).filter(([, x]) => x != null);
    if ((all == null) && !subs.length) return;
    const txt = '{Thickness' + (all != null ? ' ' + f(all) : '') + subs.map(([k, x]) => ' {' + k + ' ' + f(x) + '}').join('') + '}';
    sw.insertChild(v.node, v.node.items.length, txt);
    return;
  }
  const a = argsOf(th).filter(x => x.type === 'atom' && !isNaN(parseFloat(x.text)));
  const allTok = a[0];
  if (all !== undefined) {
    if (all === null) { if (allTok) { let s = allTok.start; while (s > 0 && (src[s - 1] === ' ' || src[s - 1] === '\t')) s--; put(m, s, allTok.end, ''); } }
    else if (allTok) { if (Math.fround(parseFloat(allTok.text)) !== Math.fround(all)) put(m, allTok.start, allTok.end, f(all)); }
    else put(m, th.items[0].end, th.items[0].end, ' ' + f(all));
  }
  for (const [k, x] of Object.entries(sides)) {
    const hits = kids(th).filter(c => kw(c) === k), cur = hits[hits.length - 1];
    if (x === null) { for (const h of hits) sw.removeNode(h); continue; }
    if (cur) { const t = argsOf(cur)[0]; if (!t) put(m, cur.items[0].end, cur.items[0].end, ' ' + f(x)); else if (Math.fround(parseFloat(t.text)) !== Math.fround(x)) put(m, t.start, t.end, f(x)); }
    else sw.insertChild(th, th.items.length, '{' + k + ' ' + f(x) + '}');
  }
}

// ---------- obstacles and areas ----------
function obstList(m) {
  const one = (o, type, i) => ({ id: type + ':' + i, type, index: i, name: o.name, kind: o.kind, center: o.shape ? o.shape.center : null,
    extent: o.shape ? o.shape.extent : null, axis: o.shape ? o.shape.axis : null, radius: o.shape ? o.shape.radius : null,
    vertices: o.shape ? o.shape.vertices : [], rotate: o.flags.some(x => lc(x) === 'rotate'), flags: o.flags, tags: o.tags, unknown: o.unknown });
  return { obstacles: m.obstacles.map((o, i) => one(o, 'obstacle', i)), areas: m.areas.map((o, i) => one(o, 'area', i)) };
}
function needObst(m, id) {
  const r = /^(obstacle|area):(\d+)$/.exec(String(id || ''));
  if (!r) fail('Pick an obstacle or an area first.');
  const o = (r[1] === 'obstacle' ? m.obstacles : m.areas)[+r[2]];
  if (!o) fail('There is no ' + r[1] + ' number ' + (+r[2] + 1) + ' in this model.');
  return { o, type: r[1], index: +r[2] };
}
function obstShape(a, cur) {
  const kindIn = a.kind != null ? a.kind : cur && cur.kind;
  const kind = OKINDS[lc(kindIn)];
  if (!kind) fail('The shape must be a rectangle (Obb2), a circle (Circle2) or a polygon (Polygon2).');
  const pick = k => (a[k] !== undefined ? a[k] : cur && lc(cur.kind) === lc(kind) ? cur[k] : undefined);
  const s = { kind };
  if (kind === 'Obb2') {
    s.center = vec(pick('center') || [0, 0], 2, 'The centre'); s.extent = vec(pick('extent') || [0, 0], 2, 'The half size');
    s.axis = vec(pick('axis') || [1, 0], 2, 'The direction');
    if (!(s.extent[0] > 0 && s.extent[1] > 0)) fail('Both half sizes of a rectangle must be above zero.');
    const l = Math.hypot(s.axis[0], s.axis[1]); if (!(l > 1e-9)) fail('The direction of a rectangle cannot be zero.');
  } else if (kind === 'Circle2') {
    s.center = vec(pick('center') || [0, 0], 2, 'The centre'); s.radius = pick('radius');
    if (!isNum(s.radius) || s.radius <= 0) fail('The radius of a circle must be a number above zero.');
  } else {
    const vs = pick('vertices') || [];
    if (!Array.isArray(vs) || vs.length < 3) fail('A polygon needs at least three points.');
    s.vertices = vs.map((p, i) => vec(p, 2, 'Point ' + (i + 1)));
    s.radius = pick('radius'); if (s.radius == null) s.radius = 0;
    if (!isNum(s.radius) || s.radius < 0) fail('The rounding radius of a polygon must be zero or more.');
  }
  return s;
}
function shapeLines(s) {
  const L = [];
  if (s.kind === 'Obb2') L.push('{Center ' + s.center.map(f).join(' ') + '}', '{Extent ' + s.extent.map(f).join(' ') + '}', '{Axis ' + s.axis.map(f).join(' ') + '}');
  else if (s.kind === 'Circle2') L.push('{Radius ' + f(s.radius) + '}', '{Center ' + s.center.map(f).join(' ') + '}');
  else { L.push('{Radius ' + f(s.radius) + '}'); for (const p of s.vertices) L.push('{Vertex ' + p.map(f).join(' ') + '}'); }
  return L;
}
function shapeBlock(s, ind, u, eol) { return '{' + s.kind + eol + shapeLines(s).map(l => ind + u + l).join(eol) + eol + ind + '}'; }
function tagsText(tags) { return '{Tags ' + tags.map(t => q(t)).join(' ') + '}'; }
function checkTags(tags) {
  if (!Array.isArray(tags)) fail('Tags are a list of words.');
  return tags.map(t => { t = String(t).trim(); if (!t || /["{}\s]/.test(t) || /[^\x21-\x7e]/.test(t)) fail('A tag is one plain word: "' + t + '".'); return t; });
}

// ================= ops =================
const ops = {};

ops['vol.add'] = { apply(doc, a) {
  const m = model(doc), b = needBone(m, a.bone);
  let kind = lc(a.kind || 'box'), extra = null, file = a.file;
  const sh = { size: a.size, radius: a.radius, length: a.length };
  if (kind === 'polyhedron') {
    if (a.data != null || a.fromBox) {
      let vb;
      if (a.fromBox) { checkShape('box', { size: a.size }); vb = V.write(V.fromBox(a.size)); }
      else { vb = Buffer.from(String(a.data), 'base64'); const o = V.parse(vb); if (o.error) fail('That .vol file cannot be read: ' + o.error); if (!o.faces.length) fail('That .vol file has no triangles.'); }
      const nf = newVolFile(doc, m, a.file, a.name || 'volume');
      file = nf.name; extra = { [nf.rel]: vb };
    } else {
      if (!file) fail('Pick the .vol file of the polyhedron.');
      const rel = relOf(doc, file);
      if (!rel) fail('The file "' + file + '" is not open with this model.');
      const o = readVol(doc, rel); if (o.error) fail('The file "' + file + '" cannot be read: ' + o.error);
    }
  } else checkShape(kind, sh);
  const stem = kind === 'polyhedron' && file ? base(file).replace(/\.vol$/i, '') : 'volume';
  const name = a.name != null ? checkName(m, a.name) : freeName(m, stem);
  const matrix = a.matrix ? checkMatrix(a.matrix) : null;
  const bytes = mdlEdit(doc, [Object.assign({ op: 'addVolume', bone: b.path, name, kind, file }, sh, matrix ? { matrix } : {})]);
  return out1(doc, bytes, { id: idOf(b.path, name), name }, extra);
} };

ops['vol.addFromMesh'] = { apply(doc, a) {
  const m = model(doc), b = needBone(m, a.bone), how = lc(a.how || 'box');
  const { pts, mesh } = meshPoints(doc, m, b);
  if (how === 'hull') {
    const hl = hull(pts), w = M.worldMatrix(m, b.path);
    const vo = volFromOutward(hl.points, hl.faces.map(fc => fc.v), w ? w.slice(0, 9) : null);
    const nf = newVolFile(doc, m, a.file, a.name || base(mesh.name).replace(/\.\w+$/, '') + '_hull');
    const name = a.name != null ? checkName(m, a.name) : freeName(m, nf.name.replace(/\.vol$/i, ''));
    const bytes = mdlEdit(doc, [{ op: 'addVolume', bone: b.path, name, kind: 'polyhedron', file: nf.name }]);
    return out1(doc, bytes, { id: idOf(b.path, name), name, file: nf.rel, triangles: hl.faces.length }, { [nf.rel]: V.write(vo) });
  }
  if (!['box', 'cylinder', 'sphere'].includes(how)) fail('Make the volume as a box, a cylinder, a sphere or a hull.');
  const fit = fitPts(pts, how, a.axis);
  const name = a.name != null ? checkName(m, a.name) : freeName(m, 'volume');
  const bytes = mdlEdit(doc, [Object.assign({ op: 'addVolume', bone: b.path, name, kind: how, matrix: fit.matrix }, fit.shape)]);
  return out1(doc, bytes, { id: idOf(b.path, name), name, mesh: mesh.rel });
} };
function fitPts(pts, kind, axis) {
  const bx = plyops.fitBox(pts), c = bx.centre;
  if (kind === 'box') { if (bx.size.some(x => !(x > 0))) fail('The mesh is flat in one direction: a box needs three sizes above zero.'); return { shape: { size: bx.size.map(clean) }, matrix: cleanM(bx.matrix) }; }
  if (kind === 'sphere') { let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])); return { shape: { radius: clean(r) }, matrix: cleanM(bx.matrix) }; }
  const ax = lc(axis || 'z'), k = { x: 0, y: 1, z: 2 }[ax];
  if (k == null) fail('The cylinder axis must be x, y or z.');
  const [u, w] = [0, 1, 2].filter(i => i !== k);
  let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p[u] - c[u], p[w] - c[w]));
  if (!(r > 0) || !(bx.size[k] > 0)) fail('The mesh is flat along that axis: a cylinder needs a radius and a height above zero.');
  const ROWS = { x: [0, 1, 0, 0, 0, 1, 1, 0, 0], y: [0, 0, 1, 1, 0, 0, 0, 1, 0], z: [1, 0, 0, 0, 1, 0, 0, 0, 1] };   // local Z along the axis
  return { shape: { radius: clean(r), length: clean(bx.size[k]) }, matrix: cleanM([...ROWS[ax], ...c]) };
}

ops['vol.delete'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume);
  const bytes = mdlEdit(doc, [{ op: 'deleteVolume', volume: v.id }]);
  const extra = {};
  if (a.dropFile && v.kind === 'polyhedron' && v.file && polyUsers(m, v.file).length === 1) { const rel = relOf(doc, v.file); if (rel && doc.files.has(rel)) extra[rel] = null; }
  return out1(doc, bytes, { id: v.id, dropped: Object.keys(extra) }, extra);
} };

ops['vol.rename'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume);
  if (a.name === v.name) fail('The volume already has that name.');
  checkName(m, a.name, v);
  if (!v.nameNode) fail('This volume has no name in the file to change.');
  return out1(doc, mdlEdit(doc, [{ op: 'rename', volume: v.id, name: a.name }]), { id: idOf(v.bone || v.boneName, a.name), was: v.id });
} };

ops['vol.duplicate'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume), src = m.tree.src;
  const b = a.bone != null ? needBone(m, a.bone) : (v.bone ? M.findBone(m, v.bone) : null);
  const name = a.name != null ? checkName(m, a.name) : freeName(m, v.name.replace(/\d+$/, '') || 'volume');
  if (!v.nameNode) fail('This volume has no name in the file to copy.');
  const n = v.node, rep = [[v.nameNode.start, v.nameNode.end, q(name)]];
  if (b && v.boneNode && argsOf(v.boneNode)[0]) { const t = argsOf(v.boneNode)[0]; rep.push([t.start, t.end, q(b.name)]); }
  rep.sort((x, y) => y[0] - x[0]);
  let text = src.slice(n.start, n.end);
  for (const [s, e, t] of rep) text = text.slice(0, s - n.start) + t + text.slice(e - n.start);
  if (b && !v.boneNode) text = text.replace(/\}$/, ' {Bone ' + q(b.name) + '}}');
  sw.insertChild(m.root, m.root.items.indexOf(n) + 1, text);
  return out1(doc, finish(m), { id: idOf(b ? b.path : v.boneName, name), name, from: v.id });
} };

ops['vol.setBone'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume), b = needBone(m, a.bone);
  if (v.bone === b.path) fail('The volume is already on that bone.');
  return out1(doc, mdlEdit(doc, [{ op: 'setKey', volume: v.id, key: 'Bone', value: b.name }]), { id: idOf(b.path, v.name), was: v.id });
} };

ops['vol.setShape'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume);
  const kind = lc(a.kind || v.kind || 'box');
  const sh = { size: a.size !== undefined ? a.size : v.size, radius: a.radius !== undefined ? a.radius : v.radius, length: a.length !== undefined ? a.length : v.length };
  let file = a.file !== undefined ? a.file : v.file;
  if (kind === 'polyhedron') {
    if (!file) fail('Pick the .vol file of the polyhedron.');
    if (!relOf(doc, file)) fail('The file "' + file + '" is not open with this model.');
  } else checkShape(kind, sh);
  if (kind !== 'sphere' && kind !== 'cylinder') sh.radius = undefined;
  const c = { op: 'setVolume', volume: v.id, kind };
  if (kind === 'box') c.size = sh.size; else if (kind === 'cylinder') { c.radius = sh.radius; c.length = sh.length; }
  else if (kind === 'sphere') c.radius = sh.radius; else c.file = file;
  if (v.shapes > 1) fail('This volume has more than one shape; the game warns about it. Delete the extra shape lines first.');
  return out1(doc, mdlEdit(doc, [c]), { id: v.id });
} };

function setMatrix(doc, m, v, mx) {
  return out1(doc, mdlEdit(doc, [{ op: 'setVolume', volume: v.id, matrix: cleanM(mx) }]), { id: v.id, matrix: cleanM(mx) });
}
ops['vol.setMatrix'] = { apply(doc, a) { const m = model(doc), v = needVolume(m, a.volume); return setMatrix(doc, m, v, checkMatrix(a.matrix)); } };
ops['vol.setPosition'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume), p = vec(a.position, 3, 'The position');
  return setMatrix(doc, m, v, v.matrix.slice(0, 9).concat(p));
} };
ops['vol.setOrientation'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume);
  const r = a.angles ? eulerLocal(vec(a.angles, 3, 'The angles')).slice(0, 9) : checkMatrix(a.orientation, 9);
  return setMatrix(doc, m, v, r.concat(v.matrix.slice(9)));
} };
ops['vol.transform'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume);
  const mv = a.move ? vec(a.move, 3, 'The move') : [0, 0, 0], rt = a.rotate ? vec(a.rotate, 3, 'The turn') : [0, 0, 0], sc = a.scale ? vec(a.scale, 3, 'The scale') : [1, 1, 1];
  if (sc.some(x => !(x > 0))) fail('Scale by numbers above zero; use the mirror of the .vol file to flip it.');
  if (mv.every(x => x === 0) && rt.every(x => x === 0) && sc.every(x => x === 1)) fail('Nothing to change: turn, move or scale by something.');
  const changes = [], c = { op: 'setVolume', volume: v.id };
  let mx = M.mul(eulerLocal(rt), v.matrix); mx[9] += mv[0]; mx[10] += mv[1]; mx[11] += mv[2];
  c.matrix = cleanM(mx);
  // SOEdit bakes the scale into the matrix (glScale); the engine's volume matrix is a placement, so the scale goes into
  // the shape's own sizes here (the same result for a box, along the volume's own axes)
  if (sc.some(x => x !== 1)) {
    if (v.kind === 'box') c.size = v.size.map((x, i) => clean(x * sc[i]));
    else if (v.kind === 'cylinder') { if (Math.abs(sc[0] - sc[1]) > 1e-9) fail('A cylinder stays round: scale its two cross directions by the same number.'); c.radius = clean(v.radius * sc[0]); c.length = clean(v.length * sc[2]); }
    else if (v.kind === 'sphere') { if (sc.some(x => Math.abs(x - sc[0]) > 1e-9)) fail('A sphere stays round: scale all three directions by the same number.'); c.radius = clean(v.radius * sc[0]); }
    else fail('A polyhedron takes its shape from its .vol file: scale the file instead.');
  }
  changes.push(c);
  return out1(doc, mdlEdit(doc, changes), { id: v.id, matrix: c.matrix });
} };

ops['vol.round'] = { apply(doc, a) {
  const m = model(doc), step = a.step == null ? 1 : Number(a.step);
  if (!(step > 0)) fail('Round to a step above zero.');
  const list = a.volume != null ? [needVolume(m, a.volume)] : m.volumes;
  const changes = [], notes = [];
  for (const v of list) {
    if (!v.kind) continue;
    const r = plyops.roundVolume(v.kind === 'polyhedron' ? Object.assign({}, v, { size: null, radius: null, length: null }) : v, step);
    if (!v.exact) delete r.change.matrix;
    for (const n of r.notes) notes.push(v.id + ': ' + n);
    if (!Object.keys(r.change).length) continue;
    const ch = Object.assign({ op: 'setVolume', volume: v.id }, r.change);
    if (ch.size && ch.size.some(x => !(x > 0))) delete ch.size;
    if (ch.radius != null && !(ch.radius > 0)) delete ch.radius;
    if (ch.length != null && !(ch.length > 0)) delete ch.length;
    changes.push(ch);
  }
  if (!changes.length) fail('Nothing to round: the numbers are already on the step.');
  return out1(doc, mdlEdit(doc, changes), { changed: changes.map(c => c.volume), notes });
} };

ops['vol.fit'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume);
  const kind = lc(a.kind || v.kind || 'box');
  if (kind === 'polyhedron') fail('A polyhedron takes its shape from its .vol file; fit a box, a cylinder or a sphere, or make a hull from the mesh.');
  if (!v.bone) fail('The volume is not linked to a bone of this model, so there is no mesh to fit to.');
  const b = M.findBone(m, v.bone);
  const { pts, mesh } = meshPoints(doc, m, b);
  const fit = fitPts(pts, kind, a.axis);
  if (v.shapes > 1) fail('This volume has more than one shape; the game warns about it. Delete the extra shape lines first.');
  const c = Object.assign({ op: 'setVolume', volume: v.id, kind, matrix: fit.matrix }, fit.shape);
  return out1(doc, mdlEdit(doc, [c]), { id: v.id, mesh: mesh.rel, size: fit.shape.size, radius: fit.shape.radius, length: fit.shape.length });
} };

ops['vol.setThickness'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume), sides = sidesArg(a.sides);
  if (a.all === undefined && !Object.keys(sides).length) fail('Give a thickness.');
  setThickness(m, v, a.all, sides);
  const bytes = finish(m);
  return out1(doc, bytes, { id: v.id });
} };

ops['vol.setProps'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume), changes = [];
  if (a.tags !== undefined) changes.push({ op: 'setKey', volume: v.id, key: 'Tags', value: a.tags === null || (Array.isArray(a.tags) && !a.tags.length) ? null : checkTags(a.tags) });
  if (a.component !== undefined) {
    if (a.component !== null && (typeof a.component !== 'string' || /["{}\r\n]/.test(a.component) || /[^\x20-\x7e]/.test(a.component))) fail('The component is one plain name.');
    changes.push({ op: 'setKey', volume: v.id, key: 'Component', value: a.component === '' ? null : a.component });
  }
  if (a.density !== undefined) { if (a.density !== null && (!isNum(a.density) || a.density <= 0)) fail('The density must be a number above zero.'); changes.push({ op: 'setKey', volume: v.id, key: 'Density', value: a.density }); }
  if (a.material !== undefined) {
    if (a.material !== null && (typeof a.material !== 'string' || /["{}\s]/.test(a.material) || /[^\x21-\x7e]/.test(a.material))) fail('The material is one plain word.');
    changes.push({ op: 'setKey', volume: v.id, key: 'Material', value: a.material === '' ? null : a.material });
  }
  if (!changes.length) fail('Nothing to change.');
  // Tags take one string per word: setKey writes an array as one run of quoted words
  return out1(doc, mdlEdit(doc, changes), { id: v.id });
} };

ops['vol.toPolyhedron'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume);
  let vo;
  if (v.kind === 'box') vo = V.fromBox(v.size);
  else if (v.kind === 'cylinder') {
    const segs = a.segments == null ? 16 : Math.round(Number(a.segments));
    if (!(segs >= 3 && segs <= 256)) fail('Use 3 to 256 sides around the cylinder.');
    const pr = prism(v.radius, v.length, segs), w = M.volumeWorld(m, v.id);
    vo = volFromOutward(pr.pts, pr.tris, w ? w.slice(0, 9) : null);
  } else fail('Only a box or a cylinder can become a polyhedron.');
  const nf = newVolFile(doc, m, a.file, v.name);
  const bytes = mdlEdit(doc, [{ op: 'setVolume', volume: v.id, kind: 'polyhedron', file: nf.name }]);
  return out1(doc, bytes, { id: v.id, file: nf.rel }, { [nf.rel]: V.write(vo) });
} };

ops['vol.toBox'] = { apply(doc, a) {
  const m = model(doc), v = needVolume(m, a.volume);
  if (v.kind !== 'polyhedron') fail('This volume is not a polyhedron.');
  const rel = relOf(doc, v.file); if (!rel) fail('The file "' + v.file + '" is not open with this model.');
  const bb = V.bounds(readVol(doc, rel)); if (!bb) fail('The file "' + v.file + '" has no points.');
  const size = [0, 1, 2].map(i => clean(bb.max[i] - bb.min[i])), c = [0, 1, 2].map(i => (bb.max[i] + bb.min[i]) / 2);
  if (size.some(x => !(x > 0))) fail('The .vol file is flat in one direction: a box needs three sizes above zero.');
  const mx = cleanM(M.mul([1, 0, 0, 0, 1, 0, 0, 0, 1, ...c], v.matrix));
  return out1(doc, mdlEdit(doc, [{ op: 'setVolume', volume: v.id, kind: 'box', size, matrix: mx }]), { id: v.id, size });
} };

function volTarget(doc, m, a) {
  let rel, v = null;
  if (a.volume != null) { v = needVolume(m, a.volume); if (v.kind !== 'polyhedron') fail('This volume is not a polyhedron.'); rel = relOf(doc, v.file); if (!rel) fail('The file "' + v.file + '" is not open with this model.'); }
  else if (a.file) { rel = relOf(doc, a.file) || ([...doc.files.keys()].find(k => lc(k) === lc(a.file)) || null); if (!rel) fail('The file "' + a.file + '" is not open with this model.'); }
  else fail('Pick a polyhedron volume or a .vol file.');
  const o = readVol(doc, rel);
  if (o.error) fail('The file cannot be read: ' + o.error);
  return { rel, v, o };
}
const MIRROR_SWAP = { x: { 1: 5, 5: 1 }, y: { 3: 4, 4: 3 }, z: { 2: 6, 6: 2 } };
ops['vol.volTransform'] = { apply(doc, a) {
  const m = model(doc), { rel, o } = volTarget(doc, m, a);
  let mx;
  if (a.matrix) mx = checkMatrix(a.matrix);
  else {
    const sc = a.scale ? vec(a.scale, 3, 'The scale') : [1, 1, 1];
    if (sc.some(x => !(x > 0))) fail('Scale by numbers above zero; use mirror to flip.');
    mx = M.mul([sc[0], 0, 0, 0, sc[1], 0, 0, 0, sc[2], 0, 0, 0], a.rotate ? eulerLocal(vec(a.rotate, 3, 'The turn')) : ID.slice());
    if (a.move) { const mv = vec(a.move, 3, 'The move'); mx[9] += mv[0]; mx[10] += mv[1]; mx[11] += mv[2]; }
  }
  let swap = null;
  if (a.mirror) {
    const ax = lc(a.mirror); if (!MIRROR_SWAP[ax]) fail('Mirror across x, y or z.');
    const mr = ID.slice(); mr[{ x: 0, y: 4, z: 8 }[ax]] = -1; mx = M.mul(mr, mx); swap = MIRROR_SWAP[ax];
  }
  const n = V.transform(o, mx);
  if (det(mx) < 0) { const fc = Uint16Array.from(o.faces); for (let k = 0; k + 2 < fc.length; k += 3) { const t = fc[k + 1]; fc[k + 1] = fc[k + 2]; fc[k + 2] = t; } n.faces = fc; }
  if (swap && o.sides) n.sides = Uint8Array.from(o.sides, s => swap[s] || s);
  if (mx.every((x, i) => Math.abs(x - ID[i]) < 1e-12)) fail('Nothing to change: turn, move, scale or mirror by something.');
  return { files: { [rel]: V.write(n) }, info: { file: rel } };
} };

ops['vol.volSides'] = { apply(doc, a) {
  const m = model(doc), { rel, v, o } = volTarget(doc, m, a);
  const nt = o.faces.length / 3 | 0, sides = o.sides && o.sides.length >= nt ? Uint8Array.from(o.sides) : (() => { const s = new Uint8Array(nt); if (o.sides) s.set(o.sides.subarray(0, nt)); return s; })();
  if (a.auto) {
    const w = v ? M.volumeWorld(m, v.id) : null, tr = V.triangles(o);
    tr.forEach((t, i) => { const n = V.normal(t.p).map(x => -x); const r = w ? [0, 1, 2].map(j => n[0] * w[j] + n[1] * w[3 + j] + n[2] * w[6 + j]) : n; sides[i] = V.faceSideFromNormal(r); });
  } else {
    const s = typeof a.side === 'string' ? SIDE_BYTE[lc(a.side)] : Number(a.side);
    if (!(s >= 1 && s <= 6)) fail('The side must be front, top, left, right, rear or bottom.');
    if (!Array.isArray(a.triangles) || !a.triangles.length) fail('Pick the triangles to change.');
    for (const t of a.triangles) { if (!(Number.isInteger(t) && t >= 0 && t < nt)) fail('There is no triangle ' + t + ' (the file has ' + nt + ').'); sides[t] = s; }
  }
  return { files: { [rel]: V.write(Object.assign({}, o, { sides })) }, info: { file: rel } };
} };

// ---------- obstacles and areas ----------
ops['obst.add'] = { apply(doc, a) {
  const m = model(doc), type = lc(a.type || 'obstacle');
  if (type !== 'obstacle' && type !== 'area') fail('Add an obstacle or an area.');
  const s = obstShape(a, null), src = m.tree.src, eol = eolOf(src), u = unitOf(src);
  const list = type === 'obstacle' ? m.obstacles : m.areas;
  let name = a.name;
  if (name == null) { for (let i = 1; ; i++) { const n = type + i; if (!list.some(o => lc(o.name) === n)) { name = n; break; } } }
  if (typeof name !== 'string' || !name.trim() || /["{}\r\n]/.test(name) || /[^\x20-\x7e]/.test(name)) fail('Give it a plain name.');
  const L = ['{' + (type === 'obstacle' ? 'Obstacle' : 'Area') + ' ' + q(name), u + shapeBlock(s, u, u, eol)];
  if (a.rotate) L.push(u + '{Rotate}');
  if (a.tags && a.tags.length) L.push(u + tagsText(checkTags(a.tags)));
  L.push('}');
  const its = m.root.items; let at = -1;
  its.forEach((x, i) => { if (isBlk(x) && ['obstacle', 'area', 'volume'].includes(kw(x))) at = i; });
  sw.insertChild(m.root, at < 0 ? its.length : at + 1, L.join(eol));
  return out1(doc, finish(m), { id: type + ':' + list.length, name });
} };

ops['obst.set'] = { apply(doc, a) {
  const m = model(doc), { o, type, index } = needObst(m, a.id), src = m.tree.src, eol = eolOf(src), u = unitOf(src);
  const node = o.node, shapeNode = kids(node).find(c => OKINDS[kw(c)]);
  const shapeTouched = ['kind', 'center', 'extent', 'axis', 'radius', 'vertices'].some(k => a[k] !== undefined);
  let did = false;
  if (a.name !== undefined) {
    if (typeof a.name !== 'string' || !a.name.trim() || /["{}\r\n]/.test(a.name) || /[^\x20-\x7e]/.test(a.name)) fail('Give it a plain name.');
    const tok = node.items.slice(1).find(x => x.type === 'string');
    if (tok) { if (o.name !== a.name) { put(m, tok.start, tok.end, q(a.name)); did = true; } }
    else { put(m, node.items[0].end, node.items[0].end, ' ' + q(a.name)); did = true; }
  }
  if (shapeTouched) {
    const s = obstShape(a, o.shape ? Object.assign({ kind: o.kind }, o.shape) : null);
    if (shapeNode) { const ind = lineIndent(src, shapeNode.start); put(m, shapeNode.start, shapeNode.end, shapeBlock(s, ind, u, eol)); }
    else sw.insertChild(node, 1, shapeBlock(s, lineIndent(src, node.start) + u, u, eol));
    did = true;
  }
  if (a.rotate !== undefined) {
    const has = kids(node).filter(c => kw(c) === 'rotate');
    if (a.rotate && !has.length) { sw.insertChild(node, node.items.length, '{Rotate}'); did = true; }
    if (!a.rotate && has.length) { for (const h of has) sw.removeNode(h); did = true; }
  }
  if (a.tags !== undefined) {
    const has = kids(node).filter(c => kw(c) === 'tags');
    const tags = a.tags && a.tags.length ? checkTags(a.tags) : null;
    if (has.length) { const last = has[has.length - 1]; if (tags) put(m, last.start, last.end, tagsText(tags)); else for (const h of has) sw.removeNode(h); did = true; }
    else if (tags) { sw.insertChild(node, node.items.length, tagsText(tags)); did = true; }
  }
  if (!did) fail('Nothing to change.');
  return out1(doc, finish(m), { id: type + ':' + index });
} };

ops['obst.delete'] = { apply(doc, a) {
  const m = model(doc), { o, type, index } = needObst(m, a.id);
  sw.removeNode(o.node);
  return out1(doc, finish(m), { id: type + ':' + index, name: o.name });
} };

// check() for the core: run the op on the document without keeping the result
for (const op of Object.values(ops)) {
  const ap = op.apply;
  op.apply = (doc, a) => ap(doc, a || {});
  op.check = (doc, a) => { try { ap(doc, a || {}); return null; } catch (e) { return e.message; } };
}

// ================= states =================
const state = {
  'vol.list'(doc, query) {
    const m = readModel(doc), qy = query || {}, qs = lc(qy.q || '').trim();
    let vols = m.volumes;
    if (qy.bone) { const b = lc(qy.bone); vols = vols.filter(v => lc(v.bone) === b || lc(v.boneName) === b); }
    if (qs) vols = vols.filter(v => lc(v.id).includes(qs) || lc(v.kind).includes(qs) || (v.tags || []).some(t => lc(t).includes(qs)) || lc(v.component).includes(qs) || lc(v.file).includes(qs));
    return {
      error: m.error || null,
      volumes: vols.map(v => entry(doc, m, v)),
      total: m.volumes.length,
      bones: m.bones.map(b => { const me = meshOf(doc, m, b); return { path: b.path, name: b.name, volumes: b.volumes.length, mesh: me ? me.rel || null : null }; }),
      vols: [...doc.files.keys()].filter(k => /\.vol$/i.test(k)),
    };
  },
  'vol.get'(doc, query) {
    const m = readModel(doc), v = needVolume(m, (query || {}).volume);
    const e = entry(doc, m, v);
    e.world = M.volumeWorld(m, v.id);
    e.vol = null;
    if (v.kind === 'polyhedron' && e.fileRel) {
      const o = readVol(doc, e.fileRel), bb = V.bounds(o), counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, other: 0 };
      const nt = o.faces.length / 3 | 0;
      for (let i = 0; i < nt; i++) { const s = o.sides && i < o.sides.length ? o.sides[i] : 0; if (counts[s] != null) counts[s]++; else counts.other++; }
      e.vol = { rel: e.fileRel, vertices: o.vertices.length / 3 | 0, triangles: nt, sides: counts, bounds: bb, warnings: o.warnings, error: o.error,
        users: polyUsers(m, v.file).map(x => x.id) };
    }
    return e;
  },
  'obst.list'(doc) { return obstList(readModel(doc)); },
};

module.exports = { ops, state, _t: { hull, prism, eulerLocal, relOf, fitPts, SIDES } };
