# Reference 2: Entity Definitions and Shared Data Sets

This page lists, one entry each, the top-level keys and blocks of an entity definition (a `.def` file and the `.ext` templates it includes), the common keys of stuff files, and the shared data sets that definitions point to by name. Chapter [6](06-data-keys-entities.md) explains entities as a story and chapter [5](05-sdl-language.md) explains the data language. Big blocks that have their own reference page get a short entry here and a pointer: extenders ([r03](r03-extenders-and-components.md)), chassis and movement ([r04](r04-chassis-and-movement.md)), humans ([r05](r05-humans.md)), weapons ([r06](r06-weapons-and-ammunition.md)), armour and volumes ([r07](r07-armour-volumes-damage.md)), vision and effects ([r08](r08-vision-effects-sound.md)).

Every entry has the same parts: **Where** (file kind and block), **Type** (with unit), **Values** (what the game accepts, and the value when the key is absent), **Does**, **Limits** (what silently fails, stops the game or is ignored), **Example** (a few lines in the pattern of real data) and **See**.

## Rules that apply to every key on this page

- **Units.** Lengths are written in metres and converted when read; masses are kilograms; angles are degrees; times are seconds; vehicle speeds are km/h; armour thickness and penetration are millimetres of steel.
- **Key names are not case sensitive** in definitions, templates and stuff files: `{Props}` and `{props}` are the same key.
- **Unknown keys at the top level stop loading.** A word at the top level of a definition that is not one of the keys below ends in the error "unexpected token". Some inner blocks are as strict; others skip what they do not know. A lint run (`ARSENAL keylint`) finds both kinds.
- **Tag lists** are one quoted string of words split on spaces, or several quoted strings (each one tag, not split). A leading `clear` empties the inherited list first; a word starting with `-` removes that tag; reading a tag list again adds to it.
- **Definitions are read on first use.** The game indexes every `.def` file under `entity/` at start but reads one only when a map, a spawn or a purchase first needs it. A broken definition therefore shows up when a match loads, not at the main menu.
- **The shipped 3.262 build of the original game may differ** in a key or an edge case from what this page says about the 64-bit build (unconfirmed for each case).
- **Gates of Hell.** An entry whose key Gates of Hell treats differently has a line starting `Gates of Hell:`. Keys only Gates of Hell has are at the end, under [Gates of Hell only](#gates-of-hell-only).
- **Where each key is used.** The See line names the Part II section that explains the key, and the Part I page that uses it where there is one: [Add a new unit from an existing one](p03-add-a-unit.md), [Change a unit's numbers](p02-change-unit-numbers.md), [Change a gun or its ammunition](p04-change-a-gun.md), [Change armour](p05-change-armour.md), [Edit a model or an animation](p06-edit-a-model.md), [Copy and change a map](p09-copy-and-change-a-map.md), [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

<!-- internal -->

Maintainers: the notes behind this page describe a newer build than the shipped 3.262 build of the original game; that is why the first bullet above warns about 3.262.

<!-- /internal -->

## Definition files

### .def file

Where: under `entity/` in the resource tree, for example `entity/-vehicle/tank_medium/mytank/mytank.def`.    Type: file.
Values: one outer block whose name is a root type word (next entries).
Does: describes one entity. The entity's name is the file name without `.def`; that name is what maps, scripts, rosters and spawns use.
Limits: A `.def` outside `entity/` is never loaded as an entity. Two `.def` files with the same file name anywhere under `entity/` collide: the second logs `Entity redefinition: <name>` and is ignored. Keeping one name under two root classes has also been seen to crash the game when a grenade from it was thrown. In a running multiplayer match, a definition that was not loaded before the match started can stop the game when it is first read at the wrong moment (unconfirmed for buying a unit that was never preloaded; `set/multiplayer/preload` lists entities loaded before a match).
Example:
```
entity/-vehicle/tank_medium/mytank/mytank.def
entity/-vehicle/tank_medium/mytank/mytank.mdl
```
See: chapter [6, section 1](06-data-keys-entities.md#1-entity-classes-and-folders) and [section 9](06-data-keys-entities.md#9-step-by-step-a-new-entity-from-a-copy); Part I [Add a new unit from an existing one](p03-add-a-unit.md).

### game_entity

Where: `.def`, the outer block name.    Type: root type word.
Values: `game_entity`, `entity`, `actor`, `human` or `fx`, compared without regard to case. If a second word follows the first (for example the bare word at the top of an included template), the second word is the type.
Does: an object on the map with volumes, tags, seats, extenders and scripts, such as a building, a crate or a fence. Most vanilla definitions start with `game_entity`; most vehicles also start with it and become actors through their template (see [actor](#actor)).
Limits: Any other word stops the game with "unknown entity type" when the definition is first read. A misspelt root word in a file nobody loads goes unnoticed until something loads it.
Example:
```
{game_entity
	{Extension "alg_tent_1m.mdl"}
	{mass 1000}
}
```
See: [actor](#actor), chapter [6, section 2](06-data-keys-entities.md#2-the-top-of-a-definition).

### entity

Where: `.def`, the outer block name.    Type: root type word.
Values: as for [game_entity](#game_entity).
Does: the simplest kind: a model with placement and display keys only (the "Model and display keys" section below). Vanilla files that start with `entity` usually include a template whose first word is `game_entity` or `actor`, which then decides the type.
Limits: Game-entity and actor keys in a definition that stays a plain `entity` are unknown keys there.
Example:
```
{entity
	(include "/properties/stuff.ext")
	{Extension "type2at_ammo.mdl"}
}
```
See: [include of a template](#include-of-a-template).

### actor

Where: `.def` outer block name, or the bare word at the top of a template.    Type: root type word.
Values: `actor`.
Does: a game entity that can act: it has a brain, orders, a chassis, weapons and sight. Vehicles are actors: their definition starts `{game_entity`, includes a template such as `/properties/tank.ext`, and that chain reaches a file whose first word is the bare `actor` (vanilla `tank_unarmed.ext`, `armoredcar.ext`, `car.ext`, `cannon.ext` and others). Crews are separate `human` actors sitting in seats.
Limits: The actor keys (`PatherID`, `chassis`, `weaponry`, `sensor`, `brain` and the others in the "Actor keys" section) are only known in an actor.
Example:
```
;SDL
actor
(include "vehicle.ext")
("brain_vehicle")
```
See: [Actor keys](#actor-keys).

### human

Where: `.def` outer block name, or the bare word at the top of `properties/human.ext`.    Type: root type word.
Values: `human`.
Does: a soldier: an actor with a breed, a state machine, an inventory and fighting. Soldier skins under `entity/humanskin/` get it through `human.ext`.
Limits: The keys only a human reads are listed on reference page [r05](r05-humans.md).
Example:
```
{human
	(include "/properties/human.ext")
	{Extension "human.mdl"}
}
```
<!-- goh: GHKEY-01 -->
Gates of Hell: a soldier is told apart by this root type, not by a `human` tag; see [props](#props).
See: [r05](r05-humans.md) Humans; chapter [8, section 1](08-infantry-and-humans.md#1-the-human-entity).

### fx

Where: `.def` outer block name, usually under `entity/fx/`.    Type: root type word.
Values: `fx`.
Does: a visual effect: an entity with views (sprites, particles, lights, decals) and an optional sound, needing no model. Texture names inside it are looked up under `/texture/fx/`. Scripts spawn it by its entity name.
Limits: An effect ends when all its views have finished, unless it has `FromFxEditor`.
Example:
```
{fx
	{sound "hit/small/water/01"}
	{particleview drops1 ...}
}
```
<!-- goh: GHKEY-41 GHKEY-42 -->
Gates of Hell: an effect file may also hold [Local](#local); every `sound` line plays (see [sound](#sound)).
See: [FX keys](#fx-keys), [r08](r08-vision-effects-sound.md) Vision, effects and sound; chapter [16](16-effects-sound-models.md).

### include of a template

Where: anywhere in a `.def` or `.ext`, written `(include "path")`.    Type: directive.
Values: a path. With a leading `/` it starts at the resource root; without it, it starts in the folder of the file that holds the include line.
Does: reads the named file in place, as if its text were written there. Vanilla units get most of their behaviour this way, from `.ext` templates in `properties/` (`tank.ext`, `vehicle.ext`, `human.ext`, `stuff.ext` and others) and `.inc` helpers.
Limits: A copied definition that keeps a relative include looks next to its new location and fails if the file is not there; keep copies in a folder that mirrors the original or write includes with a leading `/`. An include of itself, directly or through other files, has no guard and kills the process. Keys from an include and keys written after it simply add up; a later key of the same name acts again (for example a second `props` adds tags, a second `volume` with the same name changes that volume).
Example:
```
{game_entity
	(include "/properties/tank.ext")
	(include "/properties/selection/vehicle.inc" scale(1.2))
	{props "medium" "-turret"}
```
See: chapter [5, sections 5](05-sdl-language.md#5-includes) to [7](05-sdl-language.md#7-macro-parameters); [path forms](r01-mod-info-and-folder.md#path-forms) on reference page 1; Part I [Add a new unit from an existing one](p03-add-a-unit.md).

## Model and display keys

These keys are known in every root type.

### Extension

Where: `.def` or template, top level.    Type: text, a quoted path.
Values: usually the model file of the unit, `"<name>.mdl"`. A leading `/` starts at the resource root; otherwise the path is relative to the folder of the file holding the key (the definition, or the include it sits in); `../` goes up. Absent: many vanilla vehicle definitions have no `Extension` line and sit in a folder beside a model file of the same name.
Does: reads the blocks of the named file as part of this entity. For a `.mdl` file that brings in the skeleton, views and volume shapes.
Limits: A missing file stops the game when the definition is read ("File not found" or "Resource not found" with the path in game.log). There is no fallback search in `entity/` or the resource root: a relative name resolves only next to the file that holds it, which is why a cloned definition in a new folder should use a path with a leading `/`. A model mesh copied without its `.mtl` material file beside it crashes the game when the mesh loads.
Example:
```
	{Extension "afric_bench.mdl"}
	{Extension "/entity/-vehicle/tank_medium/archer/archer.mdl"}
```
<!-- goh: GHFMT-26 -->
Gates of Hell: a mesh whose `.mtl` is missing loads with a grey placeholder texture and the warning `Material not found ... Using dummy texture.` instead of crashing. A model that loads there can still crash `as64.exe`, so ship every `.mtl`.
See: chapter [16](16-effects-sound-models.md); [path forms](r01-mod-info-and-folder.md#path-forms) on reference page 1; `ARSENAL refcheck` in chapter [19](19-toolchain.md); Part I [Add a new unit from an existing one](p03-add-a-unit.md), [Edit a model or an animation](p06-edit-a-model.md).

### Skeleton

Where: `.def` top level.    Type: block, or a quoted file name.
Values: a block with skeleton content (for example `{ViewVolume {center x y z} {extent x y z}}`, `{TexMods ...}`), or a string naming a file to read the skeleton from.
Does: adds to or reads the entity's skeleton (the bone tree of its model).
Limits: Bone changes with `Bone` must come after the skeleton is loaded.
Example:
```
	{Skeleton
		{ViewVolume {center 0 0 18} {extent 30 30 18}}
	}
```
<!-- goh: GHFMT-36 -->
Gates of Hell: the skeleton's own views are hung on an extra child bone named `##skeleton_views##`. The name is taken, and a script that lists bones sees one more there.
See: [Bone](#bone), chapter [16](16-effects-sound-models.md); Part I [Edit a model or an animation](p06-edit-a-model.md).

### SkeletonSrc

Where: `.def` top level.    Type: text, a quoted name.
Values: a model name.
Does: sets the entity's skeleton to the model with that name.
Limits: Not used in vanilla definitions.
Example:
```
	{SkeletonSrc "mytank"}
```
See: [Extension](#extension).

### Bone

Where: `.def` top level.    Type: block with a quoted bone name.
Values: `{bone "name" ...}` with bone settings inside, for example `{parameters "Align;"}`.
Does: changes one bone of the already loaded model.
Limits: A bone name the model does not have logs `Bone <name> not found in <entity>` and is skipped. A `Bone` line before the model is loaded stops the game with "Bone modifiers must be placed after skeleton load". `speed` or `limits` on a plain bone, instead of a proper joint bone, has been seen to crash the game, and a joint speed below 0.0002 gives the error "Zero speed in ik-bone".
Example:
```
	{bone "fence_vine" {parameters "Align;"}}
```
See: chapter [16](16-effects-sound-models.md); [Skeleton](#skeleton); Part I [Edit a model or an animation](p06-edit-a-model.md).

### LODClass

Where: `.def` top level.    Type: text, a quoted class name.
Values: a class defined in the level-of-detail sets. Vanilla uses `human`, `vehicle_small`, `vehicle_big`, `vehicle_large`, `stuff_small`, `part_small`, `part_big`, `decor_small`, `decor_medium`, `decor_big`, `decor_tree`.
Does: picks the level-of-detail table that decides at which camera distances the model switches to simpler meshes and drops shadows.
Limits: Distances in a class must grow strictly, or the set reports `Distance should be farther than previous one`. A level marked `off` stays off for every farther level.
Example:
```
	{lodclass "decor_medium"}
```
See: [level_of_detail sets](#level_of_detail-sets), [r08](r08-vision-effects-sound.md); chapter [16](16-effects-sound-models.md).

### TexMod

Where: `.def` top level, and placed entities in map files.    Type: text, a quoted option name.
Values: an option name of the model's texture variants; vanilla uses names such as `"camo"`, `"jager"`, and numbers as strings (`"1"`, `"2"`).
Does: selects a texture variant for this entity. Texture variants are files named `T#variant.dds` beside a texture `T`.
Limits: A variant is applied only if the texture has it.
Example:
```
	{texmod "stosstrupp"}
```
<!-- goh: GHFMT-10 -->
Gates of Hell: a variant can also swap the mesh: with variant `camo` the model probably shows `tank#camo.ply` when that file exists beside `tank.ply`, and goes back to `tank.ply` for a variant without one (not confirmed). `as64.exe` swaps textures only, so such `#variant.ply` files do nothing there.
See: [TexMods](#texmods), [r08](r08-vision-effects-sound.md); chapter [16](16-effects-sound-models.md); Part I [Edit a model or an animation](p06-edit-a-model.md).

### TexMods

Where: `.def` top level.    Type: block of pairs.
Values: pairs `{"Option" "variant"}`. Several pairs for one option give a random choice among them.
Does: maps option names to texture variant names for this entity.
Limits: none known beyond those of [TexMod](#texmod).
Example:
```
	{TexMods
		{"Autumn" "aut"}
		{"Winter" "win"}
	}
```
See: [r08](r08-vision-effects-sound.md).

### NoCastShadows

Where: `.def` top level.    Type: flag (no value).
Values: present or absent.
Does: the entity casts no shadow.
Limits: none known.
Example:
```
	{NoCastShadows}
```
See: [r08](r08-vision-effects-sound.md).

### NoGetShadows

Where: `.def` top level.    Type: flag.
Values: present or absent.
Does: no shadows are drawn on the entity.
Limits: none known.
Example:
```
	{NoGetShadows}
```
See: [r08](r08-vision-effects-sound.md).

### UseShadow

Where: `.def` top level.    Type: true or false.
Values: `0` or `1`.
Does: switches the model's shadow on or off.
Limits: Write `0` or `1`; words such as `no` or `off` can read as true.
Example:
```
	{UseShadow 0}
```
See: [r08](r08-vision-effects-sound.md).

### RimLight

Where: `.def` top level.    Type: flag.
Values: present or absent. Vanilla soldier skins use it.
Does: turns on rim lighting for the model.
Limits: none known.
Example:
```
	{RimLight}
```
See: [r08](r08-vision-effects-sound.md).

### UseDecal

Where: `.def` top level.    Type: true or false.
Values: `0` or `1`.
Does: switches decal projection for this model on or off.
Limits: none known.
Example:
```
	{UseDecal 1}
```
See: [DecalView](#decalview).

### DecalOrder

Where: `.def` top level.    Type: whole number.
Values: vanilla uses `20` and `25`.
Does: the drawing priority of the entity's decal against other decals.
Limits: A decimal value is rejected.
Example:
```
	{decalorder 20}
```
See: [DecalView](#decalview).

### SpriteView

Where: `.def` top level, mostly in effects.    Type: block.
Values: a sprite view with its own keys (`Sprite`, `Offset`, channels and timers).
Does: adds a sprite (a flat picture) to the model.
Limits: Written `{#+ spriteview ...}` it stays active (the `+` only folds it in the editor); written `{## spriteview ...}` it is skipped.
Example:
```
	{SpriteView "start" ...}
```
See: [r08](r08-vision-effects-sound.md).

### ParticleView

Where: `.def` top level, mostly in effects.    Type: block.
Values: a particle view with `Generator`, `Mover` and `Visualizer` blocks.
Does: adds a particle emitter to the model.
Limits: The game has one pool of 40000 particles; beyond it new particles are silently not created.
Example:
```
	{particleview drops1 ...}
```
See: [r08](r08-vision-effects-sound.md).

### LightView

Where: `.def` top level, mostly in effects.    Type: block.
Values: `{type point}`, `{radius r}`, an animator and attenuation keys.
Does: adds a light to the model.
Limits: none known here.
Example:
```
	{lightview ...}
```
See: [r08](r08-vision-effects-sound.md).

### DecalView

Where: `.def` top level.    Type: block.
Values: a decal view projecting a sprite onto nearby meshes.
Does: adds a decal (a picture projected onto surfaces near a bone), such as a crater mark.
Limits: Target meshes need decal-target flags unless decals are allowed on all meshes.
Example:
```
	{DecalView ...}
```
See: [r08](r08-vision-effects-sound.md).

### Fogable

Where: `.def` top level.    Type: word.
Values: `auto`, `always` or `never`.
Does: decides whether the fog of war hides the entity.
Limits: Any other word stops the game with "Unknown fogable mode".
Example:
```
	{fogable never}
```
See: [r08](r08-vision-effects-sound.md).

### SpawnedInFog

Where: placed entities in map files; legal in a `.def`.    Type: flag.
Values: present or absent.
Does: marks the entity as spawned inside the fog of war.
Limits: none known.
Example:
```
	{SpawnedInFog}
```
See: [r08](r08-vision-effects-sound.md).

### StoreAble

Where: `.def` top level, vanilla effects.    Type: true or false.
Values: vanilla writes `{storeable 1}`.
Does: marks the entity as storeable; a saved mission holds the state of every storeable entity.
Limits: none known.
Example:
```
	{storeable 1}
```
See: chapter [18](18-testing-and-logs.md).

## Placement keys

The map editor writes these for every placed entity; they are also legal at the top of a definition.

### Position

Where: placed entities in map and mission files.    Type: two or three numbers.
Values: `x y`, and an optional height `z`.
Does: places the entity. A given height is kept instead of the ground height.
Limits: none known.
Example:
```
	{Position -823.45 1528.34}
```
<!-- goh: GHSDL-01 -->
Gates of Hell: when its editor saves a map, positions, angles and scales are cut toward zero in the last digit instead of rounded (1.2346 is written 1.234), so the same map saved by both games differs in the last digit.
See: chapter [13, section 6](13-maps.md#6-map-points-spawns-and-flags), chapter [13, section 10](13-maps.md#10-placing-an-entity-from-the-command-line); Part I [Copy and change a map](p09-copy-and-change-a-map.md).

### Turn

Where: placed entities.    Type: number, degrees.
Values: any angle.
Does: turns the entity about the vertical axis.
Limits: none known.
Example:
```
	{turn 0}
```
See: [xform](#xform).

### xform

Where: placed entities.    Type: block of keyword and number pairs.
Values: `zl` (turn about the local vertical axis, degrees), `zw` (turn about the world vertical axis, degrees), `y` (degrees), `scale` (factor).
Does: sets the entity's rotation and scale.
Limits: Any other word inside stops the game with "unexpected token".
Example:
```
	{xform scale 0.75}
```
See: [scale](#scale).

### scale

Where: `.def` top level, or inside `xform`.    Type: number, factor.
Values: a positive factor. Absent: 1.
Does: scales the entity.
Limits: Vanilla definitions never use it at the top level; vanilla maps scale placed objects with `{xform scale ...}`. Whether the model's obstacle and volumes scale correctly with a definition-level scale is not confirmed (unconfirmed).
Example:
```
	{scale 0.75}
```
See: [xform](#xform).

### Constrain

Where: `.def` top level, and placed entities.    Type: word.
Values: `none`, `ground`, `surface`, `zero`, `water`. Vanilla definitions use `water`, `zero`, `none` and `ground`; maps also use `surface`.
Does: decides how the entity is held in height when placed: free, on the ground, on the terrain surface, at zero height, or on the water (the exact behaviour of each word is unconfirmed).
Limits: Any other word stops the game with "unknown constrain mode".
Example:
```
	{constrain zero}
```
See: chapter [13](13-maps.md).

### Player

Where: placed entities in map files.    Type: whole number.
Values: a player number; vanilla maps write `0` and `1` among others.
Does: gives the actor to that player.
Limits: Placed vehicles start empty; a crew is not part of the placement.
Example:
```
	{Player 1}
```
See: chapter [12](12-missions-and-multiplayer-setup.md).

## Game entity keys

These keys are known in `game_entity`, `actor` and `human`.

### props

Where: `.def` or template, top level.    Type: tag list.
Values: any tag words. Vanilla uses class words (`"tank"`, `"medium"`, `"turret"`), behaviour words (`"opened"`, `"emit_on_sink"`) and vision words (`"vision_vehicle_medium"`).
Does: the entity's descriptor tags. They select the interaction scripts that apply to the entity, target selectors, vision and camouflage settings. Tags from every included template add up.
Limits: Many scripts decide their behaviour from these tags, so `clear` or `-tag` can quietly switch behaviour off.
Example:
```
	{props "medium" "-turret" "opened" "vision_vehicle_medium" "muzzle_large"}
```
<!-- goh: GHKEY-01 GHKEY-75 -->
Gates of Hell: many checks ask what the entity is rather than how it is tagged. A soldier is an entity of root type `human`, and a vehicle is one whose `props` held `vehicle` when it was loaded; squad icons, item search, shot choice, crushing, orders, bars and the unit card use these marks. An entity tagged `human` that is not a `human` (or the reverse) takes the other branch there. Gates of Hell also gives a meaning to more tags, among them `helicopter`, `artillery`, `mortar`, `self_propelled`, `shield`, `hatch`, `no_scavenge`, `no_mouse_hint` and `remove_on_land_patch`.
See: chapter [6, section 3](06-data-keys-entities.md#3-tag-lists); chapter [11](11-interaction-scripts.md); [tag](#tag); Part I [Add a new unit from an existing one](p03-add-a-unit.md).

### tag

Where: `.def` top level, and placed entities.    Type: text, one string split on spaces.
Values: any words. Vanilla uses `"keep_places_without_door"`, `"ger soldier"`, `"destroyed"`.
Does: adds instance tags to the entity (tags of this one object, as opposed to the descriptor tags of `props`).
Limits: none known.
Example:
```
	{tag "ger2 soldier"}
```
See: [props](#props); chapter [6, section 3](06-data-keys-entities.md#3-tag-lists).

### mass

Where: `.def` or template, top level.    Type: number, kilograms.
Values: any positive number; vanilla heavy tanks use values such as `40500`, small objects `1000` or less.
Does: the mass of the entity's rigid body, used when it is physically simulated.
Limits: none known.
Example:
```
	{mass 40500}
```
See: [r04](r04-chassis-and-movement.md); chapter [7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block).

### collider

Where: `.def` or template, top level.    Type: text, a profile name.
Values: a profile from `set/colliders.set`. Vanilla profiles include `nothing`, `tree`, `bush`, `construction`, `human`, `particle`, `particle.small`, `particle.big`, `stuff`, `ammo`, `car`, `truck`, `armored`, `moto`, `tank.light`, `tank.medium`, `tank.heavy`, `cannon`, `cannon_small`, `train`, `marine`, `airborne`. Absent: the template's value (`vehicle.ext` sets `"vehicle"`).
Does: picks how the entity collides and makes contact with other entities.
Limits: An unknown name logs `collider profile '<name>' not found` and the first profile in `colliders.set` is used instead.
Example:
```
	{collider "tank.medium"}
```
<!-- goh: GHDC-49 -->
Gates of Hell: a soldier under direct control is switched to the profile `human_tpc` and back to `human` when he leaves it, so a Gates of Hell `colliders.set` needs that profile.
See: [colliders.set](#setcollidersset); chapter [7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### ObstacleID

Where: `.def` or template, top level.    Type: text, a quoted name, and an optional second quoted name.
Values: a name from `set/registry/obstacles.reg`. Vanilla uses `unbreakable`, `small_building`, `construction`, `building`, `stuff`, `nothing`, `tank`, `tree`, `human`, `marine`, `trench_wall`. The optional second string names one of the entity's obstacle zones.
Does: picks the pathfinding cost class of the entity: how expensive it is for each kind of mover to path through it.
Limits: A name that is not in `obstacles.reg` logs only `No obstacle ID in <entity>`, but later crashes the game when a crushing vehicle meets the object, often minutes into a match. Add every name you use to your mod's `obstacles.reg`.
Example:
```
	{ObstacleID "unbreakable"}
```
<!-- goh: GHKEY-35 -->
Gates of Hell: also reads `ObstacleId` inside an [obstacle](#obstacle) block; `as64.exe` stops on it there.
See: [obstacles.reg](#setregistryobstaclesreg); chapter [7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### volume

Where: `.def` or template, top level.    Type: block with a quoted volume name.
Values: `{volume "name" ...}` with keys such as `tags`, `thickness`, `able`, `component`; or `{volume DefaultMaterial "name"}` (the word right after `volume`, no inner block).
Does: sets up a hit volume, an invisible shape that bullets and blasts test against. The shape comes from the model; the definition adds tags, thickness and abilities. A second `volume` block with the same name changes the existing volume. The `DefaultMaterial` form sets the material every volume uses unless it names its own.
Limits: A name the model has no shape for creates an empty volume without any error. An unknown `DefaultMaterial` name stops the game with "Unknown material : <name>". A volume whose matrix cannot be inverted stops the game with "Not invertable volume matrix".
Example:
```
	{volume "turret"
		{component "turret"}
		{tags "turret"}
	}
```
<!-- goh: GHKEY-29 GHKEY-30 GHKEY-31 GHKEY-32 GHKEY-33 -->
Gates of Hell: a volume also takes `HighHardness`, `CastSteel` and `Quality` (factors of its armour), the able `blockcamera` (on by default; a volume with it stops the third-person camera) and the flag `depend_on_wind` (the volume sways with the wind). `as64.exe` stops loading on every one of them. A box side under 0.01 is widened to 0.01 with the warning `Invalid box dimensions for volume <name>`. A copied volume keeps `disabled` and its able entries.
See: [r07](r07-armour-volumes-damage.md) Armour, volumes and damage; chapter [6, section 5](06-data-keys-entities.md#5-volumes); Part I [Change armour and see the result](p05-change-armour.md).

### armor

Where: `.def` or template, top level.    Type: block.
Values: `{setting "name" ...}` areas with thickness, volumes, durability and threshold.
Does: groups volumes into armour areas and gives them thickness, durability and penetration thresholds together.
Limits: A nonzero area thickness for a side overrides the volume's own thickness for that side; the first matching area wins.
Example:
```
	("armor_spa_light" armor(30 15 15 15))
```
See: [volume](#volume), [r07](r07-armour-volumes-damage.md); chapter [6, section 6](06-data-keys-entities.md#6-armour-areas), chapter [9, section 6](09-weapons-ammo-damage.md#6-armour-thickness-threshold-and-durability); Part I [Change armour and see the result](p05-change-armour.md).

### placer

Where: `.def` or template, top level.    Type: block.
Values: `{place "role" ...}` entries.
Does: the seats of the entity and their roles (driver, gunner and others).
Limits: See [r04](r04-chassis-and-movement.md).
Example:
```
	{placer
		{place "driver" {group "crew"} {visor "driver"}}
	}
```
<!-- goh: GHKEY-73 -->
Gates of Hell: a seat also takes `Sealable` (the vehicle then gets the tag `hatch`) and the flag `StoredTouch`; see [place](r03-extenders-and-components.md#place).
See: [boarder](#boarder), [r04](r04-chassis-and-movement.md), [place](r03-extenders-and-components.md#place); chapter [6, section 7](06-data-keys-entities.md#7-extenders-sensors-and-seats), chapter [8, section 8](08-infantry-and-humans.md#8-crew-and-seats).

### boarder

Where: `.def` or template, top level.    Type: block.
Values: `{door "bone"}`, `{link "door" "place" ...}` and `{anm "place" ...}` entries.
Does: the doors through which crew get in and out, and the animations used.
Limits: See [r04](r04-chassis-and-movement.md).
Example:
```
	{boarder
		{door "emit0"}
		{link "emit0" "driver" {anm "driver"} {forward putoff} {reverse puton}}
	}
```
See: [placer](#placer), [r04](r04-chassis-and-movement.md); chapter [8, section 8](08-infantry-and-humans.md#8-crew-and-seats).

### extender

Where: `.def` or template, top level. Repeatable.    Type: block with a quoted type name.
Values: one of the registered extender types (`inventory`, `vitality`, `shield`, `supply_zone`, `light`, `cannon`, `enumerator`, `talk`, `structure` and others).
Does: attaches an add-on feature to the entity.
Limits: An unknown type name in a definition file is a fatal error: the game stops with "Extender not found". On an entity placed in a mission the same mistake only logs `Extender "<name>" not found` and the block is skipped, so the feature is silently missing.
Example:
```
	{extender "talk"
		{talker "tank"}
	}
```
<!-- goh: GHKEY-74 GHKEY-37 GHKEY-38 GHSTR-13 -->
Gates of Hell: has more extender types, among them `flare`, `resources`, `heritage`, `waypoint`, `medic_tent`, `vehicle_vitality` and `weaponlight`. `as64.exe` stops with "Extender not found" on each of them in a definition file; see [Gates of Hell only](r03-extenders-and-components.md#gates-of-hell-only) on the extenders page.
See: [r03](r03-extenders-and-components.md) Extenders and components; chapter [6, section 7](06-data-keys-entities.md#7-extenders-sensors-and-seats); Part I [Add a new unit from an existing one](p03-add-a-unit.md).

### interaction

Where: `.def` or template, top level.    Type: block.
Values: interaction script content.
Does: adds interaction script content to this entity.
Limits: See [r10](r10-interaction-scripts.md).
Example:
```
	{interaction ...}
```
See: [r10](r10-interaction-scripts.md); chapter [11](11-interaction-scripts.md).

### simulation

Where: `.def` or template, top level.    Type: block.
Values: children `able`, `state`, `disableLinked` and `velocity`.
Does: controls rigid-body physics for the entity (used for falling parts, thrown objects, pillars, trees and the like).
Limits: Any other child stops the game with "unexpected token". An entity simulated without volumes logs `Simulating entity without volumes : <name>`.
Example:
```
	{simulation {able 1} {state 0}}
```
See: [r04](r04-chassis-and-movement.md).

### simulation able

Where: inside `simulation`.    Type: true or false.
Values: `0` or `1`.
Does: whether the entity may be physically simulated.
Limits: Write `0` or `1`.
Example:
```
	{simulation {able 1}}
```
See: [simulation](#simulation).

### simulation state

Where: inside `simulation`.    Type: true or false.
Values: `0` or `1`.
Does: whether the simulation is running at the start.
Limits: Write `0` or `1`.
Example:
```
	{simulation {able 1} {state 1}}
```
See: [simulation](#simulation).

### simulation disableLinked

Where: inside `simulation`.    Type: true or false.
Values: `0` or `1`; vanilla bridge parts write `1`.
Does: a simulation setting for linked entities (meaning unconfirmed).
Limits: none known.
Example:
```
	{simulation {able 1} {disableLinked 1}}
```
See: [simulation](#simulation).

### simulation velocity

Where: inside `simulation`, in saved missions.    Type: two vectors.
Values: a velocity and a spin.
Does: restores the motion of a simulated entity when a saved mission is loaded.
Limits: Not for hand-written definitions.
Example: written by the game in saved missions only.
See: [simulation](#simulation).

### simulatorID

Where: `.def` top level.    Type: text, a simulator name.
Values: vanilla uses `"water"`, `"pillar"`, `"airborne"`, `"human"` and `"grenade"`.
Does: picks the kind of physics simulation used for the entity.
Limits: An unknown name logs `unknown simulator '<name>'`.
Example:
```
	{simulatorID "water"}
```
See: [r04](r04-chassis-and-movement.md).

### body

Where: `.def` top level.    Type: block.
Values: optional quoted name, then `{proper ...}` and `{permit ...}` layer lists. Vanilla writes `{proper body sensible}` and `{permit body}`.
Does: sets which layers the entity's own body zone belongs to and which layers it reacts to.
Limits: Layer words not allowed for a body are ignored.
Example:
```
	{body {proper body sensible} {permit body}}
```
See: [area](#area), [obstacle](#obstacle).

### area

Where: `.def` top level. Repeatable.    Type: block.
Values: optional quoted name, a shape block, and optional `{permit ...}`. A name starting with `interior` marks an interior zone.
Does: adds a zone (a region attached to the entity) used for selection and detection layers.
Limits: Not used in vanilla definitions.
Example:
```
	{area "zone1" {permit body} ...}
```
See: [AreaDisable](#areadisable).

### obstacle

Where: `.def` top level. Repeatable.    Type: block.
Values: optional quoted name and a shape block such as `{Circle2 {radius r}}`.
Does: adds an obstacle zone that blocks movement.
Limits: none known.
Example:
```
	{Obstacle
		{Circle2 {radius 6}}
	}
```
See: [ObstacleID](#obstacleid).

### AreaDisable

Where: placed entities in map files; legal in a `.def`.    Type: text, tags split on spaces.
Values: zone names or tags; vanilla maps write `"close"`.
Does: hides the zones that carry these tags.
Limits: none known.
Example:
```
	{AreaDisable "close"}
```
<!-- goh: GHKEY-35 GHSTR-08 -->
Gates of Hell: keeps this switch apart from the editor switch [AreaDisableEditor](#areadisableeditor). A zone switched off is taken out completely and gets no obstacle.
See: [area](#area); chapter [13](13-maps.md).

### DisableObstacles

Where: placed entities in map files.    Type: true or false, or a bare flag.
Values: vanilla maps write it bare.
Does: switches the entity's obstacles off.
Limits: none known.
Example:
```
	{DisableObstacles}
```
<!-- goh: GHKEY-35 GHSTR-08 -->
Gates of Hell: has a second key [DisableObstaclesEditor](#disableobstacleseditor) for the editor switch; obstacles switched off in the editor stay off in the game.
See: [obstacle](#obstacle); chapter [7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### impregnability

Where: `.def` top level, and placed entities in map files.    Type: word.
Values: `full`, `harmless` (both used in vanilla maps) and `disabled` (unconfirmed).
Does: with `full`, the entity ignores every bullet and every blast.
Limits: The effect of `harmless` is not described (unconfirmed).
Example:
```
	{Impregnability full}
```
See: [r07](r07-armour-volumes-damage.md).

### hearingBias

Where: `.def` or template, top level.    Type: number, metres.
Values: any number; the absolute value is used. Vanilla vehicle templates use `4.5`.
Does: an offset to the entity's hearing range.
Limits: none known.
Example:
```
	{hearingBias 4.5} ; in meters
```
See: [r08](r08-vision-effects-sound.md).

## Actor keys

These keys are known in `actor` and `human`.

### able

Where: `.def` or template, top level.    Type: tag list of abilities.
Values: ability words; vanilla uses `select`, `talk`, `fight`, `crew`, `minimap`, `repaired`, `ally_crew`, `emit_on_attack`, `emit_crew_on_injure`, `emit_passangers_on_enemy`, with `-` to remove one.
Does: switches actor abilities on or off.
Limits: none known.
Example:
```
	{able "-select"}
	{able "talk"}
```
<!-- goh: GHKEY-40 -->
Gates of Hell: adds the ability `entity_manager_notouch`: the game's clean-up of old corpses and props never removes an actor that has it.
See: [r05](r05-humans.md); chapter [8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### PatherID

Where: `.def` or template, top level.    Type: text, a profile name.
Values: a `Profile` name from the winning `set/pather.set`. Vanilla: `human`, `animal`, `tank`, `tank.light`, `amphibia`, `armored`, `vehicle.large`, `vehicle.small`, `moto`, `cannon.large`, `cannon.small`, `cannon.carried`, `cannon.micro`, `airborne`, `railway`, `shallow_water`, `shallow_water_0`, `water`, `deep_water`, `deep_water_0`. A mod may add profiles.
Does: picks the pathfinding profile: how the actor plans routes over terrain and slopes.
Limits: An unknown name stops the game with "Unit: Wrong pather name" when the entity is used.
Example:
```
	{PatherID  "tank"}
```
See: [pather.set](#setpatherset), [r04](r04-chassis-and-movement.md); chapter [7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### TargetClass

Where: `.def` or template, top level.    Type: one quoted class name and an optional quoted tag string.
Values: a class such as `"tank"`, `"light_tank"`, `"armoredcar"`, `"cannon"`, `"car"`, `"human"`, `"airborne"`; tags such as `"ap fg bullet"`.
Does: the class other units' target selectors use for this actor (`{class X}` terms), and the tags used by `{weapon ...}` terms.
Limits: none known.
Example:
```
	{targetClass "tank" "ap fg bullet"}
```
See: [selector](#selector); chapter [10, section 2](10-ai-and-bots.md#2-target-selection-selectset).

### TargetSelector

Where: `.def` or template, top level.    Type: text, a selector type.
Values: a `{type ...}` from `set/target/`. Vanilla: `tank`, `tank_bullet`, `cannon_rocket`, `cannon_bullet`, `cannon_shell`, `human`, `searchlight`.
Does: picks how this actor chooses its own targets.
Limits: none known.
Example:
```
	{targetSelector "tank"}
```
See: [select.set](#settargetselectset); chapter [10, section 2](10-ai-and-bots.md#2-target-selection-selectset); Part I [Bots: what they buy and how they play](p11-bots.md).

### brain

Where: `.def` or template, top level.    Type: block with an optional quoted brain type.
Values: types used in vanilla: `"actor"`, `"vehicle"`, `"airborne"`, `"human"`. Inside: `{state "name"}`, `{properties ...}` and `{const "a/b" N}` entries.
Does: the actor's decision maker. `const` entries set named numbers read by the brain; the engine reads `crush/min_danger_zone_time`, `crush/min_danger_zone_length`, `bomb/danger_zone_hide`, `bomb/danger_zone_jump`, `bomb/danger_zone_run`, `bomb/detect_explosives`, `bomb/detect_grenades` and `fight/distance`.
Limits: An unknown brain type stops the game with "Unknown brain".
Example:
```
	{brain "vehicle"
		{state "vehicle"}
	}
```
<!-- goh: GHKEY-03 -->
Gates of Hell: adds the brain type `"helicopter"`, built on the same base as `"airborne"`. `as64.exe` stops with "Unknown brain" on it.
See: [r05](r05-humans.md); chapter [10, section 1](10-ai-and-bots.md#1-the-decision-chain), chapter [10, section 5](10-ai-and-bots.md#5-vehicle-behaviour).

### chassis

Where: `.def` or template, top level.    Type: block with an optional quoted chassis type.
Values: a type such as `"track"`, then chassis keys.
Does: how the actor moves.
Limits: See [r04](r04-chassis-and-movement.md).
Example:
```
{Chassis "track"
	{speed {Slow 15} {Normal 25} {Fast 25}}
}
```
See: [r04](r04-chassis-and-movement.md) Chassis, movement, wheels and tracks; chapter [7, section 3](07-units-vehicles-movement.md#3-chassis-types); Part I [Change a unit's numbers](p02-change-unit-numbers.md).

### component

Where: `.def` or template, top level. Repeatable.    Type: block with a quoted part name.
Values: a part name (`"body"`, `"engine"`, `"turret"`, `"gun"`, `"door"` and others), with keys such as `{RepairTime s}` and `{tags ...}`.
Does: a repairable part of a vehicle. Volumes name it with `{component "name"}`.
Limits: On a placed entity, a component the definition does not have logs `component '<name>' not found in <entity>` and is skipped.
Example:
```
	{component "engine"
		{RepairTime 25}
	}
```
<!-- goh: GHKEY-24 -->
Gates of Hell: a component also takes `RepairOrder` (whole number), `Health` and `HealthBroken` (numbers). `as64.exe` stops on these keys, also when a Gates of Hell save or map carries them.
See: [component](r03-extenders-and-components.md#component), [volume](#volume); [r07](r07-armour-volumes-damage.md); chapter [9, Gates of Hell summary](09-weapons-ammo-damage.md#gates-of-hell-summary).

### fsm

Where: template, top level (vanilla `human_fsm.ext`, `animal.ext`).    Type: block with a quoted name.
Values: `"human"` or `"animal"` in vanilla, with `state`, `request`, `start` and `subset` blocks.
Does: the actor's animation state machine.
Limits: See [r05](r05-humans.md).
Example:
```
{FSM "animal"
	...
}
```
See: [r05](r05-humans.md).

### sensor

Where: `.def` or template, top level.    Type: block.
Values: `{visor "name" {vision "profile"} {bone "bone"}}` entries.
Does: the actor's eyes: view points on bones with a vision profile each.
Limits: See [r08](r08-vision-effects-sound.md).
Example:
```
{sensor
	{visor "main" {vision "tank_main-l"} {bone "visor1"}}
}
```
See: [r08](r08-vision-effects-sound.md), [sensor](r03-extenders-and-components.md#sensor-sight); chapter [16, section 1](16-effects-sound-models.md#1-vision-and-detection).

### weaponry

Where: `.def` or template, top level.    Type: block.
Values: `{place "name" ...}` weapon places and weapon settings.
Does: the actor's weapon mounts.
Limits: See [r06](r06-weapons-and-ammunition.md).
Example:
```
{Weaponry
	{place "gun" {Rotate}}
	{place "mgun"}
}
```
<!-- goh: GHKEY-28 GHKEY-69 GHKEY-70 -->
Gates of Hell: a weapon place has more keys (`AI_In_Manual`, `AimBone`, `Bullets`, `Sealable`), the block takes `ManualAccuracyZoom`, `TpcInstantAiming`, `AnimatedAiming`, `UseLookatAiming`, `AimingReferenceBone` and `Sealed`, and `SequentialAim` is off unless set (on in `as64.exe`). Drop the new keys when you bring a weapon block over, and set `SequentialAim` where the turret should aim in sequence.
See: [r06](r06-weapons-and-ammunition.md) Weapons and ammunition; chapter [9, section 1](09-weapons-ammo-damage.md#1-weapon-keys); Part I [Change a gun or its ammunition](p04-change-a-gun.md), [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

## FX keys

These keys are known only in `fx` definitions.

### sound

Where: `fx` definition, top level.    Type: text, a sound path.
Values: a path under `sound/` without extension, such as `"hit/small/water/01"`.
Does: the sound played when the effect spawns.
Limits: none known.
Example:
```
	{sound "crush/big/vehicle"}
```
<!-- goh: GHKEY-41 -->
Gates of Hell: every `sound` line of an effect plays when it spawns, in file order; `as64.exe` plays only the last one.
See: [fx](#fx), [r08](r08-vision-effects-sound.md); chapter [16, section 2](16-effects-sound-models.md#2-sound).

### FromFxEditor

Where: `fx` definition, top level.    Type: flag.
Values: present or absent.
Does: keeps the effect alive after its views have finished.
Limits: none known.
Example:
```
	{FromFxEditor}
```
See: [fx](#fx).

## Stuff files: common keys

A **stuff** file describes an item: a weapon, ammunition, a grenade, a kit, a skin. Stuff files live under `set/stuff/`. Weapon and ammunition keys are on reference page [r06](r06-weapons-and-ammunition.md); the keys below are common to every stuff file.

### stuff file

Where: any file under `set/stuff/`.    Type: file.
Values: any file there except `.fsm` and `.presets` files is read as stuff, whatever its extension (vanilla uses `.ammo`, `.weapon`, `.grenade`, `.pattern` and no extension). The words of the file name become the stuff's first tags.
Does: one item.
Limits: Every stuff file under `set/stuff/` can see the macros of the `.presets` files in the same folder without an include. Stray copies (`.bak`, `.old` and similar) are read as stuff too; loose `.txt` files are not indexed. A new stuff whose tags contain all tags of an existing stuff also answers queries for that old stuff.
Example:
```
set/stuff/ammo/rifle.ammo
set/stuff/grenade/grenade_ap.pattern
```
See: chapter [6, section 4](06-data-keys-entities.md#4-stuff-from-and-damage-effects), chapter [9](09-weapons-ammo-damage.md); Part I [Change a gun or its ammunition](p04-change-a-gun.md).

### stuff type

Where: stuff file, the outer block name.    Type: word.
Values: `item`, `bullet`, `weapon_bullet`, `weapon_bombing`, `weapon_flame`, `weapon_throwing`, `skin`. Or `from` (next entry).
Does: the kind of item.
Limits: Any other word stops the game with "Unknown stuff type".
Example:
```
{bullet
	{tag "bullet stackable pierce"}
	{mass 0.015}
}
```
See: [from](#from).

### from

Where: stuff file, the outer block name, followed by a quoted tag string.    Type: block.
Values: tags that find the base stuff. Pattern files carry the tag `pattern`.
Does: starts from a copy of the base stuff; the keys inside the block add to or override it.
Limits: The base is found by its tags, including the tags from file names, before `tag` blocks are read; a query no file name holds stops the game with "pattern not found". A file whose own name carries the base's tags and sorts before the base finds itself, and the game crashes at load with no log line. `desc` is not copied from the base.
Example:
```
{from "pattern grenade_ap"
	{inventory {size 1 1}}
	{entity "grenade_f1"}
}
```
<!-- goh: GHKEY-68 -->
Gates of Hell: the copy starts with all extra tags of the base, so a tag test inside the copy's own block already sees them.
See: chapter [6, section 4](06-data-keys-entities.md#4-stuff-from-and-damage-effects); Part I [Change a gun or its ammunition](p04-change-a-gun.md).

### tag (stuff)

Where: stuff file.    Type: tag list.
Values: tag words, for example `"ammo shell ap"`.
Does: extra tags of the item, used to look it up, in `{if tagged}` script conditions and for damage classes.
Limits: none known.
Example:
```
	{tag "bullet stackable pierce"}
```
<!-- goh: GHKEY-44 -->
Gates of Hell: an item dropped on the ground carries all its tags, extra tags too, so pick-up filters and scripts see words such as `grenade` or `ammo` on it.
See: [from](#from), [tag](#tag); chapter [6, section 3](06-data-keys-entities.md#3-tag-lists).

### mass (stuff)

Where: stuff file.    Type: number, kilograms.
Values: vanilla rifle cartridges use `0.015`.
Does: the physical mass of the item.
Limits: none known.
Example:
```
	{mass 0.015}
```
See: [r06](r06-weapons-and-ammunition.md).

### desc

Where: stuff file.    Type: text, a localization key or a text.
Values: a key such as `"desc/ammo/smg"`. Absent: the key `desc/<ammo, weapon or stuff>/<tags>` built from the item's tags.
Does: the name shown for the item, looked up in the localization files.
Limits: Not inherited through `from`.
Example:
```
	{desc "desc/ammo/smg"}
```
See: chapter [14, section 1](14-localization.md#1-where-text-comes-from); Part I [Add or change text and translate it](p07-text-and-translation.md).

### entity (stuff)

Where: stuff file.    Type: text, an entity name.
Values: the name of a `.def` file under `entity/`.
Does: the 3D model entity used for the item.
Limits: none known.
Example:
```
	{entity "rifle_cartridge"}
```
See: [.def file](#def-file).

### inventory (stuff)

Where: stuff file.    Type: block.
Values: children `{size w h}` (inventory cells), `{weight n}`, `{block n}` (whole number), `{fsm "state"}`, `{link_bone "bone"}`, `{handle_bone "bone"}`, `{noView}`.
Does: how the item sits in an inventory and on a soldier.
Limits: Any other child stops the game with "unexpected token". An `fsm` name that is not a known state stops the game with `Unknown fsm state`.
Example:
```
	{inventory
		{weight 4}
		{block 25}
		{size 1 1}
		{fsm "belt"}
	}
```
See: [r05](r05-humans.md).

### filling

Where: stuff file.    Type: quoted tag string, then up to two whole numbers.
Values: `"ammo tags" [magazine] [max]`. Absent magazine: 1. Absent max: one magazine.
Does: the ammunition the item loads, its magazine size, and the most rounds carried.
Limits: `max` is rounded down to a whole number of magazines. A soldier's `{weapon "X" filled}` for a weapon without a filling has crashed the game on the first update.
Example:
```
	{filling "bullet88 ger" 1 40}
```
See: [r06](r06-weapons-and-ammunition.md).

### fillingVisible

Where: stuff file.    Type: text, a bone name prefix.
Values: a prefix; bones `<prefix>00`, `<prefix>01` and so on.
Does: shows one bone per loaded round.
Limits: none known.
Example:
```
	{fillingVisible "round"}
```
See: [r06](r06-weapons-and-ammunition.md).

### preloaded

Where: stuff file.    Type: flag.
Values: present or absent.
Does: marks the item as preloaded.
Limits: none known.
Example:
```
	{preloaded}
```
See: [r06](r06-weapons-and-ammunition.md).

### damage (stuff)

Where: stuff file. Repeatable.    Type: block.
Values: `{damage <type> ...}` or `{damage add <type> ...}`, type `blastwave`, `fire`, `flash` or `cumulative`.
Does: a damage effect of the item.
Limits: Without `add` the block replaces the existing effect of that type, including one inherited through `from`; with `add` it stacks beside it. The types `projective` and `health` are rejected with "Unsupported damage effect", and an unknown type with "Unknown damage effect type". Inside `blastwave` only `energy` and `area` are allowed; anything else is "unexpected token".
Example:
```
	{damage blastwave
		{energy 2.0}
		{area 0.5 5.0}
	}
```
See: [r06](r06-weapons-and-ammunition.md); [r07](r07-armour-volumes-damage.md).

### possibleDamageRadius

Where: stuff file.    Type: number, metres.
Values: a positive number. Absent: the largest radius of the item's damage effects.
Does: the radius the AI keeps away from.
Limits: none known.
Example:
```
	{possibleDamageRadius 4}
```
See: [r06](r06-weapons-and-ammunition.md).

### special

Where: stuff file.    Type: block.
Values: for grenades and mines `{PrepareTime s}`, `{PrepareCursor "name"}`, `{mode aim}` or `{mode detonate}`. Weapons have their own `special` keys ([r06](r06-weapons-and-ammunition.md)).
Does: preparation before use.
Limits: See [r06](r06-weapons-and-ammunition.md).
Example:
```
	{special
		{PrepareTime 4.5}
		{PrepareCursor "grenade"}
		{mode detonate}
	}
```
<!-- goh: GHKEY-65 -->
Gates of Hell: also takes [PrepareCursorScene](#preparecursorscene), a second cursor picture drawn in the scene over the target while `PrepareTime` runs; `PrepareCursor` stays at the mouse.
See: [r06](r06-weapons-and-ammunition.md); chapter [9, section 1](09-weapons-ammo-damage.md#1-weapon-keys).

### throw

Where: stuff file.    Type: block.
Values: `{range m}`, `{startAngle deg}` (10 to 80), `{constantSpeed m/s}`, `{spreading n}`.
Does: how a throwable item flies.
Limits: none known.
Example:
```
	{throw
		{range 17}
		{startAngle 40}
		{spreading 0.1}
	}
```
<!-- goh: GHKEY-67 -->
Gates of Hell: a missing `range` is 1 unit, not 0; `startAngle` is 45 degrees when absent.
See: [r06](r06-weapons-and-ammunition.md); chapter [9, section 4](09-weapons-ammo-damage.md#4-flight-and-hits).

## Shared data sets

These files are shared by many definitions, which refer to their entries by name. A mod overrides one by shipping the whole file at the same path: the override rule of reference page [r01](r01-mod-info-and-folder.md) applies, so entries the copy leaves out are gone.

### set/colliders.set

Where: `set/colliders.set`, outer block `{colliders}`.    Type: file.
Values: one profile block per name.
Does: the collision profiles that `collider` picks from.
Limits: The first profile is the default used for unknown names. At most 32 different `colliderId` groups exist; a 33rd group has no place and its masks go wrong.
Example:
```
{colliders
	{"nothing"
		{colliderId "nothing"}
		{noContactsAtAll}
	}
```
<!-- goh: GHDC-41 GHDC-49 -->
Gates of Hell: expects two more profiles, [human_tpc](#human_tpc) for a soldier under direct control and [tpc_camera](#tpc_camera) for the third-person camera. A file without them probably crashes the game the first time the camera or that soldier needs them (not confirmed).
See: [collider](#collider), [r04](r04-chassis-and-movement.md); chapter [7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### collider profile

Where: `set/colliders.set`, inside `{colliders}`.    Type: block with a quoted name, optionally followed by `from "parent"`.
Values: profile keys below. With `from`, the parent's settings are copied first.
Does: one collision profile.
Limits: none known beyond the 32-group limit.
Example:
```
	{"human.part"
		{colliderId "human"}
		{collideWith "bush"}
	}
```
See: [set/colliders.set](#setcollidersset).

### colliderId

Where: collider profile.    Type: text.
Values: a group name; vanilla groups include `nothing`, `tree`, `bush`, `construction`, `human`, `particle`, `stuff`, `mine.ap`, `mine.at`, `car`, `moto`, `truck`, `armored`, `tank.light`, `tank.medium`, `tank.heavy`, `cannon`, `cannon_small`, `sandbag`, `goliath`.
Does: the collision group this profile belongs to.
Limits: At most 32 groups.
Example:
```
		{colliderId "human"}
```
See: [collideWith](#collidewith).

### collideWith

Where: collider profile.    Type: tag list of groups.
Values: group names; `clear` and `-name` work as in every tag list.
Does: the groups this profile collides with. Inherited through `from`.
Limits: none known.
Example:
```
		{collideWith "bush" "mine.ap"}
```
See: [colliderId](#colliderid).

### noContactWith

Where: collider profile.    Type: tag list of groups.
Values: group names.
Does: overlap events with these groups may still fire, but there is no physical contact.
Limits: none known.
Example:
```
		{noContactWith "human"}
```
See: [r04](r04-chassis-and-movement.md).

### noContactsAtAll

Where: collider profile.    Type: flag.
Values: present or absent. Vanilla `human` and `animal` use it.
Does: contact rules always pass and the entity is never pushed.
Limits: none known.
Example:
```
		{noContactsAtAll}
```
See: [r04](r04-chassis-and-movement.md).

### blocking

Where: collider profile.    Type: block.
Values: `{speed km/h}` and `{penetration m}`.
Does: settings for how the entity blocks movers on contact.
Limits: See [r04](r04-chassis-and-movement.md).
Example:
```
		{blocking {speed 10} {penetration 0.5}}
```
See: [r04](r04-chassis-and-movement.md).

### canPush

Where: collider profile.    Type: tag list of groups.
Values: group names.
Does: groups whose obstacle zones this unit's pathfinding ignores (it can push them aside).
Limits: none known.
Example:
```
		{canPush "car" "moto"}
```
See: [canPushBroken](#canpushbroken).

### canPushBroken

Where: collider profile.    Type: tag list of groups.
Values: group names.
Does: like `canPush`, for groups whose units are immobilised.
Limits: none known.
Example:
```
		{canPushBroken "tank.light"}
```
See: [canPush](#canpush).

### useRamVolume

Where: collider profile.    Type: tag list of groups.
Values: group names.
Does: contact with these groups uses the unit's `ram` volume.
Limits: none known.
Example:
```
		{useRamVolume "tree"}
```
See: [r07](r07-armour-volumes-damage.md).

### set/pather.set

Where: `set/pather.set`, outer block `{Pathers}`.    Type: file.
Values: `{Profile "name" ...}` blocks.
Does: the pathfinding profiles that `PatherID` picks from.
Limits: The first profile is the default. A unit naming a profile the file lacks stops the game with "Unit: Wrong pather name".
Example:
```
{Pathers
	{Profile "human"
		{Network}
		{Human}
		{Priority 1}
		{Radius 0.3}
```
<!-- goh: GHHUM-18 GHMOV-05 -->
Gates of Hell: a soldier lying down switches to the profile [human_prone](#human_prone) when the file has one, and ground costs are worked out differently (see [Terrain](#terrain)).
See: [PatherID](#patherid); chapter [7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles), chapter [13, section 5](13-maps.md#5-pathfinding-setpatherset).

### Profile

Where: `set/pather.set`, inside `{Pathers}`.    Type: block with a quoted name.
Values: flags `Network`, `Human`, `LinearPath`, `BattleCrusher`; keys `Priority`, `Radius`, `Terrain`, `Height`.
Does: one pathfinding profile. `Network` uses the node network (humans) instead of the grid search; `Human` adds free-spot search and unit avoidance; `LinearPath` plans straight lines only; `BattleCrusher` drives over buildings marked crushable once contact with the enemy has been seen.
Limits: none known.
Example:
```
	{Profile "tank" {BattleCrusher} {Priority 5} {Radius 2.25} ...}
```
See: [set/pather.set](#setpatherset), [r04](r04-chassis-and-movement.md); chapter [7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### Priority

Where: pather `Profile`.    Type: whole number.
Values: vanilla 0 to 7 (human 1, tank 5, deep water 7).
Does: when two units' tracks conflict, the higher priority wins.
Limits: none known.
Example:
```
		{Priority 1}
```
See: [Profile](#profile).

### Radius

Where: pather `Profile`.    Type: number, metres.
Values: vanilla from `0.3` (human) to `7` (deep water).
Does: obstacle clearance, network inset and the width of the collision track.
Limits: none known.
Example:
```
		{Radius 0.3}
```
See: [Profile](#profile).

### Terrain

Where: pather `Profile`.    Type: block of ground type and number pairs, optional `accepted` flag.
Values: `"type" K`. The path cost is `1/K - 1`; `K` at or near 0 makes the type impassable; `K` of 1 or more has no penalty. `accepted 0` blocks a type for AI movement only.
Does: how expensive each ground type is for this profile.
Limits: A type the profile does not list costs nothing, except `undef`, which is impassable. A profile that leaves out `"road"` treats roads as free.
Example:
```
		{Terrain
			"ground" 1
		}
```
<!-- goh: GHMOV-05 -->
Gates of Hell: the path cost is `1/sqrt(K) - 1`, so soft ground costs less: `K` 0.5 costs 0.41 instead of 1, `K` 0.25 costs 1 instead of 3. Impassable stays impassable and speed does not change. Profiles tuned for one game route differently in the other.
See: [r04](r04-chassis-and-movement.md); chapter [7, section 4](07-units-vehicles-movement.md#4-terrain-and-speed).

### Height

Where: pather `Profile`.    Type: 15 numbers.
Values: one cost per slope class (class 0 is flat, 5 about 30 degrees, 10 about 60 degrees). Below 0 blocks, 0 is free, a positive number adds cost.
Does: how slope affects route planning.
Limits: none known.
Example:
```
		{Height 0 0 1 2 3 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1}
```
See: [r04](r04-chassis-and-movement.md).

### set/registry/obstacles.reg

Where: `set/registry/obstacles.reg`, outer block `{obstacles}`.    Type: file.
Values: one block per obstacle name with flags and a cost per pather profile.
Does: the pathfinding cost table that `ObstacleID` picks from. Cost `-1` is impassable, `0` free, a positive number a flat cost per crossing.
Limits: An `ObstacleID` that is missing from this table crashes the game later (see [ObstacleID](#obstacleid)). A mod that ships this file replaces the whole table.
Example:
```
(define "vehicles"
	{"cannon.small" %cost}
	...
)
```
See: [r04](r04-chassis-and-movement.md).

### obstacle flags

Where: an obstacle block in `obstacles.reg`.    Type: flags.
Values: `flag_damage`, `flag_human`, `flag_crush_in_battle`, `flag_skip_impregnable`.
Does: `flag_damage` lets a probe mover pass; `flag_human` blocks a strict mover; `flag_crush_in_battle` lets a crusher pass at no cost (only `building` has it in vanilla); `flag_skip_impregnable` stops an impregnable owner from making the obstacle impassable.
Limits: none known.
Example:
```
	{building {flag_crush_in_battle} ...}
```
<!-- goh: GHGPL-37 -->
Gates of Hell: adds [flag_vaultable](#flag_vaultable), an obstacle a soldier can vault over.
See: [obstacles.reg](#setregistryobstaclesreg); chapter [7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### set/target/select.set

Where: `set/target/select.set`, outer block `{selectors}`.    Type: file.
Values: `(include "x.inc")` lines, one per selector file in `set/target/`.
Does: the target selectors that `TargetSelector` picks from.
Limits: none known.
Example:
```
{selectors
	(include "human_bullet.inc")
	(include "tank.inc")
}
```
See: [selector](#selector).

### selector

Where: a `.inc` file in `set/target/`.    Type: block.
Values: `{type "name"}`, optional `{unit "tags" ["weapon tags"]}`, and one or more `group` blocks.
Does: one target selector. A selector applies to an actor whose tags contain its `unit` tags. Groups are tried in order; inside a group, candidates are sorted.
Limits: none known.
Example:
```
{selector
	{type "tank"}
	{group
		{ignore {class airborne}}
		{select {weapon "ap"}}
		{sort {weapon "ap"} {attacking} {class tank}}
		{sort time_to_aim}
	}
}
```
See: [selector terms](#selector-terms).

### group

Where: inside `selector`.    Type: block.
Values: `{select <term>...}`, `{ignore <term>...}` and `{sort <terms> ...}` entries; a sort ends with `time_to_aim` or `distance`.
Does: one step of target choice: which targets to take, which to skip, and in what order.
Limits: none known.
Example:
```
	{group
		{sort {class tank}}
		{sort time_to_aim}
	}
```
See: [selector](#selector).

### selector terms

Where: inside `select`, `ignore` and `sort`.    Type: term blocks.
Values: `{class X}` (the target's `TargetClass`), `{entity "id"}`, `{weapon "tags"}`, `{attacking}`, `{threating}`, `{invisible}`, `{out_of_range}`, `{in_range m}`, `{in_ik_range}`, and the prefix `not`.
Does: tests a candidate target.
Limits: `in_ik_range` is always false, so a term that needs it never selects.
Example:
```
		{select {weapon "fg"}}
		{ignore {class airborne}}
```
See: [TargetClass](#targetclass).

### set/target/ammo.set

Where: `set/target/ammo.set`, outer block `{select_ammo}`.    Type: file.
Values: one block per target class, optionally followed by `in_bush` or `in_cover`, holding rules `{"ammo tags" ...}`.
Does: how an actor picks which of its ammunition to fire at a given kind of target (for example high explosive against infantry, armour piercing against tanks, smoke). The first matching rule has the highest priority; a catch-all rule is added at the end.
Limits: none known.
Example:
```
{select_ammo
	{human in_bush
		{"grenade fg" {check_grenade}}
		{"zenite" {enable_for_human_user 0}}
		{"bullet"}
	}
```
<!-- goh: GHAI-54 -->
Gates of Hell: when the chosen rule has `ground`, the shooter aims at the target's point instead of at one of its bones, and does not swap to an item with the same tags as the weapon in hand.
See: [r06](r06-weapons-and-ammunition.md); chapter [10, section 3](10-ai-and-bots.md#3-ammunition-choice-ammoset); Part I [Bots: what they buy and how they play](p11-bots.md).

### set/ballistics.set

Where: `set/ballistics.set`, outer block `{ballistics}`.    Type: file.
Values: `{curve "name" {x y} ...}` blocks and a `{damping {x y} ...}` block.
Does: named damage curves. In a curve, x is the distance divided by the weapon's aim range and y is the damage multiplier; points are sorted by x. A built-in unnamed curve runs (0, 1.2), (0.5, 0.9), (1, 0.7), (2, 0).
Limits: The `damping` block is loaded but never used: editing it has no effect.
Example:
```
	{curve "linear"
		{0	1}
		{1	1}
		{1.01	0}
	}
```
See: [r06](r06-weapons-and-ammunition.md); chapter [9, section 4](09-weapons-ammo-damage.md#4-flight-and-hits).

### set/registry/hitpoints.reg

Where: `set/registry/hitpoints.reg`, blocks `{HitPoints}` and `{AttackRate}`.    Type: file.
Values: `HitPoints` rows per target class and `AttackRate` rows per weapon tags, each with `{Human n}` and `{Tank n}`.
Does: the AI's value tables for judging targets and threats.
Limits: none known.
Example:
```
{HitPoints
	{"tank"		{Human 0}	{Tank 2}}
}
{AttackRate
	{"weapon mgun"	{Human 4}	{Tank 0.1}}
}
```
See: chapter [10, section 2](10-ai-and-bots.md#2-target-selection-selectset); chapter [17, section 2](17-balance-pricing-gameplay.md#2-what-a-data-change-does).

### level_of_detail sets

Where: `level_of_detail.set`, `level_of_detail_manual.set`, `level_of_detail_zoom.set`.    Type: files.
Values: top keys `ZoomFactor`, `GrassDistance`, `GrassFadeDepth`, `GrassZoomFactor`; class blocks with `{distance n ...}` levels and flags `NoFog`, `NoGetShadow`, `NoCastShadow`, `off`.
Does: the classes that `LODClass` picks from, for the normal camera, direct control and gun sights.
Limits: An empty class logs `Empty LOD class '<name>' in <file>`. Distances are world units, not metres.
Example:
```
	{"human" {distance 300} {distance 800} {distance 4000 {off}}}
```
<!-- goh: GHVIS-115 -->
Gates of Hell: has a fourth file, `level_of_detail_scenario.set`, and more keys: `minzoom` (2), `grassthinnerdepth` (1000), `grassthinnerpower` (2), `shadowfallofffactor` (0), and the level flags `noparallax`, `parallaxstepsk`, `nobump` and `nospecular` (what the last four switch is not confirmed). `as64.exe` rejects these keys.
See: [LODClass](#lodclass), [r08](r08-vision-effects-sound.md); chapter [16, section 4](16-effects-sound-models.md#level-of-detail-lod).

### set/material.set

Where: `set/material.set`.    Type: file.
Values: material blocks.
Does: the materials named by volumes and `DefaultMaterial` (steel, wood, stone and others) and what shells do on them.
Limits: See [r07](r07-armour-volumes-damage.md).
Example:
```
	{volume DefaultMaterial "steel"}
```
<!-- goh: GHKEY-34 -->
Gates of Hell: a damage stage may give each decal a fade time, as in `{stage {"a" 5} {"b" 5} 0.5}`; the decal fades out after it is cast. `as64.exe` probably fails on this form (not confirmed).
See: [volume](#volume), [r07](r07-armour-volumes-damage.md); chapter [9, section 4](09-weapons-ammo-damage.md#4-flight-and-hits).

### set/breed and set/ability

Where: `set/breed/**` and `set/ability/*.set`.    Type: files.
Values: breed blocks and ability blocks.
Does: soldier types (skin, armour, perks, starting inventory) and levelled weapon skills.
Limits: An invalid perk value such as `"275%"` logs a warning and is ignored.
Example:
```
{breed {skin "ger-reg-rfl"} {nationality ger} ...}
```
See: [r05](r05-humans.md); chapter [8, section 6](08-infantry-and-humans.md#6-breeds), chapter [8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### set/vision

Where: `set/vision/*`, `set/detect.set`, `set/unmasking.set`.    Type: files.
Values: vision profiles.
Does: the profiles that a `sensor` visor names.
Limits: See [r08](r08-vision-effects-sound.md).
Example:
```
	{visor "main" {vision "tank_main-l"} {bone "visor1"}}
```
See: [sensor](#sensor), [r08](r08-vision-effects-sound.md); chapter [16, section 1](16-effects-sound-models.md#1-vision-and-detection).

## Not described yet

The game reads these keys, but what they do has not been worked out. They are listed by name only.

- Top level of a definition, model and display keys: `Color`, `Opacity`, `ZClipVisibility`, `NoGroupMesh`, `ForceQuantable`, `Manager`, `Orientation`.
- Top level, game entity keys: `CompoundObstacles`, `PillarFallen`, `Discovered`, `Examined`, `Explosive`.
- Inside `body`, `area` and `obstacle`: `tag`, `tags`, `static`, `move`, `rotate`.
- Top level, actor keys: `AutoOperatable`, `Operatable`, `CapturedByUser`, `MaskPlayer`, `MID`, `Score`, `TankKills`, `InfantryKills`, `ChassisManager`.
- `fx` definitions: `Fire`.
- Stuff files: `Angles`, `Distance`, `Empty`, `Standart`.
- Collider profiles: `pointCollider`, `rejectColliderByVolume`, `noCollideForStable`.
- Pather profiles: `SkipImpregnable`.
- Ammo choice rules in `set/target/ammo.set`: `ground`, `volume`, `disable`, `enable_for_ai`, `enable_for_user`, `enable_for_human_user`, `check_grenade`, `ready_for_shot`, `charging`.
- Data sets with no description: `set/talk*.set`, `set/damage_report.set`, `set/difficulty/*`.

<!-- internal -->

For maintainers: the engine also accepts a top-level key `UseInstancing` among the model and display keys. No vanilla file and no Gates of Hell file uses it, so it is kept out of the public list above.

<!-- /internal -->

## Gates of Hell only

<!-- goh: GHKEY-42 GHNET-86 GHKEY-35 GHSTR-08 GHKEY-36 GHKEY-65 GHDC-41 GHDC-49 GHHUM-18 GHGPL-37 -->
The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

These keys and profiles exist only in Gates of Hell. `as64.exe` does not know them: a key stops the load or is rejected, so remove it when you bring a unit over ([Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md), chapter [6, Gates of Hell summary](06-data-keys-entities.md#gates-of-hell-summary)).

### Local

Where: `fx` definition, top level.    Type: true or false.
Values: `0` or `1`. Absent: the value of the console variable `dev_local_fx`, which is 1.
Does: a local effect is made on each machine on its own and is not sent over the network.
Limits: Gates of Hell's own effect files do not write it. `as64.exe` probably fails on an effect file with this key (not confirmed).
Example:
```
	{Local 1}
```
See: [fx](#fx), [sound](#sound); chapter [16, section 4](16-effects-sound-models.md#4-effects-fx).

### AreaDisableEditor

Where: placed entities in map files; legal in a `.def`.    Type: text, tags split on spaces.
Values: zone names or tags, as for [AreaDisable](#areadisable).
Does: the zones switched off in the map editor. It is kept apart from `AreaDisable`, the switch used while the game runs.
Limits: Gates of Hell's own maps do not use it.
Example:
```
	{AreaDisableEditor "close"}
```
See: [AreaDisable](#areadisable), [area](#area); chapter [13](13-maps.md).

### DisableObstaclesEditor

Where: placed entities in map files.    Type: true or false, or a bare flag.
Values: Gates of Hell's own maps write it bare.
Does: the obstacles switched off in the map editor. They stay off in the game.
Limits: none known.
Example:
```
	{DisableObstaclesEditor}
```
See: [DisableObstacles](#disableobstacles), [obstacle](#obstacle).

### NoVisibilityPatch

Where: `.def` top level.    Type: true or false, or a bare flag.
Values: Gates of Hell's own animal definitions (chicken, hawk) write it bare.
Does: a switch kept on the entity; what it changes in play is not confirmed.
Limits: none known.
Example:
```
	{NoVisibilityPatch}
```
See: [AreaDisableEditor](#areadisableeditor).

### TPC_ZClip

Where: `.def` or template, top level.    Type: true or false.
Values: `0` or `1`; Gates of Hell's tree and bush templates write `1`.
Does: keeps the fade of objects close to the camera (console variable `r_hideZNearClip`) for this entity in the third-person view; other entities stop fading there.
Limits: none known.
Example:
```
	{TPC_ZClip 1}
```
See: [LODClass](#lodclass); chapter [16, section 4](16-effects-sound-models.md#camera).

### DynCmpPersistent

Where: `.def` top level.    Type: flag.
Values: present or absent; Gates of Hell writes it on fortifications such as pillboxes and sandbags.
Does: marks the entity to be kept in Conquest saves.
Limits: what is kept is not confirmed.
Example:
```
	{DynCmpPersistent}
```
See: [.def file](#def-file).

### PrepareCursorScene

Where: stuff file, inside `special`.    Type: text, a cursor name.
Values: a picture name from the cursor folder, like `PrepareCursor`.
Does: a second cursor picture drawn in the scene over the target while `PrepareTime` runs. `PrepareCursor` stays at the mouse. A copy made with `from` keeps it. Gates of Hell's own sniper rifles use it for the aimed shot.
Limits: none known.
Example:
```
	{special
		{PrepareCursor "aimed_shot"}
		{PrepareCursorScene "aimed_shot_scene"}
	}
```
See: [special](#special).

### human_tpc

Where: `set/colliders.set`, a collider profile.    Type: block.
Values: profile keys as for any [collider profile](#collider-profile).
Does: the profile a soldier gets while the player controls him directly; he goes back to `human` when control ends. Gates of Hell's `set/pather.set` also has a pather profile of the same name.
Limits: none known.
Example:
```
	{"human_tpc" from "human"
	}
```
See: [collider](#collider), [set/colliders.set](#setcollidersset).

### tpc_camera

Where: `set/colliders.set`, a collider profile.    Type: block.
Values: profile keys as for any [collider profile](#collider-profile).
Does: the third-person camera stops in front of walls and ground. Only colliders that match this profile stop it, and it stays at least 1 unit from them.
Limits: Without this profile the game probably crashes the first time the camera meets something (not confirmed).
Example:
```
	{"tpc_camera"
		{ColliderId 	"tpc_camera"}
		{CollideWith 	"construction" "sandbag" "cannon" "tank.heavy"}
	}
```
See: [set/colliders.set](#setcollidersset).

### human_prone

Where: `set/pather.set`, a pather [Profile](#profile).    Type: block.
Values: profile keys as for any profile.
Does: the profile a soldier uses while lying down. Without it, a lying soldier keeps the profile `human`.
Limits: none known.
Example:
```
	{Profile "human_prone"
		("humanprofile")
	}
```
See: [set/pather.set](#setpatherset), [PatherID](#patherid).

### flag_vaultable

Where: an obstacle block in `obstacles.reg`.    Type: flag.
Values: present or absent.
Does: a soldier's path may cross the obstacle by vaulting over it, only when the obstacle is a rectangle and the crossing is within 45 degrees of its face.
Limits: none known.
Example:
```
	{building_vaultable
		{flag_vaultable}
		...
	}
```
See: [obstacle flags](#obstacle-flags), [ObstacleID](#obstacleid).
