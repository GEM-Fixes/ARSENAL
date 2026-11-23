# mow-mod-weapons-damage: grenades, AT grenades, mines, molotov

when: "stronger grenade", "longer throw", "longer fuse", "new AT grenade", "molotov", "mine blast", "soldiers do not carry my grenade".
game word: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. `<mod>` = the user's mod folder.

## Steps
1. find the item: MCP `mow_weapon_find` (`q` = part of the name, `mod`); who carries it: `mow_unit_stats` (`id` or `breed`, `show`)
2. a new one from an old one: MCP `mow_mod_gen` (`mod`, `ops`, `write`) with an `item` op: `id`, `like` (a grenade, mine or item), then `throw` (range, angle), `fuse`, `mass`, `weight`, `size`, `blast` (layers), `cumulative`, `entity`, `tags`, `damage_edit`
   sample on real names: `node tools/gen/gen.js --sample item` (a long-fuse grenade: thrown further, bigger blast)
   CLI `node tools/gen/gen.js spec.yaml|json --target as64|mowas2|goh [--plan] [--out dir] [--game G] [--goh H]`
3. change one value of an existing item: `node tools/patch-entity/patch-entity.js <mod> --game G --file <item key> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`, or gen op `set`
4. give it to soldiers: MCP `mow_kit_slot` (`mod`, `id` or `breed`, `add`, `del`, `write`) or gen op `kit` (`breed`, `army`, `add`, `del`) (→ skill `mow-mod-units`)
5. name and inventory picture: gen ops `text`, `stuffmodel`; the icon → skill `mow-mod-text-ui`; model and explosion effect → see skill `mow-mod-models-effects`
6. GUI: Units & Balance tab > Units page > Equipment card (equipment browser); routes via `gui_routes`
7. lint: `node tools/check/check.js <mod> [--exe as64,mowas2,goh]`

## Facts (shared engine) [V]
- a grenade is a stuff item whose damage is the same `damage` effect list as a shell: `damage blastwave {energy}{area r0 r1}` layers (first without `add`, more with `damage add blastwave`), `damage fire {radius}{heating}{time}` for incendiaries, `cumulative` for shaped charges
- blast falls linearly from the inner to the outer radius; soldiers prone or in cover are hit as if further away
- a molotov-type item is a fire sphere: it ignites what its `heating` can heat past the target's `inflammation_time`; soldiers ignite almost at once, vehicles need long heating [V data values per mod]
- mines and charges: `explosive` scripts detonate on their own events; a mine entity uses `extender "mine"` (KEY-29)
- every blast layer of every carried item counts into `explosive_amount` of the carrier (vehicle cook-off odds: DMG-18)
- throw range is short by nature: a thrown AT grenade unit kills at close stands, not at long ones (lim PORT-141 [V]): test under 50 m
- some items work only in direct control (ammo-drop grenade, radio signal, plain flamethrower) [I] GPL-16
- AI choice of grenade against a target → skill `mow-mod-ai-bots`

## Per game
| game | note |
|---|---|
| as64 | as above; inventory box 6 x 10 |
| mowas2 | same; `--target mowas2` |
| goh | same item form; inventory box 8 x 12 [V data]; gen `--target goh` writes outside H; not run in game [T] |

## Silent fails
- KEY-17 / DMG-13 `damage blastwave` without `add` on a clone replaces the base's first layer
- KEY-02 a key other than `energy`, `area` in the blast block: "unexpected token"
- HUM-21 an item that does not fit the inventory box is dropped silently
- LOG-07 a kit that names an item which does not exist: `dummy_checker`, crash when used
- SDL-60 one entity stem under two root classes: a thrown grenade from it can crash
- DMG-17 an entity with no `inflammation_time` never ignites, whatever the fire item
- LOC-02 a missing name key shows the raw key in the inventory

## Verify
- `mow_weapon_find` (`q` = new id, `mod`) finds it; `mow_unit_stats` shows it in the soldier's kit
- in game: throw it by direct control at soldiers and at a light vehicle from a measured distance; time the fuse; read the log (→ skill `mow-mod-test`)
