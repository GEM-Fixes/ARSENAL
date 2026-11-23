# mow-mod-start: pak or loose files, what mounts in a mod

when: "pak or loose", "do I need a pak", "my loose file loses to the pak", "what is resource.pak". Packing for release → skill `mow-mod-share`.

## Steps
1. develop loose: files under `<mod>/resource/<same path as in the game>`. Pack only for release
2. see the plan for paks: MCP `mow_mod_pack` (`mod`; preview: paks by role gamelogic, entity, map, interface, texture, sound + the pack checks; `out`, `package`, `write: true` to write)
   CLI `node tools/packer/packer.js <modDir> [--out <dir>] [--package] [--dry] [--goh | --exe as64|mowas_2|goh] [-q] [--summary]` (default dry)
   GUI: Share tab > Share > Package for friends (routes `share/outcheck`, `share/package`)
3. loose file against a pak in the same mod: `node tools/vfs/vfs.js G --exe as64 --mods mymod which <path>` · MCP `mow_file_which`
4. read a game pak: it is a plain zip; open it read-only, copy the one file needed into the mod at the same path

## Facts
- a mod root mounts ONLY, in this order: `resource.pak` → `resource/` (recursive, paks inside it mount where they lie) → `1.pat, 2.pat ..` → `localization.pak` → `localization/` (both land at `resource/interface/text/`). Nothing else is read (VFS-26)
- pak = plain zip, stored or deflated, no encryption (VFS-10). Entry root = the folder the pak lies in: `resource/entity.pak` holds entries `entity/-vehicle/x`; the game's own `resource/entity/e2.pak` holds `-vehicle/x`
- loose against pak, or pak against pak, in ONE folder: the folder is read in name order and the LATER NAME wins (VFS-08). `entity` sorts before `entity.pak` → the pak wins; `gamelogic.pak` sorts before `set` → loose `set/` wins. So in the game's own `resource/`, loose works for `set/`, `properties/`, `script/`, not for `interface/`, `map/`, `texture/`, `sound/`, `entity/` [I derived, T]
- inside a mod: `resource.pak` first, then everything in `resource/`: a loose file under `resource/` beats the mod's root `resource.pak`; against a pak nested in `resource/` the name order decides (VFS-55)
- small text entries (`.def .inc .set .mi .ext ..`) are read into memory when the pak mounts; others are inflated whole on each open: big paks mount slowly (VFS-09)
- loose files with `.txt .temp .scc. . .org. .msg` are never indexed; the same file inside a pak is (VFS-06). `.gitignore`, `.git`, `.svn` are skipped (VFS-07)
- as64 reads zip64: a pak may pass 4 GB, one entry must stay under 4 GB (VFS-39 [V], shipped exe [T])

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| mod root | all five items | all five items | only `resource/`, `N.pat`, `localizations/`; a root `resource.pak`, `localization.pak`, `localization/` is skipped without a message (GHVFS-04): paks go INTO `resource/`, text into `localizations/<code>/interface/text/` |
| extra layer | `as64/core` paks + loose | none | none |
| packer | roles as above | `--exe mowas_2` | `--goh`; a mod holding bytes of GoH origin is refused (guard) |
| zip64 | yes | [T] | not sourced |

## Silent fails
- VFS-08 a loose `entity/` folder beside `entity.pak` in the same folder loses, no message (packer WARN_LOOSE_SHADOWS_PAK, doctor WARN_REL_PAK_LOOSE_DUP)
- VFS-02 / VFS-04 entries differing only by case are one file, later wins (packer WARN_PACK_DUP_NAME); entry names over 1023 bytes are cut (ZIP_NAME_TOO_LONG)
- VFS-40 a zero or wrong CRC loads as a resource but breaks extract callers: write real CRCs (packer PACK_ROUNDTRIP)
- VFS-52 a mod copy made by upgrade hard-links unchanged paks to the source: replace files, never edit a pak in place
- a pak left in the mod next to newer loose files: which one wins follows the rules above, not the dates

## Verify
- packer dry run prints no warning; `mow_file_which` names the copy you expect
- in game: run once loose and once packed, same result; game.log read (→ skill `mow-mod-test`)
