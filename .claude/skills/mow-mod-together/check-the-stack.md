# mow-mod-together: check the stack again with the patch

when: a patch mod was written (or the order changed) and before any game run.

## Steps
1. clashes of the three as a stack: MCP `mow_mods_clash` (`mods` = a, b in load order; `mod_dirs` = full path of the patch when it is not in `<game>/mods`, it loads last)
   CLI `node tools/conflicts/conflicts.js --game G --mods a,b,<patch> [--mod-dir <patch folder>] [--exe as64|mowas_2|mowas2|goh] --mods-only --joint`
   expected: every clash the patch covers is now info CONFLICT_PATCHED (the last mod lists every clashing mod as Require; its copy is the decided one)
2. static check of the patch itself: MCP `mow_mod_check` (`mod` = the patch, `game`) · the mods with the patch on top: `mow_mod_check` (`mod` = a, `with` = the patch)
   CLI `node tools/check/check.js <patch> --exe <game>` · `node tools/check/check.js <mod> --with <patch>`
3. what the patch changes against game + a + b: MCP `mow_mod_diff` (`mod` = the patch, `mods` = a, b) · CLI `node tools/overdiff/overdiff.js <patch> --game G --mods a,b [--exe ..] --summary`
4. spot-check winners: MCP `mow_file_which` (`path` of one merged file, `mods` = a, b, patch)
5. units of both mods still on sale: MCP `mow_army` (`army`, `mod` = the patch) · names: `mow_text_find` (`key`, `mod`)
6. GUI: Share tab > Share page > Mods together, "check again" with the patch folder (`gui_call` `POST /api/x/share/clashes` `{mods, patch}`)

## What may remain
| left over | meaning |
|---|---|
| WARN_CONFLICT_OPAQUE_MOD_MOD | binary file, last mod's copy stays unless a `take` was asked |
| CONFLICT_ENTITY_NAME_DUP | two folders, one def name: a merge can not fix it, one side must be renamed |
| CONFLICT_LNG_KEY_CROSS | needs spec `texts` (AS2 only) |
| CONFLICT_JOINT_REF | something one mod names is gone with the others loaded → joint-view.md |
| PATCHMOD_NOT_WINNING | the patch file is not the one read: order or pak-vs-loose |
| MOD_ORDER_UNDECLARED between a and b | harmless once the patch decides every clashing file; say so |

## Per game
| game | note |
|---|---|
| as64 | check verdict per mode; a patch for Enhanced mods is read beside `as64+` |
| mowas2 | `--exe mowas_2` / `--exe mowas2` for check; the gate keeps mods whose range holds 3.262 |
| goh | the patch folder is outside the install, pass it by path (`mod_dirs`, `--mod-dir`); doctor skips uilint and binhdr on GoH; result not run in game [T] |

## Silent fails
- a clean second run says "the patch wins what it covers", not "nothing else clashes": files the plan left out (PATCHMOD_CANT) are still lost
- VFS-41 a later change to mod a or b (an update) is not in the patch: the patch's merged copy now hides the update. re-plan after every mod update
- LOADS_STATIC is static: no game ran it

## Verify
- no warn-level clash left that the user did not accept; the patch check verdict is LOADS_STATIC
- then run it → enable-and-test.md; until then the patch is [T]
