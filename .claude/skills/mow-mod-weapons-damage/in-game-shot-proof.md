# mow-mod-weapons-damage: prove a change with shots in game

when: before calling any gun, shell or armour change done; "does the simulator match the game"; a result the user doubts. Simulator numbers are a prediction [I] until this is run.
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2`. Launch tools need env `ARSENAL_ALLOW_LAUNCH=1` and the user's yes; without it give the user the steps.

## Steps
1. static first: `node tools/check/check.js <mod> [--exe as64,mowas2,goh]` (no crash-class finding) and the prediction: MCP `mow_matchup` (`gun`, `ammo`, `target`, `range`, `mod`)
2. plan a table of shots: `node tools/armorsim/ingame/shottable.js plan <unit> --weapons W[:ammo],.. --range M [--faces front,rear,left,right] [--aim body,turret] [--game G] [--mods a,b] [--folder MOD] [--samples 400] [--seed 1] [--wait 20] [--exe as64|mowas_2] --out DIR`
   it writes the predicted table into DIR and prints the editor steps for the user (which unit to place where, what to fire)
3. run it: the user does the editor steps, or with launch allowed: MCP `mow_mods_enable` (`mods`, `dry: true` first), `mow_game_start` (`map`, `mode`, `mods`, `dry: true` first) (→ skill `mow-mod-test` for the loop)
4. compare: `node tools/armorsim/ingame/shottable.js compare DIR --log <game.log>` (predicted against seen, per face and weapon)
5. read the run: MCP `mow_game_log` (`log`, `prev`, `limit`) · a crash: `mow_game_crash` (`log`); a picture of the result: `mow_game_shot` (launch kind)
6. GUI: Models tab > Armour for the predicted side; Test tab pages for the run (list with `gui_pages`); jobs with `gui_jobs`

## How to make a shot test mean something [V]
- use multiplayer test mode or the editor: the difficulty armour factor is 1 there; single-player difficulty scales armour, health and accuracy
- fixed stand and angle: the same gun, the same plate, the same distance. a close stand (6 to 12 m) reads the FIRST knot of the penetration table (DMG-28)
- pass or fail of a plate is deterministic: one clear shot is enough for that. what follows a pierce (crew kill, fire, knock-out) is chance by shell class: count over many shots
- judge a kill by "crew left the vehicle" (`not inhabited`), not by hull colour: hull-red follows the shell class, not the margin (DMG-27); a killed vehicle shows all parts damaged while seated crew may read full health (DMG-26)
- console helpers: `v_bulletPath 1` (path and bounces), `dbg_interactionEvent 1` (events), `dbg_blast 1` (blast energy per volume), `dbg_health 1` (soldier damage)
- HE and blast: the wave moves at 15 m/s and judges the target when it arrives (DMG-21): wait before reading the result
- thrown weapons: test under 50 m (lim PORT-141)
- a marginal case (about 10 percent) can differ from the prediction through real model geometry, the exit face or skirts

## Per game
| game | note |
|---|---|
| as64 | full loop; control pipe for a scripted run (→ skill `mow-mod-test`) |
| mowas2 | shottable `--exe mowas_2`; no test command-line flags (lim TST-19), game.log is cut at each start: copy it before the next run |
| goh | shottable and armorsim do not serve GoH; test by hand in the GoH editor and read its log; every GoH note of this skill is [I] until then |

## Silent fails
- TST-22 a fresh `-instance N` profile has an empty mod list: the mod is listed but not mounted, the test shows vanilla values
- VFS-01 another enabled mod that ships the same weapon or def file later in the order wins: check with MCP `mow_file_which` (`path`, `mods`)
- MIS-15 rank lock is ignored in test mode: buying the unit there says nothing about rank
- a clean log is not proof the shot hit the plate you meant: look at the bullet path

## Verify / tell the user
- which shots were tried (gun, shell, range, face), how many, predicted against seen
- what is still [T]: anything only simulated, any GoH claim, any chance outcome with few trials
