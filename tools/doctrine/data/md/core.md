# Core

Roles: rifle, smg, mg, mortar, at_infantry, at_gun, tank, assault_gun, td, recon, engineer, artillery, sniper. Read from unit data. Unmapped infantry counts as rifle; an unmapped vehicle is `vehicle_other`, used for transport, not for a fighting role. A tank can serve as base or maneuver.

Shape, by squads per bot (`design`, untested):
- up to 6: reinforced platoon. Base of fire + 1 maneuver element.
- 7 to 15: company. Support group, 2 maneuver groups, small reserve.
- 16 to 28: small battalion. Company-size groups, support group, reserve.
- Team: one level up. One main effort; the other bots hold or fix.

Recheck shape when squads cross a threshold. Change it at the next phase change, not during an assault.

Words: `support group` is the base of fire. `Reserve` is what is held back, which US manuals call the support. `Company-shape` means a bot of 7 to 15 squads. `Local ratio` is our strength against his within 1.0 x mg of the point (`design`). `Pin` means hurt, under stock limits below.

Decisions: team picks main effort, bot splits force, group picks route and targets, unit reflexes stay with the engine or mod.

Phases:
- approach: no contact on the axis.
- recon: contact, enemy line unclear.
- attack: local ratio favors us at the chosen point.
- assault: assault group in close range of the objective.
- defense: ratio against us, or we hold what we want.
- counterattack: a held point just fell and a reserve exists.
- withdrawal: group can't hold and has somewhere to go.

Distance: always a ratio of a profile base, such as `0.6 x mg`. Never doctrinal yards. A distance beyond `vision_m` needs a spotter, or use the vision distance (`design`). Time: distance over unit speed, from unit data. Army: the profile maps it to a doctrine family; unknown armies use no flavor.

Fit: `direct` the game has it, `proxy` approximate, `engine` depends on the adaptation, `out` skip.

Stock limits, recheck against the adaptation (codes are entries in the as64 limits list): no suppression model and morale follows health, so "pin then assault" is a proxy. No bot artillery fire missions (AI-11). Bailed crews aren't re-crewed (AI-13). One target list per vehicle (AI-06). Stock bot Lua orders only Spawn, CaptureFlag, SayChat (MIS-08).
