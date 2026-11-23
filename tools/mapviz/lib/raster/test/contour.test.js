// raster contour test: the interval rule, a cone (closed lines at the right radius, higher ground on the left), a pit,
// a plane (edge-to-edge lines, labels on index lines only, upright angles, spacing), a nodata hole, the vector product
// of README 5.3, the fixture against its golden (float product: points within 0.11 u), refusals, the kcontour kernel.
// usage: node tools/mapviz/lib/raster/test/contour.test.js [scratch dir]
//        MAPVIZ_GOLDEN_WRITE=1 writes test/contour-fixture.golden.json instead of comparing
// Author: Imperator_Aug (ARSENAL, ia-3b953876)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-raster-contour-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const R = require('../index');
const KC = require('../kcontour');
const FX = require('../../../test/fxmake');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz raster-contour: ' + what); } }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ': no error (want ' + code + ')'); }
  catch (e) { ok(e && e.code === code, what + ': code ' + (e && e.code) + ', want ' + code + ' (' + (e && e.message) + ')'); }
}
const WRITE = process.env.MAPVIZ_GOLDEN_WRITE === '1';

function grid(n, cell, fn, o) {
  const g = R.make(Object.assign({ name: 'height', w: n, h: n, cell, ox: 0, oy: 0, etype: 'f32', sample: 'lattice', meta: { unit: 'u', upm: 20 } }, o || {}));
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) g.data[j * g.w + i] = fn(g.ox + i * cell, g.oy + j * cell);
  return g;
}
function fixture(form) {
  const F = FX.SPEC.forms[form];
  const g = R.make({ name: 'height', w: F.w, h: F.h, cell: F.cell, ox: -FX.SPEC.offX, oy: -FX.SPEC.offY, etype: 'i16', sample: 'lattice', meta: { unit: 'u', upm: 20 } });
  for (let j = 0; j < F.h; j++) for (let i = 0; i < F.w; i++) g.data[j * F.w + i] = FX.cellRecord(form, i, j).h;
  return g;
}
const closed = l => l.pts.length > 2 && l.pts[0][0] === l.pts[l.pts.length - 1][0] && l.pts[0][1] === l.pts[l.pts.length - 1][1];
function area(pts) { let a = 0; for (let k = 0; k + 1 < pts.length; k++) a += pts[k][0] * pts[k + 1][1] - pts[k + 1][0] * pts[k][1]; return a / 2; }

// ---- 1. the interval rule: the smallest of 0.5, 1, 2, 5 m with at most 30 levels over the relief ----
{
  const T = [[0, 0.5], [10, 0.5], [15, 0.5], [15.01, 1], [30, 1], [30.5, 2], [60, 2], [61, 5], [150, 5], [1000, 5]];
  const bad = T.filter(([r, want]) => KC.intervalFor(r) !== want).map(([r, want]) => r + ' m -> ' + KC.intervalFor(r) + ' (want ' + want + ')');
  ok(!bad.length, 'intervalFor: ' + bad.join('; '));
  ok(R.contourInterval(fixture('as2')) === 0.5, 'fixture interval 0.5 m (relief 13 m)');
  ok(R.contourInterval(grid(41, 10, x => x * 2)) === 2, 'a plane rising 800 u = 40 m: interval 2 m');
  // a lone spike does not set the interval (relief = 99.5th - 0.5th percentile)
  const sp = grid(101, 10, x => x * 0.1); sp.data[50 * 101 + 50] = 5000;
  ok(R.contourInterval(sp) === 0.5, 'a lone 250 m spike leaves the interval at 0.5 m, got ' + R.contourInterval(sp));
}

// ---- 2. a cone: closed lines, radius, orientation, index ----
{
  const c = 300, g = grid(61, 10, (x, y) => Math.max(0, 200 - Math.hypot(x - c, y - c)));
  const r = R.contours(g);
  ok(r.interval === 0.5, 'cone interval 0.5 m, got ' + r.interval);
  let notClosed = 0, worst = 0, cw = 0, badIdx = 0, levels = new Set();
  for (const l of r.lines) {
    levels.add(l.level);
    if (!closed(l)) notClosed++;
    if (area(l.pts) <= 0) cw++;
    if (l.index !== (Math.abs(l.level / r.interval % 5) < 1e-9)) badIdx++;
    const want = 200 - l.level * 20;
    if (want >= 40) for (const p of l.pts) worst = Math.max(worst, Math.abs(Math.hypot(p[0] - c, p[1] - c) - want));
  }
  ok(notClosed === 0, 'cone: every line closed (' + notClosed + ' open)');
  ok(cw === 0, 'cone: every line counter-clockwise, higher ground on the left (' + cw + ' not)');
  ok(worst <= 2.5, 'cone: points within 2.5 u of the level radius (worst ' + worst.toFixed(2) + ')');
  ok(badIdx === 0, 'cone: index = every fifth level');
  ok(levels.has(0.5) && levels.has(9.5) && !levels.has(0), 'cone: levels 0.5 .. 9.5 m (0 m is the flat floor, all above)');
  const pit = R.contours(grid(61, 10, (x, y) => -Math.max(0, 200 - Math.hypot(x - c, y - c))));
  ok(pit.lines.length && pit.lines.every(l => closed(l) && area(l.pts) < 0), 'pit: every line closed and clockwise (higher ground outside, on the left)');
  ok(JSON.stringify(R.contours(g)) === JSON.stringify(r), 'cone: the same result on a second run');
}

// ---- 3. a plane: edge-to-edge lines running south (east higher), labels ----
{
  const g = grid(201, 10, x => 0.1 * x), r = R.contours(g);
  ok(r.lines.length === 19 || r.lines.length === 20, 'plane: one line per level (' + r.lines.length + ')');
  let edge = 0, south = 0;
  for (const l of r.lines) {
    const a = l.pts[0], b = l.pts[l.pts.length - 1];
    if (a[1] === 2000 && b[1] === 0) edge++;
    if (a[1] > b[1]) south++;
    ok(l.pts.length === 2, 'plane line ' + l.level + ' simplified to 2 points, got ' + l.pts.length);
  }
  ok(edge === r.lines.length && south === r.lines.length, 'plane: every line runs from the north edge to the south edge (higher east ground on the left)');
  ok(r.labels.length >= 2, 'plane: labels placed (' + r.labels.length + ')');
  const idx = new Set(r.lines.filter(l => l.index).map(l => l.level));
  ok(r.labels.every(b => idx.has(b.level)), 'labels sit on index lines only');
  ok(r.labels.every(b => b.angle === 90), 'labels on north-south lines read upright: angle 90');
  let near = Infinity;
  for (let i = 0; i < r.labels.length; i++) for (let j = i + 1; j < r.labels.length; j++) near = Math.min(near, Math.hypot(r.labels[i].x - r.labels[j].x, r.labels[i].y - r.labels[j].y));
  ok(near >= 600, 'labels at least 30 m (600 u) apart, nearest ' + near.toFixed(0));
  ok(r.labels.every(b => Math.abs(b.x - b.level * 20 / 0.1) < 1), 'labels lie on their line (x = level / slope)');
  ok(R.contours(g, { labels: false }).labels.length === 0, 'labels: false gives none');
  // levels lo < L <= hi: the 10 m level equals the east edge heights, which count as above, so it runs along that edge
  ok(R.contours(g, { interval: 2 }).lines.map(l => l.level).join() === '2,4,6,8,10', 'o.interval 2 m: levels 2..10 on a 10 m plane');
  // a curved line gets no label: the cone above has radii under the straight window
  const cone = R.contours(grid(61, 10, (x, y) => Math.max(0, 200 - Math.hypot(x - 300, y - 300))));
  ok(cone.labels.length === 0, 'no labels on tight curves (cone)');
}

// ---- 4. a nodata hole: lines stop at it ----
{
  const g = grid(41, 10, x => 0.5 * x, { etype: 'i16', nodata: -32768 });
  for (let j = 15; j < 25; j++) for (let i = 15; i < 25; i++) g.data[j * 41 + i] = -32768;
  const r = R.contours(g);
  let inHole = 0;
  for (const l of r.lines) for (const p of l.pts) if (p[0] > 150 && p[0] < 240 && p[1] > 150 && p[1] < 240) inHole++;
  ok(inHole === 0, 'no contour point inside a nodata hole (' + inHole + ')');
  ok(r.lines.some(l => !closed(l) && [l.pts[0], l.pts[l.pts.length - 1]].some(p => p[1] > 0 && p[1] < 400)), 'some lines end at the hole, not at the map edge');
}

// ---- 4b. a crest exactly on a level is drawn once ----
{
  const onX = (r, lv, x) => r.lines.filter(l => l.level === lv && l.pts.every(p => p[0] === x));
  for (const form of ['as2', 'goh']) {
    const r = R.contours(fixture(form)), on = onX(r, 3, -200);
    ok(on.length === 1, form + ' fixture: exactly one 3 m line on the ridge crest x = -200 (' + on.length + ')');
  }
  // a tent with a 5 m crest on x = 200 (one lattice column): one line per flank at 1..4 m, one line on the crest at 5 m
  const tent = R.contours(grid(41, 10, x => 100 - Math.abs(x - 200) / 2), { interval: 1 });
  const per = {};
  for (const l of tent.lines) per[l.level] = (per[l.level] || 0) + 1;
  ok(JSON.stringify(per) === '{"1":2,"2":2,"3":2,"4":2,"5":1}', 'tent: 2 lines at 1..4 m, 1 at the 5 m crest (' + JSON.stringify(per) + ')');
  ok(onX(tent, 5, 200).length === 1, 'tent: the 5 m line lies on the crest x = 200');
  // a crest inside the map (a one-cell-wide wall of 5 m on flat ground): the 5 m level has zero width, no line
  const wall = grid(41, 10, (x, y) => (x === 200 && y >= 100 && y <= 300 ? 100 : 0));
  const wr = R.contours(wall, { interval: 1 });
  ok(wr.lines.filter(l => l.level === 5).length === 0, 'interior crest: no 5 m line that retraces itself');
  ok(wr.lines.filter(l => l.level < 5).length === 4 && wr.lines.filter(l => l.level < 5).every(closed), 'interior crest: one closed line at 1..4 m');
}

// ---- 5. the vector product (README 5.3) and the fixture golden ----
{
  const g = fixture('as2'), r = R.contours(g), v = R.contoursVector(r);
  ok(v.v === 1 && v.kind === 'vector' && v.name === 'contours' && Array.isArray(v.items), 'vector {v:1, kind:vector, name:contours, items}');
  ok(v.items.filter(t => t.kind === 'contour').length === r.lines.length && v.items.filter(t => t.kind === 'contourLabel').length === r.labels.length, 'vector items: one per line and label');
  ok(v.items.every(t => t.kind === 'contour' ? Array.isArray(t.pts) && typeof t.index === 'boolean' && typeof t.level === 'number'
    : t.kind === 'contourLabel' && ['level', 'x', 'y', 'angle'].every(k => typeof t[k] === 'number')), 'vector item fields');
  ok(v.items.every(t => t.kind !== 'contour' || t.pts.every(p => Math.round(p[0] * 10) === p[0] * 10 && Math.round(p[1] * 10) === p[1] * 10)), 'points rounded to 0.1 u');
  ok(r.lines.filter(l => l.level === 0).every(closed), 'fixture: the 0 m line around the pond is closed');
  ok(r.lines.filter(l => l.level >= 0.5).every(l => !closed(l)), 'fixture: the ridge lines run edge to edge');
  const gf = path.join(__dirname, 'contour-fixture.golden.json');
  if (WRITE) fs.writeFileSync(gf, JSON.stringify(v) + '\n');
  else if (!fs.existsSync(gf)) ok(false, 'golden contour-fixture.golden.json is present');
  else {
    const G = JSON.parse(fs.readFileSync(gf, 'utf8'));
    let same = G.items.length === v.items.length, worst = 0;
    for (let k = 0; same && k < v.items.length; k++) {
      const a = v.items[k], b = G.items[k];
      if (a.kind !== b.kind || a.level !== b.level || (a.kind === 'contour' && (a.index !== b.index || a.pts.length !== b.pts.length))) { same = false; break; }
      if (a.kind === 'contour') for (let q = 0; q < a.pts.length; q++) worst = Math.max(worst, Math.abs(a.pts[q][0] - b.pts[q][0]), Math.abs(a.pts[q][1] - b.pts[q][1]));
      else worst = Math.max(worst, Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.angle - b.angle));
    }
    ok(same && worst <= 0.11, 'fixture contours against the golden (same items, worst ' + worst + ' u)');
  }
}

// ---- 6. refusals and the kernel ----
{
  const g = fixture('as2');
  throwsCode(() => R.contours(Object.assign({}, g, { sample: 'cell' })), 'RASTER_SAMPLE', 'contours on a cell-sampled grid');
  const nan = grid(5, 10, () => 1); nan.data[3] = NaN;
  throwsCode(() => R.contours(nan), 'RASTER_NAN', 'contours with a NaN height');
  throwsCode(() => R.contours(g, { interval: -1 }), 'RASTER_ARG', 'a negative interval');
  ok(R.contours(grid(5, 10, () => 7)).lines.length === 0, 'a flat grid has no contours');
  const src = fs.readFileSync(path.join(__dirname, '..', 'kcontour.js'), 'utf8');
  ok(!/require\(\s*['"]\.\.?\//.test(src), 'kcontour.js holds no relative require');
  const out = path.join(W, 'kc');
  const rc = KC.run({ v: 1, kernel: 'lib/raster/kcontour', inputs: ['h.mvg'], args: {}, out }, { readGrid: () => g, writeGrid() {}, readPng() {}, writePng() {}, progress: null });
  const f = path.join(out, 'contours.json');
  ok(rc === 0 && fs.existsSync(f) && fs.readFileSync(f, 'utf8') === JSON.stringify(R.contoursVector(R.contours(g))) + '\n', 'kernel writes contours.json = the library product');
}

if (fail) { console.log('FAIL mapviz raster-contour: ' + fail + ' of ' + (pass + fail) + ' checks failed'); process.exit(1); }
console.log('PASS mapviz raster-contour (' + pass + ')');
// a temp folder this run made (no folder given) goes when every check passed; a failed run keeps it to look at
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }
