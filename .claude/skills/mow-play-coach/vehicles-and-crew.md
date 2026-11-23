# mow-play-coach: vehicles, movement, crew
When: "why is my tank slow", "it will not climb", "the crew bailed", "why does the MG not fire", "stuck".

## Steps
1. The vehicle: `mow_unit_stats {game, id, mod}` (speed, crew, guns).
2. The rule below; read the row: `mow_limit {ids: ["MOV-06"]}` Â.
3. More: `mow_lookup {query: "movement chassis", mode: "topic"}`.
GUI: Units & Balance > Units (`units/stats`).

## Rules (AS2 + AS64)
| question | rule | row |
|---|---|---|
| ordered speed | Slow / Normal / Fast = 0.45 / 0.67 / 0.92 of top speed; full speed only in direct control | MOV-06 [V] |
| turn speed in direct control | its own value, ordered moves ignore it | MOV-05 [V] |
| roads | never faster than top speed | MOV-08 [V] |
| mud, snow, ice | no speed effect by look; only the painted ground type slows | MOV-09 [V] |
| slopes | tank routes avoid 30 degrees and more | MOV-14 [V] |
| unit stuck after blocker left | the order failed, order it again | MOV-16 MOV-18 [V] |
| wheeled turn | never on the spot | MOV-19 [V] |
| vehicle MG idle while cannon chases | one target list for all weapons | AI-06 [V] |
| MG never opens up on a tank | no ammo rule for that target | AI-05 [V] |
| AI gunners | long bursts only; hatch gunners leave their MG under heavy threat | AI-07 AI-20 [V] |
| bailed vehicle | selectable after 20 s; bots never re-crew | AI-13 [V] |
| crew health after a kill | crew stay at full health when the vehicle dies | DMG-26 [V] |
| red hull | can still be fixable; crew out is the kill mark | DMG-27 [V] |

## Playing advice (manuals, [I];
Crew can swap roles; an emptied enemy vehicle can be crewed and used. On the blueprint red zones are field-repairable, grey are not.

## Per game
- MoW:AS2: same rows; AS64 has no FPS cap and other aim timing, so "feel" differs, numbers do not.
- GoH: top speed depends on how many crew seats are manned (GHMOV-46); speed gears read inside `Locomotion` (GHMOV-44); vehicle parts have hit points (GHDMG-04). Not yet tried in game.

## What goes wrong
- "mud slows tanks" assumed from the look of a map: only the painted ground type counts.
- speed quoted from the unit file as what an ordered move reaches: 92% at most.
- a stuck unit taken for a bug: re-order it.

## Check
Direct control (`E`) on the same stretch against an ordered move; the speed difference is the rule.
