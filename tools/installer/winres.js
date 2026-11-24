#!/usr/bin/env node
// Windows resources of ARSENAL Setup, written in code (no resource compiler needed): the version and publisher block that
// Explorer shows under Properties > Details, the program icon, and an application manifest (runs as the user who started it).
// syso(arch, info) -> the bytes of a COFF object with one .rsrc section; the Go linker links any *_windows_<arch>.syso beside main.go.
// write(dir, arch, info) writes it as rsrc_windows_<goarch>.syso. info: { version, name, description, product, company, copyright, png }.
// usage: node tools/installer/winres.js --help
// Author: Imperator_Aug (ARSENAL, ia-ed8be8b4)
'use strict';
const fs = require('fs'), path = require('path');

const MACHINE = { amd64: [0x8664, 3], arm64: [0xaa64, 2] };   // machine id, the "address without image base" relocation type
const pad4 = b => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - b.length % 4)]) : b);
const wstr = s => Buffer.from(s + '\0', 'utf16le');

// one node of the version block: length, value length, type (1 text, 0 binary), key, value, children; every part on a 4 byte boundary
function vnode(key, type, value, valueLen, kids = []) {
  const parts = [Buffer.concat([Buffer.alloc(6), wstr(key)])];
  if (value.length) parts.push(value);
  parts.push(...kids);
  const b = Buffer.concat(parts.map((p, i) => (i < parts.length - 1 ? pad4(p) : p)));
  b.writeUInt16LE(b.length, 0); b.writeUInt16LE(valueLen, 2); b.writeUInt16LE(type, 4);
  return b;
}
function versionNums(v) {
  const n = String(v).split(/[.+-]/).map(x => parseInt(x, 10)).filter(x => Number.isInteger(x) && x >= 0 && x < 65536).slice(0, 4);
  while (n.length < 4) n.push(0);
  return n;
}
function versionBlock(info) {
  const n = versionNums(info.version), fixed = Buffer.alloc(52);
  fixed.writeUInt32LE(0xfeef04bd, 0); fixed.writeUInt32LE(0x00010000, 4);
  fixed.writeUInt32LE(((n[0] << 16) | n[1]) >>> 0, 8); fixed.writeUInt32LE(((n[2] << 16) | n[3]) >>> 0, 12);
  fixed.writeUInt32LE(((n[0] << 16) | n[1]) >>> 0, 16); fixed.writeUInt32LE(((n[2] << 16) | n[3]) >>> 0, 20);
  fixed.writeUInt32LE(0x3f, 24); fixed.writeUInt32LE(0x40004, 32); fixed.writeUInt32LE(1, 36);   // flags mask, Windows NT, application
  const strings = { CompanyName: info.company, FileDescription: info.description, FileVersion: n.join('.'), InternalName: info.name.replace(/\.exe$/i, ''),
    LegalCopyright: info.copyright, OriginalFilename: info.name, ProductName: info.product, ProductVersion: String(info.version) };
  const table = vnode('040904B0', 1, Buffer.alloc(0), 0, Object.keys(strings).map(k => { const v = wstr(strings[k]); return vnode(k, 1, v, v.length / 2); }));
  const tr = Buffer.alloc(4); tr.writeUInt16LE(0x0409, 0); tr.writeUInt16LE(0x04b0, 2);
  return vnode('VS_VERSION_INFO', 0, fixed, fixed.length, [vnode('StringFileInfo', 1, Buffer.alloc(0), 0, [table]), vnode('VarFileInfo', 1, Buffer.alloc(0), 0, [vnode('Translation', 0, tr, tr.length)])]);
}
function manifest(info) {
  const n = versionNums(info.version).join('.');
  return Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">\r\n' +
    `<assemblyIdentity type="win32" name="ARSENAL.Setup" version="${n}"/>\r\n<description>${info.description}</description>\r\n` +
    '<trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo>\r\n' +
    '<compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application></compatibility>\r\n</assembly>\r\n', 'utf8');
}
function groupIcon(png) {
  const b = Buffer.alloc(20);
  b.writeUInt16LE(1, 2); b.writeUInt16LE(1, 4);                      // type icon, one image; width and height 0 = 256 px
  b.writeUInt16LE(1, 10); b.writeUInt16LE(32, 12); b.writeUInt32LE(png.length, 14); b.writeUInt16LE(1, 18);   // planes, bits, bytes, id of the RT_ICON
  return b;
}

function syso(arch, info) {
  const m = MACHINE[arch]; if (!m) throw new Error('winres: unknown arch ' + arch);
  // type id -> data, one resource (id 1, language 0x409) per type, types in rising order
  const res = [[3, info.png], [14, groupIcon(info.png)], [16, versionBlock(info)], [24, manifest(info)]].filter(r => r[1] && r[1].length);
  const T = res.length, dirs = 16 + 8 * T + T * 24 + T * 24, entriesAt = dirs, dataAt = entriesAt + 16 * T;
  const head = Buffer.alloc(dataAt), relocs = [], blobs = [];
  head.writeUInt16LE(T, 14);
  let off = dataAt;
  res.forEach(([id, data], i) => {
    const d1 = 16 + 8 * T + i * 24, d2 = 16 + 8 * T + T * 24 + i * 24, e = entriesAt + 16 * i;
    head.writeUInt32LE(id, 16 + 8 * i); head.writeUInt32LE((0x80000000 | d1) >>> 0, 20 + 8 * i);
    head.writeUInt16LE(1, d1 + 14); head.writeUInt32LE(1, d1 + 16); head.writeUInt32LE((0x80000000 | d2) >>> 0, d1 + 20);
    head.writeUInt16LE(1, d2 + 14); head.writeUInt32LE(0x409, d2 + 16); head.writeUInt32LE(e, d2 + 20);
    head.writeUInt32LE(off, e); head.writeUInt32LE(data.length, e + 4);
    relocs.push(e); const p = pad4(data); blobs.push(p); off += p.length;
  });
  const sec = Buffer.concat([head, ...blobs]);
  const coff = Buffer.alloc(20), sh = Buffer.alloc(40), rel = Buffer.alloc(10 * relocs.length), sym = Buffer.alloc(18 + 4);
  coff.writeUInt16LE(m[0], 0); coff.writeUInt16LE(1, 2); coff.writeUInt32LE(60 + sec.length + rel.length, 8); coff.writeUInt32LE(1, 12);
  sh.write('.rsrc', 0, 'latin1'); sh.writeUInt32LE(sec.length, 16); sh.writeUInt32LE(60, 20); sh.writeUInt32LE(60 + sec.length, 24);
  sh.writeUInt16LE(relocs.length, 32); sh.writeUInt32LE(0x40000040, 36);   // initialised data, readable
  relocs.forEach((a, i) => { rel.writeUInt32LE(a, 10 * i); rel.writeUInt32LE(0, 10 * i + 4); rel.writeUInt16LE(m[1], 10 * i + 8); });
  sym.write('.rsrc', 0, 'latin1'); sym.writeInt16LE(1, 12); sym[16] = 3; sym.writeUInt32LE(4, 18);   // section symbol, static; empty string table
  return Buffer.concat([coff, sh, sec, rel, sym]);
}
function write(dir, arch, info) {
  const f = path.join(dir, `rsrc_windows_${arch}.syso`);
  fs.writeFileSync(f, syso(arch, info));
  return f;
}
module.exports = { syso, write, versionBlock, versionNums, manifest };
if (require.main === module) console.log('winres.js: library of tools/installer/build.js (the version, publisher, icon and manifest resources of the Windows installers). No command of its own.');
