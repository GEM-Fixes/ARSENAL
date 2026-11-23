# mow-play-armies: what an army has, by class
When: "what does Germany have", "list the Soviet tanks", "which anti-tank guns can the USA buy".

## Steps
1. The armies of the game: `mow_army {game: "as64"}` (no `army` = the list).
2. One army, whole roster: `mow_army {game: "as64", army: "ger"}`.
3. One class: `mow_army {game: "as64", army: "ger", class: "tank"}`. Classes: `squad` (or `infantry`), `tank`, `td`, `atgun`, `art`, `aa`, `aagun`, `mg`, `mortar`, `apc`, `car`, `truck`, `other`, `vehicle`.
4. By name: `mow_army {game: "as64", army: "rus", search: "t-34"}`. Long lists: `limit: 120`.
5. One unit in depth: `mow_unit_find {game: "as64", q: "<name>", army: "ger"}` then `mow_unit_stats {game: "as64", id: "<id>"}`; what it carries: `show: ["equipment"]`.
CLI: `node tools/statsheet/statsheet.js <gameDir> --exe as64 --mods a,b` · `node tools/balance/balance.js <gameDir> --exe as64`. GUI: Units > Unit Stats (army filter), Units > Balance.

## How to present it
One short table per class: unit, price, what it is for (from its gun and armour rows), when it unlocks. Keep the tool's names; add the in-game name when the tool gives it.

## Per game
- MoW:AS2: the same call with `game: "mowas2"`; the vanilla rosters are the same data.
- AS64: `ger2` and other extra armies show when the data has them; Enhanced adds `as64+` content (pass the mods you play).
- GoH: `mow_army {game: "goh", army: "ger", period: "mid"}`; armies `rus ger fin eng usa`; add `doctrine` to see one doctrine's cards.

## What goes wrong
- a unit "missing": it sits in another class (`td` against `tank`, `aagun` against `aa`), or the mod removed its card.
- the list cut at the default 60 rows: raise `limit`.
- an army id guessed (`ussr`, `uk`): take ids from step 1.

## Check
The names and prices equal the buy panel of that army in a lobby with the same mods.
