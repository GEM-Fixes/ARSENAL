---
name: mow-play-multiplayer
description: Help a person play multiplayer in Men of War Assault Squad 2 (MoW:AS2, mowas2), its 64-bit build AS64 (as64) or Gates of Hell (GoH, goh, Call to Arms - Gates of Hell Ostfront). Load when they ask about the lobby, "how do I host", "how do I join my friend", LAN or Internet, "my friend cannot see my game", game modes and how each is won (Assault Zones, Combat, Frontlines, capture the flag, co-op / Skirmish), match length, score, flags, team play, giving units to an ally, chat keys, command points, doctrines, "everyone needs the same mods", playing with mods, "we went out of sync", "the host left", "can I rejoin", lag, dedicated server, 1v1 to 4v4. Not for installing mods (mow-play-setup), unit choice (mow-play-coach, mow-play-armies) or deep fault finding (mow-play-trouble).
---

# mow-play-multiplayer: lobby, modes, team play (router)
Read ONE sub-file for the question.

## Always
1. Which game: AS64, MoW:AS2 or GoH (not AS64 -> `mow-games` first). All players need the same game exe and build (NET-13 [V]).
2. Mode rules, scores and times change with mods: read them with `mow_mode_info {game, mode, mod}`, never quote a number from memory.
3. Multiplayer is lockstep: every PC runs the same simulation from the same files. Same mods, same order, same file contents for everyone (NET-01 NET-04 [V]).
4. Starting the game or changing the mod list is a launch tool: env `ARSENAL_ALLOW_LAUNCH=1` plus the user's yes; otherwise give the clicks.
5. Row ids name the source: `mow_limit {ids: ["NET-05"]}` Â Â· GoH. GH rows are not yet tried in game.

## Question -> file -> tools
| the person asks | read | tools |
|---|---|---|
| lobby clicks, slots, options, map size | `lobby.md` | `mow_map_info`, `mow_mode_info` |
| host a match, friends cannot see or join it | `host-and-join.md` | `mow_game_status`, `mow_mp_sync` |
| which modes exist, how each is won | `modes-and-win-rules.md` | `mow_mode_info` |
| team play: chat, sharing units, roles | `team-play.md` | `mow_settings_info`, `mow_army` |
| command points, unit limits, match length | `command-points-and-limits.md` | `mow_mode_info`, `mow_army` |
| GoH doctrines, waves, its modes | `goh-doctrines-and-modes.md` | `mow_mode_info`, `mow_army` |
| play with mods: same files for everybody | `play-with-mods.md` | `mow_mp_sync`, `mow_mods_enable` |
| out of sync, dropped, host left, rejoin | `out-of-sync.md` | `mow_game_crash`, `mow_mp_sync` |
| bots as team mates or enemies | `bots-in-multiplayer.md` | `mow_bots_info`, `mow_mode_info` |

## Next skill
What to buy -> `mow-play-armies`. Why a shot failed -> `mow-play-coach`. Fault with a log -> `mow-play-trouble`.
