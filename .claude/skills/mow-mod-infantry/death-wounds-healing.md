# mow-mod-infantry: death, knock-out, bleeding, wounds, healing

when: "soldier is immortal", "soldiers die too easily", "bleeding", "knocked out instead of dead", "medic does not heal", "bandage", "hero never dies", "blood decals".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
How much damage a bullet or blast does → skill `mow-mod-weapons-damage` (`infantry-damage.md`).

## Steps
1. find the scripts that decide: MCP `mow_script_find {name:"die", q:"human"}`; also `health_damage_pierce`, `bleeding`, `health_damage_count`
2. read the rule: MCP `mow_lookup {query:"humans/death", mode:"topic"}`; rows `mow_limit {ids:["HUM-05","HUM-06","HUM-07"]}`
3. change `set/interaction_entity/human.inc` in the mod (a copy replaces the whole file), text CRLF
4. lint: MCP `mow_script_lint {mod:"<mod>"}` · `node tools/humlint/humlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (HUM_DAMAGE_KEY, HUM_THROW_EFFECTS)
   `node tools/ialint/ialint.js <mod folder> [--game dir] [--exe ..]` (INT_HEALTH_NO_DIE = health damage with no path to `{die}`)

## Facts
- the engine only subtracts health and fires effect tags; the script in `human.inc` decides `{die}`
- actions `health_damage_pierce | _blast | _count N | _blow | _crush` share one grammar and name the effects to fire by threshold
- a soldier with the `personage` able (hero) is knocked out instead of killed and dies after a delay unless a medic reaches him; a healed man returns at 50 % health and stamina
- knock-down: brain and senses off for some seconds, then he stands up
- bleeding = the tag `bleeding` and a minimap marker; any health loss over time is script (`{delay}` + `health_damage_count`)
- wounds are decals, visual only
- automatic bandage: the soldier heals himself when below 70 % health, no enemy seen for 5 s, and not a selected player-controlled unit
- medic order heals after a time set by the Medic ability and veterancy

## Per game
- as64 / mowas2: Medic, Mechanic, Fortification, Personage exist as ids; their data syntax is untested (HUM-12 [T])
- goh: those kinds are real (Medic `{rate vet}`, GHHUM-26); morale from kills and `spawn_human` are host-owned and sent to clients (GHNET-93). Not yet tried in game

## Silently fails
- HUM-06 no `{die}` reached = an immortal soldier
- HUM-05 the engine drains nothing while bleeding; GPL-12 one vanilla script set applies bleeding only to player-controlled units [I]
- HUM-07 a damage table with 4 or fewer effects: `Throw effects not loaded`; the key is spelled `explosive_treshold`
- HUM-08 at most 16 wound decals per entity, oldest removed
- HUM-38 a selected wounded soldier does not bandage himself: he waits for an order
- MIS-57 in missions the `dead` filter also matches knocked-out men
- changing `human.inc` changes every soldier of every army and every mod loaded before

## Verify
- lint clean; in game shoot soldiers of the changed kind with a rifle and with HE, count hits to death, watch a knocked-out hero and a medic; log has no `Throw effects not loaded` (→ skill `mow-mod-test`)
