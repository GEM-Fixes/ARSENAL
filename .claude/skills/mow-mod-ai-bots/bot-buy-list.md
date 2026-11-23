# mow-mod-ai-bots: make bots buy a unit, read what they buy

when: "bots do not buy my new tank", "what does the German bot buy", "bot purchase list", "add my squad to the bots".
G = AS2 install, `<mod>` = mod folder.

## Steps
1. read: MCP `mow_bots_info {army:"ger"}` (what the bot buys and when; `mod:"<mod>"` reads the mod on top)
2. shape check of the mod's bot data against stock: MCP `mow_bots_recipe {mod:"<mod>"}` (action check, the default)
   CLI `node tools/botrecipe/botrecipe.js <mod> --check` (add `--game G` for the buy-card check; exit 1 on errors)
3. make the bot buy a unit first: MCP `mow_bots_recipe {mod:"<mod>", action:"buy_first", unit:"my_t34(rus)", after:"t34_76(rus)", out:"<mod>"}` (preview; `write:true` writes)
   CLI `node tools/botrecipe/botrecipe.js <mod> --out <mod folder> --buy-first U [--class Tank] [--after <unit>] [--priority P] [--dry-run] [--exe as64|mowas_2|mowas2|goh]`
4. new squads made by gen op `squad` are added to the bot list by gen itself (GEN_BOTS_* codes in its answer)
5. lint: `node tools/milint/milint.js <mod> [--game G] [-q]` (MIS_BOT_ARMY_MISSING, MIS_BOT_UNIT_UNKNOWN, WARN_MIS_BOT_ORDER)
6. prove the buy (as64): `node tools/prove/prove.js --game G --army a (--unit card [--kind vehicle|human] [--target def]) [--tiny] [--mods a,b] [--plan]`
- GUI: Game Modes & AI tab > `bots` page (buys, stages, recipes, buy check)

## Facts (AS2 engine)
- `script/multiplayer/bot.lua` = logic, `bot.data.lua` = stages (`Purchases`), per-army unit lists (`Units`)
- a unit name in bot data is the exact buy-card name `name(side)` from a unit set, not the entity name

## Per game
- as64: a Lua error leaves the bot idle and the match goes on (MIS-33); mowas2: the same error aborts the game
- goh: no `bot.data.lua`. Bots buy from `script/multiplayer/bot.main.lua` + `modes/*.lua`; botrecipe on goh writes the roster `units/<army>/<stage>.<army>.lua`: MCP `mow_bots_recipe {game:"goh", mod, action:"buy_first", unit, army:"ger", stage:"mid", out}` (stage early|mid|late|conquest, or `after`); check and fix actions refuse. To read them: GUI Bots page, card "See what bots buy" on the GoH tab (pick the list; lines it cannot read are listed with file and line); to add: card "Make bots buy a unit" there (army, list, unit; Preview, then Write into the mod). A GoH bot buys only a card that is for sale, researched and of its doctrine (GHMIS-58)

## Silently fails
- MIS-32 a stale or misspelt card name: never bought, no error, log prints `DBG: Spawning Unit Not found`
- MIS-46 / MIS-13 `Spawn` returns true for an unknown card: never trust the return value
- MIS-09 an army missing from a stage's `Units` buys nothing in that stage
- MIS-83 `Purchases` needs a last stage with `Repeat = 0` or the bot stops buying
- MIS-77 a `Units` list for an army id not among the stock armies is never read
- MIS-79 `class = UnitClass.X` with X not a member is nil: the entry never matches
- MIS-78 a global assigned twice: Lua keeps the last
- TST-94 a mod `units/common.set` replaces the stock list: bots lose every card not listed again

## Verify
- in a match on a flag mode: the spawn line of the unit in game.log (`mow_game_log {}`), and the unit seen on the map
