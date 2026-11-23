// movlint --exe case (game parity): made-up installs, nothing written beside the test.
//   AS2-style install with as64.exe and an as64/core layer whose def has a bad Locomotion key: --vfs with no --exe and --exe as64 report it,
//   --exe mowas_2 / mowas2 do not (no as64/core in the MoW:AS2 view). GoH-style install (binaries/x64/call_to_arms.exe): Slow Normal Fast
//   CostFactor inside Locomotion are read by GoH (GHMOV-44 GHMOV-45) and stay quiet; the same def under as64 is flagged; a real unknown
//   key is flagged in both.
//   usage: node exe.js <workdir>   (run.sh gives its temp dir)
// Author: Imperator_Aug (ARSENAL, ia-87ae72b6)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'movexe-'));
const put = (root, k, lines) => { const p = path.join(root, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines, 'latin1'); };
const A = path.join(W, 'as2game'), G = path.join(W, 'gohgame'), F = path.join(W, 'gohmod');
for (const d of [A, G, F]) fs.rmSync(d, { recursive: true, force: true });
put(A, 'as64.exe', 'MZ');
put(A, 'resource/entity/base/base.def', ['{game_entity', '  {Chassis "track"', '    {Locomotion {MaxSpeed 20}}', '  }', '}']);
put(A, 'as64/core/resource/entity/core/core.def', ['{game_entity', '  {Chassis "track"', '    {Locomotion {MaxSpeed 20}', '      {MaxSped 20}', '    }', '  }', '}']);
const goh = ['{game_entity', '  {Chassis "track"', '    {Locomotion {MaxSpeed 20}', '      {Slow 5}', '      {Normal 10}', '      {Fast 20}', '      {CostFactor 1.5}', '      {Bogus 1}', '    }', '  }', '}'];
put(G, 'binaries/x64/call_to_arms.exe', 'MZ');
put(G, 'resource/entity/g/g.def', goh);
put(F, 'resource/entity/g/g.def', goh);
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const run = args => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'movlint.js'), ...args, '-q'], { encoding: 'utf8' });
const codes = r => (r.stdout.match(/^\S+:\d+: [A-Z_]+/gm) || []).sort();

const def = run(['--vfs', '--game', A]);
if (!codes(def).includes('resource/entity/core/core.def:4: MOV_LOCO_KEY')) fail('no --exe (as64.exe present) must lint as64/core: ' + def.stdout + def.stderr);
const a = run(['--vfs', '--game', A, '--exe', 'as64']);
if (codes(a).join() !== codes(def).join()) fail('--exe as64 must equal no --exe: ' + a.stdout);
for (const x of ['mowas_2', 'mowas2']) {
  const m = run(['--vfs', '--game', A, '--exe', x]);
  if (m.status !== 0 || codes(m).length) fail(`--exe ${x} must not see as64/core: ` + m.stdout + m.stderr);
}
// GoH install: vfs exe goh (named, and detected from call_to_arms.exe)
for (const extra of [['--exe', 'goh'], []]) {
  const g = run(['--vfs', '--game', G, ...extra]);
  const c = codes(g);
  if (c.join() !== 'resource/entity/g/g.def:8: MOV_LOCO_KEY') fail('GoH ' + (extra.join(' ') || 'detected') + ': only Bogus is unknown, got ' + c.join(' ') + g.stderr);
}
// GoH mod folder alone (no game): --exe goh picks the GoH key set; --exe as64 the as64 one
const { check } = require('../movlint');
const n = exe => check({ folder: F, exe }).rep.toJSON({ tool: 'movlint' }).findings.filter(f => f.code === 'MOV_LOCO_KEY').map(f => f.line).join(',');
if (n('goh') !== '8') fail('folder --exe goh: ' + n('goh'));
if (n('as64') !== '4,5,6,7,8') fail('folder --exe as64: ' + n('as64'));
// bad --exe: exit 2
const b = run(['--vfs', '--game', A, '--exe', 'nope']);
if (b.status !== 2) fail('bad --exe must exit 2: ' + b.status + ' ' + b.stderr);
console.log(bad ? `${bad} failed` : 'exe ok');
process.exit(bad ? 1 : 0);
