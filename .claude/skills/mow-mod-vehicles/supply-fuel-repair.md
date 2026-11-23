# mow-mod-vehicles: fuel, repair, ammo supply

when: "tank runs out of fuel", "unlimited fuel", "fuel does not drain for bots", "how does repair work", "repair kit", "supply truck", "refill ammo", "vehicle can not be repaired", "crew bails out".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
What the ammo box of a vehicle holds → skill `mow-mod-units` (`vehicle-weapon-slots.md`).

## Steps
1. the vehicle's fuel and store: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}` (`FuelBag`, inventory, components)
2. change fuel: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", rows:["<entity>,<key path>,<value>"]}]}` (plan; `write: true` writes)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --entity <id> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
3. change what a supply vehicle carries: MCP `mow_kit_slot {mod:"<mod>", entity:"<supply vehicle>", add:[{item:"<item>", count:4}], del:["<item>"]}` (plan)
4. find the repair, refuel and resupply rules, which are scripts and items: MCP `mow_script_find {name:"repair", scope:"all", q:"<part of a path>"}`; items: `mow_weapon_find {q:"repair"}` / `{q:"fuel"}`
5. the engine side of part damage: MCP `mow_lookup {query:"break repair component", mode:"words"}`

## Mechanics [V unless tagged]
- `FuelBag {volume l}{rate l/km}{remain l}{fuel "tags"}`: fuel is used per distance driven
- fuel drains only while a PLAYER controls the vehicle; with no `fuel` tag none is used; at 0 fuel the vehicle no longer asks for crew
- refuelling in AS2 is an item action: a soldier with a can or barrel takes fuel from one vehicle and pours it into another [I, from play]
- repair: a soldier with a repair kit item and the Repair order; a crewman dismounts to do it [I]. what can be repaired and how long is data in the vehicle's parts and scripts
- vehicle parts (`component`: engine, tracks, turret, gun) change damage state; the engine fires `break` and `repair` events with the part as context; the scripts decide the effects (immobile, burning, crew bail-out)
- ammo: units restock from a vehicle or crate whose inventory holds the items; matching is by item tags → skill `mow-mod-infantry` (`ammo-reload.md`)
- there is no supply radius or logistics system in AS2 data: everything is items, orders and scripts

## Per game
- as64 / mowas2: as above
- goh: supply zones exist in data: `{fuel {amount}{max}{value}}` refuels vehicles for a cost (GHGPL-27) and `{mechanicResources ..}` refills engineers' repair resources (GHGPL-28); helicopters land when low on fuel (GHMOV-28). none of this ports to AS2 as data

## Silently fails
- bots and AI-driven vehicles never drain fuel: a low `volume` punishes only human players
- a `FuelBag` without the `fuel` tag list uses nothing
- GoH `limit 0` = no fuel, and a per-unit price of 0 = free refuel (GHGPL-27)
- GPL-17 a towed gun can not fire [I]
- TST-44 a vehicle can count as destroyed yet stay repairable; a red hull is sometimes repairable: decide kills by part state, not colour
- MIS-42 in missions a killed crewed tank reads `not moveable`, never `dead`
- removing the repair kit item from a mod's soldiers removes repair for bots and players alike

## Verify
- in game drive the vehicle in direct control until the fuel reading moves; break a track and repair it with a kit; restock from the supply vehicle; log read (→ skill `mow-mod-test`)
