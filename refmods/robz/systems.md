# RobZ 1.31.0 systems: what bringing a vanilla unit into them takes

Session RZ-SYS-1 (w72), 2026-11-07. Static analysis only; no game run. Mod = `robz 1.31.0` (newest). Vanilla = `F:/as64-3/resource` through tools/lib/pakset. Numbers come from scratch scripts (`../run/sessions/w72/RZ-SYS-1/`: gunstat.js, ptab.js, dampts.js, ammotags.js, diff.js). Tags: [V] read or measured, [I] inferred, [T] needs an in-game test. Behaviour on as64 is [T] throughout.

User ask: update vanilla units to the RobZ systems: property changes, parameter scaling, meshing into the interaction damage system, and everything else that varies.

## Headline

1. CORRECTED in RZ-SYS-2: the unit defs are NOT mostly the same as vanilla. pz4h matches, but the diffs of is1, pak40 and gaz67b show per-unit retuning in the def (see section 10) [V]. Most behaviour change still lives in shared files: `properties/*.ext` macros, `set/interaction_entity/*.inc` scripts, `set/stuff/gun/*` presets, `set/stuff/shell/*.ammo` tags. A unit "joins" by (a) naming the right class props, (b) its gun stuff using the right damage macro, (c) its ammo stuff carrying a tier tag. [V]
2. Damage to tanks is a tier table (shell tier x target class -> probabilities) plus a cumulative damage-point counter. Penetration is gun stuff data.
3. The rule-reducible part is small: class props, ammo tier tag, gun damage macro and rough scaling. Per-unit realism numbers (armour thickness, reload, ranges per gun) are data, not rules.

## 1. Damage system: tank class scripts (`set/interaction_entity/tank/tank_*.inc`)

Vanilla has 12-13 `staff()` tiers per class file; the mod has 25-29. [V ptab.js]

Tier names added by the mod: shell_small_no_filler, shell_small_apcr, shell_medium_no_filler, shell_medium_apcr, heat_small, heat_medium, heat_big, shell_big_apcr, cumulative_tiny, cumulative_small, cumulative_big, shell_maximum fg, shell_verybig fg, shell_big fg; light/medium/heavy also add highvel_small/medium/big/verybig. [V]

Probabilities for tier `shell_medium` (vanilla -> mod). Keys are `pierce_*` hit effects. Unchanged keys omitted unless useful.

| key | class | vanilla | mod | rule | units seen | tag |
|---|---|---|---|---|---|---|
| pierce_body__body_brake | armoredcar / light / medium / heavy | 0.4 / 0.5 / 0.2 / 0.2 | 0.4 / 0.15 / 0.1 / 0.05 | per-class table | class files | V |
| pierce_body__body_destroy | same | 1 / 1 / 0.4 / 0.3 | 0.5 / 0.15 / 0.1 / 0.05 | per-class table | same | V |
| pierce_turret_*__turret_brake | same | 0.9 / 0.8 / 0.7 / 0.6 | 0.9 / 0.3 / 0.2 / 0.15 | per-class table | same | V |
| pierce_turret_front__gun_brake | same | 0.9 / 0.8 / 0.7 / 0.6 | 0.9 / 0.3 / 0.23 / 0.2 | per-class table | same | V |
| pierce_mantlet__gun_brake | same | 0.9 / 0.8 / 0.7 / 0.6 | 0.9 / 0.35 / 0.28 / 0.23 | per-class table | same | V |
| crew_shock_time | same | 8 / 8 / 5 / 5 | 8 / 10 / 10 / 10 | per-class table | same | V |
| pierce_crew_bail (new) | same | - | 0 / 0.7 / 0.6 / 0.45 | added key | same | V |
| pierce_internal_damage (new) | same | - | 0.7 / 0.6 / 0.5 / 0.4 | added key | same | V |
| pierce_transmission_break, turret_drive_break (new) | same | - | 0 / 0.65 / 0.6 / 0.55 | added key | same | V |
| pierce_gun_drive_break, gun_breech (new) | same | - | 0 / 0.6 / 0.5 / 0.45 | added key | same | V |
| pierce_turret__tear (new) | same | - | 0.3 / 0.05 / 0 / 0 | added key | same | V |
| pierce_turret__turret_destroy (new) | same | - | 0.5 / 0.15 / 0.1 / 0.1 | added key | same | V |
| pierce_mantlet__gun_destroy / turret__gun_destroy (new) | same | - | 0.6,0.4 / 0.25,0.2 / 0.2,0.15 / 0.1,0.08 | added key | same | V |
| pierce_engine__fuel_leak (new) | same | - | 0.9 / 0.8 / 0.7 / 0.5 | added key | same | V |
| pierce_body__ammo_fire / turret__ammo_fire (new) | same | - | 0.2,0.1 / 0.13,0.1 / 0.13,0.1 / 0.13,0.1 | added key | same | V |
| shell_shatter (new) | all | - | 0.075 | constant | same | V |
| kill_* (crew), engine_brake, engine_burn, track keys, pierce_gun | all | - | unchanged | none | same | V |

Only the `shell_medium` tier was tabulated. Other tiers were not diffed, so the per-tier numbers are [I].

### Cumulative damage points (`safeties/penetration_safety.inc`) [V dampts.js]
Each tier calls `<N>_dam_add`; counter knocks out at 11 points (from `damage_counter.inc`, read earlier [V]).

| tier | points | tier | points |
|---|---|---|---|
| bullet | 1 | shell_big | 7 |
| ptr, 20mm | 2 | heat_medium | 6 |
| shell_minimum, shell_small_no_filler, shell_small_apcr, shell_medium_apcr | 3 | shell_verybig | 9 |
| shell_small, shell_medium_no_filler, heat_small, shell_big_apcr | 4 | heat_big | 8 |
| shell_medium | 5 | shell_maximum | 10 |
| cumulative_tiny / small / charge / (plain) / big | 2 / 4 / 6 / 6 / 8 | | |

All tiers apply to volumes body, turret, engine. Whether vanilla has the counter at all was not diffed -> [I] it is mod-added.

## 2. How a unit joins the damage system (exact lines)

Read on pz4h (medium tank) [V]:
- Def: `{props "medium"}` style class name plus `properties/tank_*.ext` ext include (CORRECTED: pz4h includes `tank.ext`, not the unarmed family [V]). The `.inc` script blocks are keyed by prop name (`{"tank"`, `{"medium tank"`, `{"armored_car"`, `{"turret"`). `set/interaction_entity/tank.inc` dispatches to `tank/tank_{armoredcar,light,medium,heavy}.inc`.
- Components/volumes (`body`, `turret`, `engine`, plus crew slots) come from the `armor_*` macros in `properties/*.ext`; the mod redefines the macros, so def armour args stay identical. [V]
- Which tier fires: the shell's stuff `.ammo` file carries tags (`shell_medium`, `heat_small`, `highvel_big`...) and the script matches `stuff "<tag>"`. A shell with no tier tag falls through to nothing [I].
- Safeties read: `penetration_safety.inc`, `combat_capable_check.inc`, `damage_counter.inc`. [V]

Settled in RZ-SYS-2 (tank.inc read): `{props "medium"}` alone does not set medium_tank. The script blocks are keyed by a prop set, and the block `"medium tank"` fires when the unit has both props `medium` and `tank` (the latter from the ext include), which then sets the flag. [V file; multi-word match rule is [I]; behaviour [T]]
car.inc, cannon.inc, human.inc read: car and armored_car have their own blocks; cannon.inc has per-calibre `*_weapons` blocks (a cannon needs the one matching its calibre); human.inc has one block, and the infantry def diff is identical to vanilla. [V]
muzzle.inc is muzzle/effect blocks only (flash, smoke, dust). It does not touch damage, so it does NOT explain is1, is2, is122, kv1s and su76 doing no damage. [V file; conclusion I]

## 3. Ammo (stuff `.ammo`, shell entity, inventory def)

- 21 shell `.ammo` files exist in both; 18 identical in tags, 3 differ: bullet203, bullet290 get tag `fg`; bullet37.zenite gets `shell`. [V]
- The mod adds many per-nation ammo names (e.g. `bullet75 ger apcbc`) with their own `.ammo` and entity; inventory def (`shell_ap_75kwk40`) vs vanilla `shell_ap_75`. [V]
- Pattern -> tier tag, from mod-only `.ammo` (counts from ammotags.js) [V counts, rule is [I]]:

| from pattern | tier tag (count) |
|---|---|
| ap | shell_minimum 9, shell_medium_no_filler 4, shell_medium 4, shell_small_no_filler 2, shell_big 2 |
| apcbc | shell_medium 6, highvel_medium + shell_big 4, shell_medium_no_filler 3, shell_minimum 2 |
| aphe / aphe2 / aphebc | mostly shell_medium; big ones highvel_* + shell_big; some shell_minimum, shell_maximum |
| apcr / apds | shell_medium_apcr 8, shell_big_apcr 5, shell_small_apcr 4, shell_minimum 3 |
| heat | heat_small 18, heat_medium 10, heat_big 2 |
| fg (HE) | shell_maximum 11, shell_big 7, shell_verybig 5, no tier 59 |
| wp | shell_big 2, shell_maximum 2, none 5 |

The tier follows calibre/nation and is not a function of pattern alone. A tool needs a calibre -> tier table [I]: not derived here.

## 4. Gun stuff (`set/stuff/gun/*`) [V gunstat.js, 91 guns common]

| key | vanilla | mod | ratio (mod/van): min / med / max | rule | tag |
|---|---|---|---|---|---|
| range | per gun | per gun | 1.14 / 1.43 / 2.0 (n=7 only) | per-gun data; scaling about x1.4 | V (small n) |
| rechargeTime | per gun | per gun | 0.67 / 1.42 / 2.34 (n=53) | per-gun; typical x1.4 slower | V |
| speed (raw) | per gun | per gun | 0.43 / 1.0 / 2.1 | raw unchanged for the median | V |
| speed effective | vanilla x0.5 | mod x1.0 | med 2.0 (n=51) | the macro that applied x0.5 in vanilla is gone; effective shell speed about doubles | V ratio, mechanism I |
| projectileDamage | | | 0.43 / 1.0 / 1.6 | per gun | V |
| damage a..e (5 range bands) | vanilla table | mod table | med 1.06-1.14, p25 0.92-1.0, p75 1.13-1.27, range 0.35-2.4 | per-gun table; not a constant | V |
| damage macro | `damage` | `damage_170` 29, `damage_100` 6, `damage_215` 2 (+13 gun files that had none now use `damage_215`, 3 `damage_170`) | | macro choice follows calibre class | V counts, rule I |

Examples (damage a-e): 152mm_m10t 110,105,97,92,80 -> 125,117,109,101,89 (`damage_170`); 20mm_kwk30 57,23,18,12,8 -> 46,33,23,15,11 (`damage_100`); 28mm_spzb41 57,23,18,12,8 -> 92,56,34,21,13; 37mm_hori unchanged. [V] 34 files have no vanilla damage line at all in the parse, so no ratio. Guns vary wildly (e.g. 20mm_tns x0.5 at a, 28mm_spzb41 x1.6), so these are **per-unit data**, with a possible fallback of "median x1.1 on the table, damage macro by calibre". [I]

## 5. Infantry / human properties (`properties/human.ext`) [V diff]

| key | vanilla | mod | rule |
|---|---|---|---|
| health regen inc | 1.0 | 0.25 | x0.25 |
| stamina current | 100 | 50 | x0.5 |
| stamina stay/walk/slow/normal/fast rows | +15 +10 +9 +5 / +10 +5 0 -10 / same / +2.5 +1 0 -20 / -5 -10 -20 -40 | +5 +4 +3 +1 / +3.5 +2.5 +1.5 -10 / same / +1.5 +1 +0.5 -20 / -0.5 -2.5 -5 -40 | table |
| load (equipment kg) | 0 20 40 100 | 0 10 30 75 | table |
| pierceAbsorb (two parts) | 30, 32 | 70, 75 | table |
| RecognizeTime | 0.25 | 0.01 | constant |
| InformRange | 40 40 | 120 120 | x3 |
| move speed rows (Slow/Normal/Fast) | 4 5 100 / 5 5 200 / 7 5 200 | 3 5 50 / 4 5 100 / 5 5 100 | table, about x0.6-0.75 and halved accel |
| Sneak/Spot/Walk/Slow/Normal/Fast/Bow | 5/6/8/8/15/25/18.5 (x 200/400) | 5.5/6.5/7/7/11.5/18.5/14.5 (x 100/200) | table |
| thickness | 2, 1.5, 2.5, 2.5 | 4, 3, 2, 2 | table |
| bomb detect/danger/fight distance | 7,5,3,4,6 / 1.5 | 10,7,5,7,10 / 5 | table |
| Properties block: advance_ratio, no_retreat, move_radius, look_around, control | absent | added | added block |
| accuracy by linear/angular, order_time | 0.75, 0.80, 0.50 | 0.60, 0.70, 1.00 | table |

All of this is in shared `human.ext`, so any vanilla infantry unit that includes it gets it for free. [V file, I inclusion]. `human_part.ext` also changes (not tabulated). 909 breed files in `set/breed/mp/<army>/` (mod only) were not read: per-unit data. Weapon (`entity/weapon`) and inventory item diffs were **not** done.

## 6. Not reducible to a rule (needs per-unit data)

- Per-gun range, reload, damage a..e table, shell speed: ratios scatter 0.35-2.4 [V].
- Armour thickness per plate (def args): not diffed beyond pz4h; the mod authors set them from references [I].
- Ammo tier tag per shell: calibre/nation/pattern-dependent.
- Per-unit crew numbers, cards, multiplayer unit entries (`set/multiplayer/units`), breed files (909): not read.
- Heavy tanks is1, is2, is122, kv1s and su76 did no damage on as64 while kv85, kv1_40 and fury did (findings.md). Likely cause not found; `muzzle.inc` is ruled out (section 2). New lead [T]: the failing units' ammo use the `aphebc` pattern, the working ones do not; and `set/stuff/gun/.presets` differs (vanilla-only `damage2`/`accuracy_curve_1` macros, speed macro x1.0 in the mod, `damage_*` only in the mod).

## 7. Rule list for a vanilla unit not in the mod (proposal, all [I]/[T])

1. Keep the unit def; set `{props}` to the class (armoredcar/light/medium/heavy) matching its armour/weight so the class script dispatches.
2. Give each gun stuff the damage macro by calibre (`damage_100` <=~28mm, `damage_170` ~37-100mm, `damage_215` large; verify against the 91 guns), and scale the a..e table by about x1.1 (median), range about x1.4, recharge about x1.4.
3. Drop the vanilla x0.5 shell-speed macro (effective speed about x2).
4. Give each ammo `.ammo` a tier tag from a calibre/pattern table (section 3); heat -> heat_small/medium/big, fg -> shell_big..maximum, apcr -> *_apcr, high-velocity long guns also get highvel_*.
5. Ensure the mod's `tank_*.inc`, safeties and `.ext` macros ship with the unit (copy from the mod into a derived mod, as a tool dependency).
6. Infantry: nothing per-unit beyond including `human.ext`; verify the breed file is not required.
7. Emit a report listing which of the unit's guns and shells had no table row.

## 8. Five proving units (in game, later)

Kill test: each unit's shell must hurt a target of the same class or above in the same game; compare to the neighbouring mod unit.

| vanilla unit (candidate) | class | target to kill |
|---|---|---|
| a vanilla light tank with a 37-45mm gun not in the mod | light | mod light and medium tank |
| a vanilla medium tank with a 75mm gun | medium | mod medium tank (e.g. pz4h) |
| a vanilla heavy tank (is2 or kv1s is out, they fail already) | heavy | mod medium, then heavy |
| a vanilla armoured car with a 20-28mm gun | armoredcar | mod armoured car, light |
| a vanilla AT gun (57-76mm) | gun | mod medium tank |

Chosen in RZ-SYS-2 (all absent from the mod, from idx.json) [V]:

| row | unit | note |
|---|---|---|
| light | zsu37 | tank_light |
| medium | bishop | stand-in: 88mm gun, FG ammo; no vanilla 75mm medium tank is absent from the mod |
| heavy | centurion | tank_heavy |
| armoredcar | sdkfz232 | btr folder |
| AT gun | m5 | cannon folder (lg_40 is a spare cannon) |

## 9. Not checked

Cards, breeds, weapon entities, non-`shell_medium` tiers, the other tank classes' defs. Nothing here was run in game.

## 10. RZ-SYS-2 findings and the tool

- Def diffs (one car gaz67b, one gun pak40, one tank is1): the mod retunes defs per unit (armour, ranges, props), so a rule list cannot reproduce them; they stay vanilla and are listed as gaps by the tool. Infantry def: identical. [V]
- `tools/rzsys/rzsys.js` applies section 7 (R1 class props and donor block, R1b muzzle block, R2 gun stuff, R3 gun-chain walk, R4 ammo tier tag, R5 shared files, R6 infantry, R7 report). It reads the mod tables at run time and holds no mod data. Tool test: 43 checks on made-up fixtures. Outputs for the five units were checked with `as2 check`: verdict LOADS_STATIC, with 1-2 crash-severity findings from sdllint and keylint on the bare output folder (cause not found, see the report). Behaviour in game is [T].
