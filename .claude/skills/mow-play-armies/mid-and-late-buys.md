# mow-play-armies: what to buy in the middle and late game
When: "when do I get tanks", "what do I save for", "late game army".

## Steps
1. What unlocks when: `mow_army {game: "as64", army: "ger", class: "tank"}` (price, rank, wait) and `class: "td"`, `"art"`.
2. Income against price: `mow_mode_info {game: "as64", mode: "battle_zones", mod: "<mod>"}`; minutes to afford = price / income (work it out for the person).
3. What the enemy will field then: `mow_army {game: "as64", army: "<enemy>", class: "tank"}`.
4. Your answer to each of those: `mow_unit_counter {game: "as64", unit: "<enemy heavy>", army: "<enemy>", enemy: "ger"}`; prove the top pick: `mow_matchup {game: "as64", attacker: "<pick>", target: "<enemy heavy>", range: 500}`.
5. Field caps: command points and card limits in `mow_mode_info` (MIS-22 MIS-04).
CLI: `node tools/balance/balance.js <gameDir> --exe as64`. GUI: Units > Balance.

## Shape (advice; units from the tool)
- middle: a medium tank or tank destroyer that beats the enemy's medium at your fighting range, with infantry beside it; artillery once the front is still.
- late: one heavy or one strong gun at a time, never without repair and anti-infantry cover; special points go to what manpower cannot buy.
- always keep the price of one anti-tank answer in hand.

## Rules
- special points are fixed for the match: spend them on purpose.
- limits count purchases: a lost limited unit may not come back (MIS-04 [V]).
- a costly unit lost to a cheap gun is the usual way to lose the late game: check step 4 from the enemy's side too.

## Per game
- MoW:AS2: the same.
- GoH: `period: "mid"` and `"late"`; several currencies per card (GHMIS-84); doctrines gate the heavy units.

## What goes wrong
- saving for a heavy while losing every flag.
- the heavy bought, nothing left for fuel, repair or infantry.
- an answer that penetrates only from the side planned as a frontal defence.

## Check
Each planned purchase shows price, unlock and the enemy unit it is for.
