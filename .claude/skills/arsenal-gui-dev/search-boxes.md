# arsenal-gui-dev: search and filter boxes
When: adding any box the user types into to find or narrow something, text filters over rows too.

## Rule (project hard rule)
Every one is `searchKit(input, {key, index, browse})` from `page.js`: indexed search while typing, Browse = the file / folder picker, History. No bare filter input, no list popup, no browse function of its own.

## Options
- `key` = history key `<page>.<box>` (stable: the user's history is kept under it).
- `index(q, done)` -> `done(rows, more)`, rows `{label, value, hint}`.
- `browse` spec per the table in `tools/gui/README.md` ("How to choose start / view / toValue"): game things -> `view:'data'` at their game folder; paths -> disk.

## Steps
1. Make the input, wrap: `var kit = searchKit(inp, {key: 'units.find', index: fn, browse: spec})`.
2. Put `kit.el` in the block, not the bare input.
3. The page's own keydown starts with `if (e._sk) return;` and is assigned after the kit.
4. `kit.refresh()` when the data behind the index changes (mod or game switched, a write).
5. Ext tests get the real kit with `require('../../test/blockcheck').kitSrc()`.

## Per game
The index reads the request's game; Browse starts in that game's folder (GoH: the GoH folder set in the window). Same box on all three tabs.

## What goes wrong
- a plain `input` that filters a table: breaks the rule; `test-searchkit.js` checks every core box, ext boxes are yours to check.
- the block holds the input instead of `kit.el`: History and Browse buttons are lost.
- stale results after a mod switch: `kit.refresh()` missing.
- Browse opening the disk for a game thing: wrong `view`.

## Check
`node tools/gui/test/test-searchkit.js`, the ext's `test.js`; on screen: type, Browse, History all work in each game tab.
