---
name: mow-mod-together
description: Make two or more mods work at the same time in Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "use two mods together", "mod conflict", "mods clash", "compatibility patch", "merge mods", "which mod wins", "load order of my mods", "one mod breaks the other", "units of mod A vanish with mod B", "names show as raw keys with both mods", "buy menu lost units with two mods", "define not found with two mods", "Classic and Enhanced mod together", "Require between mods", "a mod deletes another mod's file", "same mods but out of sync", "clean copies of game files out of a mod".
---

# mow-mod-together: two or more mods at once (router)

Read ONE sub-file for the sub-task at hand; each stands alone. Files sit beside this one.
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. G = game install, `a,b` = mod folder names in load order (later wins).

## Always
- both mods are read-only (not the user's own files unless said so). the answer is a THIRD mod: a patch mod in a new or empty folder the user names, loaded last
- game installs + vanilla data read-only; no patch folder inside a game's own `resource` or `packages` (GoH: outside the install)
- written text: CRLF, UTF-8 strings, ASCII identifiers
- override is by whole file, last mod wins, nothing is merged (lim VFS-01 [V]): every clash follows from that
- a patch mod is [T] until the game ran the whole stack and game.log was read (→ skill `mow-mod-test`)
- MCP write tools preview unless `write: true`; launch tools need `ARSENAL_ALLOW_LAUNCH=1` and the user's yes

## Sub-task → file → tools
| sub-task | read | tools |
|---|---|---|
| does each mod load alone on this game | load-alone.md | `mow_mod_check`, `mow_mod_info`, check.js |
| list the clashes of a mod list | find-clashes.md | `mow_mods_clash`, conflicts.js |
| what a clash code means, what to do | clash-codes.md | `mow_limit`, q.js |
| names or texts raw / wrong with both mods | text-clashes.md | `mow_mods_clash`, `mow_text_find`, patchmod.js |
| units, cards, squads vanish from the buy menu | set-table-clashes.md | `mow_mods_clash`, `mow_mod_diff`, patchmod.js |
| "define not found", macro changed by the other mod | macro-clashes.md | `mow_mods_clash`, conflicts.js, sdllint.js |
| both mods change the same unit, gun or entity name | same-unit-clashes.md | `mow_mods_clash`, `mow_entity_info`, `mow_unit_stats` |
| models, textures, sounds, shaders both ship | binary-clashes.md | `mow_mods_clash`, `mow_file_which` |
| which order, Require, why the order flips | load-order.md | `mow_mod_info`, `mow_game_status`, vfs.js |
| which copy of one file the game reads | which-file-wins.md | `mow_file_which`, vfs.js |
| a mod deletes a file the other needs | deleted-files.md | `mow_mods_clash`, `mow_mod_info`, modinfo.js |
| one Classic and one Enhanced mod (as64) | classic-enhanced-mix.md | `mow_mod_info`, `mow_mod_upgrade`, `mow_mods_enable` |
| build the patch mod that keeps both sides | patch-mod.md | `mow_mods_patch`, patchmod.js |
| check the stack again with the patch | check-the-stack.md | `mow_mods_clash`, `mow_mod_check` |
| breaks only when loaded together; the GUI way | joint-view.md | conflicts.js `--joint`, `gui_pages`, `gui_call` |
| dead weight: copies identical to the game | dead-weight.md | conflicts.js `--itm` / `--clean` |
| multiplayer: same files for every player | multiplayer-sync.md | `mow_mp_sync`, mpsync.js |
| enable the stack and prove it in game | enable-and-test.md | `mow_mods_enable`, `mow_game_start`, `mow_game_log` |

## Usual walk
load-alone → find-clashes → the clash kind's file → patch-mod → check-the-stack → enable-and-test; multiplayer-sync before sharing.

## Depth
- a row: MCP `mow_limit` (`ids`) · CLI; words:; topic:
- a real case: · GoH: · per-game facts: MCP `mow_game_diff`
- neighbours: `mow-mod-check-fix` (one mod's own errors), `mow-mod-share` (pack, release), `mow-mod-start` (mod.info), `mow-play-trouble` (a player's crash). assets: see skill mow-mod-models-effects; scripts: mow-mod-scripts; RobZ Realism: mow-robz

## Tell the user
- the load order to use, and why (who needs to be last)
- clashes by kind with counts; which were merged, which needed a pick and what was picked, which can not be merged (binary)
- the patch mod folder; that the two mods were not touched; undo = remove the patch from the list
- seen in game or still [T]; for multiplayer, that everyone needs the whole stack in the same order
