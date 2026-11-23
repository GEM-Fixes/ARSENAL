# mow-play-trouble: it runs but looks wrong
When: checkered or missing textures, raw keys in place of text, a skeleton in place of a soldier, wrong icons.

## Steps
1. Which mods are on and in which order: `mow_game_status {game}`.
2. Check the mod that owns the thing: `mow_mod_check {game, mod: "<path>"}`.
3. Is the file anywhere: `mow_file_which {game, path: "<texture or text file>", mods: [...]}`.
4. Match the table.
CLI: `node tools/goh2as2/texcheck.js <mod dir> --game <AS2 dir>` (lists each missing texture) · `node tools/refcheck/refcheck.js <gameDir> --mods a,b --exe <game>` · `node tools/check/check.js <mod>`. GUI: Mods > Check & Fix > Check; Mods > Read Game.log > "My unit is missing or can't be bought".

## What they see -> cause -> row -> games
A = AS64, M = MoW:AS2, H = GoH.
| sees | cause | row | G |
|---|---|---|---|
| black and white checker on a unit | the texture file is nowhere in the game or the enabled mods; the log says nothing | PORT-152 | A M |
| checker effect or cursor | a sprite or cursor file is missing | VIS-29 UI-21 [V] | A M |
| checker ground on a map | the land textures are absent: the map mod needs its texture mod | PORT-164 | A |
| raw text keys on screen (`desc/squad/...`) | a mod's text file replaced the game's whole file, or the key is unknown | LOC-01 LOC-02 [V] | A M |
| soldier is a skeleton | unknown breed name | HUM-18 | A M |
| unit missing from the buy panel | the mod's unit list was replaced by a later mod, or the card is hidden / rank-locked | VFS-15 MIS-15 [V] | A M |
| question marks or boxes in text | wrong text encoding in the mod (cp1251 shown as U+FFFD) | PORT-15 | A M |

## Usual fix for a player
The mod needs another mod (enable it, order it first) or is incomplete; tell the mod's author with the file name. Two mods fighting over one file: `mow_mods_clash {mods: ["a", "b"]}`.

## Per game
- GoH: a missing text key is logged once (GHLOC-02), so `mow_game_log {game: "goh"}` names it; texts are `.pot` / `.po` under `localizations/`.
- AS2 exes say nothing in the log for a missing texture: only the checks find it.

## What goes wrong
- reinstalling the game for a checker: the file was never in the game; it is the mod's.
- video settings blamed: a checker is always a missing file.

## Check
The checker or raw key is gone after enabling the needed mod; texcheck lists no miss.
