# 13. Maps

The short way: [Copy and change a map](p09-copy-and-change-a-map.md) gives the steps for copying a map into your mod, naming it, placing an object and testing it. This chapter explains what a map is made of. The keys of the map files have their own entries in [Reference 11, Map files](r11-mission-files.md#15-map-files).

## What you will learn

- What files make up a map folder and how the game loads them.
- How the `map` file places entities, and how the `map.net` file describes the ground.
- How pathfinding reads terrain, and how to tune it.
- How to place spawn points and flags.
- How a map gets into the multiplayer lobby, and a minimal recipe for a new map.
- How the Maps page, `ARSENAL maps`, `ARSENAL mapview` and `ARSENAL place-entity` help you.

Work in your own mod folder (for example `mods/mymod/resource/map/multi/mymap/`). Text files use CRLF line endings; the 64-bit build reads every string value as UTF-8, in data files and `.lng` files alike, and identifiers must be plain ASCII. Original data is ASCII outside `;` comments, where some old cp1251 bytes remain; the game skips them, so leave them as they are. The first line of the text files here is `;SDL`. See [chapter 3](03-mod-folder-and-load-order.md) for mod folders and [chapter 4](04-vfs-paks-patches.md) for paks. Never edit a map in the game folder: copy it into your mod.

## 1. How a map loads

A scene load reads two files in order: `<dir>/map` (the static scene, in the same text format as other data) and then `<dir>/<mode>.mi` (the mission). A mission is named `"<directory>:<name>"`, for example `multi/mymap:combat`. One folder can hold many missions, so a single terrain serves every mode. A file in your mod at the same path as a vanilla map file wins over the copy in `map.pak`.

## 2. The map folder

| File | Purpose |
|---|---|
| `map` | land, clip areas, ocean, placed objects, links, tags, edifices |
| `map.net` | binary ground grid: heights, ground types, materials |
| `map.ply` | the terrain mesh |
| `map.grs` | grass (optional) |
| `mtl0.mtl` to `mtlN.mtl` | terrain materials, one per mesh part (read first); `.materials` is the fallback library |
| `<mode>.mi` | one mission per game mode |
| `map.info` | game card overrides for this map, such as player counts; `<mode>.info` overrides one mode |
| `minimap.dds`, `preview.dds`, `preview_small.dds` | images (optional) |
| `header.*` | lobby header image (falls back to the preview) |
| `remap.set` | `{item_remap {"from" "to"}}`: per-map translation of item tags |
| `interface.set`, `0.mi` | single-player maps only |

A map without `map.grs`, previews, minimap or `.materials` still loads and plays: the minimap is grey and there is no grass. Each terrain material needs exactly two `{layer}` blocks; with one, the map loads but the game crashes at the first crater.

A `mod/` folder inside a map directory is destructive: its files are moved over the game's resource folder when the map loads, which changes the installation for good. Do not use it.

A map archive named `N.pat` is a zip that must contain a `.patch` file with `{id N}`; otherwise the log says "Wrong patch N". The patch blocks are `{id N}`, `{delete "path"}` and `{remap "from" "to"}`. A patch can delete a map's `<mode>.mi` to remove the map from that mode.

### In Gates of Hell

<!-- goh: GHMAP-08 GHMAP-11 PORT-72 -->

- `map.grs` has another layout (extra header parts and 5-byte records). This game misreads it and stops with an out-of-memory error about a minute and a half into loading. `ARSENAL mapport` rewrites it.
- Water can be drawn by a newer ocean renderer that needs `WaveWorks.win64.dll` beside the game. Its mask lies beside the map as `map.omask` (or the older `map.ocean`): water, shore and depth in 20-unit cells. This game reads neither file.

## 3. The `map` file

The minimal useful file looks like this:

```
;SDL
{map
	{Land {Position 0 0}}
	{Clips
		{"[auto]"
			{world -1000 -1000 1000 1000}
			{camera -900 -900 900 900}
			{pather -900 -900 900 900}
			{distance 200 800}
			{viewAngle 20 50}
		}
	}
}
```

Blocks you can use:

- `Land` is the terrain entity; its heights and mesh come from `map.net` and `map.ply`.
- `Clips` holds named clip areas: the `world` rectangle (the map bounds, which must lie inside the terrain), the `camera` rectangle, the `pather` rectangle (the area the pathfinding grid covers), and the `distance` (zoom) and `viewAngle` (tilt) ranges. `"[auto]"` is the default. A mission can switch to another named clip with the `set_clip` command; `captureflag` needs the clips `captureflaga` and `captureflagb`. The old single `{Clip}` block still loads but logs "Obsolete block clip. Resave map". See [Clips](r11-mission-files.md#clips).
- `Ocean` adds water.
- `Entity "<def>" 0x<uid> {Position x y} {xform ...} {TexMod ...} {Extender ...}` places a static object.
- `Link`, `LinkTrailer`, `Tags` and `Helpers {edifice ...}` for links, tags and buildings.

In `xform` the only accepted tokens are `zl <deg>` (turn about the object's own up axis), `zw`, `y` and `scale f`. Anything else gives "unexpected token". Entity uids are 16-bit numbers and must be unique across the `map` file and every `.mi` file in the same folder; vanilla map files keep theirs below `0x8000` and missions use `0x8000` and up. If you leave out the third `Position` number, the object sits on the ground. An entity whose definition no longer exists logs `can't spawn entity` and is skipped; the rest of the map loads. A definition from your mod works too, but then every multiplayer player needs your mod.

### In Gates of Hell

<!-- goh: GHMAP-07 GHMAP-09 GHMAP-21 GHMAP-23 GHMAP-24 GHMAP-26 PORT-73 -->

- **Blocks this game cannot read.** `Haze` and `GlobalTexture {Normalmap ".."} {Diffuse ".."}` at the top of the map, and on entities `AreaDisableEditor`, `DisableObstaclesEditor`, a component's `Health` and `HealthBroken`, and the volume ability `blockcamera`, all stop the load here with "unexpected token" before the terrain appears. `ARSENAL mapport` drops them; the distance haze and the start health of map objects are lost.
- **Ocean keys:** `ww_environment_mode` (0 sea, 1 lake, 2 river), `ww_ocean_base_color`, `ww_pollution_color` and `ww_pollution_factor`. Unknown ocean keys are skipped here.
- **Entity uids** are 32-bit there. A map with uids above `0xffff` probably cannot load here.
- **An inventory block** on an entity that has no inventory is skipped with the warning "Trying to load inventory for ..., which has no inventory".
- **The scene camera** resets to the preset `main`, not `perspective`.

**Units.** Positions use map units: 20 map units are 1 metre. A ground grid cell is 10 units (half a metre). Zone radii of map points and the `near` distance in missions are in **metres**, so do not mix the two. The Maps page asks for metres and converts them for you; `ARSENAL place-entity --pos` takes map units.

## 4. The ground grid: `map.net`

`map.net` is a binary file. It begins with a header: one byte for cell size (10 in vanilla), one byte for version (0 to 2; the editor writes 2), two 16-bit numbers for width and height in cells (at most 32767), and two 32-bit floats for the X and Y offsets. Version 2 then has three name tables: MAP0 (ground type names), MAP1 (material names) and a GRID marker. After the header the cells run row by row, starting at the south (the lowest Y), and each cell in version 1 or 2 takes 4 bytes: a signed 16-bit height, a ground type byte and a material byte.

Ids inside the file are local and are remapped by name when loaded; a name the game does not know logs `unknown terrain_pp type` or `unknown terrain_fx type` and becomes 0. A height at or below -1000 means "no ground here".

Ground types decide movement: 0 undefined, 1 ground, 2 no_pass, 3 shallow_water, 4 water, 5 deep_water, 6 swamp, 7 road, 8 no_pass_human. Materials decide footsteps, impacts and physics: ids 0 to 8 are built in (undefined, ground, air, underwater, shallow_water, water, deep_water, bridge, bridge_wood), and ids from 9 up follow the order of `set/interaction_terrain/terrains.set`, which in vanilla is road, country_road, rock, ice, swamp, sand, puddle, mud, snow, grass.

A few useful consequences:

- A shallow river is material `shallow_water` over type `ground`. Units wade through it without being blocked; movement follows the type, not the material.
- A rocky ridge is type `no_pass`, which units cannot cross.
- The slope of a cell is divided into 15 classes of 6 degrees each. The pather uses that class to index its `Height` table (section 5).

`map.ply` has to cover the same area as the heights (unconfirmed), and its Y axis is the negative of the `map.net` Y. Making a heightmap by hand is feasible, but a matching mesh is hard; most modders change existing maps in the game's map editor, which writes `map`, `map.ply`, `map.net`, `map.grs` and `.materials` when you save the map, and `<name>.mi` when you save the mission. If a patched land was saved without a copy, the editor warns "Land was patched after modification. Land is NOT SAVED!". Editor autosave files are named `editor_last_*` in the profile.

`ARSENAL mapgen --height <image.pgm> --name <new> --out <mod folder>` builds a new multiplayer map (ground grid, mesh, materials, `map`, `map.info` and a `combat.mi` with spawn points) from a greyscale height image and optional painted masks for sand, mud, rock, road and no_pass ground. `ARSENAL mapgen --check <map folder>` reads a written map back.

You do not have to read the binary by hand. Use the viewer:

```
ARSENAL maps view --map multi/<map>
ARSENAL mapview <map.net | folder> [--layer type|material|height] [--width N] [--entities] [--svg out.svg]
ARSENAL mapview --game <game folder> --map multi/<map> --layer height
```

It prints a preview in the terminal or writes an SVG, and `--entities` overlays the placed objects. The Maps page draws the same picture for the map you pick: green is open ground, blue water, grey road, red buildings and dark green forest.

### In Gates of Hell

<!-- goh: GHMAP-06 GHMAP-12 GHMAP-15 GHMAP-16 PORT-70 -->

- **Cell size.** Most Gates of Hell maps have a ground grid cell of 5 units (a quarter of a metre); this game's are 10. On this game a cell-5 map stops the load with "Different grid cell sizes!". `ARSENAL mapport` resamples such a `map.net` to cell 10 (every second cell, same world size) unless you give `--keep-cell`, and `ARSENAL maps clone` refuses a ground grid of the other game.
- **Version.** Gates of Hell reads every `map.net` as version 2 whatever its version byte says, so an old version 0 or 1 file must be saved again as version 2 before it works there.
- **Ground types** 9 snow, 10 forest and 11 slope are added.
- **Slope classes** are worked out from the neighbouring cells only (here three cells around), so the same map gets sharper slope classes there.

## 5. Pathfinding: `set/PATHER.SET`

The file is one `{Pathers ...}` block with a `{Profile "<name>" ...}` for each movement class: `human` (which must come first, as the default), `human_flying`, `animal`, `tank`, `tank.light`, `amphibia`, `armored`, `vehicle.large`, `vehicle.small`, `moto`, the `cannon.*` profiles, `airborne`, `railway` and the water profiles. The vanilla `tank` profile has this shape:

```
{Profile "tank"
	{Radius 2.25}
	{Priority 5}
	{BattleCrusher}
	{Terrain
		"road"          1.25
		"ground"        0.75
		"no_pass"       0
		"swamp"         0.5
		"shallow_water" 0.5
		"water"         0
		"deep_water"    0
	}
	{Height
		 0  0  1  2  3
		-1 -1 -1 -1 -1
		-1 -1 -1 -1 -1
	}
}
```

- `Terrain` lists ground tags with a number K each; the tags are the `pp` tags that `terrains.set` gives each ground. A K of 0 or less disables that terrain. A K of 1 or more has no penalty. A K between 0 and 1 means the unit moves at `max speed x K` and the route costs `1/K`. A third number of 0 after K (vanilla `human` has `"water" 0.4 0`) stops the AI from moving there by itself.
- `Height` lists 15 numbers, one for each 6-degree slope class from flat upwards: a negative number blocks that slope, 0 is free and a positive number adds a penalty.
- `Radius` is the clearance the unit needs, in metres.
- Path cost is the distance multiplied by the terrain cost plus the slope cost.
- `{Network}` builds a route grid for the profile; in vanilla only `human` has one, and the other profiles search point to point. Other keys are `LinearPath`, `Human`, `BattleCrusher`, `SkipImpregnable` and `Priority`.

The grid is built when the land loads: the heightmap becomes a quadtree, buildings, trees and wrecks become obstacle polygons grown by the profile's radius, and then walkable cells and links are added. With the vanilla tables, tanks are blocked from 30 degrees of slope and infantry from 42 degrees. The grid covers the `pather` rectangle of the default clip, so a clip that is too small stops units from finding routes outside it. In competitive multiplayer a route search for a point order is cut short at 60 metres, so far targets are reached in legs.

### In Gates of Hell

<!-- goh: GHMIS-139 GHMIS-140 GHAI-29 -->

The console variable `g_pnetGridSize` (the route grid size) defaults to 100, half of this game's 200. The threshold for taking a straight line instead of a searched route has two console variables, (1.05) and (1.3); this game uses 1.3 for both, so Gates of Hell infantry take the straight line less often. Cover is searched on a grid of 5-unit cells (7 here).

## 6. Map points: spawns and flags

Spawn points and flags are entities in the `.mi` file with a `map_point` extender:

```
{Entity "map_point" 0xc001 {Position 13.5 15055.1} {xform zl -88.18}
	{Extender "map_point" {name a3} {team a} {phase 0} {order 3} {visor SpawnPoint}}
	{Player 0} {MID 15}}

{Entity "flag_point_1" 0x802f {Position -221.82 9844.37} {xform scale 0.75}
	{Extender "map_point" {name f1} {zoneA 12} {zoneB 12} {phase 0} {order 1}
		{show All} {visor MapPoint}
		{allow {enableCapture} {enableRelease}}}
	{Player 0} {MID 2}}
```

Keys:

- `name`: the point's id, such as `a1`, `b2` or `f3`.
- `team`: `a` or `b`; a flag has none.
- `order`: players get spawn points by this number within their team.
- `phase`: the game phase, used by `frontline`.
- `zoneA` and `zoneB`: the capture radius for team a and team b, in metres (at least 1). Vanilla flags use 12 metres, which is 240 map units. Spawn points have 0.
- `show`: `None`, `Scene`, `Minimap` or `All`. `visor`: `None`, `MapPoint` or `SpawnPoint`.
- `allow {spawn ...} {capture ...} {release ...} {enableCapture} {enableRelease}`: tag lists of who may spawn, capture and release (empty means everyone), and two switches that are on by default.

An entity counts as a flag if its definition carries the tag `flag`; the vanilla ones are `flag_point_N`. Extra spawn spots use a separate `spawn point` extender with `mapPoint` (the owning point's name) and `pos`. `MID` is a 16-bit mission id that selectors can name, and `{Player 0}` leaves the point neutral until it is captured. See [map point keys](r11-mission-files.md#name-map-point).

Different modes need different points. `combat` needs spawn points only. `battle_zones` needs spawns plus flags; most vanilla maps have one more flag than the number of players (a 4-player map has 5 flags). `captureflag` has spawns, one `flag_point_frontlines` and the two capture clips. `frontline` uses phases, with spawn points per phase. The number of spawn points is not checked against the player count, so count them yourself.

The zone circles are drawn only before the match starts. Flags placed by a tool stand at a computed spot; check in a match that they capture as you expect.

### In Gates of Hell

<!-- goh: GHMAP-03 GHMAP-04 GHMAP-13 GHMAP-14 GHSTR-13 GHMIS-44 GHMIS-45 GHMIS-73 GHMIS-101 PORT-64 -->

- **Capture areas.** A flag's zone is either a circle of `radius`, taken as written with no 1-metre minimum and no conversion from metres (so the same number gives another size in the two games), or a drawn area named by `zoneId`, captured from anywhere inside with every unit counting the same, and shown with a dashed outline. This game reads only `zoneA` and `zoneB`; a carried flag without them gets a 1-metre zone and is practically never captured. `ARSENAL mission-clone` turns such flags into circles (see [chapter 12](12-missions-and-multiplayer-setup.md#in-gates-of-hell-6)).
- **The `waypoint` extender** marks route points for missions and bots. This game does not have it and stops the load with an "Extender not found" error.
- **Order.** At mission start the map points are sorted by name, which decides which spawn point a player gets. A waypoint may carry `RandomPosition`.
- **Base flags** of the battle modes are entities named `base_flag_<team>`, with variants that show only on the attacking side's map.
- **Spawn halves.** With the game setting `coldWarSpawn`, players take map points tagged `a` or `b`, so a map for that mode needs those tags.

## 7. The mission file for a map

The `.mi` top-level parts are written in this order: Entity, Human, Tags and Link; Environment; Azimuth; MapOrientation; Helpers; Players; Fog; EntityManager; Covers; Squads. Saved games add a few more. The game reads them in any order.

`{Players {count N} {user n} {alias n "name"} {diplomacy ...}}` sets up the sides. Current files use `count 18` and older ones 17; side 0 is neutral. `diplomacy` is a count by count table, row against column, where 0 means neutral, 1 enemy and 2 ally. A side is always its own ally, and without the table every side is the enemy of every other.

Multiplayer missions hold spawn points, flags and ambient sound speakers. They have no zones (capture areas are the map points above) and no units, because multiplayer forces come from purchases and bots. A vanilla multiplayer mission picks its weather with a trigger that runs `environment` and deletes the day, night or rain speakers by tag. Single-player maps live in `map/single/<campaign>/<mission>/` and place their units in `0.mi`. Triggers, conditions and commands are explained in [chapter 12](12-missions-and-multiplayer-setup.md); every block is in [Mission file blocks](r11-mission-files.md#2-mission-file-blocks).

## 8. Getting into the lobby

At start the game walks every `.mi` under `/map/multi/`, sub-folders and mods included. The file name (its title) must match a game card `set/multiplayer/games/<title>.set`. If it does not, the log says "Mission '...' is skipped - game type(...) is undefined". The vanilla cards are `combat`, `battle_zones`, `battle_zones_8x8`, `captureflag`, `cooperative` and `frontline`. A map's lobby card is `<directory>:<title>`.

The game card is then overlaid by the map's `map.info` and after that by `<title>.info`, so a map can change any game card key for itself:

```
;SDL
{game {maxPlayers 4} {texMod 2}}
```

Player counts are rounded up to an even number and clamped to 2 to `mp_maxPlayers` (16). A ranked entry is `{ranked {enabled} {minPlayers n} {maxPlayers n}}`. About 30 vanilla `map.info` files use flat keys (`rankedMinPlayers`, `rankedMaxPlayers`) instead, which the 64-bit build skips without a message. Unknown keys are skipped too. See [map.info](r11-mission-files.md#mapinfo).

The lobby title comes from the localization key `mission/<directory>/name`, for example `mission/multi/mymap/name`; without it the lobby shows the folder name. See [chapter 14](14-localization.md). Maps downloaded in the lobby are mounted from the profile `maps/` folder.

### In Gates of Hell

<!-- goh: GHMAP-01 GHMAP-02 GHCQ-18 GHMIS-94 -->

- The game cards differ (see [chapter 12](12-missions-and-multiplayer-setup.md#in-gates-of-hell)), so a `.mi` named after a Gates of Hell mode, such as `frontlines` or `koth`, is skipped here unless your mod adds a card of that name.
- A co-op map plays the side of the campaign location it belongs to (`{side ...}` in the campaign's `interface.set`), not the mission's own side. A location can also name the army it is listed under with the key `menu`.
- Conquest picks maps for its places by the `landscape` key in the map's card, and logs "Could not find any maps for <landscape>" when none fits.

## 9. Making your own map

### The Maps page

In the window, the Maps page does the common jobs without hand editing:

1. **Pick a map.** The list shows every multiplayer map with its player count, game modes and where it comes from, and draws its terrain. Type part of a name, or pick a player count or a mode, to narrow the list; "Read the list again" reads it afresh after you add maps. Maps that cannot be copied are marked. The Editor page's map file viewer ([chapter 19](19-toolchain.md#file-viewers)) can open the Maps page with that map picked.
2. **Make my copy.** Choose your mod folder, a new map name (letters, digits and `_`; it becomes the folder name), the name players see in the lobby, and a game mode (keep the map's modes, or make one of `combat`, `battle_zones` or `captureflag`). "Allow bots" switches bots on in the mode's game card in your mod, which affects every map with that mode while your mod is on. "Preview (writes nothing)" shows the plan; "Write the copy" writes it and runs the map check. If the map name was mistyped, the page offers the names it meant. After a write it reminds you that the map needs a game test, with a "Go to Play" button.
3. **Put an object on a map.** Choose the map, type the object's definition name, and its east-west and north-south position, and optionally height and turn. You type **metres**; the page converts them at 20 map units to 1 metre and shows both. "Preview (writes nothing)" shows the change and "Place it" writes it. Soldiers and tanks are not placed here, because players buy them in a match.

"Check my mod's maps" ("Check now") looks for mistakes the game would trip over, and "Go to Play" opens the Play page, where "Play a test match" starts the game on your map. For flags, spawn points and anything you want to place by sight, "Use the game's own editor" lists the steps for the game's map editor.

The quick way: in the Quick Guided Task row choose "I want to" "make" "a map, starting from a game map", or "change" "the settings of a map". It asks, one group at a time, about the copy and its name, players, game modes and bots, season and pictures, objects on the map, and ground and start points. See [Use the Quick Guided Task](p17-quick-guided-task.md) and [chapter 19](19-toolchain.md#quick-guided-task).

### The command way

```
ARSENAL maps list [--map map/multi/<map>]
ARSENAL maps clone --map map/multi/<map> --name <new> --out <mod folder> --target as64 --plan
ARSENAL maps mode --map map/multi/<map> --from combat --to battle_zones --out <mod folder> --dry-run
ARSENAL lng-add <mod folder> --file mission/multi/<new>.lng --key mission/multi/<new>/name --text "My map"
```

`maps clone` copies the terrain files byte for byte, renames the map inside its text files and writes a lobby name file; remove `--plan` to write, and add `--only-mode <mode>` to keep one mode. `maps mode` adds a mode to a map (see [chapter 12](12-missions-and-multiplayer-setup.md)). A Gates of Hell map is refused because its ground grid has a different cell size.

### By hand

1. Terrain: a `map`, `map.net`, `map.ply` and either `.materials` or `mtlN.mtl` files (two layers each).
2. A `<mode>.mi` with at least one spawn `map_point` per team (`team a` or `b`, `order 1`, `visor SpawnPoint`, `Player 0`, a unique `MID`), an `Environment` (`multi/multi_01`), `Players`, `{Fog 1}` and `{EntityManager {Enabled}}`. Add flags only for `battle_zones`, and the two capture clips for `captureflag`.
3. A `map.info` with an even `maxPlayers`.
4. Images are optional.
5. A localization key `mission/multi/<name>/name` in a UTF-8 `.lng` file.
6. The internal name will be `multi/<name>:combat`.

If a mode file includes another file with `(include "...")` that cannot be found, the map stops loading with `File not found` when that mode is picked: copy the included file beside it.

### In Gates of Hell

<!-- goh: GHMAP-06 GHMAP-21 PORT-70 PORT-72 PORT-73 -->

`ARSENAL maps` and the map task of the Quick Guided Task work on this game's maps only. Under the Gates of Hell button the Maps page lists Gates of Hell maps and copies one into your mod, and the Map Viewer shows them; ARSENAL starts no Gates of Hell test of the map. To bring a Gates of Hell map over, use `ARSENAL mapport`:

```
ARSENAL mapport <resource root> --out <folder> [--only <text>] [--dry] [--keep-cell]
ARSENAL mapport <ported map root> --out <folder> --carry --goh <Gates of Hell resource root> [--as2 <resource root of this game>]
ARSENAL mapport --check <resource root>
```

The first form fixes `map.grs`, drops the map blocks this game cannot read and resamples a cell-5 `map.net` to cell 10; it never writes into the resource root, and `--dry` only reports. `--carry` also copies what the map needs without Gates of Hell mounted: land textures, `mtlN.mtl` files and environment presets. `--check` lists files still in Gates of Hell form. Objects the map names still have to exist in this game or in your mod, and the mode files need the treatment in [chapter 12](12-missions-and-multiplayer-setup.md#in-gates-of-hell-6). In the window, Expert Tools (Tools & Settings > Other Tools, with Advanced on) can run `mapport` only as a dry run.

## 10. Placing an entity from the command line

```
ARSENAL place-entity <mod folder> --game <game folder> --map multi/<name> --entity <def> --pos x,y[,z] [--dir deg] [--scale f] [--dry-run]
```

The tool copies the map's `map` file into your mod as an override (the override itself is unconfirmed in a match; a `.mi` override works) and adds one `{Entity ...}` with a fresh unique uid. `--pos` takes **map units, not metres**: multiply metres by 20. A third number fixes the height; without it the object sits on the ground. Use `--dry-run` first. To compare two versions of a map or mission use `ARSENAL misdiff <a> <b>`, and to check the result use `ARSENAL milint <mod folder> --game <game folder>`. See [chapter 19](19-toolchain.md).

See also: the commands, triggers and terms of a map's `.mi` files are in [chapter 12](12-missions-and-multiplayer-setup.md#7-mission-files-mi), and the lobby name of a map in [chapter 14](14-localization.md).

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

<!-- goh: GHMAP-03 GHMAP-06 GHMAP-21 PORT-70 -->

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. How a map loads | same as far as mapped | `map` then `<mode>.mi`, as here |
| 2. The map folder | [differs](#in-gates-of-hell) | other `map.grs` layout; `map.omask` ocean mask |
| 3. The `map` file | [differs](#in-gates-of-hell-1) | `Haze` and `GlobalTexture` stop the load here; 32-bit uids |
| 4. The ground grid: `map.net` | [differs](#in-gates-of-hell-2) | cell 5 instead of 10; three more ground types |
| 5. Pathfinding: `set/PATHER.SET` | [differs](#in-gates-of-hell-3) | finer route grid; separate straight-line thresholds |
| 6. Map points: spawns and flags | [differs](#in-gates-of-hell-4) | drawn capture areas; `waypoint` points; sorted by name |
| 7. The mission file for a map | differs, see [chapter 12](12-missions-and-multiplayer-setup.md#in-gates-of-hell-5) | new commands, fields and terms |
| 8. Getting into the lobby | [differs](#in-gates-of-hell-5) | other game cards; co-op side from the campaign |
| 9. Making your own map | [differs](#in-gates-of-hell-6) | `ARSENAL mapport` brings a map over; the Maps page copies GoH maps |
| 10. Placing an entity from the command line | not mapped | `place-entity` writes this game's 16-bit uids |

The job-by-job view is in [Copy and change a map: In Gates of Hell](p09-copy-and-change-a-map.md#in-gates-of-hell).

## Pitfalls

- Zone radii and the Maps page use metres; `Position` and `place-entity --pos` use map units (20 to a metre).
- A `.mi` with no matching game card is skipped.
- Duplicate entity uids across the map and its `.mi` files cause trouble at load.
- The `xform` block takes only four tokens.
- A terrain material with one layer crashes the game at the first crater.
- `captureflag` crashes at the start without the clips `captureflaga` and `captureflagb`.
- Flat ranked keys in `map.info` are skipped by the 64-bit build.
- `.ply`, `.mtl` and `.pat` files are checked by size only in the lobby, so a same-size edit desyncs later (see chapter 12).
- A `mod/` folder inside a map folder changes the game installation.
- Do not edit the vanilla map in the game folder; copy it to your mod.

## Next

[Chapter 14, Localization](14-localization.md).
