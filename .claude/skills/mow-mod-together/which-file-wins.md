# mow-mod-together: which copy of one file the game reads

when: "which mod wins for this file", "is my change even loaded", or a clash line needs a second opinion.

## Steps
1. MCP `mow_file_which`: `path` as the game sees it (`resource/set/...` or `set/...`), `mods` = folder names in `<game>/mods` in load order, `game`. Answers the winning source (game pak, loose file or mod) and the copies it shadows
2. CLI `node tools/vfs/vfs.js G [--exe as64|mowas_2|mowas2|goh] --mods a,b which <virtual path>` (winner + full shadow chain; `G` may be `-` with `--exe`: that game's install; `--profile options.set` = the list the player has now)
   every file of earlier layers the stack hides: `node tools/vfs/vfs.js G --exe .. --mods a,b shadowed --list`
3. per key, not per file: MCP `mow_mod_diff` (`mod` = full path, `mods` = mods loaded before it, `file`, `keys: true`) · CLI `node tools/overdiff/overdiff.js <mod folder> [--game dir] [--mods a,b] [--exe ..] [--summary]`
4. an entity by name (which def wins, include chain): MCP `mow_entity_info` (`names`, `mods`) · CLI `node tools/entityindex/entityindex.js <gameDir|-> [--exe ..] [--mods a,b] [name...]`
5. a text key: MCP `mow_text_find` (`key`, `mod`)
6. GUI: Mods tab (mod files); Share tab > Share page > Mods together names the winner per clash

## Rules that decide
- last registered wins the whole file; anything a mod does not ship loads from the game with no log marker (VFS-01 [V])
- inside one layer: loose vs pak and pak vs pak ties go by directory scan order, later NAME wins, never by time stamp (VFS-08 [V]). `entity` sorts before `entity.pak` so the pak beats the loose folder; `set/` sorts after `gamelogic.pak` so loose `set/` wins [I derived]
- inside a mod: `resource.pak`, then `resource/`, then `N.pat`, then localization; loose always beats `resource.pak` (VFS-55 [V])
- names are lower-cased and `\` = `/`: two files differing only by case are one file (VFS-02)
- mod.info `Delete` runs before the mod's own files mount; a `.patch` delete runs after them (VFS-22, VFS-23)
- duplicate `.def` name in two folders: first wins, the later logs `Entity redefinition` (ENG-04): the opposite of the file rule
- textures: extension order beats mod order (FMT-04)

## Per game
| game | note |
|---|---|
| as64 | layers: game, `as64/core`, `as64+` (Enhanced only), then player mods |
| mowas2 | `--exe mowas_2` (MCP `game: mowas2`) reads without as64/core and `as64+` |
| goh | GoH layout (GHVFS-04); text under `localizations/`; mod folders are read by path |

## Silent fails
- VFS-35 a deleted base file is just absent, no log marker; the later open is fatal `File not found - resource/...` unless optional
- VFS-26 files at the mod root outside `resource.pak`, `resource/`, `N.pat`, `localization.pak`, `localization/` are ignored
- a mod version or mode gate that refuses the mod means none of its files are in the chain at all (VFS-48)
- VFS-33 a mission's own `mod/` folder beats every listed mod while that mission runs

## Verify
- the winner named by `mow_file_which` is the mod meant to win, for one file of each clash kind
- in game: the value from the winning copy is the one seen (price, name, skin); read game.log (→ skill `mow-mod-test`)
