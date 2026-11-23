# mow-mod-weapons-damage: can gun X go through unit Y at range R (armour simulator)

when: "can this gun kill that tank", "at what range does it stop working", "what beats this unit", "where is it thin", checking a change before the game.
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2`. Reads only (armorsim `edit` is the one writer → armour-volumes facts: `armorsim.js edit .. --out <mod> --dry`).

## Steps
1. one match-up: MCP `mow_matchup` (`attacker` = shooting unit, its main gun is used; or `gun` = a weapon name; `ammo` = name or tags, default the first armour-piercing shell; `target`; `range` m, default 100; `mod` = full path of one mod to read on top)
   answers front, side and rear, the share of hits that go through and the furthest range that works
2. what beats a unit: MCP `mow_unit_counter` (`unit`, `army`, `enemy`, `range`, `max_price`, `limit`, `mod`; `period` goh only): cheapest first, says which work only from side or rear and whether the unit can shoot back
3. plates of the target: MCP `mow_unit_armor` (`unit`, `mod`)
4. CLI `node tools/armorsim/armorsim.js table|shot|map|edit <unit> [--weapon W --ammo A | --shell S] [--range M] [--from az,el | --origin x,y,z --dir x,y,z] [--view front|rear|left|right|top|az,el] [--grid WxH] [--game G --mods a,b --folder dir --json] [--exe as64|mowas_2]`
   - `table` = six side values per volume + which rule set them
   - `shot` = one ray: plates in order, penetration left, ricochet chance, verdict. `--from az,el`: 0 = front, 90 = left side, el up; `--aim-volume <name>` aims at one volume; `--origin/--dir` in engine units (20 per metre)
   - `map` = grid of parallel rays from a view (default 64x48): what each cell hits and whether it goes through
   - `--shell` takes a weapon name, ammo tags or a JSON shell; exit 0 done, 1 problem, 2 usage
5. GUI: Models tab > Armour (table, shot, thickness map, guns and shells lists; not GoH). routes `models/armor/table`, `armor/shot`, `armor/map`, `armor/guns`, `armor/shells` via `gui_routes` / `gui_call`

## What the simulator follows (shared engine) [V]
- penetration at the range from the gun's table for that ammo's tags (linear, clamped at both ends)
- thickness of the hit side: armour macro side if nonzero, else the volume's own; left = right = side, bottom = top
- slope from the real face normal of the volume, capped at 10; overmatch from gun calibre
- pass is deterministic; a failed hit may ricochet (chance by grazing angle and material, at most 2)
- every volume crossed gives an enter and an exit hit; the shell loses energy per plate
- what it does NOT tell: what the vehicle scripts do after a pierce (crew kill, fire, knock-out are script chances by shell class) Hull-red is a poor mark of a pierce; use "crew left" as the kill mark when reading plates (DMG-27)

## Per game
| game | note |
|---|---|
| as64 | traced through real plates |
| mowas2 | same, `--exe mowas_2` (no `as64/core` layer) |
| goh | armorsim refuses GoH (exit 2, owner decision). `mow_matchup` and `mow_unit_counter` answer a FLAT comparison of penetration against plate thickness and say so; GoH overmatch and plate factors are not modelled (GHDMG-27, GHDMG-37) |

## Traps
- the result is a prediction [I]: name it so until shots were seen in game
- DMG-25 a hull has no single front value: ask per plate or use `map`
- DMG-28 a close stand reads the table's first knot
- DMG-09 a ricochet happens only after a failed penetration; HE (`fg`) never ricochets
- single-player difficulty scales armour per side; multiplayer factor is 1: compare in multiplayer test mode
- `mod` reads ONE mod on top of the game; for a stack use the CLI `--mods a,b`

## Verify
- in-game table of shots: `node tools/armorsim/ingame/shottable.js plan <unit> --weapons W:ammo,.. --range M [--faces front,rear,left,right] [--aim body,turret] [--folder MOD] [--exe as64|mowas_2] --out DIR`, the user runs the editor steps it prints, then `node tools/armorsim/ingame/shottable.js compare DIR --log <game.log>`
- console helpers for a live look: `v_bulletPath 1`, `dbg_interactionEvent 1` [V]
