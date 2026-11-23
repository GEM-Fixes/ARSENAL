# mow-play-singleplayer: the editor for a player
When: "I want to try units against each other", "sandbox", "open the editor". For making maps or missions: skill `mow-mod-maps-missions`.

## Steps (AS2, AS64;
1. Start: Steam start dialog -> "Editor" (exes `as64_ed.exe` / `mowas_2_ed.exe`).
2. `F2` opens the map editor; `F1` closes it back to the game view. Sub-editors on keys 1 to 9.
3. Load a map, place units of two sides, press Start to run it; Stop returns to editing.
4. Names to place: `mow_unit_find {game: "as64", q: "tiger", kind: "vehicle"}`; a map to load: `mow_map_info {game: "as64", mode: "battle_zones"}`.
5. Before testing a duel by hand, ask the tool: `mow_matchup {game: "as64", attacker: "<unit>", target: "<unit>", range: 300}`.
GUI: Units > Unit Stats (find names); Maps & Missions > Maps.

## Rules
- the editor loads the same mods as the game (the shared enabled list).
- saving in the editor writes map files: save only into a mod folder of your own, never over the game's maps.
- the console is not in the retail game; AS64 needs the start flag `-console` (MIS-12).

## Per game
- MoW:AS2: the same editor and keys.
- GoH: `call_to_arms_ed.exe`; it does not run the mission inside the editor (gameprofile `feature.editor_game_runs_mission`, GHED rows, not yet tried in game).

## What goes wrong
- a unit name not found in the editor list: it belongs to a mod that is off.
- pressing Save out of habit on a vanilla map: answer no; vanilla data stays untouched.
- units stand still after Start: both sides were set to the same player or team.

## Check
After Start the two sides fight; after Stop the map is as placed and nothing was saved into the game folder.
