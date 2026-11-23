# mow-mod-infantry: squads from the soldier side

when: "squad member does not spawn", "who is the squad leader", "squad icon is wrong", "squad costs zero", "do squad mates share ammo / morale", "squad breaks up".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Changing members, count and price of a squad card → skill `mow-mod-units` (`squads.md`).

## Steps
1. the squad as bought: MCP `mow_unit_stats {id:"<squad id>", mod:"<mod>"}` → members with breed and count; one member: add `breed:"<army/name>"`, `show:["equipment"]`
2. preview a member change: MCP `mow_unit_change {mod:"<mod>", id:"<squad id>", what:"squad", value:"<members>"}` (plan; the value form is in the tool's answer and in skill `mow-mod-units`)
3. every member breed must exist for that army: MCP `mow_file_which {path:"set/breed/mp/<army>/<breed>.set", mods:[..]}`
4. lint: `node tools/humlint/humlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (WARN_HUM_BREED_UNKNOWN) · MCP `mow_mod_check {mod:"<mod>"}`

## Facts [V unless tagged]
- a squad card's content is a list of breed names with counts; each member is an ordinary soldier built from his breed
- the squad picture is the member icon with the highest `icon_priority`
- squad mates search each other's inventories for ammo when their own runs out
- morale: a kill or a death within 20 m is shared by nearby friends; men close together pull their morale toward each other. this works by distance, not by squad membership
- a squad leader, where the squad has one, receives the order for the squad (bots order only the leader)
- veterancy score is per soldier, not per squad
- cost, command points and score of a squad come from its members' declarations for that army

## Per game
- as64 / mowas2: breeds `army/name`; squad cards under `set/multiplayer/units/**`
- goh: breeds `army/period/name`; cards carry `squad_cost_factor`, `doctrine`, `conditions` (GHMIS-84): a squad can be hidden by doctrine (GHGPL-05).

## Silently fails
- MIS-75 a member breed with no `set/breed/mp/<army>/<breed>.set`: preload warning, that member does not spawn [I]
- MIS-76 a member breed with no `mp/<army>/<breed>` declaration: its cost, CP and score are unset, the squad's totals come out wrong or zero [I]
- HUM-18 a wrong breed name: a `skeleton` member
- MIS-50 a crewed card whose vehicle can not be created crashes when the crew is added
- GPL-10 unit limits count purchases and are never given back when the squad dies
- a squad name used by bot buy lists must be updated there too → skill `mow-mod-ai-bots`

## Verify
- in game buy the squad: count the men, check each one's kit and the squad icon and price in the buy menu; log has no preload warning for a breed (→ skill `mow-mod-test`)
