# mow-mod-units: change a whole army or class at once

when: "raise all tank prices 10%", "all cooldowns to 60", "thicker armour for every heavy tank", "which units are out of line", "export a unit table".
game: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh` or `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.

## Steps
1. the table: MCP `mow_army` (`army`, `class`, `max_price`, `mod`, `limit`) · units out of line: `mow_balance_check` (`mod`, `show` odd|models|summary, `q` army / class / code / name part, `where: "army=ger cls=tank cost>500"`)
   CLI `node tools/balance/balance.js [gameDir] [--exe as64|mowas_2|goh | --target as64|mowas2|goh] [--folder mod] [--where "army=ger cls=tank cost>500 res=mp"] [--sort -cost] [--cols a,b]`
   grouped: add `--group cls,army [--of cost,wait]`; a page for the user: `--html f`; odd ones: `--odd`
2. plan a bulk change (writes nothing): `node tools/balance/balance.js G --folder <mod> --where "<filter>" --change "cost pct 10" --plan`
   other change words: `"cost fit"` (fit price to the class model), `"wait set 60"`, `"armor pct 20"`
3. show the plan to the user (rows old → new), then run it without `--plan`. `node tools/balance/balance.js --help` has the full line (steps, rounding)
4. many single edits through MCP: `mow_mod_gen` (`mod`, `ops: [{op:"card", unit, army, fields:{cost:N}}, ..]`, `write`); one refused op stops the whole call
   keys of many files: gen op `set` with `csv` (a table of entity, path, value)
5. infantry price model (as64 and mowas2): MCP `mow_price` (`mod`, `show` fit|calc|tiers|plan; reads only)
   CLI `node tools/pricecalc/pricecalc.js <cmd> <modDir> [--game dir] [--model f] [--rules f] [--json] [-o f]`, cmd `calc|fit|review|plan|apply|undo|check` (apply writes comment lines only; prices only with `--set-prices`)
6. tables for a sheet: `node tools/statsheet/statsheet.js G --folder <mod> --sheet weapons,ammo,armor,price --fmt md|csv -o f`
   GUI: Balance page (table, filters, quick change, cooldown column); Units tab for one unit
7. check: `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`

## Rules (shared)
- balance findings are hints, not errors: too cheap for its armour, costs more but is no better (the costs-more-but-no-better code), twin price, ready too early
- price, cooldown and rank are card fields; armour is a def macro argument: a bulk armour change copies every touched def into the mod
- cooldown at match start = `charge x chargeFactor x (1 - fore)` [V mission/mp-units]

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| balance | yes | `--exe mowas_2` / `--target mowas2` | GoH squad price rule; no rank, no head start |
| armour change | yes | yes | not on GoH (armour forms not mapped) |
| price model | `mow_price` | `mow_price` | AS2 layouts only [I]; price parts: `node tools/statsheet/statsheet.js --exe goh --sheet price` |

## Silent fails
- VFS-42 a bulk price change copies whole roster files into the mod: every other mod's cards in those files are shadowed. say how many files were copied
- VFS-01 same for each def touched by an armour change
- DMG-06 / GPL-04 percent changes go to the armour macro; per-volume plates stay as they are and are ignored where the macro sets the side
- MIS-15 rank changes show nothing in test mode, ranked or for AI
- MIS-32 bots are untouched by price: they buy by card name and by their own income rules (→ skill `mow-mod-ai-bots`)
- GPL-10 unit limits count purchases; cheaper units do not raise a limit

## Verify
- rerun the same `balance` line with `--folder <mod>`: values are the planned ones; `mow_balance_check` (`mod`) shows what is still out of line
- `mow_mod_diff` (`mod`) lists the files and keys changed against the game
- in game: open the buy panel of each touched army, spot-check three cards (→ skill `mow-mod-test`)
