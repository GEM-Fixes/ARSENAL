# mow-mod-multiplayer: a game mode's card

when: "new game mode", "copy a game mode", "change the rules of Assault Zones", "mode does not show in the lobby", "parameters of a mode", "freeze time", "friendly fire default", "mode class".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Putting a mode on a map (the `.mi` side) → skill `mow-mod-maps-missions`.

## Steps
1. read a mode as the game merges it: MCP `mow_mode_info {mode:"<mode>", mod:"<mod>"}` (card keys, presets, budgets, which file each comes from)
2. a new mode on a map from an existing one: MCP `mow_mode_add {map:"<map>", from:"<mode>", to:"<new mode>", mod:"<mod>"}` (plan; `write: true` writes)
3. edit the card: copy `set/multiplayer/games/<mode>.set` from the game into the same path in the mod, change keys there (CRLF)
4. lint: MCP `mow_mission_lint {mod:"<mod>"}` · CLI `node tools/milint/milint.js --help` for the argument line
5. bots for the mode: MCP `mow_mode_bots {mod:"<mod>", mode:"<mode>"}` (→ skill `mow-mod-ai-bots`)
6. GUI: Maps & Missions tab, game modes page (`gui_pages {}` lists the ids)

## Facts
- chain: `set/multiplayer/games/<mode>.set` (`{game ..}`) includes `presets.inc`; units come from `units/<game name>.set`, else `units/<class>.set`, else `units/common.set`
- `class`: the engine rule set. registered: `combat captureflag cooperative frontline battle_zones battle_zones_8x8 armored_warfare combined_arms`; default = the file name
- `order` (lobby list order), `minPlayers`, `maxPlayers`
- `parameters "k=v;k=v"`: per class. combat: `freezeTime`; captureflag and battle_zones: `freezeTime flag_capture_time flag_release_time flag_capture_factor`
- `settings {}`: lobby defaults and widget lists (`fogOfWar`, `friendlyFire`, `gameDuration`, `difficulty` ..)
- `teamSettings {}`: `teamsMode`, `armySelectionMode`, `teams {..}`, `alliances {..}`
- a map folder's `<mode>.info` can set `parameters` and `maxPlayers` for that one mission (MIS-69)
- a mode is a new NAME on an existing class: rules themselves are built into the game; missions add scripted rules on top

## Per game
- as64 / mowas2: as above; `armored_warfare` and `combined_arms` have no stock `.set` [T]
- goh: other class list and card keys; doctrine and research are part of the card flow (→ `doctrines.md` in this skill). `mow_game_diff {game:"goh", other:"as64", key:"feature"}`

## Silently fails
- MIS-01 / GPL-08 unknown or mis-cased keys are skipped: `minplayers` is not `minPlayers`
- MIS-19 a class needs its own `<name>.mi` in each map: `armored_warfare` and `combined_arms` have none in stock maps, so no map is offered (milint MIS_CLASS_NO_MI)
- MIS-62 captureflag on a map without the `captureflaga` / `captureflagb` clips CRASHES at start (milint MAP_CAPTURE_CLIPS)
- MIS-24 a map without a mode file is skipped: log `skipped - game type undefined` (milint MAP_MODE_UNDEFINED)
- MIS-21 `gameDuration` takes only the fixed list values (milint MIS_DURATION)
- MIS-60 a mode cloned from frontline onto a stock map only gets a copy: frontline needs its own map layout
- MIS-65 / NET-23 bots need a flag mode: no flags, no bot play (milint MIS_BOT_NO_FLAGS)
- a mod's `<mode>.set` replaces the whole file: another mod's card for the same mode is lost (→ skill `mow-mod-together`)

## Verify
- `mow_mission_lint` clean; the mode appears in the lobby list with the right name (text key → skill `mow-mod-text-ui`); one match played to its end; log read (→ `test-multiplayer.md` in this skill, or skill `mow-mod-test`)
