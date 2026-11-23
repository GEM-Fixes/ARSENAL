# refmods/robz/goh-candidate: mods/robz_mod in the GoH install, static read only, 2026-11-04. live test not run
GoH 1.067 sha 4b6a807a. Files dated 2021, 2.9 MB: 549 breed/mp, 228 entity vehicles (ussr, germany), weapons, late MP units inf + units ger/rus. No bot script.
`mod.info` min 1.105, max 1.400, tags `no_delete develop`: refused as shipped by the version gate on 1.067 [I, from the [V] gate rule].
- refcheck `--scope mod`: 19 findings. 7 missing models (inf_crate x4, valentine2/7/9), bulleteng_57 x6, 14mm_flammenwerfer, 5 entity redefinitions
- overdiff: 12 full-file replaces (tank-main.inc, tank-damage.inc, vision_fields, units_ger/rus late...), so it goes stale as GoH updates
- sdllint: 2694 findings, mostly not resolving the base game. real ones: MOD_NAME `hardcore` human.ext:56; stray ops tank-main.inc:469,473; UNREPLACED_PARAM tank-main.inc:824, tank-damage.inc:135; stray `)` units_rus.set:330
Min 1.105 against GoH 1.067 looks odd: the mod's numbering may not be the current game's. Check before reading it as "newer".
To test, about 3 min: copy resource + localizations to GoH mods/e2e_test with min 1.067, `modswitch --set e2e_test --write`, uidrive `boot,skirmish,leave_match,close_session,exit_sub`, read log for `Mod: activate mod e2e_test`, then errors. Restore options.set + folder.

Not ports: this folder and the Workshop item ROBBIE Z (3158275330) are GoH-native retunes, no AS2 lineage; do not use them as port pairs. The AS2 census target stays `refmod` 1.30.10: 91,142 files + 65 .lng, 4.4 GB, 2,080 cards, bot.data.lua 3,831 entries.
