# mow-mod-share: mod.info range and name for the target game

when: "which game version does my mod need", "the mod shows as not up to date", "Classic or Enhanced for release", "the mod list shows the wrong name".
G = AS2 install, H = GoH install, `<mod>` = mod folder.

## Steps
1. read: MCP `mow_mod_info {mod:"<mod>"}` (name, game version range, required mods, the mod.info check for the game)
2. check for a target: `node tools/modinfo/modinfo.js <mod dir> [--game-version VER] [--exe as64|mowas_2|mowas2|goh]`; every mod.info of a folder: `node tools/modinfo/modinfo.js --all <mods dir>`
3. the facts per game: MCP `mow_game_diff {game:"as64", other:"goh", key:"modinfo"}` (version range, text format, folders)
4. change a line: by hand in `<mod>/mod.info` (CRLF, UTF-8 strings), or let the upgrade tool write it for a target: MCP `mow_mod_upgrade {game:"<target>", mod:"<mod>", out:"<out>"}` (preview)
5. load verdict: `node tools/wouldload/wouldload.js <modDir> --exe as64,mowas2,goh`
- GUI: Share tab > `share` page (info and version cards: `share/info`, `share/version`, write)

## Facts; guide r01, 03
- keys: name, description, `MinGameVersion` / `MaxGameVersion`, `Require` (mods it needs, loaded before it), `FileId` (Workshop item id, written by the uploader; loading ignores it)
- as64 picks Classic or Enhanced mode from the version lines: Enhanced = MinGameVersion 3.301 (with the built-in `as64+`), Classic = range 3.262
- a mod that Requires another needs it enabled and earlier in the order

## Per game
- as64: Enhanced or Classic as above; an Enhanced mod does not load in mowas_2.exe
- mowas2: range holding 3.262 (tools write `Min 3.262.0 Max 3.262.1` for generated mods)
- goh: the range must hold the exe version, usually with an open Max; plus Tags; `modinfo --exe goh`. The mod template's range 1.500-1.510 is refused by the game (PORT-46)

## Silently fails
- ENG-24 an unescaped `"` in the description: the game dies before the menu, for every player who has the mod
- ENG-26 a Classic/Enhanced mismatch of any listed mod: the same
- PORT-46 GoH: "not up to date", the mod can not be activated
- VFS-17 / version gate: a mod outside the exe's range is listed but not mounted (wouldload REFUSED)
- TST-13 renaming the mod FOLDER drops it from every player's enabled list: the folder name is the id players enable, keep it stable across releases
- NET-13 players on different game builds can not play together whatever the range says

## Verify
- the mod is in the game's mod list with the right name, can be enabled, and the game starts with it; on GoH the log line `Mod: activate mod <x>`
