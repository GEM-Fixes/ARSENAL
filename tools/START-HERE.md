# START HERE

A.R.S.E.N.A.L (All-in-one Resource SDK for Engine Assets & Levels) by Imperator_Aug (credits: CREDITS.md). Command `ARSENAL`; the old name `as2` is the same command. Lint before you launch, launch before you trust.

**Join The AS64 Community!** https://discord.gg/pgmfaaBVbf

It makes, checks and tests mods for three games: Men of War: Assault Squad 2 in the 64-bit build (`as64.exe`, the default, game word `as64`), the classic Men of War: Assault Squad 2 (`mowas_2.exe`, game word `mowas2`) and Gates of Hell (game word `goh`). Name the game with `--target <game>` on a command (`check`: `--exe`, `upgrade`: `--to`); with no game named, everything is for AS64. It never writes the game's own files: it writes only into the mod folder you name and, for `install`, into the Assault Squad 2 `mods` folder. It never writes into the Gates of Hell install.

## Which download

| Download | What is in it | Needs |
|---|---|---|
| `ARSENAL-<version>.zip` | `ARSENAL.exe` with Node.js inside (double-click it for the window), `ARSENAL-gui.cmd` and the installer `Install-ARSENAL.cmd` | Windows 10 or 11, 64-bit. Nothing else to install. |
| `ARSENAL-<version>-small.zip` | the same tools as plain files, plus four start files: `ARSENAL.cmd` and `ARSENAL-gui.cmd` (Windows), `arsenal` and `arsenal-gui` (Linux and macOS) | Windows, Linux or macOS. Node.js is fetched on the first start (see below). |
| `ARSENAL-<version>-ww2.zip` | the full download plus the historical sources database | as the full download, and about 1 GB more disk space |
| `ARSENAL-<version>-small-ww2.zip` | the small download plus the historical sources database | as the small download, and about 1 GB more disk space |

All four carry the same tools, the guide, the guide index and the list of Second World War sources. The two `-ww2` downloads add the database that lets the Historical Sources page (tab Help & Docs) search the text inside the documents; without it you get the list of sources with their links.

The engine technical document is a separate download, `ARSENAL-engine-docs-public-<version>.zip`, published beside these. It explains how the engine of the 64-bit build works, subsystem by subsystem, for modders and tool authors. You do not need it to use ARSENAL. To read it in the window, unzip it and copy its `techdoc` folder into the ARSENAL folder, then open Help & Docs > Docs and pick the part Engine.

The small download's first start: the start file looks for Node.js in this order: the program named in the environment variable `ARSENAL_NODE`, a copy it fetched before, a Node.js 26 or newer that is already installed, and only then downloads Node.js 26.13.0 from nodejs.org. It checks the download against the checksum written in the start file and keeps only the node program. The copy goes into a `node` folder next to the start files, or, when that folder cannot be written, into your user folder (`%LOCALAPPDATA%\ARSENAL\node` on Windows, `~/.local/share/arsenal/node` on Linux, `~/Library/Application Support/ARSENAL/node` on macOS). After that no internet is needed. On Windows the download uses `curl`, `tar` and `certutil`, which Windows 10 version 1803 and newer have; on Linux and macOS it needs `curl` or `wget`, and `sha256sum` or `shasum`.

## What you need

- For the full download: Windows 10 or 11, 64-bit. `ARSENAL.exe` does not start on Windows 7, 8 or 8.1, or on 32-bit Windows.
- For the small download: one of the systems in the table below, and an internet connection the first time, unless Node.js 26 or newer is already installed.
- About 300 MB of disk space, about 1.3 GB for a `-ww2` download. No administrator rights.
- The folder you unzip into may be read-only (for example under `Program Files`): caches go to your user folder (see section 7).
- A web browser for the window. It opens in your default browser and talks only to your own computer. The 3D model view needs WebGL; without it the page shows the model as text.
- Men of War: Assault Squad 2 for `check` against the game's files, `install` and `play`. `play` starts only the 64-bit build (`as64.exe`); for the classic `mowas_2.exe` it prints the plan with `--dry` and does not start it, because that exe has no control pipe and no game instances. With no game installed, the tools that only read a mod folder still work.
- An internet connection only for: the small download's first start, updating the guide index from the web, the optional AI in `gen`, and the game version check in `release-check`. The AI needs your own API key.
- Gates of Hell for the port tools and for Gates of Hell mods (`new`, `gen`, `check`, `upgrade`, `maps` with `--target goh`). ARSENAL does not install into Gates of Hell or start it: `install`, `uninstall` and `play` say so in one line and stop.
- SOEdit is not needed: the Models page (tab Models & Sim) edits models and animations itself. SOEdit is not included: if you still want the SOEdit program, the Models page ("Get SOEdit and open it") or `ARSENAL soedit install` downloads its latest release from GitHub (https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy/releases). It needs a graphics driver with OpenGL.

## What works where

| | Windows | Linux | macOS |
|---|---|---|---|
| Check, build, pack and compare tools | yes | yes, not tried yet | yes, not tried yet |
| The window (`ARSENAL-gui`) | yes | yes, not tried yet | yes, not tried yet |
| Start the game, `play` and test runs | yes | no | no |
| Find the game install by itself | yes, through Steam | yes, through Steam, not tried yet | yes, through Steam, not tried yet |
| Find the game's profile folder and `game.log` | yes, also when Documents was moved to another drive or to OneDrive | inside the Steam Proton folder of the game, not tried yet | no: the game does not run on macOS |

The Linux and macOS support is written but has not been tried on a real machine yet. On those systems use the small download. A plain Wine folder outside Steam is not searched; give the game folder with `--game`. On Linux a few tools may miss a file whose name differs from the data only in capital letters. A command that only works on Windows says so in one sentence and stops.

Things that can go wrong on some computers:

- Windows may warn about the unsigned exe or start file the first time you start it.
- `install --link` needs the mod and the game on a local NTFS drive.

## 1. Run it

Install (Windows, both downloads, optional): double-click `Install-ARSENAL.cmd` in the folder you unzipped. It copies ARSENAL to a folder you pick (default `%LOCALAPPDATA%\Programs\ARSENAL`, no administrator rights), gets Node.js for the small download, checks the browser, the game and the cache folder, and makes a Start menu shortcut to the window. `Uninstall-ARSENAL.cmd` in that folder removes it again. `Install-ARSENAL.cmd --dry` shows every step and changes nothing; `--dir <folder> --no-shortcuts` installs without questions. You can also skip installing and run ARSENAL from the unzipped folder.

Full download: double-click `ARSENAL.exe` (or `ARSENAL-gui.cmd`) for the window. For commands open a command prompt in the folder; wherever this page says `ARSENAL`, type `ARSENAL.exe` with the command after it. `ARSENAL.exe` typed alone opens the window too.

Small download: on Windows type `ARSENAL.cmd` instead, and double-click `ARSENAL-gui.cmd` for the window. On Linux and macOS open a terminal in the folder and type `./arsenal` (the window: `./arsenal-gui`). If your unzip program dropped the run permission, type `sh arsenal` instead.

From a source checkout, `ARSENAL` means `node tools/as2/as2.js`.

`ARSENAL help` lists the commands. `ARSENAL <command> --help` prints the options of one command and writes nothing.

## 2. Pick the game folder

The tools find your Assault Squad 2 folder through Steam. See what they found:

```
ARSENAL game
```

If it prints nothing useful, or the wrong folder, tell the tools yourself, on any command:

```
--game "<your Men of War Assault Squad 2 folder>"
```

or set the environment variable `AS2_GAME` to that folder, or put a file `as2.json` containing `{"game": "<folder>"}` in the folder you run the command from (or any folder above it). The folder is the one that holds `as64.exe` (or `mowas_2.exe`) and the `mods` folder. AS64 and the classic game share this one folder.

The Gates of Hell folder is found the same way: the command `game` with `--kind goh` shows it. Set it with `--game "<your Gates of Hell folder>"` on a `--target goh` command, the environment variable `GOH_GAME`, or `{"goh": "<folder>"}` in `as2.json`.

## 3. The front-door commands

Copied from `ARSENAL help`:

| Command | What it does |
|---|---|
| `new` | make an empty mod folder (AS64 by default, --target mowas2\|goh; lowercase folder name) |
| `gen` | make mod content (units, text, settings) from a spec file |
| `check` | read a mod and say whether it would load, crash or be refused (does not start the game) |
| `fix` | plan or write a patch mod that fixes text and reference errors check found |
| `upgrade` | bring an older mod up to AS64, or port it to MoW:AS2 or GoH; the source is never written |
| `install` | copy (or link) a mod folder into the game's mods folder (AS64 and MoW:AS2) |
| `uninstall` | remove a mod that ARSENAL install put there |
| `play` | install a mod and start a test match, then say if it loaded cleanly (AS64; MoW:AS2 --dry) |
| `maps` | multiplayer maps: list, view, clone, add a game mode |

More tools: `ARSENAL advanced`. Every tool: `ARSENAL --all`. One example per command is in chapter 19 of the guide.

## 4. One worked path: new, check, play

```
ARSENAL new mymod --name "My Mod"
ARSENAL check mymod
ARSENAL play mymod --dry
ARSENAL play mymod
```

1. `new` makes the folder `mymod` (lowercase) in the folder you are in, with a `mod.info` for AS64.
2. Put your files in it (the guide, chapters 1 to 6, says what goes where). `gen` can write content from a spec file: `ARSENAL gen spec.yaml --target as64 --out mymod` (a sample spec: `ARSENAL gen --sample`; `ARSENAL gen --sample list` names the others).
3. `check` prints findings by severity and a verdict per game build. `LOADS_STATIC` means no known crash pattern was found. It never means the mod works. The exit code follows the mod's own target build (AS64 by default; `--target mowas2` or `--target goh` to change). Exit code 0 is `LOADS_STATIC` for that build; 1 is `LIKELY_CRASH` or `REFUSED` for it. The other builds' verdicts are printed as info and do not change the exit code.
4. `play --dry` prints every step and changes nothing. Read it. `play` then checks the mod, installs it, starts the game on a test map and tells you from `game.log` whether it loaded cleanly (BOOT). It uses game instance 1, never instance 0, which is your own settings.
5. Look at it in the game yourself. A clean BOOT is not proof the mod does what you meant.

Fixing and upgrading, when `check` finds problems or you have an old mod:

```
ARSENAL fix mymod plan
ARSENAL upgrade oldmod --to as64 --plan
```

`fix plan` writes nothing; `apply --out <patch folder>` writes a separate patch mod. `upgrade --plan` previews; the source folder is never written. Both are previews until a game test proves them; read the output before you trust it.

## 5. In the game

The game wants the 64-bit build. In Options, MODS tab, the modern Enhanced extras `as64+` must be active, listed before your mod (a mod with MinGameVersion 3.301 needs it). `play` sets that list for its test run and restores it afterwards.

The classic `mowas_2.exe` has no `as64+`: a mod made with `--target mowas2` (MinGameVersion 3.262.0, MaxGameVersion 3.262.1) is listed alone. `play` picks this game by itself when the mod's MaxGameVersion is 3.262; `--target as64` overrides that.

## 6. Where the logs are

- `play` prints the BOOT verdict and reads the game's `game.log` for you.
- The game's own log is `game.log` in the `log` folder under your Documents folder, in `My Games\Men of War - Assault Squad 2\` (instance N: `... - instance N`). The tools find it also when Documents was moved to another drive or to OneDrive. It is overwritten every time the game starts: copy it before you relaunch. AS64 and the classic game write to the same folder.
- Gates of Hell writes its `game.log` to the `log` folder of its own user folder (`My Games\Gates of Hell` under Documents, or `%LOCALAPPDATA%\digitalmindsoft\gates of hell` when Documents is on OneDrive); `logtriage` with `--exe goh` and no folder finds it by itself.
- `ARSENAL logtriage` reads a log folder or a single `game.log` and sorts it into findings and known noise. Guide chapter 18 explains it.

## 7. Undo

- `ARSENAL install mymod` copies the mod into the game's `mods` folder and marks it as its own. `ARSENAL uninstall mymod --yes` removes it, and only a folder `install` made; the game's own files and your source folder stay as they were. `--dry` on either shows the step and changes nothing.
- `fix apply --out` and `upgrade --out` write a new folder: delete that folder to undo.
- Your own settings (instance 0) are not touched by `play`.
- The tools keep their caches in your user folder: `%LOCALAPPDATA%\ARSENAL\cache` on Windows, `~/.cache/arsenal` on Linux, `~/Library/Caches/ARSENAL` on macOS. Set the environment variable `ARSENAL_CACHE` to a folder to use that one instead. Delete the cache any time; it is built again when needed.

## 8. More

- Guide (in this zip, and on the Docs page of the window): Part I has one page per job, Part II has 22 chapters on how each area works, Part III lists every key and function. Start with Part I page 1, then chapters 18 (testing and logs) and 19 (the commands).
- The Models page of the window (tab Models & Sim) edits models and animations itself: skeleton, volumes, meshes and materials, animations with a timeline, and a 3D view with handles to move, turn and scale. Save shows the list of files first and writes only into your mod folder; the game's own files are not written. Guide page "Edit a model or an animation" has the steps.
- SOEdit, the model and animation editor, is not in this zip. It is optional: the Models page downloads it when you press "Get SOEdit and open it" (or run `ARSENAL soedit install`), and can then open a model in it.
- Historical Sources (Help & Docs > Historical Sources): a list of first-hand and second-hand sources on the Second World War with their links, nation and kind. With a `-ww2` download you can also search the text inside the documents.
- Engine technical document (Help & Docs > Docs, part Engine): shown once you copy the `techdoc` folder of `ARSENAL-engine-docs-public-<version>.zip` into the ARSENAL folder. Then you can read it as chapters, as one whole document and as PDF.
<!-- Author: Imperator_Aug (ARSENAL, ia-5dd5b99a) -->
