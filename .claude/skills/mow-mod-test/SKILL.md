---
name: mow-mod-test
description: Run a mod in the game and read the log, for Men of War Assault Squad 2 (mowas2), AS64 (as64) or Gates of Hell (goh). Load when the user says "test my mod", "run it in game", "start the game with my mod", "does it work", "try it", "read the log", "game.log", "it crashed", "crash dump", "minidump", "what went wrong in the last run", "is this verified", "is the mod active", "enable my mod for a test", "what should I test", "test checklist", "screenshot of the game", "prove the unit works", and before calling any data change done.
---

# mow-mod-test: start the game with the mod, read the log, what counts as verified (router)

game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. G = AS2 install, H = GoH install, `<mod>` = the mod folder.
Launch tools need env `ARSENAL_ALLOW_LAUNCH=1` and the user's go-ahead: they start a program and change the enabled mod list in the user's profile. `dry: true` needs no env: it answers what would start and starts nothing.

## Always
- never write into a game install or the user's saves; the only profile write is the mod list (modswitch keeps `.modswitch.bak`): restore it when done
- game.log is overwritten at every launch (lim LOG-01): copy or triage it BEFORE the next start
- one game instance of a kind at a time unless using `-instance N` (as64 only); never kill a game the user started
- static results are not test results (`verified.md`)
- read ONE sub-file for the task; each stands alone

## Sub-tasks
| sub-task | file | tools |
|---|---|---|
| static gate, what to test | `static-gate-and-plan.md` | `mow_mod_check`, `mow_game_status`, testplan |
| enable only the mod under test, restore after | `enable-mods.md` | `mow_mods_enable`, modswitch |
| start a match on as64 | `start-as64.md` | `mow_game_start`, testrun, as2 e2e |
| start mowas2 or GoH (no control pipe) | `start-mowas2-goh.md` | `mow_game_routes`, `mow_game_drive`, uidrive |
| exercise and prove the change in the match | `prove-a-change.md` | `mow_game_shot`, prove, edrun |
| read the log, new errors against vanilla | `read-the-log.md` | `mow_game_log`, logtriage, bootcheck |
| crash, no log line, game closes | `crash.md` | `mow_game_crash`, crashwatch |
| what counts as verified, what to record | `verified.md` | none |

## Across
- two instances, LAN lobby, desync tests → skill `mow-mod-multiplayer` (`test-multiplayer.md`)
- fixing what the log names → skill `mow-mod-check-fix`; a player's own game failing → skill `mow-play-trouble`
- through the GUI window (`test`, `play`, `logs`, `testplan` pages) → skill `arsenal-gui-use`

## Depth
- limits TST (130 rows), LOG · GoH:
- guide: 18-testing-and-logs, 21-troubleshooting, p14 (MCP `mow_guide {chapter:"18"}`)

## Tell the user
- what was run: game, mod list, map:mode, how long
- which of the four "verified" points were met, with the log lines that show it
- new log findings by class (crash / error / warning) with the likely cause and the file
- what is left to look at by eye, as a short checklist; that the mod list was restored
