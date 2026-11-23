# mow-play-coach: GoH economy, doctrines, Conquest
When: the game is Gates of Hell and the question is buying, doctrines, waves, command points, the campaign map.
All rows here are: untested, none run in game. Say so. Read one: `mow_limit {game: "goh", ids: ["GHGPL-05"]}` Â.

## Steps
1. Armies and doctrines: `mow_army {game: "goh"}` (list), then `mow_army {game: "goh", army: "ger", period: "mid", doctrine: "offensive"}`.
2. Modes: `mow_mode_info {game: "goh"}` (battle_zones, frontlines, ammunition, evacuation, guerrilla).
3. Conquest: `mow_lookup {game: "goh", query: "conquest command points", mode: "topic"}` Â.
CLI prices: `node tools/balance/balance.js <gohDir> --exe goh`. GUI: GoH tab > Units & Balance > Balance.

## Rules
| topic | rule | row |
|---|---|---|
| card shown only for matching doctrine | the buy bar shows a card only when the player's doctrine matches the card's | GHGPL-05 |
| lobby doctrine list | from the units of the mode and army; seat default doctrine | GHMIS-88 GHMIS-106 |
| who picks what | joiner gets the first doctrine, AI "random" | GHNET-56 |
| which armies a team may pick | doctrines decide the army list | GHGPL-09 |
| card fields | cost in several currencies, score factor, research stage | GHMIS-84 |
| squad price | own cost + members x factor, rounded up | GHGPL-10 |
| budget | start / finish / periodic step / payback | GHGPL-12 |
| no rank lock, no head start | every cooldown runs whole | GHMIS-85 |
| group-less units | cool down alone | GHGPL-14 |
| captured vehicle | no longer refunds its buyer | GHGPL-13 |
| session defaults | pause in preparation; waves: first after 360 s, then every 120 s | GHGPL-07 |
| team size and command points | a mode parameter scales every side's command points by the larger team | GHMIS-78 |
| flag capture ties | hold the capture | GHGPL-17 |
| modes ammunition, evacuation, guerrilla | own rules | GHGPL-18 GHGPL-19 GHGPL-20 |
| XP after a match | - | GHGPL-21 |
| Conquest | buy bar priced in command points, risk levels, repair and resupply cost | GHCQ-01 GHCQ-12 GHCQ-25 |

## Per game
None of this exists in MoW:AS2 or AS64 (no doctrines, no Conquest): `economy.md` for those.

## What goes wrong
- a GoH [V] quoted like a tested fact: it is not yet tried in game; "GoH lacks X" is an upper limit.
- the default wave times quoted under a mod or another mode: read `mow_mode_info`.
- `tools/doctrine` taken for GoH doctrines: it is a bot persona pack for AS2.

## Check
The lobby's doctrine list and the buy bar in a GoH match; nothing here is proven until seen there.
