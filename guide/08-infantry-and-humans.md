# Chapter 8: Infantry and Humans

Soldiers in Men of War are entities like any other, but they carry far more built-in machinery than a tank: health and stamina, morale, stances, perks, veterancy ranks, an inventory, and an animation system. This chapter walks through each of these and shows which parts you can change from data. Unfamiliar words are explained on first use and collected in the [glossary](22-glossary.md).

The short way to change a soldier's health or a squad's size is on [Change a unit's numbers](p02-change-unit-numbers.md), and a new squad made from an existing one is on [Add a new unit](p03-add-a-unit.md). Every key in this chapter has a full entry in [Reference 5: Humans: breed, abilities, inventory](r05-humans.md).

## What you will learn

- How health, stamina and death work, and why health alone never kills.
- How morale behaves, and what it does not do.
- How stances and animations are chosen, and what data cannot change.
- How abilities (perks), weapon skill, veterancy and breeds fit together.
- How an inventory and reloading work.
- How crew seats and boarding work.
- How to change soldiers and squads in the ARSENAL window or by hand, and check them with `humlint`.

As always, work in your own mod folder. Text files use CRLF line endings; the 64-bit build reads every string value as UTF-8, in data files and `.lng` files alike, and identifiers must be plain ASCII. Original data is ASCII outside `;` comments, where some old cp1251 bytes remain; leave them as they are. Paks are zip files. Editors may silently change encoding or line endings when you save.

## 1. The human entity

A soldier's definition pulls most of its behaviour from a shared class file, `properties/human.ext`. That file holds the foot speed table (covered in [chapter 7](07-units-vehicles-movement.md)), the `vitality` and `inventory` extenders, and the stance machine. An extender is a block that gives every entity of a class the same machinery; a unit's own `.def` can override parts of it. Because the class file is shared, editing it changes every soldier in the game. To change just one kind of soldier, change that soldier's breed (section 6) instead.

### In Gates of Hell

<!-- goh: GHHUM-47 GHHUM-70 -->

Gates of Hell tells a soldier from a vehicle by what kind of entity it is, not by the tags `human` and `vehicle`. Boarding, the crew panel and direct control of vehicle weapons all use that test, so a soldier copied with odd tags behaves differently in the two games. The `sensor` block also takes `MinRecognizeTime`, the least time in seconds before a soldier recognises what he sees (0 by default); the 64-bit game does not have it.

## 2. Health, stamina and death

Health and stamina both live in the `vitality` extender. This is its shape in the vanilla class file:

```
{extender "vitality"
  {Health {max 100} {current 100} {inc 1.0}}
  {Stamina
    {max 100}
    {current 100}
    {inc
      {stay   15  10   9    5}
      {walk   10   5   0  -10}
      {slow   10   5   0  -10}
      {normal 2.5  1   0  -20}
      {fast   -5 -10 -20  -40}}
    {load 0 20 40 100}
    {movement_limits {Fast 1 25} {Normal 0 0} {Slow -1 -1}}}}
```

Read it as follows. [`Health`](r05-humans.md#health-vitality) has a maximum, a starting value and `inc`, the health regained each second. If you leave the numbers out, the defaults are 100, 100 and 0.5. The real maximum is `max` times the difficulty factor times the health perk times one plus the veterancy health bonus.

[`Stamina`](r05-humans.md#stamina) has a maximum and a starting value too. [`load`](r05-humans.md#load) splits the weight a soldier carries into four bands (vanilla 0, 20, 40 and 100). The [`inc`](r05-humans.md#inc-stamina) table gives the stamina gained (positive) or lost (negative) each second for each way of moving, with one column per weight band; the game blends between columns by the actual weight. A row name other than `walk`, `slow`, `normal` or `fast` sets the standing row, so a misspelt row silently overwrites it.

[`movement_limits`](r05-humans.md#movement_limits) decides which speed the soldier may use at his current stamina. A speed is allowed once stamina reaches the higher of its two numbers and stays allowed until stamina falls below the lower one. In vanilla, running (Fast) starts at a stamina of 25 and stops below 1. While a soldier carries a heavy weapon locked in his hands, he can only walk, whatever this block says.

The most surprising fact about health is this: **health running out never kills a soldier by itself.** Death comes from soft code, the damage event scripts, which fire `{die}` when health falls low enough. This is why mods can have soldiers that survive at zero health, and why changing `Health max` alone may not behave the way you expect. Read how the interaction scripts treat low health in [chapter 11](11-interaction-scripts.md).

Bleeding is similar. It is only a tag on the unit, and wounds are at most 16 marks on the body that are there for show. There is no built-in rule that drains health while bleeding; any drain is a script you can read and change.

### In Gates of Hell

<!-- goh: GHDMG-21 GHHUM-08 GHHUM-09 GHHUM-12 GHHUM-10 GHHUM-15 GHHUM-07 -->

- **Damage by body part.** `vitality` takes `Damage {"volume" factor}` lines, `DamageTPC` (the same, for hits from a shooter under direct control) and `DamageBlast`; see [chapter 9](09-weapons-ammo-damage.md#in-gates-of-hell-9). The 64-bit game has none of them.
- **Heroes go down first.** A named hero (personage) who is killed falls knocked out instead: he cannot be selected and is tagged `bleeding`, and a medic can save him before the time runs out. While a hero is boosted that time grows. A saved mission keeps the time left; the 64-bit game reads it but does not write it, so a fresh time starts on each load.
- **Flash.** A flash blinds a soldier for a worked-out time: he drops his orders but keeps what he already saw.
- **Stamina.** A tired soldier probably cannot run on an order either, as the slower of the order's speed and his stamina's limit is used.
- **Veterancy** goes up to rank 8 (the 64-bit game: 5), section 5.

## 3. Morale and self-healing

Morale has no keys you can set in data. It runs from 0 to 100 and rises by about 0.83 a second on its own, but not for 10 seconds after a loss. A wounded soldier loses 20 times the fraction of health he lost, and his attacker gains the same. A kill gives +10. Friends within 20 m share +10 when an enemy is killed and share -60 when a friend dies. The computer's tactics react at morale 70, 50 and 30, and a computer soldier may flee: always below 10 percent health, with a 70 percent chance below 20 percent and a 30 percent chance below 30 percent.

What is not in the game matters as much: there is no suppression state, so a soldier under fire does not "pin" from morale. Inside the game, "pinned" only means a unit that the player has selected while controlling it directly.

A soldier heals himself when his health is below 70 percent, he carries an item tagged `bandage`, he has not seen an enemy for 5 seconds, and the player is not holding him in place. Healing gives 9.6 percent a second, 30 percent per bandage, and repeats while his health is at most 85 percent. See [Morale and self-healing](r05-humans.md#morale-and-self-healing) for the full figures.

### In Gates of Hell

<!-- goh: GHHUM-66 GHHUM-01 GHHUM-02 GHHUM-26 -->

Self-healing uses the same figures: a bandage per 30 health, and it stops above 85 percent. Healing starts while the animation plays, not after it, and stopping puts the soldier's last item back in his hand. Gates of Hell also has medics: a soldier with the `Medic` ability (`{rate vet}`, rate 5 by default) who is in cover or in battle (and probably when idle outdoors) walks to wounded men by himself, tries up to three times to reach each, and plays `revive` (the 64-bit game plays a repair animation). A soldier inside a vehicle is not a patient. A medic who falls stops. The morale rules have not been compared.

## 4. Stances and animation

Orders never play animations directly. They ask a stance machine for a state, and the machine walks a graph of stances: stand, walk, squat, lie, look, snipe, swim, board, inventory, special actions and death. The machine (a finite state machine, FSM) is written in `properties/human_fsm.ext` as `{FSM "human" (include ...)}` and its include files. Each request has a [`priority`](r05-humans.md#priority), and the higher one wins. In outline, dying and being thrown sit at the top, then inventory actions, then standing up and going down, reloading, moving, sniping, firing and aiming, with idle at the bottom.

Two important facts for modders:

1. Most animation names are chosen in the game's compiled code, not in data. Data can choose which request leads to which stance, and a few data blocks name animations directly (a weapon's `states` block, a seat's boarding sequence, an interaction script), but you cannot add a brand-new kind of motion that the game does not already ask for. A new weapon that fits an existing weapon type needs no new animation.
2. The held item's tags decide which pose set is used. The [weapon mode tags](r05-humans.md#weapon-mode-tags) are `rocketlauncher`, `mgun`, `smg`, `rifle`, `pistol` and `flamethrower`, together with the tag `weapon`; an item without `weapon` never gets a weapon pose. A pistol uses a running animation while firing only if it has the `shoot_walking` tag. A soldier carrying a crate may not be able to go prone (unconfirmed).

The stance graph is checked when it loads. The game logs warnings such as `fsm: state "x" not exist, but referenced`, a stance with no exit, or a stance that cannot be reached from `start`. Each stance that can die needs exactly one edge into a stance tagged as dying.

### In Gates of Hell

<!-- goh: GHHUM-48 GHHUM-49 GHHUM-50 GHHUM-51 GHHUM-52 GHHUM-53 GHHUM-55 GHHUM-56 GHHUM-57 GHHUM-71 GHHUM-72 GHHUM-37 GHHUM-28 GHHUM-30 GHHUM-36 GHHUM-67 GHHUM-68 GHHUM-14 GHHUM-18 GHHUM-31 -->

The same stance machine is used, but the set of animations it asks for differs, so an animation pack does not carry over unchanged:

- **More weapon kinds.** Two more weapon mode tags pick their own pose sets: `bolt_action` and `shortsmg`. A rifle lying down uses `pose_lie_rifle` and `lie_fire_rifle`. Some standing and crouching long-gun poses of the 64-bit game are gone.
- **New stances and walks.** There are new stance states and new walking animations, and a rifleman can fire while walking. Firing on the move uses `shoot_walking_manual` (under direct control) or `shoot_walking_ai`. Lying down there are more states, and a lying soldier treats himself with `lie_self-treatment_*` animations.
- **Variants.** When an animation folder holds several variants, one is picked at random each time.
- **Throws** are marked at 5, 10 and 20 m and the matching throw animation is used.
- **Removed.** Drowning in swamps, smoking and the finger poses are gone.
- **Height steps.** A dive, fall or thrown landing may cross a height step of about 4 m; the 64-bit game allows 0.3 m.
- **Firing rules.** A stance tagged `no-fire` blocks firing, and firing in a `move` stance needs the item tag `shoot_walking` or direct control. A `rocketlauncher` fires only from its aiming pose.
- **Direct control.** When a soldier under direct control moves, his reload, bolt and treatment animations run to their end at once, so their end events still happen.
- **Prone paths.** A lying soldier finds his path with the `human_prone` profile if `set/pather.set` has one; without it nothing changes.
- **Idle.** An entity effect named `select_idle` can choose the idle animation. Without it, only a standing soldier plays idle animations.

## 5. Abilities, weapon skill and veterancy

Abilities, also called perks, are defined in the files of the `set/ability` folder. A leveled ability lists named [levels](r05-humans.md#level) with a multiplier each, for example `{level "150%" 1.5}` in the health ability. A breed then picks one level in its perks:

```
{"health" "150%"}
```

Vanilla health levels run from `20%` to `1000%`. If a breed names a level that the ability does not have, the game logs only `invalid level param "x"` and quietly gives the top level. That is a silent buff of up to ten times the health, so check your spelling. Some perks take a plain number instead of a level: `speed`, `tank`, `vehicle` and `cannon` (`{"speed" 0.9}` makes a soldier 10 percent slower). The perk `weapon_reload` is read by nothing; to shorten reloads, use the veterancy key of the same name.

**Weapon skill** is an ability made `from weapon` that changes accuracy by posture and level. This is the pattern of the vanilla machine-gun skill:

```
{"mgun" from weapon
  {item "mgun"}
  {level "lvl_1"
    {stand {accuracy 0.25}}
    {squat {accuracy 0.50}}
    {crawl {accuracy 1.25}}
    {cover {accuracy 1.50}}
    {vehicle {accuracy 2.00}}}}
```

The skill works only while the item in the soldier's right hand has all the tags in `item`. The game picks the [posture block](r05-humans.md#stand-squat-crawl-cover-vehicle) (`cover` in cover, `vehicle` aboard a vehicle, `crawl` lying, `squat` crouching, `stand` otherwise); a `{default}` block fills all five at once. [`accuracy`](r05-humans.md#accuracy-skill) multiplies the hit rate and narrows the spread of shots; 1.0 is neutral. Vanilla data also carries an `aim_range` value in posture blocks, but nothing reads it.

**Veterancy** gives ranks. A breed's [`veterancy`](r05-humans.md#veterancy-breed) block sets the experience needed for each rank; vanilla breeds include one shared file whose thresholds for ranks 1 to 5 are 4, 8, 24, 48 and 80, and 2, 4, 12, 24 and 40 inside its multiplayer `(mod "mp" ...)` block. What each rank gives is set in `set/ability/veterancy.set`: ranks 1 to 5 add 0.15 to 0.35 to health, save 0.10 to 0.30 of reload time, and add 0, 0, 1, 1 and 2 steps to weapon skill. Only the highest rank reached applies; ranks do not add up.

### In Gates of Hell

<!-- goh: GHHUM-04 GHHUM-05 GHHUM-20 GHHUM-27 GHHUM-26 GHHUM-07 GHHUM-19 GHHUM-06 GHHUM-13 -->

- **Weapon skill reads five numbers.** A posture block takes `accuracy`, `aim_range`, `recoil`, `zoom_recoil` (while aiming down the sights) and `sway`, each 1 by default, and `{default}` copies all five to every posture. The skill then sets how much a hand weapon kicks and swings. The 64-bit game reads only `accuracy` and `aim_range`.
- **Crew skill on vehicle guns.** A vehicle gun takes the best recoil and the smallest sway among the crew in its worker seats who have the matching skill.
- **New abilities.** `weapon_sway_control` (one plain number that scales sway), `Medic` (`{rate vet}`, see section 3), `Personage`, `Fortification`, `Mechanic` (repair speed), `Barricade` and `Resources`. The 64-bit game has no data for them, so these perks do nothing there.
- **Veterancy** has ranks 0 to 8; the 64-bit game cuts anything above 5 down to 5. On every spawn the rank is worked out again from the veterancy abilities, so a spawned soldier's rank follows his perks, not a saved score.
- **Special attack** works even when the weapon is empty.
- **Kill score** from a vehicle is shared among the men in the crew group's worker seats. The 64-bit game gives it by seat role name (driver, gunner, commander, loader), so with other seat names experience can go to the wrong men.

## 6. Breeds

A breed is a soldier template: one file under `set/breed/` (multiplayer breeds are in `set/breed/mp/<army>/`) that gives the soldier his skin, portrait, armour, perks, veterancy and starting kit. This is the pattern of a vanilla multiplayer breed, shortened:

```
{breed
  {skin "ger_t2"}
  {portrait "ger_soldier2"}
  {nationality ger}
  {armors {head helmet1_ger}}
  {perks
    {"health" "150%"}
    {"speed" 0.9}
    {"rifle" lvl_3}
    {"mgun" lvl_1}}
  {veterancy
    (include "veterancy_generic.inc")
    ("veterancy_1")}
  {inventory
    {item "mp40" filled}
    {item "ammo pistol" 500}
    {item "bandage" 3}
    {in_hands 0}}}
```

In the [inventory](r05-humans.md#inventory-breed), each [`item`](r05-humans.md#item-breed) adds stuff carrying all the given tags, with an optional count; `{in_hands 0}` puts the first item into his hands. Items that do not fit into his box are dropped silently, so a full box loses the last items in the list. Be careful with [`filled N`](r05-humans.md#filled): plain `filled` loads a weapon to its own capacity, but `filled N` also rewrites the capacity of that item for every soldier who carries it, not just this breed. Breed [`tags`](r05-humans.md#tags-breed) are labels for scripts and the interface; the only one the game itself acts on is `kamikaze`.

### In Gates of Hell

<!-- goh: GHHUM-24 GHHUM-25 -->

A Gates of Hell breed can have two more keys: `no_inventory` (after `hero`; the soldier gets an empty box but still wears his armour) and `field_icon` (between `portrait` and `icon`, a picture for the interface). The 64-bit game stops on both as unknown keys, so take them out when you port a breed. Gates of Hell ranks go up to 8 (section 5).

## 7. Inventory and reload

A soldier's inventory is set up by the `inventory` extender in `properties/human.ext`:

```
{extender "inventory"
  {box {Size 6 10} {Weight 100}}
  {hand_left}
  {hand_right}
  {armor "head" {mask "head"} {bone "head"} {volumes "head"} {pierceAbsorb 30}}
  ...}
```

The [`box`](r05-humans.md#box) is a grid of cells, 6 by 10 for vanilla soldiers. Its [`Weight`](r05-humans.md#weight-box) is the weight one cell can hold, not a limit on the total a soldier carries. Items take cells by their size. Stacking (several of one item in a cell, such as rounds of ammunition) works only for stuff tagged `stackable`; how many fit in one cell follows from the cell weight and the item's weight (unconfirmed). Besides the box, the holders are `hand_right`, `hand_left`, `weapon` and `armor`. An [`armor`](r05-humans.md#armor-holder) holder protects the hit volumes it names while an armour item, such as a helmet, sits in it; its [`pierceAbsorb`](r05-humans.md#pierceabsorb) (30 mm for the head, 32 mm for the body in vanilla) is how much a bullet must penetrate before it hurts the soldier ([chapter 9](09-weapons-ammo-damage.md) shows where this applies).

Reloading works on tags. A gun asks for ammunition whose tags contain the gun's filling tags (`filling "ammo rifle"` accepts an item tagged `ammo rifle ...`), and the soldier searches his own inventory first, then his squad mates'. Different filling tags never share ammunition. This is why careful tagging ([chapter 6](06-data-keys-entities.md)) matters: a wrong tag leaves a gun that cannot find its magazines. Reload time is the weapon's reload time less the veterancy `weapon_reload` bonus.

### In Gates of Hell

<!-- goh: GHHUM-58 GHHUM-59 GHHUM-60 GHHUM-22 GHHUM-61 GHHUM-62 GHHUM-63 GHHUM-64 GHHUM-21 -->

- **Weapon list.** The list of weapons a soldier can switch to holds one entry for each item in his hands and his pack. Throwables are the items tagged `throwable`; the 64-bit game takes any of `grenade`, `knife`, `mine`, `dynamite`, `matchbox` and `plant`. An item tagged only `knife` or `mine` drops out of the list in Gates of Hell. The same list drives the next-weapon and number keys under direct control.
- **Search order.** A search by tags (a weapon to take, a grenade to throw, a mine to lay, ammunition) walks the box in the order the items were put in; the 64-bit game walks the cells row by row. With two matching items the games may pick different ones.
- **Spent launchers** (one-shot `rocketlauncher` items) are dropped to the ground, not packed, and the soldier then takes any other weapon.
- **Preloaded guns** start with a full reserve: a weapon is filled to the second number of its `Filling`, not one magazine.
- **Bad items.** A box item whose entity cannot be found is skipped and logged instead of crashing the load. An item saved without `filling` reloads the right ammunition kind.
- **Stacks** made by a script can be kept apart with the stack flag of the script's inventory add command.
- **Mine detectors** find mines within 10 m (the 64-bit game: 5 m).

## 8. Crew and seats

Soldiers crew vehicles through seats: the `placer` block lists the seats and the `boarder` block the doors and boarding animations (see [Reference 3](r03-extenders-and-components.md#placer-seats) and [chapter 6](06-data-keys-entities.md)). A soldier takes the first free seat whose role name begins with the role he is sent to, so a "gunner" can take the seat `gunner2`. Seats can be grouped so that a function needs all its crew, for example a gunner and a loader. Boarding may need the vehicle to be standing still (unconfirmed). When the whole crew is ordered out at once, the vehicle stops aiming and its crew cannot be given new orders until they are out. Seated soldiers keep their health and stamina, and a dead crew member stays in his seat.

### In Gates of Hell

<!-- goh: GHHUM-39 GHHUM-40 GHHUM-41 GHHUM-42 GHHUM-43 GHHUM-44 GHHUM-46 GHHUM-13 -->

- **Hatches.** A seat can be `Sealable`. When its hatch closes, the man moves to a free inside seat of the same group, or stays hidden without the seat's view; when it opens he comes back. The 64-bit game rejects the key.
- **`Broken` seats** in data or saves are ignored; a seat is broken only while its link bone is missing.
- **`minworkers N`** on a seat group lets it work with N of its seats manned (by default all of them), so a gun with `minworkers 2` and three seats keeps firing with two men. Empty seats pull a man from a free seat while the group is short.
- **Doors.** A vehicle seat is left only through doors linked to it, and a door is refused as blocked less often.
- **Reservations** on a seat that can no longer be taken are released, so the seat does not stay blocked for everyone.
- **Crew survive** when the vehicle they sit in is removed.
- **Kill score** goes to the crew group (section 5).

## 9. Changing soldiers and squads in the ARSENAL window

- The **Units** page finds a squad or a soldier by name or id and shows its price, rank and crew in plain words. Its recipe "Bigger squad" sets how many soldiers of one type come in a squad; the price does not change by itself, so set it in "Quick change". "Add a unit (copy)" copies a squad into your mod under a new id.
- "Describe a new unit", on the same page, can also start from a squad. A squad has no speed, armour or gun of its own there, so those words are left out; change the soldiers' breeds and weapons instead.
- The Units page does not change a soldier's health. Change it in the breed's `perks` by hand, as below, or use the Quick Guided Task.
- The **Quick Guided Task** has recipes for both. The soldier recipe asks, one question at a time, for the breed name, skin, armour, nationality, portrait, icon, voice, the inventory items, the health, stamina and speed perks, the tank, vehicle and cannon perks, veterancy, vision and the other perk values, and the squad the soldier joins. The squad recipe asks for the name, cost, members, charge, group, button, level, icon and bot settings. The Units page also offers a "Longer rifle range" recipe. See [Use the Quick Guided Task](p17-quick-guided-task.md) and [the Units and Balance pages](19-toolchain.md#units--balance-all-games).

See also: [Humans reference](r05-humans.md), [troubleshooting units that do not move or fire](21-troubleshooting.md#8-symptom-units-that-cannot-move-cannot-be-selected-or-do-not-fire).

### In Gates of Hell

<!-- goh: none (ARSENAL pages for Gates of Hell) -->

The Units page and the Quick Guided Task recipes write 64-bit game data only. For Gates of Hell soldiers, ARSENAL can bring a unit across with `goh unit`, which ports vehicles; breeds and squads are moved by hand, taking out the keys named in sections 5 and 6. See [the Gates of Hell tools](19-toolchain.md#units--balance-under-goh).

## 10. Changes by hand: examples

**Tougher conscripts.** In your copy of the breed, raise the health perk:

```
{perks {"health" "200%"}}
```

`200%` is a level that exists in the vanilla health ability. A made-up level such as `130%` silently gives the top level.

**Faster recovery.** Raise `inc` in the `Health` block. This changes every soldier if you edit `properties/human.ext`; to change one breed, raise its `health_regeneration` perk level instead. It does not stop a scripted drain.

**Tired soldiers stop running sooner.** In `movement_limits`, raise the numbers of the `Fast` row, for example `{Fast 10 40}`: running then starts at stamina 40 and stops below 10.

**A leader whose kills inspire.** Morale rules are fixed in the game, so you cannot change the +10 from data; use an interaction script if you need a bonus.

## 11. Checking your work

```
ARSENAL humlint <mod folder> --game <game folder>
ARSENAL keylint <mod folder>
```

`humlint` reads human definitions, breeds and abilities, and reports unknown keys in the vitality block, misspelt stamina rows, `in_hands` past the end of the list, `filled N` that changes other breeds, the inert `weapon_reload` perk and similar mistakes. `keylint` reports a perk level that the ability does not declare. Then look at the soldier in game, and read `game.log` for `invalid level param` and `Unknown ability` lines ([chapter 18](18-testing-and-logs.md)).

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. The human entity | [differs](#in-gates-of-hell) | soldier told by entity kind, not tags; least recognise time |
| 2. Health, stamina and death | [differs](#in-gates-of-hell-1) | damage by body part; heroes knocked out first; flash on a timer |
| 3. Morale and self-healing | [differs](#in-gates-of-hell-2) | same healing figures; medics heal others; morale not compared |
| 4. Stances and animation | [differs](#in-gates-of-hell-3) | more weapon kinds and stances; new animation names; random variants |
| 5. Abilities, weapon skill and veterancy | [differs](#in-gates-of-hell-4) | recoil and sway skill; new abilities; ranks up to 8 |
| 6. Breeds | [differs](#in-gates-of-hell-5) | `no_inventory` and `field_icon` keys |
| 7. Inventory and reload | [differs](#in-gates-of-hell-6) | `throwable` tag; search order; full reserve; 10 m mine detector |
| 8. Crew and seats | [differs](#in-gates-of-hell-7) | hatches; `minworkers`; own doors; crew survive |
| 9. Changing soldiers and squads in the ARSENAL window | [differs](#in-gates-of-hell-8) | the pages write 64-bit game data only |
| 10. Changes by hand: examples | not mapped | |
| 11. Checking your work | not mapped | |

Gates of Hell also has direct control and third person for soldiers, below.

### Direct control and third person

<!-- goh: GHDC-01 GHDC-04 GHDC-05 GHDC-35 GHDC-36 GHDC-37 GHKEY-12 GHKEY-64 GHCMD-04 GHHUM-55 GHHUM-14 -->

In Gates of Hell the player can steer one soldier himself. There are two modes: direct control (he aims and fires with the mouse) and third person (the camera follows behind him). The key `manual_mode_toggle` switches between them. The 64-bit game has neither mode, and a Gates of Hell save loses its manual control when loaded there.

The camera and the rules of control come from `set/tp_control.set`, with the root `third_person_control` and the groups `disabled`, `vehicle` and `human`. Each entry names unit tags, can `inherit` another entry, and holds a `clip` block and camera `level` blocks with a `maxlevel`. A unit with no matching entry cannot be taken. The file's own checks log lines such as "Distance can not be greater than that for previous level", "Third Person Control entry redefinition" and "Unknown keyword". A level that names a `linkbone` the model does not have refuses control with "Could not find bone ... in entity ...". In multiplayer every machine looks the entry up for itself, so the file must be the same on all of them. A weapon's `ThirdPersonParams` block probably adds camera values for that weapon.

Under direct control:

- More keys: `squadmember1` to `squadmember10`, `toggle_crouch`, `toggle_prone`, `special_action`, `next_weapon` and `weapon1` to `weapon8`. The weapon keys follow the weapon list of section 7.
- A gun fires only at a target in range and not inside its `MinRange`, and not while the soldier sprints or crawls ([chapter 9](09-weapons-ammo-damage.md#gates-of-hell-summary)).
- Firing on the move needs the tag `shoot_walking_manual` on the weapon; a stance tagged `no-aim` stops aiming.
- Recoil and sway come from the weapon and the soldier's skill (section 5). `AutoReload` and `ClickSound` belong here too.
- Hits from a soldier under direct control use the `DamageTPC` lines of the target's `vitality`.

## Pitfalls

- Health reaching zero does not kill by itself; a script fires `{die}`.
- Bleeding has no drain of its own; it is a marker only.
- There is no suppression system.
- A perk level name that the ability does not have gives the top level, with only a log line.
- The `weapon_reload` perk does nothing; the veterancy key of the same name works.
- Only the highest veterancy rank applies.
- A breed's `filled N` changes the capacity of that item for everyone.
- Box `Weight` is a weight per cell, not a carry limit. Items that do not fit are dropped silently.
- Stacking needs the `stackable` tag.
- Most animation names are fixed in compiled code; data cannot add new kinds of motion.
- Shared files such as `human.ext` change every soldier when edited.

Next: [Weapons, ammo and damage](09-weapons-ammo-damage.md).
