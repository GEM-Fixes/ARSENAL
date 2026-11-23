# mow-play-setup: start or steer the game from a tool
When: the user asks Claude to start the game, a match, or to press through the menu. Launch kind: each call needs env `ARSENAL_ALLOW_LAUNCH=1` and the user's yes; `dry: true` needs neither.

## AS64 (control pipe)
1. Plan: `mow_game_start {game: "as64", map: "1v1_gazala", mode: "battle_zones", players: 2, mods: ["as64+", "my_mod"], dry: true}` -> the command line and steps.
2. Start: the same without `dry`; `hold: 120` keeps the match that many seconds, `wait_over: true` runs to the end.
3. Picture of the window: `mow_game_shot {game: "as64"}`; cut and enlarge HUD text: `mow_game_shot {file: "<shot>", frac: "0,0.8,0.3,0.2", scale: 3}`.
CLI: `node tools/testrun/testrun.js --map multi/<map>:<mode> --players n --mods a,b --exe <game>/as64.exe` (a bare map name means `:combat`. TST-24 [V]).

## MoW:AS2 and GoH (no pipe: recorded menu routes)
1. List: `mow_game_routes {game: "goh"}` (read only).
2. Plan: `mow_game_start {game: "goh", routes: ["boot"], dry: true}`.
3. Play routes: `mow_game_drive {game: "goh", action: "play", routes: ["boot"]}`; one key: `mow_game_drive {game: "goh", action: "key", key: "ESCAPE"}`; one click: `action: "click", x, y`.
CLI: `node tools/uidrive/uidrive.js routes`. Map and mode are fixed by the route.

## GUI
Test, Share & Play > Play (`run play`, `dry` first; AS64 only; on GoH the page says why not).

## Rules
- menu input was recorded at 1920x1080; other sizes are scaled, not replayed. TST-31 [I]
- no tool buys units for a human seat; a person buys, or bots do. NET-22 [V]
- stage-changing commands answer before the stage is ready: let the tool wait, do not chain raw commands. TST-21

## What goes wrong
- refused: env not set or the user did not say yes. Give the clicks instead (`start-a-match.md`).
- the game already runs: close it first, or the mod list change is refused.
- a route breaks after a game update moved a menu button: fall back to clicks by the person.

## Check
`mow_game_status` says running; `mow_game_shot` shows the lobby or the match; afterwards `mow_game_log {game}` for the run.
