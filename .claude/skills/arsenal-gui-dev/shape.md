# arsenal-gui-dev: how the GUI is built
When: first change in `tools/gui`, or you do not know where a thing lives.

## Pieces
- server `tools/gui/gui.js`: one thread, 127.0.0.1 only, no dependencies. The page = ONE string from `tools/gui/page.js` (shell, core pages, shared kit) + every ext's `script`, served at `GET /`. Built once at server start.
- a page = an ext folder `tools/gui/ext/<id>/`; `index.js` exports `{id, nav, adv, after?, script, lang, commands, routes, prep?}`.
- listed by a literal `require('./<id>')` in `tools/gui/ext/index.js` (the single-exe bundler keeps only literal requires) and placed in `tools/gui/groups.js` (tabs, sub-tabs, `na`, Advanced).
- core pages (mods, make, upgrade, check, play, test, settings) live in `page.js`; their commands in `tools/gui/contract.js` (`COMMANDS`, `PAGES`), run through `POST /api/run`.
- shared server parts reached through `ctx`: `ctx.modtree` (the mod walk), `ctx.gameview` (game + mods view), `ctx.cache` (the cache store), `ctx.runTool` (async child), `ctx.job`.
- other files: `joblist.js` (jobs), `live.js` (`--dev` reload), `remote.js` (LAN Remote allow list), `settings.js` (window settings), `lang/{en,ru,uk,zh}.json` (core strings).

## Read first, only what the change touches
- `tools/gui/PERF.md` part 1 (rules R, C, L, K, T + section 6): any route, page or cache work.
- `tools/gui/README.md`: searchKit, JUMPS, JOBS, CACHE contracts.
- `tools/gui/ext/index.js` header: the ext shape and `ctx`. `tools/gui/groups.js` header: tabs, sub-tabs, `na`, Advanced.
- pattern to copy: `tools/gui/ext/units/` (`index.js`, `client.js`, `server.js`, `lang.json`, `test.js`). Parts-style page: `tools/gui/ext/mapviz/README.md`.

## Find things
- which ext owns a route: `gui_routes {route: "POST /api/x/units/change"}` (arsenal-gui MCP; `src` = file:line) or grep the path in `tools/gui/ext/*/index.js`.
- which ext owns a page id / where it sits: `gui_pages {page: "units"}` or `tools/gui/groups.js`.
- a string key: `gui_lang {key: "units.change"}` or grep `tools/gui/ext/<id>/lang.json`.

## Per game
One page string serves all three game tabs; the game is a request property (`ctx.gameId()` on the server, `S.gameId` on the client). No per-game copy of a page.

## What goes wrong
- a new ext not required literally in `ext/index.js`: works from source, missing in the packaged exe.
- editing while a plain `node tools/gui/gui.js` runs: nothing changes until restart (`restart-and-look.md`).
- two exts with one route name: the server refuses to start.

## Check
`node tools/gui/test/test-ext.js <scratch folder>` passes; the page opens in all three game tabs.
