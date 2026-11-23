// pak: read AS2 .pak (= zip, → vfs/mount) + GoH zip64 paks without deps. store + deflate only. read-only on game files.
// list() reads only the end-of-central-directory + central directory (paks can be GBs); read() fetches one entry by offset.
// Author: Imperator_Aug (ARSENAL, ia-c3f3aeef)
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = fs.readSync(fd, b, got, len - got, pos + got);
    if (n <= 0) break;
    got += n;
  }
  return got === len ? b : b.subarray(0, got);
}

// → [{ name, method, csize, size, off, crc, time }] from the central directory. result also has .file
// name: backslashes → '/', as stored (no case folding). time = DOS time/date word (date<<16|time)
function list(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const fsize = fs.fstatSync(fd).size;
    const tailLen = Math.min(fsize, 22 + 65535);
    const tail = readAt(fd, fsize - tailLen, tailLen);
    let e = tail.length - 22;
    while (e >= 0 && tail.readUInt32LE(e) !== 0x06054b50) e--;
    if (e < 0) throw new Error('not a zip (no end-of-central-directory)');
    let n = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
    if (n === 0xFFFF || cdOff === 0xFFFFFFFF || cdSize === 0xFFFFFFFF) {
      // zip64 (GoH paks): locator just before EOCD → EOCD64 record holds 8-byte count/size/offset
      const lp = fsize - tailLen + e - 20, loc = lp >= 0 ? readAt(fd, lp, 20) : null;
      if (!loc || loc.length < 20 || loc.readUInt32LE(0) !== 0x07064b50) throw new Error('zip64: no EOCD64 locator');
      const r = readAt(fd, Number(loc.readBigUInt64LE(8)), 56);
      if (r.length < 56 || r.readUInt32LE(0) !== 0x06064b50) throw new Error('zip64: bad EOCD64 record');
      n = Number(r.readBigUInt64LE(32)); cdSize = Number(r.readBigUInt64LE(40)); cdOff = Number(r.readBigUInt64LE(48));
    }
    const buf = readAt(fd, cdOff, cdSize);
    const ents = [];
    let p = 0;
    for (let i = 0; i < n; i++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry ' + i);
      const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
      ents.push({
        name: buf.toString('latin1', p + 46, p + 46 + nl).replace(/\\/g, '/'),
        method: buf.readUInt16LE(p + 10), csize: buf.readUInt32LE(p + 20), size: buf.readUInt32LE(p + 24),
        off: buf.readUInt32LE(p + 42), crc: buf.readUInt32LE(p + 16), time: (buf.readUInt16LE(p + 14) << 16 | buf.readUInt16LE(p + 12)) >>> 0,
      });
      if (xl) zip64Extra(ents[i], buf, p + 46 + nl, p + 46 + nl + xl);
      p += 46 + nl + xl + cl;
    }
    ents.file = file;
    return ents;
  } finally { fs.closeSync(fd); }
}

// zip64 extra field (id 1): 8-byte size, csize, off, present only where the 32-bit field is 0xFFFFFFFF, in that order
function zip64Extra(ent, buf, p, end) {
  while (p + 4 <= end) {
    const id = buf.readUInt16LE(p), len = buf.readUInt16LE(p + 2);
    if (id === 1) {
      let q = p + 4;
      for (const k of ['size', 'csize', 'off']) if (ent[k] === 0xFFFFFFFF && q + 8 <= p + 4 + len) { ent[k] = Number(buf.readBigUInt64LE(q)); q += 8; }
      return;
    }
    p += 4 + len;
  }
}

// entry bytes. opens ents.file per call unless ents.fd is set (extract does that)
function read(ents, ent) {
  const own = ents.fd === undefined, fd = own ? fs.openSync(ents.file, 'r') : ents.fd;
  try {
    const h = readAt(fd, ent.off, 30);
    if (h.length < 30 || h.readUInt32LE(0) !== 0x04034b50) throw new Error(`${ent.name}: bad local header`);
    const data = readAt(fd, ent.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28), ent.csize);
    if (ent.method === 0) return data;
    if (ent.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`${ent.name}: unsupported zip method ${ent.method}`);
  } finally { if (own) fs.closeSync(fd); }
}

// extract entries whose name matches re into dir; → count
function extract(file, dir, re = /./) {
  const ents = list(file);
  let n = 0;
  ents.fd = fs.openSync(file, 'r');
  try {
    for (const ent of ents) {
      if (ent.name.endsWith('/') || !re.test(ent.name)) continue;
      const out = path.join(dir, ...ent.name.split('/'));
      if (!path.resolve(out).startsWith(path.resolve(dir))) throw new Error('path escapes target: ' + ent.name);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, read(ents, ent));
      n++;
    }
  } finally { fs.closeSync(ents.fd); }
  return n;
}

module.exports = { list, read, extract };
