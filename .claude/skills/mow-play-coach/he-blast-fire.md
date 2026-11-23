# mow-play-coach: HE, blast, fire, ammo explosion
When: "HE did nothing", "is HE weaker far away", "why did my tank blow up", "my men died behind a wall".

## Steps
1. The shell's blast numbers: `mow_unit_stats {game, id: "<unit>", mod}` (CLI `node tools/statsheet/statsheet.js <gameDir> --exe <game> --mods a,b --sheet ammo --filter <name>`).
2. The rule: a row below, read with `mow_limit {ids: ["GPL-01"]}`.
3. The whole chain when needed: `mow_lookup {query: "damage blast", mode: "topic"}`.
GUI: Units & Balance > Units (`units/weapons`), Help & Docs > Look up a limit ID.

## Rules (AS2 + AS64)
| question | rule | row |
|---|---|---|
| HE weaker far away? | no: blast does not depend on distance flown | GPL-01 [V] |
| how blast falls off | straight line from the centre to zero at the outer radius | GPL-01 [V] |
| blast delay | each part hit distance / 15 m/s later | GPL-02 DMG-21 [V] |
| what shields from blast | an unbroken part shields what is behind it | DMG-15 (row under review, read it first) |
| posture and cover against blast | squat, crawl and cover each scale blast down | |
| my controlled soldier survives blasts AI men do not | blast factor for player-controlled infantry is far lower | DMG-22 [V] |
| HE killed the crew, tank intact | big HE can empty a vehicle and leave it capturable | [V in game] |
| ammo explosion odds | sum of all explosive carried: more carried = more risk | DMG-18 [V] |
| blast against fire / cook-off ladders | separate ladders, script data | GPL-14 [I] |
| hull "broken" | blast breaks areas; AP almost never | DMG-07 GPL-05 [V] |

## Per game
- MoW:AS2: same rows.
- GoH: blast on soldiers is the same for player-controlled and AI men. GHDMG-33 GHDMG-34. Cover and crawling scale damage and add a hit chance roll for bullets. GHDMG-23. Not yet tried in game.

## What goes wrong
- "HE has a range drop-off" from another game: not here.
- fire and cook-off numbers quoted as engine fact: they are script data and differ per mod ([I]); read the mod.
- a wall assumed to stop blast: only unbroken parts shield; check DMG-15 before saying so.

## Check
A test match: same shell at short and long range against the same target gives the same blast (skill `mow-mod-test`).
