// raster cost test: costField on a uniform field (straight and diagonal distances, back codes), walls, no corner
// cutting, nodata and negative factors block, seed forms, the fixture (back sha1 golden), paths (k distinct, ends,
// straight first path, determinism, seed changes, unreachable, from not a seed), refusals, the kcost kernel.
// usage: node tools/mapviz/lib/raster/test/cost.test.js [scratch dir]
//        MAPVIZ_GOLDEN_WRITE=1 writes test/cost.golden.json instead of comparing
// Author: Imperator_Aug (ARSENAL, ia-7231f043)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-raster-cost-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const R = require('../index');
const KK = require('../kcost');
const FX = require('../../../test/fxmake');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz raster-cost: ' + what); } }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ': no error (want ' + code + ')'); }
  catch (e) { ok(e && e.code === code, what + ': code ' + (e && e.code) + ', want ' + code + ' (' + (e && e.message) + ')'); }
}
const sha1 = a => crypto.createHash('sha1').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const WRITE = process.env.MAPVIZ_GOLDEN_WRITE === '1';
const GOLD = path.join(__dirname, 'cost.golden.json');
const gold = WRITE ? {} : (fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD, 'utf8')) : null);
ok(WRITE || gold, 'golden file cost.golden.json is present');
function golden(key, value, what) {
  if (WRITE) { gold[key] = value; return; }
  ok(gold && gold[key] === value, what + ': ' + value + ' (golden ' + (gold && gold[key]) + ')');
}
function cost(w, h, fn, o) {
  const g = R.make(Object.assign({ name: 'cost.inf', w, h, cell: 10, ox: 0, oy: 0, etype: 'f32', sample: 'cell', nodata: null, meta: {} }, o || {}));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.data[j * w + i] = fn(i, j);
  return g;
}
const near = (a, b) => Math.abs(a - b) <= 1e-3;

// ---- 1. a uniform field ----
{
  const g = cost(21, 21, () => 1), cf = R.costField(g, [{ i: 10, j: 10 }], { name: 'cf' });
  const d = (i, j) => cf.dist.data[j * 21 + i], b = (i, j) => cf.back.data[j * 21 + i];
  ok(cf.dist.name === 'cf.dist' && cf.dist.etype === 'f32' && cf.dist.nodata === -1 && cf.back.name === 'cf.back' && cf.back.etype === 'u8', 'layer names and types (stem.dist f32 nodata -1, stem.back u8)');
  ok(d(10, 10) === 0 && b(10, 10) === 0, 'the seed: distance 0, back 0');
  ok(near(d(20, 10), 100) && near(d(10, 0), 100), 'straight: 10 cells = 100 u (' + d(20, 10) + ')');
  ok(near(d(20, 20), 100 * Math.SQRT2), 'diagonal: 10 cells = 141.42 u (' + d(20, 20) + ')');
  ok(near(d(20, 15), (5 * Math.SQRT2 + 5) * 10), 'octile: 10 x 5 cells (' + d(20, 15) + ')');
  ok(b(11, 10) === 5 && b(9, 10) === 1 && b(10, 11) === 7 && b(10, 9) === 3, 'back codes: reached from the west 5, east 1, south 7, north 3');
  ok(b(11, 11) === 6 && b(9, 9) === 2 && b(9, 11) === 8 && b(11, 9) === 4, 'back codes: diagonals 6 sw, 2 ne, 8 se, 4 nw');
  const c2 = cost(21, 21, () => 3), cf2 = R.costField(c2, [{ i: 10, j: 10 }]);
  ok(near(cf2.dist.data[10 * 21 + 20], 300), 'factor 3 triples the distance');
  ok(sha1(R.costField(g, [{ i: 10, j: 10 }]).dist.data) === sha1(cf.dist.data), 'the same bytes on a second run');
}

// ---- 2. walls, corners, blocking values, seeds ----
{
  const wall = cost(11, 11, (i, j) => (i === 5 && j < 10 ? -1 : 1));
  const cf = R.costField(wall, [{ i: 0, j: 0 }]), d = (i, j) => cf.dist.data[j * 11 + i];
  ok(d(5, 3) === -1, 'a blocked cell has distance -1 (nodata)');
  ok(d(10, 0) > 200, 'the wall forces a way round through row 10 (' + d(10, 0).toFixed(1) + ' u)');
  const corner = cost(3, 3, (i, j) => ((i === 1 && j === 0) || (i === 0 && j === 1) ? -1 : 1));
  ok(R.costField(corner, [{ i: 0, j: 0 }]).dist.data[4] === -1, 'no corner cutting: (1,1) unreachable between two blocked side cells');
  const half = cost(3, 3, (i, j) => (i === 1 && j === 0 ? -1 : 1));
  ok(near(R.costField(half, [{ i: 0, j: 0 }]).dist.data[4], 20), 'one blocked side cell also stops the diagonal: (1,1) at 20 u via (0,1)');
  const nd = cost(5, 1, (i) => (i === 2 ? -9999 : 1), { nodata: -9999 });
  ok(R.costField(nd, [{ i: 0, j: 0 }]).dist.data[4] === -1, 'a nodata factor blocks');
  const inf = cost(5, 1, (i) => (i === 2 ? Infinity : 1));
  ok(R.costField(inf, [{ i: 0, j: 0 }]).dist.data[4] === -1, 'an infinite factor blocks');
  const g = cost(5, 5, () => 1);
  ok(R.costField(g, [[25, 25]]).seeds[0] === 12 && R.costField(g, [{ x: 5, y: 45 }]).seeds[0] === 20 && R.costField(g, [{ i: 4, j: 0 }]).seeds[0] === 4, 'seed forms [x, y], {x, y}, {i, j}');
  ok(R.costField(g, [[25, 25], [999, 999]]).seeds.length === 1, 'a seed outside the grid is skipped');
  throwsCode(() => R.costField(g, [[999, 999]]), 'RASTER_ARG', 'no seed left');
  throwsCode(() => R.costField(wall, [{ i: 5, j: 0 }]), 'RASTER_ARG', 'the only seed on a blocked cell');
  throwsCode(() => R.costField(g, 'x'), 'RASTER_ARG', 'seeds not a list');
  throwsCode(() => R.costField(R.make({ name: 'p', w: 2, h: 2, cell: 10, etype: 'rgba8' }), [[0, 0]]), 'RASTER_ETYPE', 'an rgba8 cost grid');
  const two = R.costField(cost(11, 1, () => 1), [{ i: 0, j: 0 }, { i: 10, j: 0 }]);
  ok(near(two.dist.data[5], 50) && near(two.dist.data[8], 20), 'two seeds: the distance to the nearest');
}

// ---- 3. the fixture: cost from the slope class (steep blocked) ----
{
  const F = FX.SPEC.forms.as2;
  const h = R.make({ name: 'height', w: F.w, h: F.h, cell: F.cell, ox: -FX.SPEC.offX, oy: -FX.SPEC.offY, etype: 'i16', sample: 'lattice', meta: { upm: 20 } });
  for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) h.data[j * F.w + i] = FX.cellRecord('as2', i, j).h;
  const s = R.slopeClass(h);
  const c = cost(F.w, F.h, (i, j) => (FX.cellRecord('as2', i, j).h < FX.SPEC.clip.water ? -1 : 1 + s.data[j * F.w + i] * 0.2), { ox: -FX.SPEC.offX, oy: -FX.SPEC.offY });
  const cf = R.costField(c, [[-500, 0]]);
  golden('as2.back', sha1(cf.back.data), 'fixture cost back sha1');
  const P = FX.SPEC.pond, pk = Math.floor((P.y + FX.SPEC.offY) / F.cell) * F.w + Math.floor((P.x + FX.SPEC.offX) / F.cell);
  ok(cf.dist.data[pk] === -1, 'fixture: the pond is blocked');
  const ps = R.paths(cf, [-500, 0], [500, 0], 3, 1);
  ok(ps.length === 3, 'fixture: 3 distinct paths across the ridge (' + ps.length + ')');
  golden('as2.paths', JSON.stringify(ps), 'fixture paths');
}

// ---- 4. paths ----
{
  const g = cost(41, 31, (i, j) => 1 + ((i * 7 + j * 13) % 5) * 0.25);
  const cf = R.costField(g, [{ i: 2, j: 15 }]);
  const from = { i: 2, j: 15 }, to = { i: 38, j: 15 };
  const ps = R.paths(cf, from, to, 4, 7);
  ok(ps.length === 4, 'k 4: four paths (' + ps.length + ')');
  ok(new Set(ps.map(p => JSON.stringify(p))).size === ps.length, 'the paths are distinct');
  ok(ps.every(p => p[0][0] === 25 && p[0][1] === 155 && p[p.length - 1][0] === 385 && p[p.length - 1][1] === 155), 'every path runs from the from cell centre to the to cell centre');
  ok(ps.every(p => p.every(q => (q[0] - 5) % 10 === 0 && (q[1] - 5) % 10 === 0)), 'points on cell centres');
  ok(JSON.stringify(R.paths(cf, from, to, 4, 7)) === JSON.stringify(ps), 'the same paths on a second run (no Math.random)');
  ok(JSON.stringify(R.paths(cf, from, to, 4, 8)) !== JSON.stringify(ps), 'another seed gives other further paths');
  ok(JSON.stringify(R.paths(cf, from, to, 4, 8)[0]) === JSON.stringify(ps[0]), 'path 1 does not depend on the seed');
  const u = cost(21, 21, () => 1), cu = R.costField(u, [{ i: 2, j: 10 }]);
  ok(JSON.stringify(R.paths(cu, { i: 2, j: 10 }, { i: 18, j: 10 }, 1)[0]) === '[[25,105],[185,105]]', 'a uniform field: path 1 is the straight line, its two ends only');
  const other = R.costField(u, [{ i: 0, j: 0 }]);
  ok(JSON.stringify(R.paths(other, { i: 2, j: 10 }, { i: 18, j: 10 }, 1)[0]) === '[[25,105],[185,105]]', 'from not a seed of the field: the same path 1');
  const cut = cost(11, 11, (i) => (i === 5 ? -1 : 1)), cc = R.costField(cut, [{ i: 0, j: 0 }]);
  ok(R.paths(cc, { i: 0, j: 0 }, { i: 10, j: 10 }, 3).length === 0, 'to cut off by a wall: []');
  ok(R.paths(cc, { i: 0, j: 0 }, { i: 5, j: 5 }, 3).length === 0, 'to on a blocked cell: []');
  throwsCode(() => R.paths(cf, from, to, 0), 'RASTER_ARG', 'k 0');
  throwsCode(() => R.paths(cf, from, to, 65), 'RASTER_ARG', 'k 65');
  throwsCode(() => R.paths(cf, from, { i: 99, j: 0 }, 1), 'RASTER_ARG', 'to outside the grid');
  throwsCode(() => R.paths({}, from, to, 1), 'RASTER_ARG', 'paths without a cost field');
  // the noise lattice helpers agree with noiseAt
  let bad = 0;
  for (let t = 0; t < 200; t++) { const i = (t * 37) % 97, j = (t * 53) % 89; if (KK.noiseAt(i, j, t) !== KK.noiseFrom(KK.noiseLattice(97, 89, t), i, j)) bad++; }
  ok(bad === 0, 'noiseFrom(noiseLattice) = noiseAt (' + bad + ' differ)');
}

// ---- 5. the kcost kernel; no Math.random in any raster source ----
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'kcost.js'), 'utf8');
  ok(!/require\(\s*['"]\.\.?\//.test(src), 'kcost.js holds no relative require');
  for (const f of ['index.js', 'cli.js', 'kterrain.js', 'kcontour.js', 'kregion.js', 'kcost.js']) {
    ok(!/Math\.random\(/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')), f + ' does not use Math.random');
  }
  const g = cost(9, 9, () => 1), wrote = {};
  const io = { readGrid: () => g, writeGrid: (f, gr) => { wrote[f] = gr; }, readPng() {}, writePng() {}, progress: { stage() {}, step() {} } };
  ok(KK.run({ v: 1, kernel: 'lib/raster/kcost', inputs: ['c.mvg'], args: { seeds: [[45, 45]], name: 'cost.inf' }, out: 'o' }, io) === 0, 'kernel runs');
  ok(wrote[path.join('o', 'cost.inf.dist.mvg')] && wrote[path.join('o', 'cost.inf.back.mvg')], 'kernel writes <name>.dist.mvg and <name>.back.mvg');
  throwsCode(() => KK.run({ v: 1, inputs: [], args: {}, out: 'o' }, io), 'RASTER_ARG', 'kernel without an input');
}

if (WRITE) { fs.writeFileSync(GOLD, JSON.stringify(gold, null, 1) + '\n'); console.log('wrote ' + GOLD); }
if (fail) { console.log('FAIL mapviz raster-cost: ' + fail + ' of ' + (pass + fail) + ' checks failed'); process.exit(1); }
console.log('PASS mapviz raster-cost (' + pass + ')');
// a temp folder this run made (no folder given) goes when every check passed; a failed run keeps it to look at
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }
