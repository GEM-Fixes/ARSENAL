# mow-play-trouble: the game will not start
When: closes at once, error box before the menu, long wait at start.

## Steps
1. `mow_game_status {game}` (build, enabled mods, running).
2. `mow_game_log {game}` / `mow_game_crash {game}`.
3. Every `mod.info` in the mods folder: `mow_mod_info {game}` (no `mod` = all folders with their check) · CLI `node tools/modinfo/modinfo.js --all <mods dir> --exe <game>`.
4. Match the table; one fix; start again.
GUI: Mods > Check & Fix > Read Game.log.

## What they see -> cause -> row -> games -> check
A = AS64, M = MoW:AS2, H = GoH.
| sees | cause | row | G | check |
|---|---|---|---|---|
| closes at once, mods on or off, even in safe mode | a bad `mod.info` (stray quote in Desc) in ANY mod folder or Workshop item: every `mod.info` is read at start | ENG-24 VFS-49 [V] | A M | `node tools/modinfo/modinfo.js --all <mods dir> --exe <game>`; move the bad mod out |
| crash before the menu after enabling a mod | Classic mod with `as64+`, or a new mod without it: "made for X mode: not applied" | ENG-26 VFS-48 [V] | A | `node tools/modswitch/modswitch.js --game <dir> --exe as64` (MOD_MODE); safe mode (no mods), then one mode's mods |
| "Program will be terminated" box | any ERROR in data is final; the log line names the file | ENG-01 [V] | A M H | `mow_game_log` |
| `Resource Error` | a mod replaces `/set/registry.reg` or `dlc.reg` | GHVFS-14 | H | disable the mod |
| "Verify integrity of game files via steam" | a pak entry is unreadable | GHVFS-16 | H | Steam verify |
| long wait, then the menu | Workshop query wait, up to 15 s | ENG-22 [V] | A M | wait; not a fault |
| start-up flags ignored | `-console`, `-instance`, `-nosound` work on `as64.exe` only | TST-19 | M | use AS64 or none |
| exits with no message and no dump | same fault, other face per exe | PORT-49 [V] | A H | `mow_game_log`; crashwatch `-Plan` |
| the list of mods changed by itself | AS64 and MoW:AS2 share one profile and list | LOG-20 [V] | A M | `mow_game_status` for each |

## Safe start
AS2 Steam dialog: "Safe mode (no mods)" (= `-no_mods`, VFS-30). If it starts there, a mod is the cause: `bisect-mods.md`. If it still closes, suspect a bad `mod.info` (read at start even with mods off) or the install (Steam verify).

## Per game
- MoW:AS2 leaves a dump; AS64 may close silently for the same fault.
- GoH: `goh-faults.md` for its codes.

## What goes wrong
- "reinstall the game" advised first: a bad `mod.info` in the Workshop folder survives a reinstall.
- deleting the mod from Options -> MODS with the Delete button removes its files; move the folder instead.

## Check
The game reaches the main menu; `mow_game_log` shows no fatal line.
