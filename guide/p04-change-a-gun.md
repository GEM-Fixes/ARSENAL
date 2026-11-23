# Change a gun or its ammunition

Weapons and ammunition are "stuff" files: text files without an extension under `set/stuff/` (cannons under `set/stuff/gun/`, rifles under `set/stuff/rifle/` and so on). A unit names the gun it carries; many units can carry the same gun file. A gun file holds the reload time, range, muzzle speed and, per kind of shell, penetration and damage.

## You need

- A mod folder (see [Make a mod and see it in the game](p01-first-mod.md)).
- The unit that carries the gun, or the gun's file name.

## The quick way

In the Quick Guided Task row above the tabs, set "I want to" to **make** or **change** and choose **a gun or weapon** or **ammunition**, then press Start. The gun task starts with what the weapon is and then asks for the main numbers (range, reload and recovery time, shell speed and damage); the ammunition task asks what the shell is and its damage. Review lists every file before Write, and the task checks the mod after. See [Use the Quick Guided Task](p17-quick-guided-task.md). The steps below show the pages and the command way.

## Steps

1. **Find the gun.** On the Units page, pick a unit and read the "Main gun" line: range in map units (20 map units are 1 m), damage and penetration of the default shell. The Balance page shows the same for every unit in the columns Gun, Calibre mm, Pen 100 m, Damage, Reload s and Range m. The command way prints tables of every gun and shell:

   ```
   ARSENAL statsheet "<game folder>" --sheet weapons,ammo --filter 75mm
   ```

2. **Change the reload time.** On the Balance page, pick your mod folder, narrow the list in Filter, open the Change view, choose "Reload s", choose how (set to, add, multiply by, by percent), type the number, press Preview, then "Write into the mod". The preview lists every unit that carries the same gun, because they all change with it. The command way:

   ```
   ARSENAL balance "<game folder>" --folder mymod --where "id=t34_0" --change "reload set 6" --plan
   ```

   Remove `--plan` to write.

3. **Change a rifle's range.** On the Units page, pick a squad, open "Recipes", "Longer rifle range", choose the Weapon and type the Range (one number, or two: aimed and longest).

4. **Give one unit its own, stronger gun.** The command way does this best. Write a spec with a `gun` step and a `weapon` step:

   ```
   name: my_guns
   title: My Guns
   ops:
     - op: gun
       name: my_76mm
       like: <existing gun name>
       recharge: 6
       pen: "120 110 100 90 80"
     - op: weapon
       entity: t34_0
       weapon: my_76mm
   ```

   `gun` makes a new gun file that copies an existing one (`like`) and changes only what you list: `recharge` (seconds between shots), `speed` (shell speed in m/s), `damage`, `pen` (penetration in mm at 100, 500, 1000, 1500 and 2000 m) or `pen_scale` (multiply the copied table, 1.2 is 20% more), and the presets `range`, `accuracy` and `caliber`. `weapon` mounts the new gun on one unit. Run `ARSENAL gen my_guns.yaml --target as64 --out my_guns --plan`, then again without `--plan`. On the Units page, "Describe a new unit" also gives the new unit a gun file of its own.

5. **Edit the gun file by hand.** Open the Editor page (tab IDE), switch the file view to Game, find the gun under `set/stuff/`, press "Copy into my mod", then change the keys and press Save. Useful keys: [`rechargeTime`](r06-weapons-and-ammunition.md#rechargetime) (reload, seconds), [`recoveryTime`](r06-weapons-and-ammunition.md#recoverytime) (time between shots or bolt cycle), [`range`](r06-weapons-and-ammunition.md#range) (aimed and longest range, metres), [`speed`](r06-weapons-and-ammunition.md#speed) (muzzle speed, m/s). Settings for one kind of shell go inside a [`parameters "<ammo tags>"`](r06-weapons-and-ammunition.md#parameters) block. All weapon keys are in [Weapon keys](09-weapons-ammo-damage.md#1-weapon-keys) and the per-shell rules in [Ammunition and per-ammunition blocks](09-weapons-ammo-damage.md#2-ammunition-and-per-ammunition-blocks).

6. **See what the gun does to a target.** Open the Models page, pick a vehicle, open the Armor part, and under "Who shoots" choose your gun, a Shell and a Range. The page says how many millimetres of flat armour the shell goes through. Click a part to run the shot test; "Behind the armour" under it says what the shot does to the parts, the crew and the tank as a whole. The Shot button above the 3D view of the Model tab shoots at the point you click. See [Seeing and testing armour in the ARSENAL window](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window) and [Change armour and see the result](p05-change-armour.md).

7. **Check and look.** `ARSENAL check mymod`, then play a test match and fire the gun.

## What can go wrong

- **A setting inside `parameters` changes the whole gun.** Only some keys can differ per shell (among them reload, range, gravity, damage and its table, speed and spreading). Others written inside the block, such as `calibre`, `burst` or `DisableRicochet`, apply to every shell of the gun.
- **The shell uses the gun's normal values.** A `parameters` block applies only when the loaded shell has all its tags. The first matching block in the file wins, and `apc` is not `apcbc`.
- **Penetration stops past a range.** The penetration table runs in straight lines between its points and ends a few metres after its last range. Outside the table the first or last value is used, with no extrapolation. Give points up to the longest range you want.
- **A damage line removes the old effect.** `damage X` without `add` replaces the gun's earlier effect of that kind, for example the first blast layer. Write `damage add ...` to add one.
- **A damage threshold below 1 is ignored.** [`projectileDamageThreshold`](r06-weapons-and-ammunition.md#projectiledamagethreshold) is raised to 1 when it is read.
- **The game stops at load.** A [`curve`](r06-weapons-and-ammunition.md#curve) name that is not listed in `set/ballistics.set` is fatal.
- **The gun is silent or shows a checkered cursor.** Sound names ([`fireSound`](r06-weapons-and-ammunition.md#firesound) and the others) have no aliases: a name that matches no file or folder under `sound/` plays nothing. A `cursor` that names no file under `interface/cursor` shows a checker pattern.
- **Every unit with the gun changed.** Units share gun files. Make a new gun (step 4) when only one unit should change.
- **Players cannot join each other.** Every player in a match needs the same version of your mod.

## In Gates of Hell
<!-- goh: GHKEY-46 GHKEY-47 GHKEY-48 GHKEY-51 GHKEY-52 GHKEY-53 GHKEY-54 GHKEY-56 GHKEY-57 GHKEY-63 GHDMG-37 GHDMG-41 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** has the Units, Balance, Models and Editor pages for Gates of Hell files, but the Armor part of Models is not available there, and the gun and ammunition tasks of the Quick Guided Task are greyed out. The `gun` and `weapon` steps of `gen` are for Assault Squad 2 only. Change a Gates of Hell weapon in a text editor, then run the Check page.
- **More weapon keys**, among them `FireSoundClose`, `ClickSound`, `AutoReload`, `FiringTimeout`, `Recoil` and `SwayParams`. A `parameters` block also takes `MinRange`, `FalloffMeter` and `FalloffStrength`, `MinimumDamageModifier` and three overmatch tables. The full list is in [Weapon keys](09-weapons-ammo-damage.md#in-gates-of-hell) and [Ammunition and per-ammunition blocks](09-weapons-ammo-damage.md#in-gates-of-hell-1).
- **Penetration** is judged with more factors than in Assault Squad 2, and armour does not wear; see [Penetration test, step by step](09-weapons-ammo-damage.md#5-penetration-test-step-by-step).
- **The armour tools** on the Models page and `armorsim` follow the Assault Squad 2 rules only. Do not use them to judge a gun in Gates of Hell.
- **Bringing a gun over.** The 64-bit game stops with `unexpected token` on any of these keys, so a weapon from Gates of Hell must lose them first: see [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

## More

- Part II: [Weapons, ammunition and damage](09-weapons-ammo-damage.md), [Balance, pricing and gameplay](17-balance-pricing-gameplay.md#the-balance-page), [The toolchain: `balance`](19-toolchain.md#balance-the-buy-panel-as-a-table).
- Part III: [Weapons and ammunition](r06-weapons-and-ammunition.md), [Armour, volumes and damage](r07-armour-volumes-damage.md), [Vision, effects and sound](r08-vision-effects-sound.md).
- Next job: [Change armour and see the result](p05-change-armour.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
