# mow-play-armies: the answer to one enemy unit from my army
When: "what do I buy against a Tiger as USA", "cheapest counter to the KV".

## Steps
1. `mow_unit_counter {game: "as64", unit: "tiger", army: "ger", enemy: "usa", range: 300}` -> counters with price and what they do to it. `army` = the army of the unit to beat (when the name exists in several); `enemy` = who buys the counter.
2. Cheaper ones only: add `max_price: 500`. More rows: `limit: 20`.
3. Prove the pick: `mow_matchup {game: "as64", attacker: "<counter>", target: "tiger", range: 300}`; with a named gun or shell: add `gun`, `ammo`.
4. Where to hit: `mow_unit_armor {game: "as64", unit: "tiger"}` (thin sides).
5. In a mod: `mod: "<path>"` in every call.
CLI: `node tools/armorsim/armorsim.js --help` (AS2, AS64 only). GUI: Units > Unit Stats > matchup card.

## How to answer
Three picks: the cheapest that works, the safest, the one already likely on the field (infantry anti-tank, mines, artillery). For each: price, range it works at, side it needs.

## Rules
- range changes the answer: ask at 100, 300 and 600 m when the pick is marginal.
- a counter that needs the side or rear is a plan, not a purchase: say so.
- not only guns: tracks, crew and fuel can be attacked (skill `mow-play-coach`).

## Per game
- MoW:AS2: the same.
- GoH: `mow_unit_counter {game: "goh", unit: "<unit>", army: "ger", enemy: "rus", period: "mid"}`; the armour simulator does not model GoH, the tool says what it could not compute.

## What goes wrong
- the unit name matches several: add `army`.
- a counter listed that the player cannot buy yet (rank, period, doctrine).
- "counter" read as "wins every time".

## Check
`mow_matchup` for the chosen pick shows a penetration at the range and side named.
