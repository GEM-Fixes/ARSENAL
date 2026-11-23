# mow-play-singleplayer: campaign and skirmish missions
When: "which missions are there", "where is the tutorial", "what do I have to do in this mission", "a mod's missions do not show".

## Steps
1. Find the mission map: `mow_map_info {game: "as64", q: "<part of the name>"}` (maps with their modes); with a mod: add `mod: "<path>"`.
2. One mission: `mow_mission_info {game: "as64", map: "<mission map>"}` -> what is on it, sides, scripts, findings (`mode: "<one mode>"` narrows it).
3. The map picture: `mow_map_info {game: "as64", map: "<map>", view: true}`.
CLI: `node tools/as2/as2.js maps list` Â. GUI: Maps & Missions > Maps, Missions, Map Viewer.

## What there is (AS2, AS64)
- single-player missions sit under `map/single/`; the tutorial is `06_bonus/00_tutorial` [V file]).
- skirmish missions: you against a scripted enemy on a multi-phase map; also playable with friends as co-op (lobby "Skirmish").
- a match against bots is a multiplayer lobby, not a mission (skill `mow-play-setup`).
- Steam statistics and achievements come from the session service.

## Rules
- objectives and enemy waves are mission script; they run on your PC (in co-op: the host's. MIS-20 [V]).
- a mission is tied to the data it was made with: other mods can break its script or units.
- `Pause` works in single player.

## Per game
- MoW:AS2: the same missions and files.
- GoH: its own campaigns plus Conquest (`goh-conquest.md`); missions of AS2 do not load there.

## What goes wrong
- a mod's mission missing from the menu: the mod is off, or its map has no single-player mission file (MIS-24 [V]).
- an objective that never completes: a script waits for a unit a mod removed; play it without that mod.
- "the mission is too hard": `difficulty.md`.

## Check
`mow_mission_info` reports the mission without a fatal finding; it shows in the game's mission list.
