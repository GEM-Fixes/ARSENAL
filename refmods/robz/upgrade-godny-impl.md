# Godny implementation -> as64 upgrade (the 4.3 GB folder)

UPG-5, coordinator. `mods/robz realism mod 1.30.10 godny implementation` read-only. Not `godnymod`, the small mod in `upgrade-godny.md`. Output `mods/godny_as64`.

## Stage 1, plan [V tool output]
- Read: 279 loose files, 9 archives (8 `.pak` + `1.pat`), 99,663 entries, 301 s. Scratch: `../run/sessions/w3/UPG-5/plan.out`.
- Keeps: all 9 archives byte for byte ("0 rebuilt, 9 copied").
- Changes: `mod.info` only: Min 3.262 -> 3.301, Max removed, FileId removed.
- Leaves out: `robzbot.dll` (fixed to one exe build, never loaded by the tool).
- Can't convert: 250 Lua scripts, read by name only. They hold the rewritten bot.
- Warnings: 5 WARN_MOVE_LOCCOVER_LOC_FILE_REPLACED, 3 WARN_MOVE_KEY_NOT_IN_DEST_EXE; behaviour anm-blend 350, bot-lua 4, switch-bug 360; 16 notes.
- Tool note says "8 pak(s) read" of 9 archives. Same gap as the RobZ copy (7 of 8), so the count leaves out `1.pat` [I].

## Sizes [V measured, outcome I]
- Hardlinked: 4,530,634,145 B (4.22 GiB), 9 archives.
- New: 6,606,601 B (6.3 MiB) in 278 loose files, less the rewritten `mod.info`, plus UPGRADE.md.
- If links fail the writer silently copies: 4.22 GiB. Output must read "9 hardlinked".

## Samples, sha256, compare after stage 2 [V]
```
fb209f24fb6d41511bf3328db77ba65a59dcfd9d69baaccd369bcdccc1c371cb  .patch
c5437bab83da6f0f777161ae3dafc3fca58931be4f681c16aa0e865404086832  1.pat
de3eb3d3e94fac37b8cada2866cd3aca3f75e8c4fd266eb9f10979604c678079  resource/gamelogic.pak
2fa49f1ce90511ea70045b0a4a21f8b8885dd30a400843a5407ee71c71da3b41  resource/interface.pak
948ee2be5346872c48c638813134ec0a9cb17389cdfb22c38627322a3b0b3f92  mod.info   (source only)
```

## Can't be known without the game [T]
Whether Enhanced mounts it; whether the bot works without `robzbot.dll` (`godny.md` covers what the DLL does); whether the 250 Lua scripts run on as64 (log: "Lua call failed").

## Stage 2, written 2026-11-06 [V tool output + sha256]
`mods/godny_as64`: "9 hardlinked" (4320.7 MB not copied). All four samples match the source hashes; source `mod.info` unchanged (948ee2be...). Min 3.301, no Max, no FileId, no `robzbot.dll`. VERDICT partial, untested: 3 behaviour warnings, 16 notes, DLL left out. Boot [T].
