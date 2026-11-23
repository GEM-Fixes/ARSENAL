# mow-mod-models-effects: sound (gun sound, voice, loudness, silence)

when: "new gun sound", "my sound does not play", "too quiet / heard too far", "unknown sound file", "voice lines", "bots do not hear it", ".mp3 or .ogg".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. find a sound name: MCP `mow_sound_find {name:"<words>", mod:"<mod>"}` → sound names (folders and files under `/sound/`)
2. read one: MCP `mow_sound_info {sound:"weapon/shot/<..>", distance:150, mod:"<mod>"}` → files, loudness class, min and max distance, group, how loud at that distance; `ambient: true` for non-positioned
3. check a mod: MCP `mow_sound_check {mod:"<mod>"}` (`files: true` also reads the .wav headers)
4. add or copy a sound class: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"sound", id:"weapon/shot/my_mg", like:"weapon/shot/mgun/mg42_burst", volume:0.8}]}` (plan; `write: true` writes). other ops: `soundclass` (a loudness row), `voice`
   CLI samples: `node tools/gen/gen.js --sample sound` · `--sample soundclass` · `--sample voice`; fields `node tools/gen/gen.js --schema`
5. put the `.wav` files into `<mod>/resource/sound/<id>/`; point the weapon at it (`fireSound`, `reloadSound`) → skill `mow-mod-weapons-damage`
6. GUI: Models & Sim tab > `art` page "Look & Sound" (`art/sound`, `art/wav-convert`)

## Facts, sound-engine, formats/sound-misc [V]
- no aliases: a sound name = a folder or file path under `/sound/`. a folder plays a random file of it (no repeat until all played)
- weapon `fireSound "x"` looks in `sound/weapon/shot/x`, `reloadSound` in `sound/weapon/reload/x` (GPL-15)
- `folder.set` per folder, inherited from the parent: `Loudness "<class>"`, `Distance min max`, `Volume`, `Tag`, `Signal <name> <radius>` (what the AI hears)
- `sound/sound.set`: `{loudness name min max [priority]}` classes and `{percent group share}` voice budgets
- scripts: `play_sound`, `start_sound "path" [loop] [ambient]`, `stop_sound`, `link_sound`
- only `.wav` is listed; the Miles codec set decides what plays

## Per game
- as64 / mowas2: every folder.set starts again from the `default` loudness
- goh: a sub-folder inherits distances from its parent (GHVIS-29); folder `{volume}` also scales ambient sounds (GHVIS-30); a positioned sound with no min distance is stopped with a warning (GHVIS-31); priorities run higher than as64 (VIS-26 [I])

## Silently fails
- GPL-15 a name with no .wav behind it: warning `unknown sound file`, silence
- FMT-14 `.mp3` and `.ogg` in a sound folder are ignored [T]
- VIS-09 `{tag x}` other than effects, emotions, speech, environment falls into the "other" group (fxlint SND_TAG_UNKNOWN)
- VIS-10 at most 3 copies of one file at once; loud overlaps are culled by priority: raise the loudness class priority
- VIS-04 `Signal` radius is the only loudness the AI knows; a unit with a higher hearing bias ignores it
- VIS-27 a `sound.set` without a `default` loudness row: fatal at the first folder.set
- a mod copy of `sound.set` or a `folder.set` replaces the whole file for all mods before it

## Verify
- `mow_sound_check` clean and `mow_sound_info` lists the new files; in game fire near and at 150 m and listen; log has no `unknown sound file` (→ skill `mow-mod-test`)
