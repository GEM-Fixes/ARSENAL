# mow-mod-scripts: bot Lua (API, events, errors)

when: "what can bot.lua do", "BotApi", "bots idle after my Lua edit", "Lua error", "make the bot attack", "bot script for my game mode", "print from Lua".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Buy lists (`bot.data.lua`), difficulty, doctrine → skill `mow-mod-ai-bots`.

## Steps
1. what bots can and can not do in this game: MCP `mow_bots_info {}`
2. check a file or the whole mod: MCP `mow_lua_check {file:"<full path of .lua>"}` or `{mod:"<mod>"}` (structure errors that stop loading; with `mod` also the bot rules: orders the API has, bot.data.lua entries). it does not run Lua
3. buy-list side: MCP `mow_bots_recipe {mod:"<mod>"}` (action check) · CLI `node tools/milint/milint.js <mod folder> [--game dir] [--exe as64|mowas_2|goh]` (WARN_MIS_BOT_ORDER, MIS_BOT_UNIT_UNKNOWN, MIS_BOT_ARMY_MISSING, MIS_BOT_DEAD_KEY)
4. put the script at the same game path in the mod: `resource/script/multiplayer/bot.lua` (the copy replaces the whole file)
5. read its output: MCP `mow_game_log {}` → lines `[LUA] ..` and `DBG: ..`

## API (as64 / mowas2)
- the only Lua in the engine; Lua 5.2, all standard libraries open, one state per bot, HOST only
- `require([[/script/multiplayer/bot]])` goes through the game's files (mods override by path); entry `/script/multiplayer/bot.main.lua`
- `BotApi.Instance`: `.hostId .playerId .team .enemyTeam .army .teamSize` (read only)
- `BotApi.Events:Subscribe(ev, fn)`: ONE handler per event; `Init Done GameStart GameEnd Quant GameSpawn NonQuant`
- timers: `SetTimer(fn, ms)` / `KillTimer(id)` (real time), `SetQuantTimer` / `KillQuantTimer` (game time)
- orders: `BotApi.Commands:Spawn(unitName, split)`, `:CaptureFlag(squadId, flagName)`, `:SayChat(text)`; queries `:Income(side)`, `:EnemyHasTanks()`
- `print` / `log` write `[LUA] ..` to game.log

## Per game
- as64: a Lua runtime error is logged, the call returns nil, the match goes on with an idle bot (MIS-33)
- mowas2: the same error aborts the game (MIS-33)
- goh: scripts are `script/multiplayer/bot.main.lua` + `modes/*.lua`, no `bot.data.lua` (GHMIS-66); more orders (`SeekAndDestroy`, `SpawnAt`, `CanSpawn`, `IsUnitAvailable` .., GHMIS-58); event numbers differ: subscribe by name (WARN_MIS_BOT_EVENT_NUMBER)

## Silently fails
- MIS-08 there is no attack or retreat order in AS2: only Spawn, CaptureFlag, SayChat
- MIS-13 / MIS-46 `Spawn` returns TRUE for an unknown or unsold card and buys nothing (`DBG: Spawning Unit Not found`): never count on the return value
- MIS-32 unit names are exact card names `name(side)`
- MIS-65 on a mode with no flag points bots buy and never give an order
- MIS-74 bot tank squads get the same flag rotation as infantry
- MIS-20 no sandbox: a bot script can touch files; never ship one that does, never run an unread one
- NET-01 `.lua` is compared by size only in the lobby; it runs on the host, so a client copy does not matter for sync
- a second `Subscribe` to the same event replaces the first handler

## Verify
- `mow_lua_check` clean; a match with bots on a flag mode (battle_zones) for some minutes: units bought and moving, `[LUA]` lines without `call failed` in the log (→ skill `mow-mod-test`)
