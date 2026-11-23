# mow-mod-weapons-damage: what a hit triggers (bullet_hit, pierce, break_armor, shell class)

when: "it penetrates but nothing happens", "crew never dies", "one shot always kills", "what decides knock-out", "which shell class is my new shell", predicting the outcome of a pierce.
game word: MCP `game` = `as64|mowas2|goh` · CLI `--exe as64|mowas_2|mowas2|goh`. This file explains the chain; writing the handlers → see skill `mow-mod-scripts`.

## Steps
1. read the chain: MCP `mow_lookup` (`query: "damage pen-events"`, `mode: "topic"`) · `mow_limit` (`ids: "DMG-08 DMG-10 DMG-11 DMG-12 DMG-27"`)
   CLI
2. the shell's class tags: MCP `mow_weapon_find` (`q` = shell name, `mod`) or `mow_entity_info` (`names`); the vehicle's script include: `mow_entity_info` on the unit
3. which script file wins: MCP `mow_file_which` (`path` e.g. `set/interaction_entity/tank_medium.inc`, `mods`)
4. predicted pass or fail (before the scripts): MCP `mow_matchup` (`gun`, `ammo`, `target`, `range`, `mod`) · CLI `node tools/armorsim/armorsim.js shot <unit> --weapon W --ammo "<tags>" --range M --from az,el [--exe as64|mowas_2]`
5. lint scripts: `node tools/ialint/ialint.js <mod> [--game dir] [--exe as64|mowas_2|mowas2|goh]`; whole mod: `node tools/check/check.js <mod>`
6. GUI: Models tab > Armour for the pass test; Editor tab for the `.inc`; pages via `gui_pages`

## Events from the engine [V]
| event | fires | carries |
|---|---|---|
| `bullet_hit` | first volume hit on an entity in a step, BEFORE the penetration test; once per entity per step (DMG-12) | volume, position, direction, value = hit side index |
| `pierce` | an ENTER hit that passed and was not stopped; never for a shell stopped by `detonationThickness` (HE) (DMG-11) | same |
| `break_armor`, `break_armor_again` | an armour area's damage reached 1 | volume, energy used, sender `pierce` or `blast` |
| `blast_hit`, `blast` | per blast layer, on arrival of the wave | raw energy E (`break_armor` gets 5 x E) |
- a failed penetration gives only `bullet_hit`
- the penetration margin is not given to scripts: a shell that barely passes and one that overmatches run the same row (DMG-10)
- hit side comes from the face of the `.vol`, not the shot angle (DMG-05)

## The vanilla script design [V data] (a mod may differ: read its files)
- the shell's CLASS tag from the ammo file (`shell_medium`, `shell_big` ...) picks the row in `set/interaction_entity/tank_<size>.inc`; `{if stuff "<tags>"}` needs ALL listed tags, so one shell can match several classes
- per pierce, fixed damage points by shell class on body / turret / engine add up; enough points = bail, more = knock-out, whatever the dice of the other chains say
- AP without the tag `capped` rolls a shatter; on success the rest is skipped
- then by volume: body (crew kill chances, fuel leak, ammo fire, transmission), turret, mantlet, engine, ammo rack; `hit_side` multiplies some chances
- a non-penetrating hit runs the spall chain
- with the vanilla armour macro AP practically never breaks an area, so `break_armor` handlers are blast-only in practice (DMG-07)

## So, for a new shell or gun
- give the shell the class tag that fits its size, or it gets the wrong row or none
- "more penetration" does not mean "more damage after the pierce": that is the class row
- a vehicle kill shows as all parts damaged while seated crew may stay healthy; judge a kill by "crew left", not hull colour (DMG-26, DMG-27)

## Per game
| game | note |
|---|---|
| as64 / mowas2 | as above; mowas2 reads the base scripts without `as64/core` |
| goh | damage after a pierce is engine part-health damage (`vehicle_health_damage_pierce`: GHDMG-25), not the AS2 point ladders; scripts differ. [I, not run] |

## Silent fails
- DMG-16 `{##on pierce` is a disabled block
- DMG-08 `{bullet_detonate}` in a `pierce` handler does not end the shell at once
- INT-23 an event name outside the engine's closed list is not an event
- GPL-07 `{delay}` loses bullet and volume context (`delay_ex` keeps value, position, source)

## Verify
- in game: console `dbg_interactionEvent 1` and `v_bulletPath 1` [V]; repeat shots: pass is the same every time, the rest is chance; multiplayer test mode (armour factor 1); read the log (→ skill `mow-mod-test`)
