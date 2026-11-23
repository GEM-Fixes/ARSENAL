// MGPROOF seeded test, no game: dbg_health HEALTH lines prove MG / rifle kills of men (proof 'hp'). node mgproof-test.js
// Author: Imperator_Aug (ARSENAL, ia-20f9b548)
const assert = require('assert');
const e = require('../edrun.js');
let n = 0; const fail = [];
const t = (name, f) => { try { f(); n++; } catch (x) { fail.push(name + ': ' + x.message); } };
const pairs = [
  { name: 'mg', class: 'vehicle', shooter: 'pz1b', crew: ['mp/ger/tankman', 'mp/ger/tankman'], foe: 'mp/rus/rifle' },   // ids: s 1, c 2 3, f 4
  { name: 'inf', class: 'infantry', shooter: 'mp/ger/rifle', count: 3, foe: 'mp/rus/rifle' },                            // ids: s 5 6 7, f 8
];
const M = (p, k) => `EDRUN rH ${p} ${k}`;
const H = (id, breed, dmg, left) => `HEALTH human[${id}:${breed}] : -${dmg} [${left}]`;

t('ids as seeded', () => {
  const ids = e.entityIds(pairs, '');
  assert.deepStrictEqual([ids[1].role, ids[4].role, ids[4].breed, ids[8].role, ids[5].breed], ['s', 'f', 'mp/rus/rifle', 'f', 'mp/ger/rifle']);
});
t('healthLine parses the engine format (with and without a time stamp)', () => {
  assert.deepStrictEqual(e.healthLine('HEALTH human[23:mp/rus/rifle] : -330 [-180]'), { id: '23', name: 'human', breed: 'mp/rus/rifle', dmg: 330, left: -180 });
  assert.strictEqual(e.healthLine('[12:01:02] HEALTH human[8:mp/rus/rifle] : -135 [-119.7]').left, -119.7);
  assert.strictEqual(e.healthLine('control> dbg_health 1'), null);
});
t('seeded: MG kill with no BLAST line, foe HEALTH loss between order and kill -> hp, KILL counted', () => {
  const pr = e.proofOf([M('mg', 'order'), H(4, 'mp/rus/rifle', 135, 15), H(4, 'mp/rus/rifle', 135, -120), M('mg', 'kill')].join('\n'), pairs, 'rH');
  assert.strictEqual(pr.mg.proof, 'hp'); assert.strictEqual(pr.mg.hpBefore, 2); assert.strictEqual(pr.mg.hpLethal, true);
  const row = e.applyProof({ verdict: 'PASS', counted: true }, pairs[0], pr.mg, 720);
  assert.strictEqual(row.killVerdict, 'KILL'); assert.strictEqual(row.counted, true); assert.strictEqual(row.hpBefore, 2);
});
t('seeded: the same kill without dbg_health stays KILL_UNPROVEN', () => {
  const pr = e.proofOf([M('mg', 'order'), M('mg', 'kill')].join('\n'), pairs, 'rH');
  assert.strictEqual(pr.mg.proof, 'none');
  assert.strictEqual(e.applyProof({ verdict: 'PASS', counted: true }, pairs[0], pr.mg, 720).counted, false);
});
t('seeded: HEALTH before the order or after the kill does not prove', () => {
  const pr = e.proofOf([H(4, 'mp/rus/rifle', 135, 15), M('mg', 'order'), M('mg', 'kill'), H(4, 'mp/rus/rifle', 135, -120)].join('\n'), pairs, 'rH');
  assert.strictEqual(pr.mg.proof, 'none'); assert.strictEqual(pr.mg.hpBefore, 0);
});
t('seeded: HEALTH on the shooter side, or on another pair\'s foe, does not prove', () => {
  const pr = e.proofOf([M('inf', 'order'), H(5, 'mp/ger/rifle', 100, 50), H(4, 'mp/rus/rifle', 330, -180), M('inf', 'kill')].join('\n'), pairs, 'rH');
  assert.strictEqual(pr.inf.proof, 'none');
});
t('seeded: rifle squad kill, one lethal HEALTH line -> hp', () => {
  const pr = e.proofOf([M('inf', 'order'), H(8, 'mp/rus/rifle', 330, -180), M('inf', 'kill')].join('\n'), pairs, 'rH');
  assert.strictEqual(pr.inf.proof, 'hp'); assert.strictEqual(pr.inf.hpLethal, true);
});
t('seeded: a HEALTH breed that is not the def at that id (shifted ids) leaves HEALTH unread', () => {
  const pr = e.proofOf([M('mg', 'order'), H(4, 'mp/ger/tankman', 135, 15), M('mg', 'kill')].join('\n'), pairs, 'rH');
  assert.strictEqual(pr.mg.hpIdsOk, false); assert.strictEqual(pr.mg.proof, 'none');
});
t('seeded: other runs\' marks are ignored; muzzle and damage still rank above hp', () => {
  assert.strictEqual(e.proofOf([`EDRUN rX mg order`, H(4, 'mp/rus/rifle', 135, 15), `EDRUN rX mg kill`].join('\n'), pairs, 'rH').mg.proof, null);
  const veh = [{ name: 'a', class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman'], foe: 'gaz67b', foeCrew: ['mp/ger/rifle'] }];   // s 1, c 2, f 3, fc 4
  const pr = e.proofOf([`EDRUN rH a order`, 'BLAST[0.2/1-1.5]: t34_0[1]/{gun} (0.2) 35->35', H(4, 'mp/ger/rifle', 50, 100), `EDRUN rH a kill`].join('\n'), veh, 'rH');
  assert.strictEqual(pr.a.proof, 'muzzle'); assert.strictEqual(pr.a.hpBefore, 1, 'foe crew HEALTH counts');
});
t('VOLHP: infantry pair gets an early re-issue at EARLY_ORDER s, later re-issues keep their times; vehicles, once, early:0 do not', () => {
  const m = e.buildMission([pairs[1]], 'rX', {}), ln = m.split('\n').find(l => l.includes('{"p_inf" '));
  assert.strictEqual(e.EARLY_ORDER, 5); assert.strictEqual(e.earlyOf(pairs[1]), 5);
  // FIX-EDRUN: a second early re-issue at EARLY_ORDER2 (15 s, mark "reorder 0b"), so the first 120 delay reads 105
  assert.strictEqual((ln.match(/"actor_fire"/g) || []).length, 8, 'order + early + early2 + 5 re-issues');
  const delays = [...ln.matchAll(/"delay" \{time (\d+)\}/g)].map(x => +x[1]);
  assert.deepStrictEqual(delays, [5, 10, 105, 120, 120, 120, 120]);
  assert.ok(/EDRUN rX inf reorder 0b/.test(ln));
  assert.ok(/EDRUN rX inf reorder 0/.test(ln));
  assert.strictEqual(e.earlyOf(pairs[0]), 0); assert.strictEqual(e.earlyOf({ ...pairs[1], once: true }), 0); assert.strictEqual(e.earlyOf({ ...pairs[1], early: 0 }), 0);
  assert.strictEqual(e.earlyOf({ ...pairs[0], early: 8 }), 8); assert.strictEqual(e.orderLifeOf(pairs[1]), 720);
  assert.ok(e.validate([{ ...pairs[1], early: 200 }]).some(x => /early/.test(x)));
});
t('EDCTL: a control pair (the ctl rifle pair of the tank games) gets no early re-issue; early:N on it still does', () => {
  const ctl = { name: 'ctl', class: 'infantry', shooter: 'mp/rus/rifle', foe: 'mp/ger/rifle', control: true };
  assert.strictEqual(e.earlyOf(ctl), 0); assert.strictEqual(e.earlyOf({ ...ctl, early: 5 }), 5);
  const veh = { name: 'r1', class: 'vehicle', shooter: 'pz6bh', crew: ['mp/ger/tankman'], foe: 'is3', foeCrew: ['mp/rus/tankman'], dist: 400 };
  const m = e.buildMission([ctl, veh], 'rC', {}), ln = m.split('\n').find(l => l.includes('{"p_ctl" '));
  assert.ok(!/ctl reorder 0/.test(m), 'no early mark on the control');
  assert.deepStrictEqual([...ln.matchAll(/"delay" \{time (\d+)\}/g)].map(x => +x[1]), [120, 120, 120, 120, 120], 'control keeps the old 120 s chain');
  // seeded defect: the pre-fix rule (every infantry pair) would give the control a 5 s re-issue
  const old = p => p.class === 'infantry' ? e.EARLY_ORDER : 0;
  assert.notStrictEqual(old(ctl), e.earlyOf(ctl));
  assert.strictEqual(e.earlyOf({ ...ctl, control: false }), 5, 'a non-control infantry pair keeps it');
});
if (fail.length) { console.log('FAIL mgproof -- ' + fail.join('\n ')); process.exit(1); }
console.log(`PASS mgproof ${n}`);
