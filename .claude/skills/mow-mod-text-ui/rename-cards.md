# mow-mod-text-ui: rename buy cards with their texts and pictures

When: "rename my cards to name(side)", "card ids are a mess", "bots stopped buying after I renamed a unit", a mod whose card names clash with another mod's.
A card name is an id used in several places at once; renaming only the card breaks the others silently.

## What hangs on a card name (all by exact name)
- the text key: `desc/squad/<name>` or `desc/entity/<name>`, and `info/squad|entity/<name>`
- the pictures: `/interface/scene/unit_icon/<name>_00.._03`; squad icons carry the side in the file name: `riflemans(usa)_00.tga`, brackets included
- bot buy lists: `bot.data.lua` names the card exactly as `name(side)` (lim MIS-32)
- other cards' `content`, presets and limits that name it; the card name is also added as a tag of the unit
- only the SHOWN name changes? Then do not rename the card: set the text (MCP `mow_unit_change` `what: "name"`, or `mow_text_set`)

## Steps
1. list the cards and their names: MCP `mow_unit_find` (`mod`, `army`, `kind`) · `mow_army` (`army`, `mod`)
2. plan the renames (AS2): `node tools/cardrename/cardrename.js plan <mod> --game G [--exe mowas_2|as64] [--map f.tsv] [--json f]`
   renames a mod's buy-list cards to `<name>(<side>)` and their text keys with them; `plan` writes only the rename map (edit `f.tsv` to choose names)
3. apply into a NEW folder: `node tools/cardrename/cardrename.js apply <mod> --game G --out <folder> [--map f.tsv]` (the mod folder is never written)
4. prove it: `node tools/cardrename/cardrename.js verify <mod> --game G --out <folder> --overlay <scratch dir>`
5. one card by hand instead: MCP `mow_mod_gen` (`mod`, `ops`): a `card` op with `name` for the new card + `remove` for the old one, a `text` op for the key; then copy the icon frames (gen `icon_like: <old unit>`)
6. bots: MCP `mow_bots_recipe` (`mod`, `action: "check"`) names buy entries with no card (BOT_UNIT_NO_CARD) → skill `mow-mod-ai-bots`
7. check the result: MCP `mow_mod_check` (`mod` = the out folder, `only: "loccover,uilint,milint"`)
   CLI `node tools/loccover/loccover.js <folder> --game G` (LOC_NAME_MISSING, LOC_HOW_SIDEKEY) · `node tools/uilint/uilint.js <folder> --game G` (PICTURE_MISSING)
MCP: no tool wraps cardrename; run the CLI. GUI: Units page shows card ids; no rename page

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| cardrename | yes (`--exe as64`) | yes (`--exe mowas_2`) | no: AS2 only |
| card name form | squads `name(side)`; vehicle-like macro cards bare (lim LOC-13) | same | `{"id" (macro ..)}` per period file [I]; names in a `.pot` by `msgctxt` |
| by hand | gen `card` / `text` ops | same | gen `card` and `text` forms work; AS2-only ops answer GEN_*_AS2_ONLY |

## Silent fails
- MIS-32 a stale name in `bot.data.lua`: the bot never buys the unit, no error
- LOC-02 the text key kept the old name: raw key on the card
- LOC-13 a bare-named card that only has the `name(side)` key: raw text
- UI-03 the icon files kept the old name: stub picture, no log
- LOC-03 two names that differ only by case are one key
- VFS-42 the rewritten roster file is a full copy: other mods' edits to it are shadowed

## Verify
- `verify` passes; loccover and uilint clean on the out folder; `mow_bots_recipe` check has no missing card
- in game: each renamed card shows picture, name, tooltip; a bot match shows bots still buying (→ skill `mow-mod-test`)

Depth: tools/cardrename `--help` · �
