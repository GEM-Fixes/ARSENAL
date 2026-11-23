# mow-mod-maps-missions: single-player mission + menu entry

when: "make a single-player mission", "skirmish mission of my own", "add a mission to the campaign menu".
G = AS2 install, `<mod>` = mod folder. AS2 games only (as64, mowas2). No MCP tool yet: CLI and GUI.

## Steps
1. templates: `node tools/spmis/spmis.js --list-templates`
2. write a small spec (map, sides, units, win rule), then dry run:
   `node tools/spmis/spmis.js --spec S --out MOD [--game G] [--exe as64|mowas_2] [--dry-run] [--force] [-q]`
   the forms it writes are checked against a model learned from 51 stock missions
3. check a written mission: `node tools/spmis/spmis.js --check MOD --mission N`
4. read it back: MCP `mow_mission_info {map:"<map>", mod:"<mod>"}`; lint: `node tools/milint/milint.js <mod> [--game G] [-q]`
5. GUI: Maps tab > `missions` page, single-player part (routes `missions/sp/preview`, `sp/write`, undo `sp/undo`)
6. play it from the menu (→ skill `mow-mod-test`); as64 can load one by pipe (`sp_mission`

## Facts
- a mission = `.mi` with `{Helpers}` (triggers, zones, waypoints, events) + placed entities; trigger = condition + actions
- placed vehicles are empty: no crew key in any stock mission (MIS-39): board a crew by trigger
- `near` distances are metres (x20 map units, MIS-36); every condition term is its own `{"n.kind" ..}` block (MIS-35)

## Per game
- as64: writes and runs; the mission `switch` runs every case on builds before the fix (MIS-34): avoid exclusive menus built on `switch`
- mowas2: same forms; `--exe mowas_2`; run by menu only (no pipe, TST-19)
- goh: spmis refused; GoH scripts replicate differently in MP (host runs triggers, GHCMD-06); use the GoH editor

## Silently fails
- MIS-48 a trigger with empty `{actions}`: fatal at map load
- MIS-26 / MIS-27 an unknown command or condition term name: fatal `Unknown thread statement` / `Unknown condition term`
- MIS-85 an event, trigger or var not in Helpers: condition false, command no-op, no log
- MIS-87 a waypoint not in Helpers: `actor_to_waypoint` refused, `spawn` skipped
- MIS-40 `actor_state` on a selector with only a player: access violation; add `{type human}`
- MIS-42 `{state dead}` never fits a vehicle: use `not moveable` / `destroyed_components`
- more → skill `mow-mod-scripts` (`mission-triggers.md`, `mission-commands-selectors.md`)

## Verify
- the mission is in the menu, loads, the first trigger fires (a visible effect or a `mark`), win and lose both reachable; game.log read
