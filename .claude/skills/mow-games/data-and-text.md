# mow-games: data folders, text files, interface, encoding
When: "where are vehicles in GoH", "is the file format the same", "which text files", "does as64 read this GoH key".

## Steps
1. One key or word: `mow_lookup {query: "<key>", mode: "diff"}` (GoH exe against as64) · CLI `node tools/q/q.js -g <key>`.
2. A text in a mod or game: `mow_text_find {game: "goh", q: "<words>"}`.
3. Folders compared: `node tools/gamediff/gamediff.js --as2 <dir> --goh <dir> [--exe as64|mowas_2]`.
GUI: Mods > Mod Editor (file tree per game button); Help > Modding guide.

## Facts
| | AS64, MoW:AS2 | GoH |
|---|---|---|
| vehicles | `entity/-vehicle/<class>/` | `entity/-vehicle/<nation>/<class>/` |
| campaign data | missions only | also `set/dynamic_campaign` (Conquest) |
| terrain layers | `.mtl` | `.materials` |
| text | `.lng` under `localization` | `.pot` default plus `.po/.mo/.lng` per language under `localizations/<code>/`; a missing key is logged once |
| interface | `/interface/pages` | `/interface/layout/*.xml` |
| key names | AS2 names | many renamed |
Rows: PORT-93 [V], PORT-33, GHCQ-03, PORT-44, PORT-42, GHLOC-01 GHLOC-02, PORT-41, GHUI-36.

## Same in all
`entity/`, `set/`, one text data language (SDL blocks in braces); string values UTF-8, identifiers ASCII; vanilla AS2 comments may be cp1251 (keep the bytes). PORT-15

## More
- keys GoH has that as64 does not read:, goh-keys-drop.
- AS64 against MoW:AS2: the same data rules; what breaks a mod moved between them:
- the modding guide (`mow_guide {}` = chapter list; `mow_guide {search: "<words>"}`) is written for MoW:AS2 and AS64; chapter p12 covers units from GoH.

## What goes wrong
- a GoH key pasted into an AS2 file: read or ignored silently, sometimes fatal; ask `-g` first.
- cp1251 text shown as U+FFFD in a tool: an encoding fault in the mod, not in the game.
- a `.lng` mod text file that replaces the game's whole file: raw keys on screen (LOC-01 LOC-02 [V]).

## Check
`node tools/q/q.js -g <key>` says read / not read by as64; the game shows the text, not the key.
