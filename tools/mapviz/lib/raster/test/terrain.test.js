// raster terrain test: slopeClass (the engine rule: planes at each class boundary, every cell of the fixture against the
// port in tools/mapviz/test/fxmake.js, the known answers of README 10.4, noNormals), hillshade (a cone: north-west flank
// lit, south-east dark, north face unlike the south face, flat = 128; z from the relief within its bounds; zFine; planes
// shade alike up to the map edge; nodata; the fixture ridge; z), landform (the fixture ridge and pond, the 1 m grid),
// the refusals (wrong sample kind, NaN heights, etype), the kterrain kernel through a fake io (its hillshade options),
// goldens (sha1 for integer products, the tolerance rule for shade).
// usage: node tools/mapviz/lib/raster/test/terrain.test.js [scratch dir]
//        MAPVIZ_GOLDEN_WRITE=1 writes the goldens (test/terrain.golden.json, test/terrain-shade.golden.mvg) instead
// Author: Imperator_Aug (ARSENAL, ia-c843f485)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-raster-terrain-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const R = require('../index');
const KT = require('../kterrain');
const GF = require('../gridfile');
const FX = require('../../../test/fxmake');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz raster-terrain: ' + what); } }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ': no error (want ' + code + ')'); }
  catch (e) { ok(e && e.code === code, what + ': code ' + (e && e.code) + ', want ' + code + ' (' + (e && e.message) + ')'); }
}
const sha1 = a => crypto.createHash('sha1').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const WRITE = process.env.MAPVIZ_GOLDEN_WRITE === '1';
const GOLD = path.join(__dirname, 'terrain.golden.json');
const gold = WRITE ? {} : (fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD, 'utf8')) : null);
ok(WRITE || gold, 'golden file terrain.golden.json is present');
function golden(key, value, what) {
  if (WRITE) { gold[key] = value; return; }
  ok(gold && gold[key] === value, what + ': ' + value + ' (golden ' + (gold && gold[key]) + ')');
}
// README 9.2 float stages: a difference of at most 1 level on at most 0.1 % of the samples
function tolerance(a, b, what) {
  if (a.length !== b.length) { ok(false, what + ': lengths ' + a.length + ' and ' + b.length); return; }
  let one = 0, more = 0;
  for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k] - b[k]); if (d > 1) more++; else if (d === 1) one++; }
  ok(more === 0 && one <= a.length * 0.001, what + ': ' + more + ' samples off by more than 1, ' + one + ' off by 1 of ' + a.length);
}

function fixture(form) {
  const F = FX.SPEC.forms[form];
  const g = R.make({ name: 'height', w: F.w, h: F.h, cell: F.cell, ox: -FX.SPEC.offX, oy: -FX.SPEC.offY, etype: 'i16', sample: 'lattice', meta: { unit: 'u', upm: 20 } });
  for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) g.data[j * F.w + i] = FX.cellRecord(form, i, j).h;
  return g;
}
function plane(theta, phi, n, cell) {
  n = n || 15; cell = cell || 10;
  const s = Math.tan(theta * Math.PI / 180), c = Math.cos(phi * Math.PI / 180), sn = Math.sin(phi * Math.PI / 180);
  const g = R.make({ name: 'height', w: n, h: n, cell, ox: 0, oy: 0, etype: 'f32', sample: 'lattice', meta: { unit: 'u' } });
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.data[j * n + i] = s * (i * cell * c + j * cell * sn);
  return g;
}
function portDiff(g, cls) {
  const hAt = (i, j) => g.data[j * g.w + i];
  let d = 0;
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (cls.data[j * g.w + i] !== FX.slopeClass(hAt, g.w, g.h, g.cell, i, j)) d++;
  return d;
}

// ---- 1. slope class: planes at each class (6 degrees each, acos x 30 / pi truncated, clamped 0..14) ----
{
  let bad = [], diff = 0;
  for (const phi of [0, 90, 45, 30, 200]) {
    for (let k = 0; k <= 14; k++) {
      const cases = [[6 * k + 3, Math.min(14, k)]];
      if (k >= 1) cases.push([6 * k + 0.3, k], [6 * k - 0.3, k - 1]);
      for (const [theta, want] of cases) {
        if (theta >= 90) continue;
        const g = plane(theta, phi), s = R.slopeClass(g), got = s.data[7 * 15 + 7];
        if (got !== want) bad.push(theta + '/' + phi + ':' + got);
        diff += portDiff(g, s);
      }
    }
  }
  ok(!bad.length, 'plane slope classes: wrong at ' + bad.join(' '));
  ok(diff === 0, 'planes: every cell equals the fxmake port (' + diff + ' differ)');
  const g = plane(87, 0), s = R.slopeClass(g);
  ok(s.data[7 * 15 + 7] === 14, 'a plane at 87 deg is class 14 (clamped)');
  ok(s.name === 'slopecls' && s.etype === 'u8' && s.sample === 'cell' && s.w === 15 && s.h === 15 && s.cell === 10, 'slopecls layer header (u8, cell sample)');
  const flat = R.slopeClass(plane(0, 0));
  ok(flat.data.every(v => v === 0), 'a flat plane is class 0 everywhere');
  // noNormals: the cell and its use as a neighbour are skipped
  const nn = new Uint8Array(225); nn[7 * 15 + 7] = 1;
  const s2 = R.slopeClass(plane(33, 0), { noNormals: nn });
  ok(s2.data[7 * 15 + 7] === 0 && s2.data[2 * 15 + 2] === 5, 'noNormals: that cell class 0, the others as before');
}

// ---- 2. slope class on the fixture (README 10.4), both forms ----
for (const form of ['as2', 'goh']) {
  const g = fixture(form), s = R.slopeClass(g);
  ok(portDiff(g, s) === 0, form + ' fixture: every cell equals the fxmake port');
  const at = (i, j) => s.data[j * g.w + i];
  if (form === 'as2') ok(at(39, 48) === 5 && at(64, 48) === 0, 'as2 slopecls (39, 48) = 5, (64, 48) = 0, got ' + at(39, 48) + ', ' + at(64, 48));
  else ok(at(78, 96) === 5 && at(128, 96) === 0, 'goh slopecls (78, 96) = 5, (128, 96) = 0, got ' + at(78, 96) + ', ' + at(128, 96));
  golden(form + '.slopecls', sha1(s.data), form + ' slopecls sha1');
  ok(sha1(R.slopeClass(g).data) === sha1(s.data), form + ' slopecls: the same bytes on a second run');
}

// ---- 3. hillshade: cone, ridge, z ----
{
  const n = 41, c = 20;
  const g = R.make({ name: 'height', w: n, h: n, cell: 10, ox: 0, oy: 0, etype: 'f32', sample: 'lattice', meta: {} });
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.data[j * n + i] = Math.max(0, 150 - Math.hypot(i - c, j - c) * 10);
  const s = R.hillshade(g), at = (i, j) => s.data[j * n + i];
  // row j grows to the north (row 0 = min world y), column i to the east: (c - 8, c + 8) is north-west of the top
  ok(s.name === 'shade' && s.etype === 'u8' && s.sample === 'lattice' && s.meta.alt === 45 && s.meta.dirs[0] === 315 && s.meta.flat === 128,
    'shade layer header (u8, lattice, meta alt 45, main light 315, flat 128)');
  ok(s.meta.zAuto === true && s.meta.z >= KT.SHADE.zMin && s.meta.z <= KT.SHADE.zMax && s.meta.reliefDeg > 0,
    'cone: z from the relief (' + s.meta.z + ', slope ' + s.meta.reliefDeg + ' deg) within ' + KT.SHADE.zMin + '..' + KT.SHADE.zMax + ', in the meta');
  const F = 128;
  // flat ground: the coarse scale (16-point blocks here) reaches about 3 blocks from the cone, so the flat corners are
  // checked on a 97 x 97 grid with the same cone in its centre (corners 53 points from its foot)
  {
    const N = 97, C = 48, big = R.make({ name: 'height', w: N, h: N, cell: 10, ox: 0, oy: 0, etype: 'f32', sample: 'lattice', meta: {} });
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) big.data[j * N + i] = Math.max(0, 150 - Math.hypot(i - C, j - C) * 10);
    const bs = R.hillshade(big), b = (i, j) => bs.data[j * N + i];
    ok(b(0, 0) === F && b(N - 1, N - 1) === F && b(0, N - 1) === F && b(N - 1, 0) === F,
      'flat ground far from the cone = mid shade ' + F + ', got ' + [b(0, 0), b(N - 1, N - 1), b(0, N - 1), b(N - 1, 0)].join(', '));
  }
  ok(at(c - 8, c + 8) > at(c + 8, c - 8) + 80, 'cone: the north-west flank is lit, the south-east flank dark (' + at(c - 8, c + 8) + ' / ' + at(c + 8, c - 8) + ')');
  ok(at(c - 8, c + 8) > F + 20 && at(c + 8, c - 8) < F - 20, 'cone: north-west flank above flat, south-east flank below flat');
  ok(at(c - 10, c) > at(c + 10, c) + 40, 'cone: the west flank lighter than the east flank (' + at(c - 10, c) + ' / ' + at(c + 10, c) + ')');
  // a main light from the north-west: a north face is not lit like a south face
  ok(at(c, c + 10) > at(c, c - 10) + 40, 'cone: the north flank lighter than the south flank (' + at(c, c + 10) + ' / ' + at(c, c - 10) + ')');
  let mx = 0, mxk = -1, mn = 256, mnk = -1;
  for (let k = 0; k < n * n; k++) { if (s.data[k] > mx) { mx = s.data[k]; mxk = k; } if (s.data[k] < mn) { mn = s.data[k]; mnk = k; } }
  const azOf = k => (Math.atan2(k % n - c, Math.floor(k / n) - c) * 180 / Math.PI + 360) % 360;
  ok(azOf(mxk) >= 270 && azOf(mxk) <= 360, 'cone: the brightest cell faces the north-west (azimuth ' + azOf(mxk).toFixed(0) + ' in 270..360)');
  ok(azOf(mnk) >= 90 && azOf(mnk) <= 180, 'cone: the darkest cell faces the south-east (azimuth ' + azOf(mnk).toFixed(0) + ' in 90..180)');
  const again = R.hillshade(g);
  ok(sha1(again.data) === sha1(s.data), 'cone: the same bytes on a second run');
  // the exaggeration follows the relief: a cone 10 x lower gets more than one 3 x lower, the cone (45 deg) and one 3 x
  // higher sit on the lower bound, a flat plane gets the upper bound
  const scaled = f => { const x = R.make({ name: 'height', w: n, h: n, cell: 10, ox: 0, oy: 0, etype: 'f32', sample: 'lattice', meta: {} }); for (let k = 0; k < n * n; k++) x.data[k] = g.data[k] * f; return x; };
  const zLow = R.hillshade(scaled(0.1)).meta.z, zMid = R.hillshade(scaled(0.3)).meta.z, zHigh = R.hillshade(scaled(3)).meta.z;
  ok(zLow > zMid && zMid > s.meta.z && s.meta.z === KT.SHADE.zMin && zHigh === KT.SHADE.zMin && zLow <= KT.SHADE.zMax,
    'z from the relief: cone x 0.1 ' + zLow + ' > x 0.3 ' + zMid + ' > cone ' + s.meta.z + ' = x 3 ' + zHigh + ' = the lower bound');
  const flat = R.hillshade(scaled(0));
  ok(flat.meta.z === KT.SHADE.zMax && flat.data.every(v => v === F), 'a flat plane: z ' + flat.meta.z + ' (the upper bound), every sample ' + F);
  const z2 = R.hillshade(g, { z: 2 });
  ok(z2.meta.z === 2 && z2.meta.zAuto === false, 'z given: meta z 2, zAuto false');
  // the fine scale's z: z while the blur radius is under its cap, else capped so a 1 u step stays under SHADE.stepDeg
  const fineCap = s2 => Math.tan(KT.SHADE.stepDeg * Math.PI / 180) * 10 * (2 * s2.meta.smooth + 1);
  ok(z2.meta.zFine === 2, 'z 2 at cell 10: the fine scale gets the full z (zFine ' + z2.meta.zFine + ')');
  const z8 = R.hillshade(g, { z: 8 }), cap8 = fineCap(z8);
  ok(z8.meta.zFine < 8 && z8.meta.zFine <= cap8 && z8.meta.zFine > cap8 - 0.02 && z8.meta.z === 8,
    'z 8 at cell 10: the blur radius is at its cap (' + z8.meta.smooth + '), the fine scale gets zFine ' + z8.meta.zFine + ' <= ' + cap8.toFixed(3) + ', the coarse scale z 8');
  // the map edge: a plane shades the same at the edge as inside (heights extended by odd reflection, not clipped);
  // sizes that are not a multiple of the coarse block (16 lattice points here) and two slope directions
  for (const [pw, ph, gx, gy] of [[120, 83, -5, 0], [77, 130, 2, 3]]) {
    const ramp = R.make({ name: 'height', w: pw, h: ph, cell: 10, ox: 0, oy: 0, etype: 'f32', sample: 'lattice', meta: {} });
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) ramp.data[j * pw + i] = 1000 + gx * i + gy * j;
    const rs = R.hillshade(ramp, { z: 1 });
    let lo = 255, hi = 0; for (const v of rs.data) { if (v < lo) lo = v; if (v > hi) hi = v; }
    ok(hi - lo <= 2, 'plane ' + pw + ' x ' + ph + ' (gradient ' + gx + ', ' + gy + ' u per cell): every sample within 2 levels, edges included (' + lo + '..' + hi + ')');
  }
  // fill lights only fill: one light from 315 alone gives the same order of the flanks
  const one = R.hillshade(g, { dirs: [315], z: 2 }), o1 = (i, j) => one.data[j * n + i];
  ok(o1(c - 8, c + 8) > o1(c + 8, c - 8) && one.meta.weights.length === 1 && one.meta.weights[0] === 1, 'a single light 315: north-west flank lit, weight 1');
  // nodata: a hole is flat ground and its neighbours still shade
  const hole = scaled(1); hole.nodata = -9999; for (let j = c + 4; j <= c + 6; j++) for (let i = c - 6; i <= c - 4; i++) hole.data[j * n + i] = -9999;
  const hs = R.hillshade(hole, { z: 2 });
  ok(hs.data[(c + 5) * n + c - 5] === F && hs.data[(c + 9) * n + c - 9] > F + 20 && hs.data[(c - 8) * n + c + 8] < F - 20,
    'nodata heights: flat (' + F + ') there, the north-west flank beyond them still lit, the south-east flank dark');
  const fx = fixture('as2'), sh = R.hillshade(fx), sa = (x, y) => sh.data[Math.round((y - sh.oy) / sh.cell) * sh.w + Math.round((x - sh.ox) / sh.cell)];
  ok(sa(-250, 0) > F && sa(-150, 0) < F, 'fixture ridge: west flank lit (' + sa(-250, 0) + '), east flank dark (' + sa(-150, 0) + ')');
  ok(sa(620, 460) === F, 'fixture: flat ground far from the ridge and the pond is mid shade (' + sa(620, 460) + ')');
  const z1 = R.hillshade(fx, { z: 1 }), z3 = R.hillshade(fx, { z: 3 }), sz = (G, x, y) => G.data[Math.round((y - G.oy) / G.cell) * G.w + Math.round((x - G.ox) / G.cell)];
  ok(sz(z3, -150, 0) < sz(z1, -150, 0), 'z 3 darkens the dark flank more than z 1 (' + sz(z3, -150, 0) + ' < ' + sz(z1, -150, 0) + ')');
  throwsCode(() => R.hillshade(fx, { alt: 0 }), 'RASTER_ARG', 'hillshade alt 0');
  throwsCode(() => R.hillshade(fx, { alt: 90 }), 'RASTER_ARG', 'hillshade alt 90');
  throwsCode(() => R.hillshade(fx, { z: -1 }), 'RASTER_ARG', 'hillshade z -1');
  throwsCode(() => R.hillshade(fx, { dirs: [315, 270], weights: [1] }), 'RASTER_ARG', 'hillshade with one weight for two lights');
  throwsCode(() => R.hillshade(fx, { dirs: [315], weights: [0] }), 'RASTER_ARG', 'hillshade with weights all 0');
  ok(Object.isFrozen(KT.SHADE) && Object.isFrozen(KT.SHADE.dirs), 'the shade constants are frozen (no state between calls)');
  const gf = path.join(__dirname, 'terrain-shade.golden.mvg');
  if (WRITE) GF.write(gf, sh);
  else if (fs.existsSync(gf)) tolerance(sh.data, GF.read(gf).data, 'as2 fixture shade against its golden');
  else ok(false, 'golden terrain-shade.golden.mvg is present');
}

// ---- 4. landform: the fixture ridge and pond on the 1 m grid ----
for (const form of ['as2', 'goh']) {
  const g = fixture(form), P = FX.SPEC.pond;
  for (const r of [10, 50]) {
    const L = R.landform(g, r), at = (x, y) => L.data[Math.floor((y - L.oy) / L.cell) * L.w + Math.floor((x - L.ox) / L.cell)];
    ok(L.name === 'landform.r' + r && L.etype === 'u8' && L.sample === 'cell' && L.cell === 20 && L.w === Math.ceil(g.w * g.cell / 20) && L.h === Math.ceil(g.h * g.cell / 20),
      form + ' landform.r' + r + ' on the 1 m grid (' + L.w + ' x ' + L.h + ', cell ' + L.cell + ')');
    ok(at(-195, 0) === R.LANDFORM.RIDGE, form + ' r' + r + ': the ridge crest is a ridge (1), got ' + at(-195, 0));
    ok(at(-500, -300) === 0, form + ' r' + r + ': the flat ground is flat (0), got ' + at(-500, -300));
    ok(at(P.x, P.y) === 5, form + ' r' + r + ': the pond bottom is a pit (5), got ' + at(P.x, P.y));
    if (r === 10) ok(at(-250, 0) === 3 && at(-150, 0) === 3, form + ' r10: the ridge flanks are slope (3), got ' + at(-250, 0) + ', ' + at(-150, 0));
    let bad = 0; for (const v of L.data) if (v > 5) bad++;
    ok(bad === 0, form + ' r' + r + ': codes 0..5 only');
    if (form === 'as2') golden('as2.landform.r' + r, sha1(L.data), 'as2 landform.r' + r + ' sha1');
  }
  throwsCode(() => R.landform(g, 0), 'RASTER_ARG', form + ' landform radius 0');
}

// ---- 5. refusals (seeded defects) ----
{
  const g = fixture('as2');
  const cellKind = Object.assign({}, g, { sample: 'cell' });
  throwsCode(() => R.slopeClass(cellKind), 'RASTER_SAMPLE', 'slopeClass on a cell-sampled height');
  throwsCode(() => R.landform(cellKind, 10), 'RASTER_SAMPLE', 'landform on a cell-sampled height');
  const nan = R.make({ name: 'height', w: 4, h: 4, cell: 10, ox: 0, oy: 0, etype: 'f32', sample: 'lattice' });
  nan.data[5] = NaN;
  throwsCode(() => R.slopeClass(nan), 'RASTER_NAN', 'slopeClass with a NaN height');
  throwsCode(() => R.hillshade(nan), 'RASTER_NAN', 'hillshade with a NaN height');
  throwsCode(() => R.landform(nan, 10), 'RASTER_NAN', 'landform with a NaN height');
  const rgba = R.make({ name: 'pic', w: 4, h: 4, cell: 10, etype: 'rgba8', sample: 'lattice' });
  throwsCode(() => R.slopeClass(rgba), 'RASTER_ETYPE', 'slopeClass on an rgba8 grid');
  throwsCode(() => R.slopeClass({ w: 2 }), 'RASTER_GRID', 'slopeClass on a non-grid');
  // nodata heights count as no normals (class 0) and leave the other cells alone
  const nd = plane(33, 0); nd.nodata = -9999; nd.data[7 * 15 + 7] = -9999;
  const s = R.slopeClass(nd);
  ok(s.data[7 * 15 + 7] === 0 && s.data[2 * 15 + 2] === 5, 'a nodata height: class 0 there, others unchanged');
}

// ---- 6. the kterrain kernel through a fake io (README 1.5) ----
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'kterrain.js'), 'utf8');
  ok(!/require\(\s*['"]\.\.?\//.test(src), 'kterrain.js holds no relative require');
  const g = fixture('as2'), wrote = {};
  const io = { readGrid: f => { ok(f === 'in/height.mvg', 'kernel reads inputs[0]'); return g; }, writeGrid: (f, grid) => { wrote[f] = grid; },
    readPng: () => null, writePng: () => null, progress: { stage() {}, step() {} } };
  for (const [fn, layer, args] of [['slopeClass', 'slopecls', {}], ['hillshade', 'shade', {}], ['landform', 'landform.r10', { r: 10 }]]) {
    const rc = KT.run({ v: 1, kernel: 'lib/raster/kterrain', inputs: ['in/height.mvg'], args: Object.assign({ fn }, args), out: 'o' }, io);
    const f = path.join('o', layer + '.mvg');
    ok(rc === 0 && wrote[f] && wrote[f].name === layer, 'kernel ' + fn + ' writes ' + f);
  }
  ok(sha1(wrote[path.join('o', 'slopecls.mvg')].data) === sha1(R.slopeClass(g).data), 'kernel slopeClass = the library call');
  // the kernel passes dirs, weights, alt and z through to hillshade
  const hsArgs = { dirs: [300], weights: [1], alt: 40, z: 2 };
  KT.run({ v: 1, kernel: 'lib/raster/kterrain', inputs: ['in/height.mvg'], args: Object.assign({ fn: 'hillshade' }, hsArgs), out: 'o' }, io);
  const ks = wrote[path.join('o', 'shade.mvg')], km = ks.meta;
  ok(km.dirs.length === 1 && km.dirs[0] === 300 && km.weights.length === 1 && km.weights[0] === 1 && km.alt === 40 && km.z === 2 && km.zAuto === false,
    'kernel hillshade passes dirs, weights, alt and z through (meta ' + JSON.stringify({ dirs: km.dirs, weights: km.weights, alt: km.alt, z: km.z, zAuto: km.zAuto }) + ')');
  ok(sha1(ks.data) === sha1(R.hillshade(g, hsArgs).data), 'kernel hillshade with args = the library call with the same options');
  throwsCode(() => KT.run({ v: 1, inputs: ['in/height.mvg'], args: { fn: 'nope' }, out: 'o' }, io), 'RASTER_ARG', 'kernel with an unknown fn');
  ok(R.KERNELS.indexOf('lib/raster/kterrain') >= 0, 'KERNELS lists lib/raster/kterrain');
}

if (WRITE) { fs.writeFileSync(GOLD, JSON.stringify(gold, null, 1) + '\n'); console.log('wrote ' + GOLD); }
// ---- 7. the o.tick(done, total) progress hook (README 7) of every long raster call ----
{
  const g = fixture('as2');
  const calls = fn => { const c = []; const r = fn({ tick: (d, t) => c.push([d, t]) }); return { c, r }; };
  const good = c => c.length >= 1 && c.every(([d, t], k) => Number.isFinite(d) && t > 0 && d >= 0 && d <= t && t === c[0][1] && (k === 0 || d >= c[k - 1][0])) &&
    c[c.length - 1][0] === c[c.length - 1][1];
  const sc = R.slopeClass(g);
  const mask = R.make({ name: 'm', w: sc.w, h: sc.h, cell: sc.cell, ox: sc.ox, oy: sc.oy, etype: 'u8', sample: 'cell', meta: {} });
  for (let k = 0; k < mask.data.length; k++) mask.data[k] = sc.data[k] > 2 ? 1 : 0;
  const cost = R.make({ name: 'c', w: sc.w, h: sc.h, cell: sc.cell, ox: sc.ox, oy: sc.oy, etype: 'f32', sample: 'cell', nodata: -1, meta: {} });
  cost.data.fill(1);
  const stops = R.palette().height.stops;
  const runs = {
    slopeClass: o => R.slopeClass(g, o), hillshade: o => R.hillshade(g, o), tint: o => R.tint(g, stops, o),
    contours: o => R.contours(g, o), regions: o => R.regions(mask, o), distance: o => R.distance(mask, o),
    costField: o => R.costField(cost, [{ i: 3, j: 3 }], o), minFilter: o => R.minFilter(sc, 2, o),
    resample: o => R.resample(sc, 40, 30, 'nearest', o), topo: o => R.topo(g, Object.assign({ size: 64 }, o)),
  };
  for (const name of Object.keys(runs)) {
    const { c } = calls(runs[name]);
    ok(good(c), name + ': o.tick calls rise, done <= total, end at (total, total) (' + JSON.stringify(c.slice(-3)) + ')');
  }
  // the same bytes with and without the hook
  ok(sha1(R.slopeClass(g, { tick: () => {} }).data) === sha1(sc.data), 'slopeClass: the hook does not change the bytes');
  ok(sha1(R.topo(g, { size: 64, tick: () => {}, made: 'x' }).grid.data) === sha1(R.topo(g, { size: 64, made: 'x' }).grid.data), 'topo: the hook does not change the bytes');
  throwsCode(() => R.slopeClass(g, { tick: 5 }), 'RASTER_ARG', 'slopeClass with a tick that is not a function');
  throwsCode(() => R.regions(mask, { tick: 'x' }), 'RASTER_ARG', 'regions with a tick that is not a function');
  throwsCode(() => R.topo(g, { tick: {} }), 'RASTER_ARG', 'topo with a tick that is not a function');
  // a throw from the hook (the CLI cancel) ends the call
  const stop = () => { const e = new Error('stop'); e.code = 'MV_CANCELLED'; throw e; };
  throwsCode(() => R.hillshade(g, { tick: stop }), 'MV_CANCELLED', 'hillshade: a throwing tick ends the call');
  throwsCode(() => R.costField(cost, [{ i: 3, j: 3 }], { tick: stop }), 'MV_CANCELLED', 'costField: a throwing tick ends the call');
  // the throttle: with a clock that moves 60 ms per read the hook is called in the middle of the work, not only at the end
  const now = Date.now;
  let fake = now();
  Date.now = () => (fake += 60);
  let c;
  try { c = calls(o => R.slopeClass(g, o)).c; } finally { Date.now = now; }
  ok(good(c) && c.length > 3 && c.some(([d, t]) => d < t), 'slopeClass: ticks during the work when time passes (' + c.length + ' calls)');
  ok(typeof KT.ticker === 'function' && KT.TICK_MS === 100, 'kterrain exports ticker and TICK_MS 100');
}

if (fail) { console.log('FAIL mapviz raster-terrain: ' + fail + ' of ' + (pass + fail) + ' checks failed'); process.exit(1); }
console.log('PASS mapviz raster-terrain (' + pass + ')');
// a temp folder this run made (no folder given) goes when every check passed; a failed run keeps it to look at
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }
