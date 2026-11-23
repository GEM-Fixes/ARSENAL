---
name: mow-mod-multiplayer
description: Change multiplayer rules in a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh), and keep the mod playable online. Load when the user says "game mode", "new game mode", "game mode rules", "presets", "presets.inc", "unit limits", "command points", "CP", "manpower", "MP income", "budget", "starting resources", "payback", "resource slider", "cooldown factor", "which units a mode allows", "unitset", "era", "doctrine", "doctrines in my mod", "lobby option", "lobby dropdown", "teams and alliances", "army list in the lobby", "match length", "flag capture time", "win condition of a mode", "out of sync", "desync", "what desyncs", "host with mods", "everyone needs the same mod", "test a multiplayer match", "replay does not play".
---
# mow-mod-multiplayer (router): read ONE sub-file

Game word: `as64` | `mowas2` | `goh`; ask when unknown (differences → skill `mow-games`). G = game install, `<mod>` = the user's mod folder.

## Always
- game install and vanilla data are read-only; write only into the mod folder the user names
- multiplayer data is read by a loader that SKIPS unknown keys without a message (MIS-01, GPL-08): lint after every edit
- every player needs the same data and the same mod order; a rules change is done only after a match was played with it and the log read (→ skill `mow-mod-test`)
- tools plan first; `write: true` writes

## Sub-tasks
| sub-task | read | tools |
|---|---|---|
| a mode's card: class, parameters, settings, teams | `game-mode-card.md` | `mow_mode_info`, `mow_mode_add`, `mow_mission_lint` |
| presets: unit sets, limits, command points, cooldown factors | `presets-limits.md` | `mow_mode_info`, `mow_mission_lint` |
| budgets: start, income, payback, lobby resource slider | `budgets-income.md` | `mow_mode_info`, `mow_price` |
| which units and armies a mode offers | `buy-list-and-armies.md` | `mow_army`, `mow_unit_find`, `mow_mission_lint` |
| doctrines | `doctrines.md` | `mow_army`, `mow_game_diff`, `mow_lookup` |
| lobby: options, dropdowns, teams, alliances, slots | `lobby.md` | `mow_mode_info`, `mow_settings_info` |
| how a mode is won: flags, score, time | `win-rules-flags.md` | `mow_mode_info`, `mow_mission_triggers` |
| what desyncs and how to read an out-of-sync | `what-desyncs.md` | `mow_mp_sync`, `mow_game_log`, `mow_limit` |
| host and join with mods | `hosting-with-mods.md` | `mow_mp_sync`, `mow_mods_enable` |
| play a test match (alone, with bots, two instances) | `test-multiplayer.md` | `mow_game_start`, `mow_game_drive`, `mow_game_log` |
| replays and saves with a mod | `replays-saves.md` | `mow_lookup`, `mow_limit` |

## Across
- a unit's price, cooldown, rank, card → skill `mow-mod-units` (`price-cooldown-rank.md`, `buy-menu-cards.md`)
- is a price fair → skill `mow-mod-weapons-damage` (`price-model.md`)
- maps, spawn and flag points, adding a mode to a map → skill `mow-mod-maps-missions`
- bots in a mode, bot buy lists → skill `mow-mod-ai-bots`
- packing and the same-files check for a release → skill `mow-mod-share` (`multiplayer-same-files.md`)
- scripts that stay in sync → skill `mow-mod-scripts` (`sync-safe-scripts.md`)
- a PLAYER asking how to host or join → skill `mow-play-multiplayer`

## Depth
- `mow_lookup {query:"mission/mp-chain", mode:"topic"}` (also `mission/mp-preset`, `mission/mp-budget`, `mission/mp-units`, `net/rules`, `net/sync`, `net/appcrc`, `net/session`)
- rows: `mow_limit {ids:["MIS-05"]}`; areas MIS, NET, GPL; GoH:
- guide: `mow_guide {chapter:"12-missions-and-multiplayer-setup"}`, `{chapter:"p10-missions-and-modes"}`

## Tell the user
- which file was planned or written, what the lint said, and what still needs a played match
