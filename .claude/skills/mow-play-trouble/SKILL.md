---
name: mow-play-trouble
description: Find out why Men of War Assault Squad 2 (MoW:AS2, mowas2), its 64-bit build AS64 (as64) or Gates of Hell (GoH, goh, Call to Arms - Gates of Hell Ostfront) is failing for a player. Load when the game will not start, closes at once, crashes on load or in a match, shows "Program will be terminated", "define not found", "unexpected token", "Resource Error", an error code 0x0bad..., a mod will not load or is missing from the list, "not up to date", "made for X mode: not applied", multiplayer says out of sync, desync or "different version", cannot join, textures are missing, pink or checkered, text shows as desc/... keys, or the game is slow to load or play. Reads the log first. For setting things up use mow-play-setup; for fixing a mod's own data use mow-mod-check-fix.
---

# mow-play-trouble: why the game fails for a player (router)
Read `read-the-log.md` first, then the ONE symptom file.

## Always
1. Which game (not AS64 -> `mow-games` first), which mods are on (`mow_game_status {game}`), what the person did last, what they saw.
2. Read the log BEFORE guessing: `mow_game_log {game}`, `mow_game_crash {game}`. The AS2 log is overwritten at every start: tell the person not to restart the game, or to copy `game.log` first. LOG-01 [V]. AS64 keeps the previous run as `game.prev.log`; MoW:AS2 does not. LOG-19 [V]
3. One cause, one next step, in plain words. Then the check that proves it.
4. Read only. No tool here writes into a game folder; do not delete logs or mods. Starting the game needs the user's yes.
5. Row ids name the source: `mow_limit {ids: ["ENG-24"]}` Â Â· GoH.
6. Offer the mod author's fix path (`mow-mod-check-fix`) only if they own the mod.

## Symptom -> file -> tools
| the person sees | read | tools |
|---|---|---|
| (always first) where the log is, how to read it | `read-the-log.md` | `mow_game_log`, `mow_game_crash` |
| game will not start, closes at once, error box at start | `will-not-start.md` | `mow_game_status`, `mow_mod_info` |
| mod missing from the list, not applied, "not up to date" | `mod-absent.md` | `mow_mod_info`, `mow_mod_check` |
| crash on load, when a unit appears, or in a match | `crash-on-load-or-play.md` | `mow_game_crash`, `mow_mod_check` |
| out of sync, "different version", cannot join, host left | `multiplayer.md` | `mow_mp_sync`, `mow_game_crash` |
| checkered or missing textures, raw text keys, skeleton soldier | `looks-wrong.md` | `mow_mod_check`, `mow_file_which` |
| slow start, long load, low frame rate | `slow.md` | `mow_game_log`, `mow_game_status` |
| GoH error codes and GoH-only faults | `goh-faults.md` | `mow_game_log`, `mow_limit` |
| the log shows nothing: find the mod by halving | `bisect-mods.md` | `mow_mods_enable`, `mow_mods_clash` |
| check things without starting the game | `check-without-starting.md` | `mow_mod_check`, `mow_game_status` |

## Say it plainly
What broke, in one sentence. The one thing to do next. How they will know it worked.
