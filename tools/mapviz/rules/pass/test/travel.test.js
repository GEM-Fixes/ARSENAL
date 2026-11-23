// pass travel test (MV-PAS, wave C): object obstacles, move and mcost, run speed, spawns and boxes, travel time fields
// and routes (wave C rules draft 5 and 10). Synthetic cases first (footprint raster, crossing per kind, move order,
// speed keys, phases, boxes, the travel step, the 5 u fold, routes through a gap), then the fixture known answers on
// every target (as2 form with mowas2 and again with as64, goh form with goh), the CLIs through mapviz.js (exits, --in
// chain = in process, determinism, PASS_NO_SPAWN), goldens (travel.golden.json) and planted defects.
// usage: node tools/mapviz/rules/pass/test/travel.test.js [scratch dir]     MAPVIZ_PASS_GOLDEN=write rewrites the golden
// Author: Imperator_Aug (ARSENAL, ia-142892da)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawnSync } = require('child_process');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-pass-travel-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz pass travel: ' + what); } }
function eq(a, b, what) { ok(JSON.stringify(a) === JSON.stringify(b), what + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ': did not throw'); } catch (e) { ok(e && (e.code === code || (e.detail && e.detail.code === code)), what + ': threw ' + (e && e.code) + ' ' + (e && e.message)); }
}

const ROOT = path.resolve(__dirname, '../../..');
const MVJS = path.join(ROOT, 'mapviz.js');
const Ps = require('..');
const OB = require('../obst'), SP = require('../speed'), TV = require('../travel'), RT = require('../routes');
const K = require(path.join(ROOT, 'lib/mapkit'));
const gf = require(path.join(ROOT, 'lib/raster/gridfile'));
const fx = require(path.join(ROOT, 'test/fxmake'));
const sha1 = b => crypto.createHash('sha1').update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest('hex');

const mem = (target, files) => ({ target, has: k => Object.prototype.hasOwnProperty.call(files, k), read: k => Buffer.from(files[k], 'latin1'), reads: () => [] });
function grid(name, w, h, cell, etype, fill, o) {
  const T = { u8: Uint8Array, f32: Float32Array, i16: Int16Array }[etype];
  const d = new T(w * h);
  if (fill !== undefined) d.fill(fill);
  return Object.assign({ name, w, h, cell, ox: 0, oy: 0, etype, sample: 'cell', scale: 1, offset: 0, nodata: null, meta: {}, data: d }, o || {});
}
const AS2V = Ps.profiles(mem('mowas2', {})), GOHV = Ps.profiles(mem('goh', {}));
const profOf = (L, id, kind) => Object.assign({}, L.find(p => p.patherId === id), { unit: { kind } });

// ---------------------------------------------------------------- 1. footprint raster
{
  const g = { w: 10, h: 10, cell: 10, ox: 0, oy: 0 };
  const code = new Uint8Array(100), cost = new Float32Array(100);
  OB.rasterize(code, cost, g, [[32, 32], [58, 32], [58, 48], [32, 48]], 6, false, 0);
  eq([code[3 * 10 + 3], code[3 * 10 + 5], code[4 * 10 + 4]], [2, 2, 2], 'raster: cells the box overlaps are core 2');
  eq([code[3 * 10 + 2], code[3 * 10 + 6], code[2 * 10 + 4]], [3, 3, 3], 'raster: cells within 6 u are margin 3');
  eq([code[3 * 10 + 1], code[3 * 10 + 7]], [0, 0], 'raster: cells farther than the radius stay 0');
  const c2 = new Uint8Array(100);
  OB.rasterize(c2, cost, g, [[30, 30], [40, 30], [40, 40], [30, 40]], 0, false, 0);
  eq([c2[33], c2[34], c2[43], c2[23]], [2, 0, 0, 0], 'raster: a footprint on cell lines takes only the cell it covers (a touch is no overlap)');
  // concave L shape: the notch cell stays free
  const c3 = new Uint8Array(100);
  OB.rasterize(c3, cost, g, [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]], 0, false, 0);
  eq([c3[0], c3[1], c3[2], c3[10], c3[20], c3[11]], [2, 2, 2, 2, 2, 0], 'raster: concave footprint, the notch cell (1,1) is free');
  // crossable: code 1, cost kept as the highest; a blocker over it wins; no margin for crossables
  const c4 = new Uint8Array(100), k4 = new Float32Array(100);
  OB.rasterize(c4, k4, g, [[2, 2], [28, 2], [28, 8], [2, 8]], 6, true, 3);
  eq([c4[0], c4[1], c4[2], c4[3], k4[1]], [1, 1, 1, 0, 3], 'raster: crossable footprint is 1 with its cost, no margin');
  OB.rasterize(c4, k4, g, [[12, 2], [18, 2], [18, 8], [12, 8]], 0, false, 0);
  eq(c4[1], 2, 'raster: a blocker over a crossable cell wins');
}

// ---------------------------------------------------------------- 2. crossing per kind and the obstacle rule
{
  const en = { crushBy: { tank: 2, tankLight: -1, armored: 1, car: -1 }, vaultable: null };
  const P = (id, kind) => ({ patherId: id, unit: { kind } });
  eq([OB.crossOf(en, P('human', 'inf')).cross, OB.crossOf(en, P('cannon.carried', 'mg')).cross], [false, false], 'cross: inf and mg never crush');
  eq([OB.crossOf(en, P('tank', 'tank')).cross, OB.crossOf(en, P('tank', 'tank')).cost], [true, 2], 'cross: tank column tank 2 crosses at cost 2');
  eq(OB.crossOf(en, P('tank.light', 'tank')).cross, false, 'cross: profile tank.light reads the tankLight column (-1 blocks)');
  eq(OB.crossOf(en, P('armored', 'tank')).cross, true, 'cross: profile armored reads the armored column');
  eq(OB.crossOf(en, P('t34', 'tank')).cross, true, 'cross: GoH t34 reads the tank column');
  eq(OB.crossOf(en, P('cannon.small', 'at')).cross, false, 'cross: at reads the car column');
  eq(OB.crossOf({ crushBy: { tank: null } }, P('tank', 'tank')), { cross: false, cost: 0, unknown: true, why: 'unknown' }, 'cross: a null column blocks, counted unknown');
  eq(OB.crossOf({ crushBy: {}, vaultable: true }, P('human', 'inf')).cross, true, 'cross: vaultable crosses for inf (GoH flag_vaultable)');
  eq(OB.crossOf({ crushBy: {}, vaultable: true }, P('cannon.carried', 'mg')).cross, false, 'cross: vaultable does not cross for mg');
  // obstacles.reg cost per pather profile name (fixer 2026-11-14): the kind's own column wins over the fallback rule
  // costs as the real tables give them (GoH and AS2 obstacles.reg, read through entcat crush.table)
  const TB = { ids: {
    nothing: { flags: [], cost: { human: 0, 'cannon.carried': 0, 'cannon.small': 0, tank: 0, 'vehicle.small': 0 } },
    post: { flags: [], cost: { human: 0, 'cannon.small': -1, 'vehicle.small': 1500, tank: 10 } },
    trench_wall: { flags: [], cost: { human: 20, 'cannon.carried': 100, 'cannon.small': 50, 'vehicle.small': -1, tank: 15 } },
    construction_vaultable: { flags: ['flag_vaultable'], cost: { human: 5, 'cannon.small': 200 } },
    small_building: { flags: [], cost: { human: -1, tank: 30 } },
  } };
  const E = (id, extra) => Object.assign({ obstacleId: id, crushBy: { tank: -1, tankLight: -1, armored: -1, car: -1 }, vaultable: null }, extra || {});
  eq(OB.crossOf(E('nothing'), P('human', 'inf'), TB), { cross: true, cost: 0, unknown: false, why: 'reg' }, 'cross reg: goh nothing is free for inf (human 0)');
  eq(OB.crossOf(E('nothing'), P('cannon.carried', 'mg'), TB).cross, true, 'cross reg: goh nothing is free for mg (cannon.carried 0)');
  eq(OB.crossOf(E('post', { crushBy: { car: 1500 } }), P('cannon.small', 'at'), TB), { cross: false, cost: 0, unknown: false, why: 'blocks' }, 'cross reg: goh post blocks at (cannon.small -1), not the car column 1500');
  eq([OB.crossOf(E('trench_wall'), P('human', 'inf'), TB).cost, OB.crossOf(E('trench_wall'), P('cannon.small', 'at'), TB).cost], [20, 50], 'cross reg: as2 trench_wall crossable by inf (20) and at (50)');
  eq(OB.crossOf(E('trench_wall'), P('cannon.carried', 'mg'), TB).cost, 100, 'cross reg: trench_wall for mg at cannon.carried 100');
  eq(OB.crossOf(E('construction_vaultable', { vaultable: true }), P('human', 'inf'), TB), { cross: true, cost: 5, unknown: false, why: 'vault' }, 'cross reg: goh vaultable at the human cost 5');
  eq(OB.crossOf(E('small_building'), P('human', 'inf'), TB).cross, false, 'cross reg: human -1 blocks');
  eq(OB.crossOf(E('small_building'), P('tank', 'tank'), TB).cost, 30, 'cross reg: tank by its own column');
  eq(OB.crossOf(E('small_building'), P('t34', 'tank'), TB), { cross: false, cost: 0, unknown: true, why: 'blocks' }, 'cross reg: no t34 column: fallback crushBy.tank, counted unknown');
  eq(OB.crossOf(E('no_such_id'), P('human', 'inf'), TB), { cross: false, cost: 0, unknown: true, why: 'never' }, 'cross reg: id not in the table: fallback (inf blocks), counted unknown');
  eq(OB.crossOf({ crushBy: {} }, P('human', 'inf'), TB).unknown, false, 'cross reg: no obstacleId: fallback, not unknown');
  ok(OB.isObstacle({ footprint: { kind: 'obb', source: 'authored' }, volumes: [] }), 'obstacle: an authored footprint is an obstacle');
  ok(!OB.isObstacle({ footprint: { kind: 'box-proj', source: 'volumes' }, volumes: [{ able: { visible: true } }] }), 'obstacle: a bush (volume box, no obstacle volume) is not');
  ok(OB.isObstacle({ footprint: { kind: 'box-proj', source: 'volumes' }, volumes: [{ able: { obstacle: true } }] }), 'obstacle: a volume box with an obstacle volume is');
  ok(!OB.isObstacle({ footprint: { kind: 'decal', source: 'decal' }, volumes: [] }), 'obstacle: a decal is not');
}

// ---------------------------------------------------------------- 3. obstacles(): move order and mcost
{
  const w = 8, h = 4;
  const gtype = grid('gtype', w, h, 10, 'u8', 1);
  const pass = grid('pass.tank', w, h, 10, 'u8', 1), cost = grid('cost.tank', w, h, 10, 'f32', 1.5);
  pass.data[0] = 0; pass.data[1] = 4; pass.data[2] = 3; pass.data[9] = 2;
  const cat = { entries: { wall: { footprint: { kind: 'obb', source: 'authored' }, volumes: [], crushBy: { tank: -1 } },
    fence: { footprint: { kind: 'obb', source: 'authored' }, volumes: [], crushBy: { tank: 1 } } }, failed: [{ def: 'ghost', code: 'ENTCAT_DEF_MISSING', msg: 'x' }] };
  const objs = [
    { uid: 1, def: 'wall', fp: { kind: 'obb', pts: [[11, 1], [19, 1], [19, 9], [11, 9]] } },   // over the ground-blocked cell (1, 0)
    { uid: 2, def: 'wall', fp: { kind: 'obb', pts: [[41, 11], [49, 11], [49, 19], [41, 19]] } },  // cell (4, 1)
    { uid: 3, def: 'fence', fp: { kind: 'obb', pts: [[61, 21], [69, 21], [69, 29], [61, 29]] } }, // cell (6, 2)
    { uid: 4, def: 'ghost', fp: { kind: 'none', pts: [[0, 0]] } },
    { uid: 5, def: 'wall', fp: { kind: 'none', pts: [[5, 5]] } },
  ];
  const prof = { patherId: 'tank', radiusM: 0, ground: {}, heights: [], unit: { kind: 'tank' } };
  const r = Ps.obstacles({ gtype, pass, cost }, objs, cat, prof, { box: [0, 0, 70, 40] });
  const M = r.move.data;
  eq([M[0], M[1], M[2], M[9], M[1 * w + 4], M[2 * w + 6], M[3]], [0, 4, 3, 2, 5, 6, 1], 'move: nodata 0, ground 4 and slope 3 before object 5, crossable 6, slow 2, open 1');
  eq(M[w - 1], 7, 'move: a cell centre outside the box is 7');
  eq([r.mcost.data[3], r.mcost.data[2 * w + 6], r.mcost.data[1 * w + 4], r.mcost.data[0]], [1.5, 2.5, -1, -1], 'mcost: cost, cost + object cost on 6, -1 where blocked or nodata');
  eq([r.counts.skipped, r.skipped[0].code, r.counts.noFootprint], [1, 'ENTCAT_DEF_MISSING', 1], 'obstacles: a failed def is skipped and listed, a footprint-less obstacle counted');
  ok(r.notes.some(n => n.code === 'PASS_OBJECT_NO_FP'), 'obstacles: note PASS_OBJECT_NO_FP');
  eq([r.obst.name, r.move.name, r.mcost.name, r.obst.meta.patherId, r.move.meta.box], ['obst.tank', 'move.tank', 'mcost.tank', 'tank', [0, 0, 70, 40]], 'obstacles: names and meta');
  ok(r.notes.some(n => n.code === 'PASS_NO_REG'), 'obstacles: no obstacles.reg table: note PASS_NO_REG');
  // with an obstacles.reg table: the inf column decides (wall -1 blocks, fence 7 crosses at 7)
  const catR = { entries: { wall: Object.assign({ obstacleId: 'wall' }, cat.entries.wall), fence: Object.assign({ obstacleId: 'fence' }, cat.entries.fence) }, failed: [] };
  const tab = { ids: { wall: { flags: [], cost: { human: -1 } }, fence: { flags: [], cost: { human: 7 } } } };
  const pinf = { patherId: 'human', radiusM: 0, ground: {}, heights: [], unit: { kind: 'inf' } };
  const ri = Ps.obstacles({ gtype, pass, cost }, objs.slice(0, 3), catR, pinf, { box: [0, 0, 70, 40], table: tab });
  eq([ri.move.data[1 * w + 4], ri.move.data[2 * w + 6], ri.mcost.data[2 * w + 6], ri.counts.byReg, ri.counts.crushUnknown], [5, 6, 8.5, 3, 0], 'obstacles reg: inf blocked by wall, crosses fence at cost 7 (mcost 1.5 + 7)');
  ok(!ri.notes.some(n => n.code === 'PASS_NO_REG' || n.code === 'PASS_CRUSH_UNKNOWN'), 'obstacles reg: no fallback notes');
  // GHMOV-23 [I]: goh tank on passable water cells gets the note, as2 does not, codes unchanged
  const gw = grid('gtype', w, h, 10, 'u8', 1);
  gw.data[3] = 3; gw.data[4] = 3;
  const rg = Ps.obstacles({ gtype: gw, pass, cost }, [], cat, prof, { box: [0, 0, 70, 40], target: 'goh' });
  const ra = Ps.obstacles({ gtype: gw, pass, cost }, [], cat, prof, { box: [0, 0, 70, 40], target: 'mowas2' });
  ok(rg.notes.some(n => n.code === 'PASS_GOH_CHASSIS_WATER') && rg.counts.chassisWater === 2 && !ra.notes.some(n => n.code === 'PASS_GOH_CHASSIS_WATER'), 'obstacles: goh tank on water cells: note PASS_GOH_CHASSIS_WATER (GHMOV-23), not on as2');
  ok(Buffer.from(rg.move.data).equals(Buffer.from(ra.move.data)), 'obstacles: GHMOV-23 note leaves the move codes as pather.set gives them');
  // planted: pass on another frame, objects not a list
  const bad = grid('pass.tank', w + 1, h, 10, 'u8', 1);
  throwsCode(() => Ps.obstacles({ gtype, pass: bad, cost }, objs, cat, prof), 'PASS_GRID', 'planted: pass grid off the gtype frame');
  throwsCode(() => Ps.obstacles({ gtype, pass, cost }, null, cat, prof), 'PASS_OBJECTS', 'planted: objects not a list');
}

// ---------------------------------------------------------------- 4. speed, spawns, phases, boxes
{
  const files = {
    'resource/entity/humanskin/human/human.def': '{human\r\n {Chassis "foot"\r\n  {Run {Walk 8 2 200} {Normal 14 7 400} {Fast 25 7 400}}\r\n }\r\n}\r\n',
    'resource/entity/-vehicle/tank_medium/m4a3_75/m4a3_75.def': '{game_entity\r\n {Chassis "track"\r\n  {Locomotion {MaxSpeed 25} {maxspeed 33}}\r\n }\r\n}\r\n',
    'resource/entity/-vehicle/ussr/tank_medium/t3476_42/t3476_42.def': '{game_entity\r\n {Chassis "track"\r\n  {Locomotion {Slow 10} {Normal 33} {MaxSpeed 55}}\r\n }\r\n}\r\n',
  };
  const a = SP.speed(mem('mowas2', files), 'inf');
  eq([a.kmh, a.source, a.key], [14, 'def', 'Chassis/Run/Normal'], 'speed: inf from Chassis Run Normal');
  eq([SP.speed(mem('as64', files), 'tank').kmh, SP.speed(mem('as64', files), 'tank').key], [33, 'Chassis/Locomotion/MaxSpeed'], 'speed: as2 tank, the last MaxSpeed (any case)');
  eq([SP.speed(mem('goh', files), 'tank').kmh, SP.speed(mem('goh', files), 'tank').key], [33, 'Chassis/Locomotion/Normal'], 'speed: goh tank, Locomotion Normal before MaxSpeed');
  const f = SP.speed(mem('goh', {}), 'at');
  eq([f.kmh, f.source, Math.round(f.runMs * 1000)], [6, 'fallback', 1667], 'speed: no def gives the fallback');
  eq(Ps.SPEED_FALLBACK, { inf: 15, mg: 10, at: 6, tank: 30 }, 'SPEED_FALLBACK');
  const doc = { boxes: { pather: [-100, -100, 100, 100], auto: [-200, -200, 200, 200], named: [{ name: 'west', pather: [-100, -100, 0, 100] }] },
    modes: [
      { id: 'one', spawns: [{ name: 'a1', team: 'a', x: -50, y: 0, phase: null }], flags: [], clipsBySide: [] },
      { id: 'fl', spawns: [{ name: 'a1', team: 'a', x: -50, y: 0, phase: 2 }, { name: 'a0', team: 'a', x: -60, y: 0, phase: 1 },
        { name: null, uid: 7, team: 'a', x: -70, y: 0, phase: null }, { name: 'b1', team: 'b', x: 50, y: 0, phase: 1 }],
      flags: [{ name: 'f1', x: 0, y: 0, phase: 1 }, { name: 'f2', x: 0, y: 10, phase: 2 }, { name: 'f0', x: 0, y: 20, phase: null }],
      clipsBySide: [{ team: 'a', phase: 1, clip: 'west' }] },
    ] };
  eq(SP.modeOf(doc, null).id, 'fl', 'modeOf: no mode = the first with spawns of both sides');
  const s1 = Ps.spawnsOf(doc, 'fl', 'a', null);
  eq([s1.map(x => x.name), s1.phase], [['a0', 'uid 7'], 1], 'spawnsOf: phase null = the lowest phase, plus phase-null spawns; nameless = uid');
  eq(Ps.spawnsOf(doc, 'fl', 'a', 2).map(x => x.name), ['a1', 'uid 7'], 'spawnsOf: phase 2');
  eq(Ps.spawnsOf(doc, 'one', 'b', null).length, 0, 'spawnsOf: no spawn of side b');
  eq(SP.flagsOf(doc, 'fl', 1).map(x => x.name), ['f1', 'f0'], 'flagsOf: the phase and phase-null flags');
  eq(Ps.activeBox(doc, 'fl', 'a', 1), [-100, -100, 0, 100], 'activeBox: the side clip pather box');
  eq(Ps.activeBox(doc, 'fl', 'b', 1), [-100, -100, 100, 100], 'activeBox: no clip of side b: boxes.pather');
  eq(Ps.activeBox({ boxes: { pather: null, auto: [1, 2, 3, 4] }, modes: [] }, null, 'a', null), [1, 2, 3, 4], 'activeBox: boxes.auto when there is no pather box');
  // late R3: phase null resolves once over spawns, flags and clips of the mode; every reader uses that phase
  const d3 = { boxes: { pather: [-100, -100, 100, 100], named: [{ name: 'p1', pather: [-100, -100, 0, 100] }, { name: 'p2', pather: [0, -100, 100, 100] }] },
    modes: [
      { id: 'sf', spawns: [{ name: 'a', team: 'a', x: 0, y: 0, phase: null }, { name: 'b', team: 'b', x: 1, y: 0, phase: null }],
        flags: [{ name: 'f2', x: 0, y: 0, phase: 2 }, { name: 'f1', x: 0, y: 0, phase: 1 }],
        clipsBySide: [{ team: 'a', phase: 2, clip: 'p2' }, { team: 'a', phase: 1, clip: 'p1' }] },
      { id: 'ab', spawns: [{ name: 'a1', team: 'a', x: 0, y: 0, phase: 1 }, { name: 'b2', team: 'b', x: 1, y: 0, phase: 2 }], flags: [], clipsBySide: [] },
      { id: 'np', spawns: [{ name: 'a', team: 'a', x: 0, y: 0 }], flags: [{ name: 'f', x: 0, y: 0, phase: null }], clipsBySide: [] },
    ] };
  eq([SP.resolvePhase(d3, 'sf', null), SP.resolvePhase(d3, 'ab', null), SP.resolvePhase(d3, 'np', null), SP.resolvePhase(d3, 'sf', 2)], [1, 1, null, 2], 'resolvePhase: lowest over spawns, flags and clips; null when the mode has none; given phase kept');
  eq([Ps.spawnsOf(d3, 'sf', 'a', null).phase, SP.flagsOf(d3, 'sf', null).map(x => x.name)], [1, ['f1']], 'R3: phase-null spawns, flags of phases 1 and 2: phase 1, flags f1 only');
  eq(Ps.activeBox(d3, 'sf', 'a', null), [-100, -100, 0, 100], 'R3: activeBox with phase null takes the clip of the resolved phase');
  eq([Ps.spawnsOf(d3, 'ab', 'a', null).map(x => x.name), Ps.spawnsOf(d3, 'ab', 'b', null).length, Ps.spawnsOf(d3, 'ab', 'b', null).phase], [['a1'], 0, 1], 'R3: one phase for both sides: side b (phase 2 only) has no spawn in phase 1');
  eq([Ps.spawnsOf(d3, 'np', 'a', null).length, Ps.spawnsOf(d3, 'np', 'a', null).phase], [1, null], 'R3: a mode with no phase uses its phase-null items');
  // the routes targets follow the same phase
  {
    const fr = { cell: 10, ox: 0, oy: 0, w: 4, h: 1 };
    const d4 = { boxes: { pather: [0, 0, 40, 10] }, modes: [{ id: 'm', spawns: [{ name: 'a', team: 'a', x: 5, y: 5, phase: null }, { name: 'b', team: 'b', x: 35, y: 5, phase: null }],
      flags: [{ name: 'f1', x: 15, y: 5, phase: 1 }, { name: 'f2', x: 25, y: 5, phase: 2 }], clipsBySide: [] }] };
    const F = { fr, code: new Uint8Array(4).fill(1), rate: new Float64Array(4).fill(0.1), flags: new Uint8Array(4) };
    const rr = Ps.routes(d4, null, null, null, { mode: 'm', phase: null, unit: 'inf', seed: 1, k: 1, fold: F });
    eq([...new Set(rr.items.map(x => x.to.name))], ['f1'], 'R3: routes with phase null target the flags of the resolved phase only');
    // ruling R-f: products write the phase they used (routes result and density meta)
    eq([rr.phase, rr.density.a.meta.phase, rr.density.b.meta.phase], [1, 1, 1], 'R-f: routes phase null resolves to 1, written to the result and the density meta');
    const r2p = Ps.routes(d4, null, null, null, { mode: 'm', phase: 2, unit: 'inf', seed: 1, k: 1, fold: F });
    eq([r2p.phase, [...new Set(r2p.items.map(x => x.to.name))]], [2, ['f2']], 'R-f: routes --phase 2 keeps 2 and targets f2');
    const d5 = { boxes: d4.boxes, modes: [{ id: 'm', spawns: d4.modes[0].spawns, flags: [{ name: 'f0', x: 15, y: 5 }], clipsBySide: [] }] };
    eq(Ps.routes(d5, null, null, null, { mode: 'm', unit: 'inf', seed: 1, k: 1, fold: F }).phase, null, 'R-f: a mode with no phase writes phase null');
  }
}

// ---------------------------------------------------------------- 5. travel step and fold
{
  const w = 20, h = 5;
  const prof = { patherId: 'x', ground: { 1: { k: 1, cost: 0 }, 2: { k: 0.5, cost: 1 }, 7: { k: 1.25, cost: 0 } }, unit: { kind: 'inf' } };
  const move = grid('move.inf', w, h, 10, 'u8', 1), gtype = grid('gtype', w, h, 10, 'u8', 1);
  const spd = { runMs: 5, source: 'def' };
  const src = [{ name: 's', x: 5, y: 25 }];
  let r = Ps.travel({ move, gtype }, prof, spd, src, { name: 'travel.a.inf' });
  const T = r.t.data;
  eq([T[2 * w + 0], Math.round(T[2 * w + 10] * 1000)], [0, 1000], 'travel: 10 cells of 0.5 m at 5 m/s = 1.0 s');
  eq(Math.round(T[3 * w + 1] * 1e6), Math.round(0.5 * Math.SQRT2 / 5 * 1e6), 'travel: diagonal step');
  // K: a slow strip (type 2, K 0.5) doubles the step; road K 1.25 is clamped to 1
  for (let j = 0; j < h; j++) gtype.data[j * w + 5] = 2;
  for (let j = 0; j < h; j++) gtype.data[j * w + 6] = 7;
  r = Ps.travel({ move, gtype }, prof, spd, src, {});
  eq(Math.round(r.t.data[2 * w + 10] * 1000), 1100, 'travel: K 0.5 half speed on one cell (two half steps), road clamped to 1');
  // a wall with no gap: the far side is unreached (-1); outside the box -1
  for (let j = 0; j < h; j++) move.data[j * w + 12] = 5;
  r = Ps.travel({ move, gtype }, prof, spd, src, { box: [0, 0, 100, 50] });
  eq([r.t.data[2 * w + 14], r.t.data[2 * w + 11] > 0, r.t.data[2 * w + 10] < 0], [-1, false, true], 'travel: blocked wall and the box (cells past x 100 are -1)');
  // no corner cutting: a diagonal between two blocked cells is refused
  const m2 = grid('move.inf', 3, 3, 10, 'u8', 1), g2 = grid('gtype', 3, 3, 10, 'u8', 1);
  m2.data[1] = 5; m2.data[3] = 5;
  const r2 = Ps.travel({ move: m2, gtype: g2 }, prof, spd, [{ name: 's', x: 5, y: 5 }], {});
  ok(r2.t.data[4] === -1, 'travel: no diagonal past blocked corners (' + r2.t.data[4] + ')');
  // fold of a 5 u grid: 2 x 2 blocks, worst code, slowest K
  const m5 = grid('move.inf', 4, 4, 5, 'u8', 1), g5 = grid('gtype', 4, 4, 5, 'u8', 1);
  m5.data[0] = 6; m5.data[1] = 2; m5.data[2] = 5; g5.data[4 * 2 + 3] = 2;
  const F = TV.fold({ move: m5, gtype: g5 }, prof, spd);
  eq([F.fr.cell, F.fr.w, F.fr.h, F.fr.f], [10, 2, 2, 2], 'fold: a 5 u map folds onto 10 u');
  eq([F.code[0], F.code[1], F.code[2], F.code[3]], [6, 5, 1, 1], 'fold: worst code per block (6 over 2, 5 over 1)');
  eq([F.rate[3] * 5, F.rate[1]], [2, Infinity], 'fold: slowest K of the block, blocked rate Infinity');
  ok((F.flags[0] & 4) === 4, 'fold: crossable object flag');
  // planted: gtype off the move frame
  throwsCode(() => Ps.travel({ move, gtype: grid('gtype', w, h + 1, 10, 'u8', 1) }, prof, spd, src, {}), 'PASS_GRID', 'planted: gtype off the move frame');
  throwsCode(() => TV.travelFrame({ w: 4, h: 4, cell: 7, ox: 0, oy: 0 }), 'PASS_GRID', 'planted: a 7 u cell that does not fold onto 10 u');
}

// ---------------------------------------------------------------- 6. routes through a gap
{
  const w = 40, h = 30;
  const prof = { patherId: 'x', ground: { 1: { k: 1, cost: 0 } }, unit: { kind: 'inf' } };
  const move = grid('move.inf', w, h, 10, 'u8', 1), gtype = grid('gtype', w, h, 10, 'u8', 1);
  for (let j = 0; j < h; j++) if (j !== 25) move.data[j * w + 20] = 5;      // wall at i 20, gap at j 25
  const doc = { boxes: { pather: [0, 0, 400, 300] }, modes: [{ id: 'm', spawns: [{ name: 'a1', team: 'a', x: 55, y: 55, phase: 0 }, { name: 'b1', team: 'b', x: 355, y: 55, phase: 0 }],
    flags: [{ name: 'f1', x: 355, y: 155, phase: 0 }, { name: 'fx', x: 205, y: 105, phase: 0 }], clipsBySide: [] }] };
  const spd = { runMs: 5, source: 'def' };
  const tA = Ps.travel({ move, gtype }, prof, spd, Ps.spawnsOf(doc, 'm', 'a', null), { name: 'travel.a.inf' }).t;
  const tB = Ps.travel({ move, gtype }, prof, spd, Ps.spawnsOf(doc, 'm', 'b', null), { name: 'travel.b.inf' }).t;
  const o = { mode: 'm', phase: null, unit: 'inf', seed: 1, prof, speed: spd };
  const r = Ps.routes(doc, { move, gtype }, tA, tB, o);
  const af1 = r.items.filter(x => x.side === 'a' && x.to.name === 'f1');
  eq(af1.length, 8, 'routes: 8 randomised routes per pair');
  eq(af1.map(x => x.k), [0, 1, 2, 3, 4, 5, 6, 7], 'routes: sorted by k');
  const viaGap = x => x.pts.some(p => Math.abs(p[0] - 205) < 12 && Math.abs(p[1] - 255) < 12);
  ok(af1.every(viaGap), 'routes: every a1 -> f1 route goes through the gap (205, 255)');
  const ta = tA.data[15 * w + 35];
  ok(Math.abs(af1[0].seconds - ta) < 0.05, 'routes: k 0 seconds = travel time at the target cell (' + af1[0].seconds + ' vs ' + ta + ')');
  ok(af1.every(x => x.seconds >= af1[0].seconds - 0.01), 'routes: k 0 is the fastest');
  ok(af1.some(x => JSON.stringify(x.pts) !== JSON.stringify(af1[0].pts)), 'routes: randomised routes differ from k 0');
  eq([af1[0].pts[0], af1[0].pts[af1[0].pts.length - 1]], [[55, 55], [355, 155]], 'routes: pts start at the spawn and end at the target');
  eq(af1[0].from, { type: 'spawn', name: 'a1' }, 'routes: from');
  ok(r.items.some(x => x.side === 'b' && x.to.name === 'f1'), 'routes: side b to the flags too');
  // the flag fx sits in the wall cell: no route there (travel -1)
  ok(r.noRoute.some(x => x.side === 'a' && x.to === 'fx') && r.noRoute.some(x => x.side === 'b' && x.to === 'fx'), 'routes: a target in a blocked cell is listed as no route');
  const dA = r.density.a;
  eq([dA.name, dA.meta.routes, dA.meta.pairs, dA.meta.k], ['route.a.inf', 8, 2, 8], 'routes: density meta');
  eq(dA.data[25 * w + 20], 250, 'routes: every side a route crosses the gap cell (250)');
  const r2 = Ps.routes(doc, { move, gtype }, tA, tB, o);
  ok(JSON.stringify(r2.items) === JSON.stringify(r.items) && sha1(r2.density.a.data) === sha1(dA.data), 'routes: same seed, same routes');
  const r3 = Ps.routes(doc, { move, gtype }, tA, tB, Object.assign({}, o, { seed: 7 }));
  ok(JSON.stringify(r3.items) !== JSON.stringify(r.items), 'routes: another seed, other routes');
  // targets fall back to the enemy spawns without flags
  const d2 = JSON.parse(JSON.stringify(doc)); d2.modes[0].flags = [];
  const r4 = Ps.routes(d2, { move, gtype }, tA, tB, o);
  eq([...new Set(r4.items.map(x => x.side + '>' + x.to.type + ' ' + x.to.name))].sort(), ['a>spawn b1', 'b>spawn a1'], 'routes: no flags, the enemy spawns');
  eq(RT.simplify([[0, 0], [10, 0.4], [20, 0], [30, 20]], 1).length, 3, 'simplify: drops the point within 1 u');
  throwsCode(() => Ps.routes(doc, { move, gtype }, grid('travel.a.inf', 3, 3, 10, 'f32', 0), tB, o), 'PASS_GRID', 'planted: travel grid off the travel frame');
}

// ---------------------------------------------------------------- 7. fixture known answers (rules.md 10)
const GOLD_FILE = path.join(__dirname, 'travel.golden.json');
let GOLD = null;
try { GOLD = JSON.parse(fs.readFileSync(GOLD_FILE, 'utf8')); } catch (e) { GOLD = null; }
const writeGold = process.env.MAPVIZ_PASS_GOLDEN === 'write';
const newGold = {};
const E = require(path.join(ROOT, 'entcat'));
function cli(args) {
  const r = spawnSync(process.execPath, [MVJS].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { MAPVIZ_NO_GAME: '1' }) });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim() };
}
const jp = s => { try { return JSON.parse(s); } catch (e) { return null; } };

const FORMS = { as2: null, goh: null };
for (const form of ['as2', 'goh']) FORMS[form] = fx.make(path.join(W, 'fx-' + form), { form });
const RUNS = [['as2', 'mowas2'], ['as2', 'as64'], ['goh', 'goh']];
for (const [form, target] of RUNS) {
  const f = FORMS[form];
  const tag = target + ' (' + form + ' form)';
  const src = K.source({ target, game: f.gameDir });
  const doc = K.doc(src, f.map, { mode: 'battle_zones' });
  const g = K.grids(src, f.map, { mode: 'battle_zones' });
  const ents = doc.entities.filter(e => e.src === 'map');
  const sub = Object.assign({}, doc, { entities: ents });
  const cat = E.forDoc(src, sub, {});
  const objs = E.place(sub, cat);
  const L = Ps.profiles(src);
  const s = form === 'goh' ? 2 : 1;
  const at = (gr, i, j) => gr.data[j * gr.w + i];
  const box = Ps.activeBox(doc, 'battle_zones', null, null);
  const R = {};
  for (const kind of ['inf', 'mg', 'at', 'tank']) {
    const prof = Ps.kindProfile(L, kind, src);
    const ob = Ps.obstacles({ gtype: g.gtype, height: g.height }, objs, cat, prof, { box });
    const spd = Ps.speed(src, kind, prof);
    const mv = { move: ob.move, mcost: ob.mcost, gtype: g.gtype };
    const tA = Ps.travel(mv, prof, spd, Ps.spawnsOf(doc, 'battle_zones', 'a', null), { name: 'travel.a.' + kind });
    R[kind] = { ob, tA, prof, spd, mv };
  }
  const oi = R.inf.ob.obst, ot = R.tank.ob.obst;
  if (form === 'as2') {
    eq([at(oi, 73, 38), at(oi, 74, 38), at(oi, 72, 38)], [2, 2, 0], tag + ': obst.inf at (73,38), (74,38), (72,38)');
    eq(at(ot, 70, 38), 3, tag + ': obst.tank at (70,38) margin');
  } else {
    eq([at(oi, 147, 76), at(oi, 148, 76), at(oi, 146, 76), at(oi, 149, 76), at(oi, 145, 76)], [2, 2, 3, 3, 0], tag + ': obst.inf at (147..145, 76)');
    eq(at(ot, 140, 76), 3, tag + ': obst.tank at (140,76) margin');
  }
  eq([at(R.inf.ob.move, 64 * s, 48 * s), at(R.inf.ob.move, 74 * s, 38 * s)], [1, 5], tag + ': move.inf open at the flag, 5 at the wall');
  eq(oi.meta.radiusM, 0.3, tag + ': obst.inf meta radiusM');
  const t = R.inf.tA.t;
  eq([t.w, t.h, t.cell], [128, 96, 10], tag + ': travel frame 10 u, 128 x 96');
  const t0 = at(t, 13, 49), t1 = at(t, 64, 48);
  ok(t0 === 0 && t1 >= 6.0 && t1 <= 6.7, tag + ': travel.a.inf a1 cell 0, (64,48) 6.0..6.7 s (' + t0 + ', ' + t1 + ')');
  eq(R.inf.spd.source, 'fallback', tag + ': fixture has no unit def: fallback speed');
  const tk = at(R.tank.tA.t, 64, 48), ta = at(R.at.tA.t, 64, 48), tm = at(R.mg.tA.t, 64, 48);
  if (form === 'as2') eq([tk, ta], [-1, -1], tag + ': travel.a.tank and travel.a.at at (64,48) unreached (ridge class 5)');
  else ok(tk > 0 && ta > 0, tag + ': goh t34 and cannon.small reach (64,48) (' + tk + ', ' + ta + ')');
  ok(tm > 0, tag + ': travel.a.mg reaches (64,48) (' + tm + ')');
  // golden: integer layers by sha1, travel by reached count and sum (float, 0.1%)
  let sum = 0, cnt = 0;
  for (const v of t.data) if (v >= 0) { sum += v; cnt++; }
  const gk = form;
  const cur = { obstInf: sha1(oi.data), moveInf: sha1(R.inf.ob.move.data), obstTank: sha1(ot.data), moveTank: sha1(R.tank.ob.move.data), travelInf: { cnt, sum: Math.round(sum) } };
  if (!newGold[gk]) newGold[gk] = cur;
  else ok(JSON.stringify(newGold[gk]) === JSON.stringify(cur), tag + ': as64 and mowas2 give the same layers');
  if (GOLD && GOLD[gk] && !writeGold) {
    const G = GOLD[gk];
    eq([cur.obstInf, cur.moveInf, cur.obstTank, cur.moveTank], [G.obstInf, G.moveInf, G.obstTank, G.moveTank], tag + ': golden obst and move bytes');
    ok(cur.travelInf.cnt === G.travelInf.cnt && Math.abs(cur.travelInf.sum - G.travelInf.sum) <= 0.001 * G.travelInf.sum, tag + ': golden travel.a.inf (count, sum within 0.1%)');
  } else if (!writeGold) ok(false, tag + ': no golden in ' + path.basename(GOLD_FILE) + ' (run with MAPVIZ_PASS_GOLDEN=write)');
  // routes on the fixture: inf reaches every flag from both sides
  const tB = Ps.travel(R.inf.mv, R.inf.prof, R.inf.spd, Ps.spawnsOf(doc, 'battle_zones', 'b', null), { name: 'travel.b.inf' });
  const rr = Ps.routes(doc, R.inf.mv, R.inf.tA.t, tB.t, { mode: 'battle_zones', phase: null, unit: 'inf', seed: 1, prof: R.inf.prof, speed: R.inf.spd, target });
  eq([rr.items.length, rr.noRoute.length], [48, 0], tag + ': routes inf: 2 sides x 3 flags x 8, none missing');
  eq(rr.phase, 0, tag + ': routes phase null resolves to the fixture phase 0 (R-f)');
  ok(rr.items.every(x => x.seconds > 0 && x.lengthM > 0 && x.pts.length >= 2), tag + ': routes have time, length and points');
  ok(rr.items.filter(x => x.to.name === 'f1' && x.side === 'a' && x.k === 0).every(x => Math.abs(x.seconds - at(R.inf.tA.t, 64, 48)) < 0.6), tag + ': a1 -> f1 k 0 near the travel time at f1');
}
if (writeGold) { fs.writeFileSync(GOLD_FILE, JSON.stringify(newGold, null, 1) + '\n'); console.log('golden written: ' + GOLD_FILE); }

// ---------------------------------------------------------------- 8. CLIs through mapviz.js
for (const form of ['as2', 'goh']) {
  const f = FORMS[form];
  const common = ['--target', f.target, '--game', f.gameDir, '--map', f.map];
  const o1 = path.join(W, 'c-' + form + '-ob'), o2 = path.join(W, 'c-' + form + '-tr'), o3 = path.join(W, 'c-' + form + '-ro');
  const ob = cli(['pass', 'obstacles'].concat(common, ['--kind', 'inf', '--out', o1, '--json']));
  const sb = jp(ob.out);
  eq(ob.code, 0, form + ' cli obstacles exit 0 (no mode: map records only) ' + ob.err);
  ok(sb && sb.counts.obstacles === 5 && ['obst.inf.mvg', 'move.inf.mvg', 'mcost.inf.mvg', 'reads.json'].every(x => fs.existsSync(path.join(o1, x))), form + ' cli obstacles: products and summary');
  const obm = cli(['pass', 'obstacles'].concat(common, ['--kind', 'inf', '--mode', 'battle_zones', '--out', path.join(W, 'c-' + form + '-obm'), '--json']));
  const sm = jp(obm.out);
  ok(obm.code === 1 && sm && sm.skipped.length > 0 && sm.skipped.every(x => x.code === 'ENTCAT_DEF_MISSING'), form + ' cli obstacles with the mode: flag and map point records without a def are skipped, exit 1');
  const tr = cli(['pass', 'travel'].concat(common, ['--kind', 'inf', '--mode', 'battle_zones', '--in', o1, '--out', o2, '--json']));
  const st = jp(tr.out);
  eq(tr.code, 0, form + ' cli travel exit 0 ' + tr.err);
  ok(st && st.kind === 'travel' && st.unit === 'inf' && st.frame.cell === 10 && st.frame.w === 128 && st.sides.a.spawns[0] === 'a1' && st.speed.source === 'fallback' &&
    st.notes.some(n => n.code === 'PASS_SPEED_FALLBACK'), form + ' cli travel: travel.json fields');
  const tj = jp(fs.readFileSync(path.join(o2, 'travel.json'), 'utf8'));
  ok(tj && tj.v === 1 && tj.sides && tj.counts && tj.speed, form + ' cli travel: travel.json written');
  // late R3: travel.json phase = the resolved phase (battle_zones items are phase 0), the same as --phase 0 and both sides
  ok(tj && tj.phase === 0 && tj.sides.a.phase === 0 && tj.sides.b.phase === 0, form + ' cli travel: travel.json phase is the resolved phase 0, not null (' + (tj && tj.phase) + ')');
  const tp0 = cli(['pass', 'travel'].concat(common, ['--kind', 'inf', '--mode', 'battle_zones', '--phase', '0', '--in', o1, '--out', path.join(W, 'c-' + form + '-p0'), '--json']));
  ok(tp0.code === 0 && fs.readFileSync(path.join(W, 'c-' + form + '-p0', 'travel.json'), 'utf8') === fs.readFileSync(path.join(o2, 'travel.json'), 'utf8'), form + ' cli travel: no --phase and --phase 0 write the same travel.json');
  // all spawns of side b outside the map frame: exit 3 PASS_NO_SPAWN, outside listed
  {
    const srcF = K.source({ target: f.target, game: f.gameDir });
    const dOut = K.doc(srcF, f.map, { mode: 'battle_zones' });
    for (const m of dOut.modes) for (const s of m.spawns || []) if (s.team === 'b') { s.x = -99999; s.y = -99999; }
    const dd = path.join(W, 'c-' + form + '-doc-out');
    fs.mkdirSync(dd, { recursive: true });
    fs.writeFileSync(path.join(dd, 'mapdoc.json'), JSON.stringify(dOut));
    const so = cli(['pass', 'travel'].concat(common, ['--kind', 'inf', '--mode', 'battle_zones', '--in', dd, '--in', o1, '--out', path.join(W, 'c-' + form + '-so'), '--json']));
    const se = jp(so.out.trim().split('\n').pop());
    ok(so.code === 3 && se && se.error && se.error.detail && se.error.detail.code === 'PASS_NO_SPAWN' && se.error.detail.side === 'b' && se.error.detail.outside.length > 0,
      form + ' cli travel: every side b spawn outside the frame, exit 3 PASS_NO_SPAWN with the outside list (' + so.code + ')');
  }
  const ta = gf.read(path.join(o2, 'travel.a.inf.mvg'));
  ok(ta.etype === 'f32' && ta.nodata === -1 && ta.meta.spawns[0] === 'a1' && ta.meta.speedSource === 'fallback' && ta.data[49 * 128 + 13] === 0, form + ' cli travel: layer and meta');
  // in process (no --in) gives the same bytes
  const o2b = path.join(W, 'c-' + form + '-tr2');
  eq(cli(['pass', 'travel'].concat(common, ['--kind', 'inf', '--mode', 'battle_zones', '--out', o2b])).code, 0, form + ' cli travel in process');
  ok(fs.readFileSync(path.join(o2, 'travel.a.inf.mvg')).equals(fs.readFileSync(path.join(o2b, 'travel.a.inf.mvg'))), form + ' cli travel: --in chain = in process (same bytes)');
  const ro = cli(['pass', 'routes'].concat(common, ['--kind', 'inf', '--mode', 'battle_zones', '--in', o1, '--in', o2, '--out', o3, '--json']));
  const sr = jp(ro.out);
  eq(ro.code, 0, form + ' cli routes exit 0 ' + ro.err);
  const rj = jp(fs.readFileSync(path.join(o3, 'routes.json'), 'utf8'));
  ok(sr && sr.routes === 48 && rj && rj.kind === 'vector' && rj.name === 'routes' && rj.items.length === 48, form + ' cli routes: 48 routes in routes.json');
  ok(['route.a.inf.mvg', 'route.b.inf.mvg', 'reads.json'].every(x => fs.existsSync(path.join(o3, x))), form + ' cli routes: density layers');
  // ruling R-f: routes.json, the summary and the density meta carry the resolved phase (0 on the fixture)
  ok(rj && rj.phase === 0 && sr.phase === 0 && gf.read(path.join(o3, 'route.a.inf.mvg')).meta.phase === 0, form + ' cli routes: phase 0 written (' + (rj && rj.phase) + ')');
  // planted: a travel pair in --in made for another phase is not reused (its data all -1 would give no route)
  {
    const o2x = path.join(W, 'c-' + form + '-trx');
    fs.mkdirSync(o2x, { recursive: true });
    for (const s of ['a', 'b']) {
      const g = gf.read(path.join(o2, 'travel.' + s + '.inf.mvg'));
      g.meta = Object.assign({}, g.meta, { phase: 5 });
      g.data.fill(-1);
      gf.write(path.join(o2x, 'travel.' + s + '.inf.mvg'), g);
    }
    const o3x = path.join(W, 'c-' + form + '-rox');
    const rx = cli(['pass', 'routes'].concat(common, ['--kind', 'inf', '--mode', 'battle_zones', '--in', o1, '--in', o2x, '--out', o3x, '--json']));
    ok(rx.code === 0 && fs.readFileSync(path.join(o3x, 'routes.json')).equals(fs.readFileSync(path.join(o3, 'routes.json'))), form + ' planted: travel of phase 5 in --in is not reused, routes made again (' + rx.code + ')');
  }
  if (form === 'as2') {
    // as64 = mowas2 (1:1): the same routes.json bytes
    const o3a = path.join(W, 'c-as64-ro');
    const ra = cli(['pass', 'routes', '--target', 'as64', '--game', f.gameDir, '--map', f.map, '--kind', 'inf', '--mode', 'battle_zones', '--in', o1, '--in', o2, '--out', o3a, '--json']);
    ok(ra.code === 0 && fs.readFileSync(path.join(o3a, 'routes.json')).equals(fs.readFileSync(path.join(o3, 'routes.json'))), 'as64 cli routes: routes.json = mowas2, phase 0');
  }
  const o3b = path.join(W, 'c-' + form + '-ro2');
  cli(['pass', 'routes'].concat(common, ['--kind', 'inf', '--mode', 'battle_zones', '--out', o3b]));
  ok(['routes.json', 'route.a.inf.mvg', 'route.b.inf.mvg'].every(x => fs.existsSync(path.join(o3b, x)) && fs.readFileSync(path.join(o3, x)).equals(fs.readFileSync(path.join(o3b, x)))),
    form + ' cli routes: determinism, --in chain = in process');
  // frontline: side b has no spawn -> exit 3 PASS_NO_SPAWN
  const mode = form === 'goh' ? 'frontlines' : 'frontline';
  const ns = cli(['pass', 'travel'].concat(common, ['--kind', 'inf', '--mode', mode, '--out', path.join(W, 'c-' + form + '-ns'), '--json']));
  const sn = jp(ns.out.trim().split('\n').pop());
  ok(ns.code === 3 && sn && sn.error && sn.error.detail && sn.error.detail.code === 'PASS_NO_SPAWN', form + ' cli travel: no spawn of side b, exit 3 PASS_NO_SPAWN (' + ns.code + ' ' + ns.out.trim() + ')');
  eq(cli(['pass', 'travel'].concat(common, ['--kind', 'inf', '--phase', '1.5', '--out', path.join(W, 'c-x')])).code, 2, form + ' cli travel: --phase 1.5 is a usage error');
  eq(cli(['pass', 'travel'].concat(common, ['--kind', 'inf', '--mode', 'nosuch', '--out', path.join(W, 'c-y')])).code, 3, form + ' cli travel: unknown mode exit 3');
  // planted: a broken objects.json in --in is refused
  const bad = path.join(W, 'c-' + form + '-bad');
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, 'entcat.json'), '{"v":1}');
  fs.writeFileSync(path.join(bad, 'objects.json'), 'not json');
  eq(cli(['pass', 'obstacles'].concat(common, ['--kind', 'inf', '--in', bad, '--out', path.join(W, 'c-z')])).code, 2, form + ' planted: broken entcat products in --in, exit 2');
}

if (fail) { console.log('FAIL mapviz pass travel: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('PASS mapviz pass travel (' + pass + ')');
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }
