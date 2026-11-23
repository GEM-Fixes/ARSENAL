# mow-games: user folder, profile, logs, crash face
When: "where is the log", "where are my settings", "why is there no dump", "do the two AS2 exes share settings".

## Steps
1. `mow_game_status {game}` names the settings and log folders.
2. `mow_game_log {game}` reads that game's log; AS64 `prev: true` reads the run before.
CLI: `node tools/logtriage/logtriage.js --exe as64|mowas2|goh` (no path = that game's log folder).
GUI: Mods > Check & Fix > Read Game.log > "Log files the game left" (`logs/find`).

## Facts
| | AS64 | MoW:AS2 | GoH |
|---|---|---|---|
| user folder | `<Documents>/My Games/Men of War - Assault Squad 2/` | the same folder | `<Documents>/My Games/Gates of Hell/`, or `%LOCALAPPDATA%/digitalmindsoft/gates of hell/` (Documents in OneDrive, or `-useLocalDataFolder`) |
| profile | `profiles/<id>/options.set`, `keys.set` | the same files | its own |
| enabled-mod list | shared with MoW:AS2 | shared with AS64 | its own |
| log | `log/game.log`, `log/minidumps`, `log/oos` | same | `log/` in its folder |
| previous log | kept as `game.prev.log` | not kept | - |
| mods named in the log | header `Mod 'x' from` | no | `Mod: activate mod x` |
| log line form | plain | plain | `[hh:mm:ss]`, errors `(file.cpp:line)`, codes 0x0bad000N |
| empty / duplicate mod folder | silent | silent | warned |
| same fault | may close silently | Exception + dump | may close silently |
Rows: LOG-17 LOG-19 LOG-20 LOG-21 LOG-22 [V], GHVFS-13, GHLOG-07 -09 -10 -16, PORT-49 [V].

## Same in all
One `game.log` per run; the AS2 log is overwritten at every start (LOG-01 [V]).

## What goes wrong
- a mod list set for AS64 Enhanced shows up in MoW:AS2 (one list for both).
- looking for the GoH log under Documents on a OneDrive PC.
- AS2 line numbers in a log read as source lines: they come from another build (LOG-04 [V]).

## Check
The folder `mow_game_status` names holds a `game.log` with the time of the last run.
