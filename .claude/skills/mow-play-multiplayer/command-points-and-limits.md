# mow-play-multiplayer: command points, limits, match length
When: "why can't I buy more", "what are command points", "unit is greyed out", "how many tanks may I have".

## Steps
1. The mode's economy and limits: `mow_mode_info {game: "as64", mode: "battle_zones", mod: "<mod>"}`.
2. A card's price, cost in command points, rank and wait: `mow_army {game: "as64", army: "ger", class: "tank", mod: "<mod>"}`; one unit: `mow_unit_stats {game: "as64", id: "<id from mow_unit_find>", mod: "<mod>"}`.
3. Why a card cannot be bought now: skill `mow-play-coach` (economy file).
CLI: `node tools/balance/balance.js <gameDir> --exe as64 --mods a,b`. GUI: Units > Balance; Game Modes & AI > Game Modes.

## Rules (AS2, AS64)
| what stops a purchase | row |
|---|---|
| not enough manpower (grows) or special points (fixed) | |
| command points: a cap on what stands on the field; the first matching pool in the mode's list is used | MIS-22 |
| card limits count purchases | MIS-04 [V] |
| rank lock: the card's `level` against the player's rank | MIS-15 [V] |
| cooldown, and the head-start wait at the beginning | MIS-05 GPL-10 [V] |
| lobby size scales nothing by itself on AS2 | - |

## Per game
- MoW:AS2: the same.
- GoH: command points scale with team size (GHMIS-78 `teamsize_cp_factor`); cards cost several currencies, no head start or rank lock (GHMIS-84 GHMIS-85); reinforcement waves (GHGPL-07). Not yet tried in game. `mow_mode_info {game: "goh", mode: "battle_zones"}`.

## What goes wrong
- numbers from the vanilla game told to a player of a mod: always pass `mod`.
- "the game is bugged, I have money": the cap is command points or a card limit, not money.
- losing a unit does not always free its card limit (limits count purchases).

## Check
The tool's price and cap equal what the buy panel shows for that card.
