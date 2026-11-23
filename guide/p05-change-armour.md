# Change armour and see the result

A vehicle's armour is set in two layers. The unit's `.def` file usually calls an armour macro such as `armor_tank` with four numbers per part: front, side, rear and top, in millimetres. Below that, each volume of the model (a box or shape that shells hit, such as `body1` or `turret`) can carry its own `{thickness}`. A shell goes through when it can pierce more than the thickness along its path, which grows with the slope. The Models page, Armor part, shows and changes all of this.

## You need

- A mod folder (see [Make a mod and see it in the game](p01-first-mod.md)).
- A vehicle in the game, or one your mod adds.

## The quick way

In the Quick Guided Task row above the tabs, set "I want to" to **change**, choose **the armour of a vehicle** and press Start. The task asks for the vehicle, then for the armour preset and its lines, the hit volumes and the repair time, with volumes and parts under "Advanced". Review lists every file before Write, and the task checks the mod after. See [Use the Quick Guided Task](p17-quick-guided-task.md). To see what a shell does to the result, use the Models page as in the steps below.

## Steps

1. **Pick your mod and the vehicle.** Open the Models page. Press "Pick mod folder" and choose your mod: the armour is read with your mod laid over the game. In Unit, type part of the vehicle's name or id and click it. Open the Armor part.

2. **Read the thickness of each part.** The table "Thickness of each part" ([the armour table](r07-armour-volumes-damage.md#the-armour-table-on-the-models-page)) lists every armoured part and its six sides in millimetres, and notes where each number comes from (set on the part itself, from an armour area, or no value, which counts as 0 mm). "Where each number comes from (file and line)" shows the file. The command way:

   ```
   ARSENAL armorsim table t34_0
   ```

3. **Change a number.** Click a number in the table ("click to change"). Type the New thickness (0 to 1000 mm), choose Which sides ("only the" one side, or "all six sides"), press "Try it" (nothing is written), then "Change it". A shared number lists the other parts; "Change all of them" changes them together. The unit's file is copied into your mod first. The command way:

   ```
   ARSENAL armorsim edit t34_0 --volume turret --side front --mm 60 --out mymod --dry
   ARSENAL armorsim edit t34_0 --volume turret --side front --mm 60 --out mymod
   ```

   Add `--shared` when the number is shared. The Units page (Quick change, Armour: front side rear top, `_` keeps one) and the Balance page (Armour) change the macro numbers too.

4. **Choose who shoots.** Under "Who shoots", search a Gun, pick one of its Shell types and set the Range (0 to 5000 m).

5. **See the whole side.** Under "What happens across the whole side", choose "Shoot from" Front, Rear, Left, Right or Top. The map colours every spot by what happens and gives the share of hits that go through. Click a spot to shoot through it.

6. **Fire one shot.** Click a part in the 3D view, or a spot on the map, for a "Shot test": each plate the shell meets, its slope, and what happens. The command way:

   ```
   ARSENAL armorsim shot t34_0 --weapon "<gun name>" --ammo "<shell tags>" --range 500 --from 0,0
   ARSENAL armorsim map t34_0 --weapon "<gun name>" --ammo "<shell tags>" --range 500 --view front
   ```

   `--from 0,0` is straight from the front; 90 is the left side. The Shot button above the 3D view of the Model tab does the same on the model you have open for editing, and runs the last shot again when you change the model.

7. **See what happens behind the armour.** Under the shot test, "Behind the armour" follows the shot past the plates: the chance that the tank cannot move, cannot shoot, burns or explodes, the state of each part and crew member, and which event or script line led to each result. "Without the mod" runs the same shot on the game's own files to compare. After a thickness change it shows the result before the edit next to the new one. Read its lists of skipped script words before you trust a number. Every option is described in [Seeing and testing armour in the ARSENAL window](09-weapons-ammo-damage.md#behind-the-armour).

8. **Check in the game.** Press Apply again in the game's mod list (no restart is needed), then shoot at the vehicle in a test match or in the editor. The page follows the game's rules for thickness, slope and penetration and the unit's own scripts; a hit in a running match is still the final word.

## What can go wrong

- **A changed [`{thickness}`](r07-armour-volumes-damage.md#thickness-volume) does nothing.** A nonzero number in the [armour macro](r07-armour-volumes-damage.md#armor_tank) for that side wins over the thickness written on the volume. Change the macro number, or set it to 0 for that side so that each volume's own thickness is used.
- **Left and right, top and bottom cannot differ through the macro.** The macro's "side" number is used for both left and right, and its "top" number for the bottom.
- **One hull, several plates.** A hull is often several volumes (an upper and a lower front plate, for example). A nonzero macro number overwrites all of them with one value. Keep the plates apart by leaving the macro at 0 on that side.
- **Changing a shared number changes other units.** An armour area or macro value can be used by more than one part or unit. Read the list the page shows before "Change all of them".
- **A part is never hit.** A volume named in the unit's file but missing in the model is dropped without a message, and its armour is lost.
- **Which side a hit counts as is fixed in the model.** Each face of a volume carries its side (front, side, rear, top) in the `.vol` file; it does not come from the shot's angle.
- **Very flat hits stop growing.** The slope multiplies the thickness at most ten times.
- **Armour-piercing shells rarely break hull or turret.** The game's tank macro gives those parts a very high durability against piercing, so only blast damage breaks them. See [Armour thickness, threshold and durability](09-weapons-ammo-damage.md#6-armour-thickness-threshold-and-durability).
- **Three numbers in a `{thickness}` block shift the sides.** Write all four: front, side, rear, top.
- **Players cannot join each other.** Every player in a match needs the same version of your mod.

More causes: [Troubleshooting: armor and damage surprises](21-troubleshooting.md#9-symptom-armor-and-damage-surprises).

## In Gates of Hell
<!-- goh: GHDMG-01 GHDMG-27 GHDMG-37 GHDMG-38 GHDMG-39 GHDMG-41 GHDMG-53 GHKEY-29 GHKEY-59 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** shows the Models page without its Armor part, and the armour task of the Quick Guided Task is greyed out. The Armor part, the Shot tool and `armorsim` follow the Assault Squad 2 rules only, so do not use them to judge a vehicle in Gates of Hell.
- **More factors on a plate.** Against a piercing shell, the thickness is multiplied by an overmatch factor and by three volume keys: `Quality` (`no_flaw`, `small_flaw`, `medium_flaw` or `large_flaw`: a flawed plate counts as thinner at an angle), `CastSteel` (cast armour counts as weaker) and `HighHardness` (a flag for very hard plate, with its own factor). The overmatch factor comes from the shell's `OvermatchCalibre`, `OvermatchFixed` or `OvermatchSlope` table. Against a blast the thickness is used as it is.
- **Armour does not wear.** `durability` blocks are read but do nothing: a plate never weakens with hits.
- **Part health.** `set/component.set` gives each kind of part its own hit points (`hp`, `hp_broken`, `armor_damage_modifier`). The 64-bit game never reads this file.
- The rules in full: [Penetration test, step by step](09-weapons-ammo-damage.md#5-penetration-test-step-by-step) and [Armour thickness, threshold and durability](09-weapons-ammo-damage.md#6-armour-thickness-threshold-and-durability). When you bring a vehicle over, see [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

## More

- Part II: [Weapons, ammunition and damage](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window), [Effects, sound and models](16-effects-sound-models.md), [Balance: the armour simulator](17-balance-pricing-gameplay.md#the-armour-simulator), [The toolchain: Models](19-toolchain.md#models--sim-all-games) and [`armorsim`](19-toolchain.md#armorsim-the-armour-simulator).
- Part III: [Armour, volumes and damage](r07-armour-volumes-damage.md), entries [`armor`](r07-armour-volumes-damage.md#armor) and [`volume`](r07-armour-volumes-damage.md#volume); [Entity definition](r02-entity-definition.md), [Weapons and ammunition](r06-weapons-and-ammunition.md).
- Next job: [Edit a model or an animation](p06-edit-a-model.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
