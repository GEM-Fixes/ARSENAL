# mow-play-trouble: crash on load, when a unit appears, or in a match
When: the game dies while loading a map, at the first spawn of a unit, or mid match.

## Steps
1. `mow_game_crash {game}` -> which part failed, what to check. Then `mow_game_log {game}` for the lines before it.
2. Which mod owns the file the log names: `mow_file_which {game, path: "<file from the log>", mods: [...]}`.
3. Check that mod: `mow_mod_check {game, mod: "<path>"}` (`full: true` for every linter; slow).
4. Match the table; the fix is the mod author's (skill `mow-mod-check-fix`) or "play without that mod".
CLI: `node tools/logtriage/logtriage.js --exe <game>` · `node tools/check/check.js <mod> --exe as64,mowas2,goh` · `node tools/doctor/doctor.js <mod folder> --game <dir> --exe <game>`. GUI: Mods > Check & Fix > Check, Read Game.log.

## What they see -> cause -> row -> games -> check
A = AS64, M = MoW:AS2, H = GoH.
| sees | cause | row | G | check |
|---|---|---|---|---|
| "define not found" | a macro not defined in the file chain (often a missing parent mod) | GPL-11 [V] | A M H | `mow_mod_check` |
| "unexpected token" | bad key or renamed bone | | A M H | `mow_mod_check` |
| `No Stuff found`, crash later | a missing weapon or item is swapped for a dummy; the crash comes when it is used | LOG-07 [V] | A M | logtriage LOG_NO_STUFF |
| "Unknown curve" | a weapon names a ballistics curve that is not there | DMG-29 [V] | A M | `mow_mod_check` |
| crash 15 to 20 s into loading | a model without its material file | PORT-131 | A M | `node tools/refcheck/refcheck.js <gameDir> --mods a,b --exe <game>` |
| "File not found ... .vol" at mission load | a model names a volume file that is missing | PORT-120 | A M | refcheck |
| fatal at first spawn, log names no unit | an effect frame on a texture nobody ships | PORT-139 | A M | refcheck |
| `Unknown control panel item` | a minimap item name is unknown | LOG-09 | A M | logtriage |
| wrong armour sides + ERROR in the log | armour thickness given 3 numbers | DMG-24 [V] | A M | `node tools/statsheet/statsheet.js <gameDir> --exe <game> --mods a,b` |
| bot stands idle, game goes on | a bot script error is only logged on AS64; MoW:AS2 aborts | | A M | `node tools/logtriage/logtriage.js --lua` |
| loaded save lost units | a save loads against the mods on now and does not check them | NET-07 [V] | A M | enable the mods the save was made with |
| "Program will be terminated" | any data ERROR is final | ENG-01 [V] | A M H | the file in the message |

## Per game
- the same fault looks different per exe: MoW:AS2 writes Exception + dump, AS64 and GoH may just close. PORT-49 [V]
- GoH codes (0x0bad000N): `goh-faults.md`.

## What goes wrong
- blaming the last mod enabled when the log names another mod's file.
- a crash only with two mods together: `mow_mods_clash`, then skill `mow-mod-together`.
- no dump and no log line: `bisect-mods.md`.

## Check
Same map, same unit, no crash; `mow_game_log` clean of the fatal line.
