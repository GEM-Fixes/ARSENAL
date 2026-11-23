# mow-play-armies: best value under a price
When: "what can I buy for 500", "cheapest tank that is any good", "is this unit worth it".

## Steps
1. Everything under the price: `mow_army {game: "as64", army: "ger", max_price: 500}`; one class: add `class: "atgun"`.
2. Value against the job: `mow_matchup {game: "as64", attacker: "<candidate>", target: "<the enemy unit you fear>", range: 300}` for each candidate.
3. The cheapest that does the job: `mow_unit_counter {game: "as64", unit: "<enemy unit>", army: "<enemy>", enemy: "ger", max_price: 500}`.
4. In a mod, is a price out of line: `mow_price {game: "as64", mod: "<path>", show: "fit", q: "<card>"}` (the mod's own price model against its cards).
CLI: `node tools/balance/balance.js <gameDir> --exe as64 --mods a,b`. GUI: Units > Balance (price against strength; outliers marked).

## How to answer
A short ranked list: unit, price, what it beats (tool fact), what beats it. Value is "does the job at the lowest price and soonest", not the most armour per coin.

## Rules
- price is not the only cost: cooldown, command points, rank (MIS-04 MIS-15 MIS-22).
- a cheap gun without a tractor or crew cover is not cheap in play.
- special-point units are outside the manpower budget; list them apart.

## Per game
- MoW:AS2: the same.
- GoH: several currencies per card (GHMIS-84); `max_price` filters the main one; say which currency the tool showed.

## What goes wrong
- `mow_price` used for the vanilla game: it needs a mod.
- an outlier called a bug: mods price on purpose.
- comparing prices across mods.

## Check
The list's prices equal the buy panel; each "beats" has its `mow_matchup` row.
