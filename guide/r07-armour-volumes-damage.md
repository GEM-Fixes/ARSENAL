# Reference 7: Armour, Volumes and Damage

This page lists every key that decides how a shell meets a vehicle or a building: the armour areas and the vanilla macros that write them, the volumes that give a unit its hit shape, the parts (components) that break, the materials in `set/material.set`, and the model files that carry the shapes. Each entry has the same shape: where the key is written, its type, the values the game accepts, what it does, its limits, a short example and where to read more. The longer explanation is in [Chapter 9](09-weapons-ammo-damage.md) (penetration, ricochet, blast) and [Chapter 6](06-data-keys-entities.md) (entities and volumes).

Units used on this page:

- Armour thickness and penetration are in millimetres of steel.
- Positions and sizes inside model files are in model units: 20 units make one metre.
- Angles in data are in degrees.

## How a shell is judged, in short

1. The shell finds the volumes on its path that are allowed to be hit by bullets (the `bullet` flag of `able`). Each volume gives an entry face and an exit face.
2. For the face that was hit, the game takes the side of the volume (front, top, left, right, rear or bottom). For a `.vol` shape the side is stored per triangle in the file; it does not come from the direction of the shot.
3. The thickness for that side comes from the first armour area that covers the volume, if that area gives a number other than 0 for the side. Otherwise the volume's own `{thickness}` is used.
4. Slope makes the plate thicker: `effective = ((slope - 1) * f + 1) * thickness`, where slope is one divided by the cosine of the impact angle (at most 10), and `f` is the thickness divided by the shell's calibre, times the gun's overmatch factor, kept between 0.2 and 1.0.
5. The shell passes when its penetration at that range is at least the effective thickness. There is no dice roll in this test.
6. Whether or not it passed, the armour area can take damage when the shell's energy reaches the area's threshold. When the damage of an area adds up to 1, the area breaks.
7. A shell that fails may ricochet, depending on the material of the volume.

What happens to the crew and the parts after a pass is decided by interaction scripts, not by these keys (see [Parts and how damage reaches them](#parts-and-how-damage-reaches-them) below and [Reference 10](r10-interaction-scripts.md)).

The steps in more detail: [Chapter 9, section 5](09-weapons-ammo-damage.md#5-penetration-test-step-by-step) (the test), [section 6](09-weapons-ammo-damage.md#6-armour-thickness-threshold-and-durability) (thickness, threshold, durability), [section 7](09-weapons-ammo-damage.md#7-ricochet) (ricochet) and [section 8](09-weapons-ammo-damage.md#8-blast-and-fragments) (blast). The gun side of the test (penetration, overmatch, damage curve) is in [Reference 6](r06-weapons-and-ammunition.md#how-penetration-is-worked-out). The job from start to end: [Change armour and see the result](p05-change-armour.md). To try a shot on a real unit, see [The armour table on the Models page](#the-armour-table-on-the-models-page).

<!-- goh: GHDMG-37 GHDMG-27 GHDMG-53 GHDMG-39 GHDMG-38 GHDMG-41 GHDMG-16 GHDMG-14 -->
Gates of Hell: step 4 has more factors. The effective thickness is the overmatch factor times the plate times three factors of the volume (`Quality`, `CastSteel`, `HighHardness`), and the gun can choose one of three more overmatch tables. Step 6 is gone: armour never wears and never breaks. A shell hits each part at most once per step (the nearest of its volumes), and a pass counts only when the shell enters a volume. See [Gates of Hell only](#gates-of-hell-only).

## Armour areas: the `armor` block

An armour area is a named group of volumes that share one set of armour numbers. Areas are written in the unit's `.def` or, much more often, by a macro from `properties/*.ext` or `properties/*.inc` that the `.def` calls.

### armor
Where: top level of an entity `.def`, `.ext` or `.inc`.    Type: block.
Values: any number of `{setting "name" ...}` blocks, and a `{wounds ...}` block that only saved games write.
Does: Holds the armour areas of the entity. Several `{armor}` blocks in one entity add up: areas with the same name merge (see `setting`).
Limits: Any other block inside `{armor}` is an "unexpected token" error. An entity without an `{armor}` block uses only the volumes' own `{thickness}`.
Example:
```
{armor
  {setting "body" {thickness 80 30 20 22} {volumes "body*"}}
}
```
See: [setting](#setting), [thickness (area)](#thickness-area), [Chapter 9, section 6](09-weapons-ammo-damage.md#6-armour-thickness-threshold-and-durability).

### setting
Where: inside `{armor}`.    Type: block with a name string.
Values: an area name such as `"body"`, `"turret"`, `"track"`, followed by any of the area keys on this page.
Does: Declares one armour area. If an area of the same name already exists (from an earlier `{armor}` block or macro), the new keys are merged into it instead of making a second area.
Limits: Merged areas keep the position of their first definition, and the first area in definition order that covers a volume wins, so a later setting of the same name edits the earlier area. A later `{thickness}` replaces the earlier one. `{volumes}` patterns add up.
Example:
```
{setting "turret"
  {thickness 50 30 30 10}
  {volumes "turret*"}
}
```
See: [volumes (area)](#volumes-area), [armor_tank](#armor_tank).

### thickness (area)
Where: inside `{setting}`.    Type: one, two or four numbers, mm.
Values: 1 number = all sides; 2 numbers = front, then the same value for side, rear and top; 4 numbers = front, side, rear, top. When the area has no `{thickness}`, every side is 0.
Does: Gives the plate thickness for every volume the area covers. Left and right both use `side`; bottom uses `top`. A side whose area value is not 0 overrides the volume's own `{thickness}` for that side.
Limits: Three numbers are misread: the third becomes rear and the reader then expects a fourth number for top, so the sides are misaligned and an error is logged. Write 1, 2 or 4 numbers. Editing a volume's own `{thickness}` does nothing on a side where the area gives a value other than 0; change the area (or the macro argument) instead, or put 0 there to let the volumes speak. A nonzero area value also flattens a part that is split into several volumes (for example an upper and a lower glacis) into one number.
Example:
```
{setting "body" {thickness %bod} {volumes "body*"}}
("armor_medium" turret(50 30 30 10) body(80 30 20 22))
```
See: [thickness (volume)](#thickness-volume), [armor_tank](#armor_tank), the Models page section at the end.

### volumes (area)
Where: inside `{setting}`.    Type: one or more strings (wildcard patterns).
Values: patterns such as `"body*"`, `"turret*" "gun*"`. Without `{volumes}` the area covers every volume of the entity.
Does: Chooses which volumes belong to the area. A pattern is matched against the volume's first tag, which is always the volume's own name (`body1`, `body2`), not the extra words in its `{tags}` block.
Limits: A volume that no area covers keeps its own `{thickness}`. When two areas cover one volume, the first area in definition order wins. A name that matches no pattern gets no area at all, for example a volume named `mantled` is not covered by `"mantlet*"`.
Example:
```
{volumes "track*"}
{volumes "shield1*" "shield2*"}
```
See: [tags (volume)](#tags-volume), [setting](#setting).

### threshold
Where: inside `{setting}`.    Type: block.
Values: `{pierce ...}` and `{blast ...}` sub-blocks, each with `{value}`, `{koef}` and, for pierce only, `{calibre}`.
Does: The threshold is the least energy that damages the area at all. For pierce hits the game uses, in this order: `pierce {value}`; else `koef` times the effective thickness; else the effective thickness divided by the gun's `projectileDamageThreshold`; else two thirds of the effective thickness. A shell whose energy reaches the threshold damages the area even when it does not pass. Blast uses `blast {value}` or `blast {koef}` the same way, without slope, and compares the threshold with five times the blast energy written in the data.
Limits: Any key other than these is an "unexpected token" error. `projectileDamageThreshold` cannot be set below 1. The threshold only decides whether the area takes damage; it does not decide the pass.
Example:
```
{threshold
  {pierce {value 12}}
  {blast {value 15}}}
```
See: [durability](#durability), [calibre](#calibre), [Reference 6 (weapons and ammunition)](r06-weapons-and-ammunition.md#projectiledamagethreshold) for `projectileDamageThreshold`.

### durability
Where: inside `{setting}`.    Type: block.
Values: `{pierce ...}` and `{blast ...}` sub-blocks, each with `{value}` or `{koef}`.
Does: Durability is how much damage the area can take before it breaks. The game uses `value` (scaled by the difficulty factor); else `koef` times the thickness; else the thickness times the material's durability from `set/material.set`. Each damaging pierce hit adds `max((E - threshold) * T / (T - threshold), 0.5 * T) / durability`, where E is the smaller of the shell's penetration and T, and T the effective thickness; the durability itself is scaled by the slope the same way as the thickness. A blast hit adds five times its energy divided by the blast durability; slope does not count for blast. The area breaks when the total reaches 1, and the `break_armor` event runs.
Limits: A very large `pierce {koef}` means armour piercing shells practically never break the area; only blast does. Vanilla tanks use `koef 999` on hull and turret, so their outcomes come from scripts, not from plate wear. Areas with `disable_damage_acc` never add up damage.
Example:
```
{durability
  {blast {koef 1.5}}
  {pierce {koef 999}}}
```
<!-- goh: GHDMG-41 -->
Gates of Hell: the block is read but not used. Armour never wears, never breaks, and a hit leaves the plate as strong as before.
See: [threshold](#threshold), [disable_damage_acc](#disable_damage_acc), [durability (material)](#durability-material), [Chapter 9, section 6](09-weapons-ammo-damage.md#6-armour-thickness-threshold-and-durability).

### pierce
Where: inside `{threshold}` or `{durability}` of a `{setting}`.    Type: block.
Values: `{value n}`, `{koef n}`; in `{threshold}` also `{calibre n}`.
Does: Holds the numbers used for shells that hit the plate (armour piercing, solid shot, bullets).
Limits: Unknown keys inside are an "unexpected token" error.
Example:
```
{pierce {value 1000}}
```
See: [threshold](#threshold), [durability](#durability), [blast](#blast).

### blast
Where: inside `{threshold}` or `{durability}` of a `{setting}`.    Type: block.
Values: `{value n}`, `{koef n}`.
Does: Holds the numbers used for explosions (blast waves) that reach the volume. Against armour the game works on five times the energy written in the blast effect, for both the threshold and the damage. The blast threshold is not multiplied by the slope. When an area breaks under a blast, the energy that is left goes on along the blast's path.
Limits: A volume is hit by a blast only if it keeps the `blast` flag of `able` (it is on by default). Unknown keys inside are an "unexpected token" error.
Example:
```
{blast {koef 0.8}}
```
<!-- goh: GHDMG-42 GHDMG-43 -->
Gates of Hell: a volume keeps only as much blast energy as its threshold and passes the rest on to the volumes behind it, so a blast goes through soldiers and thin cover. The `break_armor` value of a blast is the energy the volume kept.
See: [able](#able), [threshold](#threshold), [Chapter 9, section 8](09-weapons-ammo-damage.md#8-blast-and-fragments), [Reference 6, blastwave](r06-weapons-and-ammunition.md#blastwave).

### value
Where: inside `{pierce}` or `{blast}` of `{threshold}` or `{durability}`.    Type: number, mm.
Values: any number. No default: when absent, `koef` or the fallback rule is used.
Does: Sets the threshold or the durability directly.
Limits: A durability `value` is scaled by the single player difficulty factor.
Example: `{value 15}`
See: [koef](#koef).

### koef
Where: inside `{pierce}` or `{blast}` of `{threshold}` or `{durability}`.    Type: number, factor.
Values: any number. Used only when there is no `value`.
Does: Sets the threshold as a share of the effective thickness, or the durability as a multiple of the thickness.
Limits: none known beyond those of `threshold` and `durability`.
Example: `{koef 999}`
See: [value](#value).

### calibre
Where: inside `{threshold {pierce ...}}`.    Type: number, mm.
Values: any number; absent means every calibre counts.
Does: Shells with a smaller calibre than this never damage the area, whatever their energy. This is how skirts and buildings ignore small arms.
Limits: Only for pierce; a `{calibre}` inside `{blast}` is an error. It does not stop the shell from passing; it only stops damage to the area.
Example:
```
{threshold {pierce {calibre 12}}}
```
See: [armor_construction](#armor_construction-and-armor_light--armor_medium--armor_heavy-for-buildings).

### whole_wound
Where: inside `{setting}`.    Type: switch (optional 0 or 1).
Values: `{whole_wound}` or `{whole_wound 1}` turns it on; `{whole_wound 0}` off. Off when absent.
Does: The area ignores slope: the slope factor is 1 for its plates. Vanilla uses it on tracks, wheels and car engines.
Limits: none known.
Example: `{whole_wound}`
See: [ray_cast_thickness](#ray_cast_thickness).

### ray_cast_thickness
Where: inside `{setting}`.    Type: switch (optional 0 or 1).
Values: `{ray_cast_thickness}` on, `{ray_cast_thickness 0}` off. Off when absent.
Does: Instead of a side value, the thickness is the length of the shell's path through the volume times the material's `steelEquivalent`. Slope is ignored. Vanilla buildings use it, so a wall is as strong as its depth.
Limits: The material must have a sensible `steelEquivalent`; with the built-in default (1.0) every millimetre of path counts as a millimetre of steel.
Example:
```
{setting "body" {ray_cast_thickness} {volumes "body*"}}
```
<!-- goh: GHDMG-17 -->
Gates of Hell: the path is traced from just outside the volume, and the quick size estimate is the smallest side of the volume's bounding box, so thresholds of these areas come out a little different.
See: [steelEquivalent](#steelequivalent), [armor_use_volume_thickness](#armor_use_volume_thickness), [Chapter 9, section 6](09-weapons-ammo-damage.md#6-armour-thickness-threshold-and-durability).

### disable_damage_acc
Where: inside `{setting}`.    Type: switch (optional 0 or 1).
Values: on with `{disable_damage_acc}`, off when absent.
Does: The area never adds up damage, so it never breaks from hits.
Limits: none known.
Example: `{disable_damage_acc}`
See: [armor_disable_damage_acc](#armor_disable_damage_acc).

### wounds
Where: inside `{armor}`.    Type: block.
Values: written by the game.
Does: Holds the damage state of the areas in a saved game.
Limits: Do not write it in mod data.
Example: (written only in saves)
See: [State](#state).

## Armour macros in vanilla data

These are not engine keys. They are `(define ...)` macros in `properties/` files that write `{armor}` and `{volume}` blocks for you. A `.def` calls one with arguments, for example `("armor_medium" turret(50 30 30 10) body(80 30 20 22))`. The same macro name, such as `armor_medium`, is defined differently in different files (tanks, armoured cars, cars, guns, boats, buildings); which one a unit gets depends on the file its `.def` includes. Edit a unit's armour in the arguments of its call, never in the shared macro file.

### armor_tank
Where: `properties/tank_unarmed.ext`, called by `armor_light`, `armor_medium`, `armor_heavy` of the same file.    Type: macro.
Values: parameters `t` (track), `track_b` (track blast threshold), `bod` and `tur` (four numbers each: front side rear top), `en` (engine), `gun`, `dur`, `thr`, `pierce_dur`.
Does: Writes five areas: `track` (`track*`, whole_wound, pierce durability value 1000), `turret` (`turret*`), `gun` (`gun*`, pierce threshold 12, blast threshold 15), `body` (`body*`) and `engine` (`engine*`). Hull and turret get `durability {pierce {koef %pierce_dur}}`.
Limits: The light, medium and heavy wrappers pass `pierce_dur(999)`, so armour piercing shells practically never break the hull or turret area. A nonzero `body` side overrides every `body*` volume, so a hull split into upper and lower plates gets one number.
Example:
```
("armor_tank" t(6) track_b(18) bod(%body) tur(%turret) en(25) gun(35) dur(1.5) thr(1.1) pierce_dur(999))
```
See: [durability](#durability), [thickness (area)](#thickness-area).

### armor_light, armor_medium, armor_heavy (tanks)
Where: `properties/tank_unarmed.ext`; called in a tank `.def`.    Type: macro.
Values: `turret(f s r t)` and `body(f s r t)`.
Does: Calls `armor_tank` with class values (engine 12, 25 or 40; gun 15, 35 or 45; blast durability factor 1, 1.5 or 2; blast threshold factor 1, 1.1 or 0.8), adds the tank parts (`components_tank`) and the main vision (`tank_main-l`, `-m` or `-h`).
Limits: Only `turret` and `body` are read by these wrappers; any other argument name in the call is not used by them.
Example:
```
("armor_medium" turret(76 51 51 25) body(51 38 38 22))
("armor_engine" t(40 38 38 22))
("armor_mantlet" t(89))
```
See: [armor_tank](#armor_tank), [armor_engine](#armor_engine), [armor_mantlet](#armor_mantlet).

### armor_spa_light, armor_spa_heavy
Where: `properties/tank_unarmed.ext`.    Type: macro.
Values: `armor` (the body thickness).
Does: Armour for self-propelled guns: makes a `turret` volume tagged both `turret` and `body`, and writes `track`, `body`, `engine` (20 or 30 mm) and `gun` (35 or 45 mm) areas. Body pierce durability is `koef 999`.
Limits: As for `armor_tank`.
Example:
```
("armor_spa_heavy" armor(80 50 30 20))
```
See: [armor_tank](#armor_tank).

### armor_mantlet
Where: `properties/tank_unarmed.ext`.    Type: macro.
Values: `t` (1, 2 or 4 numbers).
Does: Adds a `mantlet` volume (tag and part `mantlet`) and an area `mantlet` that covers `mantlet*`.
Limits: The model must have a volume whose name starts with `mantlet`; a model volume named differently is not covered and counts as 0 mm unless it has its own thickness.
Example: `("armor_mantlet" t(50))`
See: [volumes (area)](#volumes-area).

### armor_engine
Where: `properties/tank_unarmed.ext`.    Type: macro.
Values: `t` (1, 2 or 4 numbers).
Does: Writes an area `engine` that covers `engine*`. Because areas merge by name, it replaces the engine thickness that `armor_tank` set.
Limits: Call it after the `armor_*` class macro.
Example: `("armor_engine" t(30 30 20 22))`
See: [setting](#setting).

### armor_btr, and armor_light / armor_medium for armoured cars
Where: `properties/armoredcar.ext`.    Type: macro.
Values: the wrappers pass `t`, `ta`, `b`, `w` and `k`, but the vanilla body of `armor_btr` does not use them (the lines that would are commented out).
Does: Writes areas `track`, `wheel` (5 mm, whole_wound), `gun`, `body`, `turret` and `engine` with thresholds and durabilities but no thickness, so body, turret and engine volumes use their own `{thickness}`.
Limits: Changing the wrapper numbers changes nothing in vanilla; set the volume thickness instead. The `turret` area covers only the volume named exactly `turret`.
Example:
```
("armor_medium" args 1)
```
See: [thickness (volume)](#thickness-volume).

### armor_car, and armor_light / armor_medium / armor_fuel for cars
Where: `properties/car.ext`.    Type: macro.
Values: the wrappers pass `b`, `k` and `bb`; the vanilla body does not use them for thickness (commented out).
Does: Writes areas `body` (`body*`), `body_back` (`bodyback*`), `engine` (whole_wound), `wheel` (5 mm, whole_wound), `cabin` (5 mm) and `shields`, with thresholds and durabilities.
Limits: The `shields` area patterns in vanilla are `"shield1*" "shiel2*" "shield3*"`; the second pattern is misspelt, so a volume `shield2` is not covered by it.
Example:
```
("armor_light" args 1)
```
See: [volumes (area)](#volumes-area).

### armor_cannon, armor_mortar, and armor_light / armor_medium / armor_heavy for guns
Where: `properties/cannon_armor.ext`.    Type: macro.
Values: `tur`, `t_thr`, `t_dur`, `s` (shield), `b` (body), `w` (wheel).
Does: Writes areas `turret`, `gun`, `shield` (pierce durability value 999, blast durability value three times `tur`), `wheel` and `body`. The wrappers set the shield to 3, 4, 4 and 10 mm for mortar, light, medium and heavy.
Limits: none known.
Example:
```
("armor_cannon" tur(7) t_thr(6) t_dur(15) s(4) b(10) w(14))
```
See: [durability](#durability).

### armor_marine, and armor_light / armor_medium / armor_heavy for boats
Where: `properties/marine.ext`.    Type: macro.
Values: `b` (base thickness) and `k` (factor); the wrappers pass 15, 55 or 85 for `b` and their own argument as `k`.
Does: Writes one area `body` that covers `body*` with thickness `b * k`.
Limits: none known.
Example: `("armor_medium" args 1)`
See: [thickness (area)](#thickness-area).

### armor_construction, and armor_light / armor_medium / armor_heavy for buildings
Where: `properties/construction_generic.inc`.    Type: macro.
Values: `armor_construction` takes `calibre`. The wrappers use calibre 5 (light: rifles and up), 12 (medium: anti-tank rifles and up) and 30 (heavy: guns only).
Does: Writes areas `body` (`body*`) and `roof` (`roof*`) with `ray_cast_thickness` and a pierce threshold calibre. Medium and heavy add blast thresholds and fixed durabilities (body blast durability 25 or 40, pierce 350 or 800).
Limits: The building wrappers do not use the number a `.def` passes with `args`. Walls get their strength from depth and material, not from a side value.
Example:
```
("armor_heavy" args 0.8)
```
See: [ray_cast_thickness](#ray_cast_thickness), [calibre](#calibre).

### armor_adjustable and its presets
Where: `properties/construction_generic.inc`.    Type: macro.
Values: `thresh_fg`, `thresh_ap`, `dur_fg`, `dur_ap`, `calibre`. Presets: `armor_hedgehog`, `armor_fabric`, `armor_stack`, `armor_glass`, `armor_sandbag`, `armor_sandbag_woodbeam`, `armor_post`, `armor_wires`, `armor_fence_wood`.
Does: Sets the blast and pierce threshold and durability of `body`, and a fixed `roof` (blast threshold value 6, blast durability value 10).
Limits: none known.
Example:
```
("armor_adjustable" thresh_fg(10) thresh_ap(10) dur_fg(40) dur_ap(70) calibre(0))
```
See: [threshold](#threshold), [durability](#durability).

### armor_house_wood, armor_house_concrete, armor_house_concrete_light, armor_house_wood_heavy
Where: `properties/construction_generic.inc`.    Type: macro.
Values: none.
Does: Combine the building armour with grenade protection: `armor_house_wood`, `armor_house_concrete` and `armor_house_concrete_light` call `armor_medium`, `armor_house_wood_heavy` calls `armor_heavy`; the two concrete ones add `light_concrete`.
Limits: These are the only material pairs with ready-made house macros.
Example: `("armor_house_concrete")`
See: [blast_protection](#blast_protection-frag_grenade_protection), [light_concrete](#light_concrete).

### blast_protection, frag_grenade_protection
Where: `properties/construction_generic.inc`.    Type: macro.
Values: `dmg` (blast threshold); `frag_grenade_protection` passes 6.
Does: Sets a blast threshold `value` on `body` and `roof`, so weak blasts do nothing.
Limits: none known.
Example: `("frag_grenade_protection")`
See: [threshold](#threshold).

### light_concrete
Where: `properties/construction_generic.inc`.    Type: macro.
Values: none.
Does: Sets pierce durability `koef 5` on `body` and `roof`.
Limits: none known.
Example: `("light_concrete")`
See: [durability](#durability).

### armor_use_volume_thickness
Where: `properties/construction_generic.inc`.    Type: macro.
Values: none.
Does: Turns `ray_cast_thickness` off on `body` and `roof`, so the volumes' own `{thickness}` is used.
Limits: The volumes then need a thickness, or they count as 0 mm.
Example: `("armor_use_volume_thickness")`
See: [ray_cast_thickness](#ray_cast_thickness), [thickness (volume)](#thickness-volume).

### armor_disable_damage_acc
Where: `properties/construction_generic.inc`.    Type: macro.
Values: none.
Does: Turns on `disable_damage_acc` for `body` and `roof`, so the building never wears down.
Limits: none known.
Example: `("armor_disable_damage_acc")`
See: [disable_damage_acc](#disable_damage_acc).

## Volumes: the `volume` block

A volume is one hit shape: a box, cylinder, sphere or polyhedron (`.vol` file) attached to a bone of the model. The same volume name can be written in two places: the `.mdl` gives the shape and the bone, the `.def` gives thickness, tags, part and flags. The game joins the two blocks by name, in either order.

### volume
Where: top level of an entity `.def`, `.ext` or `.inc` (`{volume "name" ...}`), and top level of a `.mdl` (`{Volume "name" ...}`).    Type: block with a name string.
Values: the keys in this section. The name becomes the volume's first tag.
Does: Declares or extends one volume. Blocks with the same name from the `.def` and the `.mdl` fill one volume.
Limits: A `.def` volume that has no shape in the `.mdl` is dropped without a message, and its thickness is lost. A volume whose `{bone}` does not exist in the skeleton is dropped without a message. Two shape keys for one name give the warning `Volume '<name>' box already configured! (possible volume duplication)` and the later shape wins. Other warnings: `Not orthonormal matrix for volume`, `Not invertable volume matrix`. The key `hollow` is accepted by the reader's list but not handled: do not use it.
Example:
```
{volume "body1"
  {tags "body"}
  {component "body"}
  {thickness 30}}
```
<!-- goh: GHDMG-37 GHDMG-38 GHDMG-39 GHDMG-53 -->
Gates of Hell: the volume block takes more keys: `HighHardness`, `CastSteel`, `Quality` and `depend_on_wind`. This game does not read them: in a volume block they are an "unexpected token" error. See [Gates of Hell only](#gates-of-hell-only) and [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).
See: [bone](#bone), [polyhedron](#polyhedron), [Chapter 6, section 5](06-data-keys-entities.md#5-volumes), [Chapter 16, section 6](16-effects-sound-models.md#6-wiring-a-model-into-a-unit), [Edit a model or an animation](p06-edit-a-model.md).

### tags (volume)
Where: inside `{volume}`.    Type: one or more strings.
Values: words such as `"body"`, `"turret"`, `"shield"`, `"explosive"`, `"fire"`.
Does: Adds tags after the volume's name. Interaction scripts test them with `{if volume "x"}`, so `{tags "turret"}` lets one script line match `turret1` and `turret2`. Volumes tagged `shield` follow a `shield` extender's on and off state.
Limits: Armour area `{volumes}` patterns look only at the name (first tag), not at these tags.
Example: `{tags "turret"}`
See: [volumes (area)](#volumes-area), [extender shield](#extender-shield).

### component (volume)
Where: inside `{volume}`.    Type: string.
Values: the name of a part declared with a top-level `{component}` block.
Does: Links the volume to a repairable part, so a hit on the volume is a hit on that part for scripts (`{if component "x"}`, `{component break}`).
Limits: Several volumes may share one part (`body1`, `body2` both in `body`). Without `{component}` the volume belongs to the part that has the volume's own name; when there is no such part, no part can break from a hit on this volume.
Example: `{component "turret"}`
See: [component](#component), [Parts and how damage reaches them](#parts-and-how-damage-reaches-them).

### thickness (volume)
Where: inside `{volume}` in the `.def` (also accepted in the `.mdl`).    Type: number plus optional side blocks, mm.
Values: `{thickness N}` sets all six sides; then `{front n}` `{rear n}` `{top n}` `{bottom n}` `{left n}` `{right n}` override one side each. A second number after N is read and ignored. Absent: 0 on every side.
Does: Gives the plate thickness of the volume, used on every side where no covering armour area gives a nonzero value.
Limits: A later `{thickness N}` for the same volume resets all six sides. A volume that bullets or blasts can hit with a side under 0.00001 mm logs `Incorrect thickness for volume "<name>" in entity <unit>`; such a side lets every shell through.
Example:
```
{thickness 40 {front 82} {rear 10} {top 17} {bottom 17}}
```
See: [thickness (area)](#thickness-area).

### front, rear, top, bottom, left, right
Where: inside `{thickness}` of a volume.    Type: number, mm.
Values: any number.
Does: Sets the thickness of one side. Sides are those of the volume in its own frame; for a `.vol` shape each triangle carries its side in the file.
Limits: A shot does not choose its side by direction: a steep hit on a face marked front still uses the front value.
Example: `{left 62} {right 62}`
See: [SIDE](#side).

### box
Where: inside `{Volume}` in the `.mdl` (or `.def`).    Type: three numbers, model units.
Values: full sizes along X, Y and Z.
Does: A box shape centred on the volume's origin. Its faces are numbered like the `.vol` sides.
Limits: The numbers are full sizes, not half sizes.
Example: `{Box 20.7 13.4 26.0}`
<!-- goh: GHKEY-33 -->
Gates of Hell: a side under 0.01 is widened to 0.01 with the warning `Invalid box dimensions for volume <name>: can not be less than 0.01`.
See: [matrix34](#matrix34), [Chapter 16, section 5](16-effects-sound-models.md#5-model-files).

### cylinder
Where: inside `{Volume}`.    Type: two numbers, model units.
Values: radius, then height.
Does: A cylinder along the volume's local Z axis, centred on its origin (from minus half the height to plus half).
Limits: none known.
Example: `{Cylinder 1.9 60}`
See: [box](#box).

### sphere
Where: inside `{Volume}`.    Type: number, model units.
Values: radius.
Does: A sphere centred on the volume's origin.
Limits: none known.
Example: `{Sphere 6}`
See: [box](#box).

### polyhedron
Where: inside `{Volume}` in the `.mdl`.    Type: string (file name).
Values: a `.vol` file, relative to the folder of the `.mdl`.
Does: A shape made of triangles from a `.vol` file. Each triangle carries its side.
Limits: A missing file stops the load with `Resource not found`. The file need not be convex; vanilla ships non-convex and mirrored shapes that work.
Example: `{Polyhedron "body1.vol"}`
See: [.vol file](#vol-file).

### bone
Where: inside `{Volume}` (usually in the `.mdl`).    Type: string.
Values: a bone name from the model's skeleton.
Does: Attaches the shape to that bone, so it follows the turret or gun as they turn.
Limits: A bone that does not exist drops the volume without a message.
Example: `{Bone "gun_rot"}`
See: [bone (model)](r08-vision-effects-sound.md#bone-model) in Reference 8.

### position
Where: inside `{Volume}`.    Type: three numbers, model units.
Values: x y z.
Does: Moves the shape's origin relative to its bone. Sets only the translation.
Limits: Keys apply in the order they are written; a later `{Matrix34}` overwrites it.
Example: `{Position 4.8 0 -16.2}`
See: [matrix34](#matrix34).

### orientation
Where: inside `{Volume}`.    Type: nine numbers.
Values: three axis rows.
Does: Turns the shape relative to its bone. Sets only the axes.
Limits: The axes should be orthonormal, or the load warns.
Example: `{Orientation 1 0 0 0 -1 0 0 0 1}`
See: [matrix34](#matrix34).

### matrix34
Where: inside `{Volume}`.    Type: twelve numbers.
Values: three axis rows, then the translation.
Does: Sets axes and position together.
Limits: A matrix that is not orthonormal logs `Not orthonormal matrix for volume`.
Example:
```
{Matrix34 1 0 0  0 0 1  0 -1 0  -6.9 0 -11.97}
```
See: [position](#position), [orientation](#orientation).

### material
Where: inside `{volume}`.    Type: string.
Values: a material name from `set/material.set` (`steel`, `concrete`, `wood`, `straw`, `flesh`, `sand`, `ice`, `rock`, `ground`, `water`, `underwater`, `steelball`, `dummy` in vanilla).
Does: Chooses the volume's material for ricochet, `steelEquivalent`, durability fallback and damage decals.
Limits: An unknown name is a fatal error at load: the game stops with `Unknown material`. Without `{material}` the volume uses the entity's default material (see `DefaultMaterial`).
Example: `{material "dummy"}`
See: "Materials" below.

### DefaultMaterial
Where: entity `.def`, written as `{volume DefaultMaterial "name"}`.    Type: string.
Values: a material name from `set/material.set`.
Does: Gives every volume of the entity without its own `{material}` this material. Without it, the first of the entity tags `flesh`, `steel`, `wood`, `concrete`, `sand`, `ice`, `straw` that the entity has is used.
Limits: An unknown name is a fatal error at load: the game stops with `Unknown material : <name>`. When no material is found at all, the game logs `Undefined material for entity : <unit>` (not for `_x` and `_xx` wrecks) and uses a built-in default with no ricochet table.
Example: `{volume defaultmaterial "sand"}`
See: [material](#material).

### density
Where: inside `{volume}`.    Type: number.
Values: any number.
Does: Density of the volume for the physics of loose bodies (unconfirmed).
Limits: none known.
Example: `{density 1}`
See: [Reference 4](r04-chassis-and-movement.md).

### able
Where: inside `{volume}` in the `.def` or the `.mdl`.    Type: block of flags.
Values: flags `visible`, `bullet`, `throwing`, `overlap`, `obstacle`, `contact`, `contact_ground`, `blast`, `select`, `hole`, `holed`, `touch`, `float`, `window`, `nolook`, `nowounddecal`, each written `{flag}` (on), `{flag 1}` or `{flag 0}` (off). An optional word `clear` first turns every flag off before the list. Default set: `visible bullet throwing obstacle contact contact_ground blast select`.
Does: Says what the volume takes part in. `bullet`: shells trace it. `blast`: blast waves damage it, and an unbroken volume with `blast` shields what is behind it. `visible`, `contact`, `contact_ground` without `nolook`: AI sight can see the unit through this volume. `hole` and `holed`: open hatches and gun ports (a shot into a `hole_man` volume reaches the crew). `window`: window volumes of buildings. `nowounddecal`: no wound or blood decals on it.
Limits: An unknown flag logs `unknown flag`. A volume cleared of `blast` lets blasts pass and shields nothing. The effect of `throwing`, `overlap`, `obstacle`, `select`, `touch` and `float` is not covered by this guide.
Example:
```
{able {Visible 0} {Obstacle 0} {Contact 0}}
{able clear {hole}}
```
<!-- goh: GHKEY-31 GHINT-25 GHDMG-42 -->
Gates of Hell: has one more flag, `blockcamera` (on by default; the volume stops the camera), which this game does not know. An unbroken volume with `blast` no longer shields everything behind it (see [blast](#blast)).
See: [disabled](#disabled), [ram volume](#ram-volume), [Chapter 9, section 8](09-weapons-ammo-damage.md#8-blast-and-fragments), [Chapter 6, section 5](06-data-keys-entities.md#5-volumes).

### disabled
Where: inside `{volume}`.    Type: switch.
Values: present or absent.
Does: Turns the volume off: it takes part in nothing. Used for helper volumes.
Limits: none known.
Example: `{disabled}`
See: [able](#able).

### ram volume
Where: a volume named `ram` in the `.mdl` (and optionally the `.def`).    Type: volume name with a fixed meaning.
Values: any shape.
Does: When the unit spawns, all `able` flags of the volume named `ram` are cleared, so shells and blasts never hit it. While the unit moves, the volume becomes a contact (collision) shape against units whose collider group is listed in the moving unit's collider profile under `useRamVolume` in `set/colliders.set` (vanilla: guns, motorcycles, cars, trucks, armoured cars and tanks).
Limits: Any thickness or `able` you write on it has no effect on shells. Only the volume whose name is exactly `ram` gets this treatment.
Example:
```
{Volume "ram" {Polyhedron "ram.vol"} {Bone "body"} {Position 4.8 0 -16.2}}
```
See: [able](#able), [Reference 4](r04-chassis-and-movement.md).

### helper volume names
Where: volume names in `.mdl` and `.def`.    Type: naming convention.
Values: names that vanilla scripts and macros expect: `body1` to `body4`, `turret`, `turret1`, `mantlet`, `engine`, `gun`, `trackleft`, `trackright`, `shieldl1`.. and `shieldr1`.., `inventory`, `crew`, and the helper shapes `inbody`, `inturret`, `incasemate`, `hole_man`.
Does: Armour macros pick volumes by these name patterns, and the vanilla tank scripts branch on the volume that was hit (body, turret, mantlet, engine, and the `explosive` tagged ammunition rack).
Limits: Renaming a volume silently takes it out of its area and out of the script branches.
Example: `{volume "inventory" {tags "explosive"} {thickness 0.1}}`
See: [volumes (area)](#volumes-area).

## Parts and how damage reaches them

A part (component) is a repairable piece of a vehicle: `body`, `engine`, `turret`, `gun`, `trackleft`, `trackright`, shields and so on. Volumes are linked to parts with `{component "x"}`; a volume without it belongs to the part that has the volume's own name, if there is one. A pass alone never changes a part; only an armour area that breaks does, as step 1 says. What happens is:

1. The shell hit runs the [bullet_hit](r10-interaction-scripts.md#bullet_hit) event on the unit, before the test. A pass on an entry face runs [pierce](r10-interaction-scripts.md#pierce). An area that breaks runs [break_armor](r10-interaction-scripts.md#break_armor) (or [break_armor_again](r10-interaction-scripts.md#break_armor_again) if the part was already damaged), with the sender `"pierce"` or `"blast"`. After a `break_armor` from a shell, the game itself sets the volume's part to broken when it was working, unless the script ended the shell with [bullet_detonate](r10-interaction-scripts.md#bullet_detonate). Blasts run [blast_hit](r10-interaction-scripts.md#blast_hit) once per explosion and [blast](r10-interaction-scripts.md#blast) for each volume and part; a second blast wave of the same filling (`Damage add blastwave`) is its own explosion with its own `blast_hit`.
2. The vanilla interaction scripts for tanks choose a reaction from the shell's class tag and the volume that was hit (body, turret, mantlet, engine, ammunition rack) and then break or destroy the part with the [component](r10-interaction-scripts.md#component) and [components](r10-interaction-scripts.md#components) actions, kill crew, start fires and so on.
3. When a part changes state, the [break](r10-interaction-scripts.md#break) or [repair](r10-interaction-scripts.md#repair) event runs. A part destroyed straight from working passes through broken, so `break` runs twice. A broken part shows its view from the unit's `<unit>_x` entity, a destroyed part from `<unit>_xx`, and the part's bone plays its `break` or `repair` animation.

The game never hurts the crew seated in a vehicle through its armour, neither from the shell, nor from a shaped charge jet, nor from a blast. Crew losses come only from the vehicle's scripts: [kill_crew](r10-interaction-scripts.md#kill_crew), [crew_emit](r10-interaction-scripts.md#crew_emit), [crew_throw_off](r10-interaction-scripts.md#crew_throw_off). A soldier on a seat that has its own bone is a unit of his own on that bone and can be hit himself; a shot into a `hole_man` volume reaches him that way.

Scripts never see by how much the shell passed. Events and actions are listed in [Reference 10](r10-interaction-scripts.md). To see all of this for one shot, use "Behind the armour" (see [The armour table on the Models page](#the-armour-table-on-the-models-page)).

<!-- goh: GHDMG-13 GHDMG-41 GHDMG-01 GHDMG-02 GHDMG-07 -->
Gates of Hell: armour does not wear and does not break the part. Parts have health points instead (`/set/component.set` and the vehicle's `perks`), scripts take health off them, and a destroyed part runs the `destroy` reaction, not `break`. Data written for this game relies on the armour break to break parts, so it loses that path in Gates of Hell. See [Gates of Hell only](#gates-of-hell-only).

### component
Where: top level of an entity `.def`, `.ext` or `.inc`.    Type: block with a name string.
Values: a part name, then `{RepairTime}`, `{Tags}`, and in saved games `{State}` and `{RepairTimeLeft}`.
Does: Declares a part. Its name is its first tag.
Limits: Any other key logs "unexpected token". The part's bones need a view in the `_x` and `_xx` models, or the game warns that the bone has no broken view.
Example:
```
{component "turret" {RepairTime 60}}
```
<!-- goh: GHDMG-01 GHDMG-02 GHDMG-04 GHDMG-10 -->
Gates of Hell: each part also has health points, taken from the vehicle's `perks` and `/set/component.set`. A part with no perk gets 1 health point and breaks at the first damage. The vehicle counts as destroyed when its part named `body` is destroyed, so a vehicle needs a part named `body`.
See: [component (volume)](#component-volume), [Reference 3](r03-extenders-and-components.md), [Chapter 6, section 7](06-data-keys-entities.md#7-extenders-sensors-and-seats).

### RepairTime
Where: inside `{component}`.    Type: number, seconds.
Values: any number.
Does: Time a crew needs to repair the part.
Limits: none known.
Example: `{RepairTime (* %repair 25)}`
<!-- goh: GHDMG-09 -->
Gates of Hell: a working part that lost health points needs only the share of `RepairTime` that matches the health it lost.
See: [component](#component).

### Tags (component)
Where: inside `{component}`.    Type: one or more strings.
Values: words such as `"shield"`, `"mover"`.
Does: Adds tags to the part, used by `{if component "x"}` and by `{components "x" break}` to pick parts.
Limits: none known.
Example: `{component "shieldl1" {tags "shield"}}`
See: [component](#component).

### State
Where: inside `{component}`, written by saved games.    Type: word.
Values: `work`, `broken`, `destroyed`.
Does: The damage state of the part. Destroying a working part first breaks it, so the `break` event runs for both steps. Repairing a part clears the armour damage spots of the volume whose name is the part's name.
Limits: Another word logs `Invalid component state`.
Example: `{State broken}`
<!-- goh: GHDMG-07 GHDMG-08 GHDMG-06 -->
Gates of Hell: a destroyed part runs the `destroy` reaction; this game runs `break` for both broken and destroyed. Repair clears the damage spots of every volume of the part, not only the volume with the part's name. A state change also sets the part's health points.
See: [RepairTimeLeft](#repairtimeleft), [break](r10-interaction-scripts.md#break), [repair](r10-interaction-scripts.md#repair).

### RepairTimeLeft
Where: inside `{component}`, written by saved games.    Type: whole number.
Values: written by the game.
Does: The repair time still to go when the game was saved.
Limits: Do not write it in mod data.
Example: (written only in saves)
See: [State](#state).

### extender shield
Where: `{extender "shield" ...}` in an entity `.def`.    Type: block.
Values: `{on}`, `{off}`, `{no_blast}`.
Does: Side skirts: volumes tagged `shield` block bullets while their `shield`-tagged parts are intact, and follow the extender's on and off state.
Limits: none known.
Example: `{extender "shield" {on}}`
See: [tags (volume)](#tags-volume), [Reference 3](r03-extenders-and-components.md).

## Materials: `set/material.set`

`set/material.set` has the signature `materials` and holds one block per material: `{"steel" ...}`. Volumes reach it through `{material}` or `DefaultMaterial`. A mod that ships its own `material.set` replaces the whole file, so keep every vanilla material in it.

### ricochet
Where: inside a material block.    Type: block.
Values: `{chance}`, `{angle}`, `{velocityDumping}`, `{gravityScale}`.
Does: Describes how shells bounce off this material after a failed penetration. A material without a `{chance}` table never ricochets.
Limits: Unknown keys inside are an "unexpected token" error.
Example:
```
{ricochet
  {chance {0 1} {15 1} {30 0.6} {45 0.3} {60 0.15} {75 0} {90 0}}
  {velocityDumping 0.9}}
```
See: [chance](#chance), [Chapter 9, section 7](09-weapons-ammo-damage.md#7-ricochet).

### chance
Where: inside `{ricochet}`.    Type: list of `{angle chance}` pairs.
Values: angle in degrees of grazing (90 minus the angle to the face normal, so 0 is a shell skimming along the plate), chance 0 to 1. Vanilla steel: 1 up to 15 degrees, 0.6 at 30, 0.3 at 45, 0.15 at 60, 0 at 75 and 90. Concrete: 1 at 0, 0.8 at 15, 0.5 at 30, 0.2 at 45, 0 from 60.
Does: The chance that a shell which failed to pass bounces. Between points the value is interpolated.
Limits: There is no ricochet roll before the penetration test. No ricochet when the angle is past the last point of the table, after two ricochets of one shell, when the gun has `DisableRicochet`, when the ammunition is tagged `fg` or `no_ricochet`, or when the plate's area broke on that hit.
Example: `{chance {0 1} {45 0.2} {90 0}}`
See: [angle](#angle), [DisableRicochet](r06-weapons-and-ammunition.md#disablericochet) and [RicochetEnergyDamping](r06-weapons-and-ammunition.md#ricochetenergydamping) in Reference 6.

### angle
Where: inside `{ricochet}`.    Type: list of `{in out}` pairs, degrees.
Values: incoming grazing angle, outgoing angle. Without the block, every angle goes out as it came in. Vanilla steel: 1 to 1, 10 to 3, 30 to 5, 45 to 15, 90 to 90.
Does: Deflection table: the angle at which the ricochet leaves.
Limits: An `out` larger than `in` logs `Invalid ricochet angle` and is clamped to `in`; the message is harmless.
Example: `{angle {1 1} {10 3} {30 5} {45 15} {90 90}}`
See: [chance](#chance).

### velocityDumping
Where: inside `{ricochet}`.    Type: number, factor.
Values: vanilla steel 0.9, concrete 0.8, wood 0.7; built-in default 1.2.
Does: Scales the speed kept by a ricochet: the factor is `(0.9 - cos(a) * 0.2) * velocityDumping`. When the gun has a `RicochetEnergyDamping` table, that table sets the energy kept instead.
Limits: A ricochet whose new speed is too low does not happen. `ricochetDamageClip` of the gun caps the damage a ricocheted shell can still do.
Example: `{velocityDumping 0.9}`
See: [gravityScale](#gravityscale).

### gravityScale
Where: inside `{ricochet}`.    Type: number, factor.
Values: vanilla steel 1.1, concrete and wood 1.2; default 1.1.
Does: Multiplies the gravity of the ricocheted shell.
Limits: none known.
Example: `{gravityScale 1.1}`
See: [velocityDumping](#velocitydumping).

### physics, friction, restitution
Where: `{physics {friction f} {restitution r}}` inside a material block.    Type: block with two numbers.
Values: friction default 1.0, restitution default 0.3. Vanilla: steel 1.0 and 0.4, concrete 2.0, sand 7.0, ice 0.5, water 9.0.
Does: Friction and bounce of loose bodies on this material.
Limits: Unknown keys inside are an "unexpected token" error.
Example: `{physics {friction 2.0} {restitution 0.4}}`
See: [Reference 4](r04-chassis-and-movement.md).

### steelEquivalent
Where: inside a material block.    Type: number, mm of steel per mm of material.
Values: vanilla steel, concrete 0.1; wood 0.01; straw 0.001. Default 1.0.
Does: Used by areas with `ray_cast_thickness`: the thickness is the path length through the volume times this number.
Limits: Only `ray_cast_thickness` areas use it.
Example: `{steelEquivalent 0.1}`
See: [ray_cast_thickness](#ray_cast_thickness).

### durability (material)
Where: inside a material block.    Type: block `{pierce n} {blast n}`.
Values: default 1 for both. Vanilla concrete and wood pierce 10, straw 20.
Does: Durability per millimetre, used when an armour area sets neither `value` nor `koef` for its durability.
Limits: none known.
Example: `{durability {pierce 10} {blast 1}}`
See: [durability](#durability).

### damage (material)
Where: inside a material block.    Type: block.
Values: `{radius m}` (size of a damage spot, metres), `{scale f}` (decal size factor), `{stage "texture" threshold}` repeated.
Does: Armour hits leave damage spots on the volume. A new hit within `radius` of a spot on the same part adds to it, and each `stage` puts a decal on the spot once its damage passes the threshold.
Limits: none known.
Example:
```
{damage {radius 1.2} {scale 1.8}
  {stage "/texture/wound/metal_dmg01.mtl" 0.2}}
```
<!-- goh: GHDMG-20 GHKEY-34 -->
Gates of Hell: a spot's damage is the strongest single hit there, not the sum of the hits. A stage can also carry a fade time, `{stage {"name" seconds} threshold}`; this game probably does not read that form.
See: [wound](#wound).

### wound
Where: inside a material block, repeated.    Type: block.
Values: `{range lo hi}` (calibre range, mm: a shell counts when its calibre is above `lo` and at most `hi`), `{scale f}`, `{calibre c}`, `{stage "texture" ["texture2"] threshold}`.
Does: Hole decals for shell hits by calibre. The decal size is `scale` times the shell calibre divided by `calibre`.
Limits: A shell calibre outside every range leaves no hole decal. Volumes with `nowounddecal` get none.
Example:
```
{wound {range 21 50} {scale 12} {calibre 45}
  {stage "/texture/wound/metal01.mtl" 0}}
```
See: [able](#able).

## Model files a modder meets

The `.mdl` file is described in [Reference 8](r08-vision-effects-sound.md#mdl); its `{Volume}` blocks use the keys of the volume section above. Here is the binary shape file.

### .vol file
Where: next to the `.mdl`, named in `{Polyhedron "x.vol"}`.    Type: binary file, little-endian.
Values: a 4-byte header (`EVLM` in vanilla), then the chunks `VERT`, `INDX` and `SIDE` in that order.
Does: Holds the triangles of one hit shape, in the space of its bone, in model units. After loading, the shape is centred and the same shift is added to the volume's matrix, so the points end where the file put them.
Limits: The header word is not checked. Any other chunk name stops with `Invalid block in .VOL file!`. A chunk that claims more data than the file holds gives `Attempt to read beyond the stream!` or garbage. Do not edit by hand; all 3,422 vanilla files are `VERT INDX SIDE`. Vanilla shapes have their triangles wound so that the normal points into the solid.
Example: (binary file; not edited by hand)
See: [VERT](#vert), [INDX](#indx), [SIDE](#side), [Chapter 16, section 5](16-effects-sound-models.md#5-model-files).

### VERT
Where: first chunk of a `.vol`.    Type: count (32-bit), then three floats per point.
Values: points in bone space, model units.
Does: The corner points of the shape.
Limits: Must come before `INDX`.
Example: (binary)
See: [INDX](#indx).

### INDX
Where: `.vol`, after `VERT`.    Type: count (32-bit), then 16-bit indices.
Values: three indices per triangle.
Does: Builds the triangles from the points.
Limits: A count that is not a multiple of three leaves the last indices unread and throws the rest of the file out of step. An index past the number of points is not checked; keep every index below the point count.
Example: (binary)
See: [SIDE](#side).

### SIDE
Where: `.vol`, after `INDX`.    Type: count (32-bit), then one byte per triangle.
Values: 1 front (+X), 2 top (+Z), 3 left (+Y), 4 right (-Y), 5 rear (-X), 6 bottom (-Z), in the bone's frame. A value above 6 counts as front (vanilla files contain some 7s).
Does: Says which `{thickness}` side each triangle uses, and is the side number scripts get from `bullet_hit` (0 front, 1 top, 2 left, 3 right, 4 rear, 5 bottom).
Limits: Without a `SIDE` chunk the triangles have no side and the thickness lookup breaks: every triangle needs an entry. A value of 0 also counts as front. To change which side a face uses you must rewrite this chunk; data alone cannot re-side a face.
Example: (binary)
See: [front, rear, top, bottom, left, right](#front-rear-top-bottom-left-right).

## The armour table on the Models page

The Models page of ARSENAL (tab Models & Sim) has an Armor section ("Armour: thickness, map and shot test") that reads a vehicle's armour with your mod laid over the game. It has five parts: who shoots, the thickness table, the map, the shot test and "Behind the armour". Everything in it reads only, except the edit box.

Who shoots:

- "Search for a gun" finds a gun by part of its name; "Shell" picks one of the shells it loads; "Range" is 0 to 5000 m.
- The page then says how much flat armour that shell goes through at that range: "This shell goes through N mm of flat armour at M m."

The "Thickness of each part" table:

- Two summary lines, "Hull" and "Turret", with front, side, rear and top. Hull is the volume named `body`, or else the first volume whose name starts with `body` or `hull`; Turret likewise with `turret`. Volumes that are in the model are preferred. These lines are a summary of one volume, not of the whole part: a hull made of several volumes has a value per plate.
- One row per volume, with a column for each of the six sides (front, top, left, right, rear, bottom) and a note. Each number is what the game uses for that side, after the rules above: pointing at it tells you whether it was "set on the part itself", "from the armour area" (and which), or "no value: 0 mm", with the file and line.
- Notes per row: "number comes from the armour area" (the area overrides the volume's own value, so edit the area or the macro call), "not in the model, so it is never hit" (a `.def` volume with no shape in the `.mdl`), "no armour value, counts as 0 mm", "in the model but not in the unit's file", "never hit by shells: switched off in the unit file" (`able` without `bullet`), "never hit by shells: the game uses it only for ramming and switches it off when the unit appears" (the [ram volume](#ram-volume)), "the model has no shape for it, so it is never hit", and "thickness is measured along the shell's path, the slope is not added" (an area with [ray_cast_thickness](#ray_cast_thickness)).
- "Where each number comes from (file and line)" lists the file and line of every value, and a count of problems found.

The edit box (click a number, "click to change"):

- "New thickness" (0 to 1000 mm) and "Which sides": only the side you clicked, or all six sides.
- "Try it" shows what would change and writes nothing. "Change it" writes. The unit's file is copied into your mod first; nothing is written into the game. When the number is shared with other parts (an armour area or a macro argument), the box says so and lists them, and only "Change all of them" changes it.
- After a change the table and the map are read again. Restart the game or re-read the mod to see it in game.

The map ("What happens across the whole side"):

- "Shoot from" Front, Rear, Left, Right or Top. A grid of parallel straight shots crosses the whole side.
- "Colour by": "what happens" (goes through, bounces off, stops, no armour in the way) or "thickness on the slope (mm)". A line under it gives the share of shots that hit armour and go through.
- Pointing at a cell names the plate; clicking a cell shoots through that spot in the shot test.

The "Shot test":

- One shot, with the plates it meets in order: Part, Side, mm, Angle, "mm on the slope", "Shell can still do (mm)" and "What happens" (goes through, bounces off, stops in the plate, blows up in the plate, spent before it gets there, the jet does not reach, passes with nothing armoured, misses), then one sentence.
- In the 3D view the model is coloured by thickness; clicking a face shoots at it from the chosen side.

"Behind the armour":

- What the shot does to the parts, the crew and the tank as a whole. It follows the game's own rules (the events of [Parts and how damage reaches them](#parts-and-how-damage-reaches-them)) and then the unit's interaction scripts, from the mod first and from the game where the mod changes nothing.
- Options: "Keep the damage of earlier shots", "Fresh tank", "Without the mod" (the game alone), and "Follow for (s)": how many seconds after the hit the scripts are followed, 1 to 600, 120 when empty.
- It lists the "Game events:", the "Script blocks of this unit:", the outcome for each part of the vehicle (part broken or destroyed, crew dead, leaves or stunned, cannot move, cannot shoot, cannot aim, burns, explodes, torn off) and the tags added. "Show every script step" lists each step, and "Open" opens that script line in the Editor page.
- For a shaped charge it shows the jet behind the armour; for a shell that sets fires, the fire and whether the unit catches fire; under "Blasts", what the blast of the shell's own filling or of a script reaches.
- Results that depend on chance come from repeated runs. "Script words that were skipped, so the result may miss something:" names script words it does not follow, and "The scripts also ask about things the shot does not say:" names the inputs the scripts test that one shot cannot give. The flight after a ricochet is not followed.

The Shot tool in the 3D view (Model tab, button "Shot") does the same from the model you have open for editing, with its unsaved changes: "Search guns", "Shell", "Range", "Shoot from" (front, rear, left, right, top, the camera, or a typed azimuth and elevation), "Aim at" (a volume), "Shoot" and "Fresh tank". It draws the ray and shows the result behind the armour. It needs a mod folder and an open model.

The map and the shot test use the rest pose of the model and straight shots; they do not model gun spread or the single player difficulty factor.

The command way is the armour simulator: `ARSENAL armorsim table <unit>`, `shot`, `map`, `effects` (the shot followed behind the armour, with `--samples N`, `--seed N` and `--until s`) and `edit` (one number into a mod folder, `--dry` to try). `ARSENAL armorsim --help` lists the options. The Quick Guided Task has a recipe for the same job: "I want to" change "the armour of a vehicle" (see [Use the Quick Guided Task](p17-quick-guided-task.md)).

Used in: [Chapter 9, section 11](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window), [Change armour and see the result](p05-change-armour.md), [Chapter 19](19-toolchain.md).

## Not described yet

These keys appear in vanilla data or in the game's key tables but no source describes their effect yet:

- volume tag `no_target`
- component tags `mover`, `noDestroyedView`
- `able` flags `throwing`, `overlap`, `obstacle`, `select`, `touch`, `float` (their exact effect)
- the optional word the volume `{thickness}` reader accepts before the number

## Gates of Hell only

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

<!-- goh: GHDMG-37 GHDMG-38 GHDMG-39 GHDMG-53 GHKEY-29 GHKEY-33 GHDMG-01 GHDMG-02 GHDMG-03 GHDMG-04 GHDMG-05 GHDMG-10 GHDMG-25 GHDMG-49 GHDMG-44 GHDMG-50 GHDMG-41 -->

These keys exist only in Gates of Hell. This game does not read them: a unit brought over from Gates of Hell must drop them, and the strength they gave is lost unless you put it into the thickness by hand (see [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md)). The weapon side (overmatch tables, `/set/damage.set`) is in [Reference 6, Gates of Hell only](r06-weapons-and-ammunition.md#gates-of-hell-only).

### HighHardness
Where: inside `{volume}`.    Type: switch.
Values: present or absent.
Does: Marks a high-hardness plate. For shell hits the plate is multiplied by `min(1, 9.7707 * C^0.06111 * (T/C)^0.2821 * BHN^-0.4363)`, where T is the plate in mm, C the shell calibre in mm, and BHN the hardness for that thickness from the `brinell_hardness_multiplier` table of `/set/damage.set` (Gates of Hell data: 450 up to 40 mm, 360 to 60 mm, 340 to 80 mm, 300 above). A thin hard plate stays strong against small calibres and weakens against large ones: 40 mm is about 0.99 of its thickness against 20 mm and about 0.72 against 88 mm.
Limits: Shell hits only; a blast meets the plain thickness. Without the table the factor is probably 1.
Example: `{HighHardness}`
See: [CastSteel](#caststeel), [Quality](#quality).

### CastSteel
Where: inside `{volume}`.    Type: number.
Values: absent means rolled plate (factor 1). A value of 0 or less logs `Cast steel value can't be below 0!` and is kept.
Does: Marks cast armour, which is weaker: the plate is multiplied by `min(1, q + 0.001238*T - 0.0002628*C + 0.02706*T/C)`, with q the value, T the plate and C the calibre in mm.
Limits: Shell hits only.
Example: `{CastSteel 0.8063}`
See: [HighHardness](#highhardness).

### Quality
Where: inside `{volume}`.    Type: quoted word.
Values: `"no_flaw"`, `"small_flaw"`, `"medium_flaw"`, `"large_flaw"`. Any other word means no flaw, without a message.
Does: A flawed plate is thinner at an angle. The factor is `0.871 - 0.0004*a + 0.111*T/C` (small), `0.744 - 0.0008*a + 0.222*T/C` (medium) or `0.741 - 0.0023*a + 0.235*T/C` (large), at most 1, with a the impact angle in degrees, T the plate and C the calibre in mm.
Limits: Shell hits only.
Example: `{Quality "large_flaw"}`
See: [HighHardness](#highhardness).

### depend_on_wind
Where: inside `{volume}`.    Type: switch.
Values: present or absent.
Does: The volume's bone sways with the wind. A copied volume keeps the flag.
Limits: In this game the word exists only as an interaction script action and a material flag, not as a volume key.
Form: `{depend_on_wind}`. No stock Gates of Hell file uses it on a volume; its scripts use the action of the same name.
See: [volume](#volume).

### component.set
Where: `/set/component.set`, root `components`.    Type: file of `{category "name" ...}` blocks.
Values: per category `{hp N}`, `{hp_broken N}` and `{armor_damage_modifier f}` (default 1). Gates of Hell data has categories such as `tank_light` (250 and 250), `tank_medium` (325 and 325), `tank_heavy` (400 and 400), turrets, engines, guns and tracks, all with modifier 0.1.
Does: Health points of vehicle parts by kind. A part first loses `hp` and is broken at 0; then it loses `hp_broken` and is destroyed at 0. When a vehicle's part `body` is destroyed, the vehicle counts as destroyed.
Limits: Any other key inside a category is an "unexpected token" error. A part whose vehicle gives it no category has 1 health point and 0 broken health: the first damage breaks it, and health damage never destroys it.
Example:
```
{category "tank_medium" {hp 325} {hp_broken 325} {armor_damage_modifier 0.1}}
```
See: [perks (vehicle)](#perks-vehicle), [component](#component).

### perks (vehicle)
Where: top level of a vehicle `.def`.    Type: block.
Values: `{component "name" ...}` for one part by name, `{component tag "t" ...}` for parts with a tag, and `{blastwave_modifier f}` (default 1). Inside a component: `{category "x"}` (copies the whole category, so write it first), `{health {hp N} {hp_broken N}}`, `{armor_damage_modifier f}`.
Does: Gives each part of the vehicle its health. A part takes the perk with its own name, else a perk by one of its tags.
Limits: An unknown category logs `Invalid component category: <name>`. When two tag perks match, the winner does not follow the file order: name a perk per part to be sure.
Example:
```
{perks
  {component "turret"
    {health
      {hp %turret}
    }
    {armor_damage_modifier 0.1}
  }
}
```
Gates of Hell data writes the modifier through a shared define, and no stock file puts a `{category}` inside a
component.
See: [component.set](#componentset).

### part health damage
Where: interaction scripts.    Type: actions `vehicle_health_damage_pierce` and `vehicle_health_damage_blast`, event `blast_wreaked`.
Values: none in data.
Does: The pierce action takes the shell's damage times its energy, and when that is at least the effective thickness, takes `(P - T) * armor_damage_modifier`, plus the gun's `MinimumDamageModifier`, off the part's health. The blast action takes `(5E - threshold) * blastwave_modifier`. `blast_wreaked` runs when a blast pierces a volume. These replace the armour break of this game as the way parts break.
Limits: The console variable `dbg_damage` prints each health hit as `hp = a -> b`.
Example: (in the vehicle's interaction script)
```
{on blast_wreaked sync
  {vehicle_health_damage_blast}
}
```
See: [Parts and how damage reaches them](#parts-and-how-damage-reaches-them), [Reference 10](r10-interaction-scripts.md#gates-of-hell-only).
