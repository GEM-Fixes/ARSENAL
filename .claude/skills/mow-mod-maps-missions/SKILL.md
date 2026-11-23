---
name: mow-mod-maps-missions
description: Clone, make or change maps, missions and game modes in a mod for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "copy a map", "clone a map", "new map", "make a map from a height image", "map does not show in the lobby", "map missing from the list", "add a game mode to a map", "mission", ".mi file", "single-player mission", "skirmish mission", "capture the flag", "battle zones", "spawn points", "flag points", "place an object on the map", "put a house on the map", "map.info", "max players", "map picture", "minimap", "what changed in my map".
---

# mow-mod-maps-missions: maps, missions, game modes on a map (router)

game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh` · `--target as64|mowas2|goh`. G = AS2 install, H = GoH install, `<mod>` = the user's mod folder.

## Always
- game installs + vanilla maps read-only; write only inside `<mod>` the user named (GoH: outside H). write tools preview unless `write: true`
- `.mi`, `map.info`, mode `.set` are text: CRLF, UTF-8 strings, ASCII identifiers. `map.net`, `.ply` are binary: bytes untouched
- done = the map is listed, hosts and loads in game, the mode starts, game.log read (→ skill `mow-mod-test`)
- read ONE sub-file for the task; each stands alone

## Sub-tasks
| sub-task | file | tools |
|---|---|---|
| list maps, read a map, its modes, a text picture | `read-a-map.md` | `mow_map_info`, `mow_mission_info`, mapview |
| copy a map under a new name | `clone-a-map.md` | `mow_map_clone`, map-clone |
| give a map another game mode | `add-a-game-mode.md` | `mow_mode_add`, mission-clone, misgen |
| new map from a height image, tiny test map | `new-map.md` | mapgen, testmap |
| single-player mission + menu entry | `single-player-mission.md` | spmis |
| place an object, players, map texture variant | `place-objects.md` | `mow_map_place`, place-entity, gen `mapinfo` |
| map or mode missing from the lobby | `lobby-listing.md` | `mow_map_info`, `mow_mod_check`, milint |
| lint a map, see what changed | `lint-and-diff.md` | milint, misdiff, `mow_mod_check` |

## Across
- triggers, conditions, commands inside a `.mi` → skill `mow-mod-scripts` (`mission-triggers.md`)
- mode rules, budgets, lobby, sync → skill `mow-mod-multiplayer`
- bots on a map or mode → skill `mow-mod-ai-bots`
- GoH map to as64 → skill `mow-mod-port` (`goh-map-to-as64.md`)

## Depth
- limits MAP (36 rows), MIS · GoH:
- guide: 13-maps, 12-missions-and-multiplayer-setup, p09, p10, r11 (MCP `mow_guide {chapter:"p09"}`)

## Tell the user
- new map / mode name as the lobby shows it, the folder in `<mod>`, players
- what was copied byte for byte and what was rewritten
- seen in game or not: listed, hosts, loads, mode starts; what is left to look at by eye
