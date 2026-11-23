// mapkit (MV-KIT, wave A): the map list, mapdoc/1 and the base grids of AS64, MoW:AS2 and Gates of Hell maps.
// Contract: tools/mapviz/README.md sections 1.1, 2, 3, 4; design section 2. All sync. Reads go through tools/lib/vfs.js with
// the exe id explicit (source.js).
//   VERSION, TARGETS, source(o), list(src), doc(src, key, o), grids(src, key, o), worldToCell(net, x, y),
//   cellToWorld(net, i, j), heightAt(grid, x, y), retype(stored, h, W)
// Author: Imperator_Aug (ARSENAL, ia-4ecd4c04)
'use strict';
const mv = require('../../mapviz');
const S = require('./source'), D = require('./mapdoc'), G = require('./grids'), tables = require('./tables');

const VERSION = 2;   // 2: height nodata past the ground mesh, doc entities[].link and .seats (wave B close)

const netW = net => (net.w !== undefined ? net.w : net.width);
const netH = net => (net.h !== undefined ? net.h : net.height);

// README 3.1: i = floor((x + offX) / cell), j likewise; null outside the grid
function worldToCell(net, x, y) {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const i = Math.floor((x + net.offX) / net.cell), j = Math.floor((y + net.offY) / net.cell);
  if (i < 0 || j < 0 || i >= netW(net) || j >= netH(net)) return null;
  return { i, j };
}
// the cell's south-west corner = lattice point (i, j)
function cellToWorld(net, i, j) {
  return { x: i * net.cell - net.offX, y: j * net.cell - net.offY };
}
// bilinear height in u from a lattice grid object (README 4.3); null outside the lattice. Nodata corners (lattice points
// past the ground mesh, grids.js) drop out and the others are weighted again; null when every corner with a weight is nodata
function heightAt(grid, x, y) {
  if (!grid || typeof x !== 'number' || typeof y !== 'number') return null;
  const fx = (x - grid.ox) / grid.cell, fy = (y - grid.oy) / grid.cell;
  if (!(fx >= 0 && fy >= 0 && fx <= grid.w - 1 && fy <= grid.h - 1)) return null;
  const i = Math.min(Math.floor(fx), grid.w - 1), j = Math.min(Math.floor(fy), grid.h - 1);
  const i1 = Math.min(i + 1, grid.w - 1), j1 = Math.min(j + 1, grid.h - 1);
  const tx = fx - i, ty = fy - j, d = grid.data, w = grid.w;
  const hs = [d[j * w + i], d[j * w + i1], d[j1 * w + i], d[j1 * w + i1]];
  const ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  const nd = grid.nodata === null || grid.nodata === undefined ? null : grid.nodata;
  let v = 0, sw = 0;
  for (let c = 0; c < 4; c++) {
    if (nd !== null && hs[c] === nd) continue;
    v += hs[c] * ws[c]; sw += ws[c];
  }
  if (!(sw > 1e-12)) return null;
  if (sw < 1 - 1e-12) v /= sw;
  return v * (grid.scale === undefined ? 1 : grid.scale) + (grid.offset || 0);
}

module.exports = {
  VERSION,
  TARGETS: mv.TARGETS,
  source: S.source,
  list: S.list,
  doc: D.doc,
  grids: G.grids,
  worldToCell,
  cellToWorld,
  heightAt,
  retype: tables.retype,
  stackHash: S.stackHash,
};
