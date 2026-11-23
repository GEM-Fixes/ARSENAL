// strong unit test (MV-STR): the known answers of rules.md 10 on the fixture map (as2 form with targets mowas2 and as64,
// goh form with target goh), stand-in sight and cover rules (synth.js) and the real pass and water parts; planted bad
// inputs that must be caught; determinism and the README 9.2 golden byte hash of the integer layers (strong.golden.json,
// sha1 of each data block). MAPVIZ_STRONG_GOLDEN=write rewrites the golden file.
// usage: node tools/mapviz/strong/test/strong.test.js
// Author: Imperator_Aug (ARSENAL, ia-f4a8de3f)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-strong-'));
process.env.ARSENAL_CACHE = path.join(W, 'cache');
const S = require('../index');
const F = require('../frame');
const synth = require('./synth');
const fx = require('../../test/fxmake');
const K = require('../../lib/mapkit');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz strong: ' + what); } }
const at = (g, x, y) => { const k = F.cellOf(g, x, y); return k < 0 ? null : g.data[k]; };
const sha = g => crypto.createHash('sha1').update(Buffer.from(g.data.buffer, g.data.byteOffset, g.data.byteLength)).digest('hex');
const GOLD = path.join(__dirname, 'strong.golden.json');
const gold = fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD, 'utf8')) : {};
const newGold = {};

function caught(fn, code, sub, what) {
  try { fn(); ok(false, what + ': no error'); } catch (e) {
    ok(e && e.code === code && (!sub || (e.detail && e.detail.code === sub)), what + ': got ' + (e && e.code) + ' ' + (e && e.detail && e.detail.code) + ' ' + (e && e.message));
  }
}

function one(form, target) {
  const t0 = Date.now();
  const f = fx.make(path.join(W, 'fx-' + form), { form });
  const src = K.source({ target, game: f.gameDir });
  const I = S.inputs([], { target, map: f.map, mode: 'battle_zones', rules: synth.rules(), src });
  const tag = target + ' ';
  ok(I.mode === 'battle_zones' && I.phase === 0, tag + 'mode and phase resolved: ' + I.mode + ' ' + I.phase);
  const fr = F.strongFrame(I.doc);
  ok(fr.w === 32 && fr.h === 24 && fr.cell === 40, tag + 'strong frame 32 x 24 of 40 u: ' + JSON.stringify(fr));
  ok(F.cellOf(fr, 0, 0) === 12 * 32 + 16 && F.cellOf(fr, -400, 0) === 12 * 32 + 6, tag + 'cells of (0,0) and (-400,0)');

  const r = S.run(I, { kind: 'inf', side: 'both', seed: 1, ensemble: 2 });
  const G = n => r.grids.find(g => g.name === n);
  const C = G('strong.contact.inf');
  ok(C && at(C, 0, 0) === 250, tag + 'contact (0,0) = 250: ' + (C && at(C, 0, 0)));
  ok(C && at(C, -400, 0) === 0, tag + 'contact (-400,0) = 0: ' + (C && at(C, -400, 0)));
  const ga = G('strong.a.inf.gate');
  ok(ga && at(ga, -400, 0) === 250, tag + 'gate a inf (-400,0) = 250: ' + (ga && at(ga, -400, 0)));
  ok(ga && at(ga, 300, 0) === 0, tag + 'gate a inf (300,0) = 0 (near b1): ' + (ga && at(ga, 300, 0)));
  ok(ga && at(ga, 300, -200) === 0, tag + 'gate a inf pond = 0: ' + (ga && at(ga, 300, -200)));
  for (const g of r.grids) ok(g.etype === 'u8' && g.w === 32 && g.h === 24 && g.nodata === 255 && /^strong\./.test(g.name), tag + 'layer header ' + g.name);
  const names = r.grids.map(g => g.name);
  for (const s of ['a', 'b']) for (const id of S.APPLIES.inf) ok(names.includes('strong.' + s + '.inf.' + id), tag + 'factor layer ' + s + ' ' + id);
  ok(!names.includes('strong.a.inf.hu') && !names.includes('strong.a.inf.amb'), tag + 'no layer of a factor that does not apply');
  for (const n of ['uncont', 'first', 'danger', 'howitzer']) ok(G('strong.a.inf.' + n).scale === 1, tag + n + ' scale 1');
  const j = r.json;
  ok(j.v === 1 && j.kind === 'strong' && j.unit === 'inf' && j.target === target && j.phase === 0 && j.version === 1, tag + 'json head');
  ok(j.frame.flagsActive.join() === 'f1,f2,f3' && j.frame.contactCells > 0 && Array.isArray(j.frame.midline), tag + 'json frame ' + JSON.stringify(j.frame.flagsActive));
  ok(j.factors.length === 11 && j.factors.filter(x => x.applies).length === 8, tag + 'factor rows');
  const ca = j.candidates.filter(c => c.side === 'a'), cb = j.candidates.filter(c => c.side === 'b');
  ok(ca.length > 10 && cb.length > 10, tag + 'candidates a ' + ca.length + ' b ' + cb.length);
  const rev = ca.filter(c => c.x >= -300 && c.x <= -205 && (c.cls.includes('reverse') || c.cls.includes('dead')));
  ok(rev.length >= 1, tag + 'reverse slope or dead ground behind the ridge for side a: ' + rev.length);
  ok(j.candidates.every(c => c.gate === 0 || (c.score >= 0 && c.score <= 1 && Object.values(c.f).every(v => v >= 0 && v <= 1))), tag + 'scores and factors in 0..1');
  ok(j.candidates.every(c => c.gate === 1 || c.score === 0), tag + 'gate 0 scores 0');
  ok(j.candidates.every(c => Number.isFinite(c.median) && c.spread >= 0 && c.presetsTop >= 0 && c.presetsTop <= 3), tag + 'ensemble fields');
  ok(j.labels.every(id => j.candidates.find(c => c.id === id && c.top)), tag + 'labels are top candidates');
  ok(j.fair.flags.length === 6 && j.fair.dist.a.length === 10 && j.fair.symmetry, tag + 'fair rows');
  ok(j.checks.every(c => c.code === 'FAIR_FLAG'), tag + 'json checks FAIR_FLAG only');
  ok(j.caps.perTile === 40 && j.caps.refine === 300, tag + 'caps');
  // frame.weapons: the reaches used, the same three rows on every game; numbers per game (goh 20.7 / 160, as2 17 / 110)
  const wp = j.frame.weapons, wpI = require('../danger').weapons(I);
  ok(wp && ['grenade', 'mortar', 'howitzer'].every(k => wp[k] && typeof wp[k].name === 'string' && wp[k].reachM === wpI[k].reachM &&
    (wp[k].source === 'stack' || wp[k].source === 'fallback')) && wp !== wpI, tag + 'frame.weapons ' + JSON.stringify(wp));
  ok(wp && (wp.howitzer.source === 'stack' || wp.howitzer.reachM === (target === 'goh' ? 190 : 225)) && (wp.grenade.source === 'stack' || wp.grenade.reachM === (target === 'goh' ? 20.7 : 17)) &&
    (wp.mortar.source === 'stack' || wp.mortar.reachM === (target === 'goh' ? 160 : 110)), tag + 'frame.weapons per game');
  ok(!('ground' in (ga.meta.reasons || {})), tag + 'gate reasons hold no ground');

  // tank gate at the pond
  const rt = S.run(I, { kind: 'tank', side: 'a', seed: 1, ensemble: 2 });
  const gt = rt.grids.find(g => g.name === 'strong.a.tank.gate');
  ok(gt && at(gt, 300, -200) === 0, tag + 'gate a tank pond = 0: ' + (gt && at(gt, 300, -200)));
  ok(rt.grids.some(g => g.name === 'strong.a.tank.hu') && !rt.grids.some(g => g.name === 'strong.a.tank.cv'), tag + 'tank layers hu, no cv');

  // checks
  const ch = S.checks(I, {});
  const has = (code, p) => ch.filter(c => c.code === code && Object.keys(p || {}).every(k => c[k] === p[k]));
  ok(ch.every(c => c.kind === 'check' && c.region === 0 && Number.isFinite(c.x) && Number.isFinite(c.y) && c.code !== 'FAIR_FLAG'), tag + 'check item shape');
  if (target === 'goh') {
    ok(!has('FLAG_UNREACHABLE', { unit: 'tank' }).length && !has('FLAG_UNREACHABLE', { unit: 'at' }).length, tag + 'no FLAG_UNREACHABLE for tank and at');
  } else {
    for (const u of ['tank', 'at']) {
      for (const fl of ['f1', 'f3']) ok(has('FLAG_UNREACHABLE', { side: 'a', unit: u, flag: fl }).length === 1, tag + 'FLAG_UNREACHABLE a ' + u + ' ' + fl);
      // f2 (crest): the point is not reached, but its 8 m zone is (weight up to 0.59, about 5 m out): a zone capture,
      // so no FLAG_UNREACHABLE (rules.md 10 row changed by the zone rule; see the part report)
      for (const s of ['a', 'b']) ok(!has('FLAG_UNREACHABLE', { side: s, unit: u, flag: 'f2' }).length, tag + 'no FLAG_UNREACHABLE ' + s + ' ' + u + ' f2 (zone reached)');
      for (const fl of ['f1', 'f3']) ok(!has('FLAG_UNREACHABLE', { side: 'b', unit: u, flag: fl }).length, tag + 'no FLAG_UNREACHABLE b ' + u + ' ' + fl);
    }
  }
  for (const c of has('REACH_UNEQUAL')) ok(c.value > c.limit, tag + 'REACH_UNEQUAL value ' + c.value + ' above the limit that fired ' + c.limit);
  for (const c of j.checks) ok(c.value === null || c.value > c.limit, tag + 'FAIR_FLAG value ' + c.value + ' above its limit ' + c.limit);
  ok(!('ground' in (ga.meta.reasons || {})) && Object.keys(ga.meta.reasons || {}).every(k => /^GATE_/.test(k)), tag + 'gate meta reasons are GATE codes only: ' + JSON.stringify(ga.meta.reasons));
  ok(j.candidates.filter(c => c.src !== 'garrison').every(c => Number.isFinite(c.z)), tag + 'lattice and fort candidates carry z');
  ok(!has('FLAG_UNREACHABLE', { unit: 'inf' }).length, tag + 'infantry reaches every flag');
  const ru = has('REACH_UNEQUAL').map(c => c.flag).sort().join();
  ok(ru === 'f2,f3', tag + 'REACH_UNEQUAL f2, f3: ' + ru);
  ok(!has('SPAWN_SEEN').length, tag + 'no SPAWN_SEEN');
  const pm = has('PICTURE_MISSING').map(c => c.file).sort().join();
  ok(pm === (target === 'goh' ? 'header,minimap,preview' : 'minimap,preview,preview_small'), tag + 'PICTURE_MISSING ' + pm);
  ok(!has('OBJECT_OUTSIDE').length, tag + 'no OBJECT_OUTSIDE');

  // determinism and golden (integer layers: byte hash, README 9.2)
  if (target === 'mowas2') {
    const r2 = S.run(S.inputs([], { target, map: f.map, mode: 'battle_zones', rules: synth.rules(), src }), { kind: 'inf', side: 'both', seed: 1, ensemble: 2 });
    ok(JSON.stringify(r2.json) === JSON.stringify(j), tag + 'same inputs give the same JSON');
    ok(r2.grids.every((g, i) => sha(g) === sha(r.grids[i])), tag + 'same inputs give the same bytes');
  }
  const hashes = {};
  for (const g of r.grids) hashes[g.name] = sha(g);
  newGold[target] = hashes;
  if (process.env.MAPVIZ_STRONG_GOLDEN !== 'write') {
    const gt2 = gold[target];
    ok(!!gt2, tag + 'golden present');
    if (gt2) for (const n of Object.keys(gt2)) ok(hashes[n] === gt2[n], tag + 'golden ' + n);
  }
  console.log(tag + 'ok in ' + (Date.now() - t0) + ' ms: ' + j.candidates.length + ' candidates, d ' + j.frame.d + ', labels ' + j.labels.length + ', checks ' + ch.length);
  return { I, f, src, target };
}

function planted(base, bases) {
  const { I, f, src } = base;
  // a document without the net frame
  const bad = JSON.parse(JSON.stringify(I.doc)); delete bad.net;
  caught(() => F.strongFrame(bad), 'MV_USAGE', 'STRONG_FRAME', 'planted: document without net');
  // a mode the map does not have
  caught(() => S.inputs([], { target: 'mowas2', map: f.map, mode: 'no_such_mode', rules: synth.rules(), src }), 'MV_NOT_FOUND', null, 'planted: unknown mode');
  // a missing input with no way to compute it: --in holds only mapdoc.json, no game source, no pass rules
  const d = path.join(W, 'in-only-doc'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'mapdoc.json'), JSON.stringify(I.doc));
  caught(() => S.inputs([d], { target: 'mowas2', map: f.map, rules: { sight: null, cover: null, pass: null, water: null } }), 'MV_NOT_FOUND', 'STRONG_INPUT_ABSENT', 'planted: absent input');
  // a bad kind and a bad side
  caught(() => S.run(I, { kind: 'cavalry' }), 'MV_USAGE', null, 'planted: bad kind');
  caught(() => S.run(I, { kind: 'inf', side: 'c' }), 'MV_USAGE', null, 'planted: bad side');
  // a swapped travel grid (side b's times as side a's) must move the contact line: the check catches a wrong input
  const I2 = S.inputs([], { target: 'mowas2', map: f.map, mode: 'battle_zones', rules: synth.rules(), src });
  const Kx = require('../inputs').kindInputs(I2, 'inf');
  Kx.travel = { a: Kx.travel.b, b: Kx.travel.b };
  const ch = S.checks(I2, {});
  ok(!ch.some(c => c.code === 'REACH_UNEQUAL'), 'planted: equal travel grids give no REACH_UNEQUAL');
  // weapon reaches: the stack's text first (as2 aimRange, goh define of .presets, grenade {range}), else per-game fallback
  const DG = require('../danger');
  ok(DG.rangeOf('{weapon_bullet\n\t{aimRange 110}\n\t{maxRange 120}\n}') === 110, 'rangeOf aimRange');
  ok(DG.rangeOf('{from "p"\n\t{range 17}\n}') === 17 && DG.rangeOf('{range 120 130}') === 130, 'rangeOf range');
  const pre = '(define "light_mortar_range"\n\t{aimRange 140}\n)\n(define "medium_mortar_range"\n\t{aimRange 160}\n)\n';
  ok(DG.rangeOf(pre, 'medium_mortar_range') === 160 && DG.rangeOf(pre, 'heavy_mortar_range') === null, 'rangeOf define');
  ok(DG.rangeOf('; {aimRange 5}\n{speed 3}') === null, 'planted: a commented range is not read');
  const fake = (game, files) => ({ game, src: { has: k => k in files, read: k => Buffer.from(files[k]) } });
  const wa = DG.weapons(fake('as2', { 'resource/set/stuff/reactive/werfer42.weapon': '{aimRange 115}' }));
  ok(wa.mortar.reachM === 115 && wa.mortar.source === 'stack' && wa.grenade.reachM === 17 && wa.grenade.source === 'fallback', 'weapons as2 ' + JSON.stringify(wa));
  const wg = DG.weapons(fake('goh', { 'resource/set/stuff/mortar/.presets': pre, 'resource/set/stuff/grenade/anti-personnel.pattern': '{range 20.7}' }));
  ok(wg.mortar.reachM === 160 && wg.grenade.reachM === 20.7 && wg.howitzer.reachM === 190 && wg.howitzer.source === 'fallback', 'weapons goh ' + JSON.stringify(wg));
  ok(wa.howitzer.reachM === 225 && wa.howitzer.source === 'fallback', 'howitzer fallback as2 225 (vanilla range_medium_howitzer) ' + JSON.stringify(wa.howitzer));
  const gp = '(define "range_short_howitzer"\n\t{range 160 170}\n)\n(define "range_medium_howitzer"\n\t{range 215 240}\n)\n';
  const wh = DG.weapons(fake('as2', { 'resource/set/stuff/gun/.presets': gp }));
  ok(wh.howitzer.reachM === 240 && wh.howitzer.source === 'stack', 'howitzer reach read from the stack gun presets (the long range of range_medium_howitzer) ' + JSON.stringify(wh.howitzer));
  ok(DG.weapons(fake('goh', {})).mortar.reachM === 160 && DG.weapons(fake('as2', {})).mortar.reachM === 110, 'weapons fallback per game');
  // unit heights from the unit entry, fallbacks for odd values
  const hT = S.heights('tank', null, { heights: { hullTop: 40, turretTop: 50, gunBone: 44, visor: 52 }, depression: { min: 20, max: -6 }, traverse: { full: true } });
  ok(hT.topU === 50 && hT.eyeU === 52 && hT.gunU === 44 && hT.depressionDeg === -6 && hT.elevationDeg === 20 && hT.source === 'def', 'tank heights from the entry ' + JSON.stringify(hT));
  const hB = S.heights('tank', null, { heights: { hullTop: 2.0, turretTop: null } });
  ok(hB.hullU === 40 && hB.topU === 52, 'planted: a height in metres instead of u falls back ' + JSON.stringify(hB));
  const hA = S.heights('at', null, { heights: { gunBone: 22 }, traverse: { min: -25, max: 25, full: false } });
  ok(hA.gunU === 22 && hA.traverseDeg === 25, 'at gun heights from the entry ' + JSON.stringify(hA));
  ok(S.heights('at', null, null).traverseDeg === 30 && S.heights('tank', null, null).source === 'fallback', 'unit fallbacks');
  // ranges from the vision profile per game (goh numbers of rules/sight profile), the constants only as fallbacks
  const gohSight = Object.assign({}, synth.sight, { rangeM: (vp, viewer, target) => (target === 'tank' && viewer !== 'tank' ? 300 : 100) });
  const W0 = { mortar: { reachM: 160 }, grenade: { reachM: 20.7 }, howitzer: { reachM: 1000 } };
  const vpG = { viewers: { inf: { radiusM: 100, uncoverM: 20 }, at: { radiusM: 100, uncoverM: 25 }, tank: { radiusM: 100, uncoverM: 20 },
    binocular: { reachM: 200, discM: 30 }, flag: { radiusM: 25, uncoverM: 0 } } };
  const RG = S.ranges({ game: 'goh', rules: { sight: gohSight }, sight: { vprof: vpG }, weapons: W0 }, 'at');
  ok(RG.binocU === 200 * 20 && RG.enemyUncoverU === 20 * 20 && RG.ownUncoverU === 25 * 20 && RG.flagU === 25 * 20 && RG.source === 'profile', 'goh ranges from the profile ' + JSON.stringify(RG));
  const RI = S.ranges({ game: 'goh', rules: { sight: gohSight }, sight: { vprof: vpG }, weapons: W0 }, 'inf');
  ok(RI.enemyStandU === 100 * 20 && RI.enemySightU === 100 * 20, 'goh SPAWN_SEEN range is rangeM standing (100 m), not backed out of as2 factors: ' + RI.enemyStandU / 20);
  const RF = S.ranges({ game: 'as2', rules: { sight: synth.sight }, sight: { vprof: synth.sight.profile() }, weapons: W0 }, 'inf');
  ok(RF.binocU === 175 * 20 && RF.enemyUncoverU === 7 * 20 && RF.flagU === 20 * 20 && RF.enemyStandU === 52.5 * 20 && RF.source === 'fallback', 'fallback ranges ' + JSON.stringify(RF));
  ok(S.heights('mg', null, null).source === 'pose' && S.unitEntry({ rules: {}, unitEntries: {} }, 'mg') === null, 'mg: pose heights, no def loaded');
  // phase: the lowest over spawns, flags and clipsBySide (late R3), equal to rules/pass resolvePhase
  const mP = { id: 'x', spawns: [{ team: 'a', phase: 1 }], flags: [{ name: 'f', phase: 1 }], clipsBySide: [{ team: 'a', phase: 0 }] };
  ok(F.phaseOf(mP, null) === 0, 'phaseOf counts clipsBySide: ' + F.phaseOf(mP, null));
  const Ps = require('../../rules/pass');
  if (typeof Ps.resolvePhase === 'function') ok(Ps.resolvePhase({ modes: [mP] }, 'x', null) === F.phaseOf(mP, null), 'phaseOf = pass resolvePhase');
  // default mode: battle_zones first; else the most flags that are not home flags (goh ammunition: base flags only)
  const sp2 = [{ team: 'a' }, { team: 'b' }];
  const mAmmo = { id: 'ammunition', spawns: sp2, flags: [{ name: 'base_flag_b' }, { name: 'base_flag_a' }] };
  ok(F.pickMode({ modes: [mAmmo, { id: 'battle_zones', spawns: sp2, flags: [{ name: 'f1' }] }] }).id === 'battle_zones', 'default mode battle_zones');
  ok(F.pickMode({ modes: [mAmmo, { id: 'combat', spawns: sp2, flags: [{ name: 'f1' }, { name: 'f2' }] }] }).id === 'combat', 'default mode: most field flags');
  // flag zone time: the flag point and a 3 m ring are blocked (goh), a zone cell 7.5 m out is reached
  const tg = { name: 't', w: 40, h: 40, cell: 40, ox: -800, oy: -800, etype: 'f32', sample: 'cell', scale: 1, offset: 0, nodata: -1, meta: {}, data: new Float32Array(1600).fill(-1) };
  tg.data[F.cellOf(tg, 150, 0)] = 12;
  const CK = require('../checks');
  const flc = { name: 'fz', x: 0, y: 0, zone: { kind: 'circle', rA: 200, rB: 200 } };
  const ft = CK.flagTime(tg, flc, 'goh');
  ok(ft && ft.t === 12, 'flagTime reads the zone, not the blocked point: ' + JSON.stringify(ft));
  ok(CK.flagTime(tg, { name: 'fs', x: 0, y: 0, zone: { kind: 'circle', rA: 100, rB: 100 } }, 'as2') === null, 'flagTime null when only cells outside the zone are reached');
  // PICTURE_REFUSED: a vanilla goh minimap (1500 x 1496, the row says 1496 x 1500) is not refused; a short mip chain is
  const pd = { key: 'multi/1v1_balzerweg', boxes: { world: [0, 0, 10054, 10071] }, pictures: {
    minimap: { size: [1500, 1496], format: 'DXT1', mips: 11 }, preview: { size: [2560, 1440], format: 'DXT1', mips: 12 }, header: { size: [960, 256], format: 'DXT1', mips: 10 } } };
  let rowsP = null; try { rowsP = require('../../previews').targets('goh', pd.key, pd); } catch (e) { rowsP = null; }
  if (rowsP) {
    const pi = CK.pictureItems(pd, 'goh', rowsP);
    ok(!pi.some(c => c.code === 'PICTURE_REFUSED' && c.file === 'minimap'), 'vanilla goh minimap not refused: ' + JSON.stringify(pi));
    const pd2 = JSON.parse(JSON.stringify(pd)); pd2.pictures.minimap.mips = 5;
    ok(CK.pictureItems(pd2, 'goh', rowsP).some(c => c.code === 'PICTURE_REFUSED' && c.file === 'minimap'), 'planted: minimap with a short mip chain refused');
    const pd3 = JSON.parse(JSON.stringify(pd)); pd3.pictures.minimap.format = 'DXT5';
    ok(CK.pictureItems(pd3, 'goh', rowsP).some(c => c.code === 'PICTURE_REFUSED' && c.file === 'minimap'), 'planted: minimap DXT5 refused');
  }
  // ensemble 0: median = score, spread 0; a negative count is a usage error. No enemy route: kz off (nodata), noted
  caught(() => S.run(I, { kind: 'inf', side: 'a', ensemble: -1 }), 'MV_USAGE', null, 'planted: ensemble -1');
  const I3 = S.inputs([], { target: 'mowas2', map: f.map, mode: 'battle_zones', rules: synth.rules(), src });
  require('../inputs').kindInputs(I3, 'inf').routes = [];
  const r3 = S.run(I3, { kind: 'inf', side: 'a', seed: 1, ensemble: 0 });
  ok(r3.json.candidates.every(c => c.median === c.score && c.spread === 0), 'ensemble 0: median = score, spread 0');
  ok(r3.json.candidates.every(c => !('kz' in c.f)), 'no enemy route: kz left out of f');
  const kzL = r3.grids.find(g => g.name === 'strong.a.inf.kz');
  ok(kzL && kzL.data.every(v => v === 255), 'no enemy route: kz layer nodata');
  ok(r3.json.notes.some(n => n.code === 'STRONG_DEGRADED' && /no routes of inf/.test(n.msg)), 'no enemy route: STRONG_DEGRADED note ' + JSON.stringify(r3.json.notes));
  // off ground (height nodata, README R24): gate nodata 255, left out of meta.reasons, counted as meta.offGround
  for (const b of bases) {
    const I4 = S.inputs([], { target: b.target, map: b.f.map, mode: 'battle_zones', rules: synth.rules(), src: b.src });
    const hg = I4.grids.height, hc = Object.assign({}, hg, { meta: Object.assign({}, hg.meta), data: hg.data.slice() });
    const nd = hg.nodata === null || hg.nodata === undefined ? -32768 : hg.nodata;
    if (hc.nodata === null || hc.nodata === undefined) hc.nodata = nd;
    for (let j = 0; j < hc.h; j++) for (let i = 0; i < Math.floor(hc.w / 4); i++) hc.data[j * hc.w + i] = nd;
    I4.grids.height = hc;
    const r4 = S.run(I4, { kind: 'inf', side: 'a', seed: 1, ensemble: 0 });
    const g4 = r4.grids.find(g => g.name === 'strong.a.inf.gate');
    const offCells = g4 ? Array.from(g4.data).filter(v => v === 255).length : 0;
    ok(g4 && g4.meta.offGround > 0 && !('ground' in g4.meta.reasons) && Object.keys(g4.meta.reasons).every(k => /^GATE_/.test(k)),
      b.target + ' off ground: meta.offGround ' + (g4 && g4.meta.offGround) + ', reasons ' + JSON.stringify(g4 && g4.meta.reasons));
    ok(g4 && offCells >= g4.meta.offGround, b.target + ' off ground cells are nodata 255: ' + offCells);
  }
  // score and presets
  ok(S.score({ ow: 1, kz: 0 }, S.PRESETS.balanced, 'inf') === 0.5, 'score mean of the factors present');
  ok(S.score({ hu: 1, ow: 0 }, S.PRESETS.hold, 'tank') === 1.5 / 3.5, 'score weights');
  ok(S.APPLIES.mg.includes('enf') && !S.APPLIES.inf.includes('enf') && S.THREAT.at === 'tank' && S.SETUP_S.at === 10, 'fixed names');
}

function cliPart(base, bases) {
  const { spawnSync } = require('child_process');
  const MVJS = path.resolve(__dirname, '../../mapviz.js');
  const run = a => spawnSync(process.execPath, [MVJS, 'strong'].concat(a), { encoding: 'utf8', env: process.env, timeout: 300000 });
  const p = run(['presets', '--json']);
  const pj = (() => { try { return JSON.parse(p.stdout); } catch (e) { return null; } })();
  ok(p.status === 0 && pj && pj.presets.hold.ow === 2 && pj.applies.tank.includes('hu'), 'cli presets --json: ' + p.status + ' ' + p.stderr);
  const u = run(['points', '--target', 'mowas2', '--map', base.f.map, '--json']);
  ok(u.status === 2, 'cli points without --out is a usage error: ' + u.status);
  let sightBuilt = false;
  try { sightBuilt = typeof require('../../rules/sight').canSee === 'function'; } catch (e) { sightBuilt = false; }
  const o = path.join(W, 'cli-out');
  const r = run(['points', '--target', 'mowas2', '--game', base.f.gameDir, '--map', base.f.map, '--mode', 'battle_zones', '--kind', 'inf', '--side', 'a', '--out', o, '--json']);
  if (!sightBuilt) {
    ok(r.status === 3 && /STRONG_INPUT_ABSENT/.test(r.stdout), 'cli points without rules/sight: exit 3 STRONG_INPUT_ABSENT: ' + r.status + ' ' + r.stdout.slice(0, 200));
  } else {
    ok((r.status === 0 || r.status === 1) && fs.existsSync(path.join(o, 'strong.inf.json')) && fs.existsSync(path.join(o, 'strong.a.inf.gate.mvg')), 'cli points with rules/sight: ' + r.status + ' ' + r.stderr);
    let sj = null; try { sj = JSON.parse(fs.readFileSync(path.join(o, 'strong.inf.json'), 'utf8')); } catch (e) { sj = null; }
    ok(sj && sj.phase === 0 && sj.frame.weapons && sj.frame.weapons.grenade.reachM > 0, 'cli points: phase null written as the phase used (0), frame.weapons written: ' + (sj && sj.phase));
  }
  // checks on every game: strong.checks.json {v, kind, name, phase, items, notes}; phase null resolves to the lowest (R-f)
  for (const b of bases) {
    const oc = path.join(W, 'cli-checks-' + b.target);
    const c = run(['checks', '--target', b.target, '--game', b.f.gameDir, '--map', b.f.map, '--mode', 'battle_zones', '--out', oc, '--json']);
    let cj = null, cs = null; try { cj = JSON.parse(fs.readFileSync(path.join(oc, 'strong.checks.json'), 'utf8')); } catch (e) { cj = null; }
    try { cs = JSON.parse(c.stdout); } catch (e) { cs = null; }
    ok(c.status === 0 && cj && cj.v === 1 && cj.kind === 'vector' && cj.name === 'strong.checks' && cj.phase === 0 && Array.isArray(cj.items) && Array.isArray(cj.notes),
      b.target + ' cli checks writes {v, kind, name, phase, items, notes}: ' + c.status + ' ' + (cj && Object.keys(cj).join()) + ' ' + c.stderr.slice(0, 300));
    ok(cj && cs && JSON.stringify(cj.notes) === JSON.stringify(cs.notes) && cj.notes.every(n => typeof n.code === 'string' && typeof n.msg === 'string'),
      b.target + ' cli checks: file notes = summary notes ' + (cj && JSON.stringify(cj.notes)));
  }
}

let base = null;
try {
  base = one('as2', 'mowas2');
  const bases = [base, one('as2', 'as64'), one('goh', 'goh')];
  planted(base, bases);
  cliPart(base, bases);
} catch (e) { fail++; console.log('FAIL mapviz strong: threw ' + (e && e.stack)); }
if (process.env.MAPVIZ_STRONG_GOLDEN === 'write') { fs.writeFileSync(GOLD, JSON.stringify(newGold, null, 1).replace(/\r/g, '') + '\n'); console.log('golden written'); }
if (!fail) fs.rmSync(W, { recursive: true, force: true }); else console.log('kept ' + W);
console.log((fail ? 'FAIL' : 'PASS') + ' mapviz strong (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail ? 1 : 0);
