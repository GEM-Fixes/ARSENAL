# 17. Balance, Pricing and Gameplay

The short way: [Change armour and see the result](p05-change-armour.md) gives the steps for reading and changing a vehicle's armour and testing a shell against it. This chapter explains what a number change does in play, where prices and unlock times live, and which tools show a change before you play it. The armour, volume and material keys are in [Reference 7, Armour, volumes and damage](r07-armour-volumes-damage.md).

## What you will learn

- How the main mechanics feel to a player, so that you know what a number change will do.
- A table of common data changes and their effect.
- How multiplayer prices, unlock timers, limits and bots are set up, and where each number lives.
- A balance workflow with the Balance page, the armour simulator and the command-line tables.
- The rules that bite when you tune data.

Some player-side behaviour here comes from the game manual and common play rather than from the game files; those statements carry "(unconfirmed)".

## 1. Mechanics as the player sees them

### Armour and anti-tank

Whether a shell goes through depends on four things: the shell's penetration at that range, the armour thickness, the angle of the hit (a sloped plate counts as thicker), and the distance (penetration falls with range). There is no dice roll in this test. Armour-piercing (AP) shells suit lighter armour, armour-piercing composite rigid (APCR) shells suit heavy armour, and high-explosive (HE) shells suit infantry, guns and buildings. Hits to the side, rear or engine are the most effective. Shell tip colours in the game are green for HE, grey for AP, black for APCR and white for smoke.

A shell that fails may bounce off (ricochet). For steel the chance is 1 for a shell that grazes the plate at up to 15 degrees, 0.6 at 30 degrees, 0.3 at 45, 0.15 at 60 and 0 from 75 degrees, counted from the plate's surface; values in between are interpolated. See [ricochet](r07-armour-volumes-damage.md#ricochet) and [chance](r07-armour-volumes-damage.md#chance).

When the player aims in direct control, the reticle shows the distance on the left and the weapon's penetration at that range on the right. That number is the quickest way to see a data change in the game.

Other behaviours worth knowing:

- Crew roles swap automatically when a vehicle is short of crew; a lone crewman drives, loads and fires one at a time (unconfirmed).
- A crew-less or abandoned vehicle or gun can be captured by sending a soldier in and repairing it. One big HE round can kill a whole crew and leave the vehicle intact and capturable.
- Damaged wheels or tracks stop a vehicle until they are repaired (unconfirmed).
- Anti-tank guns should be set to return fire or have their HE removed, so that they shoot AP at armour.
- Towed guns cannot fire while towed.

### Infantry

Infantry are the backbone. Prone is the strongest posture (a smaller target and more accurate), cover and bushes hide soldiers until they fire, and sandbags stop small arms but not anti-tank grenades or tank shells. Squads share ammunition. Direct control (the `E` key) is the core skill because the AI aims poorly with guns.

Soldiers gain rank from their score, which rises with kills. A multiplayer soldier in vanilla reaches the five ranks at a score of 2, 4, 12, 24 and 40 (4, 8, 24, 48 and 80 outside multiplayer). Only the highest rank reached applies; its bonuses (health, reload, weapon skill and others) are in `set/ability/veterancy.set`.

### Artillery and support weapons

Mortars and howitzers fire indirectly; they are best against fixed positions rather than moving infantry. Howitzers have limited traverse and need turning. Rocket artillery covers areas. Mines use contact fuses; dynamite uses a timer. Heavy ammunition crates resupply artillery; light crates resupply infantry and machine guns (unconfirmed for the exact split).

### Interface signs

Floating icons show squad members as dots coloured by health, a flashing red icon means out of ammunition, and orange or yellow stripes mark anti-tank weapons. In multiplayer, friendly fire is a lobby option and is on by default, so your own losses can add to the enemy's score.

### In Gates of Hell

<!-- goh: GHGPL-04 GHGPL-13 GHGPL-22 GHGPL-23 GHGPL-03 GHDC-47 GHDC-52 GHDC-58 GHGPL-01 GHGPL-02 -->

Several rules a player feels are different, so a balance that works in one game does not carry over as it is.

- Repair needs a repair kit in the hand, for a mechanic too, and uses one kit per part. A vehicle looks for kits in its own stock first, then with allies within 20 m. Damaged parts are repaired too, not only broken ones, and the time follows the health lost.
- A captured vehicle no longer pays its price back to the buyer.
- A squad the player forms can have up to 12 soldiers (Assault Squad 2: 10).
- Under direct control a gun fires only at a target within its range and not inside its `MinRange` (unless the weapon has `UnlimitedRangeTPC`), and a soldier does not fire while crawling, swimming or running.
- Building fortifications costs the squad's resources and its speed follows the `fortification` ability.

See [Chapter 15, Direct control and the third person camera](15-interface-and-icons.md#direct-control-and-the-third-person-camera).

## 2. What a data change does

The damage after a hit is mostly decided by **interaction scripts**, not by the game program (see [Chapter 11: Interaction Scripts](11-interaction-scripts.md)).

| You change | Effect in game |
|---|---|
| A gun's penetration table | Penetration at each distance is interpolated in straight lines between the table points, and the table ends five metres past the gun's range. |
| An armour number in the unit's `armor` macro or area | A non-zero number overrides the volume's own `{thickness}` on that side. The first area that covers a volume wins. Left and right share the area's side number, and the bottom uses the top number. |
| `pierce_dur` in the tank armour macro | It sets `durability {pierce {koef ...}}` for hull and turret. Vanilla passes 999, so AP shells practically never break those areas; only blast does. |
| A shell's `{tag}` | Moves it to another row of the damage scripts (crew kill chances, internal damage, fire, drive and breech breaks). |
| HE carried in a vehicle | Raises the cook-off risk; carrying more than the vehicle class allows multiplies the chance. Keep the total ammunition load the same when you edit a loadout. |
| A material's ricochet table | Changes the chance that a failed shell bounces. In the `angle` table, an `out` larger than `in` logs "Invalid ricochet angle" and is clamped to `in`. |
| A soldier's accuracy-by-motion preset | Raising the penalties forces "stop to shoot". |
| Vision and stealth values | Longer spotting and harder hiding (see [Chapter 16](16-effects-sound-models.md)). |
| Resupply macros | A regeneration of 0 makes ammunition boxes and trucks run out. |

Three more rules:

- **HE blast does not weaken with the distance the shell flew.** Blast energy falls in a straight line from the centre of the explosion to zero at the outer radius, and only volumes that keep the `blast` flag of `able` take any. HE is therefore good against distant guns.
- **Blast damage reaches each volume slightly later**, at about 15 metres per second, so damage is delayed per volume.
- **A new weapon's ammunition needs the right tag**, or the infantry damage scripts fall into their default branch.

An ability level written as a string such as "150%" is just a name that the ability's data file defines. An undefined level string gives the soldier the **top** level, a silent buff, so check the spelling. `ARSENAL statsheet` reports it.

## 3. Multiplayer economy and prices

Multiplayer games are described by **presets** (in `set/multiplayer/games/presets*.inc`). A preset sets the unit set by year tags, the command point (CP) cap, the manpower (MP) at start and at the top, unit limits, the budget growth, payback, the purchase buttons, bots and charge factors. See [Chapter 12](12-missions-and-multiplayer-setup.md) for game modes and [Budgets](r11-mission-files.md#12-budgets) for the budget keys.

Prices are paid from a budget. The vehicle budget pays in MP for the infantry and vehicle buttons; the hero budget pays in special points, with a fixed start and no growth. The two are not on one scale, so never compare a hero price with an MP price.

### Unlock timers and limits

A unit unlocks `charge x chargeFactor x (1 - fore)` seconds after the game starts, where `charge` is the unit's own cooldown, `chargeFactor` is the first tag match in the preset's list (otherwise `*`, otherwise 1), and `fore` is the share of the cooldown already done at the start (1 is ready at once, 0 is one full cooldown, a negative value is longer). After you buy a unit, every unit of its `group` restarts at `charge x chargeFactor`. The lobby test mode sets the charge factors to zero, so everything is available at once.

`unitLimits` counts purchases, so a lost unit is never refunded and limits fill for good. Separators matter: `unitLimits` entries are separated by semicolons, while `payback` lists are separated by tabs. A comma or other wrong separator silently drops the entries after it (the log says "Unread data"). Unknown keys in multiplayer data are skipped too, so a typo gives no error.

### Bots

Vanilla bots ignore unlock timers. A preset can make them obey and can scale payback by difficulty. Bot purchases are described per nation in `script/multiplayer/bot.data.lua` (see [Chapter 10: AI and Bots](10-ai-and-bots.md)).

### Where the price lives

The vanilla buy list is `set/multiplayer/units/common.set`, which includes `soldiers.set`, `squads.set` and `vehicles.set`; `vehicles.set` holds the macros and the nations' `vehicles_<nation>.set` files hold the vehicles.

- **Soldiers:** `soldiers.set` gives each soldier type its `{cp}`, `{score}` and `{cw}` (capture weight), through one define per type, such as `tankman`, used for every side.
- **Squads:** `squads.set` builds each squad card with a macro such as `("squad_with2types" side(rus) name(home_guards) c(30) ... level(1) cost(60) f(-1.0))`, where `c()` is the cooldown, `cost()` the price, `level()` the rank needed and `f()` the fore.
- **Vehicles:** each entry looks like `{"m1_57mm" ("vs" c(0) t(all cannon mediumcan) s(usa) n(2) g(c5) sc(11.25) b(v2) cw(2) cp(10)) {level 1} {cost 225} {fore 1.0}}`: cooldown, tags, side, crew, group, score, button, capture weight and CP, then the rank, the price and the fore.

`score` is the kill score: when a unit dies, the killer's team gets it. In vanilla a vehicle's score is about its cost divided by 20, and the ratio of score to cost decides how profitable a kill is. See [Units](r11-mission-files.md#13-units).

The quick way: the Quick Guided Task "I want to change" then "prices of an army" changes every price of an army, command points, score and money rules in one go, and "what bots buy and how they play" covers bot buying, bot money and cooldowns. See [Use the Quick Guided Task](p17-quick-guided-task.md).

### In Gates of Hell

<!-- goh: GHMIS-80 GHMIS-81 GHMIS-82 GHMIS-83 GHMIS-84 GHMIS-85 GHMIS-86 GHMIS-87 GHMIS-91 GHMIS-92 GHGPL-07 GHGPL-10 GHGPL-11 GHGPL-12 GHGPL-14 -->

The buy card and the preset are read differently, and most keys of one game are silently ignored by the other.

- **No rank lock and no head start.** `level` and `fore` are not read. A unit's cooldown is a block `{charge {delay N} {interval N}}`: the first wait, once at the start of the game, is `delay x chargeFactor x chargeDelay`, and after each purchase the group waits `interval x chargeFactor x charge`, where `chargeDelay` and `charge` come from the preset's balancing. Units of group `none` do not share a cooldown.
- **Squad prices are summed.** A squad costs its own `cost` plus, for each member, count x member cost x `squad_cost_factor`, rounded up to `round_multiple`. The buy button shows that sum. A card's `cost` is 0 when it is left out (Assault Squad 2: 1).
- **Kill score from the price.** A member is worth its own `score` when that is above 0, otherwise its cost x `score_factor` (0.05 by default), then x the preset's `unitScore`.
- **More card keys:** `cost_ap`, `cost_sp`, `enabled` (probably replaced by the game's own content check, so it has no effect; not confirmed), `not_for_player_sale`, `conditions`, `action`, `doctrine` and research stages. A card that is `not_for_player_sale` or whose group is waiting cannot be bought.
- **Preset balancing** (`balancingFactorBonus`) has seven keys: `cp`, `mpStart`, `mpFinish`, `payback`, `periodicFactor`, `chargeDelay` and `charge`. There is no `mp`; the Assault Squad 2 key `mp` is ignored there, and the 64-bit game reads only `cp`, `mp` and `payback`.
- The list of charge factors a player can choose is `customize` (Assault Squad 2: `available`). Bot settings are found by `<difficulty>_<team>` instead of the difficulty alone. A command point table read twice replaces the first one instead of merging.
- New session defaults: a pause during preparation, a first reinforcement wave after 360 s and then one every 120 s.

When you bring a unit over, the Quick Guided Task "a unit from Gates of Hell" ends with an Assault Squad 2 buy card for it, and the fold Translate numbers on the GoH unit page shows how other numbers are translated; see [Chapter 19](19-toolchain.md#units--balance-under-goh) and [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md). Set its price, cooldown and rank on the Assault Squad 2 scale afterwards.

## 4. A balance workflow

### The Balance page

The **Balance page** (Balance) shows every unit of the buy panel as one row, with your mod laid over the game. Columns include the army, class, who pays ("Paid with"), "Price", "Model price" (what units of the same class with the same armour, gun and speed cost), "Rank", "Cooldown s", "Fore", "Wait at start s", "Command pts", armour on four sides, "Top speed", the gun with its calibre, "Pen 100 m" and "Reload s".

- **Filter** with a name or with conditions such as `army=ger cls=tank cost>500 res=mp`.
- View the list as a **Sheet**, in **Groups** (rows and columns with the middle value, average, lowest or highest), as a **Graph** of any two columns, or side by side under **Compare**, including "The mod against the game".
- **Odd ones** lists units that do not fit the pattern: cheap or expensive for what they are, costing more but no better, the same stats at another price, a price that can never be paid, or a unit ready too early.
- **Change** edits the price, rank, cooldown, fore, the wait at start (the page sets fore to give it), top speed, armour (every number of the armour line scaled together) or the main gun's reload, by percent, by adding, by multiplying, by setting, or "to the model price". "Preview" shows each change, then "Write into the mod" writes it into your mod only. A price change is refused when the selection mixes resources.

The command way is `ARSENAL balance <game folder> --folder <mod folder>`, with `--where`, `--group`, `--odd` and `--change "cost pct 10" --plan` to preview.

### The Units page

The **Units page** (Units) is the place for one unit at a time. "Find a unit" shows its numbers with the mod's value next to the game's. "Quick change" changes one unit's price, name, armour part, unlock time, rank or head start: choose what to change, type the "New value", press Preview, then Write. Its "Balance" part has:

- "Compare mod with the game": every unit your mod adds or changes, with the old and new price, rank, unlock time and armour.
- "Change all prices of an army": a percent for every price of one army; 10 makes them 10% more expensive, -20 makes them 20% cheaper, and prices are rounded to 5.
- "Price hint for this unit": what units like this one cost, lowest to highest and the middle, next to its own price.
- "Buy panel checklist": six points to check in the game, from the right army and button group to the price, rank and unlock wait you set, and whether bots buy the unit.

See also: [Change a unit's numbers](p02-change-unit-numbers.md) and [Chapter 19, Units and Balance](19-toolchain.md#units--balance-all-games).

### The armour simulator

The Armor part of the Models page ("Armour: thickness, map and shot test") reads a vehicle's armour as the game would. Its table "Thickness of each part" gives each volume's six sides in millimetres and where each number comes from; you can click a number to change it in your mod. Under "Who shoots", pick a gun, one of its shells and a range: the page says how much flat armour that shell goes through, colours a map of the whole side by what happens, and shows a single shot plate by plate. It follows the game's rules for thickness, slope and penetration; it does not model gun spread, the flight after a ricochet, blast, or what happens behind the plate. See [The armour table on the Models page](r07-armour-volumes-damage.md#the-armour-table-on-the-models-page). The command way:

```
ARSENAL armorsim table <unit>
ARSENAL armorsim shot <unit> --weapon "<gun name>" --ammo "<shell tags>" --range 500 --from 0,0
ARSENAL armorsim edit <unit> --volume turret --side front --mm 60 --out <mod folder> --dry
```

### Step by step

1. **Get a "before" table.** `ARSENAL statsheet <game folder> --mods mymod --sheet weapons,ammo,armor,price -o before.md`, or save the Balance sheet as CSV.
2. **Make a small change** in the Balance page, the armour simulator or your mod's files. For one key in one entity, `ARSENAL patch-entity` writes a single-key override instead of a copy of the whole file; see [Chapter 19](19-toolchain.md).
3. **Get an "after" table** the same way and compare, or use Compare, "The mod against the game", on the Balance page. A before and after table is the clearest way to explain a balance change to other people.
4. **See what you changed against what you cover.** `ARSENAL overdiff mods/mymod --game <game folder> --summary` lists, for each file you replace, which keys you added, removed or changed. A full-file replacement that drops vanilla keys is flagged.
5. **See who wins.** `ARSENAL conflicts --game <game folder> --mods a,mymod` shows each key changed by more than one mod and which one wins (the last in the load order, [Chapter 3](03-mod-folder-and-load-order.md)).
6. **Check multiplayer.** A file edited without changing its size can pass the lobby check and then go out of sync in play. `ARSENAL mpsync` reports which edits the check misses (see [Chapter 21](21-troubleshooting.md)).
7. **Play it** with the loop in [Chapter 18](18-testing-and-logs.md), and compare the MP and CP on the purchase panel with your sheet.

### In Gates of Hell

<!-- goh: GHMIS-84 GHMIS-85 GHMIS-86 GHGPL-10 -->

The armour simulator and the price calculator work on Assault Squad 2 data only. Under the Gates of Hell button the Units and Balance pages read Gates of Hell data, but some of their columns mean something else there: "Rank" and "Fore" are not read, a squad's price is a sum (section 3), and the cooldown has two parts. For a Gates of Hell mod, also compare the buy cards and the preset's balancing by hand.

## 5. Things that bite

- Interaction `{set "x"}` flags are limited to 128 distinct names across the whole game; more stop the game at load with an application error. Use tags instead.
- `{delay}` restarts its timer when it runs again and loses the bullet and volume. `{delay_ex}` keeps the value, position and source but drops the bone, the bullet and the instigator.
- Defines (`(define ...)`) are seen only within the top-level file being read and the files it includes; parameters are plain text substitution with no defaults. A call to a define that is not visible stops the game with "define not found" (see [Chapter 5](05-sdl-language.md)).
- Sound names have no aliases ([Chapter 16](16-effects-sound-models.md)).
- Some actions work only in direct control (the ammunition-drop grenade, the radio signal and the regular flamethrower) (unconfirmed).
- A mod file with the same path as a vanilla file replaces it entirely, so tuning with a copy of a big file hides every vanilla change made to it later. Prefer single-key overrides.

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In short |
|---|---|---|
| 1. Mechanics as the player sees them | [differs](#in-gates-of-hell) | Repair kits, no refund for a captured vehicle, 12-soldier squads, direct control fire rules |
| 2. What a data change does | not mapped here | Armour and damage in Gates of Hell: see [Chapter 9](09-weapons-ammo-damage.md#gates-of-hell-summary) |
| 3. Multiplayer economy and prices | [differs](#in-gates-of-hell-1) | No rank or head start, two-part cooldown, summed squad prices, seven balancing keys |
| 4. A balance workflow | [differs](#in-gates-of-hell-2) | The balance pages read 64-bit game data only |
| 5. Things that bite | not mapped | |

### Game modes only Gates of Hell has

<!-- goh: GHGPL-18 GHGPL-19 GHGPL-20 GHMIS-94 GHLOC-22 -->

- **Ammunition:** a flag opens every `enable_time` seconds (120 by default); capturing it pays each player into the vehicle budget, at most `maximum_ammo_payback` (250), and the flag is then gone.
- **Evacuation:** team A holds until the time limit while team B comes in waves (`firstWaveTime`, then every `waveTime`); `supply_waves` open supply flags that pay the next amount of `ammo_table`. Team B wins when team A has nothing it can operate for 20 seconds.
- **Guerrilla:** team A against waves, with `preparation_time` (15) and `waves_to_win` (10).

Their texts are new keys in the `text` group under `mp` and `game` ([Chapter 14, section 4](14-localization.md#4-key-families)). A `.set` for one of these modes makes no game in the 64-bit game.

### Supply, fuel and unit resources

<!-- goh: GHGPL-26 GHGPL-27 GHGPL-28 GHGPL-29 GHGPL-30 GHGPL-34 -->

- A supply zone is switched with `enabled` (default on); the Assault Squad 2 key `disabled` is not read, so write `{enabled 0}` instead.
- A supply zone can also hand out `fuel` and `mechanicResources`, each as `{amount}{max}{value}`.
- A unit can carry a stock in `{Resources {max}{current}{income}}` (100, 100, 0 by default), which fortifications are paid from. An unknown field there is an error ("Unknown resources field").
- A moving supply truck never supplies; the zone works only while it stands.

## Pitfalls

Check these before you publish a balance change:

- a wrong `unitLimits` or `payback` separator;
- an undefined ability level;
- an armour macro number that overrides your per-volume thickness;
- a volume without the `blast` flag that HE can no longer hurt;
- a `.set` whose string values were saved as cp1251 rather than UTF-8 (they show as boxes);
- a hero price compared with an MP price;
- a same-size edit that passes the lobby check and goes out of sync.

**Next:** [Chapter 18: Testing and Logs](18-testing-and-logs.md)
