# mow-mod-together: one Classic and one Enhanced mod (as64)

when: on as64 one mod of the list is "not applied", the game crashes at start with both listed, or CONFLICT_MOD_NOT_LOADED / MOD_MODE shows. as64 only: mowas2 and goh have no modes.

## Steps
1. read each mod's mode: MCP `mow_mod_info` (`mod` = full path, `game: as64`): version range and the mod.info check
   CLI `node tools/modinfo/modinfo.js <mod dir> --exe as64` (VER_CRASH = refused for its version, crashes instead of refusing)
2. the rule (VFS-48 [V]): a mod is Enhanced ("modern") when `MinGameVersion` >= 3.301, else Classic ("legacy", data version 3.262.N must lie in its range). The list is Enhanced when the built-in `as64+` is listed. A mod applies only when its mode equals the list's mode
3. so a Classic and an Enhanced mod can not both mount: one index per mode (VFS-54 [V vfs, T in game]). Pick the mode with the user:
   - both to Enhanced: upgrade the Classic one into a COPY: MCP `mow_mod_upgrade` (`mod`, `out` = new folder, `game: as64`; plan, then `write: true`) · CLI `node tools/upgrade/upgrade.js <modDir> --to as64 (--plan | --out dir --mode enhanced)`
   - both Classic: only when the Enhanced mod needs nothing of `as64+`; a downgrade is a hand job, say so
4. see what the game would drop: MCP `mow_mods_clash` (`mods`) names the refused mod · CLI `node tools/vfs/vfs.js G --exe as64 --mods a,b` (MOD_MODE)
5. set the list: MCP `mow_mods_enable` (`mods`, for Enhanced `as64+` first; `dry: true` shows the plan; it refuses a mode-mismatched list unless `force`)
   CLI `node tools/modswitch/modswitch.js --game G --exe as64 --set as64+,a,b` (dry; `--write` refused on a mismatch unless `--force`: do not force)
6. GUI: Mods tab > Upgrade (the copy), Mods tab list (mode shown per mod)

## Per game
| game | note |
|---|---|
| as64 | as above. `as64+` is built in, always first, a mods/ folder named `as64+` is dropped (VFS-47) |
| mowas2 | no `as64+`, no modes; a mod with Min above 3.262 is skipped by mowas_2.exe [I] (modswitch WARN_MOWAS2_VERSION, WARN_MOWAS2_NO_PLUS) |
| goh | no modes; the range must hold the GoH exe version (lim PORT-46); to bring an AS2 mod there → skill `mow-mod-port` |

## Silent fails
- VFS-48 a modern mod is silently off in Classic, a legacy mod off in Enhanced: its units just are not there
- ENG-26 on as64 the "made for X mode: not applied" line runs before fonts load: the game crashes at start instead of refusing [V live]
- VFS-59 the same for a mod refused for its version: crash, not a refusal
- the crash is not a lint line in either mod's files: each mod checks clean alone in its own mode
- conflicts leaves a refused mod out of the comparison: "no clashes" can mean "one mod was not loaded"

## Verify
- `mow_mod_check` (`mod` = the upgraded copy, `game: as64`) verdict LOADS_STATIC; upgrade verdict "static clean" or "partial", never "works"
- `mow_mods_clash` with the copy in place of the old mod: no CONFLICT_MOD_NOT_LOADED
- in game: the menu is reached with the whole list on, units of both mods are in the buy menu; game.log read (→ skill `mow-mod-test`). more on upgrading: skill `mow-mod-check-fix`
