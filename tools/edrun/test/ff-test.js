// EDRUN-FF: free fire, --kill-cap, reaping the own instance after a taskkill or crash. No game
// Author: Imperator_Aug (ARSENAL, ia-6f801ef6)
const assert = require('assert'), cp = require('child_process'), path = require('path');
const e = require('../edrun.js');
const row = (m, name) => { const r = new RegExp(`\\{"${name}" .*`).exec(m); assert.ok(r, 'no row ' + name); return r[0]; };
const crew = ['mp/rus/tankman'];
const tank = { name: 'a', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0', foeCrew: crew };
const mis = ps => e.triggers(ps, 'r1', 'very_fast');

// free fire: no actor_fire, the order row still opens shooter and crew, the foe stays held; vehicle default dist 1000, own dist wins, infantry keeps its dist
{
  const ff = e.freeFireOf(tank);
  assert.strictEqual(ff.noorder, true); assert.strictEqual(ff.freeFire, true);
  assert.strictEqual(ff.dist, e.FREE_DIST.vehicle); assert.strictEqual(e.distOf(ff), 1000);
  assert.strictEqual(e.freeFireOf({ ...tank, dist: 600 }).dist, 600, 'own dist wins');
  assert.strictEqual(e.freeFireOf({ name: 'i', class: 'infantry', shooter: 'mp/ger/rifle', foe: 'mp/rus/rifle' }).dist, undefined, 'infantry keeps its dist');
  const mv = { name: 'm', class: 'vehicle', shooter: 'pz6bh', crew, move: 200 };
  assert.strictEqual(e.freeFireOf(mv), mv, 'a move pair is left as is');
  const m = mis([ff]), arm = row(m, 'p_a_arm'), ord = row(m, 'p_a');
  assert.ok(!m.includes('actor_fire'), 'no fire order under free fire');
  assert.ok(arm.includes('{tag a_s}} {fire_mode hold}'), 'shooter held at arm');
  assert.ok(ord.includes('{tag a_s}} {fire_mode open}'), 'order row opens the shooter');
  assert.ok(ord.includes('{tag a_c}} {fire_mode open}'), 'order row opens the crew');
  assert.ok(ord.includes('{tag a_f}} {fire_mode hold}'), 'foe stays held');
  assert.ok(row(m, 'p_a_k').includes('p_a'), 'kill row still waits for the order row');
  assert.ok(mis([tank]).includes('actor_fire'), 'default still orders');
  assert.strictEqual(e.validate([ff], false, 8).length, 0, 'free-fire pair validates');
}
// --kill-cap: absent = KILL_CAP (default output unchanged), N, cls=N, none, bad
{
  assert.deepStrictEqual(e.killCapOf(undefined), e.KILL_CAP);
  assert.deepStrictEqual(e.killCapOf('150'), { vehicle: 150, gun: 150, infantry: 150 });
  assert.deepStrictEqual(e.killCapOf('vehicle=200'), { ...e.KILL_CAP, vehicle: 200 });
  assert.deepStrictEqual(e.killCapOf('vehicle=200,infantry=5'), { vehicle: 200, gun: e.KILL_CAP.gun, infantry: 5 });
  assert.strictEqual(e.killCapOf('none').vehicle, Infinity);
  assert.strictEqual(typeof e.killCapOf('x'), 'string'); assert.strictEqual(typeof e.killCapOf('tank=3'), 'string'); assert.strictEqual(typeof e.killCapOf(true), 'string');
  const pass = { verdict: 'PASS', order: 1, kill: 1 };
  assert.strictEqual(e.countedOf(pass, { gameS: 120, cls: 'vehicle' }).countReason, 'overcap', 'default cap 90');
  assert.strictEqual(e.countedOf(pass, { gameS: 120, cls: 'vehicle', caps: e.killCapOf('200') }).countReason, 'ok', 'raised cap counts');
  assert.strictEqual(e.countedOf(pass, { gameS: 9999, cls: 'vehicle', caps: e.killCapOf('none') }).countReason, 'ok', 'no cap');
  assert.strictEqual(e.countedOf(pass, { gameS: 30, cls: 'infantry', caps: e.killCapOf('infantry=25') }).countReason, 'overcap');
}
// reap: only the exe with "-instance N" (exactly N), kill until gone, report what stayed
{
  assert.ok(e.ownLine('"game\\as64.exe" -instance 1 -mods a', 1));
  assert.ok(e.ownLine('as64.exe -instance 1', 1));
  assert.ok(!e.ownLine('as64.exe -instance 12', 1), 'instance 12 is not 1');
  assert.ok(!e.ownLine('as64.exe -instance 2', 1));
  assert.ok(!e.ownLine('as64.exe', 1), 'no -instance = instance 0, never ours');
  assert.ok(!e.ownLine(null, 1));
  let procs = [{ ProcessId: 10, CommandLine: 'as64.exe -instance 1' }, { ProcessId: 11, CommandLine: 'as64.exe -instance 2' }, { ProcessId: 12, CommandLine: 'as64.exe' }, { ProcessId: 13, CommandLine: 'as64.exe -instance 12' }];
  const hit = [];
  const r = e.reapOwn('as64.exe', 1, { list: () => procs, kill: pid => { hit.push(pid); procs = procs.filter(p => p.ProcessId !== pid); }, wait: () => {} });
  assert.deepStrictEqual(hit, [10], 'only instance 1 killed');
  assert.deepStrictEqual(r, { killed: [10], left: [] });
  assert.strictEqual(procs.length, 3, 'instances 0, 2, 12 untouched');
  // a process that will not die: tried, reported left
  const stuck = [{ ProcessId: 20, CommandLine: 'as64.exe -instance 1' }];
  const r2 = e.reapOwn('as64.exe', 1, { list: () => stuck, kill: () => {}, wait: () => {} });
  assert.deepStrictEqual(r2, { killed: [20], left: [20] });
  assert.deepStrictEqual(e.reapOwn('as64.exe', 1, { list: () => [], kill: () => { throw new Error('no kill'); }, wait: () => {} }), { killed: [], left: [] });
}
// CLI: --free-fire and --kill-cap pass a dry run, a bad --kill-cap exits 2
{
  const run = args => cp.spawnSync(process.execPath, [path.join(__dirname, '../edrun.js'), '--pairs', path.join(__dirname, 'pairs.json'), '--dry', '--no-check', '--out', path.join(require('os').tmpdir(), 'edrun-ff-test'), ...args], { encoding: 'utf8' }).status;
  assert.strictEqual(run(['--free-fire', '--kill-cap', 'vehicle=300']), 0, 'free-fire dry run');
  assert.strictEqual(run(['--kill-cap', 'bad']), 2, 'bad --kill-cap');
}
// VOL-FX: --free-fire leaves control pairs under order; a control with its own freeFire:true still free-fires; rows carry killGameS, shots a number, held rows marked
{
  const ctl = { ...tank, name: 'ctl', control: true, dist: 400 }, ctlFF = { ...ctl, name: 'ctlff', freeFire: true }, other = { ...tank, name: 'b' };
  const [o, c, cf] = e.freeFireAll([other, ctl, ctlFF], true);
  assert.strictEqual(o.freeFire, true, 'fire pair freed by --free-fire');
  assert.strictEqual(c, ctl, 'control left under order'); assert.ok(!c.noorder && !c.freeFire);
  assert.strictEqual(cf.freeFire, true, 'per-pair freeFire control still free-fires'); assert.strictEqual(cf.dist, 400, 'its own dist kept');
  const m = mis([o, c, cf]);
  assert.ok(row(m, 'p_ctl').includes('actor_fire'), 'control row orders fire');
  assert.ok(!row(m, 'p_ctlff').includes('actor_fire') && row(m, 'p_ctlff').includes('{tag ctlff_s}} {fire_mode open}'), 'free-fire control opens fire, no order');
  assert.ok(!row(m, 'p_b').includes('actor_fire'), 'fire pair not ordered');
  const [o2, c2, cf2] = e.freeFireAll([other, ctl, ctlFF], false);
  assert.strictEqual(o2, other, 'no --free-fire: pair as is'); assert.strictEqual(c2, ctl); assert.strictEqual(cf2.freeFire, true, 'per-pair key without the flag');
  assert.strictEqual(e.killGameSOf({ order: 2, kill: 12 }, 25, 3), 25, 'tick game s win');
  assert.strictEqual(e.killGameSOf({ order: 2, kill: 12 }, null, 3), 30, 'else wall x ratio');
  assert.strictEqual(e.killGameSOf({ order: 2, kill: null }, null, 3), null, 'no kill');
  assert.strictEqual(e.killGameSOf({ order: 2, kill: 12 }, null, null), null, 'no ratio');
  const ch = { times: { start: 0, 'a order': 2, 'a kill': 12 }, ticks: { 'a order': 5, 'a kill': 35 }, speed: { ratio: 3 }, logText: '', pipeLines: [] };
  const [r] = e.rowsOf([tank], ch, null, {});
  assert.strictEqual(r.killGameS, 30, 'row killGameS from ticks'); assert.strictEqual(r.shots, 0, 'shots 0 not null'); assert.strictEqual(r.shotsRead, false, 'no cvar: not read');
  const [n] = e.rowsOf([tank], { ...ch, times: { start: 0, 'a order': 2 }, ticks: {} }, null, {});
  assert.strictEqual(n.killGameS, null); assert.strictEqual(n.shots, 0);
}
console.log('ff-test PASS');
