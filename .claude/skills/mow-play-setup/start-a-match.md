# mow-play-setup: start a match
When: "how do I start a skirmish", "which mode", "which map", lobby options.

## Clicks (AS2, AS64)
- Steam start asks Play / Editor / Safe mode / Safe mode (no mods).
- Multiplayer -> LAN with single clicks (a double click lands on "Internet"); "New game" needs a double click.
- "Game type": Assault Zones (default), Combat, Skirmish, Frontlines; then map, team dropdowns (click the small arrow), ready, start.
- lobby options: fog of war, friendly fire, vegetation regrowth, network traffic.

## Pick mode and map with tools
1. Modes and how each is won: `mow_mode_info {game: "as64"}`; one: `mow_mode_info {game: "as64", mode: "battle_zones", mod: "<mod>"}` (score to win, capture times, preparation time, bots allowed, economy).
2. Maps with their modes: `mow_map_info {game: "as64", mode: "battle_zones"}`; one map: `mow_map_info {game: "as64", map: "1v1_gazala", view: true}` (players, flags, start points, text picture).

## CLI
`node tools/as2/as2.js maps list` · words:.

## GUI
Game Modes & AI > Game Modes (`modes/list`); Maps & Missions > Maps, Map Viewer.

## Rules
- a map shows under a mode only when it has that mode's mission file. MIS-24 [V]
- lobby size is capped by the map's `maxPlayers`. TST-34 [V]
- match length comes from a fixed list, 10 to 120 minutes. MIS-21 [V]
- no joining a match that has started (AS64: a dropped member may return). NET-15 [V]

## Per game
- MoW:AS2: same clicks and modes.
- GoH: other modes (frontlines, ammunition, evacuation, guerrilla; GHGPL-18..20) and Conquest (a campaign map): `mow_mode_info {game: "goh"}`. Pause in preparation and reinforcement waves by default (GHGPL-07). Not yet tried in game.

## What goes wrong
- a mod's map missing from the list: the mod is off, or the map lacks the mode's mission file.
- the Combat mode on a map without flags: bots stand still (`add-bots.md`).
- friendly fire is a lobby option: own losses count for the enemy's score.

## Check
The lobby shows the map and mode; after start the buy panel opens and the clock runs.
