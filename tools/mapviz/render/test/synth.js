// render test helper: a synthetic ground mesh (BPLY map.ply through tools/lib/model/ply.js write), its mtl files and
// 32-bit DDS textures, as a file table, an in-memory mapkit-like src, or files under a folder.
//   dds32(w, h, [r,g,b,a] | fn(i,j) -> [r,g,b,a]) -> Buffer   uncompressed A8R8G8B8, one mip (row j = 0 first in the file)
//   ddsMips(w, h, [col per level]) -> Buffer   the same with one level per entry (col as dds32, fn(i, j, lw, lh))
//   grid(o) -> ply object   o = {x0, y0, x1, y1 (world box covered), nx, ny (quads per part), uvs (default 300),
//     parts:[{x0, x1, material, alpha(x, y) -> 0..255, rgb (vertex colour: a grey or [r,g,b], default 64)}], z(x, y)};
//     mesh y = -world y, uv0 = (x / uvs, -y / uvs) (world x, y); vertex colour bytes B G R A
//   memSrc(files, o) -> {target, has, read, keys, reads, stackHash}   files = {key: Buffer}
// Author: Imperator_Aug (ARSENAL, ia-b730221f)
'use strict';
const path = require('path'), fs = require('fs');
const ply = require(path.resolve(__dirname, '../../../lib/model/ply'));

function dds32(w, h, col) { return ddsMips(w, h, [col]); }

// one level per entry of cols (largest first, each half the size of the one before, at least 1)
function ddsMips(w, h, cols) {
  const lv = [];
  let tot = 0;
  for (let m = 0, lw = w, lh = h; m < cols.length; m++, lw = Math.max(1, lw >> 1), lh = Math.max(1, lh >> 1)) { lv.push([lw, lh]); tot += lw * lh * 4; }
  const b = Buffer.alloc(128 + tot);
  b.write('DDS ', 0, 'latin1');
  b.writeUInt32LE(124, 4); b.writeUInt32LE(0x100f | (cols.length > 1 ? 0x20000 : 0), 8); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16); b.writeUInt32LE(w * 4, 20);
  b.writeUInt32LE(cols.length, 28);
  b.writeUInt32LE(32, 76); b.writeUInt32LE(0x41, 80); b.writeUInt32LE(32, 88);
  b.writeUInt32LE(0x00ff0000, 92); b.writeUInt32LE(0x0000ff00, 96); b.writeUInt32LE(0x000000ff, 100); b.writeUInt32LE(0xff000000, 104);
  b.writeUInt32LE(0x1000 | (cols.length > 1 ? 0x400008 : 0), 108);
  let o = 128;
  lv.forEach(([lw, lh], m) => {
    const col = cols[m];
    for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++, o += 4) {
      const c = typeof col === 'function' ? col(i, j, lw, lh) : col;
      b[o] = c[2]; b[o + 1] = c[1]; b[o + 2] = c[0]; b[o + 3] = c[3] === undefined ? 255 : c[3];
    }
  });
  return b;
}

const DECL = [{ type: 2, usage: 0, index: 0, stream: 0 }, { type: 2, usage: 1, index: 0, stream: 0 }, { type: 6, usage: 2, index: 0, stream: 0 }, { type: 1, usage: 3, index: 0, stream: 0 }];
const STRIDE = 36;

function grid(o) {
  const verts = [], idx = [], parts = [];
  const z = o.z || (() => 0);
  for (const p of o.parts) {
    const nx = o.nx || 2, ny = o.ny || 2, base = verts.length, f0 = idx.length / 3;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const x = p.x0 + (p.x1 - p.x0) * i / nx, y = o.y0 + (o.y1 - o.y0) * j / ny;
      const c = p.rgb === undefined ? 64 : p.rgb;
      verts.push({ x, y, z: z(x, y), a: p.alpha(x, y), rgb: Array.isArray(c) ? c : [c, c, c] });
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
    parts.push({ tag: 'SUBM', declaration: DECL, firstFace: f0, faceCount: idx.length / 3 - f0, firstVertex: 0, vertexCount: 0, flags: 0x1404, material: p.material });
  }
  const raw = Buffer.alloc(verts.length * STRIDE);
  const uvs = o.uvs || 300;
  verts.forEach((v, k) => {
    const o2 = k * STRIDE;
    raw.writeFloatLE(v.x, o2); raw.writeFloatLE(-v.y, o2 + 4); raw.writeFloatLE(v.z, o2 + 8);
    raw.writeFloatLE(0, o2 + 12); raw.writeFloatLE(0, o2 + 16); raw.writeFloatLE(1, o2 + 20);
    raw[o2 + 24] = v.rgb[2]; raw[o2 + 25] = v.rgb[1]; raw[o2 + 26] = v.rgb[0]; raw[o2 + 27] = v.a;   // B G R A
    raw.writeFloatLE(v.x / uvs, o2 + 28); raw.writeFloatLE(-v.y / uvs, o2 + 32);
  });
  return { magic: 'BPLY', parts, vertices: { count: verts.length, stride: STRIDE, raw }, indices: Uint32Array.from(idx) };
}

function plyBuf(o) { return ply.write(grid(o)); }

function mtl(a, b) {
  const L = t => '\t{layer bump\r\n\t\t{diffuse "' + t + '"}\r\n\t\t{bump "' + t + '_nm"}\r\n\t\t{color 0xffffffff}\r\n\t\t{parallax_scale 0}\r\n\t}\r\n';
  return Buffer.from('{material\r\n' + L(a) + L(b) + '}\r\n', 'latin1');
}

function memSrc(files, o) {
  o = o || {};
  const F = new Map(Object.entries(files));
  const read = new Set();
  return {
    target: o.target || 'mowas2', exe: o.exe || 'mowas_2', game: null, mods: [], modDirs: [], stackHash: 'synthetic',
    has: k => F.has(k),
    read: k => { if (!F.has(k)) return null; read.add(k); return F.get(k); },
    keys: p => [...F.keys()].filter(k => k.startsWith(p || '')).sort(),
    reads: () => [...read].sort().map(k => ({ kind: 'mem', key: k })),
  };
}

function writeFiles(root, files) {
  for (const [k, b] of Object.entries(files)) {
    const f = path.join(root, k);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, b);
  }
}

module.exports = { dds32, ddsMips, grid, plyBuf, mtl, memSrc, writeFiles, STRIDE };
