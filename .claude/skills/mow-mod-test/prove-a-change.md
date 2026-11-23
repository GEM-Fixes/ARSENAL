# mow-mod-test: exercise and prove the change in the match

when: the game runs with the mod and the question is "does the changed thing really work": the unit can be bought, the gun fires, the armour stops the shell, the text shows.
G = AS2 install, `<mod>` = mod folder. The run tools are launch kind (user's yes, `ARSENAL_ALLOW_LAUNCH=1`); every one has a dry or plan form.

## Steps
1. exercise by hand or by route: buy or spawn the changed unit, move it, fire, take hits; read names and pictures. picture: MCP `mow_game_shot {}` (saved in the scratch folder; `box`, `scale` to read small HUD text)
2. prove a unit by log markers (as64): `node tools/prove/prove.js --game G --army a (--unit card [--kind vehicle|human] [--target def]) [--tiny] [--mods a,b] [--map multi/m:mode] --plan` first, then without `--plan`
   it buys the card through a bot, waits for the spawn line, optionally fights a target
3. unit against unit by class group, one process, no clicks, no MP (as64 editor exe):
   `node tools/edrun/edrun.js --game G --root <dir> --exe as64_ed.exe --pairs pairs.json [--mods as64+,x] [--secs 240] [--speed very_fast] [--fog 0|1] --dry` first; pairs: `node tools/testplan/testplan.js pairs suggest <mod>`
4. a scripted scene: `node tools/testrun/testrun.js --scenario f.json [--param k=v]`
5. numbers to expect, to compare with what was seen: MCP `mow_matchup {attacker, target, range}` · `mow_unit_stats {id, mod:"<mod>"}` (never the proof itself)
6. take results back into the plan: `node tools/testplan/testplan.js read <mod>`, `mark`
- GUI: Share tab > `test`, `testplan`; Game Modes & AI > `bots` Match setup (bot match)

## Facts
- a spawn must be read from the log line, never from a return value (MIS-46)
- vehicle kill marks: `{state dead}` never fits a vehicle (MIS-42); `not moveable` is also true after non-lethal hits (MIS-54); use `destroyed_components` with mask `body`, or crew state; soft trucks need another mark (MIS-59)

## Per game
- as64: all of it. mowas2: prove / testrun `--dry` / `--plan` only, edrun `--dry` only; real runs by menu routes. goh: by menu routes or the user; no test game from the editor

## Silently fails
- LOG-05 runtime warnings carry no unit name: match the log time to what was done
- MIS-44 an empty placed vehicle is not shot at: use a bought, crewed enemy
- TST-14 friendly fire is on: own losses add to the enemy score
- TST-08 direct-control aim: a click before the ring forms does nothing
- NET-23 a stock 2v2 on `:combat` has no flags: bots give no orders, 0 fire in 305 s; `:battle_zones` works
- TST-103 / TST-110 a light car hit by AP may only lose `fuel` and live: not a kill

## Verify
- per changed thing: one observation in a live match + the log line that goes with it. What was only computed stays [T]
