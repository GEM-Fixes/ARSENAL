// xlate test: invented records and invented SDL, no game data. node tools/xlate/test/test.js
// Author: Imperator_Aug (ARSENAL, ia-1f32d4c5)
const assert = require('assert');
const X = require('../xlate.js');
const sdlx = require('../../lib/sdlx');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

// percentiles
t('pct and summ', () => {
  assert.strictEqual(X.pct([1, 2, 3, 4, 5], .5), 3);
  assert.strictEqual(X.pct([], .5), null);
  const s = X.summ([10, 20, 30]);
  assert.deepStrictEqual([s.n, s.p50, s.min, s.max], [3, 20, 10, 30]);
});

// repeatable split
t('rng is deterministic', () => {
  const a = X.rng(7), b = X.rng(7);
  for (let i = 0; i < 5; i++) assert.strictEqual(a(), b());
});

// invented class "tank": AS2 speed = 0.5 x GoH speed, AS2 mass = GoH mass, AS2 fuel always 200, GoH key `foo` only in GoH
const rec = (game, stem, k, flat) => ({ game, src: 'vanilla', cls: 'tank', stem, key: 'x/' + stem, k, flat: flat || {} });
const records = [];
for (let i = 0; i < 30; i++) {
  const sp = 20 + i, ms = 10000 + i * 100;
  records.push(rec('goh', 'u' + i, { speed: sp, mass: ms, fuel: 100 + i * 7 }, { 'entity/mass': [ms, 1], 'entity/foo': [1, 1], 'entity/perks/component/health/hp': [250, 1], 'entity/recoil': [1, 1], 'entity/bar': [5, 1] }));
  records.push(rec('as2', 'u' + i, { speed: sp * 0.5, mass: ms, fuel: 200 }, { 'entity/mass': [ms, 1], 'entity/bar': [5, 1], 'entity/nativeonly': [1, 1] }));
}
// a GoH unit with no AS2 pair, and an AS2 unit with no GoH pair
records.push(rec('goh', 'solo', { speed: 99 }, { 'entity/foo': [1, 1] }));
records.push(rec('as2', 'lone', { speed: 5 }, {}));

const tab = X.build(records, { hold: 1 / 3, seed: 3, readers: { kw: new Map([['bar', 'game/x.cpp:1']]) }, rules: [{ re: '(^|/)recoil$', cat: 'dropped', reason: 'invented rule' }] });

t('pairs and hold-back', () => {
  assert.strictEqual(tab.meta.pairs, 30);
  assert.ok(tab.meta.heldOut >= 3 && tab.meta.heldOut <= 20, 'about a third held out: ' + tab.meta.heldOut);
});
t('factor recovered, holdout error ~ 0', () => {
  const f = tab.factors.tank.speed, h = tab.holdout.tank.speed;
  assert.strictEqual(f.mode, 'factor');
  assert.ok(Math.abs(f.factor - 0.5) < 1e-6, 'factor ' + f.factor);
  assert.ok(h.n > 0 && h.median_err < 1e-6 && h.tight === true);
});
t('identical values pick copy', () => {
  assert.strictEqual(tab.factors.tank.mass.mode, 'copy');
  assert.ok(tab.holdout.tank.mass.median_err < 1e-9);
});
t('native constant picks const', () => {
  const f = tab.factors.tank.fuel;
  assert.strictEqual(f.mode, 'const');
  assert.strictEqual(f.value, 200);
  assert.ok(tab.holdout.tank.fuel.median_err < 1e-9);
});
t('pooled margins exist for tight keys', () => {
  assert.ok(tab.pooled.speed && tab.pooled.speed.tight === true && tab.pooled.speed.n > 0);
});
t('key rows: translated / dropped / carried / native', () => {
  const by = Object.fromEntries(tab.rows.map(r => [r.key, r]));
  assert.strictEqual(by['entity/mass'].cat, 'translated');
  assert.strictEqual(by['entity/perks/component/health/hp'].cat, 'translated');   // curated part_health path
  assert.strictEqual(by['entity/recoil'].cat, 'dropped');
  assert.strictEqual(by['entity/recoil'].reason, 'invented rule');
  assert.strictEqual(by['entity/foo'].cat, 'dropped');                            // GoH only, no reader
  assert.strictEqual(by['entity/bar'].cat, 'carried');                            // both games
  assert.strictEqual(by['entity/bar'].reader, 'game/x.cpp:1');
  assert.strictEqual(by['entity/nativeonly'].cat, 'native');
});
t('GoH-only key with a reader is carried', () => {
  const t2 = X.build(records, { readers: { kw: new Map([['foo', '']]) }, rules: [] });
  assert.strictEqual(t2.rows.find(r => r.key === 'entity/foo').cat, 'carried');
});
t('generic ratio table counts identical values', () => {
  const g = tab.generic.tank['entity/bar'];
  assert.ok(g && g.same >= 5 && g.median === 1);
});
t('too few pairs gives none', () => {
  const t3 = X.build(records.slice(0, 4), { hold: 0 });
  assert.ok(['none', 'const'].includes(t3.factors.tank.speed.mode));
});

// sample: shared stems first, even spread for the rest
t('pickSample keeps shared first', () => {
  const list = Array.from({ length: 50 }, (_, i) => ({ cls: 'c', stem: 's' + i, key: 'k' + i }));
  const sh = new Set(['c|s40', 'c|s41']);
  const got = X.pickSample(list, 10, sh);
  assert.strictEqual(got.length, 10);
  assert.ok(got.slice(0, 2).every(u => sh.has(u.cls + '|' + u.stem)));
});

// weapon facts from invented SDL
t('weaponFacts reads table knots a c e', () => {
  const src = '{from "pattern gun"\n {rechargeTime 6}\n {range 110}\n {projectileDamage 102}\n {projectileDamageTable {10 102}{50 84}{75 68}{100 54}{125 44}{175 0}}\n}\n';
  const root = sdlx.read(Buffer.from(src, 'latin1'), { file: 'resource/set/stuff/gun/x', key: 'resource/set/stuff/gun/x', open: () => null, onError: () => {} }).root;
  const f = X.weaponFacts(root);
  assert.deepStrictEqual([f.pen_a, f.pen_c, f.pen_e, f.recharge, f.range, f.damage], [102, 68, 44, 6, 110, 102]);
});

// flatten: last value wins, counts blocks
t('flatten last value wins', () => {
  const src = '{game_entity\n {chassis {Locomotion {MaxSpeed 25} {MaxSpeed 27}}}\n {volume "a"}{volume "b"}\n}\n';
  const root = sdlx.read(Buffer.from(src, 'latin1'), { file: 'resource/entity/x.def', key: 'resource/entity/x.def', open: () => null, onError: () => {} }).root;
  const f = X.flatten(root);
  assert.strictEqual(f['entity/chassis/locomotion/maxspeed'][0], 27);
  assert.strictEqual(f['entity/volume'][1], 2);
});

console.log(n + ' tests passed');
