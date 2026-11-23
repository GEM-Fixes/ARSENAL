# 11. Interaction Scripts

Every event, condition and command named in this chapter has its own entry in [Reference 10: Interaction scripts](r10-interaction-scripts.md), with its exact arguments and what silently fails. Use this chapter to understand how scripts work, and the reference to look up one word.

## What you will learn

- What interaction scripts are and which behaviour they control (damage, fire, smoke, cook-off, crew reactions, wrecks).
- How the game decides which script blocks apply to which unit, and in what order they run.
- The event, condition and action vocabulary, with worked examples.
- How timers, flags, tags and custom events work, and where their limits are.
- How to write scripts in the ARSENAL Editor and check them with `ARSENAL ialint`.

Interaction scripts are a small event-driven language. Most of what you see a vehicle or soldier do when something happens to it, such as a hit, a fire, a crash or a death, is decided here and not in the game's program. That makes it one of the most powerful and most editable parts of the game.

Work in your own mod folder (for example `mods/mymod/resource/set/interaction_entity/`). Text files use CRLF line endings; the 64-bit build reads every string value as UTF-8, in data files and `.lng` files alike, and identifiers must be plain ASCII. Original data is ASCII outside `;` comments, where some old cp1251 bytes remain; leave them as they are. See [chapter 3](03-mod-folder-and-load-order.md) for how your files override vanilla ones.

## 1. Where scripts live

The entry file is `set/interaction_entity/entity.set`. In vanilla it only lists other files, in order: `generic.inc`, `human.inc`, `vehicle.inc`, `car.inc`, `tank.inc`, `cannon.inc` and many more. Those files hold top-level blocks, each named by a space-separated list of tags. This is part of the vanilla block for medium tanks in `tank.inc`:

```
{"medium tank"
	{inflammation_time 30}
	{on blast_hit
		{if min_energy 30
			{impulse up 2.5 0.1 dir 4 0.1}
			{if volume "turret"
				{if rand 0.8
					{call "tear_turret"}
				}
			}
		else min_energy 7
			{impulse up 0.3 0.1 dir 0.4 0.1}
		}
	}
	{on "_explosion"
		{blastwave c4 10 r0 2.5 r1 10}
	}
(include "tank/tank_medium.inc")
}
```

Inside a block you can write [`{inflammation_time N}`](r10-interaction-scripts.md#inflammation_time), handlers `{on <event> ...}` and `(include "name.inc")` lines. Any other bare word inside a block stops the file with "unexpected token". Terrain reactions use a separate set of files, described in section 9.

A file in your mod replaces the vanilla file at the same path as a whole. To add a block of your own, either copy the vanilla `.inc` file that should hold it and add your block, or copy `entity.set` and add an include line for a new file of your own at the end.

## 2. Which blocks apply to which unit

A block applies to a unit if **every tag in the block name is among the unit's definition tags**, or if the block is named `generic`, which applies to everything. The unit's own name also counts as a tag, so a block named after one unit applies to just that unit. The unit's tags come from its definition and the `.ext` files it includes.

Two consequences matter:

- Matching happens once, when the entity description is loaded. Adding a tag at run time with [`{tags add}`](r10-interaction-scripts.md#tags) does **not** make more blocks apply. Run-time tags only change what `{if tagged}` tests.
- Properties that no block mentions produce a harmless "Unknown props" message in the log.

Blocks are stacked in **levels**, in the order they appear in the files. A typical stack for a medium tank is `generic`, then `tank`, then `medium tank`, then the unit's own block. By default each handler is `inherit`: when an event happens, the less specific levels run first and the most specific block runs last. If you write `overload`, only your level runs for that event, and an [`{inherited}`](r10-interaction-scripts.md#inherited) action inside it runs the next lower level at that point:

```
{"my_heavy_tank"
	{on engine on overload
		{inherited}
		{set "my_flag"}
	}
}
```

You may define a given event only once per block. Writing `{on spawn}` twice in the same block gives an "event already defined" error. Merge the two into one.

Class names such as `tank`, `light tank`, `medium tank`, `heavy tank`, `armored_car`, `turret`, `human`, `car`, `cannon` and `airborne` are just tag sets that come with unit definitions. There is nothing special about them in the script language.

## 3. The command

Every event carries a **command** with optional fields: target, instigator, volume, part, bone, value, position, direction, normal, source, bullet and sender. Not every event fills every field. A condition that needs a missing field is false, and an action that needs one does nothing.

Timers lose some of this context. [`{delay}`](r10-interaction-scripts.md#delay) and [`{delay_effect}`](r10-interaction-scripts.md#delay_effect) run their actions with a fresh, empty command. [`{delay_ex}`](r10-interaction-scripts.md#delay_ex) keeps a copy of the command but drops the instigator, bone and bullet. If you need to know who shot the vehicle after a delay, save a flag first.

### In Gates of Hell

<!-- goh: GHINT-13 GHINT-14 -->

On [`bullet_hit`](r10-interaction-scripts.md#bullet_hit) two command fields mean something else. The hit side is kept in a field of its own, so the command's `value` is empty there; a script that reads the value as the hit side gets nothing. The `normal` is the surface normal at the hit, where this game passes the reflected direction. Effects that use the normal point another way.

## 4. Events

Combat and lifecycle events:

| Event | When it happens |
|---|---|
| [`spawn`](r10-interaction-scripts.md#spawn) | the entity is created |
| [`bullet_hit`](r10-interaction-scripts.md#bullet_hit) | a bullet touches it, before the game decides whether it passes; `value` is the hit side (0 front, 1 top, 2 left, 3 right, 4 back, 5 bottom) |
| [`pierce`](r10-interaction-scripts.md#pierce) | armour is penetrated (not sent when a shell detonates on the armour) |
| [`break_armor`](r10-interaction-scripts.md#break_armor), [`break_armor_again`](r10-interaction-scripts.md#break_armor_again) | armour breaks for the first time, or again; `value` is the energy and the sender is `pierce` or `blast` |
| [`blast_hit`](r10-interaction-scripts.md#blast_hit) | the first blast hit on the entity from one explosion; `value` is the blast energy |
| [`blast`](r10-interaction-scripts.md#blast) | once for every part a blast reaches |
| [`contact`](r10-interaction-scripts.md#contact) | physical collision |
| [`ground_hit`](r10-interaction-scripts.md#ground_hit) | touches the ground; the value is negative |
| [`break`](r10-interaction-scripts.md#break), [`repair`](r10-interaction-scripts.md#repair) | a part breaks or is repaired |
| [`fire "place"`](r10-interaction-scripts.md#fire) | a weapon fires; the name is the weapon's place name |
| [`blow`, `blow opponent`](r10-interaction-scripts.md#blow) | a melee strike: `blow` on the soldier who strikes, `blow opponent` on the soldier who is struck |

Neither `blast_hit` nor `blast` means that the entity itself explodes; vanilla scripts make that happen by calling their own events, such as `"_explosion"` above.

Actor events cover units that move or have crews: `operatable`, `move`, `turn`, `movement_mode_changed`, `grounded`, `board in|out`, `crew in|out`, `overlap begin|end`, `terrain_pp enter|leave`, `terrain_fx enter|leave`, `animation_end` and `ik begin|end`. Four of them need the word `on` or `off` after the name: [`accelerate`](r10-interaction-scripts.md#accelerate), [`brake`](r10-interaction-scripts.md#brake), [`engine`](r10-interaction-scripts.md#engine) and [`swim`](r10-interaction-scripts.md#swim), as in `{on engine on ...}`.

An event name the game does not know produces an "unexpected token" error at load. Names are not case sensitive.

### Custom events

[`{on "name" ...}`](r10-interaction-scripts.md#name) defines your own handler. You run it with [`{call "name"}`](r10-interaction-scripts.md#call) (immediately, with the same command), with `{delay_effect}`, or the game may call certain well-known names itself (for example `die`, `burn`, `burn_volume`, `break_window`, `fallen`, `link_weapon` and `slice_load`). **If you call a name that has no handler, nothing happens and nothing is logged**, so a typo in a `call` is invisible. `ARSENAL ialint` finds these for you.

### In Gates of Hell

<!-- goh: GHINT-15 GHINT-16 GHINT-17 GHINT-19 GHINT-30 GHINT-45 GHINT-46 -->

Gates of Hell adds events, and this game stops loading at each of them with "unexpected token". Remove or rewrite them in any script you carry over.

| Event | When it happens |
|---|---|
| `destroy` | a part is destroyed (this game runs `break` for that too) |
| `blast_wreaked` | a blast pierces the entity |
| `animation_event "name"` | a named event inside an animation is reached |
| `hatch open`, `hatch close` | a hatch opens or closes; what triggers it is not confirmed |

The game also calls more well-known handler names by itself: `bullet_hit_effect` on the first bullet hit and `pierce_effect` on a penetration (the place for hit effects), `blast_wreaked_effect`, `contact_effect` on a physical hit, `blow_effect` and `blow_opponent_effect` around a melee strike, `reload` when a unit reloads, and `environment_changed` when the scene's environment changes. In this game these names are ordinary custom events that nothing calls.

An entity can have up to 65535 distinct events across its scripts. Here the limit is 255.

## 5. Conditions

The conditional looks like this:

```
{if not tagged "burning"
	{call "start_fire"}
else rand 0.3
	{call "maybe_fire"}
else
	{con "no fire"}
}
```

There are no comparison operators, no `and` and no `or`. Thresholds are always "greater than". For AND, nest one `{if}` inside another. For OR, use an `else` chain. A bare string such as `{if "damaged"}` tests a per-entity flag (see section 7).

Commonly used conditions: [`tagged`](r10-interaction-scripts.md#tagged), [`stuff`](r10-interaction-scripts.md#stuff), [`rand p`](r10-interaction-scripts.md#rand), `volume`, [`min_energy N`](r10-interaction-scripts.md#min_energy), [`effector`](r10-interaction-scripts.md#effector), [`work`](r10-interaction-scripts.md#work), [`broken`](r10-interaction-scripts.md#broken), [`destroyed`](r10-interaction-scripts.md#destroyed), [`explosive_amount`](r10-interaction-scripts.md#explosive_amount), [`component`](r10-interaction-scripts.md#component-1), `name`, `able`, [`hit_side`](r10-interaction-scripts.md#hit_side), [`velocity`](r10-interaction-scripts.md#velocity), [`min_mass`](r10-interaction-scripts.md#min_mass), `operatable`, [`linked`](r10-interaction-scripts.md#linked), [`place`](r10-interaction-scripts.md#place), [`crew_in_place`](r10-interaction-scripts.md#crew_in_place), [`burned`](r10-interaction-scripts.md#burned), `terrain_fx`, [`altitude`](r10-interaction-scripts.md#altitude), [`water_level`](r10-interaction-scripts.md#water_level), [`under_water`](r10-interaction-scripts.md#under_water) and [`difficulty`](r10-interaction-scripts.md#difficulty).

`hit_side` takes a side name: `front`, `back`, `left`, `right`, `top` or `bottom`. A number, such as `{if hit_side 4}`, is a load error ("Unknown side"). Without a bullet in the command only `front` and `back` work, judged by position. `min_energy` tests the command's value, which is an energy only for events that carry one (`blast_hit`, `blast`, `break_armor`); on `bullet_hit` the value is the hit side.

Some conditions modders expect do **not** exist: there is no `hit_angle`, no `terrain "water"` and no `bullet "shell"`. An unknown condition name is a fatal error when the file loads: the game stops with "unknown condition". A branch written with no condition word at all has no test and runs every time, like a plain `else`.

### In Gates of Hell

<!-- goh: GHINT-31 GHINT-32 GHINT-41 GHINT-42 GHINT-43 GHINT-44 -->

- New conditions: `prop` (a tag of the unit's description), `volume_any`, `no_stuff` (empty inventory), `active`, `friendly_fire`, `standing`, `squatting`, `in_cover`, `cover_type` (needs at least one kind of cover), `idle_low_health`, `hold_strap` (weapon slung), `gamemode` (the multiplayer game type), `season` (the season of the multiplayer game card), `weaponry_sealed` (a seat is sealed) and `cannon_state fire|move|trailing`. `gamemode` and `season` are false outside multiplayer. `cannon_state` on a unit that is not a gun can probably crash the game. Since this game stops at an unknown condition, every one of these must go before a script is carried over.
- [`stuff`](r10-interaction-scripts.md#stuff) takes one or more tag lists and is true when the item has all tags of any one list, so one condition can test "this or that".
- [`crew_in_place`](r10-interaction-scripts.md#crew_in_place) is false for a sealed seat, such as a commander with the hatch shut.

## 6. Actions

Flow control: [`set`](r10-interaction-scripts.md#set), `call`, `delay`, `delay_ex`, `delay_effect`, [`kill_delay`](r10-interaction-scripts.md#kill_delay), `inherited` and [`with_effector`](r10-interaction-scripts.md#with_effector). [`con`](r10-interaction-scripts.md#con) prints text to the debug console. Note that [`log`](r10-interaction-scripts.md#log) does nothing, and [`rtfunc`](r10-interaction-scripts.md#rtfunc) only prints a warning.

Timer details:

- A range is written as a centre and a spread, so `{delay 2 0.5}` waits between 1.5 and 2.5 seconds.
- A `{delay}` is keyed to its own action. Running the same one again restarts it instead of stacking a second copy.
- `{kill_delay "name"}` cancels a named delay. An empty name is an error.
- For yes/no values, a number other than 0 or an omitted value means yes.

Spawning and removal: `spawn` (with options and nested actions), [`delete`](r10-interaction-scripts.md#delete) and [`hide`](r10-interaction-scripts.md#hide).

Sound and visuals: [`link_sound`](r10-interaction-scripts.md#link_sound), [`play_sound`](r10-interaction-scripts.md#play_sound), `stop_sound`, `start_sound`, [`view show|hide|start|stop|pause`](r10-interaction-scripts.md#view), [`add_view`](r10-interaction-scripts.md#add_view).

Animation and mesh: [`ani_play`](r10-interaction-scripts.md#ani_play) (it can call back with `animation_end`), `ani_stop`, `ani_wind`, `ik_enable`, [`bone show|hide|cut`](r10-interaction-scripts.md#bone), [`tear`](r10-interaction-scripts.md#tear), `tex_mod`, `tex_morph`, [`scale`](r10-interaction-scripts.md#scale). [`use_blend_tex`](r10-interaction-scripts.md#use_blend_tex) is not supported and only logs.

Physics and damage on an entity: `tags add|remove`, [`impulse`](r10-interaction-scripts.md#impulse), [`burn`](r10-interaction-scripts.md#burn), `fire`, [`blastwave`](r10-interaction-scripts.md#blastwave) (it centres on the entity origin unless you give a position), [`explode_inventory`](r10-interaction-scripts.md#explode_inventory), [`bullet_detonate`](r10-interaction-scripts.md#bullet_detonate), `volume enable|disable`, [`stat_notify`](r10-interaction-scripts.md#stat_notify), [`for_each_volume`](r10-interaction-scripts.md#for_each_volume), [`with_linked_entity`](r10-interaction-scripts.md#with_linked_entity).

Actor actions: [`components`](r10-interaction-scripts.md#components), `component`, [`damage_report`](r10-interaction-scripts.md#damage_report), [`kill_crew`](r10-interaction-scripts.md#kill_crew), [`crew_emit`](r10-interaction-scripts.md#crew_emit), [`crew_throw_off`](r10-interaction-scripts.md#crew_throw_off), [`weapon_work`](r10-interaction-scripts.md#weapon_work), [`chassis_work`](r10-interaction-scripts.md#chassis_work), `able`, [`stunned`](r10-interaction-scripts.md#stunned), [`die`](r10-interaction-scripts.md#die), the `health_damage_*` family, `kill_flags`, [`knockdown`](r10-interaction-scripts.md#knockdown), [`spawn_human`](r10-interaction-scripts.md#spawn_human) and others.

Notes on a few of them:

- `burn` sets the entity or one volume on fire, but shows a flame only when you give `fx "effect"`. Without `fx` it burns with no visible flame. `time` sets how long, and `stop` puts the fire out.
- `explode_inventory` is the cook-off action: a random 40 to 90 percent of the explosives the entity carries go off. Amounts of 0.1 or less do nothing.
- `damage_report` shows a message to the local player for their own units only. A misspelt text key shows the raw key.
- `weapon_work` and `chassis_work` switch weapons or movement on and off. A pause between machine-gun bursts ([chapter 10](10-ai-and-bots.md)) is built with `weapon_work`.

A few actions and conditions are never used in the stock data (for example `rtfunc`, `change_obstacle`, `movement_type`, `spawn_human`, `true`, `false`, `inactive` and the `crew` event pair). Whether they behave as described in the installed game is not known (unconfirmed).

### In Gates of Hell

<!-- goh: GHINT-18 GHINT-21 GHINT-22 GHINT-23 GHINT-24 GHINT-26 GHINT-27 GHINT-28 GHINT-29 GHINT-39 GHINT-40 -->

- **New actions:** `set_idle_animation "a" "b" ...` (one picked at random as the idle), `holder_drop "holder"` (the item in that holder falls to the ground), `call_synced` (a `call` that the host also sends to the other players), `vehicle_health_damage_pierce` and `vehicle_health_damage_blast` (damage to a vehicle part's health), `linear_damping f`, `restore_volume_states`, `mark_for_persistence` and `wind_detail_bending`.
- **`unlink` replaces `get_off`.** It frees any seat of any kind; a soldier gets off.
- **[`crew_emit`](r10-interaction-scripts.md#crew_emit)** does nothing on an aircraft more than half a metre above the ground, and takes a new word `force`.
- **`gravity`** is a multiple of normal gravity (1 is normal). Here it is in metres per second squared (9.8 is normal), so divide by 9.8 when you carry a value over, or a body falls almost ten times as fast.
- **`spawn`** takes the new words `texmod`, `random_position <radius>`, `random_orientation`, `local` (this machine only) and `constrain_after_dir`.
- **Timers:** [`delay_ex`](r10-interaction-scripts.md#delay_ex) takes `uniq`, which gives every call its own timer that a later call never restarts.
- **Other new words:** `norestart` on `ani_play` keeps the animation time, `use_position` on the sound actions, `multiple` on `component`, `truncate` as a bone mode, more `add_view` view modes and the relation `my`. `tear copy` works the other way round from this game.

This game does not know these words. A script that uses them probably fails to load here, so take them out or rewrite them when you carry a script over.

## 7. State: flags, tags, abilities

There are three places to keep state, each with a limit.

| Kind | Set with | Test with | Limit |
|---|---|---|---|
| Flag | `{set "x"}` | [`{if "x"}`](r10-interaction-scripts.md#flag) | at most 128 distinct names in the whole game |
| Tag | `{tags add "x"}` | `{if tagged "x"}` | no limit |
| Ability | [`{able ...}`](r10-interaction-scripts.md#able) | `{if able ...}` | at most 32 names; an unknown name is a load error |

Flags belong to one entity each, but the 128-name limit is global and counted over every interaction file when the scripts load. More than 128 names is an error at load. Since the vanilla scripts already use many names, a big script mod can hit this, so prefer tags where you can.

There are no global variables and no numeric counters. To count, use a tag ladder: `hit_1`, `hit_2`, `hit_3`, and on each event add the next rung.
```
{on bullet_hit
	{if tagged "hit_2"
		{tags add "hit_3"}
	else tagged "hit_1"
		{tags add "hit_2"}
	else
		{tags add "hit_1"}
	}
}
```

### In Gates of Hell

<!-- goh: GHINT-25 -->

Volumes have one more [ability](r10-interaction-scripts.md#able), `blockcamera` (the volume blocks the camera), and `volume enable|disable` can switch it from a script. This game does not know the name: `able blockcamera` in a definition or script stops the load with "unknown flag".

## 8. Worked example: a fire after a blast from behind

Goal: when a strong explosion hits a vehicle from behind, start a fire that burns for a few seconds and then ends.

```
{"my_tank"
	{on blast_hit
		{if hit_side back
			{if min_energy 9
				{if not tagged "rear_fire"
					{tags add "rear_fire"}
					{burn fx "smoke_dead_small" time 8 2}
					{delay 12 "rear_fire_out"
						{tags remove "rear_fire"}
					}
				}
			}
		}
	}
}
```

The nested `{if}` lines are the AND. `blast_hit` carries the blast energy as its value, so `min_energy 9` means a blast of more than 9. A blast has no bullet, so only `front` and `back` work for `hit_side` here, which is what this example uses. The `fx` option makes the flame visible, and `time 8 2` lets it burn for 6 to 10 seconds. The `{delay}` runs its inner action with an empty command, which is fine here because removing a tag needs no command fields. Put the block after the vanilla `tank.inc` blocks, as section 1 describes, and replace `my_tank` with the name of your unit.

## 9. Terrain effects

When a shell lands, the ground material decides what appears. Terrain scripts live in `set/interaction_terrain/effects.set` and the files in `set/interaction_terrain/effects/`:

```
{"sand"
	{on detonate {spawn "crater_norm" terrain_texmod}}
}
```

The effect name comes from the ground material's `{effect "..."}` line in the terrain settings. An unknown name logs "Unknown terrain effect" and can crash the game. The terrain events are [`hit`](r10-interaction-scripts.md#hit) (a body, soldier or torpedo hits the ground) and [`detonate`](r10-interaction-scripts.md#detonate). The event [`bullet`](r10-interaction-scripts.md#bullet) is never fired, so a handler for it silently does nothing.

### In Gates of Hell

<!-- goh: GHINT-27 GHINT-34 GHINT-43 -->

- Whether a terrain effect counts as "in the air" depends on what calls it: a bullet uses its own size, an exploding item the largest of its damage radii times `ground_interaction_radius`, and a falling body 0. Here the height is a fixed 20 units for all. Effects that are not in the air play on the ground or water surface below the point, so big blasts raise dust from higher up.
- Gates of Hell's terrain scripts pick winter or summer effects with the condition `season`, and use the new `spawn` words, so they cannot be copied into this game as they are.

## 10. Writing and checking scripts

The Editor page of the ARSENAL window (tab IDE) is a text editor for game files. It checks a file as you type, shows what a word means when you point at it, jumps from a `call` to its handler or from an include to its file, finds every use of a name in your mod, other mods and the game, and offers fixes for some problems. It does not start the game.

On the command line:

```
ARSENAL ialint <mod folder> [--game dir] [--mods a,b] [-q] [--summary]
```

`ARSENAL ialint` reads your interaction scripts together with the vanilla ones and reports, among others:

- an event defined twice in one block, and an unknown event name;
- `call` to a name with no handler;
- a `fire` handler for a place the unit does not have;
- `hit_side` used where the command has no bullet;
- timers whose actions need command fields that a delay drops;
- `{tags add}` written as if it changed which blocks apply;
- terrain handlers for `bullet`;
- use of `use_blend_tex`;
- flag name and ability name overflow;
- actions that do nothing (`log`, `rtfunc`, `kick`);
- an empty `kill_delay`;
- a tiny `explode_inventory` share.

Use `-q` to hide informational lines and `--summary` for counts only. See [chapter 19](19-toolchain.md) for the other tools.

The 64-bit build has a console only when started with `-console` ([Reaching the console](r12-bot-lua-and-console.md#8-reaching-the-console)); `{con}` prints there. Use it sparingly, and read `game.log` after every change, as described in [chapter 18](18-testing-and-logs.md). Load errors such as "unknown condition", "Unknown side" and "unexpected token" appear there.

See also: interaction scripts that fire weapons or pause them are part of the AI picture in [chapter 10](10-ai-and-bots.md#4-firing-rules), and the damage they react to is in [chapter 9](09-weapons-ammo-damage.md).

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

<!-- goh: GHINT-13 GHINT-17 GHINT-21 GHINT-25 GHINT-34 GHINT-40 GHINT-41 -->

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. Where scripts live | same as far as mapped | the same `set/interaction_entity/` files and `.inc` blocks |
| 2. Which blocks apply to which unit | same as far as mapped | tag matching and levels as here |
| 3. The command | [differs](#in-gates-of-hell) | on `bullet_hit` the value is not the hit side; other normal |
| 4. Events | [differs](#in-gates-of-hell-1) | `destroy`, `blast_wreaked`, `animation_event`, `hatch`; more engine-called names |
| 5. Conditions | [differs](#in-gates-of-hell-2) | fifteen new conditions; `stuff` takes several lists |
| 6. Actions | [differs](#in-gates-of-hell-3) | `call_synced`, `unlink`; `gravity` in multiples of g |
| 7. State: flags, tags, abilities | [differs](#in-gates-of-hell-4) | one more volume ability, `blockcamera` |
| 8. Worked example | same as far as mapped | no word of the example is mapped as different |
| 9. Terrain effects | [differs](#in-gates-of-hell-5) | air height per caller; winter and summer by `season` |
| 10. Writing and checking scripts | not mapped | the Editor page and `ialint` check this game's words only |

Carrying a script from Gates of Hell to this game means removing every word above that this game lacks, and converting `gravity` values. The reverse needs `bullet_hit` scripts that read the hit side to be rewritten. The words only Gates of Hell has are listed under [Gates of Hell only](r10-interaction-scripts.md#gates-of-hell-only) in the reference.

## Pitfalls

- Only one handler per event per block.
- A typo in a `call` name is silent.
- An unknown condition name stops the game when the file loads.
- `hit_side` takes side names, not numbers.
- `accelerate`, `brake`, `engine` and `swim` need `on` or `off`.
- `{burn}` without `fx` shows no flame.
- `{tags add}` never changes which blocks apply.
- Delays and timers drop command fields.
- 128 flag names for the whole game; tags are unlimited.
- `log` does nothing; use `con`.
- Terrain `bullet` never fires; use `hit` or `detonate`.
- A script file in your mod replaces the whole vanilla file at that path.

## Next

[Chapter 12, Missions and multiplayer setup](12-missions-and-multiplayer-setup.md).
