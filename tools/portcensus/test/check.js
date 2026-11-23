// portcensus test: no GoH, no game. Builds a fake GoH tree in test/work, runs the census with the three stub steps.
// Author: Imperator_Aug (ARSENAL, ia-dc75996d)
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert');
const T = __dirname, W = path.join(T, 'work'), TOOL = path.join(T, '..', 'portcensus.js');
const LOG = path.join(W, 'calls.log');
fs.rmSync(W, { recursive: true, force: true });
const goh = path.join(W, 'goh'), game = path.join(W, 'game');
const defs = ['ger/tank_medium/aa/aa.def', 'ger/tank_medium/x/aa_x/aa_x.def', 'ger/btr/bad/bad.def', 'ussr/tank_heavy/nb/nb.def',
  'ussr/cannon/cc/cc.def', 'ussr/cannon/cc/cc_late.def', 'ussr/cannon/cc/parts/deep.def'];
for (const d of defs) { const f = path.join(goh, 'resource/entity/-vehicle', d); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '{x}\r\n'); }
fs.mkdirSync(game, { recursive: true });
const stubs = ['--conv-cmd', path.join(T, 'stub/conv.js'), '--pass-cmd', path.join(T, 'stub/pass.js'), '--verdict-cmd', path.join(T, 'stub/verdict.js')];
function run(out, extra, env) {
  const r = cp.spawnSync(process.execPath, [TOOL, '--goh', goh, '--game', game, '--out', path.join(W, out), ...stubs, ...extra], { encoding: 'utf8', env: { ...process.env, PORTCENSUS_TEST_LOG: LOG, ...(env || {}) } });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error('exit ' + r.status); }
  return { c: JSON.parse(fs.readFileSync(path.join(W, out, 'census.json'), 'utf8')), raw: fs.readFileSync(path.join(W, out, 'census.json')), stdout: r.stdout };
}
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok ' + name); };

// 1 full run, one failing unit
let a;
ok('full run', () => {
  a = run('a', ['--jobs', '2']);
  const c = a.c;
  assert.strictEqual(c.form, 'census/1');
  assert.strictEqual(c.asked, 5, 'x/ and deeper defs left out');
  assert.strictEqual(c.done, 4); assert.strictEqual(c.bar, 2, 'cc_late: values out of range, bar true, native false'); assert.strictEqual(c.native, 1);
  assert.deepStrictEqual(c.byClass, { btr: { done: 0, bar: 0, native: 0 }, cannon: { done: 2, bar: 1, native: 0 }, tank_heavy: { done: 1, bar: 1, native: 1 }, tank_medium: { done: 1, bar: 0, native: 0 } });
  assert.deepStrictEqual(c.failed.map(f => [f.unit, f.step]), [['bad', 'conv']]);
  assert.ok(!/[A-Za-z]:[\\/]/.test(c.failed[0].why), 'no absolute path in why: ' + c.failed[0].why);
  assert.deepStrictEqual(c.topMissing, [{ key: 'entity/volume/thickness/front', units: 2 }]);
  assert.deepStrictEqual(c.topExtra, [{ key: 'entity/extender:smokescreen/cooldown', units: 2 }]);
  assert.deepStrictEqual(c.topValues, [{ key: 'entity/speed', units: 3 }], 'value key counted once per unit');
  assert.ok(/^portcensus: asked 5, done 4, bar 2, native 1, failed 1, not started 0$/m.test(a.stdout) && a.stdout.includes('top value keys, not part of the bar (units):') && a.stdout.includes('by class (done / bar / native):'));
  assert.ok(fs.existsSync(path.join(W, 'a', 'census.time.json')));
  assert.strictEqual(fs.readFileSync(path.join(W, 'a', 'census.txt'), 'utf8'), a.stdout);
});
ok('byte-stable', () => { const b = run('b', ['--jobs', '1']); assert.ok(a.raw.equals(b.raw)); });
ok('env stubs', () => {
  const r = cp.spawnSync(process.execPath, [TOOL, '--goh', goh, '--game', game, '--out', path.join(W, 'e'), '--units', 'nb'], { encoding: 'utf8', env: { ...process.env, PORTCENSUS_CONV: path.join(T, 'stub/conv.js'), PORTCENSUS_PASS: path.join(T, 'stub/pass.js'), PORTCENSUS_VERDICT: path.join(T, 'stub/verdict.js') } });
  assert.strictEqual(r.status, 0, r.stderr);
  const c = JSON.parse(fs.readFileSync(path.join(W, 'e', 'census.json'), 'utf8'));
  assert.strictEqual(c.native, 1); assert.strictEqual(c.done, 1);
});
ok('resume', () => {
  fs.writeFileSync(LOG, '');
  const r = run('a', ['--resume']);
  assert.deepStrictEqual(fs.readFileSync(LOG, 'utf8').trim().split('\n'), ['conv bad'], 'only the failed unit runs again');
  assert.ok(r.raw.equals(a.raw));
});
ok('budget 0', () => {
  fs.writeFileSync(LOG, '');
  const r = run('z', ['--budget-s', '0']);
  assert.strictEqual(fs.readFileSync(LOG, 'utf8'), '');
  assert.strictEqual(r.c.asked, 5); assert.strictEqual(r.c.done, 0); assert.deepStrictEqual(r.c.failed, []);
  assert.ok(/not started 5/.test(r.stdout));
});
ok('every / class / limit / units', () => {
  const sel = (x) => { const r = run('s', x); return Object.keys(r.c.byClass).join(',') + ':' + r.c.asked; };
  assert.strictEqual(sel(['--every', '2', '--budget-s', '0']), 'cannon,tank_heavy,tank_medium:3');   // aa, cc, nb
  assert.strictEqual(sel(['--class', 'cannon', '--budget-s', '0']), 'cannon:2');
  // a class no unit has: asked 0 as before, plus one stderr line naming the classes there are
  const nc = cp.spawnSync(process.execPath, [TOOL, '--goh', goh, '--game', game, '--out', path.join(W, 'nc'), ...stubs, '--class', 'tank,cannon', '--budget-s', '0'], { encoding: 'utf8' });
  assert.strictEqual(nc.status, 0, nc.stderr);
  assert.strictEqual(nc.stderr.trim(), 'portcensus: no GoH unit in class tank (classes: btr, cannon, tank_heavy, tank_medium)');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(W, 'nc', 'census.json'), 'utf8')).asked, 2);
  assert.strictEqual(sel(['--limit', '2', '--budget-s', '0']), 'btr,tank_medium:2');
  const u = run('s', ['--units', 'nb,zz']);
  assert.deepStrictEqual(Object.keys(u.c.byClass), ['?', 'tank_heavy']);
  fs.writeFileSync(path.join(W, 'list.txt'), 'cc\r\n\r\ncc_late\r\n');
  assert.strictEqual(run('s', ['--unit-list', path.join(W, 'list.txt'), '--budget-s', '0']).c.asked, 2);
});
ok('batch', () => {
  fs.writeFileSync(LOG, '');
  const r = run('bt', ['--batch', '3', '--jobs', '1']);
  assert.ok(r.raw.equals(a.raw), 'batch census equals the single-unit census');
  // chunks aa,bad,cc (fails as a whole -> alone) and cc_late,nb (one batch run)
  assert.deepStrictEqual(fs.readFileSync(LOG, 'utf8').trim().split('\n'), ['conv aa,bad,cc', 'conv aa', 'conv bad', 'conv cc', 'conv cc_late,nb']);
  const l = run('bl', ['--units', 'lost,nb', '--batch', '2']);
  assert.deepStrictEqual(l.c.failed.map(f => [f.unit, f.step]), [['lost', 'conv']]);
  assert.strictEqual(l.c.native, 1);
});
ok('exe: every step gets the named build, none named = as before, goh refused', () => {
  const AL = path.join(W, 'args.log'), lines = () => fs.readFileSync(AL, 'utf8').trim().split('\n').sort();
  fs.writeFileSync(AL, '');
  const m = run('xm', ['--units', 'nb', '--exe', 'mowas2'], { PORTCENSUS_TEST_ARGS: AL });
  assert.deepStrictEqual(lines(), ['conv --exe mowas_2', 'pass --exe mowas_2', 'verdict --exe mowas_2']);
  assert.strictEqual(m.c.native, 1);
  fs.writeFileSync(AL, '');
  run('xb', ['--units', 'nb,cc', '--batch', '2', '--exe', 'mowas_2'], { PORTCENSUS_TEST_ARGS: AL });
  assert.deepStrictEqual(lines(), ['conv --exe mowas_2', 'pass --exe mowas_2', 'verdict --exe mowas_2'], 'batch steps too');
  fs.writeFileSync(AL, '');
  run('xn', ['--units', 'nb'], { PORTCENSUS_TEST_ARGS: AL });
  assert.deepStrictEqual(lines(), ['conv -', 'pass -', 'verdict -'], 'no --exe: no --exe to any step');
  const g = cp.spawnSync(process.execPath, [TOOL, '--goh', goh, '--game', game, '--out', path.join(W, 'xg'), ...stubs, '--exe', 'goh'], { encoding: 'utf8' });
  assert.strictEqual(g.status, 2);
  assert.ok(/^portcensus: not available for GoH: .*\(plan\/reports\/game-parity\/t-port-b\.md: n\/a \(source game\)\)\s*$/.test(g.stderr), g.stderr);
  assert.ok(!fs.existsSync(path.join(W, 'xg')), 'refused before any output');
});
ok('exe: records and census carry the build, resume reuses only records of the same build', () => {
  const rec = d => JSON.parse(fs.readFileSync(path.join(W, d, 'v', 'nb.json'), 'utf8'));
  const tj = d => JSON.parse(fs.readFileSync(path.join(W, d, 'census.time.json'), 'utf8'));
  const m = run('xm', ['--units', 'nb', '--exe', 'mowas2']);
  assert.strictEqual(rec('xm').exe, 'mowas_2'); assert.strictEqual(m.c.exe, 'mowas_2'); assert.strictEqual(tj('xm').exe, 'mowas_2');
  const n0 = run('xr', ['--units', 'nb']);
  assert.ok(!('exe' in rec('xr')) && !('exe' in n0.c), 'as64: no exe field, records as before'); assert.strictEqual(tj('xr').exe, 'as64');
  fs.writeFileSync(LOG, '');
  const r1 = run('xr', ['--units', 'nb', '--resume', '--exe', 'mowas_2']);
  assert.deepStrictEqual(fs.readFileSync(LOG, 'utf8').trim().split('\n'), ['conv nb'], 'as64 record not reused for mowas_2');
  assert.strictEqual(rec('xr').exe, 'mowas_2'); assert.strictEqual(r1.c.exe, 'mowas_2'); assert.strictEqual(r1.c.done, 1);
  fs.writeFileSync(LOG, '');
  run('xr', ['--units', 'nb', '--resume', '--exe', 'mowas_2']);
  assert.strictEqual(fs.readFileSync(LOG, 'utf8'), '', 'same build: reused');
  fs.writeFileSync(LOG, '');
  const r2 = run('xr', ['--units', 'nb', '--resume', '--exe', 'as64']);
  assert.deepStrictEqual(fs.readFileSync(LOG, 'utf8').trim().split('\n'), ['conv nb'], 'mowas_2 record not reused for as64');
  assert.ok(r2.raw.equals(n0.raw), 'as64 census byte for byte as the plain run');
});
ok('lost v/ folder mid-run: the unit is saved as failed, no crash', () => {
  const r = run('xl', ['--units', 'nb'], { PORTCENSUS_TEST_RMV: path.join(W, 'xl', 'v') });
  assert.deepStrictEqual(r.c.failed.map(f => [f.unit, f.step]), [['nb', 'verdict']]);
});
ok('thrown batch over records of another build: the units are listed as failed, not as not started', () => {
  run('xt', ['--units', 'cc,nb']);   // as64 records of both units
  fs.mkdirSync(path.join(W, 'xt', 'u', '_b_cc.list'), { recursive: true });   // the batch list path is a folder: doBatch throws
  const r = run('xt', ['--units', 'cc,nb', '--batch', '2', '--resume', '--exe', 'mowas_2']);
  assert.deepStrictEqual(r.c.failed.map(f => [f.unit, f.step]), [['cc', 'census'], ['nb', 'census']]);
  assert.ok(/failed 2, not started 0/.test(r.stdout), r.stdout);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(W, 'xt', 'v', 'nb.json'), 'utf8')).exe, 'mowas_2');
});
console.log(`portcensus test: ${n} cases ok`);
