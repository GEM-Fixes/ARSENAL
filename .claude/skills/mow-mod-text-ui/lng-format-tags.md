# mow-mod-text-ui: .lng syntax, colour and font tags, value specs

When: writing or repairing a `.lng` by hand; "colour in a text", "text cut off after a tag", "Identifier expected!", "new line in a name".
Facts:.

## The file
- place: mod `localization/` = virtual `/interface/text/`. every `.lng` there is loaded, in sorted path order; no language select (lim LOC-17)
- usual files: `desc.lng` names, `info.lng` tooltips, `#dlg_frontend.lng`, `#dlg_ingame.lng`, `#dlg_mp.lng`, `#tips.lng`, `mission.lng` (MP map names), `mission/single/<campaign>/<mission>.lng`, `campaign.lng`
- form: starts with `{tags ...}`; `;` = comment; a string never spans lines (lim LOC-06); escapes `\"` `\\` `\n` `\t`; strings side by side in one block are joined
- a block whose children are strings = one text; any other block = one level of the key path: `{"squad" {"riflemans(usa)" "Regular infantry"}}` in `desc.lng` → `desc/squad/riflemans(usa)`
- key = `<file title>/<nested names>`; title dropped for a file name starting `#` (lim LOC-10); a subfolder is prepended
- keys are case-insensitive, may hold spaces and `()` (lim LOC-03)
- `(include "p")` and `(define ..)` work inside `.lng`, expanded before keys are read (lim LOC-21)
- a non-ASCII file name loads; keep ASCII names for paks (lim LOC-26)

## Format tags (inside a text)
- colour `<c(RRGGBB)>`, also `<c(255 255 255)>`, brightness `<c*(1.5)>`; `</c>` restores the default; `<c/>` is unverified (lim LOC-09)
- effects `<e(shadow)>` (`shadow` `shadow_ex` `highlight` `disabled` `default`); font `<f(name)>`; size `<s(28)>` `<s+2>` `<s-2>`; `<b>` `<i>` (`<b->` off); align `<x.>` `<y+>`; letter spacing `<p(n)>`; tab width `<t(n)>`
- several in one tag: `<f(impact)s(28)c(255 255 255)>`
- a literal `<` is `<<` or `&lt;` (lim LOC-08); entities `&lt; &gt; &amp; &quot;` work
- value specs: some texts are format strings filled in order (`%s`, `%i` ..): keep the vanilla specs and their order (lim LOC-28)

## Steps
1. write the key: MCP `mow_text_set` (`mod`, `key`, `text`) keeps the form and escapes for you
   CLI `node tools/lng-add/lng-add.js <mod> --file "#x.lng" --key k --text "t"` (`\n \t \\ \"` in `--text` are read as escapes)
2. lint: MCP `mow_mod_check` (`mod`, `only: "lnglint"`)
   CLI `node tools/lnglint/lnglint.js <folder> [--game G [--mods a,b]] [--exe as64|mowas_2|mowas2|goh] [-q]`
   codes: ENC_BOM ENC_UTF8 STR_NEWLINE TAG_UNCLOSED TAG_STRAY WARN_TAG_CSLASH DUP_KEY DUP_KEY_SAME GLYPH (info) LNG_INCLUDE_MISSING LNG_INCLUDE_CYCLE LNG_INC_UNUSED WARN_LNG_FILE_SHADOWS_VANILLA
3. `%` spec and tag parity of a translation against its source text: `node tools/lng/lng.js merge <mod> f.tsv --out <folder> --dry-run` reports WARN_LNG_PARAM_MISMATCH, WARN_LNG_TAG_MISMATCH
GUI: Editor page (AS2 tabs only), Check page

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| `.lng` form | as above | same | still read inside `localizations/<code>/interface/text/`, same key rule (GHLOC-09); main form is `.pot` / `.po` |
| in-file duplicate | later wins | same | first stays (GHLOC-08) |
| default font size for untagged text | 10 | 10 | 8 (GHUI-206) |
| format tags | as above | same | not compared for GoH: check in game [T] |

## Silent fails
- LOC-07 a tag without `>` swallows the rest of the text
- LOC-08 a stray `<` starts a tag
- LOC-14 U+2011, em dash, curly quotes: drawn as `?` when the font lacks the glyph, no log
- LOC-04 a duplicate key changes the text silently (log line only)
- LOC-28 wrong `%` specs drop or misplace values
- fatal, not silent: no `{tags}` root = "Identifier expected!"; UTF-16/32 BOM = "Please resave file in UTF8" (lim LOC-05)

## Verify
- lnglint clean; the text on its screen in game; game.log has no `Localization key redefinition` for the key (→ skill `mow-mod-test`)

Depth: · guide 14-localization, r09-interface-and-localization
