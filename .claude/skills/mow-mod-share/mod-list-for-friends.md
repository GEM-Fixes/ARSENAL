# mow-mod-share: same mod list and order for friends

when: "send my mod to a friend", "what do my friends need to install", "we have the same mods but it still says different version", "same load order".
G = AS2 install. The export is a small file; sending it and the mod is the user's act.

## Steps
1. what is on here, in order: MCP `mow_game_status {}`
2. export the list: `node tools/modswitch/modswitch.js --game dir [--exe as64|mowas_2|mowas2|goh] --export f.json`
3. on the other PC: `node tools/modswitch/modswitch.js --game dir --import f.json` → the `--set` plan for that PC (MODSW_MISSING_MOD = a mod they lack, WARN_MODSW_VERSION_DIFF = another version of it); they apply it with `--set a,b --write`, game closed
4. the files themselves the same → `multiplayer-same-files.md`
5. what to hand over: the release folder (paks + mod.info), the folder NAME to keep, the list in order, the game build needed
6. put a copy where the game reads it, only when asked: `node tools/as2/as2.js install <mod> [--name n] [--link] [--force]` (copy or junction to `<game>/mods/<n>`; `uninstall <n> --yes` removes only what it installed; GoH refused: the user copies the folder)
- GUI: Share tab > `share` page (tell friends, play together), `play` page (install)

## Facts
- the lobby sends the mod NAME list too: a different folder name is a different mod to the game
- load order = the order in `options.set`; later mods win file by file
- `Require` in mod.info names mods that must be on and earlier

## Per game
- as64: all players on the as64 build; Enhanced mods need `as64+` (built in) first
- mowas2: all on mowas_2.exe; Workshop mods sit in the Steam workshop content folder, local ones in `<game>/mods`
- goh: local mods in `<GoH>/mods`; the list file is the GoH profile's `options.set`; `as2 install` refuses GoH

## Silently fails
- TST-13 a renamed mod folder is dropped from the enabled list, no message
- NET-13 different game builds: `txt_exedesync`, no match possible
- NET-15 nobody new can join a running game (as64: only a returning member)
- NET-05 the host leaving ends the match for all: the player with the best connection hosts
- NET-09 `mp_allowDesync` gates joining only: it can not keep a diverging game alive
- VFS-29 one player with an extra gameplay mod (anything under `/set /entity /properties ...`) = refused or desync; interface-only mods are exempt

## Verify
- both lists equal in names and order (import shows no MODSW code), both in the lobby, a match played to the end
