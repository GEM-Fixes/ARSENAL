# robz 1.31.0 systems: what game tests showed (RZ-SYS-3)
Played through `robz130_as64` (as64 copy of 1.30.10; game data paks same sha1 as robz 1.31.0 [V]), so facts apply to robz 1.31.0 [I]. robz 1.31.0's own mod.info is Classic (3.262): as64+ refuses it and crashes before fonts load [V log]. Details and rows:

## Targeting
- `set/target/tank_bullet.inc` differs from vanilla. Vanilla: sort, selects anything. Mod: close-range groups, then human, cannon, car; no tank class [V].
- A unit on it with a gun stays silent at tanks and armoured cars and kills cannons [V measured: vanilla zsu37 def, 9 rows at 150-600]. Explicit `actor_fire` at the tank did not help [V]; the selector filtering the order is [I].
- `{targetSelector "tank"}` fixes it: same unit kills t70 in 2.4 s, sdkfz222 3.7 s [V, one run each].
- In the mod's own data, tank_bullet is on pz1, pz1b and a few transports and tractors [V]. Mod's small-gun peers use `tank`, `tank_aa`, `flak`, `cannon_aa` [V].

## Knockout
- `combat_capable_check.inc` "cumulative_damage_knockout" = `{tags add "destroyed"}` + `{crew_emit}`; no body part need break [V].
- So `destroyed_components:body` misses kills: control pz6bh>t34_0 read NOKILL under it in one game. `not inhabited` works on all rows [V measured].
- An emptied tank stops being a target, so the shooter stops firing [I].
- The counter in `safeties/penetration_safety.inc` adds points by `{if stuff "<tier>"}` and volume, knocks out at 11 [V].

## Class script numbers read per tier (not traced in play) [V]
| Script | Tier | bail | body_destroy | driver |
|---|---|---|---|---|
| tank_light | shell_minimum | .50 | 0 | 1.0 |
| tank_light | 20mm | .10 | - | .10 |
| tank_medium | shell_medium_no_filler | .55 | .05 | .9 |
| tank_medium | shell_medium | .60 | .10 | 1.0 |
| tank_medium | shell_medium_apcr | .30 | 0 | - |
| tank_medium | shell_big | .75 | .15 | - |
| tank_heavy | shell_medium_no_filler | .45 | 0 | - |
| tank_heavy | shell_medium | .45 | .05 | - |
| tank_armoredcar | 20mm | 0 | .20 | .20 |
| tank_armoredcar | shell_minimum | 0 | .25 | 1.0 |

tank_armoredcar has no `on blast` block; the other three do [V]. No log line names the branch that ran, so branch claims in play stay [I].

## Blast heads on foes (`dbg_blast 1`) [V measured]
- 1/3-5 and 1/4-6: first head on AP hits; 1.2/1.2-2.4 often follows. Rounds with filler log more; pure AP may log none, so hits are a floor.
- 3/3-8, 10/2.5-10 (15, 5, 3 by unit), 2/15-25: every blown foe; ammo rack [I].
- HE from an M7 or bishop: 6.9-7.5/0.8-1, 3.6/2.5-3, 1.5/8-12, 0.1/14-15, 3-3.5/4-5.

## Reload
- FindAmmo: first the loaded round's exact tags in the inventory, then the gun row's filling tags [V]. `filled` loads by row tags.
- Mod rows name a nation (`bullet76 us`, `bullet37 rus zenite`); vanilla boxes do not. So a vanilla unit on `filled` may fire its first load and not reload [I]; no game showed it. First round is then the nation round [I]: m5 `filled` killed pz4h front at 600 in 1.7 s, m5 on box `bullet76 ap` missed 2 rows.

## Test practice
- Fire needed a set dist: default 213-363 was silent for pz6bh too, 400-600 fires. Cause unknown [T].
- preflight false OUTOFRANGE at dist 300 vs RobZ range 230: use `noRangeCheck` [V].
- HE breaks foe tracks before the "moveable" term: use `foeClass:gun` on those rows, or no order is ever given [V].
- Casemate bishop in the front layout: shots 0; shooter faces +x and can't traverse [I]. Rear layout fires.
- Gun damage in the mod: 76mm_m5 ap a155..e74 range 200, apcbc a122..e91; 37mm_61-k a60 b42 c33 d24 e16 range 170, recharge 3.5 [V].

## Not shown
Six runs per pair (1 to 3 here). Shot counts: blank or null for most muzzle props. Which script branch ran. zsu37 `filled` + `tank` unplayed.
