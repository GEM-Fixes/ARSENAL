# workshop_gui: the Steam Workshop uploader

The default Workshop upload tool of ARSENAL. A small Windows program that uploads a mod folder to the Steam Workshop and updates an item that is already there.

Works with Assault Squad 2, the 64-bit build of Assault Squad 2 (AS64), and Gates of Hell.

## Files

| File | What it is | SHA-256 |
|---|---|---|
| `workshop_gui.exe` | the uploader | `d3396e7947640e4b72e880820345b4d93d5af2a0942e4037c8ad374427a48774` |
| `steam_api64.dll` | the Steam library the uploader needs beside it | `e6d9bafb9a41e42fba7b21553db49f8719027af3f0deb23ff86cfc44d60e776d` |
| `steam_appid.txt` | the Steam id of the game (244450, Assault Squad 2) | |

## Install

The files must be in the game folder, beside the game's own programs:

- Assault Squad 2 and AS64: the game folder (where `as64.exe` or `mowas_2.exe` is).
- Gates of Hell: `binaries\x64` inside the game folder (where `call_to_arms.exe` is).

On Gates of Hell do not overwrite the `steam_api64.dll` that is already in the game folder. Copy only `workshop_gui.exe`.

ARSENAL does this for you: Share page, Workshop step, "Put the uploader into the game folder". Or from a command line:

```
node tools/workshop/workshop.js install "<game folder>"
```

It copies `workshop_gui.exe`, copies `steam_api64.dll` only when the folder has none, and writes `steam_appid.txt` only when the folder has none. It never overwrites a `steam_api64.dll` or a `steam_appid.txt` that is already there, in any game.

## Use

Start Steam and sign in. Then: Share page, Workshop step, "Open the Workshop uploader", or

```
node tools/workshop/workshop.js start "<game folder>"
```

Pick the clean copy of your mod, fill in the page and upload.

## Source

Package supplied by the ARSENAL owner on 2026-11-11 (`workshop_gui.7z`), kept here unchanged.
