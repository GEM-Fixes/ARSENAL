// unitgroups --exe: made-up AS2 install with as64.exe and mowas_2.exe; as64/core holds a common.set with one more card.
//   no --exe and --exe as64 read the as64 view (2 cards), --exe mowas_2 / mowas2 the MoW:AS2 view (no as64/core: 1 card), --exe goh is refused.
//   usage: node exe.js [workdir]   (run.sh gives its temp dir; nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-b39c6a73)
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const W = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ugexe-'));
const G = path.join(W, 'uggame');
const put = (k, t) => { const p = path.join(G, ...k.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
fs.rmSync(G, { recursive: true, force: true });
put('as64.exe', 'MZ'); put('mowas_2.exe', 'MZ');
put('resource/set/multiplayer/units/common.set', '{units\r\n {"t34" {tags all rus}}\r\n}\r\n');
put('as64/core/resource/set/multiplayer/units/common.set', '{units\r\n {"t34" {tags all rus}}\r\n {"core_tank" {tags all ger}}\r\n}\r\n');
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const run = a => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'unitgroups.js'), '--game', G, ...a], { encoding: 'utf8' });
const cards = a => { const r = run(a); const m = /^(\d+) cards/.exec(r.stdout); if (!m) fail('no summary for ' + a.join(' ') + ': ' + (r.stderr || r.stdout).slice(0, 300)); return m ? +m[1] : -1; };
if (cards([]) !== 2) fail('no --exe: as64 view with the as64/core card (2 cards)');
if (cards(['--exe', 'as64']) !== 2) fail('--exe as64: 2 cards');
if (cards(['--exe', 'mowas_2']) !== 1) fail('--exe mowas_2: no as64/core, 1 card');
if (cards(['--exe', 'mowas2']) !== 1) fail('--exe mowas2 (GUI id) taken as mowas_2');
const u = run(['--exe', 'mowas_2', '--units']);
if (/core_tank/.test(u.stdout) || !/t34/.test(u.stdout)) fail('--units under mowas_2 lists only the vanilla card: ' + u.stdout);
const g = run(['--exe', 'goh']);
if (g.status !== 2 || !/^unitgroups: not available for GoH: .*\(modweb\/testing\/goh-drive\.md\)$/.test(g.stderr.trim())) fail('--exe goh: exit 2, one plain line: ' + g.status + ' ' + g.stderr);
const b = run(['--exe', 'nope']);
if (b.status !== 2) fail('bad --exe exits 2');
fs.rmSync(G, { recursive: true, force: true });
console.log(bad ? bad + ' failed' : 'exe ok');
process.exit(bad ? 1 : 0);
