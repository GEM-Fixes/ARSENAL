# mow-play-trouble: out of sync, "different version", cannot join
When: multiplayer fails: desync, dropped, version mismatch, no session listed, host left.

## Steps
1. Both players: `mow_game_status {game}` (build, mods, order). Builds must be equal.
2. The report of the last run: `mow_game_crash {game}` (reads `log/oos/` too).
3. Compare files: each player `mow_mp_sync {game: "as64", action: "export", mods: ["a", "b"], out: "<full path>/me.json", write: true}`, then one of them `mow_mp_sync {action: "compare", a: "<a.json>", b: "<b.json>"}` -> the files that differ and whether the lobby sees them.
4. What the lobby compares in one mod: `mow_mp_sync {game, action: "mod", mod: "<path>"}`.
5. Fix: same build, same mods, same order, same files for all; restart the match.
CLI: `node tools/mpsync/mpsync.js --game <dir> --mods a,b --exe <game> --export me.json` · `node tools/mpsync/mpsync.js --compare a.json b.json` · `node tools/exever/exever.js`. GUI: Test, Share & Play > Share > Play together.

## What they see -> cause -> row -> games
A = AS64, M = MoW:AS2, H = GoH.
| sees | cause | row | G |
|---|---|---|---|
| "different version" / cannot join | exe build or version differs | NET-13 [V] | A M H |
| joined fine, desync minutes later | the lobby compares few files, some by size only, many not at all | NET-01 [V] | A M |
| dropped at desync, no rejoin | no live resync; the desynced player is removed | NET-04 [V] (GoH GHNET-69) | A M H |
| desync only with one mod | a script draws random numbers on one PC only | NET-02 [V] | A M |
| cannot join a running match | no join in progress (AS64: a dropped member may return) | NET-15 [V] | A M |
| host left, match ended | no host change | NET-05 [V] (GoH GHNET-80: leaver's units go to team mates) | A M H |
| replay refuses or drifts | needs the same version and mods | NET-06 NET-16 [V] | A M |
| `127.0.0.1` shows no session | loopback is skipped; join by the LAN address | NET-21 [V] | A |
| no oos files written | only the host or the dropped client write them; they are tiny | LOG-13 LOG-14 [V] | A M |
| Classic player cannot see an Enhanced lobby | the two AS64 modes never mix | | A |

## Per game
- MoW:AS2 against AS64 in one match: untested [T]; do not promise it.
- GoH has no separate sync check job (GHNET-69); out of sync shows as code 0x0bad0006 (GHLOG-10).

## What goes wrong
- "it let me join, so the files match": the lobby misses most differences.
- comparing only the mod list: the order and the file contents count too.
- a Workshop mod updated on one PC only: both restart Steam, compare again.

## Check
`mow_mp_sync` compare lists no difference; a full match without a drop.
