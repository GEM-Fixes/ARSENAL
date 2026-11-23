// humlint --exe case (game parity): made-up installs, nothing written beside the test.
//   AS2-style install with as64.exe and an as64/core human.ext with a bad vitality key: no --exe and --exe as64 report it, --exe mowas_2 /
//   mowas2 do not (no as64/core in the MoW:AS2 view). GoH-style install: --exe goh (and the detected exe) mounts its resource/ and lints it.
//   usage: node exe.js <workdir>   (run.sh gives its temp dir)
// Author: Imperator_Aug (ARSENAL, ia-7f93258a)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'humexe-'));
const put = (root, k, lines) => { const p = path.join(root, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines, 'latin1'); };
const A = path.join(W, 'as2game'), G = path.join(W, 'gohgame');
for (const d of [A, G]) fs.rmSync(d, { recursive: true, force: true });
const ext = ['{extender vitality', '\t{health', '\t\t{max 100}', '\t\t{maximum 100}', '\t}', '}'];
put(A, 'as64.exe', 'MZ');
put(A, 'resource/properties/human_ok.ext', ['{extender vitality', '\t{health {max 100}}', '}']);
put(A, 'as64/core/resource/properties/human.ext', ext);
put(G, 'binaries/x64/call_to_arms.exe', 'MZ');
put(G, 'resource/properties/human.ext', ext);
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const run = args => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'humlint.js'), ...args, '-q'], { encoding: 'utf8' });
const codes = r => (r.stdout.match(/^\S+:\d+: [A-Z_]+/gm) || []).sort();

const def = run(['--vfs', '--game', A]);
if (codes(def).join() !== 'resource/properties/human.ext:4: HUM_VITALITY_KEY') fail('no --exe (as64.exe present) must lint as64/core: ' + def.stdout + def.stderr);
const a = run(['--vfs', '--game', A, '--exe', 'as64']);
if (codes(a).join() !== codes(def).join()) fail('--exe as64 must equal no --exe: ' + a.stdout);
for (const x of ['mowas_2', 'mowas2']) {
  const m = run(['--vfs', '--game', A, '--exe', x]);
  if (m.status !== 0 || codes(m).length) fail(`--exe ${x} must not see as64/core: ` + m.stdout + m.stderr);
}
for (const extra of [['--exe', 'goh'], []]) {
  const g = run(['--vfs', '--game', G, ...extra]);
  if (codes(g).join() !== 'resource/properties/human.ext:4: HUM_VITALITY_KEY') fail('GoH ' + (extra.join(' ') || 'detected') + ': ' + g.stdout + g.stderr);
}
// HUM_VETERANCY_TIED: ranks tied at -1 (the vanilla GoH way to give a rank from spawn) are not reported under goh; a tie at a
// positive threshold still is. AS2 (as64) reports both, as before.
const brd = ['{breed', '\t{veterancy', '\t\t{"lvl_1" -1}', '\t\t{"lvl_2" -1}', '\t\t{"lvl_3" 5}', '\t\t{"lvl_4" 5}', '\t}', '}'];
const VG = path.join(W, 'vetgoh'), VA = path.join(W, 'vetas2');
for (const d of [VG, VA]) fs.rmSync(d, { recursive: true, force: true });
put(VG, 'binaries/x64/call_to_arms.exe', 'MZ'); put(VG, 'resource/set/breed/vet.set', brd);
put(VA, 'as64.exe', 'MZ'); put(VA, 'resource/set/breed/vet.set', brd);
const vg = run(['--vfs', '--game', VG, '--exe', 'goh']), va = run(['--vfs', '--game', VA]);
if (codes(vg).join() !== 'resource/set/breed/vet.set:6: HUM_VETERANCY_TIED') fail('GoH veterancy ties: only the positive one: ' + vg.stdout + vg.stderr);
if (codes(va).join() !== 'resource/set/breed/vet.set:4: HUM_VETERANCY_TIED,resource/set/breed/vet.set:6: HUM_VETERANCY_TIED') fail('as64 veterancy ties: both: ' + va.stdout + va.stderr);
const b = run(['--vfs', '--game', A, '--exe', 'nope']);
if (b.status !== 2) fail('bad --exe must exit 2: ' + b.status);
console.log(bad ? `${bad} failed` : 'exe ok');
process.exit(bad ? 1 : 0);
