---
name: mow-mod-start
description: Start a new mod for Men of War Assault Squad 2 (mowas2), its 64-bit build AS64 (as64) or Gates of Hell (goh). Load when the user says "make a mod", "new mod folder", "empty mod", "mod.info", "MinGameVersion", "MaxGameVersion", "load order", "enable my mod", "activate my mod", "mod does not show in the list", "mod not loading", "mod dropped out of the list", "game will not start after I added a mod", "pak or loose files", "which file wins", "my file is ignored", "Require", "Delete", ".pat", "patch file", "as64+", "Classic or Enhanced", "Workshop folder", "subscribed mod", "where is the mods folder", "where is the profile", "options.set", "file name rules".
---

# mow-mod-start: router (read ONE sub-file, the row that fits)

Always:
- game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh` · newmod/gen `--target as64|mowas2|goh`. Not said = ask; default as64. G = AS2 install (as64 and mowas2 share it), H = GoH install, `<mod>` = the folder the user named
- game installs, vanilla data, other people's mods: read-only. Write only inside `<mod>` (GoH: a folder outside H). Every MCP write tool previews unless `write: true`
- text files CRLF; string values UTF-8, identifiers ASCII; vanilla cp1251 comment bytes stay. Paks are zip
- a clean check is static. Done = the game ran it and game.log was read (→ skill `mow-mod-test`)
- tools: node only, run from the repo root; never `tools/test-all.sh` for mod work. A row id (VFS-01) reads with MCP `mow_limit` `ids` �

| sub-task | read | tools |
|---|---|---|
| where the game, mods folder, profile and log are | `game-folders.md` | `mow_game_status`, `mow_game_diff` |
| make the empty mod folder | `new-mod-folder.md` | `mow_mod_new`, newmod |
| write or repair mod.info, its keys | `mod-info.md` | `mow_mod_info`, modinfo |
| version range, the version gate | `version-range.md` | `mow_mod_info`, modinfo |
| as64: Classic or Enhanced, `as64+`, `as64/core` | `classic-enhanced.md` | `mow_mod_info`, `mow_mods_enable`, modswitch |
| switch the mod on or off | `enable-mod.md` | `mow_mods_enable`, modswitch |
| mod not in the list, not applied, game will not start | `mod-not-showing.md` | `mow_mod_check`, `mow_game_log`, modinfo `--all` |
| order of several mods, `Require` | `load-order.md` | `mow_game_status`, vfs |
| which copy of a file the game reads | `which-file-wins.md` | `mow_file_which`, `mow_mod_diff`, vfs, overdiff |
| pak or loose files, what mounts in a mod | `paks-vs-loose.md` | `mow_mod_pack`, packer |
| remove or rename a game file: `N.pat`, `.patch`, `Delete` | `patches-delete.md` | `mow_mod_info`, `mow_file_which`, vfs |
| Workshop layout, subscribed mods, dev copy | `workshop-layout.md` | `mow_game_status`, workshop |
| file names, encoding, line ends, skipped files | `names-encoding.md` | `mow_mod_check`, vfs `--names` |
| first change in the new mod, then check | `first-change.md` | `mow_mod_gen`, `mow_mod_check`, gen |

Next skills: units → `mow-mod-units` · guns, armour → `mow-mod-weapons-damage` · text, icons → `mow-mod-text-ui` · errors → `mow-mod-check-fix` · two mods at once → `mow-mod-together` · pack, publish → `mow-mod-share` · run it → `mow-mod-test` · another game → `mow-games`, `mow-mod-port`.

Depth (only when a sub-file is not enough):
- guide: MCP `mow_guide` (`chapter` = 03-mod-folder-and-load-order, 04-vfs-paks-patches, p01-first-mod, r01-mod-info-and-folder; `search` = words)
- GoH: MCP `mow_lookup` (`web: goh`) �

Tell the user: the folder made and its files; target game and mode (Classic / Enhanced / GoH range); how it is enabled and how to undo; the check result as static only; that the first in-game run is still to do.
