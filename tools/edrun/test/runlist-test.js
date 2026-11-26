// runlist: dry HELD stops; control rerun; early stop drops decided pairs; verdicts follow the pass rule.
// Author: Imperator_Aug (ARSENAL, ia-aa293687)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-')), RL = path.join(__dirname, '../runlist.js'), STUB = path.join(__dirname, 'rl/stub.js');
let ok = true; const t = (c, m) => { if (!c) { console.log('FAIL runlist: ' + m); ok = false; } };
const ctl = { name: 'ctlpz', shooter: 'ctl' }, mk = (games, extra) => { const L = ['## S1', '```'];
  const fw = p => p.split(path.sep).join('/');
  games.forEach((ps, i) => { const f = fw(path.join(T, `p${i + 1}.json`)); fs.writeFileSync(f, JSON.stringify([ctl, ...ps]));
    L.push(`node tools/edrun/edrun.js --inst <I> --pairs ${f} --out ${fw(path.join(T, 'o', 'g' + (i + 1)))}`); });
  fs.writeFileSync(path.join(T, 'list.md'), L.concat('```').join('\n')); };
const run = x => spawnSync(process.execPath, [RL, '--list', path.join(T, 'list.md'), '--edrun', STUB, '--inst', '1,2', '--reserve', '0', '--commit-reserve', '0', '--stagger', '0', '--claims', path.join(T, 'claims'), ...x], { encoding: 'utf8' });
const G = { name: 'sx_g', shooter: 'good' }, B = { name: 'sx_b', shooter: 'bad' }, F = { name: 'sx_f', shooter: 'flaky' };
mk([[G], [{ name: 'sx_h', shooter: 'held' }]]); let r = run([]);
t(r.status === 1 && /HELD g2: sx_h/.test(r.stdout), 'held pair stops the run');
fs.rmSync(path.join(T, 'o'), { recursive: true, force: true });
mk(Array.from({ length: 6 }, () => [G, B, F])); r = run(['--no-dry']);
const J = JSON.parse(fs.readFileSync(path.join(T, 'o', 'runlist.json'), 'utf8'));
t(r.status === 0, 'run exits 0: ' + r.stderr.slice(0, 200));
t(J.games.some(g => g.id === 'g2' && g.rerun === 1 && g.valid), 'g2 control fails: rerun once, valid on the rerun');
t(J.pairs.sx_g.verdict === 'pass' && J.pairs.sx_g.decided && J.pairs.sx_g.runs < 5, 'good pair decided pass early: ' + JSON.stringify(J.pairs.sx_g));
t(J.pairs.sx_b.verdict === 'fail' && J.pairs.sx_b.decided && J.pairs.sx_b.runs < 6, 'bad pair decided fail early: ' + JSON.stringify(J.pairs.sx_b));
t(/passing 1\/3|passing 2\/3/.test(fs.readFileSync(path.join(T, 'o', 'runlist.txt'), 'utf8')), 'runlist.txt summary');
fs.rmSync(path.join(T, 'o'), { recursive: true, force: true }); r = run(['--no-dry', '--no-stop']);
const J2 = JSON.parse(fs.readFileSync(path.join(T, 'o', 'runlist.json'), 'utf8'));
t(J2.pairs.sx_b.runs === 6 && !J2.pairs.sx_b.decided, '--no-stop runs every valid game: ' + JSON.stringify(J2.pairs.sx_b));
// a live claim on instance 1 (this test's pid) keeps runlist off it; runlist's own claims are gone after
fs.rmSync(path.join(T, 'o'), { recursive: true, force: true }); fs.mkdirSync(path.join(T, 'claims'), { recursive: true });
fs.writeFileSync(path.join(T, 'claims', '1.json'), JSON.stringify({ pid: process.pid, wave: 'w', id: 'x' }));
mk([[G], [G]]); r = run(['--no-dry']); const lg = fs.readFileSync(path.join(T, 'o', 'runlist.log'), 'utf8');
t(r.status === 0 && !/start \S+ inst 1,/.test(lg) && /start \S+ inst 2,/.test(lg),'claimed instance 1 skipped: ' + lg.slice(0, 300));
t(fs.readdirSync(path.join(T, 'claims')).join() === '1.json', 'runlist leaves no claim behind');
// commit gate: low free commit holds the second start while the first game runs; freed commit releases it (slow stub keeps game 1 up
// until the test saw "start g2" and wrote go.txt: by the event, not a fixed 2.5 s. Backup, never a hang: the stub goes on after 2 min)
fs.rmSync(path.join(T, 'o'), { recursive: true, force: true });
const SLOW = path.join(T, 'slow.js'), CF = path.join(T, 'commit.txt'), GO = path.join(T, 'go.txt');
fs.writeFileSync(SLOW, `const fs = require('fs'), t0 = Date.now(); (function w() { if (process.argv.includes('--dry') || fs.existsSync(${JSON.stringify(GO)}) || Date.now() - t0 > 120000) require(${JSON.stringify(STUB)}); else setTimeout(w, 20); })();`);
fs.writeFileSync(CF, '36000000 1000000');   // 977 MB free < 1500
mk([[G], [G]]);
const { spawn } = require('child_process');
const lgf = path.join(T, 'o', 'runlist.log'), rd = () => { try { return fs.readFileSync(lgf, 'utf8'); } catch { return ''; } };
const cp = spawn(process.execPath, [RL, '--list', path.join(T, 'list.md'), '--edrun', SLOW, '--inst', '1,2', '--reserve', '0', '--commit-reserve', '1500', '--stagger', '0', '--no-dry', '--no-stop', '--claims', path.join(T, 'claims2')],
  { env: { ...process.env, AS64_COMMIT_FILE: CF } });
let released = false, go = false, said = false; const t0 = Date.now();
const poll = setInterval(() => { const l = rd(); if (!released && /commit hold/.test(l)) { released = true; fs.writeFileSync(CF, '36000000 6000000'); }
  if (!go && /start g2/.test(l)) { go = true; fs.writeFileSync(GO, 'go'); }
  if (!go && !said && Date.now() - t0 > 120000) { said = true; require('../../lib/test/wait').say('edrun runlist', 'commit hold, release and start g2', 120000); } }, 20);
cp.on('close', code => {
  clearInterval(poll); const l = rd(), s2 = l.indexOf('start g2'), d1 = l.indexOf('done g1');
  t(code === 0, 'commit run exits 0');
  t(/commit hold: free commit 977 MB/.test(l), 'low commit logs a hold: ' + l.slice(0, 300));
  t(/commit release/.test(l), 'freed commit logs a release');
  t(s2 > 0 && d1 > 0 && s2 < d1, 'game 2 starts on release while game 1 still runs (start g2 ' + s2 + ' < done g1 ' + d1 + ')');
  fs.rmSync(T, { recursive: true, force: true });
  if (ok) console.log('runlist ok'); process.exit(ok ? 0 : 1);
});
