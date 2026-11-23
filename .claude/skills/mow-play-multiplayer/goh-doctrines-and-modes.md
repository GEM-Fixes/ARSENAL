# mow-play-multiplayer: Gates of Hell doctrines, waves, modes
When: the game is GoH and the person asks about doctrines, periods (early / mid / late), waves or its modes. All GH rows are not yet tried in game: say so.

## Steps
1. Modes: `mow_mode_info {game: "goh"}`; one: `mow_mode_info {game: "goh", mode: "frontlines"}`.
2. What a doctrine and period may buy: `mow_army {game: "goh", army: "ger", period: "mid", doctrine: "<doctrine>"}`; leave `doctrine` out to see all cards with their doctrine.
3. An answer to an enemy unit inside a period: `mow_unit_counter {game: "goh", unit: "<unit>", army: "rus", period: "mid"}`.
4. A row: `mow_limit {game: "goh", ids: ["GHGPL-05"]}` Â.
GUI: GoH button > Game Modes & AI > Game Modes; Units > Balance.

## Rules
| what | row |
|---|---|
| a card names its doctrine; the lobby lists doctrines; the pick filters the buy panel | GHGPL-05 GHMIS-88 GHGPL-09 GHNET-56 |
| reinforcements come in waves; the first after a longer wait, then shorter ones; pause in the preparation phase | GHGPL-07 |
| cards cost several currencies and a research stage | GHMIS-84 |
| no head start and no rank lock as in AS2 | GHMIS-85 |
| command points scale with team size | GHMIS-78 |
| modes: battle_zones, frontlines, ammunition, evacuation, guerrilla | GHGPL-18..20 |
| only the host may pause | GHNET-05 |
| a leaver's units go to team mates | GHNET-80 |
| no separate sync check job; out of sync shows as code 0x0bad0006 | GHNET-69 GHLOG-10 |
| dedicated server | GHSRV-01 |

## Against AS2 / AS64
No doctrines, no periods, no waves there; armies differ (`rus ger fin eng usa` against `usa ger rus eng jap ger2`).

## What goes wrong
- wave seconds quoted from a row: a mod or patch changes them; read `mow_mode_info`.
- a doctrine name guessed: take it from the `mow_army` answer.
- AS2 advice (head start, rank) given to a GoH player.

## Check
The buy panel in the lobby's doctrine shows the cards `mow_army` listed for it.
