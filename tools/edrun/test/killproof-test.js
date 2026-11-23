// KILLPROOF seeded test, no game: kill proof by log order, order re-issue + expiry flag, Wilson interval, rescore on a temp dir. node killproof-test.js
// Author: Imperator_Aug (ARSENAL, ia-81bbc6a0)
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const e = require('../edrun.js'), rs = require('../rescore.js');
let n = 0; const fail = [];
const t = (name, f) => { try { f(); n++; } catch (x) { fail.push(name + ': ' + x.message); } };
const veh = (name, shooter, foe, x = {}) => ({ name, class: 'vehicle', shooter, crew: ['mp/rus/tankman', 'mp/rus/tankman2'], foe, foeCrew: ['mp/ger/rifle'], ...x });
const two = [veh('a', 't34_0', 'gaz67b'), veh('b', 't34_0', 'gaz67b')];   // shooter a 1, foe a 4, foe crew a 5; shooter b 6, foe b 9
const M = (p, k, run = 'rK') => `EDRUN ${run} ${p} ${k}`;
const MUZ_A = 'BLAST[0.2/1-1.5]: t34_0[1]/{gun} (0.2) 35->35', DEATH_A = 'BLAST[3/3-8]: gaz67b[4]/{engine} (3) 8->0', DEATH2_A = 'BLAST[10/2.5-10]: gaz67b[4]/{body} (3) 8->0';
const HIT_A = 'BLAST[1.2/0.5-1]: gaz67b[4]/{body} (1) 8->4', AMMO_A = 'BLAST[10/7-8]: gaz67b[4]/{body} (3) 8->0';

t('death kinds', () => {
  for (const h of ['3/3-8', '10/2.5-10', '10/7-8', '16/7-12', '1/16-24', '1/12-18']) assert.ok(e.isDeathKind(h), h);
  for (const h of ['1.2/0.5-1', '0.2/1-1.5', '3.5/4-5', '0.5/0.2-0.5', '1/3-8']) assert.ok(!e.isDeathKind(h), h);
});
t('seeded: death blast only is KILL_UNPROVEN', () => {
  const pr = e.proofOf([M('a', 'order'), DEATH_A, DEATH2_A, M('a', 'kill'), DEATH_A].join('\n'), two, 'rK');
  assert.strictEqual(pr.a.proof, 'deathblast'); assert.strictEqual(pr.a.deathBlasts, 3); assert.strictEqual(pr.b.proof, null, 'no kill mark: no proof');
  const row = e.applyProof({ verdict: 'PASS', counted: true, killGameS: 50 }, two[0], pr.a, 720);
  assert.strictEqual(row.killVerdict, 'KILL_UNPROVEN'); assert.strictEqual(row.counted, false); assert.strictEqual(row.countReason, 'unproven: deathblast');
});
t('seeded: own-ammo blast (r0 7) is no proof either', () => {
  assert.strictEqual(e.proofOf([M('a', 'order'), AMMO_A, M('a', 'kill')].join('\n'), two, 'rK').a.proof, 'deathblast');
});
t('seeded: shooter muzzle between order and kill is KILL', () => {
  const pr = e.proofOf([M('a', 'order'), MUZ_A, DEATH_A, M('a', 'kill')].join('\n'), two, 'rK');
  assert.strictEqual(pr.a.proof, 'muzzle');
  const row = e.applyProof({ verdict: 'PASS', counted: true }, two[0], pr.a, 720);
  assert.strictEqual(row.killVerdict, 'KILL'); assert.strictEqual(row.counted, true);
});
t('seeded: muzzle before the order or after the kill does not prove', () => {
  assert.strictEqual(e.proofOf([MUZ_A, M('a', 'order'), DEATH_A, M('a', 'kill'), MUZ_A].join('\n'), two, 'rK').a.proof, 'deathblast');
});
t('seeded: a non-death hit on the foe before the kill is damage; after the kill it is not', () => {
  assert.strictEqual(e.proofOf([M('a', 'order'), HIT_A, DEATH_A, M('a', 'kill')].join('\n'), two, 'rK').a.proof, 'damage');
  assert.strictEqual(e.proofOf([M('a', 'order'), DEATH_A, M('a', 'kill'), HIT_A].join('\n'), two, 'rK').a.proof, 'deathblast');
});
t('seeded: damaged mark before the kill is damage, after it is not', () => {
  assert.strictEqual(e.proofOf([M('a', 'order'), M('a', 'damaged'), M('a', 'kill')].join('\n'), two, 'rK').a.proof, 'damage');
  assert.strictEqual(e.proofOf([M('a', 'order'), M('a', 'kill'), M('a', 'damaged')].join('\n'), two, 'rK').a.proof, 'none');
});
t('seeded: another run id is ignored, other pair blasts do not leak', () => {
  const pr = e.proofOf([M('a', 'order', 'rOLD'), MUZ_A, M('a', 'kill', 'rOLD'), M('a', 'order'), M('b', 'order'), 'BLAST[0.2/1-1.5]: t34_0[6]/{gun} (0.2) 35->35', M('a', 'kill'), M('b', 'kill')].join('\n'), two, 'rK');
  assert.strictEqual(pr.a.proof, 'none'); assert.strictEqual(pr.b.proof, 'muzzle');
});
t('seeded: log names that do not fit the ids read no BLAST lines', () => {
  const pr = e.proofOf([M('a', 'order'), 'BLAST[0.2/1-1.5]: pz3[1]/{gun} (0.2) 35->35', M('a', 'kill')].join('\n'), two, 'rK');
  assert.strictEqual(pr.a.idsOk, false); assert.strictEqual(pr.a.proof, 'none');
});
t('seeded ORDERRUN: an unspawned def shifts later ids; the log line skips it', () => {
  const three = [veh('x', 'cv35_hun', 'gaz67b'), ...two], MUZ_B = 'BLAST[0.2/1-1.5]: t34_0[10]/{gun} (0.2) 35->35';   // x unspawned (its 4 humans keep ids): b's shooter logs as [10] not [11]
  const log = ["can't spawn entity cv35_hun (/map/multi/edrun_test/combat.mi, 35)", M('b', 'order'), MUZ_B, M('b', 'kill')].join('\n');
  assert.deepStrictEqual([...e.unspawnedOf(log)], ['cv35_hun']);
  assert.strictEqual(e.proofOf(log, three, 'rK').b.proof, 'muzzle');
  assert.strictEqual(e.shotsOf(log, three, true).rows.b.shots, 1);
  const noSpawnLine = log.split('\n').slice(1).join('\n');   // without the spawn line, [10] is a's foe crew: a human id with a vehicle name = bad map, not crew blasts
  assert.strictEqual(e.proofOf(noSpawnLine, three, 'rK').b.idsOk, false);
  assert.strictEqual(e.shotsOf(noSpawnLine, three, true).rows.b.shots, null);
});
t('ORDERRUN: reorder marks, once:true keeps the single order', () => {
  const m = e.triggers([veh('a', 't34_0', 'gaz67b'), veh('o', 't34_0', 'gaz67b', { once: true })], 'rK');
  assert.strictEqual((m.match(/EDRUN rK a reorder \d+/g) || []).length, 5);
  assert.ok(!/o reorder/.test(m)); assert.strictEqual(e.orderLifeOf({ ...two[0], once: true }), 120);
});
t('non-fire rows are not judged', () => {
  const row = e.applyProof({ verdict: 'PASS', counted: true }, { ...two[0], move: 200 }, { proof: 'none' }, null);
  assert.ok(!('proof' in row)); assert.strictEqual(row.counted, true);
  const nk = e.applyProof({ verdict: 'NOKILL', counted: false }, two[0], { proof: null }, 720);
  assert.ok(!('killVerdict' in nk));
});
t('order re-issue: default pair repeats every ORDER_TIME to cover the tick marks; expiry flag', () => {
  assert.strictEqual(e.ORDER_TIME, 120); assert.strictEqual(e.orderRepeatsOf(two[0]), 5); assert.strictEqual(e.orderLifeOf(two[0]), 720);
  assert.strictEqual(e.orderLifeOf({ ...two[0], orderTime: 300 }), 900); assert.strictEqual(e.orderLifeOf({ ...two[0], noorder: true }), null);
  assert.strictEqual(e.orderLifeOf({ ...two[0], reorder: 10 }), Infinity);
  const m = e.buildMission([two[0]], 'rX', {}), ln = m.split('\n').find(l => l.includes('{"p_a" '));
  assert.strictEqual((ln.match(/"actor_fire"/g) || []).length, 6);
  const late = e.applyProof({ verdict: 'PASS', counted: true, killGameS: 200 }, two[0], { proof: 'muzzle' }, 120);
  assert.strictEqual(late.orderExpired, true); assert.strictEqual(late.counted, true, 'flag only');
  assert.strictEqual(e.applyProof({ verdict: 'PASS', counted: true, killGameS: 100 }, two[0], { proof: 'muzzle' }, 120).orderExpired, false);
});
t('Wilson 95%', () => {
  assert.deepStrictEqual(e.wilson(37, 46), [0.67, 0.89]); assert.deepStrictEqual(e.wilson(0, 4), [0, 0.49]); assert.deepStrictEqual(e.wilson(4, 4), [0.51, 1]);
  assert.strictEqual(e.wilson(0, 0), null);
  const cs = e.cellSummary([{ name: 'a', foe: 'x', verdict: 'PASS', counted: true }, { name: 'a', foe: 'x', verdict: 'PASS', counted: false, killVerdict: 'KILL_UNPROVEN' },
    { name: 'a', foe: 'x', verdict: 'ERROR' }, { name: 'a', foe: 'x', held: true }, { name: 'c', foe: 'x', control: true, verdict: 'PASS', counted: true }]);
  assert.deepStrictEqual(cs, [{ name: 'a', runs: 2, kills: 1, unproven: 1, expired: 0, ci: [0.09, 0.91] }]);
  assert.ok(/cell a: kills 1\/2 wilson95 0.09-0.91 unproven 1/.test(e.summaryLines(cs)[0]));
});
t('rescore a run dir (temp copy, report.json untouched)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'killproof-')), out = path.join(dir, 'run');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(dir, 'pairs.json'), JSON.stringify(two));
  const log = ['EDRUN rK tick 0', M('a', 'order'), M('b', 'order'), 'EDRUN rK tick 1', DEATH_A, M('a', 'kill'), 'BLAST[0.2/1-1.5]: t34_0[6]/{gun} (0.2) 35->35', 'EDRUN rK tick 300', M('b', 'kill')].join('\r\n');
  fs.writeFileSync(path.join(out, 'game0.log'), log);
  const rep = { runId: 'rK', games: [{ log: 'game0.log' }], pairs: [{ name: 'a', foe: 'gaz67b', verdict: 'PASS', counted: true }, { name: 'b', foe: 'gaz67b', verdict: 'PASS', counted: true }] };
  const before = JSON.stringify(rep);
  fs.writeFileSync(path.join(out, 'report.json'), before);
  const r = rs.rescoreDir(out, path.join(dir, 'pairs.json'), { write: true });
  assert.strictEqual(fs.readFileSync(path.join(out, 'report.json'), 'utf8'), before, 'report.json not changed');
  assert.ok(fs.existsSync(path.join(out, 'report.rescore.json')));
  const a = r.pairs.find(x => x.name === 'a'), b = r.pairs.find(x => x.name === 'b');
  assert.strictEqual(a.proof, 'deathblast'); assert.strictEqual(a.counted, false); assert.strictEqual(a.oldCounted, true);
  assert.strictEqual(b.proof, 'muzzle'); assert.strictEqual(b.counted, true); assert.strictEqual(b.orderExpired, true, 'old runs: one 120 s order, kill at tick 300');
  assert.deepStrictEqual([r.rescore.totals.oldKills, r.rescore.totals.newKills], [2, 1]);
  const cli = require('child_process').spawnSync(process.execPath, [path.join(__dirname, '../edrun.js'), '--inst', '2', '--rescore', out, '--pairs', path.join(dir, 'pairs.json')], { encoding: 'utf8' });
  assert.strictEqual(cli.status, 0, cli.stderr); assert.ok(/counted kills 2 -> 1/.test(cli.stdout), cli.stdout);
  fs.rmSync(dir, { recursive: true, force: true });
});
t('preflight units (rev-harness 13): line clear is map units, overshoot past the foe warns', () => {
  const pf = require('../preflight');
  assert.strictEqual(pf.UNITS_PER_M, 20); assert.strictEqual(pf.LINE_CLEAR_U, 40); assert.strictEqual(pf.ISOLATE_CLEAR_U, 300); assert.strictEqual(pf.LINE_CLEAR, pf.LINE_CLEAR_U);
  const lay = p => p._L, A = { name: 'a', class: 'vehicle', shooter: 's', foe: 'f', _L: { s: { x: 0, y: 0 }, f: { x: 0, y: 600 } } };
  const B = off => ({ name: 'b', class: 'vehicle', shooter: 's', _L: { s: { x: off, y: 300 }, f: { x: off, y: 300 } } });
  // seeded: a unit 30 units (1.5 m, a hull half-width) off the line: passed at the old 12, blocks now
  assert.strictEqual(pf.check([A, B(30)], lay).a.status, 'BLOCKED');
  assert.strictEqual(pf.check([A, B(60)], lay).a.status, 'OK');
  const C = { name: 'c', class: 'vehicle', shooter: 's', _L: { s: { x: 10, y: 1500 }, f: { x: 10, y: 1500 } } };
  const r = pf.check([A, C], lay).a;
  assert.strictEqual(r.status, 'OK', 'behind the foe is a warning, not a hold'); assert.ok(r.warns.some(w => /overshoot: .*c\/s/.test(w)), r.warns.join(' | '));
  assert.ok(!pf.check([A, { ...C, _L: { s: { x: 10, y: -500 }, f: { x: 10, y: -500 } } }], lay).a.warns.some(w => /overshoot/.test(w)), 'behind the shooter is not overshoot');
  const I = { ...A, isolate: true }, near = { name: 'n', class: 'vehicle', shooter: 's', _L: { s: { x: 250, y: 0 }, f: { x: 250, y: 0 } } };
  assert.ok(/within 300 units/.test(pf.check([I, near], lay).a.notes.join()), 'isolate note names units');
});
if (fail.length) { console.log(fail.join('\n')); process.exit(1); }
console.log(`killproof-test: ${n} PASS`);
