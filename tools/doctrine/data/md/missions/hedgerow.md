# Hedgerow fields, Normandy 1944

**Teaches:** Tanks and infantry clear one field at a time, each covering the other.

**Map needs:** small fields, hedges, sunken lanes. **Win:** Attacker takes three field flags in turn before time runs out.

## Sides
**Attacker:** US rifle battalion, 1944, company shape, fidelity 0.6. Methodical; strong with support weapons, slow without them.
  - Lead with fire: mortars and MGs on the objective before any rifle squad moves.
  - Put the main line on the reverse slope when the forward slope is under observed fire.
  - Counter infiltration with posts that hold alone and a reserve that strikes hard.
**Defender:** German battle group, 1944 (reported doctrine), platoon shape, fidelity 0.7. Aggressive counterattacks; dangerous to push into. German doctrine here is reported by other nations.
  - Counterattack a lost position at once, close behind the fire, at the flank of the break-in.
  - Build strongpoints round MGs, heavy mortars and an SP gun, firing all round.
  - One narrow main effort with the heavy weapons massed behind it.

## Doctrine
- **Tank company attack, with infantry:** Envelop as the rule: support elements fire from the front while the company moves under cover to a flank or rear. Attack frontally only when forced. Against a fortified position or tank obstacles the infantry goes first. Leading platoons assault together, about 300 yards or less out, once anti-tank weapons are gone.
- **Company attack:** Don't advance evenly. Push part of the company through the best-covered ground into a weak spot while the rest press and split the enemy's effort. Usually two platoons lead and one is held back. An interior company's zone is 200 to 500 yards, at most what its leaders can control.

## What a good bot does
- **Tanks envelop; infantry first if obstacles** (tac.tank-infantry)
  - Default: support fires frontally, tanks go under cover to a flank.
  - Known AT obstacles or fortifications: infantry first, tanks fire from behind.
  - When tanks lead, infantry follows at once, in small groups clear of the tanks.
  - Assault only once AT weapons are gone; all together.
  - Stalled: fall back to a rally point and retry.
- **Something fires while something moves** (tac.fire-and-move)
  - Split: base of fire pins, maneuver moves. They may swap.
  - Site the base to fire obliquely, about 0.6 to 0.8 x mg from the objective (design).
  - Maneuver goes by a covered route that isn't the obvious one, never a wide loop in the open.
  - Keep on the first post; detach the least possible to answer flank fire.
- **Assault guns at the main effort, tank destroyers kept out of close combat** (tac.assault-gun)
  - Assault guns go with the infantry of the main effort, firing HE on the points that hold it up.
  - Tank destroyers wait in overwatch for tanks, away from close enemy infantry, with their own infantry or MG cover.
  - Either can fire on bunkers once enemy AT is suppressed.

Figure: 4-layers/svg/f-tank-attack.svg
