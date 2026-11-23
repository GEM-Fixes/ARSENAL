# mow-mod-check-fix: unknown keys and wrong values (keylint, defcheck)

when: "my change does nothing", "Integer expected!", UNKNOWN_KEY / INT_FIELD_FLOAT / LOOSE_PATCH / DAMAGE_REPLACES findings, a ported def crashes on a bone or light block.

## Steps
1. MCP `mow_mod_check` (`mod`, `only: "keylint"`)
2. CLI `node tools/keylint/keylint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--vocab f] [-q] [--summary]`
   checks: engine key sets of brain / sensor / visor / Properties, breed, MP unit / army / game cards (UNKNOWN_KEY + did-you-mean); data keys and typed values against a vocabulary learned from vanilla; explicit KEY rules. a mod under `<game>/mods` mounts by itself (paks checked)
   learned-type findings are `WARN_`; only well-sampled keys count, the rest are info hints
3. def bones, lights, set/stuff names against the mdl (AS2 only): `node tools/defcheck/defcheck.js <mod dir> [--game G] [--exe as64|mowas_2] [--format json] [-q] [--summary]`
   crash checks: BONE_LIMITS_ONE_NUMBER STUFF_FILE_EXT DEF_BONE_NOT_IN_MDL LIGHT_EXTENDER_GOH_FORM LAMP_GLASS_BONE_MISSING. reads the def text only (macros and includes not expanded)
4. GUI: Mods tab > Check & Fix
5. fix: spelling / case of macro and key names, clamped values: MCP `mow_mod_fix` (`only: "spell,asread"`) · `node tools/fix/fix.js <mod> plan --only spell,asread`; one key by hand: `node tools/patch-entity/patch-entity.js <mod> --game G (--entity n|--file key) --set p=v [--dry-run]`

## Codes
| code | meaning | row |
|---|---|---|
| UNKNOWN_KEY | key the engine does not read at that place | SDL-33 |
| INT_FIELD_FLOAT (INT_GOT_EXPR, INT_GOT_FLOAT info) | float or arithmetic in an int field: fatal | SDL-26, SDL-29 |
| LOOSE_PATCH | `.patch` loose in the mod root is not read; only inside a mounted `N.pat` | KEY-01 |
| DAMAGE_REPLACES (info) | `damage X` without `add` replaces the inherited layer | KEY-17 |
| MI_KEY_CASE (milint) | wrong-case field in a game card | MIS-11 |

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| keylint | vocabulary from the AS2 install with as64/core | `--exe mowas_2`: without as64/core | `--exe goh`: GoH field list, [I] |
| defcheck | yes | `--exe mowas_2` | refuses GoH (lim PORT-171) |

regenerate the vocabulary after a game update: `node tools/keylint/learn.js --game dir [--exe ..] [--out f]`

## Silent fails
- SDL-33 / MIS-11 field names are matched case-sensitive: `friendlyfire` is skipped, `friendlyFire` applies; no log line
- KEY-01 a loose `.patch` file does nothing
- KEY-17 / DMG-13 `damage blastwave` without `add` drops the inherited blast layers
- DMG-19 `projectileDamageThreshold` below 1 is clamped to 1 (refcheck THRESHOLD_LT1; fixer `asread`)
- MIS-18 `minTeamPlayers` / `maxTeamPlayers` are not read; use `minTeamSlots` / `maxTeamSlots`
- PORT-171 the GoH light extender form is fatal on as64 ("unexpected token")
- HUM-01 / MOV-01 an unknown vitality sub-key or Locomotion key = "unexpected token" (loud; humlint and movlint name it)

## Verify
- re-run keylint: the code is gone; a key that "did nothing" now shows in MCP `mow_mod_diff` as changed
- in game: the value is seen to act (→ skill `mow-mod-test`)
- sdl/schema keys/conv · guide 06-data-keys-entities, r02-entity-definition, r03-extenders-and-components
