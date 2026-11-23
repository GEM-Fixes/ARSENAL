# mow-mod-units: crew, seats, passengers

when: "tank spawns without crew", "more crew", "add passenger seats", "gun does not reload / fire with crew inside", "crew will not get in", "who is the gunner".
game: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. `<mod>` = the user's mod folder (full path), G = game install.

## Steps
1. read: MCP `mow_unit_stats` (`id`, `show: ["equipment"]`, `mod`) for the card and its crew; `mow_entity_info` (`names: ["<id>"]`, `mod`) for the def, its seat macros and includes
2. crew the card spawns with = card `content`: MCP `mow_mod_gen` (`mod`, `ops: [{op:"card", unit:"<id>", army:"<tag>", fields:{content:"<id> ( <crew breed>:N )"}}]`, `write`)
3. seats of the vehicle (def `placer` block or a `crew_N_human*` / `seat_human` macro): op `macro` (`entity`, `macro`, `arg`, `value`) or op `set` rows; by hand:
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --entity <id> --set p=v|--add p=v|--del p [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
   GUI: Units tab (unit files open in the Editor)
4. will the gun work with those seats: `node tools/firecheck/firecheck.js <def> [--exe as64|mowas_2|goh] [--game G] [--dist N] [--json]`
5. check: `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`

## Rules (shared) [V unless tagged]
- card `content "vehicle ( crew[:n] )"`: names in parens after a vehicle are its crew; `trailer` in parens hooks to the tractor before it
- def `placer { place "role" {LinkBone ..}{Group ..}{Pose ..}{Visor ..}{Stealth b} .. }`; also `{place "role" remove}`, `{state "role" {disable}}`
- roles `driver driver1 driver2 gunner gunner1 gunner2 charger commander` are crew; every other role is a passenger
- seating picks the first FREE seat in declaration order whose role STARTS WITH the asked name
- a weapon place names its `gunner` and `charger` seat groups: an empty seat of the group = that gun does not fire or reload
- `Group` ties seats that work together (gunner + charger); crew move to a spare seat of the same group
- boarding needs a stopped vehicle; bones and `boarder` door animations must exist in the model (see skill `mow-mod-models-effects`)
- a seated soldier keeps his own health; his weapon skill uses the `vehicle` posture; crew skill perks `tank` `vehicle` `cannon` show in the vehicle panel
- fuel 0 = the vehicle no longer asks for crew [V movement/vehicle-keys]

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| seat keys | as above | same | adds `Sealable` hatch seats (GHHUM-39) |
| leaving | any door | same | only doors linked to the seat's node (GHHUM-42) |
| kill score to crew | by role name | same | shared among crew-group seats (GHHUM-13) |
| crew when host is removed | destroyed | same | survive (GHHUM-46) |
- for more; GoH rows are not yet tried in game

## Silent fails
- HUM-34 prefix match: "gunner" may take `gunner2`, so seat ORDER in the def decides who sits where
- HUM-33 boarding waits while the vehicle moves; a non-vehicle host refuses when an enemy is inside
- HUM-35 emit mode 3 marks the placer busy: crew can not be re-ordered and aiming stops
- HUM-18 a crew name in `content` that is no breed: warning only, `skeleton` soldier
- MOV-22 a vehicle tilted over 70 degrees can not be crewed
- role names are also used by interaction scripts (`kill_crew "role"`, `crew_in_place`): renaming a role breaks those conditions with no error [V keys/seats] (see skill `mow-mod-scripts`)
- VFS-01 the def or include copy made for the change replaces the whole vanilla file

## Verify
- in game: buy the vehicle (crew present, each on the right seat), fire and reload the main gun, make the crew leave and board again, load passengers; read game.log (→ skill `mow-mod-test`)
- firecheck is warnings only and static: say so
