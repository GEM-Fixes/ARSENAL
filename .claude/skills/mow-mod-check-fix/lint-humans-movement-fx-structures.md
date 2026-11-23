# mow-mod-check-fix: soldiers, chassis, effects and sound, buildings (humlint, movlint, fxlint, strlint)

when: "unexpected token" in a soldier or vehicle file, "Wheel radius is zero", "Invalid bone ... radius", a new soldier breed misbehaves, a sound group or weather block does nothing, a building will not garrison or tear, HUM_ / MOV_ / STR_ findings.

## Steps
1. MCP `mow_mod_check` (`mod`, `only: "humlint,movlint,fxlint,strlint"`, or `full: true`)
2. CLI (each takes `<mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary] [--format text|json|sarif|html|csv] [-o f]`):
   - `node tools/humlint/humlint.js` vitality Health / Stamina keys, health_damage_* keys, ability bases with no levels, weapon posture reload, mp `{breed}` with no set/breed file, inventory box size and item counts, stance machine order, mdl duration frames 0
   - `node tools/movlint/movlint.js` Locomotion keys, wheel / water chassis pivot bones, WheelRadius 0, wheel bone radius 0
   - `node tools/fxlint/fxlint.js` sound tag group unknown, `{thunder}` without sound, weather without enable (info), interaction action names against the engine list, track tracer fx not in the fx manager
   - `node tools/strlint/strlint.js <mod folder> | --vfs --game <dir> [--mods a,b] [--exe as64|mowas_2|goh]` construction defs + mdl: place bones, window thickness, view, fortification keys, collider groups, tear bones, undefined calls and macros, missing includes
3. GUI: Mods tab > Check & Fix (full check)
4. fix by hand at file:line; soldier, squad and vehicle data → skill `mow-mod-units`; effect and sound files → see skill mow-mod-models-effects

## Codes
| code | meaning | row |
|---|---|---|
| HUM_POSTURE_RELOAD | posture `reload` key has no reader: likely inert | HUM-16 |
| humlint vitality codes | unknown Health / Stamina sub-key: "unexpected token" | HUM-01 |
| MOV_LOCO_KEY | unknown `Locomotion` key: "unexpected token" | MOV-01 |
| movlint wheel codes | missing pivot bone = warning; radius 0 = error | MOV-20 |
| WARN_ENV_NO_ENABLE | weather block without `{enable}` (info on `{thunder}`) | VIS-14 |
| fxlint sound tag code | `folder.set` Tag is not one of the named groups | VIS-09 |
| STR_MDL_MISSING, STR_PLACE_BONE, STR_PLACE_ENTITY, STR_WINDOW_THICKNESS, STR_VIEW_MISSING, STR_FORT_ENTITY / _KEY / _VALUE / _SKIP, STR_COLLIDER_GROUPS, STR_TEAR_BONE, STR_TEAR_ENTITY, STR_CALL_UNDEFINED | building data errors | STR area |
| WARN_STR_DEF_SCALE, WARN_STR_TEAR_BONE_NONE; STR_VOLUME_NO_SHAPE, STR_OBSTACLE_MISSING, STR_VOLUME_BONE (info on vanilla, which breaks them) | review | STR-12 |

exact code of a rule: the tool's report

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| humlint | yes (vanilla: 2 real) | `--exe mowas_2` | HUM rules are [I] on GoH |
| movlint | yes (vanilla: 4 real, water ships) | same | Locomotion also reads Slow Normal Fast CostFactor (GHMOV-44/45) |
| fxlint | action list of 106 names | same | GoH action list (115, GHINT-26) |
| strlint | yes (vanilla 0, ~60 s) | same | STR_COLLIDER_PROFILE_GOH; GoH known-vanilla list |

## Silent fails
- HUM-16 the posture `reload` key is written but never read
- HUM-21 items that do not fit the inventory box are dropped with no message
- GPL-13 an undefined ability level string gives the soldier the TOP level
- VIS-09 an unknown sound `Tag` falls into the "other" group: no error
- VIS-14 `{enable}` defaults to false: a weather block without it stays off [T]
- MOV-20 a missing pivot bone is only a warning
- STR-12 scale of a building comes from the map `{xform scale}`; a def-level scale is unproven [I]

## Verify
- re-run the four linters: no error-class code
- in game: spawn the soldier / vehicle / building, move it, fire, enter the building; read game.log (→ skill `mow-mod-test`)
- movement/chassis movement/vehicle-keys vision-fx/* · limits HUM MOV VIS STR · guide 07, 08, 16, r04, r05, r08
