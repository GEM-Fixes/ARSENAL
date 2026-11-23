# mow-play-trouble: check things without starting the game
When: the person cannot or does not want to start the game, or before telling them to.

## What to ask which tool
| question | MCP | CLI |
|---|---|---|
| is the install and build what we think | `mow_game_status {game}` | `node tools/exever/exever.js` (exit 1 = a new build) |
| which mods are on, stale lines, AS64 mode mix-ups | `mow_game_status {game}` | `node tools/modswitch/modswitch.js --game <dir> --exe <game>` |
| would this mod load | `mow_mod_check {game, mod}` | `node tools/wouldload/wouldload.js <modDir> --exe as64,mowas2,goh` |
| is its `mod.info` sound | `mow_mod_info {game, mod}` | `node tools/modinfo/modinfo.js <mod> --exe <game>` |
| every `mod.info` in the mods folder | `mow_mod_info {game}` | `node tools/modinfo/modinfo.js --all <mods dir> --exe <game>` |
| everything about one mod | `mow_mod_check {game, mod, full: true}` | `node tools/check/check.js <mod> --exe as64,mowas2,goh` · `node tools/doctor/doctor.js <mod folder> --game <dir> --exe <game>` |
| which copy of a file wins | `mow_file_which {game, path, mods}` | `node tools/vfs/vfs.js <gameDir> --exe <game> --mods a,b which <path>` |
| do two mods fight | `mow_mods_clash {game, mods}` | `node tools/conflicts/conflicts.js --game <dir> --mods a,b --exe <game>` |
| do two players have the same files | `mow_mp_sync {action: "compare", a, b}` | `node tools/mpsync/mpsync.js --compare a.json b.json` |
| the last run's log and crash | `mow_game_log {game}`, `mow_game_crash {game}` | `node tools/logtriage/logtriage.js --exe <game>` |
| settings and keys | `mow_settings_info {game}` | `node tools/keyprof/keyprof.js --file <keys.set> --list` |

## GUI
Mods > Check & Fix > Check (`run check`), Read Game.log. `gui_open {page: "check"}`.

## Per game
Every tool here serves all three games (`game` / `--exe`). Not for GoH: the armour simulator and `as2 install`. A tool that cannot serve a game answers `na` with the reason.

## What goes wrong
- LOADS_STATIC taken as "works": it means nothing was found by reading; only a run proves it.
- the quick check passed, the full check not run: say which one ran.
- a check on the `mods/` copy while AS64 loads the Workshop item. LOG-17

## Check
Each answer names the folder and game it read; they are the ones the person plays.
