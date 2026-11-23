# Reference 11: Mission Files: Commands, Triggers, Multiplayer Setup

This page is the reference for everything a mission needs: the `.mi` mission file with its triggers, conditions and commands, the multiplayer setup files (game modes, presets, budgets, unit lists and armies), the map files a mission points at, and what has to match between players in a multiplayer game. [Chapter 12](12-missions-and-multiplayer-setup.md) explains how missions and multiplayer modes work as a whole, and [chapter 13](13-maps.md) explains maps. Come here when you need the exact facts about one key.

Every entry has the same shape. "Where" says which file and block the key is written in. "Type" says what kind of value it takes. "Values" gives the range or the list the game accepts and the value used when you leave the key out. "Does" says what it does. "Limits" lists what silently fails, crashes, desyncs (makes the players' games drift apart) or is ignored. "Example" shows the pattern used in the game's own data. "See" points to the chapter and related entries.

A few words used throughout:

- A **trigger** is a named rule in the mission: when its condition becomes true, it runs its actions.
- An **action** is a command (such as `spawn` or `delete`) or a statement (such as `delay` or `if`) inside a trigger's `actions` block.
- A **term** is one test inside a condition, such as "this event has been raised" or "these units are near that point".
- A **selector** is a block that picks a set of entities (units, vehicles, objects) on the map, for example "every human with the tag `enemy_mg` inside the zone `village`".
- An **entity** is anything placed on the map: a soldier, a vehicle, a gun, a house, a flag.
- A **waypoint** is a named point on the map, and a **zone** is a named area.
- Field names are case-sensitive. Enumerated values (words such as `open` or `hold`) and unit names are not.
- In mission data, `;` starts a comment. Writing `{#` in front of an item only marks that item as disabled; it is not a comment.

## 1. The mission file at a glance

Used in: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#7-mission-files-mi); [chapter 13, section 7](13-maps.md#7-the-mission-file-for-a-map); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

A `.mi` file is text in the same block format as other game data. Its outer block is `{mission ...}`. The blocks inside it are written in this order when the editor saves a mission, but the game reads them in any order:

```
{mission
	{Entity ...} {Tags ...} {Link ...}
	{Environment "multi/multi_01"}
	{Helpers {waypoints ...} {zones ...} {tasks ...} {reinforcements ...} {triggers ...}}
	{Players {count 18} ...}
	{Fog 1}
	{EntityManager {Enabled}}
}
```

A multiplayer mission sits next to the map files in `map/multi/<map name>/` and is named after its game mode, for example `combat.mi` or `battle_zones.mi`. A single-player mission is usually `0.mi` in `map/single/<campaign>/<mission>/`.

## 2. Mission file blocks

Used in: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#7-mission-files-mi); [chapter 13, section 7](13-maps.md#7-the-mission-file-for-a-map); Part I [Missions and multiplayer modes](p10-missions-and-modes.md) and [Copy and change a map](p09-copy-and-change-a-map.md).

### Entity
Where: `.mi` file, top level of `{mission}`; also the `map` file.
Type: block: `{Entity "<definition>" 0x<uid> ...}`.
Values: a definition name, a hexadecimal unique id (uid), then optional blocks such as `Position`, `xform`, `Extender`, `Player` and `MID`.
Does: Places one entity. In a multiplayer mission these are the spawn points, flags and ambient sound speakers; in a single-player mission they also include the units.
Limits: Entity uids must be unique across the `map` file and every `.mi` file in the same folder; duplicates cause trouble at load. A multiplayer mission places no units, because multiplayer units come from purchases and bots.
Example:
```
{Entity "map_point" 0xc001 {Position 13.5 15055.1} {xform zl -88.18}
  {Extender "map_point" {name a3} {team a} {phase 0} {order 3} {visor SpawnPoint}} {Player 0} {MID 15}}
```
<!-- goh: GHMAP-26 GHMIS-24 -->
Gates of Hell: entity uids are 32-bit there. A map or mission from that game with a uid longer than four hex digits probably does not load here, so renumber its entities when you port it.
See: [chapter 13, section 7](13-maps.md#7-the-mission-file-for-a-map); `map_point` keys in [section 15](#15-map-files); [MID](#mid); [Tags](#tags); [Link](#link).

### MID
Where: inside an `{Entity}` block.
Type: number (a 16-bit mission id).
Values: 1 to 65535; written only when not zero.
Does: Gives the entity a number that a selector can name with `{mids N}`.
Limits: A selector that names a `mids` number no entity holds gathers nothing, and commands on it do nothing without any log line.
Example:
```
{Entity "flag_point_1" 0x802f {Position -221.82 9844.37} ... {Player 0} {MID 2}}
```
See: [mids](#mids) in section 8; [Entity](#entity).

### Player
Where: inside an `{Entity}` block.
Type: number (side).
Values: 0 is the neutral side; other numbers are the sides set up in `Players`.
Does: Says which side owns the entity. Flags and spawn points start with `{Player 0}`, neutral until captured.
Limits: None known beyond the numbering rule under `player` in section 8.
Example:
```
{Player 0} {MID 15}
```
See: [Players](#players); [player (selector field)](#player-selector-field).

### Tags
Where: `.mi` file and `map` file, top level.
Type: block: `{Tags "<tag>" <uid>}`.
Values: a tag word and the uid of an entity in the same file set.
Does: Gives an entity a tag that selectors can find with `{tag ...}`. Tags are resolved after all entities have been read.
Limits: A tag on a uid that does not exist does nothing.
Example:
```
{Tags "day" 0xc010}
{Tags "rain" 0xc011}
```
See: [tag](#tag) (selector field); [entity_state](#entity_state) (adds and removes tags while the mission runs).

### Link
Where: `.mi` file and `map` file, top level.
Type: block: `{Link <uid> {<host uid> "<place>"}}`.
Values: the uid of the entity to attach, then a block with the uid of the host and the name of the seat or place.
Does: Puts one entity into another, for example a crew member into a vehicle seat.
Limits: None known.
Example:
```
{Link 0xc025 {0x80d6 "driver"}}
{Link 0xc04c {0x80d6 "gunner"}}
```
See: [LinkTrailer](#linktrailer); [board](#board); [linker](#linker).

### LinkTrailer
Where: `.mi` file and `map` file, top level.
Type: block: `{LinkTrailer a b}`.
Values: two entity uids.
Does: Hooks a trailer or towed gun to its tractor.
Limits: None known.
Example:
```
{LinkTrailer 0x8063 0x8061}
```
See: [Link](#link); [linker](#linker).

### Environment
Where: `.mi` file, top level.
Type: text (the name of an environment preset under `set/environment/`).
Values: a preset name such as `multi/multi_01`.
Does: Chooses the lighting, sky and weather preset the mission starts with.
Limits: A multiplayer mission that wants random weather does it with a trigger (`switch` on `rand`) that runs `environment` and deletes the day, night or rain sound speakers by tag.
Example:
```
{Environment "multi/multi_01"}
```
See: [environment](#environment-1) (command).

### Azimuth
Where: `.mi` file, top level.
Type: number.
Values: not listed by the sources.
Does: Sets the direction of the sun.
Limits: No vanilla mission writes this block, so the example only shows the form.
Example:
```
{Azimuth 135}
```
See: [Environment](#environment).

### MapOrientation
Where: `.mi` file, top level.
Type: number.
Values: not listed by the sources.
Does: Rotates the minimap.
Limits: No vanilla mission writes this block, so the example only shows the form.
Example:
```
{MapOrientation 0}
```
See: [chapter 13](13-maps.md).

### Helpers
Where: `.mi` file, top level; the `map` file may hold a Helpers block with `edifice` entries only.
Type: block.
Values: the sub-blocks `waypoints`, `zones`, `zone`, `triggers`, `events`, `event`, `edifices`, `cameras`, `tasks`, `reinforcements`, `vars`, `functions`, `mission_options` and `modifiers`.
Does: Holds the mission logic: points, areas, objectives, reinforcement cards, variables and triggers.
Limits: Any other sub-block name is a fatal error at load: the game stops with `unexpected token`. Empty sub-blocks are dropped when the editor saves.
Example:
```
{Helpers
	{reinforcements {scoreTotal 0} {scoreCurrent 0}}
	{triggers {"environment" ...} {"music" ...}}
}
```
See: [section 9](#9-helpers-blocks).

### Players
Where: `.mi` file, top level.
Type: block: `{Players {count N} {user n} {alias n "name"} {diplomacy ...}}`.
Values: `count` is the number of sides (current files use 18, older ones 17; side 0 is neutral). `user` is the local player's side. `diplomacy` is a count by count table of whole numbers, row against column: 0 neutral, 1 enemy, 2 ally. A side is always its own ally. When `diplomacy` is absent every side is the enemy of every other side.
Does: Sets up the sides and who fights whom.
Limits: The diplomacy table is written only when it differs from the default.
Example:
```
{Players {count 18} {alias 1 "player"} {alias 2 "enemy"}}
```
See: `player` (command); [chapter 12](12-missions-and-multiplayer-setup.md).

### Fog
Where: `.mi` file, top level.
Type: number (switch).
Values: 1 turns fog of war on.
Does: Switches fog of war for the mission.
Limits: None known.
Example:
```
{Fog 1}
```
<!-- goh: GHMIS-06 -->
Gates of Hell: a mission started without a fog choice keeps this setting of the mission.
See: [fog_mode](#fog_mode); [fog_in_zone](#fog_in_zone); [fogOfWar](#fogofwar).

### EntityManager
Where: `.mi` file, top level.
Type: block: `{EntityManager {Enabled} {CountScale "x0.5"}}`.
Values: `Enabled` switch; `CountScale` a scale written as `x` and a number.
Does: Turns on the dynamic entity budget for the mission.
Limits: None known.
Example:
```
{EntityManager {Enabled}}
```
See: [entity_manager](#entity_manager) (command).

### ClipForAll
Where: `.mi` file, top level; written in saved games.
Type: text (clip name).
Values: a clip name from the map's `Clips` block.
Does: Remembers which map clip area is in force, so a saved game restores it.
Limits: You do not write this yourself; `set_clip` changes the clip while a mission runs. The exact form of the value is not described (unconfirmed).
Example:
```
{ClipForAll "start"}
```
See: [set_clip](#set_clip); [Clips](#clips) in [section 15](#15-map-files).

## 3. Triggers

Used in: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#triggers); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

A trigger is written inside `{Helpers {triggers ...}}`:

```
{"reinforcements:player/start"
	{condition {terms {"1.event" {id "start"}}}}
	{actions {"delay" {time 12}} {"autoassign" {selector {tag player_start}}}}
}
```

Triggers are checked every 0.25 seconds. A trigger without `autoreset` switches on and runs its actions once, the first time its condition is true. Nothing runs while the trigger is disabled or once the game is over. When the mission begins, every entity tagged `hidden` is made inactive.

### disabled
Where: inside a trigger block.
Type: switch (no value).
Values: present or absent; absent means enabled.
Does: The trigger is never checked until the `trigger` command switches it on.
Limits: None known.
Example:
```
{"wave_2" {disabled} {condition ...} {actions ...}}
```
See: [trigger (command)](#trigger-command).

### on
Where: inside a trigger block.
Type: switch.
Values: present or absent; absent means off.
Does: Marks the trigger as already switched on. The game writes this in saves; a trigger that is on and has no `autoreset` does not run again.
Limits: None known.
Example:
```
{"intro" {on} {condition ...} {actions ...}}
```
See: [trigger (term)](#trigger-term).

### autoreset
Where: inside a trigger block.
Type: switch.
Values: present or absent; absent means the trigger runs once.
Does: The trigger's on state follows its condition: it switches on and runs its actions when the condition becomes true, and switches off again, resetting its terms, when the condition becomes false. This lets it fire again and again.
Limits: None known.
Example:
```
{"music" {autoreset} {condition {terms {"1.event" {id "music_reset"}}}} {actions ...}}
```
See: [condition](#condition).

### condition
Where: inside a trigger block, and inline inside `if`, `while` and `case`.
Type: block.
Values: `type`, `expression` and `terms` (section 4). An empty condition is true.
Does: Decides when the trigger fires.
Limits: Any key other than the five trigger keys (`disabled`, `on`, `autoreset`, `condition`, `actions`) is skipped without a message, so a misspelt key silently does nothing.
Example:
```
{condition {terms {"1.event" {id "player_infantry"}}}}
```
See: [section 4](#4-conditions).

### actions
Where: inside a trigger block.
Type: block of commands and statements, run in order.
Values: any command from section 6 and any statement from section 5.
Does: The work the trigger does when it fires.
Limits: An empty `{actions}` block is fatal at map load. An unknown command or statement name logs `Unknown thread statement "<name>"` and is fatal at map load.
Example:
```
{actions {"delay" {time 10}} {"event" {event "player_infantry"} {mode reset} {delay 0}}}
```
See: [section 5](#5-statements) and [section 6](#6-commands).

## 4. Conditions

Used in: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#conditions); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

### type
Where: inside a trigger's `condition` block, or inline inside `if`, `while` and `case`.
Type: word.
Values: in a trigger's condition, `1` means "any term is true"; absent means "all terms are true". Inline, the word is the name of a term (section 7), and the term's own fields follow in the same block.
Does: Picks how the terms combine, or which single term an inline condition tests.
Limits: None known.
Example:
```
{"if" {condition {type difficulty} {level easy}} {"delete" {selector {tag easy}}}}
{condition {type rand} {value 0.1}}
```
See: [expression](#expression); [terms](#terms). In vanilla missions the inline forms used are, most often first: [rand](#rand), [difficulty](#difficulty), [cmp_i](#cmp_i), [entities](#entities), [event](#event-term), [see_actors](#see_actors), [mission_option](#mission_option), [inventory](#inventory-term), [see_enemy](#see_enemy), [task](#task-term) and [near](#near).

### expression
Where: inside a trigger's `condition` block.
Type: text.
Values: term numbers, the characters `( ) ! & |` and spaces.
Does: Combines the numbered terms with your own logic: `&` and, `|` or, `!` not.
Limits: Any other character, or a number with no term, gives an error and the trigger never fires.
Example:
```
{condition {expression "(1 | 2 | 3) & !4"} {terms {"1.event" {id "a"}} ...}}
```
<!-- goh: GHMIS-34 -->
Gates of Hell: the words `and` and `or` are also accepted beside `&` and `|`, with a fault that reads some other words as `and`. This game does not accept the words, so write `&` and `|` in a mission meant for both.
See: [terms](#terms); [type](#type); [chapter 12, section 7](12-missions-and-multiplayer-setup.md#conditions).

### terms
Where: inside a trigger's `condition` block.
Type: block of term blocks.
Values: each term is its own block named `"<number>.<term kind>"`, for example `"2.near"`, holding that term's fields.
Does: Lists the tests the condition is built from.
Limits: A bare `"2.near"` without its own braces is fatal: `Block terminator expected!`. An unknown term kind logs `Unknown condition term "<name>"`.
Example:
```
{terms
	{"1.event" {id "start"}}
	{"2.cmp_i" {var "player_score$"} {op ">="} {value 3}}
}
```
See: [section 7](#7-condition-terms).

### mode (term)
Where: inside any term block.
Type: word.
Values: `work` (default), `off` or `on`.
Does: `work` evaluates the term normally; `off` makes it always false; `on` makes it always true. This is handy for switching a test off while you debug.
Limits: None known.
Example:
```
{"3.near" {mode off} {units {tag tank}} {near_to {tag bridge}} {distance 30}}
```
See: [terms](#terms).

## 5. Statements

Used in: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#statements-and-commands); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

Statements control the flow of a trigger's actions. Each one is written as a named block inside `actions`, or inside another statement.

### delay
Where: in `actions` or inside a statement.
Type: block: `{"delay" {time <seconds>}}`.
Values: `time` in seconds.
Does: Waits before the next action runs.
Limits: None known.
Example:
```
{"delay" {time 0.1}}
```
See: [wait](#wait).

### if
Where: in `actions` or inside a statement.
Type: block with an inline `condition`, followed by actions.
Values: the condition is written inline: `{condition {type <term>} <term fields>}`.
Does: Runs the actions inside it only when the condition is true.
Limits: The same unknown-name rules as `actions` apply to the actions inside.
Example:
```
{"if" {condition {type difficulty} {level normal}}
	{"delete" {selector {amount 1} {tag enemy_mg_stand}}}
}
```
See: [switch](#switch); [while](#while).

### while
Where: in `actions` or inside a statement.
Type: block with an inline `condition`, followed by actions.
Values: inline condition as in `if`.
Does: Repeats the actions inside it for as long as the condition is true.
Limits: Put a `delay` inside the loop, as the vanilla missions do, so the loop does not run its actions back to back.
Example:
```
{"while" {condition {type entities} {selector {tag convoy}}}
	{"delay" {time 1}}
	{"effect" {selector {tag convoy_smoke}} {effect "start"}}
}
```
See: [loop](#loop).

### loop
Where: in `actions` or inside a statement.
Type: block: `{"loop" <count> ...actions}`.
Values: a bare whole number after the name, the number of times to repeat.
Does: Runs the actions inside it the given number of times.
Limits: None known.
Example:
```
{"loop" 5
	{"delay" {time 0.1}}
	{"waypoint" {who {type actor} {actors {amount 1} {tag wave}}} {action {type start} {waypoint "12"}}}
}
```
See: [while](#while).

### select
Where: in `actions` or inside a statement.
Type: block holding a selector.
Values: selector fields (section 8).
Does: Sets the selector as the current target of the running list of actions.
Limits: No vanilla mission uses it, so how each command treats that target is not described (unconfirmed).
Example:
```
{"select" {tag patrol}}
```
See: [section 8](#8-selectors).

### switch
Where: in `actions` or inside a statement.
Type: block of `case` blocks and at most one `default` block.
Values: `case` and `default` only.
Does: Tests each `case` in order and runs the first one whose condition is true; if none is true, runs `default`.
Limits: Only one `default` is kept.
Example:
```
{"switch"
	{"case" {condition {type rand} {value 0.5}} {"environment" {name "multi/multi_01"}}}
	{"default" {"environment" {name "multi/multi_02"}}}
}
```
See: [case](#case); [default](#default).

### case
Where: inside `switch`.
Type: block with an inline `condition`, followed by actions.
Values: inline condition as in `if`.
Does: One branch of a `switch`.
Limits: A case with no condition is never chosen.
Example:
```
{"case" {condition {type event} {id "final_clip"}} {"waypoint" ...}}
```
See: [switch](#switch).

### default
Where: inside `switch`.
Type: block of actions.
Values: actions only.
Does: The branch run when no `case` matched.
Limits: A second `default` in the same switch is merged into the first.
Example:
```
{"default" {"delay" {time 1}} {"waypoint" ...}}
```
See: [switch](#switch).

## 6. Commands

Used in: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#statements-and-commands); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

Many commands that act on entities take two common fields:

- `selector`: which entities the command acts on (section 8).
- `drop`: what the command cancels on those entities first: `orders`, `sensor` or `senseless`.

Commands marked "No vanilla mission uses this command" are real commands of the game, but the examples for them follow their field names rather than an existing mission.

### ables
Where: mission actions.
Type: block.
Values: `selector`; `add` and `remove`, each a list of ability names such as `emit_passangers_on_enemy`, `emit_on_attack`, `select`, `talk`, `repaired` and `personage`.
Does: Gives abilities to the selected entities or takes them away, for example whether the player can select a unit.
Limits: None known.
Example:
```
{"ables" {selector {tag ambush_truck} {type vehicle}} {add emit_on_attack emit_passangers_on_enemy}}
{"ables" {selector {tag hero}} {remove select}}
```
See: [entity_state](#entity_state).

### achievement
Where: mission actions.
Type: block.
Values: `name` (an achievement name), `nation` (`usa`, `ger`, `eng`, `rus` or `jap`).
Does: Awards a Steam achievement for the given campaign nation.
Limits: None known.
Example:
```
{"achievement" {name skirmish_01_usa_easy} {nation usa}}
```
See: [chapter 12](12-missions-and-multiplayer-setup.md).

### action
Where: mission actions.
Type: block.
Values: `selector`, `drop`; `action` one of `move`, `attack`, `rotate`, `repair`, `pour_out`; `target` (a selector); `waypoint`; `volume`.
Does: Orders the selected units to perform one action on a target or at a waypoint.
Limits: None known.
Example:
```
{"action" {selector {tag gunners} {zone "village"} {type human}} {action attack}
	{target {amount 1} {tag bunker} {zone "village"}}}
```
See: [actor_fire](#actor_fire); [actor_to_waypoint](#actor_to_waypoint).

### actor_component
Where: mission actions.
Type: block.
Values: `selector`; `component` one of `trackleft`, `gun`, `trackright`, `body`, `turret`; `state` `broken` or `work`.
Does: Breaks or repairs one part of the selected vehicles.
Limits: None known.
Example:
```
{"actor_component" {selector {tag wreck}} {component trackleft} {state broken}}
```
See: [effect](#effect).

### actor_fire
Where: mission actions.
Type: block.
Values: `selector`, `drop`; `attack` `enemies` or `position`; `enemies` (a selector); `burst_mode` `smart`, `once`, `short` or `long`; `place` `gun` or `mgun`; `waypoint`; `time`; `interval`; `deviate`.
Does: Makes the selected units fire, either at enemies or at a waypoint position, for a time and at an interval.
Limits: None known.
Example:
```
{"actor_fire" {selector {tag mortar}} {drop orders} {burst_mode short}
	{waypoint "41"} {time 20} {interval 2} {deviate 5}}
```
<!-- goh: GHMIS-17 -->
Gates of Hell: fire ordered by a mission spends ammunition unless the command has `{cheating 1}`; here it never does. `cheating` is not a field of this game.
See: [action](#action); [inventory (command)](#inventory-command).

### actor_recon
Where: mission actions.
Type: block.
Values: `selector`, `drop`, `waypoint`, `radius`.
Does: Sends the selected units to scout around a waypoint within a radius.
Limits: None known.
Example:
```
{"actor_recon" {selector {tag scouts} {type human} {state "not dead"}} {radius 20}}
```
See: [actor_to_waypoint](#actor_to_waypoint).

### actor_state
Where: mission actions.
Type: block.
Values:
- `selector`, `drop`.
- `control` `user` or `AI`.
- `fire_mode` `open`, `return` or `hold`.
- `move_mode` `hold`, `free` or `zone`.
- `weapon_prepare` `on` or `off`.
- `move_radius`, `unmasking`, `cannon`, `make_enemies_forget`.
- `ai_move {mode enable|disable} {enable_on injure [enemy]}`.
- `movement {speed slow|assault|fast|normal|walk|bow|sneak|spot} {kind fast|slow} {type normal|crawl} {speed_kph} {max_speed_kph} {forward} {backward}`.
- `ai {advance_ratio} {retreat_ratio} {no_retreat} {no_advance} {follow_commander}`.
- `human {health 300}` (a plain number sets the value, a number with `+` adds to it) and stamina.
Does: Changes how the selected units behave: who controls them, when they fire, how and how fast they move, and their health.
Limits: On a selector with only a `player` field, the command can reach an entity that has no AI and crash the game; add `{type human}` to the selector.
Example:
```
{"actor_state" {selector {tag player_start}} {control user} {fire_mode open}
	{move_mode hold} {weapon_prepare on} {ai_move {mode enable}} {movement {speed assault}}}
```
<!-- goh: GHMIS-19 -->
Gates of Hell: the `human` group also takes `veterancy`, the soldier's rank from 0 to 8. This game has no such field; leave it out when you port a mission.
See: [squad_state](#squad_state).

### actor_to_cover
Where: mission actions.
Type: block.
Values: `selector`, `drop`; `covers`; `mode` `best`, `random` or `density`; `density`.
Does: Sends the selected units into cover.
Limits: None known.
Example:
```
{"actor_to_cover" {selector {tag defenders} {type human} {state "not dead"}} {drop orders} {mode random}}
```
See: [actor_to_waypoint](#actor_to_waypoint).

### actor_to_waypoint
Where: mission actions.
Type: block.
Values: `selector`, `drop`, `waypoint`, `clone`; `approach` one of `-`, `force`, `teleport`, `teleport & rotate`, `safe teleport`, `safe teleport & rotate`.
Does: Sends the selected units to a waypoint, or teleports them there.
Limits: A unit sitting in a vehicle refuses and logs a "linked actor" warning. A waypoint that does not exist logs `Waypoint <name> not found`.
Example:
```
{"actor_to_waypoint" {selector {tag runners}} {drop orders} {waypoint "22"} {approach "safe teleport"}}
```
<!-- goh: GHMIS-22 -->
Gates of Hell: a helicopter sent to a waypoint starts at the waypoint's `offset` height above it.
See: [waypoint (command)](#waypoint-command); [placement](#placement); [waypoints](#waypoints).

### air_attack
Where: mission actions.
Type: block.
Values: `selector`, `drop`, `enemies`, `clone`, `count`, `move_from_back`, `force_placement`, `random_weapon`, `waypoint`, `waypoint_to_attack`; `attack_altitude` (default 12).
Does: Calls an aircraft run against enemies or a waypoint.
Limits: None known.
Example:
```
{"air_attack" {selector {tag player_bonus}} {drop orders} {enemies {tag player_bonus_target}} {clone} {attack_altitude 20}}
```
<!-- goh: GHMIS-23 -->
Gates of Hell: units tagged `helicopter` are accepted as well.
See: [air_state](#air_state).

### air_state
Where: mission actions.
Type: block.
Values: `ground`; `altitude` in metres.
Does: Sets whether an aircraft is on the ground and its flying height.
Limits: No vanilla mission uses this command.
Example:
```
{"air_state" {selector {tag plane}} {altitude 40}}
```
<!-- goh: GHMIS-18 -->
Gates of Hell: it also works on helicopters, adds the switch `stop_engine`, and `ground` means the ground height under the target. Here only aircraft are affected and `ground` means altitude 0.
See: [air_attack](#air_attack).

### animate
Where: mission actions.
Type: block.
Values: `selector`, `animation`; `speed` (default 1; 0 stops the animation); `loop`; `resume`.
Does: Plays a named animation on the selected entities.
Limits: None known.
Example:
```
{"animate" {selector {tag player_bonus}} {animation wheels} {speed 1}}
```
<!-- goh: GHMIS-25 -->
Gates of Hell: adds the switch `no_restart`; what it changes is not confirmed. It is not a field of this game.
See: [animation](#animation); [rt_function](#rt_function).

### animation
Where: mission actions.
Type: block.
Values: `selector`, `drop`, `collage`; `speed` (default 1); `cicledelay`; `delay`; `totalTime`; `flags` `loop` and/or `random`.
Does: Plays an animation collage (a set of animations) on the selected humans, for example idle or talking gestures.
Limits: None known.
Example:
```
{"animation" {selector {zone "gamezone"} {type human}} {drop senseless} {collage stand_giveup_1}
	{cicledelay 9999} {delay 10} {totalTime 9999} {flags loop}}
```
See: [animate](#animate).

### autoassign
Where: mission actions.
Type: block.
Values: `selector`; `nearest`.
Does: Hands the selected units to the player's control. In multiplayer it raises the autoassign event.
Limits: None known.
Example:
```
{"autoassign" {selector {tag player_startleft} {zone "gamezone"}}}
```
<!-- goh: GHMIS-14 GHMIS-15 GHMIS-36 -->
Gates of Hell: `nearest` is gone, so a mission that has it carries a field that game does not know. The units go to the side named by the event that fired the trigger, or are dealt out automatically.
See: [player (command)](#player-command); [extraspawn](#extraspawn); [event (term)](#event-term).

### autosave
Where: mission actions.
Type: block with no fields.
Values: none.
Does: Saves the game, unless the mission is being loaded from a save at that moment.
Limits: None known.
Example:
```
{"autosave"}
```
<!-- goh: GHMIS-31 -->
Gates of Hell: it saves only when the player has autosave turned on in the options, so do not rely on it as a checkpoint.
See: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#statements-and-commands).

### board
Where: mission actions.
Type: block.
Values: `selector`, `vehicle` (a selector), `place`.
Does: Puts the selected units into a vehicle.
Limits: None known.
Example:
```
{"board" {selector {tag crew_1}} {vehicle {tag truck_1}}}
```
See: [emit](#emit); [linker](#linker).

### call
Where: mission actions.
Type: block.
Values: `function`, `specified`, `selector`.
Does: Runs a function defined in the mission's `functions` block.
Limits: No vanilla mission uses this command.
Example:
```
{"call" {function "reset_wave"}}
```
See: `functions` in [section 9](#9-helpers-blocks).

### camera_follow_bone
Where: mission actions.
Type: block.
Values: `entity` (hexadecimal uid, or 0), `bone`, `fov`, `offest {x} {y} {z}` (spelt this way), `"y angle"`, `"z angle"`, `apply`.
Does: Ties the camera to a bone of an entity, for cut scenes.
Limits: Crashes in multiplayer.
Example:
```
{"camera_follow_bone" {entity 0} {fov 0} {offest {x 0} {y 0} {z 0}} {"y angle" 0} {"z angle" 0}}
```
<!-- goh: GHMIS-24 -->
Gates of Hell: `entity` takes the longer 32-bit entity ids of that game.
See: [scenario](#scenario); [third_person_control](#third_person_control).

### con
Where: mission actions.
Type: block.
Values: `text`.
Does: Prints the text to `game.log`, which helps you see when a trigger ran.
Limits: No vanilla mission uses this command.
Example:
```
{"con" {text "wave 2 started"}}
```
See: [chapter 18](18-testing-and-logs.md).

### delete
Where: mission actions.
Type: block.
Values: `selector` only.
Does: Removes the selected entities from the map.
Limits: In multiplayer, deleting every unit of a team can end the match partway; keep at least one unit on each team that the delete does not select.
Example:
```
{"delete" {selector {amount 2} {tag enemy_mg_stand}}}
```
See: [section 8](#8-selectors).

### effect
Where: mission actions.
Type: block.
Values: `selector`; `effect` one of `start`, `_burn`, `explosion`, `die`.
Does: Plays an effect on the selected entities, sets them burning, explodes them or kills them.
Limits: None known.
Example:
```
{"effect" {selector {tag fuel_dump}} {effect explosion}}
```
See: [actor_component](#actor_component).

### emit
Where: mission actions.
Type: block.
Values: `selector`, `drop`, `waypoint`, `crew`; `emit {mode all|passengers|crew} {count}`.
Does: Makes people leave the selected vehicles or buildings.
Limits: None known.
Example:
```
{"emit" {selector {tag halftrack}} {waypoint "18"} {emit {mode passengers}}}
```
See: [board](#board).

### entity_manager
Where: mission actions.
Type: block.
Values: `enabled`, `count`.
Does: Changes the dynamic entity budget while the mission runs.
Limits: No vanilla mission uses this command.
Example:
```
{"entity_manager" {enabled} {count 200}}
```
See: [EntityManager](#entitymanager).

### entity_state
Where: mission actions.
Type: block.
Values: `selector`; `tag_add`, `tag_remove`; `inactive` `on` or `off`; `impregnability` `disabled`, `harmless` or `full`; `examined`; `discovered` `on` or `off`.
Does: Adds or removes tags, hides or wakes entities, and makes them invulnerable.
Limits: None known.
Example:
```
{"entity_state" {selector {tag wave_2}} {inactive off} {tag_remove "wave_2"} {tag_add "attackers"}}
```
See: [Tags](#tags); [tag](#tag) (selector field).

### environment
Where: mission actions.
Type: block.
Values: `name` (an environment preset), `time` (vanilla uses -1), `apply`.
Does: Switches the weather and lighting preset.
Limits: None known.
Example:
```
{"environment" {name "multi/multi_01_rain"} {time -1} {apply}}
```
See: [Environment](#environment).

### event (command)
Where: mission actions.
Type: block.
Values: `event` (name); `mode` `set`, `reset` or `toggle`; `delay` in seconds.
Does: Raises, clears or flips a named event that `event` terms can test.
Limits: An event name that nothing tests does nothing, with no log line.
Example:
```
{"event" {event "player_infantry"} {mode reset} {delay 0}}
```
See: [event (term)](#event-term).

### extraspawn
Where: mission actions.
Type: block.
Values: not listed by the sources.
Does: Hands the actor to the cooperative game's extra spawn list (unconfirmed).
Limits: No vanilla mission uses this command.
Example:
```
{"extraspawn" {selector {tag reserve}}}
```
<!-- goh: GHMIS-14 -->
Gates of Hell: it runs on the host only, and the other machines follow.
See: [autoassign](#autoassign); [chapter 12, section 7](12-missions-and-multiplayer-setup.md#statements-and-commands).

### fade
Where: mission actions.
Type: block.
Values: `on`, `time`, `color` (a hexadecimal colour such as `0xff000000`).
Does: Fades the screen to a colour or back.
Limits: None known.
Example:
```
{"fade" {on} {time 2} {color 0xff000000}}
```
See: [scenario](#scenario).

### fog_in_zone
Where: mission actions.
Type: block.
Values: `enable`, `zone`.
Does: Turns fog of war on or off inside a zone.
Limits: No vanilla mission uses this command.
Example:
```
{"fog_in_zone" {enable} {zone "village"}}
```
See: [fog_mode](#fog_mode); [Fog](#fog).

### fog_mode
Where: mission actions.
Type: block.
Values: `enable` `on` or `off`.
Does: Turns fog of war on or off for the whole map.
Limits: None known.
Example:
```
{"fog_mode" {enable off}}
```
See: [Fog](#fog).

### follow_animation
Where: mission actions.
Type: block.
Values: `entity`, `bone`.
Does: Makes the camera follow an animated bone of an entity.
Limits: No vanilla mission uses this command.
Example:
```
{"follow_animation" {entity 0x2a1} {bone "camera"}}
```
See: [camera_follow_bone](#camera_follow_bone).

### game_speed
Where: mission actions.
Type: block.
Values: `mode`.
Does: Changes the game speed.
Limits: Has no effect in multiplayer. No vanilla mission uses this command.
Example:
```
{"game_speed" {mode 1}}
```
See: [chapter 12](12-missions-and-multiplayer-setup.md).

### gameover
Where: mission actions.
Type: block.
Values: `result` `win` or `loose` (spelt this way; the numbers 2 for won and 1 for lost are also read); `message`.
Does: Ends the mission with a win or a loss and shows a message.
Limits: None known.
Example:
```
{"gameover" {result loose} {message ""}}
```
See: [gamestatus](#gamestatus).

### gamestatus
Where: mission actions.
Type: block.
Values: `status` `-` or 1 to 5.
Does: Sets the game status value.
Limits: No vanilla mission uses this command.
Example:
```
{"gamestatus" {status 2}}
```
See: [gameover](#gameover).

### inventory (command)
Where: mission actions.
Type: block.
Values: `selector`; `action` one of `take`, `take_from`, `put`, `pickup`, `drop`, `drop_to`, `add`, `remove`, `fuel`; `item`; `amount` (default 1); `entity`; `filling {stuff amount}`.
Does: Adds, removes, moves or refills items in the inventory of the selected units or vehicles.
Limits: None known.
Example:
```
{"inventory" {selector {tag fixer} {type human} {state "not dead"}} {action add} {item "repair_kit"}}
```
<!-- goh: GHMIS-28 -->
Gates of Hell: `add` also takes `stack`, on by default; `{stack 0}` is not a field of this game.
See: [inventory (term)](#inventory-term).

### linker
Where: mission actions.
Type: block.
Values: `selector`; `action` `link` or `unlink`; `type` `any`, `mask`, `specific`, `flexible` or `trailer`; `entities` (a selector); `name`.
Does: Links entities together or apart, for example a gun to a tractor.
Limits: None known.
Example:
```
{"linker" {selector {tag tractor}} {action link} {type trailer} {entities {tag pak40}}}
```
See: [Link](#link); [unlink](#unlink).

### load_units
Where: mission actions.
Type: block.
Values: `slot_name`.
Does: Brings back the units stored earlier with `store_units` under the same slot name.
Limits: No vanilla mission uses this command.
Example:
```
{"load_units" {slot_name "survivors"}}
```
See: [store_units](#store_units).

### manual_lock
Where: mission actions.
Type: block.
Values: `lock`.
Does: Locks or unlocks direct control of the selected units.
Limits: No vanilla mission uses this command.
Example:
```
{"manual_lock" {selector {tag tank_1}} {lock}}
```
See: [third_person_control](#third_person_control).

### mine
Where: mission actions.
Type: block.
Values: `zone`, `event`.
Does: Mines a zone and names an event linked to it.
Limits: No vanilla mission uses this command.
Example:
```
{"mine" {zone "field"} {event "field_mined"}}
```
<!-- goh: GHMIS-47 -->
Gates of Hell: a zone smaller than one mine step still gets one mine at its centre. Here such a zone gets none and the laying order ends at once, so make the zone at least one step wide.
See: [mine_state](#mine_state); [mined](#mined); [zones](#zones).

### mine_state
Where: mission actions.
Type: block.
Values: `action` `arm`, `detect` or `disarm`; `miner`.
Does: Arms, reveals or disarms mines.
Limits: No vanilla mission uses this command.
Example:
```
{"mine_state" {selector {tag road_mines}} {action detect}}
```
<!-- goh: GHMIS-27 -->
Gates of Hell: arming a defused mine again keeps its defused mark there; here the mark is cleared.
See: [mine](#mine); [mined](#mined).

### mp_event
Where: mission actions.
Type: block.
Values: `team`, `event`.
Does: Raises a multiplayer event for one team.
Limits: No vanilla mission uses this command.
Example:
```
{"mp_event" {team a} {event "reinforce"}}
```
See: [chapter 12](12-missions-and-multiplayer-setup.md).

### music
Where: mission actions.
Type: block.
Values: `start`, `stop`, `stop_all`; `volume` with `game`, `narrator` or `interface`; `fade`; `loop`.
Does: Starts, stops and fades music.
Limits: None known.
Example:
```
{"music" {start "/music/skirmish_background_01.mp3"} {stop_all} {volume game} {fade 5} {loop}}
```
See: [sound](#sound).

### objective_progress
Where: mission actions.
Type: block.
Values: `title`, `hide`, `add`, `set`.
Does: Shows or updates a progress counter for an objective.
Limits: None known.
Example:
```
{"objective_progress" {set 0} {add 0} {title "$/player_money_000"}}
```
See: [task (command)](#task-command); [timer](#timer).

### placement
Where: mission actions.
Type: block.
Values: `selector`, `target`, `target_waypoint`, `clone`, `ignore_z`.
Does: Moves the selected entities to a target or waypoint at once.
Limits: None known.
Example:
```
{"placement" {selector {tag decoy}} {target_waypoint "9"}}
```
<!-- goh: GHMIS-26 -->
Gates of Hell: the switch `clone_places` also clones what sits in the unit's seats. Here a cloned vehicle comes without its crew.
See: [actor_to_waypoint](#actor_to_waypoint); [waypoints](#waypoints).

### player (command)
Where: mission actions.
Type: block.
Values: `selector`, `drop`; `operation` `set` or `mask_set`; `player`.
Does: Gives the selected entities to another side.
Limits: None known.
Example:
```
{"player" {selector {tag partisans}} {operation set} {player 1}}
```
See: [Players](#players); [player (selector field)](#player-selector-field).

### reinforcement
Where: mission actions.
Type: block.
Values: `operation` `show`, `hide`, `score_add` or `score_total`; `name`; `score` (default 10).
Does: Shows or hides a reinforcement card, or changes the reinforcement points.
Limits: None known.
Example:
```
{"reinforcement" {operation show} {name "player_infantry"}}
{"reinforcement" {operation score_add} {score 150}}
```
<!-- goh: GHMIS-37 GHMIS-04 -->
Gates of Hell: with the game card setting `assignReinforcementsToPlayer` on, a called reinforcement belongs to the side that called it instead of side 0, and its start event carries that side.
See: [reinforcements](#reinforcements) in section 9; [event (term)](#event-term).

### rt_function
Where: mission actions.
Type: block.
Values: `selector`; `call` with a function block: `AniPlay {name speed}`, speaker `Switch {mode}` or bone rotator `Watch {mode radius}`.
Does: Calls a function on a part of the selected entities, such as playing an animation or switching a sound speaker.
Limits: None known.
Example:
```
{"rt_function" {selector {tag flag_base}} {call "AniPlay" {name down} {speed 1}}}
```
See: [animate](#animate).

### scenario
Where: mission actions.
Type: block.
Values: `message {text}`; `camera {name smooth_begin smooth_end disable_cancel}`; `event_on_next`; `force_auto_complete`; `do_not_restore_camera`; `do_not_store_camera`.
Does: Plays a scripted scene step: a message and a camera move.
Limits: None known.
Example:
```
{"scenario" {message {text "$/intro_01"}} {camera {name "cam_1"}} {event_on_next "intro_2"} {force_auto_complete}}
```
<!-- goh: GHMIS-113 GHMIS-111 -->
Gates of Hell: a scenario switches to its own screen, and `force_auto_complete` or `disable_cancel` end it when the camera path ends.
See: `cameras` in [section 9](#9-helpers-blocks); [talk](#talk); [camera_follow_bone](#camera_follow_bone).

### set_clip
Where: mission actions.
Type: block.
Values: `name` (a clip name from the map's `Clips` block).
Does: Switches the playable area, camera area and pathfinding area to another clip.
Limits: None known.
Example:
```
{"set_clip" {name start}}
```
See: [Clips](#clips) in [section 15](#15-map-files).

### set_i
Where: mission actions.
Type: block.
Values: `var` (a variable name ending in `$`); `op` `=`, `+`, `-`, `*` or `/`; `value` (a number, a variable or `players:count@`).
Does: Changes a mission variable.
Limits: A variable name that is not declared makes the command do nothing, with no log line.
Example:
```
{"set_i" {var "player_score$"} {op "+"} {value 1}}
```
See: [vars](#vars) in [section 9](#9-helpers-blocks); [cmp_i](#cmp_i).

### sound
Where: mission actions.
Type: block.
Values: `name`; `waypoint` (without it the sound plays as an interface sound).
Does: Plays a sound at a waypoint or as an interface sound.
Limits: None known.
Example:
```
{"sound" {name "mission/task_new"}}
```
See: [music](#music); [talk](#talk).

### spawn
Where: mission actions.
Type: block.
Values: `entity` (an entity definition name), `waypoint`, `in_camera`.
Does: Creates a new entity of that definition at a waypoint, for example a smoke marker.
Limits: A waypoint that does not exist is skipped without a message. An empty `entity` may crash or be skipped (unconfirmed).
Example:
```
{"spawn" {entity "smoke_red_norm"} {waypoint "130"}}
```
<!-- goh: GHMIS-16 -->
Gates of Hell: the switch `disable_random_spawn_position` puts the entity on the waypoint itself. Here it always lands somewhere inside the waypoint's radius, and the switch is not a field of this game.
See: [waypoint (command)](#waypoint-command) with `clone`; [waypoints](#waypoints).

### squad
Where: mission actions.
Type: block.
Values: `operation` `assign`, `add`, `dismiss` or `commander_set`; `name`; `selector`.
Does: Changes a squad: assigns or adds members, dismisses it, or sets its commander.
Limits: None known.
Example:
```
{"squad" {operation commander_set} {name officer_squad} {selector {tag enemy_officer} {type human}}}
```
See: [squad_create](#squad_create).

### squad_create
Where: mission actions.
Type: block.
Values: `selector`, `name`.
Does: Makes a named squad from the selected units.
Limits: None known.
Example:
```
{"squad_create" {selector {tag alpha}} {name "alpha"}}
```
<!-- goh: GHMIS-48 -->
Gates of Hell: when the squad is made per side, the leader is chosen after the members join, so it can be another man than here.
See: [squad_dismiss](#squad_dismiss); [squad](#squad).

### squad_dismiss
Where: mission actions.
Type: block.
Values: `squad`.
Does: Breaks up a named squad.
Limits: None known.
Example:
```
{"squad_dismiss" {squad "alpha"}}
```
See: [squad_create](#squad_create).

### squad_state
Where: mission actions.
Type: block.
Values: `squad`, `guard`, `movement {mode} {type}`.
Does: Changes how a squad moves and guards.
Limits: None known.
Example:
```
{"squad_state" {squad officer_squad} {guard on} {movement {type normal}}}
```
See: [actor_state](#actor_state).

### squad_to_waypoint
Where: mission actions.
Type: block.
Values: `squad`, `waypoint`.
Does: Sends a named squad to a waypoint.
Limits: None known.
Example:
```
{"squad_to_waypoint" {squad "alpha"} {waypoint "14"}}
```
See: [actor_to_waypoint](#actor_to_waypoint).

### store_units
Where: mission actions.
Type: block.
Values: `slot_name`.
Does: Stores units under a slot name so `load_units` can bring them back.
Limits: No vanilla mission uses this command.
Example:
```
{"store_units" {selector {tag survivors}} {slot_name "survivors"}}
```
See: [load_units](#load_units).

### talk
Where: mission actions.
Type: block.
Values: `selector`, `say`, `text`, `clear_queue`.
Does: Makes a unit speak a line of text.
Limits: None known.
Example:
```
{"talk" {selector {tag officer_talk}} {text "$/officer_start"}}
```
<!-- goh: GHSRV-02 -->
Gates of Hell: the dedicated server drops the line; only the players' machines show it.
See: [scenario](#scenario); Part I [Add or change text and translate it](p07-text-and-translation.md).

### task (command)
Where: mission actions.
Type: block.
Values: `name`; `state` `show`, `hide`, `complete` or `fail`.
Does: Shows, hides, completes or fails an objective from the `tasks` block.
Limits: None known.
Example:
```
{"task" {name "defendbase"}}
{"task" {name "destroy_enemy_tank"} {state show}}
```
See: [tasks](#tasks) in [section 9](#9-helpers-blocks); [task (term)](#task-term).

### third_person_control
Where: mission actions.
Type: block.
Values: `selector`, `lock` (`on` or `off`), `default`, `position {linkBone} {offest {x} {y} {z}}`, `clip {viewMin} {viewMax}`, `zoom {min} {max}`.
Does: Sets up direct control camera limits for the selected unit.
Limits: None known.
Example:
```
{"third_person_control" {selector {ignore_captured_by_user 0} {tag player_tankace}} {lock on}
	{position {linkBone basis} {offest {x -75} {y 0} {z 75}}}}
```
<!-- goh: GHMIS-20 GHMIS-21 -->
Gates of Hell: only `lock` is left; the camera fields do nothing there, because the camera comes from the unit's tags. In multiplayer it acts only on the machine of the player who owns the unit.
See: [manual_lock](#manual_lock); [camera_follow_bone](#camera_follow_bone).

### thread
Where: mission actions.
Type: block of statements.
Values: actions and statements.
Does: Runs a block of actions as its own thread, so it carries on in parallel with the rest.
Limits: No vanilla mission uses this command.
Example:
```
{"thread" {"delay" {time 5}} {"event" {event "late"} {mode set}}}
```
See: [section 5](#5-statements).

### throw_off
Where: mission actions.
Type: block.
Values: `selector`, `drop`, `up`, `forward`, `turn`, `keep_orientation`, `die`.
Does: Throws the selected entities through the air, as if by a blast.
Limits: None known.
Example:
```
{"throw_off" {selector {tag crate}} {up 10} {forward 5} {turn 2} {keep_orientation 0}}
```
See: [effect](#effect).

### timer
Where: mission actions.
Type: block.
Values: `time` (`"minutes:seconds"` or seconds), `title`, `hide`.
Does: Shows a countdown timer on screen, or hides it.
Limits: None known.
Example:
```
{"timer" {time 180} {title "$/timerbase"}}
```
See: [objective_progress](#objective_progress).

### trigger (command)
Where: mission actions.
Type: block.
Values: `name`; `on`.
Does: Switches another trigger on or off.
Limits: A trigger name that does not exist does nothing, with no log line.
Example:
```
{"trigger" {name "wave_2"} {on}}
```
See: [disabled](#disabled); [trigger (term)](#trigger-term).

### unlink
Where: mission actions.
Type: block.
Values: `selector`; no other fields.
Does: Detaches the selected entities from whatever they are linked to.
Limits: None known.
Example:
```
{"unlink" {selector {tag trailer}}}
```
See: [linker](#linker).

### wait
Where: mission actions.
Type: block.
Values: `time`.
Does: Waits for a time.
Limits: No vanilla mission uses this command; vanilla missions use the `delay` statement.
Example:
```
{"wait" {time 3}}
```
See: [delay](#delay).

### waypoint (command)
Where: mission actions.
Type: block.
Values: `who {type actor|squad} {actors <selector>}`; `action {type start|suspend|resume} {waypoint} {clone} {make_squad} {name_squad} {copy_squad} {approach} {direction}`.
Does: Starts, pauses or resumes a walk along a waypoint path. With `clone` it spawns copies of the units at the waypoint first, which is how most vanilla reinforcements arrive.
Limits: None known.
Example:
```
{"waypoint" {who {type actor} {actors {tag player_infantry}}}
	{action {type start} {waypoint "74"} {clone} {make_squad} {approach "safe teleport & rotate"}}}
```
See: [waypoints](#waypoints) in [section 9](#9-helpers-blocks).

## 7. Condition terms

Used in: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#conditions); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

A term is written in a trigger as `{"<number>.<kind>" ...fields}` inside `terms`, or inline as `{type <kind>} ...fields`. A term whose event, trigger or variable name does not exist is simply false, with no log line.

### arrival
Where: condition terms.
Type: block.
Values: a filter.
Does: True when the entity in the current context passes the filter.
Limits: No vanilla mission uses this term by name.
Example:
```
{"1.arrival" {tag courier}}
```
See: [near](#near).

### camera
Where: condition terms.
Type: block.
Values: `time` (default 0.1), `bound` (default 0.75), `precision` `default`, `low`, `medium` or `high`.
Does: True when the camera is looking at a place for a time.
Limits: No vanilla mission uses this term by name.
Example:
```
{"1.camera" {time 0.5} {bound 0.75} {precision medium}}
```
See: [scenario](#scenario).

### cmp_i
Where: condition terms.
Type: block.
Values: `var`; `op` `==`, `!=`, `<<`, `<<=`, `>` or `>=`; `value`.
Does: Compares a mission variable with a value.
Limits: A variable name that is not declared makes the term false, with no log line.
Example:
```
{"2.cmp_i" {var "player_score$"} {op ">="} {value 3}}
```
See: [set_i](#set_i); [vars](#vars).

### crew
Where: condition terms.
Type: block.
Values: `vehicle` ids, `vehicle_selector`, `units`, `at_least_one`.
Does: True when the given units are the crew of the given vehicles.
Limits: No vanilla mission uses this term by name.
Example:
```
{"1.crew" {vehicle_selector {tag truck}} {units {tag drivers}} {at_least_one}}
```
See: [board](#board).

### difficulty
Where: condition terms.
Type: block.
Values: `level` `easy`, `normal`, `hard` or `heroic`.
Does: True when the game is played at that difficulty.
Limits: None known.
Example:
```
{"if" {condition {type difficulty} {level heroic}} {"delete" {selector {tag heroic}}}}
```
See: [chapter 12](12-missions-and-multiplayer-setup.md).

### entities
Where: condition terms.
Type: block.
Values: `selector`; `count {op value}`. `op` is one of `==`, `!=`, `<<`, `<<=`, `>` and `>=`; `value` is a number or a variable name. Without `count` the test is `> 0`.
Does: True when the selector finds entities, or when the number it finds passes the comparison.
Limits:
- Dead entities drop out of every selector, so watch for a unit's state before it dies. Component tests inside a standard selector are dropped silently and the count reads as the plain tag count; use the advanced selector form for them.
- `{count {op "=="} {value 0}}` is lost when the editor saves the mission: it is not written, and the mission loads back with the default `> 0`. A trigger meant to wait until a group is wiped out then fires while the group is still alive. Write `{count {op "<<"} {value 1}}`, as in the example, or check the saved `.mi` file.
Example:
```
{"1.entities" {selector {tag enemy_tanks} {state "not dead"}} {count {op "<<"} {value 1}}}
```
<!-- goh: GHMIS-43 -->
Gates of Hell: the same loss of `== 0` on saving happens there.
See: [section 8](#8-selectors); [cmp_i](#cmp_i); [chapter 12, section 7](12-missions-and-multiplayer-setup.md#conditions); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

### event (term)
Where: condition terms.
Type: block.
Values: `id` (event name).
Does: True while the named event is set.
Limits: An event name that is never raised is simply false.
Example:
```
{"1.event" {id "start"}}
```
<!-- goh: GHMIS-35 GHMIS-36 -->
Gates of Hell: each condition keeps its own state, and a true `event` term passes the side the event names on to the trigger's commands, such as `autoassign`.
See: [event (command)](#event-command); `events` in [section 9](#9-helpers-blocks); [trigger (term)](#trigger-term).

### inventory (term)
Where: condition terms.
Type: block.
Values: `selector`, `item`; `where` `box`, `right hand`, `all holders`, `filling` or `fuel`; `compare` `greater`, `equal` or `less`; `amount`.
Does: True when the selected units hold more, the same, or fewer of an item.
Limits: None known.
Example:
```
{"1.inventory" {selector {tag player_tank}} {where fuel} {compare less} {amount 10}}
```
See: [inventory (command)](#inventory-command).

### linked
Where: condition terms.
Type: block.
Values: `source`, `destination`.
Does: True when the entities picked by `source` are linked to those picked by `destination`.
Limits: No vanilla mission uses this term by name.
Example:
```
{"1.linked" {source {tag pak40}} {destination {tag tractor}}}
```
See: [linker](#linker).

### mined
Where: condition terms.
Type: block.
Values: `infill` (empty means full), `player`, `zone`; `type` `antitank` or `antipersonnel`.
Does: True when a zone is mined to the given fill.
Limits: No vanilla mission uses this term by name.
Example:
```
{"1.mined" {zone "field"} {type antitank}}
```
See: [mine](#mine).

### mission_option
Where: condition terms.
Type: block.
Values: `name`.
Does: True when the named mission option is chosen in the lobby.
Limits: The option must be listed in the game card's `mission_options` and the mission's `mission_options` block.
Example:
```
{"case" {condition {type mission_option} {name "mission_option4"}} {"delete" {selector {tag mission_option_3}}}}
```
See: [mission_options](#mission_options) in [section 9](#9-helpers-blocks) and [section 10](#10-game-mode-card).

### mod
Where: condition terms.
Type: block.
Values: `name`.
Does: True when a workshop mod with that name is installed; the name is not case-sensitive.
Limits: This tests installed workshop mods only; it is not the same as the `(mod ...)` test in data files.
Example:
```
{"1.mod" {name "my_extra_units"}}
```
See: [chapter 12](12-missions-and-multiplayer-setup.md).

### near
Where: condition terms.
Type: block.
Values: `units` (a selector), `near_to` (a selector), `distance` in metres, `high_precision`.
Does: True when the units are within the distance of the target.
Limits: The distance is measured between the edges of the two entities, not their centres, so big objects count as near sooner.
Example:
```
{"1.near" {units {tag player}} {near_to {tag flag_a02_ai}} {distance 115}}
```
See: [see_actors](#see_actors).

### rand
Where: condition terms.
Type: block.
Values: `value`, a chance from 0 to 1 (default 1).
Does: True with the given chance each time it is tested.
Limits: In multiplayer it is safe in a trigger every machine runs; a random test that runs on one machine only desyncs the game.
Example:
```
{"case" {condition {type rand} {value 0.1}} {"environment" {name "multi/multi_01_rain"}}}
```
See: [section 16](#16-what-must-match-between-players).

### see_actors
Where: condition terms.
Type: block.
Values: `selector`, `enemy`; `distance {mode near_than|far_than|in_range}` with `meters`, or a minimum and a maximum; `detection` `recognized`, `visible` or `located`; `tag` holding `"tag pair"`, `"for selector"` and `"for enemy"`.
Does: True when the selected units can see the target units within the distance rules.
Limits: None known.
Example:
```
{"1.see_actors" {selector {tag sentry}} {enemy {tag player}}
	{distance {mode near_than} {meters 15}} {detection visible}}
```
See: [see_enemy](#see_enemy).

### see_enemy
Where: condition terms.
Type: block.
Values: `selector`.
Does: True when the selected units see any enemy.
Limits: None known.
Example:
```
{"1.see_enemy" {selector {tag outpost}}}
```
See: [see_actors](#see_actors).

### side
Where: condition terms.
Type: block.
Values: `side`.
Does: Tests the side of the context's entity.
Limits: No vanilla mission uses this term by name.
Example:
```
{"1.side" {side 1}}
```
See: [Players](#players).

### signal
Where: condition terms.
Type: block.
Values: `zone`; `signals` from `shot`, `hit`, `injure`, `explosion`, `mandie`; `reset_signals` (default true).
Does: True when one of the listed things happened inside the zone, such as a shot or an explosion.
Limits: None known.
Example:
```
{"1.signal" {zone "flag_a02_capture"} {signals "shot hit injure explosion"}}
```
See: [zones](#zones) in [section 9](#9-helpers-blocks).

### task (term)
Where: condition terms.
Type: block.
Values: `name`; `state` `completed`, `failed` or `shown` (default `completed`).
Does: True when the objective is in that state.
Limits: None known.
Example:
```
{"1.task" {name "stay_alive"} {state failed}}
```
See: [task (command)](#task-command).

### trigger (term)
Where: condition terms.
Type: block.
Values: `name`.
Does: True while the named trigger is on.
Limits: A trigger name that does not exist is simply false.
Example:
```
{"1.trigger" {name "mission:helper/clearbase"}}
```
See: [trigger (command)](#trigger-command).

### waypoint_canmove
Where: condition terms.
Type: block.
Values: a waypoint block naming actors on a walk.
Does: Tests whether actors on a waypoint walk can move on.
Limits: No vanilla mission uses this term by name.
Example:
```
{"1.waypoint_canmove" {waypoint "12"}}
```
See: [waypoint (command)](#waypoint-command).

## 8. Selectors

Used in: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#statements-and-commands); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

A selector is a block that picks entities. The standard form lists fields that all have to match:

```
{selector {tag gunners} {zone "village"} {type human} {state "not dead"}}
```

The advanced form builds the set from groups: `{selector {source advanced} {group {select ...} {include ...} {exclude ...}}}`.

General limits:

- Dead and destroyed entities drop out of every selector.
- A vehicle never counts as `dead`; test `not moveable` or use the advanced form with destroyed components.
- `dead` also matches men who are knocked out.

### type
Where: selector.
Type: word.
Values: `human`, `auto`, `tank`, `vehicle`.
Does: Keeps only entities of that kind.
Limits: None known.
Example:
```
{selector {tag patrol} {type human}}
```
<!-- goh: GHMIS-40 -->
Gates of Hell: soldiers and vehicles are told apart by the kind of unit, not by the tag `vehicle`, so a unit whose tag and kind disagree is picked differently there.
See: [state](#state); [tag](#tag).

### state
Where: selector.
Type: word.
Values: `dead`, `"not dead"`, `operatable`, `"not operatable"`, `moveable`, `"not moveable"`, `inhabited`, `"not inhabited"`.
Does: Keeps only entities in that state.
Limits: `not inactive` does not drop inactive entities.
Example:
```
{selector {tag convoy} {type vehicle} {state "not moveable"}}
```
See: [entities](#entities).

### tag
Where: selector.
Type: word.
Values: any tag given in `Tags`, by `entity_state`, or in the entity definition.
Does: Keeps only entities with the tag.
Limits: None known.
Example:
```
{selector {tag enemy_mg_stand}}
```
See: [Tags](#tags).

### amount
Where: selector.
Type: number.
Values: a whole number.
Does: Limits how many entities the selector takes.
Limits: None known.
Example:
```
{selector {amount 1} {tag "enemy_at-guns_01"}}
```
See: [sort](#sort).

### zone
Where: selector.
Type: text (zone name).
Values: a zone from the `zones` block.
Does: Keeps only entities inside the zone. Zone membership is updated every 0.25 seconds.
Limits: None known.
Example:
```
{selector {tag player_startleft} {zone "gamezone"}}
```
See: [zones](#zones) in [section 9](#9-helpers-blocks).

### player (selector field)
Where: selector.
Type: text (side number).
Values: a side number as text.
Does: Keeps only entities of that side.
Limits: In a multiplayer game with bots the side numbers are not the slot numbers: in a four-slot game the host is side 2 and the bots are sides 3 and 4. A wrong number gives an empty selector and the triggers stay silent; the console command `mp_userUnits` shows the real numbers.
Example:
```
{selector {tag defenders} {player "2"} {type human}}
```
<!-- goh: GHMIS-39 -->
Gates of Hell: the switch `user_player` picks the units of whoever plays at this machine. Each machine then picks different units, which in this game would desync a multiplayer match, so use side numbers here.
See: [Players](#players); [relation](#relation); [Reference 12, `playerId`](r12-bot-lua-and-console.md#playerid).

### relation
Where: selector.
Type: word.
Values: `ally`.
Does: Keeps only entities allied to the context's side.
Limits: None known.
Example:
```
{selector {relation ally} {type human}}
```
<!-- goh: GHMIS-39 -->
Gates of Hell: with `user_player`, `relation` is taken from the player at this machine.
See: [Players](#players); [player (selector field)](#player-selector-field).

### mids
Where: selector.
Type: number list.
Values: `MID` numbers of entities.
Does: Picks entities by their mission id.
Limits: A number that no entity holds gathers nothing, with no log line.
Example:
```
{selector {ignore_captured_by_user 0} {mids 15}}
```
See: [MID](#mid).

### ignore_captured_by_user
Where: selector.
Type: number (switch).
Values: 0 or 1.
Does: Says whether entities the player has captured are skipped.
Limits: None known.
Example:
```
{selector {ignore_captured_by_user 0} {tag ambush}}
```
See: [player (selector field)](#player-selector-field); [mids](#mids).

### sort
Where: selector.
Type: block: `{sort {type entity|waypoint} {entity} {wpid} {mode farthest}}`.
Values: `type` `entity` or `waypoint`; `mode` `farthest`.
Does: Orders the found entities by distance from an entity or a waypoint, so `amount` takes the nearest or farthest.
Limits: None known.
Example:
```
{selector {source advanced} {group {select {tag {tag crew}}}}
	{sort {type entity} {entity {ignore_captured_by_user 0} {tag tank_inhabited}}} {amount 2}}
```
See: [amount](#amount).

### source
Where: selector.
Type: word.
Values: `advanced`.
Does: Switches the selector to the advanced form built from `group`.
Limits: None known.
Example:
```
{selector {source advanced} {group {select ...} {exclude ...}}}
```
See: [group](#group).

### group
Where: advanced selector.
Type: block: `{group {select ...} {include ...} {exclude ...}}`.
Values: `select`, `include`, `exclude` blocks.
Does: Builds the set: what to select, what to add, what to take away. Component tests such as destroyed components work here.
Limits: None known.
Example:
```
{selector {source advanced} {group {select {tag {tag enemy}}} {include {zone {zone "flag_a01_capture"}}}
	{exclude {state {state inactive}}}}}
```
See: [entities](#entities).

## 9. Helpers blocks

Used in: [chapter 12, section 7](12-missions-and-multiplayer-setup.md#7-mission-files-mi); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

### waypoints
Where: `.mi` file, inside `Helpers`.
Type: block: `{waypoints "<player>" {"<name>" {position x y z} {radius}}}`.
Values: names are text (vanilla uses numbers as text, such as `"0"`).
Does: Named points used by `waypoint`, `actor_to_waypoint`, `spawn` and others. A waypoint may carry its own `commands`.
Limits: Commands that name a missing waypoint log `Waypoint <name> not found` or are skipped.
Example:
```
{waypoints "player" {"0" {position 120 340 0} {radius 5}}}
```
<!-- goh: GHMIS-45 GHMIS-46 -->
Gates of Hell: a waypoint may carry `RandomPosition`, which sends `placement` and walking units to a random point in its radius; because of a fault the point always falls on one half of the circle. This game does not accept the keyword.
See: [waypoint (command)](#waypoint-command); [spawn](#spawn); [placement](#placement).

### zones
Where: `.mi` file, inside `Helpers`.
Type: block of zone blocks.
Values: a zone is `circle` with `{Radius}` or `poly` with repeated `{Point x y}`, and a `{Name}`.
Does: Named areas used by selectors, `signal`, `fog_in_zone` and the `zone` movement mode. Membership is updated every 0.25 seconds.
Limits: Multiplayer maps use no zones for capture areas; flags use `map_point` radii instead.
Example:
```
{zones {zone "circle" {Name "village"} {position 1200 800 0} {Radius 400}}}
```
See: [zone](#zone) (selector field).

### triggers
Where: `.mi` file, inside `Helpers`.
Type: block of trigger blocks.
Values: section 3.
Does: Holds the mission's triggers.
Limits: See section 3.
Example:
```
{triggers {"difficulty" {condition ...} {actions ...}}}
```
See: [section 3](#3-triggers).

### tasks
Where: `.mi` file, inside `Helpers`.
Type: block: `{"<name>" {desc} {primary} {state} {point} {team}}`.
Values: `desc` text key; `primary` switch; `state` `hidden`, `completed` or `failed`; `point`; `team`.
Does: Lists the mission's objectives.
Limits: None known.
Example:
```
{tasks {"stay_alive" {desc "$/mission_stay_alive"} {primary}} {"heal_comrade" {desc "$/mission_heal"} {state hidden}}}
```
See: [task (command)](#task-command); [task (term)](#task-term).

### reinforcements
Where: `.mi` file, inside `Helpers`.
Type: block: `{scoreTotal} {scoreCurrent}` and named card blocks.
Values: each card has `state`, `text`, `image`, `hint`, `count` (-1 for unlimited), `score`, `delay`, `eventStart`, `eventEnd`, `waypoint`, `delayedHide`.
Does: The reinforcement cards of a single-player mission: each card costs points and raises its `eventStart` event, which a trigger answers by bringing the units in.
Limits: A multiplayer mission keeps `{reinforcements {scoreTotal 0} {scoreCurrent 0}}`; multiplayer purchases come from the unit lists instead.
Example:
```
{reinforcements {scoreTotal 2000} {scoreCurrent 0}
	{"player_infantry" {state hidden} {text "$/reinf_01"} {image "riflemans(usa)"} {count -1} {score 150} {delay 20} {eventStart "player_infantry"} {waypoint "0"}}}
```
<!-- goh: GHMIS-38 -->
Gates of Hell: a card may also have `previewEntity`, which nothing reads.
See: [reinforcement (command)](#reinforcement).

### vars
Where: `.mi` file, inside `Helpers`.
Type: block: `{"<name>"}` per variable.
Values: variable names. In commands and terms you write the name with a `$` at the end; the name is lower-cased and the `$` dropped. A name ending in `@` is a built-in value, and the only one is `players:count@`, the number of players. Anything else is read as a number.
Does: Declares mission variables for `set_i` and `cmp_i`.
Limits: An undeclared variable makes `set_i` do nothing and `cmp_i` false, with no log line.
Example:
```
{vars {"player_score"} {"menu:1"}}
```
<!-- goh: GHMIS-41 GHMIS-42 GHMIS-62 -->
Gates of Hell: the game also offers the variables `@players:composition` and `@game:frontlinesphase`, and a bot script can read and set mission variables ([Gates of Hell only](#gates-of-hell-only)).
See: [set_i](#set_i); [cmp_i](#cmp_i); [Reference 12, `Vars`](r12-bot-lua-and-console.md#vars).

### mission_options
Where: `.mi` file, inside `Helpers`.
Type: block: one block per option.
Values: option names.
Does: Declares the options the `mission_option` term can test.
Limits: None known.
Example:
```
{mission_options {mission_option1}}
```
See: [mission_option](#mission_option) (term); [mission_options](#mission_options) in [section 10](#10-game-mode-card).

### modifiers
Where: `.mi` file, inside `Helpers`.
Type: block.
Values: `name`, `scale`, `place`.
Does: Mission modifiers with a name, a scale and a place (unconfirmed what they change).
Limits: None known.
Example:
```
{modifiers {"m1" {name "reload"} {scale 0.5}}}
```
See: [chapter 12](12-missions-and-multiplayer-setup.md).

## 10. Game mode card

Used in: [chapter 12, section 1](12-missions-and-multiplayer-setup.md#1-how-a-game-mode-is-assembled) and its [game card keys](12-missions-and-multiplayer-setup.md#game-card-keys); [chapter 13, section 8](13-maps.md#8-getting-into-the-lobby); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

A game mode is a file `set/multiplayer/games/<mode>.set` with a `{game ...}` block. The map's `map.info` and then `<mode>.info` are laid over it for each map, so a map can override any key. Unknown keys in these files are skipped without a message.

### class
Where: game card, `{game}`.
Type: word.
Values: `combat`, `captureflag`, `cooperative`, `frontline`, `battle_zones`, `battle_zones_8x8`, `armored_warfare`, `combined_arms`; the default is the file name.
Does: Picks the rules engine the mode runs on.
Limits: `armored_warfare` and `combined_arms` have no card in the stock game. A `captureflag` map needs the clips `captureflaga` and `captureflagb`, or it crashes.
Example:
```
{game {class combat} {order 1} ...}
```
<!-- goh: GHMIS-94 GHMIS-95 GHMIS-69 -->
Gates of Hell: adds `ammunition`, `evacuation`, `guerrilla`, `heroes`, `campaign_capture_the_flag`, `frontlines` and `koth`. The frontline class is spelt `frontlines` there, and `combat` is not registered.
See: [order](#order); [parameters](#parameters); [chapter 12, section 1](12-missions-and-multiplayer-setup.md#game-card-keys); [Reference 12, `mp_checkCompetitive`](r12-bot-lua-and-console.md#mp_checkcompetitive).

### order
Where: game card.
Type: number.
Values: a whole number.
Does: The place of the mode in the lobby list.
Limits: None known.
Example:
```
{order 2}
```
See: [class](#class).

### minPlayers
Where: game card, `map.info`, `<mode>.info`.
Type: number.
Values: 1 to the console variable `mp_maxPlayers`; rounded up to an even number.
Does: The smallest number of players for the mode.
Limits: Out-of-range numbers are clamped.
Example:
```
{minPlayers 2}
```
See: [maxPlayers](#maxplayers).

### maxPlayers
Where: game card, `map.info`, `<mode>.info`.
Type: number.
Values: 2 to `mp_maxPlayers` (16 by default); rounded up to an even number.
Does: The largest number of players on the map.
Limits: An odd number is rounded up and an out-of-range number is clamped. The number of spawn points is not checked against it.
Example:
```
{game {maxPlayers 4} {texMod 2}}
```
See: [map.info](#mapinfo) in [section 15](#15-map-files).

### texMod
Where: game card, `map.info`.
Type: number.
Values: a texture variant number.
Does: Picks the texture variant of the map's objects (unconfirmed).
Limits: None known.
Example:
```
{texMod 2}
```
See: [TexMod](#texmod-1).

### parameters
Where: game card.
Type: text: `"key=value;key=value"`.
Values: per class: `combat` takes `freezeTime`; `captureflag` and `battle_zones` take `freezeTime`, `flag_capture_time`, `flag_release_time`, `flag_capture_factor`, and `battle_zones` also `points_table` written as `share/points,...`; `frontline` takes `score_flag`, `score_phase`, `score_time`, `score_defBonus`, `flag_time`, `flag_time_small`, `rounds`, `bonusTime` and `freezeTime` written as `players:seconds,...`.
Does: Passes rule settings to the game class.
Limits: A `$section` prefix applies to the names that follow it; a value that starts with `;` is appended to the card's own value.
Example:
```
{parameters "freezeTime=30;flag_capture_time=20"}
```
<!-- goh: GHMIS-96 GHMIS-98 GHMIS-77 GHMIS-78 GHMIS-79 GHMIS-97 GHMIS-100 -->
Gates of Hell: the frontline `freezeTime` table has no effect there (the freeze is `preparationTime`), and a frontline mode without `rounds` probably plays one round instead of two. More parameters exist there ([Gates of Hell only](#gates-of-hell-only)).
See: [`<mode>.info`](#modeinfo) in section 15; [settings](#settings); [class](#class).

### settings
Where: game card.
Type: block of lobby settings.
Values: the keys in this section that follow.
Does: The lobby options and their starting values.
Limits: Unknown keys are skipped silently.
Example:
```
{settings {fogOfWar fog_realistic} {difficulty multiplayer} {gameDuration "90 min"}}
```
<!-- goh: GHMIS-01 GHMIS-04 GHMIS-70 GHMIS-71 GHMIS-72 GHMIS-73 GHMIS-74 GHMIS-75 GHMIS-76 GHMIS-143 -->
Gates of Hell: more settings exist there, such as `manualControlMode`, `assignReinforcementsToPlayer`, `loseOnZeroPoints` and `pauseDuringPreparation` ([Gates of Hell only](#gates-of-hell-only)); this game skips them. The rejoin setting of the 64-bit build is not there.
See: [chapter 12, section 1](12-missions-and-multiplayer-setup.md#game-card-keys); [options](#options); [gameDuration](#gameduration).

### options
Where: game card, `settings`.
Type: word list.
Values: names of lobby settings.
Does: Lists the settings shown in the lobby. `optionsAdvanced` and `optionsRanked` do the same for the advanced and ranked views.
Limits: None known.
Example:
```
{options "gameDuration fogOfWar resourceAmount"}
```
See: [settings](#settings).

### fogOfWar
Where: game card, `settings`.
Type: word.
Values: `fog_off`, `fog_realistic`.
Does: Starting fog of war setting.
Limits: Vanilla writes the word, not a number.
Example:
```
{fogOfWar fog_realistic}
```
See: [Fog](#fog).

### difficulty (setting)
Where: game card, `settings`.
Type: word.
Values: vanilla uses `multiplayer`.
Does: The difficulty the multiplayer game runs at.
Limits: None known.
Example:
```
{difficulty multiplayer}
```
See: [difficulty](#difficulty) (term).

### gameDuration
Where: game card, `settings`.
Type: text.
Values: a fixed lobby list from `"10 min"` to `"120 min"`.
Does: Starting game length.
Limits: Values that are not in the list cannot be selected.
Example:
```
{gameDuration "90 min"}
```
<!-- goh: GHNET-41 -->
Gates of Hell: 14 lengths from 10 to 120 minutes; its 35, 45, 70 and 80 minute lengths are unknown here.
See: [settings](#settings).

### resourceAmount
Where: game card, `settings`.
Type: number.
Values: chosen from the budget's `speedset` list, clamped to `limitmin` and `limitmax`.
Does: The lobby value that a `custom` budget uses as its end value.
Limits: Only budgets in `custom`, `with_update` and `without_update` mode read it.
Example:
```
{resourceAmount 1000}
```
See: [section 12](#12-budgets).

### preparationTime
Where: game card, `settings`.
Type: number (seconds).
Values: within `preparationTimeMin` and `preparationTimeMax`.
Does: The countdown before the game starts; unit cooldowns start after it.
Limits: In test mode and replays the countdown is 0.
Example:
```
{preparationTime 30}
```
<!-- goh: GHMIS-71 GHMIS-96 -->
Gates of Hell: with the setting `pauseDuringPreparation` off the battle runs during the countdown; here the game always holds for this time. It is also the frontline freeze time there.
See: [charge](#charge); [settings](#settings).

### useUnitLevelRestrictions
Where: game card, `settings`.
Type: number (switch).
Values: 0 or 1.
Does: With 0, the rank a unit needs (`level`) is ignored.
Limits: Rank is also ignored in test mode, ranked games and for bots.
Example:
```
{useUnitLevelRestrictions 0}
```
See: [level](#level).

### veterancyMode
Where: game card, `settings`.
Type: word.
Values: `all`, `beginners`, `veterans`.
Does: Which players may join by experience.
Limits: None known.
Example:
```
{veterancyMode all}
```
See: [settings](#settings).

### teamSettings
Where: game card.
Type: block.
Values: `teamsMode`, `armySelectionMode`, `equalizeTeams`, `teams`, `alliances`.
Does: How players are put into teams and which armies they may pick.
Limits: `minTeamPlayers` and `maxTeamPlayers` from the template file are not read.
Example:
```
{teamSettings {teamsMode normal} {armySelectionMode alliance}}
```
See: [teams](#teams).

### teamsMode
Where: game card, `teamSettings`.
Type: word.
Values: `teammatch`, `normal`, `default`, `deathmatch`, `none`.
Does: The team arrangement of the mode.
Limits: Vanilla writes the word, not a number. A bare `{teammatch}` at the game level is not a key and is skipped.
Example:
```
{teamsMode normal}
```
See: [teamSettings](#teamsettings).

### armySelectionMode
Where: game card, `teamSettings`.
Type: word.
Values: `alliance`, `team`, `player`, `default`.
Does: Whether armies are chosen per alliance, team or player.
Limits: None known.
Example:
```
{armySelectionMode alliance}
```
See: [alliances](#alliances).

### teams
Where: game card, `teamSettings`.
Type: block: `{teams {"a" {title} {armies} {minTeamSlots} {maxTeamSlots} {aiTeamPlayers} {hidden}}}`.
Values: one block per team, `a` and `b`.
Does: Names each team and sets its armies and slot counts.
Limits: None known.
Example:
```
{teams {"a" {title "mp/team_a"} {armies "usa eng"}}}
```
See: [alliances](#alliances).

### alliances
Where: game card, `teamSettings`.
Type: block: `{alliances {"<name>" {title} {armies} {icon}}}`.
Values: `armies` either repeated (`{armies "usa"}{armies "eng"}`, which add up) or one string (`"usa grm"`).
Does: Groups armies into alliances the lobby offers.
Limits: Every army named must exist in `set/multiplayer/armies`.
Example:
```
{alliances {"allies" {title "mp/allies"} {armies "usa"} {armies "eng"} {icon "allies"}}}
```
See: [section 14](#14-armies).

### ranked
Where: game card, `map.info`.
Type: block: `{ranked {enabled} {minPlayers n} {maxPlayers n}}`.
Values: player counts from 2 to `mp_maxPlayers`, rounded up to even.
Does: Allows ranked games on the mode or map.
Limits: Flat keys `rankedMinPlayers` and `rankedMaxPlayers` are skipped silently by this build.
Example:
```
{ranked {enabled} {minPlayers 2} {maxPlayers 4}}
```
See: [maxPlayers](#maxplayers).

### mission_options (game card)
Where: game card.
Type: block.
Values: option names.
Does: The lobby group of mission options that the `mission_option` term tests.
Limits: None known.
Example:
```
{mission_options {mission_option1}}
```
See: [mission_option](#mission_option) (term).

### presets
Where: game card.
Type: block, usually filled by `(include "presets.inc")` inside `{game}`.
Values: preset blocks (section 11).
Does: The rule sets the lobby offers for the mode.
Limits: None known.
Example:
```
{game ... (include "presets.inc")}
```
<!-- goh: GHMIS-144 -->
Gates of Hell: when the mode is changed in the lobby, the era (`unitMode`) of the previous preset is kept and the mode's first preset with that era is taken.
See: [section 11](#11-presets-and-team-data); [chapter 12, section 2](12-missions-and-multiplayer-setup.md#2-presets).

## 11. Presets and team data

Used in: [chapter 12, section 2](12-missions-and-multiplayer-setup.md#2-presets) and [section 6](12-missions-and-multiplayer-setup.md#6-bots); [chapter 10, section 8](10-ai-and-bots.md#the-data-file); Part I [Missions and multiplayer modes](p10-missions-and-modes.md) and [Bots: what they buy and how they play](p11-bots.md).

A preset is `{"<name>" {gameMode} {unitMode} {specMode} {apply ...} {common {...}} {teams {a {...} b {...}}} {bots {...}}}`. The name is only a unique key; prefixes such as `c:` are not read. The `common`, team and bot blocks share the same data keys. An empty field in a team or bot block falls back to `common`, and AI players use their difficulty name (`easy`, `normal`, `hard`, `heroic`) as their team key.

### gameMode
Where: preset.
Type: text.
Values: a name shown in the lobby "Game settings" list; `test` is the built-in test mode.
Does: The lobby entry this preset belongs to.
Limits: In test mode the countdown is 0 and rank checks are skipped.
Example:
```
{gameMode "standard"}
```
See: [unitMode](#unitmode).

### unitMode
Where: preset.
Type: text.
Values: a name for the era or teams list.
Does: The lobby entry for the era or teams choice.
Limits: None known.
Example:
```
{unitMode "44-45"}
```
See: [apply](#apply).

### specMode
Where: preset.
Type: text.
Values: a name for the command point choice.
Does: The lobby entry for the command point choice.
Limits: None known.
Example:
```
{specMode "cp_120"}
```
See: [commandPoints](#commandpoints).

### apply
Where: preset.
Type: text, with an optional `remove` before it.
Values: the name, without folder or extension, of a file `set/multiplayer/units/<name>.set` whose root block is `{units ...}`.
Does: Loads that unit list on top of the base list. With `remove`, every unit not marked `basic` is first flagged for removal.
Limits: Vanilla presets do not use `apply`; they choose units with `unitset` and tags. Of the vanilla unit files only `common.set` and `vehicles_xnotanks.set` have their own `{units}` root; the others (`soldiers`, `squads`, `vehicles`, `vehicles_eng`, `vehicles_ger`, `vehicles_ger2`, `vehicles_jap`, `vehicles_rus`, `vehicles_usa`, `vehicles_x`) are pieces included by those two, not unit lists of their own.
Example:
```
{apply "vehicles_xnotanks"}
{apply remove "my_mod_units"}
```
<!-- goh: GHMIS-89 -->
Gates of Hell: loading unit sets first drops every unit loaded before, so `apply ... remove` probably has nothing left to act on there.
See: [basic](#basic); [unitset](#unitset); [remove](#remove).

### common
Where: preset.
Type: block of data keys.
Values: the data keys below.
Does: Data that applies to every team unless the team or bot block says otherwise.
Limits: See `balancingFactorBonus`.
Example:
```
{common {commandPoints "*=120"} {budgets {...}}}
```
See: [teams (preset)](#teams-preset).

### teams (preset)
Where: preset.
Type: block: `{teams {a {...} b {...}}}`.
Values: data keys per team.
Does: Gives the two teams different data, for uneven battles.
Limits: None known.
Example:
```
{teams {a {unitLimits "tank=2"}} {b {unitLimits "tank=4"}}}
```
See: [common](#common).

### bots
Where: preset.
Type: block: `{bots {easy {...}} {normal {...}} {hard {...}} {heroic {...}}}`.
Values: data keys per bot difficulty.
Does: Changes the data for bots of each difficulty. The stock bot file gives bots more command points and manpower at higher difficulty and sets their charge factors to `*=0`, so bots have no cooldowns.
Limits: See `balancingFactorBonus`.
Example:
```
{bots {hard {chargeFactors {value "*=0"}} {balancingFactorBonus {cp 1.25} {mp 1.5}}}}
```
<!-- goh: GHMIS-82 -->
Gates of Hell: the entries are named `<difficulty>_<team>`; such an entry is not matched here and the bot falls back to `common`.
See: [chapter 10, section 8](10-ai-and-bots.md#the-data-file); [Reference 12, section 7](r12-bot-lua-and-console.md#7-bot-difficulty); [balancingFactorBonus](#balancingfactorbonus); [chargeFactors](#chargefactors); Part I [Bots: what they buy and how they play](p11-bots.md).

### unitset
Where: preset data.
Type: block: `{unitset {value "inc1|inc2^exc1|exc2"}}`, or `{include}`, `{exclude}`, `{available}`.
Values: tag lists; `|` separates tags, `^` starts the exclude list.
Does: Picks which units may be bought: a unit passes if it has any include tag, no exclude tag, and the player's army tag.
Limits: An exclude-only value such as `"^x"` matches nothing, because the include list is empty; write `all^x` and give every unit an `all` tag.
Example:
```
{unitset {value "inf|tank^late"}}
```
<!-- goh: GHMIS-90 -->
Gates of Hell: a value with several `&` parts uses the last part; here only the first part counts.
See: [tags (unit)](#tags-unit); [chapter 12, section 2](12-missions-and-multiplayer-setup.md#unit-sets); [Reference 12, `period`](r12-bot-lua-and-console.md#period).

### commandPoints
Where: preset data.
Type: text: `"tag=table;tag=table"`.
Values: `*` is the main pool; a table is a single limit or `seconds:limit,seconds:limit` steps that raise the limit as the game goes on.
Does: Sets the command point limits. A unit is checked against the main pool and the first pool, in list order, whose tag it has. Buying takes the squad's total `cp`; each member's death gives back its own `cp`.
Limits: The values are scaled by `balancingFactorBonus` `cp` and by team balance.
Example:
```
{commandPoints "*=0:60,300:120,900:180;infantry=0:40"}
```
<!-- goh: GHMIS-91 -->
Gates of Hell: a table read a second time replaces the first; here the two are merged.
See: [cp](#cp) (unit); [chapter 12, section 2](12-missions-and-multiplayer-setup.md#command-points).

### unitLimits
Where: preset data.
Type: text: `"tag=N;tag=N"`.
Values: whole numbers.
Does: Caps how many units with a tag a player may buy. Only the first tag in list order that the unit has is used.
Limits: It counts purchases only; deaths and refunds never lower the count. Only `;` separates entries; a `,` breaks the parse and silently drops the later limits.
Example:
```
{unitLimits "heavy=2;tank=6"}
```
See: [tags (unit)](#tags-unit).

### chargeFactors
Where: preset data.
Type: block: `{chargeFactors {value "tag=f;*=f"} {available ...}}`.
Values: factors per tag; the first matching tag in list order wins, else `*`, else 1.
Does: Scales each unit's cooldown (`charge`).
Limits: `available` is read only by the lobby unit browser and does not change the game.
Example:
```
{chargeFactors {value "tank=1.5;*=1"}}
```
<!-- goh: GHMIS-83 GHMIS-72 -->
Gates of Hell: the list of choices is called `customize` instead of `available`, and the lobby setting `chargeFactorMod` scales the factors.
See: [charge](#charge); [balancingFactorBonus](#balancingfactorbonus); [chapter 12, section 2](12-missions-and-multiplayer-setup.md#charge-factors-and-balancing).

### balancingFactorBonus
Where: preset data.
Type: block: `{balancingFactorBonus {cp} {mp} {payback}}`.
Values: numbers, default 1.
Does: Multiplies command point limits (`cp`), the budget start and end (`mp`) and the payback rate (`payback`). It is also multiplied by team balance (largest team size divided by this team's size), so a smaller team gets more.
Limits: In a team or bot block it falls back to `common` only when that block's `chargeFactors` value is empty; always set `chargeFactors` in a block that sets balancing.
Example:
```
{balancingFactorBonus {cp 1.5} {mp 2.0}}
```
<!-- goh: GHMIS-81 GHGPL-08 -->
Gates of Hell: the keys are `cp`, `mpStart`, `mpFinish`, `payback`, `periodicFactor`, `chargeDelay` and `charge`; `mp` is gone. A team block there keeps its own bonus even without `chargeFactors`.
See: [bots](#bots); [payback](#payback); [chargeFactors](#chargefactors); [chapter 12, section 2](12-missions-and-multiplayer-setup.md#charge-factors-and-balancing).

### budgets
Where: preset data.
Type: block of named budgets.
Values: section 12.
Does: Sets how manpower (the purchase points) is earned.
Limits: See section 12.
Example:
```
{budgets {"infantry" {buttons "squad1 squad2"} {mode standard} {resource {...}}}}
```
See: [section 12](#12-budgets).

## 12. Budgets

Used in: [chapter 12, section 3](12-missions-and-multiplayer-setup.md#3-budgets-and-income); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

A budget is a named block inside `budgets`. You choose the name, but the name `vehicle` is fixed for some uses: the bot's `Income()`, the command point and manpower display, and some modes look up the budget named `vehicle`.

### buttons
Where: budget.
Type: word list.
Values: unit `button` tags such as `squad1 squad2 v1 v2 v22 v3` to `v12`, `sf`, `hero`.
Does: Says which units this budget pays for. A unit's `cost` is charged to the first budget that lists its button; a unit no budget lists is free.
Limits: None known.
Example:
```
{buttons "v1 v2 v3"}
```
See: [button](#button) (unit).

### mode (budget)
Where: budget.
Type: word.
Values: `standard`, `custom`, `with_update`, `without_update`, `fullpayback`.
Does: `standard` grows from `start` to `finish` over `growTime` seconds. `custom` does the same, but `finish` is the lobby `resourceAmount`. `with_update` adds the lobby value every `period` seconds, up to `finish`. `without_update` sets start and finish to the lobby value. `fullpayback` starts at `start`, and the rest arrives only as payback.
Limits: `standard` needs `period`, `speed`, `limitmin` and `limitmax` all 0, or it logs "Invalid parameter value". `custom` and `fullpayback` need `period` and `speed` at 0. `without_update` needs `speed` at 0.
Example:
```
{mode standard}
```
See: [resource](#resource).

### tag (budget)
Where: budget.
Type: word.
Values: `special` or `default`.
Does: `special` keeps separate statistics and shows the hint key `mp/scene/hint_cost2/<tag>`.
Limits: None known.
Example:
```
{tag default}
```
See: [buttons](#buttons).

### resource
Where: budget.
Type: block.
Values: `start`, `finish`, `period`, `speed`, `limitmin`, `limitmax`, `speedset`, `growTable`, `growTime`, `restoreBegin`, `restoreEnd`, `payback`.
Does: The numbers of the budget.
Limits: See each key.
Example:
```
{resource {start 300} {finish 3000} {growTime 1800} {payback {cp "0	100"} {restore "1	0.5"}}}
```
See: [mode (budget)](#mode-budget).

### start
Where: budget `resource`.
Type: number.
Values: manpower at game start.
Does: The amount the budget starts with.
Limits: Scaled by `balancingFactorBonus` `mp` and team balance.
Example:
```
{start 300}
```
<!-- goh: GHGPL-12 -->
Gates of Hell: multiplied by the balancing key `mpStart`.
See: [finish](#finish); [chapter 12, section 3](12-missions-and-multiplayer-setup.md#3-budgets-and-income).

### finish
Where: budget `resource`.
Type: number.
Values: manpower at the end of `growTime`.
Does: The amount the budget grows to. After `growTime` the budget catches up, so unspent manpower is not lost.
Limits: In `custom` mode the lobby value replaces it.
Example:
```
{finish 3000}
```
<!-- goh: GHGPL-12 -->
Gates of Hell: multiplied by the balancing key `mpFinish`, and a budget within 0.1 of it snaps to it.
See: [growTime](#growtime); [start](#start).

### growTime
Where: budget `resource`.
Type: number (seconds).
Values: seconds.
Does: How long the budget takes to grow from `start` to `finish`.
Limits: `with_update` and `without_update` need it left at its default.
Example:
```
{growTime 1800}
```
See: [growTable](#growtable).

### period
Where: budget `resource`.
Type: number (seconds).
Values: seconds; 0 in every mode except `with_update`.
Does: In `with_update` mode, how often the lobby amount is added. With 0, the amount is spread per second as the amount divided by 60.
Limits: Must be 0 in `standard`, `custom` and `fullpayback`.
Example:
```
{period 60}
```
See: [mode (budget)](#mode-budget).

### speed
Where: budget `resource`.
Type: number.
Values: must be 0 in every mode except `with_update`.
Does: An income rate setting; in the other modes the rate is worked out from start, finish and growTime.
Limits: A non-zero value where it must be 0 logs "Invalid parameter value".
Example:
```
{speed 0}
```
<!-- goh: GHGPL-12 -->
Gates of Hell: a negative speed counts as 0.
See: [period](#period).

### limitmin
Where: budget `resource`.
Type: number.
Values: the lowest lobby value.
Does: Lower end of the lobby slider for `resourceAmount`.
Limits: Must be 0 in `standard` mode.
Example:
```
{limitmin 500}
```
See: [limitmax](#limitmax).

### limitmax
Where: budget `resource`.
Type: number.
Values: the highest lobby value.
Does: Upper end of the lobby slider for `resourceAmount`.
Limits: Must be 0 in `standard` mode.
Example:
```
{limitmax 5000}
```
See: [speedset](#speedset).

### speedset
Where: budget `resource`.
Type: number list.
Values: numbers separated by spaces.
Does: The choices the lobby offers for `resourceAmount`.
Limits: None known.
Example:
```
{speedset "1000 2000 3000"}
```
See: [resourceAmount](#resourceamount).

### growTable
Where: budget `resource`.
Type: number list.
Values: numbers separated by spaces.
Does: Shapes income over `growTime`: the time is split into as many steps as there are numbers, and each step's income is in proportion to its number. The total still comes to `finish` minus `start`.
Limits: None known.
Example:
```
{growTable "1 2 3 3 2"}
```
See: [growFactors](#growfactors).

### growFactors
Where: budget.
Type: text: `"cpSpent/factor;..."`.
Values: pairs of command points in use and a factor.
Does: Speeds income up or down with the command points a player has in use; the factor is interpolated between pairs.
Limits: None known.
Example:
```
{growFactors "0/1;60/0.8;120/0.6"}
```
See: [growTable](#growtable).

### restoreBegin
Where: budget `resource`.
Type: number.
Values: a number.
Does: Nothing in practice: the value is worked out but never used.
Limits: With `with_update` or `without_update` it must be 0, or the budget is rejected with "Invalid parameter value".
Example:
```
{restoreBegin 0}
```
See: [restoreEnd](#restoreend).

### restoreEnd
Where: budget `resource`.
Type: number.
Values: a number.
Does: Nothing in practice, like `restoreBegin`.
Limits: The same rule as `restoreBegin`.
Example:
```
{restoreEnd 0}
```
See: [restoreBegin](#restorebegin).

### payback
Where: budget `resource`.
Type: block: `{payback {cp "..."} {restore "..."}}`.
Values: `cp` command point steps in rising order; `restore` a rate for each step; the two lists must be the same length.
Does: When a bought unit dies or is lost, a share of its cost goes into a payback pool, which flows back at the `restore` rate of the highest `cp` step at or below the command points in use. Only `standard` and `custom` budgets pay back.
Limits: The numbers in `cp` and `restore` must be separated by tab characters. Spaces make the list one token and give a size mismatch error.
Example:
```
{payback {cp "0	60	120"} {restore "1	0.75	0.5"}}
```
See: [balancingFactorBonus](#balancingfactorbonus).

## 13. Units

Used in: [chapter 12, section 4](12-missions-and-multiplayer-setup.md#4-units); Part I [Add a new unit from an existing one](p03-add-a-unit.md), [Change a unit's numbers](p02-change-unit-numbers.md) and [Missions and multiplayer modes](p10-missions-and-modes.md).

Unit lists are `{units {"<name>" ...}}` blocks in `set/multiplayer/units/`. The game loads the first that exists of `units/<map game name>.set`, `units/<class>.set` and `units/common.set`, then any preset `apply` files on top. Two entries with the same name are merged, and their tags add up. Vanilla has no list per game mode: every mode falls back to `common.set`, which includes `soldiers.set`, `squads.set` and `vehicles.set`; `vehicles.set` in turn includes `vehicles_eng`, `vehicles_ger`, `vehicles_ger2`, `vehicles_jap`, `vehicles_rus`, `vehicles_usa` and `vehicles_x`. `vehicles_xnotanks.set` is a second complete list. The game mode cards themselves are `set/multiplayer/games/combat.set`, `captureflag.set`, `cooperative.set`, `frontline.set`, `battle_zones.set` and `battle_zones_8x8.set`.

### charge
Where: unit entry.
Type: number (seconds).
Values: default 0.
Does: The cooldown after a purchase. The real time is `charge` times the charge factor; at game start the lock is `charge` times the factor times (1 minus `fore`).
Limits: Cooldowns start after the countdown. A unit that becomes available later starts a full cooldown, with no `fore`.
Example:
```
{charge 120}
```
<!-- goh: GHMIS-86 -->
Gates of Hell: written as `{charge {delay N} {interval N}}`: a first wait once at game start, then a cooldown after each purchase. Convert the form both ways when you port units.
See: [fore](#fore); [chargeFactors](#chargefactors); Part I [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

### fore
Where: unit entry.
Type: number.
Values: default 0; 1 means ready at start; may be negative for a longer first wait.
Does: How far the first cooldown has already run at game start.
Limits: None known.
Example:
```
{fore 0.5}
```
<!-- goh: GHMIS-85 -->
Gates of Hell: not read; the cooldown always runs in full.
See: [charge](#charge).

### group
Where: unit entry.
Type: word.
Values: a tag.
Does: Buying any unit of the group restarts the cooldown of every available unit in the same group, for that side.
Limits: None known.
Example:
```
{group "heavy"}
```
See: [icon](#icon).

### icon
Where: unit entry.
Type: number.
Values: default 0.
Does: Units in the same group with the same non-zero icon form a sequence: only one is shown, and the next appears after a purchase.
Limits: None known.
Example:
```
{icon 3}
```
See: [group](#group-1).

### button
Where: unit entry.
Type: word.
Values: a button tag listed by a budget.
Does: Picks the purchase menu category and the budget that pays.
Limits: A unit whose button no budget lists is free.
Example:
```
{button v3}
```
See: [buttons](#buttons).

### cost
Where: unit entry.
Type: number.
Values: default 1.
Does: Manpower charged when bought.
Limits: Charged only if a budget lists the unit's button.
Example:
```
{cost 450}
```
<!-- goh: GHMIS-84 -->
Gates of Hell: the default is 0 instead of 1, and more cost keys exist there ([Gates of Hell only](#gates-of-hell-only)).
See: [buttons](#buttons); [score](#score); Part I [Change a unit's numbers](p02-change-unit-numbers.md).

### cp
Where: unit entry.
Type: number.
Values: default 1.
Does: Command points the unit uses. A squad's total is the sum over its `content`, where `*` counts the card's own `cp`.
Limits: None known.
Example:
```
{cp 6}
```
See: [commandPoints](#commandpoints).

### score
Where: unit entry.
Type: number.
Values: a number.
Does: Kill score. In combat mode the killer's team gets the victim's score; killing a friend takes score away, and a unit leaving the map takes away its own score.
Limits: None known.
Example:
```
{score 40}
```
<!-- goh: GHGPL-11 GHMIS-79 -->
Gates of Hell: a unit with `score 0` scores by its price times `score_factor`, and the mode parameters can multiply the kill score.
See: [chapter 12, section 4](12-missions-and-multiplayer-setup.md#4-units); [cost](#cost); [Reference 12, `mp_userUnits`](r12-bot-lua-and-console.md#mp_userunits).

### cw
Where: unit entry.
Type: number.
Values: default 1.
Does: Capture weight: how much the unit counts when capturing a flag.
Limits: None known.
Example:
```
{cw 2}
```
See: `map_point` keys in [section 15](#15-map-files).

### level
Where: unit entry.
Type: number.
Values: default 1.
Does: The player rank needed to buy the unit.
Limits: Ignored when `useUnitLevelRestrictions` is 0, in test mode, in ranked games and for bots.
Example:
```
{level 3}
```
<!-- goh: GHMIS-85 -->
Gates of Hell: not read; there is no rank lock.
See: [useUnitLevelRestrictions](#useunitlevelrestrictions).

### content
Where: unit entry.
Type: text: `"name[:count] ... ( crew[:n] ) *"`.
Values: a name that is a soldier type spawns humans, any other name spawns an entity; `*` is the card's own name; `( )` after a vehicle holds its crew; `trailer` inside the brackets hooks to the vehicle before it. Empty means the card's own name.
Does: What the purchase puts on the map.
Limits: None known.
Example:
```
{content "willys ( riflemans(usa):2 )"}
```
See: [breed](#breed).

### tags (unit)
Where: unit entry.
Type: word list.
Values: tags; the unit's own name is added as a tag.
Does: The army tag (it must match the player's army), era tags and the categories used by `unitset`, `unitLimits`, `chargeFactors` and command point pools.
Limits: Tags of entries with the same name are merged, not replaced.
Example:
```
{tags "usa tank medium 44-45"}
```
See: [unitset](#unitset).

### info
Where: unit entry.
Type: word.
Values: a key.
Does: The tooltip text key `info/squad/<info>` or `info/entity/<info>`.
Limits: None known.
Example:
```
{info "sherman"}
```
See: [chapter 14](14-localization.md).

### breed
Where: unit entry.
Type: switch.
Values: present or absent.
Does: Marks the card as a soldier card.
Limits: None known.
Example:
```
{breed}
```
See: [content](#content).

### basic
Where: unit entry.
Type: switch.
Values: present or absent.
Does: Keeps the unit when a preset uses `apply remove`.
Limits: None known.
Example:
```
{basic}
```
See: [apply](#apply).

### not_for_sale
Where: unit entry.
Type: switch.
Values: present or absent.
Does: Hides the unit from the purchase menu.
Limits: None known.
Example:
```
{not_for_sale}
```
<!-- goh: GHMIS-92 GHGPL-05 -->
Gates of Hell: the purchase itself is refused as well; here a not-for-sale card can get past the cost check.
See: [remove](#remove); [Reference 12, `Spawn`](r12-bot-lua-and-console.md#spawn).

### remove
Where: unit entry.
Type: switch.
Values: present or absent.
Does: Deletes the entry with that name once it has been read, so a later file can take a unit out.
Limits: None known.
Example:
```
{"old_tank" {remove}}
```
See: [apply](#apply).

## 14. Armies

Used in: [chapter 12, section 5](12-missions-and-multiplayer-setup.md#5-armies); Part I [Missions and multiplayer modes](p10-missions-and-modes.md).

### id
Where: army entry in `set/multiplayer/armies`.
Type: number.
Values: stock ids are 0 usa, 1 ger, 2 rus, 3 eng, 4 jap, 5 ger2; a negative id makes the army not selectable.
Does: The army's number. Player ranks are kept per army.
Limits: Duplicate ids load without complaint.
Example:
```
{army {id 3} {title "mp/army/eng"} {icon "interface/army/eng"}}
```
<!-- goh: GHMIS-10 -->
Gates of Hell: an id above 99 probably stops the game there (not confirmed).
See: [title](#title); [Reference 12, `army`](r12-bot-lua-and-console.md#army).

### title
Where: army entry.
Type: text key.
Values: a localization key.
Does: The army name shown in the lobby.
Limits: None known.
Example:
```
{title "mp/army/usa"}
```
<!-- goh: GHMIS-93 -->
Gates of Hell: ignored; the name is always `mp/army/<name>`.
See: [chapter 14](14-localization.md); [id](#id); Part I [Add or change text and translate it](p07-text-and-translation.md).

### icon (army)
Where: army entry.
Type: text (path).
Values: an image path.
Does: The army icon.
Limits: None known.
Example:
```
{icon "interface/army/usa"}
```
See: [title](#title).

### appid_base
Where: army entry.
Type: number list.
Values: Steam app ids.
Does: Makes the army need one of those Steam DLCs.
Limits: None known.
Example:
```
{appid_base 123 456}
```
See: [id](#id).

### flag
Where: army entry.
Type: text.
Values: any.
Does: Nothing: this key is not read.
Limits: Setting it has no effect.
Example:
```
{flag "usa"}
```
See: [icon (army)](#icon-army).

## 15. Map files

Used in: [chapter 13, section 3](13-maps.md#3-the-map-file), [section 6](13-maps.md#6-map-points-spawns-and-flags) and [section 8](13-maps.md#8-getting-into-the-lobby); [chapter 12, section 8](12-missions-and-multiplayer-setup.md#8-giving-a-map-another-mode); Part I [Copy and change a map](p09-copy-and-change-a-map.md).

A multiplayer map lives in `map/multi/<name>/` (sub-folders are allowed). The game walks every `.mi` file under `map/multi/`. Each `.mi` is matched to a game card by its file name; a file that matches none logs `Mission '<path>' is skipped - game type(<title>) is undefined`. The lobby title of a map is the localization key `mission/<folder>/name`.

### Land
Where: `map` file.
Type: block: `{Land {Position 0 0}}`.
Values: a position.
Does: The terrain entity. Heights and the mesh come from `map.net` and `map.ply`.
Limits: None known.
Example:
```
{Land {Position 0 0}}
```
<!-- goh: GHMAP-06 -->
Gates of Hell: new height map cells are 5 units instead of 10.
See: [chapter 13, section 3](13-maps.md#3-the-map-file); [Clips](#clips).

### Clips
Where: `map` file.
Type: block: `{Clips {"<name>" {world x0 y0 x1 y1} {camera ...} {pather ...} {distance a b} {viewAngle a b}}}`.
Values: `"[auto]"` is the default clip. `world` is the map bounds, `camera` the camera area, `pather` the area the pathfinding grid covers, `distance` the zoom range and `viewAngle` the tilt range.
Does: Named playable areas. Extra named clips can be chosen per mode with `set_clip`.
Limits: `world` must lie inside the terrain. The old single `{Clip}` block still loads but logs a warning. Units outside `pather` refuse to move (unconfirmed).
Example:
```
{Clips {"[auto]" {world -1000 -1000 1000 1000} {camera -900 -900 900 900}
	{pather -900 -900 900 900} {distance 200 800} {viewAngle 20 50}}}
```
See: [set_clip](#set_clip).

### Ocean
Where: `map` file.
Type: block.
Values: water settings.
Does: Water on the map; an empty block is dropped when saved.
Limits: None known.
Example:
```
{Ocean ...}
```
<!-- goh: GHMAP-09 GHMAP-10 -->
Gates of Hell: the block has more keys there (`ww_environment_mode` and others), and wave values are clamped when the map loads.
See: [chapter 13, section 3](13-maps.md#3-the-map-file); [Land](#land).

### Position
Where: inside an `{Entity}` block.
Type: numbers: `x y`, optionally `z`.
Values: map units (20 map units are 1 metre).
Does: Where the entity stands. Leave out `z` and it sits on the ground.
Limits: None known.
Example:
```
{Position 13.5 15055.1}
```
See: [xform](#xform).

### xform
Where: inside an `{Entity}` block.
Type: tokens.
Values: `zl <degrees>` (turn about its own up axis), `zw`, `y`, `scale <factor>` only.
Does: Turns and scales the entity.
Limits: Any other token logs `unexpected token`.
Example:
```
{xform zl -88.18}
{xform scale 0.75}
```
See: [Position](#position).

### TexMod
Where: inside an `{Entity}` block.
Type: text.
Values: a texture variant name.
Does: Picks a texture variant for that one entity.
Limits: None known.
Example:
```
{TexMod "winter"}
```
See: [texMod](#texmod).

### map.info
Where: the map folder.
Type: file with a `{game ...}` block; first line `;SDL`.
Values: any game card key, most often `maxPlayers`, `texMod` and `ranked`.
Does: Overrides game card keys for this map in every mode.
Limits: Unknown keys are skipped silently.
Example:
```
{game {maxPlayers 4} {texMod 2}}
```
See: [section 10](#10-game-mode-card).

### <mode>.info
Where: the map folder, named after a mode, for example `combat.info`.
Type: file with a `{game ...}` block.
Values: any game card key, usually `parameters` and `maxPlayers`.
Does: Overrides game card keys for this map in one mode; it is laid on after `map.info`.
Limits: None known.
Example:
```
{game {maxPlayers 8} {parameters "freezeTime=20"}}
```
See: [parameters](#parameters).

### name (map point)
Where: `map_point` extender.
Type: word.
Values: a point id such as `a1`, `b2`, `f3`.
Does: The name spawn points and flags are found by.
Limits: None known.
Example:
```
{Extender "map_point" {name f1} ...}
```
<!-- goh: GHMIS-44 -->
Gates of Hell: map points are sorted by name when the mission starts, so the names set the order of spawn choice there.
See: [team](#team); [order](#order-1); [chapter 13, section 6](13-maps.md#6-map-points-spawns-and-flags).

### team
Where: `map_point` extender.
Type: word.
Values: `a` or `b`; empty means a neutral flag.
Does: The team the spawn point belongs to.
Limits: None known.
Example:
```
{team a}
```
See: [order](#order-1).

### order
Where: `map_point` extender.
Type: number.
Values: whole numbers; 0 matches any slot.
Does: Players get spawn points by `order` within their team.
Limits: None known.
Example:
```
{order 3}
```
See: [team](#team).

### phase
Where: `map_point` extender.
Type: number.
Values: whole numbers.
Does: The game phase the point belongs to, used by frontline chains.
Limits: None known.
Example:
```
{phase 0}
```
See: [class](#class).

### zoneA
Where: `map_point` extender.
Type: number (metres).
Values: at least 1 metre; spawn points use 0.
Does: The capture radius for team A. Twelve metres is a common flag size.
Limits: A value below 1 metre is raised to 1, which is too small for a flag ever to change hands. Zone circles are drawn only before the mission starts.
Example:
```
{zoneA 12}
```
<!-- goh: GHMAP-04 GHMAP-03 -->
Gates of Hell: the radius is used as given, with no 1 metre minimum and no scaling, and a point can name a zone shape with `zoneId` instead.
See: [zoneB](#zoneb); [Reference 12, `mp_mapPointZones`](r12-bot-lua-and-console.md#mp_mappointzones).

### zoneB
Where: `map_point` extender.
Type: number (metres).
Values: at least 1 metre; when absent, team B uses `zoneA`.
Does: The capture radius for team B.
Limits: The same as `zoneA`.
Example:
```
{zoneB 12}
```
<!-- goh: GHMAP-04 -->
Gates of Hell: as for `zoneA`, the radius is used as given.
See: [zoneA](#zonea).

### show
Where: `map_point` extender.
Type: word.
Values: `None`, `Scene`, `Minimap`, `All`.
Does: Where the point is shown.
Limits: None known.
Example:
```
{show All}
```
See: [visor](#visor).

### visor
Where: `map_point` extender.
Type: word.
Values: `None`, `MapPoint`, `SpawnPoint`.
Does: How the point is drawn.
Limits: None known.
Example:
```
{visor SpawnPoint}
```
See: [show](#show).

### allow
Where: `map_point` extender.
Type: block: `{allow {spawn ...} {capture ...} {release ...} {enableCapture} {enableRelease}}`.
Values: `spawn`, `capture` and `release` are tag lists (empty means everyone); `enableCapture` and `enableRelease` are switches, on by default.
Does: Who may spawn at, capture or release the point.
Limits: None known.
Example:
```
{allow {enableCapture} {enableRelease}}
```
See: [cw](#cw).

### mapPoint
Where: `spawn point` extender.
Type: word.
Values: the `name` of a `map_point`.
Does: Adds an extra spawn spot that belongs to that map point. A point with no extra spots spawns at itself.
Limits: Extra spawn spots are made inactive and neutral when the mission begins.
Example:
```
{Extender "spawn point" {mapPoint a1} {pos 2}}
```
See: [pos](#pos).

### pos
Where: `spawn point` extender.
Type: number.
Values: a whole number.
Does: The spot's number among the map point's extra spots.
Limits: None known.
Example:
```
{pos 2}
```
See: [mapPoint](#mappoint).

An entity counts as a flag when its definition carries the tag `flag`; the stock flags are `flag_point_N`.

## 16. What must match between players

Used in: [chapter 12, section 10](12-missions-and-multiplayer-setup.md#10-how-multiplayer-stays-in-sync), its [sync checks](12-missions-and-multiplayer-setup.md#sync-checks) and [testing with two players](12-missions-and-multiplayer-setup.md#testing-with-two-players); [chapter 18, section 4](18-testing-and-logs.md#4-the-lan-test-bed); Part I [Pack and share](p15-pack-and-share.md).

When players join a multiplayer game, the game compares their files. Some files are compared by content, some only by size, and some not at all. Anything that differs in a way the check misses can make the game desync later.

| Kind | Checked | What it means for you |
|---|---|---|
| `/set/*`, `.set`, `.inc`, `.ext`, `map`, `.mi`, `.reg`, `.info`, `.def`, `.mdl` | by content | every player needs the same files |
| `.ply`, `.vol`, `.mtl`, `.anm`, `.lua`, `.pat` | by size only | an edit that keeps the size passes the check and desyncs later |
| `/script`, `/interface`, `/texture`, `.lng`, `.dds`, `.wav` and others | not compared | may differ freely between players |

The check covers the folders `/entity`, `/fx`, `/properties`, `/set` and `/sound`, plus the map folders. On top of the files, the mod list and its order must match, and the rules (budgets, command points, unit limits) must give the same result on every machine.

Other rules:

- The game uses one shared random number generator. A `rand` test, or anything else random, that runs on one machine only makes the games drift apart.
- There is no host migration: when the host leaves, the match ends for everyone. When another player leaves, their units go to the host and the match goes on. Newer 64-bit builds wait for a player who lost the connection (`mp_reconnectWait`, 120 seconds) and let a player who left come back when the lobby allows rejoining. Not every installed 64-bit build has this yet; type `mp_reconnectWait` in the console to see whether yours knows it.
- More than 128 `{set}` flags gives an application error at load. It is not a desync.

<!-- goh: GHNET-80 GHMIS-76 GHNET-98 -->
Gates of Hell: a leaver's units are shared out squad by squad among the team's other human players; with none left they stay under AI control. There is no rejoin setting, and the state check that finds desyncs is off by default.

See: [Reference 12, `mp_allowDesync`](r12-bot-lua-and-console.md#mp_allowdesync); [Reference 12, `mp_syncPeriod`](r12-bot-lua-and-console.md#mp_syncperiod); [chapter 18, section 7](18-testing-and-logs.md#out-of-sync-dumps).

## Not described yet

These names exist in the game or in vanilla data, but what they do and which values they take is not described here yet.

- Mission file blocks: `Covers`, `Squads`, `Brain`, `Human`, `Inventory`, `Sensor`, `Quant`.
- Entity blocks: `Placer`, `Skeleton`, `Constrain`, `SpawnedInFog`, `Able`, `Impregnability`, `Volume`, `AreaDisable`, `Chassis`, `Component`, `DisableObstacles`, `ChassisManager`, `Color`, `Weaponry`, `Simulation`.
- Helpers blocks: `edifices`, `cameras`, `functions`, `events`.
- Preset switches: `advanced`, `ranked`, `remove`.
- Game card settings: `advanced`, `floraRespawn`, `friendlyFire`, `impregnableTimeout`, `scoreMin`, `scoreMax`, `scoreFinal`, `preparationTimeMin`, `preparationTimeMax`, `showPiercing`, `showDamageReports`, `enableSpectators`, `enableBots`, `randomSpawnPoints`, `minUserPerformance`, `equalizeTeams`.
- Game card parameters: `freezeTime`, `flag_capture_time`, `flag_release_time`, `flag_capture_factor`, `points_table`, `score_flag`, `score_phase`, `score_time`, `score_defBonus`, `flag_time`, `flag_time_small`, `rounds`, `bonusTime`.
- Team fields: `minTeamSlots`, `maxTeamSlots`, `aiTeamPlayers`, `hidden`.

## Gates of Hell only
<!-- goh: GHMIS-29 GHMIS-30 GHMIS-32 GHMIS-33 GHMIS-39 GHMIS-41 GHMIS-42 GHMIS-45 GHMIS-46 GHMIS-16 GHMIS-01 GHMIS-143 GHMIS-04 GHMIS-37 GHMIS-70 GHMIS-71 GHMIS-72 GHMIS-73 GHMIS-74 GHMIS-75 GHMIS-77 GHMIS-78 GHMIS-79 GHMIS-97 GHMIS-100 GHMIS-84 GHMIS-87 GHMIS-88 GHGPL-05 GHGPL-11 GHMAP-01 GHMAP-03 GHMAP-13 GHMAP-07 GHMAP-21 GHMAP-09 GHMAP-11 GHMAP-14 GHMIS-44 GHMIS-101 GHMIS-103 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

These commands, terms, keys and blocks belong to the area of this page and exist only in Gates of Hell. This game does not know them: a mission, card or unit file that uses them either stops with an error when it loads or loses them without a word, depending on the file. Take them out, or replace them with what this page describes, when you bring data across. [Chapter 12](12-missions-and-multiplayer-setup.md) and [chapter 13](13-maps.md) describe the files of this game, and Part I [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md) covers moving work between the games.

### interface (command)

Where: `.mi`, a trigger's `actions`.    Type: command with a `type` field.
Values: `type` is `default`, `game`, `scenario` or `manual`; another word gives the warning `Unknown interface type`.
Does: switches the player's interface, for example to the cutscene view.
Limits: works in single player and on multiplayer clients; a dedicated server switches nothing itself.
See: [scenario](#scenario).

### benchmark (command)

Where: `.mi`, a trigger's `actions`.    Type: command.
Values: fields `mode`, `profile` (a profile name), `trigger_state` (`start_benchmark` or `end_benchmark`), `camera` (a camera path of the mission) and `camera_trigger`.
Does: starts or ends a frame rate test from a mission, like the console command `dbg_benchmark`.
Limits: an unknown profile is refused with a console message.
See: [Reference 12, Gates of Hell only](r12-bot-lua-and-console.md#gates-of-hell-only).

### altitude (term)

Where: `.mi`, a condition's terms.    Type: condition term with a `selector` and an `altitude` group.
Values: `altitude` holds `op` and `value` as in [entities](#entities), plus `absolute` (0 measures from the ground below, 1 from height 0).
Does: true when every entity the selector picks is at that height. An empty selection counts as true.
Example:
```
{"2.altitude"
	{selector {zone "zone3"} {player "2"} {type vehicle} {state inhabited}}
	{altitude {op "=="} {value 0} {absolute 0}}
}
```
See: [entities](#entities); [air_state](#air_state).

### reinforcements_score (term)

Where: `.mi`, a condition's terms.    Type: condition term.
Values: `compare` is `greater` (default), `equal` or `less`; `scoreCurrent` is a whole number.
Does: compares the mission's current reinforcement score with `scoreCurrent`.
Limits: `less` also passes when the two are equal, so `less 2` is true at 2.
Example:
```
{"2.reinforcements_score" {compare less} {scoreCurrent 2}}
```
See: [reinforcement (command)](#reinforcement); [reinforcements](#reinforcements).

### user_player (selector switch)

Where: `.mi`, inside `{selector}`.    Type: switch.
Does: picks the units of the player at this machine; `relation` is then taken from that player.
Limits: every machine picks different units, so in a multiplayer mission it only suits effects that stay on one screen.
See: [player (selector field)](#player-selector-field); [relation](#relation).

### @players:composition and @game:frontlinesphase (variables)

Where: `.mi`, wherever a variable name is read.    Type: read-only whole number.
Values: `@players:composition` is 0 outside a game of one or two teams; otherwise a number from 1 to 10 for the mix of the two teams (each team all human, all AI, mixed or empty). `@game:frontlinesphase` is the current phase of a Frontlines match and -1 in every other game.
Does: lets a mission branch on who plays and on the frontline phase.
Example:
```
{var "players:composition@"}
```
See: [vars](#vars); [cmp_i](#cmp_i).

### RandomPosition (waypoint)

Where: `.mi`, a waypoint in `{waypoints}`.    Type: switch, `{RandomPosition 1}`.
Does: `placement` puts units, and walking units head, at a random point inside the waypoint's radius.
Limits: the random points always fall on one half of the circle.
See: [waypoints](#waypoints); [spawn](#spawn).

### disable_random_spawn_position (spawn switch)

Where: `.mi`, inside the `spawn` command.    Type: switch.
Does: puts the unit on the waypoint itself instead of anywhere in its radius.
See: [spawn](#spawn).

### Game card settings

Where: a mode file, inside `{settings}`.
- `manualControlMode`: `rts_mode`, `dc_mode`, `tpc_mode` or `any_mode` (default). Sets which direct control players may use; only `any_mode` leaves the choice to each player.
- `assignReinforcementsToPlayer`: on gives a called reinforcement to the player who called it; off gives it to side 0.
- `loseOnZeroPoints`: a team whose score falls to 0 loses; both at 0 is a draw. Offered in the lobby only with `invertedUnitScores=true`.
- `pauseDuringPreparation`: on (default) holds the battle during `preparationTime`; off lets it run.
- `chargeFactorMod`: a number (default 1) that scales the preset's `chargeFactors`.
- `coldWarSpawn` and `customClipper`: players take map points tagged `a` or `b` in order and a coin decides which half each team gets; with `customClipper` the coin also picks the attacker.
- `waveTime` and `firstWaveTime` (defaults 120 and 360 seconds), with `...Min` and `...Max` ranges: the attack waves of the evacuation mode.
- `enableDuration`: read and saved, but what it changes is not confirmed.

See: [settings](#settings); [preparationTime](#preparationtime).

### Mode parameters

Where: a mode file, inside the `parameters` text.
- `invertedUnitScores=true` takes a kill's score off the victim's team instead of paying the killer; `scoreStart` gives every team that score at the start.
- `teamsize_cp_factor=<players>:<factor>,...` scales every side's command points by the size of the larger team.
- `kill_personal_score_multiplier`, `kill_unit_score_multiplier` and `kill_score_multiplier` multiply the score a kill pays.
- `score_slaveFlag` (Frontlines): paid once per match for the first capture of each side flag.
- `flag_team_score` and `flag_team_table` (battle modes): a held flag pays its team a share of the score limit.

See: [parameters](#parameters); [class](#class).

### Unit card keys

Where: a unit file under `set/multiplayer/units`, inside a unit.
- `cost_ap`, `cost_sp`: further prices beside `cost`.
- `round_multiple`, `squad_cost_factor`: round the cost of a vehicle with crew or a squad with its members, and weigh the members in.
- `score_factor` (default 0.05): with `score 0`, a unit scores its price times this.
- `research_stage`, `research_stage_max`: the research stages of the dynamic campaign in which a bot may use the unit.
- `not_for_player_sale`: only bots may buy the unit.
- `doctrine`: the doctrine the unit belongs to; the lobby builds its doctrine list from these, and the buy bar shows the unit only for that doctrine.
- `conditions`: what must be selected for the card to work. `action`: what the card does instead of delivering a unit, for example `airstrike:reconnaissance_50` in the stock data.
- `enabled`: read, then overwritten by the game's own content check, so it probably has no effect.

Example:
```
{cost 75} {not_for_player_sale 1}
{score_factor 0.05} {squad_cost_factor 1} {round_multiple 5.0}
```
See: [cost](#cost); [score](#score); [not_for_sale](#not_for_sale).

### Map and location keys

- `menu` in a location's `interface.set`: the army a location is listed under when that is not its `side`.
- `zoneId` on a map point: names a battle zone shape; the point is captured from anywhere inside it, each unit weighs 1, and the shape is drawn as a dashed outline.
- `GlobalTexture {Normalmap "..."} {Diffuse "..."}` and `Haze` in the map file: a texture over the whole land, and haze. This game stops with an error at either block.
- `ww_environment_mode` (0 sea, 1 lake, 2 river), `ww_ocean_base_color`, `ww_pollution_color` and `ww_pollution_factor` in the `Ocean` block.
- `map.omask` beside the map: a water and shore mask for the ocean.
- the `waypoint` extender on an entity: a map point without a zone or a model. This game stops with an error at it.
- `base_flag_<team>` with an optional `1` or `2`: names of the base flags of the battle modes.

See: [mapPoint](#mappoint); [zoneA](#zonea); [Land](#land); [Ocean](#ocean); [chapter 13, section 6](13-maps.md#6-map-points-spawns-and-flags).

### Mission switches

Where: `.mi`, in `(mod "...")` tests.
Does: a mission also sees `gametype:<type>`, `gameclass:<class>` and `training` beside `coop`, `mp` and `game:<map>`, for the whole match.
Example:
```
(mod "gametype:cooperative")
```
See: [Reference 01, `mod`](r01-mod-info-and-folder.md); [class](#class).
