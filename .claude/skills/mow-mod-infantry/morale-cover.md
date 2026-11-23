# mow-mod-infantry: morale, "suppression", cover

when: "add suppression", "soldiers are pinned", "men run away", "soldiers will not take cover", "why do they stand in the open", "morale values".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Tactic choice and targeting of the unit AI → skill `mow-mod-ai-bots` (`unit-ai-targets-ammo.md`).

## Steps
1. read the rules: MCP `mow_lookup {query:"humans/morale", mode:"topic"}` and `{query:"humans/cover-heal", mode:"topic"}`; rows `mow_limit {ids:["HUM-09","HUM-10","HUM-38"]}`
2. what data can change: bot and brain ratios → MCP `mow_lookup {query:"advance_ratio retreat_ratio", mode:"words"}`; in a mission: command `actor_state` (`advance_ratio`, `retreat_ratio`, `move_mode`, `fire_mode`)
3. cover points come from map objects and their models, not from soldier data: MCP `mow_lookup {query:"cover point", mode:"words"}`
4. there is no file with morale constants: the numbers below are built into the game. tell the user so before promising a tuning

## Facts [V; timings not measured in game: T]
- there is NO suppression state. "pinned" in the game means: a player-controlled unit that is currently selected
- the only fear model: morale 0..100 per soldier brain, with threat ratios, feeding the tactic choice (advance, hold, retreat)
- morale recovers slowly by itself; a loss blocks recovery for 10 s
- taking damage lowers it in proportion; hurting an enemy raises it; a kill gives the killer and nearby friends a bonus; a friend killed within 20 m costs the neighbours, more the closer they stood
- friends close together pull their morale toward each other
- cover: a soldier seeks cover within about 15 m on enemy alarm unless ordered to hold or to hold fire; in battle he re-checks every few seconds and moves only for a clearly better spot; an injured man far from the enemy crawls or squats
- which hide animation plays depends on the enemy direction against the wall (fire over, or stay behind)
- brain states that take cover do not run for a pinned (selected, player-controlled) unit

## Per game
- as64 / mowas2: as above
- goh: morale from kills is computed on the host and sent (GHNET-93); other differences: (not yet tried in game)

## Silently fails
- HUM-09 no data key adds suppression; a mod can only imitate it by script (tags, forced stance, `actor_state`) → skill `mow-mod-scripts`
- HUM-10 morale is clamped 0..100 and stays low 10 s after a hit
- MIS-68 bot `retreat_ratio 0` (default 2) changed infantry results in one test game; `advance_ratio 0` showed no change [V, one game each]
- a soldier the player has selected does not seek cover by himself: test with the unit deselected
- cover quality is a property of the map object: a new wall model without cover data gives none

## Verify
- two equal squads, one left alone and one under fire, deselected: watch who seeks cover and who retreats; repeat three times, the behaviour is random within limits (→ skill `mow-mod-test`)
