# mow-mod-test: static gate and what to test

when: before any launch ("a crash on paper wastes a launch"), "what should I test after this change", "give me a test checklist".
G = AS2 install, `<mod>` = mod folder. Nothing here starts the game.

## Steps
1. state: MCP `mow_game_status {game:"as64"}` (install, exe build, enabled mods in order, running?, may this server launch)
2. static gate: MCP `mow_mod_check {mod:"<mod>"}` (quick; `full:true` before a release)
   CLI `node tools/check/check.js <mod, anywhere> [--exe as64,mowas2,goh]`
   load verdict alone: `node tools/wouldload/wouldload.js <modDir> [--exe as64,mowas2|mowas_2,goh] [--game G] [--goh H]` (REFUSED / LIKELY_CRASH / LOADS_STATIC / UNKNOWN)
3. every mod.info in the mods folder, since one bad file stops the game for all (lim ENG-24): `node tools/modinfo/modinfo.js --all <mods dir>`
4. what to test: `node tools/testplan/testplan.js changes <mod> [--game G] [--exe as64|mowas2|goh] [--since last|Nh|Nd|git[:ref]|vanilla|all]` (what changed)
   `node tools/testplan/testplan.js plan <mod> ...` → one row per check per unit and gun (code T-xxxxx); `checklist <mod>` = the list for a person; `emit` = files for edrun / prove; `read` = take results back; `mark` = mark as tested
   GUI: Share / test tabs > `testplan` page (routes `testplan/plan`, `testplan/status`)
5. baseline for later: a vanilla log once (`read-the-log.md`, bootcheck base)

## Facts
- the gate catches: syntax, undefined macros, missing includes, unknown weapons (crash class), version range refusals. It can not see: behaviour, balance, anything DDA skips silently (MIS-01)
- testplan has 23 checks; as64 rows run, mowas2 rows are dry/plan, goh rows are a checklist for the player

## Per game
- as64: gate + plan + scripted run
- mowas2: the gate reads the install without `as64/core`; launch is by menu routes
- goh: `--exe goh` (`--goh H`); the first index build of the GoH install is slow; GoH rules are AS2 rules where no GoH table exists [I]

## Silently fails
- TST-36 a linter given an empty mod list reads vanilla: 0 findings, no message. Name the mod or pass `--folder`
- TST-37 `build`'s refcheck stage on a mod folder outside `<game>/mods`: refused as not mounted
- TST-32 testrun without `--exe` prints plans only (status 0, old game.log stays): a wrapper can score a stale log
- ENG-26 a Classic/Enhanced mismatch of ANY listed mod kills the start, not only the mod under test

## Verify
- the gate is clean or every finding is explained; the plan rows name each changed unit. Then launch (`enable-mods.md`)
