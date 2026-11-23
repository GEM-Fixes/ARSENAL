# 22. Glossary

This chapter explains the terms used throughout the guide, in alphabetical order, including the words the step-by-step pages of Part I and the reference entries of Part III use. Each entry points to the chapter where the idea is covered in detail and, where it helps, to the Part I page or Part III entry. For the keys of `mod.info` and the mod folder, see [Reference 1](r01-mod-info-and-folder.md); for bot scripts and the console, see [Reference 12](r12-bot-lua-and-console.md).

## A

- **Ability**: a named skill level for a soldier, such as a weapon skill, set with a level number. A level number outside the allowed range silently counts as the top level. Chapter [8](08-infantry-and-humans.md).
- **Advanced**: the switch "Show the Advanced options" on Tools & Settings > Settings of the ARSENAL window; Ctrl+K has it too. It asks before it turns on. It adds items and options inside the tabs, never a tab: under AS64 Project Notes, Mod Files, Test Run and Expert Tools, plus the folds marked Advanced inside pages. While it is on, the header shows a small "Advanced on" chip. Chapter [19](19-toolchain.md#settings-all-games).
- **Ammo type**: a data entry for a round, with a tag (caliber plus type) that weapons and penetration tables match against. Chapter [9](09-weapons-ammo-damage.md).
- **Apply**: the button in the Options mods screen that makes the game re-read the active mods. Chapter [3](03-mod-folder-and-load-order.md).
- **ARSENAL**: the modding toolkit this guide uses. `ARSENAL.exe` runs every tool from one command (`ARSENAL <tool> ...`) and needs nothing else installed; `ARSENAL help` lists the tools. Without the exe, the same command runs as `node tools/as2/as2.js <tool>` from the ARSENAL folder (older name: `as2`). Chapter [19](19-toolchain.md).
- **ARSENAL-gui**: the same tools in a window. Double-click `ARSENAL.exe` or `ARSENAL-gui.cmd` and its pages open in your browser; each page names the game it serves. Chapter [19](19-toolchain.md).
- **Armour simulator**: the Armor tab of the Models page (Models & Sim), and the `armorsim` command. It shows a vehicle's armour as the game reads it, with your mod laid over the game, and which shells go through at which range. Chapters [9](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window) and [19](19-toolchain.md#models--sim-all-games), and [Change armour](p05-change-armour.md).
- **Arrange mode**: the mode of the ARSENAL window in which you move, hide and show the blocks of a page. Start it on Tools & Settings > Settings ("Arrange the page") or with Ctrl+K "Arrange This Page"; a bar on the page shows "Arranging:" and Done. The layout is kept in a profile. Chapter [19](19-toolchain.md#arrange-mode).
- **as64.exe**: the 64-bit game program. It adds the console (`-console`), several game windows on one computer (`-instance N`) and the control pipe (`-control`) that `testrun` uses, and it keeps the previous log as `game.prev.log`. Chapter [18](18-testing-and-logs.md).
- **as64+**: the built-in extension package of the 64-bit build. With it in the active list the game runs in Enhanced mode; without it, in Classic mode. It always loads before every player mod. Chapter [3](03-mod-folder-and-load-order.md) and [Reference 1](r01-mod-info-and-folder.md#as64).
- **Assault Squad 2 (AS2)**: the game this guide covers. Chapter [1](01-getting-started.md).

## B

- **BOOT OK**: what `play` and the Play page report when the mod loaded and a test match started. It does not mean the mod plays right. Chapter [18](18-testing-and-logs.md).
- **Behind the armour**: the panel under the shot test of the Models page that follows a shot past the plates and says what it does to the parts, the crew and the vehicle as a whole. Chapter [9](09-weapons-ammo-damage.md#behind-the-armour).
- **binaries/x64**: the folder of a Gates of Hell install that holds the game program `call_to_arms.exe`, its own Workshop uploader and `steam_api64.dll`. The ARSENAL Workshop uploader goes there. Chapter [20](20-packaging-and-release.md#the-arsenal-workshop-uploader).
- **Bisect**: finding a fault by turning half of your changes off, then half of what is left, until one change remains. Chapters [18](18-testing-and-logs.md) and [21](21-troubleshooting.md).
- **Block**: one part of a page of the ARSENAL window, which Arrange mode can move, hide or show again. Chapter [19](19-toolchain.md#arrange-mode).
- **Bone**: a named point or joint in a model's skeleton, used for turrets, muzzles and wheels. A missing bone is a common error after swapping a model. Chapter [16](16-effects-sound-models.md).
- **Bot**: the computer player in multiplayer, driven by data and a Lua script. Chapter [10](10-ai-and-bots.md).
- **Bot Doctrine**: the page of the ARSENAL window (Game Modes & AI > Bots > Bot Doctrine, 64-bit build) that turns short rules of how small units fought, and characters that follow them, into bot settings in your mod. Not the same as a Gates of Hell doctrine. [Bots](p11-bots.md) and chapter [10](10-ai-and-bots.md).
- **Branch task**: a task of the Quick Guided Task started from inside another one, for example a new gun inside a vehicle. When it ends you go back to the first task. Chapter [19](19-toolchain.md#quick-guided-task) and [Use the Quick Guided Task](p17-quick-guided-task.md).
- **Breed**: a data set describing the body and senses of a soldier type. Chapters [6](06-data-keys-entities.md) and [8](08-infantry-and-humans.md).
- **Build (tool)**: the tool that runs all checks and writes paks. Chapter [20](20-packaging-and-release.md).
- **Buy panel**: the in-game panel where a player buys units in multiplayer. Each button comes from a unit card in the multiplayer unit lists. Chapter [15](15-interface-and-icons.md) and [Change unit numbers](p02-change-unit-numbers.md).

## C

- **Cache**: the saved index that tools such as `entityindex` keep so that they start fast. Chapter [19](19-toolchain.md).
- **call_to_arms.exe**: the Gates of Hell game program, in `binaries/x64`. ARSENAL knows a Gates of Hell folder by it. Chapter [20](20-packaging-and-release.md#the-arsenal-workshop-uploader).
- **check**: the front-door tool: give it a mod folder from anywhere and it prints findings plus a verdict for each game build, without running the game. Chapter [19](19-toolchain.md).
- **Card id (unit card, price card)**: the name of a unit's entry in the multiplayer unit lists, which holds its price, rank needed and unlock time. The buy panel icon is named after it. Squad cards carry the army in brackets. [Add a unit](p03-add-a-unit.md).
- **Chassis**: the part of vehicle data that defines wheels, tracks and movement. Chapter [7](07-units-vehicles-movement.md).
- **Classic mode**: the game mode that loads mods written for the older data version (3.262). Chapter [3](03-mod-folder-and-load-order.md).
- **Clean copy**: the copy of your mod folder that the Share page makes for the Workshop uploader, without `.git`, notes, backups, `UPGRADE.md` and other leftovers. Chapter [20](20-packaging-and-release.md#the-clean-copy).
- **Console**: the in-game command line of the 64-bit build. It needs the `-console` start option; open it with the key left of 1. [Reference 12](r12-bot-lua-and-console.md#8-reaching-the-console).
- **Control pipe**: a channel the 64-bit build opens when started with `-control`, through which a tool sends console commands. `testrun` uses it. Chapter [18](18-testing-and-logs.md).
- **Confirm box**: the one box that every step of the ARSENAL window which writes files or starts a program opens first: what will happen, where, "Do it" and "Cancel". Chapter [19](19-toolchain.md#the-confirm-box).
- **Conflict**: two mods replacing the same file, so only one wins. Chapters [4](04-vfs-paks-patches.md) and [19](19-toolchain.md).
- **Conquest**: a campaign mode only Gates of Hell has, with battles fought over a map of points. It reads fixed files under `set/dynamic_campaign` (such as `values.set` and `map_points.set`), and bot scripts see it through `BotApi.Conquest` (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [12](12-missions-and-multiplayer-setup.md#gates-of-hell-summary).
- **cp1251**: the old Windows Cyrillic text encoding. In vanilla data it survives only inside `;` comments, which the game skips; leave those bytes alone. The 64-bit build reads string values as UTF-8, so a string saved as cp1251 shows as boxes. Chapters [5](05-sdl-language.md), [14](14-localization.md) and [20](20-packaging-and-release.md).
- **CRC**: a checksum. The multiplayer lobby compares checksums of text-like data files and only the sizes of binary ones. Chapters [12](12-missions-and-multiplayer-setup.md) and [20](20-packaging-and-release.md).
- **CRLF**: the two-character line ending (carriage return, line feed) used by the game's text files. Chapter [5](05-sdl-language.md).
- **Crash dump (minidump)**: a file the game writes when it crashes, with a text sidecar ending in `.mdmp.log`. Chapter [18](18-testing-and-logs.md).

## D

- **DDA**: the older name for the block-and-key text syntax that SDL grew from. Chapter [5](05-sdl-language.md).
- **Dedicated server**: a game program that runs a multiplayer match with no player at it. Gates of Hell ships one, `call_to_arms_server.exe` in `binaries/x64`; its sound is off by default (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [12](12-missions-and-multiplayer-setup.md#gates-of-hell-summary).
- **def (`.def`)**: an entity definition file. Chapter [6](06-data-keys-entities.md).
- **define**: a named macro in SDL. Calling an undefined one is fatal. Chapters [5](05-sdl-language.md) and [21](21-troubleshooting.md).
- **Desync**: the state where players' games disagree about what happened. See OOS. Chapters [12](12-missions-and-multiplayer-setup.md) and [21](21-troubleshooting.md).
- **develop (tag)**: a word in the `Tags` line of a Gates of Hell `mod.info` that lifts the version check for that mod, handy while you work on it (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [20](20-packaging-and-release.md#in-gates-of-hell-6).
- **Direct control**: steering one soldier or vehicle by hand. Gates of Hell adds a third-person view to it, switched with the key `manual_mode_toggle`; the host can allow direct view only, third person only, or either (`manualControlMode` 1, 2 or 3) (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [7](07-units-vehicles-movement.md#gates-of-hell-summary).
- **Docs page**: the sub-tab of Help & Docs that reads and searches this guide and the other documents inside the window, chapter by chapter or as one book. Chapter [19](19-toolchain.md#help--docs-all-games).
- **Doctor**: the tool that runs all the linters on a mod and, with `--release`, checks the folder before you ship it. Chapters [19](19-toolchain.md) and [20](20-packaging-and-release.md).
- **Doctrine (Gates of Hell)**: a choice each player makes in a Gates of Hell lobby for his army; it filters which units he can buy. ARSENAL's Bot Doctrine page is a different thing (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [12](12-missions-and-multiplayer-setup.md#gates-of-hell-summary).
- **Donor**: a working Assault Squad 2 unit of the same kind that a unit ported from Gates of Hell is built on. The donor brings crew places, weapon slots and armour layout. `donorpick` suggests one. [Unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

## E

- **Enhanced mode**: the game mode for mods that require version 3.301 or newer. Chapter [3](03-mod-folder-and-load-order.md).
- **Entity**: any game object defined by data: unit, vehicle, building or item. Chapter [6](06-data-keys-entities.md).
- **entityindex**: the tool that indexes every entity and what it refers to. Chapter [19](19-toolchain.md).
- **Event**: something that happens and that an interaction script can react to. Chapter [11](11-interaction-scripts.md).
- **Expert Tools**: the item under Tools & Settings > Other Tools, shown with Advanced on, that lists every ARSENAL tool with its command line, and shows diffs, stat sheets and conflicts. Chapter [19](19-toolchain.md#other-tools-generator-and-expert-tools-all-games).
- **ext (`.ext`)**: a shared template file that entities build on. Chapter [6](06-data-keys-entities.md).
- **Extender**: a block in an entity that adds a capability, such as inventory, vitality or a cannon. Chapter [6](06-data-keys-entities.md).

## F

- **Fatal error**: a load error that closes the game, such as `define not found`. Chapters [18](18-testing-and-logs.md) and [21](21-troubleshooting.md).
- **File viewer**: the read-only view that a file which is not plain text opens in: sounds, pictures, video, fonts, shaders, archives and bytes. Chapter [19](19-toolchain.md#file-viewers).
- **Flag**: a named on/off value in scripts, set with `{set}`. More than 128 distinct flag names is a load error. Chapters [11](11-interaction-scripts.md) and [12](12-missions-and-multiplayer-setup.md).
- **FX**: a visual effect such as smoke, fire or a muzzle flash. Chapter [16](16-effects-sound-models.md).

## G

- **gen**: the tool that writes a small mod from a spec file, or with `--describe` from a unit described in plain words; `--plan` only previews. What it writes is a start: play it before you trust it. Chapter [19](19-toolchain.md).
- **Game card**: the data entry that lists a multiplayer game mode in the lobby. Chapter [12](12-missions-and-multiplayer-setup.md).
- **Game folder**: where the game is installed. Treat it as read-only. Chapter [2](02-install-layout.md).
- **game.log**: the text log the game writes at `log/game.log`. Chapter [18](18-testing-and-logs.md).
- **Gates of Hell (GoH)**: a related game on a newer version of the engine. Its data can be ported with care, for your own play only; its content can never be shared. The chapters of Part II say, section by section, where Gates of Hell differs. Chapter [19](19-toolchain.md#appendix-porting-from-gates-of-hell), [Unit from Gates of Hell](p12-unit-from-gates-of-hell.md) and [the summary below](#gates-of-hell-summary).
- **GEM index**: an index of other modders' guides and tools, read by the Guides & External Tools page and the `gemindex` command. Chapter [19](19-toolchain.md) and [Find guides and tools](p16-find-guides-and-tools.md).
- **GOH-ORIGIN.tsv**: the list a mod keeps of its files that came from Gates of Hell. The Share page and `release-check --publish` refuse to pack, copy or publish a mod that has one. Chapters [19](19-toolchain.md#appendix-porting-from-gates-of-hell) and [20](20-packaging-and-release.md#5-the-pre-release-gate).
- **GoH unit page**: the page that brings a Gates of Hell vehicle into an Assault Squad 2 mod, built on a donor. Under GoH it sits in the Units sub-tab of Units & Balance; its step 3 has the fold [Translate numbers](#t). Chapter [19](19-toolchain.md#units--balance-under-goh) and [Unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

## H

- **Host**: the player who creates a multiplayer match and whose settings the lobby checks. Chapter [12](12-missions-and-multiplayer-setup.md).
- **Human**: the entity class for soldiers. Chapter [8](08-infantry-and-humans.md).

## I

- **inc (`.inc`)**: an include file of shared data. Chapter [5](05-sdl-language.md).
- **include**: the SDL command that pastes another file in. Chapter [5](05-sdl-language.md).
- **Instance**: one of several game windows on one computer. Start the 64-bit build with `-instance N` (N from 1 to 9); each keeps its own settings and `game.log`. Chapter [18](18-testing-and-logs.md).
- **Interaction**: a script made of `{on event}` rules that controls behaviour. Chapter [11](11-interaction-scripts.md).
- **Inventory**: the extender that holds a unit's weapons and ammo. Chapters [6](06-data-keys-entities.md) and [8](08-infantry-and-humans.md).

## K

- **Key**: a named setting inside a block, followed by its value. Chapters [5](05-sdl-language.md) and [6](06-data-keys-entities.md).
- **keylint**: the tool that checks keys for typos and wrong values. Chapter [19](19-toolchain.md).
- **keys.set**: the file that defines hotkeys. Chapter [15](15-interface-and-icons.md).

## L

- **LAN Remote**: lets a phone, a tablet or another computer on your home network view the ARSENAL window through a private link. Changes are made only on the PC. Chapter [19](19-toolchain.md#lan-remote-and-the-phone-view).
- **LOADS_STATIC**: the verdict of `check` when it finds no known crash pattern and accepts the version. It never means the mod works. Chapter [19](19-toolchain.md).
- **Lint**: an automatic check for likely mistakes. Chapter [19](19-toolchain.md).
- **Lobby**: the pre-match screen where players join and data is compared. Chapter [12](12-missions-and-multiplayer-setup.md).
- **lng (`.lng`)**: a localization file of text keys, saved as UTF-8. Chapter [14](14-localization.md).
- **Load order**: the order in which mods are mounted. Later mods win. Chapter [3](03-mod-folder-and-load-order.md).
- **localizations (folder)**: the folder of a Gates of Hell mod that holds texts and files per language, `localizations/<code>/`. Gates of Hell does not read the `localization/` folder of an Assault Squad 2 mod (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [20](20-packaging-and-release.md#in-gates-of-hell-1).
- **LOD**: level of detail, meaning simpler models shown when far away. Chapter [16](16-effects-sound-models.md).
- **Loose file**: a file sitting in a folder rather than inside a pak. It always beats the same path in the mod's root `resource.pak`; against a pak inside `resource/`, the folder scan order decides. Chapter [4](04-vfs-paks-patches.md) and [Reference 1](r01-mod-info-and-folder.md#loose-file-against-pak).
- **Lua**: the scripting language used by multiplayer bots. Chapters [10](10-ai-and-bots.md) and [12](12-missions-and-multiplayer-setup.md).

## M

- **Macro**: a reusable chunk of SDL with parameters. Chapter [5](05-sdl-language.md).
- **Material (`.mtl`)**: a file saying which textures and shading a mesh uses. Chapter [16](16-effects-sound-models.md).
- **mdl (`.mdl`)**: a model definition file. Chapter [16](16-effects-sound-models.md).
- **mi (`.mi`)**: a mission or map file with players, triggers and commands. Chapters [12](12-missions-and-multiplayer-setup.md) and [13](13-maps.md).
- **Minidump**: see Crash dump.
- **Mod**: a folder with a `mod.info` that changes the game. Chapter [3](03-mod-folder-and-load-order.md).
- **mod.info**: the mod's description file with name, version range and requirements. Chapter [3](03-mod-folder-and-load-order.md).
- **`mod_<item number>`**: the name Gates of Hell gives a mod that comes from the Workshop, fixed by the item number (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [20](20-packaging-and-release.md#in-gates-of-hell-7).
- **Morale**: a soldier's willingness to keep fighting. Chapter [8](08-infantry-and-humans.md).
- **Mount**: making a folder or pak part of the virtual file system. Chapters [4](04-vfs-paks-patches.md) and [20](20-packaging-and-release.md).

## N

- **Node**: the program (Node.js) that runs the modding tools. Chapter [19](19-toolchain.md).

## O

- **OOS (out of sync)**: the multiplayer failure where machines diverge. Dumps go to `log/oos/`. Chapters [18](18-testing-and-logs.md) and [21](21-troubleshooting.md).
- **options.set**: your profile's settings file, including the list of active mods. Chapters [2](02-install-layout.md) and [3](03-mod-folder-and-load-order.md).
- **Override**: replacing an original file by giving your mod a file with the same path. Chapter [4](04-vfs-paks-patches.md).

## P

- **Pak**: a zip archive of game files. Chapters [4](04-vfs-paks-patches.md) and [20](20-packaging-and-release.md).
- **Package**: the ready mod folder, with its `mod.info` and its paks, that the Share page writes for friends. Chapter [20](20-packaging-and-release.md#5-the-pre-release-gate).
- **pat (`.pat`)**: a numbered archive (`1.pat`, `2.pat`) holding patches. Numbering must have no gap. Chapter [4](04-vfs-paks-patches.md).
- **Patch (`.patch`)**: a file of edit instructions applied from a `.pat` archive. Chapter [4](04-vfs-paks-patches.md).
- **Patch mod**: a separate mod folder that `ARSENAL fix` writes its safe repairs into. It loads after your mod, so your mod is never changed. [Check, fix and read the log](p14-check-fix-read-log.md).
- **Pathfinding**: how units choose a route. Chapter [7](07-units-vehicles-movement.md).
- **Penetration**: whether a shell gets through armor. Chapter [9](09-weapons-ammo-damage.md).
- **Persona**: a way of playing for the multiplayer bot that the Bot Doctrine page and `doctrine` write into a mod as starting numbers. [Bots](p11-bots.md).
- **Phone view**: the ARSENAL window as another device shows it over LAN Remote: every page can be read, nothing can be changed. Chapter [19](19-toolchain.md#lan-remote-and-the-phone-view).
- **Pitfall**: a known trap. Each chapter lists the ones for its topic.
- **Play card**: the short text the Share page and the release task make for friends: which mods, in which order, on which game build. Chapter [20](20-packaging-and-release.md#6-multiplayer-compatibility).
- **pot (`.pot`)**: the text file format of Gates of Hell (UTF-8). The game ships no `.lng` files (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [14](14-localization.md#gates-of-hell-summary).
- **Preset**: a saved bundle of game settings for a match. Chapter [12](12-missions-and-multiplayer-setup.md).
- **Priority**: a `mod.info` key only Gates of Hell reads: a whole number, 1 when missing. Among mods that do not depend on each other, a higher number applies later and wins (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [20](20-packaging-and-release.md#in-gates-of-hell-6).

## Q

- **Quant**: one tick of game time, the unit used for timers and speeds in data. Chapter [5](05-sdl-language.md).
- **Quick Guided Task**: the row above the tabs of the ARSENAL window: "I want to" make, change or explore something, then Start. A task asks one question at a time, writes into your mod with restore points, and checks it. [Use the Quick Guided Task](p17-quick-guided-task.md) and chapter [19](19-toolchain.md#quick-guided-task).

## R

- **refcheck**: the tool that checks that every name an entity uses exists. Chapter [19](19-toolchain.md).
- **rep (`.rep`)**: a Gates of Hell replay, one zip file in `replays/`. Gates of Hell and Assault Squad 2 cannot read each other's replays (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [20](20-packaging-and-release.md#replays-on-the-workshop).
- **Repository**: the game's internal list of loaded resources. The log prints `Repository: N resources`. Chapters [4](04-vfs-paks-patches.md) and [18](18-testing-and-logs.md).
- **Resource folder**: `resource/` in the game or in a mod, holding data. Chapter [2](02-install-layout.md).
- **Restore point**: the old version of a file, kept just before the Editor or a task writes it, in a folder beside your mod named `<mod>.arsenal-undo`. Chapter [19](19-toolchain.md#saving-and-undo).

## S

- **sav (`.sav`)**: a Gates of Hell saved game, one archive per save. Saves do not cross between Gates of Hell and Assault Squad 2 (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [20](20-packaging-and-release.md#in-gates-of-hell-5).
- **Saved task**: a Quick Guided Task you started and left. Pick it under "Saved tasks" and press Continue, or Throw away. Chapter [19](19-toolchain.md#quick-guided-task).
- **SOEdit**: a model editor for the game's model files, opened from the Models page or with `ARSENAL soedit open`. It is not part of the ARSENAL download; the Models page offers "Get SOEdit and open it", which downloads its latest release from GitHub. Chapters [19](19-toolchain.md#soedit-models-in-soedit) and [21](21-troubleshooting.md#13-symptom-an-arsenal-page-refuses-or-finds-nothing), and [Edit a model](p06-edit-a-model.md).
- **SDL**: the text data language used by almost all game data. Chapter [5](05-sdl-language.md).
- **Sensor**: data defining what a unit sees and hears. Chapters [6](06-data-keys-entities.md) and [10](10-ai-and-bots.md).
- **set (`.set`)**: a data file, often a table of values, under `set/`. Chapters [5](05-sdl-language.md) and [6](06-data-keys-entities.md).
- **Share page**: the page that gets a mod ready for friends or the Workshop: `mod.info`, picture, release check, package, clean copy, uploader, new version and play card. Assault Squad 2 and the 64-bit build only. Chapter [20](20-packaging-and-release.md#5-the-pre-release-gate) and [Pack and share](p15-pack-and-share.md).
- **Shot tool**: the Shot button of the Models page's 3D view: a click on the model fires the chosen shell at that point and shows what happens. Chapter [9](09-weapons-ammo-damage.md#the-shot-tool-in-the-3d-view).
- **Soft code**: the editable text and resource layer, as opposed to the compiled program. Chapter [1](01-getting-started.md).
- **Stage record**: the small file the Models page writes into your mod (under `.arsenal/soedit/`) when it copies a model, so that SOEdit opens the copy rather than the original. [Edit a model](p06-edit-a-model.md).
- **Stuff**: weapon, ammo and item data files. Chapters [6](06-data-keys-entities.md) and [9](09-weapons-ammo-damage.md).

## T

- **Tag**: a word used to match things, such as ammo to penetration tables. Chapters [5](05-sdl-language.md) and [9](09-weapons-ammo-damage.md).
- **Tags (mod.info)**: a line of words in a Gates of Hell `mod.info`: `develop` lifts the version check and `no_delete` hides the delete button. Assault Squad 2 skips the line (not tested in a running game, see [the summary](#gates-of-hell-summary)). Chapter [20](20-packaging-and-release.md#in-gates-of-hell-6).
- **Testrun**: the tool that drives the game for automatic checks. Chapter [18](18-testing-and-logs.md).
- **Texture**: an image drawn on a model. Chapter [16](16-effects-sound-models.md).
- **Translate numbers**: the fold in step 3 of the GoH unit page that shows how a port translates speed, armour and other numbers to Assault Squad 2 scale and lets you choose where the translation is unsure. Chapter [19](19-toolchain.md#units--balance-under-goh).
- **Triage**: sorting log messages into fatal, suspicious and harmless. Chapters [18](18-testing-and-logs.md) and [21](21-troubleshooting.md).

## U

- **Unconfirmed**: a fact not yet confirmed in the game, marked "(unconfirmed)" in this guide. See the [README](README.md).
- **UTF-8**: the text encoding used by `.lng` files. Chapter [14](14-localization.md).

## V

- **VFS (virtual file system)**: the combined view of all game and mod files. Chapter [4](04-vfs-paks-patches.md).
- **Vitality**: the extender that holds health. Chapter [6](06-data-keys-entities.md).
- **vol (`.vol`)**: a volume file describing hit shapes and armor areas. Chapters [6](06-data-keys-entities.md) and [9](09-weapons-ammo-damage.md).

## W

- **Whole document**: a document read in one piece on the Docs page: the Doctrine atlas, the Modding guide or the Engine document. Chapter [19](19-toolchain.md#whole-documents).
- **Workshop**: Steam's mod sharing service. Chapter [20](20-packaging-and-release.md) and [Pack and share](p15-pack-and-share.md).
- **Workshop copy**: the copy of a subscribed Workshop item. The original game copies it into `mods/<Name>/`; the 64-bit build loads it in place from Steam's download folder and ignores a copy in `mods/`. Gates of Hell also loads it in place, as `mod_<item number>`. Chapter [20](20-packaging-and-release.md#8-steam-workshop) and [Reference 1](r01-mod-info-and-folder.md#workshop-copy).
- **Workshop uploader**: the program that uploads a mod folder to the Steam Workshop. ARSENAL's own is `workshop_gui.exe`, which the Share page puts beside the game program and opens; it works for Assault Squad 2, the 64-bit build and Gates of Hell. Chapter [20](20-packaging-and-release.md#the-arsenal-workshop-uploader).

## Z

- **Zip root**: the folder a pak's entry paths start from. A pak placed in `resource/` needs the top folder name inside it. Chapter [20](20-packaging-and-release.md).
- **Zip64**: the zip extension that allows very large paks. Chapter [20](20-packaging-and-release.md).

## Gates of Hell: summary
<!-- goh: GHVFS-01 GHVFS-02 GHVFS-04 GHVFS-24 GHVFS-36 GHNET-17 GHNET-56 GHNET-66 GHCQ-03 GHCQ-41 GHDC-05 GHDC-06 GHMIS-117 PORT-42 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

These glossary terms belong to Gates of Hell, or say how ARSENAL handles it:

| Term | What it is |
|---|---|
| [binaries/x64](#b) | Folder of the game program; the Workshop uploader goes there |
| [call_to_arms.exe](#c) | The Gates of Hell game program |
| [Conquest](#c) | Campaign mode only Gates of Hell has |
| [Dedicated server](#d) | `call_to_arms_server.exe`, a match with no player at it |
| [develop (tag)](#d) | Lifts the version check of one mod |
| [Direct control](#d) | Gates of Hell adds a third-person view |
| [Doctrine (Gates of Hell)](#d) | A lobby choice per player that filters units |
| [GOH-ORIGIN.tsv](#g) | List of ported files; such a mod is never shared |
| [GoH unit page](#g), [Translate numbers](#t) | ARSENAL page and its fold that bring a vehicle into Assault Squad 2 |
| [localizations (folder)](#l) | Texts per language in a Gates of Hell mod |
| [`mod_<item number>`](#m) | Name of a Workshop mod in Gates of Hell |
| [pot (`.pot`)](#p) | Gates of Hell text files |
| [Priority](#p) | `mod.info` key that orders independent mods |
| [rep (`.rep`)](#r) | Gates of Hell replay |
| [sav (`.sav`)](#s) | Gates of Hell saved game |
| [Tags (mod.info)](#t) | `develop` and `no_delete` |

Every chapter of Part II ends with its own Gates of Hell summary; for packaging and the Workshop see [chapter 20](20-packaging-and-release.md#gates-of-hell-summary), for problems [chapter 21](21-troubleshooting.md#gates-of-hell-summary).
