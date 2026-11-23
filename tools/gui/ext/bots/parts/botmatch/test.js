// Bots part botmatch test. Arg: scratch dir. No game, no network, nothing launched: the generated scenario (exact steps for team and
// alliance modes), the real `testrun --dry` on it (testrun returns before it spawns anything), the readers on recorded line shapes
// (mp_userUnits / mp_slots / match_end from how the game behaves, game.log lines of MIS-32, MIS-33 and DBG: SpawnUnit)
// the report, the launch guards, a mocked run end to end (the runner writes pipe.jsonl and game.log as testrun and the game would), and
// the client in the page fake DOM (the real searchKit typed into, game map names, plain report sentences, greyed states per game and
// per launch setting, block rules).
// Author: Imperator_Aug (ARSENAL, ia-9590e286)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const modInfo = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{name "test"}\r\n}\r\n'); return d; };   // a real mod folder holds mod.info (the write guard asks for it)
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'botmatch-')));
require('../../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const P = require('./index'), L = require('./lib'), check = require('../index').check;
const TOOLS = path.join(__dirname, '..', '..', '..', '..', '..');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + (JSON.stringify(a) === JSON.stringify(b) ? '' : '\n  got  ' + JSON.stringify(a) + '\n  want ' + JSON.stringify(b)));

// ---- recorded shapes: a pipe log as testrun writes it (<archive>/<stamp>/pipe.jsonl, {t, dir, raw})
function pipeLog(o) {
  const lines = [], put = (t, dir, m) => lines.push(JSON.stringify({ t, dir, raw: JSON.stringify(m) }));
  let id = 0;
  const cmd = (t, c, reply, dt) => { const i = ++id; put(t, 'out', { id: i, cmd: c }); put(t + (dt || 50), 'in', Object.assign({ type: 'reply', id: i }, reply)); };
  const okR = output => ({ ok: true, output });
  cmd(10, 'pipe_events all', okR([])); cmd(100, 'mod_set my_mod', okR([])); cmd(200, 'mp_lan', okR([]));
  cmd(300, 'mp_host multi/2v2_farmstead:battle_zones 4', okR([]));
  cmd(400, 'mp_slots', okR(['armyMode 1 freeForAll=0', 'team name=a size=2 army= alliance=0 hidden=0', 'team name=b size=2 army= alliance=1 hidden=0', 'slot id=1 team=a state=open user=2', 'slot id=2 team=a state=open user=0', 'slot id=3 team=b state=open user=0', 'slot id=4 team=b state=open user=0']));
  cmd(500, 'mp_set team.a.army rus', okR([])); cmd(600, 'mp_set team.b.army ger', okR([]));
  cmd(700, 'mp_slot 2 normal', okR([])); cmd(800, 'mp_slot 3 normal', okR([]));
  cmd(900, 'mp_slots', okR(['armyMode 1 freeForAll=0', 'team name=a size=2 army=rus alliance=0 hidden=0', 'team name=b size=2 army=ger alliance=1 hidden=0', 'slot id=1 team=a state=open user=2', 'slot id=2 team=a state=open user=3', 'slot id=3 team=b state=open user=4', 'slot id=4 team=b state=open user=0']));
  cmd(1000, 'mp_ready', okR([])); cmd(1100, 'mp_start', okR([]));
  put(20000, 'in', { type: 'event', event: 'loaded' });
  // a minute in: bot #3 (team a) has a T-34 and its crew, bot #4 (team b) a Pz IV; the host (#2) nothing. The host's profile name is printed.
  cmd(80000, 'mp_userUnits', okR(['#2 HostProfileX', '#3 AI Player: Normal', '  t34_0[4] u:t34_0 cp:15 cw:0 score:17.5 chrg:0', '  human[5:mp/rus/tankman] u:mp/rus/tankman cp:0 cw:0 score:0 chrg:0', '#4 AI Player: Normal', '  pz4h[7] u:pz4h cp:13 cw:0 score:0 chrg:0', '  human[12:mp/ger/smg2] u:mp/ger/smg2 cp:0 cw:0 score:0 chrg:0']));
  cmd(140000, 'mp_userUnits', okR(['#2 HostProfileX', '#3 AI Player: Normal', '  t34_0[4] u:t34_0 cp:15 cw:0 score:20 chrg:0', '  t34_0[9] u:t34_0 cp:15 cw:0 score:0 chrg:0', '  is2[11] u:is2 cp:20 cw:0 score:0 chrg:0', '#4 AI Player: Normal']));
  const result = { live: false, state: 'over', map: 'multi/2v2_farmstead', gameTime: o.endAt * 1000, winner: { team: 'a', side: 3 }, localResult: 'win',
    teams: [{ team: 'a', victoryPoints: 500 }, { team: 'b', victoryPoints: 0 }],
    players: [{ userId: 2, name: 'HostProfileX', team: 'a', side: 2, army: 'rus', ai: false, left: false, local: true }, { userId: 3, name: 'AI Player: Normal', team: 'a', side: 3, army: 'rus', ai: true },
      { userId: 4, name: 'AI Player: Normal', team: 'b', side: 4, army: 'ger', ai: true }] };
  put(20000 + o.endAt * 1000, 'in', { type: 'event', event: 'match_end', end: 'result', reason: '', result });
  cmd(20000 + o.endAt * 1000 + 500, 'mp_userUnits', { ok: false, output: [], error: 'no game' });
  cmd(20000 + o.endAt * 1000 + 600, 'mp_result', okR([JSON.stringify(result)]));
  return lines.join('\n') + '\n';
}
const GAMELOG = ['LOG: start', 'DBG: SpawnUnit t34_0 AI Player: Normal', 'DBG: SpawnUnit pz4h AI Player: Normal', 'DBG: SpawnUnit smgs(ger) AI Player: Normal', 'DBG: Spawning Unit Not found - kv_99', 'DBG: SpawnUnit t34_0 AI Player: Normal',
  'DBG: SpawnUnit is2 AI Player: Normal', 'Lua call failed: script/multiplayer/bot.lua:12: attempt to index a nil value', 'DBG: SpawnUnit kv_99 AI Player: Normal'].join('\r\n') + '\r\n';
const LISTS = { rus: ['t34_0', 'is2', 'kv_99', 'su76'], ger: ['pz4h', 'smgs(ger)', 'tiger'] };
// squads.set / vehicles.set lines as the as64 sets hold them -> card members
const SETS = ['("squad_with3types" side(ger) name(smgs) c(30) g(squad_2) c1(squadleader2:1) c2(rifle2:3) c3(smg2:4) b(squad1) t(all inf_only) level(1) cost(110) f(1.0))',
  '{"t34_0" ("tank" s(rus))}\r\n{"is2" ("tank" s(rus))}\r\n{"kv_99" ("tank" s(rus))}\r\n{"pz4h" ("tank" s(ger))}'];

(async () => {
  ok(check('botmatch', P) === '', 'contract: ' + check('botmatch', P));
  ok(P.group === 'F' && P.order === 10, 'group F, order 10');
  for (const r of P.lang) ok(r.length === 5 && r.slice(1).every(s => typeof s === 'string' && s.trim()) && r.slice(2).every(s => s !== r[1]), 'four languages, translated: ' + r[0]);
  const en = {}; P.lang.forEach(r => { en[r[0]] = r[1]; });
  // every key the server side can hand over is a row
  for (const k of Object.values(L.RUN_KEYS).concat(['bots.botmatch.r.lua', 'bots.botmatch.r.notFound', 'bots.botmatch.r.exception', 'bots.botmatch.r.nolog', 'bots.botmatch.r.fewer', 'bots.botmatch.run.noai',
    'bots.botmatch.trap.chain', 'bots.botmatch.trap.alone', 'bots.botmatch.trap.random', 'bots.botmatch.trap.income'])) ok(en[k], 'string for ' + k);
  for (const m of fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8').matchAll(/'(bots\.botmatch\.e\.\w+)'/g)) ok(en[m[1]], 'string for ' + m[1]);

  // ---- scenario: exact steps
  const base = { map: 'multi/2v2_farmstead', mode: 'battle_zones', difficulty: 'normal', armyA: 'rus', armyB: 'ger', minutes: 2, mods: ['my_mod'] };
  const team = L.scenarioOf(Object.assign({}, base, { bots: 2, armyMode: 'team' }));
  const HEAD = [{ cmd: 'mp_lan' }, { wait_stage: true }, { cmd: 'mp_host {map} 4' }, { wait_stage: true }, { cmd: 'mp_slots' }];
  const TAIL = [{ cmd: 'mp_slots' }, { cmd: 'mp_ready' }, { cmd: 'mp_start' }, { wait: 'loaded', timeout: 300 }, { wait: 'match_end', timeout: 60 }, { cmd: 'mp_userUnits' }, { wait: 'match_end', timeout: 60 }, { cmd: 'mp_userUnits' }, { cmd: 'mp_result' }];
  eq(team.scenario.steps, HEAD.concat([{ cmd: 'mp_set team.a.army {armyA}' }, { cmd: 'mp_set team.b.army {armyB}' }, { cmd: 'mp_slot 2 {difficulty}' }, { cmd: 'mp_slot 3 {difficulty}' }], TAIL), 'team mode, 2 bots: armies set before the slots');
  eq(team.scenario.params, { map: 'multi/2v2_farmstead:battle_zones', difficulty: 'normal', armyA: 'rus', armyB: 'ger' }, 'params');
  eq([team.scenario.name, team.scenario.mode, team.scenario.mods, team.scenario.verdict], ['botmatch', 'menu', ['my_mod'], [{ log: '\\*{5,} Exception \\*{5,}', want: false }]], 'name, mode, mods, verdict');
  eq([team.slots, team.pinned, team.players], [[{ id: 2, team: 'a' }, { id: 3, team: 'b' }], 'team', 4], 'slots and pinning, team mode');
  const one = L.scenarioOf(Object.assign({}, base, { bots: 1, armyMode: null, minutes: 1 }));
  eq(one.scenario.steps, [{ cmd: 'mp_lan' }, { wait_stage: true }, { cmd: 'mp_host {map} 2' }, { wait_stage: true }, { cmd: 'mp_slots' }, { cmd: 'mp_slot 2 {difficulty}' }, { cmd: 'mp_army {armyB} BOT' },
    { cmd: 'mp_slots' }, { cmd: 'mp_ready' }, { cmd: 'mp_start' }, { wait: 'loaded', timeout: 300 }, { wait: 'match_end', timeout: 60 }, { cmd: 'mp_userUnits' }, { cmd: 'mp_result' }], 'alliance mode, 1 bot: mp_army BOT after its slot, 2 players');
  eq([one.pinned, one.slots], ['one', [{ id: 2, team: 'b' }]], 'one bot: slot 2 (slot 1 is the host\'s seat), pinned by mp_army, on team b');
  const three = L.scenarioOf(Object.assign({}, base, { bots: 3, armyMode: 'alliance' }));
  ok(three.pinned === 'none' && !three.scenario.steps.some(s => /mp_set|mp_army/.test(s.cmd || '')) && three.scenario.steps.filter(s => /^mp_slot \d/.test(s.cmd || '')).map(s => s.cmd).join() === 'mp_slot 2 {difficulty},mp_slot 3 {difficulty},mp_slot 4 {difficulty}' && JSON.stringify(three.slots) === JSON.stringify([{ id: 2, team: 'a' }, { id: 3, team: 'b' }, { id: 4, team: 'b' }]), 'alliance mode, 3 bots: no army command, slots 2-4 (never the host\'s seat 1), teams 2 = a, 3 and 4 = b');
  ok(Object.values(L.SLOTS).every(a => !a.includes(1)), 'no bot is ever put in slot 1, the host\'s seat');
  eq(L.membersOf(SETS), { 'smgs(ger)': ['mp/ger/squadleader2', 'mp/ger/rifle2', 'mp/ger/smg2'], t34_0: [], is2: [], kv_99: [], pz4h: [] }, 'membersOf: squad macro members as mp/<side>/<type>, plain cards empty');

  // ---- the real testrun --dry on the generated scenario (returns before any spawn)
  const game = path.join(work, 'game'), mod = path.join(game, 'mods', 'my_mod'), logdir = path.join(work, 'log'); modInfo(mod);
  fs.mkdirSync(mod, { recursive: true }); fs.mkdirSync(logdir, { recursive: true }); fs.writeFileSync(path.join(game, 'as64.exe'), '');
  const dryRun = args => { if (!args.includes('--dry')) throw new Error('test runner: only --dry runs here'); const r = cp.spawnSync(process.execPath, [path.join(TOOLS, 'testrun', 'testrun.js')].concat(args), { encoding: 'utf8', timeout: 60000, env: process.env }); return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: false }; };
  const scf = path.join(work, 'sc.json'); fs.writeFileSync(scf, JSON.stringify(team.scenario));
  const dr = dryRun(['--scenario', scf, '--exe', path.join(game, 'as64.exe'), '--inst', '1', '--logdir', logdir, '--dry']);
  ok(dr.code === 0 && /nothing launched/.test(dr.stdout), 'testrun --dry accepts the scenario: ' + (dr.stdout + dr.stderr).slice(0, 300));
  const sends = [...dr.stdout.matchAll(/"cmd":"([^"]+)"/g)].map(m => m[1]);
  eq(sends.slice(2, 9), ['mp_lan', 'mp_host multi/2v2_farmstead:battle_zones 4', 'mp_slots', 'mp_set team.a.army rus', 'mp_set team.b.army ger', 'mp_slot 2 normal', 'mp_slot 3 normal'], 'dry plan: params filled in, order kept');
  ok(sends[1] === 'mod_set my_mod' && sends.filter(c => c === 'mp_userUnits').length === 2 && sends[sends.length - 1] === 'q', 'dry plan: mod_set, one unit list a minute, q at the end');

  // ---- readers
  const uu = L.parseUserUnits(['#2 HostProfileX', '#3 AI Player: Normal', '  t34_0[4] u:t34_0 cp:15 cw:0 score:17.5 chrg:0', '  human[5:mp/rus/tankman] u:mp/rus/tankman cp:0 cw:0 score:0 chrg:0', '  uk-cromwell_mk_iv[8] u:uk-cromwell_mk_iv cp:13', '#4 AI Player: Hard']);
  eq(uu.map(p => [p.side, p.units.map(u => u.card + (u.member ? '*' : ''))]), [[2, []], [3, ['t34_0', 'mp/rus/tankman*', 'uk-cromwell_mk_iv']], [4, []]], 'parseUserUnits: sides, cards, crew members marked');
  eq(L.parseSlots(['armyMode 1 freeForAll=0', 'team name=a size=2 army=rus alliance=0 hidden=0', 'slot id=2 team=a state=ai user=3']), { armyMode: 1, teams: { a: 'rus' }, slots: [{ id: 2, team: 'a', state: 'ai', user: 3 }] }, 'parseSlots');
  const gl = L.parseLog('DBG: SpawnUnit riflemans_fin AI Player: Normal\r\nDBG: Spawning Unit Not found - kv_99\r\nDBG: Spawning Unit Not found - kv_99\r\nLua call failed: x.lua:3: oops\r\n***** Exception *****\r\n');
  eq(gl, { spawns: [{ unit: 'riflemans_fin', player: 'AI Player: Normal' }], notFound: ['kv_99'], luaFails: ['x.lua:3: oops'], exceptions: 1 }, 'parseLog: SpawnUnit, Not found once per unit, Lua call failed, exception');
  const pp = L.parsePipe(pipeLog({ endAt: 150 }));
  ok(pp.loadedT === 20000 && pp.matchEnd && pp.matchEnd.end === 'result' && pp.matchEnd.result.players.length === 3 && pp.replies.find(r => r.cmd === 'mp_slot 2 normal'), 'parsePipe: loaded, match_end with its result, replies matched to their commands');
  eq(L.parseRun('TESTRUN_WAIT_TIMEOUT no "match_end" event in 60s\nTESTRUN_CMD_FAIL mp_slot 2 normal: no AI here: the session does not allow them\nsummary'), [{ code: 'TESTRUN_WAIT_TIMEOUT', msg: 'no "match_end" event in 60s' }, { code: 'TESTRUN_CMD_FAIL', msg: 'mp_slot 2 normal: no AI here: the session does not allow them' }], 'parseRun');
  eq(L.listsOf([{ armies: { rus: [{ unit: 'a' }, { unit: 'b' }] } }, { armies: { rus: [{ unit: 'a' }, { unit: 'c' }], ger: [{ unit: 'd' }] } }]), { rus: ['a', 'b', 'c'], ger: ['d'] }, 'listsOf: units of every stage, once');

  // ---- report: a match that ran to its end with the team-b bot wiped out
  const plan = { map: 'multi/2v2_farmstead', mode: 'battle_zones', bots: 2, minutes: 10, pinned: 'team', slots: team.slots, armies: { a: 'rus', b: 'ger' } };
  const stdout = 'TESTRUN_WAIT_TIMEOUT no "match_end" event in 60s\nTESTRUN_CMD_FAIL mp_userUnits: no game\nWARN_TESTRUN_TEAM_UNSET team.b.army ger not shown by mp_slots\n';
  const rp = L.report({ pipe: pipeLog({ endAt: 150 }), log: GAMELOG, stdout, plan, lists: LISTS, members: L.membersOf(SETS) });
  const b3 = rp.bots.find(b => b.side === 3), b4 = rp.bots.find(b => b.side === 4);
  ok(rp.bots.length === 2 && b3 && b4 && b3.team === 'a' && b3.army === 'rus' && b4.team === 'b' && b4.army === 'ger' && b3.armyHow === 'pinned', 'report: two bots, team and army from the result');
  eq(b3.bought.map(x => [x.card, x.asked, x.at, x.seen]), [['t34_0', 2, 60, 2], ['is2', 1, 120, 1], ['kv_99', 1, null, 0]], 'report: bot a bought in order, first seen times, asked twice, kv_99 asked never seen');
  eq(b4.bought.map(x => [x.card, x.at, x.seen]), [['pz4h', 60, 1], ['smgs(ger)', 60, null]], 'report: bot b bought a Pz IV and a squad, the squad seen through its members (count n/a)');
  { const rn = L.report({ pipe: pipeLog({ endAt: 150 }), log: GAMELOG, stdout, plan, lists: LISTS });
    const s4 = rn.bots.find(b => b.side === 4).bought.find(x => x.card === 'smgs(ger)'), k3 = rn.bots.find(b => b.side === 3).bought.find(x => x.card === 'kv_99');
    ok(s4 && s4.na && s4.at === null && s4.seen === null && k3.na && k3.seen === null, 'report without the sets: cards not seen are n/a, never 0'); }
  // the 3-bot plan of the game check: the seat refused, 2 bots came: said plainly
  { const r3b = L.report({ pipe: pipeLog({ endAt: 150 }), log: GAMELOG, stdout: 'TESTRUN_CMD_FAIL mp_slot 1 normal: a player sits there (mp_kick takes him out)\n', plan: Object.assign({}, plan, { bots: 3 }), lists: LISTS });
    ok(r3b.issues.some(i => i.k === 'bots.botmatch.r.fewer' && i.p.n === 2 && i.p.want === 3), 'report: fewer bots than planned is an issue ' + JSON.stringify(r3b.issues)); }
  eq([b3.never, b4.never], [['su76'], ['tiger']], 'report: in the list, never bought');
  ok(rp.issues.every(i => i.k !== 'bots.botmatch.r.fewer'), 'report: no fewer-bots issue when all came');
  eq(rp.issues.map(i => i.k), ['bots.botmatch.r.lua', 'bots.botmatch.r.notFound'], 'report: Lua call failed and Not found explained');
  ok(rp.end && rp.end.at === 150 && rp.end.how === 'result' && rp.end.winner === 'a' && rp.end.early && rp.end.empty.join() === 'b', 'report: early end, team b empty (TST-26): ' + JSON.stringify(rp.end));
  eq(rp.run.map(r => r.code), ['WARN_TESTRUN_TEAM_UNSET'], 'report: expected waits and the list asked after the end left out');
  ok(rp.samples === 2 && rp.traps.includes('bots.botmatch.trap.income') && !rp.traps.includes('bots.botmatch.trap.alone'), 'report: samples, traps');
  ok(!JSON.stringify(rp).includes('HostProfileX'), 'report: the host profile name never appears');
  // no result, no log: bots from the unit lists, the missing log said
  const noRes = pipeLog({ endAt: 150 }).split('\n').filter(l => !/match_end|mp_result/.test(l)).join('\n');
  const r2 = L.report({ pipe: noRes, log: null, stdout: '', plan: { bots: 2, minutes: 2, pinned: 'none', map: 'multi/chain_map', slots: team.slots }, lists: null });
  ok(r2.bots.length === 2 && r2.bots[0].team === 'a' && r2.bots[0].army === 'rus' && r2.bots[0].never === null && !r2.end, 'report without a result: bots from the unit lists and mp_slots, never unknown');
  ok(r2.issues.some(i => i.k === 'bots.botmatch.r.nolog') && r2.traps.includes('bots.botmatch.trap.chain') && r2.traps.includes('bots.botmatch.trap.random') && !JSON.stringify(r2).includes('HostProfileX'), 'report without a log: said; chain_map and random armies traps');
  const r3 = L.report({ pipe: '', log: '', stdout: 'TESTRUN_CMD_FAIL mp_slot 2 normal: no AI here: the session does not allow them, or the Airborne DLC is not installed\nTESTRUN_NO_PIPE no pipe', plan: {}, lists: null });
  eq(r3.run.map(r => r.k), ['bots.botmatch.run.noai', 'bots.botmatch.run.nopipe'], 'report: "no AI here" and no pipe explained');

  // ---- routes: form, maps, plan, guards, a mocked run end to end
  P._t.T.logDir = () => logdir;
  let running = false;
  P._t.T.running = () => running;
  const G = 'resource/set/multiplayer/games/';
  const put = (root, rel, lines) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); };
  put(game, G + 'battle_zones.set', ['{game', '\t{armySelectionMode team}', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
  put(game, G + 'captureflag.set', ['{game', '\t{settings', '\t}', '}']);
  put(game, 'resource/script/multiplayer/bot.data.lua', ['Purchases = {', '\t{ Repeat = false, Units = {', '\t\t["rus"] = { -- Soviets', '\t\t\t{ unit = "t34_0", class = UnitClass.Tank, priority = 1 },', '\t\t\t{ unit = "is2", class = UnitClass.Tank, priority = 1 },',
    '\t\t\t{ unit = "kv_99", class = UnitClass.Tank, priority = 1 },', '\t\t\t{ unit = "su76", class = UnitClass.Tank, priority = 1 },', '\t\t},', '\t\t["ger"] = { -- Germans', '\t\t\t{ unit = "pz4h", class = UnitClass.Tank, priority = 1 },',
    '\t\t\t{ unit = "smgs(ger)", class = UnitClass.Infantry, priority = 1 },', '\t\t\t{ unit = "tiger", class = UnitClass.Tank, priority = 1 },', '\t\t},', '\t}},', '}']);
  const runs = [];
  const mockRun = async (tool, entry, args, opt) => {
    runs.push({ tool, entry, args, opt });
    if (args.includes('--dry')) return dryRun(args);
    // a live run: what testrun and the game leave behind, never a real launch
    const a = args[args.indexOf('--archive') + 1], ld = args[args.indexOf('--logdir') + 1];
    fs.mkdirSync(path.join(a, '2026-11-20T10-00-00-000Z'), { recursive: true });
    fs.writeFileSync(path.join(a, '2026-11-20T10-00-00-000Z', 'pipe.jsonl'), pipeLog({ endAt: 150 }));
    fs.writeFileSync(path.join(ld, 'game.log'), GAMELOG);
    return { code: 1, stdout, stderr: '', timedOut: false };
  };
  const ctx = { game: () => game, gameId: () => 'as64', kind: () => 'as2', allowLaunch: false, gamedir: game, tools: TOOLS, tmpRoot: path.join(work, 'tmp'), runTool: mockRun };
  const U = q => ({ searchParams: new URLSearchParams(q || '') });
  const R = P.routes;
  const form = await R['GET /api/x/bots/botmatch/form'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(form.gid === 'as64' && !form.na && form.launch === false && form.armies.join() === 'ger,rus' && form.labels.rus === 'Soviets', 'form: armies and labels from the bot list, launch off: ' + JSON.stringify(form).slice(0, 200));
  ok(P._t.isArmy('ger') && !P._t.isArmy('x') && !P._t.isArmy('XNoTanks'), 'form: helper unit files (x, xnotanks) are never armies (S17)');
  ok(form.modes.find(m => m.mode === 'battle_zones').bots && form.modes.find(m => m.mode === 'battle_zones').armyMode === 'team' && !form.modes.find(m => m.mode === 'captureflag').bots, 'form: modes with bots and army mode');
  // maps: the Maps page's list (mocked mission-clone) cut to the modes that allow bots
  const mapsCtx = Object.assign({}, ctx, { runTool: async (tool, entry, args) => (tool === 'mission-clone' ? { code: 0, stdout: 'map/multi/2v2_farmstead: battle_zones captureflag\nmap/multi/1v1_cf: captureflag\n', stderr: '' } : mockRun(tool, entry, args)) });
  let mp = await R['GET /api/x/bots/botmatch/maps'](U('mod=' + encodeURIComponent(mod)), null, mapsCtx);
  for (let i = 0; i < 100 && mp.state === 'running'; i++) { await new Promise(r => setTimeout(r, 30)); mp = await R['GET /api/x/bots/botmatch/maps'](U('mod=' + encodeURIComponent(mod)), null, mapsCtx); }
  ok(mp.state === 'done' && mp.maps.length === 1 && mp.maps[0].key === 'map/multi/2v2_farmstead' && mp.maps[0].modes.join() === 'battle_zones' && mp.maps[0].armyMode.battle_zones === 'team' && mp.all === 2, 'maps: only modes that allow bots: ' + JSON.stringify(mp).slice(0, 300));
  // plan: scenario written, testrun --dry run through ctx.runTool
  const req = { mod, map: 'map/multi/2v2_farmstead', mode: 'battle_zones', armyA: 'rus', armyB: 'ger', difficulty: 'hard', bots: 2, minutes: 3, players: 4 };
  const pl = await R['POST /api/x/bots/botmatch/plan'](null, req, ctx);
  ok(pl.ok && pl.pinned === 'team' && fs.existsSync(pl.file) && /mp_slot 3 hard/.test(pl.dry) && runs[runs.length - 1].args.includes('--dry'), 'plan: scenario file, dry plan with the difficulty: ' + (pl.dry || pl.err || '').slice(0, 200));
  // refusals (each a lang key)
  const refuse = async (body, c, want, status) => { let e = null; try { await R['POST /api/x/bots/botmatch/start'](null, body, c || ctx); } catch (x) { e = x; } ok(e && e.message === want && (!status || e.status === status), 'refused ' + want + ': ' + (e ? e.status + ' ' + e.message : 'not refused')); };
  await refuse(req, null, 'bots.botmatch.e.launchOff', 403);
  const lctx = Object.assign({}, ctx, { allowLaunch: true });
  running = true; await refuse(req, lctx, 'bots.botmatch.e.gameUp', 409); running = false;
  await refuse(Object.assign({}, req, { mode: 'captureflag' }), lctx, 'bots.botmatch.e.noBots');
  await refuse(Object.assign({}, req, { bots: 4 }), lctx, 'bots.botmatch.e.bots');
  await refuse(Object.assign({}, req, { minutes: 61 }), lctx, 'bots.botmatch.e.minutes');
  await refuse(Object.assign({}, req, { difficulty: 'godlike' }), lctx, 'bots.botmatch.e.diff');
  await refuse(Object.assign({}, req, { armyA: 'usa' }), lctx, 'bots.botmatch.e.army');
  await refuse(Object.assign({}, req, { map: 'map/single/x' }), lctx, 'bots.botmatch.e.map');
  P._t.SEATS.set('map/multi/2v2_farmstead', 2);
  await refuse(Object.assign({}, req, { players: 0 }), lctx, 'bots.botmatch.e.small {"seats":2,"need":4,"fit":1}');
  await refuse(Object.assign({}, req, { players: 0, bots: 3 }), lctx, 'bots.botmatch.e.small {"seats":2,"need":4,"fit":1}');
  { let e = null; try { await R['POST /api/x/bots/botmatch/plan'](null, Object.assign({}, req, { players: 4 }), ctx); } catch (x) { e = x; }
    ok(e && /^bots\.botmatch\.e\.small /.test(e.message), 'plan: the map list\'s seats win over a count the page sends: ' + (e && e.message)); }
  P._t.SEATS.set('map/multi/2v2_farmstead', 4);
  { let e = null; try { await R['POST /api/x/bots/botmatch/plan'](null, Object.assign({}, req, { map: 'map/multi/1v1_cf', mode: 'battle_zones', players: 2 }), ctx); } catch (x) { e = x; }
    ok(e && e.message === 'bots.botmatch.e.small {"seats":2,"need":4,"fit":1}', 'plan: a 2-player map the page counts is refused too: ' + (e && e.message)); }
  const outside = path.join(work, 'outside_mod'); fs.mkdirSync(outside, { recursive: true });
  await refuse(Object.assign({}, req, { mod: outside }), lctx, 'bots.botmatch.e.notInGame');
  // other games: a code worded on the page, nothing run
  const nRuns = runs.length;
  for (const [id, kind, code] of [['goh', 'goh', 'bots.botmatch.na.goh'], ['mowas2', 'as2', 'bots.botmatch.na.mowas2']]) {
    const oc = Object.assign({}, lctx, { gameId: () => id, kind: () => kind, gohDir: () => game, curDir: () => game });
    let e = null; try { await R['POST /api/x/bots/botmatch/start'](null, req, oc); } catch (x) { e = x; }
    ok(e && e.na && e.message === code && en[code], id + ': not available, a worded code: ' + (e && e.message));
    const f = await R['GET /api/x/bots/botmatch/form'](U(''), null, oc);
    ok(f.na === code && f.launch === false, id + ': form says it and offers no start');
  }
  ok(runs.length === nRuns, 'no run for refused requests');
  // the shared lib's English refusal of a missing mod folder comes back as a code
  { let e = null; try { await R['POST /api/x/bots/botmatch/plan'](null, Object.assign({}, req, { mod: path.join(game, 'mods', 'no_such') }), ctx); } catch (x) { e = x; }
    ok(e && /^bots\.botmatch\.e\.[A-Za-z]+( \{.*\})?$/.test(e.message) && en[e.message.split(' ')[0]], 'a missing mod folder: a worded code: ' + (e && e.message)); }
  // in-game unit names for the report
  put(mod, 'resource/set/multiplayer/units/squads.set', [SETS[0]]); put(mod, 'resource/set/multiplayer/units/vehicles.set', SETS[1].split('\r\n'));
  put(mod, 'resource/localization/desc.lng', ['{tags', ' {entity', '  {"t34_0" "T-34 tank"}', '  {"pz4h" "Panzer IV H"}', ' }', '}']);
  // a mocked live run end to end
  const st = await R['POST /api/x/bots/botmatch/start'](null, Object.assign({ _wait: true }, req), lctx);
  const live = runs[runs.length - 1];
  ok(st.ok && live && !live.args.includes('--dry') && live.args.includes('--archive') && live.args[live.args.indexOf('--logdir') + 1] === logdir && live.opt.timeoutMs === (3 * 60 + 600) * 1000, 'start: testrun through ctx.runTool with archive, log folder, time limit');
  const sc = JSON.parse(fs.readFileSync(live.args[live.args.indexOf('--scenario') + 1], 'utf8'));
  ok(sc.steps.filter(s => s.cmd === 'mp_userUnits').length === 3 && sc.params.difficulty === 'hard' && sc.mods.join() === 'my_mod', 'start: the scenario has one unit list a minute for 3 minutes');
  const js = await R['GET /api/x/bots/botmatch/status'](U(''), null, lctx);
  ok(js.state === 'done' && js.report && js.report.bots.length === 2 && js.report.pipe && js.report.bots.find(b => b.side === 3).never.join() === 'su76', 'status: done, the report read from the run files: ' + JSON.stringify(js).slice(0, 200));
  ok(js.report.names && js.report.names.t34_0 === 'T-34 tank' && js.report.labels && js.report.labels.rus === 'Soviets', 'status: the report carries in-game names and army labels: ' + JSON.stringify([js.report.names, js.report.labels]));
  // busy: a run that has not come back
  let release;
  const hang = Object.assign({}, lctx, { runTool: () => new Promise(r => { release = r; }) });
  await R['POST /api/x/bots/botmatch/start'](null, req, hang);
  await refuse(req, hang, 'bots.botmatch.e.busy', 409);
  ok((await R['GET /api/x/bots/botmatch/status'](U(''), null, hang)).state === 'running', 'status: running while the run is out');
  release({ code: 1, stdout: 'TESTRUN_NO_PIPE no pipe', stderr: '' }); for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
  const js2 = await R['GET /api/x/bots/botmatch/status'](U(''), null, hang);
  ok(js2.state === 'done' && js2.report && !js2.report.pipe && js2.report.run.some(r => r.k === 'bots.botmatch.run.nopipe'), 'a run with no pipe: report says so');

  // ---- JOBS: the match is a background job of the server's registry; Stop on the card and Cancel in the job list are one stop.
  // The fake runTool stands in for gui.js: the child belongs to the job handed over in the options, and cancelling that job kills it
  // (the call then resolves {code:null, cancelled:true}). Nothing is launched.
  {
    const JL = require(path.join(__dirname, '..', '..', '..', '..', 'joblist'));
    const reg = JL.create({ keepMs: 60000 });
    const kids = [];
    const fakeTool = (tool, entry, args, opt) => new Promise(resolve => {
      const kid = { args, opt, killed: false, finish: r => resolve(Object.assign({ stdout: '', stderr: '', timedOut: false, cancelled: false }, r)) };
      kids.push(kid);
      if (opt && opt.job) opt.job.onCancel(() => { kid.killed = true; resolve({ code: null, stdout: 'half a run', stderr: '', timedOut: false, cancelled: true }); });
    });
    // the request's own job, as the dispatcher makes it: it ends when the route has answered, and the child must not be its child
    const reqJob = reg.add({ kind: 'req', canCancel: false });
    const jctx = Object.assign({}, lctx, { jobs: reg, job: reqJob, runTool: fakeTool });
    P._t.reset();
    const s1 = await R['POST /api/x/bots/botmatch/start'](null, req, jctx);
    reqJob.end('done');
    const bg = reg.list().find(j => j.kind === 'bg');
    ok(s1.ok && bg && bg.id === s1.id && bg.what === 'job.w.botmatch' && bg.whatP && bg.whatP.map === '2v2 farmstead' && bg.page === 'bots' && bg.game === 'as64' && bg.state === 'running' && bg.canCancel === true && bg.writes === false,
      'jobs: the match is a bg job named job.w.botmatch {map}, page bots, stoppable: ' + JSON.stringify(bg));
    ok(bg && bg.total === 3 && bg.done === 0, 'jobs: progress is minutes played of the minutes asked: ' + JSON.stringify(bg && [bg.done, bg.total]));
    ok(kids.length === 1 && kids[0].opt.job === reg.get(bg.id) && kids[0].opt.job !== reqJob, 'jobs: the testrun child is handed to the bg job, not to the start request');
    ok(reg.list().find(j => j.id === reqJob.id).state === 'done' && !kids[0].killed && (await R['GET /api/x/bots/botmatch/status'](U(''), null, jctx)).state === 'running', 'jobs: the request ending leaves the run alive');
    // the card's Stop: POST stop -> the registry's cancel -> the child is killed -> state stopped, no report, no error
    running = true;   // a game is still seen running after the kill: said on the card
    const sp = await R['POST /api/x/bots/botmatch/stop'](null, {}, jctx);
    ok(sp.ok && sp.asked === true && kids[0].killed, 'stop route: the registry cancel kills the test run (and with its tree the game)');
    for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
    running = false;
    const s2 = await R['GET /api/x/bots/botmatch/status'](U(''), null, jctx);
    ok(s2.state === 'stopped' && s2.report === null && s2.error === null && s2.gameUp === true, 'stop: the status is the plain state stopped, no report, no error: ' + JSON.stringify(s2));
    ok(reg.get(bg.id).state === 'cancelled' && !reg.list().some(j => j.state === 'running'), 'stop: the bg job ended as cancelled, nothing left running in the list');
    ok(!fs.existsSync(s1.archive), 'stop: nothing was read or written for a report (no run folder made by the route)');
    const sp2 = await R['POST /api/x/bots/botmatch/stop'](null, {}, jctx);
    ok(sp2.ok && sp2.asked === false && sp2.job.state === 'stopped', 'stop route: with no match running it only says so');
    // the job list's Cancel: the same end
    const s3 = await R['POST /api/x/bots/botmatch/start'](null, req, jctx);
    ok(s3.ok && s3.job.state === 'running', 'a new match can be started after a stop (not busy)');
    ok(reg.cancel(s3.id) === true && kids[1].killed, 'job list Cancel: the same registry cancel kills the run');
    for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
    const s4 = await R['GET /api/x/bots/botmatch/status'](U(''), null, jctx);
    ok(s4.state === 'stopped' && s4.gameUp === false && reg.get(s3.id).state === 'cancelled', 'job list Cancel: stopped, the job ended: ' + JSON.stringify(s4).slice(0, 200));
    // a full run in the registry ends as done, a crash as failed; neither stays running
    const s5 = await R['POST /api/x/bots/botmatch/start'](null, req, jctx);
    kids[2].finish({ code: 1, stdout: 'TESTRUN_NO_PIPE no pipe' });
    for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
    ok((await R['GET /api/x/bots/botmatch/status'](U(''), null, jctx)).state === 'done' && reg.get(s5.id).state === 'done', 'jobs: a finished run ends its job as done');
    const s6 = await R['POST /api/x/bots/botmatch/start'](null, req, Object.assign({}, jctx, { runTool: () => Promise.reject(new Error('spawn failed')) }));
    for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
    ok((await R['GET /api/x/bots/botmatch/status'](U(''), null, jctx)).state === 'error' && reg.get(s6.id).state === 'failed', 'jobs: a run that throws ends its job as failed');
    // Preview stopped from the job list: the route returns at once
    const pc = await R['POST /api/x/bots/botmatch/plan'](null, req, Object.assign({}, ctx, { runTool: async () => ({ code: null, stdout: 'x', stderr: '', timedOut: false, cancelled: true }) }));
    ok(pc.cancelled === true && pc.ok === false && pc.dry === undefined, 'plan: a stopped testrun --dry returns early: ' + JSON.stringify(pc).slice(0, 120));
    P._t.reset();
  }

  // ---- client in the page fake DOM (the page's own h() and the real searchKit, block rules)
  P._t.reset();
  const BC = require(path.join(__dirname, '..', '..', '..', '..', 'test', 'blockcheck')), FDP = require(path.join(__dirname, '..', '..', '..', '..', 'test', 'fakedom'));
  const doc = FDP.make(), pf = BC.pageFns(doc), h = pf.h, asks = [], shown = [], gone = [], frames = [], store = {};
  const tx = (k, p) => { const s = en[k] != null ? en[k] : k; return p ? s.replace(/\{(\w+)\}/g, (m, n) => (p[n] == null ? m : String(p[n]))) : s; };
  const LS = { get: (k, d) => (Object.prototype.hasOwnProperty.call(store, k) ? JSON.parse(store[k]) : d), set: (k, v) => { store[k] = JSON.stringify(v); } };
  const later = f => { frames.push(f); return frames.length; };
  const searchKit = new Function('document', 'LS', 'tx', 'requestAnimationFrame', 'console', 'setTimeout', 'window', BC.fnSrc('h') + '\n' + BC.kitSrc() + '\nreturn searchKit;')(doc, LS, tx, later, { error() {}, log() {}, warn() {} }, later, undefined);
  const kitCalls = [];
  const spyKit = (input, o) => { kitCalls.push({ input, parent: !!input.parentNode }); return searchKit(input, o); };
  const parts = [];
  new Function('BOTS_PARTS', 'h', 'tx', 'show', 'askDo', 'searchKit', 'document', 'setTimeout', P.script)(parts, h, tx, p => shown.push(p), o => { asks.push(o); return { then: cb => cb(true) }; }, spyKit, doc, later);
  ok(parts.length === 1 && parts[0].id === 'botmatch' && parts[0].title() === en['bots.botmatch.title'], 'client pushes one part with its title');
  // the frame's own hitsOf: it reads it.lo (an item without lo crashed the index)
  const hitsOf = (items, s, done) => { s = String(s || '').trim().toLowerCase(); if (!s) { done(items.slice(0, 30), 0); return; } const a = [], b = [];
    for (const it of items) { const k = it.lo.indexOf(s); if (k < 0) continue; (k === 0 || /[\s_-]/.test(it.lo.charAt(k - 1)) ? a : b).push(it); } done(a.concat(b).slice(0, 30), 0); };
  const kit = { section: (id, t, kids) => h('div', { blk: id, box: 'col', 'data-blkname': t }, [h('div', { blk: id + '.title' }, [h('h3', { text: t })])].concat(kids)),
    leaf: (id, kids, name) => h('div', name ? { blk: id, 'data-blkname': name } : { blk: id }, kids), hint: (id, t) => h('div', { blk: id }, [h('div', { class: 'hint', text: t })]),
    errBox: m => h('div', { class: 'err', text: m }), hitsOf };
  let calls = 0;
  const cctx = Object.assign({}, mapsCtx, { allowLaunch: true }), offCtx = Object.assign({}, mapsCtx, { allowLaunch: false });
  const pend = [];
  const apiOf = c => (m, p, d, cb) => { calls++; const body = Object.assign({ mod }, d || {}); const q = m === 'GET' ? U(new URLSearchParams(body).toString()) : null;
    pend.push(Promise.resolve().then(() => R[m + ' /api/x/bots/' + p](q, m === 'GET' ? null : Object.assign({ _wait: true }, body), c)).then(j => cb(null, j), x => cb(x.message))); };
  const flush = async () => { for (let i = 0; i < 10; i++) { while (pend.length) await pend.shift(); let g = 0; while (frames.length && g++ < 50) frames.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  const draw = (env) => { const root = doc.createElement('div'); root.setAttribute('data-blkroot', 'bots'); parts[0].draw(Object.assign({ kit, reload() {}, go: id => gone.push(id) }, env)).forEach(el => root.appendChild(el)); return root; };
  const inDetails = n => { for (; n; n = n.parentNode) if (n.tagName === 'DETAILS') return true; return false; };
  const shownText = el => el.all().filter(n => !n.children.length && !inDetails(n)).map(n => n.textContent).join(' ');
  const btnOf = (root, text) => root.all().find(n => n.tagName === 'BUTTON' && n.textContent === text);
  const root = draw({ mod, gid: 'as64', api: apiOf(cctx) });
  await flush();
  const probs = BC.checkScreen(root, 'bots');
  ok(probs.length === 0, 'client: block rules ' + probs.slice(0, 6).join(' | '));
  // the map box: searchKit called with the box already in its row, the box wrapped in place, typing lists the game's map names
  const mapIn = root.all().find(n => n.tagName === 'INPUT' && n.getAttribute('aria-label') === en['bots.botmatch.map']);
  { const ms = root.all().filter(n => n.tagName === 'SELECT')[0]; ok(ms && ms.children.length === 1 && ms.value === 'battle_zones' && ms.children[0].textContent !== 'battle_zones', 'client: the mode list is filled before a map is picked, with in-game names'); }
  ok(kitCalls.length === 1 && kitCalls[0].parent && mapIn && mapIn._sk && mapIn.parentNode && mapIn.parentNode.className === 'sk', 'client: the map searchKit is attached after the box is in its row (wrapped in place)');
  ok(mapIn.getAttribute('placeholder') === en['bots.botmatch.mapPh'], 'client: plain placeholder, no folder path');
  const mp0 = (await R['GET /api/x/bots/botmatch/maps'](U('mod=' + encodeURIComponent(mod)), null, mapsCtx)).maps[0], gameName = mp0.name;
  ok(gameName && gameName !== '2v2_farmstead', 'maps: each map has the name the game shows: ' + gameName);
  mapIn.value = gameName.slice(0, 4).toLowerCase(); mapIn.selectionStart = mapIn.value.length; mapIn.fire('input'); await flush();
  const optRows = mapIn._sk.list.children.filter(c => c.getAttribute('role') === 'option');
  ok(optRows.length === 1 && optRows[0].textContent.includes(gameName) && optRows[0].textContent.includes('2v2_farmstead'), 'client: typing in the box lists the game\'s map name with the folder small: ' + optRows.map(o => o.textContent).join(' | '));
  // a name typed in full is accepted
  mapIn.value = gameName.toUpperCase(); mapIn.fire('change'); await flush();
  const sels = root.all().filter(n => n.tagName === 'SELECT');
  const modeSel = sels[0], armyA = sels[1], armyB = sels[2];
  ok(modeSel.children.length === 1 && modeSel.value === 'battle_zones' && root.has(en['bots.botmatch.pinTeam']) && root.has('map/multi/2v2_farmstead'), 'client: a typed game map name is accepted: its bots modes, the folder in Details, the plain team note');
  // round 4: after a pick the main text names the map as the game does; the path sits in Details only
  ok(root.has(tx('bots.botmatch.mapPicked', { name: gameName }) + '  ' + tx('bots.botmatch.players', { n: 4 })) && !/map\/multi/.test(shownText(root)) && root.all().some(n => n.tagName === 'DETAILS' && n.has(tx('bots.botmatch.mapPath', { path: 'map/multi/2v2_farmstead' }))),
    'client: the picked map by its name in the main text, the path only in Details: ' + (shownText(root).match(/.{0,30}map\/multi.{0,30}/) || [''])[0]);
  // round 4: Show plan is the shared Preview; which side is yours is said beside the army boxes
  { const pb = root.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-preview') === '1'), sd = root.all().find(n => n.getAttribute && n.getAttribute('data-sides') === '1');
    ok(pb && pb.textContent === 'Preview' && !root.all().some(n => n.tagName === 'BUTTON' && /plan/i.test(n.textContent)), 'client: the plan button reads Preview');
    ok(armyA.getAttribute('aria-label') === 'Team A, your side' && armyB.getAttribute('aria-label') === 'Team B, against you' && sd && /beside you on team A/.test(sd.textContent) && /team B against you/.test(sd.textContent), 'client: team A = your side, team B = against you, said on the card'); }
  ok(!/MIS-|TST-|armySelectionMode/.test(shownText(root)) && /armySelectionMode team/.test(root.textContent),'client: IDs and card words only in Details: ' + (shownText(root).match(/.{0,40}(MIS-|TST-).{0,20}/) || [''])[0]);
  mapIn.value = 'no such map'; mapIn.fire('change'); await flush();
  ok(root.has(tx('bots.botmatch.mapUnknown', { q: 'no such map' })) && modeSel.children.length === 1 && modeSel.value === 'battle_zones', 'client: an unknown name said plainly with what to try; the modes stay filled');
  mapIn.value = 'zzqq'; mapIn.selectionStart = 4; mapIn.fire('input'); await flush();
  ok(root.has(tx('bots.botmatch.mapUnknown', { q: 'zzqq' })), 'client: typing a name that finds nothing says so and what to try');
  mapIn.value = '1v1_cf'; mapIn.fire('change'); await flush();
  ok(root.has(tx('bots.botmatch.mapNoBots', { map: '1v1_cf' }).split('{map}').join('')) || root.all().some(n => n.getAttribute && n.getAttribute('data-next') === 'mapNoBots'), 'client: a map with no bot mode is named, with the way to the modes card');
  // pick from the list as searchKit would
  mapIn.value = 'farm'; mapIn.fire('input'); await flush();
  const row0 = mapIn._sk.list.children.filter(c => c.getAttribute('role') === 'option')[0];
  const key = k => { const e = { key: k, _sk: 0, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, target: mapIn }; (mapIn.listeners.keydown || []).forEach(f => f.call(mapIn, e)); };
  ok(row0, 'client: typing lists a row to pick'); key('ArrowDown'); key('Enter'); await flush();
  ok(mapIn.value === gameName && modeSel.value === 'battle_zones', 'client: picking a row shows the game name in the box: ' + mapIn.value);
  ok(armyA.value === 'ger' && armyB.value === 'rus' && armyA.children.length === 2 && /Germans/.test(armyA.children[0].textContent), 'client: army lists from the bot list, with labels');
  armyA.value = 'rus'; armyB.value = 'ger';
  const bStart = btnOf(root, en['bots.botmatch.start']), bPlan = btnOf(root, en['bots.botmatch.plan']);
  ok(bStart && !bStart.disabled && !root.has(en['bots.botmatch.launchOff']), 'client: Start on when launching is allowed');
  bPlan.click(); await flush();
  ok(root.has(en['bots.botmatch.planOk']) && root.all().some(n => n.tagName === 'DETAILS' && n.has('mp_set team.a.army {armyA}')) && !/mp_set/.test(shownText(root)), 'client: Show plan: plain line first, the commands in Details');
  bStart.click(); await flush(); await flush();
  ok(asks.length === 1 && asks[0].lines[0].includes(gameName),'client: Start asks first, with the map name: ' + (asks[0] && asks[0].lines[0]));
  const txt = shownText(root);
  ok(txt.includes(tx('bots.botmatch.rep.botBought', { army: 'Soviets', side: 'team A, your side', n: 2, list: 'T-34 tank, is2' })), 'client: the report leads with a plain sentence per bot: ' + txt.slice(-500));
  ok(txt.includes(tx('bots.botmatch.rep.botBought', { army: 'Germans', side: 'team B, against you', n: 2, list: 'Panzer IV H, smgs(ger)' })) && txt.includes(tx('bots.botmatch.rep.botAsked', { list: 'kv_99' })) && txt.includes(tx('bots.botmatch.rep.botNever', { list: 'su76' })), 'client: second bot, asked-not-seen and never-bought as sentences: ' + txt.slice(txt.indexOf('Last match'), txt.indexOf('Last match') + 700));
  ok(txt.includes(tx('bots.botmatch.rep.empty', { teams: 'B' })) && txt.includes(tx('bots.botmatch.rep.end', { t: '2:30' })), 'client: the early end said plainly');
  ok(!/MIS-3|TST-26|Lua call failed|Spawning Unit/.test(txt) && /MIS-33/.test(root.textContent) && /Spawning Unit Not found - kv_99/.test(root.textContent), 'client: raw log lines and IDs only in Details');
  ok(root.all().some(n => n.tagName === 'DETAILS' && n.has(tx('bots.botmatch.rep.at', { t: '1:00' }))), 'client: the ordered list with times in Details');
  ok(!root.textContent.includes('HostProfileX'), 'client: no host profile name on the page');
  // a 2-player map with 2 bots: said under the bots box at once, and Show plan refuses with the plain sentence without asking the server
  { const planCalls = []; const api2 = (m, p, d, cb) => { if (p === 'botmatch/plan') planCalls.push(d); apiOf(cctx)(m, p, d, (e, j, x) => { if (p === 'botmatch/maps' && j && j.maps) j = Object.assign({}, j, { maps: j.maps.map(x2 => Object.assign({}, x2, { players: 2 })) }); cb(e, j, x); }); };
    const r2 = draw({ mod, gid: 'as64', api: api2 }); await flush();
    const in2 = r2.all().find(n => n.tagName === 'INPUT' && n.getAttribute('aria-label') === en['bots.botmatch.map']);
    in2.value = gameName; in2.fire('change'); await flush();
    const small = tx('bots.botmatch.e.small', { seats: 2, need: 4 });
    ok(r2.has(small), 'client: a 2-player map with 2 bots is flagged under the bots box before Show plan');
    btnOf(r2, en['bots.botmatch.plan']).click(); await flush();
    ok(!planCalls.length && r2.all().filter(n => n.textContent === small).length >= 2 && !r2.has(en['bots.botmatch.planOk']), 'client: Show plan refuses a map too small for the bots with the plain sentence');
    const nS = r2.all().filter(n => n.tagName === 'SELECT')[4]; nS.value = '1'; nS.fire('change'); await flush();
    ok(!r2.has(small), 'client: 1 bot on a 2-player map is fine, the warning goes'); }
  // launching off: one plain line naming the switch, Start greyed, Show plan works, the way to the switch and the other way
  calls = 0;
  const offRoot = draw({ mod, gid: 'as64', api: apiOf(offCtx) });
  await flush();
  const offStart = offRoot.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-launch'));
  ok(offRoot.has(en['bots.botmatch.launchOff']) && offStart.disabled && !btnOf(offRoot, en['bots.botmatch.plan']).disabled, 'client: launch off said up front with the switch name, Start greyed, Show plan on');
  btnOf(offRoot, en['bots.botmatch.launchOff.go']).click();
  ok(shown.includes('play'), 'client: Open the Play page goes to the switch');
  const c0 = calls; btnOf(offRoot, en['bots.botmatch.launchOff.again']).click(); await flush();
  ok(calls > c0 && offRoot.has(en['bots.botmatch.launchOff']), 'client: Check again reads the form again');
  btnOf(offRoot, en['bots.botmatch.other.go']).click();
  ok(offRoot.has(en['bots.botmatch.other']) && gone.includes('bots.recipes'), 'client: launch off offers the Match log way, linked to the habits card');
  ok(BC.checkScreen(offRoot, 'bots').length === 0, 'client: block rules, launch off');
  // MoW:AS2 and GoH: greyed up front, no server call
  calls = 0; gone.length = 0;
  const asRoot = draw({ mod, gid: 'mowas2', api: apiOf(cctx) });
  ok(calls === 0 && asRoot.has(en['bots.botmatch.na.mowas2']) && !asRoot.all().some(n => n.tagName === 'SELECT') && !/TST-19/.test(shownText(asRoot)) && /TST-19/.test(asRoot.textContent), 'client: MoW:AS2 greyed up front, the ID in Details');
  btnOf(asRoot, en['bots.botmatch.other.go']).click();
  ok(asRoot.has(en['bots.botmatch.other']) && gone.includes('bots.recipes'), 'client: MoW:AS2 offers the Match log way to the habits card');
  const gRoot = draw({ mod: '', gid: 'goh', api: apiOf(cctx) });
  ok(calls === 0 && gRoot.has(en['bots.botmatch.na.goh']) && !/GHMIS/.test(shownText(gRoot)) && /GHMIS-66/.test(gRoot.textContent), 'client: GoH greyed up front, the ID in Details');
  ok(BC.checkScreen(asRoot, 'bots').length === 0 && BC.checkScreen(gRoot, 'bots').length === 0, 'client: block rules, MoW:AS2 and GoH');
  const nRoot = draw({ mod: '', gid: 'as64', api: apiOf(cctx) });
  ok(calls === 0 && nRoot.has(en['bots.botmatch.e.needmod']), 'client: no mod, said up front');
  // refusals: a code worded, anything else plainly with the raw words folded
  const eRoot = draw({ mod, gid: 'as64', api: (m, p, d, cb) => cb('bots.botmatch.e.nogame') });
  ok(eRoot.has(en['bots.botmatch.e.nogame']), 'client: a refusal code shown as words');
  const e2 = draw({ mod, gid: 'as64', api: (m, p, d, cb) => cb('ENOENT: something odd') });
  ok(e2.has(en['bots.botmatch.e.other']) && e2.all().some(n => n.tagName === 'DETAILS' && n.has('ENOENT')), 'client: an unknown error worded, the raw text in Details');
  // a squad whose members are not known: n/a, worded, never 0
  { const naRep = { pipe: true, bots: [{ side: 2, team: 'b', army: 'ger', armyHow: 'own', bought: [{ card: 'smgs(ger)', asked: 1, at: null, seen: null, na: true }], never: [] }], issues: [], run: [], traps: [], samples: 2 };
    const naRoot = draw({ mod, gid: 'as64', api: (m, p, d, cb) => cb(null, p === 'botmatch/form' ? { launch: true, armies: [], job: { state: 'done', map: 'multi/x', mode: 'battle_zones', report: naRep } } : { state: 'done', maps: [] }) });
    await flush();
    ok(naRoot.has(tx('bots.botmatch.rep.botNa', { list: 'smgs(ger)' })) && naRoot.all().some(n => n.tagName === 'DETAILS' && n.has(en['bots.botmatch.rep.na'])) && !naRoot.has(en['bots.botmatch.rep.notSeen']), 'client: a squad with unknown members shows n/a in words, not "never seen"'); }
  ok(root.has(en['bots.botmatch.proven']), 'client: what is tried in the game (2 bots) and what is not (1, 3) is said');

  // ---- round 2: plain refusals with a next step, in-game mode names, plurals, long lists, composed sentences with real values
  {
    // a mod outside the game's mods folder: the frame hands the code as the third value; one sentence of what to do + the Play page button
    const outRoot = draw({ mod, gid: 'as64', api: (m, p, d, cb) => { if (p === 'botmatch/plan') { let er = null; try { P._t.planOf(null, { mod: outside, map: 'multi/x', mode: 'battle_zones', bots: 2, minutes: 5, armyA: 'ger', armyB: 'rus' }, lctx); } catch (x) { er = x; }
      cb(er ? tx(er.key) : 'no error', undefined, er); return; } apiOf(cctx)(m, p, d, cb); } });
    await flush();
    const oi = outRoot.all().find(n => n.tagName === 'INPUT' && n.getAttribute('aria-label') === en['bots.botmatch.map']);
    oi.value = gameName; oi.fire('change'); await flush();
    btnOf(outRoot, en['bots.botmatch.plan']).click(); await flush();
    ok(outRoot.has(en['bots.botmatch.e.notInGame']) && !outRoot.has(en['bots.botmatch.e.other']) && /^Put your mod in the game's mods folder first/.test(en['bots.botmatch.e.notInGame']), 'client: Show plan with a mod outside the mods folder says what to do, not "something went wrong"');
    // round 4: the same sentence up front, as soon as the card is drawn, with Preview and Start greyed (not only after Preview)
    { const fo = await R['GET /api/x/bots/botmatch/form'](U('mod=' + encodeURIComponent(outside)), null, cctx), fi = await R['GET /api/x/bots/botmatch/form'](U('mod=' + encodeURIComponent(mod)), null, cctx);
      ok(fo.inGame === false && fi.inGame === true, 'form: says whether the mod sits in the game mods folder ' + fo.inGame + ' ' + fi.inGame);
      const upCalls = [], upRoot = draw({ mod: outside, gid: 'as64', api: (m, p, d, cb) => { upCalls.push(p); if (p === 'botmatch/form') cb(null, Object.assign({}, fi, { inGame: false })); else cb(null, { state: 'done', maps: [] }); } });
      await flush();
      const upP = upRoot.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-preview') === '1'), upS = upRoot.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-launch') === '1');
      ok(upRoot.has(en['bots.botmatch.e.notInGame']) && btnOf(upRoot, en['bots.botmatch.go.install']) && upP.disabled && upS.disabled && !upCalls.includes('botmatch/plan'), 'client: a mod outside the mods folder is said up front on the card, Preview and Start greyed'); }
    const goI = btnOf(outRoot, en['bots.botmatch.go.install']); shown.length = 0; if (goI) goI.click();
    ok(goI && shown.includes('play'), 'client: the next step button opens the Play page (Install into the game)');
    // every server code of planOf has a sentence; the codes without a button say their next step in words
    const codes = new Set(); for (const m of fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8').matchAll(/'(bots\.botmatch\.e\.[A-Za-z]+)'/g)) codes.add(m[1]);
    for (const c of codes) ok(en[c] && !/^That did not work/.test(en[c]), 'code ' + c + ' has a plain sentence: ' + en[c]);
    // the form: in-game mode names, the default is a mode bots play with flags
    const fm = await R['GET /api/x/bots/botmatch/form'](U('mod=' + encodeURIComponent(mod)), null, cctx);
    const bz = (fm.modes || []).find(x => x.mode === 'battle_zones');
    ok(bz && bz.name && bz.name !== 'battle_zones' && !/[:.]/.test(bz.name) && fm.best === 'battle_zones', 'form: modes carry the in-game short name, best = battle_zones: ' + JSON.stringify(bz) + ' ' + fm.best);
    ok(modeSel.children[0].textContent === bz.name, 'client: the mode list shows the in-game name only: ' + modeSel.children[0].textContent);
    // plurals: one bot, one unit, asked once; ru forms for 1, 3 and 5
    const rep1 = { pipe: true, bots: [{ side: 2, team: 'b', army: 'ger', armyHow: 'own', bought: [{ card: 'pz4h', asked: 1, at: 60, seen: 1 }], never: [] }], issues: [{ k: 'bots.botmatch.r.lua', p: { n: 1, first: 'x' } }, { k: 'bots.botmatch.r.notFound', p: { unit: 'pz4h' } }], run: [], traps: [], samples: 2, names: { pz4h: 'Panzer IV H' } };
    const r1 = draw({ mod, gid: 'as64', api: (m, p, d, cb) => cb(null, p === 'botmatch/form' ? { launch: true, armies: [], job: { state: 'done', map: 'multi/x', mode: 'battle_zones', report: rep1 } } : { state: 'done', maps: [] }) });
    await flush();
    const t1 = shownText(r1);
    ok(t1.includes('bought one unit: Panzer IV H.') && t1.includes('A bot script failed once.') && t1.includes('The bot list names Panzer IV H,') && !/\(s\)/.test(t1), 'client: one unit, failed once, the unit by its in-game name: ' + t1.slice(0, 400));
    const ru = {}; P.lang.forEach(r => { ru[r[0]] = r[2]; });
    const txr = (k, p) => { const s = ru[k] != null ? ru[k] : k; return p ? s.replace(/\{(\w+)\}/g, (m, n) => (p[n] == null ? m : String(p[n]))) : s; };
    const pr = []; new Function('BOTS_PARTS', 'h', 'tx', 'show', 'askDo', 'searchKit', 'document', 'setTimeout', 'LANG', P.script)(pr, h, txr, () => {}, () => ({ then() {} }), spyKit, doc, later, 'ru');
    const ruSay = n => { const rp = { pipe: true, bots: [{ side: 2, team: 'b', army: 'ger', armyHow: 'own', bought: Array.from({ length: n }, (x, i) => ({ card: 'u' + i, asked: 1, at: 60, seen: 1 })), never: [] }], issues: [{ k: 'bots.botmatch.r.lua', p: { n, first: 'x' } }], run: [], traps: [], samples: 2 };
      const r = doc.createElement('div'); r.setAttribute('data-blkroot', 'bots'); pr[0].draw({ mod, gid: 'as64', kit, reload() {}, go() {}, api: (m, p, d, cb) => cb(null, p === 'botmatch/form' ? { launch: true, armies: [], job: { state: 'done', map: 'multi/x', mode: 'battle_zones', report: rp } } : { state: 'done', maps: [] }) }).forEach(el => r.appendChild(el)); return r; };
    await flush();
    const ru1 = shownText(ruSay(1)), ru3 = shownText(ruSay(3)), ru5 = shownText(ruSay(5));
    ok(/купил 1 юнит:/.test(ru1) && /упал 1 раз\./.test(ru1) && /купил 3 юнита:/.test(ru3) && /упал 3 раза\./.test(ru3) && /купил 5 юнитов:/.test(ru5) && /упал 5 раз\./.test(ru5), 'client ru: plural forms for 1, 3, 5: ' + [ru1, ru3, ru5].map(s => (s.match(/купил[^:]*:/) || [''])[0]).join(' | '));
    // a long bought list: 8 rows, then Show all N
    const rep12 = { pipe: true, bots: [{ side: 2, team: 'b', army: 'ger', armyHow: 'own', bought: Array.from({ length: 12 }, (x, i) => ({ card: 'u' + i, asked: 1, at: 60 + i, seen: 1 })), never: [] }], issues: [], run: [], traps: [], samples: 2 };
    const r12 = draw({ mod, gid: 'as64', api: (m, p, d, cb) => cb(null, p === 'botmatch/form' ? { launch: true, armies: [], job: { state: 'done', map: 'multi/x', mode: 'battle_zones', report: rep12 } } : { state: 'done', maps: [] }) });
    await flush();
    const ol = r12.all().find(n => n.tagName === 'OL'), sa = r12.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-all') === '1');
    ok(ol && ol.children.length === 8 && sa && sa.textContent === 'Show all 12', 'client: a long list shows 8 rows, then Show all 12');
    if (sa) sa.click();
    ok(ol && ol.children.length === 12, 'client: Show all shows every row');
    // every composed sentence, in four languages, with real values: no {slot} left
    const vals = { map: 'Farmstead', mode: bz.name, n: 3, m: 10, army: 'Germans', team: 'B', side: 'team B, against you', name: 'Farmstead', path: 'map/multi/2v2_farmstead', list: 'Panzer IV H, T-34', t: '2:30', win: 'A', how: 'score', teams: 'B', all: 40, s: '1:00', unit: 'Panzer IV H', first: 'x', dir: 'run', want: 3, q: 'farm', seats: 2, need: 4, b: 'Read the maps again' };
    const CARD = /\{(enableBots|armySelectionMode|player)[^}]*\}/g;
    for (const r of P.lang) for (let c = 1; c < 5; c++) { const out = r[c].replace(/\{(\w+)\}/g, (m, k) => (vals[k] != null ? String(vals[k]) : m));
      ok(!/\{\w+\}/.test(out.replace(CARD, '')), 'sentence ' + r[0] + ' [' + c + '] has every slot filled: ' + out); }
    // the exact words of buttons and switches named in the instructions, in every language (S14)
    const G2 = ['en', 'ru', 'uk', 'zh'].map(l => require(path.join(__dirname, '..', '..', '..', '..', 'lang', l + '.json')));
    const RL = require('../recipes/lang'), row = (L, k) => L.find(r => r[0] === k);
    for (let c = 1; c < 5; c++) {
      const lc = G2[c - 1]['lc.label'], ins = G2[c - 1]['ins.title'], plan = row(P.lang, 'bots.botmatch.plan')[c], again = row(P.lang, 'bots.botmatch.launchOff.again')[c];
      ok(row(P.lang, 'bots.botmatch.launchOff')[c].includes(lc) && row(P.lang, 'bots.botmatch.e.launchOff')[c].includes(lc) && row(P.lang, 'bots.botmatch.e.launchOff')[c].includes(plan), 'launch switch and Show plan by their exact words, column ' + c);
      ok(row(P.lang, 'bots.botmatch.e.notInGame')[c].includes(ins) && row(P.lang, 'bots.botmatch.e.other')[c].includes(again), 'Install into the game and Check again by their exact words, column ' + c);
      ok(row(P.lang, 'bots.botmatch.other')[c].includes(row(RL, 'bots.recipes.b.log')[c]) && row(P.lang, 'bots.botmatch.other')[c].includes(row(RL, 'bots.recipes.h.log.t')[c]), 'the habits card words by their exact words, column ' + c);
    }
    for (const g of ['goh', 'mowas2']) ok(/^Not available in (Gates of Hell|MoW:AS2): /.test(en['bots.botmatch.na.' + g]), 'S15 line for ' + g);
  }
  // ---- JOBS on the card: Stop shows while a match runs and posts botmatch/stop; a stopped match and a stopped request are plain lines
  {
    const sent = [];
    let st = { state: 'running', elapsed: 65, minutes: 3, map: 'multi/2v2_farmstead', name: 'Farmstead', mode: 'battle_zones' };
    const apiS = (m, p, d, cb, o) => { sent.push([m, p, o]);
      if (p === 'botmatch/form') return cb(null, { launch: true, armies: ['ger', 'rus'], labels: {}, modes: [{ mode: 'battle_zones', name: 'Battle Zones', bots: true }], job: st });
      if (p === 'botmatch/maps') return cb(null, sent.filter(x => x[1] === 'botmatch/maps').length === 1 ? { state: 'running', elapsed: 1 } : { state: 'error', error: 'maps.e.stopped', stopped: true });
      if (p === 'botmatch/stop') { st = Object.assign({}, st, { stopping: true }); return cb(null, { ok: true, asked: true, job: st }); }
      if (p === 'botmatch/status') return cb(null, st);
      if (p === 'botmatch/plan') return cb('Stopped', undefined, { cancelled: true, message: 'Stopped' });
      cb(null, {}); };
    const rs = draw({ mod, gid: 'as64', api: apiS });
    await flush();
    const stopB = rs.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-stop') === '1');
    ok(stopB && !stopB.hidden && stopB.textContent === en['bots.botmatch.stop'] && /Match running on Farmstead/.test(shownText(rs)), 'client: Stop shows while a match runs: ' + (stopB && stopB.textContent));
    ok(sent.filter(x => x[1] === 'botmatch/maps').length === 2 && !sent.filter(x => x[1] === 'botmatch/maps')[0][2] && sent.filter(x => x[1] === 'botmatch/maps')[1][2].job === false, 'client: the re-ask of the map list is a poll (job:false), the first ask is not');
    ok(rs.all().some(n => n.getAttribute && n.getAttribute('data-stopped') === '1' && /Reading the maps was stopped/.test(n.textContent)) && !rs.all().some(n => n.className === 'err'), 'client: a stopped map list is a plain line, not an error');
    stopB.click();
    ok(sent.some(x => x[0] === 'POST' && x[1] === 'botmatch/stop') && stopB.disabled && shownText(rs).includes(en['bots.botmatch.stopping']), 'client: Stop posts botmatch/stop and says it is stopping');
    st = Object.assign({}, st, { state: 'stopped', stopping: false, gameUp: true });
    await flush();
    const txt = shownText(rs);
    ok(/Match on Farmstead \(Battle Zones\) stopped\. The game was closed and nothing was reported\./.test(txt) && txt.includes(en['bots.botmatch.stoppedUp']) && stopB.hidden && !rs.all().some(n => n.className === 'err'), 'client: after a stop the card says the game was closed and nothing was reported, plainly: ' + txt.slice(-260));
    ok(BC.checkScreen(rs, 'bots').length === 0, 'client: block rules with the Stop button ' + BC.checkScreen(rs, 'bots').slice(0, 4).join(' | '));
    // a Preview stopped from the job list
    const mi = rs.all().find(n => n.tagName === 'INPUT' && n.getAttribute('aria-label') === en['bots.botmatch.map']); mi.value = 'multi/x';
    rs.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-preview') === '1').click();
    await flush();
    const planCall = sent.find(x => x[1] === 'botmatch/plan');
    ok(planCall && planCall[2] && /^Try a bot match|^.+: /.test(planCall[2].what || ''), 'client: Preview names its request for the job list: ' + JSON.stringify(planCall && planCall[2]));
    ok(shownText(rs).includes(en['bots.botmatch.reqStopped']) && !rs.all().some(n => n.className === 'err'), 'client: a stopped Preview is a plain line: ' + shownText(rs).slice(-200));
  }
  // every key the client asks for is a row
  const miss = new Set(); const tx2 = (k, p) => { if (/^bots\.botmatch\./.test(k) && en[k] == null) miss.add(k); return tx(k, p); };
  const p2 = []; new Function('BOTS_PARTS', 'h', 'tx', 'show', 'askDo', 'searchKit', 'document', 'setTimeout', P.script)(p2, h, tx2, () => {}, () => ({ then() {} }), spyKit, doc, later);
  for (const g of ['as64', 'mowas2', 'goh']) { const r = doc.createElement('div'); p2[0].draw({ mod, gid: g, kit, api: apiOf(cctx), reload() {}, go() {} }).forEach(el => r.appendChild(el)); }
  await flush();
  const src = P.script; for (const m of src.matchAll(/t\('([a-zA-Z.]+)'/g)) if (!en['bots.botmatch.' + m[1]] && !/^(d|pinned|rep\.army)\.$/.test(m[1])) miss.add('bots.botmatch.' + m[1]);
  ok(miss.size === 0, 'client: no missing keys ' + [...miss].join(' '));

  console.log(bad ? bad + ' failures' : 'bots part botmatch PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + (e && e.stack || e)); process.exit(1); });
