// gridfile + png test: the .mvg layout byte for byte (README 4.1, a hand-built header), round trips of every etype,
// lattice and cell, nodata, scale and offset, escaped meta, header padding, the refusals and their codes, the atomic write,
// goldens; PNG round trip (alpha 0 kept), determinism, goldens, outside PNG forms and the refusals.
// usage: node tools/mapviz/lib/raster/test/gridfile.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-7d554660)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), zlib = require('zlib');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-raster-gridfile-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const GF = require('../gridfile');
const PNG = require('../png');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz raster-gridfile: ' + what); } }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ': no error (want ' + code + ')'); }
  catch (e) { ok(e && e.code === code, what + ': code ' + (e && e.code) + ', want ' + code + ' (' + (e && e.message) + ')'); }
}
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const bytesOf = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
function grid(o) {
  return Object.assign({ name: 'test', w: 3, h: 2, cell: 10, ox: -640, oy: -480, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {} }, o);
}

// ---- 1. the header byte for byte (README 4.1) ----
{
  const g = grid({ name: 'water.band', w: 3, h: 2, cell: 10, ox: -640, oy: -480.5, etype: 'i16', sample: 'lattice', scale: 0.5,
    offset: -100, nodata: -32768, meta: { unit: 'u', note: 'Stra\u00dfe \u0434\u043e\u0440\u043e\u0433\u0430' },
    data: new Int16Array([1, -2, 300, -32768, 32767, 0]) });
  const name = 'water.band';
  const meta = '{"unit":"u","note":"Stra\\u00dfe \\u0434\\u043e\\u0440\\u043e\\u0433\\u0430"}';   // hand-escaped
  const hdr = Math.ceil((72 + name.length + meta.length) / 8) * 8;
  const want = Buffer.alloc(hdr + 6 * 2);
  want.write('MVG1', 0, 'latin1');
  want.writeUInt16LE(1, 4); want.writeUInt16LE(hdr, 6);
  want.writeUInt32LE(3, 8); want.writeUInt32LE(2, 12);
  want.writeDoubleLE(10, 16); want.writeDoubleLE(-640, 24); want.writeDoubleLE(-480.5, 32);
  want[40] = 4; want[41] = 1; want.writeUInt16LE(1, 42);
  want.writeFloatLE(0.5, 44); want.writeFloatLE(-100, 48); want.writeUInt32LE(0, 52);
  want.writeDoubleLE(-32768, 56);
  want.writeUInt16LE(name.length, 64); want.writeUInt16LE(meta.length, 66); want.writeUInt32LE(0, 68);
  want.write(name, 72, 'latin1'); want.write(meta, 72 + name.length, 'latin1');
  [1, -2, 300, -32768, 32767, 0].forEach((v, i) => want.writeInt16LE(v, hdr + i * 2));
  const got = GF.encode(g);
  ok(got.equals(want), 'encode() equals the hand-built file byte for byte');
  ok(hdr % 8 === 0 && got.readUInt16LE(6) === hdr, 'hdrBytes ' + hdr + ' is a multiple of 8');
  ok([...got.subarray(72, hdr)].every(b => b < 0x80), 'meta is ASCII (non-ASCII escaped)');
  const back = GF.decode(got);
  ok(back.meta.note === g.meta.note && back.meta.unit === 'u', 'non-ASCII meta value reads back');
  ok(back.name === 'water.band' && back.sample === 'lattice' && back.etype === 'i16' && back.oy === -480.5, 'header fields read back');
  ok(back.scale === 0.5 && back.offset === -100 && back.nodata === -32768, 'scale, offset, nodata read back');
  ok(back.data instanceof Int16Array && bytesOf(back.data).equals(bytesOf(g.data)), 'i16 data reads back');
  ok(GF.dataBlock(got).equals(got.subarray(hdr)), 'dataBlock is the raw data after hdrBytes');
  ok(GF.decode(new Uint8Array(got)).data[2] === 300, 'decode takes a plain Uint8Array too');
  throwsCode(() => GF.decode('MVG1'), 'GRIDFILE_HEADER', 'decode of a string');
  const dh = GF.decodeHeader(got);
  ok(dh.hdrBytes === hdr && dh.dataBytes === 12 && dh.flags === 1 && dh.grid.data === null, 'decodeHeader fields');
}

// ---- 2. round trip of every etype, lattice and cell ----
{
  const samples = {
    u8: [0, 1, 254, 255, 7, 128], i8: [-128, -1, 0, 1, 127, 5], u16: [0, 1, 65535, 300, 40000, 2],
    i16: [-32768, -1, 0, 1, 32767, 1234], u32: [0, 1, 0xffffffff, 0x80000000, 65536, 9], i32: [-2147483648, -1, 0, 1, 2147483647, 77],
    f32: [0, -0, 1.5, -3.25e10, NaN, Infinity],
  };
  ok(Object.keys(GF.ETYPES).join() === 'u8,i8,u16,i16,u32,i32,f32,rgba8', 'ETYPES names in id order');
  for (const k of Object.keys(GF.ETYPES)) ok(GF.ETYPE_BY_ID[GF.ETYPES[k].id] === GF.ETYPES[k], 'ETYPE_BY_ID ' + k);
  ok([1, 2, 3, 4, 5, 6, 7, 8].map(i => GF.ETYPE_BY_ID[i].name).join() === 'u8,i8,u16,i16,u32,i32,f32,rgba8', 'etype ids 1..8 as README 4.1');
  for (const sample of ['cell', 'lattice']) {
    for (const et of Object.keys(GF.ETYPES)) {
      const T = GF.ETYPES[et];
      const data = et === 'rgba8' ? new Uint8ClampedArray([...Array(24).keys()].map(i => (i * 37) & 255)) : new T.Array(samples[et]);
      const g = grid({ name: 'rt.' + et, etype: et, sample, data });
      const b = GF.encode(g), back = GF.decode(b);
      ok(back.data instanceof T.Array, et + ' ' + sample + ': decoded data is a ' + T.Array.name);
      ok(bytesOf(back.data).equals(bytesOf(data)), et + ' ' + sample + ': data bytes round trip');
      ok(back.sample === sample && back.etype === et && back.w === 3 && back.h === 2 && back.cell === 10 && back.ox === -640 && back.oy === -480, et + ' ' + sample + ': header round trip');
      ok(b.length === b.readUInt16LE(6) + 6 * T.bytes, et + ' ' + sample + ': size = hdrBytes + w*h*elementSize');
      ok(GF.encode(back).equals(b), et + ' ' + sample + ': decode then encode gives the same bytes');
      if (T.bytes > 1 && et !== 'rgba8') {   // the big-endian host path, run here on purpose
        const viaDv = Buffer.alloc(data.byteLength); GF._le.write(viaDv, 0, data, T);
        ok(viaDv.equals(b.subarray(b.readUInt16LE(6))), et + ': DataView little-endian write = fast path');
        const ab = new ArrayBuffer(viaDv.length); Buffer.from(ab).set(viaDv);
        ok(bytesOf(GF._le.read(ab, T)).equals(bytesOf(data)), et + ': DataView little-endian read = data');
      }
    }
  }
  const buf = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  ok(GF.decode(GF.encode(grid({ etype: 'rgba8', data: buf }))).data instanceof Uint8ClampedArray, 'rgba8 accepts a Buffer and reads back a Uint8ClampedArray');
  ok(GF.elementSize('rgba8') === 4 && GF.elementSize('i16') === 2 && GF.dataBytes(grid({ etype: 'f32' })) === 24, 'elementSize and dataBytes');
}

// ---- 3. nodata, scale and offset, flags ----
{
  const d = () => new Uint8Array(6);
  const a = GF.encode(grid({ data: d() }));
  ok((a.readUInt16LE(42) & 1) === 0 && GF.decode(a).nodata === null, 'nodata null: flag bit 0 clear, reads back null');
  const z = GF.encode(grid({ nodata: 0, data: d() }));
  ok((z.readUInt16LE(42) & 1) === 1 && GF.decode(z).nodata === 0, 'nodata 0 is kept (not null)');
  const f = GF.decode(GF.encode(grid({ etype: 'f32', nodata: -1, data: new Float32Array(6) })));
  ok(f.nodata === -1, 'f32 nodata -1');
  const s = GF.decode(GF.encode(grid({ scale: 0.1, offset: 2.5, data: d() })));
  ok(s.scale === Math.fround(0.1) && s.offset === 2.5, 'scale and offset are f32 (0.1 -> fround(0.1))');
  const def = GF.decode(GF.encode(grid({ scale: undefined, offset: undefined, data: d() })));
  ok(def.scale === 1 && def.offset === 0, 'scale 1 and offset 0 when unused');
  const bits = GF.encode(grid({ name: 'water.drown', etype: 'u32', meta: { bits: ['car', 'tank_heavy'] }, data: new Uint32Array(6) }));
  ok(bits.readUInt16LE(42) === 2, 'meta.bits on u32 sets flag bit 1');
  ok(GF.encode(grid({ etype: 'i16', meta: { bits: ['x'] }, data: new Int16Array(6) })).readUInt16LE(42) === 0, 'meta.bits on i16 sets no flag');
  const emo = GF.decode(GF.encode(grid({ meta: { s: 'a\ud83d\ude00b', n: [1, 2.5, null, true] }, data: d() })));
  ok(emo.meta.s === 'a\ud83d\ude00b' && JSON.stringify(emo.meta.n) === '[1,2.5,null,true]', 'surrogate pair and plain values in meta round trip');
  ok(GF.encode(grid({ meta: null, data: d() })).includes(Buffer.from('test{}')), "meta null is written as '{}'");
}

// ---- 4. header padding ----
{
  let good = 0;
  for (let n = 1; n <= 24; n++) {
    const name = 'n'.repeat(n), b = GF.encode(grid({ name, data: new Uint8Array(6) }));
    const hdr = b.readUInt16LE(6), used = 72 + n + 2;   // meta '{}'
    if (hdr % 8 === 0 && hdr >= used && hdr - used < 8 && b.subarray(used, hdr).every(x => x === 0) && b.length === hdr + 6) good++;
  }
  ok(good === 24, 'header padded with zeros to the next multiple of 8 for name lengths 1..24 (' + good + ')');
}

// ---- 5. refusals (decode) ----
{
  const base = GF.encode(grid({ data: new Uint8Array([1, 2, 3, 4, 5, 6]) }));
  const mod = fn => { const b = Buffer.from(base); fn(b); return b; };
  throwsCode(() => GF.decode(mod(b => b.write('MVG2', 0, 'latin1'))), 'GRIDFILE_MAGIC', 'other magic');
  throwsCode(() => GF.decode(Buffer.from('PK\x03\x04', 'latin1')), 'GRIDFILE_MAGIC', 'a zip is not a grid file');
  throwsCode(() => GF.decode(mod(b => b.writeUInt16LE(2, 4))), 'GRIDFILE_VERSION', 'version 2');
  throwsCode(() => GF.decode(mod(b => b.writeUInt16LE(0, 4))), 'GRIDFILE_VERSION', 'version 0');
  throwsCode(() => GF.decode(Buffer.concat([base, Buffer.alloc(1)])), 'GRIDFILE_SIZE', 'one byte too many');
  throwsCode(() => GF.decode(base.subarray(0, base.length - 1)), 'GRIDFILE_SIZE', 'one byte short');
  throwsCode(() => GF.decode(mod(b => b.writeUInt32LE(4, 8))), 'GRIDFILE_SIZE', 'w that does not match the data');
  throwsCode(() => GF.decode(mod(b => { b[40] = 0; })), 'GRIDFILE_ETYPE', 'etype 0');
  throwsCode(() => GF.decode(mod(b => { b[40] = 9; })), 'GRIDFILE_ETYPE', 'etype 9');
  throwsCode(() => GF.decode(base.subarray(0, 40)), 'GRIDFILE_HEADER', 'file cut inside the fixed header');
  throwsCode(() => GF.decode(mod(b => b.writeUInt16LE(76, 6))), 'GRIDFILE_HEADER', 'hdrBytes too small for name and meta');
  throwsCode(() => GF.decode(mod(b => { b[41] = 2; })), 'GRIDFILE_HEADER', 'sample 2');
  throwsCode(() => GF.decode(mod(b => b.write('{x', 72 + 4, 'latin1'))), 'GRIDFILE_META', 'meta not JSON');
  throwsCode(() => GF.decode(mod(b => b.write('[]', 72 + 4, 'latin1'))), 'GRIDFILE_META', 'meta not an object');
}

// ---- 6. refusals (encode) ----
{
  throwsCode(() => GF.encode(grid({ data: new Int8Array(6) })), 'GRIDFILE_DATA', 'u8 grid with an Int8Array');
  throwsCode(() => GF.encode(grid({ data: new Uint8Array(5) })), 'GRIDFILE_DATA', 'data length not w*h');
  throwsCode(() => GF.encode(grid({ etype: 'rgba8', data: new Uint8ClampedArray(6) })), 'GRIDFILE_DATA', 'rgba8 data not w*h*4');
  throwsCode(() => GF.encode(grid({ etype: 'f64', data: new Float64Array(6) })), 'GRIDFILE_GRID', 'etype f64');
  throwsCode(() => GF.encode(grid({ name: 'stra\u00dfe', data: new Uint8Array(6) })), 'GRIDFILE_GRID', 'non-ASCII name');
  throwsCode(() => GF.encode(grid({ name: '', data: new Uint8Array(6) })), 'GRIDFILE_GRID', 'empty name');
  throwsCode(() => GF.encode(grid({ sample: 'point', data: new Uint8Array(6) })), 'GRIDFILE_GRID', 'sample point');
  throwsCode(() => GF.encode(grid({ cell: 0, data: new Uint8Array(6) })), 'GRIDFILE_GRID', 'cell 0');
  throwsCode(() => GF.encode(grid({ w: 2.5, data: new Uint8Array(6) })), 'GRIDFILE_GRID', 'w 2.5');
  throwsCode(() => GF.encode(grid({ meta: [1], data: new Uint8Array(6) })), 'GRIDFILE_META', 'meta an array');
  throwsCode(() => GF.encode(grid({ meta: { big: 'x'.repeat(70000) }, data: new Uint8Array(6) })), 'GRIDFILE_META', 'meta over 65535 bytes');
  const circ = {}; circ.self = circ;
  throwsCode(() => GF.encode(grid({ meta: circ, data: new Uint8Array(6) })), 'GRIDFILE_META', 'meta circular');
  throwsCode(() => GF.encode(grid({ meta: new Date(0), data: new Uint8Array(6) })), 'GRIDFILE_META', 'meta a Date (not a JSON object)');
  throwsCode(() => GF.encode(grid({ meta: { a: 1n }, data: new Uint8Array(6) })), 'GRIDFILE_META', 'meta with a BigInt');
  throwsCode(() => GF.encode(grid({ meta: { toJSON() { return undefined; } }, data: new Uint8Array(6) })), 'GRIDFILE_META', 'meta toJSON undefined');
}

// ---- 7. files: atomic write, read, readHeader ----
{
  const dir = path.join(W, 'files', 'sub');
  const g = grid({ name: 'height', etype: 'i16', sample: 'lattice', meta: { unit: 'u', upm: 20 }, data: new Int16Array([0, 60, 30, -200, -80, -28]) });
  const f = path.join(dir, 'height.mvg');
  ok(GF.write(f, g) === f, 'write returns the file');
  ok(fs.readdirSync(dir).join() === 'height.mvg', 'write leaves no temp file');
  ok(fs.readFileSync(f).equals(GF.encode(g)), 'written bytes = encode()');
  const r = GF.read(f);
  ok(bytesOf(r.data).equals(bytesOf(g.data)) && r.meta.upm === 20, 'read() round trip');
  const h = GF.readHeader(f);
  ok(h.data === null && h.name === 'height' && h.w === 3 && h.h === 2 && h.meta.unit === 'u' && h.sample === 'lattice', 'readHeader: header, data null');
  GF.write(f, Object.assign({}, g, { data: new Int16Array([1, 1, 1, 1, 1, 1]) }));
  ok(GF.read(f).data[0] === 1, 'write replaces an existing file');
  const cut = path.join(dir, 'cut.mvg');
  fs.writeFileSync(cut, GF.encode(g).subarray(0, 80));
  throwsCode(() => GF.readHeader(cut), 'GRIDFILE_SIZE', 'readHeader of a truncated file');
  throwsCode(() => GF.read(cut), 'GRIDFILE_SIZE', 'read of a truncated file');
  const tiny = path.join(dir, 'tiny.mvg'); fs.writeFileSync(tiny, 'MVG1');
  throwsCode(() => GF.readHeader(tiny), 'GRIDFILE_HEADER', 'readHeader of a 4 byte file');
  throwsCode(() => GF.write(path.join(dir, 'bad.mvg'), grid({ data: new Uint8Array(1) })), 'GRIDFILE_DATA', 'write refuses a bad grid');
  ok(!fs.existsSync(path.join(dir, 'bad.mvg')), 'a refused write leaves no file');
}

// ---- 8. golden grid file ----
{
  const g = grid({ name: 'water.depth', w: 4, h: 3, cell: 10, ox: -640, oy: -480, etype: 'i16', sample: 'cell', nodata: -32768,
    meta: { unit: 'u', w: -20 }, data: new Int16Array([180, 60, 30, 8, -32768, -32768, 180, 60, 30, 8, -32768, 0]) });
  const b = GF.encode(g);
  ok(sha1(b) === 'e8bfa9cb8dcf0641edb0fcf22c0e3d252e03eb14', 'golden sha1 of one small grid file (' + sha1(b) + ')');
}

// ---- 9. PNG: round trip, determinism, goldens ----
function picture(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    rgba[o] = (x * 29 + y * 7) & 255; rgba[o + 1] = (x * y * 3) & 255; rgba[o + 2] = (255 - x * 11) & 255;
    rgba[o + 3] = (x + y) % 5 === 0 ? 0 : (x * 50 + y * 13) & 255;
  }
  return { w, h, rgba };
}
{
  const p = picture(19, 11);
  p.rgba.set([200, 100, 50, 0], 0);   // alpha 0 with colour: straight values must survive
  const b1 = PNG.encode(p), b2 = PNG.encode({ w: p.w, h: p.h, rgba: new Uint8ClampedArray(p.rgba) });
  ok(b1.equals(b2), 'two encodes give the same bytes');
  const asGrid = { name: 'pic.topo', w: 19, h: 11, cell: 10, ox: 0, oy: 0, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: p.rgba };
  ok(PNG.encode(asGrid).equals(b1), 'an rgba8 grid encodes like {w,h,rgba}');
  const d = PNG.decode(b1);
  ok(d.w === 19 && d.h === 11 && d.rgba instanceof Uint8ClampedArray && bytesOf(d.rgba).equals(bytesOf(p.rgba)), 'PNG round trip, every byte');
  ok(d.rgba[0] === 200 && d.rgba[1] === 100 && d.rgba[2] === 50 && d.rgba[3] === 0, 'alpha 0 pixel keeps its colour');
  const types = []; for (let q = 8; q < b1.length;) { const n = b1.readUInt32BE(q); types.push(b1.toString('latin1', q + 4, q + 8)); q += 12 + n; }
  ok(types.join() === 'IHDR,IDAT,IEND', 'chunks IHDR IDAT IEND only (' + types.join() + ')');
  ok(b1[24] === 8 && b1[25] === 6 && b1[26] === 0 && b1[27] === 0 && b1[28] === 0, 'IHDR: 8 bit RGBA, not interlaced');
  ok(sha1(PNG._scanlines(p).raw) === '13dcb0bf8f190f57c3808ef55c190311160aca69', 'golden sha1 of the filtered rows, zlib free (' + sha1(PNG._scanlines(p).raw) + ')');
  ok(sha1(b1) === 'e9c9315c8eccac842b1c09bf3524d3edcd58a041', 'golden sha1 of the PNG file (' + sha1(b1) + ', zlib ' + process.versions.zlib + ')');
  const hd = PNG.header(b1);
  ok(hd.w === 19 && hd.h === 11 && hd.depth === 8 && hd.colorType === 6 && hd.interlace === 0, 'header()');
  const one = { w: 1, h: 1, rgba: new Uint8Array([1, 2, 3, 4]) };
  ok(bytesOf(PNG.decode(PNG.encode(one)).rgba).equals(Buffer.from([1, 2, 3, 4])), '1x1 picture from a Uint8Array');
  const big = picture(300, 200), bd = PNG.decode(PNG.encode(big));
  ok(bytesOf(bd.rgba).equals(bytesOf(big.rgba)), '300x200 round trip');
  const gr = { name: 'g', w: 2, h: 1, cell: 1, ox: 0, oy: 0, etype: 'u8', sample: 'cell', data: new Uint8Array(2) };
  throwsCode(() => PNG.encode(gr), 'PNG_INPUT', 'encode of a u8 grid');
  throwsCode(() => PNG.encode({ w: 2, h: 2, rgba: new Uint8Array(15) }), 'PNG_INPUT', 'encode with a short pixel array');
  throwsCode(() => PNG.encode({ w: 0, h: 2, rgba: new Uint8Array(0) }), 'PNG_INPUT', 'encode of width 0');
}

// ---- 10. PNG refusals ----
{
  const b = PNG.encode(picture(8, 8));
  let caught = 0; const cuts = [7, 8, 20, 33, 40, b.length - 20, b.length - 12, b.length - 1];
  for (const n of cuts) { try { PNG.decode(b.subarray(0, n)); } catch (e) { if (e.code === (n < 8 ? 'PNG_SIGNATURE' : 'PNG_TRUNCATED')) caught++; else console.log('  cut ' + n + ': ' + e.code); } }
  ok(caught === cuts.length, 'truncated file refused at every cut (' + caught + ' of ' + cuts.length + ')');
  throwsCode(() => PNG.decode(b.subarray(0, b.length - 12)), 'PNG_TRUNCATED', 'file without IEND');
  const crc = Buffer.from(b); crc[45] ^= 0xff;
  throwsCode(() => PNG.decode(crc), 'PNG_CRC', 'a flipped byte in IDAT');
  const sig = Buffer.from(b); sig[1] = 0x51;
  throwsCode(() => PNG.decode(sig), 'PNG_SIGNATURE', 'bad signature');
  throwsCode(() => PNG.header(Buffer.from('MVG1')), 'PNG_SIGNATURE', 'header() of a non PNG');
}

// ---- 11. PNG files from outside: a small independent writer (all five filters, palette, grey, 16 bit, tRNS, Adam7) ----
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ -1) >>> 0; }
function ck(type, data) {
  const t = Buffer.from(type, 'latin1'), len = Buffer.alloc(4), c = Buffer.alloc(4);
  len.writeUInt32BE(data.length); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function pae(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
// rows: array of Buffers (unfiltered bytes), bpp: filter distance; filters: per row filter type
function filterRows(rows, bpp, filters) {
  const out = [];
  rows.forEach((r, y) => {
    const f = filters[y % filters.length], prev = y ? rows[y - 1] : Buffer.alloc(r.length), o = Buffer.alloc(r.length + 1);
    o[0] = f;
    for (let x = 0; x < r.length; x++) {
      const a = x >= bpp ? r[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      o[x + 1] = (r[x] - [0, a, b, (a + b) >> 1, pae(a, b, c)][f]) & 255;
    }
    out.push(o);
  });
  return Buffer.concat(out);
}
function mkPng(w, h, depth, ct, raw, extra, interlace) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = depth; ih[9] = ct; ih[12] = interlace ? 1 : 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ck('IHDR', ih)].concat(extra || [])
    .concat([ck('tEXt', Buffer.from('Comment\0from outside')), ck('IDAT', zlib.deflateSync(raw)), ck('IEND', Buffer.alloc(0))]));
}
const px = (d, x, y, w) => Array.from(d.rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)).join(',');
{
  // 8 bit RGB, rows with filters 0 1 2 3 4
  const w = 5, h = 5, rows = [];
  for (let y = 0; y < h; y++) { const r = Buffer.alloc(w * 3); for (let x = 0; x < w; x++) { r[x * 3] = x * 40 + y; r[x * 3 + 1] = 200 - y * 30; r[x * 3 + 2] = (x * y * 17) & 255; } rows.push(r); }
  const d = PNG.decode(mkPng(w, h, 8, 2, filterRows(rows, 3, [0, 1, 2, 3, 4])));
  let good = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px(d, x, y, w) === [rows[y][x * 3], rows[y][x * 3 + 1], rows[y][x * 3 + 2], 255].join()) good++;
  ok(good === 25, '8 bit RGB with filters 0..4 (' + good + ' of 25)');
  // the same with a tRNS key colour
  const key = Buffer.alloc(6); key.writeUInt16BE(rows[2][3], 0); key.writeUInt16BE(rows[2][4], 2); key.writeUInt16BE(rows[2][5], 4);
  const dk = PNG.decode(mkPng(w, h, 8, 2, filterRows(rows, 3, [4]), [ck('tRNS', key)]));
  ok(dk.rgba[(2 * w + 1) * 4 + 3] === 0 && dk.rgba[3] === 255, '8 bit RGB tRNS key colour gives alpha 0');
}
{
  // grey 8, grey + alpha 8, grey 1 bit, grey 16
  const g8 = PNG.decode(mkPng(3, 1, 8, 0, filterRows([Buffer.from([0, 128, 255])], 1, [1])));
  ok(px(g8, 1, 0, 3) === '128,128,128,255' && px(g8, 2, 0, 3) === '255,255,255,255', 'grey 8 bit');
  const ga = PNG.decode(mkPng(2, 1, 8, 4, filterRows([Buffer.from([10, 0, 250, 99])], 2, [2])));
  ok(px(ga, 0, 0, 2) === '10,10,10,0' && px(ga, 1, 0, 2) === '250,250,250,99', 'grey + alpha 8 bit');
  const g1 = PNG.decode(mkPng(10, 2, 1, 0, filterRows([Buffer.from([0b10110000, 0b01000000]), Buffer.from([0b01001111, 0b11000000])], 1, [0])));
  ok([0, 1, 2, 3, 9].map(x => g1.rgba[x * 4]).join() === '255,0,255,255,255' && g1.rgba[(10 + 1) * 4] === 255 && g1.rgba[(10 + 0) * 4] === 0, 'grey 1 bit, 10 px rows with padding');
  const g16 = PNG.decode(mkPng(2, 1, 16, 0, filterRows([Buffer.from([0xff, 0xff, 0x80, 0x00])], 2, [0])));
  ok(g16.rgba[0] === 255 && g16.rgba[4] === 128, 'grey 16 bit rounds to 8 bit');
}
{
  // palette 8 bit with tRNS, palette 4 bit, 16 bit RGBA
  const plte = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]);
  const p8 = PNG.decode(mkPng(3, 2, 8, 3, filterRows([Buffer.from([0, 1, 2]), Buffer.from([2, 2, 0])], 1, [0, 2]), [ck('PLTE', plte), ck('tRNS', Buffer.from([128]))]));
  ok(px(p8, 0, 0, 3) === '255,0,0,128' && px(p8, 1, 0, 3) === '0,255,0,255' && px(p8, 0, 1, 3) === '0,0,255,255', 'palette 8 bit with tRNS');
  const p4 = PNG.decode(mkPng(3, 1, 4, 3, filterRows([Buffer.from([0x21, 0x00])], 1, [0]), [ck('PLTE', plte)]));
  ok(px(p4, 0, 0, 3) === '0,0,255,255' && px(p4, 1, 0, 3) === '0,255,0,255' && px(p4, 2, 0, 3) === '255,0,0,255', 'palette 4 bit');
  throwsCode(() => PNG.decode(mkPng(1, 1, 8, 3, filterRows([Buffer.from([7])], 1, [0]), [ck('PLTE', plte)])), 'PNG_DATA', 'palette index outside PLTE');
  throwsCode(() => PNG.decode(mkPng(1, 1, 8, 3, filterRows([Buffer.from([0])], 1, [0]))), 'PNG_DATA', 'palette picture without PLTE');
  const r16 = PNG.decode(mkPng(1, 1, 16, 6, filterRows([Buffer.from([0x12, 0x34, 0xff, 0xff, 0x00, 0x00, 0x80, 0x80])], 8, [0])));
  ok(px(r16, 0, 0, 1) === [Math.round(0x1234 / 257), 255, 0, 128].join(), '16 bit RGBA (' + px(r16, 0, 0, 1) + ')');
  const badF = Buffer.from([9, 1, 2, 3, 4]);
  throwsCode(() => PNG.decode(mkPng(1, 1, 8, 6, badF)), 'PNG_DATA', 'filter type 9');
  throwsCode(() => PNG.decode(mkPng(1, 1, 3, 6, Buffer.from([0, 1, 2, 3, 4]))), 'PNG_FORMAT', 'bit depth 3');
  const unk = mkPng(1, 1, 8, 6, Buffer.from([0, 1, 2, 3, 4]), [ck('ZZZZ', Buffer.alloc(0))]);
  throwsCode(() => PNG.decode(unk), 'PNG_FORMAT', 'unknown critical chunk');
  const anc = mkPng(1, 1, 8, 6, Buffer.from([0, 1, 2, 3, 4]), [ck('gAMA', Buffer.from([0, 0, 0xb1, 0x8f]))]);
  ok(px(PNG.decode(anc), 0, 0, 1) === '1,2,3,4', 'ancillary chunks (gAMA, tEXt) are skipped, values stay stored values');
  throwsCode(() => PNG.decode(mkPng(1, 1, 8, 6, Buffer.from([0, 1, 2]))), 'PNG_TRUNCATED', 'image data shorter than the picture');
}
{
  // Adam7: an interlaced 8 bit RGBA picture decodes like the plain one
  const p = picture(13, 9), w = 13, h = 9, parts = [];
  for (const [x0, y0, dx, dy] of [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]) {
    const rows = [];
    for (let y = y0; y < h; y += dy) {
      const r = []; for (let x = x0; x < w; x += dx) for (let k = 0; k < 4; k++) r.push(p.rgba[(y * w + x) * 4 + k]);
      if (r.length) rows.push(Buffer.from(r));
    }
    if (rows.length) parts.push(filterRows(rows, 4, [4, 1, 3]));
  }
  const d = PNG.decode(mkPng(w, h, 8, 6, Buffer.concat(parts), [], true));
  ok(bytesOf(d.rgba).equals(bytesOf(p.rgba)), 'Adam7 interlaced RGBA decodes to the same pixels');
  ok(PNG.header(mkPng(w, h, 8, 6, Buffer.concat(parts), [], true)).interlace === 1, 'header() reports interlace');
}

if (fail) { console.log('FAIL mapviz raster-gridfile: ' + fail + ' of ' + (pass + fail) + ' checks failed'); process.exit(1); }
console.log('PASS mapviz raster-gridfile (' + pass + ')');
// a temp folder this run made (no folder given) goes when every check passed; a failed run keeps it to look at
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }
