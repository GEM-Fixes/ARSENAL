---
name: mow-play-setup
description: Help a person set up and start a game of Men of War Assault Squad 2 (MoW:AS2, mowas2), its 64-bit build AS64 (as64) or Gates of Hell (GoH, goh, Call to Arms - Gates of Hell Ostfront). Load when they ask how to install a mod, "where do I put the mod", subscribe on the Workshop, turn mods on or off, set the load order, "Classic or Enhanced", "what is as64+", start a skirmish or a match against bots, add bots, pick a game mode or map, change settings, graphics or key bindings, "where is my profile / options.set / keys.set", start the game from a tool, or check which build is installed. Not for a game that fails to start or crashes (mow-play-trouble), not for unit advice (mow-play-coach), lobby and team play in depth (mow-play-multiplayer), campaign, saves, replays, editor (mow-play-singleplayer).
---

# mow-play-setup: get the game and its mods ready (router)
Read ONE sub-file for the step the person is at.

## Always
1. Which game: AS64, MoW:AS2 or GoH. Not AS64 -> load `mow-games` first. AS64 and MoW:AS2 share one install folder and one player profile (LOG-20 [V]); GoH has its own.
2. What is there now: `mow_game_status {game}` (install, exe build, enabled mods in order, running, settings and log folders, may this server start the game).
3. Tools never write into a game folder. Starting the game or switching its mod list is a launch tool: needs env `ARSENAL_ALLOW_LAUNCH=1` and the user's yes, each time. Otherwise tell the person the clicks. `dry: true` on a launch tool needs no env: it answers what would run and starts nothing.
4. Facts with a row id are from the webs; read one with `mow_limit {ids: ["VFS-26"]}` Â.
5. Say the clicks in the game's own words (Options -> MODS, "New game"), short, one step per line.

## Sub-task -> file -> tools
| step | read | tools |
|---|---|---|
| is the game installed, which build, where are the folders | `install-check.md` | `mow_game_status`, `mow_game_diff` |
| put a mod into the game (folder, Workshop), will it load | `install-a-mod.md` | `mow_mod_info`, `mow_mod_check` |
| turn mods on or off, prove they are on | `turn-mods-on.md` | `mow_game_status`, `mow_mods_enable` |
| load order, which mod wins, mods that need other mods | `load-order.md` | `mow_mods_clash`, `mow_file_which` |
| AS64: Classic or Enhanced, `as64+` | `as64-classic-enhanced.md` | `mow_mod_info`, `mow_mods_enable` |
| start a match: clicks, map, mode, lobby options | `start-a-match.md` | `mow_mode_info`, `mow_map_info` |
| add bots, which modes take them | `add-bots.md` | `mow_bots_info`, `mow_mode_info` |
| settings, graphics, keys, profile folder | `settings-and-keys.md` | `mow_settings_info` |
| start or steer the game from a tool | `start-by-tool.md` | `mow_game_start`, `mow_game_drive`, `mow_game_routes`, `mow_game_shot` |
| the ARSENAL window for all this | `gui-pages.md` | `gui_status`, `gui_open` |

## Next skill
Friends and lobbies -> `mow-play-multiplayer`. Campaign, saves, replays, editor -> `mow-play-singleplayer`. It fails -> `mow-play-trouble`.
