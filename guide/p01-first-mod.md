# Make a mod and see it in the game

A mod is a folder in the game's `mods` folder. It holds a text file called `mod.info` (the mod's name and the game versions it works with) and the files the mod adds or replaces. This page makes a mod for the 64-bit build (`as64.exe`), checks it and switches it on.

## You need

- Men of War: Assault Squad 2 with `as64.exe` in its folder.
- ARSENAL, as a window or from a command prompt (type `ARSENAL.exe` where this guide writes `ARSENAL`).
- A text editor that keeps UTF-8 text and Windows (CRLF) line endings.

## The quick way

In the Quick Guided Task row above the tabs, set "I want to" to **make**, choose **a mod** and press Start. The task asks for the title shown in the game's mod list, where the mod goes (the game's `mods` folder is best, because the game lists it at once) and the folder name, then, if you like, a short description and the mods it needs. Review lists every file before Write; after that the task checks the mod and hands the test over to the Play page. See [Use the Quick Guided Task](p17-quick-guided-task.md). The steps below do the same by hand and show what each part does.

## Steps

1. **Tell ARSENAL where the game is.** In the window, press "Game folder..." in the top bar and pick the folder that holds `as64.exe` and the `mods` folder. The command way: `ARSENAL game` prints the folder found through Steam; if it is wrong, add `--game "<game folder>"` to any command.

2. **Make the mod folder.** In the window, open the Mods page and press "Make my first mod", or open the New mod card under the mod list. Fill in Folder, Name (the title shown in the game's Mods menu) and, if you like, Description. Press "new: dry run" to see what would be made, then "new" to make it. The command way:

   ```
   ARSENAL new mymod --name "My Mod" --dry-run
   ARSENAL new mymod --name "My Mod"
   ```

   Both make the folder name lowercase (spaces become `_`) and write a `mod.info` with [`MinGameVersion`](r01-mod-info-and-folder.md#mingameversion) 3.301 and no [`MaxGameVersion`](r01-mod-info-and-folder.md#maxgameversion), the form the 64-bit build wants, plus a text file for names and a readme. Whenever the window is about to write or start something, it first shows one confirm box that lists what will happen and where ([the confirm box](19-toolchain.md#the-confirm-box)). `ARSENAL new` makes 64-bit mods only; `ARSENAL newmod mymod --name "My Mod" --target mowas2` makes one for the original game.

3. **Put a change into it.** An empty mod changes nothing. For a first change, set a new price on one unit: see [Change a unit's numbers](p02-change-unit-numbers.md).

4. **Check it.** Open the Check page and press "Check the mod". The check only reads files; nothing is written and the game is not started. The command way: `ARSENAL check mymod`. The verdict `LOADS_STATIC` means that no known crash pattern was found. It does not prove that the mod does what you meant. The page groups what it finds by how bad it is and can write the safe fixes into a separate patch folder; see [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md).

5. **Play a test match.** Open the Play page. Tick "Let ARSENAL start the game" (it stays on until you close the window). Press "play: dry run" first: it lists every step and changes nothing. Then press "play". ARSENAL checks the mod, installs it, starts the game on a small test map with a separate copy of the game settings (never your own), and reads `game.log`. "BOOT OK" means the mod loaded and the match started. The command way:

   ```
   ARSENAL play mymod --dry
   ARSENAL play mymod
   ```

6. **Use it in your normal game.** On the Play page, card "Install into the game", press "install: dry run", then "install". The command way: `ARSENAL install mymod`. Then start the game, open Options and the MODS tab. Select your mod under "Deactivated", press `>>` to move it to "Activated", keep `as64+` in the Activated list above your mod, and press Apply. Applying takes about half a minute and needs no restart. More on the list in [The mod folder and load order](03-mod-folder-and-load-order.md#5-the-active-list).

7. **Confirm it is on.** The reliable check is the file `options.set` in your profile folder (under Documents, `My Games\Men of War - Assault Squad 2\profiles\<profile>\`): its [`{mods` block](r01-mod-info-and-folder.md#optionsset-mods) has one line per active mod, such as `"mymod:0"`.

8. **Undo when you want.** `ARSENAL uninstall mymod --yes` removes a mod that `install` put there, and nothing else. On the Play page, the card "Remove an installed mod" does the same with "uninstall". Your source folder stays as it was.

## What can go wrong

- **The mod is not in the Mods list.** The folder has no file named exactly `mod.info`, or its version range is empty. Make the folder with `new` and keep the `MinGameVersion` line.
- **The game stops at start or the mod is not applied.** A mod made for the original game (both `MinGameVersion` and `MaxGameVersion` set to 3.262) does not load beside `as64+`, and an AS64 mod (3.301) needs `as64+`. Do not mix the two kinds in one Activated list.
- **Nothing changes in the game.** A file in your mod counts only if its path below `resource/` is exactly the path of the game file it replaces. A wrong folder makes an extra file that nothing reads.
- **A copied file loses entries.** Your copy replaces the game's file as a whole; the game does not merge them. Copy the complete file, then change only what you need.
- **Text shows boxes or question marks.** Save every text file as UTF-8 without a byte-order mark and keep CRLF line endings.
- **The mod drops out of the Activated list.** The game knows a mod by its lowercase folder name, not by its title. Renaming the folder means switching it on again.
- **The log of the run you wanted is gone.** `game.log` is overwritten every time the game starts. Copy it before you start the game again.

More symptoms and their causes: [Troubleshooting](21-troubleshooting.md#2-symptom-the-mod-does-not-appear-in-the-list).

## In Gates of Hell
<!-- goh: GHVFS-01 GHVFS-02 GHVFS-04 GHVFS-05 GHVFS-13 GHVFS-24 GHVFS-25 GHVFS-26 GHVFS-27 GHVFS-29 GHVFS-36 GHLOC-01 GHLOC-09 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button.** The Mods page lists the mods in Gates of Hell's own `mods` folder, and the Check page checks a mod against Gates of Hell. The New mod card and the Quick Guided Task "make a mod" make a Gates of Hell mod; on the command line: `ARSENAL newmod mymod --name "My Mod" --target goh`. The Play page is there, but ARSENAL does not start Gates of Hell: put the mod in place and start the game yourself. It sets `MinGameVersion` and `MaxGameVersion` both to the version of your Gates of Hell program.
- **Folder name.** Gates of Hell skips a mod folder whose name has a space, a letter outside plain English, or any of `- + ( ) [ ] { } ! @ # $ % ^ & * = ; : | ' "`. The only sign is a warning in `game.log`. `my_mod` works; `my-mod` does not.
- **`mod.info`.** Each version bound may be left out, and a missing bound counts as open. A `Tags` line with the word `develop` lifts the version check. A `Priority` number (default 1) orders mods that do not need each other: the higher number is applied later and wins. A broken or empty `mod.info` only skips the mod, with a warning.
- **Where the files go.** Gates of Hell reads `resource/`, `N.pat` patches and `localizations/` in a mod. A `resource.pak`, `localization.pak` or `localization/` folder in the mod's root is not read: put paks into `resource/` and texts under `localizations/<language code>/` (see [Add or change text and translate it](p07-text-and-translation.md#in-gates-of-hell)). `newmod` still makes the 64-bit layout with a `localization/` folder, so move the text file.
- **No `as64+`.** That layer belongs to the 64-bit Assault Squad 2 build. Switch the mod on in Gates of Hell's own mod list.
- **Profile folder.** Settings and `game.log` live under Documents, `My Games\Gates of Hell\`, or under `%LOCALAPPDATA%\Digitalmindsoft\Gates of Hell\` when the Documents folder is on OneDrive.
- **Workshop mods** are known as `mod_<item number>`, not by their title.

To bring a unit or a whole mod from Gates of Hell into Assault Squad 2, see [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

## More

- Part II: [Getting started](01-getting-started.md), [The mod folder and load order](03-mod-folder-and-load-order.md), [Testing and logs](18-testing-and-logs.md), [The toolchain](19-toolchain.md).
- Part III: [mod.info and the mod folder](r01-mod-info-and-folder.md), entries [Mod](r01-mod-info-and-folder.md#mod), [Require](r01-mod-info-and-folder.md#require) and [as64+](r01-mod-info-and-folder.md#as64).
- The window: [Quick Guided Task](19-toolchain.md#quick-guided-task), [Use the Quick Guided Task](p17-quick-guided-task.md).
- Next job: [Change a unit's numbers](p02-change-unit-numbers.md). Before you share: [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md), then [Pack and share](p15-pack-and-share.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
