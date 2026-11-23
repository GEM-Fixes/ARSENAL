---
name: mow-mod-ai-bots
description: Change bots and unit AI in a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "bots do not buy my unit", "bot purchase list", "bot.data.lua", "bot.lua", "make the AI harder", "bot difficulty", "bot doctrine", "bot personality", "bots do nothing", "bots stand still", "add bots to a game mode", "no bots in the lobby", "skirmish with bots", "unit AI", "soldiers do not shoot", "tank does not fire at infantry", "targeting", "target priority", "which ammo the AI picks", "brain", "sensor", "AI orders on a map", "bots ignore the flags".
---

# mow-mod-ai-bots: MP bots and unit AI (router)

game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. G = AS2 install, H = GoH install, `<mod>` = the user's mod folder.
Two different things: the MP bot (a Lua player that buys units and sends them to flags) and unit AI (brain, sensor, target and ammo rules of every unit, player-owned too).

## Always
- game installs + vanilla scripts read-only; write only inside `<mod>` the user named (botrecipe and doctrine refuse `--out` inside an install); write tools preview unless `write: true`
- Lua and SDL text: CRLF, UTF-8 strings, ASCII identifiers
- bot behaviour is [T] until watched in a match on a flag mode with 4 slots: the bot bought the unit, moved, log read (→ skill `mow-mod-test`)
- read ONE sub-file for the task; each stands alone

## Sub-tasks
| sub-task | file | tools |
|---|---|---|
| make bots buy a unit, read what they buy | `bot-buy-list.md` | `mow_bots_info`, `mow_bots_recipe`, botrecipe |
| bots buy nothing or stand still | `bots-do-nothing.md` | `mow_bots_recipe`, `mow_game_log`, milint |
| bots in a mode that offers none | `bots-in-a-mode.md` | `mow_mode_bots`, `mow_mode_info` |
| harder / other personality | `bot-doctrine.md` | doctrine |
| who a unit shoots at, with which ammo | `unit-ai-targets-ammo.md` | patch-entity, keylint |
| brain and sensor values, sight | `brain-sensor-values.md` | `mow_entity_info`, patch-entity, keylint |
| orders for AI units inside a mission | `map-ai-orders.md` | `mow_mission_info`, milint |

## Across
- the bot Lua API itself (what a script may call) → skill `mow-mod-scripts` (`bot-lua-api.md`)
- mode cards, budgets, lobby → skill `mow-mod-multiplayer`; buy cards and squads → skill `mow-mod-units`
- vision sets and night sight → skill `mow-mod-models-effects` (`vision-environment.md`)

## Depth
- limits AI (24 rows), MIS-08..10, MIS-32, MIS-77..84 · GoH:
- guide: 10-ai-and-bots, p11-bots, r12-bot-lua-and-console (MCP `mow_guide {chapter:"p11"}`)

## Tell the user
- which list or rule changed, for which armies and stages
- what was watched in a match (bot bought X at minute N, went for flags) and what is still [T]
- the mode and map used for the test, since bots behave differently without flags
