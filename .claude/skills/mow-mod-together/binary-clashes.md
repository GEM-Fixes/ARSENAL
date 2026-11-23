# mow-mod-together: binary clashes (models, textures, sounds, shaders)

when: both mods ship the same model, texture, sound or other non-text file with different bytes. Codes WARN_CONFLICT_OPAQUE_MOD_MOD, CONFLICT_TEX_EXT_SHADOW, info CONFLICT_SHADER_SET.

## Steps
1. list: MCP `mow_mods_clash` (`mods` in load order, `file`: e.g. `resource/entity/**` or a texture path pattern) · CLI `node tools/conflicts/conflicts.js --game G --mods a,b [--exe as64|mowas_2|mowas2|goh] --mods-only`
2. which copy is read: MCP `mow_file_which` (`path` as the game sees it, `mods`) · CLI `node tools/vfs/vfs.js G --exe as64|mowas_2|mowas2|goh --mods a,b which <path>`
3. these can not be merged: one copy is taken whole. ask the user which mod's look or sound stays. default = the last mod's (already the case, no patch needed)
4. to take the EARLIER mod's copy: patch spec `{ files: [{ key: '<path>', mode: 'take', take: '<mod>' }] }` (files that are no text data are only taken on request)
   CLI `node tools/conflicts/patchmod.js plan|write --game G --mods a,b --out <new folder> --spec f.json` · MCP `mow_mods_patch` plans the mergeable files and lists these as not merged
5. a model taken from one mod needs that mod's whole set (`.mdl`, `.ply`, `.vol`, `.mtl`, textures): take them together or the model mixes parts [I]
6. GUI: Share tab > Share page > Mods together, "can not be merged" group; `gui_call` `POST /api/x/share/clashfix` with the picked `files`
7. editing the asset itself: see skill mow-mod-models-effects

## Facts (shared)
- texture extension order beats mod order: the last of `.dds .tga .bmp .jpg .png` is read, `.ebm` / `.tex` beat all (FMT-04 [V]). so an earlier mod's `.tga` can beat a later mod's `.dds` of the same name
- the game keeps one compiled shader cache for every mod list: after a change of the list old compiled shaders may stay in use until the cache is cleared (conflicts note CONFLICT_SHADER_SET, VFS-56)
- loose vs pak inside one mod is decided by directory scan order, not time (VFS-08, VFS-55): info CONFLICT_PAK_LOOSE_SAME_MOD

## Per game
| game | note |
|---|---|
| as64 | as above |
| mowas2 | same; `--exe mowas_2` |
| goh | same whole-file rule; GoH asset formats differ from AS2: never take a GoH copy into an AS2 stack by this route (→ skill `mow-mod-port`) |

## Silent fails
- FMT-04 a stray `.tga` / `.png` beside a `.dds` silently replaces it
- UI-03 a missing or misspelt picture shows a stub or nothing, no log line
- NET-01 `.ply .vol .mtl .anm` are compared by byte size only in the lobby, textures and sounds not at all: players with different copies pass the lobby → multiplayer-sync.md

## Verify
- `mow_file_which` on each taken path names the patch as the winner
- binary headers of the patch: `node tools/binhdr/binhdr.js <gameDir> --folder <patch>`
- in game: look at the unit in a match (skin, tracks, turret), hear the shot; read game.log (→ skill `mow-mod-test`)
