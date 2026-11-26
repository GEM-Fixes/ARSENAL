// doctor --reuse-dir wave 2a): sdllint output taken from a wouldload pass file when the arguments are the same;
// any other case (other arguments, a pass that did not finish, no file and END) runs the tool here, note REUSE_MISS.
//   node reuse-test.js <mod folder under <game>/mods> <work dir>   (run.sh passes the binhdr fixture mod)
// Author: Imperator_Aug (ARSENAL, ia-5504a889)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const [mod, work] = process.argv.slice(2), DOC = path.join(__dirname, '..', 'doctor.js');
const gid = require('../../lib/games').detect(path.dirname(path.dirname(path.resolve(mod))));
let bad = 0;
const fail = m => { console.log('FAIL: reuse ' + m); bad++; };
const doc = (args, env) => cp.spawnSync(process.execPath, [DOC, mod, '--only', 'sdllint', '--locs', '5', '--out', path.join(work, 'ro'), ...args], { encoding: 'utf8', env: { ...process.env, ...env } }).stdout;
// the arguments doctor gives sdllint (test hook), then the same run's real output
const plain = doc([], { DOCTOR_TEST_ARGS: '1' }), args = JSON.parse(fs.readFileSync(path.join(work, 'ro', 'sdllint.args'), 'utf8'));
if (!/^sdllint /m.test(plain)) fail('no sdllint line in the plain run: ' + plain);
const FAKE = 'resource/entity/seed/x.def:3: FAKE_REUSED_CODE seeded by reuse-test\n1 findings\n';
const dir = (name, file, end) => { const d = path.join(work, name); fs.mkdirSync(d, { recursive: true }); if (file) fs.writeFileSync(path.join(d, `${gid}.sdllint.json`), JSON.stringify(file)); if (end) fs.writeFileSync(path.join(d, 'END'), ''); return d; };
// 1. same arguments (with --no-rc and another --cache, which do not count): the file's output is the report
let out = doc(['--reuse-dir', dir('r1', { args: [...args, '--no-rc', '--cache', 'elsewhere.json'], ok: true, code: 1, out: FAKE, err: '' })]);
if (!/^REUSED sdllint: findings from the load check's run/m.test(out) || !/^sdllint +1 +FAKE_REUSED_CODE×1/m.test(out)) fail('same arguments not reused: ' + out);
// 2. other arguments (another --mods list): run here
const other = args.slice(); const mi = other.indexOf('--mods'); if (mi >= 0) other[mi + 1] += ',zz'; else other.push('--mods', 'zz');
out = doc(['--reuse-dir', dir('r2', { args: other, ok: true, code: 1, out: FAKE, err: '' }, true)]);
if (!/^REUSE_MISS sdllint: the load check ran it with other arguments/m.test(out) || /FAKE_REUSED_CODE/.test(out) || /^REUSED/m.test(out)) fail('other arguments: ' + out);
// 3. a pass that did not finish: run here
out = doc(['--reuse-dir', dir('r3', { args, ok: false, why: 'sdllint ended without a findings line (exit 134: out of memory)', code: 134, out: '', err: '' }, true)]);
if (!/^REUSE_MISS sdllint: the load check's run did not finish/m.test(out) || /FAKE_REUSED_CODE/.test(out)) fail('failed pass: ' + out);
// 4. no pass file, END written (wouldload ran no pass for this game): run here
out = doc(['--reuse-dir', dir('r4', null, true)]);
if (!new RegExp(`^REUSE_MISS sdllint: the load check ran no ${gid} pass`, 'm').test(out)) fail('no pass: ' + out);
// the runs here report what the plain run reported
const line = s => (/^sdllint .*$/m.exec(s) || [''])[0].replace(/\(\d+s\)/, '');
if (line(out) !== line(plain)) fail(`run-here line differs: "${line(out)}" vs "${line(plain)}"`);
console.log(bad ? 'FAIL' : 'PASS');
process.exitCode = bad ? 1 : 0;
