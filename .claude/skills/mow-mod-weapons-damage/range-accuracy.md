# mow-mod-weapons-damage: range, spread and accuracy

when: "longer range", "gun is too accurate", "MG sprays", "tanks hit on the move", "first shot always misses", "mortar arc".
game word: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. `<mod>` = the user's mod folder.

## Steps
1. read: MCP `mow_weapon_find` (`q` = exact name, `mod`) → range and what the file writes; `mow_unit_stats` (`id`)
   CLI `node tools/statsheet/statsheet.js [gameDir] [--exe as64|mowas_2|goh] [--folder <mod>] --sheet weapons --fmt md --filter <name>`
2. range: MCP `mow_weapon_change` (`mod`, `weapon`, `what: "range"`, `value` = one or two numbers "aim max", `write`)
3. spread or another value: `mow_weapon_change` with `what` = the value name; a new gun: gen op `gun` fields `range`, `accuracy`, `spread`, `aim` through MCP `mow_mod_gen` (`mod`, `ops`, `write`)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --file <weapon key> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
4. accuracy on the move is on the UNIT (weapon place), not the weapon: gen op `set` or `macro` on the unit's `abm_*` call
5. GUI: Units & Balance tab > Balance sheet (column `range`), Units page for one unit; routes via `gui_routes`
6. will it still fire at that range: `node tools/firecheck/firecheck.js <def> [--exe as64|mowas_2|goh] [--game G] [--dist N]` (FC_RANGE is a warning)

## Range (shared engine) [V]
- `range {aim max}` metres. aim range = "max effective range": it scales the damage curve / spread functions and what the AI engages. max range with no number = unlimited
- a penetration table should reach the range: it is clamped past its last point (DMG-02) and the vanilla presets end at range+5 (GPL-03)
- `speed` m/s and `gravity` shape the flight; `reactive 1` = rocket (no gravity, wobble)
- `aimType direct|curved|adaptive`: curved = mortar lob; adaptive = lob by aim-bone height
- `AimingTolerance` deg = largest aim error at which it fires; `RelaxationTime` = aim settle time

## Spread (shared engine) [V]
- `spreading {..}`: `SpreadRadius` m, `SpreadXYRatio`, `SpreadPower` (>1 pulls shots to the centre), `BurstAccuracy p1 p2 ..` per shot of a burst, `RadiusFunction` (factor by distance/aimRange), `RadiusTable {m r}..` (radius by metres)
- base radius priority: `RadiusTable` > `RadiusFunction * SpreadRadius` > `(distance/reach) * SpreadRadius`
- then divided by: the aimed-shot `accuracy` of the weapon's `special`, else the place's `ManualAccuracy` in direct control; by the accuracy-by-motion value; times the zeroing factor; vehicles also by crew efficiency
- `ZeroingAccuracy a b c ..`: factors for following shots at the same target (shooter within 5 m, target within 10 m of the last shot); under 1 = tighter
- small arms usually get their spread from `accuracy_curve_*` / `distance_*` macros in the stuff `.presets`: change the macro to move a whole class

## Accuracy on the move [V]
- weapon place block `AccuracyByMotion {maxlinearspeed}{bylinearspeed}{maxangularspeed}{byangularspeed}{disordertime}{ordertime}`: value 1 standing, falls with speed, recovers over `ordertime`
- weapon `SpreadTolerance`: no shot while the motion value is under it; place key `StationaryFiring` = fire only when stopped

## Per game
| game | note |
|---|---|
| as64 | as above |
| mowas2 | same keys; `--exe mowas_2` |
| goh | same weapon file form; extra sway and recoil keys copied by `from` (GHKEY-63); not run in game [T]. |

## Silent fails
- KEY-18 `AccuracyByMotion` `by*` above 1 is invalid
- KEY-09 `ZeroingAccuracy`, `aimType`, `burst` inside a `parameters` block change the whole weapon
- the perk `accuracy` entry point is not in the spread chain: effect of an accuracy ability is [T]
- a longer range with the old table: the shell flies further but penetration stays at the table's last value
- VFS-01 the weapon file / unit def becomes a full copy in the mod

## Verify
- `mow_weapon_find` with `mod`: new range shown
- in game: fire at the new range, count hits out of a fixed number standing and moving; read the log (→ skill `mow-mod-test`)
