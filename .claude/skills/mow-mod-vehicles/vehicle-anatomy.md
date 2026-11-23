# mow-mod-vehicles: what a vehicle def is made of

when: "where is the speed / crew / gun of this tank defined", "what does this macro do", "which file do I copy", "why does my key not apply".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. the flattened facts: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}` → source file, what it inherits (includes, macros), its extenders, what it refers to (model, weapons, ammo, items)
2. as a bought unit: MCP `mow_unit_stats {id:"<unit id>", show:["equipment"], mod:"<mod>"}`
3. which copy of a file wins: MCP `mow_file_which {path:"entity/<..>/<name>.def", mods:[..]}` (same for `properties/<x>.ext`)
4. where a macro is defined and used: MCP `mow_script_find {name:"<macro name>", scope:"all"}`
5. one key's meaning: MCP `mow_lookup {query:"<key>", mode:"name"}`
6. GUI: Units & Balance tab > `units` page; the Editor opens the def with its outline

## The parts
| block | holds |
|---|---|
| `{Extension "<name>.mdl"}` | the model: bones, meshes, volumes |
| `{props ..}` | tags: which script blocks, selectors and AI classes apply |
| `{Chassis "track|wheel|water|.." {Locomotion ..}{Speed ..}{FuelBag ..}}` | movement |
| `{PatherID ..}`, `{collider ..}`, `{obstacleID ..}` | route cost profile, collision group, how others path around it |
| `{placer {place "role" ..}}`, `{boarder ..}` | seats, doors, boarding animations |
| `{weaponry {place "gun" ..}}` | weapon mounts, who fires and loads them |
| `{armor {setting ..}}`, `{Volume ..}` | armour areas and per-volume data |
| `{sensor ..}` | eyes and vision |
| `{extender "inventory" ..}` | the ammo and item box |
| `{component ..}` | damageable parts (engine, tracks, turret) |
- vanilla writes most of this through macros: `{Locomotion ("locomotion") {MaxSpeed 27}}`, `("crew_4_human")`, `("armor_medium" ..)`; keys written after a macro call override it
- macros are defined in the top-level file being read and its includes (GPL-11)
- def keys are case-insensitive; DDA data (cards, presets) is case-sensitive

## Per game
- as64 / mowas2: same blocks and macro files
- goh: same block kinds with more keys (Sealable seats GHHUM-39, Locomotion Slow / Normal / Fast GHMOV-44, helicopter chassis GHMOV-28); the macro names differ.

## Silently fails
- GPL-11 a macro the file's scope does not define: fatal `define not found`
- a mod copy of a def replaces the WHOLE def: a later game patch or another mod's edit to it is lost (VFS-01)
- a key written BEFORE the macro call is overwritten by the macro; MOV-04 a second `Locomotion` block resets the speed settings
- FMT-07 a def `{Volume}` with no shape of that name in the model is dropped
- `props` no script block mentions only log `Unknown props`; the unit then lacks class behaviour (no burn, no track marks)

## Verify
- `mow_entity_info` on the mod shows the changed value and the expected includes; then the vehicle in game (→ skill `mow-mod-test`)
