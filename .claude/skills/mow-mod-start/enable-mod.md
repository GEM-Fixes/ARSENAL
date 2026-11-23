# mow-mod-start: switch the mod on or off

when: "enable my mod", "activate", "turn mods off", "put the list back". For a full test run with the list set and restored → skill `mow-mod-test` (enable-mods.md).

## Steps
1. the list now: MCP `mow_game_status` (enabled mods in load order, game running or not)
   CLI `node tools/modswitch/modswitch.js --game <dir> [--exe as64|mowas_2|goh] [--profile <options.set>] --json`
2. ask the user first: the list lives in THEIR profile (`profiles/<id>/options.set`, outside the mod folder)
3. set it: MCP `mow_mods_enable` (`mods` = folder names in load order, `dry: true` answers the plan and starts nothing; `restore: true` puts back the list from before the first change; `force` writes a mode-mismatched set). Launch kind: refused without env `ARSENAL_ALLOW_LAUNCH=1`, `dry` works without it
   CLI `node tools/modswitch/modswitch.js --game <dir> [--exe as64|mowas_2|goh] --set a,b` (dry: prints the plan) then add `--write`; back: `--restore --write`
   more: `--bak <file>` own snapshot · `--export <file>` / `--import <file>` list as JSON · `--inst N` the `-instance N` profile · `--seed N [--mods a:0,b:0]` copy the main profile to instance N (as64 only)
4. by hand: in game Options > Mods, move the mod to Activated, Apply
   GUI: Play tab > test profile card (routes `run testprofile`, `run testprofile-seed`) for the test copy's list
5. one mod under test only: other active mods can override its files

## Facts
- `{options .. {mods "name:ver" "name:ver"}}`; text left of `:` = folder name, compared exactly with the lower-cased folder: write lower case. Right of `:` = patch count, a gate only (VFS-14)
- list order = mount order: EARLIER is overridden by LATER (after the `Require` sort → `load-order.md`)
- Apply = wipe `resource/` and remount everything (VFS-28): slow with big mods; a loose file added to the mod shows only after Apply
- modswitch: default dry; `--write` refuses while the game runs (the game rewrites options.set on Apply and exit), keeps the first original as `options.set.modswitch.bak`

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| list | must be one mode: `as64+` first for Enhanced mods (→ `classic-enhanced.md`); modswitch refuses a mismatch (MOD_MODE) | no modes; same profile folder as as64 | profile in the GoH user folder; entries may be written back without `:number` |
| instances | `--inst N`, `--seed` | refused: no `-instance` (TST-19) | refused: one user folder (GHVFS-13) |
| Workshop mod name in the list | its normalized title (VFS-53) | folder under `mods/` | `mod_<item number>` |
| folder name | free | free | checked: MOD_NAME_GOH (GHVFS-27) |
| running check | as64.exe | mowas_2.exe | call_to_arms.exe, call_to_arms_ed.exe |

## Silent fails
- VFS-12 / VFS-13 a capital letter or a renamed folder: the line loads nothing, log `Mod '<line>' was disabled: Not installed.`, the line is dropped from options
- VFS-14 `name:2` with only `1.pat` in the folder: mod dropped, no warning. A new `.pat` in an active mod: activate again so the number matches
- VFS-17 a `Require`d mod missing from the list: this mod skipped
- VFS-18 game update: the list is emptied
- TST-22 `-instance N` starts with an empty list: seed it
- ENG-26 mode-mismatched list on as64 = startup crash, not a refusal

## Verify
- `mow_game_status` shows the list as set; after a run MCP `mow_game_log` has no `was disabled` line
- in game: Options > Mods "Activated" holds the mod; a change of the mod is seen (→ skill `mow-mod-test`)
- undo told to the user: `restore: true` / `--restore --write`
