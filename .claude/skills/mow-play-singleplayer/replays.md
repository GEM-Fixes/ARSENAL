# mow-play-singleplayer: replays
When: "how do I watch my match", "replay will not start", "can I rewind".

## Steps
1. Replays are in the game's menu (Replays); the files sit in the profile folder (`mow_game_status {game: "as64"}` names it).
2. A replay that fails: `mow_game_log {game: "as64"}` right after trying; look for "Invalid version!".
3. The rows: `mow_limit {ids: ["NET-06", "NET-16"]}`.
GUI: Mods > Check & Fix > Read Game.log.

## Rules (AS2, AS64)
| fact | row |
|---|---|
| a replay is the list of orders; the game plays the battle again from them | NET-06 [V] |
| so no seeking and no rewind; watch from the start (speed keys still work) | NET-06 [V] |
| the game keeps 5 automatic replay slots; older ones are overwritten | NET-06 [V] |
| a `.rec` stops with "Invalid version!" when the game version or the mods differ | NET-16 [V] |
| with nearly the same files it can start and then drift into nonsense | NET-06 [V] |

## What to tell the player
To keep a replay, copy its file out of the profile folder soon after the match. To watch an old one, enable the same mods in the same order as on that day, on the same game build.

## Per game
- MoW:AS2 and AS64 share the profile; a replay made on one exe is not promised to play on the other [T].
- GoH: another record format (GHNET-21, not yet tried in game); AS2 replays do not play there.

## What goes wrong
- the replay shows units doing odd things: files differ from the day of the match.
- a game update since the match: the replay is lost for that build.
- looking for a replay of a single-player mission: replays are for matches [I].

## Check
With the match's mods on, the replay runs to the end and the result equals the real one.
