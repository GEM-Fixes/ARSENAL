# mow-mod-text-ui: encoding (boxes, ?, wrong letters, "resave in UTF8")

When: "question marks or boxes instead of letters", Cyrillic or accents broken, "Please resave file in UTF8", "Identifier expected!", an old cp1251 mod.

## What the game reads
- every string value is read as UTF-8, in data files and `.lng` alike; identifiers are ASCII only (lim PORT-15 [V], proof)
- a cp1251 string parses with NO error and every non-ASCII letter is drawn as U+FFFD (boxes) [V shot] (lim LOC-05)
- vanilla files hold non-ASCII bytes only inside `;` comments (cp1251, some cp866); comments are skipped: keep those bytes as they are
- UTF-8 BOM: allowed and skipped. UTF-16 / UTF-32 BOM: fatal "Please resave file in UTF8" (lim LOC-05)
- a `.lng` with no `{tags ..}` root: fatal "Identifier expected!" (lim LOC-05)
- line ends CRLF for every text data file
- a letter the font lacks is drawn `?`, not a box: U+2011, em dash, curly quotes are the usual ones (lim LOC-14, UI-16)
- a non-ASCII `.lng` file name loads; keep ASCII names for paks (lim LOC-26)
- console text on a wrapped line can garble non-ASCII (lim LOC-27 [I][T])

## Tell the symptoms apart
| on screen | cause | go to |
|---|---|---|
| boxes (U+FFFD) for every non-ASCII letter | file saved as cp1251 or another 8-bit code page | step 2 below |
| `?` for a few signs | glyph not in the font | replace the sign, or a font with it (`fonts-hud-menus.md` of this skill; uilint) |
| the raw key (`desc/...`) | key missing, not encoding | `missing-text.md` of this skill; loccover |
| game stops at load with a message | UTF-16 BOM or no `{tags}` root | step 2 below |

## Steps
1. find the files: MCP `mow_mod_check` (`mod`, `only: "lnglint"`)
   CLI `node tools/lnglint/lnglint.js <mod> [--game G] [--exe as64|mowas_2|mowas2|goh]` (ENC_BOM, ENC_UTF8, GLYPH info)
2. fix into a patch folder, the mod is not written: MCP `mow_mod_fix` (`mod`, `out` = new patch folder, `only: "enc"`; preview unless `write: true`)
   CLI `node tools/fix/fix.js <mod> plan|apply --out <patch mod> --only enc [--game G] [--target as64|classic|mowas2|goh]`
   `enc` turns cp1251 strings into UTF-8 (FIX_LNG_NOT_UTF8, FIX_LNG_NO_TAGS); it is not offered for `--target classic`
3. a whole old mod: MCP `mow_mod_upgrade` (`mod`, `out`, `game`) converts encoding + CRLF in a copy and warns WARN_UPGRADE_ENCODING_GUESS where the code page was guessed → skill `mow-mod-check-fix`
4. signs the font lacks, in a split text folder: `node tools/lngstd/lngstd.js <mod> --out <folder> --only glyph` (dashes → `-`, curly quotes → straight)
5. own editor: save as UTF-8 without BOM, CRLF; many editors change both silently
GUI: Check page (Check & Fix) shows the same findings and the fix plan

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| string encoding | UTF-8 [V] | not sourced in gameprofile (`text.string_encoding`): test one line in game before a bulk convert [T] | UTF-8 [I] |
| `.po` / `.pot` | none | none | header `charset=` is converted to UTF-8 (GHLOC-06) |
| default font | `main` size 10 | same | `main` size 8 (GHUI-206) |
| pack check | packer warns WARN_STR_NOT_UTF8, WARN_TEXT_NONASCII_IDENT | same | same |

## Silent fails
- LOC-05 / PORT-15 cp1251 is not an error anywhere: only the letters are wrong
- LOC-14 a missing glyph gives `?` with no log line
- an editor that "fixes" a vanilla file's cp1251 comments changes bytes for nothing: do not resave vanilla copies wholesale

## Verify
- lnglint has no ENC_* finding on the patch (`mow_mod_check` with `with` = the patch folder)
- in game: one name with non-ASCII letters reads right on the buy panel (→ skill `mow-mod-test`)

Depth: � � · guide README "Conventions"
