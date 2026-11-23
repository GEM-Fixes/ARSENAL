#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-3a067aaa)
// edrun: test units by class group in the editor build, single process, no multiplayer.
// SPEED-B3 options: --list run-list (several games, one modswitch + one options restore per list; multi.js), --insts 1,2,3 (one game per instance, free-commit gate
//   --commit-reserve MB default 1500, --stagger s default 12; never 0), --auto-rerun N (a void game reruns, the 2nd void of a layout splits it: control + 2-3 pairs a game),
//   --hold-faults (preflight HOLD: NOWEAPON, NOBONE, AMMO, MORTARRANGE from preflight.faultsIn; without it the HOLD line prints and the pair runs).
//   a pair past its class cap is given up (row.gaveUp) and no longer holds the game open; an MG/noBlast shooter turns dbg_health on, its unproven NOKILL reads fireUnmeasured.
//   node tools/edrun/edrun.js --game G --root <editor-build dir> --exe as64_ed.exe --pairs pairs.json [--mods as64+,x] [--secs 240] [--out dir]
//        [--speed very_fast|fast|normal] [--ratio 1..20] [--fog 0|1] [--pipe "cmd;cmd"] [--no-pipe] [--dry] [--inst n]
//        --exe: the game is taken from the exe name (game parity): as64_ed.exe (default) | mowas_2_ed.exe (MoW:AS2: mods default none, --dry only, no --pipe,
//          TST-19) | call_to_arms_ed.exe or goh refused (exit 2, in-play-nopipe.md:9); a games.js word (as64, mowas2) picks that game's editor exe;
//          any other *.exe name (a renamed build) runs as as64, as before; another word is a usage error
//        --map name: run on a vanilla multi map (e.g. 1v1_reloading_point) instead of the test map; pairs without x,y are put on flat clear ground, see mappick.js. default off
//        --ratio N: game speed N x by a mission {Quant {speed 1/N}} block, replaces --speed's game_speed action (which tops out near 3.3x); default off [T: spd-1]
//        --env id: the mission's {Environment "id"} (default multi/multi_01, the fixture's); e.g. goh/multi/1v1_ladoga/var1 for a map carried by mapport --carry
// pairs.json: [{name, class:"vehicle"|"gun"|"infantry", shooter, crew:[breed..], foe, foeCrew:[breed..],
//               count (infantry shooters, default 3), foeClass ("infantry" when foe has a /, else "vehicle"), dist, x, y, foeFire, noorder, orderTime,
//               mark ("chassis_work", "not inhabited", ...: the foe state the kill line waits for), never (true: pass only if mark never comes),
//               reorder (seconds N: the fire order is issued again every N game s, ~400 s of repeats), ammo (short tag "fg" of the type the shooter should use) + ammoBox (all box items of its def, e.g. ["ammo bullet76 ap","ammo bullet76 fg"]: the others are removed by an inventory remove action)}]
//               sx (shooter x offset: flank shot; with dist small, the shooter stands beside the foe), control (true: this pair is a game control, report games[].controls and void),
//               watch (true: mark "damaged" when any foe part breaks), once (true: one fire order, no KILLPROOF re-issue; ORDERRUN: fire went on past its 120 s anyway [V])}]
// report rows: shots (muzzle blast lines of the shooter, each a cannon round, needs --pipe "dbg_blast 1", null if not on, infantry, an id mismatch, foe damaged with no muzzle line, or a gun with no muzzle blast: noBlast then says why (muzzle_zenite, minimum, small, no prop, prop not read); counts rounds after the kill too; 0 is real only for muzzle_medium, large, maximum),
//   hits (foe blast events, a floor: AP with no filler logs none [I]), hitKinds, parts (foe bones broken per log, no cvar needed), damaged (from watch).
//   MGPROOF: --pipe "dbg_blast 1;dbg_health 1" adds HEALTH lines (a man's health loss): proof 'hp' for MG/rifle kills of men, row.hpBefore (foe losses order..kill), hpLethal.
//   the box is no round count: AI sides reload free, , box 82 stayed 82 over 20 shots.
// EDRUN-2 (sheet Q26, Q41, Q42, Q8): nearest measured distance by default (DIST below); "dist" still wins. Map units (20 per metre: 300 = 15 m), a tank is about 60 long and its muzzle reaches 127 from its centre (pz6bh.mdl): at 120 the barrel is at the foe and the gun limit (-7) can't reach it, so 0 shots.
//   COV-C06 task:"repair"|"tow"|"aiuse" [T all spellings]. repair: vehicle shooter, no foe; damage {component name|[names],state broken|destroyed} (default engine+fuel broken) set by actor_component,
//     repairer [human defs] (default 2 mp/rus/tankman) get action repair x5; rows damaged, repairOrder, repaired. tow: gun shooter, no foe; tower (truck def), towerCrew [defs], towBy action|linker,
//     towDy (map units, default 1000); rows linked, gunMoved, towed. aiuse: fire pair with no fire order (the bot side picks the target and fires; selfMan:true no board either); rows manned, aiFired (own muzzle BLAST)
//   free:true  shooter and crew keep move_mode free; default is {move_mode hold} on both sides of a fire pair, since free AI units drive at the foe under actor_fire
//   rear:true  shooter stands behind the foe, on the line opposite the foe's heading, same heading; face:N (degrees, default 0 = +x) sets the heading with {xform zl N} [T sign of zl]
//   ground:N   N game s after the attack order, if the foe is neither dead nor damaged, the shooter gets {actor_fire {attack position} {waypoint}} at a point 8 m beside the foe (mark "ground" in report: row.ground)
//   isolate:true  sx may pass 440 (the next pair's space); preflight then needs 300 m clear of every other placement
//   --fresh-cache: this stack's shader cache is moved aside (kept) so the game compiles shaders anew (a shader edit is otherwise not seen). --sound: no -nosound on the exe
//   --wp-offset: the ground waypoint gets {offset 20}; the installed as64_ed (2026.11.02) refuses it at mission load (REPROOF-4), so off by default
//   noRangeCheck:true  skip the range check of that pair, and the smallest-distance (TOOCLOSE) check too; noMinCheck:true skips only the latter
//   preflight before the game (--no-check off; --check reads weapon ranges in a --dry run too): range vs the shooter def's weapon {range aim max}, clear line vs other placements,
//   isolate clearance. A failed pair is held back, not run: report pairs[].verdict = status OUTOFRANGE | BLOCKED | CROWDED, pairs[].preflight = {status, dist, weapon, aim, max, notes, warns}.
//   unknown data (infantry weapon, def not in the index, no {range}) is a warning in preflight.warns, never a pass by silence.
// max 8 pairs per game (16 sides); more = one game after another, each under SECS_MAX. one instance per run, --inst n (default 1).
// EDRUN-16 --per-game N (1..16, default 8): over 8, slot 8+k reuses slot k's two sides in a far cell (CELLS2, TWIN_CELL); preflight SHARED holds it if any of the four units' weapon max range reaches the twin
//   (unknown range = warning); a pair with its twin in the game counts a kill only with its own muzzle line (no inflictor in the log). 8 or fewer pairs: mission text as before.
// default dists (see DIST): vehicle 300, gun 300, infantry 30 (tank 300 measured, g6 g7; gun 300 not yet [T]); before EDRUN-2 400, 400, 80 (rifles at 280 or less killed in 6 s, at 300 mixed, at 400 in 37 s,. foe holds fire unless foeFire.
// EDRUN-3 (all additive; a pair list without these keys runs as before):
//   foeClass "static" / static:true  foe is a building, prop or tree: written with no {Player} (it crashed the reader, COV-BLD), no foeCrew, no hold order. kill = state dead, or a part destroyed, or the tag gone;
//        mark "destroyed" asks for exactly that; row.destroyed = game s. foeRadius N (map units) makes it an obstacle on other pairs' lines (preflight). a house is an obstacle, not a roof to hit: the height check aims at the wall (infantry height) [I]
//   enter:true (static foe, needs foeCrew)  foeCrew get a board order onto the foe; mark "entered" when it reads {state inhabited} (slots or walkers); row.entered. mark "inhabited" also ends the pair on it. the board onto a building is [T]
//   prepare "cannon fire" | "cannon move" | "cannon trailing" | "weapon_prepare on|off" one actor_state on the shooter before the fire order; deploys a placed gun [T]
//   report rows: cannonShots (every 0.2/ muzzle line, r1 1.5, 2.0, 2.5 = muzzle_medium, large, maximum in muzzle.inc [V]), mgShots (always null: an MG logs no muzzle line; the old r1 2.0 split read pz6bh's 88 as MG, SILENT-1F), cannonVisible (foe blasts of charge >= 3), muzzleKinds {head:count}, noBlast, muzzle (the def's prop).
//   a NOORDER row gets noOrder {foeReady, shooterReady, falseTerm, foeCrewGone}: game s each term of the order row first read true, null never (markers p_<n>_fr, p_<n>_sr, p_<n>_fx)
//   VOL-5F: fire pairs hold fire on shooter and crew from the start; the order row opens both, the foe stays held. pair key settle:N waits N game s more before the order (the proof that the hold holds).
//   VOL-FX rows: killGameS (game s order to kill, every row, null = no kill), shots always a number (0 when none; shotsRead false = not measured, was null), held:true on preflight-held rows (TOOCLOSE, SHARED: not runs)
//   report rows: gameS (kill less order in game s by the "tick N" marks; on-tick and instant judge this, poll times only without it), fireProof (muzzle | hit | held | null). A rerun in the same --out renames the earlier report.json and game*.log with its run id.
//   --prep-map <mod dir> lays the test map in <mod dir>/resource/map/multi/edrun_test/ for place-entity (--map multi/edrun_test); --map-from <mod dir> then uses that mod's map file for the run (dry runs do not copy maps)
//   --map name also finds the map in a mod's resource/map/multi/<name>/ (loose or in the mod's own paks); mods default as64+ (MoW:AS2: none)
// EDRUN-FF (additive):
//   --free-fire (or pair key freeFire:true)  no fire order: the shooter holds fire till its order row, which only opens fire_mode; it picks its own target through
//        the set/target selectors (see freeFireOf). vehicle and gun pairs with no dist run at FREE_DIST 1000 units (210 gave 0 shots). report.freeFire, rows keep their verdicts
//   --kill-cap N | vehicle=N,gun=N,infantry=N | none  game-s cap past which a kill is not counted (KILL_CAP, default vehicle 90, gun 60, infantry 20; absent = as before).
//        --secs does not raise it: a long free-fire run needs --kill-cap too. report.killCap
//   after a taskkill or a crash the run looks for the exe still alive with "-instance N" on its command line (a crash leaves an "Exception" window) and kills it,
//        only that instance (reapOwn); log EDRUN_REAPED / EDRUN_REAP_FAILED, report games[].reaped
// CAM-1 (all additive; no --close and no pose = the mission as before):
//   --close a the view stands near pair a at game start, one man about 150 px, by a one-key {cameras {"startview" ..}}. A fixed view: no follow. With --close the game runs to --secs, so the 30 s picture loop has time.
//   --close-dist N  eye to focus, world units, default 190.
//   pair key pose: "crawl" | "squat" | "normal" {movement {type ..}} on the shooter in its own row, every 5 game s, 8 times (crawl = prone; at arm time it did nothing).
//   pair key talk: "loc/key" | [keys] {"talk" {selector shooter} {text key}} one key every 6 game s, 10 rounds: the localized text shows in the talks panel, no mouse (CHAIN-N4; cmd_talk)
// writes only: G/mods/edrun_test[n], that instance's options.set (restored after, snapshot options.set.edrun beside it), --out,
// and renames that instance's shader_cache per mod stack (shader_cache.owner names the live one).
// --dry: no game, mission to --out. exit 0 all pass, 1 not, 2 usage, 3 could not run.
// --help / -h: usage text, exit 0, before any argument is read: no game, no launcher, nothing written (T-HELP).
require('../lib/help')(__filename, [
  'ARSENAL edrun: test units in pairs (shooter vs foe) in the editor build. Launches the game unless --dry.',
  'usage: ARSENAL edrun --game <G> --root <editor build dir> --exe <exe> --pairs <pairs.json> [flags]',
  '  setup:  --game --root --exe --pairs --mods a,b --out <dir> --inst 1..7 (never 0) --run-id --worker',
  '  run:    --secs --no-scale-secs --load-secs --hold --speed very_fast|fast|normal --ratio 1..20 --fog 0|1 --sound --fresh-cache',
  '  map:    --map <name> --map-from <mod dir> --prep-map <mod dir> --env <id> --per-game 1..16',
  '  pipe:   --pipe "cmd;cmd" --no-pipe --view --early-idle --wp-offset',
  '  checks: --check --no-check --dry --rescore --write --kill-cap --free-fire --close <pair> --close-dist',
  '  lists:  --list <run-list> --insts 1,2,3 --auto-rerun N --hold-faults --commit-reserve MB --stagger s',
  'example: ARSENAL edrun --game "<game dir>" --root <editor dir> --exe as64_ed.exe --pairs pairs.json --dry --out out',
  'exit: 0 all pass, 1 not, 2 usage, 3 could not run. Pair keys and report rows: the header of tools/edrun/edrun.js.',
].join('\n'));
const fs =require('fs'), path = require('path'), cp = require('child_process'), net = require('net');
const userdir = require('../lib/userdir');
const platform = require('../lib/platform');
const games = require('../lib/games');
// game parity (2026-11-14): the game is taken from --exe (mindist.gameOfExe): as64*.exe -> as64 (as before), mowas_2*.exe -> mowas2, call_to_arms*.exe -> goh.
//   MoW:AS2 (mowas_2_ed.exe): mods default none (no as64+), the test mod's mod.info takes the 3.262 range (tools/newmod RANGE), the index reads the mowas_2 vfs view,
//     the start line is -game only: mowas_2*.exe has no -instance, -control, -console, -nosound (TST-19), so --pipe is refused and a run that is not --dry is
//     refused (it needs its own instance profile and log); --dry writes the missions and prints the start line. [T] first real run
//   GoH: refused at once (exit 2): call_to_arms_ed.exe -game never starts the mission
const { gameOfExe, vfsExeOf, GOH_WHY } = require('./mindist');
const ED_EXE = { as64: 'as64_ed.exe', mowas2: 'mowas_2_ed.exe' };   // the default editor exe per game
const MOWAS2_RUN = ['a run needs its own instance profile and game.log (-instance), and mowas_2_ed.exe has no -instance; --dry writes the missions and the start line', 'TST-19'];
const MOWAS2_PIPE = ['--pipe needs the control pipe, and mowas_2_ed.exe has no -control or -console', 'TST-19'];
// the editor start line. as64: -game <map>:combat -instance N [-nosound] [-control -console] (as before); MoW:AS2: -game <map>:combat only (TST-19)
function startArgs(game, mapId, inst, o = {}) {
  if (game === 'mowas2') return ['-game', `${mapId}:combat`];
  return ['-game', `${mapId}:combat`, '-instance', String(inst), ...(o.sound ? [] : ['-nosound']), ...(o.noPipe ? [] : ['-control', '-console'])];
}
// the test mod's mod.info. as64: MinGameVersion 3.301 (as before); MoW:AS2: the legacy 3.262 range of tools/newmod RANGE (a 3.301 minimum is refused by 3.262)
function modInfoOf(game, name) {
  if (game !== 'mowas2') return `{Mod\n {Name "${name}"}\n {MinGameVersion "3.301"}\n}\n`;
  const r = require('../newmod/newmod.js').RANGE.mowas2;
  return `{Mod\n {Name "${name}"}\n {MinGameVersion "${r.min}"}\n {MaxGameVersion "${r.max}"}\n}\n`;
}
// refuse what a game cannot do (exit 2, one line with its row); a = one job's args
function gateGame(a) {
  const g = gameOfExe(a.exe);
  if (!g) usage('--exe: not a game exe: ' + a.exe + ' (as64_ed.exe, mowas_2_ed.exe, or as64, mowas2)');
  if (g === 'goh') games.refuse('edrun', 'goh', ...GOH_WHY);
  if (g === 'mowas2' && a.pipe !== undefined) games.refuse('edrun', 'mowas2', ...MOWAS2_PIPE);
  return g;
}
// a command line that gateGame (or the MoW:AS2 non-dry check) will refuse: the --inst notice is left out, so a refusal prints its one line only
function refusedAtStart(argv) {
  const x = argv.indexOf('--exe'), g = gameOfExe(x < 0 ? undefined : argv[x + 1]);
  return g === 'goh' || (g === 'mowas2' && (argv.includes('--pipe') || !argv.includes('--dry')));
}

// --inst n: 1 to 7, never 0. each instance has its own test mod, so games can run side by side
// SPEED-B3: --insts a,b without --inst runs as the first listed (the parent of --insts runs no game itself); 0 is refused either way
const INST = (i => { const L = process.argv.indexOf('--insts'); if (i < 0 && L >= 0) { const v = +String(process.argv[L + 1] || '').split(',')[0]; if (!(v >= 1 && v <= 7)) { console.error('--insts lists instances 1..7 (never 0)'); process.exit(2); } return v; } if (i < 0 && !process.argv.includes('--help') && !refusedAtStart(process.argv)) console.error('edrun: --inst not given, using instance 1 (COV-MIX8: a session meant 3 and got 1); pass --inst n'); const v = i < 0 ? 1 : +process.argv[i + 1]; if (!(v >= 1 && v <= 7)) { console.error('--inst must be 1..7'); process.exit(2); } return v; })(process.argv.indexOf('--inst'));
const MOD = INST === 1 ? 'edrun_test' : 'edrun_test' + INST, MAP = 'multi/edrun_test', SECS_MAX = 285, MAX_PAIRS = 8, COUNT = 17;
const ORDER_TIME = 120;
// KILLPROOF: an actor_fire order lasts its {time} (rev-harness 5: cap none ran to ~450 game s on a 120 s order). With no pair reorder the order goes out again
// every orderTime game s while the tick marks run (TICKS), so one is always live. orderLifeOf = game s the pair's orders cover; a kill later is flagged orderExpired
// ORDERRUN pair key once:true = the old single order (no re-issue), to compare fire after its expiry
// FIX-EDRUN (harness-edrun:122, OBS-I3): {attack position} is one burst per order (MakeTargetOrder), so a static fire pair with no reorder of its own
// re-issues every STATIC_REORDER game s (the 4-6 s the row asks for). pair key reorder wins; once, ground and noorder keep the old single order [T]
const STATIC_REORDER = 5;
const reorderOf = p => p.reorder !== undefined ? p.reorder : (p.foe && !p.move && !p.noorder && !p.once && !p.ground && (p.static === true || p.foeClass === 'static')) ? STATIC_REORDER : undefined;
const orderRepeatsOf = p => (p.once || reorderOf(p) || p.noorder || p.move || !p.foe) ? 0 : Math.ceil(TICKS_SPAN / (p.orderTime || ORDER_TIME)) - 1;
const orderLifeOf = p => (p.noorder || p.move || !p.foe) ? null : reorderOf(p) ? Infinity : (p.orderTime || ORDER_TIME) * (1 + orderRepeatsOf(p));
// VOLHP: an infantry squad's first actor_fire (t=0, same tick as spawn) brought no fire; fire began only at the 120 s re-issue (MGPROOF inf2 3/3 [V]).
//  returns FAILED when the actor has no compass weapon yet [I]. So an infantry pair with the
// re-issue chain gets one extra re-issue EARLY_ORDER game s after the first (mark "reorder 0"); the later re-issues keep their times. pair key early:N (0 = off)
const EARLY_ORDER = 5;
// EDCTL: a control pair gets no early re-issue by default (early:N still sets one). The ctl rifle pair (30 units) kills at tick 2-7 from its t=0 order; in tank games
// (kill tick 3-7, later than in infantry games) the 5 s re-issue landed before the kill and the pair never fired again, re-issues at 120 s included: 6/6 VOID in dmgfix [V], cause in the engine [I]
const earlyOf = p => orderRepeatsOf(p) > 0 && !p.move ? (p.early !== undefined ? +p.early || 0 : p.class === 'infantry' && !p.control ? EARLY_ORDER : 0) : 0;
// FIX-EDRUN (harness-edrun:131, OBS-I1): every R11 infantry kill came 0.2-2.2 s after reorder 0, so the first order is lost; a second early re-issue at EARLY_ORDER2 game s
// (mark "reorder 0b") covers a first order that failed past 5 s. Only with the default early (no pair early, no earlyIf idle) [T]
const EARLY_ORDER2 = 15;
const early2Of = p => (p.early === undefined && earlyOf(p) === EARLY_ORDER && !earlyIdleOf(p) && EARLY_ORDER2 < (p.orderTime || ORDER_TIME)) ? EARLY_ORDER2 : 0;
// FIX-EDRUN: an infantry fire pair's men face the foe (+y): {xform zl INF_FACE} [T: sign of zl, as the rear pairs]
const INF_FACE = 90;
// REVHARNESS (edctl owed): the unconditional early re-issue may stall a pair that was already firing (the EDCTL control case). pair key earlyIf:"idle" or --early-idle
// (every pair) sends it only when no live shooter man runs an attack order at that time, i.e. the first order failed or ended [T]. Off by default: the old chain stays
const EARLY_IDLE = process.argv.includes('--early-idle');
const earlyIdleOf = p => p.earlyIf === 'idle' || (EARLY_IDLE && p.earlyIf === undefined);
const R = path.join(__dirname, '../..');
// base map: prove's pv_tiny when present (prove --tiny writes it; gitignored). Else the same map is generated (testmap + the "900"/"901"
// waypoints block prove adds) into the temp dir, so a fresh clone or release copy needs no untracked fixture. EDRUN_BASE=gen forces it
const PROVE_FIX = path.join(__dirname, '../testrun/scenarios/mods/prove1/resource/map/multi/pv_tiny');
const FIX = process.env.EDRUN_BASE !== 'gen' && fs.existsSync(path.join(PROVE_FIX, 'combat.mi')) ? PROVE_FIX : genFix();
function genFix() {
  const m = require('../testmap/testmap.js').build(), d = path.join(require('os').tmpdir(), 'edrun-base', 'pv_tiny');
  const wp = ['{waypoints "player"', '\t\t\t{"900" {position 0.00 -320.00 0} {radius 20}}', '\t\t\t{"901" {position 0.00 -200.00 0} {radius 20}}', '\t\t}', '\t\t{triggers', '\t\t\t{"pv_route" {condition} {actions {"con" {text "PROVE route"}}}}'].join('\r\n');   // one trigger: buildMission's {triggers regex needs a non-empty block
  m.files['combat.mi'] = Buffer.from(m.files['combat.mi'].toString('latin1').replace('{triggers', wp), 'latin1');
  fs.mkdirSync(d, { recursive: true });
  for (const [n, b] of Object.entries(m.files)) { const p = path.join(d, n); let old = null; try { old = fs.readFileSync(p); } catch { /* new */ } if (!old || !old.equals(b)) fs.writeFileSync(p, b); }
  return d;
}
const WP0 = 920;   // goal waypoints "920".. one per pair, added beside the base map's "900"/"901"
const SPEEDS =['very_slow', 'slow', 'normal', 'fast', 'very_fast'];
const sleep = ms => new Promise(r => setTimeout(r, ms)), crlf = s => s.replace(/\r?\n/g, '\r\n');

// each pair's own space. pather clip of the base map is +-1800, map_points stand at y=+-700 x=0..200
const CELLS = [[-450, -900], [450, -900], [-450, 900], [450, 900], [-1350, -900], [1350, -900], [-1350, 900], [1350, 900]];
// EDRUN-16 --per-game 9..16: slot 8+k shares the two sides of slot k (PLAYER_COUNT 18) and stands in a cell of CELLS2
// columns between CELLS' columns (450 units off any old firing line), rows y=0 and +-1350 (dist 600 still inside +-1700).
// TWIN_CELL[k] = the CELLS2 index for the twin of CELLS[k]: the assignment with the largest smallest cell-to-cell distance (all 8! tried once)
const PER_GAME_MAX = 16;
const CELLS2 = [[-900, 0], [900, 0], [-900, -1350], [0, -1350], [900, -1350], [-900, 1350], [0, 1350], [900, 1350]];
const TWIN_CELL = (() => {
  const d = (k, c) => Math.hypot(CELLS[k][0] - CELLS2[c][0], CELLS[k][1] - CELLS2[c][1]);
  let best = null, bMin = -1, bSum = -1;
  const go = (k, used, cur) => {
    if (k === 8) { const ds = cur.map((c, i) => d(i, c)), mn = Math.min(...ds), sm = ds.reduce((a, b) => a + b, 0); if (mn > bMin + 1e-9 || (Math.abs(mn - bMin) < 1e-9 && sm > bSum + 1e-9)) { best = cur.slice(); bMin = mn; bSum = sm; } return; }
    for (let c = 0; c < 8; c++) if (!(used & (1 << c))) { cur.push(c); go(k + 1, used | (1 << c), cur); cur.pop(); }
  };
  go(0, 0, []);
  return best;
})();
const cellOf = i => (i < MAX_PAIRS ? CELLS[i] : CELLS2[TWIN_CELL[i - MAX_PAIRS]]);
// slot j's side twin in a game of n pairs: j-8, or j+8 when that slot is filled; null in a game of 8 or fewer
const twinIdx = (j, n) => (j >= MAX_PAIRS ? j - MAX_PAIRS : j + MAX_PAIRS < n ? j + MAX_PAIRS : null);
// EDRUN-2 point blank (user's rule, sheet Q41/Q42: closer ranges, range sets time to kill by accuracy and damage falloff). an explicit pair "dist" wins.
//   infantry 30: 5 rifles at 30 m killed in 1.3-1.6 s on every stack, 3 at 80 m was marginal (b5-edrun); grenades passed at 25 and 50 [V reports]
//   gun 100: 60 mm mortar PASS at 80 (8.2 s) and 150 (3.4 s), 120 mm and 15 cm PASS at 100-150 (b8-gun, m3rr-g, b8-f). no min-range key is read by the engine's aimers [I, grep of game/entity]
//   vehicle 120: no tank run below 150 m ever passed (t34_0 vs gaz NOKILL at 150 and 200, PASS at 400-600, ctrl-1); 120 is the closest tried, a tank may not depress or arm that close [T]
const DIST = { vehicle: 300, gun: 300, infantry: 30 };
// the old defaults: kept for pairs with a move order and for no-foe pairs, so their goal markers stay where they were
const DIST_OLD = { vehicle: 400, gun: 400, infantry: 80 };
const distOf = p => p.dist || ((p.move || !p.foe) ? DIST_OLD : DIST)[p.class];
// EDRUN-FF free fire: no actor_fire order, the order row only opens fire_mode, so the unit picks its own target ( -> GatherEnemies, SortSightings by the
// set/target selectors -> ControlWeapons). actor_fire {attack enemies} goes order attack by selector instead
// which aims at a random candidate and skips GatherEnemies, so set/target is never read under an order. Why noorder gave 0 shots: distance, not fire mode. probe1 (inst 1):
// pz6e vs t34_0 noorder at 210 units (auto dist) 0 shots in 120 s, same at 1000 units 2 shots [V]; under 210 the barrel is near the foe and the aim finds no solution [I].
// So a free-fire vehicle or gun pair with no dist runs at FREE_DIST; infantry keeps its dist (rifles at 227 killed, noorder). -> pair, or the pair unchanged when it cannot free-fire (move, no foe)
const FREE_DIST = { vehicle: 1000, gun: 1000 };
// VOL-FX: --free-fire (all=true) frees every fire pair but the controls; a pair's own freeFire:true (control too) always frees it
const freeFireAll = (pairs, all) => pairs.map(p => ((all && !(p && p.control)) || (p && p.freeFire)) ? freeFireOf(p) : p);
const freeFireOf = p => (!p.foe || p.move) ? p : { ...p, noorder: true, freeFire: true, ...(p.dist || !FREE_DIST[p.class] ? {} : { dist: FREE_DIST[p.class] }) };
const D2R = Math.PI / 180;
const ISOLATE_CLEAR_TXT = '300 map units (15 m)';   // preflight.ISOLATE_CLEAR_U
const WPG = 940;   // ground-order waypoints "940".. one per pair with "ground"
const WPS = 960;   // MB-R8: static foe aim waypoints "960".. one per static fire pair
const GROUND_OFF = 8;   // world units (20 per m, not m) beside the foe (+x) for the ground order's point
// REPROOF-4: the installed as64_ed 3.301.1x64 (2026.11.02) rejects {offset} at combat.mi ('unexpected token (62)'), src reads it:
// so {offset} is written only with --wp-offset (a newer build) [I]
const GROUND_UP = 20;   // world units above the waypoint (its "offset", ; AttackPosition z = offset + position.z): about 1 m up the foe's side
// FIX-EDRUN (harness-edrun:122): the static aim point sat at the foe centre, inside its volume, so ClassifyAim read blocked (state 5)
// weapon fire held. It now stands on the near face: the foe position moved (foeRadius + STATIC_FACE_GAP) toward the shooter, at half the wall height (STATIC_WALL_H, a guess
// for a shed or house [I]; pair aimZ wins). preflight's static TOOCLOSE uses the same point (staticAimOf) [T: shots per 10 s]
const HOUSE_R = 60, STATIC_FACE_GAP = 5, STATIC_WALL_H = 120;
function staticAimOf(p, L) {
  const r = p.foeRadius !== undefined ? p.foeRadius : HOUSE_R, dx = L.s.x - L.f.x, dy = L.s.y - L.f.y, len = Math.hypot(dx, dy) || 1;
  const off = Math.min(r + STATIC_FACE_GAP, len);
  return { x: L.f.x + dx / len * off, y: L.f.y + dy / len * off, z: p.aimZ !== undefined ? p.aimZ : STATIC_WALL_H / 2, off };
}

function validate(pairs, bigMap, per = MAX_PAIRS) {   // bigMap (--map): the +-1700 test map limits do not apply. per: pairs per game (--per-game)
  const errs = [], seen = new Set();
  if (!Array.isArray(pairs) || !pairs.length) return ['pairs: need a non-empty list'];
  for (const [i, p] of pairs.entries()) {
    const at = `pair ${i} (${p && p.name})`;
    if (!p || !/^[a-z0-9_]+$/.test(p.name || '')) { errs.push(`${at}: name must be a-z 0-9 _`); continue; }
    if (seen.has(p.name)) errs.push(`${at}: name repeated`);
    seen.add(p.name);
    if (!DIST[p.class]) errs.push(`${at}: class must be vehicle, gun or infantry`);
    // a pair with a move order needs no foe (move-only pair); its only mark is "moved"
    const te = taskErr(p); if (te) errs.push(`${at}: ${te}`);
    if (!p.shooter || (!p.foe && !p.move && !TASK_NOFOE.includes(p.task))) errs.push(`${at}: needs shooter and foe` + (p.foe ? '' : ' (or a move)'));
    if (p.class !== 'infantry' && p.task !== 'tow' && !(p.crew && p.crew.length)) errs.push(`${at}: ${p.class} needs crew, an empty one reads "not moveable"`);
    if (p.foeClass && !DIST[p.foeClass] && p.foeClass !== 'static') errs.push(`${at}: foeClass must be vehicle, gun, infantry or static`);
    if (p.static !== undefined && typeof p.static !== 'boolean') errs.push(`${at}: static must be true or false`);
    for (const e of staticErr(p)) errs.push(`${at}: ${e}`);
    if (p.foe && foeClass(p) !== 'infantry' && foeClass(p) !== 'static' && !(p.foeCrew && p.foeCrew.length)) errs.push(`${at}: foe ${p.foe} needs foeCrew, an empty one is a false kill`);
    if (p.move !== undefined) { const me = moveErr(p); if (me) errs.push(`${at}: ${me}`); }
    if (!p.foe && p.mark !== undefined && p.mark !== 'moved') errs.push(`${at}: a pair with no foe can only wait for mark "moved"`);
    const me = markErr(p); if (me) errs.push(`${at}: ${me}`);
    const ae = ammoErr(p); if (ae) errs.push(`${at}: ${ae}`);
    for (const k of ['x', 'y']) if (!bigMap && p[k] !== undefined && !(Math.abs(p[k]) <= 1700)) errs.push(`${at}: ${k} outside the map's +-1700`);
    const we = watchErr(p); if (we) errs.push(`${at}: ${we}`);
    if (p.talk !== undefined && !([].concat(p.talk).length && [].concat(p.talk).every(k => typeof k === 'string' && /^[\w$\/.-]+$/.test(k)))) errs.push(`${at}: talk is a localization key or a list of keys (letters, digits, _ . - / $)`);
    if (p.pose !== undefined && (!POSES.includes(p.pose) || p.class !== 'infantry')) errs.push(`${at}: pose is for infantry shooters, one of: ${POSES.join(', ')}`);
    if (p.sx !== undefined) {
      const cx = p.x !== undefined ? p.x : per > MAX_PAIRS ? cellOf(i % per)[0] : (CELLS[i] || [0])[0];
      if (!Number.isFinite(p.sx)) errs.push(`${at}: sx must be a number`);
      else if (p.move || p.mark === 'moved') errs.push(`${at}: sx is for fire pairs, not a move`);
      else if (!p.foe) errs.push(`${at}: sx needs a foe`);
      else if (!bigMap && Math.abs(cx + p.sx) > 1700) errs.push(`${at}: sx puts the shooter outside the map's +-1700`);
      else if (Math.abs(p.sx) > 440 && p.isolate !== true) errs.push(`${at}: sx over 440 reaches the next pair's space (set "isolate": true for a shooter far from everything: preflight then needs ${ISOLATE_CLEAR_TXT} clear)`);
    }
    // EDRUN-2 fields
    for (const k of ['rear', 'isolate', 'free']) if (p[k] !== undefined && typeof p[k] !== 'boolean') errs.push(`${at}: ${k} must be true or false`);
    if (p.face !== undefined && !Number.isFinite(p.face)) errs.push(`${at}: face must be a number of degrees`);
    if (p.rear && (!p.foe || p.move || p.mark === 'moved')) errs.push(`${at}: rear needs a foe and is for fire pairs, not a move`);
    if (p.face !== undefined && !p.rear) errs.push(`${at}: face (the foe's heading) is for rear pairs`);
    if (p.isolate && !p.foe) errs.push(`${at}: isolate needs a foe`);
    if (p.early !== undefined && !(Number.isFinite(p.early) && p.early >= 0 && p.early < (p.orderTime || ORDER_TIME))) errs.push(`${at}: early is game s, 0 (off) up to orderTime`);
    if (p.earlyIf !== undefined && p.earlyIf !== 'idle') errs.push(`${at}: earlyIf is "idle" (re-issue only when no live shooter man runs an attack order)`);
    if (p.settle !== undefined && !(Number.isFinite(p.settle) && p.settle >= 1 && p.foe && !p.move)) errs.push(`${at}: settle is game s, 1 or more, on a fire pair`);
    if (p.ground !== undefined) {
      if (!(Number.isFinite(p.ground) && p.ground >= 1)) errs.push(`${at}: ground must be a number of seconds, 1 or more`);
      else if (!p.foe || p.noorder || p.move) errs.push(`${at}: ground needs a foe and a fire order (no noorder, no move)`);
      else if (p.reorder !== undefined) errs.push(`${at}: ground and reorder both re-order the shooter; use one`);
    }
    if (p.foe && !bigMap && !p.move && Number.isFinite(p.sx || 0) && Number.isFinite(p.face || 0)) {
      const L = layout(p, i % per);   // pairs past per run in a later game, in slot i % per
      for (const [who, q] of [['shooter', L.s], ['foe', L.f]]) if (!(Math.abs(q.x) <= 1700 && Math.abs(q.y) <= 1700)) { errs.push(`${at}: the ${who} would stand at ${q.x.toFixed(0)},${q.y.toFixed(0)}, outside the map's +-1700`); break; }
    }
  }
  return errs;
}
const POSES = ['crawl', 'squat', 'normal'];   // actor movement type names
// COV-C06 task pairs (crew, repair, tow, AI use of a unit). No harness order fires the shooter; marks name each step, "kill" = the task done (verdict PASS).
//  repair: a vehicle shooter (crew boarded) gets a part set by {"actor_component" {component C} {state broken|destroyed}} (a wrong name logs
//    'Component "C" not found in M'), then men tagged _r (repairer list, not boarded) get {"action" {action "repair"} {target}} ( e_repair: every soldier has the
//    repair able) every TASK_EVERY s. marks: damaged (a broken/destroyed part read), repairorder, repaired = no broken part left after damaged (= kill) [T: part spelling, repair reach]
//  tow: a gun shooter (crew optional, default none) and a truck "tower" with towerCrew; the truck gets {"action" {action "attach"} {target gun}} (e_attach -> attach, MOV-31: hooks
//    within 12 m of link bones, tags tractor/trailer), or towBy "linker": {"linker" {action link} {entities gun} {place {type trailer}}} (cmd_linker, s_linkerTypeNames). marks:
//    linked (gun {state linked}), then the truck drives towDy units (+y) to a goal marker; gunmoved (gun left its start marker), towed = gun near the goal (= kill) [T: field spellings]
//  aiuse: a fire pair with no fire order: the crew is boarded (selfMan:true: not boarded, stands beside it; shooterready = the AI manned it), a muzzle BLAST
//    line on the shooter says it fired on its own (fireProof muzzle). A plain fire pair, so foe, foeCrew and the kill rules are the usual ones
const TASKS = ['repair', 'tow', 'aiuse'], TASK_NOFOE = ['repair', 'tow'], TASK_EVERY = 20, TASK_TIMES = 5, TOW_DY = 1000, TOW_BACK = 300, WPT = 980;
const PART_STATES = ['broken', 'destroyed'];
function taskErr(p) {
  if (p.task === undefined) {
    for (const k of ['repairer', 'damage', 'tower', 'towerCrew', 'towBy', 'towDy']) if (p[k] !== undefined) return `${k} needs task "${k === 'repairer' || k === 'damage' ? 'repair' : 'tow'}"`;
    return null;
  }
  if (!TASKS.includes(p.task)) return `task must be one of: ${TASKS.join(', ')}`;
  if (TASK_NOFOE.includes(p.task) && (p.foe || p.move || p.mark !== undefined)) return `task ${p.task} takes no foe, move or mark (its marks are its own)`;
  const hums = v => Array.isArray(v) && v.length && v.every(b => typeof b === 'string' && b);
  if (p.task === 'repair') {
    if (p.class !== 'vehicle') return 'task repair is for a vehicle shooter';
    if (p.repairer !== undefined && !hums(p.repairer)) return 'repairer is a list of human defs';
    const d = p.damage;
    if (d !== undefined && !(d && typeof d === 'object' && [].concat(d.component).length > 0 && [].concat(d.component).every(c => typeof c === 'string' && /^[\w.-]+$/.test(c)) && (d.state === undefined || PART_STATES.includes(d.state)))) return `damage is {component "name" or [names, each tried: a missing one only logs], state ${PART_STATES.join('|')}}`;
  }
  if (p.task === 'tow') {
    if (p.class !== 'gun') return 'task tow is for a gun shooter';
    if (typeof p.tower !== 'string' || !p.tower) return 'task tow needs tower (the truck def)';
    if (!hums(p.towerCrew)) return 'task tow needs towerCrew (human defs for the truck)';
    if (p.crew !== undefined && !Array.isArray(p.crew)) return 'crew is a list';
    if (p.towBy !== undefined && !['action', 'linker'].includes(p.towBy)) return 'towBy is "action" or "linker"';
    if (p.towDy !== undefined && !(Number.isFinite(p.towDy) && p.towDy >= 200)) return 'towDy is map units, 200 or more';
  }
  if (p.task === 'aiuse') {
    if (!p.foe || p.move) return 'task aiuse needs a foe and no move';
    if (p.class === 'infantry') return 'task aiuse is for a gun or vehicle shooter';
  }
  if (p.selfMan !== undefined && (p.task !== 'aiuse' || typeof p.selfMan !== 'boolean')) return 'selfMan (true|false) is for task aiuse';
  return null;
}
const repairersOf = p => p.repairer || ['mp/rus/tankman', 'mp/rus/tankman'];
// default parts: engine [I usual name] and fuel (read broken in past edrun runs, with gun, wheell, wheelr, body); a name the model lacks only logs 'Component ... not found'
const damageOf = p => { const d = { component: ['engine', 'fuel'], state: 'broken', ...(p.damage || {}) }; return { ...d, component: [].concat(d.component) }; };
const towGoal = (p, i) => { const s = spot(p, i); return { x: s.x, y: s.sy + (p.towDy || TOW_DY) }; };
// the trigger rows of a repair or tow pair (aiuse runs the fire pair rows). M: mark action, cnt: count term
function taskRows(p, pi, M, cnt) {
  const n = p.name, rows = [], parts = k => `{ignore_captured_by_user 0} {source advanced} {group {select {tag {tag "${n}_s"}}} {include {${k} {masks "*"}}}}`;
  if (p.task === 'repair') {
    const d = damageOf(p), ready = `{"1.entities" ${cnt(`{tag ${n}_s} {state operatable}`, '>', 0)}}`;
    rows.push(`{"p_${n}_arm" {condition} {actions ${M(n + ' arm')} {"board" {selector {tag ${n}_c}} {vehicle {tag ${n}_s}}} {"actor_state" {selector {tag ${n}_s}} {fire_mode hold} {move_mode hold}}}}`);
    rows.push(`{"p_${n}" {condition {terms ${ready}}} {actions ${M(n + ' order')} {"delay" {time 2}} ${d.component.map(c => `{"actor_component" {selector {tag ${n}_s}} {component "${c}"} {state ${d.state}}}`).join(' ')} ${M(n + ' damageset')}}}`);
    rows.push(`{"p_${n}_sr" {condition {terms ${ready}}} {actions ${M(n + ' shooterready')}}}`);
    rows.push(`{"p_${n}_d" {condition {expression "1 | 2"} {terms {"1.entities" ${cnt(parts('broken_components'), '>', 0)}} {"2.entities" ${cnt(parts('destroyed_components'), '>', 0)}}}} {actions ${M(n + ' damaged')}}}`);
    const rep = `{"action" {selector {tag ${n}_r}} {action "repair"} {target {tag ${n}_s}}}`;
    rows.push(`{"p_${n}_ro" {condition {terms {"1.trigger" {name "p_${n}_d"}}}} {actions ${Array.from({ length: TASK_TIMES }, (_, k) => (k ? `{"delay" {time ${TASK_EVERY}}} ` : '') + M(`${n} repairorder ${k}`) + ' ' + rep).join(' ')}}}`);
    rows.push(`{"p_${n}_k" {condition {expression "1 & 2 & 3 & !4 & !5"} {terms {"1.trigger" {name "p_${n}"}} {"2.trigger" {name "p_${n}_d"}} {"3.entities" ${cnt(`{tag ${n}_s} {state "not dead"}`, '>', 0)}} {"4.entities" ${cnt(parts('broken_components'), '>', 0)}} {"5.entities" ${cnt(parts('destroyed_components'), '>', 0)}}}} {actions ${M(n + ' repaired')} ${M(n + ' kill')}}}`);
  } else {
    const ready = `{"1.entities" ${cnt(`{tag ${n}_t} {state operatable}`, '>', 0)}}`, crew = p.crew && p.crew.length;
    const hook = p.towBy === 'linker' ? `{"linker" {selector {tag ${n}_t}} {action link} {entities {tag ${n}_s}} {place {type trailer}}}` : `{"action" {selector {tag ${n}_t}} {action "attach"} {target {tag ${n}_s}}}`;
    rows.push(`{"p_${n}_arm" {condition} {actions ${M(n + ' arm')} {"board" {selector {tag ${n}_tc}} {vehicle {tag ${n}_t}}} ${crew ? `{"board" {selector {tag ${n}_c}} {vehicle {tag ${n}_s}}} ` : ''}{"actor_state" {selector {tag ${n}_t}} {fire_mode hold}} {"actor_state" {selector {tag ${n}_s}} {fire_mode hold}}}}`);
    rows.push(`{"p_${n}" {condition {terms ${ready}}} {actions ${M(n + ' order')} ${Array.from({ length: TASK_TIMES }, (_, k) => (k ? `{"delay" {time ${TASK_EVERY}}} ` : '') + M(`${n} attachorder ${k}`) + ' ' + hook).join(' ')}}}`);
    rows.push(`{"p_${n}_sr" {condition {terms ${ready}}} {actions ${M(n + ' shooterready')}}}`);
    rows.push(`{"p_${n}_l" {condition {expression "1 & 2"} {terms {"1.trigger" {name "p_${n}"}} {"2.entities" ${cnt(`{tag ${n}_s} {state linked}`, '>', 0)}}}} {actions ${M(n + ' linked')} {"delay" {time 2}} {"actor_to_waypoint" {selector {tag ${n}_t}} {drop orders} {waypoint "${WPT + pi}"}} ${M(n + ' toworder')}}}`);
    const live = `{tag ${n}_s} {state "not dead"}`;
    rows.push(`{"p_${n}_mv" {condition {expression "1 & 2 & !3"} {terms {"1.trigger" {name "p_${n}_l"}} {"2.entities" ${cnt(live, '>', 0)}} {"3.near" {units ${live}} {near_to {tag ${n}_m}} {distance ${NEAR_M}}}}} {actions ${M(n + ' gunmoved')}}}`);
    rows.push(`{"p_${n}_k" {condition {expression "1 & 2"} {terms {"1.trigger" {name "p_${n}_l"}} {"2.near" {units ${live}} {near_to {tag ${n}_a}} {distance ${ARRIVE_M.vehicle}}}}} {actions ${M(n + ' towed')} ${M(n + ' kill')}}}`);
  }
  rows.push(`{"p_${n}_x" {condition {terms {"1.entities" ${cnt(`{tag ${n}_s} {state dead}`, '>', 0)}}}} {actions ${M(n + ' shooterdied')}}}`);
  rows.push(`{"p_${n}_g" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{tag ${n}_s} {state "not dead"}`, '=', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions ${M(n + ' gone')}}}`);
  return rows;
}
// EDRUN-3 fields: static foe (destroyed mark, enter probe, foeRadius), prepare
const STATIC_FIRE = ['both', 'order', 'weapon', 'default'];
const PREPARE = ['cannon fire', 'cannon move', 'cannon trailing', 'weapon_prepare on', 'weapon_prepare off'];
function staticErr(p) {
  const e = [];
  if (p.prepare !== undefined && !PREPARE.includes(p.prepare)) e.push(`prepare must be one of: ${PREPARE.join(', ')}`);
  if (p.prepare !== undefined && (p.class === 'infantry' || p.move)) e.push('prepare is for vehicle and gun shooters with a fire order');
  if (p.enter !== undefined && typeof p.enter !== 'boolean') e.push('enter must be true or false');
  if (p.foeRadius !== undefined && !(Number.isFinite(p.foeRadius) && p.foeRadius >= 0)) e.push('foeRadius must be a number of map units, 0 or more');
  if ((p.enter || p.foeRadius !== undefined) && !isStatic(p)) e.push('enter and foeRadius are for a static foe (static:true or foeClass "static")');
  if (p.enter && !(p.foeCrew && p.foeCrew.length)) e.push('enter needs foeCrew: the men who are ordered into the building');
  if (isStatic(p) && p.foeCrew && p.foeCrew.length && !p.enter) e.push('foeCrew on a static foe is only for enter:true');
  // MB-R8 static fire knobs: aimZ (map units above the flat test map, default STATIC_WALL_H/2 since FIX-EDRUN), staticFire both|order|weapon|default (which actor_fire form goes out)
  if (p.foeActor !== undefined && (typeof p.foeActor !== 'boolean' || !isStatic(p))) e.push('foeActor is true or false, for a static foe (an animal or other actor: no fallen probe)');
  if (p.aimZ !== undefined && !(Number.isFinite(p.aimZ) && p.aimZ >= 0)) e.push('aimZ must be a number of map units, 0 or more');
  if (p.staticFire !== undefined && !STATIC_FIRE.includes(p.staticFire)) e.push(`staticFire must be one of: ${STATIC_FIRE.join(', ')}`);
  if ((p.aimZ !== undefined || p.staticFire !== undefined) && (!isStatic(p) || p.move)) e.push('aimZ and staticFire are for a static foe fire pair (no move)');
  return e;
}
function watchErr(p) {
  if (p.watch !== undefined && typeof p.watch !== 'boolean') return 'watch must be true or false';
  if (p.watch && !p.foe) return 'watch needs a foe';
  if (p.control !== undefined && typeof p.control !== 'boolean') return 'control must be true or false';
  return null;
}
// reorder / ammo (AMMO-1). ammo has no direct mission switch [I]: the box keeps only the wanted type, a loaded round of another type stays (inventory remove skips holders)
function ammoErr(p) {
  if (p.reorder !== undefined && !(Number.isFinite(p.reorder) && p.reorder >= 1)) return 'reorder must be a number of seconds, 1 or more';
  if (p.reorder !== undefined && (p.noorder || p.move || !p.foe)) return 'reorder needs a foe and an order (no noorder, no move)';
  if (p.ammo === undefined && p.ammoBox === undefined) return null;
  if (typeof p.ammo !== 'string' || !/^[a-z0-9_]+$/.test(p.ammo)) return 'ammo must be a short tag like "fg"';
  if (!Array.isArray(p.ammoBox) || !p.ammoBox.length || p.ammoBox.some(x => typeof x !== 'string' || !/^[a-z0-9_ ]+$/.test(x))) return "ammo needs ammoBox, the list of the shooter def's box items";
  if (p.class === 'infantry') return 'ammo is for vehicle and gun shooters';
  if (!p.ammoBox.some(x => x.split(' ').pop() === p.ammo)) return 'ammoBox has no item of type ' + p.ammo;
  return null;
}
const TICKS = 700, TICKS_SPAN = TICKS;   // game seconds the tick marks run: --secs 220 at 3.15x
const REORDER_SPAN = 400, REORDER_MAX = 100;   // game seconds of repeats, repeats cap
const dropOthers = (p, n) => p.ammo === undefined ? '' : p.ammoBox.filter(x => x.split(' ').pop() !== p.ammo).map(x => `{"inventory" {selector {tag ${n}_s}} {action remove} {item "${x}"} {amount 9999}} `).join('');
// EDRUN-3: "static" = building, prop, tree (foeClass "static" or static:true). A static def rejects {Player} ( unexpected token, COV-BLD r1-r3), so it is written without one [V crash, I cause]
function foeClass(p) { return p.static === true ? 'static' : p.foeClass || (String(p.foe).includes('/') ? 'infantry' : 'vehicle'); }
const isStatic = p => !!p.foe && foeClass(p) === 'static';

// the foe's "alive and ready" and "killed" states. moveable = chassis CanTakeCrew, ; unknown on humans and guns [T], so only vehicles use it
function foeStates(p) {
  const c = foeClass(p);
  let s;
  if (c === 'infantry') s = { ready: 'operatable', kill: 'dead' };
  else if (c === 'gun') s = { ready: 'operatable', kill: '"not inhabited"' }; // no destroyed part on a gun in 120 s, [I]
  else if (c === 'static') s = { ready: null, kill: 'dead', static: true };   // no state gates a static: "ready" = the tag exists; kill = see staticKill()
  else s = { ready: 'moveable', kill: '"not moveable"' };
  // default kill on a vehicle foe: red hull (user's kill rule, hull-2). a static with no mark gets the destroyed set (staticKill), mark "destroyed" asks for it by name
  const mark = c === 'static' ? (p.mark && p.mark !== 'destroyed' ? p.mark : '') : p.mark || (c === 'infantry' || c === 'gun' ? '' : 'destroyed_components:body');
  // optional pair.mark: the state the "kill" line waits for, "x" or "not x"; pair.never: pass only if that mark never comes
  if (mark) s.kill = /\s/.test(mark) ? `"${mark}"` : mark;
  // mark "destroyed_components" / "broken_components" (":mask" after it, default "*"): a part-name filter term instead of a {state}
  const cm = /^(destroyed_components|broken_components)(?::(.+))?$/.exec(mark);
  s.term = cm ? `{${cm[1]} {masks "${cm[2] || '*'}"}}` : `{state ${s.kill}}`;
  // component terms exist only on the advanced selector; a standard one drops them with no log line and just counts the tag (hull-1 report)
  s.killSel = n => cm ? `{ignore_captured_by_user 0} {source advanced} {group {select {tag {tag "${n}_f"}}} {include ${s.term}}}` : `{tag ${n}_f} ${s.term}`;
  return s;
}
const STATES = ['dead', 'operatable', 'moveable', 'chassis_work', 'inhabited', 'inactive', 'linked', 'user_control', 'fallen', 'examined', 'discovered', 'in_squad', 'commander'];
// move: {x,y} a map point, or {dx,dy} an offset from the shooter's start (+y runs toward the foe). the order is actor_to_waypoint on the shooter entity,
// never its crew (lim MIS-52: a boarded man is refused). "moved" = the shooter has left its start marker; "arrived" = it is near the goal marker
const MARKER = 'mp/rus/rifle', NEAR_M = 8;  // metres, the near term's unit (x20 = units, minus both lod scales) [T] for big hulls
// TEST-2: "move": true or {} = the default goal, MOVE_DY units along +y (200 units, 10 m, was too short to mean anything and a long truck never left its marker). An explicit goal is kept as given.
// arrived radius: vehicles 20 m (a long hull stops short of a point goal), men 8 m; a pair's arriveM overrides
const MOVE_DY = 1000, ARRIVE_M = { vehicle: 20, gun: 20, infantry: NEAR_M };
const moveOf = p => (p.move === true || (p.move && typeof p.move === 'object' && !Array.isArray(p.move) && !Object.keys(p.move).length) ? { dy: MOVE_DY } : p.move);
// existing pair lists keep their 8 m (edrun3-test pins the old mission text): the wider radius is for "long": true pairs and the default-goal form
const defaultGoal = p => moveOf(p) !== p.move;
const arriveOf = p => (Number.isFinite(p.arriveM) && p.arriveM > 0 ? p.arriveM : (p.long === true || defaultGoal(p)) && p.class !== 'infantry' ? ARRIVE_M[p.class] || NEAR_M : NEAR_M);
function moveErr(p) {
  const m = moveOf(p);
  if (p.arriveM !== undefined && !(Number.isFinite(p.arriveM) && p.arriveM > 0)) return 'arriveM must be a positive number of metres';
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'move must be {x,y}, {dx,dy}, {} or true';
  const abs = m.x !== undefined || m.y !== undefined, rel = m.dx !== undefined || m.dy !== undefined;
  if (abs === rel) return 'move must be {x,y} or {dx,dy}, not both and not neither';
  for (const k of Object.keys(m)) if (!['x', 'y', 'dx', 'dy'].includes(k) || !Number.isFinite(m[k])) return `move.${k} must be x, y, dx or dy with a number`;
  return null;
}
function spot(p, i) {
  const cell = cellOf(i), x = p.x !== undefined ? p.x : cell[0], y = p.y !== undefined ? p.y : cell[1], half = distOf(p) / 2;
  return { x, y, sy: y - half, fy: y + half };
}
// where a fire pair stands. s shooter, f foe, face = the foe's heading in degrees (0 = +x, the identity facing of a vehicle: direction = basis.x [I], guns and men [T]).
// default: shooter at y-dist/2, foe at y+dist/2 as before. "rear": the shooter stands dist behind the foe, on the line opposite its heading, and takes the same heading so it looks at the foe
function layout(p, i) {
  const sp = spot(p, i), d = distOf(p), face = p.face || 0, c = Math.cos(face * D2R), sn = Math.sin(face * D2R);
  if (p.rear && p.foe) return { rear: true, face, c, sn, s: { x: sp.x - d * c + (p.sx || 0), y: sp.y - d * sn }, f: { x: sp.x, y: sp.y }, dist: d };
  return { rear: false, face, c, sn, s: { x: sp.x + (p.sx || 0), y: sp.sy }, f: { x: sp.x, y: sp.fy }, dist: d };
}
// the goal point, or null with no move order
function moveTo(p, i) {
  if (!p.move) return null;
  const s = spot(p, i), m = moveOf(p);
  return m.x !== undefined || m.y !== undefined ? { x: m.x !== undefined ? m.x : s.x, y: m.y !== undefined ? m.y : s.sy } : { x: s.x + (m.dx || 0), y: s.sy + (m.dy || 0) };
}
const movedMark = p => p.mark === 'moved' || (!!p.move && p.mark === undefined);
function markErr(p) {
  if (p.mark === 'moved') return null;
  if (p.mark === 'destroyed') return isStatic(p) ? null : 'mark "destroyed" is for a static foe (static:true)';
  if (p.mark === undefined) return p.never ? 'never needs a mark' : null;
  if (/^(destroyed_components|broken_components)(:[^"\s{}]+)?$/.test(String(p.mark))) return null;
  const m = /^(not )?([a-z_]+)$/.exec(String(p.mark));
  return m && STATES.includes(m[2]) ? null : `mark "${p.mark}" must be a state name (${STATES.join(' ')}), or "not " plus one`;
}

// {Players}: every side neutral to all, only the pair's two sides enemies. 0 neutral 1 enemy 2 ally; a==a ally anyway
function playersBlock(npairs) {
  const rows = [];
  for (let a = 0; a < COUNT; a++) {
    const r = [];
    for (let b = 0; b < COUNT; b++) {
      let v = 0;
      if (a === b) v = 2;
      else if (a && b && Math.ceil(a / 2) === Math.ceil(b / 2) && Math.ceil(a / 2) <= Math.min(npairs, MAX_PAIRS)) v = 1;   // slots 9-16 reuse sides 1-16
      r.push(v);
    }
    rows.push('\t\t\t' + r.join(' '));
  }
  return `\t{Players\n\t\t{count ${COUNT}}\n\t\t{diplomacy\n${rows.join('\n')}\n\t\t}\n\t}\n`;
}

function entities(pairs) {
  let id = 0xe200;
  const nid = () => '0x' + (id++).toString(16), body = [], tags = [];
  // xf: a {xform zl N} heading line, only for a rear pair with a heading other than the default 0 [T: sign of zl]
  const xf = f => (f ? `\t\t{xform zl ${f}}\n` : '');
  // noPlayer: a static (building, prop, tree) is written without {Player}, which its def rejects (COV-BLD)
  const ent = (d, x, y, side, tag, face, noPlayer) => { const i = nid(); body.push(`\t{Entity "${d}" ${i}\n\t\t{Position ${x} ${y}}\n${xf(face)}${noPlayer ? '' : `\t\t{Player ${side}}\n`}\t}\n`); tags.push(`\t{Tags "${tag}" ${i}}\n`); };
  const hum = (b, x, y, side, tag, face) => { const i = nid(); body.push(`\t{Human "${b}" ${i}\n\t\t{Position ${x} ${y}}\n${xf(face)}\t\t{Player ${side}}\n\t\t{FsmState "stand"}\n\t}\n`); tags.push(`\t{Tags "${tag}" ${i}}\n`); };
  pairs.forEach((p, i) => {
    const s = (i % MAX_PAIRS) * 2 + 1, f = s + 1, sp = spot(p, i), x = sp.x, sy = sp.sy, L = layout(p, i), n = p.name;
    const row = k => (k % 2 ? 1 : -1) * 40 * (1 + (k >> 1));
    const fc = L.rear ? L.face : 0;   // heading written only on a rear pair
    if (L.rear) {
      // behind the shooter = away from the foe along the heading; rows run sideways (-sin, cos)
      const at = (o, back, side) => ({ x: o.x - back * L.c - side * L.sn, y: o.y - back * L.sn + side * L.c });
      if (p.class === 'infantry') {
        const c = p.count || 3;
        for (let k = 0; k < c; k++) { const q = at(L.s, 0, (k - (c - 1) / 2) * 30); hum(p.shooter, q.x, q.y, s, `${n}_s`, fc); }
      } else {
        ent(p.shooter, L.s.x, L.s.y, s, `${n}_s`, fc);
        p.crew.forEach((b, k) => { const q = at(L.s, 40, row(k)); hum(b, q.x, q.y, s, `${n}_c`, fc); });
      }
      if (foeClass(p) === 'infantry') hum(p.foe, L.f.x, L.f.y, f, `${n}_f`, fc);
      else if (isStatic(p)) {
        ent(p.foe, L.f.x, L.f.y, f, `${n}_f`, fc, true);
        (p.foeCrew || []).forEach((b, k) => { const q = at(L.f, -40, row(k)); hum(b, q.x, q.y, f, `${n}_fc`, fc); });
      } else {
        ent(p.foe, L.f.x, L.f.y, f, `${n}_f`, fc);
        p.foeCrew.forEach((b, k) => { const q = at(L.f, -40, row(k)); hum(b, q.x, q.y, f, `${n}_fc`, fc); });
      }
      return;
    }
    const sxx = L.s.x, fy = L.f.y;
    if (p.class === 'infantry') {
      const c = p.count || 3;
      // FIX-EDRUN (harness-edrun:130, OBS-I1): men spawned with no heading and the foe at +y stood outside the 150 deg view cone; a fire pair's men now face +y ({xform zl 90}) [T: sign of zl]
    for (let k = 0; k < c; k++) hum(p.shooter, sxx + (k - (c - 1) / 2) * 30, sy, s, `${n}_s`, p.foe && !p.move ? INF_FACE : undefined);
    } else {
      ent(p.shooter, sxx, sy, s, `${n}_s`);
      (p.crew || []).forEach((b, k) => hum(b, sxx + row(k), sy - 40, s, `${n}_c`));
    }
    // COV-C06 task pairs: repairers stand 4 m behind the vehicle, not boarded; the tow truck stands TOW_BACK behind the gun with its crew, a start marker beside the gun, a goal marker towDy ahead
    if (p.task === 'repair') repairersOf(p).forEach((b, k) => hum(b, sxx + row(k), sy - 80, s, `${n}_r`));
    if (p.task === 'tow') {
      ent(p.tower, sxx, sy - TOW_BACK, s, `${n}_t`);
      p.towerCrew.forEach((b, k) => hum(b, sxx + 120 + row(k), sy - TOW_BACK, s, `${n}_tc`));
      hum(MARKER, x + 100, sy, 0, `${n}_m`);
      const g = towGoal(p, i); hum(MARKER, g.x, g.y, 0, `${n}_a`);
    }
    // markers for "moved" / "arrived": inert neutral men (side 0) tagged _m at the start side and _a at the goal. near_to takes a tag, not a waypoint
    if (p.move || p.mark === 'moved') hum(MARKER, x + 100, sy, 0, `${n}_m`);
    if (p.move) { const g = moveTo(p, i); hum(MARKER, g.x, g.y, 0, `${n}_a`); }
    if (!p.foe) return;
    if (foeClass(p) === 'infantry') hum(p.foe, x, fy, f, `${n}_f`);
    else if (isStatic(p)) {
      ent(p.foe, x, fy, f, `${n}_f`, undefined, true);
      (p.foeCrew || []).forEach((b, k) => hum(b, x + row(k), fy + 40, f, `${n}_fc`));
    } else {
      ent(p.foe, x, fy, f, `${n}_f`);
      p.foeCrew.forEach((b, k) => hum(b, x + row(k), fy + 40, f, `${n}_fc`));
    }
  });
  return body.join('') + tags.join('');
}

// MB-R8: the static fire order forms. both (default): queued target order + compass aim; order / weapon: one of them; default: no {attack} key, so the command tries the
// position and falls back to enemies (ExecuteOnActor)
function staticFire(p, n, wp) {
  const ord = `{"actor_fire" {selector {tag ${n}_s}} {drop orders} {attack position} {waypoint "${wp}"}}`, wpn = `{"actor_fire" {selector {tag ${n}_s}} {attack position} {waypoint "${wp}"} {only_weapon {use 1}}}`;
  const k = p.staticFire || 'both';
  return k === 'order' ? ord : k === 'weapon' ? wpn : k === 'default' ? `{"actor_fire" {selector {tag ${n}_s}} {drop orders} {waypoint "${wp}"} {enemies {tag ${n}_f}}}` : ord + ' ' + wpn;
}

function triggers(pairs, runId, speed) {
  const M = t => `{"con" {text "EDRUN ${runId} ${t}"}}`;
  const cnt = (sel, op, v) => `{selector ${sel}} {count {op "${op}"} {value ${v}}}`;
  const speedAct = speed && speed !== 'normal' ? `{"game_speed" {mode ${speed}}} ` : '';
  // empty {condition} runs at start ({"1.event" {id "start"}} did not fire in the pilot). the clock measures the speed reached: game seconds against wall seconds
  const rows = [`{"ed_boot" {condition} {actions ${M('start')} ${speedAct}${M('clock 0')} {"delay" {time 20}} ${M('clock 20')} {"delay" {time 20}} ${M('clock 40')}}}`,
    // VOL-5F: one mark a game second. Lines in the log keep their order, poll times do not: a poll gap reached 1.3 s wall, about 4 game s, so order and kill read the same time with shots between them (tickOf)
    `{"ed_tick" {condition} {actions ${Array.from({ length: TICKS }, (_, i) => M('tick ' + i)).join(' {"delay" {time 1}} ')}}}`];
  for (const [pi, p] of pairs.entries()) {
    if (TASK_NOFOE.includes(p.task)) { rows.push(...taskRows(p, pi, M, cnt)); continue; }
    const n = p.name, st = foeStates(p), crewed = p.class !== 'infantry', hasFoe = !!p.foe, stat = isStatic(p), fcrew = hasFoe && foeClass(p) !== 'infantry' && !stat;
    // EDRUN-3 prepare: {cannon fire} / {weapon_prepare on} on the shooter before the fire order. a placed gun needs it to deploy [T]
    const prep = p.prepare ? `{"actor_state" {selector {tag ${n}_s}} {${p.prepare}}} ` : '';
    // AI units with move_mode free search and drive at the enemy (g4: pairs under 250 m ended muzzle to hull, shells missed), so a fire pair stands still unless free:true
    const stay = p.free || (p.task === 'aiuse' && p.selfMan) ? '' : ' {move_mode hold}';
    const hold = !hasFoe || p.foeFire || stat ? '' : `{"actor_state" {selector {tag ${n}_f}} {fire_mode hold}${stay}} ` + (fcrew ? `{"actor_state" {selector {tag ${n}_fc}} {fire_mode hold}${stay}} ` : '');
    // VOL-5F: the shooter holds fire too until its order row. Unheld, it fired from its first crewed tick, so a close soft foe died at the order (VOL-4: 75 of 136 rifle rows) and a foe crew could die before boarding (NOORDER, foe operatable).
    // The crew (_c) is held with it and released with it, so from the order on a pair stands as it did before the hold. A foeless move pair has nobody to hold fire at; a static foe draws no fire
    const holdS = !hasFoe || p.move || stat ? '' : `{"actor_state" {selector {tag ${n}_s}} {fire_mode hold}} ` + (crewed ? `{"actor_state" {selector {tag ${n}_c}} {fire_mode hold}} ` : '');
    const openC = holdS && crewed ? `{"actor_state" {selector {tag ${n}_c}} {fire_mode open}} ` : '';
    // a move pair orders the shooter entity to its goal waypoint instead of firing (lim MIS-52: never the boarded crew)
    // MB-R8: a static foe has no {Player}, so {attack enemies} found no enemy and the shooter fired 0 shots (REPROOF-4 sc/sv, COV-L8B). It is fired at as a
    // position: a waypoint on the foe GROUND_UP above the flat test map (z in {position}, not {offset}, which the installed exe refuses), the queued target order
    // plus a compass aim with unlimited ammo (AttackPosition); the reorder chain repeats both [T]
    const fire = p.noorder || p.task === 'aiuse' || (!p.move && !hasFoe) ? '' : p.move
      ? `{"actor_to_waypoint" {selector {tag ${n}_s}} {drop orders} {waypoint "${WP0 + pi}"}}`
      : stat ? staticFire(p, n, WPS + pi)
      : `{"actor_fire" {selector {tag ${n}_s}} {attack enemies} {enemies {tag ${n}_f}} {time ${p.orderTime || ORDER_TIME}}}`;
    // COV-C06 aiuse: the crew is boarded, then no fire order (fire is empty for it above): the AI picks the target and fires. selfMan:true: no board either, the AI must man it
    const board = (crewed && !(p.task === 'aiuse' && p.selfMan) ? `{"board" {selector {tag ${n}_c}} {vehicle {tag ${n}_s}}} ` : '') + (fcrew || (stat && p.enter) ? `{"board" {selector {tag ${n}_fc}} {vehicle {tag ${n}_f}}} ` : '');   // enter probe: the board action onto a building [T]
    rows.push(`{"p_${n}_arm" {condition} {actions ${M(n + ' arm')} ${hold}${holdS}${board}${dropOthers(p, n)}}}`);
    // CAM-1 pose: its own row, late and repeated. In the tick of the start rows it had no visible effect (g2, g3); RequestPose only plays a one-shot action and returns at once when the pose is already held
    if (p.pose) {
      const set = `{"delay" {time ${POSE_EVERY}}} {"actor_state" {selector {tag ${n}_s}} {movement {type ${p.pose}}}}`;
      rows.push(`{"p_${n}_pose" {condition} {actions ${(set + ' ').repeat(POSE_TIMES)}}}`);
    }
    // CHAIN-N4 talk: pair key talk "loc/key" (or a list): the shooter "says" the localized text in the talks panel, no mouse needed
    // (cmd_talk, -> -> , ). A missing key logs
    // "Local string not found" at mission load. Its own row, every TALK_EVERY game s, TALK_TIMES rounds, so a shot loop catches it
    if (p.talk) {
      // one key per step: two lines sent together showed only the last one in the panel (CHAIN-N4 v0 shot)
      const say = [].concat(p.talk).map(k => `{"delay" {time ${TALK_EVERY}}} {"talk" {selector {tag ${n}_s}} {text "${k}"}} `).join('');
      rows.push(`{"p_${n}_talk" {condition} {actions ${say.repeat(TALK_TIMES)}}}`);
    }
    // the order and the kill wait for the foe to read ready once: an empty or half-boarded vehicle reads "not moveable" at once, a false kill
    const shooterReady = crewed ? `{"2.entities" ${cnt(`{tag ${n}_s} {state operatable}`, '>', 0)}}` : `{"2.entities" ${cnt(`{tag ${n}_s}`, '>', 0)}}`;
    // reorder: the same order again every N s, a chain of delay + order in the one trigger (the clock rows chain delay the same way)
    // REVHARNESS (edctl owed): earlyIf "idle" takes the early re-issue out of the chain into a gated row (below), so the chain keeps plain orderTime steps
    const early = earlyOf(p), inChain = early && !earlyIdleOf(p) ? early : 0, e2 = early2Of(p);
    const ro = reorderOf(p);
    const again = ro && fire ? (' {"delay" {time ' + ro + '}} ' + fire).repeat(Math.min(REORDER_MAX, Math.floor(REORDER_SPAN / ro)))
      : fire && !p.move ? (inChain ? ' {"delay" {time ' + inChain + '}} ' + M(`${n} reorder 0`) + ' ' + fire : '')
        + (inChain && e2 ? ' {"delay" {time ' + (e2 - inChain) + '}} ' + M(`${n} reorder 0b`) + ' ' + fire : '')
        + Array.from({ length: orderRepeatsOf(p) }, (_, k) => ' {"delay" {time ' + ((p.orderTime || ORDER_TIME) - (k ? 0 : (inChain && e2 ? e2 : inChain))) + '}} ' + M(`${n} reorder ${k + 1}`) + ' ' + fire).join('') : '';   // ORDERRUN: a mark per re-issue, so the log shows each one went out
    // earlyIf idle: early game s after the order, re-issue only if the foe is not killed and no live shooter man holds a running attack order. filter term {order "<name>"}
    // matches the actor's current brain order by GetName (sf_order, ; , [V]);
    // the mission spelling {order "attack by selector"} and the waiter's {"trigger" {on 1}} switch are [T]. The gate stays armed: an order that fails later still gets the one re-issue
    if (early && earlyIdleOf(p) && fire && hasFoe) {
      rows.push(`{"p_${n}_ew" {condition {terms {"1.trigger" {name "p_${n}"}}}} {actions {"delay" {time ${early}}} {"trigger" {name "p_${n}_et"} {on 1}}}}`);
      rows.push(`{"p_${n}_et" {condition {terms {"1.trigger" {name "p_${n}_never"}}}} {actions ${M(n + ' earlytime')}}}`);
      rows.push(`{"p_${n}_er" {condition {expression "1 & !2 & 3"} {terms {"1.trigger" {name "p_${n}_et"}} {"2.trigger" {name "p_${n}_k"}} {"3.entities" ${cnt(`{tag ${n}_s} {state "not dead"} {order "eAttackBySelector"}`, '=', 0)}}}} {actions ${M(`${n} reorder 0`)} ${fire}}}`);
    }
    const foeReady = `{"1.entities" ${cnt(`{tag ${n}_f}${st.ready ? ` {state ${st.ready}}` : ''}`, '>', 0)}}`;
    if (hasFoe) {
      rows.push(`{"p_${n}" {condition {expression "1 & 2"} {terms ${foeReady} ${shooterReady}}} {actions ${p.settle ? `{"delay" {time ${p.settle}}} ` : ''}${M(n + ' order')} {"actor_state" {selector {tag ${n}_s}} {fire_mode open}${crewed && !p.move ? stay : ''}} ${openC}${prep}${hold}${fire}${again}}}`);
      // SILENT-1F: one marker per term of the order row, so a NOORDER says which never came (a trigger latches on its first true, so no marker = false all game)
      rows.push(`{"p_${n}_fr" {condition {terms ${foeReady}}} {actions ${M(n + ' foeready')}}}`);
      rows.push(`{"p_${n}_sr" {condition {terms ${shooterReady.replace('"2.entities"', '"1.entities"')}}} {actions ${M(n + ' shooterready')}}}`);
      // VOL-5F: every foe crew man dead, so the foe can never read operatable again (CheckOperatable needs a filled slot). names the cause of a NOORDER on a crewed foe
      if (fcrew) rows.push(`{"p_${n}_fx" {condition {terms {"1.entities" ${cnt(`{tag ${n}_fc} {state "not dead"}`, '=', 0)}}}} {actions ${M(n + ' foecrewgone')}}}`);
    } else rows.push(`{"p_${n}" {condition {terms ${shooterReady.replace('"2.entities"', '"1.entities"')}}} {actions ${M(n + ' order')} {"actor_state" {selector {tag ${n}_s}} {fire_mode open}} ${fire}}}`);
    if (movedMark(p)) {
      // moved: the order has gone out, the shooter lives, and no live shooter man is within NEAR_M of the start marker. near is true if ANY unit is near, so !near = all have left
      const live = `{tag ${n}_s} {state "not dead"}`, near = (k, to) => `{"${k}.near" {units ${live}} {near_to {tag ${n}_${to}}} {distance ${NEAR_M}}}`;
      rows.push(`{"p_${n}_k" {condition {expression "1 & 2 & !3"} {terms {"1.trigger" {name "p_${n}"}} {"2.entities" ${cnt(live, '>', 0)}} ${near(3, 'm')}}} {actions ${M(n + ' moved')} ${M(n + ' kill')}}}`);
    } else rows.push(`{"p_${n}_k" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(st.killSel(n), '>', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions ${M(n + ' kill')}}}`);
    // REVHARNESS (reproof1 a): a move pair with a kill mark (a tank driven into a static fence or tree) had no moved row and its arrived row waited on the kill, so a NOKILL could not say
    // whether the tank moved at all. Same moved test as above, own row, no kill mark; arrived then gates on the order
    const ownMoved = !!p.move && !movedMark(p);
    if (ownMoved) {
      const live = `{tag ${n}_s} {state "not dead"}`;
      rows.push(`{"p_${n}_mv" {condition {expression "1 & 2 & !3"} {terms {"1.trigger" {name "p_${n}"}} {"2.entities" ${cnt(live, '>', 0)}} {"3.near" {units ${live}} {near_to {tag ${n}_m}} {distance ${NEAR_M}}}}} {actions ${M(n + ' moved')}}}`);
    }
    // EDRUN-3 static foe: destroyed = (a) state dead [the row above], (b) any foe part destroyed, (c) the tagged entity gone (a swap to the _x ruin drops the tag [T]). Only with no pair mark / mark "destroyed".
    // the second and third rows write the same "kill" mark; the first mark seen counts
    if (stat && (p.mark === undefined || p.mark === 'destroyed')) {
      rows.push(`{"p_${n}_k2" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{ignore_captured_by_user 0} {source advanced} {group {select {tag {tag "${n}_f"}}} {include {destroyed_components {masks "*"}}}}`, '>', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions ${M(n + ' kill')}}}`);
      rows.push(`{"p_${n}_k3" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{tag ${n}_f}`, '=', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions ${M(n + ' kill')}}}`);
    }
    // MB-R8 probes, not kills: which static mark terms ever read true (REPROOF-4: none fired). gone = tag count 0; fallen = pillarFallen (,
    // set only by pillar simulator); parts = destroyed_components, which matches actors only (kind & 2) [V]
    if (stat) {
      rows.push(`{"p_${n}_pg" {condition {terms {"1.entities" ${cnt(`{tag ${n}_f}`, '=', 0)}}}} {actions ${M(n + ' probe gone')}}}`);
      // FIX-EDRUN (harness-edrun:124): the fallen probe read true at arm on a live covb_cow (an actor). foeActor:true leaves it out; rowsOf flags one seen at arm (fallenAtArm)
      if (!p.foeActor) rows.push(`{"p_${n}_pf" {condition {terms {"1.entities" ${cnt(`{tag ${n}_f} {state fallen}`, '>', 0)}}}} {actions ${M(n + ' probe fallen')}}}`);
      rows.push(`{"p_${n}_pp" {condition {terms {"1.entities" ${cnt(`{ignore_captured_by_user 0} {source advanced} {group {select {tag {tag "${n}_f"}}} {include {destroyed_components {masks "*"}}}}`, '>', 0)}}}} {actions ${M(n + ' probe parts')}}}`);
    }
    // REVHARNESS (rev-harness 8): a gun foe's default kill is "not inhabited" (crew left: morale, not damage). Mark "wrecked" when a part of the gun is destroyed or it reads dead,
    // so the row splits crew-left from wrecked (row.gunKill). Same advanced-selector term as the static k2 row; that a gun breaks a part at all is [T] (hull-2: none in 120 s [I])
    if (hasFoe && foeClass(p) === 'gun' && !p.mark) {
      rows.push(`{"p_${n}_wk" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{ignore_captured_by_user 0} {source advanced} {group {select {tag {tag "${n}_f"}}} {include {destroyed_components {masks "*"}}}}`, '>', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions ${M(n + ' wrecked')}}}`);
      rows.push(`{"p_${n}_wd" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{tag ${n}_f} {state dead}`, '>', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions ${M(n + ' wrecked')}}}`);
    }
    // enter probe: someone is inside the building (state inhabited: slots or walkers, [V]); mark "entered", not a kill unless mark "inhabited"
    if (stat && p.enter) rows.push(`{"p_${n}_e" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{tag ${n}_f} {state inhabited}`, '>', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions ${M(n + ' entered')}}}`);
    if (p.move) rows.push(`{"p_${n}_a" {condition {expression "1 & 2"} {terms {"1.trigger" {name "p_${n}${ownMoved ? '' : '_k'}"}} {"2.near" {units {tag ${n}_s} {state "not dead"}} {near_to {tag ${n}_a}} {distance ${arriveOf(p)}}}}} {actions ${M(n + ' arrived')}}}`);
    // watch: any foe part broken, kill or not
    if (p.watch || p.ground) rows.push(`{"p_${n}_w" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{ignore_captured_by_user 0} {source advanced} {group {select {tag {tag "${n}_f"}}} {include {broken_components {masks "*"}}}}`, '>', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions ${M(n + ' damaged')}}}`);
    // REVHARNESS (reproof1 a): the ground order went in by AddOrder behind the 120 s attack-by-selector order the p_n row gave (timing {1,0}), and pz6bh vs
    // a vanilla shed fired 0 shots. Now {drop orders} first (the field actor_to_waypoint uses), then a second actor_fire with only_weapon: the compass weapon
    // aims at the point at once with unlimited ammo, no order queue (:1922-1928). The waypoint has offset GROUND_UP so the point is not on or under the ground [T]
    // ground order as backup (sheet Q26): N game s after the attack order, if the foe is neither dead nor damaged (the nearest term to "the shooter has not fired", no fired state exists [I]),
    // the shooter is ordered to fire at the point beside the foe. a trigger counts as on when its actions START, so a delay inside one cannot gate another:
    // the waiter delays, then a command switches the never-true trigger _gt on; _gr reads _gt and the two foe marks. the {"trigger" {name} {on 1}} form is [T]
    if (p.ground) {
      rows.push(`{"p_${n}_gw" {condition {terms {"1.trigger" {name "p_${n}"}}}} {actions ${M(n + ' groundwait')} {"delay" {time ${p.ground}}} {"trigger" {name "p_${n}_gt"} {on 1}}}}`);
      rows.push(`{"p_${n}_gt" {condition {terms {"1.trigger" {name "p_${n}_never"}}}} {actions ${M(n + ' groundtime')}}}`);
      rows.push(`{"p_${n}_gr" {condition {expression "1 & !2 & !3"} {terms {"1.trigger" {name "p_${n}_gt"}} {"2.trigger" {name "p_${n}_k"}} {"3.trigger" {name "p_${n}_w"}}}} {actions ${M(n + ' ground')} {"actor_fire" {selector {tag ${n}_s}} {drop orders} {attack position} {waypoint "${WPG + pi}"}} {"actor_fire" {selector {tag ${n}_s}} {attack position} {waypoint "${WPG + pi}"} {only_weapon {use 1}}}}}`);
    }
    rows.push(`{"p_${n}_x" {condition {terms {"1.entities" ${cnt(`{tag ${n}_s} {state dead}`, '>', 0)}}}} {actions ${M(n + ' shooterdied')}}}`);
    rows.push(`{"p_${n}_g" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{tag ${n}_s} {state "not dead"}`, '=', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions ${M(n + ' gone')}}}`);
  }
  return rows.map(r => '\t\t\t' + r + '\n').join('');
}

// CAM-1 --close. A view of pair p in cell i: focus at man height, the eye CLOSE_EL degrees up on a front quarter of the men (fire pairs face +y, move pairs walk mostly +x), so grip and pose face the camera.
// A move pair's focus is CLOSE_AHEAD along its path, so he stays in view longest.
const CLOSE_DIST = 190, CLOSE_EL = 20, CLOSE_Z = 18, CLOSE_AHEAD = 150, POSE_EVERY = 5, POSE_TIMES = 8, TALK_EVERY = 6, TALK_TIMES = 10;
function closeFocus(p, i) {
  if (!p.move) {
    const L = layout(p, i), near = L.dist <= 100 && p.foe;
    return { x: near ? (L.s.x + L.f.x) / 2 : L.s.x, y: near ? (L.s.y + L.f.y) / 2 : L.s.y };
  }
  // REVHARNESS (reproof1 c): a move pair with a foe (a tank driven into a fence or tree) is about the foe: the view looked CLOSE_AHEAD past the start, the tank drove 800 on
  // out of the fixed view and the foe stood 250 past the focus (cl1 tc, shots c0809-cl1-*). Focus on the foe, where the crush happens
  if (p.foe) { const L = layout(p, i); return { x: L.f.x, y: L.f.y }; }
  const s = spot(p, i), g = moveTo(p, i), len = Math.hypot(g.x - s.x, g.y - s.sy) || 1, at = Math.min(len, CLOSE_AHEAD) / len;
  return { x: s.x + (g.x - s.x) * at, y: s.sy + (g.y - s.sy) * at };
}
// the {cameras} block. A name not in this game's pairs adds nothing (a later chunk, or held by preflight). One fixed view: a "scenario" camera did not play in game (CAM-1 g1)
// MAPLOOK --view ex,ey,ez,lx,ly,lz[,fov]: the same one-key startview at a fixed eye and look_at (world units, z absolute), for map looks; wins over --close
function viewBlock(v) {
  const n = x => +x.toFixed(2);
  return `\t\t{cameras\n\t\t\t{"startview"\n\t\t\t\t{"key000" {position ${n(v[0])} ${n(v[1])} ${n(v[2])}} {look_at ${n(v[3])} ${n(v[4])} ${n(v[5])}} {fov ${n(v[6] || 65)}}}\n\t\t\t}\n\t\t}\n`;
}
function closeBlock(pairs, c) {
  if (c && c.view) return viewBlock(c.view);
  if (!c) return '';
  const i = pairs.findIndex(p => p.name === c.name);
  if (i < 0) return '';
  const p = pairs[i], f = closeFocus(p, i), el = CLOSE_EL * D2R, q = Math.SQRT1_2 * c.dist * Math.cos(el), n = v => +v.toFixed(2);
  const eye = { x: f.x + q, y: p.move ? f.y - q : f.y + q, z: CLOSE_Z + c.dist * Math.sin(el) };
  return `\t\t{cameras\n\t\t\t{"startview"\n\t\t\t\t{"key000" {position ${n(eye.x)} ${n(eye.y)} ${n(eye.z)}} {look_at ${n(f.x)} ${n(f.y)} ${CLOSE_Z}} {fov 65}}\n\t\t\t}\n\t\t}\n`;
}

function buildMission(pairs, runId, opt = {}) {
  let s = (opt.base !== undefined ? opt.base : fs.readFileSync(path.join(FIX, 'combat.mi'), 'latin1')).replace(/\r\n/g, '\n');
  s = s.replace(/\{mission\n[\s\S]*?(\t\{Entity "map_point")/, (_, m) => '{mission\n' + entities(pairs) + m);
  s = s.replace(/\{triggers\n[\s\S]*?\n\t\t\}\n/, () => '{triggers\n' + triggers(pairs, runId, opt.ratio ? undefined : opt.speed) + '\t\t}\n' + closeBlock(pairs, opt.close));
  // --ratio N: a scene {Quant {speed 1/N}} block instead of the game_speed action, which would replace it (same requester). speed divides the frame time
  if (opt.ratio) s = s.replace(/^\{mission\n/, () => `{mission\n\t{Quant {speed ${+(1 / opt.ratio).toFixed(4)}}}\n`);
  // goal waypoints of the move pairs, beside the base "900"/"901" (radius 20 as theirs)
  const wps = pairs.map((p, i) => { const g = moveTo(p, i); return g ? `\t\t\t{"${WP0 + i}" {position ${g.x.toFixed(2)} ${g.y.toFixed(2)} 0} {radius 20}}\n` : ''; }).join('');
  const gwps = pairs.map((p, i) => { if (!p.ground) return ''; const L = layout(p, i); return `\t\t\t{"${WPG + i}" {position ${(L.f.x + GROUND_OFF).toFixed(2)} ${L.f.y.toFixed(2)} 0} {radius 20}${opt.wpOffset ? ` {offset ${GROUND_UP}}` : ''}}\n`; }).join('');
  // MB-R8: aim points of the static foe fire pairs. FIX-EDRUN: on the near face at half the wall height (staticAimOf), above the flat test map (on a --map / --map-from map the ground height is not read [I])
  const swps = pairs.map((p, i) => { if (!isStatic(p) || p.move || p.noorder) return ''; const a = staticAimOf(p, layout(p, i)); return `\t\t\t{"${WPS + i}" {position ${a.x.toFixed(2)} ${a.y.toFixed(2)} ${a.z}} {radius 20}}\n`; }).join('');
  const twps = pairs.map((p, i) => { if (p.task !== 'tow') return ''; const g = towGoal(p, i); return `\t\t\t{"${WPT + i}" {position ${g.x.toFixed(2)} ${g.y.toFixed(2)} 0} {radius 20}}\n`; }).join('');
  if (wps || gwps || swps || twps) s = s.replace(/(\{waypoints "player"\n)/, (_, h) => h + wps + gwps + swps + twps);
  s = s.replace(/\t\{Players\n[\s\S]*?\n\t\}\n/, () => playersBlock(pairs.length));
  if (opt.fog !== undefined) s = s.replace(/\{Fog \d+\}/, `{Fog ${opt.fog}}`);
  // --env name: the Environment the mission selects (default stays the fixture's multi/multi_01)
  if (opt.env !== undefined) s = s.replace(/\{Environment "[^"]*"\}/, () => `{Environment "${opt.env}"}`);
  return s;
}

// the game's fatal block in a log: ***************** Exception ***************** then the reason and the faulting frame
function crashOf(text) {
  const m = /^\*+ Exception \*+/m.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index, m.index + 3000).split(/\r?\n/);
  // a data error block (e.g. 'Block terminator expected! (459)' then '> file "/set/material.set"') has no EXCEPTION_ or At line:
  // why falls back to the first text line after the header, at to the '> file' line (MAPR-G r1 printed an empty fault text)
  const first = rest.slice(1).find(l => l.trim() && !/^Program will be terminated/.test(l) && !/^-+$/.test(l.trim())) || '';
  const at = rest.find(l => /^At /.test(l)) || rest.find(l => /^> file /.test(l)) || '';
  return { why: rest.find(l => /^EXCEPTION_/.test(l)) || first.trim(), at: at.slice(0, 170) };
}

// the last entity the log names before the crash (game.log has no spawn line, so this is the last "/entity/<name>/" path it printed
// or "Entity redefinition: <name>"): a hint to who was being built, not proof [I]. null when the log names none
function lastEntityOf(text) {
  const m = /^\*+ Exception \*+/m.exec(text), head = m ? text.slice(0, m.index) : text;
  let last = null;
  // a path names its deepest folder (/entity/-vehicle/tank/pz4h/pz4h.def -> pz4h, not the -vehicle category)
  for (const r of head.matchAll(/\/entity\/((?:[^\/\s"]+\/)+)|Entity redefinition: (\S+)|Entity "([^"]+)"/g)) last = { name: r[1] ? r[1].split('/').filter(Boolean).pop() : (r[2] || r[3]), line: head.slice(0, r.index).split('\n').length };
  return last;
}

// title and state of a process's main window, null when tasklist has no row for it
function windowOf(pid) {
  const r = cp.spawnSync('tasklist', ['/FI', 'PID eq ' + pid, '/V', '/FO', 'CSV', '/NH'], { encoding: 'latin1', windowsHide: true });
  const f = String(r.stdout || '').trim().split(/\r?\n/)[0].match(/"([^"]*)"/g);
  return f && f.length >= 9 ? { status: f[5].slice(1, -1), title: f[8].slice(1, -1) } : null;
}

// log text -> {pairName:{mark:seconds}}: `times` gives a wall time per mark as polled; a log with another run's id counts for nothing
function parseMarks(text, runId, keepTicks) {
  const out = [], re = new RegExp(`^EDRUN ${runId} (.+?)\\s*$`, 'gm');
  let m;
  while ((m = re.exec(text))) if (keepTicks || !/^tick \d+$/.test(m[1])) out.push(m[1]);
  return out;
}
// VOL-5F: log text -> {mark: game second of the last tick line above it}. A run with no tick lines gives null for every mark
function tickOf(text, runId) {
  const out = {};
  let t = null;
  for (const m of parseMarks(text, runId, true)) {
    const k = /^tick (\d+)$/.exec(m);
    if (k) t = +k[1];
    else if (!(m in out)) out[m] = t;
  }
  return out;
}

// log entity number -> who. numbers run in mission order from 1, base map after them [V: CTRL-1 logs, 8 shooters with mixed crews]
// ORDERRUN: an entity the game "can't spawn" (def missing, e.g. a mod unit run without its mod) takes no number, so every later id moves down
// (r1: cv35_hun x2 unspawned, the long pair's t34_0 logged as [14] not [16], its muzzle lines read as mgfar crew). logText given: those defs are skipped [V r1]
function unspawnedOf(logText) { return new Set([...String(logText || '').matchAll(/can't spawn entity (\S+)/g)].map(m => m[1].split('/').pop().toLowerCase())); }
function entityIds(pairs, logText) {
  const text = entities(pairs), tags = {}, out = {}, gone = unspawnedOf(logText);
  for (const m of text.matchAll(/\{Tags "([^"]+)" (0x[0-9a-f]+)\}/g)) tags[m[2]] = m[1];
  let k = 0;
  for (const m of text.matchAll(/\{(Entity|Human) "([^"]+)" (0x[0-9a-f]+)\n/g)) {
    const r = /^(.+)_(s|c|f|fc|m|a)$/.exec(tags[m[3]] || '');
    if (m[1] === 'Entity' && gone.has(m[2].split('/').pop().toLowerCase())) continue;
    out[++k] = { pair: r ? r[1] : null, role: r ? r[2] : null, human: m[1] === 'Human', name: m[1] === 'Human' ? 'human' : m[2].split('/').pop().toLowerCase(), ...(m[1] === 'Human' ? { breed: m[2].toLowerCase() } : {}) };
  }
  return out;
}
// BLAST[charge/inner-outer]: name[id or id:breed]/volume (..): one line per volume a blast reaches, . Lines carry no time and interleave
function blastLines(text) {
  const by = {}, re = /^(?:\[\d+:\d+:\d+\] )?BLAST\[([\d.e+-]+)\/([\d.e+-]+)-([\d.e+-]+)\]: ([^\[\/]+)\[(\d+)(?::[^\]]*)?\]\/(.+?) \(/gm;
  let m;
  while ((m = re.exec(text))) {
    const o = by[m[5]] || (by[m[5]] = { name: m[4].toLowerCase(), heads: {} }), head = `${+m[1]}/${+m[2]}-${+m[3]}`;
    const h = o.heads[head] || (o.heads[head] = {});
    h[m[6]] = (h[m[6]] || 0) + 1;
  }
  return by;
}
// a blast touches a volume once, so a head's event count is its busiest volume
const eventsOf = vols => Math.max(0, ...Object.values(vols));
// a foe blast of charge 3 or more is a cannon-size hit [I: 3/3-8, 10/2.5-10 on t34_0, AIM-1]
const headCharge = head => +String(head).split('/')[0];
const CANNON_CHARGE = 3;
const isMuzzle = head => /^0\.2\/1-/.test(head);   // muzzle.inc: {blastwave c4 0.2 r0 1 r1 1.5|2.0|2.5} on fire "gun" = muzzle_medium, large, maximum: each line is a cannon round [V]
const BLAST_MUZZLE = /^muzzle_(medium|large|maximum)$/i;   // muzzle_zenite, minimum, small have no blastwave, so no line and no count
// the muzzle read for a def -> null if its gun logs lines (0 lines is a real 0), else why it can't count. reader: muzzle_x | null no prop | undefined not read
function noBlastOf(def, muzzleOf) {
  let m;
  try { m = muzzleOf(def); } catch (e) { m = undefined; }
  if (m === undefined) return { muzzle: null, why: 'muzzle prop not read' };
  if (m === null) return { muzzle: null, why: 'no muzzle prop' };
  return { muzzle: m, why: BLAST_MUZZLE.test(m) ? null : m };
}
// log -> {pair:{shots,hits,hitKinds,parts}}. shots null without the cvar, for infantry, or when a log name does not fit the entity number
// opt.muzzleOf(def): with it a gun with no muzzle blast reads null, not 0 (noBlast says why). without it (old callers) 0 stays 0
function shotsOf(text, pairs, blastOn, opt = {}) {
  const ids = entityIds(pairs, text), lines = blastLines(text), out = {}, bad = [], vehNames = new Set(Object.values(ids).filter(w => !w.human).map(w => w.name));
  for (const p of pairs) out[p.name] = { shots: null, hits: null, hitKinds: {}, parts: [], mgShots: null, cannonShots: null, cannonBlasts: null, cannonVisible: null, muzzleKinds: {} };
  for (const id of Object.keys(lines)) {
    const who = ids[id];
    // ORDERRUN: a crew/foe-crew (human) id that logs a vehicle def of these pairs is a shifted map too
    if (who && (((who.role === 's' || who.role === 'f') && lines[id].name !== who.name) || (who.human && vehNames.has(lines[id].name)))) bad.push(`${lines[id].name}[${id}] is not ${who.name}`);
  }
  for (const m of text.matchAll(/bone '([^']+)' has no broken view in ([^\[\s]+)\[(\d+)\]/g)) {
    const who = ids[m[3]];
    if (who && who.role === 'f' && m[2].toLowerCase() === who.name && !out[who.pair].parts.includes(m[1])) out[who.pair].parts.push(m[1]);
  }
  if (blastOn && !bad.length) {
    for (const p of pairs) {
      const r = out[p.name];
      if (p.foe) r.hits = 0;
      if (p.class !== 'infantry') { r.shots = 0; r.cannonShots = 0; r.cannonBlasts = 0; }
      if (p.foe) r.cannonVisible = 0;
    }
    for (const id of Object.keys(ids)) {
      const who = ids[id], o = lines[id];
      if (!o || !who.pair) continue;
      const r = out[who.pair];
      for (const [head, vols] of Object.entries(o.heads)) {
        if (who.role === 's' && !who.human && isMuzzle(head)) {
          r.shots += eventsOf(vols);
          r.cannonShots += eventsOf(vols);
          r.muzzleKinds[head] = (r.muzzleKinds[head] || 0) + eventsOf(vols);
        }
        // TEST-2: a cannon round logs charge-3 blasts on the shooter's own volumes (pz6bh: 3/3-8 + 3/2.5-10 beside its 0.2/1-2 coax, CAR-2) [I: it could also be fire coming back at the shooter; foes in the exams are unarmed]
        // one count per shot, not per head: the heads of a shot come together, so the busiest head is the count. folded into cannonShots and shots below
        if (who.role === 's' && !who.human && !isMuzzle(head) && headCharge(head) >= CANNON_CHARGE) { r.cannonBlasts = Math.max(r.cannonBlasts || 0, eventsOf(vols)); r.muzzleKinds[head] = (r.muzzleKinds[head] || 0) + eventsOf(vols); }
        if (who.role === 'f' && !isMuzzle(head) && headCharge(head) >= CANNON_CHARGE) r.cannonVisible += eventsOf(vols);
        if (who.role === 'f' && !isMuzzle(head)) { r.hits += eventsOf(vols); r.hitKinds[head] = (r.hitKinds[head] || 0) + eventsOf(vols); }
      }
    }
    for (const p of pairs) {
      const r = out[p.name];
      // SILENT-1F: read before the fold, muzzle lines win: a counted line is a counted shot whatever the prop says
      if (opt.muzzleOf && p.class !== 'infantry') {
        const nb = noBlastOf(p.shooter, opt.muzzleOf);
        r.muzzle = nb.muzzle;
        if (nb.why && !Object.keys(r.muzzleKinds).some(isMuzzle)) { r.shots = r.cannonShots = null; r.noBlast = nb.why; continue; }
      }
      if (r.cannonBlasts > 0) { r.cannonShots = Math.max(r.cannonShots, r.cannonBlasts); r.shots = r.cannonShots; }   // blasts and muzzle lines are the same shots: the larger count, not the sum
    }
    // the foe took damage but the shooter logged no muzzle line: a muzzle with no blast (t34_1 is muzzle_small), so not measured
    for (const p of pairs) { const r = out[p.name]; if (r.shots === 0 && (r.hits || r.parts.length)) r.shots = r.cannonShots = r.cannonBlasts = null; }
  }
  return { rows: out, bad };
}
// KILLPROOF (rev-harness 1): the foe's own death and own-ammo blasts are not proof that the shooter hit it. 3/3-8, 10/2.5-10 are the foe blowing up as it dies
// (edrun-ff.md item 4, aim-1, shot-1 [V]); an inner radius of 7 or more (10/7-8, 16/7-12, 1/12-18, 1/16-24) is an ammo rack or fuel blast [I]
function isDeathKind(head) {
  const m = /^([\d.e+-]+)\/([\d.e+-]+)-([\d.e+-]+)$/.exec(String(head));
  if (!m) return false;
  const c = +m[1], r0 = +m[2], r1 = +m[3];
  return (c >= 3 && ((r0 === 3 && r1 === 8) || (r0 === 2.5 && r1 === 10))) || r0 >= 7;
}
const PROVEN = new Set(['muzzle', 'damage', 'hp']);
// MGPROOF: console var dbg_health 1 logs every health loss of an actor (in the installed as64/as64_ed [V string]):
//   HEALTH human[23:mp/rus/rifle] : -330 [-180]   = name[uid:breed] : -damage [health left]. Same uid as BLAST lines. No attacker in the line.
// -> {id, name, breed, dmg, left} or null
const HEALTH_RE = /^(?:\[\d+:\d+:\d+\] )?HEALTH ([^\[\s]+)\[(\d+)(?::([^\]]*))?\] : -([\d.e+-]+) \[([\d.e+-]+)\]/;
function healthLine(l) {
  const m = HEALTH_RE.exec(l);
  return m ? { id: m[2], name: m[1].toLowerCase(), breed: m[3] ? m[3].toLowerCase() : null, dmg: +m[4], left: +m[5] } : null;
}
// KILLPROOF: log text -> {pair: {proof, muzzleBefore, damageBefore, deathBlasts, damagedBeforeKill, idsOk}} by log line order (marks and BLAST lines keep their order).
// proof: muzzle = a muzzle line of the pair's shooter between its order and kill marks; damage = a foe (or foe crew) blast of a non-death kind in that span,
// or the watch "damaged" mark before the kill mark; hp (MGPROOF) = a dbg_health HEALTH loss on the foe (or foe crew) between order and kill, the only trace an MG or rifle hit
// on a man leaves [V mgproof]; it names no attacker, so it proves the foe was hit, not by whom (overshoot from another lane [I]); a breed that is not the id's def leaves HEALTH unread (hpIdsOk false);
// deathblast = only death kinds on the foe after the order; none = nothing; null = no kill mark.
// runId: only that run's marks (null = any). ids that do not fit the log names leave the BLAST lines unread: idsOk false, only the marks judge
function proofOf(text, pairs, runId) {
  const ids = entityIds(pairs, text), out = {}, names = pairs.map(p => p.name), vehNames = new Set(Object.values(ids).filter(w => !w.human).map(w => w.name));
  for (const p of pairs) out[p.name] = { proof: null, muzzleBefore: 0, damageBefore: 0, hpBefore: 0, hpLethal: false, deathBlasts: 0, damagedBeforeKill: false, idsOk: true, hpIdsOk: true };
  const at = {}, lines = String(text || '').split(/\r?\n/), mre = /^EDRUN (\S+) (.+?)\s*$/, bre = /BLAST\[([\d.e+-]+)\/([\d.e+-]+)-([\d.e+-]+)\]: ([^\[\/]+)\[(\d+)[^\]]*\]/;
  let bad = false;
  for (const l of lines) { const b = bre.exec(l); if (!b) continue; const who = ids[b[5]]; if (who && (((who.role === 's' || who.role === 'f') && who.name && b[4].trim().toLowerCase() !== String(who.name).toLowerCase()) || (who.human && vehNames.has(b[4].trim().toLowerCase())))) { bad = true; break; } }
  // MGPROOF: a HEALTH line whose breed is not the human def at that id = shifted map, HEALTH not read
  let hpBad = false;
  for (const l of lines) { const h = healthLine(l); if (!h) continue; const who = ids[h.id]; if (who && who.pair && (who.human ? h.name !== 'human' || (h.breed && who.breed && h.breed !== who.breed) : h.name !== who.name)) { hpBad = true; break; } }
  const first = {};
  lines.forEach((l, i) => {
    const m = mre.exec(l);
    if (m) {
      if (runId && m[1] !== runId) return;
      for (const n of names) if (m[2].startsWith(n + ' ')) { const k = m[2].slice(n.length + 1), a = at[n] || (at[n] = {}); if (!(k in a)) { a[k] = true; (first[n] = first[n] || {})[k] = i; } }
      return;
    }
    const h = hpBad ? null : healthLine(l);
    if (h) {
      const who = ids[h.id];
      if (!who || !who.pair || !out[who.pair] || !(who.role === 'f' || who.role === 'fc') || !(h.dmg > 0)) return;
      const a = at[who.pair] || {}, r = out[who.pair];
      if (a.order && !a.kill) { r.hpBefore++; if (h.left <= 0 && h.left + h.dmg > 0) r.hpLethal = true; }
      return;
    }
    if (bad) return;
    const b = bre.exec(l);
    if (!b) return;
    const who = ids[b[5]];
    if (!who || !who.pair || !out[who.pair]) return;
    const a = at[who.pair] || {}, live = a.order && !a.kill, head = (+b[1]) + '/' + (+b[2]) + '-' + (+b[3]), r = out[who.pair];
    if (who.role === 's' && !who.human && isMuzzle(head)) { if (live) r.muzzleBefore++; }
    else if ((who.role === 'f' || who.role === 'fc') && !isMuzzle(head) && a.order) {
      if (isDeathKind(head)) r.deathBlasts++;
      else if (live) r.damageBefore++;
    }
  });
  for (const p of pairs) {
    const r = out[p.name], a = first[p.name] || {};
    r.idsOk = !bad; r.hpIdsOk = !hpBad;
    r.damagedBeforeKill = a.damaged !== undefined && a.kill !== undefined && a.damaged < a.kill;
    if (a.kill === undefined) continue;
    r.proof = r.muzzleBefore > 0 ? 'muzzle' : (r.damageBefore > 0 || r.damagedBeforeKill) ? 'damage' : r.hpBefore > 0 ? 'hp' : r.deathBlasts > 0 ? 'deathblast' : 'none';
  }
  return out;
}
// KILLPROOF: only a fire pair's PASS is judged: killVerdict KILL (muzzle | damage) or KILL_UNPROVEN; an unproven kill is not counted. verdict stays PASS for readers.
// orderExpired: the kill came after the game s its orders covered (orderLife); flagged, still counted
function applyProof(row, p, pr, life) {
  if (!(row.verdict === 'PASS' && p.foe && !p.never && !p.move)) return row;
  row.proof = pr ? pr.proof || 'none' : 'none';
  if (pr && typeof pr.hpBefore === 'number' && (pr.hpBefore > 0 || pr.hpLethal)) { row.hpBefore = pr.hpBefore; row.hpLethal = pr.hpLethal; }
  row.killVerdict = PROVEN.has(row.proof) ? 'KILL' : 'KILL_UNPROVEN';
  if (row.killVerdict === 'KILL_UNPROVEN' && row.counted) { row.counted = false; row.countReason = 'unproven: ' + row.proof; }
  if (life !== null && life !== undefined) { row.orderLife = life === Infinity ? null : life; row.orderExpired = life !== Infinity && typeof row.killGameS === 'number' && row.killGameS > life; }
  return row;
}
// Wilson 95% score interval for k of n -> [lo, hi] (2 decimals), null for n 0
function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return null;
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [+Math.max(0, c - h).toFixed(2), +Math.min(1, c + h).toFixed(2)];
}
// per-cell summary: rows grouped by pair name; runs leave out ERROR, held, control and foeless rows, and (REVHARNESS, rev-harness 6) a free-fire row that never engaged (row.engaged false: void)
// REVHARNESS (rev-harness 1, 3): proof = proof mix of the PASS rows, fire = fireProof mix, heldOnly = counted kills whose only fire sign is "held"; edge = one run more or less
// flips the vol4 bar (runs >= 4, kills*2 >= runs), rerun it before a verdict rests on it. Extra keys only when non-zero, so old readers see the same object
const PASS_BAR = (k, n) => n >= 4 && k * 2 >= n;
const edgeOf = (k, n) => n > 0 && (PASS_BAR(k, n) ? !PASS_BAR(k - 1, n) || !PASS_BAR(k, n + 1) : PASS_BAR(k + 1, n) || PASS_BAR(k + 1, n + 1));
function cellSummary(rows) {
  const by = {}, add = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const r of rows) {
    if (r.verdict === 'ERROR' || r.held || r.control || !r.foe) continue;
    const c = by[r.name] || (by[r.name] = { name: r.name, runs: 0, kills: 0, unproven: 0, expired: 0 });
    if (r.engaged === false || r.verdict === 'NOSPAWN') { c.void = (c.void || 0) + 1; continue; }   // MB-R1: NOSPAWN = no test ran
    c.runs++;
    if (r.counted === true) c.kills++;
    if (r.killVerdict === 'KILL_UNPROVEN') c.unproven++;
    if (r.orderExpired) c.expired++;
    if (r.verdict === 'PASS' && r.proof) add(c.proof || (c.proof = {}), r.proof);
    if (r.verdict === 'PASS' && r.fireProof !== undefined) add(c.fire || (c.fire = {}), r.fireProof || '-');
    if (r.counted === true && r.fireProof === 'held') c.heldOnly = (c.heldOnly || 0) + 1;
  }
  return Object.values(by).map(c => Object.assign(c, { ci: wilson(c.kills, c.runs) }, edgeOf(c.kills, c.runs) ? { edge: true } : {}));
}
// all cells together (rev-harness 3: a Wilson interval per total too). Runs of one game are not independent, so the interval is too narrow for twin comparisons [I]
function totalOf(cs) {
  const t = { runs: 0, kills: 0, unproven: 0, heldOnly: 0, void: 0, edge: 0, proof: {}, fire: {} };
  for (const c of cs) {
    t.runs += c.runs; t.kills += c.kills; t.unproven += c.unproven; t.heldOnly += c.heldOnly || 0; t.void += c.void || 0; t.edge += c.edge ? 1 : 0;
    for (const k of ['proof', 'fire']) for (const [x, v] of Object.entries(c[k] || {})) t[k][x] = (t[k][x] || 0) + v;
  }
  t.ci = wilson(t.kills, t.runs);
  return t;
}
const mixOf = o => Object.entries(o || {}).map(([k, v]) => k + ' ' + v).join(', ');
const summaryLines = cs => cs.map(c => 'cell ' + c.name + ': kills ' + c.kills + '/' + c.runs + ' wilson95 ' + (c.ci ? c.ci.join('-') : '-') + (c.unproven ? ' unproven ' + c.unproven : '') + (c.expired ? ' afterOrder ' + c.expired : '')
  + (c.edge ? ' EDGE' : '') + (c.heldOnly ? ' heldOnly ' + c.heldOnly : '') + (c.void ? ' ffVoid ' + c.void : '') + (c.proof ? ' proof [' + mixOf(c.proof) + ']' : '') + (c.fire ? ' fire [' + mixOf(c.fire) + ']' : ''))
  .concat(cs.length ? [(t => 'total: kills ' + t.kills + '/' + t.runs + ' wilson95 ' + (t.ci ? t.ci.join('-') : '-') + ' cells ' + cs.length + ' edge ' + t.edge + (t.unproven ? ' unproven ' + t.unproven : '') + (t.heldOnly ? ' heldOnly ' + t.heldOnly : '') + (t.void ? ' ffVoid ' + t.void : '')
    + (Object.keys(t.proof).length ? ' proof [' + mixOf(t.proof) + ']' : '') + (Object.keys(t.fire).length ? ' fire [' + mixOf(t.fire) + ']' : ''))(totalOf(cs))] : []);
// a kill before its order is a false kill, whatever the triggers meant. shooter dead before the kill = no clean result
// TEST-2: a PASS is not always a kill that counts. counted + countReason are added beside verdict (verdict is unchanged).
// not counted: no PASS; kill on the order tick (the trigger read the foe dead the moment it fired: a false kill the verdict cannot see);
// kill later than the class cap in game s (wall s x the measured ratio; vehicle 90, gun 60, infantry 20: --secs 75 at 3x is 225 game s);
// under 2 game s with no hit and no part (hits null = not measured, not judged). Unknown ratio leaves the cap unchecked, said in countReason.
const KILL_CAP = { vehicle: 90, gun: 60, infantry: 20 }, INSTANT_GAME_S = 2;
// EDRUN-FF --kill-cap: "N" (game s, every class), "vehicle=N,gun=N,infantry=N" (named classes, the rest default) or "none" (no cap). -> {cls:cap} or an error text. Absent = KILL_CAP, so the default report is unchanged
function killCapOf(v) {
  if (v === undefined) return { ...KILL_CAP };
  if (v === 'none') return { vehicle: Infinity, gun: Infinity, infantry: Infinity };
  if (typeof v !== 'string') return '--kill-cap needs N, cls=N[,cls=N] or none';
  if (/^\d+(\.\d+)?$/.test(v)) return { vehicle: +v, gun: +v, infantry: +v };
  const out = { ...KILL_CAP };
  for (const kv of v.split(',')) { const m = /^(vehicle|gun|infantry)=(\d+(?:\.\d+)?)$/.exec(kv.trim()); if (!m) return '--kill-cap: bad part ' + kv; out[m[1]] = +m[2]; }
  return out;
}
function countedOf(v, opt = {}) {
  if (v.verdict !== 'PASS') return { counted: false, countReason: 'verdict ' + v.verdict };
  if (v.kill === null || v.kill === undefined) return { counted: false, countReason: 'no kill mark' };   // a negative pair's PASS: nothing happened
  // VOL-5F: opt.gameS = kill less order by the tick marks, whole game s. With it poll times decide nothing: 0 only means under a second, and the instant rule judges that. Without it (old logs) the poll rule stands
  const gs = typeof opt.gameS === 'number' ? opt.gameS : null;
  if (gs === null ? v.kill <= v.order : gs === 0 && (opt.hits === null || opt.hits === undefined)) return { counted: false, countReason: 'on-tick' };
  const ratio = opt.ratio > 0 ? opt.ratio : null, game = gs !== null ? gs : ratio ? (v.kill - v.order) * ratio : null;
  const cap = (opt.caps || KILL_CAP)[opt.cls];
  if (game !== null && cap && game > cap + 1e-9) return { counted: false, countReason: 'overcap' };
  if (game !== null && game < INSTANT_GAME_S && opt.hits === 0 && !(opt.parts && opt.parts.length)) return { counted: false, countReason: 'instant' };
  return { counted: true, countReason: game === null ? 'cap unchecked' : 'ok' };
}
// VOL-FX: kill less order in game s: the tick count when there is one, else wall s x the measured ratio (1 decimal), null with no kill or no order
function killGameSOf(v, gameS, ratio) {
  if (v.kill === null || v.kill === undefined || v.order === null || v.order === undefined) return null;
  if (typeof gameS === 'number') return gameS;
  return ratio > 0 ? +((v.kill - v.order) * ratio).toFixed(1) : null;
}
function verdictOf(marks, never, opt) {
  const r = verdictCore(marks, never);
  return { ...r, ...countedOf(r, opt || {}) };
}
function verdictCore(marks, never) {
  const g = k => (marks[k] === undefined ? null : marks[k]);
  const order = g('order'), kill = g('kill'), died = g('shooterdied'), gone = g('gone');
  let v;
  if (kill !== null && order === null) v = 'FALSEKILL';
  else if (kill !== null && order !== null && kill < order) v = 'FALSEKILL';
  else if (order === null) v = 'NOORDER';
  else if (never) v = kill !== null ? 'MARKED' : gone !== null ? 'SHOOTERLOST' : 'PASS';   // negative pair: the mark coming is the failure
  else if (kill === null) v = gone !== null ? 'SHOOTERLOST' : 'NOKILL';
  else if (gone !== null && gone < kill) v = 'SHOOTERLOST';
  else v = 'PASS';
  return { order, kill, shooterDied: died !== null, shooterDiedAt: died, gone, verdict: v };
}

function table(rows, speed) {
  const f = v => (v === null || v === undefined ? '-' : (typeof v === 'number' ? v.toFixed(1) : String(v)));
  const out = [['pair', 'class', 'order s', 'kill s', 'shooter died', 'verdict']];
  for (const r of rows) out.push([r.name, r.class, f(r.order), f(r.kill), r.shooterDied ? 'yes ' + f(r.shooterDiedAt) : 'no', r.verdict + (r.shots === null || r.shots === undefined || r.shotsRead === false ? (r.noBlast ? ` shots ? (${r.noBlast})` : '') : ` shots ${r.shots}`) +(r.hits === null || r.hits === undefined ? '' : ` hits ${r.hits}`) + (r.parts && r.parts.length ? ` parts ${r.parts.join(',')}` : '') + (r.note ? ' ' + r.note : '')]);
  const w = out[0].map((_, i) => Math.max(...out.map(r => r[i].length)));
  const lines = out.map(r => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd());
  if (speed) lines.push(`speed measured ${speed}`);
  return lines.join('\n');
}

// clock marks to a game/wall ratio. needs both ends seen
function speedOf(t) {
  const a = t['clock 0'], b = t['clock 40'], c = t['clock 20'];
  if (a === undefined) return null;
  if (b !== undefined && b > a) return { ratio: +(40 / (b - a)).toFixed(2), wall: +(b - a).toFixed(1) };
  if (c !== undefined && c > a) return { ratio: +(20 / (c - a)).toFixed(2), wall: +(c - a).toFixed(1) };
  return null;
}

function usage(msg) { if (msg) console.error(msg); console.error('usage: edrun.js --game G --root dir --exe as64_ed.exe --pairs f.json [--mods as64+,x] [--secs N] [--no-scale-secs] [--load-secs N] [--hold N] [--out dir] [--speed very_fast|fast|normal] [--fog 0|1] [--pipe "a;b"] [--no-pipe] [--dry] [--map map_name] [--map-from mod_dir] [--per-game 1..16] [--close pair [--close-dist N]] [--view ex,ey,ez,lx,ly,lz[,fov]] [--free-fire] [--kill-cap N|cls=N,..|none] [--early-idle] [--wp-offset] [--fresh-cache] [--sound] [--auto-rerun N] [--hold-faults] | --list run-list [--insts 1,2,3 [--commit-reserve MB] [--stagger s]] | --prep-map mod_dir'); process.exit(2); }
function argsOf(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) usage('unknown arg ' + k);
    if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) a[k.slice(2)] = argv[++i]; else a[k.slice(2)] = true;
  }
  for (const k of Object.keys(a)) if (!KNOWN_ARGS.includes(k)) usage('unknown arg --' + k);
  return a;
}

// REVHARNESS (reproof1 b): keep is ms or a predicate. A 60 s cap gave up before a slow load opened the pipe (c06r: mission start 63.9 s, pipe []), so dbg_blast never went in
// and a real HE kill stayed "unproven". runChunk now retries while the game lives and its time runs. opt.name: another pipe (tests)
// the --pipe commands with no reply line (id i+2: s_version is id 1). One missed means its log is off for this game, and a proof that needs it reads "unproven" for that cause
function pipeMissedOf(extra, lines) {
  const ids = new Set();
  for (const l of lines || []) { try { const j = JSON.parse(l); if (j && j.type === 'reply') ids.add(j.id); } catch { /* not JSON */ } }
  return extra.filter((c, i) => !ids.has(i + 2));
}
function pipeTalk(cmds, onLine, keep, opt = {}) {
  // JSON lines {id,cmd} to \\.\pipe\as64.<inst>. resolves the socket or null
  return new Promise(resolve => {
    const name = opt.name || '\\\\.\\pipe\\as64.' + INST, t0 = Date.now(), more = typeof keep === 'function' ? keep : () => Date.now() - t0 < keep;
    const go = () => {
      const s = net.connect(name);
      let buf = '';
      s.on('connect', () => { for (const [i, c] of cmds.entries()) s.write(JSON.stringify({ id: i + 1, cmd: c }) + '\n'); resolve(s); });
      s.on('data', d => { buf += d.toString('utf8'); let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } });
      s.on('error', () => { if (more()) setTimeout(go, 500); else resolve(null); });
    };
    go();
  });
}

// BUILD-GATE job 5: when edrun's own game on this instance closed a moment ago, the game may still hold options.set for a few seconds:
// modswitch says GAME_RUNNING. Wait once (20 s; EDRUN_RETRY_MS overrides, for tests) and retry once. Any other failure, or a game not ours, is not retried.
let lastGameEnd = 0;
const RETRY_WINDOW_MS = 120000, RETRIES = 4;
function runSwitch(G, extra, spawn = cp.spawnSync) {
  const go = () => spawn(process.execPath, [path.join(R, 'tools/modswitch/modswitch.js'), '--game', G, '--inst', String(INST), '--bak', 'options.set.edrun', ...extra, '--write', '--force'], { encoding: 'utf8' });
  let r = go();
  // up to RETRIES waits: after a taskkill the exe can hold on for more than one wait (COV-MIX3 RESTORE FAILED)
  for (let k = 0; k < RETRIES && r.status !== 0 && /GAME_RUNNING/.test((r.stdout || '') + (r.stderr || '')) && lastGameEnd && Date.now() - lastGameEnd < RETRY_WINDOW_MS; k++) {
    const ms = process.env.EDRUN_RETRY_MS !== undefined ? +process.env.EDRUN_RETRY_MS : 20000;
    console.log(`modswitch: GAME_RUNNING right after our own game closed; waiting ${ms / 1000} s, retry ${k + 1} of ${RETRIES}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    r = go();
  }
  return r;
}

// VOL-N150: is a game on THIS instance running? 'yes' | 'no' | 'unknown' (a game exe whose command line stays unreadable: starting or closing).
// modswitch's own check counts every exe while any command line is unreadable, so another instance's starting game blocked our stale restore.
function ownGameRunning(inst = INST) {
  if (!platform.isWin()) return 'no';
  const ps = "Get-CimInstance Win32_Process | Where-Object { @('as64.exe','mowas_2.exe','as64_ed.exe','mowas_2_ed.exe','mowas_2_workshop.exe') -contains $_.Name.ToLower() } | Select-Object Name,CommandLine | ConvertTo-Json -Compress";
  for (let k = 0; k < 5; k++) {
    let procs = null;
    try { const o = cp.execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 }).trim(); procs = o ? [].concat(JSON.parse(o)) : []; } catch { /* retry */ }
    if (procs) {
      if (procs.some(p => p.CommandLine && new RegExp('(?:^|\\s)-instance\\s+' + inst + '(?:\\s|$)', 'i').test(p.CommandLine))) return 'yes';
      if (!procs.some(p => !p.CommandLine)) return 'no';
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  }
  return 'unknown';
}
// EDRUN-FF (VOL-N150 g04 [V]): a game that crashed to its "Exception" window outlived taskkill /T /F, so the end restore failed and later runs refused.
// After a taskkill or a crash: list the processes named exe whose command line has -instance <inst> (only ours: another instance is never touched),
// kill each by PID (taskkill /F, then Stop-Process -Force), up to 3 rounds 1.5 s apart. -> {killed:[pid], left:[pid]}. opt {list, kill, wait} for tests
function ownProcs(exe) {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='${exe.replace(/'/g, '')}'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
  try { const o = cp.execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000, windowsHide: true }).trim(); return o ? [].concat(JSON.parse(o)) : []; } catch { return null; }
}
const ownLine = (cmd, inst) => !!cmd && new RegExp('(?:^|\\s)-instance\\s+' + inst + '(?:\\s|$)', 'i').test(cmd);
function reapOwn(exe, inst = INST, opt = {}) {
  if (!platform.isWin() && !opt.list) return { killed: [], left: [] };
  const list = opt.list || (() => ownProcs(exe)), wait = opt.wait || (ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms));
  const kill = opt.kill || (pid => {
    platform.killPid(pid);
    cp.spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`], { windowsHide: true });
  });
  const killed = [];
  let left = [];
  for (let k = 0; k < 4; k++) {
    left = (list() || []).filter(p => ownLine(p.CommandLine, inst)).map(p => p.ProcessId);
    if (!left.length || k === 3) break;
    for (const pid of left) { kill(pid); if (!killed.includes(pid)) killed.push(pid); }
    wait(1500);
  }
  return { killed, left };
}
// a run that died before its restore left our list active: put the real list back before taking a new snapshot.
// VOL-N150 [V inst 2]: the snapshot itself held "edrun_test2:0", so every restore brought the entry back and every run took this path:
// strip our own entry from the snapshot once. GAME_RUNNING from modswitch: restore without its global check when our instance has no game.
// returns null when nothing to do or restored, else an error text. opt: { spawn, own } for tests
function staleRestore(G, PROF, SNAP, opt = {}) {
  const re = new RegExp('"' + MOD + ':');
  if (!fs.existsSync(SNAP) || !re.test(fs.readFileSync(PROF, 'latin1'))) return null;
  const snap = fs.readFileSync(SNAP, 'latin1');
  if (re.test(snap)) {
    fs.writeFileSync(SNAP, snap.replace(new RegExp('\\r?\\n[ \\t]*"' + MOD + ':\\d+"', 'g'), ''), 'latin1');
    console.log(`stale restore: snapshot held "${MOD}" itself; entry removed from ${path.basename(SNAP)}`);
  }
  const spawn = opt.spawn || cp.spawnSync, own = opt.own || ownGameRunning;
  let rs = runSwitch(G, ['--restore'], spawn);
  if (rs.status !== 0 && /GAME_RUNNING/.test((rs.stdout || '') + (rs.stderr || ''))) {
    let o = own(INST);
    for (let k = 0; k < 3 && o === 'unknown' && !opt.own; k++) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000); o = own(INST); }
    console.log(`stale restore: modswitch GAME_RUNNING; instance ${INST} game: ${o}`);
    if (o === 'no') rs = runSwitch(G, ['--restore', '--no-proc'], spawn);
  }
  return rs.status === 0 ? null : 'stale restore failed\n' + (rs.stdout || '') + (rs.stderr || '');
}

// EDRUN-3: the test map's files into d (everything but combat.mi, which edrun writes). from = a mod dir that holds multi/edrun_test/map (made by --prep-map, then place-entity <mod> --map multi/edrun_test):
// its `map` file replaces the fixture's, so placed scenery survives the copy. -> the files copied
function copyFixture(d, from) {
  const own = from ? path.join(from, 'resource/map', MAP, 'map') : null, done = [];
  if (own && !fs.existsSync(own)) throw new Error(`--map-from: no ${MAP}/map in ${from}`);
  for (const f of fs.readdirSync(FIX)) {
    if (f === 'combat.mi') continue;
    fs.copyFileSync(f === 'map' && own ? own : path.join(FIX, f), path.join(d, f));
    done.push(f === 'map' && own ? 'map (from --map-from)' : f);
  }
  return done;
}
// --prep-map <mod dir>: lay the test map into <mod dir>/resource/map/multi/edrun_test/ so place-entity can take --map multi/edrun_test (COV-BLD: PLACE_MAP_MISSING).
// writes only there; refuses an existing map file (a placement already made) and any dir under a game's vanilla resource/. combat.mi goes too: place-entity reads the .mi files for the uid space
function prepMap(modDir) {
  const mod = path.resolve(modDir), d = path.join(mod, 'resource/map', MAP);
  if (/[\\/]resource([\\/]|$)/i.test(mod) || fs.existsSync(path.join(mod, 'resource', 'map.pak'))) throw new Error('--prep-map: ' + mod + ' is a game dir or inside a resource/ tree, give a mod folder');
  if (fs.existsSync(path.join(d, 'map'))) throw new Error(`--prep-map: ${path.join(d, 'map')} exists, not overwritten`);
  fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(FIX)) fs.copyFileSync(path.join(FIX, f), path.join(d, f));
  return d;
}

// FIX-EDRUN item 9 (C39R r1-g1: control killed at 68.3 s wall, the 75 s game read it overcap and void): a game's --secs grows to what its slowest
// pair type needs, capped at SECS_MAX; --no-scale-secs keeps --secs as given [I: needs from one game's marks]
const SECS_NEED = { move: 150, control: 150, static: 150, vehicle: 120, gun: 120, infantry: 90 };
function needOf(p) {
  if (p.move) return SECS_NEED.move;
  if (p.control) return SECS_NEED.control;
  if (isStatic(p)) return SECS_NEED.static;
  return SECS_NEED[p.class] || 0;
}
function secsOf(pairs, secs, noScale) {
  if (noScale) return { secs, scaled: false };
  const need = Math.max(0, ...pairs.map(needOf));
  return need > secs ? { secs: Math.min(SECS_MAX, need), scaled: true, asked: secs } : { secs, scaled: false };
}
// FIX-EDRUN item 7: --hold N keeps the game open N wall s after every pair ended (pictures, a look); a crash never holds. -> true: stop polling now
function stopNow(done, crash, doneAt, now, holdS) {
  if (crash) return true;
  if (!done) return false;
  return !(holdS > 0) || (doneAt > 0 && now - doneAt >= holdS * 1000);
}
// SPEED-B3 per-pair give-up: wall s since the pair's order mark past its class cap / the measured ratio + GIVEUP_MARGIN s. Only kill pairs of class vehicle/gun/infantry:
// move, control, static, never and foe-less pairs keep the game open as before (they need SECS_NEED). No measured ratio yet, no order mark or cap none: never. -> true: stop waiting on it
const GIVEUP_MARGIN = 5;
function giveUpOf(p, times, caps, nowS) {
  if (!p.foe || p.move || p.control || p.never || isStatic(p) || p.mark === 'moved') return false;
  const cap = (caps || KILL_CAP)[p.class];
  if (!(cap > 0) || !Number.isFinite(cap)) return false;
  const o = times[p.name + ' order'], sp = speedOf(times);
  if (o === undefined || !sp || !(sp.ratio > 0)) return false;
  return nowS - o > cap / sp.ratio + GIVEUP_MARGIN;
}
// FIX-EDRUN item 4: the loop timed out with the game alive and no start mark: it was still loading (MB-R4 g4b), not a lost mission
function startNote(ch, loads) {
  if (ch.loadTimeout) return `still loading at timeout: no start mark after ${ch.elapsed !== undefined ? (+ch.elapsed).toFixed(0) : '?'} s with the game alive` + (loads ? ` (--load-secs ${loads})` : '') + '; raise --load-secs';
  return 'mission never started (another mission may have loaded: a stack mod has multi/<map>/combat.mi?)';
}

// SPEED-B3 (c39f g14 g19 g52): a noBlast shooter (MG, muzzle_small/minimum/zenite, no prop) logs no muzzle line, so HEALTH lines on hit men are its only fire trace:
// dbg_health 1 goes on for a game that holds one (--pipe without it gets it added). muzzleOf null: unchanged
function pipeExtraOf(pipe, pairs, muzzleOf) {
  const extra = typeof pipe === 'string' ? pipe.split(';').map(s => s.trim()).filter(Boolean) : [];
  if (muzzleOf && !extra.some(c => /^dbg_health\b/i.test(c)) && pairs.some(p => p.foe && !p.move && p.class !== 'infantry' && noBlastOf(p.shooter, muzzleOf).why)) extra.push('dbg_health 1');
  return extra;
}
// SPEED-B3: preflight line for a noBlast shooter against a vehicle or gun foe: the crew sits inside, MG rounds on the hull log nothing, so NOKILL reads fireUnmeasured. -> lines
function mgWarn(run, muzzleOf, label, log = console.log) {
  const out = [];
  if (!muzzleOf) return out;
  for (const p of run) {
    if (!p.foe || p.move || p.class === 'infantry' || foeClass(p) === 'infantry' || isStatic(p)) continue;
    const nb = noBlastOf(p.shooter, muzzleOf);
    if (nb.why) out.push(`preflight MG ${label}${p.name}: shooter ${p.shooter} has ${nb.why} (no muzzle line) vs ${foeClass(p)} foe ${p.foe}: no fire trace unless foe men are hit (HEALTH); a NOKILL reads fireUnmeasured. for fire evidence pair it with an infantry foe`);
  }
  for (const l of out) log(l);
  return out;
}
// SPEED-B3 faults (preflight.faultsIn): HOLD lines; hold true moves the pair to held (status FAULT). r: preflightChunk result, mutated. -> [{name, def, faults}]
function faultHold(r, faultsOf, hold, log = console.log) {
  const hits = [], seen = {};
  for (const p of [...r.run]) {
    const def = p.shooter;
    if (!def || p.class === 'infantry') continue;
    let f = seen[def];
    if (f === undefined) { try { f = seen[def] = faultsOf(def); } catch (e) { f = seen[def] = { unknown: e.message }; } }
    if (!f || !f.faults || !f.faults.length) continue;
    hits.push({ name: p.name, def, faults: f.faults });
    log(`preflight HOLD ${p.name}: ${def} ${f.faults.map(x => x.code + ' ' + x.text).join('; ')}${hold ? '' : ' (runs: pass --hold-faults to hold it back)'}`);
    if (hold) {
      const res = { ...(r.res[p.name] || { warns: [] }), status: 'FAULT', notes: f.faults.map(x => x.code + ' ' + x.text), faults: f.faults };
      r.res[p.name] = res;
      r.held.push({ p, r: res });
      r.run = r.run.filter(q => q !== p);
    } else if (r.res[p.name]) r.res[p.name].faults = f.faults;
  }
  return hits;
}

async function runChunk(ctx, pairs, idx) {
  const { G, ROOT, EXE, OUT, runId, a } = ctx;
  const sc = secsOf(pairs, ctx.SECS, !!a['no-scale-secs']), SECS = sc.secs;
  if (sc.scaled) console.log(`game ${idx}: --secs ${sc.asked} -> ${SECS} for its pair types (move/control/static need more; --no-scale-secs keeps it)`);
  const HOLD = Number(a.hold || 0);
  // --map name: the vanilla map's own files stay in its pak; the test mod holds only the mission over it (multi/<name>/combat.mi)
  const MAPID = ctx.map ? 'multi/' + ctx.map : MAP;
  const d = path.join(G, 'mods', MOD, 'resource/map', MAPID);
  fs.mkdirSync(d, { recursive: true });
  if (!ctx.map) copyFixture(d, ctx.mapFrom);
  fs.writeFileSync(path.join(d, 'combat.mi'), crlf(buildMission(pairs, runId, ctx.mopt)), 'latin1');
  fs.writeFileSync(path.join(G, 'mods', MOD, 'mod.info'), crlf(modInfoOf(ctx.game, MOD)));

  const LOG = path.join(userdir.logDir(INST), 'game.log');
  // the old log may hold an old crash, and the new game overwrites it anyway; earlier games of this run are copied already
  try { fs.rmSync(LOG, { force: true }); } catch { /* still locked: a stale crash shows as a crash at once, not a silent wait */ }
  const t0 = Date.now(), times = {}, pipeLines = [];
  const noPipe = a['no-pipe'] === true;
  const args = startArgs(ctx.game, MAPID, INST, { sound: a.sound, noPipe });
  const p = cp.spawn(path.join(ROOT, EXE), args, { cwd: ROOT, detached: true, stdio: 'ignore' });
  let died = null;
  p.on('exit', c => { died = c === null ? 'signal' : c; });
  p.on('error', e => { died = 'spawn: ' + e.code; });
  const extra = pipeExtraOf(a.pipe, pairs, ctx.muzzleOf);
  let sock = null;
  // the predicate runs from the first connect error on (async), after until/done below exist
  if (!noPipe) pipeTalk(['s_version', ...extra], l => pipeLines.push(l), () => died === null && !done && Date.now() - t0 < until()).then(s => { sock = s; });
  const want = pairs.map(x => x.name);
  const terminal = n => (`${n} kill` in times) || (`${n} gone` in times);   // a never pair also ends here, else it runs to --secs
  let done = false, crash = false, crashInfo = null, lastLen = 0, lastPoll = 0, hungSince = 0;
  const gaveUp = {};
  // stop waiting the moment a crash shows: the game's dialog would sit until --secs otherwise
  const sawCrash = (why, at) => { crash = true; crashInfo = { why, at }; console.log(`CRASH ${((Date.now() - t0) / 1000).toFixed(1)}s pid ${p.pid} inst ${INST}: ${why} ${at}`); };
  // --load-secs L: a slow stack (GoH tree, ~3.5 min to scene init with 3 games loading) gets L more wall seconds; once the mission starts, --secs runs from there
  const LOADS = Number(a['load-secs'] || 0);
  // --hold: the hold runs past --secs (pairs ended, the clock has no more to show), capped at SECS_MAX more
  let doneAt = 0;
  const until = () => 1000 * ('start' in times ? Math.min(times.start + SECS, SECS + LOADS) : SECS + LOADS) + (doneAt && HOLD > 0 ? Math.min(HOLD, SECS_MAX) * 1000 : 0);
  while (Date.now() - t0 < until() && died === null && !stopNow(done, crash, doneAt, Date.now(), HOLD)) {
    await sleep(250);
    if (Date.now() - lastPoll > 4000) {   // a crash the log may not show: the exception window, or a game that stopped answering in the mission
      lastPoll = Date.now();
      const w = windowOf(p.pid);
      if (w && /Exception/i.test(w.title)) { sawCrash('window titled ' + w.title, ''); break; }
      hungSince = w && /not responding/i.test(w.status) && 'start' in times ? hungSince || lastPoll : 0;
      if (hungSince && lastPoll - hungSince > 30000) { sawCrash('not responding for 30 s', ''); break; }
    }
    let t = null;
    try { t = fs.readFileSync(LOG, 'latin1'); } catch { /* not written yet */ }
    if (t !== null && t.length !== lastLen) {
      const fresh = t.slice(Math.max(0, lastLen - 300));
      lastLen = t.length;
      for (const m of parseMarks(t, runId)) if (!(m in times)) { times[m] = (Date.now() - t0) / 1000; console.log(`${times[m].toFixed(1)}s  ${m}`); }
      const hit = crashOf(fresh);
      if (hit) sawCrash(hit.why, hit.at);
    }
    // SPEED-B3: a pair past its class cap with no kill or gone no longer holds the game open (its kill would be overcap anyway); verdicts unchanged
    const nowS = (Date.now() - t0) / 1000;
    for (const q of pairs) if (!(q.name in gaveUp) && !terminal(q.name) && giveUpOf(q, times, ctx.caps, nowS)) { gaveUp[q.name] = +nowS.toFixed(1); console.log(`${nowS.toFixed(1)}s  ${q.name} given up at its class cap`); }
    done = crash || (!ctx.mopt.close && want.every(n => terminal(n) || n in gaveUp));   // --close: the pictures need the whole of --secs
    // after all pairs end, the clock still has to reach its last mark for a speed figure, capped by --secs
    if (done && !crash && !('clock 40' in times) && 'clock 0' in times && (Date.now() - t0) / 1000 < (times['clock 0'] + 42)) done = false;
    if (done && !doneAt) { doneAt = Date.now(); if (HOLD > 0 && !crash) console.log(`${((doneAt - t0) / 1000).toFixed(1)}s  all pairs ended, --hold ${HOLD} s`); }
  }
  const elapsed = (Date.now() - t0) / 1000;
  // FIX-EDRUN item 4: out of time, game alive, no crash, no start mark = still loading
  const loadTimeout = died === null && !crash && !('start' in times) && elapsed * 1000 >= until() - 500;
  let quit = 'exited';
  if (died === null) {
    quit = 'taskkill';
    if (sock && !crash) {
      try { sock.write(JSON.stringify({ id: 900, cmd: 'q' }) + '\n'); } catch { /* pipe gone */ }
      for (let i = 0; i < 32 && died === null; i++) await sleep(250);
      if (died !== null) quit = 'q';
    }
    if (died === null) platform.killPid(p.pid);
  }
  // EDRUN-FF: the Exception window can outlive the taskkill (VOL-N150 g04); after a taskkill or a crash no game of this instance may be left
  let reaped = null;
  if (quit === 'taskkill' || crash) {
    for (let i = 0; i < 8 && died === null; i++) await sleep(250);
    reaped = reapOwn(path.basename(EXE), INST);
    if (reaped.killed.length) console.log(`EDRUN_REAPED: instance ${INST} ${EXE} pid ${reaped.killed.join(',')} alive after ${quit === 'taskkill' ? 'taskkill' : 'the crash'}, killed`);
    if (reaped.left.length) console.log(`EDRUN_REAP_FAILED: instance ${INST} ${EXE} pid ${reaped.left.join(',')} still alive; end it by hand`);
  }
  if (sock) sock.destroy();
  lastGameEnd = Date.now();
  await sleep(2000);
  const logName = `game${idx}.log`;
  let logText = '';
  try { logText = fs.readFileSync(LOG, 'latin1'); fs.copyFileSync(LOG, path.join(OUT, logName)); } catch { /* no log */ }
  for (const m of parseMarks(logText, runId)) if (!(m in times)) times[m] = elapsed;   // written in the last poll gap
  if (crash) crashInfo = crashOf(logText) || crashInfo;   // the frame line may have landed after the first sighting
  if (crash && crashInfo) {
    const le = lastEntityOf(logText);
    crashInfo = { ...crashInfo, lastEntity: le ? le.name : null, lastEntityLogLine: le ? le.line : null };
    console.log(`CRASH last entity in log before it: ${le ? le.name + ' (log line ' + le.line + ')' : 'none named'}`);
  }
  const errors = logText.split(/\r?\n/).filter(l => /unexpected token|edrun_test.*(error|not found)|combat\.mi/i.test(l) && !/story/.test(l)).slice(0, 8);
  // MAP-FIX2 [V]: an unknown --env id only logs "Can't apply environment preset" and runs on engine defaults
  const envFail = (/Can't apply environment preset "([^"]*)"/.exec(logText) || [])[1] || null;
  if (envFail) console.log(`EDRUN_ENV_FAILED: preset "${envFail}" not applied, engine defaults used`);
  return { runId, times, gaveUp, ticks: tickOf(logText, runId), loadTimeout, loadSecs: LOADS, secs: SECS, ...(sc.scaled ? { secsAsked: sc.asked } : {}), ...(HOLD > 0 ? { hold: HOLD } : {}), died, quit, reaped, crash, crashInfo, elapsed, logName, logText, errors, envFail, pipeLines, pipeMissed: noPipe ? [] : pipeMissedOf(extra, pipeLines), speed: speedOf(times) };
}

// preflight of one chunk (EDRUN-2): a pair that fails its range, line or isolate check is held back and gets that status as its verdict; the rest are
// re-checked in their new cells until none fails. -> {run, held:[{p, r}], res}
// a fire pair with no dist runs at its own gun's smallest usable distance, kept preflight.MARGINAL clear of it (TST-100, SILENT-1) but never past the gun's own max range when that is still over the floor. no data, a move, infantry or a control: the DIST table
const AUTO_FLOOR = { vehicle: 120, gun: 100 };
function rangeCap(p, opt, d, min) {
  if (!opt.rangeOf) return d;
  let w;
  try { w = opt.rangeOf(p.shooter); } catch (e) { return d; }
  const u = require('./preflight').UNITS_PER_M;   // max is metres, d and min are units
  return w && !w.unknown && w.max > 0 && d > w.max * u && w.max * u >= min ? Math.floor(w.max * u) : d;
}
function autoDist(p, opt) {
  const minOf = opt.minOf || (opt.rangeOf && opt.rangeOf.minOf);
  if (!minOf || p.dist || !p.foe || p.move || p.control || p.noMinCheck || !AUTO_FLOOR[p.class]) return p;
  let m;
  // FIX-EDRUN item 2: a static is checked at its near face, half wall height (as preflight): the centre dist adds the face offset back
  const stat = p.static === true || p.foeClass === 'static';
  const face = stat ? (p.foeRadius !== undefined ? p.foeRadius : HOUSE_R) + STATIC_FACE_GAP : 0;
  try { m = stat ? minOf(p.shooter, p.foe, undefined, { staticFoe: true, foeAim: p.aimZ !== undefined ? p.aimZ : STATIC_WALL_H / 2 }) : minOf(p.shooter, p.foe); } catch (e) { return p; }
  if (!m || m.unknown || !(m.min > 0)) return p;
  return { ...p, dist: rangeCap(p, opt, Math.max(AUTO_FLOOR[p.class], Math.ceil(m.min * require('./preflight').MARGINAL) + face), m.min + face), distAuto: true };
}
function preflightChunk(chunk, opt) {
  const pf = require('./preflight');
  let run = chunk.map(p => autoDist(p, opt));
  const held = [];
  for (;;) {
    const res = pf.check(run, layout, opt);
    sharedCheck(run, res, opt);
    const bad = run.filter(p => res[p.name].status !== 'OK');
    if (!bad.length) return { run, held, res };
    for (const p of bad) held.push({ p, r: res[p.name] });
    run = run.filter(p => res[p.name].status === 'OK');
  }
}
// EDRUN-16 SHARED: slot 8+k shares sides with slot k, so its shooter is an enemy of k's foe and the other way round. Each of the four units' weapon {range} max
// (the same reader as the range check) against the nearest enemy unit of the twin. A reach holds the later slot back (status SHARED). An unknown range is a warning, as in the range check;
// "def lists no weapon" (a gaz67b foe) reaches nothing. No-op in a game of 8 or fewer: res is untouched.
function sharedCheck(run, res, opt) {
  if (run.length <= MAX_PAIRS) return res;
  const u = require('./preflight').UNITS_PER_M, cache = {};
  const reach = def => { if (!def) return { none: true }; if (!opt.rangeOf) return { unknown: 'no weapon reader' }; if (!(def in cache)) { try { cache[def] = opt.rangeOf(def); } catch (e) { cache[def] = { unknown: e.message }; } } return cache[def]; };
  for (let j = MAX_PAIRS; j < run.length; j++) {
    const b = run[j], a = run[j - MAX_PAIRS], r = res[b.name];
    if (!r || r.status !== 'OK') continue;
    const La = layout(a, j - MAX_PAIRS), Lb = layout(b, j);
    // [who, def, from, to]: the four enemy lines across the twins; a pair with no foe has no foe end
    const lines = [['shooter ' + b.name, b.shooter, Lb.s, a.foe && La.f], ['shooter ' + a.name, a.shooter, La.s, b.foe && Lb.f],
      ['foe ' + b.name, b.foe, b.foe && Lb.f, La.s], ['foe ' + a.name, a.foe, a.foe && La.f, Lb.s]];
    const hits = [], unk = [];
    let near = Infinity;
    for (const [who, def, from, to] of lines) {
      if (!from || !to) continue;
      const d = Math.hypot(from.x - to.x, from.y - to.y);
      near = Math.min(near, d);
      if (opt.off) continue;
      const w = reach(def);
      if (w.none || (w.unknown && /lists no weapon/.test(w.unknown))) continue;
      if (w.unknown || !(w.max > 0)) { unk.push(`${who} (${def}): ${w.unknown || 'no max range'}`); continue; }
      if (d <= w.max * u) hits.push(`${who} ${w.weapon} max ${w.max} m reaches its twin at ${+(d / u).toFixed(1)} m`);
    }
    r.twin = a.name; r.twinDist = +near.toFixed(1);
    if (res[a.name]) res[a.name].twin = b.name;
    if (hits.length) { r.status = 'SHARED'; r.notes.push(`sides shared with ${a.name}: ` + hits.join('; ')); }
    for (const x of unk) r.warns.push(`twin reach unknown (${a.name} shares the sides, ${r.twinDist} units apart): ${x}`);
  }
  return res;
}
const heldRow = ({ p, r }) => ({ name: p.name, class: p.class, shooter: p.shooter, foe: p.foe, order: null, kill: null, shooterDied: false, shooterDiedAt: null, gone: null,
  verdict: r.status, status: r.status, held: true, shots: 0, shotsRead: false, killGameS: null, note: r.notes.join('; '), ...(p.control ? { control: true } : {}), preflight: r });
function pfPrint(label, res, held) {
  for (const [n, r] of Object.entries(res)) if (r.dist !== undefined) console.log(`preflight ${label}${n}: ${r.status} dist ${r.dist}${r.weapon ? ` ${r.weapon} aim ${r.aim} max ${r.max}` : ''}${r.warns.length ? ' | ' + r.warns.join(' | ') : ''}`);
  for (const h of held) console.log(`preflight HELD ${h.p.name}: ${h.r.status} ${h.r.notes.join('; ')}`);
}

function rowsOf(pairs, ch, pf, opt = {}) {
  const blastOn = (ch.pipeLines || []).some(l => /dbg_blast = 1/.test(l));
  const st = shotsOf(ch.logText || '', pairs, blastOn, opt);
  if (st.bad.length) console.log('shots not read, log names do not fit entity numbers: ' + st.bad.slice(0, 4).join('; '));
  const pf_ = proofOf(ch.logText || '', pairs, ch.runId || opt.runId || null);
  const gone = unspawnedOf(ch.logText);
  return pairs.map((p, j) => {
    const marks = {};
    for (const k of Object.keys(ch.times)) if (k.startsWith(p.name + ' ')) marks[k.slice(p.name.length + 1)] = ch.times[k];
    const start = ch.times.start === undefined ? 0 : ch.times.start, rel = {};
    for (const k of Object.keys(marks)) rel[k] = +(marks[k] - start).toFixed(1);
    const sr = st.rows[p.name] || {}, ratio = ch.speed && ch.speed.ratio;
    const tk = ch.ticks || {}, tO = tk[p.name + ' order'], tK = tk[p.name + ' kill'], gameS = typeof tO === 'number' && typeof tK === 'number' ? tK - tO : null;
    // VOL-5F: a gun that logs no muzzle (noBlast) has its bullet hits unlogged too, so its hits 0 is not a measured zero and the instant rule cannot judge it
    const v = verdictOf(rel, !!p.never, { ratio, cls: p.class, caps: opt.caps, hits: sr.noBlast && !sr.hits ? null : sr.hits, parts: sr.parts, gameS });
    if (ch.crash || (ch.times.start === undefined)) { v.verdict = 'ERROR'; v.note = ch.crash ? 'game crashed' + (ch.crashInfo ? ': ' + ch.crashInfo.why + ' ' + ch.crashInfo.at + (ch.crashInfo.lastEntity ? ' (last entity ' + ch.crashInfo.lastEntity + ')' : '') : '') : startNote(ch, ch.loadSecs); }
    const row = { name: p.name, class: p.class, shooter: p.shooter, foe: p.foe, ...v, ...st.rows[p.name], ...(gameS === null ? {} : { gameS }) };
    if (ch.crash || ch.times.start === undefined) { row.counted = false; row.countReason = 'verdict ERROR'; }
    // VOL-FX: kill game s on every row (tick marks, else wall x ratio, null = no kill); shots always a number: 0 when none, shotsRead false when not measured (noBlast, no cvar, infantry, id mismatch)
    row.killGameS = killGameSOf(row, gameS, ratio);
    if (typeof row.shots !== 'number') { row.shots = 0; row.shotsRead = false; } else row.shotsRead = true;
    // SPEED-B3: the stop loop stopped waiting on this pair at its class cap (wall s since the start); verdict unchanged (NOKILL, or a late kill read overcap)
    if (ch.gaveUp && ch.gaveUp[p.name] !== undefined) { row.gaveUp = +(ch.gaveUp[p.name] - start).toFixed(1); if (row.verdict === 'NOKILL') row.note = (row.note ? row.note + '; ' : '') + 'given up at class cap'; }
    if (p.move && !p.foe) { row.counted = null; row.countReason = 'move pair: moved/arrived, not a kill'; }
    if (p.move) { row.moved = rel.moved === undefined ? null : rel.moved; row.arrived = rel.arrived === undefined ? null : rel.arrived; }   // wall s since the start, like order and kill; null: never seen
    if (p.watch) row.damaged = rel.damaged === undefined ? null : rel.damaged;
    if (p.ground) row.ground = rel.ground === undefined ? null : rel.ground;   // game s the backup ground order went out, null: not needed
    if (isStatic(p)) row.destroyed = rel.kill === undefined ? null : rel.kill;   // EDRUN-3: game s the static counted as destroyed (state dead, a part destroyed, or the tag gone)
    // FIX-EDRUN (harness-edrun:124): a fallen probe within 1 s of arm is the foe's own state (an actor such as covb_cow), not a fall: flagged, use foeActor:true
    if (isStatic(p) && rel['probe fallen'] !== undefined && rel.arm !== undefined && rel['probe fallen'] - rel.arm <= 1) { row.fallenAtArm = true; row.note = (row.note ? row.note + '; ' : '') + 'fallen probe true at arm: the foe reads fallen alive (actor?), not a fall; set foeActor:true'; }
    // COV-C06 task pairs: each step's mark (wall s since the start, null: never seen); repair/tow PASS = the task done, not a kill
    if (p.task) {
      row.task = p.task;
      const at = k => (rel[k] === undefined ? null : rel[k]);
      if (p.task === 'repair') Object.assign(row, { damaged: at('damaged'), repairOrder: at('repairorder 0'), repaired: at('repaired') });
      if (p.task === 'tow') Object.assign(row, { linked: at('linked'), gunMoved: at('gunmoved'), towed: at('towed') });
      // aiFired: its own muzzle BLAST line, else a blast, broken part or HEALTH loss on its foe (no one else fires at that foe: it holds fire, columns apart); false only when
      // muzzle lines were read (dbg_blast 1, not a noBlast gun) and none of these came; null = not measured (a noBlast gun with no hit)
      if (p.task === 'aiuse') {
        const hp = (pf_[p.name] || {}).hpBefore > 0, foeHit = row.hits > 0 || !!(row.parts && row.parts.length) || hp;
        row.manned = at('shooterready');
        row.aiFired = row.shots > 0 ? true : foeHit ? true : row.shotsRead && !row.noBlast ? false : null;
        if (row.aiFired) row.aiFireBy = row.shots > 0 ? 'muzzle' : row.hits > 0 ? 'foe blast' : hp ? 'foe hp' : 'foe part';
      }
      if (TASK_NOFOE.includes(p.task)) { row.counted = null; row.countReason = `task ${p.task}: done or not, not a kill`; }
      const why = p.task === 'repair' ? (row.damaged === null ? 'part never read broken: damage not applied (component name? game.log "Component ... not found")' : row.repaired === null ? 'damaged, never repaired' : null)
        : p.task === 'tow' ? (row.linked === null ? 'never linked (attach/linker refused or out of reach)' : row.towed === null ? (row.gunMoved === null ? 'linked, gun never moved' : 'gun moved, never reached the goal') : null)
        : row.manned === null ? (p.selfMan ? 'the AI never manned it (no board order given)' : 'never operatable') : row.aiFired === false ? 'manned, never fired on its own (no muzzle line, no hit)' : row.aiFired === null ? 'fire not measured (noBlast gun, no hit on the foe)' : null;
      if (why && row.verdict !== 'ERROR') row.note = (row.note ? row.note + '; ' : '') + why;
    }
    if (p.enter) row.entered = rel.entered === undefined ? null : rel.entered;   // game s someone was inside the building, null: never seen
    if (pf && pf[p.name] && p.foe) row.preflight = pf[p.name];
    if (p.control) row.control = true;
    // VOL-5F: what says the shooter fired: its muzzle line, a hit logged on the foe, or else "held": held fire until the order, foe read alive by the order row, dead a game second or more after it
    if (row.verdict === 'PASS' && p.foe && !p.never) row.fireProof = row.shots > 0 ? 'muzzle' : row.hits > 0 ? 'hit' : !p.move && !isStatic(p) && gameS >= 1 ? 'held' : null;
    // KILLPROOF: proof by log order (muzzle | damage | hp | deathblast | none); only muzzle, damage and hp (MGPROOF, needs --pipe "dbg_health 1") keep the kill counted
    applyProof(row, p, pf_[p.name], orderLifeOf(p));
    // EDRUN-16: a side twin in the same game (slot j +-8) is an enemy of this foe too, and the log names no killer (no kill feed, no inflictor filter term in game/helper [V grep]).
    // So a kill counts only when this pair's own shooter logged a muzzle line; it cannot rule out a twin's shell landing as well [I]
    const tj = twinIdx(j, pairs.length);
    if (tj !== null) {
      row.twin = pairs[tj].name;
      if (p.foe && !p.move && row.counted && !(row.shots > 0)) { row.counted = false; row.countReason = 'twin in game: own shot not seen'; }
    }
    // REVHARNESS (rev-harness 4): hits counts every foe BLAST line, death and own-ammo blasts too, and blastwave ammo (GoH ports) logs lines vanilla AP does not. hitsLive = the non-death kinds
    // only; still not comparable across mods: use watch damaged marks or parts for hit evidence between mods
    if (typeof row.hits === 'number') row.hitsLive = Object.entries(row.hitKinds || {}).reduce((s, [k, v]) => s + (isDeathKind(k) ? 0 : v), 0);
    // REVHARNESS (rev-harness 6): a free-fire row that shows no engagement at all (muzzle lines read, 0 shots, 0 hits, no part, no HEALTH loss) did not engage: void, not a fail
    const prr = pf_[p.name] || {};
    if (p.freeFire && row.verdict === 'NOKILL' && row.shotsRead && row.shots === 0 && row.hits === 0 && !(row.parts && row.parts.length) && !(prr.hpBefore > 0)) { row.engaged = false; row.note = (row.note ? row.note + '; ' : '') + 'free fire, no shot, hit or damage: void'; }
    // SPEED-B3 (c39f g14 g19 g52): a noBlast shooter's NOKILL with no hit, part or HEALTH loss is not a measured "never fired"
    if (p.foe && !p.move && row.noBlast && row.verdict === 'NOKILL' && !(row.hits > 0) && !(row.parts && row.parts.length) && !(prr.hpBefore > 0)) { row.fireUnmeasured = true; row.note = (row.note ? row.note + '; ' : '') + `MG/noBlast (${row.noBlast}): no fire evidence (no muzzle line, no HEALTH on foe men)`; }
    // REVHARNESS (rev-harness 8): gun foe, default kill "not inhabited": wrecked (a part destroyed or dead, game s) or crew left
    if (p.foe && foeClass(p) === 'gun' && !p.mark) { row.foeWrecked = rel.wrecked === undefined ? null : rel.wrecked; if (rel.kill !== undefined) row.gunKill = row.foeWrecked !== null ? 'wrecked' : 'crew left'; }
    // REVHARNESS (rev-harness 7): which proof logs were on, so controlsOf can tell "not proven" from "not provable"
    if (p.control) row.proofLogs = { blast: blastOn, health: !!opt.hpOn };
    // MB-R1 (harness-edrun:38): the game "can't spawn" the shooter or foe def (bad key, mod not loaded): no test ran, so void (verdict NOSPAWN), never a kill, a fail or a kept control
    const miss = [p.class !== 'infantry' && p.shooter, p.foe && foeClass(p) !== 'infantry' && p.foe].filter(Boolean).map(d => String(d).split('/').pop().toLowerCase()).filter(d => gone.has(d));
    if (miss.length && row.verdict !== 'ERROR') { row.verdict = 'NOSPAWN'; row.counted = false; row.countReason = 'not spawned: ' + miss.join(', '); row.note = (row.note ? row.note + '; ' : '') + "game log: can't spawn entity " + miss.join(', ') + ': void'; }
    if (row.verdict === 'NOORDER' && p.foe) {   // SILENT-1F: game s each term first read true, null = false all game. both true at some time = never together
      const at = k => (rel[k] === undefined ? null : rel[k]), fr = at('foeready'), sr = at('shooterready');
      const foeTerm = 'foe ' + (foeStates(p).ready || 'present'), shTerm = p.class === 'infantry' ? 'shooter present' : 'shooter operatable';
      const falseTerm = fr === null && sr === null ? `${foeTerm}, ${shTerm}` : fr === null ? foeTerm : sr === null ? shTerm : 'none always false: each was true once, not together';
      row.noOrder = { foeReady: fr, shooterReady: sr, falseTerm, foeCrewGone: at('foecrewgone') };
      row.note = `false at the end: ${falseTerm}` + (row.noOrder.foeCrewGone !== null ? `; foe crew all dead at ${row.noOrder.foeCrewGone}` : '');
    }
    return row;
  });
}
// a game with control pairs is void only if none of them passed.
// REVHARNESS (rev-harness 7): a control PASS that is not counted (on-tick, overcap, instant, unproven) does not keep the game: late = slow or overloaded game, unproven = no sign the game's fire
// reached the foe. One exception, weak:true: unproven only because the log that could prove it was off (row.proofLogs: dbg_health for an infantry control, dbg_blast for the rest).
// Rows with no counted field (old reports) keep the verdict rule
function controlsOf(rows) {
  // FIX-EDRUN item 9: the game's other run rows are all move pairs (counted null or a moved field)
  const others = rows.filter(r => !r.control && !/^(OUTOFRANGE|TOOCLOSE|BLOCKED|CROWDED|NOSPAWN|NOUNIT|ERROR)$/.test(r.verdict || ''));
  const moveOnly = others.length > 0 && others.every(r => r.counted === null || r.moved !== undefined);
  const cs = rows.filter(r => r.control).map(r => {
    const c = { name: r.name, verdict: r.verdict };
    if (r.verdict === 'PASS' && r.counted === false) {
      Object.assign(c, { counted: false, countReason: r.countReason });
      const lg = r.proofLogs;
      if (lg && /^unproven/.test(r.countReason || '') && !(r.class === 'infantry' ? lg.health : lg.blast)) c.weak = true;
      // C39R r1-g1: in a move-only game an overcap control still shows the game ran and fired; the move rows count no kill, so a slow kill does not taint them
      if (/^overcap/.test(r.countReason || '') && moveOnly) { c.weak = true; c.weakWhy = 'overcap control in a move-only game'; }
    }
    return c;
  });
  const keeps = c => c.verdict === 'PASS' && (c.counted !== false || c.weak);
  return cs.length ? { controls: cs, void: !cs.some(keeps), ...(cs.some(keeps) && !cs.some(c => keeps(c) && !c.weak) ? { weak: true } : {}) } : { controls: [], void: null };
}
// REVHARNESS (rev-harness 16): a game's rows in pairs-file order (held rows in their own slot, not after the run rows), each with the report.games index (null = every pair held, no game)
function gameOrder(rows, names, game) {
  const at = n => { const i = (names || []).indexOf(n); return i < 0 ? Infinity : i; };
  return rows.map((r, k) => ({ r, k })).sort((a, b) => (at(a.r.name) - at(b.r.name)) || (a.k - b.k)).map(({ r }) => ({ ...r, game }));
}

// lim VFS-56: the shader cache keeps whichever stack compiled a key first, and a white or broken picture then carries to later
// mods. So each mod stack gets its own: shader_cache is this stack's, others wait as shader_cache.stack-<hash>. Nothing is deleted.
// --fresh-cache (COV-L8E, COV-L8J): the key holds no shader source hash, so a shader edit after a stack's first run is not rebuilt. fresh moves this stack's
// live cache aside as shader_cache.fresh-<ms> (nothing deleted) and the game compiles anew
function useStackCache(dir, mods, opt = {}) {
  const key = require('crypto').createHash('sha1').update(mods.join(',').toLowerCase()).digest('hex').slice(0, 10);
  const live = path.join(dir, 'shader_cache'), owner = path.join(dir, 'shader_cache.owner');
  const cur = fs.existsSync(owner) ? fs.readFileSync(owner, 'latin1').trim() : '';
  if (opt.fresh) {
    if (cur === key && fs.existsSync(live)) fs.renameSync(live, path.join(dir, 'shader_cache.fresh-' + Date.now()));
    const saved = path.join(dir, 'shader_cache.stack-' + key);
    if (fs.existsSync(saved)) fs.renameSync(saved, path.join(dir, 'shader_cache.fresh-' + Date.now() + '-saved'));
    if (cur !== key && fs.existsSync(live)) fs.renameSync(live, path.join(dir, 'shader_cache.' + (cur ? 'stack-' + cur : 'unknown-' + Date.now())));
    fs.writeFileSync(owner, key + '\n');
    return { key, swapped: true, fresh: true };
  }
  if (cur === key) return { key, swapped: false };
  if (fs.existsSync(live)) fs.renameSync(live, path.join(dir, 'shader_cache.' + (cur ? 'stack-' + cur : 'unknown-' + Date.now())));
  const saved = path.join(dir, 'shader_cache.stack-' + key);
  if (fs.existsSync(saved)) fs.renameSync(saved, live);
  fs.writeFileSync(owner, key + '\n');
  return { key, swapped: true };
}

// VOL-5F: a run in a --out that already holds a report keeps the old run: report.json -> report.<its run id>.json, game0.log -> game0.<its run id>.log. report.json stays the newest run for every reader. -> the new names
function keepEarlierRun(out) {
  const rep = path.join(out, 'report.json');
  if (!fs.existsSync(rep)) return [];
  let id = null;
  try { id = JSON.parse(fs.readFileSync(rep, 'utf8')).runId; } catch (e) { /* a torn report: named by its time */ }
  if (typeof id !== 'string' || !/^[\w.-]+$/.test(id)) id = 'old' + Math.floor(fs.statSync(rep).mtimeMs).toString(36);
  let sfx = id;
  for (let k = 2; fs.existsSync(path.join(out, `report.${sfx}.json`)); k++) sfx = `${id}-${k}`;
  const moved = [];
  for (const f of fs.readdirSync(out)) {
    const m = f === 'report.json' ? ['report', 'json'] : (/^(game\d+)\.log$/.exec(f) || []).slice(1).concat('log');
    if (m.length !== 2) continue;
    const to = `${m[0]}.${sfx}.${m[1]}`;
    fs.renameSync(path.join(out, f), path.join(out, to));
    moved.push(to);
  }
  return moved;
}

// SPEED-B3 --auto-rerun: a void game (crash, never started, every control failed) -> reason text | null
function voidOf(ch, ctrl) {
  if (ch.crash) return 'crash';
  if (!('start' in ch.times)) return ch.loadTimeout ? 'still loading' : 'never started';
  if (ctrl && ctrl.void) return 'controls void';
  return null;
}
// SPEED-B3: after 2 voids of one layout, the control pairs + 2-3 other pairs per game (the C39T r2-g16 -> x1/x2/x3 split). -> [[pairs]]; one group = no split possible
function splitOnVoid(run) {
  const ctl = run.filter(p => p.control), rest = run.filter(p => !p.control);
  if (rest.length <= 3) return [run];
  const k = Math.ceil(rest.length / 3), out = [];
  let at = 0;
  for (let g = 0; g < k; g++) { const n = Math.floor(rest.length / k) + (g < rest.length % k ? 1 : 0); out.push([...ctl, ...rest.slice(at, at + n)]); at += n; }
  return out;
}
const KNOWN_ARGS = ['game', 'root', 'exe', 'pairs', 'mods', 'secs', 'no-scale-secs', 'load-secs', 'hold', 'out', 'speed', 'fog', 'pipe', 'no-pipe', 'dry', 'inst', 'run-id', 'ratio', 'map', 'no-check', 'check', 'prep-map', 'map-from', 'env', 'close', 'close-dist', 'per-game', 'kill-cap', 'free-fire', 'early-idle', 'view', 'rescore', 'write', 'wp-offset', 'fresh-cache', 'sound',
  'list', 'insts', 'worker', 'auto-rerun', 'hold-faults', 'commit-reserve', 'stagger'];

// one job (a pairs file and its own args): parse, validate, preflight. a dry job writes its missions and returns null. rcache: range readers by game|mods
// T-BOOTFIX: the as64 editor build crashes at ~23 s (fonts) when the stack lacks as64+. On an as64*.exe, prepend it and say so.
// Classic exes (mowas_2*) do not load as64+ (an as64 mod): the list stays as given. -> { list, note }
function withAs64Plus(list, exe) {
  const isAs64 = /^as64/i.test(path.basename(String(exe || '')));
  if (!isAs64 || list.some(m => m.split(':')[0].toLowerCase() === 'as64+')) return { list, note: null };
  return { list: ['as64+', ...list], note: `NOTE: --mods lacks as64+, which the as64 editor build needs (it crashes at load without it): as64+ prepended (${['as64+', ...list].join(',')})` };
}

function prepareJob(a, rcache) {
  if (a['map-from'] !== undefined && (typeof a['map-from'] !== 'string' || a.map)) usage('--map-from needs a mod folder and cannot be used with --map');
  let pairs;
  try { pairs = JSON.parse(fs.readFileSync(a.pairs, 'utf8')); } catch (e) { usage('bad pairs file: ' + e.message); }
  // EDRUN-FF: --free-fire makes every fire pair free fire; pair key freeFire:true does it for one pair
  if (Array.isArray(pairs)) pairs = freeFireAll(pairs, !!a['free-fire']);   // VOL-FF: --free-fire leaves control pairs under order (5 of 13 voided otherwise); a control with its own freeFire:true still gets it
  // EDRUN-16 --per-game N: pairs per game, default 8 (as before); 9..16 makes slots 9-16 share sides with slots 1-8 (SHARED preflight, twin rows)
  const PER = a['per-game'] === undefined ? MAX_PAIRS : Number(a['per-game']);
  if (!(Number.isInteger(PER) && PER >= 1 && PER <= PER_GAME_MAX)) usage(`--per-game is 1..${PER_GAME_MAX}`);
  const errs = validate(pairs, !!a.map, PER);
  if (errs.length) { for (const e of errs) console.error(e); process.exit(2); }
  if (a.map !== undefined && (typeof a.map !== 'string' || !a.game)) usage('--map needs a map name (e.g. 1v1_reloading_point) and --game');
  const speed = a.speed || 'very_fast';
  if (!SPEEDS.includes(speed)) usage('bad --speed');
  if (a.fog !== undefined && !/^[01]$/.test(a.fog)) usage('--fog is 0 or 1');
  const caps = killCapOf(a['kill-cap']);
  if (typeof caps === 'string') usage(caps);
  const SECS = Number(a.secs || 240);
  if (!(SECS > 0 && SECS <= SECS_MAX)) usage(`--secs must be 1..${SECS_MAX}`);
  if (a['load-secs'] !== undefined && !(Number(a['load-secs']) >= 0 && Number(a['load-secs']) <= 600)) usage('--load-secs must be 0..600');
  if (a['auto-rerun'] !== undefined && !(Number.isInteger(Number(a['auto-rerun'])) && Number(a['auto-rerun']) >= 0 && Number(a['auto-rerun']) <= 9)) usage('--auto-rerun is 0..9');
  const OUT = path.resolve(a.out || path.join(R, '../run/edrun'));
  fs.mkdirSync(OUT, { recursive: true });
  const runId = typeof a['run-id'] === 'string' ? a['run-id'] : 'r' + Date.now().toString(36) + (rcache.jobNo ? 'j' + rcache.jobNo : '');
  rcache.jobNo = (rcache.jobNo || 0) + 1;
  let ratio;
  if (a.ratio !== undefined) {
    ratio = Number(a.ratio);
    if (!(ratio >= 1 && ratio <= 20)) usage('--ratio is 1..20 (game seconds per wall second, via a mission Quant block; default off, --speed applies)');
  }
  if (a.env !== undefined && (typeof a.env !== 'string' || !/^[\w\/.-]+$/.test(a.env))) usage('--env needs an environment id such as goh/multi/1v1_ladoga/var1');
  const mopt = { speed, fog: a.fog, ratio, env: a.env };
  if (a['wp-offset']) mopt.wpOffset = true;   // ground waypoint {offset GROUND_UP}: newer exe only
  if (a['free-fire']) mopt.freeFire = true;
  // CAM-1: only with --close does mopt carry a close key
  if (a.close !== undefined) {
    if (typeof a.close !== 'string' || !a.close) usage('--close needs a pair name');
    if (!pairs.some(p => p.name === a.close)) usage(`--close: no pair named ${a.close}`);
    const dist = a['close-dist'] === undefined ? CLOSE_DIST : Number(a['close-dist']);
    if (!(dist > 0)) usage('--close-dist must be a number over 0');
    mopt.close = { name: a.close, dist };
  } else if (a['close-dist'] !== undefined) usage('--close-dist needs --close');
  if (a.view !== undefined) {
    const v = typeof a.view === 'string' ? a.view.split(',').map(Number) : [];
    if (!(v.length === 6 || v.length === 7) || v.some(x => !Number.isFinite(x))) usage('--view needs ex,ey,ez,lx,ly,lz[,fov]');
    mopt.close = { view: v };
  }
  const GAME = gateGame(a), VEXE = vfsExeOf(GAME);
  const as64p = withAs64Plus((typeof a.mods === 'string' ? a.mods.split(',').map(s => s.trim()).filter(Boolean) : (GAME === 'as64' ? ['as64+'] : [])).filter(m => m !== MOD), a.exe || 'as64_ed.exe');
  if (as64p.note) console.log(as64p.note);
  const modList = as64p.list;
  const chunks = [];
  let mapTerrain = null;
  for (let i = 0; i < pairs.length; i += PER) chunks.push(pairs.slice(i, i + PER));
  // --map: pairs without x,y get a flat clear spot on that vanilla map (tools/edrun/mappick.js); a map with none refuses, exit 3
  if (a.map) {
    try {
      const mp = require('./mappick').load(a.game, a.map, modList.length || GAME !== 'as64' ? modList : ['as64+']);
      chunks.forEach((c, i) => { console.log(`map ${a.map} (${mp.pak}) game ${i}: spots`); chunks[i] = require('./mappick').place(mp, c, { log: console.log }); });
      mapTerrain = (s, f) => require('./mappick').lineCheck(mp, s, f);   // MB-R9: preflight line of sight on the map heights (harness-edrun:94)
    } catch (e) { console.error(e.message); process.exit(3); }
  }
  mopt.map = a.map;
  // EDRUN-2 preflight: range (weapon range from the shooter def), clear line, isolate. --no-check skips all of it; a dry run reads the weapon ranges only with --check (the index takes ~8 s)
  const pfOpt = {};
  if (!a['no-check']) {
    if (a.game && (!a.dry || a.check)) {
      try { pfOpt.rangeOf = rcache.reader(a.game, modList, VEXE); }
      catch (e) { console.log('preflight: weapon ranges not readable (' + e.message + '); range check becomes a warning'); }
    }
    if (mapTerrain) pfOpt.terrain = mapTerrain;
  } else pfOpt.off = true;
  // SILENT-1F: the shot count reads the shooter's muzzle prop, also with --no-check. no reader: shotsOf treats it as before
  let muzzleOf = pfOpt.rangeOf ? pfOpt.rangeOf.muzzleOf : null;
  if (!muzzleOf && a.game && !a.dry) {
    try { muzzleOf = rcache.reader(a.game, modList, VEXE).muzzleOf; }
    catch (e) { console.log('shots: muzzle props not readable (' + e.message + ')'); }
  }
  // SPEED-B3 static unit-fault hold (faults.js): printed as HOLD; --hold-faults holds the pair back (verdict FAULT), else it runs
  const faultOf = pfOpt.rangeOf && pfOpt.rangeOf.faultsOf ? pfOpt.rangeOf.faultsOf : null;
  const plan = chunks.map((c, i) => {
    if (pfOpt.off) return { run: c, held: [], res: {}, names: c.map(p => p.name) };
    const r = preflightChunk(c, pfOpt);
    if (faultOf) faultHold(r, faultOf, !!a['hold-faults']);
    pfPrint(chunks.length > 1 ? `game ${i} ` : '', r.res, r.held);
    if (pfOpt.rangeOf) mgWarn(r.run, pfOpt.rangeOf.muzzleOf, chunks.length > 1 ? `game ${i} ` : '');
    return { ...r, names: c.map(p => p.name) };
  });
  if (a.dry) {
    plan.forEach((pl, i) => { if (pl.run.length) fs.writeFileSync(path.join(OUT, `combat${i}.mi`), crlf(buildMission(pl.run, runId, mopt)), 'latin1'); });
    console.log(`dry: ${chunks.length} mission(s) in ${OUT}`);
    // game parity: under MoW:AS2 the dry run shows the editor start line and the mod.info the run would use (as64 prints as before)
    if (GAME !== 'as64') {
      console.log(`start (${GAME}): ${a.exe && /\.exe$/i.test(a.exe) ? a.exe : ED_EXE[GAME]} ${startArgs(GAME, a.map ? 'multi/' + a.map : MAP, INST).join(' ')}  [no pipe: speed and muzzle reads off; T: first real run]`);
      console.log(`mod.info (${GAME}): ${modInfoOf(GAME, MOD).replace(/\n\s*/g, ' ').trim()}`);
    }
    return null;
  }
  const G = a.game, ROOT = a.root || G, EXE = a.exe && /\.exe$/i.test(a.exe) ? a.exe : ED_EXE[GAME];
  if (!G) usage('--game needed');
  if (!fs.existsSync(path.join(ROOT, EXE))) { console.error('no exe ' + path.join(ROOT, EXE)); process.exit(3); }
  const mods = [...modList];
  if (!mods.includes(MOD)) mods.push(MOD);
  // COV-MIX4 [V]: a stack mod's own multi/<map>/combat.mi wins over ours and the mission never arms ("mission never started"); loose files only, paks not read [I]
  // COV-MIX6C [V]: also without --map: a --prep-map / --map-from mod keeps multi/edrun_test/combat.mi, which replaces ours the same way
  const miMap = a.map || MAP.slice('multi/'.length);
  const stackMi = mods.filter(m => m !== MOD).map(m => path.join(G, 'mods', m.split(':')[0], 'resource/map/multi', miMap, 'combat.mi')).filter(f => fs.existsSync(f));
  // MB-R8 (harness-edrun:98): --prep-map leaves combat.mi in the mod (place-entity needs it); --map-from reads only that mod's map file, so the mod need not be in --mods
  const fromHint = a['map-from'] && stackMi.some(f => path.resolve(f).toLowerCase().startsWith(path.resolve(a['map-from']).toLowerCase() + path.sep)) ? '; the --map-from mod need not be in --mods (only its map file is read), drop it from --mods' : '';
  if (stackMi.length) { console.error(`EDRUN_MAP_MISSION: ${stackMi.join(', ')} would replace edrun's mission; move it out of the mod (map-clone copies it) and rerun${fromHint}`); process.exit(3); }
  return { a, plan, caps, SECS, OUT, runId, mopt, muzzleOf, pfOpt, speed, G, ROOT, EXE, mods, GAME, reruns: Number(a['auto-rerun'] || 0) };
}

// run one prepared job's games; writes its report.json (optionsRestored pending: the restore runs once at the end of the list). -> report
async function runJob(J) {
  const { a, plan, caps, SECS, OUT, runId, mopt, muzzleOf, pfOpt, G, ROOT, EXE, mods, speed } = J;
  const ctx = { G, ROOT, EXE, SECS, OUT, runId, a, mopt, caps, muzzleOf, map: a.map, mapFrom: a['map-from'] ? path.resolve(a['map-from']) : null, game: J.GAME || 'as64' };
  const earlierRun = keepEarlierRun(OUT);
  if (earlierRun.length) console.log(`--out holds an earlier run, kept as ${earlierRun.join(', ')}`);
  const report = { runId, exe: EXE, inst: INST, map: a.map || null, mods, secs: SECS, speedAsked: speed, fog: a.fog === undefined ? 'base' : a.fog, ...(earlierRun.length ? { earlierRun } : {}), ...(a['kill-cap'] !== undefined ? { killCap: a['kill-cap'] } : {}), ...(mopt.freeFire ? { freeFire: true } : {}), ...(EARLY_IDLE ? { earlyIdle: true } : {}), ...(J.reruns ? { autoRerun: J.reruns } : {}), ...(a.list ? { list: path.resolve(a.list) } : {}), games: [], pairs: [], ...(J.reruns ? { reruns: [] } : {}) };
  const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  let gameNo = 0;
  try {
    for (const [i, pl] of plan.entries()) {
      const heldRows = pl.held.map(heldRow);
      if (!pl.run.length) { console.log(`game ${i}: every pair held by preflight, no game`); report.pairs.push(...gameOrder(heldRows, pl.names, null)); continue; }
      // SPEED-B3 --auto-rerun N: a void game runs again (same layout), up to N more games for this chunk; the 2nd void of a layout splits it (control + 2-3 pairs a game)
      const queue = [{ pl, voids: 0, split: false, label: String(i) }], seenCtl = new Set();
      let budget = J.reruns, heldDone = false;
      while (queue.length) {
        const it = queue.shift(), g = gameNo++;
        const ch = await runChunk(ctx, it.pl.run, g);
        const extraHeld = it.split ? it.pl.held.map(heldRow) : [];
        const hp = !heldDone ? heldRows : [];
        const gameRows = gameOrder([...rowsOf(it.pl.run, ch, it.pl.res, { ...(muzzleOf ? { muzzleOf } : {}), caps, hpOn: (ch.pipeLines || []).some(l => /dbg_health = 1/.test(l)) }), ...hp, ...extraHeld], pl.names, report.games.length), ctrl = controlsOf(gameRows);
        if (ch.pipeMissed && ch.pipeMissed.length) console.log(`EDRUN_PIPE_MISSED game ${g}: no reply to ${ch.pipeMissed.join('; ')} (pipe never opened or closed early); proofs needing them read unproven`);
        if (ctrl.controls.length) console.log(`game ${g} control: ${ctrl.controls.map(k => k.name + ' ' + k.verdict).join(', ')}; ${ctrl.void ? 'VOID' : 'counts'}`);
        const gameEntry = { log: ch.logName, seconds: +ch.elapsed.toFixed(1), ...(ch.secsAsked !== undefined ? { secs: ch.secs, secsAsked: ch.secsAsked } : {}), ...(ch.loadTimeout ? { loadTimeout: true } : {}), exit: ch.died, stoppedBy: ch.quit, crash: ch.crash, crashInfo: ch.crashInfo, speed: ch.speed, ...ctrl, errors: ch.errors, ...(ch.envFail ? { envFailed: ch.envFail } : {}), ...(ch.reaped && (ch.reaped.killed.length || ch.reaped.left.length) ? { reaped: ch.reaped } : {}), ...(ch.pipeMissed && ch.pipeMissed.length ? { pipeMissed: ch.pipeMissed } : {}), ...(Object.keys(ch.gaveUp || {}).length ? { gaveUp: ch.gaveUp } : {}), ...(J.reruns ? { layout: it.label } : {}), pipe: ch.pipeLines, marks: Object.fromEntries(Object.entries(ch.times).map(([k, v]) => [k, +v.toFixed(1)])) };
        const why = J.reruns ? voidOf(ch, ctrl) : null;
        if (why && budget > 0) {
          budget--;
          it.voids++;
          report.reruns.push({ layout: it.label, why, game: gameEntry, pairs: gameRows.map(r => ({ ...r, game: null })) });
          const groups = it.voids >= 2 && !it.split ? splitOnVoid(it.pl.run) : null;
          if (groups && groups.length > 1) {
            console.log(`EDRUN_AUTO_RERUN game ${g} (layout ${it.label}): void (${why}) twice, split into ${groups.length} games of control + ${groups.map(x => x.filter(p => !p.control).length).join('/')} pairs; ${budget} rerun(s) left`);
            groups.reverse().forEach((grp, k) => {
              const sub = pfOpt.off ? { run: grp, held: [], res: {} } : preflightChunk(grp, pfOpt);
              queue.unshift({ pl: { ...sub, names: pl.names }, voids: 0, split: true, label: `${it.label}.s${groups.length - 1 - k}` });
            });
          } else {
            console.log(`EDRUN_AUTO_RERUN game ${g} (layout ${it.label}): void (${why}), run again; ${budget} rerun(s) left`);
            queue.unshift(it);
          }
          continue;
        }
        if (why) gameEntry.voidKept = why;
        heldDone = true;
        report.games.push(gameEntry);
        // a split layout repeats its control pairs: the first game's control rows stand in pairs[], the rest only in their games[].controls
        report.pairs.push(...gameRows.filter(r => !(r.control && it.split && seenCtl.has(r.name))));
        for (const r of gameRows) if (r.control) seenCtl.add(r.name);
      }
    }
  } catch (e) { report.failed = String(e && e.stack || e); write(); throw e; }
  report.optionsRestored = null;   // set after the list's one restore
  write();
  return report;
}

async function main() {
  const cli = argsOf(process.argv.slice(2));
  if (cli['prep-map'] !== undefined) {   // EDRUN-3: no pairs, no game
    if (typeof cli['prep-map'] !== 'string') usage('--prep-map needs a mod folder');
    try { console.log('test map laid in ' + prepMap(cli['prep-map']) + '; next: node tools/place-entity/place-entity.js <that mod> --game G --map multi/edrun_test --entity <def> --pos x,y ; then edrun --map-from <that mod>'); return; }
    catch (e) { console.error(e.message); process.exit(3); }
  }
  if (cli.list !== undefined && cli.pairs !== undefined) usage('--list and --pairs: give one');
  if (cli.insts !== undefined && cli.list === undefined) usage('--insts needs --list (a run list)');
  if (cli.worker && !process.send) usage('--worker is internal to --insts');
  if (cli.list === undefined && !cli.pairs) usage('--pairs needed');
  if (cli.rescore !== undefined) {   // KILLPROOF: re-score a finished run dir by the proof rule, no game (tools/edrun/rescore.js)
    if (typeof cli.rescore !== 'string' || !fs.existsSync(path.join(cli.rescore, 'report.json'))) usage('--rescore needs a run dir with report.json');
    await null;   // module.exports is set after main() returns its promise; rescore.js requires it
    const r = require('./rescore').rescoreDir(cli.rescore, cli.pairs, { perGame: cli['per-game'] === undefined ? undefined : Number(cli['per-game']), freeFire: !!cli['free-fire'], write: !!cli.write });
    const t = r.rescore.totals;
    console.log(`rescore ${cli.rescore}: counted kills ${t.oldKills} -> ${t.newKills}, proof ${JSON.stringify(t.proof)}, after order ${t.expired}${r.rescore.notes.length ? ' | ' + r.rescore.notes.join('; ') : ''}`);
    for (const l of summaryLines(cellSummary(r.pairs))) console.log(l);
    return;
  }
  const multi = require('./multi');
  let jobs = [cli];
  if (cli.list !== undefined) { try { jobs = multi.jobsOf(cli, KNOWN_ARGS); } catch (e) { usage(e.message); } }
  // a list: every pairs file parsed and validated before any switch, so a bad later line cannot stop the list after modswitch with no restore
  if (jobs.length > 1) for (const [k, j] of jobs.entries()) {
    let ps;
    try { ps = JSON.parse(fs.readFileSync(j.pairs, 'utf8')); } catch (e) { usage(`list job ${k}: bad pairs file: ${e.message}`); }
    const PER = j['per-game'] === undefined ? MAX_PAIRS : Number(j['per-game']);
    const errs = validate(Array.isArray(ps) ? freeFireAll(ps, !!j['free-fire']) : ps, !!j.map, PER);
    if (errs.length) { for (const x of errs) console.error(`list job ${k}: ${x}`); process.exit(2); }
  }
  // game parity: GoH and a --pipe under MoW:AS2 refuse before anything is read; a MoW:AS2 run that is not --dry refuses too (TST-19: no -instance)
  for (const j of jobs) { const g = gateGame(j); if (g === 'mowas2' && !cli.dry) games.refuse('edrun', 'mowas2', ...MOWAS2_RUN); }
  const rcache = { readers: {}, reader(game, mods, exe) { const k = game + '|' + mods.join(',') + (exe ? '|' + exe : ''); return this.readers[k] || (this.readers[k] = require('./preflight').makeRangeReader(game, mods, exe ? { exe } : {})); } };
  // the game and its editor are Windows programs started directly here: other systems stop with exit 2 (--dry needs no game)
  if (!cli.dry && !platform.requireWin('running games in the editor (edrun)')) return;
  // SPEED-B3 --insts: the parent runs no game; each worker takes jobs from it under the commit gate
  if (cli.insts !== undefined && !cli.dry) {
    const insts = multi.instsOf(cli.insts);
    if (typeof insts === 'string') usage(insts);
    const reserve = cli['commit-reserve'] === undefined ? 1500 : Number(cli['commit-reserve']), stagger = cli.stagger === undefined ? 12 : Number(cli.stagger);
    if (!(reserve >= 0) || !(stagger >= 0)) usage('--commit-reserve MB and --stagger s are numbers >= 0');
    process.exit(await multi.parallel(__filename, process.argv.slice(2), insts, jobs, { reserve, stagger: stagger * 1000 }));
  }
  if (cli.dry) { for (const j of jobs) prepareJob(j, rcache); return; }
  const shared = jobs[0];
  const G = shared.game;
  if (!G) usage('--game needed');
  const profs = userdir.profiles(INST);
  if (profs.length !== 1) { console.error(`instance ${INST}: ${profs.length} profiles, need one`); process.exit(3); }
  const PROF = profs[0], SNAP = PROF + '.edrun';
  // the first job is prepared before the switch (a bad pairs file stops here, nothing switched); later jobs are prepared as they come
  const nextJob = cli.worker ? multi.askJob : (() => { let k = 0; return async () => (k < jobs.length ? k++ : null); })();
  let k0 = await nextJob();
  if (k0 === null) { console.log('no job for this instance'); process.exit(0); }   // a worker's ipc channel would keep it alive
  let J = prepareJob(jobs[k0], rcache);
  const stale = staleRestore(G, PROF, SNAP);
  if (stale) { console.error(stale); process.exit(3); }
  fs.mkdirSync(path.join(G, 'mods', MOD), { recursive: true });
  if (!fs.existsSync(path.join(G, 'mods', MOD, 'mod.info'))) fs.writeFileSync(path.join(G, 'mods', MOD, 'mod.info'), crlf(modInfoOf(J.GAME, MOD)));
  const sw = runSwitch(G, ['--set', J.mods.join(',')]);
  if (sw.status !== 0) { console.error('modswitch\n' + sw.stdout + sw.stderr); process.exit(3); }
  useStackCache(path.resolve(PROF, '../../..'), J.mods.filter(m => m !== MOD), { fresh: !!shared['fresh-cache'] });
  const before = fs.readFileSync(SNAP);
  const reports = [];
  let failed = null;
  try {
    for (;;) {
      if (jobs.length > 1) console.log(`job ${k0} of ${jobs.length}: ${path.basename(jobs[k0].pairs)} -> ${J.OUT}`);
      reports.push({ out: J.OUT, report: await runJob(J) });
      k0 = await nextJob();
      if (k0 === null) break;
      J = prepareJob(jobs[k0], rcache);
    }
  } catch (e) { failed = e; }
  await sleep(1000);
  const rs = runSwitch(G, ['--restore']);
  const now = fs.readFileSync(PROF);
  const restored = rs.status === 0 && Buffer.compare(now, before) === 0;
  if (rs.status !== 0) console.error('RESTORE FAILED\n' + rs.stdout + rs.stderr);
  for (const { out, report } of reports) { report.optionsRestored = restored; if (jobs.length > 1) report.restoredOncePerList = true; fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  if (failed) { console.error(failed); process.exit(3); }
  for (const { report } of reports) {
    const speedTxt = report.games.map(g => (g.speed ? `${g.speed.ratio}x` : '?')).join(', ');
    console.log(table(report.pairs, speedTxt));
    for (const l of summaryLines(cellSummary(report.pairs))) console.log(l);
    console.log(`options restored: ${report.optionsRestored}; games: ${report.games.map(g => `${g.seconds}s ${g.stoppedBy}`).join(', ')}${report.reruns && report.reruns.length ? `; void games rerun: ${report.reruns.length}` : ''}`);
  }
  process.exit(reports.every(({ report }) => report.pairs.every(r => r.verdict === 'PASS')) && restored ? 0 : 1);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(3); });
module.exports = { giveUpOf, GIVEUP_MARGIN, splitOnVoid, voidOf, KNOWN_ARGS, pipeExtraOf, mgWarn, faultHold, noBlastOf, secsOf, needOf, SECS_NEED, stopNow, startNote, staticAimOf, early2Of, EARLY_ORDER2, reorderOf, STATIC_REORDER, INF_FACE, pipeTalk, pipeMissedOf, earlyOf, earlyIdleOf, EARLY_ORDER, gameOrder, totalOf, edgeOf, PASS_BAR, unspawnedOf, isDeathKind, healthLine, proofOf, applyProof, wilson, cellSummary, summaryLines, orderLifeOf, orderRepeatsOf, ORDER_TIME, freeFireAll, killGameSOf, freeFireOf, FREE_DIST, reapOwn, ownLine, killCapOf, keepEarlierRun, tickOf, lastEntityOf, entityIds, blastLines, shotsOf, controlsOf, useStackCache, crashOf, windowOf, validate, layout, distOf, preflightChunk, DIST, foeClass, foeStates, playersBlock, entities, triggers, buildMission, parseMarks, verdictOf, countedOf, rowsOf, moveTo, moveOf, KILL_CAP, speedOf, table, COUNT, MAX_PAIRS, PER_GAME_MAX, CELLS, CELLS2, TWIN_CELL, cellOf, twinIdx, sharedCheck, runSwitch, staleRestore, ownGameRunning, MOD, markGameEnd: ms => { lastGameEnd = ms; }, isStatic, copyFixture, prepMap, FIX, PREPARE, TASKS, TASK_NOFOE, taskErr, taskRows, withAs64Plus, startArgs, modInfoOf, gateGame, ED_EXE };
