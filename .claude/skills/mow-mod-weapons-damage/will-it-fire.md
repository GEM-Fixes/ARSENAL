# mow-mod-weapons-damage: a gun that does not fire or never aims

when: "my new tank does not shoot", "the MG is silent", "turret turns but no shot", "gun fires only when I control it", after a weapon swap, clone or port.
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. Reads only.

## Steps
1. static check of the unit: CLI `node tools/firecheck/firecheck.js <def> [--exe as64|mowas_2|mowas2|goh] [--game G] [--dist N] [--json]` (the mdl is read beside the def; weapon files through the game's vfs, no mods)
   exit 0 = no silent flag, 1 = at least one FC_ flag (the unit likely never fires), 2 = usage
   which aim bone each weapon class expects, from vanilla: `node tools/firecheck/firecheck.js --census [--game G]`
2. the unit's weapon places and what they refer to: MCP `mow_entity_info` (`names`, `mod` / `mods`); do the weapon and ammo exist: MCP `mow_weapon_find` (`q`, `mod`)
3. references: `node tools/refcheck/refcheck.js <gameDir|-> [--mods a,b] [--folder dir]` or MCP `mow_mod_check` (`mod`, `only: ["refcheck"]`) (unknown weapon / ammo = crash class)
4. range against the target distance: MCP `mow_matchup` (`attacker`, `target`, `range`, `mod`)
5. GUI: Units & Balance tab > Units page (weapon slots of a vehicle), Mods tab > Check & Fix; pages via `gui_pages`
6. the log after a try: MCP `mow_game_log` (`log`, `prev`, `limit`)

## firecheck flags [V unless marked]
| flag | means |
|---|---|
| FC_AIM_BONE | the place's aim bone (`{foresight}` of the place, else the weapon pattern's default) is not a bone of the model: the aimer has no bone, the weapon never fires |
| FC_MG_SWAP | an MG / rifle / smg put on a gun's place: its pattern expects another foresight bone; the place needs its own `{foresight "<gun bone>"}` |
| warnings only | FC_PLACE_AIM, FC_NO_AP (only HE-type ammo for a gun), FC_CREW_VISIBLE, FC_WHEELED_CASEMATE, FC_RANGE (direct `range` only), FC_ENUMERATOR, FC_TRAJECTORY_UNREAD |
- a flag counts only when no other place can aim
- measured hit rate of the flags is low (they catch a minority of silent builds and none of the firing ones): a clean firecheck is NOT proof the unit fires [V]

## Other causes to rule out (shared engine) [V]
- the seat groups named by the place's `gunner` / `charger` are empty: weapon unreachable
- no ammo matching the `filling` tags in the inventory; or the unit names a weapon / ammo that does not exist (LOG-07: `dummy_checker`, crash on use)
- `AimingTolerance` too small or `SpreadTolerance` above the accuracy-by-motion value: it aims and never releases
- place key `StationaryFiring`: fires only when stopped
- target beyond `range` max, or beyond what the turret / gun bones can reach (IK limits of the model → see skill `mow-mod-models-effects`)
- towed guns can not fire while towed [I] GPL-17; some weapons work only in direct control [I] GPL-16
- the AI holding fire or picking no ammo for the target → skill `mow-mod-ai-bots`

## Per game
| game | note |
|---|---|
| as64 | weapon files from base + `as64/core` |
| mowas2 | base only (`--exe mowas_2`) |
| goh | the place key `{AimBone "b"}` is read (second, aimer bone; the shot still leaves from the foresight: GHKEY-05, GHAI-46); no foresight = no shot (GHLOG-03); extra warnings FC_AIMBONE_MISSING, and FC_AIMBONE_AS2 when an AS2 exe is named for a def with `AimBone`. flags were trained on AS2 units only: on GoH they are static rules, not measured [I] |

## Silent fails
- KEY-06 an IK bone with zero speed is an error at load ("Zero speed in ik-bone")
- GPL-15 unknown fire sound: the gun fires silently, only a warning
- KEY-18 `AccuracyByMotion` `by*` above 1 is invalid
- a missing aim bone gives no log line at all: only firecheck or a look at the model's bones finds it

## Verify
- in game: place the unit against a target inside range in the editor or a test match, AI-controlled and by direct control; a unit that fires only by direct control points at the AI side, one that never fires points at bone / seat / ammo; read the log (→ skill `mow-mod-test`)
