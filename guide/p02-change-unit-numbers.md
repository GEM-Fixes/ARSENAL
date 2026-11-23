# Change a unit's numbers (price, health, speed)

A unit's numbers live in two places. The buy panel numbers (price, rank needed, how long the button waits) sit on its price card in the multiplayer unit lists. Its own numbers (top speed, armour, gun) sit in its definition file, the `.def` file. ARSENAL changes both and writes the changed copy into your mod.

## You need

- A mod folder (see [Make a mod and see it in the game](p01-first-mod.md)).
- The unit's name or id, for example `t34_0`. The Units page finds it from part of the name.

## The quick way

The Quick Guided Task row above the tabs has a task for each kind of number. Set "I want to" to **change**, then choose:

- **prices of an army**: what changes on that army's cards and how, its command points, score and capture, and the money rules that hold for every army.
- **a vehicle**: its groups include "Buying and army" for the card and "Speed and fuel" for the speeds.
- **a soldier**: "Health and stamina" and "Price".
- **a squad**: "Price", "Members" and "Buy card".

Press Start. Review lists every file before Write, and the task then checks the mod. See [Use the Quick Guided Task](p17-quick-guided-task.md). The steps below show the same changes on the Units and Balance pages.

## Steps

1. **Pick your mod and find the unit.** Open the Units page. Under "Mod folder" press "Pick folder" and choose your mod. In "Find a unit", type part of the name or id. Narrow with Kind and Army; tick "also units not in the buy panel" to see every unit. Click a unit to read its stats in plain words.

2. **Change one buy panel number.** In "Quick change", choose what to change: Price, Name, Armour, Unlock time, Rank needed or Head start. Type the "New value", press Preview, read the table, then press Write. The command way:

   ```
   ARSENAL balance "<game folder>" --folder mymod --where "id=t34_0" --change "cost set 400" --plan
   ARSENAL balance "<game folder>" --folder mymod --where "id=t34_0" --change "cost set 400"
   ```

   `--plan` shows the change and writes nothing. The other card columns are `rank`, `charge` (the unlock time) and `fore` (the head start). In the card file these are the keys [`cost`](r11-mission-files.md#cost), [`level`](r11-mission-files.md#level), [`charge`](r11-mission-files.md#charge) and [`fore`](r11-mission-files.md#fore). A price on the Units page shows what it is paid with: MP for manpower, SP for special points, or a mod's own points.

   The Units page's Balance card has three more helpers. "Change all prices of an army" takes a Percent: 10 makes the army's prices 10% higher, -20 makes them 20% cheaper, and prices are rounded to 5. "Price hint for this unit" shows what similar units cost. "Compare mod with the game" counts the buy panel units of the game and of your mod and lists the new and changed ones.

3. **Change speed, many prices at once, or a whole army.** Open the Balance page. Pick your mod folder, then narrow the list in Filter, for example `army=ger cls=tank`. Tick rows in the Sheet view to change only those. Under the Change view, choose the column to change (Price, Rank, Cooldown s, Fore, Wait at start s, Top speed, Armour or Reload s), the way to change it (by percent, add, multiply by, set to, or to the model price), and the number. Press Preview, then "Write into the mod". The command way is the same tool:

   ```
   ARSENAL balance "<game folder>" --folder mymod --where "id=t34_0" --change "speed set 40" --plan
   ARSENAL balance "<game folder>" --folder mymod --where "army=ger cls=tank" --change "cost pct 10"
   ```

   Top speed is the [`MaxSpeed`](r04-chassis-and-movement.md#maxspeed) value of the unit's [`Locomotion`](r04-chassis-and-movement.md#locomotion) block, in km/h. More on the Balance page in [Balance, pricing and gameplay](17-balance-pricing-gameplay.md#the-balance-page).

4. **Change a soldier's health.** Vehicles and guns have no health number: they are destroyed through their armour and parts, so make them tougher with armour (see [Change armour and see the result](p05-change-armour.md)). A soldier's health comes from his soldier type, the breed file under `set/breed/mp/<army>/`. Its [`perks`](r05-humans.md#perks) block holds a line such as [`{"health" "250%"}`](r05-humans.md#health-perk). The text in quotes is a level name from `set/ability/health.set`, which lists the allowed names from "20%" to "1000%". To change it, open the Editor page (tab IDE), switch the file view to Game, find the breed file, use "Copy into my mod", change the level name, and press Save. No single command does this edit.

5. **Change squad size.** On the Units page, pick a squad and open "Recipes", "Bigger squad". Choose the Soldier type and How many. The price does not change by itself; change it with Quick change.

6. **Check and look.** Run the check on the Check page (or `ARSENAL check mymod`), then play a test match from the Play page. The Units page lists what to look at in its "Buy panel checklist".

## What can go wrong

- **The game crashes at load after a buy panel change.** Unlock time and Rank needed take whole numbers only. Even `30.0` stops the game; write `30`. Price and Head start may have decimals.
- **A typo in a card field does nothing.** Field names on price cards are matched exactly, including capital letters, and an unknown field is skipped without a message. The Units and Balance pages write only fields the game reads.
- **The new top speed does not show when you order a move.** Ordered moves use the unit's three speed steps (the [`Speed` block](r04-chassis-and-movement.md#speed) with Slow, Normal and Fast), not `MaxSpeed`; see [Speed settings](07-units-vehicles-movement.md#speed-settings-why-an-ordered-unit-is-slower). `MaxSpeed` limits direct control. If the unit's file sets its own `Speed` block, change those numbers too. Roads never let a unit go faster than `MaxSpeed`.
- **A misspelled health level makes the soldier much stronger.** A level name that is not listed in `set/ability/health.set` gives the soldier the top level instead of an error. Copy a name from that file exactly.
- **The unit waits longer or shorter than you set.** The wait at the start of a match is the unlock time times the game mode's factor times (1 minus the head start). The Units page prints this sum; the test mode sets the wait to zero.
- **Players cannot join each other.** Every player in a match needs the same version of your mod.
- **Another mod undoes your change.** Your copy of a file replaces the game's file as a whole, and a mod lower in the Activated list wins over one higher up. Keep only one mod that changes the same unit list active, or merge them. See [who wins the load order](03-mod-folder-and-load-order.md#6-who-wins-the-load-order).

## In Gates of Hell
<!-- goh: GHMIS-84 GHMIS-85 GHGPL-10 GHMOV-42 GHMOV-44 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** has the Units, Balance and Editor pages: they read Gates of Hell units and write into a Gates of Hell mod. The price calculator is not available there, and the Quick Guided Task's price, vehicle, soldier and squad tasks are greyed out. Change the numbers on those pages or in a text editor, then run the Check page.
- **The card.** `level` and `fore` are not read: there is no rank lock and no head start. `charge` is a block, `{charge {delay N} {interval N}}`: the wait at the start of a match and the wait after each buy. A card with no `cost` costs 0, not 1.
- **Squad prices are worked out.** A squad card's price is its own `cost` plus each member's `cost` times the card's `squad_cost_factor`. With `round_multiple` the sum is rounded up to that step.
- **More card keys:** `cost_ap` and `cost_sp`, `score_factor`, `not_for_player_sale`, `conditions`, `action` and `doctrine`. The 64-bit build stops on keys it does not know, so a Gates of Hell card cannot be copied into an Assault Squad 2 mod as it is.
- **Speed.** `Slow`, `Normal` and `Fast` are written inside the `Locomotion` block; a separate `Speed` block is skipped. A slope lowers the top speed as well as the pull.

## More

- Part II: [Units, vehicles and movement](07-units-vehicles-movement.md#7-tuning-in-the-arsenal-window), [Infantry and humans](08-infantry-and-humans.md#9-changing-soldiers-and-squads-in-the-arsenal-window), [Balance, pricing and gameplay](17-balance-pricing-gameplay.md#3-multiplayer-economy-and-prices), [The toolchain: Units and Balance](19-toolchain.md#units--balance-all-games).
- Part III: [Entity definition](r02-entity-definition.md), [Chassis and movement](r04-chassis-and-movement.md), [Humans](r05-humans.md), [Mission files and multiplayer setup](r11-mission-files.md#13-units).
- Next job: [Add a new unit from an existing one](p03-add-a-unit.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
