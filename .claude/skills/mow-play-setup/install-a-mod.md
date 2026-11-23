# mow-play-setup: put a mod into the game
When: "how do I install this mod", "where do I put it", "I subscribed and it is not there".

## What a mod is
A folder with `mod.info` inside `<game>/mods/`, or a Steam Workshop item (Steam downloads it; the game finds it by itself).

## Steps
1. Look at it before installing: `mow_mod_info {game: "as64", mod: "<full path of the mod folder>"}` -> name, version range, required mods, what it holds, the `mod.info` check for that game.
2. Will it load: `mow_mod_check {game: "as64", mod: "<path>"}` (quick check: load verdict + worst findings).
3. Copy the folder into `<game>/mods/` (the person does it; a tool write into the install needs their yes).
4. What is installed now: `mow_mod_info {game: "as64"}` (no `mod` = the folders in `<game>/mods`).
5. Then turn it on: `turn-mods-on.md`.

## CLI
- `node tools/modinfo/modinfo.js <mod folder> --exe as64|mowas2|goh`
- `node tools/wouldload/wouldload.js <modDir> --exe as64,mowas2,goh` (reads only; answers REFUSED, LIKELY_CRASH, LOADS_STATIC, UNKNOWN).
- `node tools/as2/as2.js install <mod>` (copies or links into `<game>/mods`; AS64 and MoW:AS2 only; a write into the install, so ask first; `--dry` first). GoH: the person copies it.

## GUI
Mods > Mods (list, pick), Test, Share & Play > Play (`run install`, `dry` first): `gui_open {page: "play"}`.

## Rules
- the game mounts only `resource/`, `resource.pak`, `N.pat`, `localization/`, `localization.pak` from a mod root; anything else is ignored. VFS-26 [V]
- the version range in `mod.info` must hold the game's version, else the mod is refused with no dialog. PORT-48 [V]
- one broken `mod.info` anywhere in `mods/` stops the AS2 exes at start. ENG-24 [V]
- a zip from a friend often has the mod one folder too deep: `mods/<name>/mod.info` must exist.

## Per game
- AS64: loads a subscribed Workshop item from the Steam folder and ignores a copy in `mods/`. LOG-17. Mods are Classic or Enhanced (`as64-classic-enhanced.md`).
- MoW:AS2: range must hold 3.262; a mod made for AS64 (3.301) is off there.
- GoH: mounts only `resource/`, `N.pat`, `localizations/` (GHVFS-04); range on the 1.x scale; the Workshop list shows "not up to date" otherwise (PORT-46 [V]). An AS2 mod does not load in GoH (skill `mow-mod-port`).

## What goes wrong
- the mod is not in the list: `mow-play-trouble` (mod absent).
- hand-fixed the `mods/` copy but AS64 loads the Workshop item: unsubscribe or rename.

## Check
The mod shows in Options -> MODS on the left (off) side; `mow_mod_info {game}` lists its folder.
