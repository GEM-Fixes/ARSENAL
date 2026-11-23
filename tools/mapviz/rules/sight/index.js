// sight (MV-SIG, design 5.3, freeze rules.md section 3): the engine's sight grid, line of sight, fire lines and the
// clicked spot's viewshed, on as64, mowas2 and goh. mowas2 = as64 in every rule; the code picks the branch by
// game = target === 'goh' ? 'goh' : 'as2', and every goh branch names its source (grid.js, vision.js).
//   VERSION 1;  CELL {as2: 7, goh: 5};  POSE {stand, kneel, prone: {eyeM, topM}}
//   profile(src) -> vprof                                  vision.js
//   rangeM(vprof, viewer, target, o?) -> metres            vision.js
//   grid(doc, grids, placed, o?) -> {grid, ground, field, counts, notes}   grid.js; o {target, tick}
//   fireGrid(doc, grids, placed, o?) -> {top, bottom, height, gtype, W}     fire.js; o {mode, tick}
//   canSee(sg, a, b, o?), visibleHeight(sg, a, b, o?)      ray.js; o {uncoverU, rangeU, vFovDeg}
//   fireLine(fg, a, b, o?) -> {clear, block, at}           fire.js
//   viewshed(sg, fg, a, o) -> {view, vis, fire, rings}     view.js
//   eyeZ(grids, x, y, who), pSeen(sg, a, solids, o?)       view.js; o {game, row, placed}: row's own cells suspended
//   snap(sg | {C, ox, oy}, x, y) -> [x, y]                  --at snapped to the sight cell's south-west corner (ruling 5)
//   gameOf(target)
// Sync, node built-ins and the mapviz libs only. Heavy files load at first use.
// Author: Imperator_Aug (ARSENAL, ia-e7ba1021)
'use strict';

const VERSION = 1;
const CELL = Object.freeze({ as2: 7, goh: 5 });
const gameOf = t => t === 'goh' ? 'goh' : 'as2';

function snap(f, x, y) {
  const g = f && f.grid ? f.grid : f;
  const C = (g.meta && g.meta.cellU) || g.cell || g.C, ox = g.ox, oy = g.oy;
  return [ox + Math.floor((x - ox) / C) * C, oy + Math.floor((y - oy) / C) * C];
}

module.exports = {
  VERSION, CELL, gameOf, snap,
  get POSE() { return require('./view').POSE; },
  profile: (src) => require('./vision').profile(src),
  rangeM: (vprof, viewer, target, o) => require('./vision').rangeM(vprof, viewer, target, o),
  grid: (doc, grids, placed, o) => require('./grid').grid(doc, grids, placed, o),
  fireGrid: (doc, grids, placed, o) => require('./fire').fireGrid(doc, grids, placed, o),
  canSee: (sg, a, b, o) => require('./ray').canSee(sg, a, b, o),
  visibleHeight: (sg, a, b, o) => require('./ray').visibleHeight(sg, a, b, o),
  fireLine: (fg, a, b, o) => require('./fire').fireLine(fg, a, b, o),
  viewshed: (sg, fg, a, o) => require('./view').viewshed(sg, fg, a, o),
  eyeZ: (grids, x, y, who) => require('./view').eyeZ(grids, x, y, who),
  pSeen: (sg, a, solids, o) => require('./view').pSeen(sg, a, solids, o),
};
