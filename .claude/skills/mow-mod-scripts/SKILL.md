---
name: mow-mod-scripts
description: Write and debug scripts in a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "interaction script", "{on bullet_hit}", "on event", "on spawn", "handler", "{if ...}", "{set flag}", "delay", "call", "unknown action", "unknown condition", "event already defined", "tank does not burn", "script does nothing", "damage script", "mission script", "trigger", "trigger never fires", ".mi commands", "condition terms", "selector", "waypoint", "reinforcement", "spawn units by script", "win condition script", "console command", "console variable", "dbg_", "-console", "bot.lua", "bot Lua API", "BotApi", "Lua error", "script desync".
---

# mow-mod-scripts (router): read ONE sub-file for the sub-task

game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh` · gen `--target as64|mowas2|goh`. not as64 → skill `mow-games` first.

## Always
- game installs + vanilla data read-only; write only inside the `<mod>` the user named
- three script kinds, three places: interaction (`set/interaction_entity`, `set/interaction_terrain`: per-entity `{on event}`), mission (`.mi` triggers in a map), bot Lua (`script/multiplayer/*.lua`, host only). there is no other scripting
- word lists (events, actions, commands, terms) come from the tools per game, never from memory
- a mod copy of a script file replaces the whole vanilla file: other mods' edits to it vanish (VFS-01)
- text CRLF, strings UTF-8, identifiers ASCII
- done = the event caused in game + game.log read (→ skill `mow-mod-test`); lint clean is "static clean"

## Sub-tasks
| sub-task | read | tools |
|---|---|---|
| how interaction scripts load, which block a unit gets | interaction-basics.md | `mow_script_find` `mow_script_words` `mow_entity_info` |
| events and conditions: what fires when, `{if}` rules | events-and-conditions.md | `mow_script_words` `mow_script_find` |
| actions, delays, flags, tags, calls | actions-delays-flags.md | `mow_script_words` `mow_script_lint` |
| give a new unit its own script block or macro | give-a-unit-its-block.md | `mow_mod_gen` (iblock, macro) `mow_script_lint` |
| mission triggers: read, write, why one never fires | mission-triggers.md | `mow_mission_triggers` `mow_mission_lint` `mow_mission_diff` |
| mission commands, terms, selectors, orders | mission-commands-selectors.md | `mow_mission_words` `mow_script_check` |
| console commands and variables | console.md | `mow_console_find` `mow_game_start` |
| bot Lua: API, events, errors | bot-lua-api.md | `mow_lua_check` `mow_bots_info` |
| scripts that stay in sync in multiplayer | sync-safe-scripts.md | `mow_script_find` `mow_mp_sync` |
| lint every script of a mod, one file while editing | lint-scripts.md | `mow_script_lint` `mow_mission_lint` `mow_lua_check` `mow_script_check` |

## Across (one line each)
- what a hit does to armour, damage numbers → skill `mow-mod-weapons-damage` (`hit-events.md`)
- bot buy lists and difficulty → skill `mow-mod-ai-bots` · mission files, zones, flags, modes → skill `mow-mod-maps-missions`
- effects and sounds a script starts → skill `mow-mod-models-effects` · panel buttons and actions → skill `mow-mod-text-ui`

## Depth
- (machine, events, events-actor, conditions, act-flow, act-entity, act-actor, flags, custom), mission/* (mi-structure, mi-commands, mi-forms, console, bot-lua, bot-data) · limits INT-*, MIS-*, NET-02
- guide via MCP `mow_guide` (`chapter`): 11-interaction-scripts, 12-missions-and-multiplayer-setup, p10-missions-and-modes, r10-interaction-scripts, r11-mission-files, r12-bot-lua-and-console
- GoH: / `-t mission` (not yet tried in game)
- GUI: Mods tab > Check & Fix; Editor (file outline and word help); Maps tab > `missions` page

## Tell the user
the file and handler or trigger changed, what lint said, what was caused in game and what the log showed.
