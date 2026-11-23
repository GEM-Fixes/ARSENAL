// cover (MV-COV): cover edges, the engine cover port, the terrain lip and concealment (design 5.4; rules.md 4).
//   VERSION, TYPES, VALUE, profile(target)
//   edges(doc, catalog, objects, o)                    -> cover.edges.json items (edges.js)
//   points(doc, grids, catalog, objects, placed, o)    -> wall coverPoint items (probe.js)
//   lip(grids, o)                                      -> {lip, points, counts} (lip.js)
//   conceal(doc, grids, placed, o)                     -> {conceal, points, counts} (conceal.js)
//   bandGrid(points, grids)                            -> u8 grid 'cover.band'
//   shields(pt, threat), terrainShields(grids, pt, threat)
// Games: the same abilities on as64, mowas2 and goh (game = target==='goh' ? 'goh' : 'as2'); goh differences in profile().
// Author: Imperator_Aug (ARSENAL, ia-a02c1a23)
'use strict';
const E = require('./edges');

const VERSION = 1;
// cover point types 1..12 with the band the point gives and the pose it is taken
const TYPES = {
  1: { name: 'look_left', band: 5, pose: 'stand' },
  2: { name: 'look_right', band: 5, pose: 'stand' },
  3: { name: 'look_2way', band: 5, pose: 'stand' },
  4: { name: 'snipe_cover', band: 3, pose: 'squat' },   // survey cover.md 1b: kind 2 squat (rules.md 4.3 poses)
  5: { name: 'squat_lie', band: 2, pose: 'lie' },
  6: { name: 'hide_stand', band: 5, pose: 'stand' },
  7: { name: 'hide_squat', band: 4, pose: 'squat' },
  8: { name: 'open_lie', band: 1, pose: 'lie' },
  9: { name: 'bush_stand', band: 0, pose: 'stand' },
  10: { name: 'bush_squat', band: 0, pose: 'squat' },
  11: { name: 'bush_lie', band: 0, pose: 'lie' },
  12: { name: 'terrain_lie', band: 1, pose: 'lie' },
};
// the cover value (cv) of a type (rules.md 4.1)
const VALUE = { 1: 0.9, 2: 0.9, 3: 0.9, 4: 1.0, 5: 0.8, 6: 0.45, 7: 0.35, 8: 0.5, 9: 0, 10: 0, 11: 0, 12: 0.5 };

const TARGETS = new Set(['as64', 'mowas2', 'goh']);

function profile(target) {
  if (!TARGETS.has(target)) {
    let MvError = null;
    try { MvError = require('../../mapviz').MvError; } catch (e) { /* mapviz half written */ }
    const msg = 'cover: unknown target ' + JSON.stringify(target) + ' (as64, mowas2, goh)';
    if (MvError) throw new MvError('MV_USAGE', msg);
    throw Object.assign(new Error(msg), { code: 'MV_USAGE' });
  }
  const goh = target === 'goh';
  return {
    game: goh ? 'goh' : 'as2',
    objCellU: goh ? 5 : 7,                       // the object height grid cell (GHAI-29)
    lipForProne: !goh,                           // GHAI-32: no terrain covers for a lying soldier on goh
    lipRay: [4, 3],                              // axis, diagonal cells
    occlCells: 5, occlEyeM: 1.35, occlRiseM: 0.45, // TerrainOcclusion (lip.js occlusion, terrainShields)
    circleStartHalf: goh,                        // GHAI-30 [I]: goh starts half a place (the place radius) in
    circleGapM: goh ? 0.3 : 0.1,                 // the start and gap of circle covers: g_coverPlaceGap 0.1 m, goh the place radius (probe.js addCircle)
    zoneTopU: goh ? 1000 : E.U.high,             // GHAI-31
    zoneBottomU: goh ? -1000 : 0,
    lipRejectU: 3, lipUpliftU: 10, lipEnemyU: 0, // g_coverTerrain* (goh the same [I])
  };
}

// the best band of a wall point in each map.net cell (points with a wall only: lip and bush points do not count)
function bandGrid(points, grids) {
  const f = E.frameOf(grids);
  if (!f) throw Object.assign(new Error('cover band: a grid frame is needed'), { code: 'COVER_GRID' });
  const data = new Uint8Array(f.w * f.h);
  for (const p of points || []) {
    if (!p || !p.wall || !(p.band > 0)) continue;
    const c = E.cellOf(f, p.x, p.y);
    if (!c) continue;
    const k = c.j * f.w + c.i;
    if (p.band > data[k]) data[k] = p.band;
  }
  // keyed by band id (entcat BANDS, palette cover.bands), as rules.md 4.1 `{counts:{<band id>: n}}`
  const counts = {};
  for (let b = 1; b <= 5; b++) counts[E.BANDS[b]] = 0;
  for (const v of data) if (v) counts[E.BANDS[v]]++;
  return { name: 'cover.band', w: f.w, h: f.h, cell: f.cell, ox: f.ox, oy: f.oy, etype: 'u8', sample: 'cell', scale: 1, offset: 0, nodata: null,
    meta: { counts }, data };
}

// does the wall of a point stand between it and a threat (SegmentsCross of the wall and threat->point)
function shields(pt, threat) {
  if (!pt || !pt.wall || !threat) return false;
  const t = Array.isArray(threat) ? threat : [threat.x, threat.y];
  return E.segsCross(pt.wall[0], pt.wall[1], t, [pt.x, pt.y]);
}

module.exports = {
  VERSION, TYPES, VALUE, profile, bandGrid, shields,
  get edges() { return E.edges; },
  get points() { return require('./probe').points; },
  get lip() { return require('./lip').lip; },
  get conceal() { return require('./conceal').conceal; },
  get terrainShields() { return require('./lip').terrainShields; },
};
