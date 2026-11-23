// pakpatch test: one entry replaced, every other entry byte-exact with its time and method kept; zip64 pak (forced) and a pak
// with more than 65535 entries; a sparse pak over 4 GB when the file system allows it (skipped otherwise).
// usage: node tools/lib/test/pakpatch.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-c46a01f2)
const fs = require('fs'), path = require('path'), os = require('os');
const pak = require('../pak'), zw = require('../zipwrite'), { patch } = require('../pakpatch');
const W = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'pakpatch-'));
fs.mkdirSync(W, { recursive: true });
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const rd = (f, e) => pak.read({ file: f }, e);

function round(name, files, opts, idx, data) {
  const src = path.join(W, name + '.pak'), out = path.join(W, name + '.out.pak');
  fs.writeFileSync(src, zw.zip(files, opts));
  const L = pak.list(src), r = patch(src, out, L, L[idx], data), M = pak.list(out);
  ok(M.length === L.length && r.entries === L.length && r.size === fs.statSync(out).size, name + ': entry count and size');
  let same = true;
  for (let i = 0; i < L.length; i++) {
    if (M[i].name !== L[i].name || M[i].method !== L[i].method) same = false;
    if (i === idx) { if (!rd(out, M[i]).equals(data)) same = false; }
    else if (M[i].time !== L[i].time || M[i].crc !== L[i].crc || M[i].csize !== L[i].csize || !rd(out, M[i]).equals(rd(src, L[i]))) same = false;
  }
  ok(same, name + ': changed entry has the new bytes, the others are byte-exact with time and method kept');
  return { src, out, L, M };
}
const A = Buffer.from('{a 1}\r\n'), B = Buffer.concat([Buffer.from('; '), Buffer.from([0xcf, 0xf0]), Buffer.from('\r\n{b}\r\n')]), C = Buffer.alloc(70000, 7);
const base = [['set/a.set', A, true], ['set/', Buffer.alloc(0), false], ['set/b.set', B, false], ['big/c.bin', C, true]];
round('plain', base, { date: new Date(2020, 4, 5, 6, 7, 8) }, 0, Buffer.from('{a 2}\r\n{more}\r\n'));
round('stored', base, {}, 2, Buffer.from('{b 9}\r\n'));
round('last', base, {}, 3, Buffer.alloc(10, 1));
round('empty', base, {}, 0, Buffer.alloc(0));
const z = round('zip64', base, { zip64: true }, 0, Buffer.from('{z}\r\n'));
ok(z.M.length === 4, 'zip64 source pak read and written');
{
  const many = []; for (let i = 0; i < 66000; i++) many.push(['f/' + i + '.set', Buffer.from('{' + i + '}'), false]);
  const m = round('many', many, {}, 65999, Buffer.from('{last}'));
  ok(m.M.length === 66000 && rd(m.out, m.M[123]).toString() === '{123}', 'over 65535 entries: zip64 end records written and read back');
}
{
  // a pak over 4 GB: one stored entry that is a hole in a sparse file, then a small entry behind it (offset over 32 bit)
  const src = path.join(W, 'huge.pak'), out = path.join(W, 'huge.out.pak');
  let made = false;
  try {
    const hole = 4300 * 1024 * 1024, fd = fs.openSync(src, 'w');
    const name1 = Buffer.from('big.bin'), name2 = Buffer.from('set/s.set'), small = Buffer.from('{s 1}\r\n');
    const lh = (nm, size, crc, x) => { const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(45, 4); h.writeUInt32LE(crc >>> 0, 14); h.writeUInt32LE(x ? 0xFFFFFFFF : size, 18); h.writeUInt32LE(x ? 0xFFFFFFFF : size, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(x ? 20 : 0, 28); return h; };
    const x64 = vals => { const b = Buffer.alloc(4 + 8 * vals.length); b.writeUInt16LE(1, 0); b.writeUInt16LE(8 * vals.length, 2); vals.forEach((v, i) => b.writeBigUInt64LE(BigInt(v), 4 + 8 * i)); return b; };
    const crcSmall = require('zlib').crc32(small);
    let pos = 0; const w = b => { fs.writeSync(fd, b, 0, b.length, pos); pos += b.length; };
    w(lh(name1, hole, 0, true)); w(name1); w(x64([hole, hole])); pos += hole;   // the hole: data never written (reads as zeros; crc not checked by pak.read)
    const off2 = pos; w(lh(name2, small.length, crcSmall, false)); w(name2); w(small);
    const cdOff = pos;
    const ch = (nm, size, crc, xb) => { const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(45, 4); c.writeUInt16LE(45, 6); c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(size, 20); c.writeUInt32LE(size, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt16LE(xb.length, 30); return c; };
    const c1 = ch(name1, 0xFFFFFFFF, 0, x64([hole, hole])); c1.writeUInt32LE(0, 42); w(c1); w(name1); w(x64([hole, hole]));
    const c2 = ch(name2, small.length, crcSmall, x64([off2])); c2.writeUInt32LE(0xFFFFFFFF, 42); w(c2); w(name2); w(x64([off2]));
    const cdSize = pos - cdOff;
    const r = Buffer.alloc(56); r.writeUInt32LE(0x06064b50, 0); r.writeBigUInt64LE(44n, 4); r.writeUInt16LE(45, 12); r.writeUInt16LE(45, 14); r.writeBigUInt64LE(2n, 24); r.writeBigUInt64LE(2n, 32); r.writeBigUInt64LE(BigInt(cdSize), 40); r.writeBigUInt64LE(BigInt(cdOff), 48);
    const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); l.writeBigUInt64LE(BigInt(cdOff + cdSize), 8); l.writeUInt32LE(1, 16);
    const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(0xFFFF, 8); e.writeUInt16LE(0xFFFF, 10); e.writeUInt32LE(0xFFFFFFFF, 12); e.writeUInt32LE(0xFFFFFFFF, 16);
    w(r); w(l); w(e); fs.closeSync(fd); made = true;
  } catch (e) { console.log('SKIPPED pak over 4 GB (' + e.message + ')'); }
  if (made) {
    try {
      const L = pak.list(src), t0 = Date.now();
      patch(src, out, L, L[1], Buffer.from('{s 2}\r\n'));
      const M = pak.list(out);
      ok(M.length === 2 && M[0].size === L[0].size && M[1].off > 0xFFFFFFFF && rd(out, M[1]).toString() === '{s 2}\r\n', 'pak over 4 GB: entry behind the 4 GB mark replaced (' + (Date.now() - t0) + ' ms)');
    } catch (e) { if (/ENOSPC|EFBIG/.test(String(e.code || e.message))) console.log('SKIPPED pak over 4 GB (' + e.message + ')'); else ok(false, 'pak over 4 GB threw ' + e.message); }
  }
  for (const f of [src, out]) try { fs.unlinkSync(f); } catch { /* not made */ }
}
console.log(bad ? bad + ' of ' + n + ' failed' : 'pakpatch ' + n + ' PASS');
process.exit(bad ? 1 : 0);
