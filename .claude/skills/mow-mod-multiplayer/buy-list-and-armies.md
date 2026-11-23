# mow-mod-multiplayer: which units and armies a mode offers

when: "unit missing in multiplayer", "unit shows in skirmish but not online", "only early war units", "era filter", "add my army to a game mode", "army not in the lobby", "unit is free in this mode", "unit shows twice".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Making or editing the card itself → skill `mow-mod-units` (`buy-menu-cards.md`, `new-army.md`).

## Steps
1. what an army can buy and for how much: MCP `mow_army {army:"<army>", mod:"<mod>"}` (filters: `class`, `period`, `max_price`, `search`)
2. one unit's card: MCP `mow_unit_find {q:"<name>", mod:"<mod>"}`, then `mow_unit_stats {id:"<id>", mod:"<mod>"}` (tags, button, cost, cp, level)
3. the mode's unit file and unit set: MCP `mow_mode_info {mode:"<mode>", mod:"<mod>"}`
4. lint: MCP `mow_mission_lint {mod:"<mod>"}` · CLI `node tools/milint/milint.js --help`
5. field list: MCP `mow_lookup {query:"mission/mp-units", mode:"topic"}`

## Facts
- units load per game: `units/<game name>.set`, else `units/<class>.set`, else `units/common.set`; then the preset's `apply` blocks
- a unit is offered when: its tags pass the preset `unitset`, it carries the player's ARMY tag, and a budget lists its `button`
- blocks with the same unit name MERGE (tags add up); a preset `apply "remove" ..` takes units out
- card fields that are rules: `charge` (cooldown s), `fore` (start progress, may be negative), `group` (shared cooldown), `icon` (same non-zero icon in a group = a sequence, one shown at a time), `button`, `cost`, `cp`, `score`, `cw` (capture weight), `level` (rank needed)
- armies: `set/multiplayer/armies`; a mode's `teamSettings` names which armies each team or alliance may pick
- era choices are `unitMode` values of the presets; a unit joins an era through its tags

## Per game
- as64 / mowas2: as above
- goh: the buy bar also filters by the card's `doctrine` and `conditions` (GHGPL-05); the army list of a unit mode holds only armies with a doctrine in it (GHGPL-09) → `doctrines.md` in this skill

## Silently fails
- a unit without the army tag, or failing the `unitset`, is simply absent: no message
- MIS-03 an exclude-only unit set offers nothing
- a `button` no budget lists makes the unit free; a `button` with no panel category hides it (→ skill `mow-mod-text-ui`)
- same-name merge: a mod's block ADDS tags to the stock unit; it can not remove one that way
- MIS-07 a negative army id (milint MIS_ARMY_ID_NEGATIVE)
- an alliance naming an army that `set/multiplayer/armies` lacks
- MIS-15 `level` ignored where rank restrictions are off
- two mods shipping the same units file: the later one wins whole (→ skill `mow-mod-together`)

## Verify
- `mow_army` lists the unit with the intended price; in the lobby pick the mode, era and army: the unit is on its button, costs and cools down as set; log read (→ skill `mow-mod-test`)
