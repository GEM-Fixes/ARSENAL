# mow-play-armies: an army inside a mod
When: "what does this mod add to Germany", "new army in this mod", "are the prices different".

## Steps
1. The modded roster: `mow_army {game: "as64", army: "ger", mod: "<full path of the mod folder>"}`; armies the mod has: `mow_army {game: "as64", mod: "<path>"}`.
2. The vanilla roster for contrast: the same call without `mod`.
3. What the mod changed in files: `mow_mod_diff {game: "as64", mod: "<path>"}` (changed files and keys against the game; `q: "<part of a file or key>"` narrows it).
4. One unit: `mow_unit_find {game: "as64", q: "<name>", army: "ger", mod: "<path>"}` then `mow_unit_stats {game: "as64", id: "<id>", mod: "<path>"}`.
5. Mods that need other mods: check the parent first (`mow_mod_info {game: "as64", mod: "<path>"}`); `mow_army` reads ONE mod on top of the game.
CLI: `node tools/statsheet/statsheet.js <gameDir> --exe as64 --mods a,b` · `node tools/overdiff/overdiff.js --help`. GUI: Mods > Mods (pick the mod), then Units > Unit Stats, Balance.

## How to answer
New units, removed units, price changes: three short lists from step 1 against step 2. Then the usual army guide files with `mod` in every call.

## Rules
- a later mod replaces whole files: with two unit mods on, the roster is the last one's (VFS-15 [V]).
- a card may exist but be hidden or rank-locked (MIS-15 [V]).
- a mod with its own guide (RobZ Realism): load its skill (`mow-robz`) too.

## Per game
- MoW:AS2: `game: "mowas2"`; a mod made for AS64 Enhanced is off there.
- GoH: `game: "goh"`, with `period`.

## What goes wrong
- a child mod read alone: its roster looks empty or half.
- the Workshop copy and a `mods/` copy differ: name the folder the game loads (LOG-17).
- vanilla advice given because `mod` was left out.

## Check
The tool answer states the mod it read; its prices equal the buy panel with that mod on.
