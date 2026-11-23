# mow-mod-weapons-damage: change one value of an existing gun

when: "make the 88 reload faster", "more range", "more muzzle speed", "more damage" on a weapon that already exists. Every unit that carries the weapon changes.
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. G = AS2 install, `<mod>` = the user's mod folder (the only place written).

## Steps
1. find the exact file name: MCP `mow_weapon_find` (`q`, `group`, `mod`)
2. change it: MCP `mow_weapon_change` (`mod` full path, `weapon` as step 1 shows it, `what` = `range` (default; `value` one or two numbers, aim and max) or the name of a value of the file such as damage, rechargeTime, speed; `value`; preview unless `write: true`)
   the mod gets its own full copy of the weapon file; the answer is old → new and the file
3. CLI, one key: `node tools/patch-entity/patch-entity.js <mod> --game G [--mods d] (--entity n|--file key) --set p=v|--add p=v|--del p [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
   many keys at once: gen op `set` (`rows` of `file`, `path`, `value`, or a `csv`) through MCP `mow_mod_gen` (`mod`, `ops`, `write`) or `node tools/gen/gen.js spec.yaml|json --target as64|mowas2|goh [--plan] [--out dir] [--game G] [--goh H]`
4. GUI: Units & Balance tab > Units page (weapon card of the unit), or the Editor tab on the weapon file; routes via `gui_routes`
5. lint: `node tools/check/check.js <mod> [--exe as64,mowas2,goh]`; then a shot in game

## Which key does what (shared engine)
| want | key | note |
|---|---|---|
| reload of a magazine / shell | `rechargeTime` s | crew efficiency and veterancy shorten it |
| time between shots | `recoveryTime` s | bolt cycle, burst rhythm |
| range | `range {aim max}` m | aim range also scales the damage curve and the AI |
| muzzle speed | `speed` m/s | `gravity` multiplies world gravity; ignored when `reactive 1` |
| penetration | `projectileDamageTable {m mm}..` | usually a `damage_*` macro in `.presets` |
| damage to soldiers | `healthDamage`, `projectileDamage` + `curve` | |
| spread | `spreading {..}` | usually an `accuracy_curve_*` macro |
| sounds | `fireSound`, `reloadSound` | path under `sound/weapon/shot` or `sound/weapon/reload` (GPL-15) |

## Per-ammo values
- `parameters "<ammo tags>" {..}` overrides for one ammo. ONLY these keys are per-ammo: `rechargeTime recoveryTime aimRange maxRange range cursor cursorReloading crosshair crosshairReloading gravity TraceFreq projectileDamage projectileDamageClip projectileDamageThreshold projectileDamageTable healthDamage healthDamageClip curve RicochetDamageClip RicochetEnergyDamping OvermatchDamping spreading bullet_view speed` [V]
- anything else written inside the block (`calibre aimType burst DisableRicochet ZeroingAccuracy`) changes the whole weapon (KEY-09)

## Per game
| game | note |
|---|---|
| as64 | default; reads base + `as64/core` |
| mowas2 | same keys; `--exe mowas_2` |
| goh | same file form; `mow_weapon_change` on goh was never run in game [T]; GoH adds per-ammo overmatch tables and other `from` copy rules (GHKEY-59, GHKEY-63) |

## Silent fails
- VFS-01 the mod's copy replaces the whole weapon file: another mod's edit of the same file is lost
- DMG-01 a value put in a `parameters` block whose tags do not match the ammo exactly is never used
- a value that comes from a `.presets` macro call: read the file first; change the macro argument (gen op `macro`: `entity`, `macro`, `arg`, `value`) or the call, not a second plain key [I]
- DMG-29 `{curve "x"}` not listed in `set/ballistics.set` is fatal at load ("Unknown curve")
- KEY-11 `ballistics.set` `damping` is loaded and never read
- GPL-15 an unknown sound name: warning only, silence in game

## Verify
- `mow_weapon_find` on the same name with `mod` shows the new value
- fire the gun in game at the range changed; read the log (→ skill `mow-mod-test`)
