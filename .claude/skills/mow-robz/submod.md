# submod: a patch or sub-mod on RobZ, and RobZ with another mod

RobZ stays untouched. The change lives in its own folder, loaded after RobZ. Start: skill `mow-mod-start` (new folder,
mod.info); here is what is special under RobZ.

## Steps
1. `mow_robz_find` -> folder name, version, range of the RobZ to build on
2. new mod folder (`mow_mod_new`) with the SAME `MinGameVersion` / `MaxGameVersion` as RobZ and `{Require "<RobZ folder name>"}`
3. put in only files that are new or that must differ; never a copy of the whole RobZ tree
4. `mow_robz_submod submod <full path>` -> fix every high finding; `deep: true` when a shared file is replaced
5. run the game with RobZ + the sub-mod, read game.log (skill `mow-mod-test`)

## Rules the check enforces
| code | meaning | fix |
|---|---|---|
| MODE_MISMATCH | sub-mod range puts it in another mode than RobZ (legacy against modern) | copy RobZ's two version keys; on AS64 both must be Classic or both Enhanced (as64.md) |
| REQUIRE_MISSING | no `Require` on the RobZ folder | add it; the name is the folder name, the mod must sit in G/mods and be active; 32-bit exe [T]) |
| NOT_INSTALLED | sub-mod is outside G/mods | fine while editing; move or link it before a test |
| RANGE_DIFFERS | both legacy but another range | copy RobZ's range |
| SAME_AS_ROBZ | file identical to RobZ's | delete it from the sub-mod |
| WHOLE_FILE_COPY | a shared RobZ file replaced whole (macro files, unit sets, damage scripts, .lng) | keep only when needed; every RobZ update must be merged in by hand |
| FILE_REPLACED | a plain RobZ file replaced | normal for a patch; list it in the sub-mod's notes |
| DEFINE_TWICE | a macro name RobZ also defines, in another file | rename it, or it depends on include order which copy wins |

## Why whole files matter
- override is by whole file, the last mod wins, nothing is merged (lim VFS-01 [V]). One changed price in a unit set = the whole set is yours now
- a `.lng` file replaces the game's and RobZ's file of that name whole (lim VFS-27, LOC-25): new texts go in a NEW file name
- macro files are included by many files: one changed define changes every card or unit that calls it
- adding a card without replacing a set: a new `.set` file that the unit set includes is not picked up by itself; the set that includes it must change. Plan the smallest replaced file

## New unit under RobZ rules
- a unit RobZ lacks (vanilla or ported) has no shell tiers, no RobZ armour macro, wrong ammo names: it loads but plays by other rules [I]
- `node tools/rzsys/rzsys.js --unit <def or name> --robz <RobZ folder> --vanilla <resource> --out <folder> --report` writes a def, gun rows and tier-tagged ammo; everything guessed is tagged [I], gaps are listed
- card for it: copy the shape of a near card (`mow_robz_unit q <near>` shows the macro call and its file)
- then `mow_mod_check`, in-game test with a tank of each class shooting at it and it shooting back

## RobZ with another mod
- a mod not made for RobZ that touches units, guns, damage scripts or texts will clash; the author's advice is to switch it off [author]
- to try anyway: `mow_robz_submod submod <other mod> deep true`, or `mow_mods_clash mods "<RobZ>,<other>"`; a patch that keeps both sides: `mow_mods_patch` (skill `mow-mod-together`)
- interface-only and sound-only mods that say "RobZ compatible" replace few shared files; still run the check
- same files for every player in multiplayer: `mow_mp_sync`

## CLI
- `node tools/conflicts/conflicts.js --help`, `node tools/conflicts/patchmod.js --help`
- `node tools/overdiff/overdiff.js --game <G> --mods <RobZ>,<sub>` (each mod against what precedes it)
- `node tools/check/check.js <sub-mod> --exe as64,mowas2 --game <G>`
