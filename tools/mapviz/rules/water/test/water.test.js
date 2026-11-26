// water test (MV-WAT): the water bands, drown masks, labels and checks (README 1.8, 4.4, 5.3). Analytic bowl, the fixture
// pond in both forms against README 10.4, per-mode W, a stack interaction file with water_level 0.5, labels (count,
// position, 4 m2 merge), each check on a planted case, the CLIs through mapviz.js (exit 0 and 3), determinism, seeded
// defects, height nodata past the ground mesh for i16 (-32768) and u16 (65535, map.net version 0); with real installs the water profile of mowas2, as64 and goh and the masks of one river map per game.
// usage: node tools/mapviz/rules/water/test/water.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-f6ca8cc5)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('../../../../lib/test/wait');   // wait.js spawnSync: limit at least 5 min, killed by it -> WAIT and one rerun with twice the limit

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-water-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz water: ' + what); } }
function eq(a, b, what) { ok(JSON.stringify(a) === JSON.stringify(b), what + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ': did not throw'); } catch (e) { ok(e && (e.code === code || (e.detail && e.detail.code === code)), what + ': threw ' + (e && e.code) + ' ' + (e && e.message)); }
}

const ROOT = path.resolve(__dirname, '../../..');
const MV = path.join(ROOT, 'mapviz.js');
const Wt = require('..');
const K = require(path.join(ROOT, 'lib/mapkit'));
const T = require(path.join(ROOT, 'lib/mapkit/tables'));
const gf = require(path.join(ROOT, 'lib/raster/gridfile'));
const fx = require(path.join(ROOT, 'test/fxmake'));

// ---------------------------------------------------------------- synthetic grids
// stored type and lattice height per cell; gtype = the load re-type with W (mapkit tables), last row/column kept.
// o.etype 'u16' (map.net version 0) stores the heights as Uint16Array; c.rt = the raw height the load re-type saw when it
// differs from the stored one (mapkit writes nodata after the re-type, so an off-ground point re-types from its raw value)
function synth(w, h, cell, W0, fn, o = {}) {
  const et = o.etype || 'i16';
  const n = w * h, ht = et === 'u16' ? new Uint16Array(n) : new Int16Array(n), st = new Uint8Array(n), ty = new Uint8Array(n), mat = new Uint8Array(n);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, c = fn(i, j);
    ht[k] = c.h; st[k] = c.t; mat[k] = c.m === undefined ? 1 : c.m;
    ty[k] = i === w - 1 || j === h - 1 ? c.t : T.retype(c.t, c.rt === undefined ? c.h : c.rt, W0);
  }
  const base = { w, h, cell, ox: 0, oy: 0, scale: 1, offset: 0, nodata: null };
  const names = { 0: 'undef', 1: 'ground', 4: 'shallow_water', 5: 'water', 6: 'deep_water', 9: 'road' };
  return {
    height: Object.assign({ name: 'height', etype: et, sample: 'lattice', meta: { unit: 'u', upm: 20 }, data: ht }, base),
    gtype: Object.assign({ name: 'gtype', etype: 'u8', sample: 'cell', meta: {}, data: ty }, base),
    gtypeStored: Object.assign({ name: 'gtype.stored', etype: 'u8', sample: 'cell', meta: {}, data: st }, base),
    material: Object.assign({ name: 'material', etype: 'u8', sample: 'cell', meta: { names }, data: mat }, base),
    W: W0, notes: [],
  };
}
const docOf = (W0, modes) => ({ key: 'test/synth', water: { level: W0, source: 'map', ocean: null }, modes: modes || [] });
const vanillaSrc = target => ({ target, has: () => false, read: () => null });

// ---------------------------------------------------------------- 1. analytic bowl
{
  // 64 x 64 cells of 10 u; bowl h = -150 + r^2 / 40 (u), r from the centre (320, 320) to the lattice point; stored 4 where
  // h < 0, else ground. W = 0. By hand: d' = W - h + 1; type 5 when d' > 100, 4 when > 14, 3 when > 0, else ground
  const W0 = 0, w = 64, cell = 10;
  const hAt = (i, j) => Math.round(-150 + ((i * cell - 320) ** 2 + (j * cell - 320) ** 2) / 40);
  const g = synth(w, w, cell, W0, (i, j) => { const z = hAt(i, j); return { h: z, t: z < 0 ? 4 : 1 }; });
  const prof = Wt.profile(vanillaSrc('mowas2'));
  const mk = Wt.masks(docOf(W0), g, prof);
  let want1 = 0, want2 = 0, wrongBand = 0, wrongDrown = 0;
  const bits = mk.drown.meta.bits, depths = mk.drown.meta.depthM;
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, z = hAt(i, j);
    let t = z < 0 ? 4 : 1;
    if (t === 4 && i < w - 1 && j < w - 1) { const d1 = W0 - z + 1; t = d1 > 100 ? 5 : d1 > 14 ? 4 : d1 > 0 ? 3 : 1; }
    const band = (t === 4 || t === 5) && z <= W0 ? 2 : t === 3 && z <= W0 ? 1 : 0;
    if (band >= 1) want1++;
    if (band === 2) want2++;
    if (mk.band.data[k] !== band) wrongBand++;
    let m = 0;
    // the engine compares floats: W - z > float(20 * float(depth))
    if (band) for (let b = 0; b < bits.length; b++) if (W0 - z > Math.fround(20 * Math.fround(depths[b]))) m |= 1 << b;
    if (mk.drown.data[k] !== (m >>> 0)) wrongDrown++;
  }
  eq(wrongBand, 0, 'bowl: band by hand');
  eq(wrongDrown, 0, 'bowl: drown by hand');
  eq(mk.counts.noProne, want1, 'bowl: no-prone area (cells)');
  eq(mk.counts.swim, want2, 'bowl: swim area (cells)');
  ok(want2 > 100 && want1 > want2, 'bowl: bands nested and non-empty (' + want1 + ' / ' + want2 + ')');
  // nested: every swim cell is a no-prone cell, every drowning cell is in a band
  let nested = true;
  for (let k = 0; k < w * w; k++) { if (mk.drown.data[k] && !mk.band.data[k]) nested = false; }
  ok(nested, 'bowl: drown only inside the bands');
  // drown boundaries by hand: depth exactly 24 u does not drown the 1.2 m classes (strict >), 25 u does
  const g2 = synth(4, 1, 10, 0, (i) => ({ h: [-24, -25, -32, -33][i], t: 4 }));
  const m2 = Wt.masks(docOf(0), g2, prof);
  const named = k => bits.filter((b, x) => (m2.drown.data[k] >>> x) & 1);
  eq(named(0), [], 'drown: 24 u (1.2 m) does not drown');
  eq(named(1), ['car', 'truck', 'moto', 'armored_car', 'tank_light', 'gun_unlinked'], 'drown: 25 u drowns the 1.2 m classes');
  eq(named(2).includes('tank_medium'), false, 'drown: 32 u (1.6 m) does not drown the medium tank');
  eq(m2.depth.data[1], 25, 'depth layer in u');
  eq(mk.depth.data[0], Wt.DEPTH_NODATA, 'depth nodata on dry cells');
  eq(bits, ['car', 'truck', 'moto', 'armored_car', 'tank_light', 'gun_unlinked', 'tank_medium', 'tank_heavy'], 'meta.bits: classes with a depth, in profile order');
  // meta.sources: where each bit's depth came from, in bit order (the source of the profile class)
  const srcById = {};
  for (const c of prof.classes) srcById[c.id] = c.source;
  eq(mk.drown.meta.sources, bits.map(b => srcById[b]), 'meta.sources: the profile source of each bit');
  ok(mk.drown.meta.sources.length === bits.length && mk.drown.meta.sources.every(s => s === 'stack' || s === 'vanilla'), 'meta.sources: one stack|vanilla per bit');
  // the GetGroundType dry test: a fractional W under the cell height reads dry though the type is water
  const g3 = synth(2, 1, 10, -9.5, () => ({ h: -9, t: 4 }));
  g3.gtype.data[0] = 3;
  eq(Wt.masks(docOf(-9.5), g3, prof).band.data[0], 0, 'dry test: type 3 at h -9 with W -9.5 is dry');
  // the dry test is strict: a water cell at h == W is wet (GetGroundType reads dry only above W)
  const g4 = synth(2, 1, 10, 0, () => ({ h: 0, t: 3 }));
  eq([g4.gtype.data[0], Wt.masks(docOf(0), g4, prof).band.data[0]], [3, Wt.BAND.NO_PRONE], 'dry test: type 3 at h == W is band 1');
  // water.depth on a water-typed cell above W: W - h (README 4.4), not nodata; band and drown stay empty
  const g5 = synth(2, 1, 10, -9.5, () => ({ h: -8, t: 4 }));
  g5.gtype.data[0] = 3;
  const m5 = Wt.masks(docOf(-9.5), g5, prof);
  eq([m5.depth.data[0], m5.band.data[0], m5.drown.data[0]], [-1, 0, 0], 'depth: water-typed cell above W has depth W - h (-1.5 u rounds to -1)');
}

// ---------------------------------------------------------------- 2. fixture pond, both forms (README 10.4)
const FX = {};
for (const form of ['as2', 'goh']) {
  const f = fx.make(path.join(W, 'fx-' + form), { form });
  FX[form] = f;
  const src = K.source({ target: f.target, game: f.gameDir });
  const doc = K.doc(src, f.map, {});
  const g = K.grids(src, f.map, {});
  const prof = Wt.profile(src);
  ok(prof.classes.every(c => c.source === 'vanilla'), form + ': fixture classes come from the vanilla table');
  ok(prof.notes.some(n => n.code === 'WATER_NO_INTERACTION'), form + ': profile says the stack has no interaction files');
  const mk = Wt.masks(doc, g, prof);
  eq(mk.W, -20, form + ': water.level -20');
  const s = form === 'goh' ? 2 : 1, bits = mk.drown.meta.bits;
  const at = (i, j) => (j * s) * g.gtype.w + i * s;
  const all = bits.slice();
  const d12 = prof.classes.filter(c => c.depthM !== null && c.depthM < 1.5).map(c => c.id);
  const rows = [[94, 5, 2, all], [101, 4, 2, all], [104, 4, 2, d12], [107, 3, 1, []], [111, 1, 0, []]];
  for (const [i, t, band, drown] of rows) {
    const k = at(i, 28);
    eq(g.gtype.data[k], t, form + ': cell (' + i + ',28) type');
    eq(mk.band.data[k], band, form + ': cell (' + i + ',28) band');
    eq(bits.filter((b, x) => (mk.drown.data[k] >>> x) & 1), drown, form + ': cell (' + i + ',28) drown');
  }
  eq(mk.depth.data[at(104, 28)], 30, form + ': depth 1.5 m at (104,28)');
  const C = Wt.checks(doc, g, mk);
  const pal = C.filter(c => c.code === 'PAINTED_ABOVE_LEVEL');
  eq(pal.length, 1, form + ': one PAINTED_ABOVE_LEVEL region (the outer ring)');
  if (pal[0]) {
    const x = (111 + 0.5) * 10 - 640, y = (28 + 0.5) * 10 - 480;
    ok(x >= pal[0].box[0] && x <= pal[0].box[2] && y >= pal[0].box[1] && y <= pal[0].box[3], form + ': cell (111,28) inside the check box');
  }
  const L = Wt.labels(doc, mk, prof);
  eq(L.map(l => l.band), [1, 2], form + ': one label per band region');
  FX[form].prof = prof;
}

// ---------------------------------------------------------------- 3. per-mode W
{
  const prof = Wt.profile(vanillaSrc('mowas2'));
  const doc = docOf(-20, [{ id: 'm1', water: -10 }, { id: 'm2', water: null }]);
  eq(Wt.wOf(doc, 'm1'), -10, 'per-mode W: mode water');
  eq(Wt.wOf(doc, 'm2'), -20, 'per-mode W: null falls back to the map');
  throwsCode(() => Wt.wOf(doc, 'zz'), 'MV_NOT_FOUND', 'per-mode W: unknown mode');
  const fn = (i) => ({ h: [-18, -30, 0][i], t: 4 });
  // two rows: the last row keeps its stored type, row 0 is re-typed. h -18 with W -10: load depth 9 -> type 3, band 1
  const gm = synth(3, 2, 10, -10, fn);
  const mk = Wt.masks(doc, gm, prof, 'm1');
  eq([gm.gtype.data[0], mk.band.data[0], mk.depth.data[0], mk.depth.data[1]], [3, 1, 8, 20], 'per-mode W: type, band and depth from the mode W');
  const gx = synth(3, 2, 10, -20, fn);
  const mx = Wt.masks(docOf(-20), gx, prof);
  eq([gx.gtype.data[0], mx.band.data[0], mx.depth.data[1]], [1, 0, 10], 'per-mode W: the map W (-20) leaves h -18 dry ground');
  throwsCode(() => Wt.masks(doc, gm, prof), 'WATER_W_MISMATCH', 'grids re-typed with another W are refused');
}

// ---------------------------------------------------------------- 4. stack interaction file: water_level 0.5
const ENTITY = '{entities\r\n\t{"vehicle"\r\n\t}\r\n\t{"emit_on_sink vehicle"\r\n\t\t{on "check_water_level" overload\r\n\t\t\t{if water_level 0.5\r\n\t\t\t\t{able "sinking" 1}\r\n\t\t\t}\r\n\t\t\telse\r\n\t\t\t{able "sinking" 0}\r\n\t\t}\r\n\t}\r\n' +
  '\t{"medium tank"\r\n\t\t{on "check_water_level" overload\r\n\t\t\t{if not water_level 3 {able "sinking" 0}}\r\n\t\t\t{if water_level 1.6\r\n\t\t\t\t{able "sinking" 1}\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n' +
  '\t{"hover craft"\r\n\t\t{on "check_water_level" overload\r\n\t\t\t{if water_level 2.5 {able "sinking" 1}}\r\n\t\t}\r\n\t}\r\n}\r\n';
{
  const f = FX.as2;
  const modDir = path.join(W, 'mods-wl', 'wl05');
  fs.mkdirSync(path.join(modDir, 'resource/set/interaction_entity'), { recursive: true });
  fs.writeFileSync(path.join(modDir, 'resource/set/interaction_entity/entity.set'), ENTITY);
  const src = K.source({ target: 'mowas2', game: f.gameDir, modDirs: [modDir] });
  const prof = Wt.profile(src);
  const by = id => prof.classes.find(c => c.id === id);
  eq([by('car').depthM, by('car').source], [0.5, 'stack'], 'stack: car drowns at 0.5 m from the mod file');
  eq(by('tank_medium').depthM, 1.6, 'stack: a negated water_level is skipped, the drowning one is read');
  eq([by('gun_unlinked').depthM, by('gun_unlinked').source], [0.5, 'stack'], 'stack: no cannon block, so the gun takes emit_on_sink vehicle');
  eq(by('entity') && by('entity').depthM, 2.5, 'stack: an extra drowning class takes its file stem as id');
  // a stack whose files reach only some classes: the others keep the vanilla value
  const only = '{entities\r\n\t{"heavy tank"\r\n\t\t{on "check_water_level" overload\r\n\t\t\t{if water_level 2.2 {able "sinking" 1}}\r\n\t\t}\r\n\t}\r\n}\r\n';
  const mem = { target: 'mowas2', has: k => k === Wt.ENTITY_SET, read: () => Buffer.from(only, 'latin1') };
  const p2 = Wt.profile(mem);
  const by2 = id => p2.classes.find(c => c.id === id);
  eq([by2('tank_heavy').depthM, by2('tank_heavy').source], [2.2, 'stack'], 'stack: heavy tank from the file');
  eq([by2('car').depthM, by2('car').source], [1.2, 'vanilla'], 'stack: a class the files do not reach keeps the vanilla value');
  const doc = K.doc(src, f.map, {});
  const g = K.grids(src, f.map, {});
  const mk = Wt.masks(doc, g, prof);
  const k = 28 * g.gtype.w + 107, bits = mk.drown.meta.bits;
  eq(g.gtype.data[k], 3, 'stack: (107,28) is type 3');
  const dn = bits.filter((b, x) => (mk.drown.data[k] >>> x) & 1);
  ok(['car', 'truck', 'moto', 'armored_car', 'tank_light'].every(id => !dn.includes(id)), 'stack: 0.4 m on type 3 does not drown at 0.5 m');
  // a deeper type-3 cell: W - h = 12 u = 0.6 m > 0.5 m
  const g2 = synth(2, 1, 10, -20, () => ({ h: -32, t: 3 }));
  const m2 = Wt.masks(docOf(-20), g2, prof);
  const dn2 = bits.filter((b, x) => (m2.drown.data[0] >>> x) & 1);
  eq(g2.gtype.data[0], 3, 'stack: synthetic cell is type 3');
  ok(['car', 'truck', 'moto', 'armored_car', 'tank_light'].every(id => dn2.includes(id)) && !dn2.includes('tank_medium'), 'stack: vehicles drown on type 3 at 0.6 m: ' + dn2.join(','));
}

// ---------------------------------------------------------------- 4b. else-if branches, negation, inherit chains
{
  const memSrc = text => ({ target: 'mowas2', has: k => k === Wt.ENTITY_SET, read: () => Buffer.from(text, 'latin1') });
  const wrap = body => '{entities\r\n' + body + '}\r\n';
  const SINK = '{able "sinking" 1}';
  // else-if: `if water_level 5 {sink} else water_level 0.9 {sink}` sinks at 0.9 (: else <cond> is a branch)
  const p1 = Wt.profile(memSrc(wrap('\t{"heavy tank"\r\n\t\t{on "check_water_level" overload\r\n\t\t\t{if water_level 5\r\n\t\t\t\t' + SINK +
    '\r\n\t\t\telse water_level 0.9\r\n\t\t\t\t' + SINK + '\r\n\t\t\telse\r\n\t\t\t\t{able "sinking" 0}\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n')));
  const h1 = p1.classes.find(c => c.id === 'tank_heavy');
  eq([h1.depthM, h1.source, h1.line], [0.9, 'stack', 6], 'else-if: the smaller sinking branch wins, its line kept');
  ok(p1.notes.some(n => n.code === 'WATER_ELSE_IF'), 'else-if: noted');
  // the GoH airborne shape: an extra class whose else branch sinks at -0.75 m
  const p1b = Wt.profile(memSrc(wrap('\t{"airborne"\r\n\t\t{on "check_water_level" overload\r\n\t\t\t{if water_level 5 ' + SINK + ' else water_level -0.75 ' + SINK + '}\r\n\t\t}\r\n\t}\r\n')));
  eq(p1b.classes.find(c => c.id === 'entity').depthM, -0.75, 'else-if: if water_level 5 {sink} else water_level -0.75 {sink} gives -0.75');
  // a negated condition whose branch sinks is ignored (fails below 0.3 m: not a drowning depth)
  const p2 = Wt.profile(memSrc(wrap('\t{"medium tank"\r\n\t\t{on "check_water_level" overload\r\n\t\t\t{if not water_level 0.3 ' + SINK + '}\r\n\t\t\t{if water_level 1.6 ' + SINK + '}\r\n\t\t}\r\n\t}\r\n')));
  eq(p2.classes.find(c => c.id === 'tank_medium').depthM, 1.6, 'negation: a sinking branch under not water_level is not a drowning depth');
  // inherit by default (no overload word): the lower handler runs first, the smaller depth sinks
  const low = '\t{"emit_on_sink vehicle"\r\n\t\t{on "check_water_level"\r\n\t\t\t{if water_level 1.2 ' + SINK + '}\r\n\t\t}\r\n\t}\r\n';
  const p3 = Wt.profile(memSrc(wrap(low + '\t{"medium tank"\r\n\t\t{on "check_water_level"\r\n\t\t\t{if water_level 1.6 ' + SINK + '}\r\n\t\t}\r\n\t}\r\n' +
    '\t{"heavy tank"\r\n\t\t{on "check_water_level" inherit\r\n\t\t\t{if water_level 1.8 ' + SINK + ' else {able "sinking" 0}}\r\n\t\t}\r\n\t}\r\n' +
    '\t{"light tank"\r\n\t\t{on "check_water_level" overload\r\n\t\t\t{if water_level 2 ' + SINK + '}\r\n\t\t}\r\n\t}\r\n')));
  const by3 = id => p3.classes.find(c => c.id === id);
  eq([by3('tank_medium').depthM, by3('tank_medium').source, by3('tank_medium').line, (by3('tank_medium').chain || []).length], [1.2, 'stack', 4, 2],
    'inherit: a handler with no keyword above emit_on_sink vehicle sinks at the lower 1.2 m');
  ok(p3.notes.some(n => n.code === 'WATER_INHERIT' && /tank_medium/.test(n.text) && /:8 > .*:3/.test(n.text)), 'inherit: WATER_INHERIT names both handler lines');
  eq(by3('tank_heavy').depthM, 1.8, 'inherit: an upper handler that resets sinking decides alone');
  eq(by3('tank_light').depthM, 2, 'overload: the lower handler does not run');
  eq(by3('car').depthM, 1.2, 'inherit: the lowest handler alone');
}

// ---------------------------------------------------------------- 5. labels: count, position, merge
{
  // cell 10 u = 0.25 m2. Region A: a 1-cell band-1 ring without its corners (12 cells = 3 m2) round a 3x3 band-2 core:
  // merges. Region B: band-1 only, 6x6 = 9 m2: own label. Region C: a 2-wide band-1 ring (12 m2 own) round band 2: two labels.
  const w = 40, h = 20;
  const corner = (i, j) => (i === 1 || i === 5) && (j === 1 || j === 5);
  const bandAt = (i, j) => {
    if (i >= 1 && i <= 5 && j >= 1 && j <= 5) return corner(i, j) ? 0 : (i >= 2 && i <= 4 && j >= 2 && j <= 4) ? 2 : 1;
    if (i >= 10 && i <= 15 && j >= 2 && j <= 7) return 1;
    if (i >= 20 && i <= 27 && j >= 2 && j <= 9) return (i >= 22 && i <= 25 && j >= 4 && j <= 7) ? 2 : 1;
    return 0;
  };
  const g = synth(w, h, 10, 0, (i, j) => { const b = bandAt(i, j); return b === 2 ? { h: -40, t: 4 } : b === 1 ? { h: -5, t: 3 } : { h: 10, t: 1 }; });
  const prof = Wt.profile(vanillaSrc('mowas2'));
  const mk = Wt.masks(docOf(0), g, prof);
  const L = Wt.labels(docOf(0), mk, prof);
  const b1 = L.filter(l => l.band === 1), b2 = L.filter(l => l.band === 2);
  eq([b1.length, b2.length], [2, 2], 'labels: 2 band-1 labels (B, C own) and 2 band-2 labels (A merged, C)');
  const A = b2.find(l => l.x < 100);
  ok(A && A.merged.includes(1), 'labels: A band-1 part under 4 m2 merged into its band-2 label');
  eq(A && A.area, 21 * 0.25, 'labels: merged area = band-2 + band-1 cells');
  eq(A && [A.depthMin, A.depthMax], [0.25, 2], 'labels: merged depth range in m');
  const C1 = b1.find(l => l.x > 200);
  eq(C1 && C1.area, (64 - 16) * 0.25, 'labels: own area of C band 1');
  for (const l of L) {
    const i = Math.floor(l.x / 10), j = Math.floor(l.y / 10), b = mk.band.data[j * w + i];
    ok(b === l.band, 'labels: label of band ' + l.band + ' at (' + l.x + ',' + l.y + ') lies in its band, found ' + b);
    ok(typeof l.area === 'number' && Array.isArray(l.drown) && !('text' in l) && !('name' in l), 'labels: data only, no words');
  }
  const Bl = b1.find(l => l.x > 90 && l.x < 170);
  ok(Bl && Bl.x > 100 && Bl.x < 160 && Bl.y > 20 && Bl.y < 80, 'labels: B label inside B');
  // determinism
  eq(JSON.stringify(Wt.labels(docOf(0), mk, prof)), JSON.stringify(L), 'labels: deterministic');
  // a band-2 region with no band-1 cells (type 4 pool straight in dry ground; a lone swim cell): one band-2 label, nothing
  // merged into it
  const pool = (w0, h0, inside) => {
    const gp = synth(w0, h0, 10, 0, (i, j) => inside(i, j) ? { h: -40, t: 4 } : { h: 10, t: 1 });
    for (let k = 0; k < w0 * h0; k++) if (gp.gtypeStored.data[k] === 4) gp.gtype.data[k] = 4;   // keep 4 at the pool edge
    const mp = Wt.masks(docOf(0), gp, prof);
    return Wt.labels(docOf(0), mp, prof);
  };
  const Lp = pool(8, 8, (i, j) => i >= 2 && i <= 5 && j >= 2 && j <= 5);
  eq(Lp.map(l => [l.band, l.merged, l.area]), [[2, [], 16 * 0.25]], 'labels: a 4x4 type-4 pool in dry ground: one band-2 label, merged []');
  const L1 = pool(3, 3, (i, j) => i === 1 && j === 1);
  eq(L1.map(l => [l.band, l.merged]), [[2, []]], 'labels: a lone swim cell: one band-2 label, merged []');
  // drown lists the classes with depthM > 0 only; a class at or below 0 m (GoH airborne -0.75 m, sinks on any wet cell)
  // goes to drownAlways, on every game the same way (as64 and mowas2 have no such class: drownAlways [])
  for (const target of ['mowas2', 'as64', 'goh']) {
    const pv = Wt.profile(vanillaSrc(target));
    const Lv = Wt.labels(docOf(0), Wt.masks(docOf(0), g, pv), pv);
    ok(Lv.length === 4 && Lv.every(l => Array.isArray(l.drownAlways) && l.drownAlways.length === 0), target + ': labels: drownAlways [] with no class at or below 0 m');
    ok(pv.classes.every(c => c.depthM === null || c.depthM > 0), target + ': vanilla classes all drown above 0 m or never');
    const pa = Object.assign({}, pv, { classes: pv.classes.concat([{ id: 'airborne', depthM: -0.75, source: 'stack', cls: 'airborne', file: 'x', line: 1 }]) });
    const mka = Wt.masks(docOf(0), g, pa);
    ok(mka.drown.meta.bits.includes('airborne'), target + ': the airborne bit stays in water.drown');
    const La = Wt.labels(docOf(0), mka, pa);
    eq(La.map(l => l.drown), Lv.map(l => l.drown), target + ': labels: airborne (-0.75 m) left out of drown');
    ok(La.every(l => JSON.stringify(l.drownAlways) === '["airborne"]'), target + ': labels: airborne listed in drownAlways on every label (merged one too)');
    // planted: the old rule (every bit in drown) would list airborne on every label
    ok(!La.some(l => l.drown.includes('airborne')), target + ': planted check: no label drown carries airborne');
  }
}

// ---------------------------------------------------------------- 6. checks, each planted
{
  const prof = Wt.profile(vanillaSrc('mowas2'));
  // row of 10 cells, W 0: 0 type 4 at depth 18 u (0.9 m, swim, nobody drowns) -> BLOCKED_NOT_DEADLY;
  // 2 material 'water' on dry ground below W -> WET_LOOK_DRY_PLAY; 4 swamp -> SWAMP; 6 stored 3 at h 5 -> re-typed ground,
  // PAINTED_ABOVE_LEVEL; the rest ground at h 10
  const g = synth(10, 3, 10, 0, (i) => {
    if (i === 0) return { h: -18, t: 4 };
    if (i === 2) return { h: -4, t: 1, m: 5 };
    if (i === 4) return { h: 3, t: 6 };
    if (i === 6) return { h: 5, t: 3 };
    return { h: 10, t: 1 };
  });
  const mk = Wt.masks(docOf(0), g, prof);
  const C = Wt.checks(docOf(0), g, mk);
  const by = c => C.filter(x => x.code === c);
  const bits = mk.drown.meta.bits;
  for (const [code, i] of [['BLOCKED_NOT_DEADLY', 0], ['WET_LOOK_DRY_PLAY', 2], ['SWAMP', 4], ['PAINTED_ABOVE_LEVEL', 6]]) {
    const r = by(code);
    // BLOCKED_NOT_DEADLY is per mover: one item per drown class (nobody drowns at 0.9 m)
    eq(r.length, code === 'BLOCKED_NOT_DEADLY' ? bits.length : 1, 'checks: ' + code + ' regions');
    if (!r[0]) continue;
    eq(r[0].cells, 3, 'checks: ' + code + ' cells');
    eq(r[0].box, [i * 10, 0, i * 10 + 10, 30], 'checks: ' + code + ' world box');
    ok(r[0].kind === 'check' && r[0].x === i * 10 + 5 && typeof r[0].region === 'number', 'checks: ' + code + ' item fields');
    if (code === 'BLOCKED_NOT_DEADLY') eq(r.map(x => x.cls), bits, 'checks: BLOCKED_NOT_DEADLY names each class, in bit order');
    else ok(!('cls' in r[0]), 'checks: ' + code + ' has no class');
  }
  // type 4 at 1.5 m: the 1.2 m classes drown, the medium and heavy tanks are blocked and do not (survey water.md:83)
  const g15 = synth(4, 2, 10, 0, () => ({ h: -30, t: 4 }));
  const m15 = Wt.masks(docOf(0), g15, prof);
  eq(Wt.checks(docOf(0), g15, m15, ['BLOCKED_NOT_DEADLY']).map(x => x.cls), ['tank_medium', 'tank_heavy'], 'checks: BLOCKED_NOT_DEADLY at 1.5 m only for the tanks that survive');
  eq(Wt.checks(docOf(0), g15, m15, ['SWAMP']).length, 0, 'checks: no swamp, no item');
  eq(Wt.checks(docOf(0), g, mk, ['SWAMP']).map(c => c.code), ['SWAMP'], 'checks: which');
  throwsCode(() => Wt.checks(docOf(0), g, mk, ['NOPE']), 'WATER_CHECK', 'checks: unknown code refused');
  // o.tick(done, total) is called during masks, labels and checks: rising, done <= total, last (total, total)
  let ticks = 0;
  const seen = { masks: [], labels: [], checks: [] };
  const oOf = k => ({ tick: (d, t) => { ticks++; seen[k].push([d, t]); } });
  const mt = Wt.masks(docOf(0), g, prof, undefined, oOf('masks'));
  Wt.labels(docOf(0), mt, prof, oOf('labels'));
  Wt.checks(docOf(0), g, mt, undefined, oOf('checks'));
  ok(ticks >= 5, 'tick: called during the work (' + ticks + ')');
  for (const k of Object.keys(seen)) {
    const c = seen[k], L = c[c.length - 1];
    ok(c.length >= 2 && L && L[0] === L[1] && c.every(([d, t], x) => d >= 0 && d <= t && t === L[1] && (x === 0 || d >= c[x - 1][0])),
      'tick: ' + k + ' rises to (total, total) (' + JSON.stringify(c) + ')');
  }
  // the CLI cancel: a throw from the hook ends the call
  let threw = null;
  try { Wt.labels(docOf(0), mt, prof, { tick: () => { throw Object.assign(new Error('stop'), { code: 'MV_CANCELLED' }); } }); } catch (e) { threw = e.code; }
  eq(threw, 'MV_CANCELLED', 'tick: a throwing hook ends labels');
}

// ---------------------------------------------------------------- 6b. height nodata (R16): past the ground mesh, no water
{
  // 30 x 20 cells of 10 u, W 0. Off ground (height -32768): the outer ring and the block i 6..10, j 6..10. The ring is
  // painted water look on dry ground (material 5) with a swamp stretch (type 6) on its south row; the block is stored
  // type 4. A real pond (type 4, h -40) at i 16..23, j 6..12. Read as heights, the off cells would be 1638 m deep water,
  // a swim label and WET_LOOK_DRY_PLAY / SWAMP items.
  const ND = -32768, w = 30, h = 20;
  const ring = (i, j) => i === 0 || j === 0 || i === w - 1 || j === h - 1;
  const block = (i, j) => i >= 6 && i <= 10 && j >= 6 && j <= 10;
  const pond = (i, j) => i >= 16 && i <= 23 && j >= 6 && j <= 12;
  const off = (i, j) => ring(i, j) || block(i, j);
  const cellOf = (i, j) => ring(i, j) ? (j === 0 && i > 2 && i < 20 ? { h: ND, t: 6 } : { h: ND, t: 1, m: 5 })
    : block(i, j) ? { h: ND, t: 4 } : pond(i, j) ? { h: -40, t: 4 } : { h: 10, t: 1 };
  const prof = Wt.profile(vanillaSrc('mowas2'));
  const mkGrids = nd => { const g = synth(w, h, 10, 0, cellOf); g.height.nodata = nd; return g; };
  const g = mkGrids(ND), gBad = mkGrids(null);
  const mk = Wt.masks(docOf(0), g, prof), mkBad = Wt.masks(docOf(0), gBad, prof);
  let offWater = 0, offBad = 0, pondOk = 0, pondN = 0, deep = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, t = g.gtype.data[k];
    if (off(i, j)) {
      if (t >= 3 && t <= 5) offWater++;
      if (mk.band.data[k] !== 0 || mk.drown.data[k] !== 0 || mk.depth.data[k] !== Wt.DEPTH_NODATA) offBad++;
    } else if (pond(i, j)) { pondN++; if (mk.band.data[k] === mkBad.band.data[k] && mk.depth.data[k] === 40) pondOk++; }
    if (mk.depth.data[k] !== Wt.DEPTH_NODATA && mk.depth.data[k] > 2000) deep++;
  }
  eq(offBad, 0, 'nodata: band 0, drown 0, depth nodata on every off-ground cell');
  eq(deep, 0, 'nodata: no depth above 100 m');
  ok(offWater >= 25, 'nodata: the block is water-typed (' + offWater + ')');
  eq(mk.counts.offGround, offWater, 'nodata: counts.offGround = the water-typed off-ground cells');
  eq(mk.band.meta.offGround, offWater, 'nodata: water.band meta.offGround');
  eq(pondOk, pondN, 'nodata: the real pond keeps its bands and depth');
  // the planted defect: the same heights with no nodata in the header read as a 1638 m deep swim
  let badDeep = 0;
  for (let k = 0; k < w * h; k++) if (mkBad.band.data[k] === Wt.BAND.SWIM && gBad.height.data[k] === ND) badDeep++;
  ok(badDeep >= 25, 'nodata planted: without the header nodata the off cells swim (' + badDeep + ')');
  ok(!('offGround' in mkBad.counts) || mkBad.counts.offGround === 0, 'nodata planted: nothing counted off ground');
  // labels: only the pond; the planted grid labels the block too
  const L = Wt.labels(docOf(0), mk, prof), LBad = Wt.labels(docOf(0), mkBad, prof);
  ok(L.length >= 1 && L.every(l => { const i = Math.floor(l.x / 10), j = Math.floor(l.y / 10); return pond(i, j); }), 'nodata: every label lies in the pond (' + L.length + ')');
  ok(LBad.some(l => { const i = Math.floor(l.x / 10), j = Math.floor(l.y / 10); return off(i, j); }), 'nodata planted: a label on the off-ground block');
  // checks: no item made of off-ground cells only
  const C = Wt.checks(docOf(0), g, mk), CBad = Wt.checks(docOf(0), gBad, mkBad);
  const onlyOff = c => { const [x0, y0, x1, y1] = c.box; for (let j = y0 / 10; j < y1 / 10; j++) for (let i = x0 / 10; i < x1 / 10; i++) if (!off(i, j)) return false; return true; };
  eq(C.filter(onlyOff).map(c => c.code), [], 'nodata: no check item made only of off-ground cells');
  ok(CBad.some(c => c.code === 'WET_LOOK_DRY_PLAY') && CBad.some(c => c.code === 'SWAMP'), 'nodata planted: the off ring gives WET_LOOK_DRY_PLAY and SWAMP items');
}

// ---------------------------------------------------------------- 6c. u16 height nodata (map.net version 0): 65535
{
  // the 6b layout on a u16 height grid as mapkit makes it for a version 0 map.net: scale 1, offset 0, the raw value is the
  // height in u, so every height is offset by +1000 and W is 1000 (the pond 40 u under W, the ground 10 u over it). Off
  // ground: 65535 (the header nodata); the load re-type saw raw 0 there (1001 u under W), so the block is deep water as in
  // 6b. Planted: with no nodata in the header, 65535 reads as a 3277 m hill: the block is water above W (dryWater, depth
  // -32767 instead of nodata) and gives PAINTED_ABOVE_LEVEL items, the ring a SWAMP item.
  const ND = 65535, OFF = 1000, w = 30, h = 20;
  const ring = (i, j) => i === 0 || j === 0 || i === w - 1 || j === h - 1;
  const block = (i, j) => i >= 6 && i <= 10 && j >= 6 && j <= 10;
  const pond = (i, j) => i >= 16 && i <= 23 && j >= 6 && j <= 12;
  const off = (i, j) => ring(i, j) || block(i, j);
  const cellOf = (i, j) => ring(i, j) ? (j === 0 && i > 2 && i < 20 ? { h: ND, rt: 0, t: 6 } : { h: ND, rt: 0, t: 1, m: 5 })
    : block(i, j) ? { h: ND, rt: 0, t: 4 } : pond(i, j) ? { h: OFF - 40, t: 4 } : { h: OFF + 10, t: 1 };
  const prof = Wt.profile(vanillaSrc('mowas2'));
  const mkGrids = nd => { const g = synth(w, h, 10, OFF, cellOf, { etype: 'u16' }); g.height.nodata = nd; return g; };
  const g = mkGrids(ND), gBad = mkGrids(null);
  ok(g.height.etype === 'u16' && g.height.data instanceof Uint16Array && g.height.data[0] === ND, 'u16 nodata: the height grid is u16 with 65535 on the rim');
  const mk = Wt.masks(docOf(OFF), g, prof), mkBad = Wt.masks(docOf(OFF), gBad, prof);
  let offWater = 0, offBad = 0, pondOk = 0, pondN = 0, deep = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, t = g.gtype.data[k];
    if (off(i, j)) {
      if (t >= 3 && t <= 5) offWater++;
      if (mk.band.data[k] !== 0 || mk.drown.data[k] !== 0 || mk.depth.data[k] !== Wt.DEPTH_NODATA) offBad++;
    } else if (pond(i, j)) { pondN++; if (mk.band.data[k] === mkBad.band.data[k] && mk.band.data[k] !== 0 && mk.depth.data[k] === 40) pondOk++; }
    if (mk.depth.data[k] !== Wt.DEPTH_NODATA && mk.depth.data[k] > 2000) deep++;
  }
  eq(offBad, 0, 'u16 nodata: band 0, drown 0, depth nodata on every off-ground cell');
  eq(deep, 0, 'u16 nodata: no depth above 100 m');
  ok(offWater >= 25, 'u16 nodata: the block is water-typed (' + offWater + ')');
  eq(mk.counts.offGround, offWater, 'u16 nodata: counts.offGround = the water-typed off-ground cells');
  eq(mk.band.meta.offGround, offWater, 'u16 nodata: water.band meta.offGround');
  ok(pondN > 0, 'u16 nodata: the pond has cells (' + pondN + ')');
  eq(pondOk, pondN, 'u16 nodata: the real pond keeps its bands and depth');
  eq(mk.counts.dryWater, 0, 'u16 nodata: no water-typed cell reads dry');
  // the planted defect: no nodata in the header, 65535 read as a height
  let badDry = 0;
  const isWaterT = t => t >= 3 && t <= 5;
  for (let k = 0; k < w * h; k++) if (gBad.height.data[k] === ND && isWaterT(gBad.gtype.data[k]) && mkBad.depth.data[k] === -32767) badDry++;
  ok(badDry >= 25, 'u16 nodata planted: without the header nodata the off water cells read as a hill above W (' + badDry + ')');
  ok(mkBad.counts.dryWater >= 25, 'u16 nodata planted: counted as dry water (' + mkBad.counts.dryWater + ')');
  ok(!('offGround' in mkBad.counts) || mkBad.counts.offGround === 0, 'u16 nodata planted: nothing counted off ground');
  // labels: only the pond
  const L = Wt.labels(docOf(OFF), mk, prof);
  ok(L.length >= 1 && L.every(l => { const i = Math.floor(l.x / 10), j = Math.floor(l.y / 10); return pond(i, j); }), 'u16 nodata: every label lies in the pond (' + L.length + ')');
  // checks: no item made of off-ground cells only; the planted grid gives PAINTED_ABOVE_LEVEL and SWAMP items there
  const C = Wt.checks(docOf(OFF), g, mk), CBad = Wt.checks(docOf(OFF), gBad, mkBad);
  const onlyOff = c => { const [x0, y0, x1, y1] = c.box; for (let j = y0 / 10; j < y1 / 10; j++) for (let i = x0 / 10; i < x1 / 10; i++) if (!off(i, j)) return false; return true; };
  eq(C.filter(onlyOff).map(c => c.code), [], 'u16 nodata: no check item made only of off-ground cells');
  const badCodes = CBad.filter(onlyOff).map(c => c.code);
  ok(badCodes.includes('PAINTED_ABOVE_LEVEL') && badCodes.includes('SWAMP'), 'u16 nodata planted: the off cells give PAINTED_ABOVE_LEVEL and SWAMP items (' + badCodes.join(' ') + ')');
}

// ---------------------------------------------------------------- 7. seeded defects
{
  const f = FX.as2;
  const modDir = path.join(W, 'mods-bad', 'bad');
  fs.mkdirSync(path.join(modDir, 'resource/set/interaction_entity'), { recursive: true });
  fs.writeFileSync(path.join(modDir, 'resource/set/interaction_entity/entity.set'),
    '{entities\r\n\t{"emit_on_sink vehicle"\r\n\t\t{on "check_water_level" overload\r\n\t\t\t{if water_level {able "sinking" 1}}\r\n\t\t}\r\n\t}\r\n}\r\n');
  const src = K.source({ target: 'mowas2', game: f.gameDir, modDirs: [modDir] });
  const prof = Wt.profile(src);
  ok(prof.notes.some(n => n.code === 'WATER_LEVEL_NO_NUMBER'), 'defect: water_level without a number is noted');
  const car = prof.classes.find(c => c.id === 'car');
  eq([car.depthM, car.source], [1.2, 'vanilla'], 'defect: the class falls back to vanilla');
  const g = synth(4, 4, 10, 0, () => ({ h: -30, t: 4 }));
  const bad1 = Object.assign({}, g, { gtype: Object.assign({}, g.gtype, { sample: 'lattice' }) });
  throwsCode(() => Wt.masks(docOf(0), bad1, prof), 'WATER_GRID', 'defect: gtype with lattice samples refused');
  const bad2 = Object.assign({}, g, { height: Object.assign({}, g.height, { sample: 'cell' }) });
  throwsCode(() => Wt.masks(docOf(0), bad2, prof), 'WATER_GRID', 'defect: height with cell samples refused');
  const bad3 = Object.assign({}, g, { gtype: Object.assign({}, g.gtype, { etype: 'i16', data: new Int16Array(16) }) });
  throwsCode(() => Wt.masks(docOf(0), bad3, prof), 'WATER_GRID', 'defect: gtype of the wrong etype refused');
}

// ---------------------------------------------------------------- 8. CLIs and determinism
function cli(args) {
  const r = spawnSync(process.execPath, [MV].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { MAPVIZ_NO_GAME: '1' }) });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
{
  const f = FX.as2;
  const common = ['--target', 'mowas2', '--game', f.gameDir];
  const o1 = path.join(W, 'cli-w1'), o2 = path.join(W, 'cli-w2');
  const r1 = cli(['water', 'masks'].concat(common, ['--map', f.map, '--out', o1, '--json']));
  eq(r1.code, 0, 'cli water masks exit 0 (' + r1.err.trim() + ')');
  let sum = null;
  try { sum = JSON.parse(r1.out); } catch (e) { sum = null; }
  ok(sum && sum.W === -20 && sum.labels === 2, 'cli water masks: JSON summary');
  const files = ['water.band.mvg', 'water.drown.mvg', 'water.depth.mvg', 'water.labels.json', 'water.checks.json', 'reads.json'];
  ok(files.every(x => fs.existsSync(path.join(o1, x))), 'cli water masks: every product written');
  const band = gf.read(path.join(o1, 'water.band.mvg')), drown = gf.read(path.join(o1, 'water.drown.mvg')), depth = gf.read(path.join(o1, 'water.depth.mvg'));
  ok(band.etype === 'u8' && band.sample === 'cell' && drown.etype === 'u32' && Array.isArray(drown.meta.bits) && depth.etype === 'i16' && depth.nodata === -32768, 'cli: layer kinds README 4.4');
  const head = gf.decodeHeader(fs.readFileSync(path.join(o1, 'water.drown.mvg')));
  ok(head && (head.flags & gf.FLAGS.BITS), 'cli: water.drown has the BITS flag');
  const lab = JSON.parse(fs.readFileSync(path.join(o1, 'water.labels.json'), 'utf8'));
  ok(lab.v === 1 && lab.kind === 'vector' && lab.name === 'water.labels' && lab.items.every(x => x.kind === 'waterLabel'), 'cli: labels vector file');
  const r2 = cli(['water', 'masks'].concat(common, ['--map', f.map, '--out', o2, '--json']));
  eq(r2.code, 0, 'cli water masks second run');
  ok(files.every(x => fs.readFileSync(path.join(o1, x)).equals(fs.readFileSync(path.join(o2, x)))), 'determinism: same bytes on a second run');
  // --in: the products of mapkit doc and grids
  const gin = path.join(W, 'cli-in');
  eq(cli(['mapkit', 'grids'].concat(common, ['--map', f.map, '--out', gin])).code, 0, 'mapkit grids for --in');
  eq(cli(['mapkit', 'doc'].concat(common, ['--map', f.map, '--out', gin])).code, 0, 'mapkit doc for --in');
  const o3 = path.join(W, 'cli-w3');
  eq(cli(['water', 'masks'].concat(common, ['--map', f.map, '--in', gin, '--out', o3])).code, 0, 'cli water masks with --in');
  ok(['water.band.mvg', 'water.drown.mvg', 'water.labels.json'].every(x => fs.readFileSync(path.join(o1, x)).equals(fs.readFileSync(path.join(o3, x)))), 'cli: --in gives the same products');
  const rp = cli(['water', 'profile'].concat(common));
  eq(rp.code, 0, 'cli water profile exit 0');
  ok(/tank_medium\t1\.6 m\tvanilla/.test(rp.out), 'cli water profile: text lists the classes');
  const rj = cli(['water', 'profile'].concat(common, ['--json']));
  let pj = null;
  try { pj = JSON.parse(rj.out); } catch (e) { pj = null; }
  ok(pj && pj.classes.length === 9 && pj.classes.every(c => c.source === 'vanilla'), 'cli water profile --json');
  const r404 = cli(['water', 'masks'].concat(common, ['--map', 'multi/no_such_map', '--out', path.join(W, 'cli-w4'), '--json']));
  eq(r404.code, 3, 'cli water masks: unknown map exit 3');
  ok(/MV_NOT_FOUND/.test(r404.out), 'cli: --json error on stdout');
  eq(cli(['water', 'masks'].concat(common, ['--map', f.map, '--mode', 'zz', '--out', path.join(W, 'cli-w5')])).code, 3, 'cli water masks: unknown mode exit 3');
  eq(cli(['water', 'masks'].concat(common, ['--map', f.map])).code, 2, 'cli water masks: no --out exit 2');
}

// ---------------------------------------------------------------- 9. real installs
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
const REAL_MAP = { mowas2: 'multi/3v3_river_bank', as64: 'multi/3v3_river_bank', goh: 'multi/1v1_forssa_dam' };
const WANT = { tank_medium: 1.6, tank_heavy: 1.8, car: 1.2, amphibious: null };
if (process.env.MAPVIZ_NO_GAME === '1') console.log('skip real installs: MAPVIZ_NO_GAME=1');
else {
  const I = installs();
  for (const target of ['mowas2', 'as64', 'goh']) {
    if (!I[target]) { console.log('skip ' + target + ': no ' + target + ' install'); continue; }
    const t0 = Date.now();
    const src = K.source({ target, game: I[target] });
    const prof = Wt.profile(src);
    for (const id of Object.keys(WANT)) {
      const c = prof.classes.find(x => x.id === id);
      ok(c && c.depthM === WANT[id] && c.source === 'stack', target + ': profile ' + id + ' = ' + WANT[id] + ' from the stack, got ' + JSON.stringify(c));
    }
    eq(prof.classes.find(x => x.id === 'gun_unlinked').depthM, target === 'goh' ? 1.3 : 1.2, target + ': gun_unlinked');
    if (target === 'goh') eq([prof.classes.find(x => x.id === 'gun_goh_a').depthM, prof.classes.find(x => x.id === 'gun_goh_b').depthM], [1.3, 1], 'goh: gun_goh_a / gun_goh_b');
    // airborne.inc: `if water_level 5 {sink} else water_level -0.75 {sink}`: the else branch sinks on every wet cell
    if (target === 'goh') { const a = prof.classes.find(x => x.id === 'airborne'); eq(a && [a.depthM, a.source], [-0.75, 'stack'], 'goh: airborne from its else-if branch'); }
    const key = REAL_MAP[target];
    const doc = K.doc(src, key, {});
    const g = K.grids(src, key, {});
    const mk = Wt.masks(doc, g, prof);
    const L = Wt.labels(doc, mk, prof);
    Wt.checks(doc, g, mk);
    // water is the re-typed type, never "height below W" alone: count dry cells below W that the masks leave dry
    // height nodata (R16): past the ground mesh, never a depth; the water-typed ones are counted in counts.offGround
    const hnd = g.height.nodata;
    let below = 0, wrong = 0, deep = 0, offWater = 0, offWet = 0;
    for (let k = 0; k < mk.band.data.length; k++) {
      const z = g.height.data[k], t = g.gtype.data[k];
      const isOff = hnd !== null && hnd !== undefined && z === hnd;
      if (isOff) { if (t >= 3 && t <= 5) offWater++; if (mk.band.data[k] || mk.drown.data[k] || mk.depth.data[k] !== Wt.DEPTH_NODATA) offWet++; }
      if (mk.depth.data[k] !== Wt.DEPTH_NODATA && mk.depth.data[k] > 2000) deep++;
      if (!isOff && z < mk.W && !(t >= 3 && t <= 5)) { below++; if (mk.band.data[k]) wrong++; }
      if (mk.band.data[k] && !(t >= 3 && t <= 5)) wrong++;
    }
    eq(wrong, 0, target + ': no band outside water-typed cells');
    eq(deep, 0, target + ': no water cell deeper than 100 m');
    eq(offWet, 0, target + ': no band, drown or depth on an off-ground cell');
    eq(mk.counts.offGround || 0, offWater, target + ': the water-typed off-ground cells are counted (' + offWater + ')');
    if (target !== 'goh') eq(offWater, 62, target + ': ' + key + ' has 62 water-typed cells past the ground mesh');
    ok(mk.counts.noProne > 0 && L.length > 0, target + ': ' + key + ' has water and labels');
    // label drown = classes above 0 m only; GoH airborne (-0.75 m) sits in drownAlways, as64 and mowas2 have none there
    const low = prof.classes.filter(c => c.depthM !== null && c.depthM <= 0).map(c => c.id);
    ok(L.every(l => Array.isArray(l.drownAlways) && !l.drown.some(id => low.includes(id)) && l.drownAlways.every(id => low.includes(id))), target + ': label drown leaves out classes at or below 0 m (' + low.join(',') + ')');
    if (target === 'goh') ok(low.includes('airborne') && L.every(l => l.drownAlways.includes('airborne')), 'goh: airborne in drownAlways on every label');
    else eq(low, [], target + ': no class at or below 0 m');
    const m2 =g.gtype.cell * g.gtype.cell / 400;
    console.log('real ' + target + ' ' + key + ': noProne ' + (mk.counts.noProne * m2) + ' m2, swim ' + (mk.counts.swim * m2) + ' m2, dry below W ' + (below * m2) + ' m2, labels ' + L.length + ', ' + (Date.now() - t0) + ' ms');
  }
}

if (fail) { console.log('FAIL mapviz water: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('PASS mapviz water (' + pass + ')');
// a temp folder this run made (no folder given) goes when every check passed; a failed run keeps it to look at
if (!process.argv[2]) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* the OS clears its temp folder */ } }
