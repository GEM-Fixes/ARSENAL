#!/usr/bin/env node
// The ARSENAL icon, drawn in code (no image file in the repo, no image tool needed): a rounded olive square with a light
// letter A. write(dir) makes icon.png (256 px), icon.ico (the same PNG in an .ico) and icon.icns (the same PNG as ic08).
// usage: node tools/installer/icon.js <out dir> | --help
// Author: Imperator_Aug (ARSENAL, ia-c1d0bdc3)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const N = 256, SS = 4;
// distance from point p to the segment a-b
function seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
// inside the rounded square (margin m, corner radius r)
function box(x, y, m, r) {
  const cx = Math.max(m + r, Math.min(N - m - r, x)), cy = Math.max(m + r, Math.min(N - m - r, y));
  return Math.hypot(x - cx, y - cy) <= r;
}
function letter(x, y) {
  const w = 13;   // half the stroke width
  return seg(x, y, 128, 58, 66, 200) <= w || seg(x, y, 128, 58, 190, 200) <= w || seg(x, y, 91, 156, 165, 156) <= w * 0.85;
}
function pixels() {
  const BG = [0x4a, 0x5d, 0x3a], FG = [0xf4, 0xf3, 0xee], out = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let a = 0, f = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const sx = x + (i + 0.5) / SS, sy = y + (j + 0.5) / SS;
      if (box(sx, sy, 8, 44)) { a++; if (letter(sx, sy)) f++; }
    }
    const o = (y * N + x) * 4, k = a ? f / a : 0;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * k);
    out[o + 3] = Math.round(255 * a / (SS * SS));
  }
  return out;
}
function png() {
  const px = pixels(), raw = Buffer.alloc(N * (N * 4 + 1));
  for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);   // filter byte 0 per row
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
    b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(p) {
  const h = Buffer.alloc(22);
  h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4);            // type icon, one image
  h[6] = 0; h[7] = 0;                                      // 0 = 256 px
  h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12);         // planes, bits per pixel
  h.writeUInt32LE(p.length, 14); h.writeUInt32LE(22, 18);  // size, offset
  return Buffer.concat([h, p]);
}
function icns(p) {
  const h = Buffer.alloc(16);
  h.write('icns', 0, 'latin1'); h.writeUInt32BE(16 + p.length, 4);
  h.write('ic08', 8, 'latin1'); h.writeUInt32BE(8 + p.length, 12);
  return Buffer.concat([h, p]);
}
function write(dir) {
  const p = png();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon.png'), p);
  fs.writeFileSync(path.join(dir, 'icon.ico'), ico(p));
  fs.writeFileSync(path.join(dir, 'icon.icns'), icns(p));
  return p.length;
}
module.exports = { write, png, ico, icns };
if (require.main === module) {
  const a = process.argv[2];
  if (!a || a === '--help' || a === '-h') { console.log('usage: node tools/installer/icon.js <out dir>   writes icon.png, icon.ico, icon.icns (256 px)'); process.exit(a ? 0 : 2); }
  console.log(`icon: ${write(path.resolve(a))} bytes of PNG -> icon.png, icon.ico, icon.icns in ${path.resolve(a)}`);
}
