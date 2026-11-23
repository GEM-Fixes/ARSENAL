# mow-mod-check-fix: write the patch mod and re-check with it

when: the user said yes to a fix plan. Result = a NEW patch mod folder loaded after the mod; the mod itself is untouched.

## Steps
1. MCP `mow_mod_fix` (`mod`, `out` = new patch folder, `game`, same `only` / `mods` as the plan, `write: true`). `out` must be inside a folder listed in env `ARSENAL_WRITE_ROOTS` and never inside a game's `resource` or `packages`; a refusal says so in plain words
2. CLI `node tools/fix/fix.js <mod> apply --out <patch mod> [--game G] [--mods deps] [--only ..] [--target as64|classic|mowas2|goh] [--exe ..] [--set file:path=value] [--json f]`
3. re-check WITH the patch: MCP `mow_mod_check` (`mod`, `with` = the patch folder) · CLI `node tools/check/check.js <mod> --with <patch>`
   `--with` stages the patch as the next `N.pat` and applies its Delete rows, so the order equals a mod loaded later
4. compare before → after per code: crash-class count must drop, no new code. what the patch holds: MCP `mow_mod_diff` (`mod` = the patch folder)
5. GUI: Mods tab > Check & Fix: apply writes the patch folder, then check again with it
6. enable mod, then patch, in that order: MCP `mow_mods_enable` (`mods` in load order; launch kind: needs `ARSENAL_ALLOW_LAUNCH=1`, ask the user first, it edits their profile; `dry: true` shows what it would write; `restore` puts the old list back)
   CLI dry first: `node tools/modswitch/modswitch.js --game dir [--exe as64|mowas_2|mowas2|goh] [--set a,b | --restore] [--write]`
7. run it and read the log (→ skill `mow-mod-test`; MCP `mow_game_log`)

## What the patch mod holds
- only the fixed files (full copies where the engine needs a whole file) and a mod.info
- undo = remove it from the mod list and delete the folder. nothing else was written
- a second round: delete the patch and apply anew; do not hand-edit generated files and then apply over them

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| patch mode | same mode as the mod (Classic or Enhanced): one of each can not run together (VFS-48) | legacy range holding 3.262 | GoH range holding 1.067; folder outside H (writeguard) |
| text | `.lng` | `.lng` | `.pot` merge |

## Silent fails
- VFS-15 / VFS-17 without `Require` the order of two mods is not guaranteed; `Require` matches the name part only and the mod must be in the list
- VFS-26 a patch folder is a mod: only `resource/`, `resource.pak`, `N.pat`, `localization*` mount; PREFLIGHT_PATCH_UNMOUNTED names a patch file that would not mount
- VFS-41 the patch's full copy of a file hides later edits of other mods to it
- KEY-01 a loose `.patch` in a mod root is not read
- TST-22 a fresh `-instance N` profile has an empty mod list: mod listed, not mounted
- ENG-26 a patch of the wrong mode is "not applied" and the game crashes at startup

## Verify
- check with `--with`: verdict LOADS_STATIC, crash class 0 reachable
- in game with mod + patch enabled: the match starts, the fixed things are seen (names, units, map), game.log has no fatal (→ skill `mow-mod-test`)
- say "static clean, untested" until that run
