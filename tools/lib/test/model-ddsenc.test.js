// lib/model/ddsenc.js unit tests: DXT1 encoder round trip through dds.js, the four seeded blocks (flat, 2-colour, gradient,
// alpha 0), golden sha1 with and without best, header fields (also against shipped previews and minimaps when a game is
// installed), mip counts and file lengths, DDSENC_SIZE, timing for 1920x1080 (printed, not asserted).
// Run inside tools/lib/test/test.js or alone: node tools/lib/test/model-ddsenc.test.js   (MAPVIZ_NO_GAME=1 skips game reads)
// Author: Imperator_Aug (ARSENAL, ia-c4fbc3ff)
'use strict';
module.exports = (t, assert) => {
  const fs = require('fs'), path = require('path'), crypto = require('crypto');
  const enc = require('../model/ddsenc'), dds = require('../model/dds');
  const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
  const hash = (x, y, s) => {   // integer hash of a position and a seed
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 0x2545f491)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  };
  const cl = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  function picture(w, h) {   // gradient + noise, opaque
    const p = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, n = hash(x, y, 1);
      p[i] = cl(((x * 255) / Math.max(1, w - 1) | 0) + (n & 15) - 8);
      p[i + 1] = cl(((y * 255) / Math.max(1, h - 1) | 0) + ((n >> 4) & 15) - 8);
      p[i + 2] = ((x + y) * 2) & 255; p[i + 3] = 255;
    }
    return p;
  }
  const flatPic = (w, h, c) => { const p = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) p.set(c, i * 4); return p; };
  const block = f => { const p = new Uint8Array(64); for (let i = 0; i < 16; i++) p.set(f(i & 3, i >> 2), i * 4); return p; };
  const maxErr = (a, b, n) => { let m = 0; for (let i = 0; i < n * 4; i++) if ((i & 3) !== 3) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
  const rmse = (a, b, n) => { let s = 0; for (let i = 0; i < n * 4; i++) if ((i & 3) !== 3) s += (a[i] - b[i]) * (a[i] - b[i]); return Math.sqrt(s / (n * 3)); };
  const roundTrip = px => {   // one block -> 4x4 DDS without mips -> dds.js decode
    const b = enc.encode(px, 4, 4, { mips: false }), d = dds.decode(b);
    assert.equal(d.error, undefined); assert.equal(d.format, 'DXT1');
    assert.deepEqual(b.subarray(128), enc.encodeBlock(px, false), 'encode and encodeBlock agree');
    return { b, d, c0: b.readUInt16LE(128), c1: b.readUInt16LE(130) };
  };
  // expected file length: every level padded to whole 4x4 blocks of 8 bytes
  const expectLen = (w, h) => { let n = 128, k = 0; for (;;) { n += Math.ceil(w / 4) * Math.ceil(h / 4) * 8; k++; if (w === 1 && h === 1) break; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); } return { n, k }; };
  const allFourColour = b => { for (let o = 128; o < b.length; o += 8) if (!(b.readUInt16LE(o) > b.readUInt16LE(o + 2))) return o; return 0; };

  t('ddsenc: seeded flat block: one colour, 4-colour mode, error within the single-colour bound', () => {
    for (const c of [[13, 200, 77, 255], [0, 0, 0, 255], [255, 255, 255, 255], [128, 64, 250, 255]]) {
      const px = block(() => c), r = roundTrip(px);
      assert.ok(r.c0 > r.c1, 'c0 > c1 for ' + c);
      assert.ok(maxErr(px, r.d.rgba, 16) <= 3, 'flat ' + c + ' max error ' + maxErr(px, r.d.rgba, 16));
      for (let i = 1; i < 16; i++) assert.deepEqual(Array.from(r.d.rgba.slice(i * 4, i * 4 + 4)), Array.from(r.d.rgba.slice(0, 4)), 'flat stays flat');
    }
  });
  t('ddsenc: seeded 2-colour block: both colours within 565 rounding', () => {
    const A = [200, 30, 90, 255], B = [20, 180, 240, 255];
    const px = block((x, y) => ((x + y) & 1 ? A : B)), r = roundTrip(px);
    assert.ok(r.c0 > r.c1);
    assert.ok(maxErr(px, r.d.rgba, 16) <= 5, '2-colour max error ' + maxErr(px, r.d.rgba, 16));
    // the 565 endpoints are the two colours: equal 565 values in the block nudge apart (black and white too)
    const bw = roundTrip(block((x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255])));
    assert.equal(bw.c0, 0xffff); assert.equal(bw.c1, 0); assert.equal(maxErr(block((x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255])), bw.d.rgba, 16), 0);
  });
  t('ddsenc: seeded gradient block: four even steps on a line, error within 565 rounding', () => {
    const px = block(x => [40 + x * 40, 100 + x * 20, 200 - x * 30, 255]), r = roundTrip(px);
    assert.ok(r.c0 > r.c1);
    assert.ok(maxErr(px, r.d.rgba, 16) <= 6, 'gradient max error ' + maxErr(px, r.d.rgba, 16));
    // 16 levels over a range of 240 on a line: 4 palette steps 80 apart, so the BC1 bound is range / 6 (+ 565 rounding)
    const px2 = block((x, y) => [x * 16 + y * 64, 255 - (x * 16 + y * 64), 128, 255]), r2 = roundTrip(px2);
    assert.ok(maxErr(px2, r2.d.rgba, 16) <= 240 / 6 + 4, '16-step gradient max error ' + maxErr(px2, r2.d.rgba, 16));
    assert.ok(rmse(px2, r2.d.rgba, 16) <= 24, '16-step gradient rmse ' + rmse(px2, r2.d.rgba, 16));
  });
  t('ddsenc: seeded alpha-0 input: opaque output, colour kept in every mip (same bytes as alpha 255)', () => {
    const p = picture(16, 8), z = Uint8Array.from(p);
    for (let i = 3; i < z.length; i += 4) z[i] = 0;
    const a = enc.encode(p, 16, 8), b = enc.encode(z, 16, 8);
    assert.equal(sha1(a), sha1(b));
    const d = dds.decode(b, { mip: 2 });
    assert.equal(d.rgba[3], 255); assert.ok(d.rgba[0] + d.rgba[1] + d.rgba[2] > 0, 'mip colour not black');
  });
  t('ddsenc: mipChain premultiplies: a transparent neighbour does not bleed its colour', () => {
    const p = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0]);
    const m = enc.mipChain(p, 2, 2);
    assert.equal(m.length, 2); assert.deepEqual(Array.from(m[1].rgba), [255, 0, 0, 64]);
    const o = enc.mipChain(new Uint8Array([10, 20, 30, 255, 11, 21, 31, 255, 12, 22, 32, 255, 13, 23, 33, 255]), 2, 2);
    assert.deepEqual(Array.from(o[1].rgba), [12, 22, 32, 255]);   // opaque: plain rounded mean
    const odd = enc.mipChain(new Uint8Array(15 * 8 * 4).fill(255), 15, 8);
    assert.deepEqual(odd.map(l => l.w + 'x' + l.h).join(' '), '15x8 7x4 3x2 1x1');
  });
  t('ddsenc: round trip of a gradient + noise picture; every block in 4-colour mode; best is not worse', () => {
    const p = picture(64, 64), a = enc.encode(p, 64, 64), b = enc.encode(p, 64, 64, { best: true });
    const da = dds.decode(a), db = dds.decode(b);
    assert.equal(allFourColour(a), 0, 'block with c0 <= c1 at byte ' + allFourColour(a)); assert.equal(allFourColour(b), 0);
    const ea = rmse(p, da.rgba, 4096), eb = rmse(p, db.rgba, 4096);
    assert.ok(ea < 6, 'rmse ' + ea); assert.ok(eb <= ea + 0.05, 'best ' + eb + ' vs ' + ea);
    for (let k = 1; k < 7; k++) { const m = dds.decode(a, { mip: k }); assert.equal(m.width, 64 >> k); assert.equal(m.mip, k); }
  });
  t('ddsenc: golden sha1 of the fixed 64x64 picture, with and without best (integer maths: same on every machine)', () => {
    const p = picture(64, 64);
    assert.equal(sha1(p), 'e5841cfd2edce38dc5fdcef7c018e045507fe01b');
    assert.deepEqual([sha1(enc.encode(p, 64, 64)), sha1(enc.encode(p, 64, 64, { best: true }))], ['8cf8a2eeefa3d69c0f3367190d1961bdc6b291fa', '49fe59ce771a2eed24f4c57cb64ae09f74ae38d3']);
  });
  t('ddsenc: header fields (DX9, DXT1, mip count, linear size) as the shipped previews', () => {
    const b = enc.encode(flatPic(400, 300, [50, 90, 30, 255]), 400, 300), u = o => b.readUInt32LE(o);
    assert.equal(b.toString('latin1', 0, 4), 'DDS '); assert.equal(u(4), 124); assert.equal(u(8), 0xa1007);
    assert.equal(u(12), 300); assert.equal(u(16), 400); assert.equal(u(20), 100 * 75 * 8); assert.equal(u(24), 0); assert.equal(u(28), 9);
    for (let o = 32; o < 76; o += 4) assert.equal(u(o), 0, 'reserved ' + o);
    assert.equal(u(76), 32); assert.equal(u(80), 4); assert.equal(b.toString('latin1', 84, 88), 'DXT1');
    for (let o = 88; o < 108; o += 4) assert.equal(u(o), 0);
    assert.equal(u(108), 0x401008); assert.equal(u(112), 0); assert.equal(u(116), 0); assert.equal(u(120), 0); assert.equal(u(124), 0);
    const p = dds.parse(b); assert.equal(p.error, null); assert.equal(p.format, 'DXT1'); assert.equal(p.mips, 9);
    const f = require('../model/picture').facts('dds', b); assert.equal(f.game.ok, true, JSON.stringify(f.game)); assert.equal(f.mips, 9);
    const one = enc.encode(flatPic(8, 8, [1, 2, 3, 255]), 8, 8, { mips: false });
    assert.equal(one.readUInt32LE(8), 0x81007); assert.equal(one.readUInt32LE(28), 1); assert.equal(one.readUInt32LE(108), 0x1000); assert.equal(one.length, 128 + 32);
  });
  t('ddsenc: mip count and padded length for 1920x1080, 4x4, 8x4, 400x300, 1500x1000', () => {
    const want = { '1920x1080': [11, 1383240], '4x4': [3, 152], '8x4': [4, 168], '400x300': [9, 80552], '1500x1000': [11, 0] };
    for (const k of Object.keys(want)) {
      const [w, h] = k.split('x').map(Number), b = enc.encode(flatPic(w, h, [90, 120, 60, 255]), w, h), e = expectLen(w, h);
      assert.equal(b.readUInt32LE(28), want[k][0], k + ' mips'); assert.equal(e.k, want[k][0]);
      assert.equal(b.length, e.n, k + ' length'); if (want[k][1]) assert.equal(b.length, want[k][1], k + ' length as shipped');
      const last = dds.decode(b, { mip: 99 }); assert.equal(last.width, 1); assert.equal(last.height, 1);
      assert.ok(maxErr(Uint8Array.from([90, 120, 60, 255]), last.rgba, 1) <= 3, k + ' 1x1 mip colour');
    }
  });
  t('ddsenc: DDSENC_SIZE for sides not a multiple of 4, empty sizes and short input (seeded bad input)', () => {
    const code = fn => { try { fn(); return 'no throw'; } catch (e) { return e.code; } };
    assert.equal(code(() => enc.encode(new Uint8Array(6 * 4 * 4), 6, 4)), 'DDSENC_SIZE');
    assert.equal(code(() => enc.encode(new Uint8Array(4 * 6 * 4), 4, 6)), 'DDSENC_SIZE');
    assert.equal(code(() => enc.encode(new Uint8Array(0), 0, 4)), 'DDSENC_SIZE');
    assert.equal(code(() => enc.encode(new Uint8Array(4.5 * 4 * 4), 4.5, 4)), 'DDSENC_SIZE');
    assert.equal(code(() => enc.encode(new Uint8Array(10), 4, 4)), 'DDSENC_SIZE');
    assert.equal(code(() => enc.encodeBlock(new Uint8Array(10))), 'DDSENC_SIZE');
    assert.equal(code(() => enc.encode(new Uint8Array(64), 4, 4)), 'no throw');
  });
  t('ddsenc: header matches shipped MoW:AS2 previews and GoH minimaps field by field (game install)', () => {
    if (process.env.MAPVIZ_NO_GAME === '1') { console.log('skip shipped headers: MAPVIZ_NO_GAME=1'); return; }
    const pak = require('../pak'), gamedir = require('../gamedir');
    const sets = [];
    try { const d = gamedir.resolve().dir; if (d && fs.existsSync(path.join(d, 'resource/map.pak'))) sets.push(['MoW:AS2', path.join(d, 'resource/map.pak'), /\/(preview|preview_small|minimap)\.dds$/i]); else console.log('skip shipped MoW:AS2 headers: no MoW:AS2 install'); } catch (e) { console.log('skip shipped MoW:AS2 headers: no MoW:AS2 install'); }
    try { const g = gamedir.goh(); if (g && fs.existsSync(path.join(g, 'resource/map/multi.pak'))) sets.push(['GoH', path.join(g, 'resource/map/multi.pak'), /\/(minimap|header|preview)\.dds$/i]); else console.log('skip shipped GoH headers: no GoH install'); } catch (e) { console.log('skip shipped GoH headers: no GoH install'); }
    for (const [game, file, re] of sets) {
      const ents = pak.list(file), seen = new Set();
      for (const e of ents) {
        const kind = (re.exec(e.name) || [])[1]; if (!kind || seen.has(kind.toLowerCase())) continue;
        const real = pak.read(ents, e);
        if (real.toString('latin1', 84, 88) !== 'DXT1' || real.readUInt32LE(28) < 2) continue;
        seen.add(kind.toLowerCase());
        const w = real.readUInt32LE(16), h = real.readUInt32LE(12), ours = enc.encode(flatPic(w, h, [70, 80, 90, 255]), w, h);
        const name = game + ' ' + e.name.split('/').slice(-2).join('/');
        assert.equal(ours.length, real.length, name + ' file length');
        for (const o of [0, 4, 8, 12, 16, 20, 28, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 124]) assert.equal(ours.readUInt32LE(o), real.readUInt32LE(o), name + ' header byte ' + o);
        // depth (24) and the reserved words (32-75): 0 in MoW:AS2; GoH files carry depth 1 and the NVTT tool stamp
      }
      assert.ok(seen.size >= 2, game + ': at least two shipped DXT1 files with mips compared, got ' + seen.size);
    }
  });
  t('ddsenc: timing 1920x1080 with mips (printed, not asserted)', () => {
    const p = picture(1920, 1080), t0 = process.hrtime.bigint(), b = enc.encode(p, 1920, 1080), ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log('ddsenc timing: 1920x1080 with 11 mips in ' + Math.round(ms) + ' ms (' + b.length + ' bytes)');
    assert.equal(allFourColour(b), 0);
    assert.ok(rmse(p, dds.decode(b).rgba, 1920 * 1080) < 6);
  });
};
if (require.main === module) {
  const assert = require('assert'); let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } }, assert);
  console.log(bad ? `FAIL ${bad} failed, ${n} passed` : `${n} passed\nPASS`);
  process.exitCode = bad ? 1 : 0;
}
