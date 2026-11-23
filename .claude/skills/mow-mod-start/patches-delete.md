# mow-mod-start: remove or rename a game file (`N.pat`, `.patch`, mod.info `Delete`)

when: "delete a vanilla file", "remove a unit file from the game", "what is 1.pat", "Wrong patch", "remap". To change a file, do not delete: override it (→ `which-file-wins.md`).

## Steps
1. is it needed: most mods never delete. A deleted file that something still names is a fatal `File not found` later
2. what a mod deletes now: MCP `mow_mod_info` (`mod`: its `Delete` lines, its `.pat` count) · `mow_mod_diff` (`mod`): files removed
   CLI `node tools/modinfo/modinfo.js <mod>` (DELETE_PREFIX) · `node tools/vfs/vfs.js G --exe as64 --mods mymod -q` (PATCH_NO_DOC, PATCH_ID, PAT_GAP, PATCH_REMAP_MISSING, MOD_ROOT_PATCH, MOD_DELETE_REFERENCED) · `node tools/overdiff/overdiff.js <mod> --summary` (OVR_FILE_DELETED)
3. after the change, the file must be gone: MCP `mow_file_which` (`path`, `mods`) · CLI `node tools/vfs/vfs.js G --exe as64 --mods mymod which <path>`
4. who still names it: MCP `mow_mod_check` (`mod`; broken references are crash class)
   GUI: Mods tab > Check & Fix > Check

## Two ways
| | mod.info `{Delete "x"}` | `.patch` `{delete "x"}` in `N.pat` |
|---|---|---|
| runs | BEFORE this mod's files mount | AFTER this mod's pak and `resource/` |
| can remove the mod's own files | no | yes (and earlier mods' files) |
| path | MUST start with `resource/` | relative to `resource/`, no prefix |
| a name ending `/` | deletes everything with that prefix | same |
- `N.pat` = a zip mounted like a pak at `resource/`: it may carry real files AND must carry one document whose name ends in `.patch`
- the document: `{Patch {id N} {delete "path"} {remap "from" "to"}}`; `{id N}` must equal the number in the file name
- `{remap "from" "to"}` re-registers the file under a new name and erases the old; paths relative to `resource/`
- patches mount `1.pat, 2.pat, ..` until the first missing number; the count is the mod's version in the `{mods}` line (`name:count`)
- a patch folder made by `mow_mod_fix` or `mow_mod_upgrade` is staged the same way (the next `N.pat`): → skill `mow-mod-check-fix`

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| both ways [V]; `Delete` proven live (VFS-21) | `.pat` yes; mod.info `Delete` in the shipped 3.262 exe [T] (key exists in source, the shipped template documents only `.pat`) | `N.pat` is one of the three things a mod mounts (GHVFS-04); `Delete` semantics there not tested: check with `mow_lookup` (`web: goh`, query "delete patch") |

## Silent fails
- VFS-21 `Delete "set/x"` (no `resource/`): matches nothing, says nothing
- VFS-22 `Delete` can not remove a file the same mod ships
- VFS-23 a `.patch` delete also erases the mod's own copy and earlier mods' files; `remap` with a missing source is an error
- VFS-24 `.pat` with no `.patch` document, or `{id}` not equal N: `Wrong patch N` / `Wrong patch N version`
- VFS-25 a loose `.patch` in the mod root is never read: it is only the source for building `N.pat`
- VFS-38 `3.pat` without `2.pat` is never mounted
- VFS-14 a new `.pat` in an active mod: the list number no longer matches; activate the mod again
- VFS-35 no marker is left: the crash comes when a unit, map or script opens the deleted file

## Verify
- `mow_file_which` answers "no such file" for the path with the mod on; `mow_mod_check` shows no new broken reference
- in game: load the screens and a match that used the file; game.log has no `File not found` (→ skill `mow-mod-test`)
