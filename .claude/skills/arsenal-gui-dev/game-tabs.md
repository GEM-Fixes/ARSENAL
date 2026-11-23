# arsenal-gui-dev: every game tab, same turn
When: any page change. Project hard rule: a GUI change is applied to every game tab version of that page (MoW:AS2, AS64, GoH) the same turn; one-game-only = say why.

## Rule
- MoW:AS2 and GoH list every tab, sub-tab and page of AS64 in the same order (`tools/gui/groups.js`, guarded by `test-tabs.js`).
- route code reads the request's game from `ctx` (`ctx.gameId()`, `ctx.exe()`, `ctx.kind()`, `ctx.gohDir()`); AS64 argument lists stay as they were.
- a page a game cannot run stays listed: `na: {page: 'na.<page>.<game>'}` in `groups.js`; the reason is worded in four languages.
- one card that cannot exist says so on that card: `naCard('na.<page>.<card>.<game>')`.

## Steps
1. Make the change; run the page in each game tab.
2. For each game ask: does the tool behind the route serve it (`--exe as64|mowas2|goh`)? Facts: skill `mow-games`, `node tools/gameprofile/gameprofile.js diff as64 goh`.
3. Yes -> pass the game through. No -> `na` with the reason, in en ru uk zh.
4. Say in the report which game got what, and why any one-game-only piece.

## Per game (what usually differs)
- MoW:AS2: same data rules as AS64, no control pipe -> launch parts are `na`; `dry` works.
- GoH: own install folder (set in the window), other data layout and text files, no armour simulator, writes only outside the GoH install.
- AS64: extra layers `as64/core`, `as64+`; tools need exe = as64 to see them.

## What goes wrong
- `test-tabs.js` fails: a page added to AS64 only.
- `S.gameId` or `ctx.gameId()` not read: the GoH tab shows AS64 data.
- an `na` key missing in one language: `test-tabs.js` / `test-ext.js`.
- a remote device setting the GoH folder: refused (`test-games.js`).

## Check
`node tools/gui/test/test-tabs.js`, `node tools/gui/test/test-games.js`, the ext's game test (`testgames.js` / `test-games.js` beside it); open the page in the three tabs.
