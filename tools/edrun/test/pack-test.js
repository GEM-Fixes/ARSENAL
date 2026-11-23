// pack seeded test: synthetic cards, no game. node tools/edrun/test/pack-test.js
// Author: Imperator_Aug (ARSENAL, ia-b1f5f49f)
const assert = require('assert');
const P = require('../pack.js'), E = require('../edrun.js');
const fail = [];
const t = (name, f) => { try { f(); } catch (x) { fail.push(name + ': ' + x.message); } };
const veh = (card, army, content, tags = '') => ({ card, tags: ['all', army, ...tags.split(' ').filter(Boolean)], content, breed: false });
const sq = (card, army, content) => ({ card: `${card}(${army})`, tags: ['frontline_cp', 'infantry', army, 'all'], content, breed: false });
const cards = [
  veh('t34_0', 'rus', '* ( mp/rus/tankman:3 mp/rus/tankman2:1)', 'medium'),
  veh('gaz67b', 'rus', '* ( mp/rus/vehicle_supporter:3 )'),
  veh('Pz3', 'ger', '* ( mp/ger/tankman:4 )', 'medium'),
  veh('pak40', 'ger', '* ( mp/ger/vehicle_supporter:2 )', 'cannon heavycan'),
  veh('type94', 'jap', '* ( mp/jap/vehicle_supporter:2 )', 'cannon'),
  veh('mg34_stan', 'ger2', '* ( mp/ger2/vehicle_supporter:2 )', 'cannon'),
  veh('willysmb', 'usa', '* ( mp/usa/vehicle_supporter:3 )'),
  sq('smgs2', 'rus', 'mp/rus/smg:1'),
  sq('riflemans', 'ger2', 'mp/ger2/squadleader2:1 mp/ger2/rifle2:3'),
  sq('smgs2', 'ger', 'mp/ger/smg:1'),
];
const reps = P.parseReps('| 1 | smgs2(rus) | rus |\n| 2 | `riflemans(ger2)` | ger2 |\n| 3 | pak40 | ger |\n| 4 | type94 | jap |\n| 5 | mg34_stan | ger2 |\n| 6 | Pz3 | ger |\n| 7 | willysmb foe=inf | usa |\nnot a row\n| # | rep | army |\n', true).reps;
t('md rows parsed, header, prose and a bad rep cell skipped', () => assert.deepStrictEqual(reps.map(r => r.name), ['smgs2', 'riflemans', 'pak40', 'type94', 'mg34_stan', 'Pz3']));
t('plain lines with options', () => {
  const r = P.parseReps('# c\nwillysmb(usa) foe=inf\nriflemans ger2 breed=mgun\n', false).reps;
  assert.strictEqual(r[0].opts.foe, 'inf'); assert.strictEqual(r[1].army, 'ger2'); assert.strictEqual(r[1].opts.breed, 'mgun');
});
const b = P.buildPairs(reps.filter(r => /^[A-Za-z0-9_]+$/.test(r.name)), cards, {});
const by = n => b.items.map(i => i.pair).find(p => p.name === n);
t('no errors', () => assert.deepStrictEqual(b.errs, []));
t('control crew from its own card, per stack', () => { assert.deepStrictEqual(b.ctl.crew, ['mp/rus/tankman', 'mp/rus/tankman', 'mp/rus/tankman', 'mp/rus/tankman2']); assert.strictEqual(b.ctl.foe, 'gaz67b'); });
t('gun crew from card, bare shooter, vehicle foe', () => { const p = by('fo_pak40'); assert.strictEqual(p.shooter, 'pak40'); assert.deepStrictEqual(p.crew, ['mp/ger/vehicle_supporter', 'mp/ger/vehicle_supporter']); assert.strictEqual(p.foe, 'gaz67b'); assert.strictEqual(p.dist, undefined); });
t('mortar and stationary mg get an infantry foe', () => { assert.strictEqual(by('fo_type94').foe, 'mp/ger/rifle'); assert.strictEqual(by('fo_mg34_stan').foe, 'mp/ger/rifle'); });
t('names are lowercase', () => assert.ok(b.items.every(i => /^[a-z0-9_]+$/.test(i.pair.name))));
t('mixed-case card keeps its entity name for the shooter', () => assert.strictEqual(by('fo_pz3').shooter, 'Pz3'));
t('infantry breed skips squad leader', () => assert.strictEqual(by('fo_riflemans').shooter, 'mp/ger2/rifle2'));
t('infantry damage-in default is 5 rifles at 30 m on the rep', () => { const p = by('di_smgs2'); assert.deepStrictEqual([p.class, p.shooter, p.count, p.dist, p.foe], ['infantry', 'mp/ger/rifle', 5, 30, 'mp/rus/smg']); });
t('--di-inf changes it', () => { const x = P.buildPairs(reps.slice(0, 1), cards, { diInf: 'mp/usa/mgun:2:50' }); const p = x.items[1].pair; assert.deepStrictEqual([p.shooter, p.count, p.dist], ['mp/usa/mgun', 2, 50]); });
t('tank on lone human is off by default, on by flag', () => {
  assert.ok(!b.items.some(i => i.kind === 'tk'));
  const x = P.buildPairs(reps.slice(0, 1), cards, { tankHuman: true }), p = x.items.find(i => i.kind === 'tk').pair;
  assert.deepStrictEqual([p.shooter, p.foe, p.class], ['t34_0', 'mp/rus/smg', 'vehicle']);
});
t('gun damage-in: control tank, foeClass gun, rep crew', () => { const p = by('di_pak40'); assert.strictEqual(p.shooter, 't34_0'); assert.strictEqual(p.foeClass, 'gun'); assert.strictEqual(p.foeCrew.length, 2); });
// damage-in shooter by class group (TST-47)
const cards2 = [...cards, veh('pz6bh', 'ger', '* ( mp/ger/tankman:5 )', 'heavy'), veh('is2', 'rus', '* ( mp/rus/tankman:4 )', 'heavy'), veh('tiger', 'ger', '* ( mp/ger/tankman:5 )', 'heavy')];
const GRP = { pz6bh: 'tank_heavy', is2: 'tank_heavy', tiger: 'tank_heavy', Pz3: 'tank_medium', willysmb: 'car', pak40: 'cannon' };
const di = (names, o = {}) => { const x = P.buildPairs(P.parseReps(names, false).reps, o.cards || cards2, { groupOf: n => GRP[n] || null, ...o }); return { x, p: n => x.items.map(i => i.pair).find(p => p.name === n) }; };
t('groupOfKey reads the folder after -vehicle', () => { assert.strictEqual(P.groupOfKey('resource/entity/-vehicle/tank_heavy/is2/is2.def'), 'tank_heavy'); assert.strictEqual(P.groupOfKey('resource/entity/x.def'), null); });
t('heavy rep gets pz6bh with its own crew', () => { const p = di('tiger').p('di_tiger'); assert.strictEqual(p.shooter, 'pz6bh'); assert.deepStrictEqual(p.crew, Array(5).fill('mp/ger/tankman')); });
t('medium, car and gun stay on the control shooter', () => { const d = di('Pz3\nwillysmb\npak40'); for (const n of ['di_pz3', 'di_willysmb', 'di_pak40']) assert.strictEqual(d.p(n).shooter, 't34_0'); });
t('pz6bh itself gets is2', () => { const p = di('pz6bh').p('di_pz6bh'); assert.strictEqual(p.shooter, 'is2'); assert.deepStrictEqual(p.crew, Array(4).fill('mp/rus/tankman')); });
t('--di-shooter overrides the run, rep option dishooter overrides one rep', () => {
  const d = di('Pz3\ntiger dishooter=is2', { diShooter: 'pz6bh' });
  assert.strictEqual(d.p('di_pz3').shooter, 'pz6bh'); assert.strictEqual(d.p('di_tiger').shooter, 'is2');
  assert.strictEqual(di('Pz3 dishooter=pz6bh').p('di_pz3').shooter, 'pz6bh');
});
t('shooter card missing on the stack: control shooter and a named warning', () => {
  const d = di('tiger', { cards });
  assert.strictEqual(d.p('di_tiger') === undefined, true);   // tiger has no card here either: use pz3 as the rep
  const e = di('Pz3', { cards, diShooter: 'pz6bh' });
  assert.strictEqual(e.p('di_pz3').shooter, 't34_0'); assert.ok(e.x.warns.some(w => /pz6bh/.test(w) && /control t34_0/.test(w))); assert.deepStrictEqual(e.x.errs, []);
});
t('the control pair is unchanged by the shooter choice', () => { const a = di('tiger').x.ctl, c = di('tiger', { diShooter: 'is2' }).x.ctl; assert.deepStrictEqual(a, c); assert.strictEqual(a.shooter, 'pz6bh'); });
// PK-1: the damage-in shooter is its own constant, not the first control
t('PK-1 medium rep damage-in shooter is still t34_0 though the control is pz6bh', () => {
  const d = di('Pz3'); assert.strictEqual(d.x.ctl.shooter, 'pz6bh');
  assert.strictEqual(d.p('di_pz3').shooter, 't34_0'); assert.deepStrictEqual(d.p('di_pz3').crew, ['mp/rus/tankman', 'mp/rus/tankman', 'mp/rus/tankman', 'mp/rus/tankman2']);
});
t('PK-1 rep t34_0 and a tank-human pair keep the t34_0 shooter too (infantry tk uses ctl, unchanged rule)', () => { assert.strictEqual(di('Pz3').p('di_pz3').shooter, 't34_0'); });
t('PK-1 explicit --control: its first shooter is the damage-in shooter, as before', () => {
  const d = di('Pz3', { control: ['is2:t34_0'] }); assert.strictEqual(d.x.ctl.shooter, 'is2'); assert.strictEqual(d.p('di_pz3').shooter, 'is2');
  const e = di('Pz3', { control: 't34_0:gaz67b:600' }); assert.strictEqual(e.p('di_pz3').shooter, 't34_0');
});
t('PK-1 default is one control, pz6bh on t34_0, control:true, no dist', () => {
  const x = di('Pz3').x; assert.deepStrictEqual(x.ctls.map(c => [c.name, c.shooter, c.foe, c.dist, c.control]), [['ctl', 'pz6bh', 't34_0', undefined, true]]);
  assert.ok(!x.ctls.some(c => c.foe === 'gaz67b'), 't34_0 on gaz67b is not a control'); assert.deepStrictEqual(x.warns, []);
});
t('PK-1 no pz6bh card: warn, fall back to t34_0:gaz67b:600, still packs', () => {
  const x = P.buildPairs(P.parseReps('Pz3', false).reps, cards, {});
  assert.deepStrictEqual(x.ctls.map(c => [c.shooter, c.foe, c.dist]), [['t34_0', 'gaz67b', 600]]); assert.ok(x.warns.some(w => /pz6bh/.test(w) && /falling back/.test(w))); assert.deepStrictEqual(x.errs, []);
  assert.strictEqual(P.packGames(x.items, x.ctls).games[0][0].name, 'ctl');
});
t('PK-1 --neg and --soft-ref: report-only, once per session, not control', () => {
  const none = di('Pz3\nwillysmb\npak40\ntiger').x; assert.deepStrictEqual(none.extras, []);
  const x = di('Pz3\nwillysmb\npak40\ntiger', { neg: true, softRef: true }).x;
  const [n, s] = x.extras.map(e => e.pair);
  assert.deepStrictEqual([n.name, n.shooter, n.foe, n.expected, n.control], ['neg_t34pz6', 't34_0', 'pz6bh', 'NOKILL', undefined]);
  assert.deepStrictEqual(n.crew, Array(4).fill('mp/rus/tankman').map((b, i) => i === 3 ? 'mp/rus/tankman2' : b)); assert.strictEqual(n.foeCrew.length, 5);
  assert.deepStrictEqual([s.name, s.shooter, s.foe, s.foeCrew, s.control, s.expected], ['ref_pz6gaz', 'pz6bh', 'gaz67b', ['mp/ger/rifle'], undefined, undefined]);
  const games = P.packGames(x.items, x.ctls, { extras: x.extras, perGame: 4 }).games;
  const all = games.flat().map(p => p.name);
  assert.strictEqual(all.filter(m => m === 'neg_t34pz6').length, 1); assert.strictEqual(all.filter(m => m === 'ref_pz6gaz').length, 1);
  for (const g of games) { assert.ok(g.length <= 8); assert.strictEqual(g.filter(p => p.control).length, 1); assert.deepStrictEqual(E.validate(g), []); }
  const seeded = P.packGames(x.items, x.ctls, { extras: x.extras, perGame: 4, seed: 3 }).games.flat().map(p => p.name);
  assert.strictEqual(seeded.filter(m => m === 'neg_t34pz6').length, 1);
});
t('PK-1 --neg on a stack without the cards: warning, pair left out', () => {
  const x = P.buildPairs(P.parseReps('Pz3', false).reps, cards, { neg: true, softRef: true });
  assert.deepStrictEqual(x.extras, []); assert.ok(x.warns.some(w => /--neg/.test(w))); assert.ok(x.warns.some(w => /--soft-ref/.test(w)));
});
t('every pair passes edrun.validate', () => { const g = P.packGames(b.items, b.ctl).games; for (const x of g) assert.deepStrictEqual(E.validate(x), []); });
t('missing control refuses', () => {
  const x = P.buildPairs(reps, cards, { control: 'nosuch:gaz67b' });
  assert.strictEqual(x.ctl, null); assert.ok(x.errs.some(e => /control/.test(e)));
  assert.throws(() => P.packGames(x.items, x.ctl), /no control/);
});
t('max 8 a game, control in each, 7 per game', () => {
  const many = []; for (let i = 0; i < 20; i++) many.push({ kind: 'fo', pair: { name: 'p' + i, class: 'infantry', shooter: 'mp/rus/smg', foe: 'mp/ger/rifle' } });
  const { games } = P.packGames(many, b.ctl);
  assert.deepStrictEqual(games.map(g => g.length), [8, 8, 7]); assert.ok(games.every(g => g[0].name === 'ctl' && g.length <= 8));
});
t('short game tops up from backfill, once each, names lowercased, no second ctl', () => {
  const few = [{ kind: 'fo', pair: { name: 'a', class: 'infantry', shooter: 'mp/rus/smg', foe: 'mp/ger/rifle' } }];
  const bf = [{ name: 'ctl' }, { name: 'B_X', class: 'infantry', shooter: 'mp/rus/smg', foe: 'mp/ger/rifle' }, { name: 'a' }];
  const { games } = P.packGames(few, b.ctl, { backfill: bf });
  assert.deepStrictEqual(games[0].map(p => p.name), ['ctl', 'a', 'b_x']);
});
t('--seed shuffles the same way twice', () => {
  const a1 = P.packGames(b.items, b.ctl, { seed: 7, perGame: 4 }).games.map(g => g.map(p => p.name).join());
  const a2 = P.packGames(b.items, b.ctl, { seed: 7, perGame: 4 }).games.map(g => g.map(p => p.name).join());
  assert.deepStrictEqual(a1, a2);
});
t('explicit two controls: 6 pairs a game, both pass validate', () => {
  const x = P.buildPairs(P.parseReps('Pz3\ntiger', false).reps, cards2, { groupOf: n => GRP[n] || null, control: ['t34_0:gaz67b:600', 'pz6bh:t34_0'] });
  assert.deepStrictEqual(x.ctls.map(c => [c.name, c.shooter, c.foe, c.dist, c.control]), [['ctl', 't34_0', 'gaz67b', 600, true], ['ctl2', 'pz6bh', 't34_0', undefined, true]]);
  assert.deepStrictEqual(x.ctls[1].foeCrew, ['mp/rus/tankman', 'mp/rus/tankman', 'mp/rus/tankman', 'mp/rus/tankman2'], 'tank foe keeps its own crew');
  assert.strictEqual(x.ctl, x.ctls[0], 'first slot stays the control shooter');
  const many = []; for (let i = 0; i < 18; i++) many.push({ kind: 'fo', pair: { name: 'p' + i, class: 'infantry', shooter: 'mp/rus/smg', foe: 'mp/ger/rifle' } });
  const { games } = P.packGames(many, x.ctls);
  assert.deepStrictEqual(games.map(g => g.length), [8, 8, 8]);
  for (const g of games) { assert.deepStrictEqual(g.slice(0, 2).map(p => p.name), ['ctl', 'ctl2']); assert.deepStrictEqual(E.validate(g), []); }
});
t('--control repeats and takes a distance; one given means one', () => {
  const two = P.buildPairs([], cards2, { control: ['pz6bh:t34_0', 'is2:t34_0:300'] });
  assert.deepStrictEqual(two.ctls.map(c => [c.name, c.shooter, c.dist]), [['ctl', 'pz6bh', undefined], ['ctl2', 'is2', 300]]);
  assert.deepStrictEqual(P.buildPairs([], cards2, { control: 't34_0:gaz67b' }).ctls.map(c => c.name), ['ctl']);
});
t('a named control missing is an error (the default one only falls back)', () => {
  const x = P.buildPairs([], cards, {});
  assert.deepStrictEqual(x.ctls.map(c => c.name), ['ctl']); assert.ok(x.warns.some(w => /pz6bh/.test(w))); assert.deepStrictEqual(x.errs, []);
  assert.ok(P.buildPairs([], cards, { control: ['t34_0:gaz67b', 'pz6bh:t34_0'] }).errs.some(e => /pz6bh/.test(e)));
});
t('backfill never adds a second copy of a control', () => {
  const x = P.buildPairs([], cards2, { control: ['t34_0:gaz67b:600', 'pz6bh:t34_0'] }), few = [{ kind: 'fo', pair: { name: 'a', class: 'infantry', shooter: 'mp/rus/smg', foe: 'mp/ger/rifle' } }];
  const { games } = P.packGames(few, x.ctls, { backfill: [{ name: 'ctl2' }, { name: 'ctl' }] });
  assert.deepStrictEqual(games[0].map(p => p.name), ['ctl', 'ctl2', 'a']);
});
// ---- foe by role (TST-62): its own table. invented unit names; group = folder after -vehicle/, mm = weapon calibre where readable
{
  const cc = [
    veh('t34_0', 'rus', '* ( mp/rus/tankman:3 mp/rus/tankman2:1)', 'medium'), veh('pz6bh', 'ger', '* ( mp/ger/tankman:5 )', 'heavy'),
    veh('gaz67b', 'rus', '* ( mp/rus/vehicle_supporter:3 )'),
    veh('acar20', 'ger', '* ( mp/ger/vehicle_supporter:3 )'), veh('acar75', 'ger', '* ( mp/ger/vehicle_supporter:3 )'),
    veh('btr20', 'ger', '* ( mp/ger/vehicle_supporter:3 )'), veh('btrnone', 'ger', '* ( mp/ger/vehicle_supporter:3 )'), veh('btr75', 'ger', '* ( mp/ger/vehicle_supporter:3 )'),
    veh('scout_car', 'usa', '* ( mp/usa/vehicle_supporter:2 )'), veh('light1', 'usa', '* ( mp/usa/tankman:2 )', 'light'),
    veh('medtank', 'rus', '* ( mp/rus/tankman:4 )', 'medium'), veh('pak40', 'ger', '* ( mp/ger/vehicle_supporter:2 )', 'cannon heavycan'),
  ];
  const G = { acar20: 'car', acar75: 'car', btr20: 'btr', btrnone: 'btr', btr75: 'btr', scout_car: null, light1: 'tank_light', medtank: 'tank_medium', pak40: 'cannon' };
  const MM = { acar20: 20, acar75: 75, btr20: 20, btr75: 75, light1: 37, medtank: 76 };
  const run = names => { const x = P.buildPairs(P.parseReps(names, false).reps, cc, { groupOf: n => G[n] || null, weaponMm: n => MM[n] === undefined ? null : MM[n] }); return { x, p: n => x.items.map(i => i.pair).find(p => p.name === n) }; };
  const foe = run('acar20\nacar75\nbtr20\nbtrnone\nbtr75\nscout_car\nlight1\nmedtank\npak40');
  const lc1 = n => { const p = foe.p('fo_' + n); return [p.foe, p.dist, p.mark, p.foeCrew]; };
  t('no errors on the foe table', () => assert.deepStrictEqual(foe.x.errs, []));
  t('group car, 20 mm: one rifle at 100, mark dead, not gaz67b, no foeCrew', () => assert.deepStrictEqual(lc1('acar20'), ['mp/ger/rifle', 100, 'dead', undefined]));
  t('group car with a 75 mm weapon is not a light car: gaz67b as before', () => assert.deepStrictEqual(lc1('acar75'), ['gaz67b', undefined, undefined, ['mp/ger/rifle']]));
  t('group btr: light car only with a readable weapon of 20 mm or less', () => {
    assert.deepStrictEqual(lc1('btr20').slice(0, 3), ['mp/ger/rifle', 100, 'dead']);
    assert.strictEqual(lc1('btrnone')[0], 'gaz67b'); assert.strictEqual(lc1('btr75')[0], 'gaz67b');
  });
  t('a name that says car is a light car (no group, no weapon info)', () => assert.deepStrictEqual(lc1('scout_car').slice(0, 3), ['mp/ger/rifle', 100, 'dead']));
  t('tanks and guns keep the gaz67b foe and their own distance', () => { for (const n of ['light1', 'medtank', 'pak40']) assert.deepStrictEqual(lc1(n), ['gaz67b', undefined, undefined, ['mp/ger/rifle']], n); });
  t('light car damage-in is unchanged (control shooter on the car, car crew)', () => { const d = foe.p('di_acar20'); assert.deepStrictEqual([d.shooter, d.foe, d.foeCrew.length], ['t34_0', 'acar20', 3]); assert.strictEqual(d.dist, undefined); });
  t('explicit foe=veh on a light car wins', () => { const x = run('acar20 foe=veh').p('fo_acar20'); assert.strictEqual(x.foe, 'gaz67b'); assert.strictEqual(x.dist, undefined); });
  t('pairs validate in edrun', () => { for (const i of foe.x.items) assert.deepStrictEqual(E.validate([foe.x.ctl, i.pair]), [], i.pair.name); });
  t('isLightCar rules', () => {
    assert.strictEqual(P.isLightCar('x', 'car', null), true); assert.strictEqual(P.isLightCar('x', 'armored_car', 20), true); assert.strictEqual(P.isLightCar('x', 'car', 21), false);
    assert.strictEqual(P.isLightCar('x', 'btr', null), false); assert.strictEqual(P.isLightCar('x', 'btr', 20), true); assert.strictEqual(P.isLightCar('x', 'tank_light', 20), false);
    assert.strictEqual(P.isLightCar('armored_car_x', null, null), true); assert.strictEqual(P.isLightCar('carrier', null, null), false); assert.strictEqual(P.isLightCar('cckw_m33', null, null), false);
  });
}
if (fail.length) { console.error('FAIL\n' + fail.join('\n')); process.exit(1); }
console.log('PASS pack-test');
