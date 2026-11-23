# mow-play-setup: settings, graphics, keys, profile
When: "change my keys", "what is the key for X", "where are my settings", "reset my options".

## Steps
1. Read: `mow_settings_info {game: "as64", what: "keys", filter: "control_manual"}` · options: `mow_settings_info {game: "as64", what: "options", filter: "camera"}`. Read only; no player name shown.
2. Change in the game: Options -> Controls (all hotkeys can be rebound), Options -> Video / Sound / Game.
3. Change by tool only on the user's yes, game closed: CLI below.

## CLI
`node tools/keyprof/keyprof.js --file <keys.set> --list [prefix]` (add `--exe goh` for GoH names; GHUI-36). A change: `--set action=KEY` previews; `--write` only on the user's yes.

## Where the files are
- AS2 pair: `<Documents>/My Games/Men of War - Assault Squad 2/profiles/<id>/options.set` and `keys.set`.
- GoH: `<Documents>/My Games/Gates of Hell/`, or `%LOCALAPPDATA%/digitalmindsoft/gates of hell/` when Documents sits in OneDrive. LOG-22 [V]

## Rules
- your own profile's keys win over a mod's default keys. UI-13 TST-77 [V file]
- a misspelt key name is ignored with no message. UI-11 [V]
- direct control is `E` in the manual and in custom profiles; other keys differ per profile: read them.
- the console is not in the retail game; AS64 needs the start flag `-console`., MIS-12
- `F12` screenshot, `F11` records video (manual, [I]); profile and videos sit under the My Games folder.

## Per game
- AS64 and MoW:AS2 share one profile: a key change shows in both. Start flags `-console`, `-instance`, `-nosound` work on `as64.exe` only. TST-19
- GoH: key names were renamed (GHUI-36); its settings sit in its own folder.

## What goes wrong
- OneDrive moved Documents: the GoH folder is under `%LOCALAPPDATA%`, and OneDrive sync adds noise to the AS2 log. LOG-15 [V]
- a mod's hotkeys "do not work": the profile already binds that action.
- editing `keys.set` while the game runs: the game writes its own copy on exit.

## Check
`mow_settings_info` shows the new binding; in game the key does the action.
