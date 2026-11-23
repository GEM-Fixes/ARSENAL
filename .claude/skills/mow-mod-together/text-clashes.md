# mow-mod-together: text clashes (names raw, wrong text)

when: with both mods on, names show as raw keys (`desc/...`) or the other mod's text. Codes CONFLICT_LNG_KEY_LOST, CONFLICT_LNG_KEY_DIFF, CONFLICT_LNG_KEY_CROSS.

## Steps
1. list them: MCP `mow_mods_clash` (`mods` in load order, `file`: a text path pattern) · CLI `node tools/conflicts/conflicts.js --game G --mods a,b --file "**/*.lng" [--exe as64|mowas_2|mowas2|goh]`
2. one text: MCP `mow_text_find` (`key` or `q`, `mod` = a mod folder) says key, text and file; which copy of a file wins: `mow_file_which` (`path`, `mods`)
3. tell the two cases apart:
   - same path in both mods (e.g. both ship `desc.lng`): the later file replaces the earlier whole. texts only the earlier mod has show raw; texts both have show the winner's (LOC-01, LOC-18 [V])
   - same key in two differently named files: the file read later wins [T which file that is] (LOC-04, LOC-22 [V])
4. fix = merged keys in a patch mod; same-path merges are safe: MCP `mow_mods_patch` (`mods`, `out` = new folder, `name`; plan, then `write: true`)
   CLI `node tools/conflicts/patchmod.js plan|write --game G --mods a,b --out <new folder> [--exe ..] [--spec f.json]`
   cross-file keys need a choice: spec `texts: [{ key, text }]` → written to `localization/#<patch>_texts.lng` of the patch [T]
5. GUI: Share tab > Share page > Mods together, text group, guided fix (`gui_call` `POST /api/x/share/clashfix` `{mods, out, name, files, texts, write}`)

## Facts (as64 + mowas2)
- every `.lng` under `interface/text` is loaded; duplicate key across files = warning `Localization key redefinition`, last wins (LOC-04 [V])
- a file whose name starts with `#` keeps its keys as written, so a patch `#x.lng` can hold any key without replacing a vanilla file (LOC-10)
- a merged `.lng` must be valid UTF-8 in both mods; a UTF-16/32 BOM is fatal in game (LOC-05). cp1251 text is not an error, just wrong letters

## Per game
| game | note |
|---|---|
| as64 | as above; as64/core texts exist only here |
| mowas2 | same rules, `--exe mowas_2` |
| goh | text is `.pot` / `.po` under `localizations/<code>/interface/text/`; entries by `msgctxt`; across files the later file wins, inside one file the FIRST definition stays (GHLOC-08). patchmod merges `.pot` by `msgctxt` (the winner's stay, the other mod's missing ones are added), no picks; spec `texts` is not served on GoH (first copy wins there) |

## Silent fails
- LOC-01 both mods replacing `desc.lng`: the loser's names all show as raw keys, no error
- LOC-18 an empty `desc.lng` in either mod wipes every vanilla name
- LOC-02 unknown key: no error, the key text is shown
- LOC-03 keys are case-insensitive: two keys differing by case collide

## Verify
- `mow_mods_clash` with the patch last (`mod_dirs`): no CONFLICT_LNG_* warn left for the merged files
- lint the patch text: `node tools/lnglint/lnglint.js <patch> --game G [--mods a,b] [--exe ..]`
- in game: open the buy menu of both mods' armies, read unit names and tooltips; read game.log for `Localization key redefinition` (→ skill `mow-mod-test`). more on text: skill `mow-mod-text-ui`
