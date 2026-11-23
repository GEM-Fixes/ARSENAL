# mow-play-multiplayer: modes and how each is won
When: "what is Assault Zones", "how do I win Frontlines", "what does the score mean", "how long is a match".

## Steps
1. All modes of the game: `mow_mode_info {game: "as64"}`.
2. One mode with its numbers: `mow_mode_info {game: "as64", mode: "frontline", mod: "<mod>"}` -> score to win, capture times, preparation time, match length, bots allowed, economy.
3. Which maps carry it: `mow_map_info {game: "as64", mode: "frontline"}`.
CLI:. GUI: Game Modes & AI > Game Modes (`modes/list`).

## Modes (AS2, AS64): what it is; numbers always from the tool
| lobby name | id | how it is won |
|---|---|---|
| Assault Zones | `battle_zones` (`battle_zones_8x8` for big lobbies) | hold flag zones; held zones give score; first to the score, or most at the end |
| Combat | `combat` | kills give score; spawn points only, no flags |
| Frontlines | `frontline` | one team attacks, one defends, in phases 1 to 3; attackers must take each line in time |
| capture the flag | `captureflag` | flag points on the map |
| Skirmish / co-op | `cooperative` | players against the scripted mission |
Rows: MAP-20 MAP-21 Classes `armored_warfare` and `combined_arms` are known to the exe but ship no settings (MIS-19).

## Rules
- match length: a fixed list, 10 to 120 minutes. MIS-21 [V]
- a map without the mode's mission file is skipped for that mode. MIS-24 [V]
- bots stand still in a mode without flags. NET-23

## Per game
- MoW:AS2: the same modes.
- GoH: `battle_zones`, `frontlines`, `ammunition`, `evacuation`, `guerrilla` (`mow_mode_info {game: "goh"}`; GHGPL-18..20, not yet tried in game).

## What goes wrong
- a score or timer quoted from a guide: mods change them; read the tool with `mod`.
- Frontlines played as Assault Zones: defenders win by time, not by flags held.
- Combat picked for a bot match: bots idle.

## Check
The lobby's mode text matches the tool's answer; the score bar moves as the tool says it should.
