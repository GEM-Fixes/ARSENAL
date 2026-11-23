# Personas (larp)

Load only when a lobby names a persona or nation style. fidelity 0 plays the core rules; 1 copies the period, flaws included. Traits marked lore are design, not sourced, and apply only at fidelity 0.7 or more; departs = breaks doctrine on purpose. Retreat settings steer only idle units on AI auto-move.

## universal (core, fidelity 0)
armies: axis_minor; voice neutral; temperament aggression 0.5, reserve_share 0.2, initiative 0.6, caution 0.5
note: Fallback for unknown armies; plays the core rules only.

## us-1944-rifle (us, fidelity 0.6)
armies: usa; voice us; temperament aggression 0.5, reserve_share 0.25, initiative 0.6, caution 0.6
- tac.fire-and-move: Lead with fire: mortars and MGs on the objective before any rifle squad moves. [company.infantry.attack company.mortar.attack]
- tac.reverse-slope: Put the main line on the reverse slope when the forward slope is under observed fire. [c-US-3001]
- tac.infiltration: Counter infiltration with posts that hold alone and a reserve that strikes hard. [company.infantry.infiltration]
note: Methodical; strong with support weapons, slow without them.

## uk-1944-infantry (uk, fidelity 0.6)
armies: eng; voice uk; temperament aggression 0.4, reserve_share 0.25, initiative 0.5, caution 0.7
- tac.smoke: Screen every crossing of open ground; move once the smoke is thick. [company.infantry.smoke]
- tac.consolidate: Consolidate at once on each objective before the next bound. [squad.infantry.assault]
note: Careful and smoke-heavy; rarely overextends.

## ger-1944-kampfgruppe (ger, fidelity 0.7)
armies: ger, ger2, ger_ss; voice ger; temperament aggression 0.7, reserve_share 0.3, initiative 0.8, caution 0.4
- tac.counterattack: Counterattack a lost position at once, close behind the fire, at the flank of the break-in. [c-GER-0044]
- tac.mg-defense: Build strongpoints round MGs, heavy mortars and an SP gun, firing all round. [c-GER-3021]
- tac.main-effort: One narrow main effort with the heavy weapons massed behind it. [battalion.infantry.attack]
note: Aggressive counterattacks; dangerous to push into. German doctrine here is reported by other nations.

## su-1941-rifle (su, fidelity 0.9)
armies: rus; voice su; temperament aggression 0.9, reserve_share 0.1, initiative 0.2, caution 0.1
- tac.main-effort: Attack straight down the ordered axis; do not shift to a found gap. [lore] [departs]
- tac.withdrawal: Hold or counterattack; withdraw only on a direct order from the top. [lore] [departs]
- tac.reserve: Feed the reserve into a stalled attack rather than holding it back. [lore] [departs]
note: Larp lore, not doctrine: frontal and costly on purpose. Its own manuals asked for initiative; this persona plays the 1941 reputation.

## su-1944-guards (su, fidelity 0.7)
armies: rus_guard, rus; voice su; temperament aggression 0.8, reserve_share 0.2, initiative 0.7, caution 0.4
- tac.main-effort: Mass most forces and fire on the main blow where ground gives cover and observation. [c-SU-2001]
- tac.pursuit: On finding a gap, leaders push through on their own, even off direction. [c-SU-0018]
- tac.town: Fix a town frontally with part; send the main blow round to its rear. [c-SU-3019]
note: Heavy, fast main blow and bold exploitation.

## jp-1942-infantry (jp, fidelity 0.8)
armies: jap; voice jp; temperament aggression 0.9, reserve_share 0.15, initiative 0.7, caution 0.2
- tac.bait: Fake strength in front with noise and automatic fire while the main force goes round a flank. [c-JP-2003]
- tac.infiltration: Under a holding attack, send LMG and grenade patrols round the flanks into the rear. [c-JP-2005]
- tac.night: Prefer attacks when vision is short. [company.infantry.night]
- tac.withdrawal: When a group is losing, charge instead of falling back. [lore] [departs]
note: Flanking and night attacks; at high fidelity it charges when losing. All doctrine here is reported by the US and UK.

## fi-1940-winter (fi, fidelity 0.8)
armies: none; voice fi; temperament aggression 0.6, reserve_share 0.2, initiative 0.9, caution 0.6
- tac.counter-sniper: Use snipers heavily from hides, as reported of Finnish practice. [c-FI-3001 c-FI-3002]
- tac.ambush: Ambush road-bound columns from the woods. [company.infantry.ambush battalion.infantry.winter]
- tac.pursuit: Cut a stalled column into pockets and destroy them one by one. [lore]
note: Needs a mod with a Finnish army or a winter map; maps to no stock army. Finnish practice here is reported.

## what-if-modern (core, fidelity 0)
armies: none; voice neutral; temperament aggression 0.6, reserve_share 0.25, initiative 0.9, caution 0.5
- modern: m.ooda, m.mission-command, m.recon-pull, m.find-fix-finish, m.culmination
note: Not period play: re-plans on events, commits the reserve behind success. For comparison against period personas.
