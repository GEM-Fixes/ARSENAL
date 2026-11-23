#!/usr/bin/env node
// testrun: one command for an in-game test run through the engine's control pipe (\\.\pipe\as64.<inst>, JSON lines {id,cmd}).
// usage: node tools/testrun/testrun.js --map <map|multi/map:mode> [--exe <mowas exe>] [--players n] [--mods a,b] [--hold secs | --wait-over]
//          [--archive dir] [--logdir dir] [--inst n] [--timeout secs] [--connect-timeout secs] [--no-mods] [--sound]
//          [--dry | --mock] [-q] [--summary]
//        node tools/testrun/testrun.js --probe [--exe ..]                       (no map: hello, pipe_events all, mod_list, mp_state, q)
//        node tools/testrun/testrun.js --scenario <file.json> [--param k=v ..] [--map m] [--mission m] [--exe ..]
//        node tools/testrun/testrun.js --matrix <dir|file,..> [--maps a,b] [--modsets "a,b;c"] [--instances N] [--format md|json] [--out f]
//   plan: archive logs (copy, never delete) -> spawn exe -control -nosound -console [-instance N when --inst>0] -> connect+retry -> pipe_events all ->
//         [mod_set <mods>] -> mp_lan -> mp_host <map> [n] -> mp_ready -> mp_start -> wait event `loaded` -> hold / wait game_over
//         -> mp_state -> mp_result -> q -> logtriage on the log dir -> one summary
//   --dry (default without --exe): print plan + exact pipe lines, launch nothing.   --mock: test only, in-process fake server.
//   --logdir default: <Documents>/my games/men of war - assault squad 2/log (OneDrive Documents tried too); a GoH exe: the GoH user dir's log/
//   game of --exe (lib/games, by file name; _ed builds too): as64.exe = the pipe runs above. mowas_2.exe (TST-19: no -control/-console/-instance)
//     and call_to_arms.exe (GoH: no pipe, have no control pipe: a live run exits 2 with one line
//     "testrun: not available for <game>: ..."; --dry prints the plan (with that line on stderr), --mock and --lint work as for as64.
//     The no-pipe in-play route for both: scenarios/inplay-nopipe.js. Their plan prints "pipe: none", no -control/-console/-instance
//     on the spawn line and logtriage --exe mowas_2|goh on the triage line (the log dir per game: lib/userdir logDirFor).
//   scenario "game": "as64"|"mowas2"|"mowas_2"|"goh" (rows2scn --exe mowas2 drafts): names the game when --exe does not (an exe of
//     another game -> TESTRUN_BAD_ARGS); mowas2/goh: a command step, stage/event wait, reply or event verdict is refused (TST-19 / no pipe),
//     "mods" may not name as64+ and testrun never adds it (no as64+ in mod_set or the seeded list); --lint: LINT_GAME LINT_NO_PIPE
//     LINT_GAME_AS64 WARN_LINT_GAME_VERSION (a 3.301 fixture in a MoW:AS2 scenario); in a live queue such a scenario is NORUN.
//   early exit / no pipe: the fresh game.log is read: Exception block -> TESTRUN_ENGINE_EXCEPTION (message, src file:line, `> file` resource;
//     mods/*/mod.info -> ENG-24 hint), CMD: line without -control -> WARN_TESTRUN_NO_CONTROL_FLAG
//   --probe: every raw pipe line -> <archive>/<stamp>/pipe.jsonl ({t,dir,raw}); summary = commands answered vs errored (errors are not findings)
//   --scenario: {name, rows:[ids], mods:[..], mode:"menu"|"sp"|"mp", mission?, map?, players?, params?:{k:v ("" = required)},
//     steps:[{cmd, expect?: regex on reply, wait?: event name | secs}], verdict:[{log: regex, want: bool, row?} | {exit: bool, within?: secs, row?}]}
//     {key} in cmd/expect/log is replaced from params (--param k=v, --map, --mission). Prints VERDICT PASS|FAIL lines and `ROW <id> PASS|FAIL` (rows note; scenario field "manual": "<what to look at>" turns PASS into MANUAL)
//   --stage-as <folder>[,folder2..] [--no-preflight] [--relist]: before spawn, install.js copies fixture i of the scenario into <game>/mods/<folder i> (an approved
//     test folder, e.g. e2e_test) and drops the fixture from mod_set; then preflight lints it (lnglint + vfs mount, Enhanced beside as64+):
//     any non-WARN finding -> TESTRUN_PREFLIGHT, no launch (scenario "preflight": false skips). The game can drop <folder> from options.set {mods}
//     on exit: spawn refuses (TESTRUN_STAGE) unless listed; --relist re-adds it via modswitch --write. In game, mod_list must show <folder>
//     applied:true before any step, else TESTRUN_STAGE abort (a "file not found" expectation would pass falsely on an unmounted mod)
//   steps also: {wait_log:"<regex>", timeout:<s, default 45>} polls this launch's game.log (lines since the last command was sent) and goes on at the first match;
//     timeout -> TESTRUN_WAITLOG_TIMEOUT (non-fatal). --lint checks its regex. {wait:<secs>} stays a plain sleep (use it only where the time span is the test).
//   scenario "quarantine":"<reason>" -> never launched, NORUN with the reason (queue and --scenario). scenario mods: a modern (3.301+) staged mod gets as64+ added to mod_set;
//     --lint warns WARN_LINT_ENHANCED_NO_AS64 when the scenario forgot it
//   --matrix: scenarios x --maps (mp mode only) x --modsets, N parallel instances (--inst base + slot, exe -instance), md/json table with archive dir + triage counts
//   queue extras: --max-same-fail N (default 3; 0 = off): N launches in a row failing with the same harness reason code(s), no pass between -> stop, rest NORUN, exit 1
//     --rerun <queue report.json> [--queue list]: only the FAIL/NORUN scenarios of that report. A crash/hang of a shared (overlap) launch is never retried solo.
//     --workers N (1..9): worker w = game instance (--inst|1)+w-1 (never instance 0), stage folders from the pool lib/testfolders.js (e2e_test, e2e_test2..e2e_test8)
//   crash/hang watch (lib/gamewatch, --hang-sec N, default 60): Exception dialog, silent death or a frozen game ends the run at once, log settled, own process killed; TESTRUN_CRASH TESTRUN_HANG
//   waits: loaded 120 s default (--timeout); pipe closed / process exited ends any wait now; after a command gets no reply with the game gone, or two in a row, no more commands are sent
// codes: TESTRUN_WAITLOG_TIMEOUT TESTRUN_CMD_STOPPED TESTRUN_NO_EXE TESTRUN_RUNNING (LOG-01) TESTRUN_NO_PIPE TESTRUN_CMD_FAIL TESTRUN_LOAD_TIMEOUT TESTRUN_OVER_TIMEOUT
//   TESTRUN_SESSION_FAILED TESTRUN_OOS TESTRUN_PROTOCOL TESTRUN_BAD_ARGS TESTRUN_ARCHIVE TESTRUN_ENGINE_EXCEPTION (ENG-24)
//   TESTRUN_STAGE_TIMEOUT TESTRUN_EXPECT_FAIL TESTRUN_WAIT_TIMEOUT TESTRUN_VERDICT_FAIL TESTRUN_STAGE TESTRUN_PREFLIGHT TESTRUN_LOG_FOREIGN
//   TESTRUN_MODE_MIX (ENG-26: modern and legacy mods in one list, no launch) TESTRUN_QUEUE_STOPPED (same engine exception in 2 launches, rest not launched)
//   WARN_TESTRUN_QUIT (q = console quit, ; pipe exit [T] TST-16) WARN_TESTRUN_NO_CONTROL_FLAG ; triage findings reported by logtriage in the summary block
// rows: TST-05 (-console flag passed; no pipe -> TESTRUN_NO_PIPE) TST-13 (mod_set waits up to 300 s: apply is slow) TST-03 (LAN lobby has no bots: warn)
//   LOG-01 (archive before relaunch) TST-16 (q then exit within 20 s, else kill; scenarios/tst16-quit.json) ENG-24 (bad mod.info stops every launch)
// Author: Imperator_Aug (ARSENAL, ia-1a09eed2)
const fs = require('fs'), path = require('path'), net = require('net'), os = require('os');
const { spawn, spawnSync } = require('child_process');
const { createReport } = require('../lib/report');
const ud = require('../lib/userdir');
const exever = require('../lib/exever');
const TF = require('../lib/testfolders');
const gamewatch = require('../lib/gamewatch');
const overlap = require('./overlap');
const platform = require('../lib/platform');
const cipath = require('../lib/cipath');
// root + rel ignoring letter case as the game does (Linux/macOS); exact path first, so Windows gets the plain join
const ciJoin = (root, rel, fsx) => cipath.resolve(root, rel, { cache: new Map(), fs: fsx }) || path.join(root, rel);

const NO_CONTROL_MSG = 'exe has no control pipe → manual test (testing/loop)';
const games = require('../lib/games');

// the game of an exe file (lib/games): as64.exe, mowas_2.exe, call_to_arms.exe and their _ed editor builds; no exe or a .js stand-in -> null (as64 rules)
function gameOfExe(exe) {
  if (!exe || /\.js$/i.test(exe)) return null;
  return games.idOf(path.basename(String(exe)).toLowerCase().replace(/_ed(\.exe)$/, '$1'));
}
// games with no control pipe: every live run (map, probe, scenario, matrix, queue) is refused; --dry, --mock and --lint still work
const NO_PIPE = {
  mowas2: ['mowas_2.exe has no -control, -console or -instance, so there is no control pipe to drive a run (in-play proof without a pipe: tools/testrun/scenarios/inplay-nopipe.js --target mowas2)', 'TST-19'],
  goh: ['Gates of Hell has no control pipe, so there is no pipe to drive a run (in-play proof without a pipe: tools/testrun/scenarios/inplay-nopipe.js --target goh)', 'modweb/testing/goh-drive.md'],
};
function pipeRefusal(o) {
  const n = o.gameId && NO_PIPE[o.gameId];
  return n ? games.notFor('testrun', o.gameId, n[0], n[1]) : null;
}
// no game, or as64: the AS64 rules (as64+ in the list, instances 1..9); mowas2 and goh: none of that
const isAs64Rules = id => !id || id === 'as64';
// the game a scenario names ("game": as64|mowas2|mowas_2|goh; rows2scn --exe mowas2 drafts carry it) -> {id} | {err} | null (none named)
function scenarioGame(sc) {
  if (!sc || typeof sc !== 'object' || sc.game === undefined) return null;
  const g = games.get(String(sc.game));
  return g ? { id: g.id } : { err: '"game" must be one of as64|mowas2|mowas_2|goh, not ' + JSON.stringify(sc.game) };
}
// the parts of a scenario that need the control pipe: a command step, a stage or event wait, a reply or event verdict (log, wait_log, exit, {wait: secs} do not)
function pipeNeeds(sc) {
  const out = [];
  for (const st of Array.isArray(sc.steps) ? sc.steps : []) {
    if (!st) continue;
    if (st.cmd !== undefined) out.push('step cmd ' + JSON.stringify(st.cmd));
    else if (st.wait_stage) out.push('step wait_stage');
    else if (typeof st.wait === 'string') out.push('step wait event ' + st.wait);
  }
  for (const v of Array.isArray(sc.verdict) ? sc.verdict : []) {
    if (!v) continue;
    if (v.reply !== undefined) out.push('reply verdict ' + JSON.stringify(v.reply));
    else if (v.event !== undefined) out.push('event verdict ' + v.event);
  }
  return out;
}
// logtriage reads the log by the game's rules: --exe for MoW:AS2 and GoH (none for as64: the argument list stays as it was)
const triageExe = o => (isAs64Rules(o.gameId) ? [] : ['--exe', games.exeOf(o.gameId)]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function pipePath(inst) {
  return platform.isWin() ? '\\\\.\\pipe\\as64.' + inst : path.join(os.tmpdir(), 'as64.' + inst + '.sock');
}

// ---- args
function parseArgs(argv) {
  const o = { inst: 0, timeout: 120, connectTimeout: 60, modTimeout: 300, overTimeout: 1800, sound: false, params: {}, instances: 1, workers: 1, home: process.env.AS2_HOME || undefined, errs: [] };
  const val = (i, n) => { if (i + 1 >= argv.length) { o.errs.push(n + ' needs a value'); return ''; } return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exe') o.exe = val(i++, a); else if (a === '--map') o.map = val(i++, a);
    else if (a === '--players') o.players = +val(i++, a); else if (a === '--mods') o.mods = val(i++, a).split(',').filter(Boolean);
    else if (a === '--hold') o.hold = +val(i++, a); else if (a === '--wait-over') o.waitOver = true;
    else if (a === '--archive') o.archive = val(i++, a); else if (a === '--logdir') o.logdir = val(i++, a);
    else if (a === '--stage-as') o.stageAs = val(i++, a);
    else if (a === '--relist') o.relist = true;   // re-add --stage-as folder to options.set {mods} (modswitch --write) when the game dropped it
    else if (a === "--no-preflight") o.noPreflight = true;
    else if (a === '--inst') o.inst = +val(i++, a); else if (a === '--timeout') o.timeout = +val(i++, a);
    else if (a === '--connect-timeout') o.connectTimeout = +val(i++, a); else if (a === '--mod-timeout') o.modTimeout = +val(i++, a);
    else if (a === '--over-timeout') o.overTimeout = +val(i++, a); else if (a === '--stage-timeout') o.stageTimeout = +val(i++, a);
    else if (a === '--no-mods') o.noMods = true; else if (a === '--sound') o.sound = true;
    else if (a === '--dry') o.dry = true; else if (a === '--mock') o.mock = true;
    else if (a === '--mock-no-loaded') o.mockNoLoaded = true; else if (a === '--mock-no-pipe') o.mockNoPipe = true;
    else if (a === '--mock-fail') o.mockFail = val(i++, a); else if (a === '--mock-running') o.mockRunning = true;
    else if (a === '--mock-session-failed') o.mockSessionFailed = true;
    else if (a === '--mock-hang') o.mockHang = val(i++, a).split(',');   // mock never answers these commands (game stopped answering)
    else if (a === '--mock-close-ms') o.mockCloseMs = +val(i++, a);       // mock closes the pipe this long after connect (game died)
    else if (a === '--mock-mods') o.mockMods = val(i++, a).split(',');
    else if (a === '--mock-team-lag') o.mockTeamLag = +val(i++, a); else if (a === '--team-settle-ms') o.teamSettleMs = +val(i++, a);
    else if (a === '--mock-no-stage') o.mockNoStage = true; else if (a === "--mock-no-exit") o.mockNoExit = true; else if (a === "--exit-wait") o.exitWait = +val(i++, a); else if (a === "--hang-sec") o.hangSec = +val(i++, a);
    else if (a === '--probe') o.probe = true; else if (a === '--scenario') o.scenario = val(i++, a);
    else if (a === '--matrix') o.matrix = val(i++, a); else if (a === '--maps') o.maps = val(i++, a).split(',').filter(Boolean);
    else if (a === '--modsets') o.modsets = val(i++, a).split(';').map(x => x.split(',').filter(Boolean));
    else if (a === '--instances') o.instances = Math.max(1, +val(i++, a) || 1);
    else if (a === '--param') { const kv = val(i++, a), j = kv.indexOf('='); if (j < 1) o.errs.push('--param needs k=v'); else o.params[kv.slice(0, j)] = kv.slice(j + 1); }
    else if (a === '--mission') o.params.mission = val(i++, a);
    else if (a === '--lint') o.lint = val(i++, a);
    else if (a === '--workers') o.workers = +val(i++, a); else if (a === '--overlap') o.overlap = true; else if (a === '--no-seed') o.noSeed = true; else if (a === '--home') o.home = val(i++, a);
    else if (a === '--rerun') o.rerun = val(i++, a); else if (a === '--max-same-fail') o.maxSameFail = +val(i++, a);
    else if (a === '--queue') o.queue = val(i++, a); else if (a === '--queue-dir') o.queueDir = val(i++, a);
    else if (a === '--backup') o.backup = val(i++, a); else if (a === '--game') o.game = val(i++, a); else if (a === '--profile') o.profile = val(i++, a);
    else if (a === '--mock-crash') o.mockCrash = true; else if (a === '--mock-no-game') o.mockNoGame = true;
    else if (a === '--format') o.format = val(i++, a); else if (a === '--out') o.out = val(i++, a);
    else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true;
    else o.errs.push('unknown arg ' + a);
  }
  // MP map ids are multi/<map>:<mode> (mp_maps lists them); a bare name gets the combat mode
  if (o.map && !/[/:]/.test(o.map)) o.map = `multi/${o.map}:combat`;
  if (o.map) o.params.map = o.map;
  const modes = [o.probe, o.scenario, o.matrix, o.lint, o.queue || o.queueDir || o.rerun].filter(Boolean).length; // --rerun may narrow a --queue list
  if (modes > 1) o.errs.push('--probe, --scenario, --matrix, --lint, --queue/--queue-dir/--rerun are exclusive');
  if (!o.map && !modes) o.errs.push('--map <map> required');
  if (!(o.workers >= 1 && o.workers <= 9 && Number.isInteger(o.workers))) o.errs.push('--workers must be 1..9 (-instance N allows 1..9, TST-22)');
  else if (o.workers > 1 && !o.queue && !o.queueDir && !o.rerun) o.errs.push('--workers needs --queue/--queue-dir');
  if (o.workers > 1 && !o.mock && TF.instFor(o.workers, o.inst) === null) o.errs.push('--inst + --workers passes instance 9 (TST-22: instances 1..9, instance 0 is never used in parallel runs)');
  if (o.overlap && !o.queue && !o.queueDir && !o.rerun) o.errs.push('--overlap needs --queue/--queue-dir/--rerun');
  if (o.maxSameFail !== undefined && !(Number.isInteger(o.maxSameFail) && o.maxSameFail >= 0)) o.errs.push('--max-same-fail needs an integer >= 0 (0 = never stop)');
  if (o.noMods && o.mods) o.errs.push('--no-mods and --mods conflict');
  if (o.hold !== undefined && o.waitOver) o.errs.push('--hold and --wait-over conflict');
  if (!o.exe && !o.mock) {
    if (!o.dry && !o.lint) console.error('WARN_TESTRUN_DRY_IMPLIED: no --exe, printing plans only, no game launched');
    o.dry = true;
  }
  o.gameId = o.exeGame = gameOfExe(o.exe);   // null = as64 rules (no exe, as64.exe, an unknown or .js exe)
  // --scenario: a "game" field names the game when the exe does not (rows2scn --exe mowas2 drafts); an exe of another game is refused
  if (o.scenario) {
    let sc = null;
    try { sc = JSON.parse(fs.readFileSync(o.scenario, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { /* loadScenario reports it */ }
    const g = scenarioGame(sc);
    if (g && g.err) o.errs.push(o.scenario + ': ' + g.err);
    else if (g && o.gameId && o.gameId !== g.id) o.errs.push(`${o.scenario}: the scenario is for ${games.get(g.id).name}, --exe ${path.basename(o.exe)} is ${games.get(o.gameId).name}`);
    else if (g) o.gameId = g.id;
  }
  return o;
}

function exeArgs(o) {
  // MoW:AS2 (TST-19) and GoH (no pipe): no -control, -console, -instance; a plan only, the flags left are [T]
  if (o.gameId && NO_PIPE[o.gameId]) return [...(o.sound ? [] : ['-nosound']), ...(o.noMods ? ['-no_mods'] : [])];
  const a = ['-control'];
  if (!o.sound) a.push('-nosound');
  a.push('-console'); // TST-05: retail has no console; newer build needs the flag (harmless when ignored)
  if (o.noMods) a.push('-no_mods');
  if (o.inst > 0) a.push('-instance', String(o.inst)); // pipe as64.<n> follows -instance n (1..9)
  return a;
}

// ---- plan: ordered steps; send steps carry exact pipe JSON lines
function buildPlan(o) {
  const steps = [];
  let id = 0;
  const send = (cmd, extra = {}) => steps.push(Object.assign({ kind: 'send', cmd, line: JSON.stringify({ id: ++id, cmd }) }, extra));
  const stage = () => steps.push({ kind: 'wait', stage: true, timeout: o.stageTimeout || 60 }); // live 2026-11-03: mp_lan replies ok while the stage is still 'starting'
  steps.push({ kind: 'archive' });
  steps.push({ kind: 'spawn' });
  steps.push({ kind: 'connect' });
  send('pipe_events all', { timeout: o.timeout }); // pipe opens before the main loop: a big mod's boot answers late (whole-GoH mod: over 50 s)
  if (o.mods && o.mods.length) send('mod_set ' + o.mods.join(' '), { timeout: o.modTimeout }); // TST-13
  send('mp_lan'); stage();
  send('mp_host ' + o.map + (o.players ? ' ' + o.players : '')); stage();
  send('mp_ready');
  send('mp_start');
  steps.push({ kind: 'wait', event: 'loaded', timeout: o.timeout });
  if (o.hold !== undefined) steps.push({ kind: 'hold', secs: o.hold });
  else if (o.waitOver) steps.push({ kind: 'wait', event: 'game_over', timeout: o.overTimeout });
  send('mp_state');
  send('mp_result');
  send('q', { soft: true });
  steps.push({ kind: 'triage' });
  return steps;
}

function buildProbePlan() {
  const steps = [{ kind: 'archive' }, { kind: 'spawn' }, { kind: 'connect' }];
  let id = 0;
  for (const cmd of ['pipe_events all', 'mod_list', 'mp_state', 'q']) steps.push({ kind: 'send', cmd, line: JSON.stringify({ id: ++id, cmd }), keep: 'probe', soft: cmd === 'q' });
  steps.push({ kind: 'triage' });
  return steps;
}

const CMP_OPS = ['>', '>=', '==', '!=', '<', '<='];
const isLive = v => v.reply !== undefined || v.event !== undefined; // decided while the game is up (before q)

function liveDesc(v) {
  const lab = v.label ? v.label + ': ' : '';
  if (v.event !== undefined) return `${lab}event "${v.event}" ${v.want === false ? 'must not be seen' : 'must be seen'}`;
  if (v.path !== undefined) return `${lab}reply "${v.reply}" ${v.path} ${v.op} ${JSON.stringify(v.value)}${v.want === false ? ' must not hold' : ''}`;
  return `${lab}reply "${v.reply}" ${v.want === false ? 'has no match for' : 'matches'} /${v.match}/`;
}
function walkPath(obj, p) {
  let cur = obj;
  for (const k of String(p).split('.')) { if (cur === null || typeof cur !== 'object' || !(k in cur)) return { found: false }; cur = cur[k]; }
  return { found: true, value: cur };
}
function compare(a, op, b) {
  const num = typeof a === 'number' && (typeof b === 'number' || (typeof b === 'string' && b.trim() !== '' && !isNaN(+b)));
  if (num) b = +b;
  switch (op) {
    case '>': return a > b; case '>=': return a >= b; case '<': return a < b; case '<=': return a <= b;
    case '==': return num ? a === b : JSON.stringify(a) === JSON.stringify(b);
    case '!=': return num ? a !== b : JSON.stringify(a) !== JSON.stringify(b);
  }
  return false;
}
// one reply/event verdict against the live game -> {pass, desc}. no reply / bad JSON / missing path = FAIL whatever `want` says (undecided is not a pass)
async function evalLive(client, v) {
  const want = v.want !== false, desc = liveDesc(v);
  if (v.event !== undefined) {
    let seen = client.events.some(e => e.event === v.event);
    if (!seen && want && v.within) seen = !!(await client.waitEvent(v.event, v.within * 1000));
    return { pass: seen === want, desc: desc + (seen === want ? '' : seen ? ' (seen)' : ' (not seen)') };
  }
  const r = await client.send(v.reply, (v.timeout || 10) * 1000);
  if (!r) return { pass: false, desc: desc + ` (no reply${client.closed ? ', pipe closed' : ''})` };
  const out = r.output || [];
  if (v.path !== undefined) {
    if (!r.ok) return { pass: false, desc: desc + ` (ERR ${r.error})` };
    let j; try { j = JSON.parse(out[0]); } catch (e) { return { pass: false, desc: desc + ' (first output line is not JSON)' }; }
    const w = walkPath(j, v.path);
    if (!w.found) return { pass: false, desc: desc + ' (path not found)' };
    const hit = compare(w.value, v.op, v.value);
    return { pass: hit === want, desc: desc + ` (got ${JSON.stringify(w.value)})` };
  }
  const text = r.ok ? out.join('\n') : 'ERR ' + r.error;
  const hit = new RegExp(v.match, 'm').test(text);
  return { pass: hit === want, desc: desc + (hit === want ? '' : ` (got ${JSON.stringify(text.slice(0, 100))})`) };
}

const subst = (str, params) => String(str).replace(/\{([A-Za-z_]\w*)\}/g, (m, k) => (k in params ? params[k] : m));

// scenario file -> {sc, errs}
function loadScenario(file, o) {
  let sc;
  try { sc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { return { errs: [file + ': ' + e.message] }; }
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return { errs: [file + ': not an object'] };
  const errs = [], bad = m => errs.push(file + ': ' + m);
  sc.name = sc.name || path.basename(file, '.json');
  sc.mode = sc.mode || 'menu';
  if (!['menu', 'sp', 'mp'].includes(sc.mode)) bad('mode must be menu|sp|mp');
  // FIX-EDRUN item 8: a scenario with no "mods" field keeps the instance's own list (was reseeded to as64+ alone)
  sc.modsGiven = sc.mods !== undefined;
  sc.mods = sc.mods || []; sc.rows = sc.rows || [];
  const sg = scenarioGame(sc);
  if (sg && sg.err) bad(sg.err);
  else if (sg) {
    const G = games.get(sg.id), np = NO_PIPE[sg.id];
    sc.game = sg.id;
    if (o.exeGame && o.exeGame !== sg.id) bad(`the scenario is for ${G.name}, --exe ${path.basename(o.exe)} is ${games.get(o.exeGame).name}`);
    if (np) for (const n of pipeNeeds(sc)) bad(`${n} needs the control pipe: ${G.name} has none (${np[1]}); a ${sg.id} scenario checks game.log only (log verdicts, wait_log, exit)`);
    if (!isAs64Rules(sg.id) && sc.mods.some(m => String(m).replace(/:\d+$/, '').toLowerCase() === 'as64+')) bad(`"mods" names as64+, the built-in mod of AS64: ${G.name} has none`);
    if (np && !o.dry && !o.mock) bad(games.notFor('testrun', sg.id, np[0], np[1]));
  }
  if (o.stageAs || o.stagePool) {
    const sl = (o.stageAs || '').split(',').filter(Boolean); // fixture i -> folder i (list order = mount order)
    if (o.stageAs && (sc.fixture || []).length !== sl.length) bad('--stage-as names ' + sl.length + ' folder(s), scenario has ' + (sc.fixture || []).length + ' fixture(s)');
    // "name:N" (patch count) names the same fixture: drop it too, or mod_set of a non-mod resets the profile list (live 2026-11-03)
    sc.stagePatches = sc.stagePatches || {};
    for (const m of sc.mods) if (/:\d+$/.test(m) && (sc.fixture || []).includes(m.replace(/:\d+$/, ''))) sc.stagePatches[m.replace(/:\d+$/, '')] = m.replace(/^.*:/, '');
    sc.mods = sc.mods.filter(m => !(sc.fixture || []).includes(m.replace(/:\d+$/, '')));
  }
  if (!Array.isArray(sc.steps || [])) bad('steps must be an array');
  if (!Array.isArray(sc.verdict || [])) bad('verdict must be an array');
  if (errs.length) return { errs };
  sc.steps = sc.steps || []; sc.verdict = sc.verdict || [];
  const params = Object.assign({}, sc.params || {}, sc.mission ? { mission: sc.mission } : {}, sc.map ? { map: sc.map } : {}, o.params);
  if (sc.mode === 'sp' && !params.mission) bad('mode sp needs mission (scenario field or --mission)');
  if (sc.mode === 'mp' && !params.map) bad('mode mp needs map (scenario field or --map)');
  sc.params = params;
  const need = new Set();
  const scan = x => { for (const m of String(x).matchAll(/\{([A-Za-z_]\w*)\}/g)) need.add(m[1]); };
  const rx = (re, what) => { try { new RegExp(subst(re, params)); } catch (e) { bad('bad ' + what + ' regex ' + re); } };
  for (const st of sc.steps) {
    if (!st || (st.cmd === undefined && st.wait === undefined && !st.wait_stage && st.wait_log === undefined)) { bad('step needs cmd, wait, wait_stage or wait_log'); continue; }
    if (st.wait_log !== undefined) { if (typeof st.wait_log !== 'string' || !st.wait_log) bad('wait_log needs a regex string'); else { scan(st.wait_log); rx(st.wait_log, 'wait_log'); } }
    if (st.cmd !== undefined) scan(st.cmd);
    if (st.expect !== undefined) { scan(st.expect); rx(st.expect, 'expect'); }
  }
  for (const v of sc.verdict) {
    if (!v || (v.log === undefined && v.exit === undefined && v.reply === undefined && v.event === undefined)) { bad('verdict needs log, exit, reply or event'); continue; }
    if (v.log !== undefined) { scan(v.log); rx(v.log, 'verdict'); }
    if (v.reply !== undefined) {
      scan(v.reply);
      if (v.path !== undefined) { if (!CMP_OPS.includes(v.op)) bad('reply verdict with path needs op ' + CMP_OPS.join('|')); if (v.value === undefined) bad('reply verdict with path needs value'); }
      else if (v.match === undefined) bad('reply verdict needs match (regex) or path+op+value');
      else { scan(v.match); rx(v.match, 'reply verdict'); }
    }
    if (v.event !== undefined && (typeof v.event !== 'string' || !v.event)) bad('event verdict needs an event name');
  }
  for (const k of need) if (!(k in params) || params[k] === '') bad('param ' + k + ' needed (--param ' + k + '=<value>)');
  return { sc, errs };
}

function buildScenarioPlan(o, sc) {
  const steps = [], P = sc.params;
  let id = 0;
  const send = (cmd, extra = {}) => steps.push(Object.assign({ kind: 'send', cmd, line: JSON.stringify({ id: ++id, cmd }) }, extra));
  const stageNames = o.stageAs ? o.stageAs.split(',').filter(Boolean) : [];
  const stageMods = stageNames.map((f, i) => { const n = (sc.stagePatches || {})[(sc.fixture || [])[i]]; return n ? `${f}:${n}` : f; });
  const mods = [...(o.runMods ? o.runMods : (o.mods || sc.mods)).filter(m => !stageNames.includes(m.replace(/:\d+$/, ''))), ...stageMods];
  steps.push({ kind: 'archive' }, { kind: 'spawn' }, { kind: 'connect' });
  send('pipe_events all', { timeout: o.timeout }); // first answer waits for the main loop, as in buildPlan
  // mod_set reads space-split words: a folder name with spaces can't be said, the seeded list (instance 1-9) already mounts it, mod_list below checks
  if (mods.length && !o.noMods && !mods.some(m => /\s/.test(m))) send('mod_set ' + mods.join(' '), { timeout: o.modTimeout }); // replaces the active list: names the staged folders too (live 2026-11-04: as64+ alone unmounted them)
  if (!o.mock) for (const f of stageNames) send('mod_list', { mounted: f }); // staged folder must be loaded, else "file not found" checks pass falsely
  const stage = () => steps.push({ kind: 'wait', stage: true, timeout: o.stageTimeout || 60 });
  // sp_mission sends no stage event: its reply comes once the mission has loaded, so the reply is the wait (live, ai-pages-game-checks)
  if (sc.mode === 'sp') send('sp_mission ' + P.mission, { timeout: o.stageTimeout || 60 });
  else if (sc.mode === 'mp') {
    const n = o.players || sc.players;
    send('mp_lan'); stage(); send('mp_host ' + P.map + (n ? ' ' + n : '')); stage(); send('mp_ready'); send('mp_start');
    steps.push({ kind: 'wait', event: 'loaded', timeout: o.timeout });
  }
  // sc.members (queue, one launch for several scenarios): each member's steps, then its live (reply/event) verdicts while the game is up
  const members = sc.members || [sc], all = [];
  members.forEach((m, mi) => {
    const seg = sc.members ? mi : undefined, MP = m.params || P;
    if (sc.members) steps.push({ kind: 'segstart', seg });
    for (const st of m.steps) {
      if (st.cmd !== undefined) send(subst(st.cmd, MP), { keep: 'step', expect: st.expect !== undefined ? subst(st.expect, MP) : undefined, timeout: st.timeout });
      if (st.wait_stage) steps.push({ kind: 'wait', stage: true, section: typeof st.wait_stage === 'string' ? st.wait_stage : undefined, timeout: st.timeout || 60, user: true });
      if (st.wait_log !== undefined) steps.push({ kind: 'waitlog', re: subst(st.wait_log, MP), timeout: st.timeout || 45, user: true });
      if (typeof st.wait === 'number') steps.push({ kind: 'hold', secs: st.wait });
      else if (typeof st.wait === 'string') steps.push({ kind: 'wait', event: st.wait, timeout: st.timeout || 60, user: true });
    }
    if (o.hold !== undefined && mi === members.length - 1) steps.push({ kind: 'hold', secs: o.hold }); // eye checks: keep the window up before verdict/quit
    const vs = m.verdict.map((v, ord) => {
      const x = Object.assign({}, v, { seg, ord });
      for (const k of ['log', 'reply', 'match']) if (x[k] !== undefined) x[k] = subst(x[k], MP);
      return x;
    });
    all.push(...vs);
    const live = vs.filter(isLive);
    if (live.length || sc.members) steps.push({ kind: 'live', seg, items: live });
  });
  send('q', { soft: true, auto: true });
  steps.push({ kind: 'verdict', verdict: all });
  steps.push({ kind: 'triage' });
  return steps;
}

function printPlan(o, steps, logdir, archive) {
  console.log('testrun plan (dry: nothing launched)');
  const np = o.gameId && NO_PIPE[o.gameId];
  console.log(np ? `pipe: none (${games.get(o.gameId).name} has no control pipe, ${np[1]}: the send lines below cannot be delivered)` : 'pipe: ' + pipePath(o.inst));
  for (const s of steps) {
    if (s.kind === 'archive') console.log(`1. archive: copy ${logdir || '<logdir>'}/{game.log,game.prev.log,minidumps,oos} -> ${archive || '<logdir>/archive'}/<timestamp>/ (never delete)`);
    else if (s.kind === 'spawn') console.log(`2. spawn: ${o.exe || (isAs64Rules(o.gameId) ? '<exe>' : '<' + games.get(o.gameId).file + '>')} ${exeArgs(o).join(' ')}`);
    else if (s.kind === 'connect') console.log(`3. connect: retry up to ${o.connectTimeout}s; no pipe -> "${NO_CONTROL_MSG}"`);
    else if (s.kind === 'send') console.log(`   send ${s.line}${s.timeout ? '   (reply timeout ' + s.timeout + 's)' : ''}${s.expect !== undefined ? '   expect /' + s.expect + '/' : ''}${s.keep === 'probe' ? '   (record answer)' : ''}`);
    else if (s.kind === 'wait') console.log(s.stage ? `   wait stage event state=active${s.section ? ' section=' + s.section : ''} (timeout ${s.timeout}s)` : `   wait event ${s.event} (timeout ${s.timeout}s)`);
    else if (s.kind === 'hold') console.log(`   hold ${s.secs}s`);
    else if (s.kind === 'waitlog') console.log(`   wait game.log line /${s.re}/ (timeout ${s.timeout}s)`);
    else if (s.kind === 'live' && s.items.length) console.log('   live verdicts (game up, before q): ' + s.items.length);
    else if (s.kind === 'verdict') {
      for (const v of s.verdict) console.log('   verdict ' + (v.log !== undefined ? `game.log ${v.want === false ? 'must not match' : 'must match'} /${v.log}/` : isLive(v) ? 'live ' + liveDesc(v) : `process exit ${v.exit === false ? 'must not happen' : 'within ' + (v.within || 20) + 's'}`) + (v.row ? ` [${v.row}]` : ''));
    } else if (s.kind === 'triage') console.log(`4. triage: node tools/logtriage/logtriage.js ${logdir || '<logdir>'} -q --summary${triageExe(o).map(x => ' ' + x).join('')}`);
  }
}

// ---- pipe client
class Client {
  constructor(sock) {
    this.sock = sock; this.buf = ''; this.events = []; this.waiters = []; this.pending = new Map(); this.nextId = 0; this.closed = false;
    this.counts = {}; this.onEvent = null; this.raw = []; this.t0 = Date.now();
    sock.setEncoding('utf8');
    sock.on('data', d => this.data(d));
    sock.on('close', () => { this.closed = true; this.closedAt = Date.now(); for (const [, p] of this.pending) p.resolve(null); this.pending.clear(); for (const w of this.waiters) w.resolve(null); this.waiters = []; });
    sock.on('error', () => {});
  }
  data(d) {
    this.buf += d;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      this.raw.push({ t: Date.now() - this.t0, dir: 'in', raw: line });
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.type === 'reply') { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); p.resolve(m); } }
      else if (m.type === 'event') {
        this.events.push(m); this.counts[m.event] = (this.counts[m.event] || 0) + 1;
        if (this.onEvent) this.onEvent(m);
        this.waiters = this.waiters.filter(w => { if (w.pred ? w.pred(m) : w.name === m.event) { clearTimeout(w.t); w.resolve(m); return false; } return true; });
      }
    }
  }
  // reply message, or null on timeout/close
  send(cmd, timeoutMs) {
    const id = ++this.nextId;
    if (this.closed) return Promise.resolve(null); // pipe gone: no 30 s wait for a reply that can not come
    return new Promise(resolve => {
      const t = setTimeout(() => { this.pending.delete(id); resolve(null); }, timeoutMs);
      this.pending.set(id, { resolve: m => { clearTimeout(t); resolve(m); } });
      const line = JSON.stringify({ id, cmd });
      this.raw.push({ t: Date.now() - this.t0, dir: 'out', raw: line });
      try { this.sock.write(line + '\n'); } catch (e) { clearTimeout(t); this.pending.delete(id); resolve(null); }
    });
  }
  // event message (already seen counts), or null on timeout/close
  waitEvent(name, timeoutMs) {
    const seen = this.events.find(e => e.event === name);
    if (seen) return Promise.resolve(seen);
    if (this.closed) return Promise.resolve(null);
    return new Promise(resolve => {
      const w = { name, resolve };
      w.t = setTimeout(() => { this.waiters = this.waiters.filter(x => x !== w); resolve(null); }, timeoutMs);
      this.waiters.push(w);
    });
  }
  // stage event with state active (section optional) among events[from..]; null on timeout/close
  waitStage(from, section, timeoutMs) {
    const pred = e => e.event === 'stage' && e.state === 'active' && (!section || e.section === section);
    const seen = this.events.slice(from).find(pred);
    if (seen) return Promise.resolve(seen);
    if (this.closed) return Promise.resolve(null);
    return new Promise(resolve => {
      const w = { pred, resolve };
      w.t = setTimeout(() => { this.waiters = this.waiters.filter(x => x !== w); resolve(null); }, timeoutMs);
      this.waiters.push(w);
    });
  }
  close() { try { this.sock.destroy(); } catch (e) {} }
}

function tryConnect(name) {
  return new Promise(resolve => {
    const s = net.connect(name);
    s.once('connect', () => resolve(s));
    s.once('error', () => { s.destroy(); resolve(null); });
  });
}
async function connectRetry(name, timeoutMs, stop) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const s = await tryConnect(name);
    if (s) return new Client(s);
    if (Date.now() >= end || (stop && stop())) return null;
    await sleep(Math.min(250, Math.max(10, end - Date.now())));
  }
}

// ---- mock server (tests): emulates hello, replies, events
function startMock(name, o, log) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer(sock => {
      sock.setEncoding('utf8');
      const ev = (event, f) => sock.write(JSON.stringify(Object.assign({ type: 'event', event }, f || {})) + '\n');
      ev('hello', { instance: o.inst, pid: process.pid, version: 'mock', protocol: 2 });
      if (o.mockCloseMs) setTimeout(() => sock.destroy(), o.mockCloseMs);
      let buf = '', lanActive = false, started = false, joins = 0, mockTeams = { a: 'usa', b: 'ger' };
      sock.on('error', () => {});
      sock.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          const req = JSON.parse(line), cmd = req.cmd, w = cmd.split(/\s+/)[0];
          log.push(cmd);
          const reply = (ok, output, error) => sock.write(JSON.stringify({ type: 'reply', id: req.id, ok, error: error || '', output: output || [] }) + '\n');
          if (o.mockHang && o.mockHang.includes(w)) continue;
          if (o.mockFail && w === o.mockFail) { reply(false, [], 'mock: ' + w + ' failed'); continue; }
          if (w === 'pipe_events') reply(true);
          else if (w === 'mp_lan' || w === 'sp_mission' || w === 'mp_host') {
            if (w === 'mp_host' && !lanActive) { reply(false, [], 'not in the LAN lobby: in a session or on the way to one'); continue; }
            const sec = w === 'mp_lan' ? 'mp_lobbylan' : w === 'mp_host' ? 'mp_lobbyhost' : 'sp';
            if (w === 'mp_lan') lanActive = false;
            reply(true, w === 'sp_mission' ? ['loaded ' + cmd.split(/\s+/)[1]] : []);
            if (w === 'sp_mission') continue; // like the game: no stage event for sp_mission, only the reply once loaded
            ev('stage',{ stage: 'mock', section: sec, state: 'starting' });
            if (!o.mockNoStage) setTimeout(() => { if (w === 'mp_lan') lanActive = true; ev('stage', { stage: 'mock', section: sec, state: 'active' }); }, 80);
          }
          else if (w === 'mp_start') {
            reply(true); started = true;
            if (o.mockSessionFailed) setTimeout(() => ev('session_failed', { reason: 'denied' }), 30);
            else if (!o.mockNoLoaded) {
              setTimeout(() => ev('loaded'), 60);
              setTimeout(() => ev('game_over'), 200);
            }
          }
          else if (w === 'mp_result') reply(true, ['{"state":"over","winner":"mock"}']);
          else if (w === 'mp_state') { if (!started || o.mockNoGame) reply(false, [], 'no game running'); else reply(true, ['{"live":true,"players":[{"ai":false},{"ai":true}],"sides":[{"unitsAlive":5},{"unitsAlive":0}],"flags":[],"resources":{}}']); }
          // --mock-team-lag: the engine's mp_set copies the local card and syncs all of teams/; the
          // server echo lands later, so a second mp_set sent first carries the stale other team (chain-n g2: team a stayed usa)
          else if (w === 'mp_set' && o.mockTeamLag && /^team\.\w+\.army$/.test(cmd.split(/\s+/)[1] || '')) {
            const [, p, v] = cmd.split(/\s+/), snap = Object.assign({}, mockTeams); snap[p.split('.')[1]] = v;
            reply(true, [p + ' ' + v]); setTimeout(() => { mockTeams = snap; }, o.mockTeamLag);
          }
          else if (w === 'mp_slots') reply(true, ['armyMode 1 freeForAll=0', ...Object.keys(mockTeams).map(t => `team name=${t} size=2 army=${mockTeams[t]} alliance= hidden=0`)]);
          else if (w === 'mp_join') { if (++joins < 2) reply(false, [], 'no session listed at ' + (cmd.split(' ')[1] || '?') + ' yet; asked the host, try again in a moment'); else reply(true); }
          else if (w === 'echo') reply(true, [cmd.slice(5)]);
          else if (w === 'nosuch') reply(false, [], "atom not found : 'nosuch'");
          else if (w === 'mod_list') reply(true, (o.mockMods || ['modA']).map(n => JSON.stringify({ name: n, version: 1, order: 0, applied: true })));
          else if (w === 'badcmd') reply(false, [], 'unknown command');
          else if (w === 'q') { reply(true); if (!o.mockNoExit) setTimeout(() => { sock.end(); srv.close(); }, 20); }
          else reply(true);
        }
      });
    });
    srv.on('error', reject);
    if (!platform.isWin()) { try { fs.unlinkSync(name); } catch (e) {} }
    srv.listen(name, () => resolve(srv));
  });
}

// ---- logs
// static lint of a staged mod before the exe runs: lnglint (no {tags} = fatal "Identifier expected", LOC-05) + vfs mount
// (bad .patch wrapper = fatal "File signature mismatch"; MOD_MODE/MOD_VERSION = silently not mounted). WARN_/info ignored.
// Enhanced (3.301) mods are mounted beside as64+ the way the game runs them
function preflight(modDir, gameDir, game) {
  const out = [], name = path.basename(modDir);
  const lint = (tool, args) => {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', tool, tool + '.js'), ...args, '-q'], { encoding: 'utf8' });
    const found = [];
    for (const l of (r.stdout || '').split(/\r?\n/)) { const m = /^(.*?): ([A-Z][A-Z0-9_]+) (.*)$/.exec(l); if (m && !m[2].startsWith('WARN_')) found.push({ tool, where: m[1], code: m[2], msg: m[3] }); }
    if (r.status > 1 || r.error) found.push({ tool, where: name, code: 'TOOL_CRASH', msg: ((r.stderr || '') + (r.error ? r.error.message : '')).trim().split('\n').pop() });
    return found;
  };
  out.push(...lint('lnglint', [modDir]));
  if (gameDir) {
    const ex = isAs64Rules(game) ? [] : ['--exe', games.exeOf(game)];   // MoW:AS2: its own resource set, no as64+ retry
    let v = lint('vfs', [gameDir, '--mods', name, ...ex]);
    if (!ex.length && v.some(f => f.code === 'MOD_MODE')) v = lint('vfs', [gameDir, '--mods', 'as64+,' + name]);
    out.push(...v);
  }
  return out;
}

// each -instance N has its own user dir and log/ (TST-22); mock pipe ids (>9) keep instance 0
const realInst = o => (o.inst >= 1 && o.inst <= 9 ? o.inst : 0);
// MP-2: scenarios send mp_join a few times while the LAN list fills; 'try again in a moment' and 'already in a session' replies are retries, not failures
const JOIN_RETRY = /try again in a moment|not in the LAN lobby: in a session or on the way/i;
function joinRetry(cmd, r) { return !!(r && !r.ok && /^mp_join(\s|$)/.test(cmd) && JOIN_RETRY.test(r.error || '')); }
function defaultLogDir(o) {
  // GoH (a --dry plan only: live runs are refused): its own user dir, Documents/My Games/Gates of Hell or LocalAppData (LOG-22)
  // MoW:AS2 shares the AS2 user dir with AS64 (LOG-20); userdir.logDirFor picks per game (GoH has no per-instance folder, GHVFS-13)
  // a game with no -instance (mowas_2.exe TST-19, GoH GHVFS-13) always writes its one user dir: --inst N names no instance folder
  return ud.logDirFor(o.gameId || null, TF.hasInstances(o.gameId || undefined) ? realInst(o) : 0, { home: o.home });
}
// instance N >= 1: own options.set seeded with the run's mod list (instance 0 = the real profile, never written). -> profile file | null
// ENG-26 / VFS-48: a mod whose mode differs from the list's (modern = MinGameVersion >= 3.301 needs as64+, legacy must not have it)
// logs "not applied" before fonts load: fatal fallback-font dialog. -> true modern | false legacy | null no mod.info to read
function modIsModern(gd, name) {
  if (!gd) return null;
  try {
    const r = /[{]\s*MinGameVersion\s+"([^"]*)"/i.exec(fs.readFileSync(ciJoin(gd, 'mods/' + name + '/mod.info'), 'latin1'));
    const v = r ? r[1].replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number) : [];
    return v.length > 0 && (v[0] > 3 || (v[0] === 3 && (v[1] || 0) >= 301));
  } catch { return null; }
}
const modName = m => m.replace(/:\d+$/, '');
// mod.info file -> true when its MinGameVersion is 3.301+ (Enhanced mode: needs as64+ in the list)
function infoIsModern(file) {
  try {
    const r = /[{]\s*MinGameVersion\s+"([^"]*)"/i.exec(fs.readFileSync(file, 'latin1'));
    const v = r ? r[1].replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number) : [];
    return v.length > 0 && (v[0] > 3 || (v[0] === 3 && (v[1] || 0) >= 301));
  } catch { return false; }
}
// names listed together that the engine would crash on -> message | null
function modeClash(names, gd) {
  const ids = names.map(modName), enh = ids.some(i => i.toLowerCase() === 'as64+');
  const known = ids.filter(i => i.toLowerCase() !== 'as64+').map(i => [i, modIsModern(gd, i)]).filter(x => x[1] !== null);
  const modern = known.filter(x => x[1]).map(x => x[0]), legacy = known.filter(x => !x[1]).map(x => x[0]);
  if (modern.length && legacy.length) return `modern mods (${modern.join(',')}) and legacy mods (${legacy.join(',')}) in one list`;
  if (enh && legacy.length) return `legacy mods (${legacy.join(',')}) listed with as64+`;
  if (!enh && modern.length) return `modern mods (${modern.join(',')}) listed without as64+`;
  return null;
}
// the run's list -> the list to seed: as64+ first for modern mods and for a run with no mods (else the instance keeps the last run's list)
function seedList(mods, gd, as64 = true) {   // as64 false (MoW:AS2): never adds as64+
  const list = mods.map(m => (/:\d+$/.test(m) ? m : m + ':0')), ids = list.map(modName), has = ids.some(i => i.toLowerCase() === 'as64+');
  if (!as64 || has || (list.length && !ids.some(i => modIsModern(gd, i)))) return list;
  return ['as64+:0', ...list];
}
// FIX-EDRUN item 8: true = do not reseed: a scenario run whose scenario has no "mods" field, no --mods, no matrix mod set, nothing staged
function keepsList(o, sc, stageList) {
  return !!(sc && sc.modsGiven === false && !o.mods && !o.runMods && !(stageList && stageList.length));
}
function seedInstance(o, mods, gd, say, rep) {
  if (o.noSeed || o.dry || o.noMods || !(o.inst >= 1 && o.inst <= 9) || (o.mock && !o.home) || !TF.hasInstances(o.gameId || undefined)) return null;
  try {
    const list = seedList(mods, gd, isAs64Rules(o.gameId));
    const r = ud.seedProfile(o.inst, { home: o.home, from: o.profile && fs.existsSync(o.profile) ? o.profile : undefined, mods: list });
    say(`seeded instance ${o.inst} profile ${r.file} mods ${list.join(' ')}`);
    return r.file;
  } catch (e) { rep.add('testrun', 0, 'WARN_TESTRUN_SEED', `instance ${o.inst} profile not seeded: ${e.message} (the instance starts with an empty mod list; --no-seed silences)`); return null; }
}
function copyArchive(logdir, dest, rep) {
  let n = 0;
  const cp = (src, dst) => {
    const st = fs.statSync(src);
    if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) cp(path.join(src, f), path.join(dst, f)); }
    else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); n++; }
  };
  try {
    for (const f of ['game.log', 'game.prev.log', 'oos']) { const s = path.join(logdir, f); if (fs.existsSync(s)) cp(s, path.join(dest, f)); }
    // a dump stays in log/minidumps across launches: copy each one once, or every launch re-copies them all (37 GB seen)
    const dumps = path.join(logdir, 'minidumps'), root = path.dirname(dest);
    if (fs.existsSync(dumps)) {
      const had = new Set();
      if (fs.existsSync(root)) for (const a of fs.readdirSync(root)) { const d = path.join(root, a, 'minidumps'); if (fs.existsSync(d) && fs.statSync(d).isDirectory()) for (const x of fs.readdirSync(d)) had.add(x); }
      for (const x of fs.readdirSync(dumps)) if (!had.has(x)) cp(path.join(dumps, x), path.join(dest, 'minidumps', x));
    }
  } catch (e) { rep.add('testrun', 0, 'TESTRUN_ARCHIVE', 'archive copy failed: ' + e.message + ' (LOG-01: game.log is overwritten each launch)'); return null; }
  return { dest, n };
}

// early-exit diagnosis from game.log (TST-05 / ENG-24): last Exception block + CMD: line check. sinceMs: ignore a log older than this (real runs)
function diagnoseLog(logdir, rep, sinceMs) {
  const f = logdir && path.join(logdir, 'game.log');
  if (!f || !fs.existsSync(f)) return;
  if (sinceMs && fs.statSync(f).mtimeMs < sinceMs) { rep.info('testrun', 0, 'TESTRUN_NOTE', 'game.log is older than this launch: exe died before writing it'); return; }
  const lines = fs.readFileSync(f, 'latin1').split(/\r?\n/);
  let ex = -1;
  lines.forEach((l, i) => { if (/^\*{5,} Exception \*{5,}\s*$/.test(l)) ex = i; });
  if (ex >= 0) {
    let k = ex + 1;
    while (k < lines.length && !lines[k].trim()) k++;
    const first = (lines[k] || '').trim();
    const m = first.match(/^(.*?)\s*\(([^,()]+),\s*(\d+)\)(?:\s*@\s*\[(.*?)\])?\s*$/);
    let res = null;
    for (let j = k + 1; j < Math.min(lines.length, k + 20) && !/^Call stack/.test(lines[j]); j++) { const r = lines[j].match(/^> file "(.*)"/); if (r) { res = r[1]; break; } }
    let msg = (m ? `${m[1]} (${m[2]}:${m[3]}${m[4] ? ' @ ' + m[4] : ''})` : first) + (res ? ` resource "${res}"` : '');
    if (res && /(^|[\\/])mods[\\/][^\\/]+[\\/]mod\.info$/i.test(res)) msg += ' | ENG-24: one bad mod.info in mods/ stops every launch; run modinfo on it';
    rep.add('game.log', ex + 1, 'TESTRUN_ENGINE_EXCEPTION', msg);
  }
  const ci = lines.findIndex(l => /^CMD: /.test(l));
  if (ci >= 0 && !/(^|\s)-control(\s|$)/.test(lines[ci])) rep.add('game.log', ci + 1, 'WARN_TESTRUN_NO_CONTROL_FLAG', 'CMD: line has no -control: the pipe is only served when the exe is started with -control');
}

// ---- run
async function run(o) {
  const rep = createReport(), say = s => { if (!o.q) console.log(s); };
  const logdir = o.logdir ? o.logdir.replace(/{inst}/g, o.inst) : defaultLogDir(o);
  const archive = o.archive || (logdir ? path.join(logdir, 'archive') : null);
  const sum = { cmds: 0, events: {}, result: null, state: null, answers: [], verdicts: [], rows: [] };
  if (o.errs.length) { for (const e of o.errs) rep.add('testrun', 0, 'TESTRUN_BAD_ARGS', e); return { rep, sum }; }
  let sc = o.scenarioObj || null;
  if (o.scenario && !sc) {
    const r = loadScenario(o.scenario, o);
    if (r.errs.length) { for (const e of r.errs) rep.add('testrun', 0, 'TESTRUN_BAD_ARGS', e); return { rep, sum }; }
    sc = r.sc;
  }
  const refused = stageRefusal(o);
  if (refused) { rep.add('testrun', 0, 'TESTRUN_STAGE_REFUSED', refused); return { rep, sum }; }
  sum.name = sc ? sc.name : o.probe ? 'probe' : 'run';
  if (sc && typeof sc.quarantine === 'string' && sc.quarantine) { console.log(`NORUN ${sc.name}: quarantined: ${sc.quarantine}`); sum.norun = sc.quarantine; return { rep, sum, norun: true }; }
  const steps = o.probe ? buildProbePlan() : sc ? buildScenarioPlan(o, sc) : buildPlan(o);
  if (o.dry) { printPlan(o, steps, logdir, archive); return { rep, sum, dry: true }; }
  if (!o.exe && !o.mock) { rep.add('testrun', 0, 'TESTRUN_NO_EXE', '--exe <path> required for a real run'); return { rep, sum }; }
  if (o.exe && !o.mock && !fs.existsSync(o.exe)) { rep.add('testrun', 0, 'TESTRUN_NO_EXE', 'exe not found: ' + o.exe); return { rep, sum }; }
  const runDir = archive ? path.join(archive, o.runName || new Date().toISOString().replace(/[:.]/g, '-')) : null;
  sum.runDir = runDir; sum.inst = o.inst; sum.logdir = logdir;
  const name = pipePath(o.inst);
  const mockLog = [];
  let gw = null, diagnosed = false, stageMark = 0, mock = null, proc = null, client = null, qSent = false, qAt = 0, startMs = 0, aborted = false, noReply = 0, logOff = 0;
  const logf = logdir && path.join(logdir, 'game.log');
  const procGone = () => !!(proc && proc.exitCode !== null);
  // this launch's game.log only: a log older than the spawn is the previous run's (the exe rewrites it at start), so it counts as empty
  const logSize = () => { try { const st = fs.statSync(logf); return st.mtimeMs < startMs - 2000 ? 0 : st.size; } catch (e) { return 0; } };
  const logSince = off => { try { const st = fs.statSync(logf); if (st.mtimeMs < startMs - 2000) return ''; if (st.size < off) off = 0; const b = Buffer.alloc(st.size - off), fd = fs.openSync(logf, 'r'); try { fs.readSync(fd, b, 0, b.length, off); } finally { fs.closeSync(fd); } return b.toString('latin1'); } catch (e) { return ''; } };
  const onWatch = v => {
    sum.watch = v; say(`watch: ${v.state}: ${v.reason}`);
    if (v.state === 'crashed-logged') { if (!diagnosed) { diagnosed = true; diagnoseLog(logdir, rep, startMs - 5000); } if (!rep.counts.TESTRUN_ENGINE_EXCEPTION) rep.add('testrun', 0, 'TESTRUN_CRASH', v.reason); }
    else if (v.state === 'crashed-silent' || v.state === 'crashed-dialog') rep.add('testrun', 0, 'TESTRUN_CRASH', v.reason);
    else if (v.state === 'hung') rep.add('testrun', 0, 'TESTRUN_HANG', v.reason);
    if (gamewatch.isFailure(v) && proc.exitCode === null) { qSent = true; gamewatch.killTree(proc.pid); }
  };
  if (o.mock && o.mockRunning) mock = await startMock(name, o, mockLog);

  // refuse when a game already serves the pipe: connecting would drive (and quit) the running game
  let probe = await tryConnect(name);
  // the previous queue launch's game can still be closing: its pipe is gone within seconds (live 2026-11-03)
  for (let t = 0; probe && !o.mock && o.queueRun && t < 5; t++) { probe.destroy(); await sleep(1000); probe = await tryConnect(name); }
  if (probe) {
    probe.destroy();
    rep.add('testrun', 0, 'TESTRUN_RUNNING', `a game already serves ${name}: close it first (LOG-01: relaunch overwrites game.log)`);
    if (mock) mock.close();
    sum.aborted = true;
    return { rep, sum };
  }

  const expectFails = [], liveRes = new Map();
  sum.segs = [];
  for (const s of steps) {
    if (s.kind === 'archive') {
      if (!logdir || !fs.existsSync(logdir)) { rep.info('testrun', 0, 'TESTRUN_ARCHIVE', 'no log dir found (--logdir): archive and triage skipped'); continue; }
      const r = copyArchive(logdir, runDir, rep);
      if (r) say(`archived ${r.n} file(s) -> ${r.dest}`);
    } else if (s.kind === 'spawn') {
      const GD = gameDirOf(o);
      const stageList = o.stageAs ? o.stageAs.split(',').filter(Boolean) : [];
      const runMods = (o.runMods ? o.runMods : (o.mods || (sc ? sc.mods : []) || [])).filter(m => !stageList.includes(modName(m)));
      const staging = o.stageAs && o.scenario && GD && (!o.mock || o.game);
      if (staging) {
        // fixture -> <game>/mods/<stageAs> (approved test folder, already in the profile list; mod_set names it)
        const ins =spawnSync(process.execPath, [path.join(__dirname, 'scenarios', 'install.js'), '--game', GD, '--scenario', sc && sc.stageFiles ? sc.stageFiles.map(f => path.resolve(f)).join(',') : path.resolve(o.scenario), ...(sc && sc.stageFiles ? ['--overlay'] : []), '--as', o.stageAs, '--write', '--force'], { encoding: 'utf8' });
        if (ins.status !== 0) { rep.add('testrun', 0, 'TESTRUN_STAGE', 'fixture stage failed: ' + (ins.stdout + ins.stderr).trim().split('\n').pop()); break; }
        say(`staged fixture -> mods/${stageList.join(', mods/')}`);
      }
      // after staging: the list's mode comes from the staged mod.info
      const seedMods = [...runMods, ...stageList];
      // hard rule (live 2026-11-04: mod_set refused "made for Enhanced (with as64+) mode"): a modern mod is only accepted in a list that names as64+; mod_set replaces the list,
      // so as64+ goes first into the mod_set line when the scenario forgot it (--lint warns: WARN_LINT_ENHANCED_NO_AS64)
      const modern = o.noMods ? [] : seedMods.filter(m => modIsModern(GD, modName(m)) === true);
      if (isAs64Rules(o.gameId) && modern.length && !seedMods.some(m => modName(m).toLowerCase() === 'as64+')) {
        const ms = steps.find(x => x.kind === 'send' && /^mod_set /.test(x.cmd));
        if (ms) { ms.cmd = 'mod_set as64+ ' + ms.cmd.slice(8); ms.line = JSON.stringify({ id: JSON.parse(ms.line).id, cmd: ms.cmd }); seedMods.unshift('as64+'); rep.info('testrun', 0, 'TESTRUN_NOTE', 'as64+ added to mod_set: ' + modern.map(modName).join(',') + ' is made for Enhanced mode'); }
      }
      const clash = !o.noSeed && !o.noMods && o.inst >= 1 && o.inst <= 9 ? modeClash(seedList(seedMods, GD, isAs64Rules(o.gameId)), GD) : null;
      if (clash) { rep.add('testrun', 0, 'TESTRUN_MODE_MIX', `${clash}: the game would crash at startup (ENG-26), not launched`); aborted = true; break; }
      const keepList = keepsList(o, sc, stageList);
      if (keepList) say(`scenario ${sc.name} names no mods: instance ${o.inst} profile not reseeded, its own mod list kept`);
      const seeded = keepList ? null : seedInstance(o, seedMods, GD, say, rep);
      if (seeded) sum.seeded = seeded;
      if (staging) {
        const SL = stageList;
        // the game drops the test folder from options.set {mods} on exit (live 2026-11-03): unlisted = not mounted = false PASS on "file not found" checks
        // same user dir as the run: --home and --inst reach modswitch, or a read and a --relist write hit real instance 0
        const ms = path.join(__dirname, '..', 'modswitch', 'modswitch.js'), G = GD, PF = seeded ? ['--profile', seeded] : o.profile ? ['--profile', o.profile] : o.inst ? ['--inst', String(o.inst)] : [];
        const msEnv = o.home ? { ...process.env, AS2_HOME: o.home } : process.env;
        const active = ((/^active:\s*(.*)$/m.exec(spawnSync(process.execPath, [ms, '--game', G, ...PF], { encoding: 'utf8', env: msEnv }).stdout || '') || [])[1] || '').trim().split(/\s+/).filter(Boolean).map(m => m.replace(/:\d+$/, ''));
        const miss = SL.filter(f => !active.includes(f));
        // instance 0 is never seeded: its real list decides the mode
        // the as64+ this run adds to mod_set counts: mod_set replaces the list, so the unseeded profile need not name it (fix-later 65)
        const addedAs64 = seedMods.some(m => modName(m).toLowerCase() === 'as64+') && !active.some(m => modName(m).toLowerCase() === 'as64+');
        const clash0 = seeded ? null : modeClash([...(addedAs64 ? ['as64+'] : []), ...active, ...miss], G);
        if (clash0) { rep.add('testrun', 0, 'TESTRUN_MODE_MIX', `${clash0}: the game would crash at startup (ENG-26), not launched`); aborted = true; break; }
        if (miss.length) {
          if (!o.relist) { rep.add('testrun', 0, 'TESTRUN_STAGE', `mods/${miss.join(',')} not in the profile mod list (${active.join(',') || 'empty'}): the game drops it on exit; pass --relist or run modswitch --set ...,${o.stageAs} --write`); break; }
          const w = spawnSync(process.execPath, [ms, '--game', G, '--set', [...active, ...miss].join(','), '--write', ...PF], { encoding: 'utf8', env: msEnv });
          if (w.status !== 0) { rep.add('testrun', 0, 'TESTRUN_STAGE', 'relist failed: ' + (w.stdout + w.stderr).trim().split('\n').pop()); break; }
          say(`relisted ${miss.join(',')} in the profile mod list`);
        }
        if (!o.noPreflight && !(sc && sc.preflight === false)) {
          const errs = SL.flatMap(f => preflight(path.join(GD, 'mods', f), GD, o.gameId));
          for (const e of errs) rep.add('testrun', 0, 'TESTRUN_PREFLIGHT', `${e.tool} ${e.where}: ${e.code} ${e.msg} (fatal at startup or silently unmounted: fix the fixture; scenario "preflight": false skips)`);
          if (errs.length) break;
        }
      }
      if (o.mockCrash && o.mock) { if (o.profile && fs.existsSync(o.profile)) fs.appendFileSync(o.profile, '\r\n// game dropped the folder\r\n'); throw new Error('mock crash after staging'); }
      startMs = Date.now();
      if (o.mock) {
        if (!o.mockNoPipe && !mock) setTimeout(async () => { mock = await startMock(name, o, mockLog); }, 150);
        say('mock: no exe launched');
      } else {
        say(`spawn ${o.exe} ${exeArgs(o).join(' ')}`);
        sum.spawnAt = Date.now();
        if (!/\.js$/i.test(o.exe)) { const ev = exever.check(o.exe); sum.exe = { name: ev.name, sha: ev.sha, pe: ev.pe, known: ev.known }; say(`exe ${ev.name} ${ev.short}${ev.known ? '' : ' NEW BUILD'}`); if (!ev.known) rep.add('testrun', 0, 'WARN_EXE_NEW_BUILD', `${ev.name} sha ${ev.sha} not in modweb/porting/exe-versions.md: append a row, facts there may not hold`); }
        proc = spawn(o.exe, exeArgs(o), { cwd: path.dirname(o.exe), detached: true, stdio: 'ignore' });
        proc.on('error', e => rep.add('testrun', 0, 'TESTRUN_NO_EXE', 'spawn failed: ' + e.message));
        proc.unref();
        // crash/hang watch for the whole run: on a verdict the game is closed, its exit ends every wait below
        gw = gamewatch.watch({ pid: () => proc.pid, alive: () => proc.exitCode === null, exit: () => ({ code: proc.exitCode }), logFile: () => logf, startMs, hangSec: o.hangSec || 60, expectExit: () => qSent });
        gw.run(onWatch);
      }
    } else if (s.kind === 'connect') {
      let exited = false; if (proc) proc.on('exit', () => { exited = true; setTimeout(() => { if (client && !client.closed) client.close(); }, 1000); }); // process gone: every wait ends now
      client = await connectRetry(name, o.connectTimeout * 1000, () => exited);
      if (!client) {
        rep.add('testrun', 0, 'TESTRUN_NO_PIPE', NO_CONTROL_MSG + ` (no ${name} in ${o.connectTimeout}s${proc && proc.exitCode !== null ? '; exe exited ' + proc.exitCode : ''})`);
        if (!diagnosed) { diagnosed = true; diagnoseLog(logdir, rep, proc ? startMs - 5000 : 0); }
        aborted = true;
        break;
      }
      client.onEvent = m => { if (m.event === 'session_failed') rep.add('testrun', 0, 'TESTRUN_SESSION_FAILED', 'session_failed ' + JSON.stringify(m)); else if (m.event === 'sync' && m.inSync === false) rep.add('testrun', 0, 'TESTRUN_OOS', 'sync event: out of sync'); };
      const hello = await client.waitEvent('hello', 5000);
      rep.helloMs = Date.now() - startMs;
      say('connected' + (hello ? ` (pid ${hello.pid}, version ${hello.version}, protocol ${hello.protocol})` : ''));
      if (hello && hello.protocol < 2) rep.add('testrun', 0, 'TESTRUN_PROTOCOL', `pipe protocol ${hello.protocol} < 2: no pipe_events`);
    } else if (s.kind === 'verdict' || s.kind === 'triage') {
      // after the loop
    } else if (!client) {
      aborted = true; break;
    } else if (s.kind === 'segstart') {
      sum.segs[s.seg] = { start: rep.count };
    } else if (s.kind === 'live') {
      for (const v of s.items) { const r = await evalLive(client, v); liveRes.set(s.seg + ':' + v.ord, r); say('live ' + (r.pass ? 'PASS ' : 'FAIL ') + r.desc); }
      if (s.seg !== undefined && sum.segs[s.seg]) sum.segs[s.seg].end = rep.count;
    } else if (s.kind === 'send') {
      if (s.auto && qSent) continue;
      const to = (s.timeout || 30) * 1000;
      stageMark = client.events.length; logOff = logSize();
      let r = await client.send(s.cmd, to);
      // mp_ready reaches the card over the session net: mp_start a few ms later still sees "not ready"
      for (const end = Date.now() + 20000; s.cmd === 'mp_start' && r && !r.ok && /not ready|not up yet|busy/.test(r.error) && Date.now() < end && !client.closed;) {
        await new Promise(res => setTimeout(res, 500));
        r = await client.send(s.cmd, to);
      }
      // mp_set team.<t>.army answers at once but reaches the card only on the server's echo; a next mp_set before that resends
      // the stale teams/ (chain-n g2 team a stayed usa). Wait until mp_slots shows it; resend once.
      const tm = r && r.ok && /^mp_set\s+team\.(\w+)\.army\s+(\S+)/.exec(s.cmd);
      if (tm) {
        let shown = false;
        for (let tries = 0; tries < 2 && !shown && !client.closed; tries++) {
          if (tries) { say('> ' + s.cmd + '  (not on the card yet: resent)'); r = await client.send(s.cmd, to); }
          for (const end = Date.now() + (o.teamSettleMs ?? 10000); !shown && Date.now() < end && !client.closed;) {
            await new Promise(res => setTimeout(res, 100));
            const sl = await client.send('mp_slots', 5000);
            shown = !!(sl && sl.ok && (sl.output || []).some(l => new RegExp(`^team name=${tm[1]} .*army=${tm[2]}(\\s|$)`, 'i').test(l)));
          }
        }
        if (!shown) rep.add('testrun', 0, 'WARN_TESTRUN_TEAM_UNSET', `${s.cmd}: answered ok, but mp_slots never showed team ${tm[1]} army=${tm[2]} (MIS-66)`);
      }
      sum.cmds++;
      if (s.cmd === 'q') { qSent = true; qAt = Date.now(); }
      if (!s.soft) noReply = r ? 0 : noReply + 1;
      // no reply and the game is gone, or two in a row: the game stopped answering, every further command would wait its full timeout
      const dead = !r && !s.soft && (client.closed || procGone()), twice = !r && !s.soft && !dead && noReply >= 2;
      sum.answers.push({ cmd: s.cmd, ok: !!(r && r.ok), error: r ? r.error : 'no reply in ' + to / 1000 + 's' });
      if (s.soft) { if (!r || !r.ok) rep.info('testrun', 0, 'WARN_TESTRUN_QUIT', 'q gave no ok reply [T: exit via pipe unverified]; process will be killed'); say('> ' + s.cmd); continue; }
      if (s.mounted) {
        const e = r && r.ok ? (r.output || []).map(l => { try { return JSON.parse(l); } catch { return null; } }).find(m => m && m.name === s.mounted) : null;
        say(`> mod_list  -> ${s.mounted}: ${e ? JSON.stringify(e).slice(0, 200) : 'absent'}`);
        if (!e || e.applied === false) { rep.add('testrun', 0, 'TESTRUN_STAGE', `mods/${s.mounted} not loaded (${e ? 'applied:false' : 'absent from mod_list'}): checks would pass falsely; --relist`); aborted = true; break; }
        continue;
      }
      if (s.keep === 'probe') { say('> ' + s.cmd + (r && r.ok ? '  -> ' + (r.output || []).join(' | ').slice(0, 160) : '  !! ' + (r ? r.error : 'no reply'))); if (dead || twice) { if (twice) rep.add('testrun', 0, 'TESTRUN_CMD_STOPPED', 'two commands in a row got no reply: remaining commands not sent'); aborted = true; break; } continue; }
      if (s.keep === 'step') {
        const text = r ? (r.output || []).join('\n') + (r.error ? '\n' + r.error : '') : '';
        if (s.expect !== undefined) {
          if (!r || !new RegExp(s.expect, 'm').test(text)) { expectFails.push(s.cmd); rep.add('testrun', 0, 'TESTRUN_EXPECT_FAIL', `${s.cmd}: reply ${r ? JSON.stringify(text.slice(0, 120)) : '(none)'} does not match /${s.expect}/`); }
        } else if (joinRetry(s.cmd, r)) rep.info('testrun', 0, 'TESTRUN_NOTE', `${s.cmd}: ${r.error} (join retry, not a failure)`);
        else if (!r || !r.ok) { expectFails.push(s.cmd); rep.add('testrun', 0, 'TESTRUN_CMD_FAIL', `${s.cmd}: ${r ? r.error : 'no reply in ' + to / 1000 + 's'}`); }
        say('> ' + s.cmd + (r && r.output && r.output.length ? '  -> ' + r.output.join(' | ').slice(0, 160) : ''));
        if (dead || twice) { if (twice) rep.add('testrun', 0, 'TESTRUN_CMD_STOPPED', 'two commands in a row got no reply (' + to / 1000 + 's each): remaining commands not sent'); else rep.info('testrun', 0, 'TESTRUN_NOTE', 'game gone after ' + s.cmd + ': remaining commands not sent'); aborted = true; break; }
        continue;
      }
      if (!r) { rep.add('testrun', 0, 'TESTRUN_CMD_FAIL', `${s.cmd}: no reply in ${to / 1000}s${client.closed ? ` (pipe closed: ${sum.watch ? sum.watch.state : 'game gone, see watch'})` : ''}`); aborted = true; break; }
      if (!r.ok && joinRetry(s.cmd, r)) { rep.info('testrun', 0, 'TESTRUN_NOTE', `${s.cmd}: ${r.error} (join retry, not a failure)`); say('> ' + s.cmd + '  (retry reply)'); continue; }
      if (!r.ok) { rep.add('testrun', 0, 'TESTRUN_CMD_FAIL', `${s.cmd}: ${r.error}`); aborted = true; break; }
      say('> ' + s.cmd + (r.output && r.output.length ? '  -> ' + r.output.join(' | ').slice(0, 160) : ''));
      if (s.cmd === 'mp_result') sum.result = r.output.join(' ');
      if (s.cmd === 'mp_state') sum.state = r.output.join(' ');
      if (s.cmd === 'mp_lan') rep.info('testrun', 0, 'TESTRUN_NOTE', 'TST-03: LAN lobby has no bot opponents: enemies must come from the map/scenario');
    } else if (s.kind === 'wait' && s.stage) {
      const m = await client.waitStage(s.user ? client.events.length : stageMark, s.section, s.timeout * 1000);
      if (m) say('stage ' + m.section + ' active');
      else { rep.add('testrun', 0, 'TESTRUN_STAGE_TIMEOUT', `no stage event with state "active" in ${s.timeout}s${client.closed ? ' (pipe closed)' : ''}`); if (!s.user) { aborted = true; break; } }
    } else if (s.kind === 'wait') {
      const m = await client.waitEvent(s.event, s.timeout * 1000);
      if (m) say('event ' + s.event);
      else if (s.user) rep.add('testrun', 0, 'TESTRUN_WAIT_TIMEOUT', `no "${s.event}" event in ${s.timeout}s${client.closed ? ' (pipe closed)' : ''}`);
      else if (s.event === 'loaded') { rep.add('testrun', 0, 'TESTRUN_LOAD_TIMEOUT', `no "loaded" event in ${s.timeout}s${client.closed ? ' (pipe closed: game crashed?)' : ''}`); aborted = true; break; }
      else rep.add('testrun', 0, 'TESTRUN_OVER_TIMEOUT', `no "${s.event}" event in ${s.timeout}s`);
    } else if (s.kind === 'waitlog') {
      const rx = new RegExp(s.re, 'm'), end = Date.now() + s.timeout * 1000, t0 = Date.now();
      let hit = false;
      if (!logf) rep.add('testrun', 0, 'TESTRUN_WAITLOG_TIMEOUT', `no game.log path (--logdir): /${s.re}/ can not be watched`);
      else {
        for (;;) {
          if (rx.test(logSince(logOff))) { hit = true; break; }
          if (Date.now() >= end) break;
          if (client.closed || procGone()) { hit = rx.test(logSince(logOff)); break; }
          await sleep(250);
        }
        if (hit) say(`game.log /${s.re}/ after ${Date.now() - t0} ms`);
        else rep.add('testrun', 0, 'TESTRUN_WAITLOG_TIMEOUT', `no game.log line matching /${s.re}/ in ${s.timeout}s${client.closed || procGone() ? ' (game gone)' : ''}`);
      }
    } else if (s.kind === 'hold') {
      say(`hold ${s.secs}s`);
      for (const end = Date.now() + s.secs * 1000; Date.now() < end && !(client.closed || procGone());) await sleep(Math.min(250, Math.max(1, end - Date.now())));
    }
  }
  sum.aborted = aborted;

  // quit + exit watch (TST-16): q, then up to 20 s for the process (mock: pipe close), then kill
  if (client && !client.closed && !qSent) { await client.send('q', 2000); qSent = true; qAt = Date.now(); }
  if (!qAt) qAt = Date.now();
  const exited = () => (proc ? proc.exitCode !== null : client ? client.closed : true);
  let exitMs = null;
  if (proc || o.scenario || o.probe) {
    while (!exited() && Date.now() - qAt < (o.exitWait || 20) * 1000) await sleep(proc ? 200 : 25);
    if (exited()) exitMs = Math.max(0, Date.now() - qAt);
  }
  sum.exitMs = exitMs;
  if (client) { sum.events = client.counts; if (!(proc || o.scenario || o.probe)) await sleep(client.closed ? 0 : 100); }
  if (client && runDir && client.raw.length) {
    try { fs.mkdirSync(runDir, { recursive: true }); fs.writeFileSync(path.join(runDir, 'pipe.jsonl'), client.raw.map(r => JSON.stringify(r)).join('\n') + '\n'); } catch (e) { /* archive is best effort */ }
  }
  if (client) client.close();
  if (proc && proc.exitCode === null) { try { process.kill(proc.pid); } catch (e) {} rep.info('testrun', 0, 'WARN_TESTRUN_QUIT', 'exe still running 20s after quit: killed'); }
  if (gw) { gw.stop(); sum.maxQuietMs = gw.maxQuietMs; say(`watch: longest log quiet ${gw.maxQuietMs} ms`); if (!sum.watch && proc.exitCode !== null) { const v = await gw.tick(); if (v) onWatch(v); } } // exit seen between two polls
  if (mock) { try { mock.close(); } catch (e) {} }
  sum.mockLog = mockLog;

  // verdicts (scenario): game.log regex + process exit
  const vstep = steps.find(s => s.kind === 'verdict');
  if (vstep) {
    const logf = logdir && path.join(logdir, 'game.log');
    // refused before spawn: the log on disk is the last run's, a verdict on it would pass falsely (live 2026-11-04)
    const notRun = !o.mock && !sum.spawnAt;
    // REVHARNESS (rev-harness 19): an exe that spawned but died before writing game.log leaves the last run's log; same 2 s slack as logSize/logSince above
    const lv = verdictLogOf(logf, notRun, sum.spawnAt), text = lv.text;
    if (lv.stale) rep.add('game.log', 0, 'TESTRUN_LOG_STALE', 'game.log is older than this launch (exe died before writing it?): log verdicts read no log');
    // AI-4: --logdir pointed at a folder the game never writes (a run dir): every log verdict reads no log and FAILs; name the folder the instance does write
    if (o.logdir && !notRun && text === null && !lv.stale && vstep.verdict.some(v => v.log !== undefined)) {
      let def = null; try { def = defaultLogDir(o); } catch (e) { /* no profile dir */ }
      const fresh = def && path.resolve(def) !== path.resolve(logdir) && fs.existsSync(path.join(def, 'game.log')) && fs.statSync(path.join(def, 'game.log')).mtimeMs >= (sum.spawnAt || 0) - 2000;
      rep.add('game.log', 0, 'TESTRUN_LOGDIR_EMPTY', `--logdir ${logdir} has no game.log: log verdicts read no log and fail` + (fresh ? `; instance ${o.inst} wrote its log to ${def} (drop --logdir or point it there; use --archive for the copy)` : ' (the game writes game.log to its instance log dir, not to a run folder)'));
    }
    // only an explicit --logdir can hold another instance's log (each instance has its own log/, TST-22): its CMD: line names the instance.
    // mock pipe ids (--inst 47xx) skip the check
    const cmdLine = o.logdir && text && (text.match(/^CMD: .*$/m) || [])[0];
    const logInst = cmdLine ? +((/(?:^|\s)-instance\s+(\d+)/.exec(cmdLine) || [])[1] || 0) : null;
    const foreign = logInst !== null && o.inst <= 9 && logInst !== o.inst;
    if (foreign && vstep.verdict.some(v => v.log !== undefined)) rep.add('game.log', 0, 'TESTRUN_LOG_FOREIGN', `--logdir game.log CMD: is instance ${logInst}, this run is ${o.inst}: log verdicts undecided (point --logdir at instance ${o.inst}'s log dir)`);
    for (const v of vstep.verdict) {
      let pass, desc;
      if (isLive(v)) {
        const lr = liveRes.get(v.seg + ':' + v.ord);
        pass = !!(lr && lr.pass); desc = lr ? lr.desc : liveDesc(v) + ' (not evaluated: run ended before the scenario end)';
      } else if (v.log !== undefined) {
        const want = v.want !== false;
        desc = `game.log ${want ? 'matches' : 'has no match for'} /${v.log}/${notRun ? ' (not evaluated: game not launched)' : ''}`;
        pass = text === null || foreign ? false : new RegExp(v.log, 'm').test(text) === want;
        if (!pass && !want && text !== null && !foreign) desc = `game.log matches forbidden /${v.log}/`;
        if (text === null) desc += lv.stale ? ' (game.log older than this launch)' : ' (no game.log)';
        else if (foreign) desc += ` (--logdir game.log is instance ${logInst}'s)`;
      } else {
        const want = v.exit !== false, within = (v.within || 20) * 1000;
        const did = exitMs !== null && exitMs <= within;
        desc = `process ${want ? 'exits' : 'stays up'} within ${v.within || 20}s` + (exitMs !== null ? ` (exited after ${exitMs} ms)` : ' (no exit seen)');
        pass = did === want;
      }
      sum.verdicts.push({ pass, desc, row: v.row || null, seg: v.seg });
      if (!pass) rep.add('testrun', 0, 'TESTRUN_VERDICT_FAIL', desc + (v.row ? ' [' + v.row + ']' : ''));
    }
    // a log check alone can read PASS on a game that died or hung: the run itself fails
    if (gamewatch.isFailure(sum.watch)) sum.verdicts.push({ pass: false, desc: `game ${sum.watch.state}: ${sum.watch.reason}`, row: null, seg: undefined });
    // "no error found" proves nothing: a pass needs something seen (log match, reply, event)
    const positive = (sc.members || [sc]).some(m => (m.steps || []).some(st => st.expect !== undefined)) || vstep.verdict.some(v => isLive(v) || (v.log !== undefined && v.want !== false) || (v.exit !== undefined && v.row)); // exit is the signal only for a row tagged on it (quit tests)
    sum.signal = positive;
    if (!positive && vstep.verdict.length) rep.add('testrun', 0, 'WARN_TESTRUN_NO_SIGNAL', 'no positive check in this scenario (only absent log lines or exit): rows not passed. add a log match, reply or event');
    const rows = new Set(sc.rows);
    for (const v of vstep.verdict) if (v.row) rows.add(v.row);
    const noRun = aborted || rep.counts.TESTRUN_NO_PIPE || rep.counts.TESTRUN_RUNNING;
    for (const id of rows) {
      const tagged = sum.verdicts.filter(v => v.row === id);
      let ok;
      if (noRun) ok = false;
      else if (tagged.length) ok = tagged.every(v => v.pass);
      else ok = sum.verdicts.every(v => v.pass) && !expectFails.length;
      if (!positive) ok = false;
      sum.rows.push({ id, pass: ok, manual: sc.manual || undefined });
    }
  }
  if (logdir && fs.existsSync(path.join(logdir, 'game.log'))) {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'logtriage', 'logtriage.js'), logdir, '-q', '--summary', ...(sum.spawnAt ? ['--since', String(sum.spawnAt)] : []), ...triageExe(o)], { encoding: 'utf8' });
    sum.triage = (r.stdout || r.stderr || '').trim().split('\n');
    sum.triageCounts = {};
    for (const l of sum.triage) { const m = l.match(/^([A-Z][A-Z0-9_]+) (\d+) \|/); if (m) sum.triageCounts[m[1]] = +m[2]; }
  }
  return { rep, sum };
}

// ---- staging guard + backup/restore (--backup <dir>)
// only these mods/<folder>s may be staged by testrun; the game keeps them in its profile mod list. anything else is refused.
const APPROVED = TF.FOLDERS; // tools/lib/testfolders.js: e2e_test, e2e_test2..e2e_test8
function gameDirOf(o) { return o.game || (o.exe ? path.dirname(o.exe) : null); }
function stageRefusal(o) {
  if (!o.stageAs) return null;
  const bad = o.stageAs.split(',').filter(Boolean).filter(f => !TF.isApproved(f));
  return bad.length ? `--stage-as folder(s) ${bad.join(',')} not approved: only ${APPROVED.join(', ')} may be staged or restored` : null;
}
const inside = (child, parent) => { const r = path.relative(path.resolve(parent), path.resolve(child)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
function copyTree(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) copyTree(path.join(src, f), path.join(dst, f)); }
  else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
}
// differences between two trees (relative paths); [] = identical bytes
function treeDiff(a, b) {
  const list = d => { const out = []; const w = (p, rel) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) { out.push(r + '/'); w(path.join(p, e.name), r); } else out.push(r); } }; if (fs.existsSync(d)) w(d, ''); return out.sort(); };
  const la = list(a), lb = list(b), diffs = [];
  for (const r of la) if (!lb.includes(r)) diffs.push('only in backup: ' + r);
  for (const r of lb) if (!la.includes(r)) diffs.push('only in game: ' + r);
  for (const r of la) if (lb.includes(r) && !r.endsWith('/') && !fs.readFileSync(path.join(a, r)).equals(fs.readFileSync(path.join(b, r)))) diffs.push('differs: ' + r);
  return diffs;
}
function findProfile(o) {
  if (o.profile) return fs.existsSync(o.profile) ? path.resolve(o.profile) : null;
  const out = ud.profiles(realInst(o), { home: o.home });
  return out.length === 1 ? out[0] : null;
}
function backupBegin(o) {
  const G = gameDirOf(o), dir = path.resolve(o.backup), b = { dir, game: G, folders: [], profile: null, errs: [] };
  if (G && inside(dir, G)) b.errs.push(`--backup ${dir} is inside the game install ${G}: refused (testrun writes only mods/${APPROVED.join(', mods/')} there)`);
  const refused = stageRefusal(o);
  if (refused) b.errs.push(refused);
  const names = o.stagePool || (o.stageAs ? o.stageAs.split(',').filter(Boolean) : []);
  if (names.length && !G) b.errs.push('--backup with --stage-as needs --exe or --game');
  if (b.errs.length) return b;
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const x of ['mods', 'options.set', 'restore.json']) fs.rmSync(path.join(dir, x), { recursive: true, force: true }); // stale snapshot of an earlier run
    for (const f of names) {
      const src = path.join(G, 'mods', f), existed = fs.existsSync(src);
      if (existed) copyTree(src, path.join(dir, 'mods', f));
      b.folders.push({ name: f, existed });
    }
    const p = findProfile(o);
    if (p) { fs.copyFileSync(p, path.join(dir, 'options.set')); b.profile = p; }
    fs.writeFileSync(path.join(dir, 'backup.json'), JSON.stringify({ game: G, folders: b.folders, profile: b.profile }, null, 1) + '\n');
  } catch (e) { b.errs.push('backup failed: ' + e.message); }
  return b;
}
// puts back every staged folder and options.set, compares bytes, writes <dir>/restore.json. never throws
function backupRestore(b) {
  const res = { restored: true, folders: [], profile: null, details: [] };
  for (const f of b.folders) {
    const dest = path.join(b.game, 'mods', f.name), bak = path.join(b.dir, 'mods', f.name);
    let ok = false, why = '';
    try {
      if (!TF.isApproved(f.name) || !inside(dest, path.join(b.game, 'mods')) || path.basename(dest) !== f.name) throw new Error('not approved');
      fs.rmSync(dest, { recursive: true, force: true });
      if (f.existed) copyTree(bak, dest);
      const d = f.existed ? treeDiff(bak, dest) : (fs.existsSync(dest) ? ['still exists'] : []);
      ok = d.length === 0; why = d.slice(0, 5).join('; ');
    } catch (e) { why = e.message; }
    res.folders.push({ name: f.name, existed: f.existed, ok }); if (!ok) { res.restored = false; res.details.push(`mods/${f.name}: ${why}`); }
  }
  if (b.profile) {
    let ok = false;
    try {
      const bak = path.join(b.dir, 'options.set');
      if (!fs.readFileSync(b.profile).equals(fs.readFileSync(bak))) fs.copyFileSync(bak, b.profile);
      ok = fs.readFileSync(b.profile).equals(fs.readFileSync(bak));
    } catch (e) { res.details.push('options.set: ' + e.message); }
    res.profile = { path: b.profile, ok }; if (!ok) res.restored = false;
  }
  try { fs.writeFileSync(path.join(b.dir, 'restore.json'), JSON.stringify(res, null, 1) + '\n'); } catch (e) { /* best effort */ }
  return res;
}
// runs fn between backupBegin and backupRestore; restore also on throw and on SIGINT/SIGTERM. -> {res, crash, backup, errs}
async function withBackup(o, fn) {
  if (!o.backup || o.dry) return { res: await fn() };
  const b = backupBegin(o);
  if (b.errs.length) return { errs: b.errs };
  let rb = null;
  const doRestore = () => { if (!rb) rb = backupRestore(b); return rb; };
  const sig = () => { doRestore(); process.exit(130); };
  process.on('SIGINT', sig); process.on('SIGTERM', sig);
  let res, crash = null;
  try { res = await fn(); } catch (e) { crash = e; }
  doRestore();
  process.removeListener('SIGINT', sig); process.removeListener('SIGTERM', sig);
  return { res, crash, backup: rb };
}

// ---- --lint: static checks of scenario files (no game)
function unescapedParens(re) {
  const bad = [], stack = [];
  let cls = false;
  for (let i = 0; i < re.length; i++) {
    const c = re[i];
    if (c === '\\') { i++; continue; }
    if (cls) { if (c === ']') cls = false; continue; }
    if (c === '[') cls = true;
    else if (c === '(') stack.push({ i, alt: false, q: re[i + 1] === '?' });
    else if (c === '|' && stack.length) stack[stack.length - 1].alt = true;
    else if (c === ')') {
      const g = stack.pop();
      if (!g) { bad.push(i); continue; }
      // a group that looks like a real group (alternation, (?..), quantified) is fine; a plain (text) is a literal-paren slip
      if (!g.alt && !g.q && !(re[i + 1] && '*+?{'.includes(re[i + 1]))) bad.push(g.i);
    }
  }
  for (const g of stack) bad.push(g.i);
  return bad.sort((a, b) => a - b);
}
function lintFile(file, rep) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/') || file;
  let text, sc;
  try { text = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); sc = JSON.parse(text); } catch (e) { rep.add(rel, 0, 'LINT_PARSE', e.message); return; }
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) { rep.add(rel, 0, 'LINT_PARSE', 'not an object'); return; }
  const lineOf = needle => { const i = text.indexOf(needle); return i < 0 ? 0 : text.slice(0, i).split('\n').length; };
  const lit = s => JSON.stringify(s).slice(1, -1);
  const verdicts = Array.isArray(sc.verdict) ? sc.verdict.filter(Boolean) : [];
  const positive = verdicts.some(v => (v.log !== undefined && v.want !== false) || (v.exit !== undefined && v.exit !== false) || ((v.reply !== undefined || v.event !== undefined) && v.want !== false));
  const ex = (sc.steps || []).filter(s => s && s.expect !== undefined).length; // a step expect is a positive check (TESTRUN_EXPECT_FAIL)
  if (!positive && !ex) {
    rep.add(rel, lineOf('"verdict"'), 'LINT_NEGATIVE_ONLY', (verdicts.length ? 'every verdict is want:false / log absence / exit:false' : 'no verdicts') + ': passes when nothing happens (a dead launch passes too); add a positive log match, exit, reply or event verdict');
  }
  const noParam = s => s.replace(/\{(\w+)\}/g, 'x'); // {key} params are filled in at run time
  const checkRe = (s, what) => { if (typeof s !== 'string') return; if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)) rep.add(rel, lineOf(lit(s)), 'LINT_REGEX', `${what} ${JSON.stringify(s)} has a control character: write \\\\b in JSON, not \\b`); try { new RegExp(noParam(s)); } catch (e) { rep.add(rel, lineOf(lit(s)), 'LINT_REGEX', `${what} /${s}/ does not compile: ${e.message}`); } };
  for (const v of verdicts) { checkRe(v.log, 'log regex'); checkRe(v.match, 'reply regex'); }
  for (const s of sc.steps || []) if (s) { checkRe(s.expect, 'step expect'); checkRe(s.wait_log, 'wait_log regex'); }
  for (const v of verdicts) {
    if (typeof v.log !== 'string') continue;
    const bad = unescapedParens(v.log);
    if (bad.length) rep.add(rel, lineOf(lit(v.log)), 'LINT_UNESCAPED', `log regex /${v.log}/ has unescaped ${bad.map(i => v.log[i]).join('')} at ${bad.join(',')}: regex group, not the literal paren in the log line (use \\( \\))`);
  }
  for (const s of sc.steps || []) if (s && typeof s.wait_log === 'string') {
    const bad = unescapedParens(s.wait_log);
    if (bad.length) rep.add(rel, lineOf(lit(s.wait_log)), 'LINT_UNESCAPED', `wait_log regex /${s.wait_log}/ has unescaped ${bad.map(i => s.wait_log[i]).join('')} at ${bad.join(',')}: regex group, not the literal paren in the log line (use \\( \\))`);
  }
  const sg = scenarioGame(sc), gid = sg && sg.id;
  if (sg && sg.err) rep.add(rel, lineOf('"game"'), 'LINT_GAME', sg.err);
  if (gid && NO_PIPE[gid]) for (const n of pipeNeeds(sc)) rep.add(rel, lineOf(n.startsWith('step') ? '"steps"' : '"verdict"'), 'LINT_NO_PIPE', `${n} needs the control pipe: ${games.get(gid).name} has none (${NO_PIPE[gid][1]}); check game.log instead (log verdict, wait_log)`);
  if (!isAs64Rules(gid) && (sc.mods || []).some(m => modName(String(m)).toLowerCase() === 'as64+')) rep.add(rel, lineOf('"mods"'), 'LINT_GAME_AS64', `"mods" names as64+, the built-in mod of AS64: ${games.get(gid).name} has none`);
  const dirs = [path.join(path.dirname(file), 'mods'), path.join(__dirname, 'scenarios', 'mods')];
  for (const f of Array.isArray(sc.fixture) ? sc.fixture : []) {
    const root = dirs.map(d => path.join(d, f)).find(d => fs.existsSync(d));
    if (!root) continue;
    if (gid === 'mowas2' && infoIsModern(path.join(root, 'mod.info'))) rep.add(rel, lineOf('"fixture"'), 'WARN_LINT_GAME_VERSION', `fixture ${f} has MinGameVersion >= 3.301: MoW:AS2 (3.262) leaves it out (vfs MOD_VERSION); use "3.262"`);
    if (isAs64Rules(gid) && infoIsModern(path.join(root, 'mod.info')) && !(sc.mods || []).some(m => modName(String(m)).toLowerCase() === 'as64+')) rep.add(rel, lineOf('"mods"'), 'WARN_LINT_ENHANCED_NO_AS64', `fixture ${f} is made for Enhanced mode (MinGameVersion >= 3.301) but "mods" has no as64+: mod_set refuses it unless as64+ is listed (testrun adds it itself; add "as64+" before it to be explicit)`);
    const w = (d, r) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = r ? r + '/' + e.name : e.name; if (e.isDirectory()) { if (!/\.zipsrc$/.test(e.name)) w(path.join(d, e.name), p); } else if (/\.txt$/i.test(e.name)) rep.add(rel, lineOf('"fixture"'), 'LINT_TXT_FIXTURE', `fixture ${f} ships loose ${p}: engine SkipExtension hides .txt from mounting (VFS-06); use .cfg`); } };
    w(root, '');
  }
  for (const p of Array.isArray(sc.prepare) ? sc.prepare : []) for (const a of (p && p.argv) || []) if (/\.txt$/i.test(String(a))) rep.add(rel, lineOf(lit(a)) || lineOf('"prepare"'), 'LINT_TXT_FIXTURE', `prepare writes loose ${a}: engine SkipExtension hides .txt from mounting (VFS-06); use .cfg`);
  if (sc.manual !== undefined) rep.add(rel, lineOf('"manual"'), 'LINT_MANUAL', 'has manual field: a PASS needs a human look, unattended runs report MANUAL (queue: skipped)');
}

// ---- queue: several scenario files, one launch each unless they need no restart (sameLaunch:true + same mode/mods/fixture/params)
function readField(file, k) { try { const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); return j && typeof j[k] === 'string' && j[k] ? j[k] : null; } catch (e) { return null; } }
function readManual(file) { try { const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); return j && j.manual ? String(j.manual) : null; } catch (e) { return null; } }
function groupQueue(items) {
  const groups = [];
  for (const it of items) {
    const g = it.sc.game && it.sc.game !== 'as64' ? [it.sc.game] : [];   // scenarios of different games never share a launch
    const key = JSON.stringify([it.sc.mode, it.sc.mods, it.sc.fixture || [], it.sc.params, it.sc.players || null, ...g]);
    const last = groups[groups.length - 1];
    if (last && it.sc.sameLaunch === true && last.items[0].sc.sameLaunch === true && last.key === key) last.items.push(it);
    else groups.push({ key, items: [it] });
  }
  return groups;
}
function mergeScenarios(items, shared) {
  const first = items[0].sc;
  const sum = shared ? { mods: [...new Set(items.flatMap(i => i.sc.mods))], fixture: [...new Set(items.flatMap(i => i.sc.fixture || []))], stagePatches: Object.assign({}, ...items.map(i => i.sc.stagePatches || {})), stageFiles: items.filter(i => (i.sc.fixture || []).length).map(i => i.file), preflight: items.some(i => i.sc.preflight === false) ? false : first.preflight } : {};
  return Object.assign({}, first, { name: items.map(i => i.sc.name).join('+'), rows: [...new Set(items.flatMap(i => i.sc.rows))], members: items.map(i => i.sc), steps: [], verdict: [] }, sum);
}
// one launch (a group of scenarios) -> queue rows. ex = {inst, stageAs} per worker. never throws
async function execGroup(g, n, o, stamp, ex) {
  const t0 = Date.now(), merged = g.items.length > 1;
  const sc = merged ? mergeScenarios(g.items, g.overlap) : g.items[0].sc;
  const o2 = Object.assign({}, o, { queue: null, queueDir: null, queueRun: true, scenario: g.items[0].file, scenarioObj: sc, gameId: g.items[0].gameId || o.gameId, q: true, errs: [], runName: `${stamp}-${String(n).padStart(2, '0')}-${sc.name}`.replace(/[^\w.+-]/g, '_') }, ex || {});
  let res;
  try { res = await run(o2); } catch (e) { res = { rep: createReport(), sum: { verdicts: [], segs: [], aborted: true }, crash: e }; res.rep.add('testrun', 0, 'TESTRUN_CRASH', e.message); }
  const fnd = res.rep.toJSON({ tool: 'testrun' }).findings.filter(f => f.code !== 'TESTRUN_VERDICT_FAIL'), t1 = Date.now();
  return g.items.map((it, i) => {
    const own = merged ? res.sum.verdicts.filter(v => v.seg === i) : res.sum.verdicts;
    const seg = merged ? res.sum.segs[i] : null;
    const pre = merged ? (res.sum.segs[0] ? res.sum.segs[0].start : fnd.length) : 0;
    const myFind = merged ? (seg && seg.end !== undefined ? fnd.slice(seg.start, seg.end) : []) : fnd;
    const reached = !merged || (seg && seg.end !== undefined);
    const fails = own.filter(v => !v.pass).map(v => v.desc);
    const reasons = [...(merged && pre ? fnd.slice(0, pre) : []), ...myFind].map(f => f.code + ' ' + f.msg).concat(fails);
    if (!reached) reasons.push('not reached: launch aborted before this scenario');
    const pass = reached && reasons.length === 0;
    const row = { file: it.file, name: it.name, status: pass ? 'PASS' : 'FAIL', launch: n, ms: t1 - t0, verdicts: own.map(v => ({ pass: v.pass, desc: v.desc })), rows: merged ? (it.sc.rows || []).map(id => ({ id, pass })) : res.sum.rows, findings: merged ? myFind.length : fnd.length, reasons };
    row.archive = res.sum.runDir || null;
    row.inst = o2.inst; row.log = res.sum.logdir ? path.join(res.sum.logdir, 'game.log') : null;
    row.folders = o2.stageAs ? o2.stageAs.split(',') : []; row.start = t0; row.end = t1;
    return row;
  });
}
// a FAILed launch's engine exception -> its message | null. PASS launches can expect an exception, and a log older than the launch is another run's
function crashOf(rows) {
  const r = rows.find(x => x.status === 'FAIL' && x.log);
  if (!r) return null;
  try {
    if (fs.statSync(r.log).mtimeMs < r.start - 2000) return null;
    const m = /\*+ Exception \*+\r?\n(.+)/.exec(fs.readFileSync(r.log, 'latin1'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const stopRows = (g, why, status) => g.items.map(it => ({ file: it.file, name: it.name, status: status || 'FAIL', error: 'TESTRUN_QUEUE_STOPPED ' + why }));
// reason codes of a launch's FAIL rows that point at the harness or the game (not at the scenario's own verdict): sorted, joined. '' = nothing harness-like
const SCENARIO_CODES = new Set(['TESTRUN_VERDICT_FAIL', 'TESTRUN_EXPECT_FAIL', 'TESTRUN_WAIT_TIMEOUT', 'TESTRUN_WAITLOG_TIMEOUT', 'TESTRUN_QUEUE_STOPPED']);
function failSig(rows) {
  const codes = new Set();
  for (const r of rows) if (r.status === 'FAIL') for (const x of r.reasons || []) { const m = /^(TESTRUN_[A-Z0-9_]+)/.exec(x); if (m && !SCENARIO_CODES.has(m[1])) codes.add(m[1]); }
  return [...codes].sort().join('+');
}
// launch outcome that means the game died or hung (a solo re-run of the same scenario would only open another crash dialog)
const isCrashRow = r => r.status === 'FAIL' && (r.reasons || []).some(x => /^TESTRUN_(LOAD_TIMEOUT|NO_PIPE|ENGINE_EXCEPTION|CRASH|HANG|CMD_STOPPED|SESSION_FAILED)/.test(x));
async function runQueue(files, o) {
  // the same crash in 2 launches stops the queue: every further launch would only put another exception dialog on the user's screen
  const seen = new Map();
  let stopped = null, stopStatus = 'FAIL', streak = 0, lastSig = '';
  const maxSame = o.maxSameFail === undefined ? 3 : o.maxSameFail;
  // N launches in a row failing with the same harness reason code(s) and no pass between: stop, the rest is NORUN
  const noteSame = rows => {
    if (!rows.length) return;
    const sig = rows.some(x => x.status === 'FAIL') ? failSig(rows) : '';
    if (!sig) { streak = 0; lastSig = ''; return; }
    streak = sig === lastSig ? streak + 1 : 1; lastSig = sig;
    if (maxSame > 0 && streak >= maxSame && !stopped) { stopped = `${streak} launches in a row failed with ${sig} and no pass between (--max-same-fail ${maxSame}): not launching the rest`; stopStatus = 'NORUN'; console.error(stopped); }
  };
  const noteCrash = rows => { noteSame(rows); const c = crashOf(rows); if (!c) return; seen.set(c, (seen.get(c) || 0) + 1); if (seen.get(c) >= 2 && !stopped) { stopped = `same crash in ${seen.get(c)} launches, not launching the rest: ${c}`; stopStatus = 'FAIL'; console.error(stopped); } };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const W = o.workers || 1, par = W > 1 || !!o.overlap;
  const pool = par ? (o.stagePool || (o.stageAs ? o.stageAs.split(',').filter(Boolean) : APPROVED)) : null;
  const out = { tool: 'testrun', queue: [], launches: 0, workers: W };
  const runnable = [];
  for (const file of files) {
    const base = { file, name: path.basename(file, '.json') };
    const quar = readField(file, 'quarantine');
    if (quar) { out.queue.push(Object.assign(base, { status: 'NORUN', error: 'quarantined: ' + quar })); if (o.dry) console.log(`NORUN ${base.name}: quarantined: ${quar}`); continue; }
    const manual = readManual(file);
    if (manual) { out.queue.push(Object.assign(base, { status: 'MANUAL', manual })); continue; }
    const lo = Object.assign({}, o, { params: Object.assign({}, o.params) });
    if (par) { delete lo.stageAs; lo.stagePool = pool; }
    const l = loadScenario(file, lo);
    if (l.errs.length) { const norun = l.errs.every(e => /param \S+ needed|needs mission|testrun: not available for /.test(e)); out.queue.push(Object.assign(base, { status: norun ? 'NORUN' : 'FAIL', error: l.errs.join('; ') })); if (o.dry) console.log(`${norun ? 'NORUN' : 'FAIL'} ${base.name}: ${l.errs.join('; ')}`); continue; }   // NORUN: template, needs a --param; dry prints the row, as the quarantine line does
    runnable.push(Object.assign(base, { name: l.sc.name, sc: l.sc, gameId: l.sc.game || o.gameId }));   // the scenario's "game" picks the plan (pipe, args, seeding, triage)
  }
  const groups = o.overlap ? overlap.plan(runnable) : groupQueue(runnable);
  if (o.overlap) { out.overlap = { planned: groups.length, without: runnable.length, retried: [] }; console.log(`overlap: ${groups.length} launch(es) instead of ${runnable.length}`); }
  if (o.dry || !par) {
    for (const g of groups) {
      if (stopped) { out.queue.push(...stopRows(g, stopped, stopStatus)); continue; }
      const n = ++out.launches;
      if (o.dry) { const sc = g.items.length > 1 ? mergeScenarios(g.items, g.overlap) : g.items[0].sc; console.log(`== launch ${n}: ${g.items.map(i => i.name).join(', ')}${g.items.length > 1 ? (g.overlap ? '  (overlap: one game start)' : '  (sameLaunch: one game start)') : ''}`); await run(Object.assign({}, o, { queue: null, queueDir: null, scenario: g.items[0].file, scenarioObj: sc, gameId: g.items[0].gameId || o.gameId, errs: [], dry: true })); continue; }
      const rows = await execGroup(g, n, o, stamp);
      out.queue.push(...rows); noteCrash(rows);
    }
  } else {
    // parallel: worker w runs one game (instance w+1, mock: o.inst+w). The stage folders are one shared pool; a group takes all it needs at once
    // (atomic, so two 2-folder groups can't each hold one and wait) and returns them when its game ends; a group without fixtures needs none.
    const pending = [];
    for (const g of groups) {
      const need = g.need !== undefined ? g.need : (g.items[0].sc.fixture || []).length;
      if (need > pool.length) for (const it of g.items) out.queue.push({ file: it.file, name: it.name, status: 'FAIL', error: `needs ${need} stage folder(s), pool has ${pool.length} (${pool.join(',')})` });
      else pending.push({ g, need });
    }
    const free = pool.slice();
    let waiters = [];
    const wake = () => { const w = waiters; waiters = []; w.forEach(r => r()); };
    const worker = async slot => {
      for (;;) {
        let k;
        for (;;) {
          if (!pending.length) return;
          k = pending.findIndex(p => p.need <= free.length);
          if (k >= 0) break;
          await new Promise(r => waiters.push(r));
        }
        const p = pending.splice(k, 1)[0], folders = free.splice(0, p.need), n = ++out.launches;
        try { const rows = await execGroup(p.g, n, o, stamp, { inst: o.mock ? o.inst + slot : TF.instFor(slot + 1, o.inst) || 1 + slot, stageAs: folders.length ? folders.join(',') : undefined, relist: false });
          if (p.g.firstTry) for (const r of rows) r.overlapFirst = p.g.firstTry;
          // a FAIL in a shared launch may be another member's doing: re-run it alone, that run decides
          // ... but never after a crash/hang: that would only open another crash dialog
          const crashed = p.g.overlap && (crashOf(rows) || rows.some(isCrashRow));
          const again = p.g.overlap && !crashed ? rows.filter(r => r.status === 'FAIL') : [];
          if (crashed) for (const r of rows) if (r.status === 'FAIL') r.reasons = (r.reasons || []).concat('no solo retry after a crash/hang');
          for (const r of again) {
            const it = p.g.items.find(x => x.file === r.file);
            out.overlap.retried.push(r.name);
            pending.push({ g: { key: p.g.key, items: [it], overlap: false, firstTry: r.reasons }, need: (it.sc.fixture || []).length });
          }
          if (again.length) out.queue.push(...rows.filter(r => !again.includes(r))); else { out.queue.push(...rows); noteCrash(rows); }
        }
        finally {
          free.push(...folders); free.sort((x, y) => pool.indexOf(x) - pool.indexOf(y));
          if (stopped) for (const q of pending.splice(0)) out.queue.push(...stopRows(q.g, stopped, stopStatus));
          wake();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(W, pending.length) }, (_, i) => worker(i)));
  }
  out.queue.sort((x, y) => files.indexOf(x.file) - files.indexOf(y.file));
  if (!o.dry) {
    for (const r of out.queue) console.log(`${r.status} ${r.name}${r.launch ? ` (launch ${r.launch}, ${r.ms} ms${par ? ', inst ' + r.inst + (r.folders.length ? ', ' + r.folders.join('+') : '') : ''})` : ''}${r.status === 'MANUAL' ? ': ' + r.manual.slice(0, 80) : ''}${r.status === 'FAIL' || r.status === 'NORUN' ? ': ' + ((r.error ? [r.error] : r.reasons || []).slice(0, 3).join(' | ')) : ''}`);
    out.total = out.queue.length; out.failed = out.queue.filter(r => r.status === 'FAIL').length; out.manual = out.queue.filter(r => r.status === 'MANUAL').length; out.norun = out.queue.filter(r => r.status === 'NORUN').length; out.passed = out.total - out.failed - out.manual - out.norun;
    if (stopped) { out.stopped = stopped; console.log('queue STOPPED: ' + stopped); }
    console.log(`queue: ${out.total} scenario(s), ${out.launches} launch(es), ${out.passed} PASS, ${out.failed} FAIL, ${out.manual} MANUAL${out.norun ? `, ${out.norun} NORUN` : ''}${par ? `, ${W} worker(s)` : ''}`);
  }
  return out;
}

// ---- matrix
function collectScenarios(spec) {
  const out = [], errs = [];
  for (const p of spec.split(',').filter(Boolean)) {
    if (!fs.existsSync(p)) { errs.push('no such scenario file/dir: ' + p); continue; }
    if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p).sort()) if (/\.json$/i.test(f)) out.push(path.join(p, f)); }
    else out.push(p);
  }
  if (!errs.length && !out.length) errs.push('no scenario files in ' + spec);
  return { files: out, errs };
}

function planMatrix(o) {
  const errs = [], runs = [];
  const c = collectScenarios(o.matrix);
  errs.push(...c.errs);
  for (const file of c.files) {
    const probeO = Object.assign({}, o, { params: Object.assign({}, o.params) });
    const l0 = loadScenario(file, probeO);
    const maps = o.maps || [null];
    // a mode-mp scenario without any map still loads only when a map comes from --maps; try per map
    const first = l0.sc && l0.sc.mode !== 'mp' ? [null] : maps;
    for (const map of first) {
      const po = Object.assign({}, o, { params: Object.assign({}, o.params, map ? { map } : {}) });
      const l = loadScenario(file, po);
      if (l.errs.length) { errs.push(...l.errs); continue; }
      for (const mods of (o.modsets || [null])) runs.push({ file, sc: l.sc, map: map || l.sc.params.map || '', mods });
    }
  }
  return { runs, errs };
}

async function runMatrix(o) {
  const { runs, errs } = planMatrix(o);
  const rep = createReport();
  for (const e of errs) rep.add('testrun', 0, 'TESTRUN_BAD_ARGS', e);
  if (rep.count) return { rep, results: [] };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mk = (r, i, slot) => {
    const o2 = Object.assign({}, o, { matrix: null, scenario: r.file, scenarioObj: r.sc, runMods: r.mods, inst: o.inst + slot, gameId: r.sc.game || o.gameId, q: true, errs: [] });
    o2.params = Object.assign({}, o.params, r.map ? { map: r.map } : {}); // fresh scenario params follow the map
    if (r.map) o2.scenarioObj = Object.assign({}, r.sc, { params: Object.assign({}, r.sc.params, { map: r.map }) });
    o2.runName = `${stamp}-${String(i + 1).padStart(2, '0')}-${r.sc.name}${r.map ? '-' + r.map : ''}`.replace(/[^\w.-]/g, '_');
    return o2;
  };
  const label = r => ({ scenario: r.sc.name, map: r.map, mods: r.mods ? r.mods.join(',') : (r.sc.mods || []).join(',') });
  if (o.dry) {
    runs.forEach((r, i) => {
      const l = label(r);
      console.log(`== run ${i + 1}/${runs.length}: scenario ${l.scenario} map ${l.map || '-'} mods ${l.mods || '-'} inst ${o.inst + (i % o.instances)}`);
      run(Object.assign(mk(r, i, i % o.instances), { dry: true, q: false }));
    });
    return { rep, results: [], dry: true };
  }
  const results = new Array(runs.length);
  let next = 0;
  const worker = async slot => {
    while (next < runs.length) {
      const i = next++, r = runs[i], t0 = Date.now(), o2 = mk(r, i, slot);
      const res = await run(o2);
      results[i] = Object.assign(label(r), {
        n: i + 1, inst: o2.inst, pass: res.rep.count === 0, findings: Object.assign({}, res.rep.counts), rows: res.sum.rows,
        verdicts: res.sum.verdicts, archive: res.sum.runDir, triage: res.sum.triageCounts || {}, ms: Date.now() - t0,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.instances, runs.length) }, (_, s) => worker(s)));
  for (const r of results) if (!r.pass) rep.add('testrun', 0, 'TESTRUN_VERDICT_FAIL', `matrix run ${r.n} (${r.scenario}${r.map ? ' ' + r.map : ''}) failed: ${Object.keys(r.findings).join(',') || 'verdict'}`);
  return { rep, results };
}

function matrixTable(results) {
  const cnt = c => Object.keys(c).map(k => k + '×' + c[k]).join(' ') || '-';
  const L = ['| # | scenario | map | mods | inst | result | findings | rows | triage | archive |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) L.push(`| ${r.n} | ${r.scenario} | ${r.map || '-'} | ${r.mods || '-'} | ${r.inst} | ${r.pass ? 'PASS' : 'FAIL'} | ${cnt(r.findings)} | ${(r.rows || []).map(x => x.id + ' ' + (x.pass ? 'PASS' : 'FAIL')).join(', ') || '-'} | ${cnt(r.triage)} | ${r.archive || '-'} |`);
  return L.join('\n');
}

// --rerun <queue report.json> [--queue list]: the FAIL / NORUN scenario files of a past queue report (optionally only those also in --queue/--queue-dir)
function rerunFiles(report, only) {
  let j;
  try { j = JSON.parse(fs.readFileSync(report, 'utf8').replace(/^﻿/, '')); } catch (e) { return { files: [], errs: ['--rerun ' + report + ': ' + e.message] }; }
  if (!j || !Array.isArray(j.queue)) return { files: [], errs: ['--rerun ' + report + ': not a queue report (no queue[])'] };
  const keep = only ? new Set(collectScenarios(only).files.map(f => path.resolve(f))) : null;
  const files = [], errs = [];
  for (const e of j.queue) {
    if (!e || (e.status !== 'FAIL' && e.status !== 'NORUN') || !e.file) continue;
    const cand = [e.file, path.resolve(path.dirname(report), e.file)].find(p => fs.existsSync(p));
    if (!cand) { errs.push('--rerun: scenario file gone: ' + e.file); continue; }
    if (keep && !keep.has(path.resolve(cand))) continue;
    if (!files.includes(cand)) files.push(cand);
  }
  return { files, errs };
}

// body of main(): -> {code, json?} ; json is written to --out by main() after the backup restore result is known
async function mainBody(o) {
  if (o.queue || o.queueDir || o.rerun) {
    const c = o.rerun ? rerunFiles(o.rerun, o.queue || o.queueDir) : collectScenarios(o.queue || o.queueDir);
    if (!c.errs.length && !c.files.length) { console.log('rerun: no FAIL or NORUN scenario in ' + o.rerun + ': nothing to run'); return { code: 0 }; }
    if (c.errs.length) { const rep = createReport(); for (const e of c.errs) rep.add('testrun', 0, 'TESTRUN_BAD_ARGS', e); rep.print({ showInfo: false, summary: false }); return { code: 1 }; }
    const out = await runQueue(c.files, o);
    // dry: a scenario that does not load (a game mismatch, a bad step) is a FAIL row and exit 1; NORUN (template, game refusal) stays 0
    return { code: o.dry ? (out.queue.some(r => r.status === 'FAIL') ? 1 : 0) : (out.failed || out.stopped ? 1 : 0), json: o.dry ? null : out };
  }
  if (o.matrix) {
    const { rep, results, dry } = await runMatrix(o);
    if (dry) return { code: 0 };
    const obj = { tool: 'testrun', runs: results, total: results.length, failed: results.filter(r => !r.pass).length };
    if (o.format === 'json') { rep.print({ showInfo: !o.q, summary: false }); return { code: rep.count ? 1 : 0, json: obj }; }
    const txt = matrixTable(results);
    if (o.out) fs.writeFileSync(o.out, txt + '\n'); else console.log(txt);
    rep.print({ showInfo: !o.q, summary: false });
    return { code: rep.count ? 1 : 0, noOut: true };
  }
  const { rep, sum, dry } = await run(o);
  if (dry) return { code: 0 };
  console.log('--- testrun summary');
  console.log(`commands ${sum.cmds}; events ${JSON.stringify(sum.events)}`);
  if (o.probe) {
    const ok = sum.answers.filter(a => a.ok).map(a => a.cmd), bad = sum.answers.filter(a => !a.ok);
    console.log('answered: ' + (ok.join(', ') || '-'));
    console.log('errored: ' + (bad.map(a => a.cmd + ' (' + a.error + ')').join(', ') || '-'));
    if (sum.runDir) console.log('pipe log: ' + path.join(sum.runDir, 'pipe.jsonl'));
  }
  if (sum.result) console.log('result ' + sum.result.slice(0, 300));
  for (const v of sum.verdicts) console.log(`VERDICT ${v.pass ? 'PASS' : 'FAIL'} ${v.desc}${v.row ? ' [' + v.row + ']' : ''}`);
  for (const r of sum.rows) console.log(`ROW ${r.id} ${r.pass ? (r.manual ? 'MANUAL (automatic checks passed; decide by eye: ' + r.manual + ')' : 'PASS') : 'FAIL'}`);
  if (sum.triage) { console.log('triage (logtriage):'); for (const l of sum.triage.slice(-12)) console.log('  ' + l); }
  rep.print({ showInfo: !o.q, summary: false });
  const json = o.out && o.scenario ? { tool: 'testrun', name: sum.name, helloMs: rep.helloMs, pass: rep.count === 0, counts: rep.counts, verdicts: sum.verdicts, rows: sum.rows } : null;
  return { code: rep.count ? 1 : 0, json };
}

const USAGE = 'usage: as2 testrun --map <map|multi/map:mode> [--exe <mowas exe>] [--players n] [--mods a,b] [--hold secs | --wait-over]\n         [--archive dir] [--logdir dir] [--inst n] [--timeout secs] [--connect-timeout secs] [--no-mods] [--sound] [--dry | --mock] [-q] [--summary]\n       as2 testrun --probe [--exe ..]\n       as2 testrun --scenario <file.json> [--param k=v ..] [--map m] [--mission m] [--exe ..]\n       as2 testrun --matrix <dir|file,..> [--maps a,b] [--modsets "a,b;c"] [--instances N] [--format md|json] [--out f]\n   more (queues, workers, lint, mocks): head of tools/testrun/testrun.js';
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); return 0; }
  const o = parseArgs(process.argv.slice(2));
  if ((o.workers > 1 || o.overlap) && (o.queue || o.queueDir || o.rerun)) o.stagePool = o.stageAs ? o.stageAs.split(',').filter(Boolean) : APPROVED; // backup covers the whole pool
  if (o.lint && !o.errs.length) {
    const rep = createReport(), c = collectScenarios(o.lint);
    for (const e of c.errs) rep.add('testrun', 0, 'TESTRUN_BAD_ARGS', e);
    for (const f of c.files) lintFile(f, rep);
    rep.print({ showInfo: !o.q, summary: false });
    return rep.count ? 1 : 0;
  }
  if (o.errs.length) { const { rep } = await run(o); rep.print({ showInfo: !o.q, summary: false }); return 1; }
  // MoW:AS2 and GoH have no control pipe: a live run is refused with one line and exit 2 (TST-19, goh-drive.md); a plan still prints
  const noPipe = pipeRefusal(o);
  if (noPipe && !o.dry && !o.mock) { console.error(noPipe); return 2; }   // the games.refuse line and exit code
  if (noPipe) console.error(noPipe + ' (plan only: nothing is started)');
  // a real run starts the game exe and talks to it over the named pipe \\.\pipe\as64.N: Windows only (--dry and --mock run anywhere)
  if (!o.dry && !o.mock && !platform.isWin()) { console.error(platform.unsupported('running the game through its control pipe (testrun)').message); return 2; }
  const refused = stageRefusal(o);
  if (refused) { const rep = createReport(); rep.add('testrun', 0, 'TESTRUN_STAGE_REFUSED', refused); rep.print({ showInfo: false, summary: false }); return 1; }
  const w = await withBackup(o, () => mainBody(o));
  if (w.errs) { const rep = createReport(); for (const e of w.errs) rep.add('testrun', 0, 'TESTRUN_BACKUP', e); rep.print({ showInfo: false, summary: false }); return 1; }
  const body = w.res || { code: 2 };
  if (w.backup) {
    console.log(`backup restored:${w.backup.restored}${w.backup.details.length ? ' (' + w.backup.details.join('; ') + ')' : ''} -> ${path.join(path.resolve(o.backup), 'restore.json')}`);
    if (body.json) body.json.restored = w.backup.restored;
  }
  if (body.json && o.out) fs.writeFileSync(o.out, JSON.stringify(body.json, null, 2) + '\n');
  else if (body.json && o.matrix) console.log(JSON.stringify(body.json, null, 2));
  if (w.crash) { console.log(`testrun: TESTRUN_CRASH ${w.crash.message}`); return 2; }
  return body.code || (w.backup && !w.backup.restored ? 1 : 0);
}

// the game.log text a log verdict may read: null when the game was not launched, there is no log, or (spawnAt set) the log predates the launch -> {text, stale}
function verdictLogOf(logf, notRun, spawnAt) {
  if (notRun || !logf || !fs.existsSync(logf)) return { text: null, stale: false };
  if (spawnAt && fs.statSync(logf).mtimeMs < spawnAt - 2000) return { text: null, stale: true };
  return { text: fs.readFileSync(logf, 'latin1'), stale: false };
}
module.exports = { gameOfExe, pipeRefusal, NO_PIPE, scenarioGame, pipeNeeds, triageExe, isAs64Rules, keepsList, seedList, verdictLogOf, parseArgs, preflight, buildPlan, buildProbePlan, buildScenarioPlan, loadScenario, diagnoseLog, exeArgs, pipePath, Client, startMock, run, runMatrix, runQueue, lintFile, backupBegin, backupRestore, withBackup, stageRefusal, APPROVED, _ci: { ciJoin, modIsModern } };
if (require.main === module) main().then(c => process.exit(c), e => { console.error(e); process.exit(2); });
