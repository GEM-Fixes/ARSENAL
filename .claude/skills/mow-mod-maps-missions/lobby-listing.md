# mow-mod-maps-missions: map or mode missing from the lobby

when: "my map does not show in the lobby", "the mode is not offered for my map", "the map name is a raw key", "wrong player count".
G = AS2 install, `<mod>` = mod folder. Read only; fixes are in the other sub-files.

## Steps (cheapest first)
1. is the mod on and read: MCP `mow_game_status {}` (enabled mods in order) · `mow_mod_info {mod:"<mod>"}` (mod.info check for the game)
2. does a tool see the map: MCP `mow_map_info {q:"<name>", mod:"<mod>"}`; not listed → the folder is not `map/multi/<name>/` under `resource/`, or it sits in a pak the mod root does not mount (lim VFS-26)
3. per mode: `mow_map_info {map:"<name>", mod:"<mod>"}` shows each `<mode>.mi` with warnings
4. lint: `node tools/milint/milint.js <mod> [--game G] [--exe as64|mowas_2|goh] [-q]` · MCP `mow_mod_check {mod:"<mod>", only:["milint"]}`
5. the log of the last start: MCP `mow_game_log {}`; grep "skipped - game type undefined"
6. which file wins: MCP `mow_file_which {path:"map/multi/<name>/map.info", mods:["<modname>"]}`

## Causes (row → fix)
- MIS-24 no `<mode>.mi` in the folder → `add-a-game-mode.md`
- MAP-01 a `.mi` whose title has no `set/multiplayer/games/<title>.set` (also stray `test.mi`, `0.mi`) → remove the stray file or add the card (skill `mow-mod-multiplayer`, `game-mode-card.md`)
- LOC-24 name shows as a raw key → text key `mission/<dir under /map/>/name` (skill `mow-mod-text-ui`)
- MAP-02 odd `maxPlayers` rounded up to even, clamped 2..mp_maxPlayers
- TST-34 slots capped by `map.info` `maxPlayers`; each player needs a map point `team(x) order(n)`
- MIS-19 a mode class with no stock card (`armored_warfare`, `combined_arms`)
- MIS-11 a wrong-case key in the `.mi` or card: skipped with no message
- ENG-24 / ENG-26 the game dies before the menu: a bad mod.info, or a Classic/Enhanced mismatch (skill `mow-mod-start`)
- TST-13 a renamed mod folder is dropped from the enabled list: enable it again

## Per game
- as64: the lobby lists `multi/<map>:<mode>` ids; `mp_maps` over the control pipe lists what the game sees
- mowas2: same rules; look in the lobby by hand (no pipe)
- goh: the name is in a `.pot`; the mod.info range must hold the exe version or the mod can not be activated (PORT-46); GoH filters the map list by mode cards of its own

## Verify
- the map and the mode are in the lobby with the right name and slots; start it once
