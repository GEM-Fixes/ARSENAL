# mow-mod-models-effects: effects (fx entities, particles, tracks, decals)

when: "bigger explosion", "muzzle flash", "smoke", "no track marks", "effect shows as a checker square", "craters vanish", "add an effect to a hit".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Which script line starts an effect → skill `mow-mod-scripts`.

## Steps
1. find an effect and who uses it: MCP `mow_fx_find {q:"<words>"}` or `{name:"<fx entity>", mod:"<mod>"}` → its def, views, sprites, sound, the scripts that spawn it
2. check a mod: MCP `mow_fx_check {mod:"<mod>"}`
   CLI `node tools/fxlint/fxlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`
3. copy a vanilla effect under a new name into `<mod>/resource/entity/fx/..` (text .def, CRLF), change it, then name it where it is spawned
4. sprites it names must exist: MCP `mow_asset_missing {mod:"<mod>"}` (as64 / mowas2); one sprite: `mow_texture_info {key:"texture/fx/..", mod:"<mod>"}`
5. GUI: Mods tab > Check & Fix runs the same lint; the `art` page shows sound and look, effects have no own page

## Facts
- an effect is an entity `.def` with root `{fx ..}`, no model needed; it ends when all its views finish
- views: `SpriteView`, `ParticleView`, `LightView`, `DecalView`; `{sound "x"}` plays at spawn; sprite path `$/dir/name` = `/texture/fx/dir/name`
- particle view = Generator (count, time to live, emission area) + Mover (gravity, damping, collisions) + Visualizer (stages initial, collided, dying)
- started from scripts with `{spawn "fx_name" [bone]}`, `{view show|start "tag"}`, `add_view "model" "view" "bone"`
- per-surface hit effects: `set/interaction_terrain/effects/<material>.inc`
- caps: `set/fxmanager.set` groups (`countLimit`, `timeLimit`, oldest first out); `set/entitymanager.set` for wrecks, bodies, craters

## fxlint codes
IA_ACTION_UNKNOWN (VIS-18) · FX_TRACER_UNLISTED (VIS-19) · WARN_ENV_NO_ENABLE, THUNDER_NO_SOUND (VIS-14) · SND_TAG_UNKNOWN (VIS-09)

## Per game
- as64 / mowas2: same effect format and action list
- goh: its own action list (adds `linear_damping`, `restore_volume_states`, `mark_for_persistence`, `wind_detail_bending`; no `get_off`; GHINT-26); fxlint `--exe goh` reads it.

## Silently fails
- VIS-18 there is no `{emit}` action: `unknown action 'emit'` (load error). use `spawn` or a view
- VIS-19 a track `{Tracer {View "x"}}` whose entity is not in `fxmanager.set`: every trace dropped; VIS-28 vanilla has one such vehicle
- VIS-29 a `{sprite}` naming a missing texture: drawn as a checker, no log
- VIS-17 at 40000 particles (2000 weather drops) new ones are simply not created
- VIS-16 wind moves only water and wind-dependent particles, never bullets or smoke screens' effect on aim
- raising `countLimit` costs frame time; effects past the limit pop the oldest

## Verify
- `mow_fx_check` clean; in game cause the effect (fire, hit, drive) on two ground types and watch it start AND end; log has no `unknown action` / `must be defined in fxmanager.set` (→ skill `mow-mod-test`)
