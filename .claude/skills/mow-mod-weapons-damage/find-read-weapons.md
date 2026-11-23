# mow-mod-weapons-damage: find a weapon, shell or item and read its numbers

when: "which file is the 75 mm gun", "what does this gun do", "list all shells", and before any change. Names differ per mod: always look them up.
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. G = AS2 install, `<mod>` = the user's mod folder. Reads only.

## Steps
1. find by a part of the name: MCP `mow_weapon_find` (`q` = part of the file name, `group` = a `set/stuff` folder such as gun, mgun, rifle, ammo; `mod` = full path to read a mod on top; `limit`)
   one exact match also answers its file and the values written in it (range, damage, reload, speed); the rest is inherited from its pattern
2. the gun a unit carries, with its armour: MCP `mow_unit_stats` (`id`, `mod`) → main gun penetration at 100 m, damage, reload
3. raw file, include chain, what refers to it: MCP `mow_entity_info` (`names` up to 8, `mods` / `mod`)
   CLI `node tools/entityindex/entityindex.js <gameDir|-> [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--folder dir] [name...]`
4. tables of everything: CLI `node tools/statsheet/statsheet.js [gameDir] [--exe as64|mowas_2|goh] [--mods a,b] [--folder dir] [--scope all|mod] [--sheet weapons,ammo,armor,price|research|all [--fmt md|csv] [-o f] [--filter re]]`
   `--scope mod` = only what the mod ships; `--filter` narrows by a regular expression
5. which copy of the file the game reads: MCP `mow_file_which` (`path` as the game sees it, `mods` in load order)
6. GUI: Units & Balance tab > Balance (sheet of every buy-panel unit with gun, cal, pen, dmg, reload, range columns); Models tab > Armour lists guns and shells for a shot. Find the routes with `gui_routes`, call with `gui_call`

## Where the data lives (shared) [V]
- weapons: `set/stuff/<group>/<name>` (gun, mgun, rifle, pistol ...); shells: `set/stuff/shell/`; shared macros in each folder's `.presets` (`damage_*` = penetration tables, `accuracy_curve_*`, `speed_*`, `fg_*` = blast layers)
- a weapon inherits from a pattern (`gun.pattern`, `bullet.pattern`); a file shows only what it overrides
- the unit side: `{weaponry {place "gun" {weapon "<name>" filling "<ammo tags>" n}}}` in the def
- file name = tags split on `.`: a file `bullet76.he2` is ammo with tags `bullet76 he2`

## Checks statsheet prints (all silent in game)
| code | means | row |
|---|---|---|
| PARAM_BLOCK_SHADOWED | an earlier `parameters` block with a subset of the tags hides a later one | DMG-01 |
| PARAM_TAG_UNKNOWN | a `parameters` block names tags no ammo has | DMG-01 |
| DMG_TABLE_UNTERMINATED | penetration table with no end point | DMG-02 |
| WARN_PEN_TABLE_SHORT | table ends before range+5 | GPL-03 |
| BLASTWAVE_REPLACED | `damage blastwave` without `add` dropped a layer | DMG-13 |
| ARMOR_VOLUME_SHADOWED | per-volume thickness hidden by the armour macro | DMG-06 |
| ARMOR_THICKNESS_ARGS | 3 thickness values | DMG-24 |

## Per game
| game | note |
|---|---|
| as64 | reads base + `as64/core`; default |
| mowas2 | `--exe mowas_2`: no `as64/core` layer, same forms |
| goh | same file form under the GoH resource tree; ammo items named `bullet<nation>_<cal>`; `statsheet --exe goh --sheet price` gives GoH buy price parts, `--sheet research` the research tree; overmatch tables exist only there (GHDMG-27, GHKEY-59) |

## Silent fails
- LOG-07 a weapon or ammo name that does not exist becomes `dummy_checker`: load looks fine, crash later on use
- KEY-25 a `projectileDamageTable` hides `curve` and `projectileDamage` for armour; they still feed infantry damage

## Verify
- the name found is the winning copy (`mow_file_which`) before you change it
- numbers read from a sheet are static: say so
