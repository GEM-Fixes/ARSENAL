# mow-games: which tool or page serves which game
When: "does this tool work for GoH", "why did the tool refuse", "which page for MoW:AS2".

## Steps
1. One tool: `mow_tools {tool: "mow_matchup"}`; by word: `mow_tools {find: "armour", what: "all"}`.
2. Pages per game: `gui_pages {game: "goh", word: "play"}`.
3. Per-CLI game notes: the description column of `tools/index/*.md` (each line says what `--exe goh` or `--exe mowas_2` does or refuses).

GUI on the GoH tab: bot buy lists and adding a unit to them, Conquest doctrine, bot habit recipes, price calculator (check, preview, write, undo, a price model saved in the mod), Describe a new unit, armour and top speed edits, armour simulator (one plate, 3D shot and map, bounce, later plates, blast), soldier winter look (skin copy), armour / model / map / mission / gun / ammo / skin / icon / army / text / sound / voice / item / new soldier / release tasks, new army, a new game mode for a map (battle zones, ammunition, evacuation, koth, guerrilla, captureflag), new zones and flags, placing objects, Balance columns cost, charge, wait, reload, speed, armour, single-player mission card (read, preview, write, undo, remove; a vehicle group as escort or lose unit), mission and reference checkers, most wizard fixes all work [T]; GoH writes take a restore point (Files page). Still refused there, each with its reason on the page: bot match and test runs (GoH has no control pipe), mission orders, front lines / campaign / cooperative modes, the fixes bot keys, stub materials and quarantine. Measure: `node tools/gui/test/goh-parity.js`.

## CLI tools
| serves | tools |
|---|---|
| all three (`--exe as64|mowas2|goh` or `--target`) | check, doctor, wouldload, modinfo, vfs, modswitch, conflicts, overdiff, statsheet, balance, refcheck, logtriage, mpsync, keyprof `--file`, workshop, crashwatch, testplan, upgrade `--to` |
| not GoH (refused in plain words) | armorsim, defcheck, portverdict, botrecipe fix mode, `as2 install` |
| AS64 only | live `testrun`, `keyprof --inst`, memsample, newbuild, edrun pairs |
| MoW:AS2 and GoH instead | `--dry`, and `uidrive` recorded menu steps |
| between games | `node tools/goh2as2/goh2as2.js` (GoH to AS2), `node tools/as2togoh/as2togoh.js` (AS2 to GoH), `node tools/upgrade/upgrade.js <modDir> --to as64|mowas2|goh --plan`, `node tools/modmove/modmove.js static <mod> --from X --to Y` |

## MCP
Every `arsenal` tool takes `game` (`as64` default, `mowas2`, `goh`). A tool that cannot serve a game answers `na` with the reason; that is an answer, not a fault. Army ids differ: as64 / mowas2 `usa ger rus eng jap ger2`; goh `rus ger fin eng usa`. `period` and `doctrine` are GoH-only arguments.

## GUI
Three game buttons at the top (MoW:AS2, AS64, GoH); every page exists under each. A page a game cannot run says why on the page. Play runs on AS64 only.

## What goes wrong
- `mowas_2` passed to an MCP tool: MCP says `mowas2`; gameprofile says `mowas_2`.
- a tool run with the default game on a GoH mod: findings for the wrong rules. Pass `game`.
- `na` reported to the user as an error.

## Check
`mow_tools {tool}` shows the `game` values the tool takes.
