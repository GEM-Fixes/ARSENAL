# mow-mod-together: macro and define clashes

when: game.log says `define not found` only with both mods on, or a unit of mod A behaves otherwise with mod B. Codes CONFLICT_MACRO_LOST, CONFLICT_MACRO_DIFF.

## Steps
1. list: MCP `mow_mods_clash` (`mods` in load order; `file` narrows to the shared include, e.g. a `.inc` path pattern)
   CLI `node tools/conflicts/conflicts.js --game G --mods a,b [--exe as64|mowas_2|mowas2|goh] [--file <vfs glob>] --joint` (`--joint` adds where the reader stops: CONFLICT_JOINT_PARSE)
2. why: both mods ship a copy of one shared file that holds `(define "name" ..)`. the later copy is read. a define only the earlier mod added is gone (LOST); one both hold with a different body expands the winner's way (DIFF) [V, I]
3. choose with the user:
   - LOST: put the earlier mod's define into the merged file (safe: nothing else used that name)
   - DIFF: pick one body, or keep both under two names. renaming one side's macro means changing every caller in that mod too: that is a copy of those files in the patch, not a small merge. ask first
4. write: MCP `mow_mods_patch` (`mods`, `out` = new folder, `name`; plan, then `write: true`)
   CLI `node tools/conflicts/patchmod.js plan|write --game G --mods a,b --out <new folder> [--exe ..] [--spec f.json]` (spec `picks` / `prefer` choose a body)
5. GUI: Share tab > Share page > Mods together, macros group (`gui_call` `POST /api/x/share/clashfix`)

## Facts (shared)
- a define is known per top-level reader, only after its definition: a sibling file that never includes it gets `define not found` (SDL-17 [V])
- macro names are exact and case-sensitive: `"Armor"` != `"armor"` (SDL-18 [V])
- patchmod reads entries without macro or include expansion; the merged file is read again by the strict reader and left out if it finds a new error

## Per game
| game | note |
|---|---|
| as64 | includes resolve through as64/core and `as64+` (Enhanced) as well as the mods |
| mowas2 | same reader; no as64/core |
| goh | same define rules as far as read [I]; armour and health macro sets differ from AS2, so a body picked from an AS2-style mod may not fit (→ skill `mow-mod-port`) |

## Silent fails
- CONFLICT_MACRO_DIFF: no error at all; the earlier mod's units just get the other body (armour, sounds, tracks)
- SDL-18 a rename that differs only by case makes a new macro; old callers fail
- VFS-41 the define sat in a file the later mod replaced whole: every other entry the earlier mod added there is gone too → set-table-clashes.md

## Verify
- `node tools/sdllint/sdllint.js <patch> --game G --mods a,b [--exe ..]`: no MACRO_UNDEFINED, no MACRO_CASE_MISMATCH
- conflicts with the patch last and `--joint`: no CONFLICT_JOINT_PARSE left
- in game: spawn or buy a unit of each mod that calls the macro; game.log has no `define not found` (→ skill `mow-mod-test`)
