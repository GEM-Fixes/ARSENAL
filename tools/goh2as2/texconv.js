// Author: Imperator_Aug (ARSENAL, ia-c3e1c199)
'use strict';
// ASSET-1: DDS formats the AS2/as64 loader cannot read -> A8R8G8B8 it can (: DXT1-5, A8R8G8B8, X8R8G8B8, A8B8G8R8, R32F only).
//   ATI2 / BC5U (two-channel normal maps): x = first BC4 block, y = second (BC5 order) [I; D3D9 ATI2 channel order is [T]], z rebuilt = sqrt(1-x^2-y^2).
//     output layout copied from the AS2 DXT5 bump means (R=0, G~128, B~250, A~128): R=0, G=y, B=z, A=x. [I: shader use of B vs a rebuilt z is [T]]
//   raw8 (luminance or alpha only, no loader format): grey A8R8G8B8 (luminance: R=G=B=L, A=255; alpha-only: R=G=B=255, A=a). [I]
// every mip level (and cube face) of the source is converted; header mip count and caps are kept. node texconv.js in.dds out.dds converts one file.
const fs = require('fs');
const LOADABLE = { DXT1: 'dxt1', DXT2: 'dxt2', DXT3: 'dxt3', DXT4: 'dxt4', DXT5: 'dxt5' };

function kindOf(b) {
  if (b.length < 128 || b.toString('latin1', 0, 4) !== 'DDS ' || b.readUInt32LE(4) !== 124 || b.readUInt32LE(76) !== 32) return 'notdds';
  const fl = b.readUInt32LE(80), cc = b.toString('latin1', 84, 88), bits = b.readUInt32LE(88);
  const m = [92, 96, 100, 104].map(o => b.readUInt32LE(o));
  if (fl & 4) {
    if (cc === 'DX10') return 'dx10';
    if (LOADABLE[cc]) return LOADABLE[cc];
    if (cc === 'ATI2' || cc === 'BC5U') return cc;
    return 'unknown';
  }
  if (fl & 0x40) {   // DDPF_RGB
    if (bits === 32) {
      if (m[0] === 0xff0000 && m[1] === 0xff00 && m[2] === 0xff && m[3] === 0xff000000) return 'a8r8g8b8';
      if (m[0] === 0xff0000 && m[1] === 0xff00 && m[2] === 0xff && m[3] === 0) return 'x8r8g8b8';
      if (m[0] === 0xff && m[1] === 0xff0000 && m[2] === 0xff00 && m[3] === 0xff000000) return 'a8b8g8r8';
      if (m[0] === 0xffffffff && !m[1] && !m[2] && !m[3]) return 'r32f';
    }
    return 'unknown';
  }
  if (bits === 8 && (fl & 0x20000 || (fl & 2 && !(fl & 0x40)))) return 'raw8';   // DDPF_LUMINANCE or DDPF_ALPHA, 8 bit
  return 'unknown';
}
const LOADS = new Set(['dxt1', 'dxt2', 'dxt3', 'dxt4', 'dxt5', 'a8r8g8b8', 'x8r8g8b8', 'a8b8g8r8', 'r32f']);
const loadable = b => LOADS.has(kindOf(b));

// 16 values 0..255 of one BC4 block at b[off..off+8)
function decodeBC4(b, off) {
  const e0 = b[off], e1 = b[off + 1], pal = [e0, e1];
  if (e0 > e1) for (let i = 1; i <= 6; i++) pal.push(Math.round(((7 - i) * e0 + i * e1) / 7));
  else { for (let i = 1; i <= 4; i++) pal.push(Math.round(((5 - i) * e0 + i * e1) / 5)); pal.push(0, 255); }
  let bits = 0n; for (let i = 0; i < 6; i++) bits |= BigInt(b[off + 2 + i]) << BigInt(8 * i);
  const out = new Array(16);
  for (let i = 0; i < 16; i++) out[i] = pal[Number((bits >> BigInt(3 * i)) & 7n)];
  return out;
}

function header(src, kind) {
  const h = Buffer.alloc(128); src.copy(h, 0, 0, 128);
  h.writeUInt32LE((0x1 | 0x2 | 0x4 | 0x8 | 0x1000 | (src.readUInt32LE(8) & 0x20000)) >>> 0, 8);   // CAPS HEIGHT WIDTH PITCH PIXELFORMAT (+MIPMAPCOUNT), no LINEARSIZE
  h.writeUInt32LE(src.readUInt32LE(16) * 4, 20);
  h.writeUInt32LE(0x41, 80); h.writeUInt32LE(0, 84); h.writeUInt32LE(32, 88);   // RGB | ALPHAPIXELS, 32 bit
  h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104);
  return h;
}

// -> null when the loader reads the file as it is; else { kind, buf, note }
function convert(src) {
  const kind = kindOf(src);
  if (kind !== 'ATI2' && kind !== 'BC5U' && kind !== 'raw8') return null;
  const w0 = src.readUInt32LE(16), h0 = src.readUInt32LE(12), mips = Math.max(1, src.readUInt32LE(28)), caps2 = src.readUInt32LE(112);
  const faces = (caps2 & 0x200) ? ((caps2 & 0xfc00) === 0xfc00 ? 6 : 1) : 1;
  const lum = kind === 'raw8' && !!(src.readUInt32LE(80) & 0x20000);
  const parts = [header(src, kind)]; let off = 128, zmin = 1;
  for (let f = 0; f < faces; f++) {
    let w = w0, h = h0;
    for (let m = 0; m < mips; m++) {
      const out = Buffer.alloc(w * h * 4);
      if (kind === 'raw8') {
        const n = w * h; if (off + n > src.length) throw new Error('truncated raw8 data');
        for (let i = 0; i < n; i++) { const v = src[off + i]; out.writeUInt32LE(lum ? ((0xff000000 | v << 16 | v << 8 | v) >>> 0) : (((v << 24) | 0xffffff) >>> 0), i * 4); }
        off += n;
      } else {
        const bw = Math.max(1, Math.ceil(w / 4)), bh = Math.max(1, Math.ceil(h / 4));
        if (off + bw * bh * 16 > src.length) throw new Error('truncated ' + kind + ' data');
        for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++, off += 16) {
          const X = decodeBC4(src, off), Y = decodeBC4(src, off + 8);
          for (let i = 0; i < 16; i++) {
            const px = bx * 4 + (i & 3), py = by * 4 + (i >> 2);
            if (px >= w || py >= h) continue;
            const x = X[i] / 255 * 2 - 1, y = Y[i] / 255 * 2 - 1, z = Math.sqrt(Math.max(0, 1 - x * x - y * y)), p = (py * w + px) * 4;
            if (z < zmin) zmin = z;
            out[p] = Math.round((z * 0.5 + 0.5) * 255); out[p + 1] = Y[i]; out[p + 2] = 0; out[p + 3] = X[i];   // B G R A
          }
        }
      }
      parts.push(out); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    }
  }
  const note = kind === 'raw8' ? `raw8 ${lum ? 'luminance' : 'alpha'} -> A8R8G8B8 grey` : `${kind} -> A8R8G8B8 (R=0 G=y B=z A=x, z rebuilt)`;
  return { kind, buf: Buffer.concat(parts), note, w: w0, h: h0, mips };
}

module.exports = { kindOf, loadable, convert, decodeBC4 };
if (require.main === module) {
  const [i, o] = process.argv.slice(2);
  if (!i || !o) { console.error('usage: node texconv.js in.dds out.dds'); process.exit(2); }
  const r = convert(fs.readFileSync(i));
  if (!r) { console.error('already loadable (' + kindOf(fs.readFileSync(i)) + '): nothing written'); process.exit(1); }
  fs.writeFileSync(o, r.buf); console.log(r.note);
}
