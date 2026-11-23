// testrun per game: mowas_2.exe (TST-19) and call_to_arms.exe (goh-drive.md) have no control pipe: a live run is refused with one line,
// exit 2; --dry still prints the plan (GoH log dir = the GoH user dir); as64.exe / no exe unchanged. Plus lib/testfolders per game.
// The exe paths are made up and do not exist: nothing can start.
// Author: Imperator_Aug (ARSENAL, ia-421f9743)
const path = require('path'), os = require('os'), assert = require('assert'), { spawnSync } = require('child_process');
const T = require('../testrun'), TF = require('../../lib/testfolders');
const tr = path.join(__dirname, '..', 'testrun.js');
const fake = name => path.join(os.tmpdir(), 'no-such-testrun-game', name);
const run = (...a) => spawnSync(process.execPath, [tr, ...a], { encoding: 'utf8' });

// exe file -> game
assert.strictEqual(T.gameOfExe(fake('as64.exe')), 'as64');
assert.strictEqual(T.gameOfExe(fake('MOWAS_2.EXE')), 'mowas2');
assert.strictEqual(T.gameOfExe(fake('mowas_2_ed.exe')), 'mowas2');
assert.strictEqual(T.gameOfExe(fake('binaries/x64/call_to_arms.exe')), 'goh');
assert.strictEqual(T.gameOfExe(fake('call_to_arms_ed.exe')), 'goh');
assert.strictEqual(T.gameOfExe('fakegame.js'), null);
assert.strictEqual(T.gameOfExe(undefined), null);
assert.strictEqual(T.gameOfExe(fake('other.exe')), null);

// live run refused, one line, exit 2, for every mode
for (const [exe, name, row] of [['mowas_2.exe', 'MoW:AS2', 'TST-19'], ['call_to_arms.exe', 'GoH', 'modweb/testing/goh-drive.md']]) {
  for (const mode of [['--map', 'm'], ['--probe'], ['--scenario', path.join(__dirname, '..', 'scenarios', 'modlist.json')]]) {
    const r = run(...mode, '--exe', fake(exe));
    assert.strictEqual(r.status, 2, `${exe} ${mode[0]}: exit ${r.status} ${r.stdout}${r.stderr}`);
    const lines = r.stderr.trim().split(/\r?\n/);
    assert.strictEqual(lines.length, 1, `${exe}: one line: ${r.stderr}`);
    assert.match(lines[0], new RegExp(`^testrun: not available for ${name.replace(/[.:]/g, '\\$&')}: .*no control pipe.*inplay-nopipe\\.js --target (mowas2|goh)\\) \\(${row.replace(/[./]/g, '\\$&')}\\)$`));
    assert.strictEqual(r.stdout, '', 'nothing else printed');
  }
  // --dry: the plan, plus the line on stderr
  const d = run('--map', 'm', '--exe', fake(exe), '--dry', '--logdir', 'L', '--archive', 'A');
  assert.strictEqual(d.status, 0, d.stderr);
  assert.match(d.stderr, /plan only: nothing is started/);
  // no pipe: the plan says so, the spawn line has no pipe flags, the triage line reads the log by this game's rules
  const id = T.gameOfExe(fake(exe)), vx = id === 'goh' ? 'goh' : 'mowas_2';
  assert.match(d.stdout, new RegExp('^pipe: none \\(' + name.replace(/[.:]/g, '\\$&') + ' has no control pipe', 'm'));
  assert.doesNotMatch(d.stdout, /\\\\\.\\pipe\\as64|as64\.\d+\.sock/);
  const sp = d.stdout.split(/\r?\n/).find(l => /^2\. spawn: /.test(l));
  assert(sp && !/-control|-console|-instance/.test(sp), 'spawn line: ' + sp);
  assert.match(d.stdout, new RegExp('^4\\. triage: node tools/logtriage/logtriage\\.js L -q --summary --exe ' + vx + '$', 'm'));
  assert.deepStrictEqual(T.triageExe({ gameId: id }), ['--exe', vx]);
  assert.deepStrictEqual(T.exeArgs({ gameId: id, inst: 3, noMods: true }), ['-nosound', '-no_mods']);
}
// as64: the triage line and the exe flags as before (no --exe for logtriage)
assert.deepStrictEqual(T.triageExe({ gameId: null }), []); assert.deepStrictEqual(T.triageExe({ gameId: 'as64' }), []);
assert.deepStrictEqual(T.exeArgs({ gameId: 'as64', inst: 3 }), ['-control', '-nosound', '-console', '-instance', '3']);
{
  const d = run('--map', 'm', '--exe', fake('as64.exe'), '--dry', '--logdir', 'L', '--archive', 'A');
  assert.match(d.stdout, /^pipe: \\\\\.\\pipe\\as64\.0$/m); assert.match(d.stdout, /^4\. triage: node tools\/logtriage\/logtriage\.js L -q --summary$/m);
}
// as64.exe: not refused (the missing exe is reported as before)
const a = run('--map', 'm', '--exe', fake('as64.exe'), '-q');
assert.notStrictEqual(a.status, 2); assert.match(a.stdout, /TESTRUN_NO_EXE exe not found/); assert.doesNotMatch(a.stderr, /not available/);
// GoH --dry with no --logdir: the GoH user dir. Two made-up homes: only LocalAppData (as on a OneDrive machine), and
// Documents/My Games/Gates of Hell (a machine without OneDrive: GetUserDir takes Documents, LOG-22)
const o = T.parseArgs(['--map', 'm', '--exe', fake('call_to_arms.exe'), '--dry']);
assert.strictEqual(o.gameId, 'goh');
for (const rel of [['AppData', 'Local', 'Digitalmindsoft', 'Gates of Hell'], ['Documents', 'My Games', 'Gates of Hell']]) {
  const fs = require('fs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'testrun-gohhome-'));
  try {
    const gl = path.join(home, ...rel);
    fs.mkdirSync(gl, { recursive: true });
    // Documents case: the LocalAppData folder exists too, so a plan that took the wrong one of the two would fail below
    if (rel[0] === 'Documents') fs.mkdirSync(path.join(home, 'AppData', 'Local', 'Digitalmindsoft', 'Gates of Hell'), { recursive: true });
    const env = Object.assign({}, process.env); delete env.LOCALAPPDATA; delete env.AS2_HOME;
    const g = spawnSync(process.execPath, [tr, '--map', 'm', '--exe', fake('call_to_arms.exe'), '--dry', '--home', home], { encoding: 'utf8', env });
    assert.strictEqual(g.status, 0, g.stderr);
    const logd = path.join(gl, 'log').toLowerCase(); // Windows paths: case does not matter (lib/userdir spells the folder in lower case)
    const has = kind => g.stdout.split(/\r?\n/).some(l => new RegExp('^\\d+\\. ' + kind + ': ').test(l) && l.toLowerCase().includes(logd));
    assert(has('archive'), 'archive names the GoH log dir: ' + g.stdout);
    assert(has('triage'), 'triage names the GoH log dir: ' + g.stdout);
    assert.doesNotMatch(g.stdout, /men of war - assault squad 2/i, 'no AS2 user dir under GoH');
    assert.match(g.stdout, /^4\. triage: .* --exe goh$/m, 'triage reads the GoH log by GoH rules');
    if (rel[0] === 'Documents') assert(!g.stdout.toLowerCase().includes(path.join(home, 'AppData').toLowerCase()), 'Documents taken, not LocalAppData: ' + g.stdout);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
assert.strictEqual(T.pipeRefusal(T.parseArgs(['--map', 'm', '--dry'])), null, 'no exe: as64 rules');

// lib/testfolders: instances only on as64; no game named = as before
assert.strictEqual(TF.instFor(2), 2); assert.strictEqual(TF.instFor(2, 3), 4); assert.strictEqual(TF.instFor(9, 2), null);
assert.strictEqual(TF.instFor(2, 1, 'as64'), 2);
assert.strictEqual(TF.instFor(1, 1, 'mowas2'), null); assert.strictEqual(TF.instFor(1, 1, 'mowas_2'), null);
assert.strictEqual(TF.instFor(1, 1, 'goh'), null); assert.strictEqual(TF.instFor(1, 1, 'nope'), null);
assert.strictEqual(TF.hasInstances(), true); assert.strictEqual(TF.hasInstances('as64'), true);
assert.strictEqual(TF.hasInstances('goh'), false); assert.strictEqual(TF.hasInstances('mowas2'), false);
assert.strictEqual(TF.forWorker(1), 'e2e_test'); assert.strictEqual(TF.refusal('e2e_test,x'), 'folder(s) x not approved: only e2e_test, e2e_test2, e2e_test3, e2e_test4, e2e_test5, e2e_test6, e2e_test7, e2e_test8 may be staged or restored');
// scenario "game" (rows2scn --exe mowas2 drafts): made-up scenarios in scen7
const S7 = f => path.join(__dirname, 'scen7', f);
{
  const d = run('--scenario', S7('m2log.json'), '--dry', '--logdir', 'L', '--archive', 'A');
  assert.strictEqual(d.status, 0, d.stdout + d.stderr);
  assert.match(d.stderr, /^testrun: not available for MoW:AS2: .*\(TST-19\) \(plan only: nothing is started\)$/m, 'the game comes from the scenario');
  assert.match(d.stdout, /^pipe: none \(MoW:AS2/m); assert.match(d.stdout, /^2\. spawn: <mowas_2\.exe> -nosound$/m);
  assert.match(d.stdout, /"cmd":"mod_set trs_x"/); assert.doesNotMatch(d.stdout, /as64\+/, 'no as64+ in mod_set');
  assert.match(d.stdout, /--summary --exe mowas_2$/m);
  // an exe of another game: refused; a live run (any exe): the one refusal line, exit 2, nothing started
  const m = run('--scenario', S7('m2log.json'), '--exe', fake('as64.exe'), '--dry', '-q');
  assert.strictEqual(m.status, 1); assert.match(m.stdout, /TESTRUN_BAD_ARGS .*the scenario is for MoW:AS2, --exe as64\.exe is AS64/);
  const l = run('--scenario', S7('m2log.json'), '--exe', fake('stand.js'));
  assert.strictEqual(l.status, 2); assert.strictEqual(l.stdout, ''); assert.match(l.stderr, /^testrun: not available for MoW:AS2: .*\(TST-19\)\s*$/);
  // pipe steps and as64+ in a MoW:AS2 scenario are refused (mowas_2 spelling too)
  const p = run('--scenario', S7('m2pipe.json'), '--dry', '-q');
  assert.strictEqual(p.status, 1);
  for (const re of [/step cmd "mod_list" needs the control pipe: MoW:AS2 has none \(TST-19\)/, /step wait event loaded needs/, /reply verdict "mod_list" needs/, /event verdict loaded needs/, /"mods" names as64\+/]) assert.match(p.stdout, re);
  // --lint
  const L = run('--lint', path.join(__dirname, 'scen7'), '-q');
  assert.strictEqual(L.status, 1);
  assert.strictEqual((L.stdout.match(/ LINT_NO_PIPE /g) || []).length, 4, L.stdout);
  for (const c of ['LINT_GAME "game" must be one of', 'LINT_GAME_AS64', 'WARN_LINT_GAME_VERSION fixture trs_m']) assert(L.stdout.includes(c), c + ': ' + L.stdout);
  assert.doesNotMatch(L.stdout, /m2log\.json/, 'a game.log-only MoW:AS2 scenario is clean');
  assert.doesNotMatch(L.stdout, /WARN_LINT_ENHANCED_NO_AS64/, 'no as64+ advice for MoW:AS2');
  // a live queue: the MoW:AS2 scenario is NORUN with the refusal, nothing launched
  const q = run('--queue', S7('m2log.json'), '--exe', fake('stand.js'), '-q');
  assert.strictEqual(q.status, 0, q.stdout + q.stderr);
  assert.match(q.stdout, /^NORUN m2log: .*testrun: not available for MoW:AS2: .*\(TST-19\)$/m); assert.match(q.stdout, /0 launch\(es\).*1 NORUN/);
  // the parts, in-process
  assert.deepStrictEqual(T.scenarioGame({ game: 'mowas_2' }), { id: 'mowas2' }); assert.strictEqual(T.scenarioGame({}), null);
  assert.deepStrictEqual(T.pipeNeeds({ steps: [{ wait: 3 }, { wait_log: 'x' }], verdict: [{ log: 'x' }, { exit: true }] }), []);
  // seed list: as64+ never added for MoW:AS2; as before for as64
  assert.deepStrictEqual(T.seedList([], null), ['as64+:0']); assert.deepStrictEqual(T.seedList([], null, false), []);
  assert.deepStrictEqual(T.seedList(['a'], null, false), ['a:0']);
  // --dry --queue and --dry --matrix: the scenario's "game" picks the plan, as with --scenario (no exe named)
  for (const args of [['--queue', S7('m2log.json')], ['--matrix', S7('m2log.json')]]) {
    const dq = run('--dry', ...args);
    assert.strictEqual(dq.status, 0, args[0] + ': ' + dq.stdout + dq.stderr);
    assert.match(dq.stdout, /^pipe: none \(MoW:AS2 has no control pipe/m, args[0] + ': ' + dq.stdout);
    assert.doesNotMatch(dq.stdout, /\\\\\.\\pipe\\as64|-control|-console/, args[0]);
    assert.match(dq.stdout, /^4\. triage: .* --summary --exe mowas_2$/m, args[0]);
  }
  // --dry --queue with an exe of another game: the FAIL row is printed and the exit is 1 (was silent, exit 0), as --dry --matrix does
  for (const [exe, name] of [['as64.exe', 'AS64'], ['call_to_arms.exe', 'GoH']]) {
    const dm = run('--dry', '--queue', S7('m2log.json'), '--exe', fake(exe));
    assert.strictEqual(dm.status, 1, exe + ': ' + dm.stdout + dm.stderr);
    assert.match(dm.stdout, new RegExp('^FAIL m2log: .*the scenario is for MoW:AS2, --exe ' + exe.replace('.', '\\.') + ' is ' + name, 'm'), dm.stdout);
  }
  // a template that needs a --param stays NORUN in a dry queue: printed, exit 0
  {
    const fs = require('fs'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'testrun-dq-')), f = path.join(d, 'tpl.json');
    fs.writeFileSync(f, JSON.stringify({ name: 'tpl', map: 'm', steps: [{ wait: 1 }], verdict: [{ log: 'unit {WORD} ready' }] }));
    try {
      const dt = run('--dry', '--queue', f);
      assert.strictEqual(dt.status, 0, dt.stdout + dt.stderr);
      assert.match(dt.stdout, /^NORUN tpl: .*param/m, dt.stdout);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  }
  // scenarios of different games never share a launch (overlap and sameLaunch keys)
  const OV = require('../overlap');
  assert.notStrictEqual(OV.keyOf({ mode: 'menu', game: 'mowas2' }), OV.keyOf({ mode: 'menu' }));
  assert.strictEqual(OV.keyOf({ mode: 'menu', game: 'as64' }), OV.keyOf({ mode: 'menu' }));
  // --inst 3 under a game with no -instance: the log dir is the one user dir, never '... - instance 3'
  for (const exe of ['mowas_2.exe', 'call_to_arms.exe']) {
    const di = run('--dry', '--map', 'm', '--inst', '3', '--exe', fake(exe));
    assert.strictEqual(di.status, 0, di.stderr);
    assert.doesNotMatch(di.stdout, / - instance 3/, exe + ' --inst 3: ' + di.stdout);
    assert.doesNotMatch(di.stdout.split(/\r?\n/).find(l => /^2\. spawn: /.test(l)) || '', /-instance/);
  }
}
// as64 keeps its instance folder
{
  const fs = require('fs'), home = fs.mkdtempSync(path.join(os.tmpdir(), 'testrun-inst-'));
  for (const s of ['', ' - instance 3']) fs.mkdirSync(path.join(home, 'Documents', 'my games', 'men of war - assault squad 2' + s, 'log'), { recursive: true });
  try {
    const da = run('--dry', '--map', 'm', '--inst', '3', '--exe', fake('as64.exe'), '--home', home);
    assert.strictEqual(da.status, 0, da.stderr);
    assert.match(da.stdout, /^4\. triage: .*men of war - assault squad 2 - instance 3[\\/]log -q --summary$/m, da.stdout);
    const dm = run('--dry', '--map', 'm', '--inst', '3', '--exe', fake('mowas_2.exe'), '--home', home);
    assert.match(dm.stdout, /^4\. triage: .*men of war - assault squad 2[\\/]log -q --summary --exe mowas_2$/m, dm.stdout);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
console.log('games: ok');
