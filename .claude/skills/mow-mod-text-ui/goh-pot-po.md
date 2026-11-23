# mow-mod-text-ui: Gates of Hell text (.pot, .po, language folders)

When: the game is `goh` and the task is any text: a name, a translation, "my text does not show in Gates of Hell", "msgctxt", "fuzzy".
All GoH rows are untested, none was run in game: say so, and check in the user's game before depending on one.

## Rules (GHLOC)
- place: `localizations/<code>/interface/text/`. A mod's root `localization/` (the AS2 place) is never read (GHLOC-01, GHLOC-09 [V])
- two layers: fallback = default language `.pot` then `.lng`; primary = the selected language `.mo` `.po` `.lng`. lookup primary, then fallback (GHLOC-01)
- language code `default` or `en` reads only `.pot` / `.lng`, never `.po` / `.mo`: an `en/*.po` is ignored (GHLOC-05)
- entry: key = `msgctxt`, lower case. No `msgctxt`, or flagged `#, fuzzy` = no text. Empty `msgstr` shows `msgid`. Header `charset=` is converted to UTF-8, a UTF-8 BOM is skipped (GHLOC-06)
- plural entries (`msgid_plural`, `msgstr[n]`) do not work: one `msgctxt` / `msgid` / `msgstr` per key (GHLOC-25)
- `.lng` still loads inside that folder, with the AS2 key rule (file title + path, `#` drops the title) (GHLOC-09)
- duplicate key: across files the later file wins (extension order, then sorted names), log `Localization key redefinition`; inside one file the FIRST definition stays (GHLOC-08). AS2: later wins inside a file too
- missing key: shown as the key, logged once `Missing text: [key]` (GHLOC-02)

## Steps
1. find: MCP `mow_text_find` (`game: "goh"`, `q` or `key`, `lang` = language folder such as `en`, `ru`, `default`; `mod` = the mod folder)
2. set: MCP `mow_text_set` (`game: "goh"`, `mod`, `key`, `text`; default file `<mod>.pot` under `localizations/default/interface/text/`; `loc` = another language folder, then a `.po`; `force: true` replaces; preview unless `write: true`)
   CLI `node tools/lng-add/lng-add.js <mod> --exe goh --file <mod>.pot --key k --text "t" [--loc <code>] [--force] [--dry-run]`
     `.pot` (codes default and en only): text in `msgid`, `msgstr ""`; `.po` (other codes): text in `msgstr`; a `fuzzy` flag on a replaced entry is dropped
   in a spec: `node tools/gen/gen.js spec.yaml --target goh --plan` writes its `text` op as a `.pot` there
3. lint: MCP `mow_mod_check` (`game: "goh"`, `mod`, `only: "lnglint,loccover"`)
   CLI `node tools/lnglint/lnglint.js <mod> --exe goh` (PO_NO_CTXT, PO_FUZZY) · `node tools/loccover/loccover.js <mod> --exe goh [--lang <code>]`
4. translate: `node tools/lng/lng.js extract <mod> --out f.tsv --lang <code>` → fill → `node tools/lng/lng.js merge <mod> f.tsv --out <folder>`
5. an AS2 mod's `.lng` moved to GoH (or back): the converter writes `msgctxt` = the AS2 key: MCP `mow_mod_upgrade` (`mod`, `out`, `game` = target) → skill `mow-mod-port`
GUI: under the GoH tab there is no Editor page and no text task in the Quick Guided Task; use the Check page

## Per game
| | goh | as64 / mowas2 |
|---|---|---|
| mod text file | `localizations/default/interface/text/<mod>.pot` | `localization/#<mod>.lng` |
| languages | one folder per code, fallback to default | one set, no select (lim LOC-17) |
| key | `msgctxt` | file title + path |
| missing key | logged `Missing text` | silent (lim LOC-02) |
| reload | console `dev_l10n_reload` (GHLOC-12) | restart (lim LOC-16) |
| export | console `dev_l10n_export_pot`: every `.lng` → `.pot` under `localizations/exported/`; an empty argument crashes (GHLOC-10) | none |
| write guard | mod folder must be outside the GoH install | inside `mods/` is fine |

## Silent fails
- GHLOC-06 an entry with only `msgid`, or still flagged `fuzzy` → raw key
- GHLOC-05 a translation shipped as `en/*.po` is never read
- GHLOC-09 a `.lng` left under the AS2 `localization/` path does nothing
- GHLOC-08 a second definition in the same file is ignored (the opposite of AS2)
- `.mo` files are binary: loccover does not read them (info LOC_GOH_MO); a `localizations/<code>.pak` in an unmounted folder is not read (LOC_GOH_PAK)

## Verify
- lnglint has no PO_NO_CTXT / PO_FUZZY; `mow_text_find` with `mod` answers the text
- in game: the screen that shows it; grep game.log for `Missing text` (→ skill `mow-mod-test`)

Depth: � · guide p07 and 14, sections "In Gates of Hell" · `node tools/gameprofile/gameprofile.js diff as64 goh` (loc.format, loc.mod_folder)
