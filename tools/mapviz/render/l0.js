// render L0 (MV-R1): the schematic picture of a map from its grids only (tools/mapviz/README.md 1.9, 4.2 R8; design 7).
//   l0(doc, grids, o) -> {grid (rgba8 'pic.l0'), sidecar}   sync
//     grids = mapkit grids of the mode ({gtype, height, W, ...}, already re-typed with the W of the mode by mapkit: the
//             load re-type of every cell but the last row and column, then the land patches) + optional 'shade' (the raster
//             hillshade lattice grid; made here from grids.height when absent).
//     o = {size?, mode?, src?, target?, made?, palette?}
//   Colour of a cell: water types 3..5 = their palette fill, unshaded (the water of the mode is in gtype); any other type =
//   its palette fill (ground.types by the game, ground.other for a code the palette lacks; type 0 'undef' is the
//   transparent fill of the palette), then shaded: the shade of the cell (mean of its four lattice corners) moves the colour
//   toward height.shade.dark below flat ground and toward height.shade.light above it, by strength x (distance from flat /
//   range), the light side at 0.6 of that (the rule of raster topo, version 1, kept here so a later shade tuning of raster
//   does not move L0 bytes unless the shade grid itself changes).
//   A cell whose own lattice point (its south-west corner, README 4.2) is height nodata (R16: past the ground mesh) is
//   transparent, as pic.topo draws it; the shade of the cells beside it is the mean of their corners that hold a height
//   (meta.offGround = the transparent cells, when not 0). The l1 picture reaches 64 u past the mesh, so it covers this rim.
//   No --size: one pixel per cell in the cell frame of the grids (R8: w, h = the grid, box [ox, oy, ox + w cell, oy + h cell]).
//   With size: the plan frame (frame.plan: the world box, north up), by the premultiplied area resample of frame.js.
// No game file is read here beyond what the caller gives (src only feeds mapHashes).
// Author: Imperator_Aug (ARSENAL, ia-4779e708)
'use strict';
const crypto = require('crypto');
const F = require('./frame');

const SHADE_LIGHT = 0.6;     // raster topo version 1 (TOPO.light); dark side 1
const WATER = { 3: 1, 4: 1, 5: 1 };

function mv() { return require('../mapviz'); }
function raster() { return require('../lib/raster'); }

// a palette colour through raster's color(); null (the caller's fallback) where raster refuses it
function hex(s) {
  try { return raster().color(s); } catch (e) { return null; }
}

function typeColours(pal) {
  const g = (pal && pal.ground) || {};
  const other = hex(g.other) || [176, 168, 144, 255];
  const T = [];
  for (let c = 0; c < 256; c++) T.push(other);
  for (const t of g.types || []) { const c = hex(t.fill); if (c && t.code >= 0 && t.code < 256) T[t.code] = c; }
  return T;
}

function sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

function mapHashes(src, key, names) {
  if (!src || !key || typeof src.read !== 'function') return null;
  const out = {};
  for (const n of names) {
    const k = 'resource/map/' + key + '/' + n;
    try { if (!src.has || src.has(k)) { const b = src.read(k); if (b) out[n] = sha1(b); } } catch (e) { /* absent: no hash */ }
  }
  return Object.keys(out).length ? out : null;
}

function checkCellGrid(g, what) {
  const M = mv();
  if (!g || !g.data || !(g.w > 0) || !(g.h > 0) || g.data.length !== g.w * g.h || !(g.cell > 0)) {
    throw new M.MvError('MV_USAGE', 'render l0 needs the ' + what + ' grid of mapkit grids', { code: 'RENDER_GRID' });
  }
}

// off[k] = 1 where the lattice point k of the height grid is nodata (R16: past the ground mesh), null when none is
function offGround(height, w, h) {
  if (!height || height.w !== w || height.h !== h || !height.data) return null;
  const nd = height.nodata;
  if (nd === null || nd === undefined || !Number.isFinite(Number(nd))) return null;
  const d = height.data, v = Number(nd), n = w * h;
  let off = null;
  for (let k = 0; k < n; k++) if (d[k] === v) { if (!off) off = new Uint8Array(n); off[k] = 1; }
  return off;
}

// per-cell shade value (float 0..255) or null: mean of the four lattice corners, clamped at the last row and column; off
// (optional): corners past the ground mesh do not count (their shade is the flat filler of raster, R14), NaN when the
// cell's own corner is one
function cellShade(shade, w, h, off) {
  if (!shade || shade.w !== w || shade.h !== h || !shade.data) return null;
  const d = shade.data, out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const j1 = j + 1 < h ? j + 1 : j;
    for (let i = 0; i < w; i++) {
      const i1 = i + 1 < w ? i + 1 : i;
      const a = j * w + i, b = j * w + i1, c = j1 * w + i, e = j1 * w + i1;
      if (!off) { out[a] = (d[a] + d[b] + d[c] + d[e]) / 4; continue; }
      if (off[a]) { out[a] = NaN; continue; }
      let s = d[a], n = 1;
      if (!off[b]) { s += d[b]; n++; } if (!off[c]) { s += d[c]; n++; } if (!off[e]) { s += d[e]; n++; }
      out[a] = s / n;
    }
  }
  return out;
}

function l0(doc, grids, o) {
  o = o || {};
  const M = mv();
  if (!grids || typeof grids !== 'object') throw new M.MvError('MV_USAGE', 'render l0 needs the grids of the map', { code: 'RENDER_GRID' });
  const gt = grids.gtype;
  checkCellGrid(gt, 'gtype');
  const size = o.size == null ? null : F.checkSize(o.size);
  const pl = size ? F.plan(doc, { size }) : null;
  const pal = o.palette || raster().palette();
  const TC = typeColours(pal);
  const hs = (pal.height && pal.height.shade) || {};
  const st = hs.strength >= 0 ? hs.strength : 0.55;
  const light = hex(hs.light) || [255, 255, 255, 255], dark = hex(hs.dark) || [0, 0, 0, 255];
  const w = gt.w, h = gt.h, n = w * h;
  let shade = grids.shade || null;
  if (!shade && grids.height && grids.height.w === w && grids.height.h === h) shade = raster().hillshade(grids.height);
  const off = offGround(grids.height, w, h);
  const S = cellShade(shade, w, h, off);
  const sm = (shade && shade.meta) || {};
  const alt = sm.alt > 0 ? sm.alt : 30;
  const flat = sm.flat > 0 && sm.flat < 255 ? sm.flat : Math.round(255 * Math.sin(alt * Math.PI / 180));
  const out = new Uint8ClampedArray(n * 4), T = gt.data;
  let offCells = 0;
  for (let k = 0; k < n; k++) {
    if (off && off[k]) { offCells++; continue; }      // past the ground mesh: transparent (0, 0, 0, 0)
    const t = T[k], c = TC[t], p = k * 4;
    let r = c[0], g = c[1], b = c[2];
    if (S && !WATER[t] && c[3]) {
      const s = S[k];
      let wt = 0, to = null;
      if (s < flat) { wt = st * (flat - s) / flat; to = dark; } else if (s > flat) { wt = st * SHADE_LIGHT * (s - flat) / (255 - flat); to = light; }
      if (wt > 0) { r = Math.round(r + (to[0] - r) * wt); g = Math.round(g + (to[1] - g) * wt); b = Math.round(b + (to[2] - b) * wt); }
    }
    out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = c[3];
  }
  const water = grids.W !== undefined ? grids.W : null;
  let grid = { name: 'pic.l0', w, h, cell: gt.cell, ox: gt.ox, oy: gt.oy, etype: 'rgba8', sample: 'cell', scale: 1, offset: 0, nodata: null,
    meta: Object.assign({ rung: 'l0', water, shadeFlat: S ? flat : null }, offCells ? { offGround: offCells } : {}), data: out };
  if (pl) grid = F.resampleTo(grid, F.frameOf(pl), 'pic.l0');
  const box = pl ? pl.box : [gt.ox, gt.oy, gt.ox + w * gt.cell, gt.oy + h * gt.cell];
  const src = o.src || null, key = doc && doc.key;
  const gaps = [];
  if (!S) gaps.push('RENDER_NO_SHADE');
  const sidecar = {
    v: 1, layer: 'pic.l0', w: grid.w, h: grid.h, box, cell: grid.cell, rowOrder: 'minY-first',
    target: o.target || (src && src.target) || null, stackHash: (doc && doc.stack && doc.stack.hash) || (src && src.stackHash) || null,
    mapHashes: mapHashes(src, key, ['map', 'map.net']), rung: 'l0', env: null, gaps, approx: false, brightness: null,
    made: o.made || new Date().toISOString(), size: size,
  };
  if (pl && pl.cellY !== pl.cell) sidecar.cellY = pl.cellY;
  return { grid, sidecar };
}

module.exports = { l0, typeColours, cellShade, offGround, mapHashes, sha1, hex };
