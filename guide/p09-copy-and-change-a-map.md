# Copy and change a map

This page shows how to make your own copy of a multiplayer map, give it a lobby name, put an object on it and check it. The original map is never changed: everything goes into your mod folder.

## You need

- The game folder known to ARSENAL (the Mods page shows it).
- A mod folder of your own (the first page of this part shows how to make one).
- For placing things by sight: the game's own map editor.

## The quick way

In the [Quick Guided Task](p17-quick-guided-task.md) row above the tabs, set "I want to" to **make** and choose **a map, starting from a game map**, or to **change** and choose **the settings of a map**. The task asks, group by group, for the copy and its name, the players, the game modes and bots, the season and pictures, objects on the map, and the ground and start points, then writes the copy into your mod after a review and checks it. It works under the 64-bit build only.

## Steps

1. **Pick a map.**
   In the window: open the Maps page. Under "1. Pick a map", type part of a name, or narrow the list with "Players" and "Game mode". Click a map to see its terrain and details. The first reading takes a minute or two; the list is saved afterwards, and "Read the list again" reads it anew after you add a map. A map file opened in the Editor's [file viewer](19-toolchain.md#file-viewers) can open this page too.
   On the command line: `ARSENAL maps list` prints the game modes of every multiplayer map, and `ARSENAL maps view --map multi/<map>` draws one in the terminal.

2. **Make your copy.**
   In the window: under "2. Make my copy", choose "My mod folder" with "Pick folder". Type a "New map name" (letters, digits and `_` only; it becomes the folder name) and the "Name in the lobby". Under "Game mode", keep "Keep the modes the map has" or pick one mode (see [Missions and multiplayer modes](p10-missions-and-modes.md)). Press "Preview (writes nothing)", read the plan, then "Write the copy".
   On the command line:
   ```
   ARSENAL maps clone --map map/multi/<map> --name <new> --out <mod folder> --target as64 --plan
   ```
   Remove `--plan` to write. The terrain files are copied byte for byte, the map's name is changed inside its text files, a `mod.info` is written if the mod has none, and a lobby name file `localization/mission/multi/<new>.lng` gets the original map's name. `--only-mode <mode>` copies one game mode only.

3. **Set the lobby name (command way).**
   The window did this in step 2. On the command line:
   ```
   ARSENAL lng-add <mod folder> --file mission/multi/<new>.lng --key mission/multi/<new>/name --text "My map" --force
   ```

4. **Put an object on the map.**
   In the window: under "3. Put an object on a map", choose the "Map", type the "Object name" (the definition's file name without `.def`), "East-west (m)", "North-south (m)", optionally "Height (m)" and "Turn (degrees)", then press "Place it". You type metres; the page converts them at 20 map units to 1 metre.
   On the command line:
   ```
   ARSENAL place-entity <mod folder> --game <game folder> --map multi/<new> --entity <name> --pos x,y --dir 90 --dry-run
   ```
   Here `--pos` takes map units. Remove `--dry-run` to write: the tool copies the map's `map` file into your mod and adds one `{Entity ...}` with a fresh id.

5. **Check the map.**
   In the window: "Check my mod's maps" runs after every write; "Check now" runs it again.
   On the command line: `ARSENAL milint <mod folder> --game <game folder>`.

6. **Place things by sight.**
   The Maps page lists the steps under "Use the game's own editor": install the mod, start the game's editor, enable your mod, open your map, edit and save. Saved files belong in the mod's `resource/map` folder; copy them there if they land elsewhere.

7. **Test it in a match.**
   In the window: "Go to Play", and put your map in the "Map" field.
   On the command line: `ARSENAL play <mod folder> --map multi/<new>:combat --dry`, then without `--dry`. On a map other than the default test map, `play` cannot decide the start verdict, because it has no clean run to compare with: read the log yourself ([Check a mod, fix it, read the log](p14-check-fix-read-log.md)).

## What can go wrong

- **"A map with this name already exists in the game."** Pick another name.
- **A Gates of Hell map is refused.** Its ground grid has a different cell size. See [In Gates of Hell](#in-gates-of-hell) below.
- **A name you typed is not found.** The page offers the nearest map names; pick one.
- **`captureflag` crashes at the start** with `Clipper 'captureflaga' is not found!` when the map lacks its two capture areas. Copy from a map that has `captureflag`, add the areas in the editor, or write the mode with `ARSENAL misgen` (next page).
- **A mode file includes a file the game cannot find**, and the map stops loading when that mode is picked. Copy only the mode you need, or put the missing file beside it.
- **The map is missing under a mode.** The mode file's name must match a game mode; otherwise the log says `Mission '...' is skipped`.
- **The lobby shows a raw key.** For a map in a sub-folder the key is `mission/multi/<sub>/<map>/name`.
- **The object lands in the wrong place.** The window takes metres, the command map units. Flag zone sizes are metres.
- **Flags placed by the tool** stand at a computed spot; check in a match that they capture (unconfirmed).
- **"Allow bots"** switches bots on in the mode's rule file in your mod, so every map with that mode gets bots.
- **`unexpected token` on an `xform`.** It takes only `zl`, `zw`, `y` and `scale`.
- **Multiplayer:** model, material and patch files are compared by size only, so a same-size edit passes the lobby and goes out of sync later.

## In Gates of Hell
<!-- goh: GHMAP-03 GHMAP-04 GHMAP-06 GHMAP-07 GHMAP-14 GHMAP-16 GHMAP-21 GHMAP-24 GHMAP-26 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** has the Maps page: it lists Gates of Hell maps and copies one into your mod, and the Map Viewer shows them. The map task of the Quick Guided Task is greyed, and ARSENAL starts no Gates of Hell test of the map. Edit the copy with Gates of Hell's own editor.
- **The ground grid.** A Gates of Hell height map has cells of 5 units; Assault Squad 2 uses 10 and stops loading a map with another cell size, with `Different grid cell sizes!`.
- **`map.net`** is always read in its newest layout in Gates of Hell. An old map saved in an older layout reads wrong there: save it again in the editor.
- **New blocks in the `map` file:** `Haze`, `GlobalTexture` and `CampaignSquads`. Assault Squad 2 stops on them with `unexpected token`.
- **Flags and points.** A flag can name a polygon zone with `zoneId` and is captured from anywhere inside it. A circle `radius` is taken as given, with no 1 m minimum. Gates of Hell adds `waypoint` map points, which Assault Squad 2 does not know.
- **Object ids** in a Gates of Hell map can be larger than Assault Squad 2 loads (above 65535; not confirmed).
- **The scene camera** starts from the preset `main` in Gates of Hell, not `perspective` (probably; not confirmed).
- **To bring a Gates of Hell map into Assault Squad 2** for your own use, `ARSENAL mapport <GoH resource root> --out <folder> --dry` plans the conversion: it resamples the ground to cells of 10 and drops the blocks that stop the load; `--check` lists files still in Gates of Hell form. `ARSENAL mission-clone` turns `zoneId` flags into `zoneA`/`zoneB` circles (`--flag-zone`, metres, default 12) and takes files the mode includes from `--src <GoH root>`. The packer's Gates of Hell guard covers units, not maps: keep a ported map off the Workshop.

## More

- Detail: [chapter 13, Maps](13-maps.md) ([The Maps page](13-maps.md#the-maps-page), [map points](13-maps.md#6-map-points-spawns-and-flags), [Gates of Hell summary](13-maps.md#gates-of-hell-summary)) and [chapter 12, Missions and multiplayer setup](12-missions-and-multiplayer-setup.md) ([giving a map another mode](12-missions-and-multiplayer-setup.md#8-giving-a-map-another-mode)). The window: [chapter 19, Quick Guided Task](19-toolchain.md#quick-guided-task).
- Reference: [r11, Mission files](r11-mission-files.md) (map points, mode files, [`map.info`](r11-mission-files.md#mapinfo), [`xform`](r11-mission-files.md#xform), [`zoneA`](r11-mission-files.md#zonea)) and [r09, Interface and localization](r09-interface-and-localization.md) (the lobby name key).
- Next: [Missions and multiplayer modes](p10-missions-and-modes.md); the task in the window: [Use the Quick Guided Task](p17-quick-guided-task.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
