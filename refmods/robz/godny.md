# refmods/robz/godny: the godny implementation of RobZ 1.30.10. live candidate for "a mod a player keeps"
Local folder `mods/robz realism mod 1.30.10 godny implementation` (4.3 GB), Workshop 3449886519 has the same files. User maintains it, per a Claude memory note from their mod-folder sessions [I]; Workshop authorship unconfirmed.
Read only here. Every test ran from an overlay or a copy, the folder itself was not changed.

## what it adds to plain RobZ
- `script/multiplayer/bot.lua`, 3173 lines: a rewritten skirmish bot. prints `[robz bot N] [mm:ss] ...` to game.log and writes `robz_bot_<player>.log`
- `bot.data.lua`: `BotGuide[army]` weights + must-haves for usa, eng, ger2, jap, rus, rus_guard. ger, ger_ss, axis_minor have none by design
- about 245 map intel files in `script/multiplayer/maps/`, per map: playable bounds, buildings, flag values
- `robzbot.dll`: x86, sha256 07fd1c31..., imports only kernel32 + msvcrt, source `robzbot.c` beside it, builder unproven. calls mowas_2.exe 3.262.1 at fixed addresses per its notes. `UseRobzDll=false` turns it off

## as64 result, sha bad628c1, 2026-11-04 [V]
5-minute match per army on `multi/1v1_gazala:battle_zones`, bot in slot 2, host idle. Test overlay only points the bot's log path at the instance. DLL refuses to load on x64 as expected ("not a valid Win32 application") and the bot falls back.
| army | buys | kinds | listed units | not found | flags at 4:30 |
|---|---|---|---|---|---|
| usa | 9 | 6 | 38 | 1 | 1 |
| rus | 10 | 10 | 46 | 6 | 1 |
| jap | 12 | 8 | 69 | 2 | 2 |
| eng | 9 | 6 | 40 | 5 | 1 |
| ger | 14 | 7 | 32 | 6 | 1 |
| axis_minor | 13 | 8 | 54 | 0 | 2 |
| rus_guard | 12 | 8 | 35 | 0 | 1 |
| ger2 | 8 | 5 | 28 | 0 | 1 |
| ger_ss | 10 | 8 | 37 | 13 | 2 |
All 9: verdict pass, 0 exceptions, 0 script errors, attacks launched. Nobody opposed the bot, so this proves it runs, buys and moves, not that it plays well.
- not found = names absent for that army/year. rus must-haves `riflemans_41(rus)`, `riflemans_42(rus)` never arrive (3 skipped); bot code treats this as a period gap, likely by design [I]
- control: plain RobZ usa had 0 bot lines and 3 buys, in a different run, so no clean comparison

## bug 1: map name read wrong on as64, map intel loaded for the wrong map [V]
`MapFromLog` (bot.lua:533) looks for `Loading map '...'`, which as64 never logs, then takes the LAST `map/multi/<name>` in game.log. as64 logs `Mission '/map/multi/test/test.mi' is skipped` for every map at startup, so the name is always `test`. Result: `map intel: test, playable 200 x 200 m` and `unknown map ... using map-free tactics`.
Fix, one line after the `Loading map` loop, from the hosted mission line:
```lua
if not last then for m in string.gmatch(txt, 'Starting "([^":]+)') do last = m end end
```
Before and after, same seeds, one match each, usa/rus/ger/eng/jap: `map: 1v1_gazala (battle_zones, found by game log)` on all 5, buys unchanged, flags at 4:30 went 1,1,1,1,2 → 2,1,3,4,3. Small sample, unopposed.

## release mowas_2 result, sha 3bc95673, 2026-11-04 [V]
Test copy with `UseRobzDll=false` (no DLL ran), Skirmish in Local mode, same map and mode, bot in slot 2, host idle. uidrive route `boot,lobby_gazala,bot_start`, replayed from a cold boot.
| run | army | map fix | map line | bought at 4:30 | flags at 4:30 | exceptions |
|---|---|---|---|---|---|---|
| 1 | ger | no | `unknown map (log says 'test')`, intel 200 x 200 m | 14 | 1 | 0 |
| 2 | ger | yes | `1v1_gazala (battle_zones, found by game log)`, 327 x 875 m | 14 | 2 | 0 |
| 3 | rus | yes | same as run 2, `faction guide: 45 unit weights, 3 must-haves` | 10 | 1 | 0 |
Bug 1 hits release too: there the `test` line comes at lobby time, and `Starting "multi/...` is logged, so the same one line fixes both exes. One match each, unopposed. Other 7 armies not run on release. The DLL path has never run in these tests, so nothing here says what the DLL adds or breaks.

## bug 3: rus buys nothing for the first 2:35 [V]
`Commands:Spawn` returns true with no log line when a card exists but isn't on sale (hidden, unavailable, not for sale: , before the `DBG: SpawnUnit` print). `SpawnVerdict` (bot.lua:2826) only treats silence as missing after `S.logWorks`, which only a `SpawnUnit` line sets. rus has the only opening must-have with `after = 0`, so its first orders are `riflemansv4` + `riflemansv5`, both silent: each waits `ArrivalTimeout` 75 s, then `riflemans(rus)` buys at 2:35. Seen as 0 bought at 2:00 on 1v1_nikolaev and 2v2_bastogne while the opposing bot had 11. The `arrived riflemansv5 after 75s` line is a false match on the riflemans arrival [I].
Fix: the `Not found` branch sets it too, since that line also proves the log reads. `then S.logWorks = true; return "missing" end`. Same behaviour the bot already has after its first buy.
Result, 300 s as64: nikolaev, gazala, bastogne rus all order `riflemans(rus)` at 0:05, 0 "never arrived"; nikolaev bought 11, flags 3/8 (was 11, 2/8). Release mowas_2 from a patch folder, nikolaev rus: same order at 0:05, bought 7 at 2:30, flags 2/8. Possible weakness [I]: silence on the cooldown line starts the existing 30-min skip (`S.cool` 1800), now from the first order.

## maps + opposed matches, stopped early 2026-11-04 by user: long tests too slow
`node refmods/robz/mapfix-build.js --game <install> --out <install>/mods/<folder>` makes the patch: both fixes, full copy of bot.lua, `bot.lua 9bafb07a4b9b -> 92580cd245ae`. Load it after the set. Undo: remove the folder from the mod list. Not installed anywhere.
All runs below: 0 exceptions, 0 bot errors, host idle beside the team-a bot.
| exe | map | fixes | armies a/b | held | bought/lost a | bought/lost b | flags a/b | end |
|---|---|---|---|---|---|---|---|---|
| as64 | 2v2_bastogne | map | rus/ger | 35:35 | 90/137 | 127/177 | 2/7 of 11 | `over`, ger won |
| as64 | 2v2_karelia | map | usa/ger | 35:00 | 78/110 | 126/178 | 1/3 of 7 | stopped |
| as64 | 2v2_junction | map | eng/jap | 35:00 | 104/156 | 131/188 | 2/2 of 7 | stopped |
| as64 | 2v2_bastogne | both | rus/ger | 34:30 | 93/142 | 126/173 | 3/6 of 11 | killed, no `over` |
| mowas_2 | 2v2_bastogne_remix, 2nd match in launch | both | usa/ger | 24:30 | 48/63 | 80/106 | 4/2 of 10 | killed, no `over` |
Second match read the new map (`2v2_bastogne_remix`, 563 x 484 m), so the name doesn't go stale. Release has not reached `over`, so step 8's pass isn't met there. Team-a bot bought less in all 5: idle host may share its income [I], not proven as an army gap.
To finish, only if wanted: one release match held to `over`, about 40 min.

## bug 2: log folder hardcoded (bot.lua:58)
`OpenLog` uses `...\my games\men of war - assault squad 2\log\`. Fine for a player on the normal profile. On `-instance N` the bot reads the wrong game.log and writes its log into the normal profile. Testing only; test runs must overlay it. One of my runs left `robz_bot_2.log` in the real log folder this way, moved to the holding folder.

## install + undo on as64
Enable: `node tools/modswitch/modswitch.js --game <install> --set "robz realism mod 1.30.10 godny implementation" --write`. Undo: `--restore --write`. Close the game first. Nothing else changes. On release mowas_2 the same command loads `robzbot.dll`, since the set ships `UseRobzDll=true`; my runs used a copy with it off. The map fix is not installed anywhere yet; it needs a user decision on who carries it.
