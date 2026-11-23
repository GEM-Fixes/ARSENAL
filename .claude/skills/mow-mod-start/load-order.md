# mow-mod-start: order of several mods, `Require`

when: "load order", "which mod goes first", "my mod must load after X", "Require". Clashes between two finished mods → skill `mow-mod-together`.

## Steps
1. the order now: MCP `mow_game_status` (enabled mods in load order)
   CLI `node tools/vfs/vfs.js G --exe as64|mowas_2|mowas2|goh --profile <options.set> -q` (problems as findings: MOD_UNKNOWN, MOD_REQUIRE_MISSING, DEP_CYCLE, MOD_VER_GATE, MOD_MODE)
2. try an order without touching the profile: `node tools/vfs/vfs.js G --exe as64 --mods a,b,c shadowed --list` (which files each mod hides from the layers before it)
   one file: MCP `mow_file_which` (`path`, `mods` in load order) → `which-file-wins.md`
3. make the order hold: add `{Require "other_folder"}` to the mod that must come later (→ `mod-info.md`); both must then be in the active list
4. set the list in that order: MCP `mow_mods_enable` (`mods`, `dry: true` first) · CLI modswitch (→ `enable-mod.md`)
   GUI: Share tab > Share > Mods together shows the order and its clashes (see skill `mow-mod-together`)

## Facts
- base game first, then (as64) `as64/core`, then `as64+` when listed, then each active mod in list order: LATER overrides EARLIER, whole file, no merge (VFS-01)
- the list is re-sorted before applying: by the number of `Require` lines, then a mod is placed once all it requires are placed. Mods with the same count keep whatever the sort leaves: not guaranteed on as64 (VFS-15)
- `Require "folder"` or `"folder:ver"`: only the name part is compared; the named mod must be installed and in the list (VFS-17)
- the game writes the sorted, cleaned list back to options.set: dropped lines disappear from it
- inside ONE mod: `resource.pak`, then `resource/`, then `1.pat, 2.pat ..`, then `localization.pak`, then `localization/` (vfs/mount) → `paks-vs-loose.md`
- a map's own `mod/` folder is laid over `resource/` while that mission runs and beats every active mod until the scene closes (VFS-33)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| independent mods | order not guaranteed: declare `Require` | same | ordered by `Priority` (default 1), higher number applies later and wins; equal Priority keeps a fixed order (GHVFS-25, GHVFS-36 [V]) |
| built-in first layer | `as64+` always before player mods (VFS-47) | none | none |
| `Priority` key | ignored silently | ignored silently | read |
| tools | vfs, conflicts take the order given | `--exe mowas_2` keeps the version gate | `--exe goh`; order as given [I], not run in game |

## Silent fails
- VFS-15 two mods with no `Require` between them: the winner can differ between PCs (conflicts code MOD_ORDER_UNDECLARED)
- VFS-16 a `Require` cycle: `Dependency test error!`, the whole list is dropped
- VFS-17 a `Require`d mod left out of the list: this mod is skipped with a dependency warning only
- VFS-41 the later mod's copy of a game file drops what the earlier mod added to that file: units or cards vanish, no error
- VFS-33 a mission overlay hides a mod's change for that match only: "works on other maps"
- a GoH mod moved to AS2 loses `Priority`: order of independent mods may change

## Verify
- vfs `shadowed --list` shows the intended winner for the files both mods ship
- in game: activate in that order, restart, check one thing from each mod; MCP `mow_game_log` shows no dependency warning (→ skill `mow-mod-test`)
