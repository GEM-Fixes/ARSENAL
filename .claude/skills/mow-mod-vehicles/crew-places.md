# mow-mod-vehicles: crew places (roles, groups, boarding, doors)

when: "crew will not get in", "gun does not reload with crew inside", "wrong man is the gunner", "add a seat", "passengers on the hull", "crew exits on the wrong side", "commander hatch".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Who the card spawns as crew, and the short how-to → skill `mow-mod-units` (`crew-seats.md`). This file is how seats work.

## Steps
1. seats, roles and seat macros: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}`; the crew a card brings: `mow_unit_stats {id:"<unit id>", show:["equipment"], mod:"<mod>"}`
2. seat and door bones in the model: MCP `mow_model_info {model:"<entity>", mod:"<mod>", show:["bones"]}`; boarding sequences: `mow_anim_list {model:"<entity>", q:"board"}`
3. change a seat macro argument or a key: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"macro", entity:"<entity>", macro:"<seat macro>", arg:"<arg>", value:"<v>"}]}` or `{op:"set", rows:[..]}` (plan; `write: true` writes)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --entity <id> --set p=v|--add p=v|--del p [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
4. will the gun work with those seats: `node tools/firecheck/firecheck.js <def> [--exe as64|mowas_2|goh] [--game G] [--json]`
5. lint: `node tools/defcheck/defcheck.js <mod dir> [--game G] [--exe as64|mowas_2] [--summary]` (def bones against the model) · MCP `mow_mod_check {mod:"<mod>"}`

## Mechanics [V unless tagged]
- `placer {place "role" {LinkBone ..}{Group ..}{Pose ..}{Visor ..}{Attach ..} ..}`; also `{place "role" remove}`, `{state "role" {disable}{broken}}`
- crew roles: `driver driver1 driver2 gunner gunner1 gunner2 charger commander`; any other role is a passenger
- a seat is free when not disabled, not broken, not occupied and not reserved
- boarding asks for a role by PREFIX and takes the first free seat in declaration order
- `Group` ties seats that work a weapon together; a weapon place names the seat groups of its `gunner` and `charger`: an empty one = no fire or no reload
- with too few men roles are swapped inside the group; one man does one job at a time [I]
- `boarder`: doors, nodes and `anm` sequences walk the man in; the vehicle must be stopped and of a side that may crew it
- `Visor` on a seat gives its occupant the vehicle's eyes

## Per game
- as64 / mowas2: as above
- goh: `Sealable` hatch seats (GHHUM-39); a seat leaves only by doors linked to its node (GHHUM-42); kill score is shared by crew group (GHHUM-13); crew survive when the host is removed (GHHUM-46)

## Silently fails
- HUM-34 prefix match: "gunner" may take `gunner2`: seat ORDER in the def decides who sits where
- HUM-33 boarding waits while the vehicle moves; a non-vehicle host refuses while an enemy is inside
- HUM-35 emit mode 3 marks the placer busy: crew can not be re-ordered and aiming stops
- MOV-22 a vehicle tilted over 70 degrees can not be crewed
- a `LinkBone` the model lacks: the man sits at the origin or the seat is dead (defcheck)
- a boarding sequence the model lacks: he appears inside with no walk-in
- MIS-39 vehicles placed in a mission file are empty; MIS-52 a boarded man refuses waypoint orders
- fuel 0: the vehicle no longer asks for crew [V movement/vehicle-keys]

## Verify
- in game board an empty vehicle with exactly the crew count, then one man fewer: who takes which seat, does the gun fire and reload, do they exit on the right side; passengers too; log read (→ skill `mow-mod-test`)
