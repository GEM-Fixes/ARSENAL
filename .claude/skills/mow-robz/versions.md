# versions: 1.30 against 1.31 and what follows for sub-mods

Always name the version a statement is about. `mow_robz_find` says which ones are installed; `mow_robz_issues version <v>`
filters the known issues; the live tools read whichever install is chosen.

## Three things called "1.31"
| what | data | state |
|---|---|---|
| 1.30.10 (Workshop, paks) | the long-standing public version | most findings in refmods/robz are about this one [V] |
| published 1.31.0 (paks) | pak contents equal to 1.30.10 by checksum; one interface file differs [V] | treat as 1.30.10 |
| 1.31.x tree (loose files) | restructured, see below | read only, not run in game [T] |
So "I have 1.31" needs one more question: paks or loose files? `mow_robz_find` shows the layout.

## What the loose 1.31.x tree changes (read from the files [V], effect in game [T])
- unit sets and presets split by year (41 .. 45) instead of one late-war set; cards can be priced per year
- many more soldier files; bots get their own files plus per-map lua
- maintainer state on top: shared macro files (armour, crew, interaction, vehicle, volumes, weapon), one-line card macros,
  breed macros and kits, veteran guns that inherit from the base gun, texts split into many files, MACROS.md at the root
- a share of the card ids renamed (side in brackets, `_seq` ids gone), some defines removed or renamed, grenade item names changed
- the unit limit separator defect of 1.30 is fixed there (RZ-LIMITS)
Counts move with every build: `mow_robz_changes` (live counts), `mow_robz_system kind macro` (defines), not this file.

## What a sub-mod must follow when RobZ moves 1.30 -> 1.31.x
| sub-mod has | risk | check |
|---|---|---|
| a replaced unit set or preset file | file name or include list changed; old copy hides the new year sets | `mow_robz_submod` (WHOLE_FILE_COPY), diff against the new file |
| card ids in bot lists, missions, limits | renamed ids are skipped in silence by bot spawn (lim MIS-46) | `mow_robz_unit q <id>` on the new version |
| calls of RobZ macros | define gone or renamed -> "define not found" at load | `mow_robz_system kind macro q <name>` |
| item names (grenades) in breeds or kits | soldier spawns without the item | `mow_mod_check` |
| `.lng` files with RobZ file names | replaces a file that now holds other keys | new file name instead (submod.md) |
| `Require "<folder>"` | folder name carries the version | update the name |

## Maintainer side (changing RobZ itself, in a working copy the owner names)
- `node tools/macrostd/macrostd.js scan|plan|apply <modDir> --game <dir>`: macro inventory and standardising, with undo folder
- `node tools/cardrename/cardrename.js --help`: card id renames with a verify pass
- `node tools/lngsplit/lngsplit.js dead|split|join`: dead keys and the split of text files
- each change: `mow_mod_check`, then a match per touched army; record what was run

## Telling users
- a player on the Workshop version: everything in the 1.30 notes applies
- a player or modder on a loose 1.31.x tree: data facts from the live tools are right for their folder; behaviour is [T]
- never mix: a 1.30 sub-mod on a 1.31.x tree (or the reverse) is the first thing to rule out in a bug report

## Depth
- `mow_robz_notes topic "1.31"`, `mow_robz_issues version 1.31 area versions`
- refmods/robz/findings.md, potential.md
