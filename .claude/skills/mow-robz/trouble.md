# trouble: RobZ crashes, will not load, bots idle, no damage, raw text

General log reading and crash codes: skill `mow-play-trouble` (players), `mow-mod-test` (modders). Here: the RobZ causes.
Order: `mow_robz_find` (what is installed) -> `mow_robz_issues` (version, game, area or q) -> the log.

## Symptom -> first suspects
| symptom | suspect | id / check |
|---|---|---|
| not in the mod list on AS64, "made for the other mode" | legacy mod, game is in Enhanced mode | RZ-MODE, as64.md |
| crash when the mod is switched on | another mod is on too [author]; or two copies of RobZ | RZ-OTHERMODS, RZ-DUPCOPY |
| "different version" / out of sync in the lobby | Workshop copy against folder copy, sub-mods differ | `mow_mp_sync`, structure.md |
| crash when a certain unit is bought or a map loads | a short list of entities crash when named (1.30) | RZ-CRASHUNITS, `mow_robz_issues area crash` |
| "define not found" at load | sub-mod made for another RobZ version; paks used apart | versions.md, RZ-PAKSPLIT |
| no bots in Combat | the mode file has bots switched off | RZ-BOTSOFF |
| bots buy little or stand still | many bot unit names match no card (1.30); unknown names are skipped in silence (lim MIS-46) | RZ-BOTNAMES, skill `mow-mod-ai-bots` |
| a tank never fires at tanks | its target selector has no tank class | RZ-SELECTOR |
| hits do nothing on AS64 with some tanks | seen in test games, cause open [T] | RZ-SILENT |
| a "destroyed" tank is not counted by a mission or script | knocked-out tanks are tagged and emptied, the body need not break | RZ-KNOCKOUT |
| a vanilla unit or ammo box does not reload RobZ guns | per-nation shell names [I] | RZ-RELOAD, submod.md (rzsys) |
| a unit limit is ignored | limits list written with the wrong separator | RZ-LIMITS |
| names show as raw keys | `.lng` replaced whole by RobZ or by a sub-mod | RZ-TEXT, submod.md |
| sounds missing, items missing on soldiers | static data defects the game passes over | RZ-DATA, `mow_mod_check` |

## Steps
1. `mow_robz_find`: one RobZ, one version, no second copy; note layout (paks or loose)
2. only RobZ active (plus mods made for it). Player: skill `mow-play-setup` for the mod list
3. `mow_robz_issues version <v> game <g> q <word>`; read the row's tag: [V] known cause, [I]/[T] a lead only
4. sub-mod in play -> `mow_robz_submod`; fix high findings before looking further
5. log: `mow-play-trouble` / `node tools/logtriage/logtriage.js --help`; a define or file named in the log -> `mow_robz_system kind macro q <name>`, `mow_file_which`
6. still open: reproduce with RobZ alone, one army, one preset; write down version, game, mode, preset, unit

## What not to do
- no edits inside the RobZ folder or the Workshop folder to "fix" it: a sub-mod carries the fix (submod.md)
- no claim that a fix works before the game ran it and the log was read
- no advice to delete the Workshop copy; unsubscribing is the user's own step

## Reporting a new issue
- facts: RobZ version and layout, game (mowas2 / as64, mode), other mods, preset, map, unit ids, log lines
- where known issues live: refmods/robz/potential.md (defects), systems-test.md (in-game runs), upgrade-130.md (AS64 copy)
- a new confirmed issue belongs in those notes and in the issue list of the `robz` MCP group (tools/mcp/tools/robz/data.js)

## CLI
- `node tools/check/check.js <RobZ or sub-mod> --exe as64,mowas2 --game <G>` (read-only check)
-, `-k "robz crash"`
