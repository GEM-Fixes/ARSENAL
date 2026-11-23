# Worked examples, on paper

Nothing here has been played. Each example applies the cards to a profile, to test that the translation holds together. Metres below are worked from the profile medians and move with the mod, so they aren't parameters.

| Term | Formula | Vanilla | RobZ | Source |
|---|---|---|---|---|
| Attack width W, company shape | 1.0 x mg | 100 | 150 | base design |
| Defense width | 2 x W | 200 | 300 | ratio claim |
| Delay width | 4 x W | 400 | 600 | ratio claim |
| Base of fire stands | 0.6 to 0.8 x mg | 60-80 | 90-120 | design |
| AT guns hold fire to | 0.6 x gun_medium | 72 | 114 | design |
| Assault starts | 0.5 x rifle | 35 | 38 | design |
| Lines at most | 1.0 x mg | 100 | 150 | claim, Soviet |
| Vision radius, raw | profile `vision_m` | 70 | 110 | game data |
| Human vision against humans | radius x scale x rule | 52 | 124 | derived from game data |

## 1v1, vanilla, 5 squads, attack a village
1. **Shape** (force.shape-by-size): reinforced platoon, one base of fire and one maneuver element.
2. **Buy** (force.combined-arms-minimum): MG first, rifles, light AT.
3. **Axis** (tac.main-effort): the best-covered way in, scored on the map. With one bot there is one axis.
4. **Width** (tac.frontage): half of W, about 50, since it's a platoon rather than a company (design).
5. **Attack** (tac.fire-and-move, tac.assault-timing): the MG sets up obliquely at 60 to 80, rifles go by cover, assault from about 35, and the MG shifts to the flank when masked.
6. **After** (tac.consolidate): past the objective, MG forward, into cover.

**Problem found:** vanilla's base of fire stands beyond human vision (52 m). The group needs a spotter forward, or the base must come closer. Listed in test notes.

## 4v4, RobZ, 12 squads per bot, attack along a ridge
1. **Shape:** each bot plays a company. The team plays one level up.
2. **Team** (tac.main-effort): one pair of bots is the main effort on the best-covered axis. The other pair fixes along the ridge: each holds its flags, keeps fire on the enemy facing it, and pushes only far enough to stop that enemy shifting to the main axis. It doesn't try to break through.
3. **Each bot:** support group, two maneuver groups, a small support held back. Width about 150 each.
4. **Fire:** base at 90 to 120. Human vision of 124 lets it see for itself, unlike vanilla.
5. **Armor seen** (force.counter-buy, tac.at-screen): mass AT if strength is unknown. Guns hold to about 114, but RobZ recognition (0.01 s) makes surprise weak, so test that ratio.
6. **Stall** (tac.reserve): commit the support whole at a flank, then rebuild it.
7. **Falling back** (tac.withdrawal): `no_retreat 1` only affects auto-move: idle soldiers won't leave alone. The bot's withdraw order works as usual, and it has to come before the group is pinned.

## 8v8, unknown mod, 6 squads per bot, defend
1. **Profile first:** extract ranges and vision. Unmapped armies use the universal core and roles come from unit data. Until extracted, every distance below stays as a ratio.
2. **Shape:** platoon per bot. Eight bots form a team-level plan.
3. **Team:** forward bots on the approaches and two bots back as the reserve (tac.defense-layout, tac.reserve). Eight narrow fronts leave gaps, so cover the gaps with fire instead of thinning groups (tac.frontage).
4. **Each bot:** two parts forward, one back. Depth 0.5 to 1.0 x rifle. Rifles hold to effective range.
5. **Lost point** (tac.counterattack): the nearest back group goes at once into the flank, fire across the base, stop at the old line.

**Problem found:** nearly all bots at platoon shape means team-level reserve matters more than bot-level reserve. The ladder says so, but the threshold where this flips is untested.

## What the examples show
- The formulas produce usable numbers on both profiles with no doctrine yards.
- Vanilla's vision is shorter than the base-of-fire standoff, the first conflict between a doctrine ratio and game data.
- RobZ's `rifle` p10 of 4 m is a misclassified weapon in the extraction, so use medians. Worth cleaning in the profile build.
