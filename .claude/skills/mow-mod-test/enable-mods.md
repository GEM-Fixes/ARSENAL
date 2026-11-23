# mow-mod-test: enable only the mod under test, restore after

when: before a test start, "turn my mod on", "is the mod active", "put my mod list back".
G = AS2 install, H = GoH install. This writes the enabled mod list in the user's profile: launch kind, needs `ARSENAL_ALLOW_LAUNCH=1` and the user's yes. The game must be closed.

## Steps
1. what is on now: MCP `mow_game_status {}` (enabled mods in load order)
2. dry: MCP `mow_mods_enable {mods:["as64+","<modname>"], dry:true}` → the plan, nothing written
3. set: MCP `mow_mods_enable {mods:["<modname>"]}` (folder names in load order; the mod and what it Requires, nothing else; `[]` turns all off; `force:true` only when the user says so)
   CLI `node tools/modswitch/modswitch.js --game dir [--exe as64|mowas_2|mowas2|goh] [--profile options.set] [--set a,b | --restore] [--write] [--force] [-q]` (dry unless `--write`; refuses while the game runs; keeps `.modswitch.bak`)
4. restore when the test is over: MCP `mow_mods_enable {restore:true}` · CLI `... --restore --write`
5. put a mod where the game reads it, only when asked: `node tools/as2/as2.js install <mod> [--name n] [--link] [--force]` (copy or junction to `<game>/mods/<n>`; `uninstall <n> --yes` removes only what it installed; GoH refused: the user copies the folder)
- GUI: Share tab > `play` page (install, test profile card: `run testprofile`, `run testprofile-seed`), Mods tab > `mods`

## Facts
- the list lives in the profile `options.set` as `{mods "<folder>:1" ..}`; load order = list order, later wins
- as64 Enhanced mode has the built-in `as64+` first

## Per game
- as64: per-instance profiles; `mod_set` / `mod_list` by control pipe exist only here (TST-28)
- mowas2: same profile file, no pipe: set it with the game closed
- goh: `options.set {mods "name:0"}` with the game closed, activates at boot (TST-30); log line `Mod: activate mod <x>` (GHLOG-16); modswitch `--inst` / `--seed` refused

## Silently fails
- TST-22 a fresh `-instance N` profile has an empty mod list: the mod is listed, not mounted, and the test passes on vanilla
- TST-13 a renamed mod folder is dropped from the list with no message; applying takes ~30 s, a large mod ~175 s
- TST-25 the game may drop a test mod from `options.set` on exit; `mod_set` naming an unknown folder resets the list
- TST-35 instance 0's list changes whenever the user plays: never use it as a baseline
- TST-02 game.log never names local mods by itself: check `options.set`, or as64 `mod_list applied:true`
- TST-01 in Options > MODS a single click only highlights: double-click (when a person does it)
- PORT-46 GoH: a mod whose range does not hold the exe version can not be activated

## Verify
- `mow_game_status {}` shows the list wanted; after the start the log / pipe confirms the mod is active; after the test the list is back as it was
