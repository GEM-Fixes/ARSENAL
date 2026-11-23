// bmfont: the binary AngelCode BMFont files (.fnt) of the game's fonts, read the way the engine reads them (,
// ), plus the small helpers a viewer needs: the sibling .font facts, the page texture the engine picks
// a TGA decoder, and a PNG writer (zlib, no dependencies). Read only.
//   parse(buf)            -> { sig, version, blocks[{type,off,size}], info, common, pages[], chars[], kerning[], notes[{code,src,p}] }
//   fontFacts(text)       -> { type, name, size, height, style, binary } from a .font SDL text (null fields when absent)
//   pickPage(stem, names) -> { use, ext, kind:'bitmap'|'image'|null, all[] }   the engine's choice among files named <stem>.<ext>
//   tga(buf)              -> { w, h, rgba }   types 1, 2, 3, 9, 10, 11; 8/15/16/24/32 bit; either origin
//   png(rgba, w, h)       -> Buffer
// Engine facts (each note carries its line): the 'BMF' signature, the version and the block type bytes are skipped unread (:357-359,
//,,,), so the blocks must come in the order 1 info, 2 common, 3 pages, 4 chars, then 5 kerning if any bytes are
// left (:410), each in the version 3 layout; the info block's name is its size - 14 bytes (:362); common is read as 15 bytes whatever
// its size says (:366); the pages block is one string of size - 1 bytes split at zero bytes (:368-378); chars are 20 bytes each (:382),
// kerning pairs 10 bytes (:412); a char id is cast to a 16-bit wchar_t (:408), so ids above 0xFFFF fold onto other characters; a
// character the font lacks is drawn as '?' (:184): no '?' glyph = the lookup has nothing to draw [I: crash]; the channel byte picks
// one colour channel only for 1, 2, 4, 8 (:386-399), any other value leaves the glyph colour 0 [I]; page textures are
// /interface/font/<page name without its extension> (:421) found like any image: .ebm/.tex first, else .dds .tga .bmp .jpg .png
// with the later one in that list winning.
// Author: Imperator_Aug (ARSENAL, ia-5e327183)
'use strict';
const zlib = require('zlib');
const SRC = '', BMP = '';

function parse(buf) {
  const o = { sig: buf.toString('latin1', 0, 3), version: buf.length > 3 ? buf[3] : -1, blocks: [], info: null, common: null, pages: [], chars: [], kerning: [], notes: [], size: buf.length };
  const note = (code, line, p, file) => o.notes.push({ code, src: (file || SRC) + ':' + line, p: p || {} });
  if (o.sig !== 'BMF') note('sig', 357, { s: o.sig.replace(/[^\x20-\x7e]/g, '.') });
  if (o.version !== 3) note('version', 358, { v: o.version });
  // the blocks as stored (type byte + int32 size)
  let p = 4;
  while (p + 5 <= buf.length && o.blocks.length < 16) { const t = buf[p], s = buf.readInt32LE(p + 1); o.blocks.push({ type: t, off: p, size: s }); if (s < 0) break; p += 5 + s; }
  const order = o.blocks.map(b => b.type).join(',');
  if (!/^1,2,3,4(,5)?$/.test(order)) note('order', 359, { o: order });
  const B = t => o.blocks.find(b => b.type === t) || null;
  // read in the engine's order (positions as the engine walks them, not by type)
  const bi = o.blocks[0], bc = o.blocks[1], bp = o.blocks[2], bh = o.blocks[3], bk = o.blocks[4];
  try {
    if (bi && bi.size >= 14) {
      const q = bi.off + 5;
      o.info = { fontSize: buf.readInt16LE(q), bits: buf[q + 2], charSet: buf[q + 3], stretchH: buf.readUInt16LE(q + 4), aa: buf[q + 6], padding: [buf[q + 7], buf[q + 8], buf[q + 9], buf[q + 10]],
        spacing: [buf[q + 11], buf[q + 12]], outline: buf[q + 13], name: buf.toString('latin1', q + 14, q + bi.size).replace(/\0+$/, '') };
      o.info.smooth = !!(o.info.bits & 0x80); o.info.unicode = !!(o.info.bits & 0x40); o.info.italic = !!(o.info.bits & 0x20); o.info.bold = !!(o.info.bits & 0x10);   // BMFont counts the bits from the top
    } else note('info', 362);
    if (bc) {
      if (bc.size !== 15) note('common', 366, { s: bc.size });
      const q = bc.off + 5;
      o.common = { lineHeight: buf.readUInt16LE(q), base: buf.readUInt16LE(q + 2), scaleW: buf.readUInt16LE(q + 4), scaleH: buf.readUInt16LE(q + 6), pages: buf.readUInt16LE(q + 8),
        bits: buf[q + 10], alpha: buf[q + 11], red: buf[q + 12], green: buf[q + 13], blue: buf[q + 14] };
    }
    if (bp && bp.size > 0) {
      const s = buf.toString('latin1', bp.off + 5, bp.off + 5 + bp.size - 1);
      o.pages = s.indexOf('\0') < 0 ? [s] : s.split('\0');
    }
    if (bh) {
      if (bh.size % 20) note('charsSize', 382, { s: bh.size });
      const end = Math.min(buf.length, bh.off + 5 + bh.size);
      for (let q = bh.off + 5; q + 20 <= end; q += 20) {
        o.chars.push([buf.readUInt32LE(q), buf.readUInt16LE(q + 4), buf.readUInt16LE(q + 6), buf.readUInt16LE(q + 8), buf.readUInt16LE(q + 10),
          buf.readInt16LE(q + 12), buf.readInt16LE(q + 14), buf.readInt16LE(q + 16), buf[q + 18], buf[q + 19]]);
      }
    }
    if (bk) {
      if (bk.size % 10) note('kernSize', 412, { s: bk.size });
      const end = Math.min(buf.length, bk.off + 5 + bk.size);
      for (let q = bk.off + 5; q + 10 <= end; q += 10) o.kerning.push([buf.readUInt32LE(q), buf.readUInt32LE(q + 4), buf.readInt16LE(q + 8)]);
    }
  } catch (e) { note('short', 357, { m: e.message }); }
  if (!bh) note('noChars', 382);
  // facts that matter in the game
  const C = o.common, ids = new Set();
  let big = 0, badCh = 0, badPg = 0, dup = 0;
  for (const c of o.chars) {
    if (c[0] > 0xffff && c[0] !== 0xffffffff) big++;   // -1 = BMFont's own 'invalid char' glyph: it lands on U+FFFF, harmless
    const w = c[0] & 0xffff; if (ids.has(w)) dup++; ids.add(w);
    if (![1, 2, 4, 8].includes(c[9])) badCh++;
    if (C && c[8] >= C.pages) badPg++;
  }
  if (big) note('bigId', 408, { n: big });
  if (dup) note('dupId', 408, { n: dup });
  if (o.chars.length && !ids.has(63)) note('noQuestion', 195);
  if (badCh) note('channel', 386, { n: badCh });
  if (badPg) note('pageIdx', 265, { n: badPg });
  if (C && o.pages.length < C.pages) note('pageNames', 421, { n: o.pages.length, p: C.pages });
  void B;
  return o;
}

// the facts of a .font SDL text: {font_atlas {name "x"} {size 10} {height 17} {style 0} {binary_data "x.fnt"}}
function fontFacts(text) {
  const s = String(text || '');
  const str = k => { const m = new RegExp('\\{\\s*' + k + '\\s+"([^"]*)"', 'i').exec(s); return m ? m[1] : null; };
  const num = k => { const m = new RegExp('\\{\\s*' + k + '\\s+(-?\\d+)', 'i').exec(s); return m ? Number(m[1]) : null; };
  const t = /^\s*(?:;[^\n]*\n\s*)*\{\s*([A-Za-z_][\w]*)/.exec(s);
  return { type: t ? t[1] : null, name: str('name'), size: num('size'), height: num('height'), style: num('style'), binary: str('binary_data') };
}

// the engine's pick among <stem>.<ext> files: a bitmap description first (.ebm, .tex: the later wins), else an image (.dds .tga .bmp
// .jpg .png: the later wins). names = file names or keys (only <stem>.<ext> with that exact stem count)
const BITMAP = ['ebm', 'tex'], IMAGE = ['dds', 'tga', 'bmp', 'jpg', 'png'];
function pickPage(stem, names) {
  const st = String(stem).toLowerCase(), all = [];
  for (const n of names || []) {
    const b = String(n).split('/').pop().toLowerCase(), i = b.lastIndexOf('.');
    if (i > 0 && b.slice(0, i) === st) all.push({ name: n, ext: b.slice(i + 1) });
  }
  const last = list => { let f = null; for (const e of list) { const x = all.find(a => a.ext === e); if (x) f = x; } return f; };
  const bm = last(BITMAP), im = bm ? null : last(IMAGE), use = bm || im;
  return { use: use ? use.name : null, ext: use ? use.ext : null, kind: bm ? 'bitmap' : im ? 'image' : null, all: all.map(a => a.name) };
}

function tga(buf) {
  if (buf.length < 18) throw new Error('TGA: too short');
  const idLen = buf[0], cmType = buf[1], type = buf[2], cmFirst = buf.readUInt16LE(3), cmLen = buf.readUInt16LE(5), cmBits = buf[7];
  const w = buf.readUInt16LE(12), h = buf.readUInt16LE(14), bpp = buf[16], desc = buf[17];
  if (![1, 2, 3, 9, 10, 11].includes(type)) throw new Error('TGA: image type ' + type + ' is not read here');
  if (!w || !h || w * h > 8192 * 8192) throw new Error('TGA: size ' + w + 'x' + h);
  let p = 18 + idLen;
  let pal = null;
  if (cmType === 1) { const eb = Math.ceil(cmBits / 8); pal = { first: cmFirst, bits: cmBits, data: buf.subarray(p, p + cmLen * eb) }; p += cmLen * eb; }
  const px = Math.ceil(bpp / 8), n = w * h, raw = Buffer.alloc(n * px);
  if (type >= 9) {
    let i = 0;
    while (i < n * px && p < buf.length) {
      const c = buf[p++], cnt = (c & 0x7f) + 1;
      if (c & 0x80) { const v = buf.subarray(p, p + px); p += px; for (let k = 0; k < cnt && i < raw.length; k++) { v.copy(raw, i); i += px; } }
      else { const len = Math.min(cnt * px, raw.length - i); buf.copy(raw, i, p, p + len); p += cnt * px; i += len; }
    }
  } else buf.copy(raw, 0, p, p + raw.length);
  const rgba = Buffer.alloc(n * 4), top = !!(desc & 0x20), right = !!(desc & 0x10);
  const col = (src, bits, out) => {   // one pixel of `bits` bits -> out[0..3]
    if (bits === 8) { out[0] = out[1] = out[2] = src[0]; out[3] = 255; }
    else if (bits === 15 || bits === 16) { const v = src[0] | (src[1] << 8); out[0] = ((v >> 10) & 31) * 255 / 31 | 0; out[1] = ((v >> 5) & 31) * 255 / 31 | 0; out[2] = (v & 31) * 255 / 31 | 0; out[3] = bits === 16 && !(v & 0x8000) && (desc & 15) ? 0 : 255; }
    else { out[0] = src[2]; out[1] = src[1]; out[2] = src[0]; out[3] = bits === 32 ? src[3] : 255; }
  };
  const o4 = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    const sy = top ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const sx = right ? w - 1 - x : x, s = (sy * w + sx) * px;
      if (pal) { let idx = raw[s] | (px > 1 ? raw[s + 1] << 8 : 0); idx -= pal.first; const eb = Math.ceil(pal.bits / 8); col(pal.data.subarray(idx * eb, idx * eb + eb), pal.bits, o4); }
      else col(raw.subarray(s, s + px), type === 3 || type === 11 ? 8 : bpp, o4);
      const d = (y * w + x) * 4; rgba[d] = o4[0]; rgba[d + 1] = o4[1]; rgba[d + 2] = o4[2]; rgba[d + 3] = o4[3];
    }
  }
  return { w, h, rgba };
}

let CRC = null;
function crc32(b) {
  if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
  let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0;
}
function png(rgba, w, h) {
  const row = w * 4 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) { raw[y * row] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * row + 1); }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 4 })), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { parse, fontFacts, pickPage, tga, png, SRC, BMP, BITMAP, IMAGE };
