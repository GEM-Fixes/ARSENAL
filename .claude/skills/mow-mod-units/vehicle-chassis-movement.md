# mow-mod-units: vehicle speed, turning, gears, fuel, pathing

when: "make the tank faster", "turns too fast / slow", "acceleration", "fuel", "can not climb", "vehicle will not move", "gets stuck", "drives through walls".
game: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. `<mod>` = the user's mod folder (full path), G = game install.
Soldier foot speed lives in the human chassis (Run/Crawl rows)

## Steps
1. read the def and what it inherits: MCP `mow_entity_info` (`names: ["<id>"]`, `mod`); the winning file: `mow_file_which` (`path`, `mods`)
2. change a key: MCP `mow_mod_gen` (`mod`, `ops: [{op:"set", rows:["<entity>,<key path>,<value>"]}]`, `write`) or a macro argument: `{op:"macro", entity, macro, arg, value}` (sample `node tools/gen/gen.js --sample macro`; row form: `node tools/gen/gen.js --sample all`)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G [--mods d] --entity <id> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
   GUI: Units tab (unit files open in the Editor); many units: Balance page
3. lint: `node tools/movlint/movlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]` (Locomotion keys, wheel bones) and `node tools/keylint/keylint.js <mod folder> [--game dir] [--exe ..]` (GEARS_BAD, pather and collider names)

## Keys (shared), vehicle-physics, chassis, pather [V]
- `{Chassis .. {Locomotion ..} {Speed {Slow}{Normal}{Fast}} {FuelBag ..}}`; vanilla calls `{Locomotion ("locomotion") {MaxSpeed N}}`, later keys override the macro
- `MaxSpeed` km/h: top speed in DIRECT control only; ordered moves use the `{Speed}` block (defaults are fractions of MaxSpeed)
- `StartTime` `BrakeTime` `StopTime` seconds: acceleration, braking, coasting
- `TurnTime` seconds for a full turn; `TurnStart` / `TurnStop` tracks only; `TurnRadius` metres for route corners; `SteerOn` / `SteerOff` wheels only
- `Gears` / `RearGears`: up to 5 fractions of MaxSpeed, strictly ascending
- `MaxSlope`, `FallSlope` degrees: pull falls to zero at MaxSlope
- `FuelBag {volume}{rate}{remain}{fuel tags}`: drained only while a player controls the vehicle; no `fuel` tag = no use
- `PatherID` = a `{Profile}` of `set/pather.set` (terrain costs, radius); terrain speed factor never above 1: roads do not exceed MaxSpeed
- chassis type decides turning: tracks turn in place, wheels need arcs, boats need water
- collisions and crushing: `{collider "name"}` → `set/colliders.set`, `set/obstacles.reg`, obstacles

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| ordered speed | `{Speed}` block | same | `Slow` `Normal` `Fast` INSIDE `Locomotion`; `{Speed}` skipped, no fraction defaults (GHMOV-44) |
| `CostFactor` | unknown key: fatal token error | same | read and dropped (GHMOV-45) |
| movlint | yes | yes | reads the GoH key set |
- porting vehicle data either way needs these two fixed (→ skill `mow-mod-port`)

## Silent fails
- MOV-06 raising `MaxSpeed` alone does not speed up ordered moves: edit `{Speed}`; MOV-05 `MaxSpeedAtMaxTurn` is direct control only
- MOV-03 no `TurnTime` = near-instant turning (default 1 s per full turn): set it explicitly
- MOV-04 a second `Locomotion` block after `{Speed}` resets Slow/Normal/Fast: `{Speed}` goes after the last `Locomotion`
- MOV-07 Slow <= Normal <= Fast is not checked: odd gait picks
- MOV-02 / KEY-15 more than 5 gears or not ascending: only logged
- MOV-09 materials (mud, snow, ice) have no speed effect; only ground types do. MOV-12 a pather profile that omits a type treats it as free
- MOV-19 wheeled chassis never turn in place; MOV-20 / MOV-34 wheel chassis need bones named exactly `pivot_front` / `pivot_back`
- MOV-01 unknown `Locomotion` key and MOV-13 / KEY-30 unknown `PatherID` are loud: `unexpected token`, `Unit: Wrong pather name`
- MOV-22 tilted over 70 degrees a vehicle can not be crewed or driven; MOV-31 towing needs `tractor` / `trailer` tags and link bones within 12 m
- GPL-17 a towed gun can not fire [I]

## Verify
- in game, both ways: drive it in direct control (MaxSpeed, steering) AND give a move order (Slow/Normal/Fast); turn in place; climb a slope; read game.log (→ skill `mow-mod-test`)
- the number alone is [I] until driven: say which of the two modes was seen
