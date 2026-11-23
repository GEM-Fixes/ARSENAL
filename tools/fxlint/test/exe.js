// fxlint --exe case (game parity): made-up installs, nothing written beside the test.
//   AS2-style install with as64.exe and an as64/core sound folder.set with a bad tag: no --exe and --exe as64 report it, --exe mowas_2 /
//   mowas2 do not (no as64/core). GoH-style install (binaries/x64/call_to_arms.exe): entity.set using GoH actions (unlink linear_damping
//   mark_for_persistence ...) stays quiet under the GoH list (actions-goh.json, GHINT-26), get_off (gone in GoH) and a made-up action are
//   flagged; the same file under as64 flags the GoH actions and not get_off.
//   usage: node exe.js <workdir>   (run.sh gives its temp dir)
// Author: Imperator_Aug (ARSENAL, ia-cf9f1ad2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'fxexe-'));
const put = (root, k, lines) => { const p = path.join(root, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines, 'latin1'); };
const A = path.join(W, 'as2game'), G = path.join(W, 'gohgame'), F = path.join(W, 'gohmod');
for (const d of [A, G, F]) fs.rmSync(d, { recursive: true, force: true });
put(A, 'as64.exe', 'MZ');
put(A, 'resource/sound/ok/folder.set', ['{sound', '\t{tag effects}', '}']);
put(A, 'as64/core/resource/sound/core/folder.set', ['{sound', '\t{tag main_environment}', '}']);
const ie = ['{interaction', '\t{"generic"', '\t\t{on "hit"', '\t\t\t{unlink}', '\t\t\t{linear_damping 0.5}', '\t\t\t{mark_for_persistence}',
  '\t\t\t{get_off}', '\t\t\t{no_such_action}', '\t\t\t{if {delay 1 {call_synced "x"}}}', '\t\t}', '\t}', '}'];
put(G, 'binaries/x64/call_to_arms.exe', 'MZ');
put(G, 'resource/set/interaction_entity/entity.set', ie);
put(F, 'resource/set/interaction_entity/entity.set', ie);
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const run = args => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'fxlint.js'), ...args, '-q'], { encoding: 'utf8' });
const codes = r => (r.stdout.match(/^\S+:\d+: [A-Z_]+/gm) || []).sort();

const def = run(['--vfs', '--game', A]);
if (!codes(def).includes('resource/sound/core/folder.set:2: SND_TAG_UNKNOWN')) fail('no --exe (as64.exe present) must lint as64/core: ' + def.stdout + def.stderr);
const a = run(['--vfs', '--game', A, '--exe', 'as64']);
if (codes(a).join() !== codes(def).join()) fail('--exe as64 must equal no --exe: ' + a.stdout);
for (const x of ['mowas_2', 'mowas2']) {
  const m = run(['--vfs', '--game', A, '--exe', x]);
  if (m.status !== 0 || codes(m).length) fail(`--exe ${x} must not see as64/core: ` + m.stdout + m.stderr);
}
const want = 'resource/set/interaction_entity/entity.set:7: IA_ACTION_UNKNOWN,resource/set/interaction_entity/entity.set:8: IA_ACTION_UNKNOWN';
for (const extra of [['--exe', 'goh'], []]) {
  const g = run(['--vfs', '--game', G, ...extra]);
  if (codes(g).join() !== want) fail('GoH ' + (extra.join(' ') || 'detected') + ': want get_off + no_such_action, got ' + codes(g).join(' ') + g.stderr);
}
const { check } = require('../fxlint');
const lines = exe => check({ folder: F, exe }).rep.toJSON({ tool: 'fxlint' }).findings.filter(f => f.code === 'IA_ACTION_UNKNOWN').map(f => f.line).join(',');
if (lines('goh') !== '7,8') fail('folder --exe goh: ' + lines('goh'));
if (lines('as64') !== '4,5,6,8,9') fail('folder --exe as64: ' + lines('as64'));
// the GoH list: as64 list minus get_off plus the GoH actions, same containers
const AC = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'actions.json'), 'utf8')), GH = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'actions-goh.json'), 'utf8'));
if (GH.actions.includes('get_off') || !GH.actions.includes('unlink') || AC.actions.filter(x => x !== 'get_off').some(x => !GH.actions.includes(x))) fail('actions-goh.json content');
if (GH.containers.join() !== AC.containers.join()) fail('actions-goh.json containers');
console.log(bad ? `${bad} failed` : 'exe ok');
process.exit(bad ? 1 : 0);
