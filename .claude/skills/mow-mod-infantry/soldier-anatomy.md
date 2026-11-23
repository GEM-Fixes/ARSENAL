# mow-mod-infantry: what a soldier is made of

when: "where are soldier values stored", "which file do I edit for all soldiers", "what is human.ext", "breed or entity", "why does my change hit every soldier".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. one soldier as bought: MCP `mow_unit_stats {id:"<card or squad id>", breed:"<army/name>", show:["equipment","look"], mod:"<mod>"}`
2. the human entity and what it includes: MCP `mow_entity_info {names:["<human entity>"], mod:"<mod>"}` (source file, inherited files, extenders)
3. which copy of a shared file wins: MCP `mow_file_which {path:"properties/human.ext", mods:[..]}`
4. a rule or key: MCP `mow_lookup {query:"humans", mode:"topic"}` then one block; one row `mow_limit {ids:["HUM-06"]}`
5. GUI: Units & Balance tab > `units` page; the Editor opens the files

## The layers
| layer | file | holds |
|---|---|---|
| human entity | a `.def` whose description starts `human` + `properties/human.ext` | body: vitality (health, stamina), inventory box and holders, sensor (eyes, vision), foot chassis speed table, stance machine |
| breed | `set/breed/**/<name>` | who he is: skin, portrait, icon, nationality, voice, `perks`, `veterancy`, `inventory`, `armors` |
| skin | `entity/humanskin/<name>` | the uniform model on the shared human skeleton |
| abilities | `set/ability/*.set` | what each perk kind and level means |
| scripts | `set/interaction_entity/human.inc` (block `"human"`) | what a hit does: damage effects, dying, bleeding |
| stuff | `set/stuff/**` | every carried item: weapon, ammo, helmet, vest |
| card / squad | `set/multiplayer/units/**` | which breeds are bought together and for how much |
- so: "all soldiers" = `human.ext` or `human.inc`; "this kind of soldier" = the breed; "this purchase" = the card
- a breed is looked up by name from a card's `content "breed:n"` or a script `spawn_human "breed"`
- the soldier is also an item (`stuff` tagged `human`): a body can be carried

## Per game
- as64 / mowas2: same layers and file names; breed named `army/name`; inventory box 6 x 10
- goh: breed named `army/period/name`; box 8 x 12 [V data]; ability kinds AS2 has as ids only (Medic, Mechanic .., GHHUM-26); spawn rank comes from veterancy perks (GHHUM-19).

## Silently fails
- HUM-18 an unknown breed name: warning only, the man spawns in skin `skeleton`
- HUM-19 breed `tags`: the engine reads only `kamikaze`; other tags matter only if a script or selector reads them
- HUM-06 health damage never kills by itself: the script must fire `{die}`
- HUM-30 animation names are chosen by the game: data can not add a new motion without a name the engine already asks for
- a mod copy of `human.ext` or `human.inc` drops every other mod's soldier changes → skill `mow-mod-together`

## Verify
- `mow_unit_stats` shows the soldier with the mod's values; in game buy him, select him: portrait, kit, health bar as expected; log read (→ skill `mow-mod-test`)
