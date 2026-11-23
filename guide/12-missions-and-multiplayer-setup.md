# 12. Missions and Multiplayer Setup

The short way: [Missions and multiplayer modes](p10-missions-and-modes.md) gives the steps for adding a mode to a map, changing starting money and army size, and checking a mission. This chapter explains how the pieces work. Every key named here has its own entry in [Reference 11, Mission files](r11-mission-files.md).

## What you will learn

- How a multiplayer game mode is built from a game card, presets, units, budgets and armies.
- How to write the economy: command points, unit limits, charge times and income.
- How `.mi` mission files are structured, and how triggers, conditions and commands fit together.
- How to give a map another mode with the Maps page or `ARSENAL maps mode`, and how to try it with the Play page.
- How multiplayer stays in sync, and which of your changes can break it.

Work in your own mod folder (for example `mods/mymod/`). Text files use CRLF line endings; the 64-bit build reads every string value as UTF-8, in data files and `.lng` files alike, and identifiers must be plain ASCII. Original data is ASCII outside `;` comments, where some old cp1251 bytes remain; the game skips them, so leave them as they are. See [chapter 3](03-mod-folder-and-load-order.md).

## 1. How a game mode is assembled

A multiplayer mode is a **game card**: a file `set/multiplayer/games/<mode>.set` holding one `{game ...}` block. The vanilla cards are `combat`, `battle_zones`, `battle_zones_8x8`, `captureflag`, `cooperative` and `frontline`. The load chain is:

1. The game card sets the game class, player counts, lobby settings and teams.
2. Inside `{game ...}` it includes `presets.inc`, which in vanilla includes four preset files (`presets_competitive.inc`, `presets_all.inc`, `presets_user.inc` and `presets_test.inc`). Together they fill the lobby dropdowns.
3. When a game starts, the unit list loads from the first file that exists of `units/<gameName>.set`, `units/<class>.set` and `units/common.set` under `set/multiplayer/`. The vanilla `common.set` includes `soldiers.set`, `squads.set` and `vehicles.set`.
4. A preset's `{apply "<name>"}` loads `units/<name>.set` on top of that list, adding to it. `{apply remove "<name>"}` first flags every unit that is not marked `basic` for removal, so you can start from a clean list.

The lobby dropdowns come from three preset keys: `gameMode` ("Game settings"), `unitMode` (the era or unit list) and `specMode` (the command point choice). Vanilla preset names start with `c:`, `s:` or `f:`, but the game does not read these prefixes; the name is only a unique key. The preset whose `gameMode` is `test` is the built-in test mode: its countdown is 0 and rank checks are skipped.

During a multiplayer mission load the text preprocessor mod `mp` is active, so `(mod "mp")` sections in data files apply (see [chapter 5](05-sdl-language.md)).

### Game card keys

This card follows the shape of the vanilla `combat.set`:

```
{game
	{class combat}
	{order 5}
	{parameters "freezeTime=30"}
	{settings
		{options            scoreFinal gameDuration enableSpectators}
		{optionsAdvanced    preparationTime friendlyFire fogOfWar}
		{fogOfWar           fog_realistic}
		{difficulty         multiplayer}
		{gameDuration       "90 min"}
		{preparationTime    15}
		{useUnitLevelRestrictions 0}
		{enableBots 1}
	}
	{teamSettings
		{teamsMode normal}
		{armySelectionMode alliance}
		{teams {"a"} {"b"}}
		{alliances (include "preset_alliances.inc")}
	}
	(include "presets.inc")
}
```

- `class` is one of the registered game classes: `combat`, `captureflag`, `cooperative`, `frontline`, `battle_zones`, `battle_zones_8x8`, `armored_warfare` and `combined_arms`. Without `class` the file name is used, which is why the vanilla `combat.set` has no `class` line. `armored_warfare` and `combined_arms` are registered but ship no card. See [class](r11-mission-files.md#class).
- `order` is the place in the lobby list. `minPlayers`, `maxPlayers` and `texMod` are mostly set per map in `map.info` (chapter 13); player counts are rounded up to an even number and clamped to the console variable `mp_maxPlayers` (16 by default).
- `parameters` is one string of `key=value` pairs separated by semicolons. Which keys a class reads depends on the class: `combat` reads `freezeTime`; `captureflag` and `battle_zones` read `freezeTime`, `flag_capture_time`, `flag_release_time` and `flag_capture_factor`, and `battle_zones` also `points_table`; `frontline` reads its own score and phase keys. See [parameters](r11-mission-files.md#parameters).
- `settings` holds the lobby options and their starting values. The game writes words, not numbers: `fogOfWar` is `fog_off` or `fog_realistic`, `difficulty` is `multiplayer`, and `gameDuration` is one of a fixed list from `"10 min"` to `"120 min"`. `options`, `optionsAdvanced` and `optionsRanked` list which settings the lobby shows. Other keys are `friendlyFire`, `scoreMin`, `scoreMax`, `scoreFinal`, `preparationTime` with its `Min` and `Max`, `resourceAmount`, `useUnitLevelRestrictions`, `enableSpectators`, `enableBots`, `randomSpawnPoints` and `veterancyMode` (`all`, `beginners` or `veterans`). See [settings](r11-mission-files.md#settings).
- The vanilla `combat` card has no `enableBots` line, so the lobby offers no bots there. A mod that wants bots must override the card and add `{enableBots 1}` inside `{settings}`. The Maps page "Allow bots" switch does this for you (see [chapter 10](10-ai-and-bots.md)).
- `teamSettings` holds `teamsMode` (`teammatch`, `normal`, `default`, `deathmatch` or `none`), `armySelectionMode` (`alliance`, `team`, `player` or `default`), `equalizeTeams`, `teams` and `alliances`. A team entry can hold `title`, `armies`, `minTeamSlots`, `maxTeamSlots`, `aiTeamPlayers` and `hidden`. The keys `minTeamPlayers` and `maxTeamPlayers` from the template file are not read by anything; use `minTeamSlots` and `maxTeamSlots`. In an alliance, `armies` may be repeated (`{armies "usa"} {armies "eng"}` adds up) or written as one string; every army named must exist in `set/multiplayer/armies/`.
- The vanilla card's bare `{teammatch}` at the top is not a key and is skipped.
- `ranked {enabled} {minPlayers n} {maxPlayers n}` allows ranked games, and `mission_options` is the lobby group that the `mission_option` condition term reads.

Unknown keys in game cards, presets and unit lists are skipped without a message, so a misspelt key simply does nothing.

### In Gates of Hell

<!-- goh: GHMIS-01 GHMIS-143 GHMIS-69 GHMIS-70 GHMIS-71 GHMIS-72 GHMIS-73 GHMIS-74 GHMIS-75 GHMIS-145 GHMIS-37 GHMIS-76 GHMIS-77 GHMIS-78 GHMIS-79 GHMIS-94 GHMIS-95 GHMIS-96 GHMIS-98 GHMIS-100 GHNET-41 -->

Game cards have the same shape, but the classes and many keys differ. Because unknown keys are skipped in both games, a card carried either way loads and quietly loses those settings.

- **Classes.** New: `ammunition`, `evacuation`, `guerrilla`, `heroes`, `campaign_capture_the_flag` (Conquest battles, see [Conquest](#conquest)) and `koth` (King of the Hill; this game has no `koth` class, so such a card makes no game here). The front line class is `frontlines`, not `frontline`. `armored_warfare`, `battle_zones`, `battle_zones_8x8`, `combined_arms` and `heroes` all play by one set of battle zone rules. `combat` is not registered.
- **New settings:** `manualControlMode` (`rts_mode`, `dc_mode`, `tpc_mode` or `any_mode`: whether players may take direct control), `loseOnZeroPoints` (a team whose score reaches 0 loses), `pauseDuringPreparation` (default on; off lets the battle run during the countdown), `chargeFactorMod`, `coldWarSpawn` and `customClipper` (players take map points tagged `a` or `b`, and a coin decides which half each team gets), `assignReinforcementsToPlayer`, and `waveTime` and `firstWaveTime` (120 and 360 seconds by default, for `evacuation` waves). `enableDuration` is read but probably does nothing.
- **Removed:** `allowRejoin`.
- **`gameDuration`** has 14 lengths: 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90 and 120 minutes. 35, 45, 70 and 80 are unknown here.
- **New `parameters`:** `invertedUnitScores` (a kill takes score off the victim's team instead of paying the killer; pairs with `loseOnZeroPoints`), `scoreStart` (score every team starts with), `teamsize_cp_factor` (scales command points by the larger team's size), `kill_personal_score_multiplier`, `kill_unit_score_multiplier`, `kill_score_multiplier`, and for battle zones `flag_team_score` and `flag_team_table` (a held flag pays its team a share of the score limit). In front line games `freezeTime` has no effect (the countdown is `preparationTime`), and a mode without `rounds` probably plays one round instead of two.

## 2. Presets

A preset has this shape (vanilla builds its presets with macros such as `("custom_user" start(160) finish(3000) cp(100))`; this is the same thing written out):

```
{"c:my_custom_100"
	{gameMode "custom"}
	{unitMode "user"}
	{specMode "cp_100"}
	{common
		{unitset {value "all"}}
		{commandPoints "*=100"}
		{unitLimits "heavy=2;tank=6"}
		{balancingFactorBonus {cp 1.0} {mp 1.0}}
		{chargeFactors {value "*=1"}}
		{budgets ...}
	}
	{bots (include "bots_generic.inc")}
}
```

The `common` block, a team block inside `{teams {a {...}} {b {...}}}` and a bot block inside `{bots {easy {...}} {normal {...}} {hard {...}} {heroic {...}}}` all take the same data keys. An empty field in a team or bot entry falls back to the value in `common`; bots use their difficulty name as their team key. The exception is `balancingFactorBonus`: in a team or bot entry it falls back to `common` only when that entry's `chargeFactors` value is empty. If a team or bot entry sets balancing, always set `chargeFactors` in the same entry too. See [Presets and team data](r11-mission-files.md#11-presets-and-team-data).

In the window, Game Modes & AI > Game Modes has a "Multiplayer start settings" section: you pick one of the vanilla preset files, find a preset and change its start money, top money, command point cap and grow time; it writes your copy of the preset file into your mod after a preview. Remember that your copy replaces the whole vanilla file.

### Unit sets

`unitset {value "inc1|inc2^exc1|exc2"}` lists tags to include, a caret, then tags to exclude. A unit passes if it has any include tag, no exclude tag, and the tag of the player's army. A set with only an exclusion, such as `"^x"`, matches nothing, because its include list is empty. To exclude something from everything, write `all^x` and give your units an `all` tag (the vanilla units all have it). See [unitset](r11-mission-files.md#unitset).

### Command points

`commandPoints "tag=table;tag=table"` sets pools. The key `*` is the main pool. Each table is either one limit, or a list of `seconds:limit` steps separated by commas, so the cap rises as the game goes on: `"*=0:60,300:120,900:180;infantry=0:40"`. A unit is checked against the main pool **and** against the first pool, in list order, whose tag it has. Buying a squad takes the squad's total `cp`; each member's death gives back that member's own `cp`. The limits are scaled by `balancingFactorBonus` `cp` and by team balance. See [commandPoints](r11-mission-files.md#commandpoints).

### Unit limits

`unitLimits "tag=N;tag=N"` caps purchases. The semicolon is the only separator: a comma breaks the line and silently drops the limits after it. Only the first tag in list order that a unit has applies to it. The cap counts **purchases** and is never lowered when a unit dies or is refunded. See [unitLimits](r11-mission-files.md#unitlimits).

### Charge factors and balancing

`chargeFactors {value "tag=f;*=f"}` scales each unit's cooldown (`charge`): the first matching tag in list order wins, else `*`, else 1. The stock bot file sets `*=0`, so bots have no cooldowns. The `available` list next to `value` is read only by the lobby unit browser; it does not change the game.

`balancingFactorBonus {cp} {mp} {payback}` (each 1 by default) multiplies the command point limits, the budget start and finish, and the payback rate. It is multiplied again by team balance (the size of the largest team divided by this team's size), so a smaller team receives proportionally more.

### In Gates of Hell

<!-- goh: GHMIS-72 GHMIS-80 GHMIS-81 GHMIS-82 GHMIS-83 GHMIS-89 GHMIS-90 GHMIS-91 -->

- **`balancingFactorBonus`** has seven keys: `cp`, `mpStart`, `mpFinish`, `payback`, `periodicFactor`, `chargeDelay` and `charge`. There is no `mp`. Each game reads only its own names, so a block carried over loses its money settings without a message.
- **Bot blocks** are found as `<difficulty>_<team>`, for example `normal_a`. A block named only by difficulty, as here, is not matched there, and the reverse falls back to `common` here.
- **`chargeFactors`** names its lobby choice list `customize` (here `available`). The lobby value is a number, `chargeFactorMod` on the game settings, that scales the preset's factors.
- **`unitScore`** is a new preset key: what a bought unit's kill is worth.
- **Unit sets replace.** Loading a unit set drops every unit loaded before it, so a preset's `apply` sets replace the mode's units instead of adding to them, and `apply remove` has nothing left to act on.
- **Unit set text** with several `&` parts uses the last part; here only the first part counts.
- **A command point table** given twice replaces the first one; here the two are merged.

## 3. Budgets and income

A `budgets` block inside the preset data describes the currencies players spend (shown in game as manpower). This one follows the vanilla `standard_user` preset:

```
{budgets
	{vehicle
		{mode "standard"}
		{resource
			{start 300}
			{finish 3000}
			{growTime 1500}
			{payback
				{cp      "0	50	90"}
				{restore "1.5	0.75	0.2"}
			}
		}
		{buttons "squad1 squad2 v1 v2 v3 v4 v5"}
	}
	{hero
		{resource {start 10}}
		{buttons "hero"}
		{tag "special"}
	}
}
```

- The block name is free, **except `vehicle`**, which is fixed: bots, the command point and manpower display and some game modes look for the budget named `vehicle`.
- `buttons` is a list of unit `button` tags (vanilla uses `squad1 squad2 v1 v2 v22 v3` to `v12`, `sf` and `hero`). A unit's `cost` is charged to the first budget that lists its button. A unit whose button is in no budget is free.
- `tag "special"` keeps the budget's statistics apart and shows its own price hint.
- Modes are `standard`, `custom`, `with_update`, `without_update` and `fullpayback`. `standard` grows from `start` to `finish` over `growTime` seconds. `custom` does the same, but the end value is the lobby's resource amount, offered from the `speedset` list and clamped to `limitmin` and `limitmax`. `with_update` adds the lobby amount every `period` seconds, `without_update` sets start and finish to the lobby amount, and `fullpayback` starts at `start` and gets the rest only as payback.
- `resource` holds `start`, `finish`, `period`, `speed`, `limitmin`, `limitmax`, `speedset`, `growTable`, `growTime` and `payback`. `growFactors "cpSpent/factor;..."` sits beside `resource` and speeds income up or down with the command points in use.
- In `standard` mode `period`, `speed`, `limitmin` and `limitmax` must all be 0, or you get an "Invalid parameter value" error. `custom` and `fullpayback` need `period` and `speed` at 0 (`custom` uses `limitmin` and `limitmax` for its lobby slider). `without_update` needs `speed` at 0.
- A `growTable` (a list of numbers) shapes income over `growTime`: the time is cut into as many steps as there are numbers, each step earns in proportion to its number, and the total still comes to `finish` minus `start`. After `growTime` the budget catches up, so manpower you did not spend is not lost.
- `payback` gives back a share of a lost unit's cost, at the `restore` rate of the highest `cp` step at or below the command points you have in use. Only `standard` and `custom` budgets pay back. The two lists **must be separated by TAB characters**, must be the same length, and `cp` must rise. Spaces will not do: the list becomes one token and gives a size mismatch error.
- The keys `restoreBegin` and `restoreEnd` are worked out but never used; with `with_update` or `without_update` they must be 0.

See [Budgets](r11-mission-files.md#12-budgets) for each key. Unit prices are set in the unit entries, next.

## 4. Units

Vanilla writes its unit lists with macros. Written out, a vanilla entry such as the US 57 mm gun looks like this:

```
{units
	{"m1_57mm"
		{charge 0} {fore 1.0}
		{group "c5"} {button "v2"} {level 1}
		{cost 225} {cp 10} {score 11.25} {cw 2}
		{tags "all cannon mediumcan usa"}
		{content "* ( mp/usa/vehicle_supporter:2 )"}
	}
}
```

Using the same name twice merges the two entries, and their tags add up. Keys:

- `charge`: the cooldown in seconds. `fore`: how much of the first cooldown is already served at the start; 1 means ready at once, 0 a full cooldown, and a negative value a longer one. The first lock lasts `charge x factor x (1 - fore)`.
- `group`: when you buy a unit, every available unit of the same group restarts its cooldown.
- `icon`: units of one group with the same non-zero `icon` form a sequence; only one is shown, and the next appears after a purchase.
- `cost`: the price, charged to the budget that lists the unit's `button`. `cp`: command points. `score`: the score value of a kill. `cw`: the capture weight the unit adds when it stands in a flag zone.
- `level`: the rank a player needs. It is ignored when `useUnitLevelRestrictions` is 0, in test mode, in ranked games and for bots.
- `content`: what the purchase delivers, in the form `"name[:count] ... ( crew[:n] ) *"`. A name that is a breed spawns soldiers, `*` is the entry's own name, names in brackets after a vehicle are its crew, and an empty `content` delivers the entry's own name.
- `tags`: the army tag (it must match the player's army), era tags, and the categories that unit sets, limits, charge factors and command point pools look for. The unit's own name is added as a tag.
- `info` (tooltip key), `breed`, `basic` (survives `apply remove`), `not_for_sale` (hidden from the buy panel) and `remove` (deletes the entry once read).

All cooldowns start when the preparation countdown ends. A unit that becomes available later starts a fresh period at that moment, without `fore`. See [Units](r11-mission-files.md#13-units).

### In Gates of Hell

<!-- goh: GHMIS-84 GHMIS-85 GHMIS-86 GHMIS-87 GHMIS-88 GHMIS-92 -->

- **New keys:** `cost_ap` and `cost_sp` (prices in other currencies), `round_multiple`, `squad_cost_factor`, `score_factor` (default 0.05), `research_stage` and `research_stage_max` (Conquest research), `enabled`, `not_for_player_sale`, `conditions`, `action` and `doctrine` (the lobby doctrine the unit belongs to). This game skips all of them.
- **`cost`** defaults to 0 (here 1.0).
- **`level` and `fore` are gone.** There is no rank lock, and the first cooldown always runs in full.
- **`charge`** is a group, `{charge {delay N} {interval N}}`: the first wait at game start and the cooldown after each purchase, each scaled by the charge factor and by the `chargeDelay` or `charge` balancing key. Here `charge` is one number. Convert it both ways.
- **`enabled`** in data is probably overwritten by the game's own check of which downloadable content you own.
- **Hidden and not-for-sale units** cannot be bought there; here they pass the price check.

## 5. Armies

```
{army
	{id 6}
	{title "mp/army/mine"}
	{icon "/interface/pages/multi/flag_mine"}
}
```

Each army is one file in `set/multiplayer/armies/`. A negative id means the army cannot be picked. Stock ids are 0 usa, 1 ger, 2 rus, 3 eng, 4 jap and 5 ger2. `appid_base` ties an army to a Steam DLC. The vanilla files also write `flag`, but the game does not read it. See [Armies](r11-mission-files.md#14-armies).

### In Gates of Hell

<!-- goh: GHMIS-10 GHMIS-93 GHMIS-88 -->

Only `icon` and `id` are read from an army file. The army's name is always the text key `mp/army/<name>`, so a `title` in your file is ignored. An army id above 99 probably stops the game. Each army can offer doctrines in the lobby: the list is the `doctrine` values of that army's units for the mode.

## 6. Bots

Bot behaviour and their purchase tables are covered in [chapter 10](10-ai-and-bots.md). In a preset, the `bots` group sets economy per difficulty; the vanilla presets include `bots_generic.inc` there. `ARSENAL milint` checks bot data and Lua orders together with the rest of the mode (section 8).

### In Gates of Hell

<!-- goh: GHMIS-82 GHMIS-105 GHMIS-50 -->

Bot blocks in a preset are named `<difficulty>_<team>` (see [the presets subsection](#in-gates-of-hell-1)). No bot takes a seat in a cooperative game. Bots run in the server process in a Steam match. Everything else about bot scripts is in [chapter 10](10-ai-and-bots.md#in-gates-of-hell-6).

## 7. Mission files (`.mi`)

A multiplayer map folder holds one `.mi` file per game mode: `map/multi/<map>/<mode>.mi`. If the file name does not match a game card, the log says the mission is skipped because the game type is undefined. A `.mi` file in your mod at the same path as a vanilla one replaces it. See [chapter 13](13-maps.md) for the folder layout.

An `.mi` file is a set of blocks:

```
{mission
	{Entity ...}
	{Tags ...}
	{Environment "multi/multi_01"}
	{Helpers
		{reinforcements ...}
		{waypoints ...}
		{zones ...}
		{triggers ...}
	}
	{Players {count 18} ...}
	{Fog 1}
	{EntityManager {Enabled}}
}
```

`Helpers` may hold `waypoints`, `zones`, `triggers`, `events`, `edifices`, `cameras`, `tasks`, `reinforcements`, `vars`, `functions`, `mission_options` and `modifiers`. Any other block name directly inside `Helpers` is an error at map load. Unknown keys inside one of these blocks, by contrast, are skipped without a message. The marker `{#` only marks an item as disabled; it does not make a comment. For a real comment, use `;`. Field names in these files are **case sensitive**, while enum values (words such as `open`) and unit names are not. See [Mission file blocks](r11-mission-files.md#2-mission-file-blocks).

A multiplayer mission places spawn points, flags and ambient sound speakers, not units: players buy their units and bots bring theirs. Entity ids must be unique across the `map` file and every `.mi` file in the folder.

### Triggers

This trigger ends the mission with a win once no living entity with the tag `defenders` is left (the `entities` term is true while its selector finds something, and `!1` turns that round):

```
{triggers
	{"win_check"
		{condition
			{expression "!1"}
			{terms
				{"1.entities" {selector {tag defenders} {state "not dead"}}}
			}
		}
		{actions
			{"delay" {time 2}}
			{"gameover" {result win}}
		}
	}
}
```

Each trigger is a named block inside `{Helpers {triggers ...}}`. Triggers are checked every 0.25 seconds. A trigger can start disabled (`{disabled}`) until the `trigger` command switches it on. Without `{autoreset}` it runs its actions once, the first time its condition is true; with `{autoreset}` it switches off again when the condition becomes false and can fire again. The game writes `{on}` in saves for a trigger that has already fired. An empty `{condition}` is always true, which is how the vanilla multiplayer missions run their weather trigger once at the start. An empty `{actions}` block is fatal at map load. See [Triggers](r11-mission-files.md#3-triggers).

### Conditions

A condition holds numbered terms, each in its own block named `"<number>.<term>"`, for example `{"2.near" {...}}`. A bare `"2.near"` without its own braces is fatal at map load (`Block terminator expected!`). The terms combine in one of three ways: all must be true (the default), any may be true (`{type 1}`), or an `{expression "1 & (2 | 3)"}` that refers to the terms by number. The expression accepts only digits, brackets, `!`, `&`, `|` and spaces; a tab or the words "and" or "or" make it an error, and the trigger never fires. The three operators have the same precedence and are worked out right to left, so `1 & 2 | 3` means `1 & (2 | 3)`: put brackets around every group. Every term is evaluated, even when the result is already known. See [Conditions](r11-mission-files.md#4-conditions).

Inside `if`, `while` and `case` the condition is written inline instead: `{condition {type rand} {value 0.1}}`, where `type` names the term and its fields follow.

Condition terms: `arrival`, `camera`, `cmp_i`, `crew`, `difficulty`, `entities`, `event`, `inventory`, `linked`, `mined`, `mission_option`, `mod`, `near`, `rand`, `see_actors`, `see_enemy`, `side`, `signal`, `task`, `trigger` and `waypoint_canmove`. The term `mod` checks installed workshop mods, which is different from the `(mod ..)` text preprocessor directive. The `near` distance is in metres. See [Condition terms](r11-mission-files.md#7-condition-terms).

### Statements and commands

There are six statements: `delay`, `if`, `loop`, `while`, `select` and `switch`, with `case` and `default` inside `switch` (see [Statements](r11-mission-files.md#5-statements)). Running a block in parallel is the `thread` command.

Selector fields, which pick the entities a command or term works on: `type`, `tag`, `amount`, `zone`, `player`, `relation`, `state` and `mids` (see [Selectors](r11-mission-files.md#8-selectors)).

Commands used in vanilla multiplayer maps include `trigger`, `delay`, `event`, `delete`, `entity_state`, `reinforcement`, `actor_state`, `waypoint`, `environment`, `set_i`, `music`, `sound`, `objective_progress`, `task`, `timer`, `gameover` (`result win` or `loose`, spelt that way; the numbers 2 and 1 are read too) and `rt_function`. Many more exist, such as `spawn`, `board`, `actor_to_waypoint` and `con` (which writes a line to `game.log`, useful for following your own triggers). The full list with fields is [Commands](r11-mission-files.md#6-commands).

A misspelt command or statement logs `Unknown thread statement "<name>"`, and a misspelt term logs `Unknown condition term "<name>"`. Both are fatal at map load, so read `game.log` after every change (see [chapter 18](18-testing-and-logs.md)).

### In Gates of Hell

<!-- goh: GHMIS-14 GHMIS-16 GHMIS-17 GHMIS-18 GHMIS-19 GHMIS-20 GHMIS-25 GHMIS-26 GHMIS-28 GHMIS-29 GHMIS-30 GHMIS-31 GHMIS-32 GHMIS-33 GHMIS-34 GHMIS-39 GHMIS-41 GHMIS-42 GHMIS-44 GHMIS-45 GHMIS-103 -->

The `.mi` format is the same, but Gates of Hell missions use words this game does not know. A new command or term is fatal here at map load, and the new fields are unknown here, so check a carried-over mission with `ARSENAL milint` before you start it.

- **New commands:** `interface` (switch the interface kind) and `benchmark`.
- **New fields:** `disable_random_spawn_position` on `spawn` (the unit appears on the waypoint itself), `cheating` on `actor_fire` (scripted fire spends ammunition unless `cheating 1`; here it is always free), `veterancy` on `actor_state` (soldier rank 0 to 8), `no_restart` on `animate`, `clone_places` on `placement` (a clone takes along what sits in its seats) and `stack` on `inventory`.
- **Changed commands:** `air_state` gains `stop_engine`; `third_person_control` keeps only `lock`; `autoassign` lost `nearest`; `autosave` saves only when the player's autosave option is on.
- **New condition terms:** `altitude` and `reinforcements_score`.
- **Expressions** accept the words `and` and `or` beside `&` and `|`. This game does not, so use only digits, brackets, `!`, `&` and `|` for a mission meant for both.
- **Selectors and variables:** the selector switch `user_player` (units of whoever plays at this machine), and the variables `@players:composition` and `@game:frontlinesphase`.
- **Map points** are sorted by name when the mission starts, which decides spawn order, and a waypoint can carry `RandomPosition` (a unit lands anywhere within its radius).
- **Text modes:** while a mission loads, `(mod "gametype:<type>")`, `(mod "gameclass:<class>")` and `(mod "training")` sections apply, beside `mp` and `coop`.

The keys and commands only Gates of Hell has are listed under [Gates of Hell only](r11-mission-files.md#gates-of-hell-only) in the mission file reference.

## 8. Giving a map another mode

In the window, the Maps page does this: pick a map under "1. Pick a map", then under "2. Make my copy" choose the "Game mode", press "Preview (writes nothing)" and then "Write the copy". The page copies the map into your mod under a new name with that mode, can set the lobby name and switch bots on, and runs the map check afterwards. [Copy and change a map](p09-copy-and-change-a-map.md) walks through it.

On the command line:

```
ARSENAL maps list [--map map/multi/<m>]
ARSENAL maps mode --map map/multi/<m> --from combat --to battle_zones --out <mod folder> [--flags N] [--dry-run]
```

`maps list` shows the modes each multiplayer map has. `maps mode` (the same tool as `ARSENAL mission-clone`) copies a map's `.mi` from one mode to another. Between `combat` and `battle_zones` it adds or removes the flag points; for `captureflag` it adds a centre flag and its ring. For `frontline` and custom modes it copies the file as it is and marks it as needing hand work, because the structure differs. It runs `milint` on its result. Use `--dry-run` first to see what it would write. A map tagged `[mod: <name>]` in the list exists only in that mod's paks, and the game offers it only while that mod is enabled; hosting it otherwise fails with "no map".

`ARSENAL mission-clone ... --with-mode <new> --title "My mode"` also writes a new game card with `{class <base mode>}`, the map's `map.info` entry and the lobby title, so the new mode plays by its base mode's rules and the lobby lists the map under it. A mode cloned from `combat` gets bots switched on unless you add `--no-bots`. Whether the lobby shows the new title correctly, and whether flags placed by the tool capture as expected, is unconfirmed, so check both in a match.

`ARSENAL misgen --map <map folder> --spec spec.json` writes a `captureflag` mission from numbers (one flag, its zone and the spawn points of each side), together with the two capture areas `captureflaga` and `captureflagb` that this mode needs. Without them the mode crashes at the start.

Other helpers: `ARSENAL misdiff <a> <b>` gives a meaningful diff of two maps or `.mi` files, and `ARSENAL milint <mod folder> [--game <game folder>] [--mods a,b] [-q]` checks your mode `.set` against the `.mi`, the `map.info` player count, preset keys, budgets, payback tables, unit sets and limits, mission commands and terms, and bot Lua orders and bot data units. The Maps page "Check now" runs the same check.

To see the mode in the game, use the Play page ("Play a test match"): it checks and installs the mod, starts the game on a test map and reads `game.log`. Put `multi/<map>:<mode>` in its "Map" field, or run `ARSENAL play <mod folder> --map multi/<map>:<mode> --dry` and then without `--dry`. On a map other than the default test map the tool cannot judge the start by itself, so read the log yourself.

The quick way: in the Quick Guided Task row choose "I want to" "make" "a multiplayer game mode", or "change" "the rules of a multiplayer game mode". It asks for sides, goals, rules, money, alliances and units one step at a time and writes the files this chapter describes. See [Use the Quick Guided Task](p17-quick-guided-task.md) and [chapter 19](19-toolchain.md#quick-guided-task).

### In Gates of Hell

<!-- goh: GHMAP-03 GHMIS-94 -->

The Maps page, `ARSENAL maps mode` and the game mode recipe work on this game's maps. To bring the mode file of a Gates of Hell map over, give `ARSENAL mission-clone` the option `--src <Gates of Hell resource folder>` so it finds the files the mode includes. Gates of Hell flags are captured inside a drawn area (`zoneId`) instead of a circle; the tool turns each such flag into a circle of the same area, or of `--flag-zone M` metres (12 by default) when it finds no area. A long, thin area becomes a round one, so check the capture in a match.

## 9. The console and registry

The 64-bit build opens the in-game console (the key left of `1`) only when it is started with the `-console` option; the editor build always has it, and the original executable does not take the option. Other command-line options include `-safe`, `-no_mods`, `-replay` and `-record`. The console commands and variables are listed in [Reference 12](r12-bot-lua-and-console.md). Key bindings live in `profiles/<id>/keys.set` and options in `profiles/<id>/options.set`; these are the player's own files, and mods do not ship them.

`set/registry.reg` includes files from `registry/`: `resource_syncer.reg` (the masks of the multiplayer data checksum, section 10), `unit.reg`, `camera.reg`, `obstacles.reg`, `command.reg`, `hitpoints.reg` and others. The file `set/multiplayer/preload` has `entity "name"` lines for units to load in advance.

### In Gates of Hell

<!-- goh: GHMIS-67 GHMIS-68 GHMIS-106 GHMIS-107 GHMIS-121 GHMIS-13 GHNET-42 -->

Useful console names that only Gates of Hell has: `mp_game_set_victory` and `mp_game_set_personal_score` (add points by host id), `mp_game_list_players`, `mp_session_autoready` (seated players are ready at once, for test lobbies), `mp_rndSeed` (a fixed match seed, for repeatable tests), ` <text>` (an alert line on screen) and `dbg_benchmark`. `mp_game_set_score` adds to the team score there, not to the personal score. `mp_deviceReplay`, `mp_slowdown` and `tcp_hostPortDS` do not exist there.

## 10. How multiplayer stays in sync

The game uses **deterministic lockstep with a relay host**. Only commands cross the network. Each machine runs the whole simulation itself, and entity state is never sent. The host does not simulate on behalf of others; it relays commands, which come back stamped one round trip later, also to the player who sent them. Bots run on the host as if they were extra clients. There is no host migration: if the host quits, the match ends. If any other player quits, their units pass to the host. The 64-bit build waits for a player who lost the connection (the console variable `mp_reconnectWait`, 120 seconds by default), and a player who left can come back into the running match, and gets the units back, when the lobby allows rejoining (it does by default).

### Joining

A lobby session carries the version, name, build checksum, mod list, preset, unit set and tuning values (random seed, sync period, sync level). Joining checks the version, the build checksum, the data checksum and the mod list. Different builds cannot play together.

### The data checksum

The lobby compares a checksum over your game data, not the data itself. The game data tree covers `/entity`, `/fx`, `/properties`, `/set` and `/sound`; a separate map checksum covers `/map/single`, `/map/bonus` and `/map/multi`.

- Excluded from the checksum: `*.scc`, `*.txt`, `*.backup`, `*.bak`, `*.org`, `*.s_*`, `*.msg`, `*.lng`, `*.dds`, `*.ebm`, `*.bmp`, `*.tga` and `*.wav`. Textures, sounds and texts are never compared.
- Full content checked: everything under `/set`, and every `.set`, `.inc`, `.ext`, `map` file, `.mi`, `.reg`, `.info`, `.def` and `.mdl`.
- Only the file **size** counts for the other files in these trees, such as `.ply`, `.vol`, `.mtl`, `.anm`, `.pat` and `.lua`.
- Not compared at all: `/script` (which holds the bot Lua), `/interface` and `/texture`.

A binary edit that keeps the same file size passes the lobby and then goes out of sync during play. If you ship such a change, also change a text file or the mod folder name (unconfirmed advice). The mod list is compared by name; a player missing a listed mod gets a "required mods" message.

### Sync checks

Every `mp_syncPeriod` milliseconds of game time (default 1000), every machine sends two checksums. The **scene** checksum covers game time, the shared random generator, entities and their positions, flags and bullets; at the default sync level 1 inventories are not part of it. The **game** checksum covers budgets, charge factors, command points and unit limits. If the scene checksum differs, that client is "desynced". If only the game checksum differs, the client is also classed as a "cheater", meaning the rules differ. The game then pauses, the host writes a snapshot into `log/oos/<date>/`, and the affected clients are removed. There is no live resync. The log reads "Desync detected on quant N" (see [chapter 18](18-testing-and-logs.md)).

### Rules for staying in sync

1. Everyone needs byte-identical gameplay data.
2. The mod list and load order must match.
3. The simulation must not read local state, such as the camera or the UI selection (the selection itself is part of the checksum).
4. Randomness belongs only in simulation code, which uses a shared generator. Cosmetics such as sounds and particles use a separate local one. A `rand` in a script is safe only if every machine runs that same script at the same step in the same order. A script started by local state that rolls `rand` will desync.
5. Avoid anything that depends on the order of a local list or on floating point differences between machines.
6. The rules state must be identical: the presets must give the same budgets, charge factors, command points and limits everywhere.
7. Scripts run once per simulation step (50 ms by default; a step lasts 20 to 65 ms and follows the slowest player).
8. Hit and damage scripts are safe, because they run from simulated events on every machine.
9. There is no host migration and no resync: if the host leaves, the match ends for everyone, and a desynced player is removed. A player who only lost the connection is waited for, and one who left may rejoin when the lobby allows it.
10. Replays and saves depend on the current data, so changing data breaks old ones.
11. Interaction script flags (`{set "x"}`) are limited to 128 different names in the whole game; the 129th gives an application error at load. Use tags for larger sets.

### Testing with two players

For testing with two copies on one computer, the 64-bit executable accepts `-instance N` (N from 1 to 9). Each instance gets its own user folder, `My Games/Men of War - Assault Squad 2 - instance N` in Documents, with its own `log/game.log` and profiles, and its game port moves up by 10 times N; instances do not use Steam Cloud. A new instance starts with an empty mod list: your mods may be listed but are not mounted until that instance's `options.set` activates them. To join a session on the same computer, use the network adapter's address, not `127.0.0.1`.

To compare two players' data, use:

```
ARSENAL mpsync --game <game folder> [--mods a,b] --export fp.json
ARSENAL mpsync --compare a.json b.json
ARSENAL mpsync --mod <mod folder>
```

The first command writes a fingerprint of your data. Send it to a friend, have them export theirs, and compare. The third form checks one mod against what the lobby checksum would see. See [What must match between players](r11-mission-files.md#16-what-must-match-between-players).

### In Gates of Hell

<!-- goh: GHCMD-07 GHCMD-15 GHCMD-16 GHNET-98 GHNET-80 GHNET-63 GHNET-22 GHNET-43 GHSRV-06 -->

Gates of Hell keeps lockstep only on LAN and with `-no_server`. A Steam match runs the simulation in a separate server program, and every player's game, the host's too, only shows what the server sends. What follows is what changes for a modder:

- **No desync check.** `mp_syncPeriod` and `mp_syncLevel` are 0, and checksums are probably never compared during play, so a data difference shows as odd behaviour, not as "Desync detected".
- **Shared random numbers** are reset from the server every step, so a stray random draw on one machine does not grow into a split.
- **A player who leaves** hands their units, squad by squad, to the other humans of the team, and only to the AI when none are left.
- **A kick** keeps the player out for 30 seconds, or for good when the kick is made permanent. Here every kick is permanent.
- **Versions.** The game reports version 1.067 plus its patch number, and players of different versions cannot join each other. Sessions, replays (`.rep` files) and saves (`.sav`) cannot be shared between the two games.
- **Ports.** The Steam game server uses ports 27001, 27000 and 27015.
- See [The dedicated server](#the-dedicated-server) below.

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

<!-- goh: GHMIS-81 GHMIS-84 GHMIS-93 GHMIS-94 GHCMD-07 -->

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. How a game mode is assembled | [differs](#in-gates-of-hell) | other classes; new settings and parameters; 14 game lengths |
| 2. Presets | [differs](#in-gates-of-hell-1) | seven balancing keys; bot blocks per team; unit sets replace |
| 3. Budgets and income | not mapped | Conquest has its own currencies, see below |
| 4. Units | [differs](#in-gates-of-hell-2) | `cost_ap`, `research_stage`, `doctrine`; no `level` or `fore`; `charge` is a group |
| 5. Armies | [differs](#in-gates-of-hell-3) | only `icon` and `id` read; doctrines |
| 6. Bots | [differs](#in-gates-of-hell-4) | bot blocks `<difficulty>_<team>`; no bots in co-op seats |
| 7. Mission files (`.mi`) | [differs](#in-gates-of-hell-5) | new commands, fields and terms; `and`/`or` in expressions |
| 8. Giving a map another mode | [differs](#in-gates-of-hell-6) | bring a mode over with `--src`; drawn flag areas become circles |
| 9. The console and registry | [differs](#in-gates-of-hell-7) | more test commands; three removed |
| 10. How multiplayer stays in sync | [differs](#in-gates-of-hell-8) | a server program for Steam matches; no desync check |

The job-by-job view is in [Missions and multiplayer modes: In Gates of Hell](p10-missions-and-modes.md#in-gates-of-hell).

### Conquest

<!-- goh: GHCQ-03 GHCQ-08 GHCQ-09 GHCQ-10 GHCQ-11 GHCQ-12 GHCQ-21 GHCQ-23 GHCQ-34 GHCQ-38 GHCQ-39 GHCQ-44 GHCQ-47 GHCQ-27 GHCQ-28 GHMIS-127 -->

Conquest (the dynamic campaign) exists only in Gates of Hell: a map of places that two sides fight over one battle at a time, with money, research and units that carry over. This game has nothing like it, and ARSENAL's Gates of Hell conversion leaves its data out.

- **Data.** `set/dynamic_campaign/` holds files with fixed names: `values.set`, `map_points.set`, `resources_low.set`, `resources_standard.set`, `resources_high.set` and `resources_very_high.set` (one per resource option), `duration_short.set`, `duration_normal.set`, `duration_long.set`, `duration_very_long.set` and `duration_unlimited.set`, and `unit_research_<army>.set` for each army's research tree. A fifth resource level or a sixth duration cannot be added.
- **Battles** are played in the game mode `campaign_capture_the_flag` against bots. Units are bought in stages `stage_1` to `stage_5`, `stage_specials` and `stage_emplacements`; a unit is offered only when its `research_stage` and `research_stage_max` fit the number of games played. Map objects tagged `cmp_def` with `<flag order>_<team>_<level>` are defences that appear only when that flag is in play and the team and defence level match.
- **Traps.** Keep `resupplycost` entries flat, `{name N}`: a string or a nested block there makes the campaign start hang. `brokencomponent` needs an entry `other`, or the game crashes. `maprewards` names are fixed (`airfield`, `ammodepot`, `bonus`, `factory`, `research`), and any other name crashes. A `riskfactor` reward below 1.0 is an error.
- **Difficulty files** (`.dl`) gain `vehicle_health`, `recoil`, `recoil_zoom` and `vehicle_recoil`, and there is a `training` level. A misspelt key in a Gates of Hell `.dl` file is not reported and can change a neighbouring value; here it logs "unexpected token".
- **Saves** are zip files in the profile's `campaign/` folder. A campaign save still loads when you add mods or change their order; only a missing mod it was saved with makes it incompatible.
- **Bot scripts** read the campaign through `BotApi.Conquest`.

### The dedicated server

<!-- goh: GHSRV-01 GHSRV-03 GHSRV-04 GHSRV-05 GHSRV-07 GHSRV-12 GHMIS-117 GHMIS-124 -->

When a Steam match starts, the host's game starts a server program, `<game program name>_server.exe`, found beside the game program or in `binaries\x64`, and talks to it through a named pipe. The server loads the host's mod list. If the program is missing, the console says "Game server executable file not found at <path>" and no server starts. Things to know when you test a mod there:

- The server writes no debug logs and saves no profile options. Read the `game.log` of a player's game, the host's included.
- Sound is off in the server by default (`snd_disable` is 1).
- The server refuses to start when its version is more than one step away from the game's.
- The console commands `dev_launcher_startServer`, `dev_launcher_stopServer`, `dev_launcher_cmd` and `dev_server_exec` drive the server over the pipe.
- A host can probably hang at "Creating server instance" when a pipe message is lost. That is a fault in that game, not in your mod.

## Pitfalls

- `minTeamPlayers` and `maxTeamPlayers` are not read.
- Payback lists need TABs and equal lengths.
- Standard-mode budgets need zero for period, speed and limits; custom-mode budgets need zero period and speed.
- A comma in `unitLimits` silently drops the limits after it.
- An exclude-only unit set matches nothing.
- A team or bot entry that sets `balancingFactorBonus` without `chargeFactors` ignores its own balancing.
- A mode `.mi` with no matching game card is skipped without a loud error.
- A misspelt command, statement or condition term stops the map from loading.
- `captureflag` crashes at the start when the map lacks the clips `captureflaga` and `captureflagb`.
- A binary change of the same size passes the lobby and desyncs later.
- `{#` in a `.mi` does not comment; use `;`.

## Next

[Chapter 13, Maps](13-maps.md).
