// model/bmp: Windows BMP reader for the picture viewer. Reads only, pure: no file IO. The game loads .bmp through its standard
// image loader [V]; it ships 4 (interface/splash.bmp 1024x768 24-bit, service tex2_0.bmp 2x2).
//   parse(buf) -> { width, height, bpp, compression, topDown, palette count, dataOffset, format, hasAlphaMask, error }
//   decode(buf, { maxSize }) -> { width, height, rgba (top row first), format, scaled, srcWidth, srcHeight } | { error }
// Layout (Microsoft BITMAPFILEHEADER + BITMAPINFOHEADER/V4/V5): 'BM', file size u32, 2 x u16 reserved, pixel offset u32; info
// size u32, width i32, height i32 (< 0 = top row first), planes u16, bpp u16, compression u32 (0 RGB, 3 BITFIELDS, 6 ALPHABITFIELDS;
// 1/2 RLE are not read), ..., colours used u32 at 46; masks after a 40-byte header (BITFIELDS) or inside V4/V5 at 54..70.
// Rows are padded to 4 bytes. 1/4/8-bit = palette indices (B G R x entries); 16 = 5:5:5 unless masks say; 24 = B G R;
// 32 = B G R x (alpha only when a mask names it).
// Author: Imperator_Aug (ARSENAL, ia-d6400ff0)
'use strict';
const dds = require('./dds');

function parse(buf) {
  if (!buf || buf.length < 26 || buf.toString('latin1', 0, 2) !== 'BM') return { error: 'not a BMP file' };
  const off = buf.readUInt32LE(10), hs = buf.readUInt32LE(14);
  const out = { width: 0, height: 0, bpp: 0, compression: 0, topDown: false, colours: 0, dataOffset: off, masks: null, format: null, error: null };
  if (hs === 12) { out.width = buf.readUInt16LE(18); out.height = buf.readUInt16LE(20); out.bpp = buf.readUInt16LE(24); }
  else {
    if (buf.length < 54) return Object.assign(out, { error: 'short BMP header' });
    out.width = buf.readInt32LE(18); const hh = buf.readInt32LE(22); out.topDown = hh < 0; out.height = Math.abs(hh);
    out.bpp = buf.readUInt16LE(28); out.compression = buf.readUInt32LE(30); out.colours = buf.readUInt32LE(46);
  }
  out.format = 'BMP ' + out.bpp + '-bit';
  if (out.compression === 1 || out.compression === 2) return Object.assign(out, { error: 'RLE-compressed BMP is not read' });
  if (![0, 3, 6].includes(out.compression)) return Object.assign(out, { error: 'BMP compression ' + out.compression + ' is not read' });
  if (![1, 4, 8, 16, 24, 32].includes(out.bpp)) return Object.assign(out, { error: out.bpp + '-bit BMP is not read' });
  if (out.width <= 0 || !out.height || out.width > 32768 || out.height > 32768) return Object.assign(out, { error: 'bad size ' + out.width + 'x' + out.height });
  if (out.bpp === 16 || out.bpp === 32) {
    if (out.compression === 3 || out.compression === 6 || hs >= 56) {
      const mo = 54;   // V4/V5 hold the masks at 54; a 40-byte header with BITFIELDS has them right after it (also 54)
      if (buf.length >= mo + 12) out.masks = [buf.readUInt32LE(mo), buf.readUInt32LE(mo + 4), buf.readUInt32LE(mo + 8), (hs >= 56 || out.compression === 6) && buf.length >= mo + 16 ? buf.readUInt32LE(mo + 12) : 0];
    }
    if (!out.masks || !(out.masks[0] | out.masks[1] | out.masks[2])) out.masks = out.bpp === 16 ? [0x7c00, 0x3e0, 0x1f, 0] : [0xff0000, 0xff00, 0xff, 0];
  }
  out.hasAlphaMask = !!(out.masks && out.masks[3]);
  if (out.hasAlphaMask) out.format += ' with alpha';
  out.palOffset = 14 + hs; out.palEntry = hs === 12 ? 3 : 4;
  return out;
}

function maskRead(v, m) { if (!m) return null; let s = 0; while (!((m >>> s) & 1)) s++; const max = m >>> s; return Math.round(((v & m) >>> s) * 255 / max); }

function decode(buf, opt = {}) {
  const p = parse(buf);
  if (p.error) return { error: p.error, format: p.format };
  const w = p.width, h = p.height, stride = Math.floor((w * p.bpp + 31) / 32) * 4;
  if (p.dataOffset + stride * (h - 1) + Math.ceil(w * p.bpp / 8) > buf.length) return { error: 'the file is shorter than its header says', format: p.format };
  let pal = null;
  if (p.bpp <= 8) {
    const n = p.colours || (1 << p.bpp); pal = [];
    for (let i = 0; i < n; i++) { const o = p.palOffset + i * p.palEntry; pal.push(o + 2 < buf.length ? [buf[o + 2], buf[o + 1], buf[o]] : [0, 0, 0]); }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const y = p.topDown ? row : h - 1 - row, ro = p.dataOffset + row * stride;
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4;
      if (pal) {
        const bit = x * p.bpp, byte = buf[ro + (bit >> 3)], idx = (byte >> (8 - p.bpp - (bit & 7))) & ((1 << p.bpp) - 1), c = pal[idx] || [0, 0, 0];
        rgba[d] = c[0]; rgba[d + 1] = c[1]; rgba[d + 2] = c[2]; rgba[d + 3] = 255;
      } else if (p.bpp === 24) { const o = ro + x * 3; rgba[d] = buf[o + 2]; rgba[d + 1] = buf[o + 1]; rgba[d + 2] = buf[o]; rgba[d + 3] = 255; }
      else {
        const v = p.bpp === 32 ? buf.readUInt32LE(ro + x * 4) : buf.readUInt16LE(ro + x * 2), M = p.masks, a = maskRead(v, M[3]);
        rgba[d] = maskRead(v, M[0]) || 0; rgba[d + 1] = maskRead(v, M[1]) || 0; rgba[d + 2] = maskRead(v, M[2]) || 0; rgba[d + 3] = a == null ? 255 : a;
      }
    }
  }
  let out = { rgba, width: w, height: h }, scaled = false;
  if (opt.maxSize && (w > opt.maxSize || h > opt.maxSize)) { out = dds.downscale(rgba, w, h, opt.maxSize); scaled = true; }
  return { width: out.width, height: out.height, rgba: out.rgba, format: p.format, scaled, srcWidth: w, srcHeight: h };
}

module.exports = { parse, decode };
