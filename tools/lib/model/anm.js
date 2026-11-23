// model/anm: full .anm (EANM) reader + writer, byte-identical round trip. Contract: tools/lib/model/README.md.
// Engine: , playback
//, quaternion math (ToBasis, FromBasis), (Slerp).
// Web: Header-only reader for other tools: tools/lib/anm.js (unchanged).
//
// Layout (little endian):
//   'EANM' i32 version | 'FRMS' i32 frameCount | 'BMAP' i32 boneCount, boneCount x { i32 len, latin1 bytes }
//   then frame chunks to EOF, any mix of the two kinds whatever the version (the loader does not look at it):
//   'FRM2' u16 frame, u8 count, count x { u8 bone, u16 flags, [f32x3 pos if 0x01], [f32x3 quat xyz if 0x02,
//          w = +sqrt(|1-x2-y2-z2|)], [i32 size + mesh bytes if 0x20] }; 0x04 mirrored, 0x08 show, 0x10 hide
//   'FRMN' i32 frame, then repeated 'BONE' i32 bone followed by any of 'MATR' 12 x f32 | 'VISI' i32 (0 = hide)
//          | 'MESH' i32 size + bytes, in any order (kept: rec.items)
//   Anything else -> engine "unknown chunk in animation". Here: error set, rest of the file kept as a raw chunk.
//   Mesh payloads (mesh switch data) are carried raw (Buffer).
//
// Matrix: 12 floats, Float32Array(12), engine matrix 43 order = X row (0-2), Y row (3-5), Z row (6-8), translation
//   (9-11); row-vector convention, point' = p.x*X + p.y*Y + p.z*Z + T (in the parent bone's space, 20 units = 1 m).
//   A mirrored bone has Z = -(X x Y). FRM2 records are shown as the matrix the engine builds: ToBasis(quat), T = pos,
//   Z negated when flag 0x04 is set.
//
// Engine rules used by the helpers [V]:
//   - a frame chunk is a key frame; a bone the chunk does not key holds its previous value (pose);
//     FRM2 records with only pos (or only rot) keep the other part from the bone's previous key
//   - frame numbers between key frames are interpolated: Slerp (engine variant, half angle) + linear position;
//     before the first key frame and after the last the nearest key frame holds
//   - a bone gets a transform only if the FIRST frame chunk keys it; a bone first keyed later reads out of range
//     in the loader [I: bones[bone].transform is -1] -> listed in obj.problems; the helpers key every animated
//     bone in the first chunk
//   - mirroring for playback comes from the bone's record in the first frame [V]; the view uses each record's own
//
// parse(buf) -> obj, never throws:
//   { version, frames, bones: [name], chunks: [chunk], frame: [frameNo][bone] -> rec | { bone, matrix:null, visible:null, mesh:null },
//     problems: [string] (what the engine rejects or warns about), error: string|null }
//   chunk: { tag: 'EANM'|'FRMS'|'BMAP'|'FRM2'|'FRMN'|null(raw tail), offset, size, index?(frame no), recs?: [rec], raw?: Buffer }
//   rec FRM2: { bone, flags, pos: Float32Array(3)|null, rot: Float32Array(3)|null, mesh: Buffer|null, matrix, visible }
//   rec FRMN: { bone, items: [{ tag:'MATR', m } | { tag:'VISI', v } | { tag:'MESH', data }], matrix, visible, mesh }
//   rec.matrix: Float32Array(12) the record keys (null if it keys no transform), rec.visible: true|false|null (no event)
//   frame[f][b] is the last record for bone b in the chunk with frame number f (view; edits on recs are written).
// write(obj) -> Buffer. Same version, chunk kinds, chunk order, record order. A rec.matrix / rec.visible / rec.mesh
//   changed in place is written (FRM2: matrix -> pos + quat + mirror flag). Throws on values the format cannot hold.
// Helpers (pure: return a new obj, input untouched; bone = index or name; frame numbers 0..frames-1; throw RangeError on bad args):
//   setMatrix(obj, frame, bone, m)  key bone at frame; adds a key-frame chunk (keying every animated bone with its
//                                   current value, so other bones do not change) when frame had none
//   insertFrame(obj, at, copyFrom)  new frame at `at` (frames+1) posed like old frame copyFrom; later frames shift
//   deleteFrames(obj, from, to)     drop frames from..to inclusive; the poses of the frames kept are preserved
//   reverse(obj)                    play backwards; events (visibility, mesh) move with their frames
//   boneTrack(obj, bone) -> [frames] of Float32Array(12) | null (bone not keyed yet)  dense, engine interpolation
//   matrixAt(obj, bone, frame) -> Float32Array(12) | null
//   toMatrix(q, p, mirrored), fromMatrix(m) -> { q:[x,y,z,w], p, mirrored } (engine ToBasis / FromBasis)
// Author: Imperator_Aug (ARSENAL, ia-06481423)
'use strict';

const F_POS = 0x01, F_ROT = 0x02, F_MIR = 0x04, F_SHOW = 0x08, F_HIDE = 0x10, F_MESH = 0x20;
const fr = Math.fround;

// ---- math (engine float order) ----
function toMatrix(q, p, mirrored) {
  const [x, y, z, w] = q.map(fr), m = new Float32Array(12);
  m[0] = fr(fr(fr(w * w) * 2) + fr(fr(x * x) * 2)) - 1;
  m[1] = fr(fr(fr(y * x) * 2) + fr(fr(z * w) * 2));
  m[2] = fr(fr(fr(z * x) - fr(w * y)) * 2);
  m[3] = fr(fr(fr(y * x) - fr(z * w)) * 2);
  m[4] = fr(fr(fr(w * w) * 2) + fr(fr(y * y) * 2)) - 1;
  m[5] = fr(fr(fr(z * y) * 2) + fr(fr(w * x) * 2));
  m[6] = fr(fr(fr(z * x) * 2) + fr(fr(w * y) * 2));
  m[7] = fr(fr(fr(z * y) - fr(w * x)) * 2);
  m[8] = fr(fr(fr(w * w) * 2) + fr(fr(z * z) * 2)) - 1;
  if (mirrored) { m[6] = -m[6]; m[7] = -m[7]; m[8] = -m[8]; }
  m[9] = p[0]; m[10] = p[1]; m[11] = p[2];
  return m;
}

function fromBasis(b) { // b = 9 floats X Y Z rows -> [x,y,z,w]
  const xx = b[0], xy = b[1], xz = b[2], yx = b[3], yy = b[4], yz = b[5], zx = b[6], zy = b[7], zz = b[8];
  const tr = xx + yy + zz;
  if (tr >= 0) { const r = Math.sqrt(tr + 1), s = 0.5 / r; return [(zy - yz) * s, (xz - zx) * s, (yx - xy) * s, r * -0.5]; }
  let l = 0; if (yy > xx) l = 1; if (zz > [xx, yy][l]) l = 2;
  if (l === 0) { const r = Math.sqrt(xx - (zz + yy) + 1), s = 0.5 / r; return [r * 0.5, (yx + xy) * s, (zx + xz) * s, -((zy - yz) * s)]; }
  if (l === 1) { const r = Math.sqrt(yy - (zz + xx) + 1), s = 0.5 / r; return [(yx + xy) * s, r * 0.5, (zy + yz) * s, -((xz - zx) * s)]; }
  const r = Math.sqrt(zz - (xx + yy) + 1), s = 0.5 / r; return [(zx + xz) * s, (zy + yz) * s, r * 0.5, -((yx - xy) * s)];
}
const norm4 = q => { const k = 1 / Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]); return q.map(v => v * k); };

// FRMN MATR as the loader reads it: mirror test (Z = -(X x Y) within 0.001), quaternion, position
function fromMatrix(m) {
  const b = Array.from(m.subarray ? m.subarray(0, 9) : m.slice(0, 9));
  const c = [b[1] * b[5] - b[2] * b[4], b[2] * b[3] - b[0] * b[5], b[0] * b[4] - b[1] * b[3]];
  const eq = (s) => Math.abs(c[0] - s * b[6]) <= 0.001 && Math.abs(c[1] - s * b[7]) <= 0.001 && Math.abs(c[2] - s * b[8]) <= 0.001;
  let mirrored = false, orthogonal = true;
  if (!eq(1)) { if (eq(-1)) { mirrored = true; b[6] = -b[6]; b[7] = -b[7]; b[8] = -b[8]; } else orthogonal = false; }
  return { q: norm4(fromBasis(b)), p: [m[9], m[10], m[11]], mirrored, orthogonal };
}

function slerp(a, b, t) { // engine variant (half of acos)
  let s = a.slice(), dot = b[3] * s[3] + b[0] * s[0] + b[1] * s[1] + b[2] * s[2];
  if (dot < 0) { s = s.map(v => -v); dot = -dot; }
  let sw, ew;
  if (dot > 0.95) { sw = 1 - t; ew = t; } else {
    const half = Math.acos(Math.min(1, dot)) * 0.5, inv = 1 / Math.sin(half);
    sw = Math.sin((1 - t) * half) * inv; ew = Math.sin(half * t) * inv;
  }
  return norm4([0, 1, 2, 3].map(i => b[i] * ew + s[i] * sw));
}

const f32 = (buf, p, n) => { const a = new Float32Array(n); new Uint8Array(a.buffer).set(buf.subarray(p, p + n * 4)); return a; };
const bytesOf = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const sameF = (a, b) => a === b || (!!a && !!b && a.length === b.length && bytesOf(a).equals(bytesOf(b instanceof Float32Array ? b : Float32Array.from(b))));

// ---- parse ----
function parse(buf) {
  const out = { version: 0, frames: 0, bones: [], chunks: [], frame: [], problems: [], error: null };
  const len = buf.length;
  let p = 0;
  const need = n => { if (p + n > len) throw new RangeError(`truncated: need ${n} bytes at ${p}, file is ${len}`); };
  const tag = () => { need(4); const t = buf.toString('latin1', p, p + 4); p += 4; return t; };
  const peek = () => (p + 4 <= len ? buf.toString('latin1', p, p + 4) : null);
  const i32 = () => { need(4); const v = buf.readInt32LE(p); p += 4; return v; };
  const raw = (from, msg) => { out.error = msg; out.chunks.push({ tag: null, offset: from, size: len - from, raw: buf.subarray(from) }); };
  // header
  try {
    if (tag() !== 'EANM') throw new RangeError('no EANM magic');
    out.version = i32();
    if (tag() !== 'FRMS') throw new RangeError('FRMS missing');
    out.frames = i32();
    if (tag() !== 'BMAP') throw new RangeError('BMAP missing');
    const n = i32();
    if (n < 0 || n > 65535) throw new RangeError('bone count ' + n);
    const bones = [];
    for (let i = 0; i < n; i++) { const l = i32(); if (l < 0) throw new RangeError('bone name length ' + l); need(l); bones.push(buf.toString('latin1', p, p + l)); p += l; }
    out.bones = bones;
  } catch (e) {
    out.version = 0; out.frames = 0; out.bones = [];
    raw(0, e.message); return out;
  }
  out.chunks.push({ tag: 'EANM', offset: 0, size: 8 }, { tag: 'FRMS', offset: 8, size: 8 }, { tag: 'BMAP', offset: 16, size: p - 16 });
  // frame chunks
  while (p < len) {
    const start = p;
    try {
      const t = tag();
      let ch;
      if (t === 'FRM2') {
        need(3); const index = buf.readUInt16LE(p), count = buf[p + 2]; p += 3;
        const recs = [];
        for (let k = 0; k < count; k++) {
          need(3); const bone = buf[p], flags = buf.readUInt16LE(p + 1); p += 3;
          const r = { bone, flags, pos: null, rot: null, mesh: null, matrix: null, visible: null };
          if (flags & F_POS) { need(12); r.pos = f32(buf, p, 3); p += 12; }
          if (flags & F_ROT) { need(12); r.rot = f32(buf, p, 3); p += 12; }
          if (flags & F_MESH) { const s = i32(); if (s < 0) throw new RangeError('mesh size ' + s); need(s); r.mesh = buf.subarray(p, p + s); p += s; }
          recs.push(r);
        }
        ch = { tag: t, offset: start, size: 0, index, recs };
      } else if (t === 'FRMN') {
        const index = i32(), recs = [];
        while (peek() === 'BONE') {
          p += 4;
          const r = { bone: i32(), items: [], matrix: null, visible: null, mesh: null };
          for (let s = peek(); s === 'MATR' || s === 'VISI' || s === 'MESH'; s = peek()) {
            p += 4;
            if (s === 'MATR') { need(48); r.items.push({ tag: s, m: f32(buf, p, 12) }); p += 48; }
            else if (s === 'VISI') r.items.push({ tag: s, v: i32() });
            else { const n = i32(); if (n < 0) throw new RangeError('mesh size ' + n); need(n); r.items.push({ tag: s, data: buf.subarray(p, p + n) }); p += n; }
          }
          recs.push(r);
        }
        ch = { tag: t, offset: start, size: 0, index, recs };
      } else throw new RangeError('unknown chunk ' + JSON.stringify(t) + ' at ' + start);
      ch.size = p - start;
      out.chunks.push(ch);
    } catch (e) { raw(start, e.message); break; }
  }
  derive(out, 'view');
  check(out);
  return out;
}

// engine-side problems (the loader errors or warns); does not affect write
function check(o) {
  const P = o.problems;
  if (o.version < 0x30000) P.push('Unsupported animation version (< 0x30000)');
  if (o.frames < 1) P.push('At least one frame required (FRMS < 1)');
  if (o.bones.length > 255) P.push('Animated bones count is limited to 255!');
  const fc = o.chunks.filter(isFrame);
  if (!o.error && !fc.length) P.push('Empty animation frames (no frame chunk)');
  let last = -1, warned = false;
  const first = new Set(fc.length ? fc[0].recs.filter(r => r.matrix).map(r => r.bone) : []);
  const late = new Set();
  for (const c of fc) {
    if (c.index < 0 || c.index >= o.frames) P.push(`Invalid frame # ${c.index} (FRMS ${o.frames})`);
    if (c.index < last) P.push(`frame ${c.index} after ${last}: key frames out of order`);
    last = Math.max(last, c.index);
    for (const r of c.recs) {
      if (r.bone < 0 || r.bone >= o.bones.length) P.push(`Invalid bone index ${r.bone} in frame ${c.index}`);
      else if (r.matrix && !first.has(r.bone)) late.add(r.bone);
      if (!warned && c.tag === 'FRMN') for (const it of r.items) if (it.tag === 'MATR' && !fromMatrix(it.m).orthogonal) { warned = true; P.push('non-orthogonal matrix in animation'); }
    }
  }
  for (const b of late) P.push(`bone ${o.bones[b]} keyed only after the first frame chunk (loader gives it no transform) [I]`);
}

const isFrame = c => c.tag === 'FRM2' || c.tag === 'FRMN';
const boneOk = (o, b) => b >= 0 && b < o.bones.length;

// Walk frame chunks in order with the held pose. mode 'view': set rec.matrix/visible/mesh from native fields and
// build obj.frame. mode 'write': a rec.matrix that differs from the native data is written into the native data.
// Returns per frame chunk the pose of every bone after it: [{ chunk, pose: [ {q,p,mirrored,m} | null ] }].
function derive(o, mode) {
  const pose = new Array(o.bones.length).fill(null), keys = [];
  for (const c of o.chunks) {
    if (!isFrame(c)) continue;
    stepChunk(o, c, pose, mode);
    keys.push({ chunk: c, pose: pose.slice() });
  }
  if (mode === 'view') buildView(o);
  return keys;
}

// apply one frame chunk's records to the held pose (mode as in derive; 'read' only updates pose)
function stepChunk(o, c, pose, mode) {
  {
    for (const r of c.recs) {
      if (c.tag === 'FRM2') {
        if (mode === 'write') writeback2(r, boneOk(o, r.bone) ? pose[r.bone] : null);
        let m = null;
        if (r.flags & (F_POS | F_ROT)) {
          const prev = (boneOk(o, r.bone) && pose[r.bone]) || { q: [0, 0, 0, 1], p: [0, 0, 0] };
          let q = prev.q, pp = prev.p;
          if (r.flags & F_ROT) { const [x, y, z] = r.rot; q = [x, y, z, fr(Math.sqrt(Math.abs(fr(fr(fr(1 - fr(x * x)) - fr(y * y)) - fr(z * z)))))]; }
          if (r.flags & F_POS) pp = Array.from(r.pos);
          m = toMatrix(q, pp, !!(r.flags & F_MIR));
          if (boneOk(o, r.bone)) pose[r.bone] = { q, p: pp, mirrored: !!(r.flags & F_MIR), m };
        }
        if (mode === 'view') {
          r.matrix = m;
          r.visible = r.flags & (F_SHOW | F_HIDE) ? !!(r.flags & F_SHOW) : null;
          if (!(r.flags & F_MESH)) r.mesh = null;
        }
      } else {
        if (mode === 'write') writebackN(r);
        let mi = null, vi = null, me = null;
        for (const it of r.items) { if (it.tag === 'MATR') mi = it; else if (it.tag === 'VISI') vi = it; else me = it; }
        if (mi && boneOk(o, r.bone)) { const e = fromMatrix(mi.m); pose[r.bone] = { q: e.q, p: e.p, mirrored: e.mirrored, m: mi.m }; }
        if (mode === 'view') { r.matrix = mi ? mi.m : null; r.visible = vi ? vi.v !== 0 : null; r.mesh = me ? me.data : null; }
      }
    }
  }
}

function buildView(o) {
  const nb = o.bones.length, n = o.frames > 0 && o.frames <= 1e6 ? o.frames : 0;
  const view = new Array(n);
  const empty = b => ({ bone: b, matrix: null, visible: null, mesh: null });
  for (const c of o.chunks) {
    if (!isFrame(c) || c.index < 0 || c.index >= n) continue;
    const row = view[c.index] = Array.from({ length: nb }, (_, b) => empty(b));
    for (const r of c.recs) if (boneOk(o, r.bone)) row[r.bone] = r;
  }
  for (let f = 0; f < n; f++) if (!view[f]) view[f] = Array.from({ length: nb }, (_, b) => empty(b));
  o.frame = view;
}

// FRM2 record: fold view edits (matrix, visible, mesh) into flags/pos/rot
function writeback2(r, prev) {
  if (r.matrix !== undefined) {
    let cur = null;
    if (r.flags & (F_POS | F_ROT)) {
      const pv = prev || { q: [0, 0, 0, 1], p: [0, 0, 0] };
      let q = pv.q, pp = pv.p;
      if (r.flags & F_ROT) { const [x, y, z] = r.rot; q = [x, y, z, fr(Math.sqrt(Math.abs(fr(fr(fr(1 - fr(x * x)) - fr(y * y)) - fr(z * z)))))]; }
      if (r.flags & F_POS) pp = Array.from(r.pos);
      cur = toMatrix(q, pp, !!(r.flags & F_MIR));
    }
    if (!r.matrix) { if (cur) { r.flags &= ~(F_POS | F_ROT | F_MIR); r.pos = r.rot = null; } }
    else if (!cur || !sameF(cur, r.matrix)) applyMatrix2(r, r.matrix);
  }
  const vis = r.flags & (F_SHOW | F_HIDE) ? !!(r.flags & F_SHOW) : null;
  if (r.visible !== undefined && r.visible !== vis) r.flags = (r.flags & ~(F_SHOW | F_HIDE)) | (r.visible === null ? 0 : r.visible ? F_SHOW : F_HIDE);
  if (r.mesh) r.flags |= F_MESH; else r.flags &= ~F_MESH;
}

function applyMatrix2(r, m) {
  const e = fromMatrix(m);
  let q = e.q; if (q[3] < 0) q = q.map(v => -v);
  r.rot = Float32Array.from(q.slice(0, 3)); r.pos = Float32Array.from(e.p);
  r.flags = (r.flags | F_POS | F_ROT) & ~F_MIR | (e.mirrored ? F_MIR : 0);
}

// FRMN record: the last MATR / VISI / MESH item carries the view value
function writebackN(r) {
  const last = t => { for (let i = r.items.length - 1; i >= 0; i--) if (r.items[i].tag === t) return r.items[i]; return null; };
  const mi = last('MATR'), vi = last('VISI'), me = last('MESH');
  if (r.matrix !== undefined) {
    if (!r.matrix) r.items = r.items.filter(it => it.tag !== 'MATR');
    else if (mi) { if (mi.m !== r.matrix) mi.m = Float32Array.from(r.matrix); } else r.items.unshift({ tag: 'MATR', m: Float32Array.from(r.matrix) });
  }
  if (r.visible !== undefined) {
    if (r.visible === null) r.items = r.items.filter(it => it.tag !== 'VISI');
    else if (vi) { if ((vi.v !== 0) !== r.visible) vi.v = r.visible ? 1 : 0; } else r.items.push({ tag: 'VISI', v: r.visible ? 1 : 0 });
  }
  if (r.mesh !== undefined) {
    if (!r.mesh) r.items = r.items.filter(it => it.tag !== 'MESH');
    else if (me) me.data = r.mesh; else r.items.push({ tag: 'MESH', data: r.mesh });
  }
}

// ---- clone ----
function cloneRec(r) {
  const c = { ...r };
  if (r.pos) c.pos = Float32Array.from(r.pos);
  if (r.rot) c.rot = Float32Array.from(r.rot);
  if (r.items) {
    c.items = r.items.map(it => (it.m ? { tag: it.tag, m: Float32Array.from(it.m) } : { ...it }));
    // keep matrix identity with its MATR item
    if (r.matrix) { const i = r.items.findIndex(it => it.m === r.matrix); c.matrix = i >= 0 ? c.items[i].m : Float32Array.from(r.matrix); }
  } else if (r.matrix) c.matrix = Float32Array.from(r.matrix);
  return c;
}
function clone(o) {
  const c = { ...o, bones: o.bones.slice(), problems: o.problems ? o.problems.slice() : [] };
  c.chunks = o.chunks.map(ch => (ch.recs ? { ...ch, recs: ch.recs.map(cloneRec) } : { ...ch }));
  return c;
}

// ---- write ----
function write(obj) {
  const o = clone(obj);
  derive(o, 'write');
  const parts = [];
  const T = s => Buffer.from(s, 'latin1');
  const I = v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
  for (const c of o.chunks) {
    if (c.raw) { parts.push(c.raw); continue; }
    if (c.tag === 'EANM') parts.push(T('EANM'), I(o.version));
    else if (c.tag === 'FRMS') parts.push(T('FRMS'), I(o.frames));
    else if (c.tag === 'BMAP') {
      parts.push(T('BMAP'), I(o.bones.length));
      for (const n of o.bones) { const b = T(n); parts.push(I(b.length), b); }
    } else if (c.tag === 'FRM2') {
      if (c.index < 0 || c.index > 0xFFFF) throw new RangeError('FRM2 frame number ' + c.index + ' does not fit u16');
      if (c.recs.length > 255) throw new RangeError('FRM2 frame ' + c.index + ' has more than 255 records');
      const h = Buffer.alloc(7); h.write('FRM2', 0, 'latin1'); h.writeUInt16LE(c.index, 4); h[6] = c.recs.length; parts.push(h);
      for (const r of c.recs) {
        if (r.bone < 0 || r.bone > 255) throw new RangeError('FRM2 bone index ' + r.bone);
        const rh = Buffer.alloc(3); rh[0] = r.bone; rh.writeUInt16LE(r.flags & 0xFFFF, 1); parts.push(rh);
        if (r.flags & F_POS) parts.push(bytesOf(r.pos));
        if (r.flags & F_ROT) parts.push(bytesOf(r.rot));
        if (r.flags & F_MESH) parts.push(I(r.mesh.length), r.mesh);
      }
    } else if (c.tag === 'FRMN') {
      parts.push(T('FRMN'), I(c.index));
      for (const r of c.recs) {
        parts.push(T('BONE'), I(r.bone));
        for (const it of r.items) {
          parts.push(T(it.tag));
          if (it.tag === 'MATR') parts.push(bytesOf(it.m instanceof Float32Array ? it.m : Float32Array.from(it.m)));
          else if (it.tag === 'VISI') parts.push(I(it.v));
          else parts.push(I(it.data.length), it.data);
        }
      }
    } else throw new RangeError('chunk ' + c.tag + ' without raw bytes');
  }
  return Buffer.concat(parts);
}

// ---- dense tracks ----
const boneIx = (o, bone) => {
  const b = typeof bone === 'number' ? bone : o.bones.indexOf(bone);
  if (!boneOk(o, b)) throw new RangeError('no bone ' + bone);
  return b;
};
const keyFrames = o => derive(o, 'read').filter(k => k.chunk.index >= 0 && k.chunk.index < o.frames);

function poseAt(keys, b, f) {
  if (!keys.length) return null;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].chunk.index <= f) i++;
  const a = keys[i].pose[b];
  if (!a) return null;
  const nx = i + 1 < keys.length ? keys[i + 1] : null;
  if (f <= keys[i].chunk.index || !nx || nx.chunk.index === keys[i].chunk.index) return Float32Array.from(a.m);
  const bb = nx.pose[b] || a;
  const t = (f - keys[i].chunk.index) / (nx.chunk.index - keys[i].chunk.index);
  const p = [0, 1, 2].map(k => (bb.p[k] - a.p[k]) * t + a.p[k]);
  return toMatrix(slerp(a.q, bb.q, t), p, a.mirrored);
}

function boneTrack(obj, bone) {
  const b = boneIx(obj, bone), keys = keyFrames(obj), out = [];
  for (let f = 0; f < obj.frames; f++) out.push(poseAt(keys, b, f));
  return out;
}
function matrixAt(obj, bone, frame) { return poseAt(keyFrames(obj), boneIx(obj, bone), frame); }

// every bone's value at every frame number (null = not animated)
const allTracks = o => { const keys = keyFrames(o); return o.bones.map((_, b) => { const a = []; for (let f = 0; f < o.frames; f++) a.push(poseAt(keys, b, f)); return a; }); };

// ---- edits ----
const kindNear = (o, at) => {
  const fc = o.chunks.filter(isFrame);
  let best = null; for (const c of fc) if (!best || Math.abs(c.index - at) < Math.abs(best.index - at)) best = c;
  return best ? best.tag : o.version >= 0x60000 ? 'FRM2' : 'FRMN';
};
const newRec = (kind, bone) => (kind === 'FRM2' ? { bone, flags: 0, pos: null, rot: null, mesh: null, matrix: null, visible: null } : { bone, items: [], matrix: null, visible: null, mesh: null });

function keyRec(c, bone, m) {
  let r = null; for (const x of c.recs) if (x.bone === bone) r = x;
  if (!r) { r = newRec(c.tag, bone); c.recs.push(r); }
  if (c.tag === 'FRM2') { applyMatrix2(r, m); r.matrix = undefined; }
  else { const mi = r.items.filter(it => it.tag === 'MATR').pop(); if (mi) mi.m = Float32Array.from(m); else r.items.unshift({ tag: 'MATR', m: Float32Array.from(m) }); r.matrix = undefined; }
  return r;
}

// insert a frame chunk keeping chunk order sorted by index
function addChunk(o, kind, index) {
  const c = { tag: kind, offset: null, size: null, index, recs: [] };
  let at = o.chunks.length;
  for (let i = 0; i < o.chunks.length; i++) if (isFrame(o.chunks[i]) && o.chunks[i].index > index) { at = i; break; }
  if (at === o.chunks.length) { while (at > 0 && o.chunks[at - 1].raw) at--; }
  o.chunks.splice(at, 0, c);
  return c;
}

// re-derive the native data, then key every bone whose held value differs from target.get(chunk)[bone]
// (and every animated bone in the first frame chunk)
function settle(o, target) {
  normalizeRecs(o);
  const animated = new Set();
  for (const [, t] of target) t.forEach((m, b) => { if (m) animated.add(b); });
  let pose = new Array(o.bones.length).fill(null), first = true;
  for (const c of o.chunks) {
    if (!isFrame(c)) continue;
    const pre = pose.slice();
    stepChunk(o, c, pose, 'read');
    const t = target.get(c);
    let changed = false;
    if (t) for (const b of animated) {
      if (!t[b]) continue;
      const keyed = c.recs.some(r => r.bone === b && (c.tag === 'FRM2' ? r.flags & (F_POS | F_ROT) : r.items.some(it => it.tag === 'MATR')));
      if ((first && !keyed) || !pose[b] || !sameF(pose[b].m, t[b])) { keyRec(c, b, t[b]); changed = true; }
    }
    if (changed) { pose = pre; stepChunk(o, c, pose, 'read'); }
    first = false;
  }
  normalizeRecs(o);
  o.problems = []; check(o);
}
const normalizeRecs = o => { for (const c of o.chunks) if (c.recs) for (const r of c.recs) for (const k of ['matrix', 'visible', 'mesh']) if (r[k] === undefined) delete r[k]; derive(o, 'view'); };

// target poses for each existing frame chunk (its current pose) -> Map(chunk -> [bone] matrix|null)
function snapshot(o) {
  const m = new Map();
  for (const k of derive(o, 'read')) m.set(k.chunk, k.pose.map(p => (p ? Float32Array.from(p.m) : null)));
  return m;
}

function setMatrix(obj, frame, bone, mat) {
  if (!(frame >= 0 && frame < obj.frames)) throw new RangeError('frame ' + frame);
  if (!mat || mat.length !== 12) throw new RangeError('matrix needs 12 numbers');
  const o = clone(obj), b = boneIx(o, bone);
  let c = null; for (const x of o.chunks) if (isFrame(x) && x.index === frame) c = x;
  if (!c) {
    const tracks = allTracks(o), tgt = snapshot(o);
    c = addChunk(o, kindNear(o, frame), frame);
    tgt.set(c, tracks.map(t => t[frame]));
    settle(o, tgt);
  }
  keyRec(c, b, mat);
  normalizeRecs(o);
  o.problems = []; check(o);
  return o;
}

function insertFrame(obj, at, copyFrom) {
  if (!(at >= 0 && at <= obj.frames)) throw new RangeError('at ' + at);
  if (!(copyFrom >= 0 && copyFrom < obj.frames)) throw new RangeError('copyFrom ' + copyFrom);
  const o = clone(obj), tracks = allTracks(o), tgt = snapshot(o);
  // keep the pose of frame `at` (moves to at+1) a key frame, so the inserted pose does not leak into it
  if (at < o.frames && !o.chunks.some(c => isFrame(c) && c.index === at)) {
    const c = addChunk(o, kindNear(o, at), at); tgt.set(c, tracks.map(t => t[at]));
  }
  if (at > 0 && !o.chunks.some(c => isFrame(c) && c.index === at - 1)) {
    const c = addChunk(o, kindNear(o, at - 1), at - 1); tgt.set(c, tracks.map(t => t[at - 1]));
  }
  for (const c of o.chunks) if (isFrame(c) && c.index >= at) c.index++;
  o.frames++;
  const n = addChunk(o, kindNear(o, at), at);
  tgt.set(n, tracks.map(t => t[copyFrom]));
  settle(o, tgt);
  return o;
}

function deleteFrames(obj, from, to) {
  if (to === undefined) to = from;
  if (!(from >= 0 && to >= from && to < obj.frames)) throw new RangeError(`frames ${from}..${to}`);
  const cut = to - from + 1;
  if (cut >= obj.frames) throw new RangeError('cannot delete every frame');
  const o = clone(obj), tracks = allTracks(o), tgt = snapshot(o);
  const has = f => o.chunks.some(c => isFrame(c) && c.index === f);
  for (const f of [from - 1, to + 1]) if (f >= 0 && f < o.frames && !has(f)) { const c = addChunk(o, kindNear(o, f), f); tgt.set(c, tracks.map(t => t[f])); }
  o.chunks = o.chunks.filter(c => !(isFrame(c) && c.index >= from && c.index <= to));
  for (const c of o.chunks) if (isFrame(c) && c.index > to) c.index -= cut;
  o.frames -= cut;
  settle(o, tgt);
  return o;
}

function reverse(obj) {
  const o = clone(obj), tgt = snapshot(o);
  const fc = o.chunks.filter(isFrame), slots = [];
  o.chunks.forEach((c, i) => { if (isFrame(c)) slots.push(i); });
  fc.reverse().forEach((c, k) => { c.index = o.frames - 1 - c.index; o.chunks[slots[k]] = c; });
  settle(o, tgt);
  return o;
}

module.exports = { parse, write, setMatrix, insertFrame, deleteFrames, reverse, boneTrack, matrixAt, toMatrix, fromMatrix, slerp, FLAGS: { F_POS, F_ROT, F_MIR, F_SHOW, F_HIDE, F_MESH } };
