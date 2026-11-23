# mow-mod-vehicles: turrets, gun mounts and the bones they need

when: "turret does not turn", "turret turns too slowly", "gun will not elevate", "add a second machine gun", "gun fires from the wrong place", "hull gun turns the whole tank", "Zero speed in ik-bone".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Which gun is mounted and its numbers → skill `mow-mod-weapons-damage`; swapping a weapon slot → skill `mow-mod-units` (`vehicle-weapon-slots.md`).

## Steps
1. the weapon places: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}` (`weaponry` places, their `gunner` / `charger` groups, link and foresight bones)
2. the bones and their limits: MCP `mow_model_info {model:"<entity>", mod:"<mod>", show:["bones"]}` (type, `{speed}`, `{limits}`)
3. will it fire: `node tools/firecheck/firecheck.js <def> [--game G] [--exe as64|mowas_2|mowas2|goh] [--dist N] [--json]`
4. change traverse or elevation: the bone's `{speed}` and `{limits}` in a staged copy of the `.mdl` (→ skill `mow-mod-models-effects`, `edit-in-soedit.md`), or a def bone modifier placed after `{Extension}`
5. change a place key: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", rows:["<entity>,<key path>,<value>"]}]}` (plan)
6. lint: `node tools/defcheck/defcheck.js <mod dir> [--game G] [--exe as64|mowas_2] [--summary]` · MCP `mow_model_check {mod:"<mod>", checks:["def"]}`

## Mechanics
- `{weaponry {place "gun" {weapon ..}{gunner ..}{charger ..}{LinkBone ..}{foresight ..}{type ..} ..}}`; the first place is the basic one
- aiming turns a chain of bones toward the target: typically `turret` (traverse) then `gun_rot` / `gun` (elevation); each must be a rotating bone type with `{speed}` and, if limited, `{limits}`
- the shot leaves from the `foresight` bone; `shooter` / `barrels` name barrel bones for multi-barrel mounts
- `Rotate`: the place turns the HULL to aim (casemate guns); `StationaryFiring`: fire only when stopped; `SequentialAim`: aim bones one after another; `RestoreIKAfterAim`: return to rest
- `AccuracyByMotion`: accuracy falls while the vehicle moves or turns and recovers after; no fire while below the weapon's tolerance
- names the def, macros and scripts look up: `body turret gun_rot gun mgun_rot foresightN seatNN wheel* track* fx*` (the model must have them under those names)
- a place's `fire "place"` event runs its script (flash, recoil animation)

## Per game
- as64 / mowas2: as above
- goh: a place may also name `{AimBone "b"}` (the chain is solved to it, the shot still leaves from the foresight); no foresight = no shot there. firecheck `--exe goh` knows it.

## Silently fails
- FMT-05 `{speed}` / `{limits}` on a plain (non-rotating) bone do nothing: the turret never turns
- KEY-06 a bone speed stored as zero: error `Zero speed in ik-bone`
- a def bone modifier before `{Extension}`: `Bone modifiers must be placed after skeleton load`; a bone the model lacks: warning `Bone %s not found`
- a missing or misnamed foresight bone: the gun aims and never fires, or fires from the origin (firecheck)
- an empty `gunner` or `charger` seat group: no fire, no reload (→ `crew-places.md` in this skill)
- KEY-18 `AccuracyByMotion` `by*` values above 1 are invalid
- INT-21 a `fire "name"` handler with a place name the unit lacks never runs
- a turret volume hung on the hull bone does not turn with the turret: hits land on the old place

## Verify
- firecheck passes; in game aim at targets around the vehicle: full traverse timed, elevation at a hill target, every gun fires and reloads; log read (→ skill `mow-mod-test`)
