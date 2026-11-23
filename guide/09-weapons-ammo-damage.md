# Chapter 9: Weapons, Ammo and Damage

This is the longest technical chapter, because damage in Men of War is made of several small systems that work together: a weapon decides how a shell flies, the shell meets armour, the armour decides whether it passes, and then explosions, fire and ammunition add their own effects. We take them in the order a shell experiences them. Terms are explained as they appear and collected in the [glossary](22-glossary.md).

The short ways are on [Change a gun or its ammunition](p04-change-a-gun.md) and [Change armour and see the result](p05-change-armour.md). The full facts for every key are in [Reference 6: Weapons and ammunition](r06-weapons-and-ammunition.md) and [Reference 7: Armour, volumes and damage](r07-armour-volumes-damage.md).

## What you will learn

- The keys of a weapon and of its per-ammunition blocks.
- How spread, accuracy and flight work.
- How penetration is decided, step by step, with a worked example.
- How effective armour thickness, threshold and durability work.
- When a shell ricochets, and how blast, fragments, fire and cook-off work.
- How damage to infantry differs from damage to vehicles.
- How to see and test armour in the ARSENAL window, tune with worked examples, and check your work.

Work in your own mod folder, not in the game folder. Text files use CRLF line endings; the 64-bit build reads every string value as UTF-8, in data files and `.lng` files alike, and identifiers must be plain ASCII. Original data is ASCII outside `;` comments, where some old cp1251 bytes remain; leave them as they are. Paks are zip files. Editors may silently change encoding or line endings when you save. For first principles about armour areas and volumes, read [chapter 6](06-data-keys-entities.md) first. Soldiers are covered in [chapter 8](08-infantry-and-humans.md).

## 1. Weapon keys

A weapon is a stuff file under `set/stuff/` (see chapter 6); a vehicle gun is a `weapon_bullet` that usually starts `from "pattern gun"`. On a vehicle, weapons sit in a [`weaponry`](r06-weapons-and-ammunition.md#weaponry) block made of places. This is the pattern of a vanilla tank:

```
{Weaponry
  {place "gun"
    {weapon "76mm_zis5" filling "ammo bullet76 ap" 1}}
  {place "mgun1"
    {type "mgun_rear"}
    {weapon "dt" filled}
    {gunner "commander"}
    {charger "commander"}}}
```

`filling "ammo bullet76 ap" 1` means: load one round of whatever stuff has all of those tags. `{weapon "dt" filled}` means a full magazine. The first place in the block is the basic one. [`gunner` and `charger`](r06-weapons-and-ammunition.md#gunner-charger-shooter) name the crew seats that aim and reload a place (`gunner` and `charger` by default); without that crew the place cannot be used. `StationaryFiring` lets a place fire only while the unit stands still. Two weapons in one place log `HolderWeapon: set user ... ignored` and the second is not used.

The weapon's own stuff file holds its behaviour. The keys you will touch most:

| Key | Meaning |
|---|---|
| [`rechargeTime`](r06-weapons-and-ammunition.md#rechargetime) | Seconds to reload the magazine; for a gun that holds one shell, the time to load the next. Vehicle crews and soldiers' veterancy change it. |
| [`recoveryTime`](r06-weapons-and-ammunition.md#recoverytime) | Seconds of pause after each shot, such as a bolt cycle. |
| [`range`](r06-weapons-and-ammunition.md#range) | Two numbers in metres: the aim range and the longest range. |
| [`speed`](r06-weapons-and-ammunition.md#speed) | How fast the projectile flies. Vanilla gun presets write half the number given to their `speed` macro. |
| [`gravity`](r06-weapons-and-ammunition.md#gravity) | A multiplier on world gravity (1 when absent). Ignored for rockets. |
| [`reactive`](r06-weapons-and-ammunition.md#reactive) | Set for a rocket: no gravity, a slight wobble. |
| [`AimingTolerance`](r06-weapons-and-ammunition.md#aimingtolerance) | Degrees the barrel may be off target and still fire (10 when absent; vanilla guns use 2). |
| [`calibre`](r06-weapons-and-ammunition.md#calibre) | Millimetres, used by the overmatch rule in section 5. |

The first value of `range` (the aim range) is more important than its name suggests. It is the distance at which the unit opens fire on its own, the scale for the damage curve and the spread function, and a guide for the AI. A longest range with no number means unlimited. Vanilla guns take their ranges from presets such as `range_maximum` (`{range 140 150}`, with shorter ranges for high explosive and APCR shells). The game reads `fireSound` and `reloadSound` as folder-style names, for example `gun/85to100_cal/100mm_d10c`; a wrong name gives silence, not an error.

[`AccuracyByMotion`](r06-weapons-and-ammunition.md#accuracybymotion), written in a weapon place (vanilla tanks get it from a preset), makes accuracy worse while the unit moves or turns. It takes a speed in km/h and a factor for driving, and a turning speed in degrees per second and a factor for turning. Each factor must be at most 1; a larger one logs `Accuracy must be <= 1`. The live value is 1 when the unit is still and falls towards your factor as it moves; spread is divided by that value, so a lower factor means wider spread. A weapon's `SpreadTolerance` is compared with it, so a weapon with a tolerance may hold fire while it moves (unconfirmed).

### In Gates of Hell

<!-- goh: GHKEY-46 GHKEY-47 GHKEY-48 GHKEY-49 GHKEY-51 GHKEY-52 GHKEY-53 GHKEY-54 GHKEY-55 GHKEY-63 GHKEY-05 GHKEY-28 GHKEY-69 GHKEY-70 -->

Gates of Hell reads more weapon keys. The 64-bit game knows none of them and stops on them with `unexpected token`, so a weapon brought from Gates of Hell must lose them (see [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md)).

| Key | What it does in Gates of Hell |
|---|---|
| `FireSoundClose` | A shot sound for your own unit under direct control or in the inner view. It must have the same signal and radius as `fireSound`, or a warning is logged and the plain sound plays. |
| `ClickSound` | The dry click when the weapon is empty or reloading, under direct control only. |
| `AutoReload` | On by default. Off: a soldier under direct control does not reload by himself. The computer always reloads. |
| `FiringTimeout` | Seconds the computer waits after a shot, written `value` or `value +-dev`. |
| `AccuracyByMotionK` | Scales the motion penalty of `AccuracyByMotion`: the spread is divided by ((motion value - 1) times K + 1). 1 by default; 0 removes the penalty. |
| `SyncedProjectiles` | In a multiplayer game the server alone flies the round and the players' copies only show it. |
| `Recoil`, `SwayParams`, special `sway` | The aim kick after each shot and the slow wander of the aim under direct control. |

`from` copies all of these. A weapon place also reads `AimBone` (a second bone that aims, while the shot still leaves from the foresight) and `AI_In_Manual`, and the weaponry block reads `ManualAccuracyZoom`, `TpcInstantAiming`, `AnimatedAiming` and `UseLookatAiming`. `SequentialAim` is off by default in Gates of Hell and on by default in the 64-bit game, so check how the places of a ported unit take turns to aim. Direct control itself is in [chapter 8](08-infantry-and-humans.md#direct-control-and-third-person).

## 2. Ammunition and per-ammunition blocks

Ammunition is `bullet` stuff. Vanilla shells are files such as `set/stuff/shell/bullet75.fg.ammo` that start `from "pattern fg"` or `from "pattern ap"`. The pattern gives the tag line (`ammo shell fg`), and the shell adds its own tags, size and a `damage` list of effects that happen when it explodes.

A weapon can behave differently for each kind of ammunition through [`parameters`](r06-weapons-and-ammunition.md#parameters) blocks. Vanilla guns use them for range and spread, and for a separate damage table for APCR shot (armour piercing with a hard core):

```
{projectileDamage 171}
("damage2" a(171) b(154) c(134) d(117) e(103))
{parameters "apcr"
  ("damage2" a(196) b(174) c(149) d(127) e(108))}
```

A `parameters` block applies when the loaded ammunition's tags contain all of the block's tags. The first matching block in file order wins. If none matches, the weapon's top-level values are used, without an error. The matching is by whole tag word: `apc` does not match `apcbc`. Two blocks with the same tags merge. A top-level key written after a `parameters` block also overwrites that key in every block that still had the default value, so put top-level keys first.

Only some keys may be set per ammunition: `rechargeTime`, `recoveryTime`, `aimRange`, `maxRange`, `range`, `gravity`, `speed`, `spreading`, `curve`, the cursor and crosshair keys, `TraceFreq`, `bullet_view`, the damage keys (`projectileDamage`, `projectileDamageClip`, `projectileDamageThreshold`, `projectileDamageTable`, `healthDamage`, `healthDamageClip`) and the ricochet keys (`RicochetDamageClip`, `RicochetEnergyDamping`, `OvermatchDamping`). Other keys written inside a `parameters` block, such as `calibre`, `aimType`, `burst`, `DisableRicochet` and `ZeroingAccuracy`, apply to the whole weapon, not just that ammunition. This is easy to miss.

Note that the penetration numbers (`projectileDamage`, `projectileDamageTable`, `projectileDamageThreshold`) belong to the weapon file, not to the ammunition file. The ammunition file has its own keys:

- [`detonationThickness`](r06-weapons-and-ammunition.md#detonationthickness) makes the round explode when a plate takes at least that many millimetres out of it. Without it the round never explodes on armour. Vanilla high explosive shells use 2, so any real plate or wall sets them off; rockets use 1. A round stopped this way sends no `pierce` event.
- [`applyProjectile`](r06-weapons-and-ammunition.md#applyprojectile) lets an exploding round also deal its penetrating hit (vanilla rockets use it).
- [`cumulative`](r06-weapons-and-ammunition.md#cumulative-ammunition) is how far, in metres, the jet of a HEAT round (high explosive anti-tank, a shaped charge) reaches past the point of impact.
- `trace` and `view` describe the tracer and the round seen in flight.

The weapon's `calibre` is worked out from its filling tag: a gun with `{filling "bullet100"}` has calibre 100. A weapon whose filling tag has another shape must set `calibre` itself, or the overmatch rule in section 5 uses the wrong number.

[`aimType`](r06-weapons-and-ammunition.md#aimtype) chooses how the gun solves a shot: `direct` aims flat, `curved` lobs a shell like a mortar, and `adaptive` picks between the two like a howitzer. Any other word logs `Unknown aim type`. [`burst`](r06-weapons-and-ammunition.md#burst) sets how many rounds a trigger pull fires (`min`), the burst lengths the AI uses (`short`, `long`), and whether the weapon fires without locking its aim (`noaiming`).

### In Gates of Hell

<!-- goh: GHKEY-56 GHKEY-57 GHKEY-58 GHKEY-50 GHKEY-60 GHKEY-61 GHKEY-59 GHKEY-62 GHKEY-63 GHKEY-66 GHKEY-43 GHKEY-71 -->

A `parameters` block in Gates of Hell takes more keys, and a value written at the weapon's top level reaches every block that does not set its own:

- `MinRange` (metres): the weapon fires only at targets at least that far away.
- `UnlimitedRangeTPC` (on by default): under direct control the longest range does not apply; `MinRange` still does.
- `FiringTimeoutDistanceFactor`: a table that scales the computer's pause after a shot by the distance divided by the aim range.
- `FalloffMeter` and `FalloffStrength` (section 4), `MinimumDamageModifier` (the part health system in the summary), and the three overmatch tables (section 5).
- `ToplayerVignette` names a screen picture for direct control; what it does is not confirmed.
- `aimType nocurve` is a fourth aim type; the 64-bit game logs `Unknown aim type` for it.

The ammunition's tracer can differ by tag: `(Trace "tag1 tag2" (Length n) (View "texture"))`, one look per tag. Do not name the same texture twice inside one `Trace`, or the rest of the block is read out of step with `Block terminator expected!`. The 64-bit game reads one tracer only. A dropped weapon keeps its loaded rounds in a saved mission (`{Item "k98" ... 5}`).

None of these keys are read by the 64-bit game; it stops on them with `unexpected token`. A shell brought over keeps only the keys listed in section 2. See [Reference 6: Gates of Hell only](r06-weapons-and-ammunition.md#gates-of-hell-only).

## 3. Spread and accuracy

Where a round lands is a random point inside a spread circle. The circle is set by the [`spreading`](r06-weapons-and-ammunition.md#spreading) block, which takes an optional base radius and then its keys. Vanilla gun presets write it like this:

```
{Spreading 1
  {SpreadPower 1}}
{spreading
  {radiusTable {0 0} {50 0.33} {90 0.98} {120 1.3} {150 1.63} {250 1.95}}}
```

- `SpreadRadius` is a base radius in metres. `SpreadPower` above 1 pulls more hits towards the centre. `SpreadXYRatio` stretches the circle along the line of fire.
- [`RadiusTable`](r06-weapons-and-ammunition.md#radiustable) is a list of `{distance radius}` points in metres. It beats everything else if present. Next in priority is `RadiusFunction` multiplied by `SpreadRadius`. If neither is present, the radius grows steadily with distance.
- [`BurstAccuracy`](r06-weapons-and-ammunition.md#burstaccuracy) gives a percentage for each round in a burst; the radius is divided by it, so lower numbers make later rounds wilder.
- [`ZeroingAccuracy`](r06-weapons-and-ammunition.md#zeroingaccuracy) lists factors for repeated shots from about the same spot at about the same target; the first shot is always 1, and factors below 1 tighten the spread.

Then the radius is divided by the shooter's accuracy: an aimed special shot's accuracy, or else the `ManualAccuracy` of the weapon block under direct control, then the motion value from `AccuracyByMotion`. A vehicle crew that is under strength or weak widens the result further, and a soldier's weapon skill (chapter 8) makes his shots tighter. Vanilla files wrap most of these in macros (`damage2`, `accuracy_high`, `range_maximum`, `speed`), so when you read a weapon you often find a name instead of numbers. Open the shared `.presets` file in the same folder to see them.

### In Gates of Hell

<!-- goh: GHDMG-52 GHKEY-51 GHKEY-53 GHKEY-54 -->

The spread rules are the same, with two changes. A weapon with unlimited ammunition never spreads in Gates of Hell; in the 64-bit game its spread is worked out for twice the target distance or the aim range, whichever is larger. `AccuracyByMotionK` (section 1) can weaken or remove the motion penalty, and under direct control `Recoil` and `SwayParams` move the aim itself, on top of the spread circle.

## 4. Flight and hits

A round flies in small steps. At each step the game checks which entities lie on that step. Every volume whose `able` block allows bullets is tested, and each volume crossed gives two hits: the entry face and the exit face. All hits, including terrain, are sorted by distance and handled in order: the entry face, then the exit face of the same volume, then the next volume. The exit face is tested with its own thickness, so a round can clear the entry face and still stop inside.

Three events can reach interaction scripts ([chapter 11](11-interaction-scripts.md)):

- `bullet_hit` happens once per entity per step, for the first volume hit, before the penetration test.
- `pierce` happens only for an entry hit that passed and did not stop the round. High explosive shells never send it.
- `break_armor` happens when an armour area is used up (section 6).

A failed penetration sends only `bullet_hit`. Scripts never see how far the round was over or under the needed penetration: a round that barely passed and one that passed with plenty to spare give the same event. That is why vanilla scripts choose their reaction from the shell's class tag (such as `shell_big`), not from the margin.

The side that was hit (front, side, rear, top) is stored in each face of the volume model, as chapter 6 explained; it is not worked out from the direction of the shot. The slope of the hit is worked out from the angle between the round's direction and the face: the slope factor is one divided by the cosine of that angle, never more than 10. Because the face comes from the real model triangle, your model's geometry changes the slope.

### In Gates of Hell

<!-- goh: GHDMG-26 GHKEY-61 GHDMG-11 GHDMG-14 GHDMG-15 GHDMG-16 GHDMG-51 GHKEY-52 -->

- **Drop at long range.** `FalloffMeter` (metres) and `FalloffStrength` make a round dive after it has flown that far: past the mark, its gravity grows with the square of the extra distance. With no `FalloffStrength` there is no extra drop, which is also how the 64-bit game behaves.
- **One hit per part per step.** A part made of several volumes is hit only once per step, by its nearest volume. The 64-bit game tests every volume crossed, with an entry and an exit face each, so layered volumes of one part stop more there.
- **Distance.** The damage curve is read at the hit point, not at the start of the step, so a long step gives slightly less damage than in the 64-bit game.
- **`pierce`** happens only when the round enters a volume. A shot that starts inside a volume (point blank) sends none.
- **Own vehicle.** A soldier firing from a vehicle never hits that vehicle.
- **Curved fire.** A fault in the path of curved shots is fixed, so curved shells land closer to the aim point. Whether the 64-bit game has the same fault is not confirmed.
- **Multiplayer.** With `SyncedProjectiles` (section 1) only the server's round can hit.

## 5. Penetration test, step by step

Here is the full path a round takes through one plate. Distances are in metres as the game counts them (the same scale as `range`); penetration and thickness are in millimetres of steel. The game follows the same order every time and there is no dice roll; see [How penetration is worked out](r06-weapons-and-ammunition.md#how-penetration-is-worked-out).

**Step 1: penetration at distance.** The penetration is read from the weapon's [`projectileDamageTable`](r06-weapons-and-ammunition.md#projectiledamagetable) (the block that matches the ammunition, or the top-level one) at the distance flown. The table is a list of `{distance penetration}` points; between points the value is a straight line, and outside the first and last points it stays at that point's value. Vanilla gun tables run from 10 to 175 or 200 and end with a point at 0, so penetration falls to nothing at the end. If your table stops early on a high value, every longer shot keeps that value. If there is no table, penetration is `projectileDamage` times the curve named by `curve` (from `set/ballistics.set`) at the distance divided by the aim range.

That number is multiplied by the round's remaining energy, which starts at 1 and falls each time the round passes a plate or ricochets.

**Step 2: thickness of the plate.** The plate thickness for the side that was hit comes from the first armour area that covers the volume, if that area gives a number other than 0 for that side; otherwise from the volume's own `{thickness}` (chapter 6 and [thickness (area)](r07-armour-volumes-damage.md#thickness-area)). Left and right both use the area's side value, and the bottom uses its top value.

**Step 3: effective thickness.** Slope makes plates thicker:

```
effective = ((slope - 1) * f + 1) * thickness
f = clamp( thickness / calibre * overmatchScale , 0.2 , 1.0 )
```

The factor `f` is the overmatch term. When the gun's calibre is large compared to the plate, `f` is small, and the slope bonus shrinks to as little as 20 percent: a big shell punches through a thin plate whatever the angle. `overmatchScale` comes from the gun's [`OvermatchDamping`](r06-weapons-and-ammunition.md#overmatchdamping) table by angle; the vanilla gun pattern goes up to 6 at 90 degrees. The table should reach 90 degrees, because beyond its last point the scale falls back to 1.0. Areas set to `whole_wound` (vanilla tracks and wheels) or `ray_cast_thickness` (vanilla buildings) ignore slope.

**Step 4: pass test.** The round passes if its penetration is at least the effective thickness. The only random parts of a hit are the spread, the ricochet chance and chances inside scripts.

**Step 5: after the test.** The plate takes `min(effective thickness, penetration)` out of the round. If that is at least the ammunition's `detonationThickness`, the round stops and explodes. Otherwise, after a pass, the round goes on with its energy lowered by the amount taken divided by its penetration.

**Worked example.** A gun with calibre 75 fires a round with penetration 100 mm at the distance of the hit. It strikes a turret plate of 80 mm at a slope factor of 1.5 (about 48 degrees off the face's normal), and the gun's `OvermatchDamping` gives 1.0 at that angle. Overmatch is 80 / 75 times 1.0, which is 1.07, clamped to 1.0. Effective thickness is ((1.5 - 1) times 1.0 + 1) times 80, which is 120. 100 is less than 120, so the round fails. At a flatter hit with slope 1.2, effective thickness is (0.2 times 1.0 + 1) times 80, which is 96; 100 is at least 96, so it passes. The plate takes 96 out of it, and the energy falls from 1 by 96 / 100 to 0.04, so the round has almost nothing left for anything behind the plate.

### In Gates of Hell

<!-- goh: GHDMG-27 GHKEY-59 GHDMG-37 GHDMG-38 GHDMG-39 GHDMG-53 GHDMG-40 GHDMG-17 -->

Steps 1, 2, 4 and 5 are the same. Step 3 has more factors:

```
effective = overmatch * thickness * flaw * castSteel * hardness
```

- **Overmatch.** Each ammunition block may carry one of four tables by angle, and the first one present wins: `OvermatchCalibre {angle x y}` gives max(1, x times (thickness / calibre) to the power y); `OvermatchFixed {angle v}` gives max(1, v); `OvermatchSlope {angle v}` gives max(1, v times the slope factor); `OvermatchDamping` is the rule of step 3 above, with its 0.2 to 1.0 clamp. The new three have no upper clamp: the Gates of Hell bazooka's `OvermatchSlope {0 1} {60 2} {90 99}` makes a grazing hit nearly impossible. Their points are kept in the order written, not sorted, so write them once and in rising angle. Angles are whole degrees.
- **Flaw.** A volume's `Quality` word (`small_flaw`, `medium_flaw`, `large_flaw`) gives a factor from the angle and from thickness / calibre, never above 1. Any other word, or none, gives 1.
- **Cast steel.** A volume's `CastSteel cs` gives min(1, cs + 0.001238 thickness - 0.0002628 calibre + 0.02706 thickness / calibre). A value of 0 or below logs `Cast steel value can't be below 0!`.
- **Hardness.** A volume flagged `HighHardness` takes a factor from the calibre, thickness / calibre and a Brinell hardness by thickness from `set/damage.set` (vanilla: 450 up to 40 mm, 360 to 60, 340 to 80, 300 above). A thin hard plate holds well against small calibres and badly against large ones.
- **Threshold** is worked out as in section 6 (two thirds of the effective thickness when nothing else is set).
- Areas that measure thickness by casting a ray (`ray_cast_thickness`) start the ray just outside the volume, so their thickness can differ a little.

The 64-bit game refuses all three volume words and reads only `OvermatchDamping`, so a ported vehicle and its guns lose the rest. Flaw, cast steel and hardness only ever make a plate weaker, so the same plate is stronger after the port; the overmatch tables could make it stronger in Gates of Hell, and that is lost. Fire the ported unit's guns at it with the armour tools of section 11 and adjust the thickness by hand. See [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

## 6. Armour thickness, threshold and durability

Whether the round passes is only half the story. The armour area can also be damaged. Each area keeps a damage total, and it is used up (breaks) when the total reaches 1.0; then the `break_armor` event runs.

- [**Threshold**](r07-armour-volumes-damage.md#threshold) is the least energy that damages the area at all. The game takes, in this order: the area's `threshold {pierce {value}}`; else `koef` times the effective thickness; else the effective thickness divided by the weapon's `projectileDamageThreshold`; else two thirds of the effective thickness. `projectileDamageThreshold` cannot be below 1; vanilla gun presets set 1.10 to 1.30 by gun size.
- A round damages the area when its energy reaches the threshold, even if it did not pass. If the area has `threshold {pierce {calibre N}}`, rounds of a smaller calibre never damage it, which is how skirts and buildings ignore small arms.
- [**Durability**](r07-armour-volumes-damage.md#durability) is the area's total capacity: `value`, else `koef` times the thickness, else the thickness times the material's durability from `set/material.set`.
- **Damage per hit** is about how far the energy is above the threshold, scaled by the effective thickness and divided by the durability, with at least half the thickness counted for every damaging hit.

Vanilla tanks get their areas from the `armor_tank` macro in `properties/tank_unarmed.ext`, which gives the hull and turret `{durability {pierce {koef 999}}}` through its `pierce_dur(999)` argument. Armour-piercing rounds practically never break such an area; only blast does. So what happens to vanilla tanks after a penetration comes from interaction scripts, not from plate wear. If you want armour-piercing rounds to wear armour down, lower that number. Vanilla AS2 has only these macros for tanks (`armor_light`, `armor_medium`, `armor_heavy` through `armor_tank`, plus `armor_mantlet`, `armor_engine` and `shield`); there are no separate upper and lower plate macros. A unit calls one with its numbers, for example `("armor_heavy" turret(75 75 60 35) body(100 75 75 40))`, in the order front, side, rear, top. Change those arguments in your copy of the unit, never the shared macro file. See [Armour macros in vanilla data](r07-armour-volumes-damage.md#armour-macros-in-vanilla-data).

### In Gates of Hell

<!-- goh: GHDMG-41 GHDMG-40 GHDMG-13 GHDMG-43 -->

Armour never wears in Gates of Hell. `durability` blocks are read but do nothing, there is no damage total, and a plate never breaks, so `pierce_dur` and similar settings have no effect there. The threshold is worked out as here. `break_armor` still runs, but only when a round passes; its value is the energy the round still has.

Parts are no longer broken by broken armour either. Instead each vehicle part has health that hits take away; see [Vehicle part health](#vehicle-part-health) in the summary. A unit ported to the 64-bit game has no part health, so what killed or crippled it in Gates of Hell must come from armour wear and its interaction scripts here.

## 7. Ricochet

A ricochet is considered only after a penetration fails; there is no ricochet roll before the pass test. The game takes the grazing angle, which is 90 degrees minus the angle to the face's normal (so 0 is a round skimming along the plate), and then:

- The round does not ricochet if the gun has `DisableRicochet`, if it has already ricocheted twice, if the angle is past the last point of the material's chance table, if the ammunition is tagged `fg` or `no_ricochet`, if the plate's area broke on that hit, or if a random roll beats the material's chance.
- Otherwise a new round is made, with its energy multiplied by the gun's [`RicochetEnergyDamping`](r06-weapons-and-ammunition.md#ricochetenergydamping) for that angle (the vanilla gun pattern: 1 up to 20 degrees, 0.8 at 30, 0.4 at 45, 0 at 60), or by a factor from the material if the gun has no table. The new round may hit something else.

The chance table lives in `set/material.set` ([ricochet](r07-armour-volumes-damage.md#ricochet)). For vanilla steel the chance is 1 up to 15 degrees of grazing, 0.6 at 30, 0.3 at 45, 0.15 at 60, and 0 at 75 and 90. A mod's own `material.set` replaces the whole file, so keep every vanilla material in it. A log line `Invalid ricochet angle` is harmless. Ground hits use the same rules with the terrain's material, unless the round is tagged `fg` or `no_ricochet`, in which case it explodes. On water, only `fg` rounds explode.

### In Gates of Hell

<!-- goh: GHVIS-103 -->

Ricochet follows the same rules and values. Only the look differs: a ricochet's tracer is longer in Gates of Hell, because its length follows the speed the round keeps rather than the square of it.

## 8. Blast and fragments

An explosion is a [`blastwave`](r06-weapons-and-ammunition.md#blastwave) effect with an energy and two radii in metres:

```
{damage blastwave {energy 4} {area 0.2 0.5}}
{damage add blastwave {energy 1.2} {area 4.3 7.3}}
```

Inside the inner radius a target takes the full energy; between the radii it falls in a straight line to nothing. The blast does not fall off with the distance the shell flew, only with the distance from the explosion. Only `energy` and `area` are valid inside the block. A plain `damage blastwave` replaces the first blast layer the item already has; `damage add blastwave` adds a layer.

The distance is measured to where the ray from the explosion enters the target volume, not to the entity's centre. Every volume whose `able` block allows blast is a target. Volumes are taken in order along each ray, and each takes what is left: anything behind a volume that does not break sees nothing, so walls and hills shield only if they have blast-able volumes. Blast travels at 15 m/s, so far targets are hurt a moment later.

Fragments are not simulated. A "fragment" effect is just a second, wider, weaker blast layer. Vanilla AS2 shell presets in `set/stuff/shell/.presets` have three macros, each called with a filler value `v` set by hand for the shell (`("fg" args 3.5)` for a 75 mm shell):

| Macro | Layers | Used for |
|---|---|---|
| `fg` | anti-tank 1.15v at 0.2 to 0.5 m; anti-personnel 1.2 at a radius that grows with v | most shells |
| `fg_medium` | the same, with a slightly wider anti-personnel ring | about 89 to 128 mm |
| `fg_heavy` | anti-tank v at 0.3 to 1.2 m; v/5 at 5.5 to 6 m; 1.2 at 8 to 16 m | 150 to 155 mm |

Some shells add a layer of their own after the macro, as the vanilla 100 mm high explosive shell does.

Blast against armour works on five times the energy written in the data. If five times the energy is below the area's blast threshold, nothing happens. Above it, five times the energy divided by the area's blast durability is added to its damage, and the area breaks at 1.0, so repeated high explosive hits wear armour down. The value passed to `break_armor` is also five times the energy, while `blast` and `blast_hit` scripts see the energy as written. The scripts of vanilla tanks react to `break_armor`: breaking the body area can kill crew or set off ammunition, for instance.

### In Gates of Hell

<!-- goh: GHDMG-42 GHDMG-43 GHDMG-44 GHDMG-45 GHDMG-46 GHDMG-54 GHDMG-19 GHDMG-49 -->

- **Shielding.** A volume keeps at most its blast threshold of the energy and passes the rest to what lies behind it. In the 64-bit game an unbroken volume keeps all of it, so in Gates of Hell blasts reach further through soldiers and thin cover.
- **`break_armor`** after a blast gets the threshold (the energy the volume kept), not five times the energy.
- **New events and actions** for scripts: `blast_wreaked` (a blast got past a volume's threshold), with the actions `blast_wreaked_effect`, `blast_hit_effect` (first hit on the entity) and `blast_effect` (each part). Vanilla Gates of Hell hangs the blast loss of part health on `blast_wreaked`, for cars and trucks only (see [Vehicle part health](#vehicle-part-health)).
- **Keys.** A blast layer also reads `ground_interaction_radius` (1 by default), which scales the ground effect where the round lands. `no_ground_interaction` is accepted and ignored. A second radius smaller than the first is an error.
- **Ground.** The ground test runs a little above the ground at both ends, so fewer blasts are stopped by the ground by mistake.
- **Once.** An item can detonate only once, and a charge lying at rest blasts along its main axis instead of straight up.

## 9. Fire and cook-off

A fire effect creates a hot sphere:

```
{damage fire {radius 4} {heating 0.5} {time 20}}
```

Entities inside heat up, allies at a fifth of the rate. An entity ignites when its heat passes 1.0, and how fast that happens is set by its `inflammation_time` (seconds, in its interaction file). An entity with no `inflammation_time` never ignites. Vanilla uses 0.25 s for soldiers, 20 s for vehicles, 30 s for a medium tank and 35 s for a heavy tank. Fire spreads only through new fire areas that burning things create, and fire on water ground goes out at once.

Cook-off is ammunition exploding inside a vehicle. The game adds up the blast energy of everything the vehicle carries, counting every blast layer of every item, armour-piercing rounds included; that sum is the vehicle's explosive amount. Vanilla scripts compare it with a cap per class (about 250 for light, 290 to 300 for medium and 340 to 360 for heavy tanks) to decide the odds of the ammunition going up. Two lessons follow. If you edit any blast layer of an ammunition item, the cook-off odds of every vehicle that carries it change. And if you change a vehicle's load, keep the total roughly the same. In vanilla scripts a cook-off kills the whole crew a fifth of the time and otherwise forces them out, and a full explosion can tear off the turret.

### In Gates of Hell

<!-- goh: GHDMG-18 GHDMG-47 GHDMG-48 GHDMG-28 -->

- **Heat does not add up over a battle.** A heated entity starts to cool 0.2 seconds after the last heat reaches it, so short bursts of flame do not build up to a fire as they can in the 64-bit game. It still catches fire when its heat passes 1.0, at a rate set by `inflammation_time`.
- **Fire that follows.** A fire effect can take `follow <entity id>`: the fire moves with that entity and goes out when the entity is gone. The 64-bit game does not read the key.
- **Water.** A fire goes out on water only when its whole sphere is below the surface, so a fire on the shore keeps burning.
- **Kill credit.** Every unit, vehicles too, records who last damaged it, so a vehicle that burns out or cooks off later counts for the shooter. In the 64-bit game only soldiers keep that record.

How Gates of Hell works out cook-off is not covered in this book.

## 10. Damage to infantry

Soldiers take damage in two ways. A direct hit uses the weapon's [`healthDamage`](r06-weapons-and-ammunition.md#healthdamage): each hit does that damage times the round's remaining energy, less the `pierceAbsorb` of any armour the soldier wears on that spot (never below zero), times a factor for distance. Hits closer than 5 m skip the difficulty scaling.

Blast works through scripts. In the vanilla soldier scripts, a blast layer that reaches the soldier with more than 0.59 energy deals a flat 200, 250 or 300 points (more than a soldier's health), a layer above 3.5 tears the body apart, and weaker layers only start bleeding or knock him about. On top of that, a computer-controlled soldier takes 200 times the energy as health damage; a player-controlled one takes far less, so the same shell kills computer and player soldiers at different radii. Lying and cover shrink the distance the blast sees: crouching multiplies it by 1.15, lying by 1.25, cover by 1.5, and prepared positions by 1.75 (lying) and 2.0 (cover).

### In Gates of Hell

<!-- goh: GHDMG-21 GHDMG-22 GHDMG-23 GHDMG-24 GHDMG-30 GHDMG-31 GHDMG-32 GHDMG-33 GHDMG-34 GHDMG-35 GHDMG-12 -->

- **Damage by body part.** The soldier's `vitality` block can hold `Damage {"volume" factor}` lines, one factor per hit volume (1 when a volume is not listed), `DamageTPC` with the same form for hits from a shooter under direct control, and `DamageBlast`, one factor for all blast damage. This is how a head shot is made to hurt more than an arm shot. The 64-bit game has none of these keys; remove them when you port a soldier.
- **Blast on soldiers.** Every soldier, computer-controlled or not, takes blast damage from the `blast_to_health_scale` table in `set/damage.set`, times 125, times the difficulty's `translate_damage`. With the vanilla value 5 that is at most 562.5 per hit. The 64-bit game uses the table only for player-controlled soldiers and gives computer soldiers 200 times the energy, so blast radii against the computer change when you port.
- **`set/damage.set`** also holds the hardness table of section 5 and the energy units (`energy_per_projective` 1, `energy_per_health` 0.025, `energy_per_blastwave` 5). Its `projective_health_scale` table is not used. Without the file the blast table is empty and blasts do no health damage, so a mod that changes it ships the whole file.
- **Cover and lying** against bullets come from the difficulty settings: a damage factor and a chance to be hit at all, for a soldier in cover and for one crawling. A failed roll means no damage.
- **Difficulty settings are numbered differently**, so difficulty files from Assault Squad 2 change the wrong values in Gates of Hell.
- **HEAT and soldiers.** A round tagged `rocketlauncher`, `heat`, `atgm` or `fg` that hits a soldier starts no shaped charge jet, so it does not go on through him.
- **Hit effects.** A short `effects` list is filled up with empty entries; the 64-bit game logs `Throw effects not loaded` instead.

## 11. Seeing and testing armour in the ARSENAL window

ARSENAL has three ways to look at a vehicle's armour and fire at it without starting the game: the **Armor** tab of the **Models** page (tab Models & Sim), the **Shot** tool in the Models page's 3D view, and the `armorsim` command. All three follow the rules of sections 4 to 10 and read the vehicle with your mod laid over the game. They are the penetration checker of this guide. The Armor tab and the Shot tool work for MoW:AS2 and AS64 only; under GoH the Models page shows a line in their place. The short way is on [Change armour and see the result](p05-change-armour.md); the window itself is described in [chapter 19](19-toolchain.md#models--sim-all-games).

### The thickness table

- The **Models** page has an **Armor** tab ("Armour: thickness, map and shot test"). Its "Thickness of each part" table shows every hit volume of a vehicle with your mod laid over the game: a number for each of the six sides, and a note saying whether the number was "set on the part itself", came "from the armour area" (and which), or has "no value: 0 mm". "Where each number comes from (file and line)" gives the file and line of every value. See [The armour table on the Models page](r07-armour-volumes-damage.md#the-armour-table-on-the-models-page).
- Some rows carry a flag: "not in the model, so it is never hit" (a volume in the unit's file with no shape in the model), "never hit by shells: switched off in the unit file", the `ram` volume ("the game uses it only for ramming and switches it off when the unit appears"), and "thickness is measured along the shell's path, the slope is not added" for areas that ignore slope (section 5).
- Click a number to change it. The edit box asks for the "New thickness" and "Which sides" ("only the" side you clicked or "all six sides"); "Try it" shows the result first and "Change it" writes. The unit's file is copied into your mod first, and nothing is written into the game folder. A number shared with other parts says "This number is shared with other parts." and lists them; "Change all of them" changes it for every one. A number that comes from an armour area is changed in the area or in the macro call (section 6).
- The **Volumes** tab of the same page sets the same thickness per side on the part itself, with its tags, part and material ([chapter 6](06-data-keys-entities.md#5-volumes)).

### Who shoots, the map and the shot test

- Under "Who shoots", "Search for a gun", pick a "Shell" the gun fires, and set a "Range" (0 to 5000 m). The page says "This shell goes through ... mm of flat armour at ... m." If the gun does not load the shell you picked, a warning says so and names the shells it does load; the shot is still fired, so you can test a shell a gun is not given in the game.
- "What happens across the whole side" fires a grid of straight, parallel shots from one side ("Shoot from" Front, Rear, Left, Right or Top) and colours each spot by what happens there: goes through, bounces off, stops, no armour in the way, or reached by a blast. "Colour by" switches to "thickness on the slope (mm)". A line under the map says what share of the shots that hit armour go through. Point at the map to see what is there; click to shoot through that spot.
- A click on a part in the 3D view, or on a spot of the map, runs the **Shot test**. It lists each plate the shell meets in order, with the part, the side, the thickness, the angle, the thickness on the slope, how many millimetres the shell can still do, and what happens: goes through, bounces off, stops in the plate, blows up in the plate, spent before it gets there, the jet does not reach, passes, nothing armoured, or misses.

### Behind the armour

Under the shot test, the **Behind the armour** panel follows the shot past the plates: "What the shot does to the parts, the crew and the tank as a whole." It follows the game's rules and the unit's own interaction scripts ([chapter 11](11-interaction-scripts.md)), from your mod first and from the game where the mod changes nothing.

- "The tank as a whole" gives the chance of each outcome and when it happens: cannot move, cannot shoot, the crew leaves, crew dead, burns, explodes, out of action. "By part of the vehicle" shows each part (hull, turret, gun, engine, tracks, wheels, fuel, ammunition, the crew and each crew member) as works, damaged, broken, destroyed, dead or off. "What happens, by cause" says which event or script line led to each result.
- "Blasts" lists each blast that reached the vehicle with its charge, the radius of full force and the radius it reaches. "Shaped charge jet behind the armour" shows how far a HEAT jet went and what it reached. "Fire from the shell" gives the fire's radius, heat and burning time and how many seconds the unit needs in the flames to catch fire. "Tags added" lists the tags the scripts set.
- The crew notes are part of the rules: the game itself does not hurt the crew through the vehicle's armour, neither from the shell nor from a jet, so crew losses come only from the unit's scripts. A blast hurts no crew through the vehicle either; a soldier on a seat with his own bone is a separate unit, so a blast can reach him.
- The chances come from many repeated runs of the same shot, and the panel says how many. The flight after a ricochet is not followed. "Script words that were skipped, so the result may miss something" lists script parts the panel could not follow, and "The scripts also ask about things the shot does not say" lists questions the scripts ask that one shot cannot answer. Read both before you trust a number.
- Options: "Keep the damage of earlier shots" fires the next shot at the damaged vehicle, and "Fresh tank" starts again. "Without the mod" runs the shot on the game's own files only, to compare. "Follow for (s)" sets how many seconds after the hit the scripts are followed (1 to 600; empty means 120). "Show every script step" lists each step. "Open" opens the file of a result in the Editor at its line; a value read from a game pak opens the copy the game loads.
- After you change a thickness, the panel shows the result before the edit next to the new one, and lists what no longer happens.
- A line at the end says which files were used: the open model with unsaved changes, the saved files of the mod and the game, or the game's files only.

### The Shot tool in the 3D view

On the **Model** tab of the Models page, the **Shot** button sits beside Select, Move, Rotate and Scale above the 3D view. It needs the model opened for editing, because the shot uses the open model with its changes.

- Pick the gun ("Search guns"), the "Shell" and the "Range". "Shoot from" is front, rear, left, right, top, an "Azimuth" (-360 to 360) and "Elevation" (-90 to 90), or "the camera".
- While Shot is on, a click on the model shoots at that point. With "the camera", the shell flies along the line from the camera through the point you click. "Range" then sets only the shell's force, not where it starts. "Aim at" with a volume and **Shoot** sends the shell at the middle of that volume.
- The result shows where the shell ends and what happens to the whole tank, in the same words as Behind the armour. Switches in the view show the shot result and put labels on blasts, jets and fires; "Volume names" labels the parts.
- When you change the model, the last shot is run again and the result before the change is shown with it. With "Keep the damage of earlier shots" on, it is not run again; press "Fresh tank" first.

### The same from the command line

```
ARSENAL armorsim table <unit>
ARSENAL armorsim shot <unit> --weapon "<gun>" --ammo "<ammo tags>" --range 500 --from 0,0
ARSENAL armorsim map <unit> --weapon "<gun>" --ammo "<ammo tags>" --range 500 --view front
ARSENAL armorsim effects <unit> --weapon "<gun>" --ammo "<ammo tags>" --range 500 --from 0,0
ARSENAL armorsim edit <unit> --volume <name> --side front --mm 60 --out <mod folder> --dry
```

- `table` is the thickness table, `shot` one shot, `map` a whole side and `effects` the Behind the armour result. `--from az,el` gives the direction: 0 is straight from the front, 90 from the left side, and the elevation is upwards. `--aim-volume <name>` aims at the middle of a part.
- `effects` repeats the shot 400 times by default (`--samples`), with a fixed `--seed`, and follows the scripts for 120 s (`--until`). `--explosive <amount>` and `--shooter "<tags>"` answer two things scripts often ask: the vehicle's explosive amount (section 9) and the tags of the shooter.
- `edit` is the only one that writes; drop `--dry` to write, and add `--shared` for a number shared with other parts. `--folder <mod folder>` reads your mod over the game, and a mod's own paks are read too. See [chapter 19](19-toolchain.md#armorsim-the-armour-simulator).

### What none of these show

They use the model's rest pose and straight shots with no gun spread, so a turret turned to the side or a shot that scatters is not seen. Single-player difficulty is not applied. The scripts are followed as written but not run by the game, so check a result that matters with a few shots in a skirmish and read `game.log` (section 13).

### The Balance page

The **Balance** page shows every buy-panel unit as one row, including its gun, its penetration at 100 m, its damage and its reload time, and changes many at once. A reload change is written into the gun file, so every unit that carries the same gun changes with it. See [chapter 17](17-balance-pricing-gameplay.md).

For a whole guided change of a gun, a shell or a vehicle's armour, the Quick Guided Task has recipes that ask one question at a time; see [Use the Quick Guided Task](p17-quick-guided-task.md).

### In Gates of Hell

<!-- goh: GHDMG-37 GHDMG-41 GHDMG-01 -->

The armour tools of the Models page and `armorsim` follow the Assault Squad 2 rules only, and under the GoH button they are not available. They do not know the Gates of Hell factors of section 5, armour that never wears, or part health, so do not use them to judge a Gates of Hell unit in Gates of Hell. When ARSENAL runs for Gates of Hell, the Units sub-tab also holds the GoH unit page, with its fold Translate numbers ([chapter 19](19-toolchain.md#units--balance-under-goh)); use it to bring a unit over, then test the result here with the tools above.

## 12. Worked tuning examples

**Example 1: make a gun hit harder at long range.** In your copy of the gun file, the vanilla `damage2` macro writes the table `{10 a} {50 b} {75 c} {100 d} {125 e} {150 0.8e} {200 0}`. Give larger values for the far points, for example `("damage2" a(171) b(160) c(145) d(130) e(118))` instead of `b(154) c(134) d(117) e(103)`. Check the result in the Balance page or with `ARSENAL statsheet` (section 13). Keep a last point at 0 or at a realistic value, since values beyond the last point do not drop.

**Example 2: make high explosive shells less deadly to tanks.** Copy `set/stuff/shell/bullet75.fg.ammo` into the same path in your mod and replace only the first blast layer after the macro. A plain `damage blastwave` replaces the first layer and leaves the anti-personnel layer alone:

```
{from "pattern fg"
  {tag "size_small"}
  {inventory {size 5 1}}
  ("fg" args 3.5)
  {damage blastwave {energy 3} {area 0.2 0.5}}
  {mass 12}
  {entity "shell_fg_75"}}
```

Do not write two plain `damage blastwave` lines; only the second would survive. Also remember cook-off: lowering this energy lowers the explosive amount of every vehicle that carries the shell.

**Example 3: stop thin skirts being damaged by rifles.** In your copy of the vehicle, after its `("shield" args 25)` call, add a setting with the same area name; it merges into the area the macro made:

```
{armor
  {setting "shield" {threshold {pierce {calibre 20}}}}}
```

Rounds under 20 mm calibre no longer damage the skirts. This does not stop a round from passing; it only stops wear on the area.

## 13. Checking your work

```
ARSENAL statsheet <game folder> --mods mymod --sheet weapons,ammo,armor
ARSENAL statsheet <game folder> --mods mymod --scope mod
```

The first command prints tables of damage, penetration, armour and prices. The second runs only the checks on your mod's data: armour values that an area hides, `parameters` blocks that can never match, damage tables that do not end at 0, blast layers that a plain `damage blastwave` replaced, perk levels that are not declared, areas defined twice, and split parts flattened by a macro value. Single-key changes can be made with `ARSENAL patch-entity` and `--dry-run`. Then fire at the vehicle in game and read `game.log`. See [chapter 17](17-balance-pricing-gameplay.md) for balancing and [chapter 19](19-toolchain.md) for the tools.

`ARSENAL fix` writes, in a separate patch mod, some values the way the game already reads them: a `projectileDamageThreshold` below 1 becomes 1, the earlier copy of a key written twice and a stray `)` are emptied, and a ricochet angle row whose second angle is larger than the first gets the value the game already uses; see [chapter 19](19-toolchain.md#fix-a-patch-mod-for-common-problems). Before you trust any armour change, run the shot test and Behind the armour of section 11 on it, then confirm a few shots in a skirmish.

See also: [Change a gun or its ammunition](p04-change-a-gun.md), [Change armour and see the result](p05-change-armour.md), [Check, fix and read the log](p14-check-fix-read-log.md), [chapter 21, armour and damage surprises](21-troubleshooting.md#9-symptom-armor-and-damage-surprises).

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. Weapon keys | [differs](#in-gates-of-hell) | recoil, sway, AI pause, click and close sounds, synced rounds; the 64-bit game refuses them |
| 2. Ammunition and per-ammunition blocks | [differs](#in-gates-of-hell-1) | `MinRange`, unlimited range under direct control, tracers by tag |
| 3. Spread and accuracy | [differs](#in-gates-of-hell-2) | unlimited ammunition never spreads; motion penalty can be scaled |
| 4. Flight and hits | [differs](#in-gates-of-hell-3) | long-range drop; one hit per part per step |
| 5. Penetration test | [differs](#in-gates-of-hell-4) | four overmatch tables; flaw, cast steel and hardness factors |
| 6. Thickness, threshold and durability | [differs](#in-gates-of-hell-5) | no armour wear; parts have health instead |
| 7. Ricochet | [differs](#in-gates-of-hell-6) | same rules; longer ricochet tracer |
| 8. Blast and fragments | [differs](#in-gates-of-hell-7) | volumes keep only their threshold; new blast events |
| 9. Fire and cook-off | [differs](#in-gates-of-hell-8) | heat cools quickly; fire can follow a unit; cook-off not covered |
| 10. Damage to infantry | [differs](#in-gates-of-hell-9) | damage by body part; one blast rule for every soldier |
| 11. The ARSENAL window | [differs](#in-gates-of-hell-10) | armour tools follow the 64-bit game only |
| 12. Worked tuning examples | not mapped | the examples are for the 64-bit game |
| 13. Checking your work | same as far as mapped | the checks read the 64-bit game's rules |

### Vehicle part health

<!-- goh: GHDMG-01 GHDMG-02 GHDMG-03 GHDMG-04 GHDMG-05 GHDMG-06 GHDMG-07 GHDMG-09 GHDMG-10 GHDMG-25 GHDMG-49 GHDMG-50 GHKEY-24 GHKEY-60 -->

Gates of Hell gives every vehicle part (hull, turret, engine, gun, tracks, wheels and so on) health points. The 64-bit game has no such thing: a part there is only working, broken or destroyed.

- `set/component.set` lists categories: `{category "name" {hp N} {hp_broken N} {armor_damage_modifier f}}`. Vanilla values include `tank_light` 250, `tank_medium` 325 and `tank_heavy` 400, turrets 150, 200 and 250, engines 125, 200 and 250, guns 150, 200 and 225, tracks 100, 120 and 200, and a wheel 100, with `armor_damage_modifier` 0.1.
- A vehicle's `perks` block gives each part its numbers: `{perks {component "turret" {category "turret_medium"}} {blastwave_modifier 1}}`. Put `{category}` first, because it copies the whole record and later `{health {hp N} {hp_broken N}}` or `{armor_damage_modifier f}` lines change it. An unknown category logs `Invalid component category: <name>`. A part can also be matched by tag (`{component tag "t" ...}`), but when two tag rules match, the winner is not the first in the file, so name each part.
- A penetrating hit takes (penetration - effective thickness) times the part's `armor_damage_modifier`, plus the ammunition's `MinimumDamageModifier`. Damage comes off `hp` first; at 0 the part is broken, and the rest comes off `hp_broken`; at 0 the part is destroyed. With `hp_broken` 0 a part is never destroyed by damage.
- A part with no perk has 1 hp: the first damaging hit breaks it, and it is never destroyed.
- A destroyed part runs the reaction `destroy` (the 64-bit game runs `break` for both states). Destroying the part `body` marks the vehicle `destroyed`, so a vehicle needs a part named `body`.
- Blast takes (5 times the energy - the threshold) times the vehicle's `blastwave_modifier`. Vanilla Gates of Hell uses this for cars and trucks only.
- A repair takes the part's repair time times the share of health lost.
- The console variable `dbg_damage` prints each loss as `hp = a -> b`.
- Saved missions keep `Health`, `HealthBroken` and `RepairOrder` in each part; the 64-bit game stops on those keys.

A ported vehicle loses all of this. Its toughness must come from armour, armour wear (section 6) and its interaction scripts, and the tools of section 11 show the result.

## Pitfalls

- A `parameters "tags"` block must match whole tag words, first match in file order; a miss silently uses the top-level values.
- Keys such as `calibre` or `DisableRicochet` inside a `parameters` block apply to the whole weapon.
- Penetration keys belong in the weapon file, not the ammunition file.
- A damage table is held flat beyond its ends; end it with a realistic last point.
- `OvermatchDamping` should reach 90 degrees.
- A nonzero area value overrides the volume's own thickness for that side, and flattens a part split into several volumes.
- Three numbers in an area `thickness` misalign the sides; write 1, 2 or 4.
- Two plain `damage blastwave` lines keep only the last one.
- A volume that cannot be hit by blast shields nothing; an unbroken one shields everything behind it.
- Blast against computer and player soldiers differs.
- A script block whose tag contains `#`, such as `{##on blast`, is skipped entirely.
- The penetration margin is not available to scripts.
- Ricochet needs a failed penetration first, and happens at most twice per round.
- A mod's `material.set` replaces the whole vanilla file.
- Editing an ammunition blast layer changes the cook-off odds of every vehicle that carries it.

Next: [AI and bots](10-ai-and-bots.md).
