# Pursue a withdrawing enemy

**Teaches:** Push a fast group past the rearguard. The withdrawal is always ordered, not left to auto-move.

**Map needs:** open country, crossroads, a delay line. **Win:** The defender gets half its force past the crossroads flag.

## Sides
**Attacker:** What-if: modern ideas on a WW2 force, company shape, fidelity 0. Not period play: re-plans on events, commits the reserve behind success. For comparison against period personas.
**Defender:** German battle group, 1944 (reported doctrine), company shape, fidelity 0.7. Aggressive counterattacks; dangerous to push into. German doctrine here is reported by other nations.
  - Counterattack a lost position at once, close behind the fire, at the flank of the break-in.
  - Build strongpoints round MGs, heavy mortars and an SP gun, firing all round.
  - One narrow main effort with the heavy weapons massed behind it.

## Doctrine
- **Pursuit:** When the enemy breaks, pursue at once without waiting for neighbours. Press on a broad front against his flanks, take the shortest routes to cut his retreat, and push guns and machine guns forward so he cannot re-form. Bypass obstacles and cut off rearguards. Only a senior commander halts it.
- **Delay and withdrawal:** Leave before rifle fire pins you and before the enemy can assault. By day each echelon covers the last in turn. On a delaying position a company holds twice its normal frontage and opens at extreme range, 800 to 1,200 yards, to force deployment, then goes.

## What a good bot does
- **Pursue at once, broad and fast, to a set limit** (tac.pursuit)
  - Go at once with the nearest fast units; don't wait for neighbours.
  - Press on a broad front against his flanks; send groups by the shortest routes to cut his retreat.
  - Bring MGs, mortars and guns forward so he can't re-form.
  - Bypass strongpoints and rearguards; stop at a set limit (his next prepared line or own support range) and consolidate.
- **Leave early, covering in turn** (tac.withdrawal)
  - Go before the enemy is within 0.5 x rifle or rifle fire is hurting you.
  - One part covers while the rest moves, then swap. Last out has a covered route.
  - Delay: spread wide, fire from maximum range, then go when he deploys.
  - Successive lines no farther apart than 1.0 x mg, so each covers the last.
  - The withdrawal is an order in both mods. Auto-move only: vanilla idle soldiers may also fall back alone, so expect leaks; RobZ idle soldiers never do (no_retreat).

Figure: 4-layers/svg/f-pursuit.svg
