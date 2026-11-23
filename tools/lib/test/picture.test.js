// picture decoders tests (lib/model/tga, bmp, psd, ebm, picture; dds through picture.js): synthetic files built byte by byte, then,
// when the game is found, a sweep that decodes every .tga, every .ebm/.tex description and a sample of 300 .dds (plus the .bmp,
// .psd, .png) from its paks and prints the failures per format. PICTURE_SWEEP=0 skips the sweep; PICTURE_SWEEP=all takes every .dds.
// Standalone: `node tools/lib/test/picture.test.js` prints PASS last. As a module: require('./picture.test')(t, assert).
// Author: Imperator_Aug (ARSENAL, ia-593cbc54)
'use strict';
const tga = require('../model/tga'), bmp = require('../model/bmp'), psd = require('../model/psd'), ebm = require('../model/ebm'), P = require('../model/picture');

const px = (r, x, y) => Array.from(r.rgba.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4));
// TGA: rows = picture rows top first, each pixel [r,g,b,a]; the file stores them in the origin the descriptor says
function mkTga(o) {
  const { w, h, type = 2, bpp = 32, rows, desc = 0, rle = false, cmap = null, idx = null, alphaBits = bpp === 32 ? 8 : 0 } = o;
  const hd = Buffer.alloc(18);
  hd[0] = 0; hd[1] = cmap ? 1 : 0; hd[2] = type; if (cmap) { hd.writeUInt16LE(0, 3); hd.writeUInt16LE(cmap.length, 5); hd[7] = 24; }
  hd.writeUInt16LE(w, 12); hd.writeUInt16LE(h, 14); hd[16] = bpp; hd[17] = (desc | alphaBits) & 0xff;
  const top = !!(desc & 32), rtl = !!(desc & 16), recs = [];
  for (let fr = 0; fr < h; fr++) {
    const y = top ? fr : h - 1 - fr;
    for (let fx = 0; fx < w; fx++) {
      const x = rtl ? w - 1 - fx : fx;
      if (idx) { recs.push(Buffer.from([idx[y][x]])); continue; }
      const [r, g, b, a] = rows[y][x];
      if (bpp === 8) recs.push(Buffer.from([r]));
      else if (bpp === 16) { const v = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3) | (a > 127 ? 0x8000 : 0); const bb = Buffer.alloc(2); bb.writeUInt16LE(v); recs.push(bb); }
      else recs.push(Buffer.from(bpp === 24 ? [b, g, r] : [b, g, r, a]));
    }
  }
  let data;
  if (!rle) data = Buffer.concat(recs);
  else {   // runs of equal records as run packets, the rest as raw packets
    const parts = []; let i = 0;
    while (i < recs.length) {
      let j = i + 1; while (j < recs.length && j - i < 128 && recs[j].equals(recs[i])) j++;
      if (j - i > 1) { parts.push(Buffer.from([0x80 | (j - i - 1)]), recs[i]); i = j; continue; }
      j = i + 1; while (j < recs.length && j - i < 128 && !(j + 1 < recs.length && recs[j].equals(recs[j + 1]))) j++;
      parts.push(Buffer.from([j - i - 1]), ...recs.slice(i, j)); i = j;
    }
    data = Buffer.concat(parts);
  }
  const pal = cmap ? Buffer.concat(cmap.map(([r, g, b]) => Buffer.from([b, g, r]))) : Buffer.alloc(0);
  return Buffer.concat([hd, pal, data]);
}
const R_ = [255, 0, 0, 255], G_ = [0, 255, 0, 255], B_ = [0, 0, 255, 128], W_ = [255, 255, 255, 0];
const ROWS = [[R_, G_, B_], [W_, W_, R_]];   // 3 x 2, top row first

function mkBmp(w, h, bpp, pix, opt = {}) {   // pix(x, y) -> [r,g,b,a] (or an index for <= 8 bits)
  const hs = opt.hs || 40, stride = Math.floor((w * bpp + 31) / 32) * 4, pal = opt.pal || [], masks = opt.masks || null;
  const extra = masks && hs === 40 ? masks.length * 4 : 0, off = 14 + hs + extra + pal.length * 4;
  const b = Buffer.alloc(off + stride * h);
  b.write('BM', 0, 'latin1'); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(hs, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(opt.topDown ? -h : h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(bpp, 28); b.writeUInt32LE(opt.comp || 0, 30);
  b.writeUInt32LE(pal.length, 46);
  if (masks) masks.forEach((m, i) => b.writeUInt32LE(m >>> 0, 54 + i * 4));
  pal.forEach(([r, g, bl], i) => { const o = 14 + hs + extra + i * 4; b[o] = bl; b[o + 1] = g; b[o + 2] = r; });
  for (let row = 0; row < h; row++) {
    const y = opt.topDown ? row : h - 1 - row, ro = off + row * stride;
    for (let x = 0; x < w; x++) {
      const v = pix(x, y);
      if (bpp === 24) { b[ro + x * 3] = v[2]; b[ro + x * 3 + 1] = v[1]; b[ro + x * 3 + 2] = v[0]; }
      else if (bpp === 32) b.writeUInt32LE(((v[3] << 24) | (v[0] << 16) | (v[1] << 8) | v[2]) >>> 0, ro + x * 4);
      else if (bpp === 8) b[ro + x] = v;
      else if (bpp === 1) { if (v) b[ro + (x >> 3)] |= 0x80 >> (x & 7); }
    }
  }
  return b;
}
function mkPsd(w, h, mode, chans, rle) {   // chans: arrays of w*h bytes (planar)
  const hd = Buffer.alloc(26); hd.write('8BPS', 0, 'latin1'); hd.writeUInt16BE(1, 4); hd.writeUInt16BE(chans.length, 12); hd.writeUInt32BE(h, 14); hd.writeUInt32BE(w, 18);
  hd.writeUInt16BE(8, 22); hd.writeUInt16BE(mode, 24);
  const z4 = Buffer.alloc(4), ir = Buffer.from('8BIM....', 'latin1'), irl = Buffer.alloc(4); irl.writeUInt32BE(ir.length);
  let data;
  if (!rle) data = Buffer.concat([Buffer.from([0, 0])].concat(chans.map(c => Buffer.from(c))));
  else {   // each row: a raw packet of w bytes, so the counts are w + 1
    const counts = Buffer.alloc(chans.length * h * 2), rows = [];
    for (let c = 0; c < chans.length; c++) for (let y = 0; y < h; y++) { counts.writeUInt16BE(w + 1, (c * h + y) * 2); rows.push(Buffer.from([w - 1]), Buffer.from(chans[c].slice(y * w, y * w + w))); }
    data = Buffer.concat([Buffer.from([0, 1]), counts].concat(rows));
  }
  return Buffer.concat([hd, z4, irl, ir, z4, data]);
}
function mkDds(w, h, opt = {}) {
  const hd = Buffer.alloc(124);
  hd.writeUInt32LE(124, 0); hd.writeUInt32LE(0x1007 | (opt.depth ? 0x800000 : 0), 4); hd.writeUInt32LE(h, 8); hd.writeUInt32LE(w, 12);
  hd.writeUInt32LE(opt.mips || 1, 24); hd.writeUInt32LE(32, 72); hd.writeUInt32LE(opt.flags || 4, 76);
  if (opt.four) hd.write(opt.four, 80, 'latin1');
  hd.writeUInt32LE(opt.bits || 0, 84); (opt.masks || [0, 0, 0, 0]).forEach((m, i) => hd.writeUInt32LE(m >>> 0, 88 + i * 4));
  hd.writeUInt32LE(opt.caps2 || 0, 108);
  return Buffer.concat([Buffer.from('DDS ', 'latin1'), hd, opt.data || Buffer.alloc(0)]);
}
const dxt1 = (c0, c1, bits) => { const b = Buffer.alloc(8); b.writeUInt16LE(c0, 0); b.writeUInt16LE(c1, 2); b.writeUInt32LE(bits >>> 0, 4); return b; };

function tests(t, assert) {
  // ---------------------------------------------------------------- TGA
  t('tga: 32-bit raw, bottom-up (the default origin)', () => {
    const r = tga.decode(mkTga({ w: 3, h: 2, rows: ROWS }));
    assert.equal(r.error, undefined); assert.equal(r.format, 'TGA 32-bit'); assert.equal(r.width, 3); assert.equal(r.height, 2);
    assert.deepEqual(px(r, 0, 0), R_); assert.deepEqual(px(r, 2, 0), B_); assert.deepEqual(px(r, 2, 1), R_); assert.deepEqual(px(r, 0, 1), W_);
  });
  t('tga: 32-bit top-down and 24-bit', () => {
    let r = tga.decode(mkTga({ w: 3, h: 2, rows: ROWS, desc: 32 })); assert.deepEqual(px(r, 1, 0), G_); assert.deepEqual(px(r, 0, 1), W_);
    r = tga.decode(mkTga({ w: 3, h: 2, rows: ROWS, bpp: 24 })); assert.equal(r.format, 'TGA 24-bit'); assert.deepEqual(px(r, 2, 0), [0, 0, 255, 255]);
  });
  t('tga: RLE 32 and 24 (run and raw packets), both origins', () => {
    const rows = [[R_, R_, R_, G_], [B_, G_, R_, R_], [W_, W_, W_, W_]];
    for (const desc of [0, 32]) for (const bpp of [32, 24]) {
      const r = tga.decode(mkTga({ w: 4, h: 3, rows, rle: true, type: 10, bpp, desc }));
      assert.equal(r.error, undefined, 'rle ' + bpp + ' ' + desc); assert.equal(r.format, 'TGA ' + bpp + '-bit RLE');
      for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) assert.deepEqual(px(r, x, y), bpp === 24 ? rows[y][x].slice(0, 3).concat(255) : rows[y][x], `rle ${bpp}/${desc} at ${x},${y}`);
    }
  });
  t('tga: 8-bit grey raw + RLE (types 3, 11)', () => {
    const g = v => [v, v, v, 255], rows = [[g(10), g(10), g(200)], [g(0), g(255), g(255)]];
    for (const [type, rle] of [[3, false], [11, true]]) {
      const r = tga.decode(mkTga({ w: 3, h: 2, rows, type, bpp: 8, rle }));
      assert.equal(r.format, 'TGA 8-bit grey' + (rle ? ' RLE' : '')); assert.deepEqual(px(r, 2, 0), g(200)); assert.deepEqual(px(r, 1, 1), g(255));
    }
  });
  t('tga: 16-bit 5:5:5 with the alpha bit', () => {
    const rows = [[[255, 0, 0, 255], [0, 255, 0, 0]], [[0, 0, 255, 255], [255, 255, 255, 255]]];
    const r = tga.decode(mkTga({ w: 2, h: 2, rows, bpp: 16, alphaBits: 1 }));
    assert.equal(r.format, 'TGA 16-bit'); assert.deepEqual(px(r, 0, 0), [255, 0, 0, 255]); assert.deepEqual(px(r, 1, 0), [0, 255, 0, 0]); assert.deepEqual(px(r, 1, 1), [255, 255, 255, 255]);
  });
  t('tga: colour map 8-bit index, raw and RLE (types 1, 9)', () => {
    const cmap = [[0, 0, 0], [255, 128, 0], [10, 20, 30]], idx = [[1, 1, 2], [0, 2, 1]];
    for (const [type, rle] of [[1, false], [9, true]]) {
      const r = tga.decode(mkTga({ w: 3, h: 2, type, bpp: 8, cmap, idx, rle, alphaBits: 0 }));
      assert.equal(r.error, undefined); assert.equal(r.format, 'TGA 8-bit colour map' + (rle ? ' RLE' : ''));
      assert.deepEqual(px(r, 0, 0), [255, 128, 0, 255]); assert.deepEqual(px(r, 2, 0), [10, 20, 30, 255]); assert.deepEqual(px(r, 0, 1), [0, 0, 0, 255]);
    }
  });
  t('tga: right to left honoured, flagged in the header', () => {
    const r = tga.decode(mkTga({ w: 3, h: 2, rows: ROWS, desc: 16 }));
    assert.deepEqual(px(r, 0, 0), R_); assert.deepEqual(px(r, 2, 0), B_); assert.equal(r.header.rightToLeft, true);
  });
  t('tga: 32-bit with alpha 0 everywhere is shown opaque (alphaAllZero)', () => {
    const z = [9, 8, 7, 0], r = tga.decode(mkTga({ w: 2, h: 1, rows: [[z, z]] }));
    assert.equal(r.alphaAllZero, true); assert.deepEqual(px(r, 0, 0), [9, 8, 7, 255]);
  });
  t('tga: refusals (type 32, short data, short RLE)', () => {
    const b = mkTga({ w: 3, h: 2, rows: ROWS }); const b32 = Buffer.from(b); b32[2] = 32;
    assert.match(tga.decode(b32).error, /type 32/);
    assert.match(tga.decode(b.subarray(0, b.length - 3)).error, /shorter/);
    const rl = mkTga({ w: 4, h: 3, rows: [[R_, R_, R_, G_], [B_, G_, R_, R_], [W_, W_, W_, W_]], rle: true, type: 10 });
    assert.match(tga.decode(rl.subarray(0, rl.length - 2)).error, /ends early/);
    assert.match(tga.decode(Buffer.alloc(5)).error, /too short/);
  });
  t('tga: maxSize box-filters down', () => {
    const rows = []; for (let y = 0; y < 8; y++) { rows.push([]); for (let x = 0; x < 8; x++) rows[y].push([200, 100, 50, 255]); }
    const r = tga.decode(mkTga({ w: 8, h: 8, rows }), { maxSize: 2 });
    assert.equal(r.width, 2); assert.equal(r.scaled, true); assert.equal(r.srcWidth, 8); assert.deepEqual(px(r, 1, 1), [200, 100, 50, 255]);
  });
  // ---------------------------------------------------------------- BMP
  t('bmp: 24-bit bottom-up with row padding; top-down', () => {
    const f = (x, y) => [x * 50, y * 100, 7, 255];
    for (const topDown of [false, true]) {
      const r = bmp.decode(mkBmp(3, 2, 24, f, { topDown }));
      assert.equal(r.error, undefined); assert.equal(r.format, 'BMP 24-bit');
      assert.deepEqual(px(r, 2, 0), [100, 0, 7, 255]); assert.deepEqual(px(r, 1, 1), [50, 100, 7, 255]);
    }
  });
  t('bmp: 8-bit and 1-bit palettes', () => {
    const pal = [[0, 0, 0], [255, 0, 0], [0, 0, 255]];
    let r = bmp.decode(mkBmp(5, 2, 8, (x, y) => (x + y) % 3, { pal }));
    assert.deepEqual(px(r, 1, 0), [255, 0, 0, 255]); assert.deepEqual(px(r, 1, 1), [0, 0, 255, 255]);
    r = bmp.decode(mkBmp(9, 1, 1, x => x & 1, { pal: [[0, 0, 0], [255, 255, 255]] }));
    assert.deepEqual(px(r, 0, 0), [0, 0, 0, 255]); assert.deepEqual(px(r, 8, 0), [0, 0, 0, 255]); assert.deepEqual(px(r, 7, 0), [255, 255, 255, 255]);
  });
  t('bmp: 32-bit plain ignores alpha; alpha bitfields read it', () => {
    const f = () => [1, 2, 3, 77];
    assert.deepEqual(px(bmp.decode(mkBmp(2, 2, 32, f)), 0, 0), [1, 2, 3, 255]);
    const r = bmp.decode(mkBmp(2, 2, 32, f, { comp: 6, masks: [0xff0000, 0xff00, 0xff, 0xff000000] }));
    assert.deepEqual(px(r, 1, 1), [1, 2, 3, 77]); assert.match(r.format, /with alpha/);
  });
  t('bmp: refusals (RLE, not a BMP, short)', () => {
    assert.match(bmp.decode(mkBmp(2, 2, 8, () => 0, { comp: 1, pal: [[0, 0, 0]] })).error, /RLE/);
    assert.match(bmp.decode(Buffer.from('nope')).error, /not a BMP/);
    const b = mkBmp(4, 4, 24, () => [0, 0, 0]); assert.match(bmp.decode(b.subarray(0, b.length - 20)).error, /shorter/);
  });
  // ---------------------------------------------------------------- PSD
  t('psd: RGB + alpha raw, grey RLE', () => {
    let r = psd.decode(mkPsd(2, 2, 3, [[255, 0, 0, 9], [0, 255, 0, 9], [0, 0, 255, 9], [255, 255, 128, 0]], false));
    assert.equal(r.error, undefined); assert.equal(r.format, 'PSD RGB 8-bit');
    assert.deepEqual(px(r, 0, 0), [255, 0, 0, 255]); assert.deepEqual(px(r, 1, 0), [0, 255, 0, 255]); assert.deepEqual(px(r, 0, 1), [0, 0, 255, 128]); assert.deepEqual(px(r, 1, 1), [9, 9, 9, 0]);
    r = psd.decode(mkPsd(3, 2, 1, [[1, 2, 3, 4, 5, 6]], true));
    assert.equal(r.format, 'PSD grey 8-bit'); assert.deepEqual(px(r, 2, 1), [6, 6, 6, 255]);
  });
  t('psd: refusals', () => {
    const b = mkPsd(2, 2, 3, [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], false); const z = Buffer.from(b); z.writeUInt16BE(2, z.length - 12 - 2);
    assert.match(psd.decode(Buffer.from('8BPS')).error, /not a PSD/);
    const lab = Buffer.from(b); lab.writeUInt16BE(9, 24); assert.match(psd.decode(lab).error, /Lab/);
  });
  // ---------------------------------------------------------------- DDS through picture.js: facts, the game's verdicts, cube faces
  t('dds: facts and verdicts (DXT1 ok, DX10, 24-bit, sides not multiple of 4, volume, cube)', () => {
    let f = P.facts('dds', mkDds(8, 8, { four: 'DXT1', data: Buffer.alloc(32) }));
    assert.equal(f.format, 'DXT1'); assert.equal(f.alpha, '1-bit'); assert.equal(f.game.ok, true);
    assert.equal(P.facts('dds', mkDds(8, 8, { four: 'DX10' })).game.why, 'dx10');
    f = P.facts('dds', mkDds(4, 4, { flags: 0x40, bits: 24, masks: [0xff0000, 0xff00, 0xff, 0] }));
    assert.equal(f.format, 'R8G8B8'); assert.equal(f.game.why, 'format');
    assert.equal(P.facts('dds', mkDds(4, 4, { flags: 0x41, bits: 32, masks: [0xff0000, 0xff00, 0xff, 0xff000000] })).format, 'A8R8G8B8');
    assert.equal(P.facts('dds', mkDds(6, 6, { four: 'DXT5' })).game.why, 'dxt4');
    assert.equal(P.facts('dds', mkDds(4, 4, { four: 'DXT1', depth: 1 })).game.why, 'volume');
    assert.equal(P.facts('dds', mkDds(4, 4, { four: 'DXT1', caps2: 0x200 | 0x400 })).game.why, 'cubefaces');
    assert.equal(P.facts('dds', mkDds(16384, 4, { four: 'DXT1' })).game.why, 'big');
    assert.match(P.facts('dds', Buffer.alloc(10)).error, /short/);
  });
  t('dds: decode a cube face and a mip', () => {
    const RED = 0xf800, BLUE = 0x001f, faces = [];
    for (let i = 0; i < 6; i++) faces.push(dxt1(i === 2 ? BLUE : RED, 0, 0), dxt1(RED, 0, 0));   // each face: 4x4 mip 0 + 2x2 mip 1 (one block each)
    const b = mkDds(4, 4, { four: 'DXT1', mips: 2, caps2: 0xfe00, data: Buffer.concat(faces) });
    const f = P.facts('dds', b); assert.equal(f.cube, true); assert.equal(f.faces, 6); assert.equal(f.game.ok, true);
    let r = P.decode('dds', b, { face: 2 }); assert.equal(r.face, 2); assert.deepEqual(px(r, 0, 0), [0, 0, 255, 255]);
    r = P.decode('dds', b, {}); assert.deepEqual(px(r, 0, 0), [255, 0, 0, 255]); assert.equal(r.mips, 2);
    r = P.decode('dds', b, { mip: 1 }); assert.equal(r.width, 2); assert.equal(r.mip, 1); assert.equal(r.srcWidth, 2);
  });
  // ---------------------------------------------------------------- PNG / JPEG headers (the browser draws them)
  t('png and jpeg: size and alpha from the header, passed through', () => {
    const png = Buffer.alloc(45); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png); png.writeUInt32BE(13, 8); png.write('IHDR', 12, 'latin1');
    png.writeUInt32BE(400, 16); png.writeUInt32BE(300, 20); png[24] = 8; png[25] = 6; png.writeUInt32BE(0, 33); png.write('IEND', 37, 'latin1');
    const f = P.decode('png', png); assert.equal(f.pass, 'image/png'); assert.equal(f.width, 400); assert.equal(f.alpha, 'yes'); assert.equal(f.format, 'PNG RGBA 8-bit');
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 50, 0, 70, 3, 1, 1, 1, 0, 0]);
    const j = P.decode('jpg', jpg); assert.equal(j.pass, 'image/jpeg'); assert.equal(j.width, 70); assert.equal(j.height, 50);
  });
  // ---------------------------------------------------------------- .ebm / .tex descriptions
  t('ebm: bitmap, animation, reference, comments; frame keys', () => {
    let d = ebm.parse('{bitmap\n\t{Axis  4 10 }\n\t{Filtering  1 }\n\t{AlphaChannel  0 }\n\t{Blend  None }\n\t{Frame  "mine_f.dds" }\n}\n');
    assert.equal(d.root, 'bitmap'); assert.equal(d.frames[0].file, 'mine_f.dds'); assert.equal(d.keys.axis, '4 10'); assert.equal(d.keys.blend, 'None');
    d = ebm.parse('{Bitmap\r\n\t{Animation}\r\n ; {Frame "x.dds"}\r\n\t{Frame "a01.dds" 100}\r\n\t{Frame "a02.dds" 100 {Axis 1 2}}\r\n}\r\n');
    assert.equal(d.frames.length, 2); assert.equal(d.frames[1].delay, 100); assert.equal(d.keys.animation, true);
    d = ebm.parse('{reference "/texture/common/wall/wall_euro_sh_32#2"}'); assert.equal(d.root, 'reference'); assert.equal(d.ref, '/texture/common/wall/wall_euro_sh_32#2');
    assert.match(ebm.parse(';SDL\r\n{textures {alpha}}').error, /textures/);
    assert.equal(ebm.frameKey('resource/inventory/mined_view/flag1.ebm', 'mine_f.dds'), 'resource/inventory/mined_view/mine_f.dds');
    assert.equal(ebm.frameKey('resource/texture/a/b.ebm', '/Texture/C/d'), 'resource/texture/c/d');
    assert.equal(ebm.frameKey('resource/texture/a/b.ebm', '..\\x.tga'), 'resource/texture/x.tga');
    assert.deepEqual(ebm.candidates('resource/t/x'), ['resource/t/x.tex', 'resource/t/x.ebm', 'resource/t/x.png', 'resource/t/x.jpg', 'resource/t/x.bmp', 'resource/t/x.tga', 'resource/t/x.dds']);
    assert.deepEqual(ebm.candidates('resource/t/x.dds'), ['resource/t/x.dds']);
  });
  // ---------------------------------------------------------------- the verdicts
  t('notes: shadow, wins, tga flags, npot, nomips, psd', () => {
    const code = a => a.map(n => n.code).sort().join(',');
    assert.equal(P.winner('resource/t/a.dds', ['resource/t/a.dds', 'resource/t/a.tga']), 'resource/t/a.tga');
    assert.equal(P.winner('resource/t/a.dds', ['resource/t/a.tga', 'resource/t/a.ebm', 'resource/t/a.tex']), 'resource/t/a.tex');
    let n = P.notes({ type: 'dds', width: 256, height: 256, mips: 9, game: { ok: true } }, { key: 'resource/t/a.dds', siblings: ['resource/t/a.dds', 'resource/t/a.tga'] });
    assert.equal(code(n), 'shadow'); assert.match(n[0].msg, /a\.tga/);
    n = P.notes({ type: 'tga', width: 100, height: 64, tga: { rightToLeft: true, bpp: 16 }, game: { ok: true } }, { key: 'resource/t/a.tga', siblings: ['resource/t/a.dds', 'resource/t/a.tga'] });
    assert.equal(code(n), 'npot,tga16,tgaRtl,wins');
    assert.equal(code(P.notes({ type: 'dds', width: 512, height: 512, mips: 1, game: { ok: true } }, { key: 'resource/texture/x.dds' })), 'nomips');
    assert.equal(code(P.notes({ type: 'dds', width: 512, height: 300, mips: 1, game: { ok: true } }, { key: 'resource/interface/x.dds' })), '');
    assert.equal(code(P.notes({ type: 'psd', width: 64, height: 64, game: { ok: false, why: 'psd' } }, {})), 'psd');
    n = P.notes({ type: 'dds', format: 'R8G8B8', width: 4, height: 4, mips: 1, game: { ok: false, why: 'format' } }, {});
    assert.equal(code(n), 'format'); assert.match(n[0].msg, /R8G8B8/);
    assert.equal(P.typeOf('a/B.JPEG'), 'jpg'); assert.equal(P.typeOf('x.tex'), 'desc'); assert.equal(P.typeOf('x.mdl'), null);
  });

  // ---------------------------------------------------------------- the sweep over the game's own pictures
  let gdir = process.env.AS2_GAME;
  if (!gdir) try { gdir = require('../gamedir').resolve().dir; } catch (e) { gdir = null; }
  const fs = require('fs'), path = require('path');
  if (process.env.PICTURE_SWEEP === '0' || !gdir || !fs.existsSync(path.join(gdir, 'resource'))) { console.log('sweep: skipped (no game, or PICTURE_SWEEP=0)'); return; }
  t('sweep: the game\'s pictures decode', () => {
    const pak = require('../pak'), paks = [];
    (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) w(f); else if (/\.(pak|pat)$/i.test(e.name)) paks.push(f); } })(path.join(gdir, 'resource'));
    const by = {};
    for (const p of paks) { let l; try { l = pak.list(p); } catch { continue; } for (const e of l) { const ty = P.typeOf(e.name); if (ty) (by[ty] = by[ty] || []).push([l, e]); } }
    const all = process.env.PICTURE_SWEEP === 'all', stat = {}, fails = {}, verdict = {}, fmt = {}, t0 = Date.now();
    for (const ty of Object.keys(by).sort()) {
      let list = by[ty];
      if (ty === 'dds' && !all) { const step = Math.max(1, Math.floor(list.length / 300)); list = list.filter((x, i) => i % step === 0).slice(0, 300); }
      const s = stat[ty] = { found: by[ty].length, tried: 0, ok: 0, failed: 0 };
      for (const [l, e] of list) {
        let b; try { b = pak.read(l, e); } catch { continue; }
        s.tried++;
        let err = null;
        if (ty === 'desc') { const d = ebm.parse(b); err = d.error; fmt['desc ' + d.root] = (fmt['desc ' + d.root] || 0) + 1; }
        else {
          const f = Object.assign(P.facts(ty, b), { type: ty }); fmt[f.format] = (fmt[f.format] || 0) + 1;
          const r = P.decode(ty, b, { maxSize: 256 }); err = r.error;
          if (!err && r.alphaAllZero) f.alphaZero = true;
          for (const n of P.notes(f, { key: 'resource/' + e.name.toLowerCase() })) verdict[ty + ' ' + n.code] = (verdict[ty + ' ' + n.code] || 0) + 1;
        }
        if (err) { s.failed++; (fails[ty] = fails[ty] || []).push(e.name + ': ' + err); } else s.ok++;
      }
    }
    console.log('sweep (' + (Date.now() - t0) + ' ms): ' + Object.entries(stat).map(([k, s]) => k + ' ' + s.ok + '/' + s.tried + ' ok (' + s.found + ' in the game)').join('; '));
    console.log('sweep formats: ' + Object.entries(fmt).map(([k, v]) => k + ' ' + v).join(', '));
    console.log('sweep verdicts: ' + Object.entries(verdict).map(([k, v]) => k + ' ' + v).join(', '));
    for (const ty in fails) console.log('sweep failures ' + ty + ' ' + fails[ty].length + ': ' + fails[ty].slice(0, 5).join(' | '));
    assert.equal(Object.values(stat).reduce((a, s) => a + s.failed, 0), 0, 'every picture decodes');
  });
}

module.exports = tests;
if (require.main === module) {
  const assert = require('assert');
  let n = 0, bad = 0;
  const t = (name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
  tests(t, assert);
  console.log(`${n} ok, ${bad} failed`);
  console.log(bad ? 'FAIL' : 'PASS');
  if (bad) process.exitCode = 1;
}
