# mow-mod-vehicles: turning, tracks or wheels, chassis type

when: "turns too fast / too slow", "tank spins like a top", "wheeled car turns on the spot", "truck can not turn around", "Wheel radius is zero", "change a half-track", "steering".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`.

## Steps
1. chassis type and turn keys: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}` (the last `{Chassis "type"}` in the flattened def decides)
2. change: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", rows:["<entity>,<key path>,<value>"]}]}` (plan; `write: true` writes)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --entity <id> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
3. wheel and pivot bones of the model: MCP `mow_model_info {model:"<entity>", mod:"<mod>", show:["bones"]}`
4. lint: `node tools/movlint/movlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]` (MOV_PIVOT_MISSING, MOV_WHEEL_RADIUS_ZERO, MOV_BONE_RADIUS_ZERO)

## Mechanics
- chassis types: `track`, `wheel`, `water` (built on wheel), `railway`, `airborne`, human carrier, `foot` (soldiers)
- `TurnTime` s for a full turn; left out = 1 s (360 degrees per second)
- tracks only: `TurnStart` / `TurnStop` s = how fast the turn rate builds and decays; tracks turn in place
- wheels only: `SteerOn` / `SteerOff` deg/s (steering in, return to straight), `SplineRadius` m; wheels never turn in place and need arcs
- `TurnRadius` m: arc radius the route builder uses at corners; not a limit for turning in place
- wheel chassis needs bones `pivot_front` and `pivot_back` and `wheel*` bones with a radius; steering and wheel spin are derived from them
- track marks and wheel dust come from the track macro and effects, not from the chassis type → skill `mow-mod-models-effects` (`effects-fx.md`)

## Per game
- as64 / mowas2: as above
- goh: adds `helicopter` chassis (GHMOV-28) and altitude requests (GHMOV-62); turn keys are the same ([I]).

## Silently fails
- MOV-03 no `TurnTime` = near-instant turning; vanilla has many such vehicles (aircraft and wheeled ones set `TurnRadius` instead): set it explicitly on a tank
- MOV-19 a wheel chassis can not rotate on the spot: a route with a sharp corner is refused; give room or lower `TurnRadius`
- MOV-20 missing `pivot_front` / `pivot_back`: warning, default wheel geometry (odd steering); a `wheel*` bone with radius 0: error `Wheel radius is zero` / `Invalid bone radius`
- MOV-34 pivot bone names must match exactly (case-insensitive): `pivot_front001` does not count
- changing `{Chassis "track"}` to `"wheel"` without the bones: the vehicle loads and steers wrongly
- MOV-05 `MaxSpeedAtMaxTurn` only matters in direct control
- a faster turn also turns the hull-mounted gun faster: check balance (→ skill `mow-mod-weapons-damage`)

## Verify
- in game order a 180 degree turn and time it; drive a figure of eight in direct control; for wheels drive a tight street corner by move order; log has no wheel error (→ skill `mow-mod-test`)
