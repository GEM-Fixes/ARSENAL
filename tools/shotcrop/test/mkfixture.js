// Author: Imperator_Aug (ARSENAL, ia-3f2f35b4)
'use strict';
// writes fixture/t.jpg: 32x16 baseline 4:4:4 JPEG, DC-only blocks. left 16 px = (200,40,40), right 16 px = (30,60,220)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture'); fs.mkdirSync(dir, { recursive: true });
const W = 32, H = 16;
const toYcc = (r, g, b) => [0.299 * r + 0.587 * g + 0.114 * b, -0.168736 * r - 0.331264 * g + 0.5 * b + 128, 0.5 * r - 0.418688 * g - 0.081312 * b + 128];
// DC huffman: 12 symbols (cat 0..11) all 4-bit codes 0..11 ; AC: only EOB (0x00) as 1-bit code '0'
const dcCounts = [0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dcSyms = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const acCounts = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], acSyms = [0];
// canonical codes: dc lengths 4 -> codes 0..11 (length 4 starts at code 0 since shorter lengths empty)
const seg = (m, d) => Buffer.concat([Buffer.from([0xFF, m, (d.length + 2) >> 8, (d.length + 2) & 255]), d]);
const bits = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
const pred = [0, 0, 0];
for (let m = 0; m < 8; m++) {
  const bx = m % 4;
  const col = bx < 2 ? [200, 40, 40] : [30, 60, 220];
  const ycc = toYcc(...col);
  for (let c = 0; c < 3; c++) {
    const dc = Math.round((ycc[c] - 128) * 8) , diff = dc - pred[c]; pred[c] = dc;
    const a = Math.abs(diff); let cat = 0; while ((1 << cat) <= a) cat++;
    put(cat, 4); if (cat) put(diff < 0 ? diff + (1 << cat) - 1 : diff, cat);
    put(0, 1); // EOB
  }
}
while (bits.length % 8) bits.push(1);
const sc = []; for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let k = 0; k < 8; k++) v = v * 2 + bits[i + k]; sc.push(v); if (v === 255) sc.push(0); }
const parts = [Buffer.from([0xFF, 0xD8]),
  seg(0xDB, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)])),
  seg(0xC0, Buffer.from([8, H >> 8, H & 255, W >> 8, W & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0])),
  seg(0xC4, Buffer.concat([Buffer.from([0x00]), Buffer.from(dcCounts), Buffer.from(dcSyms)])),
  seg(0xC4, Buffer.concat([Buffer.from([0x10]), Buffer.from(acCounts), Buffer.from(acSyms)])),
  seg(0xDA, Buffer.from([3, 1, 0x00, 2, 0x00, 3, 0x00, 0, 63, 0])),
  Buffer.from(sc), Buffer.from([0xFF, 0xD9])];
fs.writeFileSync(path.join(dir, 't.jpg'), Buffer.concat(parts));
// progressive stub (SOF2) must be refused
fs.writeFileSync(path.join(dir, 'prog.jpg'), Buffer.concat([Buffer.from([0xFF, 0xD8]), seg(0xC2, Buffer.from([8, 0, 16, 0, 16, 1, 1, 0x11, 0])), Buffer.from([0xFF, 0xD9])]));
