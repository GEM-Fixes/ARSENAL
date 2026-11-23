# armorsim/ingame: the in-game check of the penetration checker

Step 6. The tool prepares a shot table before the owner plays and compares the game's log after. It never starts the game or the editor and writes only into the folder named with `--out` (the compare writes into that same folder).

```
node tools/armorsim/ingame/shottable.js plan <unit> --weapons "W:ammo,W:ammo,W:ammo" --range 100 [--faces front,rear,left,right] [--aim body,turret] [--game G] [--folder MOD] [--samples 400] [--wait 20] --out DIR
node tools/armorsim/ingame/shottable.js compare DIR --log "<game folder>/log/game.log"
```

`plan` writes `table.json` and `table.md`: one row per shell, face and aimed volume, with the prediction of `effects.effects()` (engine events in order, where the shell ends, parts with chances, tags, blasts) and the steps for the owner. An aim name with no volume of its own takes the first volume whose name starts with it (`body` gives `body1`). When the reader gives another ammo than the one asked, the table says so.

`compare` writes `compare.json` and `compare.md`: per row the events seen and predicted, the parts seen broken, a verdict (`same`, `differs`, `not fired`) with what differs, and at the end the RULES.md numbers each difference points at.

## Short steps for the owner

1. Scene editor (`as64_ed.exe -edit multi/<flat map>:combat`), not a multiplayer game: events print only for the selected unit, and only the editor lets you select the enemy target.
2. Console: `dbg_interactionEvent 1`, `dbg_interactionEventInfo 1`, `v_bulletPath 1` (on screen only), `con_file 1` (the default).
3. Target for the enemy player, AI, hold position; shooter for your player at the range of the table; the row's face towards the shooter. START, then select the target.
4. Per row: type `shot_N`, fire one shell of the row at the named volume (direct control), wait the seconds given, Stop (fresh tank for the next row).
5. Close the game, run `compare` before the next start (game.log is rewritten at every start).

## Log lines read (as64)

| Line | Written by | Tag |
|---|---|---|
| `EVENT: <name>` for the inspected entity only, when `dbg_interactionEvent` is not 0 | | [V] |
| `Info entity: "<name>"` (+ ` [frozen]`), then ` Position: x y z`, ` Direction:`, ` Normal:`, ` Bullet: <tags>`, ` Effector: "<name>"`, ` Volume: <first tag>`, ` Component: <part>`, ` Bone:`, ` Name: <sender>`, ` Data: <float> (<int bits>)`, each only when the command carries it | (`dbg_interactionEventInfo`) | [V] |
| inspected entity = scene editor selection first (editor build), else the player's selection | | [V] |
| every console line goes to game.log while `con_file` is 1 (default), colour markup stripped, CR LF | | [V] |
| a typed line is echoed as `> <line>`; an unknown word answers `atom not found : '<word>'` | | [V] |
| `v_bulletPath` draws the shell path, writes nothing to the log | | [V] |
| `dbg_piercing` is declared but never read: writes nothing | | [V] |
| EVENT names equal the script spelling (`bullet_hit`, `pierce`, `break`...) and named handlers reached by `call` may print too | | [I] |
| the shipped as64_ed.exe prints the same lines as this source tree (build may differ | - | [I] |

Lines of any other form are counted (`other lines`, also per shot), never read. With no marker in the log, a new shot starts at each `EVENT: bullet_hit` [I]: a shell that hits the same tank again after a ricochet would split one shot in two.

## How a row is judged

- Required: the engine events of the first run (`engine.events`, the armour stage has no dice) must appear in that order; extra events are fine when a script makes them with a chance (part changes give `break`, script blasts give `blast_hit` / `blast`).
- Parts: with Info lines, the `Component` of `break` events gives the part, one break = broken, two = destroyed (RULES 31). A part seen with no predicted chance, or a part predicted in every run and not seen, is a difference. Chances between 0 and 100% are never a difference.
- Tags are not printed by the engine: not compared.
- Volume and sender of matched events are compared when the Info lines carry them.

## Open

- Armour factor: in the editor the difficulty factor applies to vehicles; a marginal pierce can differ for that reason. [I]
- No generated test mission: the owner places the two vehicles. edrun places pairs but lets them fight on their own, so it cannot aim one shell at one face.
- Test: `sh tools/armorsim/ingame/test/run.sh` (synthetic unit, fake logs, a planted difference, junk lines).

Author: Imperator_Aug (ARSENAL, ia-5f3c1a07)
