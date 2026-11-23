// entcat solids tests (rules.md 2.0 of waves C and D): node tools/mapviz/entcat/test/solids.test.js [scratch]
// solids() and placeSolids() on the fixture in both forms (as2 form as target mowas2 and again as64, goh form), the world
// transform (scale, yaw, position, structure part bones, record z, ground height), the shapes the rule parts read, the
// seeded defects (nodata ground, a def not in the catalogue, no loader, a tilted box) and docForMode; with real installs
// (skip with MAPVIZ_NO_GAME=1): placeSolids on MoW:AS2 multi/1v1_road and GoH multi/1v1_balzerweg, and as AS64 on the same
// MoW:AS2 install. Last line: PASS mapviz entcat solids (N).
// Author: Imperator_Aug (ARSENAL, ia-789962d4)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-solids-')));
fs.mkdirSync(scratch, { recursive: true });
if (!process.env.ARSENAL_CACHE) process.env.ARSENAL_CACHE = path.join(scratch, 'cache');

const ROOT = path.resolve(__dirname, '..', '..');            // tools/mapviz
const fx = require(path.join(ROOT, 'test', 'fxmake'));
const mk = require(path.join(ROOT, 'lib', 'mapkit'));
const E = require(path.join(ROOT, 'entcat'));

let n = 0;
function die(what) { console.log('FAIL mapviz entcat solids: ' + what); process.exit(1); }
function ok(c, what) { n++; if (!c) die(what); }
const near = (a, b, t) => Math.abs(a - b) <= (t === undefined ? 1e-3 : t);
const CRLF = s => s.replace(/\r?\n/g, '\r\n');
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
const ABLES = ['bullet', 'visible', 'obstacle', 'contact', 'contact_ground', 'nolook', 'window', 'hole', 'holed', 'touch'];
// the frozen shapes (rules.md 2.0)
function solidShape(s) {
  return s && typeof s.name === 'string' && s.able && ABLES.every(k => typeof s.able[k] === 'boolean') && Object.keys(s.able).length === ABLES.length &&
    Number.isFinite(s.zMin) && Number.isFinite(s.zMax) && s.zMin <= s.zMax && Array.isArray(s.pts) && s.pts.length > 0 &&
    s.pts.every(p => p.length === 3 && p.every(Number.isFinite)) && (s.box === null || boxShape(s.box)) &&
    JSON.stringify(Object.keys(s).sort()) === JSON.stringify(['able', 'box', 'name', 'pts', 'zMax', 'zMin']);
}
function boxShape(b) {
  return b && b.center.length === 2 && b.half.length === 2 && b.center.concat(b.half, [b.yaw]).every(Number.isFinite) && b.half.every(h => h > 0);
}
function rowShape(r) {
  return r && Number.isFinite(r.uid) && typeof r.def === 'string' && typeof r.category === 'string' && Array.isArray(r.solids) &&
    JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['category', 'def', 'solids', 'uid']) &&
    r.solids.every(s => typeof s.name === 'string' && Number.isFinite(s.zMin) && Number.isFinite(s.zMax) && s.zMin <= s.zMax &&
      Array.isArray(s.hull) && s.hull.length >= 1 && s.hull.every(p => p.length === 2 && p.every(Number.isFinite)) && (s.box === null || boxShape(s.box)) &&
      JSON.stringify(Object.keys(s).sort()) === JSON.stringify(['able', 'box', 'hull', 'name', 'zMax', 'zMin']));
}

// ---------------------------------------------------------------- module shape
ok(typeof E.solids === 'function' && typeof E.placeSolids === 'function' && typeof E.docForMode === 'function' && E.VERSION === 2, 'exports solids, placeSolids, docForMode; VERSION 2');

// ---------------------------------------------------------------- fixture: as2 form as mowas2 and as64, goh form
const BOX = { fx_tree: [12, 12, 160], fx_wall: [80, 6, 24], fx_house: [160, 120, 120], fx_bush: [40, 40, 24] };
const VOL = { fx_tree: 'trunk', fx_wall: 'body', fx_house: 'body', fx_bush: 'crown' };
for (const [form, target] of [['as2', null], ['as2', 'as64'], ['goh', null]]) {
  const dir = path.join(scratch, 'fx-' + form + (target ? '-' + target : ''));
  const m = fx.make(dir, { form });
  const tgt = target || m.target;
  const label = form + '/' + tgt;
  const src = mk.source({ target: tgt, game: m.gameDir, modDirs: m.modDirs });
  const doc = mk.doc(src, m.map, {});
  const g = mk.grids(src, m.map, {});
  const mapDoc = E.docForMode(doc, null);
  ok(mapDoc.entities.length === fx.SPEC.entities.length && mapDoc.entities.every(e => e.src === 'map'), label + ': docForMode(null) = the map file records');
  const L = E.loaderFor(src);
  const cat = E.forDoc(src, mapDoc, { loader: L });
  // solids: entity space, one box volume per def, upright box
  for (const [d, b] of Object.entries(BOX)) {
    const s = E.solids(src, d, L);
    ok(s.length === 1 && solidShape(s[0]), label + ' ' + d + ': solid shape ' + JSON.stringify(s));
    const v = s[0], en = cat.entries[d];
    ok(v.name === VOL[d] && JSON.stringify(v.able) === JSON.stringify(en.volumes[0].able), label + ' ' + d + ': name and able = the entry volume');
    ok(near(v.zMin, 0) && near(v.zMax, b[2]) && v.zMin === en.volumes[0].zMin && v.zMax === en.volumes[0].zMax, label + ' ' + d + ': z ' + v.zMin + '..' + v.zMax);
    ok(v.pts.length === 8, label + ' ' + d + ': box mesh = 8 points');
    ok(v.box && near(v.box.center[0], 0) && near(v.box.center[1], 0) && near(v.box.half[0], b[0] / 2) && near(v.box.half[1], b[1] / 2) && near(v.box.yaw, 0),
      label + ' ' + d + ': box ' + JSON.stringify(v.box));
    ok(E.solids(src, d, L) === s, label + ' ' + d + ': remembered per loader');
  }
  ok(E.solids(src, 'fx_road', L).length === 0, label + ': a decal has no solids');
  let thrown = null;
  try { E.solids(src, 'fx_nosuchdef', L); } catch (e) { thrown = e.code; }
  ok(thrown === 'ENTCAT_DEF_MISSING', label + ': solids of a missing def throws ENTCAT_DEF_MISSING, got ' + thrown);
  // placeSolids with the grids: every map object, place() order, world hull, box, ground z
  const ps = E.placeSolids(mapDoc, cat, L, g);
  const pl = E.place(mapDoc, cat);
  ok(ps.length === pl.length && ps.every((r, i) => r.uid === pl[i].uid && r.def === pl[i].def && r.category === pl[i].category), label + ': rows in place() order');
  ok(ps.every(rowShape), label + ': row shape ' + JSON.stringify(ps.find(r => !rowShape(r))));
  ok(!Object.keys(ps).includes('notes') && Array.isArray(ps.notes) && ps.notes.length === 0, label + ': notes not enumerable, none ' + JSON.stringify(ps.notes));
  for (const s of fx.SPEC.entities) {
    const r = ps.find(x => x.uid === s.uid);
    if (s.def === 'fx_road') { ok(r && r.solids.length === 0 && r.category === 'road_decal', label + ': road decal row with no solids'); continue; }
    const b = BOX[s.def], sc = s.scale == null ? 1 : s.scale, yaw = s.yaw || 0;
    const v = r.solids[0], ground = mk.heightAt(g.height, s.x, s.y);
    ok(Number.isFinite(ground), label + ' ' + s.uid + ': fixture ground height ' + ground);
    ok(samePts(v.hull, rectPts(s.x, s.y, yaw, b[0] / 2 * sc, b[1] / 2 * sc), 1e-3), label + ' ' + s.uid + ' ' + s.def + ': hull ' + JSON.stringify(v.hull));
    ok(near(v.box.center[0], s.x) && near(v.box.center[1], s.y) && near(v.box.half[0], b[0] / 2 * sc) && near(v.box.yaw, yaw), label + ' ' + s.uid + ': world box ' + JSON.stringify(v.box));
    ok(near(v.zMin, ground) && near(v.zMax, ground + b[2] * sc), label + ' ' + s.uid + ': world z ' + v.zMin + '..' + v.zMax + ', ground ' + ground);
  }
  // the ridge lifts the objects on it: the fixture ground is not flat under every object
  const zs = new Set(ps.filter(r => r.solids.length).map(r => r.solids[0].zMin));
  ok(zs.size >= 1, label + ': ground heights read');
  // record z wins over the ground; scale 2 and yaw 45 on the volume box; no grids -> base 0 with one note
  const one = { entities: [{ uid: 77, def: 'fx_wall', x: 10, y: 20, z: 50, yaw: 45, scale: 2, src: 'map' }, { uid: 78, def: 'fx_tree', x: 0, y: 0, z: null, yaw: 0, scale: 1, src: 'map' }] };
  const p1 = E.placeSolids(one, cat, L, g);
  const w = p1.find(r => r.uid === 77).solids[0];
  ok(near(w.zMin, 50) && near(w.zMax, 98) && samePts(w.hull, rectPts(10, 20, 45, 80, 6), 1e-3) && near(w.box.yaw, 45) && near(w.box.half[0], 80) && near(w.box.half[1], 6),
    label + ': record z 50, scale 2, yaw 45 ' + JSON.stringify(w));
  const p0 = E.placeSolids(one, cat, L);
  ok(near(p0.find(r => r.uid === 78).solids[0].zMin, 0) && near(p0.find(r => r.uid === 77).solids[0].zMin, 50) &&
    p0.notes.length === 1 && p0.notes[0].code === 'ENTCAT_SOLID_NO_GROUND' && p0.notes[0].uid === null, label + ': no grids: base 0, one note ' + JSON.stringify(p0.notes));
  // seeded: ground nodata under a record, a def outside the catalogue, a failed def, no loader
  const hz = Object.assign({}, g.height, { data: g.height.data.slice(), nodata: -32768 });
  hz.data.fill(-32768);
  const pn = E.placeSolids(one, cat, L, { height: hz });
  ok(pn.length === 1 && pn[0].uid === 77 && pn.notes.length === 1 && pn.notes[0].code === 'ENTCAT_SOLID_NO_GROUND' && pn.notes[0].uid === 78,
    label + ': nodata ground: the record without z left out with ENTCAT_SOLID_NO_GROUND ' + JSON.stringify(pn.notes));
  const far = E.placeSolids({ entities: [{ uid: 79, def: 'fx_tree', x: 1e6, y: 1e6, src: 'map' }] }, cat, L, g);
  ok(far.length === 0 && far.notes[0].code === 'ENTCAT_SOLID_NO_GROUND', label + ': outside the grid: ENTCAT_SOLID_NO_GROUND');
  const cat2 = { entries: cat.entries, failed: [{ def: 'fx_gone', code: 'ENTCAT_MDL_MISSING', msg: 'x' }] };
  const pm = E.placeSolids({ entities: [{ uid: 80, def: 'fx_gone', x: 0, y: 0, src: 'map' }, { uid: 81, def: 'fx_never', x: 0, y: 0, src: 'map' }] }, cat2, L, g);
  ok(pm.length === 0 && pm.notes.map(x => x.code).join() === 'ENTCAT_MDL_MISSING,ENTCAT_DEF_MISSING', label + ': defs outside the catalogue noted with their codes ' + JSON.stringify(pm.notes));
  let nl = null;
  try { E.placeSolids(mapDoc, cat, null, g); } catch (e) { nl = e.code; }
  ok(nl === 'ENTCAT_FAULT', label + ': no loader throws ENTCAT_FAULT');
  ok(JSON.stringify(E.placeSolids(mapDoc, cat, L, g)) === JSON.stringify(ps), label + ': same bytes on a second run');
  // docForMode: the mode's .mi records join the map file's; another mode's do not
  const modes = (doc.modes || []).map(x => x.id);
  if (modes.length) {
    const mi = doc.entities.filter(e => e.src === 'mi' && e.mode === modes[0]);
    const sub = E.docForMode(doc, modes[0]);
    ok(sub.entities.length === mapDoc.entities.length + mi.length && sub !== doc && doc.entities.length >= sub.entities.length, label + ': docForMode(' + modes[0] + ') adds its ' + mi.length + ' .mi records');
    ok(E.docForMode(doc, 'no_mode').entities.length === mapDoc.entities.length, label + ': docForMode of an unknown mode = the map file records');
  }
}

// ---------------------------------------------------------------- structure parts, a tilted box, a y-mirrored bone
{
  const dir = path.join(scratch, 'fx-struct');
  const m = fx.make(dir, { form: 'as2' });
  const put = (rel, text) => { const p = path.join(m.gameDir, 'resource', 'entity', ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, CRLF(text)); };
  const plain = (mdl, extra) => '{game_entity\n\t{Extension "' + mdl + '"}\n\t{obstacleID "construction"}\n\t{props "construction"}\n' + (extra || '') + '}\n';
  const boxMdl = (bone, orient, pos, box) => '{Skeleton\n\t{bone "' + bone + '"\n\t\t{Orientation\n\t\t\t' + orient.join('\n\t\t\t') + '\n\t\t}\n\t}\n}\n' +
    '{Volume "body"\n\t{Box ' + box.join(' ') + '}\n\t{Bone "' + bone + '"}\n\t{Position ' + pos.join(' ') + '}\n}\n';
  const ID = ['1 0 0', '0 1 0', '0 0 1'], MIRROR = ['1 0 0', '0 -1 0', '0 0 1'], TILT = ['1 0 0', '0 0.7071068 0.7071068', '0 -0.7071068 0.7071068'];
  const TURN = ['0 1 0', '-1 0 0', '0 0 1'];   // bone x axis along +y: the box turned 90 deg
  put('fx/fx_struct.mdl', '{Skeleton\n\t{bone "fx_struct"\n\t\t{bone "p1"\n\t\t\t{Position 40 0 10}\n\t\t}\n\t}\n}\n' +
    '{Volume "body"\n\t{Box 20 20 20}\n\t{Bone "fx_struct"}\n\t{Position 0 0 10}\n}\n');
  put('fx/fx_struct.def', plain('fx_struct.mdl', '\t{Extender "structure"\n\t\t{place "p1" "fx_part"}\n\t}\n'));
  put('fx/fx_part.mdl', boxMdl('fx_part', ID, [0, 0, 5], [10, 10, 10]));
  put('fx/fx_part.def', plain('fx_part.mdl'));
  put('fx/fx_tilt.mdl', boxMdl('fx_tilt', TILT, [0, 0, 10], [20, 20, 20]));
  put('fx/fx_tilt.def', plain('fx_tilt.mdl'));
  put('fx/fx_turn.mdl', boxMdl('fx_turn', TURN, [0, 0, 10], [40, 10, 20]));
  put('fx/fx_turn.def', plain('fx_turn.mdl'));
  put('fx/fx_yfit.mdl', boxMdl('fx_yfit', MIRROR, [30, -20, 10], [20, 10, 20]));
  put('fx/fx_yfit.def', plain('fx_yfit.mdl'));
  const src = mk.source({ target: m.target, game: m.gameDir });
  const L = E.loaderFor(src);
  const tilt = E.solids(src, 'fx_tilt', L), turn = E.solids(src, 'fx_turn', L), yf = E.solids(src, 'fx_yfit', L);
  ok(tilt.length === 1 && tilt[0].box === null && tilt[0].pts.length === 8 && solidShape(tilt[0]), 'tilted box: pts only, box null ' + JSON.stringify(tilt[0].box));
  ok(turn[0].box && near(Math.abs(turn[0].box.yaw), 90) && near(turn[0].box.half[0], 20) && near(turn[0].box.half[1], 5), 'turned box: yaw 90, half 20 x 5 ' + JSON.stringify(turn[0].box));
  const yb = yf[0].pts;
  ok(yb.every(p => p[1] > 14.9 && p[1] < 25.1), 'y-mirrored bone: solid points at y +15..+25 (as the footprint) ' + JSON.stringify(yb));
  const doc = { entities: [{ uid: 1, def: 'fx_struct', x: 100, y: 0, z: 30, yaw: 90, scale: 1, src: 'map' }] };
  const cat = E.forDoc(src, doc, { loader: L });
  ok(cat.entries.fx_part && cat.failed.length === 0, 'structure: part def cataloged');
  const ps = E.placeSolids(doc, cat, L);
  ok(ps.length === 2 && ps[0].def === 'fx_struct' && ps[1].def === 'fx_part' && ps[1].uid === 1, 'structure: root + implicit part under the root uid ' + JSON.stringify(ps.map(r => r.def)));
  const pv = ps[1].solids[0];
  // bone p1 at (40, 0, 10), root yaw 90 at (100, 0), z 30: part box centre (100, 40), z 30 + 10 .. 30 + 10 + 10
  ok(samePts(pv.hull, rectPts(100, 40, 90, 5, 5), 1e-3) && near(pv.zMin, 40) && near(pv.zMax, 50), 'structure: part on its bone ' + JSON.stringify(pv));
  ok(ps.notes.length === 0, 'structure: no notes (root z given) ' + JSON.stringify(ps.notes));
}

// ---------------------------------------------------------------- real installs
function realGame(label, target, map, findDir) {
  if (process.env.MAPVIZ_NO_GAME === '1') { console.log('skip ' + label + ': MAPVIZ_NO_GAME=1'); return; }
  let dir = null;
  try { dir = findDir(); } catch (e) { dir = null; }
  if (!dir || !fs.existsSync(dir)) { console.log('skip ' + label + ': no install'); return; }
  const src = mk.source({ target, game: dir });
  let doc;
  try { doc = mk.doc(src, map, {}); } catch (e) { console.log('skip ' + label + ': no map ' + map + ' (' + e.message + ')'); return; }
  const t0 = Date.now();
  const sub = E.docForMode(doc, null);
  const L = E.loaderFor(src);
  const cat = E.forDoc(src, sub, { loader: L });
  const g = mk.grids(src, map, {});
  const ps = E.placeSolids(sub, cat, L, g);
  const pl = E.place(sub, cat);
  const okRows = ps.filter(r => r.solids.length);
  ok(ps.every(rowShape), label + ': row shape ' + String(JSON.stringify(ps.find(r => !rowShape(r)))).slice(0, 400));
  ok(okRows.length > 0.5 * pl.length, label + ': most objects have solids (' + okRows.length + ' of ' + pl.length + ')');
  const codes = {};
  for (const x of ps.notes) codes[x.code] = (codes[x.code] || 0) + 1;
  ok(Object.keys(codes).every(c => /^ENTCAT_/.test(c)), label + ': note codes ' + JSON.stringify(codes));
  // every hull lies around its object's footprint (the footprint comes from the same volumes or an authored zone)
  const byUid = new Map();
  for (const o of pl) { const a = byUid.get(o.uid) || []; a.push(o); byUid.set(o.uid, a); }
  let far = 0;
  for (const r of okRows) {
    const o = (byUid.get(r.uid) || []).find(x => x.def === r.def);
    if (!o || o.fp.kind === 'none') continue;
    const fc = o.fp.pts.reduce((s, p) => [s[0] + p[0] / o.fp.pts.length, s[1] + p[1] / o.fp.pts.length], [0, 0]);
    const hp = [].concat(...r.solids.map(s => s.hull));
    const hc = hp.reduce((s, p) => [s[0] + p[0] / hp.length, s[1] + p[1] / hp.length], [0, 0]);
    if (Math.hypot(fc[0] - hc[0], fc[1] - hc[1]) > 400) far++;
  }
  ok(far <= Math.max(2, okRows.length * 0.01), label + ': solids sit on their footprints (' + far + ' far)');
  // world z near the ground: a solid's bottom is within 10 m of the ground under its object [I]
  let off = 0;
  for (const r of okRows) {
    const s = r.solids[0], c = s.hull[0], h = mk.heightAt(g.height, c[0], c[1]);
    if (h !== null && Math.abs(Math.min(...r.solids.map(x => x.zMin)) - h) > 200) off++;
  }
  ok(off <= Math.max(3, okRows.length * 0.05), label + ': solid bottoms near the ground (' + off + ' off by more than 10 m)');
  const some = { bullet: 0, visible: 0, obstacle: 0, box: 0 };
  for (const r of okRows) for (const s of r.solids) { if (s.able.bullet) some.bullet++; if (s.able.visible) some.visible++; if (s.able.obstacle) some.obstacle++; if (s.box) some.box++; }
  ok(some.bullet > 0 && some.visible > 0 && some.obstacle > 0, label + ': bullet, visible and obstacle solids found ' + JSON.stringify(some));
  console.log('real ' + label + ' ' + map + ': ' + ps.length + ' rows, ' + okRows.length + ' with solids, ' + some.box + ' boxes, notes ' + JSON.stringify(codes) +
    ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}
const gd = require(path.resolve(ROOT, '..', 'lib', 'gamedir'));
realGame('MoW:AS2', 'mowas2', 'multi/1v1_road', () => (gd.resolve() || {}).dir);
realGame('GoH', 'goh', 'multi/1v1_balzerweg', () => gd.goh());
realGame('AS64', 'as64', 'multi/1v1_road', () => (gd.resolve() || {}).dir);   // AS64 reads the MoW:AS2 install (mapkit real test)

console.log('PASS mapviz entcat solids (' + n + ')');
