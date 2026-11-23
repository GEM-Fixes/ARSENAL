# mow-play-coach: manpower, special points, cooldown, rank (AS2 + AS64)
When: "why can I not buy it yet", "how long until my tank", "what are special points", "why is the unit greyed out".

## Steps
1. The army's buy panel: `mow_army {game: "as64", army: "ger", mod: "<mod>"}` -> per unit: class, price and what it is paid with, rank needed, wait at match start, cooldown, command points; and how the economy works.
2. The mode's numbers (score to win, preparation time, economy): `mow_mode_info {game, mode: "battle_zones", mod}`.
3. Rows: `mow_limit {ids: ["MIS-15", "GPL-10"]}` Â. Chain: `mow_lookup {query: "pricing economy", mode: "topic"}`.

## CLI
`node tools/balance/balance.js <gameDir> --exe as64|mowas_2 --where "army=ger cls=tank" --sort -cost` Â· price parts in a mod with a price model: `node tools/pricecalc/pricecalc.js calc <modDir> --game <dir>`.

## GUI
Units & Balance > Balance (`balance/table`): every buy-panel unit with price, cooldown, rank.

## Rules
| question | rule | row |
|---|---|---|
| two purses | manpower (grows from start to finish value over the match) and special points (fixed, for hero cards); not on one scale | |
| wait at match start | cooldown x mode factor x (1 - head start) | |
| after a buy | the unit's whole group restarts at full cooldown x mode factor | |
| unit limits | count purchases; a dead unit does not free its slot | GPL-10 MIS-04 [V] |
| rank lock | off in test mode, ranked play, for AI, and when the mode switches it off | MIS-15 [V] |
| command points | a unit is checked against the main pool and the FIRST matching pool only | MIS-22 [V] |
| match length | fixed lobby list 10 to 120 minutes | MIS-21 [V] |
| bots and timers | vanilla bots ignore unlock timers | |

## Per game
- MoW:AS2: same data, same rules.
- GoH: no rank lock, no head start, several currencies, waves, doctrines: `goh-economy-doctrine.md`.

## What goes wrong
- a price said without its purse: manpower and special points are not comparable.
- numbers (price, cooldown, factor) quoted from here or memory: mods change them; `mow_army` each time.
- "kill it to get the slot back": limits never refill.

## Check
The buy panel in game against `mow_army`; the wait shown on the card at match start.
