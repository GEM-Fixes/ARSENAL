# Chapter 2: The Install Layout

Before you change anything, you need a map. This chapter shows where the game keeps its files, which archive holds which kind of data, and how the game turns a pile of archives into one tidy tree of "virtual paths". Once you can read that tree, every later chapter becomes easier, because every instruction in this guide boils down to "put this file at this virtual path".

If you only want ARSENAL to find the game and get going, the first step of [Make a mod and see it in the game](p01-first-mod.md) is enough. This chapter is the map behind it.

## What you will learn

- What lives in the game folder and in your user data folder.
- What each of the game's archives (paks) contains.
- What a "virtual path" is, and why a wrong path silently does nothing.
- The ways a path can be written inside a data file.
- How to look inside the paks safely, and how to see which copy of a file the game uses.
- Which program to start, and the launch options a modder needs.

## 1. Two folders, two jobs

The game uses two separate places on your disk.

**The game folder** (written `<game folder>` in this guide) is where Steam installed the game. It holds the executables, the archives with all original data, and the `mods` folder. Treat everything here except your own mod folders as read-only.

**The user data folder** is created inside your Documents folder, under `My Games`, in a folder named `Men of War - Assault Squad 2`. If your Documents folder is redirected to a cloud drive such as OneDrive, the real location is there, so search for the folder name if you cannot find it. It holds:

| Item | What it is |
|---|---|
| `profiles/<id>/options.set` | Your profile and options, including the list of active mods |
| `profiles/<id>/keys.set` | Your key bindings |
| `log/game.log` | The log of the last run (overwritten on every launch) |
| `log/minidumps/`, `log/oos/` | Crash dumps, and out-of-sync reports from multiplayer |

Two files from that list matter most to a modder. `options.set` is how you prove which mods are really active, and `game.log` is where the game explains why something failed. Chapter [18](18-testing-and-logs.md) shows how to read them.

When ARSENAL starts a test match, it runs the game as a separate "instance" with its own user data folder, named like the normal one with ` - instance 1` added. Your own settings in the normal folder are not touched by a test run.

The parts of `game.log` and what they tell you are in chapter [18](18-testing-and-logs.md#5-the-structure-of-gamelog).

### In Gates of Hell
<!-- goh: GHVFS-13 GHLOG-36 -->

Gates of Hell keeps its user data folder in `Documents/My Games/Gates of Hell/`. When the Documents folder is under OneDrive, or when the game is started with `-useLocalDataFolder`, it uses `%LOCALAPPDATA%/Digitalmindsoft/Gates of Hell/` instead. The log names the folder it chose in a line that begins `IO: Game config directory:`. The log itself is `log/game.log` in that folder, and crash dumps go to `log/minidumps/`; the console variable `dbg_minidumpFileLimit` (5 by default) sets how many dumps are kept. ARSENAL looks for the Gates of Hell log in both places.

## 2. The game folder

Inside `<game folder>` you will find these items:

| Item | Role |
|---|---|
| `mowas_2.exe` | The original official game program. Most existing mods were made for this one |
| `as64.exe` | The newer, 64-bit build of the program. It can run in Classic mode or with its built-in extras in Enhanced mode (chapter [3](03-mod-folder-and-load-order.md)). This guide is written for it |
| `as64/core/` | Files of the 64-bit build that it mounts after the original data and before every mod |
| `as64/plus/` | The built-in package `as64+` that switches on Enhanced mode |
| `*_ed` executables | Editor builds of the programs, used to make maps |
| `mowas_2_workshop.exe` | The tool that uploads a mod to the Steam Workshop |
| `resource/` | All original data, stored in paks |
| `mods/` | One subfolder per mod. Yours goes here |
| `maps/` | Optional extra multiplayer map folders, each seen by the game under `map/multi/<name>/` (chapter [13](13-maps.md)) |
| `localization.pak` | The original interface texts |
| `1.pat` | The base game's own patch file (section 6 explains what that is) |

The `as64/` folders and `as64.exe` exist only where the 64-bit build is installed. If you have only `mowas_2.exe`, everything in this guide that is not about Enhanced mode still applies. The reference entries [as64/core](r01-mod-info-and-folder.md#as64core) and [as64+](r01-mod-info-and-folder.md#as64) give the exact rules for the two built-in layers.

### In Gates of Hell
<!-- goh: GHVFS-06 GHVFS-37 -->

The Gates of Hell folder holds four items: `binaries/x64/` with the programs (`call_to_arms.exe`, the editor `call_to_arms_ed.exe`, the server `call_to_arms_server.exe` and the Workshop uploader `call_to_arms_workshop.exe`), `resource/` with the data, `localizations/` with the interface texts (`default.pak` holds the default language), and `mods/`. There is no `as64` folder, no `maps` folder and no `localization.pak`. The game works out its data folder from the folder it was started in and names it in `game.log`, in a line that begins `IO: Game base directory:`.

## 3. What is inside `resource/`

The `resource` folder holds a handful of paks. Each pak is a zip file whose content belongs to one area of the game. You can open any of them with a zip tool, and you can read their contents freely.

| Pak | Holds |
|---|---|
| `gamelogic.pak` | Almost all editable "soft" data: `set/`, `properties/`, `script/` and the shader folder `shader/` |
| `entity/e1.pak`, `e2.pak`, `c1.pak`, `c2.pak` | Units and vehicles (`e2`), landscape objects, weapon models, flora, effects (`e1`), buildings and fences (`c1`, `c2`) |
| `interface.pak` | Menu pages, icons, cursors, skins, fonts |
| `texture.pak` | Textures, plus the models and definitions of some units |
| `sound.pak` | Sound effects |
| `music.pak` | Music |
| `map.pak` and two map-pack paks | Single-player and multiplayer maps and missions |
| `language.pak` | Spoken mission lines only (no text) |
| `video.pak` and a second video pak | Menu and mission videos |

The two paks you will touch most are `gamelogic.pak` (numbers, rules and scripts) and the entity paks (what units are). The map-pack and video paks are ordinary paks too. Owning or not owning a Steam DLC changes only what the menus offer, not which files are loaded.

### What the folders inside the paks contain

Once the paks are overlaid, the game sees a tree with these top-level folders:

- `set/` holds weapons and ammunition (under `set/stuff`, mostly in files with no extension), soldier types (`breed`), multiplayer modes, unit rosters and armies (`multiplayer`), and other shared tables. Chapter [6](06-data-keys-entities.md) and the chapters after it describe these.
- `properties/` holds shared entity templates (`.ext` files such as the tank template), the soldier animation and behaviour helpers, and selection helpers.
- `script/multiplayer/` holds the Lua files that drive the multiplayer computer opponent. This is the only place the game uses Lua.
- `entity/` holds the entity definitions: `-vehicle` for vehicles, `humanskin` for soldiers, `construction` for buildings, fences and bridges, plus `inventory` (weapon and item models), `flora`, `landscape`, `fx` and `particle` effects.
- `interface/` holds menu pages, command-panel icons and purchase-card pictures, cursors, fonts and the `text` folder where localization is mounted.
- `map/multi/<map>/` holds each multiplayer map, with one mission file per game mode; `map/single/` holds single-player skirmish missions.
- `sound/`, `texture/`, `music/`, `video/` hold what their names say.

### File types at a glance

| Extension | Meaning |
|---|---|
| `.def` | An entity (unit, building, object) |
| `.ext` | An entity template that `.def` files include |
| `.set` | Plain data |
| `.inc` | A text include, or a file of macros |
| `.mi` | A mission |
| `.lng` | Interface text |
| `.mdl` `.ply` `.vol` `.mtl` `.anm` | Model, mesh, collision volume, material and animation resources |
| `.patch` | A small delete and rename list (chapter [4](04-vfs-paks-patches.md)) |

Weapon and ammunition files in `set/stuff` usually have no extension at all. Every text file above is written in CRLF line endings and read with UTF-8 string values (chapter [5](05-sdl-language.md)). The file formats of the binary resources are described in chapter [16](16-effects-sound-models.md).

### In Gates of Hell
<!-- goh: no rows; install listing and pak entries -->

Gates of Hell splits its data over more paks, most of them in subfolders of `resource/`. At the top sit `gamelogic.pak`, `properties.pak`, `shader.pak`, `music.pak`, `video.pak` and the DLC paks. `entity/` holds one pak per entity folder (`-vehicle.pak`, `construction.pak`, `humanskin.pak`, `inventory.pak` and others), and `interface/`, `map/`, `sound/` and `texture/` hold several paks each. The rule for where entries land is the same as here: a pak in `resource/entity/` holds `-vehicle/...`, which the game sees as `entity/-vehicle/...`. Vehicles sit one level deeper, by nation and class: `entity/-vehicle/<nation>/<class>/<unit>/`. The interface texts are not in `resource/` at all but in `localizations/` (chapter [4](04-vfs-paks-patches.md#gates-of-hell-summary)).

## 4. The virtual path

The game does not care which pak a file came from. When it starts, it merges everything into one tree and refers to each file by its **virtual path**: the path of the file as seen from the `resource` level. A weapon file stored in `gamelogic.pak` as `set/stuff/rifle/example_rifle` has the virtual path `set/stuff/rifle/example_rifle`.

Three rules explain most of the game's behaviour:

1. **Case and slashes do not matter.** The game lowercases every name and treats `\` as `/`. `Set\Stuff\Rifle\Example_Rifle` and `set/stuff/rifle/example_rifle` are the same file.
2. **Same virtual path replaces, new virtual path adds.** If your mod holds a file at an existing virtual path, yours wins. If it holds a path that does not exist yet, the file is added (and nothing will read it unless some other file refers to it).
3. **The extension is part of the name.** A mod file `music/main_theme.wav` does not replace a base `music/main_theme.mp3`. They are different paths.

The base entity paks are rooted one level lower than a mod's entity pak would be. The original `entity/e2.pak` holds `-vehicle/x`, which the game maps to the virtual path `entity/-vehicle/x`. If you build your own `entity.pak` in your mod's `resource/` folder, you must therefore store the file as `entity/-vehicle/x` inside it. If you store it as `-vehicle/x`, you create a new, unused path instead of replacing anything. This is the most common reason that a pak mod "does nothing".

If you use loose files in your mod's `resource` folder instead of paks, the folder structure plays the same role: `mods/mymod/resource/entity/-vehicle/x` has the virtual path `entity/-vehicle/x`. Chapter [4](04-vfs-paks-patches.md) goes into the details of paks, loose folders and which wins, and the reference entry [file names](r01-mod-info-and-folder.md#file-names) lists the exact name rules.

### In Gates of Hell
<!-- goh: GHVFS-09 GHVFS-10 GHVFS-12 -->

The three rules hold. Gates of Hell also lowercases every file name it reads from a data file and turns its `\` into `/` at once, so a reference written with capitals or backslashes finds its file. A path with letters outside plain ASCII stops it with `path is too long` above 1023 bytes. And a name may stand for a folder: an animation or a sound can name a folder of files, and the game picks one of them. This game takes one file there and stops with `Resource not found`, which is why a ported unit needs its animation names changed ([Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md)).

## 5. Ways to write a path inside a data file

When one data file refers to another (an include, a model, a sound), the way the path is written decides where the game looks:

| Written as | Means |
|---|---|
| `/properties/tank.ext` | Counted from the `resource` level, so the mod overlay applies |
| `tank.ext` or `sub/x.inc` | Relative to the folder of the file that contains the reference |
| `../x.inc` | Each `../` climbs one folder from that file's folder |
| `@profiles/x` | Inside your user data folder |
| `//x` | A real path counted from the game folder, outside `resource/` |

The double-slash form bypasses the mod overlay. You will rarely need it, so avoid it in mods.

A leading slash is the safest form for includes, because it always means "from the top of the resource tree", no matter where the including file lives. A copied file that keeps a relative include looks next to its new location, so it fails if your copy sits in a different folder from the original. Note that paths in a data file are written as quoted strings. An unquoted path breaks into several pieces because `/` and `.` end a word (chapter [5](05-sdl-language.md)). The reference entry [path forms](r01-mod-info-and-folder.md#path-forms) has the full rules.

Names may use ASCII letters and digits, the space, and the characters `[ ] ( ) { } @ $ % ^ - + . _ ! # &`. They must not start or end with a space.

### In Gates of Hell
<!-- goh: GHVFS-07 GHVFS-08 -->

Gates of Hell adds one form: `!x` is counted from the game folder, like `//x`. This game does not know it and reads such a path in the wrong place, so change it when you bring a file over. The other forms mean the same in both games.

## 6. Patches in the base game

You may wonder about `1.pat` in the game folder. It is a small zip that carries the base game's own patch level. Chapter [4](04-vfs-paks-patches.md) explains the `.pat` format and `.patch` files, because mods can use the same mechanism to delete or rename files that they do not own.

## 7. Looking inside paks safely

- **Read files in place.** On the Editor page of the ARSENAL window (tab IDE), the Game view lists every file the game reads with your mod loaded, including the files inside paks, and marks which layer each one comes from (the game, another mod, or yours). Game files open read-only; "Copy into my mod" makes your own editable copy at the right path. "Find in files" with "Also the game's own files" ticked searches the paks too.
- **Or use a zip tool, read-only.** Do not extract into the game folder. Extract into a scratch folder that you keep for reference, and search the extracted tree as text to find who uses a name. Since data files refer to each other by virtual path, a search for a file name finds every place that refers to it.
- **One copy is not the only copy.** A file in one pak may be overridden by the same path in another layer: a loose file, a later mod, or the 64-bit build's own `as64/core` folder. The Editor page's "Which mod wins" lists every copy of the file you have open, and the command `ARSENAL vfs <game folder> which set/stuff/rifle/example_rifle` prints the winning source for any path. `ARSENAL vfs <game folder> --mods mymod shadowed --list` lists every file that a mod replaces.
- **Some units live in `texture.pak`.** Some units keep model and definition files in `texture.pak` instead of an entity pak. If you cannot find a unit's `.def`, search both, or let the Game view find it for you.
- **Compare copies side by side.** In the Editor, "Same file elsewhere" (Alt+O) opens the same game path from the game, a loaded mod or an installed mod that is not loaded, and "Side by side" (Alt+S) shows two copies next to each other. "Vanilla only" in the Game view lists only the game's own files.
- **Look inside one pak.** A `.pak`, `.pat` or `.zip` file opens in a viewer that lists its entries with their sizes; a click opens one entry in its own viewer. Pictures, models, sounds and other binary files open in viewers too ([file viewers](19-toolchain.md#file-viewers)).

> **Note:** the game folder can be modified by game updates or by other tools. Do not use it as a baseline for comparisons that you plan to keep. Keep your own extracted copy of the original files.

### In Gates of Hell
<!-- goh: no rows; ARSENAL pages under the GoH button -->

Under GoH the Editor on the IDE tab reads the Gates of Hell paks as well. Outside the window, open them with a zip tool, read-only, and extract into a folder outside the game. `ARSENAL vfs "<Gates of Hell folder>" which <path>` works there too: it mounts the paks in the subfolders of `resource/` and prints which one supplies a path.

## 8. Which program to start

Start the game through Steam. The launch dialog offers Play, Editor, Safe mode and "Safe mode (no mods)". The program you want for this guide is `as64.exe`. Three command-line options matter to modders:

- `-no_mods` starts the game with an empty mod list, which is the quickest way to tell whether a problem comes from a mod. Every `mod.info` in the `mods` folder is still read at start, so a broken one can still stop the game (reference entry [-no_mods](r01-mod-info-and-folder.md#-no_mods)).
- `-console` opens the in-game console in the 64-bit build (reference entry [-console](r12-bot-lua-and-console.md#-console)). The original `mowas_2.exe` has no console outside its editor build.
- ARSENAL's Play page and `ARSENAL play` start the game for you with the options a test run needs, on a separate instance, and stop it again when the log is read.

How a test run fits into your work is in chapter [18](18-testing-and-logs.md#2-launching-and-activating-a-mod) and on the page [Make a mod and see it in the game](p01-first-mod.md).

### In Gates of Hell
<!-- goh: GHENG-01 GHVFS-01 GHSRV-01 GHSRV-03 GHSRV-04 GHSRV-07 -->

Gates of Hell also starts through Steam: `binaries/x64/call_to_arms.exe` started directly asks Steam to start it again and quits. `-no_mods` starts it with no mods, `-safe` resets the settings to a safe profile, and `-showmodinfo` adds to the mod list where each mod comes from (`[STEAM:<id>]` or `[LOCAL]`) and its path. When you host a Steam match, the game starts `call_to_arms_server.exe` in the background with your active mods; that server program writes no profile and keeps no debug logs. ARSENAL does not start Gates of Hell.

## Gates of Hell: summary
<!-- goh: GHVFS-06 GHVFS-07 GHVFS-09 GHVFS-10 GHVFS-12 GHVFS-13 GHENG-01 GHSRV-03 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. Two folders, two jobs | [differs](#in-gates-of-hell) | `My Games/Gates of Hell`, or LocalAppData with OneDrive or `-useLocalDataFolder` |
| 2. The game folder | [differs](#in-gates-of-hell-1) | programs in `binaries/x64/`, texts in `localizations/`, no `as64` or `maps` folder |
| 3. What is inside `resource/` | [differs](#in-gates-of-hell-2) | more paks in subfolders, vehicles by nation and class |
| 4. The virtual path | [differs](#in-gates-of-hell-3) | names lowercased at read, a name may stand for a folder |
| 5. Ways to write a path inside a data file | [differs](#in-gates-of-hell-4) | extra form `!x` |
| 6. Patches in the base game | same as far as mapped | the base game's `N.pat` files count the same way; the install has none at the top |
| 7. Looking inside paks safely | [differs](#in-gates-of-hell-5) | the Editor reads GoH paks; zip tool and `ARSENAL vfs` |
| 8. Which program to start | [differs](#in-gates-of-hell-6) | restarts through Steam, `-safe`, `-showmodinfo`, server program for hosts |

## Pitfalls

- **Pak root mistakes.** A mod entity pak must store entries under `entity/`, not at the root that the base entity paks use.
- **Case.** Case never matters for paths, so you cannot use capitalization to tell two files apart. Two zip entries that differ only by case are one file; the later one wins.
- **Extra files do nothing.** A file at a path nothing refers to is dead weight. After adding a file, check by name that something loads it.
- **Loose text files are ignored.** The game skips loose files with the extensions `.txt`, `.org`, `.msg`, `.scc`, `.temp` and a few similar backup extensions when it scans a folder. The same file inside a pak is indexed. Do not keep notes in `.txt` files inside your `resource` folder and expect them to be read. The same goes for console scripts: give a script you run with [`exec`](r12-bot-lua-and-console.md#exec) the extension `.cfg`, not `.txt`.
- **A cloud-redirected Documents folder.** The user data folder may not be where the plain path says. Search for it by name.
- **Reading the game folder as a baseline.** See the note above.

## Next

Chapter [3](03-mod-folder-and-load-order.md) opens the `mods` folder: how `mod.info` works, how the game decides which mods to load, and who wins when two mods contain the same file. For unfamiliar words, see the glossary in [22-glossary.md](22-glossary.md).
