# mow-play-armies: what to buy first
When: "opening build", "what do I buy at the start", "first five minutes".

## Steps
1. What the mode gives at the start and how it grows: `mow_mode_info {game: "as64", mode: "battle_zones", mod: "<mod>"}` (start money, income, preparation time).
2. What that money buys: `mow_army {game: "as64", army: "ger", max_price: <start money>}`; then per class `squad`, `mg`, `atgun`, `mortar` with the same `max_price`.
3. What is not buyable yet (rank, head start, cooldown): the `mow_army` rows say when a card unlocks; one unit: `mow_unit_stats {game: "as64", id: "<id from mow_unit_find>"}`.
4. The enemy's likely first armour: `mow_army {game: "as64", army: "<enemy>", class: "car"}` / `"apc"` / `"tank"` with a low `max_price`; your answer: `mow_unit_counter {game: "as64", unit: "<that unit>", army: "<enemy>", enemy: "ger", max_price: <what you can spend>}`.
CLI: `node tools/balance/balance.js <gameDir> --exe as64`. GUI: Game Modes & AI > Game Modes; Units > Balance.

## Shape of an opening (advice; fill it with the tool's units)
- infantry to take the nearest flags, a machine gun or two to hold them;
- one anti-tank answer before the enemy's first vehicle can arrive;
- keep some money: cooldowns stop a second copy of the same card for a while.

## Rules
- wait at the start = cooldown x charge factor x (1 - fore): a "head start" card comes sooner (GPL-10 MIS-05 [V]).
- rank lock by card `level` (MIS-15 [V]); manpower grows, special points do not.
- flags give score in Assault Zones: early map control is the point of the opening.

## Per game
- MoW:AS2: the same.
- GoH: no head start or rank lock; you buy in waves, with a pause in preparation (GHGPL-07 GHMIS-85): `mow_army {game: "goh", army: "ger", period: "early"}`.

## What goes wrong
- all money on one vehicle: no flags held.
- a build order copied from the vanilla game into a mod.
- no anti-tank answer when the first armoured car shows up.

## Check
The first purchases fit inside the start money the tool gave.
