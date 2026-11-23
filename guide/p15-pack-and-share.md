# Pack and share

A mod that works on your computer must reach other players with the right version lines, no stray files, correctly packed paths, and the same data for everyone in a match. The Share page walks through this and shows what it will write before it writes.

## You need

- A mod that passed the check and a test match (see [Check a mod, fix it, read the log](p14-check-fix-read-log.md)).
- A preview picture: PNG or JPG, under 1 MB.
- For the Steam Workshop: Steam running and signed in. The Workshop uploader, `workshop_gui.exe`, comes with ARSENAL; the Share page puts it into the game folder for you (step 4).

## The quick way

In the [Quick Guided Task](p17-quick-guided-task.md) row above the tabs, set "I want to" to **make** and choose **a release**. The task asks for the name, text and version, the picture, runs the release check, makes the package and the clean Workshop copy in a folder you pick, and makes a play card for friends; "More checks" covers mods played together and a game update. The upload itself stays on the Share page: the task does not put the uploader into the game folder or start it.

## Steps

1. **Describe the mod.**
   In the window: open the Share page, step "About my mod". Fill in "Name", "Description" and "Version". Under "Which game version can friends use?" pick "Older game (Classic, 3.262)" or "Newer game (Enhanced, 3.301 and up)". Press "Show what will change", then "Save to mod.info". Under "Preview picture" press "Choose picture..." and "Use this picture"; it is copied into the mod as `preview.png` or `preview.jpg`.
   On the command line: `ARSENAL modinfo <mod folder>` reports what the game makes of `mod.info`; edit it in a text editor, keeping CRLF line ends.

2. **Check that it is ready.**
   In the window: "Ready to share?", press "Check if ready". Tick "Also run the check for known crash problems (slower)" for the full check. It checks `mod.info`, the version range, name, description, version and picture, stray files (`.git`, notes, `UPGRADE.md`), Gates of Hell content, and whether the files can be packed.
   On the command line:
   ```
   ARSENAL check <mod folder>
   ARSENAL packer <mod folder> --dry
   ARSENAL release-check --publish <mod folder>
   ```
   The last line refuses (exit 1) a mod that still holds Gates of Hell files.

3. **Package it for friends.**
   In the window: "Package for friends". Choose the "Folder to write into", press "Show plan", then "Write package".
   On the command line: `ARSENAL packer <mod folder> --out <folder>` (without `--out`, or with `--dry`, it only plans).
   A friend puts the mod folder into the game's `mods` folder, then in the game opens Options, Mods, moves it to Activated (with `as64+` above it for an Enhanced mod), and presses Apply. The game applies the mods in about half a minute; no restart is needed.

4. **Upload to the Steam Workshop.**
   In the window: "Workshop" shows the checklist. Press "Show what the clean copy holds", then "Make clean copy".
   The box "Workshop uploader" says whether the uploader is in the game folder. Press "Put the uploader into the game folder"; the page lists each file it will copy, then "Copy these files now" copies them beside the game program. A `steam_api64.dll` or `steam_appid.txt` already in the game folder is never overwritten, and no other game file is touched. "Another game folder, for example Gates of Hell" puts it into another game instead of the one ARSENAL is set to. Then press "Open the Workshop uploader" (Steam must be running and signed in), choose the clean copy folder, fill in the title and the picture, and press Upload. On the first upload the uploader writes the Workshop ID into `mod.info`. "Check again" looks at the game folder again.

5. **Release a new version.**
   In the window: "New version". Pick "Small fix (1.0 to 1.0.1)", "New things (1.0 to 1.1)" or "Big change (1.0 to 2.0)", write a "Change note" press "Show what will happen", then "Set the new version". Then check, make the clean copy and upload again.

6. **Play together.**
   In the window: "Play together" makes a short text card for your friends' chat: which mods, in which order, on which game build. Press "Make the card". "Mods together" takes two or more installed mods and, with "Show clashes", lists the files and values they both change. The last mod in the list wins every clash.
   On the command line:
   ```
   ARSENAL conflicts --game <game folder> --mods a,b
   ARSENAL mpsync --game <game folder> --mods a,b --export fp.json
   ARSENAL mpsync --compare a.json b.json
   ```

7. **After a game update.**
   In the window: "Game updated?", press "Check for a game update".
   On the command line: `ARSENAL release-check` compares the game with the last known build, and `ARSENAL release-check --replan <mod folder>` shows what the changes hit in your mod.

## What can go wrong

- **Friends cannot see the mod.** A mod with no version range, or for the other mode, is switched off without a message. To reach both Classic and Enhanced players, share two copies.
- **Files packed one folder off.** A pak placed directly in the mod's `resource/` folder must hold its top folder names, such as `entity/...` or `set/...`, inside it. Let the packer build the paks.
- **A loose `.patch` file is never read.** Only patches inside a numbered `N.pat` archive are.
- **The Workshop gets everything in the folder**, including `.git`, notes and development files. Upload the clean copy.
- **Changing the Name after the first upload** changes the mod's folder name on every subscriber's computer.
- **Keep the `FileId` line** in `mod.info`. It ties the folder to your Workshop item.
- **A desync in a match although the lobby agreed.** The lobby compares model, volume, material, animation and Lua files by size only. If a changed binary file kept its size, also change a text file so the lobby sees a difference.
- **Gates of Hell content can never be shared or uploaded.** The packer refuses a mod that still holds it.
- **A mod made from someone else's** needs that author's permission. Name the original mod and its author in the description, and share it as a new Workshop item, not as an update of theirs.

## In Gates of Hell
<!-- goh: GHVFS-01 GHVFS-02 GHVFS-03 GHVFS-04 GHVFS-24 GHVFS-27 GHVFS-36 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** has the Share page: it fills in `mod.info` with the Gates of Hell version range, packs in the Gates of Hell layout and runs the release checks against Gates of Hell. The release task of the Quick Guided Task is greyed. "Put the uploader into the game folder" puts the Workshop uploader beside the Gates of Hell program in `binaries\x64` and does not overwrite the `steam_api64.dll` there.
- **Packing.** Gates of Hell reads only `resource/`, `N.pat` and `localizations/` in a mod. A `resource.pak`, `localization.pak` or `localization/` in the mod's root is not read there: put paks into `resource/`.
- **`mod.info`.** Use Gates of Hell's own version numbers (1.x); each bound may be left out. `Tags` may hold `develop` (any game version) and `no_delete` (no delete button in the mod list). `Priority` orders mods that do not need each other.
- **Folder name.** No space, `-`, `+` or other sign, or Gates of Hell skips the mod. Subscribers see a Workshop mod as `mod_<item number>`.
- **Gates of Hell content in an Assault Squad 2 mod** can never be shared: the packer and the release check refuse a mod whose `GOH-ORIGIN.tsv` files are still in it.

## More

- Detail: [chapter 20, Packaging and release](20-packaging-and-release.md) ([the pre-release gate](20-packaging-and-release.md#5-the-pre-release-gate), [multiplayer compatibility](20-packaging-and-release.md#6-multiplayer-compatibility), [Steam Workshop](20-packaging-and-release.md#8-steam-workshop), [Gates of Hell summary](20-packaging-and-release.md#gates-of-hell-summary)), [chapter 3, The mod folder and load order](03-mod-folder-and-load-order.md) ([Workshop mods](03-mod-folder-and-load-order.md#8-workshop-mods)), [chapter 12, Missions and multiplayer setup](12-missions-and-multiplayer-setup.md) ([staying in sync](12-missions-and-multiplayer-setup.md#10-how-multiplayer-stays-in-sync)). The window: [chapter 19, Quick Guided Task](19-toolchain.md#quick-guided-task) and [the confirm box](19-toolchain.md#the-confirm-box).
- Reference: [r01, mod.info and the mod folder](r01-mod-info-and-folder.md) ([`FileId`](r01-mod-info-and-folder.md#fileid), [`N.pat`](r01-mod-info-and-folder.md#npat), [Workshop upload](r01-mod-info-and-folder.md#workshop-upload), [Gates of Hell only](r01-mod-info-and-folder.md#gates-of-hell-only)).
- Before: [Check a mod, fix it, read the log](p14-check-fix-read-log.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
