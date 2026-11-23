---
name: mow-games
description: What is the same and what differs between Men of War Assault Squad 2 (MoW:AS2, mowas2, mowas_2.exe), its 64-bit build AS64 (as64, as64.exe) and Gates of Hell (GoH, goh, Call to Arms - Gates of Hell Ostfront, call_to_arms.exe), for modding and for playing. Load FIRST whenever the game in question is not AS64, or the user asks "does this work in Gates of Hell", "is it the same in the original Assault Squad 2", "which game is this mod for", "where is the game folder / log / mods folder", "which tool works for GoH", "can I use an AS2 mod in GoH", "what is as64", "is AS64 the same game", "32-bit or 64-bit", "can AS2 and AS64 players play together", "does GoH have doctrines / Conquest / head start". A router: one small file per area.
---

# mow-games: the three games, same and different (router)
Read ONE area file. Values in them are pointers; the tool output is the truth.

## The three games
- `as64` AS64: Men of War Assault Squad 2, 64-bit build `as64.exe`. The default of every tool. Same install folder and data version as MoW:AS2; adds `as64/core`, the built-in `as64+` mod and two mod modes.
- `mowas2` MoW:AS2: the original `mowas_2.exe`, frozen. The gameprofile id is `mowas_2`; MCP tools and most CLIs say `mowas2` (CLIs take both).
- `goh` GoH: `binaries/x64/call_to_arms.exe`, own install, version on a 1.x scale. Same engine family, many more systems.
Rule of thumb: AS64 and MoW:AS2 differ in the exe (loading, logs, test hooks, timing), not in data rules. GoH differs in data, formulas and systems.

## Always
1. Facts from a tool, never from memory: `mow_game_diff {game: "as64", other: "goh"}` (each fact with tag and source row); one key: `mow_game_diff {game: "goh", key: "exe"}`.
2. GoH engine rows: `mow_lookup {query: "<words>", web: "goh"}` Â· `mow_limit {game: "goh", ids: ["GHVFS-04"]}` Â.
3. Trust: limits [V] = checked in code or game. = untested, nothing run; "GoH lacks X" is an upper limit. Say that when you quote one.
4. Never quote an as64 row as a GoH fact, or the reverse, without the matching GH row (`base:` in each GH row names its as64 partner).
5. MoW:AS2 and AS64 in one multiplayer match: untested [T]. Do not promise it.

## Area -> file -> tools
| area | read | tools |
|---|---|---|
| install folders, exes, versions, Steam apps | `install-and-exes.md` | `mow_game_status`, `mow_game_diff` |
| user folder, profile, logs, crash face | `user-folder-and-logs.md` | `mow_game_log`, `mow_game_status` |
| `mod.info`, version gate, Classic / Enhanced | `mod-info-and-version.md` | `mow_mod_info`, `mow_mod_check` |
| what a mod root mounts, load order, layers | `mounting.md` | `mow_file_which`, `mow_mods_clash` |
| data folders, text files, interface, encoding | `data-and-text.md` | `mow_lookup`, `mow_text_find` |
| economy, doctrines, modes, campaign | `economy-and-modes.md` | `mow_mode_info`, `mow_army`, `mow_price` |
| combat rules: damage, armour, veterancy, movement | `combat.md` | `mow_matchup`, `mow_unit_armor` |
| multiplayer, saves, replays | `multiplayer-saves.md` | `mow_mp_sync`, `mow_limit` |
| testing, editors, start flags, bots | `testing-and-editor.md` | `mow_game_start`, `mow_game_routes` |
| which tool or GUI page serves which game | `which-tool.md` | `mow_tools`, `gui_pages` |
| does a mod of one game work in another | `mod-across-games.md` | `mow_port_plan`, `mow_mod_upgrade` |

## Then load
Playing: `mow-play-setup`, `mow-play-coach`, `mow-play-armies`, `mow-play-multiplayer`, `mow-play-singleplayer`, `mow-play-trouble`. Modding: the `mow-mod-*` skill for the task.
