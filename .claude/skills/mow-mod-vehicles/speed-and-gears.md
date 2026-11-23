# mow-mod-vehicles: top speed, acceleration, braking, gears

when: "make the tank faster", "MaxSpeed changed but nothing happened", "accelerates too slowly", "brakes", "gears", "reverse speed", "fast in direct control, slow on orders".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`.
The short how-to for one unit is also in skill `mow-mod-units` (`vehicle-chassis-movement.md`); this file is the mechanics.

## Steps
1. read what applies: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}` (the `Locomotion` macro call and the keys after it)
2. change a key: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", rows:["<entity>,<key path>,<value>"]}]}`; a macro argument: `{op:"macro", entity:"<entity>", macro:"<name>", arg:"<arg>", value:<v>}` (plan; `write: true` writes)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G [--mods d] --entity <id> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
3. lint: `node tools/movlint/movlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]` (MOV_LOCO_KEY) · `node tools/keylint/keylint.js <mod folder> [--game dir] [--exe ..]` (GEARS_BAD) · `node tools/refcheck/refcheck.js <gameDir> --mods <mod> --scope mod` (SPEED_BEFORE_LOCO)
4. many vehicles at once: GUI Units & Balance tab > `balance` page; MCP `mow_balance_check {mod:"<mod>", q:"tank"}` to see who is out of line

## Mechanics
- `MaxSpeed` km/h: top speed in DIRECT control, scaled down by terrain
- ordered moves use `{Speed {Slow}{Normal}{Fast}}`; defaults are fixed fractions of MaxSpeed, so an ordered tank never reaches MaxSpeed
- `StartTime` s: acceleration (top gear reaches MaxSpeed in about StartTime); `BrakeTime` s: braking; `StopTime` s: coasting friction, also subtracted while accelerating
- `Gears` / `RearGears`: up to 5 fractions of MaxSpeed, strictly ascending; each gear caps speed at its fraction and accelerates harder the lower it is; shift up near 90 % of the gear's cap
- `MaxSpeedAtMaxTurn` km/h: speed kept while turning hard, direct control only
- `GearSwitchDelay`: wait after reversing direction in direct control
- times are written in seconds, speeds in km/h; keys are case-insensitive
- crew skill perks (`tank`, `vehicle`) scale what the crew gets out of it

## Per game
- as64 / mowas2: `{Speed}` block after the last `Locomotion`
- goh: `Slow` `Normal` `Fast` are read INSIDE `Locomotion`, the `{Speed}` block is skipped and there are no fraction defaults (GHMOV-44); top speed is `Fast` x terrain unless the run key is held, times the share of manned cannon seats (GHMOV-46); `CostFactor` is read and dropped (GHMOV-45). AS2 data on GoH keeps 5 / 10 / 20 km/h; GoH data on AS2 is `unexpected token` → skill `mow-mod-port`

## Silently fails
- MOV-06 raising `MaxSpeed` alone does not speed up ordered moves: edit `{Speed}` too
- MOV-04 a second `Locomotion` block after `{Speed}` resets Slow / Normal / Fast
- MOV-07 Slow <= Normal <= Fast is not checked (vanilla has many with Slow above Normal): the pick for an order becomes odd
- MOV-02 / KEY-15 more than 5 gears or not ascending: only logged
- MOV-05 `MaxSpeedAtMaxTurn` does nothing for AI or ordered moves
- MOV-01 an unknown `Locomotion` key: `unexpected token` (loud)
- MOV-08 roads never raise speed above MaxSpeed: the terrain factor is at most 1

## Verify
- in game time the vehicle over a measured stretch twice: once by move order, once in direct control; compare with the old values; log read (→ skill `mow-mod-test`)
