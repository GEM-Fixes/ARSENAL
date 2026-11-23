// entcat tests (MV-ENT): node tools/mapviz/entcat/test/entcat.test.js [scratch]
// Fixture in both forms (every entity: category, footprint kind, world polygon, heights), place(), objects.json against
// README 5.3, the CLI (def, map, stack: exit 0, 1 with the failed defs listed, 3), determinism, seeded defects (missing
// mdl, broken volume, 2-point obstacle polygon, unknown folder, unclosed block), the y sign of authored obstacles, and with
// real installs (skip with MAPVIZ_NO_GAME=1): the catalogs of MoW:AS2 multi/1v1_road and GoH multi/1v1_balzerweg with a
// spot check of ten vanilla objects and the y sign on real asymmetric objects. Last line: PASS mapviz entcat (N).
// Author: Imperator_Aug (ARSENAL, ia-beb98c73)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-entcat-')));
fs.mkdirSync(scratch, { recursive: true });
if (!process.env.ARSENAL_CACHE) process.env.ARSENAL_CACHE = path.join(scratch, 'cache');

const ROOT = path.resolve(__dirname, '..', '..');            // tools/mapviz
const MV = path.join(ROOT, 'mapviz.js');
const fx = require(path.join(ROOT, 'test', 'fxmake'));
const mk = require(path.join(ROOT, 'lib', 'mapkit'));
const E = require(path.join(ROOT, 'entcat'));
const cli = require(path.join(ROOT, 'entcat', 'cli'));

let n = 0;
function die(what) { console.log('FAIL mapviz entcat: ' + what); process.exit(1); }
function ok(c, what) { n++; if (!c) die(what); }
const near = (a, b, t) => Math.abs(a - b) <= (t === undefined ? 1e-3 : t);
const CRLF = s => s.replace(/\r?\n/g, '\r\n');

// two polygons hold the same points (any order, any start)
function samePts(a, b, t) {
  if (!a || !b || a.length !== b.length) return false;
  const left = b.slice();
  for (const p of a) {
    const i = left.findIndex(q => near(p[0], q[0], t) && near(p[1], q[1], t));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}
function rectPts(x, y, yaw, hx, hy) {
  const a = yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([u, v]) => [x + c * u - s * v, y + s * u + c * v]);
}
function run(args, env) {
  const r = cp.spawnSync(process.execPath, [MV, 'entcat'].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

// ---------------------------------------------------------------- module shape
ok(E.VERSION === 2 && cli.version === E.VERSION && cli.part === 'entcat' && typeof cli.run === 'function', 'cli shape / VERSION');
ok(['def', 'map', 'stack'].every(c => cli.commands[c]), 'cli commands def, map, stack');
ok(JSON.stringify(E.CATEGORIES) === JSON.stringify(['building', 'building_part', 'wall', 'fence', 'emplacement', 'tree', 'bush', 'rock', 'wreck',
  'bridge', 'water_surface', 'ground_decal', 'road_decal', 'crater', 'service', 'placed_unit', 'other']), 'CATEGORIES');

// ---------------------------------------------------------------- category rules on def paths (no game branch: one rule set)
{
  const C = require(path.join(ROOT, 'entcat', 'category'));
  const DEC = { props: [], tags: [], structure: null, obstacleIds: {}, decal: { sprite: 'x.mtl' }, mdl: null };
  const MDL = { props: [], tags: [], structure: null, obstacleIds: {}, decal: null, mdl: 'x.mdl' };
  const cat = (key, desc, has) => { const nm = key.split('/').pop().replace(/\.def$/, ''); const r = C.categorize({ key, name: nm, desc, size: null, has }); return r.category + '/' + r.rule; };
  const E_ = 'resource/entity/';
  const CASES = [
    // GoH texture patches in road folders and patch stamps: ground decals; real road stamps stay road decals
    [E_ + 'landscape/stamp/_summer/road/grass_pathways_large.def', DEC, null, 'ground_decal/stamp-patch'],
    [E_ + 'landscape/stamp/_summer/road/grass_pathways.def', DEC, null, 'ground_decal/stamp-patch'],
    [E_ + 'landscape/stamp/_summer/landscape/path_patch.def', DEC, null, 'ground_decal/stamp-patch'],
    [E_ + 'landscape/stamp/road/dirt_smudge.def', DEC, null, 'ground_decal/stamp-patch'],
    [E_ + 'landscape/stamp/_summer/road/dirt_road_splatter.def', DEC, null, 'ground_decal/stamp-patch'],
    [E_ + 'landscape/stamp/rail/strand_cable_cond1.def', DEC, null, 'ground_decal/stamp-patch'],   // MoW:AS2 and GoH _common/rail
    [E_ + 'landscape/stamp/_summer/road/country_road_sum.def', DEC, null, 'road_decal/stamp-road'],
    [E_ + 'landscape/stamp/road/road_cross1.def', DEC, null, 'road_decal/stamp-road'],
    [E_ + 'landscape/stamp/_common/town/stone_pathway.def', DEC, null, 'ground_decal/stamp'],
    // overhead line wires: other, before the part-folder rule; the posts stay building parts
    [E_ + 'construction/_road_work/electrical_posts/cabled_post2b/cp2b_wire/cp2b_wire.def', MDL, () => true, 'other/line-wire'],
    [E_ + 'construction/_road_work/electrical_posts/cabled_post2e/cp2e_wire2/cp2e_wire2.def', MDL, () => true, 'other/line-wire'],
    [E_ + 'construction/_road_work/electrical_posts/x/cp2b_wire_x/cp2b_wire_x.def', MDL, null, 'other/line-wire'],
    [E_ + 'construction/railway/elevator1/cable_1/cable_1.def', MDL, () => true, 'other/line-wire'],   // MoW:AS2 and AS64
    [E_ + 'construction/_road_work/electrical_posts/cabled_post2b/cp2b_post/cp2b_post.def', MDL, () => true, 'building_part/part-folder'],
    // fence and obstacle wires keep their rules; a helmet named *_wire is no construction
    [E_ + 'construction/fence/wires_square/wire_left/wire_left.def', MDL, () => true, 'building_part/part-folder'],
    [E_ + 'construction/fence/wires1/wires1.def', MDL, null, 'fence/fence'],
    [E_ + 'construction/_rural/fences/fence_wire_01/fence_wire_01.def', MDL, null, 'fence/fence'],
    [E_ + 'construction/_military/obstacles/barbed_wire_finland/wire_fin1/wire_fin1.def', MDL, () => true, 'building_part/part-folder'],
    [E_ + 'inventory/-gear_wearable/head/ger_m40_helmet_wire/ger_m40_helmet_wire.def', MDL, null, 'other/other'],
    // sound emitters: service
    [E_ + 'sfx/legacy/fire_loop.def', { props: [], tags: [], structure: null, obstacleIds: {}, decal: null, mdl: null }, null, 'service/sfx'],
  ];
  for (const [k, d, has, want] of CASES) { const got = cat(k, d, has); ok(got === want, 'category ' + k + ': ' + got + ', want ' + want); }
}

// ---------------------------------------------------------------- fixture, both forms
const WANT = {   // def -> category, footprint kind (entity), half sizes (u), zMax (u)
  fx_tree: { cat: 'tree', kind: 'obb', half: [6, 6], z: 160 },
  fx_wall: { cat: 'wall', kind: 'obb', half: [40, 3], z: 24 },
  fx_house: { cat: 'building', kind: 'obb', half: [80, 60], z: 120 },
  fx_bush: { cat: 'bush', kind: 'box-proj', half: [20, 20], z: 24 },
  // {Sprite "fx_road.mtl" {Scale 1}}: Scale is a sprite scale channel, so the engine skips r_stampResolutionScale
  // 64 px x Scale 1 = 64 u [V, I corner size = px]
  fx_road: { cat: 'road_decal', kind: 'decal', half: [32, 32], z: 0 },
};
const forms = {};
for (const form of ['as2', 'goh']) {
  const dir = path.join(scratch, 'fx-' + form);
  const m = fx.make(dir, { form });
  const src = mk.source({ target: m.target, game: m.gameDir, modDirs: m.modDirs });
  const doc = mk.doc(src, m.map, {});
  const mapDoc = Object.assign({}, doc, { entities: doc.entities.filter(e => e.src === 'map') });
  const cat = E.forDoc(src, mapDoc, {});
  forms[form] = { m, src, doc, cat };
  ok(cat.v === 1 && cat.target === m.target && cat.stackHash === src.stackHash, form + ': catalog head');
  ok(cat.failed.length === 0, form + ': fixture defs failed: ' + JSON.stringify(cat.failed));
  ok(JSON.stringify(Object.keys(cat.entries)) === JSON.stringify(Object.keys(WANT).sort()), form + ': entries keyed by def name, sorted: ' + Object.keys(cat.entries));
  for (const [d, w] of Object.entries(WANT)) {
    const en = cat.entries[d];
    ok(en.def === d && /^resource\/entity\//.test(en.path) && en.path.endsWith('/' + d + '.def'), form + ' ' + d + ': def and path');
    ok(en.category === w.cat, form + ' ' + d + ': category ' + en.category + ', want ' + w.cat);
    ok(en.footprint && en.footprint.kind === w.kind, form + ' ' + d + ': footprint ' + (en.footprint && en.footprint.kind) + ', want ' + w.kind);
    ok(d === 'fx_road' ? en.height === null : near(en.height, w.z), form + ' ' + d + ': height ' + en.height);
  }
  // sources: authored for the three with {Obstacle}, volume box for the bush (obstacle 0), decal for the road
  ok(['fx_tree', 'fx_wall', 'fx_house'].every(d => cat.entries[d].footprint.source === 'authored'), form + ': authored footprints');
  ok(cat.entries.fx_bush.footprint.source === 'volumes', form + ': bush footprint from the volume box');
  // volumes keep visible, contact and obstacle apart
  const bushV = cat.entries.fx_bush.volumes[0], treeV = cat.entries.fx_tree.volumes[0];
  ok(bushV.name === 'crown' && bushV.able.visible && !bushV.able.bullet && !bushV.able.obstacle && bushV.able.contact, form + ': bush ables ' + JSON.stringify(bushV.able));
  ok(treeV.able.visible && treeV.able.bullet && treeV.able.obstacle && near(treeV.zMin, 0) && near(treeV.zMax, 160), form + ': tree volume');
  ok(cat.entries.fx_bush.cover.conceal && !cat.entries.fx_bush.cover.hard && cat.entries.fx_bush.cover.band === 'none', form + ': bush conceals, no cover');
  ok(cat.entries.fx_wall.cover.hard && cat.entries.fx_wall.cover.band === 'kneel', form + ': 1.2 m wall = kneel band');
  ok(cat.entries.fx_house.cover.band === 'stand' && cat.entries.fx_house.sight.hard, form + ': house band stand, sight hard');
  ok(!cat.entries.fx_bush.sight.hard && cat.entries.fx_bush.sight.enters, form + ': bush sight soft');
  ok(cat.entries.fx_wall.obstacleId === 'small_building' && cat.entries.fx_bush.obstacleId === 'nothing', form + ': obstacle ids');
  // place: every map entity, world polygon and heights
  const objs = E.place(mapDoc, cat);
  ok(objs.length === fx.SPEC.entities.length, form + ': objects ' + objs.length);
  for (const s of fx.SPEC.entities) {
    const o = objs.find(x => x.uid === s.uid);
    ok(o && o.def === s.def, form + ': object ' + s.uid);
    const w = WANT[s.def], sc = s.scale == null ? 1 : s.scale;
    ok(o.category === w.cat && o.fp.kind === w.kind, form + ' ' + s.uid + ': category / kind');
    const want = rectPts(s.x, s.y, s.yaw || 0, w.half[0] * sc, w.half[1] * sc);
    ok(samePts(o.fp.pts, want, 1e-3), form + ' ' + s.uid + ' ' + s.def + ': polygon ' + JSON.stringify(o.fp.pts) + ', want ' + JSON.stringify(want));
    ok(o.zMin === 0 && near(o.zMax, w.z * sc), form + ' ' + s.uid + ': zMin/zMax ' + o.zMin + '/' + o.zMax);
    ok(JSON.stringify(E.footprintOf(cat.entries[s.def], s)) === JSON.stringify(o.fp), form + ' ' + s.uid + ': footprintOf = place fp');
  }
}

// ---------------------------------------------------------------- place: structure parts (pure)
{
  const sq = { kind: 'obb', source: 'authored', rotate: true, zones: [{ kind: 'obb', center: [0, 0], half: [5, 5], axis: [1, 0], rotate: true }] };
  const part = d => ({ def: d, category: 'building_part', footprint: sq, box: { min: [-5, -5, 0], max: [5, 5, 30] } });
  const cat = { entries: {
    root: { def: 'root', category: 'building', footprint: null, box: null,
      structure: { parts: [{ place: '1', def: 'pa', x: 100, y: 0, z: 0, yaw: 0 }, { place: '2', def: 'pb', x: 0, y: 50, z: 40, yaw: 90 }] } },
    pa: part('pa'), pb: part('pb'), pa_x: part('pa_x'),
  } };
  // file order as in multi/1v1_road: the linked records come right after an unrelated entity, far from their root
  const doc = { entities: [
    { uid: 7, def: 'pa', x: 900, y: 900, yaw: 0, scale: 1 },
    { uid: 2, def: 'pa_x', x: null, y: null, yaw: 0, scale: 1 },
    { uid: 3, def: 'pb', x: null, y: null, yaw: 0, scale: 1 },
    { uid: 1, def: 'root', x: 10, y: 20, yaw: 90, scale: 1 },
    { uid: 5, def: 'root', x: 500, y: 0, yaw: 0, scale: 1 },
    { uid: 6, def: 'root', x: -500, y: 0, yaw: 0, scale: 1 },
  ] };
  const links = { parts: { 2: { root: 1, place: '1' }, 3: { root: 5, place: '2' } },
    seats: { 5: { 1: { unlinked: true }, 2: { unlinked: true } }, 6: { 1: { unlinked: true }, 2: { unlinked: false, entity: 'pa_x' } } } };
  const objs = E.place(doc, cat, links);
  const by = u => objs.filter(o => o.uid === u);
  ok(objs.length === 1 + 3 + 2 + 2, 'structure: pa + root 1 (2 parts) + root 5 (1 linked part) + root 6 (1 swapped part), got ' + objs.length + ' ' + JSON.stringify(objs.map(o => o.uid + ':' + o.def)));
  ok(by(7).length === 1 && samePts(by(7)[0].fp.pts, rectPts(900, 900, 0, 5, 5)), 'structure: the entity before the parts gets none of them');
  const r1 = by(1);
  ok(r1.length === 2 && r1[0].fp.kind === 'none' && r1[1].def === 'pb', 'structure: root 1 + its implicit part pb under the root uid ' + JSON.stringify(r1));
  const a = by(2);
  ok(a.length === 1 && a[0].def === 'pa_x' && samePts(a[0].fp.pts, rectPts(10, 120, 90, 5, 5)), 'structure: out-of-order linked part on its seat ' + JSON.stringify(a));
  ok(samePts(r1[1].fp.pts, rectPts(-40, 20, 180, 5, 5)) && r1[1].zMin === 40 && r1[1].zMax === 70, 'structure: implicit part ' + JSON.stringify(r1[1]));
  const b = by(3);
  ok(b.length === 1 && b[0].def === 'pb' && samePts(b[0].fp.pts, rectPts(500, 50, 90, 5, 5)), 'structure: a link wins over the {Unlinked} of its seat ' + JSON.stringify(b));
  ok(by(5).length === 1, 'structure: root 5 seat 1 {Unlinked}: no part spawned');
  const r6 = by(6);
  ok(r6.length === 2 && r6[1].def === 'pa_x' && samePts(r6[1].fp.pts, rectPts(-500, 50, 90, 5, 5)), 'structure: seat 2 swapped by {Entity}, seat 1 {Unlinked} ' + JSON.stringify(r6));
  ok(objs.notes.length === 0, 'structure: no notes ' + JSON.stringify(objs.notes));
  // no links at all: a record with no position is never put on the entity before it
  const bare = E.place(doc, cat);
  ok(bare.filter(o => o.uid === 2 || o.uid === 3).length === 0 && bare.notes.filter(x => x.code === 'ENTCAT_PART_UNPLACED').length === 2, 'structure: unlinked records left out with ENTCAT_PART_UNPLACED');
  ok(!Object.keys(bare).includes('notes') && JSON.stringify(bare).startsWith('['), 'place notes are not enumerable');
  // a link to a host that is not placed
  const lost = E.place({ entities: [{ uid: 2, def: 'pa', x: null, y: null }] }, cat, { parts: { 2: { root: 99, place: '1' } } });
  ok(lost.length === 0 && lost.notes[0].code === 'ENTCAT_PART_UNPLACED', 'structure: link to a missing root noted');
  // a mapdoc entity carrying link {root, place} itself (a later mapdoc field) is read the same way
  const viaDoc = E.place({ entities: [{ uid: 1, def: 'root', x: 10, y: 20, yaw: 90 }, { uid: 2, def: 'pa_x', x: null, y: null, link: { root: 1, place: '1' } }] }, cat);
  ok(viaDoc.some(o => o.uid === 2 && samePts(o.fp.pts, rectPts(10, 120, 90, 5, 5))), 'structure: entities[].link read');
  // bad input: NaN position, footprintOf without placed
  const nan = E.place({ entities: [{ uid: 9, def: 'pa', x: NaN, y: 0 }, { uid: 10, def: 'pa', x: '12', y: 3 }] }, cat);
  ok(nan.length === 0 && nan.notes.length === 2 && nan.notes.every(x => x.code === 'ENTCAT_BAD_POSITION'), 'place: NaN or text position -> ENTCAT_BAD_POSITION, not 0,0 ' + JSON.stringify(nan.notes));
  let fo = null;
  try { fo = E.footprintOf(cat.entries.pa); } catch (e) { fo = null; }
  ok(fo && samePts(fo.pts, rectPts(0, 0, 0, 5, 5)), 'footprintOf without placed: at the origin');
  ok(E.footprintOf(null).kind === 'none' && E.footprintOf(cat.entries.pa, { x: 1, y: 2, scale: 'x' }).pts.length === 4, 'footprintOf: no entry, bad scale');
}

// ---------------------------------------------------------------- the fit at the placed scale (IsObstacleShape after scale)
{
  const hull = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // one obstacle volume 0..6 u high (0.3 m): no obstacle at scale 1 (highest < 8 u), an obstacle at scale 2 (12 u)
  const low = { def: 'low', category: 'other', box: { min: [-10, -4, 0], max: [10, 4, 6] },
    footprint: { kind: 'box-proj', source: 'volumes', rotate: true, zones: [{ kind: 'obb', center: [0, 0], half: [10, 4], axis: [1, 0] }],
      scaled: { compound: false, ok1: [false], box: { kind: 'obb', center: [0, 0], half: [10, 4], axis: [1, 0] }, source: 'volumes',
        vols: [{ zMin: 0, zMax: 6, n: 8, mean: [0, 0], hull: hull(-10, -4, 10, 4) }] } } };
  const f1 = E.footprintOf(low, { x: 0, y: 0, scale: 1 }), f2 = E.footprintOf(low, { x: 0, y: 0, scale: 2 });
  ok(f1.kind === 'box-proj' && samePts(f1.pts, rectPts(0, 0, 0, 10, 4)), 'scaled fit: scale 1 keeps the volume box');
  ok(f2.kind === 'obb' && samePts(f2.pts, rectPts(0, 0, 0, 20, 8)), 'scaled fit: scale 2 makes it an obstacle fit ' + JSON.stringify(f2));
  // a volume 20..30 u high: an obstacle at scale 1 (lowest 20 <= 24), not at scale 2 (lowest 40): back to the volume box
  const high = JSON.parse(JSON.stringify(low));
  high.footprint = { kind: 'obb', source: 'fit', rotate: true, zones: [{ kind: 'obb', center: [0, 0], half: [10, 4], axis: [1, 0], hull: hull(-10, -4, 10, 4), mean: [0, 0] }],
    scaled: { compound: false, ok1: [true], box: { kind: 'obb', center: [0, 0], half: [12, 6], axis: [1, 0] }, source: 'volumes',
      vols: [{ zMin: 20, zMax: 30, n: 8, mean: [0, 0], hull: hull(-10, -4, 10, 4) }] } };
  const g2 = E.footprintOf(high, { x: 0, y: 0, scale: 2 });
  ok(g2.kind === 'box-proj' && samePts(g2.pts, rectPts(0, 0, 0, 24, 12)), 'scaled fit: scale 2 lifts it out of the obstacle band ' + JSON.stringify(g2));
}

// ---------------------------------------------------------------- sound emitter with no model: service, not failed (3 targets)
for (const [form, target] of [['as2', 'mowas2'], ['as2', 'as64'], ['goh', 'goh']]) {
  const m = fx.make(path.join(scratch, 'fx-sfx-' + target), { form });
  const put = (rel, text) => { const p = path.join(m.gameDir, 'resource', 'entity', ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, CRLF(text)); };
  put('sfx/legacy/fx_sfxloop.def', '{game_entity\n\t{Extension "sound.mdl"}\n}\n');
  put('fx/fx_nosfx.def', '{game_entity\n\t{Extension "sound.mdl"}\n}\n');   // the same def outside sfx/: still a failed def
  const src = mk.source({ target, game: m.gameDir, modDirs: m.modDirs });
  const cat = E.catalog(src, { defs: ['fx_sfxloop', 'fx_nosfx'] });
  const s = cat.entries.fx_sfxloop, T = target + ' sfx: ';
  ok(s && s.category === 'service' && s.categoryRule === 'sfx' && s.notes.some(x => x.code === 'ENTCAT_EXT_MISSING'), T + 'missing sound.mdl is a note, category service ' + JSON.stringify(s && { c: s.category, r: s.categoryRule, n: s.notes }));
  ok(cat.failed.length === 1 && cat.failed[0].def === 'fx_nosfx' && cat.failed[0].code === 'ENTCAT_MDL_MISSING', T + 'outside sfx/ a missing model still fails ' + JSON.stringify(cat.failed));
}

// ---------------------------------------------------------------- seeded defects + y sign on the fixture
{
  const dir = path.join(scratch, 'fx-seed');
  const m = fx.make(dir, { form: 'as2' });
  const F = path.join(m.gameDir, 'resource', 'entity', 'fx');
  const put = (rel, text) => { const p = path.join(m.gameDir, 'resource', 'entity', ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, CRLF(text)); };
  const plain = (mdl, extra) => '{game_entity\n\t{Extension "' + mdl + '"}\n\t{obstacleID "construction"}\n\t{props "construction"}\n' + (extra || '') + '}\n';
  const boxMdl = (bone, orient, pos, box, obst) => '{Skeleton\n\t{bone "' + bone + '"\n\t\t{Orientation\n\t\t\t' + orient.join('\n\t\t\t') + '\n\t\t}\n\t}\n}\n' +
    (obst || '') + '{Volume "body"\n\t{Box ' + box.join(' ') + '}\n\t{Bone "' + bone + '"}\n\t{Position ' + pos.join(' ') + '}\n}\n';
  const MIRROR = ['1 0 0', '0 -1 0', '0 0 1'], ID = ['1 0 0', '0 1 0', '0 0 1'];
  put('fx/fx_badmdl.def', plain('fx_nothere.mdl'));
  put('fx/fx_badvol.def', plain('fx_wall.mdl', '\t{Volume {able {bullet 0}}}\n'));
  put('fx/fx_poly2.mdl', boxMdl('fx_poly2', ID, [0, 0, 20], [40, 40, 40], '{Obstacle "body"\n\t{Polygon2\n\t\t{Vertex 0 0}\n\t\t{Vertex 10 0}\n\t}\n\t{Rotate}\n}\n'));
  put('fx/fx_poly2.def', plain('fx_poly2.mdl'));
  put('zz_unknown/fx_odd/fx_odd.mdl', boxMdl('fx_odd', ID, [0, 0, 10], [20, 20, 20]));
  put('zz_unknown/fx_odd/fx_odd.def', '{game_entity\n\t{Extension "fx_odd.mdl"}\n}\n');
  put('fx/fx_unclosed.def', '{game_entity\n\t{Extension "fx_wall.mdl"}\n');
  // y sign: a bone mirrored in y (as vanilla AS2 exports), volume at y -20 in bone space = +20 in entity space
  put('fx/fx_yaut.mdl', boxMdl('fx_yaut', MIRROR, [30, -20, 10], [20, 10, 20], '{Obstacle "body"\n\t{Obb2\n\t\t{Center 30 20}\n\t\t{Extent 10 5}\n\t\t{Axis 1 0}\n\t}\n\t{Rotate}\n}\n'));
  put('fx/fx_yaut.def', plain('fx_yaut.mdl'));
  put('fx/fx_yfit.mdl', boxMdl('fx_yfit', MIRROR, [30, -20, 10], [20, 10, 20]));
  put('fx/fx_yfit.def', plain('fx_yfit.mdl'));
  const src = mk.source({ target: m.target, game: m.gameDir });
  const defs = ['fx_badmdl', 'fx_badvol', 'fx_poly2', 'fx_odd', 'fx_unclosed', 'fx_yaut', 'fx_yfit', 'fx_wall', 'fx_nosuchdef'];
  const cat = E.catalog(src, { defs });
  const code = d => (cat.failed.find(f => f.def === d) || {}).code;
  ok(code('fx_badmdl') === 'ENTCAT_MDL_MISSING', 'seed: missing mdl -> ENTCAT_MDL_MISSING, got ' + code('fx_badmdl'));
  ok(code('fx_badvol') === 'ENTCAT_VOLUME_BAD', 'seed: broken volume -> ENTCAT_VOLUME_BAD, got ' + code('fx_badvol'));
  ok(code('fx_unclosed') === 'ENTCAT_DEF_PARSE', 'seed: unclosed block -> ENTCAT_DEF_PARSE, got ' + code('fx_unclosed'));
  ok(code('fx_nosuchdef') === 'ENTCAT_DEF_MISSING', 'seed: no def -> ENTCAT_DEF_MISSING');
  ok(cat.failed.length === 4 && cat.entries.fx_wall && cat.entries.fx_poly2 && cat.entries.fx_odd, 'seed: the catalog goes on past failed defs');
  const p2 = cat.entries.fx_poly2;
  ok(p2.notes.some(x => x.code === 'ENTCAT_OBSTACLE_DEGENERATE'), 'seed: 2-point polygon noted');
  ok(p2.footprint.source === 'fit' && p2.footprint.kind === 'obb' && near(p2.footprint.zones[0].half[0], 20) && near(p2.footprint.zones[0].half[1], 20), 'seed: 2-point polygon falls back to the fit ' + JSON.stringify(p2.footprint));
  ok(cat.entries.fx_odd.category === 'other' && cat.entries.fx_odd.categoryRule === 'other', 'seed: unknown folder -> other');
  const ya = cat.entries.fx_yaut, yf = cat.entries.fx_yfit;
  ok(near(ya.box.min[1], 15) && near(ya.box.max[1], 25), 'y sign: mirrored-bone volume lands at y +15..+25, got ' + ya.box.min[1] + '..' + ya.box.max[1]);
  ok(ya.footprint.source === 'authored' && near(ya.footprint.zones[0].center[1], 20), 'y sign: authored Obb2 centre y +20');
  const fa = E.footprintOf(ya, { x: 0, y: 0, yaw: 0 }), ff = E.footprintOf(yf, { x: 0, y: 0, yaw: 0 });
  ok(samePts(fa.pts, rectPts(30, 20, 0, 10, 5)) && samePts(ff.pts, fa.pts), 'y sign: authored obstacle = fit of the volume points ' + JSON.stringify(fa.pts) + ' ' + JSON.stringify(ff.pts));
  // the engine fits world points: a 45 deg placed fit is refitted (OBB of the turned box or the circle, the smaller)
  const f45 = E.footprintOf(yf, { x: 0, y: 0, yaw: 45 });
  ok(f45.kind === 'obb' || f45.kind === 'circle', 'fit refitted in world space: ' + f45.kind);
  // the CLI def on a seeded failure exits 1 and lists it
  const r = run(['def', '--target', 'mowas2', '--game', m.gameDir, '--def', 'fx_badvol', '--json']);
  let body = null;
  try { body = JSON.parse(r.out); } catch (e) { body = null; }
  ok(r.code === 1 && body && body.failed[0].code === 'ENTCAT_VOLUME_BAD', 'cli def on a broken def: exit 1, listed (' + r.code + ' ' + r.out + r.err + ')');

  // structure root in the map file: an out-of-order {Link}, an {Unlinked} seat, a record with no position and no link
  put('fx/fx_struct.mdl', '{Skeleton\n\t{bone "fx_struct"\n\t\t{bone "p1"\n\t\t\t{Position 40 0 0}\n\t\t}\n\t\t{bone "p2"\n\t\t\t{Position -40 0 0}\n\t\t}\n\t}\n}\n' +
    '{Volume "body"\n\t{Box 20 20 20}\n\t{Bone "fx_struct"}\n\t{Position 0 0 10}\n}\n');
  put('fx/fx_struct.def', plain('fx_struct.mdl', '\t{Extender "structure"\n\t\t{place "p1" "fx_part"}\n\t\t{place "p2" "fx_part"}\n\t}\n'));
  put('fx/fx_part.mdl', boxMdl('fx_part', ID, [0, 0, 5], [10, 10, 10]));
  put('fx/fx_part.def', plain('fx_part.mdl'));
  const mapFile = path.join(m.gameDir, 'resource', 'map', ...m.map.split('/'), 'map');
  const mt = fs.readFileSync(mapFile, 'latin1');
  const cut = mt.lastIndexOf('}');
  fs.writeFileSync(mapFile, mt.slice(0, cut) + CRLF('\t{Entity "fx_part" 0x2002\n\t\t{TexMod "a"}\n\t}\n\t{Entity "fx_part" 0x2003\n\t}\n' +
    '\t{Entity "fx_struct" 0x2001\n\t\t{Position 300 -300}\n\t\t{Placer\n\t\t\t{State "p2"\n\t\t\t\t{Unlinked}\n\t\t\t}\n\t\t}\n\t}\n' +
    '\t{Link 0x2002 {0x2001 "p1"}}\n') + mt.slice(cut), 'latin1');
  const lk = require(path.join(ROOT, 'entcat', 'links')).linksOf(mk.source({ target: m.target, game: m.gameDir }), m.map, {});
  ok(lk.parts[0x2002] && lk.parts[0x2002].root === 0x2001 && lk.parts[0x2002].place === 'p1', 'links: {Link} read ' + JSON.stringify(lk.parts));
  ok(lk.seats[0x2001] && lk.seats[0x2001].p2 && lk.seats[0x2001].p2.unlinked === true, 'links: {Unlinked} seat read ' + JSON.stringify(lk.seats));
  const rs = run(['map', '--target', 'mowas2', '--game', m.gameDir, '--map', m.map, '--out', path.join(scratch, 'cli-map-struct'), '--json']);
  let sb = null;
  try { sb = JSON.parse(rs.out); } catch (e) { sb = null; }
  ok(rs.code === 0 && sb, 'cli map with a structure: exit 0 (' + rs.code + ' ' + rs.err + ')');
  const so = JSON.parse(fs.readFileSync(path.join(scratch, 'cli-map-struct', 'objects.json'), 'utf8')).items;
  const p2002 = so.filter(o => o.uid === 0x2002), p2001 = so.filter(o => o.uid === 0x2001);
  ok(p2002.length === 1 && samePts(p2002[0].fp.pts, rectPts(340, -300, 0, 5, 5)), 'cli map: linked part on seat p1 of its root ' + JSON.stringify(p2002));
  ok(p2001.length === 1 && !so.some(o => o.uid === 0x2003), 'cli map: seat p2 {Unlinked} spawns nothing, the unlinked record is left out ' + JSON.stringify(p2001));
  ok(sb.notes.some(x => x.code === 'ENTCAT_PART_UNPLACED' && x.uid === 0x2003), 'cli map: ENTCAT_PART_UNPLACED in --json notes ' + JSON.stringify(sb.notes));
  ok(so.filter(o => o.uid === 0x1008).length === 1, 'cli map: the record before the parts keeps only itself');
  // the mapdoc carries the links itself (entities[].link, entities[].seats): place() needs no links arg and links.js is not
  // read; an old doc without them falls back to links.js and places the same objects
  const msrc = mk.source({ target: m.target, game: m.gameDir });
  const ndoc = mk.doc(msrc, m.map, {});
  const nsub = Object.assign({}, ndoc, { entities: ndoc.entities.filter(e => e.src === 'map') });
  const odoc = Object.assign({}, nsub, { entities: nsub.entities.map(e => { const x = Object.assign({}, e); delete x.link; delete x.seats; return x; }) });
  ok(E.docHasLinks(nsub) && !E.docHasLinks(odoc), 'docHasLinks: new doc yes, old doc no');
  ok(E.linksFor(msrc, m.map, nsub, {}) === null, 'linksFor: null for a doc with links');
  const olinks = E.linksFor(msrc, m.map, odoc, {});
  ok(olinks && olinks.parts[0x2002] && olinks.parts[0x2002].root === 0x2001, 'linksFor: an old doc reads links.js');
  const ncat = E.forDoc(msrc, nsub, {});
  const fromDoc = E.place(nsub, ncat), fromOld = E.place(odoc, ncat, olinks);
  const kf = o => o.uid + ':' + o.def + ':' + JSON.stringify(o.fp && o.fp.pts);
  ok(JSON.stringify(fromDoc.map(kf).sort()) === JSON.stringify(fromOld.map(kf).sort()), 'place from the doc links = place from links.js on the old doc');
  ok(fromDoc.filter(o => o.uid === 0x2002).length === 1 && fromDoc.notes.some(x => x.code === 'ENTCAT_PART_UNPLACED' && x.uid === 0x2003), 'place from the doc: part on its seat, unplaced note');
  // a doc seat with an {Entity} swap: forDoc catalogs the swapped def, place spawns it
  const sdoc = Object.assign({}, nsub, { entities: nsub.entities.map(e => (e.uid === 0x2001 ? Object.assign({}, e, { seats: { p2: { unlinked: false, entity: null, def: 'fx_poly2' } } }) : e)) });
  const scat = E.forDoc(msrc, sdoc, {});
  const sp = E.place(sdoc, scat).filter(o => o.uid === 0x2001);
  ok(!!scat.entries.fx_poly2 && sp.length === 2 && sp[1].def === 'fx_poly2', 'doc seat swap: def cataloged and spawned on seat p2 ' + JSON.stringify(sp.map(o => o.def)));
  // cli map with an old mapdoc.json in --in: links.js read, the same objects
  const inDir = path.join(scratch, 'old-doc');
  fs.mkdirSync(inDir, { recursive: true });
  const fullOld = Object.assign({}, ndoc, { entities: ndoc.entities.map(e => { const x = Object.assign({}, e); delete x.link; delete x.seats; return x; }) });
  fs.writeFileSync(path.join(inDir, 'mapdoc.json'), JSON.stringify(fullOld));
  const ro = run(['map', '--target', 'mowas2', '--game', m.gameDir, '--map', m.map, '--in', inDir, '--out', path.join(scratch, 'cli-map-old'), '--json']);
  const oo = ro.code === 0 ? JSON.parse(fs.readFileSync(path.join(scratch, 'cli-map-old', 'objects.json'), 'utf8')).items : [];
  ok(oo.length > 0 && JSON.stringify(oo.map(kf).sort()) === JSON.stringify(so.map(kf).sort()), 'cli map with an old mapdoc.json: links.js read, the same objects (' + ro.code + ' ' + ro.err + ')');
}

// ---------------------------------------------------------------- release: the same catalog with the scenes dropped on the way
{
  const { src, cat } = forms.as2;
  const L2 = require(path.resolve(ROOT, '..', 'lib', 'model', 'scenecache')).open({ target: src.target, game: src.game, modDirs: src.modDirs, vfs: src.vfs });
  const rel = E.catalog(src, { defs: Object.keys(cat.entries), loader: L2, release: 2 });
  ok(JSON.stringify(rel.entries) === JSON.stringify(cat.entries), 'release: catalog with the scenes dropped every 2 defs = the plain one');
  ok(E.readsOf(L2).some(x => /fx_house\.mdl$/.test(x.file)) && E.readsOf(L2).some(x => /fx_bush\.mdl$/.test(x.file)), 'release: the reads before a release are kept');
}

// ---------------------------------------------------------------- CLI through mapviz.js + objects.json + determinism
{
  const { m } = forms.as2;
  const common = ['--target', m.target, '--game', m.gameDir, '--mod-dir', m.modDirs[0]];
  let r = run(['def', '--def', 'fx_house', '--json'].concat(common));
  let b = JSON.parse(r.out || 'null');
  ok(r.code === 0 && b && b.entry.category === 'building' && b.failed.length === 0, 'cli def: exit 0 ' + r.code + ' ' + r.err);
  r = run(['def', '--def', 'resource/entity/fx/fx_wall.def'].concat(common));
  ok(r.code === 0 && /fx_wall\s+wall/.test(r.out), 'cli def by vfs key, text out');
  r = run(['def', '--def', 'nope_not_here', '--json'].concat(common));
  ok(r.code === 3 && /MV_NOT_FOUND/.test(r.out), 'cli def missing: exit 3 (' + r.code + ')');
  const o1 = path.join(scratch, 'cli-map-1'), o2 = path.join(scratch, 'cli-map-2');
  r = run(['map', '--map', m.map, '--out', o1, '--json'].concat(common));
  b = JSON.parse(r.out || 'null');
  ok(r.code === 0 && b && b.failed.length === 0 && b.objects === 8, 'cli map: exit 0 (' + r.code + ' ' + r.err + ')');
  r = run(['map', '--map', m.map, '--out', o2].concat(common));
  ok(r.code === 0, 'cli map twice: exit 0');
  for (const f of ['entcat.json', 'objects.json', 'reads.json']) {
    ok(fs.readFileSync(path.join(o1, f)).equals(fs.readFileSync(path.join(o2, f))), 'determinism: ' + f + ' differs between two runs');
  }
  // objects.json, README 5.3
  const txt = fs.readFileSync(path.join(o1, 'objects.json'), 'latin1');
  ok(!/\r/.test(txt) && txt.endsWith('\n'), 'objects.json LF');
  const oj = JSON.parse(txt);
  ok(JSON.stringify(Object.keys(oj)) === JSON.stringify(['v', 'kind', 'name', 'items']) && oj.v === 1 && oj.kind === 'vector' && oj.name === 'objects', 'objects.json head');
  for (const it of oj.items) {
    ok(JSON.stringify(Object.keys(it)) === JSON.stringify(['kind', 'uid', 'def', 'category', 'fp', 'zMin', 'zMax']) && it.kind === 'object', 'objects.json item keys ' + Object.keys(it));
    ok(JSON.stringify(Object.keys(it.fp)) === JSON.stringify(['kind', 'pts']) && Array.isArray(it.fp.pts) && it.fp.pts.every(p => p.length === 2 && p.every(Number.isFinite)), 'objects.json fp');
    ok(E.CATEGORIES.includes(it.category), 'objects.json category id ' + it.category);
  }
  const rj = JSON.parse(fs.readFileSync(path.join(o1, 'reads.json'), 'utf8'));
  ok(rj.v === 1 && Array.isArray(rj.inputs) && rj.inputs.some(x => /fx_house\.mdl$/.test(x.file)) && rj.inputs.some(x => /map\.net$|mv_fixture/.test(x.file)), 'reads.json merges the source and the model loader');
  const ej = JSON.parse(fs.readFileSync(path.join(o1, 'entcat.json'), 'utf8'));
  ok(ej.v === 1 && ej.entries.fx_tree && Array.isArray(ej.failed), 'entcat.json');
  // --in mapdoc.json is used when it is there
  const din = path.join(scratch, 'cli-in');
  fs.mkdirSync(din, { recursive: true });
  fs.writeFileSync(path.join(din, 'mapdoc.json'), JSON.stringify(forms.as2.doc) + '\n');
  const o3 = path.join(scratch, 'cli-map-3');
  r = run(['map', '--map', m.map, '--in', din, '--out', o3].concat(common));
  ok(r.code === 0 && fs.readFileSync(path.join(o3, 'objects.json')).equals(fs.readFileSync(path.join(o1, 'objects.json'))), 'cli map --in mapdoc.json');
  // a mode whose records name defs the fixture lacks: exit 1, the failed defs listed
  r = run(['map', '--map', m.map, '--mode', 'battle_zones', '--out', path.join(scratch, 'cli-map-bz'), '--json'].concat(common));
  b = JSON.parse(r.out || 'null');
  ok(r.code === 1 && b && b.failed.length === 4 && b.failed.every(f => f.code === 'ENTCAT_DEF_MISSING') && b.failed.some(f => f.def === 'flag_point_1'), 'cli map with failed defs: exit 1, listed (' + r.code + ')');
  r = run(['map', '--map', m.map, '--mode', 'battle_zones', '--out', path.join(scratch, 'cli-map-bz2')].concat(common));
  ok(r.code === 1 && /failed flag_point_1 ENTCAT_DEF_MISSING/.test(r.err), 'cli map failed defs listed in text');
  r = run(['map', '--map', 'multi/no_such_map', '--out', path.join(scratch, 'cli-map-x'), '--json'].concat(common));
  ok(r.code === 3, 'cli map missing map: exit 3 (' + r.code + ')');
  r = run(['map', '--map', m.map, '--mode', 'no_mode', '--out', path.join(scratch, 'cli-map-y')].concat(common));
  ok(r.code === 3, 'cli map missing mode: exit 3 (' + r.code + ')');
  const os1 = path.join(scratch, 'cli-stack');
  r = run(['stack', '--out', os1, '--json'].concat(common));
  b = JSON.parse(r.out || 'null');
  ok(r.code === 0 && b && b.defs === 5 && fs.existsSync(path.join(os1, 'entcat.json')) && fs.existsSync(path.join(os1, 'reads.json')), 'cli stack: exit 0 (' + r.code + ' ' + r.err + ')');
  r = run(['map', '--map', m.map].concat(common));
  ok(r.code === 2, 'cli map without --out: usage exit 2');
}

// ---------------------------------------------------------------- real installs
function realGame(label, target, map, spots, ysign, want) {
  if (process.env.MAPVIZ_NO_GAME === '1') { console.log('skip ' + label + ': MAPVIZ_NO_GAME=1'); return; }
  const gd = require(path.resolve(ROOT, '..', 'lib', 'gamedir'));
  let dir = null;
  try { dir = target === 'goh' ? gd.goh() : (gd.resolve() || {}).dir; } catch (e) { dir = null; }
  if (!dir || !fs.existsSync(dir)) { console.log('skip ' + label + ': no ' + label + ' install'); return; }
  const src = mk.source({ target, game: dir });
  let doc;
  try { doc = mk.doc(src, map, {}); } catch (e) { console.log('skip ' + label + ': no map ' + map + ' (' + e.message + ')'); return; }
  const t0 = Date.now();
  let cat, links;
  try { links = require(path.join(ROOT, 'entcat', 'links')).linksOf(src, map, {}); } catch (e) { die(label + ' ' + map + ': links threw ' + e.stack); }
  try { cat = E.forDoc(src, doc, { links }); } catch (e) { die(label + ' ' + map + ': catalog threw ' + e.stack); }
  const t1 = Date.now();
  const counts = {}, fails = {};
  for (const en of Object.values(cat.entries)) counts[en.category] = (counts[en.category] || 0) + 1;
  for (const f of cat.failed) fails[f.code] = (fails[f.code] || 0) + 1;
  {   // the map's own catalog: no texture patch is a road, no overhead line wire is a building or a part
    const C = require(path.join(ROOT, 'entcat', 'category'));
    const bad = Object.values(cat.entries).filter(en => en.category === 'road_decal' && C.PATCH_NAME.test(en.def) ||
      /^building/.test(en.category) && /^resource\/entity\/construction\//.test(en.path) && !/fence|obstacle|barb/.test(en.path) && C.WIRE_NAME.test(en.def));
    ok(!bad.length, label + ' ' + map + ': patch or wire mis-classed: ' + bad.map(en => en.def + ' ' + en.category).join(', '));
  }
  const objs = E.place(doc, cat, links);
  ok(objs.length >= doc.entities.filter(e => e.x !== null).length, label + ': every placed record is an object');
  ok(objs.every(o => o.fp.pts.every(p => p.every(Number.isFinite))), label + ': finite polygons');
  // every linked part sits near its own root (a windmill sail reaches about 10 m out), never at the record before it
  const at = new Map(doc.entities.filter(e => e.x !== null).map(e => [e.uid, e]));
  for (const [u, l] of Object.entries(links.parts)) {
    const o = objs.find(x => x.uid === Number(u)), r = at.get(l.root);
    if (!o || !r) continue;
    const cx = o.fp.pts.reduce((s, p) => s + p[0], 0) / o.fp.pts.length, cy = o.fp.pts.reduce((s, p) => s + p[1], 0) / o.fp.pts.length;
    ok(Math.hypot(cx - r.x, cy - r.y) < 400, label + ': linked part ' + u + ' ' + o.def + ' at ' + cx.toFixed(1) + ',' + cy.toFixed(1) + ', root ' + l.root + ' at ' + r.x + ',' + r.y);
  }
  for (const [u, s] of Object.entries(links.seats)) {   // a root whose every structure seat is {Unlinked} and unlinked to: itself only
    const r = at.get(Number(u)), en = r && cat.entries[r.def];
    if (!en || !en.structure || !en.structure.parts.every(p => s[p.place] && s[p.place].unlinked)) continue;
    if (Object.values(links.parts).some(l => l.root === Number(u))) continue;
    ok(objs.filter(o => o.uid === Number(u)).length === 1, label + ': root ' + u + ' with every seat {Unlinked} gives one object');
  }
  if (target === 'goh') {   // release on real data: the scenes dropped every 50 defs, the same entries
    const L2 = require(path.resolve(ROOT, '..', 'lib', 'model', 'scenecache')).open({ target, game: dir, vfs: src.vfs });
    const rel = E.catalog(src, { defs: Object.keys(cat.entries).concat(cat.failed.map(f => f.def)), loader: L2, release: 50 });
    ok(JSON.stringify(rel.entries) === JSON.stringify(cat.entries) && rel.failed.length === cat.failed.length, label + ': catalog with release 50 = the plain one');
  }
  if (target === 'mowas2' && map === 'multi/1v1_road' && links.parts[133] && links.parts[133].root === 2166) {
    ok(objs.filter(o => o.uid === 5123).length === 1 && objs.filter(o => o.uid === 133).length === 1, label + ': wind_mill2 5123 (8 seats {Unlinked}) alone, part 133 once');
  }
  {   // the doc's own links (map rows) place the same objects as links.js; linksFor reads nothing for this doc
    const sub = Object.assign({}, doc, { entities: doc.entities.filter(e => e.src === 'map') });
    const kf = o => o.uid + ':' + o.def + ':' + JSON.stringify(o.fp && o.fp.pts);
    const a = E.place(sub, cat).map(kf).sort(), b = E.place(sub, cat, links).map(kf).sort();
    ok(JSON.stringify(a) === JSON.stringify(b), label + ': place from doc links = place with links.js (' + a.length + ' objects)');
    if (Object.keys(links.parts).length) ok(E.linksFor(src, map, sub, {}) === null, label + ': linksFor null for a doc with links');
  }
  console.log('real ' + label + ' ' + map + ': ' + (Object.keys(cat.entries).length + cat.failed.length) + ' defs, ' + objs.length + ' objects, ' +
    ((t1 - t0) / 1000).toFixed(2) + ' s; categories ' + JSON.stringify(counts) + '; failed ' + JSON.stringify(fails));
  if (want && Number.isInteger(want.failed)) ok(cat.failed.length === want.failed, label + ' ' + map + ': failed defs ' + JSON.stringify(cat.failed) + ', want ' + want.failed);
  for (const [d, want] of spots) {
    let en;
    try { en = E.entry(src, d); } catch (e) { die(label + ' spot ' + d + ': ' + e.code + ' ' + e.message); }
    ok(en.category === want, label + ' spot ' + d + ': ' + en.category + ' (' + en.categoryRule + '), want ' + want);
  }
  for (const d of ysign) {   // authored zones = the volume points' box, y sign included
    const en = E.entry(src, d);
    const fp = E.footprintOf(en, { x: 0, y: 0, yaw: 0 });
    let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (const [x, y] of fp.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    ok(en.footprint.source === 'authored' && near(y0, en.box.min[1], 0.05) && near(y1, en.box.max[1], 0.05) && near(x0, en.box.min[0], 0.1) && near(x1, en.box.max[0], 0.1),
      label + ' y sign ' + d + ': footprint y ' + y0 + '..' + y1 + ' vs volumes ' + en.box.min[1] + '..' + en.box.max[1]);
    if (d === 'fence_stone3') ok(y0 > 1 && y1 > 10, label + ' y sign fence_stone3: footprint on +y (' + y0 + '..' + y1 + ')');
    ok(Math.abs((y0 + y1) / 2) > 1 ||Math.abs((x0 + x1) / 2) > 1, label + ' y sign ' + d + ': object is off-centre');
  }
}
const AS2_SPOTS = [
  ['shed_euro_102a', 'building'], ['rockwall', 'wall'], ['fence-wood_3', 'fence'], ['tree_oak', 'tree'], ['ash_tree_bush1', 'bush'],
  ['rock01', 'rock'], ['sandbag', 'emplacement'], ['bridge_rw', 'bridge'], ['road_cross1', 'road_decal'], ['crater_big', 'crater'],
  ['strand_cable_cond1', 'ground_decal'], ['cable_1', 'other'], ['wire_left', 'building_part'],   // VERSION 2 rules
];
realGame('MoW:AS2', 'mowas2', 'multi/1v1_road', AS2_SPOTS,
  ['fence_stone3', 'r_house_wall6']);   // fence_stone3: volumes at y +2..+14 under a y-mirrored bone; r_house_wall6 off-centre in x
realGame('AS64', 'as64', 'multi/1v1_road', AS2_SPOTS, ['fence_stone3']);   // AS64 reads the MoW:AS2 install: the same answers
realGame('GoH', 'goh', 'multi/1v1_balzerweg', [
  ['chicken_house1', 'building'], ['fence-wood_3', 'fence'], ['crater_small', 'crater'], ['country_road_sum', 'road_decal'],
  ['sack_one', 'emplacement'], ['pine3', 'tree'],
  ['grass_pathways_large', 'ground_decal'], ['path_patch', 'ground_decal'], ['cp2b_wire', 'other'], ['cp2e_wire2', 'other'],
  ['cp2b_post', 'building_part'], ['fire_loop', 'service'],   // VERSION 2 rules
], [], { failed: 0 });   // fire_loop (sfx, sound.mdl) no longer fails: balzerweg has no failed def

// the whole GoH stack in one process inside the job row's 600 s (about 4 min: run with MAPVIZ_SLOW=1)
(function gohStack() {
  if (process.env.MAPVIZ_NO_GAME === '1') { console.log('skip GoH stack: MAPVIZ_NO_GAME=1'); return; }
  let dir = null;
  try { dir = require(path.resolve(ROOT, '..', 'lib', 'gamedir')).goh(); } catch (e) { dir = null; }
  if (!dir || !fs.existsSync(dir)) { console.log('skip GoH stack: no GoH install'); return; }
  if (process.env.MAPVIZ_SLOW !== '1') { console.log('skip GoH stack: about 4 min, set MAPVIZ_SLOW=1'); return; }
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [MV, 'entcat', 'stack', '--target', 'goh', '--out', path.join(scratch, 'goh-stack'), '--json'],
    { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26, env: process.env });
  const s = (Date.now() - t0) / 1000;
  let b = null;
  try { b = JSON.parse(r.stdout); } catch (e) { b = null; }
  ok((r.status === 0 || r.status === 1) && b && b.defs > 10000 && s < 600, 'GoH stack: exit ' + r.status + ' in ' + s.toFixed(1) + ' s ' + (r.stderr || '').slice(-300));
  console.log('real GoH stack: ' + b.defs + ' defs, ' + b.failed.length + ' failed, ' + s.toFixed(1) + ' s');
})();

console.log('PASS mapviz entcat (' + n + ')');
