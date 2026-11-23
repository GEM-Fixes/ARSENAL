// model/psd: Photoshop PSD/PSB reader for the picture viewer: the merged picture only (the "image data" section at the end), no
// layers. Reads only, pure. The game does not load .psd [V: no .psd image format is registered in gem/bitmap]; the 6 it ships
// (interface/cursor/hitmarker, interface/pages/main) are source pictures left with the game files.
//   parse(buf) -> { width, height, channels, depth, mode, modeName, version, dataOffset, format, error }
//   decode(buf, { maxSize }) -> { width, height, rgba (top row first), format, scaled, srcWidth, srcHeight } | { error }
// Layout (Adobe file format spec, big-endian): '8BPS', version u16 (1 PSD, 2 PSB), 6 reserved, channels u16, height u32, width u32,
// depth u16, mode u16 (0 bitmap, 1 grey, 2 indexed, 3 RGB, 4 CMYK, 7 multichannel, 8 duotone, 9 Lab); then three sections each led
// by a length (colour mode data u32: the 768-byte palette of indexed; image resources u32; layers and masks u32, u64 in PSB);
// then the merged picture: compression u16 (0 raw, 1 PackBits RLE with a row byte-count table: u16 each, u32 in PSB), channels
// one after another (planar), rows top first. 16-bit samples are big-endian (the high byte is shown). RGB with a 4th channel:
// that channel is shown as alpha [I: Photoshop's first extra channel; a plain alpha channel in every game file seen].
// Author: Imperator_Aug (ARSENAL, ia-654a1a34)
'use strict';
const dds = require('./dds');
const MODES = { 0: 'bitmap', 1: 'grey', 2: 'indexed', 3: 'RGB', 4: 'CMYK', 7: 'multichannel', 8: 'duotone', 9: 'Lab' };

function parse(buf) {
  if (!buf || buf.length < 26 || buf.toString('latin1', 0, 4) !== '8BPS') return { error: 'not a PSD file' };
  const version = buf.readUInt16BE(4), channels = buf.readUInt16BE(12), height = buf.readUInt32BE(14), width = buf.readUInt32BE(18);
  const depth = buf.readUInt16BE(22), mode = buf.readUInt16BE(24), modeName = MODES[mode] || 'mode ' + mode;
  const out = { width, height, channels, depth, mode, modeName, version, dataOffset: 0, palette: null, format: (version === 2 ? 'PSB ' : 'PSD ') + modeName + ' ' + depth + '-bit', error: null };
  if (version !== 1 && version !== 2) return Object.assign(out, { error: 'PSD version ' + version + ' is not read' });
  if (![1, 2, 3, 4, 8].includes(mode)) return Object.assign(out, { error: 'the ' + modeName + ' colour mode is not read' });
  if (depth !== 8 && depth !== 16) return Object.assign(out, { error: depth + '-bit channels are not read' });
  if (!width || !height || width > 300000 || height > 300000) return Object.assign(out, { error: 'bad size ' + width + 'x' + height });
  let o = 26;
  const need = n => { if (o + n > buf.length) throw new Error('short'); };
  try {
    need(4); const cm = buf.readUInt32BE(o); o += 4; need(cm); if (mode === 2 && cm >= 768) out.palette = buf.subarray(o, o + 768); o += cm;
    need(4); const ir = buf.readUInt32BE(o); o += 4; need(ir); o += ir;
    if (version === 2) { need(8); const lm = Number(buf.readBigUInt64BE(o)); o += 8; need(lm); o += lm; }
    else { need(4); const lm = buf.readUInt32BE(o); o += 4; need(lm); o += lm; }
    need(2);
  } catch { return Object.assign(out, { error: 'the file is shorter than its sections say' }); }
  out.dataOffset = o;
  out.compression = buf.readUInt16BE(o);
  if (out.compression > 1) return Object.assign(out, { error: 'PSD picture compression ' + out.compression + ' (ZIP) is not read' });
  return out;
}

// PackBits: n 0..127 = copy n+1 bytes; n -127..-1 = repeat the next byte 1-n times; -128 = nothing
function unpack(buf, o, end, dst, d, len) {
  let got = 0;
  while (got < len && o < end) {
    let n = buf[o++]; if (n > 127) n -= 256;
    if (n >= 0) { const c = Math.min(n + 1, len - got); buf.copy(dst, d + got, o, o + c); o += n + 1; got += c; }
    else if (n !== -128) { const c = Math.min(1 - n, len - got); dst.fill(buf[o], d + got, d + got + c); o++; got += c; }
  }
  return got;
}

function decode(buf, opt = {}) {
  const p = parse(buf);
  if (p.error) return { error: p.error, format: p.format };
  const w = p.width, h = p.height, bps = p.depth / 8, rowB = w * bps, n = w * h;
  const show = p.mode === 3 || p.mode === 4 ? Math.min(p.channels, p.mode === 4 ? 5 : 4) : Math.min(p.channels, 2);
  const planes = [];
  let o = p.dataOffset + 2;
  if (p.compression === 0) {
    for (let c = 0; c < show; c++) { if (o + rowB * h > buf.length) return { error: 'the picture data ends early', format: p.format }; planes.push(buf.subarray(o, o + rowB * h)); o += rowB * h; }
  } else {
    const cw = p.version === 2 ? 4 : 2, rows = p.channels * h, counts = [];
    if (o + rows * cw > buf.length) return { error: 'the picture data ends early', format: p.format };
    for (let i = 0; i < rows; i++) counts.push(cw === 2 ? buf.readUInt16BE(o + i * 2) : buf.readUInt32BE(o + i * 4));
    o += rows * cw;
    for (let c = 0; c < show; c++) {
      const pl = Buffer.alloc(rowB * h);
      for (let y = 0; y < h; y++) { const cnt = counts[c * h + y]; unpack(buf, o, Math.min(buf.length, o + cnt), pl, y * rowB, rowB); o += cnt; }
      planes.push(pl);
    }
  }
  const s = (pl, i) => pl[i * bps];   // the high byte of a 16-bit sample (big-endian)
  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const d = i * 4; let r, g, b, a = 255;
    if (p.mode === 3) { r = s(planes[0], i); g = planes[1] ? s(planes[1], i) : r; b = planes[2] ? s(planes[2], i) : r; if (planes[3]) a = s(planes[3], i); }
    else if (p.mode === 4) {   // CMYK stored inverted (0 = full ink)
      const C = 255 - s(planes[0], i), M = 255 - s(planes[1], i), Y = 255 - s(planes[2], i), K = planes[3] ? 255 - s(planes[3], i) : 0;
      r = Math.round((255 - C) * (255 - K) / 255); g = Math.round((255 - M) * (255 - K) / 255); b = Math.round((255 - Y) * (255 - K) / 255);
      if (planes[4]) a = s(planes[4], i);
    } else if (p.mode === 2) { const k = planes[0][i]; r = p.palette ? p.palette[k] : k; g = p.palette ? p.palette[256 + k] : k; b = p.palette ? p.palette[512 + k] : k; }
    else { r = g = b = s(planes[0], i); if (planes[1]) a = s(planes[1], i); }
    rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = a;
  }
  let out = { rgba, width: w, height: h }, scaled = false;
  if (opt.maxSize && (w > opt.maxSize || h > opt.maxSize)) { out = dds.downscale(rgba, w, h, opt.maxSize); scaled = true; }
  return { width: out.width, height: out.height, rgba: out.rgba, format: p.format, scaled, srcWidth: w, srcHeight: h };
}

module.exports = { parse, decode };
