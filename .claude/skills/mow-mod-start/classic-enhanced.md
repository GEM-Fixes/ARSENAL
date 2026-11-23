# mow-mod-start: as64 Classic or Enhanced mode, `as64+`, `as64/core`

when: "as64+", "Classic or Enhanced", "my old mod does nothing on AS64", "game stops at start after I enabled a mod" on as64. Not a topic for mowas2 or goh (table below).

## Steps
1. which mode the list is in and which kind each mod is: MCP `mow_game_status` (enabled mods in order; `as64+` listed = Enhanced) and `mow_mod_info` (`mod`: its range)
   CLI `node tools/modswitch/modswitch.js --game G --exe as64 --json` (problems carry MOD_MODE) · `node tools/vfs/vfs.js G --exe as64 --mods a,b -q` (finding MOD_MODE)
2. make the list one kind: MCP `mow_mods_enable` (`mods` in load order, `dry: true` first; launch kind, needs `ARSENAL_ALLOW_LAUNCH=1`; ask the user, it edits their `options.set`)
   CLI `node tools/modswitch/modswitch.js --game G --exe as64 --set as64+,mymod` (dry) then `--write`; a mismatched set is refused unless `--force`
3. turn a legacy mod into an Enhanced one (a COPY, the old mod stays): MCP `mow_mod_upgrade` (`mod`, `out`, `game: as64`; preview unless `write: true`)
   CLI `node tools/upgrade/upgrade.js <modDir> --to as64 --plan` then `--out dir [--mode classic|enhanced]`
   GUI: Mods tab > Mods > Upgrade or Port

## Facts (guide 03 section 4; lim VFS-46, VFS-47, VFS-48 [V])
| | Classic mode (`as64+` not listed) | Enhanced mode (`as64+` listed) |
|---|---|---|
| legacy mod (Min below 3.301) | loads | skipped |
| modern mod (Min 3.301 or higher) | skipped | loads |
| version rule | data version within [Min, Max] | program version at least Min; Max ignored |
- `as64+` = built-in mod in `G/as64/plus/`, always placed before every player mod: any mod overrides its files, it can not be moved above them. A folder named `as64+` in `mods/` is dropped
- `as64/core` = a layer mounted after the game and before mods in every mode (shader and `.lng` overrides): tools need `--exe as64` to see it
- a mod may `Require "as64+"`; mode words `"as64"`, `"legacy"` are not folders (VFS-50)
- how the in-game menu switches Enhanced on is not described (unconfirmed): the mode follows whether `as64+` is in the active list

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| all of the above | no `as64+`, no `as64/core`, no modes: the version range alone decides; modswitch warns WARN_MOWAS2_NO_PLUS, WARN_MOWAS2_VERSION (Min above 3.262 is skipped [I]) | no modes and no `as64+`; `Require "as64+"` probably counts as missing, a folder of that name is skipped (GHVFS-27) |

## Silent fails
- VFS-48 a mod of the wrong kind in the list is not applied, no window
- ENG-26 [V live] at startup that same mismatch writes "made for X mode: not applied" before fonts load: fatal "Unable to determine fallback font", the game never reaches the menu
- VFS-54 one Classic and one Enhanced mod can not both mount in one list: upgrade the classic one first
- VFS-47 a mod can not reorder itself below `as64+`
- a mod loose under `as64/` is not a mod: only `mods/` and the Workshop are scanned

## Verify
- modswitch `--json` has no MOD_MODE problem; vfs prints the mod as mounted
- in game: the menu appears, the mod is Activated, game.log has no "not applied" line (MCP `mow_game_log`; → skill `mow-mod-test`)
- game does not start after a mode change: `node tools/modswitch/modswitch.js --game G --restore --write`, or fix the mod's `MinGameVersion`
