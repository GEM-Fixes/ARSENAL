# mow-play-armies: Gates of Hell periods and doctrine rosters
When: the game is GoH. Rules are not yet tried in game: say so.

## Steps
1. Armies: `mow_army {game: "goh"}` (`rus ger fin eng usa`).
2. A period's roster: `mow_army {game: "goh", army: "ger", period: "early"}`, then `"mid"`, `"late"`.
3. One doctrine: `mow_army {game: "goh", army: "ger", period: "mid", doctrine: "offensive"}` (a full name such as `mid_ger_offensive` or just the last word). Names come from the roster answer.
4. Answers inside a period: `mow_unit_counter {game: "goh", unit: "<unit>", army: "rus", enemy: "ger", period: "mid"}`.
5. Mode economy: `mow_mode_info {game: "goh", mode: "battle_zones"}`.
CLI: · `node tools/balance/balance.js <gameDir> --exe goh`. GUI: GoH button > Units > Balance.

## Rules
| what | row |
|---|---|
| each card names its doctrine; the lobby pick filters the buy panel | GHGPL-05 GHMIS-88 GHGPL-09 |
| cards cost several currencies, a score factor and a research stage | GHMIS-84 |
| squad price formula, budget scaling | GHGPL-10 GHGPL-12 |
| no head start, no rank lock | GHMIS-85 |
| reinforcement waves | GHGPL-07 |
| squad size up to 12, veterancy 0 to 8 | GHGPL-04 GHHUM-07 |

## Against AS2 / AS64
No periods and no doctrines there; `period` and `doctrine` are ignored or refused for those games.

## What goes wrong
- a doctrine guide written without `period`: the roster is another one.
- the armour simulator asked for GoH duels: it refuses; use the penetration and armour rows `mow_unit_stats {game: "goh", id: "<id>", card: "<card of the find row>"}` gives and say it is a comparison, not a simulation.
- AS2 army knowledge (unit names, prices) carried over.

## Check
The doctrine's cards in the game's lobby equal the tool's list for that period.
