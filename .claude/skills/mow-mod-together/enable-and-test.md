# mow-mod-together: enable the stack and prove it in game

when: the static checks are clean (check-the-stack) and the stack is to be run. Until this is done the patch mod is [T].

## Steps
1. the mods must sit where the game sees them: folders under `<game>/mods` (a folder elsewhere is never loaded, VFS-61). Copying the patch there is the user's call; ask
2. what is on now: MCP `mow_game_status` (`game`): install, build, enabled mods in order, running or not
3. set the list, in order a, b, patch: MCP `mow_mods_enable` (`mods` = folder names in load order, `dry: true` first; as64 Enhanced: `as64+` first). Launch kind: needs `ARSENAL_ALLOW_LAUNCH=1` and the user's yes, it edits their profile `options.set`; the game must be closed; `restore: true` puts the old list back
   CLI `node tools/modswitch/modswitch.js --game G [--exe as64|mowas_2|goh] --set a,b,patch` (dry) then `--write`; `--restore` undoes; keeps `options.set.modswitch.bak`; refuses while the game runs
4. start a match: MCP `mow_game_start` (`map`, `mode`, `players`, `mods`, `dry: true` shows what it would start; launch kind) · or the user starts the game by hand
   CLI and the full loop: skill `mow-mod-test`
5. in the match, with the user or by `mow_game_shot`: buy one unit of mod a and one of mod b, read their names and prices, look at a unit both mods touched, fire a gun both mods changed
6. read the run: MCP `mow_game_log` (last game.log in plain words) · a crash: `mow_game_crash`
   CLI `node tools/logtriage/logtriage.js <game.log>`
7. GUI: Mods tab (list and order; Check & Fix > Read Game.log); `gui_pages` names the run pages

## What to look for in game.log
| line | means | file |
|---|---|---|
| `Mod '<x>' was disabled: Not installed` | list line does not match a folder (capitals, renamed folder) | load-order.md |
| `made for X mode: not applied` / crash before the menu | Classic / Enhanced mix | classic-enhanced-mix.md |
| `Localization key redefinition` | a text key in two files, later wins | text-clashes.md |
| `Entity redefinition` | one def name in two folders, second ignored | same-unit-clashes.md |
| `define not found` | a macro lost in the stack | macro-clashes.md |
| `File not found - resource/...` | a deleted or never shipped file | deleted-files.md |
| `Desync detected on quant N` | files differ between players | multiplayer-sync.md |

## Per game
| game | note |
|---|---|
| as64 | control pipe and `-instance N` exist; a fresh instance profile has an empty mod list (TST-22): the stack is listed in the main profile, not mounted in the instance |
| mowas2 | game.log is truncated at start, no game.prev.log; no test command-line flags, no `-instance` (TST-19): menus are driven by recorded routes (`mow_game_routes`, `mow_game_drive`) |
| goh | one user folder, no per-instance copy (GHVFS-13); list wiped by a GoH version change; driven by recorded routes; patchmod result on goh not run in game [T] |

## Silent fails
- most clashes leave NO log line (VFS-01, VFS-41): a clean log is not proof; the unit must be seen and bought
- MIS-15 rank locks are ignored in test mode and for AI: a card "on sale" in a test can still be locked in a real match
- the game rewrites `options.set` on Apply and exit: a list written while it runs is lost (modswitch refuses)
- VFS-56 old compiled shaders may stay after a list change

## Verify
- seen in game: units of both mods bought, names right, the picked values in effect; game.log read and free of the lines above
- tell the user what was seen and what was not; multiplayer is a separate proof → multiplayer-sync.md
