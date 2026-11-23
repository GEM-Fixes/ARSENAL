# mow-play-coach: what beats unit Z, what to buy against it
When: "what counters a Tiger", "what do I buy against Z", "cheapest answer to X".

## Steps
1. The unit: `mow_unit_find {game, q: "tiger"}` -> id and army.
2. Counters: `mow_unit_counter {game: "as64", unit: "<id>", army: "ger", enemy: "rus", range: 300, max_price: 600, mod: "<mod>"}` -> cheapest first, which work only from the side or rear, whether Z can shoot back through the counter's front.
3. Can the player afford it now: `mow_army {game, army: "rus", class: "td", max_price: 600, mod}` -> price, purse, rank, wait at start, cooldown.
4. Confirm the best one: `mow_matchup {attacker: "<counter>", target: "<id>", range: 300}`.
5. Answer with: what to buy, what it costs and from which purse, how long the wait, from which face and range it works.

## CLI
No single CLI for counters: balance rows of the enemy's price band, then armorsim on each candidate gun.
- `node tools/balance/balance.js <gameDir> --exe as64|mowas_2|goh --where "army=rus cls=td" --sort -cost`
- `node tools/armorsim/armorsim.js shot <unit> --weapon "<gun>" --range <m> --from 0,0 --game <dir> --mods a,b --exe as64`

## GUI
Units & Balance > Balance (sheet, side by side): `gui_open {page: "balance"}`; Models & Sim > Models > Armour for the shot.

## Rules to carry
- unit limits count purchases; a dead unit does not free its slot. GPL-10 MIS-04 [V]
- after a buy the unit's whole group restarts at full cooldown.
- your launcher men do not fire HEAT at infantry on their own; an MG may never open up on a tank. AI-10 AI-05 [V]
- infantry AT works from the side and rear at short range: advice from manuals, [I].

## Per game
- MoW:AS2: same; `game: "mowas2"`.
- GoH: `mow_unit_counter {game: "goh", period: "mid"}` = flat comparison; the buy bar shows a card only when the player's doctrine matches (GHGPL-05), so ask the doctrine and pass it to `mow_army {doctrine}`.

## What goes wrong
- a counter the player cannot buy yet (rank lock, wait at start, purse): check with `mow_army` before naming it.
- "counter" that only works from the rear given without saying so.
- a mod's unit missing from the answer: `mod` not passed.

## Check
`mow_matchup` both ways at the stated range; in game, the reticle number in direct control.
