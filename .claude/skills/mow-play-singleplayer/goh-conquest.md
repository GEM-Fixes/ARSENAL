# mow-play-singleplayer: Gates of Hell Conquest
When: the game is GoH and the person asks about Conquest (the dynamic campaign): research, army between battles, difficulty, saves. All rows are not yet tried in game: say so.

## Steps
1. The topic blocks: `mow_lookup {query: "conquest", mode: "topic", web: "goh"}` Â.
2. A row: `mow_limit {game: "goh", ids: ["GHCQ-01"]}`; by words: `mow_limit {game: "goh", words: "conquest difficulty"}`.
3. What an army can field: `mow_army {game: "goh", army: "ger", period: "early"}`.
4. A fault: `mow_game_log {game: "goh"}`.
GUI: GoH button > Units > Balance; Mods > Mod Editor (`set/dynamic_campaign`).

## What it is
A campaign over a map of territories: fight a battle, keep the surviving army, spend points on research and new units, pick the next territory. Its data is under `set/dynamic_campaign` (PORT-33, GHCQ-03).

## Rows to start from
| about | rows |
|---|---|
| the fixed files Conquest reads (values, map points, resources, duration) | GHCQ-03 |
| the buy bar in a battle, priced in command points | GHCQ-01 |
| risk level: bot resources, rewards, bot veterancy | GHCQ-12 |
| repair and ammo cost between battles | GHCQ-25 |
| creating a campaign: name, army and theatre need their DLC, defaults | GHCQ-32 |
| difficulty factors per team, co-op | GHCQ-33; blocks conquest/difficulty-level-rules, conquest/difficulty-factor-table |
| `vehicle_health`: a harder level can toughen enemy vehicle parts | GHCQ-34 GHCQ-35 |
| saves below version 9 are upgraded on load | GHCQ-30; block conquest/campaign-save-archive |
| `.sav` checks version, map and mods | GHNET-04 GHNET-07 |

## Against AS2 / AS64
There is no Conquest in AS2 or AS64; a ported mod loses it (PORT-33).

## What goes wrong
- mods changed mid campaign: the save checks them and may refuse to load.
- a number from a row told as the game's value: patches and mods change them; read the mod's `set/dynamic_campaign` files.
- AS2 difficulty advice (armour scaling) used for Conquest: other factors apply.

## Check
The row quoted carries its GH id and the words "untested"; the campaign save loads with the mods it was started with.
