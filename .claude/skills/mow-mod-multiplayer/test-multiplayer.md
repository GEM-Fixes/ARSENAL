# mow-mod-multiplayer: play a test match

when: "test my game mode", "test multiplayer alone", "bot match to check my rules", "two copies on one PC", "does it desync", "time a match", "check income in a real game".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
The general run-and-read-log loop → skill `mow-mod-test`.

## Steps
1. the mod on: MCP `mow_mods_enable {mods:["<mod>"]}` (game closed; `restore:true` puts the old list back)
2. as64, a hosted match with bots: MCP `mow_game_start {map:"<map>", mode:"<mode>", players:4, mods:["<mod>"], wait_over:true}` (`dry:true` shows the plan; `hold:true` stops in the lobby)
3. state while it runs: MCP `mow_game_status {}`; a picture: `mow_game_shot {}`
4. input when needed: MCP `mow_game_drive {action:"key", key:"<key>"}` / `{action:"click", x:.., y:..}`; route list: `mow_game_routes {}`
5. after: MCP `mow_game_log {}`; on a crash `mow_game_crash {}`
6. the mode's bots first: MCP `mow_mode_bots {mod:"<mod>", mode:"<mode>"}` (→ skill `mow-mod-ai-bots`)
7. CLI: `node tools/testrun/testrun.js --help` · GUI: Test tab (`gui_pages {}` lists the ids)

## Facts → topic, limits TST and NET rows [V]
- as64 only: started with `-control` the game serves a control pipe; commands `mp_lan mp_host mp_maps mp_slots mp_slot mp_set mp_army mp_start mp_state mp_userUnits` set up and read a match (TST-17, TST-28)
- `-instance N` (1..9): a second copy with its own pipe, port, profile and log: host and join on one PC (TST-22)
- test mode (`gameMode "test"`): countdown 0, rank checks off
- `mp_state` gives sides, budgets and scores for assertions; `mp_army <army> <userId>` pins a bot's army in alliance mode (MIS-73)
- a team with no unit for about 30 s loses (TST-26)

## Per game
- as64: all of the above
- mowas2: no control pipe and no `-instance`; flags passed to `mowas_2.exe` are ignored (TST-19): start by hand, host a LAN game with bots, then read the log
- goh: boot and log only by tool (TST-28); a match is hosted by hand; GoH has no checksum desync check (GHNET-69)

## Silently fails
- MIS-61 bots on a 1v1 map: the match ends about 17 s in; use a 4-slot map (`2v2_farmstead` works)
- MIS-65 / NET-23 bots need a flag mode
- MIS-71 a generated map's combat mode answers "no AI here"
- NET-22 no command buys for a HUMAN slot: a person buys, or bots do
- NET-21 `mp_join` to `127.0.0.1` never finds the session: use the adapter address and port
- TST-21 a command sent right after `mp_lan` / `mp_host` errors until the stage is active (about 0.3 s)
- TST-23 pipe replies are slow while loading: time-outs of 30 s or more
- MIS-37 / MIS-66 `mp_set team.<t>.army` can answer ok and change nothing: read `mp_slots` back
- MIS-38 a bot's side number is not fixed per slot: read it at run time
- TST-18 at most 4 pipe clients; an answering pipe means a game is already running
- a one-machine bot match proves rules, not sync: sync needs two machines or two instances

## Verify
- the match reached its end (`wait_over`), the result and numbers match the rule under test, the log has no error or `Desync detected`; say what was not covered (human buying, real network)
