# mow-mod-together: what each clash code means and what to do

when: a line from `mow_mods_clash` / conflicts.js needs explaining. Source: `node tools/conflicts/conflicts.js --help`; the row behind a code: MCP `mow_limit` (`ids`) · CLI.

## Steps
1. get the lines: MCP `mow_mods_clash` (`mods` in load order, `file` to narrow) · CLI `node tools/conflicts/conflicts.js --game G --mods a,b [--exe as64|mowas_2|mowas2|goh] --fmt md`
2. look the code up below, read its row when the fix is not plain
3. GUI: Share tab > Share page > Mods together shows the same codes grouped by kind with a guided fix per group

| code | level | means | row | do |
|---|---|---|---|---|
| CONFLICT_KEY_OVERRIDDEN | info | one mod changes a vanilla or earlier value | VFS-01 | nothing, normal |
| WARN_CONFLICT_MOD_MOD | warn | two or more mods set one key differently; last wins | VFS-15 | pick a side (patch `picks`) |
| CONFLICT_FILE_SHADOW | warn | later mod replaced a whole SDL file, drops top-level entries an earlier mod added or changed | VFS-41 | merge in a patch mod |
| CONFLICT_ENTRY_LOST | warn | a nested entry of the earlier mod is not in the winner's file | VFS-01 VFS-41 | merge |
| CONFLICT_LNG_KEY_LOST / _DIFF | warn | a `.lng` at one path replaced whole: texts only the earlier mod has show raw, shared ones show the winner's | LOC-01 LOC-18 | merge keys |
| CONFLICT_LNG_KEY_CROSS | warn | one text key in two differently named `.lng` of two mods; the file read later wins [T which] | LOC-04 LOC-22 | patch `texts` |
| CONFLICT_ENTITY_NAME_DUP | warn / info | one `.def` name in two folders: the second is ignored ("Entity redefinition"); the EARLIER source wins [T between two mods] | ENG-04 | rename one, ask |
| CONFLICT_TEX_EXT_SHADOW | warn / info | texture extension order beats mod order: last of `.dds .tga .bmp .jpg .png`, `.ebm` / `.tex` beat all | FMT-04 | take one copy |
| CONFLICT_MACRO_LOST / _DIFF | warn | the winner's copy of a shared file lacks or changes a `(define)` of the earlier mod | SDL-17 SDL-18 | merge or pick |
| WARN_CONFLICT_OPAQUE_MOD_MOD | warn | non-SDL file with different bytes in two mods; earlier fully lost | VFS-01 | take one copy |
| CONFLICT_FILE_DELETED | warn | a later mod's mod.info Delete or patch removes a file an earlier mod ships | VFS-23 VFS-35 | deleted-files.md |
| CONFLICT_MOD_NOT_LOADED | warn | the game drops a mod: missing Require, cycle, version or mode gate, twin folder name | VFS-16 VFS-17 VFS-48 VFS-63 | load-order.md |
| MOD_ORDER_UNDECLARED | warn | different bytes for one file, no Require chain between the two mods | VFS-15 | add Require (patch mod) |
| CONFLICT_PAK_LOOSE_SAME_MOD | info | one mod holds a file loose and in its own pak; scan order decides [T in game] | VFS-08 VFS-55 | tell its author |
| CONFLICT_PATCHED | info | the last mod Requires every clashing mod: its copy is the decided one | VFS-15 | done |
| CONFLICT_JOINT_PARSE / _REF | warn | breaks only when loaded together (`--joint`) | joint-view.md | merge, re-add |
| CONFLICT_SHADER_SET / CONFLICT_MISSION_MOD | info | shader files / a map's own `mod/` folder | VFS-56 VFS-33 | note for the user |
| ITM_KEY / ITM_FILE / ITM_CLEANED / CLEAN_REPARSE | info / warn | copy identical to what it overrides (`--itm`, `--clean`) | dead-weight.md | optional clean |

## Per game
| game | note |
|---|---|
| as64 | all codes; mode gate lines name Classic / Enhanced |
| mowas2 | same codes; no `as64+` lines |
| goh | `.pot` compared by `msgctxt` (GHLOC-08 [I]); CONFLICT_LNG_KEY_CROSS does not compare `.pot` files; no MOD_ORDER_UNDECLARED (Priority order, GHVFS-25) |

## Silent fails
- every warn code above is silent in the game: no log line names the lost entry, text or macro
- info lines are not "fine" when the user expected the earlier value: CONFLICT_KEY_OVERRIDDEN on a key they tuned

## Verify
- one example per code checked by hand: MCP `mow_file_which` (`path`, `mods`) names the same winner the line does
