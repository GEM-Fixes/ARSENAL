# mow-play-multiplayer: host a match, join a friend
When: "how do I host", "my friend cannot see my game", "cannot join", "different version".

## Steps
1. Both players: `mow_game_status {game: "as64"}` -> exe build, enabled mods in order. Build and mods must be equal.
2. Host: Multiplayer -> LAN (same network) or Internet -> "New game" -> pick mode and map -> wait for the others -> start.
3. Friend: the same menu, select the session in the list, join; pick team and army; ready.
4. With mods: compare files first (`play-with-mods.md`).
CLI: `node tools/exever/exever.js` (builds). GUI: Test, Share & Play > Share > Play together.

## Rules
| fact | row |
|---|---|
| exe build and version must match, else "different version" | NET-13 [V] |
| the host's PC is the match: the host leaves, the match ends; no host change | NET-05 [V] |
| a non-host who quits hands the units to the host | NET-05 [V] |
| no joining a running match; AS64 lets a dropped member return | NET-15 [V] |
| a session on `127.0.0.1` is not listed; join by the LAN address | NET-21 [V] |
| mission scripts run on the host only | MIS-20 [V] |
| the game slows when one PC or link runs long steps: the slowest sets the pace | NET-12 [V] |

## Who should host
The player with the steadiest PC and link, who will stay to the end. This is advice from the rules above, not an engine fact.

## Per game
- MoW:AS2 with AS64 in one match: untested [T]; plan on everyone using the same exe.
- AS64: Classic never sees Enhanced lobbies.
- GoH: a leaver's units go to team mates (GHNET-80); a dedicated server exists (GHSRV-01); not yet tried in game.

## What goes wrong
- the friend sees no session: other build, other AS64 mode, or a firewall / router between you (no web row covers routers: say so).
- "joined fine" then a drop minutes in: files differ (`out-of-sync.md`).
- the host alt-tabs or stalls: everybody waits.

## Check
Both `mow_game_status` answers show the same build and the same mod list in the same order; the friend's name stands in a slot.
