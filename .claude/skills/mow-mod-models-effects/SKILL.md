---
name: mow-mod-models-effects
description: Work on the art side of a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "model", ".mdl", ".ply", "mesh", "bones", "skeleton", "collision volume", ".vol", "animation", ".anm", "texture", ".dds", ".mtl", "material", "pink or checkered texture", "invisible model", "open in SOEdit", "3D editor", "Blender export", "effect", "fx", "particles", "muzzle flash", "explosion effect", "smoke", "decal", "sound", ".wav", "gun sound", "voice", "no sound", "icon picture", "portrait picture", "weather", "night", "environment preset", "vision range", "LOD", "missing file in my model", "what does this model consist of".
---

# mow-mod-models-effects (router): read ONE sub-file for the sub-task

game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh` · gen `--target as64|mowas2|goh`. not as64 → skill `mow-games` first.

## Always
- game installs + vanilla data read-only; write only inside the `<mod>` the user named. binary art (.ply .anm .vol .dds) is never edited in place in the game: stage a copy
- names, bones, sounds change with every mod: read them with the tools, never quote from memory
- every write tool answers a plan unless `write: true`; CLI `--dry` / `--plan` writes nothing
- text CRLF, strings UTF-8, identifiers ASCII; `.mdl .def .mtl .set` are text, `.ply .anm .vol` binary
- done = seen in game + game.log read (→ skill `mow-mod-test`). a clean check is "static clean", not "works"

## Sub-tasks
| sub-task | read | tools |
|---|---|---|
| find a model, see its files, bones, meshes, what is missing | open-and-inspect-a-model.md | `mow_model_find` `mow_model_info` `mow_asset_missing` |
| edit a model in the 3D editor (SOEdit), keep the record | edit-in-soedit.md | `mow_model_stage` `mow_model_edits` soedit |
| meshes: .ply limits, export from Blender, invisible parts | meshes-ply.md | `mow_model_check` binhdr expcheck blen |
| collision and armour volumes as shapes (.vol, `{Volume}`) | volumes.md | `mow_model_info` `mow_model_check` expcheck |
| animations: list, link, why it does not play | animations.md | `mow_anim_list` `mow_model_check` |
| textures and materials: .dds, .mtl, checker, wrong file wins | textures-materials.md | `mow_texture_info` `mow_asset_missing` |
| effects: fx entities, particles, tracks, decals | effects-fx.md | `mow_fx_find` `mow_fx_check` fxlint |
| sound: gun sound, voice, loudness, silence | sound.md | `mow_sound_find` `mow_sound_info` `mow_sound_check` `mow_mod_gen` |
| icon and portrait pictures (the art files) | icons-art.md | `mow_icon_check` artport |
| weather, light, night, vision ranges, LOD, camera | vision-environment.md | `mow_lookup` `mow_file_which` |
| whole-mod art check before release | check-assets.md | `mow_model_check` `mow_asset_missing` `mow_fx_check` `mow_sound_check` `mow_icon_check` |

## Across (one line each, not copied here)
- armour numbers on a volume, thickness, sides → skill `mow-mod-weapons-damage` (`armour-volumes.md`)
- uniform and camo choice of a unit → skill `mow-mod-units` (`skins-textures.md`)
- icon wiring in the buy panel, text → skill `mow-mod-text-ui` · scripts that spawn an effect → skill `mow-mod-scripts`
- art of a GoH unit into AS2 → skill `mow-mod-port` · seats and door bones → skill `mow-mod-vehicles`

## Depth
- (ply-chunks, ply-vertex, anm, textures, sound-misc, mdl, mdl-seq, vol, vol-block, wiring), vision-fx/* · limits FMT-*, VIS-*
- guide via MCP `mow_guide` (`chapter`): 16-effects-sound-models, p06-edit-a-model, p08-icons-and-interface, r08-vision-effects-sound
- GoH: / `-t vision-fx` (not yet tried in game)
- GUI: Models & Sim tab (`models` page; `art` page "Look & Sound"); `gui_pages` finds the page, `gui_routes` its routes

## Tell the user
the model or asset touched, files written in `<mod>`, what the check said, what was and was not seen in game.
