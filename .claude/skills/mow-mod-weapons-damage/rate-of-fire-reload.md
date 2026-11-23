# mow-mod-weapons-damage: rate of fire, reload, bursts, magazine

when: "faster reload", "slower rate of fire", "longer bursts", "bigger magazine / belt", "the AI fires single shots", "autocannon".
game word: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. `<mod>` = the user's mod folder.

## Steps
1. read: MCP `mow_weapon_find` (`q` = exact name, `mod`) (reload is among the written values) · `mow_unit_stats` (`id`) for the unit's main gun reload
   sheet: `node tools/statsheet/statsheet.js [gameDir] [--exe as64|mowas_2|goh] [--folder <mod>] --sheet weapons --fmt md --filter <name>`
2. change one value: MCP `mow_weapon_change` (`mod`, `weapon`, `what` = `rechargeTime` or `recoveryTime`, `value`, `write`)
3. a new variant with its own rhythm: gen op `gun` with `like` + `recharge`, `rof`, `burst`, `magazine`, `reload` through MCP `mow_mod_gen` (`mod`, `ops`, `write`); sample `node tools/gen/gen.js --sample gun-class` (faster fire, longer bursts, bigger belt, quicker reload)
   CLI `node tools/gen/gen.js spec.yaml|json --target as64|mowas2|goh [--plan] [--out dir] [--game G]`
4. CLI one key: `node tools/patch-entity/patch-entity.js <mod> --game G --file <weapon key> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
5. GUI: Units & Balance tab > Balance sheet (column `reload`; bulk change with preview), Units page for one unit; routes `balance/table`, `balance/change` via `gui_routes` / `gui_call` (`write: true` in the body to write)
6. lint: `node tools/check/check.js <mod> [--exe as64,mowas2,goh]`

## Keys (shared engine) [V]
| key | meaning |
|---|---|
| `rechargeTime` s | reload (new magazine / next shell). vehicles: shortened by crew efficiency; soldiers: by the veterancy reload bonus |
| `recoveryTime` s | time between shots / bolt cycle. rate of fire = 1 / recoveryTime inside a magazine |
| `automatic` | keeps cycling `recoveryTime`; `automatic_ai` for the AI |
| `burst {min n}{short n dev}{long n dev}{rangeKoef f}{noaiming}` | `min` = shots per trigger pull; short / long = AI burst lengths; `rangeKoef` x aim range picks the long burst; `noaiming` = fires without aim lock inside max range |
| `ReloadAnimBonus` s | shortens the animated reload of a soldier and its sound |
| `LockFireDistanceTime` s | blocks the next shot until elapsed |
| `ammoLocked` | ammo can not be switched |
| `spreading {BurstAccuracy ..}` | spread per shot of a burst; `BurstRecoveryTime` |
- magazine size is how much ammo the weapon holds per fill: on the unit it is `{weapon "<name>" filled}` (full default magazine) or `filling "<ammo tags>" <count>`; gen `gun` field `magazine` sets the default [V schema]
- `rechargeTime` and `recoveryTime` may be set per ammo in `parameters "<tags>"`; `burst` may not (it changes the whole weapon: KEY-09)
- multi-barrel weapons: place keys `barrels`, `shooter` cycle the barrel bones

## Per game
| game | note |
|---|---|
| as64 | as above |
| mowas2 | same keys; `--exe mowas_2` |
| goh | same file form; adds `FiringTimeout`, `SyncedProjectiles`, recoil keys copied by `from` (GHKEY-63); `mow_weapon_change` there was never run in game [T] |

## Silent fails
- KEY-12 an ability's weapon reload is stored under the key `aim_range`; there is no `reload` key there [T]
- KEY-09 `burst` inside `parameters` is not per-ammo
- GPL-13 an undefined ability level string gives the soldier the TOP level (a hidden reload buff)
- a faster gun changes balance sheets (damage per minute): run a balance pass after (MCP `mow_balance_check`)
- VFS-01 the weapon file becomes a full copy in the mod

## Verify
- `mow_weapon_find` with `mod` shows the new values
- in game: time a full magazine and a reload with a stopwatch, crewed by a fresh crew (veterancy and crew count change it); read the log (→ skill `mow-mod-test`)
