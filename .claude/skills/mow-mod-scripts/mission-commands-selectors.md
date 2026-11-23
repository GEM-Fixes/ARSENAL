# mow-mod-scripts: mission commands, condition terms, selectors, orders

when: "which mission command spawns / moves / kills units", "how do I select the enemy tanks in a zone", "count units in a condition", "actor_state", "units ignore my order", "win when all are dead".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. the words for the game: MCP `mow_mission_words {kind:"commands", q:"<part>"}` (`kind` = commands (default) | terms | statements | fields | trigger | all); each row names the engine line that reads it
2. how stock missions use one: MCP `mow_script_find {name:"actor_to_waypoint", scope:"missions"}`; inside one mission: `mow_mission_triggers {map:"<map>", mode:"<mode>", q:"<command>"}`
3. check the file being edited: MCP `mow_script_check {file:"<full path of .mi>"}`; the whole mod: `mow_mission_lint {mod:"<mod>"}`
   CLI `node tools/milint/milint.js <mod folder> [--game dir] [--exe as64|mowas_2|goh] [-q]`

## Common forms
- selector: `{tag x}{zone "z"}{type vehicle|human}{state inhabited|"not dead"}{player "1"}{amount n}{mids N}`
- count: term `entities {selector ..} {count {op ">"} {value n}}`; distance: term `near {units ..} {near_to ..} {distance m}`; `inventory` term for items
- move: `{"actor_to_waypoint" {selector {..}} {drop orders} {waypoint "21"}}`
- behaviour: `{"actor_state" {selector} {control user} {fire_mode open} {move_mode hold} ..}`
- world: `environment` (weather preset), `entity_state` (tags, inactive), `delete`, `spawn`, `reinforcement`, `event`, `trigger`, `set_i` / term `cmp_i` (integer variables), `music`, `sound`, `con` (print)
- field names are matched case-sensitive; enum values and unit names are not

## Per game
- as64 / mowas2: 68 commands, 6 statements, 21 terms; the tool's list is the truth
- goh: adds commands, terms and fields (for example `actor_state` `veterancy`, GHMIS-19) and drops some; `mow_mission_words {game:"goh"}` names them with their row

## Silently fails
- MIS-36 `near` distance is in METRES (x 20 game units): `distance 60` fires far earlier than expected
- MIS-40 `actor_state` on a selector with only `{player}` also hits entities with no brain: crash; add `{type human}` or a tag
- MIS-43 a destroyed entity leaves every selector: watch the state before it dies
- MIS-42 `{state dead}` fits humans; a killed crewed tank reads `not moveable` / `not operatable`, never dead; MIS-54 `not moveable` is also true after a non-lethal hit; use `destroyed_components` with a part mask (MIS-56 `broken_components` counts destroyed too)
- MIS-53 a component term inside a standard selector is dropped without a log line
- MIS-49 `not inactive` does not drop an inactive entity
- MIS-86 `{mids N}` nobody holds, MIS-87 a waypoint not in Helpers: nothing selected or moved (`Waypoint %s not found`)
- MIS-52 `actor_to_waypoint` on a boarded man (gun crew) is refused
- MIS-51 `spawn` with no `{entity}`: crash or skip; MIS-39 vehicles placed in a `.mi` are empty: board a crew by trigger
- MIS-45 deleting a team's last unit ends the match; MIS-47 `game_speed` has no effect in multiplayer; MIS-41 mission cameras crash in multiplayer [T]
- MIS-38 `{player "n"}` for bots is a side number that is not fixed per lobby slot

## Verify
- lint clean; in game run the trigger with a `con` mark before and after the command; the units do what was ordered; log read (→ skill `mow-mod-test`)
