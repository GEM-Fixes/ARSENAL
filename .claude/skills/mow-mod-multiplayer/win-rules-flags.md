# mow-mod-multiplayer: how a mode is won (flags, score, time)

when: "match ends too fast", "match never ends", "flag capture time", "score limit", "change the win condition", "tanks capture faster", "points per kill", "team wins at once", "game ends after 30 seconds".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Placing flags and spawn points on a map → skill `mow-mod-maps-missions`.

## Steps
1. the class and its parameters: MCP `mow_mode_info {mode:"<mode>", mod:"<mod>"}`
2. scripted rules of the map's mode file: MCP `mow_mission_triggers {map:"<map>", mode:"<mode>", where:"multi", mod:"<mod>"}`
3. change a parameter for every map: `parameters "k=v;k=v"` in the mod's `set/multiplayer/games/<mode>.set`; for one map: `<mode>.info` in that map folder (MIS-69)
4. change a unit's weight or score: card fields `cw`, `score` (→ skill `mow-mod-units` `buy-menu-cards.md`)
5. lint: MCP `mow_mission_lint {mod:"<mod>"}` · CLI `node tools/milint/milint.js --help`
6. scripted win or loss in a mission: skill `mow-mod-scripts` (`mission-triggers.md`)

## Facts
- the win rule belongs to the engine CLASS; data only tunes it
- combat: score by kills: the killer's team gets the victim's `score`; a friendly kill or leaving the map subtracts
- captureflag, battle_zones: `flag_capture_time`, `flag_release_time`, `flag_capture_factor`, `freezeTime` (no fighting at the start)
- capture speed of a unit: its `cw` weighted with the zone factor; uncontested, speed is 1 at any weight (MIS-64)
- `gameDuration` (lobby) ends a match on time
- a team with no unit left for about 30 s loses (TST-26 banner)
- measured [V]: stock captureflag ends 400 to 490 s in, about 300 s after the first owner (MIS-72); `flag_capture_time 20` gave a win near 60 s (MIS-63)

## Per game
- as64 / mowas2: as above
- goh: other classes and score rules (Conquest is not a multiplayer class of AS2).; nothing here is run in GoH [I]

## Silently fails
- MIS-63 captureflag has NO score limit: the first settled capture with an owner wins; pace it with `flag_capture_time`
- MIS-64 `cw` can not beat `flag_capture_time`; its effect under contest is not measured [T]
- MIS-62 captureflag on a map without clips `captureflaga` and `captureflagb`: crash at start, `Clipper 'captureflaga' is not found!` (milint MAP_CAPTURE_CLIPS)
- MIS-45 a mission command that deletes a team's last unit ends the match partway; later buys fail
- MIS-61 a 1v1 map with bots ends in about 17 s: the host has no unit
- MIS-71 a generated map's combat mode takes no bots; its captureflag does
- a parameter name the class does not know is skipped (MIS-01)
- MIS-21 a match length outside the fixed list

## Verify
- play one match to the end and time it against the parameter; read the result line and the log (→ skill `mow-mod-test`). on as64 a timed bot match: `test-multiplayer.md` in this skill
