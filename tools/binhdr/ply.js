// .ply checks: FMT-13 magic, FMT-01 chunk walk/desync, FMT-10 vertex/bonemap limits, FMT-12 BPLY, FMT-03 materials
// layouts:, ply-vertex; engine gem/render/{multi mesh,poly mesh,mesh part,big mesh}.cpp
// Author: Imperator_Aug (ARSENAL, ia-7f7f2ca0)
const { Reader, BinError } = require('../lib/bin');
const names = require('../lib/names');

const KNOWN = new Set(['BNDS', 'SKIN', 'MESH', 'SUBM', 'VERT', 'INDX', 'ADJA', 'SHDW', 'MROR']);
const BIG_KNOWN = new Set([...KNOWN, 'BAS2', 'BASS', 'IND4', 'InfG', 'LBEG', 'LEND']);
const F = { dynamic: 1, blend: 2, normals: 4, skinned: 0x10, light: 0x200, material: 0x400, boneMap: 0x800, detail: 0x100, keep: 0x1000 };

function cstr(r) { const b = r.u8(); return (b === 255 ? r.u8() | r.u8() << 8 | r.u8() << 16 : b); }
function readString(r) { const n = cstr(r); return r.str(n, 'latin1'); }

const TYPE_SIZE = [4, 8, 12, 16, 4, 4, 4];
// layer types of (CreateMaterial names); only "bump" reads 8 more bytes
const LAYER_TYPES = new Set(['simple', 'vertex_color', 'bump', 'envmap', 'multiply', 'morph', 'silhouette', 'ocean', 'water', 'layered']);
function readInline(r) {
  const n = r.i32();
  if (n < 0 || n > 16) return null;
  const tex = [];
  for (let i = 0; i < n; i++) {
    const type = readString(r);
    if (!LAYER_TYPES.has(type) || type === 'layered') return null;
    const nt = r.u8();
    for (let k = 0; k < nt; k++) { const layer = readString(r); tex.push({ layer, tex: readString(r) }); }
    if (type === 'bump') r.skip(8);
  }
  return tex;
}
// texture string -> index key base (refcheck rules: $/ = texture/common, leading / = resource root, else relative to the file)
const TEX_EXTS = ['.dds', '.tga', '.ebm', '.bmp', '.tex', '.jpg', '.png'];
function texBase(t, dir) {
  const l = names.normalize(t);
  return require('path').posix.normalize(l.startsWith('$/') ? 'resource/texture/common/' + l.slice(2) : l.startsWith('/') ? 'resource/' + l.slice(1) : dir + '/' + l);
}

// ctx: { key, buf, rep, rel, v (vfs), has(key) }
function checkPly(ctx) {
  const { buf, rep, rel } = ctx;
  const add = (code, msg) => rep.add(rel, 0, code, msg);
  if (buf.length < 4) return add('PLY_BAD_MAGIC', `file is ${buf.length} bytes: engine reports "Can't create resource object"`);
  const magic = buf.toString('latin1', 0, 4);
  if (magic !== 'EPLY' && magic !== 'BPLY') return add('PLY_BAD_MAGIC', `magic ${JSON.stringify(magic)} is not EPLY/BPLY: "Can't create resource object"`);
  const big = magic === 'BPLY', known = big ? BIG_KNOWN : KNOWN;
  const r = new Reader(buf, 4);
  const parts = [];
  let skinCount = -1, vert = null, indCount = -1, indices = null, uvBad = false, basis = null, sawVert = false;
  let stop = false;
  try {
    while (!r.eof() && !stop) {
      const at = r.pos, tag = r.tag();
      if (!known.has(tag)) return add('PLY_BAD_CHUNK', `unknown chunk tag ${JSON.stringify(tag)} at offset ${at}: "Invalid chunk in .PLY file!" (earlier field desync?)`);
      switch (tag) {
        case 'BNDS': r.skip(24); break;
        case 'ADJA': r.skip(r.i32() * 6); break;
        case 'SHDW': r.skip(r.i32()); break;
        case 'MROR': break;
        case 'LBEG': case 'LEND': break;
        case 'SKIN': { const n = r.i32(); skinCount = n; for (let i = 0; i < n; i++) readString(r); break; }
        case 'BAS2': basis = Array.from({ length: 12 }, () => r.f32()); break;
        case 'BASS': r.skip(48 + 24); break;
        case 'MESH': case 'SUBM': {
          const p = { tag, at, firstFace: 0, faceCount: 0, flags: 0, strideSet: null, texCoords: 0, mtl: null, bonemap: null };
          let fvf = 0, declStride = 0;
          if (tag === 'SUBM') {
            for (let run = 0; run < 2; run++) {
              for (;;) {
                const c = r.u8();
                if (c === 0xff) break;
                const index = r.u8(), stream = r.u8();
                const type = c & 15, usage = c >> 4;
                if (type > 6) return add('PLY_BAD_CHUNK', `SUBM vertex element type ${type} at offset ${r.pos - 3}: declaration desync`);
                if (usage === 3) p.texCoords++;
                if (stream === 0) declStride += TYPE_SIZE[type];
                void index;
              }
            }
            p.firstFace = r.i32(); p.faceCount = r.i32(); p.firstVertex = r.i32(); p.vertexCount = r.i32(); p.flags = r.u32();
            p.strideSet = [declStride];
          } else {
            fvf = r.u32(); p.firstFace = r.i32(); p.faceCount = r.i32(); p.flags = r.u32();
            p.flags |= 0; // normals forced on by loader
            p.texCoords = (fvf & 0xF00) >> 8;
            let s = 12 + (p.flags & F.skinned ? 8 : 0) + (fvf & 0x40 ? 4 : 0) + p.texCoords * 8;
            if (fvf & 0x10) s += 12;                        // else loader inserts normals: not in file
            p.strideSet = [s, s + 16];                      // + tangent (bump material); real data has it without the detail flag too
          }
          // material section
          const fl = p.flags;
          if (fl & F.light) r.skip(4);
          if (fl & F.material) {
            const s = readString(r);
            if (s === '') {   // layered inline block (FMT-16): i32 n, n x (type string, u8 nTex, nTex x (layer, texture), bump: 4B color + f32)
              p.inlineMaterial = true;
              const ib = readInline(r);
              if (ib) { p.inlineTex = ib; p.inlineMaterial = false; } else stop = true;   // unknown layer type: layout lost, stop here
            }
            else p.mtl = s;
          } else {
            let n = 0;
            const tex = p.texCoords + ((fl & F.detail && fl & F.light) ? 1 : 0);
            if (fl & (F.detail | F.light)) n = 1 + (fl & F.detail ? 1 : 0) + (fl & F.light ? 1 : 0);
            else if (tex === 2 || fl & F.keep) n = 2;
            else if (tex === 1) n = 1;
            p.tex = [];
            for (let i = 0; i < n; i++) p.tex.push(readString(r));
          }
          if (!p.inlineMaterial) {
            if (fl & F.boneMap) { const n = r.u8(); p.bonemap = Array.from(r.bytes(n)); }
          }
          if (big && p.texCoords === 2) uvBad = true;
          parts.push(p);
          break;
        }
        case 'VERT': {
          const count = r.i32();
          if (big) { const size = r.i32(); vert = { count, stride: size, at }; r.skip(count * size); }
          else { const stride = r.u16(), fl = r.u16(); vert = { count, stride, fl, at }; r.skip(count * stride); }
          sawVert = true;
          break;
        }
        case 'INDX': { const n = r.i32(); indCount = n; indices = r.bytes(n * 2); indices.w = 2; break; }
        case 'IND4': { const n = r.i32(); indCount = n; indices = r.bytes(n * 4); indices.w = 4; break; }
        case 'InfG': { r.skip(16 + 8); const n = r.i32(); r.skip(n * 2); break; }
      }
    }
  } catch (e) {
    if (!(e instanceof BinError)) throw e;
    return add('PLY_TRUNCATED', `chunk data runs past end of file (${e.message}): field desync or truncated file`);
  }
  if (stop) { parts.inline = true; }
  ctx.parts = parts;
  // FMT-10 limits
  if (!big && vert && vert.count > 65535) add('PLY_VERT_LIMIT', `${vert.count} vertices > 65535 (u16 INDX): corrupt/ignored geometry`);
  if (!big && vert && vert.count < 0) add('PLY_TRUNCATED', `negative vertex count ${vert.count}`);
  for (const p of parts) {
    if (p.bonemap) {
      if (p.bonemap.length > 25) add('PLY_BONEMAP_LIMIT', `${p.tag} at offset ${p.at}: bone map has ${p.bonemap.length} entries (max 25 = )`);
      if (skinCount >= 0) for (const b of p.bonemap) if (b > skinCount) { add('PLY_BONEMAP_LIMIT', `${p.tag} at offset ${p.at}: bone map index ${b} > SKIN bone count ${skinCount}`); break; }
    }
  }
  // FMT-16: texture strings of an inline layered material must resolve to an image file
  {
    const dir0 = ctx.key.slice(0, ctx.key.lastIndexOf('/')), seenT = new Set();
    for (const p of parts) for (const x of p.inlineTex || []) {
      if (!x.tex || seenT.has(x.tex)) continue;
      seenT.add(x.tex);
      const base = texBase(x.tex, dir0);
      if (TEX_EXTS.some(e => ctx.has(base + e)) || ctx.has(base)) continue;
      add('WARN_PLY_INLINE_TEX_MISSING', `${p.tag} at offset ${p.at}: inline material texture ${JSON.stringify(x.tex)} (layer ${JSON.stringify(x.layer)}) -> ${base}.dds|tga|ebm not in resource index: the layer draws without its texture [T]; fix the name or add the image`);
    }
  }
  if (parts.inline) return;
  // geometry consistency (FMT-01 desync symptoms)
  if (parts.length && !sawVert) add('PLY_NO_GEOMETRY', 'MESH/SUBM parts but no VERT chunk');
  if (indices && indCount >= 0 && !big && indCount % 3) add('PLY_INDEX_RANGE', `INDX count ${indCount} is not a multiple of 3`);
  if (indices) {
    const w = indices.w, n = indices.length / w, vc = vert ? vert.count : 0;
    // only indices a part actually references (vanilla has stray unused indices past the vertex count)
    let max = -1;
    for (const p of parts) {
      const a = Math.max(0, p.firstFace) * 3, b = Math.min(n, (p.firstFace + p.faceCount) * 3);
      for (let i = a; i < b; i++) { const x = w === 2 ? indices.readUInt16LE(i * 2) : indices.readUInt32LE(i * 4); if (x > max) max = x; }
    }
    if (vert && max >= vc) add('PLY_INDEX_RANGE', `index ${max} >= vertex count ${vc}`);
    for (const p of parts) if (p.faceCount < 0 || p.firstFace < 0 || (p.firstFace + p.faceCount) * 3 > n)
      add('PLY_PART_RANGE', `${p.tag} at offset ${p.at}: faces ${p.firstFace}+${p.faceCount} exceed ${Math.floor(n / 3)} triangles`);
  }
  if (!big && vert) for (const p of parts) if (vert.stride < p.strideSet[0]) {
    add('WARN_PLY_STRIDE', `${p.tag} at offset ${p.at}: VERT stride ${vert.stride}, layout needs at least ${p.strideSet[0]} (vanilla also uses +8/+16 for extra tangent data) [T]`); break;
  }
  // FMT-12
  if (big && uvBad) add('PLY_BIG_OBSOLETE', 'BPLY part has 2 uv sets: "BigMesh structure is obsolete. Resave map."');
  if (big && basis) {
    const u = basis[2] * basis[2] + basis[3] * basis[3], vv = basis[4] * basis[4] + basis[5] * basis[5];
    if (Math.abs(u - vv) > 1) add('WARN_PLY_BIG_BASIS', `BAS2 |U|^2=${u.toFixed(2)} vs |V|^2=${vv.toFixed(2)} differ by >1: engine warns "Invalid mesh basis!" and auto-fixes`);
  }
  // FMT-03 materials
  const dir = ctx.key.slice(0, ctx.key.lastIndexOf('/'));
  const seen = new Set();
  for (const p of parts) {
    if (!p.mtl || seen.has(p.mtl)) continue;
    seen.add(p.mtl);
    const nm = names.normalize(p.mtl);
    if (!nm.endsWith('.mtl')) continue;
    const key = names.resolve(p.mtl, dir).key;
    if (ctx.has(key)) continue;
    const lib = names.resolve(p.mtl, dir).key.replace(/[^/]*$/, '') + '.materials';
    if (ctx.has(lib)) continue;
    add('PLY_MTL_MISSING', `${p.tag} at offset ${p.at}: material ${JSON.stringify(p.mtl)} -> ${key} not in resource index and no .materials library in its folder: load-time crash`);
  }
}

// names a mesh's parts load by: { mtls: material files, tex: texture names written in the part }; parts before a parse error still count
function meshRefs(buf) {
  const c = { key: 'x/x.ply', buf, rep: { add() {} }, rel: '', has: () => true };
  checkPly(c);
  const parts = c.parts || [];
  return { mtls: [...new Set(parts.map(p => p.mtl).filter(Boolean))], tex: [...new Set(parts.flatMap(p => p.tex || []).filter(Boolean))] };
}

module.exports = { checkPly, meshRefs };
