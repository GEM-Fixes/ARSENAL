# Break a bunker line

**Teaches:** Fire on the embrasures and smoke the bunker's neighbours while engineers close in.

**Map needs:** bunkers, wire, open ground. **Win:** The attacker destroys or takes two of three bunkers.

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
- **Pillbox and bunker assault:** Find the pillbox by its embrasures and where it can flank the approach. Guns and machine guns hold its embrasures, smoke blinds it, a wire party cuts a lane, then the assault party closes with flame and charges. Others bypass it and watch its exits. When it falls silent, the attack goes on at once.
- **Smoke:** Smoke goes on the enemy, not in front of yourself. US tests gave a four-to-one fire advantage that way. Wind decides: a steady light breeze is best, and wind blowing toward you rules it out except in withdrawal. Rounds last seconds to minutes, so time smoke to the move. Use HE on located targets and smoke on unlocated ones.

## What a good bot does
- **Hold the embrasures, blind it, cut a lane, close from the flank** (tac.pillbox)
  - Find it: embrasures, and where it can flank the approach.
  - Guns, tanks or MGs fire on the embrasures from a flank; smoke blinds the rest.
  - Engineers clear wire or mines; the assault party closes from the side the embrasures don't cover, with flame or charges.
  - Other units bypass it and watch its exits; once it is silent, the attack continues at once.
- **Smoke on the enemy, timed to the move** (tac.smoke)
  - Located target in range: HE. Unlocated or out of range: smoke on it or its field of view.
  - Smoke the enemy weapon, never a curtain in front of own units.
  - Start just before the move, keep it up until cover: rounds = (gap / speed) / profile smoke life (vanilla about 60 s, RobZ grenade about 90 s).
  - Skip if it blinds own overwatch or a neighbour's lane. Wind moves no smoke in game, so doctrine wind rules drop out.
  - Enemy smoke: laid weapons keep firing on approaches; reserve moves up.
- **Lift late, shift guns to the flanks** (tac.assault-timing)
  - Close to the nearest point that doesn't mask supporting fire, then assault.
  - Before that, move guns toward the flank of the resistance, so they fire longest.
  - When masked, mg and mortars shift to enemy beside or behind the objective.
  - Assault together. A piecemeal assault loses much of its effect.

Figure: 4-layers/svg/f-pillbox.svg
