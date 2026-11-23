// prove: functional check of one unit in a running match. spawn, move, fire, kill, read from mission markers in game.log
// Author: Imperator_Aug (ARSENAL, ia-a96df86a)
//   node tools/prove/prove.js --game <install> --unit t34_0 --army rus [--kind vehicle|human] [--mods a,b] [--side 4] [--target gaz67b]
//     [--map multi/2v2_farmstead:combat] [--hold 200] [--inst 1] [--stage-as e2e_test8] [--exe as64.exe] [--plan] [--control fake]
// --exe names the game too (game parity): as64.exe (default) | mowas_2.exe = MoW:AS2: mods default none, fixture mod.info 3.262 range, --plan and --score only
//   (the match needs the control pipe, TST-19; --plan also prints the uidrive host lines PROVE_HOST: stage the fixture as <game>/mods/<--stage-as> and
//   mount that name, play mowas2 boot,lobby_gazala,bot_start, the log from
//   'uidrive where mowas2', then --score; a mission not in map.pak is read on the mowas_2 mount of --mods, e.g. --map multi/1v1_gazala:battle_zones)
//   | call_to_arms.exe = GoH: --score only (refused otherwise, exit 2: no control pipe, bot scripts differ,, GHMIS-66);
//     --game may be left out under GoH (games.install('goh'); --score needs no install)
//   | any other *.exe = as64 (a renamed build, as before) | a word: as64, mowas2, goh
// bot on side 4 (team b) buys --unit from its card. mission triggers order it, then print markers. no marker = not proven
// --plan writes the fixture and scenario only, no game. --control fake: unit name that can't exist, every marker after route must stay silent
// --add-cards: batch cards with no roster line (a ported entity) get a cheap test card in the staged copy of vehicles_<army>.set
// --tiny: generated flat map (tools/testmap), short slots, the run ends when the last slot does. --lag s: bot's wait after a slot opens
// batch: --units a,b:human,c [--depth spawn|move|fire] [--slot s] [--games N] [--sentinel card] [--enemy card] many cards through one match in turn, N matches side by side.
//   a crash names the open slot as suspect, the cards after it rerun in a fresh game. default enemy: gmc for vehicles, riflemans2(usa) for humans
// --damage-in (with --depth fire): the listed unit stands still and --enemy (default t34_0) shoots it. --control-rep card[:kind] (with --games): a known good unit opens each game, if it fails that game's results are void
// --dir D: write the fixture mod to D/mods/prove<inst> and the scenario to D/prove<inst>-run.json (default tools/testrun/scenarios; testrun finds the fixture beside the scenario)
// --names "card=Name|Name2;card2=Name3": kill-feed display names of each card's entity and crew; a fire slot then passes only on a kill credited to them (F11). --not-shooters "A|B": keeper/sentinel names, never credited
// exit 0 all gates pass, 1 gate failed or game died, 2 usage
const fs = require('fs'), path = require('path'), cp = require('child_process');
const R = path.join(__dirname, '..', '..');
const pak = require(path.join(R, 'tools/lib/pak.js'));
const batch = require('./batch.js');
const testmap = require(path.join(R, 'tools/testmap/testmap.js'));
// batch parent helpers, pure (KILLPROOF): a failed control voids its game (units rerun, leftovers pass null), never FAIL
function takeResult(st, units, r, ctl, BATCH) {
  if (r && r.exception) st.crashed = true;
  if (!r || (!r.done && !r.suspect)) { st.queue.push(...units); st.dead++; return 'dead'; } // no game, or it died before slot 0
  if (ctl) {
    st.ctlRuns++;
    const c = (r.rows || []).find(x => x.card === ctl.card);
    if (!c || !c.pass) { // the harness failed, not the units: void this game, rerun its units
      const why = 'control failed: ' + (c ? c.why : 'no row'); st.ctlFails.push(why);
      for (const u of units) st.voided[u.card] = why;
      st.queue.push(...units); return 'void';
    }
    r.rows = r.rows.filter(x => x !== c || BATCH.some(u => u.card === ctl.card));
  }
  for (const x of r.rows) if (x.ran || !r.suspect) { st.pass[x.card] = x; delete st.voided[x.card]; }
  if (r.suspect) { st.suspects.push(r.suspect); st.queue.push(...units.filter(u => !r.rows.find(x => x.card === u.card && x.ran))); }
  return 'ok';
}
function finalOf(st, BATCH, ctl) {
  const rows = BATCH.map(u => st.pass[u.card] || (st.voided[u.card] ? { card: u.card, kind: u.kind, pass: null, why: 'void: ' + st.voided[u.card] } : { card: u.card, kind: u.kind, pass: false, why: 'never ran' }));
  for (const s of st.suspects) { const x = rows.find(y => y.card === s); if (x) { x.pass = false; x.why = 'game died in this slot'; } }
  const fail = rows.some(x => x.pass === false), vd = rows.some(x => x.pass === null);
  const r = { rows, exception: st.crashed, done: true, open: rows.length - 1, suspect: st.suspects.join(','), route: true, pass: !fail && !vd, verdict: fail ? 'FAIL' : vd ? 'VOID' : 'PASS' };
  if (ctl) r.control = { card: ctl.card, games: st.ctlRuns, failed: st.ctlFails };
  return r;
}
const newState = queue => ({ pass: {}, voided: {}, queue: [...queue], dead: 0, crashed: false, suspects: [], ctlFails: [], ctlRuns: 0 });
if (require.main !== module) { module.exports = { takeResult, finalOf, newState }; return; }
const USAGE = 'usage: ARSENAL prove --game <install> --unit <card> --army <army> [--kind vehicle|human] [--mods a,b] [--plan] [--dir D]';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); }
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = true; else { args[a.slice(2)] = next; i++; }
}
// game parity (2026-11-14): the game is taken from --exe (an exe file or path, or a games.js word): as64.exe or none -> as64 (as before),
//   mowas_2.exe -> mowas2, call_to_arms.exe -> goh, any other *.exe (a renamed build) -> as64 as before. --score reads a saved log the same way on every game:
//   con markers reach game.log on both (in-play-nopipe.md [V]); GoH starts every game.log line with '[hh:mm:ss] ' (GHLOG-07 [V]) and score() matches the
//   markers anywhere in a line, so the stamp needs no strip [I] (tested with stamped logs in test/run.sh).
//   MoW:AS2: mods default none, mod.info 3.262 range (tools/newmod RANGE), vfs exe mowas_2; --plan writes fixture + scenario; the match itself is hosted over the
//   control pipe (testrun mp_* steps), which mowas_2.exe lacks: a run that is not --plan / --score is refused (TST-19). [T] first run
//   GoH: --plan and the run are refused: the fixture is AS2 forms (game set, scenario of pipe steps, stock mission in resource/map.pak) and GoH has no control pipe
const games = require(path.join(R, 'tools/lib/games.js'));
function gameOfExe(x) {
  if (x === undefined || x === true || x === '') return 'as64';
  const b = String(x).replace(/\\/g, '/').split('/').pop().toLowerCase();
  if (/^call_to_arms/.test(b)) return 'goh';
  if (/^mowas_2/.test(b)) return 'mowas2';
  if (/^as64/.test(b)) return 'as64';
  return games.idOf(b) || (/\.exe$/.test(b) ? 'as64' : null);   // a renamed build (other *.exe) runs as as64, as before the batch
}
const GAME = gameOfExe(args.exe);
if (!GAME) { console.error('PROVE_BAD_EXE: --exe ' + args.exe + ' is not a game exe (as64.exe, mowas_2.exe; or as64, mowas2)'); process.exit(2); }
// GoH with no --game: the install comes from games.install('goh') (wave 2 rule); --score, the only GoH path, reads the log alone and needs no install
if (GAME === 'goh' && (!args.game || args.game === true)) { let d = null; try { d = games.install('goh').dir; } catch (e) { d = null; } if (d) args.game = d; else if (args.score) args.game = '.'; }
if (GAME === 'goh' && !args.score) games.refuse('prove', 'goh', 'the match fixture is AS2 forms (game set, bot buy through AS2 bot.main.lua, testrun scenario of control pipe steps), GoH has no control pipe and its bot scripts differ; --score reads a GoH log', 'modweb/testing/goh-drive.md, GHMIS-66');
if (GAME === 'mowas2' && !args.plan && !args.score) games.refuse('prove', 'mowas2', 'the match is hosted over the control pipe (testrun mp_* steps), and mowas_2.exe has no -control, -console or -instance; --plan writes the fixture and prints the uidrive host lines, --score reads a log', 'TST-19');
if (!args.game || args.game === true || !(args.unit || args.units) || !args.army) { console.error(USAGE); process.exit(2); }
const VEXE = GAME === 'as64' ? undefined : games.exeOf(GAME);
const vfsOpt = o => (VEXE ? { ...o, exe: VEXE } : o);
const MODINFO = GAME === 'mowas2' ? (r => `{Mod\n {Name "prove fixture"}\n {MinGameVersion "${r.min}"}\n {MaxGameVersion "${r.max}"}\n}\n`)(require(path.join(R, 'tools/newmod/newmod.js')).RANGE.mowas2) : '{Mod\n {Name "prove fixture"}\n {MinGameVersion "3.301"}\n}\n';
// --inst names a game instance dir and a fixture folder: digits 1..9 only (9 = test plans), --games capped at 8 (stage-as e2e_test1..8)
if (args.inst !== undefined && !/^[1-9]$/.test(String(args.inst))) { console.error('PROVE_BAD_INST: --inst must be 1..9'); process.exit(2); }
if (args.games !== undefined && !(/^\d+$/.test(String(args.games)) && +args.games >= 1 && +args.games <= 8)) { console.error('PROVE_BAD_GAMES: --games must be 1..8'); process.exit(2); }
if (args.dir === true) { console.error('PROVE_BAD_DIR: --dir needs a folder'); process.exit(2); }
const G = args.game, KIND = args.kind || 'vehicle', SIDE = String(args.side || 4), TARGET = args.target || 'gaz67b';
const TINY = args.tiny ? testmap.build({ gap: args.gap, size: args.size }) : null;
const [MAP, MODE] = TINY ? [TINY.dir, TINY.mode] : String(args.map || 'multi/2v2_farmstead:combat').split(':');
const HOLD = +(args.hold || 200), INST = String(args.inst || 1), STAGE = args['stage-as'] || 'e2e_test' + (9 - +INST), FIX = 'prove' + INST, ENEMY_ARG = args.enemy || '', ESIDE = String(args['enemy-side'] || 3), EKIND = args['enemy-kind'] || 'human';
const UNIT = args.control === 'fake' ? 'prove_no_such_card' : args.unit;
const FOE = batch.foeOf({ kind: KIND }, { enemy: ENEMY_ARG, ekind: EKIND }), ENEMY = FOE.card, FOEKIND = FOE.kind;
const MODS = String(args.mods || (GAME === 'as64' ? 'as64+' : '')).split(',').filter(Boolean);
const BATCH = args.units ? batch.parseUnits(args.units, KIND) : null;
const DEPTH = args.depth || 'fire', SLOT = +(args.slot || (TINY ? batch.TINY.depth : batch.DEPTH)[DEPTH]);
if (BATCH && !batch.DEPTH[DEPTH]) { console.error('depth must be spawn, move or fire'); process.exit(2); }
const BATCH_KEEP = String(args.keep || 5);
const BO = { side: SIDE, eside: ESIDE, ekind: EKIND, enemy: ENEMY_ARG, keep: BATCH_KEEP, keeper: args.keeper || `riflemans2(${args.army})`, sentinel: args.sentinel || 'riflemans2(usa)', slot: SLOT, depth: DEPTH, damageIn: !!args['damage-in'], near: 10, fixedSlot: !!args.slot, tiny: !!TINY, names: args.names ? batch.parseNames(args.names) : null, notShooters: args['not-shooters'] ? String(args['not-shooters']).split('|').map(x => x.trim()).filter(Boolean) : null, lag: +(args.lag || (TINY ? batch.TINY.lag : batch.LAG)) };
// plan stage: the control rep must be a vehicle card the army under test sells, else every game's control fails and the results are void
if (args['control-rep'] && BATCH && !args.score) {
  const c = batch.parseUnits(args['control-rep'], KIND)[0];
  if (c && c.kind === 'vehicle') {
    const vf = require(path.join(R, 'tools/lib/vfs.js'));
    let cards = null;
    try {
      const rec = vf.build(vfsOpt({ gameDir: G, mods: MODS, disableVersionControl: true })).files.get(`resource/set/multiplayer/units/vehicles_${args.army}.set`);
      if (rec) cards = [...vf.readRec(rec).toString('latin1').matchAll(/^\s*\{"([^"]+)"/gm)].map(m => m[1]);
    } catch (e) { cards = null; }
    if (!cards) console.error(`PROVE_CONTROL_UNCHECKED: no vehicles_${args.army}.set readable on this mount, control ${c.card} not checked`);
    else if (!cards.includes(c.card)) {
      const pref = { rus: 't34_0', usa: 'm4a3_75', jap: 'chi-ha57', ger: 'pz3' }[args.army];
      const ok = cards.includes(pref) ? pref : cards.find(x => !/^hero/.test(x));
      console.error(`PROVE_CONTROL_NOT_SOLD: army ${args.army} does not sell control ${c.card} (vehicles_${args.army}.set); use --control-rep ${ok}`);
      process.exit(2);
    }
  }
}
if (!['vehicle', 'human'].includes(KIND)) { console.error('kind must be vehicle or human'); process.exit(2); }
const NEAR_M = 10, GOAL_U = +(args.goal || (TINY ? 500 : 1000)), WP_U = GOAL_U - 120; // near is metres, 20 units per metre
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const nm = x => String(x.name || x.path || x.file || x).split('\\').join('/');

function stockMission() {
  if (TINY) return TINY.files['combat.mi'].toString('latin1');
  const mp = path.join(G, 'resource/map.pak'), want = `map/${MAP}/${MODE}.mi`.toLowerCase();
  const e = GAME === 'as64' || fs.existsSync(mp) ? pak.list(mp) : [];
  const f = e.find(x => nm(x).toLowerCase() === want);
  if (f) return Buffer.from(pak.read(e, f)).toString('latin1');
  // MoW:AS2: the uidrive lobby route hosts a mod map (multi/1v1_gazala, RobZ: refmods/robz/godny.md), so a mission not in map.pak is read on the mowas_2 mount of --mods
  if (GAME === 'mowas2') {
    const vf = require(path.join(R, 'tools/lib/vfs.js'));
    const rec = vf.build(vfsOpt({ gameDir: G, mods: MODS, disableVersionControl: true })).files.get('resource/' + want);
    if (rec) return vf.readRec(rec).toString('latin1');
    throw new Error(`not in resource/map.pak nor on the mowas_2 mount of --mods (${MODS.join(',') || 'none'}): ${want}`);
  }
  throw new Error('not in resource/map.pak: ' + want);
}
// spawn points of the team the bot sits on: the goal sits on the line from b1 toward a1
function points(t) {
  const out = {};
  for (const m of t.matchAll(/\{Entity "map_point" 0x\w+\s*\{Position (-?[\d.]+) (-?[\d.]+)\}[^]*?\{name "?(\w+)"?\}/g)) out[m[3]] = [+m[1], +m[2]];
  if (!out.a1 || !out[args.spawn || 'b1']) throw new Error('mission has no a1/b1 map_point');
  return out;
}
function along(a, b, d) { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [a[0] + dx / l * d, a[1] + dy / l * d]; }
const f2 = v => v.toFixed(2);
const mark = text => `{"con" {text "PROVE ${text}"}}`;
function sel() { return `{player "${SIDE}"} {type ${KIND}}${KIND === 'vehicle' ? ' {state inhabited}' : ''}`; }
function triggers() {
  if (BATCH) return batch.triggers(BATCH, BO);
  const near = `{"2.near" {units ${sel()}} {near_to {tag pv_t}} {distance ${NEAR_M}}}`;
  const foe = `{player "${ESIDE}"} {type ${FOEKIND}}`;
  const rows = [
    `{"pv_route" {condition} {actions ${mark('route')}}}`,
    `{"pv_target" {condition {terms {"1.entities" {selector {tag pv_t} {state "not dead"}} {count {op "=="} {value 1}}}}} {actions ${mark('target_placed')}}}`,
    `{"pv_control" {condition {terms {"1.entities" {selector {tag pv_c} {state "not dead"}} {count {op "=="} {value 1}}}}} {actions ${mark('control_placed')}}}`,
    `{"pv_seen" {condition {terms {"1.entities" {selector ${sel()}} {count {op ">"} {value 0}}}}} {actions ${mark('seen')} {"delay" {time 3}} ${args['no-hold'] ? '' : `{"actor_state" {selector ${sel()}} {fire_mode hold}}`} {"actor_to_waypoint" {selector ${sel()}} {waypoint "900"}} ${mark('ordered')}}}`,
    `{"pv_far" {condition {expression "1 & !2"} {terms {"1.entities" {selector ${sel()}} {count {op ">"} {value 0}}} ${near}}} {actions ${mark('far_from_goal')}}}`,
    `{"pv_moved" {condition {terms {"1.entities" {selector ${sel()}} {count {op ">"} {value 0}}} ${near}}} {actions ${mark('moved')} {"actor_state" {selector ${sel()}} {fire_mode open}} ${args['auto-fire'] ? mark('fire_ordered') + ' ' + mark('fire_position') : `{"actor_fire" {selector ${sel()}} {attack enemies} {enemies ${ENEMY ? foe : '{tag pv_t}'}} {time 15}} ${mark('fire_ordered')} {"delay" {time 20}} {"actor_fire" {selector ${sel()}} {attack position} {waypoint "901"}} ${mark('fire_position')}`}}}`,
    `{"pv_killed" {condition {terms {"1.entities" {selector {tag pv_t} {state "not dead"}} {count {op "=="} {value 0}}}}} {actions ${mark('target_dead')}}}`,
    `{"pv_t_gone" {condition {terms {"1.entities" {selector {tag pv_t}} {count {op "=="} {value 0}}}}} {actions ${mark('target_gone')}}}`,
    `{"pv_t_op" {condition {terms {"1.entities" {selector {tag pv_t} {state operatable}} {count {op ">"} {value 0}}}}} {actions ${mark('target_operatable')}}}`,
    `{"pv_t_noop" {condition {terms {"1.entities" {selector {tag pv_t} {state "not operatable"}} {count {op ">"} {value 0}}}}} {actions ${mark('target_not_operatable')}}}`,
    `{"pv_t_mv" {condition {terms {"1.entities" {selector {tag pv_t} {state moveable}} {count {op ">"} {value 0}}}}} {actions ${mark('target_moveable')}}}`,
    `{"pv_t_nomv" {condition {terms {"1.entities" {selector {tag pv_t} {state "not moveable"}} {count {op ">"} {value 0}}}}} {actions ${mark('target_not_moveable')}}}`,
    `{"pv_foe" {condition {terms {"1.entities" {selector ${foe}} {count {op ">"} {value 0}}}}} {actions ${mark('foe_seen')} {"actor_state" {selector ${foe}} {fire_mode hold}} {"actor_to_waypoint" {selector ${foe}} {waypoint "901"}}}}`,
    `{"pv_foe_dead" {condition {terms {"1.entities" {selector ${foe} {state dead}} {count {op ">"} {value 0}}}}} {actions ${mark('foe_dead')}}}`,
    `{"pv_foe_all" {condition {expression "1 & 2"} {terms {"1.trigger" {name "pv_foe"}} {"2.entities" {selector ${foe} {state "not dead"}} {count {op "=="} {value 0}}}}} {actions ${mark('foe_all_dead')}}}`,
    `{"pv_foe_noop" {condition {terms {"1.entities" {selector ${foe} {state "not operatable"}} {count {op ">"} {value 0}}}}} {actions ${mark('foe_not_operatable')}}}`,
    `{"pv_foe_nomv" {condition {terms {"1.entities" {selector ${foe} {state "not moveable"}} {count {op ">"} {value 0}}}}} {actions ${mark('foe_not_moveable')}}}`,
    // F12: not moveable is a tracked or crew-hit foe too, so it gates as "immobilised". a wreck (a destroyed body part, same advanced term as edrun k2) or dead is read beside it, not gated [T: term never run in prove]
    `{"pv_foe_wreck" {condition {terms {"1.entities" {selector {ignore_captured_by_user 0} {source advanced} {group {select {player "${ESIDE}"} {type ${FOEKIND}}} {include {destroyed_components {masks "body"}}}}} {count {op ">"} {value 0}}}}} {actions ${mark('foe_wrecked')}}}`,
    `{"pv_foe_empty" {condition {expression "1 & 2"} {terms {"1.trigger" {name "pv_foe"}} {"2.entities" {selector ${foe} {state inhabited}} {count {op "=="} {value 0}}}}} {actions ${mark('foe_empty')}}}`,
    `{"pv_foe_gone" {condition {expression "1 & 2"} {terms {"1.trigger" {name "pv_foe"}} {"2.entities" {selector ${foe}} {count {op "=="} {value 0}}}}} {actions ${mark('foe_gone')}}}`,
    `{"pv_control_dead" {condition {terms {"1.entities" {selector {tag pv_c} {state "not dead"}} {count {op "=="} {value 0}}}}} {actions ${mark('control_dead')}}}`,
  ];
  // which side number the bot got: read once per side, the run prints what it found
  for (const p of [1, 2, 3, 4]) rows.push(`{"pv_side${p}" {condition {terms {"1.entities" {selector {player "${p}"} {type ${KIND}}} {count {op ">"} {value 0}}}}} {actions ${mark('side_' + p + '_has_' + KIND)}}}`);
  return rows.map(r => '\t\t\t' + r).join('\n');
}
function mission() {
  let t;
  try { t = stockMission(); } catch (e) { console.error('PROVE_NO_MAP: ' + e.message); process.exit(2); } // a plain line, not a stack

  if (!t.includes('{triggers')) throw new Error('mission has no triggers block');
  const p = points(t), sp = p[args.spawn || 'b1'], goal = along(sp, p.a1, GOAL_U), wp = along(sp, p.a1, WP_U), ctl = along(p.a1, sp, 300);
  t = t.replace('{triggers', `{waypoints "player"\n\t\t\t{"900" {position ${f2(wp[0])} ${f2(wp[1])} 0} {radius 20}}\n\t\t\t{"901" {position ${f2(goal[0])} ${f2(goal[1])} 0} {radius 20}}\n\t\t}\n\t\t{triggers\n${triggers()}`);
  const ent = (id, name, q) => `{Entity "${name}" ${id}\n\t\t{Position ${f2(q[0])} ${f2(q[1])}}\n\t\t{Player 1}\n\t}\n\t`;
  const at = t.indexOf('{Entity "');
  if (at < 0) throw new Error('mission has no entities');
  t = t.slice(0, at) + ent('0xe2e0', TARGET, goal) + ent('0xe2e1', TARGET, ctl) + `{Tags "pv_t" 0xe2e0}\n\t{Tags "pv_c" 0xe2e1}\n\t` + t.slice(at);
  return { text: t, goal, wp, ctl, spawn: sp };
}
const BOT = u => `-- prove: buy one unit per side, then idle. no require of bot.lua: the AI must not move it
local bought = false
local card = ({[${SIDE}] = "${u}"${ENEMY ? `, [${ESIDE}] = "${ENEMY}"` : ''}})[BotApi.Instance.playerId]
print("PROVE bot side=" .. tostring(BotApi.Instance.playerId) .. " team=" .. tostring(BotApi.Instance.team) .. " card=" .. tostring(card))
local function Probe()
	if card and not bought then
		if BotApi.Commands:Spawn(card, 5) then
			print("PROVE bot tried " .. card .. " army=" .. tostring(BotApi.Instance.army))
			bought = true
		end
	end
end
BotApi.Events:Subscribe(BotApi.Events.Quant, Probe)
`;
const REQ = [['route', 'override read'], ['seen', 'gate 1: crewed unit on the map'], ['far_from_goal', 'spawned away from goal'], ['ordered', 'order issued'], ['moved', 'gate 2: reached goal'], ['fire_ordered', 'fire order issued'], [FOEKIND === 'human' ? 'foe_dead' : 'foe_not_moveable', FOEKIND === 'human' ? 'gate 2: enemy killed' : 'gate 2: enemy immobilised (not moveable; killed = foe_dead or foe_wrecked, read only)']];
function buildFixture() {
  const scen = path.join(R, 'tools/testrun/scenarios'), dir = args.dir ? path.resolve(String(args.dir)) : scen, d = path.join(dir, 'mods', FIX);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(path.join(d, 'resource/map', MAP), { recursive: true });
  fs.mkdirSync(path.join(d, 'resource/script/multiplayer'), { recursive: true });
  fs.mkdirSync(path.join(d, 'resource/set/multiplayer/games'), { recursive: true });
  fs.writeFileSync(path.join(d, 'mod.info'), crlf(MODINFO));
  const m = mission();
  if (TINY) testmap.write(d, TINY);
  if (args['add-cards'] && BATCH) {
    const rel = `set/multiplayer/units/vehicles_${args.army}.set`, v = require(path.join(R, 'tools/lib/vfs.js')).build(vfsOpt({ gameDir: G, mods: MODS, disableVersionControl: true }));
    const rec = v.files.get('resource/' + rel);
    if (!rec) throw new Error('no ' + rel + ' on this mount');
    const stock = require(path.join(R, 'tools/lib/vfs.js')).readRec(rec).toString('latin1');
    const has = c => stock.split(/\r?\n/).some(l => l.trimStart().startsWith('{"' + c + '"'));
    const lines = BATCH.filter(u => u.kind === 'vehicle' && !has(u.card)).map(u => batch.testCard(u.card, args.army));
    fs.mkdirSync(path.join(d, 'resource/set/multiplayer/units'), { recursive: true });
    fs.writeFileSync(path.join(d, 'resource', rel), crlf(stock.trimEnd() + '\n' + lines.join('\n') + '\n'), 'latin1');
  }
  fs.writeFileSync(path.join(d, 'resource/map', MAP, MODE + '.mi'), crlf(m.text), 'latin1');
  fs.writeFileSync(path.join(d, 'resource/script/multiplayer/bot.main.lua'), crlf(BATCH ? batch.bot(BATCH, BO) : BOT(UNIT)));
  // team mode: the host pins each team's army (alliance mode offers no team.<t>.army field)
  const stockSet = fs.readFileSync(path.join(scen, 'mods/mis-08/resource/set/multiplayer/games/combat.set'), 'latin1');
  const gameSet = BATCH ? batch.gameSet(stockSet) : stockSet.replace(/\{armySelectionMode\s+alliance\}/, '{armySelectionMode team}');
  fs.writeFileSync(path.join(d, `resource/set/multiplayer/games/${MODE}.set`), gameSet, 'latin1');
  const sc = {
    name: FIX, rows: [], mode: 'menu', fixture: [FIX], mods: [...MODS, FIX], params: { map: `${MAP}:${MODE}`, army: args.army },
    src: ['', '', '', ''],
    note: 'Generated by tools/prove. Bot buys one card, mission markers report spawn, move, fire, kill.',
    preflight: false,
    steps: [
      { cmd: 'mp_lan' }, { wait_stage: true }, { cmd: 'mp_host {map} 4' }, { wait_stage: true },
      { cmd: 'mp_settings' }, { cmd: 'mp_set team.a.army {army}' }, { cmd: 'mp_set team.b.army {army}' }, { cmd: 'mp_slot 2 normal' }, { cmd: 'mp_slot 3 normal' }, ...(BATCH ? [{ cmd: `mp_slot ${+BATCH_KEEP - 1} normal` }] : []), { cmd: 'mp_slots' }, { cmd: 'mp_ready' }, { cmd: 'mp_start' },
      { wait: 'loaded', timeout: 420 }, ...(TINY && BATCH ? [{ wait_log: 'PROVE done', timeout: batch.totalTime(BATCH, BO) + 60 }] : [{ wait: 66 }, { cmd: 'mp_userUnits' }, { wait: BATCH ? batch.totalTime(BATCH, BO) + SLOT + 30 : HOLD }, { cmd: 'mp_userUnits' }]),
    ],
    verdict: [{ log: '\\*{5,} Exception \\*{5,}', want: false }, { log: 'PROVE route' }],
  };
  const f = path.join(dir, FIX + '-run.json');
  fs.writeFileSync(f, JSON.stringify(sc, null, 1));
  return { scenario: f, m, dir: d };
}
// MoW:AS2 host plan (dry, [T] first run): no control pipe (TST-19), so the match is hosted by window input (tools/uidrive routes/mowas2.json,
//   boot,lobby_gazala,bot_start [V]) and the markers are read from the release game.log afterwards (con reaches it [V]).
//   the lobby route picks multi/1v1_gazala:battle_zones (a RobZ map, refmods/robz/godny.md) with ONE AI seat (slot 2): the foe bot of --enemy-side has no seat.
//   printed only; prove never starts it
const HOST_MAP = 'multi/1v1_gazala:battle_zones';
function hostPlan(fixDir) {
  const routes = ['boot', 'lobby_gazala', ...(args.army === 'rus' ? ['army_b_rus'] : []), 'bot_start'].join(',');
  const fwd = s => String(s).replace(/\\/g, '/');
  // --inst 9 gives e2e_test0, which no tool may stage (tools/lib/testfolders.js): the host plan then names the first approved folder
  const TF = require(path.join(R, 'tools/lib/testfolders.js')), ST = TF.FOLDERS.includes(STAGE) ? STAGE : TF.FOLDERS[0];
  const out = [
    `PROVE_HOST [T]: node tools/uidrive/uidrive.js play mowas2 ${routes} --game "${fwd(G)}"`,
    // the fixture is written beside the scenario, never into <game>/mods: stage it under an approved e2e_test name first, as testrun --stage-as does
    `PROVE_HOST stage: copy "${fwd(fixDir)}" to "${fwd(path.join(G, 'mods', ST))}" (an approved e2e_test folder, as testrun --stage-as ${ST} does)`,
    `PROVE_HOST mods: mount ${[...MODS, ST].join(',')} in the profile's mod list before the boot (tools/modswitch --set), ${ST} is the staged fixture`,
    'PROVE_HOST log: node tools/uidrive/uidrive.js where mowas2 names the game.log; then prove --exe mowas_2.exe --score <that log> (same flags)',
  ];
  if (args['stage-as'] && ST !== STAGE) out.push(`PROVE_HOST warn: --stage-as ${STAGE} is not an approved folder (${TF.FOLDERS.join(', ')}): the plan stages ${ST}`);
  if (`${MAP}:${MODE}` !== HOST_MAP) out.push(`PROVE_HOST warn: the lobby_gazala route hosts ${HOST_MAP}; this fixture overrides ${MAP}:${MODE}, the hosted match would not read it (--map ${HOST_MAP} --mods <the RobZ mod folder that holds it>)`);
  if (args.army && args.army !== 'rus') out.push(`PROVE_HOST warn: no lobby route sets army ${args.army} for team B (only army_b_rus): team B keeps the lobby default`);
  out.push(`PROVE_HOST warn: the lobby has one AI seat: the bot buys --unit on side ${SIDE} (read "PROVE bot side=" in the log, pass --side to match) and no bot buys the foe on side ${ESIDE}, so the fire gate stays unseen [T]`);
  return out;
}
function logPath() { // Documents, OneDrive/Documents or OneDrive/Desktop/Documents (lib/userdir)
  const d = require(path.join(R, 'tools/lib/userdir.js')).logDir(+(args.inst || 1));
  return d ? path.join(d, 'game.log') : '';
}
function score(log, control) {
  const fired = name => new RegExp('PROVE ' + name + '\\b').test(log);
  const rows = REQ.map(([k, what]) => ({ marker: k, what, seen: fired(k) }));
  const sides = [1, 2, 3, 4].filter(p => fired(`side_${p}_has_${KIND}`));
  const ex = /\*{5,} Exception \*{5,}/.test(log);
  const before = (a, b) => { const i = log.search(new RegExp('PROVE ' + a + '\\b')), j = log.search(new RegExp('PROVE ' + b + '\\b')); return i >= 0 && j > i; };
  const inOrder = before('far_from_goal', 'moved');
  const pass = control ? fired('route') && !fired('seen') && !ex : rows.every(r => r.seen) && inOrder && !ex && !fired('control_dead');
  return { rows, sides, inOrder, killed: FOEKIND === 'human' ? fired('foe_dead') : fired('foe_dead') || fired('foe_wrecked'), immobilised: fired('foe_not_moveable'), exception: ex, controlDead: fired('control_dead'), notFound: (/Spawning Unit Not found[^\r\n]*/.exec(log) || [''])[0], cantSpawn: (/can't spawn entity[^\r\n]*/.exec(log) || [''])[0], pass };
}
function showBatch(r) {
  for (const x of r.rows) console.log((x.pass ? 'pass ' : x.pass === null ? 'void ' : 'FAIL ') + x.card.padEnd(28) + x.kind.padEnd(8) + (x.why || (x.shooter ? 'by ' + x.shooter : '')));
  console.log(JSON.stringify({ exception: r.exception, done: r.done, open: r.open, suspect: r.suspect, route: r.route, control: r.control }));
  console.log('VERDICT ' + (r.verdict || (r.pass ? 'PASS' : 'FAIL')));
}
if (args.score && BATCH) {
  const r = batch.score(fs.readFileSync(args.score, 'latin1'), BATCH, BO);
  showBatch(r); process.exit(r.pass ? 0 : 1);
}
// parent: split the list over N games at once, rerun what a crash left unreached
if (BATCH && args.games && !args.plan) {
  const out = args.out || path.join(R, '..', 'run', 'prove', 'batch');
  const ctl = args['control-rep'] ? batch.parseUnits(args['control-rep'], KIND)[0] : null, st = newState(BATCH); let round = 0;
  const CHILD = process.env.PROVE_CHILD || __filename, STAGGER = process.env.PROVE_STAGGER_MS !== undefined ? +process.env.PROVE_STAGGER_MS : 15000; // test hooks: fake child, no stagger
  const own = ['--units', '--games', '--inst', '--stage-as', '--out', '--dir'];
  const keep = process.argv.slice(2).filter((a, i, all) => !own.includes(a) && !own.includes(all[i - 1]));
  const one = (units, g) => new Promise(done => {
    const dir = path.join(out, 'r' + round + 'g' + g), spec = (ctl ? [ctl, ...units] : units).map(u => u.card + ':' + u.kind).join(',');
    setTimeout(() => {
      fs.rmSync(dir, { recursive: true, force: true }); // a result.json left by an older run must not stand in for this game
      const c = cp.spawn(process.execPath, [CHILD, ...keep, '--units', spec, '--inst', String(g), '--stage-as', 'e2e_test' + (9 - g), '--out', dir, ...(args.dir ? ['--dir', String(args.dir)] : [])], { stdio: 'ignore' });
      c.on('exit', () => { let r = null; try { r = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')); } catch { /* no game */ } done({ units, r, dir }); });
    }, (g - 1) * STAGGER);
  });
  (async () => {
    while (st.queue.length && round < 4) {
      const parts = batch.chunk(st.queue, +args.games);
      const res = await Promise.all(parts.map((u, i) => one(u, i + 1)));
      st.queue = [];
      for (const { units, r } of res) takeResult(st, units, r, ctl, BATCH);
      round++;
      if (st.dead >= +args.games) { console.error('PROVE_HARNESS: every game died before slot 0, see ' + path.join(out, 'r' + (round - 1) + 'g1', 'game.log')); break; }
      st.dead = 0;
    }
    const r = finalOf(st, BATCH, ctl);
    fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(r, null, 1));
    showBatch(r); process.exit(r.pass ? 0 : 1);
  })();
  return;
}
if (args.score) { // re-read a saved log without running the game
  const r = score(fs.readFileSync(args.score, 'latin1'), args.control === 'fake');
  console.log(JSON.stringify(r, null, 1)); process.exit(r.pass ? 0 : 1);
}
const TOTAL = BATCH ? 700 + batch.totalTime(BATCH, BO) + SLOT : 900;
const b = buildFixture();
console.log('fixture ready', JSON.stringify({ unit: UNIT, army: args.army, kind: KIND, side: SIDE, mods: MODS, spawn: b.m.spawn, wp: b.m.wp, goal: b.m.goal, control: b.m.ctl }));
if (args.plan && GAME === 'mowas2') for (const l of hostPlan(b.dir)) console.log(l);
if (args.plan) process.exit(0);
const run =['tools/testrun/testrun.js', '--scenario', b.scenario, '--inst', String(args.inst || 1), '--stage-as', STAGE, '--no-preflight', '--timeout', String(TOTAL), '--hang-sec', String(TOTAL), '--mod-timeout', '900', '--stage-timeout', '600'];
run.push('--exe', args.exe && /\.exe$/i.test(String(args.exe)) ? args.exe : path.join(G, games.get(GAME).file));
if (!args['no-sound']) run.push('--sound');
const started = Date.now();
const x = cp.spawnSync(process.execPath, run, { cwd: R, encoding: 'utf8', timeout: (TOTAL + 600) * 1000, maxBuffer: 64 * 1024 * 1024 });
const out = (x.stdout || '') + (x.stderr || '');
if (args.out) { fs.mkdirSync(args.out, { recursive: true }); fs.writeFileSync(path.join(args.out, 'testrun.txt'), out); }
if (/WARN_TESTRUN_DRY_IMPLIED/.test(out)) { console.error('PROVE_NO_RUN: testrun printed plans, no game launched'); process.exit(2); }
const lp = logPath();
if (!lp || !fs.existsSync(lp) || fs.statSync(lp).mtimeMs < started) { console.error('PROVE_STALE_LOG: game.log not written by this run ' + lp); process.exit(2); }
const log = fs.readFileSync(lp, 'latin1');
if (args.out && log) fs.writeFileSync(path.join(args.out, 'game.log'), log, 'latin1');
if (BATCH) {
  const r = batch.score(log, BATCH, BO);
  if (args.out) fs.writeFileSync(path.join(args.out, 'result.json'), JSON.stringify(r, null, 1));
  showBatch(r); process.exit(r.pass ? 0 : 1);
}
const r = score(log, args.control === 'fake');
const units = out.split('\n').filter(l => /u:\S+|^\s*#\d /.test(l)).slice(0, 12);
console.log('testrun status', x.status, (out.trim().split('\n').pop() || '').slice(0, 200));
for (const row of r.rows) console.log((row.seen ? 'yes ' : 'NO  ') + row.marker.padEnd(16) + row.what);
console.log(JSON.stringify({ sides: r.sides, killed: r.killed, immobilised: r.immobilised, inOrder: r.inOrder, exception: r.exception, controlDead: r.controlDead, notFound: r.notFound, cantSpawn: r.cantSpawn, units }));
console.log('VERDICT ' + (r.pass ? 'PASS' : 'FAIL'));
process.exit(r.pass ? 0 : 1);
