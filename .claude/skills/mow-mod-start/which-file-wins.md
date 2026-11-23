# mow-mod-start: which copy of a file the game reads (override rules)

when: "which file wins", "my file is ignored", "my edit does nothing", "what does my mod override", before copying a game file into a mod.

## Steps
1. one file: MCP `mow_file_which` (`path` as the game sees it, e.g. `set/multiplayer/units/x.set`; `mods` = folders in load order): the winning source (game pak, loose file or mod) and the copies it shadows
   CLI `node tools/vfs/vfs.js G --exe as64|mowas_2|mowas2|goh --mods a,b which <virtual path>`
   GUI: Mods tab > Mods > Mod Files (route `files/which`); IDE > Which file wins (`ide/copies`)
2. everything the mod hides: `node tools/vfs/vfs.js G --exe as64 --mods a,b shadowed --list`
3. per shadowed file, the keys added / changed / removed: MCP `mow_mod_diff` (`mod`, `mods` = earlier mods, `file` narrows, `keys: true`)
   CLI `node tools/overdiff/overdiff.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]` (OVR_FULL_SHADOW = a game file replaced whole, its other keys dropped; OVR_FILE_DELETED)
4. to change one line of a game file: the mod must hold a full copy at the SAME path under `resource/`. Let a tool make it: `mow_mod_gen` ops, or `node tools/patch-entity/patch-entity.js <mod> --game G (--entity n|--file key) --set p=v --dry-run` (says PATCH_FULL_COPY)

## Rules; lim VFS-01, VFS-02, VFS-08 [V])
- one flat index of names; the LAST registration of a name wins the whole file. Nothing is merged, not between mods and not with the game
- order of registration: base game → (as64) `as64/core` → mods in list order; inside a mod: `resource.pak`, `resource/`, `N.pat`, `localization.pak`, `localization/`
- names are lower-cased and `\` = `/`: `Tank.DEF` and `tank.def` are one file
- written forms: `/a/b` = under `resource/`; `a/b` = beside the file being read (an `(include "x.inc")` with no leading `/` is next to the includer); `//a/b` = game folder outside `resource/`; `@a/b` = the user folder
- never decided by file time stamps. Loose against pak in one folder = name order → `paks-vs-loose.md`
- text: a `.lng` at a vanilla path replaces that file whole; a `#name.lng` adds keys instead (VFS-27, LOC-10)
- entity `.def` with the same title in two places: the first wins, later logs `Entity redefinition` (vfs/order)
- what a mod does not ship comes from vanilla, with no log marker

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| `as64/core` and `as64+` sit between the game and player mods: use `--exe as64` or a file from them looks like vanilla | no such layers: `--exe mowas_2`, baseline = the base game | same last-wins rule; a mod has only `resource/`, `N.pat`, `localizations/`; language folders are laid over `resource/` after the mods, so a file under `localizations/` probably beats the same path in a mod's `resource/` (not confirmed); a mod outside `H/mods` is mounted by path on top by the tools |

## Silent fails
- VFS-01 / VFS-41 a copied file that lacks entries: those entries are gone for the game and for every earlier mod, no error
- VFS-42 a mod copy of a roster `set/multiplayer/units/<file>.set` hides other mods' cards
- VFS-02 two files differing only by case collide
- VFS-26 a file in the wrong folder (or in the mod root) is an extra file nothing reads
- VFS-35 a deleted game file leaves no marker: fatal `File not found - resource/...` only when something opens it
- VFS-56 shaders: the shader cache key does not change with mod shaders, the first stack to compile wins; VFS-57 ship the whole shader folder, not a part
- VFS-58 a mission loading video is read only from the mission's own folder under `/video/mission/`

## Verify
- `mow_file_which` names the mod as the winner for the path; `mow_mod_diff` lists only the keys meant to change
- in game: the changed value is seen; game.log read (→ skill `mow-mod-test`)
