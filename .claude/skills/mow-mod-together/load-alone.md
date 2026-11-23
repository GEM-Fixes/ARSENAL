# mow-mod-together: does each mod load alone on this game

when: before any clash work. A mod that does not load alone is not a clash; fix or upgrade it first.

## Steps
1. read each mod: MCP `mow_mod_info` (`mod` = full path, `game`): name, version range, Require, what it holds, mod.info check
   CLI `node tools/modinfo/modinfo.js [--all] <mods dir or mod dir> [--exe as64|mowas_2|mowas2|goh]` (`--all <G/mods>` = every mod.info in the folder, one line per bad one)
2. static check of each: MCP `mow_mod_check` (`mod`, `game`; default quick, `full: true` = every linter)
   CLI `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]` for a and for b
   GUI: Mods tab > Check & Fix
3. read the verdict per game: REFUSED (mod.info range) · LIKELY_CRASH · LOADS_STATIC (static only) · UNKNOWN
4. both must mount in the same mode on as64 (Classic or Enhanced, not one of each) → classic-enhanced-mix.md
5. a mod with its own crash-class findings: skill `mow-mod-check-fix` first, then come back

## Per game
| game | note |
|---|---|
| as64 | a listed mod of the wrong mode is not applied and the game crashes at start (VFS-48, ENG-26 [V]) |
| mowas2 | `--exe mowas_2` keeps the version gate: the legacy range must hold 3.262; no as64/core, no `as64+` |
| goh | range must hold the exe version (lim PORT-46 [V live]); a folder name with a space, a byte >= 0x80 or one of `<>+()[]{}!@#$%^&*-=;:\|'"` is skipped (GHVFS-27 [V]) |

## Silent fails
- ENG-24 one bad mod.info anywhere in mods/ or Workshop stops the game for every mod, even with that mod off
- VFS-17 `Require` of a mod not in the list: dependency warning, the mod is skipped
- VFS-16 a Require cycle drops the whole mod list (`Dependency test error!`)
- VFS-63 two mods/ folders whose names normalise the same: the later never loads, no log line
- VFS-62 a folder with no mod.info at its root is skipped, no log line (extra folder level)
- VFS-20 unknown mod.info key is silent

## Verify
- both `mow_mod_check` verdicts are LOADS_STATIC for the game; that is "loads on paper", not "works"
- in game: each mod alone reaches the menu and one match (→ skill `mow-mod-test`), then go on to find-clashes.md
