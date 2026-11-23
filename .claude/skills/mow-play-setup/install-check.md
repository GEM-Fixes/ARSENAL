# mow-play-setup: is the game installed, which build, where are the folders
When: first contact, "where is my game folder", "which version do I have", before any other step.

## Steps
1. `mow_game_status {game: "as64"}` -> install folder, exe build, enabled mods, running or not, settings and log folders, may the server start it. Repeat with `game: "mowas2"` or `"goh"`.
2. Folder and exe facts of one game: `mow_game_diff {game: "goh", key: "exe"}`; what differs between two: `mow_game_diff {game: "as64", other: "goh"}`.

## CLI
- `node tools/exever/exever.js` (exe builds against the known list; exit 1 = a new build).
- `node tools/gameprofile/gameprofile.js show as64|mowas_2|goh [key]`.
- `node tools/modswitch/modswitch.js --game <dir> --exe as64|mowas2|goh` (dry run: the enabled list, stale lines flagged).

## GUI
Tools & Settings > Settings (game folder per game tab); the header warns only when the folder is wrong.

## Per game
- AS64: `as64.exe` (editor `as64_ed.exe`) in the Assault Squad 2 game folder. Steam app 244450. Data version 3.262; mods made for it name 3.301.
- MoW:AS2: `mowas_2.exe` (editor `mowas_2_ed.exe`), same folder, same Steam app, same profile.
- GoH: `binaries/x64/call_to_arms.exe` (editor `call_to_arms_ed.exe`), own folder. Steam app 400750. Version on a 1.x scale.
- user folder AS2 pair: `<Documents>/My Games/Men of War - Assault Squad 2/` (`profiles/<id>/options.set`, `keys.set`, `log/`). GoH: `<Documents>/My Games/Gates of Hell/`, or `%LOCALAPPDATA%/digitalmindsoft/gates of hell/` when Documents sits in OneDrive. LOG-22 [V]
- Steam start of AS2 asks: Play / Editor / Safe mode / Safe mode (no mods).

## What goes wrong
- two installs (Steam library moved): the tool reads the one it finds first; ask the person which they start.
- `exever` exit 1: a game update; mods with a tight version range may now be refused (`install-a-mod.md`).
- the person looks for an AS64 profile folder: there is none of its own, it uses the AS2 one.

## Check
`mow_game_status` names the folder the person starts the game from, and the build they see in the main menu corner.
