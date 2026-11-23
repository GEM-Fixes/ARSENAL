# Reference 12: Bot Lua Functions and Console Commands

This page is the reference for two things a modder reaches through code rather than data. The first is the bot script: the Lua functions a multiplayer bot may call, and the bot data that decides what bots buy. The second is the console: its commands, its variables, and the switches you can add to the game's command line. [Chapter 10](10-ai-and-bots.md) explains how bots think and [chapter 18](18-testing-and-logs.md) explains testing with the console and the game log. Come here when you need the exact facts about one function or command.

Every entry has the same shape. "Where" says where you write or type it. "Type" says what kind of thing it is. "Values" gives the arguments or values it accepts and the default. "Does" says what it does. "Limits" lists what silently fails, crashes, desyncs or is ignored. "Example" shows the pattern used in the game's own files. "See" points to the chapter and related entries.

## 1. How the bot script runs

Bots in multiplayer are driven by Lua, a small scripting language. It is the only Lua in the game: missions and the interface do not use it.

- The game uses Lua 5.2.3 with all its standard libraries open, including `os`, `io` and `debug`. Nothing is sandboxed, so treat a bot script from someone else like any other program.
- Each bot gets its own Lua state (its own separate copy of the script and its variables), created when the match starts. Bots run on the host only.
- The entry file is `/script/multiplayer/bot.main.lua`. The stock entry file loads `bot.lua`, which loads `bot.data.lua`.
- A mod changes bot behaviour by shipping its own file at the same path, which replaces the stock one.
- What a bot can do is limited to the functions below. New kinds of orders, such as attack or retreat, would need changes to the game itself.

### require
Where: any bot Lua file.
Type: Lua function.
Values: a path inside the game's file system, such as `[[/script/multiplayer/bot]]`; `.lua` is added for you.
Does: Loads another Lua file through the game's own file system, so a file in your mod overrides the stock file at the same path.
Limits: None known.
Example:
```lua
require([[/script/multiplayer/bot]])
```
<!-- goh: GHMIS-126 GHMIS-66 -->
Gates of Hell: the game also offers `module_exists(name)`, which is true when `name.lua` exists, so a script can guard an optional `require`. Its own bot script is probably `bot.main.lua` plus one file per game mode under `script/multiplayer/modes/` (not confirmed).
See: [chapter 10, section 8](10-ai-and-bots.md#8-multiplayer-bots); Part I [Bots: what they buy and how they play](p11-bots.md); [print](#print); [module_exists](#module_exists).

### print
Where: any bot Lua file.
Type: Lua function.
Values: any values.
Does: Writes a line to `game.log` with the prefix `[LUA]`. Where the text goes is set by the console variable `dev_luaPrintTarget`, which by default sends it to the log file and the debugger.
Limits: None known.
Example:
```lua
print("bot " .. BotApi.Instance.playerId .. " buys " .. unit)
```
See: [`dev_luaPrintTarget`](#dev_luaprinttarget); [chapter 18, section 5](18-testing-and-logs.md#5-the-structure-of-gamelog); [chapter 10, section 8](10-ai-and-bots.md#8-multiplayer-bots); Part I [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md).

### Lua errors
Where: any bot Lua file.
Type: behaviour.
Values: not applicable.
Does: When a handler raises a Lua error, the 64-bit build logs the failure and the handler returns nothing, so the bot goes idle. The original game aborts instead.
Limits: A bot that stops buying for no visible reason has usually hit an error; look for it in `game.log`.
Example:
```lua
local ok, err = pcall(BuyNext)
if not ok then print("bot error: " .. tostring(err)) end
```
See: [print](#print); [chapter 10, section 8](10-ai-and-bots.md#8-multiplayer-bots); [chapter 18, section 6](18-testing-and-logs.md#6-fatal-errors-and-warnings); Part I [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md).

## 2. BotApi.Instance

`BotApi.Instance` describes the bot that is running the script. All its fields are read-only.

### hostId
Where: `BotApi.Instance`.
Type: number.
Values: the bot's host id.
Does: Identifies the bot. The stock script seeds its random numbers with the current time multiplied by `hostId`, so two bots do not make the same choices.
Limits: None known.
Example:
```lua
math.randomseed(os.time() * BotApi.Instance.hostId)
```
See: [playerId](#playerid); [chapter 10, section 8](10-ai-and-bots.md#what-a-bot-can-do).

### playerId
Where: `BotApi.Instance`.
Type: number.
Values: the bot's side number.
Does: The side the bot plays, the same number a mission selector uses in `{player "n"}`.
Limits: In a four-slot game the host is side 2 and the bots are sides 3 and 4, not the slot numbers.
Example:
```lua
local side = BotApi.Instance.playerId
```
See: [`mp_userUnits`](#mp_userunits); [Income](#income); [Reference 11, `player` (selector field)](r11-mission-files.md#player-selector-field).

### team
Where: `BotApi.Instance`.
Type: value.
Values: the bot's team.
Does: The bot's own team, as compared with a flag's `occupant`.
Limits: It is not the argument of `Income`, which takes `playerId`.
Example:
```lua
local mine = flag.occupant == BotApi.Instance.team
```
See: [enemyTeam](#enemyteam); [Flags](#flags); [Income](#income).

### enemyTeam
Where: `BotApi.Instance`.
Type: value.
Values: the other team.
Does: The opposing team, for comparing flags.
Limits: None known.
Example:
```lua
if flag.occupant == BotApi.Instance.enemyTeam then enemyFlags = enemyFlags + 1 end
```
See: [team](#team); [Flags](#flags); [FlagPriority](#flagpriority).

### army
Where: `BotApi.Instance`.
Type: text.
Values: the bot's army name, such as `usa` or `ger`.
Does: Picks which list in `Purchases` the bot buys from.
Limits: An army with no list in the current purchase stage buys nothing.
Example:
```lua
local list = stage.Units[BotApi.Instance.army]
```
See: [Purchases](#purchases); [chapter 10, section 8](10-ai-and-bots.md#the-data-file); [Reference 11, section 14](r11-mission-files.md#14-armies).

### teamSize
Where: `BotApi.Instance`.
Type: number.
Values: the number of players in the bot's team.
Does: Lets the script gate units by team size; the stock script compares it with `min_team`.
Limits: None known.
Example:
```lua
if (entry.min_team or 0) <= BotApi.Instance.teamSize then ... end
```
<!-- goh: GHMIS-53 -->
Gates of Hell: the field is called `ownTeamSize`, so `teamSize` reads nil there. `BotApi.Instance` there also has `spawnPointName`, `gameMode`, `unitMode` and `difficulty`, and the functions `IsMultiplayer()`, `IsCooperative()`, `TeamSize(team)`, `HumansInTeam(team)` and `Relation(side)`.
See: [min_team](#min_team); [chapter 10, section 8](10-ai-and-bots.md#the-data-file).

## 3. BotApi.Events

The bot reacts to events. You subscribe one Lua function to each event; the game calls it with a table of arguments.

### Init
Where: event for `BotApi.Events:Subscribe`.
Type: event (number 0).
Values: called with an empty table.
Does: Raised when the bot's script starts.
Limits: None known.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.Init, function(args) print("bot ready") end)
```
See: [Subscribe](#subscribe); [Done](#done); [chapter 10, section 8](10-ai-and-bots.md#what-a-bot-can-do).

### Done
Where: event.
Type: event (number 1).
Values: called with an empty table.
Does: Raised when the bot's script is shut down.
Limits: None known.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.Done, function(args) print("bot done") end)
```
See: [Init](#init); [Subscribe](#subscribe).

### GameStart
Where: event.
Type: event (number 2).
Values: called with `{map = <map title>, difficulty = "easy" | "normal" | "hard" | "heroic"}`.
Does: Raised when the match starts. This is the place to read the difficulty and the map and branch the bot's behaviour on them.
Limits: Difficulty changes only the preset's `bots` entry (points and cooldowns); the stock script itself does not use it beyond this argument.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.GameStart, function(args)
	print("map " .. args.map .. " at " .. args.difficulty)
end)
```
See: [chapter 10, section 8](10-ai-and-bots.md#the-data-file); [section 7](#7-bot-difficulty); [Reference 11, `bots`](r11-mission-files.md#bots); Part I [Bots: what they buy and how they play](p11-bots.md).

### GameEnd
Where: event.
Type: event (number 3).
Values: called with an empty table.
Does: Raised when the match ends.
Limits: None known.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.GameEnd, function(args) KillAllTimers() end)
```
<!-- goh: GHMIS-51 -->
Gates of Hell: number 5. Write `BotApi.Events.GameEnd`, never the number.
See: [GameStart](#gamestart); [KillQuantTimer](#killquanttimer).

### Quant
Where: event.
Type: event (number 4).
Values: called with an empty table.
Does: Raised on every simulation step (quant) of the game.
Limits: Keep the handler short: it runs very often.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.Quant, function(args) TryBuy() end)
```
<!-- goh: GHMIS-51 -->
Gates of Hell: number 6.
See: [NonQuant](#nonquant); [SetQuantTimer](#setquanttimer); [Spawn](#spawn).

### GameSpawn
Where: event.
Type: event (number 5).
Values: called with `{squadId = n}`.
Does: Raised when one of the bot's purchases arrives on the map, with the id of the new squad.
Limits: None known.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.GameSpawn, function(args)
	BotApi.Commands:CaptureFlag(args.squadId, PickFlag())
end)
```
<!-- goh: GHMIS-51 -->
Gates of Hell: number 7.
See: [CaptureFlag](#captureflag); [Spawn](#spawn); [OrderRotationPeriod](#orderrotationperiod).

### NonQuant
Where: event.
Type: event (number 6).
Values: called with an empty table.
Does: Raised on every drawn frame.
Limits: Frame rate differs between machines; the bot runs on the host only, so this does not desync, but do game logic on `Quant` instead.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.NonQuant, function(args) end)
```
<!-- goh: GHMIS-51 -->
Gates of Hell: number 8.
See: [Quant](#quant).

### Subscribe
Where: `BotApi.Events:Subscribe(event, function)`.
Type: Lua function.
Values: an event from this section and a Lua function.
Does: Sets the function the game calls for that event.
Limits:
- Only one handler per event is kept: the first `Subscribe` for an event stays and later ones do not replace it. Call `Unsubscribe` first if you want to change it.
- Pass the event by name, such as `BotApi.Events.Quant`, not by its number. The numbers are not the same in every game, and a name keeps one script working in both.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.GameStart, OnGameStart)
```
<!-- goh: GHMIS-51 GHMIS-52 -->
Gates of Hell: the numbers run 0 to 9, with three more events: `PrepTimeOver`, `WinnerDecided` and `Waypoint`. A script that subscribes to one of them here gets a nil event and fails.
See: [Unsubscribe](#unsubscribe); [chapter 10, section 8](10-ai-and-bots.md#what-a-bot-can-do); [Gates of Hell only](#gates-of-hell-only).

### Unsubscribe
Where: `BotApi.Events:Unsubscribe(event)`.
Type: Lua function.
Values: an event.
Does: Removes the handler for that event.
Limits: None known.
Example:
```lua
BotApi.Events:Unsubscribe(BotApi.Events.Quant)
```
See: [Subscribe](#subscribe).

### SetTimer
Where: `BotApi.Events:SetTimer(function, ms)`.
Type: Lua function.
Values: a function and a time in milliseconds of real time.
Does: Calls the function after the time, using the engine's clock.
Limits: None known.
Example:
```lua
local id = BotApi.Events:SetTimer(SayHello, 5000)
```
See: [KillTimer](#killtimer); [SetQuantTimer](#setquanttimer).

### KillTimer
Where: `BotApi.Events:KillTimer(id)`.
Type: Lua function.
Values: a timer id from `SetTimer`.
Does: Stops that timer.
Limits: None known.
Example:
```lua
BotApi.Events:KillTimer(id)
```
See: [SetTimer](#settimer).

### SetQuantTimer
Where: `BotApi.Events:SetQuantTimer(function, ms)`.
Type: Lua function.
Values: a function and a time in milliseconds of game time.
Does: Calls the function after that much game time has passed, so it slows down and speeds up with the game. The stock script uses it to re-issue capture orders every `OrderRotationPeriod`.
Limits: None known.
Example:
```lua
BotApi.Events:SetQuantTimer(RotateOrders, OrderRotationPeriod)
```
See: [OrderRotationPeriod](#orderrotationperiod); [KillQuantTimer](#killquanttimer); [SetTimer](#settimer).

### KillQuantTimer
Where: `BotApi.Events:KillQuantTimer(id)`.
Type: Lua function.
Values: a timer id from `SetQuantTimer`.
Does: Stops that game-time timer.
Limits: None known.
Example:
```lua
BotApi.Events:KillQuantTimer(rotationTimer)
```
See: [SetQuantTimer](#setquanttimer); [GameEnd](#gameend).

## 4. BotApi.Commands

### Spawn
Where: `BotApi.Commands:Spawn(unit, split)`.
Type: Lua function, returns true or false.
Values: `unit` is a unit card name from the multiplayer unit lists, such as `"smgs(eng)"` or `"achilles"`. `split` is a number: when it is above 0 and below the number of men in the squad, the squad is split in half.
Does: Buys one unit at the bot's spawn point, exactly as a player would, paying manpower and command points. On a real purchase it writes `DBG: SpawnUnit <unit> <player>` to the log just before the unit spawns.
Limits:
- It returns false while a purchase is still pending, before the countdown is over, when no game is running, in the first round of an evacuation game for team b, and when the side cannot buy (not enough manpower or command points, or a unit limit reached).
- It returns true, and logs `DBG: Spawning Unit Not found - <name>`, when the card does not exist.
- It returns true without any message when the card is on cooldown, hidden or not for sale.
- So true does not prove the unit arrived; check the match's unit list with `mp_userUnits`.
- `split` is a threshold for splitting, not a maximum squad size.
Example:
```lua
if BotApi.Commands:Spawn(entry.unit, MaxSquadSize) then stage:moveNext() end
```
<!-- goh: GHMIS-55 GHMIS-58 -->
Gates of Hell: `Spawn(unit, split)` is the same as `SpawnAt(unit, split, -1)`. An unknown unit name crashes the game instead of returning true, and there is no test for cooldown, hidden or not for sale; check a name first with `IsUnitAvailable(unit)`. The evacuation rule for team b is not there.
See: [MaxSquadSize](#maxsquadsize); [Purchases](#purchases); [`mp_userUnits`](#mp_userunits); [chapter 10, section 8](10-ai-and-bots.md#what-a-bot-can-do); [Reference 11, section 13](r11-mission-files.md#13-units); Part I [Bots: what they buy and how they play](p11-bots.md).

### CaptureFlag
Where: `BotApi.Commands:CaptureFlag(squadId, flagName)`.
Type: Lua function.
Values: a squad id from `Squads` or `GameSpawn`, and a flag name from `Flags`.
Does: Orders the squad to move to the flag, to a spot within half the flag's capture radius. If the squad has a leader only the leader is ordered; otherwise every member who is not inside a vehicle is ordered. This is the only order a bot can give.
Limits: Failures do not raise an error; they only log `DBG: CaptureFlags() Squad is not found` or `DBG: CaptureFlags() Flag is not found`.
Example:
```lua
BotApi.Commands:CaptureFlag(squadId, flag.name)
```
<!-- goh: GHAI-63 GHAI-64 -->
Gates of Hell: the squad goes to the flag zone's centre, within a radius per kind of unit read from a Lua table `FlagCaptureArea`. Without that table the radius is 0 and the log reads `DBG: FlagCaptureArea is not found`. A vehicle with a free seat unloads at the flag. It is no longer the only order: `SeekAndDestroy(squad)` also exists there.
See: [Flags](#flags); [FlagPriority](#flagpriority); [GameSpawn](#gamespawn); [chapter 10, section 8](10-ai-and-bots.md#what-a-bot-can-do); [Reference 11, `mapPoint`](r11-mission-files.md#mappoint).

### SayChat
Where: `BotApi.Commands:SayChat(text)`.
Type: Lua function.
Values: text.
Does: Sends a chat message to all players.
Limits: None known.
Example:
```lua
BotApi.Commands:SayChat("Attack the bridge!")
```
See: [chapter 10, section 8](10-ai-and-bots.md#what-a-bot-can-do); [print](#print).

### Income
Where: `BotApi.Commands:Income(side)`.
Type: Lua function, returns a number.
Values: a side number, the bot's `playerId`; the stock script passes `BotApi.Instance.playerId`.
Does: Returns the current manpower income per second of the budget named `vehicle` for that side, or 0 if there is no such budget. The stock script compares it with each entry's `min_income`.
Limits: Only the budget named `vehicle` is read; a mod that renames that budget makes `Income` always 0.
Example:
```lua
local income = BotApi.Commands:Income(BotApi.Instance.playerId)
```
See: [min_income](#min_income); [playerId](#playerid); [Reference 11, section 12](r11-mission-files.md#12-budgets); [chapter 12, section 3](12-missions-and-multiplayer-setup.md#3-budgets-and-income).

### EnemyHasTanks
Where: `BotApi.Commands:EnemyHasTanks()`.
Type: Lua function, returns true or false.
Values: none.
Does: True when any enemy entity carries the tag `tank`.
Limits: A vehicle without the `tank` tag does not count, whatever it is.
Example:
```lua
local tanks = BotApi.Commands:EnemyHasTanks()
```
<!-- goh: GHMIS-54 GHAI-65 -->
Gates of Hell: absent; a script that calls it fails. Count enemy tanks with `BotApi.Scene.QueryScene` on the tag `tank` instead.
See: [UnitClass](#unitclass); [chapter 10, section 8](10-ai-and-bots.md#the-data-file).

## 5. BotApi.Scene

### Flags
Where: `BotApi.Scene.Flags`.
Type: Lua table.
Values: a list of `{name, occupant}` entries; `occupant` is the team that holds the flag.
Does: The flags in play. Inactive flags are left out.
Limits: Walk it with `pairs`, not with a numbered loop from 1.
Example:
```lua
for _, flag in pairs(BotApi.Scene.Flags) do print(flag.name, flag.occupant) end
```
<!-- goh: GHMIS-64 -->
Gates of Hell: flags that cannot be captured are left out as well.
See: [CaptureFlag](#captureflag); [team](#team); [Reference 11, `mapPoint`](r11-mission-files.md#mappoint); [chapter 13, section 6](13-maps.md#6-map-points-spawns-and-flags).

### Squads
Where: `BotApi.Scene.Squads`.
Type: Lua table.
Values: a list of squad ids.
Does: The bot side's squads that still have at least one member outside a vehicle.
Limits: Walk it with `pairs`, not with a numbered loop from 1.
Example:
```lua
for _, squadId in pairs(BotApi.Scene.Squads) do BotApi.Commands:CaptureFlag(squadId, target) end
```
See: [IsSquadExists](#issquadexists); [CaptureFlag](#captureflag).

### IsSquadExists
Where: `BotApi.Scene:IsSquadExists(id)`.
Type: Lua function, returns true or false.
Values: a squad id.
Does: True while that squad exists.
Limits: It tests any squad, not only the bot's own.
Example:
```lua
if BotApi.Scene:IsSquadExists(squadId) then ... end
```
See: [Squads](#squads); [SetQuantTimer](#setquanttimer).

## 6. Bot data: what bots buy

The stock bot reads its tuning from `/script/multiplayer/bot.data.lua`. You change what bots buy by shipping your own copy of this file in your mod. The stock `bot.lua` reads only the names below.

### MaxSquadSize
Where: `bot.data.lua`, global.
Type: number.
Values: stock 5.
Does: Passed as `split` to every `Spawn`.
Limits: It is a split threshold, not a cap on squad size.
Example:
```lua
MaxSquadSize = 5
```
See: [Spawn](#spawn); [chapter 10, section 8](10-ai-and-bots.md#the-data-file); Part I [Bots: what they buy and how they play](p11-bots.md).

### OrderRotationPeriod
Where: `bot.data.lua`, global.
Type: number (milliseconds of game time).
Values: stock `3*60*1000`, three minutes.
Does: How often the bot picks new flags and re-issues capture orders. The stock `bot.lua` gives every squad its first order when it arrives, then starts a `SetQuantTimer` with this delay; each time the timer runs it picks a flag again and starts a new timer while the squad still exists.
Limits: Only the bot script reads it; a replacement `bot.lua` that does not use it ignores it.
Example:
```lua
OrderRotationPeriod = 3*60*1000
```
See: [SetQuantTimer](#setquanttimer); [IsSquadExists](#issquadexists); [CaptureFlag](#captureflag); [chapter 10, section 8](10-ai-and-bots.md#the-data-file).

### FlagPriority
Where: `bot.data.lua`, global table.
Type: table: `{Captured = n, Enemy = n, Neutral = n}`.
Values: stock 1, 2 and 3.
Does: Weights for the random pick of the next flag to capture: flags the bot holds, flags the enemy holds, and neutral flags.
Limits: None known.
Example:
```lua
FlagPriority = {Captured = 1, Enemy = 2, Neutral = 3}
```
See: [CaptureFlag](#captureflag); [Flags](#flags); [chapter 10, section 8](10-ai-and-bots.md#the-data-file).

### UnitClass
Where: `bot.data.lua`, global table.
Type: table of text values.
Values: `Infantry = "infantry"`, `ATInfantry = "at-infantry"`, `Vehicle = "vehicle"`, `Tank = "tank"`, `AATank = "aa-tank"`, `ATTank = "at-tank"`, `HeavyTank = "heavy-tank"`, `ArtilleryTank = "artillery-tank"`.
Does: Names the classes the purchase weights use. Writing `UnitClass.Infantry` and writing `"infantry"` give the same value.
Limits: Only `Infantry`, `ATInfantry` and `ATTank` change the weights; the other classes are labels.
Example:
```lua
UnitClass = {Infantry = "infantry", ATInfantry = "at-infantry", Tank = "tank", ATTank = "at-tank"}
```
See: [priority](#priority); [class](#class); [EnemyHasTanks](#enemyhastanks).

### Purchases
Where: `bot.data.lua`, global table.
Type: list of stages: `{Repeat = n, Units = {[army] = {entry, ...}}}`.
Values: `Repeat` is the number of purchases in the stage before the bot moves on; 0 means stay on this stage for ever. `Units` holds one list of entries per army.
Does: The bot's shopping plan. Each stage is a weighted list; every purchase moves the stage counter on.
Limits:
- If no stage has `Repeat = 0`, the bot runs off the end of the list and stops buying.
- An army that has no list in a stage buys nothing in that stage.
- A global written twice keeps the last value.
Example:
```lua
Purchases = {
	{Repeat = 4, Units = {usa = {{priority = 3.0, class = UnitClass.Infantry, unit = "riflemans(usa)"}}}},
	{Repeat = 0, Units = {usa = {{priority = 1.0, min_income = 3.0, min_team = 2, class = UnitClass.ATTank, unit = "achilles"}}}},
}
```
See: [Spawn](#spawn); [army](#army); [unit](#unit); [chapter 10, section 8](10-ai-and-bots.md#the-data-file); Part I [Bots: what they buy and how they play](p11-bots.md).

### priority
Where: an entry in `Purchases`.
Type: number.
Values: a weight.
Does: The chance of the entry being picked, relative to the others in the list. The stock script then adjusts it: infantry weight times 2.5 when the bot holds fewer flags than the enemy; `ATTank` weight 0 when the enemy has no tanks; `ATInfantry` and `ATTank` weight times 2 when the enemy has tanks.
Limits: Only `ATTank`, not `ATInfantry`, drops to 0 when the enemy has no tanks.
Example:
```lua
{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(eng)"}
```
See: [UnitClass](#unitclass); [EnemyHasTanks](#enemyhastanks); [class](#class); [chapter 10, section 8](10-ai-and-bots.md#the-data-file); Part I [Bots: what they buy and how they play](p11-bots.md).

### class
Where: an entry in `Purchases`.
Type: text.
Values: one of the `UnitClass` values.
Does: Tells the weighting rules what kind of unit the entry is.
Limits: None known.
Example:
```lua
{priority = 2.0, class = UnitClass.Tank, unit = "sherman_m4a1"}
```
See: [UnitClass](#unitclass); [priority](#priority).

### unit
Where: an entry in `Purchases`.
Type: text.
Values: a multiplayer unit card name. Squad cards carry the army in brackets, such as `"smgs(eng)"`; vehicle cards are plain names, such as `"dodgewc55"` or `"achilles"`.
Does: The card `Spawn` buys.
Limits: A card name that does not exist still counts as a purchase: `Spawn` returns true and logs `DBG: Spawning Unit Not found - <name>`.
Example:
```lua
{priority = 1.0, class = UnitClass.Vehicle, unit = "dodgewc55"}
```
<!-- goh: GHMIS-55 -->
Gates of Hell: a card name that does not exist crashes the game when the bot buys it.
See: [Spawn](#spawn); [Reference 11, section 13](r11-mission-files.md#13-units); Part I [Bots: what they buy and how they play](p11-bots.md).

### min_income
Where: an entry in `Purchases`.
Type: number (manpower per second).
Values: default -1, so the entry is always allowed.
Does: The entry is only picked when `Income` is at least this value.
Limits: None known.
Example:
```lua
{priority = 1.0, min_income = 3.0, class = UnitClass.ATTank, unit = "achilles"}
```
See: [Income](#income); [min_team](#min_team).

### min_team
Where: an entry in `Purchases`.
Type: number.
Values: default 0.
Does: The entry is only picked when the bot's team has at least this many players.
Limits: None known.
Example:
```lua
{priority = 1.0, min_team = 2, class = UnitClass.HeavyTank, unit = "pershing"}
```
See: [teamSize](#teamsize); [min_income](#min_income).

### AttackBaseTime
Where: `bot.data.lua`, global.
Type: number.
Values: any.
Does: Nothing: no script reads it.
Limits: Changing it has no effect. The full ARSENAL check (not `--fast`) reports it as never read by the bot, and `ARSENAL fix <mod folder> plan|apply --out <patch folder> --only botkeys` removes it from your mod's `bot.data.lua` into a patch mod. The fix refuses when another Lua file of the mod names the key.
Example:
```lua
AttackBaseTime = 10*60*1000
```
See: [OrderRotationPeriod](#orderrotationperiod); [period](#period); [chapter 10, section 8](10-ai-and-bots.md#the-data-file); Part I [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md).

### period
Where: an entry in `Purchases`.
Type: number.
Values: any.
Does: Nothing: the Lua script ignores it. Which units are on sale at what time is decided by the preset's unit set and era tags, not by the bot.
Limits: Changing it has no effect. The full ARSENAL check reports it the same way, and the `botkeys` fix described under [AttackBaseTime](#attackbasetime) removes it the same way.
Example:
```lua
{priority = 1.0, class = UnitClass.Tank, unit = "t34_85", period = 2}
```
See: [Reference 11, `unitset`](r11-mission-files.md#unitset); [AttackBaseTime](#attackbasetime); [chapter 12, section 2](12-missions-and-multiplayer-setup.md#unit-sets); Part I [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md).

## 7. Bot difficulty

Bot difficulty does not change the Lua script. It changes the preset's `bots` entry in the game mode data. The stock values multiply what a bot gets, against a player's 1.0 (`balancingFactorBonus` and `chargeFactors` in `bots_generic.inc`):

| Difficulty | Command points | Manpower | Payback | Cooldowns |
|---|---|---|---|---|
| easy | 0.75 | 0.75 | 0.75 | none (`*=0`) |
| normal | 1.0 | 1.0 | 1.0 | none (`*=0`) |
| hard | 1.25 | 1.5 | 1.5 | none (`*=0`) |
| heroic | 1.5 | 2.0 | 2.0 | none (`*=0`) |

The `GameStart` event also passes the difficulty, so your script can branch on it. Stock `combat.set` has no `enableBots` setting; to add bots to that mode in a test, a mod has to supply its own copy with bots enabled.

<!-- goh: GHMIS-82 GHMIS-81 -->
Gates of Hell: a preset's bot entries are named `<difficulty>_<team>` instead of the difficulty alone, so such an entry is not matched here and the bot falls back to `common`. `balancingFactorBonus` there has the keys `cp`, `mpStart`, `mpFinish`, `payback`, `periodicFactor`, `chargeDelay` and `charge`; `mp` is gone, and this game reads only `cp`, `mp` and `payback`.

See: [GameStart](#gamestart); [Reference 11, `bots`](r11-mission-files.md#bots); [Reference 11, `balancingFactorBonus`](r11-mission-files.md#balancingfactorbonus); [Reference 11, `chargeFactors`](r11-mission-files.md#chargefactors); [chapter 10, section 8](10-ai-and-bots.md#the-data-file); [chapter 12, section 2](12-missions-and-multiplayer-setup.md#charge-factors-and-balancing); Part I [Bots: what they buy and how they play](p11-bots.md).

## 8. Reaching the console

The console is a text line where you type commands and read their answers. How you open it depends on the build:

- The editor build always has it.
- The 64-bit game build has it only when started with `-console`; the key is the one left of `1`, whatever your keyboard layout.
- On the retail 3.262 game, the `~` key opens nothing.
- The 64-bit build can also take console commands over a control pipe when started with `-control`.

Console variables reach the simulation, which is why the console is off by default. There is no cheat system.

## 9. Console commands

### q
Where: console.
Type: command.
Values: none.
Does: Quits the game.
Limits: None known.
Example:
```
q
```
See: [exec](#exec); [section 8](#8-reaching-the-console).

### exec
Where: console.
Type: command.
Values: a file name in quotes; the file must be a `.cfg`.
Does: Runs the console commands in the file, one per line.
Limits: A bare name such as `exec "x.cfg"` looks only in `resource/at/`. Write `/x.cfg` or `resource/x.cfg` to reach other places.
Example:
```
exec "/mytest.cfg"
```
See: [chapter 18, section 4](18-testing-and-logs.md#4-the-lan-test-bed); [chapter 12, section 9](12-missions-and-multiplayer-setup.md#9-the-console-and-registry); [-control](#-control).

### s_version
Where: console.
Type: command.
Values: none.
Does: Prints the game version.
Limits: None known.
Example:
```
s_version
```
See: [q](#q); [chapter 18, section 5](18-testing-and-logs.md#5-the-structure-of-gamelog).

### mp_game_over
Where: console, during a multiplayer match.
Type: command.
Values: `win` or `lose`.
Does: Ends the match with that result.
Limits: None known.
Example:
```
mp_game_over win
```
See: [mp_game_set_score](#mp_game_set_score); [chapter 18, section 4](18-testing-and-logs.md#4-the-lan-test-bed).

### mp_game_set_score
Where: console, during a multiplayer match.
Type: command.
Values: a host id and a score value.
Does: Adds the value to the personal score of the player with that host id, while the match is running.
Limits: An unknown host id does nothing and prints nothing.
Example:
```
mp_game_set_score 2 500
```
<!-- goh: GHMIS-68 GHMIS-67 -->
Gates of Hell: it adds to the score instead of the personal score. The personal score has its own command there, `mp_game_set_personal_score`.
See: [mp_game_over](#mp_game_over); [mp_userUnits](#mp_userunits).

### mp_userUnits
Where: console, during a multiplayer match.
Type: command.
Values: none.
Does: Lists every side's units in the match, each with its card name and its command point, capture weight, score and cooldown values, for example `t34_0[4] u:t34_0 cp:15 cw:0 score:17.5 chrg:0`. Sides are shown as `#2`, `#3` and so on, which are the side numbers missions and bots use.
Limits: The list includes the host's profile name; do not paste it into public notes. A side with no units loses, so read the list before the match ends.
Example:
```
mp_userUnits
```
<!-- goh: GHMIS-68 -->
Gates of Hell: the score shown is the bought unit's kill score.
See: [Spawn](#spawn); [playerId](#playerid); [Reference 11, section 13](r11-mission-files.md#13-units); [chapter 18, section 4](18-testing-and-logs.md#4-the-lan-test-bed).

### mp_checkSpawnPoints
Where: console, multiplayer.
Type: command.
Values: none.
Does: Makes every map point and spawn point of the loaded map active and visible, and prints `SpawnPoint <name> is not assigned to mapPoint` for each spawn point whose `mapPoint` is empty or names no map point.
Limits: It changes the scene it checks: points that were hidden or inactive stay shown and active. Use it in a test, not in a match you want to finish.
Example:
```
mp_checkSpawnPoints
```
See: [mp_checkCaptureFlag](#mp_checkcaptureflag); [mp_checkCompetitive](#mp_checkcompetitive); [Reference 11, `mapPoint`](r11-mission-files.md#mappoint); [chapter 13, section 6](13-maps.md#6-map-points-spawns-and-flags); Part I [Copy and change a map](p09-copy-and-change-a-map.md).

### mp_checkCaptureFlag
Where: console, multiplayer.
Type: command.
Values: none.
Does: Checks a map for the `captureflag` mode. It first runs `mp_checkSpawnPoints`, then wants exactly one flag (`Flags found - <n>. Must be 1`) and a clipper for each team (`Clipper '<name>' is not found!`).
Limits: The closing `No errors found` line is not reliable: it can follow an error line. Read the error lines, not the summary.
Example:
```
mp_checkCaptureFlag
```
<!-- goh: GHMIS-123 -->
Gates of Hell: the summary line is probably wrong the other way round there as well (not confirmed); trust the error lines.
See: [mp_checkSpawnPoints](#mp_checkspawnpoints); [Reference 11, `class`](r11-mission-files.md#class); [chapter 13, section 6](13-maps.md#6-map-points-spawns-and-flags).

### mp_checkCompetitive
Where: console, multiplayer.
Type: command.
Values: none.
Does: Checks the map points of a competitive map. It first runs `mp_checkSpawnPoints`, then checks the `order` of every map point that is not a flag: each `order` used once per team, no `order 0` (`order=0 is unacceptable`), a `team` of `a`, `b` or the deathmatch team (anything else is `invalid value`), as many points for team a as for team b, and as many deathmatch points as both teams together. It reports gaps as `team A: No mapPoint for order=<n>` and ends with a line such as `2x2 - 4 players`.
Limits: It stops at the first count mismatch (`Teams are unmatched!` or `dm(...) != a(...) + b(...)`), so fix that and run it again.
Example:
```
mp_checkCompetitive
```
See: [mp_checkSpawnPoints](#mp_checkspawnpoints); [Reference 11, `order`](r11-mission-files.md#order-1); [Reference 11, `team`](r11-mission-files.md#team); [chapter 13, section 6](13-maps.md#6-map-points-spawns-and-flags).

### ui_page_reload
Where: console.
Type: command.
Values: none.
Does: Reloads the current interface page, so you can see an interface edit without restarting.
Limits: None known.
Example:
```
ui_page_reload
```
See: [v_dumpDialogsToFile](#v_dumpdialogstofile); [chapter 18, section 1](18-testing-and-logs.md#1-the-per-change-test-loop); Part I [Icons and interface](p08-icons-and-interface.md).

### v_dumpDialogsToFile
Where: console.
Type: command.
Values: optional: the id of a dialog; without it, the whole desktop.
Does: Writes the tree of interface dialogs below that dialog to a file named `dialogs.txt`, one dialog per line with its state and text. Useful to find the id of a dialog you want to change.
Limits: An id that is not found prints `No dialog with id '<id>' found. Using desktop.` and dumps the whole desktop. Each run overwrites the file.
Example:
```
v_dumpDialogsToFile
```
<!-- goh: GHUI-35 -->
Gates of Hell: Ctrl+Alt+T runs `v_dumpDialogsToFile desktop` and prints `Tree dump complete`.
See: [ui_page_reload](#ui_page_reload); Part I [Icons and interface](p08-icons-and-interface.md).

### mp_host
Where: console or control pipe, in the lobby.
Type: command.
Values: a map id `multi/<map>:<mode>` (a bare map name means `:combat`) and the number of slots.
Does: Hosts a multiplayer lobby on that map and mode.
Limits: Run `mp_lan` first.
Example:
```
mp_host multi/2v2_farmstead:combat 4
```
See: [mp_slot](#mp_slot); [mp_maps](#mp_maps); [chapter 18, section 4](18-testing-and-logs.md#4-the-lan-test-bed); [chapter 12, section 10](12-missions-and-multiplayer-setup.md#testing-with-two-players).

### mp_slot
Where: console or control pipe, in the lobby.
Type: command.
Values: a slot number and a bot difficulty such as `normal`.
Does: Puts a bot into that slot.
Limits: The mode must allow bots.
Example:
```
mp_slot 2 normal
```
See: [section 7](#7-bot-difficulty); [chapter 10, section 8](10-ai-and-bots.md#getting-a-bot-into-a-lan-game); Part I [Bots: what they buy and how they play](p11-bots.md).

### mp_set
Where: console or control pipe, in the lobby.
Type: command.
Values: a setting path and a value, such as `team.b.army <army>`.
Does: Changes a lobby setting.
Limits: Setting a team's army is refused with `no field` when the mode chooses armies per alliance (the stock `combat.set` does). The command can answer ok without the change taking hold; read `mp_slots` to be sure.
Example:
```
mp_set team.b.army ger
```
See: [mp_slots](#mp_slots); [mp_army](#mp_army); `armySelectionMode` in [Reference 11](r11-mission-files.md#armyselectionmode).

### mp_slots
Where: console or control pipe, in the lobby.
Type: command.
Values: none.
Does: Lists the lobby slots with their teams and armies.
Limits: None known.
Example:
```
mp_slots
```
See: [mp_set](#mp_set).

### mp_army
Where: console or control pipe, in the lobby.
Type: command.
Values: an army.
Does: Chooses an army.
Limits: Refused when armies are chosen per team.
Example:
```
mp_army usa
```
See: [mp_set](#mp_set); [Reference 11, section 14](r11-mission-files.md#14-armies).

### mp_ready
Where: console or control pipe, in the lobby.
Type: command.
Values: none.
Does: Marks the player ready.
Limits: It reaches the host after a short delay, so a `mp_start` sent straight after may need to be repeated.
Example:
```
mp_ready
```
<!-- goh: GHMIS-106 -->
Gates of Hell: the console variable `mp_session_autoready` makes a seated player ready at once.
See: [mp_start](#mp_start).

### mp_start
Where: console or control pipe, in the lobby.
Type: command.
Values: none.
Does: Starts the match.
Limits: See [mp_ready](#mp_ready).
Example:
```
mp_start
```
See: [mp_ready](#mp_ready); [chapter 18, section 4](18-testing-and-logs.md#4-the-lan-test-bed).

### mp_maps
Where: console or control pipe.
Type: command.
Values: none.
Does: Lists the map ids the lobby knows, in the form `multi/<map>:<mode>`.
Limits: None known.
Example:
```
mp_maps
```
See: [mp_host](#mp_host); [Reference 11, `<mode>.info`](r11-mission-files.md#modeinfo); [chapter 13, section 8](13-maps.md#8-getting-into-the-lobby).

### mod_list
Where: control pipe.
Type: command.
Values: none.
Does: Returns the mod list as JSON.
Limits: Only in the 64-bit build; the retail game does not have it.
Example:
```
mod_list
```
See: [-control](#-control); [chapter 18, section 2](18-testing-and-logs.md#2-launching-and-activating-a-mod).

### sp_mission
Where: console, main menu only.
Type: command.
Values: `<folder>:<mission>`.
Does: Starts a single-player mission.
Limits: Only in newer 64-bit builds: neither the retail game nor every installed 64-bit build has it, so type it once and see whether the console knows it. It does not work in multiplayer.
Example:
```
sp_mission 01_usa-skirmish/00b_usa-hurtgen:0
```
See: [chapter 18, section 2](18-testing-and-logs.md#2-launching-and-activating-a-mod); [Reference 11, section 1](r11-mission-files.md#1-the-mission-file-at-a-glance).

## 10. Console variables

You read a console variable by typing its name and set it by typing its name and a value. Not every variable exists in every build of the game, so read a variable before you rely on it. Changing a variable that reaches the simulation in a multiplayer match can desync the game.

### g_maximumRicochets
Where: console variable.
Type: number.
Values: default 2.
Does: The most times one shell may ricochet before it stops.
Limits: None known.
Example:
```
g_maximumRicochets 3
```
See: [R07](r07-armour-volumes-damage.md); [chapter 9](09-weapons-ammo-damage.md); Part I [Change armour and see the result](p05-change-armour.md).

### g_bulletOvermatchMin
Where: console variable.
Type: number.
Values: default 0.2.
Does: The lower clamp of the overmatch factor in the armour calculation. `g_bulletOvermatchMax` (default 1.0) is the upper clamp.
Limits: None known.
Example:
```
g_bulletOvermatchMin
```
See: [g_bulletSlopeMax](#g_bulletslopemax); [R07](r07-armour-volumes-damage.md); Part I [Change armour and see the result](p05-change-armour.md).

### g_bulletSlopeMax
Where: console variable.
Type: number.
Values: default 10.
Does: The largest factor by which a slope can thicken armour against a shot.
Limits: None known.
Example:
```
g_bulletSlopeMax
```
See: [g_bulletOvermatchMin](#g_bulletovermatchmin); [R07](r07-armour-volumes-damage.md); Part I [Change armour and see the result](p05-change-armour.md).

### g_minAccStrength
Where: console variable.
Type: number.
Values: default 0.5.
Does: The smallest share of armour thickness a piercing hit counts for when damage is worked out.
Limits: None known.
Example:
```
g_minAccStrength
```
<!-- goh: GHDMG-41 -->
Gates of Hell: absent. Armour does not wear down from hits there.
See: [R07](r07-armour-volumes-damage.md); Part I [Change armour and see the result](p05-change-armour.md).

### g_bulletMissDistance
Where: console variable.
Type: number.
Values: default 250.
Does: A bullet miss distance setting (unconfirmed what it measures).
Limits: None known.
Example:
```
g_bulletMissDistance
```
See: [R06](r06-weapons-and-ammunition.md); Part I [Change a gun or its ammunition](p04-change-a-gun.md).

### g_damageReportTime
Where: console variable.
Type: number (seconds).
Values: default 5.
Does: How long an on-screen damage report stays up.
Limits: None known.
Example:
```
g_damageReportTime 8
```
<!-- goh: GHMIS-08 -->
Gates of Hell: it sets only the floating damage text. The alert line has its own variable, `g_alertDisplayTime` (default 5).
See: [R07](r07-armour-volumes-damage.md).

### g_damageSpeed
Where: console variable.
Type: number (metres per second).
Values: default 15.
Does: The speed a blast wave travels at; each part is hit after its distance divided by this speed.
Limits: None known.
Example:
```
g_damageSpeed
```
See: [dbg_blast](#dbg_blast); [R07](r07-armour-volumes-damage.md).

### g_enablePlaceEnteringInMP
Where: console variable.
Type: number (switch).
Values: default 1; `g_enablePlaceEnteringInSP` defaults to 0.
Does: Whether units may enter places (such as buildings) in multiplayer, and in single player for the second variable (unconfirmed what "place" covers).
Limits: None known.
Example:
```
g_enablePlaceEnteringInMP
```
See: [chapter 10](10-ai-and-bots.md); [chapter 12, section 9](12-missions-and-multiplayer-setup.md#9-the-console-and-registry).

### g_maxRecruitCount
Where: console variable.
Type: number.
Values: default 10.
Does: A recruit count limit (unconfirmed what it limits).
Limits: None known.
Example:
```
g_maxRecruitCount
```
See: [chapter 10](10-ai-and-bots.md).

### mp_maxPlayers
Where: console variable.
Type: number.
Values: default 16.
Does: The upper bound for player counts in game cards and `map.info`.
Limits: None known.
Example:
```
mp_maxPlayers
```
See: [Reference 11, `maxPlayers`](r11-mission-files.md#maxplayers); [mp_maxSpectators](#mp_maxspectators); [chapter 13, section 8](13-maps.md#8-getting-into-the-lobby).

### mp_maxSpectators
Where: console variable.
Type: number.
Values: default 2.
Does: The most spectators in a lobby.
Limits: None known.
Example:
```
mp_maxSpectators
```
See: [mp_maxPlayers](#mp_maxplayers).

### mp_syncPeriod
Where: console variable.
Type: number (milliseconds of game time).
Values: default 1000; 0 turns the check off.
Does: How often the machines compare their game state to detect a desync.
Limits: None known.
Example:
```
mp_syncPeriod
```
<!-- goh: GHNET-98 GHCMD-15 -->
Gates of Hell: default 0, so the state check is off.
See: [mp_syncLevel](#mp_synclevel); [Reference 11, section 16](r11-mission-files.md#16-what-must-match-between-players); [chapter 12, section 10](12-missions-and-multiplayer-setup.md#sync-checks); [chapter 18, section 7](18-testing-and-logs.md#out-of-sync-dumps).

### mp_syncLevel
Where: console variable.
Type: number.
Values: default 1.
Does: How detailed the desync check is.
Limits: None known.
Example:
```
mp_syncLevel
```
<!-- goh: GHNET-98 GHNET-88 -->
Gates of Hell: default 0. At level 1 positions are not compared there; only levels 0 and 2 or more compare them.
See: [mp_syncPeriod](#mp_syncperiod); [chapter 12, section 10](12-missions-and-multiplayer-setup.md#sync-checks).

### mp_allowDesync
Where: console variable.
Type: number (switch).
Values: 0 or 1.
Does: On the host, lets a player join even when their files do not match.
Limits: The game reads it when the host picks the map, so set it before that. It only affects joining and does not stop a desync during the match. A new player cannot join a game in progress; on the 64-bit build a player who left a running game can come back to their own slot.
Example:
```
mp_allowDesync 1
```
See: [Reference 11, section 16](r11-mission-files.md#16-what-must-match-between-players); [mp_syncPeriod](#mp_syncperiod); [chapter 12, section 10](12-missions-and-multiplayer-setup.md#the-data-checksum).

### mp_mapPointZones
Where: console variable.
Type: switch.
Values: default true.
Does: Draws the capture zone circles of flags.
Limits: The circles are drawn only before the mission starts.
Example:
```
mp_mapPointZones
```
See: [Reference 11, `zoneA`](r11-mission-files.md#zonea); [chapter 13, section 6](13-maps.md#6-map-points-spawns-and-flags).

### dev_luaPrintTarget
Where: console variable.
Type: setting.
Values: by default the debugger and the log file.
Does: Where Lua `print` output goes.
Limits: None known.
Example:
```
dev_luaPrintTarget
```
See: [print](#print).

### dev_disableModVersionControl
Where: console variable.
Type: switch.
Values: default 0.
Does: With 1, the game treats every mod as made for this game version, so a mod whose `MinGameVersion` and `MaxGameVersion` would refuse it can still be activated.
Limits: It lifts only the version test; the test for required mods stays.
Example:
```
dev_disableModVersionControl 1
```
See: [Reference 1, `MinGameVersion`](r01-mod-info-and-folder.md#mingameversion); [chapter 18, section 2](18-testing-and-logs.md#2-launching-and-activating-a-mod); Part I [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md).

### dbg_blast
Where: console variable.
Type: number (switch).
Values: 0 or 1.
Does: With 1, writes a line to `game.log` for each blast hit, in the form `BLAST[energy/inner-outer]: entity/volume (E) thickness remaining`.
Limits: None known.
Example:
```
dbg_blast 1
```
See: [dbg_piercing](#dbg_piercing); [g_damageSpeed](#g_damagespeed); [R07](r07-armour-volumes-damage.md); Part I [Change armour and see the result](p05-change-armour.md).

### dbg_piercing
Where: console variable.
Type: number (switch).
Values: 0 or 1.
Does: Turns on piercing debug output.
Limits: On the 64-bit build its lines do not reach `game.log`; use `dbg_blast` to see damage events there.
Example:
```
dbg_piercing 1
```
See: [dbg_blast](#dbg_blast).

### dbg_health
Where: console variable.
Type: number (switch).
Values: 0 or 1.
Does: With 1, prints health changes of infantry.
Limits: None known.
Example:
```
dbg_health 1
```
<!-- goh: GHDMG-50 GHLOG-37 -->
Gates of Hell: there is also `dbg_damage`, which prints each hit on a vehicle part as `hp = <before> -> <after>`.
See: [dbg_blast](#dbg_blast).

### dbg_interactionEvent
Where: console variable.
Type: number (switch).
Values: 0 or 1.
Does: With 1, prints `EVENT: <name>` for each interaction event of the selected entity. `dbg_interactionEventInfo 1` also prints the command run.
Limits: None known.
Example:
```
dbg_interactionEvent 1
```
<!-- goh: GHLOG-31 -->
Gates of Hell: `dbg_interactionEventInfo` also prints `Volume side: <n>`.
See: [Reference 10](r10-interaction-scripts.md); [chapter 18, section 5](18-testing-and-logs.md#5-the-structure-of-gamelog).

### dbg_pathSearchLimit
Where: console variable.
Type: number (metres).
Values: default 60.
Does: In multiplayer, a move order farther than this is planned in steps: the unit heads for a point this far along the line and plans again when it gets there.
Limits: None known.
Example:
```
dbg_pathSearchLimit
```
<!-- goh: GHMOV-11 -->
Gates of Hell: in a competitive game a detour around an obstacle is no longer cut off at this distance.
See: [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset); [chapter 12, section 10](12-missions-and-multiplayer-setup.md#rules-for-staying-in-sync).

## 11. Launch switches

You add switches to the game's command line, for example in Steam's launch options. Every `-name [values]` becomes a setting the game can look up; every `+name` is passed to Steam, such as `+connect_lobby`. Only the names below do anything; any other name is ignored.

### -console
Where: game command line.
Type: switch.
Values: none.
Does: Enables the console in the 64-bit build.
Limits: Whether the retail 3.262 game opens a console with this switch is not known (unconfirmed).
Example:
```
<game exe> -console
```
See: [section 8](#8-reaching-the-console); [chapter 18, section 2](18-testing-and-logs.md#2-launching-and-activating-a-mod).

### -control
Where: game command line, 64-bit build.
Type: switch.
Values: none.
Does: Opens a control pipe that takes console commands from another program, one JSON line per command.
Limits: None known.
Example:
```
<game exe> -control -nosound -console
```
See: [section 9](#9-console-commands); [mod_list](#mod_list); [chapter 18, section 4](18-testing-and-logs.md#4-the-lan-test-bed).

### -nosound
Where: game command line.
Type: switch.
Values: none.
Does: Starts the game without sound.
Limits: None known.
Example:
```
<game exe> -nosound
```
See: [-control](#-control).

### -instance
Where: game command line, 64-bit build.
Type: switch with a number.
Values: 1 to 9.
Does: Runs a separate copy of the game with its own user folder; its game port is moved up by 10 times the number, and its mod list starts empty.
Limits: None known.
Example:
```
<game exe> -instance 1
```
See: [chapter 18, section 4](18-testing-and-logs.md#4-the-lan-test-bed); [chapter 12, section 10](12-missions-and-multiplayer-setup.md#testing-with-two-players); [-edit](#-edit).

### -edit
Where: editor command line.
Type: switch with a map id.
Values: `multi/<map>:<mode>`.
Does: Opens the editor on that map and mode.
Limits: None known.
Example:
```
<editor exe> -edit multi/2v2_farmstead:combat -instance 1
```
See: [chapter 13, section 9](13-maps.md#9-making-your-own-map); [mp_host](#mp_host); Part I [Copy and change a map](p09-copy-and-change-a-map.md).

### -safe
Where: game command line.
Type: switch.
Values: none.
Does: Starts the game in a safe mode (unconfirmed what it turns off).
Limits: None known.
Example:
```
<game exe> -safe
```
See: [-no_mods](#-no_mods).

### -no_mods
Where: game command line.
Type: switch.
Values: none.
Does: Starts the game without mods (unconfirmed).
Limits: None known.
Example:
```
<game exe> -no_mods
```
See: [-safe](#-safe); [chapter 18, section 8](18-testing-and-logs.md#8-triage-checklist-and-bisecting).

### -reset_options
Where: game command line.
Type: switch.
Values: none.
Does: Resets the player's options (unconfirmed). `-reset_keys`, `-reset_settings` and `-reset_cloud_profiles` are the matching switches for key bindings, settings and cloud profiles.
Limits: Options and key bindings live in `profiles/<id>/options.set` and `profiles/<id>/keys.set`; a reset replaces your own choices.
Example:
```
<game exe> -reset_options
```
<!-- goh: GHNET-47 -->
Gates of Hell: `-reset_cloud_profiles` deletes the cloud profile files but leaves their `.crc` files behind, and these still take cloud space.
See: [chapter 18, section 2](18-testing-and-logs.md#2-launching-and-activating-a-mod).

### -replay
Where: game command line.
Type: switch with a file.
Values: a replay file.
Does: Plays a recorded match (unconfirmed). `-record`, `-replay_loop` and `-replay_outgame` are related switches.
Limits: Commands typed during a replay are ignored.
Example:
```
<game exe> -replay <replay file>
```
See: [chapter 18, section 4](18-testing-and-logs.md#screenshots-and-records).

## Not described yet

These names exist in the game, but what they do and which values they take is not described here yet.

- Console commands: `g_component`, `g_mineP`, `g_mineT`, `g_defuse`, `ed_separateGrass`, the `r_*` render dumps, `mp_back`, `mp_chat`, `mp_join`, `mp_kick`, `mp_lan`, `mp_result`, `mp_settings`, `mp_state`, `mp_stateEvents`, `mp_status`, `mp_steam`, `mp_team`, `mod_set`, `mod_on`, `mod_off`, `pipe_events`.
- Console variables: `mp_testing`, `mp_fogReplay`, `ui_showArmorBar`, `ui_showHealthBar`.
- Launch switches: `-no_cloud`, `-join`, `-enum`, `-no_chat`, `-no_preload`, `-no_reload_caching`, `-adapter`, `-dx`, `-dxdebug`, `-advanced_crashdump`, `-rebuildshadercache`, `-record_dq`, `-new_ui_sample`, `-game`, `-level`, `-mission_options`, `-sdlmod`.

## Gates of Hell only
<!-- goh: GHMIS-50 GHMIS-52 GHMIS-56 GHMIS-57 GHMIS-58 GHMIS-59 GHMIS-60 GHMIS-61 GHMIS-62 GHMIS-63 GHMIS-65 GHMIS-126 GHMIS-127 GHCQ-41 GHAI-63 GHAI-64 GHAI-65 GHCMD-07 GHMIS-07 GHMIS-08 GHMIS-13 GHMIS-67 GHMIS-106 GHNET-103 GHMIS-107 GHNET-33 GHMIS-119 GHMIS-120 GHMIS-121 GHMIS-122 GHLOG-38 GHUI-27 GHNET-38 GHDMG-50 GHVFS-13 GHUI-242 GHVFS-01 GHNET-42 GHAI-67 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

These bot functions, console names and launch switches exist only in Gates of Hell. In this game a bot script that uses one of the Lua names gets nil and fails, and the console does not know the other names. In a Steam match of Gates of Hell the bots run in the separate server process; on LAN, and with `-no_server`, they run on the host as they do here. [Chapter 10](10-ai-and-bots.md#gates-of-hell-summary) and [chapter 12](12-missions-and-multiplayer-setup.md) compare the two games, and Part I [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md) covers moving work between them.

### PrepTimeOver
Where: event for `BotApi.Events:Subscribe`.    Type: event (number 3).
Values: called with a table of arguments.
Does: Raised when the preparation time of the match runs out.
Limits: None known.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.PrepTimeOver, function(args) print("go") end)
```
See: [Subscribe](#subscribe); [GameStart](#gamestart).

### WinnerDecided
Where: event.    Type: event (number 4).
Values: called with `{winner = <team name>}`.
Does: Raised when the winner of the match is known.
Limits: None known.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.WinnerDecided, function(args) print(args.winner) end)
```
See: [GameEnd](#gameend).

### Waypoint
Where: event.    Type: event (number 9).
Values: called with `{squadId = n}`.
Does: Raised when one of the bot's squads reaches a waypoint.
Limits: None known.
Example:
```lua
BotApi.Events:Subscribe(BotApi.Events.Waypoint, function(args) PickNextWaypoint(args.squadId) end)
```
See: [Waypoints](#waypoints).

### SpawnAt
Where: `BotApi.Commands:SpawnAt(unit, split, index)`.    Type: Lua function, returns true or false.
Values: `unit` and `split` as for `Spawn`; `index` picks one of the map points of the bot's team, starting again from the first when it is larger than the number of points; -1 means the bot's own point.
Does: Buys one unit at that map point.
Limits: Returns false when the team has no map points. An unknown unit name crashes the game.
Example:
```lua
BotApi.Commands:SpawnAt(entry.unit, MaxSquadSize, 2)
```
See: [Spawn](#spawn); [IsUnitAvailable](#isunitavailable).

### CanSpawn
Where: `BotApi.Commands:CanSpawn()`.    Type: Lua function, returns true or false.
Values: none.
Does: False while the bot's own purchase is still pending; otherwise true when the match runs, the countdown is over and the side may spawn.
Limits: None known.
Example:
```lua
if BotApi.Commands:CanSpawn() then BuyNext() end
```
See: [Spawn](#spawn).

### IsUnitAvailable
Where: `BotApi.Commands:IsUnitAvailable(unit)`.    Type: Lua function, returns true or false.
Values: a unit card name.
Does: True when the card exists, its doctrine is empty or the player's own, its cooldown is over, it is not hidden, it is for sale, it is researched and the side is under its unit limit. A card that does not exist logs `DBG: Spawning Unit Not found - <unit>`.
Limits: None known. Call it before `Spawn`, `SpawnAt` and `TimeToSpawnUnit`, which crash on an unknown name.
Example:
```lua
if BotApi.Commands:IsUnitAvailable(entry.unit) then BotApi.Commands:Spawn(entry.unit, MaxSquadSize) end
```
See: [Spawn](#spawn); [unit](#unit).

### TimeToSpawnUnit
Where: `BotApi.Commands:TimeToSpawnUnit(unit)`.    Type: Lua function, returns a number.
Values: a unit card name.
Does: Returns the milliseconds until the bot can buy that unit: the larger of the cooldown left and the time its income needs to pay the price.
Limits: An unknown unit name crashes the game.
Example:
```lua
local wait = BotApi.Commands:TimeToSpawnUnit(entry.unit)
```
See: [IsUnitAvailable](#isunitavailable); [Income](#income).

### GameOver
Where: `BotApi.Commands:GameOver(winner)`.    Type: Lua function.
Values: a side number, a team name, or nil for no winner.
Does: Ends the match with that winner.
Limits: A side or team that does not exist logs a `DBG: GameOver()` line and does nothing.
Example:
```lua
BotApi.Commands:GameOver(BotApi.Instance.team)
```
See: [mp_game_over](#mp_game_over).

### SeekAndDestroy
Where: `BotApi.Commands:SeekAndDestroy(squadId)`.    Type: Lua function.
Values: a squad id.
Does: Sends the squad's leader, or each member not in a vehicle, to a random enemy within 50 metres. It is the first attack order a bot has.
Limits: With no enemy in range nothing happens.
Example:
```lua
BotApi.Commands:SeekAndDestroy(squadId)
```
See: [CaptureFlag](#captureflag).

### QueryScene
Where: `BotApi.Scene:QueryScene(tags, seconds)`.    Type: Lua function, returns a table.
Values: a list of tags and a time in seconds.
Does: Counts, for every side, the living men that are not bleeding and the vehicles that still have a body and seats, by the first tag in your list that each one carries. Returns `{{side, {counts}}, ...}`.
Limits: The counts are shared by all bots and are counted again only after `seconds`.
Example:
```lua
local counts = BotApi.Scene:QueryScene({"soldier", "crew", "soldier_bazooka"}, 5)
```
See: [EnemyHasTanks](#enemyhastanks).

### Waypoints
Where: `BotApi.Scene.Waypoints`.    Type: Lua table.
Values: names of the active waypoint map points.
Does: Lists the waypoints a bot can send squads to.
Limits: None known.
Example:
```lua
for _, name in pairs(BotApi.Scene.Waypoints) do print(name) end
```
See: [Waypoint](#waypoint).

### Vars
Where: `BotApi.Scene.Vars`, `BotApi.Scene:GetVar(name)`, `BotApi.Scene:SetVar(name, value)`.    Type: Lua table and functions.
Values: the mission's whole-number variables, by name.
Does: Lets a bot and the mission talk through mission variables. `GetVar` returns 0 for a missing name; `SetVar` creates a missing variable.
Limits: None known.
Example:
```lua
BotApi.Scene:SetVar("bot_wave", 2)
```
See: [Reference 11, `vars`](r11-mission-files.md#vars).

### IsSquadTagged
Where: `BotApi.Scene:IsSquadTagged(squadId, tag)`.    Type: Lua function, returns true or false.
Values: a squad id and a tag.
Does: True when any member of the squad carries the tag.
Limits: None known.
Example:
```lua
if BotApi.Scene:IsSquadTagged(squadId, "tank") then ... end
```
See: [Squads](#squads).

### module_exists
Where: any bot Lua file.    Type: Lua function, returns true or false.
Values: a path, as for `require`.
Does: True when that `.lua` file exists in the game's file system.
Limits: None known.
Example:
```lua
if module_exists([[/script/multiplayer/mybot.extra]]) then require([[/script/multiplayer/mybot.extra]]) end
```
See: [require](#require).

### BotApi.Conquest
Where: `BotApi.Conquest`.    Type: Lua table.
Values: `DefenderBotId`, `FirstPlayerId`, `FirstEnemyId`, `SwappedSides`, `Attacking`, `Risk`, `LootingPhase`, `OperationDay`, `RiskBotResources`, `RiskBotVeterancy`, `MapRewards`, `ArmyResources`, `ArmyScore`, `ArmyCP`, `ArmyCPLimit`, `ArmySquads`, `PlayerSpawnPoint`.
Does: Gives a bot the state of a Conquest campaign.
Limits: None known.
Example:
```lua
local day = BotApi.Conquest.OperationDay
```
See: [section 2](#2-botapiinstance).

### FlagCaptureArea
Where: bot Lua, global table.    Type: Lua table.
Values: a radius in metres for each kind of unit: `Helicopter`, `Artillery`, `Captor`, `Mortar`, `ATgun`, `Vehicle`, `Infantry`.
Does: Sets how close to a flag's centre `CaptureFlag` sends each kind of unit.
Limits: Without it every radius is 0 and the log reads `DBG: FlagCaptureArea is not found`. A bot script from this game needs to define it there.
Example:
```lua
FlagCaptureArea = {Helicopter = 3, Artillery = 175, Mortar = 100, ATgun = 50, Captor = 100, Vehicle = 18, Infantry = 25}
```
See: [CaptureFlag](#captureflag).

### dev_enableBotAi
Where: console variable.    Type: switch.
Values: default 1.
Does: With 0, bots of the next match start without loading the bot script, so they neither buy nor move.
Limits: None known.
Example:
```
dev_enableBotAi 0
```
See: [section 1](#1-how-the-bot-script-runs).

### g_alertDisplayTime
Where: console variable.    Type: number (seconds).
Values: default 5.
Does: How long the alert line stays up.
Limits: None known.
Example:
```
g_alertDisplayTime 8
```
See: [g_damageReportTime](#g_damagereporttime); [g_alert](#g_alert).

### mp_session_autoready
Where: console variable.    Type: switch.
Values: default off.
Does: A player who takes a seat in the lobby is ready at once and gets the default doctrine.
Limits: None known.
Example:
```
mp_session_autoready 1
```
See: [mp_ready](#mp_ready).

### mp_rndSeed
Where: console variable.    Type: number.
Values: default 0.
Does: Any other value fixes the match's random seed, so a test match can be repeated. With 0 the seed is random.
Limits: None known.
Example:
```
mp_rndSeed 1234
```
See: [mp_host](#mp_host).

### ui_startPage
Where: console variable.    Type: text.
Values: a page name, `none` for no page, empty by default.
Does: Opens that page at start instead of the main menu. It takes the place of the `-new_ui_sample` switch.
Limits: None known.
Example:
```
ui_startPage none
```
See: [ui_page_reload](#ui_page_reload).

### g_enableLobbyPings
Where: console variable.    Type: switch.
Values: default off.
Does: Shows the ping column in the game browser and runs the lobby ping service.
Limits: None known.
Example:
```
g_enableLobbyPings 1
```
See: [mp_maps](#mp_maps).

### dbg_damage
Where: console variable.    Type: switch.
Values: default off.
Does: Prints each hit on a vehicle part as `hp = <before> -> <after>`.
Limits: None known.
Example:
```
dbg_damage 1
```
See: [dbg_health](#dbg_health); [dbg_blast](#dbg_blast).

### mp_game_set_victory
Where: console, during a multiplayer match.    Type: command.
Values: a host id and a value.
Does: Adds victory points to that player. `mp_game_set_personal_score` does the same for the personal score. An unknown host id is reported.
Limits: None known.
Example:
```
mp_game_set_victory 2 100
```
See: [mp_game_set_score](#mp_game_set_score).

### mp_game_list_players
Where: console, during a multiplayer match.    Type: command.
Values: none.
Does: Lists the players as `Player hostId:<n> sceneId:<s> [name]`, with `*` after your own.
Limits: The list includes profile names; do not paste it into public notes.
Example:
```
mp_game_list_players
```
See: [mp_userUnits](#mp_userunits).

### mp_checkCombat
Where: console, multiplayer.    Type: command.
Values: none.
Does: Checks a map for the `combat` mode: first the spawn points, then the same checks as `mp_checkCompetitive`.
Limits: None known.
Example:
```
mp_checkCombat
```
See: [mp_checkCompetitive](#mp_checkcompetitive).

### tut_clear_all
Where: console.    Type: command.
Values: none.
Does: Forgets every tutorial hint already shown, so they show again.
Limits: None known.
Example:
```
tut_clear_all
```
See: [ui_page_reload](#ui_page_reload).

### dbg_benchmark
Where: console.    Type: command.
Values: `start` or `stop`, with optional `profile "<name>"`, `camera "<name>"` and `start_camera`.
Does: Measures frame rate. Profiles are in `/set/benchmark.set`; results go to a folder `benchmark/<date-time>/`, probably in the user folder (not confirmed).
Limits: None known.
Example:
```
dbg_benchmark start
```
See: [s_time](#s_time).

### snd_restart
Where: console.    Type: command.
Values: none.
Does: Restarts the sound system and loads the sounds again.
Limits: None known.
Example:
```
snd_restart
```
See: [-nosound](#-nosound).

### dev_l10n_export_pot
Where: console.    Type: command.
Values: a folder, probably optional (not confirmed).
Does: Writes `.pot` files made from the `.lng` texts under `localizations/exported/`. `dev_l10n_reload` reads the texts again.
Limits: None known.
Example:
```
dev_l10n_export_pot
```
See: Part I [Add or change text and translate it](p07-text-and-translation.md).

### s_time
Where: console.    Type: command.
Values: none.
Does: Prints how long the game has been running.
Limits: None known.
Example:
```
s_time
```
See: [s_version](#s_version).

### g_alert
Where: console.    Type: command.
Values: a message.
Does: Shows the message on the alert line for `g_alertDisplayTime` seconds.
Limits: None known.
Example:
```
g_alert test
```
See: [g_alertDisplayTime](#g_alertdisplaytime).

### logs_flush
Where: console.    Type: command.
Values: none.
Does: Writes the logs to disk now.
Limits: Not offered by the dedicated server.
Example:
```
logs_flush
```
See: [chapter 18, section 5](18-testing-and-logs.md#5-the-structure-of-gamelog).

### ui_armorDisplay
Where: console of the editor.    Type: command.
Values: `true` or `false`.
Does: Turns the armour display on or off. It is a command there, not a variable, so the form `ui_armorDisplay = 1` fails.
Limits: None known.
Example:
```
ui_armorDisplay true
```
See: [section 10](#10-console-variables).

### -useLocalDataFolder
Where: game command line.    Type: switch.
Values: none; any case.
Does: Keeps the user folder under the local application data folder instead of Documents. The game also does this when the Documents path lies in OneDrive. The log names the folder in `IO: Game config directory:`.
Limits: None known.
Example:
```
<game exe> -useLocalDataFolder
```
See: [-instance](#-instance).

### -no_chat
Where: game command line.    Type: switch.
Values: none.
Does: Starts without the global chat service. Turning global chat off in the game's options does the same.
Limits: None known.
Example:
```
<game exe> -no_chat
```
See: [section 11](#11-launch-switches).

### -showmodinfo
Where: game command line.    Type: switch.
Values: none.
Does: The mod list shows more per mod: `[STEAM:<id>]` or `[LOCAL]`, a `*` for mods with synced files, and the mod's folder.
Limits: None known.
Example:
```
<game exe> -showmodinfo
```
See: [Reference 1](r01-mod-info-and-folder.md#gates-of-hell-only).

### -no_server
Where: game command line.    Type: switch.
Values: none.
Does: Plays multiplayer without the separate server process, the way this game plays: every machine runs the simulation and the bots run on the host.
Limits: None known.
Example:
```
<game exe> -no_server
```
See: [chapter 12, section 10](12-missions-and-multiplayer-setup.md#10-how-multiplayer-stays-in-sync).

### Not in Gates of Hell

The console variables `mp_deviceReplay`, `mp_slowdown`, `tcp_hostPortDS` and `g_maxAltitude` are gone there; a console script that sets them gets "not found". `EnemyHasTanks` and `g_minAccStrength` are gone as well (see their entries above).
