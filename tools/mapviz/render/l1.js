// render L1 (MV-R1): the ground picture of a map from its files (tools/mapviz/README.md 1.9; design 7 L1; render.md shader;
// check-gohground.md F1-F3). Parent side: reads map.ply through the shared ply reader (tools/lib/model/ply.js), the part
// materials (mats.js) and their textures (tools/lib/model/dds.js), and hands plain grids to the kernel render/l1tile.
//   l1(src, doc, o) -> Promise<{grid (rgba8 'pic.l1'), sidecar, stats}>
//     o = {size (default 2048), mode?, pool? (a jobs pool, or a number of children; 0 or absent = in this process),
//          progress? (mapviz progress reporter), made?, gain?, band? (rows per kernel task, default 256),
//          mips? ('file' | 'box': the level chain of the ground textures; default by target, see MIPS),
//          detail? ('map' default | 'gpu': the map-scale detail rule DETAIL, or the GPU rule alone)}
//   stats carry mips, detail and keep (the picture's detail keep, 1 = the GPU rule alone, at cell 1 u per pixel or finer),
//   detailTextures ([{name, k}]: the textures the rule drew with their own keep k < 1, the lowest over their uses, sorted
//   by name; [] with detail gpu or a fine picture) and detailChanged (detail 'map' and detailTextures not empty). The
//   sidecar pic.l1.json carries detail, keep, detailTextures and detailChanged too (render VERSION 4); approx stays the
//   gaps flag, detailChanged is apart. The picture bytes do not depend on these fields.
//   The picture covers the plan frame (frame.plan: the world box, north up, row 0 = min world y). Per mesh part exactly two
//   layers, blended by vertex alpha (layer 0 x a + layer 1 x (1 - a)); uv = stored uv0 x TILING (AS2 and AS64 2.0, GoH 2.5);
//   pixel = blend x vertex rgb / 255 x 4 x GAIN x (sun x max(N.L, 0) + ambient) with the fixed L1 light LIGHT
//   ('clean_daylight': the light direction of the shipped multi_01 environment, neutral grey sun and ambient of the same
//   luminance as multi_01 [I]); GoH also x Global Diffuse over the world box [I which box]; heights, parallax, bump maps,
//   specular and the GoH Global Normalmap are not drawn (Normalmap: gap RENDER_GLOBAL_NORMAL). Texture filtering is the GPU
//   rule for a top view: lod = log2(texels per sample) per texture and part (2 x 2 samples per pixel, box downsample),
//   trilinear between the two nearest levels (premixed into one texture at the finer level's size, decodeMix), bilinear
//   with wrap; the level chain is the file mips, then 2 x 2 box-filtered levels down to 1 x 1 (lodFor, rawLevel) on AS2
//   and AS64; on GoH level 0 from the file, then box-filtered levels (its shipped mips are sharpened: see MIPS in prepare;
//   o.mips 'file' or 'box' overrides). On pictures coarser than 1 u per pixel a strong texture repeat (a regular weave the
//   game camera never shows) is pulled toward the texture's mean colour (DETAIL, detailKeep, detailLow). Vertex alpha is
//   interpolated barycentrically, as the GPU does. The tone curve is a clamp to 0..255.
//   A texture or material that cannot be read never throws: its layer gets a flat colour (the mean of the textures that
//   were read, else the palette ground fill) and a gap code.
// Gap codes: RENDER_MATERIAL_MISSING, RENDER_MATERIAL_BAD (the material text cannot be read, e.g. a quote never closed),
// RENDER_TEXTURE_MISSING, RENDER_TEXTURE_BAD (a .dds or .ebm that cannot be read), RENDER_LAYERS_SHORT (a material with
// fewer than two layers), RENDER_NO_VCOLOR, RENDER_GLOBAL_MISSING, RENDER_GLOBAL_NORMAL, RENDER_UNCOVERED (a hole: a pixel wholly inside the box of the
// mesh vertices not fully covered). Pixels the mesh border cuts, or that lie past the mesh (the mesh box is shifted
// against the world box or stops short of it on a side), take the colour of their mirror image inside the mesh when they
// lie at most FILL_U (64) world units past the mesh box (fillEdges: no transparent or dark rim, no streaks); farther ones
// stay transparent. Both are counted in a note, never a gap.
// Errors (MvError): MV_NOT_FOUND (no map.ply, detail.code RENDER_PLY_MISSING), MV_FAULT (map.ply unreadable or cut short:
// RENDER_PLY_BAD; a kernel failed: RENDER_KERNEL), MV_CANCELLED, MV_USAGE (size: RENDER_SIZE).
// Author: Imperator_Aug (ARSENAL, ia-3986b415)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const F = require('./frame');

const KERNEL = 'render/l1tile';
const TILING = { as64: 2.0, mowas2: 2.0, goh: 2.5 };
const MIPS = { as64: 'file', mowas2: 'file', goh: 'box' };   // level chain of the tiled ground textures (prepare)
const MUL = 4;                       // mtl_params.x of the big ground mesh (render.md)
// GAIN: one global gain fitted by C0 on MoW:AS2 maps: the median c0 gain (minimap luminance / picture luminance, picture
// drawn with gain 1 at 1024 px) over 14 multiplayer maps spread through the list = 1.082 (REPORT.json 'gain') [I: only
// 2v2_ramelle of the 14 passed the 1 px offset rule; the gain is a global luminance ratio and moved little with the
// offset]. GoH uses it unverified (brightness 'unverified' until G8).
const GAIN = 1.08;
const SS = 2;
const LIGHT = {
  name: 'clean_daylight',
  dir: [0.719, 0.281, -0.636],       // multi_01 light direction (render.md), mesh frame; the sun is -dir
  sun: [0.601, 0.601, 0.601],        // luminance of multi_01 diffuse 0xaf9678
  amb: [0.179, 0.179, 0.179],        // luminance of multi_01 ambient 0x2d2d37
};

function mv() { return require('../mapviz'); }
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');

function targetOf(src) {
  const t = src && src.target;
  if (TILING[t] !== undefined) return t;
  const M = mv();
  for (const k of Object.keys(M.TARGETS)) if (M.TARGETS[k] === t || M.TARGETS[k] === (src && src.exe)) return k;
  return 'mowas2';
}

function readPly(src, key) {
  const M = mv();
  const k = 'resource/map/' + key + '/map.ply';
  const buf = src.has(k) ? src.read(k) : null;
  if (!buf) throw new M.MvError('MV_NOT_FOUND', 'map ' + key + ' has no map.ply (no ground mesh to draw)', { code: 'RENDER_PLY_MISSING', map: key });
  const p = require('../../lib/model/ply').parse(buf);
  const V = p.vertices;
  const bad = p.error || !V || !V.position || !p.indices || !p.parts || !p.parts.length;
  if (bad) throw new M.MvError('MV_FAULT', 'map.ply of ' + key + ' cannot be read: ' + (p.error || 'no vertices, indices or parts'), { code: 'RENDER_PLY_BAD', map: key });
  for (const q of p.parts) {
    if ((q.firstFace + q.faceCount) * 3 > p.indices.length) throw new M.MvError('MV_FAULT', 'map.ply of ' + key + ' is cut short: part faces run past the index list', { code: 'RENDER_PLY_BAD', map: key });
  }
  return { ply: p, hash: sha1(buf) };
}

function meanOf(rgba) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let k = 0; k < rgba.length; k += 4) { r += rgba[k]; g += rgba[k + 1]; b += rgba[k + 2]; n++; }
  return n ? [r / n, g / n, b / n] : null;
}

// texel density of one part: world units of uv0 per world unit (sqrt of the area ratio over its triangles)
function uvPerUnit(ply, tri) {
  const P = ply.vertices.position, U = ply.vertices.uv0;
  if (!U) return 0;
  let wa = 0, ua = 0;
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    wa += Math.abs((P[b * 3] - P[a * 3]) * (P[c * 3 + 1] - P[a * 3 + 1]) - (P[c * 3] - P[a * 3]) * (P[b * 3 + 1] - P[a * 3 + 1]));
    ua += Math.abs((U[b * 2] - U[a * 2]) * (U[c * 2 + 1] - U[a * 2 + 1]) - (U[c * 2] - U[a * 2]) * (U[b * 2 + 1] - U[a * 2 + 1]));
  }
  return wa > 0 ? Math.sqrt(ua / wa) : 0;
}

// level of detail of a tiled ground texture (the GPU rule for a top view, where uv is linear in world x, y):
// lod = log2(texels per sample) = log2(texSize x tiling x uvu x footU), footU = world units per sample, texSize = the
// larger side of level 0, levels = the length of the chain (file mips, then box-filtered levels down to 1 x 1).
// -> {a, b, f, lod}: the two nearest levels a <= lod <= b and the weight f of b (trilinear: the blended texel is about one
// sample, the 2 x 2 box of samples makes it one output pixel, so a texture far below its resolution gives its local mean,
// not a dot pattern). Magnified (lod <= 0): level 0 alone; past the last level: the last level alone. f is kept to 1/64
// steps (0 and 1 drop a level).
function lodFor(texSize, levels, tiling, uvu, footU) {
  const tpp = texSize * tiling * uvu * footU;
  const top = Math.max(0, (levels | 0) - 1);
  if (!(tpp > 1)) return { a: 0, b: 0, f: 0, lod: tpp > 0 ? Math.log2(tpp) : -Infinity };
  const lod = Math.log2(tpp);
  if (lod >= top) return { a: top, b: top, f: 0, lod };
  let a = Math.floor(lod), f = Math.round((lod - a) * 64) / 64;
  if (f >= 1) { a++; f = 0; }
  return { a, b: f > 0 ? a + 1 : a, f, lod };
}
// the finer level of that pair (kept for callers of the one-level rule)
function mipFor(texSize, mips, tiling, uvu, footU) {
  return lodFor(texSize, mips, tiling, uvu, footU).a;
}
// levels of a full chain for a w x h level 0 (w, h halved, floored, at least 1, down to 1 x 1)
const chainLevels = (w, h) => Math.floor(Math.log2(Math.max(1, w, h))) + 1;
// how many mip levels of a parsed DDS its bytes really hold (the header count, cut where the file ends; dds.js layout)
function fileLevels(info, len) {
  const n = Math.max(1, info.mips || 1);
  let off = info.dataOffset || 128, w = info.width, h = info.height, k = 0;
  for (; k < n; k++) {
    const b = info.blockBytes ? Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * info.blockBytes : w * h * ((info.bpp || 32) >> 3);
    if (off + b > len) break;
    off += b; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  return k;
}

// level 2 of the box chain of a block-compressed texture (DXT1, DXT3, DXT5) straight from level 0's blocks: each 4 x 4
// block's mean colour (the mean of its 16 palette entries, as the box filter of the decoded texels would give, to byte
// rounding; a DXT1 three-colour block's index 3 is black, as dds.js decodes it). Skips the full decode of level 0 (a
// 2048 x 2048 texture: about 0.2 s), so the GoH box chain costs about what reading a file mip did. -> {w, h, rgba} or null
// when the format is another, a side is not a multiple of 4 or the bytes stop short.
function blockMean(info, buf) {
  const f = info.format, w = info.width, h = info.height;
  if (!(f === 'DXT1' || f === 'DXT3' || f === 'DXT5') || (w & 3) || (h & 3)) return null;
  const bw = w >> 2, bh = h >> 2, bb = info.blockBytes, off = info.dataOffset || 128;
  if (off + bw * bh * bb > buf.length) return null;
  const out = new Uint8ClampedArray(bw * bh * 4), cnt = [0, 0, 0, 0];
  const c5 = v => ((v & 31) * 255 / 31) | 0, c6 = v => ((v & 63) * 255 / 63) | 0;
  for (let b = 0; b < bw * bh; b++) {
    const o = off + b * bb + (bb === 16 ? 8 : 0);
    const a = buf[o] | (buf[o + 1] << 8), c = buf[o + 2] | (buf[o + 3] << 8);
    const bits = (buf[o + 4] | (buf[o + 5] << 8) | (buf[o + 6] << 16) | (buf[o + 7] << 24)) >>> 0;
    cnt[0] = cnt[1] = cnt[2] = cnt[3] = 0;
    for (let i = 0; i < 16; i++) cnt[(bits >>> (2 * i)) & 3]++;
    const A = [c5(a >> 11), c6(a >> 5), c5(a)], B = [c5(c >> 11), c6(c >> 5), c5(c)], four = f !== 'DXT1' || a > c;
    for (let k = 0; k < 3; k++) {
      const p2 = four ? ((2 * A[k] + B[k]) / 3) | 0 : (A[k] + B[k]) >> 1, p3 = four ? ((A[k] + 2 * B[k]) / 3) | 0 : 0;
      out[b * 4 + k] = Math.round((A[k] * cnt[0] + B[k] * cnt[1] + p2 * cnt[2] + p3 * cnt[3]) / 16);
    }
    out[b * 4 + 3] = 255;
  }
  return { w: bw, h: bh, rgba: out };
}

// bilinear read of level B (wrap) at the texel centres of a w x h level: out[o + c] = base[o + c] x baseW + B x wt (base
// null: B x wt alone). The same arithmetic, in the same order, as the trilinear premix always used (bytes unchanged).
function upWrap(B, w, h, out, wt, base, baseW) {
  const wb = B.w, hb = B.h, d = B.rgba;
  for (let j = 0; j < h; j++) {
    const fy = (j + 0.5) / h * hb - 0.5, j0 = Math.floor(fy), ty = fy - j0;
    const r0 = ((j0 % hb) + hb) % hb, r1 = (((j0 + 1) % hb) + hb) % hb;
    for (let i = 0; i < w; i++) {
      const fx = (i + 0.5) / w * wb - 0.5, i0 = Math.floor(fx), tx = fx - i0;
      const c0 = ((i0 % wb) + wb) % wb, c1 = (((i0 + 1) % wb) + wb) % wb;
      const p = (r0 * wb + c0) * 4, q = (r0 * wb + c1) * 4, s = (r1 * wb + c0) * 4, t = (r1 * wb + c1) * 4;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty, o = (j * w + i) * 4;
      for (let c = 0; c < 3; c++) {
        const v = (d[p + c] * w00 + d[q + c] * w10 + d[s + c] * w01 + d[t + c] * w11) * wt;
        out[o + c] = base ? base[o + c] * baseW + v : v;
      }
    }
  }
}

// DETAIL: the map-scale rule for the tiled ground textures (o.detail 'map', the default; 'gpu' leaves it out). Measured on
// goh multi/1v1_riverbank at 2048 (7.85 u per pixel): the bright weave is soil_snowy's own snow blotches (texels about 200,
// x 1.3 brightness -> clipped white) repeated every 341.3 u (43.5 px): the picture folded by 341.3 u keeps a luminance std
// of 12.3, by the 60 u mesh lattice 0.4; the sampler level is right (lod 4.2, 1.15 texels of level 4 per sample). The GPU
// draws that repeat too, but the game camera never shows the ground coarser than about 1 to 2 u per pixel, where a repeat
// spans hundreds of pixels; on a map picture it spans tens of pixels and the eye reads the blotches as a weave. So, per
// picture, keep = 1 at cell <= fine u per pixel, 0 at cell >= coarse, log-linear between (1/64 steps). Each layer
// texture: coarse band = the coarsest chain level whose texel is at most cutU world units (texel = repeat / level size;
// repeat = 1 / (tiling x uv per unit)), read back bilinear with wrap; cutU 10 u is about 2.5 pixels where keep reaches 0
// (GoH 1600 px over 341 u: level 5, 6.8 u; AS2 512 px over 150 u: level 5, 9.4 u). Only a strong coarse band draws a
// weave: its luminance std (sigma) is 2 to 8 on the AS2 and summer GoH ground textures read (stone_wall01 17.7), 29.6 on
// soil_snowy, 15 to 33 on GoH snow textures, so the texture keeps k = keep + (1 - keep) x min(1, (sigma0 / sigma)^2),
// sigma0 = 8, and is drawn as itself - (1 - k) x (coarse band - the coarse band's mean): the grain finer than cutU stays,
// strong blotches go toward the mean colour, weak ones stay; a texture drawn at or past that level (small pictures) goes
// to mean + k x (texel - mean). [I: the scales and sigma0 are picked for the look]
// Result at 2048 (render VERSION 3): riverbank fold 12.34 -> 3.29 (pixels over 200: 0.70% -> 0; only soil_snowy changes,
// k 0.08); goh 1v1_forssa_dam no texture changes (byte-identical); goh 4v4_winter_walk eight snow textures (k 0.06 to
// 0.55), fold 4.85 -> 3.42; mowas2 3v3_river_bank stone_wall01 only (k 0.16, 0.2% of pixels); mowas2 1v1_road at 3.55 u per
// pixel two textures (k 0.78, 0.89), max channel change 6.
const DETAIL = { fine: 1, coarse: 4, cutU: 10, sigma: 8 };
function detailKeep(cellU, mode) {
  if (mode === 'gpu' || !(cellU > DETAIL.fine)) return 1;
  if (cellU >= DETAIL.coarse) return 0;
  return Math.round(Math.log2(DETAIL.coarse / cellU) / Math.log2(DETAIL.coarse / DETAIL.fine) * 64) / 64;
}
// chain level of the coarse band of a texSize texture repeated every repeatU world units (texel <= cutU), within the chain
function detailLow(texSize, levels, repeatU) {
  const top = Math.max(0, (levels | 0) - 1);
  if (!(repeatU > 0) || !(texSize > 0)) return top;
  return Math.max(0, Math.min(top, Math.floor(Math.log2(DETAIL.cutU * texSize / repeatU) + 1e-9)));
}

// luminance (0.299 r + 0.587 g + 0.114 b) standard deviation of an rgba8 level
function lumStd(rgba) {
  let s = 0, q = 0;
  const n = rgba.length >> 2;
  if (!n) return 0;
  for (let k = 0; k < rgba.length; k += 4) { const L = 0.299 * rgba[k] + 0.587 * rgba[k + 1] + 0.114 * rgba[k + 2]; s += L; q += L * L; }
  const m = s / n;
  return Math.sqrt(Math.max(0, q / n - m * m));
}

function rgbaGrid(name, w, h, data) {
  return { name, w, h, cell: 1, ox: 0, oy: 0, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {},
    data: data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

// everything the kernel needs, as grids and args (no game reads after this)
function prepare(src, doc, o) {
  const M = mv(), dds = require('../../lib/model/dds'), ply = require('../../lib/model/ply'), mats = require('./mats');
  const size = F.checkSize(o.size == null ? 2048 : o.size);
  const pl = F.plan(doc, { size });
  const key = doc.key;
  const target = targetOf(src);
  const tiling = TILING[target];
  const gaps = new Set(), notes = [];
  const { ply: p, hash } = readPly(src, key);
  const V = p.vertices, nv = V.count;
  const mt = mats.materials(src, key, p.parts);
  for (const n of mt.notes) notes.push(n);
  // texture footprint: one sample (the picture is drawn at SS x SS samples per pixel, then box-downsampled: design 7 R0
  // 'render at 2x and box-downsample'), so each sample reads the level the GPU would pick at the 2x size and the box
  // filter gives the output pixel its area mean (texel about one output pixel after the downsample)
  const sampleU = Math.max(pl.cell, pl.cellY) / SS;
  // level chain of the tiled ground textures (MIPS): 'file' = the file's own mips, then box filters; 'box' = level 0 from
  // the file, every coarser level a 2 x 2 box filter of the one before. AS2 and AS64 read the file mips as the engine does
  // (: a single-image bitmap keeps the surface as stored [V]). GoH uses the box chain: its shipped
  // ground mips are sharpened (goh_spring/soil_snowy: texels over luminance 200 are 2.0 % of level 0, 5.7 to 5.9 % of file
  // levels 1 to 4, against 1.6 to 0.6 % for the box chain), and x the GoH brightness (about 2.1) those texels clip to white:
  // a regular grid of white flecks. The GoH engine's mip use is not read [I]; o.mips 'file' or 'box' overrides.
  const mipsMode = o.mips === 'file' || o.mips === 'box' ? o.mips : MIPS[target];
  // map-scale detail of the tiled ground textures (DETAIL): one keep for the picture, from its pixel size
  const detailMode = o.detail === 'gpu' ? 'gpu' : 'map';
  const keep = detailKeep(Math.max(pl.cell, pl.cellY), detailMode);
  const detailTex = new Map();   // texture name (as the map's material names it) -> lowest k < 1 the rule drew it with
  // textures: name (+ chain) -> {buf, info, mean, decoded levels (raw), kernel grids by level (mips)}; fileMax = how many
  // levels come from the file (the global textures always read the file's mips: they are not tiled)
  const texByName = new Map(), texList = [], grids = new Map();
  const texKey = (name, chain) => String(name).toLowerCase() + (chain === 'box' ? '\u0000box' : '');
  const texOf = (name, chain) => {
    const k = texKey(name, chain);
    if (texByName.has(k)) return texByName.get(k);
    let rec = null;
    const t = mats.texture(src, name);
    if (!t) { gaps.add('RENDER_TEXTURE_MISSING'); notes.push('texture ' + name + ': not found'); }
    else if (t.error || !t.buf) { gaps.add('RENDER_TEXTURE_BAD'); notes.push('texture ' + name + ': ' + (t.error || 'unreadable')); }
    else {
      const info = dds.parse(t.buf);
      if (info.error) { gaps.add('RENDER_TEXTURE_BAD'); notes.push('texture ' + name + ' (' + t.key + '): ' + info.error); }
      else {
        const file = fileLevels(info, t.buf.length);
        rec = { name, key: t.key, buf: t.buf, info, mips: new Map(), raw: new Map(), mean: null,
          file, fileMax: chain === 'box' ? Math.min(1, file) : file, levels: chainLevels(info.width, info.height) };
      }
    }
    texByName.set(k, rec);
    return rec;
  };
  // level m of a texture: the file's own mip while its bytes hold it (and the chain takes file levels: m < fileMax), else
  // a 2 x 2 box filter of level m - 1 (built once)
  const rawLevel = (rec, m) => {
    if (rec.raw.has(m)) return rec.raw.get(m);
    let r = null;
    if (m < Math.max(1, rec.fileMax)) {
      const d = dds.decode(rec.buf, { mip: m });
      if (d && !d.error && d.rgba && d.mip === m) r = { w: d.width, h: d.height, rgba: d.rgba, from: 'file' };
      else if (m === 0) { gaps.add('RENDER_TEXTURE_BAD'); notes.push('texture ' + rec.name + ': ' + ((d && d.error) || 'unreadable')); }
    }
    if (!r && m === 2 && rec.fileMax <= 1 && !rec.raw.has(1)) {
      const q = blockMean(rec.info, rec.buf);
      if (q) r = { w: q.w, h: q.h, rgba: q.rgba, from: 'box' };
    }
    if (!r && m > 0) {
      const p = rawLevel(rec, m - 1);
      if (p) { const h = dds.downscale(p.rgba, p.w, p.h, Math.max(1, Math.max(p.w, p.h) >> 1)); r = { w: h.width, h: h.height, rgba: h.rgba, from: 'box' }; }
    }
    if (r && !rec.mean) rec.mean = meanOf(r.rgba);
    rec.raw.set(m, r);
    return r;
  };
  const decodeMip = (rec, mip) => {
    if (rec.mips.has(mip)) return rec.mips.get(mip);
    const d = rawLevel(rec, mip);
    if (!d) { rec.mips.set(mip, null); return null; }
    const id = texList.length, file = 'tex' + id + '.mvg';
    const g = rgbaGrid('tex', d.w, d.h, d.rgba);
    g.meta = { key: rec.key, mip, from: d.from };
    texList.push(file); grids.set(file, g);
    const r = { id, file };
    rec.mips.set(mip, r);
    return r;
  };
  // trilinear level pair (a, b = a + 1, weight f of b) as one premixed texture at level a's size: texel (i, j) =
  // level a x (1 - f) + bilinear(level b, wrap) at that texel's centre x f. Bilinear reads of it give trilinear to within
  // the extra half-texel blur of level b (and byte rounding), at the cost of one level in the kernel (a second bilinear
  // read per layer and sample made the kernel about 55 percent slower). One grid per (texture, a, f).
  // the texture's keep: the picture keep raised by how weak its coarse band is (texLumStd of level max(low, a): sigma <=
  // DETAIL.sigma keeps it whole, above x (DETAIL.sigma / sigma)^2), 1/64 steps -> {keep, sigma}
  const texKeep = (rec, det, lod) => {
    const lv = Math.max(det.low, lod.a);
    if (!rec.sig) rec.sig = new Map();
    if (!rec.sig.has(lv)) { const L = rawLevel(rec, lv); rec.sig.set(lv, L ? lumStd(L.rgba) : 0); }
    const sigma = rec.sig.get(lv);
    const w = sigma > DETAIL.sigma ? (DETAIL.sigma / sigma) * (DETAIL.sigma / sigma) : 1;
    return { keep: Math.min(1, Math.round((det.keep + (1 - det.keep) * w) * 64) / 64), sigma };
  };
  // det = {keep, low}: the map-scale rule of DETAIL (picture keep, coarse band level); keep 1 = the GPU rule alone (the
  // grid as above). The texture's own keep (texKeep) can only be higher than the picture's.
  const decodeMix = (rec, lod, det) => {
    const tk = det && det.keep < 1 ? texKeep(rec, det, lod) : null;
    const keep = tk ? tk.keep : 1;
    const mix = lod.f > 0 && lod.b !== lod.a;
    if (!mix && keep >= 1) return decodeMip(rec, lod.a);
    const mk = lod.a + ':' + (mix ? lod.f : 0) + (keep < 1 ? ':' + keep + ':' + det.low : '');
    if (rec.mips.has(mk)) return rec.mips.get(mk);
    const A = rawLevel(rec, lod.a), B = mix ? rawLevel(rec, lod.b) : null;
    if (!A || (mix && !B)) { const r = decodeMip(rec, lod.a); rec.mips.set(mk, r); return r; }
    const n = A.w * A.h * 4;
    let px;
    if (mix) { px = new Float64Array(n); upWrap(B, A.w, A.h, px, lod.f, A.rgba, 1 - lod.f); }
    else px = Float64Array.from(A.rgba);
    let from = A.from + (mix ? '+' + B.from : ''), low = null;
    if (keep < 1) {
      // coarse band = the level 'low' (texel <= DETAIL.cutU) back at this size; out = px - (1 - keep) x (coarse - its
      // mean): the fine grain stays, the blotches of the repeat go toward the texture's mean colour
      const Lw = det.low > lod.a ? rawLevel(rec, det.low) : null;
      const mean = meanOf((Lw || A).rgba);
      let co;
      if (Lw) { co = new Float64Array(n); upWrap(Lw, A.w, A.h, co, 1, null, 0); low = det.low; }
      else co = Float64Array.from(px);
      const s = 1 - keep;
      for (let o = 0; o < n; o += 4) for (let c = 0; c < 3; c++) px[o + c] -= s * (co[o + c] - mean[c]);
      from += ' detail ' + keep;
      // the textures the rule changed (sidecar detailTextures): the lowest k over the texture's uses, by its map name
      const dn = String(rec.name);
      if (!detailTex.has(dn) || keep < detailTex.get(dn)) detailTex.set(dn, keep);
    }
    const out = new Uint8ClampedArray(n);
    for (let o = 0; o < n; o += 4) { out[o] = px[o]; out[o + 1] = px[o + 1]; out[o + 2] = px[o + 2]; out[o + 3] = 255; }
    const id = texList.length, file = 'tex' + id + '.mvg';
    const gr = rgbaGrid('tex', A.w, A.h, out);
    gr.meta = { key: rec.key, mip: lod.a, from };
    if (mix) { gr.meta.mip2 = lod.b; gr.meta.f = lod.f; }
    if (keep < 1) { gr.meta.keep = keep; gr.meta.low = low; }
    texList.push(file); grids.set(file, gr);
    const r = { id, file };
    rec.mips.set(mk, r);
    return r;
  };
  // triangles grouped by part, layer plans
  const tris = [], parts = [];
  let t0 = 0;
  const pending = [];
  for (let i = 0; i < p.parts.length; i++) {
    const tri = ply.partTriangles(p, i);
    for (let k = 0; k < tri.length; k++) tris.push(tri[k]);
    const t1 = t0 + tri.length / 3;
    const m = mt.parts[i];
    let layers = [];
    if (!m || !m.layers) { gaps.add(m && m.bad ? 'RENDER_MATERIAL_BAD' : 'RENDER_MATERIAL_MISSING'); }
    else {
      if (m.layers.length < 2) gaps.add('RENDER_LAYERS_SHORT');
      const uvu = uvPerUnit(p, tri);
      for (const L of m.layers.slice(0, 2)) {
        const rec = L.diffuse ? texOf(L.diffuse, mipsMode) : null;
        if (!L.diffuse) gaps.add('RENDER_TEXTURE_MISSING');
        let tx = null;
        if (rec) {
          const big = Math.max(rec.info.width, rec.info.height);
          tx = decodeMix(rec, lodFor(big, rec.levels, tiling, uvu, sampleU), { keep, low: detailLow(big, rec.levels, uvu > 0 ? 1 / (tiling * uvu) : 0) });
        }
        layers.push({ tex: tx ? tx.id : -1, tex2: -1, mf: 0, flat: null, color: L.color.slice(0, 3), name: L.diffuse || null });
      }
    }
    parts.push({ t0, t1, layers, material: m ? m.material : null });
    pending.push(parts[parts.length - 1]);
    t0 = t1;
  }
  // flat colour: mean of the layer textures read, else the palette ground fill (the global textures are read below and
  // never feed it)
  const means = [...texByName.values()].filter(r => r && r.mean).map(r => r.mean);
  let flat;
  if (means.length) flat = [0, 1, 2].map(c => Math.round(means.reduce((s, m) => s + m[c], 0) / means.length));
  else {
    const ras = require('../lib/raster'), pal = ras.palette();
    const t1 = (pal.ground.types || []).find(t => t.code === 1);
    try { flat = ras.color(t1 ? t1.fill : '#C8BC92').slice(0, 3); } catch (e) { flat = [200, 188, 146]; }
  }
  for (const pt of parts) {
    if (!pt.layers.length) pt.layers = [{ tex: -1, flat, color: [255, 255, 255] }, { tex: -1, flat, color: [255, 255, 255] }];
    if (pt.layers.length === 1) pt.layers.push(pt.layers[0]);
    for (const L of pt.layers) {
      if (L.tex < 0 && !L.flat) {
        const rec = L.name ? texByName.get(texKey(L.name, mipsMode)) : null;
        L.flat = rec && rec.mean ? rec.mean.map(Math.round) : flat;
      }
      if (!L.flat) L.flat = flat;
    }
  }
  // global textures (GoH map head)
  let global = null;
  if (mt.global) {
    if (mt.global.normal) { gaps.add('RENDER_GLOBAL_NORMAL'); notes.push('Global Normalmap ' + mt.global.normal + ' is not drawn (vertex normals used)'); }
    if (mt.global.diffuse) {
      const rec = texOf(mt.global.diffuse, 'file');
      if (!rec) gaps.add('RENDER_GLOBAL_MISSING');
      else {
        const px = Math.max(pl.size[0], pl.size[1]) * SS, big = Math.max(rec.info.width, rec.info.height);
        const mip = big > px ? Math.min(rec.levels - 1, Math.floor(Math.log2(big / px))) : 0;
        const tx = decodeMip(rec, mip);
        if (tx) global = { tex: tx.file, box: pl.box.slice(), name: mt.global.diffuse };
        else gaps.add('RENDER_GLOBAL_MISSING');
      }
    }
  }
  // mesh grid: x, world y (= -mesh y), z, normal (mesh frame), uv0, colour r g b a
  const P = V.position, N = V.normal, U = V.uv0, C = V.color;
  if (!C) gaps.add('RENDER_NO_VCOLOR');
  const mesh = new Float32Array(nv * 12);
  for (let k = 0; k < nv; k++) {
    const o12 = k * 12;
    mesh[o12] = P[k * 3]; mesh[o12 + 1] = -P[k * 3 + 1]; mesh[o12 + 2] = P[k * 3 + 2];
    if (N) { mesh[o12 + 3] = N[k * 3]; mesh[o12 + 4] = N[k * 3 + 1]; mesh[o12 + 5] = N[k * 3 + 2]; } else mesh[o12 + 5] = 1;
    if (U) { mesh[o12 + 6] = U[k * 2]; mesh[o12 + 7] = U[k * 2 + 1]; }
    if (C) { mesh[o12 + 8] = C[k * 4 + 2]; mesh[o12 + 9] = C[k * 4 + 1]; mesh[o12 + 10] = C[k * 4]; mesh[o12 + 11] = C[k * 4 + 3]; }   // bytes B G R A [I]
    else { mesh[o12 + 8] = 63.75; mesh[o12 + 9] = 63.75; mesh[o12 + 10] = 63.75; mesh[o12 + 11] = 255; }
  }
  let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
  for (let k = 0; k < tris.length; k++) {
    const q = tris[k] * 12;
    if (tris[k] >= nv) continue;
    const x = mesh[q], y = mesh[q + 1];
    if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y;
  }
  const mbox = mx0 <= mx1 ? [mx0, my0, mx1, my1] : null;
  const base = { cell: 1, ox: 0, oy: 0, sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {} };
  grids.set('mesh.mvg', Object.assign({ name: 'mesh', w: 12, h: nv, etype: 'f32', data: mesh }, base));
  grids.set('tris.mvg', Object.assign({ name: 'tris', w: 3, h: tris.length / 3, etype: 'u32', data: Uint32Array.from(tris) }, base));
  const dl = LIGHT.dir, dn = Math.hypot(dl[0], dl[1], dl[2]);
  const args = {
    W: pl.size[0], H: pl.size[1], x0: pl.box[0], yb: pl.box[1], sx: pl.cell, sy: pl.cellY, ss: SS,
    tiling, mul: MUL, gain: o.gain > 0 ? o.gain : GAIN, sun: LIGHT.sun, amb: LIGHT.amb, L: [-dl[0] / dn, -dl[1] / dn, -dl[2] / dn],
    mesh: 'mesh.mvg', tris: 'tris.mvg', texs: texList, global, mbox,
    parts: parts.map(pt => ({ t0: pt.t0, t1: pt.t1, layers: pt.layers.map(L => ({ tex: L.tex, tex2: L.tex2 >= 0 ? L.tex2 : -1, mf: L.mf || 0, flat: L.flat, color: L.color })) })),
  };
  const files = Object.assign({ 'map.ply': hash }, mt.files);
  // counts after the global block: textures = distinct names asked for (layers and global), texturesRead = those decoded
  const names = new Set(), read = new Set();
  for (const [k, r] of texByName) { const n = k.split('\u0000')[0]; names.add(n); if (r && r.mean) read.add(n); }
  const detailTextures = [...detailTex].map(([name, k]) => ({ name, k })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { pl, size, target, args, grids, gaps, notes, files,
    stats: { parts: parts.length, vertices: nv, triangles: tris.length / 3, textures: names.size, texturesRead: read.size, decoded: texList.length, mips: mipsMode,
      detail: detailMode, keep, detailTextures, detailChanged: detailMode === 'map' && detailTextures.length > 0 } };
}

// Edge pixels: the world box of the picture and the box of the ground mesh differ by a few to tens of units (mesh box
// minus world box, west/south/east/north: AS2 multi maps start 9.5 u inside on the west and south and run 9.5 u past on
// the east and north, a shift; GoH 1v1_riverbank runs 35.5 u past on the west and stops 35.5 u short on the east; GoH
// 2v2_stalingrad stops 4.5 u short on the west and 50.1 u on the east), so the outermost columns and rows would be cut or
// empty: transparent or half-transparent lines on the picture edge. A pixel that is not fully covered and lies past the
// mesh box by at most FILL_U (pixel centre to box) is laid over the colour of its mirror image across the edge of the
// pixels wholly inside the mesh box (row and column mirrored, then kept inside): alpha 255, the mesh's own colour where it
// covers. A mirror, not the edge pixel itself: copying one column over a band several pixels wide drew a frame of
// streaks. Farther pixels stay transparent. Holes inside the mesh box (RENDER_UNCOVERED) are never filled. Runs on the
// whole picture after the bands are joined: the same bytes for any band split.
const FILL_U = 64;
function fillEdges(data, W, H, A, lim) {
  const mb = A.mbox, out = { filled: 0, beyond: 0 };
  if (!mb) return out;
  const x0 = A.x0, yb = A.yb, sx = A.sx, sy = A.sy, e = 1e-6;
  const ia = Math.max(0, Math.ceil((mb[0] - x0) / sx - e)), ib = Math.min(W - 1, Math.floor((mb[2] - x0) / sx + e) - 1);
  const ja = Math.max(0, Math.ceil((mb[1] - yb) / sy - e)), jb = Math.min(H - 1, Math.floor((mb[3] - yb) / sy + e) - 1);
  if (ia > ib || ja > jb) return out;
  // mirror of index t across the edge of [lo, hi] (lo - 1 -> lo, lo - 2 -> lo + 1, ...), kept inside it
  const mir = (t, lo, hi) => (t < lo ? Math.min(hi, 2 * lo - 1 - t) : t > hi ? Math.max(lo, 2 * hi + 1 - t) : t);
  for (let j = 0; j < H; j++) {
    const inJ = j >= ja && j <= jb, cy = yb + (j + 0.5) * sy, dy = Math.max(mb[1] - cy, 0, cy - mb[3]);
    const cj = mir(j, ja, jb);
    for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 4, a = data[k + 3];
      if (a === 255 || (inJ && i >= ia && i <= ib)) continue;
      const cx = x0 + (i + 0.5) * sx, dx = Math.max(mb[0] - cx, 0, cx - mb[2]);
      const n = (cj * W + mir(i, ia, ib)) * 4;
      if (Math.hypot(dx, dy) > lim || data[n + 3] !== 255) { out.beyond++; continue; }
      for (let c = 0; c < 3; c++) data[k + c] = Math.round((data[k + c] * a + data[n + c] * (255 - a)) / 255);
      data[k + 3] = 255;
      out.filled++;
    }
  }
  return out;
}

function memIo(grids, prog) {
  return {
    readGrid: f => { const g = grids.get(f); if (!g) throw new Error('render/l1: no grid ' + f); return g; },
    writeGrid: (f, g) => { grids.set(f, g); },
    readPng() { throw new Error('render/l1: no png here'); },
    writePng() { throw new Error('render/l1: no png here'); },
    progress: prog || { check() {}, stage() {}, step() {}, set() {} },
  };
}

async function l1(src, doc, o) {
  o = o || {};
  const M = mv();
  if (!src || typeof src.read !== 'function') throw new M.MvError('MV_USAGE', 'render l1 needs a mapkit source', { code: 'RENDER_SRC' });
  if (!doc || !doc.key) throw new M.MvError('MV_USAGE', 'render l1 needs the mapdoc of the map', { code: 'RENDER_DOC' });
  const prog = o.progress || null;
  const t0 = Date.now();
  if (prog) prog.stage('read', 1);
  const pr = prepare(src, doc, o);
  const tPrep = Date.now() - t0;
  const W = pr.args.W, H = pr.args.H;
  const bandRows = o.band > 0 ? Math.floor(o.band) : 256;
  const bands = [];
  for (let y = 0; y < H; y += bandRows) bands.push([y, Math.min(H, y + bandRows)]);
  if (prog) prog.stage('draw', bands.length);
  let pool = null, ownPool = false;
  if (o.pool && typeof o.pool === 'object' && typeof o.pool.run === 'function') pool = o.pool;
  else if (Number(o.pool) > 0) { pool = require('../jobs/pool').create({ n: Number(o.pool), cancelFlag: o.cancelFlag }); ownPool = true; }
  const results = new Map();
  if (!pool) {
    const k = require('./l1tile'), io = memIo(pr.grids, prog);
    for (const [y0, y1] of bands) {
      const name = 'band-' + y0 + '.mvg';
      k.run({ v: 1, kernel: KERNEL, inputs: [], args: Object.assign({}, pr.args, { y0, y1, outName: name }), out: '' }, io);
      results.set(y0, pr.grids.get(name));
      if (prog) prog.step(1);
    }
  } else {
    const dir = fs.mkdtempSync(path.join(o.workDir || os.tmpdir(), 'mapviz-l1-'));
    const gf = require('../lib/raster/gridfile');
    try {
      for (const [f, g] of pr.grids) gf.write(path.join(dir, f), g);
      const inputs = [...pr.grids.keys()];
      const runs = bands.map(([y0, y1]) => {
        const name = 'band-' + y0 + '.mvg';
        return pool.run(KERNEL, { inputs, args: Object.assign({}, pr.args, { y0, y1, outName: name }), out: dir }).then(r => {
          if (prog) { try { prog.step(1); } catch (e) { /* cancel seen below */ } }
          return { y0, name, r };
        });
      });
      const done = await Promise.all(runs);
      for (const d of done) {
        if (d.r.code === 5) throw new M.MvError('MV_CANCELLED', 'render l1 cancelled');
        if (d.r.code !== 0) throw new M.MvError('MV_FAULT', 'render l1 kernel failed (exit ' + d.r.code + '): ' + String(d.r.stderr || '').trim().slice(-400), { code: 'RENDER_KERNEL' });
        results.set(d.y0, gf.read(path.join(dir, d.name)));
      }
    } finally {
      if (ownPool) await pool.close();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ }
    }
  }
  const data = new Uint8ClampedArray(W * H * 4);
  let uncovered = 0, outside = 0;
  for (const [y0] of bands) {
    const b = results.get(y0);
    data.set(b.data, y0 * W * 4);
    uncovered += (b.meta && b.meta.uncovered) || 0;
    outside += (b.meta && b.meta.outside) || 0;
  }
  const edge = fillEdges(data, W, H, pr.args, FILL_U);
  const pl = pr.pl;
  const meta = { rung: 'l1', env: LIGHT.name, gain: pr.args.gain, tiling: pr.args.tiling };
  if (pl.cellY !== pl.cell) meta.cellY = pl.cellY;
  const grid = { name: 'pic.l1', w: W, h: H, cell: pl.cell, ox: pl.box[0], oy: pl.box[1], etype: 'rgba8', sample: 'cell', scale: 1, offset: 0,
    nodata: null, meta, data };
  if (uncovered) { pr.gaps.add('RENDER_UNCOVERED'); pr.notes.push(uncovered + ' pixels wholly inside the mesh box are not fully covered by the ground mesh'); }
  if (outside) {
    pr.notes.push(outside + ' edge pixels are cut by or lie past the ground mesh border: ' + edge.filled + ' take the colour of their mirror image inside the mesh (at most ' +
      FILL_U + ' u past the mesh)' + (edge.beyond ? ', ' + edge.beyond + ' farther stay transparent' : ''));
  }
  const goh = pr.target === 'goh';
  const gaps = [...pr.gaps].sort();
  const sidecar = {
    v: 1, layer: 'pic.l1', w: W, h: H, box: pl.box.slice(), cell: pl.cell, rowOrder: 'minY-first', target: pr.target,
    stackHash: (doc.stack && doc.stack.hash) || src.stackHash || null, mapHashes: pr.files, rung: 'l1', env: LIGHT.name, gaps,
    approx: goh || gaps.some(g => g !== 'RENDER_UNCOVERED'), brightness: goh ? 'unverified' : 'fitted', made: o.made || new Date().toISOString(),
    size: pr.size,
    // the map-scale detail rule (DETAIL): mode, the picture keep, the textures it changed ({name, k < 1}, by name) and
    // detailChanged (some texture is no longer the GPU rule alone; approx stays the gaps flag)
    detail: pr.stats.detail, keep: pr.stats.keep, detailTextures: pr.stats.detailTextures.map(t => ({ name: t.name, k: t.k })), detailChanged: pr.stats.detailChanged,
  };
  if (pl.cellY !== pl.cell) sidecar.cellY = pl.cellY;
  if (pr.notes.length) sidecar.notes = pr.notes.slice(0, 50);
  const stats = Object.assign({}, pr.stats, { bands: bands.length, pool: pool ? pool.n || true : 0, msPrepare: tPrep, ms: Date.now() - t0, uncovered, outside,
    edgeFilled: edge.filled, edgeTransparent: edge.beyond });
  return { grid, sidecar, stats };
}

module.exports = { l1, prepare, KERNEL, TILING, MUL, GAIN, LIGHT, SS, DETAIL, detailKeep, detailLow, lumStd, mipFor, lodFor, fileLevels, chainLevels, fillEdges, FILL_U, uvPerUnit, targetOf };
