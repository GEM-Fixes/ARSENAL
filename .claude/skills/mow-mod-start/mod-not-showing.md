# mow-mod-start: mod not in the list, not applied, or the game will not start

when: "mod does not show", "mod not loading", "nothing changes in game", "mod dropped out of the list", "game closes at start since I added a mod". For a crash later in a match → skill `mow-mod-check-fix`; for a player's PC → `mow-play-trouble`.

## Steps
1. static verdict: MCP `mow_mod_check` (`mod`, `game`; `full: true` for every linter): REFUSED / LIKELY_CRASH / LOADS_STATIC and the worst findings
   CLI `node tools/wouldload/wouldload.js <modDir> --exe as64,mowas2,goh` · `node tools/check/check.js <mod> --fast`
2. every mod.info in the folder (one bad file stops all): `node tools/modinfo/modinfo.js --all <G/mods>`
3. what the game said: MCP `mow_game_log` (last run; `prev: true` the run before) · list as the game holds it: `mow_game_status`
   GUI: Mods tab > Check & Fix > Read Game.log > "Why is my mod not in the list?" and "What the game has switched on" (routes `logs/modwhy`, `logs/enabled`)
4. match the symptom below, fix, run again

## Symptom → cause (guide p01, 03 pitfalls;
| symptom | cause | row | fix |
|---|---|---|---|
| not in Options > Mods at all | no file named exactly `mod.info` in the folder; folder not directly under `mods/` | vfs/mods [V] | → `new-mod-folder.md` |
| in the list, can not be activated / skipped | version range empty or not holding the game version | VFS-19 | → `version-range.md` |
| as64: listed, not applied | Classic mod in Enhanced list or the reverse | VFS-48 | → `classic-enhanced.md` |
| as64: game closes before the menu | mode mismatch or version refusal at startup | ENG-26, VFS-59 | take it out of the list (`modswitch --restore --write`) |
| game closes at start with ANY list | one broken mod.info somewhere in `mods/` or the Workshop (stray `"` in Desc) | ENG-24, VFS-49 | modinfo `--all`, fix that file |
| log: `was disabled: Not installed.` | folder renamed, or capitals in the options line | VFS-12, VFS-13 | activate again, lower case |
| log: dependency warning | a `Require`d mod missing or not in the list | VFS-17 | add it before this mod |
| whole list gone | `Require` cycle; or the game was updated | VFS-16, VFS-18 | break the cycle; activate again |
| activated, nothing changes | file path under `resource/` is not exactly the game's path; file beside `resource/` in the mod root; loose folder that sorts before its pak | VFS-26, VFS-08 | → `which-file-wins.md`, `paks-vs-loose.md` |
| activated, my fix never loads | a `mods/` copy of a subscribed Workshop item | VFS-51 | → `workshop-layout.md` |
| `-instance N` run shows no mod | fresh instance profile has an empty list | TST-22 | seed it (→ `enable-mod.md`) |
| activated, units lost entries | the mod's copy replaced a whole game file | VFS-01, VFS-41 | → `which-file-wins.md` |

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| all rows; a Workshop item loads in place from the Steam folder | no mode rows; game.log is truncated at start (copy it before the next run); Min above 3.262 is skipped [I] | folder name with a space, `-` or other signs is skipped, only a `game.log` warning `invalid mod folder name` (GHVFS-27); a broken mod.info skips that mod only (`failed to load mod`); `resource.pak` / `localization/` in the mod root are not read (GHVFS-04); bad range: list says "not up to date" (PORT-46) |

## Silent fails
- VFS-20 a mod.info key typo; VFS-21 a `Delete` path without `resource/`; VFS-14 the `:ver` gate: none of them writes a message
- anything a mod does not ship loads from vanilla with no log marker (vfs/order [V]): "no error" is not "applied"
- VFS-30 a start with `-no_mods` (safe mode) skips every mod

## Verify
- wouldload says LOADS_STATIC for the target exe (static, not run)
- in game: the mod is Activated after a restart; one visible change of the mod is seen; game.log read (→ skill `mow-mod-test`)
