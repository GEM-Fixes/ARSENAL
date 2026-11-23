// VOL-5F: shooter hold, foe-crew mark, game-second ticks, settle, rerun keep. No game
// Author: Imperator_Aug (ARSENAL, ia-92ad69e7)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const e = require('../edrun.js');
const row = (m, name) => { const r = new RegExp(`\\{"${name}" .*`).exec(m); assert.ok(r, 'no row ' + name); return r[0]; };
const crew = ['mp/rus/tankman'];
const tank = { name: 'a', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0', foeCrew: crew, dist: 400 };
const man = { name: 'b', class: 'gun', shooter: 'browning_stan', crew, foe: 'mp/ger/rifle', foeClass: 'infantry', dist: 600 };
const mis = ps => e.triggers(ps, 'r1', 'very_fast');

// the shooter and its crew hold from the start, the order row opens both, the foe stays held
{
  const m = mis([tank]), arm = row(m, 'p_a_arm'), ord = row(m, 'p_a');
  assert.ok(arm.includes('{tag a_s}} {fire_mode hold}'), 'shooter held at arm');
  assert.ok(arm.includes('{tag a_c}} {fire_mode hold}'), 'crew held at arm');
  assert.ok(arm.includes('{tag a_f}} {fire_mode hold}'), 'foe held at arm');
  assert.ok(ord.includes('{tag a_s}} {fire_mode open}'), 'order opens the shooter');
  assert.ok(ord.includes('{tag a_c}} {fire_mode open}'), 'order opens the crew');
  assert.ok(ord.includes('{tag a_f}} {fire_mode hold}'), 'the foe stays held at the order');
  assert.ok(!ord.includes('{tag a_f}} {fire_mode open}'), 'the foe is not released');
  assert.ok(ord.indexOf('fire_mode open') < ord.indexOf('actor_fire'), 'open before the fire order');
  assert.ok(row(m, 'p_a_fx').includes('foecrewgone'), 'foe crew mark on a crewed foe');
}
// nobody to hold at: a move pair, a foeless pair; an infantry foe has no crew mark
{
  const mv = mis([{ name: 'm', class: 'vehicle', shooter: 'pz6bh', crew, move: 200 }]);
  assert.ok(!row(mv, 'p_m_arm').includes('{tag m_s}} {fire_mode hold}'), 'a move pair is not held');
  assert.ok(!mis([man]).includes('p_b_fx'), 'no foe crew row on an infantry foe');
}
// settle waits before the order mark, not after it
{
  const ord = row(mis([{ ...man, settle: 20 }]), 'p_b');
  assert.ok(ord.indexOf('{"delay" {time 20}}') >= 0 && ord.indexOf('{"delay" {time 20}}') < ord.indexOf('b order'), 'settle comes before the order mark');
  { const o = row(mis([man]), 'p_b'), d = o.indexOf('"delay"'); assert.ok(d < 0 || d > o.indexOf('b order'), 'no settle, no wait before the order (KILLPROOF re-issue delays come after it)'); }
}
// ticks: game seconds by log order; tick marks are not marks
{
  const log = ['EDRUN r1 start', 'EDRUN r1 tick 0', 'EDRUN r1 a order', 'other line', 'EDRUN r1 tick 1', 'EDRUN r1 tick 2', 'EDRUN r1 a kill', 'EDRUN r1 a kill', 'EDRUN r9 tick 7'].join('\n');
  assert.deepStrictEqual(e.tickOf(log, 'r1'), { start: null, 'a order': 0, 'a kill': 2 });
  assert.deepStrictEqual(e.parseMarks(log, 'r1'), ['start', 'a order', 'a kill', 'a kill']);
  assert.ok(row(mis([tank]), 'ed_tick').includes('tick 1'), 'tick row in the mission');
}
// the count rule by game seconds; without them the poll rule stands
{
  const pass = { verdict: 'PASS', order: 1, kill: 1 };
  assert.strictEqual(e.countedOf(pass, {}).countReason, 'on-tick');
  assert.strictEqual(e.countedOf(pass, { gameS: 25, hits: 0 }).countReason, 'ok');
  assert.strictEqual(e.countedOf(pass, { gameS: 0 }).countReason, 'on-tick');
  assert.strictEqual(e.countedOf(pass, { gameS: 1, hits: 0 }).countReason, 'instant');
  assert.strictEqual(e.countedOf(pass, { gameS: 1, hits: null }).countReason, 'ok');
  assert.strictEqual(e.countedOf(pass, { gameS: 91, cls: 'vehicle' }).countReason, 'overcap');
}
// the mission's truck gate: a NOORDER names a foe crew that died
{
  const rows = e.rowsOf([tank], { times: { start: 10, 'a shooterready': 11, 'a foecrewgone': 12 }, ticks: {}, logText: '' }, null);
  assert.strictEqual(rows[0].verdict, 'NOORDER');
  assert.strictEqual(rows[0].noOrder.foeCrewGone, 2);
  assert.ok(/foe crew all dead at 2/.test(rows[0].note));
}
// fireProof
{
  const t = { start: 0, 'b order': 1, 'b kill': 2 };
  const rowOf = ticks => e.rowsOf([man], { times: t, ticks, logText: '' }, null)[0];
  assert.strictEqual(rowOf({ 'b order': 5, 'b kill': 6 }).fireProof, 'held');
  assert.strictEqual(rowOf({ 'b order': 5, 'b kill': 5 }).fireProof, null);
}
// a rerun keeps the earlier run; report.json is the newest
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'edrun-hold-'));
  assert.deepStrictEqual(e.keepEarlierRun(d), [], 'an empty folder has nothing to keep');
  const put = id => { fs.writeFileSync(path.join(d, 'report.json'), JSON.stringify({ runId: id })); fs.writeFileSync(path.join(d, 'game0.log'), id); };
  put('run1');
  assert.deepStrictEqual(e.keepEarlierRun(d).sort(), ['game0.run1.log', 'report.run1.json']);
  assert.ok(!fs.existsSync(path.join(d, 'report.json')));
  put('run1');   // the same id again: nothing is overwritten
  assert.deepStrictEqual(e.keepEarlierRun(d).sort(), ['game0.run1-2.log', 'report.run1-2.json']);
  assert.strictEqual(fs.readdirSync(d).length, 4);
  fs.rmSync(d, { recursive: true });
}
console.log('hold ok');
