// model/ply: full .ply (EPLY mesh / BPLY big map mesh) reader + writer, byte-identical round trip, geometry helpers.
// Engine: ReadMesh:107 (chunk loop) + ReadChunk:435 (MESH SUBM ADJA SKIN MROR BNDS SHDW);
//    ReadChunk:142 (EPLY VERT INDX LBEG LEND); ReadChunk:387 (BPLY IND4 BAS2 BASS InfG LBEG
//   LEND INDX VERT); (SUBM) / ReadMesh (MESH) / ReadMaterial / ;
//    Read; , , .
//   Web:, ply-vertex.md.
//
// File = magic 'EPLY'|'BPLY' + chunks to EOF, chunk = tag(4) + payload (no size field: the payload is decoded to skip it).
//   BNDS  6 f32 min.xyz max.xyz                       SKIN  i32 n; n count-strings (bone names)
//   MESH  u32 fvf; i32 firstFace faceCount; u32 flags; material section
//   SUBM  declaration: (u8 usage<<4|type, u8 index, u8 stream)* FF; stream bytes* FF (engine skips to the FF; normally
//         empty); i32 firstFace faceCount firstVertex vertexCount; u32 flags; material section
//   material section: [flags&0x200] u32 textureFlags; [flags&0x400] count-string material ('' -> inline layered material:
//         i32 n, n x (count-string type, u8 t, t x (layer, texture count-strings), type 'bump' + u32 colour + f32 parallax,
//         type 'layered' nests)); else texture names: detail|light -> 1+detail+light names, else 2 uv sets|keepBlend -> 2,
//         else 1 uv set -> 1, else 0; [flags&0x800] u8 n + n u8 bone map (1-based SKIN index, 0 = none, max 25)
//   VERT  EPLY: i32 count; u16 stride; u16 flags (bit0 full colours, else colour rgb doubled on upload); count*stride
//         BPLY: i32 count; i32 stride; count*stride
//   INDX  i32 n; n u16      IND4 (BPLY) i32 n; n u32      ADJA i32 n; n*6 bytes (skipped)   SHDW i32 n; n bytes (skipped)
//   MROR  no payload (mirrored)   LBEG / LEND no payload (engine also synthesises them around the loop)
//   BAS2 (BPLY) 12 f32 basis      BASS (BPLY, legacy) 12 f32 basis + 6 f32 unused
//   InfG (BPLY) i32 rect[4]; f32 minZ maxZ; i32 n; n u16 faces (bits 0-14 part, bit 15 removed)
//   EPLY accepts BNDS SKIN MESH SUBM VERT INDX ADJA SHDW MROR LBEG LEND; BPLY those + IND4 BAS2 BASS InfG.
//
// Vertex layout (one VERT shared by all parts; decoded with the widest part layout, `vertices.layoutPart`; parts whose
//   layout is not a prefix of it set `vertices.mixed` (vanilla: 0x152+tangent next to 0x252 parts), see partAttributes):
//   MESH (file order): position f3 if fvf&0x0E; weight f1 + boneIndex ubyte4 if part flags&0x10;
//     normal f3 if fvf&0x10 (absent: the loader inserts (0,0,1) after the file is read, the file has none);
//     color (D3DCOLOR, bytes B G R A [I]) if fvf&0x40; uv0..uvN-1 f2, N = (fvf&0xF00)>>8; tangent f4 if flags&0x100 and
//     the material has bump: the material is outside the file, so tangent is decoded when flags&0x100 and the VERT
//     stride has 16 spare bytes [I]. Bytes past the decoded elements (vanilla pads +8/+16) stay in `vertices.raw`.
//   SUBM: the declaration elements of stream 0 in order; type 0 f1, 1 f2, 2 f3, 3 f4, 4 short2, 5 ubyte4, 6 color
//     (4 bytes), other types 0 bytes; usage 0 position, 1 normal, 2 color, 3 texcoord (key uv<index>), 4 weights
//     (key weight), 5 indices (boneIndex), 6 tangent, 7 psize, 8 texcoord extra (wind params, key extra<index>).
//   Skinned: one weight stored, 2nd = 1-w; boneIndex bytes = slots of the part bone map [I].
//   Units: engine units, 20 per metre; z up (default normal UNIT_Z, InfG heights are z). uv as D3D (v down).
//   Matrices (transform): number[12] or Float32Array(12) in matrix 43 order x.xyz, y.xyz, z.xyz, t.xyz (row vectors:
//     p' = p.x*x + p.y*y + p.z*z + t), as the engine stores 3x4 matrices.
//
// parse(buf) -> { magic, bounds: Float32Array(6)|null, skin: [names]|null, parts: [part], vertices, indices, basis, grid,
//     mirrored, chunks: [{ tag, offset, size, raw? }], error: string|null }   never throws
//   part = { tag:'MESH'|'SUBM', fvf (MESH) | declaration: [{ type, usage, index, stream }] + streams: Buffer (SUBM),
//     firstFace, faceCount, firstVertex, vertexCount (SUBM), flags, textureFlags (u32, flags&0x200), material: string|null,
//     inlineMaterial: { layers: [{ type, textures: [{ layer, texture }], specular?: u32, parallax?: number,
//     layers? }] }|null, textures: [names]|null (flags&0x400 clear), boneMap: number[]|null }
//   vertices = { count, stride, flags (EPLY VERT u16), layout: [{ key, usage, type, index, stream, offset, size, comps }],
//     layoutPart, mixed (parts disagree on the layout), raw: Buffer (count*stride, as read), <key>: typed array n*comps }
//     float types -> Float32Array (bits copied, NaN payloads kept), short2 -> Int16Array, ubyte4/color -> Uint8Array
//   indices = Uint16Array (INDX) | Uint32Array (IND4) | null;  basis = { tag:'BAS2'|'BASS', values: Float32Array(12),
//     extra: Float32Array(6)|null } | null;  grid = { rect: [4 i32], minZ, maxZ, faces: Uint16Array } | null
//   chunks keep file order; `raw` (payload after the tag) on ADJA, SHDW and repeats of a single-use chunk; a chunk with
//     tag '' and tail:true holds the unread rest of the file after an error (bad magic: the whole file).
//   Names are latin1 strings (byte-exact both ways).
// write(obj) -> Buffer. Walks obj.chunks (or the default order BNDS SKIN parts BAS2 VERT INDX InfG MROR); decoded chunks
//   are encoded from the object, raw ones copied. Parts are written in order with their own tag; extra parts go after the
//   last part chunk, surplus part chunks are dropped. Vertices: raw bytes overlaid with each layout element's array.
//   EPLY always writes INDX (u16; throws on an index > 65535); BPLY writes IND4 for Uint32Array, INDX for Uint16Array.
// Helpers (pure: return new objects, share untouched typed arrays):
//   partTriangles(obj, i) -> index typed array of part i (3 per face)
//   partAttributes(obj, i) -> { layout, <key>: typed array } part i's own layout decoded over the shared vertices
//   partLayout(part, stride) -> layout elements of one part (exported for viewers)
//   bounds(obj) -> Float32Array(6) min.xyz max.xyz of vertices used by any part (all vertices without parts) | null
//   setFlags(obj, i, flags) -> obj'  (flags only: changing 0x10/0x100 on MESH changes the layout the engine expects)
//   setMaterial(obj, i, name) -> obj' (flags |= 0x400, inline material and texture names dropped)
//   transform(obj, m12, { keepWinding }) -> obj'  positions, normals (inverse transpose), tangents (w flips with a
//     negative determinant), bounds recomputed; negative determinant swaps triangle winding unless keepWinding.
//     BPLY basis is left as is.
//   concat(a, b) -> a' with b's parts and geometry appended. Same magic required. Layouts: elements matched by key;
//     a's layout and stride win; an element b lacks is zero-filled (normal (0,0,1), weight 1); b's undecoded bytes are
//     copied only when both layouts and strides are equal. SKIN lists merged by name, b's bone maps remapped; b's
//     boneIndex bytes remapped when a b part is skinned without a bone map [I]. EPLY over 65536 vertices throws.
//     b faces start after a's (a's index count padded to a multiple of 3); SUBM firstVertex shifted; InfG faces appended.
//     ADJA/SHDW chunks (stale topology, skipped by the engine) are dropped.
// Gates of Hell (gohweb GHFMT rows; GoH .ply files are the same chunk forms: 3,000 vanilla GoH .ply read and written back
//   byte-identical, every GoH SUBM declaration and 140,376 files scanned, 2026-11-14 [I]):
//   wind params (GHFMT-02 [V]): the GoH vertex element is 4 floats (AS2 2). A SUBM declaration names its own type, so a
//     usage 8 element of type 3 (float4) decodes as extra<index> with 4 comps and writes back unchanged; no vanilla GoH file
//     declares one (they carry the GoH runtime element only) [I].
//   bump slots (GHFMT-28 [I]): an inline bump material names its textures by index, and the order differs: GoH 0 diffuse
//     1 lightmap 2 bump 3 specular 4 height; AS2 (as64, MoW:AS2) 0 diffuse 1 bump 2 specular 3 height. BUMP_SLOTS[kind];
//     bumpSlot(kind, i) -> the slot name ('goh' | 'as2', a game id or vfs exe also taken; unknown kind = as2); a lookup helper, no reader or writer calls it yet. Bytes are
//     never reordered: a part's file is read and written as stored (no vanilla GoH .ply holds an inline material).
//   lightmap (GHFMT-11 [V]): a texture layer of every GoH .mtl (text, read by edit/ply.js mtlInfo: MTL_TEX holds lightmap); here the slot name above.
//   split(obj, partIndexes) -> obj' holding those parts only, vertices re-based (first-use order) and indices remapped,
//     faces consecutive, SUBM firstVertex/vertexCount = used range, InfG faces filtered, bounds recomputed, ADJA/SHDW dropped.
// Author: Imperator_Aug (ARSENAL, ia-be19a164)
'use strict';
const { Reader, BinError } = require('../bin');

const F = { dynamic: 1, blend: 2, normals: 4, skinned: 0x10, hidden: 0x20, mirrored: 0x40, solid: 0x80, detail: 0x100, light: 0x200, material: 0x400, boneMap: 0x800, keep: 0x1000 };
const TYPE_SIZE = [4, 8, 12, 16, 4, 4, 4];
const TYPE_COMPS = [1, 2, 3, 4, 2, 4, 4];
const TYPE_NAMES = ['float1', 'float2', 'float3', 'float4', 'short2', 'ubyte4', 'color'];
const USAGE_NAMES = ['position', 'normal', 'color', 'texcoord', 'weights', 'indices', 'tangent', 'psize', 'texcoordExtra'];
const U = { position: 0, normal: 1, color: 2, texcoord: 3, weights: 4, indices: 5, tangent: 6, psize: 7, extra: 8 };
const EPLY_TAGS = new Set(['BNDS', 'SKIN', 'MESH', 'SUBM', 'VERT', 'INDX', 'ADJA', 'SHDW', 'MROR', 'LBEG', 'LEND']);
const BPLY_TAGS = new Set([...EPLY_TAGS, 'IND4', 'BAS2', 'BASS', 'InfG']);
const SINGLE = { BNDS: 'bounds', SKIN: 'skin', VERT: 'vertices', INDX: 'indices', IND4: 'indices', BAS2: 'basis', BASS: 'basis', InfG: 'grid' };
const MAX_LAYER_DEPTH = 4;

// ---------- small binary helpers ----------
function rstr(r) {
  let n = r.u8();
  if (n === 255) n = r.u8() | r.u8() << 8 | r.u8() << 16;
  return r.str(n, 'latin1');
}
function wstr(s) {
  const b = Buffer.from(String(s == null ? '' : s), 'latin1');
  if (b.length < 255) return Buffer.concat([Buffer.from([b.length]), b]);
  return Buffer.concat([Buffer.from([255, b.length & 255, b.length >> 8 & 255, b.length >> 16 & 255]), b]);
}
const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n | 0); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff); return b; };
const T = s => Buffer.from(s, 'latin1');
// bit-exact copies between file bytes and typed arrays (little-endian host)
function copyTyped(Ctor, src, off, n) {
  const ab = new ArrayBuffer(n * Ctor.BYTES_PER_ELEMENT);
  new Uint8Array(ab).set(src.subarray(off, off + n * Ctor.BYTES_PER_ELEMENT));
  return new Ctor(ab);
}
function typedBytes(arr, Ctor) {
  const a = arr instanceof Ctor ? arr : Ctor.from(arr);
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength);
}
function fail(msg, at) { return new BinError(msg, at); }

// ---------- game variants (header: Gates of Hell) ----------
const BUMP_SLOTS = Object.freeze({ as2: Object.freeze(['diffuse', 'bump', 'specular', 'height']), goh: Object.freeze(['diffuse', 'lightmap', 'bump', 'specular', 'height']) });
function bumpSlot(kind, i) {
  let k = String(kind || 'as2').toLowerCase();
  if (!BUMP_SLOTS[k]) { const g = require('../games').get(k); k = g ? g.kind : 'as2'; }
  return BUMP_SLOTS[k][i] || null;
}

// ---------- layouts ----------
function keyOf(usage, index) {
  switch (usage) {
    case U.position: return index ? 'position' + index : 'position';
    case U.normal: return index ? 'normal' + index : 'normal';
    case U.color: return index ? 'color' + index : 'color';
    case U.texcoord: return 'uv' + index;
    case U.weights: return index ? 'weight' + index : 'weight';
    case U.indices: return index ? 'boneIndex' + index : 'boneIndex';
    case U.tangent: return index ? 'tangent' + index : 'tangent';
    case U.psize: return 'psize';
    case U.extra: return 'extra' + index;
    default: return `u${usage}_${index}`;
  }
}
function buildLayout(decl) {
  const out = [], seen = new Set();
  let off = 0;
  for (const e of decl) {
    if ((e.stream || 0) !== 0) continue;
    const size = TYPE_SIZE[e.type] || 0;
    let key = keyOf(e.usage, e.index);
    while (seen.has(key)) key += '_';
    seen.add(key);
    out.push({ key, usage: e.usage, type: e.type, index: e.index, stream: 0, offset: off, size, comps: size ? TYPE_COMPS[e.type] : 0 });
    off += size;
  }
  out.stride = off;
  return out;
}
// MESH: the elements adds, minus the normal when the file has none; tangent inferred from stride
function meshDecl(fvf, flags, stride) {
  const d = [];
  if (fvf & 0x0E) d.push({ type: 2, usage: U.position, index: 0 });
  if (flags & F.skinned) { d.push({ type: 0, usage: U.weights, index: 0 }); d.push({ type: 5, usage: U.indices, index: 0 }); }
  if (fvf & 0x10) d.push({ type: 2, usage: U.normal, index: 0 });
  if (fvf & 0x40) d.push({ type: 6, usage: U.color, index: 0 });
  for (let i = 0, n = (fvf & 0xF00) >> 8; i < n; i++) d.push({ type: 1, usage: U.texcoord, index: i });
  const base = buildLayout(d).stride;
  if (flags & F.detail && stride != null && stride - base >= 16) d.push({ type: 3, usage: U.tangent, index: 0 });
  return d;
}
function partLayout(p, stride) { return buildLayout(p.tag === 'MESH' ? meshDecl(p.fvf >>> 0, p.flags >>> 0, stride) : p.declaration || []); }
function texCoordCount(p) {
  if (p.tag === 'MESH') return (p.fvf & 0xF00) >> 8;
  return (p.declaration || []).filter(e => e.usage === U.texcoord && e.type === 1 && (e.stream || 0) === 0).length;
}
function textureNameCount(p) {
  const fl = p.flags;
  if (fl & (F.detail | F.light)) return 1 + (fl & F.detail ? 1 : 0) + (fl & F.light ? 1 : 0);
  const t = texCoordCount(p);
  if (t === 2 || fl & F.keep) return 2;
  return t === 1 ? 1 : 0;
}
const layoutSig = l => l.map(e => `${e.key}:${e.type}@${e.offset}`).join(',');

// ---------- vertices ----------
function decodeVertices(raw, count, stride, layout) {
  const v = { count, stride, layout: [], raw };
  for (const e of layout) {
    if (!e.size || e.offset + e.size > stride) continue;
    v.layout.push(e);
    const n = count * e.comps;
    let arr;
    if (e.type <= 3) {
      arr = new Float32Array(n); const u = new Uint32Array(arr.buffer);
      for (let i = 0, k = 0; i < count; i++) { const o = i * stride + e.offset; for (let c = 0; c < e.comps; c++) u[k++] = raw.readUInt32LE(o + 4 * c); }
    } else if (e.type === 4) {
      arr = new Int16Array(n);
      for (let i = 0, k = 0; i < count; i++) { const o = i * stride + e.offset; arr[k++] = raw.readInt16LE(o); arr[k++] = raw.readInt16LE(o + 2); }
    } else {
      arr = new Uint8Array(n);
      for (let i = 0; i < count; i++) arr.set(raw.subarray(i * stride + e.offset, i * stride + e.offset + 4), i * 4);
    }
    v[e.key] = arr;
  }
  return v;
}
function encodeVertices(v) {
  const count = v.count | 0, stride = v.stride | 0, len = count * stride;
  const out = v.raw && v.raw.length === len ? Buffer.from(v.raw) : Buffer.alloc(len);
  for (const e of v.layout || []) {
    const arr = v[e.key];
    if (!arr || !e.size || e.offset + e.size > stride) continue;
    const n = Math.min(count, Math.floor(arr.length / e.comps));
    if (e.type <= 3) {
      if (arr instanceof Float32Array) {
        const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.length);
        for (let i = 0, k = 0; i < n; i++) { const o = i * stride + e.offset; for (let c = 0; c < e.comps; c++) out.writeUInt32LE(u[k++], o + 4 * c); }
      } else for (let i = 0, k = 0; i < n; i++) { const o = i * stride + e.offset; for (let c = 0; c < e.comps; c++) out.writeFloatLE(arr[k++], o + 4 * c); }
    } else if (e.type === 4) {
      for (let i = 0, k = 0; i < n; i++) { const o = i * stride + e.offset; out.writeInt16LE(arr[k++], o); out.writeInt16LE(arr[k++], o + 2); }
    } else {
      for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) out[i * stride + e.offset + c] = arr[i * 4 + c];
    }
  }
  return out;
}
const TYPED_OF = e => (e.type <= 3 ? Float32Array : e.type === 4 ? Int16Array : Uint8Array);

// ---------- material section ----------
function readLayered(r, depth) {
  const n = r.i32();
  if (n < 0 || n > 64) throw fail(`inline material layer count ${n}`, r.pos - 4);
  const layers = [];
  for (let i = 0; i < n; i++) {
    const L = { type: rstr(r), textures: [] };
    if (L.type === 'layered') {
      if (depth >= MAX_LAYER_DEPTH) throw fail('inline layered material nested too deep', r.pos);
      L.layers = readLayered(r, depth + 1).layers;
    } else {
      const t = r.u8();
      for (let k = 0; k < t; k++) { const layer = rstr(r); L.textures.push({ layer, texture: rstr(r) }); }
      if (L.type === 'bump') { L.specular = r.u32(); L.parallax = r.f32(); }
    }
    layers.push(L);
  }
  return { layers };
}
function writeLayered(m, out) {
  const layers = (m && m.layers) || [];
  out.push(i32(layers.length));
  for (const L of layers) {
    out.push(wstr(L.type));
    if (L.type === 'layered') { writeLayered(L, out); continue; }
    const tx = L.textures || [];
    out.push(Buffer.from([tx.length]));
    for (const t of tx) out.push(wstr(t.layer), wstr(t.texture));
    if (L.type === 'bump') { out.push(u32(L.specular || 0)); const b = Buffer.alloc(4); b.writeFloatLE(L.parallax || 0); out.push(b); }
  }
}
function readMaterial(r, p) {
  const fl = p.flags;
  p.textureFlags = fl & F.light ? r.u32() : undefined;
  p.material = null; p.inlineMaterial = null; p.textures = null; p.boneMap = null;
  if (fl & F.material) {
    const s = rstr(r);
    if (s === '') p.inlineMaterial = readLayered(r, 0); else p.material = s;
  } else {
    p.textures = [];
    for (let i = 0, n = textureNameCount(p); i < n; i++) p.textures.push(rstr(r));
  }
  if (fl & F.boneMap) p.boneMap = Array.from(r.bytes(r.u8()));
}
function writeMaterial(p, out) {
  const fl = p.flags;
  if (fl & F.light) out.push(u32(p.textureFlags || 0));
  if (fl & F.material) {
    if (p.material) out.push(wstr(p.material));
    else { out.push(wstr('')); writeLayered(p.inlineMaterial, out); }
  } else {
    const tx = p.textures || [];
    for (let i = 0, n = textureNameCount(p); i < n; i++) out.push(wstr(tx[i] || ''));
  }
  if (fl & F.boneMap) { const bm = (p.boneMap || []).slice(0, 255); out.push(Buffer.from([bm.length]), Buffer.from(bm)); }
}

// ---------- parse ----------
function readPart(r, tag) {
  const p = { tag };
  if (tag === 'MESH') {
    p.fvf = r.u32(); p.firstFace = r.i32(); p.faceCount = r.i32(); p.flags = r.u32();
  } else {
    p.declaration = [];
    for (let c = r.u8(); c !== 0xff; c = r.u8()) p.declaration.push({ type: c & 15, usage: c >> 4, index: r.u8(), stream: r.u8() });
    const s0 = r.pos;
    while (r.u8() !== 0xff) { /* stream list: skipped by the engine */ }
    p.streams = Buffer.from(r.buf.subarray(s0, r.pos - 1));
    p.firstFace = r.i32(); p.faceCount = r.i32(); p.firstVertex = r.i32(); p.vertexCount = r.i32(); p.flags = r.u32();
  }
  readMaterial(r, p);
  return p;
}

function parse(buf) {
  const obj = { magic: null, bounds: null, skin: null, parts: [], vertices: null, indices: null, basis: null, grid: null, mirrored: false, chunks: [], error: null };
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf || []);
  const tail = (off, msg) => { obj.error = msg; if (off < buf.length) obj.chunks.push({ tag: '', tail: true, offset: off, size: buf.length - off, raw: Buffer.from(buf.subarray(off)) }); };
  if (buf.length < 4) { tail(0, 'file shorter than 4 bytes'); return obj; }
  const magic = buf.toString('latin1', 0, 4);
  if (magic !== 'EPLY' && magic !== 'BPLY') { tail(0, `bad magic ${JSON.stringify(magic)}`); return obj; }
  obj.magic = magic;
  const big = magic === 'BPLY', known = big ? BPLY_TAGS : EPLY_TAGS;
  const r = new Reader(buf, 4);
  while (!r.eof()) {
    const at = r.pos;
    try {
      const tag = r.tag();
      if (!known.has(tag)) throw fail(`unknown chunk ${JSON.stringify(tag)} at ${at}`, at);
      const c = { tag, offset: at, size: 0 };
      const single = SINGLE[tag], dup = single && obj[single] != null;
      let commit = null;
      switch (tag) {
        case 'BNDS': { const b = r.bytes(24); commit = () => { obj.bounds = copyTyped(Float32Array, b, 0, 6); }; break; }
        case 'SKIN': {
          const n = r.i32();
          if (n < 0) throw fail(`SKIN count ${n}`, at);
          const names = []; for (let i = 0; i < n; i++) names.push(rstr(r));
          commit = () => { obj.skin = names; }; break;
        }
        case 'MESH': case 'SUBM': { const p = readPart(r, tag); commit = () => { obj.parts.push(p); }; break; }
        case 'VERT': {
          const count = r.i32(); let stride, flags;
          if (big) stride = r.i32(); else { stride = r.u16(); flags = r.u16(); }
          if (count < 0 || stride < 0) throw fail(`VERT count ${count} stride ${stride}`, at);
          const raw = Buffer.from(r.bytes(count * stride));
          commit = () => { obj.vertices = { count, stride, flags, raw }; }; break;
        }
        case 'INDX': case 'IND4': {
          const n = r.i32(), w = tag === 'IND4' ? 4 : 2;
          if (n < 0) throw fail(`${tag} count ${n}`, at);
          const b = r.bytes(n * w);
          commit = () => { obj.indices = copyTyped(w === 4 ? Uint32Array : Uint16Array, b, 0, n); }; break;
        }
        case 'ADJA': { const n = r.i32(); if (n < 0) throw fail(`ADJA count ${n}`, at); r.skip(n * 6); break; }
        case 'SHDW': { const n = r.i32(); if (n < 0) throw fail(`SHDW count ${n}`, at); r.skip(n); break; }
        case 'BAS2': { const b = r.bytes(48); commit = () => { obj.basis = { tag, values: copyTyped(Float32Array, b, 0, 12), extra: null }; }; break; }
        case 'BASS': { const b = r.bytes(72); commit = () => { obj.basis = { tag, values: copyTyped(Float32Array, b, 0, 12), extra: copyTyped(Float32Array, b, 48, 6) }; }; break; }
        case 'InfG': {
          const rect = [r.i32(), r.i32(), r.i32(), r.i32()], minZ = r.f32(), maxZ = r.f32(), n = r.i32();
          if (n < 0) throw fail(`InfG face count ${n}`, at);
          const b = r.bytes(n * 2);
          commit = () => { obj.grid = { rect, minZ, maxZ, faces: copyTyped(Uint16Array, b, 0, n) }; }; break;
        }
        case 'MROR': commit = () => { obj.mirrored = true; }; break;
        default: break; // LBEG LEND
      }
      c.size = r.pos - at - 4;
      if (tag === 'ADJA' || tag === 'SHDW' || dup) c.raw = Buffer.from(buf.subarray(at + 4, r.pos));
      else if (commit) commit();
      obj.chunks.push(c);
    } catch (e) {
      if (!(e instanceof BinError)) throw e;
      tail(at, /unknown chunk|count|nested|layer/.test(e.message) ? e.message : `truncated chunk at ${at}: ${e.message}`);
      break;
    }
  }
  if (obj.vertices) finishVertices(obj);
  return obj;
}
// decode the VERT bytes with the layout of the first part
function finishVertices(obj) {
  const v = obj.vertices;
  // the widest part layout (the engine sizes vertices by the largest part stride); mixed = a part layout is not a prefix of it
  const ls = obj.parts.map(p => partLayout(p, v.stride));
  let layout = [], from = -1;
  ls.forEach((l, i) => { if (from < 0 || l.stride > layout.stride) { layout = l; from = i; } });
  const sig = layoutSig(layout);
  const mixed = ls.some(l => !sig.startsWith(layoutSig(l)));
  const d = decodeVertices(v.raw, v.count, v.stride, layout);
  obj.vertices = Object.assign({ count: v.count, stride: v.stride, flags: v.flags, layoutPart: from, mixed }, d);
}

// ---------- write ----------
function plan(obj) {
  const big = obj.magic === 'BPLY';
  const has = { BNDS: !!obj.bounds, SKIN: !!obj.skin, VERT: !!obj.vertices, INDEX: !!obj.indices, BASIS: !!obj.basis, InfG: !!obj.grid, MROR: !!obj.mirrored };
  const kind = c => (c.tail || c.raw) ? null : c.tag === 'INDX' || c.tag === 'IND4' ? 'INDEX' : c.tag === 'BAS2' || c.tag === 'BASS' ? 'BASIS' : c.tag;
  let list = (obj.chunks || []).map(c => ({ ...c }));
  // drop decoded chunks whose data is gone
  list = list.filter(c => { const k = kind(c); return !(k in has) || has[k]; });
  const present = new Set(list.map(kind));
  const insertBefore = (c, kinds) => {
    let i = list.findIndex(x => kinds.includes(kind(x)) || x.tail);
    if (i < 0) i = list.length;
    list.splice(i, 0, c);
  };
  if (has.BNDS && !present.has('BNDS')) list.unshift({ tag: 'BNDS' });
  if (has.SKIN && !present.has('SKIN')) insertBefore({ tag: 'SKIN' }, ['MESH', 'SUBM', 'BASIS', 'VERT', 'INDEX', 'InfG', 'MROR']);
  // parts
  const partSlots = list.filter(c => kind(c) === 'MESH' || kind(c) === 'SUBM');
  const nParts = (obj.parts || []).length;
  if (partSlots.length > nParts) { const drop = new Set(partSlots.slice(nParts)); list = list.filter(c => !drop.has(c)); }
  else if (partSlots.length < nParts) {
    const extra = Array.from({ length: nParts - partSlots.length }, () => ({ tag: 'MESH' }));
    const last = partSlots.length ? list.indexOf(partSlots[partSlots.length - 1]) + 1 : -1;
    if (last > 0) list.splice(last, 0, ...extra);
    else { let i = list.findIndex(x => ['BASIS', 'VERT', 'INDEX', 'InfG', 'MROR'].includes(kind(x)) || x.tail); if (i < 0) i = list.length; list.splice(i, 0, ...extra); }
  }
  if (has.BASIS && !present.has('BASIS')) insertBefore({ tag: 'BAS2' }, ['VERT', 'INDEX', 'InfG', 'MROR']);
  if (has.VERT && !present.has('VERT')) insertBefore({ tag: 'VERT' }, ['INDEX', 'InfG', 'MROR']);
  if (has.INDEX && !present.has('INDEX')) insertBefore({ tag: big ? 'IND4' : 'INDX' }, ['InfG', 'MROR']);
  if (has.InfG && !present.has('InfG')) insertBefore({ tag: 'InfG' }, ['MROR']);
  if (has.MROR && !present.has('MROR')) insertBefore({ tag: 'MROR' }, []);
  return list;
}

function writePart(p, out) {
  out.push(T(p.tag === 'SUBM' ? 'SUBM' : 'MESH'));
  if (p.tag === 'SUBM') {
    const d = [];
    for (const e of p.declaration || []) d.push((e.usage << 4 | e.type) & 0xff, e.index & 0xff, (e.stream || 0) & 0xff);
    d.push(0xff);
    out.push(Buffer.from(d), p.streams ? Buffer.from(p.streams) : Buffer.alloc(0), Buffer.from([0xff]));
    out.push(i32(p.firstFace), i32(p.faceCount), i32(p.firstVertex || 0), i32(p.vertexCount || 0), u32(p.flags));
  } else out.push(u32(p.fvf || 0), i32(p.firstFace), i32(p.faceCount), u32(p.flags));
  writeMaterial(p, out);
}

function write(obj) {
  const out = [];
  if (obj.magic) out.push(T(obj.magic));
  const big = obj.magic === 'BPLY';
  let pi = 0;
  for (const c of plan(obj)) {
    if (c.tail) { out.push(c.raw); continue; }
    if (c.raw) { out.push(T(c.tag), c.raw); continue; }
    switch (c.tag) {
      case 'BNDS': out.push(T('BNDS'), typedBytes(obj.bounds, Float32Array).subarray(0, 24)); break;
      case 'SKIN': out.push(T('SKIN'), i32(obj.skin.length), ...obj.skin.map(wstr)); break;
      case 'MESH': case 'SUBM': writePart(obj.parts[pi++], out); break;
      case 'VERT': {
        const v = obj.vertices;
        out.push(T('VERT'), i32(v.count));
        out.push(big ? i32(v.stride) : Buffer.concat([u16(v.stride), u16(v.flags || 0)]));
        out.push(encodeVertices(v));
        break;
      }
      case 'INDX': case 'IND4': {
        const ix = obj.indices, four = big && ix instanceof Uint32Array;
        if (four) { out.push(T('IND4'), i32(ix.length), typedBytes(ix, Uint32Array)); break; }
        for (let i = 0; i < ix.length; i++) if (ix[i] > 0xffff) throw new Error(`ply.write: index ${ix[i]} does not fit INDX (u16)`);
        out.push(T('INDX'), i32(ix.length), typedBytes(ix instanceof Uint16Array ? ix : Uint16Array.from(ix), Uint16Array));
        break;
      }
      case 'BAS2': case 'BASS': {
        const b = obj.basis, tag = b.tag === 'BASS' ? 'BASS' : 'BAS2';
        out.push(T(tag), typedBytes(b.values, Float32Array).subarray(0, 48));
        if (tag === 'BASS') out.push(b.extra ? typedBytes(b.extra, Float32Array).subarray(0, 24) : Buffer.alloc(24));
        break;
      }
      case 'InfG': {
        const g = obj.grid, z = Buffer.alloc(8);
        z.writeFloatLE(g.minZ); z.writeFloatLE(g.maxZ, 4);
        out.push(T('InfG'), ...g.rect.map(i32), z, i32(g.faces.length), typedBytes(g.faces, Uint16Array));
        break;
      }
      default: out.push(T(c.tag)); // MROR LBEG LEND
    }
  }
  return Buffer.concat(out);
}

// ---------- helpers ----------
function clone(obj) {
  return { ...obj, parts: obj.parts.map(p => ({ ...p })), chunks: obj.chunks ? obj.chunks.slice() : obj.chunks, vertices: obj.vertices ? { ...obj.vertices } : null };
}
function partTriangles(obj, i) {
  const p = obj.parts[i], ix = obj.indices;
  if (!p || !ix) return new Uint32Array(0);
  const a = Math.max(0, p.firstFace * 3), b = Math.min(ix.length, (p.firstFace + p.faceCount) * 3);
  return ix.slice(a, Math.max(a, b));
}
function bounds(obj) {
  const v = obj.vertices, pos = v && v.position;
  if (!pos) return null;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const add = k => { for (let c = 0; c < 3; c++) { const x = pos[k * 3 + c]; if (x < mn[c]) mn[c] = x; if (x > mx[c]) mx[c] = x; } };
  let any = false;
  if (obj.parts.length && obj.indices) {
    const seen = new Uint8Array(v.count);
    for (let i = 0; i < obj.parts.length; i++) for (const k of partTriangles(obj, i)) if (k < v.count && !seen[k]) { seen[k] = 1; add(k); any = true; }
  }
  if (!any) for (let k = 0; k < v.count; k++) { add(k); any = true; }
  return any ? Float32Array.from([...mn, ...mx]) : null;
}
// part i's own view of the shared VERT bytes (parts of one file can disagree: vertices.mixed): { layout, <key>: typed array }
function partAttributes(obj, i) {
  const v = obj.vertices, p = obj.parts[i];
  if (!v || !p) return null;
  const d = decodeVertices(v.raw && v.raw.length === v.count * v.stride ? v.raw : encodeVertices(v), v.count, v.stride, partLayout(p, v.stride));
  delete d.raw; delete d.count; delete d.stride;
  return d;
}
function setFlags(obj, i, flags) {
  const o = clone(obj);
  o.parts[i].flags = flags >>> 0;
  return o;
}
function setMaterial(obj, i, name) {
  const o = clone(obj), p = o.parts[i];
  p.flags = (p.flags | F.material) >>> 0; p.material = String(name); p.inlineMaterial = null; p.textures = null;
  return o;
}
function transform(obj, m, opts = {}) {
  const o = clone(obj), v = o.vertices;
  const M = Array.from(m);
  const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
  if (v) {
    const lin = (src, comps, normalize, inv) => {
      const out = new Float32Array(src);
      const A = inv || M;
      for (let k = 0; k < v.count; k++) {
        const j = k * comps, x = src[j], y = src[j + 1], z = src[j + 2];
        let X = x * A[0] + y * A[3] + z * A[6], Y = x * A[1] + y * A[4] + z * A[7], Z = x * A[2] + y * A[5] + z * A[8];
        if (normalize) { const l = Math.hypot(X, Y, Z); if (l > 0) { X /= l; Y /= l; Z /= l; } }
        out[j] = X; out[j + 1] = Y; out[j + 2] = Z;
      }
      return out;
    };
    const comps = key => (v.layout.find(e => e.key === key) || {}).comps || 0;
    if (v.position && comps('position') >= 3) {
      const p = lin(v.position, comps('position'), false), c = comps('position');
      for (let k = 0; k < v.count; k++) { p[k * c] += M[9]; p[k * c + 1] += M[10]; p[k * c + 2] += M[11]; }
      v.position = p;
    }
    if (v.normal && comps('normal') >= 3 && det !== 0) {
      // n' = n * inverse(M)^T, in row-vector form: rows of the cofactor matrix / det
      const C = [M[4] * M[8] - M[5] * M[7], M[5] * M[6] - M[3] * M[8], M[3] * M[7] - M[4] * M[6],
        M[2] * M[7] - M[1] * M[8], M[0] * M[8] - M[2] * M[6], M[1] * M[6] - M[0] * M[7],
        M[1] * M[5] - M[2] * M[4], M[2] * M[3] - M[0] * M[5], M[0] * M[4] - M[1] * M[3]].map(x => x / det);
      v.normal = lin(v.normal, comps('normal'), true, C);
    }
    if (v.tangent && comps('tangent') >= 4) {
      const t = lin(v.tangent, 4, true);
      if (det < 0) for (let k = 0; k < v.count; k++) t[k * 4 + 3] = -t[k * 4 + 3];
      v.tangent = t;
    }
  }
  if (det < 0 && !opts.keepWinding && o.indices) {
    const ix = o.indices.slice();
    for (const p of o.parts) {
      const a = Math.max(0, p.firstFace * 3), b = Math.min(ix.length, (p.firstFace + p.faceCount) * 3);
      for (let i = a; i + 2 < b; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
    o.indices = ix;
  }
  const nb = bounds(o);
  if (nb) o.bounds = nb;
  else if (o.bounds) {
    const b = o.bounds, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 8; c++) {
      const x = b[c & 1 ? 3 : 0], y = b[c & 2 ? 4 : 1], z = b[c & 4 ? 5 : 2];
      const p = [x * M[0] + y * M[3] + z * M[6] + M[9], x * M[1] + y * M[4] + z * M[7] + M[10], x * M[2] + y * M[5] + z * M[8] + M[11]];
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    }
    o.bounds = Float32Array.from([...mn, ...mx]);
  }
  return o;
}
const dropStale = chunks => chunks ? chunks.filter(c => c.tag !== 'ADJA' && c.tag !== 'SHDW') : chunks;

// vertices of v at old indices `pick` (array of vertex numbers) -> new vertices object, same layout and stride
function gather(v, pick) {
  const n = pick.length, s = v.stride;
  const nv = { ...v, count: n, raw: Buffer.alloc(n * s) };
  for (let i = 0; i < n; i++) if (v.raw) v.raw.copy(nv.raw, i * s, pick[i] * s, pick[i] * s + s);
  for (const e of v.layout) {
    const src = v[e.key]; if (!src) continue;
    const dst = new src.constructor(n * e.comps);
    if (src instanceof Float32Array) {
      const su = new Uint32Array(src.buffer, src.byteOffset, src.length), du = new Uint32Array(dst.buffer);
      for (let i = 0; i < n; i++) for (let c = 0; c < e.comps; c++) du[i * e.comps + c] = su[pick[i] * e.comps + c];
    } else for (let i = 0; i < n; i++) for (let c = 0; c < e.comps; c++) dst[i * e.comps + c] = src[pick[i] * e.comps + c];
    nv[e.key] = dst;
  }
  return nv;
}

function concat(a, b, opts = {}) {
  void opts;
  if (a.magic !== b.magic) throw new Error(`ply.concat: magic ${a.magic} vs ${b.magic}`);
  const o = clone(a);
  o.chunks = dropStale(o.chunks);
  const va = a.vertices, vb = b.vertices;
  const aCount = va ? va.count : 0, bCount = vb ? vb.count : 0;
  if (a.magic === 'EPLY' && aCount + bCount > 65536) throw new Error(`ply.concat: ${aCount + bCount} vertices exceed 65536 (EPLY u16 indices)`);
  // skin
  let boneRemap = null;
  if (b.skin) {
    const skin = a.skin ? a.skin.slice() : [];
    boneRemap = b.skin.map(nm => { let i = skin.indexOf(nm); if (i < 0) { skin.push(nm); i = skin.length - 1; } return i; });
    o.skin = skin;
    if (boneRemap.every((x, i) => x === i)) boneRemap = null;
  }
  // vertices
  if (va || vb) {
    const base = va || { ...vb, count: 0, raw: Buffer.alloc(0) };
    const layout = base.layout, stride = base.stride, n = aCount + bCount;
    const same = vb && va && layoutSig(va.layout) === layoutSig(vb.layout) && va.stride === vb.stride;
    const nv = { ...base, count: n, raw: Buffer.alloc(n * stride) };
    if (va && va.raw) va.raw.copy(nv.raw, 0, 0, aCount * stride);
    if (same && vb.raw) vb.raw.copy(nv.raw, aCount * stride, 0, bCount * stride);
    for (const e of layout) {
      const Ctor = TYPED_OF(e), dst = new Ctor(n * e.comps);
      const src = va && va[e.key];
      if (src) new Uint8Array(dst.buffer).set(new Uint8Array(src.buffer, src.byteOffset, Math.min(src.byteLength, aCount * e.comps * Ctor.BYTES_PER_ELEMENT)));
      const eb = vb && vb.layout.find(x => x.key === e.key && x.comps === e.comps && x.type === e.type);
      const sb = eb && vb[e.key], off = aCount * e.comps;
      if (sb) new Uint8Array(dst.buffer, off * Ctor.BYTES_PER_ELEMENT).set(new Uint8Array(sb.buffer, sb.byteOffset, Math.min(sb.byteLength, bCount * e.comps * Ctor.BYTES_PER_ELEMENT)));
      else if (e.usage === U.normal && e.comps >= 3) for (let i = 0; i < bCount; i++) dst[off + i * e.comps + 2] = 1;
      else if (e.usage === U.weights) for (let i = 0; i < bCount; i++) dst[off + i * e.comps] = 1;
      if (e.usage === U.indices && boneRemap && sb && b.parts.some(p => p.flags & F.skinned && !(p.flags & F.boneMap)))
        for (let i = off; i < dst.length; i++) dst[i] = boneRemap[dst[i]] ?? dst[i];
      nv[e.key] = dst;
    }
    o.vertices = nv;
  }
  // indices + parts
  const ia = a.indices || new Uint16Array(0), ib = b.indices || new Uint16Array(0);
  const aLen = Math.ceil(ia.length / 3) * 3, aFaces = aLen / 3;
  const Ctor = ia instanceof Uint32Array || ib instanceof Uint32Array || a.magic === 'BPLY' && aCount + bCount > 65536 ? Uint32Array : Uint16Array;
  const ix = new Ctor(aLen + ib.length);
  ix.set(ia);
  for (let i = 0; i < ib.length; i++) ix[aLen + i] = ib[i] + aCount;
  o.indices = a.indices || b.indices ? ix : null;
  const aParts = a.parts.length;
  for (const p0 of b.parts) {
    const p = { ...p0, firstFace: p0.firstFace + aFaces };
    if (p.tag === 'SUBM') p.firstVertex = (p0.firstVertex || 0) + aCount;
    if (p.boneMap && boneRemap) p.boneMap = p.boneMap.map(x => (x ? boneRemap[x - 1] + 1 : 0));
    o.parts.push(p);
  }
  // bounds, grid
  if (a.bounds && b.bounds) o.bounds = Float32Array.from([0, 1, 2].map(k => Math.min(a.bounds[k], b.bounds[k])).concat([3, 4, 5].map(k => Math.max(a.bounds[k], b.bounds[k]))));
  else o.bounds = a.bounds || b.bounds || null;
  if (a.grid) {
    const extra = [];
    if (b.grid) for (const f of b.grid.faces) extra.push((f & 0x8000) | ((f & 0x7fff) + aParts));
    else b.parts.forEach((p, k) => { for (let i = 0; i < p.faceCount; i++) extra.push(aParts + k); });
    const faces = new Uint16Array(a.grid.faces.length + extra.length);
    faces.set(a.grid.faces); faces.set(extra, a.grid.faces.length);
    o.grid = { ...a.grid, faces };
  }
  return o;
}

function split(obj, partIndexes) {
  const want = [...new Set(partIndexes)].filter(i => obj.parts[i]);
  const o = clone(obj);
  o.chunks = dropStale(o.chunks);
  const v = obj.vertices, vc = v ? v.count : 0;
  const map = new Int32Array(vc).fill(-1), pick = [];
  const out = [], parts = [], gridFaces = [];
  let face = 0;
  for (let k = 0; k < want.length; k++) {
    const pi = want[k], p = { ...obj.parts[pi] }, tris = partTriangles(obj, pi);
    let lo = Infinity, hi = -1;
    for (const x of tris) {
      let m = x < vc ? map[x] : -1;
      if (m < 0 && x < vc) { m = map[x] = pick.length; pick.push(x); }
      if (m < 0) m = x;   // index past the vertex count: kept as is
      out.push(m); lo = Math.min(lo, m); hi = Math.max(hi, m);
    }
    const nf = Math.floor(tris.length / 3);
    if (obj.grid) for (let f = 0; f < nf; f++) { const g = obj.grid.faces[p.firstFace + f]; gridFaces.push(((g || 0) & 0x8000) | k); }
    p.firstFace = face; p.faceCount = nf; face += nf;
    if (p.tag === 'SUBM') { p.firstVertex = hi >= 0 ? lo : 0; p.vertexCount = hi >= 0 ? hi - lo + 1 : 0; }
    parts.push(p);
  }
  o.parts = parts;
  if (obj.indices) o.indices = obj.indices instanceof Uint32Array ? Uint32Array.from(out) : Uint16Array.from(out);
  if (v) o.vertices = gather(v, pick);
  if (obj.grid) o.grid = { ...obj.grid, faces: Uint16Array.from(gridFaces) };
  const nb = bounds(o);
  if (nb) o.bounds = nb;
  return o;
}

module.exports = {
  parse, write, partTriangles, partAttributes, bounds, setFlags, setMaterial, transform, concat, split,
  partLayout, textureNameCount, F, TYPE_NAMES, USAGE_NAMES, TYPE_SIZE, BUMP_SLOTS, bumpSlot,
};
