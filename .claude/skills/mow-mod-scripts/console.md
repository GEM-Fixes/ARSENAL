# mow-mod-scripts: console commands and variables

when: "how do I open the console", "is there a command for X", "dbg_ variables", "-console", "launch options", "cheats", "set a console variable from my mod".
G = game install. MCP `game` = `as64|mowas2|goh`.

## Steps
1. find a command or variable and whether this game can run it: MCP `mow_console_find {q:"mp_"}` (words such as `reload`, `dbg_health`) → rows with id and [V]/[I]/[T]
   CLI · one row
2. as64, from a tool: the game is started with its control pipe by MCP `mow_game_start {map:"<map>", mode:"combat", mods:[..], dry:true}` (plan; needs launch permission to run) → skill `mow-mod-test` (`start-as64.md`) for sending commands and reading replies
3. as64, by hand: start with `-console`; the key left of `1` opens it
4. mowas2 / goh: no pipe; menus are driven by recorded routes: MCP `mow_game_routes {}` (read only)
5. a mission can print: `{"con" {text "x"}}`; an interaction script: `{con "x"}`; both land in game.log

## Facts [V unless tagged]
- about 22 registered commands (`q`, `exec "file"`, `mp_game_over`, `mp_userUnits` ..) and about 413 variables, prefixes `v_ r_ dbg_ tcp_ g_ mp_ ui_ ed_ cam_ s_ con_ dev_`
- gameplay variables exist (`g_maximumRicochets`, `g_damageSpeed`, `mp_syncLevel`, `cam_shake` ..) but are process state, not mod data: a mod can not ship them
- debug views: `dbg_piercing`, `dbg_interactionEvent`, `dbg_interactionEventInfo`, `dbg_health`
- no cheat system in the engine
- command line: `-name` switches the engine looks up (`-safe -no_mods -console -replay -record` ..); unknown ones are ignored without a message
- key bindings and player options are profile data, not scripts

## Per game
- as64: console with `-console`; also over the `-control` pipe; extra `mod_*` and `mp_*` commands (TST-28); `-instance N` gives a second game its own pipe, port and profile folder (TST-22)
- mowas2: the retail game opens no console on the key [T] (MIS-12); `-console`, `-control`, `-instance` are not in its exe and are ignored (TST-19 [I])
- goh: own variable set (for example `mp_session_autoready`, GHMIS-106; no `r_dummy_texture_size`, GHFMT-04); no pipe.

## Silently fails
- INT-19 `dbg_*` variables need a console: unreachable in retail mowas2 [T]
- MIS-12 the editor build always has the console; the modern build only with the switch
- a variable changed on one machine in multiplayer reaches the simulation: out of sync (→ `sync-safe-scripts.md` in this skill, or skill `mow-mod-multiplayer`)
- NET-09 `mp_allowDesync` only gates joining, and only when set before the map is chosen
- TST-21 a pipe command that changes the game stage answers ok early: the next one is valid only after the stage is active
- VIS-21 `cam_shake` is 0 by default: shake effects show nothing until it is set
- `exec "file"` reads a file of console lines; a mod can ship the file, not run it

## Verify
- the command's reply (pipe) or its visible effect; the value read back; game.log for the `con` marks (→ skill `mow-mod-test`)
