# mow-play-coach: GoH damage and repair
When: the game is Gates of Hell and the question is penetration, part damage, cover, repair.
All rows are: none run in game yet; say "not yet tried in game". Read one: `mow_limit {game: "goh", ids: ["GHDMG-25"]}` Â.

## Steps
1. Flat comparison: `mow_matchup {game: "goh", attacker: "<unit>", target: "<unit>", range: 300}` (penetration against plate thickness; the armour simulator does not serve GoH).
2. Plates from the unit files: `mow_unit_armor {game: "goh", unit: "<unit>"}`.
3. Sheet: `node tools/statsheet/statsheet.js <gohDir> --exe goh --sheet weapons,ammo,armor --filter <name>`.
4. Apply the formula rows below by hand and state it as an estimate.
GUI: GoH tab > Models & Sim > Armour says it is not available; use Units & Balance > Units.

## Rules
| topic | rule | row |
|---|---|---|
| part hit points | parts go damaged, broken, then destroyed | GHDMG-04 GHDMG-05 GHDMG-06 |
| vehicle dead | when part `body` is destroyed | GHDMG-10 |
| pierce damage | penetration - effective thickness comes off the part | GHDMG-25 |
| effective thickness | overmatch, plate flaw, cast steel, hardness | GHDMG-37 GHDMG-38 GHDMG-39 |
| which overmatch table a shell uses | - | GHDMG-27 |
| layered plates | a part is hit once per step (they do not stack) | GHDMG-16 |
| HEAT | does not over-penetrate a soldier | GHDMG-12 |
| soldier damage | per body volume; own factor for shots fired in direct control | GHDMG-21 GHDMG-22 |
| cover and crawling | damage scale + hit chance roll for bullets | GHDMG-23 |
| blast on soldiers | same for player and AI men | GHDMG-33 GHDMG-34 |
| difficulty | `vehicle_health` scales each part's max hit points in single player | GHCQ-34 GHCQ-35 |
| repair | kit in hand, also damaged parts, time by health lost | GHGPL-22 GHDMG-09 GHGPL-03 |
| kit search | within 20 m | GHGPL-23 |
| fuel and repair resources | from supply zones | GHGPL-27 GHGPL-28 |

## Against AS2 / AS64
as64 reads none of the extra armour factors (DMG-20); there a vehicle has no health and a penetration is all or nothing per part. Do not carry an AS2 answer to GoH or back.

## What goes wrong
- an armorsim number given for GoH: the tool refuses GoH; anything else is a guess.
- "one penetration = dead": in GoH a part loses hit points.
- hit point values quoted: they are per mod and unit; read the files with the tools.

## Check
Only a GoH match settles it; offer the recorded menu routes (`mow_game_routes {game: "goh"}`) and say what to watch.
