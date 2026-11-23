// model/picture: one door to every picture format the game ships, for the picture viewer (tools/gui/ext/view/kinds/picture.*)
// and its sweep test. Reads only, pure: the caller passes bytes (and, for the verdicts, the file's key and its neighbours' keys).
//   typeOf(name) -> 'dds' | 'tga' | 'bmp' | 'psd' | 'png' | 'jpg' | 'desc' (.ebm/.tex) | null
//   facts(type, buf, { game }?) -> header facts, cheap (the first bytes are enough for dds/tga/bmp/png; psd/jpg read further):
//     { format, width, height, mips, mipSizes, alpha ('yes'|'no'|'1-bit'|'maybe'), cube, volume, game: {ok, why}, error, ... }
//   decode(type, buf, { mip, face, maxSize, game }) -> { width, height, rgba, format, mip, mips, scaled, srcWidth, srcHeight, alphaUsed }
//     | { pass: 'image/png'|'image/jpeg' } (the browser draws those) | { error }
//   notes(f, { key, siblings, frames }) -> [{ code, msg, p }]: the game's verdicts in plain words (codes are worded on the page as
//     view.picture.n.<code>; msg is the English fallback)
//   winner(key, siblings) -> the key the game loads for that name (FMT-04: .tex > .ebm > last of .dds .tga .bmp .jpg .png)
// The game's rules [V]: (accepted DDS formats, sizes, mips, cube, volume, DXT sides multiple of 4)
//  (types, pixel sizes, palette, right-to-left ignored), (extension order)
//  (.bmp .jpg .png .hdr through the standard loader; no .psd anywhere).
// game (facts, decode opt): the game the verdict is for: 'as64' | 'mowas2' (the rules above, the default) | 'goh' (a vfs exe or
//   a GAMES kind also taken, lib/games). GoH also loads the two-channel BC5 forms, fourCC ATI2, BC5U and BC5S (GHFMT-03 [V],
//   ): under GoH they pass the game verdict (game.ok; BC5S gets no preview, dds.js does not decode it, and only GoH names it 'BC5 signed'); under AS2 they stay 'format' (the game warns
//   "Unknown DDS picture format" and shows the dummy). Every other rule is the same for the three games [I: GoH DDS rules beyond
//   GHFMT-03 are not noted].
// Author: Imperator_Aug (ARSENAL, ia-43fd451f)
'use strict';
const dds = require('./dds'), tga = require('./tga'), bmp = require('./bmp'), psd = require('./psd'), ebm = require('./ebm');

const EXT = { dds: 'dds', tga: 'tga', bmp: 'bmp', psd: 'psd', png: 'png', jpg: 'jpg', jpeg: 'jpg', ebm: 'desc', tex: 'desc' };
function typeOf(name) { const b = String(name || '').split('::').pop().split(/[\\/]/).pop(), i = b.lastIndexOf('.'); return i > 0 ? EXT[b.slice(i + 1).toLowerCase()] || null : null; }
const pow2 = n => n > 0 && (n & (n - 1)) === 0;
const base = k => String(k || '').split('/').pop();

// ---------------------------------------------------------------- DDS header facts (the game's own checks, in its order)
const FOUR = { DXT1: 'DXT1', DXT2: 'DXT2', DXT3: 'DXT3', DXT4: 'DXT4', DXT5: 'DXT5', ATI1: 'ATI1 (BC4)', ATI2: 'ATI2 (BC5)', BC4U: 'BC4', BC5U: 'BC5', DX10: 'DX10' };
const GOH_FOUR = /^(ATI2|BC5U|BC5S)$/;   // GHFMT-03: the BC5 forms GoH loads on top of DXT1-5
const isGoh = g => { if (!g) return false; const k = String(g).toLowerCase(); if (k === 'goh') return true; const e = require('../games').get(k); return !!e && e.kind === 'goh'; };
function rgbName(bits, m, flags) {
  const k = m.map(x => (x >>> 0).toString(16)).join(',');
  const T = { '32:ff0000,ff00,ff,ff000000': 'A8R8G8B8', '32:ff0000,ff00,ff,0': 'X8R8G8B8', '32:ff,ff00,ff0000,ff000000': 'A8B8G8R8', '32:ff,ff00,ff0000,0': 'X8B8G8R8',
    '32:ffffffff,0,0,0': 'R32F', '24:ff0000,ff00,ff,0': 'R8G8B8', '16:f800,7e0,1f,0': 'R5G6B5', '16:7c00,3e0,1f,8000': 'A1R5G5B5', '16:7c00,3e0,1f,0': 'X1R5G5B5',
    '16:f00,f0,f,f000': 'A4R4G4B4' };
  if (flags & 0x20000) return bits === 8 ? 'L8' : bits === 16 && m[3] ? 'A8L8' : 'L' + bits;
  if ((flags & 0x2) && !(flags & 0x40)) return 'A' + bits;
  return T[bits + ':' + k] || 'RGB ' + bits + '-bit';
}
function ddsFacts(buf, opt = {}) {
  if (!buf || buf.length < 128) return { error: 'too short for a DDS header (128 bytes)', format: 'DDS' };
  if (buf.toString('latin1', 0, 4) !== 'DDS ') return { error: 'no DDS magic', format: 'DDS' };
  const u = o => buf.readUInt32LE(o);
  const hsize = u(4), flags = u(8), height = u(12), width = u(16), mips = Math.max(1, u(28)), pfsize = u(76), pff = u(80), four = buf.toString('latin1', 84, 88), bits = u(88);
  const masks = [u(92), u(96), u(100), u(104)], caps2 = u(112);
  const f = { width, height, mips, cube: !!(caps2 & 0x200), faces: caps2 & 0x200 ? [0x400, 0x800, 0x1000, 0x2000, 0x4000, 0x8000].filter(b => caps2 & b).length : 1,
    volume: !!(flags & 0x800000), headerOk: hsize === 124 && pfsize === 32, fourCC: (pff & 4) ? four : null, bits, masks: (pff & 4) ? null : masks };
  f.format = (pff & 4) ? ((four === 'BC5S' && isGoh(opt.game) ? 'BC5 signed' : FOUR[four]) || (/^[\x20-\x7e]{4}$/.test(four) ? four : 'fourCC ' + u(84))) : rgbName(bits, masks, pff);
  if (f.fourCC === 'DX10' && buf.length >= 148) { f.dxgi = u(128); f.format = 'DX10 (DXGI ' + f.dxgi + ')'; }
  f.alpha = (pff & 4) ? (four === 'DXT1' ? '1-bit' : /^DXT[2-5]$/.test(four) ? 'yes' : 'no') : (masks[3] && (pff & 1 || (pff & 2))) ? 'yes' : 'no';
  f.compressed = !!(pff & 4) && /^DXT[1-5]$/.test(four);
  // the formats the game takes [V]: DXT1-5, or RGB 32-bit with these masks
  const game = f.fourCC ? /^DXT[1-5]$/.test(four) || (isGoh(opt.game) && GOH_FOUR.test(four)) : (pff & 0x40) && bits === 32 && ['A8R8G8B8', 'X8R8G8B8', 'A8B8G8R8', 'R32F'].includes(f.format);
  f.mipSizes = []; for (let i = 0, w = width, h = height; i < mips; i++, w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) f.mipSizes.push([w, h]);
  f.game = !f.headerOk ? { ok: false, why: 'header' } : f.fourCC === 'DX10' ? { ok: false, why: 'dx10' } : !game ? { ok: false, why: 'format' }
    : f.volume ? { ok: false, why: 'volume' } : f.cube && f.faces < 6 ? { ok: false, why: 'cubefaces' } : mips > 15 ? { ok: false, why: 'mips15' }
      : width > 8192 || height > 8192 ? { ok: false, why: 'big' } : (f.compressed || (f.fourCC && GOH_FOUR.test(four))) && ((width | height) & 3) ? { ok: false, why: 'dxt4' } : { ok: true };
  return f;
}
function ddsMipBytes(f, w, h) {
  if (f.compressed || /^ATI|^BC/.test(f.format) || /^BC5/.test(f.fourCC || '')) return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * (f.fourCC === 'DXT1' || f.fourCC === 'ATI1' || f.fourCC === 'BC4U' ? 8 : 16);
  return w * h * (f.bits >> 3);
}

// ---------------------------------------------------------------- other headers
function pngFacts(buf) {
  if (!buf || buf.length < 33 || buf[0] !== 0x89 || buf.toString('latin1', 1, 4) !== 'PNG') return { error: 'not a PNG file', format: 'PNG' };
  const ct = buf[25], depth = buf[24];
  let trns = false; for (let o = 8; o + 8 <= buf.length;) { const len = buf.readUInt32BE(o), t = buf.toString('latin1', o + 4, o + 8); if (t === 'tRNS') { trns = true; break; } if (t === 'IDAT' || t === 'IEND') break; o += 12 + len; }
  const CT = { 0: 'grey', 2: 'RGB', 3: 'palette', 4: 'grey + alpha', 6: 'RGBA' };
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), mips: 1, format: 'PNG ' + (CT[ct] || 'type ' + ct) + ' ' + depth + '-bit' + (buf[28] ? ' interlaced' : ''), alpha: ct === 4 || ct === 6 || trns ? 'yes' : 'no', game: { ok: true } };
}
function jpgFacts(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return { error: 'not a JPEG file', format: 'JPEG' };
  let o = 2;
  while (o + 9 < buf.length) {
    if (buf[o] !== 0xFF) { o++; continue; }
    const m = buf[o + 1]; if (m === 0xFF) { o++; continue; }
    if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { o += 2; continue; }
    const len = buf.readUInt16BE(o + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5), mips: 1, format: 'JPEG' + (m === 0xC2 ? ' progressive' : ''), alpha: 'no', game: { ok: true } };
    if (m === 0xDA) break;
    o += 2 + len;
  }
  return { format: 'JPEG', mips: 1, alpha: 'no', game: { ok: true }, width: 0, height: 0, error: 'no size found in the first bytes' };
}
function facts(type, buf, opt = {}) {
  if (type === 'dds') return ddsFacts(buf, opt);
  if (type === 'png') return pngFacts(buf);
  if (type === 'jpg') return jpgFacts(buf);
  if (type === 'tga') {
    const p = tga.parse(buf);
    if (!p.width && p.error) return { error: p.error, format: 'TGA' };
    const alpha = p.mapped ? (p.cmap.bits === 32 ? 'yes' : 'no') : p.bpp === 32 ? 'yes' : p.bpp === 16 && p.alphaBits ? '1-bit' : 'no';
    return { width: p.width, height: p.height, mips: 1, format: p.format || 'TGA type ' + p.type, alpha, tga: p, error: p.error,
      game: p.error ? { ok: false, why: 'tgaType' } : p.cmapType && p.cmap.start + p.cmap.len + 1 >= 0x4000 ? { ok: false, why: 'tgaPal' } : { ok: true } };
  }
  if (type === 'bmp') { const p = bmp.parse(buf); return { width: p.width, height: p.height, mips: 1, format: p.format || 'BMP', alpha: p.hasAlphaMask ? 'yes' : 'no', error: p.error, game: { ok: true } }; }
  if (type === 'psd') { const p = psd.parse(buf); return { width: p.width, height: p.height, mips: 1, format: p.format || 'PSD', alpha: p.channels > (p.mode === 3 ? 3 : p.mode === 4 ? 4 : 1) ? 'maybe' : 'no', channels: p.channels, error: p.error, game: { ok: false, why: 'psd' } }; }
  return { error: 'not a picture', format: '' };
}

// ---------------------------------------------------------------- decode
function decode(type, buf, opt = {}) {
  const maxSize = opt.maxSize || 0;
  let r;
  if (type === 'png') return Object.assign(pngFacts(buf), { pass: 'image/png' });
  if (type === 'jpg') return Object.assign(jpgFacts(buf), { pass: 'image/jpeg' });
  if (type === 'dds') {
    const f = ddsFacts(buf, opt);
    if (f.error) return f;
    let b = buf, face = 0;
    if (f.cube && opt.face) {   // a cube holds face after face, each with all its mips
      face = Math.max(0, Math.min(f.faces - 1, opt.face | 0));
      const off = f.fourCC === 'DX10' ? 148 : 128; let fb = 0;
      for (const [w, h] of f.mipSizes) fb += ddsMipBytes(f, w, h);
      if (off + fb * (face + 1) <= buf.length) b = Buffer.concat([buf.subarray(0, off), buf.subarray(off + fb * face)]); else face = 0;
    }
    r = dds.decode(b, opt.mip != null && opt.mip !== '' ? { mip: opt.mip, maxSize } : { maxSize });
    if (r.error) return Object.assign({ error: r.error }, f);
    const sz = f.mipSizes[r.mip] || [f.width, f.height];
    r = Object.assign(r, { mips: f.mips, srcWidth: sz[0], srcHeight: sz[1], format: f.format, face, faces: f.faces, cube: f.cube });
  } else if (type === 'tga') r = tga.decode(buf, { maxSize });
  else if (type === 'bmp') r = bmp.decode(buf, { maxSize });
  else if (type === 'psd') r = psd.decode(buf, { maxSize });
  else return { error: 'not a picture' };
  if (r.error) return r;
  r.mips = r.mips || 1; r.mip = r.mip || 0;
  let au = false; const a = r.rgba; for (let i = 3; i < a.length; i += 4) if (a[i] !== 255) { au = true; break; }
  r.alphaUsed = au;
  return r;
}

// ---------------------------------------------------------------- the game's verdicts
const MSG = {
  dx10: 'DX10 header: the game cannot load it (its log says "DXT10 textures are not supported"). Save it as DXT1, DXT5 or 32-bit A8R8G8B8.',
  format: 'The game cannot load the pixel format {f} (its log says "Unknown DDS picture format") and shows a dummy instead. Use DXT1, DXT3, DXT5 or 32-bit A8R8G8B8 / X8R8G8B8.',
  header: 'The DDS header sizes are wrong (124 and 32 are needed): the game cannot read it.',
  volume: 'Volume texture: the game cannot load it.',
  cubefaces: 'Cube map without all six faces ({n} of 6): the game cannot load it.',
  mips15: 'More than 15 mipmap levels ({n}): the game refuses it.',
  big: 'Bigger than 8192 pixels on a side ({w} x {h}): the game refuses it.',
  dxt4: 'DXT picture whose sides are not a multiple of 4 ({w} x {h}): the game shows the grey dummy texture instead.',
  npot: 'The sides are not powers of two ({w} x {h}). The game loads such pictures (it ships about 700 of them).',
  nomips: 'No mipmaps: the game does not make them, so from far away the picture may shimmer.',
  tgaType: 'The game cannot read this TGA: {m}.',
  tgaPal: 'Too many colours in the TGA colour map: the game refuses it.',
  tgaRtl: 'The right-to-left bit is set: the game ignores it, so in game the picture is mirrored.',
  tga16: '16-bit TGA: the game reads the colours without stretching them, so in game it looks much darker. Save it as 24 or 32 bits.',
  alphaZero: 'Every alpha value is 0: the game treats it as a picture without alpha (shown here without alpha too).',
  psd: 'The game does not load .psd files: this is a source picture left with the game files.',
  shadow: 'The game loads {f} instead (same name; it wins when a texture is named without its extension).',
  wins: 'This file wins over {f} of the same name: the game loads this one.',
  frame: 'This file describes a picture: shown here is its frame {f}.',
  frames: '{n} frames (an animation): the first is shown.',
  noframe: 'The frame {f} is not in the game.',
  cube: 'Cube map: face {n} of 6 is shown.',
};
const note = (code, p) => ({ code, msg: (MSG[code] || code).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m)), p: p || {} });

function winner(key, siblings) {
  const k = String(key || '').toLowerCase(), stem = k.replace(/\.[^./]*$/, ''), have = new Set((siblings || []).map(s => String(s).toLowerCase()));
  have.add(k);
  for (const e of ['.tex', '.ebm']) if (have.has(stem + e)) return stem + e;
  let w = null; for (const e of ebm.IMAGES) if (have.has(stem + e)) w = stem + e;
  return w;
}

function notes(f, o = {}) {
  const out = [], g = f.game || { ok: true };
  if (f.type === 'psd') out.push(note('psd'));
  else if (!g.ok) {
    if (g.why === 'tgaType') out.push(note('tgaType', { m: f.error || '' }));
    else out.push(note(g.why, { f: f.format, n: g.why === 'cubefaces' ? f.faces : f.mips, w: f.width, h: f.height }));
  }
  if (f.type === 'tga' && f.tga) {
    if (f.tga.rightToLeft) out.push(note('tgaRtl'));
    if (f.tga.bpp === 16 && !f.tga.mapped) out.push(note('tga16'));
  }
  if (f.alphaZero) out.push(note('alphaZero'));
  const key = String(o.key || '').toLowerCase();
  if (f.width && f.height && f.type !== 'psd' && (!pow2(f.width) || !pow2(f.height)) && !/^resource\/interface\//.test(key)) out.push(note('npot', { w: f.width, h: f.height }));
  if (f.type === 'dds' && g.ok && f.mips === 1 && Math.max(f.width, f.height) > 64 && !/^resource\/interface\//.test(key)) out.push(note('nomips'));
  if (f.cube) out.push(note('cube', { n: (o.face || 0) + 1 }));
  if (key && o.siblings && ebm.IMAGES.some(e => key.endsWith(e))) {
    const w = winner(key, o.siblings);
    if (w && w !== key) out.push(note('shadow', { f: base(w) }));
    else if (w === key) {
      const stem = key.replace(/\.[^./]*$/, ''), lose = ebm.IMAGES.map(e => stem + e).filter(s => s !== key && o.siblings.map(x => String(x).toLowerCase()).includes(s));
      if (lose.length) out.push(note('wins', { f: lose.map(base).join(', ') }));
    }
  }
  return out;
}

module.exports = { typeOf, facts, decode, notes, note, winner, ddsFacts, MSG };
