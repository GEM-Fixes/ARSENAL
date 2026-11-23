// soedit/ops/plyops: SOEdit's mesh (PLY) and volume operations as pure functions (parsed objects in, new objects out, no IO).
// Spec: tools/soedit/ops/NOTES.md sections 13 (merge), 14 (merge child into parent), 15 (demerge), 16 (PLY Tweaker),
//   17 (volume Fit / Round). Matrices: number[12], matrix 43 order x.xyz y.xyz z.xyz t.xyz, row vectors (p' = p*R + T).
// Built on tools/lib/model/ply.js (transform, concat, split, partLayout, bounds): every mesh is written through ply.write,
//   so SUBM parts stay SUBM, unknown chunks are carried raw and an untouched mesh writes back byte-identical.
//
// Departures from SOEdit (intended behaviour, not the bugs NOTES lists):
//   merge: normals use the inverse transpose and are renormalised (SOEdit: n*R, no renormalise, no winding flip);
//     a negative determinant flips winding (lib transform). Skinned + unskinned or different weight counts are refused
//     instead of zero-filled (SOEdit binds the append to skin bone 0). Missing colour = 0xFFFFFFFF as NOTES step B.
//     Bounds always recomputed from the used vertices. ADJA/SHDW dropped (stale topology; the engine skips them).
//   demerge: each new mesh gets its own recomputed bounds (SOEdit keeps the source BNDS: stale); optional re-centring.
//   tweak: mesh flags and the VERT header flags are separate fields (SOEdit V mode writes mesh-flag bits into vflags);
//     flag changes that alter the vertex layout the engine expects (0x10 skinned, 0x100 when it adds/drops the tangent)
//     or the material section (clearing 0x400) are refused unless force.
//   fit: the box/cylinder/sphere is fitted to the mesh vertices in bone space and the volume matrix moved to the centre
//     (SOEdit keeps the old matrix, so an off-centre mesh gets an offset box, and always shows a false error).
//   round: numbers snap to a step; orientation cells snap to -1/0/1 only when the rotation is already near-axis
//     (SOEdit rounds every cell to a whole number: a 45 degree rotation becomes non-orthonormal).
// Exports: merge, mergeChildIntoParent, demerge, tweak, fitBox, fitVolumeToMesh, round, roundVolume, info, parseFlags,
//   flagNames, usedPoints, OpError, FLAG_NAMES.
// [I] {Box x y z} is centred on the volume matrix origin; {Cylinder r h} runs along local Z centred on the origin.
// Author: Imperator_Aug (ARSENAL, ia-ed7d93c2)
'use strict';
const P = require('../../lib/model/ply');

class OpError extends Error {}
const refuse = msg => { throw new OpError(msg); };
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

// SOEdit Tweaker names (NOTES 16) and the lib's engine names (ply.F), same bits
const FLAG_NAMES = {
  two_sided: 0x1, use_alpha: 0x2, light: 0x4, plcr: 0x8, skinned: 0x10, shadow: 0x20, mirrored: 0x40, blendtex: 0x80,
  bump: 0x100, specular: 0x200, material: 0x400, subskin: 0x800, twotex: 0x1000, usingvd: 0x2000, lightmap: 0x4000,
};
for (const [k, v] of Object.entries(P.F)) if (!(k.toLowerCase() in FLAG_NAMES)) FLAG_NAMES[k.toLowerCase()] = v;

function parseFlags(list) {
  let m = 0;
  for (const raw of [].concat(list || [])) for (const s of String(raw).split(/[,|+\s]+/).filter(Boolean)) {
    const k = s.toLowerCase();
    if (/^0x[0-9a-f]+$/.test(k)) m |= parseInt(k, 16);
    else if (/^\d+$/.test(k)) m |= parseInt(k, 10);
    else if (k in FLAG_NAMES) m |= FLAG_NAMES[k];
    else refuse(`unknown flag "${s}" (names: ${Object.keys(FLAG_NAMES).join(' ')}, or a number)`);
  }
  return m >>> 0;
}
function flagNames(f) {
  const out = [];
  for (const [k, v] of Object.entries(P.F)) if (f & v) out.push(k);
  for (let b = 0; b < 32; b++) { const v = (1 << b) >>> 0; if (f & v && !Object.values(P.F).includes(v)) out.push('0x' + v.toString(16)); }
  return out;
}

const sig = l => (l || []).map(e => `${e.key}:${e.type}@${e.offset}`).join(',');
const layoutOf = ply => (ply.vertices && ply.vertices.layout) || [];
const isSkinned = ply => layoutOf(ply).some(e => e.usage === 5) || ply.parts.some(p => p.flags & P.F.skinned);
const weightComps = ply => layoutOf(ply).filter(e => e.usage === 4).reduce((s, e) => s + e.comps, 0);
const isIdent = m => !m || IDENT.every((x, i) => Math.abs(m[i] - x) < 1e-12);
const checkMatrix = m => { if (m && (m.length !== 12 || Array.from(m).some(x => !Number.isFinite(+x)))) refuse('matrix needs 12 finite numbers (x.xyz y.xyz z.xyz t.xyz)'); };

// vertex numbers used by any part (all vertices when no parts)
function usedVertices(ply) {
  const v = ply.vertices; if (!v) return [];
  if (!ply.parts.length || !ply.indices) return Array.from({ length: v.count }, (_, i) => i);
  const seen = new Uint8Array(v.count), out = [];
  for (let i = 0; i < ply.parts.length; i++) for (const k of P.partTriangles(ply, i)) if (k < v.count && !seen[k]) { seen[k] = 1; out.push(k); }
  return out;
}
function usedPoints(ply, partIdx) {
  const v = ply.vertices, pos = v && v.position; if (!pos) return [];
  const c = (v.layout.find(e => e.key === 'position') || {}).comps || 3;
  let ids;
  if (partIdx == null) ids = usedVertices(ply);
  else { const s = new Set(); for (const k of P.partTriangles(ply, partIdx)) if (k < v.count) s.add(k); ids = [...s]; }
  return ids.map(k => [pos[k * c], pos[k * c + 1], pos[k * c + 2]]);
}

// rewrite one append part's layout descriptor so it reads the base vertex layout (NOTES 13 step B, applied to descriptors:
// in this format the parts carry the layout and all parts share one VERT)
function fitsLayout(part, stride, layout) {
  return P.partLayout(part, stride).every(e => !e.size || layout.some(x => x.key === e.key && x.type === e.type && x.offset === e.offset));
}
function reconcilePart(p0, stride, layout, bCount, changed, k) {
  if (fitsLayout(p0, stride, layout)) return p0;
  const p = { ...p0 };
  if (p.tag === 'MESH') {
    const has = key => layout.some(e => e.key === key);
    let uv = 0; while (layout.some(e => e.key === 'uv' + uv && e.type === 1)) uv++;
    p.fvf = ((p.fvf & ~0xF5E) | ((p.fvf & 0x0E) || 0x2) | (has('normal') ? 0x10 : 0) | (has('color') ? 0x40 : 0) | (uv << 8)) >>> 0;
    if (fitsLayout(p, stride, layout)) {
      if (!(p.flags & P.F.material)) { const n = P.textureNameCount(p), t = (p.textures || []).slice(0, n); while (t.length < n) t.push(''); p.textures = t; }
      changed.push(`append part ${k}: fvf 0x${p0.fvf.toString(16)} -> 0x${p.fvf.toString(16)} (base vertex layout)`);
      return p;
    }
    Object.assign(p, p0);
  }
  // SUBM, or a MESH whose fvf cannot express the base layout: declaration = base layout
  const q = { ...p0, tag: 'SUBM', declaration: layout.filter(e => e.size).map(e => ({ type: e.type, usage: e.usage, index: e.index, stream: 0 })),
    streams: p0.streams || Buffer.alloc(0) };
  if (p0.tag === 'MESH') { delete q.fvf; q.firstVertex = 0; q.vertexCount = bCount; }
  if (!fitsLayout(q, stride, layout)) refuse(`append part ${k}: its vertex layout cannot be mapped onto the base layout`);
  changed.push(`append part ${k}: ${p0.tag} -> SUBM declaration = base vertex layout`);
  return q;
}

// NOTES 13: a + b (b moved by matrixB). Returns { ply, changed: [text] }.
function merge(a, b, opts = {}) {
  if (!a || !b) refuse('merge needs two meshes');
  if (a.error) refuse('base mesh: ' + a.error);
  if (b.error) refuse('append mesh: ' + b.error);
  const changed = [];
  checkMatrix(opts.matrixB);
  let bt = isIdent(opts.matrixB) ? b : P.transform(b, Array.from(opts.matrixB, Number));
  if (!isIdent(opts.matrixB)) changed.push('append moved by matrix ' + Array.from(opts.matrixB).join(' '));
  if (opts.rebind && bt.skin) {
    const { from, to } = opts.rebind, i = bt.skin.findIndex(n => n.toLowerCase() === String(from).toLowerCase());
    if (i >= 0) { bt = { ...bt, skin: bt.skin.slice() }; bt.skin[i] = to; changed.push(`skin bone ${from} -> ${to}`); }
  }
  const aEmpty = !a.vertices || !a.vertices.count;
  if (aEmpty && !a.parts.length) { changed.push('base empty: result = append'); return { ply: bt, changed }; }
  if (a.magic !== b.magic) refuse(`cannot merge ${a.magic} with ${b.magic}`);
  if (b.vertices && b.vertices.count) {
    const sa = isSkinned(a), sb = isSkinned(b);
    if (sa !== sb) refuse(`cannot merge a ${sa ? 'skinned' : 'unskinned'} mesh with a ${sb ? 'skinned' : 'unskinned'} one (bone bindings would be invented)`);
    if (sa && weightComps(a) !== weightComps(b)) refuse(`different skin weight counts (${weightComps(a)} vs ${weightComps(b)})`);
  }
  const va = a.vertices, vb = bt.vertices;
  let b2 = bt;
  if (va && vb && (sig(va.layout) !== sig(vb.layout) || va.stride !== vb.stride)) {
    if (vb.mixed) refuse('append mesh has parts with different vertex layouts and the base layout differs: cannot reconcile');
    const lost = vb.layout.filter(e => !va.layout.some(x => x.key === e.key && x.type === e.type));
    if (lost.length) changed.push('append channels dropped (base lacks them): ' + lost.map(e => e.key).join(' '));
    b2 = { ...bt, parts: bt.parts.map((p, k) => reconcilePart(p, va.stride, va.layout, vb.count, changed, k)) };
  }
  let o;
  try { o = P.concat(a, b2); } catch (e) { refuse(e.message.replace(/^ply\.concat: /, '')); }
  // NOTES step B: diffuse missing in the append = 0xFFFFFFFF (concat zero-fills)
  if (va && vb) {
    const aCount = va.count;
    for (const e of o.vertices.layout) if (e.usage === 2 && !vb.layout.some(x => x.key === e.key)) {
      const arr = o.vertices[e.key]; if (arr) arr.fill(255, aCount * e.comps);
      changed.push(`append ${e.key} filled white`);
    }
  }
  if (a.bounds || bt.bounds) { const nb = P.bounds(o); if (nb) o.bounds = nb; }
  changed.push(`appended ${b.parts.length} part(s), ${vb ? vb.count : 0} vertices`);
  return { ply: o, changed };
}

// NOTES 14: child mesh into the parent's, child's local matrix (relative to the parent bone). parentPly null = no parent mesh.
function mergeChildIntoParent(parentPly, childPly, childLocalMatrix, opts = {}) {
  if (!parentPly) {
    checkMatrix(childLocalMatrix);
    const ply = isIdent(childLocalMatrix) ? childPly : P.transform(childPly, Array.from(childLocalMatrix, Number));
    return { ply, changed: ['parent has no mesh: result = child moved into parent space'] };
  }
  return merge(parentPly, childPly, { matrixB: childLocalMatrix, rebind: opts.rebind });
}

// NOTES 15. groups: 'parts' (one per part) | 'material' | [[idx..], ..] | [idx..] (one group).
// Returns [{ parts, key, ply, offset }] (offset = matrix the new bone needs when recentre, else null).
function materialKey(p) { return (p.material || (p.textures || []).find(Boolean) || 'untagged').toLowerCase(); }
function demerge(ply, groups, opts = {}) {
  if (ply.error) refuse('mesh: ' + ply.error);
  const n = ply.parts.length;
  let list;
  if (groups === 'parts' || groups == null) list = ply.parts.map((_, i) => ({ parts: [i], key: 'part ' + i }));
  else if (groups === 'material') {
    const m = new Map();
    ply.parts.forEach((p, i) => { const k = materialKey(p); if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
    list = [...m].map(([key, parts]) => ({ parts, key }));
  } else if (Array.isArray(groups)) {
    const gs = groups.length && !Array.isArray(groups[0]) ? [groups] : groups;
    list = gs.map(g => ({ parts: g.map(Number), key: 'parts ' + g.join(',') }));
  } else refuse('groups must be "parts", "material" or lists of part indexes');
  for (const g of list) {
    if (!g.parts.length) refuse('empty group');
    for (const i of g.parts) if (!Number.isInteger(i) || i < 0 || i >= n) refuse(`no part ${i} (mesh has ${n})`);
  }
  return list.map(g => {
    let out = P.split(ply, g.parts), offset = null;
    if (opts.recentre && out.bounds) {
      const b = out.bounds, c = [0, 1, 2].map(k => (b[k] + b[k + 3]) / 2);
      out = P.transform(out, [1, 0, 0, 0, 1, 0, 0, 0, 1, -c[0], -c[1], -c[2]]);
      offset = [1, 0, 0, 0, 1, 0, 0, 0, 1, c[0], c[1], c[2]];
    }
    return { parts: g.parts, key: g.key, ply: out, offset };
  });
}

// NOTES 16. opts: meshFlagsSet/Clear, vertexFlagsSet/Clear (names|numbers|lists), material {from,to}, parts [idx]|'all', force.
function tweak(ply, opts = {}) {
  if (ply.error) refuse('mesh: ' + ply.error);
  const set = parseFlags(opts.meshFlagsSet), clr = parseFlags(opts.meshFlagsClear);
  const vset = parseFlags(opts.vertexFlagsSet), vclr = parseFlags(opts.vertexFlagsClear);
  const sel = opts.parts == null || opts.parts === 'all' ? ply.parts.map((_, i) => i) : [].concat(opts.parts).map(Number);
  for (const i of sel) if (!ply.parts[i]) refuse(`no part ${i} (mesh has ${ply.parts.length})`);
  const changed = [];
  const parts = ply.parts.map(p => ({ ...p }));
  const stride = ply.vertices ? ply.vertices.stride : 0;
  for (const i of sel) {
    const p = parts[i], old = p.flags >>> 0, nf = ((old | set) & ~clr) >>> 0;
    if (nf !== old) {
      const d = (old ^ nf) >>> 0;
      if (!opts.force) {
        if (d & P.F.skinned) refuse(`part ${i}: changing 0x10 (skinned) changes the vertex layout (use force to do it anyway)`);
        if (sig(P.partLayout(p, stride)) !== sig(P.partLayout({ ...p, flags: nf }, stride))) refuse(`part ${i}: flags 0x${nf.toString(16)} change the vertex layout the part reads (use force)`);
        if (old & P.F.material && !(nf & P.F.material)) refuse(`part ${i}: clearing 0x400 drops material "${p.material || '(inline)'}" for empty texture names (use force)`);
      }
      if (nf & P.F.material && !(old & P.F.material) && !p.material && !p.inlineMaterial && !(opts.material && opts.material.to))
        refuse(`part ${i}: setting 0x400 needs a material name (give material to=)`);
      if (nf & P.F.material && !(old & P.F.material) && !p.material && !p.inlineMaterial) p.material = opts.material.to;
      p.flags = nf;
      changed.push(`part ${i} flags 0x${old.toString(16)} -> 0x${nf.toString(16)}`);
    }
  }
  if (opts.material && opts.material.from != null) {
    const from = String(opts.material.from).toLowerCase(), to = String(opts.material.to ?? '');
    let hit = 0;
    for (const i of sel) {
      const p = parts[i];
      if (p.material && p.material.toLowerCase() === from) { p.material = to; hit++; changed.push(`part ${i} material -> ${to}`); }
      if (p.textures && p.textures.some(t => t && t.toLowerCase() === from)) {
        p.textures = p.textures.map(t => (t && t.toLowerCase() === from ? to : t)); hit++; changed.push(`part ${i} texture -> ${to}`);
      }
    }
    if (!hit) refuse(`material "${opts.material.from}" not found in the selected parts`);
  }
  let vertices = ply.vertices;
  if (vset || vclr) {
    if (!vertices) refuse('mesh has no VERT chunk');
    if (ply.magic === 'BPLY') refuse('BPLY VERT has no flags field');
    const old = vertices.flags || 0, nf = ((old | vset) & ~vclr) & 0xffff;
    if (nf !== old) { vertices = { ...vertices, flags: nf }; changed.push(`VERT flags 0x${old.toString(16)} -> 0x${nf.toString(16)}`); }
  }
  if (!changed.length) return { ply, changed };
  return { ply: { ...ply, parts, vertices }, changed };
}

// NOTES 17 fit, intended: axis-aligned in bone space
function fitBox(points) {
  const pts = toPoints(points);
  if (!pts.length) refuse('no points to fit');
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let c = 0; c < 3; c++) { if (p[c] < mn[c]) mn[c] = p[c]; if (p[c] > mx[c]) mx[c] = p[c]; }
  const centre = [0, 1, 2].map(c => (mn[c] + mx[c]) / 2);
  return { size: [0, 1, 2].map(c => mx[c] - mn[c]), matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, ...centre], min: mn, max: mx, centre };
}
function toPoints(points) {
  if (!points) return [];
  if (points.length && typeof points[0] === 'number' || ArrayBuffer.isView(points)) { const o = []; for (let i = 0; i + 2 < points.length; i += 3) o.push([points[i], points[i + 1], points[i + 2]]); return o; }
  return Array.from(points);
}
const AXIS_ROWS = { x: [0, 1, 0, 0, 0, 1, 1, 0, 0], y: [0, 0, 1, 1, 0, 0, 0, 1, 0], z: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
function fitVolumeToMesh(ply, opts = {}) {
  const kind = String(opts.kind || 'box').toLowerCase();
  const pts = usedPoints(ply);
  const f = fitBox(pts), c = f.centre;
  if (kind === 'box') return { kind, size: f.size, matrix: f.matrix };
  if (kind === 'sphere') {
    let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
    return { kind, radius: r, matrix: f.matrix };
  }
  if (kind === 'cylinder') {
    const ax = String(opts.axis || 'z').toLowerCase(), a = { x: 0, y: 1, z: 2 }[ax];
    if (a == null) refuse('axis must be x, y or z');
    const [u, w] = [0, 1, 2].filter(k => k !== a);
    let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p[u] - c[u], p[w] - c[w]));
    return { kind, radius: r, length: f.size[a], matrix: [...AXIS_ROWS[ax], ...c] };
  }
  refuse(`cannot fit a ${kind} volume (box, cylinder or sphere)`);
}
const clean = x => (Object.is(x, -0) ? 0 : parseFloat(x.toPrecision(12)));
function round(nums, step = 1) {
  step = Number(step);
  if (!(step > 0)) refuse('step must be a positive number');
  const one = x => clean(Math.sign(x) * Math.round(Math.abs(x) / step) * step);
  return Array.isArray(nums) || ArrayBuffer.isView(nums) ? Array.from(nums, one) : one(nums);
}
// a parsed mdl volume -> { size?, radius?, length?, matrix?, notes } of what changes (empty when nothing would)
function roundVolume(v, step, tol = 0.02) {
  const out = {}, notes = [];
  const diff = (a, b) => a.some((x, i) => x !== b[i]);
  if (v.size) { const s = round(v.size, step); if (diff(s, v.size)) out.size = s; }
  if (v.radius != null) { const r = round(v.radius, step); if (r !== v.radius) out.radius = r; }
  if (v.length != null) { const l = round(v.length, step); if (l !== v.length) out.length = l; }
  if (v.matrix) {
    const m = v.matrix.slice(), rot = m.slice(0, 9);
    const nearAxis = rot.every(x => Math.abs(x - Math.round(x)) <= tol && Math.abs(Math.round(x)) <= 1);
    if (nearAxis) for (let i = 0; i < 9; i++) m[i] = clean(Math.round(m[i]));
    else notes.push('orientation not near-axis: left as is');
    for (let i = 9; i < 12; i++) m[i] = round(m[i], step);
    if (diff(m, v.matrix)) out.matrix = m;
  }
  return { change: out, notes };
}

function info(ply) {
  const v = ply.vertices;
  const parts = ply.parts.map((p, i) => {
    const tris = P.partTriangles(ply, i), used = new Set(tris);
    const pts = usedPoints(ply, i), bb = pts.length ? fitBox(pts) : null;
    const layout = P.partLayout(p, v ? v.stride : 0).filter(e => !v || e.offset + e.size <= v.stride);
    return {
      index: i, kind: p.tag, flags: p.flags >>> 0, flagNames: flagNames(p.flags >>> 0), fvf: p.tag === 'MESH' ? p.fvf >>> 0 : undefined,
      material: p.material || null, inlineMaterial: !!p.inlineMaterial, textures: p.textures || null,
      layout: layout.map(e => `${e.key}:${P.TYPE_NAMES[e.type] || e.type}@${e.offset}`),
      triangles: Math.floor(tris.length / 3), vertices: used.size, bounds: bb ? { min: bb.min, max: bb.max } : null,
      skinBones: p.boneMap && ply.skin ? p.boneMap.map(x => (x ? ply.skin[x - 1] : null)) : null,
    };
  });
  return {
    magic: ply.magic, error: ply.error || null, bounds: ply.bounds ? Array.from(ply.bounds) : null, skin: ply.skin || null,
    vertices: v ? v.count : 0, stride: v ? v.stride : 0, vertFlags: v ? v.flags || 0 : 0, mixed: !!(v && v.mixed),
    layout: v ? v.layout.map(e => `${e.key}:${P.TYPE_NAMES[e.type] || e.type}@${e.offset}`) : [],
    triangles: ply.indices ? Math.floor(ply.indices.length / 3) : 0, mirrored: !!ply.mirrored, parts,
    chunks: (ply.chunks || []).map(c => c.tag || '(tail)'),
  };
}

module.exports = { merge, mergeChildIntoParent, demerge, tweak, fitBox, fitVolumeToMesh, round, roundVolume, info, parseFlags, flagNames, usedPoints, OpError, FLAG_NAMES, IDENT };
