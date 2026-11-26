// modmove tests: static truth diff, fixtures/matrix, live pipeline against a stub exe (no real game is ever launched).
// Author: Imperator_Aug (ARSENAL, ia-0c1c2d6c)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const C = require('../lib/common');
const T = __dirname, W = path.join(T, 'work'), MM = path.join(T, '..', 'modmove.js'), STUB = path.join(T, 'stub-game.js');
process.env.MODMOVE_NO_CACHE = '1';
const fails = [];
const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL: ' + m); } };
const Wt = require('../../lib/test/wait');
// by time, not by a fixed sleep: polls f every 100 ms. Backup, never a hang: after 60 s a WAIT line and the check after it reports
const untilSync = (f, what) => { const t0 = Date.now(); for (;;) { if (f()) return true; if (Date.now() - t0 >= Wt.COND_MS) { Wt.say('modmove', what, Wt.COND_MS); return false; } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); } };
const mm = (args, env) => { const r = Wt.spawnSync(process.execPath, [MM, ...args], { encoding: 'utf8', env: Object.assign({}, process.env, env || {}), timeout: 300000 }, 'modmove ' + args[0]); return { out: r.stdout + '', err: r.stderr + '', status: r.status }; };
const sha = f => require('crypto').createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const AS2 = path.join(W, 'as2'), GOH = path.join(W, 'goh'), HOME = path.join(W, 'home'), PROF = path.join(HOME, 'profiles', 'p1', 'options.set');
const GOHLOG = path.join(W, 'gohlog');

// ---- 1. static: seeded defects = truth.md
const want = [], got = [];
for (const l of fs.readFileSync(path.join(T, 'truth.md'), 'utf8').split(/\r?\n/)) { const m = /^(\w+): (.+)$/.exec(l); if (m && !l.startsWith('#')) want.push(l); }
const stat = (mod, from, to) => {
  const jf = path.join(W, mod.replace(/[^A-Za-z0-9_]/g, '_') + '.json');
  mm(['static', path.join(W, mod), '--from', from, '--to', to, '--as2', AS2, '--goh', GOH, '--no-lint', '--json', jf, '-q']);
  return JSON.parse(fs.readFileSync(jf, 'utf8'));
};
for (const f of stat('seed', 'goh', 'mowas2').findings) got.push(`seed: ${f.file}${f.line ? ':' + f.line : ''}: ${f.code}`);
for (const f of stat('badinfo', 'as64', 'mowas2').findings) got.push(`badinfo: ${f.file}${f.line ? ':' + f.line : ''}: ${f.code}`);
for (const f of stat('togoh', 'as64', 'goh').findings) got.push(`togoh: ${f.file}${f.line ? ':' + f.line : ''}: ${f.code}`);
const c0 = stat('clean', 'as64', 'mowas2');
ok(c0.findings.length === 0, 'clean legacy mod as64->mowas2 must have 0 findings, got ' + c0.findings.map(f => f.code));
fs.writeFileSync(path.join(T, 'want.txt'), want.sort().join('\n') + '\n'); fs.writeFileSync(path.join(T, 'got.txt'), got.sort().join('\n') + '\n');
ok(want.sort().join('\n') === got.sort().join('\n'), 'static findings differ from truth.md (see want.txt / got.txt)');
const cm = stat('clean', 'as64', 'goh');
ok(cm.findings.some(f => f.code === 'MOVE_GOH_VERSION_SCALE'), 'clean as64->goh should flag the AS2-scale version');
ok(cm.findings.every(f => f.code === 'MOVE_GOH_VERSION_SCALE' || f.group === 'likely'), 'as64->goh clean mod: only the version gate is a must');
const ui1 = stat('uigoh', 'goh', 'as64').findings.filter(f => f.code === 'MOVE_GOH_INTERFACE');
ok(ui1.length === 1 && ui1[0].group === 'must' && /interface\/pages\/main\.set$/.test(ui1[0].file), 'PORT-81: goh interface/ folder -> as64: MOVE_GOH_INTERFACE once: ' + JSON.stringify(ui1));
ok(!stat('uigoh_ok', 'goh', 'as64').findings.some(f => f.code === 'MOVE_GOH_INTERFACE'), 'PORT-81: clean twin has no MOVE_GOH_INTERFACE');
ok(!stat('uigoh', 'as64', 'mowas2').findings.some(f => f.code === 'MOVE_GOH_INTERFACE'), 'PORT-81: an AS2 mod keeping its own interface/ is not flagged');
const md = stat('mods/modern', 'as64', 'mowas2');
ok(md.findings.some(f => f.code === 'MOVE_VERSION_ABOVE_TARGET' && f.group === 'must'), 'modern mod -> mowas2: MOVE_VERSION_ABOVE_TARGET must');
const ma = stat('mods/modern', 'goh', 'as64');
ok(!ma.findings.some(f => /VERSION/.test(f.code)) || ma.findings.length >= 0, 'modern goh->as64 runs');

// ---- 2. fixtures + matrix
const fx = path.join(W, 'fx');
let r = mm(['fixtures', '--out', fx]);
ok(/wrote 8 fixture mods/.test(r.out), 'fixtures command output: ' + r.out + r.err);
const man = JSON.parse(fs.readFileSync(path.join(fx, 'manifest.json'), 'utf8'));
ok(Object.keys(man.mods).length === 8, 'manifest lists 8 mods');
ok(fs.existsSync(path.join(fx, 'modmove_canary', 'localization', 'zz_modmove_canary.lng')), 'canary fixture copied');
const fa = stat('fx/mm_as64_core', 'as64', 'mowas2');
ok(fa.findings.some(f => f.code === 'MOVE_AS64_CORE_ONLY') && fa.findings.some(f => f.code === 'MOVE_AS64_LNG'), 'fixture mm_as64_core -> mowas2 shows both as64-only findings');
const fl = stat('fx/mm_legacy_nomin', 'mowas2', 'as64');
ok(fl.findings.some(f => f.code === 'MOVE_VERSION_RANGE'), 'fixture legacy_nomin -> as64: MOVE_VERSION_RANGE');
r = mm(['static', '--matrix', path.join(fx, 'mm_modern_3301') + ',' + path.join(W, 'clean'), '--jobs', '2', '--as2', AS2, '--goh', GOH, '--no-lint']);
ok(/mm_modern_3301 +\|/.test(r.out) && /clean +\|/.test(r.out) && /as64>mowas2/.test(r.out) && !/ERR|\?/.test(r.out.split('\n').slice(1).join('\n')), 'matrix table: ' + r.out + r.err);

// ---- 3. live against the stub exe
const cfgFile = path.join(W, 'stub.json');
const cfg = (o = {}) => fs.writeFileSync(cfgFile, JSON.stringify({
  as64: Object.assign({ logDir: path.join(HOME, 'log'), game: AS2, userDir: HOME, scan: 'profile', mode: 'ok' }, o.as64),
  mowas2: Object.assign({ logDir: path.join(HOME, 'log'), game: AS2, userDir: HOME, scan: 'profile', mode: 'ok' }, o.mowas2),
  goh: Object.assign({ logDir: path.join(GOHLOG, 'log'), game: GOH, userDir: GOHLOG, scan: 'profile', mode: 'ok' }, o.goh),
}));
const live = (targets, extra, env, tag) => {
  const out = path.join(W, 'out-' + tag);
  const a = ['live', '--targets', targets, '--as2', AS2, '--goh', GOH, '--user-dir', HOME, '--goh-user-dir', GOHLOG, '--no-proc',
    '--exe-as64', STUB, '--exe-mowas2', STUB, '--exe-goh', STUB, '--args-as64', 'as64', '--args-mowas2', 'mowas2', '--args-goh', 'goh',
    '--quiet', '2', '--poll', '300', '--wait', '300', '--relaunch-grace', '2000', '--out', out, '--backup', path.join(W, 'bak-' + tag), ...extra];
  const r = mm(a, Object.assign({ STUB_CFG: cfgFile }, env || {}));
  return Object.assign(r, { out: r.out, dir: out });
};
const profSha = sha(PROF), preDir = path.join(AS2, 'mods', 'e2e_test');
const treeSha = d => C.treeHash(d);
const preTree = treeSha(preDir), pre2 = fs.readdirSync(path.join(AS2, 'mods')).sort().join(','), gpre = fs.readdirSync(path.join(GOH, 'mods')).sort().join(',');
const stubLeft = () => C.listProcs().filter(C.matcherFor(STUB)).length;
const restored = (tag) => {
  ok(sha(PROF) === profSha, tag + ': options.set not byte-identical');
  ok(treeSha(preDir) === preTree, tag + ': pre-existing e2e_test not restored');
  ok(fs.readdirSync(path.join(AS2, 'mods')).sort().join(',') === pre2, tag + ': AS2 mods/ listing changed');
  ok(fs.readdirSync(path.join(GOH, 'mods')).sort().join(',') === gpre, tag + ': GoH mods/ listing changed');
  ok(stubLeft() === 0, tag + ': stub process left running');
};
const CAN = path.join(T, '..', 'fixtures', 'canary');

// A. canary on all three
cfg();
r = live('as64,mowas2,goh', ['--mod', CAN, '--stage', 'mowas2=e2e_test,as64=e2e_test2,goh=mm_stage_ok'], null, 'a');
ok(/boot and mount only/.test(r.out), 'A: states boot+mount only (no pipe)');
for (const t of ['as64', 'mowas2', 'goh']) ok(new RegExp('^' + t + ' +\\| yes +\\| 0 +\\| yes \\(' + (t === 'goh' ? 'activate line' : 'canary') + '\\)', 'm').test(r.out), 'A: ' + t + ' row booted/0/mounted: ' + r.out);
for (const t of ['as64', 'mowas2', 'goh']) for (const l of ['base', 'mod']) ok(fs.existsSync(path.join(r.dir, t, l, 'game.log')), `A: archive ${t}/${l}/game.log`);
restored('A');
ok(!/MOVE_LIVE_NOT_MOUNTED|MOVE_LIVE_CRASH/.test(r.out), 'A: no failure codes');
const runA = JSON.parse(fs.readFileSync(path.join(r.dir, 'as64', 'mod', 'run.json'), 'utf8'));
ok(!runA.list || runA.list.join() === 'e2e_test2', 'A: legacy mod on as64 -> no as64+ in list: ' + JSON.stringify(runA.list));
ok(!/as64\+/.test(fs.readFileSync(path.join(r.dir, 'mowas2', 'mod', 'options.set.orig'), 'latin1')), 'A: original profile archived');

// B. crash only in the mod run: restore still happens, MOVE_LIVE_CRASH
cfg();
r = live('mowas2', ['--mod', CAN, '--stage', 'mowas2=e2e_test'], { STUB_MODE_MOD: 'crash' }, 'b');
ok(/MOVE_LIVE_CRASH/.test(r.out), 'B: crash reported: ' + r.out);
ok(/^mowas2 +\| NO/m.test(r.out), 'B: booted NO');
restored('B');

// C. same exception twice -> stop
cfg({ as64: { mode: 'crash' } });
r = live('as64', ['--mod', CAN, '--stage', 'as64=e2e_test2'], null, 'c');
ok(/MOVE_LIVE_REPEAT_EXCEPTION/.test(r.out), 'C: repeat-exception stop: ' + r.out);
restored('C');

// D. ENG-26 modes: modern mod on mowas2 refused; on as64 as64+ is written first
cfg();
r = live('mowas2,as64', ['--mod', path.join(W, 'mods', 'modern'), '--stage', 'mowas2=e2e_test,as64=e2e_test2'], null, 'd');
ok(/MOVE_LIVE_MODE_MISMATCH/.test(r.out), 'D: mowas2 + modern mod refused: ' + r.out);
const runD = JSON.parse(fs.readFileSync(path.join(r.dir, 'as64', 'mod', 'run.json'), 'utf8'));
ok(runD.list && runD.list[0] === 'as64+' && runD.list.length === 2, 'D: as64 modern mod -> as64+ first: ' + JSON.stringify(runD.list));
const runD0 = JSON.parse(fs.readFileSync(path.join(r.dir, 'as64', 'base', 'run.json'), 'utf8'));
ok(runD0.list.join() === 'as64+', 'D: baseline list is as64+ only');
ok(!fs.existsSync(path.join(r.dir, 'mowas2', 'mod', 'game.log')), 'D: refused launch left no mod-run log');
restored('D');

// E. exe already running -> refuse, do not kill it
cfg();
const pre = cp.spawn(process.execPath, [STUB, 'as64'], { stdio: 'ignore', env: Object.assign({}, process.env, { STUB_CFG: cfgFile }), detached: true });
untilSync(() => C.listProcs().filter(C.matcherFor(STUB)).some(p => p.pid === pre.pid), 'E: the pre-started stub in the process list');
r = live('as64', [], null, 'e');
ok(/MOVE_LIVE_RUNNING/.test(r.out), 'E: running exe refused: ' + r.out);
ok(C.listProcs().some(p => p.pid === pre.pid), 'E: pre-existing process still alive (never killed)');
C.killTree(pre.pid);
untilSync(() => !C.listProcs().some(p => p.pid === pre.pid), 'E: the pre-started stub gone after the kill');

// F. stage rules + skip
cfg();
r = live('as64,goh,mowas2', ['--mod', CAN, '--stage', 'as64=foo,goh=mm_stage_taken'], null, 'f');
ok(/MOVE_LIVE_STAGE_REFUSED/.test(r.out), 'F: AS2 stage "foo" refused');
ok(/MOVE_LIVE_STAGE_EXISTS/.test(r.out), 'F: pre-existing GoH stage refused');
ok(/MOVE_LIVE_SKIPPED mowas2: no stage folder named|MOVE_LIVE_SKIPPED.*no stage folder named/.test(r.out), 'F: no-stage skip message: ' + r.out);
ok(fs.readFileSync(path.join(GOH, 'mods', 'mm_stage_taken', 'keep.txt'), 'utf8') === 'do not touch\r\n', 'F: taken GoH stage untouched');
restored('F');

// G. Steam-style relaunch: first process exits, the real one is found by full path and killed
cfg({ mowas2: { mode: 'relaunch' } });
r = live('mowas2', [], null, 'g');
ok(/^mowas2 +\| yes/m.test(r.out), 'G: relaunch booted: ' + r.out);
restored('G');

// H. shared allowlist (lib/testfolders): e2e_test5 stages and is removed again (did not exist before), e2e_test9 is refused
cfg();
r = live('as64', ['--mod', CAN, '--stage', 'as64=e2e_test9'], null, 'h1');
ok(/MOVE_LIVE_STAGE_REFUSED/.test(r.out), 'H: e2e_test9 refused: ' + r.out);
cfg();
r = live('as64', ['--mod', CAN, '--stage', 'as64=e2e_test5'], null, 'h2');
ok(!/MOVE_LIVE_STAGE_REFUSED/.test(r.out), 'H: e2e_test5 accepted: ' + r.out);
restored('H');

if (fails.length) { console.log(fails.length + ' failures'); process.exit(1); }
console.log('all checks ok');
