# Chapter 6: Data Keys and Entities

An entity is anything the game can place on a map: a tank, a soldier, a gun, a building, a crate. Every entity is described by a text file called a definition, or `.def` file. This chapter shows how those files are organised, which keys sit at the top of them, and how to build a new entity safely from an existing one. If a word is new to you, look it up in the [glossary](22-glossary.md).

The short ways to the most common jobs are [Change a unit's numbers](p02-change-unit-numbers.md) and [Add a new unit from an existing one](p03-add-a-unit.md). Every key in this chapter has a full entry in [Reference 2: entity definitions](r02-entity-definition.md), and the extender, seat and sight blocks have theirs in [Reference 3: extenders and components](r03-extenders-and-components.md).

## What you will learn

- Where entity files live and how a unit folder is laid out.
- What the top-level keys of a definition do.
- How tag lists work, and how `{from}` copies one stuff file into another.
- How volumes and armour areas fit together.
- What extenders, sensors and seats are, at a basic level.
- How to make a brand-new entity from an existing one, then check it.

A reminder before you start: the game folder and the vanilla data in it are read-only. Never edit them. Do all your work in your own mod folder (see [chapter 3](03-mod-folder-and-load-order.md)). All text data files (`.def`, `.ext`, `.set`, `.inc` and so on) use CRLF line endings. The 64-bit build reads string values as UTF-8, in these files and in `.lng` files alike (see [chapter 14](14-localization.md)); identifiers must be ASCII, and old cp1251 bytes inside vanilla `;` comments should be left as they are. Paks are plain zip files. Many editors silently change the encoding or the line endings when you save, so check your editor's status bar before you trust it.

## 1. Entity classes and folders

Vehicles live under `entity/-vehicle/` inside the game's resources, sorted into class folders such as `tank_light`, `tank_medium`, `tank_heavy`, `btr`, `car`, `cannon`, `airborne`, `marine` and `train`. Each unit normally gets its own folder named after it, holding a definition with the same name:

```
entity/-vehicle/tank_medium/mytank/mytank.def   ; the definition
entity/-vehicle/tank_medium/mytank/mytank.mdl   ; the model description: skeleton, views, volume shapes
entity/-vehicle/tank_medium/mytank/mytank.vol   ; collision and hit volume shapes
entity/-vehicle/tank_medium/mytank/mytank.ply   ; a mesh
entity/-vehicle/tank_medium/mytank/mytank.mtl   ; materials
entity/-vehicle/tank_medium/mytank/mytank.dds   ; textures
entity/-vehicle/tank_medium/mytank/mytank.anm   ; animations
```

Several variants of one tank may share a folder and reuse the same model files. A mod can also ship only a definition and keep using the base meshes, which keeps the mod small. Soldiers live under `entity/humanskin/`, buildings and fences under `entity/construction/`, weapon and item models under `entity/inventory/`, and effects under `entity/fx/`; the idea is the same. Some units keep their model and definition files in `texture.pak` instead of an entity pak.

The entity's name is the file name without `.def`, and that name is what maps, scripts, rosters and spawns use. Keep names short, lowercase and free of spaces. Two `.def` files with the same file name anywhere under `entity/` collide: the second logs `Entity redefinition: <name>` and is ignored. The game reads a definition only when a map, a spawn or a purchase first needs it, so a broken definition shows up when a match loads, not at the main menu. See the reference entry [.def file](r02-entity-definition.md#def-file).

## 2. The top of a definition

A definition is written in SDL, the game's data language. Chapter 5 explains the syntax in full ([SDL language](05-sdl-language.md)); here is all you need to read the examples. A block is written in braces: `{name value value {child ...}}`. Key names in definitions are not case-sensitive. A semicolon starts a comment that runs to the end of the line. Round brackets hold directives such as `(include ...)` and macro calls.

The outer block name says what kind of entity this is: `game_entity` (an object with volumes, tags, seats and extenders), `entity` (a plain model), `actor` (something that acts: it has a brain, orders, a chassis, weapons and sight), `human` (a soldier) or `fx` (a visual effect). Any other word stops the game with "unknown entity type". Most vehicles start with `game_entity` and become actors through the template they include. See [game_entity](r02-entity-definition.md#game_entity) and [actor](r02-entity-definition.md#actor).

The top of a vehicle definition follows this pattern (a trimmed example, with the inner parts left out):

```
{game_entity
	(include "/properties/tank.ext")
	{Extension "/entity/-vehicle/tank_medium/mytank/mytank.mdl"}
	{props "medium" "-turret"}
	{mass 40500}
	{collider "tank.medium"}
	{volume "turret" {component "turret"} {tags "turret"}}
	{armor ...}
	{extender "enumerator" ...}
	{sensor ...}
	{placer ...}
}
```

Treat each line as a layer of the unit:

- `(include "/properties/tank.ext")` pulls in a shared template full of default blocks. This is how most of a tank's behaviour arrives without you writing it: the template chain makes the vehicle an actor and adds its brain, armour areas and scripts. See [include of a template](r02-entity-definition.md#include-of-a-template).
- [`Extension`](r02-entity-definition.md#extension) loads the model file (`.mdl`), which brings in the skeleton, the views and the volume shapes. Many vanilla vehicle definitions have no `Extension` line and use the model file of the same name in their own folder. In a copied definition placed in a new folder, write the path with a leading `/`, because a relative name is looked for only next to the file that holds it.
- [`props`](r02-entity-definition.md#props) is the entity's descriptor tag list (section 3).
- [`mass`](r02-entity-definition.md#mass) is the weight in kilograms; [`collider`](r02-entity-definition.md#collider) picks a collision profile (section 8).
- Everything after that adds parts: [`volume`](r02-entity-definition.md#volume) blocks for hit shapes, [`armor`](r02-entity-definition.md#armor) areas, [`extender`](r02-entity-definition.md#extender) blocks for gameplay features, a [`sensor`](r02-entity-definition.md#sensor) for sight, and a [`placer`](r02-entity-definition.md#placer) for seats.

Keys from an include and keys written after it simply add up; a later key of the same name acts again (a second `props` adds tags, a second `volume` with the same name changes that volume).

Two warnings about the top level. First, if the file named in `Extension` or in an include does not exist, the game stops with "File not found" or "Resource not found" and the path in `game.log`, so check spelling every time. Second, the top level of a definition is strict: a word there that is not a known key stops the game with "unexpected token". Some inner blocks are as strict; others quietly skip keys they do not know, so a typo there simply does nothing. A check run (section 9) catches both kinds.

### In Gates of Hell

<!-- goh: GHKEY-35 GHKEY-36 GHKEY-40 -->

Gates of Hell definitions may carry top-level keys the 64-bit game does not know: `AreaDisableEditor` (tags of zones the editor switches off), `DisableObstaclesEditor`, `NoVisibilityPatch`, `TPC_ZClip` (keeps the near-camera fade in third person view) and `DynCmpPersistent`. Because the top level is strict, each of them stops the 64-bit game with "unexpected token". Remove them from a definition you bring over. The `able` word `entity_manager_notouch` (keep this unit when the game tidies up corpses and wrecks) is unknown to the 64-bit game too.

## 3. Tag lists

Tags are words the game uses to search for things and to decide behaviour. A definition carries two tag lists: [`props`](r02-entity-definition.md#props), the descriptor tags that select interaction scripts, target selectors, vision and camouflage settings, and [`tag`](r02-entity-definition.md#tag), instance tags of this one object. Stuff files use [`tag`](r02-entity-definition.md#tag-stuff) for their extra tags.

A tag list is one quoted string of words separated by spaces, or several quoted strings, each of which is then one tag. Reading a tag list again adds to it, so tags from every included template add up. Two special forms let you edit a list that came from somewhere else:

- A leading `clear` empties the inherited list first.
- A word with a minus sign, such as `-turret`, removes that one tag from the inherited list.

```
{props "medium" "opened"}       ; adds two tags to those from the templates
{props "-turret"}               ; takes turret out
{props "clear" "tank" "medium"} ; starts over
```

Be sparing with `clear` and `-tag`. Many scripts decide what to do from tags, and removing them can quietly switch off behaviour (a vehicle that no longer carries a tag a script looks for will not trigger that script).

### In Gates of Hell

<!-- goh: GHKEY-01 GHKEY-75 -->

Tag lists work the same way. Two things differ. Gates of Hell decides whether something is a soldier or a vehicle by what kind of entity it is (`human`, or `vehicle` among its `props`), not by searching the tag at each use; an entity whose tags and kind disagree behaves differently in the two games. And Gates of Hell knows more fixed unit tags, such as `helicopter`, `artillery`, `mortar`, `self_propelled`, `hatch`, `no_scavenge` and `remove_on_land_patch`. In the 64-bit game they are ordinary words that only scripts can use. Seat roles such as `gunner3` to `gunner6`, `charger2` to `charger4`, `driver3` and `driver4` are names only, with no rule behind them, and Gates of Hell has no `gunner1`.

## 4. Stuff, `from` and damage effects

"Stuff" is the game's word for items: weapons, ammunition, grenades, kits, clothing skins. Stuff files live under `set/stuff/`. The outer block name is the [stuff type](r02-entity-definition.md#stuff-type):

| Type | What it is |
|---|---|
| `item` | A plain carried object |
| `bullet` | Ammunition |
| `weapon_bullet` | A gun that shoots bullets or shells: rifles, machine guns, cannons, launchers |
| `weapon_bombing` | A bomb dropper |
| `weapon_flame` | A flamethrower |
| `weapon_throwing` | A thrown weapon, such as a grenade |
| `skin` | A visual outfit |

A stuff file can also start from another stuff file with [`from`](r02-entity-definition.md#from). The outer block is then `from`, followed by the tags that find the base item; the keys inside the block add to or override the copy:

```
{from "pattern grenade_ap"
	{inventory {size 1 1}}
	{entity "grenade_f1"}
}
```

This reads as: "start from the item tagged `pattern grenade_ap`, then change its inventory size and its model." You only write the parts that differ. Pattern files carry the tag `pattern`. The base is found by its tags, including the words of its file name; a query no file holds stops the game with "pattern not found". The description key `desc` is not copied from the base. A file whose own name carries the base's tags, and that sorts before the base, finds itself, and the game crashes at load with no log line, so give a new item a name that differs from its base.

One trap matters here. A [`damage`](r02-entity-definition.md#damage-stuff) block without the word `add` replaces the existing effect of that kind, including one inherited through `from`. So `{damage blastwave ...}` wipes the base blast, while `{damage add blastwave ...}` stacks another layer beside it. Writing two plain `damage blastwave` blocks leaves only the second. Inside `blastwave` only `energy` and `area` are allowed:

```
	{damage add blastwave
		{energy 2.0}
		{area 0.5 5.0}
	}
```

Chapter 9 uses this a lot ([weapons, ammo and damage](09-weapons-ammo-damage.md)), and the weapon keys are explained there.

### In Gates of Hell

<!-- goh: GHKEY-68 GHKEY-07 GHKEY-44 GHKEY-67 GHKEY-41 GHKEY-42 -->

- A `from` copy starts with the extra tags of its base already in place, so tag tests inside its own block already see them. A dropped item keeps all its tags, so pickup rules and scripts see words such as `grenade` or `ammo` on it. Whether the 64-bit game does the same in both cases is not confirmed.
- `weapon_launcher` is a stuff type tag that chooses how the weapon aims.
- A thrown item with no `Range` gets a small range instead of 0.
- In an effect file every `Sound` line plays, not only the last one, and `Local` decides whether each player's machine makes its own copy of the effect. The 64-bit game plays only the last `Sound` line and does not read `Local`.

Weapon and ammunition keys of Gates of Hell are in [chapter 9](09-weapons-ammo-damage.md#in-gates-of-hell).

## 5. Volumes

A volume is an invisible 3D shape attached to an entity. Bullets and blasts test against volumes, not against the visible model. Volumes also carry armour thickness. The shape itself comes from the model; the definition adds tags, thickness and abilities to a volume by its name:

```
{volume "body1"
	{tags "body"}
	{thickness 40 {front 82} {rear 10}}
	{able {holed}}
}
```

The first tag of a volume is the name that armour areas and interaction scripts match it by. The `thickness` block gives millimetres of steel: one base value for all six sides (40 here), then single sides set by `front`, `rear`, `top`, `bottom`, `left` and `right`. A later `{thickness N}` for the same volume resets all six sides. The `able` block lists what a volume takes part in; the default is `visible bullet throwing obstacle contact contact_ground blast select`. A volume without `blast` is not hurt by blast waves. `hole` and `holed` mark openings such as gun ports, and `{able clear {hole}}` empties the list before adding.

Two details save a lot of confusion. A volume name the model has no shape for creates an empty volume without any error, so shells fly through that part. And the side of a hit (front, top, left and so on) is stored with each face of the shape in the model's volume file. It is not worked out from the direction of the shot, so a plate marked "front" counts as front even when you hit it from the flank. Changing this means editing the `.vol` file. [Reference 7](r07-armour-volumes-damage.md) covers volumes in full ([volume](r07-armour-volumes-damage.md#volume)).

In the ARSENAL window, the Models page (tab Models & Sim) shows the volumes in its 3D view (switch Volumes on, and "Volume names" to label them); a click on one says what it is. Its **Volumes** tab sets a volume's thickness per side in millimetres, its tags, its part and its material, and writes into your mod's copy. The Shot tool and the Armor tab of the same page fire at the volumes; see [chapter 9, section 11](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window).

### In Gates of Hell

<!-- goh: GHKEY-29 GHKEY-30 GHKEY-31 GHKEY-32 GHKEY-33 GHKEY-34 GHSTR-09 -->

A Gates of Hell volume block takes more words. The 64-bit game stops on the first four with "unexpected token", so remove them when you port a unit:

- `HighHardness`, `CastSteel <value>` and `Quality small_flaw|medium_flaw|large_flaw` change how strong the plate is ([chapter 9](09-weapons-ammo-damage.md#in-gates-of-hell-4)).
- The `able` list has a seventeenth word, `blockcamera`, on by default: the volume stops the camera. Write `{able {blockcamera 0}}` to let the camera pass.
- `depend_on_wind` makes a volume sway with the wind, probably for plants. The 64-bit game knows the word only as a script action and a material flag, so it is probably refused in a volume too.
- A `Box` side under 0.01 is widened to 0.01 with `Invalid box dimensions for volume <name>: can not be less than 0.01`, so flat boxes from old data warn there.
- Materials can fade their wound pictures with `{stage {"name" seconds} threshold}`; the 64-bit game probably cannot read that form.

A copied volume keeps `disabled`, `depend_on_wind` and its `able` list, so a part switched off stays off when its view changes. Hiding a bone from a script also switches off its volumes.

## 6. Armour areas

Per-volume thickness is the simple route. Most vanilla vehicles use a second layer on top: armour areas, which group volumes and give them thickness, durability and thresholds together.

```
{armor
	{setting "turret"
		{thickness 100 45 45 30}
		{volumes "turret*"}
		{durability {pierce {koef 3}} {blast {koef 3}}}
		{threshold {pierce {calibre 30}}}
	}
}
```

Here `setting "turret"` names an area. `thickness 100 45 45 30` means front, side, rear, top. If you give one number it applies to every side; two numbers mean front, then the same value for side, rear and top; four numbers mean all four. Do not give three, because the game then reads the sides misaligned and logs an error. `volumes "turret*"` matches volumes by their first tag with a wildcard. Leave it out and the area covers every volume.

In vanilla data you rarely see `setting` blocks in a unit's own file. The templates define armour macros, and a definition calls one with four numbers per part, for example `("armor_medium" turret(50 30 30 10) body(80 30 20 22))`. Change those numbers and you change the areas. [Reference 7](r07-armour-volumes-damage.md) lists the macros ([armor_tank](r07-armour-volumes-damage.md#armor_tank)).

The rules that decide what thickness a shot meets:

1. The first area that matches a volume wins, in the order the areas were defined.
2. If that area's value for the side that was hit is not zero, it overrides the volume's own `thickness`. If it is zero, the volume's own value is used.
3. The left and right sides share the area's `side` value, and the bottom uses the area's `top` value.

So if you edit a number in a volume's own `thickness` block and nothing changes in game, an armour area is very likely overriding it. Edit the area (or the macro's numbers) instead. A nonzero area value also flattens a part that is split into several volumes, such as an upper and a lower glacis, into one number.

If you write two `setting` blocks with the same name, they merge: a later `thickness` replaces the earlier one while the area keeps its original position in the order. That is a quiet way to edit the wrong area. See [setting](r07-armour-volumes-damage.md#setting) and [thickness (area)](r07-armour-volumes-damage.md#thickness-area).

You do not have to work this out by hand. The Models page of the ARSENAL window, Armor part, lists every armoured part of a vehicle with its six sides, says where each number comes from (the volume itself or an armour area), lets you change a number with a preview, and shows which guns at which range go through. A shot test there lists every plate a shell meets, and its "Behind the armour" panel shows what the hit does to the parts and the crew under the unit's own scripts. The command way is `ARSENAL armorsim table <unit>` and `ARSENAL armorsim edit`. The step-by-step page is [Change armour and see the result](p05-change-armour.md), the window is in [chapter 9, section 11](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window), and chapter 9 covers the penetration math, thresholds and durability ([weapons, ammo and damage](09-weapons-ammo-damage.md)).

### In Gates of Hell

<!-- goh: GHDMG-41 GHDMG-01 GHDMG-02 -->

Armour areas are read the same way, but their `durability` does nothing: armour never wears in Gates of Hell. Instead each part of a vehicle has health, given by a `perks` block and the categories in `set/component.set`. See [Vehicle part health](09-weapons-ammo-damage.md#vehicle-part-health) in chapter 9.

## 7. Extenders, sensors and seats

Extenders are add-on features attached with `{extender "type" ...}`. An entity may hold several. The ones you will meet most often:

| Extender | What it gives the entity |
|---|---|
| [`inventory`](r03-extenders-and-components.md#inventory) | A grid box of items and holders where items are worn or used |
| [`vitality`](r03-extenders-and-components.md#vitality) | Health, and stamina for soldiers |
| [`shield`](r03-extenders-and-components.md#shield) | Vehicle shields such as side skirts, which stop bullets while their parts are intact |
| [`supply_zone`](r03-extenders-and-components.md#supply_zone) | A zone that resupplies nearby units |
| [`light`](r03-extenders-and-components.md#light) | Lamps and light effects |
| [`cannon`](r03-extenders-and-components.md#cannon) | The logic of towed and fixed guns: opening for firing, closing for moving, and the crew they need |
| [`enumerator`](r03-extenders-and-components.md#enumerator) | Tactical number markings |
| [`map_point`](r03-extenders-and-components.md#map_point) | A capture point or other map point |

If you name an extender type that does not exist in a definition file, the game stops with "Extender not found". On an entity placed in a mission the same mistake only logs `Extender "<name>" not found` and the block is skipped, so the feature is silently missing. Extender type names are not case-sensitive. Chapter 8 goes into vitality and inventory in depth ([infantry and humans](08-infantry-and-humans.md)), and the reference entry [extender](r03-extenders-and-components.md#extender) lists every type.

A sensor describes sight. Its usual part is a visor, a view point on a bone with a vision profile:

```
{sensor {visor "main" {bone "basis"} {vision "tank_main-h"}}}
```

Vision profiles come from the files in `set/vision`. Pick an existing profile name, and the unit sees about as far as the unit it was borrowed from. A vision name that does not exist stops loading with `Vision "<name>" not found`. See [visor](r03-extenders-and-components.md#visor).

Seats are described with `placer`, where each place has a role name such as `gunner` or `driver`:

```
{placer
	{place "driver" {group "crew"} {visor "driver"}}
}
```

The role names are what interaction scripts use to talk about a seat, for example to kill the crew member in one place or to check whether a place is taken. Doors and the animations for getting in and out are in a separate `boarder` block. See [placer (seats)](r03-extenders-and-components.md#placer-seats) and [boarder](r03-extenders-and-components.md#boarder-getting-in-and-out).

Some bone keys in the model file can crash the game. In particular, `speed` or `limits` on a plain bone of the `.mdl` (instead of a turning or sliding joint bone) stops the game with "unexpected token" when the unit loads, so do not put them on bones you are not sure about. Chapter [16](16-effects-sound-models.md) covers models.

### In Gates of Hell

<!-- goh: GHKEY-74 GHKEY-08 GHKEY-25 GHKEY-26 GHKEY-27 GHKEY-37 GHKEY-38 GHSTR-11 GHSTR-12 GHSTR-13 GHKEY-13 GHKEY-39 GHKEY-45 GHKEY-73 -->

Gates of Hell has extenders the 64-bit game does not have. A definition that names one stops the 64-bit game with "Extender not found", so take them out of a ported unit.

| Extender | What it does in Gates of Hell |
|---|---|
| `medic_tent` | A healing zone round a medic tent; `DefaultRadius` 10 by default. |
| `flare` | Flares from named bones, with a `Cooldown`. |
| `resources` | A store with `max`, `current` and `income` (100, 100, 0 by default). |
| `weaponlight` | A light on a weapon, at its bone `fx_light`; without that bone the log says `Missing "fx_light" bone in entity`. |
| `heritage` | Keeps the units this one spawned, such as the zone of a tent, across saves. |
| `waypoint` | A waypoint helper, with `RandomPosition`. |
| `vehicle_vitality` | Part health events of a vehicle. |

Some extenders both games have take more keys in Gates of Hell: `smokescreen` has `Cooldown` and `ItemTags` and uses one smoke item with the unit's own `deploy_smoke` command; `land` has `RemoveEntities` and `land_patch` has `BigKernel`; `edifice` has `Enabled`; the detail extender's `random` off shows the details as modelled. Tactical number pictures are looked for in `/texture/common/vehicle/enumerator/` there, not in `/texture/common/model/enumerator/`, so copy the digit pictures when you port. A seat may be `Sealable`, which gives the vehicle the tag `hatch`.

## 8. Data sets

Not everything is a definition. Shared tables live in `set` files that many entities refer to by name. [Reference 2](r02-entity-definition.md) gives each one an entry ([Shared data sets](r02-entity-definition.md#shared-data-sets)):

- [`set/colliders.set`](r02-entity-definition.md#setcollidersset): the collision profiles that `collider` picks from. An unknown profile name logs `collider profile '<name>' not found` and the first profile is used instead. At most 32 different collision groups ([`colliderId`](r02-entity-definition.md#colliderid)) can exist; a 33rd group has no place and its collision masks go wrong.
- `set/registry/obstacles.reg`: the pathfinding cost classes that [`ObstacleID`](r02-entity-definition.md#obstacleid) picks from. A name that is not there logs only `No obstacle ID in <entity>`, but can crash the game minutes later when a vehicle tries to crush the object.
- `set/ballistics.set` for the damage curves over range, `set/material.set` for what shells do on steel, wood and stone, and the folders `set/breed`, `set/ability`, `set/vision` and `set/target` for soldier types, abilities, sight and target choice.

Chapter 17 covers tuning these ([balance, pricing and gameplay](17-balance-pricing-gameplay.md)). For now, remember two things. A name you write in a definition, such as a curve, a material or a profile, must exist in one of these sets. And a mod overrides a set file by shipping the whole file at the same path, so every entry your copy leaves out is gone, including entries another mod added. `ARSENAL refcheck` checks that the names you use resolve.

### In Gates of Hell

<!-- goh: GHDMG-01 GHDMG-30 GHKEY-02 GHKEY-09 GHKEY-10 GHKEY-12 -->

Gates of Hell has set files the 64-bit game never reads:

| File | What it holds |
|---|---|
| `set/component.set` | Health categories of vehicle parts ([chapter 9](09-weapons-ammo-damage.md#vehicle-part-health)). |
| `set/damage.set` | The blast-to-health table, the plate hardness table and the energy units ([chapter 9](09-weapons-ammo-damage.md#in-gates-of-hell-9)). |
| `set/squads.set` | How far apart squad members stand when they are placed, for competitive and cooperative games. |
| `set/registry/library.reg`, `set/library.set` | The pages and the look of the in-game library of soldiers, vehicles, weapons and items. |
| `set/tp_control.set` | Direct control and third person settings ([chapter 8](08-infantry-and-humans.md#direct-control-and-third-person)). |

Shipping one of these in a 64-bit mod does nothing. A Gates of Hell mod that changes one ships the whole file, as with every set file.

## 9. Step by step: a new entity from a copy

You almost never write an entity from scratch. You copy a close relative and change it. Each step below gives the ARSENAL window way first and the command way second; the commands are described in [chapter 19](19-toolchain.md).

**Step 1. Make a mod folder** (skip this if you already have one). In the window, use the Mods page ("Make my first mod"). The command way:

```
ARSENAL new mymod --name "My Mod"
```

**Step 2. Copy the unit.** In the window, open the Units page, pick your mod, find the unit to copy, and fill in "Add a unit (copy)": a new id, the name players will see and the price. Preview, then write. The copy gets its own definition, its own name text and its own card in the buy panel, and keeps the model of the unit you copied. "Describe a new unit" on the same page builds a unit from plain words, such as "fast heavy tank with a big gun, cost 900", by picking the closest game unit and changing the copy; read its "Understood" and "Assumed" lines before you write. The command way copies the definition alone:

```
ARSENAL clone-entity --game <game folder> --out <mod folder> --entity <unit to copy> --as mytank --dry-run
ARSENAL clone-entity --game <game folder> --out <mod folder> --entity <unit to copy> --as mytank
```

This writes `mytank.def` into your mod and rewrites the names inside it. Add `--copy-assets` if you want your own copies of the model files too, and `--roster` to give it a buy panel entry. A copied mesh (`.ply`) must travel with its `.mtl` material file beside it: without it the game crashes the moment the mesh loads. `clone-entity` also has a mode for stuff: pass `--stuff "<base tags>"`, `--tags` and `--name` to copy a weapon or shell into your mod as a small `{from ...}` file, and use repeatable `--set key=value` to override single values. The page [Add a new unit from an existing one](p03-add-a-unit.md) has the `gen` recipe that does the whole unit from the command line.

**Step 3. Make a small change.** In the window, the Units page's "Quick change" changes the price, name, armour, unlock time, rank or head start of one unit; the Balance page changes many units at once (price, speed, armour, reload); the Models page's Armor part changes single plates; and the Editor page (tab IDE) lets you edit the copied file by hand, checking it as you type, Lua and `.lng` files included. In the Editor, Go to definition (F12 or Ctrl+click) opens the file, macro or entity a name points to, and for a key or tag with no file behind it shows what is known about it; you can also open the game's own copy of the file, or another mod's, side by side with yours, and edit text files that sit inside your mod's paks ([chapter 19](19-toolchain.md#ide-all-games)). The Quick Guided Task walks through a whole soldier, squad, vehicle, gun or item one question at a time ([Use the Quick Guided Task](p17-quick-guided-task.md)). For a single value from the command line, use the safe patch tool, which refuses to write if the result fails a check:

```
ARSENAL patch-entity <mod folder> --game <game folder> --entity mytank --set "game_entity/mass#1=40500" --dry-run
```

The path names blocks from the file's root block down, separated by `/`; `name[1]` would pick the second of several blocks with the same name (counted from 0), and `#1` is the first value after the block name. A path that does not exist stops the tool with a "key missing" finding and writes nothing. Drop `--dry-run` to apply it once the preview looks right.

**Step 4. Check it.** In the window, open the Check page and press "Check the mod"; on the Editor page, problems are marked in the open file as you type. The command way:

```
ARSENAL check mymod
ARSENAL keylint <mod folder> --game <game folder>
ARSENAL refcheck <game folder> --folder <mod folder>
```

`check` runs every checker and gives one verdict. `keylint` complains about keys that do not belong where you put them. `refcheck` makes sure every file, sound, curve and entity you name actually exists. `entityindex` is the cache they use; you rarely run it yourself. Common switches on these tools are `-q` for quiet, `--summary` for a short report and `--mods` to add other mods to the picture.

**Step 5. Look at it in the game.** Play a test match from the Play page or with `ARSENAL play mymod` (see [chapter 18](18-testing-and-logs.md)), and read the game log. Never call a data change finished until you have seen it work.

### In Gates of Hell

<!-- goh: none (ARSENAL pages for Gates of Hell) -->

The steps are the same. Under the GoH button the Units, Models, Balance and Editor pages open Gates of Hell files and write into a Gates of Hell mod; a part that cannot work there says so in one line, such as the Armor part of Models. Check the result on the Check page, which runs the Gates of Hell checks. To bring a Gates of Hell unit into the 64-bit game, use the GoH unit page (tab Units & Balance) and [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

See also: [Reference 2: Gates of Hell only](r02-entity-definition.md#gates-of-hell-only), [Reference 3: Gates of Hell only](r03-extenders-and-components.md#gates-of-hell-only), [chapter 19, the pages of the window](19-toolchain.md#3-the-pages-of-the-window), [chapter 21](21-troubleshooting.md).

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. Entity classes and folders | not mapped | folder layout not compared |
| 2. The top of a definition | [differs](#in-gates-of-hell) | more top-level keys, each fatal in the 64-bit game |
| 3. Tag lists | [differs](#in-gates-of-hell-1) | soldier and vehicle by kind; more fixed unit tags |
| 4. Stuff, `from` and damage effects | [differs](#in-gates-of-hell-2) | `from` keeps extra tags; every effect sound plays |
| 5. Volumes | [differs](#in-gates-of-hell-3) | hardness, cast steel, flaw, `blockcamera`, wind |
| 6. Armour areas | [differs](#in-gates-of-hell-4) | no wear; parts have health instead |
| 7. Extenders, sensors and seats | [differs](#in-gates-of-hell-5) | seven more extenders; new keys on old ones |
| 8. Data sets | [differs](#in-gates-of-hell-6) | `component.set`, `damage.set`, `squads.set`, library and third person files |
| 9. Step by step | [differs](#in-gates-of-hell-7) | fewer ARSENAL pages; port with GoH unit |

## Pitfalls

- A volume name the model has no shape for creates an empty volume, silently. The unit loads but shells fly through that part.
- A missing file named in `Extension` or an include is a fatal error. An unknown key at the top level of a definition is fatal too; a typo inside a quiet block is silent. Check after every change.
- Editing a volume's own thickness does nothing where an armour area gives a nonzero value for that side.
- `damage` without `add` replaces; `damage add` stacks.
- `clear` or `-tag` in a tag list can switch off scripted behaviour you did not know depended on a tag.
- Three numbers in an armour area `thickness` misalign the sides.
- A relative `Extension` or include path in a copied definition looks next to the copy. Use paths with a leading `/`.
- A copied mesh without its `.mtl` file crashes the game when it loads.
- A name in `ObstacleID` that is not in `obstacles.reg` can crash a match much later.
- A copied set file replaces the original whole. Entries your copy leaves out are gone.
- A `.patch` file placed loose in the mod root is not read. Only a `.patch` inside a mounted `N.pat` zip counts (see [chapter 4](04-vfs-paks-patches.md)).
- Editors may change encoding or line endings on save. Keep CRLF, UTF-8 string values and the old comment bytes of copied files.

## Next

Chapter [7](07-units-vehicles-movement.md) covers units, vehicles and movement.
