---
name: mow-play-singleplayer
description: Help a person play alone in Men of War Assault Squad 2 (MoW:AS2, mowas2), its 64-bit build AS64 (as64) or Gates of Hell (GoH, goh, Call to Arms - Gates of Hell Ostfront). Load when they ask about the campaign, skirmish missions, the tutorial, "which mission first", mission objectives, difficulty levels and what they change, saving and loading, autosave, "my save is broken", "where are my saves", direct control ("how do I drive / aim a tank myself"), slow time and pause, replays ("how do I watch my match", "replay will not play"), screenshots, GoH Conquest (dynamic campaign), or opening the editor to try units as a player. Not for multiplayer (mow-play-multiplayer), installing mods (mow-play-setup), unit advice (mow-play-coach), or making missions (mow-mod-maps-missions).
---

# mow-play-singleplayer: missions, saves, difficulty, direct control (router)
Read ONE sub-file for the question.

## Always
1. Which game: AS64, MoW:AS2 or GoH (not AS64 -> `mow-games` first). AS64 and MoW:AS2 share missions, saves and profile.
2. Keys differ per profile: read them with `mow_settings_info {game, what: "keys"}` before naming a key.
3. Mission facts from the tool (`mow_mission_info`), never from memory; a mod changes missions.
4. Tools read only. Saves, replays and the profile are the player's files: never delete or edit them without a yes.
5. Row ids name the source: `mow_limit {ids: ["NET-07"]}` Â Â· GoH (GH rows are not yet tried in game).

## Question -> file -> tools
| the person asks | read | tools |
|---|---|---|
| campaign and skirmish missions, the tutorial, objectives | `missions.md` | `mow_mission_info`, `mow_map_info` |
| difficulty levels, what they change | `difficulty.md` | `mow_limit`, `mow_lookup` |
| save, load, autosave, broken save | `saves.md` | `mow_game_status`, `mow_game_log` |
| direct control: drive, aim, fire by hand | `direct-control.md` | `mow_settings_info`, `mow_matchup` |
| pause, slow time, camera, screenshots, stats | `pause-and-view.md` | `mow_settings_info` |
| replays: record, watch, why one fails | `replays.md` | `mow_game_log`, `mow_limit` |
| the editor for a player: try units on a map | `editor-for-players.md` | `mow_unit_find`, `mow_map_info` |
| GoH Conquest | `goh-conquest.md` | `mow_lookup`, `mow_limit` |

## Next skill
Against bots in a lobby -> `mow-play-setup` (add bots). A crash -> `mow-play-trouble`.
