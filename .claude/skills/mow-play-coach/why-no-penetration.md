# mow-play-coach: why did the shot bounce or not go through
When: "my shot bounced", "no penetration", "it went red but lived", after a match.

## Steps
1. Which gun, shell, range, which face: ask, then `mow_matchup {game, attacker, target, range, ammo, mod}`.
2. Match what they saw to a row below; read the row: `mow_limit {ids: ["DMG-09"]}`.
3. Say the cause in one sentence and what to do next time (closer, other shell, other face).
CLI: `node tools/armorsim/armorsim.js shot ...` (as in `can-x-kill-y.md`) · rows. GUI: Models & Sim > Models > Armour.

## What they saw -> rule -> row (AS2 + AS64)
| saw | rule | row |
|---|---|---|
| shell stopped at long range | no penetration past the table end (range + 5 m); values between points are a straight line | GPL-03 DMG-02 [V] |
| wrong shell table used | a shell picks its table by exact tag; `apc` is not `apcbc`; no match = the gun's plain values | DMG-01 [V] |
| angled plate | effective thickness grows with slant, capped at 10 times | DMG-03 [V] |
| big shell, thin plate | overmatch cuts the slope bonus down to 20% at most | |
| side looked hit, front counted | side is baked per model face | DMG-05 [V] |
| shell bounced twice then vanished | max 2 ricochets, only after a failed penetration; fragment and no-ricochet shells never | DMG-09 [V] |
| plate value in the unit file ignored | a class armour value overrides per-plate thickness on that side | DMG-06 GPL-04 [V] |
| upper and lower front differ | one part is several plates | DMG-25 [V] |
| tank went red but was repaired | red hull is a poor kill mark; crew out is the mark | DMG-27 [V] TST-44 |
| light car survived an AP hit | small AP often stops at a fuel hit, car lives | TST-110 [V logs] |
| point blank reads odd | damage at a close stand uses the first table point | DMG-28 [V] |
| hull or turret did not "break" from AP | AP almost never breaks an area in vanilla; blast does | DMG-07 GPL-05 [V] |

No dice roll before the penetration test: a bounce is always a failed penetration first. DMG-09 [V]

## Per game
- MoW:AS2: same rows.
- GoH: a penetrating shot takes (penetration - effective thickness) off the part's hit points, so a tank can take several penetrations. GHDMG-04 GHDMG-05 GHDMG-25. Effective thickness also uses plate flaws, cast steel and hardness. GHDMG-37. See `goh-damage-repair.md`.

## What goes wrong
- single-player difficulty scales armour per side (`set/difficulty/*.dl`); multiplayer factor is 1. [I order]. A campaign result does not carry to multiplayer.
- a mod changed the table: the tool shows it when `mod` is passed.

## Check
Same shot in direct control at the same range: the reticle number against the armour shown on the target.
