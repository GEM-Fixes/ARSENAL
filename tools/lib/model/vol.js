// model/vol: .vol collision polyhedron reader + writer step 2, contract tools/lib/model/README.md)
//
// Layout [V]:
//   'EVLM' (4 bytes, skipped unread by the engine: Load does stream->ReadPtr(4)), then chunks until end of file, each
//   tag(4) + i32 count + data. There is NO version field and NO chunk size: the data length follows from the count.
//     VERT  i32 n; n x f32[3]           bone space, model units (20 per metre)
//     INDX  i32 n; floor(n/3)*3 x u16   the engine reads n/3 triangles (n % 3 leftover is NOT read: the stream desyncs)
//                                        INDX must follow VERT (ReadBlock looks up vertices[index] while reading)
//     SIDE  i32 n; n x u8               one side number per triangle; several SIDE chunks append (push_back)
//     other tag -> ERROR_MSG "Invalid block .VOL file!" (Load); its size is unknown, so parse carries the rest
//     of the file raw from there and sets error.
//   Load then subtracts a centre (the mean of 16 random points inside the hull) from the vertices and adds it to the volume matrix (net position as
//   modelled), and gives triangle k the material materials[k] (:1203). Without SIDE materials is empty: an out
//   range read for every triangle (undefined; lim FMT-06). No bounds chunk exists; bounds are computed (ComputeBounds).
//
// Side numbers (file value s, 1..6) -> engine material s-1 = box face = index into
// {thickness} sides ( side):
//   1 front  +X   (FACE_POS_X / SIDE_FRONT  0)      4 right  -Y   (FACE_NEG_Y / SIDE_RIGHT  3)
//   2 top    +Z   (FACE_POS_Z / SIDE_TOP    1)      5 rear   -X   (FACE_NEG_X / SIDE_REAR   4)
//   3 left   +Y   (FACE_POS_Y / SIDE_LEFT   2)      6 bottom -Z   (FACE_NEG_Z / SIDE_BOTTOM 5)
//   Forward = +X, up = +Z, left = +Y in bone space ( gives the +X plane FACE_POS_X).
//   ReadBlock: s > 6 -> material 0 (front). s == 0 -> box face(-1): out of the table [I] (no clamp in the code).
//
// API (pure; no file IO):
//   parse(buf) -> { magic:'EVLM', version:null, vertices:Float32Array(3*nv), faces:Uint16Array(3*nt) (flat index triples),
//                   sides:Uint8Array(per triangle, file values 1..6) | null, chunks:[{ tag, offset, count, raw }], warnings:[str], error }
//     vertices/faces/sides = what the engine ends with (last VERT, last INDX, all SIDE chunks concatenated).
//     chunks in file order; raw = whole chunk bytes as read (tag..data). tag null = undecodable tail carried raw.
//   write(obj) -> Buffer. Untouched object: byte-identical. Changed: the last VERT/INDX chunk and the SIDE chunk are
//     rebuilt from obj.vertices/faces/sides with correct counts (several SIDE chunks kept raw while obj.sides still equals
//     their concatenation, else merged into the first); missing VERT/INDX/SIDE chunks appended in that order; sides null
//     drops SIDE chunks (a missing VERT/INDX is only added when the object has vertices/faces or no chunks at all; a
//     VERT added to a file that has INDX goes before the first INDX). Other chunks (earlier duplicates, raw tail) written back unchanged. INDX keeps a declared count
//     with a %3 leftover while the face count still matches it.
//   material(s) -> engine material 0..5 for a file side number (s>6 -> 0, s==0 -> -1)
//   triangles(obj) -> [{ p: number[9] (a,b,c xyz), side: file side number | null, material: 0..5 | null }]
//     triangles with an index past the vertex list are skipped
//   bounds(obj) -> { min:[x,y,z], max:[x,y,z] } | null (no vertices)
//   transform(obj, m) -> new obj with vertices moved by m. m = number[12] | Float32Array(12) as the engine's matrix 43
//     rows x,y,z,t: p' = p.x*m[0..2] + p.y*m[3..5] + p.z*m[6..8] + m[9..11] (TransformVolumePoint)
//   fromBox([sx,sy,sz]) -> obj: box of FULL sizes (as {Box x y z}) centred on 0, 12 triangles, sides by face
//   fromTriangles(positions number[9*T], sides number[T] | null) -> obj, vertices welded on exact equality;
//     sides null -> faceSideFromNormal(-normal) of each triangle (vanilla winding: cross(b-a,c-a) points inward)
//   faceSideFromNormal([nx,ny,nz]) -> 1..6. The engine has NO rule for a .vol without SIDE (out of range read, above).
//     Rule used = 's: the axis plane the normal points through, i.e. the largest
//     |component| with its sign; ties go X, then Y, then Z (the order tests them) [I].
//     Vanilla data [V sweep]: an unrotated hull vol (black_prince/body1.vol) matches it side for side; overall only 27%
//     of vanilla triangles do: sides are authored in the vehicle's frame (mantlet/shield vols sit in rotated bones) and
//     sloped plates keep their side. Give it a normal already transformed into the vehicle frame, and expect hand edits.
//   normal(p, i) -> cross(b-a, c-a) of triangle i (csgplane 3 ctor, ; not normalised). Points
//     INTO the volume for every vanilla file [V sweep 3422/3422]: the outward normal is its negation.
// Author: Imperator_Aug (ARSENAL, ia-0d0cab96)
'use strict';

const MAGIC = 'EVLM';
const SIDE_NAMES = [null, 'front', 'top', 'left', 'right', 'rear', 'bottom'];
const T = s => Buffer.from(s, 'latin1');
const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };

function f32view(bytes) { // exact bits (NaN payloads kept)
  const c = Buffer.from(bytes); // copy, aligned
  return new Float32Array(c.buffer, c.byteOffset, c.length >> 2);
}
function u16view(bytes) {
  const out = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = bytes.readUInt16LE(i * 2);
  return out;
}

function parse(buf) {
  const obj = { magic: null, version: null, vertices: new Float32Array(0), faces: new Uint16Array(0), sides: null, chunks: [], warnings: [], error: null };
  if (!Buffer.isBuffer(buf)) { obj.error = 'not a buffer'; return obj; }
  if (buf.length < 4) { obj.error = 'truncated: no magic'; return obj; }
  obj.magic = buf.toString('latin1', 0, 4);
  if (obj.magic !== MAGIC) { obj.error = 'bad magic'; return obj; }
  let pos = 4, haveVert = false, nv = 0;
  const sideParts = [];
  const tail = why => { obj.chunks.push({ tag: null, offset: pos, count: null, raw: Buffer.from(buf.subarray(pos)) }); obj.error = why; };
  while (pos < buf.length) {
    const at = pos;
    if (buf.length - pos < 8) { tail(`truncated chunk header at ${at}`); break; }
    const tag = buf.toString('latin1', pos, pos + 4), n = buf.readInt32LE(pos + 4);
    let len;
    if (tag === 'VERT') len = n * 12;
    else if (tag === 'INDX') len = Math.floor(n / 3) * 6;  // n<0: resize(neg) in the engine
    else if (tag === 'SIDE') len = n;
    else { tail(`invalid block ${JSON.stringify(tag)} at ${at}: "Invalid block in .VOL file!"`); break; }
    if (n < 0) { tail(`${tag} at ${at}: negative count ${n}`); break; }
    if (at + 8 + len > buf.length) { tail(`truncated: ${tag} at ${at} needs ${len} data bytes, ${buf.length - at - 8} left`); break; }
    const data = buf.subarray(at + 8, at + 8 + len);
    const ch = { tag, offset: at, count: n, raw: Buffer.from(buf.subarray(at, at + 8 + len)) };
    if (tag === 'VERT') { obj.vertices = f32view(data); nv = n; haveVert = true; }
    else if (tag === 'INDX') {
      if (!haveVert) obj.warnings.push(`INDX at ${at} before VERT (engine reads an empty vertex list)`);
      if (n % 3) obj.warnings.push(`INDX at ${at}: count ${n} not a multiple of 3, engine reads ${len / 2} indices and desyncs`);
      obj.faces = u16view(data);
      for (const i of obj.faces) if (i >= nv) { obj.warnings.push(`INDX at ${at}: index ${i} >= vertex count ${nv}`); break; }
    } else sideParts.push(Buffer.from(data));
    obj.chunks.push(ch);
    pos = at + 8 + len;
  }
  if (sideParts.length) obj.sides = new Uint8Array(Buffer.concat(sideParts));
  if (!obj.error) {
    const nt = obj.faces.length / 3;
    if (!obj.sides) obj.warnings.push('no SIDE chunk: engine reads materials out of range (FMT-06)');
    else if (obj.sides.length < nt) obj.warnings.push(`SIDE has ${obj.sides.length} entries for ${nt} triangles`);
  }
  return obj;
}

const vertChunk = v => { const f = v instanceof Float32Array ? v : Float32Array.from(v || []);
  return Buffer.concat([T('VERT'), i32(f.length / 3 | 0), Buffer.from(f.buffer, f.byteOffset, (f.length / 3 | 0) * 12)]); };
function indxChunk(faces, declared) {
  const n = Math.floor((faces ? faces.length : 0) / 3) * 3, b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeUInt16LE(faces[i] & 0xffff, i * 2);
  const cnt = declared != null && Math.floor(declared / 3) * 3 === n ? declared : n;
  return Buffer.concat([T('INDX'), i32(cnt), b]);
}
const sideChunk = s => Buffer.concat([T('SIDE'), i32(s.length), Buffer.from(Uint8Array.from(s))]);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function write(obj) {
  const out = [T(obj.magic || MAGIC)];
  const chunks = obj.chunks || [];
  let lastV = -1, lastI = -1;
  chunks.forEach((c, i) => { if (c.tag === 'VERT') lastV = i; if (c.tag === 'INDX') lastI = i; });
  const sideIdx = chunks.map((c, i) => c.tag === 'SIDE' ? i : -1).filter(i => i >= 0);
  let sideRaw = false;
  if (obj.sides && sideIdx.length > 1) {
    const cat = Buffer.concat(sideIdx.map(i => chunks[i].raw.subarray(8)));
    sideRaw = same(cat, obj.sides);
  }
  const fresh = chunks.length === 0;
  const needV = lastV < 0 && (fresh || (obj.vertices && obj.vertices.length > 0));
  let tailRaw = null, didV = !needV, didI = lastI < 0 && !(fresh || (obj.faces && obj.faces.length > 0)), didS = false;
  chunks.forEach((c, i) => {
    if (c.tag === null) { tailRaw = c.raw; return; }
    if (c.tag === 'INDX' && !didV) { out.push(vertChunk(obj.vertices)); didV = true; } // VERT must precede INDX
    if (c.tag === 'VERT') { out.push(i === lastV ? vertChunk(obj.vertices) : c.raw); didV = didV || i === lastV; }
    else if (c.tag === 'INDX') { out.push(i === lastI ? indxChunk(obj.faces, c.count) : c.raw); didI = didI || i === lastI; }
    else if (c.tag === 'SIDE') {
      if (!obj.sides) return;
      if (sideRaw) { out.push(c.raw); didS = true; }
      else if (!didS) { out.push(sideChunk(obj.sides)); didS = true; }
    } else out.push(c.raw);
  });
  if (!didV) out.push(vertChunk(obj.vertices));
  if (!didI) out.push(indxChunk(obj.faces));
  if (!didS && obj.sides) out.push(sideChunk(obj.sides));
  if (tailRaw) out.push(tailRaw);
  return Buffer.concat(out);
}

const material = s => s == null ? null : s > 6 ? 0 : s - 1;

function triangles(obj) {
  const v = obj.vertices, f = obj.faces, nv = v.length / 3 | 0, out = [];
  for (let k = 0; k + 2 < f.length; k += 3) {
    const a = f[k], b = f[k + 1], c = f[k + 2];
    if (a >= nv || b >= nv || c >= nv) continue;
    const p = [v[a * 3], v[a * 3 + 1], v[a * 3 + 2], v[b * 3], v[b * 3 + 1], v[b * 3 + 2], v[c * 3], v[c * 3 + 1], v[c * 3 + 2]];
    const t = k / 3, side = obj.sides && t < obj.sides.length ? obj.sides[t] : null;
    out.push({ p, side, material: material(side) });
  }
  return out;
}

function bounds(obj) {
  const v = obj.vertices;
  if (!v || v.length < 3) return null;
  const min = [v[0], v[1], v[2]], max = [v[0], v[1], v[2]];
  for (let i = 3; i + 2 < v.length; i += 3) for (let j = 0; j < 3; j++) {
    if (v[i + j] < min[j]) min[j] = v[i + j];
    if (v[i + j] > max[j]) max[j] = v[i + j];
  }
  return { min, max };
}

function transform(obj, m) {
  const v = obj.vertices, o = new Float32Array(v.length);
  for (let i = 0; i + 2 < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = v[i + 2];
    for (let j = 0; j < 3; j++) o[i + j] = x * m[j] + y * m[3 + j] + z * m[6 + j] + m[9 + j];
  }
  return { ...obj, vertices: o, chunks: (obj.chunks || []).slice(), warnings: [] };
}

function faceSideFromNormal(n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ax >= ay && ax >= az) return n[0] >= 0 ? 1 : 5;
  if (ay >= az) return n[1] >= 0 ? 3 : 4;
  return n[2] >= 0 ? 2 : 6;
}

function normal(p, i = 0) {
  const o = i * 9, ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
  const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

function fromTriangles(positions, sides) {
  const nt = Math.floor(positions.length / 9), map = new Map(), verts = [], faces = new Uint16Array(nt * 3);
  const f = Float32Array.from(positions);
  for (let i = 0; i < nt * 3; i++) {
    const key = f[i * 3] + ',' + f[i * 3 + 1] + ',' + f[i * 3 + 2];
    let k = map.get(key);
    if (k === undefined) { k = verts.length / 3; if (k > 0xffff) throw new Error('more than 65536 vertices'); map.set(key, k); verts.push(f[i * 3], f[i * 3 + 1], f[i * 3 + 2]); }
    faces[i] = k;
  }
  const s = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) s[t] = sides ? sides[t] : faceSideFromNormal(normal(f, t).map(x => -x)); // outward = -cross
  const obj = { magic: MAGIC, version: null, vertices: Float32Array.from(verts), faces, sides: s, chunks: [], warnings: [], error: null };
  return obj;
}

// winding as vanilla: cross(b-a, c-a) points INTO the volume in all 3422 vanilla files (sweep-vol.js), matching
// 's crossing.normal = -plane normal and Load's positive volume sum. Quads below are listed
// counter-clockwise seen from outside, then emitted reversed.
function fromBox(size) {
  const [hx, hy, hz] = size.map(s => s / 2);
  const c = (x, y, z) => [x * hx, y * hy, z * hz];
  const quads = [ // [side, 4 corners counter-clockwise seen from outside]
    [1, c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), c(1, -1, 1)],
    [5, c(-1, 1, -1), c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1)],
    [3, c(1, 1, -1), c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1)],
    [4, c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1)],
    [2, c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)],
    [6, c(-1, 1, -1), c(1, 1, -1), c(1, -1, -1), c(-1, -1, -1)],
  ];
  const pos = [], sides = [];
  for (const [s, a, b, cc, d] of quads) { pos.push(...a, ...cc, ...b, ...a, ...d, ...cc); sides.push(s, s); }
  return fromTriangles(pos, sides);
}

module.exports = { parse, write, material, triangles, bounds, transform, fromBox, fromTriangles, faceSideFromNormal, normal, SIDE_NAMES, MAGIC };
