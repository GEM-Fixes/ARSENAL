// mapkit test (MV-KIT): the fixture in both forms against README 10.4 (cells, zones incl. the GoH poly, frontline sp1 via
// fa1, W -20, the mvfx mod-dir shadow, ridge heights, pond types before and after the re-type, road rows), the doc against
// fxanswers.json field by field, grids written and read back through gridfile, the CLI through mapviz.js (list, doc,
// grids, cell, --json, exit 0 and 3), the land patch maths on a synthetic model, a synthetic ground mesh (map.ply: nodata
// past it, the rim rule, an unreadable map.ply), progress ticks, structure links on doc rows, and seeded defects (a truncated map.net,
// a .mi of an unknown mode, a flag with no zone key, a GoH flag whose poly is gone, a map folder with no map.net).
// usage: node tools/mapviz/lib/mapkit/test/mapkit.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-f952f417)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-mapkit-')));
fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = process.env.ARSENAL_CACHE || path.join(W, 'cache');

const ROOT = path.resolve(__dirname, '..', '..', '..');   // tools/mapviz
const fx = require(path.join(ROOT, 'test', 'fxmake'));
const ANS = require(path.join(ROOT, 'test', 'fxanswers.json'));
const K = require('..');
const P = require('../patches'), T = require('../tables');
const GF = require('../../raster/gridfile');
const mv = require(path.join(ROOT, 'mapviz'));

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz mapkit: ' + what); } }
function eq(a, b, what) { ok(JSON.stringify(a) === JSON.stringify(b), what + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function throwsMv(fn, code, what) {
  try { fn(); ok(false, what + ': no error (want ' + code + ')'); return null; }
  catch (e) { ok(e instanceof mv.MvError && e.code === code, what + ': ' + (e && e.code) + ' ' + (e && e.message) + ', want ' + code); return e; }
}
// field-by-field: every differing path is named
function diff(got, want, p, out) {
  if (JSON.stringify(got) === JSON.stringify(want)) return out;
  if (got && want && typeof got === 'object' && typeof want === 'object') {
    for (const k of new Set(Object.keys(got).concat(Object.keys(want)))) diff(got[k], want[k], p + '.' + k, out);
  } else out.push(p + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
  return out;
}
function copyDir(a, b) { fs.cpSync(a, b, { recursive: true }); }

const FORMS = {};
for (const form of ['as2', 'goh']) FORMS[form] = fx.make(path.join(W, 'fx-' + form), { form });

// ---------------------------------------------------------------- 1. both forms: list, doc, 10.4 answers, grids
for (const form of ['as2', 'goh']) {
  const F = FORMS[form], tag = form + ': ';
  const src = K.source({ target: F.target, game: F.gameDir });
  ok(src.exe === mv.TARGETS[F.target], tag + 'exe id explicit ' + src.exe);
  eq(src.stackHash, 'da39a3ee5e6b4b0d', tag + 'vanilla stack hash = sha1 of an empty string');
  const rows = K.list(src);
  eq(rows.map(r => r.key), [F.map], tag + 'list keys');
  const want = ANS.as2.maps.a.maps[0];
  const r0 = Object.assign({}, rows[0]);
  const w0 = Object.assign({}, want);
  if (form === 'goh') { w0.modes = ['battle_zones', 'frontlines']; w0.files = ['battle_zones.mi', 'frontlines.mi', 'map', 'map.net']; }
  eq(r0, w0, tag + 'list row');
  eq(rows[0].pictures, [], tag + 'list pictures (the fixture ships none)');

  const d = K.doc(src, F.map);
  const dd = diff(d, ANS[form].doc.a, 'doc', []);
  ok(dd.length === 0, tag + 'doc equals fxanswers ' + form + '.doc field by field: ' + dd.slice(0, 8).join('; '));
  eq(Object.keys(d.pictures), ['minimap', 'preview', 'preview_small', 'header', 'header_interface'], tag + 'five picture stems');
  ok(Object.values(d.pictures).every(p => p === null), tag + 'absent pictures are null');
  eq(d.water.level, -20, tag + 'water.level'); eq(d.water.source, 'map', tag + 'water.source');

  const goh = form === 'goh';
  const cellOf = (x, y) => { const c = K.worldToCell(d.net, x, y); return c ? [c.i, c.j] : null; };
  const bz = d.modes.find(m => m.id === 'battle_zones');
  const sp = n => bz.spawns.find(s => s.name === n), fl = n => bz.flags.find(f => f.name === n);
  eq(cellOf(sp('a1').x, sp('a1').y), goh ? [27, 98] : [13, 49], tag + 'spawn a1 cell');
  eq(sp('a1').yaw, 0, tag + 'spawn a1 yaw');
  eq(cellOf(sp('b1').x, sp('b1').y), goh ? [227, 92] : [113, 46], tag + 'spawn b1 cell');
  eq(sp('b1').yaw, 179.5, tag + 'spawn b1 yaw');
  eq(cellOf(0, 0), goh ? [128, 96] : [64, 48], tag + 'flag f1 cell');
  eq(fl('f1').zone, { kind: 'circle', rA: 240, rB: 240 }, tag + 'flag f1 zone');
  if (goh) {
    eq(fl('f2').zoneId, 'zf2', tag + 'flag f2 zoneId');
    eq(fl('f2').zone, { kind: 'poly', pts: [[-280, 180], [-80, 180], [-40, 300], [-180, 380], [-300, 300]] }, tag + 'flag f2 poly, absolute');
    eq(fl('f3').zone, { kind: 'circle', rA: 200, rB: 200 }, tag + 'flag f3 circle r 200 raw u');
  } else {
    eq(cellOf(-200, 300), [44, 78], tag + 'flag f2 cell');
    eq(fl('f2').zone, { kind: 'circle', rA: 160, rB: 160 }, tag + 'flag f2 zone');
    eq(cellOf(300, 200), [94, 68], tag + 'flag f3 cell');
    eq(fl('f3').zone, { kind: 'circle', rA: 200, rB: 120 }, tag + 'flag f3 zone, scale ignored');
  }
  const fr = d.modes.find(m => m.id === (goh ? 'frontlines' : 'frontline'));
  const sp1 = fr.spawns.find(s => s.name === null);
  ok(!!sp1, tag + 'frontline spawn_point sp1 present');
  if (sp1) {
    eq([sp1.team, sp1.phase, sp1.order, sp1.x, sp1.y], ['a', 1, 1, -450, 20], tag + 'sp1 via mapPoint fa1');
    eq(cellOf(sp1.x, sp1.y), goh ? [38, 100] : [19, 50], tag + 'sp1 cell');
  }
  eq(cellOf(-640.001, 0), null, tag + 'west of the grid -> null');
  eq(cellOf(-640, -480), [0, 0], tag + 'grid corner -> cell 0,0');
  eq(cellOf(-640 + d.cell - 0.001, 0)[0], 0, tag + 'truncation, never rounding');
  eq(K.cellToWorld(d.net, 64, 48), goh ? { x: -320, y: -240 } : { x: 0, y: 0 }, tag + 'cellToWorld lattice point');

  // grids
  const g = K.grids(src, F.map);
  eq(g.W, -20, tag + 'grids W');
  eq([g.height.w, g.height.h, g.height.cell, g.height.ox, g.height.oy, g.height.etype, g.height.sample], [d.net.w, d.net.h, d.cell, -640, -480, 'i16', 'lattice'], tag + 'height grid frame');
  eq([g.gtype.etype, g.gtype.sample, g.material.etype, g.gtypeStored.name], ['u8', 'cell', 'u8', 'gtype.stored'], tag + 'cell grids');
  eq(g.height.meta, { unit: 'u', upm: 20 }, tag + 'height meta');
  eq(g.material.meta.names[9], 'road', tag + 'material names: road = 9');
  eq(K.heightAt(g.height, -200, 0), 60, tag + 'ridge height at x -200');
  eq(K.heightAt(g.height, -250, 123.4), 30, tag + 'ridge height at x -250');
  eq(K.heightAt(g.height, -200, 437), 60, tag + 'ridge height at x -200, another y');
  eq(K.heightAt(g.height, 700, 0), null, tag + 'heightAt outside');
  const s = goh ? 2 : 1, at = (L, i, j) => L.data[j * L.w + i];
  const pond = [[94, 5, 5], [101, 4, 4], [104, 4, 4], [107, 3, 3], [111, 3, 1]];
  for (const [i, st, ld] of pond) {
    eq([at(g.gtypeStored, i * s, 28 * s), at(g.gtype, i * s, 28 * s)], [st, ld], tag + 'pond cell (' + i * s + ', ' + 28 * s + ') stored / load type');
  }
  eq(at(g.material, 111 * s, 28 * s), 1, tag + 'painted above the level -> material ground');
  for (const y of [190, 200, 210]) {
    const j = (y + 480) / d.cell;
    eq([at(g.gtype, 20 * s, j), at(g.material, 20 * s, j)], [7, 9], tag + 'road row y ' + y);
  }
  eq(at(g.gtype, 20 * s, (180 + 480) / d.cell), 1, tag + 'below the road rows');
  eq(at(g.gtype, 20 * s, (220 + 480) / d.cell), 1, tag + 'above the road rows');
  // whole grids against fxmake's own layers (load re-type with W of the map)
  const L = fx.layersOf ? fx.layersOf(form) : null;
  if (L) {
    let bad = 0;
    for (let k = 0; k < L.gtype.length; k++) if (L.gtype[k] !== g.gtype.data[k] || L.height[k] !== g.height.data[k] || L.material[k] !== g.material.data[k]) bad++;
    eq(bad, 0, tag + 'cells differing from fxmake layersOf');
  }
  // grids written and read back through gridfile
  const out = path.join(W, 'grids-' + form);
  for (const grid of [g.height, g.gtype, g.gtypeStored, g.material]) {
    const f = path.join(out, grid.name + '.mvg');
    GF.write(f, grid);
    const b = GF.read(f);
    ok(b.w === grid.w && b.h === grid.h && b.cell === grid.cell && b.ox === grid.ox && b.oy === grid.oy && b.etype === grid.etype && b.sample === grid.sample,
      tag + grid.name + ' header read back');
    ok(Buffer.compare(Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength), Buffer.from(grid.data.buffer, grid.data.byteOffset, grid.data.byteLength)) === 0, tag + grid.name + ' data read back');
    eq(b.meta, grid.meta, tag + grid.name + ' meta read back');
  }
  // reads: every input is a loose file of the fixture, absolute, with size and mtime
  const reads = src.reads();
  ok(reads.length > 0 && reads.every(x => x.kind === 'loose' && path.isAbsolute(x.file) && typeof x.size === 'number'), tag + 'reads() inputs');
}

// ---------------------------------------------------------------- 2. the mvfx mod-dir shadow
{
  const F = FORMS.as2;
  const src = K.source({ target: F.target, game: F.gameDir, modDirs: F.modDirs });
  ok(src.stackHash !== 'da39a3ee5e6b4b0d', 'mod-dir: stack hash differs from vanilla');
  const d = K.doc(src, F.map, { mode: 'combat' });
  eq(d.modes.map(m => m.id), ['combat'], 'mod-dir: --mode restricts the modes');
  const a1 = d.modes[0].spawns.find(s => s.name === 'a1');
  const c = K.worldToCell(d.net, a1.x, a1.y);
  eq([c.i, c.j], [13, 53], 'mod-dir: combat a1 cell');
  const row = K.list(src)[0];
  eq(row.source, 'loose', 'mod-dir: list source');
  ok(src.reads().some(x => /mods\/mvfx/.test(x.file.replace(/\\/g, '/'))), 'mod-dir: reads name the mod folder');
  const d0 = K.doc(K.source({ target: F.target, game: F.gameDir }), F.map, { mode: 'combat' });
  const a0 = d0.modes[0].spawns.find(s => s.name === 'a1');
  eq([a0.x, a0.y], [-503.7, 12.2], 'vanilla combat a1 unchanged');
  throwsMv(() => K.doc(src, F.map, { mode: 'nope' }), 'MV_NOT_FOUND', 'doc of an absent mode');
}

// ---------------------------------------------------------------- 3. land patch maths (synthetic model)
{
  // inside test: the engine's sign (a triangle turned over from counter-clockwise faces)
  const tri = [[0, 0, 0], [0, 10, 0], [10, 0, 0]];   // clockwise from above
  ok(P.insideXY(tri, 2, 2), 'insideXY: a point inside a clockwise triangle');
  ok(P.insideXY(tri, 0, 5), 'insideXY: a point on an edge counts');
  ok(!P.insideXY(tri, 8, 8), 'insideXY: a point outside');
  ok(!P.insideXY([tri[0], tri[2], tri[1]], 2, 2), 'insideXY: counter-clockwise faces never hold a point (engine sign)');
  const pl = P.plane([[0, 0, 10], [0, 10, 20], [10, 0, 10]]);
  ok(Math.abs(P.planeHeight(pl, 0, 5) - 15) < 1e-4, 'planeHeight on a slope');
  eq(P.planeHeight(P.plane([[0, 0, 0], [0, 0, 10], [10, 0, 0]]), 1, 0), null, 'planeHeight of a vertical face -> null (engine max z)');
  eq(P.getCell({ cell: 10, offX: 50, offY: 50 }, -50.5, 9.9), { x: 0, y: 5 }, 'getCell truncates toward zero');

  const mkCtx = () => {
    const n = { w: 10, h: 10, cell: 10, offX: 50, offY: 50 };
    const ctx = { target: 'mowas2', net: n, height: new Int16Array(100), type: new Uint8Array(100).fill(1), typeStored: new Uint8Array(100).fill(1),
      mat: new Uint8Array(100).fill(1), W: -20, mt: T.materialTable(['ground', 'road']), notes: [] };
    return ctx;
  };
  // a 40 x 40 square at z 30, faces counter-clockwise from above, bone "land"
  const quad = (z) => ({
    model: { bones: [{ name: 'land', paramMap: { Land: '' } }] },
    scene: { areas: [], meshes: [{ boneIndex: 0, file: 'land.ply', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      ply: { vertices: { count: 4, layout: [{ key: 'position', comps: 3 }], position: new Float32Array([-20, -20, z, 20, -20, z, 20, 20, z, -20, 20, z]) },
        indices: new Uint16Array([0, 1, 2, 0, 2, 3]) } }] },
  });
  const rec = { def: 'x', uid: 1, x: 0, y: 0, z: 0, zl: 0, yr: 0, zw: 0, scale: null };
  const P0 = { kind: 'land_patch', on: true, alignEnabled: false, terrain: { type: 'road', material: 'road' } };
  let ctx = mkCtx();
  ctx.height[5 * 10 + 5] = 50;            // higher than the patch: kept without a cut area
  ctx.type[1 * 10 + 1] = 4; ctx.type[8 * 10 + 8] = 4; ctx.type[7 * 10 + 7] = 4;
  ok(P.patchEntity(ctx, rec, P0, quad(30)), 'patchEntity lays a land view');
  let n30 = 0;
  for (let k = 0; k < 100; k++) if (ctx.height[k] === 30) n30++;
  eq(n30, 24, 'patch: 5 x 5 lattice points under the square, one higher kept');
  eq(ctx.height[5 * 10 + 5], 50, 'patch: a higher cell is kept (no cut area)');
  eq([ctx.height[3 * 10 + 3], ctx.height[7 * 10 + 7], ctx.height[2 * 10 + 2], ctx.height[8 * 10 + 8]], [30, 30, 0, 0], 'patch: square edges in, outside out');
  eq([ctx.type[4 * 10 + 4], ctx.typeStored[4 * 10 + 4], ctx.mat[4 * 10 + 4]], [7, 7, 9], 'patch: TerrainType road road');
  eq(ctx.type[5 * 10 + 5], 1, 'patch: a cell kept higher keeps its type');
  eq(ctx.type[1 * 10 + 1], 1, 'patch: water cell inside the rectangle re-typed (dry -> ground)');
  eq(ctx.type[8 * 10 + 8], 4, 'patch: the end column of the rectangle is not re-typed (engine end bound)');
  eq(ctx.type[7 * 10 + 7], 7, 'patch: a road cell is written before the re-type');
  // cut area: lower heights replace higher ones
  ctx = mkCtx(); ctx.height[5 * 10 + 5] = 50;
  const q2 = quad(30); q2.scene.areas = [{ name: 'cut' }];
  P.patchEntity(ctx, rec, Object.assign({}, P0, { terrain: null }), q2);
  eq(ctx.height[5 * 10 + 5], 30, 'patch with a cut area lowers a higher cell');
  eq(ctx.type[4 * 10 + 4], 1, 'patch with no TerrainType keeps the type');
  // ruling R2: a type 0 cell (an unknown v2 name on as64 / mowas2) is not re-typed and a TerrainType patch overwrites it
  ctx = mkCtx(); ctx.type.fill(0); ctx.typeStored.fill(0);
  P.patchEntity(ctx, rec, P0, quad(30));
  eq([ctx.type[4 * 10 + 4], ctx.typeStored[4 * 10 + 4], ctx.type[1 * 10 + 1], ctx.type[9 * 10 + 9]], [7, 7, 0, 0], 'type 0: TerrainType road writes 7, the re-type leaves 0 alone');
  ctx = mkCtx(); ctx.type.fill(0); ctx.height.fill(-200);
  P.patchEntity(ctx, rec, Object.assign({}, P0, { terrain: null }), quad(30));
  eq([ctx.type[1 * 10 + 1], ctx.type[4 * 10 + 4]], [0, 0], 'type 0 under water depth: not re-typed (3..5 only), no TerrainType keeps 0');
  eq([K.retype(0, -200, -20), T.retypeCell(0, -200, -20)], [0, null], 'retype of type 0: unchanged');
  eq([T.unknownTypeId('as64'), T.unknownTypeId('mowas2'), T.unknownTypeId('goh')], [0, 0, 15], 'unknownTypeId per target');
  // water terrain: the type follows the depth under W
  ctx = mkCtx();
  const q4 = quad(-200); q4.scene.areas = [{ name: 'Cut' }];
  P.patchEntity(ctx, rec, Object.assign({}, P0, { terrain: { type: 'water', material: 'water' } }), q4);
  eq([ctx.type[4 * 10 + 4], ctx.mat[4 * 10 + 4]], [5, 6], 'patch TerrainType water at depth 180 -> deep water');
  // rotation and position: the entity at (10, 0) turned 90 degrees
  ctx = mkCtx();
  P.patchEntity(ctx, Object.assign({}, rec, { x: 10, zl: 90 }), P0, quad(30));
  eq([ctx.height[5 * 10 + 8], ctx.height[5 * 10 + 2]], [30, 0], 'patch follows the entity position');
  // a view with no "land" bone lays nothing
  const q3 = quad(30); q3.model.bones[0].paramMap = { Align: '' };
  eq(P.patchEntity(mkCtx(), rec, P0, q3), false, 'align-only views lay nothing (Build returns views.land)');
  // the re-type table
  eq([K.retype(5, -200, -20), K.retype(4, -80, -20), K.retype(4, -50, -20), K.retype(3, -28, -20), K.retype(3, -10, -20), K.retype(7, -200, -20)],
    [5, 4, 4, 3, 1, 7], 'retype by depth W - (h - 1)');
  // the thresholds: depth d = W - (h - 1); d > 0 shallow, d > 14 water, d > 100 deep, else ground
  eq([K.retype(3, -20, -20), K.retype(3, -19, -20)], [3, 1], 'retype boundary: depth 1 shallow, depth 0 ground');
  eq([K.retype(5, -33, -20), K.retype(5, -34, -20)], [3, 4], 'retype boundary: depth 14 shallow, depth 15 water');
  eq([K.retype(3, -119, -20), K.retype(3, -120, -20)], [4, 5], 'retype boundary: depth 100 water, depth 101 deep');
}

// ---------------------------------------------------------------- 3b. fixture variants: last row and column, water levels,
// the mod-dir container, GoH type ids by index
{
  const base = path.join(W, 'variants');
  const mapDir = F => path.join(F.gameDir, 'resource', 'map', ...F.map.split('/'));
  const at = (L, i, j) => L.data[j * L.w + i];
  const S = fx.SPEC, A2 = S.forms.as2;
  // water (type 4, h -200) in the last two rows and columns: the load re-type skips the last row and column only
  {
    const F = fx.make(path.join(base, 'edge'), { form: 'as2' });
    const w = A2.w, h = A2.h;
    fs.writeFileSync(path.join(mapDir(F), 'map.net'), fx.netWrite({ cell: A2.cell, version: 2, w, h, offX: S.offX, offY: S.offY,
      types: S.types, materials: S.materials,
      cellAt: (i, j) => (i >= w - 2 || j >= h - 2 ? { h: -200, type: 4, material: 5 } : fx.cellRecord('as2', i, j)) }));
    const g = K.grids(K.source({ target: F.target, game: F.gameDir }), F.map);
    eq([at(g.gtypeStored, w - 1, 10), at(g.gtype, w - 1, 10), at(g.material, w - 1, 10)], [4, 4, 5], 'last column: not re-typed (stored 4 kept)');
    eq([at(g.gtypeStored, 10, h - 1), at(g.gtype, 10, h - 1)], [4, 4], 'last row: not re-typed');
    eq([at(g.gtype, w - 1, h - 1)], [4], 'last corner: not re-typed');
    eq([at(g.gtypeStored, w - 2, 10), at(g.gtype, w - 2, 10), at(g.material, w - 2, 10)], [4, 5, 6], 'one column in: re-typed to deep water');
    eq([at(g.gtype, 10, h - 2), at(g.material, 10, h - 2)], [5, 6], 'one row in: re-typed to deep water');
  }
  // map Clips: two clips, {water -20} then {water -30}: water.level = the last one (-30)
  {
    const F = fx.make(path.join(base, 'clips'), { form: 'as2' });
    const mf = path.join(mapDir(F), 'map');
    const t = fs.readFileSync(mf, 'latin1');
    const extra = '\t\t{"second"\r\n\t\t\t{world -600 -440 600 440}\r\n\t\t\t{water -30}\r\n\t\t}\r\n';
    const t2 = t.replace('\t\t\t{water -20}\r\n\t\t}\r\n', m => m + extra);
    ok(t2 !== t, 'clips variant written');
    fs.writeFileSync(mf, t2, 'latin1');
    const src = K.source({ target: F.target, game: F.gameDir });
    const d = K.doc(src, F.map);
    eq([d.water.level, d.water.source], [-30, 'map'], 'two map clips: water.level is the last {water}');
    eq(d.boxes.named.map(c => [c.name, c.water]), [['[auto]', -20], ['second', -30]], 'two map clips: named waters');
    const g = K.grids(src, F.map);
    eq(g.W, -30, 'two map clips: grids W');
    eq([at(g.gtypeStored, 107, 28), at(g.gtype, 107, 28)], [3, 1], 'W -30: pond cell h -28 dries to ground');
  }
  // combat.mi Clips hold {water -50}: the mode's own W
  {
    const F = fx.make(path.join(base, 'modew'), { form: 'as2' });
    const cf = path.join(mapDir(F), 'combat.mi');
    const t = fs.readFileSync(cf, 'latin1');
    const t2 = t.replace('\t{Fog 1}\r\n', '\t{Clips\r\n\t\t{"[auto]"\r\n\t\t\t{water -50}\r\n\t\t}\r\n\t}\r\n\t{Fog 1}\r\n');
    ok(t2 !== t, 'mode water variant written');
    fs.writeFileSync(cf, t2, 'latin1');
    const src = K.source({ target: F.target, game: F.gameDir });
    const d = K.doc(src, F.map);
    eq(d.modes.map(m => [m.id, m.water]), [['battle_zones', null], ['combat', -50], ['frontline', null]], 'modes[].water: the .mi {water} or null');
    eq(d.water.level, -20, 'mode water leaves water.level alone');
    const gm = K.grids(src, F.map, { mode: 'combat' }), g0 = K.grids(src, F.map, { mode: 'battle_zones' });
    eq([gm.W, g0.W], [-50, -20], 'grids W of the mode: its own {water}, else the map level');
    eq([at(gm.gtype, 104, 28), at(g0.gtype, 104, 28)], [3, 4], 'pond cell h -50 re-typed with the W of the mode');
    eq([at(gm.gtype, 107, 28), at(g0.gtype, 107, 28)], [1, 3], 'pond cell h -28 re-typed with the W of the mode');
  }
  // a map only in the mod folder: container '<mod-dir:mvfx>'; a game map: '<game>'
  {
    const F = fx.make(path.join(base, 'modmap'), { form: 'as2' });
    const md = path.join(F.modDirs[0], 'resource', 'map', 'multi', 'modmap');
    copyDir(mapDir(F), md);
    const rows = K.list(K.source({ target: F.target, game: F.gameDir, modDirs: F.modDirs }));
    eq(rows.map(r => [r.key, r.source, r.container]), [['multi/modmap', 'loose', '<mod-dir:mvfx>'], [F.map, 'loose', '<game>']], 'list container: <mod-dir:id> and <game>');
  }
  // GoH type ids: the index as read from map.net types[] (README 3.2); AS2 by name; a name outside the tables (ruling R2)
  // -> 0 on as64 and mowas2 (FindGroundType), 15 on goh, each with MAPKIT_TYPE_UNKNOWN in doc and grids. The unknown name
  // also sits on a pond cell under the water level: type 0 is not re-typed (3..5 only)
  for (const [form, target] of [['goh', 'goh'], ['as2', 'mowas2'], ['as2', 'as64']]) {
    const F = fx.make(path.join(base, 'types-' + target), { form });
    const G = S.forms[form], s = form === 'goh' ? 2 : 1;
    const types = [[1, 'ground'], [2, 'road'], [3, 'shallow_water'], [4, 'water'], [5, 'deep_water'], [12, 'mud']];
    fs.writeFileSync(path.join(mapDir(F), 'map.net'), fx.netWrite({ cell: G.cell, version: 2, w: G.w, h: G.h, offX: S.offX, offY: S.offY,
      types, materials: S.materials,
      cellAt: (i, j) => {
        const c = fx.cellRecord(form, i, j);
        if (c.type === 7) return Object.assign({}, c, { type: 2 });
        if ((i === 0 && j === 0) || (i === 101 * s && j === 28 * s)) return Object.assign({}, c, { type: 12 });
        return c;
      } }));
    const src = K.source({ target, game: F.gameDir });
    const d = K.doc(src, F.map);
    const road = form === 'goh' ? 2 : 7, unk = target === 'goh' ? 15 : 0, tag = target + ': ';
    eq(d.net.types.map(t => [t.id, t.engine]), [[1, 1], [2, road], [3, 3], [4, 4], [5, 5], [12, unk]], tag + 'net.types engine ids');
    const dn = d.notes.filter(n => n.code === 'MAPKIT_TYPE_UNKNOWN');
    ok(dn.length === 1 && /mud/.test(dn[0].text) && dn[0].at === null && (unk === 0 ? /0 \(undef\)/ : /other \(15\)/).test(dn[0].text), tag + 'doc: one MAPKIT_TYPE_UNKNOWN for "mud": ' + JSON.stringify(dn));
    const g = K.grids(src, F.map);
    eq([at(g.gtype, 20 * s, (200 + 480) / G.cell), at(g.gtype, 0, 0), at(g.gtypeStored, 0, 0)], [road, unk, unk], tag + 'gtype of the road rows, gtype and gtype.stored of the unknown type');
    eq([at(g.gtypeStored, 101 * s, 28 * s), at(g.gtype, 101 * s, 28 * s)], [unk, unk], tag + 'unknown type on a pond cell: not re-typed');
    const gn = g.notes.filter(n => n.code === 'MAPKIT_TYPE_UNKNOWN');
    ok(gn.length === 1 && /mud/.test(gn[0].text), tag + 'grids: one MAPKIT_TYPE_UNKNOWN for "mud": ' + JSON.stringify(g.notes));
  }
}

// ---------------------------------------------------------------- 3c. the ground mesh (map.ply) and the height edges, progress
// ticks, structure links on doc rows
{
  const base = path.join(W, 'ground');
  const mapDir = F => path.join(F.gameDir, 'resource', 'map', ...F.map.split('/'));
  const at = (L, i, j) => L.data[j * L.w + i];
  const S = fx.SPEC, A2 = S.forms.as2, w = A2.w, h = A2.h, c = A2.cell;
  const ply = require('../../../../lib/model/ply');
  const G = require('../ground'), GR = require('../grids');
  // a BPLY ground mesh with one vertex on each lattice point of the box i0..i1, j0..j1, z = zAt(i, j); mesh y = -world y
  const DECL = [{ type: 2, usage: 0, index: 0, stream: 0 }, { type: 2, usage: 1, index: 0, stream: 0 }, { type: 6, usage: 2, index: 0, stream: 0 }, { type: 1, usage: 3, index: 0, stream: 0 }];
  const groundPly = (i0, i1, j0, j1, zAt) => {
    const nx = i1 - i0, ny = j1 - j0, raw = Buffer.alloc((nx + 1) * (ny + 1) * 36), idx = [];
    for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k++) {
      raw.writeFloatLE((i0 + i) * c - S.offX, k * 36); raw.writeFloatLE(-((j0 + j) * c - S.offY), k * 36 + 4); raw.writeFloatLE(zAt(i0 + i, j0 + j), k * 36 + 8);
      raw.writeFloatLE(1, k * 36 + 20); raw.writeUInt32LE(0xffffffff, k * 36 + 24);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, b, e, a, e, d); }
    return ply.write({ magic: 'BPLY', parts: [{ tag: 'SUBM', declaration: DECL, firstFace: 0, faceCount: idx.length / 3, firstVertex: 0, vertexCount: 0, flags: 0x1404, material: 'ground.mtl' }],
      vertices: { count: (nx + 1) * (ny + 1), stride: 36, raw }, indices: Uint32Array.from(idx) });
  };
  const rawH = (i, j) => fx.cellRecord('as2', i, j).h;
  const F = fx.make(path.join(base, 'mesh'), { form: 'as2' });
  let src = K.source({ target: F.target, game: F.gameDir });
  const g0 = K.grids(src, F.map);
  eq([g0.ground.reason, g0.height.nodata, 'offGround' in g0.height.meta], ['no map.ply', null, false], 'no map.ply: nothing marked, no offGround');
  // the mesh covers columns 2..w-3 and rows 0..h-4 (the south row on the grid edge)
  const I0 = 2, I1 = w - 3, J0 = 0, J1 = h - 4, under = (I1 - I0 + 1) * (J1 - J0 + 1);
  fs.writeFileSync(path.join(mapDir(F), 'map.ply'), groundPly(I0, I1, J0, J1, rawH));
  src = K.source({ target: F.target, game: F.gameDir });
  const ticks = [];
  const g = K.grids(src, F.map, { tick: (d, t) => ticks.push([d, t]) });
  eq([g.ground.reason, g.ground.under, g.ground.rim, g.ground.off, g.ground.faces], [null, under, 0, w * h - under, 2 * (I1 - I0) * (J1 - J0)], 'mesh: ground counts');
  eq([g.height.nodata, g.height.meta.offGround], [-32768, w * h - under], 'mesh: height nodata -32768 and meta.offGround');
  let badOff = 0, badOn = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const inside = i >= I0 && i <= I1 && j >= J0 && j <= J1, v = at(g.height, i, j);
    if (inside && v !== rawH(i, j)) badOn++;
    if (!inside && v !== -32768) badOff++;
  }
  eq([badOn, badOff], [0, 0], 'mesh: points under the mesh keep their height, the others are nodata');
  ok(Buffer.compare(Buffer.from(g.gtype.data), Buffer.from(g0.gtype.data)) === 0 && Buffer.compare(Buffer.from(g.material.data), Buffer.from(g0.material.data)) === 0 &&
    Buffer.compare(Buffer.from(g.gtypeStored.data), Buffer.from(g0.gtypeStored.data)) === 0, 'mesh: gtype, gtype.stored and material unchanged');
  // heightAt: nodata corners are left out and the weights renormalized; all four nodata -> null
  const wx = i => i * c - S.offX, wy = j => j * c - S.offY;
  eq(K.heightAt(g.height, wx(I0 - 0.5), wy(10)), rawH(I0, 10), 'heightAt: half way to a nodata column = the valid corner');
  eq(K.heightAt(g.height, wx(0.5), wy(10)), null, 'heightAt: every corner nodata -> null');
  eq(K.heightAt(g.height, wx(30), wy(10)), rawH(30, 10), 'heightAt inside the mesh unchanged');
  // the grid file keeps nodata
  const gf = path.join(base, 'height.mvg');
  GF.write(gf, g.height);
  const gb = GF.read(gf);
  eq([gb.nodata, gb.meta.offGround], [-32768, w * h - under], 'nodata and meta.offGround read back through gridfile');
  // progress: total 1000, done rising from 0 to 1000
  ok(ticks.length >= 6 && ticks.every(t => t[1] === GR.TICK_TOTAL) && ticks[0][0] === 0 && ticks[ticks.length - 1][0] === 1000 &&
    ticks.every((t, q) => q === 0 || t[0] >= ticks[q - 1][0]), 'tick: ' + ticks.length + ' calls, 0 -> 1000, never falling ' + JSON.stringify(ticks.slice(0, 12)));
  // a throw from tick (a cancel) goes through
  let n = 0, thrown = null;
  try { K.grids(src, F.map, { tick: () => { if (++n === 3) { const e = new Error('stop'); e.code = 'MV_CANCELLED'; throw e; } } }); } catch (e) { thrown = e; }
  ok(thrown && thrown.code === 'MV_CANCELLED' && n === 3, 'tick: a throw stops grids and goes through');
  // the cell CLI: a nodata point gives h null
  const run = (args) => cp.spawnSync(process.execPath, [path.join(ROOT, 'mapviz.js'), 'mapkit'].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), maxBuffer: 64 << 20 });
  const r = run(['cell', '--map', F.map, '--at', wx(w - 1) + ',' + wy(10), '--json', '--target', 'mowas2', '--game', F.gameDir]);
  const rj = r.status === 0 ? JSON.parse(r.stdout) : null;
  ok(rj && rj.h === null && rj.hM === null && rj.i === w - 1 && rj.j === 10, 'cli cell on a nodata point: h and hM null ' + r.stdout + r.stderr);

  // the rim rule: an outer covered column 50 u off the mesh is dropped; one 1 u off and an inner one 50 u off are kept
  const F2 = fx.make(path.join(base, 'rim'), { form: 'as2' });
  fs.writeFileSync(path.join(mapDir(F2), 'map.ply'), groundPly(I0, I1, J0, J1, rawH));
  fs.writeFileSync(path.join(mapDir(F2), 'map.net'), fx.netWrite({ cell: c, version: 2, w, h, offX: S.offX, offY: S.offY, types: S.types, materials: S.materials,
    cellAt: (i, j) => { const q = fx.cellRecord('as2', i, j); return Object.assign({}, q, { h: q.h + (i === I1 ? 50 : i === I0 ? 1 : i === 40 && j > J0 && j < J1 ? 50 : 0) }); } }));
  const g2 = K.grids(K.source({ target: F2.target, game: F2.gameDir }), F2.map);
  const rows = J1 - J0 + 1;
  eq([g2.ground.rim, g2.ground.under, g2.height.meta.offGround], [rows, under - rows, w * h - under + rows], 'rim: the east covered column 50 u off is dropped');
  eq([at(g2.height, I1, 10), at(g2.height, I1 - 1, 10), at(g2.height, I0, 10), at(g2.height, 40, 10)], [-32768, rawH(I1 - 1, 10), rawH(I0, 10) + 1, rawH(40, 10) + 50],
    'rim: dropped column nodata; 1 u off (within RIM_TOL ' + G.RIM_TOL + ') kept; an inner column is never checked');

  // a map.ply that cannot be read: nothing marked, no throw
  const F3 = fx.make(path.join(base, 'badply'), { form: 'as2' });
  fs.writeFileSync(path.join(mapDir(F3), 'map.ply'), Buffer.from('BPLY not a mesh'));
  let g3 = null, e3 = null;
  try { g3 = K.grids(K.source({ target: F3.target, game: F3.gameDir }), F3.map); } catch (e) { e3 = e; }
  ok(g3 && /cannot be read|no face/.test(g3.ground.reason) && g3.height.nodata === null && !('offGround' in g3.height.meta), 'unreadable map.ply: nothing marked ' + (e3 ? e3.message : JSON.stringify(g3.ground)));
  // ground.mask on its own, without heights: the covered count, no rim rule
  const net = require('../../../../lib/mapnet').parse(fs.readFileSync(path.join(mapDir(F), 'map.net')));
  const gs = G.mask(src, F.map, net, { map: null });
  eq([gs.under, gs.rim, gs.mask.length], [under, 0, w * h], 'ground.mask without heights: covered count, no rim rule');

  // structure links on doc rows (mapdoc/1 additive): map file {Link} + {Placer {State}}, a .mi link, a boarding link and a
  // nested link; the fixture itself has none, so its rows carry neither key (section 1 diff)
  const F4 = fx.make(path.join(base, 'links'), { form: 'as2' });
  const ins = (file, text) => { const t = fs.readFileSync(file, 'latin1'), k = t.lastIndexOf('}'); fs.writeFileSync(file, t.slice(0, k) + text.replace(/\n/g, '\r\n') + t.slice(k), 'latin1'); };
  ins(path.join(mapDir(F4), 'map'), '\t{Entity "fx_part" 0x2002\n\t}\n\t{Entity "fx_part" 0x2004\n\t}\n' +
    '\t{Entity "fx_struct" 0x2001\n\t\t{Position 300 -300}\n\t\t{Placer\n\t\t\t{State "P1"\n\t\t\t}\n\t\t\t{State "p2"\n\t\t\t\t{Unlinked}\n\t\t\t}\n\t\t\t{State "p3"\n\t\t\t\t{Entity "/entity/fx/FX_Swap.def"}\n\t\t\t}\n\t\t}\n\t}\n' +
    '\t{Link 0x2002 {0x2001 "P1"}}\n\t{Link 0x2004 {0x2001}}\n\t{Link 0x2004 {0x2001 "p1" "x"}}\n');
  ins(path.join(mapDir(F4), 'combat.mi'), '\t{Entity "fx_struct" 0x3001\n\t\t{Position 0 0}\n\t\t{Placer\n\t\t\t{State "p1"\n\t\t\t\t{Unlinked}\n\t\t\t}\n\t\t}\n\t}\n' +
    '\t{Entity "fx_part" 0x3002\n\t}\n\t{Link 0x3002 {0x3001 "p1"}}\n');
  const d4 = K.doc(K.source({ target: F4.target, game: F4.gameDir }), F4.map, { mode: 'combat' });
  const row = u => d4.entities.find(e => e.uid === u);
  eq(row(0x2002).link, { root: 0x2001, place: 'p1' }, 'doc: entities[].link of a part (place lower case)');
  eq(row(0x2001).seats, { p1: { unlinked: false, entity: 0x2002, def: null }, p2: { unlinked: true, entity: null, def: null }, p3: { unlinked: false, entity: null, def: 'fx_swap' } },
    'doc: entities[].seats of a root: the linked part uid, {Unlinked}, the {Entity} swap');
  ok(!('link' in row(0x2004)), 'doc: a boarding link and a nested link give no link');
  eq(d4.notes.filter(x => x.code === 'MAPKIT_LINK_NESTED').length, 1, 'doc: one MAPKIT_LINK_NESTED note');
  eq([row(0x3002).link, row(0x3001).seats], [{ root: 0x3001, place: 'p1' }, { p1: { unlinked: true, entity: 0x3002, def: null } }], 'doc: .mi links on the .mi rows');
  ok(d4.entities.filter(e => 'link' in e || 'seats' in e).length === 4, 'doc: link and seats only on the rows that have them');
  eq(K.doc(src, F.map).entities.filter(e => 'link' in e || 'seats' in e).length, 0, 'doc of the plain fixture: no link, no seats');
}

// ---------------------------------------------------------------- 4. seeded defects
{
  // a .mi of an unknown mode
  const base = path.join(W, 'defects');
  const A = fx.make(path.join(base, 'mode'), { form: 'as2' });
  const mdir = path.join(A.gameDir, 'resource', 'map', ...A.map.split('/'));
  fs.copyFileSync(path.join(mdir, 'combat.mi'), path.join(mdir, 'weird.mi'));
  let src = K.source({ target: A.target, game: A.gameDir });
  const d = K.doc(src, A.map);
  const wm = d.modes.find(m => m.id === 'weird');
  ok(!!wm && wm.spawns.length === 0 && wm.points.length === 2 && wm.points.every(p => p.kind === 'other'), 'unknown mode: points listed without roles');
  ok(d.notes.some(n => n.code === 'MAPKIT_MODE_UNKNOWN'), 'unknown mode: note MAPKIT_MODE_UNKNOWN');
  eq(K.list(src)[0].modes, ['battle_zones', 'combat', 'frontline', 'weird'], 'unknown mode listed');
  eq(d.notes.filter(n => n.code === 'MAPKIT_MODE_UNKNOWN').length, 1, 'multiplayer unknown mode: exactly one MAPKIT_MODE_UNKNOWN');

  // ruling R4: a single-player map (key single/...) with 0.mi (and a .mi named like a multiplayer mode): the stem is the
  // mode id, generic points, no MAPKIT_MODE_UNKNOWN
  {
    const sdir = path.join(A.gameDir, 'resource', 'map', 'single', 'mv_camp', 'm1');
    fs.mkdirSync(sdir, { recursive: true });
    for (const f of ['map.net', 'map']) fs.copyFileSync(path.join(mdir, f), path.join(sdir, f));
    fs.copyFileSync(path.join(mdir, 'battle_zones.mi'), path.join(sdir, '0.mi'));
    fs.copyFileSync(path.join(mdir, 'battle_zones.mi'), path.join(sdir, 'battle_zones.mi'));
    const ss = K.source({ target: A.target, game: A.gameDir });
    const row = K.list(ss).find(r => r.key === 'single/mv_camp/m1');
    ok(!!row, 'single-player map listed');
    eq(row && row.modes, ['0', 'battle_zones'], 'single-player map: mode ids are the file stems');
    const sd = K.doc(ss, 'single/mv_camp/m1');
    eq(sd.modes.map(m => [m.id, m.file]), [['0', '0.mi'], ['battle_zones', 'battle_zones.mi']], 'single-player doc: mode ids and files');
    eq(sd.notes.filter(n => n.code === 'MAPKIT_MODE_UNKNOWN'), [], 'single-player map: no MAPKIT_MODE_UNKNOWN');
    const m0 = sd.modes[0], mbz = sd.modes[1];
    ok(m0.spawns.length === 0 && m0.flags.length === 0 && m0.points.length > 0 && m0.points.every(p => p.kind === 'other'), 'single-player 0.mi: generic points');
    ok(mbz.flags.length === 0 && mbz.points.length === m0.points.length && mbz.clipsBySide.length === 0, 'single-player battle_zones.mi: generic points too');
    const dbz = K.doc(ss, A.map, { mode: 'battle_zones' });
    ok(dbz.modes[0].flags.length > 0 && !dbz.notes.some(n => n.code === 'MAPKIT_MODE_UNKNOWN'), 'the same file under multi/ keeps its roles');
    const sg = K.grids(ss, 'single/mv_camp/m1', { mode: '0' });
    ok(sg.W === -20 && !sg.notes.some(n => n.code === 'MAPKIT_MODE_UNKNOWN'), 'single-player grids --mode 0');
  }

  // ruling R3: a .mi with an unclosed block and a map file with a stray '}': one MAPKIT_PARSE_ERROR per file in doc and
  // grids (file, first error line and code, at null); the flags and spawns that could be read are still given
  {
    const Pf = fx.make(path.join(base, 'parse'), { form: 'as2' });
    const pdir = path.join(Pf.gameDir, 'resource', 'map', ...Pf.map.split('/'));
    const cf = path.join(pdir, 'combat.mi');
    const ct = fs.readFileSync(cf, 'latin1');
    const lines = ct.split('\r\n').length;
    fs.writeFileSync(cf, ct + '{Broken\r\n\t{x 1}\r\n', 'latin1');
    let ps = K.source({ target: Pf.target, game: Pf.gameDir });
    const pd = K.doc(ps, Pf.map);
    const pe = pd.notes.filter(n => n.code === 'MAPKIT_PARSE_ERROR');
    ok(pe.length === 1 && /combat\.mi/.test(pe[0].text) && /BLOCK_UNCLOSED/.test(pe[0].text) && new RegExp('line ' + lines + ' ').test(pe[0].text) && pe[0].at === null,
      'unclosed block in combat.mi: one MAPKIT_PARSE_ERROR with file, line ' + lines + ' and code: ' + JSON.stringify(pe));
    const pc = pd.modes.find(m => m.id === 'combat');
    ok(pc.spawns.length > 0 && pc.spawns.some(sp => sp.name === 'a1'), 'unclosed block: the spawns that could be read are given');
    eq(K.grids(ps, Pf.map, { mode: 'combat' }).notes.filter(n => n.code === 'MAPKIT_PARSE_ERROR').length, 1, 'grids --mode combat: MAPKIT_PARSE_ERROR');
    eq(K.grids(ps, Pf.map, { mode: 'battle_zones' }).notes.filter(n => n.code === 'MAPKIT_PARSE_ERROR').length, 0, 'grids --mode battle_zones: no MAPKIT_PARSE_ERROR');
    const mf = path.join(pdir, 'map');
    fs.writeFileSync(mf, fs.readFileSync(mf, 'latin1') + '}\r\n', 'latin1');
    ps = K.source({ target: Pf.target, game: Pf.gameDir });
    const pd2 = K.doc(ps, Pf.map, { mode: 'battle_zones' });
    const pe2 = pd2.notes.filter(n => n.code === 'MAPKIT_PARSE_ERROR');
    ok(pe2.length === 1 && /cannot read map:/.test(pe2[0].text) && /BLOCK_END_STRAY/.test(pe2[0].text), 'stray } in map: one MAPKIT_PARSE_ERROR naming map: ' + JSON.stringify(pe2));
    ok(pd2.modes[0].flags.length === 3 && pd2.water.level === -20, 'stray } in map: flags and water still read');
    const pg = K.grids(ps, Pf.map);
    eq(pg.notes.filter(n => n.code === 'MAPKIT_PARSE_ERROR').map(n => /cannot read map:/.test(n.text)), [true], 'grids: one MAPKIT_PARSE_ERROR for the map file');
    eq(K.doc(ps, Pf.map).notes.filter(n => n.code === 'MAPKIT_PARSE_ERROR').length, 2, 'doc of every mode: one note per refused file (map, combat.mi)');
  }

  // a flag with no zoneA key: the engine default 0 -> r 20
  const B = fx.make(path.join(base, 'drop'), { form: 'as2', drop: 'f1.zoneA' });
  const db = K.doc(K.source({ target: B.target, game: B.gameDir }), B.map, { mode: 'battle_zones' });
  eq(db.modes[0].flags.find(f => f.name === 'f1').zone, { kind: 'circle', rA: 20, rB: 240 }, 'flag with no zoneA: rA = max(1, 0) x 20');

  // a GoH flag whose Helpers poly is gone: radius 0 -> zone null
  const C = fx.make(path.join(base, 'nopoly'), { form: 'goh', noPoly: true });
  const dc = K.doc(K.source({ target: C.target, game: C.gameDir }), C.map, { mode: 'battle_zones' });
  const f2 = dc.modes[0].flags.find(f => f.name === 'f2');
  eq([f2.zoneId, f2.zone], ['zf2', null], 'GoH flag with no poly: zone null, zoneId kept');

  // a truncated map.net
  const Dd = fx.make(path.join(base, 'trunc'), { form: 'as2' });
  const ndir = path.join(Dd.gameDir, 'resource', 'map', ...Dd.map.split('/'));
  const nb = fs.readFileSync(path.join(ndir, 'map.net'));
  fs.writeFileSync(path.join(ndir, 'map.net'), nb.subarray(0, Math.floor(nb.length / 2)));
  src = K.source({ target: Dd.target, game: Dd.gameDir });
  let e = throwsMv(() => K.doc(src, Dd.map), 'MV_NOT_FOUND', 'truncated map.net: doc');
  ok(!!e && e.detail && e.detail.broken === true && e.detail.problems.includes('NET_SIZE'), 'truncated map.net: detail.broken with NET_SIZE');
  throwsMv(() => K.grids(src, Dd.map), 'MV_NOT_FOUND', 'truncated map.net: grids');
  fs.writeFileSync(path.join(ndir, 'map.net'), nb.subarray(0, 7));
  e = throwsMv(() => K.doc(K.source({ target: Dd.target, game: Dd.gameDir }), Dd.map), 'MV_NOT_FOUND', 'header cut short');
  ok(!!e && e.detail && e.detail.problems.includes('NET_TRUNCATED'), 'header cut short: NET_TRUNCATED');

  // a map folder with no map.net
  const E = fx.make(path.join(base, 'nonet'), { form: 'as2' });
  const xdir = path.join(E.gameDir, 'resource', 'map', 'multi', 'no_net');
  fs.mkdirSync(xdir, { recursive: true });
  fs.copyFileSync(path.join(E.gameDir, 'resource', 'map', ...E.map.split('/'), 'combat.mi'), path.join(xdir, 'combat.mi'));
  src = K.source({ target: E.target, game: E.gameDir });
  eq(K.list(src).map(r => r.key), [E.map], 'a folder with no map.net is not a map');
  e = throwsMv(() => K.doc(src, 'multi/no_net'), 'MV_NOT_FOUND', 'doc of a folder with no map.net');
  eq(e && e.detail, { map: 'multi/no_net' }, 'no map.net: detail');
  throwsMv(() => K.doc(src, 'multi\\no_net'), 'MV_USAGE', 'map key with a backslash');
  throwsMv(() => K.source({ target: 'mow', game: E.gameDir }), 'MV_USAGE', 'unknown target');
  throwsMv(() => K.source({ target: 'mowas2', game: path.join(base, 'absent') }), 'MV_NOT_FOUND', 'absent game folder');
  throwsMv(() => K.source({ target: 'mowas2', game: E.gameDir, mods: ['nosuchmod'] }), 'MV_NOT_FOUND', 'a mod that does not mount');
}

// ---------------------------------------------------------------- 5. the CLI through mapviz.js
{
  const F = FORMS.as2, G = FORMS.goh;
  const run = (args) => cp.spawnSync(process.execPath, [path.join(ROOT, 'mapviz.js'), 'mapkit'].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), maxBuffer: 64 << 20 });
  const base = ['--target', 'mowas2', '--game', F.gameDir];
  let r = run(['list'].concat(base));
  eq(r.status, 0, 'cli list exit'); eq(r.stdout, 'multi/mv_fixture\tloose\tbattle_zones,combat,frontline\n', 'cli list text');
  r = run(['list', '--json'].concat(base));
  const lj = JSON.parse(r.stdout);
  eq([lj.v, lj.target, lj.stack.hash, lj.maps.length], [1, 'mowas2', 'da39a3ee5e6b4b0d', 1], 'cli list --json');
  const outL = path.join(W, 'cli-list');
  r = run(['list', '--out', outL].concat(base));
  ok(r.status === 0 && fs.existsSync(path.join(outL, 'maps.json')) && JSON.parse(fs.readFileSync(path.join(outL, 'reads.json'), 'utf8')).inputs.length === 1, 'cli list --out writes maps.json + reads.json (one map folder)');
  r = run(['doc', '--map', F.map, '--json'].concat(base));
  eq(r.status, 0, 'cli doc exit');
  const dj = JSON.parse(r.stdout);
  ok(diff(dj, ANS.as2.doc.a, 'doc', []).length === 0, 'cli doc --json equals fxanswers');
  const outD = path.join(W, 'cli-doc');
  r = run(['doc', '--map', F.map, '--out', outD].concat(base));
  ok(r.status === 0 && fs.existsSync(path.join(outD, 'mapdoc.json')) && fs.existsSync(path.join(outD, 'reads.json')), 'cli doc --out');
  ok(!/\r/.test(fs.readFileSync(path.join(outD, 'mapdoc.json'), 'utf8')), 'cli doc --out: LF JSON');
  r = run(['doc', '--map', 'multi/none', '--json'].concat(base));
  eq(r.status, 3, 'cli doc of an absent map exits 3');
  eq(JSON.parse(r.stdout).error.code, 'MV_NOT_FOUND', 'cli doc absent map: JSON error');
  r = run(['doc', '--map', F.map, '--target', 'mowas2', '--game', path.join(W, 'nowhere')]);
  eq(r.status, 3, 'cli doc with no install exits 3');
  const outG = path.join(W, 'cli-grids');
  r = run(['grids', '--map', G.map, '--out', outG, '--target', 'goh', '--game', G.gameDir, '--mode', 'battle_zones']);
  eq(r.status, 0, 'cli grids exit (GoH, --mode)');
  const gj = JSON.parse(fs.readFileSync(path.join(outG, 'grids.json'), 'utf8'));
  eq([gj.v, gj.map, gj.mode, gj.w, gj.files], [1, G.map, 'battle_zones', -20, ['height.mvg', 'gtype.mvg', 'gtype.stored.mvg', 'material.mvg']], 'cli grids.json');
  const hg = GF.read(path.join(outG, 'height.mvg'));
  eq([hg.w, hg.h, hg.cell], [256, 192, 5], 'cli grids: GoH height grid read back');
  ok(fs.existsSync(path.join(outG, 'reads.json')), 'cli grids reads.json');
  r = run(['grids', '--map', G.map, '--target', 'goh', '--game', G.gameDir]);
  eq(r.status, 2, 'cli grids without --out exits 2');
  r = run(['cell', '--map', F.map, '--at', '300,-200'].concat(base));
  eq(r.status, 0, 'cli cell exit'); eq(r.stdout, 'cell 94,28 h -10 type 5 material 6 stored 5\n', 'cli cell text');
  r = run(['cell', '--map', F.map, '--at', '411,-200', '--json'].concat(base));
  eq(JSON.parse(r.stdout), { v: 1, i: 105, j: 28, h: -50, hM: -2.5, type: 4, typeStored: 4, material: 5 }, 'cli cell --json');
  r = run(['cell', '--map', F.map, '--at', '9000,0', '--json'].concat(base));
  eq(r.status, 3, 'cli cell outside exits 3');
  r = run(['cell', '--map', F.map, '--at', 'x'].concat(base));
  eq(r.status, 2, 'cli cell with a bad --at exits 2');
  r = run(['list']);
  eq(r.status, 2, 'cli list without --target exits 2');
  r = run(['--help']);
  ok(r.status === 0 && /mapkit \(MV-KIT, wave A\)/.test(r.stdout) && /grids/.test(r.stdout), 'cli --help');
}

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('PASS mapviz mapkit (' + pass + ')');
