// pakpatch: write a pak again with ONE entry's contents replaced, for paks of any size.
// Every other entry is copied as the bytes it has in the source pak (still packed: nothing is unpacked or packed again), in
// 16 MB pieces, with its name bytes, method, crc, sizes, time and UTF-8 name flag kept. zip64 records are written where a size,
// an offset or the entry count needs them. The source is only read; the caller renames `out` over it when this returns.
//   patch(src, out, ents, target, data) -> { size, entries }    ents = pak.list(src), target = one of ents, data = Buffer
// Author: Imperator_Aug (ARSENAL, ia-01ca9b35)
const fs = require('fs'), zlib = require('zlib');
const { dosStamp } = require('./zipwrite');
const MAX32 = 0xFFFFFFFF, MAX16 = 0xFFFF, CHUNK = 16 * 1024 * 1024;

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  let got = 0;
  while (got < len) { const n = fs.readSync(fd, b, got, len - got, pos + got); if (n <= 0) break; got += n; }
  if (got !== len) throw new Error('the pak ends too early (damaged)');
  return b;
}
function patch(src, out, ents, target, data) {
  const fi = fs.openSync(src, 'r');
  let fo = null;
  try {
    fo = fs.openSync(out, 'w');
    let off = 0;
    const put = b => { let p = 0; while (p < b.length) p += fs.writeSync(fo, b, p, b.length - p); off += b.length; };
    const cen = [], now = dosStamp(new Date());
    for (const e of ents) {
      const h = readAt(fi, e.off, 30);
      if (h.readUInt32LE(0) !== 0x04034b50) throw new Error(e.name + ': bad local header (damaged pak)');
      const nlen = h.readUInt16LE(26), xlen = h.readUInt16LE(28), flags = h.readUInt16LE(6) & 0x0800;
      const name = readAt(fi, e.off + 30, nlen), dataPos = e.off + 30 + nlen + xlen, mine = e === target;
      let body = null, crc = e.crc, csize = e.csize, size = e.size, time = e.time & MAX16, date = (e.time >>> 16) & MAX16;
      if (mine) {
        if (e.method !== 0 && e.method !== 8) throw new Error(e.name + ': unsupported zip method ' + e.method);
        body = e.method === 8 ? zlib.deflateRawSync(data) : data;
        crc = zlib.crc32(data); csize = body.length; size = data.length; time = now.time; date = now.date;
      }
      const at = off, big = size >= MAX32 || csize >= MAX32, bigOff = at >= MAX32, ver = big || bigOff ? 45 : 20;
      const lx = Buffer.alloc(big ? 20 : 0);
      if (big) { lx.writeUInt16LE(1, 0); lx.writeUInt16LE(16, 2); lx.writeBigUInt64LE(BigInt(size), 4); lx.writeBigUInt64LE(BigInt(csize), 12); }
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(ver, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(e.method, 8);
      lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc >>> 0, 14);
      lh.writeUInt32LE(big ? MAX32 : csize, 18); lh.writeUInt32LE(big ? MAX32 : size, 22); lh.writeUInt16LE(nlen, 26); lh.writeUInt16LE(lx.length, 28);
      put(lh); put(name); put(lx);
      if (mine) put(body);
      else for (let done = 0; done < csize;) { const n = Math.min(CHUNK, csize - done); put(readAt(fi, dataPos + done, n)); done += n; }
      const cv = []; if (big) cv.push(size, csize); if (bigOff) cv.push(at);
      const cx = Buffer.alloc(cv.length ? 4 + 8 * cv.length : 0);
      if (cv.length) { cx.writeUInt16LE(1, 0); cx.writeUInt16LE(8 * cv.length, 2); cv.forEach((v, i) => cx.writeBigUInt64LE(BigInt(v), 4 + 8 * i)); }
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(ver, 4); c.writeUInt16LE(ver, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(e.method, 10);
      c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14); c.writeUInt32LE(crc >>> 0, 16);
      c.writeUInt32LE(big ? MAX32 : csize, 20); c.writeUInt32LE(big ? MAX32 : size, 24);
      c.writeUInt16LE(nlen, 28); c.writeUInt16LE(cx.length, 30); c.writeUInt32LE(bigOff ? MAX32 : at, 42);
      cen.push(c, name, cx);
    }
    const cdOff = off, n = ents.length;
    for (const b of cen) put(b);
    const cdSize = off - cdOff, z64 = n >= MAX16 || cdSize >= MAX32 || cdOff >= MAX32;
    if (z64) {
      const r = Buffer.alloc(56); r.writeUInt32LE(0x06064b50, 0); r.writeBigUInt64LE(44n, 4); r.writeUInt16LE(45, 12); r.writeUInt16LE(45, 14);
      r.writeBigUInt64LE(BigInt(n), 24); r.writeBigUInt64LE(BigInt(n), 32); r.writeBigUInt64LE(BigInt(cdSize), 40); r.writeBigUInt64LE(BigInt(cdOff), 48);
      const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); l.writeBigUInt64LE(BigInt(cdOff + cdSize), 8); l.writeUInt32LE(1, 16);
      put(r); put(l);
    }
    const t = Buffer.alloc(22); t.writeUInt32LE(0x06054b50, 0);
    t.writeUInt16LE(z64 ? MAX16 : n, 8); t.writeUInt16LE(z64 ? MAX16 : n, 10); t.writeUInt32LE(z64 ? MAX32 : cdSize, 12); t.writeUInt32LE(z64 ? MAX32 : cdOff, 16);
    put(t);
    return { size: off, entries: n };
  } finally { fs.closeSync(fi); if (fo !== null) fs.closeSync(fo); }
}
module.exports = { patch };
