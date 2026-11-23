// model/obj: Wavefront OBJ (+ its .mtl library) read and write, plain objects, no dependency, no file IO.
// Used by tools/lib/model/edit/ply.js (ply.import / ply.export). Space is OBJ's own: no axis or unit change happens here.
//
// parse(text) -> { v: number[] (x y z flat), vt: number[] (u v flat), vn: number[] (x y z flat),
//     groups: [{ material: string|null, object: string|null, faces: [[[vi, ti, ni], ..]] }] (0-based, -1 = absent; a new
//     group starts at each usemtl / o / g line that changes the material or object), mtllib: [names], warnings: [text],
//     error: string|null }   never throws. Relative (negative) indexes resolved. `w` of v and vt ignored.
// toMesh(o) -> { positions: Float32Array, normals: Float32Array|null (null when any used corner has none),
//     uvs: Float32Array|null (null when no corner has one), indices: Uint32Array (triangles, OBJ winding, polygons fanned),
//     groups: [{ material, firstFace, faceCount }] (faces of one material kept together, first-appearance order) }
//     corners are shared when they name the same v/vt/vn triple.
// write(mesh, opts) -> text. mesh = { positions, normals?, uvs?, indices, groups?: [{ material, firstFace, faceCount }] }
//     opts = { name, mtllib, digits (6) }. Lines end in "\n" (OBJ is read by other programs; game text rules do not apply).
// parseMtl(text) -> [{ name, Kd: [r,g,b]|null, map_Kd, map_Bump, map_Ks, d }]     writeMtl([{ name, Kd?, map_Kd? }]) -> text
// Author: Imperator_Aug (ARSENAL, ia-c0d6424a)
'use strict';

function parse(text) {
  const o = { v: [], vt: [], vn: [], groups: [], mtllib: [], warnings: [], error: null };
  if (Buffer.isBuffer(text)) text = text.toString('utf8');
  if (typeof text !== 'string') { o.error = 'not text'; return o; }
  let mat = null, obj = null, cur = null;
  const group = () => { if (!cur || cur.material !== mat || cur.object !== obj) { cur = { material: mat, object: obj, faces: [] }; o.groups.push(cur); } return cur; };
  const lines = text.split(/\r\n|\n|\r/);
  for (let ln = 0; ln < lines.length; ln++) {
    let line = lines[ln];
    while (/\\\s*$/.test(line) && ln + 1 < lines.length) line = line.replace(/\\\s*$/, ' ') + lines[++ln];
    const h = line.indexOf('#'); if (h >= 0) line = line.slice(0, h);
    const p = line.trim().split(/\s+/);
    if (!p[0]) continue;
    const k = p[0];
    const nums = n => { const a = []; for (let i = 1; i <= n; i++) { const x = Number(p[i]); a.push(Number.isFinite(x) ? x : 0); } return a; };
    if (k === 'v') { if (p.length < 4) o.warnings.push(`line ${ln + 1}: vertex with fewer than 3 numbers`); o.v.push(...nums(3)); }
    else if (k === 'vt') o.vt.push(...nums(2));
    else if (k === 'vn') o.vn.push(...nums(3));
    else if (k === 'f') {
      const nv = o.v.length / 3, nt = o.vt.length / 2, nn = o.vn.length / 3, face = [];
      let bad = false;
      for (let i = 1; i < p.length; i++) {
        const s = p[i].split('/');
        const ix = (x, n) => { if (x == null || x === '') return -1; let q = parseInt(x, 10); if (!Number.isFinite(q) || q === 0) { bad = true; return -1; } q = q < 0 ? n + q : q - 1; if (q < 0 || q >= n) { bad = true; return -1; } return q; };
        face.push([ix(s[0], nv), ix(s[1], nt), ix(s[2], nn)]);
      }
      if (bad || face.some(c => c[0] < 0)) { o.warnings.push(`line ${ln + 1}: face with an index outside the lists, skipped`); continue; }
      if (face.length < 3) { o.warnings.push(`line ${ln + 1}: face with fewer than 3 corners, skipped`); continue; }
      group().faces.push(face);
    } else if (k === 'usemtl') mat = p.slice(1).join(' ') || null;
    else if (k === 'o' || k === 'g') obj = p.slice(1).join(' ') || null;
    else if (k === 'mtllib') o.mtllib.push(...p.slice(1));
    // s, l, p, vp and the rest: not needed for a mesh
  }
  o.groups = o.groups.filter(g => g.faces.length);
  if (!o.groups.length && !o.error) o.error = 'no faces in the file';
  return o;
}

function toMesh(o) {
  const key = new Map(), pos = [], nrm = [], uv = [];
  let allN = true, anyT = false;
  const byMat = new Map();
  for (const g of o.groups) { const m = g.material || ''; if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g); }
  const idx = [], groups = [];
  for (const [m, gs] of byMat) {
    const first = idx.length / 3;
    for (const g of gs) for (const f of g.faces) {
      const c = f.map(([vi, ti, ni]) => {
        const k = vi + '/' + ti + '/' + ni;
        let q = key.get(k);
        if (q == null) {
          q = pos.length / 3; key.set(k, q);
          pos.push(o.v[vi * 3], o.v[vi * 3 + 1], o.v[vi * 3 + 2]);
          if (ni >= 0) nrm.push(o.vn[ni * 3], o.vn[ni * 3 + 1], o.vn[ni * 3 + 2]); else { allN = false; nrm.push(0, 0, 0); }
          if (ti >= 0) { anyT = true; uv.push(o.vt[ti * 2], o.vt[ti * 2 + 1]); } else uv.push(0, 0);
        }
        return q;
      });
      for (let i = 1; i + 1 < c.length; i++) idx.push(c[0], c[i], c[i + 1]);
    }
    groups.push({ material: m || null, firstFace: first, faceCount: idx.length / 3 - first });
  }
  return { positions: Float32Array.from(pos), normals: allN ? Float32Array.from(nrm) : null, uvs: anyT ? Float32Array.from(uv) : null,
    indices: Uint32Array.from(idx), groups };
}

const fmt = (x, d) => { const s = (+Number(x).toFixed(d)).toString(); return s === '-0' ? '0' : s; };
function write(mesh, opts = {}) {
  const d = opts.digits == null ? 6 : opts.digits, out = ['# written by ARSENAL'];
  if (opts.mtllib) out.push('mtllib ' + opts.mtllib);
  if (opts.name) out.push('o ' + opts.name);
  const P = mesh.positions, N = mesh.normals, T = mesh.uvs, I = mesh.indices, n = P.length / 3;
  for (let i = 0; i < n; i++) out.push(`v ${fmt(P[i * 3], d)} ${fmt(P[i * 3 + 1], d)} ${fmt(P[i * 3 + 2], d)}`);
  if (T) for (let i = 0; i < n; i++) out.push(`vt ${fmt(T[i * 2], d)} ${fmt(T[i * 2 + 1], d)}`);
  if (N) for (let i = 0; i < n; i++) out.push(`vn ${fmt(N[i * 3], d)} ${fmt(N[i * 3 + 1], d)} ${fmt(N[i * 3 + 2], d)}`);
  const c = q => { const k = q + 1; return T && N ? `${k}/${k}/${k}` : T ? `${k}/${k}` : N ? `${k}//${k}` : String(k); };
  const groups = mesh.groups && mesh.groups.length ? mesh.groups : [{ material: null, firstFace: 0, faceCount: I.length / 3 }];
  for (const g of groups) {
    if (g.material) out.push('usemtl ' + g.material);
    for (let f = g.firstFace; f < g.firstFace + g.faceCount; f++) out.push(`f ${c(I[f * 3])} ${c(I[f * 3 + 1])} ${c(I[f * 3 + 2])}`);
  }
  return out.join('\n') + '\n';
}

function parseMtl(text) {
  if (Buffer.isBuffer(text)) text = text.toString('utf8');
  const out = []; let cur = null;
  for (const raw of String(text || '').split(/\r\n|\n|\r/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const sp = line.search(/\s/), k = sp < 0 ? line : line.slice(0, sp), rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    if (k === 'newmtl') { cur = { name: rest, Kd: null, map_Kd: null, map_Bump: null, map_Ks: null, d: null }; out.push(cur); continue; }
    if (!cur) continue;
    const file = () => rest.split(/\s+/).filter(x => !/^-/.test(x)).pop() || null;   // options like -bm 1 come first; the name is last
    if (k === 'Kd') cur.Kd = rest.split(/\s+/).slice(0, 3).map(Number);
    else if (k === 'd') cur.d = Number(rest);
    else if (k === 'map_Kd') cur.map_Kd = file();
    else if (/^(map_Bump|map_bump|bump|norm)$/.test(k)) cur.map_Bump = file();
    else if (k === 'map_Ks') cur.map_Ks = file();
  }
  return out;
}
function writeMtl(list) {
  const out = ['# written by ARSENAL'];
  for (const m of list || []) {
    out.push('', 'newmtl ' + m.name, 'Kd ' + (m.Kd || [1, 1, 1]).map(x => fmt(x, 4)).join(' '));
    if (m.map_Kd) out.push('map_Kd ' + m.map_Kd);
    if (m.map_Bump) out.push('map_Bump ' + m.map_Bump);
    if (m.map_Ks) out.push('map_Ks ' + m.map_Ks);
  }
  return out.join('\n') + '\n';
}

module.exports = { parse, toMesh, write, parseMtl, writeMtl };
