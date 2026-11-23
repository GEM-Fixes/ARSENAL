# mow-play-singleplayer: save, load, autosave
When: "where are my saves", "my save lost units", "can I save in multiplayer", "autosave".

## Steps
1. The profile folder: `mow_game_status {game: "as64"}` (settings folder). Saves: `<profile>/save/<name>/`.
2. A save that fails or loads oddly: `mow_game_log {game: "as64"}` right after the load.
3. Which mods were on: `mow_game_status` now; compare with what the person remembers from the save.
GUI: Mods > Check & Fix > Read Game.log.

## Rules (AS2, AS64;
| fact | row |
|---|---|
| saves are single player only | NET-07 [V] |
| a save folder holds `status`, `map.scn`, `mission.scn`, `game.scn` | |
| autosave slots 1 to 5 rotate | |
| loading does not check the game version or the mods: it loads against what is on now | NET-07 [V] |
| so: other mods, or a game update, since the save = missing units, broken scripts, or a crash | NET-07 [V] |

## What to tell the player
Keep the mod list of a campaign unchanged until it is finished. Before changing mods, finish or give up the running mission. Back up the `save` folder by copying it (the person does this).

## Per game
- MoW:AS2 and AS64 share the profile and so the saves.
- GoH: `.sav` files that check version, map and mods at load (GHNET-04 GHNET-07); old campaign saves are upgraded on load (GHCQ-30). Not yet tried in game.

## What goes wrong
- "the save is corrupt": usually the mods differ. Enable the mods of that day, load again.
- OneDrive syncing the Documents folder mid save: copy the folder elsewhere.
- no manual save shown: a mission may forbid it by script [T].

## Check
With the save's mods on, the load runs and `mow_game_log` shows no error after it.
