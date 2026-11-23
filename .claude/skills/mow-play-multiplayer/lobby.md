# mow-play-multiplayer: the lobby
When: "how do I set up a match", "what do the options do", "why can I only add 2 players".

## Clicks (AS2, AS64;
- Multiplayer -> LAN or Internet. Single clicks on the menu (a double click on LAN lands on "Internet"); "New game" needs a double click.
- "Game type": Assault Zones (default), Combat, Skirmish, Frontlines. Then the map.
- team and army dropdowns: click the small arrow of a slot. Ready, then the host starts.
- options: fog of war, friendly fire, vegetation regrowth, network traffic.

## Steps with tools
1. Maps of a mode and their size: `mow_map_info {game: "as64", mode: "battle_zones"}`; one map: `mow_map_info {game: "as64", map: "<map>", view: true}` (players, flags, start points).
2. The mode's rules: `mow_mode_info {game: "as64", mode: "battle_zones", mod: "<mod>"}`.
CLI: `node tools/as2/as2.js maps list`. GUI: Maps & Missions > Maps; Game Modes & AI > Game Modes.

## Rules
- lobby size is capped by the map's `maxPlayers`. TST-34 [V]
- a map shows under a mode only when it holds that mode's mission file. MIS-24 [V]
- match length comes from a fixed list, 10 to 120 minutes. MIS-21 [V]
- nobody joins after the start (AS64: a dropped member may return). NET-15 [V]
- the lobby compares only some file kinds, some by size alone: a green lobby does not prove equal files. NET-01 [V]

## Per game
- MoW:AS2: the same lobby.
- AS64: Classic and Enhanced lobbies never mix; all players pick one mode.
- GoH: its own lobby with doctrine choice and other modes (`goh-doctrines-and-modes.md`); only the host may pause (GHNET-05).

## What goes wrong
- a mod map missing: the mod is off, or the map has no file for that mode.
- friendly fire on without telling the team: own artillery kills count.
- a 4v4 planned on a map with fewer slots.

## Check
All slots show the players and armies wanted; the start button is live for the host.
