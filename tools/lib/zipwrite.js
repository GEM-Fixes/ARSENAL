// zipwrite: minimal zip writer (store/deflate, crc32, zip64). →
// files: [[name, Buffer | () => Buffer, deflate?]]; name ending '/' = dir entry
// engine opens paks w/ minizip unzOpen2_64 → zip64 readable (lim VFS-39); entry size still u32
// crc: zip storage ignores CRC result but fails on mismatch (lim VFS-40) → always written
// DOS time/date: opts.date (Date, or {date, time} raw u16 pair) for every entry; none = 1980-01-01 00:00 (fixed → output stays byte-repeatable)
// Author: Imperator_Aug (ARSENAL, ia-2ae66655)
const fs = require('fs'), zlib = require('zlib');
const MAX32 = 0xFFFFFFFF, MAX16 = 0xFFFF;
const DOS_DEFAULT = { date: (1 << 5) | 1, time: 0 };   // 1980-01-01 00:00 (month and day are 1-based; 0 = invalid)

// Date → DOS {date, time}: years 1980..2107 (clamped), local time, 2 s steps
function dosStamp(d = new Date()) {
  const y = Math.min(2107, Math.max(1980, d.getFullYear()));
  return { date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1) };
}
const stampOf = w => !w ? DOS_DEFAULT : w instanceof Date ? dosStamp(w) : { date: w.date & MAX16, time: w.time & MAX16 };

// one entry → {local: [Buffer..], central: Buffer}; off = local header offset; z64 = force zip64 records
function entry(name, data, deflate, off, z64, ts = DOS_DEFAULT) {
  const body = deflate ? zlib.deflateRawSync(data) : data, nm = Buffer.from(name, 'latin1'), crc = zlib.crc32(data);
  const big = z64 || data.length >= MAX32 || body.length >= MAX32, bigOff = z64 || off >= MAX32;
  const ver = big || bigOff ? 45 : 20;
  // local extra: both sizes when big; central extra: size, csize, off (only overflowing ones, that order)
  const lx = big ? Buffer.alloc(20) : Buffer.alloc(0);
  if (big) { lx.writeUInt16LE(1, 0); lx.writeUInt16LE(16, 2); lx.writeBigUInt64LE(BigInt(data.length), 4); lx.writeBigUInt64LE(BigInt(body.length), 12); }
  const cv = []; if (big) cv.push(data.length, body.length); if (bigOff) cv.push(off);
  const cx = Buffer.alloc(cv.length ? 4 + 8 * cv.length : 0);
  if (cv.length) { cx.writeUInt16LE(1, 0); cx.writeUInt16LE(8 * cv.length, 2); cv.forEach((v, i) => cx.writeBigUInt64LE(BigInt(v), 4 + 8 * i)); }
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(ver, 4); h.writeUInt16LE(deflate ? 8 : 0, 8);
  h.writeUInt16LE(ts.time, 10); h.writeUInt16LE(ts.date, 12);
  h.writeUInt32LE(crc, 14); h.writeUInt32LE(big ? MAX32 : body.length, 18); h.writeUInt32LE(big ? MAX32 : data.length, 22);
  h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(lx.length, 28);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(ver, 4); c.writeUInt16LE(ver, 6); c.writeUInt16LE(deflate ? 8 : 0, 10);
  c.writeUInt16LE(ts.time, 12); c.writeUInt16LE(ts.date, 14);
  c.writeUInt32LE(crc, 16); c.writeUInt32LE(big ? MAX32 : body.length, 20); c.writeUInt32LE(big ? MAX32 : data.length, 24);
  c.writeUInt16LE(nm.length, 28); c.writeUInt16LE(cx.length, 30); c.writeUInt32LE(bigOff ? MAX32 : off, 42);
  return { local: [h, nm, lx, body], len: 30 + nm.length + lx.length + body.length, central: Buffer.concat([c, nm, cx]) };
}

// end records: EOCD64 + locator only when count/size/offset overflow (or forced)
function tail(n, cdSize, cdOff, z64) {
  const out = [], big = z64 || n >= MAX16 || cdSize >= MAX32 || cdOff >= MAX32;
  if (big) {
    const r = Buffer.alloc(56); r.writeUInt32LE(0x06064b50, 0); r.writeBigUInt64LE(44n, 4); r.writeUInt16LE(45, 12); r.writeUInt16LE(45, 14);
    r.writeBigUInt64LE(BigInt(n), 24); r.writeBigUInt64LE(BigInt(n), 32); r.writeBigUInt64LE(BigInt(cdSize), 40); r.writeBigUInt64LE(BigInt(cdOff), 48);
    const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); l.writeBigUInt64LE(BigInt(cdOff + cdSize), 8); l.writeUInt32LE(1, 16);
    out.push(r, l);
  }
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(big ? MAX16 : n, 8); e.writeUInt16LE(big ? MAX16 : n, 10);
  e.writeUInt32LE(big ? MAX32 : cdSize, 12); e.writeUInt32LE(big ? MAX32 : cdOff, 16);
  out.push(e);
  return out;
}

const get = d => typeof d === 'function' ? d() : d;

// in memory; opts.zip64 forces zip64 (tests); opts.date entry time (see top)
function zip(files, opts = {}) {
  const parts = [], cen = [], ts = stampOf(opts.date); let off = 0;
  for (const [name, data, deflate] of files) {
    const e = entry(name, get(data), deflate, off, opts.zip64, ts);
    parts.push(...e.local); cen.push(e.central); off += e.len;
  }
  const cd = Buffer.concat(cen);
  return Buffer.concat([...parts, cd, ...tail(files.length, cd.length, off, opts.zip64)]);
}

// streamed, one entry in memory → paks > 2 GB
function writeZip(out, files, opts = {}) {
  const ts = stampOf(opts.date), fd = fs.openSync(out, 'w'), cen = []; let off = 0;
  const put = b => { let p = 0; while (p < b.length) p += fs.writeSync(fd, b, p, b.length - p); };
  try {
    for (const [name, data, deflate] of files) {
      const e = entry(name, get(data), deflate, off, opts.zip64, ts);
      e.local.forEach(put); cen.push(e.central); off += e.len;
    }
    const cd = Buffer.concat(cen); put(cd);
    tail(files.length, cd.length, off, opts.zip64).forEach(put);
  } finally { fs.closeSync(fd); }
  return off;
}

module.exports = { zip, writeZip, dosStamp, DOS_DEFAULT };
