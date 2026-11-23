// model/skin: vertex skinning of a parsed .ply (ply.js) against a posed skeleton: the body mesh bent to its bones.
// Pure: no file IO. Matrices number[12], matrix 43 order, row vectors (p' = p * M), "a followed by b" = mdl.mul(a, b)
// as scene.js. Positions come out in WORLD space (the space of the worlds given), so the mesh is drawn with identity.
//
// Engine rules (source path:line; [V] read in the source, [I] inferred):
//   bind [V] BindBones(base, fallback): for every SKIN name i the bone is looked up
//            the model that holds the mesh and bind[i] = base.world * inverse(bone.world): `inverse.Invert(bone->GetWorld());
//            bind.Multiply(base->GetWorld(), inverse)`. base = the bone that carries the mesh view. Called once when the
//            model is loaded ( BindSkins), so both worlds are the REST pose of the
//            model the mesh belongs to (for a soldier: the skin's own .mdl, not human.mdl).
//   palette [V] : every frame boneMatrix[i] = bind[i] * bone.renderWorld (the bone's
//            world now); a SKIN name with no bone gives IDENTITY there (:214). The bones are looked up again by name on
//            the skeleton the view sits on (ApplyBone), so a skin copied onto
//            human.mdl ( CopySkin) follows human.mdl's bones.
//   slots [V] : slot 0 = the primitive's own matrix (the world of the bone
//            that carries the mesh). Part with a bone map (flags 0x800): slot i = boneMatrix[map[i] - 1], an entry 0 is
//            skipped (slot left as it was: slot 0 stays the base matrix). Part without one: slot i + 1 = boneMatrix[i].
//            At most 24 bones + the base (MAX_SKIN_BONES).
//   vertex   [V] as64/core/resource/shader/dx10/vs.hlsl:122-131: posW = lerp(pos * world[index[1]], pos * world[index[0]],
//            weight) = weight * (pos * M[index0]) + (1 - weight) * (pos * M[index1]); normals the same with the 3x3
//            part. The index bytes are read as R8G8B8A8_UINT: index[k] =
//            byte k of the ubyte4. Vertex positions are stored in the space of the bone that carries the mesh (at rest
//            every slot equals the base world, so the skinned mesh equals the unskinned one: the test checks this).
//   [I] a weights element wider than float1 (not seen in vanilla as64): weights w0..wn-1 for index 0..n-1, the rest
//       (1 - sum) on index n. A part that is not skinned (flags 0x10 clear) is moved with the base world only.
//   [I] a SKIN name with no bone here uses the base world (the engine's IDENTITY would throw the vertices to the origin).
//
// Exports:
//   isSkinned(ply) -> bool: it has a SKIN list and a part with flags 0x10
//   bind(ply, { baseRest, rest }) -> [m12|null] per SKIN name: baseRest * inverse(rest(name)); null when rest(name) is missing
//   palette(ply, o) -> [m12] per SKIN name: bind[i] * now(name), the base world for a missing bone
//   apply(ply, o) -> ply' (input untouched): vertices.position / vertices.normal replaced by the skinned WORLD values,
//     vertices.raw = null (ply.partAttributes then encodes from the arrays), bounds recomputed, indices untouched,
//     ply'.skinned = { parts, vertices, missing: [SKIN names with no bone], det: determinant of baseNow }
//     Winding [V on vanilla data]: a .ply is wound clockwise against its normals and the models' bone worlds mirror
//     (determinant -1: {Orientation 1 0 0 / 0 -1 0 / 0 0 1} on the root), so in world space the triangles come out
//     counter-clockwise. A caller that draws the result with an identity world swaps the winding itself when det > 0
//     (flipWinding), so every mesh is wound the same way in world space.
//   flipWinding(ply) -> ply' with the two last indices of every part triangle swapped
//     o = { baseRest: m12, rest: name => m12|null   world of the mesh's bone / of a named bone in the mesh's own model at rest
//           baseNow: m12,  now: name => m12|null    the same on the posed skeleton }
//     With now = rest and baseNow = baseRest the result equals ply.transform(ply, baseRest) within float error.
// Author: Imperator_Aug (ARSENAL, ia-dedc5d86)
'use strict';
const mdlLib = require('./mdl'), plyLib = require('./ply');

const F_SKINNED = plyLib.F.skinned, F_BONEMAP = plyLib.F.boneMap;
const det = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
const mul = (a, b) => mdlLib.mul(Array.from(a), Array.from(b));

function isSkinned(ply) {
  return !!(ply && ply.skin && ply.skin.length && (ply.parts || []).some(p => p.flags & F_SKINNED));
}

function bind(ply, o) {
  return (ply.skin || []).map(name => {
    const r = o.rest(name);
    const inv = r ? mdlLib.invert(Array.from(r)) : null;
    return inv ? mul(o.baseRest, inv) : null;
  });
}

function palette(ply, o, missing) {
  const b = bind(ply, o);
  return (ply.skin || []).map((name, i) => {
    const n = b[i] ? o.now(name) : null;
    if (!n) { if (missing && !missing.includes(name)) missing.push(name); return Array.from(o.baseNow); }
    return mul(b[i], n);
  });
}

// the matrix of every slot a part's index bytes can name
function slotsOf(part, pal, base) {
  const slots = [base];
  if (part.flags & F_BONEMAP && part.boneMap) {
    part.boneMap.forEach((b, i) => { slots[i] = b > 0 && pal[b - 1] ? pal[b - 1] : (slots[i] || base); });
  } else pal.forEach((m, i) => { slots[i + 1] = m; });
  return slots;
}

function apply(ply, o) {
  const out = { ...ply, parts: ply.parts, vertices: ply.vertices ? { ...ply.vertices } : null };
  const v = out.vertices, info = { parts: 0, vertices: 0, missing: [] };
  out.skinned = info;
  if (!v || !v.position) return out;
  const base = Array.from(o.baseNow), n = v.count;
  const pal = palette(ply, o, info.missing);
  const pos = v.position, nor = v.normal && v.normal.length >= n * 3 ? v.normal : null;
  const P = new Float32Array(pos.length), N = nor ? new Float32Array(nor.length) : null;
  const done = new Uint8Array(n);
  const one = (k, slots, w, ix, wc) => {
    const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
    const nx = nor ? nor[k * 3] : 0, ny = nor ? nor[k * 3 + 1] : 0, nz = nor ? nor[k * 3 + 2] : 0;
    let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0, left = 1;
    for (let c = 0; c <= wc && c < 4; c++) {
      const wt = c < wc ? w[k * wc + c] : left;
      left -= wt;
      if (!wt) continue;
      const m = slots[ix[k * 4 + c]] || base;
      px += wt * (x * m[0] + y * m[3] + z * m[6] + m[9]); py += wt * (x * m[1] + y * m[4] + z * m[7] + m[10]); pz += wt * (x * m[2] + y * m[5] + z * m[8] + m[11]);
      if (N) { qx += wt * (nx * m[0] + ny * m[3] + nz * m[6]); qy += wt * (nx * m[1] + ny * m[4] + nz * m[7]); qz += wt * (nx * m[2] + ny * m[5] + nz * m[8]); }
    }
    P[k * 3] = px; P[k * 3 + 1] = py; P[k * 3 + 2] = pz;
    if (N) { const l = Math.hypot(qx, qy, qz) || 1; N[k * 3] = qx / l; N[k * 3 + 1] = qy / l; N[k * 3 + 2] = qz / l; }
  };
  const rigid = k => {
    const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], m = base;
    P[k * 3] = x * m[0] + y * m[3] + z * m[6] + m[9]; P[k * 3 + 1] = x * m[1] + y * m[4] + z * m[7] + m[10]; P[k * 3 + 2] = x * m[2] + y * m[5] + z * m[8] + m[11];
    if (N) {
      const nx = nor[k * 3], ny = nor[k * 3 + 1], nz = nor[k * 3 + 2];
      const qx = nx * m[0] + ny * m[3] + nz * m[6], qy = nx * m[1] + ny * m[4] + nz * m[7], qz = nx * m[2] + ny * m[5] + nz * m[8], l = Math.hypot(qx, qy, qz) || 1;
      N[k * 3] = qx / l; N[k * 3 + 1] = qy / l; N[k * 3 + 2] = qz / l;
    }
  };
  for (let i = 0; i < ply.parts.length; i++) {
    const part = ply.parts[i];
    let w = null, ix = null, wc = 0;
    if (part.flags & F_SKINNED && ply.skin && ply.skin.length) {
      let at = null;
      try { at = plyLib.partAttributes(ply, i); } catch (e) { at = null; }
      if (at && at.weight && at.boneIndex) { w = at.weight; ix = at.boneIndex; wc = Math.max(1, Math.min(4, ((at.layout || []).find(e => e.key === 'weight') || {}).comps || 1)); }
    }
    const slots = w ? slotsOf(part, pal, base) : null;
    if (w) info.parts++;
    const tri = plyLib.partTriangles(ply, i);
    for (let t = 0; t < tri.length; t++) {
      const k = tri[t];
      if (k >= n || done[k]) continue;
      done[k] = 1;
      if (w) { one(k, slots, w, ix, wc); info.vertices++; } else rigid(k);
    }
  }
  for (let k = 0; k < n; k++) if (!done[k]) rigid(k);
  v.position = P;
  if (N) v.normal = N;
  v.raw = null;
  info.det = det(base);
  const nb = plyLib.bounds(out);
  if (nb) out.bounds = nb;
  return out;
}

function flipWinding(ply) {
  if (!ply.indices) return ply;
  const ix = ply.indices.slice();
  for (const p of ply.parts) {
    const a = Math.max(0, p.firstFace * 3), b = Math.min(ix.length, (p.firstFace + p.faceCount) * 3);
    for (let i = a; i + 2 < b; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  return { ...ply, indices: ix };
}

module.exports = { isSkinned, bind, palette, apply, flipWinding, det };
