// render L4 (MV-R3): light and shadow over the L3 picture (render.md freeze draft 2.1, 2.2, 3.1, 3.2, 4.4; design 7 L4).
// Reached through the optional require of index.js and cli.js (R2a); this file needs nothing from them.
//   l4(src, doc, o) -> Promise<{grid (rgba8 'pic.l4'), sidecar, stats}>
//     o = {size (2048), mode?, base? (an l3 result {grid, sidecar, aux:{n, z}}, from? 'in'), pack? (see readPackL4),
//          grids? (mapkit grids of the mode; height used), light? ('clean' default | 'mode' | a light object, env.js),
//          grass? (false), shadowSize? (2048, 512..8192), pool? (a jobs pool or a number of children), band? (rows per task,
//          256), progress?, cancelFlag?, made?, workDir?}
//   envLight(src, doc, mode?)   re-exported from env.js
//   readPackL4(x) -> {json, pos, uv0, idx, inst:[{geom, uid, flags, m}]}   x = a folder holding pack.json + pack.bin,
//     {json, bin: Buffer}, or the object pack.js readPack returns (json fields at the top, typed arrays pos, uv0, idx,
//     inst {count, geom, uid, flags, m}) (freeze draft 3.3 layout). A size, sha1, magic, version or section that does not
//     fit, or any other failure here -> MvError MV_FAULT, detail.code RENDER_PACK_BAD.
//   KERNEL 'render/l4tile', SHADOW (default 2048), GRASS_W 0.35, TRANSLUCENCY 0.3, BIAS_TEXELS 2
// Rules (draft 4.4; as64 = mowas2; goh the same unless said):
//   Base: o.base used when its w, h, box and cell are those of plan(doc, {size}) and it carries aux n and z; else l3 is
//   drawn in process (require './l3'; absent -> MV_NOT_BUILT, detail {code: RENDER_NOT_BUILT, rung: 'l3'}).
//   Pack: o.pack, else built in process (require './pack'; absent -> MV_NOT_BUILT rung 'pack').
//   Shadow: one orthographic map of shadowSize^2 texels along the sun, square texels over the projection of the world box
//   between the lowest and highest z of the ground and the casters. Casters: pack instances whose def l3 drew (state
//   'drawn'; 'unit' and 'skinned' and instance flags unit or skinned only when pic.l3.json units is true), materials with
//   blend 'none' (opaque) and 'test' (alpha-tested at alpharef against the texture alpha, read here from textures[].key);
//   blend 'blend' materials cast nothing [I]; plus the ground from the height lattice. An instance whose world box spans
//   under one texel in both map axes is culled [I]. 4-tap PCF, slope-scaled bias: 2 texels + 1.5 texels x min(tan a, 8),
//   a = the angle between the receiver normal and the sun [I; T: acne or peter-panning in game pictures]. Part iOff is
//   relative to its geom's iOff (pack.js). Receivers at (x, y, l3.z).
//   Relight (l4tile): p4 = tune(p3 x (sunE x max(N.LE, 0) x S + ambE) / max(f0(N), amb0)); f0 = the l1 bake light;
//   water N up; foliage translucency sunE x 0.3 x max(-N.LE, 0) x S [I], with the same back term at the bake light in
//   f0; kind 0 copied. --light clean with no shadow gives p3 back exactly (the bake light and l1.LIGHT are equal).
//   Grass (o.grass): map.grs v1 (AS2, AS64: u32 per patch, pattern bits 0-11, variant 12-15, flag 0x08000000 ACTIVE
//   [V]) and v2 (GoH: 'VER-' 2, 'SEED' u32, then 5 bytes per patch:
//   u16 pattern, u8 variant, u8 seed byte, u8 flags with 0x08 ACTIVE [I data probe of 263 GoH files: flags 8 exactly where
//   the pattern is not 0, byte count exact]); patch (i, j) covers world x [(left + i) cell, +cell), y [(top + j) cell, +cell)
//   [I]. A pattern's colour = the mean
//   of its grass.set models' diffuse textures (texels at or above alpharef, default 128; the model's texmod frame
//   `<texture>#<texmod>` when present) [I]. Ground pixels (kind 1) move toward that colour, as an object drawn with it
//   (x 2 x gain x f0), by 0.35 x the active share of the pixel's 2 x 2 samples [I]; then relit.
// Gap codes: RENDER_ENV_MISSING, RENDER_ENV_PLACEHOLDER (env.js), RENDER_GRASS_MISSING, RENDER_GRASS_BAD; the base
// picture's gaps are kept. Errors: MV_USAGE (RENDER_SIZE, RENDER_LIGHT, RENDER_SHADOW_SIZE, RENDER_SRC, RENDER_DOC),
// MV_FAULT (RENDER_PACK_BAD, RENDER_KERNEL), MV_NOT_BUILT (RENDER_NOT_BUILT), MV_CANCELLED.
// Author: Imperator_Aug (ARSENAL, ia-8e45baec)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const F = require('./frame');
const E = require('./env');

const KERNEL = 'render/l4tile';
const SHADOW = 2048, SHADOW_MIN = 512, SHADOW_MAX = 8192;
const GRASS_W = 0.35, TRANSLUCENCY = 0.3, BIAS_TEXELS = 2, BIAS_SLOPE = 1.5, TAN_MAX = 8;
const ALPHA_MAX = 256;   // the alpha of an alpha-tested caster texture is read at a mip of at most this size

function mv() { return require('../mapviz'); }
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const err = (code, msg, detail) => new (mv().MvError)(code, msg, detail);

// ------------------------------------------------------------------ scene pack (draft 3.3)
const SECT = { pos: 12, nrm: 12, uv0: 8, uv1: 8, idx: 4, inst: 64 };
function f32At(bin, off, n) {
  const a = new Float32Array(n);
  for (let k = 0; k < n; k++) a[k] = bin.readFloatLE(off + 4 * k);
  return a;
}
function u32At(bin, off, n) {
  const a = new Uint32Array(n);
  for (let k = 0; k < n; k++) a[k] = bin.readUInt32LE(off + 4 * k);
  return a;
}
function readPackL4(x) {
  try { return readPackL4x(x); } catch (e) {
    if (e instanceof mv().MvError) throw e;
    throw err('MV_FAULT', 'scene pack: ' + (e && e.message || e), { code: 'RENDER_PACK_BAD' });
  }
}
const isBytes = b => Buffer.isBuffer(b) || b instanceof Uint8Array;
const isTyped = a => ArrayBuffer.isView(a) && !(a instanceof DataView);
function readPackL4x(x) {
  const bad = why => err('MV_FAULT', 'scene pack: ' + why, { code: 'RENDER_PACK_BAD' });
  if (typeof x === 'string') {
    const jf = path.join(x, 'pack.json'), bf = path.join(x, 'pack.bin');
    if (!fs.existsSync(jf) || !fs.existsSync(bf)) throw bad('pack.json or pack.bin missing in the folder');
    let json = null;
    try { json = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { throw bad('pack.json unreadable'); }
    return readPackL4x({ json, bin: fs.readFileSync(bf) });
  }
  if (!x || typeof x !== 'object') throw bad('no pack given');
  const json = x.json || (x.kind === 'scenepack' ? x : null);
  if (!json || json.kind !== 'scenepack' || json.v !== 1) throw bad('pack.json is not a scenepack v 1');
  // {json, bin: bytes}: decode here. pack.js readPack form (json fields at the top, bin = the json's bin metadata, typed
  // arrays pos, idx, uv0, inst {count, geom, uid, flags, m}): taken below.
  if (x.json && isBytes(x.bin)) {
    const bin = Buffer.isBuffer(x.bin) ? x.bin : Buffer.from(x.bin.buffer, x.bin.byteOffset, x.bin.byteLength);
    const b = json.bin || {};
    if (bin.length !== b.bytes) throw bad('pack.bin holds ' + bin.length + ' bytes, pack.json says ' + b.bytes);
    if (b.sha1 && sha1(bin) !== b.sha1) throw bad('pack.bin sha1 differs from pack.json');
    if (bin.length < 8 || bin.toString('latin1', 0, 4) !== 'MVPK' || bin.readUInt32LE(4) !== 1) throw bad('pack.bin magic or version');
    const S = b.sections || {}, out = { json };
    for (const k of Object.keys(SECT)) {
      const s = S[k];
      if (!s) { if (k === 'pos' || k === 'idx' || k === 'inst') throw bad('section ' + k + ' missing'); continue; }
      if (!(Number.isInteger(s.off) && Number.isInteger(s.count) && s.off >= 8 && s.count >= 0 && s.off + s.count * SECT[k] <= bin.length)) throw bad('section ' + k + ' out of the file');
    }
    out.pos = f32At(bin, S.pos.off, S.pos.count * 3);
    out.uv0 = S.uv0 ? f32At(bin, S.uv0.off, S.uv0.count * 2) : null;
    out.idx = u32At(bin, S.idx.off, S.idx.count);
    out.inst = [];
    for (let k = 0; k < S.inst.count; k++) {
      const o = S.inst.off + k * 64;
      out.inst.push({ geom: bin.readUInt32LE(o), uid: bin.readUInt32LE(o + 4), flags: bin.readUInt32LE(o + 8), m: Array.from(f32At(bin, o + 16, 12)) });
    }
    return out;
  }
  // an already read pack with typed arrays (readPack of pack.js, R2b)
  const arr = k => x[k] || (x.arrays && x.arrays[k]) || (x.sections && x.sections[k]) || null;
  const pos = arr('pos'), idx = arr('idx');
  let inst = arr('inst');
  if (!pos || !idx || !inst) throw bad('the read pack has no pos, idx and inst arrays');
  if (!Array.isArray(inst) && !isTyped(inst) && Number.isInteger(inst.count) && isTyped(inst.geom) && isTyped(inst.uid) && isTyped(inst.flags) && isTyped(inst.m)) {
    // pack.js readPack: column arrays
    const c = inst;
    if (c.geom.length < c.count || c.uid.length < c.count || c.flags.length < c.count || c.m.length < c.count * 12) throw bad('the read pack inst arrays are shorter than count');
    inst = Array.from({ length: c.count }, (_, i) => ({ geom: c.geom[i], uid: c.uid[i], flags: c.flags[i], m: Array.from(c.m.subarray(i * 12, i * 12 + 12)) }));
  } else if (!Array.isArray(inst)) {
    // raw 64-byte records (bytes only)
    if (!isBytes(inst)) throw bad('the read pack inst is neither rows, columns nor 64-byte records');
    const b = Buffer.isBuffer(inst) ? inst : Buffer.from(inst.buffer, inst.byteOffset, inst.byteLength);
    const list = [];
    for (let o = 0; o + 64 <= b.length; o += 64) list.push({ geom: b.readUInt32LE(o), uid: b.readUInt32LE(o + 4), flags: b.readUInt32LE(o + 8), m: Array.from(f32At(b, o + 16, 12)) });
    inst = list;
  }
  return { json, pos: Float32Array.from(pos), uv0: arr('uv0') ? Float32Array.from(arr('uv0')) : null, idx: Uint32Array.from(idx), inst };
}

// ------------------------------------------------------------------ texture helpers
function lc(s) { return String(s).toLowerCase(); }
// a texture name or key -> resource key through mats.texture; '$/' = texture/common/ [I: the vanilla keys sit there]
function texRec(src, name) {
  const M = require('./mats');
  let n = String(name).replace(/\\/g, '/');
  if (/^\$\//.test(n)) n = '/texture/common/' + n.slice(2);
  return M.texture(src, n);
}
// small rgba of a dds buffer: the first file mip of at most ALPHA_MAX per side, else level 0 box-scaled
function smallRgba(buf) {
  const dds = require('../../lib/model/dds'), L1 = require('./l1');
  const info = dds.parse(buf);
  if (!info || info.error) return null;
  const file = L1.fileLevels(info, buf.length);
  let m = 0;
  while (m + 1 < file && Math.max(info.width >> (m + 1), info.height >> (m + 1)) >= 1 && Math.max(info.width >> m, info.height >> m) > ALPHA_MAX) m++;
  const d = dds.decode(buf, { mip: m });
  if (!d || d.error || !d.rgba) return null;
  let w = d.width, h = d.height, rgba = d.rgba;
  if (Math.max(w, h) > ALPHA_MAX) { const s = dds.downscale(rgba, w, h, ALPHA_MAX); w = s.width; h = s.height; rgba = s.rgba; }
  return { w, h, rgba };
}

// ------------------------------------------------------------------ grass (map.grs + grass.set)
function parseGrs(buf) {
  if (!buf || buf.length < 12 || buf.toString('latin1', 0, 4) !== 'GRAS') return { error: 'no GRAS tag' };
  let o = 4, ver = 1, seed = null;
  const tag = () => { const s = buf.toString('latin1', o, o + 4); o += 4; return s; };
  try {
    let t = tag();
    if (t === 'VER-') { ver = buf.readUInt32LE(o); o += 4; t = tag(); if (t === 'SEED') { seed = buf.readUInt32LE(o); o += 4; t = tag(); } }
    const names = [];
    if (t === 'PMAP') {
      const n = buf.readInt32LE(o); o += 4;
      if (n < 0 || n > 4096) return { error: 'pattern count ' + n };
      for (let k = 0; k < n; k++) { const l = buf[o]; names.push(buf.toString('latin1', o + 1, o + 1 + l)); o += 1 + l; }
    } else o -= 4;
    const r = [buf.readInt32LE(o), buf.readInt32LE(o + 4), buf.readInt32LE(o + 8), buf.readInt32LE(o + 12)]; o += 16;
    const cell = buf.readFloatLE(o); o += 4;
    const w = r[2] - r[0], h = r[3] - r[1];
    if (!(w > 0 && h > 0 && cell > 0)) return { error: 'empty footprint' };
    const per = ver >= 2 ? 5 : 4;
    if (buf.length - o !== w * h * per) return { error: 'patch bytes ' + (buf.length - o) + ', expected ' + w * h * per + ' (version ' + ver + ')' };
    const pat = new Int32Array(w * h).fill(-1);
    let active = 0;
    for (let k = 0; k < w * h; k++) {
      const p = o + k * per;
      let on, pt;
      if (per === 4) { const v = buf.readUInt32LE(p); on = (v & 0x08000000) !== 0; pt = v & 0xfff; } else { on = (buf[p + 4] & 0x08) !== 0; pt = buf.readUInt16LE(p) & 0xfff; }
      if (on) { pat[k] = pt; active++; }
    }
    return { ver, seed, names, rect: r, cell, w, h, pat, active };
  } catch (e) { return { error: 'cut short' }; }
}

function grassSetText(src) {
  const root = 'resource/set/';
  const read = (k, depth) => {
    const b = src.has(k) ? src.read(k) : null;
    if (!b) return '';
    return b.toString('latin1').replace(/\(\s*include\s+"([^"]+)"\s*\)/gi, (m, f) => (depth < 4 ? read(root + lc(f).replace(/^\/+/, ''), depth + 1) : ''));
  };
  return read(root + 'grass.set', 0);
}

function patternColours(src, names, notes) {
  const M = require('./mats');
  const text = grassSetText(src);
  const out = new Map();
  if (!text) { notes.push('grass.set absent: no grass colours'); return out; }
  let t = null;
  try { t = M.tree(M.strip(text)); } catch (e) { t = null; }
  if (!t) { notes.push('grass.set unreadable'); return out; }
  const unq = s => String(s).replace(/^"|"$/g, '');
  const models = new Map();
  for (const p of t.kids || []) {
    const ms = (p.kids || []).find(c => lc(c.k) === 'models');
    if (ms) models.set(lc(unq(p.k)), (ms.kids || []).map(c => [lc(unq(c.k)), c.v.length ? lc(unq(c.v[0])) : null]));
  }
  const ents = src.keys('resource/entity/');
  // one pass over the entity keys: model -> folder, folder -> its own .mtl keys (not those of sub folders)
  const folderOf = new Map(), mtlOf = new Map();
  for (const k of ents) {
    const m = /^(.*\/)([^/]+)\/\2\.def$/.exec(k);
    if (m && !folderOf.has(m[2])) folderOf.set(m[2], m[1] + m[2] + '/');
    if (k.endsWith('.mtl')) {
      const f = k.slice(0, k.lastIndexOf('/') + 1);
      if (!mtlOf.has(f)) mtlOf.set(f, []);
      mtlOf.get(f).push(k);
    }
  }
  const colourOfModel = new Map();
  const modelColour = (model, texmod) => {
    const key = model + '\u0000' + (texmod || '');
    if (colourOfModel.has(key)) return colourOfModel.get(key);
    let col = null;
    const folder = folderOf.get(model);
    if (folder) {
      for (const mk of mtlOf.get(folder) || []) {
        let mt = null;
        try { mt = M.tree(M.strip(src.read(mk).toString('latin1'))); } catch (e) { mt = null; }
        const dn = mt && (mt.kids || []).find(c => lc(c.k) === 'diffuse');
        if (!dn || !dn.v.length) continue;
        const ar = (mt.kids || []).find(c => lc(c.k) === 'alpharef');
        const ref = ar && ar.v.length && Number.isFinite(Number(ar.v[0])) ? Number(ar.v[0]) : 128;
        const name = unq(dn.v[0]);
        const rec = (texmod && texRec(src, name + '#' + texmod)) || texRec(src, name);
        if (!rec || !rec.buf) continue;
        const px = smallRgba(rec.buf);
        if (!px) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let k = 0; k < px.rgba.length; k += 4) if (px.rgba[k + 3] >= ref) { r += px.rgba[k]; g += px.rgba[k + 1]; b += px.rgba[k + 2]; n++; }
        if (n) { col = [r / n, g / n, b / n]; break; }
      }
    }
    colourOfModel.set(key, col);
    return col;
  };
  names.forEach((nm, i) => {
    const list = models.get(lc(nm));
    if (!list || !list.length) return;
    const cs = list.map(([m, tm]) => modelColour(m, tm)).filter(Boolean);
    if (!cs.length) return;
    out.set(i, [0, 1, 2].map(c => cs.reduce((s, v) => s + v[c], 0) / cs.length));
  });
  return out;
}

// grass grid on the plan frame: rgb = pattern colour, a = round(GRASS_W x active share of 2 x 2 samples x 255)
function grassGrid(g, cols, pl) {
  const W = pl.size[0], H = pl.size[1];
  const data = new Uint8ClampedArray(W * H * 4);
  let touched = 0;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let r = 0, gg = 0, b = 0, n = 0;
      for (let q = 0; q < 4; q++) {
        const x = pl.box[0] + (i + 0.25 + 0.5 * (q & 1)) * pl.cell, y = pl.box[1] + (j + 0.25 + 0.5 * (q >> 1)) * pl.cellY;
        const ci = Math.floor(x / g.cell) - g.rect[0], cj = Math.floor(y / g.cell) - g.rect[1];
        if (ci < 0 || cj < 0 || ci >= g.w || cj >= g.h) continue;
        const p = g.pat[cj * g.w + ci];
        if (p < 0) continue;
        const c = cols.get(p);
        if (!c) continue;
        r += c[0]; gg += c[1]; b += c[2]; n++;
      }
      if (!n) continue;
      const k = (j * W + i) * 4;
      data[k] = Math.round(r / n); data[k + 1] = Math.round(gg / n); data[k + 2] = Math.round(b / n); data[k + 3] = Math.round(GRASS_W * n / 4 * 255);
      touched++;
    }
  }
  return { grid: { name: 'grass', w: W, h: H, cell: pl.cell, ox: pl.box[0], oy: pl.box[1], etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data }, touched };
}

// ------------------------------------------------------------------ main
function sameFrame(g, pl) {
  if (!g || !g.data) return false;
  const cy = g.meta && g.meta.cellY > 0 ? g.meta.cellY : g.cell;
  return g.w === pl.size[0] && g.h === pl.size[1] && Math.abs(g.ox - pl.box[0]) < 1e-6 && Math.abs(g.oy - pl.box[1]) < 1e-6 &&
    Math.abs(g.cell - pl.cell) < 1e-9 && Math.abs(cy - pl.cellY) < 1e-9;
}
function baseOk(b, pl) {
  return !!(b && b.grid && b.aux && b.aux.n && b.aux.z && b.grid.etype === 'rgba8' && b.aux.n.etype === 'rgba8' && b.aux.z.etype === 'f32' &&
    sameFrame(b.grid, pl) && b.aux.n.w === pl.size[0] && b.aux.n.h === pl.size[1] && b.aux.z.w === pl.size[0] && b.aux.z.h === pl.size[1]);
}

function memIo(grids, prog) {
  return {
    readGrid: f => { const g = grids.get(f); if (!g) throw new Error('render/l4: no grid ' + f); return g; },
    writeGrid: (f, g) => { grids.set(f, g); },
    readPng() { throw new Error('render/l4: no png here'); },
    writePng() { throw new Error('render/l4: no png here'); },
    progress: prog ? { check: () => prog.check && prog.check(), stage() {}, step() {}, set() {} } : { check() {}, stage() {}, step() {}, set() {} },
  };
}

function resolveLight(src, doc, o) {
  const x = o.light === undefined || o.light === null ? 'clean' : o.light;
  if (x === 'clean') return { light: E.clean(), gaps: [], notes: [], files: {} };
  if (x === 'mode') return E.envLight(src, doc, o.mode || null);
  if (typeof x === 'object') {
    const l = E.lightOf(x);
    if (l) return { light: l, gaps: [], notes: [], files: {} };
  }
  throw err('MV_USAGE', 'light must be clean, mode or a light object {dir, sun, amb}', { code: 'RENDER_LIGHT' });
}

// the caster set from a read pack: kernel arrays, instance rows, materials and alpha textures
function casters(src, pk, units, frameOf, texel, notes) {
  const J = pk.json || {};
  const defState = new Map((J.defs || []).map(d => [d.def, d.state]));
  const geomById = new Map((J.geoms || []).map((g, i) => [g.id !== undefined ? g.id : i, g]));
  const matIndex = new Map(), mats = [], alphas = [], alphaOf = new Map();
  const matById = new Map((J.materials || []).map((m, i) => [m.id !== undefined ? m.id : i, m]));
  const texById = new Map((J.textures || []).map((t, i) => [t.id !== undefined ? t.id : i, t]));
  const nv = pk.pos.length / 3;
  const tris = [];
  const kGeom = new Map(), kGeoms = [];
  const matOf = id => {
    if (matIndex.has(id)) return matIndex.get(id);
    const m = matById.get(id);
    let e = { cast: true, test: false, alpharef: 128, tex: -1 };
    if (m) {
      if (m.blend === 'blend') e = { cast: false, test: false, alpharef: 0, tex: -1 };
      else if (m.blend === 'test' || m.a2c) {
        const ref = Number.isFinite(m.alpharef) ? m.alpharef : 128;
        e = { cast: true, test: true, alpharef: ref, tex: -1 };
        const t = m.tex !== null && m.tex !== undefined ? texById.get(m.tex) : null;
        if (t && t.key) {
          if (!alphaOf.has(t.key)) {
            let a = null;
            const rec = texRec(src, t.key);
            const px = rec && rec.buf ? smallRgba(rec.buf) : null;
            if (px) {
              const d = new Uint8Array(px.w * px.h);
              for (let k = 0; k < d.length; k++) d[k] = px.rgba[k * 4 + 3];
              a = alphas.length;
              alphas.push({ name: 'alpha', w: px.w, h: px.h, cell: 1, ox: 0, oy: 0, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: { key: t.key }, data: d });
            } else notes.push('caster texture ' + t.key + ' unreadable: its material casts as opaque');
            alphaOf.set(t.key, a);
          }
          const a = alphaOf.get(t.key);
          if (a === null) e = { cast: true, test: false, alpharef: 0, tex: -1 }; else e.tex = a;
        } else e.test = false;
      }
    }
    const k = mats.length; mats.push(e); matIndex.set(id, k); return k;
  };
  const geomFor = gid => {
    if (kGeom.has(gid)) return kGeom.get(gid);
    const g = geomById.get(gid);
    let k = -1;
    if (g) {
      const st = defState.get(g.def);
      const draw = st === 'drawn' || ((st === 'unit' || st === 'skinned') && units);
      if (draw && !(g.skinned && !units)) {
        const ranges = [];
        const parts = Array.isArray(g.parts) && g.parts.length ? g.parts : [{ mat: null, iOff: 0, iCount: g.iCount }];
        for (const p of parts) {
          // part iOff is relative to the geom's iOff (pack.js geometry(), as l3.js and l3tile.js read it)
          const i0 = g.iOff + p.iOff;
          const t0 = tris.length / 3;
          for (let q = i0; q + 2 < i0 + p.iCount; q += 3) {
            if (q + 2 >= pk.idx.length) break;
            tris.push(pk.idx[q] + g.vOff, pk.idx[q + 1] + g.vOff, pk.idx[q + 2] + g.vOff);
          }
          const tc = tris.length / 3 - t0;
          if (tc) ranges.push([t0, tc, p.mat === null || p.mat === undefined ? matOfOpaque() : matOf(p.mat)]);
        }
        k = kGeoms.length;
        kGeoms.push({ tris: ranges, box: g.box || null });
      }
    }
    kGeom.set(gid, k);
    return k;
  };
  let opaqueIdx = -1;
  function matOfOpaque() { if (opaqueIdx < 0) { opaqueIdx = mats.length; mats.push({ cast: true, test: false, alpharef: 0, tex: -1 }); } return opaqueIdx; }
  const rows = [];
  let culled = 0, cast = 0, zlo = Infinity, zhi = -Infinity;
  for (const it of pk.inst) {
    if ((it.flags & 3) && !units) continue;
    const k = geomFor(it.geom);
    if (k < 0) continue;
    const g = kGeoms[k], m = it.m;
    if (g.box) {
      let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
      for (let c = 0; c < 8; c++) {
        const x = g.box[c & 1 ? 3 : 0], y = g.box[c & 2 ? 4 : 1], z = g.box[c & 4 ? 5 : 2];
        const wx = m[0] * x + m[1] * y + m[2] * z + m[3], wy = m[4] * x + m[5] * y + m[6] * z + m[7], wz = m[8] * x + m[9] * y + m[10] * z + m[11];
        const st = frameOf(wx, wy, wz);
        if (st[0] < s0) s0 = st[0]; if (st[0] > s1) s1 = st[0]; if (st[1] < t0) t0 = st[1]; if (st[1] > t1) t1 = st[1];
        if (wz < zlo) zlo = wz; if (wz > zhi) zhi = wz;
      }
      if (texel && s1 - s0 < texel && t1 - t0 < texel) { culled++; continue; }
    }
    rows.push(k, ...m);
    cast++;
  }
  return { geoms: kGeoms, mats, alphas, tris: Uint32Array.from(tris), rows: Float32Array.from(rows), cast, culled, zlo, zhi, nv };
}

async function l4(src, doc, o) {
  o = o || {};
  const M = mv();
  if (!src || typeof src.read !== 'function') throw err('MV_USAGE', 'render l4 needs a mapkit source', { code: 'RENDER_SRC' });
  if (!doc || !doc.key) throw err('MV_USAGE', 'render l4 needs the mapdoc of the map', { code: 'RENDER_DOC' });
  const t0 = Date.now(), prog = o.progress || null;
  const size = o.size === undefined ? 2048 : o.size;
  const pl = F.plan(doc, { size });
  const N = o.shadowSize === undefined ? SHADOW : Number(o.shadowSize);
  if (!(Number.isInteger(N) && N >= SHADOW_MIN && N <= SHADOW_MAX)) throw err('MV_USAGE', 'shadow size must be an integer ' + SHADOW_MIN + '..' + SHADOW_MAX + ' px', { code: 'RENDER_SHADOW_SIZE' });
  if (o.grass !== undefined && typeof o.grass !== 'boolean') throw err('MV_USAGE', 'grass must be true or false', { code: 'RENDER_GRASS' });
  const target = src.target || doc.game || null;
  const L = resolveLight(src, doc, o);
  const gaps = new Set(L.gaps), notes = L.notes.slice(), files = Object.assign({}, L.files);
  if (prog) prog.stage('read', 1);
  const grids = o.grids || require('../lib/mapkit').grids(src, doc.key, { mode: o.mode || undefined });
  const height = grids && grids.height || null;
  // base: pic.l3 + aux
  let base = o.base || null, baseFrom = base ? (o.base.from === 'in' || o.baseFrom === 'in' ? 'in' : 'given') : 'drawn';
  if (base && !baseOk(base, pl)) { notes.push('the given l3 picture is not on the plan frame of size ' + size + ' (or has no l3.n, l3.z): drawn again'); base = null; baseFrom = 'drawn'; }
  // pack
  let pk = null;
  if (o.pack) pk = readPackL4(o.pack);
  if (!base) {
    const l3m = M.opt(() => require('./l3'), './l3', __filename);
    if (!l3m) throw err('MV_NOT_BUILT', 'render l3 is not built', { code: 'RENDER_NOT_BUILT', rung: 'l3' });
    base = await l3m.l3(src, doc, { size, mode: o.mode, pack: o.pack, grids, pool: o.pool, cancelFlag: o.cancelFlag, made: o.made });
    baseFrom = 'drawn';
    if (!baseOk(base, pl)) throw err('MV_FAULT', 'render l3 gave a picture off the plan frame', { code: 'RENDER_KERNEL' });
  }
  if (!pk) {
    const pm = M.opt(() => require('./pack'), './pack', __filename);
    if (!pm) throw err('MV_NOT_BUILT', 'render pack is not built', { code: 'RENDER_NOT_BUILT', rung: 'pack' });
    const r = await pm.pack(src, doc, { mode: o.mode, progress: prog, cancelFlag: o.cancelFlag, made: o.made });
    pk = readPackL4({ json: r.json, bin: r.bin });
  }
  const bs = base.sidecar || {};
  for (const g of bs.gaps || []) gaps.add(g);
  const units = bs.units === true;
  // shadow frame
  const light = L.light;
  const Ls = E.worldSun(light);
  let e1 = [Ls[1], -Ls[0], 0];
  { const n = Math.hypot(e1[0], e1[1]); e1 = n > 1e-9 ? [e1[0] / n, e1[1] / n, 0] : [1, 0, 0]; }
  const e2 = [Ls[1] * e1[2] - Ls[2] * e1[1], Ls[2] * e1[0] - Ls[0] * e1[2], Ls[0] * e1[1] - Ls[1] * e1[0]];
  const proj = (x, y, z) => [x * e1[0] + y * e1[1] + z * e1[2], x * e2[0] + y * e2[1] + z * e2[2]];
  let hlo = Infinity, hhi = -Infinity;
  if (height) {
    const sc = height.scale === undefined ? 1 : height.scale, of = height.offset || 0, nd = height.nodata;
    for (let k = 0; k < height.data.length; k++) { const v = height.data[k]; if (nd !== null && nd !== undefined && v === nd) continue; const z = v * sc + of; if (z < hlo) hlo = z; if (z > hhi) hhi = z; }
  }
  const zl = base.aux.z, znd = zl.nodata;
  for (let k = 0; k < zl.data.length; k++) { const z = zl.data[k]; if (znd !== null && znd !== undefined && z === znd) continue; if (z < hlo) hlo = z; if (z > hhi) hhi = z; }
  if (!(hlo <= hhi)) { hlo = 0; hhi = 0; }
  // first pass without culling to get the caster z range, then the frame, then the cull
  const pre = casters(src, pk, units, proj, 0, []);
  const zmin = Math.min(hlo, pre.zlo), zmax = Math.max(hhi, pre.zhi);
  let s0 = Infinity, s1 = -Infinity, ta = Infinity, tb = -Infinity;
  for (let c = 0; c < 8; c++) {
    const p = proj(pl.box[c & 1 ? 2 : 0], pl.box[c & 2 ? 3 : 1], c & 4 ? zmax : zmin);
    if (p[0] < s0) s0 = p[0]; if (p[0] > s1) s1 = p[0]; if (p[1] < ta) ta = p[1]; if (p[1] > tb) tb = p[1];
  }
  const ext = Math.max(s1 - s0, tb - ta, 1e-6) * (1 + 2 / N);
  const texel = ext / N;
  const sc0 = (s0 + s1) / 2 - ext / 2, tc0 = (ta + tb) / 2 - ext / 2;
  const C = casters(src, pk, units, proj, texel, notes);
  const bias = BIAS_TEXELS * texel;
  // grass
  let grassInfo = { on: !!o.grass, file: null, patches: 0, active: 0 }, grassG = null;
  if (o.grass) {
    const key = 'resource/map/' + doc.key + '/map.grs';
    const buf = src.has(key) ? src.read(key) : null;
    if (!buf) { gaps.add('RENDER_GRASS_MISSING'); notes.push('grass on: map.grs absent, no tint'); }
    else {
      files[key] = sha1(buf);
      grassInfo.file = 'map.grs';
      const g = parseGrs(buf);
      if (g.error) { gaps.add('RENDER_GRASS_BAD'); notes.push('map.grs unreadable (' + g.error + '), no tint'); }
      else {
        grassInfo.patches = g.w * g.h; grassInfo.active = g.active; grassInfo.version = g.ver;
        const cols = patternColours(src, g.names.length ? g.names : [], notes);
        if (!g.names.length) notes.push('map.grs has no pattern map: no grass colours');
        const gg = grassGrid(g, cols, pl);
        grassInfo.pixels = gg.touched; grassInfo.colours = cols.size;
        grassG = gg.grid;
      }
    }
  }
  // kernel grids
  const kg = new Map();
  const base0 = { cell: 1, ox: 0, oy: 0, sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {} };
  const withObjects = C.rows.length > 0 && C.tris.length > 0 && pk.pos.length > 0;
  const withUv = withObjects && pk.uv0 && pk.uv0.length === pk.pos.length / 3 * 2;
  if (withObjects) {
    kg.set('pk.pos.mvg', Object.assign({ name: 'pos', w: 3, h: pk.pos.length / 3, etype: 'f32', data: pk.pos }, base0));
    if (withUv) kg.set('pk.uv.mvg', Object.assign({ name: 'uv', w: 2, h: pk.uv0.length / 2, etype: 'f32', data: pk.uv0 }, base0));
    kg.set('pk.idx.mvg', Object.assign({ name: 'idx', w: 3, h: C.tris.length / 3, etype: 'u32', data: C.tris }, base0));
    kg.set('pk.inst.mvg', Object.assign({ name: 'inst', w: 13, h: C.rows.length / 13, etype: 'f32', data: C.rows }, base0));
  }
  C.alphas.forEach((a, i) => kg.set('alpha-' + i + '.mvg', a));
  if (height) kg.set('height.mvg', height);
  kg.set('pic.l3.mvg', base.grid); kg.set('l3.n.mvg', base.aux.n); kg.set('l3.z.mvg', base.aux.z);
  if (grassG) kg.set('grass.mvg', grassG);
  const shadowArgs = { op: 'shadow', N, s0: sc0, t0: tc0, texel, e1, e2, Ls, pos: withObjects ? 'pk.pos.mvg' : null, uv: withUv ? 'pk.uv.mvg' : null,
    idx: withObjects ? 'pk.idx.mvg' : null, inst: withObjects ? 'pk.inst.mvg' : null, geoms: C.geoms.map(g => ({ tris: g.tris })), mats: C.mats, alphas: C.alphas.map((a, i) => 'alpha-' + i + '.mvg'),
    height: height ? 'height.mvg' : null, outName: 'shadow.mvg' };
  const clean = E.clean(), L0 = E.worldSun(clean);
  const relArgs = { op: 'relight', W: pl.size[0], H: pl.size[1], x0: pl.box[0], yb: pl.box[1], sx: pl.cell, sy: pl.cellY, pic: 'pic.l3.mvg', n: 'l3.n.mvg', z: 'l3.z.mvg',
    shadow: 'shadow.mvg', N, s0: sc0, t0: tc0, texel, e1, e2, Ls, bias, biasSlope: BIAS_SLOPE * texel, tanMax: TAN_MAX, sunE: light.sun, ambE: light.amb, L0, sun0: clean.sun, amb0: clean.amb,
    LE: Ls, tune: light.tune, translucency: TRANSLUCENCY, grass: grassG ? 'grass.mvg' : null, gain: require('./l1').GAIN };
  const W = pl.size[0], H = pl.size[1];
  const bandRows = o.band > 0 ? Math.floor(o.band) : 256;
  const bands = [];
  for (let y = 0; y < H; y += bandRows) bands.push([y, Math.min(H, y + bandRows)]);
  let pool = null, ownPool = false;
  if (o.pool && typeof o.pool === 'object' && typeof o.pool.run === 'function') pool = o.pool;
  else if (Number(o.pool) > 0) { pool = require('../jobs/pool').create({ n: Number(o.pool), cancelFlag: o.cancelFlag }); ownPool = true; }
  const results = new Map();
  let shadowMeta = {};
  const tShadow0 = Date.now();
  let tShadow = 0;
  if (!pool) {
    const k = require('./l4tile'), io = memIo(kg, prog);
    if (prog) prog.stage('build', 1);
    k.run({ v: 1, kernel: KERNEL, inputs: [], args: shadowArgs, out: '' }, io);
    shadowMeta = kg.get('shadow.mvg').meta || {};
    tShadow = Date.now() - tShadow0;
    if (prog) { prog.step(1); prog.stage('draw', bands.length); }
    for (const [y0, y1] of bands) {
      const name = 'band-' + y0 + '.mvg';
      k.run({ v: 1, kernel: KERNEL, inputs: [], args: Object.assign({}, relArgs, { y0, y1, outName: name }), out: '' }, io);
      results.set(y0, kg.get(name));
      if (prog) prog.step(1);
    }
  } else {
    const dir = fs.mkdtempSync(path.join(o.workDir || os.tmpdir(), 'mapviz-l4-'));
    const gf = require('../lib/raster/gridfile');
    const check = r => {
      if (r.code === 5) throw err('MV_CANCELLED', 'render l4 cancelled');
      if (r.code !== 0) throw err('MV_FAULT', 'render l4 kernel failed (exit ' + r.code + '): ' + String(r.stderr || '').trim().slice(-400), { code: 'RENDER_KERNEL' });
    };
    try {
      for (const [f, g] of kg) gf.write(path.join(dir, f), g);
      const inputs = [...kg.keys()];
      if (prog) prog.stage('build', 1);
      check(await pool.run(KERNEL, { inputs, args: shadowArgs, out: dir }));
      shadowMeta = (gf.readHeader(path.join(dir, 'shadow.mvg')).meta) || {};
      tShadow = Date.now() - tShadow0;
      if (prog) { prog.step(1); prog.stage('draw', bands.length); }
      const runs = bands.map(([y0, y1]) => {
        const name = 'band-' + y0 + '.mvg';
        return pool.run(KERNEL, { inputs: inputs.concat('shadow.mvg'), args: Object.assign({}, relArgs, { y0, y1, outName: name }), out: dir }).then(r => {
          if (prog) { try { prog.step(1); } catch (e) { /* cancel seen below */ } }
          return { y0, name, r };
        });
      });
      const done = await Promise.all(runs);
      for (const d of done) { check(d.r); results.set(d.y0, gf.read(path.join(dir, d.name))); }
    } finally {
      if (ownPool) await pool.close();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ }
    }
  }
  const data = new Uint8ClampedArray(W * H * 4);
  let shadowed = 0, lit = 0, copied = 0;
  for (const [y0] of bands) {
    const b = results.get(y0);
    data.set(b.data, y0 * W * 4);
    shadowed += (b.meta && b.meta.shadowed) || 0; lit += (b.meta && b.meta.lit) || 0; copied += (b.meta && b.meta.copied) || 0;
  }
  const meta = { rung: 'l4', env: light.name };
  if (pl.cellY !== pl.cell) meta.cellY = pl.cellY;
  const grid = { name: 'pic.l4', w: W, h: H, cell: pl.cell, ox: pl.box[0], oy: pl.box[1], etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta, data };
  if (C.culled) notes.push(C.culled + ' instances under one shadow texel culled from the shadow map');
  const goh = target === 'goh';
  const gl = [...gaps].sort();
  const cp = k => (bs[k] === undefined ? null : bs[k]);
  const sidecar = {
    v: 1, layer: 'pic.l4', w: W, h: H, box: pl.box.slice(), cell: pl.cell, rowOrder: 'minY-first', target,
    stackHash: (doc.stack && doc.stack.hash) || src.stackHash || null, mapHashes: Object.assign({}, bs.mapHashes || {}, files), rung: 'l4', env: light.name, gaps: gl,
    approx: goh || gl.some(g => g !== 'RENDER_UNCOVERED'), brightness: goh || light.source !== 'clean' ? 'unverified' : 'fitted', made: o.made || new Date().toISOString(),
    size: Math.max(W, H),
    detail: cp('detail'), keep: cp('keep'), detailTextures: cp('detailTextures'), detailChanged: cp('detailChanged'),
    base: { layer: 'pic.l3', from: baseFrom, made: bs.made || null },
    light: { name: light.name, source: light.source, dir: light.dir.slice(), sun: light.sun.slice(), amb: light.amb.slice(), tune: light.tune ? Object.assign({}, light.tune) : null },
    shadow: { size: N, texelU: texel, casters: C.cast, culled: C.culled, filter: 'pcf4', biasU: bias, biasSlopeU: BIAS_SLOPE * texel, tanMax: TAN_MAX },
    grass: { on: grassInfo.on, file: grassInfo.file, patches: grassInfo.patches, active: grassInfo.active },
    units,
  };
  if (pl.cellY !== pl.cell) sidecar.cellY = pl.cellY;
  if (notes.length) sidecar.notes = notes.slice(0, 50);
  const stats = { bands: bands.length, pool: pool ? pool.n || true : 0, shadowSize: N, texelU: texel, casters: C.cast, culled: C.culled, casterTris: shadowMeta.tris || 0,
    groundTris: shadowMeta.groundTris || 0, shadowTexels: shadowMeta.texels || 0, shadowed, lit, copied, grass: grassInfo, light: light.name, msShadow: tShadow, ms: Date.now() - t0 };
  return { grid, sidecar, stats };
}

module.exports = { l4, envLight: E.envLight, readPackL4, parseGrs, patternColours, KERNEL, SHADOW, SHADOW_MIN, SHADOW_MAX, GRASS_W, TRANSLUCENCY, BIAS_TEXELS, BIAS_SLOPE, TAN_MAX };
