# Ladder: any game size

One rule: each bot plays the echelon its force supports, and the team plays one echelon above. All thresholds are starting values, `param_source: design`, unvalidated.

| Squads per bot | Bot plays as | Shape |
|---|---|---|
| up to about 6 | reinforced platoon | base of fire + 1 maneuver element |
| about 7 to 15 | company | support group, 2 maneuver groups, small reserve |
| about 16 to 28 | small battalion | company-size groups, support group, reserve |
| team of bots | one level up | one main effort across bots; the others hold or fix |

## How a decision moves down
| Level | Decides | Hands down |
|---|---|---|
| Team | where the main effort goes | axis and priority for each bot |
| Bot | how its force is split | a task for each group |
| Group | how to reach the task | bounds, positions, targets |
| Unit | reflexes | left to the engine and the mod |

Force grows during a match, so the shape is rechecked when squads on hand cross a threshold. A rise changes the shape at the next phase change, not mid-assault.
