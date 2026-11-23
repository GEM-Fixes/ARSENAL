# mow-mod-weapons-damage: armour (macro sides, volumes, thickness, threshold, durability)

when: "thicker front armour", "change the turret armour", "my thickness edit does nothing", "skirts", "why does HE break this tank".
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2`. `<mod>` = the user's mod folder.

## Steps
1. read plate by plate: MCP `mow_unit_armor` (`unit`, `mod`) · `mow_unit_stats` (`id`)
   CLI `node tools/armorsim/armorsim.js table <unit> [--game G --mods a,b --folder <mod> --json] [--exe as64|mowas_2]` (six side values per volume + which rule set each, def file:line)
2. change a side of a part: MCP `mow_unit_change` (`mod`, `id`, `what: "armour"`, `value` = "front side rear top" in mm, `part` = the armour part, `write`)
   in a spec: gen op `armor` (`entity`, `macro`, `arg`, `value`, or `items`); sample `node tools/gen/gen.js --sample armor`; run with MCP `mow_mod_gen` (`mod`, `ops`, `write`) or `node tools/gen/gen.js spec --target as64|mowas2 [--plan]`
3. one plate (a volume side): `node tools/armorsim/armorsim.js edit <unit> --volume V --side S --mm N --out <mod> --shared --dry` (drop `--dry` to write; `--shared` is needed when the value is shared by other units)
4. GUI: Models tab > Armour (table, thickness map, edit; not GoH). routes `models/armor/table`, `armor/map`, `armor/edit` via `gui_routes` / `gui_call`
5. lint: `node tools/check/check.js <mod> [--exe as64,mowas2]`; statsheet codes ARMOR_VOLUME_SHADOWED, ARMOR_THICKNESS_ARGS, WARN_ARMOR_AREA_REPEATED

## The rule (shared engine) [V]
- two places hold a thickness: the armour AREA (`{armor {setting "turret" {thickness f s r t} {volumes "turret*"}}}`, usually written by an `armor_<class>` macro call with args front side rear top) and the VOLUME (`{volume "body1" {thickness 40 {front 82} ..}}`)
- a nonzero area value for the hit side wins; 0 there or a volume no area covers → the volume's own value (DMG-06, GPL-04, KEY-16)
- an area matches a volume by the volume's FIRST tag (= its name), wildcard allowed; the first matching area in definition order wins
- left and right both read the area `side`; bottom reads `top`
- `{thickness}` in an area: 1 value = all sides, 2 = front + the rest, 4 = front side rear top. never 3 (DMG-24)
- one part is often several volumes (upper and lower glacis as `body1`, `body2`): a nonzero macro side overwrites them all with one value. to keep the split put 0 on that side, or give own areas per volume name (DMG-25)
- same-named `{setting}` blocks merge; the later thickness replaces, the area order stays at the first definition (DMG-23)
- threshold (is the plate wounded): area `threshold {pierce|blast {value|koef|calibre}}`, else thickness / `projectileDamageThreshold`, else 2/3 of the thickness. `calibre C` = skirts ignore smaller calibres
- durability (when the area breaks): `durability {pierce|blast {value|koef}}`. the vanilla tank macro gives pierce a very large koef: AP practically never breaks hull or turret, only blast does (DMG-07, GPL-05)
- `ray_cast_thickness` = path length x material `steelEquivalent` (concrete, sandbags; slope ignored); `whole_wound`, `disable_damage_acc` flags
- a volume takes blast only with `able blast` (on by default; lost through `{able clear ..}`) (KEY-03, DMG-15)

## Per game
| game | note |
|---|---|
| as64 | as above |
| mowas2 | same rule; armorsim `--exe mowas_2` |
| goh | armour change is not offered (GoH armour forms not mapped); `mow_unit_armor` answers the values of the unit files; armorsim refuses GoH (exit 2). GoH adds plate factors (flaw, cast steel, hardness: GHDMG-37) and part health blocks with no AS2 key (lim PORT-18) |

## Silent fails
- DMG-06 / GPL-04 editing a volume `{thickness}` where the macro sets that side does nothing (gen warns WARN_GEN_SET_THICKNESS_SHADOWED)
- DMG-24 three thickness values: rear and top misaligned + an error line in the log
- DMG-05 which side a face counts as is baked in the `.vol` file; data can not re-side it (model work → see skill `mow-mod-models-effects`)
- KEY-14 volume key `hollow` is ignored
- VFS-01 the def or `.ext` that holds the macro call becomes a full copy in the mod; a shared `.ext` changes every unit that includes it

## Verify
- armorsim `table` again: the "which rule" column must name your change for that side
- in game: shots at that plate from a fixed stand (→ in-game table: `node tools/armorsim/ingame/shottable.js plan <unit> --weapons W:ammo --range M --out DIR`), then read the log (→ skill `mow-mod-test`)
