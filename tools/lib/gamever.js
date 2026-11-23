// gamever: game version from exe ProductVersion (PE VERSIONINFO), else version file. rows: VFS-01
//   read(gameDir) -> string|null   as64.exe, mowas_2.exe, then version.txt/version/resource/version.txt/game.version
//     (unchanged, callers depend on it). On the shared AS2 install the first exe that answers is read, and it answers the mowas_2.exe
//     version (3.2.6.2) for AS64 too: as64.exe carries the same ProductVersion 3.2.6.2 [V, t-lint-a], not the 3.301 data
//     version. Name the game to read its own exe:
//   read(gameDir, exe) -> string|null   exe = a game id or vfs exe (lib/games: as64, mowas2, mowas_2, goh): only that game's exe file
//     (as64.exe, mowas_2.exe, binaries/x64/call_to_arms.exe), then the same version files; unknown exe throws
//   peVersion(file) -> string|null  ProductVersion (else FILEVERSION a.b.c.d); peVersionBuf(buf): same on a Buffer
// Author: Imperator_Aug (ARSENAL, ia-2562acda)
const fs = require('fs'), path = require('path');

function rvaToOff(buf, secs, rva) {
  for (const s of secs) if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rsize)) return s.raw + (rva - s.va);
  return -1;
}

function peVersionBuf(buf) {
  try {
    if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5A4D) return null;
    const pe = buf.readUInt32LE(0x3C);
    if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') return null;
    const nsec = buf.readUInt16LE(pe + 6), optSize = buf.readUInt16LE(pe + 20), opt = pe + 24;
    const magic = buf.readUInt16LE(opt), ddOff = opt + (magic === 0x20B ? 112 : 96);
    const resRva = buf.readUInt32LE(ddOff + 2 * 8);
    if (!resRva) return null;
    const secs = [];
    for (let i = 0; i < nsec; i++) {
      const o = opt + optSize + i * 40;
      secs.push({ vsize: buf.readUInt32LE(o + 8), va: buf.readUInt32LE(o + 12), rsize: buf.readUInt32LE(o + 16), raw: buf.readUInt32LE(o + 20) });
    }
    const rbase = rvaToOff(buf, secs, resRva);
    if (rbase < 0) return null;
    const entries = off => {                       // resource directory table at rbase+off -> [{id, sub, target}]
      const n = buf.readUInt16LE(rbase + off + 12) + buf.readUInt16LE(rbase + off + 14), r = [];
      for (let i = 0; i < n; i++) { const id = buf.readUInt32LE(rbase + off + 16 + i * 8), t = buf.readUInt32LE(rbase + off + 20 + i * 8); r.push({ id, sub: !!(t & 0x80000000), target: t & 0x7FFFFFFF }); }
      return r;
    };
    let d = entries(0).find(e => e.id === 16 && e.sub);                    // RT_VERSION
    if (!d) return null;
    d = entries(d.target)[0]; if (!d || !d.sub) return null;               // first name/id
    d = entries(d.target)[0]; if (!d || d.sub) return null;                // first language -> data entry
    const rva = buf.readUInt32LE(rbase + d.target), size = buf.readUInt32LE(rbase + d.target + 4);
    const off = rvaToOff(buf, secs, rva);
    if (off < 0) return null;
    const blk = buf.subarray(off, off + size);
    // string table value: UTF-16 "ProductVersion\0" then padding then the value
    const key = Buffer.from('ProductVersion\0', 'utf16le'), ki = blk.indexOf(key);
    if (ki >= 0) {
      let p = ki + key.length; p = (p + 3) & ~3;                          // value is DWORD-aligned from block start (block start is aligned)
      let q = p; while (q + 1 < blk.length && (blk[q] || blk[q + 1])) q += 2;
      const s = blk.toString('utf16le', p, q).trim();
      if (s) return s;
    }
    const fi = blk.indexOf(Buffer.from([0xBD, 0x04, 0xEF, 0xFE]));
    if (fi >= 0) {
      const ms = blk.readUInt32LE(fi + 8), ls = blk.readUInt32LE(fi + 12);   // dwFileVersionMS/LS
      return [ms >>> 16, ms & 0xFFFF, ls >>> 16, ls & 0xFFFF].join('.');
    }
  } catch { /* truncated / malformed */ }
  return null;
}

function peVersion(file) {
  try { return peVersionBuf(fs.readFileSync(file)); } catch { return null; }
}

function read(gameDir, exe) {
  let exes = ['as64.exe', 'mowas_2.exe'];
  if (exe) {
    const g = require('./games').get(exe);
    if (!g) throw new Error('gamever: unknown game ' + exe + ' (as64, mowas2, goh)');
    exes = [g.file];
  }
  if (!gameDir) return null;
  for (const e of exes) { const v = peVersion(path.join(gameDir, e)); if (v) return v; }
  for (const f of ['version.txt', 'version', 'resource/version.txt', 'game.version']) {
    try { const s = fs.readFileSync(path.join(gameDir, f), 'latin1').trim().split(/\r?\n/)[0]; if (s) return s; } catch { /* next */ }
  }
  return null;
}

module.exports = { read, peVersion, peVersionBuf };
