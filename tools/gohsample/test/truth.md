# gohsample test truth (all fixtures synthetic, built by mkfixture.js into test/fx)

One defect/behavior per line; check.js asserts each.

- tank_a.def: volume{caststeel}, volume/able{blockcamera}, `{##place` -> codes WARN_PORT_VOLUME_KEY, WARN_PORT_VOLUME_FLAG (`{##place` stays: reader skips it, no code); kind vehicle/tank
- btr_a.def: sequence/events -> WARN_PORT_DROP_EVENTS; kind vehicle/btr
- rifle_a.def: extension /properties/p.ext -> WARN_PORT_SHARED_PROPS; kind inventory/weapon/small_arms
- tree_a.def + .mdl: plain closure (sibling mdl, missing ply); kind flora
- fx_a.def: plain; kind fx
- odd#name.def: special name, excluded from the sample (uncovered.txt says so)
- vanilla_unit.def: same base name as an AS2 def, excluded
- plan covers every fixture code and kind; same seed twice gives the same entities; different out dir does not matter
- g1.ammo (set/stuff, possibledamageradius): part B picks it for WARN_PORT_DROP_AMMO_KEY, load kind BOOT_STUFF (boot, class LOAD); build puts it in mod_b only, never mod
- rifle_a's /properties/p.ext is absent from the fake AS2 vfs: goh2as2 --game copies it (PORT_PROPS_COPIED); a path AS2 has / a file with NoVisibilityPatch stays WARN_PORT_SHARED_PROPS (goh2as2 test)
- uncovered.txt: a code no file carries is NO_TRIGGER, not UNSAMPLED
- boot: the bisect transition finds one or two crashers among n files; boot --out writes boot_active; compare reads part B outcomes from boot-state.json
- plan --out inside the fake GoH dir exits 2 and writes nothing
- build: a sample row naming a nonexistent entity is recorded status refused with a reason; real rows converted; names.txt lists only built
- predict (--wl-json): a crash entry with reach ORPHAN (invisible to wouldload's verdict) counts as CRASH, countedByWouldload false; unbuilt entity = NOT_BUILT; the rest LOAD
- compare: TP (tank_a), FP (btr_a), FN (rifle_a), TN (tree_a) from a JSON results map and again from preloadsweep text lines; MISSING and NOT_REACHED not counted
