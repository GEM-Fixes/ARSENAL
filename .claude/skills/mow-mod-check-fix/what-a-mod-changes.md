# mow-mod-check-fix: what a mod changes against the game

when: "what does this mod change", "why did unit X vanish", before fixing or upgrading someone's mod, to see which vanilla files it replaced whole.

## Steps
1. MCP `mow_mod_diff` (`mod` = full path, `game`): per changed file the keys added, changed or removed, and files that replace a whole game file; counts by kind, then the first rows
   `mods` = mods loaded before it (compare against game + those) · `q` = part of a file name or key · `file` = path pattern such as `resource/set/**` (folder outside `<game>/mods` only) · `keys: true` = every key, not the first three per file · `limit`
2. one file: MCP `mow_file_which` (`path` as the game sees it, `mods` in load order): the winning source and the copies it shadows
3. CLI `node tools/overdiff/overdiff.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`
   which files of earlier layers the stack hides: `node tools/vfs/vfs.js G --exe as64 --mods a,b shadowed --list`
4. GUI: Mods tab > Check & Fix shows the changed files; Share tab > Mods together for two mods against each other (→ skill `mow-mod-together`)

## Codes
| code | meaning |
|---|---|
| OVR_FULL_SHADOW (warn) | an SDL file of the game replaced whole: every top-level entry the copy lacks is gone |
| OVR_KEY_ADDED / OVR_KEY_CHANGED / OVR_KEY_REMOVED (info) | per key, compared by meaning (1.4 = 1.40) |
| OVR_IDENTICAL (info) | same content as what it overrides: dead weight |
| OVR_OPAQUE_REPLACED (info) | binary or unreadable file replaced |
| OVR_FILE_DELETED (info) | removed by mod.info `Delete` |

`{from}` inheritance is not resolved: a key that comes through a parent shows at the parent.

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| against AS2 data + as64/core (+ `as64+` for an Enhanced mod) | `--exe mowas_2`: without as64/core; keeps the mod version gate (VFS_MOD_VERSION) | `--exe goh`, no `--game` = the GoH install; a folder outside `<H>/mods` is mounted by path; keeps the version gate |

## Silent fails
- VFS-01 override is by whole file, last registered wins, no merge: a one-line change means the mod carries a full copy
- VFS-41 the copy drops every top-level entry it does not repeat; later mods' and patches' edits to those entries are lost with no error
- VFS-42 a mod roster `set/multiplayer/units/<file>.set` replaces the whole file: other cards leave the buy menu
- LOC-01 the same for a `.lng` at a vanilla path: missing keys show raw
- VFS-22 mod.info `Delete` runs before the mod's files mount: it can remove another layer's file, never the mod's own
- a game update changes the vanilla side: an old full copy silently undoes the update's new entries (re-run the diff after an update) [I]

## Verify
- the diff lists the change the user expects and nothing they did not intend; each OVR_FULL_SHADOW row is explained or fixed (text: fixer `lng`; tables: fixer `set`, via MCP `mow_mod_fix`)
- in game: the changed unit shows the new value and the neighbours in the same file are still there (→ skill `mow-mod-test`)
- vfs/mount files/mount · guide 04-vfs-paks-patches
