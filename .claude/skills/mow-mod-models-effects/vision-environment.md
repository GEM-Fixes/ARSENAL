# mow-mod-models-effects: weather, light, night, vision ranges, LOD, camera

when: "make it night", "rain / snow on my map", "units see too far", "spotting range", "fog of war", "thunder", "models pop in", "camera shake", "third-person camera".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. find the rule: MCP `mow_lookup {query:"<words>", mode:"words"}` or a topic: `{query:"vision-fx", mode:"topic"}`; one limits row: `mow_limit {ids:["VIS-07"]}`
2. find the file that wins: MCP `mow_file_which {path:"set/vision/<file>", mods:[..]}` (also `set/environment/..`, `set/detect.set`)
3. copy that file into `<mod>` at the same path (a copy replaces the whole file), edit (text, CRLF)
4. lint: MCP `mow_fx_check {mod:"<mod>"}` (weather and thunder blocks) · `node tools/refcheck/refcheck.js <mod folder> --game dir` (VISION_DUP, VISION_RULE_SHADOWED, TERM_DUP)
5. a map's preset is named in its mission file → skill `mow-mod-maps-missions`; switching it during play is the mission command `environment` → skill `mow-mod-scripts`

## Facts
- vision: `set/vision/*` blocks (`h_fov`, `v_fov`, `radius`, `uncover`) and a `rules` tree that picks a radius by target state; a unit's sensor names one: `{vision "name"}`
- night: a sight factor applies unless the target is lit; hearing uses sound `Signal` radius → vision-night
- `set/detect.set` values are reveal seconds for the local player's fog, not detection time
- environment: `set/environment/<preset>` (light, fog, sky, `weather`, `thunder`, `wind`); a preset is a fixed time, there is no clock; blend with the `environment` command
- LOD sets: distances per class → vision-fx/lod-render; camera: `camera.reg`, console var `cam_shake`

## Per game
- as64 / mowas2: as above
- goh: fog of war handling changed (GHVIS-08); third-person camera is data there (`/set/tp_control.set`, GHDC-35), in AS2 it is not moddable (VIS-22).

## Silently fails
- VIS-25 a sensor naming an unknown vision: fatal `Vision "<name>" not found` at def read
- VIS-02 rule siblings are first-match-wins: a later sibling never applies when an earlier holds
- VIS-03 a duplicate or unknown custom term in `settings.set`: hard error
- VIS-06 fog of war is a player option, not mod-settable; a mission can force it with `fog_mode`
- VIS-07 presets with `night_vision 1` (most vanilla ones) give no night penalty even with `{night}`
- VIS-14 `{weather}` / `{thunder}` without `{enable}` stay off [T]; thunder needs a `sound`
- VIS-12 a missing preset name is a silent no-op; a second blend during a blend is dropped
- VIS-15 `{if rain}` / `{if sunlight}` are read when the unit spawns: a later blend does not update it
- VIS-16 wind has no effect on shots; VIS-20 LOD distances must strictly increase; VIS-21 camera shake is off unless `cam_shake` is set
- VIS-24 one vision mode (night, thermal, drone) per actor

## Verify
- refcheck and `mow_fx_check` clean; in game on the changed map: weather seen, spotting distance measured against a known range (place two units), log read (→ skill `mow-mod-test`)
