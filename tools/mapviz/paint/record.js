// paint record (MV-PNT1): the picture sidecar and the files of a paint product (paint contract 3, 4.9). Light at load.
//   sidecar(input, res, o) -> object   res = draw result + {counts, marks}; o = {styleVersion, inputs, notes, mapHashes, made,
//                                       layer?, base?} -> the common sidecar of README 4.4 plus the paint fields of section 3
//   write(out, name, grid, sidecar) -> [file names]   gridfile.write + writeAtomic (as render writePic)
//   reads(out, src) -> 'reads.json'    {v:1, inputs:[input]} (README 2.2, 8.3)
// Author: Imperator_Aug (ARSENAL, ia-4a02ddab)
'use strict';
const path = require('path');

const APPROX_GAPS = ['PAINT_BASE_APPROX', 'PAINT_BASE_MINIMAP', 'PAINT_BASE_SCHEMATIC', 'PAINT_NO_WATER_MASKS'];
const MAX_NOTES = 50;

function mv() { return require('../mapviz'); }

function sidecar(input, res, o) {
  o = o || {};
  const fr = input.frame, doc = input.doc || {};
  const gaps = (res.gaps || []).slice();
  const notes = [].concat(o.notes || [], res.notes || []).filter(n => n && n.code).slice(0, MAX_NOTES)
    .map(n => ({ code: String(n.code), text: String(n.text === undefined ? (n.msg || '') : n.text) }));
  const base = input.style === 'recon' && input.base ? { from: input.base.from, approx: !!input.base.approx } : null;
  const inputs = {};
  for (const k of Object.keys(o.inputs || {}).sort()) inputs[k] = o.inputs[k];
  const sc = {
    v: 1, layer: o.layer || 'pic.' + input.style, w: fr.W, h: fr.H, box: fr.box.slice(), cell: fr.sx, rowOrder: 'minY-first',
    target: input.target || doc.game || null, stackHash: (doc.stack && typeof doc.stack.hash === 'string') ? doc.stack.hash : null,
    mapHashes: o.mapHashes || null, rung: base ? base.from : null, env: null, gaps,
    approx: !!res.approx || gaps.some(c => APPROX_GAPS.includes(c)), brightness: 'unverified', made: o.made || new Date().toISOString(),
    size: fr.long,
  };
  if (Math.abs(fr.sy - fr.sx) > 1e-9 * fr.sx) sc.cellY = fr.sy;
  Object.assign(sc, {
    style: input.style, styleVersion: o.styleVersion === undefined ? null : o.styleVersion, paint: require('./index').VERSION,
    seed: input.seed === undefined ? 1 : input.seed, thumb: fr.long <= 512, mode: input.mode || null, inputs,
    base, marks: res.marks || null,
    counts: { outsidePather: (res.counts && res.counts.outsidePather) || 0, noData: (res.counts && res.counts.noData) || 0 },
    stats: res.stats || {}, notes,
  });
  return sc;
}

function write(out, name, grid, sc) {
  const M = mv();
  require('../lib/raster/gridfile').write(path.join(out, name + '.mvg'), grid);
  M.writeAtomic(path.join(out, name + '.json'), JSON.stringify(sc, null, 1) + '\n');
  return [name + '.mvg', name + '.json'];
}

function reads(out, src) {
  const list = src && typeof src.reads === 'function' ? src.reads() : [];
  mv().writeAtomic(path.join(out, 'reads.json'), JSON.stringify({ v: 1, inputs: list }) + '\n');
  return 'reads.json';
}

module.exports = { sidecar, write, reads, APPROX_GAPS, MAX_NOTES };
