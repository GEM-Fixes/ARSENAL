# mow-mod-together: set-table clashes (units, cards, squads vanish)

when: with mod B on, units, buy cards, squads, presets or weapons of mod A are gone, with no error. Codes CONFLICT_FILE_SHADOW, CONFLICT_ENTRY_LOST.

## Steps
1. list: MCP `mow_mods_clash` (`mods` in load order, `file`: `resource/set/**`) · CLI `node tools/conflicts/conflicts.js --game G --mods a,b --file "set/**" [--exe as64|mowas_2|mowas2|goh] --mods-only`
2. see what each mod does to the file: MCP `mow_mod_diff` (`mod` = full path, `mods` = mods loaded before it, `file` or `q`, `keys: true` = every key)
   CLI `node tools/overdiff/overdiff.js <mod folder> [--game dir] [--mods a,b] [--exe ..] [--summary]` (OVR_FULL_SHADOW = a vanilla file replaced whole)
3. why: both mods ship their own full copy of one table (a roster in `set/multiplayer/units/`, a unit list, presets, a stuff file). the later copy is read; entries only the earlier mod added are not in it (VFS-41, VFS-42 [V])
4. fix = keep both sides' entries in one file of a patch mod: MCP `mow_mods_patch` (`mods`, `out`, `name`; plan first, `write: true` on the user's yes)
   CLI `node tools/conflicts/patchmod.js plan|write --game G --mods a,b --out <new folder> [--exe ..] [--spec f.json]`
   merge is by entry, the game's file as the common start: an entry the earlier mod added goes in whole; an entry only one mod changed takes that mod's value; an entry both changed keeps the winner's unless spec `picks: { '<entry path>': mod }` or `prefer: mod` says otherwise (a "choice" in the plan: ask the user)
   a block with a quoted name and blocks inside (`{card "x" {..}}`) is one entry by that name
5. GUI: Share tab > Share page > Mods together, guided fix per file; routes `POST /api/x/share/clashes`, `POST /api/x/share/clashfix` via `gui_call`

## Per game
| game | note |
|---|---|
| as64 | rosters `set/multiplayer/units/*.set`; with Enhanced mods the built-in `as64+` is first, player mods always override it (VFS-47) |
| mowas2 | same files, no as64/core, `--exe mowas_2` |
| goh | cards sit in `units/<period>/units_<army>.set` [I]; same whole-file override; patchmod on goh was not run in game [T] |

## Silent fails
- VFS-41 the later mod's copy of a vanilla SDL file drops every top-level entry the earlier mod added: no log line
- VFS-42 a mod roster replaces the whole file: the other mod's cards are gone from the buy menu
- TST-94 two mods that both ship `units/common.set` clash; the engine reads only the first of `<gameType>.set`, `<gameClass>.set`, `common.set`, and a mod `common.set` replaces the stock list whole [V, T game]
- MIS-32 bots buy by exact card name: a card lost in the merge is silently not bought (→ skill `mow-mod-ai-bots`)
- an entry put back may name a macro or file the winner's side lacks → macro-clashes.md, joint-view.md

## Verify
- plan rows: `added`, `auto`, `choices`; PATCHMOD_CANT = could not merge, PATCHMOD_NOT_WINNING = the patch file is not the one read
- `mow_mods_clash` with the patch last: the patch wins every file it covers (CONFLICT_PATCHED)
- `mow_army` (`army`, `mod`) or the GUI Units page shows cards of both mods; in game buy one unit of each (→ skill `mow-mod-test`)
