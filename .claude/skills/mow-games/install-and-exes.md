# mow-games: install folders, exes, versions
When: "where is the game", "which exe", "which version", "is AS64 a separate game".

## Steps
1. `mow_game_status {game: "as64"}` (install folder, exe build, enabled mods); repeat for `"mowas2"`, `"goh"`.
2. `mow_game_diff {game: "as64", other: "mowas2"}` · `mow_game_diff {game: "goh", key: "exe"}`.
CLI: `node tools/gameprofile/gameprofile.js show as64|mowas_2|goh [key]` · `diff as64 mowas_2` (15 facts) · `diff as64 goh` (30 facts) · `node tools/exever/exever.js` (installed builds against the known list; exit 1 = new build).
GUI: Tools & Settings > Settings (game folder per game button).

## Facts (gameprofile exe.*
| | AS64 | MoW:AS2 | GoH |
|---|---|---|---|
| game exe | `as64.exe` | `mowas_2.exe` | `binaries/x64/call_to_arms.exe` |
| editor exe | `as64_ed.exe` | `mowas_2_ed.exe` | `binaries/x64/call_to_arms_ed.exe` |
| folder | the Assault Squad 2 game folder | same folder | own folder; working dir `binaries/x64` |
| Steam app | 244450 | 244450 | 400750 |
| data version | 3.262 (mods made for it name 3.301) | 3.262 | 1.x scale (read it from `mow_game_status`) |
| Workshop uploader | beside the exes | same | in `binaries/x64` |

## Same in all
A Steam game with a `mods/` folder; zip paks; an `_ed` editor exe.

## What goes wrong
- AS64 treated as its own install: it lives in the AS2 folder and shares the AS2 profile.
- a version number carried from memory: a game update changes it; `exever` exit 1 says so.
- GoH tools given the GoH root where the exe folder is meant: tools take the root; the exe is two folders down.
- writing into an install: tools read; mods go to a folder the user names.

## Check
`mow_game_status` shows the folder and build the person starts; `node tools/workshop/workshop.js status <game folder>` finds the uploader.
