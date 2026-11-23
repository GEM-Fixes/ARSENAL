# mow-mod-check-fix: text findings (lnglint, loccover)

when: names show as raw keys (`desc/squad/...`), boxes or `?` in place of letters, "Please resave file in UTF8", "Identifier expected!" from a .lng, DUP_KEY / LOC_ / PO_ findings.

## Steps
1. MCP `mow_mod_check` (`mod`, `only: "lnglint,loccover"`); find one key or text: MCP `mow_text_find` (`q` or `key`, `mod`)
2. CLI format lint: `node tools/lnglint/lnglint.js <folder> [--game dir [--mods a,b]] [--exe as64|mowas_2|mowas2|goh] [-q]`
   encoding, braces, strings, duplicate / case keys, tags, mixed script. with `--game`: compare against vanilla (file replaced whole, placeholder set changed)
3. CLI coverage: `node tools/loccover/loccover.js <modDir> [--lang eng] [--vfs --game dir] [--exe as64|mowas_2|goh] [-q] [--summary]`
   mod .lng that replaces a vanilla file (dropped keys), buy cards with no name / info key, damage_report keys
4. GUI: Mods tab > Check & Fix
5. fix: MCP `mow_mod_fix` (`only: "lng,enc,lngdup"`) · `node tools/fix/fix.js <mod> plan --only lng,enc,lngdup`
   lng = merge the dropped vanilla keys back; enc = cp1251 strings to UTF-8 (not for `--target classic`); lngdup = removes the earlier copy of a duplicate key
   one missing name: MCP `mow_text_set` (`mod`, `key`, `text`; preview unless `write: true`) → skill `mow-mod-text-ui`

## Codes
| code | meaning | row |
|---|---|---|
| WARN_LNG_FILE_SHADOWS_VANILLA / LOC_FILE_REPLACED | mod .lng at a vanilla path replaces the whole file | LOC-01 |
| LOC_NAME_MISSING | card or unit with no text key: raw key on screen | LOC-02 |
| DUP_KEY | same key twice (keys are case-insensitive) | LOC-03, LOC-04 |
| WARN_LNG_PARAM_MISMATCH | `%s` / `{n}` placeholders differ from vanilla | - |
| LNG_OVERRIDES_VANILLA, LNG_KEY_NEW | info | - |
| PO_NO_CTXT, PO_FUZZY (GoH) | entry with no `msgctxt` or flagged fuzzy = no text | GHLOC-06 |

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| files | `.lng` under `interface/text`, UTF-8, root `{tags ..}` | same; as64/core texts do not exist (`--exe mowas_2`) | `.pot` / `.po` under `localizations/<code>/interface/text/`, key = `msgctxt` (GHLOC-01) |
| duplicate key | last wins (LOC-04) | last wins | across files later wins, inside one file the FIRST stays (GHLOC-08) |
| loccover | covers as64/core .lng | `--exe mowas_2` | reads .pot/.po, LOC_GOH_* info; no `--game` = the GoH install |

## Silent fails
- LOC-01 / LOC-18 a mod `.lng` at a vanilla path drops every key it lacks; an empty `desc.lng` wipes all vanilla names. text belongs in a `#<slug>.lng`
- LOC-02 unknown key: no error, the key text is shown
- LOC-03 `75mm_41M` collides with `75mm_41m`
- LOC-05 cp1251 parses with no error and shows U+FFFD for every non-ASCII letter [V]; UTF-16/32 BOM and a missing `{tags}` root are fatal
- PORT-15 the same UTF-8 rule holds for strings in every data file, not only .lng

## Verify
- re-run both linters: no error; loccover counts 0 cards without a name
- in game: open the buy menu and the unit tooltip in the language tested; names read right (→ skill `mow-mod-test`)
- localization/keys localization/add · [V] · guide 14-localization, p07-text-and-translation
