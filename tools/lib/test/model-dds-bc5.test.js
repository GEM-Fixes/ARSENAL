// lib/model/dds.js BC5 decode: hand-built ATI2 / BC5U / DX10 BC5 blocks (both BC4 modes, cut sizes, mips), refusals, and a
// real GoH normal map when the install is there (r, g against the goh2as2 converter's own decode; x*x + y*y <= 1).
// Run inside tools/lib/test/test.js or alone: node tools/lib/test/model-dds-bc5.test.js   (MAPVIZ_NO_GAME=1 skips the game read)
// Author: Imperator_Aug (ARSENAL, ia-baf88810)
'use strict';
module.exports = (t, assert) => {
  const fs = require('fs'), path = require('path');
  const dds = require('../model/dds');
  const u32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }));
  function head(w, h, mips, four) {
    const hd = Buffer.alloc(124);
    hd.writeUInt32LE(124, 0); hd.writeUInt32LE(0x1007 | (mips > 1 ? 0x20000 : 0), 4); hd.writeUInt32LE(h, 8); hd.writeUInt32LE(w, 12);
    hd.writeUInt32LE(mips, 24); hd.writeUInt32LE(32, 72); hd.writeUInt32LE(4, 76); hd.write(four, 80, 'latin1');
    return Buffer.concat([Buffer.from('DDS ', 'latin1'), hd]);
  }
  // one BC4 block: endpoints and 16 3-bit indices
  function bc4(e0, e1, idx) {
    const b = Buffer.alloc(8); b[0] = e0; b[1] = e1;
    for (let half = 0; half < 2; half++) {
      let v = 0; for (let i = 0; i < 8; i++) v |= (idx[half * 8 + i] & 7) << (3 * i);
      b[2 + half * 3] = v & 255; b[3 + half * 3] = (v >> 8) & 255; b[4 + half * 3] = (v >> 16) & 255;
    }
    return b;
  }
  const IDX = [0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 0];
  // red: e0 200 > e1 10, eight levels rounded: 200, 10, 173, 146, 119, 91, 64, 37
  const RED = [200, 10, 173, 146, 119, 91, 64, 37];
  // green: e0 10 <= e1 20, six levels + 0 and 255: 10, 20, 12, 14, 16, 18, 0, 255
  const GREEN = [10, 20, 12, 14, 16, 18, 0, 255];
  const blk = Buffer.concat([bc4(200, 10, IDX), bc4(10, 20, IDX)]);
  const px = (r, x, y, w) => Array.from(r.rgba.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

  t('dds bc5: ATI2 block: r from the first BC4 block, g from the second, b 0, a 255; both BC4 modes', () => {
    const r = dds.decode(Buffer.concat([head(4, 4, 1, 'ATI2'), blk]));
    assert.equal(r.error, undefined); assert.equal(r.format, 'BC5'); assert.equal(r.width, 4);
    for (let i = 0; i < 16; i++) assert.deepEqual(px(r, i & 3, i >> 2, 4), [RED[IDX[i]], GREEN[IDX[i]], 0, 255], 'pixel ' + i);
  });
  t('dds bc5: BC5U fourCC and DX10 BC5 (83 unorm, 82 typeless) read the same; parse gives 16-byte blocks', () => {
    const a = dds.decode(Buffer.concat([head(4, 4, 1, 'ATI2'), blk]));
    const b = dds.decode(Buffer.concat([head(4, 4, 1, 'BC5U'), blk]));
    const c = dds.decode(Buffer.concat([head(4, 4, 1, 'DX10'), u32(83, 3, 0, 1, 0), blk]));
    const d = dds.decode(Buffer.concat([head(4, 4, 1, 'DX10'), u32(82, 3, 0, 1, 0), blk]));
    for (const x of [b, c, d]) { assert.equal(x.format, 'BC5'); assert.deepEqual(Array.from(x.rgba), Array.from(a.rgba)); }
    const p = dds.parse(Buffer.concat([head(4, 4, 1, 'ATI2'), blk])); assert.equal(p.blockBytes, 16); assert.equal(p.format, 'BC5');
  });
  t('dds bc5: size not a multiple of 4 is cut; mips and maxSize step 16 bytes per block', () => {
    const r = dds.decode(Buffer.concat([head(2, 3, 1, 'ATI2'), blk]));
    assert.equal(r.width, 2); assert.equal(r.height, 3); assert.equal(r.rgba.length, 2 * 3 * 4);
    assert.deepEqual(px(r, 1, 2, 2), [RED[IDX[9]], GREEN[IDX[9]], 0, 255]);
    // 8x8: 4 blocks of flat red 50, then 4x4 (1 block) flat red 99, then 2x2 and 1x1 flat red 7
    const flat = v => Buffer.concat([bc4(v, v, new Array(16).fill(0)), bc4(0, 0, new Array(16).fill(0))]);
    const file = Buffer.concat([head(8, 8, 4, 'ATI2'), flat(50), flat(50), flat(50), flat(50), flat(99), flat(7), flat(7)]);
    let m = dds.decode(file, { mip: 1 }); assert.equal(m.width, 4); assert.equal(m.rgba[0], 99);
    m = dds.decode(file, { maxSize: 2 }); assert.equal(m.mip, 2); assert.equal(m.rgba[0], 7);
    m = dds.decode(file); assert.equal(m.rgba[(7 * 8 + 7) * 4], 50);
  });
  t('dds bc5: seeded bad input: truncated data, signed BC5S and DX10 BC5 snorm are refused', () => {
    assert.match(dds.decode(Buffer.concat([head(8, 8, 1, 'ATI2'), blk])).error, /shorter/);
    assert.match(dds.decode(Buffer.concat([head(4, 4, 1, 'BC5S'), blk])).error, /BC5S is not read/);
    assert.match(dds.decode(Buffer.concat([head(4, 4, 1, 'DX10'), u32(84, 3, 0, 1, 0), blk])).error, /DX10 format 84/);
    assert.match(dds.decode(Buffer.concat([head(4, 4, 1, 'ATI1'), Buffer.alloc(8)])).error, /ATI1 is not read/);
  });
  t('dds bc5: same values as the goh2as2 converter decodeBC4 for every endpoint order', () => {
    let tc = null; try { tc = require('../../goh2as2/texconv'); } catch (e) { console.log('skip decodeBC4 cross-check: tools/goh2as2/texconv.js absent'); return; }
    for (const [e0, e1] of [[0, 255], [255, 0], [7, 7], [100, 101], [254, 3], [3, 254]]) {
      const ix = IDX.map((v, i) => (v + i + e0) & 7), b = Buffer.concat([bc4(e0, e1, ix), bc4(e1, e0, ix)]);
      const r = dds.decode(Buffer.concat([head(4, 4, 1, 'ATI2'), b])), X = tc.decodeBC4(b, 0), Y = tc.decodeBC4(b, 8);
      for (let i = 0; i < 16; i++) { assert.equal(r.rgba[i * 4], X[i]); assert.equal(r.rgba[i * 4 + 1], Y[i]); }
    }
  });
  t('dds bc5: a real GoH normal map (ATI2) decodes; r, g agree with the goh2as2 converter (game install)', () => {
    if (process.env.MAPVIZ_NO_GAME === '1') { console.log('skip real GoH BC5: MAPVIZ_NO_GAME=1'); return; }
    let g = null; try { g = require('../gamedir').goh(); } catch (e) { g = null; }
    const file = g && path.join(g, 'resource/texture/common/common.pak');
    if (!g || !fs.existsSync(path.join(g, 'resource/map/multi.pak')) || !fs.existsSync(file)) { console.log('skip real GoH BC5: no GoH install'); return; }
    const pak = require('../pak'), ents = pak.list(file);
    let buf = null;
    for (const e of ents) {
      if (!/_nm\.dds$/i.test(e.name) || e.size > 400000) continue;
      const b = pak.read(ents, e); if (b.toString('latin1', 84, 88) === 'ATI2' || b.toString('latin1', 84, 88) === 'BC5U') { buf = b; break; }
    }
    if (!buf) { console.log('skip real GoH BC5: no ATI2 normal map found in texture/common/common.pak'); return; }
    const r = dds.decode(buf); assert.equal(r.error, undefined); assert.equal(r.format, 'BC5');
    let out = 0;
    for (let i = 0; i < r.width * r.height; i++) {
      assert.equal(r.rgba[i * 4 + 2], 0); assert.equal(r.rgba[i * 4 + 3], 255);
      const x = r.rgba[i * 4] * 2 - 255, y = r.rgba[i * 4 + 1] * 2 - 255;
      if (x * x + y * y > 255 * 255 * 1.05) out++;
    }
    assert.ok(out <= r.width * r.height / 20, 'normals longer than 1: ' + out + ' of ' + r.width * r.height);   // block rounding: a few
    let tc = null; try { tc = require('../../goh2as2/texconv'); } catch (e) { return; }
    const c = tc.convert(buf);   // B G R A per pixel, A = x, G = y, first level first
    for (let i = 0; i < r.width * r.height; i++) { assert.equal(r.rgba[i * 4], c.buf[128 + i * 4 + 3]); assert.equal(r.rgba[i * 4 + 1], c.buf[128 + i * 4 + 1]); }
  });
};
if (require.main === module) {
  const assert = require('assert'); let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } }, assert);
  console.log(bad ? `FAIL ${bad} failed, ${n} passed` : `${n} passed\nPASS`);
  process.exitCode = bad ? 1 : 0;
}
