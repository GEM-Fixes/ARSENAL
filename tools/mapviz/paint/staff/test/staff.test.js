// paint staff test (MV-PNT1 part b): the Staff map style on the synthetic input (paint draft 8.1) and on the fixture map
// in both forms (README 10; AS2 form as mowas2 and as64, GoH form as goh). Checks: the style module contract (4.3),
// the picture (size, name, alpha 255, determinism), known pixels and counts, the absent-want rules (4.4: gaps and
// notes), no game branch (the same input on as64, mowas2 and goh gives the same bytes; GoH ground type 10 adds wood),
// the thumbnail pass (no contours, no tree stamps), the tick contract, planted bad inputs, and the goldens (README 9.2:
// sha1 of the data block; --update-golden rewrites them). Input from the shared paint files: test/synth.js and gather.
// usage: node tools/mapviz/paint/staff/test/staff.test.js [scratch dir] [--update-golden]
// Author: Imperator_Aug (ARSENAL, ia-5b0d6122)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const UPDATE = process.argv.includes('--update-golden');
const OWN = !args[0];
const WD = path.resolve(args[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-paint-staff-')));
fs.mkdirSync(WD, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(WD + path.sep) ? c : path.join(WD, 'cache');
}

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz paint/staff: ' + what); } }
const sha1 = b => crypto.createHash('sha1').update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest('hex');

const MV = path.resolve(__dirname, '../../..');
const PAINT = path.join(MV, 'paint');
const PI = require(path.join(PAINT, 'index.js'));
const SY = require(path.join(PAINT, 'test', 'synth.js'));
const S = { synth: SY.synth, synthOpts: SY.synthOpts, frameFor: PI.frameFor };

const mv = require(path.join(MV, 'mapviz'));
const palette = require(path.join(MV, 'palette.json'));
const hex = s => { const v = parseInt(s.slice(1, 7), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const px = (g, i, j) => Array.from(g.data.subarray((j * g.w + i) * 4, (j * g.w + i) * 4 + 4));
const near = (a, b, tol) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
function throwsCode(fn, code, detail) {
  try { fn(); return 'no throw'; } catch (e) { return e instanceof mv.MvError && e.code === code && (!detail || (e.detail && e.detail.code === detail)) ? true : (e.code || '') + ' ' + e.message; }
}

// ---------------------------------------------------------------- module contract (paint 4.3)
const STAFF = path.join(PAINT, 'staff');
const st = require(path.join(STAFF, 'index.js'));
ok(!require.cache[path.join(STAFF, 'draw.js')], 'index.js is light at load: draw.js not loaded before draw()');
ok(st.ID === 'staff' && st.VERSION === 1 && Number.isInteger(st.VERSION), 'ID staff, VERSION 1 (integer)');
ok(JSON.stringify(st.NEEDS) === '["height"]', 'NEEDS [height]');
ok(JSON.stringify(st.WANTS) === JSON.stringify(['shade', 'gtype', 'material', 'water.band', 'water.drown', 'objects']), 'WANTS = paint draft 4.4 row staff');
ok(typeof st.draw === 'function', 'draw is a function');
{
  const raw = fs.readFileSync(path.join(STAFF, 'index.js'), 'utf8') + fs.readFileSync(path.join(STAFF, 'draw.js'), 'utf8');
  ok(/^[\x00-\x7f]*$/.test(raw) && !/\r/.test(raw), 'sources ASCII and LF');
  const src = raw.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok(!/Math\.random|Date\.now|new Date|readFileSync|process\.env/.test(src), 'no Math.random, clock, file read or env in the style');
  ok(!/target\s*===|\.target\b/.test(src), 'no game branch in the style (reads input.target nowhere)');
}

// ---------------------------------------------------------------- synthetic input
function run(input, opts) { return st.draw(input, opts || S.synthOpts(input)); }
const s128 = S.synth({ style: 'staff', target: 'mowas2', size: 128 });
ok(s128.frame.W === 128 && s128.frame.H === 96 && s128.frame.sx === 5 && s128.frame.long === 128, 'synth frame 128 x 96, 5 u');
const r128 = run(s128);
const g = r128.grid;
ok(g && g.etype === 'rgba8' && g.name === 'pic.staff' && g.w === 128 && g.h === 96 && g.data.length === 128 * 96 * 4, 'grid rgba8 pic.staff 128 x 96');
{ let a = true; for (let k = 3; k < g.data.length; k += 4) if (g.data[k] !== 255) { a = false; break; } ok(a, 'alpha 255 everywhere'); }
ok(Array.isArray(r128.gaps) && r128.gaps.length === 0 && Array.isArray(r128.notes) && r128.notes.length === 0 && r128.approx === false, 'full synth: no gaps, no notes, approx false: ' + JSON.stringify(r128.gaps) + JSON.stringify(r128.notes));
ok(sha1(run(S.synth({ size: 128 })).grid.data) === sha1(g.data), 'same input, same bytes');

// counts computed here from the synth layers (pixel centre -> cell, paint 4.5 rules)
function expect(input) {
  const f = input.frame, L = input.layers, h = L.height;
  const cellAt = (G, x, y) => { const i = Math.floor((x - G.ox) / G.cell), j = Math.floor((y - G.oy) / G.cell); return i < 0 || j < 0 || i >= G.w || j >= G.h ? null : G.data[j * G.w + i]; };
  const e = { off: 0, water: [0, 0, 0] };
  for (let j = 0; j < f.H; j++) for (let i = 0; i < f.W; i++) {
    const x = f.x0 + (i + 0.5) * f.sx, y = f.y0 + (j + 0.5) * f.sy;
    if (cellAt(h, x, y) === h.nodata) { e.off++; continue; }
    const b = cellAt(L['water.band'], x, y), d = cellAt(L['water.drown'], x, y);
    const w = b && d ? 3 : b;
    if (w) e.water[w - 1]++;
  }
  return e;
}
{
  const e = expect(s128), s = r128.stats;
  ok(s.offGroundPx === 16 && e.off === 16, 'off-ground pixels 16 (draft 8.1): ' + s.offGroundPx);
  ok(s.waterPx.noProne === e.water[0] && s.waterPx.swim === e.water[1] && s.waterPx.drown === e.water[2] && e.water[2] > 0,
    'water pixels by mask = counted from the synth layers: ' + JSON.stringify(s.waterPx) + ' vs ' + e.water);
  ok(s.waterFrom === 'water', 'water from the water masks');
  ok(s.buildings === 1 && s.walls === 1, 'one building, one wall');
  ok(s.heightMin === -120 && s.heightMax === 60, 'height range -120..60 u');
  ok(s.roadPx.road > 0 && s.roadPx.country > 0 && s.roadPx.decal > 0, 'roads: material road, country road and the decal: ' + JSON.stringify(s.roadPx));
  ok(s.noHeightPx === 0, 'every on-ground pixel has a height (the east and north rim past the last lattice point too): ' + s.noHeightPx);
  ok(s.woodPx > 0, 'wood wash drawn (' + s.woodPx + ' px)');
}
// thumbnail pass (size 128 <= 512): no contours, no tree stamps
ok(r128.stats.contourLines === 0 && r128.stats.treeStamps === 0, 'thumbnail: no contours, no tree stamps');

// a larger synth picture (not a thumbnail): contours, stamps, known pixels
const s640 = S.synth({ size: 640 });
const r640 = run(s640);
ok(r640.grid.w === 640 && r640.grid.h === 480, 'synth 640 x 480');
ok(r640.stats.contourLines > 0 && r640.stats.treeStamps === 3 && r640.stats.interval > 0, 'full pass: contours (' + r640.stats.contourLines + ' at ' + r640.stats.interval + ' m) and 3 tree stamps');
{
  const G = r640.grid, P = palette.styles.staff;
  const at = (x, y) => px(G, Math.floor((x + 320)), Math.floor((y + 240)));     // 1 u per pixel
  const bld = at(-200, -150);
  ok(near(bld, hex(P.building), 14), 'building fill at the house centre ~ styles.staff.building: ' + bld);
  const drown = at(160, -100);
  const fill = hex((P.waterBands || [])[2] || P.water);
  const hs = [palette.water.drown.hatch.color].map(hex)[0];
  ok(near(drown, fill, 14) || near(drown, hs, 40), 'drown pixel at the pond centre is the drown fill or its hatch: ' + drown);
  const road = at(-250, 65);      // cell j 30 (y 60..70), x < 0: material road
  ok(road[0] < 200 && road[2] < 150, 'road row is the road colour or casing, not paper: ' + road);
  // tint with no shade: flat ground at h 0 = band 4 of 6 (t = 120 / 180), the mix of tint stops 0.5 and 1
  const flat = run(S.synth({ size: 640, drop: ['shade'] }));
  const want = [0, 1, 2].map(c => Math.round((hex(P.tint[1].color)[c] + hex(P.tint[2].color)[c]) / 2));
  const got = px(flat.grid, Math.floor(232.5 + 320), Math.floor(-187.5 + 240));
  ok(near(got, want, 12), 'tint band at h 0 = mid of tint stops 0.5 and 1 (+ paper grain): ' + got + ' vs ' + want);
  // relief: the same pixel with the shade layer differs only where the slope lights it
  ok(sha1(flat.grid.data) !== sha1(r640.grid.data), 'shade changes the picture (relief from four directions)');
}

// absent wants (paint 4.4 row staff)
{
  const a = run(S.synth({ drop: ['water.band', 'water.drown'] }));
  ok(a.gaps.includes('PAINT_NO_WATER_MASKS') && a.approx === true && a.stats.waterFrom === 'gtype', 'no water.band: water from gtype, gap PAINT_NO_WATER_MASKS, approx');
  const e = expect(s128);
  ok(a.stats.waterPx.drown === e.water[2], 'gtype 5 = drown, the same cells as the synth drown mask: ' + a.stats.waterPx.drown);
  const b = run(S.synth({ drop: ['objects'] }));
  ok(b.gaps.includes('PAINT_NO_OBJECTS') && b.stats.buildings === 0 && b.stats.walls === 0 && b.stats.roadPx.decal === 0, 'no objects: gap PAINT_NO_OBJECTS, no buildings, walls or decal roads');
  const c = run(S.synth({ drop: ['material'] }));
  ok(c.notes.some(n => n.code === 'PAINT_NO_MATERIAL') && c.gaps.length === 0, 'no material: note PAINT_NO_MATERIAL only');
  ok(c.stats.roadPx.road > 0 && c.stats.roadPx.country === 0, 'no material: roads from gtype 7 (no country road)');
  const d = run(S.synth({ drop: ['material', 'gtype'] }));
  ok(d.stats.roadPx.road === 0 && d.stats.roadPx.decal > 0, 'no material and no gtype: roads from decals only');
}

// no game branch: as64, mowas2 and goh give the same bytes for the same layers
{
  const h = ['as64', 'mowas2', 'goh'].map(t => sha1(run(S.synth({ target: t, size: 256 })).grid.data));
  ok(h[0] === h[1] && h[1] === h[2], 'as64 = mowas2 = goh for the same input');
  // GoH ground type 10 (forest) adds wood (paint 9, README 3.2)
  const gi = S.synth({ target: 'goh', size: 256 });
  const gt = gi.layers.gtype;
  for (let j = 0; j < 10; j++) for (let i = 40; i < 50; i++) gt.data[j * gt.w + i] = 10;
  const base = run(S.synth({ target: 'goh', size: 256 })).stats.woodPx, more = run(gi).stats.woodPx;
  ok(more > base, 'goh gtype 10 forest adds wood: ' + base + ' -> ' + more);
}

// seed and tick
{
  ok(sha1(run(S.synth({ size: 256 }), Object.assign(S.synthOpts(S.synth({ size: 256 })), { seed: 2 })).grid.data) !== sha1(run(S.synth({ size: 256 })).grid.data), 'another seed changes the grain');
  const calls = [];
  const inp = S.synth({ size: 256 });
  st.draw(inp, Object.assign(S.synthOpts(inp), { tick: (d, t) => calls.push([d, t]) }));
  const last = calls[calls.length - 1];
  ok(calls.length > 2 && last[0] === last[1] && calls.every((c, k) => c[0] <= c[1] && (!k || c[0] >= calls[k - 1][0])), 'tick rises and ends (total, total): ' + calls.length + ' calls');
  let n = 0;
  const r = throwsCode(() => st.draw(inp, Object.assign(S.synthOpts(inp), { tick: () => { if (++n > 2) throw new mv.MvError('MV_CANCELLED', 'x'); } })), 'MV_CANCELLED');
  ok(r === true, 'a tick that throws MV_CANCELLED ends draw: ' + r);
}

// tick spacing (paint 4.3: a tick at least every ~100 ms of work): size 2048, no two ticks more than 250 ms apart,
// the first tick within 250 ms of the call and none after the end (the gaps were 0.6-1.5 s: masks, height, water, grain)
// measured in a fresh node process (the heap of this test makes GC pauses that are not work), best of two runs
{
  const src = [
    "const S = require(" + JSON.stringify(path.join(PAINT, 'test', 'synth.js')) + "), st = require(" + JSON.stringify(path.join(STAFF, 'index.js')) + ");",
    "const inp = S.synth({ size: 2048 }); let last = process.hrtime.bigint(), worst = 0, at = null, n = 0;",
    "st.draw(inp, Object.assign(S.synthOpts(inp), { tick: (d, t) => { const now = process.hrtime.bigint(), ms = Number(now - last) / 1e6;",
    "  if (ms > worst) { worst = ms; at = d + '/' + t; } last = now; n++; } }));",
    "process.stdout.write(JSON.stringify({ worst, at, n }));",
  ].join('\n');
  let best = null;
  for (let r = 0; r < 2 && !(best && best.worst <= 250); r++) {
    const out = JSON.parse(require('../../../../lib/test/wait').execFileSync(process.execPath, ['-e', src], { encoding: 'utf8' }));
    if (!best || out.worst < best.worst) best = out;
  }
  ok(best.worst <= 250 && best.n > 100, 'size 2048: ticks at most 250 ms apart: worst ' + Math.round(best.worst) + ' ms before ' + best.at + ' (' + best.n + ' ticks)');
}

// no ground there (README R24): all heights nodata -> every pixel paper, no building, wall, stamp or numeral
{
  const inp = S.synth({ size: 640 });
  const h = inp.layers.height;
  h.data = new h.data.constructor(h.data.length).fill(h.nodata);
  const r = run(inp);
  const s = r.stats;
  ok(s.offGroundPx === 640 * 480 && s.buildings === 0 && s.walls === 0 && s.treeStamps === 0 && s.contourLabels === 0,
    'all-nodata height: whole sheet off-ground, 0 buildings, walls, stamps, labels: ' + JSON.stringify([s.offGroundPx, s.buildings, s.walls, s.treeStamps, s.contourLabels]));
  // off-ground pixels stay plain paper (+ grain) on the normal synth: the building shadow and contour ends do not reach them
  const P = palette.styles.staff, paper = hex(P.paper);
  const off = S.synth({ size: 640 });
  const ro = run(off);
  let bad = 0, offPx = 0;
  const f = off.frame, hh = off.layers.height;
  for (let j = 0; j < f.H; j++) for (let i = 0; i < f.W; i++) {
    const x = f.x0 + (i + 0.5) * f.sx, y = f.y0 + (j + 0.5) * f.sy;
    const ci = Math.floor((x - hh.ox) / hh.cell), cj = Math.floor((y - hh.oy) / hh.cell);
    if (ci < 0 || cj < 0 || ci >= hh.w || cj >= hh.h || hh.data[cj * hh.w + ci] !== hh.nodata) continue;
    offPx++;
    if (!near(px(ro.grid, i, j), paper, 12)) bad++;
  }
  ok(offPx > 0 && bad === 0, 'synth 640: every off-ground pixel is paper: ' + bad + ' of ' + offPx + ' are not');
}

// a NaN in an f32 height: MV_FAULT PAINT_DRAW_BAD at every size (it was RASTER_NAN, a plain Error, at full size only)
{
  for (const size of [128, 640]) {
    const inp = S.synth({ size });
    const h = inp.layers.height, sc = h.scale === undefined ? 1 : h.scale, of = h.offset || 0;
    const d = new Float32Array(h.data.length);
    for (let k = 0; k < d.length; k++) d[k] = h.data[k] === h.nodata ? NaN : h.data[k] * sc + of;
    inp.layers.height = Object.assign({}, h, { etype: 'f32', scale: 1, offset: 0, nodata: null, data: d });
    const r = throwsCode(() => run(inp), 'MV_FAULT', 'PAINT_DRAW_BAD');
    ok(r === true, 'planted: f32 height holding NaN at size ' + size + ' -> MV_FAULT PAINT_DRAW_BAD: ' + r);
  }
}

const DROWN_NOTE = [];   // [goh input with the airborne bit, goh input without]: checked through the shared draw below
// GoH water: a drown class with a negative depth (GoH 'airborne' -0.75 m, set on every water cell) is not a vehicle
// limit, so the no-prone and swim masks stay; the same input with that bit in AS2 form (no depthM meta) is unchanged
{
  const base = run(S.synth({ target: 'goh', size: 256 }));
  const inp = S.synth({ target: 'goh', size: 256 });
  const b = inp.layers['water.band'], dg = inp.layers['water.drown'];
  const dd = new Uint32Array(dg.data.length);
  for (let k = 0; k < dd.length; k++) dd[k] = dg.data[k] | (b.data[k] ? 2 : 0);
  inp.layers['water.drown'] = Object.assign({}, dg, { data: dd, meta: Object.assign({}, dg.meta, { bits: ['tank_medium', 'airborne'], depthM: [1.6, -0.75], sources: ['vanilla', 'stack'] }) });
  const r = run(inp);
  const w = r.stats.waterPx, w0 = base.stats.waterPx;
  ok(w.noProne > 0 && w.swim > 0 && JSON.stringify(w) === JSON.stringify(w0), 'goh airborne bit on every water cell: three masks kept ' + JSON.stringify(w) + ' = ' + JSON.stringify(w0));
  // the note naming the left-out classes is the shared draw's now (every style gets it), not the style's
  ok(!r.notes.some(n => n.code === 'PAINT_DROWN_VEHICLE_ONLY'), 'goh: staff itself adds no drown note (the shared draw does)');
  DROWN_NOTE.push(inp, S.synth({ target: 'goh', size: 256 }));
}

// contour numeral '2.5': the decimal point is a dot that survives its halo (canvas '.' alone is about 1 px)
{
  const C = require(path.join(PAINT, 'canvas.js')), D = require(path.join(STAFF, 'draw.js'));
  const fr = { W: 60, H: 30, sx: 1, sy: 1, x0: 0, y0: 0 };
  const ink = [40, 30, 20, 255], halo = [250, 245, 230, 255];
  // dark pixels within 1.5 px of the dot centre; screen py from the north edge, grid row j from the south (paint 4.1, 4.6)
  const count = (G, p) => {
    let n = 0;
    const cy = fr.H - p[1];
    for (let j = Math.floor(cy - 2); j <= cy + 2; j++) for (let i = Math.floor(p[0] - 2); i <= p[0] + 2; i++) {
      if (Math.hypot(i + 0.5 - p[0], j + 0.5 - cy) > 1.5) continue;
      if (G.data[(j * G.w + i) * 4] < 100) n++;
    }
    return n;
  };
  const G = C.create(fr, [200, 200, 200, 255]);
  const dots = D.label(C, G, '2.5', 30, 15, { size: 10, rgba: ink, halo, align: 'center' });
  ok(dots.length === 1 && count(G, dots[0]) >= 4, 'label 2.5: dot of at least 4 dark px at the point: ' + (dots[0] && count(G, dots[0])));
  // the dot is canvas.digits' own now (solid '.' glyph): label draws nothing more, the bytes equal digits alone
  const B = C.create(fr, [200, 200, 200, 255]);
  C.digits(B, '2.5', 30, 15, { size: 10, rgba: ink, halo, align: 'center' });
  ok(count(B, dots[0]) >= 4 && sha1(B.data) === sha1(G.data), 'label 2.5 = canvas.digits alone, dot ' + count(B, dots[0]) + ' px');
  ok(D.label(C, C.create(fr, null), '25', 30, 15, { size: 10, rgba: ink, align: 'center' }).length === 0, 'label 25: no dot');
}

// planted bad inputs
{
  const bad = S.synth();
  const h = bad.layers.height;
  bad.layers.height = { name: 'height', w: h.w, h: h.h, cell: h.cell, ox: h.ox, oy: h.oy, etype: 'rgba8', sample: 'lattice', scale: 1, offset: 0, nodata: null, meta: {}, data: new Uint8ClampedArray(h.w * h.h * 4) };
  // ruling R-d: a bad input handed from code is MV_FAULT PAINT_DRAW_BAD
  let r = throwsCode(() => run(bad), 'MV_FAULT', 'PAINT_DRAW_BAD');
  ok(r === true, 'planted: a height of etype rgba8 is refused (MV_FAULT PAINT_DRAW_BAD), no picture: ' + r);
  const none = S.synth({ drop: ['height'] });
  r = throwsCode(() => run(none), 'MV_NOT_FOUND', 'PAINT_NO_HEIGHT');
  ok(r === true, 'planted: no height -> MV_NOT_FOUND PAINT_NO_HEIGHT: ' + r);
  const fr = S.synth();
  fr.frame = Object.assign({}, fr.frame, { W: 0 });
  r = throwsCode(() => run(fr), 'MV_FAULT', 'PAINT_DRAW_BAD');
  ok(r === true, 'planted: a frame of width 0 is refused: ' + r);
  const short = S.synth();
  short.layers.gtype = Object.assign({}, short.layers.gtype, { data: short.layers.gtype.data.subarray(0, 10) });
  r = throwsCode(() => run(short), 'MV_FAULT', 'PAINT_DRAW_BAD');
  ok(r === true, 'planted: a gtype grid whose data is shorter than w x h is refused: ' + r);
  const np = S.synth();
  np.pal = {};
  r = throwsCode(() => run(np), 'MV_FAULT', 'PAINT_DRAW_BAD');
  ok(r === true, 'planted: a palette entry without paper, tint, relief is refused: ' + r);
}

// ---------------------------------------------------------------- fixture (README 10), both forms
const GOLD = path.join(__dirname, 'staff.golden.json');
const golden = fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD, 'utf8')) : null;
const now = { synth128: sha1(g.data), synth640: sha1(r640.grid.data) };

(async () => {
  // the shared draw names the left-out drown classes once (PAINT_DROWN_VEHICLE_ONLY), only where such a class is set
  {
    const [wi, wo] = DROWN_NOTE;
    const a = await PI.draw(wi, S.synthOpts(wi)), b = await PI.draw(wo, S.synthOpts(wo));
    ok(a.notes.filter(n => n.code === 'PAINT_DROWN_VEHICLE_ONLY' && /airborne/.test(n.text)).length === 1, 'goh through the shared draw: one note PAINT_DROWN_VEHICLE_ONLY names airborne');
    ok(!b.notes.some(n => n.code === 'PAINT_DROWN_VEHICLE_ONLY'), 'goh synth without the airborne bit: no drown note');
  }
  const fx = require(path.join(MV, 'test', 'fxmake'));
  const stats = {};
  for (const form of ['as2', 'goh']) {
    const m = fx.make(path.join(WD, 'fx-' + form), { form });
    const targets = form === 'as2' ? ['mowas2', 'as64'] : ['goh'];
    for (const t of targets) {
      let inp;
      try { inp = await PI.gather({ style: 'staff', target: t, game: m.gameDir, modDirs: m.modDirs, map: m.map, mode: 'battle_zones', size: 256, in: [] }); }
      catch (e) { ok(false, form + ' ' + t + ' gather: ' + (e.code || '') + ' ' + e.message); continue; }
      ok(inp.frame.W === 256 && inp.frame.H === 188 && inp.frame.sx === 4.6875 && Math.abs(inp.frame.sy - 880 / 188) < 1e-9, t + ' fixture frame 256 x 188 (draft 8.2)');
      const d = st.draw(inp, S.synthOpts(inp));
      const s = d.stats;
      ok(d.grid.w === 256 && d.grid.h === 188, t + ' fixture picture 256 x 188');
      ok(s.offGroundPx === 0, t + ' fixture: no off-ground pixel (no map.ply)');
      ok(s.waterPx.drown > 0 && s.waterFrom === 'water', t + ' fixture: the pond drowns (' + JSON.stringify(s.waterPx) + ')');
      ok(s.buildings === 1 && s.walls === 1, t + ' fixture: one building (fx_house), one wall (fx_wall)');
      ok(s.roadPx.road > 0 && s.roadPx.decal > 0, t + ' fixture: material road and the road decal: ' + JSON.stringify(s.roadPx));
      ok(s.woodPx > 0, t + ' fixture: wood around the trees');
      // known pixel: grid (192, 51) is the pond centre (draft 8.2 waterMask 3): water colour, blue over red
      const p = px(d.grid, 192, 51);
      ok(p[2] > p[0], t + ' fixture pixel (192, 51) is water blue: ' + p);
      ok(d.gaps.length === 0, t + ' fixture: no gaps ' + JSON.stringify(d.gaps));
      const big = Object.assign({}, inp, { frame: S.frameFor(inp.doc, { size: 1024 }) });
      const d2 = st.draw(big, S.synthOpts(big));
      ok(d2.stats.treeStamps === 3 && d2.stats.contourLines > 0, t + ' fixture 1024: 3 tree stamps, contours ' + d2.stats.contourLines);
      stats[t] = { s, sha: sha1(d.grid.data) };
      now['fixture256.' + t] = stats[t].sha;
    }
  }
  if (stats.mowas2 && stats.as64) ok(stats.mowas2.sha === stats.as64.sha, 'fixture as64 = mowas2 bytes');
  if (stats.mowas2 && stats.goh) {
    const a = stats.mowas2.s, b = stats.goh.s;
    const same = k => JSON.stringify(a[k]) === JSON.stringify(b[k]);
    ok(['buildings', 'walls', 'offGroundPx', 'heightMin', 'heightMax'].every(same), 'fixture: goh form gives the same object and height numbers as the AS2 form');
  }

  // goldens (README 9.2): sha1 of the data block; a missing golden file is a failure, --update-golden writes it
  if (UPDATE) {
    fs.writeFileSync(GOLD, JSON.stringify(now, null, 1) + '\n');
    console.log('golden written: ' + path.basename(GOLD));
  } else if (!golden) ok(false, 'no golden file ' + path.basename(GOLD) + ' (run once with --update-golden)');
  else for (const k of Object.keys(now)) ok(golden[k] === now[k], 'golden ' + k + ': ' + now[k] + ' vs ' + golden[k]);

  if (fail) { console.log(fail + ' failed, ' + pass + ' passed (scratch ' + WD + ')'); process.exit(1); }
  if (OWN) try { fs.rmSync(WD, { recursive: true, force: true }); } catch (e) { /* temp */ }
  console.log('PASS mapviz paint/staff (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz paint/staff: ' + (e && e.stack || e)); process.exit(1); });
