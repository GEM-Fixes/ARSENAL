# mow-mod-weapons-damage: infantry price model (is this price fair)

when: "is this price fair", "price calculator", "price my new squad", "what should this soldier cost", "prices from a sheet". Soldiers and squad cards only; vehicles and guns are priced by hand (→ balance-check facts: MCP `mow_balance_check`).
game word: MCP `game` = `as64|mowas2` (goh answers why not) · CLI has no game word (AS2 layouts). `<mod>` = the user's mod folder.

## Steps
1. does the model fit the mod: MCP `mow_price` (`mod` full path, `show: "fit"` (default): how many prices the model reproduces, the biggest gaps, findings)
2. computed against current price: `mow_price` (`show: "calc"`, `q` = part of a breed or card name)
3. item tiers the price rests on: `show: "tiers"`; what an apply would write: `show: "plan"`. `model` = full path of another `price_model.inc`. The MCP tool only reads
4. CLI `node tools/pricecalc/pricecalc.js <cmd> <modDir> [--game dir] [--model f] [--rules f] [--sheet-mp f --sheet-cp f] [--json] [-o f] [--undo tag]`
   | cmd | does |
   |---|---|
   | `seed <mod> -o f` | builds the model text from the mod's own price rows (or from sheet TSVs) and every item its breeds carry; never overwrites without `--force`; `--merge` adds only new items |
   | `calc` | per breed: class, tier, level, veterancy, price parts, calc / mod mp cp cw; per squad card: rule, add-on, member sum, calc / current cost. `--review tiers`, `--review grenades` |
   | `fit` | exact / within 2% / off, biggest gaps, findings |
   | `plan` / `apply` | apply writes `;{price ...}` COMMENT lines above each breed row and priced card; prices change only with `--set-prices` (OFF by default) |
   | `undo --undo tag` / `check` | restores byte for byte from `<mod>/.arsenal-undo/<tag>/`; check proves the data is unchanged and a second apply changes nothing |
5. GUI: Units & Balance tab > Balance > Price calculator. routes `balance/prices/calc`, `prices/try`, `prices/plan`, `prices/apply`, `prices/undo` via `gui_routes` / `gui_call`
6. after a real price change: lint `node tools/check/check.js <mod>` and a balance pass

## How the model prices (tool rules) [V tool, I where marked]
- a soldier's price = table[weapon class, tier, effective skill level] for manpower, a rising curve for command points; "special" breeds (fixed), "sole" item breeds (e.g. radio) and "weapon" breeds are told apart
- squad card = sum of member prices (+ transport add-on); single-buy and sequence cards have their own rules [I]
- with no owner sheet, `seed` fits each tier's tables from the mod's own rows (median per skill level, gaps interpolated, ends flat) [I]: the fit then describes the mod, it does not judge it
- hero cards (paid in special points) never get a computed manpower line; vehicle / gun cards are reported as priced by hand
- `--rules f` holds one mod's picks (item tiers, name patterns, add-on vehicles); without it only generic rules (stuff folder → group)

## Findings to read
UNGROUPED_ITEM (item in no group: priced 0) · TIER_UNDETERMINED · NO_PRICE_ROW (card member without a `soldiers.set` row) · NO_BREED_FILE · PAIR_UNDEFINED · CARD_RULE_AMBIGUOUS · LAYOUT_UNKNOWN / NO_PRICE_ROWS (the mod's unit files are not in a form the tool reads) · DUP_PRICE_ROW (priced twice, last wins) · SHEET_DEFECT

## Where prices live (shared AS2 layout) [V]
- `set/multiplayer/units/`: the engine reads the FIRST existing of `<gameType>.set`, `<gameClass>.set`, `common.set`
- `soldiers.set`: one row per breed `{"mp/<side>/<breed>" (...)}` with score (= manpower value), cp, cw; `squads.set`: cards with `content`, `cost`, `fore`; `vehicles*.set`: cards with crew
- a mod may bucket soldier prices in `level_N` macros: `--set-prices` reuses a level with the same values or adds one

## Per game
| game | note |
|---|---|
| as64 | full |
| mowas2 | same layout; give `--game` so vanilla breeds the mod does not ship are read |
| goh | not served: pricecalc reads AS2 layouts only [I]; GoH price parts: `node tools/statsheet/statsheet.js H --exe goh --sheet price`; rule GHGPL-10 |

## Silent fails
- TST-94 a mod `units/common.set` replaces the stock unit list whole; only the first of the three set files is read
- GPL-08 a mistyped card key is skipped silently
- MIS-32 bots buy by exact card name
- a crewman bought inside a vehicle costs no command points; bought alone he does [V sheet rule]

## Verify
- `mow_price` `show: "fit"` again; `pricecalc check <mod>` after an apply
- in game (LAN test mode): the buy panel shows the manpower and command-point values the calc listed; read the log (→ skill `mow-mod-test`)
