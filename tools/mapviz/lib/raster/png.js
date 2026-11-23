// png: PNG files for mapviz (tools/mapviz/README.md section 1.2). Sync, no state, node built-ins only.
//   encode(rgbaGrid | {w, h, rgba}) -> Buffer   RGBA 8 bit, non-interlaced; deterministic: Paeth filter on every row, one
//                                              IDAT, zlib level 6 (windowBits 15, memLevel 8, default strategy), chunks
//                                              IHDR IDAT IEND only (no time, text, gamma or colour chunks). Same input,
//                                              same bytes, on the same zlib build. Level 6, not 9 (contract version 2,
//                                              ruling R1): on smooth terrain level 9 spent most of the encode time for
//                                              files a few per cent smaller.
//   decode(buf) -> {w, h, rgba}                rgba = Uint8ClampedArray w*h*4, straight alpha, stored values (gamma, sRGB
//                                              and ICC chunks are ignored, design 7). Reads colour types 0 grey, 2 RGB,
//                                              3 palette, 4 grey + alpha, 6 RGBA; bit depths 1, 2, 4, 8, 16 as the PNG
//                                              rules allow (16 bit rounds to 8); tRNS; Adam7 interlace.
//   header(buf) -> {w, h, depth, colorType, interlace}   signature and IHDR only
// Rows: PNG row 0 is grid row 0 (no flip; README 4.2 "Pictures read from files"). Tiles flip in raster cutTile, not here.
// Errors carry a stable code: PNG_INPUT (encode got a bad picture), PNG_SIGNATURE, PNG_TRUNCATED (file or data cut short,
// no IEND), PNG_CRC (a critical chunk's CRC), PNG_CHUNK (chunk order or form), PNG_FORMAT (a depth, colour type or
// method PNG does not define, an unknown critical chunk), PNG_SIZE (0 or over 2^28 pixels), PNG_DATA (bad zlib data,
// filter type or palette index).
// tools/lib holds no PNG decoder and its one encoder (bmfont.png) deflates at level 4, so this file has its own of both.
// Author: Imperator_Aug (ARSENAL, ia-f805aacc)
'use strict';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PIXELS = 1 << 28;
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

function fail(code, msg) { const e = new Error('png: ' + msg); e.code = code; return e; }

let CRC = null;
function crc32(b, from, to) {
  if (!CRC) {
    CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
  }
  let c = -1;
  for (let i = from; i < to; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function picture(img) {
  if (!img || typeof img !== 'object') throw fail('PNG_INPUT', 'no picture');
  let px;
  if (img.rgba !== undefined) px = img.rgba;
  else {
    if (img.etype !== 'rgba8') throw fail('PNG_INPUT', "a grid must have etype 'rgba8', not " + img.etype);
    px = img.data;
  }
  const w = img.w, h = img.h;
  if (!(px instanceof Uint8Array || px instanceof Uint8ClampedArray)) throw fail('PNG_INPUT', 'pixels must be a Uint8Array or Uint8ClampedArray');
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > MAX_PIXELS) throw fail('PNG_INPUT', 'w and h must be integers >= 1, at most 2^28 pixels');
  if (px.length !== w * h * 4) throw fail('PNG_INPUT', 'pixels hold ' + px.length + ' bytes, w*h*4 = ' + w * h * 4);
  return { w, h, px };
}

// the filtered scanlines (filter byte 4 + Paeth residuals per row): the zlib input
function scanlines(img) {
  const { w, h, px } = picture(img), stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1) + 1, cur = y * stride, prev = cur - stride;
    raw[o - 1] = 4;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[cur + x - 4] : 0, b = y ? px[prev + x] : 0, c = y && x >= 4 ? px[prev + x - 4] : 0;
      raw[o + x] = (px[cur + x] - paeth(a, b, c)) & 0xff;
    }
  }
  return { w, h, raw };
}

function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, 'latin1');
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b, 4, 8 + data.length), 8 + data.length);
  return b;
}

function encode(img) {
  const zlib = require('zlib');
  const { w, h, raw } = scanlines(img);
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; ih[10] = 0; ih[11] = 0; ih[12] = 0;
  const z = zlib.deflateSync(raw, { level: 6, windowBits: 15, memLevel: 8, strategy: zlib.constants.Z_DEFAULT_STRATEGY });
  return Buffer.concat([SIG, chunk('IHDR', ih), chunk('IDAT', z), chunk('IEND', Buffer.alloc(0))]);
}

function asBuffer(buf) {
  if (Buffer.isBuffer(buf)) return buf;
  if (buf instanceof Uint8Array) return Buffer.from(buf.buffer, buf.byteOffset, buf.length);
  throw fail('PNG_INPUT', 'decode needs a Buffer');
}

function readIhdr(d) {
  if (d.length !== 13) throw fail('PNG_CHUNK', 'IHDR is ' + d.length + ' bytes, not 13');
  const H = { w: d.readUInt32BE(0), h: d.readUInt32BE(4), depth: d[8], colorType: d[9], interlace: d[12] };
  if (!DEPTHS[H.colorType] || DEPTHS[H.colorType].indexOf(H.depth) < 0) throw fail('PNG_FORMAT', 'colour type ' + H.colorType + ' with bit depth ' + H.depth);
  if (d[10] !== 0 || d[11] !== 0 || H.interlace > 1) throw fail('PNG_FORMAT', 'compression, filter or interlace method not defined by PNG');
  if (H.w < 1 || H.h < 1 || H.w > 0x7fffffff || H.h > 0x7fffffff || H.w * H.h > MAX_PIXELS) throw fail('PNG_SIZE', 'size ' + H.w + 'x' + H.h + ' (1 to 2^28 pixels)');
  return H;
}

function header(buf) {
  buf = asBuffer(buf);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw fail('PNG_SIGNATURE', 'not a PNG file');
  if (buf.length < 33) throw fail('PNG_TRUNCATED', 'file ends before IHDR');
  if (buf.toString('latin1', 12, 16) !== 'IHDR') throw fail('PNG_CHUNK', 'IHDR is not the first chunk');
  if (buf.readUInt32BE(8) !== 13) throw fail('PNG_CHUNK', 'IHDR is not 13 bytes');
  return readIhdr(buf.subarray(16, 29));
}

function chunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw fail('PNG_SIGNATURE', 'not a PNG file');
  let p = 8, H = null, plte = null, trns = null, end = false, seenIdat = false;
  const idat = [];
  while (!end) {
    if (p + 12 > buf.length) throw fail('PNG_TRUNCATED', 'file ends at byte ' + buf.length + (H ? ' before IEND' : ' before IHDR'));
    const len = buf.readUInt32BE(p);
    if (len > 0x7fffffff) throw fail('PNG_CHUNK', 'chunk length ' + len);
    if (p + 12 + len > buf.length) throw fail('PNG_TRUNCATED', 'chunk at byte ' + p + ' runs past the end of the file');
    const type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (!/^[A-Za-z]{4}$/.test(type)) throw fail('PNG_CHUNK', 'bad chunk type at byte ' + p);
    const critical = (buf[p + 4] & 0x20) === 0;
    if (critical && crc32(buf, p + 4, p + 8 + len) !== buf.readUInt32BE(p + 8 + len)) throw fail('PNG_CRC', type + ' chunk CRC does not match');
    if (!H && type !== 'IHDR') throw fail('PNG_CHUNK', 'IHDR is not the first chunk');
    if (type === 'IHDR') { if (H) throw fail('PNG_CHUNK', 'second IHDR'); H = readIhdr(d); }
    else if (type === 'PLTE') { if (len % 3 || len === 0 || len > 768) throw fail('PNG_CHUNK', 'PLTE of ' + len + ' bytes'); plte = d; }
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') { if (seenIdat === 'done') throw fail('PNG_CHUNK', 'IDAT chunks are not consecutive'); idat.push(d); seenIdat = true; }
    else if (type === 'IEND') end = true;
    else if (critical) throw fail('PNG_FORMAT', 'unknown critical chunk ' + type);
    if (type !== 'IDAT' && seenIdat === true) seenIdat = 'done';
    p += 12 + len;
  }
  if (!idat.length) throw fail('PNG_DATA', 'no IDAT chunk');
  if (H.colorType === 3 && !plte) throw fail('PNG_DATA', 'palette picture without PLTE');
  return { H, plte, trns, z: idat.length === 1 ? idat[0] : Buffer.concat(idat) };
}

function decode(buf) {
  buf = asBuffer(buf);
  const { H, plte, trns, z } = chunks(buf);
  let raw;
  try { raw = require('zlib').inflateSync(z); }
  catch (e) { throw fail(e.code === 'Z_BUF_ERROR' ? 'PNG_TRUNCATED' : 'PNG_DATA', 'image data: ' + e.message); }
  const { w, h, depth, colorType: ct } = H, ch = CHANNELS[ct], bits = ch * depth, bpp = Math.max(1, bits >> 3);
  const rgba = new Uint8ClampedArray(w * h * 4);
  const max = (1 << Math.min(depth, 8)) - 1;
  // tRNS key colour for types 0 and 2 (raw sample values, compared before any scaling)
  let key = null;
  if (trns && ct === 0 && trns.length >= 2) key = [trns.readUInt16BE(0)];
  if (trns && ct === 2 && trns.length >= 6) key = [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)];
  const s16 = v => ((v * 255 + 32767) / 65535) | 0;
  const passes = H.interlace ? ADAM7 : [[0, 0, 1, 1]];
  let pos = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const rb = Math.ceil(pw * bits / 8);
    if (pos + (rb + 1) * ph > raw.length) throw fail('PNG_TRUNCATED', 'image data is ' + raw.length + ' bytes, too short for the picture');
    let prev = Buffer.alloc(rb), cur = Buffer.alloc(rb);
    for (let j = 0; j < ph; j++) {
      const f = raw[pos], s = pos + 1;
      for (let x = 0; x < rb; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = raw[s + x];
        if (f === 0) cur[x] = v;
        else if (f === 1) cur[x] = v + a;
        else if (f === 2) cur[x] = v + b;
        else if (f === 3) cur[x] = v + ((a + b) >> 1);
        else if (f === 4) cur[x] = v + paeth(a, b, c);
        else throw fail('PNG_DATA', 'filter type ' + f + ' in row ' + j);
      }
      pos += rb + 1;
      const y = y0 + j * dy;
      for (let i = 0; i < pw; i++) {
        const o = (y * w + x0 + i * dx) * 4;
        let r, g, bl, al = 255;
        if (depth < 8) {
          const bit = i * depth, v = (cur[bit >> 3] >> (8 - depth - (bit & 7))) & max;
          if (ct === 3) {
            if (v * 3 + 2 >= plte.length) throw fail('PNG_DATA', 'palette index ' + v + ' outside PLTE');
            r = plte[v * 3]; g = plte[v * 3 + 1]; bl = plte[v * 3 + 2]; if (trns && v < trns.length) al = trns[v];
          } else { r = g = bl = (v * 255 / max) | 0; if (key && v === key[0]) al = 0; }
        } else if (depth === 8) {
          const q = i * ch;
          if (ct === 0) { r = g = bl = cur[q]; if (key && cur[q] === key[0]) al = 0; }
          else if (ct === 2) { r = cur[q]; g = cur[q + 1]; bl = cur[q + 2]; if (key && r === key[0] && g === key[1] && bl === key[2]) al = 0; }
          else if (ct === 3) {
            const v = cur[q];
            if (v * 3 + 2 >= plte.length) throw fail('PNG_DATA', 'palette index ' + v + ' outside PLTE');
            r = plte[v * 3]; g = plte[v * 3 + 1]; bl = plte[v * 3 + 2]; if (trns && v < trns.length) al = trns[v];
          } else if (ct === 4) { r = g = bl = cur[q]; al = cur[q + 1]; }
          else { r = cur[q]; g = cur[q + 1]; bl = cur[q + 2]; al = cur[q + 3]; }
        } else {
          const q = i * ch * 2, at = k => (cur[q + 2 * k] << 8) | cur[q + 2 * k + 1];
          if (ct === 0) { const v = at(0); r = g = bl = s16(v); if (key && v === key[0]) al = 0; }
          else if (ct === 2) { const R = at(0), G = at(1), B = at(2); r = s16(R); g = s16(G); bl = s16(B); if (key && R === key[0] && G === key[1] && B === key[2]) al = 0; }
          else if (ct === 4) { r = g = bl = s16(at(0)); al = s16(at(1)); }
          else { r = s16(at(0)); g = s16(at(1)); bl = s16(at(2)); al = s16(at(3)); }
        }
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = bl; rgba[o + 3] = al;
      }
      const t = prev; prev = cur; cur = t;
    }
  }
  return { w, h, rgba };
}

module.exports = { encode, decode, header, _scanlines: scanlines };   // _scanlines: test hook (the zlib-free golden)
