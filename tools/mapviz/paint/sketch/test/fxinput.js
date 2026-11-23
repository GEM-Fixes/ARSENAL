// sketch test helper (MV-PNT3): the style input of paint contract 4.4 built straight from the owners' exports (mapkit
// grids, raster slopeClass and landform, rules/water masks, entcat place) for one map of a source. It does what the shared
// gather does for the sketch's layers, so the sketch tests run before the shared paint files are merged and pin the
// fixture answers without them. When the shared index.js exists, real.test.js uses its gather instead.
//   build({src, doc, mode, size, seed, style}) -> input
//   frameFor(doc, size) -> frame (contract 4.1, size form)
//   thumbRules(frame), optsFor(input)
// Author: Imperator_Aug (ARSENAL, ia-3f4ba7d2)
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');

function frameFor(doc, size) {
  const F = require(path.join(ROOT, 'render/frame'));
  const p = F.plan(doc, { size });
  const f = F.frameOf(p);
  return { box: p.box.slice(), W: f.W, H: f.H, sx: f.sx, sy: f.sy, x0: f.x0, y0: f.y0, long: Math.max(f.W, f.H), stretch: [f.sx / f.sy] };
}
function thumbRules(frame) {
  return frame.long <= 512 ? { thumb: true, minStroke: 2, maxSymbols: 5, contours: false } : { thumb: false, minStroke: 1, maxSymbols: null, contours: true };
}
function optsFor(input, tick) { return Object.assign(thumbRules(input.frame), { seed: input.seed, tick: tick || (() => {}), pool: 0, workDir: null }); }

function build(o) {
  const K = require(path.join(ROOT, 'lib/mapkit')), R = require(path.join(ROOT, 'lib/raster'));
  const Wt = require(path.join(ROOT, 'rules/water')), E = require(path.join(ROOT, 'entcat'));
  const palette = require(path.join(ROOT, 'palette.json'));
  const src = o.src, doc = o.doc, mode = o.mode || null;
  const g = o.grids || K.grids(src, doc.key, {});
  const t = Date.now();
  const layers = { height: g.height, gtype: g.gtype, material: g.material };
  layers.slopecls = R.slopeClass(g.height);
  layers['landform.r50'] = R.landform(g.height, 50);
  const mk = Wt.masks(doc, g, Wt.profile(src), mode);
  layers['water.band'] = mk.band; layers['water.drown'] = mk.drown;
  const tGrids = Date.now() - t;
  let objects = null;
  if (o.objects !== false) {
    const cat = E.forDoc(src, doc, {});
    objects = E.place(doc, cat).map(x => Object.assign({ kind: 'object' }, x));
  }
  const frame = frameFor(doc, o.size);
  const input = { v: 1, style: 'sketch', target: src.target, map: doc.key, mode, doc, W: mk.W, frame, layers,
    vectors: objects ? { objects } : {}, base: null, palette, pal: palette.styles.field_sketch, seed: o.seed || 1 };
  Object.defineProperty(input, 'ms', { value: { grids: tGrids, total: Date.now() - t } });
  return input;
}

module.exports = { build, frameFor, thumbRules, optsFor };
