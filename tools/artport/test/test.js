// artport tests: invented images only (no GoH assets). run: node tools/artport/test/test.js
// Author: Imperator_Aug (ARSENAL, ia-297bcbbb)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), zlib = require('zlib');
const A = require('../artport.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

const grad = (w, h, a = 255) => { const r = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { r[i * 4] = i % 251; r[i * 4 + 1] = (i * 3) % 256; r[i * 4 + 2] = 255 - (i % 256); r[i * 4 + 3] = a; } return { w, h, rgba: r }; };

// minimal gif writer: 4-entry palette scaled to 8-bit codes, clear code every 200 pixels (code size stays 9)
function makeGif(w, h, idx, pal, trans = -1, interlace = false) {
  const hd = Buffer.alloc(13); hd.write('GIF89a', 0, 'latin1'); hd.writeUInt16LE(w, 6); hd.writeUInt16LE(h, 8); hd[10] = 0x80 | 7; // 256-entry table
  const gct = Buffer.alloc(768); pal.forEach((c, i) => { gct[i * 3] = c[0]; gct[i * 3 + 1] = c[1]; gct[i * 3 + 2] = c[2]; });
  let gce = Buffer.alloc(0); if (trans >= 0) gce = Buffer.from([0x21, 0xF9, 4, 1, 0, 0, trans, 0]);
  const id = Buffer.alloc(10); id[0] = 0x2C; id.writeUInt16LE(w, 5); id.writeUInt16LE(h, 7); id[9] = interlace ? 0x40 : 0;
  let order = []; if (interlace) { for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < h; y += st) order.push(y); } else for (let y = 0; y < h; y++) order.push(y);
  const px = []; for (const y of order) for (let x = 0; x < w; x++) px.push(idx[y * w + x]);
  const codes = []; for (let i = 0; i < px.length; i++) { if (i % 200 === 0) codes.push(256); codes.push(px[i]); } codes.push(257);
  let acc = 0, bits = 0; const bytes = [];
  for (const c of codes) { acc |= c << bits; bits += 9; while (bits >= 8) { bytes.push(acc & 255); acc >>>= 8; bits -= 8; } }
  if (bits) bytes.push(acc & 255);
  const sub = []; for (let i = 0; i < bytes.length; i += 255) { const s = bytes.slice(i, i + 255); sub.push(Buffer.from([s.length, ...s])); }
  return Buffer.concat([hd, gct, gce, id, Buffer.from([8]), ...sub, Buffer.from([0, 0x3B])]);
}

t('png round trip rgba', () => { const im = grad(13, 7, 200); const d = A.decodePng(A.encodePng(im)); assert.deepStrictEqual([d.w, d.h], [13, 7]); assert(d.rgba.equals(im.rgba)); });
t('png palette + filters (hand-built, filter 1/2/4)', () => {
  const w = 4, h = 3, pal = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]);
  const rows = [[0, 1, 2, 1], [1, 2, 0, 0], [2, 2, 1, 0]]; // index image
  const raw = Buffer.alloc((w + 1) * h); // filter 1 (sub) row0, 2 (up) row1, 4 (paeth) row2
  const filt = [1, 2, 4]; rows.forEach((r, y) => { raw[y * (w + 1)] = filt[y]; r.forEach((v, x) => { const a = x ? r[x - 1] : 0, up = y ? rows[y - 1][x] : 0, c = x && y ? rows[y - 1][x - 1] : 0; let pr = 0; if (filt[y] === 1) pr = a; else if (filt[y] === 2) pr = up; else { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? up : c; } raw[y * (w + 1) + 1 + x] = (v - pr) & 255; }); });
  const ch = (ty, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(ty, 4, 'latin1'); d.copy(o, 8); return o; }; // crc not checked by decoder
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 13, 10, 26, 10]), ch('IHDR', ihdr), ch('PLTE', pal), ch('tRNS', Buffer.from([255, 255, 0])), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
  const d = A.decodePng(png); rows.forEach((r, y) => r.forEach((v, x) => { const o = (y * w + x) * 4; assert.strictEqual(d.rgba[o], pal[v * 3]); assert.strictEqual(d.rgba[o + 3], v === 2 ? 0 : 255); }));
});
t('png rejects 16 bit', () => { const im = A.encodePng(grad(2, 2)); im[24] = 16; assert.throws(() => A.decodePng(im), /bit depth/); });
t('gif decode matches palette image', () => {
  const w = 9, h = 6, pal = [[10, 20, 30], [200, 100, 50], [0, 255, 0], [255, 255, 255]]; const idx = Array.from({ length: w * h }, (_, i) => (i * 7 + (i >> 2)) % 4);
  for (const il of [false, true]) { const d = A.decodeGif(makeGif(w, h, idx, pal, -1, il)); assert.deepStrictEqual([d.w, d.h], [w, h]); idx.forEach((k, i) => { assert.deepStrictEqual([...d.rgba.subarray(i * 4, i * 4 + 4)], [...pal[k], 255], 'px ' + i + (il ? ' interlaced' : '')); }); }
});
t('gif transparency index -> alpha 0', () => { const d = A.decodeGif(makeGif(2, 1, [0, 1], [[1, 2, 3], [4, 5, 6]], 1)); assert.strictEqual(d.rgba[3], 255); assert.strictEqual(d.rgba[7], 0); });
t('gif long image (>200 px, clears)', () => { const w = 40, h = 30, idx = Array.from({ length: w * h }, (_, i) => i % 3); const d = A.decodeGif(makeGif(w, h, idx, [[1, 1, 1], [2, 2, 2], [3, 3, 3]])); assert.strictEqual(d.rgba[(w * h - 1) * 4], [1, 2, 3][idx[w * h - 1]]); });
t('tga encode/decode round trip, bottom-up header', () => { const im = grad(5, 4, 128); const b = A.encodeTga(im); assert.strictEqual(b[2], 2); assert.strictEqual(b[16], 32); assert.strictEqual(b.length, 18 + 5 * 4 * 4); const d = A.decodeTga(b); assert(d.rgba.equals(im.rgba)); });
t('tga rle (type 10) reads', () => { const hd = Buffer.alloc(18); hd[2] = 10; hd.writeUInt16LE(4, 12); hd.writeUInt16LE(1, 14); hd[16] = 32; hd[17] = 0x28; const body = Buffer.from([0x83, 1, 2, 3, 255]); const d = A.decodeTga(Buffer.concat([hd, body])); assert.deepStrictEqual([...d.rgba.subarray(0, 4)], [3, 2, 1, 255]); assert.deepStrictEqual([...d.rgba.subarray(12, 16)], [3, 2, 1, 255]); });
t('resize 144x72 -> 104x52 keeps flat colour and alpha', () => { const w = 144, h = 72, r = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { r[i * 4] = 90; r[i * 4 + 1] = 40; r[i * 4 + 2] = 10; r[i * 4 + 3] = i % w < 72 ? 255 : 0; } const o = A.resize({ w, h, rgba: r }, 104, 52); assert.deepStrictEqual([o.w, o.h], [104, 52]); assert.deepStrictEqual([...o.rgba.subarray(0, 4)], [90, 40, 10, 255]); assert.strictEqual(o.rgba[(103) * 4 + 3], 0); });

// port: pak-less, a directory laid out like scene.pak
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'artport-')), src = path.join(tmp, 'src'), out = path.join(tmp, 'out');
const put = (rel, b) => { const f = path.join(src, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
for (let i = 0; i < 4; i++) { put(`scene/unit_icon/Fake_Tank_0${i}.tga`, A.encodeTga(grad(144, 72))); put(`scene/unit_icon_small/fake_tank_0${i}.tga`, A.encodeTga(grad(112, 48))); }
put('scene/unit_icon/fake_tank_00.png.bak', Buffer.from('x')); // not an image ext: ignored
put('scene/unit_icon/other_00.tga', A.encodeTga(grad(2, 2)));
put('scene/squad/fake_sq(ger)_00.png', A.encodePng(grad(48, 48)));
put('scene/squad/fake_sq(ger)_01.gif', makeGif(3, 3, [0, 1, 0, 1, 0, 1, 0, 1, 0], [[9, 9, 9], [1, 1, 1]]));
put('scene/vehicle_view/fake_tank/hull.tga', A.encodeTga(grad(8, 8))); put('scene/vehicle_view/fake_tank/damage/hull.png', A.encodePng(grad(8, 8)));
t('port: names, frames, case, vehicle_view subdir', () => {
  const r = A.port({ src, from: 'fake_tank', to: 'newtank', out, kinds: 'unit_icon,unit_icon_small,vehicle_view,portrait' });
  assert.strictEqual(r.files.length, 4 + 4 + 2); assert.deepStrictEqual(r.missing, ['portrait']);
  assert(fs.existsSync(path.join(out, 'resource/interface/scene/unit_icon/newtank_02.tga')));
  assert(fs.existsSync(path.join(out, 'resource/interface/scene/vehicle_view/newtank/damage/hull.png')));
  assert(!fs.existsSync(path.join(out, 'resource/interface/scene/unit_icon/newtank_00.png.bak')));
});
t('port: squad name with parentheses; gif always converted, png only on request', () => {
  const o2 = path.join(tmp, 'out2'), r = A.port({ src, from: 'fake_sq(ger)', to: 'new_sq(ger)', out: o2, kinds: 'squad' });
  const names = r.files.map(f => path.basename(f.file)).sort(); assert.deepStrictEqual(names, ['new_sq(ger)_00.png', 'new_sq(ger)_01.tga']); assert.strictEqual(r.converted, 1);
  const o3 = path.join(tmp, 'out3'), r3 = A.port({ src, from: 'fake_sq(ger)', to: 'x', out: o3, kinds: 'squad', convert: 'png' });
  assert.deepStrictEqual(r3.files.map(f => path.extname(f.file)), ['.tga', '.tga']);
});
t('port: --size scales only unit_icon', () => {
  const o4 = path.join(tmp, 'out4'); A.port({ src, from: 'fake_tank', to: 'z', out: o4, kinds: 'unit_icon,unit_icon_small', size: [104, 52] });
  const a = fs.readFileSync(path.join(o4, 'resource/interface/scene/unit_icon/z_00.tga')), b = fs.readFileSync(path.join(o4, 'resource/interface/scene/unit_icon_small/z_00.tga'));
  assert.deepStrictEqual(A.dims(a), [104, 52]); assert.deepStrictEqual(A.dims(b), [112, 48]);
});
t('census counts by kind and ext', () => { const c = A.census(src); assert.strictEqual(c['unit_icon .tga'], 5); assert.strictEqual(c['squad .gif'], 1); });
t('manifest has names and sizes, no pixels', () => { const m = JSON.parse(fs.readFileSync(path.join(out, 'art-port.json'), 'utf8')); assert.strictEqual(m[0].to, 'newtank'); assert.strictEqual(m[0].files[0].size, '144x72'); });
t('--from-entity: breed set gives icon(nat) + portrait; entity name stripped of _seg', () => {
  const lg = path.join(tmp, 'logic'); fs.mkdirSync(path.join(lg, 'set/breed/mp/ger'), { recursive: true });
  fs.writeFileSync(path.join(lg, 'set/breed/mp/ger/at_sq.set'), '{breed\r\n\t{portrait "fake_tank"}\r\n\t{icon "fake_sq"}\r\n\t{nationality ger}\r\n}\r\n');
  const r = A.resolveStems(A.openSrc(src), 'at_sq', lg);
  assert.strictEqual(r.stems.squad, 'fake_sq(ger)'); assert(r.via.squad.startsWith('breed ')); assert.strictEqual(r.stems.unit_icon, undefined);
  const e = A.resolveStems(A.openSrc(src), 'fake_tank_winter_late', null);
  assert.strictEqual(e.stems.unit_icon, 'fake_tank'); assert.strictEqual(e.via.unit_icon, 'stripped'); assert.strictEqual(e.stems.vehicle_view, 'fake_tank');
  const o5 = path.join(tmp, 'out5'), p = A.port({ src, 'from-entity': 'fake_tank_winter', to: 'q', out: o5, kinds: 'unit_icon,portrait' });
  assert.strictEqual(p.files.length, 4); assert.deepStrictEqual(p.missing, ['portrait']);
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${n} passed`);
