# mow-play-trouble: read the log
When: every trouble case, before any guess.

## Steps
1. `mow_game_log {game: "as64"}` -> what went wrong, where, how to fix it; harmless noise left out. AS64: `prev: true` also reads the run before. Another file: `log: "<full path of a game.log or log folder>"`.
2. A crash, fatal error or out-of-sync report: `mow_game_crash {game: "as64"}` (game.log, crash reports, oos folders).
3. A row it names: `mow_limit {ids: ["LOG-07"]}`.

## CLI
- `node tools/logtriage/logtriage.js --exe as64|mowas2|goh [--mod <modDir>] [--game <dir>] [--mods a,b]` (no path = that game's own log folder; `--summary` for the short form). Gives phase, cause and limits row per message.
- a live hang or crash with no dump: `powershell -ExecutionPolicy Bypass -File tools/crashwatch/crashwatch.ps1 -Game as64|mowas2|goh -Inst 0 -Out <file> -Plan` (`-Plan` only finds the process; without it a debugger attaches, so ask first).

## GUI
Mods > Check & Fix > Read Game.log > "Explain my last game log" (`logs/explain`), "Log files the game left" (`logs/find`).

## Where the log is
- AS2 and AS64: `<Documents>/My Games/Men of War - Assault Squad 2/log/` (one folder for both exes, LOG-20). Crash dumps beside it: `log/minidumps` with a sidecar `.mdmp.log`; out of sync: `log/oos/`.
- GoH: `<Documents>/My Games/Gates of Hell/log/`, or `%LOCALAPPDATA%/digitalmindsoft/gates of hell/log/` when Documents is in OneDrive. LOG-22 [V]

## By hand
Search `***** Exception *****`; read the 10 to 30 lines above it; the line with a file path in brackets is the culprit.

## Rules
- the AS2 log is overwritten at every start. LOG-01 [V]. AS64 keeps `game.prev.log`. LOG-19 [V]
- line numbers in an AS2 log come from another build: trust the message text, not the number. LOG-04 [V]
- a run-time warning names no unit: match its time to what the player did. LOG-05 [V]
- known harmless noise: OneDrive profile sync writes about 100 lines; lobby lines come twice. LOG-15 LOG-16 [V]
- a small crash dump holds no heap: read the sidecar and the lines above. LOG-10 [V]

## Per game
- MoW:AS2 writes Exception + dump for a fault where AS64 and GoH may just close. PORT-49 [V]
- GoH log form: every line stamped `[hh:mm:ss]`, errors as `(file.cpp:line)`, codes 0x0bad000N, `Mod: activate mod x`. GHLOG-07 GHLOG-09 GHLOG-10 GHLOG-16

## What goes wrong
- the person restarted the game: the AS2 log of the crash is gone (AS64: `prev: true`).
- reading the wrong folder (OneDrive, GoH).

## Check
The tool's cause names a file or a mod the person has; the fix makes that line vanish from the next log.
