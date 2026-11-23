# mow-mod-port: repair, lint and judge a ported tree

when: after goh2as2 wrote `<out>`, "clean up the port", "what is still wrong with this ported mod", before the first game start.
G = AS2 install, H = GoH install, `<mod>` = the ported mod folder.

## Steps
1. GoH keys the AS2 reader does not know: `node tools/portfix/portfix.js keys <mod> --game G [--exe as64|mowas_2|mowas2] [--src dir]`
2. the repair family the lint or the log names (one at a time, `--dry` first):
   `node tools/portfix/portfix.js mergedefs|mergetables|carrystuff|anmdirs|macroclash|vanprops|extenders|ebmframes|minworkers|shapes|fxdup|locospeed|panelterms|mtlkeys|mdlkeys|volmats|viewkeys|decalempty|fillcycle <mod> --game G [--exe ..] [--also dir] [--src dir] [--dry]`
   macros: `node tools/portfix/portfix.js macrocheck <mod> --game G [--json f] [--fix]`
3. lint the port: `node tools/portlint/portlint.js <mod dir> [--game G] [--exe as64|mowas_2|mowas2] [--base dir] [--format json] [-q] [--summary]` (GoH keys left, stuff overrides, bones, places)
4. assets: `node tools/portasset/portasset.js <mod dir> --game <AS2 dir> [--exe as64|mowas_2|mowas2] [--format text|json] [-q] [--all]`
   textures: `node tools/goh2as2/texcheck.js <mod dir> [--game AS2] [--also dir] [-q] [--goh dir]`
5. def against mdl crash checks: `node tools/defcheck/defcheck.js <mod dir> [--game G] [--exe as64|mowas_2] [-q] [--summary]` (BONE_LIMITS_ONE_NUMBER, DEF_BONE_NOT_IN_MDL, LIGHT_EXTENDER_GOH_FORM, LAMP_GLASS_BONE_MISSING)
6. one verdict per unit: `node tools/portverdict/portverdict.js <mod dir> --game G [--goh H] [--exe as64|mowas_2|mowas2] [--target as64|mowas2] [--json f]` (K keys, V values, G gaps, S syntax, R refs, B scale)
7. full check: MCP `mow_mod_check {mod:"<mod>", full:true}` · CLI `node tools/check/check.js <mod> [--exe as64,mowas2,goh]`

## Facts
- portfix families map to log lines and lint codes: fix what is named, rerun the lint, do not run every family blindly
- a "native" or "static clean" verdict is static: it gates the first launch, it is not a test result

## Per game
- as64: all tools; mowas2: `--exe mowas_2` view, nothing run in mowas_2.exe yet [I]
- goh: portfix, portlint, portasset, portverdict, defcheck refuse `--exe goh` (PORT-171 for defcheck)

## Silently fails
- PORT-62 a macro defined outside the caller's include chain: the tree has it, the def never includes it (macrocheck)
- PORT-55 a whole-tree port replaces `/properties`: vanilla defs then include GoH copies whose macros differ
- PORT-160 texture names with spaces were dropped by older closures: run texcheck on the built mod
- PORT-77 a supply zone item without `{max}`: fatal Block terminator expected
- VIS-29 / VIS-30 an fx sprite or mtl specular naming a texture nobody holds: checker placeholder, no log
- PORT-171 GoH `/properties/light.inc` light extender form is fatal on as64
- TST-36 lint with an empty mod list reads vanilla and reports nothing: name the folder

## Verify
- lint and verdict clean, then the game: → `ported-unit-crashes.md` when it does not come up
