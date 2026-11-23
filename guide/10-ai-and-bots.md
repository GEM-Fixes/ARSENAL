# 10. AI and Bots

The short way to change what bots buy and how rich they are is on [Bots: what they buy and how they play](p11-bots.md). The exact facts for every bot function, bot data name and console command are in [Reference 12: Bot Lua and console](r12-bot-lua-and-console.md), and the sensor keys are in [Reference 8: Vision, effects and sound](r08-vision-effects-sound.md#sensor-and-visors).

## What you will learn

- How a soldier or vehicle decides what to shoot, and why it sometimes refuses to shoot something obvious.
- How the two target files (`select.set` and `ammo.set`) work, and the single most important rule about them.
- How firing, bursts and aiming delays are controlled.
- How infantry decide to advance, hold or retreat, and which brain properties change that.
- What the multiplayer bot script can and cannot do, and how the ARSENAL window changes it.
- A symptom-to-cause list for the AI problems modders hit most often.

Everything here is "soft code": data files and scripts that you can change without touching the game's program. A small part of the AI is compiled and cannot be changed, and this chapter says which part.

A reminder before you start: work in your own mod folder (for example `mods/mymod/`), never in the game folder. Text files use CRLF line endings; the 64-bit build reads every string value as UTF-8, in data files and `.lng` files alike, and identifiers must be plain ASCII. Original data is ASCII outside `;` comments, where some old cp1251 bytes remain; leave them as they are. Editors can silently change encoding or line endings, so check after saving. Paks are ordinary zip files. See [chapter 3](03-mod-folder-and-load-order.md) and [chapter 4](04-vfs-paks-patches.md).

## 1. The decision chain

Every armed unit follows the same chain, once per think cycle:

1. The unit's **sensor** collects contacts, meaning enemies it has noticed.
2. A **target selector** ranks those contacts from most to least wanted.
3. An **ammo selector** decides which weapon and ammunition may be used against the best-ranked target.
4. The unit aims.
5. The unit fires, subject to burst and tolerance rules.

Three folders of data feed this chain. The unit's own definition (its `.ext` file under `properties/`) holds the brain, the [sensor](r08-vision-effects-sound.md#sensor) and the name of its target selector. The `set/target/` folder holds the target selector files and `ammo.set`. The `set/vision/` folder holds how far and how quickly units notice things. Interaction scripts (see [chapter 11](11-interaction-scripts.md)) can also change how a unit fires.

You cannot add new kinds of orders, change how targets are scored internally, or change how units search for cover. Everything else in this chapter is open to you.

## 2. Target selection: `select.set`

The file `set/target/select.set` lists the `.inc` files beside it, and each of those holds one **selector**. A selector says: "for units that look like this, rank enemies like that". This is the vanilla selector for vehicles, `set/target/tank.inc`, shortened:

```
{selector
	{type "tank"}
	{group
		{ignore {class airborne}}
		{select {weapon "ap"}}
		{select {weapon "fg"}}
		{select {weapon "apcr"}}

		{sort {weapon "ap"} {attacking} {class tank}}
		{sort {weapon "ap"} {attacking}}
		{sort {weapon "fg"}}
		{sort time_to_aim}
	}
	{group
		{sort {class tank}}
		{sort {class armoredcar}}
		{sort {class car}}
		{sort time_to_aim}
	}
}
```

A selector is matched to a unit in one of two ways. `{type "tank"}` matches by the unit's selector name, which its definition gives with `{targetSelector "tank"}`. `{unit "human" "bullet"}` matches by tags: the unit must carry the tag `human` and the weapon it currently holds must carry the tag `bullet`. Because the match depends on the held weapon, a soldier who switches from rifle to anti-tank weapon also switches selector. The vanilla selectors are `human_bullet`, `human_ap`, `human_fg`, `human`, `cannon_shell`, `moto`, `cannon_rocket`, `cannon_bullet`, `tank`, `tank_bullet` and `searchlight`.

### The rules that matter

- **The first matching selector wins.** The game walks `select.set` in file order and uses the first selector that fits the unit. Order therefore matters, and putting a general selector above a specific one hides the specific one. That is why vanilla lists `human_bullet`, `human_ap` and `human_fg` before the general `human`.
- **Each unit has one ordered list.** A tank does not get one ranking per weapon. The cannon and the machine gun share the same list, and each weapon takes the first enemy in that list it is allowed to hit.
- **Groups run in order and consume candidates.** The first group picks the contacts it wants. The second group works on what is left, and so on.
- **A contact that no group matches is never attacked.** This is the most important rule in the chapter. If every group of a selector has `select` lines and none of them selects tanks, units using it never fire at tanks. Nothing warns you.
- **`ignore` is global for later groups.** A term `{ignore {class airborne}}` removes aircraft from the shared pool for every group after it, which is how vanilla vehicles are made to ignore planes.
- Several `{select}` lines in one group mean "this or that". Terms inside a single `{select}` mean "this and that".
- A group with neither `select` nor `ignore` takes everything that is left. Most vanilla soldier selectors are like that, so they can rank every contact.
- If any contacts are inside the unit's weapon range, only those in-range contacts are considered at all.
- Inside a group, `sort` lines are applied in order: contacts that satisfy the first line come first, then the next line, and ties are broken by `distance` (nearest first) or `time_to_aim` (quickest to turn toward). The sort is not stable, so exact ties come out in no guaranteed order.

### Terms you can use

| Term | Meaning |
|---|---|
| `class X` | the target's class, such as `human`, `tank`, `armoredcar`, `car`, `cannon`, `airborne` |
| `weapon "tags"` | the target's weapon tags; `weapon "ap"` means "the target carries armour-piercing ammunition"; `weapon` alone means "the target is armed" |
| `attacking` | the target is shooting at us |
| `threating` | the target has recently been a threat (the game's own spelling) |
| `in_range N` | the target is within N metres of the shooter |
| `invisible`, `out_of_range` | visibility and range tests |
| `entity "id"` | one specific unit definition |

Put `not` in front of a term to reverse it.

### Worked example: riflemen who go for machine gunners first

The vanilla rifle selector, `set/target/human_bullet.inc`, ranks enemies within 10 metres first, then enemies shooting at the soldier, then enemy riflemen. To make riflemen prefer machine gunners after close and attacking enemies, copy the file into the same path in your mod and add one line:

```
{selector
	{unit "human" "bullet"}

	{group
		{sort 	{in_range 10}}
		{sort	{attacking}}
		{sort	{class human} {weapon "mgun"}}
		{sort	{class human} {weapon "bullet"}}
		{sort	{class human} {weapon}}
		{sort	{class human}}
		{sort	{threating}}
		{sort	distance}
	}
}
```

Your file replaces the vanilla one by path. Change one thing at a time, then read `game.log` as described in [chapter 18](18-testing-and-logs.md).

### In Gates of Hell

<!-- goh: GHAI-04 GHAI-05 GHAI-06 GHAI-44 -->

- The `time_to_aim` sort term does nothing for vehicles: it gives every enemy the same score. A vehicle selector that relies on it as its last tie-break loses that tie-break there.
- The threat a soldier reacts to is the nearest one he has a weapon for, and only then the nearest of any kind. A vehicle whose `body` part is destroyed is no longer a threat. Against a vehicle, an anti-tank soldier tries his rocket launcher before any other weapon.
- Units tagged `airborne` or `helicopter` are not attacked while they fly. A helicopter on the ground is a normal target.

## 3. Ammunition choice: `ammo.set`

Once a target is chosen, `set/target/ammo.set` decides which ammunition may be used on it. It has one block per target class, each listing ammunition tags in order of preference. This is part of the vanilla block for soldiers:

```
{select_ammo
	{human
		{"grenade ic" {ready_for_shot}}
		{"shell fg" {ground} {ready_for_shot}}
		{"mortar fg" {ground}}
		{"hmgun"}
		{"bullet"}
		{"grenade fg"}
		{"ammo rocketlauncher" {enable_for_user 0}}
	}
}
```

The class names are `human`, `car`, `cannon`, `airborne`, `armoredcar`, `light_tank` and `tank`. Two extra blocks, `human in_bush` and `human in_cover`, are tried before the plain `human` block when the victim is hiding.

- **The first matching rule wins**, and earlier means higher priority.
- The game appends a catch-all with a negative priority, and a negative priority means "do not shoot this target with this ammunition". So a missing rule is a silent refusal to fire. In vanilla data there is no `bullet` rule for class `tank`, which is why rifles and machine guns do not shoot at tanks.
- Options inside a rule include `ground` (aim near the target rather than at it), `volume "tag"` (the rule applies only while that part of the target is undamaged), `ready_for_shot` (a shell is already in the breech), `charging` (the gun is still loading), `check_grenade`, `disable`, and the switches `enable_for_ai 0`, `enable_for_user 0` and `enable_for_human_user 0`.
- `{"ammo rocketlauncher" {enable_for_user 0}}` against infantry means only units under AI control will use launchers on soldiers by themselves. Launchers in the player's units will not.

A related difference: a unit under player control must have its target in range to shoot, while an AI-controlled unit will also try to shoot from out of range and then move closer.

Artillery has no special AI. Guns and mortars use the same selector and ammunition rules and fire high-explosive shells at the ground near spotted infantry within their range. Bots cannot order fire missions.

### In Gates of Hell

<!-- goh: GHAI-42 GHAI-54 GHAI-71 -->

- A rule with `ground` makes the unit aim at the target's position, not at one of its bones, for soldiers and vehicles alike.
- When a gun is picked to fire at the ground, it is skipped if the target is inside the weapon's `MinRange`. This game has no such key, so mortars and guns there have no minimum range.
- AI units can run out of ammunition. A weapon is empty when it has no rounds left and none are found in the unit's own or its group's inventories.

## 4. Firing rules

Three layers shape when a shot actually leaves the barrel.

**Fire mode.** The brain property `fire_mode` takes `hold`, `return` or `open` (fire at will). Units owned by a multiplayer bot are set to AI control, fire at will and zone movement. Units owned by human players are set to user control and hold position.

**Aiming delay and tolerances.** A soldier who acquires a target waits a random 0.3 to 1.1 seconds before aiming, scaled by difficulty. A rocket launcher is put away 8 to 14 seconds after use. A shot then waits until the gun points within [`AimingTolerance`](r06-weapons-and-ammunition.md#aimingtolerance) degrees of the target (10 when absent), then for `RelaxationTime`. Vehicles also wait while their `SpreadTolerance` is larger than the accuracy they have while moving, so a fast-moving tank holds its fire. `PrepareTime` is a wind-up for indirect fire on guns; 0 means none.

**Bursts.** The [`burst`](r06-weapons-and-ammunition.md#burst) block of a weapon gives the short and long burst lengths, each with a spread of rounds. The vanilla machine-gun presets in `set/stuff/mgun/.presets` are `burst_short`, `burst_medium` and `burst_long`; this is `burst_medium`:

```
{burst
	{short 5 0.3}
	{long 8 0.7}
}
```

AI vehicle weapons always use the long burst, and you cannot pick another mode per weapon. Vanilla vehicles have no pause script between bursts. If machine guns in your mod set fire one burst and then fall silent for a moment, look for an interaction script on the `fire` event that switches the weapon off with `weapon_work` for a time. A player command can toggle such a script, but the AI never gives player commands, so AI vehicles keep the pause.

### In Gates of Hell

<!-- goh: GHAI-07 GHAI-08 GHAI-40 GHAI-51 GHAI-52 -->

- A soldier's wait before each shot comes from weapon data, not from the fixed 0.3 to 1.1 seconds. It is the weapon's `FiringTimeout` (a centre and a spread in seconds), scaled by distance with `FiringTimeoutDistanceFactor` on bullet weapons, and multiplied by the difficulty's `firing_timeout`. A launcher's wait uses the difficulty's `grenade_timeout` instead. A new wait is drawn for every shot, so infantry rate of fire is set in the weapon files.
- An attack order no longer adds its own random wait before shots.
- A vehicle's pause between bursts is the weapon's `FiringTimeout`, where this game uses a random 0.2 to 0.7 seconds. A vehicle with several guns keeps them all busy: spare guns take enemies that another gun already has.
- Suppression fire ordered by the player lasts 60 seconds from the first shot (8 seconds here).
- The console variable (on by default) makes an attacker move to where a moving target will be. Set it to 0 to aim at where the target is now.

## 5. Vehicle behaviour

A vehicle walks its single ordered enemy list and gives each weapon at most one enemy per think cycle. A weapon is skipped if the gun cannot be aimed there, if the ammunition rule has negative priority, or if the gunner seat is empty or the gunner is about to leave.

- **Approach.** If the best-ranked enemy is farther than the chosen weapon's aim range, the vehicle drives toward it.
- **Detour.** If no aiming solution exists (the target is behind a ridge, blocked, or covered by a `volume "body"` rule that no longer applies), the vehicle retries every 2 to 4 seconds and may reposition. When a tank selector ranks tanks above infantry and the first tank cannot be aimed at, the vehicle can circle or shuffle. Exactly how it moves then is not known (unconfirmed).
- **Gunner release.** When the local threat ratio is above 4, when crew are injured, or when only one seat remains filled, hatch gunners leave their bone-mounted machine guns and those guns go silent.
- **Crew leaving.** A crew that leaves a damaged vehicle does so because of the vehicle's interaction scripts, not the brain. The bot script has no boarding order, so whether a bot's crew climbs back in by itself is not known (unconfirmed).
- **Guns** return to an idle state after 4 seconds without orders.

### In Gates of Hell

<!-- goh: GHAI-40 GHAI-43 GHAI-58 GHAI-84 -->

- An idle vehicle does not turn its turret to scan the area unless its brain data switches that on. Here every tank does it by default.
- A gun keeps aiming at the same part of the same enemy about half of the time instead of picking again.
- A unit getting out of a vehicle keeps trying while the way out is blocked, and stays inside if it cannot. Here it gives up at once.
- A gun crew (units tagged `cannon`) leaves its gun when a crewman is down to half health and the attacker is behind the gun. This also happens to the player's guns.

## 6. Infantry tactics

Once per second a soldier decides on a stance, from 0 (retreat or stay low) through 1 (cautious), 2 (hold), 3 (advance) to 4 (strong advance). Its inputs are the **threat** against it, the **spread** of its allies, and its **morale**, a number from 0 to 100. Morale is pulled down toward current health when health is lower, and nudged toward the morale of nearby allies.

In plain terms:

- Compute a retreat limit and an advance limit by multiplying `retreat_ratio` by the threat and `advance_ratio` by the spread. Both limits grow by half when the soldier is in or near cover.
- Advance when morale is above 70, advancing is allowed, and the threat is above the advance limit. If the threat is more than double the limit, advance strongly.
- Unless retreating is disabled: fall back when the spread exceeds the retreat limit, turn cautious below morale 50, and retreat below morale 30. A retreating soldier stays in that state until the retreat limit catches up with the spread.

These are brain properties of the soldier's definition. Vanilla writes none of them, so the defaults apply; a mod sets them like this:

```
{brain "human"
  {Properties
    {advance_ratio 2.0}
    {retreat_ratio 2.0}
    {move_radius 7}
  }
}
```

The defaults for `advance_ratio` and `retreat_ratio` are both 2.0, and `move_radius` (how far a unit may stray from its anchor in zone mode) is 7 metres. Other properties are `no_advance`, `no_retreat`, `fire_mode`, `move_mode` (`hold`, `zone` or `free`), `control` and, for vehicles, `look_around`. Missions can override several of them per unit with the `actor_state` command (see [chapter 12](12-missions-and-multiplayer-setup.md)). The vanilla `{brain "human"}` block in `properties/human.ext` holds other settings: the distances at which soldiers notice and flee explosives and grenades, and `fight/distance`, where melee starts (1.5 metres).

Setting `no_retreat 1` together with `retreat_ratio 0`, a large `advance_ratio` and a large `move_radius` produces infantry that never fall back, roam far from their anchor and fight to the death. Also, `control user` written in a definition is overwritten for multiplayer units, so it only affects units a mission places outside multiplayer; whether `look_around` and `control user` change such placed units is not known (unconfirmed).

Soldiers seek cover within about 15 metres. They go prone when approaching beyond 25 metres, crouch beyond 10 metres, and stand within 7 metres.

### In Gates of Hell

<!-- goh: GHAI-01 GHAI-02 GHAI-10 GHAI-11 GHMIS-142 GHAI-78 GHAI-82 -->

- The formula is the same, but Gates of Hell's own `properties/human.ext` sets `advance_ratio 0.5` and `retreat_ratio 4`, where this game uses the defaults of 2 and 2. If you carry that file over, your infantry advance and retreat differently.
- A retreating soldier who is still outnumbered but has morale above 50 counterattacks for 1 to 2 seconds, then retreats again, over and over. `no_retreat` stops this, because the soldier never enters the retreat state.
- A soldier who is shot dives for cover, crawls or crouches only when the enemy is more than 20 metres away (here 10 metres). A console variable `coverLeaveEnemyDistance` with the default 20 exists; whether it changes this distance is not confirmed.
- One key, `bomb/danger_zone` (default 4, 7 in Gates of Hell's data), replaces `danger_zone_run`, `danger_zone_jump` and `danger_zone_hide`. Soldiers simply run from a grenade; they do not jump or dive.
- A soldier standing in a fire does not look for a way out of it unless something else moves him. This is a fault in that game.

## 7. Vision as an AI input

Spotting is controlled by the Sensor block in a unit's `.ext` file. This is the vanilla soldier's, from `properties/human.ext`:

```
{Sensor
	{Visor "eyes"
		{vision "human"}
		{bone "visor"}
	}
	{Visor "telescope"}
	{AttackZone 2.5}
	{RecognizeTime 0.25}
	{InformRange 40 40}		;first - AI ;second - USER
}
```

A contact is noticed once the time it has been visible exceeds `distance / sightRange * RecognizeTime`. A tiny [`RecognizeTime`](r08-vision-effects-sound.md#recognizetime) therefore means instant spotting. If a modder sets it near 0.01 and `InformRange` near 120, every unit spots everything and tells all its friends. [`InformRange`](r08-vision-effects-sound.md#informrange) takes two numbers, one for AI-controlled units and one for the player side; a spotter informs allies within that distance. If a key is absent the game falls back to a recognize time of 2 seconds, inform range 20, [threat zone](r08-vision-effects-sound.md#threatzone) 15, [attack zone](r08-vision-effects-sound.md#attackzone) 5 and [remember time](r08-vision-effects-sound.md#remembertime) 120.

The folder `set/vision/` sets how far a unit sees. Each [vision](r08-vision-effects-sound.md#vision) profile, named by the `vision` line of a visor, has [`uncover`](r08-vision-effects-sound.md#uncover) (the range at which a still target is spotted), `h_fov`, `v_fov` and [`radius`](r08-vision-effects-sound.md#radius), with multipliers for cover, squatting, crawling, standing still and firing. Vanilla profiles include `human`, `mp_soldier`, `mp_sniper`, `field_glass`, `cannon_main`, `vehicle_main` and `tank_main-l`, `tank_main-m` and `tank_main-h` for light, medium and heavy tanks. `set/vision/vision.set` wraps every radius in one macro, `(* 0.75 %r)`, so changing that one factor scales the sight of every unit. Firing multiplies the range above 1, so a shooter gives itself away. `set/unmasking.set` ([unmasking](r08-vision-effects-sound.md#unmasking)) controls how quickly hidden units are exposed by speed, pose and what they hold.

One trap: [`set/detect.set`](r08-vision-effects-sound.md#detect) does **not** affect AI spotting. It only controls how many seconds an enemy stays revealed to a human player when fog of war is on. A long value gives a long afterglow, not a slow detection.

Further detail on the data behind vision, effects and sound is in [chapter 16](16-effects-sound-models.md).

### In Gates of Hell

<!-- goh: GHAI-72 GHAI-73 GHAI-75 GHAI-76 GHMAP-20 -->

- The sensor works more slowly: it looks around every 0.5 to 1 second (here 0.1 to 0.5), and the brain thinks every 0.5 to 1.5 seconds (here 0.1 to 0.3). Units can react up to five times later than in this game.
- A new sensor key, `MinRecognizeTime` (default 0), sets the shortest time recognising can take. A unit that hurt you is recognised at once. This game does not know the key and reports an error for it, so remove it from any sensor block you carry over.
- `RememberTime` has no random spread: every unit of a type forgets a contact at the same age. Here each unit gets up to 20 percent more or less.
- A unit counts as firing for 1 second after its last real shot. Pulling the trigger on an empty gun does not give it away.
- The grid that hides units behind terrain uses 5-unit cells (7 here), so the same map can see differently.

## 8. Multiplayer bots

Multiplayer bots are driven by Lua, the only Lua in the game. It runs on the host only, one Lua state per bot. The entry file `script/multiplayer/bot.main.lua` loads `bot.lua` with [`require`](r12-bot-lua-and-console.md#require), and `bot.lua` loads the data file `bot.data.lua`. Files with the same path in a later-loaded mod replace the originals. The Lua has no sandbox (all standard libraries are open), so a script can touch the file system, which is another reason to read other people's scripts before you run them. [`print`](r12-bot-lua-and-console.md#print) writes to `game.log` with a `[LUA]` prefix, which makes it the easiest way to see what a bot script is doing. A Lua error does not stop the game: the bot goes idle and the log records the failure ([Lua errors](r12-bot-lua-and-console.md#lua-errors)).

### Getting a bot into a LAN game

The stock multiplayer game cards have no bot switch, so a LAN lobby will not let you add a bot. A mod that overrides `set/multiplayer/games/combat.set` and puts `{enableBots 1}` inside its `{settings}` block (not `{options}`) allows the lobby command [`mp_slot 2 normal`](r12-bot-lua-and-console.md#mp_slot) to fill slot 2 with a normal bot. In the ARSENAL window, the Maps page has an "Allow bots" tick for a copied map. A map that allows bots also needs flag points, or bots buy units and never give an order. Because bot Lua runs on the host only, a bot script you override by path takes effect only on the machine that hosts the game.

### What a bot can do

The bot functions are few:

| Call | Effect |
|---|---|
| [`BotApi.Commands:Spawn(unit, split)`](r12-bot-lua-and-console.md#spawn) | buy one unit at the bot's spawn point |
| [`BotApi.Commands:CaptureFlag(squad, flag)`](r12-bot-lua-and-console.md#captureflag) | order a squad to move to a flag |
| [`BotApi.Commands:SayChat(text)`](r12-bot-lua-and-console.md#saychat) | send a chat message |
| [`BotApi.Commands:Income(player)`](r12-bot-lua-and-console.md#income), [`BotApi.Commands:EnemyHasTanks()`](r12-bot-lua-and-console.md#enemyhastanks) | read the bot's income and whether the enemy has tanks |
| [`BotApi.Instance`](r12-bot-lua-and-console.md#2-botapiinstance), [`BotApi.Scene.Flags`](r12-bot-lua-and-console.md#flags), [`BotApi.Scene.Squads`](r12-bot-lua-and-console.md#squads) | read-only information: the bot's player, team, army and team size; the flags; its squads |

The `Commands` table holds exactly `Spawn`, `CaptureFlag`, `SayChat`, `Income` and `EnemyHasTanks`; there is no `ClearOrders`, so calling it is an error. The `Events` table holds [`Subscribe`](r12-bot-lua-and-console.md#subscribe), `Unsubscribe`, `SetTimer`, `KillTimer`, [`SetQuantTimer`](r12-bot-lua-and-console.md#setquanttimer) and `KillQuantTimer`.

A bot has **no** attack, retreat, boarding or fire-mission order. All fighting is done by the normal unit brains described above. New order types would need a change to the game itself. Events you can subscribe to are [`Init`](r12-bot-lua-and-console.md#init), `Done`, [`GameStart`](r12-bot-lua-and-console.md#gamestart), `GameEnd`, [`Quant`](r12-bot-lua-and-console.md#quant), [`GameSpawn`](r12-bot-lua-and-console.md#gamespawn) and `NonQuant`, one handler per event. The first handler subscribed for an event stays. If your script subscribes before it `require`s the stock `bot.lua`, the stock handler is dropped and the bot never spawns anything. Load the stock script first, then wrap or add your handlers after it.

`Spawn` has a quirk. It returns true when the card does not exist, is hidden or is not for sale, so the caller cannot detect a typo in a unit name; the stock script then simply moves on to its next pick. If a bot never buys something you listed, check the exact card name. Squad cards carry the army in brackets, such as `smgs(eng)`; vehicle cards are plain names, such as `dodgewc55`.

### The data file

`bot.data.lua` holds the bot's shopping plan. The names that the stock script actually reads are:

| Name | Effect |
|---|---|
| [`MaxSquadSize`](r12-bot-lua-and-console.md#maxsquadsize) | the split threshold passed to `Spawn` (stock 5) |
| [`OrderRotationPeriod`](r12-bot-lua-and-console.md#orderrotationperiod) | how often capture orders are re-issued, in milliseconds (stock `3 * 60 * 1000`, three minutes; only the bot script reads it, so a replacement `bot.lua` that does not use it ignores it) |
| [`FlagPriority`](r12-bot-lua-and-console.md#flagpriority) | weights for choosing which flag to go for: `Captured = 1`, `Enemy = 2`, `Neutral = 3` in stock |
| [`UnitClass`](r12-bot-lua-and-console.md#unitclass) | the class names: `Infantry`, `ATInfantry`, `Vehicle`, `Tank`, `AATank`, `ATTank`, `HeavyTank`, `ArtilleryTank` |
| [`Purchases`](r12-bot-lua-and-console.md#purchases) | stages, each with a `Repeat` count and, per army, a list of unit entries |

Two names are not read by anything: [`AttackBaseTime`](r12-bot-lua-and-console.md#attackbasetime) and the per-entry [`period`](r12-bot-lua-and-console.md#period). Which units a bot may buy in a given era comes from the preset's unit set, not from `period`. `ARSENAL fix <mod folder> plan|apply --out <patch folder> --only botkeys` removes both from your mod's `bot.data.lua` into a patch mod, and refuses when another Lua file of the mod names the key.

Stock data has eight stages for six armies (`eng`, `ger`, `ger2`, `usa`, `rus`, `jap`). A stage in the same pattern looks like this:

```lua
Purchases = {
	{--purchase 1
		Repeat = 4,
		Units = {
			["usa"] = {
				{priority = 3.0, class = UnitClass.Infantry, unit = "riflemans(usa)"},
				{priority = 1.0, class = UnitClass.Vehicle, unit = "willysmb"}
			},
		}
	},
	{--purchase 2
		Repeat = 0, --infinite
		Units = {
			["usa"] = {
				{priority = 1.0, min_income = 3.0, min_team = 2, class = UnitClass.ATTank, unit = "m36"}
			},
		}
	},
}
```

`Repeat` is the number of purchases in that stage before moving on. A value of 0 means "forever" and belongs on the last stage; without it the bot runs off the end of the list and stops buying. **An army that is missing from a stage buys nothing at that stage**, so list every army in every stage. Your copy of `bot.data.lua` replaces the whole stock file.

The stock `bot.lua` picks a unit by weighted random choice on [`priority`](r12-bot-lua-and-console.md#priority), among the entries whose [`min_income`](r12-bot-lua-and-console.md#min_income) and [`min_team`](r12-bot-lua-and-console.md#min_team) are met. It multiplies the weight of `Infantry` entries by 2.5 when the bot holds fewer flags than the enemy. When the enemy has no tanks, `ATTank` entries get weight 0; when the enemy has tanks, `ATInfantry` and `ATTank` entries get double weight. It tries to buy on every game quant.

Bot economy and difficulty come from the `bots` block in `set/multiplayer/games/bots_generic.inc`, which has entries for `easy`, `normal`, `hard` and `heroic` ([Bot difficulty](r12-bot-lua-and-console.md#7-bot-difficulty)). In stock data each sets `balancingFactorBonus` for command points, manpower and payback (0.75 for easy, 1.0 for normal, 1.25, 1.5 and 1.5 for hard, 1.5, 2.0 and 2.0 for heroic) and a `chargeFactors` block. Always set `chargeFactors` in any bot entry that also sets balancing (explained in chapter 12). Bot difficulty changes only that preset entry, not the Lua logic, apart from the `difficulty` value passed to the `GameStart` event.

A replacement `bot.lua` can add wave spawning, phase-based unit pools, per-tier ratios and attack groups, but it cannot touch brains, selectors, vision or ammunition rules. A well-behaved replacement caps its live squads.

### Bots in the ARSENAL window

- The **Bots** page (Game Modes & AI > Bots) shows "What bots buy" for each army, stage by stage, and lists units of your mod that no bot buys yet. "Make bots buy a unit" adds one entry to your copy of `bot.data.lua`, and "Bot difficulty" changes the numbers in `bots_generic.inc`. The command-line tool is `ARSENAL botrecipe`; see [Bots: what they buy and how they play](p11-bots.md) for its options.
- The **Bot Doctrine** page beside it applies a ready-made way of playing (a persona) to your mod and checks the result. The command line is `ARSENAL doctrine list personas`, `ARSENAL doctrine gen --persona <id> --out <mod folder> --game <game folder> --plan` and `ARSENAL doctrine check <mod folder> --game <game folder>`. With the stock `bot.lua` a persona can change only the three settings the stock script reads; the persona numbers are starting values that have not been tried in a match (unconfirmed).

More about the two pages:

- "What bots buy" warns when your mod has its own `bot.lua`, because that script may ignore the list.
- "Make bots buy a unit" asks for the "Unit name", "Army", "Stage" and "Kind of unit". "Buy it first (priority 1000, picked almost every time)" makes the bot pick it almost every time, and "Make it cheap and quick to unlock (for testing only)" lets you see it in a short test match. If your mod has no buy card for the unit, you can copy the card of another unit. "Preview" shows the change and "Write into my mod" writes it. After a write, "My change is not showing" opens the help for that case.
- "Bot difficulty" has one row each for Easy, Normal, Hard and Heroic, with "Army size x", "Income x" and "Payback x". "Preview changes" shows the result, "Write into my mod" writes your copy of `bots_generic.inc`, and "Back to stock (remove my copy)" deletes your copy so the stock values return.
- "Multiplayer start settings" changes start money and grow time in a preset file; [chapter 12](12-missions-and-multiplayer-setup.md#2-presets) explains it.
- The Bot Doctrine page has its own tabs Rules, Personas, Scenarios, Profile, Generate and Check. "Profile" tells the generator which bot your mod uses: "vanilla (stock bot)" or a larger replacement script; "Detect from my mod" chooses for you. "Generate" takes a persona and a "Strength" from 0 (no change) through 1 (the persona as written) to 2 (twice as strong), and an optional "Base bot file", then "Preview" and "Write into my mod". "Check" ("Check my mod") reads the result back. The universal persona puts the original numbers back.

The quick way: in the Quick Guided Task row choose "I want to" "change" "what bots buy and how they play". It walks you through the same jobs one step at a time: one army's first purchase, bot difficulty, lobby money, and how the bots fight. See [Use the Quick Guided Task](p17-quick-guided-task.md) and [chapter 19](19-toolchain.md#quick-guided-task).

### In Gates of Hell

<!-- goh: GHMIS-50 GHMIS-51 GHMIS-52 GHMIS-53 GHMIS-54 GHMIS-55 GHMIS-56 GHMIS-57 GHMIS-58 GHMIS-59 GHMIS-60 GHMIS-61 GHMIS-62 GHMIS-63 GHMIS-64 GHMIS-65 GHMIS-66 GHMIS-126 GHMIS-127 GHAI-63 GHAI-64 GHAI-65 GHCMD-13 -->

Bots there are still Lua, but the script, its functions and where it runs all differ. A bot script written for this game does not run there unchanged, and the other way round.

- **Where bots run.** In a Steam match the bots run in the separate server process; on LAN they run on the host. The entry file is still `script/multiplayer/bot.main.lua`; Gates of Hell's own script is that file plus one file per mode under `script/multiplayer/modes/` (for example `battlezones.lua`, `frontlines.lua`, `conquest.lua`), with shared helpers in `modes/utility.lua`. The console variable `dev_enableBotAi` (default 1) set to 0 starts bots without loading the script, so they neither buy nor move.
- **Events have other numbers.** Init 0, Done 1, GameStart 2, PrepTimeOver 3, WinnerDecided 4, GameEnd 5, Quant 6, GameSpawn 7, NonQuant 8, Waypoint 9. Here GameEnd is 3 and Quant 4, and the three new events do not exist. Subscribe by name (`BotApi.Events.Quant`), never by number, and the same handler works in both games. `WinnerDecided` passes the winning team's name, and `Waypoint` the squad that reached a waypoint.
- **Commands.** `EnemyHasTanks` is gone; a script that calls it fails. `Spawn(unit, split)` is the same as `SpawnAt(unit, split, -1)`, where the index picks one of the team's map points. An unknown unit name crashes the game instead of returning true, so test names first with `IsUnitAvailable(unit)`. Also new: `CanSpawn()`, `TimeToSpawnUnit(unit)` (in milliseconds; an unknown unit crashes here too), `GameOver(winner)` and `SeekAndDestroy(squad)`, which sends a squad to a random enemy within 50 metres: the first attack order a bot has.
- **`CaptureFlag`** sends the squad to the flag zone's centre, within a radius per kind of unit read from a Lua table `FlagCaptureArea` (kinds Helicopter, Artillery, Captor, Mortar, ATgun, Vehicle, Infantry). Without the table the radius is 0 and the log reads "DBG: FlagCaptureArea is not found". A vehicle with a free seat unloads at the flag. Here the squad goes to half the zone radius and does not unload.
- **Information.** `BotApi.Instance` calls the team size `ownTeamSize` (here `teamSize`) and adds `spawnPointName`, `gameMode`, `unitMode`, `difficulty`, `IsMultiplayer()`, `IsCooperative()`, `TeamSize(team)`, `HumansInTeam(team)` and `Relation(side)`. `BotApi.Scene` adds `QueryScene(props, seconds)` (counts of units by tag per side, which is how a script counts enemy tanks there), `Waypoints`, the mission variables `Vars`, `GetVar` and `SetVar`, and `IsSquadTagged(squad, tag)`. `BotApi.Scene.Flags` leaves out flags that cannot be captured. The global `module_exists(name)` tells whether a Lua file exists, and `BotApi.Conquest` gives Conquest data.
- **Brains on clients.** In a Steam match each player's game looks for a brain named `<name>_client` first (`human_client`, `vehicle_client` and so on). Changes to AI brains therefore act only in the server process, not on players' machines.
- **In ARSENAL** the bot shopping list of the Bots page, the Bot Doctrine page and the bots task of the Quick Guided Task are for this game only, because Gates of Hell has no `bot.data.lua`. Under the Gates of Hell button they say so in one line; the Bots page still changes the multiplayer settings there, and the Game Modes page changes bot difficulty and start money.

Each new function has a short entry under [Gates of Hell only](r12-bot-lua-and-console.md#gates-of-hell-only) in the bot reference.

## 9. Which data change affects which behaviour

| Lever | Where | Changes |
|---|---|---|
| Group order and `in_range` | `set/target/*.inc` | who gets shot first |
| Rule order, `enable_for_*`, `volume` | `set/target/ammo.set` | what may be used on what |
| Brain properties | `properties/human.ext` | retreat, advance, roaming |
| Sensor values | `properties/human.ext` and vehicle definitions | spotting speed, information sharing |
| Vision | `set/vision/*`, `set/unmasking.set` | sight range and exposure |
| Weapon keys | weapon stuff files | aiming tolerance, bursts, wind-up, range |
| Scripts | interaction scripts | pauses and crew behaviour |
| Bot Lua | `script/multiplayer/` | what bots buy and where they go |

Brain, sensor and target-file mistakes often fail quietly. An unknown key in a brain or sensor block may be skipped or may log an "unexpected token" message depending on the file, so after every edit read `game.log` (chapter 18) and run the lint tools described in [chapter 19](19-toolchain.md), for example `ARSENAL keylint` and `ARSENAL milint` (the latter checks bot data, and warns when a mode with bots has a map without flag points).

## 10. Symptom to cause

| Symptom | Likely cause | What to change |
|---|---|---|
| Vehicle machine guns fire one burst then pause | a pause script on the `fire` event in your mod set | that script |
| Rifles or machine guns never shoot tanks | no `bullet` rule for class `tank` in `ammo.set` | the `tank` block in `ammo.set` |
| A unit never attacks one kind of enemy | every group of its selector has `select` lines and none matches that enemy | add a group without `select`, or a matching `select` |
| A tank's machine gun ignores infantry while the cannon chases a tank | one shared list with tanks first | reorder groups in the tank selector |
| Your soldiers' launchers ignore infantry | the `ammo rocketlauncher` rule against `human` has `enable_for_user 0` | the human rules in `ammo.set` |
| Infantry never retreat, charge or wander | `no_retreat`, `retreat_ratio 0`, high `advance_ratio` or large `move_radius` | brain properties |
| Tanks circle or shuffle | the top-ranked target cannot be aimed at | `volume` rules, aim range, selector order |
| Everything spots everything | tiny `RecognizeTime` plus large `InformRange` | the Sensor block |
| Enemies stay visible too long | fog-of-war afterglow from `detect.set` | `set/detect.set` |
| Artillery is slow to fire | `PrepareTime` in seconds | gun presets |
| Bots buy nothing or the wrong units | purchase stages, a missing army in a stage, no `Repeat = 0` stage, or a wrong card name | `bot.data.lua`, `bots_generic.inc` |
| Bots buy but never move | no flag points on the map | place flag points |

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

<!-- goh: GHAI-04 GHAI-07 GHAI-43 GHAI-44 GHAI-89 GHAI-39 GHAI-79 GHMIS-51 GHMIS-54 -->

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. The decision chain | same as far as mapped | sensor, selector, ammo rule, aim, fire |
| 2. Target selection: `select.set` | [differs](#in-gates-of-hell) | `time_to_aim` dead for vehicles; flying helicopters skipped |
| 3. Ammunition choice: `ammo.set` | [differs](#in-gates-of-hell-1) | `ground` aims at the point; `MinRange`; AI ammunition runs out |
| 4. Firing rules | [differs](#in-gates-of-hell-2) | shot waits from `FiringTimeout`; suppression lasts 60 s |
| 5. Vehicle behaviour | [differs](#in-gates-of-hell-3) | idle tanks do not scan by default; gun crews leave under flank fire |
| 6. Infantry tactics | [differs](#in-gates-of-hell-4) | other ratios in data; short counterattacks; one grenade key |
| 7. Vision as an AI input | [differs](#in-gates-of-hell-5) | slower sensor; `MinRecognizeTime`; finer sight grid |
| 8. Multiplayer bots | [differs](#in-gates-of-hell-6) | other event numbers, new commands, one command removed |
| 9. Which data change affects which behaviour | same as far as mapped | the same levers; their defaults differ as above |
| 10. Symptom to cause | same as far as mapped | add: bots that crash on a stale unit name |

The job-by-job view is in [Bots: In Gates of Hell](p11-bots.md#in-gates-of-hell).

### Helicopters and air orders

Gates of Hell has helicopters, which this game lacks. They use their own brain `helicopter`, and the talk condition `seen` knows the word `helicopter` for call-outs. Air units can be ordered to make an airstrike (fly to the target, drop the strike's bomb, leave) or a reconnaissance flight (circle a point for a given time). This game knows neither the brain nor the talk word and has no such orders, so a helicopter cannot be carried over as data.

## Pitfalls

- A contact that matches no selector group is never attacked, with no error.
- A missing ammunition rule means "never fire" with no error.
- `detect.set` does not change AI spotting.
- Bot Lua cannot give attack, retreat or boarding orders, and `Spawn` hides bad unit names.
- Subscribing a bot event before loading the stock `bot.lua` drops the stock handler.
- `control user` in a definition is overwritten in multiplayer.
- Change one lever at a time and read `game.log` after each change.

## Next

[Chapter 11, Interaction scripts](11-interaction-scripts.md) explains the language of the scripts that change firing and crew behaviour.
