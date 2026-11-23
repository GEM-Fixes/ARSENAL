# mow-mod-weapons-damage: penetration by range (the table, clamps, calibre, overmatch)

when: "raise the penetration", "pen at 500 m", "why does it still go through at point blank", "sloped armour math", "overmatch".
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. `<mod>` = the user's mod folder. Units: metres, mm of steel, degrees.

## Steps
1. read the table in use: MCP `mow_weapon_find` (`q` = exact weapon name, `mod`) · `mow_unit_stats` (`id`) gives penetration at 100 m
   CLI `node tools/statsheet/statsheet.js [gameDir] [--exe as64|mowas_2|goh] [--folder <mod>] --sheet weapons,ammo --fmt md --filter <name>`
2. change it: MCP `mow_weapon_change` (`mod`, `weapon`, `what` = the value name, `value`, `write`) for a value written in the weapon file
   the table is often a `damage_*` macro in `set/stuff/<group>/.presets`: change the macro argument or body with gen op `macro` / `set` through MCP `mow_mod_gen` (`mod`, `ops`, `write`); a new gun: gen op `gun` fields `pen`, `pen_scale`
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G (--entity n|--file key) --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
3. see the effect before the game: MCP `mow_matchup` (`gun`, `ammo`, `target`, `range`, `mod`)
   CLI `node tools/armorsim/armorsim.js shot <unit> --weapon W --ammo "<tags>" --range M --from az,el [--folder <mod>] [--exe as64|mowas_2]`
4. GUI: Models tab > Armour (shot and map against a unit; not GoH); Units & Balance > Balance sheet column `pen`

## The rule (shared engine) [V]
- `projectileDamageTable {d1 v1}{d2 v2}..`: d metres, v mm. linear between points, sorted on load, CLAMPED to the first / last value outside the table (DMG-02). when present it ignores `curve` and `projectileDamage` for armour (KEY-25)
- no table: `projectileDamage * curve(distance / aimRange)`, curve from `set/ballistics.set` (small arms)
- table picked per ammo by `parameters "<tags>"`: exact match, first in file order (DMG-01)
- pass test is deterministic, no random roll: passes when penetration >= effective thickness. randomness is only spread, ricochet and script chances
- effective thickness = `((slope-1) * clamp(t/calibre * overmatchScale, 0.2, 1) + 1) * t`, slope = 1/cos(angle from the plate normal), capped at 10 (DMG-03)
- `calibre` = the GUN's, auto from the filling tag `bulletNN` (KEY-10). `OvermatchDamping {angle scale}..` is the gun's overmatchScale table; past its last angle the scale is 1.0, so the table should reach 90 (DMG-04)
- a shell loses energy per plate passed: each later plate is tested with what is left; exit faces are tested too
- break-even slope = penetration / thickness

## Tuning hints
- always write both end points: the first knot is what a point-blank shot gets (DMG-28), the last is used to any range
- the vanilla presets end at `range+5`: nothing beyond (GPL-03, statsheet WARN_PEN_TABLE_SHORT)
- `projectileDamageThreshold` (armour wound threshold = thickness/N) can not go under 1 (DMG-19)

## Per game
| game | note |
|---|---|
| as64 | as above |
| mowas2 | same rule; `--exe mowas_2` |
| goh | effective thickness = overmatch x T x flaw x cast steel x hardness (GHDMG-37); overmatch factor from the first of `OvermatchCalibre`, `OvermatchFixed`, `OvermatchSlope`, `OvermatchDamping` that has entries (GHDMG-27, GHKEY-59). those keys have the game has no such key in AS2 (DMG-20, lim PORT-02). armorsim refuses GoH; `mow_matchup` answers a flat comparison there |

## Silent fails
- DMG-01 a table in a `parameters` block whose tags do not match the shell is never used
- DMG-02 no extrapolation: a table that stops early keeps its last value
- DMG-29 an unknown `curve` name is fatal at load, not silent
- DMG-05 the hit side is baked per face of the `.vol`, not taken from the shot angle
- changing a shared `.presets` macro changes every gun that calls it [V data]

## Verify
- armorsim `shot` before and after, same range and angle; then shots in game at the same stand (in-game table: `node tools/armorsim/ingame/shottable.js plan <unit> --weapons W:ammo --range M --out DIR`, then `compare DIR --log game.log`)
- test in multiplayer test mode: difficulty armour factor is 1 there (→ skill `mow-mod-test`)
