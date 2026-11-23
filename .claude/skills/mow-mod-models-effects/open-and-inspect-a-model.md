# mow-mod-models-effects: find a model and see what it is made of

when: "which files make this tank", "what bones does it have", "where is the model of X", "model is invisible", "what is missing".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. find: MCP `mow_model_find {q:"<words>", kind:"vehicle"}` (`kind` = all|vehicle|human|object|breed|model; `mod` or `mods` adds mod data)
   CLI `node tools/soedit/soedit.js find <words> [--mod M] [--kind all|vehicle|human|object|breed|model] [--limit n]`
2. read: MCP `mow_model_info {model:"<entity name | game path of .mdl/.def | disk path | breed:<key>>", mod:"<mod>"}` → files (def, mdl, ply, vol, anm, mtl, textures), bones, volumes, meshes; `show` picks sections, `limit` / `offset` page
3. what the def adds on top (includes, macros): MCP `mow_entity_info {names:["<id>"], mod:"<mod>"}`
4. which copy wins: MCP `mow_file_which {path:"entity/..", mods:[..]}`
5. files a mod names but nobody holds: MCP `mow_asset_missing {mod:"<mod>"}` (as64 / mowas2 only)
6. GUI: Models & Sim tab > `models` page: Pick a model, Files, Bones, Collision volumes, Meshes and materials (`gui_call` on `models/find`, `doc/open`)

## The chain
- `<name>.def` (entity: game logic, `{extension "<name>.mdl"}`) → `.mdl` (skeleton: bones, `{VolumeView}` meshes, `{Volume}` shapes, `{animation}` list) → `.ply` (mesh) → `.mtl` (material) → `.dds` (texture)
- relative paths resolve against the folder of the file being read; a leading `/` = `resource/` root; no basename or entity-name fallback (FMT-22)
- bone names are the contract with the def, macros and scripts (`body`, `turret`, `gun`, `foresight3`, wheel and track bones, seat bones)
- a soldier's body = `entity/humanskin/<name>` skin on the shared human skeleton; `breed:<key>` opens what a breed wears

## Per game
- as64 / mowas2: same formats; `mow_asset_missing` works
- goh: model info and find work; mesh format and shader set differ (BC5 normal maps GHFMT-03; unreadable texture → checker with a warning, GHFMT-05); `mow_asset_missing` not served

## Silently fails
- FMT-07 a def `{Volume}` whose name the .mdl lacks is dropped: its armour and thickness are lost, no message
- FMT-09 an animation bone not in the skeleton: the track is skipped
- FMT-19 two bones or volumes with one name: the first found wins [I]
- FMT-03 a .ply whose `.mtl` is missing: null material; crash when the mesh draws [V]
- FMT-13 a .ply that is not `EPLY` / `BPLY`: `Can't create resource object`

## Verify
- `mow_model_info` lists every file as found; in game the unit stands, turns its turret, and game.log has no `Can't create resource` or `not found` line for it (→ skill `mow-mod-test`)
