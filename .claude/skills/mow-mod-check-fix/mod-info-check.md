# mow-mod-check-fix: check mod.info

when: "mod does not show in the list", "game will not start since I added a mod", verdict REFUSED, an UNKNOWN_KEY / VER_ / DELETE_PREFIX / MODINFO_PARSE finding.

## Steps
1. MCP `mow_mod_info` (`mod` = full path, `game`): name, version range, required mods, what it holds, and the mod.info check for that game. without `mod`: the mod folders in `<game>/mods` (`q` narrows)
2. CLI `node tools/modinfo/modinfo.js [--all] <mods dir or mod dir> [--game-version VER] [--exe as64|mowas_2|mowas2|goh] [--format F] [-q]`
   `--all <G/mods>` = startup-crash check of every mod.info in the folder, one line per bad one
3. GUI: Mods tab > Check & Fix (the mod.info rows come first)
4. fix: your own mod: edit the file by hand (CRLF; a `"` inside a value written as `\"`), or fixer `modinfo` (`node tools/fix/fix.js <mod> plan --only modinfo`: a corrected copy as `mod.info.fixed` in the patch folder, for a missing or wrong range). someone else's mod: tell the user which line, do not edit it

## Codes
| code | meaning | row |
|---|---|---|
| MODINFO_PARSE / SYNTAX | a known key must be one quoted string; an unescaped `"` in Desc = the game will not start | ENG-24 |
| UNKNOWN_KEY | key is not one of Name Desc MinGameVersion MaxGameVersion Delete Require FileId: ignored | VFS-20 |
| VER_RANGE VER_MISSING VER_ORDER | range does not hold the game version, is empty, or Min > Max | VFS-19 |
| WARN_MOD_MODERN | Min >= 3.301: an Enhanced (as64 only) mod; info | VFS-48 |
| DELETE_PREFIX | `Delete` path lacks `resource/` | VFS-21 |
| MOD_REQUIRE_MISSING (vfs) | required mod not in the list | VFS-17 |

key list from the tool: `node tools/gameprofile/gameprofile.js show as64 modinfo.keys`

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| range | Classic: legacy range holding 3.262. Enhanced: Min >= 3.301, loaded beside built-in `as64+`, Max ignored | must hold 3.262 [V]; modern mods do not apply | must hold exe version 1.067; template 1.500-1.510 refused (PORT-46) |
| flag | `--exe as64` | `--exe mowas_2` (legacy range) | `--exe goh` (GoH develop tag), or `--game-version VER` |

## Silent fails
- ENG-24 every mod.info in mods/ and the Workshop is read at startup, with any mod list and with `-no_mods` too: one bad file stops the game [V]
- VFS-20 unknown keys and parse slips are silent: a typo does nothing
- VFS-21 `Delete "set/x"` matches nothing; it needs `resource/set/x`
- VFS-22 `Delete` runs before the mod's own files mount: it can not remove the mod's own files
- VFS-48 + ENG-26 a listed mod of the wrong mode: log line "made for X mode: not applied", then a startup crash
- VFS-47 `as64+` is built in and always first; a folder named `as64+` in mods/ is dropped
- VFS-17 `Require` matches the name part only and the mod must be in the list, else it is skipped with a warning

## Verify
- `node tools/modinfo/modinfo.js <mod> --exe <game>` prints no error; `--all <mods dir>` prints no bad folder
- the mod shows in the game's mod list and applies: MCP `mow_game_status` (enabled mods), then game.log has no "not applied" line (→ skill `mow-mod-test`)
- · guide 03-mod-folder-and-load-order, r01-mod-info-and-folder
