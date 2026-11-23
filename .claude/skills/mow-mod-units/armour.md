# mow-mod-units: armour of one unit (the short way)

when: "armour of a unit", "thicker front", "make it tougher". For the hit rules, ricochet, blast and gun-against-armour tests load skill `mow-mod-weapons-damage`.
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.

## Steps
1. read plate by plate: MCP `mow_unit_armor` (`unit`, `mod`): front, side, rear, top in mm and where it is thin
   CLI `node tools/armorsim/armorsim.js table <unit> [--game G --mods a,b --folder dir --json] [--exe as64|mowas_2]` (six side values per volume and which rule set them)
2. change: MCP `mow_unit_change` (`mod`, `id`, `what: "armour"`, `value: "front side rear top"` in mm, `part: "<armour part>"` when the unit has several, e.g. turret and body), preview then `write: true`
   spec: gen op `armor` (`entity`, `value: "turret 60 _ _ _"`; `_` keeps a side), sample `node tools/gen/gen.js --sample armor`; via MCP `mow_mod_gen` (`ops: [{op:"armor", entity:"<id>", value:"<part> F S R T"}]`)
   one plate in place: `node tools/armorsim/armorsim.js edit <unit> --volume V --side S --mm N --out <mod> --shared --dry` (drop `--dry` to write)
   whole class: `node tools/balance/balance.js G --folder <mod> --change "armor pct 20" --plan`
   GUI: Units tab (armour numbers); Models tab armour simulator
3. test against a gun: MCP `mow_matchup` (`target`, `gun` or `attacker`, `ammo`, `range`, `mod`)
4. check: `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`

## Rules (shared)
- the `armor_*` macro argument of the def sets front / side / rear / top per armour part; a nonzero side value wins over the per-volume `{thickness}` block
- left = right = side, bottom = top; the first matching armour area wins by the volume's first tag
- so: edit the macro argument (gen op `armor` does), not the volume block

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| read | simulator, traced through plates | same, `--exe mowas_2` | values of the unit files, not broken down |
| change | yes | yes | refused in plain words (GoH armour forms not mapped) |
| simulator | yes | yes | armorsim refuses GoH (exit 2); `mow_matchup` answers `na` |

## Silent fails
- DMG-06 / GPL-04 / KEY-16 editing `{thickness}` does nothing where the macro sets that side (statsheet ARMOR_VOLUME_SHADOWED, gen WARN_GEN_SET_THICKNESS_SHADOWED)
- DMG-24 `{thickness a b c}` with 3 values misaligns rear and top and logs an error: use 1, 2 or 4 values
- KEY-03 a volume without `able blast` takes no blast damage at all
- GPL-05 a very large `pierce_dur` means AP never breaks the armour area
- VFS-01 the def copy replaces the whole vanilla def (gen GEN_ARMOR_FULL_COPY line)

## Verify
- `mow_unit_armor` (`unit`, `mod`) shows the new values; `mow_matchup` result is a prediction [I]
- in game: shoot the plate with the gun and range tested, read game.log (→ skill `mow-mod-test`)
