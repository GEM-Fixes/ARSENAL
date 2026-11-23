// render (MV-R1, MV-R2, MV-R3): the picture of a map from its files (tools/mapviz/README.md 1.9, 1.11; design 7).
//   VERSION                       part version (cache key, README 8.2); = cli.js version
//   KERNELS                       ['render/l1tile'] + 'render/l3tile' when l3.js loads + 'render/l4tile' when l4.js loads
//   plan(doc, {size, guard?})     -> {size:[w,h], tile:2048, tiles:[{x,y,w,h,guard}], box, cell, cellY, guard}   (R0, sync)
//   l0(doc, grids, o)             -> {grid (rgba8 'pic.l0'), sidecar}   schematic from the grids only (sync)
//   l1(src, doc, o)               -> Promise<{grid (rgba8 'pic.l1'), sidecar, stats}>   ground mesh, materials, textures
//   c0(src, doc, pic, o?)         -> {dx, dy, gain, classMeans, ssim, used, ...}   minimap registration numbers (sync)
//   l2(src, doc, o)               -> Promise<{grid ('pic.l2'), sidecar, aux:{n ('l2.n'), z ('l2.z')}, stats}>   decals and
//                                    water planes over pic.l1 (R2a, l2.js)
//   pack(src, doc, o)             -> {pack, json, bin}   scene pack (R2b, pack.js; absent -> MV_NOT_BUILT)
//   readPack(x)                   -> pack   (R2b, pack.js)
//   l3(src, doc, o)               -> Promise<{grid ('pic.l3'), sidecar, aux, stats}>   objects (R2b, l3.js)
//   l4(src, doc, o)               -> Promise<{grid ('pic.l4'), sidecar, stats}>   light and shadow (R3, l4.js)
//   envLight(src, doc, mode?)     -> {light, gaps}   (R3, env.js through l4.js)
// The modules of l3, pack and l4 are other builders' files: they are reached through optional requires. An absent module
// answers MvError MV_NOT_BUILT (exit 4), detail.code RENDER_NOT_BUILT, detail.rung 'l3' | 'pack' | 'l4'; a module that
// exists and throws on load is a fault (README 1.0).
// Author: Imperator_Aug (ARSENAL, ia-21108ca2)
'use strict';
const F = require('./frame');

const VERSION = 5;   // 2: l0 leaves the cells past the ground mesh (height nodata, R16) transparent; 3: l1 map-scale detail rule (DETAIL in l1.js);
                     // 4: pic.l1.json gains detail, keep, detailTextures, detailChanged (a cached v3 sidecar lacks them); l1 --detail;
                     // 5: waves C and D (l2, pack, l3, l4): one bump, every render key changes once (render.md 2)

function M() { return require('../mapviz'); }
const l2m = () => require('./l2');
const opt3 = () => M().opt(() => require('./l3'), './l3', __filename);      // null when l3.js is absent
const optP = () => M().opt(() => require('./pack'), './pack', __filename);
const opt4 = () => M().opt(() => require('./l4'), './l4', __filename);

function need(mod, rung) {
  if (mod) return mod;
  throw new (M().MvError)('MV_NOT_BUILT', 'render ' + rung + ' is not built yet', { code: 'RENDER_NOT_BUILT', rung });
}

function kernels() {
  const k = ['render/l1tile'];
  const a = opt3(), b = opt4();
  if (a) k.push(a.KERNEL || 'render/l3tile');
  if (b) k.push(b.KERNEL || 'render/l4tile');
  return k;
}

module.exports = {
  VERSION,
  get KERNELS() { return kernels(); },
  plan: F.plan,
  l0: (doc, grids, o) => require('./l0').l0(doc, grids, o),
  l1: (src, doc, o) => require('./l1').l1(src, doc, o),
  c0: (src, doc, pic, o) => require('./c0').c0(src, doc, pic, o),
  l2: (src, doc, o) => l2m().l2(src, doc, o),
  pack: (src, doc, o) => need(optP(), 'pack').pack(src, doc, o),
  readPack: x => need(optP(), 'pack').readPack(x),
  l3: async (src, doc, o) => need(opt3(), 'l3').l3(src, doc, o),
  l4: async (src, doc, o) => need(opt4(), 'l4').l4(src, doc, o),
  envLight: (src, doc, mode) => need(opt4(), 'l4').envLight(src, doc, mode),
  // which rungs are built (late D1): true when the module loads; a module that throws on load is false here
  rungs: () => {
    const ok = f => { try { return !!f(); } catch (e) { return false; } };
    return { l0: true, l1: true, c0: true, l2: true, pack: ok(optP), l3: ok(opt3), l4: ok(opt4) };
  },
  frame: F,
  opt3, optP, opt4,
};
