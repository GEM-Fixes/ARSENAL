# mow-mod-together: one mod deletes a file the other needs

when: with mod B on, mod A crashes on `File not found - resource/...`, or a unit of A is gone though B does not ship that file. Code CONFLICT_FILE_DELETED; joint view CONFLICT_JOINT_REF.

## Steps
1. list: MCP `mow_mods_clash` (`mods` in load order) → CONFLICT_FILE_DELETED = a later mod's mod.info `Delete` or `.patch` delete removes a file an earlier mod ships
   CLI `node tools/conflicts/conflicts.js --game G --mods a,b [--exe as64|mowas_2|mowas2|goh] --joint` (`--joint` adds who still names the deleted thing)
2. read the deleting mod: MCP `mow_mod_info` (`mod`) shows its mod.info with the Delete lines · CLI `node tools/modinfo/modinfo.js <mod dir> [--exe ..]` (DELETE_PREFIX = a Delete with no `resource/` prefix, matches nothing)
   what a mod deletes against the game: MCP `mow_mod_diff` (`mod`, `mods`) · CLI `node tools/overdiff/overdiff.js <mod folder> --game G [--mods a,b]` (OVR_FILE_DELETED)
3. is the file there in the stack: MCP `mow_file_which` (`path`, `mods`)
4. fix, without touching either mod: a later mod can re-add a deleted file by mounting it afterwards [V]. so the patch mod, loaded last, ships that file again
   patch spec: `{ files: [{ key: '<path>', mode: 'take', take: '<the mod that ships it>' }] }` → `node tools/conflicts/patchmod.js plan|write --game G --mods a,b --out <new folder> --spec f.json` · MCP `mow_mods_patch` (`mods`, `out`; plan, then `write: true`)
5. or change the order when the deleting mod only cleans vanilla: the mod that ships the file goes AFTER the deleting mod, with Require to hold it → load-order.md
6. GUI: Share tab > Share page > Mods together lists deleted files with the mod that removes them

## Facts
- mod.info `Delete` needs the `resource/` prefix or it matches nothing (VFS-21 [V, as64 live])
- mod.info `Delete` runs before that mod's own files mount: it can remove another layer's file, never the mod's own (VFS-22 [V])
- a `.patch` delete / remap runs after the mod's own pak and `resource/`: it deletes the mod's own and earlier mods' files; `remap` with a missing source is fatal (VFS-23 [V])
- a deleted file leaves no log marker; a later open is fatal `File not found - resource/<path>` unless the reader opens it optional (VFS-35 [V])

## Per game
| game | note |
|---|---|
| as64 | as above; with Enhanced mods `as64+` files can be deleted by a player mod like any earlier layer |
| mowas2 | same rules, `--exe mowas_2` |
| goh | same mod.info key set as far as read [I]; before relying on it; not run in game [T] |

## Silent fails
- VFS-21 a Delete without `resource/` does nothing at all, no warning in game
- VFS-35 the crash comes later, at first use of the file, and names only the path, not the mod that deleted it
- a Delete that removes a shared include: every file that includes it stops, in both mods
- CONFLICT_JOINT_REF is found by name [I]: a quoted word that only looks like the name is listed too

## Verify
- `mow_file_which` (`path`, `mods` with the patch last) names the patch as the source
- `mow_mods_clash` again: CONFLICT_FILE_DELETED gone for that path
- in game: use the unit, map or sound that needed the file; game.log has no `File not found` (→ skill `mow-mod-test`)
