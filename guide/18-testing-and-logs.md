# 18. Testing and Logs

The short way: [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md) walks through the same job in seven steps. This chapter explains what happens at each step and how to read what the game tells you.

## What you will learn

- A repeatable test loop for every change.
- How to start the game, activate your mod and confirm that it is the one running.
- How to use a LAN match with the "Test mode" preset as your test bed.
- How to read `game.log`, tell fatal errors from warnings, and ignore harmless noise.
- How to read crash dumps and out-of-sync dumps, and how to find the cause of a crash by bisecting.
- Which ARSENAL pages and commands read the log for you.
- What is different when you test a Gates of Hell mod.

The rule for this whole guide: a data change is not done until you have seen it work in the game and read the log afterwards.

## 1. The per-change test loop

1. **Save your work.** Commit the change in version control, and copy your pak file somewhere safe before you overwrite it, because version control does not hold paks. If your mod is a loose folder, no repack is needed; if you pack paks, repack and check that the pak's timestamp is newer than your edits (see section 2).
2. **Check without the game first.** On the Check page of the ARSENAL window, press "Check the mod" (the "quick check" tick starts ticked for a mod of 300 files or more and unticked for a smaller one; tick it for a fast run). The command way is `ARSENAL check <mod folder> --fast -q`. It takes seconds and tells you whether the mod loads statically, that is, whether the files contain a mistake the tools know will stop or crash the game ([chapter 19](19-toolchain.md)). The answer `LOADS_STATIC` means "no known crash pattern found", not "works".
3. **Start the game with only the mod under test active** (section 2). The Play page can do this for you: it checks the mod, installs it, starts the game on a test map in a separate copy of your settings and reads the log for a load verdict (section 9).
4. **Start a LAN test match** (section 4), buy the changed units and use them: fire, take hits, reload, burn.
5. **Read the log** after the test or after a crash. On the Read Game.log page (Mods > Check & Fix > Read Game.log), press "Explain my last game log", or search the log yourself for the names of the files you changed, "may lead to crash" and "define not found".
6. **Write it down.** Record the date, which commit, which unit and the result. Keep screenshots and the full log in a folder per test. Record any new but harmless warning in a "known warnings" list for your mod.

Test the real thing by playing it. Decisive shots (flank shots, engine hits, high explosive against gun crews) are best done in direct control, where you aim yourself.

The quick way: the [Quick Guided Task](19-toolchain.md#quick-guided-task) ends every make or change task with "Check now", "Go to the Play page" and a tick list "What to look at in the game", which is steps 2 to 4 of this loop. The explore task "what went wrong in the last run" is step 5. See [Use the Quick Guided Task](p17-quick-guided-task.md).

### Packaging reminders

- The game loads `.pak` files, which are plain **zip files**, from a mod's `resource/` folder. Loose folders such as `entity/`, `set/`, `properties/`, `script/`, `interface/` and `map/` beside them are extractions, and the paks often hold more than the loose copies.
- **Loose files win by scan order, not by timestamp.** A leftover extracted copy of `set/...` in `resource/` can override the same file in a pak inside `resource/`, so delete stale extracted copies. See [chapter 4](04-vfs-paks-patches.md).
- Pak roles: `gamelogic.pak` holds `set/`, `properties/` and `script/`; `entity.pak` holds `entity/`; `map.pak` holds `map/`; `interface.pak` holds `interface/`; `texture.pak` holds textures, model definitions and effect definitions; `sound.pak` holds `sound/`; `music.pak` holds music.
- **Encoding:** text data files use **CRLF** line endings, and the 64-bit build reads every string value as **UTF-8**, in data and `.lng` files alike; identifiers must be ASCII. Vanilla files are ASCII except inside `;` comments, where old cp1251 bytes remain. Some editors guess those comments wrongly and rewrite the file. Use an editor that lets you choose the encoding (the ARSENAL Editor page keeps bytes you did not touch), or a script that copies the bytes it does not change and keeps CRLF. See [chapter 14](14-localization.md).
- If you use git for a mod, keep the repository at the mod root, track text sources, ignore `*.pak` and large binaries, and set it not to convert line endings, so files with old comment bytes stay byte for byte identical. A Workshop upload copies the whole mod folder, including a `.git` folder, so exclude it. See [chapter 20](20-packaging-and-release.md).

## 2. Launching and activating a mod

Start the game from Steam. A dialog titled "Select launch option" offers Play, Editor, Safe mode and Safe mode (no mods); choose Play. About 20 seconds later the main menu appears.

Mods are applied in the **Options** screen, on the **MODS** tab (the last tab). Disabled mods are on the left, active ones on the right; select one and use the arrows to move it. Then press **Apply**. The game shows "Applying mods..." for around 30 seconds (a large mod can take a few minutes) and does not need a restart. Menu buttons often ignore single clicks, so double-click them. Activate only the mod under test, because other global mods can conflict. A mod made for the 64-bit build needs the built-in extras mod `as64+` active and listed before it ([chapter 3](03-mod-folder-and-load-order.md)).

**How to verify that your mod is active:** open your profile's `options.set` and find the `{mods` block. It has one line per active mod, such as `"mymod:1"`. The Read Game.log page reads the same list for you: "Show what is switched on" lists your mods in the order the game uses and warns about folders the game does not know and about `as64+` in the wrong place. In the original game this file is the only reliable check, because its log does not name local mods and the main-menu footer only shows a version text. The 64-bit build's log does list them (section 5). If you rename a mod folder, its line is dropped and the Activated list is empty, so re-activate it. The keys of `mod.info` and the active list are described one by one in [Reference 1](r01-mod-info-and-folder.md).

Where files live: the game keeps its data under your Documents folder in `My Games/Men of War - Assault Squad 2/` (Documents can be redirected by OneDrive, so the plain path may not exist). Inside are `profiles/<id>/options.set` (profile and options), `profiles/<id>/keys.set` (your hotkeys), and `log/` containing `game.log`, `minidumps/` and `oos/`.

**Two game programs.** The original game is `mowas_2.exe` (data version 3.262). The 64-bit build is `as64.exe`; mods for it declare a minimum version of 3.301. Both share one profile, so the active mod list stays the same when you switch between them. Only the 64-bit build keeps the previous log, lists the mounted mods in its log, takes start options such as `-instance`, `-console` and `-control`, and has a control pipe for automation (section 9).

**Console.** The retail 3.262 build has no console (the `~` key does nothing). The 64-bit build opens one when it is started with `-console`, with the key left of `1`. How to reach it and what each command does is in [Reference 12, Reaching the console](r12-bot-lua-and-console.md#8-reaching-the-console).

**Console `exec`.** The console command `exec` runs a script file, and the path rules are easy to get wrong. A bare `exec "x.cfg"` finds `x.cfg` only inside `resource/at/`. Both `exec "at/x.cfg"` and `exec "x.cfg"` for a file sitting in `resource/` answer "file not found". For any other place, start the path with a slash from the mount root: `exec "/x.cfg"`, `exec "/set/d/x.cfg"`, or write it as `exec "resource/x.cfg"`. Script files must be `.cfg`; a loose `.txt` is invisible to the game. See [Reference 12, exec](r12-bot-lua-and-console.md#exec).

**Several copies at once.** On the 64-bit build, `-instance N` (1 to 9) starts a separate copy with its own user folder (`My Games/Men of War - Assault Squad 2 - instance N/`), log and profiles; see [chapter 12](12-missions-and-multiplayer-setup.md). Its mod list starts empty, so activate your mods in that instance's `options.set` first. The Play page and `ARSENAL play` use instance 1, so your own settings (instance 0) stay as they are.

**Do not assume a console variable exists.** Some console variable names you may meet are not present in the 64-bit build 3.301 (thirteen are known); some exist only in the editor build. Read the variable first and see what it answers before you build a test on it.

### In Gates of Hell
<!-- goh: GHVFS-13 GHLOG-16 GHMIS-07 GHMIS-119 GHMIS-120 GHMIS-122 GHLOG-38 -->

- **User folder.** Gates of Hell keeps its data in `Documents/My Games/Gates of Hell/`. Started with `-useLocalDataFolder`, or when Documents lies in OneDrive, it uses `%LOCALAPPDATA%/Digitalmindsoft/Gates of Hell/` instead. Its `log` folder is inside.
- **Is my mod active?** Unlike the original Assault Squad 2, the Gates of Hell log names its mods: `Scanning mods in`, `Found N available mods`, `Mod: activate mod <name>`, and one `Mount package <file> with <n> entries` line for each pak it mounts. Search the log for your mod's folder name.
- **Console helpers** that Gates of Hell adds for testing: `tut_clear_all` forgets the one-time tutorial hints so they show again, `snd_restart` restarts the sound system and reloads the sounds, `dev_l10n_reload` reads the texts again, `logs_flush` writes the debug logs out at once. `ui_armorDisplay` is a command there (`ui_armorDisplay true`), not a variable, so the form `ui_armorDisplay = 1` fails.
- ARSENAL does not start Gates of Hell: the Play page is there under GoH, but `play` refuses this game. Start the game yourself.

## 3. Controls cheat sheet for testing

Click the game window before pressing keys; otherwise the keys go to whatever had focus. After the game loses focus, the first click only refocuses.

| Action | How |
|---|---|
| Direct control | Tap `E` (toggle). `W`/`S` drive, `A`/`D` turn, mouse aims, left click fires, right click next weapon, `Space` next ammo |
| Jump camera | Right-click the minimap |
| Pause menu | `Esc`, then Back, Options or Close |

(Hotkeys are the ones in a typical custom profile; the defaults differ a little, and the player's profile wins. See [Chapter 15](15-interface-and-icons.md).)

Aiming in direct control: put the cursor on the white dot in the reticle and wait for the orange ring to form. Clicking before the ring forms does nothing. A solid red dot means reloading.

Other points: the keyboard has no pan or zoom keys bound; edge scrolling is extremely fast, so avoid it. Screenshots can come out entirely grey, so wait a moment and take another. Check the ground before you trust a speed or route test, because a painted river can be only a water *material* that vehicles drive across. In direct control the camera seems to turn with the hull, so landmark distances are unreliable (unconfirmed).

## 4. The LAN test bed

A LAN match with the **Test mode** setting is the standard unit test.

1. Main menu: **Multiplayer**, then **LAN**, then **New game**. In the lobby, use single clicks on menu entries (a double click can land on a neighbouring entry), but double-click "New game".
2. Choose the game type **Combat**. The test preset is included only by Combat and Assault Zones, and Combat is the simplest.
3. Pick a two-player map, set Players to 2, and create the game.
4. In "Game settings", choose **Test mode** and confirm the warning. This gives 50000 MP, 1000 command points, no unit limits, **zero unlock times**, and no countdown before the start.
5. Units are limited to the preset's year tags, so a unit from another era will not appear in the purchase panel.
6. There are no bots in this lobby unless a mod enables them (see [chapter 10](10-ai-and-bots.md)). You play alone, and you place enemies yourself or build a scenario in the editor (see [Chapter 12](12-missions-and-multiplayer-setup.md)).
7. Double-click **Ready**, then **Start**. Loading takes about 22 seconds.
8. In game, the right-hand panel shows "N / 1000 CP", "50000 / 50000 MP" and the category buttons. Buying spawns the unit in about five seconds.

The purchase panel's categories, top to bottom, are infantry squads, specialists, supplies, support weapons, artillery, light vehicles, two tank categories and heroes. If a category opens an empty tooltip instead of a list, click another category and come back.

**Friendly fire is on.** Your own losses add to the enemy score, so keep your test units out of the impact zone unless they are the target.

### Screenshots and records

Centre on the unit (double-click its card) or jump with the minimap, take a screenshot, and save it in a folder per test next to a copy of the log. Photos of damage reports on screen are the best record.

### In Gates of Hell
<!-- goh: GHMIS-106 GHMIS-107 GHMIS-65 GHMIS-67 GHMIS-109 GHLOG-37 -->

Whether Gates of Hell has the same "Test mode" preset is not mapped. It has console settings that make a test lobby quicker and repeatable:

| Console name | What it does |
|---|---|
| `mp_session_autoready` | off by default; when on, a seated player is ready at once, so you skip the ready clicks |
| `mp_rndSeed` | 0 by default; any other value gives every match the same random seed, for repeatable tests |
| `dev_enableBotAi` | on by default; off starts the next match without the bot script, so computer players neither buy nor move |
| `mp_game_set_victory`, `mp_game_set_personal_score` | `[hostId value]` add victory points or personal score to a player |
| `mp_game_list_players` | lists the players with their host id |
| `mp_checkCombat` | checks the spawn points of a "combat" mission |
| `g_component list` | lists the resource id and part names of the selected units |
| `dbg_damage` | off by default; when on, prints the hit points of vehicle parts to the console when a part takes damage |

## 5. The structure of `game.log`

`game.log` lives in the `log` folder of the game's user folder (section 2). It is **overwritten every time the game starts**, so copy it before you relaunch. The 64-bit build first renames the old log to `game.prev.log`, which keeps exactly one earlier run; the original `mowas_2.exe` simply truncates it, so after a crash and restart the crash log is gone.

The first thing to do when reading it is to skip the profile-sync noise: about a hundred lines beginning `SyncFile` or `Result is`. The Read Game.log page and `logtriage` (section 9) filter them for you.

The log runs in this order:

1. A header with the executable, the Steam application id, the working directory and the command line. The 64-bit build adds a `Mod 'name' from path` line for every mounted mod.
2. A first localization pass, with harmless key-redefinition warnings from the editor texts file.
3. Profile synchronisation lines.
4. `Build` and `Product` lines, then `Repository: N resources`. **N changes when files are added or removed**, so it is a quick "did my pak load?" check. Compare it between players when looking for a desync.
5. Resource-load warnings. The game parses all soft code here, so syntax errors, duplicate definitions and missing-item warnings appear in this part.
6. `Phase ...` lines such as "Phase Loading...", "Phase Mounting mod resources from Steam Workshop..." and "Opening main page". They print *after* the data warnings, so a warning's position relative to them says nothing about whether it came from vanilla or your mod. The Mounting phase never names your mod.
7. Menu and lobby messages: "Mission '...' is skipped" and "Unread data detected". The lobby builds the map list twice, so lines repeat.
8. `Starting "multi/<map>:<gametype>"`: the map load; warnings about map entities and roster preloads follow.
9. `GameThreadStart`: the match is running. Messages marked `@ [quant]` are runtime events tied to something that happened in the simulation (a *quant* is one tick of game time); match the timestamp to what you did.
10. `GameThreadStop` is a normal end. A crash instead leaves an `***** Exception *****` block.

How to read one line:

- `[hh:mm:ss] message (/path/file.def, 188)` is a warning raised while a data file was being parsed. The path and line point into your soft code, and **the path is how you decide whether a warning is yours**.
- `[..] message (a program file name, a number) @ [quant]` was raised by the game program at runtime. It does not name the unit; work out which unit it was from what you did at that second.
- Those program line numbers belong to the build that wrote them. Treat them as a hint about which part of the game spoke, not as a place to look.

Warnings print and the game continues with a fallback. **Errors print an Exception block and the game ends**; they cannot be skipped.

### In Gates of Hell
<!-- goh: GHLOG-06 GHLOG-07 GHLOG-08 GHLOG-09 GHLOG-11 GHLOG-12 GHLOG-13 GHLOG-15 GHLOG-16 GHLOG-20 GHLOG-21 GHLOG-34 -->

The Gates of Hell `game.log` has the same kind of content with a different line form, so a search or a script made for one game needs care on the other:

- **Every line** starts with `[hh:mm:ss] `, the time since the game started. In Assault Squad 2 only warnings carry a stamp. On the Gates of Hell console the warnings carry none.
- **A program place** in brackets is written `(name:number)`, the name in lower case and without its extension, instead of `(name, number)`. The crash report names the kind of error and the version of the game.
- **Game events** (kills, flags, zones) are written to `game.log` as `[EVT] <text>` lines, whatever the console's message setting is.
- **Start-up lines** name the mods and paks (section 2) and the launch: `Launcher: Loading phase ...`, `Start mission <map path> on difficulty ... with options [...]`. A dialog that cannot be found writes `GUI: Failed to find dialog of type <x>`, an entity that cannot be spawned writes `Failed to spawn entity <name>`.
- **Multiplayer lines** include `Workshop item <id> installed successfuly ` (spelled so), `Steam is in OFFLINE mode. Some features are disabled`, and a game preset reset to `<name>` when it did not change with the new game mode. With `logs_on` and `log_mp` set, the `mp` debug log adds the winner, each `SPAWN <unit>` and the match seed.
- **Numbers** in some log lines print as `0x` hex where Assault Squad 2 prints them in decimal.
- **Debug logs** (`logs_on 1` plus one `log_<name>` variable each) are written as whole lines, so lines of different threads no longer mix, but the file can lag up to 5 seconds behind the game. Most of them, `mp` and `mp_tcp` included, start over at each new mission, so copy them before the next mission starts. A log past `log_maxLogFileSize` (250 MB by default; the 64-bit build uses 512 MB) goes on in `<name>.<n>.log`. Gates of Hell has two more debug logs, `log_interaction` and `log_aiming`.

## 6. Fatal errors and warnings

### Fatal (the game ends)

| Message | What it usually means |
|---|---|
| `define not found` | A `("name" ...)` call has no visible `(define "name" ...)`. Defines are scoped to the top-level file being read. Add the define, include its file, or rename the call. |
| `unexpected token` | The parser wanted something else. A bone or volume name vanished after a model swap, a brace or bracket is missing or extra, a number sits where a string should, or a keyword is wrong. Compare with a working sibling file. |
| `String expected`, `Number expected`, `Block terminator expected`, `')' required`, `End of SDL file expected` | Malformed SDL. |
| `Nested mods not supported` | A `(mod ...)` inside another `(mod ...)`. |
| `pattern not found` | A `{from "pattern X"}` base is not defined. |
| `Unknown material` | The material is not in the material list. |
| `Bone modifiers must be placed after skeleton load` | A `{bone "x"}` block came before the skeleton line. |
| `Resource not found - <path>`, `File is not found - <path>` | A mesh, volume, animation or material named in a `.def` or `.mdl` does not exist. Check name and case. |
| `Invalid block in .VOL file`, `Unsupported animation version`, `Zero speed in ik-bone` | Corrupt or wrong-format model data. |

The debug stack inside the Exception block gives the data file and line. More than 128 different `{set}` flag names in interaction scripts also stop the game at load; use tags instead ([chapter 11](11-interaction-scripts.md)).

### Warnings that matter, by impact

1. **`No Stuff found for tags 'X' (may lead to crash)`.** No weapon or ammo item carries those tags, so a dummy is substituted. Loading is fine; the crash comes when the item is used. Ammo tags have the form `<caliber> <type>`. This is the one warning that turns into a crash.
2. **`Can't preload`, `Unread data`**, or missing breeds in a roster: a faction imported incompletely.
3. **`invalid level param`** (an ability level that is not defined; the soldier silently gets the top level), `Unknown props` typos, `Bone X not found`, `Can't find bone X`.
4. **`Invalid ricochet angle`**: clamped, no gameplay effect. Fix `out <= in`.
5. Per-unit runtime warnings: `bone 'X' has no broken view`, a wheeled vehicle without its pivot bones, `unknown sound file`, `Undefined material`.

### Benign background noise

These appear in a normal install; do not chase them: hundreds of `Localization key redefinition` lines, `Mission ... is skipped` for leftover mission titles, `Entity redefinition` for helmets, bushes, wire, wrecks and shells, `Automatic MIP generation not supported` and `No MIP levels`, `No obstacle ID`, `unknown terrain_pp type - snow`, `'use_blend_tex' is not supported`, `Media file ... story not found`, trench-related `Unknown control panel item`, and `Unknown props "crater big"`.

**How to tell new from old:** counts differ between runs, so keep a baseline log of a clean run. New message *types*, or higher counts of `No Stuff found`, `Unknown props`, `Unread data`, `Can't preload` or `invalid level param`, point at your latest change.

See also: [chapter 5](05-sdl-language.md) for the syntax behind the parse errors, [chapter 9](09-weapons-ammo-damage.md) and [Reference 6](r06-weapons-and-ammunition.md) for ammo tags, and [chapter 21](21-troubleshooting.md) for symptoms without a log line.

### In Gates of Hell
<!-- goh: GHLOG-02 GHLOG-03 GHLOG-04 GHLOG-05 GHLOG-17 GHLOG-28 GHLOG-31 GHLOG-32 GHLOG-33 GHED-24 GHED-41 -->

Some messages are new, some are gone, and two faults change from a crash to a warning or the other way:

| Gates of Hell | What it means |
|---|---|
| ammunition in a magazine with an empty id | **fatal** in Gates of Hell; give every ammo item its id |
| `Can't find fxBone in weapon <x> held by <y>`, `No launch bone in <x>` | a missing effect or launch bone is a warning in Gates of Hell; in Assault Squad 2 the same fault crashes |
| a warning that a weapon carried by an entity has no shooter bone | new: names a weapon without a foresight bone, which Assault Squad 2 accepts silently |
| `Unable to board <x> into <y>` | new: a unit could not board (no seats, or no vehicle to own it) |
| `Invalid placement matrix for entity <x>` | new: a script put an entity at a broken position |
| `[EFX] Wrong signature` | new: an effect file of an unexpected form; it is still read |
| `Can't apply preset <name>` | new: an environment preset the editor could not apply |
| `Warning: Invalid land materials found. Fix them in textool` | new, in the editor: an old land is given new materials and asks to be saved |
| `double Create() call detected`, `Multiple notify mappings`, `Unknown bitmap` | new interface warnings that point at a layout fault |
| `Unknown props` | **gone**: a misspelled props name is silent in Gates of Hell, so a typo there no longer shows in the log |
| `unit ... can't look for covers` | gone: a vehicle asking for cover is refused without a warning |
| a wrong component id in an interaction condition | written as `unexpected token`, not "invalid parameter" |

## 7. Crash dumps

### Minidumps

A crash writes two files into `log/minidumps/`: a Windows minidump (about 45 MB, no heap) and a sidecar of the same name ending `.mdmp.log` that holds the game log at the moment of the crash plus the Exception block. **Read the sidecar first.** You rarely need a debugger. On the Read Game.log page, "Read every game window" lists the crash reports of each game copy, and "Read this crash" explains one.

The block shows the exception type, the name of the program function that failed, and a call stack. Read it this way:

- A tiny address in the exception (such as 0x28 or 0x54) is a null pointer: something the code referenced does not exist.
- Words in the function name point at the area: cannon means a towed gun's weapon or ammo; actor with sensor means a soldier with incomplete breed or vision data; chassis means wheels or tracks; ammo with reload means a reload on missing ammo; armor means damage; an SDL reader means a parse error.
- Look at the lines just above the block. The last warnings before the crash (`No Stuff found`, `Bone ... not found`, `Undefined material`, `unknown sound file`) are your suspects.
- Typical cases: a soldier sensor crash means one of the squad's breeds is incomplete (buy squads one at a time to find it); a cannon reload crash means a towed gun or howitzer with a missing ammo item.

The dump holds no data file names, so scanning its strings finds almost nothing useful. Dump size is set by a console variable (0 none, 1 small, 2 full). The 64-bit build writes small dumps by default; what the original build does by default is unconfirmed, so a crash there may produce a very large file.

If the game vanishes with no Exception block and no dump, suspect a stack overflow: the game had no room left to write its report. Undo your last change and bisect (section 8).

### Out-of-sync dumps

Multiplayer is **lockstep**: every machine simulates the same game, and at regular intervals each client sends checksums of the scene (units, positions, random numbers) and of the rules (scores, budgets). If the host sees a difference, the client shows a dialog and writes a dump into `log/oos/`, in a folder named after the local date and time with one file per player. Only the host, a desynced client or a flagged master writes, so you may find two or three files.

Tiny files (a few hundred bytes) hold checksums only. Large ones hold a full snapshot you can compare as text: take the host's file and a client's file from the same folder; if the rules checksum matches but the scene checksum differs, the scene diverged; the first differing line in the snapshots names the entity or field. A different random-draw count means the draws differed; a different entity count means a spawn happened on one side only.

The causes, most likely first:

1. **Different mod or pak content between players.** Everything must be identical, including load order. Compare `Repository: N resources` in each player's log.
2. A different game version, or a mix of 32-bit and 64-bit builds.
3. Interaction scripts reading something particular to one machine (profile, keys, options, graphics settings).
4. A model or file edited in a way the lobby does not check. The lobby compares some binary files only by size, and some types not at all, so a same-size edit passes the lobby and desyncs in play. Run `ARSENAL mpsync` ([chapter 20](20-packaging-and-release.md)).
5. A crash on one machine often shows as a desync on the others.

There is no live resync: desynced clients are removed.

### In Gates of Hell
<!-- goh: GHLOG-10 GHLOG-14 GHLOG-22 GHLOG-36 GHLOG-40 GHLOG-41 -->

- **Which errors leave a dump.** An ordinary error, a data file (SDL) error and an out-of-sync error write a minidump and a crash report, as in Assault Squad 2. Out of memory and a failed signature check show an `Error` box and end the game with exit code 2, with no dump. A DirectX error ends the game at once with no box and no dump: a Gates of Hell game that vanishes without a trace points at the graphics side first.
- **How many dumps are kept.** `dbg_minidumpFileLimit` (5 by default) is the number of minidumps kept in `log/minidumps/`; 0 deletes none.
- **Reports sent away.** Crash, out-of-sync and feedback reports are uploaded to the BugSplat service. A `BugSplat.ini` in the game's working folder with `Enabled=0` under `[BugSplat]` stops the uploads; none is shipped. No report is sent while any mod is applied or being switched, and the local minidump is written either way. Before the upload, copies of `log/game.log` and the dedicated server's log have the Steam id, the Steam name and the Windows account name replaced, but only names longer than 4 characters; your local `game.log` is not changed.
- **Out-of-sync dumps** compare to the bit: each number is followed by its bytes in hex, and binary records print as bytes. The report players send in probably starts with a fixed head (single or multiplayer, map, preset, seed, mod names, time played, the players); this is not confirmed.

## 8. Triage checklist and bisecting

1. Was there a crash? Look for `***** Exception *****` in `game.log` or a new file in `minidumps/`. If not, the problem is gameplay-side; look at warnings tied to your unit.
2. Read the sidecar: exception type, function, call path.
3. Read the 10 to 30 lines above the exception. The one with a file path in brackets is the culprit; open that file at that line.
4. For load-time `define not found` or `unexpected token`, take the file and line from the debug stack. For a define, search for `(define "<name>"` across the data and check the top-level include chain (the Editor page's "Find in files" can search the game's own files too). For a token, compare against a working sibling file and check bone names against the model.
5. Check mod state: `options.set` lists only the intended mod; the pak is newer than your edits; the pak was repacked after your last change; `Repository: N resources` is as expected. On the Read Game.log page, "Why is it missing?" checks the mod's `mod.info`, version lines, folder name and whether it is switched on (tick "Also check against the game's own load rules (slow, about a minute)" to ask the game's own rules as well), and "Check this unit" follows one unit from its file to its model, materials, buy card, army and picture and names the first broken link (tick "Also scan for broken links (slow)" for a deeper scan).
6. Compare with your baseline of known warnings.
7. **Bisect.** Revert your last edit (version control for text, your backup for paks), relaunch and test one unit in the LAN test bed. Or restore all paks from backup and reapply one at a time.
8. For a multiplayer desync, verify identical paks and versions on all machines first, then compare the snapshots.
9. Record the result. Do not delete logs until the finding is documented, and copy `game.log` before every relaunch.

Past crash causes worth remembering: a preset that was called but never defined, a weapon name that does not exist, a bone renamed in a model, and a mesh without a material.

## 9. Letting ARSENAL read the log

Three pages and three commands save time here. The commands are run as `ARSENAL <tool>` (see [Chapter 19: The Toolchain](19-toolchain.md)).

**The Read Game.log page** (Mods > Check & Fix > Read Game.log) reads the newest `game.log` without starting the game, and changes or deletes nothing. "Explain my last game log" turns it into cards in plain words, each marked STOPS, CRASH, CHECK, NOTE or OK and each with "What to do"; "Show the game's own text" shows the original lines. "Log files the game left" lists `game.log` and `game.prev.log` of each game copy ("Main game window", "Extra game window N"), with its crash reports and out-of-sync folders, newest first: "Read every game window" reads them all, "Read this crash" explains one crash report, "Look again" reloads the list, and "Pick another log folder..." reads a folder you copied aside. "Try these in the game" is a tick list of what to test after you play, made from the notes written when your mod was upgraded plus the basics; your ticks are kept in this browser, and "Clear the ticks" starts over. The other boxes of the page are in sections 2 and 8.

**The Editor page** (tab IDE) has a Game log panel: press "Read last log" (Ctrl+L) or "Read the newest log" after you played. A click on a finding opens your file at that line, and "Next log error" goes to the next one ([chapter 19, Editor](19-toolchain.md#game-log)).

**The Quick Guided Task** has the explore task "what went wrong in the last run": it reads the last run, lists its errors in plain words with the file and line each points at, and says what to do about each. It writes nothing, and its last step offers the change task "a mod with problems (fix them)". See [Quick Guided Task](19-toolchain.md#quick-guided-task).

**On a phone or tablet**, with LAN Remote on, you can read these results on another device while the game runs on the PC; it views only ([LAN Remote and the phone view](19-toolchain.md#lan-remote-and-the-phone-view)).

**`ARSENAL logtriage`** is the command behind those pages. It reads a log folder (or a single `game.log`), collapses duplicates, sorts messages into findings and known noise, and names the likely cause for each one. Given a folder, it also reads `game.prev.log`, the minidump sidecars and the out-of-sync folders:

```
ARSENAL logtriage <log folder> --summary
ARSENAL logtriage <log folder or game.log> --mod <mod folder> --game <game folder>
```

`--mod` marks which of the logged data paths your mod supplies, so you can tell your warnings from vanilla ones at a glance.

**The Play page and `ARSENAL play`** do a whole boot test: check the mod, install it into the game's `mods` folder, start the game on a test map in instance 1 with the mod active, and read `game.log` for the load verdict (BOOT). In the window, switch on "Let ARSENAL start the game" first; "play: dry run" shows every step and changes nothing.

```
ARSENAL play <mod folder> --dry
ARSENAL play <mod folder>
```

A clean BOOT means the game loaded your mod without an error. It does not mean the mod does what you meant, so still play it.

**`ARSENAL testrun`** drives a whole test through the 64-bit build's control pipe: it copies the old logs aside (never deletes), starts the game without sound, activates your mods, opens a LAN lobby, hosts a map, starts, waits for the map to load, quits, then runs `logtriage` and prints one summary. `--dry` prints the steps and launches nothing:

```
ARSENAL testrun --map multi/<map>:combat --exe <game folder>/as64.exe --dry
```

A map id looks like `multi/<map>:<mode>`, for example `multi/1v1_road:combat`; a bare map name gets the `combat` mode. The retail `mowas_2.exe` has no pipe, so `testrun` only works with the 64-bit build.

A scripted test can pass or fail with nobody watching. Be careful what you test for: a check that only says "no error appeared" proves little, because a broken mod can be just as quiet. Prefer a positive signal, such as a log line that only appears when your change worked.

Game length matters when you wait for the end of a match: a side that has no units at about 60 seconds of game time loses, and the match ends. A test that spawns nothing for one side finishes almost at once. A mod folder with a broken `mod.info` stops every launch, so check it first (`ARSENAL modinfo <mod folder>`).

### In Gates of Hell
<!-- goh: none; ARSENAL behaviour under the GoH header button (groups.js, x-log recipe, logtriage) -->

Under the GoH button the Read Game.log page reads the `game.log` in the Gates of Hell user folder (`logtriage --exe goh`), and so does the Quick Guided Task "what went wrong in the last run". The Play and Test Run pages are there too, but `play` and the test runs start only Assault Squad 2: the GoH editor does not start a mission by itself, and Gates of Hell has no control pipe. Start Gates of Hell yourself and read its `game.log` with the line forms of section 5 in mind. `logtriage` reads the Gates of Hell log form, but many Gates of Hell lines still come out as unknown kinds, so read its cards with care.

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. The per-change test loop | same as far as mapped | the same loop; ARSENAL can check a Gates of Hell mod but not start the game |
| 2. Launching and activating a mod | [differs](#in-gates-of-hell) | own user folder; the log names mods and paks; extra console helpers |
| 3. Controls cheat sheet for testing | not mapped | |
| 4. The LAN test bed | [differs](#in-gates-of-hell-1) | console settings for quick, repeatable test lobbies and bot-free matches |
| 5. The structure of `game.log` | [differs](#in-gates-of-hell-2) | every line stamped; `[EVT]` event lines; other place form; debug logs restart per mission |
| 6. Fatal errors and warnings | [differs](#in-gates-of-hell-3) | empty ammo id is fatal; missing fx bone is only a warning; `Unknown props` is gone |
| 7. Crash dumps | [differs](#in-gates-of-hell-4) | no dump on DirectX or memory errors; dump limit; reports uploaded to BugSplat |
| 8. Triage checklist and bisecting | same as far as mapped | the same method |
| 9. Letting ARSENAL read the log | [differs](#in-gates-of-hell-5) | Read Game.log reads the GoH log; Play and Test Run start no GoH game |

### Benchmark runs
<!-- goh: GHMIS-13 GHMIS-30 GHLOG-26 GHLOG-39 -->

Gates of Hell has a benchmark that Assault Squad 2 lacks. `dbg_benchmark start|stop [profile "<name>"] [camera "<name>"] [start_camera]` runs it from the console; the profiles are in `/set/benchmark.set`, and each run writes its results into a new folder under `benchmark/` named after the date and time. It measures FPS, the quant time in ms, the render time and the memory load in MB (the video memory value is always 0). A mission can start one with the `benchmark` command; a bad profile name answers `Invalid or unknown benchmark profile selected. Request rejected.`

## Pitfalls

- Trusting the main-menu footer to prove a mod is active. Read `options.set`, or "Show what is switched on" on the Read Game.log page.
- Forgetting that `game.log` is replaced at the next launch, and that only the 64-bit build keeps one earlier run.
- A leftover loose file overriding the pak you just rebuilt.
- Saving a string value as cp1251 in a `.set` or `.lng` file (it shows as boxes), or letting an editor rewrite the old cp1251 comment bytes of a copied vanilla file.
- Mistaking harmless noise for your bug, and mistaking a `No Stuff found` for noise.
- Testing a vehicle on a river that is really ground.
- Forgetting that friendly fire is on in the test setup.
- Taking `LOADS_STATIC` or a clean BOOT as proof that the change works.

## Engine reference

Warnings and errors are written by the engine's exception handler; the crash dump writer and the multiplayer sync checker are separate modules.

**Next:** [Chapter 19: The Toolchain](19-toolchain.md)
