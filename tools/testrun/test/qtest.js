// per-instance user dir + seeding + --workers queue (mock; fake home via --home). TST-22 NET-20
// Author: Imperator_Aug (ARSENAL, ia-487678fd)
const fs = require('fs'), path = require('path'), assert = require('assert');
const { spawnSync } = require('child_process');
const T = path.join(__dirname, '..', 'testrun.js');
const F = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'qt');
fs.rmSync(F, { recursive: true, force: true });
const home = path.join(F, 'home'), G = path.join(F, 'game'), bk = path.join(F, 'bk');
const BASE = path.join(home, 'Documents', 'my games', 'men of war - assault squad 2');
const prof0 = path.join(BASE, 'profiles', 'p1', 'options.set');
fs.mkdirSync(path.dirname(prof0), { recursive: true });
fs.writeFileSync(prof0, '{options\r\n\t{mods "base:0"}\r\n}\r\n');
fs.mkdirSync(path.join(G, 'mods', 'e2e_test'), { recursive: true });
fs.writeFileSync(path.join(G, 'mods', 'e2e_test', 'orig.cfg'), 'orig');
const inst = n => path.join(BASE + ' - instance ' + n, 'profiles', 'p1', 'options.set');
const t = (args, opt) => spawnSync(process.execPath, [T, ...args], Object.assign({ encoding: 'utf8' }, opt));
const logArgs = ['--logdir', path.join(process.env.TEST_WORK || __dirname, 'fixture', 'log'), '--archive', path.join(F, 'arch'), '--connect-timeout', '5', '--exit-wait', '2', '--home', home];

// default log dir follows the instance; mock ids (>9) keep instance 0
let r = t(['--map', 'm', '--dry', '--inst', '2', '--home', home]);
assert.ok(r.stdout.includes('instance 2' + path.sep + 'log') || r.stdout.includes('instance 2/log'), r.stdout);
r = t(['--map', 'm', '--dry', '--inst', '4701', '--home', home]);
assert.ok(r.stdout.includes('assault squad 2' + path.sep + 'log') || r.stdout.includes('assault squad 2/log'), r.stdout);
// bad workers
assert.ok(/TESTRUN_BAD_ARGS --workers must be 1..9/.test(t(['--queue-dir', 'scen5', '--workers', '10']).stdout));
assert.ok(/TESTRUN_BAD_ARGS --workers needs --queue/.test(t(['--map', 'm', '--workers', '2']).stdout));

// seeding: single scenario run on instance 7 seeds that instance only; --no-seed and mock ids do not
const p0 = fs.readFileSync(prof0);
r = t(['--scenario', path.join(__dirname, 'scen5', 's4.json'), '--mock', '--inst', '7', ...logArgs]);
assert.strictEqual(r.status, 0, r.stdout + r.stderr);
assert.ok(/^seeded instance 7 profile .*mods modA:0$/m.test(r.stdout), r.stdout);
assert.ok(/\{mods "modA:0"\}/.test(fs.readFileSync(inst(7), 'latin1')));
t(['--scenario', path.join(__dirname, 'scen5', 's4.json'), '--mock', '--inst', '4', '--no-seed', ...logArgs]);
t(['--scenario', path.join(__dirname, 'scen5', 's4.json'), '--mock', '--inst', '4702', ...logArgs]);
assert.ok(!fs.existsSync(inst(4)) && !fs.existsSync(inst(4702)), 'no seed with --no-seed / mock id');
assert.ok(fs.readFileSync(prof0).equals(p0), 'instance 0 profile touched');

// queue: 2 workers, 4 scenarios (3 stage), 2 approved folders
const out = path.join(F, 'q5.json');
r = t(['--queue-dir', path.join(__dirname, 'scen5'), '--workers', '2', '--mock', '--inst', '7', '--game', G, '--no-preflight', '--backup', bk, '--out', out, ...logArgs]);
assert.strictEqual(r.status, 0, r.stdout + r.stderr);
const j = JSON.parse(fs.readFileSync(out, 'utf8'));
assert.strictEqual(j.total, 4); assert.strictEqual(j.failed, 0, r.stdout); assert.strictEqual(j.workers, 2);
assert.deepStrictEqual(j.queue.map(x => x.name), ['s1', 's2', 's3', 's4'], 'merged report keeps queue order');
const byName = Object.fromEntries(j.queue.map(x => [x.name, x]));
assert.strictEqual(byName.s3.folders.length, 2); assert.strictEqual(byName.s4.folders.length, 0);
for (const x of j.queue) { assert.ok([7, 8].includes(x.inst), 'inst ' + x.inst); assert.ok(x.log && x.archive, 'log/archive recorded'); }
let overlaps = 0;
for (const a of j.queue) for (const b of j.queue) if (a.name < b.name && a.start < b.end && b.start < a.end) {
  overlaps++;
  assert.notStrictEqual(a.inst, b.inst, a.name + '/' + b.name + ' concurrent on one instance');
  assert.deepStrictEqual(a.folders.filter(f => b.folders.includes(f)), [], a.name + '/' + b.name + ' share a stage folder while concurrent');
}
assert.ok(overlaps >= 1, 'no two groups ran concurrently');
assert.ok(fs.existsSync(inst(7)) && fs.existsSync(inst(8)), 'worker instance profiles seeded');
assert.ok(fs.readFileSync(prof0).equals(p0), 'instance 0 profile touched by the queue');
// restored: folder content, the created folder gone
assert.strictEqual(fs.readFileSync(path.join(G, 'mods', 'e2e_test', 'orig.cfg'), 'utf8'), 'orig');
assert.deepStrictEqual(fs.readdirSync(path.join(G, 'mods', 'e2e_test')), ['orig.cfg']);
assert.ok(!fs.existsSync(path.join(G, 'mods', 'e2e_test2')), 'e2e_test2 not removed');
assert.strictEqual(j.restored, true);
// a group that needs more folders than the pool: FAIL row, rest still runs
fs.writeFileSync(path.join(F, 'big.json'), JSON.stringify({ name: 'big', mode: 'menu', fixture: ['vfs-21a', 'vfs-21b', 'vfs-21a', 'vfs-21b', 'vfs-21a', 'vfs-21b', 'vfs-21a', 'vfs-21b', 'vfs-21a'], steps: [], verdict: [{ event: 'hello' }] }));
r = t(['--queue', path.join(F, 'big.json') + ',' + path.join(__dirname, 'scen5', 's4.json'), '--workers', '2', '--mock', '--inst', '7', '--game', G, '--no-preflight', '--no-seed', ...logArgs]);
assert.ok(/^FAIL big: needs 9 stage folder\(s\), pool has 8/m.test(r.stdout) && /^PASS s4 /m.test(r.stdout), r.stdout);

// LINT_NEGATIVE_ONLY: a step expect is a positive check
fs.writeFileSync(path.join(F, 'ex.json'), JSON.stringify({ name: 'ex', steps: [{ cmd: 'echo a', expect: 'a' }], verdict: [{ log: 'Exception', want: false }] }));
fs.writeFileSync(path.join(F, 'neg.json'), JSON.stringify({ name: 'neg', steps: [{ cmd: 'echo a' }], verdict: [{ log: 'Exception', want: false }] }));
assert.ok(/^0 findings/m.test(t(['--lint', path.join(F, 'ex.json')]).stdout));
assert.ok(/LINT_NEGATIVE_ONLY/.test(t(['--lint', path.join(F, 'neg.json')]).stdout));
console.log('qtest ok');

// ENG-26: seeded list follows the staged mod.info (as64+ first for modern), no-mod run resets to as64+, clash = no launch; same crash twice stops the queue
{
  const M = path.join(F, 'mode'), g2 = path.join(M, 'game'), sd = path.join(M, 'sc'), ld = path.join(M, 'log');
  fs.mkdirSync(sd, { recursive: true }); fs.mkdirSync(ld, { recursive: true });
  const info = (n, v) => { const d = path.join(g2, 'mods', n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), `{Mod "${n}"}\r\n{MinGameVersion "${v}"}\r\n`); };
  info('newm', '3.301'); info('oldm', '3.262');
  const sc = (n, mods) => { const f = path.join(sd, n + '.json'); fs.writeFileSync(f, JSON.stringify({ name: n, rows: ['ENG-26'], mods, mode: 'menu', steps: [{ cmd: 'mp_state' }], verdict: [] })); return f; };
  const base = ['--mock', '--game', g2, '--no-preflight', '--logdir', ld, '--archive', path.join(M, 'arch'), '--connect-timeout', '5', '--exit-wait', '2', '--home', home];
  const seededOf = n => /\{mods[^}]*\}/.exec(fs.readFileSync(inst(n), 'latin1'))[0];
  r = t(['--scenario', sc('m', ['newm']), '--inst', '5', ...base]);
  assert.strictEqual(seededOf(5), '{mods "as64+:0" "newm:0"}', r.stdout);
  r = t(['--scenario', sc('l', ['oldm']), '--inst', '5', ...base]);
  assert.strictEqual(seededOf(5), '{mods "oldm:0"}', r.stdout);
  r = t(['--scenario', sc('n', []), '--inst', '5', ...base]);
  assert.strictEqual(seededOf(5), '{mods "as64+:0"}', 'no-mod run must not inherit the last list: ' + r.stdout);
  r = t(['--scenario', sc('x', ['newm', 'oldm']), '--inst', '5', ...base]);
  assert.ok(/TESTRUN_MODE_MIX/.test(r.stdout) && r.status !== 0, r.stdout);
  assert.ok(!/mock: no exe launched/.test(r.stdout), 'clash must not launch: ' + r.stdout);
  // breaker: 3 failing launches, log holds one exception -> launch 3 not made
  const qd = path.join(M, 'q'); fs.mkdirSync(qd, { recursive: true });
  for (const n of ['b1', 'b2', 'b3']) fs.writeFileSync(path.join(qd, n + '.json'), JSON.stringify({ name: n, rows: ['ENG-26'], mods: [], mode: 'menu', steps: [{ cmd: 'mp_state', expect: 'never-matches' }], verdict: [] }));
  fs.writeFileSync(path.join(ld, 'game.log'), 'x\r\n***************** Exception *****************\r\nUnable to determine fallback font. (, 102) @ [main_loop]\r\n');
  { const fut = new Date(Date.now() + 120000); fs.utimesSync(path.join(ld, 'game.log'), fut, fut); }   // mock launches write no log: keep it "fresh" for launch 2 under load (crashOf mtime >= start - 2 s)
  const qo = path.join(M, 'q.json');
  r = t(['--queue-dir', qd, '--inst', '4780', '--out', qo, ...base]);
  const j = JSON.parse(fs.readFileSync(qo, 'utf8'));
  assert.strictEqual(j.launches, 2, r.stdout + r.stderr);
  assert.ok(/TESTRUN_QUEUE_STOPPED .*fallback font/.test(j.queue[2].error), JSON.stringify(j.queue[2]));
}
console.log('mode + breaker ok');
// overlap: planning rules, one launch for several fixtures, a FAIL re-runs alone
{
  const ov = require('../overlap');
  const O = path.join(F, 'ov'), S = path.join(O, 'q'); fs.mkdirSync(path.join(S, 'mods'), { recursive: true });
  const fx = (n, file, info = '{mod {Name "x"} {MinGameVersion "3.300"}}') => { const d = path.join(S, 'mods', n); fs.mkdirSync(path.dirname(path.join(d, file)), { recursive: true }); fs.writeFileSync(path.join(d, file), 'x'); fs.writeFileSync(path.join(d, 'mod.info'), info); };
  fx('fa', 'resource/at/a.cfg'); fx('fb', 'resource/at/b.cfg'); fx('fc', 'resource/at/a.cfg'); fx('fd', 'resource/set/multiplayer/games/z.set'); fx('fe', 'resource/at/e.cfg', '{mod {Name "x"} {Delete "y"}}');
  const it = (name, x) => { const sc = Object.assign({ name, rows: [], mods: [], mode: 'menu', steps: [{ cmd: 'mp_state' }], verdict: [] }, x), file = path.join(S, name + '.json'); fs.writeFileSync(file, JSON.stringify(sc)); return { name, file, sc }; };
  const names = g => g.map(x => x.items.map(i => i.name).join('+'));
  const lg = re => ({ log: re, want: true });
  assert.deepStrictEqual(names(ov.plan([it('a', { fixture: ['fa'], mods: ['fa'], verdict: [lg('aaa')] }), it('b', { fixture: ['fb'], mods: ['fb'], verdict: [lg('bbb')] }), it('n', {})])), ['a+b+n'], 'fixtures with no shared path merge');
  assert.deepStrictEqual(names(ov.plan([it('a', { fixture: ['fa'] }), it('c', { fixture: ['fc'] })])), ['a', 'c'], 'same path stays apart');
  assert.deepStrictEqual(names(ov.plan([it('a', { verdict: [lg('same')] }), it('b', { verdict: [lg('same')] })])), ['a', 'b'], 'same positive check stays apart');
  assert.deepStrictEqual(names(ov.plan([it('a', { verdict: [lg('boom')] }), it('b', { verdict: [{ log: 'boom', want: false }] })])), ['a', 'b'], 'one forbids what the other logs');
  assert.deepStrictEqual(names(ov.plan([it('s', { steps: [{ cmd: 'mp_host x' }] }), it('r', {}), it('t', { steps: [{ cmd: 'mp_kick x' }] })])), ['r+s', 't'], 'one state change per launch, last');
  for (const [x, why] of [[{ fixture: ['fd'] }, /global/], [{ fixture: ['fe'] }, /mod\.info/], [{ steps: [{ cmd: 'q' }] }, /quits/], [{ verdict: [{ exit: 0 }] }, /exit/], [{ verdict: [{ event: 'x', want: true }] }, /event/], [{ prepare: [{ argv: ['node'] }] }, /prepare/], [{ overlap: false }, /overlap:false/], [{ mods: ['m:2'] }, /patch/]]) {
    const g = ov.plan([it('p', x), it('r', x.mods ? { mods: x.mods } : {})]);
    assert.ok(why.test(g[0].solo || ''), JSON.stringify(x) + ' -> ' + g[0].solo);
    assert.strictEqual(g.length, 2, JSON.stringify(x));
  }
  assert.deepStrictEqual(names(ov.plan([it('m', { mode: 'mp' }), it('r', {})])), ['m', 'r'], 'mode splits');
  // install --overlay: both fixtures in one folder, the only mod.info is the first's
  for (const f0 of fs.readdirSync(S)) if (/\.json$/.test(f0)) fs.rmSync(path.join(S, f0));
  it('a', { fixture: ['fa'], mods: ['fa'], verdict: [lg('aaa')] }); it('b', { fixture: ['fb'], mods: ['fb'], verdict: [lg('bbb')] });
  const OG = path.join(O, 'game'), run = (extra, out, inst) => { fs.mkdirSync(path.join(OG, 'mods'), { recursive: true }); return spawnSync(process.execPath, [T, '--queue-dir', S, '--overlap', '--mock', '--inst', inst, '--home', home, '--game', OG, '--no-preflight', '--backup', path.join(O, 'bk' + inst), '--out', out, ...extra], { encoding: 'utf8' }); };
  let r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scenarios', 'install.js'), '--game', OG, '--scenario', path.join(S, 'a.json') + ',' + path.join(S, 'b.json'), '--as', 'e2e_test', '--overlay', '--write', '--force'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  for (const p of ['resource/at/a.cfg', 'resource/at/b.cfg', 'mod.info']) assert.ok(fs.existsSync(path.join(OG, 'mods', 'e2e_test', p)), p);
  r = spawnSync(process.execPath, [T, '--queue-dir', S, '--overlap', '--dry'], { encoding: 'utf8' });
  assert.ok(/overlap: 1 launch\(es\) instead of 2/.test(r.stdout) && /a, b\s+\(overlap: one game start\)/.test(r.stdout), r.stdout + r.stderr);
  // a shared launch where b fails: b alone again, a keeps its PASS from the shared launch
  it('a', { fixture: ['fa'], mods: ['fa'], steps: [] }); it('b', { fixture: ['fb'], mods: ['fb'], steps: [{ cmd: 'mp_state', expect: 'never-matches' }] });
  const qj = path.join(O, 'q.json');
  // the stage folder must be in this instance's own fixture list, never the real profile's
  const pf = path.join(home, 'Documents', 'my games', 'men of war - assault squad 2 - instance 4785', 'profiles', 'p1'); fs.mkdirSync(pf, { recursive: true }); fs.writeFileSync(path.join(pf, 'options.set'), '{options\n\t{mods "e2e_test:0"}\n}\n');
  r = run([], qj, '4785');
  const j = JSON.parse(fs.readFileSync(qj, 'utf8')), byName = n => j.queue.find(x => x.name === n);
  assert.strictEqual(j.launches, 2, r.stdout + r.stderr);
  assert.deepStrictEqual(j.overlap.retried, ['b'], JSON.stringify(j.overlap));
  assert.strictEqual(byName('b').status, 'FAIL'); assert.ok(byName('b').overlapFirst, 'solo row keeps the shared try');
  assert.strictEqual(byName('b').launch, 2); assert.strictEqual(j.queue.length, 2);
}
console.log('overlap ok');
