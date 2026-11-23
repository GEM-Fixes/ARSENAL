# mow-mod-check-fix: read the load verdict

when: "will my mod load", "does it work on the old game too", check printed REFUSED / LIKELY_CRASH / LOADS_STATIC / UNKNOWN.

## Steps
1. MCP `mow_mod_check` (`mod`, `game`): the first lines are the verdict, per game
2. CLI verdict alone: `node tools/wouldload/wouldload.js <modDir> [--exe as64,mowas2|mowas_2,goh] [--game AS2dir] [--goh GoHdir] [--json f] [--reach-all] [--time] [--timeout sec] [-q]`
   one pass per exe; each pass wraps sdllint + refcheck and prints READ n files + k paks
3. GUI: Mods tab > Check & Fix, the verdict line on top

## The four verdicts
| verdict | means | do |
|---|---|---|
| REFUSED | the version gate fails: the exe will not apply the mod (mod.info range) | fix the range (mod.info), or upgrade the mod (`mow_mod_upgrade`) |
| LIKELY_CRASH | a crash-class finding is reachable from something the game loads | fix those first: `mow_mod_fix` plan, or by hand |
| LOADS_STATIC | nothing crash-class reachable. static only, not run | test run (→ skill `mow-mod-test`) |
| UNKNOWN | a pass did not finish or could not read the mod | read the tool line named; check the folder and `--game` |

## Crash class
- entity-root MACRO_UNDEFINED, INCLUDE_MISSING, REF_WEAPON_UNKNOWN, and syntax errors (BLOCK_END_STRAY, CONTROL_BAD, DEFINE_UNCLOSED, STRAY_OPERATOR ..); table with source cites: tools/wouldload/classes.js
- each entry prints its class: SPAWN (fails when the entity is made) or USE (fails later, when used)
- reach: REACHABLE (in the verdict), ORPHAN (nothing loads the file: listed apart as ORPHAN_CRASH, not in the verdict), UNKNOWN. `--reach-all` counts all
- everything else is "silent": the game ignores it and the mod misbehaves

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| gate | legacy mod: data version 3.262.N inside [Min,Max]; modern (Min >= 3.301): version >= Min, Max ignored (lim VFS-19, VFS-48) | range must hold 3.262 [V] | range must hold the exe version 1.067; the 1.500-1.510 template range is refused (lim PORT-46 [V live]) |
| read | AS2 install + as64/core + `as64+` | AS2 install without as64/core and `as64+` | `--goh H` |

## Silent fails
- ENG-24 a bad mod.info of ANOTHER mod in mods/ stops the game: not in this verdict
- ENG-26 / VFS-48 a listed mod of the wrong mode (Classic vs Enhanced) is "not applied", then a startup crash
- VFS-17 `Require` of a mod that is not in the list: dependency warning, the mod is skipped
- VFS-26 mod root files outside the mounted set are ignored (MOD_ROOT_IGNORED)
- LOG-07 an unknown stuff becomes `dummy_checker`: load looks fine, crash later on use (class USE)
- static verdict rules and their proof:

## Verify
- REFUSED fixed: `node tools/modinfo/modinfo.js <mod> --exe as64|mowas_2|goh` prints no VER_ code
- LOADS_STATIC: enable the mod, start a match, read the log: MCP `mow_game_log` (→ skill `mow-mod-test`). say "static clean, untested" until then
