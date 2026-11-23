# mow-games: multiplayer, saves, replays
When: "can AS2 and AS64 play together", "does GoH check mods", "do saves work across versions".

## Steps
1. Same files for two players: `mow_mp_sync {game, action: "compare", a: "<a.json>", b: "<b.json>"}` (exports made with `action: "export"`).
2. A row: `mow_limit {ids: ["NET-01"]}` Â· GoH `mow_limit {game: "goh", ids: ["GHNET-69"]}`.
CLI: `node tools/mpsync/mpsync.js --compare a.json b.json` Â. GUI: Test, Share & Play > Share > Play together.

## Facts
| | AS64 | MoW:AS2 | GoH |
|---|---|---|---|
| lobby file check | few file kinds, some by size only | same | no separate sync check job |
| resync after desync | none; the player is dropped | same | none |
| host leaves | match ends | match ends | - |
| a player leaves | units go to the host | same | units go to team mates |
| join a running match | no; a dropped member may return | no | - |
| pause | - | - | host only |
| modes | Classic never joins Enhanced | - | - |
| saves | single player; load checks nothing | same | `.sav` with version, map and mod checks |
| replays | need the same version and mods; no seek | same | other record format; not shared |
Rows: NET-01 NET-04 NET-05 NET-13 NET-15 NET-06 NET-07 NET-16 [V]; GHNET-69 GHNET-80 GHNET-05 GHNET-04 GHNET-07 GHNET-21.

## Same in all
Lockstep: every PC runs the same simulation from the same data; builds must match (NET-13 [V]).

## What goes wrong
- "it let me join, so we match": the AS2 lobby misses most differences.
- AS64 with MoW:AS2 in one match: untested [T].
- an AS2 save loaded with other mods: units vanish, no warning.

## Check
`mow_mp_sync` compare lists no difference. For the player side: skill `mow-play-multiplayer`.
