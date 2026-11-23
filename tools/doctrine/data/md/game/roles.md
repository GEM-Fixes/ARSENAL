# Roles

Doctrine rules name roles, never unit names, so they work on any mod. A role is read from unit data; anything that can't be classified goes on the mod's review list and is treated as `rifle` or `vehicle_other` until mapped.

| Role | Doctrine branch | Used for |
|---|---|---|
| rifle | infantry | maneuver, holding ground |
| smg | infantry | assault, close terrain |
| mg | mg | base of fire |
| mortar | mortar | indirect support, smoke where the mod has it |
| at_infantry | at | close anti-tank |
| at_gun | at | anti-tank screen, depth |
| tank | tank | shock, support of the assault |
| assault_gun | tank | direct fire support of infantry |
| td | at | anti-tank overwatch |
| recon | recon | finding the enemy, screening |
| engineer | engineer | obstacles, mines |
| artillery | artillery | fire support; stock bots can't call it (AI-11) |
| sniper | infantry | picking targets, recon |

The mapping method is reused from `ai spawn improved for robz 1.30.x\tools\build_unit_meta.py`. Godny's role list in `bot.units.lua` is reference only.
