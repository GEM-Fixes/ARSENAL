# Reference 10: Interaction Scripts

This chapter lists every event, command and condition of the interaction script language, one entry each. [Chapter 11](11-interaction-scripts.md) teaches the language; this chapter is the lookup table you keep open while you write.

## How to read this chapter

An interaction script is the set of rules that says what an object does when something happens to it: a shell hits it, it starts moving, it is repaired. The game reads these rules from the `set/interaction_entity/` folder, starting at `entity.set`, which includes the other files.

The file is made of top-level blocks written as `{"tag1 tag2" ...}`. A block applies to an object when every tag in its quoted name is one of the tags in the object's definition. The object's own name also counts as a tag. A block named `generic` applies to everything. The game decides which blocks apply once, when it first reads the object's description, so tags you add later with the `tags` command do not change which blocks apply.

Inside a block you write handlers. A handler is `{on <event> [inherit|overload] <actions>}`. The actions after the event are called an action list in this chapter: a list of commands, each in its own braces. When several blocks apply, their handlers for the same event run from the least specific block to the most specific one, in file order. That is the `inherit` behaviour and it is the default. A handler marked `overload` runs instead of the less specific ones, and inside it the `inherited` command runs the next level down.

Every handler runs with a command record. This record carries the fields the event filled in: the target (the object the script belongs to), the instigator (the other object, such as the shooter), the volume (the collision shape that was hit), the part (the vehicle component), the bone, a value, a position, a direction, a surface normal, the ammunition or item that caused the event (its source item), the bullet and a sender text. A condition that needs a missing field is false, and a command that needs a missing field does nothing.

Three kinds of value appear in the entries:

- A range is written `centre [spread]`. The game draws a uniform random number between centre minus spread and centre plus spread. Without a spread the value is fixed.
- A yes/no value is a number, where anything other than 0 means yes. When you leave it out it means yes.
- A seconds value is in seconds, a speed is in kilometres per hour and a distance is in metres, unless the entry says otherwise.

A misspelt name is not skipped: an unknown event, command or condition name is a fatal error when the file loads, and the game stops with "unexpected token", "unknown action '<name>'" or "unknown condition". Only a quoted custom event name that nothing calls fails silently.

Interaction scripts run on every machine in a multiplayer game, so random numbers inside them stay in step between players. A random test that follows a test of local-only state, such as `fogged`, could make the machines drift apart (unconfirmed).

## Block parameter

Chapter 11 teaches this part in [section 7, "State: flags, tags, abilities"](11-interaction-scripts.md#7-state-flags-tags-abilities).

### inflammation_time
Where: interaction file, directly inside a top-level block, beside the handlers.    Type: number, seconds.
Values: any number of seconds. When absent, the object keeps the ignition time it already has.
Does: Sets how long a burnable object has to be heated before it catches fire. It is the only setting a block accepts besides handlers.
Limits: Any other bare word inside a block stops the file with an "unexpected token" error.
Example:
```
{"wood_fence"
    {inflammation_time 5}
    {on blast {burn}}
}
```
See: [Chapter 11, section 7](11-interaction-scripts.md#7-state-flags-tags-abilities); [`burn`](#burn), [`fire`](#fire-1).

## Events: combat and damage

Chapter 11 teaches this part in [section 4, "Events"](11-interaction-scripts.md#4-events).

### spawn
Where: interaction file, `{on spawn ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs once when the object is created, before it takes part in the game. The command record is empty apart from the target.
Limits: Commands that need a hit volume, position or instigator do nothing here.
Example:
```
{on spawn
    {chassis_work 0}
}
```
See: [`delay`](#delay), [`tags`](#tags).

### bullet_hit
Where: interaction file, `{on bullet_hit ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when a bullet or shell touches one of the object's volumes, once per object for each step of the bullet, before the game decides whether it passes through. The record carries the bullet, the ammunition as source, the shooter as instigator, the volume, position and direction, the hit side as value: 0 front, 1 top, 2 left, 3 right, 4 back, 5 bottom, and as normal the bullet's direction mirrored off the surface, not the surface normal itself.
Limits: The hit side comes from the material of the hit surface, so a model without side materials always reports the same side.
Gates of Hell: the normal is the surface normal, and the hit side is kept in a field of its own instead of the value, so a script that reads the value as the side gets nothing there. The first hit on an object also runs the named event `bullet_hit_effect`.
Example:
```
{on bullet_hit
    {if hit_side back {component break}}
}
```
See: [`pierce`](#pierce), [`hit_side`](#hit_side).

### pierce
Where: interaction file, `{on pierce ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when a bullet passes through the object's armour, for the entry hit only. The record is the same as for `bullet_hit`.
Limits: It does not run when the shell detonates on the armour instead of passing through.
Gates of Hell: also runs the named event `pierce_effect`, a place to hang hit effects.
Example:
```
{on pierce
    {health_damage_pierce {effects "" "hit" "damage" "die" "thrown" "thrown" "thrown"}}
}
```
See: [`bullet_hit`](#bullet_hit), [`health_damage_pierce`](#health_damage_pierce).

### break_armor
Where: interaction file, `{on break_armor ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when an armoured volume is broken through for the first time. The record carries the volume, the energy as value, and the sender text `pierce` or `blast`.
Limits: A second break of a part that is already damaged runs `break_armor_again` instead.
Example:
```
{on break_armor
    {if name "blast" {call "explosion"}}
}
```
See: [`break_armor_again`](#break_armor_again), [`name`](#name-1).

### break_armor_again
Where: interaction file, `{on break_armor_again ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when armour is broken through on a part that was already damaged. The record is the same as for `break_armor`.
Limits: None known beyond those of `break_armor`.
Example:
```
{on break_armor_again
    {component destroy}
}
```
See: [`break_armor`](#break_armor).

### blast_hit
Where: interaction file, `{on blast_hit ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs for the first blast hit on the object from one explosion. The record carries the volume, position, direction, normal, the blast energy as value, and a source item.
Limits: It runs once per explosion even when the blast reaches several parts; use `blast` for each part.
Example:
```
{on blast_hit
    {if min_energy 50 {call "explosion"}}
}
```
See: [`blast`](#blast), [`health_damage_blast`](#health_damage_blast).

### blast
Where: interaction file, `{on blast ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs for every part or volume a blast reaches, at most once per part for each explosion. The record is the same as for `blast_hit`.
Limits: A blast that reaches several volumes runs the handler several times, so a `spawn` in it can spawn several objects.
Example:
```
{on blast
    {if volume "body" {burn volume}}
}
```
See: [`blast_hit`](#blast_hit).

### contact
Where: interaction file, `{on contact ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when the object's physics body collides with another body. The value is the contact speed, the instigator is the other body, and the volume and position are set.
Limits: It only runs while the object is being simulated by physics.
Gates of Hell: before this event the object that is hit runs the named event `contact_effect`, with the value, instigator, volume, position, direction and normal set.
Example:
```
{on contact
    {if contact_velocity 20 {component break}}
}
```
See: [`contact_velocity`](#contact_velocity), [`ground_hit`](#ground_hit).

### ground_hit
Where: interaction file, `{on ground_hit ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when a simulated body or a human hits the ground or the water. The value is the falling speed as a negative number, the volume is set, and the sender is `water` for a water landing.
Limits: Because the value is negative, a `min_energy` test against it is always false.
Example:
```
{on ground_hit
    {if name "water" {delete}}
}
```
See: [`contact`](#contact), [`fall_down`](#fall_down).

### break
Where: interaction file, `{on break ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when a vehicle part changes to a damaged state. The part field is set, so `component` and the `component` condition work on it.
Limits: It runs on the vehicle, not on the part.
Gates of Hell: a part that is destroyed runs the separate event `destroy`; this game runs `break` for a destroyed part too, and a `destroy` handler stops the file here with "unexpected token".
Example:
```
{on break
    {if component "engine" {chassis_work 0}}
}
```
See: [`repair`](#repair), [`component`](#component).

### repair
Where: interaction file, `{on repair ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when a damaged vehicle part is repaired. The part field is set.
Limits: None known.
Example:
```
{on repair
    {if component "engine" {chassis_work 1}}
}
```
See: [`break`](#break).

### blow
Where: interaction file, `{on blow ...}` or `{on blow opponent ...}` handler.    Type: event, optional word `opponent`.
Values: `blow` alone, or `blow opponent`.
Does: Runs on a melee strike. `blow` runs on the soldier who strikes and `blow opponent` on the soldier who is struck; on the victim the value is the damage, and the sender is `knife` or the tag of the item used. The instigator is the other soldier.
Limits: Any word after `blow` other than `opponent` is an error, so `{on blow overload}` fails and the handler is read as `blow opponent`.
Gates of Hell: before the strike and the hit reactions it also runs the named events `blow_effect` on the striker and `blow_opponent_effect` on the opponent, for melee sounds and effects.
Example:
```
{on blow opponent
    {health_damage_blow {effects "" "hit" "damage" "die" "die" "die" "die"}}
}
```
See: [`health_damage_blow`](#health_damage_blow).

### fire
Where: interaction file, `{on fire "place" ...}` handler.    Type: event, optional quoted weapon place name.
Values: the name of a weapon place on the object, such as `"gun"`.
Does: Runs when the weapon in that place fires. For bullet weapons the record carries the bone, position, direction, normal, the calibre as value, and the barrel as sender; for flame throwers and thrown items it carries nothing.
Limits: The handler is found by the place name, so a misspelt name never runs.
Example:
```
{on fire "gun"
    {view start "fx"}
}
```
See: [`view`](#view), [`weapon_work`](#weapon_work).

## Events: actor, vehicle and movement

Chapter 11 teaches this part in [section 4, "Events"](11-interaction-scripts.md#4-events).

### operatable
Where: interaction file, `{on operatable on|off ...}` handler.    Type: event, word `on` or `off`.
Values: `on`, `off`.
Does: Runs when the vehicle or gun becomes usable or stops being usable.
Limits: The word is required; without it the handler does not load.
Example:
```
{on operatable off
    {crew_emit}
}
```
See: [`auto_operatable`](#auto_operatable), [`operatable` condition](#operatable-1).

### grounded
Where: interaction file, `{on grounded on|off ...}` handler.    Type: event, word `on` or `off`.
Values: `on`, `off`.
Does: Runs when the object gains or loses its side, for example when an abandoned vehicle becomes neutral.
Limits: The word is required.
Example:
```
{on grounded on
    {tags add "abandoned"}
}
```
See: [`player`](#player).

### move
Where: interaction file, `{on move on|off ...}` handler.    Type: event, word `on` or `off`.
Values: `on`, `off`.
Does: Runs when the chassis starts or stops moving. The value is +1 forward and -1 backward.
Limits: The word is required.
Example:
```
{on move on
    {play_sound "moving" 1}
}
```
See: [`move_forward`](#move_forward), [`play_sound`](#play_sound).

### turn
Where: interaction file, `{on turn on|off ...}` handler.    Type: event, word `on` or `off`.
Values: `on`, `off`.
Does: Runs when the chassis starts or stops turning. The value is +1 left and -1 right.
Limits: The word is required.
Example:
```
{on turn off
    {stop_sound "turn"}
}
```
See: [`turn_left`](#turn_left), [`turn_right`](#turn_right).

### accelerate
Where: interaction file, `{on accelerate on|off ...}` handler.    Type: event, word `on` or `off`.
Values: `on`, `off`.
Does: Runs when the chassis starts or stops accelerating.
Limits: The word is required even though some older notes write the event without it.
Example:
```
{on accelerate on
    {view start "exhaust"}
}
```
See: [`brake`](#brake).

### brake
Where: interaction file, `{on brake on|off ...}` handler.    Type: event, word `on` or `off`.
Values: `on`, `off`.
Does: Runs when the chassis starts or stops braking.
Limits: The word is required.
Example:
```
{on brake on
    {play_sound "brake"}
}
```
See: [`accelerate`](#accelerate).

### engine
Where: interaction file, `{on engine on|off ...}` handler.    Type: event, word `on` or `off`.
Values: `on`, `off`.
Does: Runs when the engine starts or stops.
Limits: The word is required.
Example:
```
{on engine on overload
    {play_sound "engine" 1}
}
```
See: [`link_sound`](#link_sound), [`chassis_work`](#chassis_work).

### swim
Where: interaction file, `{on swim on|off ...}` handler.    Type: event, word `on` or `off`.
Values: `on`, `off`.
Does: Runs when the chassis starts or stops swimming.
Limits: The word is required.
Example:
```
{on swim on
    {view start "wake"}
}
```
See: [`swimming`](#swimming).

### movement_mode_changed
Where: interaction file, `{on movement_mode_changed ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when a soldier or squad changes movement mode. The sender is the new mode: slow, normal, fast, walk, bow, assault, spot, sneak or none.
Limits: None known.
Example:
```
{on movement_mode_changed
    {if name "sneak" {tags add "sneaking"}}
}
```
See: [`movement_limit`](#movement_limit), [`name`](#name-1).

### overlap
Where: interaction file, `{on overlap begin|end ...}` handler.    Type: event, word `begin` or `end`.
Values: `begin`, `end`.
Does: Runs when another object enters or leaves one of this object's overlap volumes. On `begin` the instigator is the other object.
Limits: The volume must have the overlap ability switched on, see `volume`.
Example:
```
{on overlap begin
    {if effector "human" {call "trigger"}}
}
```
See: [`volume`](#volume), [`effector`](#effector).

### crew
Where: interaction file, `{on crew in|out ...}` handler.    Type: event, word `in` or `out`.
Values: `in`, `out`.
Does: Runs on the vehicle when a soldier takes or leaves a seat in it.
Limits: Which fields the record carries here is not established (unconfirmed). Stock data never uses this event.
Example:
```
{on crew in
    {tags add "manned"}
}
```
See: [`board`](#board), [`crew_in_place`](#crew_in_place).

### board
Where: interaction file, `{on board in|out ...}` handler.    Type: event, word `in` or `out`.
Values: `in`, `out`.
Does: Runs on the soldier or item when it boards or leaves a host such as a vehicle.
Limits: None known.
Example:
```
{on board out
    {tags remove "inside"}
}
```
See: [`crew`](#crew), [`boarding`](#boarding).

### terrain_pp
Where: interaction file, `{on terrain_pp "type" enter|leave ...}` handler.    Type: event, quoted ground type then `enter` or `leave`.
Values: a ground type name, then `enter` or `leave`.
Does: Runs when the actor moves onto or off a ground type, such as water.
Limits: A misspelt type never matches and the handler never runs.
Example:
```
{on terrain_pp "water" enter
    {able "sinking" 1}
}
```
See: [`terrain_pp` condition](#terrain_pp-1), [`terrain_fx`](#terrain_fx).

### terrain_fx
Where: interaction file, `{on terrain_fx "material" enter|leave ...}` handler.    Type: event, quoted ground material then `enter` or `leave`.
Values: a ground effect material name, then `enter` or `leave`.
Does: Runs when the actor moves onto or off a ground material, such as snow.
Limits: A misspelt material never matches.
Example:
```
{on terrain_fx "snow" enter
    {play_sound "move_snow" 1}
}
```
See: [`terrain_fx` condition](#terrain_fx-1).

### animation_end
Where: interaction file, `{on animation_end ["anim"] ...}` handler.    Type: event, optional quoted animation name.
Values: the name of an animation started with `ani_play ... callback`.
Does: Runs when that animation ends.
Limits: It only runs for animations started with the `callback` word.
Example:
```
{on animation_end "flight"
    {delete}
}
```
See: [`ani_play`](#ani_play).

### ik
Where: interaction file, `{on ik begin|end ["bone"] ...}` handler.    Type: event, word `begin` or `end`, then optional quoted bone.
Values: `begin` or `end`, then a bone name.
Does: Runs when a turning bone driven by inverse kinematics, such as a turret, starts or stops turning. On `begin` the sender is `forward` or `reverse`.
Limits: None known.
Example:
```
{on ik begin "turret"
    {play_sound "rotate_turret" 1}
}
```
See: [`ik_enable`](#ik_enable).

## Events: custom

Chapter 11 teaches this part in [section 4, "Custom events"](11-interaction-scripts.md#custom-events).

### "name"
Where: interaction file, `{on "name" ...}` handler with a quoted name.    Type: event, quoted free name.
Values: any name you choose; names are not case-sensitive.
Does: Defines a custom event. It runs when `call` or `delay_effect` names it, when a damage command uses it as one of its effects, or when the game itself fires one of its own named events, such as `burn`, `burn_volume`, `break_window`, `fallen`, `die`, `slice_load` or `link_weapon`.
Limits: Calling a name that has no handler does nothing and logs nothing, so a misspelt name fails silently. An unquoted unknown event name is a fatal error at load: the game stops with "unexpected token". The same event twice in one block is an "event already defined" error.
Gates of Hell: the game fires more named events of its own: `bullet_hit_effect`, `pierce_effect`, `contact_effect`, `blow_effect`, `blow_opponent_effect`, `blast_wreaked_effect`, `reload` (on a reload, with the weapon place name as sender) and `environment_changed` (when the scene's environment changes). Here they are ordinary names that nothing calls.
Example:
```
{on "explosion"
    {spawn "ex_bomb_big"}
    {delete}
}
```
See: [`call`](#call), [`delay_effect`](#delay_effect), [`health_damage_pierce`](#health_damage_pierce).

## Events: terrain effects

Chapter 11 teaches this part in [section 9, "Terrain effects"](11-interaction-scripts.md#9-terrain-effects).

Terrain effects are defined in the terrain effect files under `set/interaction_terrain/`, as `{"effect name" {on hit ...} {on detonate ...}}`. The effect name is the one the ground material gives in the terrain settings.

### hit
Where: terrain effect file, inside an effect block.    Type: event, no word after it.
Values: none.
Does: Runs when a body, human or torpedo hits ground of that material. The target is the object that hits, so mass and instigator conditions apply to it.
Limits: An effect name that has no definition stops the game with the error "Unknown terrain effect".
Example:
```
{"mud"
    {on hit {if min_mass 1000 {spawn "dust_big"}}}
}
```
See: [`min_mass`](#min_mass).

### detonate
Where: terrain effect file, inside an effect block.    Type: event, no word after it.
Values: none.
Does: Runs when a bullet, shell or item detonates on ground of that material.
Limits: None known beyond those of `hit`.
Gates of Hell: whether a hit or detonation counts as in the air depends on what causes it (a bullet's size, an item's blast reach) instead of one fixed height, so large blasts raise ground effects from higher up; effects that are not in the air play at the ground or water surface below the point.
Example:
```
{"sand"
    {on detonate {spawn "crater_norm" terrain_texmod}}
}
```
See: [`spawn` command](#spawn-1).

### bullet
Where: terrain effect file, inside an effect block.    Type: event, no word after it.
Values: none.
Does: Nothing. The game accepts the name but never fires it.
Limits: A handler written for it never runs.
Example:
```
{"grass"
    {on bullet {spawn "dust_small"}}
}
```
See: [`detonate`](#detonate).

## Commands: flow and timers

Chapter 11 teaches this part in [section 6, "Actions"](11-interaction-scripts.md#6-actions).

### if
Where: action list.    Type: command. Arguments: `[not] <condition> {actions}`, then any number of `else [not] <condition> {actions}`, then optional `else {actions}`.
Values: any condition from the Conditions part of this chapter, or a quoted flag name.
Does: Runs the actions of the first branch whose condition holds, or fails when `not` is written. A final `else` without a condition runs when no branch matched.
Limits: An unknown condition name is a fatal error when the file loads: the game stops with "unknown condition". A branch written with no condition word at all has no test, so it runs every time like a plain `else`.
Example:
```
{if volume "body"
    {component break}
else not burned
    {burn}
}
```
See: [Conditions](#conditions).

### set
Where: action list.    Type: command. Arguments: `"flag" [yes/no]`.
Values: a flag name, then a yes/no value; absent means yes.
Does: Sets or clears a flag on this object. A flag is a named yes/no value stored with the object and tested with `{if "flag"}`.
Limits: The whole game can hold at most 128 different flag names, counted over every interaction file; more is an error at load time.
Example:
```
{if not "broken"
    {set "broken" 1}
}
```
See: [`"flag"` condition](#flag), [`tags`](#tags).

### delay
Where: action list.    Type: command. Arguments: `seconds [spread] ["name"] {actions}`.
Values: a time range in seconds, default 0; an optional timer name.
Does: Runs the nested actions after the time has passed.
Limits: The delayed actions get a fresh command record with no bullet, volume or position, so commands that need them do nothing. A delay restarts when the same handler runs it again, so it never stacks.
Example:
```
{delay 3 1 "fire1"
    {burn stop}
}
```
See: [`delay_ex`](#delay_ex), [`kill_delay`](#kill_delay).

### delay_ex
Where: action list.    Type: command. Arguments: `seconds [spread] ["name"] {actions}`.
Values: as for `delay`.
Does: Like `delay`, but the nested actions get a copy of the original command record.
Limits: The copy drops the instigator, the bone and the bullet; the volume and part are looked up again by name, so they are lost if the volume is gone.
Gates of Hell: adds the word `uniq`: each such call gets its own timer, and a later call of the same action never restarts it.
Example:
```
{delay_ex 0.3
    {burn volume}
}
```
See: [`delay`](#delay).

### delay_effect
Where: action list.    Type: command. Arguments: `seconds [spread] "name"`.
Values: a time range in seconds and a custom event name.
Does: Runs the custom event after the time has passed.
Limits: The event runs with a fresh command record. Setting the same timer again restarts it.
Example:
```
{on spawn
    {delay_effect 20 5 "stop"}
}
```
See: [custom events](#events-custom), [`kill_delay`](#kill_delay).

### kill_delay
Where: action list.    Type: command. Arguments: `"name"`.
Values: the name of a `delay` or `delay_effect` timer.
Does: Cancels the named timer if it is running.
Limits: An empty name is a load error, "delay must have a name".
Example:
```
{on engine off
    {kill_delay "engine_stopped"}
}
```
See: [`delay`](#delay).

### call
Where: action list.    Type: command. Arguments: an event, written as after `on`.
Values: a quoted custom name, or an engine event form such as `break`.
Does: Runs that event's handlers at once, with the same command record, so the volume, bullet and position are kept.
Limits: Calling an event that has no handler does nothing and logs nothing. One object can have at most 255 different events over all the blocks that apply to it; past that, a call runs the wrong handler or none.
Gates of Hell: the limit is 65,535 events, so large Gates of Hell scripts may pass this game's 255. `call_synced` is a `call` that the host also sends to the other players.
Example:
```
{if min_energy 300
    {call "explosion"}
}
```
See: [custom events](#events-custom).

### inherited
Where: action list inside an `overload` handler.    Type: command. Arguments: none.
Values: none.
Does: Runs the handler of the next less specific level for the same event.
Limits: Outside an `overload` handler there is nothing to run.
Example:
```
{on engine on overload
    {inherited}
    {view start "smoke"}
}
```
See: [How to read this chapter](#how-to-read-this-chapter).

### with_effector
Where: action list.    Type: command. Arguments: `{actions}`.
Values: a nested action list.
Does: Runs the nested actions with target and instigator swapped, so they act on the other object.
Limits: Without an instigator in the record the nested actions have no target.
Example:
```
{with_effector
    {knockdown 12 3}
}
```
See: [`effector`](#effector).

### con
Where: action list.    Type: command. Arguments: `"text"`.
Values: any text.
Does: Prints the text to the debug console when it runs.
Limits: You only see it with the console open.
Example:
```
{on "explosion"
    {con "big explosive"}
}
```
See: [`log`](#log).

### log
Where: action list.    Type: command. Arguments: `"text"`.
Values: any text.
Does: Nothing; the text is read and ignored.
Limits: It writes nothing to the game log.
Example:
```
{on "burn"
    {log "burn_engine"}
}
```
See: [`con`](#con).

### rtfunc
Where: action list.    Type: command. Arguments: `"path" ["parameters"]`.
Values: two texts.
Does: Nothing useful; when it runs it warns that it does not work.
Limits: Stock data never uses it.
Example:
```
{on spawn
    {rtfunc "script" "arg"}
}
```
See: none.

## Commands: spawning and removal

Chapter 11 teaches this part in [section 6, "Actions"](11-interaction-scripts.md#6-actions).

### spawn
Where: action list.    Type: command. Arguments: `"entity" ["bone" [x|y|z]] [options] [{actions}]`.
Values: options are `no_normal`, `inv_normal`, `dir_velocity`, `no_position`, `terrain_texmod`, `offset x y z`, `local_offset x y z`, `scale [k]` (default 1, multiplied by the record value when there is one) and `volume [axis]`.
Does: Creates a new object at the command position, or at the named bone, and runs the nested actions on it.
Limits: Any other option word is an "invalid parameter" error. A bone name the model lacks means nothing is spawned. A crater is not spawned close to a gun or another crater.
Gates of Hell: adds the options `texmod`, `random_position <radius>`, `random_orientation`, `local` (spawn on this machine only) and `constrain_after_dir`, which are "invalid parameter" errors here. Craters are not spawned on an active land patch.
Example:
```
{on "explosion"
    {spawn "crater_norm" terrain_texmod}
    {spawn "ex_bomb_big"}
}
```
See: [`delete`](#delete).

### spawn_human
Where: action list.    Type: command. Arguments: `"breed" {actions}`.
Values: a soldier breed name.
Does: Creates a soldier of that breed at the target's position, facing its direction, and runs the nested actions on him.
Limits: Stock data never uses it.
Example:
```
{on "bail_out"
    {spawn_human "driver" {knockdown 3}}
}
```
See: [`spawn`](#spawn-1).

### delete
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Takes the object out of any box or holder and removes it from the game.
Limits: Commands after it in the same list act on a removed object.
Example:
```
{on "explosion"
    {spawn "ex_bomb_big"}
    {delete}
}
```
See: [`hide`](#hide).

### hide
Where: action list.    Type: command. Arguments: `[seconds]`.
Values: seconds, default 2.
Does: Fades the object out over the time, then removes it.
Limits: None known.
Example:
```
{on "dead"
    {hide 3}
}
```
See: [`delete`](#delete).

### explode_inventory
Where: action list.    Type: command. Arguments: `{amount "entity" radius}` entries.
Values: each entry is an explosive amount, an object to spawn and a radius in metres; entries must rise by amount.
Does: Makes a random 40 to 90 percent of the explosives the object carries go off, picks the entry that matches the amount, spawns its object and a shock wave.
Limits: Entries out of order are a load error, "Items must be sorted by amount". An amount of 0.1 or less does nothing.
Example:
```
{explode_inventory
    {5 "ex_arm_sm" 3}
    {30 "ex_anti_big" 5}
}
```
See: [`stuff_detonate`](#stuff_detonate), [`explosive_amount`](#explosive_amount).

### stuff_detonate
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Makes the items the target carries go off.
Limits: None known.
Example:
```
{on "die"
    {stuff_detonate}
}
```
See: [`explode_inventory`](#explode_inventory).

### tear
Where: action list.    Type: command. Arguments: `"piece" [bone "b" | bone from_volume] [id "x"] [{actions}]`.
Values: a piece object name, an optional bone, an optional id.
Does: On a timer, cuts the object at the bone into a piece made from the named object description, runs the nested actions on the piece, and fires the `slice_load` custom event.
Limits: Any word other than `bone` and `id` is an "unexpected token" error.
Gates of Hell: adds the word `copy`, which this game rejects.
Example:
```
{on blast
    {tear "piece_small_wood" bone "piece1"}
}
```
See: [`bone`](#bone).

## Commands: sound

Chapter 11 teaches this part in [section 6, "Actions"](11-interaction-scripts.md#6-actions).

### link_sound
Where: action list.    Type: command. Arguments: `"name" ["file"]`.
Values: a sound slot name and a sound file path.
Does: Ties a sound file to a named slot on the object, for later `play_sound` and `stop_sound`.
Limits: Without a file it does nothing.
Example:
```
{on spawn
    {link_sound "engine" "vehicle/engine/chi-ha"}
}
```
See: [`play_sound`](#play_sound).

### play_sound
Where: action list.    Type: command. Arguments: `"name" [loop]`.
Values: a slot name; a yes/no loop value.
Does: Restarts the sound tied to that slot.
Limits: A slot with no linked sound plays nothing.
Gates of Hell: adds the word `use_position`, also on `stop_sound` and probably on `start_sound`.
Example:
```
{on move on
    {play_sound "moving" 1}
}
```
See: [`link_sound`](#link_sound), [`stop_sound`](#stop_sound).

### stop_sound
Where: action list.    Type: command. Arguments: `"name"`.
Values: a slot name.
Does: Stops the sound tied to that slot.
Limits: None known.
Example:
```
{on move off
    {stop_sound "moving"}
}
```
See: [`play_sound`](#play_sound).

### start_sound
Where: action list.    Type: command. Arguments: `"file" [loop number] [ambient]`.
Values: a sound file path; the word `ambient` plays it as an interface sound.
Does: Plays a sound file once at the object.
Limits: The loop number is read but has no effect. Any other word after the file is an "unexpected token" error.
Example:
```
{on "moo"
    {start_sound "animal/cow/moo"}
}
```
See: [`link_sound`](#link_sound).

### talk
Where: action list.    Type: command. Arguments: `"text"`.
Values: a speech name.
Does: Makes the soldier say that speech.
Limits: Works on soldiers only.
Example:
```
{on "die"
    {talk "death_cry"}
}
```
See: none.

### signal
Where: action list.    Type: command. Arguments: `<name> <radius>`.
Values: `movement`, `shot`, `hit`, `injure`, `explosion`, `mandie`, `sound` or `ally_info`; a radius in metres.
Does: Sends a signal that nearby soldiers notice and react to.
Limits: Any other name is a load error, "Unknown signal".
Example:
```
{on "die"
    {signal mandie 5}
}
```
See: none.

## Commands: model and animation

Chapter 11 teaches this part in [section 6, "Actions"](11-interaction-scripts.md#6-actions).

### view
Where: action list.    Type: command. Arguments: `show|hide|start|stop|pause "tag"`.
Values: one of the five words and a view tag of the model.
Does: Shows, hides, starts, stops or pauses the model views that carry the tag, such as smoke or muzzle effects.
Limits: A tag the model lacks changes nothing.
Example:
```
{on fire "gun"
    {view start "fx"}
}
```
See: [`add_view`](#add_view).

### add_view
Where: action list.    Type: command. Arguments: `"model" "view" "bone" ["parent"]`.
Values: a model, a view of that model, a bone of this object, and an optional parent.
Does: Attaches a view of another model to a bone of this object.
Limits: None known.
Gates of Hell: extra words say when the view shows (`not_manual`, `not_scenario`, `in_manual`, `in_zoom`, `in_scenario`, for direct control, the zoomed view and scripted scenes) and for which side (`my` among others).
Example:
```
{on "burn"
    {add_view "smoke_black" "smoke" "root"}
}
```
See: [`view`](#view).

### bone
Where: action list.    Type: command. Arguments: `show|hide|cut ["name"]`.
Values: one of the three words, and a bone name.
Does: Shows, hides or cuts off a bone of the model. Without a name it uses the bone of the record, or the bone of the hit volume.
Limits: Any other first word is an "unexpected token" error.
Gates of Hell: adds the mode `truncate`.
Example:
```
{on "drop"
    {bone hide "bomb00"}
}
```
See: [`bone` condition](#bone-1), [`tear`](#tear).

### ani_play
Where: action list.    Type: command. Arguments: `"anim" [speed] [loop] [fake] [resume] [callback]`.
Values: an animation name; a speed, default 1, negative plays it backwards; the four optional words.
Does: Plays an animation of the model. `callback` makes `animation_end` run when it ends.
Limits: None known.
Gates of Hell: adds the word `norestart`, which keeps the animation's current time instead of starting it over.
Example:
```
{on "open"
    {ani_play "open" -1.0 resume}
}
```
See: [`ani_stop`](#ani_stop), [`animation_end`](#animation_end).

### ani_stop
Where: action list.    Type: command. Arguments: `"anim"`.
Values: an animation name.
Does: Stops that animation.
Limits: None known.
Example:
```
{on move off
    {ani_stop "drift"}
}
```
See: [`ani_play`](#ani_play).

### ani_wind
Where: action list.    Type: command. Arguments: `"anim" begin|end`.
Values: an animation name, then `begin` or `end`.
Does: Starts the animation at once at its beginning or at its end, without playing through it.
Limits: None known.
Example:
```
{on spawn
    {ani_wind "open" end}
}
```
See: [`ani_play`](#ani_play).

### animate_place
Where: action list.    Type: command. Arguments: `"seat" "anim"`.
Values: a seat name and an animation name.
Does: Makes the soldier in that seat play an animation.
Limits: An empty seat plays nothing.
Example:
```
{on "jump"
    {animate_place "attach" "paratruper_flight"}
}
```
See: [`ani_play`](#ani_play).

### ik_enable
Where: action list.    Type: command. Arguments: `"bone" yes/no`.
Values: a bone name and a yes/no value.
Does: Switches the inverse kinematics of a bone, such as a turret, on or off.
Limits: None known.
Example:
```
{on break
    {if component "turret" {ik_enable "turret" 0}}
}
```
See: [`ik` event](#ik).

### set_skeleton
Where: action list.    Type: command. Arguments: `"suffix" [sync|nosync]`.
Values: a skeleton name suffix and an optional word.
Does: Switches the object to the model of the description whose name is the object's own name plus the suffix.
Limits: None known.
Gates of Hell: adds the word `local`.
Example:
```
{on "crushed"
    {set_skeleton "_x" sync}
}
```
See: [`tex_mod`](#tex_mod).

### tex_mod
Where: action list.    Type: command. Arguments: `"variant"` or `reset`.
Values: a texture variant name, or the word `reset`.
Does: Switches the model's textures to a variant, such as burned, or back to normal.
Limits: None known.
Example:
```
{on "burned"
    {tex_mod "burned"}
}
```
See: [`tex_morph`](#tex_morph), [`tex_mod` condition](#tex_mod-1).

### tex_morph
Where: action list.    Type: command. Arguments: `"variant" seconds` pairs.
Values: one or more pairs of texture variant and time in seconds.
Does: Blends the textures through the variants over the given times.
Limits: No pairs at all is a load error, "No texMods for morphing".
Example:
```
{on "burn"
    {tex_morph "_burned1" 5 "_burned3" 5}
}
```
See: [`tex_mod`](#tex_mod).

### use_blend_tex
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Nothing in this game; it only warns that it is not supported.
Limits: It is read and ignored.
Example:
```
{on spawn
    {use_blend_tex 1}
}
```
See: [`tex_mod`](#tex_mod).

### use_local_light
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Switches the model's own light on or off.
Limits: None known.
Example:
```
{on "lamp_off"
    {use_local_light 0}
}
```
See: none.

### mtl_enable_skin
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Switches the skin layer of the model's material on or off.
Limits: None known.
Example:
```
{on "burned"
    {mtl_enable_skin 0}
}
```
See: [`tex_mod`](#tex_mod).

### depend_on_wind
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Sets whether the model sways with the wind.
Limits: None known.
Example:
```
{on "fallen"
    {depend_on_wind 0}
}
```
See: none.

### update_shadow
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Nothing visible; nothing in the game reads what it changes.
Limits: None known.
Example:
```
{on "crushed"
    {update_shadow}
}
```
See: none.

### scale
Where: action list.    Type: command. Arguments: `[from k] [to k] [time seconds]`.
Values: `from` default 0.1, `to` default 1, `time` default 10 seconds.
Does: Grows or shrinks the object's size from one factor to another over the time.
Limits: None known.
Example:
```
{on spawn
    {scale from 0.1 to 1 time 10}
}
```
See: none.

## Commands: object state and physics

Chapter 11 teaches this part in [section 6, "Actions"](11-interaction-scripts.md#6-actions).

### tags
Where: action list.    Type: command. Arguments: `add|remove ["tags"]`.
Values: `add` or `remove`, then a text of tags separated by spaces.
Does: Adds tags to the object or removes them. Tags have no limit on number.
Limits: Any other operation is a load error, "Invalid tag operation". New tags do not change which script blocks apply.
Example:
```
{on "crush"
    {tags add "crushed"}
}
```
See: [`tagged`](#tagged).

### volume
Where: action list.    Type: command. Arguments: `enable|disable <abilities...>`.
Values: abilities `visible`, `bullet`, `throwing`, `overlap`, `obstacle`, `contact`, `contact_ground`, `blast`, `select`, `hole`, `holed`, `touch`, `float`, `window`, `nolook`, `nowounddecal`, or `all`.
Does: Switches abilities of the volume in the record on or off.
Limits: An unknown ability is a load error, "invalid volume able"; a word other than enable or disable is "invalid parameter". Without a volume in the record it does nothing. There is no `blockcamera` ability in this game.
Gates of Hell: has a 17th ability, `blockcamera`, which `all` includes, so a script can switch camera blocking.
Example:
```
{on "broken"
    {volume disable contact contact_ground}
}
```
See: [`volumes`](#volumes).

### volumes
Where: action list.    Type: command. Arguments: `["tags"] enable|disable <abilities...>`.
Values: an optional tag text, then the same words and abilities as `volume`.
Does: Switches abilities of all volumes, or of those with the tags, on or off.
Limits: Same as `volume`.
Example:
```
{on "dead"
    {volumes disable touch select}
}
```
See: [`volume`](#volume).

### for_each_volume
Where: action list.    Type: command. Arguments: `["tag"] [delay range] {actions}`.
Values: an optional volume tag, an optional time range in seconds between steps.
Does: Runs the nested actions on each volume, nearest first from the volume in the record, with the delay between them.
Limits: None known.
Example:
```
{for_each_volume 4 0.7
    {burn volume}
}
```
See: [`volume`](#volume).

### for_each_link
Where: action list.    Type: command. Arguments: `{actions}`.
Values: a nested action list.
Does: Runs the nested actions on each object linked to this one.
Limits: None known.
Example:
```
{for_each_link
    {call "explosion_delete"}
}
```
See: [`with_linked_entity`](#with_linked_entity).

### with_linked_entity
Where: action list.    Type: command. Arguments: `"seat role" {actions}`.
Values: a seat role name.
Does: Runs the nested actions on the object linked in that seat.
Limits: An empty seat runs nothing.
Example:
```
{with_linked_entity "front"
    {call "explosion_delete"}
}
```
See: [`for_each_link`](#for_each_link).

### inactive
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Makes the object inactive or active again.
Limits: None known.
Example:
```
{on "parked"
    {inactive 1}
}
```
See: [`inactive` condition](#inactive-1).

### explosive
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Marks the object as explosive or not.
Limits: None known.
Example:
```
{on "defused"
    {explosive 0}
}
```
See: [`explosive_amount`](#explosive_amount).

### area
Where: action list.    Type: command. Arguments: `enable|disable ["tags"]` or `rebuild`.
Values: the words shown and an optional tag text.
Does: Switches the object's ground areas, or those with the tags, on or off, or rebuilds them.
Limits: Any other word is a load error, "Invalid area action".
Example:
```
{on "broken"
    {area disable}
}
```
See: [`change_obstacle`](#change_obstacle).

### change_obstacle
Where: action list.    Type: command. Arguments: `["id"]`.
Values: an optional obstacle id.
Does: Gives the object a different obstacle setting, or clears it without an id.
Limits: Stock data never uses it.
Example:
```
{on "crushed"
    {change_obstacle "low"}
}
```
See: [`area`](#area).

### update_visibility_patch
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Rebuilds the patch the object uses to block line of sight.
Limits: None known.
Example:
```
{on "broken"
    {update_visibility_patch}
}
```
See: none.

### land
Where: action list.    Type: command. Arguments: `on|off`.
Values: `on`, `off`.
Does: Switches the object's land part on or off, if it has one.
Limits: Any other word is an "invalid parameter" error.
Example:
```
{on "crushed"
    {land off}
}
```
See: none.

### physics_work
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Sets whether the object may be simulated by physics. Turning it off also stops a running simulation.
Limits: None known.
Example:
```
{on "fixed"
    {physics_work 0}
}
```
See: [`simulating`](#simulating).

### impulse
Where: action list.    Type: command. Arguments: options.
Values: ranges `up`, `dir`, `forward`, `rnd_dir`, `cx`, `cy`, `cz`, `fx`, `fy`, `fz`, each default 0; words `no_position` and `com`.
Does: Pushes the object. The push is forward along the object's own axis, plus `dir` along the record direction or straight up, plus `up`, plus a random direction, all multiplied by the mass and load; then `fx`, `fy` and `fz` are added. `cx`, `cy` and `cz` move the point of the push; `com` pushes at the centre of mass.
Limits: Any other option word is an "invalid parameter" error.
Example:
```
{on "explosion"
    {impulse up 2 1 dir 2 1}
}
```
See: [`throw_off`](#throw_off).

### gravity
Where: action list.    Type: command. Arguments: `number`.
Values: an acceleration in metres per second squared.
Does: Sets the gravity the object falls with.
Limits: None known.
Gates of Hell: the number is a multiple of normal gravity, so 1 is normal there; a script written for this game with `gravity 9.8` makes the object fall 9.8 times too fast in Gates of Hell. Divide by 9.8 when you move a script across.
Example:
```
{on spawn
    {gravity 1.3}
}
```
See: none.

### constrain_velocity
Where: action list.    Type: command. Arguments: `speed`.
Values: a speed in kilometres per hour.
Does: Caps the object's physics speed.
Limits: Only works while the object is simulated.
Example:
```
{on spawn
    {constrain_velocity 1}
}
```
See: none.

### pillar_fall
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Makes the object simulated and tips it over, away from the record position or in a random direction.
Limits: None known.
Example:
```
{on blast
    {pillar_fall}
}
```
See: [`pillar_up`](#pillar_up).

### pillar_up
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Stops the simulation and stands the object upright again.
Limits: None known.
Example:
```
{on "restore"
    {pillar_up}
}
```
See: [`pillar_fall`](#pillar_fall).

### fall_down
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Makes a simulated object start falling again.
Limits: Only works while the object is simulated.
Example:
```
{on "release"
    {fall_down}
}
```
See: [`simulating`](#simulating).

### kick_entity_manager
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Nothing.
Limits: It has no effect.
Example:
```
{on spawn
    {kick_entity_manager}
}
```
See: none.

## Commands: damage, fire and explosions

Chapter 11 teaches this part in [section 6, "Actions"](11-interaction-scripts.md#6-actions).

### blastwave
Where: action list.    Type: command. Arguments: options.
Values: `c4 charge`, `r0 metres`, `r1 metres`, `bone "b"`, `offset x y z`, `position`.
Does: Sets off a blast at the object's origin, or at the record position when `position` is written and there is one. The damage is blamed on whoever is causing the current damage, or else on the fire burning the object, or else on the object itself.
Limits: An `r1` smaller than `r0` is raised to `r0`.
Example:
```
{on "explosion"
    {blastwave c4 5 r0 4 r1 15}
}
```
See: [`explode_inventory`](#explode_inventory).

### bullet_detonate
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Makes the bullet that hit the object detonate, so it stops passing through.
Limits: Without a bullet in the record it does nothing, so it does nothing inside `delay`.
Example:
```
{on bullet_hit
    {bullet_detonate}
}
```
See: [`bullet_hit`](#bullet_hit).

### fire
Where: action list.    Type: command. Arguments: options.
Values: `radius metres` (default the object's size, or the sphere of the named volume), `time seconds`, `heating n`, `effector`, `volume "name"`, `follow`.
Does: Starts a fire area around the object that heats burnable things nearby.
Limits: None known.
Example:
```
{on "explosion"
    {fire radius 8 time 15 heating 10}
}
```
See: [`burn`](#burn), [`set_heater`](#set_heater).

### burn
Where: action list.    Type: command. Arguments: options.
Values: `volume ["name"]` (without a name, the record volume), `first_volume`, `fx "effect"`, `time centre spread` (default 45 seconds with 7 spread), `fake`, `even_law`, `stop`, `stop_retry`.
Does: Sets the object, or one volume, on fire. Fire effects appear only when `fx` is given. `fake` shows the effect without setting anything on fire; `stop` puts the fire out.
Limits: Without `fx` the object burns with no visible flame. Any other option is a load error, "Unknown burn parameter".
Example:
```
{on "burn"
    {burn volume fx "smoke_dead_tree1" time 15 2 even_law}
}
```
See: [`burned`](#burned), [`fire`](#fire-1).

### set_heater
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Records who set the fire, for the fire the object gets.
Limits: None known.
Example:
```
{on blast
    {set_heater}
}
```
See: [`burn`](#burn).

### health_damage_pierce
Where: action list.    Type: command. Arguments: sub-blocks.
Values: `{effects "hit" "light" "heavy" "killed" "thrown" "thrown_hit" "thrown_killed"}`, optional `{table {x y} ...}`, optional `{explosive_treshold v}`.
Does: Damages a soldier by the bullet's energy minus his armour, then runs one of the custom events named in `effects` by result. A ratio above 0.2 counts as heavy, above 0 as light; the soldier is thrown when health falls below 12 times minus his maximum, or on a heavy hit with a ratio above 6.
Limits: A `table` needs more than four effects, else the error "Throw effects not loaded". An empty effect name runs nothing.
Example:
```
{health_damage_pierce
    {effects "" "damage-low" "damage" "die" "explosion" "explosion" "explosion"}
    {table {30 1} {200 2.5} {500 3}}
}
```
See: [custom events](#events-custom).

### health_damage_blast
Where: action list.    Type: command. Arguments: sub-blocks as `health_damage_pierce`.
Values: as `health_damage_pierce`.
Does: Like `health_damage_pierce`, but the blast's energy does the damage.
Limits: As `health_damage_pierce`.
Example:
```
{health_damage_blast
    {effects "" "hit" "damage" "die" "thrown" "thrown" "thrown"}
}
```
See: [`blast`](#blast).

### health_damage_blow
Where: action list.    Type: command. Arguments: sub-blocks as `health_damage_pierce`.
Values: as `health_damage_pierce`.
Does: Like `health_damage_pierce`, but the strike's value does the damage.
Limits: As `health_damage_pierce`.
Example:
```
{on blow opponent
    {health_damage_blow {effects "" "hit" "damage" "die" "die" "die" "die"}}
}
```
See: [`blow`](#blow).

### health_damage_count
Where: action list.    Type: command. Arguments: `N` then sub-blocks as `health_damage_pierce`.
Values: a fixed damage amount.
Does: Like `health_damage_pierce`, but always deals the fixed amount.
Limits: As `health_damage_pierce`.
Example:
```
{health_damage_count 60
    {effects "" "hit" "damage" "die" "crush"}
}
```
See: [`health_damage_pierce`](#health_damage_pierce).

### health_damage_crush
Where: action list.    Type: command. Arguments: `"alive_effect" "dead_effect"`.
Values: two custom event names.
Does: Runs the first event if the soldier is alive and the second if he is dead.
Limits: None known.
Example:
```
{if can_crush
    {health_damage_crush "die" "crush"}
}
```
See: [`can_crush`](#can_crush).

### die
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Kills the actor.
Limits: Has no effect on an actor that cannot be hurt.
Example:
```
{on "sink"
    {die}
}
```
See: [`impregnable`](#impregnable).

### stat_notify
Where: action list.    Type: command. Arguments: `die|break|leave [burned]`.
Values: one of the three words, then optional `burned`.
Does: Counts the event in the game statistics. `die` and `break` both count as a kill.
Limits: None known.
Example:
```
{on "destroyed"
    {stat_notify break}
}
```
See: none.

### kill_flags
Where: action list.    Type: command. Arguments: words.
Values: `reset`, `front`, `back`, `pistol`, `rifle`, `smg`, `mgun`, `blast`, `piercing`, `go`, `run`.
Does: Sets which kinds of kill a soldier's death counts as.
Limits: Any other word is a load error, "Invalid human kill flags".
Example:
```
{on "die"
    {kill_flags reset}
    {kill_flags piercing}
}
```
See: [`kill_flags` condition](#kill_flags-1).

### attack_save
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Keeps the current damage source for a later `attack_load`.
Limits: None known.
Example:
```
{on bullet_hit
    {attack_save}
}
```
See: [`attack_load`](#attack_load).

### attack_load
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Takes the kept damage source back, so later damage is blamed on it.
Limits: None known.
Example:
```
{on "explosion"
    {attack_load}
}
```
See: [`attack_save`](#attack_save).

### damage_report
Where: action list.    Type: command. Arguments: `"part" "text"`.
Values: a part name and a text key or plain text.
Does: Shows a message about a part of the actor, such as a broken gun.
Limits: Only the local player sees it, for his own units. A misspelt text key shows the raw key.
Example:
```
{on break
    {damage_report "gun" "component/gun_broken"}
}
```
See: [Reference 9](r09-interface-and-localization.md) text keys.

## Commands: vehicles and crew

Chapter 11 teaches this part in [section 6, "Actions"](11-interaction-scripts.md#6-actions).

### component
Where: action list.    Type: command. Arguments: `break|destroy|repair`.
Values: one of the three words.
Does: Sets the part in the record to that state.
Limits: `break` skips a part that is already damaged. Any other word is a load error, "Invalid component state".
Gates of Hell: adds the word `multiple`.
Example:
```
{on bullet_hit
    {if volume "engine" {component break}}
}
```
See: [`components`](#components).

### components
Where: action list.    Type: command. Arguments: `["tags"] break|destroy|repair`.
Values: an optional tag text, then one of the three words.
Does: Sets all parts, or those with the tags, to that state.
Limits: As `component`.
Example:
```
{on "explosion"
    {components "engine" break}
}
```
See: [`component`](#component).

### chassis_work
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Switches the chassis on or off.
Limits: None known.
Example:
```
{on break
    {if component "engine" {chassis_work 0}}
}
```
See: [`engine`](#engine).

### weapon_work
Where: action list.    Type: command. Arguments: `"place" yes/no`.
Values: a weapon place name and a yes/no value.
Does: Switches the weapon in that place on or off.
Limits: None known.
Example:
```
{on repair
    {weapon_work "gun" 1}
}
```
See: [`fire` event](#fire).

### movement_limit
Where: action list.    Type: command. Arguments: `<mode>`.
Values: `slow`, `normal`, `fast`, `walk`, `bow`, `assault`, `spot`, `sneak`.
Does: Sets the fastest movement mode the chassis may use.
Limits: Any other word is a load error, "Invalid movement mode".
Example:
```
{on break
    {movement_limit normal}
}
```
See: [`movement_mode_changed`](#movement_mode_changed).

### movement_type
Where: action list.    Type: command. Arguments: `<type>`.
Values: `normal`, `crawl`, `squat`, `swim`.
Does: Sets the chassis movement type.
Limits: Any other word is a load error, "Invalid movement type". Stock data never uses it.
Example:
```
{on terrain_pp "water" enter
    {movement_type swim}
}
```
See: [`movement_limit`](#movement_limit).

### crew_enable
Where: action list.    Type: command. Arguments: `place|group "name" yes/no`.
Values: `place` or `group`, a seat role or group name, and a yes/no value.
Does: Enables or disables the seats of that role or group.
Limits: None known.
Example:
```
{on break
    {crew_enable place "driver" 0}
}
```
See: [`kill_crew`](#kill_crew).

### kill_crew
Where: action list.    Type: command. Arguments: `["role"]`.
Values: an optional seat role or group.
Does: Kills the crew of the actor, or of that role.
Limits: None known.
Example:
```
{on "explosion"
    {kill_crew "gunner"}
}
```
See: [`crew_throw_off`](#crew_throw_off).

### crew_emit
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Makes the crew who sit in place or inside leave the vehicle.
Limits: Soldiers riding on top are not affected.
Gates of Hell: does nothing on an aircraft more than 0.5 m above the ground, and takes the word `force`, which orders every occupant out.
Example:
```
{on operatable off
    {crew_emit}
}
```
See: [`get_off`](#get_off).

### crew_throw_off
Where: action list.    Type: command. Arguments: options.
Values: as `throw_off`; `force` is on by default.
Does: Throws the crew out of the vehicle.
Limits: As `throw_off`.
Example:
```
{on "explosion"
    {crew_throw_off up 4 1 dir 5 1 turn 0 180 forward 2 die}
}
```
See: [`throw_off`](#throw_off).

### get_off
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Makes the soldier leave the vehicle he sits in.
Limits: Works on soldiers only.
Gates of Hell: replaced by `unlink`, which works for any occupant of any seat (a soldier gets off, anything else is freed from the seat). This game stops at `unlink` as an unknown action and Gates of Hell does not know `get_off`, so convert it both ways.
Example:
```
{on "bail_out"
    {get_off}
}
```
See: [`crew_emit`](#crew_emit).

### auto_operatable
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Sets whether the actor is usable without crew, and updates its usable state.
Limits: None known.
Example:
```
{on spawn
    {auto_operatable 1}
}
```
See: [`operatable` event](#operatable).

### player
Where: action list.    Type: command. Arguments: `id`.
Values: a player number; stock data uses -1.
Does: Hands the actor to that player.
Limits: None known.
Example:
```
{on "abandon"
    {player -1}
}
```
See: [`grounded`](#grounded).

### unlink_trailer
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Lets go of the cargo and sets up the gun towed behind the vehicle again.
Limits: None known.
Example:
```
{on "destroyed"
    {unlink_trailer}
}
```
See: none.

### link_grenade_to_nearest_human
Where: action list.    Type: command. Arguments: `[teleport]`.
Values: the optional word `teleport`.
Does: Ties the grenade to the nearest soldier, moving it to him with `teleport`.
Limits: None known.
Example:
```
{on spawn
    {link_grenade_to_nearest_human teleport}
}
```
See: none.

### break_window_in_hole
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Breaks the window volume of the instigator nearest to the target and fires the `break_window` custom event.
Limits: None known.
Example:
```
{on "in_hole"
    {break_window_in_hole}
}
```
See: [custom events](#events-custom).

### take_off
Where: action list.    Type: command. Arguments: `"holder" {actions}`.
Values: a holder name, such as `head`.
Does: Takes off the item the soldier wears in that holder and runs the nested actions on it.
Limits: None known.
Example:
```
{take_off "head"
    {impulse up 2 1}
}
```
See: none.

### clear_inventory
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Empties the actor's inventory and fuel.
Limits: None known.
Example:
```
{on "destroyed"
    {clear_inventory}
}
```
See: [`stuff_filled`](#stuff_filled).

## Commands: soldiers

Chapter 11 teaches this part in [section 6, "Actions"](11-interaction-scripts.md#6-actions).

### able
Where: action list.    Type: command. Arguments: `<name> yes/no` pairs.
Values: an ability name, plain or quoted, then a yes/no value; several pairs may follow.
Does: Switches abilities of the actor on or off, such as `select`, `burning` or `sinking`.
Limits: An unknown name is a load error, "invalid ability". The whole game can hold at most 32 ability names.
Example:
```
{on "sink"
    {able select 0}
    {able "sinking" 1}
}
```
See: [`able` condition](#able-1).

### stunned
Where: action list.    Type: command. Arguments: `yes/no`.
Values: a yes/no value.
Does: Stuns the actor or lifts the stun.
Limits: None known.
Example:
```
{on "flash"
    {stunned 1}
}
```
See: [`knockdown`](#knockdown).

### knockdown
Where: action list.    Type: command. Arguments: `seconds [spread]`.
Values: a time range in seconds.
Does: Makes the soldier fall and lie for the time.
Limits: Works on soldiers only.
Example:
```
{with_effector
    {knockdown 12 3}
}
```
See: [`stunned`](#stunned).

### throw_off
Where: action list.    Type: command. Arguments: options.
Values: ranges `up`, `dir`, `forward` and `turn` (degrees); `force yes/no`, `die yes/no`, `rnd_die chance`, `rotate_to_dir yes/no`.
Does: Throws the soldier through the air, optionally killing him or killing him with a chance.
Limits: Throwing a soldier who is already being simulated only logs a warning.
Example:
```
{on "thrown"
    {throw_off up 1.3 0.5 dir 5.5 2 forward 4 turn 0 360 force}
}
```
See: [`crew_throw_off`](#crew_throw_off).

### throw_on_ground
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Restarts the soldier's behaviour and places him on the ground where he is.
Limits: None known.
Example:
```
{on "landed"
    {throw_on_ground}
}
```
See: [`throw_off`](#throw_off).

### reset_manual_control
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Takes the unit out of the player's direct control and drops its aim.
Limits: None known.
Example:
```
{on "die"
    {reset_manual_control}
}
```
See: [`user_control`](#user_control).

### drop_orders
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Makes the unit forget the orders it was given.
Limits: None known.
Example:
```
{on "stunned"
    {drop_orders}
}
```
See: none.

### smoke
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Makes the soldier have a smoke.
Limits: Works on soldiers only.
Example:
```
{on "idle"
    {smoke}
}
```
See: none.

## Conditions

Chapter 11 teaches this part in [section 5, "Conditions"](11-interaction-scripts.md#5-conditions).

A condition is written after `if` or `else`, with `not` in front to reverse it. In the entries below, "Arguments" lists what follows the condition name.

### "flag"
Where: `if` or `else` branch.    Type: condition. Arguments: the quoted flag name alone.
Values: any flag set with `set`.
Does: Holds when the flag is set on this object.
Limits: Each flag name tested counts towards the limit of 128 names in the whole game.
Example:
```
{if not "broken"
    {set "broken" 1}
}
```
See: [`set`](#set).

### able
Where: `if` or `else` branch.    Type: condition. Arguments: `"name"`.
Values: an ability name.
Does: Holds when the actor has that ability switched on.
Limits: None known.
Example:
```
{if able "burning"
    {able "burning" 0}
}
```
See: [`able` command](#able).

### tagged
Where: `if` or `else` branch.    Type: condition. Arguments: `"tags"`.
Values: a tag text.
Does: Holds when the object has the tags.
Limits: None known.
Example:
```
{if not tagged "crushed"
    {tags add "crushed"}
}
```
See: [`tags`](#tags).

### name
Where: `if` or `else` branch.    Type: condition. Arguments: `"names"`.
Values: one or more names.
Does: Holds when the sender text of the record is one of the names, such as `pierce` or `blast`.
Limits: Without a sender it is false.
Example:
```
{if name "pierce"
    {component break}
}
```
See: [`break_armor`](#break_armor).

### volume
Where: `if` or `else` branch.    Type: condition. Arguments: `"tags"`.
Values: a volume tag text.
Does: Holds when the volume in the record has the tags.
Limits: Without a volume in the record it is false, as inside `delay`.
Example:
```
{if volume "body"
    {component break}
}
```
See: [`volume` command](#volume).

### volume_armored
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the object has armour where the record's volume is.
Limits: Without a volume it is false.
Example:
```
{if not volume_armored
    {burn volume}
}
```
See: [`volume`](#volume-1).

### volume_bone_level
Where: `if` or `else` branch.    Type: condition. Arguments: `n`.
Values: a whole number.
Does: Holds when the bone of the record's volume sits at least n bones below the root of the model.
Limits: Without a volume it is false.
Example:
```
{if volume_bone_level 3
    {bone cut}
}
```
See: [`bone`](#bone-1).

### material
Where: `if` or `else` branch.    Type: condition. Arguments: `"m"`.
Values: a material name.
Does: Holds when the volume in the record is of that material.
Limits: None known.
Example:
```
{if material "flesh"
    {call "hit"}
}
```
See: none.

### component
Where: `if` or `else` branch.    Type: condition. Arguments: `"tags"`.
Values: a part tag text.
Does: Holds when the part in the record has the tags.
Limits: Without a part it is false.
Example:
```
{if component "engine"
    {chassis_work 0}
}
```
See: [`component` command](#component).

### work
Where: `if` or `else` branch.    Type: condition. Arguments: `["tags" [count]]`.
Values: an optional part tag text and an optional number.
Does: Without tags, holds when the record's part works. With tags, holds when every part with the tags works, or at least the count of them when a count is given.
Limits: None known.
Example:
```
{if work "engine"
    {chassis_work 1}
}
```
See: [`broken`](#broken), [`destroyed`](#destroyed).

### broken
Where: `if` or `else` branch.    Type: condition. Arguments: `["tags" [count]]`.
Values: as `work`.
Does: As `work`, for broken parts.
Limits: None known.
Example:
```
{if broken "wheel" 2
    {chassis_work 0}
}
```
See: [`work`](#work).

### destroyed
Where: `if` or `else` branch.    Type: condition. Arguments: `["tags" [count]]`.
Values: as `work`.
Does: As `work`, for destroyed parts.
Limits: None known.
Example:
```
{if destroyed "turret"
    {call "explosion"}
}
```
See: [`work`](#work).

### bone
Where: `if` or `else` branch.    Type: condition. Arguments: `"b" [visible]`.
Values: a bone name and the optional word `visible`.
Does: Holds when the model has that bone; with `visible`, only when the bone is also shown.
Limits: None known.
Example:
```
{if not bone "fx_glass0"
    {spawn "glass_break"}
}
```
See: [`bone` command](#bone).

### stuff
Where: `if` or `else` branch.    Type: condition. Arguments: `"tags"`.
Values: an item tag text.
Does: Holds when the record's source item, such as the ammunition that hit, has all the tags.
Limits: None known.
Gates of Hell: takes one or more tag texts and holds when the item has all the tags of any one of them; with none it stops with "At least one stuff descriptor expected".
Example:
```
{if stuff "molotov_coctail"
    {burn}
}
```
See: none.

### stuff_filled
Where: `if` or `else` branch.    Type: condition. Arguments: `"tag" [count]`.
Values: an item tag and an optional whole number.
Does: Holds when the object is an item, such as a fuel can, whose filling has the tag and more than the count of it.
Limits: None known.
Example:
```
{if stuff_filled "fuel" 20
    {burn}
}
```
See: [`clear_inventory`](#clear_inventory).

### stuff_activated
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the object is an item that has been activated by a player side.
Limits: None known.
Example:
```
{if stuff_activated
    {call "explosion"}
}
```
See: none.

### explosive_amount
Where: `if` or `else` branch.    Type: condition. Arguments: `N`.
Values: a number.
Does: Holds when the object carries more explosives than N.
Limits: None known.
Example:
```
{if explosive_amount 50
    {explode_inventory {5 "ex_arm_sm" 3}}
}
```
See: [`explode_inventory`](#explode_inventory).

### rand
Where: `if` or `else` branch.    Type: condition. Arguments: `p`.
Values: a chance between 0 and 1.
Does: Holds with that chance.
Limits: See the multiplayer note at the top of this chapter. In very rare cases, when the random number generator reaches one particular state, this condition stops the game.
Gates of Hell: does not have this stop.
Example:
```
{if rand 0.3
    {burn}
}
```
See: none.

### min_energy
Where: `if` or `else` branch.    Type: condition. Arguments: `N`.
Values: a number.
Does: Holds when the record value, such as a hit's energy, is above N.
Limits: None known.
Example:
```
{if min_energy 300
    {call "explosion"}
}
```
See: [`blast_hit`](#blast_hit).

### min_mass
Where: `if` or `else` branch.    Type: condition. Arguments: `kg`.
Values: a mass in kilograms.
Does: Holds when the object and its load weigh more than that.
Limits: None known.
Example:
```
{if min_mass 1000
    {spawn "dust_big"}
}
```
See: [`hit`](#hit).

### min_speed
Where: `if` or `else` branch.    Type: condition. Arguments: `speed`.
Values: a speed in kilometres per hour.
Does: Holds when the record value, read as a speed, is faster than that in either direction.
Limits: None known.
Example:
```
{if min_speed 20
    {component break}
}
```
See: [`velocity`](#velocity).

### velocity
Where: `if` or `else` branch.    Type: condition. Arguments: `speed`.
Values: a speed in kilometres per hour.
Does: Holds when the object moves faster than that. `not velocity 0` tests that it stands still.
Limits: None known.
Example:
```
{if velocity 8
    {play_sound "moving" 1}
}
```
See: [`min_speed`](#min_speed).

### effector_velocity
Where: `if` or `else` branch.    Type: condition. Arguments: `speed`.
Values: a speed in kilometres per hour.
Does: Holds when the instigator moves towards the object faster than that.
Limits: Without an instigator it is false.
Example:
```
{if effector_velocity 10
    {pillar_fall}
}
```
See: [`effector`](#effector).

### contact_velocity
Where: `if` or `else` branch.    Type: condition. Arguments: `speed`.
Values: a speed in kilometres per hour.
Does: Holds when the record value, the contact speed, is faster than that in either direction.
Limits: None known.
Example:
```
{if contact_velocity 20
    {component break}
}
```
See: [`contact`](#contact).

### effector
Where: `if` or `else` branch.    Type: condition. Arguments: `"tags"`.
Values: a tag text.
Does: Holds when the instigator has the tags.
Limits: Without an instigator it is false.
Example:
```
{if effector "tank"
    {pillar_fall}
}
```
See: [`with_effector`](#with_effector).

### mine_effector
Where: `if` or `else` branch.    Type: condition. Arguments: `"tags"`.
Values: a tag text.
Does: Holds when the instigator, or the vehicle carrying it, is an actor with the tags that is not allied to the player who laid the mine.
Limits: None known.
Example:
```
{if mine_effector "human"
    {call "explosion"}
}
```
See: [`mined`](#mined).

### can_crush
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the instigator is a vehicle that drives over the object.
Limits: None known.
Example:
```
{if can_crush
    {health_damage_crush "die" "crush"}
}
```
See: [`health_damage_crush`](#health_damage_crush).

### burned
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the object has burned.
Limits: None known.
Example:
```
{if not burned
    {burn}
}
```
See: [`burn`](#burn).

### hit_side
Where: `if` or `else` branch.    Type: condition. Arguments: `front|back|left|right|top|bottom`.
Values: one of the six side names.
Does: Holds when the hit came from that side.
Limits: A number or any other word is a load error, "Unknown side". Without a bullet in the record only `front` and `back` work, judged by position.
Example:
```
{if hit_side front
    {component break}
}
```
See: [`bullet_hit`](#bullet_hit).

### kill_flags
Where: `if` or `else` branch.    Type: condition. Arguments: `blast|piercing`.
Values: `blast` or `piercing`.
Does: Holds when the soldier's kill counts as that kind.
Limits: None known.
Example:
```
{if kill_flags blast
    {throw_off up 4 dir 3 1 die force}
}
```
See: [`kill_flags` command](#kill_flags).

### terrain_pp
Where: `if` or `else` branch.    Type: condition. Arguments: `"type"`.
Values: a ground type name.
Does: Holds when the object stands on that ground type.
Limits: Stock data never uses it.
Example:
```
{if terrain_pp "water"
    {able "sinking" 1}
}
```
See: [`terrain_pp` event](#terrain_pp).

### terrain_fx
Where: `if` or `else` branch.    Type: condition. Arguments: `"material"`.
Values: a ground effect material name.
Does: Holds when the object stands on that ground material.
Limits: None known.
Example:
```
{if terrain_fx "snow"
    {play_sound "move_snow" 1}
}
```
See: [`terrain_fx` event](#terrain_fx).

### sunlight
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds in daytime.
Limits: None known.
Example:
```
{if not sunlight
    {use_local_light 1}
}
```
See: none.

### rain
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when it is raining on the map.
Limits: None known.
Example:
```
{if rain
    {burn stop}
}
```
See: none.

### altitude
Where: `if` or `else` branch.    Type: condition. Arguments: `m`.
Values: a height in metres.
Does: Holds when the object is higher than that above the ground or the water.
Limits: None known.
Example:
```
{if altitude 5
    {call "crash"}
}
```
See: [`air`](#air).

### air
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the record position, or the object when there is none, is in the air.
Limits: None known.
Example:
```
{if air
    {fall_down}
}
```
See: [`altitude`](#altitude).

### under_water
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the record position, or the object when there is none, is under water.
Limits: None known.
Example:
```
{if under_water
    {burn stop}
}
```
See: [`water_level`](#water_level).

### water_level
Where: `if` or `else` branch.    Type: condition. Arguments: `m`.
Values: a depth in metres.
Does: Holds when the object is in water deeper than that.
Limits: None known.
Example:
```
{if water_level 1.2
    {chassis_work 0}
}
```
See: [`under_water`](#under_water).

### linked
Where: `if` or `else` branch.    Type: condition. Arguments: `["host tag"]`.
Values: an optional host tag.
Does: Holds when the object has boarded a host, or a host with that tag.
Limits: None known.
Example:
```
{if not linked
    {delete}
}
```
See: [`for_each_link`](#for_each_link).

### boarding
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds while the actor is in the middle of boarding a host.
Limits: None known.
Example:
```
{if boarding
    {drop_orders}
}
```
See: [`board`](#board).

### place
Where: `if` or `else` branch.    Type: condition. Arguments: `"role"`.
Values: a seat role.
Does: Holds when the object has boarded its host in a seat of that role.
Limits: None known.
Example:
```
{if place "driver"
    {get_off}
}
```
See: [`crew_in_place`](#crew_in_place).

### crew_in_place
Where: `if` or `else` branch.    Type: condition. Arguments: `"role"`.
Values: a seat role.
Does: Holds when someone sits in a seat of that role in the vehicle.
Limits: None known.
Gates of Hell: false for a seat sealed behind a closed hatch, so a buttoned-up commander is not "in place".
Example:
```
{if crew_in_place "gunner"
    {kill_crew "gunner"}
}
```
See: [`kill_crew`](#kill_crew).

### has_place
Where: `if` or `else` branch.    Type: condition. Arguments: `"role"`.
Values: a seat role.
Does: Holds when the object has a seat of that role.
Limits: Stock data never uses it.
Example:
```
{if has_place "commander"
    {kill_crew "commander"}
}
```
See: [`crew_in_place`](#crew_in_place).

### chassis
Where: `if` or `else` branch.    Type: condition. Arguments: `"type"`.
Values: a chassis type name.
Does: Holds when the actor's chassis is of that type.
Limits: None known.
Example:
```
{if not chassis "airborne"
    {component break}
}
```
See: none.

### difficulty
Where: `if` or `else` branch.    Type: condition. Arguments: `"level"`.
Values: a difficulty name, such as `multiplayer`.
Does: Holds when the mission is played at that difficulty.
Limits: None known.
Example:
```
{if difficulty "multiplayer"
    {able select 0}
}
```
See: none.

### mined
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the object is an armed mine.
Limits: None known.
Example:
```
{if mined
    {call "explosion"}
}
```
See: [`mine_effector`](#mine_effector).

### fallen
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the object has tipped over with `pillar_fall`.
Limits: None known.
Example:
```
{if not fallen
    {pillar_fall}
}
```
See: [`pillar_fall`](#pillar_fall).

### fogged
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the fog of war hides the object from the local player's side, unless the instigator is its ally.
Limits: The answer differs between players in multiplayer, so actions under it can make the game drift apart between machines (unconfirmed).
Example:
```
{if not fogged
    {start_sound "world/ambient/bomber_flyby.wav"}
}
```
See: [the multiplayer note](#how-to-read-this-chapter) at the top.

### tex_mod
Where: `if` or `else` branch.    Type: condition. Arguments: `"variants..."`.
Values: one or more texture variant names.
Does: Holds when the model shows one of those texture variants.
Limits: None known.
Example:
```
{if tex_mod "_crushed"
    {delete}
}
```
See: [`tex_mod` command](#tex_mod).

### flora_regenerate
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds in a multiplayer game whose settings have plant regrowth switched on; otherwise it is always false.
Limits: None known.
Example:
```
{if flora_regenerate
    {pillar_up}
}
```
See: none.

### simulating
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds while the object is being simulated by physics.
Limits: None known.
Example:
```
{if simulating
    {fall_down}
}
```
See: [`physics_work`](#physics_work).

### impregnable
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the object cannot be hurt.
Limits: None known.
Example:
```
{if not impregnable
    {die}
}
```
See: [`die`](#die).

### move_forward
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the chassis moves forward.
Limits: Stock data never uses it.
Example:
```
{if move_forward
    {play_sound "moving" 1}
}
```
See: [`move`](#move).

### move_backward
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the chassis moves backward.
Limits: Stock data never uses it.
Example:
```
{if move_backward
    {play_sound "reverse" 1}
}
```
See: [`move`](#move).

### turn_left
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the chassis turns left.
Limits: Stock data never uses it.
Example:
```
{if turn_left
    {ani_play "steer_left"}
}
```
See: [`turn`](#turn).

### turn_right
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the chassis turns right.
Limits: Stock data never uses it.
Example:
```
{if turn_right
    {ani_play "steer_right"}
}
```
See: [`turn`](#turn).

### dead
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the actor is dead.
Limits: None known.
Example:
```
{if dead
    {hide 3}
}
```
See: [`die`](#die).

### senseless
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the soldier is unconscious.
Limits: None known.
Example:
```
{if senseless
    {drop_orders}
}
```
See: none.

### personage
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the actor has the personage ability switched on.
Limits: None known.
Example:
```
{if not personage
    {die}
}
```
See: none.

### operatable
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the vehicle or gun is usable.
Limits: None known.
Example:
```
{if operatable
    {crew_emit}
}
```
See: [`operatable` event](#operatable).

### inactive
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the object is inactive.
Limits: Stock data never uses it.
Example:
```
{if inactive
    {inactive 0}
}
```
See: [`inactive` command](#inactive).

### swimming
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the actor's pose is swimming.
Limits: None known.
Example:
```
{if swimming
    {burn stop}
}
```
See: [`swim`](#swim).

### lying
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the actor's pose is lying.
Limits: None known.
Example:
```
{if not lying
    {knockdown 3}
}
```
See: [`knockdown`](#knockdown).

### user_control
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the player controls the unit directly.
Limits: None known.
Example:
```
{if user_control
    {reset_manual_control}
}
```
See: [`reset_manual_control`](#reset_manual_control).

### user_squad
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the player controls the unit and it belongs to a squad.
Limits: Stock data never uses it.
Example:
```
{if user_squad
    {talk "injuring"}
}
```
See: none.

### true
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Always holds.
Limits: Stock data never uses it.
Example:
```
{if true
    {con "reached"}
}
```
See: [`false`](#false).

### false
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Never holds. You can use it to switch off a branch while testing.
Limits: Stock data never uses it.
Example:
```
{if false
    {delete}
}
```
See: [`true`](#true).

## Not described yet

None. Every event, command and condition the game accepts has an entry above.

## Gates of Hell only

<!-- goh: GHINT-17 GHINT-18 GHINT-21 GHINT-23 GHINT-26 GHINT-39 GHINT-40 GHINT-41 GHINT-42 GHINT-43 GHINT-44 GHINT-45 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

Gates of Hell interaction scripts use the events, commands and conditions below, which this game does not know. Each one in a ported file stops this game at load with "unexpected token", "unknown action" or "unknown condition", so remove or replace them when you bring a Gates of Hell script across. [Chapter 11](11-interaction-scripts.md#gates-of-hell-summary) sums up the other differences, and [Take a unit from Gates of Hell](p12-unit-from-gates-of-hell.md) walks through a port.

### destroy
Where: interaction file, `{on destroy ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when a vehicle part is destroyed. In this game a destroyed part runs [`break`](#break) instead.
Limits: In a ported file, move the actions into a `break` handler.
Example:
```
{on destroy
    {if component "body"
        {call "explosion"}
    }
}
```
See: [`break`](#break), [Events: combat and damage](#events-combat-and-damage).

### blast_wreaked
Where: interaction file, `{on blast_wreaked ...}` handler.    Type: event, no word after it.
Values: none.
Does: Runs when a blast goes through armour. It also runs the effect of the same name.
Limits: None known.
Example:
```
{on blast_wreaked sync
    {vehicle_health_damage_blast}
}
```
See: [`blast`](#blast), [`blast_hit`](#blast_hit).

### animation_event
Where: interaction file, `{on animation_event "name" ...}` handler.    Type: event, a quoted name after it.
Values: the name of an event placed in an animation.
Does: Runs when a playing animation reaches the named event.
Limits: The name must match the event in the animation.
Example:
```
{on animation_event "close"
    {if cannon_state "fire"
        {call "hide_wheels"}
    }
}
```
See: [`ani_play`](#ani_play), [Events: custom](#events-custom).

### hatch
Where: interaction file, `{on hatch open ...}` or `{on hatch close ...}` handler.    Type: event, `open` or `close` after it.
Values: `open`, `close`.
Does: Runs when a hatch opens or closes. What triggers it in the game is not confirmed.
Limits: No stock Gates of Hell script uses it.
Form:
```
{on hatch open
    ...
}
```
See: [`animation_event`](#animation_event).

### call_synced
Where: action list.    Type: command. Arguments: an event, written as after `on`.
Values: a quoted custom name.
Does: Works like [`call`](#call), and the host also sends the call to the other players, so it runs on every machine.
Limits: In a ported file, `call` is the nearest command here.
Example:
```
{call_synced "engine2_start_sequence"}
```
See: [`call`](#call), [Events: custom](#events-custom).

### holder_drop
Where: action list.    Type: command. Arguments: a quoted holder name.
Values: the name of a holder on the soldier or object.
Does: The item in that holder falls to the ground.
Limits: No stock Gates of Hell script uses it.
Form:
```
{holder_drop "<holder name>"}
```
See: [`get_off`](#get_off).

### set_idle_animation
Where: action list on a soldier.    Type: command. Arguments: one or more quoted animation names.
Values: animation names.
Does: Picks one of the names at random as the soldier's idle animation.
Limits: Gates of Hell scripts use it together with a `select_idle` effect.
Example:
```
{set_idle_animation "stand_look_around_gun" "stand_look_around_gun_1"}
```
See: [`ani_play`](#ani_play), [`no_stuff`](#no_stuff), [`hold_strap`](#hold_strap).

### unlink
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Frees the object from the seat it sits in. A soldier gets off; anything else is taken out of the seat. It works for any seat kind. Only the host runs it.
Limits: It replaces [`get_off`](#get_off), which Gates of Hell does not know. Convert one to the other in both directions.
Example:
```
{unlink}
```
See: [`get_off`](#get_off).

### vehicle_health_damage_pierce
Where: action list on a vehicle.    Type: command. Arguments: none.
Values: none.
Does: Takes hit points from the part that a shell went through. The damage is the shell's penetration minus the armour thickness, times a modifier, plus a minimum damage. Only the host runs it, and the part's broken or destroyed state is sent to the other players.
Limits: Gates of Hell parts have hit points; this game's parts do not, so there is nothing to port it to directly.
Example:
```
{on pierce sync
    {vehicle_health_damage_pierce}
}
```
See: [`vehicle_health_damage_blast`](#vehicle_health_damage_blast), [`pierce`](#pierce).

### vehicle_health_damage_blast
Where: action list on a vehicle.    Type: command. Arguments: none.
Values: none.
Does: Takes hit points from a part hit by a blast. The damage is the blast's force minus the part's threshold, times a blast modifier. Only the host runs it.
Limits: None known.
Example:
```
{on blast_wreaked sync
    {vehicle_health_damage_blast}
}
```
See: [`vehicle_health_damage_pierce`](#vehicle_health_damage_pierce), [`blast`](#blast).

### linear_damping
Where: action list.    Type: command. Arguments: a number.
Values: any number; 0 means no damping.
Does: Sets how fast the object's physics body loses speed.
Limits: None known.
Example:
```
{linear_damping 0}
```
See: [`gravity`](#gravity).

### restore_volume_states
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Sets the abilities of every collision volume back to what the object's definition gives them.
Limits: It undoes every change made with the `volume` command.
Example:
```
{restore_volume_states}
```
See: [`volume` command](#volume).

### mark_for_persistence
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Marks the object to be kept from one game to the next. Gates of Hell scripts use it for Conquest maps.
Limits: None known.
Example:
```
{mark_for_persistence}
```
See: [`delete`](#delete).

### wind_detail_bending
Where: action list.    Type: command. Arguments: none.
Values: none.
Does: Lets the wind bend the object's bones tagged `branches` or `foliage`.
Limits: What reads the flag after it is set is not confirmed.
Example:
```
{wind_detail_bending}
```
See: none.

### prop
Where: `if` or `else` branch.    Type: condition. Arguments: a quoted tag.
Values: a tag of the object's description.
Does: Holds when the object's description has that tag.
Limits: None known.
Example:
```
{if prop "severable"
    {if rand 0.7 ("imp" args "head" "basis")}
}
```
See: [`tagged`](#tagged).

### volume_any
Where: `if` or `else` branch.    Type: condition. Arguments: a quoted list of tags.
Values: collision volume tags, separated by spaces.
Does: Holds when the hit volume has any one of the tags. The [`volume`](#volume-1) condition needs all of them.
Limits: None known.
Example:
```
{if volume_any "head face"
    {ani_play "flinch/flinch_head_01" norestart}
}
```
See: [`volume` condition](#volume-1).

### no_stuff
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the soldier carries nothing.
Limits: None known.
Example:
```
{if no_stuff
    {set_idle_animation %no_gun}
}
```
See: [`stuff`](#stuff).

### active
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the object, or the object it is mounted on, is selected.
Limits: No stock Gates of Hell script uses it.
Form:
```
{if active
    ...
}
```
See: none.

### friendly_fire
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the command record is marked as friendly fire. Which events set the mark is not confirmed.
Limits: None known.
Example:
```
{if friendly_fire
    {delay 0
        ("friendly_destroy" args frontlines)
    }
}
```
See: none.

### standing
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the soldier stands.
Limits: None known.
Example:
```
{if in_cover
    ...
else standing
    {if idle_low_health
        ...
    }
else squatting
    ("select_idle_empty_or_gun" probability(0.5) no_gun("idle_crouch_empty") with_gun("idle_crouch_gun"))
}
```
See: [`squatting`](#squatting), [`in_cover`](#in_cover).

### squatting
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the soldier crouches.
Limits: None known.
Example:
```
{if in_cover
    ...
else squatting
    ("select_idle_empty_or_gun" probability(0.5) no_gun("idle_crouch_empty") with_gun("idle_crouch_gun"))
}
```
See: [`standing`](#standing), [`cover_type`](#cover_type).

### in_cover
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the soldier is in cover.
Limits: None known.
Example:
```
{if in_cover
    {if cover_type "look_left"
        ; do nothing
    else standing
        ...
    }
}
```
See: [`cover_type`](#cover_type).

### cover_type
Where: `if` or `else` branch.    Type: condition. Arguments: one or more quoted cover kinds.
Values: cover kind names, such as `look_left` or `hide_squat`.
Does: Holds when the soldier's cover is one of the kinds.
Limits: With no kind, the file stops with "At least one cover type expectd" (spelt that way).
Example:
```
{if cover_type "hide_squat"
    {set_idle_animation "idle_crouch_gun"}
}
```
See: [`in_cover`](#in_cover).

### idle_low_health
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the soldier should play the low health idle.
Limits: None known.
Example:
```
{if idle_low_health
    ;{set_idle_animation "stand_low_health"}
else stuff "mgun weapon"
    ("select_idle_stand_2hands")
}
```
See: [`set_idle_animation`](#set_idle_animation).

### hold_strap
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when the soldier's weapon is one carried on a shoulder strap, such as a rifle.
Limits: None known.
Example:
```
{if hold_strap
    {set_idle_animation "stand_idle_strap_1" "stand_idle_strap_2"}
}
```
See: [`set_idle_animation`](#set_idle_animation).

### gamemode
Where: `if` or `else` branch.    Type: condition. Arguments: a quoted game type.
Values: a multiplayer game type name.
Does: Holds when the multiplayer game is of that type.
Limits: Always false outside multiplayer. No stock Gates of Hell script uses it.
Form:
```
{if gamemode "<game type>"
    ...
}
```
See: [`season`](#season).

### season
Where: `if` or `else` branch.    Type: condition. Arguments: a quoted season name.
Values: a season, such as `winter`.
Does: Holds when the multiplayer map is set to that season. Gates of Hell uses it to pick winter or summer effects.
Limits: Always false outside multiplayer.
Example:
```
{if rain
    {spawn "ex_ap_size2"}
else season "winter"
    {spawn "ex_ap_size2"}
else
    {spawn "ex_ap_size2_dust"}
}
```
See: [`gamemode`](#gamemode), [`spawn`](#spawn-1).

### weaponry_sealed
Where: `if` or `else` branch.    Type: condition. Arguments: none.
Values: none.
Does: Holds when any seat of the vehicle is sealed.
Limits: No stock Gates of Hell script uses it.
Form:
```
{if weaponry_sealed
    ...
}
```
See: [`crew_in_place`](#crew_in_place).

### cannon_state
Where: `if` or `else` branch.    Type: condition. Arguments: a quoted state.
Values: `fire`, `move`, `trailing`.
Does: Holds when the gun is in that state: ready to fire, set up to move, or (probably) being towed.
Limits: On an object that is not a gun it probably crashes the game. Use it only in blocks for guns.
Example:
```
{if cannon_state "fire"
    {play_sound "rotate_turret" 1}
}
```
See: [`animation_event`](#animation_event).
