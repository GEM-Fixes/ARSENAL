// donorpick test: invented defs and pool, no game files. run: node tools/donorpick/test/test.js
// Author: Imperator_Aug (ARSENAL, ia-0538c62a)
const assert = require('assert'), cp = require('child_process'), path = require('path');
const dp = require('../donorpick.js');
let n = 0, fail = 0;
const t = (name, fn) => { n++; try { fn(); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } };

// calibre parsing
t('cal mm', () => assert.strictEqual(dp.calOf('90mm_m3', '').c, 90));
t('cal cm', () => assert.strictEqual(dp.calOf('15cm_x', '').c, 150));
t('cal from ammo', () => assert.strictEqual(dp.calOf('kwk', 'filling "bulletusa_90x600 ap" 1').c, 90));
t('cal mg', () => { const c = dp.calOf('browning_m2', ''); assert.ok(c.mg && c.c === 12.7); });

// features of an invented tank def
const tank = `{game_entity (include "/properties/tank.ext") {props "x" "muzzle_85mm_93mm"} {extension "a.mdl"}
 ("crew_4_human") ("armor_medium" turret(50 30) body(80 30))
 {thickness 12.7}
 ("tank_trace" fx("t"))
 {Weaponry {place "gun" {weapon "75mm_kwk40(L48)" filling "ammo bullet75 ap" 1}} {place "m" {weapon "mg34" filled}}}}`;
t('features tank', () => { const f = dp.features(tank); assert.strictEqual(f.cal, 75); assert.strictEqual(f.armour, 80); assert.strictEqual(f.crew, 4); assert.strictEqual(f.mover, 'T'); assert.ok(f.hasMdl); });
t('comment ignored', () => assert.strictEqual(dp.features('; {thickness 99}\n{thickness 5}').armour, 5));
t('mortar flag', () => assert.ok(dp.features('{props "mortar" "x"} {weapon "weapon 60mm_us-brandt" filled}').mortar));

// VOL-4F: small-arms box, launcher calibre from the unit's name. Seeded defects: each lookalike that must stay refused
const gpool = [{ stem: 'mgstan', cls: 'gun', f: dp.features('{weapon "browning_x" filled} {extension "a.mdl"}') }, { stem: 'gun88', cls: 'gun', f: dp.features('{weapon "88mm_flak" filling "ammo bullet88 ap" 1} {extension "a.mdl"}') }];
const hmgDef = '{weapon "type93hmg_x2" filled} {item "ammo 13x99h" 900}';
t('box 13x99 makes a nameless weapon an mg', () => { const f = dp.features(hmgDef); assert.strictEqual(f.mgcal, 13); assert.strictEqual(f.cal, 0); });
t('box 8x59 too', () => assert.strictEqual(dp.features('{weapon "fiat_revelli_m1935" filled} {item "ammo 8x59" 500}').mgcal, 8));
t('the mg gun takes the mg donor, not the 88', () => assert.strictEqual(dp.pick({ cls: 'gun', ...dp.features(hmgDef) }, gpool).donor, 'mgstan'));
t('seeded: a box of 20 mm or more is no small arm', () => assert.strictEqual(dp.features('{weapon "oddname" filled} {item "ammo 20x138" 9}').mgcal, 0));
t('seeded: a named cannon keeps its calibre beside an mg box', () => { const f = dp.features('{weapon "75mm_kwk40" filled} {weapon "oddname" filled} {item "ammo 8x57" 9}'); assert.strictEqual(f.cal, 75); assert.strictEqual(f.mgcal, 8); });
t('seeded: a box with no weapon reads nothing', () => assert.strictEqual(dp.features('{item "ammo 13x99h" 900}').mgcal, 0));
const launcher = '{weapon "weapon raketenwerfer43" filling "ammo raketenwerfer43" 1}';
t('launcher: calibre from the unit name, gun donor', () => { const f = dp.stemCal(dp.features(launcher), '88mm_launcher'); assert.strictEqual(f.cal, 88); assert.strictEqual(f.calFrom, 'stem'); assert.strictEqual(f.weapon, 'raketenwerfer43'); assert.strictEqual(dp.pick({ cls: 'gun', ...f }, gpool).donor, 'gun88'); });
t('seeded: launcher with no calibre in the unit name stays refused', () => { const f = dp.stemCal(dp.features(launcher), 'launcher_a'); assert.strictEqual(f.cal, 0); assert.ok(/no weapon read/.test(dp.pick({ cls: 'gun', ...f }, gpool).unplaced)); });
t('seeded: no weapon at all stays refused, whatever the name says', () => { const f = dp.stemCal(dp.features('{extension "a.mdl"}'), '88mm_empty'); assert.strictEqual(f.cal, 0); assert.ok(dp.pick({ cls: 'gun', ...f }, gpool).unplaced); });
t('a read calibre is not overwritten by the name', () => assert.strictEqual(dp.stemCal(dp.features('{weapon "75mm_kwk40" filled}'), '88mm_x').cal, 75));

// classes
t('class tank', () => assert.strictEqual(dp.classOfKey('entity/-vehicle/usa/tank_light/m18/m18.def', {}), 'tank'));
t('class car', () => assert.strictEqual(dp.classOfKey('entity/-vehicle/usa/car/x/x.def', {}), 'light'));
t('class mortar by path', () => assert.strictEqual(dp.classOfKey('entity/-vehicle/usaf/mortar/m/m.def', {}), 'mortar'));
t('class gun->mortar by weapon', () => assert.strictEqual(dp.classOfKey('entity/-vehicle/x/cannon/m/m.def', { mortar: true }), 'mortar'));
t('class infantry', () => assert.strictEqual(dp.classOfKey('entity/humanskin/mp/a/a.def', {}), 'infantry'));
t('class train none', () => assert.strictEqual(dp.classOfKey('entity/-vehicle/ger/train/t/t.def', {}), null));

// pick on an invented pool
const mk = (stem, cls, o) => ({ stem, cls, f: Object.assign({ weapons: [], cal: 0, mgcal: 0, weapon: null, armour: 0, crew: 0, mover: 'T' }, o) });
const pool = [mk('light75', 'tank', { cal: 75, armour: 30, crew: 4, weapon: 'x' }), mk('heavy88', 'tank', { cal: 88, armour: 100, crew: 5 }), mk('car', 'light', { mover: 'W' }), mk('how105', 'gun', { cal: 105 })];
const rep = o => Object.assign({ cls: 'tank', cal: 88, mgcal: 0, armour: 100, crew: 5, mover: 'T', weapon: 'w', muzzle: 0 }, o);
t('pick nearest calibre+armour', () => assert.strictEqual(dp.pick(rep(), pool).donor, 'heavy88'));
t('pick same class only', () => assert.strictEqual(dp.pick(rep({ cls: 'light', cal: 0, armour: 0, crew: 0, mover: 'W' }), pool).donor, 'car'));
t('mover mismatch costs', () => assert.strictEqual(dp.pick(rep({ cal: 75, armour: 30, crew: 4, mover: 'W' }), [mk('t', 'tank', { cal: 75, armour: 30, crew: 4, mover: 'T' }), mk('w', 'tank', { cal: 80, armour: 30, crew: 4, mover: 'W' })]).donor, 'w'));
t('far calibre is unplaced, not guessed', () => { const r = dp.pick(rep({ cal: 300 }), pool); assert.ok(r.unplaced && !r.donor); });
t('no candidates in class is unplaced', () => assert.ok(dp.pick(rep({ cls: 'mortar' }), pool).unplaced));
t('gun with no weapon is unplaced', () => assert.ok(dp.pick(rep({ cls: 'gun', cal: 0, armour: 0, crew: 0 }), pool).unplaced));
t('same weapon name wins a tie', () => assert.strictEqual(dp.pick(rep({ cal: 75, armour: 30, crew: 4, weapon: '75mm_us-kw(L48)' }), [mk('a', 'tank', { cal: 75, armour: 30, crew: 4, weapon: '75mm_other' }), mk('b', 'tank', { cal: 75, armour: 30, crew: 4, weapon: '75mm_kw' })]).donor, 'b'));
// GT-06: GoH panzer4h must get the AS2 pz4h, not a 75 mm lookalike whose armour reading happens to match
const p4pool = [mk('chi-nu', 'tank', { cal: 75, armour: 50, crew: 4, weapon: 'type3_75mm' }), mk('marder_3h', 'tank', { cal: 75, armour: 50, crew: 4, weapon: '75mm_pak40' }),
  mk('pz4h', 'tank', { cal: 75, armour: 80, crew: 4, weapon: '75mm_kwk40(L48)' }), mk('pz4g', 'tank', { cal: 75, armour: 50, crew: 4, weapon: '75mm_kwk40(L43)' })];
const p4 = rep({ stem: 'panzer4h', cal: 75, armour: 50, crew: 5, weapon: '75mm_kwk40_l48' });
t('GT-06 same vehicle first: panzer4h -> pz4h', () => assert.strictEqual(dp.pick(p4, p4pool).donor, 'pz4h'));
t('GT-06 weapon (L48) equals _l48', () => assert.ok(dp.score(p4, p4pool[2].f, 'x').parts.sameWeapon === -1));
t('GT-06 L43 vs L48 is half a match', () => assert.ok(dp.score(p4, p4pool[3].f, 'x').parts.sameWeapon === -0.5));
t('GT-06 name family panzer = pz, other names apart', () => { assert.strictEqual(dp.snorm('panzer4h'), dp.snorm('pz4h')); assert.notStrictEqual(dp.snorm('panzer4j'), dp.snorm('pz4h')); assert.notStrictEqual(dp.snorm('pz4h_ger2'), dp.snorm('pz4h')); });
t('GT-06 family: panzer4j -> a pz4, not a lookalike', () => assert.ok(/^pz4/.test(dp.pick(rep({ stem: 'panzer4j', cal: 75, armour: 50, crew: 5, weapon: '75mm_kwk40_l48' }), p4pool.concat([mk('m5', 'tank', { cal: 75, armour: 50, crew: 5, weapon: '75mm_m3' })])).donor)));
t('deterministic tie by stem', () => assert.strictEqual(dp.pick(rep({ cal: 75 }), [mk('zz', 'tank', { cal: 75 }), mk('aa', 'tank', { cal: 75 })]).donor, 'aa'));
t('describe unplaced', () => assert.strictEqual(dp.describe(rep(), { unplaced: 'x' }).confidence, 'unplaced'));
t('describe infantry has no donor', () => assert.strictEqual(dp.describe(rep({ cls: 'infantry' }), {}).donor, null));

// sampler
const units = []; for (const [c, k] of [['tank', 50], ['light', 30], ['gun', 15], ['mortar', 5]]) for (let i = 0; i < k; i++) units.push({ stem: c + i, cls: c });
t('allocate sums to n', () => { const a = dp.allocate({ a: 50, b: 30, c: 15, d: 5 }, 56); assert.strictEqual(Object.values(a).reduce((x, y) => x + y, 0), 56); assert.deepStrictEqual(a, { a: 28, b: 17, c: 8, d: 3 }); });
t('draw stratified', () => { const d = dp.draw(units, 20, 65); assert.strictEqual(d.chosen.length, 20); assert.strictEqual(d.chosen.filter(u => u.cls === 'tank').length, 10); });
t('draw seeded and repeatable', () => assert.deepStrictEqual(dp.draw(units, 20, 65).chosen, dp.draw(units, 20, 65).chosen));
t('draw seed changes it', () => assert.notDeepStrictEqual(dp.draw(units, 20, 65).chosen, dp.draw(units, 20, 66).chosen));
t('draw no duplicates', () => { const d = dp.draw(units, 56, 1).chosen.map(u => u.stem); assert.strictEqual(new Set(d).size, d.length); });
t('allocateEven 56 over 23/18/14/10 = 16/16/14/10', () => assert.deepStrictEqual(dp.allocateEven({ tank: 23, light: 18, gun: 14, mortar: 10 }, 56), { gun: 14, light: 16, mortar: 10, tank: 16 }));
t('allocateEven 56 over 40/40/40/10 = 15/15/16/10', () => assert.deepStrictEqual(dp.allocateEven({ tank: 40, light: 40, gun: 40, mortar: 10 }, 56), { gun: 16, light: 15, mortar: 10, tank: 15 }));
t('allocateEven all large = equal', () => assert.deepStrictEqual(dp.allocateEven({ a: 30, b: 30, c: 30, d: 30 }, 56), { a: 14, b: 14, c: 14, d: 14 }));
t('allocateEven n over pool = all', () => assert.deepStrictEqual(dp.allocateEven({ a: 3, b: 2 }, 56), { a: 3, b: 2 }));

// CLI refusals
const run = a => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'donorpick.js'), ...a], { encoding: 'utf8' });
t('cli no args exit 2', () => assert.strictEqual(run([]).status, 2));
t('cli sample needs seed+out', () => assert.strictEqual(run(['--goh', 'x', '--game', 'y', '--sample', '5']).status, 2));
t('cli unknown arg exit 2', () => assert.strictEqual(run(['--nope']).status, 2));

// --exe: made-up AS2 install with as64.exe, mowas_2.exe and one tank in as64/core. as64 pool sees it, mowas_2 pool does not (no as64/core)
const fs = require('fs'), os = require('os');
const G = fs.mkdtempSync(path.join(os.tmpdir(), 'donorpick-exe-'));
const put = (rel, s) => { const p = path.join(G, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
put('as64.exe', ''); put('mowas_2.exe', '');
const def = cal => `{game_entity\r\n {extension "a.mdl"}\r\n {Weaponry {place "gun" {weapon "${cal}mm_gun" filling "ammo bullet${cal} ap" 1}}}\r\n}\r\n`;
put('resource/entity/-vehicle/tank_medium/base75/base75.def', def(75));
put('as64/core/resource/entity/-vehicle/tank_medium/core88/core88.def', def(88));
try {
  const stems = exe => dp.vanillaPool(G, exe).map(p => p.stem).sort().join(',');
  t('exe none: vfs default as64, as64/core in the pool', () => assert.strictEqual(stems(), 'base75,core88'));
  t('exe as64: same as none', () => assert.strictEqual(stems('as64'), 'base75,core88'));
  t('exe mowas_2: no as64/core, its tank is no donor', () => assert.strictEqual(stems('mowas_2'), 'base75'));
  t('exe mowas2 (GUI id) taken as mowas_2', () => assert.strictEqual(stems('mowas2'), 'base75'));
  t('parse --exe mowas2 -> mowas_2', () => assert.strictEqual(dp.parseArgs(['--exe', 'mowas2']).exe, 'mowas_2'));
  t('parse no --exe -> undefined', () => assert.strictEqual(dp.parseArgs(['--goh', 'x']).exe, undefined));
  t('cli bad --exe exit 2', () => assert.strictEqual(run(['--exe', 'nope']).status, 2));
  t('cli --exe goh refused: exit 2, one line naming GoH', () => { const r = run(['--goh', 'x', '--game', G, '--entity', 'a', '--exe', 'goh']); assert.strictEqual(r.status, 2); assert.match(r.stderr.trim(), /^donorpick: not available for GoH: .*\(plan\/reports\/donor-1\.md\)$/); });
  // a GoH-side fixture: one tank that wants 88 mm. the as64 pool gives core88, the mowas_2 pool only base75
  put('gohmod/resource/entity/-vehicle/ger/tank_medium/t88/t88.def', def(88));
  const pickBy = exe => JSON.parse(run(['--goh', path.join(G, 'gohmod'), '--game', G, '--entity', 't88', '--json', ...(exe ? ['--exe', exe] : [])]).stdout).donor;
  t('cli as64 donor from as64/core', () => assert.strictEqual(pickBy(), 'core88'));
  t('cli --exe mowas_2 donor from the MoW:AS2 view', () => assert.strictEqual(pickBy('mowas_2'), 'base75'));
} finally { fs.rmSync(G, { recursive: true, force: true }); }

console.log(fail ? `${fail} of ${n} FAILED` : `all ${n} passed`);
process.exit(fail ? 1 : 0);
