# mow-play-trouble: a mod is missing, refused or not in effect
When: "my mod is not in the list", "enabled but nothing changed", "not up to date", "not applied".

## Steps
1. `mow_mod_info {game: "as64", mod: "<path>"}` -> version range, required mods, the `mod.info` check for that game.
2. `mow_mod_check {game: "as64", mod: "<path>"}` -> load verdict (REFUSED, LIKELY_CRASH, LOADS_STATIC, UNKNOWN) and the worst findings.
3. `mow_game_status {game}` -> is it in the enabled list, at which place.
4. Match the table.
CLI: `node tools/wouldload/wouldload.js <modDir> --exe as64,mowas2,goh` · `node tools/modinfo/modinfo.js <mod> --exe <game>`. GUI: Mods > Check & Fix > Read Game.log > "Why is my mod not in the list?" (`logs/modwhy`).

## What they see -> cause -> row -> games -> check
A = AS64, M = MoW:AS2, H = GoH.
| sees | cause | row | G | check |
|---|---|---|---|---|
| mod not in effect, no message | `mod.info` without Min/MaxGameVersion, or range not holding 3.262 | PORT-48 VFS-19 [V] | A M | wouldload |
| "not up to date", no ACTIVATE | range not holding the GoH version (1.x scale); dropped from the list on exit | PORT-46 [V] | H | `node tools/modinfo/modinfo.js <mod> --exe goh` |
| "made for X mode: not applied" | Classic mod in Enhanced or the reverse | VFS-48 ENG-26 [V] | A | modswitch (MOD_MODE) |
| gone from the list after a rename | a line naming a missing folder is dropped | TST-13 [V] | A M | re-enable in Options -> MODS |
| typo in `mod.info` | unknown keys and parse errors are silent | VFS-20 [V] | A M | modinfo |
| `Delete` line does nothing | needs the `resource/` prefix | VFS-21 [V] | A M | modinfo DELETE_PREFIX |
| needs another mod | `Require` mod missing from the list -> skipped | VFS-17 [V] | A M | `node tools/vfs/vfs.js <gameDir> --exe <game> --mods a,b` |
| child mod alone: "define not found" at boot | parent mod not listed first | PORT-52 [V] | A M | enable the parent before it |
| hand fix not picked up | the subscribed Workshop item loads instead of the `mods/` copy | LOG-17 | A | unsubscribe or rename |
| only some files load | only `resource/`, `resource.pak`, `N.pat`, `localization*` mount | VFS-26 [V] (GoH GHVFS-04) | A M H | wouldload READ counts |
| two mods, one wins | a later mod replaces whole files of the earlier | VFS-01 VFS-15 VFS-41 [V] | A M H | `mow_mods_clash {mods: ["a", "b"]}` |
| duplicate or empty mod folder | GoH warns in the log; the AS2 exes stay silent | LOG-21 | A M H | `mow_game_log` |
| the enabled list carried between exes | AS64 and MoW:AS2 share one profile | LOG-20 [V] | A M | `mow_game_status` |

## Per game
- AS64: a mod for the other mode is listed but greyed "not applied".
- MoW:AS2: a 3.301 mod is silently off.
- GoH: an AS2 mod (3.x range) is refused; `Tags "develop"` lifts the check for authors only (GHVFS-02).

## What goes wrong
- the version line edited to force a load: the mod may then crash; say so.
- the zip unpacked one folder too deep: `mods/<name>/mod.info` must exist.

## Check
`mow_mod_check` verdict is not REFUSED; the game log (AS64: `Mod 'x' from`, GoH: `Mod: activate mod x`) names the mod.
