# mow-mod-start: where the game, the mods folder, the profile and the log are

when: before anything else on a PC not seen yet; "where is the mods folder", "where is options.set", "which exe do I have".

## Steps
1. MCP `mow_game_status` (`game`): install folder, exe build, enabled mods in load order, running or not, where settings and logs are, whether this server may start the game
   CLI `node tools/vfs/vfs.js [gameDir] --exe as64|mowas_2|mowas2|goh [--profile options.set] -q` (the mounted set; `gameDir` may be left out with `--exe`: the install of that game is found)
   active list alone: `node tools/modswitch/modswitch.js --game <dir> [--exe as64|mowas_2|goh] --json` (show only)
2. facts of one game, or only what differs between two: MCP `mow_game_diff` (`game`, `other`, `key` narrows, e.g. `user.dir`, `modinfo.range_rule`)
   CLI `node tools/gameprofile/gameprofile.js show as64 <key>` · `node tools/gameprofile/gameprofile.js diff as64 goh` · `diff as64 mowas_2`
3. GUI: the game picker in the header (MoW:AS2 / AS64 / GoH), the mod pill beside it; `gui_status` says game tab, game folder and picked mod

## Layout (AS2 install G, shared by as64 and mowas2)
- `G/mods/<folder>/` = local mods; a folder is a mod only when it holds a file named exactly `mod.info`
- `G/resource/*.pak`, `G/resource/entity/*.pak`, `G/localization.pak`, root `1.pat` = the base game (vfs/mount [V]). Read-only
- as64 only: `G/as64/core/` (mounted after the game, before mods, VFS-46 [V]) and `G/as64/plus/` = built-in mod `as64+` (VFS-47 [V])
- user folder `<Documents>/My Games/Men of War - Assault Squad 2/`: `profiles/<id>/options.set` (holds `{mods}`), `log/game.log`, saves. as64 and mowas_2 share it (gameprofile `user.shared_with_mowas_2` [V])
- as64 `-instance N` (1..9) uses its own user folder `... - instance N` with an empty mod list (TST-22 [V])

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| exe | `as64.exe`, editor `as64_ed.exe` | `mowas_2.exe` | `binaries/x64/call_to_arms.exe`, editor `call_to_arms_ed.exe` |
| data version | 3.262 data, modern mods 3.301+ | 3.262 | 1.x scale (read it with `mow_game_status`) |
| extra layers | `as64/core`, `as64+` | none | none |
| user folder | Documents, as above | same folder | `Documents/My Games/Gates of Hell/`, or `%LOCALAPPDATA%/Digitalmindsoft/Gates of Hell/` when Documents is under OneDrive or the game runs with `-useLocalDataFolder` (GHVFS-13 [V]) |
| previous log | `game.prev.log` kept | game.log truncated at start, no previous | probe both user roots |
| test command-line flags | yes | none: a passed flag is ignored (TST-19 [I]) | none |
| mods written by tools | `G/mods/<name>` usual | same | a folder OUTSIDE H (writeguard refuses the rest) |

## Silent fails
- VFS-12 a mod is known by its folder name in lower case, never by `Name` in mod.info
- VFS-18 a game version change empties `{mods}`: every mod is off after an update, no message
- TST-22 a fresh `-instance N` profile: mod listed in the main profile, not mounted in the instance
- GHVFS-13 GoH log and profile are in one of two roots: reading the wrong one shows an old run

## Verify
- `mow_game_status` names the exe build and the list you expect; in game: Options > Mods shows the same Activated list
- the log read is the one of the last run (time stamp at its top); → skill `mow-mod-test`
