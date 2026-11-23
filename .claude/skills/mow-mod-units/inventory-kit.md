# mow-mod-units: what a soldier carries (inventory, weapon in hands)

when: "give riflemen an SMG", "more grenades", "what does this soldier carry", "remove the AT grenade", "item is missing in game".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.
A vehicle's ammo box and gun slots → vehicle-weapon-slots.md.

## Steps
1. read: MCP `mow_unit_stats` (`id`, `breed: "army/name"` for one member of a squad, `show: ["equipment"]`, `mod`)
   item names: MCP `mow_weapon_find` (`q`, `group`, `mod`)
2. change: MCP `mow_kit_slot` (`mod`, `id` or `breed`, `add: [{item, count?, filled?, filling?}]`, `del: ["item"]`, `in_hands: "item"`; GoH `card`), preview then `write: true`
   same thing: `mow_unit_change` (`what: "equipment"`, `add`, `del`, `in_hands`)
   spec: gen op `kit` (`breed`, `army`, `period`, `add`, `del`), sample `node tools/gen/gen.js --sample kit`; via MCP `mow_mod_gen` (`ops: [{op:"kit", breed:"rus/rifle", add:[{item:"<name>", filled:true, in_hands:true}], del:["<name>"]}]`)
   GUI: Units tab > Equipment card and its equipment browser (`POST /api/x/units/kit`, `kit/set`)
3. lint: `node tools/humlint/humlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]` (HUM_IN_HANDS_RANGE, HUM_FILLED_N_GLOBAL, HUM_HOLDER_TWO_ITEMS, HUM_WEAPON_NO_TAG)

## Rules (shared) [V unless tagged]
- breed `inventory { {item "<tags>" [n | n dev] [filled | filling "<tags>" n]} .. {in_hands idx} }`
- `item "tags"` picks a stuff by its tag set; `n dev` = count with a random spread
- `filled` = magazine full with the stuff's own ammo; `filling "tags" N` = that ammo, N rounds
- `in_hands idx` = 0-based index among the `item` blocks only
- the box is a grid; each stuff covers `{inventory {size w h}}` cells and stacks only when tagged `stackable`; how many per cell depends on box cell weight and item weight [T]
- carried mass feeds the stamina band: a heavy kit makes a slow soldier
- a weapon needs its type tag AND the tag `weapon` to be used as one (HUM-27)
- reload looks for ammo whose tags hold ALL of the weapon's `filling` tags

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| box size | 6 x 10 | 6 x 10 | 8 x 12 [V data] |
| breed name | `army/name` | same | `army/period/name` |
| gen op `kit` | yes | yes | check the answer: AS2-only ops say `GEN_*_AS2_ONLY` |

## Silent fails
- HUM-21 items that do not fit the box are dropped silently; an `in_hands` index out of range is ignored
- HUM-20 `filled N` rewrites the stuff's `filling.max` globally: every soldier using that stuff is affected [T]
- HUM-23 a non-stackable item with a count other than 1 in a `{user}` entry only warns
- HUM-25 two items for one weapon place: the second is ignored (`HolderWeapon: set user ... ignored`)
- HUM-27 a weapon without the `weapon` tag is treated as a plain item: soldier never fires it
- HUM-28 carrying a one- or two-hand item blocks prone and squat
- LOG-07 an item name that matches no stuff becomes `dummy_checker`: loads, may crash on use (refcheck catches it)
- HUM-32 pistol run animation needs tag `shoot_walking` on the item

## Verify
- `mow_unit_stats` (`show: ["equipment"]`, `mod`) lists the new kit and what the game had
- `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`
- in game: buy the squad, open the soldier's inventory, see the weapon in hands, fire and reload once; read game.log (→ skill `mow-mod-test`)
