# mow-mod-test: crash, "Program will be terminated", the game just closes

when: "it crashed", "crash dump", "the game closes when I buy the unit", "it dies before the menu".
G = AS2 install, `<mod>` = mod folder. Read only, except crashwatch which attaches to a running game the user agreed to watch.

## Steps
1. MCP `mow_game_crash {game:"as64"}` → the crash, fatal error or out-of-sync report of the last run (game.log, crash reports, oos folders), which part of the game failed, what to check (`log:"<path>"` = a kept log)
2. the log around it: MCP `mow_game_log {}` · `node tools/logtriage/logtriage.js --mod <mod>` (last phase reached, last file read)
3. when did it die → where to look
   - before the menu: a bad mod.info anywhere in the mods folder (ENG-24), a Classic/Enhanced mismatch (ENG-26): `node tools/modinfo/modinfo.js --all <mods dir>`
   - while loading data: syntax, undefined macro, missing include, unknown key in a strict block: MCP `mow_mod_check {mod:"<mod>"}`
   - at map load: mission forms (MIS-26, MIS-27, MIS-35, MIS-48), captureflag clips (MIS-62), cell size (PORT-70)
   - when a unit is bought or used: LOG-07 placeholder item, MIS-50 a card whose vehicle can not be created, model or volume faults (skill `mow-mod-models-effects`)
   - at the first crater: MAP-29 a terrain material with one layer
4. hard faults the game's own handler misses (attach BEFORE the crash):
   `powershell -ExecutionPolicy Bypass -File tools/crashwatch/crashwatch.ps1 [-Game as64|mowas2|goh] [-Inst N | -Inst 0 | -Pid N] -Out f [-Wait s] [-Exe exe] [-Plan]` (`-Plan` only finds the process)
5. bisect: disable half the change, or buy units one by one; a mod list bisect: enable half the mods (`enable-mods.md`)
6. fix → skill `mow-mod-check-fix`; ported units → skill `mow-mod-port` (`ported-unit-crashes.md`)

## Facts
- as64 writes minidumps under `log/minidumps`; a sidecar names the crash function when symbols are at hand

## Per game
- as64: can die with no dialog (gameprofile `feature.silent_crash` true [V]): an empty-handed exit is still a crash, look for the dump
- mowas2: `feature.silent_crash` false [V]: a dialog "Program will be terminated" with the error text; copy the text
- goh: `0x0bad000N` codes and `(file.cpp:line)` errors in the log (logtriage `--goh`); `Resource Error` at start = a replaced registry file (GHVFS-14)

## Traps
- the log names the macro, not the file, when the bad key sits in a define (PORT-53)
- an access violation in a mission trigger: MIS-40 (`actor_state` without `{type human}`), MIS-41 (`camera_follow_bone` in MP)
- UI-06 an unknown custom action instruction raises a non-continuable error
- INT-10 / INT-11 the 129th flag name or 33rd `able` name is fatal at load
- a crash that needs two mods → skill `mow-mod-together`

## Verify
- the same steps no longer crash, in one run, with the log read; say which step used to crash
