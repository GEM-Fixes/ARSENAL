# Reference 3: Extenders and Components

This page lists the blocks that give an entity its extra abilities: every `{extender "type"}` block, the
`{component}` block that names a repairable part, the seat block `placer`, the boarding block `boarder` and the sight
block `sensor`. Chapter 6 introduces them ([Entity data keys](06-data-keys-entities.md)); this page gives the facts for
each key. Words used here are explained in the [glossary](22-glossary.md).

An extender is a named add-on block inside an entity definition. It is written as `{extender "type" ...}` with one of
the type names the game knows, followed by its own keys. An entity may hold several extenders.

How to read an entry. "Where" names the file kind and the block the key is written in. "Type" gives the kind of value
and its unit. "Values" gives what the game accepts and, when it is known, the value used when the key is absent.
"Limits" lists what fails silently, crashes or is ignored. Keys are not case-sensitive. A line that starts
"Gates of Hell:" says what that game does differently with the key; extenders and keys only Gates of Hell has are at
the end, under [Gates of Hell only](#gates-of-hell-only). "See" names related entries, the Part II section and the
Part I page that use the key.

Units: distances in metres, times in seconds, speeds in km/h unless an entry says otherwise. Inventory sizes are in
cells of the inventory grid.

Work in your own mod folder. Text data files use CRLF line endings, string values are read as UTF-8, identifiers are
ASCII, and old cp1251 bytes in vanilla `;` comments should be kept as they are.

## The extender line

### extender

Where: entity `.def`, class `.ext`, `.inc` macros, and entity blocks in map files.    Type: block with a type word.

Values: one of `inventory`, `enumerator`, `shield`, `supply_zone`, `talk`, `cannon`, `bone_rotator`, `light`,
`vision_mode`, `timer`, `smokescreen`, `detail`, `window`, `edifice`, `chassis_manager`, `vitality`, `burning`, `mine`,
`speaker`, `preview`, `railway`, `stuff`, `slicer`, `structure`, `structure_bone`, `grass`, `map_point`,
`spawn_point`, `land`, `land_patch`, `land_patch_height`. The most used in vanilla data are `map_point`, `cannon`,
`enumerator`, `structure_bone`, `stuff` and `speaker`; `timer`, `vision_mode`, `smokescreen`, `edifice`, `window`,
`chassis_manager`, `burning`, `preview`, `slicer` and `grass` are not used by any vanilla file.

Does: adds one ability to the entity. A map file may write the same extender again on a placed entity to change its
state (for example `{extender "mine" {Mined}}`).

Limits: an unknown type name in a definition file is a fatal error: the game stops with "Extender not found". On an
entity placed in a mission it only logs `Extender "x" not found` and the block is skipped.

Example:
```
{extender "inventory" {box {size 6 10} {weight 100}}}
{extender "enumerator" {group} {digit_folder "ger"}}
```

<!-- goh: GHKEY-74 GHKEY-25 GHKEY-26 GHKEY-37 GHKEY-38 GHSTR-13 -->
Gates of Hell: knows more types: `flare`, `resources`, `heritage`, `waypoint`, `medic_tent`, `vehicle_vitality` and
`weaponlight` (see [Gates of Hell only](#gates-of-hell-only)), and `smokescreen` takes keys. `as64.exe` stops with
"Extender not found" on each new type in a definition file.

See: chapter [6, section 7](06-data-keys-entities.md#7-extenders-sensors-and-seats); [extender](r02-entity-definition.md#extender) on the definition page; Part I [Add a new unit from an existing one](p03-add-a-unit.md).

## inventory

The inventory extender holds a grid box of items and a set of holders, the slots where items are worn or used
(hands, weapon places, armour).

### box

Where: inside `{extender "inventory"}`.    Type: block.

Values: holds `size`, `weight`, `item` and `clear`.

Does: the grid of cells that holds carried items. Soldiers, vehicles and crates each have one.

Limits: none recorded.

Example:
```
{extender "inventory" {box {size 8 6} {weight 5000}
  {item "mp40" filled} {item "grenade_m24" 4}}}
```

See: [item](#item).

### size

Where: inside `{box}`.    Type: two whole numbers, cells.

Values: width and height of the grid, each a small whole number. A vanilla soldier uses `6 10`; crates use `8 6`.

Does: the size of the inventory grid.

Limits: none recorded.

Example:
```
{box {size 6 10}}
```

See: [weight](#weight).

### weight

Where: inside `{box}`.    Type: number.

Values: vanilla soldier 100, crate 5000.

Does: the weight the box can hold.

Limits: none recorded.

Example:
```
{box {size 8 6} {weight 5000}}
```

See: [size](#size).

### item

Where: inside `{box}`.    Type: block with an item name and optional settings.

Values: `{item "name" [count] [filled | filling "stuff" amount] {cell x y} {user "place"}}`. `filled` means a weapon
is loaded; `filling "fuel" 50` fills a container with 50 units of a stuff; `{cell x y}` puts the item at a grid cell;
`{user "mgun"}` puts it straight into a holder.

Does: one starting item in the box.

Limits: items stack only when the item carries the `stackable` tag; a count on another item gives separate copies or
an error. An item placed with `{user}` that does not stack must have count 1; a higher count logs
`Invalid amount for non-stack item in holder box`.

Example:
```
{item "mg42" {user "mgun"} filled}
{item "barrel" filling "fuel" 50}
{item "ammo_rifle" 40}
```

See: [weapon](#weapon); [r06](r06-weapons-and-ammunition.md) Weapons and ammunition; chapter [8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### clear

Where: inside `{box}`.    Type: flag.

Values: present or absent.

Does: accepted as a box key; what it clears is not described (probably the inherited items, unconfirmed).

Limits: none recorded.

Example:
```
{box {clear} {item "mp40" filled}}
```

See: [item](#item).

### hand_left

Where: inside `{extender "inventory"}`.    Type: holder block.

Values: `{hand_left "name"}`.

Does: a left-hand holder for any item; the item is shown on the bone `gear_side_left`.

Limits: an unknown holder type in the inventory is an error.

Example:
```
{hand_left "left"}
```

See: [hand_right](#hand_right).

### hand_right

Where: inside `{extender "inventory"}`.    Type: holder block.

Values: `{hand_right "name"}`.

Does: a right-hand holder. An item with a weapon tag is loaded into the entity's first weapon place; any other item is
shown on the bone `gear_side_right`.

Limits: none recorded.

Example:
```
{hand_right "right"}
```

See: [weapon](#weapon).

### weapon

Where: inside `{extender "inventory"}`.    Type: holder block with a name.

Values: `{weapon "name" {mask "tags"}}`; the name is a weapon place of the entity.

Does: a holder that feeds a mounted or hand-held weapon place. `mask` lists the item tags it accepts.

Limits: two items set into the same weapon place: the second is ignored and the log says
`HolderWeapon: set user ... ignored, already used by ...`.

Example:
```
{weapon "mgun" {mask "weapon mgun"}}
```

See: [mask](#mask); [r06](r06-weapons-and-ammunition.md); chapter [8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### mask

Where: inside a holder block.    Type: text, item tags.

Values: tags separated by spaces.

Does: only items carrying these tags fit the holder.

Limits: none recorded.

Example:
```
{weapon "cannon" {mask "weapon cannon"}}
```

See: [weapon](#weapon).

### armor

Where: inside `{extender "inventory"}` of a soldier.    Type: holder block with a name.

Values: `{armor "name" {mask "tags"} {bone "b"} {volumes "v" ...} {pierceAbsorb N} {HeatDamping F}}`.
`HeatDamping` defaults to 1.0. Vanilla soldiers: head `pierceAbsorb 30`; body `pierceAbsorb 32` with
`HeatDamping 0.6`.

Does: a body-armour slot. When an item with the `armor` tag is in it, the named volumes gain `pierceAbsorb` points of
protection against penetration, and heat damage there is multiplied by `HeatDamping`. The values belong to the holder,
not to the item: any armour-tagged item turns them on.

Limits: two different helmets give the same protection, because the item adds nothing of its own.

Example:
```
{armor "helmet" {mask "helmet"} {bone "head"} {volumes "head"} {pierceAbsorb 30}}
```

See: [r07](r07-armour-volumes-damage.md) Armour, volumes and damage; chapter [9, section 10](09-weapons-ammo-damage.md#10-damage-to-infantry).

## vitality

The vitality extender holds a soldier's health and stamina. Vehicles and guns do not have it.

### Health

Where: inside `{extender "vitality"}`.    Type: block.

Values: `{max}`, `{current}`, `{inc}`. Built-in values: max 100, current 100, inc 0.5 per second. Vanilla soldiers use
inc 1.0; animals 0.005.

Does: hit points and their regeneration.

Limits: an unknown key inside `Health` stops with "unexpected token".

Example:
```
{Health {max 100} {current 100} {inc 1.0}}
```

See: [r05](r05-humans.md) Humans; chapter [8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death); Part I [Change a unit's numbers](p02-change-unit-numbers.md).

### Stamina

Where: inside `{extender "vitality"}`.    Type: block.

Values: `{max}` and `{current}` (built-in 100 and 100), `{load a b c d}` (load thresholds, built-in `0 20 40 60`,
vanilla `0 20 40 100`), and `{inc}` rows per gait, each with four numbers, one per load level. Vanilla rows: walk
`+10 +5 0 -10`, slow `+10 +5 0 -10`, normal `+2.5 +1 0 -20`, fast `-5 -10 -20 -40`, and a first row for standing,
`+15 +10 +9 +5`.

Does: how stamina grows or drains per gait and per carried load. Regeneration ticks every 0.3 seconds.

Limits: only the words `walk`, `slow`, `normal` and `fast` are recognised in `inc`; any other word (including `stay`)
writes the first row, which is the standing row. Stamina loss is never scaled by perks. An unknown key stops with
"unexpected token".

Example:
```
{Stamina {max 100} {load 0 20 40 100}
  {inc {stay 15 10 9 5} {fast -5 -10 -20 -40}}}
```

See: [movement_limits](#movement_limits); chapter [8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### movement_limits

Where: inside `{extender "vitality"}`.    Type: block of rows `Fast`, `Normal`, `Slow`, each with two numbers.

Values: vanilla `{Fast 1 25} {Normal 0 0} {Slow -1 -1}`. With no rows the limit is Fast.

Does: the stamina levels at which a soldier loses and regains each gait. The two numbers form a band, so the gait does
not flicker on and off at one value.

Limits: none recorded.

Example:
```
{movement_limits {Fast 1 25} {Normal 0 0} {Slow -1 -1}}
```

See: [r04](r04-chassis-and-movement.md) Chassis and movement (`MovementModeLimit`).

### Veterancy, Dying and Dead

Where: inside `{extender "vitality"}` of a saved game.    Type: values written by the game.

Values: written by the game.

Does: save the soldier's experience and his dying and dead state.

Limits: they belong in saves; a mod has no reason to write them.

Example:
```
{extender "vitality" {Dying}}
```

See: [Health](#health).

## supply_zone

A supply zone resupplies friendly units near the entity (ammunition trucks, supply crates). The vanilla macro file
`properties/resupply_generic.inc` sets it up.

### radius

Where: inside `{extender "supply_zone"}`.    Type: number, metres.

Values: built-in 7. Vanilla uses 6 and 10.

Does: units within this distance are resupplied.

Limits: none recorded.

Example:
```
{extender "supply_zone" {radius 10} {resupplyPeriod 3}}
```

See: [resupplyPeriod](#resupplyperiod).

### resupplyPeriod

Where: inside `{extender "supply_zone"}`.    Type: number, seconds.

Values: built-in 10. Vanilla 3.

Does: the time between two resupply steps.

Limits: none recorded.

Example:
```
{resupplyPeriod 3}
```

See: [radius](#radius).

### regenerationPeriod

Where: inside `{extender "supply_zone"}`.    Type: number, seconds.

Values: 0 means no regeneration. Vanilla 0 or 30.

Does: the zone gains one supply every this many seconds.

Limits: none recorded.

Example:
```
{regenerationPeriod 30}
```

See: [limit](#limit).

### limit

Where: inside `{extender "supply_zone"}`.    Type: whole number.

Values: 0 means unlimited. Vanilla 75, 150 and 250.

Does: the most resupplies the zone can give.

Limits: none recorded.

Example:
```
{limit 150}
```

See: [current](#current).

### current

Where: inside `{extender "supply_zone"}`.    Type: whole number.

Values: maps write `{current 0}`.

Does: the supplies the zone holds now. A map can start a zone empty with `{current 0}`.

Limits: none recorded.

Example:
```
{extender "supply_zone" {current 0}}
```

See: [limit](#limit).

### disabled

Where: inside `{extender "supply_zone"}`.    Type: flag.

Values: present or absent.

Does: the zone gives nothing. Maps use it on placed supply entities.

Limits: none recorded.

Example:
```
{extender "supply_zone" {disabled}}
```

See: [current](#current).

### item (supply)

Where: inside `{extender "supply_zone"}`.    Type: block.

Values: `{item "user tag" "stuff" amount {max N}}`, with an optional `{value N}`. The first name is the kind of unit
or weapon served, the second the stuff given.

Does: one kind of supply the zone hands out.

Limits: every supply `item` needs `{max N}`; without it loading stops with "Block terminator expected".

Example:
```
{item "rifle" "ammo" 25 {max 150}}
{item "tank" "fuel" 50 {max 200} {value 2}}
```

<!-- goh: GHGPL-27 -->
Gates of Hell: its supply items carry only `{value N}`, no `{max N}`, so a zone copied from Gates of Hell stops
`as64.exe` with "Block terminator expected" until each item gets a `{max N}`. Gates of Hell also has a block
`{fuel {amount N} {max N} {value N}}` that refuels vehicles while `current` is below `limit`; `as64.exe` skips it and
does not refuel.

See: [limit](#limit); [supply_zone](#supply_zone); chapter [6, section 7](06-data-keys-entities.md#7-extenders-sensors-and-seats).

## shield

### on, off and no_blast

Where: inside `{extender "shield"}`.    Type: flags.

Values: `{on}`, `{off}`, `{no_blast}`.

Does: a vehicle shield such as side skirts. While the shield-tagged parts are intact, they stop bullets. `off` starts
it off; `no_blast` keeps blast damage from passing through to the shield (unconfirmed in detail).

Limits: none recorded.

Example:
```
{extender "shield" {on}}
{extender "shield" {off} {no_blast}}
```

See: [r07](r07-armour-volumes-damage.md) Armour, volumes and damage.

## enumerator

The enumerator draws a unit's tactical number from digit decals on the model.

### group

Where: inside `{extender "enumerator"}`.    Type: flag.

Values: present or absent.

Does: numbers the unit as part of a group (unconfirmed in detail).

Limits: the log lines `Enumerator : no views` and `can't find "enumerator" bones` are harmless; they appear when the
model has no number decals.

Example:
```
{extender "enumerator" {group} {digit_folder "ger"}}
```

See: [number](#number).

### number

Where: inside `{extender "enumerator"}`.    Type: whole number.

Values: vanilla 1 to 999.

Does: the number shown on the unit.

Limits: none recorded.

Example:
```
{extender "enumerator" {number 214}}
```

See: [digit_folder](#digit_folder).

### digit_folder

Where: inside `{extender "enumerator"}`.    Type: text.

Values: a folder name of digit textures, such as `"ger"`.

Does: picks the digit style. The digit textures are read from `texture/common/model/enumerator/<folder>/`.

Limits: none recorded.

Example:
```
{digit_folder "ger"}
```

<!-- goh: GHKEY-45 -->
Gates of Hell: reads the digits from `texture/common/vehicle/enumerator/<folder>/`. Copy the digit folder to the other
path when you move a unit between the games. A switched-off enumerator leaves its digit bones as they are.

See: [number](#number); chapter [16, section 5](16-effects-sound-models.md#materials-and-textures).

## cannon

The cannon extender is the logic of towed and fixed guns: how the gun opens for firing, closes for moving and which
crew it needs.

### animation

Where: inside `{extender "cannon"}`.    Type: block.

Values: `{switch "state"}`, `{move ...}`, `{aim ...}`, `{fire ...}`, `{reload ...}` holding animation settings.

Does: the animations the gun plays to switch state, move, aim, fire and reload.

Limits: none recorded.

Example:
```
{animation {switch "close"} {fire "fire"} {reload "reload"}}
```

See: [move](#move).

### move

Where: inside `{extender "cannon"}`.    Type: block.

Values: `{obstacle "state"}`.

Does: the state the gun must be in to move (for example closed).

Limits: none recorded.

Example:
```
{move {obstacle "close"}}
```

See: [attack](#attack).

### attack

Where: inside `{extender "cannon"}`.    Type: block.

Values: `{obstacle "state"}`, `{workers "role" ...}`.

Does: the state the gun must be in to fire, and the seat roles that must be manned for it.

Limits: none recorded.

Example:
```
{attack {obstacle "open"}}
{attack {workers "gunner" "commander"}}
```

See: [place](#place).

### rotate_bone

Where: inside `{extender "cannon"}`.    Type: text.

Values: a bone name.

Does: the bone turned when the gun traverses (unconfirmed in detail).

Limits: none recorded.

Example:
```
{rotate_bone "body"}
```

See: [animation](#animation).

### state and disable

Where: inside `{extender "cannon"}` in a map file.    Type: word and flag.

Values: `{state trailing}`; `{disable}`.

Does: `state trailing` places the gun hooked up for towing; `disable` turns the gun logic off.

Limits: none recorded.

Example:
```
{extender "cannon" {state trailing}}
```

See: [r04](r04-chassis-and-movement.md) Chassis and movement (`tractor and trailer`).

## bone_rotator

### on, speed and watchBone

Where: inside `{extender "bone_rotator"}`.    Type: flag, number, text.

Values: `{on}`; `{speed N}`; `{watchBone "bone"}`.

Does: turns a bone on its own, for example a searchlight. `watchBone` names the bone that turns.

Limits: none recorded.

Example:
```
{extender "bone_rotator" {watchBone "gun"}}
```

See: [light](#lamp).

## light

### lamp

Where: inside `{extender "light"}`.    Type: text.

Values: a lamp number such as `"1"`; the model needs a matching bone `lamp_glass1`.

Does: a light source on the entity.

Limits: if the lamp bone is missing, the game crashes when a blast breaks the lamp. The `{preset}` form from later
games is not read and stops with "unexpected token".

Example:
```
{extender "light" {lamp "1"} {lightfx "light_wall"}}
```

<!-- goh: GHVIS-126 -->
Gates of Hell: uses the `{preset "name" ...}` form, with the keys `light_bone`, `break_fx` (the effect played when the
lamp breaks) and `break_bone`, as in its `properties/light.inc`. Remove or rewrite these blocks for `as64.exe`.

See: [lightfx](#lightfx).

### lightfx

Where: inside `{extender "light"}`.    Type: text.

Values: a light effect name.

Does: the effect drawn for the light.

Limits: none recorded.

Example:
```
{lightfx "light_wall"}
```

See: [lamp](#lamp).

## vision_mode

### vision mode type

Where: inside `{extender "vision_mode"}`.    Type: one word.

Values: exactly one of `night`, `thermal`, `drone`.

Does: gives the unit a timed special view (with a duration, cooldown and recharge).

Limits: more than one mode logs `Only one vision mode per actor is supported right now.` An unknown mode logs
`Make sure you added a supported vision mode`. No vanilla file uses this extender.

Example:
```
{extender "vision_mode" {night}}
```

See: [r08](r08-vision-effects-sound.md) Vision, effects and sound; chapter [16, section 1](16-effects-sound-models.md#1-vision-and-detection).

## mine

### Time

Where: inside `{extender "mine"}`.    Type: number, seconds.

Values: vanilla anti-personnel mines 2.5, anti-tank mines 5.0.

Does: the time the mine takes (to arm or to be laid, unconfirmed which).

Limits: none recorded.

Example:
```
{extender "mine" {Time 2.5}}
```

See: [Mined](#mined).

### Mined

Where: inside `{extender "mine"}`.    Type: flag.

Values: present or absent.

Does: the mine is armed. Maps write it on placed mines.

Limits: none recorded.

Example:
```
{extender "mine" {Mined}}
```

See: [Defused](#defused).

### Defused

Where: inside `{extender "mine"}`.    Type: flag.

Values: present or absent.

Does: the mine is defused.

Limits: none recorded.

Example:
```
{extender "mine" {Defused}}
```

See: [Mined](#mined).

### Miner and Seeners

Where: inside `{extender "mine"}`.    Type: values written by the game.

Values: `Miner` is the side the mine was armed for; `Seeners` the sides that have spotted it.

Does: save who laid the mine and who knows about it.

Limits: none recorded.

Example:
```
{extender "mine" {Mined} {Miner 1}}
```

See: [Mined](#mined).

## map_point

A map point is a flag or zone on a map: a capture point, a spawn area, a scripted position. Flags are entities whose
definition has the tag `flag`.

### name (map point)

Where: inside `{extender "map_point"}`.    Type: text.

Values: any name unique on the map.

Does: the name scripts and spawn points use for the point.

Limits: none recorded.

Example:
```
{extender "map_point" {name "flag_a"} {team a}}
```

See: [mapPoint](#mappoint).

### team

Where: inside `{extender "map_point"}`.    Type: word.

Values: `a` or `b`.

Does: the side that owns the point.

Limits: none recorded.

Example:
```
{team b}
```

See: [allow](#allow).

### order and phase

Where: inside `{extender "map_point"}`.    Type: whole numbers.

Values: whole numbers.

Does: the point's place in the capture order and the game phase it belongs to.

Limits: none recorded.

Example:
```
{order 2} {phase 1}
```

See: [team](#team).

### zoneA and zoneB

Where: inside `{extender "map_point"}`.    Type: numbers, metres.

Values: at least 1; vanilla mostly 12.

Does: the radii of the point's two zones.

Limits: the zone circles are drawn only before the mission starts.

Example:
```
{zoneA 12} {zoneB 12}
```

See: [show](#show).

### show

Where: inside `{extender "map_point"}`.    Type: word.

Values: `None`, `Scene`, `Minimap`, `All`.

Does: where the point is shown.

Limits: none recorded.

Example:
```
{show All}
```

See: [visor (map point)](#visor-map-point).

### visor (map point)

Where: inside `{extender "map_point"}`.    Type: word.

Values: `None`, `MapPoint`, `SpawnPoint`.

Does: the marker style of the point.

Limits: none recorded.

Example:
```
{visor MapPoint}
```

See: [show](#show).

### allow

Where: inside `{extender "map_point"}`.    Type: block of flags.

Values: `{spawn}`, `{capture}`, `{release}`, `{enableCapture}`, `{enableRelease}`.

Does: what the point allows: spawning there, capturing it, releasing it, and whether capture and release can be turned
on later.

Limits: none recorded.

Example:
```
{allow {spawn} {capture}}
```

See: [spawn_point](#mappoint).

## spawn_point

### mapPoint

Where: inside `{extender "spawn_point"}`.    Type: text.

Values: the name of a map point.

Does: ties the spawn point to its owning map point.

Limits: none recorded.

Example:
```
{extender "spawn_point" {mapPoint "flag_a"} {pos 1}}
```

See: [name (map point)](#name-map-point).

### pos

Where: inside `{extender "spawn_point"}`.    Type: whole number.

Values: vanilla 1 to 3.

Does: the position number of this spawn point within its map point.

Limits: none recorded.

Example:
```
{pos 2}
```

See: [mapPoint](#mappoint).

## stuff

### item (stuff)

Where: inside `{extender "stuff"}`.    Type: text.

Values: an item name.

Does: makes the entity pick-up-able as that item. `{item "human"}` on a soldier makes his body carryable. On placed
entities in maps the same extender carries the item with its fill state.

Limits: none recorded.

Example:
```
{extender "stuff" {item "human"}}
{extender "stuff" {Item "barrel" filling "fuel" 50}}
```

<!-- goh: GHKEY-43 GHKEY-44 -->
Gates of Hell: a number after the item block is the count of loaded rounds, so a dropped rifle keeps its ammunition in a
saved game; 0 means not loaded. The dropped item carries all its tags, extra tags too.

See: [item](#item); [stuff file](r02-entity-definition.md#stuff-file) on the definition page.

## structure

### place (structure)

Where: inside `{extender "structure"}`.    Type: block.

Values: `{place "bone" "entity" ...}`.

Does: attaches another entity at a bone of this model, building a composite object.

Limits: the bone must exist; a missing bone logs `Bone not found in structure` and the part is likely never attached
(unconfirmed). The entity name must be a known definition. A structure that places itself loops.

Example:
```
{extender "structure" {place "attach1" "fence_part"}}
```

See: [structure_bone](#hold).

## structure_bone

### hold

Where: inside `{extender "structure_bone"}`.    Type: text.

Values: vanilla writes strings such as `"01"`.

Does: not described beyond its use in vanilla.

Limits: none recorded.

Example:
```
{extender "structure_bone" {hold "01"}}
```

See: [place (structure)](#place-structure).

## land_patch

### land patch keys

Where: inside `{extender "land_patch"}`.    Type: flags and a terrain name.

Values: `randomrotate`, `alignenabled`, `alignstacked`, and in data `TerrainType`.

Does: a patch of ground set into the terrain, such as a crater, with random rotation and alignment to the ground.

Limits: none recorded.

Example:
```
{extender "land_patch" {randomrotate} {alignenabled}}
```

<!-- goh: GHSTR-11 GHSTR-12 -->
Gates of Hell: also takes `BigKernel` (wider smoothing of the ground normals) and `RemoveEntities` (removes entities
tagged `remove_on_land_patch`); its trench template writes both inside `land_patch`. A patch is laid on every level of
detail and follows steep ground more closely.

See: [r04](r04-chassis-and-movement.md) Chassis and movement (ground types); chapter [13](13-maps.md).

## component

### component

Where: entity `.def` or class `.ext`, top level.    Type: block with a part name.

Values: `{component "name" {RepairTime N} {tags "..."}}`. Vanilla `RepairTime` ranges from 10 to 120 seconds; the
wheel macro uses 10.

Does: names a part that can be damaged and repaired, such as a turret, engine or track, with its repair time and tags.

Limits: the key is written `RepairTime`; a `repair_time` spelling is not a key the game knows.

Example:
```
{component "turret" {RepairTime 60} {tags "turret"}}
{component "trackleft" {RepairTime 10} {tags "mover" "track"}}
```

<!-- goh: GHKEY-24 -->
Gates of Hell: a component also takes `RepairOrder` (whole number), `Health` and `HealthBroken` (numbers). `as64.exe` stops on these keys, also in Gates of Hell saves and maps.

See: [component](r02-entity-definition.md#component) on the definition page, [r07](r07-armour-volumes-damage.md); chapter [6, section 5](06-data-keys-entities.md#5-volumes).

## placer (seats)

### place

Where: inside `{placer}` of a vehicle or gun.    Type: block with a role name.

Values: `{place "role" {LinkBone "b"} {HandleBone "b"} {Group "g"} {Entity "e"} {Obstacle auto|enable|disable|external}
{Attach bool [cover]} {Pose "p"} {Visor "v"} {UseVision b} {OpenForCrush b} {Flexible b} {NoCollect b}
{NoCollectWhenSpawn} {Stealth b} {turnOff {Sensor} {Visible} {Shadow} {Targetable}}}`.

Does: one seat. Roles are matched by prefix: an order for "gunner" takes the first free seat whose role starts with
"gunner", in the order the seats are written. Any role other than `driver`, `driver1`, `driver2`, `gunner`, `gunner1`,
`gunner2`, `charger` and `commander` is a passenger seat. A stealth seat makes its occupant stealthy. `turnOff` hides
the occupant from sight, shadow or targeting.

Limits: none recorded.

Example:
```
{place "gunner" {linkbone "attach1"} {attach squat_lie} {visor "driver"}
  {useVision 0} {turnoff {sensor} {shadow}}}
```

<!-- goh: GHKEY-73 GHKEY-75 -->
Gates of Hell: a seat also takes `Sealable` (the vehicle then gets the tag `hatch`) and the flag `StoredTouch`. Its role
list has no `gunner1`, and adds `charger2` to `charger4`, `driver3`, `driver4` and `gunner3` to `gunner6` as role
names that nothing else in the game reads.

See: [placer](r02-entity-definition.md#placer) on the definition page, [link](#link); chapter [8, section 8](08-infantry-and-humans.md#8-crew-and-seats), chapter [6, section 7](06-data-keys-entities.md#7-extenders-sensors-and-seats).

### place remove, state and crew

Where: inside `{placer}`.    Type: blocks.

Values: `{place "role" remove}`; `{state "role" {disable} {broken} {unlinked} {entity}}`; `{crew bool}`.

Does: removes an inherited seat, saves or sets a seat's state, and marks whether the seats count as crew.

Limits: none recorded.

Example:
```
{place "passenger3" remove}
```

See: [place](#place).

## boarder (getting in and out)

### door

Where: inside `{boarder}`.    Type: block with a name.

Values: `{door "name" {queue n} {chain} {auto_release_time t}}`.

Does: an entry point; `queue` sets how many may wait, `chain` boards one after another.

Limits: none recorded.

Example:
```
{door "%door"}
```

See: [anm](#anm).

### anm

Where: inside `{boarder}`.    Type: block with a name.

Values: `{anm "name" {forward ...} {reverse ...}}`, each direction with `{begin}`, `{loop}`, `{end}`, `{base}`,
`{speed}`, `{fix_orientation}`, `{rotate}`.

Does: the animations played getting in (forward) and out (reverse).

Limits: an animation name the model lacks does nothing and logs nothing. A seat link that names an `anm` block that
does not exist is an error.

Example:
```
{anm "passenger" {forward {begin "board_body"} {end "seat_passenger"}}
  {reverse {end "emit_body" 1}}}
```

See: [link](#link).

### link

Where: inside `{boarder}`.    Type: block.

Values: `{link "door" "place" {anm "name"} {forward ...} {reverse ...}}`.

Does: joins a door to a seat with the animation to use.

Limits: none recorded.

Example:
```
{link "%door" "%place" {anm "passenger"} {forward putoff} {reverse puton}}
```

See: [door](#door).

## sensor (sight)

### visor

Where: inside `{sensor}`.    Type: block with a name.

Values: `{visor "name" {bone "b"} {vision "v"}}`; the vision name must exist in the vision sets.

Does: one eye of the unit: the bone it looks from and the vision profile it uses. Vanilla soldiers have `eyes` and
`telescope`; vehicles `main` with vision `vehicle_main` at bone `visor`.

Limits: an unknown vision name stops loading with `Vision "<name>" not found`.

Example:
```
{visor "main" {bone "visor"} {vision "vehicle_main"}}
```

See: [r08](r08-vision-effects-sound.md) Vision, effects and sound; chapter [16, section 1](16-effects-sound-models.md#1-vision-and-detection).

### RememberTime and RecognizeTime

Where: inside `{sensor}`.    Type: numbers, seconds.

Values: vanilla `RecognizeTime 0.25`.

Does: how long a seen enemy is remembered, and how long it takes to recognise one.

Limits: none recorded.

Example:
```
{RecognizeTime 0.25}
```

See: [visor](#visor).

### ThreatZone and AttackZone

Where: inside `{sensor}`.    Type: numbers, metres.

Values: vanilla soldier `AttackZone 2.5`.

Does: distances that mark a threat and close attack range for the AI.

Limits: none recorded.

Example:
```
{AttackZone 2.5}
```

See: [InformRange](#informrange).

### InformRange

Where: inside `{sensor}`.    Type: two numbers, metres.

Values: the first for AI units, the second for player units. Vanilla vehicles `50 50`, soldiers `40 40`.

Does: how far a unit passes on what it sees to friends.

Limits: none recorded.

Example:
```
{InformRange 40 40}
```

See: [visor](#visor).

### OperatableRequired and UnmaskProfile

Where: inside `{sensor}`.    Type: flag and text.

Values: as written in data.

Does: `OperatableRequired` makes sight need a crew; `UnmaskProfile` names how the unit reveals itself (unconfirmed in
detail).

Limits: an unknown sensor key logs "unexpected token" and is not applied.

Example:
```
{sensor {OperatableRequired}}
```

See: [r08](r08-vision-effects-sound.md); chapter [10, section 7](10-ai-and-bots.md#7-vision-as-an-ai-input).

## Not described yet

These keys are read by the game in the blocks of this page, but what they do has not been worked out. They are listed
by name only.

- bone_rotator: `mode`, `radius`, `waypoint`.
- light: `broken`, `on`.
- detail: `random`.
- mine: `player`.
- speaker: `soundname`, `cycletime`, `cycle`, `loop`, `on`, `recoverytime`, `recovery`, `signaldepend`, `signals`,
  `name`, `mode`.
- stuff: `activator`, `preparation`, `amount`.
- land: `heightmap`, `on`, `updateentities`.
- land_patch: `alignvolumes`, `nonormals`.
- talk: `talker`, `freq`, `language`, `phrase`, `sound`, `text`, `text_dbg`, `voice`.
- railway: `activepath`, `broken`, `linkpoint`, `path`, `switch`.
- burning: `inflammation_time`.
- sensor: `external`, `subject`.
- component: `repairtimeleft`, `state`.
- extender types with no described keys: `timer`, `smokescreen`, `window`, `edifice`, `chassis_manager`, `preview`,
  `slicer`, `grass`, `land_patch_height`.

<!-- goh: GHKEY-39 -->
Gates of Hell: which detail bones show is decided once when the unit spawns and sent to every player, and `random` set
to off forces the detail states the model was made with.

## Gates of Hell only

<!-- goh: GHKEY-74 GHKEY-08 GHKEY-27 GHKEY-25 GHKEY-26 GHKEY-37 GHKEY-38 GHSTR-01 GHSTR-13 GHKEY-13 -->
The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

These extenders and keys exist only in Gates of Hell. `as64.exe` stops with "Extender not found" on an unknown
extender type in a definition file, so remove these blocks when you bring a unit over ([Bring a unit from Gates of
Hell](p12-unit-from-gates-of-hell.md), chapter [6, Gates of Hell summary](06-data-keys-entities.md#gates-of-hell-summary)).

### resources

Where: `{extender "resources"}`, in Gates of Hell's soldier template `properties/human.ext`.    Type: block.

Values: `{Resources {max N} {current N} {income N}}`; when absent 100, 100 and 0. Abilities can scale them.

Does: a soldier's own stock of building material. A soldier with the Barricade perk builds fortifications from this
stock while it holds at least the action's cost, otherwise from a fitting item in his inventory. Income is added every
0.3 seconds.

Limits: an unknown field in `Resources` logs "Unknown resources field".

Example:
```
{extender "resources" {Resources {max 10} {current 10}}}
```

See: [vitality](#vitality).

### medic_tent

Where: `{extender "medic_tent"}` on a medic zone entity.    Type: block.

Values: `{DefaultRadius m}`, 10 when absent; `{ViewsToScale "tags"}`, the views scaled to the radius (not drawn on a
dedicated server).

Does: a healing zone around a medic tent. The ring picture on the ground is scaled to the radius.

Limits: none recorded.

Example:
```
{extender "medic_tent" {defaultRadius 10} {viewsToScale "tent_circle"}}
```

See: [heritage](#heritage).

### heritage

Where: `{extender "heritage"}`, written by the game in Gates of Hell maps and saves.    Type: block.

Values: `{Children ...}`, the ids of the entities this one spawned; Gates of Hell maps write them in hexadecimal.

Does: the owner keeps the entities it spawned across a save and load, and they hear the owner's news (change of player,
destruction, shown or hidden). A medic tent's zone follows the tent this way.

Limits: written by the game; a mod has no reason to write it by hand.

Example:
```
{Extender "heritage" {Children 0x800e}}
```

See: [medic_tent](#medic_tent).

### waypoint

Where: `{extender "waypoint"}`, on Gates of Hell's multiplayer way point entity.    Type: block.

Values: no keys of its own. A waypoint helper on a map takes `{RandomPosition bool}`.

Does: marks the entity as a way point.

Limits: none recorded.

Example:
```
{extender "waypoint"}
```

See: [map_point](#map_point).

### flare

Where: `{extender "flare"}`.    Type: block.

Values: `{Cooldown s}`; `{Bones {"bone" "model" [count [interval]]}}`, count 1 and interval 0.2 seconds when absent.

Does: launches decoy flares (aircraft) from the named bones. Every side sees the flares.

Limits: Gates of Hell's own data does not use it.

Example:
```
{extender "flare" {Cooldown 10} {Bones {"<bone>" "<model>" 2 0.2}}}
```

See: [smokescreen keys](#smokescreen-keys).

### smokescreen keys

Where: `{extender "smokescreen"}`.    Type: number and text.

Values: `{Cooldown s}`, 0 when absent; `{ItemTags "tags"}`.

Does: the unit uses one smoke item and plays its own `deploy_smoke` command. `ItemTags` names the item to use; without
it the item must carry the tags `smokescreen`, `decoy` and `grenade`. The extender is ready when the unit spawns.

Limits: the unit's data must have a `deploy_smoke` command. In `as64.exe` the extender reads no keys and looks for an
item tagged `decoy`.

Example:
```
{extender "smokescreen" {cooldown 5} {itemTags "mortareng_50 sm"}}
```

See: [extender](#extender).

### weaponlight

Where: `{extender "weaponlight"}` on a weapon entity.    Type: block.

Values: `{light "effect"}` for every side, or `{faction "ger usa" {light "effect"}}` per side.

Does: a light on the weapon at the bone `fx_light`. After a pick-up only the light of the holder's side is used. It is
lit at night, while the weapon is in the right hand and the holder is not bleeding.

Limits: a weapon model without the bone logs `Missing "fx_light" bone in entity`. Gates of Hell's own data does not use
it.

Example:
```
{extender "weaponlight" {faction "ger" {light "fx/<your light effect>"}}}
```

See: [lamp](#lamp).

### vehicle_vitality

Where: `{extender "vehicle_vitality"}`.    Type: block.

Values: no keys are known.

Does: not described.

Limits: Gates of Hell's own data does not use it.

Example:
```
{extender "vehicle_vitality"}
```

See: [component](#component).

### edifice Enabled

Where: inside `{extender "edifice"}`.    Type: true or false.

Values: `0` or `1`; 1 when absent. The map editor shows it as `edifice_enabled`.

Does: `{Enabled 0}` switches off the entity's own interior view.

Limits: Gates of Hell's own data does not need it; the default is on.

Example:
```
{extender "edifice" {Enabled 0}}
```

See: [extender](#extender).
