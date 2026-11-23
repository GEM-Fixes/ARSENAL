// TEST-2 seeded tests, no game: counted kills, cannon blasts, move default + arrived, preflight reading the mod stack
// Author: Imperator_Aug (ARSENAL, ia-2de920e5)
const assert = require('assert');
const e = require('../edrun.js');
const pf = require('../preflight.js');
let n = 0;
const t = (name, f) => { try { f(); n++; } catch (err) { console.error('FAIL test2: ' + name + '\n  ' + (err && err.message)); process.exit(1); } };

// ---- (2) counted kill ----
t('counted: verdict stays, counted + reason added', () => {
  const v = e.verdictOf({ order: 10, kill: 20 }, false, { ratio: 3, cls: 'vehicle' });
  assert.strictEqual(v.verdict, 'PASS');
  assert.strictEqual(v.counted, true);
  assert.strictEqual(v.countReason, 'ok');
  assert.strictEqual(e.verdictOf({ order: 10, kill: 20 }).verdict, 'PASS', 'old call shape unchanged');
});
t('counted: kill on the order tick is not counted, verdict still PASS', () => {
  const v = e.verdictOf({ order: 10, kill: 10 }, false, { ratio: 3, cls: 'vehicle' });
  assert.strictEqual(v.verdict, 'PASS'); assert.strictEqual(v.counted, false); assert.strictEqual(v.countReason, 'on-tick');
});
t('counted: caps vehicle 90, gun 60, infantry 20 game s (wall x ratio)', () => {
  const c = (cls, wall, ratio = 3) => e.verdictOf({ order: 10, kill: 10 + wall }, false, { ratio, cls });
  assert.strictEqual(c('vehicle', 30).counted, true, '90 game s is inside');
  assert.strictEqual(c('vehicle', 31).counted, false); assert.strictEqual(c('vehicle', 31).countReason, 'overcap');
  assert.strictEqual(c('gun', 20).counted, true); assert.strictEqual(c('gun', 21).counted, false);
});
t('counted: infantry cap', () => {
  const c = wall => e.verdictOf({ order: 10, kill: 10 + wall }, false, { ratio: 3, cls: 'infantry' });
  assert.strictEqual(c(6).counted, true); assert.strictEqual(c(7).counted, false); assert.strictEqual(c(7).countReason, 'overcap');
});
t('counted: not PASS is not counted; unknown speed leaves the cap unchecked', () => {
  assert.strictEqual(e.verdictOf({ order: 10 }, false, { ratio: 3, cls: 'gun' }).counted, false);
  const u = e.verdictOf({ order: 10, kill: 50 }, false, { ratio: null, cls: 'gun' });
  assert.strictEqual(u.counted, true); assert.strictEqual(u.countReason, 'cap unchecked');
});
t('counted: under 2 game s with no hit and no part is not counted', () => {
  const o = { ratio: 3, cls: 'vehicle' };
  assert.strictEqual(e.verdictOf({ order: 10, kill: 10.5 }, false, { ...o, hits: 0, parts: [] }).countReason, 'instant');
  assert.strictEqual(e.verdictOf({ order: 10, kill: 10.5 }, false, { ...o, hits: 2, parts: [] }).counted, true);
  assert.strictEqual(e.verdictOf({ order: 10, kill: 10.5 }, false, { ...o, hits: null, parts: [] }).counted, true, 'hits unknown: not judged');
});

// ---- (3) cannon blasts ----
const veh = (name, shooter, foe, x = {}) => ({ name, class: 'vehicle', shooter, crew: ['mp/rus/tankman', 'mp/rus/tankman2'], foe, foeCrew: ['mp/ger/rifle'], ...x });
t('cannon blasts on the shooter count as cannon shots', () => {
  const p = [veh('a', 'pz6bh', 'gaz67b')];
  const log = ['0.2/1-2', '0.2/1-2', '0.2/1-2'].map(h => `BLAST[${h.split('/')[0]}/${h.split('/')[1]}]: pz6bh[1]/{gun} (0.2) 35->35`)
    .concat(['BLAST[3/3-8]: pz6bh[1]/{body} (3) 8->0', 'BLAST[3/2.5-10]: pz6bh[1]/{body} (3) 8->0', 'BLAST[3/3-8]: pz6bh[1]/{body} (3) 8->0', 'BLAST[3/2.5-10]: pz6bh[1]/{body} (3) 8->0']).join('\n');
  const r = e.shotsOf(log, p, true).rows.a;
  assert.strictEqual(r.cannonBlasts, 2, 'one count per shot, not per head');
  // SILENT-1F: the 3 r1 2.0 lines are the cannon, not MG bursts; the 2 blasts are the same shots: max 3, not 5
  assert.strictEqual(r.mgShots, null); assert.strictEqual(r.cannonShots, 3); assert.strictEqual(r.shots, 3);
  assert.strictEqual(r.muzzleKinds['3/3-8'], 2);
});
t('cannon with no muzzle line reads shots from its blasts, and 0 stays 0', () => {
  const p = [veh('a', 'x', 'gaz67b')];
  const r = e.shotsOf('BLAST[3/3-8]: x[1]/{body} (3) 8->0\nBLAST[3/3-8]: x[1]/{body} (3) 8->0\nBLAST[3/3-8]: x[1]/{body} (3) 8->0', p, true).rows.a;
  assert.strictEqual(r.shots, 3); assert.strictEqual(r.cannonShots, 3);
  const z = e.shotsOf('', p, true).rows.a; assert.strictEqual(z.shots, 0); assert.strictEqual(z.cannonBlasts, 0);
  const off = e.shotsOf('BLAST[3/3-8]: x[1]/{body} (3) 8->0', p, false).rows.a; assert.strictEqual(off.cannonBlasts, null);
});
t('muzzle-size cannon and its blasts are not added twice', () => {
  const p = [veh('a', 'x', 'gaz67b')];
  const r = e.shotsOf('BLAST[0.2/1-2.5]: x[1]/{gun} (0.2) 1->1\nBLAST[0.2/1-2.5]: x[1]/{gun} (0.2) 1->1\nBLAST[3/3-8]: x[1]/{body} (3) 8->0\nBLAST[3/3-8]: x[1]/{body} (3) 8->0', p, true).rows.a;
  assert.strictEqual(r.cannonShots, 2); assert.strictEqual(r.shots, 2);
});

// ---- (4) move pair ----
t('move: true / {} gives dy 1000; explicit goal kept', () => {
  const mv = [{ name: 'mt', class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman'], move: true }, { name: 'mu', class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman'], move: {} }, { name: 'mx', class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman'], move: { dy: 300 } }];
  assert.deepStrictEqual(e.validate(mv), []);
  const g0 = e.moveTo(mv[0], 0), g2 = e.moveTo(mv[2], 2), s0 = e.layout(mv[0], 0).s;
  assert.strictEqual(g0.y - s0.y, 1000); assert.strictEqual(e.moveTo(mv[1], 1).y - e.layout(mv[1], 1).s.y, 1000);
  assert.strictEqual(g2.y - e.layout(mv[2], 2).s.y, 300);
  const bad = e.validate([{ ...mv[0], move: false }]); assert.ok(bad.some(s => /move/.test(s)));
});
t('arrived radius: long vehicle or default goal 20 m, explicit goal and infantry 8 m, pair arriveM wins', () => {
  const old = e.buildMission([{ name: 'mo', class: 'vehicle', shooter: 't34_0', crew: ['c'], move: { dy: 300 } }], 'rX', {});
  assert.ok(/near_to \{tag mo_a\}\} \{distance 8\}/.test(old.split('\n').find(l => l.includes('{"p_mo_a" '))), 'explicit goal keeps 8 m');
  const mv = [{ name: 'mt', class: 'vehicle', shooter: 't34_0', crew: ['c'], move: { dy: 300 }, long: true }, { name: 'mi', class: 'infantry', shooter: 'mp/rus/rifle', move: { dy: 300 } }, { name: 'mw', class: 'vehicle', shooter: 't34_0', crew: ['c'], move: { dy: 300 }, arriveM: 35 }];
  assert.deepStrictEqual(e.validate(mv), []);
  const x = e.buildMission(mv, 'rX', {}), ln = k => x.split('\n').find(l => l.includes(`{"${k}" `));
  assert.ok(/near_to \{tag mt_a\}\} \{distance 20\}/.test(ln('p_mt_a')), ln('p_mt_a'));
  assert.ok(/near_to \{tag mi_a\}\} \{distance 8\}/.test(ln('p_mi_a')));
  assert.ok(/near_to \{tag mw_a\}\} \{distance 35\}/.test(ln('p_mw_a')));
});
t('report row of a move pair carries moved and arrived', () => {
  const p = [{ name: 'mt', class: 'vehicle', shooter: 't34_0', crew: ['c'], move: { dy: 300 } }];
  const rows = e.rowsOf(p, { times: { start: 100, 'mt order': 105, 'mt moved': 120, 'mt kill': 120, 'mt arrived': 140 }, logText: '', pipeLines: [], speed: { ratio: 3 } }, null);
  assert.strictEqual(rows[0].moved, 20); assert.strictEqual(rows[0].arrived, 40); assert.strictEqual(rows[0].verdict, 'PASS');
  const nr = e.rowsOf(p, { times: { start: 100, 'mt order': 105 }, logText: '', pipeLines: [], speed: null }, null)[0];
  assert.strictEqual(nr.moved, null); assert.strictEqual(nr.arrived, null);
});
t('rowsOf: a fire row has counted + countReason, old fields kept', () => {
  const p = [veh('a', 't34_0', 'gaz67b')];
  const r = e.rowsOf(p, { times: { start: 0, 'a order': 10, 'a kill': 10 }, logText: '', pipeLines: [], speed: { ratio: 3 } }, null)[0];
  assert.strictEqual(r.verdict, 'PASS'); assert.strictEqual(r.counted, false); assert.strictEqual(r.countReason, 'on-tick');
  for (const k of ['order', 'kill', 'shooterDied', 'gone', 'shots', 'hits', 'parts']) assert.ok(k in r, k);
});

// ---- (5) preflight reads the mod stack ----
t('rangeFromText: last {range} wins, macro range_NNN read', () => {
  assert.deepStrictEqual(pf.rangeFromText('{weapon {range 100 100} {x} {range 120 300}}'), [120, 300]);
  assert.deepStrictEqual(pf.rangeFromText('{weapon {range_220}}'), [220, 220]);
  assert.strictEqual(pf.rangeFromText('{weapon {x 1}}'), null);
});
t('weaponRefOf reads the first weapon ref of an entity text', () => {
  assert.strictEqual(pf.weaponRefOf('{entity {weapon "goh_76mm_x"} {weapon "b"}}'), 'goh_76mm_x');
  assert.strictEqual(pf.weaponRefOf('{entity}'), null);
});
t('reader falls back to the mod folders for a weapon the index lacks', () => {
  const built = { idx: { stuff: {}, byName: d => (d === 'goh_unit' ? [{ refs: [['weapon', 'goh_gun']] }] : []) }, src: null };
  const scan = (kind, name) => (kind === 'weapon' && name === 'goh_gun' ? '{weapon {range 150 400}}' : null);
  const rd = pf.makeRangeReader('G', ['as64+', 'zz_t'], { built, scan });
  const r = rd('goh_unit');
  assert.strictEqual(r.weapon, 'goh_gun'); assert.strictEqual(r.aim, 150); assert.strictEqual(r.max, 400); assert.ok(/mod/.test(r.via), r.via);
  const miss = rd('nothing'); assert.ok(miss.unknown, 'still unknown, with a reason');
  const noWpn = pf.makeRangeReader('G', [], { built, scan: () => null })('goh_unit'); assert.ok(/goh_gun/.test(noWpn.unknown));
});
t('reader falls back for the unit def too', () => {
  const built = { idx: { stuff: {}, byName: () => [] }, src: null };
  const scan = (kind, name) => (kind === 'entity' && name === 'goh_unit' ? '{entity {weapon "goh_gun"}}' : kind === 'weapon' && name === 'goh_gun' ? '{range 90 200}' : null);
  const r = pf.makeRangeReader('G', ['zz_t'], { built, scan })('goh_unit');
  assert.strictEqual(r.max, 200);
});
// mortar weapon ref is a tag string ("weapon werfer42", mortar.inc) and its file writes {aimRange}{maxRange} (set/stuff/reactive/werfer42.weapon) [V on vanilla m1mortar: 110/110]
const fakeIx = { kids: b => b.c || [], nameOf: b => b.n, argsOf: b => b.a || [], parseKey: (src, key) => ({ tree: TREES[key] }) };
const N = v => ({ k: 'INTEGER', value: v });
const TREES = {
  'resource/set/stuff/reactive/werfer42.weapon': { items: [{ k: 'BLOCK', n: 'weapon_bullet', c: [{ n: 'aimRange', a: [N(110)] }, { n: 'maxRange', a: [N(120)] }] }] },
};
t('rangeIn reads aimRange/maxRange when no {range}', () => {
  const v = pf.rangeIn(fakeIx, TREES['resource/set/stuff/reactive/werfer42.weapon']);
  assert.deepStrictEqual([v[0], v[1]], [110, 120]);
  const both = pf.rangeIn(fakeIx, { items: [{ k: 'BLOCK', n: 'w', c: [{ n: 'range', a: [N(90), N(200)] }, { n: 'maxRange', a: [N(5)] }] }] });
  assert.deepStrictEqual([both[0], both[1]], [90, 200], '{range} still wins');
});
t('weapon ref as a tag string resolves by file-name tags, not "weapon weapon x"', () => {
  const key = 'resource/set/stuff/reactive/werfer42.weapon';
  const built = { src: null, idx: { stuff: { [key]: { name: 'werfer42.weapon' } }, byName: d => (d === 'm1mortar' ? [{ refs: [['weapon', 'weapon werfer42']] }] : []),
    stuffFind: tags => (tags === 'weapon werfer42' ? [key] : []) } };
  const r = pf.makeRangeReader('G', [], { built, ix: fakeIx, scan: () => null })('m1mortar');
  assert.strictEqual(r.aim, 110, JSON.stringify(r)); assert.strictEqual(r.max, 120);
  assert.ok(/tags "weapon werfer42" -> set\/stuff\/reactive\/werfer42\.weapon/.test(r.via), r.via);
  const miss = pf.makeRangeReader('G', [], { built: { ...built, idx: { ...built.idx, stuffFind: () => [] } }, ix: fakeIx, scan: () => null })('m1mortar');
  assert.ok(miss.unknown && /weapon werfer42 not found/.test(miss.unknown), 'no match stays unknown');
});
console.log('test2: ' + n + ' passed');
