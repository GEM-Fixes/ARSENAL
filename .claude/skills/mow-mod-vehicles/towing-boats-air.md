# mow-mod-vehicles: towing, boats, aircraft, rail

when: "truck will not hook the gun", "tow a cannon", "boat refuses the order", "make a landing craft", "plane", "helicopter", "train", "amphibious vehicle".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. chassis type, tags and link bones: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}`; bones: `mow_model_info {model:"<entity>", mod:"<mod>", show:["bones"]}`
2. rules per kind: MCP `mow_lookup {query:"movement/chassis", mode:"topic"}`; water and bodies: `{query:"movement/rigid-water", mode:"topic"}`; one row: `mow_limit {ids:["MOV-31"]}`
3. start from a vanilla unit of the same kind (clone → skill `mow-mod-units` `clone-a-unit.md`), then change keys: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", rows:[..]}]}` (plan)
4. lint: `node tools/movlint/movlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--summary]` (water chassis needs the pivot bones too) · MCP `mow_mod_check {mod:"<mod>"}`

## Mechanics [V unless tagged]
- towing: the tractor carries tag `tractor`, the towed unit `trailer`; they hook bone `link1` / `link2` when close; on a card, `trailer` in the crew parentheses hooks it to the vehicle before it
- a towed gun must be unhooked (toggled to firing) before it shoots [I]
- `water` chassis is built on the wheel chassis: same steering keys, same pivot bones; it moves only on water ground types
- an amphibious unit = a pather profile that accepts water types plus a chassis that works there; ground type decides, not the look of the map
- `railway`: straight-path pather on spline rails
- `airborne`: no path grid; vanilla planes are scripted passes rather than free units
- floating bodies: buoyancy contacts on water types; the ocean surface is visual only

## Per game
- as64 / mowas2: no helicopter chassis
- goh: `helicopter` chassis: engine start time, travel altitude, max altitude, lands when fuel is low (GHMOV-28); altitude requests from scripts (GHMOV-62). a ported helicopter has no chassis to run on in AS2 → skill `mow-mod-port`

## Silently fails
- MOV-31 the hook only works with `link1` / `link2` bones within 12 m and both tags present: else the attach order just fails
- MOV-30 a boat ordered to a point on non-water ground: the order fails
- MOV-23 swimming applies only on water ground types 3 to 5
- MOV-19 wheel (and so water) chassis never turns in place: narrow channels trap boats
- MOV-34 pivot bone names must match exactly
- MOV-32 waves are not in the height map: nothing rides them
- MIS-52 a man serving a gun refuses waypoint orders: unhook and dismount logic must come first in a mission
- GPL-17 a towed gun does not fire

## Verify
- in game hook and unhook the gun from both sides, drive, fire after unhooking; for a boat order moves on water and onto the shore (must refuse); log read (→ skill `mow-mod-test`)
