# mow-play-armies: strengths and gaps of one army
When: "what is Germany good at", "where is the USA weak", "why play Japan".

## Method (numbers from the calls, words from you)
1. Per class, cheapest and strongest: `mow_army {game: "as64", army: "ger", class: "tank"}`, then `class: "atgun"`, `"art"`, `"squad"`, `"td"`.
2. Test its best guns against a common enemy tank: `mow_matchup {game: "as64", attacker: "<its gun unit>", target: "<enemy tank>", range: 300}`; repeat at 100 and 600.
3. Test its best armour against a common enemy gun: `mow_matchup {game: "as64", attacker: "<enemy gun unit>", target: "<its tank>", range: 300}` · sides: `mow_unit_armor {game: "as64", unit: "<its tank>"}`.
4. What the enemy needs to answer its best unit: `mow_unit_counter {game: "as64", unit: "<its best tank>", army: "ger", enemy: "rus,usa"}`. Few or costly answers = a strength.
5. What it lacks: a class with no card, or only late and costly ones, in step 1.
CLI: `node tools/balance/balance.js <gameDir> --exe as64`. GUI: Units > Balance (price against strength per army).

## Say it as
"Strong: <class>, because <unit> at <price> does <tool fact>. Gap: <class>, because the first card costs <price> / comes at <rank or time>." One line each; three strengths, two gaps.

## Rules behind the words
- price, cooldown, rank and head start decide when a unit arrives, not only how good it is (MIS-05 MIS-15 GPL-10 [V]).
- a gun is judged by penetration at the range you fight, an armour plate by side and slope (skill `mow-play-coach`).

## Per game
- MoW:AS2: the same data and calls.
- GoH: strengths move with `period` and `doctrine`; run the method once per period.

## What goes wrong
- a famous tank called strong without step 2 and 3.
- one range tested only: guns trade places between 100 and 600 m.
- vanilla judgement used for a mod: pass `mod` in every call.

## Check
Every strength and gap names the tool row it rests on.
