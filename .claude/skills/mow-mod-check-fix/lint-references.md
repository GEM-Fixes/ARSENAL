# mow-mod-check-fix: broken references and binary files (refcheck, binhdr, expcheck)

when: "missing file", "broken reference", "No Stuff found", a unit crashes when bought or when it fires, checkered or missing textures, REF_ / PLY_ / ENTITY_ findings.

## Steps
1. MCP `mow_mod_check` (`mod`, `only: "refcheck"`; add `binhdr`, `expcheck` for binary files)
   which copy of a file the game reads: MCP `mow_file_which` (`path` as the game sees it, `mods` in load order)
   one entity's refs: MCP `mow_entity_info` (`names`, `mod`)
2. CLI `node tools/refcheck/refcheck.js <gameDir|-> [--mods a,b] [--folder dir] [--cache f] [--scope all|mod] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`
   `--mods` = mods under `<game>/mods`; `--folder` = a mod folder anywhere; `--scope mod` = only findings in the mod's files
3. binary headers: `node tools/binhdr/binhdr.js <gameDir> [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--folder DIR] [--ext ply,anm,..] [--strict] [-q] [--summary]`
   .ply chunk walk + .mtl refs, .anm, .vol, .dds, map.net, .wav, .mdl bone blocks, def/mdl volume wiring, anm bones against the skeleton. with `--mods` / `--folder` only the mod's files
4. exporter limits [I]: `node tools/expcheck/expcheck.js <mod folder> --game dir [--mods a,b] [--exe as64|mowas_2|goh] [-q] [--summary]` (WARN_EXP_SKIN_BONES, WARN_EXP_ANM_BONES, WARN_EXP_DUP_BONE, WARN_EXP_DUP_VOLUME, WARN_EXP_VOL_MATRIX)
5. GUI: Mods tab > Check & Fix
6. fix: MCP `mow_mod_fix` (`only: "repoint,stubmtl"`) · `node tools/fix/fix.js <mod> plan --only repoint,stubmtl`. repoint acts only when exactly 1 same-name candidate exists; stubs only for referenced meshes

## Codes
| code | meaning | row |
|---|---|---|
| REF_WEAPON_UNKNOWN | weapon / stuff name not found: crash class | LOG-07 |
| REF_WRONG_FOLDER | relative path (Extension, VolumeView, ply, vol, anm) resolves against the reading file's folder only; leading `/` = resource/ | FMT-22 |
| ENTITY_TYPE_UNKNOWN | def type is not entity / game_entity / actor / human / fx | ENG-02 |
| ENTITY_REDEFINITION | same def base name in two folders: the first mounted wins | ENG-04 |
| EXTENDER_UNKNOWN | extender type the engine does not have | - |
| STUFF_STRAY_FILE | any file in set/stuff except .fsm / .presets is a stuff | SDL-54 |
| ENV_PRESET_MISSING | environment preset not found: silent no-op | VIS-12 |
| THRESHOLD_LT1, WARN_BURN_NO_INFLAMMATION_TIME | value clamped / burn without time | DMG-19, DMG-17 |
| PLY_MTL_MISSING (binhdr) | mesh material missing: ERROR when reached via def/mdl, else info | FMT-03 |

## Per game
| as64 | mowas2 | goh |
|---|---|---|
| vfs view with as64/core | `--exe mowas_2`: no as64/core; one index cache per exe | `--exe goh`, no gameDir = the GoH install; GoH extenders known; no GOH_KEY / SPEED_* / WARN_SOUND_PRIORITY_HIGH; REF_FILLING_CYCLE is info. doctor skips binhdr on GoH; expcheck = AS2 limits + info EXP_GOH_BASIS |

## Silent fails
- LOG-07 an unknown stuff becomes `dummy_checker`: load looks fine, crash later when used
- FMT-03 a missing .mtl crashes only when the mesh loads; unreached meshes never show it
- FMT-22 no base-name or entity-folder fallback for relative paths: a file in the "wrong" folder is just not found
- ENG-04 a second def with the same title is ignored, no error
- VIS-12 a missing environment preset does nothing, no log line
- KEY-27 a cloned def's model path is relative to the def's folder unless it starts with `/`

## Verify
- re-run refcheck with `--scope mod`: no crash-class code left; `mow_file_which` shows the repointed file wins
- in game: buy the unit, let it fire and die; game.log has no "No Stuff found" (MCP `mow_game_log`; → skill `mow-mod-test`)
- model, texture and sound work itself → see skill mow-mod-models-effects. formats/*
