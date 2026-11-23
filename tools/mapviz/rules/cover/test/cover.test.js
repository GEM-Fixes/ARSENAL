// cover test (MV-COV): synthetic solids, the fixture known answers (rules.md 10: as2 form as mowas2 and again as64, goh
// form), the CLI, determinism, goldens (cover.golden.json) and planted bad inputs.
// usage: node tools/mapviz/rules/cover/test/cover.test.js [scratch dir]     MAPVIZ_COVER_GOLDEN=write rewrites the golden
// Author: Imperator_Aug (ARSENAL, ia-9cdd4f41)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const own = !process.argv[2];
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-cover-')));
fs.mkdirSync(scratch, { recursive: true });
process.env.ARSENAL_CACHE = path.join(scratch, 'cache');

let n = 0;
const fails = [];
function ok(c, what) { if (c) n++; else fails.push(what); }
function eq(a, b, what) { ok(JSON.stringify(a) === JSON.stringify(b), what + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function codeOf(f) { try { f(); return null; } catch (e) { return e.code || e.message; } }
function finish() {
  if (own) { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) { /* busy */ } }
  if (fails.length) { for (const f of fails) console.log('FAIL mapviz cover: ' + f); process.exit(1); }
  console.log('PASS mapviz cover (' + n + ')');
}

const C = require('../index');
const E = require('../edges');
const MAPVIZ = path.join(ROOT, 'tools', 'mapviz', 'mapviz.js');

// ---------------------------------------------------------------- profile, tables
{
  const a = C.profile('mowas2'), b = C.profile('as64'), g = C.profile('goh');
  eq(a, b, 'profile: as64 = mowas2 (1:1)');
  eq([a.game, a.objCellU, a.lipForProne, a.circleStartHalf, a.zoneTopU], ['as2', 7, true, false, 32.8], 'profile as2');
  eq([g.game, g.objCellU, g.lipForProne, g.circleStartHalf, g.zoneTopU, g.zoneBottomU], ['goh', 5, false, true, 1000, -1000], 'profile goh');
  eq([a.lipRay, a.occlCells, a.occlEyeM, a.occlRiseM], [[4, 3], 5, 1.35, 0.45], 'profile shared numbers');
  ok(codeOf(() => C.profile('bogus')) === 'MV_USAGE', 'planted: unknown target is MV_USAGE');
  eq([C.VERSION, Object.keys(C.TYPES).length, C.VALUE[4], C.VALUE[12], C.VALUE[9]], [1, 12, 1.0, 0.5, 0], 'VERSION, TYPES, VALUE');
  eq([C.TYPES[4].name, C.TYPES[12].name, C.TYPES[3].name], ['snipe_cover', 'terrain_lie', 'look_2way'], 'type names');
  ok(Object.values(C.TYPES).every(t => ['stand', 'squat', 'lie'].includes(t.pose)), 'TYPES poses are stand|squat|lie (rules.md 4.3)');
  eq(C.TYPES[4].pose, 'squat', 'snipe_cover is taken squatting (survey cover.md 1b)');
  eq([a.circleGapM * E.UPM, g.circleGapM * E.UPM], [E.U.gap, E.U.placeRadius], 'circleGapM = the circle start/gap used by addCircle (0.1 m; goh 0.3 m)');
  ok(C.shields({ x: 0, y: 0, wall: [[5, -5], [5, 5]] }, { x: 20, y: 0 }) === true, 'shields: a wall between');
  ok(C.shields({ x: 0, y: 0, wall: [[5, -5], [5, 5]] }, { x: -20, y: 0 }) === false, 'shields: threat on the own side');
  ok(C.shields({ x: 0, y: 0, wall: null }, { x: 20, y: 0 }) === false, 'shields: no wall');
  eq([E.bandOfM(0.2), E.bandOfM(0.3), E.bandOfM(1.2), E.bandOfM(1.35), E.bandOfM(6)], [0, 1, 3, 4, 5], 'bandOfM');
  ok(E.uniformRunWidth(12) < E.U.minWall && E.uniformRunWidth(80) > E.U.minWall, 'uniformRunWidth: 0.6 m edge has no run, 4 m has');
}

// ---------------------------------------------------------------- synthetic solids
function flat(w, h, cell, z) {
  const d = new Float32Array(w * h).fill(z || 0);
  return { name: 'height', w, h, cell, ox: 0, oy: 0, etype: 'f32', scale: 1, offset: 0, nodata: null, data: d };
}
function gtype(w, h, cell, t) { return { name: 'gtype', w, h, cell, ox: 0, oy: 0, etype: 'u8', scale: 1, offset: 0, nodata: null, data: new Uint8Array(w * h).fill(t || 0) }; }
function box(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
{
  const grids = { height: flat(41, 41, 10, 0), gtype: gtype(40, 40, 10, 0) };
  const cat = { entries: {
    sw_wall: { def: 'sw_wall', category: 'obstacle', cover: { hard: true, band: 'kneel', top: 24, conceal: false }, props: [], volumes: [], box: { min: [0, 0, 0], max: [1, 1, 24] } },
    sw_tall: { def: 'sw_tall', category: 'obstacle', cover: { hard: true, band: 'stand', top: 60, conceal: false }, props: ['nocover'], volumes: [], box: { min: [0, 0, 0], max: [1, 1, 60] } },
    sw_bush: { def: 'sw_bush', category: 'flora', cover: { hard: false, band: 'none', top: 0, conceal: true }, props: [], volumes: [], box: null },
  } };
  const objects = [
    { uid: 1, def: 'sw_wall', fp: { kind: 'obb', pts: box(97, 60, 103, 140) }, zMin: 0, zMax: 24 },
    { uid: 2, def: 'sw_tall', fp: { kind: 'obb', pts: box(297, 60, 303, 140) }, zMin: 0, zMax: 60 },
    { uid: 3, def: 'sw_bush', fp: { kind: 'none', pts: [] }, zMin: 0, zMax: 30 },
  ];
  const able = { bullet: true, visible: true, obstacle: true };
  const placed = [
    { uid: 1, def: 'sw_wall', category: 'obstacle', solids: [{ name: 'w', able, zMin: 0, zMax: 24, hull: box(97, 60, 103, 140) }] },
    { uid: 2, def: 'sw_tall', category: 'obstacle', solids: [{ name: 't', able, zMin: 0, zMax: 60, hull: box(297, 60, 303, 140) }] },
    { uid: 3, def: 'sw_bush', category: 'flora', solids: [{ name: 'b', able: { visible: true, contact: true }, zMin: 0, zMax: 30, hull: box(150, 250, 220, 320) }] },
  ];
  for (const t of ['mowas2', 'goh']) {
    const ed = C.edges({}, cat, objects, {});
    eq([ed.length, ed.counts.nocover, ed[0].band, ed[0].topM, ed[0].side + ed[1].side], [2, 1, 3, 1.2, 0], t + ' synth: 2 edges of the wall, nocover skipped');
    // side: the protected side is the left of a->b when 1; the x = 97 edge runs +y, its left (-x) is outside
    eq(ed.map(e => [e.a[0], e.side]).sort((p, q) => p[0] - q[0]), [[97, 1], [103, -1]], t + ' synth: edge side signs point away from the wall');
    ok(ed.every(e => e.vaultable === false), t + ' synth: a wall without vaultable is not vaultable');
    const cv = { entries: Object.assign({}, cat.entries, { sw_wall: Object.assign({}, cat.entries.sw_wall, { vaultable: true }) }) };
    const ev = C.edges({}, cv, objects, {});
    ok(ev.length === 2 && ev.every(e => e.vaultable === true) && ev.counts.vaultable === 1, t + ' synth: entry.vaultable true marks the edges (goh fences)');
    const pts = C.points({}, grids, cat, objects, placed, { target: t });
    ok(pts.length > 0 && pts.every(p => p.type === 4 && p.uid === 1 && p.band === 3 && p.wall), t + ' synth: wall gives type 4 points only');
    ok(pts.filter(p => p.row === 0).every(p => Math.abs(p.x - 90) <= 1 || Math.abs(p.x - 110) <= 1), t + ' synth: row 0 at 0.35 m out');
    eq(pts.counts.source, 'solids', t + ' synth: placed solids used');
    const cc = C.conceal({}, grids, placed, { target: t, objects, catalog: cat, near: pts });
    ok(cc.conceal.meta.counts.squat > 0 && cc.points.every(p => p.type >= 9 && p.type <= 11), t + ' synth: bush 1.5 m gives squat concealment');
    ok(cc.conceal.data[27 * 40 + 18] === 2, t + ' synth: bush centre cell squat');
    ok(cc.points.length > 0 && cc.points.every(p => p.uid === 3 && p.wall === null), t + ' synth: bush points carry the bush uid, no wall');
    const lp = C.lip(grids, { target: t, objects });
    eq([lp.counts.cells, lp.lip.meta.used], [0, t !== 'goh'], t + ' synth: flat ground has no lip');
    const bg = C.bandGrid(pts, grids);
    ok(bg.data[10 * 40 + 9] === 3 && bg.data[9 * 40 + 11] === 3 && bg.data[10 * 40 + 10] === 0, t + ' synth: cover.band 3 on both sides of the wall, 0 on it');
    eq(Object.keys(bg.meta.counts), ['lie', 'low', 'kneel', 'squat', 'stand'], t + ' synth: cover.band counts keyed by band id');
    ok(bg.meta.counts.kneel > 0 && bg.meta.counts.stand === 0, t + ' synth: cover.band counts kneel cells');
    // a stand bush 20 u wide, 2 m tall (narrower than 30 u): goh tests the 0.8 share on a 15 u box of 5 u object cells,
    // as2 on the 7 u cell alone. Cell (10,30) is stand on both (a whole 10 u cell of reach, 3 x 3 map.net cells, would
    // give 4/9 and nothing on goh); at cell (11,31) the goh box (110..125) reaches past the bush edge (120): 6/9, not stand
    const nb = [{ uid: 9, def: 'sw_bush', category: 'flora', solids: [{ name: 'b', able: { visible: true }, zMin: 0, zMax: 40, hull: box(100, 300, 120, 320) }] }];
    const cn = C.conceal({}, grids, nb, { target: t, objects: [], catalog: cat });
    eq([cn.conceal.data[30 * 40 + 10], cn.conceal.data[31 * 40 + 11] === 3, cn.conceal.meta.reachCells, cn.conceal.meta.objCellU],
      [3, t !== 'goh', t === 'goh' ? { stand: 1, lie: 2 } : { stand: 0, lie: 2 }, t === 'goh' ? 5 : 7], t + ' synth: a 20 u stand bush is stand (engine reach in object cells)');
    ok(cn.points.some(p => p.type === 9 && p.uid === 9), t + ' synth: the narrow bush gives a bush_stand point');
    // the fallback without solids gives the same wall points
    const fb = C.points({}, grids, { entries: Object.assign({}, cat.entries, { sw_wall: Object.assign({}, cat.entries.sw_wall, { volumes: [{ name: 'w', able, zMin: 0, zMax: 24 }] }) }) }, objects, null, { target: t });
    ok(fb.notes.some(x => x.code === 'COVER_NO_SOLIDS') && JSON.stringify(fb) === JSON.stringify(pts), t + ' synth: footprint fallback = solids, note COVER_NO_SOLIDS');
  }
  // the terrain lip: a 1 m step (20 u) across x = 200 (a 0.5 m step only matches the 0.5 m uplift: no cover)
  const hs = flat(41, 41, 10, 0);
  for (let j = 0; j < 41; j++) for (let i = 21; i < 41; i++) hs.data[j * 41 + i] = 20;
  const lp = C.lip({ height: hs, gtype: gtype(40, 40, 10, 0) }, { target: 'mowas2' });
  ok(lp.counts.cells > 0 && lp.points.length > 0 && lp.points.every(p => p.type === 12 && p.band === 1 && p.uid === null && Math.abs(p.x - 200) <= 10), 'synth: a 1 m step gives terrain_lie along it');
  // HasCoverNear 0.6 m thins the lip points: none closer than 12 u, and the count of the step is pinned
  ok(lp.points.every((p, i) => lp.points.every((q, j) => i === j || Math.hypot(p.x - q.x, p.y - q.y) >= E.U.near)), 'synth: lip points at least 0.6 m apart');
  eq(lp.points.length, 17, 'synth: the 1 m step gives 17 terrain_lie points on mowas2');
  // goh: the same lip cells, but no type 12 point (GHAI-32), and so no bush point is lost to one
  const lg = C.lip({ height: hs, gtype: gtype(40, 40, 10, 0) }, { target: 'goh' });
  eq([lg.counts.cells, lg.points.length, lg.lip.meta.used, Buffer.from(lg.lip.data).equals(Buffer.from(lp.lip.data))], [lp.counts.cells, 0, false, true], 'goh synth: lip layer kept, no terrain_lie points');
  {
    const gs = { height: hs, gtype: gtype(40, 40, 10, 0) };
    const bush = [{ uid: 5, def: 'sw_bush', category: 'flora', solids: [{ name: 'b', able: { visible: true }, zMin: 0, zMax: 60, hull: box(150, 100, 250, 300) }] }];
    for (const t of ['mowas2', 'goh']) {
      const l = C.lip(gs, { target: t });
      const with_ = C.conceal({}, gs, bush, { target: t, objects: [], catalog: { entries: {} }, near: l.points });
      const without = C.conceal({}, gs, bush, { target: t, objects: [], catalog: { entries: {} }, near: [] });
      if (t === 'goh') eq(with_.points.length, without.points.length, 'goh synth: bush points over a step do not change (no lip points)');
      else ok(with_.points.length < without.points.length, 'mowas2 synth: lip points thin the bush points over a step');
    }
  }
  const h10 = flat(41, 41, 10, 0);
  for (let j = 0; j < 41; j++) for (let i = 21; i < 41; i++) h10.data[j * 41 + i] = 10;
  eq(C.lip({ height: h10, gtype: gtype(40, 40, 10, 0) }, { target: 'mowas2' }).counts.cells, 0, 'synth: a 0.5 m step (= uplift) gives no lip');
  const lw = C.lip({ height: hs, gtype: gtype(40, 40, 10, 3) }, { target: 'mowas2' });
  eq(lw.counts.cells, 0, 'synth: ground type 3 refuses terrain_lie');
  ok(C.terrainShields({ height: hs }, { x: 195, y: 200 }, { x: 330, y: 200 }) === true, 'terrainShields: the step hides a lying man below it');
  ok(C.terrainShields({ height: flat(41, 41, 10, 0) }, { x: 195, y: 200 }, { x: 330, y: 200 }) === false, 'terrainShields: flat ground hides nothing');
  ok(C.terrainShields({ height: hs }, { x: 195, y: 200 }, { x: 330, y: 200 }, { target: 'goh' }) === true, 'terrainShields goh: the same rule');
  ok(C.terrainShields({ height: hs }, { x: 195, y: 200 }, { x: 330, y: 200 }, { profile: Object.assign({}, C.profile('mowas2'), { occlCells: 1 }) }) === false &&
    C.terrainShields({ height: hs }, { x: 195, y: 200 }, { x: 330, y: 200 }, { profile: Object.assign({}, C.profile('mowas2'), { occlEyeM: 50 }) }) === false,
  'terrainShields reads occlCells and occlEyeM from the profile');
  // planted: no height grid
  ok(codeOf(() => C.lip({}, { target: 'mowas2' })) === 'COVER_GRID', 'planted: lip without height is COVER_GRID');
  ok(codeOf(() => C.conceal({}, { gtype: gtype(4, 4, 10, 0) }, [], { target: 'mowas2' })) === 'COVER_GRID', 'planted: conceal without height is COVER_GRID');
  ok(codeOf(() => C.bandGrid([], {})) === 'COVER_GRID', 'planted: bandGrid without a frame is COVER_GRID');
}

// ---------------------------------------------------------------- the fixture
const fx = require('../../../test/fxmake');
const gf = require('../../../lib/raster/gridfile');
function run(args) {
  const r = cp.spawnSync(process.execPath, [MAPVIZ, 'cover'].concat(args), { encoding: 'utf8', env: process.env, timeout: 300000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
const sha1 = b => crypto.createHash('sha1').update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest('hex');
const GOLD_FILE = path.join(__dirname, 'cover.golden.json');
const writeGold = process.env.MAPVIZ_COVER_GOLDEN === 'write';
let gold = null;
try { gold = JSON.parse(fs.readFileSync(GOLD_FILE, 'utf8')); } catch (e) { gold = null; }
const newGold = {};
const results = {};
const KA = {
  as2: { band: [[73, 38], [75, 37]], conceal: [79, 78], lip: [64, 48] },
  goh: { band: [[146, 76], [150, 75]], conceal: [158, 156], lip: [128, 96] },
};
const games = {};
for (const form of ['as2', 'goh']) games[form] = fx.make(path.join(scratch, 'fx_' + form), { form });
for (const target of ['mowas2', 'as64', 'goh']) {
  const form = target === 'goh' ? 'goh' : 'as2';
  const g = games[form];
  const outDir = path.join(scratch, 'out_' + target);
  const r = run(['map', '--target', target, '--game', g.gameDir, '--mod-dir', g.modDirs[0], '--map', g.map, '--out', outDir, '--json']);
  ok(r.code === 0, target + ': cover map exit 0 (got ' + r.code + ' ' + r.err.slice(0, 300) + ')');
  if (r.code !== 0) continue;
  const body = JSON.parse(r.out);
  eq(body.files, ['cover.edges.json', 'cover.points.json', 'cover.band.mvg', 'cover.lip.mvg', 'cover.conceal.mvg', 'reads.json'], target + ': files');
  const edges = JSON.parse(fs.readFileSync(path.join(outDir, 'cover.edges.json'), 'utf8')).items;
  const pts = JSON.parse(fs.readFileSync(path.join(outDir, 'cover.points.json'), 'utf8')).items;
  const band = gf.read(path.join(outDir, 'cover.band.mvg')), lip = gf.read(path.join(outDir, 'cover.lip.mvg')), con = gf.read(path.join(outDir, 'cover.conceal.mvg'));
  const wall = edges.filter(e => e.def === 'fx_wall'), house = edges.filter(e => e.def === 'fx_house');
  eq([wall.length, wall.map(e => e.lenM), wall.map(e => e.band), wall.map(e => e.topM), wall[0] && wall[0].side + wall[1].side], [2, [4, 4], [3, 3], [1.2, 1.2], 0], target + ': fx_wall edges');
  eq([house.length, house.map(e => e.lenM).sort(), house.every(e => e.band === 5)], [4, [6, 6, 8, 8], true], target + ': fx_house edges');
  ok(!edges.some(e => e.def === 'fx_tree') && !pts.some(p => p.wall && p.uid !== null && edges.every(e => e.uid !== p.uid)), target + ': fx_tree gives no edge and no wall point');
  ok(pts.every(p => p.type !== 12 || p.uid === null) && pts.every(p => p.type < 9 || p.wall === null), target + ': uid null only for 12, wall null for 9..12');
  ok(pts.filter(p => p.type >= 9 && p.type <= 11).every(p => p.uid !== null), target + ': bush points carry a uid');
  ok(form !== 'goh' || !pts.some(p => p.type === 12), target + ': goh lists no terrain_lie point');
  ok(edges.filter(e => e.kind !== 'coverSector').every(e => e.vaultable === false), target + ': fixture edges not vaultable');
  eq(Object.keys(body.counts.band), ['lie', 'low', 'kneel', 'squat', 'stand'], target + ': summary band counts by band id');
  const wp = pts.filter(p => wall[0] && p.uid === wall[0].uid);
  ok(wp.length > 0 && wp.every(p => p.type === 4), target + ': fx_wall points all type 4');
  ok(wp.filter(p => p.row === 0).every(p => Math.abs(p.x - 90) <= 1 || Math.abs(p.x - 110) <= 1), target + ': fx_wall row 0 x at 90 or 110');
  const ka = KA[form];
  const at = (gr, c) => gr.data[c[1] * gr.w + c[0]];
  eq(ka.band.map(c => at(band, c)), [3, 3], target + ': cover.band at the wall');
  eq(at(con, ka.conceal), 1, target + ': cover.conceal lie at the bush');
  eq([at(lip, ka.lip), lip.meta.used], [0, form !== 'goh'], target + ': cover.lip at the flat');
  ok(pts.every(p => p.kind === 'coverPoint' && C.TYPES[p.type] && p.band === C.TYPES[p.type].band), target + ': point bands follow TYPES');
  ok(pts.every((p, i) => i === 0 || E.sortItems([pts[i - 1], p])[0] === pts[i - 1]), target + ': points sorted (uid, x, y)');
  const reads = JSON.parse(fs.readFileSync(path.join(outDir, 'reads.json'), 'utf8'));
  ok(Array.isArray(reads.inputs) && reads.inputs.length > 0, target + ': reads.json lists inputs');
  const h = { band: sha1(band.data), lip: sha1(lip.data), conceal: sha1(con.data), points: crypto.createHash('sha1').update(JSON.stringify(pts)).digest('hex'),
    edges: crypto.createHash('sha1').update(JSON.stringify(edges)).digest('hex') };
  results[target] = h;
  newGold[form] = h;
  // determinism: a second run gives the same bytes
  const out2 = path.join(scratch, 'out2_' + target);
  const r2 = run(['map', '--target', target, '--game', g.gameDir, '--mod-dir', g.modDirs[0], '--map', g.map, '--out', out2, '-q']);
  ok(r2.code === 0 && ['cover.edges.json', 'cover.points.json', 'cover.band.mvg', 'cover.lip.mvg', 'cover.conceal.mvg'].every(f =>
    fs.readFileSync(path.join(outDir, f)).equals(fs.readFileSync(path.join(out2, f)))), target + ': same bytes on a second run');
  if (gold && gold[form]) eq(h, gold[form], target + ': golden ' + form);
  else if (!writeGold) ok(false, target + ': no golden in ' + path.basename(GOLD_FILE) + ' (run with MAPVIZ_COVER_GOLDEN=write)');
}
if (results.mowas2 && results.as64) eq(results.as64, results.mowas2, 'as64 = mowas2 on the as2 fixture (1:1)');

// --in reuse and planted bad --in files
{
  const g = games.as2;
  const inDir = path.join(scratch, 'in_bad');
  fs.mkdirSync(inDir, { recursive: true });
  fs.writeFileSync(path.join(inDir, 'mapdoc.json'), '{ not json');
  const r = run(['map', '--target', 'mowas2', '--game', g.gameDir, '--mod-dir', g.modDirs[0], '--map', g.map, '--in', inDir, '--out', path.join(scratch, 'out_bad'), '--json']);
  ok(r.code !== 0 && /not JSON/.test(r.out + r.err), 'planted: corrupt mapdoc.json in --in is refused');
  const inDir2 = path.join(scratch, 'in_bad2');
  fs.mkdirSync(inDir2, { recursive: true });
  fs.writeFileSync(path.join(inDir2, 'gtype.mvg'), 'garbage');
  const r2 = run(['map', '--target', 'mowas2', '--game', g.gameDir, '--mod-dir', g.modDirs[0], '--map', g.map, '--in', inDir2, '--out', path.join(scratch, 'out_bad2'), '--json']);
  ok(r2.code !== 0, 'planted: --in gtype.mvg without height.mvg is refused');
  const r3 = run(['map', '--target', 'mowas2', '--game', g.gameDir, '--mod-dir', g.modDirs[0], '--map', 'multi/no_such_map', '--out', path.join(scratch, 'out_nf'), '--json']);
  ok(r3.code === 3, 'planted: a missing map exits 3 (got ' + r3.code + ')');
  const r4 = run(['profile', '--target', 'nope', '--json']);
  ok(r4.code !== 0 && /MV_USAGE/.test(r4.out + r4.err), 'planted: profile of an unknown target is MV_USAGE');
  const r5 = run(['profile', '--target', 'goh', '--game', games.goh.gameDir, '--json']);
  ok(r5.code === 0 && JSON.parse(r5.out).lipForProne === false, 'profile command goh');
}

if (writeGold) { fs.writeFileSync(GOLD_FILE, JSON.stringify(newGold, null, 1) + '\n'); console.log('golden written: ' + GOLD_FILE); }
finish();
