# mow-mod-ai-bots: bots buy nothing or stand still

when: "bots do nothing", "bots buy and then stay at the base", "the bot never attacks", "match ends at once with bots".
G = AS2 install, `<mod>` = mod folder. Diagnose first; nothing here writes until step 5.

## Steps (cheapest first)
1. the mode and the map: MCP `mow_mode_info {mode:"<mode>"}` (bots allowed?) · `mow_map_info {map:"<map>"}` (flag points per mode, bots)
2. the log of the last run: MCP `mow_game_log {}` · CLI `node tools/logtriage/logtriage.js --lua [--mod <mod>]` (Lua call failed lines, `DBG: Spawning Unit Not found`)
3. bot data shape: MCP `mow_bots_recipe {mod:"<mod>"}` (check) · CLI `node tools/botrecipe/botrecipe.js <mod> --check --game G`
4. lint: `node tools/milint/milint.js <mod> [--game G] [-q]` (MIS_BOT_NO_FLAGS, MIS_BOT_ARMY_MISSING, WARN_MIS_BOT_ORDER)
5. known fixes into the mod: MCP `mow_bots_recipe {mod:"<mod>", action:"fix", out:"<mod>"}` (preview; `write:true`) · dead keys: MCP `mow_mod_fix {mod:"<mod>", out:"<patch folder>", only:["botkeys"]}`
- GUI: Game Modes & AI tab > `bots` > Match setup (is the mode ready for bots, try a bot match: `bots/modeready/list`, `bots/botmatch/plan`; start is a launch route)

## Causes (row → what to do)
- MIS-65 the mode has no flag points on this map: bots buy and never give an order, no log line. `:combat` has none, `:battle_zones` has → test on a flag mode
- MIS-61 bots on a 1v1 lobby: the match ends in ~17 s because the host owns no units → a 4-slot map (2v2_farmstead works) or give the host a unit
- MIS-81 a bot.data.lua global missing or of the wrong shape: Lua error → keep the stock shape
- MIS-83 no last stage with `Repeat = 0`: buying stops
- MIS-09 the army is absent from the stage's `Units`
- MIS-32 card names stale → `bot-buy-list.md`
- MIS-08 the bot API has only `Spawn`, `CaptureFlag`, `SayChat` (+ queries `Income`, `EnemyHasTanks`): there is no attack or retreat order to script
- MIS-74 bot tanks get the same CaptureFlag rotation as infantry every 180 s; in 5 matches they fired no gun [V once]
- MIS-82 / MIS-10 / AI-15 keys stock bot.lua never reads (`period`, `AttackBaseTime`, typos) do nothing
- MIS-67 `fix_inventory 1` in bot men: breed kit skipped, men unarmed [I]
- MIS-71 a generated map's `:combat` answers "no AI here": use its captureflag
- TST-03 the vanilla LAN Combat card offers no bots → `bots-in-a-mode.md`

## Per game
- as64: a Lua error = idle bot, match goes on (MIS-33): always grep the log
- mowas2: a Lua error aborts the game; run bots through Skirmish with recorded menu routes (no pipe, TST-19)
- goh: other bot scripts (`bot.main.lua`, `modes/*.lua`), events by name not number (GHMIS-66); the check and fix actions refuse.

## Verify
- a match on a flag mode, 4 slots: the bot spawns units (log), they walk to flags, the match lasts; say what was watched and for how long
