# mow-mod-start: version range (MinGameVersion, MaxGameVersion) and the version gate

when: "Unsupported game version", "mod is greyed out", "which version do I write", modinfo VER_RANGE / VER_MISSING / VER_ORDER / VER_CRASH / WARN_MOD_MODERN.

## Steps
1. what the game is: MCP `mow_game_status` (exe build) · the rule of a game: MCP `mow_game_diff` (`key: modinfo.range_rule`) · CLI `node tools/gameprofile/gameprofile.js show as64 modinfo.range_rule`
2. what the mod says and whether it passes: MCP `mow_mod_info` (`mod`, `game`)
   CLI `node tools/modinfo/modinfo.js <mod> [--game G] [--game-version VER] [--exe as64|mowas_2|mowas2|goh]`
   load verdict per exe: `node tools/wouldload/wouldload.js <mod> --exe as64,mowas2,goh` (REFUSED = the range)
3. fix: a new mod → `mow_mod_new` writes the right range for `game`. An old mod → MCP `mow_mod_upgrade` (`mod`, `out` = new folder, `game` = target; preview unless `write: true`), it rewrites the range in a COPY (→ skill `mow-mod-check-fix`)
   GUI: Mods tab > Mods > Upgrade or Port

## The rule, lim VFS-19 [V])
- version text = digits and dots, other characters ignored
- LEGACY mod (Min below 3.301): BOTH bounds needed; the game's DATA version `3.262.<patch>` must lie in [Min, Max]. Only the parts both versions have are compared: `3.262.1` equals `3.262`, so Max `3.262` accepts every patch
- MODERN mod (Min 3.301 or higher): passes when the program version is at least Min; Max is ignored and may be left out
- a Max below the game version (e.g. `3.100`) is refused; Max lower than Min is not reported by the game
- console variable `dev_disableModVersionControl` lets a legacy mod with an empty range load: never ship a mod that depends on it

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| passes | legacy range holding 3.262 in Classic mode; Min >= 3.301 in Enhanced mode | range holding 3.262, both bounds | range holding the GoH exe version (1.x scale) |
| refused | the other mode's kind (→ `classic-enhanced.md`) | Min >= 3.301 (modinfo VER_RANGE), no Max (VER_MISSING) [I] | an AS2 3.x range; the range of an older template (PORT-46 [V live]) |
| missing bound | legacy: unsupported | unsupported | open on that side (modinfo info WARN_GOH_OPEN_BOUND); set both |
| lift the check | console variable above | same | tag `develop` in `Tags` (GHVFS-02), or the same console variable |
| what the user sees | not applied; at startup can crash (VFS-59) | skipped with a warning | list shows "not up to date", no Activate; log `was disabled: Unsupported game version` |

## Silent fails
- VFS-19 empty or missing Min/Max on a legacy mod = unsupported; a mod with no version lines never loads
- VFS-59 as64: a listed mod refused for its version writes its console line before fonts load: the game crashes instead of refusing (modinfo VER_CRASH). Take it out of the list or upgrade it first
- VFS-48 the range doubles as the mode label on as64: a wrong Min puts the mod in the wrong mode
- PORT-46 GoH: listed in options.set with a bad range = not activated, dropped from the list on exit [I]
- one mod for the original game AND Enhanced mode does not exist: ship two variants (guide 03 section 4)

## Verify
- modinfo and wouldload name no REFUSED / VER_* for the target exe
- in game: the mod can be activated; game.log has no `was disabled` line with its name (MCP `mow_game_log`)
