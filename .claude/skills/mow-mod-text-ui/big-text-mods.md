# mow-mod-text-ui: big text mods (split, standardize, lint the layout)

When: a mod with thousands of text keys in a few huge `.lng` files; "tidy my localization folder", "find text keys nothing uses", "make names consistent", "split desc.lng".
AS2 only (as64, mowas2): lngsplit, lngstd and lnglayout read AS2 layouts. On GoH use lnglint + loccover (`goh-pot-po.md` of this skill).

## Idea
- `(include "rel/path.inc")` works inside a `.lng` and is expanded before keys are read (lim LOC-21 [V]). So a big file can become a thin parent `.lng` + small `.inc` parts; key paths do not change
- parts are `.inc`, never `.lng`: the game loads EVERY `.lng` under the text folder as its own file (lim LOC-17), so a `.lng` inside a part folder would load twice under another key prefix
- layout: `<title>/vanilla/**` (keys equal to the game's), `<title>/mod/**` (the mod's own and changed keys), `_dropped/**` (dead keys parked, not included)

## Steps (every tool writes to `--out`, never into the mod)
1. plan: `node tools/lngsplit/lngsplit.js plan <mod> --game G [--exe mowas_2|as64] [--only f,..] [--json f]`
2. dead keys (mod-only text keys nothing uses): `node tools/lngsplit/lngsplit.js dead <mod> --game G --out report.tsv`
3. split: `node tools/lngsplit/lngsplit.js split <mod> --game G --out <folder> [--only "#tips.lng"] [--no-park] [--dead-tsv f] [--force]`
   `desc.lng` / `info.lng` mod parts follow the buy list: `mod/squad/<side>/<button>.inc`, `hero/..`, `vehicle_group/..`, `entity/<side>/<button>.inc`, `unlisted`; `--no-buylist` = the older layout
   by default name(side) keys of bare-named cards are renamed to the card name (lim LOC-13); `--no-fix-miskeyed` keeps them; `--renames-out f` reports
   `--min-keys N`: a top-level `.lng` under N keys is copied unchanged; `--loc <folder>` = another text folder, also an already split one (re-split)
4. prove nothing changed: `node tools/lngsplit/lngsplit.js join --compare <old text folder> <new folder> [--minus report.tsv]` (exit 1 on any text difference or one-sided key)
5. standardize the mod parts: `node tools/lngstd/lngstd.js <mod> --out <folder> [--loc <textFolder>] [--only glyph,case,space,soldier,weapon,year] [--report f.tsv]`
   passes: `glyph` (dashes, curly quotes → ASCII, lim LOC-14) · `case` (key case, LOC-03) · `space` · `soldier` (`desc/human` names to the majority form) · `weapon` (`desc/weapon` stat blocks to the majority wording) · `year` (squad keys that differ only by a year token)
   edits `<title>/mod/**.inc` only; a second run is a no-op
6. lint the layout: `node tools/lnglayout/lnglayout.js <mod> --game G [--exe mowas_2|as64] [--loc <textFolder>] [--only CODE,..]`
   errors: LAY_PARENT_TEXT, LAY_GROUP_TWICE, LAY_PART_LNG, LAY_DROPPED_INCLUDED, LAY_KEY_BOTH, LAY_KEY_DUP, LAY_VANILLA_EDITED · warns: LAY_INC_UNUSED, LAY_INCLUDE_ORDER, LAY_KEY_CASE, LAY_FORMAT, LAY_WRONG_PART, LAY_CARD_NO_NAME · info: LAY_MOD_SAME
7. normal lint on the result: MCP `mow_mod_check` (`mod` = the out folder or the mod with the new text folder, `only: "lnglint,loccover"`)
MCP: no tool wraps lngsplit / lngstd / lnglayout; run the CLI lines. Find what exists first with `mow_tools` (`find: "lng"`).
GUI: no page for the split; Check page for the lint

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| lngsplit / lngstd / lnglayout | yes (`--exe as64`) | yes (`--exe mowas_2`) | no: AS2 layouts only |
| vanilla compare set | base + `as64/core` texts (lim LOC-23) | base only | — |
| includes in text | LOC-21 | same | not checked for `.pot`; `.lng` in GoH keeps the AS2 reader (GHLOC-09) [I] |

## Silent fails
- LOC-21 an `(include ..)` that names no file: its keys are simply not loaded (lnglint LNG_INCLUDE_MISSING, loccover LOC_INCLUDE_MISSING)
- LOC-17 a `.lng` left in a part folder loads as its own file: keys under a wrong prefix, duplicates (LAY_PART_LNG)
- LOC-04 / LOC-22 a key in two parts: the later wins, a log line each
- LOC-01 the parent still sits at the vanilla path: it must carry the vanilla parts too, or names vanish
- LOC-03 a key renamed only by case is the same key

## Verify
- `join --compare` exit 0 (texts equal, renames accounted for with `--renames`)
- lnglayout: no error-level finding; lnglint + loccover as before the split
- in game: the game starts, buy panel names and one mission text read as before (→ skill `mow-mod-test`)

Depth: tools/lngsplit, tools/lngstd, tools/lnglayout `--help` � ·
