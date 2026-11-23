// model/tga: Truevision TGA reader for the picture viewer (tools/gui/ext/view/kinds/picture.*). Reads only, pure: no file IO.
//   parse(buf) -> { width, height, type, bpp, rle, mapped, grey, cmap:{start,len,bits}, alphaBits, rightToLeft, topToBottom,
//                   interleave, idLength, dataOffset, format, error }   format: plain words, e.g. 'TGA 32-bit RLE'
//   decode(buf, { maxSize }) -> { width, height, rgba: Uint8Array (top row first), format, scaled, alphaAllZero, srcWidth, srcHeight }
//     | { error }. maxSize: the result is box-filtered down (dds.downscale) until both sides fit (scaled: true).
// Layout [V]: 18-byte header (idLength, colorMapType, imageType
// cmapStart u16, cmapLen u16, cmapBits, xOrg u16, yOrg u16, width u16, height u16, bpp, descriptor: bits 0-3 alpha bits,
// bit 4 right to left, bit 5 top to bottom, bits 6-7 interleave), the id, the colour map, then the pixels (B G R [A] each).
// Types 1 mapped, 2 true colour, 3 grey; 9, 10, 11 the same with RLE (a packet byte: bit 7 = run, low 7 bits = count - 1).
// Pixels 8 (grey or palette index), 15/16 (5:5:5, top bit = alpha when the header says 1 alpha bit), 24, 32. The game ignores the
// right-to-left bit [V] and reads 16-bit colours as 0..31 without stretching them [V, I look];
// this reader shows the picture as its maker meant (both honoured), and the viewer says what the game does differently.
// Author: Imperator_Aug (ARSENAL, ia-b1da9ab5)
'use strict';
const dds = require('./dds');

const TYPES = { 1: 'colour map', 2: '', 3: 'grey', 9: 'colour map', 10: '', 11: 'grey' };

function parse(buf) {
  if (!buf || buf.length < 18) return { error: 'too short for a TGA header (18 bytes)' };
  const type = buf[2], cmapType = buf[1], bpp = buf[16], d = buf[17];
  const out = {
    width: buf.readUInt16LE(12), height: buf.readUInt16LE(14), type, bpp, rle: type >= 9, mapped: type === 1 || type === 9, grey: type === 3 || type === 11,
    cmapType, cmap: { start: buf.readUInt16LE(3), len: buf.readUInt16LE(5), bits: buf[7] }, alphaBits: d & 15, rightToLeft: !!(d & 16), topToBottom: !!(d & 32),
    interleave: (d >> 6) & 3, idLength: buf[0], dataOffset: 0, format: null, error: null,
  };
  if (!(type in TYPES)) return Object.assign(out, { error: 'TGA image type ' + type + ' is not read (the game reads 1, 2, 3, 9, 10, 11)' });
  out.format = 'TGA ' + (out.mapped ? '8-bit colour map' : out.grey ? bpp + '-bit grey' : bpp + '-bit') + (out.rle ? ' RLE' : '');
  if (out.mapped) {
    if (cmapType !== 1) return Object.assign(out, { error: 'a colour-mapped TGA without a colour map' });
    if (![8, 15, 16, 24, 32].includes(out.cmap.bits)) return Object.assign(out, { error: 'colour map entries of ' + out.cmap.bits + ' bits are not read' });
    if (bpp !== 8 && bpp !== 16) return Object.assign(out, { error: 'colour map indices of ' + bpp + ' bits are not read' });
  } else if (![8, 15, 16, 24, 32].includes(bpp)) return Object.assign(out, { error: bpp + '-bit pixels are not read' });
  if (!out.width || !out.height) return Object.assign(out, { error: 'bad size ' + out.width + 'x' + out.height });
  const cmapBytes = cmapType ? out.cmap.len * Math.ceil(out.cmap.bits / 8) : 0;
  out.dataOffset = 18 + out.idLength + cmapBytes;
  if (out.dataOffset > buf.length) return Object.assign(out, { error: 'the file is shorter than its header says' });
  return out;
}

const x5 = v => (v << 3) | (v >> 2);   // 5 bits -> 8 bits

function decode(buf, opt = {}) {
  const p = parse(buf);
  if (p.error) return { error: p.error, format: p.format };
  const w = p.width, h = p.height, n = w * h, B = Math.ceil(p.bpp / 8);
  // the colour map
  let pal = null;
  if (p.cmapType) {
    const cb = Math.ceil(p.cmap.bits / 8), o0 = 18 + p.idLength;
    pal = new Uint8Array((p.cmap.start + p.cmap.len) * 4);
    for (let i = 0; i < p.cmap.len; i++) {
      const o = o0 + i * cb, d = (p.cmap.start + i) * 4;
      if (cb === 1) { pal[d] = pal[d + 1] = pal[d + 2] = buf[o]; pal[d + 3] = 255; }
      else if (cb === 2) { const v = buf.readUInt16LE(o); pal[d] = x5((v >> 10) & 31); pal[d + 1] = x5((v >> 5) & 31); pal[d + 2] = x5(v & 31); pal[d + 3] = 255; }
      else { pal[d] = buf[o + 2]; pal[d + 1] = buf[o + 1]; pal[d + 2] = buf[o]; pal[d + 3] = cb === 4 ? buf[o + 3] : 255; }
    }
  }
  // the pixels in file order (RLE expanded), as raw B-byte records
  let raw;
  if (!p.rle) {
    if (p.dataOffset + n * B > buf.length) return { error: 'the file is shorter than its header says', format: p.format };
    raw = buf.subarray(p.dataOffset, p.dataOffset + n * B);
  } else {
    raw = Buffer.alloc(n * B);
    let o = p.dataOffset, i = 0;
    while (i < n) {
      if (o >= buf.length) return { error: 'the RLE data ends early (pixel ' + i + ' of ' + n + ')', format: p.format };
      const pk = buf[o++], cnt = (pk & 127) + 1;
      if (pk & 128) {
        if (o + B > buf.length) return { error: 'the RLE data ends early', format: p.format };
        for (let k = 0; k < cnt && i < n; k++, i++) buf.copy(raw, i * B, o, o + B);
        o += B;
      } else {
        const len = Math.min(cnt, n - i) * B;
        if (o + len > buf.length) return { error: 'the RLE data ends early', format: p.format };
        buf.copy(raw, i * B, o, o + len); o += cnt * B; i += cnt;
      }
    }
  }
  // rows in file order -> picture rows (origin and interleave as the game reads them; right to left honoured here)
  const rgba = new Uint8Array(n * 4);
  const alpha16 = p.bpp === 16 && p.alphaBits >= 1;
  let anyA = false, line = 0, pass = 0;
  for (let row = 0; row < h; row++) {
    const y = p.topToBottom ? line : h - line - 1;
    for (let x = 0; x < w; x++) {
      const s = (row * w + x) * B, dx = p.rightToLeft ? w - 1 - x : x, d = (y * w + dx) * 4;
      if (p.mapped) {
        const idx = B === 1 ? raw[s] : raw[s] | (raw[s + 1] << 8), q = idx * 4;
        if (pal && q + 3 < pal.length) { rgba[d] = pal[q]; rgba[d + 1] = pal[q + 1]; rgba[d + 2] = pal[q + 2]; rgba[d + 3] = pal[q + 3]; }
        else rgba[d + 3] = 255;
      } else if (B === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = raw[s]; rgba[d + 3] = 255; }
      else if (B === 2) {
        const v = raw[s] | (raw[s + 1] << 8);
        rgba[d] = x5((v >> 10) & 31); rgba[d + 1] = x5((v >> 5) & 31); rgba[d + 2] = x5(v & 31); rgba[d + 3] = alpha16 ? (v & 0x8000 ? 255 : 0) : 255;
      } else {
        rgba[d] = raw[s + 2]; rgba[d + 1] = raw[s + 1]; rgba[d + 2] = raw[s]; rgba[d + 3] = B === 4 ? raw[s + 3] : 255;
        if (B === 4 && raw[s + 3]) anyA = true;
      }
    }
    line += p.interleave === 2 ? 4 : p.interleave === 1 ? 2 : 1;
    if (line >= h) line = ++pass;
  }
  // a 32-bit picture whose alpha is 0 everywhere: the game treats it as having no alpha (image tga hasAlpha stays false) [I]
  const alphaAllZero = B === 4 && !p.mapped && !anyA;
  if (alphaAllZero) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  let out = { rgba, width: w, height: h }, scaled = false;
  if (opt.maxSize && (w > opt.maxSize || h > opt.maxSize)) { out = dds.downscale(rgba, w, h, opt.maxSize); scaled = true; }
  return { width: out.width, height: out.height, rgba: out.rgba, format: p.format, scaled, alphaAllZero, srcWidth: w, srcHeight: h, header: p };
}

module.exports = { parse, decode };
