# arsenal-gui-dev: strings and translations
When: any new or changed text on a page, a job name, an `na` reason.

## Rule
- four languages, always: en, ru, uk, zh.
- no text literal in a script: `tx('<id>.key')`, slots as `tx('k', {n: 3})` with `{n}` in the text.
- plain words for modders. File data rules stay in what the GUI writes (CRLF, UTF-8 strings, ASCII identifiers).

## Where
- core: `tools/gui/lang/{en,ru,uk,zh}.json`: same keys, same `{slots}`, no empty value, NO UNUSED KEY.
- ext: its `lang` (`lang.json` or `lang.js`) `{en, ru, uk, zh}`; every en key needs the other three; keys prefixed `<id>.`; the `nav` key is in en.
- `na` reasons: `na.<page>.<game>` in the ext's lang (core page: `lang/*.json`).
- job names: `job.w.*` or any key of the page.

## Steps
1. Add the key to en, then ru, uk, zh in the same edit.
2. Use it: `tx('units.newkey')`.
3. A key built at run time keeps a literal part ending in `.` (`tx('units.kind.'+k)`): the key check of `test-ext.js` skips those, so check by hand that every such key exists.
4. Look up what exists first: `gui_lang {word: "price"}` (arsenal-gui MCP) or grep the lang file.

## Per game
Game names in text come from the game table, not from a literal: do not write "AS64" into a string that also shows on the GoH tab; use a slot.

## What goes wrong
- raw key on screen: the key is missing in that language, or misspelt.
- `test-lang.js` "unused key": a core key no code uses; remove it.
- slot names differ between languages: `test-lang.js` fails.
- a string edited only in en: `test-ext.js` fails for the ext.

## Check
`node tools/gui/test/test-lang.js` (core), `node tools/gui/test/test-ext.js` (ext keys); switch the window to each language and look at the page.
