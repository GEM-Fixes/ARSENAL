# mow-mod-scripts: mission triggers (read, write, why one never fires)

when: "what does this mission do", "add a trigger", "trigger never fires", "map crashes at load after my script", "Unknown thread statement", "Block terminator expected".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Map files, zones, flags, modes → skill `mow-mod-maps-missions`.

## Steps
1. read: MCP `mow_mission_triggers {map:"1v1_argentan", mode:"combat"}` (`where` = multi|single; or `file:"<full path of .mi>"`, or `key:"<game path>"`; `mod` / `mods` add mod data) → each trigger: when it fires, what it does, unknown words marked
   one in full: `{.., trigger:"<name>"}`; users of a command: `{.., q:"spawn"}`
2. put the map's `.mi` into the mod at the same path (`resource/map/multi/<map>/<mode>.mi`); the copy wins over the game's
3. edit `{Helpers {triggers ..}}` (text, CRLF), then one file: MCP `mow_script_check {file:"<full path>"}`
4. lint the mod: MCP `mow_mission_lint {mod:"<mod>", q:"<map or code>"}` · CLI `node tools/milint/milint.js <mod folder> [--game dir] [--exe as64|mowas_2|goh] [--mods a,b] [-q]`
5. what changed: MCP `mow_mission_diff {a:"<older .mi or map folder>", b:"<newer>"}` · CLI `node tools/misdiff/misdiff.js <a> <b> [--summary]`
6. GUI: Maps tab > `missions` page (`missions/diff`)

## Form
```
{"name" {condition {expression "1 & 2 & !3"}
   {terms {"1.event" {id "start"}} {"2.near" {units {..}} {near_to {tag t}} {distance 10}}}}
 {actions {"con" {text "MARK"}} {"delay" {time 2}}}}
```
- trigger keys read: `disabled`, `on`, `autoreset`, `condition`, `actions`
- each term is its own `{"n.kind" ..}` block; the expression uses only digits, `( ) ! & |` and spaces
- statements inside actions: `delay if loop while select switch`
- names used (events, zones, waypoints, vars, tasks) must be defined in the same `Helpers`
- only the host runs triggers in multiplayer

## Per game
- as64: `switch` on builds before the fix runs every case when one is true (MIS-34 [I]): use `if` chains
- mowas2: same forms as as64
- goh: more commands and terms, some fields dropped; triggers run on the host and results are sent to clients (GHCMD-06). `mow_mission_words {game:"goh"}`

## Silently fails
- MIS-48 an empty `{actions}`: fatal at map load (MI_ACTIONS_EMPTY)
- MIS-26 an action that is no command or statement: fatal `Unknown thread statement` (MI_CMD_UNKNOWN); MIS-27 unknown term: fatal (MI_TERM_UNKNOWN)
- MIS-35 a bare `"2.near"` not wrapped as a block: fatal `Block terminator expected!`
- MIS-29 a tab or the words and / or in the expression: the trigger never fires (MI_COND_EXPR)
- MIS-88 `& | !` share one precedence, right to left: `1 & 2 | 3` = `1 & (2 | 3)`; use parentheses
- MIS-85 an event, trigger or var not in Helpers: condition false, command no-op, no log (WARN_MI_EVENT_REF ..)
- MIS-28 / MIS-11 other trigger keys and wrong-case field names are skipped silently (MI_TRIGGER_KEY, MI_KEY_CASE)
- an unknown block directly under `Helpers`: fatal unexpected token

## Verify
- add `{"con" {text "MARK <name>"}}` as the first action, run the map, find the mark in game.log; remove it after (→ skill `mow-mod-test`)
