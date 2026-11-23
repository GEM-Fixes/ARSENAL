# mow-mod-weapons-damage: balance pass (odd prices, classes, bulk change)

when: "is my mod balanced", "which units are too cheap", "compare the armies", "raise all tank prices 10 percent", after any gun or armour change.
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh` or `--target as64|mowas2|goh`. G = AS2 install, `<mod>` = the user's mod folder. Findings are hints, not errors.

## Steps
1. the odd ones: MCP `mow_balance_check` (`mod` = full path, left out = the game alone; `show` = `odd` (default) | `models` (what the price follows per class) | `summary` (totals); `q` = an army, a class, a code or part of a name; `where` = a filter such as "army=ger cls=tank cost>500"; `limit`)
2. one army's buy panel with gun penetration and front armour: MCP `mow_army` (`army`, `class`, `max_price`, `search`, `mod`; `period`, `doctrine` for goh)
3. CLI `node tools/balance/balance.js [gameDir] [--exe as64|mowas_2|goh | --target as64|mowas2|goh] [--folder mod] [--where "army=ger cls=tank cost>500 res=mp"] [--sort -cost] [--cols a,b] [--sheet csv|md|json | --group cls,army [--of cost,wait] | --pivot cls,army [--of cost] [--stat median] | --odd | --models | --html f] [-o f] [--json]`
   columns: `id name kind army cls weight group src res cost fit off rank charge fore wait again cp men af as ar at speed mass gun cal pen dmg reload range bots dcost odd`
4. bulk change (preview first): `node tools/balance/balance.js G --folder <mod> --where "..." --change "cost pct 10" --plan` (also `"cost fit"`, `"wait set 60"`, `"armor pct 20"`, `--step n` rounds); drop `--plan` to write into `<mod>`. it goes through gen ops and never mixes resources in one price change
   one unit: MCP `mow_unit_change` (`mod`, `id`, `what` = price | rank | cooldown | headstart, `value`, `write`) (→ skill `mow-mod-units`)
5. GUI: Units & Balance tab > Balance (sheet, groups, graph, side by side, bulk change) and Units > tune (compare, army price by percent, hints). routes `balance/table`, `balance/change`, `units/compare`, `units/armyprice`, `units/hints` via `gui_routes` / `gui_call` (`write: true` in the body to write)
6. report for the user: `--html f` (graphs, mod against game)

## Codes of `--odd` [V tool]
| code | means |
|---|---|
| PRICE_LOW / PRICE_HIGH | price far under / over what its class model gives for its armour, gun, speed |
| the costs-more-but-no-better code | a unit of the same class and army costs less and is at least as good on every number |
| TWIN_PRICE | two different units, same price |
| READY_EARLY | available much sooner than its class |
| RES_SCALE | paid from another budget (special points): not on the manpower scale |
| OVER_BUDGET, NO_PRICE | costs more than the budget can reach; no price found |
- the class model is fitted on manpower prices only; hero / special-point cards are another scale

## What the numbers mean (shared) [V]
- a card is paid from the budget that owns its button: vehicle budget = manpower (grows over the match), hero budget = special points (fixed). the column `res` says which
- wait at match start = `charge x chargeFactor x (1 - fore)`; after a purchase the group restarts at `charge x chargeFactor`. test mode zeroes it
- `unitLimits` count purchases, no refund on death (GPL-10); entries are `;` separated, a wrong separator drops the later ones silently (GPL-09)
- vehicle score (`sc`) against cost decides what a kill is worth
- the sheet's gun columns are static (table value at a fixed range); a match-up through real plates is `mow_matchup`

## Per game
| game | note |
|---|---|
| as64 | full |
| mowas2 | same, `--exe mowas_2` |
| goh | summary, sheet and odd run; price = own cost + members x `squad_cost_factor` (GHGPL-10); no rank and no head start there (GHMIS-85); cards are per period; armour change is not offered on goh |

## Silent fails
- GPL-08 an unknown key in multiplayer data is skipped: a typo in a card does nothing
- MIS-32 bots buy by exact card name: a renamed card is silently no longer bought (→ skill `mow-mod-ai-bots`)
- VFS-42 a bulk change makes the mod hold full copies of the roster files: another mod's cards in them vanish
- MIS-15 rank lock is ignored in test mode, in ranked and for the AI

## Verify
- run `mow_balance_check` again with `mod`: the codes you meant to clear are gone, no new ones
- in game: open the buy panel, compare prices and timers with the sheet (in-game effect of the sheet is [T]); read the log (→ skill `mow-mod-test`)
