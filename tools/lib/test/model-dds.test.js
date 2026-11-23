// lib/model/dds.js unit tests: synthetic DDS files built byte by byte (DXT1 both modes, DXT3, DXT5, 32-bit BGRA, 24-bit,
// DX10 BC1, mips and maxSize, refusals). Run inside tools/lib/test/test.js or alone: node tools/lib/test/model-dds.test.js
// Author: Imperator_Aug (ARSENAL, ia-8414b2a7)
'use strict';
module.exports = (t, assert) => {
  const dds = require('../model/dds');
  const u32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }));
  const u16 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }));
  function head(w, h, mips, pf) {   // pf: { flags, four, bits, masks }
    const hd = Buffer.alloc(124);
    hd.writeUInt32LE(124, 0); hd.writeUInt32LE(0x1007 | (mips > 1 ? 0x20000 : 0), 4); hd.writeUInt32LE(h, 8); hd.writeUInt32LE(w, 12);
    hd.writeUInt32LE(mips, 24); hd.writeUInt32LE(32, 72); hd.writeUInt32LE(pf.flags, 76);
    if (pf.four) hd.write(pf.four, 80, 'latin1');
    hd.writeUInt32LE(pf.bits || 0, 84);
    (pf.masks || [0, 0, 0, 0]).forEach((m, i) => hd.writeUInt32LE(m >>> 0, 88 + i * 4));
    return Buffer.concat([Buffer.from('DDS ', 'latin1'), hd]);
  }
  const RED = 0xf800, BLUE = 0x001f, WHITE = 0xffff, BLACK = 0;
  const px = (r, x, y, w) => Array.from(r.rgba.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

  t('dds: DXT1 4-colour block, indices per pixel', () => {
    // c0 red > c1 blue: index 0 red, 1 blue, 2 = 2/3 red, 3 = 1/3 red. Row 0: 0,1,2,3; other rows 0.
    const blk = Buffer.concat([u16(RED, BLUE), u32(0 | (1 << 2) | (2 << 4) | (3 << 6))]);
    const r = dds.decode(Buffer.concat([head(4, 4, 1, { flags: 4, four: 'DXT1' }), blk]));
    assert.equal(r.error, undefined); assert.equal(r.format, 'DXT1'); assert.equal(r.width, 4);
    assert.deepEqual(px(r, 0, 0, 4), [255, 0, 0, 255]); assert.deepEqual(px(r, 1, 0, 4), [0, 0, 255, 255]);
    assert.deepEqual(px(r, 2, 0, 4), [170, 0, 85, 255]); assert.deepEqual(px(r, 3, 0, 4), [85, 0, 170, 255]);
    assert.deepEqual(px(r, 3, 3, 4), [255, 0, 0, 255]);
  });
  t('dds: DXT1 3-colour mode has a transparent index 3; size not a multiple of 4 is cut', () => {
    const blk = Buffer.concat([u16(BLACK, WHITE), u32(3 | (2 << 2))]);
    const r = dds.decode(Buffer.concat([head(2, 3, 1, { flags: 4, four: 'DXT1' }), blk]));
    assert.equal(r.width, 2); assert.equal(r.height, 3); assert.equal(r.rgba.length, 2 * 3 * 4);
    assert.deepEqual(px(r, 0, 0, 2), [0, 0, 0, 0]); assert.deepEqual(px(r, 1, 0, 2), [127, 127, 127, 255]);
  });
  t('dds: DXT3 explicit alpha, DXT5 interpolated alpha', () => {
    const col = Buffer.concat([u16(WHITE, BLACK), u32(0)]);
    const a3 = Buffer.from([0x0f, 0xf0, 0, 0, 0, 0, 0, 0]);   // pixel 0 alpha 15*17, pixel 1 0, pixel 2 0, pixel 3 255
    let r = dds.decode(Buffer.concat([head(4, 4, 1, { flags: 4, four: 'DXT3' }), a3, col]));
    assert.equal(r.format, 'DXT3'); assert.deepEqual([px(r, 0, 0, 4)[3], px(r, 1, 0, 4)[3], px(r, 3, 0, 4)[3]], [255, 0, 255]);
    // a0 200 > a1 100: index 0 = 200, 1 = 100, 2 = (6*200+100)/7 = 185; pixel 0 idx 0, pixel 1 idx 1, pixel 2 idx 2
    const bits = 0 | (1 << 3) | (2 << 6);
    const a5 = Buffer.from([200, 100, bits & 255, (bits >> 8) & 255, 0, 0, 0, 0]);
    r = dds.decode(Buffer.concat([head(4, 4, 1, { flags: 4, four: 'DXT5' }), a5, col]));
    assert.deepEqual([px(r, 0, 0, 4)[3], px(r, 1, 0, 4)[3], px(r, 2, 0, 4)[3]], [200, 100, 185]);
    assert.deepEqual(px(r, 0, 0, 4).slice(0, 3), [255, 255, 255]);
    // a0 <= a1: six-step mode with 0 and 255 at 6 and 7
    const a5b = Buffer.from([10, 20, 6 | (7 << 3), 0, 0, 0, 0, 0]);
    r = dds.decode(Buffer.concat([head(4, 4, 1, { flags: 4, four: 'DXT5' }), a5b, col]));
    assert.deepEqual([px(r, 0, 0, 4)[3], px(r, 1, 0, 4)[3]], [0, 255]);
  });
  t('dds: 32-bit BGRA, 24-bit BGR, DX10 BC1', () => {
    const pf = { flags: 0x41, bits: 32, masks: [0xff0000, 0xff00, 0xff, 0xff000000] };
    const data = Buffer.from([10, 20, 30, 40, 1, 2, 3, 4]);   // B G R A
    let r = dds.decode(Buffer.concat([head(2, 1, 1, pf), data]));
    assert.equal(r.format, 'RGBA32'); assert.deepEqual(Array.from(r.rgba), [30, 20, 10, 40, 3, 2, 1, 4]);
    r = dds.decode(Buffer.concat([head(1, 1, 1, { flags: 0x40, bits: 24, masks: [0xff0000, 0xff00, 0xff, 0] }), Buffer.from([7, 8, 9])]));
    assert.deepEqual(Array.from(r.rgba), [9, 8, 7, 255]);
    const dx = Buffer.concat([head(4, 4, 1, { flags: 4, four: 'DX10' }), u32(71, 3, 0, 1, 0), u16(RED, RED), u32(0)]);
    r = dds.decode(dx); assert.equal(r.format, 'DXT1'); assert.deepEqual(px(r, 2, 2, 4), [255, 0, 0, 255]);
  });
  t('dds: maxSize takes the first mip that fits; without mips it box-filters', () => {
    const pf = { flags: 0x41, bits: 32, masks: [0xff0000, 0xff00, 0xff, 0xff000000] };
    const top = Buffer.alloc(4 * 4 * 4, 0x10), m1 = Buffer.alloc(2 * 2 * 4, 0x80), m2 = Buffer.alloc(4, 0xf0);
    let r = dds.decode(Buffer.concat([head(4, 4, 3, pf), top, m1, m2]), { maxSize: 2 });
    assert.equal(r.mip, 1); assert.equal(r.width, 2); assert.equal(r.rgba[0], 0x80); assert.ok(!r.scaled);
    r = dds.decode(Buffer.concat([head(4, 4, 3, pf), top, m1, m2]), { mip: 2 });
    assert.equal(r.width, 1); assert.equal(r.rgba[0], 0xf0);
    r = dds.decode(Buffer.concat([head(4, 4, 1, pf), top]), { maxSize: 2 });
    assert.equal(r.width, 2); assert.ok(r.scaled); assert.equal(r.rgba[0], 0x10);
    const d = dds.downscale(new Uint8Array([0, 0, 0, 0, 4, 4, 4, 4, 8, 8, 8, 8, 12, 12, 12, 12]), 2, 2, 1);
    assert.deepEqual(Array.from(d.rgba), [6, 6, 6, 6]);
  });
  t('dds: refusals name the format', () => {
    assert.match(dds.decode(Buffer.from('nope')).error, /not a DDS/);
    assert.match(dds.decode(Buffer.concat([head(4, 4, 1, { flags: 4, four: 'ATI1' }), Buffer.alloc(16)])).error, /ATI1 is not read/);
    assert.match(dds.decode(Buffer.concat([head(4, 4, 1, { flags: 4, four: 'DX10' }), u32(98, 3, 0, 1, 0)])).error, /DX10 format 98/);
    assert.match(dds.decode(head(8, 8, 1, { flags: 4, four: 'DXT1' })).error, /shorter/);
  });
};
if (require.main === module) {
  const assert = require('assert'); let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } }, assert);
  console.log(bad ? `FAIL ${bad} failed, ${n} passed` : `${n} passed\nPASS`);
  process.exitCode = bad ? 1 : 0;
}
