# Bots: what they buy and how they play

Bots are the computer players in multiplayer and skirmish games. A bot does two things itself: it chooses what to buy, and it sends squads towards flags. The fighting is done by the units themselves. This page shows how to make bots buy your units, change their difficulty, and apply a ready-made way of playing.

## You need

- A mod folder, picked on the Mods page.
- The game folder known to ARSENAL: the stock bot files are read from it.
- Units with a buy card (the entry players buy them from).

## The quick way

In the [Quick Guided Task](p17-quick-guided-task.md) row above the tabs, set "I want to" to **change** and choose **what bots buy and how they play**. The task asks, group by group, for a unit the bots of one army buy first, the bot difficulty for every army, the lobby money for every army (players and bots), and how the bots of every army fight (a persona from Bot Doctrine). It writes the same files as the steps below after a review, then checks. It works under the 64-bit build only.

## Steps

1. **See what bots buy now.**
   In the window: on the Bots page (Game Modes & AI > Bots), "What bots buy" shows the shopping list for the chosen "Army", stage by stage. Stage 1 is the bot's first order; later stages add heavier units. The page also lists "Units of your mod that no bot buys yet".
   On the command line: `ARSENAL botrecipe <mod folder> --check --game <game folder>` compares your bot list with the stock one and checks that every listed unit has a buy card.

2. **Make bots buy a unit.**
   In the window: in "Make bots buy a unit", type the "Unit name" (the name on its buy card), and pick the "Army", the "Stage" (1 to 8, or "automatic") and the "Kind of unit". Tick "Buy it first" for priority 1000, picked almost every time, or set a lower priority. "Make it cheap and quick to unlock" is for testing only. If your mod has no buy card for the unit, name a unit whose card should be copied. Press "Preview", then "Write into my mod". This writes a copy of `script/multiplayer/bot.data.lua` into your mod with one new line.
   On the command line:
   ```
   ARSENAL botrecipe <mod folder> --out <mod folder> --buy-first <unit> --army <army> --stage 3 --class Tank --priority 1000.0 --game <game folder> --dry-run
   ```
   `--class` takes `Infantry`, `ATInfantry`, `Vehicle`, `Tank`, `AATank`, `ATTank`, `HeavyTank` or `ArtilleryTank`. `--card-like <unit>` copies a buy card. Remove `--dry-run` to write.

3. **Change how rich each difficulty is.**
   In the window: in "Bot difficulty", each of "Easy", "Normal", "Hard" and "Heroic" has "Army size x", "Income x" and "Payback x". 1.00 is normal; higher is richer. Change a number, press "Preview changes", then "Write into my mod". The values live in `set/multiplayer/games/bots_generic.inc`. "Settings shared by a whole game mode" changes, the same way, "Seconds to grow from start to top", "Army size multiplier", "Income multiplier" and the payback table of a mode; "Back to stock (remove my copy)" removes your copy. If a written change does not show in the game, press "My change is not showing".
   On the command line: `ARSENAL patch-entity <mod folder> --game <game folder> --file set/multiplayer/games/bots_generic.inc --set <path>=<value> --dry-run`.

4. **Apply a way of playing (a persona).**
   In the window: open the Bot Doctrine page (Game Modes & AI > Bots > Bot Doctrine), or press "Apply a persona (Bot Doctrine)" on the Bots page. Its own tabs are "Rules", "Personas", "Scenarios", "Profile", "Generate" and "Check". Choose a persona on the "Personas" tab. On "Profile" press "Detect from my mod". On "Generate" set "Strength" (1 is the persona as written, 0 no change, up to 2), optionally a "Base bot file (optional)" to start from, press "Preview", then "Write into my mod"; "Check now" then opens the Check page. On "Check" press "Check my mod". The universal persona puts the original numbers back. The numbers are starting guesses not yet tried in a match (unconfirmed).
   On the command line:
   ```
   ARSENAL doctrine list personas
   ARSENAL doctrine gen --persona <id> --out <mod folder> --game <game folder> --plan
   ARSENAL doctrine check <mod folder> --game <game folder>
   ```
   Remove `--plan` to write.

5. **Let bots join a LAN lobby.**
   The stock game cards have no bot switch. In the window: tick "Allow bots" on the Maps page when you copy a map. By hand: put `{enableBots 1}` inside the `{settings}` block (not `{options}`) of your mod's copy of a game card, such as `set/multiplayer/games/combat.set`. The lobby command `mp_slot 2 normal` then puts a normal bot in slot 2.

6. **Watch them and read the log.**
   Play a game with bots and your mod on. Bot scripts write `print` lines to `game.log` with a `[LUA]` prefix; `ARSENAL logtriage <log folder> --lua` prints only those.

## What can go wrong

- **A new unit never shows up in bot games.** Bots buy only what is on their list. The unit also needs a buy card, and the bot must be able to pay.
- **An army missing from a stage buys nothing at that stage.** List every army in every stage.
- **A typo in a unit name is silent.** The bot's buy call reports success for a name that does not exist or is not for sale. Use the exact card name: squad cards are written `name(army)`, such as `bazookers(ger)`; vehicle cards are plain names, such as `achilles`; single soldier cards carry a path, such as `mp/eng/bazooker`.
- **Your own `bot.lua` makes the bot buy nothing.** The first handler subscribed for an event wins. Load the stock script first, then add your handlers.
- **A Lua error no longer stops the game.** The bot goes idle and the log says `Lua call failed`.
- **Bot scripts run on the host only.**
- **Bots cannot be ordered to attack, retreat or board.** Better fighting comes from unit data.
- **The stock bot reads only three settings** from its data file: squad size, how often orders change, and which flags to go for. `AttackBaseTime` and the per-entry `period` are not read. A persona changes more only with a larger replacement bot script in the same mod set.
- **Your copy of `bot.data.lua` replaces the whole file.** If another mod changes it too, the later mod wins.

## In Gates of Hell
<!-- goh: GHMIS-50 GHMIS-52 GHMIS-53 GHMIS-54 GHMIS-55 GHMIS-56 GHMIS-57 GHMIS-58 GHMIS-59 GHMIS-65 GHMIS-66 GHAI-64 GHAI-65 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** shows the Bots page, which changes the multiplayer settings there, but its bot shopping list, the bot match and the Bot Doctrine page are not available, because Gates of Hell has no `bot.data.lua`. Bot difficulty is on the Game Modes page. The bots task of the Quick Guided Task is greyed, and `botrecipe` and `doctrine` work for Assault Squad 2 only. Edit Gates of Hell's bot scripts (`bot.main.lua`, `modes/*.lua`) by hand.
- **Different files.** The bot script is `script/multiplayer/bot.main.lua` with one script per mode in `script/multiplayer/modes/` (battle zones, conquest, frontlines, last stand). What bots buy is in per-army lists `script/multiplayer/units/<army>/` with `early`, `mid`, `late` and `conquest` files (armies `eng`, `fin`, `ger`, `rus`, `usa`). There is no `bot.data.lua`. `bots_generic.inc` sits in `set/multiplayer/games/presets/global_parameters/`.
- **Bot Lua differs.** `EnemyHasTanks` is gone: count tanks with `QueryScene`. `Spawn` with an unknown unit name crashes the game instead of failing: check with `IsUnitAvailable` first. New are `SpawnAt` (spawn at one of the team's points), `CanSpawn`, `TimeToSpawnUnit` and `SeekAndDestroy`, and the events `PrepTimeOver`, `WinnerDecided` and `Waypoint`. `BotApi.Instance` has `gameMode`, `difficulty` and `ownTeamSize` (Assault Squad 2's `teamSize`).
- **Porting a bot script:** hook events by name, not by number; the numbers differ (probably).
- **Where bots run.** Bot scripts run on the game's server side, not on the clients. The console variable `dev_enableBotAi 0` starts the next match with bots that neither buy nor move, which helps when testing.

## More

- Detail: [chapter 10, AI and bots](10-ai-and-bots.md) ([multiplayer bots](10-ai-and-bots.md#8-multiplayer-bots), [bots in the ARSENAL window](10-ai-and-bots.md#bots-in-the-arsenal-window), [Gates of Hell summary](10-ai-and-bots.md#gates-of-hell-summary)), [chapter 17, Balance, pricing and gameplay](17-balance-pricing-gameplay.md), [chapter 12, Missions and multiplayer setup](12-missions-and-multiplayer-setup.md) ([bots](12-missions-and-multiplayer-setup.md#6-bots)). The window: [chapter 19, Quick Guided Task](19-toolchain.md#quick-guided-task).
- Reference: [r12, Bot Lua and console](r12-bot-lua-and-console.md) ([`Spawn`](r12-bot-lua-and-console.md#spawn), [`teamSize`](r12-bot-lua-and-console.md#teamsize), [bot data](r12-bot-lua-and-console.md#6-bot-data-what-bots-buy), [`priority`](r12-bot-lua-and-console.md#priority), [`mp_slot`](r12-bot-lua-and-console.md#mp_slot), [bot difficulty](r12-bot-lua-and-console.md#7-bot-difficulty), [Gates of Hell only](r12-bot-lua-and-console.md#gates-of-hell-only)) and [r11, Mission files](r11-mission-files.md) (game cards and the [`bots`](r11-mission-files.md#bots) block).
- Before: [Missions and multiplayer modes](p10-missions-and-modes.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
