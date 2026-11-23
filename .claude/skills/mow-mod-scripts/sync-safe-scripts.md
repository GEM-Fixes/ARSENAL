# mow-mod-scripts: scripts that stay in sync in multiplayer

when: "my script desyncs", "out of sync after the hit", "can I use rand in multiplayer", "works alone, breaks online", "which script runs on which machine".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Files that differ between players → skill `mow-mod-share` (`multiplayer-same-files.md`).

## Steps
1. find the risky words in the mod: MCP `mow_script_find {name:"rand", scope:"scripts", mod:"<mod>"}`; repeat for `damage_report`, `con`, `tagged`, the handler names the change added
2. are the script files the same for all: MCP `mow_mp_sync {mod:"<mod>"}` → which files the lobby compares by content, by size only, or not at all
3. lint: MCP `mow_script_lint {mod:"<mod>"}`, `mow_mission_lint {mod:"<mod>"}`
4. after an out-of-sync in play: MCP `mow_game_crash {}` reads the report (`log/oos/`)
5. two game instances on one PC for a real test (as64) → skill `mow-mod-multiplayer` (`test-multiplayer.md`)

## Rules
- the game runs the same simulation on every machine from the same orders; nothing is corrected afterwards (NET-04)
- NET-02 one shared random stream: an extra or missing draw on ONE machine shifts every later roll. `{if rand p}` is safe only in handlers that run for the same event on all machines
- unsafe triggers for a draw or a state change: anything that depends on the local player (selection, camera, fog, what is on screen, options, sound finished playing)
- NET-14 the `selected` flag of an actor is in the checksum: scripts must not act on selection
- INT-16 `damage_report` is local display only: fine
- sound and view picks use a local random stream: fine
- interaction files under `/set` are compared by content in the lobby (KEY-24); `.lua` by size only (NET-01)
- mission triggers and bot Lua run on the host only; their effects reach clients as orders

## Per game
- as64 / mowas2: as above; NET-03 at `mp_syncLevel` 1 weapon state, inventory and many brain fields are not hashed, so a divergence shows late
- goh: no periodic sync check (GHNET-69); more state is owned by the host and sent (`spawn_human`, mines, part damage, GHNET-93); `call_synced` exists as an action (GHINT-26). Not yet tried in game

## Silently fails
- a same-size edit of a size-only file passes the lobby and diverges in play (NET-01)
- UI-05 action ids are given in creation order: a different `interface/action` set between players breaks orders though interface files are not compared
- NET-06 a replay re-runs the orders against the current data: any data change makes old replays diverge with no message
- NET-09 `mp_allowDesync` does not keep a diverging game alive
- a divergence can sit hidden until the affected unit moves or fires: test longer than the first minute

## Verify
- two players (or two instances) with identical files play the changed situation several times; no out-of-sync report; then the same in a full match (→ skill `mow-mod-test`)
