// model/dds: DirectDraw Surface reader for the Models page 3D view (textured mode). Reads only, pure: no file IO.
//   parse(buf) -> { width, height, mips, format, blockBytes|bpp, dataOffset, error }   format: 'DXT1' | 'DXT3' | 'DXT5' |
//     'BC5' (fourCC ATI2 or BC5U, DX10 BC5 typeless/unorm; normal maps: decode gives r, g from the two channels, b = 0,
//     a = 255, the caller rebuilds z) |
//     'RGBA' (uncompressed, read through the pixel format masks: 32, 24 or 16 bits, with or without alpha; luminance 8/16)
//     | null with error naming the format that is not read (ATI1, BC5S, BC7, a DX10 format number ...)
//   decode(buf, { mip, maxSize }) -> { width, height, rgba: Uint8Array (top row first), format, mip, scaled } | { error }
//     mip: the mip level to take (clamped to what the file has). maxSize: take the first mip whose larger side is at most
//     maxSize; when the file has no such mip the chosen level is box-filtered down until it fits (scaled: true).
//   downscale(rgba, w, h, maxSize) -> { rgba, width, height }  (halves by 2x2 box filter until both sides <= maxSize)
// Layout (Microsoft DDS docs): 'DDS ' + 124-byte header; pixel format at header byte 72 (file 76): size, flags, fourCC,
// bit count, R G B A masks; 'DX10' fourCC adds 20 bytes (dxgiFormat first). Data: mips largest first, each tightly packed.
// DXT1: 8-byte blocks, two 565 colours, 2-bit indices; c0 <= c1 means 3 colours + transparent. DXT3: 8 bytes of 4-bit alpha,
// then a colour block (always 4 colours). DXT5: two 8-bit alphas + 3-bit indices (6 bytes), then a colour block.
// BC5: two BC4 blocks of 8 bytes (red, then green), each like the DXT5 alpha block (port of decodeBC4 in
// tools/goh2as2/texconv.js: interpolants rounded to nearest).
// Author: Imperator_Aug (ARSENAL, ia-7489f77e)
'use strict';

const FOURCC = { DXT1: 'DXT1', DXT2: 'DXT3', DXT3: 'DXT3', DXT4: 'DXT5', DXT5: 'DXT5', ATI2: 'BC5', BC5U: 'BC5' };
const DXGI = { 71: 'DXT1', 72: 'DXT1', 74: 'DXT3', 75: 'DXT3', 77: 'DXT5', 78: 'DXT5', 82: 'BC5', 83: 'BC5',
  28: 'RGBA8', 29: 'RGBA8', 87: 'BGRA8', 91: 'BGRA8', 88: 'BGRX8', 93: 'BGRX8' };
const MASKS = { RGBA8: [0xff, 0xff00, 0xff0000, 0xff000000], BGRA8: [0xff0000, 0xff00, 0xff, 0xff000000], BGRX8: [0xff0000, 0xff00, 0xff, 0] };

function parse(buf) {
  if (!buf || buf.length < 128 || buf.toString('latin1', 0, 4) !== 'DDS ') return { error: 'not a DDS file' };
  const h = (o) => buf.readUInt32LE(o);
  const height = h(12), width = h(16), mipCount = Math.max(1, h(28) || 1);
  const pfFlags = h(80), four = buf.toString('latin1', 84, 88), bits = h(88);
  const out = { width, height, mips: mipCount, format: null, dataOffset: 128, blockBytes: 0, bpp: 0, masks: null, error: null };
  if (!width || !height || width > 16384 || height > 16384) return Object.assign(out, { error: 'bad size ' + width + 'x' + height });
  if (pfFlags & 0x4) {
    if (four === 'DX10') {
      if (buf.length < 148) return Object.assign(out, { error: 'short DX10 header' });
      const dx = h(128), f = DXGI[dx];
      out.dataOffset = 148;
      if (!f) return Object.assign(out, { error: 'DX10 format ' + dx + ' is not read' });
      if (f === 'DXT1' || f === 'DXT3' || f === 'DXT5' || f === 'BC5') { out.format = f; out.blockBytes = f === 'DXT1' ? 8 : 16; }
      else { out.format = 'RGBA'; out.bpp = 32; out.masks = MASKS[f]; }
    } else if (FOURCC[four]) { out.format = FOURCC[four]; out.blockBytes = out.format === 'DXT1' ? 8 : 16; }
    else return Object.assign(out, { error: 'format ' + (/^[\x20-\x7e]{4}$/.test(four) ? four : 'fourCC ' + buf.readUInt32LE(84)) + ' is not read' });
  } else if (pfFlags & (0x40 | 0x20000 | 0x2)) {
    if (bits !== 8 && bits !== 16 && bits !== 24 && bits !== 32) return Object.assign(out, { error: bits + '-bit pixels are not read' });
    out.format = 'RGBA'; out.bpp = bits;
    const lum = !!(pfFlags & 0x20000), alphaOnly = !!(pfFlags & 0x2) && !(pfFlags & 0x40) && !lum;
    const a = (pfFlags & 0x1) || alphaOnly ? h(104) : 0;
    out.masks = lum ? [h(92), h(92), h(92), a] : alphaOnly ? [0, 0, 0, a] : [h(92), h(96), h(100), a];
  } else return Object.assign(out, { error: 'pixel format flags 0x' + pfFlags.toString(16) + ' are not read' });
  return out;
}

function mipBytes(p, w, h) {
  if (p.blockBytes) return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * p.blockBytes;
  return w * h * (p.bpp >> 3);
}

function c565(c) { return [((c >> 11) & 31) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0]; }
function colourBlock(buf, o, four, out) {   // out: 16 x [r,g,b,a]
  const a = buf.readUInt16LE(o), b = buf.readUInt16LE(o + 2), bits = buf.readUInt32LE(o + 4);
  const A = c565(a), B = c565(b), P = [A.concat(255), B.concat(255)];
  if (four || a > b) {
    P.push([(2 * A[0] + B[0]) / 3 | 0, (2 * A[1] + B[1]) / 3 | 0, (2 * A[2] + B[2]) / 3 | 0, 255]);
    P.push([(A[0] + 2 * B[0]) / 3 | 0, (A[1] + 2 * B[1]) / 3 | 0, (A[2] + 2 * B[2]) / 3 | 0, 255]);
  } else {
    P.push([(A[0] + B[0]) >> 1, (A[1] + B[1]) >> 1, (A[2] + B[2]) >> 1, 255]);
    P.push([0, 0, 0, 0]);
  }
  for (let i = 0; i < 16; i++) out[i] = P[(bits >>> (2 * i)) & 3].slice();
}
function bc4Block(buf, o, out) {   // out: 16 values 0..255
  const e0 = buf[o], e1 = buf[o + 1], pal = [e0, e1];
  if (e0 > e1) for (let i = 1; i <= 6; i++) pal.push(Math.round(((7 - i) * e0 + i * e1) / 7));
  else { for (let i = 1; i <= 4; i++) pal.push(Math.round(((5 - i) * e0 + i * e1) / 5)); pal.push(0, 255); }
  for (let half = 0; half < 2; half++) {
    const v = buf[o + 2 + half * 3] | (buf[o + 3 + half * 3] << 8) | (buf[o + 4 + half * 3] << 16);
    for (let i = 0; i < 8; i++) out[half * 8 + i] = pal[(v >> (3 * i)) & 7];
  }
}
function decodeBlocks(p, buf, off, w, h) {
  const rgba = new Uint8Array(w * h * 4), px = new Array(16);
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  const R = p.format === 'BC5' ? new Array(16) : null, G = R ? new Array(16) : null;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let o = off + (by * bw + bx) * p.blockBytes;
    if (R) {
      bc4Block(buf, o, R); bc4Block(buf, o + 8, G);
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2);
        if (x >= w || y >= h) continue;
        const d = (y * w + x) * 4;
        rgba[d] = R[i]; rgba[d + 1] = G[i]; rgba[d + 2] = 0; rgba[d + 3] = 255;
      }
      continue;
    }
    let alpha = null;
    if (p.format === 'DXT3') {
      alpha = [];
      for (let i = 0; i < 8; i++) { const v = buf[o + i]; alpha.push((v & 15) * 17, (v >> 4) * 17); }
      o += 8;
    } else if (p.format === 'DXT5') {
      const a0 = buf[o], a1 = buf[o + 1], A = [a0, a1];
      if (a0 > a1) for (let i = 1; i < 7; i++) A.push(((7 - i) * a0 + i * a1) / 7 | 0);
      else { for (let i = 1; i < 5; i++) A.push(((5 - i) * a0 + i * a1) / 5 | 0); A.push(0, 255); }
      alpha = [];
      for (let half = 0; half < 2; half++) {
        const v = buf[o + 2 + half * 3] | (buf[o + 3 + half * 3] << 8) | (buf[o + 4 + half * 3] << 16);
        for (let i = 0; i < 8; i++) alpha.push(A[(v >> (3 * i)) & 7]);
      }
      o += 8;
    }
    colourBlock(buf, o, p.format !== 'DXT1', px);
    for (let i = 0; i < 16; i++) {
      const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2);
      if (x >= w || y >= h) continue;
      const d = (y * w + x) * 4, c = px[i];
      rgba[d] = c[0]; rgba[d + 1] = c[1]; rgba[d + 2] = c[2]; rgba[d + 3] = alpha ? alpha[i] : c[3];
    }
  }
  return rgba;
}
function maskRead(v, m) {
  if (!m) return null;
  let s = 0; while (!((m >>> s) & 1)) s++;
  const max = m >>> s;
  return Math.round(((v & m) >>> s) * 255 / max);
}
function decodePlain(p, buf, off, w, h) {
  const rgba = new Uint8Array(w * h * 4), B = p.bpp >> 3, M = p.masks;
  for (let i = 0; i < w * h; i++) {
    const o = off + i * B;
    const v = B === 4 ? buf.readUInt32LE(o) : B === 3 ? (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16)) : B === 2 ? buf.readUInt16LE(o) : buf[o];
    const r = maskRead(v, M[0]), g = maskRead(v, M[1]), b = maskRead(v, M[2]), a = maskRead(v, M[3]);
    rgba[i * 4] = r == null ? 0 : r; rgba[i * 4 + 1] = g == null ? 0 : g; rgba[i * 4 + 2] = b == null ? 0 : b; rgba[i * 4 + 3] = a == null ? 255 : a;
  }
  return rgba;
}

function downscale(rgba, w, h, maxSize) {
  while ((w > maxSize || h > maxSize) && (w > 1 || h > 1)) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), o = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < 4; c++) {
      const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1), y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
      o[(y * nw + x) * 4 + c] = (rgba[(y0 * w + x0) * 4 + c] + rgba[(y0 * w + x1) * 4 + c] + rgba[(y1 * w + x0) * 4 + c] + rgba[(y1 * w + x1) * 4 + c] + 2) >> 2;
    }
    rgba = o; w = nw; h = nh;
  }
  return { rgba, width: w, height: h };
}

function decode(buf, opt = {}) {
  const p = parse(buf);
  if (p.error) return { error: p.error, format: p.format };
  let level = opt.mip != null ? Math.max(0, Math.min(p.mips - 1, opt.mip | 0)) : 0;
  if (opt.maxSize && opt.mip == null) {
    const big = l => Math.max(p.width >> l, p.height >> l, 1) > opt.maxSize;
    while (level < p.mips - 1 && big(level)) level++;
  }
  let off = p.dataOffset, w = p.width, h = p.height;
  for (let i = 0; i < level; i++) { off += mipBytes(p, w, h); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
  if (off + mipBytes(p, w, h) > buf.length) {
    if (level > 0) return decode(buf, { mip: 0, maxSize: opt.maxSize, _top: true });
    return { error: 'the file is shorter than its header says', format: p.format };
  }
  let rgba = p.blockBytes ? decodeBlocks(p, buf, off, w, h) : decodePlain(p, buf, off, w, h), scaled = false;
  if (opt.maxSize && (w > opt.maxSize || h > opt.maxSize)) { const d = downscale(rgba, w, h, opt.maxSize); rgba = d.rgba; w = d.width; h = d.height; scaled = true; }
  return { width: w, height: h, rgba, format: p.format === 'RGBA' ? 'RGBA' + p.bpp : p.format, mip: level, scaled };
}

module.exports = { parse, decode, downscale };
