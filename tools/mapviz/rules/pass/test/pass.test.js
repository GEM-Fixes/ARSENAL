// pass test (MV-WAT): pather profiles and the terrain passability masks (README 1.8, 4.4). Planes at each profile's block
// angle and 1 degree under it, ground factors (road, a blocking type, an unlisted type, type 0), the accepted flag that is
// never a cost, the GoH cost formula, PatherID from unit defs, the CLIs through mapviz.js (exit 0 and 3), determinism,
// seeded defects; with real installs the profiles of mowas2, as64 and goh and a mask on one river map per game.
// usage: node tools/mapviz/rules/pass/test/pass.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-8a8fa7ff)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-pass-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz pass: ' + what); } }
function eq(a, b, what) { ok(JSON.stringify(a) === JSON.stringify(b), what + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ': did not throw'); } catch (e) { ok(e && (e.code === code || (e.detail && e.detail.code === code)), what + ': threw ' + (e && e.code) + ' ' + (e && e.message)); }
}

const ROOT = path.resolve(__dirname, '../../..');
const MV = path.join(ROOT, 'mapviz.js');
const Ps = require('..');
const K = require(path.join(ROOT, 'lib/mapkit'));
const R = require(path.join(ROOT, 'lib/raster'));
const gf = require(path.join(ROOT, 'lib/raster/gridfile'));
const fx = require(path.join(ROOT, 'test/fxmake'));
const f32 = Math.fround;

const mem = (target, files) => ({ target, has: k => Object.prototype.hasOwnProperty.call(files, k), read: k => Buffer.from(files[k], 'latin1') });
const frame = (w, h, cell) => ({ w, h, cell, ox: 0, oy: 0, scale: 1, offset: 0, nodata: null });
function typeGrid(w, h, fn) {
  const d = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d[j * w + i] = fn(i, j);
  return Object.assign({ name: 'gtype', etype: 'u8', sample: 'cell', meta: {}, data: d }, frame(w, h, 10));
}
function slopeGrid(w, h, fn) {
  const d = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d[j * w + i] = fn(i, j);
  return Object.assign({ name: 'slopecls', etype: 'u8', sample: 'cell', meta: { classDeg: 6 }, data: d }, frame(w, h, 10));
}
// a plane rising along x at deg degrees, f32 lattice heights (u)
function plane(deg, w, h) {
  const d = new Float32Array(w * h), t = Math.tan(deg * Math.PI / 180);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d[j * w + i] = i * 10 * t;
  return Object.assign({ name: 'height', etype: 'f32', sample: 'lattice', meta: { unit: 'u', upm: 20 }, data: d }, frame(w, h, 10));
}

// ---------------------------------------------------------------- 1. vanilla fallback profiles
const AS2V = Ps.profiles(mem('mowas2', {}));
const GOHV = Ps.profiles(mem('goh', {}));
ok(AS2V.notes.some(n => n.code === 'PASS_VANILLA') && AS2V.every(p => p.source === 'vanilla'), 'fallback: no pather.set gives the vanilla profiles, said so');
const byId = (L, id) => L.find(p => p.patherId === id);
eq([byId(AS2V, 'human').blockDeg, byId(AS2V, 'human').costFromDeg], [42, null], 'as2 human block 42, no slope cost');
eq([byId(AS2V, 'tank').blockDeg, byId(AS2V, 'tank').costFromDeg], [30, 12], 'as2 tank block 30, cost from 12');
eq([byId(AS2V, 'cannon.small').blockDeg, byId(AS2V, 'cannon.carried').blockDeg], [24, 42], 'as2 cannon.small 24, cannon.carried 42');
eq([byId(GOHV, 'human').blockDeg, byId(GOHV, 't34').blockDeg, byId(GOHV, 't34').costFromDeg], [54, null, 18], 'goh human block 54, t34 no block (900), cost from 18');
eq(GOHV[0].patherId, 'nothing', 'goh: first profile "nothing"');

// ---------------------------------------------------------------- 2. planes at the block angle and 1 degree under
for (const [game, L] of [['as2', AS2V], ['goh', GOHV]]) {
  for (const p of L) {
    if (p.blockDeg === null) continue;
    const at = (deg) => {
      const hgt = plane(deg, 12, 12);
      const g = { gtype: typeGrid(12, 12, () => 1), height: hgt };
      const m = Ps.mask(g, p);
      return m.pass.data[6 * 12 + 6];
    };
    // class c covers [6c, 6c + 6): the block angle itself may round to the class under it in float32; 0.05 deg over is sure
    eq(at(p.blockDeg + 0.05), Ps.CODES.BLOCKED_SLOPE, game + ' ' + p.patherId + ': plane at the block angle ' + p.blockDeg + ' blocks');
    ok(at(p.blockDeg - 1) !== Ps.CODES.BLOCKED_SLOPE, game + ' ' + p.patherId + ': plane 1 degree under the block angle passes');
    // the class itself, exact
    const cls = p.blockDeg / 6;
    const m = Ps.mask({ gtype: typeGrid(2, 1, () => 1), slopecls: slopeGrid(2, 1, i => cls - 1 + i) }, p);
    eq([m.pass.data[0] !== 3, m.pass.data[1]], [true, 3], game + ' ' + p.patherId + ': class ' + (cls - 1) + ' passes, class ' + cls + ' blocks');
  }
}
{
  const t = byId(AS2V, 'tank');
  const m = Ps.mask({ gtype: typeGrid(5, 1, () => 7), slopecls: slopeGrid(5, 1, i => i) }, t);
  eq(Array.from(m.cost.data), [1, 1, 2, 3, 4], 'tank on road: cost = ground 0 + 1 + height cost per class');
  eq(Array.from(m.pass.data), [1, 1, 2, 2, 2], 'tank on road: open while cost 1, slow from the cost-from angle');
}

// ---------------------------------------------------------------- 3. ground factors
{
  const t = byId(AS2V, 'tank'), h = byId(AS2V, 'human');
  // types: 0 undef, 1 ground, 4 water, 7 road, 8 no_pass_human (not listed for tank)
  const types = [0, 1, 4, 7, 8, 3];
  const g = { gtype: typeGrid(types.length, 1, i => types[i]), slopecls: slopeGrid(types.length, 1, () => 0) };
  const m = Ps.mask(g, t);
  eq(Array.from(m.pass.data), [4, 2, 4, 1, 1, 2], 'tank: type 0 blocked, ground slow, water blocked, road open, unlisted open, shallow slow');
  eq(m.cost.data[1], f32(f32(1 / f32(0.75)) - 1 + 1), 'tank ground cost 1/0.75 - 1 + 1');
  eq(m.cost.data[3], 1, 'tank road: K 1.25 clamps to 1, cost 0 + 1');
  eq(m.cost.data[4], 1, 'tank unlisted type: cost 0 + 1');
  eq(m.cost.data[0], -1, 'blocked cost is nodata -1');
  // the accepted flag is never a cost: human water 0.4 0 costs 1/0.4 - 1 + 1 and passes
  const mh = Ps.mask(g, h);
  eq([mh.pass.data[2], mh.cost.data[2]], [2, f32(f32(1 / f32(0.4)) - 1 + 1)], 'human water (accepted 0): passes at its cost');
  ok(h.ground[4].accepted === false && h.ground[4].k === 0.4, 'human water row: accepted false kept apart');
  // K < 1e-5 blocks; K clamped to [0, 1]
  const P = Ps.parsePather(Buffer.from('{Pathers {Profile "p" {Terrain "ground" 0.000009 "road" 5 "swamp" -2 "water" 0.00001}}}', 'latin1'), { target: 'mowas2' });
  const p = P.profiles[0];
  eq([p.ground[1].cost, p.ground[7].cost, p.ground[6].cost], [-1, 0, -1], 'K < 1e-5 blocks, K > 1 clamps to cost 0, K < 0 blocks');
  ok(p.ground[4].cost > 0, 'K 1e-5 passes at a high cost');
  // the ground test comes before the slope test: a steep cell typed water is blocked by ground (code 4), not by slope
  const steep = Ps.mask({ gtype: typeGrid(12, 12, () => 4), height: plane(40, 12, 12) }, t);
  eq([steep.pass.data[6 * 12 + 6], steep.counts.blockedSlope], [Ps.CODES.BLOCKED_GROUND, 0], 'tank: a 40 deg plane typed water is blocked by ground');
  const steepG = Ps.mask({ gtype: typeGrid(12, 12, () => 1), height: plane(40, 12, 12) }, t);
  eq(steepG.pass.data[6 * 12 + 6], Ps.CODES.BLOCKED_SLOPE, 'tank: the same plane typed ground is blocked by slope');
  // o.tick(done, total) is called during the mask: rising, done <= total, last (total, total); slope classes made here
  // take two phases (raster.slopeClass gets the hook), given slope classes one
  let ticks = 0;
  const seen = [];
  const tg = { gtype: typeGrid(12, 12, () => 1), height: plane(10, 12, 12) };
  const plain = Ps.mask(tg, t);
  const withTick = Ps.mask(tg, t, { tick: (d, tt) => { ticks++; seen.push([d, tt]); } });
  ok(ticks >= 1, 'tick: called during the mask (' + ticks + ')');
  const last = seen[seen.length - 1];
  ok(last && last[0] === last[1] && last[1] === 2000 && seen.every(([d, tt], k) => d >= 0 && d <= tt && tt === 2000 && (k === 0 || d >= seen[k - 1][0])),
    'tick: rises to (2000, 2000) with the slope phase (' + JSON.stringify(seen) + ')');
  ok(Buffer.compare(Buffer.from(plain.cost.data.buffer), Buffer.from(withTick.cost.data.buffer)) === 0, 'tick: the hook does not change the cost bytes');
  const seen1 = [];
  Ps.mask({ gtype: tg.gtype, slopecls: require('../../../lib/raster').slopeClass(tg.height) }, t, { tick: (d, tt) => seen1.push([d, tt]) });
  ok(seen1.length >= 1 && seen1[seen1.length - 1][0] === 1000 && seen1.every(x => x[1] === 1000), 'tick: given slope classes, one phase (1000)');
  let threw = null;
  try { Ps.mask(tg, t, { tick: () => { throw Object.assign(new Error('stop'), { code: 'MV_CANCELLED' }); } }); } catch (e) { threw = e.code; }
  eq(threw, 'MV_CANCELLED', 'tick: a throwing hook ends the mask');
  // GoH: 1/sqrt(K) - 1
  eq(Ps.groundCost(0.25, true), 1, 'goh cost 1/sqrt(0.25) - 1 = 1');
  eq(Ps.groundCost(0.25, false), 3, 'as2 cost 1/0.25 - 1 = 3');
}

// ---------------------------------------------------------------- 4. a stack pather.set and PatherID of unit defs
const PSET = '{Pathers\r\n\t{Profile "walker"\r\n\t\t{Human}\r\n\t\t{Radius 0.4}\r\n\t\t{Terrain\r\n\t\t\t"ground" 1\r\n\t\t\t"water" 0.5 0\r\n\t\t\t"deep_water" 0.5\r\n\t\t}\r\n\t\t{Height 0 0 0 0 0 0 1 -1 -1 -1 -1 -1 -1 -1 -1}\r\n\t}\r\n' +
  '\t{Profile "crawler"\r\n\t\t{Priority 3}\r\n\t\t{Terrain "ground" 0.5 "road" 1}\r\n\t\t{Height 0 0 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1}\r\n\t}\r\n}\r\n';
{
  const files = {
    'resource/set/pather.set': PSET,
    'resource/entity/humanskin/human/human.def': '{human\r\n\t(include "/properties/walk.ext")\r\n}\r\n',
    'resource/properties/walk.ext': '{actor\r\n\t{PatherID "crawler"}\r\n\t{PatherID "walker"}\r\n}\r\n',
    'resource/entity/-vehicle/cannon/maxim/maxim.def': '{game_entity\r\n\t{props "vehicle"}\r\n}\r\n',
    'resource/entity/-vehicle/cannon/pak40/pak40.def': '{game_entity\r\n\t{PatherID "hover"}\r\n}\r\n',
  };
  const src = mem('mowas2', files);
  const L = Ps.profiles(src);
  eq(L.map(p => p.patherId), ['walker', 'crawler'], 'stack: profiles from pather.set in file order');
  eq([L[0].blockDeg, L[0].costFromDeg, L[0].radiusM, L[0].flags.human], [42, 36, 0.4, true], 'stack: walker angles, radius, flags');
  eq([L[0].ground[5].accepted, L[0].ground[4].accepted], [true, false], 'stack: accepted defaults to true, a 0 reads false');
  const inf = Ps.kindProfile(L, 'inf', src);
  eq([inf.patherId, inf.unit.source, inf.unit.at], ['walker', 'def', 'resource/properties/walk.ext:3'], 'kind inf: the last PatherID after includes');
  const mg = Ps.kindProfile(L, 'mg', src);
  eq([mg.patherId, mg.index], ['walker', 0], 'kind mg: a def without PatherID takes profile 0');
  throwsCode(() => Ps.kindProfile(L, 'at', src), 'PASS_NO_PROFILE', 'kind at: a PatherID pather.set lacks is not found');
  // no tank def in the stack: the vanilla PatherID "tank" is named, and this pather.set does not hold it
  throwsCode(() => Ps.kindProfile(L, 'tank', src), 'PASS_NO_PROFILE', 'kind tank: no def, the vanilla PatherID is not in the stack pather.set');
  throwsCode(() => Ps.kindProfile(L, 'nope', src), 'MV_USAGE', 'unknown kind refused');
}

// ---------------------------------------------------------------- 5. seeded defects
{
  const bad = '{Pathers\r\n\t{Profile "a"\r\n\t\t{Terrain "ground" "road" 1 "marsh" 0.5}\r\n\t\t{Height 0 0 0}\r\n\t}\r\n}\r\n';
  const r = Ps.parsePather(Buffer.from(bad, 'latin1'), { target: 'mowas2' });
  ok(r.notes.some(n => n.code === 'PASS_ROW_BAD'), 'defect: a Terrain row without a number is noted');
  ok(r.notes.some(n => n.code === 'PASS_TERRAIN_UNKNOWN'), 'defect: an unknown ground name is noted');
  ok(r.notes.some(n => n.code === 'PASS_HEIGHT_BAD'), 'defect: a short Height row is noted');
  const p = r.profiles[0];
  eq([p.ground[7].cost, p.ground[0].cost, p.ground[1].cost], [0, f32(1 / f32(0.5)) - 1, 0], 'defect: the good rows are read, the unknown name overwrites type 0, the broken row is skipped');
  // grids of the wrong sample kind
  const g = { gtype: typeGrid(3, 3, () => 1), slopecls: slopeGrid(3, 3, () => 0) };
  throwsCode(() => Ps.mask(Object.assign({}, g, { gtype: Object.assign({}, g.gtype, { sample: 'lattice' }) }), AS2V[0]), 'PASS_GRID', 'defect: gtype with lattice samples');
  throwsCode(() => Ps.mask({ gtype: g.gtype, height: Object.assign({}, plane(0, 3, 3), { sample: 'cell' }) }, AS2V[0]), 'PASS_GRID', 'defect: height with cell samples');
  throwsCode(() => Ps.mask(Object.assign({}, g, { slopecls: slopeGrid(2, 2, () => 0) }), AS2V[0]), 'PASS_GRID', 'defect: slopecls off the gtype frame');
  throwsCode(() => Ps.profiles(mem('mowas2', { 'resource/set/pather.set': '{Pathers}' })), 'PASS_NO_PROFILE', 'defect: a pather.set without profiles');
  // a Height row with a non-number item: read by position, later classes do not shift
  const typo = Ps.parsePather(Buffer.from('{Pathers {Profile "t" {Height 0 0 0 0 0 x 0 -1 -1 -1 -1 -1 -1 -1 -1}}}', 'latin1'), { target: 'mowas2' });
  const tp = typo.profiles[0];
  eq([tp.blockDeg, tp.heights[5], tp.heights[6], tp.heights[7]], [42, 0, 0, -1], 'defect: a Height typo keeps the block angle 42');
  ok(typo.notes.some(n => n.code === 'PASS_HEIGHT_BAD' && /position 5/.test(n.text)), 'defect: the Height typo is noted with its position');
  // a pather.set that includes another file: the include is resolved through the source (mapkit sdl)
  const inc = Ps.profiles(mem('mowas2', { 'resource/set/pather.set': '{Pathers\r\n\t(include "/set/pp.inc")\r\n}\r\n',
    'resource/set/pp.inc': '{Profile "inc" {Terrain "ground" 0.5} {Height 0 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1}}\r\n' }));
  eq(inc.map(p => [p.patherId, p.blockDeg]), [['inc', 12]], 'pather.set include read through the source');
}

// ---------------------------------------------------------------- 5b. height nodata (R16): past the ground mesh
{
  // 30 x 20 i16 lattice heights 3i + 2j + 100 (19.8 deg: slope class 3, slow for the AS2 tank); off ground (-32768): the
  // outer ring and the block i 8..12, j 6..10. Read as a height, -32768 next to 100 is a cliff: blocked by slope around it.
  const ND = -32768, w = 30, h = 20, t = byId(AS2V, 'tank');
  const off = (i, j) => i === 0 || j === 0 || i === w - 1 || j === h - 1 || (i >= 8 && i <= 12 && j >= 6 && j <= 10);
  const hgt = (withOff, nd) => {
    const d = new Int16Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d[j * w + i] = withOff && off(i, j) ? ND : 3 * i + 2 * j + 100;
    return Object.assign({ name: 'height', etype: 'i16', sample: 'lattice', meta: { unit: 'u', upm: 20 }, data: d }, frame(w, h, 10), { nodata: nd });
  };
  const gt = typeGrid(w, h, () => 1);
  const H = hgt(true, ND), H0 = hgt(false, null), HBad = hgt(true, null);
  ok(!('offGround' in Ps.mask({ gtype: gt, height: H0 }, t).pass.meta), 'nodata: no offGround meta when there is none');
  // the reference: class 3 on every cell (the plane's class; the plain grid's own map edge reads class 2 on its two
  // outer columns, from the clamped differences there, so it is not the reference)
  const m = Ps.mask({ gtype: gt, height: H }, t), m0 = Ps.mask({ gtype: gt, slopecls: slopeGrid(w, h, () => 3) }, t);
  eq(Ps.mask({ gtype: gt, height: H0 }, t).pass.data[5 * w + 5], m0.pass.data[5 * w + 5], 'nodata: the reference matches the plain plane inside');
  const ms = Ps.mask({ gtype: gt, slopecls: R.slopeClass(H), height: H }, t);
  const mBad = Ps.mask({ gtype: gt, height: HBad }, t);
  let nOff = 0, offBad = 0, realBad = 0, sBad = 0, cliff = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (off(i, j)) { nOff++; if (m.pass.data[k] !== Ps.CODES.NODATA || m.cost.data[k] !== -1) offBad++; }
    else {
      // a real cell, also one next to nodata, is classed from its real neighbours: the plane's class 3
      if (m.pass.data[k] !== m0.pass.data[k] || m.cost.data[k] !== m0.cost.data[k]) realBad++;
      if (mBad.pass.data[k] === Ps.CODES.BLOCKED_SLOPE) cliff++;
    }
    if (ms.pass.data[k] !== m.pass.data[k] || ms.cost.data[k] !== m.cost.data[k]) sBad++;
  }
  eq(m0.pass.data[5 * w + 5], Ps.CODES.SLOW, 'nodata: the plane is slow for the tank (class 3)');
  eq(offBad, 0, 'nodata: pass 0 and cost -1 on every off-ground cell');
  eq(realBad, 0, 'nodata: the real cells keep the plane pass and cost, next to nodata too');
  eq([m.counts.offGround, m.counts.nodata, m.pass.meta.offGround], [nOff, nOff, nOff], 'nodata: counts.offGround, counts.nodata, meta.offGround');
  eq(sBad, 0, 'nodata: slopecls given with the height marks the same cells');
  const msOnly = Ps.mask({ gtype: gt, slopecls: R.slopeClass(H) }, t);
  eq(msOnly.counts.offGround, 0, 'nodata: slopecls alone (no height) marks nothing off ground');
  // the planted defect: the same heights with no nodata in the header block by slope round the block and along the rim
  ok(cliff > 20 && mBad.counts.offGround === 0, 'nodata planted: -32768 read as a height blocks by slope (' + cliff + ' cells)');
  // a height off the gtype frame is refused
  throwsCode(() => Ps.mask({ gtype: gt, slopecls: R.slopeClass(H), height: Object.assign({}, H, { w: w - 1, data: new Int16Array((w - 1) * h) }) }, t),
    'PASS_GRID', 'nodata: a height off the gtype frame refused');
}

// ---------------------------------------------------------------- 6. fixture: slopecls answers, CLIs, determinism
function cli(args) {
  const r = spawnSync(process.execPath, [MV].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { MAPVIZ_NO_GAME: '1' }) });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
for (const form of ['as2', 'goh']) {
  const f = fx.make(path.join(W, 'fx-' + form), { form });
  const src = K.source({ target: f.target, game: f.gameDir });
  const g = K.grids(src, f.map, {});
  const sc = R.slopeClass(g.height);
  const s = form === 'goh' ? 2 : 1;
  eq([sc.data[(48 * s) * sc.w + 39 * s], sc.data[(48 * s) * sc.w + 64 * s]], [5, 0], form + ': slopecls (39,48) = 5, (64,48) = 0 (README 10.4)');
  const L = Ps.profiles(src);
  const inf = Ps.kindProfile(L, 'inf', src), tank = Ps.kindProfile(L, 'tank', src);
  eq([inf.unit.source, tank.patherId], ['vanilla', form === 'goh' ? 't34' : 'tank'], form + ': fixture has no defs, the vanilla PatherID is named');
  const mt = Ps.mask({ gtype: g.gtype, slopecls: sc }, tank);
  const k39 = (48 * s) * sc.w + 39 * s;
  eq(mt.pass.data[k39], form === 'goh' ? 2 : 3, form + ': tank at slope class 5 (30 deg): AS2 blocked, GoH slow');
  eq(mt.pass.data[(28 * s) * sc.w + 94 * s], 4, form + ': tank on deep water blocked by ground');
  eq(mt.pass.data[(68 * s) * sc.w + 10 * s], 1, form + ': tank on the road open');
  const common = ['--target', f.target, '--game', f.gameDir];
  const o1 = path.join(W, 'cli-' + form + '-1'), o2 = path.join(W, 'cli-' + form + '-2');
  const r1 = cli(['pass', 'terrain'].concat(common, ['--map', f.map, '--kind', 'tank', '--out', o1, '--json']));
  eq(r1.code, 0, form + ' cli pass terrain exit 0 (' + r1.err.trim() + ')');
  let sum = null;
  try { sum = JSON.parse(r1.out); } catch (e) { sum = null; }
  ok(sum && sum.patherId === tank.patherId && sum.counts.blockedGround > 0, form + ' cli pass terrain: JSON summary');
  const files = ['pass.tank.mvg', 'cost.tank.mvg', 'reads.json'];
  ok(files.every(x => fs.existsSync(path.join(o1, x))), form + ' cli: products written');
  const pg = gf.read(path.join(o1, 'pass.tank.mvg')), cg = gf.read(path.join(o1, 'cost.tank.mvg'));
  ok(pg.etype === 'u8' && pg.sample === 'cell' && cg.etype === 'f32' && cg.nodata === -1, form + ' cli: layer kinds README 4.4');
  ok(Buffer.from(pg.data.buffer, pg.data.byteOffset, pg.data.byteLength).equals(Buffer.from(mt.pass.data.buffer)), form + ' cli: same mask as the module');
  eq(cli(['pass', 'terrain'].concat(common, ['--map', f.map, '--kind', 'tank', '--out', o2])).code, 0, form + ' cli second run');
  ok(files.every(x => fs.readFileSync(path.join(o1, x)).equals(fs.readFileSync(path.join(o2, x)))), form + ' determinism: same bytes');
  // --in: mapkit grids + raster terrain
  const gin = path.join(W, 'in-' + form);
  eq(cli(['mapkit', 'grids'].concat(common, ['--map', f.map, '--out', gin])).code, 0, form + ' mapkit grids for --in');
  const o3 = path.join(W, 'cli-' + form + '-3');
  eq(cli(['pass', 'terrain'].concat(common, ['--map', f.map, '--kind', 'tank', '--in', gin, '--out', o3])).code, 0, form + ' cli pass terrain with --in');
  ok(fs.readFileSync(path.join(o1, 'pass.tank.mvg')).equals(fs.readFileSync(path.join(o3, 'pass.tank.mvg'))), form + ' cli: --in gives the same mask');
  // --in with slopecls.mvg and a height.mvg holding nodata (R16): the height's nodata cells are pass 0 / cost -1
  {
    const gnd = path.join(W, 'in-nd-' + form);
    fs.cpSync(gin, gnd, { recursive: true });
    const hg = gf.read(path.join(gnd, 'height.mvg'));
    const ndv = hg.etype === 'u16' ? 65535 : -32768;
    const hw = hg.w, cut = [];
    for (let j = 10; j < 14; j++) for (let i = 20; i < 26; i++) { hg.data[j * hw + i] = ndv; cut.push(j * hw + i); }
    hg.nodata = ndv;
    gf.write(path.join(gnd, 'height.mvg'), hg);
    gf.write(path.join(gnd, 'slopecls.mvg'), R.slopeClass(hg));
    const o4 = path.join(W, 'cli-' + form + '-4');
    eq(cli(['pass', 'terrain'].concat(common, ['--map', f.map, '--kind', 'tank', '--in', gnd, '--out', o4])).code, 0, form + ' cli pass terrain with a nodata height in --in');
    const p4 = gf.read(path.join(o4, 'pass.tank.mvg')), c4 = gf.read(path.join(o4, 'cost.tank.mvg'));
    ok(cut.every(k => p4.data[k] === 0 && c4.data[k] === -1) && p4.meta.offGround === cut.length,
      form + ' cli: the nodata height cells are pass 0, cost -1, meta.offGround ' + p4.meta.offGround);
    // planted: without the nodata field the same file is read as heights, and nothing is marked
    hg.nodata = null;
    gf.write(path.join(gnd, 'height.mvg'), hg);
    const o5 = path.join(W, 'cli-' + form + '-5');
    cli(['pass', 'terrain'].concat(common, ['--map', f.map, '--kind', 'tank', '--in', gnd, '--out', o5]));
    const p5 = gf.read(path.join(o5, 'pass.tank.mvg'));
    ok(!cut.every(k => p5.data[k] === 0), form + ' cli planted: no nodata field, the cut is not marked');
  }
  const rp = cli(['pass', 'profiles'].concat(common));
  eq(rp.code, 0, form + ' cli pass profiles exit 0');
  ok(/kind tank: (tank|t34)/.test(rp.out), form + ' cli pass profiles: kinds listed');
  const rj = cli(['pass', 'profiles'].concat(common, ['--json']));
  let pj = null;
  try { pj = JSON.parse(rj.out); } catch (e) { pj = null; }
  ok(pj && pj.profiles.length > 0 && pj.kinds.inf.patherId === 'human', form + ' cli pass profiles --json');
  const r404 = cli(['pass', 'terrain'].concat(common, ['--map', 'multi/no_such_map', '--kind', 'inf', '--out', path.join(W, 'cli-x'), '--json']));
  eq(r404.code, 3, form + ' cli pass terrain: unknown map exit 3');
  eq(cli(['pass', 'terrain'].concat(common, ['--map', f.map, '--kind', 'boat', '--out', path.join(W, 'cli-y')])).code, 2, form + ' cli: bad kind exit 2');
}

// ---------------------------------------------------------------- 7. real installs
function installs() {
  const gd = require(path.join(ROOT, '../lib/gamedir'));
  const out = {};
  let as2 = null;
  try { const r = gd.resolve({}); as2 = r && r.dir && fs.existsSync(path.join(r.dir, 'resource', 'map.pak')) ? r.dir : null; } catch (e) { as2 = null; }
  let goh = null;
  try { const g = gd.goh(); goh = g && fs.existsSync(path.join(g, 'resource', 'map', 'multi.pak')) ? g : null; } catch (e) { goh = null; }
  if (as2) { out.mowas2 = as2; out.as64 = as2; }
  if (goh) out.goh = goh;
  return out;
}
const REAL = {
  mowas2: { map: 'multi/3v3_river_bank', kinds: { inf: ['human', 42], mg: ['cannon.carried', 42], at: ['cannon.small', 24], tank: ['tank', 30] } },
  as64: { map: 'multi/3v3_river_bank', kinds: { inf: ['human', 42], mg: ['cannon.carried', 42], at: ['cannon.small', 24], tank: ['tank', 30] } },
  goh: { map: 'multi/1v1_forssa_dam', kinds: { inf: ['human', 54], mg: ['cannon.carried', null], at: ['cannon.small', null], tank: ['t34', null] } },
};
if (process.env.MAPVIZ_NO_GAME === '1') console.log('skip real installs: MAPVIZ_NO_GAME=1');
else {
  const I = installs();
  for (const target of ['mowas2', 'as64', 'goh']) {
    if (!I[target]) { console.log('skip ' + target + ': no ' + target + ' install'); continue; }
    const t0 = Date.now();
    const src = K.source({ target, game: I[target] });
    const L = Ps.profiles(src);
    ok(L.length > 10 && L.every(p => p.source === 'stack'), target + ': profiles from the stack pather.set (' + L.length + ')');
    for (const kind of Object.keys(REAL[target].kinds)) {
      const p = Ps.kindProfile(L, kind, src);
      eq([p.patherId, p.blockDeg, p.unit.source], REAL[target].kinds[kind].concat(['def']), target + ' kind ' + kind);
    }
    const g = K.grids(src, REAL[target].map, {});
    const m = Ps.mask(g, Ps.kindProfile(L, 'tank', src));
    // height nodata (R16): pass 0 / cost -1 there; every other water cell blocks the tank by ground
    const hnd = g.height.nodata;
    let water = 0, bad = 0, off = 0, offBad = 0;
    for (let k = 0; k < g.gtype.data.length; k++) {
      const t = g.gtype.data[k];
      if (hnd !== null && hnd !== undefined && g.height.data[k] === hnd) { off++; if (m.pass.data[k] !== 0 || m.cost.data[k] !== -1) offBad++; continue; }
      if (t === 4 || t === 5) { water++; if (m.pass.data[k] !== 4) bad++; }
    }
    eq(bad, 0, target + ': the tank is blocked by ground on every water and deep water cell (' + water + ')');
    eq([offBad, m.counts.offGround || 0], [0, off], target + ': pass 0, cost -1 on the ' + off + ' off-ground cells, all counted');
    console.log('real ' + target + ' ' + REAL[target].map + ' tank: ' + JSON.stringify(m.counts) + ', ' + (Date.now() - t0) + ' ms');
  }
}

if (fail) { console.log('FAIL mapviz pass: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('PASS mapviz pass (' + pass + ')');
// a temp folder this run made (no folder given) goes when every check passed; a failed run keeps it to look at
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }
