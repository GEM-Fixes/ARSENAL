# mow-play-multiplayer: out of sync, dropped, host left
When: a match ended early for someone; the player side. Deep log work: skill `mow-play-trouble` (multiplayer file).

## Say first
Out of sync = one PC computed a different battle than the others. The game cannot repair it; that player is dropped (NET-04 [V]). It is almost always different files or builds, not the network.

## Steps
1. `mow_game_crash {game: "as64"}` on the PC that dropped and on the host (reads `log/oos/` too).
2. Builds and mods: `mow_game_status {game}` on both.
3. Files: `mow_mp_sync` export on both, then compare (`play-with-mods.md`).
4. Fix the difference, all restart the game, new match. The old match cannot be continued.
CLI: `node tools/logtriage/logtriage.js --exe <game>` · `node tools/mpsync/mpsync.js --compare a.json b.json`. GUI: Mods > Check & Fix > Read Game.log.

## What happened -> why
| seen | why | row |
|---|---|---|
| dropped minutes in, joined fine | files differ where the lobby does not look | NET-01 [V] |
| drop only with one mod, even with equal files | a script of that mod draws random numbers on one PC | NET-02 [V] |
| host left, match over | no host change | NET-05 [V] |
| cannot come back | no join in progress; AS64 lets a dropped member return | NET-15 [V] |
| no oos files | only the host or the dropped client write them | LOG-13 LOG-14 [V] |
| replay of the match drifts | replays re-run the battle; they need the same version and mods | NET-06 NET-16 [V] |

## Per game
- AS64: rejoin for a dropped member; `mp_allowDesync` only gates joining (NET-09).
- MoW:AS2: no rejoin.
- GoH: code 0x0bad0006 in the log (GHLOG-10); a leaver's units go to team mates (GHNET-80).

## What goes wrong
- blaming lag: lag slows the game (NET-12), it does not desync it.
- the same two players retry without changing anything.
- one mod that desyncs with equal files: play without it and tell its author.

## Check
A full match with the same players and mods ends without a drop.
