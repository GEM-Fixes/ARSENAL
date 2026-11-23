# mow-mod-scripts: actions, delays, flags, tags, calls

when: "unknown action", "my delay loses the hit", "count hits in a script", "Number of tagged flags overflow", "call does nothing", "spawn an effect from a script", "make it burn after 5 seconds".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. the action list for the game: MCP `mow_script_words {kind:"actions", q:"<part>"}`; which actions may hold other actions: `{kind:"containers"}`; one word explained: `{q:"delay_ex", explain:true}`
2. vanilla use: MCP `mow_script_find {name:"<action>"}`; where a flag or handler name is used: `{name:"<flag>", scope:"scripts", mod:"<mod>"}`
3. lint: MCP `mow_script_lint {mod:"<mod>"}` · CLI `node tools/ialint/ialint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`

## Flow
- `call "ev"` runs a handler now, same context · `inherited` runs the lower level
- `delay T [spread] ["name"] {..}` later with a FRESH command (no bullet, volume, position) · `delay_ex` keeps value, position, source; drops bone, bullet, instigator
- `delay_effect T [spread] "ev"` triggers `{on "ev"}` later · `kill_delay "name"` cancels a named one
- `with_effector {..}` swaps target and instigator · `con` prints to the console; `log` does nothing
- `spawn "entity" ["bone"] [offset x y z] {actions on the spawned}` · `delete` · sound, view, animation and model actions; entity and actor actions → act-entity, act-actor

## State
- flags `{set "x" [0|1]}` / `{if "x"}`: per entity, boolean, saved; at most 128 distinct names in the WHOLE game data
- tags `{tags add|remove "t"}` / `{if tagged "t"}`: unbounded; use them for new state. counters = tag ladders (`1_dam` .. `N_dam`)
- `able` names: at most 32
- no globals, no numbers, no comparisons

## Per game
- as64 / mowas2: about 104 action words, one list
- goh: no `get_off`; adds `unlink`, `call_synced`, `holder_drop`, `set_idle_animation`, `linear_damping`, `restore_volume_states`, `mark_for_persistence`, `wind_detail_bending` and more (GHINT-26). `mow_script_words {game:"goh", kind:"actions"}`

## Silently fails
- VIS-18 / act-flow: an unregistered action word (`emit`) is fatal `unknown action '<x>'` at load
- INT-04 `{call "name"}` with no such handler: silent no-op, typos are invisible (ialint INT_CALL_UNDEFINED)
- INT-10 the 129th flag name, INT-11 the 33rd `able` name: fatal `Number of tagged flags overflow` at load (INT_FLAG_OVERFLOW, INT_ABLE_OVERFLOW)
- INT-12 a `{delay}` run again restarts its timer, never stacks; INT-13 delay bodies have no hit context (INT_DELAY_CTX_LOST); INT-03 what `delay_ex` keeps
- INT-17 `kill_delay ""` is an error (INT_KILL_DELAY_EMPTY)
- INT-09 `blastwave` spawns at the entity origin unless given `position`
- INT-08 `use_blend_tex` logs "not supported" (INT_USE_BLEND_TEX); INT-15 `log`, `rtfunc`, `kick_entity_manager` do nothing
- INT-20 `explode_inventory` with a share of 0.1 or less is ignored (INT_EXPLODE_TINY)
- INT-16 `damage_report` shows only to the local player's own units
- INT-22 `move` / `turn` take a signed value for direction

## Verify
- lint clean; in game cause the event twice in a row (delay restart, flag reuse) and read the log for `unknown action` / `overflow`; marks with `{con "x"}` (→ skill `mow-mod-test`)
