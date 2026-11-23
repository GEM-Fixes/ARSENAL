# QUICKSTART

A.R.S.E.N.A.L (All-in-one Resource SDK for Engine Assets & Levels; command `ARSENAL`, old name `as2` still works) by Imperator_Aug (credits: CREDITS.md). Lint before you launch, launch before you trust.

**Join The AS64 Community!** https://discord.gg/pgmfaaBVbf

**New here? Read START-HERE.md** (the one-page path: pick the game folder, `new`, `check`, `play`, logs, undo). This file only lists a few more user steps. What was tested in a game, and what was not, is in `tools/BUILDS.md`.

`ARSENAL` means `ARSENAL.exe` from the zip (no Node needed), or `node tools/as2/as2.js` from a source checkout. `G` = your Assault Squad 2 folder, `H` = your Gates of Hell folder, `OUT` = a new empty folder (use a lowercase name).

- Commands and options: `ARSENAL help`, `ARSENAL <command> --help`, `ARSENAL --all`.
- Three games: AS64 (`as64`, the default), the classic MoW:AS2 (`mowas2`) and Gates of Hell (`goh`). Name the game with `--target <game>` (`check` takes `--exe`, `upgrade` takes `--to`). AS64 and MoW:AS2 share the folder `G`.
- The game folder is found through Steam; `ARSENAL game` shows it (`ARSENAL game --kind goh` shows `H`). Otherwise pass `--game G` or set `AS2_GAME` (Gates of Hell: `GOH_GAME`).
- `mission-clone`, `map-clone`, `mapview`, `prove` and `edrun` do not search: they need `--game G`.
- Small download: type `ARSENAL.cmd` (Windows) or `./arsenal` (Linux, macOS) where this file says `ARSENAL`. The first start fetches Node.js unless Node.js 26 or newer is installed; START-HERE.md says how.
- Caches go to your user folder (`%LOCALAPPDATA%\ARSENAL\cache`, `~/.cache/arsenal` or `~/Library/Caches/ARSENAL`; `ARSENAL_CACHE` picks another folder), so the program folder may be read-only. Delete the cache any time.

## Check a mod

```
ARSENAL check <mod folder> --fast -q
```

Works from any folder. `LOADS_STATIC` = no known crash pattern found; it never means "works". Leave `--fast` off for the full check (minutes on a big mod).

## Make a small mod from a spec file

```
ARSENAL gen my-spec.yaml --target as64 --plan --out OUT
ARSENAL gen my-spec.yaml --target as64 --out OUT
```

`--plan` writes nothing. `ARSENAL gen --sample > my-spec.yaml` writes a sample spec (`--sample list` names the other samples, `--sample all` has one example of every op). The spec format is in guide chapter 19.

## A classic MoW:AS2 mod (game 3.262)

```
ARSENAL new OUT --target mowas2
ARSENAL gen my-spec.yaml --target mowas2 --out OUT
ARSENAL check OUT --exe mowas2 --fast -q
```

The mod.info range is 3.262.0 to 3.262.1, and `check` reads the game files the way `mowas_2.exe` sees them (no `as64/core`). `ARSENAL play` on MoW:AS2 runs `--dry` only: `mowas_2.exe` has no control pipe.

## A Gates of Hell mod

```
ARSENAL new OUT --target goh
ARSENAL gen my-spec.yaml --target goh --goh H --out OUT
ARSENAL check OUT --exe goh --goh H --fast -q
ARSENAL upgrade "<AS2 mod folder>" --to goh --plan
```

Keep `OUT` outside `H`: ARSENAL does not write into the Gates of Hell folder, so it does not `install` or `play` there. A Gates of Hell folder name has no space and no `-` (the game skips it). Text goes into `.pot` files.

## Maps

```
ARSENAL maps list
ARSENAL maps list --target goh
ARSENAL maps clone --map map/multi/<group>/<map> --name <new> --out OUT --target mowas2 --plan
ARSENAL map-clone --game G --map map/multi/<group>/<map> --name <new> --out OUT --plan
ARSENAL mapview --game G --map multi/<group>/<map> --width 60
```

## Bring an older mod up to as64

```
ARSENAL upgrade "<old mod folder>" --to as64 --mode enhanced --plan
ARSENAL upgrade "<old mod folder>" --to as64 --mode enhanced --out "G/mods/<mod>_as64"
ARSENAL check "G/mods/<mod>_as64" --fast -q
```

The source folder is never written. Source and `G/mods` on one NTFS drive keeps big paks as links instead of copies.

## Gates of Hell units (convert on your own machine)

Keep the output local: it holds Gates of Hell models and textures. The chain is `goh2as2`, then `donorfit`, then `install`; see guide chapter 19 and `ARSENAL --all`.

## GUI

Double-click `ARSENAL.exe` (or `ARSENAL-gui.cmd` beside it; small download: `ARSENAL-gui.cmd`, or `./arsenal-gui` on Linux and macOS) for the window: it serves a page on your machine and opens your browser. `ARSENAL gui --no-open --port N` skips the browser. Related pages share a tab; the small tabs under the header pick the page. The Docs page (tab Help and docs) reads and searches the guide, and its Historical sources category lists Second World War sources. It also shows the engine technical document once you copy the `techdoc` folder of the separate download `ARSENAL-engine-docs-public-<version>.zip` into the ARSENAL folder. The Models tab edits models and animations without SOEdit.
<!-- Author: Imperator_Aug (ARSENAL, ia-1b39ef6e) -->
