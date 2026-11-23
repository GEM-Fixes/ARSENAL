# mow-play-trouble: slow start, long load, low frame rate
When: "takes minutes to start", "lags", "low FPS".

## Steps
1. `mow_game_status {game}` (how many mods, which).
2. `mow_game_log {game}` (timings and floods show there).
3. Match the list; try without mods; add back in halves (`bisect-mods.md`).
CLI: `node tools/logtriage/logtriage.js --exe <game> --summary`. GUI: Mods > Check & Fix > Read Game.log.

## Causes
| sees | cause | row | G |
|---|---|---|---|
| first start after a mod change is long | mount time is not cached yet (tens of seconds with a dozen mods; minutes seen once for a very large mod); under a second when cached | LOG-18 TST-13 [V] | A M |
| start stalls, then the menu | Workshop query wait, up to 15 s | ENG-22 [V] | A M |
| Apply in Options -> MODS takes about 30 s | the game re-mounts everything | | A M |
| log floods, slow reads | a pak written without checksums | GHVFS-18 | H |
| multiplayer feels slow / jerky | the game slows its speed when a step runs long; the slowest PC or link sets the pace | NET-12 [V] | A M |
| low frame rate in a match | no web row names a cause. Say so | - | A M H |

## What to try (advice, not engine fact)
Without mods first; then mods back one half at a time; lower video options; fewer bots and a smaller map; close the Steam overlay and recorders.

## Per game
- AS64: no FPS cap and a shorter multiplayer step than MoW:AS2 [V]); the same PC can feel different on the two exes.
- MoW:AS2: 32-bit; very large mods can run out of memory there and load on AS64 [I].
- GoH: its own engine build; no rows on frame rate.

## What goes wrong
- a long first start reported as a hang: wait once, then time the second start.
- promising a frame-rate fix: there is no verified cause in the webs; say what to try and that it is a try.

## Check
The second start is fast; the match holds speed with the same mods.
