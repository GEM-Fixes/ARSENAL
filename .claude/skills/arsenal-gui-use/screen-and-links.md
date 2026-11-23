# arsenal-gui-use: tell the user where it is, hand over a link
When: "show me where", "what is that button called", you finished a call and the user must look at the result.

## Steps
1. Link: `gui_open {page: "units/make"}` -> `http://127.0.0.1:PORT/#go=page:<ref>` and where the page sits (tab > sub-tab). Refs are in `pages.md` / `gui_pages`.
2. Exact label in the user's language: `gui_lang {key: "nav.mods", lang: "ru"}` or search `gui_lang {word: "price", lang: "uk"}` (en, ru, uk, zh).
3. Say it as: game button > tab > sub-tab > page > card, in the words of the page file.

## What the user sees
- header: three game buttons, the mod pill (last folder name; full path in its title), Advanced chip, language, theme. Under it: the Quick Guided Task row, the tabs (Alt+1..9), the sub-tab row, the page row.
- every search box: type = indexed search, Browse = file / folder picker, History = earlier searches.
- footer bar: job button + "Back to: ..." jump back. Ctrl+K = palette (pages, games, last mods).
- a page a game cannot run shows "Not available in <game>: <reason>"; a part that cannot run says so on that card.
- Arrange lets the user move and hide blocks, so "top left" may be wrong: name the card, not the place.

## Other link kinds
`#go=lim:AREA-NN` (limit row in Docs), `#go=docs:<path>%23<line>`, `#go=ide:<ref>` / `#go=key:<game path>` (Editor), `#go=log:` (Read Game.log).

## Per game
A link does not pick the game tab (only `goh`, a page the current game lacks, switches) and does not pick the mod: say "press GoH at the top first" when it matters.

## What goes wrong
- the link works only in a browser on this PC (server binds 127.0.0.1; Host must be `127.0.0.1:PORT` or `localhost:PORT`).
- Advanced pages are refused while Advanced is off.
- the page shows old data after your write: tell the user to refresh the page or card.

## Check
`gui_open` answered with the tab path you told the user; the label came from `gui_lang`, not from memory.
