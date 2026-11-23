# mow-mod-together: load order, Require, why order flips

when: "which mod goes first", "which mod wins", a result differs between two PCs, or MOD_ORDER_UNDECLARED / CONFLICT_MOD_NOT_LOADED shows.

## Steps
1. the order in use now: MCP `mow_game_status` (`game`): enabled mods in load order
   CLI `node tools/modswitch/modswitch.js --game G [--exe as64|mowas_2|goh]` (default = show, dry) · `node tools/vfs/vfs.js G [--exe as64|mowas_2|mowas2|goh] --profile options.set` (problems as findings: MOD_REQUIRE_MISSING, DEP_CYCLE, MOD_MODE)
2. each mod's Require and range: MCP `mow_mod_info` (`mod` = full path) · CLI `node tools/modinfo/modinfo.js <mod dir> [--exe ..]`
3. decide the order: the mod whose changes must survive goes LAST. a patch mod goes after everything it merges
4. make the order hold on every PC: the later mod (or the patch mod) lists the earlier ones in mod.info `Require`. patchmod writes a mod.info with Require on every merged mod, so it loads last
5. check for undeclared order: MCP `mow_mods_clash` (`mods` in the order meant) → MOD_ORDER_UNDECLARED = two mods hold different bytes for one file and no Require chain joins them, one line per mod pair
   CLI `node tools/conflicts/conflicts.js --game G --mods a,b [--exe ..] --mods-only`
6. set the list: MCP `mow_mods_enable` (`mods` in load order, `dry: true` first; launch kind) → enable-and-test.md
7. GUI: Mods tab shows the list and order; Share tab > Share page > Mods together takes the mods in the order picked

## Facts
- base game first, then each active mod in list order; later mod overrides earlier, whole file, no merge (VFS-01 [V])
- the game sorts the list by dependencies; the sort is unstable on equal sizes, so two independent mods have no guaranteed order (VFS-15 [V])
- `Require` = name part only (the folder name, lower case), and the required mod must be in the list (VFS-17 [V])
- mod identity = folder name lower-cased; mod.info `Name` is the shown title only. the list line is compared exactly against the lower-cased folder: capitals never match [V]
- precedence is never decided by file time stamps [V]
- a mission with its own `mod/` folder lies over every listed mod while it runs (VFS-33 [V])

## Per game
| game | note |
|---|---|
| as64 | built-in `as64+` is always first when listed (Enhanced); a mods/ folder named `as64+` is dropped; player mods always override it (VFS-47). a subscribed Workshop item loads in place from the Steam folder, its `mods/<Name>` copy is ignored (VFS-51) |
| mowas2 | no `as64+`, no modes; the Workshop copy under `mods/<Name>/` is recreated clean: local edits to a subscribed mod are overwritten (VFS-31) |
| goh | stable sort by Require count, then mod.info `Priority` ascending: higher Priority applies later and wins (GHVFS-25 [V]); folder names with a space or special characters never load (GHVFS-27) |

## Silent fails
- VFS-15 order of two independent mods can flip between PCs: declare Require
- VFS-17 a Require on a mod that is not in the list: warning, the mod is skipped
- VFS-16 a Require cycle drops the whole list
- VFS-63 twin folder names: the later never loads, no log line
- VFS-61 a mod folder outside `<game>/mods` is never seen by the game (tools can read it by path, the game can not)
- TST-22 a fresh `-instance N` profile has an empty mod list: listed in the main profile, not mounted in the instance

## Verify
- `mow_game_status` after enabling shows the list in the meant order; game.log has no `was disabled` line for any of them
- `mow_file_which` (`path` of one clashing file, `mods`) names the mod meant to win → which-file-wins.md
