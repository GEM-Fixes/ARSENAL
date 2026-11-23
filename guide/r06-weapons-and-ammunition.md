# Reference 6: Weapons and Ammunition

This page lists every key of a weapon and its ammunition: timing, flight and aim, the damage and penetration numbers, bursts,
spreading, the special aimed shot, ammunition and its traces, the damage effects of explosions and fire, thrown items,
ballistic curves, and the `{weaponry}` block that mounts weapons on a unit. At the end, a short section shows step by step
how the game decides whether a shot goes through armour. [Chapter 9](09-weapons-ammo-damage.md) explains how these pieces work together
([Weapons, ammunition and damage](09-weapons-ammo-damage.md)); this page gives the facts for each key.

The job from start to end is [Change a gun or its ammunition](p04-change-a-gun.md). In the ARSENAL window the
**Balance** page shows each buy-panel unit's main gun with the columns "Gun", "Calibre mm", "Pen 100 m", "Damage",
"Reload s" and "Range m"; a reload change there is written into the gun file, so every unit that carries the same gun
changes with it. The Armor section of the **Models** page fires a chosen gun and shell at a unit (see
[The armour table on the Models page](r07-armour-volumes-damage.md#the-armour-table-on-the-models-page)). The armour
side of each test is in [Reference 7](r07-armour-volumes-damage.md); Gates of Hell weapon keys are listed at the end of
this page under [Gates of Hell only](#gates-of-hell-only).

How to read an entry. "Where" names the file kind and the block the key is written in. "Type" gives the kind of value
and its unit. "Values" gives what the game accepts and, when it is known, the value used when the key is absent.
"Limits" lists what fails silently, crashes or is ignored. Keys are not case-sensitive: `ProjectileDamage` and
`projectileDamage` are the same key. Where the same key name appears in two blocks, the heading adds the block in
brackets.

A few words used throughout:

- Stuff is anything a soldier or vehicle can hold: weapons, ammunition, grenades, tools. Each stuff file under
  `set/stuff/` starts with its type word. The types on this page are `weapon_bullet` (guns that fire projectiles),
  `weapon_flame` (flame throwers), `weapon_bombing` (bomb drops), `weapon_throwing` (throwing), `bullet` (ammunition) and
  `item` (anything else, including grenades).
- A pattern file (`.pattern`) holds shared keys that many stuff files start `from`; a `.presets` file holds macros that
  stuff files call with `("name" args ...)`.
- Penetration ("pen") is how many millimetres of steel a shot goes through. Energy is a number that starts at 1 when the
  shell leaves the barrel and falls as it flies and as it passes through plates.

Work in your own mod folder. Text data files use CRLF line endings, string values are read as UTF-8, identifiers are
ASCII, and old cp1251 bytes in vanilla `;` comments should be kept as they are.

## Weapon: timing, range and aim

These keys sit at the top level of a `weapon_bullet` stuff file or its pattern. Most of them may also be written inside a
`{parameters}` block to give one ammunition type its own value.

### rechargeTime

Where: weapon stuff file, top level or `{parameters}`.    Type: number, seconds.

Values: 0 or more; 0 when absent. Vanilla rifles use 3 (a new clip); vanilla guns mostly 2 to 12.

Does: the time to reload once the magazine is empty: for a rifle a new clip, for a gun that holds one shell the next
shell.

Limits: a soldier's veterancy `weapon_reload` shortens it for soldiers only; guns and vehicles are sped up by their
crew's skill instead.

Example:
```
{rechargeTime 5}
{parameters "apcr" {rechargeTime 6}}
```

See: [recoveryTime](#recoverytime); [Reference 5, weapon_reload](r05-humans.md#weapon_reload-veterancy).

### recoveryTime

Where: weapon stuff file, top level or `{parameters}`.    Type: number, seconds.

Values: 0 or more; 0 when absent. Vanilla rifles use 2.4 (the bolt); self-loading rifles 0.35 to 0.6.

Does: the pause after each shot before the next one, such as working a bolt. For a flame thrower it is how long one burst
burns.

Limits: veterancy and crew skill do not change it; only `rechargeTime` is sped up.

Example:
```
{recoveryTime 2.4}
```

See: [rechargeTime](#rechargetime).

### range

Where: weapon stuff file, top level or `{parameters}`.    Type: two numbers, metres.

Values: an effective range and a longest range. Vanilla rifles use `65 70`, pistols `35 40`, machine guns `75 80`.

Does: how far the weapon is used. The first number is where the unit opens fire on its own; the second is the farthest
the player can order a shot.

Limits: none recorded.

Example:
```
{range 65 70}
{parameters "fg" {range 120 130}}
```

See: [aimRange](#aimrange); [maxRange](#maxrange).

### aimRange

Where: weapon stuff file, top level or `{parameters}`.    Type: number, metres.

Values: 0 when absent. Vanilla flame throwers use 20, mortars and rocket launchers 110 to 130.

Does: the range the unit aims at when it picks a target for this weapon (unconfirmed).

Limits: none recorded.

Example:
```
{aimRange 20}
{maxRange 25}
```

See: [range](#range).

### maxRange

Where: weapon stuff file, top level or `{parameters}`.    Type: number, metres.

Values: no limit when absent. Vanilla flame throwers use 25 to 35.

Does: the absolute farthest a shot can be fired.

Limits: none recorded.

Example:
```
{maxRange 35}
```

<!-- goh: GHKEY-56 GHKEY-57 -->
Gates of Hell: a shot also needs at least `MinRange`, and under direct control the farthest range is not tested unless
`UnlimitedRangeTPC` is off (see [Gates of Hell only](#gates-of-hell-only)).

See: [range](#range).

### speed

Where: weapon stuff file, top level or `{parameters}`.    Type: number, game speed units.

Values: positive. Vanilla gun presets write it as half the muzzle speed in metres per second.

Does: how fast the projectile flies.

Limits: none recorded.

Example:
```
{speed 380}
```

See: [gravity](#gravity).

### gravity

Where: weapon stuff file, top level or `{parameters}`.    Type: number, a factor.

Values: 0 or more (negative values are raised to 0); 1.0 when absent. Vanilla rocket launchers use 0, long-range gun
presets use 1.5.

Does: how strongly the projectile drops in flight.

Limits: none recorded.

Example:
```
{gravity 0}
```

<!-- goh: GHDMG-26 GHKEY-61 -->
Gates of Hell: past `FalloffMeter` the shell's gravity grows with `FalloffStrength` (see
[Gates of Hell only](#gates-of-hell-only)), so long-range rounds dive.

See: [speed](#speed), [reactive](#reactive), [Chapter 9, section 4](09-weapons-ammo-damage.md#4-flight-and-hits).

### AimingTolerance

Where: weapon stuff file.    Type: number, degrees.

Values: 10 when absent. Vanilla rifles use 1, guns 2, rocket launchers 3.

Does: how far off the target the barrel may point and still fire.

Limits: none recorded.

Example:
```
{AimingTolerance 2}
```

See: [SpreadTolerance](#spreadtolerance).

### SpreadTolerance

Where: weapon stuff file.    Type: number.

Values: 0 or more (negative values are raised to 0); 0 when absent. Vanilla long-range gun presets use 0.4.

Does: how much of the spread the unit tolerates before it waits to fire (unconfirmed).

Limits: none recorded.

Example:
```
{SpreadTolerance 0.4}
```

See: [AimingTolerance](#aimingtolerance).

### RelaxationTime

Where: weapon stuff file.    Type: number, seconds.

Values: vanilla guns use 0.5, long-range presets 0.4.

Does: the settling time of the gun after it stops turning (unconfirmed).

Limits: none recorded.

Example:
```
{RelaxationTime 0.5}
```

See: [AimingTolerance](#aimingtolerance).

### LockFireDistanceTime

Where: weapon stuff file.    Type: number, seconds.

Values: 0 when absent. Vanilla stuff files do not set it.

Does: how long the fire distance stays locked after a shot (unconfirmed).

Limits: none recorded.

Example:
```
{LockFireDistanceTime 1}
```

See: [range](#range).

### aimType

Where: weapon stuff file, top level or `{parameters}` (whole weapon).    Type: word.

Values: `direct`, `curved`, `adaptive`; `direct` when absent.

Does: how the weapon aims. `direct` shoots flat, `curved` lobs over obstacles like a mortar or flare gun, `adaptive`
picks between the two like a howitzer.

Limits: any other word logs `Unknown aim type`.

<!-- goh: GHKEY-62 -->
Gates of Hell: knows a fourth word, `nocurve`. This game logs `Unknown aim type` for it; drop it when you bring a weapon
over.

Example:
```
{aimtype adaptive}
```

See: [curve](#curve).

### ZeroingAccuracy

Where: weapon stuff file, top level or `{parameters}` (whole weapon).    Type: list of numbers.

Values: any count of factors. The first sight setting is always 1.0 and the listed numbers are for the settings after it.
Vanilla long-range gun presets use `0.8 0.6`.

Does: multiplies the spread for each sight setting, so later settings can be less accurate.

Limits: none recorded.

Example:
```
{ZeroingAccuracy 0.8 0.6}
```

See: [Spreading](#spreading).

### reloadAnimBonus

Where: weapon stuff file.    Type: number.

Values: vanilla bullet weapons use 0.5.

Does: a bonus applied to the reload animation of soldiers (unconfirmed).

Limits: none recorded.

Example:
```
{reloadAnimBonus 0.5}
```

See: [rechargeTime](#rechargetime).

### automatic, automatic_ai

Where: weapon stuff file.    Type: flag.

Values: present or absent.

Does: `automatic` makes the weapon fire bursts; `automatic_ai` does the same only when the computer controls it.

Limits: none recorded.

Example:
```
{Automatic}
```

See: [burst](#burst).

### ammoLocked

Where: weapon stuff file.    Type: flag.

Values: present or absent.

Does: the ammunition cannot be taken out or swapped; vanilla single-shot launchers such as the panzerfaust use it.

Limits: none recorded.

Example:
```
{ammoLocked}
```

See: [filling](#filling).

### reactive

Where: weapon stuff file.    Type: true or false.

Values: a flag; vanilla rocket launchers write it.

Does: marks a rocket weapon. Its shell flies with no gravity and a slight wobble, and its motor burns for 1.05 to 1.4
times the aim range.

Limits: `gravity` is ignored when `reactive` is on.

Example:
```
{reactive}
```

See: [gravity](#gravity), [Chapter 9, section 1](09-weapons-ammo-damage.md#1-weapon-keys).

### calibre

Where: weapon stuff file, top level or `{parameters}` (whole weapon).    Type: number, millimetres.

Values: 0 when absent, in which case the game takes it from a `bulletNN` filling name. Vanilla rifles use 9.72 or 7.62,
rocket launchers 50.

Does: the bore of the weapon. It decides how much a thin plate counts against a big shell (overmatch).

Limits: none recorded.

Example:
```
{calibre 7.62}
```

See: [How penetration is worked out](#how-penetration-is-worked-out).

### DisableRicochet

Where: weapon stuff file, top level or `{parameters}` (whole weapon).    Type: flag.

Values: present or absent; ricochets allowed when absent.

Does: the weapon's shots never bounce off armour.

Limits: none recorded.

Example:
```
{DisableRicochet}
```

See: [RicochetEnergyDamping](#ricochetenergydamping).

### TraceFreq

Where: weapon stuff file, top level or `{parameters}`.    Type: number, whole.

Values: 1 when absent; 0 turns tracers off.

Does: how often a shot shows a tracer: every shot at 1, every second shot at 2.

Limits: none recorded.

Example:
```
{traceFreq 0}
```

See: [trace](#trace).

### foresight

Where: weapon stuff file, or a weapon place in `{weaponry}`.    Type: text.

Values: a foresight name; vanilla uses names such as `"Foresight3"` and `"foresight5"`.

Does: picks the sight view used when the player aims the weapon directly.

Limits: none recorded.

Example:
```
{foresight "Foresight3"}
```

See: [Weaponry](#weaponry).

## Weapon: sounds, cursors and animations

### fireSound

Where: weapon stuff file.    Type: text, a sound name.

Values: a sound under `sound/weapon/shot/`.

Does: the sound of a shot.

Limits: a name that does not exist logs `unknown sound file` and the weapon fires in silence.

<!-- goh: GHKEY-46 GHKEY-47 -->
Gates of Hell: adds `FireSoundClose` (played instead when the shot comes from the unit the player controls directly)
and `ClickSound` (a dry-fire click). See [Gates of Hell only](#gates-of-hell-only).

Example:
```
{fireSound "pistol/silent/welrod"}
```

See: [reloadSound](#reloadsound).

### reloadSound

Where: weapon stuff file.    Type: text, a sound name.

Values: a sound under `sound/weapon/reload/`.

Does: the sound of reloading.

Limits: a missing name logs `unknown sound file` and the reload is silent.

Example:
```
{reloadSound "rifle_bolt_five"}
```

See: [fireSound](#firesound).

### cursor, cursorReloading

Where: weapon stuff file, top level or `{parameters}`.    Type: text, a cursor name.

Values: a cursor in `interface/cursor`.

Does: the mouse cursor shown when the player aims this weapon, and while it reloads.

Limits: none recorded.

Example:
```
{cursor "cannon_on_fg"}
{cursorReloading "cannon_reload_fg"}
```

See: [crosshair, crosshairReloading](#crosshair-crosshairreloading).

### crosshair, crosshairReloading

Where: weapon stuff file, top level or `{parameters}`.    Type: text.

Values: a cursor name. Vanilla stuff files do not set it.

Does: the crosshair in direct control, and while reloading.

Limits: none recorded.

Example:
```
{crosshair "cross_gun"}
```

See: [cursor, cursorReloading](#cursor-cursorreloading).

### states

Where: weapon stuff file.    Type: block.

Values: `{prepare}`, `{unprepare}`, `{reload}`, `{unload}`, `{fire}`, `{aim}`, `{can_aim}`, each with a state name.

Does: the stance machine states a soldier uses to get the weapon ready, put it away, reload, unload, fire and aim.

Limits: any other key inside `{states}` is an error.

Example:
```
{states
  {reload "reload-bazooka"}
}
```

See: [Reference 5, Stance machine](r05-humans.md#stance-machine).

## Weapon: per-ammunition blocks

### parameters

Where: weapon stuff file.    Type: block with ammunition tags.

Values: `{parameters "tags" ...}` with any of the keys this page marks "top level or `{parameters}`".

Does: gives one kind of ammunition its own values, for example longer range for high explosive or a different damage
table for APCR (armour-piercing composite rigid) shot. The block applies when the loaded ammunition carries all its tags.

Limits: blocks with the same tags are merged. Tags must match whole words: `apc` does not match `apcbc`. A top-level key
written after a `{parameters}` block also overwrites that key in every block that still had the default value, so put
top-level keys first.

Example:
```
{parameters "fg" {range 120 130}}
{parameters "apcr" {range 110 120}}
```

See: [projectileDamageTable](#projectiledamagetable).

## Weapon: damage and penetration

These keys sit in the weapon file (not in the ammunition file), at the top level or in `{parameters}`.

### projectileDamage

Where: weapon stuff file, top level or `{parameters}`.    Type: number, millimetres.

Values: 0 when absent. Vanilla rifles use 5, rocket launchers 200, the 100 mm gun 171.

Does: penetration of the shot at the muzzle when there is no `projectileDamageTable`. When only one of
`projectileDamage` and `healthDamage` is set, the other is filled from it (1 penetration energy equals 0.025 health).

Limits: none recorded.

Example:
```
{projectileDamage 200}
```

See: [projectileDamageTable](#projectiledamagetable).

### projectileDamageTable

Where: weapon stuff file, top level or `{parameters}`.    Type: block of `{distance pen}` pairs, metres and millimetres.

Values: pairs in rising distance. Between pairs the value is drawn as a straight line; before the first pair and after
the last one it stays at that pair's value.

Does: penetration by distance. The game multiplies it by the shell's energy left at that point.

Limits: none recorded.

Example:
```
{projectileDamageTable {10 171} {50 160} {175 0}}
```

See: [How penetration is worked out](#how-penetration-is-worked-out).

### projectileDamageClip

Where: weapon stuff file, top level or `{parameters}`.    Type: number, millimetres.

Values: no limit when absent. Vanilla pistols use 3, rifles 5, shotguns 8.

Does: caps the penetration value.

Limits: none recorded.

Example:
```
{ProjectileDamageClip 5}
```

See: [projectileDamage](#projectiledamage).

### projectileDamageThreshold

Where: weapon stuff file, top level or `{parameters}`.    Type: number, a factor.

Values: unset when absent; when set it is never below 1. Vanilla gun presets use 1.10 to 1.30 by calibre, rifles 1.5.

Does: sets the threshold at which this shell damages an armour area: the plate's effective thickness divided by this
number. A plate's own `pierce` threshold (`value` or `koef`) comes first; this key is used when the plate has none, and
without either the threshold is two thirds of the effective thickness. The threshold decides only whether the area
takes damage, not whether the shell passes.

Limits: none recorded.

Example:
```
{projectileDamageThreshold 1.15}
```

<!-- goh: GHDMG-40 -->
Gates of Hell: the value has no floor of 1; the fallback is still two thirds of
the effective thickness.

See: [How penetration is worked out](#how-penetration-is-worked-out),
[threshold](r07-armour-volumes-damage.md#threshold) in Reference 7.

### healthDamage

Where: weapon stuff file, top level or `{parameters}`.    Type: number.

Values: 0 when absent. Vanilla rifles use 200, machine guns 135, pistols 137.5, shotguns 500.

Does: the damage to soldiers and other soft targets. When it is absent it is worked out from `projectileDamage`.

Limits: none recorded.

Example:
```
{healthDamage 200}
```

See: [healthDamageClip](#healthdamageclip).

### healthDamageClip

Where: weapon stuff file, top level or `{parameters}`.    Type: number.

Values: no limit when absent.

Does: caps the damage to soldiers.

Limits: none recorded.

Example:
```
{healthDamage 500}
{HealthDamageClip 500}
```

See: [healthDamage](#healthdamage).

### RicochetDamageClip

Where: weapon stuff file, top level or `{parameters}`.    Type: number.

Values: 0 when absent. Vanilla stuff files do not set it.

Does: caps the damage a ricochet can do (unconfirmed).

Limits: none recorded.

Example:
```
{RicochetDamageClip 10}
```

See: [RicochetEnergyDamping](#ricochetenergydamping).

### RicochetEnergyDamping

Where: weapon stuff file, top level or `{parameters}`.    Type: block of `{angle factor}` pairs, degrees.

Values: vanilla guns use `{0 1} {20 1} {30 0.8} {45 0.4} {60 0}`.

Does: how much energy a ricochet keeps, by the angle at which it hit.

Limits: ricochets happen only after a failed penetration, at most twice per shell, and never for shells with the `fg`
or `no_ricochet` tag or from a weapon with `DisableRicochet`.

Example:
```
{RicochetEnergyDamping {0 1} {30 0.8} {60 0}}
```

See: [How penetration is worked out](#how-penetration-is-worked-out).

### OvermatchDamping

Where: weapon stuff file, top level or `{parameters}`.    Type: block of `{angle factor}` pairs, degrees.

Values: vanilla guns use `{0 1} {30 1.1} {55 1.15} {60 1.45} {70 4} {90 6}`.

Does: scales how much a thin plate counts against this shell at each angle. The factor multiplies the ratio of plate
thickness to calibre.

Limits: past the table's last angle the factor is 1. The result (ratio times factor) is kept between 0.2 and 1.0.

Example:
```
{OvermatchDamping {0 1} {60 1.45} {90 6}}
```

<!-- goh: GHKEY-59 GHDMG-27 -->
Gates of Hell: three more overmatch tables can stand in for this one: `OvermatchCalibre`, `OvermatchFixed` and
`OvermatchSlope` (see [Gates of Hell only](#gates-of-hell-only)). The first of them that has entries wins, in the order
Calibre, Fixed, Slope, Damping. Data that has only `OvermatchDamping` gives the same result in both games.

See: [calibre](#calibre), [How penetration is worked out](#how-penetration-is-worked-out),
[thickness (area)](r07-armour-volumes-damage.md#thickness-area), [Chapter 9, section 5](09-weapons-ammo-damage.md#5-penetration-test-step-by-step).

### curve

Where: weapon stuff file, top level or `{parameters}`.    Type: text, a curve name.

Values: a curve from `set/ballistics.set`: vanilla has `linear`, `cumulative`, `bullet`, `gun_std`, `gun_light`,
`gun_medium`, `gun_heavy`. Without the key the game uses a built-in curve that is not in `set/ballistics.set`: factor
1.2 at distance 0, 0.9 at half the range, 0.7 at the full range and 0 at twice the range.

Does: how the shell's energy falls with distance. The distance is measured in parts of the weapon's range.

Limits: an unknown name stops the game at load with `Unknown curve`.

Example:
```
{curve "gun_std"}
```

See: [Ballistic curves](#ballistic-curves).

### bullet_view

Where: weapon stuff file, top level or `{parameters}`.    Type: text, an entity name, with an optional `{tail}`.

Values: an entity drawn as the flying shell.

Does: overrides the look of the shell in flight for this weapon.

Limits: none recorded.

Example:
```
{bullet_view "shell_ap_600" {tail "shell_tail" "root"}}
```

See: [view (ammunition)](#view-ammunition).

## Weapon: bursts

### burst

Where: weapon stuff file, top level or `{parameters}` (whole weapon).    Type: block.

Values: `{min}`, `{noaiming}`, `{short}`, `{long}`, `{rangeKoef}`.

Does: how an automatic weapon fires its bursts.

Limits: any other key inside `{burst}` is an error.

Example:
```
{burst {short 7 0.5} {long 30 5}}
```

See: [automatic, automatic_ai](#automatic-automatic_ai).

### min (burst)

Where: `{burst}`.    Type: number, rounds.

Values: 0 when absent. Vanilla howitzers use 6.

Does: the fewest rounds in a burst.

Limits: none recorded.

Example:
```
{burst {min 6} {noaiming}}
```

See: [burst](#burst).

### noaiming

Where: `{burst}`.    Type: flag.

Values: present or absent.

Does: the weapon does not re-aim between the rounds of a burst.

Limits: none recorded.

Example:
```
{burst {min 6} {noaiming}}
```

See: [burst](#burst).

### short, long

Where: `{burst}`.    Type: two numbers, rounds and deviation.

Values: a count and a random spread around it. Vanilla machine guns use `short 7 0.5` and `long 30 5`; autocannons
`short 3 1` and `long 5 1`.

Does: the length of short and long bursts.

Limits: none recorded.

Example:
```
{short 5 0.3} {long 8 0.7}
```

See: [rangeKoef](#rangekoef).

### rangeKoef

Where: `{burst}`.    Type: number, a fraction of range.

Values: 0.33 when absent.

Does: the share of the weapon's range inside which long bursts are used instead of short ones (unconfirmed).

Limits: none recorded.

Example:
```
{rangeKoef 0.5}
```

See: [short, long](#short-long).

## Spreading

Spreading is the circle around the aim point in which shots land. All its keys sit inside the `{spreading}` block of the
weapon file (or of the spreading preset the weapon calls), after the block's optional first number, or inside the
`{spreading}` block of a thrown item's `{throw}`. Written at the top level of a weapon file they are not spreading keys.

### spreading

Where: weapon stuff file, top level or `{parameters}`; also `{throw}`.    Type: number or block.

Values: in vanilla gun patterns a number (1), in thrown items a number (0.2 for anti-tank grenades, 0.5 for knives).

Does: the block that holds the keys below. A first number in it is the spread radius at full range in metres, the
same as `SpreadRadius`. The spread radius is divided by the shooter's skill accuracy (or the unit's
`ManualAccuracy`), then by the motion factor, multiplied by the zeroing factor, divided by the burst accuracy and changed
by crew skill.

Limits: none recorded.

Example:
```
{spreading 1
  {SpreadPower 1}
  {BurstAccuracy 100 98 95 92}
}
```

<!-- goh: GHDMG-52 GHKEY-51 GHKEY-53 GHKEY-54 -->
Gates of Hell: a weapon with unlimited ammunition never spreads. The motion factor can be scaled per weapon with
`AccuracyByMotionK`, and a weapon under direct control can have `Recoil` and `SwayParams` (see
[Gates of Hell only](#gates-of-hell-only)).

See: [SpreadRadius](#spreadradius); [Reference 5, accuracy](r05-humans.md#accuracy-skill);
[Chapter 9, section 3](09-weapons-ammo-damage.md#3-spread-and-accuracy).

### SpreadRadius

Where: inside the `{spreading}` block of a weapon stuff file.    Type: number, metres.

Values: 0 when absent. Vanilla anti-tank rifles use 0.5, rocket artillery 8 to 18.

Does: the spread circle at full range. Without a table, the circle grows in a straight line with distance.

Limits: `RadiusTable` overrides it.

Example:
```
{spreading {SpreadRadius 0.5}}
```

See: [RadiusTable](#radiustable).

### RadiusTable

Where: inside the `{spreading}` block of a weapon stuff file or its spreading preset.    Type: block of `{distance radius}` pairs, metres.

Values: vanilla rifles use `{0 0} {10 0.5} {25 1.0} {60 1.25}`; machine guns `{15 0.6} {40 1.2} {80 2.5}`; sniper rifles
`{30 0.6} {60 1.1} {90 2.0}`.

Does: the spread radius by distance. It wins over `RadiusFunction` and `SpreadRadius`.

Limits: none recorded.

Example:
```
{spreading {radiusTable {0 0} {10 0.5} {25 1} {60 1.25}}}
```

See: [RadiusFunction](#radiusfunction).

### RadiusFunction

Where: inside the `{spreading}` block of a weapon stuff file or of a thrown item.    Type: list of `x y` number pairs.

Values: pairs of distance share and radius factor. Vanilla knife throws use `0 0 0.7 0.2 1 1 1.5 3 3 10`.

Does: a curve of the spread radius by distance, multiplied by `SpreadRadius`.

Limits: `RadiusTable` overrides it.

Example:
```
{spreading {radiusFunction 0 0 0.7 0.2 1 1}}
```

See: [RadiusTable](#radiustable).

### SpreadXYRatio

Where: inside the `{spreading}` block of a weapon stuff file.    Type: number.

Values: 1 when absent; vanilla's largest gun uses 5.

Does: stretches the spread circle into an ellipse, longer along the line of fire.

Limits: none recorded.

Example:
```
{spreading {SpreadXYRatio 5}}
```

See: [SpreadYadjust](#spreadyadjust).

### SpreadYadjust

Where: inside the `{spreading}` block of a weapon stuff file.    Type: number, degrees.

Values: 0 when absent; vanilla howitzers use 0.5.

Does: tilts the spread in height.

Limits: none recorded.

Example:
```
{spreading {SpreadYadjust 0.5}}
```

See: [SpreadXYRatio](#spreadxyratio).

### SpreadPower

Where: inside the `{spreading}` block of a weapon stuff file.    Type: number.

Values: 1 when absent; vanilla's largest gun uses 10.

Does: shapes how shots are scattered inside the circle: higher values pull more shots towards the centre (unconfirmed).

Limits: none recorded.

Example:
```
{spreading {SpreadPower 10}}
```

See: [SpreadRadius](#spreadradius).

### BurstAccuracy

Where: inside the `{spreading}` block of a weapon stuff file.    Type: list of percentages.

Values: one value per round in a burst. Vanilla rifles use `100 98 95 92`; autocannons `100 90 85 80 75 65 55`.

Does: the spread grows with each round: the radius is divided by this percentage.

Limits: none recorded.

Example:
```
{spreading {BurstAccuracy 100 90 85 80}}
```

See: [BurstRecoveryTime](#burstrecoverytime).

### BurstRecoveryTime

Where: inside the `{spreading}` block of a weapon stuff file.    Type: number, seconds.

Values: 0 when absent; vanilla autocannons use 0.5.

Does: how long after a burst the accuracy returns to the first value.

Limits: none recorded.

Example:
```
{spreading {BurstRecoveryTime 0.5}}
```

See: [BurstAccuracy](#burstaccuracy).

### BurstSpreadCount, BurstSpreadDelta, BurstSpreadWidth

Where: inside the `{spreading}` block of a weapon stuff file.    Type: numbers.

Values: any.

Does: nothing; they are read but no part of the game uses them.

Limits: ignored.

Example:
```
{spreading {BurstSpreadCount 3}}
```

See: [BurstAccuracy](#burstaccuracy).

## Special aimed shot

### special

Where: weapon stuff file.    Type: block.

Values: `{mode}`, `{PrepareTime}`, `{PrepareCursor}`, `{accuracy}`, `{damage}`, `{throw_off}`, `{throw_off_always}`.

Does: the weapon's special shot, such as a sniper's aimed shot. A soldier needs the matching special-attack ability to
use it.

Limits: `throw_off_always` is not copied when another weapon starts `from` this one.

Example:
```
{special {mode aim} {PrepareTime 3.5} {PrepareCursor "aimed_shot"}
  {accuracy 2.5} {damage 2.5} {throw_off}}
```

<!-- goh: GHKEY-55 GHKEY-65 -->
Gates of Hell: `{special}` also takes `sway` (a factor on the aim sway while aiming through the scope, 1 when absent) and
`PrepareCursorScene` (see [PrepareCursor](#preparecursor)).

See: [Reference 5, specialattack](r05-humans.md#specialattack).

### mode (special)

Where: `{special}`.    Type: word.

Values: `aim` or `detonate`.

Does: `aim` makes the special an aimed shot; `detonate` makes it a remote detonation.

Limits: none recorded.

Example:
```
{mode aim}
```

See: [special](#special).

### PrepareTime

Where: `{special}`.    Type: number, seconds.

Values: vanilla sniper rifles use 3.5.

Does: how long the soldier aims before the special shot.

Limits: none recorded.

Example:
```
{PrepareTime 3.5}
```

See: [PrepareCursor](#preparecursor).

### PrepareCursor

Where: `{special}`.    Type: text, a cursor name.

Values: a cursor in `interface/cursor`.

Does: the cursor shown while the special shot is chosen.

Limits: none recorded.

Example:
```
{PrepareCursor "aimed_shot"}
```

<!-- goh: GHKEY-65 -->
Gates of Hell: `PrepareCursorScene` adds a second cursor picture, drawn in the scene over the target while `PrepareTime`
runs; `PrepareCursor` stays at the mouse.

See: [PrepareTime](#preparetime).

### accuracy (special)

Where: `{special}`.    Type: number, a factor.

Values: vanilla sniper rifles use 2.5.

Does: divides the spread of the special shot.

Limits: none recorded.

Example:
```
{accuracy 2.5}
```

See: [spreading](#spreading).

### damage (special)

Where: `{special}`.    Type: one or two numbers.

Values: a factor and an optional deviation. Vanilla sniper rifles use 2.5.

Does: replaces the curve's distance factor for the special shot with this value.

Limits: none recorded.

Example:
```
{damage 2.5}
```

See: [curve](#curve).

### throw_off, throw_off_always

Where: `{special}`.    Type: flag.

Values: present or absent.

Does: `throw_off` lets the special shot knock the target off his feet; `throw_off_always` does it on every shot (vanilla
shotguns use it).

Limits: `throw_off_always` is not copied by `from`.

Example:
```
{special {throw_off_always}}
```

See: [Reference 5, explosive](r05-humans.md#explosive).

## Filling

### filling

Where: weapon stuff file; `{weapon}` line of a weapon place.    Type: tags and an optional number.

Values: ammunition tags and a count; a weapon with a magazine writes its size, a gun writes the shell family
(`"bullet100"`).

Does: says which ammunition the weapon takes and how much one load holds. A gun's calibre comes from a `bulletNN` name
when `calibre` is not set.

Limits: none recorded.

Example:
```
{filling "ammo mgun" 100}
```

See: [calibre](#calibre); [Reference 5, filled](r05-humans.md#filled).

### fillingVisible

Where: weapon stuff file.    Type: text.

Values: a name; vanilla rocket launchers write `"rocket"`.

Does: shows the loaded round on the weapon model (unconfirmed).

Limits: none recorded.

Example:
```
{fillingVisible "rocket"}
```

See: [filling](#filling).

## Ammunition

These keys sit in a `bullet` stuff file or in a shell `.pattern` or `.presets` file.

### view (ammunition)

Where: `bullet` stuff file.    Type: text, an entity name, with an optional `{tail "entity" "bone"}`.

Values: an entity drawn as the flying round, and a trail effect fixed to a bone.

Does: the look of the round in flight.

Limits: none recorded.

Example:
```
{view "katusha_ammo" {tail "rocket_smoke" "tail"}}
```

See: [bullet_view](#bullet_view).

### detonationThickness

Where: `bullet` stuff file or shell pattern.    Type: number, millimetres.

Values: no detonation when absent. Vanilla high-explosive shells use 2, rockets 1.

Does: a plate at least this thick stops the round and sets it off.

Limits: a round stopped this way sends no `pierce` event, so scripts that react to penetration do not run.

Example:
```
{detonationThickness 2}
```

See: [How penetration is worked out](#how-penetration-is-worked-out).

### applyProjectile

Where: `bullet` stuff file.    Type: true or false.

Values: present or absent.

Does: a round that explodes also deals its penetration hit (vanilla rockets use it).

Limits: none recorded.

Example:
```
{applyProjectile}
```

See: [detonationThickness](#detonationthickness).

### cumulative (ammunition)

Where: `bullet` stuff file.    Type: number, metres.

Values: vanilla rocket ammunition uses 0.7.

Does: how far the shaped-charge jet of a HEAT (high-explosive anti-tank) round reaches past the point of impact.

Limits: none recorded.

Example:
```
{cumulative 0.7}
```

See: [cumulative (effect)](#cumulative-effect).

### trace

Where: `bullet` stuff file.    Type: block.

Values: `{view sprite {Light} {ScaleY}}` and `{length}`.

Does: the tracer drawn behind the round.

Limits: any other key inside `{trace}` is an error.

<!-- goh: GHKEY-66 -->
Gates of Hell: `{trace}` can start with a list of tags, `(Trace "tag1 tag2" ...)`, one tracer look per tag. Using the
same `View` texture twice in one trace breaks the rest of the block with `Block terminator expected!`.

Example:
```
{trace {view "/texture/fx/trace" {Light 8} {ScaleY 0.35}} {length 12}}
```

See: [TraceFreq](#tracefreq).

### length (trace)

Where: `{trace}`.    Type: number, metres.

Values: vanilla shell presets use 12 times a factor.

Does: the length of the tracer.

Limits: none recorded.

Example:
```
{length 12}
```

See: [trace](#trace).

### possibleDamageRadius

Where: `bullet` stuff file or thrown item.    Type: number, metres.

Values: vanilla rocket ammunition uses 4.

Does: the radius the computer's soldiers try to stay out of when the round is coming.

Limits: it does not change the damage; only the explosion's `{damage}` blocks do.

Example:
```
{possibleDamageRadius 4}
```

See: [blastwave](#blastwave).

### tag (ammunition)

Where: `bullet` stuff file.    Type: text.

Values: words such as `"ammo shell ap itemin2hands"`, `"bullet stackable pierce"`, `fg`, `no_ricochet`.

Does: tags pick which weapon `{parameters}` block applies and turn some behaviour on. `fg` and `no_ricochet` stop the
round from bouncing.

Limits: none recorded.

Example:
```
{tag "bullet stackable pierce"}
```

See: [parameters](#parameters).

## Damage effects

Explosions and fire are `{damage ...}` blocks in a stuff file. The game knows `blastwave`, `fire`, `flash` and
`cumulative`.

### damage

Where: stuff file.    Type: block with an effect name.

Values: `{damage blastwave ...}`, `{damage add blastwave ...}`, `{damage fire ...}`, `{damage flash ...}`,
`{damage cumulative ...}`.

Does: adds an effect that happens when the round explodes or hits. `add` adds another layer; without `add`, a
`blastwave` replaces the first layer the pattern gave. A second blast wave (`damage add blastwave`) is an explosion of
its own at the same point, after the first: it runs its own `blast_hit` event and can hit each part once more.

Limits: `projective` and `health` log `Unsupported damage effect`; any other unknown name logs `Unknown damage effect
type`. A number written straight after `damage` stops the game at load.

Example:
```
{damage blastwave {energy 1} {area 1 4}}
{damage add blastwave {energy 3.3} {area 4 5}}
```

See: [blastwave](#blastwave), [Chapter 6, section 4](06-data-keys-entities.md#4-stuff-from-and-damage-effects),
[Chapter 9, section 8](09-weapons-ammo-damage.md#8-blast-and-fragments).

### blastwave

Where: `{damage}`.    Type: block.

Values: `{energy}` and `{area}` only.

Does: a blast. Inside the inner radius it hits with full energy; between the inner and outer radius it falls in a
straight line to nothing. Distance is measured to the point where the blast enters a hit volume. Armour takes 5 times the
energy, soldiers under computer control 200 times, soldiers under the player's control a smaller factor. The wave
travels at 15 metres per second. A soldier's pose shields him: crouching by 1.15, lying by 1.25, in cover by 1.5,
lying ready by 1.75, ready in cover by 2.0.

Limits: the total explosive amount used by the game is the sum of all layers. Crew seated inside a vehicle are never
hurt by a blast through the vehicle; only the vehicle's scripts hurt them. A blast meets plates without slope, calibre or
overmatch (see [blast](r07-armour-volumes-damage.md#blast) in Reference 7).

Example:
```
{damage blastwave {energy 8} {area 0.2 0.4}}
{damage add blastwave {energy 2} {area 0.5 6}}
```

<!-- goh: GHDMG-30 GHDMG-31 GHDMG-33 GHDMG-34 GHDMG-42 GHDMG-54 -->
Gates of Hell: the energy factors (5 for armour, 0.025 health per unit of energy) are read from `/set/damage.set`, and
every soldier, computer controlled or not, takes blast damage from the `blast_to_health_scale` table of that file times
125 times a difficulty factor. A volume keeps only as much blast energy as its threshold and passes the rest on. The
block also takes `ground_interaction_radius` (see [Gates of Hell only](#gates-of-hell-only)).

See: [area](#area); [Reference 5, explosive](r05-humans.md#explosive);
[Chapter 9, section 8](09-weapons-ammo-damage.md#8-blast-and-fragments).

### energy

Where: `{damage blastwave}`.    Type: number.

Values: positive. Vanilla shell presets scale it with the calibre argument.

Does: the strength of the blast.

Limits: none recorded.

Example:
```
{energy 1}
```

See: [blastwave](#blastwave).

### area

Where: `{damage blastwave}`.    Type: two numbers, metres.

Values: inner radius and outer radius; the outer must not be smaller.

Does: full energy inside the first number, falling to nothing at the second.

Limits: an outer radius smaller than the inner logs `r1 must be >= r0`.

Example:
```
{area 0.5 6}
```

See: [blastwave](#blastwave).

### fire

Where: `{damage}`.    Type: block.

Values: `{radius m}`, `{heating}`, `{time s}`, `{follow uid}`.

Does: sets things on fire in a radius for a time. Vanilla rockets use radius 5, heating 0.8, time 3; the largest gun uses
radius 20, heating 4, time 4.

Limits: any other key is an error. Each step, every unit within the radius gains heat: the step length times `heating`
divided by the unit's `inflammation_time` (a fifth of that for an ally; none for a unit that cannot be hurt or already
burns). Above 1 the unit catches fire: its `burn` reaction runs, then `burn_volume` for each of its volumes the fire
reaches.

Example:
```
{damage fire {radius 5} {heating 0.8} {time 3}}
```

<!-- goh: GHDMG-18 GHDMG-48 -->
Gates of Hell: heat does not add up across a battle: a unit cools from 0.2 s after the last heat. Water puts a fire out
only when the whole fire sphere is under the surface.

See: [Reference 5, fire](r05-humans.md#fire-avoidance),
[inflammation_time](r10-interaction-scripts.md#inflammation_time),
[Chapter 9, section 9](09-weapons-ammo-damage.md#9-fire-and-cook-off).

### flash

Where: `{damage}`.    Type: block.

Values: `{radius near far}`, `{duration near far}`.

Does: a blinding flash. No vanilla item uses it.

Limits: it blinds soldiers within reach only. A soldier on a seat is skipped, and vehicles and their crews are not
touched.

Example:
```
{damage flash {radius 5 15} {duration 2 4}}
```

See: [blastwave](#blastwave).

### cumulative (effect)

Where: `{damage}`.    Type: block.

Values: `{distance m}`, `{damage mm}`. Vanilla anti-tank grenades use `{damage 75} {distance 0.3}`.

Does: a shaped charge. It fires a second, invisible projectile of calibre 120 with a straight-line energy curve, with
the given penetration and reach. The new projectile starts at the burst point and flies on along the shell's path. Its
stuff is `cumulative_charge` (vanilla tank scripts test for it), its aim range is `distance` and its penetration is
`damage`. It is a new shot, so it meets the same vehicle again with its own `bullet_hit`, `pierce` and `break_armor`
events.

Limits: in vanilla only the anti-tank grenades use it, no gun shell.

Example:
```
{damage cumulative {damage 75} {distance 0.3}}
```

See: [cumulative (ammunition)](#cumulative-ammunition),
[Chapter 9, section 8](09-weapons-ammo-damage.md#8-blast-and-fragments).

## Thrown items

### throw

Where: grenade or thrown stuff file.    Type: block.

Values: `{range}`, `{startAngle}`, `{spreading}`, `{constantSpeed}`.

Does: how the item is thrown.

Limits: none recorded.

Example:
```
{throw {range 10} {startAngle 90} {spreading 0.2} {constantSpeed 10.5}}
```

See: [startAngle](#startangle).

### startAngle

Where: `{throw}`.    Type: number, degrees.

Values: held between 10 and 80. Vanilla knives write 8 and anti-tank grenades 90, which the game raises to 10 and lowers
to 80.

Does: the angle of the throw above the ground.

Limits: values outside 10 to 80 are changed without a warning.

Example:
```
{startAngle 30}
```

See: [throw](#throw).

### constantSpeed

Where: `{throw}`.    Type: number.

Values: vanilla anti-tank grenades use 10.5, knives 15.

Does: throws at this fixed speed instead of a speed worked out from the distance (unconfirmed).

Limits: none recorded.

Example:
```
{constantSpeed 15}
```

See: [throw](#throw).

### range (throw)

Where: `{throw}`.    Type: number, metres.

Values: vanilla anti-tank grenades use 10, Molotov cocktails 14, knives 20.

Does: the farthest the item can be thrown.

Limits: none recorded.

Example:
```
{range 14}
```

<!-- goh: GHKEY-67 -->
Gates of Hell: without the key the range is 1 model unit (5 cm); in this game it is 0.

See: [throw](#throw).

## Ballistic curves

### curve block

Where: `set/ballistics.set`.    Type: block with a name and `{x y}` pairs.

Values: x is the distance as a share of the weapon's range, y is the energy factor. Vanilla `gun_std` is
`{0.1 1} {0.5 0.7} {1 0.4} {2 0.2} {4 0}`; `gun_heavy` is `{0.1 1} {0.6 0.7} {1 0.3} {2.5 0}`. The built-in curve used
when a weapon names none runs 1.2 at 0, 0.9 at 0.5, 0.7 at 1 and 0 at 2.

Does: makes a curve that weapons pick with their `curve` key.

Limits: none recorded.

Example:
```
{"gun_std" {0.1 1} {0.5 0.7} {1 0.4} {2 0.2} {4 0}}
```

See: [curve](#curve).

### damping

Where: `set/ballistics.set`.    Type: block of pairs.

Values: vanilla `{0 1}` to `{10 0}`.

Does: nothing; the block is never read.

Limits: ignored.

Example:
```
{damping {0 1} {10 0}}
```

See: [curve block](#curve-block).

## Weaponry

The `{weaponry}` block in a unit `.def` or its class `.ext` file mounts weapons on the unit.

### weaponry

Where: unit `.def` or class `.ext`.    Type: block.

Values: `{place}`, `{state}`, `{current}`, `{ManualAccuracy}`, `{RestoreIKTime}`.

Does: lists the unit's weapon places. The first place is the basic one.

Limits: none recorded.

Example:
```
{weaponry
  {place "gun" {weapon "75mm_kwk40(L48)" filling "ammo bullet75 ap" 1}}
}
```

<!-- goh: GHKEY-28 GHKEY-06 GHKEY-05 GHKEY-69 -->
Gates of Hell: the block takes more words, `ManualAccuracyZoom`, `TpcInstantAiming`, `AnimatedAiming`,
`UseLookatAiming`, `AimingReferenceBone` and `Sealed`, and a place takes `AI_In_Manual`, `AimBone`, `Bullets` and
`Sealable`. This game does not read them; drop them when you bring a unit over.

See: [place](#place), [Chapter 9, section 1](09-weapons-ammo-damage.md#1-weapon-keys),
[Change a gun or its ammunition](p04-change-a-gun.md).

### place

Where: `{weaponry}`.    Type: block with a name.

Values: the keys in this section from `type` to `AccuracyByMotion`.

Does: one weapon mount, such as the main gun, a coaxial machine gun or an anti-aircraft gun.

Limits: two weapons on one place log `HolderWeapon: set user ... ignored`; the second is not used.

Example:
```
{place "mgun2" {type "mgun_coaxial"} {weapon "mg34" filled} {basic}}
```

See: [weapon (place)](#weapon-place).

### current, number

Where: `{weaponry}`.    Type: text or whole number.

Values: `{current "place"}` names the active place. `{number i}` gives it by index.

Does: the place selected when the unit is created or loaded.

Limits: `{number}` is old: it logs `Current weapon place with index is obsolete, resave.`

Example:
```
{current "gun"}
```

See: [place](#place).

### state (weaponry)

Where: `{weaponry}`.    Type: block, optional name.

Values: written by the game.

Does: the saved state of the weaponry.

Limits: none recorded.

Example:
```
{state "gun"}
```

See: [weaponry](#weaponry).

### ManualAccuracy

Where: `{weaponry}`.    Type: number, a factor.

Values: 1.0 when absent.

Does: divides the spread of shots under direct control.

Limits: none recorded.

Example:
```
{ManualAccuracy 1.5}
```

See: [spreading](#spreading).

### RestoreIKTime

Where: `{weaponry}`.    Type: number, whole.

Values: 0 when absent. Vanilla tanks use 4, guns and armoured cars 10. The unit is not documented (unconfirmed).

Does: the delay before a turret or gun that has stopped aiming turns back to its rest position.

Limits: none recorded.

Example:
```
{RestoreIKTime 4}
```

See: [RestoreIKAfterAim](#restoreikafteraim).

### type (place)

Where: `{place}`.    Type: text.

Values: a place type, such as `"mgun_aa"` or `"mgun_coaxial"`.

Does: the kind of mount, used by the interface and the bots.

Limits: none recorded.

Example:
```
{type "mgun_aa"}
```

See: [place](#place).

### weapon (place)

Where: `{place}`.    Type: text, a weapon name, then optional `filled` or `filling`.

Values: a weapon stuff name.

Does: the weapon on this mount and its first load.

Limits: none recorded.

Example:
```
{weapon "mg34" filled}
```

See: [filling](#filling).

### ammo (place)

Where: `{place}`.    Type: block.

Values: `recovering`, `loading`, `reload`, written by the game.

Does: the saved reloading state of the mount.

Limits: none recorded.

Example:
```
{ammo {reload}}
```

See: [place](#place).

### gunner, charger, shooter

Where: `{place}`.    Type: text, a crew role.

Values: a crew place name; `gunner` and `charger` by default.

Does: who aims (gunner), who loads (charger) and who fires (shooter) this mount.

Limits: none recorded.

Example:
```
{gunner "gunner2"} {charger "gunner2"}
```

See: [place](#place).

### basic

Where: `{place}`.    Type: flag.

Values: present or absent; the first place is basic when no place says so.

Does: marks the mount as the unit's main weapon.

Limits: none recorded.

Example:
```
{basic}
```

See: [place](#place).

### Barrels

Where: `{place}`.    Type: number, whole.

Values: 1 when absent.

Does: how many barrels the mount fires from.

Limits: none recorded.

Example:
```
{Barrels 2}
```

See: [place](#place).

### LinkBone

Where: `{place}`.    Type: text, a bone name.

Values: a bone of the unit's model.

Does: the bone the mount turns with.

Limits: none recorded.

Example:
```
{LinkBone "mgun1_rot"}
```

See: [LinkAnimation](#linkanimation).

### LinkAnimation

Where: `{place}`.    Type: text.

Values: an animation name or `"off"`.

Does: the animation played with the mount.

Limits: none recorded.

Example:
```
{LinkAnimation "off"}
```

See: [LinkBone](#linkbone).

### Rotate

Where: `{place}`.    Type: flag.

Values: present or absent.

Does: the mount turns (unconfirmed).

Limits: none recorded.

Example:
```
{Rotate}
```

See: [place](#place).

### RestoreIKAfterAim

Where: `{place}`.    Type: flag.

Values: present or absent.

Does: the mount returns to its rest position after aiming, after `RestoreIKTime`.

Limits: none recorded.

Example:
```
{RestoreIKAfterAim}
```

See: [RestoreIKTime](#restoreiktime).

### SequentialAim

Where: `{place}`.    Type: number, whole.

Values: on when absent.

Does: the mount turns and then raises its barrel one after the other instead of both at once (unconfirmed).

Limits: none recorded.

Example:
```
{SequentialAim 0}
```

<!-- goh: GHKEY-70 -->
Gates of Hell: off when absent. A turret brought over that should aim one axis after the other must set it.

See: [place](#place).

### StationaryFiring

Where: `{place}`.    Type: flag.

Values: present or absent.

Does: the mount fires only while the unit stands still.

Limits: none recorded.

Example:
```
{StationaryFiring}
```

See: [AccuracyByMotion](#accuracybymotion).

### AccuracyByMotion

Where: `{place}`, usually through a preset.    Type: block.

Values: `{maxlinearspeed}`, `{bylinearspeed}`, `{maxangularspeed}`, `{byangularspeed}`, `{disordertime}`,
`{ordertime}`. Vanilla presets: low `20 0.4 4 0.6 1.5 1.5`, medium `21 0.55 4 0.65`, high `22 0.7 4 0.7`, machine gun
`16 0.5 4 0.8 1.2 2.0` in the order above.

Does: lowers accuracy while the unit moves or turns.

Limits: any other key inside is an error.

Example:
```
{AccuracyByMotion {maxlinearspeed 21} {bylinearspeed 0.55}
  {maxangularspeed 4} {byangularspeed 0.65}}
```

<!-- goh: GHKEY-51 -->
Gates of Hell: the weapon can scale this penalty with `AccuracyByMotionK`: the spread is divided by
`(motion factor - 1) * K + 1`, so `K 0` removes the motion penalty for that weapon.

See: [spreading](#spreading).

### maxlinearspeed, bylinearspeed

Where: `{AccuracyByMotion}`.    Type: km/h and a factor.

Values: `maxlinearspeed` 0 when absent; `bylinearspeed` 1 when absent and at most 1.

Does: at `maxlinearspeed` and above, accuracy is multiplied by `bylinearspeed`.

Limits: a `bylinearspeed` above 1 logs `Accuracy must be <= 1`.

Example:
```
{maxlinearspeed 20} {bylinearspeed 0.4}
```

See: [AccuracyByMotion](#accuracybymotion).

### maxangularspeed, byangularspeed

Where: `{AccuracyByMotion}`.    Type: degrees per second and a factor.

Values: vanilla uses 4 and 0.6 to 0.8.

Does: at this turning speed and above, accuracy is multiplied by `byangularspeed`.

Limits: none recorded.

Example:
```
{maxangularspeed 4} {byangularspeed 0.6}
```

See: [AccuracyByMotion](#accuracybymotion).

### disordertime, ordertime

Where: `{AccuracyByMotion}`.    Type: seconds.

Values: 1 when absent.

Does: how long accuracy takes to fall when motion starts (`disordertime`) and to come back when it stops (`ordertime`).

Limits: none recorded.

Example:
```
{disordertime 1.5} {ordertime 1.5}
```

See: [AccuracyByMotion](#accuracybymotion).

## How penetration is worked out

This is the order the game follows when a shell hits a plate. There is no dice roll: the same shot at the same plate
gives the same result every time.

1. Penetration at this distance. The game reads `projectileDamageTable` at the distance flown (or uses
   `projectileDamage`) and multiplies it by the energy the shell has left, which the `curve` lowers with distance.
2. Angle. The plate's slope factor is one divided by the cosine of the hit angle, and never more than 10.
3. Overmatch. A plate that is thin compared with the shell's `calibre` counts for less of its slope: the game works out
   the ratio of thickness to calibre, multiplies it by the `OvermatchDamping` factor for that angle, and holds the result
   between 0.2 and 1. The effective thickness is `((slope - 1) x ratio + 1) x thickness`.
4. Pass or fail. If penetration is at least the effective thickness, the shell goes through.
5. After the test the plate takes the smaller of the effective thickness and the penetration out of the shell. If that
   is at least the round's `detonationThickness`, the shell stops there (see step 6). Otherwise, after a pass, the shell
   goes on with its energy lowered by the amount taken divided by its penetration. Whether the plate itself is damaged
   is a separate test against the area's threshold (see [Reference 7](r07-armour-volumes-damage.md#threshold)).
6. A round with `detonationThickness` that meets a plate at least that thick stops and explodes, and no `pierce` event
   is sent.
7. After a fail, the shell may ricochet: at most twice, never for `fg` or `no_ricochet` rounds or weapons with
   `DisableRicochet`. The chance comes from the plate's material table at the grazing angle (90 minus the hit angle). For
   vanilla steel it is 1 up to 15 degrees of grazing, 0.6 at 30, 0.3 at 45, 0.15 at 60 and 0 from 75.
8. HEAT rounds reach on by their `cumulative` distance. Armour-piercing, APCR and HEAT rounds differ only in their data.
9. Which side was hit (front, side, rear, top) is stored in each face of the unit's hit volume model, not worked out from
   the angle.

A few more rules of the same test:

- Only entry faces cost the shell energy. The exit face of a volume is tested but takes nothing.
- The area can take damage only when the shell's `calibre` is at least the area's `threshold {pierce {calibre}}`.
- When the area breaks on this hit, the shell does not ricochet.
- A shell that stops in a plate bursts 0.3 model units (1.5 cm) before the face it hit.
- A shot whose damage times energy has fallen below 0.00001 misses: it flies through without a burst.
- The crew seated inside a vehicle are never hurt by the shell or the jet itself. Only the vehicle's interaction scripts
  hurt or kill them (see [Parts and how damage reaches them](r07-armour-volumes-damage.md#parts-and-how-damage-reaches-them)).

To try a shot on a real unit with all of these rules, use the Armor section of the Models page (see
[The armour table on the Models page](r07-armour-volumes-damage.md#the-armour-table-on-the-models-page) and
[Chapter 9, section 11](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window)). The longer
explanation is [Chapter 9, section 5](09-weapons-ammo-damage.md#5-penetration-test-step-by-step); the plate side is in
[Reference 7](r07-armour-volumes-damage.md#how-a-shell-is-judged-in-short).

<!-- goh: GHDMG-37 GHDMG-27 GHDMG-14 GHDMG-16 GHDMG-11 GHDMG-12 GHDMG-15 GHDMG-41 -->
Gates of Hell: step 3 can use one of three more overmatch tables, and the plate is also scaled by its hardness, cast
steel and flaw keys (see [Reference 7, Gates of Hell only](r07-armour-volumes-damage.md#gates-of-hell-only)). A pass
counts only when the shell enters a volume. A shell hits each part of a vehicle at most once per step, at the nearest of
its volumes. The damage curve is read at the hit point, not at the start of the step. No HEAT jet starts at a soldier hit
by a round tagged `rocketlauncher`, `heat`, `atgm` or `fg`. A soldier firing from a vehicle never hits that vehicle.
Armour never wears.

## Weapon types other than bullet weapons

### weapon_flame, weapon_bombing, weapon_throwing

Where: `set/stuff/` file type words.    Type: block.

Values: share the weapon keys above where they make sense.

Does: flame throwers, bomb drops and thrown weapons.

Limits: their own extra keys are not described yet; see the list below.

<!-- goh: GHKEY-07 -->
Gates of Hell: has one more type word, `weapon_launcher`, and picks how a weapon aims from these type words.

Example:
```
{weapon_flame
  {aimRange 20}
  {maxRange 25}
}
```

See: [Chapter 9, section 9](09-weapons-ammo-damage.md#9-fire-and-cook-off), [fire](#fire).

## Save fields

### Round and effect state

Where: saves.    Type: varied.

Values: rounds in flight store `owner`, `attacker`, `params`, `position`, `distance`; blasts store `Hits` and `Volume`;
fires store `LastFollowPosition` and `Timer`; stuff stores `activator`, `preparation`, `amount`.

Does: keep shells, blasts and fires going across a save and load.

Limits: written by the game; do not set them by hand.

Example:
```
{Timer 2}
```

See: [damage](#damage).

## Not described yet

- `recharge_time`
- `recovery_time`
- `aim_range` (weapon)
- `max_range`
- `trace_freq`
- `preloaded`
- `angles`
- `distance` (stuff)
- `weapon_flame` own keys
- `weapon_bombing` own keys

## Gates of Hell only

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

<!-- goh: GHKEY-59 GHDMG-27 GHKEY-60 GHDMG-25 GHKEY-61 GHDMG-26 GHKEY-23 GHKEY-56 GHKEY-57 GHKEY-58 GHKEY-46 GHKEY-47 GHKEY-48 GHKEY-49 GHKEY-50 GHKEY-51 GHKEY-52 GHKEY-53 GHKEY-54 GHKEY-55 GHKEY-65 GHKEY-63 GHDMG-30 GHDMG-31 GHDMG-32 GHDMG-34 GHDMG-38 GHDMG-54 -->

These keys exist only in Gates of Hell. This game does not read them, so a weapon brought over must drop them (see
[Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md)). In Gates of Hell a weapon that starts `from`
another keeps these keys too.

### OvermatchCalibre, OvermatchFixed, OvermatchSlope

Where: weapon stuff file, `{parameters}`.    Type: blocks of points by angle, whole degrees.

Values: `OvermatchCalibre {angle x y}`, `OvermatchFixed {angle v}`, `OvermatchSlope {angle v}`.

Does: replace the slope part of the penetration test. The plate is multiplied by `max(1, x * (T/C)^y)` (Calibre),
`max(1, v)` (Fixed) or `max(1, v * slope)` (Slope), where T is the plate, C the calibre and slope one divided by the
cosine of the hit angle (at most 10). The first table that has points wins, in the order Calibre, Fixed, Slope, then
`OvermatchDamping`. Unlike `OvermatchDamping` the result is never below 1 and has no upper cap.

Limits: points are added in the order read and are not sorted: write them once, in rising angle.

Example:
```
{overmatchSlope {0 1} {50 1} {60 2} {90 99}}
```

See: [OvermatchDamping](#overmatchdamping).

### MinimumDamageModifier

Where: weapon stuff file, `{parameters}`.    Type: number.

Values: 0 when absent.

Does: added to the health a vehicle part loses when this shell pierces it.

Limits: works only with the part health of Gates of Hell (see
[Reference 7, Gates of Hell only](r07-armour-volumes-damage.md#gates-of-hell-only)).

Example:
```
{minimumDamageModifier 450}
```

See: [projectileDamage](#projectiledamage).

### FalloffMeter, FalloffStrength

Where: weapon stuff file, `{parameters}`.    Type: number, metres; number.

Values: `FalloffMeter` no limit when absent; `FalloffStrength` 0 when absent (no falloff).

Does: past `FalloffMeter` metres the shell's gravity grows by `FalloffStrength` times the square of the distance past
that point, so long-range rounds dive.

Limits: none known.

Example:
```
{FalloffMeter 180} {FalloffStrength 0.15}
```

See: [gravity](#gravity).

### MinRange

Where: weapon stuff file, `{parameters}`.    Type: number, metres.

Values: 0 when absent.

Does: the weapon fires only at targets at least this far away; vehicle AI uses it when it picks a target.

Limits: none known.

Example:
```
{MinRange 50}
```

See: [maxRange](#maxrange).

### UnlimitedRangeTPC

Where: weapon stuff file, `{parameters}`.    Type: true or false.

Values: on when absent.

Does: under direct control the farthest range of the weapon is not tested; off makes the range count as it does for
the AI. `MinRange` still holds.

Limits: none known.

Example:
```
{UnlimitedRangeTPC 0}
```

See: [maxRange](#maxrange).

### ToplayerVignette

Where: weapon stuff file, `{parameters}`.    Type: text, a resource name.

Values: empty when absent.

Does: probably a screen vignette shown to the player while using this ammunition; not confirmed.

Limits: none known.

Example: (one Gates of Hell pattern uses it)

See: [parameters](#parameters).

### FireSoundClose

Where: weapon stuff file.    Type: text, a sound under `weapon/shot/`.

Values: none when absent.

Does: played instead of `fireSound` when the shot comes from the unit the player controls directly (a soldier under
direct control, a vehicle in the inner view).

Limits: it must share the signal and radius of the `fireSound` folder, or the game warns
`fireSoundClose sound ... signal is different` and plays the plain sound.

Example: (a sound name like those of `fireSound`)

See: [fireSound](#firesound).

### ClickSound

Where: weapon stuff file.    Type: text, a sound under `weapon/click/`.

Values: none when absent.

Does: a dry-fire click on each press of fire while the gun is empty or reloading, for a soldier under direct control
only.

Limits: never played for AI soldiers.

Example:
```
{clickSound "trigger_click_01"}
```

See: [fireSound](#firesound).

### AutoReload

Where: weapon stuff file.    Type: true or false.

Values: on when absent.

Does: off means a soldier under direct control with an empty gun does not reload on his own. The AI always reloads.

Limits: none known.

Example:
```
{autoreload 1}
```

See: [rechargeTime](#rechargetime).

### FiringTimeout, FiringTimeoutDistanceFactor

Where: weapon stuff file; the factor table in a `weapon_bullet` file.    Type: seconds with an optional spread; table.

Values: `FiringTimeout value [+-dev]`, 0 when absent (no pause). `FiringTimeoutDistanceFactor {x factor}` with x the
target distance as a share of the aim range; 1 without the table.

Does: the AI waits after each shot for `value` plus or minus `dev` seconds, times the factor for that distance, times a
difficulty factor.

Limits: a second factor block adds its points to the first.

Example:
```
{FiringTimeoutDistanceFactor {0.25 0.0} {0.75 1.0}}
```

See: [burst](#burst).

### AccuracyByMotionK

Where: weapon stuff file.    Type: number.

Values: 1 when absent.

Does: scales the place's motion penalty for this weapon: the spread is divided by `(motion factor - 1) * K + 1`. `0`
removes the penalty.

Limits: none known.

Example:
```
{AccuracyByMotionK 0.5}
```

See: [AccuracyByMotion](#accuracybymotion).

### SyncedProjectiles

Where: weapon stuff file.    Type: true or false.

Values: off when absent.

Does: in a network game the server draws the shot's spread and the clients wait for it, so craters and decals match on
every machine.

Limits: depends on the network model of Gates of Hell; this game has nothing like it.

Example:
```
{SyncedProjectiles 1}
```

See: [spreading](#spreading).

### Recoil

Where: weapon stuff file.    Type: block.

Values: `{Shoot {pitch dev} {yaw dev}}`, `{MaxAngle pitch yaw}`, `{RestoreTime min perShot}`, `{RestoreDelay s}`; all
0 when absent (no kick).

Does: kicks the aim of a weapon under direct control on each shot and brings it back.

Limits: any other word inside is an error.

Example: (vanilla Gates of Hell sets it through a shared small arms file)
```
{recoil
  {shoot {2.50 0.75} {1 0.75}}
  {maxAngle 8 8}
  {restoreTime 1.00 0.025}
  {restoreDelay 0.20}
}
```

See: [SwayParams](#swayparams).

### SwayParams

Where: weapon stuff file.    Type: block.

Values: `{Bounds -yaw +yaw -pitch +pitch}` in degrees and `{Speed k}`; 0 when absent (no sway).

Does: makes the aim of a weapon under direct control wander.

Limits: any other word inside is an error.

Example:
```
{swayparams
  {bounds -0.25 0.2 -0.35 0.3}
  {speed 0.1}
}
```

See: [sway (special)](#sway-special).

### sway (special)

Where: `{special}`.    Type: number.

Values: 1 when absent.

Does: multiplies the sway while aiming through the scope.

Limits: none known.

Form:
```
{sway 0.5}
```

No stock Gates of Hell file uses it.

See: [special](#special).

### PrepareCursorScene

Where: `{special}`.    Type: text, a cursor name.

Values: a cursor from the cursor folder.

Does: a second cursor picture drawn in the scene over the target while `PrepareTime` runs.

Limits: none known.

Example:
```
{PrepareCursorScene "aimed_shot_scene"}
```

See: [PrepareCursor](#preparecursor).

### damage.set

Where: `/set/damage.set`, root `damage`.    Type: file.

Values: `energy_per_projective` (1), `energy_per_health` (0.025), `energy_per_blastwave` (5),
`blast_to_health_scale` (a table from blast energy to a health share; Gates of Hell data `{0 0} {0.2 0.08} {0.5 0.15}
{1 0.2} {2 0.25} {3 0.3} {10 0.5} {100 0.7} {10000 0.9}`), `brinell_hardness_multiplier` (hardness by plate
thickness, for `HighHardness` plates) and `projective_health_scale`.

Does: sets the energy units that this game keeps fixed, and the blast damage to soldiers: every soldier, AI or not,
takes the table value times 125 times a difficulty factor.

Limits: `projective_health_scale` is read but not used. Without the file the tables are empty, and blasts probably do
no health damage.

Example:
```
{energy_per_blastwave 5.0}
```

See: [blastwave](#blastwave), [HighHardness](r07-armour-volumes-damage.md#highhardness) in Reference 7.

### ground_interaction_radius

Where: `{damage blastwave}`.    Type: number.

Values: 1 when absent.

Does: scales the size of the ground effect where the shell lands and the height at which a resting charge goes off.

Limits: the older word `no_ground_interaction` is read and ignored.

Example:
```
{ground_interaction_radius 0.5}
```

See: [blastwave](#blastwave).
