# mow-games: testing, editors, start flags, bots
When: "can a tool start GoH", "does the editor run my mission", "which flags work".

## Steps
1. May this server start the game: `mow_game_status {game}`.
2. AS64 plan: `mow_game_start {game: "as64", map: "1v1_gazala", mode: "battle_zones", dry: true}`.
3. MoW:AS2 / GoH: `mow_game_routes {game: "goh"}`, then `mow_game_start {game: "goh", routes: ["boot"], dry: true}`.
CLI: `node tools/testrun/testrun.js --help` · `node tools/uidrive/uidrive.js routes`. GUI: Test, Share & Play > Play (AS64 only; the page says why not on the others).

## Facts
| | AS64 | MoW:AS2 | GoH |
|---|---|---|---|
| control pipe | yes | no | no |
| start flags `-console -instance -control -nosound` | yes | ignored | no |
| driven by | pipe commands | recorded menu input | recorded menu input |
| editor runs the mission | yes | yes | no |
| bot script error | logged, game goes on | aborts | - |
| bots | Lua, buy and capture | same | other bot files and rosters |
Rows: TST-17 TST-19, gameprofile `feature.editor_game_runs_mission`, GHED rows, AI-12 [V], GHMIS-66.

## Same in all
An `_ed` editor exe; a mod is proven only by a run and a clean log.

## What goes wrong
- a test passed on AS64 called done for MoW:AS2: the bot script and crash face differ; run it there too.
- recorded routes replayed on another screen size: scaled, not exact (TST-31 [I]).
- launch tools without env `ARSENAL_ALLOW_LAUNCH=1` and the user's yes: refused; `dry: true` still answers.

## Check
`mow_game_start` with `dry` prints the plan for that game; skill `mow-mod-test` for the full loop.
