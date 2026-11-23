---
name: mow-mod-vehicles
description: Change how vehicles behave in a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh): the vehicle side, not the buy menu. Load when the user says "vehicle", "tank", "chassis", "tracks", "wheels", "Locomotion", "MaxSpeed", "tank is slow", "acceleration", "gears", "turn rate", "turns on the spot", "can not climb", "gets stuck", "pathing", "pather", "drives through walls", "crushes trees", "collision", "tips over", "physics", "crew places", "seats", "gunner", "driver", "passengers", "crew will not get in", "turret", "turret rotation speed", "gun elevation", "armour layout", "which volume is the hull", "fuel", "FuelBag", "refuel", "repair", "supply", "towing", "tow a gun", "boat", "plane", "helicopter", "wheel radius".
---

# mow-mod-vehicles (router): read ONE sub-file for the sub-task

game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh` · gen `--target as64|mowas2|goh`. not as64 → skill `mow-games` first.

## Always
- game installs + vanilla data read-only; write only inside the `<mod>` the user named
- a def is built from includes and macros (`properties/vehicle.ext`, class `.ext` files): read the flattened result with the tool before changing a key; a copy of a shared `.ext` shadows other mods (VFS-01)
- values and names come from the tools for the game and mod at hand, never from memory
- every write tool answers a plan unless `write: true`; `--dry-run` / `--plan` writes nothing
- text CRLF, strings UTF-8, identifiers ASCII
- done = the vehicle driven, crewed and shot at in game + game.log read (→ skill `mow-mod-test`)

## Sub-tasks
| sub-task | read | tools |
|---|---|---|
| what a vehicle def is made of, where each thing lives | vehicle-anatomy.md | `mow_entity_info` `mow_unit_stats` `mow_file_which` |
| top speed, acceleration, braking, gears | speed-and-gears.md | `mow_mod_gen` (set, macro) movlint keylint |
| turning, tracks or wheels, chassis type | turning-and-chassis-type.md | `mow_entity_info` `mow_mod_gen` movlint |
| terrain cost, slopes, pather profile, getting stuck | terrain-pathing.md | `mow_lookup` `mow_file_which` keylint |
| collisions, crushing, tipping, rigid-body physics | physics-collision.md | `mow_lookup` `mow_entity_info` |
| crew places: roles, groups, boarding, doors | crew-places.md | `mow_unit_stats` `mow_mod_gen` (macro, set) firecheck |
| turrets, gun mounts, the bones they need | turrets-and-bones.md | `mow_model_info` `mow_entity_info` firecheck |
| armour layout: which volume is which plate | armour-layout.md | `mow_unit_armor` `mow_model_info` armorsim |
| fuel, repair, ammo supply | supply-fuel-repair.md | `mow_entity_info` `mow_kit_slot` |
| towing, boats, aircraft, rail | towing-boats-air.md | `mow_entity_info` `mow_lookup` |
| lint all vehicle data of a mod | check-vehicles.md | `mow_mod_check` movlint keylint defcheck |

## Across (one line each)
- price, card, crew on the card, ammo box and weapon slots → skill `mow-mod-units` (`vehicle-chassis-movement.md`, `crew-seats.md`, `vehicle-weapon-slots.md`)
- gun, shell, penetration, armour thickness numbers → skill `mow-mod-weapons-damage` (`armour-volumes.md`, `will-it-fire.md`)
- model, bones, volumes as shapes, wheel animations → skill `mow-mod-models-effects` · vehicle scripts (burning, track marks) → skill `mow-mod-scripts`
- a GoH vehicle into AS2 → skill `mow-mod-port` · vehicle AI → skill `mow-mod-ai-bots`

## Depth
- (chassis, vehicle-keys, vehicle-physics, units, terrain, pather, pathfinding, obstacles, colliders, collision, rigid-water, orders), keys/chassis, keys/seats, keys/weaponry, keys/armor, humans/crew · limits MOV-*, KEY-*
- guide via MCP `mow_guide` (`chapter`): 07-units-vehicles-movement, r04-chassis-and-movement, r03-extenders-and-components
- GoH: (not yet tried in game)
- GUI: Units & Balance tab > `units` page (unit files open in the Editor), `balance` page for many units; Models & Sim tab > `models` page (Armour)

## Tell the user
the vehicle(s) touched, old value → new value, files written, shared files copied and who they shadow, what was driven and seen in game.
