# 19. The toolchain

Modding by hand works, but many mistakes in this game are silent: a typo in a key name, a missing file, or a wrong encoding often gives no error, only a mod that quietly does nothing. ARSENAL is the toolchain that comes with this guide. It reads your mod and the game's data, tells you about problems before you start the game, and writes new content only into the mod folder you name. You can use it as a window with pages or as commands in a terminal; both do the same work.

The short way for the common jobs is in Part I: [Use the Quick Guided Task](p17-quick-guided-task.md), [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md), [Pack and share](p15-pack-and-share.md), [Find guides and tools others made](p16-find-guides-and-tools.md) and [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md).

## What you will learn

- How to get ARSENAL and run it, as a window or as commands.
- The front-door commands `check`, `fix` and `gen`.
- What each page of the window does, and which game it serves, with the Quick Guided Task, the whole documents, the file viewers, LAN Remote, Settings, Arrange mode and the confirm box.
- The commands behind the pages: `soedit`, `armorsim`, `balance`, `gemindex`, `gen --describe` and the others.
- The flags many tools share, a sensible order to run them in, and workflows for common jobs.
- What the tools cannot catch.

## 1. Getting ARSENAL and running it

The release is a zip file in four forms, listed in [chapter 1](01-getting-started.md): the full download, a small download, and each of those with the historical sources database (`-ww2`). Unzip it into a folder of its own, outside the game folder. The full download holds:

- `ARSENAL.exe`, the one program. Double-click it to open the window (section 3), or open a command prompt in that folder and type `ARSENAL.exe` followed by a command.
- `ARSENAL-gui.cmd`, which opens the window too (it runs `ARSENAL.exe gui`).
- `Install-ARSENAL.cmd`, the installer ([chapter 1](01-getting-started.md) describes it). You can also run everything straight from the unzipped folder.
- `START-HERE.md`, a one-page path through the first commands, and the `guide` folder with this book.
- A `gemindex` folder with the index of other modders' guides and tools, when the release carries it (section 3, Help & Docs > Guides & External Tools).

SOEdit, the model, animation and volume editor, is not in the download. When you want it, the Models page (**Get SOEdit and open it**) or `ARSENAL soedit install` downloads its latest release from GitHub ([ThatFrostyy/SOEdit-PatchByFrostyy](https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy/releases)).

`ARSENAL.exe` contains Node.js and every tool, so the machine that runs it needs nothing else installed. It is unsigned, so Windows may warn the first time. The tools keep their caches in your user folder (`%LOCALAPPDATA%\ARSENAL\cache` on Windows), so the folder you unzip into may be read-only; you can delete the cache folder at any time.

The small download has the same tools as plain files, with start files instead of the program: `ARSENAL.cmd` and `ARSENAL-gui.cmd` on Windows, `arsenal` and `arsenal-gui` on Linux and macOS. Type `ARSENAL.cmd` (or `./arsenal`) wherever this guide writes `ARSENAL`. The first time, the start file looks for Node.js: the program named in the environment variable `ARSENAL_NODE`, a copy it fetched before, or a Node.js 26 or newer that is already installed. When it finds none, it downloads Node.js 26.13.0 from nodejs.org, checks it against the checksum written in the start file, and keeps only the node program, in a `node` folder next to the start files or in your user folder when that folder is read-only. After that it needs no internet.

What the release needs:

- For the full download: Windows 10 or 11, 64-bit. `ARSENAL.exe` does not start on Windows 7, 8 or 8.1, or on 32-bit Windows, and running it under Wine or Proton has not been tried. The small download is written to run on Linux and macOS too, but has not been tried on a real machine there; starting the game and test runs work on Windows only.
- About 300 MB of disk space. No administrator rights.
- A web browser for the window. The 3D model view needs WebGL; without it the page shows the model as text.
- The game for the commands that read the game's files, install a mod or start a match. `play` needs the 64-bit build (`as64.exe`). Tools that only read a mod folder work with no game installed.
- A graphics driver with OpenGL for SOEdit.
- An internet connection only for updating the guide index from the web, the optional AI in `gen`, and the game version check in `release-check`.

The tools find the game's profile and `game.log` also when your Documents folder was moved to another drive or to a OneDrive folder: they ask Windows where Documents is, then try the usual OneDrive places. `install --link` needs the mod and the game on a local NTFS drive.

From a source checkout you run the same tools with [Node.js](https://nodejs.org): open a terminal in the folder that contains `tools/` and type `node tools/as2/as2.js <command>`. This guide writes `ARSENAL <command>` for both: read it as `ARSENAL.exe <command>` in the release, or `node tools/as2/as2.js <command>` from source. The old name `as2` is the same command.

A few tools exist only for people who maintain the knowledge base. They run as `ARSENAL dev <tool>` from source and are not covered here.

### Finding the game

The tools find your Assault Squad 2 folder through Steam. `ARSENAL game` prints the folder they found. If it is wrong or missing, add `--game "<game folder>"` to any command, set the environment variable `AS2_GAME` to that folder, or put a file `as2.json` holding `{"game": "<game folder>"}` in the folder you run the command from (or any folder above it). The game folder is the one that holds `as64.exe` and the `mods` folder.

Gates of Hell is found the same way: through Steam, or `--goh "<GoH folder>"` on a command, or the environment variable `GOH_GAME`, or a `"goh"` entry in `as2.json`. The Gates of Hell folder is the one that holds `call_to_arms.exe`.

### Placeholders in this chapter

`<game folder>` is your Men of War: Assault Squad 2 install with the 64-bit build. `<mod folder>` is your own mod folder. Some tools need it to sit in `<game folder>/mods/` so the game can mount it (see section 6). The tools never write into the game's own data. They read it, and they write only into the mod folder you name, or into the game's `mods` folder when you install. Keep that habit yourself: never edit vanilla files in place. See [chapter 3](03-mod-folder-and-load-order.md) for the mod folder layout.

### In Gates of Hell
<!-- goh: none; ARSENAL behaviour (game finder, check, upgrade, gui groups) -->

ARSENAL reads a Gates of Hell install but never writes into it, the same rule as for Assault Squad 2. Some commands take a Gates of Hell folder as a second game: `check --goh <GoH folder>` reads a mod with the Gates of Hell rules too, `upgrade --to goh` copies an Assault Squad 2 mod into a new Gates of Hell mod folder, and the porting tools (section 9) read a Gates of Hell mod to bring a unit into Assault Squad 2. In the window, pick GoH at the top: it shows the same tabs as the other games, and [section 3](#in-gates-of-hell-2) says what each page can and cannot do there. The [summary](#gates-of-hell-summary) lists what each section of this chapter offers for Gates of Hell.

## The front-door commands

`ARSENAL help` lists nine commands (the one-page path through them is `START-HERE.md`). One line each, with the example `ARSENAL help` prints. Options of one command: `ARSENAL <command> --help`.

| Command | What it does | Example |
|---|---|---|
| `new` | make an empty AS64 mod folder (MinGameVersion 3.301, lowercase folder name) | `ARSENAL new mymod --name "My Mod"` |
| `gen` | make mod content (units, text, settings) from a spec file | `ARSENAL gen spec.yaml --target as64 --out mymod` |
| `check` | read a mod and say whether it would load, crash or be refused (does not start the game) | `ARSENAL check mymod` |
| `fix` | plan or write a patch mod that fixes text and reference errors check found | `ARSENAL fix mymod plan` |
| `upgrade` | bring an older mod up to AS64 (or copy it to Gates of Hell); the old mod folder is never written | `ARSENAL upgrade oldmod --to as64 --plan` |
| `install` | copy (or link) a mod folder into the game's mods folder | `ARSENAL install mymod` |
| `uninstall` | remove a mod that ARSENAL install put there | `ARSENAL uninstall mymod --yes` |
| `play` | install a mod and start a test match, then say if it loaded cleanly | `ARSENAL play mymod --dry` |
| `maps` | multiplayer maps: list, view, clone, add a game mode | `ARSENAL maps list` |

`ARSENAL advanced` lists the tools kept off the front door, and `ARSENAL --all` lists every tool with its argument line. Section 2 describes `check`, `fix` and `gen` in detail; `upgrade` is explained in [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md) and `play` in [chapter 18](18-testing-and-logs.md).

## 2. The front door: `check`, `fix` and `gen`

### `check`: one command for "will this mod load?"

```
ARSENAL check <mod folder> --fast -q
```

The mod folder can be anywhere. If it is not under `<game folder>/mods`, `check` builds a temporary view of the game folder around it and reads both; nothing of yours or the game's is changed. It prints findings by severity, then one verdict for each game build:

- `LOADS_STATIC`: no crash pattern the tools know was found, and the version is accepted. This means "static check passed". It does not mean the mod works.
- `REFUSED`: the mod's `mod.info` is not valid for that build. A mod with only a `Min` of 3.301 is refused by the old game and by Gates of Hell, and accepted by AS64. That is right for an AS64 mod.
- `LIKELY_CRASH`: a known crash pattern was found; the findings above it say where.

The exit code follows the verdict for the mod's own target build, which is AS64 unless you pass `--target mowas2` or `--target goh`: 0 for `LOADS_STATIC`, 1 for `LIKELY_CRASH` or `REFUSED`, 2 for a usage error, a failed tool or no verdict (`UNKNOWN`). The other builds' verdicts are printed as information.

`--fast` skips the slow checks and says so in the output. A small mod takes seconds; drop `--fast` for the full check, which takes minutes on a big mod. `--with <patch folder>` checks a mod together with a patch folder made by `ARSENAL fix`. Do not use it for an `ARSENAL upgrade --out` folder: that is a whole mod with its own `mod.info`, so run `check` on it directly.

#### Making the check faster

1. Keep `--fast` on while you work (in the window: keep the Quick check box ticked). Drop it for the full check before you share or release the mod.
2. A check of a mod whose files have not changed since the last full run is shown again from the store in about a second.
3. After you change a file, most checkers reuse what they kept about the files you did not change, so the next check is shorter than the first.
4. The first check of a mod is the slow one, and so is the first check after the cache folder was emptied. Do not let a cleaning tool empty `%LOCALAPPDATA%\ARSENAL\cache`.
5. Pack the mod into .pak files on an internal SSD: paks read much faster than thousands of loose files, for the check and for the game. Use the Share tab (Package for friends) and keep "Pack for speed" ticked (it is on by default): it sorts the files into one pak per kind, compresses only text and map .net and .grs files, stores the rest, and puts text first. A mod on a USB stick or a network share reads much more slowly.
6. Antivirus: add the mod folder and `%LOCALAPPDATA%\ARSENAL\cache` to the exclusions of real-time scanning; otherwise every file the check reads is scanned too.
7. The check uses every processor core: close other heavy programs while it runs.
8. In `ARSENAL.exe` each checker reads the mod on its own (the shared single read is not in the exe yet). Run from a source folder with Node.js (`node tools/gui/gui.js` for the window, `node tools/as2/as2.js check <mod folder>` for the command) and the checkers share one read of the mod, which is faster on a big mod.

### `fix`: a patch mod for common problems

```
ARSENAL fix <mod folder> plan --out <patch folder>
ARSENAL fix <mod folder> apply --out <patch folder>
ARSENAL check <mod folder> --with <patch folder> --fast -q
```

`fix` never writes your mod. It writes a separate patch mod (with its own `mod.info` that requires yours) into `--out`; to undo, delete that folder. `plan` writes nothing. The passes: `lng` (a `.lng` at an original path that would hide the original keys gets them appended), `repoint` (a missing model, texture, sound or environment preset reference with exactly one same-name file in the game is pointed at it), `include` and `macro` (a missing include or define with exactly one candidate), `stubmtl` (a missing material that crashes at load gets the nearest same-folder one, which may look wrong) and `set` (`--set file:path=value`). Four more passes work on single lines: `enc` (text values saved as cp1251 are resaved as UTF-8 for AS64; `--target classic` leaves them, and text that does not read as Cyrillic is refused), `asread` (a value the game clamps or rounds on read is written as the game uses it), `syntax` (a bare texture name gets quotes, split tag strings are joined) and `spell` (a name the game skips because of its case is respelled, so the line starts to work: look at the result in game). A line the original game file also has is never changed. `--only lng,repoint` picks passes; `quarantine` runs only when named in `--only`. Each changed file must pass the linters again, else it is reverted. To use a patch, put it in `<game folder>/mods` and activate it after your mod.

### `gen`: make a small mod from a spec file

A spec is a short text file listing what you want. The smallest useful one:

```
name: demo
title: Demo
ops:
  - op: mod
    title: Demo
  - op: text
    key: desc/entity/demo
    text: Demo text
```

```
ARSENAL gen demo.yaml --target as64 --plan --out <new mod folder>
ARSENAL gen demo.yaml --target as64 --out <new mod folder>
```

The first line only prints what it would do. The second writes the mod into the folder you name (`mod.info`, a `localization/#demo.lng`, and folders), runs the checks, and writes a notes file next to it. It ends with the verdict `partial, untested`: `gen` does not play the game, so you still test in game ([chapter 18](18-testing-and-logs.md)).

`ARSENAL gen --sample` prints a small sample spec that gives one vanilla unit a new name (`ARSENAL gen --sample > sample.yaml` saves it). `ARSENAL gen --sample list` names the other samples with one line each: `rename-unit`, `change-price`, `clone-unit`, `armor`, `squad`, `iblock`, `macro`, `preset`, `army`, `kit`, `gun-class`, `shell`, `item`, `sound`, `soundclass`, `voice`, `skin`, `stuffmodel`, `mapinfo` and `all`. `ARSENAL gen --sample all` has one example of every op. The ops are:

| Op | What it makes or changes |
|---|---|
| `mod` | the mod folder and its `mod.info` |
| `clone`, `set`, `armor`, `text` | a copy of a unit, one key, armour numbers, a text key |
| `roster`, `card`, `breed`, `squad` | buy cards in an army list, soldier breeds, squads |
| `map-clone`, `mission-clone`, `place`, `mapinfo` | a copy of a map, a game mode on a map, an object on a map, the `map.info` settings (players, texture variant) |
| `gun`, `weapon`, `kitbash` | a new gun file from an existing one, the gun a unit carries, the turret of one vehicle model on the hull of another |
| `shell`, `item`, `kit` | a new shell, a new grenade, mine or other item, what a soldier carries |
| `iblock`, `macro`, `preset` | a unit's own block in an interaction file (for example its engine and track sounds), one argument of a macro call, buy limits in a multiplayer preset |
| `army` | a new army with its own id, lobby name, flag and side |
| `sound`, `soundclass`, `voice` | a sound folder, a loudness row in `sound.set`, a talk language for soldiers |
| `skin`, `stuffmodel` | a soldier skin, an inventory model |

Many recipes of the [Quick Guided Task](#quick-guided-task) run these same ops from your answers, so you get the result without writing a spec. Every sample uses real vanilla names, so `--plan` on a real game folder resolves them as written. Change the names to your own. An op that names a unit the game does not have is reported, not written. `--check-spec` checks a spec and writes nothing; `--schema` prints the full spec format.

`gen --describe` builds a spec from a plain-English description instead of a file; it is explained with the Units page in section 3.

### Add a unit with `gen`

Three ops make a new unit: `clone` copies a vanilla unit under a new name, `text` gives it a display name, and `roster` copies the card of an existing unit into an army list so the new unit can be bought:

```
name: newtank
title: New Tank
ops:
  - op: mod
    title: New Tank
  - op: clone
    entity: pz3
    as: my_pz3
  - op: text
    key: desc/entity/my_pz3
    text: My Pz III
  - op: roster
    unit: my_pz3
    like: pz3
    army: ger
    fields: {cost: 150}
```

```
ARSENAL gen newtank.yaml --target as64 --plan --out <game folder>/mods/newtank
ARSENAL gen newtank.yaml --target as64 --out <game folder>/mods/newtank
```

- `entity` and `like` are vanilla names: the unit's file name without `.def`, and its card name in the army list. `army` is the army list name (`ger`, `rus`, ...). `bots: true` in the `roster` op lets computer players buy it too.
- `fields` changes keys of the copied card; a key the card does not have stops that op with `GEN_FIELD_UNKNOWN`.
- The notes go to `<out>.gen/` beside the mod (`TESTNOTES.md` lists what to look at in game). With `--out` under `<game folder>/mods`, they go to `gen-out/<name>.gen/` in the folder you run from instead, so `mods` gets no extra folder. `--report <dir>` picks the folder yourself.
- A clone has no destroyed variant of its own (`_x`, `_xx`) unless you clone those too. Check the new card in the purchase panel in a test match; the Units page has a "Buy panel checklist" for this.

### `ARSENAL-gui`: the same tools in a window

A double-click on `ARSENAL.exe`, or on `ARSENAL-gui.cmd` (with the small download, `ARSENAL-gui.cmd` or `./arsenal-gui`), opens the ARSENAL window: it finds the game folder, starts a small server on your own machine (nothing is reachable from outside it) and opens your default browser on it. As a command, the same is `ARSENAL gui --open`. Options of that command: `--no-open` starts the server without opening the browser, `--port N` picks the port, `--allow-launch` lets buttons that start the game work from the first moment, and `--remote` starts with LAN Remote on ([LAN Remote and the phone view](#lan-remote-and-the-phone-view)). Without `--allow-launch`, those buttons stay grey until you switch on "Let ARSENAL start the game" on the Play page; the switch lasts until the window closes. `ARSENAL.exe` started with no command opens the window too.

The window runs the same tools as the commands, from the same exe. The commands `probe`, `e2e` and `dev-loop` start Node and the game themselves and run only from source; `soedit build` is not in the release: SOEdit is not part of ARSENAL, and `ARSENAL soedit install` (or **Get SOEdit and open it** on the Models page) downloads it.

### In Gates of Hell
<!-- goh: none; ARSENAL behaviour (check --goh, gen --target goh, fix targets, fixmod recipe) -->

- `check --target goh` makes the Gates of Hell verdict the one the exit code follows; `--goh <GoH folder>` lets it read the Gates of Hell game too. A mod with only a `Min` of 3.301 is refused by Gates of Hell, which is right for an AS64 mod.
- `fix --target goh` writes a patch mod in the Gates of Hell form: the `mod.info` range follows the Gates of Hell version, and texts go under `localizations/default/`. Seven fixes that follow Assault Squad 2 rules do not run there, and each says why in one line: `enc`, `syntax`, `asread`, `botkeys`, `lngdup`, `stubmtl` and `quarantine`. The Check page under GoH uses it for its fix steps. The Quick Guided Task "a mod with problems (fix them)" still only looks under GoH: it shows the findings, says what to change by hand, and writes nothing.
- `gen --target goh` writes the Gates of Hell forms where they differ: texts go into a `.pot` file under `localizations/default/interface/text/` instead of a `.lng`, and a squad goes into `units/<period>/units_<army>.set`. Gates of Hell probably does not read a `.lng` file at all; this is not confirmed in the game.
- `upgrade --to goh` copies an Assault Squad 2 mod into a new folder in the Gates of Hell layout. The result is a start, not a tested mod.

## 3. The pages of the window

At the top of the window you pick the game you are modding: MoW:AS2 (the original 3.262 game, `mowas_2.exe`), AS64 (the 64-bit build with 3.301 data, `as64.exe`) or GoH (Gates of Hell, `call_to_arms.exe`). Each game keeps its own mod, game folder and last tab. Every game shows the same nine tabs and the same pages; GoH adds the GoH unit page. Where one part of a page cannot work for a game, that part stays in its place and says so in one line: "Not available in" the game, and the reason. The window has three levels: a row of tabs, a row of sub-tabs under the tab, and a third row of items above the page. A tab with only one sub-tab shows no sub-tab row, and a sub-tab with only one item shows no third row. A tab opens the item you last used in it. A link to a page of another game switches the game and says so.

In the table, sub-tabs are separated by semicolons and the items of a sub-tab are in brackets. "(Advanced)" marks an item that shows only with Advanced on ([Settings](#settings-all-games)).

| Tab (key) | Sub-tabs and items | MoW:AS2 | AS64 | GoH |
|---|---|---|---|---|
| Help & Docs (Alt+1) | Start Here; Prepare; Docs (ARSENAL, Modding, Engine, Project Notes (Advanced)); Guides & External Tools; Claude; Historical Sources | yes | yes | yes |
| Mods (Alt+2) | Mods (Mods, Upgrade or Port, Mod Files (Advanced)); Check & Fix (Check, Read Game.log) | yes | yes | yes; the easy upgrade card is not shown |
| IDE (Alt+3) | one page, the Editor | yes | yes | yes |
| Models & Sim (Alt+4) | Models, Look & Sound | yes | yes | yes; no Armor part on Models |
| Maps & Missions (Alt+5) | Maps; Map Viewer; Missions | yes | yes | yes; no "Add a game mode to this map" |
| Game Modes & AI (Alt+6) | Game Modes; Bots (Bots, Bot Doctrine); Unit AI; Map Scripts for AI | yes | yes | yes; several parts not available, see [In Gates of Hell](#in-gates-of-hell-2) |
| Units & Balance (Alt+7) | Units (Units, and under GoH the GoH unit page); Balance | yes | yes | yes; no price calculator, no "Describe a new unit" |
| Test, Share & Play (Alt+8) | Test Run (Test Plan, Test Run); Share; Play | yes; real test runs only as a dry run or a plan | yes | yes; no test game runs and no Gates of Hell start, see below |
| Tools & Settings (Alt+9) | Other Tools (Generator, Expert Tools (Advanced)); Settings | yes | yes | yes |

The header holds:

- **The game picker**: MoW:AS2, AS64 and GoH.
- **The mod and the game folder.** "Change" picks another mod folder (it must hold a `mod.info`); "Game folder..." points at another install and "Reset" goes back to the one found. Under GoH the header shows the Gates of Hell folder and the Assault Squad 2 folder that the GoH unit page writes its ported units to.
- **LAN Remote**, **Colours** (As the system, Light, Dark) and **Language** (English, Russian, Ukrainian, Chinese; the first start follows the browser).
- **"Advanced on"**, a small chip that shows only while Advanced is on. Pressing it opens Settings.
- A link to the community Discord, "Join The AS64 Community!".

Advanced and Arrange have their place on Tools & Settings > Settings ([Settings](#settings-all-games), [Arrange mode](#arrange-mode)), and Ctrl+K has both too. Window settings are kept in one file, `%LOCALAPPDATA%\ARSENAL\settings.json`, shared by every browser on this PC; they never keep a password, token or key.

Keys on every page: Alt+1 to Alt+9 open a tab. The same tab has the same key in every game, and a key whose tab the game does not have does nothing. Pressing the key of the tab you are on steps through its sub-tabs (in a tab with one sub-tab, through its items). Ctrl+Enter runs the page's main button, `j` and `k` move in a list and `/` jumps to the mod filter, Esc cancels the run in progress (or ends Arrange). **Ctrl+K** opens the palette, "Go to a page or run a command": type to find a page (listed by its path, such as "Mods > Check & Fix > Read Game.log") or a game, or pick a quick action ("Check this mod", "Install: preview (writes nothing)", "Play: dry run (no game)", "Settings (Advanced, Arrange)", switch Advanced on or off, "Arrange This Page"). The "Keyboard keys" fold at the foot of the page lists the keys.

A command that runs shows its output as it streams, with a progress row and "Stop this run". Only one game run can go at a time, and a run stops after 30 minutes unless the command asks for another limit. "Copy as command" on a run card gives the same run as a line for the terminal.

Every page that writes shows first what it will write, and writes only after you confirm in [the confirm box](#the-confirm-box). Nothing is ever written into the game's own data. The one exception is on the Share page: "Put the uploader into the game folder" copies the Workshop uploader's files into the game folder after its own confirm ([chapter 20](20-packaging-and-release.md)).

### Quick Guided Task

The row "Quick Guided Task" sits above the tabs on every game. It reads as a sentence: **I want to** [make / change / explore] [a task] **Start**. The first box picks the verb; the second lists the tasks for that verb, with "Type to filter" to narrow it. A task that cannot run here shows grey with the reason: "not for" and the game, "needs a mod picked", "needs the game folder", or "only on the PC, not from another device". There is no separate "fix" verb: fixing a mod is the change task "a mod with problems (fix them)", and looking at what went wrong is the explore task "what went wrong in the last run".

Start opens the task window. It asks one question at a time, plans the files, writes them into the mod you picked with a restore point first, checks the mod and sends you to test. The step by step is in [Use the Quick Guided Task](p17-quick-guided-task.md). The tasks, by the name the window shows (verb, then title):

| Task | Verbs | Games |
|---|---|---|
| a mod | make | MoW:AS2, AS64, GoH |
| a vehicle | make, change | MoW:AS2, AS64 |
| the armour of a vehicle | change | MoW:AS2, AS64 |
| a soldier | make, change | MoW:AS2, AS64 |
| a squad | make, change | MoW:AS2, AS64 |
| a gun or weapon | make, change | MoW:AS2, AS64 |
| ammunition | make, change | MoW:AS2, AS64 |
| a grenade, mine or item | make, change | MoW:AS2, AS64 |
| an army (change: "an army: its name, flag, cards and side") | make, change | MoW:AS2, AS64 |
| prices of an army | change | MoW:AS2, AS64 |
| what bots buy and how they play | change | MoW:AS2, AS64 |
| a skin or camouflage | make, change | MoW:AS2, AS64 |
| an icon | make, change | MoW:AS2, AS64 |
| a sound | make, change | MoW:AS2, AS64 |
| a voice set | make, change | MoW:AS2, AS64 |
| a map, starting from a game map (change: "the settings of a map") | make, change | MoW:AS2, AS64 |
| a multiplayer game mode (change: "the rules of a multiplayer game mode") | make, change | MoW:AS2, AS64 |
| new texts or a translation (change: "the game's texts or a translation") | make, change | MoW:AS2, AS64 |
| a model (change: "a model of the game or of my mod") | make, change | MoW:AS2, AS64 |
| an old mod to 64-bit | change | MoW:AS2, AS64, GoH (GoH: makes a Gates of Hell copy) |
| a mod with problems (fix them) | change | MoW:AS2, AS64, GoH (GoH: looks only, writes nothing) |
| a unit from Gates of Hell | make | MoW:AS2, AS64, GoH |
| a unit, gun, map, sound, model or picture | explore | MoW:AS2, AS64 |
| a mod | explore | MoW:AS2, AS64, GoH |
| what went wrong in the last run | explore | MoW:AS2, AS64, GoH |
| what is possible | explore | MoW:AS2, AS64, GoH |
| a release | make | MoW:AS2, AS64 |

That is 27 tasks: all 27 under MoW:AS2 and AS64, seven under GoH (the rest show grey there with the reason). The explore tasks only read: they show numbers, files, clashes, log errors or what the game allows, and write nothing.

In the task window:

- The first steps ask "Which mod does this go into?" ("Make the mod" makes a new empty one from inside the task) and "What do you want to copy?" or "Which one do you want to change?". The values of the thing you copy are filled in as defaults.
- "How many questions" switches between Quick (the main questions) and Everything. "Keep as copied" keeps one value, "Keep this whole group as copied" skips a group, "Ask me this group" opens it again.
- An answer can come from four places: "Use one that exists in the game or a mod", "Copy one and change it" (a branch task, for example a new gun inside a vehicle, after which you come back), "Bring my own file" (one file, several, or a folder, up to 64 MB; the type is read from the bytes, not the name), or "Make it in an outside program" (SOEdit, Blender GEM2, 3ds Max GEM, a DDS editor, an image editor, Audacity, ffmpeg, Notepad++, the game editor and more, each marked found on this PC or not).
- Next and Back (Enter, Alt+Left) move between steps; Finish ends the questions. "Save and close" (Esc) keeps the task to finish later.
- Review shows every answer and the files the task will write, and writes nothing. Write asks in the confirm box, makes a restore point and writes. "Do not write now: save and close" leaves without writing. "Open the restore points" opens the Editor's Restore points panel.
- "Check now" runs `check` and the task's own check. "Go to the Play page" takes you to test; "What to look at in the game" is a tick list for that test. The last step offers "Make another", the next suggested task, "Back to the tabs" and "Share the mod".

A started task is saved as you answer. Pick it under "Saved tasks" in the row and press **Continue** to go on where you left it, or **Throw away** to delete it. The confirm says that its branch tasks go too, and that files it already wrote stay (undo them in the Editor's Restore points).

What a task writes: the task itself (answers and staged files) is kept in the ARSENAL data folder (`%LOCALAPPDATA%\ARSENAL\tasks`) and a temporary folder, never in your mod. Only Write puts files into the mod you picked, each one with a restore point in `<mod>.arsenal-undo` beside the mod (the same restore points the Editor uses). "an old mod to 64-bit" writes a new mod folder and only reads the old one. The explore tasks write nothing.

### Help & Docs (all games)

The tab has four sub-tabs: Start Here, Docs, Guides & External Tools and Historical Sources.

- **Start Here** walks a new modder through a first mod. It also makes a "get help" text to paste into a forum or Discord post: the game folder, the game program, your mods and the end of the newest `game.log`, with your user name replaced by `%USERPROFILE%`. A messages box looks up a row of the known-limits list when a tool's message names one.
- **Docs** reads and searches the documentation inside the window, chapter by chapter or as one book. Its third row splits the documents into parts: **ARSENAL** ("About ARSENAL", the one-page path through the first commands), **Modding** (this guide in reading order: Part I, Part II, Part III), **Engine** (the engine technical document once you add it, a separate download, see [Whole documents](#whole-documents)) and, with Advanced on, **Project Notes** (the project's working notes). "Document set" picks a set of the part you are in, "Read the whole guide" (or "Read the whole document") reads it as one book, and "Open this chapter alone" opens one chapter. A link to a page of another part opens that part. The search box, "Search words, or a limits ID", searches the chapters of the set picked under "Search in". The page reads the `guide` folder that came with the program, or a folder named `docs` next to it; without either it lists the places it looked, and "Look again" tries again. When a PDF of the guide is present, "Open the PDF" opens it in your PDF reader. With Advanced on, the parts also list the maintainer notes, and "Also search maintainer notes" adds them to the search. The box "Whole documents" is described [below](#whole-documents).
- **Guides & External Tools** searches an offline index of about 9,000 links to guides and tools that modders wrote for GEM engine games, with saved page text for many of them. Its tabs: Search, Questions and answers (answers picked from old forum pages by keyword, unchecked), Tools by topic, "What ARSENAL can and can't make" (for each kind of content, such as models, textures, sounds, maps and animations: what ARSENAL does itself, what still needs another program, guides for it and the ARSENAL page to go to), Export these results, Sources, and Update the index (fetches public pages one at a time and obeys each site's `robots.txt`; nothing goes online until you press Start). The index is a separate folder that holds `guides.json` and a `builtin` folder; ARSENAL looks for it in a `gemindex` folder next to the exe or in the folder named by the environment variable `GEM_INDEX_DIR`, and "Pick the index folder" points the page at it. Links are not opened or checked for safety by ARSENAL. The steps are in [Find guides and tools others made](p16-find-guides-and-tools.md).
- **Historical Sources** holds the first-hand and second-hand sources on the Second World War from the guide index. Read the pages, or search its Source index; a title there opens that document in your browser.

### Whole documents

The Docs page has a box "Whole documents": "Each one is a single file, read here in one piece." Each button sits in the Docs part its document belongs to:

- **Doctrine atlas** (Modding): the bot doctrine pack (the rules and personas of the Bot Doctrine page) as one page, with its diagrams, tables and filter buttons.
- **Modding guide** (Modding): this book as one HTML file.
- **Engine document** (Engine): the engine technical document as one HTML file, once you add it (below).

The engine technical document is not in the ARSENAL download. It is published as its own download, `ARSENAL-engine-docs-public-<version>.zip`, beside the ARSENAL downloads. It describes how the engine of the 64-bit build works, subsystem by subsystem. Unzip it and copy its `techdoc` folder into the ARSENAL folder, so that it merges with the `techdoc` folder there. Then press **Look again** on the Docs page. Under Engine the page then shows the document three ways: the document set "Engine technical document" (chapters, and "Read the whole document"), the **Engine document** button in this box, and **Open the PDF**. Until you add it, this box says: "The engine technical document is a separate download, ARSENAL-engine-docs-public-<version>.zip, published beside the ARSENAL downloads. Unzip it, copy its techdoc folder into the ARSENAL folder, then press Look again."

The document opens inside the page. A line above it names it with its version and offers **Open in a new tab**, and **Open the PDF** when a PDF of the same document lies beside it. The search box of the page searches the chapters, not the open document; to find words in the whole document, click into it and use your browser's find (Ctrl+F).

When another document is not there, its button is not shown. With Advanced on the page names the command that makes it, where the scripts that make it are present:

```
node guide/build-pdf.js --html-only
node guide/build-pdf.js --book engine --html-only
node tools/wholedoc/atlas.js <pack>/atlas.html
```

`build-pdf.js` writes the guide to `guide/dist/AS2-Modding-Guide-v<version>.html` and the engine document to `<version>.html`; without `--html-only` it also prints the PDF beside it with Edge or Chrome (`--browser <exe>` names the browser, `--out <dir>` picks another folder). `atlas.js` reads the doctrine pack's atlas page and writes it in the ARSENAL look to (`--out` picks another file, `--check` only says whether the file is up to date). The Docs page always shows the newest version it finds.

### Mods > Mods (all games)

The Mods tab has two sub-tabs: Mods and Check & Fix. The Mods sub-tab holds the items Mods, Upgrade or Port and, with Advanced on, Mod Files.

**Mods** lists the mods in the game's `mods` folder and is where you pick the mod the other pages work on. "Add folder..." adds another folder of mods to the list, and an empty list offers "Use the game mods folder" and "Make my first mod". Type `/` to filter; a double click or Enter on a row picks the mod, and its card offers Check, New mod and Play. New mod and "Make my first mod" open the New mod card below.

**New mod** (all games) is a folded card under the mod list. It opens by itself when the list is empty or another page sends you here to make a mod. It makes a new empty mod (`ARSENAL new`): a `mod.info` with MinGameVersion 3.301, a text file and a readme; spaces in the folder name become `_`. Under MoW:AS2 and GoH the card says so and makes the `mod.info` for that game (`--target mowas2` or `--target goh`); a Gates of Hell folder name may not hold a `-` or letters outside plain ASCII. "new: dry run" shows what it will make and writes nothing; "new" makes it. See [Make a mod and see it in the game](p01-first-mod.md).

**Mod Files** (all games, with Advanced on) shows every file of your mod, which file the game really uses when mods stack, and lets you edit and search text files with restore points. The Editor on the IDE tab does the same job with more help.

### Upgrade or Port (all games)

Mods > Mods > Upgrade or Port upgrades an old mod into a new folder (`upgrade`); the old mod is never written.

- Under MoW:AS2 and AS64, the card "Upgrade an old mod to AS64" asks for the old mod and the kind: Enhanced (the mod runs only on AS64 and may use its new features) or Classic (the mod stays as close to the old one as it can). It shows where the copy goes, next to the old mod. "See what changes" lists the changes and writes nothing; "Make the AS64 copy" writes the copy, and the copy becomes the current mod.
- With Advanced on, the fold "Advanced: every upgrade setting" holds the full form, "Port to another target (upgrade)", with "upgrade: plan" and "upgrade: write".
- Under GoH the easy card is not shown, and the fold with every upgrade setting is always open, with or without Advanced. It makes a Gates of Hell copy of an Assault Squad 2 mod (`upgrade --to goh`).

See [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md).

### Mods > Check & Fix (all games)

- **Check** (all games) is a guided fix in seven steps: Pick the mod, Check, Review findings (one card each with where, why it matters and how to fix, most serious first), Choose fixes (safe ones are ticked for you), Fix the rest by hand (a walkthrough of the places no automatic fix covers, each opened in the Editor), Apply into a new folder ("Apply ticked fixes" writes a patch mod beside yours), and What changed and next steps ("Check again with the patch", "Go to Test"). The "quick check" tick starts ticked for a big mod (300 files or more) and unticked for a small one; a tick by hand wins. With Advanced on, the fold "All options (advanced)" holds the raw check and fix forms. A ticked kind of fix is applied to every file of that kind, so read the plan before you apply.
- **Read Game.log** (all games) reads the newest `game.log` in plain words, lists crash reports and out-of-sync folders, shows which mods are switched on in which order, explains why a mod is missing, follows one unit from its file to its model, materials, buy card, army and picture, and keeps a tick list of what to look at after you play. See [chapter 18](18-testing-and-logs.md#9-letting-arsenal-read-the-log).

Under GoH, Check checks the mod with the Gates of Hell rules and its fix steps write a Gates of Hell patch mod (`fix --target goh`, [section 2](#in-gates-of-hell-1)); Read Game.log reads the `game.log` in the Gates of Hell user folder.

### IDE (all games)

The IDE tab holds one page, which calls itself the Editor. The Editor is a page for the text files of your mod. It edits the mod you picked on the Mods page; with no mod picked, it sends you there. It compiles, builds and launches nothing: its checks only read the text. You start the game from the Play page.

#### What you see

- **The file list** on the left, with three views:
  - **My mod**: the files in your mod folder.
  - **Game**: everything the game reads with your mod loaded. A *layer* is one source of files: the game itself, another mod, or your mod. Each file shows which layer wins (`mine`, `other mod`, `game`). Files of the game and of other mods open read-only.
  - **Problems**: the open files that have errors or warnings.
- **Open files** as tabs above the text. A middle click on a tab closes it.
- **The text**, in colours. The default is the GEM2 dark colours. The **Colours** switch in the status bar picks **Light**. Only the text pane is dark; the rest of the page keeps its own colours.
- **The bottom panel**, with the tabs Problems, Search, Which file wins, Usages, Game log, Restore points and Notepad++. **Panel** shows or hides it.
- **The status bar**: line and column, line ends (CRLF or LF), BOM, the layer of the file, why a file is read-only, and the result of the last check.
- **The toolbar**, in the groups File, Check and fix, Jump, Log and More.
- **The Next strip**: it offers the next sensible step, for example "go to the next one", **Quick fix**, **Check the whole mod** or **Go to the Play page**.

Every control has a tooltip with its name, what it does and its shortcut. It shows when you hover the control with the mouse or reach it with the keyboard.

#### Saving and undo

- Ctrl+S saves at once.
- A *restore point* is the old version of a file, kept just before a write. Every save makes one. Restore points live in a folder beside your mod named `<mod>.arsenal-undo`.
- **Show changes** shows what changed since the last save, before you save.
- The **Restore points** panel lists them. **Preview** shows what restoring would change and writes nothing. **Restore** writes the old version back and keeps the current one as a new restore point. So any save can be undone.
- **Revert file** drops your unsaved edits.
- Bytes you did not touch stay as they were: CRLF line ends, the BOM and old cp1251 comment bytes. The status bar counts the cp1251 lines. If you edit such a line, the editor warns that the line now mixes old cp1251 text with new text; check that line in game.
- If the file changed on disk after you opened it, the editor does not overwrite it. It says "This file changed on disk." and offers **Reload (lose my edits)**, **Compare**, or **Keep mine and save anyway** (a restore point keeps the other version).

#### Overriding a game file

Files of the game, files inside paks and files of other mods open read-only, and the status bar says why. To change such a file:

1. Open it, for example from the Game view.
2. Press **Copy into my mod**. The box shows the path inside your mod it will write to, and whether that is a new file or replaces one of yours.
3. Press **Copy**. Your copy opens and you can edit it. From now on your copy wins over the one below it.

**Compare with vanilla** (Alt+V) shows your file next to the copy it replaces. **Which mod wins** (Alt+W) lists every copy of the file and the one the game reads.

#### Checking

- The editor checks the file 400 ms after you stop typing, and on every save. A file over 1 MB is not checked while you type.
- A mark sits on the line, and the same problem is listed in the Problems panel. F8 goes to the next problem, Shift+F8 to the previous one.
- F1 (**Explain**) explains the mark in plain words: what it is, why, how to fix it, and a link to the matching entry of the known-limits list.
- Ctrl+. (**Fix this mark**) shows the fixes for the problem on this line. A fix changes the text only; nothing is written until you save.
- **Fix all safe ones** applies only the fixes marked safe. One Ctrl+Z takes them all back.
- Some fixes need more than one file. Those stay on Mods > Check & Fix > Check: **Fix in a patch mod** opens that page, and it writes the fixes into a new patch mod. **Check whole mod** also opens it.

#### Keys

| Key | What it does |
|---|---|
| Ctrl+S | Save |
| Ctrl+P | Go to file: find a file in your mod by name |
| F12 or Ctrl+click | Go to definition: includes, entity names, macros, paths, the parent of an inherit |
| Shift+F12 | Find usages of the name under the cursor (Usages panel) |
| Ctrl+G | Go to line (`line` or `line:column`) |
| Ctrl+Shift+O | Outline: the blocks of this file |
| Alt+Left / Alt+Right | Back and Forward after a jump |
| Alt+V | Compare with vanilla |
| Alt+W | Which mod wins |
| Ctrl+Shift+F | Find in files (Search panel). Tick **Also the game's own files** to search the game's files too, including inside paks |
| Ctrl+F, F3 | Find in this file, find the next match |
| F8 / Shift+F8 | Next and previous problem |
| F1 | Explain the problem on this line |
| Ctrl+. | Fix the problem on this line |
| Alt+F1 | Show the hover card at the cursor |
| Ctrl+L | Read last log |
| Ctrl+K | Command palette: every action by name |
| Ctrl+M | Switch Tab between "writes a tab" and "moves focus" |
| Ctrl+PageDown / Ctrl+PageUp | Next and previous open file |

Tab writes a real tab character. Press Ctrl+M when you want Tab to move focus instead, so you can leave the text with the keyboard; press it again to switch back.

#### Hover cards

Rest the mouse on a key, a path, an entity name or an include. A card opens. It starts with one plain sentence, then gives the type, where the name is used, which layer wins, and links to the known-limits entry and the docs. Alt+F1 shows the same card at the cursor, from the keyboard. The full facts about each key are in Part III, starting with [Reference 2, Entity definition](r02-entity-definition.md).

#### Game log

The Editor does not start the game. Play with your mod, then press **Read last log** (Ctrl+L) or **Read the newest log** in the Game log panel. The panel lists the findings of the newest `game.log`, with how many times each came, and the end of the log. A click on a finding opens the winning copy of the file at that line; **Next log error** goes to the next one. **Re-read every 5 s** reads the log again while the panel is open.

Other pages link here too: findings on the Check and Read Game.log pages have **Open in Editor** links that open the file at the line. Files the Editor cannot show as text open in a [file viewer](#file-viewers).

#### Notepad++ setup (unconfirmed)

If you prefer Notepad++, the Notepad++ panel sets it up for mod files.

- **Show what will change** is a dry run: it lists every file the setup would add and writes nothing. **Set up Notepad++** works only after a list with no problems.
- The setup adds a language for the game's file types with the GEM2 colours, auto-complete words, and three Run-menu commands: "ARSENAL: check this file", "open in GUI" and "show vanilla".
- GEM2 is a Notepad++ theme by Tyler V. It is not shipped with ARSENAL. To use it, point **Theme file (GEM2.xml)** at your own copy, and the setup copies it in. Then pick GEM2 in Notepad++ under Settings > Style Configurator > Select theme.
- The setup makes a backup first and only adds files. It never changes `langs.xml`, `stylers.xml` or `config.xml`. It refuses while Notepad++ is running, because Notepad++ writes its settings back when it closes.
- **Remove** takes out only what the setup added. Files you changed yourself are kept.
- **Open in Notepad++** in the Editor opens the same file at the same line. The Run-menu command "open in GUI" jumps back to the Editor.

The same from the command line:

```
ARSENAL ide npp status|plan|install|uninstall [--theme GEM2.xml]
ARSENAL ide check <file>
```

`ide npp plan` is the dry run. `ide check` prints one line per finding (`<file>:<line>:<col>: <CODE> <message>`) and exits with 1 when there are errors.

### Models & Sim (all games)

The tab has no sub-tab row. Its third row holds two items, Models and Look & Sound.

**Models** works on a unit's 3D model. At the top you pick your mod folder and a unit (or a model file path). A bar above the page's own tabs holds Undo and Redo, and "Write these files" writes the open model's changes into your mod after the confirm box. The page's own tabs are Model, Animation, Skeleton, Volumes, Meshes and materials, Files and Armor; the main ones:

- **Model** lists the files that make up the model (model, meshes, armour volumes, animations, materials), each marked "already in your mod" or "only in the game, not copied yet", and shows the model in a 3D view (Front, Side, Top, Reset; switch Meshes, Volumes and Bones on and off; drag to turn, wheel to zoom, click a volume to see what it is). **Copy into my mod** copies those files to the same paths in your mod, so your copies win; files already there are kept, and textures are not copied (SOEdit reads them from a view folder outside the mod). The "External SOEdit (optional)" card at the foot of the page says where SOEdit was found. When it is not on this computer, **Get SOEdit and open it** asks first, then downloads the latest SOEdit release from GitHub, checks its size and, when GitHub lists one, its checksum, installs it in your user folder and starts it; `ARSENAL soedit install` does the same download as a command. **Open in SOEdit** starts SOEdit on your mod's copy. After you save in SOEdit, **Check what changed** compares your files with the copies taken when you copied, and lists anything lost on saving: a setting inside a bone, volume or animation sequence, a whole block of the model file, comment lines, mesh parts written back in a plainer form, or an animation saved in another file version.
- **Animation** opens the model's animations (**Read it** reads one more from your mod or the game), plays them in the 3D view, and changes them without SOEdit: keys and poses of each bone, frames (insert, delete, set length, stretch, reverse, make it loop), bones (add, rename, clone, remove, take bones from another animation), and a timeline with the model's sequences. Every change goes into the open model first; Undo and Redo above the page's tabs step back and forward. Nothing is written until you press **Save**: it lists the files that will be written and what a save would lose, and **Write these files** writes them into your mod, keeping a backup of the files it replaces under `<mod folder>/.arsenal/model-edit/backup`. A page with unsaved changes asks before you leave it.
- **Armor** is the armour simulator. "Thickness of each part" lists every armoured part and its six sides in millimetres, and where each number comes from (set on the part, from an armour area, or no value, which counts as 0 mm). Click a number to change it, for one side or all six; a number shared by several parts or units lists them first. Under "Who shoots" you pick a gun, a shell type and a range; "What happens across the whole side" colours every spot of one side by what a hit there does; a click on a part or a spot fires one shot and lists each plate the shell meets, its slope and the result. "Behind the armour" then follows the shot past the plates: what it does to the parts, the crew and the tank as a whole, by the game's rules and the unit's own scripts. The penetration checker, the "Behind the armour" panel and the Shot tool of the Model tab are explained in [chapter 9, section 11](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window).
- **Skeleton**, **Volumes**, **Meshes and materials** and **Files** change the model without SOEdit: bones and their detail levels, armour volumes and obstacles, meshes and their textures, and the model files themselves (save, save a copy, the model as text).

The steps are in [Change armour and see the result](p05-change-armour.md) and [Edit a model or an animation](p06-edit-a-model.md).

**Look & Sound** changes how a unit looks and sounds: repaint textures, replace a gun, engine or voice sound, change the small picture on the unit card and the face pictures of soldiers, and bring in a model made in Blender. Its Art check looks at the format of the files you added (texture format and size, sound file header). See [Icons and interface](p08-icons-and-interface.md) and [chapter 16](16-effects-sound-models.md). To hear or see one file as the game will use it, open it in a [file viewer](#file-viewers).

### Maps & Missions (all games)

The tab has three sub-tabs: Maps, Map Viewer and Missions.

- **Maps** shows the multiplayer maps, makes your own copy of one with a lobby name and a game mode, puts an object on a map ("Preview (writes nothing)", then "Place it"), and checks your mod's maps ("Check now"). Positions on this page are in metres. Making the map itself is done in the game's own editor. See [Copy and change a map](p09-copy-and-change-a-map.md).
- **Map Viewer** lists the maps and shows each one in layers and pictures: spawns, capture points and their zones, height and water. It only reads.
- **Missions** works on the missions of a map. A mission is one game mode of a map: the map's `<mode>.mi` file, with the flags, the start points of each side and the triggers of that mode. Its steps:
  1. **Pick a map**: the same list as on the Maps page; a map picked there is picked here too.
  2. **Missions on this map**: for each game mode, how many flags its mission has, how many start points are marked as spawn points, and whether bots are on in that mode. Your mod's files count first. A note warns when a mode has fewer start points than players, or bots but no flags.
  3. **Add a game mode to this map**: makes a new mission for a mode the map does not have yet, made from one it has, and writes it into your mod folder; the map in the game stays as it is. "Preview" writes nothing, "Write into my mod" writes. For battle_zones you can set the number of flags. captureflag is refused on a map without the two capture areas `captureflaga` and `captureflagb`, because the game would crash when the mode starts.
  4. **What my mod changed in these missions**: compares each mission of the map with and without your mod (flags, start points, objects, triggers, zones) and writes nothing. For now this works only when your mod folder is inside the game's `mods` folder.
  5. **Check my missions**: runs the mission checker on your mod and shows only what concerns missions and game modes.
  6. **Guided tasks**: "Change a mission or game mode" and "Change this map" start the [Quick Guided Task](#quick-guided-task).

On the Missions page a card also lists the steps for placing flags, start points and triggers in the game's own editor (`as64_ed.exe`), which this page never starts; "Count again" reads the numbers again afterwards.

### Game Modes & AI (all games)

The tab has four sub-tabs: Game Modes; Bots, with the items Bots and Bot Doctrine; Unit AI; and Map Scripts for AI.

- **Game Modes** works on the game modes. A game mode is a mode card, `set/multiplayer/games/<mode>.set`, plus the lobby presets. The card holds the rules (score, time, teams, fog of war, and whether bots may join), and every map of that mode uses the same card. The page has:
  - **Modes in the game and in my mod**: one row per mode card, with Plays like (the engine game class the card uses), Players, Order, Bots and From. A note warns about a class the engine does not know, and about bots in a mode that plays like combat, where bots buy units but give no orders.
  - **Allow bots in a mode**: adds `{enableBots}` to the mode card in your mod, so the lobby offers bot slots in that mode. If your mod has no copy of the card yet, the game's card is copied into your mod first. The change applies to every map of that mode. "Preview" writes nothing, "Write into my mod" writes. Bots also need flags on the map; the Missions page counts them.
  - **Multiplayer start settings**, moved here from Bots: the presets for how much money players start with, how fast it grows, and how big an army they may field. Pick the preset file, change a number, preview, then write into your mod's copy. Saving needs the game folder too.
  - **Make or change a game mode (guided)**: "Make a game mode" and "Change a game mode" start the Quick Guided Task. Turning bots off and removing a mode of your own are possible only by hand for now.
- **Bots** shows what computer players buy and how rich each difficulty is, and changes them in your mod's copy of the files: add a unit to a bot shopping list, and change the difficulty multipliers (1.00 is normal). Each change has "Preview changes", "Write into my mod" and "Back to stock (remove my copy)".
- **Bot Doctrine** is a pack of short rules for how real small units fought in the Second World War, and nine characters (personas) that follow them more or less strictly. It turns a persona into bot settings in your mod's copy of `bot.data.lua` and checks that file. Nothing it writes has been played in a match yet (unconfirmed). Its own tabs are Rules, Personas, Scenarios, Profile, Generate and Check. See [Bots: what they buy and how they play](p11-bots.md).
- **Unit AI** shows and changes how computer-run units behave: the brain and sensor values, and the rules for which target and which ammunition a unit picks.
- **Map Scripts for AI** writes orders for bot units into a map's mission file.

### Units & Balance (all games)

The tab has two sub-tabs, Units and Balance.

**Units** finds a unit by its name or id, reads its stats in plain words, and changes it or copies it into your mod. Its cards:

- **Quick change** edits price, armour and similar numbers of one unit.
- **Add a unit (copy)** copies a unit under a new id with its own name and price, optionally with its wreck and with bots buying it.
- **Describe a new unit** takes a description in plain English, such as "fast Soviet heavy tank with a big gun, cost 900, called Molot". ARSENAL picks the closest game unit, copies it under a new id and gives the copy its own gun file, armour, speed, price, name and buy panel line. "Understood" and "Assumed" lines show how it read you. A description such as "Tiger hull with the turret of the IS-2" joins the model parts of two vehicles; the turret can then sit wrong and recoil or crew seats can be off (unconfirmed), so look at the unit in the editor. The built-in reader runs on your computer. The tick "let an AI model read the description" sends the description and the list of game units to Anthropic and needs your own API key; any failure falls back to the built-in reader.
- **Buy panel checklist** lists what to look at in a test match: the right army and button group, a name and not a key, price and rank, unlock, spawn, move, fire, wreck.
- The Balance card also has "Compare mod with the game", "Change all prices of an army" by a percent, and a "Price hint" for the unit you look at. The Recipes card makes a soldier type or a weapon from a few choices.
- For many changes at once (a recipe file for many units), "Open the Generator" goes to [Tools & Settings > Other Tools > Generator](#other-tools-generator-and-expert-tools-all-games).

**Balance** shows every unit of the buy panel as one row. You narrow the list by anything (army, class, price, armour, gun), and see it as a Sheet, in Groups, as a Graph, side by side (Compare), or as Odd ones: the units that do not fit the price pattern of their class. The Graph can also mark the units far from the trend of their group or far from a point you set. The Change view changes one value for all units on show, or only the ticked ones: by a percent, by an amount, to a set value or to the price the pattern gives, for example every price by 10 percent; "Preview" shows it and "Write into the mod" writes it. See [chapter 17](17-balance-pricing-gameplay.md) and [Change a unit's numbers](p02-change-unit-numbers.md).

### Units & Balance under GoH

Under GoH the Units sub-tab of Units & Balance holds a second page, GoH unit. It brings a vehicle from Gates of Hell into Assault Squad 2, built on a *donor*: an Assault Squad 2 unit of the same kind that already works. Its steps: 1. pick the Gates of Hell unit; 2. pick the donor ("Suggest donor" offers the three closest); 3. convert ("Preview (writes nothing)", then "Convert and write", by default into `<game folder>/mods/goh_<unit>`); then the result: "Run the fit check", "Fix what can be fixed", "Show the steps", and next "Open in Mods", "Check it" or "Go to Play".

Step 3 has the fold **Translate numbers**. It carries the Gates of Hell numbers of the chosen unit (speed, armour and others) over to Assault Squad 2 scale, and lets you choose a value where the translation is unsure; the unit, donor and output folder come from the steps above. "Translate" asks, "Translate, never ask" does not. Each question offers the Assault Squad 2 scale, the translated value or the donor's value (keys 1 to 3), and R applies the answer to the rest of that class. The result is a start that you check in the game, not a finished copy, and it stays on your own machine (see the [appendix](#appendix-porting-from-gates-of-hell) and [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md)).

### Test, Share & Play (all games)

The tab has three sub-tabs, in this order: Test Run (with the items Test Plan and Test Run), Share, and Play. None of them needs Advanced.

- **Share** gets a mod ready for friends or the Steam Workshop: the `mod.info` name, description, version and version range, a preview picture, a release check, a package folder for friends, a clean copy for the Workshop uploader (the page also shows whether the uploader sits in the game folder, puts it there after a confirm, and opens it), a new version number, a text card for friends saying which mods to load in which order, a list of clashes between installed mods, and a check after a game update. See [chapter 20](20-packaging-and-release.md) and [Pack and share](p15-pack-and-share.md).
- **Play** (all games) installs and uninstalls a mod and runs `play`: check, install, start the game on a test map ("Test map") in a separate copy of your settings (instance 1: "Look at the test copy", "Make the test game copy"), and read the load verdict. "play: dry run" and "install: dry run" show every step and change nothing; "How to switch it on" and "My change is not showing" help when the mod does not appear. Under GoH the page is there, but `play` and `install` refuse Gates of Hell: ARSENAL does not start that game and does not install into it, so put the mod in place and start the game yourself.
- **Test Run** tests single units. The card "Unit pairs" builds the pairs file for you: type a unit into "Shooter" and one into "Target" (an id, a name from the game or an army narrows the list; each row shows the name, the id, the army and the kind), then press "Add pair". ARSENAL fills in the crew and the distance; with no target it picks a fitting one. "Add the reverse pair" lets the target fire at the shooter, which tests that your unit takes damage. Each line shows the identifier of the pair (`P-` and five characters), a plain sentence such as "T-34 (t34_0) fires at GAZ-67 (gaz67b) from 15 m", the distance in metres, the switches "the target shoots back" and "watch for damage", and "Remove". "Check pairs" looks every pair over without a game and writes a status word and a note beside it. "Save as" keeps the list as a named pairs file with the mod and puts its path into the card below, so "Dry run (no game)" works at once; "Saved pairs files" lists the files to load or delete. The field "Unit pairs file" of the card below fills itself: with the file you just saved or loaded, else with the newest saved pairs file of the mod, else with the first game file Test Plan wrote; a line under the field says where the value came from, and a file you chose yourself is never replaced. The field wants a `.json` file that lists which unit shoots at which unit; Browse opens in the saved pairs folder of the mod, and a file that is not a pairs file gets one plain line at once. "Write to folder" fills itself with a folder in the test files of the mod; the report and the log of the run go there. Below it, "Test run in the editor build (pairs file)" lets the pairs fight in the editor build and "Prove one unit" plays one unit through live matches; a real run starts the game or the editor (AS64 only; under MoW:AS2 only the dry run and the plan work). Under GoH these two cards cannot run and each says why in one line (the GoH editor does not start the mission by itself, and GoH has no control pipe); the pair picker still works there, and the saved pairs file is your list of what to try in the game. The guided fix on Check ends with "Go to Test Run", which opens this sub-tab.
- **Test Plan** (the first item of the Test Run sub-tab) finds what you changed in the mod and lists a test for every change.

### Other Tools: Generator and Expert Tools (all games)

Tools & Settings > Other Tools holds the items Generator and, with Advanced on, Expert Tools.

**Generator** (all three games, each with its own target) makes mod content from a spec, a recipe file that lists many changes (`gen`, [section 2](#gen-make-a-small-mod-from-a-spec-file)). The card "What is the Generator (gen)?" explains it. Pick a sample from the list and "Load the sample", or load your own file, then "gen: plan" (writes nothing and lists the files it would make) and "gen: write" (makes a new mod folder at the place shown in box 2). The target box picks AS64, MoW:AS2 or GoH. For one unit the Units page is easier: it asks for each value. See [Make a mod and see it in the game](p01-first-mod.md).

**Expert Tools** (all games, with Advanced on) has every ARSENAL tool in one list with its command line to copy, differences between mods and between versions, stat sheets as tables, and the mod conflict view. Its parts:

- **All tools**: search the list, "Ask the tool for --help", fill in the arguments ("Insert {mod}", "Insert {game}"), then "Check only" or "Run" with a time limit. Each tool is marked as one the page can run, one it runs only as a dry run, or one that is not run from here.
- **Diff**: what your mod changes in the game, what changed between two versions of a map, which mods change the same things, and what changed between two versions of the game or a mod.
- **Stat sheets**: weapons, ammo, armour and prices as tables, filtered by name.
- **Conflicts**: the files and values that mods in load order both change, and "Mod to clean", which previews the files of a mod that are identical to the game's and then writes a copy of the mod without them into a new or empty folder ("Write the copy"); the mod itself is left alone.
- **Copy as command**: make the command line for any run.

### Settings (all games)

Tools & Settings > Settings holds the settings of the window itself. Colours and language stay in the header.

- **Advanced**: the switch "Show the Advanced options". Advanced adds expert options inside the tabs you already have; it never adds a tab. Turning it on asks first, every time: the box "Turn on Advanced?" says that some of the options write straight into mod files or start the editor build of the game, and that you should keep a copy of your mod. "Turn on Advanced" confirms. Turning it off does not ask. Under the switch, "What Advanced adds under" and the game name lists what it adds for the game you are on. Under AS64 that is Help & Docs > Docs > Project Notes, Mods > Mods > Mod Files and Tools & Settings > Other Tools > Expert Tools, plus the folds marked Advanced inside pages, such as the expert options on Check. When you turn Advanced off while you are on one of those items, the window stays in the same tab. While it is on, the window shows the chip "Advanced on" ([section 3](#3-the-pages-of-the-window)). Ctrl+K can switch Advanced too.
- **Arrange**: pick a page under "Page to arrange" (it starts on the page you came from) and press "Arrange the page". See [Arrange mode](#arrange-mode).
- **Where these settings are kept**: the file that holds your choices in this window, `%LOCALAPPDATA%\ARSENAL\settings.json`. Delete that file to reset the window. When there is no such file, your choices are kept only until ARSENAL closes.

### File viewers

A file that is not plain text opens in a viewer. In the Editor (the IDE tab) it opens in the text pane; on the other pages it opens in a dialog. Every viewer starts with an info card: size, where the file comes from, its game path and its first bytes. The kinds:

| File | What the viewer shows |
|---|---|
| any file no other viewer takes | Bytes, as hex: "Go to byte", Find text or bytes |
| sound (`.wav`, `.mp3`) | play it "As in the game" or as the "Raw file", at a distance and direction; "Next as the game picks" plays the next file of the folder the way the game picks one; a burst test fires a sound again and again; which names play it. `.ogg` and `.flac` say they cannot play |
| picture (`.dds`, `.tga`, `.bmp`, `.psd`, `.png`, `.jpg`) | zoom, background, channels and alpha, each mipmap, and what the game will make of the file |
| model files (`.ply`, `.vol`, `.anm`) | open on the Models page |
| map files (`map.grs`, `map.net`, `map.ply` in a map folder) | open on the Maps page |
| video (`.avi`) | what will play, the sound track, the frames; "Play in my video player" (on the PC only) |
| font (`.fnt`) | "Type here" to see text in the font, "Find a glyph" |
| shader (`.pso`, `.vso`) | what the file holds |
| archive (`.pak`, `.pat`, `.zip`) | the list of entries, filtered by name; a click opens one entry in its own viewer |

The viewers only read; nothing is written. See [chapter 16](16-effects-sound-models.md) for the formats.

### LAN Remote and the phone view

LAN Remote lets another device on your home network, such as a phone or a tablet, look at the window. It is off until you switch it on (or start with `ARSENAL gui --remote`). The **LAN Remote** button in the header shows its state: off, on, or "on, follows".

On the PC, the dialog "Let another device on this network view the page" shows a QR code and the address. "Copy link" copies the link; "New link" makes a new one, and the old link and every device that used it stop working at once. "Follow the remote device" (off by default) makes the PC page follow the page the other device shows. The first time, Windows may ask whether node may use the network; you answer that yourself, ARSENAL never changes the firewall or system settings. Keep the link private: anyone with it on your network can look.

On the other device, open the link or scan the code. The key in the link turns into a cookie and leaves the address bar. A banner says "View only. Changes are made on the PC.", and "Follow the PC" makes the device show what the PC shows.

What the other device can do: see every page, open mods, read results, reports and files, and in the Editor browse the mod tree, the paks and the Game view, open text read only, search, see which file wins, the outline and the same file elsewhere; every file viewer works read only. What it cannot do: run tools, save or change files, change settings, install, start the game or programs, or browse the folders of this PC. Files outside the game and mod folders are refused, and a wrong key 20 times locks that address out for 10 minutes. Tasks of the Quick Guided Task show grey there: "only on the PC, not from another device".

<!-- internal -->

Phone view gaps: the Docs Source index answers 403 on a phone because its POST routes are not on the remote read list (remote.js ALLOW). Reported but not checked: Guides & External Tools "Tools by topic", "Where it comes from" and the update progress, "Open the PDF" and the diagnostics text of the Generator and Upgrade or Port (both were one page before the nine-tab layout) also answer 403.

<!-- /internal -->

### Arrange mode

Every page is built from blocks. **Arrange** ("Move, hide and show the parts of each page. Your arrangement is kept in a profile.") starts in two ways: on Tools & Settings > Settings, pick the page under "Page to arrange" and press "Arrange the page"; or press Ctrl+K and pick "Arrange This Page" for the page you are on. A bar on the arranged page shows "Arranging:" with the page's path, and "Done". Arrange puts a bar on each block with a handle to drag it (a live preview shows where it lands), up and down arrows to move it, a side arrow that moves it into the next box, and a cross that hides it. "Show" and the block's name brings a hidden block back.

An arrangement is kept in a profile. The fold "Profiles, import and reset" holds the controls: "Profile" picks one, "Save as", "Rename" and "Delete" manage them. "Reset this page" and "Reset all" go back to the default layout. "Export" saves the layout to a JSON file and "Import" loads one. "Done" (or Esc, or "Stop arranging" in Ctrl+K) ends Arrange mode. Profiles are kept in `%LOCALAPPDATA%\ARSENAL\settings.json` with the other window settings.

### The confirm box

Every step that writes files or starts a program first opens one confirm box. It has a title, a list of what will happen, "Where:" and the folder it acts on, one confirm button (most often "Do it", or a name for the step) and "Cancel". Esc cancels. When the step is risky, the keyboard focus starts on Cancel, so a stray Enter does nothing. Nothing is written before you confirm.

### In Gates of Hell
<!-- goh: none; ARSENAL behaviour under the GoH header button (groups.js, task recipes) -->

Under the GoH button the window shows the same nine tabs, with the same Alt keys, as under the other games, and the Units sub-tab adds the GoH unit page. The pages read the Gates of Hell folder and its mods. A part of a page that cannot work for Gates of Hell stays in its place and says why in one line. ARSENAL never writes into the game's own files. In the Gates of Hell `mods` folder it writes into a mod folder it made itself, or a new one; a mod it did not make, and a Workshop item, only with Advanced on.

- **Mods**: the list reads the Gates of Hell `mods` folder, and the New mod card makes a Gates of Hell `mod.info`.
- **Upgrade or Port** shows every upgrade setting, with or without Advanced: `upgrade --to goh` makes a Gates of Hell copy of an Assault Squad 2 mod. The easy card "Upgrade an old mod to AS64" is not shown.
- **Check** reads the mod with the Gates of Hell rules, and its fix steps write a Gates of Hell patch mod (`fix --target goh`, [section 2](#in-gates-of-hell-1)). **Read Game.log** reads the log in the Gates of Hell user folder.
- **IDE**, **Models**, **Look & Sound**, **Maps**, **Map Viewer** and **Missions** open Gates of Hell files. Not available there: the Armor part of Models with the Shot tool (Gates of Hell works out armour in another way), the map test run, and "Add a game mode to this map" on Missions.
- **Game Modes & AI**: Game Modes reads the Gates of Hell mode cards and changes bot difficulty and start money, but "Allow bots in a mode" is not available. On Bots, the multiplayer settings work, but the bot shopping list, the bot match and the map orders are not available, because Gates of Hell has no `bot.data.lua` and its bots buy in `bot.main.lua` and `modes/*.lua`. Bot Doctrine refuses for the same reason. Unit AI works, but some settings cannot be changed for Gates of Hell yet. Map Scripts for AI is not available.
- **Units & Balance**: Units and Balance read the Gates of Hell unit cards and write into a Gates of Hell mod. Not available there: "Describe a new unit" (use "Add a unit (copy)") and the price calculator; a buy holds soldiers only and has no price or rank of its own. The GoH unit page brings a Gates of Hell vehicle into Assault Squad 2, with **Translate numbers** as a fold in its step 3; the result is an Assault Squad 2 mod.
- **Test, Share & Play**: Test Plan and the pair picker of Test Run work, and the editor run and prove cards say in one line why they cannot start (the GoH editor does not start the mission by itself, and Gates of Hell has no control pipe). Share works with the Gates of Hell `mod.info` range, packing and the Workshop uploader. Play is there, but ARSENAL does not start Gates of Hell or install into it.
- **Generator** targets Gates of Hell: `gen --target goh` ([section 2](#in-gates-of-hell-1)).
- The Quick Guided Task offers seven of its 27 tasks under GoH: "a mod" (make), "an old mod to 64-bit" (it makes a Gates of Hell copy), "a mod with problems (fix them)" (it only looks), "a unit from Gates of Hell", and the explore tasks "a mod", "what went wrong in the last run" and "what is possible". The others show grey with the reason.

None of these pages has been tried against a running Gates of Hell game; what they write for Gates of Hell is a start that you test in the game.

## 4. Commands behind the pages

Every page runs commands you can also type. These are the ones a modder uses most, beyond the front door. Each takes `--help`.

| Page | Commands behind it | Where they are explained |
|---|---|---|
| Mods (New mod card) | `new` | [The front-door commands](#the-front-door-commands) |
| Upgrade or Port | `upgrade` | [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md) |
| Generator | `gen` | [section 2](#gen-make-a-small-mod-from-a-spec-file) |
| Check | `check`, `fix` | [section 2](#2-the-front-door-check-fix-and-gen) |
| Read Game.log | `logtriage` | [chapter 18](18-testing-and-logs.md#9-letting-arsenal-read-the-log) |
| Play | `play`, `install`, `uninstall` | [chapter 18](18-testing-and-logs.md#9-letting-arsenal-read-the-log) |
| Test Run | `edrun`, `prove` | [section 6](#running-the-game) |
| IDE (the Editor) | `ide` | [section 3](#notepad-setup-unconfirmed) |
| Models | `soedit`, `armorsim` | below |
| Balance | `balance` | below |
| Units ("Describe a new unit") | `gen --describe` | below |
| Guides & External Tools | `gemindex` | below |
| Maps, Missions, Bot Doctrine | `maps`, `mission-clone`, `misdiff`, `milint`, `doctrine` | below, [section 9](#new-map-or-mode) |
| GoH unit (Units & Balance under GoH) | `donorpick`, `goh2as2`, `donorfit` | [section 9](#port-a-gates-of-hell-unit) |
| Share (Workshop) | `workshop` | [chapter 20](20-packaging-and-release.md) |
| Expert Tools | every tool; Diff runs `overdiff`, `misdiff`, `verdiff` and `conflicts`, Stat sheets runs `statsheet` | [section 6](#6-tool-families) |

The Quick Guided Task runs the same commands and `gen` ops from your answers.

### `soedit`: models in SOEdit

```
ARSENAL soedit locate
ARSENAL soedit stage <unit> --out <mod folder> --dry
ARSENAL soedit stage <unit> --out <mod folder>
ARSENAL soedit open <mod folder>/.arsenal/soedit/<model>.stage.json
ARSENAL soedit check <mod folder>/.arsenal/soedit/<model>.stage.json
```

- `locate` prints where SOEdit is. It looks at the path in the environment variable `ARSENAL_SOEDIT`, the `soedit` folder next to `ARSENAL.exe`, the copy `soedit install` downloaded, an installed ARSENAL, the folders on PATH, and your Desktop, Downloads and Documents (two folders deep). A copy found in the last places may be another build of SOEdit, and is started without the options only the ARSENAL build knows. It exits with 2 when there is none.
- `install` downloads SOEdit when it is not on this computer (the same as "Get SOEdit and open it"); `start` starts SOEdit without a model.
- `stage` is "Copy into my mod". It takes a unit name, a `.mdl` path or a game path, copies the model, meshes, volumes, animations and materials to the same paths in your mod, keeps files already there, and writes a stage record and untouched copies under `<mod folder>/.arsenal/soedit/`. Textures go to a view folder outside the mod (`--textures stage` copies them into the mod instead, `none` skips them). `--anm a,b` picks animations, `--no-anm` skips them. It refuses a target inside the game's own data.
- `open` starts SOEdit on the staged model, with the game folder, your mod and the texture view folder as its search paths. `--anm <file>` opens one animation with it.
- `check` is "Check what changed". It exits with 1 when something was lost or is missing.
- `ARSENAL soedit ops anim info <file.anm>` and the other `ops` change animations without SOEdit (`--dry` first); the first change keeps a `.bak` copy.

### `armorsim`: the armour simulator

```
ARSENAL armorsim table <unit>
ARSENAL armorsim shot <unit> --weapon "<gun name>" --ammo "<shell tags>" --range 500 --from 0,0
ARSENAL armorsim map <unit> --weapon "<gun name>" --ammo "<shell tags>" --range 500 --view front
ARSENAL armorsim edit <unit> --volume turret --side front --mm 60 --out <mod folder> --dry
```

`table` prints the thickness of every part and side, the rule that gave it and the file and line. `shot` fires one shot: `--from` is the direction, 0 straight from the front and 90 from the left side. `map` fires a grid of parallel shots from one view. `edit` is the only one that writes: it copies the unit's file into your mod and changes one number; a number shared with other parts needs `--shared`. `--folder <mod folder>` reads the armour with your mod laid over the game. Exit code 1 means a problem was found or the change was refused.

### `balance`: the buy panel as a table

```
ARSENAL balance <game folder> --folder <mod folder> --where "army=ger cls=tank" --sort -cost
ARSENAL balance <game folder> --group cls,army --of cost
ARSENAL balance <game folder> --odd
ARSENAL balance <game folder> --where "cls=tank" --change "cost pct 10" --plan
```

`--where` narrows the rows, `--sort` orders them (a minus sorts down), `--cols` picks columns, and `--sheet csv|md|json`, `--group`, `--pivot`, `--odd` and `--html <file>` are the views of the Balance page. `--change` with `--plan` shows what a change of all rows on show would write; the page writes it after you confirm.

### `gen --describe`: a new unit from words

```
ARSENAL gen --describe "fast Soviet heavy tank with a big gun, cost 900, called Molot" --target as64
ARSENAL gen --describe "fast Soviet heavy tank, cost 900" --target as64 --out <new mod folder> --plan
```

Without `--plan` or `--out` it prints what it understood, what it assumed, the plan and the spec, and writes nothing. `--save-spec <file>` keeps the spec so you can edit it and run `gen` on it later, and `--id` sets the new unit's id. `--ai` lets an AI model read the description: it needs your own key in the environment variable `ANTHROPIC_API_KEY` and sends the text and the list of game units to Anthropic.

### `gemindex`: the guide index

```
ARSENAL gemindex search armour penetration --game as2rel --tab guides --text
ARSENAL gemindex show <id or address> --around <word>
ARSENAL gemindex faq <words>
ARSENAL gemindex tools --game as2rel
ARSENAL gemindex gaps --lang en
ARSENAL gemindex export <words> --out links.csv --dry
```

Every command takes `--data <folder>`; without it the tool looks at `GEM_INDEX_DIR`, then at a `gemindex` folder next to the exe. Only `scrape` and `wayback` go online; `scrape --dry` lists what it would fetch and goes nowhere.

### Bots, maps and the Editor

```
ARSENAL doctrine list personas
ARSENAL doctrine gen --persona <persona> --out <mod folder> --plan
ARSENAL doctrine check <mod folder>
ARSENAL botrecipe <mod folder> --check
ARSENAL maps view --map multi/<map>
ARSENAL ide check <file>
```

`doctrine gen --plan` previews the bot settings a persona would give; without `--plan` it writes them into your mod's copy of `bot.data.lua`. `botrecipe` adds units to the bots' shopping list (`--buy-first <unit>`) and checks a bot file's shape (`--check`). `maps` has four subcommands: `list`, `view`, `clone` and `mode`.

## 5. Flags many tools share

| Flag | What it does |
|---|---|
| `--game <dir>` | The game folder, so the tool can compare with vanilla data. |
| `-q` | Quiet: hide informational findings. |
| `--summary` | A short table of finding codes with counts instead of every line. |
| `--json` | Machine-readable output, for scripts. |
| `-o <file>` | Write the report to a file (`statsheet`, `balance`). |
| `--dry-run` / `--dry` / `--plan` | Show what would be written and write nothing. The word differs by tool: `--dry-run` for `newmod`, `clone-entity`, `patch-entity`, `lng-add`; `--dry` for `packer`, `testrun`, `soedit`, `armorsim edit`, `install`; `--plan` for `gen`, `map-clone`, `doctrine gen`, `balance --change`. |

To see a tool's arguments, run `ARSENAL --all` (every tool with its argument line) or `ARSENAL <tool> --help` (`-h` works too). `--help` prints the usage and exits 0 without reading the game or writing anything, for every tool except `clone-entity`, `goh2as2`, `mapport` and `edrun`: run those with no arguments to get the usage line.

### Errors, warnings and information

A finding whose code starts with `WARN_` is a warning: the tool suspects a problem, but the rule is not confirmed in the game. Any other code is an error, a confirmed rule. Information lines are notes. Many tools exit with a non-zero code when they find something: `build` exits 1 on an error, and `gen`, `map-clone`, `patch-entity` and `place-entity` exit 1 when a name or key is unknown. That matters when you chain tools in a script.

### In Gates of Hell
<!-- goh: none; ARSENAL flags (check, gen, upgrade, sdllint headers) -->

Three flags carry Gates of Hell through the tools that know it:

| Flag | What it does |
|---|---|
| `--goh <dir>` | The Gates of Hell game folder, read only (`check`, `gen`, `upgrade`, the porting tools). |
| `--target goh` | Write or judge for Gates of Hell (`check`, `gen`, `upgrade --to goh`). |
| `--exe goh` | Which builds `check` and `sdllint` give a verdict for (`check --exe as64,mowas2,goh`). |

Some linters also notice when the game folder they are given is a Gates of Hell install (section 6).

## 6. Tool families

### Syntax and data checkers

```
ARSENAL sdllint <mod folder> --summary
ARSENAL keylint <mod folder> --game <game folder> --summary
ARSENAL lnglint <mod folder> --summary
ARSENAL modinfo <mod folder>
```

| Tool | What it checks |
|---|---|
| `sdllint` | Raw SDL syntax: brackets, strings, includes, macro parameters, encoding such as a UTF-16 byte-order mark. [Chapter 5](05-sdl-language.md). |
| `keylint` | Key names and value types in entity and set files. [Chapter 6](06-data-keys-entities.md). |
| `lnglint` | Localization files: encoding, braces, duplicate keys. [Chapter 14](14-localization.md). |
| `modinfo` | The `mod.info` file: keys, version range, `Require`. It reports a name that differs from the folder name as information. [Reference 1](r01-mod-info-and-folder.md). |
| `binhdr` | Binary model, animation, volume and texture headers, so a corrupt or wrong-format asset is caught before the game crashes on it. |
| `refcheck` | References (models, sounds, animations, materials, sub-entities) that point to nothing. |

These linters also exist, and `check`, `doctor` and `build` run them for you: `humlint` (infantry, [8](08-infantry-and-humans.md)), `movlint` (movement, [7](07-units-vehicles-movement.md)), `ialint` (interaction scripts, [11](11-interaction-scripts.md)), `milint` (missions and presets, [12](12-missions-and-multiplayer-setup.md)), `uilint` ([15](15-interface-and-icons.md)), `fxlint` ([16](16-effects-sound-models.md)), `strlint`, `loccover` ([14](14-localization.md)) and `expcheck` (limits of the model exporter).

`refcheck` and `binhdr` have two ways to point at a mod. For a folder outside `<game folder>/mods`, use `--folder`:

```
ARSENAL refcheck <game folder> --folder <mod folder> --summary
ARSENAL binhdr <game folder> --folder <mod folder> --summary
```

For a mod that sits in `<game folder>/mods/mymod`, use `--mods mymod --scope mod`. With a mod outside `mods`, `--mods` stops with "named mod(s) did not mount".

### The virtual file system

The game merges pak files, loose files and mods into one virtual file system ([chapter 4](04-vfs-paks-patches.md)). `vfs` asks it questions:

```
ARSENAL vfs <game folder> which set/stuff/gun/88mm_flak37
ARSENAL vfs <game folder> --mods mymod shadowed --list
```

The first prints the winning file for that path, the build and the mode. The second lists every file your mod hides.

`modswitch --game <game folder>` shows the active mod list from your profile; `--set`, `--write` and `--restore` change it. It prints the profile path, so do not paste its output into a public post.

`mpsync --mod <mod folder> --game <game folder>` shows which of your files the multiplayer lobby compares by content, which only by size, and which not at all. It needs the mod under `<game folder>/mods`. `conflicts --game <game folder> --mods a,b` lists the files and values two mods both change; the later mod wins. `--itm` lists the files of a mod that are identical to the game's, and `--clean <mod> --out <dir>` writes a copy of the mod without them (Expert Tools in Tools & Settings > Other Tools calls this "Mod to clean").

### Authoring helpers

They write only into your mod folder. Run each with its dry flag first.

```
ARSENAL newmod <new folder> --name "My Mod" --target as64 --game <game folder> --dry-run
ARSENAL clone-entity --game <game folder> --out <mod folder> --entity <vanilla unit> --as <new name> --dry-run
ARSENAL patch-entity <mod folder> --game <game folder> --entity <unit> --set key=value --dry-run
ARSENAL lng-add <mod folder> --file "#mymod.lng" --key desc/entity/new --text "Text" --dry-run
ARSENAL lng extract <mod folder> --out texts.tsv
```

- `newmod` lists `mod.info`, a `.lng`, `.gitignore`, `readme.txt` and three empty folders. `--target as64` makes the `mod.info` a modern one (`MinGameVersion "3.301"`, no maximum) so it loads beside `as64+`; without it (and without `--deps as64+`) the range is the legacy 3.262 one. `ARSENAL new` does the same with the modern range by default.
- `clone-entity` prints the whole new `.def` it would write, plus notes: the clone has no destroyed variant unless you clone `<name>_x` too, and its model files stay in the base folder unless you add `--copy-assets`.
- `patch-entity` copies the unit's file into your mod and changes one key. With a key that does not exist it stops ("use --add to create it") and writes nothing. It makes a full copy of the file, which then hides later updates to the original.
- `lng-add` adds one text key. `lng extract` writes a translation table of a mod's texts, and `lng merge` writes the translated table back into a new folder ([chapter 14](14-localization.md)).
- Also: `mission-clone`, `map-clone`, `place-entity` (section 9), `packer` ([chapter 20](20-packaging-and-release.md)).

### Comparison and reporting

```
ARSENAL statsheet <game folder> --sheet price -o before.md
```

`statsheet` writes tables of weapon, ammo, armour and price numbers (`--sheet weapons,ammo,armor,price` or `all`; `--fmt md|csv`). Run it before and after a change and the two files are your balance diff. `balance` (section 4) shows the buy panel in more views.

### `doctor` and `build`

```
ARSENAL doctor <mod folder> --game <game folder>
ARSENAL doctor <mod folder> --game <game folder> --release
ARSENAL build <mod folder> --game <game folder>
```

- `doctor` runs every applicable linter and prints one line per tool, with the first finding of each code. On a mod outside `mods` it says the mod is not mounted and reads it loose.
- `build` is the gate: it runs `modinfo`, `sdllint`, `keylint` and the other linters, `refcheck`, `lnglint` and `loccover`, then plans the paks. Any error stops the pack. `refcheck` needs the mod under `<game folder>/mods`, so put it there first.
- `doctor --release` is the ship checklist ([chapter 20](20-packaging-and-release.md)). It flags stray files such as `readme.txt` and `.gitignore` that would upload with the mod.

### Running the game

`play` (the front door) and the Play page start a test match and read the log. `logtriage` reads `game.log` and the crash files. `testrun` drives the 64-bit build through its control pipe. All three are in [chapter 18](18-testing-and-logs.md). `edrun` and `prove` start the editor or the game for longer unit tests; run them only when you mean to.

### In Gates of Hell
<!-- goh: none; ARSENAL linters (sdllint, keylint, lnglint, modinfo, refcheck headers) -->

- `keylint` uses a Gates of Hell key list when `--game` points at a Gates of Hell install, and `sdllint` takes Gates of Hell forms that vanilla Gates of Hell files use and the Assault Squad 2 rules would call errors; it reports them as information.
- `lnglint` also reads Gates of Hell texts in gettext form (`.po`, `.pot`, loose or inside the mod's paks): the key is the `msgctxt`, the shown text is the `msgstr`, or the `msgid` when `msgstr` is empty.
- `modinfo` checks a Gates of Hell `mod.info` against the Gates of Hell version gate and its `{tags}` key (one quoted string of words).
- `refcheck` names the Gates of Hell armour keys `overmatchcalibre`, `highhardness` and `caststeel` when they turn up in an Assault Squad 2 mod: the Assault Squad 2 engine does not read them.
- `keylint` reads a Gates of Hell mod folder that is not under a `mods` folder (a Workshop mod made of paks) from its own paks.
- `play`, `testrun`, `logtriage` and the other run tools work with Assault Squad 2 only.

## 7. A recommended order

Cheap checks first, expensive ones last:

1. `ARSENAL check <mod folder> --fast -q`, or the Check page: does it load, statically?
2. `modinfo`, `sdllint`, `keylint`: is the mod valid and are the files well formed?
3. `refcheck --folder`: do all the references resolve?
4. `lnglint`: are the texts valid?
5. `doctor` or `build`: the whole gate in one go.
6. The game, then `logtriage` or Mods > Check & Fix > Read Game.log ([chapter 18](18-testing-and-logs.md)).
7. Play it yourself. No tool replaces that.

## 8. Reading findings

A finding line has a severity, a code, a file and line, and a message. Start with `--summary` to see which codes dominate. Fix errors before warnings. For a warning you cannot confirm, test it in the game before you act on it.

When you check a mod that borrows heavily from vanilla, expect some background noise: information lines about vanilla data itself (speed order, omitted turn times, and similar). A finding that was not there before your change is the one to chase.

## 9. Workflows

Replace `G` with your game folder and `M` with your mod folder under `G/mods`.

### New unit

```
ARSENAL newmod M --name "My Mod" --target as64 --game G --dry-run
ARSENAL clone-entity --game G --out M --entity <vanilla unit> --as <new name> --dry-run
ARSENAL keylint M --game G --summary
ARSENAL refcheck G --folder M --summary
ARSENAL doctor M --game G
ARSENAL build M --game G
```

Read what the dry runs would write, then run them again without the flag. Add missing name and description texts with `lng-add`. Then test in game. In the window the same job is the Units page ("Add a unit (copy)" or "Describe a new unit"). See [chapter 6](06-data-keys-entities.md) and [Add a new unit](p03-add-a-unit.md).

### Rebalance

```
ARSENAL statsheet G --sheet price -o before.md
ARSENAL patch-entity M --game G --entity <unit> --set <key>=<value> --dry-run
ARSENAL statsheet G --sheet price -o after.md
ARSENAL mpsync --mod M --game G
```

`before.md` and `after.md` are your change list. The Balance page and `ARSENAL balance` show the whole buy panel at once. See [chapter 17](17-balance-pricing-gameplay.md).

### Change armour

```
ARSENAL armorsim table <unit> --folder M
ARSENAL armorsim edit <unit> --volume <part> --side front --mm 60 --out M --dry
ARSENAL armorsim map <unit> --folder M --weapon "<gun name>" --ammo "<shell tags>" --range 500 --view front
```

Read the table first: a nonzero number in the unit's armour macro wins over a thickness written on a part ([chapter 9](09-weapons-ammo-damage.md)).

### Edit a model

```
ARSENAL soedit stage <unit> --out M --dry
ARSENAL soedit stage <unit> --out M
ARSENAL soedit open M/.arsenal/soedit/<model>.stage.json
ARSENAL soedit check M/.arsenal/soedit/<model>.stage.json
```

Then `ARSENAL check M` and a look in the editor or a test match ([chapter 16](16-effects-sound-models.md)).

### Port a Gates of Hell unit

In the window, Units & Balance under GoH does this step by step. The commands are `donorpick` to choose the donor, `goh2as2` with `--donor`, then `donorfit`, then `install`. The conversion output holds Gates of Hell models and textures, so keep it on your machine. See [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

```
ARSENAL donorpick --goh "<GoH mod folder>" --game G --entity <unit>
ARSENAL goh2as2 --goh "<GoH mod folder>" --entity <unit> --donor <as64 vanilla unit> --rep-key --pull-props --mtl-fallback --match-weapon --game G --out OUT --dry-run
ARSENAL goh2as2 --goh "<GoH mod folder>" --entity <unit> --donor <as64 vanilla unit> --rep-key --pull-props --mtl-fallback --match-weapon --game G --out OUT
ARSENAL donorfit OUT/resource/entity/<unit>/<unit>.def --game G --fit --write --in-place --moddir OUT
ARSENAL install OUT --name <modname> --game G --dry
ARSENAL install OUT --name <modname> --game G
```

- `OUT` is a new folder outside both game folders; `goh2as2` refuses an `--out` inside an install. `--donor` needs exactly one `--entity`, plus `--game`. With `--rep-key` the `.def` for `donorfit` is named after your unit and sits in its own folder: `OUT/resource/entity/<unit>/<unit>.def`.
- `donorpick` picks a donor of the same class, the same kind of drive (tracked or wheeled), the nearest main-gun calibre, the nearest armour and the nearest crew count. A unit it cannot place is reported as unplaced, never guessed.
- With `--donor`, `goh2as2` translates speed, turn, mass, fuel, armour and crew values to Assault Squad 2 scale. In a terminal it stops to ask about each value outside the usual range; add `--no-ask` to write the translated values without questions, or `--no-translate` to skip the translation.
- `install` copies `OUT` into `G/mods/<modname>` and marks it as its own (`--link` makes a folder link instead; `--dry` prints where it copies from and to and writes nothing; it refuses to overwrite a folder it did not create unless `--force`). Then activate the mod after `as64+` and test it in the game.

### New map or mode

```
ARSENAL map-clone --game G --map map/multi/<map> --name <new> --out M --plan
ARSENAL mission-clone --game G --map map/multi/<map> --from <mode> --to <mode> --out M --list
ARSENAL mapview --game G --map multi/<map> --width 60
```

`map-clone --plan` lists the files it would copy with their sizes, the lobby name file and a `mod.info`. `mission-clone --list` shows the modes the map has. `mapview` draws the ground as characters. Remove `--plan` or `--list` to write. Whether a cloned map loads and shows in the lobby needs a game test. `place-entity --pos` takes map units (20 per metre); the Maps page takes metres and converts. See [chapter 12](12-missions-and-multiplayer-setup.md) and [chapter 13](13-maps.md).

### Release

```
ARSENAL doctor M --game G --release
ARSENAL packer M --dry
ARSENAL release-check --publish M
```

The details are in [chapter 20](20-packaging-and-release.md).

Gates of Hell guard: `packer` and `release-check --publish` refuse (exit 1, `PACK_GOH_ORIGIN`, `PACK_GOH_RENAMED`, `PACK_PRIVATE`) a mod whose `GOH-ORIGIN.tsv` lists a file still holding its ported Gates of Hell bytes, under its own or another name; `packer --allow-private` packs it anyway as `<role>-PRIVATE.pak` for your own machine only, never to publish.

`packer M --out <folder>` (also with `--package`, `--goh`) writes the paks in the speed layout by default, the "Pack for speed" box of the Share page: text and map `.net` and `.grs` files compressed, everything else (textures, sounds, models, animations) stored, and the text entries first in each pak, then the rest in path order; the report adds the info line `PACK_SPEED_LAYOUT`. `--no-speed` (the box unticked) writes them as before: only text compressed, files in folder order.

## Claude: skills and MCP servers

ARSENAL can be used through Claude as well as through the window and the commands. Two MCP servers give Claude the tools of this chapter as calls, and a set of skills tells Claude which tool and which rule of the game fit a question. [Work with Claude](p18-work-with-claude.md) is the page for it; this section says how the parts sit together.

- **`arsenal`** (`node tools/mcp/server.js`) wraps the commands of this chapter: the lookups, `check` and `fix`, `gen`, the clash finder and its patch mod, the armour simulator, the buy panel table, the log reader, and the tools that start the game. Every tool takes the game, `as64`, `mowas2` or `goh`.
- **`arsenal-gui`** (`node tools/mcp/gui.js`) talks to the running window. Its tools (`gui_status`, `gui_pages`, `gui_routes`, `gui_call`, `gui_jobs`, `gui_open`, `gui_lang`, `gui_start`) are made from the window's own list of pages and routes.
- **Skills** are folders under `.claude/skills`: sixteen for modding (`mow-mod-...`), six for playing (`mow-play-...`), `mow-robz` for RobZ Realism, `mow-games` for the differences between the three games, and two for the window (`arsenal-gui-use`, `arsenal-gui-dev`). Each is a short index plus one small file per sub-task.
- **Help & Docs > Claude** in the window offers every skill and tool group as its own download, the pack groups and the full pack, and installs them into Claude Code or Claude Desktop after a preview. The command behind it is `node tools/mcp/pack/pack.js`.
- **Groups.** The tools of `arsenal` sit in fourteen small groups; `--groups a,b` starts the server with only those.

Both servers only read until you allow more: `ARSENAL_WRITE_ROOTS` lists the folders that may be written, `ARSENAL_ALLOW_LAUNCH=1` lets the game be started. `tools/mcp/install.md` has every setting and `tools/mcp/CATALOG.md` lists every tool and skill.

The list is kept current by a command, not by hand. After a page, a route or a tool is added or renamed:

```
node tools/mcp/catalog.js
```

It writes the window tool list and `CATALOG.md` again. `sh tools/mcp/test/run.sh` fails while either is out of date.

### In Gates of Hell

Not tested in a running Gates of Hell game. The same servers and skills serve it with `goh`; a tool that Gates of Hell can not use says why in its answer.

## 10. What the tools cannot catch

- Anything that depends on how the engine behaves at runtime: balance, feel, pathfinding, whether an effect looks right.
- Part of what a hit does inside a vehicle. The armour simulator follows thickness, slope and penetration, and its "Behind the armour" panel follows the shot past the plates: the parts and crew it reaches, blasts, a HEAT jet, fire from the shell, and the unit's own scripts, with the chance of each result over many repeated runs. It does not follow the flight of a shell after a ricochet, and it lists the script parts it skipped and the questions a script asks that one shot cannot answer; those, and how the result looks and feels in a real match, show only in the game ([chapter 9, section 11](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window)).
- Rules that are still unconfirmed. Their findings are warnings, and the absence of a warning is not proof.
- Same-size binary edits in multiplayer. The lobby only compares those files by size; only a real two-machine test shows a desync.
- Wrong but valid values. A tank with 5000 mm of armour is well-formed.
- Your own encoding mistakes in an editor after the tool ran. Text data files use CRLF line endings, and the 64-bit build reads string values as UTF-8 in data and `.lng` files alike; old cp1251 bytes survive only inside `;` comments of original files. Re-run `lnglint` and `sdllint` after editing.
- Content made in other programs: models, textures, sounds and animations come from their own tools (Help & Docs > Guides & External Tools lists guides for each).

## Appendix: porting from Gates of Hell

Gates of Hell and Assault Squad 2 share an ancestor, so the file formats look similar. The data does not translate one to one. The main points:

- **Gates of Hell data is formula-driven; Assault Squad 2 data is table-driven.** A Gates of Hell unit calls macros with real-world numbers. In Assault Squad 2 the engine keys are written by hand.
- **Match units by name, not stats.** Exact name matches are reliable. For towed guns, mortars and soft vehicles the names usually differ, so match by calibre and model by eye.
- **The port uses a donor.** `goh2as2 --donor` writes the AS64 donor unit's definition with the Gates of Hell model in place, and `donorfit` drops or renames parts the model lacks. The donor's armour is used, not the Gates of Hell plates: the tool warns `WARN_PORT_ARMOUR` when they differ.
- **Penetration tables** copy their numbers unchanged, but the distance points differ, and the table must sit in a block whose ammo tags match the shell exactly.
- **Speeds are not the same scale.** Tuned Assault Squad 2 top speeds run at roughly two thirds of the Gates of Hell figure (unconfirmed, tune in game).
- **Some features have no equivalent**, and their strength is lost.
- **Encoding**: both games read string values as UTF-8 (the 64-bit Assault Squad 2 build included), so `goh2as2` keeps strings UTF-8 and only changes line endings to CRLF. `.lng` files stay UTF-8.
- **Assets must pass `binhdr`.**
- **Gates of Hell content can never be shared.** It stays on your machine; the release tools refuse it.

Test every ported unit in the game and read the log ([chapter 18](18-testing-and-logs.md)).

<!-- internal -->


<!-- /internal -->

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

This chapter is about ARSENAL, so its Gates of Hell notes say what the tools do for a Gates of Hell mod. How Gates of Hell data differs from Assault Squad 2 data is in the [appendix](#appendix-porting-from-gates-of-hell) and in the Gates of Hell summaries of the other chapters.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. Getting ARSENAL and running it | [differs](#in-gates-of-hell) | the Gates of Hell folder is found through Steam, `--goh`, `GOH_GAME` or `as2.json`; never written |
| The front-door commands | [differs](#in-gates-of-hell-1) | `check`, `gen` and `upgrade` take a Gates of Hell target; `play`, `install` and `maps` are Assault Squad 2 only |
| 2. The front door: `check`, `fix` and `gen` | [differs](#in-gates-of-hell-1) | Gates of Hell verdict; `fix --target goh` skips seven Assault Squad 2 fixes; `gen` writes `.pot` texts and Gates of Hell squad files |
| 3. The pages of the window | [differs](#in-gates-of-hell-2) | GoH button: the same nine tabs plus the GoH unit page; some parts say "Not available"; seven guided tasks |
| 4. Commands behind the pages | same as far as mapped | `soedit`, `armorsim`, `balance`, `gemindex` and `doctrine` work on Assault Squad 2 data |
| 5. Flags many tools share | [differs](#in-gates-of-hell-3) | `--goh`, `--target goh`, `--exe goh` |
| 6. Tool families | [differs](#in-gates-of-hell-4) | linters know Gates of Hell keys, gettext texts, `mod.info` and Workshop paks; run tools are Assault Squad 2 only |
| 7. A recommended order | same as far as mapped | the same order; there is no game step under the GoH button |
| 8. Reading findings | same as far as mapped | Gates of Hell forms show as information, not errors |
| 9. Workflows | [differs](#port-a-gates-of-hell-unit) | the port workflow brings a Gates of Hell unit into Assault Squad 2; the release tools refuse ported Gates of Hell files |
| Claude: skills and MCP servers | [differs](#in-gates-of-hell-5) | the same servers and skills take `goh`; a tool Gates of Hell can not use says why |
| 10. What the tools cannot catch | same as far as mapped | no Gates of Hell result of the tools has been tried in a running Gates of Hell game |
| Appendix: porting from Gates of Hell | [the appendix](#appendix-porting-from-gates-of-hell) | how the data of the two games differs when you port |

## Pitfalls

- A clean run is not proof the mod works. `check` says `LOADS_STATIC`, and `gen` says `untested`: both mean what they say.
- `build` and `refcheck --mods` need the mod mounted under `<game folder>/mods`. Outside it, use `check` or `--folder`.
- `gen --out` is the mod folder itself, not its parent.
- Mods for the 64-bit build must declare the modern minimum game version or they will not load beside the Enhanced extras ([chapter 3](03-mod-folder-and-load-order.md)).
- A model saved in SOEdit can lose settings it does not know. Press "Check what changed" (or run `soedit check`) after every save.
- An armour number shared by several parts or units changes all of them. Read the list the Armor part shows before you confirm.

Next: [Chapter 20, Packaging and release](20-packaging-and-release.md).
<!-- Author: Imperator_Aug (ARSENAL, ia-e747cfae) -->
