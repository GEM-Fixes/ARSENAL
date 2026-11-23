# mow-mod-test: start MoW:AS2 (mowas_2.exe) or Gates of Hell (no control pipe)

when: the test must run on the original game or on GoH. They have no control pipe: the game is started and steered by recorded menu inputs, or by the user. Launch kind: needs `ARSENAL_ALLOW_LAUNCH=1` and the user's yes.
G = AS2 install, H = GoH install.

## Steps
1. the routes that exist (read only, starts nothing): MCP `mow_game_routes {game:"goh"}` / `{game:"mowas2"}`
2. dry: MCP `mow_game_start {game:"goh", routes:["boot"], mods:["<modname>"], dry:true}`
3. start and steer: MCP `mow_game_start {game:"goh", routes:["boot", "<route>"]}`; then single steps: `mow_game_drive {game:"goh", action:"play", routes:["<route>"]}`, `{action:"click", x:960, y:540}`, `{action:"key", key:"escape"}`
   CLI `node tools/uidrive/uidrive.js routes|where|play|shot|click|rclick|key <map> [--game dir] ...` with map `goh` or `mowas2` (each step waits on new game.log lines)
4. where the log is: `node tools/uidrive/uidrive.js where mowas2` / `where goh`
5. look: MCP `mow_game_shot {game:"goh"}` (`box` cuts a part, `scale` enlarges small HUD text)
6. no route for what is needed → the user plays it: give them the checklist (`node tools/testplan/testplan.js checklist <mod> --exe goh`) and read the log after
- GUI: Share tab > `test` / `play` pages on the MoW:AS2 and GoH game tabs (launch routes)

## Facts
- routes were recorded at 1920x1080; other sizes are scaled, not re-recorded (TST-31): a missed click shows as a step that never signals
- a step is confirmed by a log line (`GUI: Activate page X`), not by the screen
- map and mode are fixed by the route, not by arguments

## Per game
| | mowas2 | goh |
|---|---|---|
| mod list | `options.set` with the game closed | `options.set {mods "name:0"}` with the game closed (TST-30) |
| log | same user dir as as64; truncated at start, no prev file | `<Documents>/My Games/Gates of Hell/` or `%LOCALAPPDATA%/digitalmindsoft/gates of hell/` (GHVFS-13, LOG-22); every line starts `[hh:mm:ss] ` (GHLOG-07) |
| instances | none | none |
| editor test game | `mowas_2_ed.exe`: edrun `--dry` only | refused |
| start | by exe | Steam (`steam://rungameid/400750`) |

## Silently fails
- TST-19 `-nosound -console -instance -control` are ignored by mowas_2.exe with no message
- TST-28 `mod_*` and `mp_*` console commands exist only in as64: these two games are testable by boot + log only
- TST-06 keyboard input goes to the window in front; the first click after focus loss only refocuses
- MIS-33 a bot Lua error aborts a mowas2 match (as64 would only idle the bot)
- PORT-46 GoH refuses to activate a mod whose range does not hold the exe version

## Verify
- GoH: log line `Mod: activate mod <x>` (GHLOG-16); mowas2: the mod in `options.set` and its content seen in the menu. A match reached, the changed thing used, log read
