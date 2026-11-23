# Chapter 1: Getting Started

Men of War: Assault Squad 2 is a game whose behaviour is driven mostly by plain text files. Almost everything that decides how a tank moves, how hard a rifle hits, what a multiplayer match costs or what a button says lives in a text file that you can read and change. This guide teaches you how to do that safely. This first chapter explains what "soft-code modding" means, what you can and cannot change, which tools you need, and walks you through a first small mod.

The short way to the same result, step by step, is the page [Make a mod and see it in the game](p01-first-mod.md). This chapter explains what happens behind those steps.

## What you will learn

- What a mod is and how the game finds it.
- Which layers of the game you can edit, and which parts are locked inside the program.
- The tools you need, and the ARSENAL tool set that does most of the routine work for you.
- How to make, check, switch on and confirm a first mod.
- How to learn from the game's own files, and what the "(unconfirmed)" marker in this guide means.

## 1. What a mod is

A mod is a folder that you put in the `mods` folder of the game. Inside it is a small file called `mod.info` (a name, a description and the game versions it supports) plus the files you want to add or replace. When you switch the mod on, the game builds one big "virtual" file system: first all the original game files, then your mod's files on top. If your mod contains a file with the same path as an original file, the game uses your version and ignores the original. If your mod contains a path that does not exist in the original game, the file is simply added.

That overlay idea is the heart of modding for this game, and chapters [3](03-mod-folder-and-load-order.md) and [4](04-vfs-paks-patches.md) cover it in detail. For now, remember two consequences:

1. You never need to touch the game's own files. You put changed copies in your mod, and the originals stay as they were.
2. When you override a file, you replace the whole file, not just one line of it. The game does not merge your file with the original. To change one number, you copy the complete original file into your mod and change that number.

Throughout this guide, `<game folder>` means the folder where the game is installed, and `mods/mymod/...` means a path inside your own mod folder. The full facts about the mod folder and `mod.info` are in the reference entry [mod folder](r01-mod-info-and-folder.md#mod-folder).

> **Always work in your own mod folder.** Treat the game folder and every original data file as read-only. If you edit original files directly, a game update or a Steam "verify files" will erase your work, and you will have no clean copy to compare against.

### In Gates of Hell
<!-- goh: GHVFS-04 GHVFS-24 GHVFS-27 GHVFS-30 -->

A Gates of Hell mod is also a folder with a `mod.info` in the game's `mods` folder, and the overlay works the same way: a file at the same path replaces the original whole. Three things differ. The folder name may hold only plain letters, digits, `_` and `.`; a name with a space, `-` or `+` is skipped. The texts of a mod go into `localizations/<language code>/`, not `localization/`. And a subscribed Workshop mod is loaded where Steam put it, under the name `mod_<item number>`. Chapter [3](03-mod-folder-and-load-order.md#gates-of-hell-summary) has the details.

## 2. What you can change

The game has several layers of data, and each can be edited as text or simple resources:

- **Entity data.** Every unit, vehicle, building, weapon, ammo type and piece of equipment is described by data files (`.def` files for entities, `.ext` files for shared templates, and plain "stuff" files for weapons and ammunition). Armour thickness, speed, health, rate of fire, price and hundreds of other values live here. See chapters [6](06-data-keys-entities.md) to [9](09-weapons-ammo-damage.md).
- **Interaction scripts.** A small event language (`{on event}` blocks) controls how entities react to things: what happens when a shell hits armour, when a vehicle catches fire, when a door opens. See chapter [11](11-interaction-scripts.md).
- **Mission and multiplayer setup.** Mission files (`.mi`), game mode definitions, unit rosters, budgets, and the Lua scripts that drive multiplayer bots. See chapters [12](12-missions-and-multiplayer-setup.md) and [13](13-maps.md).
- **Interface data.** Icons, cursors, the layout of the command panel, button actions, key bindings and fonts. See chapter [15](15-interface-and-icons.md).
- **Localization.** All the words you read in the game come from `.lng` text files. See chapter [14](14-localization.md).
- **Assets.** Models, textures, sounds and animations can be added or replaced. They are binary files made with other tools. This guide explains how to wire them in. The Models page of ARSENAL (tab Models & Sim) edits models and animations itself (bones, volumes, meshes, materials and animations); chapter [16](16-effects-sound-models.md) and [Edit a model or an animation](p06-edit-a-model.md) show how. A brand new 3D shape is still made in a 3D program such as Blender.

### In Gates of Hell
<!-- goh: GHLOC-01 GHLOC-09 -->

The same layers exist, with two differences. Interface text lives in gettext files (`.pot`, `.po` and `.mo`) under `localizations/<language code>/`; `.lng` files placed there are still read. And Gates of Hell has data systems this game lacks, such as the Conquest campaign and direct control of a single unit, whose files have no counterpart here. See chapter [14](14-localization.md#gates-of-hell-summary) for the texts.

## 3. What you cannot change

The program itself is compiled and you cannot change it with a text editor. In practice this means:

- The screens (menus, the lobby, the purchase panel, the control bar) are built into the program. You can change the pictures, texts, actions and many numbers they use, but you cannot move or resize the panels, add a brand-new kind of screen, or add a brand-new kind of command-panel item.
- The rules of the engine are fixed: how bullets fly, how penetration is calculated, how networking stays in step. You can change the numbers and data these rules read, but not the rules.
- You cannot invent a new key in a data file and expect something to happen. Depending on the file, a key the game does not know is either skipped without any message, so that a misspelled key looks exactly like a key that does nothing, or it stops the game with an "unexpected token" error. Chapter [5](05-sdl-language.md) explains this in detail, and chapter [19](19-toolchain.md) shows the tools that catch such typos for you.

If you are unsure whether something is possible, the "Pitfalls" boxes in each chapter list the known limits for that topic. The Quick Guided Task "I want to explore what is possible" answers such questions in words ([Use the Quick Guided Task](p17-quick-guided-task.md)).

### In Gates of Hell
<!-- goh: GHVFS-14 -->

A Gates of Hell mod cannot replace `set/registry.reg` or `set/registry/dlc.reg`. The game checks both files at start and stops with `Resource Error` when either differs from its own copy. The other files under `set/registry/` are probably not checked.

## 4. The tools you need

You need very little to start.

1. **A text editor that shows and keeps the encoding and line endings.** The game's text data files use Windows (CRLF) line endings. The 64-bit build (AS64) reads every string value, in data files and in `.lng` localization files alike, as UTF-8: a string saved in the old Windows Cyrillic encoding (cp1251) shows as boxes on screen. The original data files are plain ASCII except inside `;` comments, where some still hold cp1251 or other old bytes; the game skips comments, so leave those bytes as they are. Write your own text as UTF-8 without a byte-order mark (plain ASCII is UTF-8 too). Many editors guess the encoding wrongly and silently convert a file when you save it, which can break it. Use an editor where you can see and set the encoding and the line-ending style, and check both after your first save. The Editor page of the ARSENAL window (tab IDE, below) keeps both for you and shows them in its status bar. Chapters [3](03-mod-folder-and-load-order.md), [4](04-vfs-paks-patches.md), [5](05-sdl-language.md) and [14](14-localization.md) repeat this warning because it matters so much.
2. **A zip tool.** The game's archives (called paks) are ordinary zip files, so any zip program can open them. You use this to look inside the original paks and, if you like, to build your own.
3. **ARSENAL, strongly recommended.** ARSENAL is the companion tool set of this guide. It makes a mod folder, checks your data files for mistakes before you start the game, shows which file wins when two mods collide, edits models and animations, starts a test match and reads the game's log for you. It comes in two forms:
   - **The window.** Double-click `ARSENAL.exe` (with the small download, `ARSENAL-gui.cmd`). It opens in your web browser and runs only on your own computer. Pages such as Mods, Make, Units, Models, Check and Play do the common jobs with buttons. Before anything is written or a program is started, one confirm box lists what will happen and where, and nothing happens until you confirm ([the confirm box](19-toolchain.md#the-confirm-box)). This is the easiest way in.
   - **The Quick Guided Task row**, above the page tabs of the window. Pick "I want to" make, change or explore, pick a task such as "a mod" or "a gun or weapon", and press Start. A window asks its questions one step at a time, shows the files it will write, writes them into your mod with a restore point, checks the mod and sends you to test it. See [Use the Quick Guided Task](p17-quick-guided-task.md) and [Quick Guided Task](19-toolchain.md#quick-guided-task).
   - **Commands** (`ARSENAL.exe` in a command prompt). Where this guide writes `ARSENAL new mymod`, you type `ARSENAL.exe new mymod`. `ARSENAL.exe` typed with nothing after it opens the window. `ARSENAL help` lists the main commands and `ARSENAL <command> --help` explains one of them. Chapter [19](19-toolchain.md) describes every command.
   ARSENAL finds the game through Steam; if it picks the wrong folder, press "Game folder..." in the top bar of the window, or add `--game "<game folder>"` to a command.
4. **The game itself**, with `as64.exe` (the 64-bit build) in its folder, launched through Steam.

You do not need to know programming. You do need to be careful with punctuation, because the data language is strict about braces and quotes (chapter [5](05-sdl-language.md)).

### Getting ARSENAL

ARSENAL comes as a zip file in four forms. Pick one and unzip it into a folder of its own, outside the game folder.

| Download | What it is | What it needs |
|---|---|---|
| `ARSENAL-<version>.zip` | The full download: one program, `ARSENAL.exe`, with Node.js (the program that runs the tools) inside, plus `ARSENAL-gui.cmd` (opens the window) and the installer `Install-ARSENAL.cmd`. | Windows 10 or 11, 64-bit. Nothing else to install. |
| `ARSENAL-<version>-small.zip` | The small download: the same tools as plain files, with start files instead of the two programs: `ARSENAL.cmd` and `ARSENAL-gui.cmd` on Windows, `arsenal` and `arsenal-gui` on Linux and macOS. | Windows, Linux or macOS. An internet connection the first time you start it, unless Node.js 26 or newer is already installed. |
| `ARSENAL-<version>-ww2.zip` | The full download plus the historical sources database. | As the full download, and about 1 GB more disk space. |
| `ARSENAL-<version>-small-ww2.zip` | The small download plus the historical sources database. | As the small download, and about 1 GB more disk space. |

All four hold the same tools, this guide, the index of other modders' guides and the list of Second World War sources. The database in the `-ww2` downloads lets Help & Docs > Historical Sources search the text inside the documents; without it you still get the list of sources with their links.

The engine technical document is a separate download, `ARSENAL-engine-docs-public-<version>.zip`, published beside the four above. It describes how the engine of the 64-bit build works, subsystem by subsystem, for programmers and tool authors. You do not need it to use ARSENAL. To read it in the window, unzip it, copy its `techdoc` folder into the ARSENAL folder, and open the Docs page. Chapter [19](19-toolchain.md#whole-documents) has the steps.

You can run ARSENAL straight from the unzipped folder, or install it on Windows: double-click `Install-ARSENAL.cmd` in that folder (both downloads have it). It copies ARSENAL to a folder you pick (by default `%LOCALAPPDATA%\Programs\ARSENAL`, no administrator rights), fetches Node.js for the small download, and makes a Start menu shortcut to the window. It writes `Uninstall-ARSENAL.cmd` into the install folder to remove it again. `Install-ARSENAL.cmd --dry` shows every step and changes nothing.

The first time you start the small download, its start file looks for Node.js: the program named in the environment variable `ARSENAL_NODE`, a copy it fetched before, or a Node.js 26 or newer that is already installed. When it finds none, it downloads Node.js 26.13.0 from nodejs.org, checks it against the checksum written in the start file, and keeps only the node program, in a `node` folder next to the start files or in your user folder when that folder is read-only. After that it needs no internet. Chapter [19](19-toolchain.md) has the details.

With the small download, type `ARSENAL.cmd` on Windows, or `./arsenal` in a terminal on Linux and macOS, wherever this guide writes `ARSENAL`; `ARSENAL-gui.cmd` or `./arsenal-gui` opens the window.

You need no administrator rights, and the folder you unzip into may be read-only: ARSENAL keeps its caches in your user folder (`%LOCALAPPDATA%\ARSENAL\cache` on Windows, `~/.cache/arsenal` on Linux, `~/Library/Caches/ARSENAL` on macOS). It also finds the game's profile and `game.log` when your Documents folder was moved to another drive or to OneDrive.

Starting the game and test runs work on Windows only. The check, build and pack tools and the window are written to work on Linux and macOS too, but have not been tried on a real machine there yet. Chapter [19](19-toolchain.md#1-getting-arsenal-and-running-it) says what works where.

### In Gates of Hell
<!-- goh: no rows; ARSENAL pages under the GoH button -->

Pick GoH at the top of the window. It then shows the same nine tabs as for the other games, with the GoH unit page added under Units & Balance. Where a part of a page cannot work for Gates of Hell, that part says so in one line ("Not available in GoH" and the reason); chapter [19](19-toolchain.md#in-gates-of-hell-2) lists them page by page. Under GoH, ARSENAL reads the Gates of Hell folder but never writes into the game's own files. In its `mods` folder ARSENAL writes only into a mod folder it made itself, or a new one; a mod it did not make only with Advanced on (Tools & Settings > Settings). It does not start Gates of Hell either: the Play page and the test runs say so.

- The Mods page lists the mods in the Gates of Hell `mods` folder, and its New mod card makes a Gates of Hell mod.
- The Check page checks a mod with the Gates of Hell rules (`ARSENAL check <mod folder> --target goh`), and its fix steps write a Gates of Hell patch mod; the fixes that follow Assault Squad 2 rules are left out there.
- Tools & Settings > Other Tools > Generator builds a mod from a spec with `goh` as the target, and Mods > Mods > Upgrade or Port ports a mod to Gates of Hell.
- In the Quick Guided Task row, seven tasks work under GoH: "a mod" (make), "an old mod to 64-bit" (it makes a Gates of Hell copy), "a mod with problems (fix them)", which only shows the problems there, the explore tasks "a mod", "what went wrong in the last run" and "what is possible", and "a unit from Gates of Hell".
- The GoH unit page (tab Units & Balance) brings a Gates of Hell vehicle into Assault Squad 2, with the fold Translate numbers in its step 3: [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md) and chapter [19](19-toolchain.md#units--balance-under-goh).

## 5. Your first mod

This walk-through shows the whole loop once: create, change, check, play, switch on, confirm. Each step gives the window way first and the command way second.

**Step 1: make the mod folder.** In the window, open the Mods page and press "Make my first mod" (or open the New mod card under the mod list). Fill in the folder name and the title the game's mod list will show, preview, then make it. The Quick Guided Task "I want to make a mod" asks the same questions one at a time. The command way:

```
ARSENAL new mymod --name "My Mod" --dry-run
ARSENAL new mymod --name "My Mod"
```

Both make the folder name lowercase and write a `mod.info` for the 64-bit build. If you prefer to do it by hand, create the folder `mods/mymod` inside the game folder and put a text file called `mod.info` in it:

```
{Mod
    {Name "My Mod"}
    {Desc "My first test mod."}
    {MinGameVersion "3.301"}
}
```

This is the form for the 64-bit build, `as64.exe`, with its Enhanced extras (`as64+`): a minimum version of 3.301 and no `MaxGameVersion` line. A mod with no version lines at all is treated as unsupported and does not load. An older mod for the original game (the "legacy" Classic form) uses `{MinGameVersion "3.262"}` and `{MaxGameVersion "3.262"}` instead. This guide teaches the AS64 form. Chapter [3](03-mod-folder-and-load-order.md) explains the version rules and the two game modes, and the reference entry [MinGameVersion](r01-mod-info-and-folder.md#mingameversion) has the exact rules.

**Step 2: put one change into it.** An empty mod changes nothing. The quickest first change is a new price on one unit, made on the Units page: see [Change a unit's numbers](p02-change-unit-numbers.md). To see the mechanism by hand instead, copy one weapon file:

- Weapons are stored as files without an extension under `set/stuff/` inside the game's `gamelogic.pak` (a zip file in `<game folder>/resource`). Chapter [2](02-install-layout.md) is a map of what is where.
- Place your copy in your mod folder at exactly the same path it has inside the archive, below `mods/mymod/resource/`. A file at `set/stuff/rifle/example_rifle` inside the archive goes to `mods/mymod/resource/set/stuff/rifle/example_rifle`. Capital letters do not matter, because the game ignores case, but every folder name must match. A wrong path makes an extra file that nothing reads, and nothing changes in the game.
- Open your copy, keep CRLF line endings and the encoding as they are, and change one number. A weapon's reload time, for example, is written as `{rechargeTime <seconds>}`; the value in your file will be whatever the game's file says. Save without changing the encoding.

In the window, the Editor page does the copy for you: open the game's file from its Game view, press "Copy into my mod", and edit your copy.

**Step 3: check it.** In the window, open the Check page and press "Check the mod". The command way:

```
ARSENAL check mymod
```

The check only reads files: nothing is written and the game is not started. The verdict `LOADS_STATIC` means that no known crash pattern was found. It does not prove that the mod does what you meant.

**Step 4: play a test match.** In the window, open the Play page, tick "Let ARSENAL start the game", press the dry run button first to see every step, then start the run. The command way:

```
ARSENAL play mymod --dry
ARSENAL play mymod
```

ARSENAL checks the mod, installs it, starts the game on a small test map with a separate copy of the game settings (never your own) and reads `game.log`. "BOOT OK" means the mod loaded and the match started. Then look at the change in the game yourself.

**Step 5: switch it on in your normal game.** Install the mod into the game's `mods` folder with the Play page's install card, or with `ARSENAL install mymod`. Start the game and open Options, then the MODS tab. Your mod appears under "Deactivated". Select it and press the `>>` button to move it to "Activated", then press Apply. Make sure `as64+` is in the Activated list too, above your mod: a mod with `MinGameVersion` 3.301 needs it. Applying takes about half a minute for a small mod (large mods can take several minutes), and the game does not need to restart. The menu buttons in this game react to a double click rather than a single click.

**Step 6: confirm that it loaded.** The reliable proof is the profile file `options.set` in your user data folder: it contains a `{mods` block with one entry per active mod, for example `"as64+:0"` and `"mymod:0"`. The 64-bit build also writes one line per mounted mod near the top of `game.log`, in the form `Mod '<name>' from <path>`; the original `mowas_2.exe` writes no such line. Chapter [18](18-testing-and-logs.md) is entirely about testing and reading the log.

If nothing changed, go through this list: is the mod activated, is the file path inside the mod exactly right, did the file keep its encoding, and is the value one that the game actually reads? Chapter [21](21-troubleshooting.md) has a longer catalogue. To take the mod out again, `ARSENAL uninstall mymod --yes` removes a mod that `install` put there and nothing else.

### In Gates of Hell
<!-- goh: GHVFS-26 GHVFS-27 GHVFS-31 GHNET-22 -->

The loop has the same shape, with these changes:

- Gates of Hell versions have the form `1.xxx`, so a `mod.info` with this game's versions (3.x) is refused. Write a `MinGameVersion` and a `MaxGameVersion` that hold the version of your Gates of Hell. The range in the game's own `mods/template/mod.info` may not hold it; `ARSENAL modinfo "<mod folder>" --goh --game "<Gates of Hell folder>"` reads the version from your game and says whether the range fits.
- Make and edit the mod in a folder of your own, check it with `ARSENAL check "<mod folder>" --target goh`, then copy the folder into the Gates of Hell `mods` folder yourself. ARSENAL does not install into Gates of Hell or start it.
- Switch the mod on in the game's own mod options. There is no `as64+` to add.
- To confirm that it loaded, look in `game.log` for the line `Mod: activate mod <name>`.

## 6. Learning from the original data

The best documentation for this game is the game's own files. When you want to do something, find a unit or weapon that already does it and copy how it is written. Some practical habits:

- Read the original files in place. The Editor page's Game view and its "Find in files" search look inside the paks without extracting anything. With a zip tool, extract into a scratch folder of your own, never into the game folder.
- Keep that scratch folder of originals separate from your mod. Compare your edited file with the original whenever something behaves oddly; the Editor page's "Compare with vanilla" does this for one file.
- Change one thing at a time and test after each change. When you change ten things and the game fails to start, you will not know which one is at fault.
- Look at numbers as tables rather than hunting through files. The Balance page and `ARSENAL statsheet` (chapter [17](17-balance-pricing-gameplay.md)) list weapon, ammunition, armour and price values for the original data and your mod.

People have written guides and tools for this game for many years. Help & Docs > Guides & External Tools in the window searches an offline index of them; see [Find guides and tools others made](p16-find-guides-and-tools.md).

### In Gates of Hell
<!-- goh: no rows; install listing and ARSENAL vfs -->

Under GoH the Editor on the IDE tab reads the Gates of Hell files too, paks included. Without the window, read them with a zip tool and extract them into a scratch folder outside the game. Its data paks sit in subfolders of `resource/` (chapter [2](02-install-layout.md#gates-of-hell-summary)). `ARSENAL vfs "<Gates of Hell folder>" which <path>` prints which pak supplies a path there.

## 7. How to read the "unconfirmed" markers

Most facts in this guide are stated plainly. A few facts have not been seen in a running game yet; those carry the word "(unconfirmed)". Treat an unconfirmed item as a good guess and look at the result in the game before you build on it. The Gates of Hell notes follow their own rule, given at the start of the next section.

## Gates of Hell: summary
<!-- goh: GHVFS-04 GHVFS-14 GHVFS-26 GHVFS-27 GHLOC-01 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them. Where a note is less sure than the rest, it says "probably" or "not confirmed".

Gates of Hell (GoH) grew from the same engine as this game. This guide is written for Assault Squad 2; each chapter of Part II ends its sections with a short "In Gates of Hell" note where GoH works differently, and sums them up in a table like this one.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. What a mod is | [differs](#in-gates-of-hell) | folder name rule, `localizations/`, Workshop mods named `mod_<item number>` |
| 2. What you can change | [differs](#in-gates-of-hell-1) | gettext text files, systems such as Conquest that this game lacks |
| 3. What you cannot change | [differs](#in-gates-of-hell-2) | two registry files cannot be replaced |
| 4. The tools you need | [differs](#in-gates-of-hell-3) | fewer ARSENAL pages; nothing is written into the GoH folder |
| 5. Your first mod | [differs](#in-gates-of-hell-4) | 1.xxx versions, copy the mod in yourself, `Mod: activate mod` in the log |
| 6. Learning from the original data | [differs](#in-gates-of-hell-5) | the Editor reads GoH paks; zip tool and `ARSENAL vfs` |
| 7. How to read the "unconfirmed" markers | same | the GoH notes carry the sentence above |

## Pitfalls

- **Silent mistakes.** An unknown key, a key in the wrong block or a wrongly capitalized key name is often skipped without any warning. A syntax error such as a missing closing brace, on the other hand, stops the game with an error. Learn to tell the two apart (chapter [5](05-sdl-language.md)), and run the check before every test.
- **Whole-file replacement.** Your copy of a file replaces the original completely. If you delete lines you did not mean to, those entries vanish from the game.
- **Wrong encoding.** A string saved as cp1251 shows as boxes in the 64-bit build, in a data file or a `.lng` file; write UTF-8 without a byte-order mark. Do not let the editor rewrite the old bytes inside comments of a copied file, and keep CRLF line endings.
- **Wrong game mode.** A mod written for the original game does not load when the Enhanced extras are active, and the other way round; at start, a mod of the wrong kind in the Activated list can even stop `as64.exe` before the menu. Chapter [3](03-mod-folder-and-load-order.md) explains this "Classic versus Enhanced" split.
- **A broken `mod.info`.** The game reads every `mod.info` in the `mods` folder at start, active or not, and one broken file (for example an unescaped quote in its description) can stop the game from starting.
- **The mod drops out of the Activated list.** The game knows a mod by its lowercase folder name, not by its title. Renaming the folder means switching it on again.
- **The log you wanted is gone.** `game.log` is overwritten every time the game starts. Copy it before you start the game again.
- **Editing the game folder.** Any change to original files can be wiped by an update. Keep every change inside `mods/mymod`.

## Next

Chapter [2](02-install-layout.md) tours the game folder, your user data folder and the executables, so that you know where everything lives.
<!-- Author: Imperator_Aug (ARSENAL, ia-85a16fc0) -->
