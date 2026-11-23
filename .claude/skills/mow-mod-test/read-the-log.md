# mow-mod-test: read the log, new errors against vanilla

when: after every run, "what went wrong in the last run", "read game.log", "is this error mine or the game's".
G = AS2 install, `<mod>` = mod folder. Read only. Do it BEFORE the next launch: game.log is overwritten at every start (lim LOG-01).

## Steps
1. MCP `mow_game_log {game:"as64"}` → what went wrong, where, how to fix; harmless noise left out (`prev:true` = the run before, as64 keeps `game.prev.log`; `log:"<path>"` = a kept copy)
2. CLI with the mod's lines marked:
   `node tools/logtriage/logtriage.js [<logDir|game.log>] [--inst N | --all-instances] [--exe as64|mowas_2|mowas2|goh | --goh] [--mod dir] [--game dir] [--mods a,b] [--keep N] [--since ms|ISO] [--json] [-q] [--summary] [--lua]`
   phases, collapsed duplicates, cause + limits row per finding, benign noise as info; `--lua` = bot script lines; `--keep N` keeps copies
3. new errors against a vanilla run: once `node tools/bootcheck/bootcheck.js [--exe as64|mowas_2|mowas2|goh] base <game.log> [-o base.json]`, then `mod <game.log> --base base.json [--mod name] [-o out.json]` (PASS = 0 new error lines + the run reached the clock + mod active)
4. a row id in the answer: MCP `mow_limit {ids:["LOG-07"]}` · CLI
5. a message not explained: MCP `mow_lookup {query:"<words of the message>"}`
- GUI: `logs` page (last run, triage, kept logs)

## Where the log is
- as64 / mowas2: `<Documents>/My Games/Men of War - Assault Squad 2/log/game.log`; as64 instance N: `... - instance N/log/`
- goh: `<Documents>/My Games/Gates of Hell/` or `%LOCALAPPDATA%/digitalmindsoft/gates of hell/` (OneDrive Documents or `-useLocalDataFolder`: GHVFS-13, LOG-22). `node tools/uidrive/uidrive.js where goh`

## Per game
- as64: previous log kept as `game.prev.log`; mowas2: truncated at start, no prev file
- goh: every line starts `[hh:mm:ss] ` (GHLOG-07), errors carry `(file.cpp:line)` and `0x0bad000N` codes: logtriage `--goh`

## Reading traps
- LOG-07 `No Stuff found` → `dummy_checker`: the load looks fine, the crash comes when the item is used
- LOG-05 runtime warnings carry no unit name: match the time to what was done
- TST-02 the log never names local mods: the mod being active is checked elsewhere (`enable-mods.md`)
- MIS-33 as64 logs a failed Lua call and plays on: a silent idle bot; grep for it
- MIS-01 DDA files skip unknown keys with no line: a clean log does not prove a card or mission key was read
- INT-04 `{call "undefined"}` is silent; VIS-29 a missing fx texture is silent: silence is not proof
- vanilla itself logs errors: only NEW lines against the base count

## Verify
- a triage with the mod named, compared with a vanilla base; the log copy kept with the test record (date, mod version, map:mode)
