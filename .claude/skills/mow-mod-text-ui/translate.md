# mow-mod-text-ui: translate a mod

When: "translate my mod", "Russian / German / Chinese version", "send the texts to a translator", "merge a translation back".

## How languages work
- AS2 (as64, mowas2): ONE language set. Every `.lng` under `interface/text` is loaded, there is no language select (lim LOC-17). A translation is a second mod (or a second build of the mod) that carries the same keys with other text; it is not a language folder
- GoH: one folder per language `localizations/<code>/interface/text/`, fallback to `default`; `default` and `en` read `.pot` / `.lng`, other codes `.mo` / `.po` / `.lng` (GHLOC-01, GHLOC-05)

## Steps
1. extract every key to a table
   CLI `node tools/lng/lng.js extract <mod> --out f.tsv [--lang l]`
   columns: file, key, source, translation, context. reads `.lng` loose or inside the mod's paks, and GoH `.pot` (`--lang l` = only `localizations/<l>/`). `\t \n \\` are escaped in cells
   MCP: no tool for the round trip; call the CLI. Single keys: `mow_text_find` / `mow_text_set`
2. fill the `translation` column (empty = untranslated). Keep in each row: `%` specs in the same order (lim LOC-28), format tags (`<c(..)>` ..), `\n` breaks, the escapes. Do not touch the key or source columns
3. merge into a NEW folder (the mod is never written)
   CLI `node tools/lng/lng.js merge <mod> f.tsv --out <folder> [--all] [--dry-run]`
   writes each changed file at the same relative path, byte-preserving elsewhere, key set unchanged; `--all` = every file of the table; packed files come out loose
   codes: WARN_LNG_PARAM_MISMATCH, WARN_LNG_TAG_MISMATCH (row still written), LNG_ROW_STALE (the source changed since extract: row skipped), LNG_ROW_UNKNOWN, LNG_DUP_KEY, LNG_ENC (file skipped), LNG_OUT_IS_SOURCE, WARN_LNG_NO_MODINFO (the out folder is not a loadable mod until it has a mod.info)
4. make the out folder a mod that loads after the original: its own mod.info with `Require` on the original → skill `mow-mod-start`
5. lint the result: MCP `mow_mod_check` (`mod` = the out folder, `only: "lnglint,loccover"`)
   CLI `node tools/lnglint/lnglint.js <folder> --game G [--exe ..]` (GLYPH info = signs the font may lack)
6. texts that still fall back: `node tools/loccover/loccover.js <folder> --game G`
GUI: Editor page for single files (AS2 tabs); no translate page

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| where the translation lives | a mod with the same `.lng` paths, loaded later | same | `localizations/<code>/interface/text/*.po` (or `.pot` for `en`) inside the same mod |
| which wins | the later file at the same path replaces the earlier whole (lim LOC-01) | same | selected language first, default as fallback |
| untranslated key | shows the original mod's text only if that file was not replaced | same | falls back to default; empty `msgstr` shows `msgid` (GHLOC-06) |
| plural forms | — | — | not supported (GHLOC-25) |

## Silent fails
- LOC-01 a translation mod that ships `desc.lng` with only the mod's keys wipes every other name: merge keeps the full key set of each file, do not trim it
- LOC-28 a dropped `%s` loses a value on screen, no error
- LOC-14 letters the font lacks draw as `?` (the vanilla `main` font has wide Unicode cover [V data]; other families less)
- LOC-05 a table saved by a spreadsheet as UTF-16 or a local code page: boxes, or a fatal load error
- GHLOC-06 GoH: `fuzzy` entries give no text; drop the flag before shipping

## Verify
- merge `--dry-run` shows 0 mismatch warnings you did not accept; lnglint clean
- in game with the translation enabled last: buy panel, one tooltip with values, one mission text (→ skill `mow-mod-test`)

Depth: tools/lng/lng.js header · · guide p07-text-and-translation, 14-localization
