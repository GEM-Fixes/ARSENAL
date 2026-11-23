// raster region test: regions on two basins (ids in scan order, area, centroid, anchor), 4 and 8 connectivity, nodata,
// distance (exact Euclidean, the edge option, no zero cell), the fixture pond (sha1 golden), refusals, the kregion kernel.
// usage: node tools/mapviz/lib/raster/test/region.test.js [scratch dir]
//        MAPVIZ_GOLDEN_WRITE=1 writes test/region.golden.json instead of comparing
// Author: Imperator_Aug (ARSENAL, ia-3d68907a)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-raster-region-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const R = require('../index');
const KR = require('../kregion');
const FX = require('../../../test/fxmake');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz raster-region: ' + what); } }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ': no error (want ' + code + ')'); }
  catch (e) { ok(e && e.code === code, what + ': code ' + (e && e.code) + ', want ' + code + ' (' + (e && e.message) + ')'); }
}
const sha1 = a => crypto.createHash('sha1').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const WRITE = process.env.MAPVIZ_GOLDEN_WRITE === '1';
const GOLD = path.join(__dirname, 'region.golden.json');
const gold = WRITE ? {} : (fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD, 'utf8')) : null);
ok(WRITE || gold, 'golden file region.golden.json is present');
function golden(key, value, what) {
  if (WRITE) { gold[key] = value; return; }
  ok(gold && gold[key] === value, what + ': ' + value + ' (golden ' + (gold && gold[key]) + ')');
}
function mask(w, h, fn, o) {
  const g = R.make(Object.assign({ name: 'mask', w, h, cell: 10, ox: -100, oy: -50, etype: 'u8', sample: 'cell', meta: { upm: 20 } }, o || {}));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.data[j * w + i] = fn(i, j) ? 1 : 0;
  return g;
}

// ---- 1. two basins: a height grid with two bowls, the mask = below 0 ----
{
  const w = 60, h = 40;
  const height = (i, j) => Math.min(Math.hypot(i - 15, j - 20), Math.hypot(i - 45, j - 20)) - 8.5;
  const m = mask(w, h, (i, j) => height(i, j) < 0);
  const r = R.regions(m);
  ok(r.list.length === 2 && r.grid.meta.count === 2, 'two basins give two regions (' + r.list.length + ')');
  ok(r.grid.name === 'regions' && r.grid.etype === 'u32' && r.grid.sample === 'cell' && r.grid.w === w, 'regions layer header (u32, cell sample)');
  const id = (i, j) => r.grid.data[j * w + i];
  ok(id(15, 20) === 1 && id(45, 20) === 2 && id(0, 0) === 0 && id(30, 20) === 0, 'ids in scan order: west basin 1, east basin 2, outside 0');
  let cnt = 0; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (Math.hypot(i - 15, j - 20) < 8.5) cnt++;
  const a = r.list[0];
  ok(a.id === 1 && a.area === cnt * 100 / 400, 'area in m2: ' + cnt + ' cells x (10 u / 20 u per m)^2 = ' + cnt / 4 + ', got ' + a.area);
  ok(Math.abs(a.cx - (-100 + 15.5 * 10)) < 1e-9 && Math.abs(a.cy - (-50 + 20.5 * 10)) < 1e-9, 'centroid at the basin centre cell centre (' + a.cx + ', ' + a.cy + ')');
  ok(a.ax === -100 + 15.5 * 10 && a.ay === -50 + 20.5 * 10, 'anchor = the cell farthest from the edge (' + a.ax + ', ' + a.ay + ')');
  ok(r.list[1].ax === -100 + 45.5 * 10, 'east anchor x ' + r.list[1].ax);
  ok(sha1(R.regions(m).grid.data) === sha1(r.grid.data), 'the same bytes on a second run');
}

// ---- 2. connectivity, nodata, a U shape (one region, ids settle by union) ----
{
  const diag = mask(4, 4, (i, j) => (i === 1 && j === 1) || (i === 2 && j === 2));
  ok(R.regions(diag).list.length === 2, 'diagonal touch: 2 regions with conn 4');
  ok(R.regions(diag, { conn: 8 }).list.length === 1, 'diagonal touch: 1 region with conn 8');
  throwsCode(() => R.regions(diag, { conn: 6 }), 'RASTER_ARG', 'conn 6');
  const u = mask(7, 5, (i, j) => (i === 1 || i === 5) && j >= 1 || j === 0 && i >= 1 && i <= 5);
  ok(R.regions(u).list.length === 1, 'a U shape is one region');
  const nd = mask(5, 1, () => true, { etype: 'i16', nodata: -1 });
  nd.data[2] = -1;
  ok(R.regions(nd).list.length === 2, 'a nodata cell splits a row into two regions');
  ok(R.regions(mask(5, 5, () => false)).list.length === 0, 'an empty mask: no regions');
  const nan = R.make({ name: 'm', w: 3, h: 3, cell: 10, etype: 'f32' }); nan.data[4] = NaN;
  throwsCode(() => R.regions(nan), 'RASTER_NAN', 'regions with a NaN mask value');
  throwsCode(() => R.regions(R.make({ name: 'p', w: 2, h: 2, cell: 10, etype: 'rgba8' })), 'RASTER_ETYPE', 'regions on rgba8');
}

// ---- 3. distance ----
{
  const m = mask(21, 21, (i, j) => !(i === 10 && j === 10));
  const d = R.distance(m), at = (i, j) => d.data[j * 21 + i];
  let worst = 0;
  for (let j = 0; j < 21; j++) for (let i = 0; i < 21; i++) worst = Math.max(worst, Math.abs(at(i, j) - Math.fround(Math.hypot(i - 10, j - 10) * 10)));
  ok(worst === 0, 'distance to one zero cell is exact Euclidean (worst ' + worst + ')');
  ok(d.etype === 'f32' && d.name === 'distance' && d.meta.unit === 'u', 'distance layer header (f32, u)');
  const all = mask(5, 5, () => true);
  ok(R.distance(all).data.every(v => v === Infinity), 'no zero cell and no edge: Infinity');
  const e = R.distance(all, { edge: true }), ea = (i, j) => e.data[j * 5 + i];
  ok(ea(0, 0) === 10 && ea(2, 2) === 30 && ea(1, 2) === 20, 'edge: the cells outside the map count as zero (' + ea(0, 0) + ', ' + ea(2, 2) + ')');
  // brute force on a random-looking mask (integer hash, no Math.random)
  const bm = mask(30, 20, (i, j) => ((i * 7919 + j * 104729) % 13) !== 0);
  const bd = R.distance(bm);
  let bw = 0;
  for (let j = 0; j < 20; j++) for (let i = 0; i < 30; i++) {
    let best = Infinity;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) if (!bm.data[y * 30 + x]) best = Math.min(best, Math.hypot(x - i, y - j) * 10);
    bw = Math.max(bw, Math.abs(bd.data[j * 30 + i] - Math.fround(best)));
  }
  ok(bw === 0, 'distance equals brute force on a scattered mask (worst ' + bw + ')');
}

// ---- 4. the fixture pond (water level -20 u) ----
{
  const F = FX.SPEC.forms.as2;
  const m = mask(F.w, F.h, (i, j) => FX.cellRecord('as2', i, j).h < FX.SPEC.clip.water, { ox: -FX.SPEC.offX, oy: -FX.SPEC.offY, sample: 'lattice' });
  const r = R.regions(m);
  ok(r.list.length === 1, 'fixture: the pond is one water region (' + r.list.length + ')');
  const P = FX.SPEC.pond;
  ok(Math.hypot(r.list[0].ax - P.x, r.list[0].ay - P.y) <= 10, 'fixture: the pond label anchor at its centre (' + r.list[0].ax + ', ' + r.list[0].ay + ')');
  golden('as2.pond.regions', sha1(r.grid.data), 'fixture pond regions sha1');
  golden('as2.pond.list', JSON.stringify(r.list), 'fixture pond region list');
}

// ---- 5. the kregion kernel ----
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'kregion.js'), 'utf8');
  ok(!/require\(\s*['"]\.\.?\//.test(src), 'kregion.js holds no relative require');
  const m = mask(10, 6, (i, j) => i < 3 || i > 6), wrote = {}, out = path.join(W, 'kr');
  const io = { readGrid: () => m, writeGrid: (f, g) => { wrote[f] = g; }, readPng() {}, writePng() {}, progress: { stage() {}, step() {} } };
  fs.mkdirSync(out, { recursive: true });
  ok(KR.run({ v: 1, kernel: 'lib/raster/kregion', inputs: ['m.mvg'], args: { fn: 'regions' }, out }, io) === 0, 'kernel regions runs');
  const j = JSON.parse(fs.readFileSync(path.join(out, 'regions.json'), 'utf8'));
  ok(wrote[path.join(out, 'regions.mvg')] && j.v === 1 && j.list.length === 2, 'kernel writes regions.mvg and regions.json (2 regions)');
  ok(KR.run({ v: 1, inputs: ['m.mvg'], args: { fn: 'distance', edge: true }, out }, io) === 0 && wrote[path.join(out, 'distance.mvg')].meta.edge === true, 'kernel distance writes distance.mvg');
  throwsCode(() => KR.run({ v: 1, inputs: ['m.mvg'], args: { fn: 'x' }, out }, io), 'RASTER_ARG', 'kernel with an unknown fn');
}

if (WRITE) { fs.writeFileSync(GOLD, JSON.stringify(gold, null, 1) + '\n'); console.log('wrote ' + GOLD); }
if (fail) { console.log('FAIL mapviz raster-region: ' + fail + ' of ' + (pass + fail) + ' checks failed'); process.exit(1); }
console.log('PASS mapviz raster-region (' + pass + ')');
// a temp folder this run made (no folder given) goes when every check passed; a failed run keeps it to look at
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }
