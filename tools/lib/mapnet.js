// mapnet: reader for map `map.net`.
//   const m = parse(buf)  -> { cell, version, width, height, offX, offY, types:[{index,name}], materials:[{index,name}],
//                              hasGrid, bytesPer, cellsOff, cells (Buffer view), problems:[{code,msg}] }   never throws
//     problems codes: NET_TRUNCATED NET_BAD_MARKER NET_NO_GRID NET_SIZE NET_VERSION
//   cellAt(m, x, y) -> { height, type, material }   (type/material = FILE-LOCAL ids; v0: material = 0)
//   stats(m) -> { minH, maxH, noGround (cells height <= -1000), typeUse:Map id->count, matUse:Map id->count,
//                 combo:Map 'type,material'->count }   scans every cell
//   typeName(m, id) / materialName(m, id) -> name from the file table or null
//   NO_GROUND = -1000
// layout: u8 cell, u8 version(0..2), i16 w, i16 h, f32 offX, f32 offY; v>=2: 'MAP0' + 'MAP1' tables {u8 n; n*{u8 index; cstring}}
//   (count-string: u8 len, 255 -> 3 more LE bytes) then 'GRID'; cells row-major y*w+x: v0 {u16 h,u8 ground} v1/2 {i16 h,u8 type,u8 material}
// Author: Imperator_Aug (ARSENAL, ia-7e1a0634)
const { Reader, BinError } = require('./bin');
const NO_GROUND = -1000;

function parse(buf) {
  const m = { cell: 0, version: 0, width: 0, height: 0, offX: 0, offY: 0, types: [], materials: [], hasGrid: false, bytesPer: 4, cellsOff: 0, cells: Buffer.alloc(0), problems: [] };
  const prob = (code, msg) => m.problems.push({ code, msg });
  const r = new Reader(buf);
  try {
    m.cell = r.u8(); m.version = r.u8(); m.width = r.i16(); m.height = r.i16(); m.offX = r.f32(); m.offY = r.f32();
    if (m.version > 2) prob('NET_VERSION', `heightmap version ${m.version} (engine handles 0..2)`);
    m.bytesPer = m.version === 0 ? 3 : 4;
    if (m.version >= 2) {
      for (const [tag, list] of [['MAP0', m.types], ['MAP1', m.materials]]) {
        if (r.tag() !== tag) { prob('NET_BAD_MARKER', `${tag} marker missing: "string map not found"`); return m; }
        let n = r.u8();
        while (n-- > 0) {
          const index = r.u8(); let l = r.u8();
          if (l === 255) l = r.u8() | r.u8() << 8 | r.u8() << 16;
          list.push({ index, name: r.str(l, 'latin1') });
        }
      }
      if (r.tag() === 'GRID') m.hasGrid = true; else { prob('NET_NO_GRID', 'no GRID marker'); return m; }
    }
    m.cellsOff = r.pos;
    const need = Math.max(0, m.width) * Math.max(0, m.height) * m.bytesPer;
    if (m.width <= 0 || m.height <= 0) prob('NET_SIZE', `size ${m.width}x${m.height} not positive`);
    else if (r.left !== need) prob('NET_SIZE', `${r.left} bytes of cells, header says ${m.width}x${m.height}x${m.bytesPer} = ${need}`);
    m.cells = buf.subarray(r.pos, r.pos + Math.min(r.left, need));
  } catch (e) {
    if (!(e instanceof BinError)) throw e;
    prob('NET_TRUNCATED', `header runs past end of file (${e.message})`);
  }
  return m;
}

function cellAt(m, x, y) {
  const o = (y * m.width + x) * m.bytesPer, b = m.cells;
  if (x < 0 || y < 0 || x >= m.width || y >= m.height || o + m.bytesPer > b.length) return null;
  if (m.bytesPer === 3) return { height: b.readUInt16LE(o), type: b[o + 2], material: 0 };
  return { height: b.readInt16LE(o), type: b[o + 2], material: b[o + 3] };
}

function stats(m) {
  const s = { minH: Infinity, maxH: -Infinity, noGround: 0, typeUse: new Map(), matUse: new Map(), combo: new Map() };
  const b = m.cells, bp = m.bytesPer, n = Math.floor(b.length / bp), cnt = new Uint32Array(65536);
  for (let i = 0, o = 0; i < n; i++, o += bp) {
    const h = bp === 3 ? b.readUInt16LE(o) : b.readInt16LE(o);
    if (h < s.minH) s.minH = h; if (h > s.maxH) s.maxH = h;
    if (h <= NO_GROUND) s.noGround++;
    cnt[b[o + 2] << 8 | (bp === 3 ? 0 : b[o + 3])]++;
  }
  for (let k = 0; k < 65536; k++) if (cnt[k]) {
    const t = k >> 8, mt = k & 255;
    s.combo.set(t + ',' + mt, cnt[k]); s.typeUse.set(t, (s.typeUse.get(t) || 0) + cnt[k]); s.matUse.set(mt, (s.matUse.get(mt) || 0) + cnt[k]);
  }
  return s;
}
const nameIn = (list, id) => { const e = list.find(x => x.index === id); return e ? e.name : null; };
const typeName = (m, id) => nameIn(m.types, id);
const materialName = (m, id) => nameIn(m.materials, id);

module.exports = { parse, cellAt, stats, typeName, materialName, NO_GROUND };
