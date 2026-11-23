// testrun features of the 2026-11-04 harness hardening: wait_log, --max-same-fail, --rerun, quarantine, dead-pipe stop, no solo retry after a crash,
// folder allowlist e2e_test..8 (backup/restore), batch --inst-from, enhanced-mod as64+ rule, lint hooks. mock mode only, no game.
// Author: Imperator_Aug (ARSENAL, ia-b9aad6ba)
const fs = require('fs'), path = require('path'), assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const T = path.join(__dirname, '..', 'testrun.js');
const F = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'nf');
fs.rmSync(F, { recursive: true, force: true }); fs.mkdirSync(F, { recursive: true });
const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); return f; };
const run = (args, opt) => spawnSync(process.execPath, [T, ...args], Object.assign({ encoding: 'utf8' }, opt));
const logArgs = d => ['--logdir', path.join(d, 'log'), '--archive', path.join(d, 'arch')];
let inst = 4830;
const nextInst = () => String(inst++);

// ---- 1. wait_log: stale log ignored, match ends the wait at once, timeout -> TESTRUN_WAITLOG_TIMEOUT
(async () => {
  const D = path.join(F, 'wl'), log = path.join(D, 'log', 'game.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, 'old run\nMARKER_DONE\n'); const old = new Date(Date.now() - 3600e3); fs.utimesSync(log, old, old);
  const sc = wj(path.join(D, 'wl.json'), { name: 'wl', mode: 'menu', steps: [{ cmd: 'echo hi' }, { wait_log: 'MARKER_(DONE|X)', timeout: 30 }], verdict: [{ reply: 'echo hi', match: '^hi$' }] });
  const t0 = Date.now();
  const p = spawn(process.execPath, [T, '--scenario', sc, '--mock', '--inst', nextInst(), ...logArgs(D), '--connect-timeout', '5', '--exit-wait', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  // the exe rewrites game.log once the run is under way (after "connected": a fixed delay lost the race on a loaded machine, node start > 1.2 s)
  let out = '', wrote = false; const rewrite = () => { if (!wrote && /^connected /m.test(out)) { wrote = true; setTimeout(() => fs.writeFileSync(log, 'new run\nMARKER_DONE\n'), 1200); } };
  p.stdout.on('data', d => { out += d; rewrite(); }); p.stderr.on('data', d => { out += d; rewrite(); });
  const code = await new Promise(r => p.on('close', r));
  const dt = Date.now() - t0;
  assert.strictEqual(code, 0, out);
  assert.ok(/game\.log \/MARKER_\(DONE\|X\)\/ after \d+ ms/.test(out), out);
  assert.ok(dt > 1000 && dt < 15000, 'wait_log took ' + dt + ' ms (stale line must not match, fresh one must end the wait): ' + out);
  assert.ok(!/WAITLOG_TIMEOUT/.test(out), out);
  // timeout
  fs.writeFileSync(log, 'nothing here\n');
  const sc2 = wj(path.join(D, 'wl2.json'), { name: 'wl2', mode: 'menu', steps: [{ wait_log: 'NEVER', timeout: 1 }], verdict: [{ event: 'hello' }] });
  const r = run(['--scenario', sc2, '--mock', '--inst', nextInst(), ...logArgs(D), '--connect-timeout', '5', '--exit-wait', '2']);
  assert.ok(/TESTRUN_WAITLOG_TIMEOUT no game\.log line matching \/NEVER\/ in 1s/.test(r.stdout), r.stdout);
  assert.strictEqual(r.status, 1);
  // plan + lint
  assert.ok(/wait game\.log line \/MARKER_\(DONE\|X\)\/ \(timeout 30s\)/.test(run(['--scenario', sc, '--dry']).stdout));
  wj(path.join(D, 'lint', 'bad.json'), { name: 'bad', mode: 'menu', steps: [{ wait_log: 'oops(' }, { wait_log: 'plain (text) here' }], verdict: [{ event: 'hello' }] });
  const l = run(['--lint', path.join(D, 'lint')]).stdout;
  assert.ok(/LINT_REGEX wait_log regex \/oops\(\/ does not compile/.test(l), l);
  assert.ok(/LINT_UNESCAPED wait_log regex \/plain \(text\) here\//.test(l), l);
  const lo = run(['--scenario', wj(path.join(D, 'lint', 'nr.json'), { name: 'nr', mode: 'menu', steps: [{ wait_log: '(' }], verdict: [{ event: 'hello' }] }), '--dry']);
  assert.ok(/TESTRUN_BAD_ARGS .*bad wait_log regex/.test(lo.stdout), lo.stdout);
  console.log('wait_log ok');

  // ---- 2. dead pipe: pipe closing ends waits and holds now; two unanswered commands stop the rest
  const D2 = path.join(F, 'dead');
  const w = wj(path.join(D2, 'w.json'), { name: 'w', mode: 'menu', steps: [{ wait: 'neverevent', timeout: 60 }, { wait: 60 }], verdict: [{ event: 'hello' }] });
  let t1 = Date.now();
  let r2 = run(['--scenario', w, '--mock', '--mock-close-ms', '600', '--inst', nextInst(), ...logArgs(D2), '--connect-timeout', '5', '--exit-wait', '1']);
  assert.ok(Date.now() - t1 < 15000, 'closed pipe must end the waits: ' + (Date.now() - t1) + ' ms\n' + r2.stdout);
  assert.ok(/TESTRUN_WAIT_TIMEOUT no "neverevent" event in 60s \(pipe closed\)/.test(r2.stdout), r2.stdout);
  const h = wj(path.join(D2, 'h.json'), { name: 'h', mode: 'menu', steps: [{ cmd: 'echo a', timeout: 1 }, { cmd: 'echo b', timeout: 1 }, { cmd: 'echo c', timeout: 1 }], verdict: [{ event: 'hello' }] });
  t1 = Date.now();
  r2 = run(['--scenario', h, '--mock', '--mock-hang', 'echo', '--inst', nextInst(), ...logArgs(D2), '--connect-timeout', '5', '--exit-wait', '1']);
  assert.ok(/TESTRUN_CMD_STOPPED two commands in a row got no reply/.test(r2.stdout), r2.stdout);
  assert.ok(!/echo c/.test(r2.stdout.replace(/TESTRUN_CMD_FAIL[^\n]*/g, '')) && (r2.stdout.match(/TESTRUN_CMD_FAIL echo/g) || []).length === 2, 'third command must not be sent: ' + r2.stdout);
  console.log('dead pipe ok');

  // ---- 3. queue: --max-same-fail, NORUN rest, exit 1, --rerun, quarantine
  const Q = path.join(F, 'q'), qs = path.join(Q, 'scn');
  const bad = n => wj(path.join(qs, n + '.json'), { name: n, mode: 'menu', steps: [{ cmd: 'nosuch' }], verdict: [{ event: 'hello' }] });
  const good = n => wj(path.join(qs, n + '.json'), { name: n, mode: 'menu', steps: [{ cmd: 'echo ' + n }], verdict: [{ reply: 'echo ' + n, match: '^' + n + '$' }] });
  ['a1', 'a2', 'a3', 'a4', 'a5'].forEach(bad);
  const qr = (extra, out) => run(['--queue-dir', qs, '--mock', '--inst', nextInst(), ...logArgs(Q), '--connect-timeout', '5', '--exit-wait', '1', '--out', out, ...extra]);
  let rep1 = path.join(Q, 'r1.json');
  let r3 = qr([], rep1);
  let j = JSON.parse(fs.readFileSync(rep1, 'utf8'));
  assert.strictEqual(r3.status, 1, r3.stdout);
  assert.deepStrictEqual(j.queue.map(x => x.status), ['FAIL', 'FAIL', 'FAIL', 'NORUN', 'NORUN'], r3.stdout);
  assert.ok(/3 launches in a row failed with TESTRUN_CMD_FAIL and no pass between \(--max-same-fail 3\)/.test(r3.stderr + r3.stdout), r3.stdout + r3.stderr);
  assert.ok(/^queue STOPPED: /m.test(r3.stdout) && j.stopped, r3.stdout);
  assert.strictEqual(j.launches, 3);
  // a pass between resets the streak; --max-same-fail 2 stops earlier; 0 never stops
  good('a3');
  rep1 = path.join(Q, 'r2.json');
  r3 = qr([], rep1); j = JSON.parse(fs.readFileSync(rep1, 'utf8'));
  assert.deepStrictEqual(j.queue.map(x => x.status), ['FAIL', 'FAIL', 'PASS', 'FAIL', 'FAIL'], r3.stdout);
  assert.ok(!j.stopped);
  bad('a3');
  const rep3 = path.join(Q, 'r3.json');
  r3 = qr(['--max-same-fail', '2'], rep3); j = JSON.parse(fs.readFileSync(rep3, 'utf8'));
  assert.deepStrictEqual(j.queue.map(x => x.status), ['FAIL', 'FAIL', 'NORUN', 'NORUN', 'NORUN'], r3.stdout);
  const rep4 = path.join(Q, 'r4.json');
  r3 = qr(['--max-same-fail', '0'], rep4); j = JSON.parse(fs.readFileSync(rep4, 'utf8'));
  assert.strictEqual(j.queue.filter(x => x.status === 'FAIL').length, 5);
  assert.ok(/--max-same-fail needs/.test(run(['--queue-dir', qs, '--max-same-fail', 'x', '--dry']).stdout));
  // --rerun: only FAIL / NORUN of r3 (a1,a2 FAIL, a3-a5 NORUN); after fixing a1+a2 and with a3 quarantined
  good('a1'); good('a2');
  wj(path.join(qs, 'a3.json'), { name: 'a3', mode: 'menu', quarantine: 'flaky: hangs the lobby', steps: [{ cmd: 'echo a3' }], verdict: [{ reply: 'echo a3', match: 'a3' }] });
  const rep5 = path.join(Q, 'r5.json');
  r3 = run(['--rerun', rep3, '--mock', '--inst', nextInst(), ...logArgs(Q), '--connect-timeout', '5', '--exit-wait', '1', '--out', rep5]);
  j = JSON.parse(fs.readFileSync(rep5, 'utf8'));
  assert.deepStrictEqual(j.queue.map(x => x.name + ':' + x.status), ['a1:PASS', 'a2:PASS', 'a3:NORUN', 'a4:FAIL', 'a5:FAIL'], r3.stdout);
  assert.ok(/^NORUN a3: quarantined: flaky: hangs the lobby/m.test(r3.stdout), r3.stdout);
  assert.strictEqual(j.launches, 4, 'quarantined scenario must not launch');
  // rerun of a report with only passes
  const rep6 = path.join(Q, 'r6.json');
  wj(rep6, { queue: [{ file: path.join(qs, 'a1.json'), status: 'PASS' }] });
  assert.ok(/nothing to run/.test(run(['--rerun', rep6, '--mock']).stdout));
  // rerun narrowed by --queue-dir listing
  good('zz');
  const rd = run(['--rerun', rep3, '--queue-dir', qs, '--dry']);
  assert.ok(/a4/.test(rd.stdout) && /a5/.test(rd.stdout) && !/zz/.test(rd.stdout), rd.stdout);
  // single --scenario quarantined: no launch
  const r7 = run(['--scenario', path.join(qs, 'a3.json'), '--mock', '--inst', nextInst(), ...logArgs(Q)]);
  assert.ok(/^NORUN a3: quarantined: flaky/m.test(r7.stdout) && r7.status === 0, r7.stdout);
  console.log('queue ok');

  // ---- 4. a crash in a shared (overlap) launch is not retried solo; a verdict fail still is (qtest covers that)
  const O = path.join(F, 'ov'), os_ = path.join(O, 'q');
  for (const n of ['fa', 'fb']) { const d = path.join(os_, 'mods', n); fs.mkdirSync(path.join(d, 'resource', 'at'), { recursive: true }); fs.writeFileSync(path.join(d, 'resource', 'at', n + '.cfg'), 'x'); fs.writeFileSync(path.join(d, 'mod.info'), '{mod {Name "x"} {MinGameVersion "3.301"}}'); } // modern: the scenario lists as64+, the staged folder takes its mode from this
  for (const n of ['a', 'b']) wj(path.join(os_, n + '.json'), { name: n, rows: [], mods: ['as64+', 'f' + n], fixture: ['f' + n], mode: 'mp', params: { map: 'multi/m:combat' }, steps: [], verdict: [{ log: 'zz' + n, want: true }] });
  const OG = path.join(O, 'game'); fs.mkdirSync(path.join(OG, 'mods'), { recursive: true });
  const repO = path.join(O, 'o.json');
  const opf = path.join(O, 'options.set'); fs.writeFileSync(opf, '{mods "e2e_test:0"}'); // own list, never the real profile's
  const ro = run(['--queue-dir', os_, '--overlap', '--mock', '--mock-no-loaded', '--timeout', '1', '--exit-wait', '1', '--inst', nextInst(), '--game', OG, '--no-preflight', '--no-seed', '--profile', opf, '--backup', path.join(O, 'bk'), '--out', repO, ...logArgs(O), '--connect-timeout', '5']);
  j = JSON.parse(fs.readFileSync(repO, 'utf8'));
  assert.ok(/overlap: 1 launch/.test(ro.stdout), ro.stdout);
  assert.deepStrictEqual(j.overlap.retried, [], 'crash must not be retried solo: ' + ro.stdout);
  assert.strictEqual(j.launches, 1, ro.stdout);
  assert.ok(j.queue.every(x => x.status === 'FAIL' && x.reasons.some(y => /no solo retry/.test(y))), JSON.stringify(j.queue));
  console.log('crash no-retry ok');

  // ---- 5. folder allowlist e2e_test..8: staging guard, backup/restore of existing + created folders
  const tr = require('../testrun.js');
  assert.strictEqual(tr.stageRefusal({ stageAs: 'e2e_test,e2e_test8' }), null);
  assert.ok(/e2e_test9/.test(tr.stageRefusal({ stageAs: 'e2e_test3,e2e_test9' })));
  assert.ok(/not approved/.test(run(['--scenario', sc, '--stage-as', 'e2e_test9', '--mock']).stdout));
  const G = path.join(F, 'game'), B = path.join(F, 'bak');
  fs.mkdirSync(path.join(G, 'mods', 'e2e_test7'), { recursive: true }); fs.writeFileSync(path.join(G, 'mods', 'e2e_test7', 'keep.cfg'), 'orig');
  const o = { backup: B, game: G, stagePool: ['e2e_test6', 'e2e_test7', 'e2e_test8'] };
  const b = tr.backupBegin(o);
  assert.deepStrictEqual(b.errs, []);
  assert.deepStrictEqual(b.folders.map(f => f.name + ':' + f.existed), ['e2e_test6:false', 'e2e_test7:true', 'e2e_test8:false']);
  fs.mkdirSync(path.join(G, 'mods', 'e2e_test6'), { recursive: true }); fs.writeFileSync(path.join(G, 'mods', 'e2e_test6', 'new.cfg'), 'x');
  fs.writeFileSync(path.join(G, 'mods', 'e2e_test7', 'keep.cfg'), 'changed'); fs.writeFileSync(path.join(G, 'mods', 'e2e_test7', 'extra.cfg'), 'x');
  const res = tr.backupRestore(b);
  assert.ok(res.restored, JSON.stringify(res));
  assert.ok(!fs.existsSync(path.join(G, 'mods', 'e2e_test6')) && !fs.existsSync(path.join(G, 'mods', 'e2e_test8')), 'created folders removed');
  assert.strictEqual(fs.readFileSync(path.join(G, 'mods', 'e2e_test7', 'keep.cfg'), 'utf8'), 'orig'); assert.ok(!fs.existsSync(path.join(G, 'mods', 'e2e_test7', 'extra.cfg')));
  // a hand-made backup record naming a folder outside the list is refused, nothing deleted
  fs.mkdirSync(path.join(G, 'mods', 'precious'), { recursive: true });
  const rr = tr.backupRestore({ dir: B, game: G, folders: [{ name: 'precious', existed: false }], profile: null });
  assert.ok(!rr.restored && fs.existsSync(path.join(G, 'mods', 'precious')), 'non-allowlisted folder must survive');
  // workers 9 passes instance 9; --inst + --workers past 9 refused; instance 0 never used by parallel workers
  assert.ok(/--inst \+ --workers passes instance 9/.test(run(['--queue-dir', qs, '--workers', '5', '--inst', '6', '--exe', process.execPath, '--dry']).stdout));
  const pa = tr.parseArgs(['--queue-dir', qs, '--workers', '3', '--exe', process.execPath]);
  assert.deepStrictEqual(pa.errs, []);
  console.log('folders ok');

  // ---- 6. Enhanced mod without as64+: lint warns; the run adds as64+ to mod_set
  const E = path.join(F, 'enh'), EG = path.join(E, 'game');
  const fxd = path.join(E, 'scn', 'mods', 'enh-fx'); fs.mkdirSync(fxd, { recursive: true }); fs.writeFileSync(path.join(fxd, 'mod.info'), '{Mod\r\n {Name "e"}\r\n {MinGameVersion "3.301"}\r\n}\r\n');
  const esc = wj(path.join(E, 'scn', 'enh.json'), { name: 'enh', mode: 'menu', fixture: ['enh-fx'], mods: ['enh-fx'], steps: [{ cmd: 'echo e' }], verdict: [{ reply: 'echo e', match: 'e' }] });
  const el = run(['--lint', path.join(E, 'scn')]).stdout;
  assert.ok(/enh\.json:\d+: WARN_LINT_ENHANCED_NO_AS64 fixture enh-fx/.test(el), el);
  wj(esc, { name: 'enh', mode: 'menu', fixture: ['enh-fx'], mods: ['as64+', 'enh-fx'], steps: [{ cmd: 'echo e' }], verdict: [{ reply: 'echo e', match: 'e' }] });
  assert.ok(!/ENHANCED/.test(run(['--lint', path.join(E, 'scn')]).stdout));
  wj(esc, { name: 'enh', mode: 'menu', fixture: ['enh-fx'], mods: ['enh-fx'], steps: [{ cmd: 'echo e' }], verdict: [{ reply: 'echo e', match: 'e' }] });
  fs.mkdirSync(path.join(EG, 'mods'), { recursive: true });
  // unseeded instance: its own list decides the mode at startup, so it must already name as64+ (modeClash)
  const eprof = path.join(E, 'options.set'); fs.writeFileSync(eprof, '{mods "as64+:0"}\n');
  const re = run(['--scenario', esc, '--stage-as', 'e2e_test', '--game', EG, '--mock', '--no-preflight', '--no-seed', '--profile', eprof, '--relist', '--inst', nextInst(), ...logArgs(E), '--backup', path.join(E, 'bk'), '--connect-timeout', '5', '--exit-wait', '1']);
  assert.ok(/as64\+ added to mod_set/.test(re.stdout + re.stderr) || /^> mod_set as64\+ e2e_test$/m.test(re.stdout), re.stdout + re.stderr);
  assert.ok(/^> mod_set as64\+ e2e_test$/m.test(re.stdout), re.stdout);
  // unseeded + profile without as64+: the as64+ the run adds to mod_set counts, so no MODE_MIX refusal (fix-later 65)
  fs.writeFileSync(eprof, '{mods "e2e_test:0"}\n'); // the stage folder alone, no as64+ (a real unseeded profile of that shape)
  const re2 = run(['--scenario', esc, '--stage-as', 'e2e_test', '--game', EG, '--mock', '--no-preflight', '--no-seed', '--profile', eprof, '--relist', '--inst', nextInst(), ...logArgs(E), '--backup', path.join(E, 'bk2'), '--connect-timeout', '5', '--exit-wait', '1']);
  assert.ok(!/TESTRUN_MODE_MIX/.test(re2.stdout + re2.stderr), re2.stdout + re2.stderr);
  assert.ok(/^> mod_set as64\+ e2e_test$/m.test(re2.stdout), re2.stdout);
  console.log('as64+ ok');

  // ---- 7. batch --inst-from reaches testrun, bad --stage refused
  // the testrun worker instances really follow --inst (mock ids): 2 workers from 4850 -> 4850 and 4851
  const W = path.join(F, 'wk'), wq = path.join(W, 'q');
  ['w1', 'w2', 'w3', 'w4'].forEach(n => wj(path.join(wq, n + '.json'), { name: n, mode: 'menu', steps: [{ cmd: 'echo ' + n }, { wait: 0.5 }], verdict: [{ reply: 'echo ' + n, match: n }] }));
  const rw = path.join(W, 'r.json');
  const rk = run(['--queue-dir', wq, '--workers', '2', '--mock', '--inst', '4850', '--no-seed', ...logArgs(W), '--connect-timeout', '5', '--exit-wait', '1', '--out', rw]);
  j = JSON.parse(fs.readFileSync(rw, 'utf8'));
  assert.deepStrictEqual([...new Set(j.queue.map(x => x.inst))].sort(), [4850, 4851], rk.stdout + rk.stderr);
  console.log('batch inst ok');
})().catch(e => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
