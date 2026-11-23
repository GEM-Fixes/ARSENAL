// previews targets: the picture files a game loads for a map, per game and map kind (previews.md 2; design 10).
//   TARGETS                 frozen {as64:{mp:[row], sp:[row]}, mowas2, goh}; row {id, file, size|null, format, mips|null, state, why, tag}
//   targets(target, mapKey, doc?, o?) -> rows of this map (fresh objects); minimap size filled when doc is given
//   minimapSize(target, doc, n?) -> [w, h]   long side L (as64, mowas2: the stack's minimap long side, else 1024 [I];
//                                            goh 1500 [V]; n = --minimap-size), short side by the world box, multiples of 4
//   mipCount(w, h), dxt1Bytes(w, h) -> header + full chain bytes, mapKind(key) -> 'mp' | 'sp'
// MoW:AS2 = AS64 everywhere (same install, same file forms). GoH: no preview_small, preview 2560x1440, minimap long side
// 1500, header the lobby picture, and SP missions a header_interface.png 1024x600 [V multi.pak, single.pak, GHUI-113].
// Author: Imperator_Aug (ARSENAL, ia-b28e50ef)
'use strict';

const mipCount = (w, h) => { let n = 1, m = Math.max(w, h); while (m > 1) { m >>= 1; n++; } return n; };
function dxt1Bytes(w, h) {
  let b = 128;
  for (let i = 0, x = w, y = h; i < mipCount(w, h); i++, x = Math.max(1, x >> 1), y = Math.max(1, y >> 1)) b += Math.max(1, (x + 3) >> 2) * Math.max(1, (y + 3) >> 2) * 8;
  return b;
}
const mapKind = key => (/^single\//i.test(String(key || '')) ? 'sp' : 'mp');

function dds(id, file, size, state, why, tag) {
  return Object.freeze({ id, file, size: size ? Object.freeze(size.slice()) : null, format: 'DXT1', mips: size ? mipCount(size[0], size[1]) : null, state, why: why || null, tag });
}
function png(id, file, size, state, why, tag) {
  return Object.freeze({ id, file, size: size ? Object.freeze(size.slice()) : null, format: 'PNG', mips: size ? 1 : null, state, why: why || null, tag });
}

// state 'write' = a target the game reads (default on); 'none' = the game has no such file (why says so)
function as2Rows() {
  return Object.freeze([
    dds('preview', 'preview.dds', [1920, 1080], 'write', null, 'V'),
    dds('small', 'preview_small.dds', [400, 300], 'write', null, 'V'),
    dds('minimap', 'minimap.dds', null, 'write', null, 'I'),          // size per map; default long side 1024 [I]
    dds('header', 'header.dds', [960, 256], 'write', null, 'T'),       // use in game [T G9]
    png('header_interface', 'header_interface.png', null, 'none', 'PRV_SP_GOH_ONLY', 'V'),
  ]);
}
function gohRows(kind) {
  return Object.freeze([
    dds('preview', 'preview.dds', [2560, 1440], 'write', null, 'V'),
    dds('small', 'preview_small.dds', null, 'none', 'PRV_NO_FILE_IN_GAME', 'V'),
    dds('minimap', 'minimap.dds', null, 'write', null, 'V'),
    dds('header', 'header.dds', [960, 256], 'write', null, 'V'),
    kind === 'sp' ? png('header_interface', 'header_interface.png', [1024, 600], 'write', null, 'V')
      : png('header_interface', 'header_interface.png', null, 'none', 'PRV_SP_GOH_ONLY', 'V'),
  ]);
}
const TARGETS = Object.freeze({
  as64: Object.freeze({ mp: as2Rows(), sp: as2Rows() }),
  mowas2: Object.freeze({ mp: as2Rows(), sp: as2Rows() }),
  goh: Object.freeze({ mp: gohRows('mp'), sp: gohRows('sp') }),
});
const IDS = ['preview', 'small', 'minimap', 'header', 'header_interface'];
// the row 0 rule of the written file: top = max world y, except the minimap (row 0 = min world y, no flip) [I G1]
const TOP_IS_NORTH = { preview: true, small: true, header: true, header_interface: true, minimap: false };

function minimapSize(target, doc, n) {
  const b = doc && doc.boxes && doc.boxes.world;
  let L;
  if (n) L = n;
  else if (target === 'goh') L = 1500;
  else {
    const p = doc && doc.pictures && doc.pictures.minimap;
    L = p && Array.isArray(p.size) && p.size[0] > 0 ? Math.max(p.size[0], p.size[1]) : 1024;
  }
  if (!b) return [L, L];
  const bw = b[2] - b[0], bh = b[3] - b[1];
  const sh = (lo, hi) => Math.max(4, 4 * Math.round(L * lo / hi / 4));
  return bw >= bh ? [L, sh(bh, bw)] : [sh(bw, bh), L];
}

function targets(target, mapKey, doc, o) {
  const t = TARGETS[target];
  if (!t) throw new Error('previews: unknown target ' + target);
  const rows = t[mapKind(mapKey)].map(r => Object.assign({}, r, { size: r.size ? r.size.slice() : null }));
  const mm = rows.find(r => r.id === 'minimap');
  if (doc) { mm.size = minimapSize(target, doc, o && o.minimapSize); mm.mips = mipCount(mm.size[0], mm.size[1]); }
  for (const r of rows) r.bytes = r.size && r.format === 'DXT1' ? dxt1Bytes(r.size[0], r.size[1]) : null;
  return rows;
}

module.exports = { TARGETS, IDS, TOP_IS_NORTH, targets, minimapSize, mipCount, dxt1Bytes, mapKind };
