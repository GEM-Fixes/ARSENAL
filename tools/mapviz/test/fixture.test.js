// fixture test: the mapviz fixture map (README section 10) is real in format. For both forms (AS2 target mowas2, GoH target
// goh) the shared libs read it: vfs mounts it with the explicit exe id, the mod folder shadows its mode file, mapnet.parse
// gives the frozen numbers, sdlx reads the map and .mi files, each fx def loads through sceneload with its one volume;
// every row of the known-answer table 10.4 is recomputed from the files; make() is deterministic; seeded defects are
// caught; fxanswers.json agrees with the files.
// usage: node tools/mapviz/test/fixture.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-5d8f94d3)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('../../lib/test/wait');   // wait.js spawnSync: limit at least 5 min, killed by it -> WAIT and one rerun with twice the limit

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-fixture-')));
fs.mkdirSync(W, { recursive: true });
{   // README 9.4: the cache lives inside the scratch dir; an inherited ARSENAL_CACHE is kept only when it is inside W
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz fixture: ' + what); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const LIB = path.resolve(__dirname, '../../lib');
const fx = require('./fxmake');
const vfs = require(path.join(LIB, 'vfs')), mapnet = require(path.join(LIB, 'mapnet')), sdlx = require(path.join(LIB, 'sdlx'));
const mdl = require(path.join(LIB, 'model/mdl')), sceneload = require(path.join(LIB, 'model/sceneload'));
const dds = require(path.join(LIB, 'model/dds')), ply = require(path.join(LIB, 'model/ply'));
const MAP = 'multi/mv_fixture', MK = 'resource/map/' + MAP + '/';

// README 10.2-10.4, written out literally (the test does not take them from fxmake's SPEC)
const FORM = {
  as2: { target: 'mowas2', exe: 'mowas_2', game: 'as2', cell: 10, w: 128, h: 96, modes: ['battle_zones', 'combat', 'frontline'], fl: 'frontline' },
  goh: { target: 'goh', exe: 'goh', game: 'goh', cell: 5, w: 256, h: 192, modes: ['battle_zones', 'frontlines'], fl: 'frontlines' },
};
const KNOWN = {
  spawns: [{ name: 'a1', x: -503.7, y: 12.2, yaw: 0, as2: [13, 49], goh: [27, 98] }, { name: 'b1', x: 497.5, y: -15.5, yaw: 179.5, as2: [113, 46], goh: [227, 92] }],
  flags: [
    { name: 'f1', x: 0, y: 0, as2: [64, 48], as2zone: [240, 240], goh: { kind: 'circle', r: 240 } },
    { name: 'f2', x: -200, y: 300, as2: [44, 78], as2zone: [160, 160], goh: { kind: 'poly', zoneId: 'zf2', pts: [[-280, 180], [-80, 180], [-40, 300], [-180, 380], [-300, 300]] } },
    { name: 'f3', x: 300, y: 200, scale: 2, as2: [94, 68], as2zone: [200, 120], goh: { kind: 'circle', r: 200 } },
  ],
  sp1: { x: -450, y: 20, yaw: 90, team: 'a', phase: 1, order: 1, as2: [19, 50], goh: [38, 100] },
  slope: { as2: [[39, 48, 5], [64, 48, 0]], goh: [[78, 96, 5], [128, 96, 0]] },
  // AS2 cells on row 28 through the pond: stored type, h, load type, band, depth (m) or null
  pond: [[94, 5, -200, 5, 2, 9], [101, 4, -80, 4, 2, 3], [104, 4, -50, 4, 2, 1.5], [107, 3, -28, 3, 1, 0.4], [111, 3, -10, 1, 0, null]],
  modA1: { as2: [13, 53] },
};

const F32 = v => Math.fround(v);
function cellOf(net, x, y) { return [Math.floor((x + net.offX) / net.cell), Math.floor((y + net.offY) / net.cell)]; }
function retype(stored, h, Wl) {   // design 2: d' = W - h + 1; > 100 deep, > 14 water, > 0 shallow, else ground
  if (stored < 3 || stored > 5) return stored;
  const d = Wl - h + 1;
  return d > 100 ? 5 : d > 14 ? 4 : d > 0 ? 3 : 1;
}
function walk(dir, base = dir, out = []) {
  for (const n of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}
function sdlErrors(buf, file) {
  const errs = [];
  sdlx.read(buf, { file, key: file, open: () => null, onError: (f, l, c, m) => errs.push(c + ' ' + l + ' ' + m) });
  return errs;
}

const answers = JSON.parse(fs.readFileSync(path.join(__dirname, 'fxanswers.json'), 'utf8'));
const unb = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

for (const form of ['as2', 'goh']) {
  const FM = FORM[form], tag = form + ': ';
  const d = path.join(W, 'fx-' + form);
  fs.rmSync(d, { recursive: true, force: true });
  const r = fx.make(d, { form });

  // ---- 1. make() result
  ok(eq(Object.keys(r).sort(), ['gameDir', 'map', 'modDirs', 'mods', 'target']), tag + 'make() returns gameDir, target, map, mods, modDirs');
  ok(r.target === FM.target && r.map === MAP && eq(r.mods, []), tag + 'target ' + r.target + ', map ' + r.map);
  ok(r.gameDir === path.join(d, FM.game) && eq(r.modDirs, [path.join(d, 'mods', 'mvfx')]), tag + 'gameDir and modDirs paths');
  ok(fs.existsSync(path.join(r.gameDir, form === 'goh' ? 'binaries/x64/call_to_arms.exe' : 'mowas_2.exe')), tag + 'exe file present');

  // ---- 2. vfs with the explicit exe id; the mod folder shadows its mode file
  const v = vfs.build({ gameDir: r.gameDir, exe: FM.exe });
  ok(v.exe === FM.exe, tag + 'vfs exe ' + v.exe);
  ok(!v.problems.some(p => p.level === 'error'), tag + 'vfs mounts with no error (' + v.problems.filter(p => p.level === 'error').map(p => p.code).join(',') + ')');
  const keys = [...v.files.keys()].filter(k => k.startsWith(MK)).map(k => k.slice(MK.length)).sort();
  ok(eq(keys, FM.modes.map(m => m + '.mi').concat(['map', 'map.net']).sort()), tag + 'map folder files ' + keys.join(','));
  ok(v.files.has(MK + 'map') && v.files.get(MK + 'map').source === 'loose', tag + 'finds resource/map/multi/mv_fixture/map (loose)');
  ok(v.files.has('resource/set/interaction_terrain/terrains.set'), tag + 'terrains.set mounted');
  const vm = vfs.build({ gameDir: r.gameDir, exe: FM.exe, modDirs: r.modDirs });
  const modMode = form === 'goh' ? 'battle_zones' : 'combat';
  const mrec = vm.files.get(MK + modMode + '.mi');
  ok(mrec && mrec.layer === 'mvfx' && eq(vm.modDirs.map(x => x.id), ['mvfx']), tag + 'with modDirs the mvfx ' + modMode + '.mi wins (layer ' + (mrec && mrec.layer) + ')');
  ok(v.files.get(MK + modMode + '.mi').layer === 'base', tag + 'without modDirs the base ' + modMode + '.mi');

  // ---- 3. map.net
  const nbuf = vfs.readRec(v.files.get(MK + 'map.net'));
  const net = mapnet.parse(nbuf);
  ok(net.problems.length === 0, tag + 'map.net parses with no problem ' + JSON.stringify(net.problems));
  ok(net.cell === FM.cell && net.width === FM.w && net.height === FM.h && net.offX === 640 && net.offY === 480 && net.version === 2,
    tag + 'map.net cell ' + net.cell + ' w ' + net.width + ' h ' + net.height + ' off ' + net.offX + ',' + net.offY + ' v' + net.version);
  ok(eq(net.types.map(t => [t.index, t.name]), [[1, 'ground'], [3, 'shallow_water'], [4, 'water'], [5, 'deep_water'], [7, 'road']]), tag + 'map.net types in AS2 order');
  ok(eq(net.materials.map(t => [t.index, t.name]), [[1, 'ground'], [4, 'shallow_water'], [5, 'water'], [6, 'deep_water'], [9, 'road']]), tag + 'map.net materials in AS2 order');
  ok(-net.offX + net.width * net.cell === 640 && -net.offY + net.height * net.cell === 480, tag + 'world x -640..640, y -480..480');
  const hAt = (i, j) => mapnet.cellAt(net, i, j).height;

  // ---- 4. map and mode files through sdlx
  const read = k => vfs.readRec(v.files.get(k));
  const mapBuf = read(MK + 'map');
  ok(sdlErrors(mapBuf, 'map').length === 0, tag + 'map reads with no sdlx error');
  const mapRoot = fx.readSdl(mapBuf, 'map').root;
  const clips = fx.clipsOf(mapRoot);
  ok(clips.length === 1 && clips[0].name === '[auto]' && eq(clips[0].world, [-600, -440, 600, 440]) && eq(clips[0].camera, [-560, -400, 560, 400])
    && eq(clips[0].pather, [-580, -420, 580, 420]), tag + 'Clips [auto] world, camera, pather');
  const Wl = clips.length ? clips[clips.length - 1].water : null;
  ok(Wl === -20, tag + 'Clips {water -20} (water.level ' + Wl + ', source map)');
  const mapBlock = mapRoot.items.find(x => x.k === 'BLOCK');
  const ents = mapBlock.items.filter(x => x.k === 'BLOCK' && x.items[0].text === 'Entity').map(e => {
    const w = e.items.filter(x => x.k !== 'BLOCK'), sub = n => e.items.find(x => x.k === 'BLOCK' && x.items[0].text === n);
    const p = sub('Position'), xf = sub('xform'), dor = sub('DecalOrder'), col = sub('Color');
    const xw = xf ? xf.items.slice(1).map(x => x.text) : [];
    return { def: w[1].value, uid: w[2].value, x: p.items[1].value, y: p.items[2].value, z: p.items[3] ? p.items[3].value : null,
      yaw: xw.indexOf('zl') >= 0 ? Number(xw[xw.indexOf('zl') + 1]) : 0, scale: xw.indexOf('scale') >= 0 ? Number(xw[xw.indexOf('scale') + 1]) : 1,
      order: dor ? dor.items[1].value : null, color: col ? col.items[1].value : null };
  });
  ok(eq(ents.map(e => [e.uid, e.def, e.x, e.y]), [[0x1001, 'fx_tree', -400, 300], [0x1002, 'fx_tree', -420, 340], [0x1003, 'fx_tree', -380, 360],
    [0x1004, 'fx_wall', 100, -100], [0x1005, 'fx_house', -450, -300], [0x1006, 'fx_road', 0, 200], [0x1007, 'fx_bush', 150, 300], [0x1008, 'fx_bush', 170, 320]]),
    tag + 'map entities 0x1001..0x1008');
  ok(ents[3].yaw === 90 && ents[4].yaw === 30 && ents[5].scale === 2 && ents[5].order === 1 && ents.every(e => e.z === null), tag + 'wall yaw 90, house yaw 30, road scale 2 DecalOrder 1, no z');
  ok(ents.every(e => e.x >= -640 && e.x < 640 && e.y >= -480 && e.y < 480), tag + 'every entity inside the grid');
  const ocean = mapBlock.items.find(x => x.k === 'BLOCK' && x.items[0].text === 'Ocean');
  if (form === 'goh') ok(ocean && fx.readSdl(mapBuf, 'map') && ocean.items.some(x => x.k === 'BLOCK' && x.items[0].text === 'zlevel' && x.items[1].value === -20)
    && ocean.items.some(x => x.k === 'BLOCK' && x.items[0].text === 'ww_environment_mode' && x.items[1].text === 'lake'), tag + 'Ocean lake zlevel -20');
  else ok(!ocean, tag + 'no Ocean block');

  const mi = {};
  for (const m of FM.modes) {
    const b = read(MK + m + '.mi');
    ok(sdlErrors(b, m + '.mi').length === 0, tag + m + '.mi reads with no sdlx error');
    const root = fx.readSdl(b, m + '.mi').root;
    mi[m] = { recs: fx.missionRecords(root), polys: fx.helperPolys(root) };
  }
  const bz = mi.battle_zones;
  for (const s of KNOWN.spawns) {
    for (const m of form === 'goh' ? ['battle_zones'] : ['battle_zones', 'combat']) {
      const rec = mi[m].recs.find(x => x.ext && x.ext.name === s.name);
      ok(rec && rec.def === 'map_point' && rec.ext.visor === 'SpawnPoint' && rec.x === s.x && rec.y === s.y && rec.yaw === s.yaw, tag + m + ' spawn ' + s.name);
      if (rec) ok(eq(cellOf(net, rec.x, rec.y), s[form]), tag + m + ' spawn ' + s.name + ' cell ' + cellOf(net, rec.x, rec.y) + ' want ' + s[form]);
    }
  }
  for (const f of KNOWN.flags) {
    const rec = bz.recs.find(x => x.ext && x.ext.name === f.name);
    ok(rec && rec.x === f.x && rec.y === f.y && /^flag_point_\d$/.test(rec.def), tag + 'flag ' + f.name + ' at ' + f.x + ',' + f.y);
    if (!rec) continue;
    if (f.scale) ok(rec.scale === f.scale, tag + 'flag ' + f.name + ' xform scale ' + rec.scale);
    if (form === 'as2') {
      ok(eq(cellOf(net, rec.x, rec.y), f.as2), tag + 'flag ' + f.name + ' cell ' + cellOf(net, rec.x, rec.y));
      ok(eq([Math.max(1, rec.ext.zoneA) * 20, Math.max(1, rec.ext.zoneB) * 20], f.as2zone), tag + 'flag ' + f.name + ' rA/rB ' + f.as2zone + ' (scale ignored)');
    } else {
      const z = rec.ext.zone;
      if (f.goh.kind === 'circle') ok(z && z.radius === f.goh.r && z.zoneId === '', tag + 'flag ' + f.name + ' zone radius ' + (z && z.radius) + ' raw u');
      else {
        const poly = bz.polys.find(p => p.name === z.zoneId);
        ok(z && z.zoneId === f.goh.zoneId && z.radius === 0 && poly, tag + 'flag ' + f.name + ' zoneId ' + (z && z.zoneId) + ' has a Helpers poly');
        if (poly) ok(eq(poly.points.map(([dx, dy]) => [poly.position[0] + dx, poly.position[1] + dy]), f.goh.pts), tag + 'flag ' + f.name + ' poly points absolute');
      }
    }
  }
  {
    const fl = mi[FM.fl].recs, sp = fl.find(x => x.extName === 'spawn_point');
    const mp = sp && fl.find(x => x.ext && x.ext.name === sp.ext.mapPoint);
    ok(sp && mp && sp.x === KNOWN.sp1.x && sp.y === KNOWN.sp1.y && sp.yaw === KNOWN.sp1.yaw && sp.ext.pos === KNOWN.sp1.order,
      tag + FM.fl + ' spawn_point sp1 yaw ' + (sp && sp.yaw) + ' via mapPoint ' + (sp && sp.ext.mapPoint));
    if (sp && mp) {
      ok(mp.ext.team === KNOWN.sp1.team && mp.ext.phase === KNOWN.sp1.phase && mp.x === -400 && mp.y === 0, tag + 'map_point fa1 team a phase 1 at (-400, 0)');
      ok(eq(cellOf(net, sp.x, sp.y), KNOWN.sp1[form]), tag + 'sp1 cell ' + cellOf(net, sp.x, sp.y));
    }
  }
  // the mod's a1
  {
    const b = vfs.readRec(mrec), rec = fx.missionRecords(fx.readSdl(b, 'mod').root).find(x => x.ext && x.ext.name === 'a1');
    ok(rec && rec.x === -503.7 && rec.y === 52.2, tag + 'mvfx a1 moved to (-503.7, 52.2)');
    if (rec && KNOWN.modA1[form]) ok(eq(cellOf(net, rec.x, rec.y), KNOWN.modA1[form]), tag + 'mvfx combat a1 cell ' + cellOf(net, rec.x, rec.y));
  }

  // ---- 5. entity defs through sceneload and the mdl reader; road decal; text files read strictly
  const idxCache = path.join(W, 'entityindex-' + form + '.json');
  const SIZE = { fx_tree: [12, 12, 160, 1], fx_wall: [80, 6, 24, 1], fx_house: [160, 120, 120, 1], fx_bush: [40, 40, 24, 0] };
  for (const name of Object.keys(SIZE)) {
    const s = sceneload.load(name, { game: r.gameDir, mods: [], indexCache: idxCache });
    ok(!s.error && s.key === 'resource/entity/fx/' + name + '.mdl', tag + name + ' loads through sceneload (' + s.error + ')');
    if (s.error) continue;
    ok(s.model.volumes.length === 1 && s.scene.volumes.length === 1, tag + name + ' has one volume');
    const vol = s.model.volumes[0];
    ok(vol.kind === 'box' && eq(vol.size, SIZE[name].slice(0, 3)), tag + name + ' box ' + vol.kind + ' ' + JSON.stringify(vol.size));
    ok(s.model.obstacles.length === SIZE[name][3] && s.model.obstacles.every(o => o.kind === 'obb2' || /obb/i.test(o.kind)), tag + name + ' obstacles ' + s.model.obstacles.map(o => o.kind));
    if (SIZE[name][3]) ok(eq(s.model.obstacles[0].shape.extent, [SIZE[name][0] / 2, SIZE[name][1] / 2]), tag + name + ' Obb2 extent ' + JSON.stringify(s.model.obstacles[0].shape.extent));
    ok(s.scene.meshes.length === 1 && s.scene.meshes[0].ply && !s.scene.meshes[0].ply.error && s.scene.meshes[0].ply.vertices.count === 24, tag + name + ' mesh ply loads');
    const def = vfs.readRec(v.files.get('resource/entity/fx/' + name + '.def')).toString('latin1');
    const able = /\{able \{visible (\d)\} \{bullet (\d)\} \{obstacle (\d)\}\}/.exec(def);
    ok(able && (name === 'fx_bush' ? able.slice(1).join('') === '100' : able.slice(1).join('') === '111'), tag + name + ' able flags ' + (able && able.slice(1).join('')));
    s.files.close();
  }
  for (const k of [...v.files.keys()].filter(k => /\.(def|mdl|mtl|mi|set)$/.test(k) || k === MK + 'map')) {
    const errs = sdlErrors(read(k), k);
    ok(errs.length === 0, tag + k + ' strict SDL ' + errs.slice(0, 2).join('; '));
  }
  {
    const R = 'resource/entity/landscape/stamp/road/';
    const def = read(R + 'fx_road.def').toString('latin1'), mtl = read(R + 'fx_road.mtl').toString('latin1');
    ok(/\{DecalView/.test(def) && /\{Sprite "fx_road\.mtl"/.test(def) && /\{Scale 1\}/.test(def), tag + 'fx_road.def DecalView Sprite, Scale 1');
    ok(/\{Axis 64 64\}/.test(mtl), tag + 'fx_road.mtl sprite 64 px');
    const t = dds.parse(read(R + 'fx_road.dds'));
    ok(t.width === 64 && t.height === 64 && !t.error, tag + 'fx_road.dds 64x64 ' + t.format);
    ok(!/\{Box/.test(def) && !v.files.has(R + 'fx_road.mdl'), tag + 'road decal has no model');
  }

  // ---- 6. known answers (10.4) recomputed from the files
  const iAt = x => Math.floor((x + net.offX) / net.cell);
  let ridgeOk = true;
  for (let j = 0; j < net.height; j++) if (hAt(iAt(-200), j) !== 60 || hAt(iAt(-250), j) !== 30 || hAt(iAt(-300), j) !== 0) ridgeOk = false;
  ok(ridgeOk, tag + 'height at x -200 / -250 / -300 = 60 / 30 / 0 u on every row');
  for (const [i, j, want] of KNOWN.slope[form]) {
    const got = fx.slopeClass(hAt, net.width, net.height, net.cell, i, j);
    ok(got === want, tag + 'slopecls cell (' + i + ', ' + j + ') ' + got + ' want ' + want);
  }
  const k = FM.cell === 10 ? 1 : 2;   // AS2 cell -> GoH cell (same lattice point)
  for (const [i, st, h, lt, band, depth] of KNOWN.pond) {
    const ci = i * k, cj = 28 * k, c = mapnet.cellAt(net, ci, cj);
    const t = retype(c.type, c.height, Wl), dep = t >= 3 && t <= 5 ? (Wl - c.height) / 20 : null;
    const b = t === 4 || t === 5 ? 2 : t === 3 ? 1 : 0;
    ok(c.type === st && c.height === h && t === lt && b === band && dep === depth,
      tag + 'pond cell (' + ci + ', ' + cj + ') stored ' + c.type + ' h ' + c.height + ' load ' + t + ' band ' + b + ' depth ' + dep);
    if (lt === 1) ok(c.type >= 3 && c.height >= Wl + 1, tag + 'cell (' + ci + ', ' + cj + ') PAINTED_ABOVE_LEVEL (stored water, h >= W + 1)');
  }
  // pond rings by distance from (300, -200) to the lattice point, over every cell
  {
    const RINGS = [[60, -200, 5], [90, -80, 4], [120, -50, 4], [160, -28, 3], [180, -10, 3]];
    let bad = 0, n = 0;
    for (let j = 0; j < net.height; j++) for (let i = 0; i < net.width; i++) {
      const x = i * net.cell - net.offX, y = j * net.cell - net.offY, rr = Math.hypot(x - 300, y + 200);
      const ring = RINGS.find(g => rr < g[0]), c = mapnet.cellAt(net, i, j);
      if (ring) { n++; if (c.height !== ring[1] || c.type !== ring[2]) bad++; } else if (c.type >= 3 && c.type <= 5) bad++;
    }
    ok(bad === 0 && n > 0, tag + 'pond rings over ' + n + ' cells (' + bad + ' wrong)');
  }
  // road rows: y 190 to 220 -> AS2 rows 67..69, GoH rows 134..139; type road, material road; neighbours not
  {
    const rows = []; for (let j = 0; j < net.height; j++) { const y = j * net.cell - net.offY; if (y >= 190 && y < 220) rows.push(j); }
    ok(eq(rows, form === 'as2' ? [67, 68, 69] : [134, 135, 136, 137, 138, 139]), tag + 'road rows ' + rows.join(','));
    let bad = 0;
    for (let i = 0; i < net.width; i++) {
      for (const j of rows) { const c = mapnet.cellAt(net, i, j); if (mapnet.typeName(net, c.type) !== 'road' || mapnet.materialName(net, c.material) !== 'road') bad++; }
      for (const j of [rows[0] - 1, rows[rows.length - 1] + 1]) if (mapnet.typeName(net, mapnet.cellAt(net, i, j).type) === 'road') bad++;
    }
    ok(bad === 0, tag + 'road rows are type road / material road, the rows beside are not (' + bad + ' wrong)');
    const f3 = mapnet.cellAt(net, ...cellOf(net, 300, 200));
    ok(mapnet.typeName(net, f3.type) === 'road', tag + 'flag f3 stands on the road');
  }
  // the terrains.set lists ground, road, country_road (road = engine material 9)
  {
    const root = fx.readSdl(read('resource/set/interaction_terrain/terrains.set'), 'terrains.set').root;
    const t = root.items.find(x => x.k === 'BLOCK');
    const names = t.items.filter(x => x.k === 'BLOCK').map(b => b.items[0].value);
    ok(eq(names, ['ground', 'road', 'country_road']), tag + 'terrains.set ' + names.join(','));
  }

  // ---- 7. determinism: two make() runs give the same bytes
  const d2 = path.join(W, 'fx2-' + form);
  fs.rmSync(d2, { recursive: true, force: true });
  fx.make(d2, { form });
  const l1 = walk(d), l2 = walk(d2);
  ok(eq(l1, l2) && l1.every(f => fs.readFileSync(path.join(d, f)).equals(fs.readFileSync(path.join(d2, f)))), tag + 'two make() runs give identical bytes (' + l1.length + ' files)');
  ok(fx.verify(d, form).length === 0, tag + 'verify() of a fresh make is clean ' + fx.verify(d, form).slice(0, 2).join('; '));
  {
    const crlfBad = [];
    for (const f of l1.filter(x => !/\.(net|ply|dds|exe)$/.test(x))) {
      const s = fs.readFileSync(path.join(d, f), 'latin1');
      if (!(s.length === 0 || (/\r\n/.test(s) && !/[^\r]\n/.test(s)))) crlfBad.push(f);
    }
    ok(crlfBad.length === 0, tag + 'text files CRLF ' + crlfBad.slice(0, 3).join(', '));
  }

  // ---- 8. seeded defects
  const M2 = path.join(d2, FM.game, 'resource', 'map', 'multi', 'mv_fixture');
  {
    const nb = fs.readFileSync(path.join(M2, 'map.net'));
    const bad1 = Buffer.from(nb); bad1.write('XAP0', 14, 'latin1');
    ok(mapnet.parse(bad1).problems.some(p => p.code === 'NET_BAD_MARKER'), tag + 'corrupt MAP0 marker: mapnet NET_BAD_MARKER');
    const bad2 = Buffer.from(nb); bad2.writeInt16LE(FM.w + 1, 2);
    ok(mapnet.parse(bad2).problems.some(p => p.code === 'NET_SIZE'), tag + 'wrong header width: mapnet NET_SIZE');
    fs.writeFileSync(path.join(M2, 'map.net'), bad2);
    const p = fx.verify(d2, form);
    ok(p.some(x => /NET_SIZE/.test(x)) && p.some(x => /width/.test(x)), tag + 'verify() catches the corrupt map.net header (' + p.length + ')');
    const bad3 = Buffer.from(nb); bad3.writeInt16LE(bad3.readInt16LE(nb.length - 4 * FM.w * FM.h + 4 * (28 * k * FM.w + 94 * k)) + 1, nb.length - 4 * FM.w * FM.h + 4 * (28 * k * FM.w + 94 * k));
    fs.writeFileSync(path.join(M2, 'map.net'), bad3);
    ok(fx.verify(d2, form).some(x => /1 cells differ/.test(x)), tag + 'verify() catches one changed height');
    fs.writeFileSync(path.join(M2, 'map.net'), nb);
  }
  {
    const f = path.join(M2, 'battle_zones.mi'), good = fs.readFileSync(f);
    fs.writeFileSync(f, fx.miText(form, 'battle_zones', form === 'goh' ? { noPoly: true } : { drop: 'f1.zoneA' }));
    const p = fx.verify(d2, form);
    ok(form === 'goh' ? p.some(x => /zone "poly" zf2 missing/.test(x)) : p.some(x => /flag f1 zone undefined\/12/.test(x)), tag + 'verify() catches a .mi with a missing zone: ' + p[0]);
    fs.writeFileSync(f, good.toString('latin1').replace(/\r\n/g, '\n'));
    ok(fx.verify(d2, form).some(x => /battle_zones\.mi: not CRLF/.test(x)), tag + 'verify() catches LF line ends');
    fs.writeFileSync(f, good);
    ok(fx.verify(d2, form).length === 0, tag + 'verify() clean again after the restore');
  }
  {   // verify() also compares the map entity xform / Color / DecalOrder, the spawn_point yaw, the mod's a1 and the def files
    const swap = (f, from, to, re) => {
      const good = fs.readFileSync(f), s = good.toString('latin1');
      fs.writeFileSync(f, s.replace(from, to));
      const p = fx.verify(d2, form);
      fs.writeFileSync(f, good);
      return s.includes(from) && p.some(x => re.test(x));
    };
    ok(swap(path.join(M2, 'map'), '{xform zl 90}', '{xform zl 80}', /map entities/), tag + 'verify() catches a changed wall yaw');
    ok(swap(path.join(M2, 'map'), '{DecalOrder 1}', '{DecalOrder 2}', /map entities/), tag + 'verify() catches a changed DecalOrder');
    ok(swap(path.join(M2, FM.fl + '.mi'), '{xform zl 90}', '{xform zl 45}', /spawn_point/), tag + 'verify() catches a changed sp1 yaw');
    const modF = path.join(d2, 'mods', 'mvfx', 'resource', 'map', 'multi', 'mv_fixture', modMode + '.mi');
    ok(swap(modF, '{Position -503.7 52.2}', '{Position -503.7 12.2}', /mods\/mvfx.*spawn a1/), tag + 'verify() catches the mod a1 put back');
    const mdlF = path.join(d2, FM.game, 'resource', 'entity', 'fx', 'fx_tree.mdl'), mg = fs.readFileSync(mdlF);
    fs.rmSync(mdlF);
    ok(fx.verify(d2, form).some(x => /missing .*fx_tree\.mdl/.test(x)), tag + 'verify() catches a missing fx_tree.mdl');
    fs.writeFileSync(mdlF, mg);
    const plyF = path.join(d2, FM.game, 'resource', 'entity', 'fx', 'fx_wall.ply'), pg = fs.readFileSync(plyF), pb = Buffer.from(pg);
    pb[pb.length - 1] ^= 1;
    fs.writeFileSync(plyF, pb);
    ok(fx.verify(d2, form).some(x => /fx_wall\.ply: differs/.test(x)), tag + 'verify() catches a changed fx_wall.ply');
    fs.writeFileSync(plyF, pg);
    ok(fx.verify(d2, form).length === 0, tag + 'verify() clean after the def file restores');
  }
  {
    let threw = '';
    try { fx.make(d, { form: form === 'as2' ? 'goh' : 'as2' }); } catch (e) { threw = e.message; }
    ok(/already holds/.test(threw), tag + 'make() refuses the other form in the same dir');
    try { fx.make(path.join(W, 'nope'), { form: 'as64' }); threw = ''; } catch (e) { threw = e.message; }
    ok(/form must be/.test(threw), tag + 'make() refuses an unknown form');
  }

  // ---- 9. fxanswers.json against the files
  const A = answers[form];
  const doc = A.doc.a;
  ok(doc.v === 1 && doc.game === FM.target && doc.key === MAP && doc.cell === net.cell && doc.upm === 20, tag + 'answers doc header');
  ok(doc.net.w === net.width && doc.net.h === net.height && doc.net.offX === net.offX && doc.net.offY === net.offY && doc.net.cell === net.cell && doc.net.version === net.version,
    tag + 'answers doc net = map.net');
  ok(eq(doc.net.types.map(t => [t.id, t.name]), net.types.map(t => [t.index, t.name])) && eq(doc.net.materials.map(t => [t.id, t.name]), net.materials.map(t => [t.index, t.name])),
    tag + 'answers doc net tables = map.net tables');
  ok(eq(doc.boxes.named.map(c => [c.name, c.world, c.camera, c.pather, c.water]), clips.map(c => [c.name, c.world, c.camera, c.pather, c.water])), tag + 'answers doc boxes = Clips');
  ok(doc.water.level === Wl && doc.water.source === 'map' && (form === 'goh' ? doc.water.ocean && doc.water.ocean.zlevel === -20 && doc.water.ocean.kind === 'lake' : doc.water.ocean === null),
    tag + 'answers doc water');
  ok(eq(doc.modes.map(m => m.id), FM.modes) && doc.modes.every(m => m.file === m.id + '.mi'), tag + 'answers doc modes ' + doc.modes.map(m => m.id));
  const mapE = doc.entities.filter(e => e.src === 'map');
  ok(eq(mapE.map(e => [e.uid, e.def, e.x, e.y, e.yaw, e.scale]), ents.map(e => [e.uid, e.def, e.x, e.y, e.yaw, e.scale])), tag + 'answers doc map entities = map file');
  const road = mapE.find(e => e.def === 'fx_road');
  ok(road && road.decal && road.decal.order === 1 && eq(road.decal.color, [156, 138, 110, 255]), tag + 'answers fx_road decal');
  const dbz = doc.modes.find(m => m.id === 'battle_zones');
  for (const f of KNOWN.flags) {
    const af = dbz.flags.find(x => x.name === f.name);
    const want = form === 'as2' ? { kind: 'circle', rA: f.as2zone[0], rB: f.as2zone[1] } : f.goh.kind === 'circle' ? { kind: 'circle', rA: f.goh.r, rB: f.goh.r } : { kind: 'poly', pts: f.goh.pts };
    ok(af && af.x === f.x && af.y === f.y && eq(af.zone, want), tag + 'answers flag ' + f.name + ' zone ' + JSON.stringify(af && af.zone));
  }
  for (const s of KNOWN.spawns) ok(dbz.spawns.some(x => x.name === s.name && x.x === s.x && x.y === s.y && x.yaw === s.yaw), tag + 'answers spawn ' + s.name);
  {
    const fl = doc.modes.find(m => m.id === FM.fl).spawns.find(x => x.uid === 0x8012);
    ok(fl && fl.team === 'a' && fl.phase === 1 && fl.order === 1 && fl.x === -450 && fl.y === 20, tag + 'answers sp1 spawn team a phase 1 order 1');
  }
  ok(eq(A.layer.flags.a.items.map(x => [x.name, x.zone]), dbz.flags.map(x => [x.name, x.zone])) && A.layer.flags.a.kind === 'vector' && A.layer.flags.a.pal === 'sides',
    tag + 'answers layer flags = doc flags');
  if (form === 'as2') {
    ok(eq(A.maps.a.maps.map(m => [m.key, m.files]), [[MAP, keys]]), tag + 'answers maps row = the folder');
    const g = A.layer['water.band'].a;
    ok(g.kind === 'grid' && g.w === net.width && g.h === net.height && g.cell === net.cell && g.ox === -net.offX && g.oy === -net.offY && g.etype === 'u8' && g.sample === 'cell',
      tag + 'answers water.band grid frame');
    const band = unb(g.data, Uint8Array);
    ok(band.length === net.width * net.height, tag + 'water.band data size');
    let bandBad = 0;
    for (let j = 0; j < net.height; j++) for (let i = 0; i < net.width; i++) {
      const c = mapnet.cellAt(net, i, j), edge = i === net.width - 1 || j === net.height - 1;
      const t = edge ? c.type : retype(c.type, c.height, Wl), b = t === 4 || t === 5 ? 2 : t === 3 ? 1 : 0;
      if (band[j * net.width + i] !== b) bandBad++;
    }
    ok(bandBad === 0, tag + 'water.band answer = re-typed map.net over every cell (' + bandBad + ' wrong)');
    const hv = A.hover.a;
    ok(hv.step === 1 && hv.w === net.width && hv.h === net.height && hv.cell === net.cell && hv.waterLevel === Wl, tag + 'hover frame');
    const H = unb(hv.layers.height.data, Int16Array), S = unb(hv.layers.slopecls.data, Uint8Array), T = unb(hv.layers.gtype.data, Uint8Array);
    let hBad = 0;
    for (let j = 0; j < net.height; j++) for (let i = 0; i < net.width; i++) if (H[j * net.width + i] !== hAt(i, j)) hBad++;
    ok(hBad === 0, tag + 'hover height = map.net heights');
    ok(S[48 * 128 + 39] === 5 && S[48 * 128 + 64] === 0, tag + 'hover slopecls at (39, 48) / (64, 48)');
    ok(KNOWN.pond.every(([i, , , lt]) => T[28 * 128 + i] === lt), tag + 'hover gtype on the pond row');
    ok(eq(A.layer.spawns.a.items.filter(x => x.mode === 'combat').map(x => [x.name, x.x, x.y]), [['a1', -503.7, 12.2], ['b1', 497.5, -15.5]]), tag + 'answers layer spawns (combat)');
    ok(A.layer.boxes.a.items.some(x => x.box === 'pather' && eq(x.b, [-580, -420, 580, 420])), tag + 'answers layer boxes');
  }
}

// ---- 10. check() and the CLI
{
  const r = require('./fxmake').check(path.join(W, 'chk'));
  ok(r.ok, 'check() against the repo fxanswers.json: ' + r.problems.slice(0, 3).join('; '));
  const tam = JSON.parse(fs.readFileSync(path.join(__dirname, 'fxanswers.json'), 'utf8'));
  tam.as2.doc.a.modes[0].flags[0].zone.rA = 999;
  const tf = path.join(W, 'tampered.json');
  fs.writeFileSync(tf, JSON.stringify(tam, null, 1) + '\n');
  const r2 = fx.check(path.join(W, 'chk2'), { answersFile: tf });
  ok(!r2.ok && r2.problems.some(p => /as2\.doc\.a\.modes\.0\.flags\.0\.zone\.rA/.test(p)), 'check() catches a tampered answer: ' + r2.problems[0]);
  const c = spawnSync(process.execPath, [path.join(__dirname, 'fxmake.js'), '--check', path.join(W, 'clichk')], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  ok(c.status === 0 && /PASS fxmake check/.test(c.stdout), 'fxmake --check exits 0 (' + c.status + ') ' + (c.stdout || '').trim().split('\n').pop());
  const b = spawnSync(process.execPath, [path.join(__dirname, 'fxmake.js'), path.join(W, 'clibuild'), '--form', 'goh'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  let j = null; try { j = JSON.parse(b.stdout); } catch (e) { }
  ok(b.status === 0 && j && j.target === 'goh' && j.map === MAP && fs.existsSync(path.join(j.gameDir, 'resource/map/multi/mv_fixture/map.net')), 'fxmake <dir> --form goh builds and prints the object');
  const u = spawnSync(process.execPath, [path.join(__dirname, 'fxmake.js'), path.join(W, 'clibad'), '--form', 'as3'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  ok(u.status === 2 && /form must be/.test(u.stderr), 'fxmake refuses a bad --form (exit ' + u.status + ')');
  const nv = spawnSync(process.execPath, [path.join(__dirname, 'fxmake.js'), path.join(W, 'clinone'), '--form'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  ok(nv.status === 2 && /usage/.test(nv.stderr) && !fs.existsSync(path.join(W, 'clinone')), 'fxmake refuses --form with no value (exit ' + nv.status + ')');
}
// ---- 11. sources: LF, ASCII, no drive path or home folder
for (const f of ['fxmake.js', 'fixture.test.js', 'fxanswers.json']) {
  const s = fs.readFileSync(path.join(__dirname, f), 'latin1');
  ok(!/\r/.test(s) && !/[^\x09\x0a\x20-\x7e]/.test(s), f + ' is LF and ASCII');
  const BS = String.fromCharCode(92), home = ['Users', 'home'];   // built from parts so this line does not match itself
  const hit = /[A-Za-z]:[\\/][A-Za-z]/.test(s) || home.some(h => s.includes(BS + h + BS) || s.includes('/' + h + '/'));
  ok(!hit, f + ' holds no drive path or home folder');
}

if (fail) { console.log('FAIL mapviz fixture: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('PASS mapviz fixture (' + pass + ')');
