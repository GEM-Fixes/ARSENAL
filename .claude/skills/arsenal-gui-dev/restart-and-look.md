# arsenal-gui-dev: restart, live reload, look at the result
When: after any GUI change, before saying it works.

## Restart
- the page string and routes are built once at server start.
- plain `node tools/gui/gui.js`: restart it after ANY change (client, strings, routes).
- `node tools/gui/gui.js --dev`: server code -> the server restarts itself (same port and token); `page.js`, strings, client scripts (modules that export a string) -> page rebuilt, open pages reload keeping page and scroll.
- a new file counts once something loaded requires it. A half-written server file kills the child until the next change.

## Look at it
1. Open the page in each game tab (MoW:AS2, AS64, GoH).
2. Light and dark theme; a narrow width.
3. Arrange on: every new piece is a block that can be moved and hidden.
4. Each language once (en, ru, uk, zh): no raw key, no clipped text.
5. Anything slow: the job row shows, Cancel works; a writing job asks twice.
6. A write: Preview shows the plan, Write is refused after the body changed, the page refreshes after the write.

## Through MCP (arsenal-gui)
`gui_status {}` (which port, did it restart), `gui_call` the new route with `game` set to each of `as64`, `mowas2`, `goh`, `gui_jobs {}` for the job row, `gui_open {page: "<ref>"}` for the link to give the user.

## Per game
GoH tab needs a GoH folder set in the window; without one the page must say so, not throw.

## What goes wrong
- other agents edit `tools/gui` while you look: `--dev` reloads your page mid-step; typed text is lost.
- a hidden browser pane draws nothing (no animation frame): front the tab before judging the page.
- "Reconnecting" that stays: the server child died on a syntax error; read its console.
- you changed a string and see the old one: plain server not restarted.

## Check
The page looked at in three game tabs and two themes; then the tests of `tests-which.md`.
