# mow-mod-vehicles: terrain cost, slopes, pather profile, getting stuck

when: "tank will not cross the river", "slower in mud", "faster on roads", "can not climb the hill", "vehicle refuses the order", "gets stuck", "Wrong pather name", "make a unit amphibious".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. the unit's profile: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}` (`PatherID`, `MaxSlope`, `FallSlope`)
2. the profile table that wins: MCP `mow_file_which {path:"set/pather.set", mods:[..]}`, then Read the `{Profile "name" ..}`
3. rules: MCP `mow_lookup {query:"movement/pather", mode:"topic"}`; `{query:"movement/terrain", mode:"topic"}`
4. change: a new profile in a mod copy of `set/pather.set` (the copy replaces the whole file), then point the unit at it: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", rows:["<entity>,PatherID,<name>"]}]}` (plan)
5. lint: `node tools/keylint/keylint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (WARN_PATHER_UNKNOWN) · MCP `mow_mod_check {mod:"<mod>"}`
6. the map side (what ground type is painted where) → skill `mow-mod-maps-missions`

## Mechanics
```
{Profile "name" {Network}{Human}{LinearPath}{BattleCrusher}{Priority N}{Radius m}
  {Terrain "type" K [accepted]..} {Height c0..c14}}
```
- ground types are a fixed list: undef, ground, no_pass, shallow_water, water, deep_water, swamp, road, no_pass_human
- speed factor on a type = 1 / (cost + 1), never above 1; a negative cost blocks
- `Height`: 15 slope classes with a cost each; negative blocks. vanilla tank profiles block the steep classes
- `Radius` m: clearance to obstacles; `Priority`: who yields in traffic; `BattleCrusher`: drives over crushable obstacles once in contact
- def `MaxSlope` deg: pull falls to zero there; beyond `FallSlope` the vehicle slides as a physics body
- ground MATERIAL (mud, snow, ice, grass) is separate from ground TYPE and has no speed effect

## Per game
- as64 / mowas2: as above
- goh: Locomotion `CostFactor` exists but is dropped (GHMOV-45); map grid format is always the newer layout (GHMAP-16).

## Silently fails
- MOV-13 an unknown `PatherID`: `Unit: Wrong pather name`, the unit fails to load
- MOV-10 an unknown `Terrain "name"` in a profile resolves to type `undef` and overwrites ITS cost
- MOV-12 a profile that leaves a type out treats it as free (cost 0), except `undef`
- MOV-11 `accepted 0` blocks only AI free movement: player orders still go in
- MOV-09 materials do not slow; only ground types do (paint `swamp` to slow)
- MOV-08 roads never exceed MaxSpeed
- MOV-14 tanks plan no route over about 30 degrees with vanilla height costs
- MOV-21 past `MaxSlope` no pull; MOV-22 tilted over 70 degrees the vehicle can not be crewed or driven
- MOV-16 a blocked order fails and is re-planned only if the unit moved since; MOV-18 the stuck escape gives up after 21 tries
- MOV-15 obstacle cost is a flat add per crossing, not by length

## Verify
- in game order the vehicle across each ground type of a test map (road, field, shallow water, slope) and time it; an order onto blocked ground must be refused; log read (→ skill `mow-mod-test`)
