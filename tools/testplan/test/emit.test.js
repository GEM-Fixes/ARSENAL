// Author: Imperator_Aug (ARSENAL, ia-8bd4a88b)
'use strict';
// testplan emit + pairs test: hand-built rows and cards, no game install. node emit.test.js [scratch dir]
// prints `<n> passed, <m> failed`, exit 1 on a fail. Seeded defects: a row whose entity has no card, a second weapon edrun cannot choose,
// a pair with no crew, a pair beyond its weapon range, a library name that climbs out of the state dir.
const fs = require('fs'), path = require('path'), os = require('os');
const emit = require('../lib/emit'), pairs = require('../lib/pairs');

const scratch = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'testplan-emit-' + process.pid));
require('../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });

let pass = 0, fail = 0;
const ok = (cond, what, extra) => { if (cond) pass++; else { fail++; console.log('FAIL ' + what + (extra !== undefined ? ' :: ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), what, { got: a, want: b });
const readJ = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---- cards (unitgroups.readCards shape: {card, tags, content})
const veh = (card, army, crew, extra = []) => ({ card, tags: [army, 'vehicle', ...extra], content: `* ( ${crew} )` });
const cards = [
  veh('pz6bh', 'ger', 'mp/ger/tankman:5'), veh('t34_0', 'rus', 'mp/rus/tankman:4'), veh('gaz67b', 'rus', 'mp/rus/rifle:1'), veh('is2', 'rus', 'mp/rus/tankman:4'),
  veh('kv1', 'rus', 'mp/rus/tankman:5'), veh('t70', 'rus', 'mp/rus/tankman:2'), veh('su76', 'rus', 'mp/rus/tankman:4'), veh('bt7', 'rus', 'mp/rus/tankman:3'),
  veh('pz4h', 'ger', 'mp/ger/tankman:5'), veh('stug3', 'ger', 'mp/ger/tankman:4'),
  { card: 'zis3', tags: ['rus', 'cannon'], content: '* ( mp/rus/artillerist:4 )' },
  { card: 'riflemans', tags: ['rus', 'infantry'], content: 'mp/rus/squadleader:1 mp/rus/rifle:5' },
];
const weaponMm = n => ({ is2: 122, t70: 45, kv1: 76 }[n] !== undefined ? { is2: 122, t70: 45, kv1: 76 }[n] : null);

// ---- rows (README row shape)
let codeN = 0;
const items = [], rows = [];
function item(name, cls, weapons, card, army) {
  const it = { id: 'entity:' + name, kind: 'entity', key: name, name, cls, source: 'changed', why: [], via: [], weapons, carriers: [], cards: card ? [{ card, army, buyable: true }] : [], file: `entity/${name}.def` };
  items.push(it); return it;
}
function row(it, check, runner, weapon, extra = {}) {
  const c = it.cards[0] || {};
  const r = { id: `${check}|${it.id}${weapon ? '|' + weapon : ''}`, code: 'T-' + String(++codeN).padStart(5, '0'), item: it.id, check, how: 'run', runner, title: check + ' ' + it.name,
    target: { entity: it.name, weapon: weapon || null, ammo: null, card: c.card || null, army: c.army || null, file: it.file, ...extra }, expect: null, status: 'todo', result: null, why: null, limits: [] };
  rows.push(r); return r;
}
function full(it) {
  for (const w of it.weapons) { row(it, 'fire', 'edrun', w); row(it, 'dmgout', 'edrun', w); }
  row(it, 'dmgin', 'edrun'); if (it.cls !== 'human') { row(it, 'crew', 'edrun'); row(it, 'move', 'prove'); }
  row(it, 'spawn', 'prove');
}
const tanks = ['t70', 'su76', 'bt7', 'pz4h', 'stug3'].map(n => item(n, 'vehicle', [n + '_gun'], n, /pz|stug/.test(n) ? 'ger' : 'rus'));
tanks.forEach(full);
const kv1 = item('kv1', 'vehicle', ['76mm_zis5', 'dt_mg'], 'kv1', 'rus'); full(kv1);
const zis3 = item('zis3', 'gun', ['76mm_zis3'], 'zis3', 'rus'); full(zis3);
const rifle = item('riflemans', 'human', ['mosin'], 'riflemans', 'rus'); full(rifle);
const ghost = item('ghost_tank', 'vehicle', ['ghost_gun'], null, null); full(ghost);   // seeded defect: no card on the stack
// a second weapon that edrun CAN select: ammo tag + box list on the row
const is2 = item('is2', 'vehicle', ['122mm_d25', '122mm_d25_he'], 'is2', 'rus');
row(is2, 'fire', 'edrun', '122mm_d25'); row(is2, 'fire', 'edrun', '122mm_d25_he', { ammo: 'fg', ammoBox: ['ammo bullet122 ap', 'ammo bullet122 fg'] });
// rows no runner takes
rows.push({ id: 'refs|entity:t70', code: 'T-static', item: 'entity:t70', check: 'refs', how: 'static', runner: null, target: { entity: 't70' }, status: 'todo' });
rows.push({ id: 'look|entity:t70', code: 'T-player', item: 'entity:t70', check: 'look', how: 'player', runner: null, target: { entity: 't70' }, status: 'todo' });
const plan = { v: 1, tool: 'testplan', items, rows };
const runIds = rows.filter(r => [...emit.EDRUN_CHECKS, ...emit.PROVE_CHECKS].includes(r.check)).map(r => r.id);
const edIds = rows.filter(r => emit.EDRUN_CHECKS.includes(r.check)).map(r => r.id);

const modDir = path.join(scratch, 'game', 'mods', 'mymod');
fs.mkdirSync(modDir, { recursive: true });
const stackOf = (gid) => ({
  gameDir: path.join(scratch, 'game'), exe: gid === 'mowas2' ? 'mowas_2' : gid, gid, kind: gid === 'goh' ? 'goh' : 'as2', mods: gid === 'as64' ? ['as64+'] : [], folder: modDir, name: 'mymod',
  state: path.join(scratch, 'state-' + gid),
  canRun: gid === 'as64' ? { edrun: 'run', prove: 'run', sweep: 'plan' } : gid === 'mowas2' ? { edrun: 'dry', prove: 'plan', sweep: 'plan' } : { edrun: 'no', prove: 'score', sweep: 'plan' },
  why: gid === 'as64' ? {} : gid === 'mowas2' ? { edrun: 'TST-19', prove: 'TST-19' } : { edrun: 'the GoH editor never starts the mission', prove: 'no control pipe' },
});

// ================= pairs: pure calls (no game, no stack)
(function pure() {
  const a = { name: 'fo_t34_0__gaz67b', class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman'], foe: 'gaz67b', foeCrew: ['mp/ger/rifle'], dist: 300, watch: true };
  const idA = pairs.id(a);
  ok(/^P-[A-Z2-7]{5}$/.test(idA), 'pairs.id form P-xxxxx', idA);
  eq(pairs.id({ ...a }), idA, 'pairs.id stable for an equal pair');
  eq(pairs.id({ watch: true, dist: 300, foeCrew: ['mp/ger/rifle'], foe: 'gaz67b', crew: ['mp/rus/tankman'], shooter: 't34_0', class: 'vehicle', name: 'other_name', id: 'P-XXXXX', note: 'n' }), idA, 'pairs.id ignores key order, name, id, note');
  const variants = [{ ...a, dist: 400 }, { ...a, foe: 'pz6bh' }, { ...a, shooter: 'is2' }, { ...a, ammo: 'fg' }, { ...a, watch: false }, { ...a, task: 'aiuse' }, { ...a, control: true }, { ...a, crew: ['mp/rus/tankman', 'mp/rus/tankman'] }];
  const ids = new Set([idA, ...variants.map(pairs.id)]);
  eq(ids.size, variants.length + 1, 'pairs.id differs for different pairs');
  eq(pairs.name({ shooter: 't34_0', foe: 'gaz67b' }), 'fo_t34_0__gaz67b', 'pairs.name fo');
  eq(pairs.name({ shooter: 't34_0', foe: 'kv1' }, 'di'), 'di_kv1__t34_0', 'pairs.name di = di_<unit>__<shooter>');
  eq(pairs.name({ shooter: 'mp/rus/rifle', foe: 'mp/ger/rifle', count: 3 }), 'fo_rus_rifle__ger_rifle', 'pairs.name breed paths');
  eq(pairs.name({ name: 'di_x', shooter: 'T-34(rus)', foe: 'Kv 1.def' }), 'di_kv_1__t_34', 'pairs.name keeps the kind of an old name, ASCII a-z0-9_');
  eq(pairs.name({ shooter: 'kv1', foe: 'gaz67b', task: 'aiuse' }), 'cr_kv1__gaz67b', 'pairs.name crew pair');
  eq(pairs.name({ shooter: 'pz6bh', foe: 't34_0', control: true, name: 'ctl' }), 'ctl', 'pairs.name control');
  ok(/^[a-z0-9_]+$/.test(pairs.name({ shooter: 'танк', foe: 'béta' })), 'pairs.name non-ASCII input gives ASCII');
  const u = pairs.unique([{ name: 'fo_a__b' }, { name: 'fo_a__b' }, { name: 'fo_a__b' }]).map(p => p.name);
  eq(u, ['fo_a__b', 'fo_a__b_2', 'fo_a__b_3'], 'pairs.unique');
  const units = [{ id: 't34_0', name: 'T-34', army: 'rus', cls: 'vehicle' }, { id: 'gaz67b', name: 'GAZ-67', army: 'rus', cls: 'vehicle' }];
  const d = pairs.describe(a, units);
  eq(d.text, 'T-34 (t34_0) fires at GAZ-67 (gaz67b) from 15 m', 'pairs.describe text (README example)');
  eq([d.id, d.name, d.dist, d.shooter.army, d.foe.cls], [idA, a.name, 300, 'rus', 'vehicle'], 'pairs.describe fields');
  ok(d.flags.includes('watch'), 'pairs.describe flags');
  const d2 = pairs.describe({ class: 'infantry', shooter: 'mp/rus/rifle', count: 3, foe: 'mp/ger/rifle' }, null);
  eq(d2.text, '3 x mp/rus/rifle fires at mp/ger/rifle from 1.5 m', 'pairs.describe no units list, class default distance');
  eq([d2.shooter.army, d2.foe.cls], ['rus', 'infantry'], 'pairs.describe army and class from the breed path');
})();

// ================= pairs.lib
(function libTest() {
  const st = path.join(scratch, 'state-lib'), L = pairs.lib({ dir: st });
  eq(L.list(), [], 'lib.list empty, no dir yet');
  ok(!fs.existsSync(path.join(st, 'pairs')), 'lib creates no dir before the first save');
  eq(L.get('none'), null, 'lib.get of a missing name');
  const p = [{ class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman'], foe: 'gaz67b', foeCrew: ['mp/ger/rifle'], dist: 300 }, { name: 'ctl', class: 'vehicle', shooter: 'pz6bh', crew: ['mp/ger/tankman'], foe: 't34_0', foeCrew: ['mp/rus/tankman'], control: true }];
  const s = L.save('my-set', p);
  ok(fs.existsSync(path.join(st, 'pairs', 'my-set.json')) && s.count === 2, 'lib.save writes <state>/pairs/<name>.json');
  const g = L.get('my-set');
  eq(g.map(x => x.name), ['fo_t34_0__gaz67b', 'ctl'], 'lib.get names');
  eq(g.map(x => x.id), p.map(x => pairs.id({ ...x, name: x.name })), 'lib.save puts the id on each pair');
  L.save('b_set', [p[0]]);
  eq(L.list().map(x => [x.name, x.count]), [['b_set', 1], ['my-set', 2]], 'lib.list');
  eq([L.remove('b_set'), L.remove('b_set')], [true, false], 'lib.remove');
  eq(L.list().length, 1, 'lib.list after remove');
  let threw = 0;
  for (const bad of ['../evil', 'a/b', '', '..', 'x'.repeat(80)]) { try { L.save(bad, p); } catch (e) { threw++; } }
  eq(threw, 5, 'seeded: lib.save refuses a name that leaves the pairs dir');
  ok(!fs.existsSync(path.join(st, 'evil.json')), 'seeded: nothing written outside the pairs dir');
  let t2 = false; try { L.save('empty', []); } catch (e) { t2 = true; }
  ok(t2, 'lib.save refuses an empty list');
  eq(pairs.lib(st).list().length, 1, 'lib takes a dir string too');
})();

async function main() {
  // ================= pairs.suggest (injected cards)
  const as64 = stackOf('as64');
  const s1 = await pairs.suggest(as64, { shooter: 't70', cards, weaponMm });
  eq([s1.name, s1.class, s1.foe, s1.dist, s1.watch, s1.crew.length, s1.foeCrew], ['fo_t70__gaz67b', 'vehicle', 'gaz67b', 300, true, 2, ['mp/ger/rifle']], 'suggest: light tank, crew from the card, gaz67b at 300');
  eq(s1.id, pairs.id(s1), 'suggest: carries its id');
  const s2 = await pairs.suggest(as64, { shooter: 'is2', cards, weaponMm, minOf: () => ({ min: 500 }) });
  ok(s2.foe === 't34_0' && s2.foeCrew.length === 4, 'suggest: heavy gun gets the armoured foe with its crew', s2);
  ok(s2.dist >= 500 && /TST-73/.test(s2.note || ''), 'suggest: distance raised to the smallest the gun can point at', s2);
  const s3 = await pairs.suggest(as64, { shooter: 'riflemans', cards });
  eq([s3.class, s3.shooter, s3.count, s3.foe, s3.dist], ['infantry', 'mp/rus/rifle', 3, 'mp/ger/rifle', 30], 'suggest: squad card -> breed, 3 men, 30');
  const s4 = await pairs.suggest(as64, { shooter: 'zis3', foe: 'pz4h', cards });
  eq([s4.class, s4.foe, s4.foeCrew.length, s4.name], ['gun', 'pz4h', 5, 'fo_zis3__pz4h'], 'suggest: named foe, crew from its card');
  const s5 = await pairs.suggest(as64, { shooter: 'ghost_tank', cards });
  ok(s5.error === 'nocard' && !s5.name, 'seeded: suggest of a unit with no card is an error, not a pair', s5);
  const s6 = await pairs.suggest({ ...as64, gameDir: '' }, { shooter: 't70' });
  ok(s6.needsGame === true, 'suggest: no game and no cards -> needsGame');
  const s7 = await pairs.suggest(stackOf('goh'), { shooter: 't70', cards });
  ok(s7.refused === true && /GoH/.test(s7.why), 'suggest: goh refused with the reason');
  const edrun = pairs.edrunMod();
  ok(edrun && typeof edrun.validate === 'function' && typeof edrun.layout === 'function', 'edrun.js loads as a module (validate, layout)');
  if (edrun) {
    eq(edrun.DIST, pairs.DIST, 'pairs.DIST equals edrun DIST');
    eq(edrun.validate([s1, s2, s3, s4].map(p => ({ ...p })), false), [], 'suggested pairs pass edrun validate');
  }

  // ================= pairs.check
  const noGame = { ...as64, gameDir: '' };
  const good = { ...s1 }, noCrew = { name: 'fo_bad__gaz67b', class: 'vehicle', shooter: 'bad', foe: 'gaz67b' };
  const c1 = pairs.check(noGame, [good, noCrew]);
  eq(c1.map(x => x.status), ['OK', 'INVALID'], 'seeded: check flags a vehicle pair with no crew, the good pair stays OK');
  ok(c1[1].notes.some(n => /crew/.test(n)) && c1[0].id === s1.id, 'check: reason and id per pair', c1);
  ok(c1[0].warns.some(w => /no game data/.test(w)), 'check: no game = a warning, never a silent pass');
  const c2 = pairs.check(noGame, [good], { rangeOf: () => ({ weapon: 'w', aim: 5, max: 5, via: 'test' }) });
  eq(c2[0].status, 'OUTOFRANGE', 'seeded: check holds a pair beyond the weapon range');
  eq(pairs.check(stackOf('goh'), [good])[0].status, 'NORUN', 'check: goh = NORUN');
  eq(pairs.check(noGame, []), [], 'check: empty list');

  // ================= emit: as64
  const outA = path.join(scratch, 'out-as64');
  const eA = await emit.write(as64, plan, { out: outA, cards, weaponMm });
  const games = eA.files.filter(f => f.kind === 'edrun');
  ok(games.length >= 3, 'as64: several games', games.length);
  const names = new Set(); let nameOk = true, sizeOk = true, ctlOk = true, valid = true, idOk = true; const idSet = new Map();
  for (const g of games) {
    const ps = readJ(g.path);
    if (ps.length > 8) sizeOk = false;
    if (ps.filter(p => p.control).length < 1 || !ps.some(p => p.name === 'ctl')) ctlOk = false;
    if (edrun && edrun.validate(ps.map(p => ({ ...p })), false).length) { valid = false; console.log(edrun.validate(ps, false)); }
    for (const p of ps) {
      if (!/^[a-z0-9_]+$/.test(p.name)) nameOk = false;
      if (p.id !== pairs.id(p)) idOk = false;
      if (p.control) continue;
      if (names.has(p.name)) nameOk = false; names.add(p.name);
      if (idSet.has(p.id) && idSet.get(p.id) !== JSON.stringify({ ...p, name: 0 })) idOk = false; idSet.set(p.id, JSON.stringify({ ...p, name: 0 }));
    }
  }
  ok(sizeOk, 'as64: at most 8 pairs a game'); ok(ctlOk, 'as64: every game has a control');
  ok(nameOk, 'as64: pair names ASCII and unique over all games'); ok(idOk, 'as64: pair ids match pairs.id, no two different pairs share one');
  ok(valid, 'as64: every game file passes edrun validate');
  const map = readJ(path.join(outA, 'map.json'));
  eq(Object.keys(map).sort(), ['pairs', 'prove', 'sweep'], 'map.json keys');
  eq(Object.keys(map.pairs).sort(), [...names].sort(), 'map.json names every non-control pair');
  ok(Object.values(map.pairs).every(p => /^P-/.test(p.id) && /^g\d+$/.test(p.game) && p.rows.length), 'map.json pair = {id, game, rows}');
  // every edrun row: exactly one pair, or unplaced with a note
  const count = new Map();
  for (const p of Object.values(map.pairs)) for (const r of p.rows) count.set(r, (count.get(r) || 0) + 1);
  const un = new Set(eA.unplaced.map(u => u.row));
  ok(edIds.every(id => (count.get(id) || 0) + (un.has(id) ? 1 : 0) === 1), 'as64: every edrun row is in exactly one pair or in unplaced', edIds.filter(id => (count.get(id) || 0) + (un.has(id) ? 1 : 0) !== 1));
  const inFiles = new Set([].concat(...eA.files.filter(f => f.kind !== 'map').map(f => f.rows)));
  ok(runIds.every(id => inFiles.has(id) !== un.has(id)), 'as64: every run row lands in a file or in unplaced, never both', runIds.filter(id => inFiles.has(id) === un.has(id)));
  ok(![...inFiles, ...un].some(id => /^(refs|look)\|/.test(id)), 'as64: static and player rows are not emitted');
  // row sharing
  const pOf = id => Object.entries(map.pairs).find(([, p]) => p.rows.includes(id));
  eq(pOf('fire|entity:t70|t70_gun')[0], pOf('dmgout|entity:t70|t70_gun')[0], 'fire and dmgout of one weapon share the fo pair');
  ok(/^fo_t70__/.test(pOf('fire|entity:t70|t70_gun')[0]) && /^di_t70__/.test(pOf('dmgin|entity:t70')[0]) && /^cr_t70__/.test(pOf('crew|entity:t70')[0]), 'fo, di, cr pair names', [pOf('dmgin|entity:t70')[0], pOf('crew|entity:t70')[0]]);
  const crPair = [].concat(...games.map(g => readJ(g.path))).find(p => p.name === pOf('crew|entity:t70')[0]);
  eq(crPair.task, 'aiuse', 'crew pair has task aiuse');
  // seeded: second weapon with no way to select it
  ok(!pOf('fire|entity:kv1|dt_mg') && un.has('fire|entity:kv1|dt_mg') && un.has('dmgout|entity:kv1|dt_mg'), 'seeded: kv1 second weapon rows are not claimed by a pair');
  ok(eA.notes.some(n => /kv1 weapon dt_mg: edrun cannot choose/.test(n)), 'seeded: the note says edrun cannot choose the weapon');
  ok(!!pOf('fire|entity:kv1|76mm_zis5') && eA.notes.some(n => /kv1 has 2 weapons/.test(n)), 'kv1 first weapon placed, with the note');
  // a second weapon that can be selected by ammo
  const heName = (pOf('fire|entity:is2|122mm_d25_he') || [])[0], hePair = [].concat(...games.map(g => readJ(g.path))).find(p => p.name === heName);
  ok(hePair && hePair.ammo === 'fg' && hePair.ammoBox.length === 2 && heName !== pOf('fire|entity:is2|122mm_d25')[0], 'is2 second round: own pair with ammo + ammoBox', hePair);
  // seeded: entity with no card
  ok(rows.filter(r => r.item === 'entity:ghost_tank' && emit.EDRUN_CHECKS.includes(r.check)).every(r => un.has(r.id)), 'seeded: rows of an entity with no card are unplaced');
  ok(eA.notes.some(n => /ghost_tank.*no card/.test(n)), 'seeded: the note names the entity with no card');
  ok(!!map.sweep.ghost_tank && map.sweep.ghost_tank.includes('spawn|entity:ghost_tank') && un.has('move|entity:ghost_tank'), 'seeded: its spawn row goes to the sweep, its move row is unplaced');
  // commands
  const edC = eA.commands.filter(c => c.runner === 'edrun');
  eq(edC.length, games.length, 'as64: one edrun command a game');
  ok(edC.every(c => c.needsLaunch === true && c.dry === false && c.argv[0] === 'edrun/edrun.js' && c.argv.includes('as64_ed.exe') && !c.argv.includes('--dry')), 'as64: edrun commands are real runs');
  ok(edC.every(c => c.argv[c.argv.indexOf('--pipe') + 1] === 'dbg_blast 1;dbg_health 1' && c.cmd.includes('--pipe "dbg_blast 1;dbg_health 1"')), 'as64: --pipe dbg_blast and dbg_health');
  ok(edC.every(c => c.argv[c.argv.indexOf('--mods') + 1] === 'as64+,mymod' && c.cmd.startsWith('node tools/edrun/edrun.js --game ')), 'as64: mods = mount list + the mod, cmd form', edC[0].cmd);
  ok(edC.every((c, i) => fs.existsSync(c.argv[c.argv.indexOf('--pairs') + 1]) && JSON.stringify(c.rows) === JSON.stringify(games[i].rows)), 'as64: --pairs names the written file, rows match');
  const rl = fs.readFileSync(path.join(outA, 'edrun', 'run-list.md'), 'utf8').split('\n');
  eq([rl.filter(l => l.startsWith('node tools/edrun/edrun.js')).length, rl.filter(l => /^## g\d+$/.test(l)).length], [games.length, games.length], 'run-list.md: one heading and one line a game');
  let multi = null; try { multi = require('../../edrun/multi.js'); } catch (e) { multi = null; }
  if (multi && multi.parseList) { let n = -1; try { const j = multi.parseList(rl.join('\n')); n = (Array.isArray(j) ? j : j.jobs || j.games || []).length; } catch (e) { n = -2; } ok(n === games.length || n < 0, 'run-list.md read by edrun multi.parseList', n); }
  const prC = eA.commands.filter(c => c.runner === 'prove');
  ok(prC.length >= 3 && prC.every(c => c.needsLaunch && !c.dry && c.argv[0] === 'prove/prove.js' && c.argv.includes('--tiny') && !c.argv.includes('--plan') && !c.argv.includes('--exe')), 'as64: prove commands are real, --tiny');
  const rusMove = prC.find(c => c.id === 'prove-rus-move-1');
  ok(rusMove && rusMove.argv[rusMove.argv.indexOf('--units') + 1].split(',').includes('kv1') && rusMove.argv[rusMove.argv.indexOf('--depth') + 1] === 'move', 'prove: by army and depth', rusMove && rusMove.cmd);
  const rusSpawn = prC.find(c => c.id === 'prove-rus-spawn-1');
  ok(rusSpawn && rusSpawn.argv[rusSpawn.argv.indexOf('--units') + 1] === 'riflemans:human', 'prove: a man is card:human at depth spawn', rusSpawn && rusSpawn.cmd);
  eq(map.prove.t70.slice().sort(), ['move|entity:t70', 'spawn|entity:t70'], 'map.json prove rows by card');
  const sw = eA.commands.filter(c => c.runner === 'sweep');
  ok(sw.length === 1 && sw[0].needsLaunch === false && sw[0].argv[1] === 'plan' && sw[0].argv.includes('--names-file'), 'as64: one sweep plan command');
  const nm = fs.readFileSync(path.join(outA, 'sweep', 'names.txt'), 'utf8').trim().split('\n');
  eq(nm.slice().sort(), Object.keys(map.sweep).sort(), 'sweep names file = map.json sweep');
  ok(nm.includes('t70') && nm.includes('ghost_tank') && nm.length === 9, 'sweep names', nm);
  ok(eA.files.every(f => fs.existsSync(f.path) && path.resolve(f.path).startsWith(outA)), 'as64: every file exists, all under out');

  // prove chunks of 12
  const many = { items: [], rows: [] };
  for (let i = 0; i < 27; i++) { const it = { id: 'entity:u' + i, kind: 'entity', key: 'u' + i, cls: 'vehicle', weapons: [], cards: [{ card: `u${i}(rus)`, army: 'rus', buyable: true }] }; many.items.push(it); many.rows.push({ id: 'spawn|' + it.id, check: 'spawn', how: 'run', runner: 'prove', item: it.id, target: { entity: 'u' + i }, status: 'todo' }); }
  const eM = await emit.write(as64, many, { out: path.join(scratch, 'out-many'), cards });
  eq(eM.commands.filter(c => c.runner === 'prove').map(c => c.argv[c.argv.indexOf('--units') + 1].split(',').length), [12, 12, 3], 'prove: chunks of at most 12, card(army) read');
  eq(eM.files.filter(f => f.kind === 'edrun').length, 0, 'no edrun rows -> no edrun file');

  // sweep thin mod never inside the mod under test
  const eIn = await emit.write(as64, many, { out: path.join(modDir, '.arsenal', 'testplan', 'run'), cards });
  const thin = eIn.commands.find(c => c.runner === 'sweep').argv; const thinDir = thin[thin.indexOf('--out') + 1];
  ok(!path.resolve(thinDir).startsWith(path.resolve(modDir)) && eIn.notes.some(n => /inside the mod/.test(n)), 'sweep: out inside the mod -> thin mod elsewhere, with a note', thinDir);

  // ================= emit: mowas2 (dry / plan)
  const m2 = stackOf('mowas2'), outM = path.join(scratch, 'out-mowas2');
  const eB = await emit.write(m2, plan, { out: outM, cards, weaponMm });
  const edB = eB.commands.filter(c => c.runner === 'edrun'), prB = eB.commands.filter(c => c.runner === 'prove');
  ok(edB.length === games.length && edB.every(c => c.dry === true && c.needsLaunch === false && c.argv.includes('--dry') && c.argv.includes('mowas_2_ed.exe') && !c.argv.includes('--pipe')), 'mowas2: edrun --dry, mowas_2_ed.exe, no --pipe');
  ok(edB.every(c => c.argv[c.argv.indexOf('--mods') + 1] === 'mymod'), 'mowas2: mods without as64+');
  ok(prB.length && prB.every(c => c.dry === true && c.needsLaunch === false && c.argv.includes('--plan') && c.argv[c.argv.indexOf('--exe') + 1] === 'mowas_2.exe'), 'mowas2: prove --plan --exe mowas_2.exe');
  ok(eB.commands.every(c => !c.needsLaunch), 'mowas2: no command launches a game');
  ok(eB.notes.some(n => /--dry only/.test(n)) && eB.notes.some(n => /--plan lines only/.test(n)), 'mowas2: notes say why');
  eq(Object.keys(readJ(path.join(outM, 'map.json')).pairs).sort(), Object.keys(map.pairs).sort(), 'mowas2: same pairs as as64 (stable names)');
  eq(Object.values(readJ(path.join(outM, 'map.json')).pairs).map(p => p.id).sort(), Object.values(map.pairs).map(p => p.id).sort(), 'pair ids stable across runs');

  // ================= emit: goh
  const gh = stackOf('goh'), outG = path.join(scratch, 'out-goh');
  const eG = await emit.write(gh, plan, { out: outG });
  ok(!fs.existsSync(path.join(outG, 'edrun')) && !fs.existsSync(path.join(outG, 'prove')), 'goh: no edrun and no prove file');
  eq(eG.files.map(f => f.kind).sort(), ['map', 'sweep'], 'goh: only the sweep names file and map.json');
  ok(eG.commands.length === 3 && eG.commands.every(c => c.runner === 'sweep' && c.needsLaunch === false && c.tag === '[T]'), 'goh: sweep commands only, none launches, tag [T]', eG.commands.map(c => c.id));
  ok(eG.commands.filter(c => c.how === 'player' && c.argv === null).length === 2 && eG.commands.some(c => /modswitch/.test(c.cmd)) && eG.commands.some(c => /uidrive\.js play goh/.test(c.cmd)), 'goh: modswitch and uidrive play as text for the player');
  ok(eG.commands[0].argv.includes('goh') && eG.commands[0].argv[1] === 'plan', 'goh: preloadsweep plan --exe goh');
  ok(eG.notes.some(n => /^edrun: no file written.*GoH editor never starts/.test(n)) && eG.notes.some(n => /^prove: no file written/.test(n)), 'goh: notes say why no edrun and no prove', eG.notes);
  const unG = new Set(eG.unplaced.map(u => u.row));
  ok(edIds.every(id => unG.has(id)) && !unG.has('spawn|entity:t70') && unG.has('move|entity:t70'), 'goh: edrun and move rows unplaced (player), spawn rows in the sweep');
  eq(Object.keys(readJ(path.join(outG, 'map.json')).pairs), [], 'goh: map.json has no pair');

  // ================= emit: edges
  const eN = await emit.write({ ...as64, gameDir: '' }, plan, { out: path.join(scratch, 'out-nogame') });
  ok(eN.needsGame === true && !eN.commands.some(c => c.runner === 'edrun') && edIds.every(id => eN.unplaced.some(u => u.row === id)), 'no game dir and no cards: needsGame, edrun rows unplaced');
  const eC = await emit.write(as64, plan, { out: path.join(scratch, 'out-noctl'), cards: cards.filter(c => !['pz6bh', 't34_0'].includes(c.card)) });
  ok(!eC.files.some(f => f.kind === 'edrun') && eC.notes.some(n => /no control pair/.test(n)), 'seeded: a stack with no control card writes no game', eC.notes);
  const eE = await emit.write(as64, { items: [], rows: [] }, { out: path.join(scratch, 'out-empty'), cards });
  ok(eE.commands.length === 0 && eE.files.length === 1 && eE.notes.length === 1, 'empty plan: map.json only, one note');
  let threw = false; try { await emit.write(as64, plan, {}); } catch (e) { threw = true; }
  ok(threw, 'emit.write without out is refused');
}

main().catch(e => { fail++; console.log('FAIL exception :: ' + (e && e.stack || e)); }).then(() => {
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
