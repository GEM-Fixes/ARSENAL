# mow-play-armies: which army to pick, two armies compared
When: "Germany or USSR", "which army is easiest", "which has the best artillery".

## Steps
1. The same class of both: `mow_army {game: "as64", army: "ger", class: "tank"}` and `mow_army {game: "as64", army: "rus", class: "tank"}`; repeat for `atgun`, `art`, `squad`.
2. Head to head at one price: `mow_army {game: "as64", army: "ger", class: "tank", max_price: 600}` against the same for the other army; then `mow_matchup {game: "as64", attacker: "<a>", target: "<b>", range: 300}` both ways.
3. Who answers whom: `mow_unit_counter {game: "as64", unit: "<army A's main tank>", army: "ger", enemy: "rus"}` and the reverse.
4. "Best artillery / AA / infantry of all": `mow_army {game: "as64", army: "<each>", class: "art"}` for every army of step 1 in `roster-by-class.md`; compare price and the gun row.
CLI: `node tools/balance/balance.js <gameDir> --exe as64`. GUI: Units > Balance (armies side by side).

## How to answer
A small table: class | army A's pick, price | army B's pick, price | who wins the duel at 300 m. Then one sentence: A is ahead in X, B in Y. No "best army": say what each asks of the player.

## For a new player (advice)
An army with cheap, plentiful infantry and anti-tank guns forgives mistakes; one built on few costly tanks does not. Read that from step 1, do not assume it.

## Per game
- MoW:AS2: the same.
- GoH: compare inside one `period`; `fin` exists only there; doctrines shift the answer.

## What goes wrong
- comparing a late tank of A with an early tank of B: match prices or periods.
- a duel result taken as the match result: numbers, crews and flanks decide.
- one mod's balance told to a player of another.

## Check
Each cell of the table comes from a call with the same `game` and `mod`.
