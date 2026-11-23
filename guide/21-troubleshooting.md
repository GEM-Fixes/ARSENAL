# 21. Troubleshooting

Something is wrong: the mod is missing, nothing changed, the game closes on start, a match falls apart, or a page of the ARSENAL window refuses to do something. This chapter is organized by symptom. Find the one that matches, read the likely causes in order, and follow the checks. For how to read the log files in depth, see [chapter 18](18-testing-and-logs.md).

The short way: [Check, fix and read the log](p14-check-fix-read-log.md) walks through the **Read Game.log** page of the window (Mods > Check & Fix > Read Game.log), which reads the log for you and explains each finding in plain words. The `mod.info` keys named here are listed in [Reference 1](r01-mod-info-and-folder.md), and the in-game console is described in [Reference 12, reaching the console](r12-bot-lua-and-console.md#8-reaching-the-console).

## What you will learn

- Where to look first for every kind of failure.
- The most common causes for each symptom, with the exact log messages to search for.
- What the ARSENAL pages mean when they refuse or find nothing.
- Which warnings are harmless background noise.
- How to bisect when nothing obvious shows up.
- What to attach when you ask for help.

## 1. Where to look first

Two places answer most questions.

**The game log.** The game writes `log/game.log` in your user data folder (under your Documents, in a folder named after the game). It is overwritten each time you start the game, so copy it before you relaunch if it holds something you want to keep. The original `mowas_2.exe` simply truncates the old log; `as64.exe` keeps the previous one as `game.prev.log`. Crash dumps go in `log/minidumps/`, and multiplayer desync dumps in `log/oos/`.

**Your profile's `options.set`.** The list of active mods lives in its `mods` block, one line per mod, in the form `"<mod folder name>:1"`. The folder name must match exactly, capitals included. On the original game this is the only reliable way to confirm which mods are active, because its log does not list the mods it loaded. `as64.exe` writes a `Mod '<name>' from ...` line for each mod it loads, so there the log answers the question too. A line that names a folder which is not installed is logged as `Mod '<line>' was disabled: Not installed.`

**In the window**, the **Read Game.log** page (Mods > Check & Fix, Assault Squad 2 and the 64-bit build) does both for you: "Explain my last game log" reads the newest log, "Show what is switched on" lists the active mods in their order, "Why is it missing?" explains why a mod or file does not load, and "Read this crash" reads a crash sidecar. If you run several game windows at once, "Read every game window" reads each one's log. "Pick another log folder..." points it at a different user data folder. The page is described in [chapter 18](18-testing-and-logs.md#9-letting-arsenal-read-the-log). In the **Quick Guided Task** row, the explore task "what went wrong in the last run" reads the same log step by step ([chapter 19](19-toolchain.md#quick-guided-task)).

**On the command line**, the same reading is:

```
ARSENAL logtriage "<user data folder>/log/game.log" --mod "<game folder>/mods/mymod" --game "<game folder>"
```

It groups repeated lines, labels harmless noise as information, and explains crashes and load errors in plain terms.

### In Gates of Hell
<!-- goh: GHVFS-13 GHLOG-07 GHLOG-08 GHLOG-12 GHLOG-16 GHLOG-36 -->

- The user data folder is `Documents/My Games/Gates of Hell/`. With `-useLocalDataFolder` on the command line, or when Documents lies in OneDrive, it is `%LOCALAPPDATA%/Digitalmindsoft/Gates of Hell/` instead. The log line `IO: Game config directory:` names the one in use.
- Every log line starts with the time since start, `[hh:mm:ss] `. Game events such as kills and flags are written as `[EVT]` lines.
- The log lists the mods: `Scanning mods in`, `Found N available mods`, `Mod: activate mod <name>`, and each mounted pak as `Mount package <file> with <n> entries`.
- A log grows to 250 MB, then goes on in a new numbered file. The multiplayer logs start over each mission, so copy them before the next one.
- At most 5 crash dumps are kept in `log/minidumps/` (`dbg_minidumpFileLimit`).
- Under the GoH header button, the Read Game.log page and the explore task "what went wrong in the last run" read the log in the Gates of Hell user folder.

## 2. Symptom: the mod does not appear in the list

1. **The folder has no file named exactly `mod.info`.** A folder without it is not a mod.
2. **The `mod.info` is unreadable.** Unknown keys are skipped silently, so a misspelled key leaves you with a half-read file. Worse, a `mod.info` the game cannot parse at all (for example an unescaped quote inside the description) stops the game from starting. Check with `ARSENAL modinfo "<game folder>/mods/mymod"`.
3. **The version range does not match.** A legacy mod needs both `MinGameVersion` and `MaxGameVersion`; without them it is treated as unsupported. A mod written for the older 3.262 data is hidden in the Enhanced game mode, and a mod that asks for 3.301 or later is hidden in Classic mode. The `vfs` tool reports a mode mismatch. See [chapter 3](03-mod-folder-and-load-order.md).
4. **A required mod is missing.** `Require` entries must be installed and active.
5. **A different mod's `mod.info` is broken.** One broken `mod.info` among your installed mods stops the whole game from launching, whether that mod is active or not. If the game exits instantly, look for a `***** Exception *****` block in `game.log`, and run `modinfo` over each folder in `mods/`.
6. **A Workshop copy on the 64-bit build.** `as64.exe` loads subscribed Workshop items from Steam's download folder. A copy of the same item inside `mods/` is ignored, and the log calls it an old copy. Rename your copy or unsubscribe.

### In Gates of Hell
<!-- goh: GHVFS-27 GHVFS-29 GHVFS-26 GHVFS-28 GHVFS-30 PORT-43 -->

1. **The folder name is not allowed.** A name with a space, a letter outside plain ASCII, or any of `<>+()[]{}!@#$%^&*-=;:|'"` is skipped, and only `game.log` says so: `Warning: invalid mod folder name`. Rename `my-mod` to `my_mod`.
2. **The `mod.info` is empty or broken.** Only that mod is skipped (`Warning: empty mod.info file found at`, `Warning: failed to load mod`); the game still starts.
3. **The version is on the wrong scale.** Gates of Hell versions are 1.x. A mod that asks for 3.301 is switched off with "Unsupported game version". Fix the bounds, leave them out, or add the tag `develop` while you work.
4. **A local copy of a Workshop item.** A folder `mods/mod_<item number>` loses to the Workshop item of that number (`Warning! Duplicate mod found`). A Workshop item outside a `workshop/content/` folder is skipped with `A workshop mod outside of standard location!`.

See [chapter 20](20-packaging-and-release.md#gates-of-hell-summary).

## 3. Symptom: listed, activated, but nothing changed

This is the most common failure, and it is nearly always a precedence problem.

1. **A loose file overrides your pak, or the other way round.** A loose file in `resource/` always beats the same path in the mod's root `resource.pak`. Against a pak that sits inside `resource/`, the folder scan order decides, and the later name wins, so a loose `entity/` folder loses to `entity.pak` beside it. Run `ARSENAL vfs "<game folder>" --mods mymod which set/stuff/gun/yourfile` to see the winner, or use "Why is it missing?" on the Read Game.log page. See [chapter 4](04-vfs-paks-patches.md).
2. **Another mod comes later in the load order** and replaces the same file. A mod that replaces a file replaces it whole, with no merging. Run `ARSENAL conflicts --game "<game folder>" --mods a,mymod`.
3. **Your pak's folder paths are wrong.** A pak in `resource/` must contain `entity/...` or `set/...` as its top folders. A pak that leaves them out puts files one level off, and nothing happens. See [chapter 20](20-packaging-and-release.md).
4. **A `.patch` file in the mod root.** Only patches inside numbered `N.pat` archives are read. Numbering must have no gap.
5. **A misspelled key.** Unknown keys are skipped silently. Run `keylint`, or "Check this unit" on the Read Game.log page. The keys themselves are listed in Part III of this guide.
6. **The mod folder was renamed.** A line in the profile that names a missing folder is dropped when the game starts. Re-activate the mod under Options, MODS.
7. **You did not press Apply, or the mod is still applying.** Applying takes about half a minute, and a very large mod can take minutes.
8. **A built-in or macro setting wins.** For example, if an armor macro sets a nonzero value for a side, it overrides your per-volume value. See [chapter 9](09-weapons-ammo-damage.md).

A quick sanity check is the `Repository: N resources` line in `game.log`: the number changes when files are added or removed, so it tells you quickly whether your pak was seen.

### In Gates of Hell
<!-- goh: GHVFS-04 GHVFS-05 GHVFS-25 GHVFS-36 GHVFS-09 GHLOG-16 -->

- **The pak sits in the mod root.** A root `resource.pak` and `localization.pak`, and a `localization/` folder, are never read. Put the pak into `resource/` and the texts into `localizations/<code>/`.
- **Mod order.** Mods that do not depend on each other are ordered by `Priority` in `mod.info` (1 when missing); a higher number applies later and wins.
- **A language file wins.** A file under `localizations/<code>/` is laid over `resource/` and probably beats the same path in any mod (not confirmed in game).
- To see whether your pak was mounted, look for `Mount package <file> with <n> entries` in `game.log`.

See [chapter 20](20-packaging-and-release.md#gates-of-hell-summary).

## 4. Symptom: the game closes while loading

Open `game.log`, search for `***** Exception *****`, and read the message directly above the stack.

| Message | Likely cause and fix |
|---|---|
| `define not found` | A macro call `("name" ...)` with no visible `(define "name" ...)`. Defines are visible only within the chain of includes of the top-level file. Add the define, include its file, or fix the name. |
| `unexpected token` | The parser expected something else. Common: a bone, volume or place name that no longer exists after a model swap, a missing or extra bracket, a number where a string belongs. The log names the file and line; compare the block with a working sibling file. |
| `String expected`, `Identifier expected`, `Block terminator expected`, `Block start expected` | Malformed text data. Check the file and line shown. |
| `Nested mods not supported` | A `(mod ...)` block inside another `(mod ...)` block. |
| `pattern not found` | A `{from "pattern X"}` base that is not defined. Define it or fix the name. |
| `Unknown material` | A material that is not in the game's material set. |
| `Bone modifiers must be placed after skeleton load` | A `{bone ...}` block appears before the model or skeleton line. Move it below. |
| `Extender not found`, `next state not found` | A reference to something the entity does not define. |
| `Resource not found`, `File is not found`, `Resource file ... read error` | A mesh, volume, animation or material named in the definition does not exist. Check the exact name and its capitalization. |
| `Invalid block in .VOL file`, `Unsupported animation version`, `At least one frame required`, `Zero speed in ik-bone` | Corrupt or wrong-format model data, or a bone with speed 0. |

Other causes without a precise message: a UTF-16 byte-order mark in a text data file, which is fatal; more than 128 distinct `{set}` flag names in the scripts, which stops loading; and a modern-format mod listed in a legacy game mode, which can crash on start (the font loader is where it shows up). Check the encoding rules: text files use CRLF line endings, string values are UTF-8 in data and `.lng` files alike, and identifiers are ASCII. A string saved as cp1251 loads without error but shows as boxes.

If the log shows no `Exception` block at all but the game vanishes, look in `log/minidumps/` for a new `.mdmp.log` file. Read it before anything else: it contains the log at the moment of the crash and the exception block.

### In Gates of Hell
<!-- goh: GHVFS-14 GHVFS-16 GHVFS-22 GHVFS-10 GHVFS-04 GHLOG-33 GHLOG-10 -->

| Message | Likely cause and fix |
|---|---|
| `Resource Error` at start | The mod replaces `set/registry.reg` or `set/registry/dlc.reg`. Leave both files alone. |
| `Failed to read file from pak <name>`, `Verify integrity of game files via steam` | A damaged entry in that pak. Repack it, or verify the game files in Steam if it is a game pak. |
| `empty ammo identifier` | A magazine names ammo with an empty id. |
| `invalid position` | A loose file of 2 GB or more. Put it in a pak. |
| `path is too long` | A file name with letters outside plain ASCII longer than 1023 bytes. |
| `Failed to mount localization` | The base game has no `localizations/` folder: verify the game files. |

Out of memory gives an `Error` box and no crash dump. A DirectX error closes the game at once, with no box and no dump; if the game vanishes without a dump, suspect the graphics side first.

## 5. Symptom: the game crashes only when something happens

A crash that appears when you buy a unit, fire a weapon or reload is usually a missing reference that the game substituted at load time and tripped over later.

- **`No Stuff found for tags 'X'`** (the log says "may lead to crash"). A weapon, ammo or inventory entry names a tag that matches nothing. The game substitutes a dummy and keeps loading; it crashes when the item is used, for example when a gun first reloads. Ammo tags have the form `<caliber> <type>`, and a wrong form is a typical mistake. This is the one warning that most often turns into a crash.
- **A model whose mesh has no material** crashes when you place the unit.
- **A soldier with incomplete breed or vision data** crashes when the game updates what he sees; buy squads one at a time to find the bad one.
- **A towed gun reloading with missing ammo** crashes on the reload; look for ammo name mismatches on towed guns and howitzer shells.

Read the `.mdmp.log` next to the dump, or press "Read this crash" on the Read Game.log page. A very small address such as 0x28 or 0x54 means "something it expected to exist does not". The crash text names the part of the game that failed, and that tells you where to look: weapons and ammo, a soldier's senses, wheels and tracks, armour and damage, or reading a data file. The lines directly above the exception are the last warnings before the crash, and they usually name the culprit.

### In Gates of Hell
<!-- goh: GHLOG-32 GHLOG-40 GHLOG-36 -->

- A weapon whose fire bone is missing does not crash: the log warns `Can't find fxBone in weapon ... held by ...`.
- Crash reports go to the game maker's crash service, but none is sent while any mod is applied. The local crash dump in `log/minidumps/` is still written, and at most 5 are kept.

## 6. Symptom: text is missing or shows as a key

- A name or description shows as a raw key or blank: the key is missing from your `.lng` file, or your `.lng` replaced a vanilla file and dropped keys. A `.lng` in a mod's `localization/` folder replaces the vanilla file with the same name wholesale; there is no merging. Use `loccover` to find missing and dropped keys.
- Garbled characters: the `.lng` file was saved in the wrong encoding. It must be UTF-8.
- `Localization key redefinition` in the log is normal and appears hundreds of times. A duplicate inside your own file is worth cleaning (the later one wins).

See [chapter 14](14-localization.md).

### In Gates of Hell
<!-- goh: GHVFS-04 PORT-42 GHNET-37 -->

- The game's own texts are `.pot` files. A mod's `localization/` folder is not read, so its `.lng` files show raw keys. Move them to `localizations/<code>/interface/text/`.
- A mod of another localization kind than the game logs `Localization mode ... does not match` and still loads.
- The session list takes the reason a game cannot be joined from the keys `mp/session_restriction/version`, `closed`, `performance`, `veterancy` and `player_limit`, so a translation needs them too.

See [chapter 14](14-localization.md#gates-of-hell-summary).

## 7. Symptom: models appear untextured or invisible

- A texture named by a `.mtl` file is missing or is in the wrong folder.
- A cloned mesh has no `.mtl` beside its `.ply` (a crash at mesh load).
- `Using bump material on non-bump geometry` means the mesh has no tangents but the material asks for bump mapping. Remove the bump or re-export the mesh.
- `Automatic MIP generation not supported` and `No MIP levels` are quality and performance warnings, not blockers; re-save new textures with mipmaps.
- A texture in a different format with the same base name can shadow the one you meant. `binhdr` reports texture extension shadowing.
- Models copied from Gates of Hell can have headers the Assault Squad 2 engine rejects. Run `ARSENAL binhdr "<game folder>" --mods mymod --summary`. Gates of Hell content can never be shared, only used for your own play.

See [chapter 16](16-effects-sound-models.md).

## 8. Symptom: units that cannot move, cannot be selected or do not fire

These have many causes, and several are not confirmed, so treat the list as places to look.

- **Bones.** `Bone X not found` and `Can't find bone X` mean a modifier is ignored or shots spawn at the origin. After a model swap, names such as the turret or machine-gun bones are the usual victims. Wheeled vehicles need front and back pivot bones; without them the log says `no "pivot_back" bones` and the wheel offsets fall back to defaults.
- **Locomotion data.** Run `movlint` (see [chapter 7](07-units-vehicles-movement.md)).
- **Sensors and vision.** A soldier who never reacts can have broken sensor values (see [chapter 10](10-ai-and-bots.md)).
- **A unit that cannot be selected** (unconfirmed): compare its definition against a working unit of the same class and check that it sits in the right entity folder. Copy a vanilla unit in unchanged first, then change one thing at a time.
- **Sound missing**: `unknown sound file 'folder/name'` means the name does not match a folder or file in the sound data. There are no aliases.

## 9. Symptom: armor and damage surprises

- Armor does nothing after you edit a volume: a nonzero macro value for that side overrides the per-volume value. Edit the macro arguments.
- A penetration table is ignored: the table must sit in a block whose tags match the ammo tags exactly; a table for one ammo type is not used by a related type.
- `unknown volume thickness`: the thickness trace found nothing, and the game uses the volume's own thickness. If it repeats for one unit, check its volume file.
- `Incorrect thickness for volume` means a volume that should accept hits has zero thickness on a side.
- A `{set ...}` with an ability level that does not exist (`invalid level param`) makes the soldier a top-level ability, silently. This is a silent buff.

The Armor page under Models shows the armour of a vehicle as the game reads it, with your mod laid over the game, and which shells go through at which range. See [chapter 9](09-weapons-ammo-damage.md) and [chapter 8](08-infantry-and-humans.md).

## 10. Symptom: multiplayer desync and lobby mismatch

- **The lobby shows a data mismatch or refuses the join.** The two players' data trees differ. The host denies a join unless the data and map checks match, or unless the host allows desync.
- **The lobby is happy, then the match drops into "out of sync".** Most often the players have different mod or pak contents. Model, volume, material, animation and script files are compared only by size, so a same-size edit passes the lobby and diverges later. Compare the `Repository: N resources` number in each player's log, or let each player export a fingerprint with `ARSENAL mpsync --game "<game folder>" --mods a,b --export fp.json` and compare the two files with `ARSENAL mpsync --compare a.json b.json`.
- **Other causes**: a different mod load order; different game versions or 32-bit against 64-bit; and scripts that read per-machine state such as keys, graphics or the profile.
- **A crash on one machine often shows up as an out-of-sync on the others.** Check for a crash first.

Look in `log/oos/`. A tiny file holds only checksums. A large one is a full snapshot you can text-compare between host and client: the first differing line is the diverged entity. If both checksums differ in the first check and the files are tiny, suspect mismatched mod content. See [chapter 12](12-missions-and-multiplayer-setup.md) and, for what the lobby compares, [chapter 20](20-packaging-and-release.md#6-multiplayer-compatibility).

### In Gates of Hell
<!-- goh: GHNET-22 GHNET-35 GHNET-37 GHNET-28 GHNET-69 GHNET-88 GHNET-98 GHNET-75 GHNET-15 GHVFS-35 -->

- **A game is not listed or cannot be joined.** Only hosts with the same game version and the same build (`x64`) are listed; a game can also be closed, full, or outside your performance or veterancy range.
- **No out-of-sync message, but the match plays differently on each PC.** By default Gates of Hell does not compare checksums of the game state (`mp_syncLevel` 0), so differing mod files probably do not stop the match. Check that every player has the same mods from the Workshop.
- **A player lags.** The host waits up to 1000 ms for a lagging client (`mp_maxClientlag`), where Assault Squad 2 waits 750 ms.
- An out-of-sync dump that would unpack to more than 64 MB is refused: `OOS dump rejected: implausible unpacked size.`
- Gates of Hell never plays with Assault Squad 2 or its 64-bit build.

See [chapter 20](20-packaging-and-release.md#gates-of-hell-summary).

## 11. Symptom: Classic and Enhanced mode problems

- A mod silently does nothing in one mode: its version declaration puts it in the other mode. Modern mods declare a minimum of 3.301 or higher; legacy ones declare 3.262. Check `modinfo` and `vfs`.
- A modern mod beside legacy content can crash on start.
- A mod needing the built-in extras does not load in Classic.

Chapter 3 explains how to make a mod work in both.

## 12. Symptom: poor performance

(Unconfirmed in detail; these are things to try.) Very large mods mount slowly. Textures without mipmaps and bump materials on meshes that cannot use them cost time. Thousands of loose files mount more slowly than a few paks. Pack the mod and re-save textures with mipmaps.

### In Gates of Hell
<!-- goh: GHVFS-18 GHVFS-15 -->

A pak written without CRCs makes the game write `no crc for file in package ... performance may be slowed` for every entry. Repack it with a tool that stores real CRCs. Text entries of paks are kept in memory after their first read, and model entries are read from the pak each time they are opened.

## 13. Symptom: an ARSENAL page refuses or finds nothing

These are the messages of the window, with what they mean and what to do.

**Copying a model into your mod (Models page).**

- "Pick your mod folder first." The page copies into the mod you picked at the top of the page. Pick it, then press "Copy into my mod" again.
- "No files were found for this model." The model's name was found, but none of its files are in the game data the page can see. Check the name, and check that the game folder at the top of the window is right.
- The copy is refused because the target is inside the game. ARSENAL never writes into the game's own data, Steam's Workshop downloads or the Steam library folders. It writes only into a mod folder under `mods/`. Pick a folder there, or make a new mod with the New mod card on the Mods page.

**SOEdit is not found (Models page).**

- "SOEdit was not found on this computer. The button below downloads and installs it, then opens it." Press "Get SOEdit and open it". ARSENAL downloads the latest SOEdit release from GitHub ([ThatFrostyy/SOEdit-PatchByFrostyy](https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy/releases)), checks its size and, when GitHub lists one, its checksum, unpacks it into `%LOCALAPPDATA%\ARSENAL\soedit` and starts it: "SOEdit was downloaded, installed and started."
- ARSENAL looks for SOEdit in this order: the path in the environment setting `ARSENAL_SOEDIT`, the `soedit` folder next to `ARSENAL.exe`, the copy it downloaded, the copy of an installed ARSENAL, then a few folders of your own (PATH, Desktop, Downloads, Documents). SOEdit is not part of the ARSENAL download; it comes through this button or `ARSENAL soedit install`. `ARSENAL soedit locate` prints what it found.
- "The latest release could not be read from GitHub." Check the network and try again, or set `ARSENAL_SOEDIT` to the path of a `SOEdit.exe` you already have.
- "There is no SOEdit download for this copy of ARSENAL yet." Set `ARSENAL_SOEDIT` to the path of a `SOEdit.exe` you already have.

See [chapter 19](19-toolchain.md#soedit-models-in-soedit).

**The armour table is empty (Models page, Armor).**

- "Pick a vehicle at the top of the page first (type its name in the search)." The simulator works on one vehicle at a time.
- "The armour of this model was not found. Pick a vehicle by its name at the top of the page." You picked a model file rather than a vehicle, or a name that has no vehicle definition. Search by the vehicle's name.
- "This model has no armoured parts that the simulator can read." The vehicle exists, but none of its volumes carry armour the simulator understands, for example an unarmoured truck or a vehicle whose armour comes only from a macro it cannot follow. `ARSENAL armorsim table` shows the same table on the command line.
- "Pick your mod folder at the top of the page first." Armour is read with your mod laid over the game, and changes are written only into your mod.

**The guide index is missing (Guides & External Tools page).**

- "The guide index was not found." The Guides & External Tools page reads a folder that holds `guides.json` and a `builtin` folder. It looks for it in the folder given with `--data`, then the folder in the environment setting `GEM_INDEX_DIR`, then the `gemindex` folder next to `ARSENAL.exe`. If your copy of ARSENAL came with a `gemindex` folder, keep it next to the program. Otherwise press "Pick the index folder" and choose the folder of the GEM External Index toolkit; the choice lasts until ARSENAL closes. The "What ARSENAL can and can't make" tab works without the index.

**The Quick Guided Task shows a task grey or switches the game.** See [Quick Guided Task](19-toolchain.md#quick-guided-task) and [Use the Quick Guided Task](p17-quick-guided-task.md).

- A grey task names its reason: "not built yet", "not for" and the game, "needs a mod picked" (pick one on the Mods page), "needs the game folder" (set it at the top of the window), or "only on the PC, not from another device" (tasks run only on the PC, not over [LAN Remote](19-toolchain.md#lan-remote-and-the-phone-view)).
- "Tasks could not be loaded: ..." The list of tasks did not load. Restart the window; if it stays, attach the message when you ask for help.
- Under Gates of Hell, a button that leads to a page Gates of Hell does not have, such as "Go to the Play page" or "Share the mod", switches the header to the other game: "That page belongs to ...: switched to ...". Switch back with the game picker in the header.
- "Throw away" deletes a saved task with its answers and the files you brought. Files the task already wrote into your mod stay; undo them with the Editor's restore points.

**The Docs page finds nothing (Help & Docs > Docs).** See [Whole documents](19-toolchain.md#whole-documents).

- "No documentation found". The documents are not inside the program file. Keep the `guide` folder that came with the program next to it, or a folder named `docs`, then press "Look again".
- "... is not made yet." A whole document (Doctrine atlas, Modding guide, Engine document) is not there. With Advanced on, the line names the command that makes it.
- "That document is not here any more. Pick another on the left." The file was moved or deleted while the page was open.
- "The PDF could not be opened." The PDF is in the folder `guide`, then `dist`, next to the program (the engine document: `techdoc`, then `dist`).
- The search box finds nothing inside an open whole document: it searches the chapters. Click into the document and use Ctrl+F.

**A file viewer refuses (Editor and dialogs).** See [File viewers](19-toolchain.md#file-viewers).

- "Pick a mod first: the file is looked up in it."
- "No viewer for ... is installed." The file kind has no viewer in this copy of ARSENAL.
- "The viewer could not open the file: ..." The file is damaged or not what its name says. The message names the reason.
- "The game does not read .zip files, so their entries cannot be opened here." Use a `.pak`.
- "That name opens another copy (a loose file or another pak comes first), so this entry cannot be opened by name." The entry is hidden by a copy that wins; see section 3.
- A sound note says an `.ogg`, `.mp3` or `.flac` file was renamed to `.wav`: the game stays silent. Convert it to a real `.wav`.
- A picture note says "DX10 header: the game cannot load it". Save it as DXT1, DXT5 or 32-bit A8R8G8B8.
- "This browser cannot play sound (no Web Audio)." Open the window in another browser.

**LAN Remote and the phone view.** See [LAN Remote and the phone view](19-toolchain.md#lan-remote-and-the-phone-view).

- "No network address found. Is this PC connected to a network?" Connect the PC to your home network and switch LAN Remote on again.
- "Could not listen on: ..." LAN Remote could not start; the message names why. The first time, Windows may ask whether node may use the network; answer it yourself.
- "This link no longer works" on the other device: someone pressed "New link" on the PC. Scan the new code.
- A wrong key 20 times locks that address out for 10 minutes. Wait, then open the current link.
- Running tools, saving and starting are refused on the other device: "View only. Changes are made on the PC." Make the change on the PC. Files outside the game and mod folders are refused.

**Arrange mode.** See [Arrange mode](19-toolchain.md#arrange-mode).

- The page's buttons do nothing: Arrange is on. Press Esc or Done.
- A part of a page is gone: it was hidden. Start Arrange (on Tools & Settings > Settings, or Ctrl+K "Arrange This Page") and use "Show" with its name, or "Reset this page" in the fold "Profiles, import and reset".
- "This file is not an ARSENAL layout profile." Import only a file made with Export.
- Window settings are kept in `%LOCALAPPDATA%\ARSENAL\settings.json`. A damaged file is set aside as `settings.json.bad-<time>` and the settings start empty.

**The confirm box.** Every step that writes or starts a program asks first, with "Do it" (or the step's name) and "Cancel". Nothing is written before you confirm, so a cancelled step changed nothing. On a risky step the focus starts on Cancel, so Enter alone does nothing. See [The confirm box](19-toolchain.md#the-confirm-box).

**The Workshop uploader and the clean copy (Share page).** See [The ARSENAL Workshop uploader](20-packaging-and-release.md#the-arsenal-workshop-uploader).

- "This copy of ARSENAL does not hold the uploader files (the workshop_gui folder is missing)." Use the full ARSENAL download and keep its `workshop_gui` folder next to the program.
- The box says "the uploader in the game folder is not the copy ARSENAL has": put it there again, and `workshop_gui.exe` is replaced.
- "This is not a game folder of Assault Squad 2 or Gates of Hell": the folder you typed holds none of `as64.exe`, `mowas_2.exe` or `call_to_arms.exe`.
- A copy fails: close the uploader and the game, and check that the folder is not read-only.
- The uploader opens but cannot upload: Steam must be running and signed in.
- "the folder ... already has files in it. Pick an empty place, or remove it yourself first." The clean copy goes only into an empty folder.
- "Not this folder: ... is inside the game folder" or "inside a Steam folder": the package goes to a folder of your own, for example the Desktop.
- "this mod holds Gates of Hell content (GOH-ORIGIN.tsv)": such a mod is never packed or uploaded. See [chapter 20](20-packaging-and-release.md#5-the-pre-release-gate).

**A page is missing, or says "Not available".** Every game shows the same nine tabs and pages; under Gates of Hell the Units sub-tab adds the GoH unit page. A part of a page that cannot work for the game you picked shows "Not available in" and the game, with the reason, in place of its buttons. Some items, such as Mod Files and Expert Tools, show only with Advanced on: turn it on at Tools & Settings > Settings. See [the pages of the window](19-toolchain.md#3-the-pages-of-the-window).

**Other refusals.** Any page that writes refuses a target inside the game install other than `mods/<name>`, and anything under Steam's Workshop content. A refusal never changes a file. Pick a mod folder of your own and try again. The one exception is the Workshop uploader: after a confirm, the Share page copies its three files into the game folder.

### In Gates of Hell
<!-- goh: none; ARSENAL under the GoH header button (groups.js, goh and share pages, task recipes) -->

- "No Gates of Hell install was found on this PC, so this page is off." The GoH unit page needs a Gates of Hell install. Install the game through Steam, or check that ARSENAL finds it.
- "No Assault Squad 2 folder is set. Choose it on the Mods page first." A unit from Gates of Hell is written into an Assault Squad 2 mod, so that game folder must be set too.
- The task "a mod with problems (fix them)" only looks under Gates of Hell; it writes nothing. The Check page's fix steps write a Gates of Hell patch mod but leave out the fixes that follow Assault Squad 2 rules, each with a line saying why.
- "Not available in GoH" on a part of a page is expected, not a fault: for example the Armor part of Models, the bot shopping list, Bot Doctrine, Map Scripts for AI, the price calculator and the test runs. The reason is on the same line.
- A mod in the Gates of Hell `mods` folder that ARSENAL did not make is written only with Advanced on; a mod ARSENAL made there, or a new one, is written without it.
- The Share page under GoH puts the Workshop uploader into `binaries\x64`; the `steam_api64.dll` already there is never overwritten.

See [chapter 19](19-toolchain.md#units--balance-under-goh).

## 14. Benign messages

Do not chase these. They appear in vanilla and in most modded installs:

- `Localization key redefinition` (hundreds of lines)
- `Mission ... is skipped` for leftover mission titles
- `Entity redefinition` for helmets, bushes, wire, wrecks and shells
- `Automatic MIP generation not supported`, `No MIP levels`
- `No obstacle ID`, `unknown terrain_pp type`, `use_blend_tex`
- `Media file ... story not found`
- `Unknown control panel item` for trench items
- `Invalid ricochet angle` (cosmetic; the game clamps it)

The rule: a warning line names a file, not a mod, so judge a warning by the file path in parentheses. Compare a log from before your change against one after; new message types or higher counts of `No Stuff found`, `Unknown props`, `Unread data`, `Can't preload` or `invalid level param` are yours. The Read Game.log page marks the harmless ones as notes.

### In Gates of Hell
<!-- goh: GHLOG-31 GHVFS-18 GHLOG-08 GHLOG-07 GHVFS-04 -->

- `Unknown props` is no longer written, so do not count it.
- `no crc for file in package ... performance may be slowed` appears once per entry of a pak written without CRCs: harmless for loading, but repack your own paks.
- `[EVT]` lines are game events (kills, flags, zones), not errors.
- `Localization mode ... does not match` for a mod of another localization kind: the mod still loads.
- Every line starts with `[hh:mm:ss] `; strip it before you compare two logs.

## 15. A decision tree

1. Does the game start? If no, read the top of `game.log` and look for an Exception block (section 4, then section 2).
2. Is your mod active? Check `options.set`, or "Show what is switched on" (section 1 and section 2).
3. Did the log show a fatal message? Fix it (section 4).
4. Does the log show a new warning with your file path? Fix it.
5. Does the change have no effect? Walk section 3.
6. Does it crash in play? Section 5 and the crash sidecar.
7. Multiplayer only? Section 10.
8. Does an ARSENAL page refuse? Section 13.
9. Still nothing? Bisect: revert your last edit (git for text, a backup for paks), relaunch, and check one unit at a time in a LAN match.

## 16. What to attach when you ask for help

- `game.log` from the failing run, copied before relaunching.
- The `.mdmp.log` sidecar if there was a crash (not the large dump).
- The mod's `mod.info` and the contents of the `mods` block in `options.set`.
- The output of `ARSENAL doctor "<game folder>/mods/mymod" --game "<game folder>"`.
- The game executable and version (`mowas_2.exe` or `as64.exe`), and whether you are in Classic or Enhanced mode.
- For multiplayer: both players' logs and the `log/oos/` folder.
- One sentence on what you changed last.

In the window, **Help & Docs > Start Here** has a "Get help" box: "Make diagnostics text" lists the game folder, the game program, your mods and the end of the newest `game.log`, with your user name replaced by `%USERPROFILE%`. "Copy" puts it on the clipboard to paste into your message.

Do not delete logs until you have written down the finding.

### In Gates of Hell
<!-- goh: GHVFS-13 GHLOG-12 GHLOG-36 GHNET-22 -->

- The logs are in the Gates of Hell user data folder (section 1), which may be under `%LOCALAPPDATA%` instead of Documents.
- Copy the multiplayer logs right after the mission: the next mission starts them over.
- Give the game version (1.067 and its patch number) and the mod list with each mod's `Priority`.
- Say which game the problem is in. A Gates of Hell finding may not hold for Assault Squad 2, and the other way round.

## Gates of Hell: summary
<!-- goh: GHVFS-04 GHVFS-27 GHLOG-07 GHLOG-40 GHNET-69 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In short |
|---|---|---|
| 1. Where to look first | [differs](#in-gates-of-hell) | Own user data folder, time-stamped lines, mods and paks listed in the log |
| 2. The mod does not appear in the list | [differs](#in-gates-of-hell-1) | Strict folder names, 1.x versions, a broken `mod.info` skips only that mod |
| 3. Listed, activated, but nothing changed | [differs](#in-gates-of-hell-2) | Root paks and `localization/` unread; `Priority` orders mods |
| 4. The game closes while loading | [differs](#in-gates-of-hell-3) | New fatal messages: `Resource Error`, damaged pak entry, `empty ammo identifier` |
| 5. Crashes only when something happens | [differs](#in-gates-of-hell-4) | Missing fire bone warns instead of crashing |
| 6. Text is missing or shows as a key | [differs](#in-gates-of-hell-5) | `.pot` texts; mod `.lng` only under `localizations/` |
| 7. Models untextured or invisible | not mapped | |
| 8. Units that cannot move, be selected or fire | not mapped | |
| 9. Armor and damage surprises | not mapped here | See [chapter 9](09-weapons-ammo-damage.md#gates-of-hell-summary) |
| 10. Multiplayer desync and lobby mismatch | [differs](#in-gates-of-hell-6) | Same version and build; no checksum desync check by default |
| 11. Classic and Enhanced mode problems | not mapped | Gates of Hell versions are on the 1.x scale (section 2) |
| 12. Poor performance | [differs](#in-gates-of-hell-7) | Paks without CRCs flood the log |
| 13. An ARSENAL page refuses or finds nothing | [differs](#in-gates-of-hell-8) | Some parts "Not available" under GoH; GoH unit needs both games |
| 14. Benign messages | [differs](#in-gates-of-hell-9) | `Unknown props` gone; `no crc` and `[EVT]` lines |
| 15. A decision tree | same as far as mapped | Use the Gates of Hell notes of each section |
| 16. What to attach | [differs](#in-gates-of-hell-10) | Other log folder; copy multiplayer logs per mission |

### Crash reports in Gates of Hell

Gates of Hell sends crash and out-of-sync reports to its maker's crash service, but not while any mod is applied, so a modded crash leaves only the local dump in `log/minidumps/`. A `BugSplat.ini` file read at start with `Enabled=0` stops the uploads; the game ships none. Out of memory shows an `Error` box and writes no dump; a DirectX error closes the game at once with no box and no dump.

## Pitfalls

- Removing the log before you read it. The next launch overwrites it.
- Fixing three things at once, so you never learn which one mattered.
- Assuming a clean linter run means the game will accept the mod.
- Reading a Gates of Hell log with Assault Squad 2 rules: the folder, the line stamps and several fatal messages differ.

Next: [Chapter 22, Glossary](22-glossary.md).

<!-- internal -->

Engine reference: `logs/fatal`, `logs/warnings`, `logs/triage`, `logs/minidump`, `logs/oos`.

<!-- /internal -->
