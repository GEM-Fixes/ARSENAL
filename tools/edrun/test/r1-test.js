// MB-R1 seeded tests, no game: NOSPAWN verdict (harness-edrun:38, a def the game can't spawn is void, not a fail or kill) and rescore void-game counts (owed:49). node r1-test.js
// Author: Imperator_Aug (ARSENAL, ia-7480c537)
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const e = require('../edrun.js');
const rs = require('../rescore.js');
let n = 0; const fail = [];
const t = (name, f) => { try { f(); n++; } catch (x) { fail.push(name + ': ' + x.message); } };
const crew = ['mp/ger/tankman'];
const tank = (name, foe, o = {}) => ({ name, class: 'vehicle', shooter: 'pz4h', crew, foe, foeCrew: crew, ...o });
// the line as1 MB-R1 g1 game0.log wrote for a foe def with no key [V ../run/MB-R1/g1/game0.log]
const SPAWN = "[00:00:44] can't spawn entity zz_mbr1_nokey (/map/multi/edrun_test/combat.mi, 325)\n";
const ch = (times, logText) => ({ times: { start: 0, ...times }, ticks: {}, logText, pipeLines: ['dbg_blast = 1'] });

t('NOSPAWN: unspawned foe is void, not NOORDER', () => {
  const ps = [tank('ok', 't34_0'), tank('bad', 'zz_mbr1_nokey')];
  const [a, b] = e.rowsOf(ps, ch({ 'ok order': 2, 'ok kill': 5 }, SPAWN), null, {});
  assert.strictEqual(a.verdict, 'PASS', 'spawned pair untouched');
  assert.strictEqual(b.verdict, 'NOSPAWN'); assert.strictEqual(b.counted, false);
  assert.ok(/zz_mbr1_nokey/.test(b.countReason) && /void/.test(b.note));
  const cs = e.cellSummary([a, b]), cb = cs.find(c => c.name === 'bad');
  assert.deepStrictEqual([cb.runs, cb.void], [0, 1], 'not a run');
  // seeded defect: without the log line the same pair stays a NOORDER run (the old reading, cell 0/1)
  const [, old] = e.rowsOf(ps, ch({ 'ok order': 2, 'ok kill': 5 }, ''), null, {});
  assert.strictEqual(old.verdict, 'NOORDER');
  assert.strictEqual(e.cellSummary([old])[0].runs, 1);
});
t('NOSPAWN: a kill mark on an unspawned foe never counts', () => {
  const [b] = e.rowsOf([tank('bad', 'zz_mbr1_nokey')], ch({ 'bad order': 2, 'bad kill': 2.1 }, SPAWN), null, {});
  assert.strictEqual(b.verdict, 'NOSPAWN'); assert.strictEqual(b.counted, false);
});
t('NOSPAWN: unspawned shooter, and infantry breeds are not matched', () => {
  const [s] = e.rowsOf([tank('s', 't34_0', { shooter: 'zz_mbr1_nokey' })], ch({ 's order': 2 }, SPAWN), null, {});
  assert.strictEqual(s.verdict, 'NOSPAWN');
  const inf = { name: 'i', class: 'infantry', shooter: 'mp/rus/rifle', foe: 'mp/ger/rifle' };
  const [r] = e.rowsOf([inf], ch({ 'i order': 0, 'i kill': 3 }, "can't spawn entity rifle (x)\n"), null, {});
  assert.notStrictEqual(r.verdict, 'NOSPAWN');
});
t('NOSPAWN control voids the game', () => {
  const [c] = e.rowsOf([tank('c', 'zz_mbr1_nokey', { control: true })], ch({ 'c order': 2, 'c kill': 6 }, SPAWN), null, {});
  assert.strictEqual(e.controlsOf([c]).void, true);
});
t('rescore: void games before and after proof', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1rs-'));
  const pairs = [tank('c', 't34_0', { control: true }), tank('x', 't34_0')];
  fs.writeFileSync(path.join(d, 'pairs.json'), JSON.stringify(pairs));
  // control PASS counted before, its log (none) gives no proof: row proof none -> unproven -> game void after
  const rows = [{ name: 'c', class: 'vehicle', foe: 't34_0', control: true, verdict: 'PASS', counted: true, kill: 6, shots: 0, hitKinds: {} },
    { name: 'x', class: 'vehicle', foe: 't34_0', verdict: 'PASS', counted: true, kill: 5, shots: 3 }];
  fs.writeFileSync(path.join(d, 'report.json'), JSON.stringify({ pairs: rows, games: [{}] }));
  const out = rs.rescoreDir(d, path.join(d, 'pairs.json'), {});
  assert.deepStrictEqual(out.rescore.totals.voidGames, { games: 1, old: 0, new: 1 });
  fs.rmSync(d, { recursive: true, force: true });
});
if (fail.length) { console.log(fail.join('\n')); process.exit(1); }
console.log(`r1-test: ${n} pass`);
