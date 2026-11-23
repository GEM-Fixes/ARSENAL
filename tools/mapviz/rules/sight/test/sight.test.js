// sight tests (MV-SIG, freeze rules.md 3 and 10): node tools/mapviz/rules/sight/test/sight.test.js [scratch]
// The fixture in both forms (as2 form as target mowas2 and again as64, goh form): frame, levels, ground, field, fire
// grids, line of sight, visible height, fire lines, profile, viewshed and rings; synthetic placeSolids rows for each
// tracker branch (soft and uncover, thin stamp, holed, small objects, the goh disc retry, the no-hit entry, vFov);
// seeded defects (no net frame, nodata ground, a left-out object, no solids, a bad vision row); goldens (sha1 of the
// data blocks, README 9.2; SIGHT_GOLDEN_WRITE=1 rewrites test/sight.golden.json); the CLI on the as2 fixture.
// Last line: PASS mapviz sight (N).
// Author: Imperator_Aug (ARSENAL, ia-16b6930d)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawnSync } = require('child_process');

const OWN = !process.argv[2];
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-sight-')));
fs.mkdirSync(scratch, { recursive: true });
if (!process.env.ARSENAL_CACHE) process.env.ARSENAL_CACHE = path.join(scratch, 'cache');

const ROOT = path.resolve(__dirname, '..', '..', '..');   // tools/mapviz
const fx = require(path.join(ROOT, 'test', 'fxmake'));
const K = require(path.join(ROOT, 'lib', 'mapkit'));
const E = require(path.join(ROOT, 'entcat'));
const gf = require(path.join(ROOT, 'lib', 'raster', 'gridfile'));
const S = require('..');
const G = require('../grid'), R = require('../ray'), F = require('../fire'), V = require('../vision'), VW = require('../view');
const CLI = require('../cli');
const GOLDEN = path.join(__dirname, 'sight.golden.json');

let n = 0;
function die(what) {
  console.log('FAIL mapviz sight: ' + what);
  if (OWN) try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) { /* left for the OS */ }
  process.exit(1);
}
function ok(c, what) { n++; if (!c) die(what); }
const near = (a, b, t) => typeof a === 'number' && Math.abs(a - b) <= (t === undefined ? 1e-6 : t);
const throwsCode = (f, code) => { try { f(); return false; } catch (e) { return e && e.code === code; } };
const sha = g => crypto.createHash('sha1').update(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.byteLength)).digest('hex');
const cellAt = (g, i, j) => g.data[j * g.w + i];

// ---------------------------------------------------------------- module shape
ok(S.VERSION === 1 && S.CELL.as2 === 7 && S.CELL.goh === 5, 'VERSION 1, CELL {as2 7, goh 5}');
ok(S.POSE.stand.eyeM === 1.6 && S.POSE.stand.topM === 1.75 && S.POSE.kneel.eyeM === 1.16 && S.POSE.kneel.topM === 1.2 && S.POSE.prone.eyeM === 0.54 && S.POSE.prone.topM === 0.4, 'POSE');
for (const f of ['profile', 'rangeM', 'grid', 'fireGrid', 'canSee', 'visibleHeight', 'fireLine', 'viewshed', 'eyeZ', 'pSeen']) ok(typeof S[f] === 'function', 'export ' + f);
ok(CLI.part === 'sight' && CLI.version === 1 && ['grid', 'view', 'pair', 'profile'].every(c => CLI.commands[c]), 'cli part, version, commands');
ok(S.gameOf('as64') === 'as2' && S.gameOf('mowas2') === 'as2' && S.gameOf('goh') === 'goh', 'gameOf');

// ---------------------------------------------------------------- the fixture
const golden = {};
const ANS = {   // rules.md 10 (as2 form | goh form); field at the wall: see the wall note below
  as2: { w: 183, h: 138, g00: [91, 68, 118], gR: [62, 68, 144], wall: [106, 54], bush: [112, 111], fire: [74, 38] },
  goh: { w: 256, h: 192, g00: [128, 96, 118], gR: [88, 96, 146], wall: [148, 76], bush: [158, 156], fire: [148, 76] },
};
for (const [form, target] of [['as2', 'mowas2'], ['as2', 'as64'], ['goh', 'goh']]) {
  const label = form + '/' + target;
  const m = fx.make(path.join(scratch, 'fx-' + form + '-' + target), { form });
  const src = K.source({ target, game: m.gameDir, modDirs: m.modDirs });
  const doc = K.doc(src, m.map, {});
  const grids = K.grids(src, m.map, {});
  const L = E.loaderFor(src);
  const d = E.docForMode(doc, null);
  const placed = E.placeSolids(d, E.forDoc(src, d, { loader: L }), L, grids);
  const r = S.grid(doc, grids, placed, { target });
  const A = ANS[form];
  ok(r.grid.w === A.w && r.grid.h === A.h && r.grid.cell === S.CELL[form] && r.grid.ox === -640 && r.grid.oy === -480 && r.grid.sample === 'cell', label + ': sight frame ' + r.grid.w + ' x ' + r.grid.h);
  const mt = r.grid.meta;
  ok(mt.hMinU === -260 && mt.hMaxU === 300 && mt.stepU === 2.1875 && mt.cellU === S.CELL[form] && mt.game === form, label + ': levels ' + JSON.stringify(mt));
  ok(r.grid.scale === 2.1875 && r.grid.offset === -260 && r.grid.etype === 'u8' && r.field.etype === 'u8', label + ': header scale = stepU, offset = hMinU');
  ok(cellAt(r.ground, A.g00[0], A.g00[1]) === A.g00[2], label + ': sight.ground at (0, 0) = ' + cellAt(r.ground, A.g00[0], A.g00[1]));
  ok(cellAt(r.ground, A.gR[0], A.gR[1]) === A.gR[2], label + ': sight.ground at (-200, 0) = ' + cellAt(r.ground, A.gR[0], A.gR[1]));
  // the wall (100, -100), yaw 90, 80 x 6 u, top 24 u: as2 thin stamp at the nearest corner x 102 (cell 106, not 105:
  // corner of 105 is x 95, outside the wall's x 97..103); goh box rays at corner x 100 (148)
  ok(cellAt(r.field, A.wall[0], A.wall[1]) === 1, label + ': sight.field at the wall = ' + cellAt(r.field, A.wall[0], A.wall[1]));
  ok(cellAt(r.grid, A.wall[0], A.wall[1]) === G.levelOf(24, { hMin: -260, step: 2.1875 }), label + ': sight.grid at the wall = level of 24 u');
  ok(form === 'as2' ? cellAt(r.field, 105, 54) === 0 && r.counts.thin === 1 : r.counts.thin === 0, label + ': thin stamp count ' + r.counts.thin);
  // the bush: entcat gives it contact (the default able set), and contact makes a hard cell [V]
  ok(cellAt(r.field, A.bush[0], A.bush[1]) === 1, label + ': sight.field at the bush (contact on) = ' + cellAt(r.field, A.bush[0], A.bush[1]));
  ok(r.counts.objects === 8 && r.counts.entered === 7 && r.counts.skipped === 0 && r.counts.hard > 0, label + ': counts ' + JSON.stringify(r.counts));
  ok(r.field.meta.counts.hard === r.counts.hard && r.field.meta.counts.soft === r.counts.soft, label + ': field meta counts');
  // fire grids
  const fg = S.fireGrid(doc, grids, placed, {});
  ok(fg.top.w === 128 * (form === 'goh' ? 2 : 1) && fg.top.etype === 'i16' && fg.top.nodata === -32768 && fg.top.meta.unit === 'u', label + ': fire.top frame');
  ok(cellAt(fg.top, A.fire[0], A.fire[1]) === 24 && cellAt(fg.bottom, A.fire[0], A.fire[1]) === 0, label + ': sight.fire.top at the wall = ' + cellAt(fg.top, A.fire[0], A.fire[1]));
  ok(cellAt(fg.top, 0, 0) === -32768, label + ': fire.top nodata away from objects');
  ok(fg.W === -20, label + ': fire W = the map water level');
  // pairs
  const eye = (x, y, mz) => ({ x, y, z: G.groundAt(grids.height, x, y) + mz * 20 });
  const a = eye(-300, 0, 1.6), b = eye(-100, 0, 1.6);
  ok(S.canSee(r, a, b) === false, label + ': (-300, 0) -> (-100, 0) stand not seen');
  const vh = S.visibleHeight(r, a, { x: -100, y: 0 });
  ok(near((vh - G.groundAt(grids.height, -100, 0)) / 20, 4.4, 0.3), label + ': visible height at (-100, 0) = ' + ((vh - G.groundAt(grids.height, -100, 0)) / 20));
  const f1 = S.fireLine(fg, a, b);
  ok(!f1.clear && f1.block === 'terrain' && f1.at[0] >= -245 && f1.at[0] <= -155, label + ': fire blocked by terrain at ' + JSON.stringify(f1.at));
  const c = eye(-200, 0, 1.6);
  ok(S.canSee(r, c, b) === true && S.fireLine(fg, c, b).clear === true, label + ': from the crest seen, fire clear');
  // the wall fire rows: heights over the flat ground at x 0 (z constant; see contract: the pond rim lowers (200, -100))
  const lo = S.fireLine(fg, { x: 0, y: -100, z: 10 }, { x: 200, y: -100, z: 10 });
  ok(!lo.clear && lo.block === 'object' && lo.at[0] >= 90 && lo.at[0] <= 110, label + ': 0.5 m fire blocked by the wall ' + JSON.stringify(lo));
  ok(S.fireLine(fg, { x: 0, y: -100, z: 32 }, { x: 200, y: -100, z: 32 }).clear === true && S.canSee(r, { x: 0, y: -100, z: 32 }, { x: 200, y: -100, z: 32 }) === true, label + ': 1.6 m fire clear and seen over the wall');
  ok(S.fireLine(fg, a, b, { rangeU: 100 }).block === null && S.fireLine(fg, a, b, { rangeU: 100 }).clear === false, label + ': fire past rangeU');
  // the same wall rows through pair, zM over each point's own ground (the CLI and page form). The ground is 0 u at x 0 and
  // x 150 but -28 u at (200, -100) (pond rim), so the x 200 rows differ from the level rows above; x 150 holds in both forms
  {
    const pp = S.profile(src), wallX = form === 'goh' ? 95 : 90;
    const P = (x1, zM) => CLI.pair(r, fg, grids, pp, [0, -100, zM], [x1, -100, zM], {});
    ok(G.groundAt(grids.height, 0, -100) === 0 && G.groundAt(grids.height, 150, -100) === 0 && G.groundAt(grids.height, 200, -100) === -28, label + ': wall row ground 0 / 0 / -28 u');
    const p05 = P(200, 0.5), p16 = P(200, 1.6), q05 = P(150, 0.5), q16 = P(150, 1.6);
    ok(!p05.see && p05.fire.block === 'terrain' && p05.fire.at[0] === 72.5, label + ': pair (0,-100) 0.5 m -> (200,-100) 0.5 m own ground: fire blocked by terrain at x 72.5 ' + JSON.stringify(p05));
    ok(!p16.see && p16.fire.block === 'object' && p16.fire.at[0] === wallX, label + ': pair 1.6 m -> (200,-100) 1.6 m own ground: not seen, fire blocked by the wall at x ' + wallX + ' ' + JSON.stringify(p16));
    ok(!q05.see && q05.fire.block === 'object' && q05.fire.at[0] === wallX, label + ': pair (0,-100) 0.5 m -> (150,-100) 0.5 m: fire blocked by the wall ' + JSON.stringify(q05));
    ok(q16.see && q16.fire.clear && q16.fire.block === null, label + ': pair (0,-100) 1.6 m -> (150,-100) 1.6 m: clear; seen ' + JSON.stringify(q16));
    const lv = CLI.pair(r, fg, grids, pp, [0, -100, 1.6], [200, -100, 1.6 + 28 / 20], {});
    ok(lv.see && lv.fire.clear, label + ': pair 1.6 m with the far end kept level (zM 3.0 over -28 u): clear; seen');
  }
  // water: a line under W over the pond's type 5 centre (300, -200), ground left out
  const ww = S.fireLine(Object.assign({}, fg, { height: null }), { x: 300, y: -230, z: -100 }, { x: 300, y: -170, z: -100 });
  ok(ww.block === 'water', label + ': water stops a line under W over type 5 ' + JSON.stringify(ww));
  const w4 = S.fireLine(Object.assign({}, fg, { height: null }), { x: 300, y: -295, z: -100 }, { x: 300, y: -262, z: -100 });
  ok(w4.block === 'water', label + ': water stops a line under W over the type 4 ring ' + JSON.stringify(w4));
  ok(S.fireLine(Object.assign({}, fg, { height: null }), { x: 300, y: -295, z: 0 }, { x: 300, y: -262, z: 0 }).clear === true, label + ': over W the type 4 ring is clear');
  // profile (the fixture has no vision.set: vanilla table)
  const prof = S.profile(src);
  ok(prof.v === 1 && prof.game === form && prof.source === 'vanilla' && prof.notes.some(x => x.code === 'SIGHT_VISION_VANILLA'), label + ': profile vanilla');
  ok(prof.radiusFactor === (form === 'goh' ? 1 : 0.75), label + ': radiusFactor');
  for (const k of ['inf', 'mg', 'at', 'tank', 'officer']) ok(['radiusM', 'uncoverM', 'hFovDeg', 'vFovDeg', 'preset', 'at'].every(f => f in prof.viewers[k]), label + ': viewer ' + k + ' fields');
  ok(['inf', 'mg', 'at', 'tank'].every(t => Object.keys(V.STATES).every(s => typeof prof.factors[t][s] === 'number')), label + ': factors table');
  if (form === 'as2') {
    ok(S.rangeM(prof, 'inf', 'inf') === 52.5 && S.rangeM(prof, 'at', 'inf') === 50.63 && S.rangeM(prof, 'tank', 'tank') === 135, label + ': ranges 52.5 / 50.63 / 135');
    ok(prof.viewers.inf.uncoverM === 7 && prof.viewers.officer.uncoverM === 50 && prof.viewers.binocular.reachM === 180 && prof.viewers.binocular.discM === 18.75 && prof.viewers.flag.radiusM === 20, label + ': uncover, binocular, flag');
    ok(S.rangeM(prof, 'inf', 'inf', { pose: 'prone' }) === 31.5 && S.rangeM(prof, 'inf', 'inf', { pose: 'stand', cover: true, stealth: true }) === 42, label + ': prone 31.5 m, stand in cover 42 m');
  } else {
    ok(S.rangeM(prof, 'inf', 'inf') === 100 && S.rangeM(prof, 'inf', 'inf', { pose: 'prone' }) === 50 && S.rangeM(prof, 'inf', 'inf', { stealth: true }) === 75, label + ': ranges 100 / prone 50 / stealth 75');
    ok(prof.viewers.binocular.reachM === 200 && prof.viewers.binocular.discM === 30 && prof.viewers.inf.uncoverM === 20, label + ': goh binocular, uncover');
  }
  // viewshed from (-300, 0) standing
  const v = S.viewshed(r, fg, { x: -301, y: 0 }, { pose: 'stand', viewer: 'inf', vprof: prof, exactM: 60, placed });
  ok(v.view.name === 'sight.view' && v.vis.name === 'sight.vis' && v.fire.name === 'sight.fire' && v.vis.etype === 'u16' && v.fire.w === fg.top.w, label + ': view grids');
  const vm = v.view.meta;
  ok(vm.at[0] === -301 && vm.pose === 'stand' && vm.viewer === 'inf' && vm.rangeM === S.rangeM(prof, 'inf', 'inf') && vm.exactM === 60 && 'uncoverM' in vm && 'z' in vm, label + ': view meta ' + JSON.stringify(vm));
  const ci = R.cellOf(r, -100, 0), cr = R.cellOf(r, -200, 0);
  ok(cellAt(v.view, ci.i, ci.j) === 2 && cellAt(v.view, cr.i, cr.j) === 1, label + ': view hidden behind the ridge, seen on it');
  ok(near(cellAt(v.vis, ci.i, ci.j) / 100, 4.4, 0.35), label + ': vis behind the ridge ' + cellAt(v.vis, ci.i, ci.j) + ' cm');
  const fi = Math.floor((-100 + 640) / fg.top.cell), fj = Math.floor(480 / fg.top.cell);
  ok(cellAt(v.fire, fi, fj) === 2, label + ': fire behind the ridge = terrain');
  ok(v.view.data.some(x => x === 3), label + ': some cells partly seen');
  ok(form === 'goh' ? vm.approx === true : vm.approx === false, label + ': approx past exactM');
  const kinds = v.rings.map(x => x.kind + (x.what ? ':' + x.what : ''));
  ok(['eye', 'sightRing:sight', 'sightRing:aim', 'sightRing:binocular', 'sightRing:uncover', 'sightRing:exact'].every(k => kinds.includes(k)), label + ': rings ' + kinds.join(' '));
  const seen = v.rings.filter(x => x.kind === 'seen');
  ok(seen.length > 0 && seen.length <= 500 && seen.every(x => x.p >= 0 && x.p <= 1 && typeof x.uid === 'number' && typeof x.def === 'string') && seen.every((x, k) => !k || seen[k - 1].uid <= x.uid), label + ': seen items sorted by uid');
  // the sweep matches exact lines on this map
  const vx = S.viewshed(r, fg, { x: -301, y: 0 }, { pose: 'stand', viewer: 'inf', vprof: prof, exactM: 10000 });
  let diff = 0;
  for (let k = 0; k < v.view.data.length; k++) if (v.view.data[k] !== vx.view.data[k]) diff++;
  ok(diff <= v.view.data.length * 0.01, label + ': sweep vs exact differ on ' + diff + ' cells');
  // P(seen) with the target's own cells suspended (IsVisible: tracker->Suspend) [V]:
  // the fixture bush (uid 4103) seen from (0, 0) standing; goh tests its volume centre, which only its own cells hide
  {
    const bush = placed.find(x => x.uid === 4103);
    const e0 = eye(0, 0, 1.6), o0 = Object.assign({ game: form }, { uncoverU: prof.viewers.inf.uncoverM * 20 });
    const raw = S.pSeen(r, e0, bush.solids, o0), sus = S.pSeen(r, e0, bush.solids, Object.assign({ row: bush, placed }, o0));
    ok(form === 'goh' ? raw === 0 && sus === 1 : sus > raw, label + ': bush P(seen) suspended ' + sus + ' > as built ' + raw);
    const before = sha(r.grid) + sha(r.field);
    S.pSeen(r, e0, bush.solids, Object.assign({ row: bush, placed }, o0));
    ok(sha(r.grid) + sha(r.field) === before, label + ': suspend puts the cells back');
    const it = VW.seenItems(r, e0, placed, o0).find(x => x.uid === 4103);
    ok(it && it.p === sus, label + ': seen item of the bush uses the suspended P(seen) ' + (it && it.p));
  }
  // pair: the visible height is over the grid's own ground (GetVisibleHeight), so never under it; a far pair is out of
  // aim range (fire clear false, block null)
  {
    const pp = CLI.pair(r, fg, grids, prof, [-200, 0], [-100, 0], {});
    ok(pp.see === true && pp.visibleHeightM >= 0, label + ': pair visible height ' + pp.visibleHeightM);
    const far = CLI.pair(r, fg, grids, prof, [-600, 0], [600, 0], { pose: 'prone' });
    ok(far.see === false && far.fire.clear === false && far.fire.block === null, label + ': far pair out of range ' + JSON.stringify(far));
  }
  // eyes
  ok(near(S.eyeZ(grids, 0, 0, 'kneel'), 1.16 * 20) && near(S.eyeZ(grids, 0, 0, { entry: { heights: { visor: null } }, part: 'visor' }), 52) && near(S.eyeZ(grids, 0, 0, { entry: { heights: { gunBone: 40 } }, part: 'gunBone' }), 40), label + ': eyeZ');
  golden[label] = { grid: sha(r.grid), ground: sha(r.ground), field: sha(r.field), top: sha(fg.top), bottom: sha(fg.bottom), view: sha(v.view), vis: sha(v.vis), fire: sha(v.fire) };
}
ok(JSON.stringify(golden['as2/mowas2']) === JSON.stringify(golden['as2/as64']), 'as64 = mowas2 byte for byte');
{
  const want = { as2: golden['as2/mowas2'], goh: golden['goh/goh'] };
  if (process.env.SIGHT_GOLDEN_WRITE === '1') fs.writeFileSync(GOLDEN, JSON.stringify(want, null, 1).replace(/\r?\n/g, '\n') + '\n');
  let have = null;
  try { have = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')); } catch (e) { have = null; }
  ok(!!have, 'golden file test/sight.golden.json');
  for (const f of ['as2', 'goh']) for (const k of Object.keys(want[f])) ok(have[f][k] === want[f][k], 'golden ' + f + ' ' + k);
}

// ---------------------------------------------------------------- synthetic rows (placeSolids shape) on a flat map
function flat(cell, w, h, z, nd) {
  const data = new Int16Array(w * h).fill(z);
  if (nd) for (const [i, j] of nd) data[j * w + i] = -32768;
  return { name: 'height', w, h, cell, ox: -320, oy: -320, etype: 'i16', sample: 'lattice', scale: 1, offset: 0, nodata: nd ? -32768 : null, meta: {}, data };
}
const DOC = { key: 'syn', net: { w: 64, h: 64, offX: 320, offY: 320, cell: 10 }, water: { level: -20 }, modes: [] };
const able = o => Object.assign({ bullet: false, visible: true, obstacle: false, contact: false, contact_ground: false, nolook: false, window: false, hole: false, holed: false, touch: false }, o);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const sol = (name, ab, hull, z0, z1, box) => ({ name, able: able(ab), zMin: z0, zMax: z1, hull, box: box || null });
for (const target of ['mowas2', 'as64', 'goh']) {
  const game = S.gameOf(target), C = S.CELL[game];
  const grids = { height: flat(10, 64, 64, 0) };
  const hedge = { uid: 1, def: 'hedge', category: 'bush', solids: [sol('crown', {}, rect(-10, -60, 10, 60), 0, 100)] };
  const wall = { uid: 2, def: 'wall', category: 'wall', solids: [sol('body', { obstacle: true, bullet: true }, rect(-10, -60, 10, 60), 0, 100)] };
  const eyeA = { x: -50, y: 0, z: 32 }, tgt = { x: 100, y: 0, z: 32 };
  const rs = S.grid(DOC, grids, [hedge], { target });
  const hc = R.cellOf(rs, 0, 0);
  ok(cellAt(rs.field, hc.i, hc.j) === 2 && rs.counts.soft > 0 && rs.counts.hard === 0, target + ': visible-only hedge is soft');
  ok(S.canSee(rs, eyeA, tgt, { uncoverU: 0 }) === false && S.canSee(rs, eyeA, tgt, { uncoverU: 400 }) === true, target + ': soft cells inside uncover read the ground');
  const rw = S.grid(DOC, grids, [wall], { target });
  ok(cellAt(rw.field, hc.i, hc.j) === 1 && S.canSee(rw, eyeA, tgt, { uncoverU: 400 }) === false, target + ': a hard wall hides inside uncover too');
  ok(S.canSee(rs, eyeA, tgt, { rangeU: 100 }) === false && S.visibleHeight(rs, eyeA, tgt, { rangeU: 100 }) === null, target + ': past rangeU');
  ok(S.visibleHeight(rw, eyeA, tgt) === Infinity || S.visibleHeight(rw, eyeA, tgt) > 100, target + ': over a 5 m wall the low visible height is high');
  // holed: the top is cut to the hole's bottom
  const holed = { uid: 3, def: 'h', solids: [sol('b', { holed: true, contact: true }, rect(-20, -20, 20, 20), 0, 100), sol('hole', { visible: false, hole: true }, rect(-20, -20, 20, 20), 40, 60)] };
  const rh = S.grid(DOC, grids, [holed], { target });
  ok(cellAt(rh.grid, hc.i, hc.j) === G.levelOf(40, rh.levels), target + ': holed top cut to the hole bottom');
  // small object (both sides under half a cell) stays out
  const tiny = { uid: 4, def: 't', solids: [sol('b', { contact: true }, rect(0.5, 0.5, 1.5, 2), 0, 100)] };
  ok(S.grid(DOC, grids, [tiny], { target }).counts.entered === 0, target + ': object under half a cell stays out');
  // a pole between corners: goh disc retry; as2 the no-hit entry at the box centre
  const pole = { uid: 5, def: 'p', solids: [sol('b', { contact: true }, rect(3, -2, 4, 2), 0, 100)] };
  const rp = S.grid(DOC, grids, [pole], { target });
  const ent = G.trackObject(pole, rp.frame, game).entries;
  if (game === 'goh') ok(ent.length >= 1 && ent.every(e => e.i === 65 && e.j === 64), target + ': goh disc retry hits corner (5, 0) ' + JSON.stringify(ent));
  else ok(ent.length === 1 && ent[0].i === 46 && ent[0].j === 46 && ent[0].bits === 1, target + ': as2 no-hit entry at the centre corner ' + JSON.stringify(ent));
  // thin box: as2 stamps the centre line, goh casts rays
  const thin = { uid: 6, def: 'w', solids: [sol('b', { obstacle: true }, rect(-40, -3, 40, 3), 0, 24, { center: [0, 0], half: [40, 3], yaw: 0 })] };
  const rt = S.grid(DOC, grids, [thin], { target });
  ok(game === 'as2' ? rt.counts.thin === 1 && rt.notes.some(x => x.code === 'SIGHT_THIN_STAMP') : rt.counts.thin === 0, target + ': thin stamp ' + rt.counts.thin);
  ok(rt.counts.hard >= Math.floor(80 / C), target + ': thin wall cells ' + rt.counts.hard);
  // vFov: a 20 deg view from 15 m up cannot see the ground 7.5 m away
  const hi = { x: -50, y: 0, z: 300 }, low = { x: 100, y: 0, z: 0 };
  ok(S.canSee(rs, hi, low, { vFovDeg: 20 }) === false && S.canSee(rs, hi, low, { vFovDeg: 200 }) === true, target + ': vFov low bound');
  // pSeen
  // the wall in the open, its own cells suspended: as2 share of hull vertices; goh the volume centre (seen)
  const p1 = S.pSeen(rw, { x: -200, y: 0, z: 32 }, wall.solids, { game, row: wall, placed: [wall] });
  ok(game === 'goh' ? p1 === 1 : p1 > 0 && p1 <= 1, target + ': pSeen of the wall from the front ' + p1);
  ok(game === 'goh' ? S.pSeen(rw, { x: -200, y: 0, z: 32 }, wall.solids, { game }) === 0 : true, target + ': goh wall unsuspended reads 0 (its centre under its own cells)');
  // known answer: a 2 m box behind a 0.75 m wall: as2 the 4 bottom vertices hidden, the 4 top ones seen: 0.5;
  // goh the centre (1 m) over the wall: 1
  {
    const low = { uid: 7, def: 'low', solids: [sol('b', { contact: true }, rect(-30, -40, -20, 40), 0, 15)] };
    const box = { uid: 8, def: 'box', solids: [sol('b', { contact: true }, rect(0, -10, 10, 10), 0, 40)] };
    const rb = S.grid(DOC, grids, [low, box], { target });
    const pk = S.pSeen(rb, { x: -200, y: 0, z: 32 }, box.solids, { game, row: box, placed: [low, box] });
    ok(pk === (game === 'goh' ? 1 : 0.5), target + ': pSeen of the box behind the low wall ' + pk);
    const it = VW.seenItems(rb, { x: -200, y: 0, z: 32 }, [low, box], { game }).find(x => x.uid === 8);
    ok(it && it.p === pk, target + ': seen item of the box ' + (it && it.p));
    const tall = { uid: 9, def: 'tall', solids: [sol('b', { contact: true }, rect(-30, -40, -20, 40), 0, 200)] };
    const rt2 = S.grid(DOC, grids, [tall, box], { target });
    ok(S.pSeen(rt2, { x: -200, y: 0, z: 32 }, box.solids, { game, row: box, placed: [tall, box] }) === 0, target + ': pSeen of the box behind a 10 m wall is 0');
    // an overlapping row keeps its cells while the target is out: the low wall stretched over the box
    const over = { uid: 10, def: 'over', solids: [sol('b', { contact: true }, rect(-30, -40, 20, 40), 0, 200)] };
    const ro2 = S.grid(DOC, grids, [over, box], { target });
    ok(S.pSeen(ro2, { x: -200, y: 0, z: 32 }, box.solids, { game, row: box, placed: [over, box] }) === 0, target + ': another row on the same cells still hides');
  }
  // the sweep reaches every cell in range: a flat map, range past exactM, no in-range cell left at code 0
  {
    const fprof = S.profile({ target, has: () => false, read: () => null });
    const fgF = S.fireGrid(DOC, grids, [], {});
    const vf = S.viewshed(rs, fgF, { x: 0, y: 0 }, { pose: 'stand', viewer: 'inf', vprof: fprof, exactM: 5 });
    const RU = S.rangeM(fprof, 'inf', 'inf') * 20, ec = R.cellOf(rs, 0, 0);
    let holes = 0, inR = 0;
    for (let j = 0; j < vf.view.h; j++) for (let i = 0; i < vf.view.w; i++) {
      if (!(RU * RU > ((i - ec.i) ** 2 + (j - ec.j) ** 2) * C * C)) continue;
      inR++;
      if (vf.view.data[j * vf.view.w + i] === 0 || vf.vis.data[j * vf.view.w + i] === 65535) holes++;
    }
    ok(vf.view.meta.approx === true && inR > 1000 && holes === 0, target + ': sweep past exactM leaves ' + holes + ' of ' + inR + ' cells unvisited');
  }
  // off ground (README R24): lattice columns 0-2 nodata; those sight corners are view 0, vis 65535, counted
  {
    const ndc = []; for (let j = 0; j < 64; j++) for (let i = 0; i < 3; i++) ndc.push([i, j]);
    const ho = { height: flat(10, 64, 64, 0, ndc) };
    const ro3 = S.grid(DOC, ho, [], { target });
    const fprof = S.profile({ target, has: () => false, read: () => null });
    const fg3 = S.fireGrid(DOC, ho, [], {});
    let off = 0;
    for (let j = 0; j < ro3.grid.h; j++) for (let i = 0; i < ro3.grid.w; i++) if (G.groundAt(ho.height, ro3.grid.ox + i * C, ro3.grid.oy + j * C) === null) off++;
    ok(off > 0 && ro3.grid.meta.offGround === off && ro3.counts.offGround === off, target + ': grid offGround ' + ro3.grid.meta.offGround + ' = ' + off);
    for (const fgx of [fg3, null]) {
      const v3 = S.viewshed(ro3, fgx, { x: -250, y: 0 }, { pose: 'stand', viewer: 'inf', vprof: fprof, exactM: 60 });
      let bad = 0, n3 = 0;
      for (let j = 0; j < ro3.grid.h; j++) for (let i = 0; i < ro3.grid.w; i++) {
        if (G.groundAt(ho.height, ro3.grid.ox + i * C, ro3.grid.oy + j * C) !== null) continue;
        n3++;
        const c = j * ro3.grid.w + i;
        if (v3.view.data[c] !== 0 || v3.vis.data[c] !== 65535) bad++;
      }
      ok(n3 === off && bad === 0 && v3.view.meta.offGround > 0, target + ': off-ground cells left out of the view (' + (fgx ? 'height grid' : 'sight.ground level 0') + '), bad ' + bad);
    }
  }
  ok(game === 'goh' ? S.pSeen(rs, { x: -200, y: 0, z: 32 }, [sol('c', {}, rect(-30, -5, -20, 5), 0, 10)], { game }) === 1 : true, target + ': goh pSeen of a small low volume is 1');
  ok(S.pSeen(rw, { x: -200, y: 0, z: 32 }, [sol('x', { visible: false, nolook: true }, rect(0, 0, 9, 9), 0, 10)], { game }) === 0, target + ': no sight volume: pSeen 0');
  // seeded defects
  ok(throwsCode(() => S.grid({ key: 'x' }, grids, [], { target }), 'SIGHT_DOC'), target + ': a doc with no net frame is refused');
  ok(throwsCode(() => S.grid(DOC, {}, [], { target }), 'SIGHT_GRID'), target + ': no height grid is refused');
  const nd = S.grid(DOC, { height: flat(10, 64, 64, 0, [[10, 10], [11, 10], [10, 11], [11, 11]]) }, [], { target });
  ok(nd.notes.some(x => x.code === 'SIGHT_HEIGHT_NODATA' && x.count > 0), target + ': nodata ground noted');
  const left = [hedge];
  Object.defineProperty(left, 'notes', { value: [{ code: 'ENTCAT_MDL_MISSING', uid: 9, def: 'gone', msg: '' }], enumerable: false });
  const rl = S.grid(DOC, grids, left, { target });
  ok(rl.counts.skipped === 1 && rl.notes.some(x => x.code === 'SIGHT_NO_SOLIDS' && x.uid === 9), target + ': a left-out object is counted and listed');
  ok(S.grid(DOC, grids, null, { target }).notes.some(x => x.code === 'SIGHT_NO_SOLIDS'), target + ': no solids noted');
}

// ---------------------------------------------------------------- vision rules
{
  const H = V.VANILLA.goh.presets.human.rules.map(function node(a) { return { p: a[0], f: a[1], kids: (a[2] || []).map(node) }; });
  ok(V.evalRules(H, ['human', 'stand', 'stealth']) === 75 && V.evalRules(H, ['human', 'crawl', 'still', 'stealth']) === 30 && V.evalRules(H, ['human', 'crawl', 'still']) === 50 && V.evalRules(H, ['vehicle_04', 'firing']) === 170, 'evalRules: first match, deepest factor');
  ok(V.evalRules([{ p: 'human', f: 2, kids: [] }], ['human'], [{ p: 'human', f: 1.5 }]) === 3, 'evalRules: mods multiply');
  // a stack vision.set with a bad row: the vanilla row and SIGHT_VISION_ROW_BAD
  const text = '{visions\r\n{"human" {uncover 9} {h_fov 70} {v_fov 200} {radius 60} {rules {human 1 {crawl 0.5}} {vehicle_03 2}}}\r\n{"cannon_main" {uncover 5}}\r\n}\r\n';
  const files = { 'resource/set/vision/vision.set': Buffer.from(text) };
  const fake = { target: 'mowas2', has: k => k in files, read: k => files[k] };
  const p = S.profile(fake);
  ok(p.source === 'stack' && p.viewers.inf.radiusM === 60 && p.viewers.inf.uncoverM === 9 && S.rangeM(p, 'inf', 'inf', { pose: 'prone' }) === 30 && S.rangeM(p, 'inf', 'tank') === 120, 'stack vision.set read');
  ok(p.notes.some(x => x.code === 'SIGHT_VISION_ROW_BAD' && /cannon_main/.test(x.msg)) && p.viewers.at.radiusM === 50.625, 'bad row: vanilla row used and noted');
  ok(throwsCode(() => S.rangeM(p, 'sniper', 'inf'), 'SIGHT_VIEWER'), 'unknown viewer refused');
  const g = S.profile({ target: 'goh', has: () => false, read: () => null });
  ok(g.game === 'goh' && g.viewers.mg.preset === 'human' && g.viewers.officer.preset === 'human_elite', 'goh viewer presets');
}

// ---------------------------------------------------------------- CLI on the as2 fixture (mowas2)
{
  const MVJS = path.join(ROOT, 'mapviz.js');
  const m = fx.make(path.join(scratch, 'fx-cli'), { form: 'as2' });
  const base = ['--target', 'mowas2', '--game', m.gameDir, '--map', m.map];
  const run = args => { const r = spawnSync(process.execPath, [MVJS, 'sight'].concat(args), { encoding: 'utf8', env: process.env, timeout: 300000 }); return { code: r.status, out: r.stdout || '', err: r.stderr || '' }; };
  const o1 = path.join(scratch, 'cli-grid');
  let r = run(['grid'].concat(base, ['--out', o1, '--json']));
  ok(r.code === 0, 'cli grid exit ' + r.code + ' ' + r.err);
  for (const f of ['sight.grid.mvg', 'sight.ground.mvg', 'sight.field.mvg', 'sight.fire.top.mvg', 'sight.fire.bottom.mvg', 'sight.json', 'reads.json']) ok(fs.existsSync(path.join(o1, f)), 'cli grid wrote ' + f);
  const sj = JSON.parse(fs.readFileSync(path.join(o1, 'sight.json'), 'utf8'));
  ok(sj.v === 1 && sj.kind === 'sight' && sj.target === 'mowas2' && sj.game === 'as2' && sj.cellU === 7 && sj.hMinU === -260 && sj.profile.v === 1 && 'skipped' in sj.counts && Array.isArray(sj.notes), 'sight.json shape');
  const gg = gf.read(path.join(o1, 'sight.grid.mvg'));
  ok(gg.w === 183 && gg.h === 138 && gg.meta.stepU === 2.1875 && sha(gg) === golden['as2/mowas2'].grid, 'cli sight.grid = in-process grid');
  r = run(['view'].concat(base, ['--at', 'x,1', '--out', path.join(scratch, 'cli-bad')]));
  ok(r.code === 2, 'cli view bad --at exits 2 (got ' + r.code + ')');
  r = run(['view'].concat(base, ['--at', '-300,0', '--pose', 'sit', '--out', path.join(scratch, 'cli-bad')]));
  ok(r.code === 2, 'cli view bad --pose exits 2');
  const o2 = path.join(scratch, 'cli-view');
  r = run(['view'].concat(base, ['--at', '-298,3', '--in', o1, '--out', o2, '--json']));
  ok(r.code === 0, 'cli view exit ' + r.code + ' ' + r.err);
  const vv = gf.read(path.join(o2, 'sight.view.mvg'));
  ok(vv.meta.at[0] === -304 && vv.meta.at[1] === 3 && vv.meta.pose === 'stand', 'cli view --at snapped to the cell corner ' + JSON.stringify(vv.meta.at));
  const rings = JSON.parse(fs.readFileSync(path.join(o2, 'sight.rings.json'), 'utf8'));
  ok(rings.v === 1 && rings.kind === 'vector' && rings.name === 'sight.rings' && rings.items[0].kind === 'eye' && rings.items.some(x => x.kind === 'seen'), 'sight.rings.json');
  ok(fs.existsSync(path.join(o2, 'sight.vis.mvg')) && fs.existsSync(path.join(o2, 'sight.fire.mvg')) && fs.existsSync(path.join(o2, 'reads.json')), 'cli view files');
  r = run(['pair'].concat(base, ['--from', '-300,0', '--to', '-100,0', '--in', o1, '--json']));
  const pj = (() => { try { return JSON.parse(r.out); } catch (e) { return null; } })();
  ok(r.code === 0 && pj && pj.see === false && near(pj.visibleHeightM, 4.4, 0.3) && pj.fire.block === 'terrain' && pj.distM === 10, 'cli pair ' + r.out.trim());
  r = run(['pair'].concat(base, ['--from', '-200,0,1.6', '--to', '-100,0', '--json']));
  ok(r.code === 0 && /"see":true/.test(r.out), 'cli pair from the crest');
  r = run(['pair'].concat(base, ['--from', '99999,0', '--to', '-100,0', '--in', o1, '--json']));
  ok(r.code === 2, 'cli pair --from off the map exits 2 (got ' + r.code + ')');
  r = run(['pair'].concat(base, ['--from', '-100,0', '--to', '-100,-99999', '--in', o1, '--json']));
  ok(r.code === 2, 'cli pair --to off the map exits 2 (got ' + r.code + ')');
  r = run(['profile', '--target', 'mowas2', '--game', m.gameDir, '--json']);
  ok(r.code === 0 && JSON.parse(r.out).source === 'vanilla', 'cli profile');
  r = run(['grid', '--target', 'mowas2', '--game', m.gameDir, '--map', m.map]);
  ok(r.code === 2, 'cli grid without --out exits 2');
}

if (OWN) fs.rmSync(scratch, { recursive: true, force: true });
console.log('PASS mapviz sight (' + n + ')');
