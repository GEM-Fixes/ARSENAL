# newmod test truth (run.sh builds test/work)
1 fresh dir (with space): skeleton + mod.info + #my_mod.lng + .gitignore + readme; modinfo+lnglint 0 findings
2 mod.info has Name; default target as64 = MinGameVersion 3.301, no Max, readme says as64; --target mowas2 = Min 3.262.0 Max 3.262.1
3 existing non-empty dir: refused (exit 2)
4 empty existing dir ok; --deps nothere -> SELFCHECK_MODINFO REQ_MISSING; cyrillic name written UTF-8
5 any Unicode name (a中«») written UTF-8 (ENCFIX)
6 --dry-run writes nothing
7 no --name: usage exit 2
8 lng-add on the new mod: 0 findings; lnglint clean
