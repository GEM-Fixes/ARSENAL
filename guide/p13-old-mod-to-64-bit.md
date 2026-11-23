# Bring an old mod up to the 64-bit build

The 64-bit build of the game (`as64.exe`) runs in two modes. In **Classic** mode it loads mods written for the original game version 3.262. In **Enhanced** mode, which is on when the built-in package `as64+` is active, it loads only mods that declare a minimum game version of 3.301 or higher. The version lines in `mod.info` decide the mode. Upgrading makes a new copy with the right version lines and the changes the 64-bit build needs. The old mod is never written.

## You need

- The old mod folder. A Steam Workshop mod is fine: it is only read.
- Room for a copy next to it.
- The 64-bit build installed, and its folder known to ARSENAL.

## The quick way

In the [Quick Guided Task](p17-quick-guided-task.md) row above the tabs, set "I want to" to **change** and choose **an old mod to 64-bit**. The task asks for the old mod, where the new copy goes and a few extra choices, shows the upgrade plan at the review, then makes the copy in a new folder; the old mod is only read. It needs no mod picked at the top.

## Steps

1. **See what would change.**
   In the window: open Mods > Mods > Upgrade or Port, card "Upgrade an old mod to AS64". Fill in "Old mod" and choose the "Kind": "Enhanced (new AS64 features)" or "Classic (as close to the old mod as possible)". Press "See what changes".
   On the command line:
   ```
   ARSENAL upgrade <old mod> --to as64 --plan
   ```
   The report sorts each point into: read, would change, cannot do, needs a look, and test in game.

2. **Make the AS64 copy.**
   In the window: press "Make the AS64 copy" and confirm. The copy goes into a new folder next to the old one and becomes the current mod.
   On the command line:
   ```
   ARSENAL upgrade <old mod> --to as64 --out <new folder> --mode enhanced
   ```
   Use `--mode classic` for a Classic copy. `--then-fix` also runs the safe fixes and a check on the result. The copy holds an `UPGRADE.md` report. Exit code 3 means something was left out or findings remain.

   What the upgrade changes for you:
   - the version lines in `mod.info`: 3.262 to 3.262 for Classic, a minimum of 3.301 with no maximum for Enhanced;
   - a `mod.info` for a folder that had none;
   - include paths of files that moved in the 64-bit build;
   - text read as cp1251 rewritten as UTF-8 (the 64-bit build reads strings as UTF-8), and line ends set to CRLF;
   - the Workshop `FileId` line removed, so the copy can never be uploaded over the original item;
   - a `Require` line for a mod the 64-bit build already has built in, dropped;
   - `.dll` files left out: they are tied to one build of the old program.

3. **Check the copy.**
   In the window: the Check page, "Check the mod".
   On the command line: `ARSENAL check <new folder> --target as64`. `LOADS_STATIC` means no known crash pattern was found; it does not mean the mod works.

4. **Play a test match.**
   In the window: on the Play page, card "Play a test match", press "play: dry run" and read the steps, then "play". It uses its own game copy (instance 1).
   On the command line: `ARSENAL play <new folder> --dry`, then `ARSENAL play <new folder>`.

5. **Switch it on in your own game.**
   Install it (the Play page's "Install into the game", or `ARSENAL install <new folder>`). In the game, open Options, Mods, move the mod to Activated, keep `as64+` in Activated above an Enhanced mod, and press Apply. Applying takes about half a minute and needs no restart.

6. **Test what the report asked for.**
   On the Read Game.log page (Mods > Check & Fix > Read Game.log), "Try these in the game" is a tick list built from the notes written during the upgrade, plus the basics.

7. **Before you share it,** read [Pack and share](p15-pack-and-share.md). A mod made from someone else's needs that author's permission.

## What can go wrong

- **The mod is not in the list, or does nothing.** A mod in the wrong mode is switched off without a message. One `mod.info` cannot run in both modes; to reach both, keep two copies. A mod with no version lines at all is treated as unsupported.
- **The game will not start after a mode change.** A mod of the wrong kind left in the active list has caused a fatal `Unable to determine fallback font` before the menu. Take it out of the list.
- **Letters come out as boxes or as Cyrillic.** Old text in cp1251 shows as boxes on the 64-bit build until it is UTF-8. The upgrade converts it, and warns when a file looked like Western accented letters instead; fix those lines by hand.
- **Your own shader files** were built for the old program and may break rendering (unconfirmed).
- **A broken bot script passes unseen.** A Lua error no longer stops the game: the bot goes idle and the log says `Lua call failed`.
- **Animations look smeared.** Mesh-frame animations are blended every step now, so deliberately abrupt keys smear. This is only visual.
- **Behaviour changes with no sign in the data**, such as how weapons aim, are listed as behaviour warnings. Only a match shows whether they matter.
- **Multiplayer:** a Classic player cannot join an Enhanced game, and every player needs the same build and the same mod list in the same order.

## In Gates of Hell
<!-- goh: GHVFS-02 GHVFS-24 GHVFS-26 GHVFS-27 GHVFS-36 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **No Classic and Enhanced.** Gates of Hell has one mode and no `as64+`. Its version numbers are 1.x, so an Assault Squad 2 `mod.info` with 3.262 or 3.301 bounds is switched off there until the bounds are rewritten.
- **Version lines.** Each bound may be left out; a missing bound is open. A `Tags` line with the word `develop` lifts the version check, and so does the console command `dev_disableModVersionControl`. `Priority` (a number, default 1) orders mods that do not need each other.
- **Folder name.** A space, `-`, `+`, a letter outside plain English or another sign in the folder name makes Gates of Hell skip the mod with only a warning in `game.log`.
- **ARSENAL under the GoH button** hides the "Upgrade an old mod to AS64" card, and the task "an old mod to 64-bit" makes a Gates of Hell copy there. On Mods > Mods > Upgrade or Port the fold "Advanced: every upgrade setting" stays open there and can plan or write a port of an Assault Squad 2 mod for Gates of Hell. On the command line: `ARSENAL upgrade <mod> --to goh --plan`, then with `--out <new folder>`. It sets the version lines for the Gates of Hell version it finds (`--goh <GoH folder>` or `--goh-version`), and `--donor` swaps vehicle definitions for Gates of Hell ones.
- **Workshop mods** in Gates of Hell are known by `mod_<item number>`, not by their title.

## More

- Detail: [chapter 3, The mod folder and load order](03-mod-folder-and-load-order.md) ([the version gate](03-mod-folder-and-load-order.md#3-the-version-gate), [Classic and Enhanced](03-mod-folder-and-load-order.md#4-classic-mode-and-enhanced-mode), [Gates of Hell summary](03-mod-folder-and-load-order.md#gates-of-hell-summary)), [chapter 4, VFS, paks and patches](04-vfs-paks-patches.md), [chapter 21, Troubleshooting](21-troubleshooting.md) ([Classic and Enhanced problems](21-troubleshooting.md#11-symptom-classic-and-enhanced-mode-problems)). The window: [chapter 19, Quick Guided Task](19-toolchain.md#quick-guided-task).
- Reference: [r01, mod.info and the mod folder](r01-mod-info-and-folder.md) ([`MinGameVersion`](r01-mod-info-and-folder.md#mingameversion), [`MaxGameVersion`](r01-mod-info-and-folder.md#maxgameversion), [`FileId`](r01-mod-info-and-folder.md#fileid), [`as64+`](r01-mod-info-and-folder.md#as64), [`Tags`](r01-mod-info-and-folder.md#tags), [`Priority`](r01-mod-info-and-folder.md#priority)).
- Next: [Check a mod, fix it, read the log](p14-check-fix-read-log.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
