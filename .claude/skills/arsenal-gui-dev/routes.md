# arsenal-gui-dev: add or change an API route
When: a new `/api/x/<id>/<name>` route or a change to one. Writing routes: also `write-routes.md`. Cached answers: `cache-and-prepare.md`.

## Form
- key `'GET|POST /api/x/<id>/<name>'` (`[a-z0-9/_-]`), handler `async (url, body, ctx)` -> JSON.
- a route name twice = the server refuses to start. POST bodies are JSON (415 otherwise).

## One thread (PERF R1)
- nothing that walks, spawns or builds a view runs sync on the request path: no recursive sync walk, `spawnSync`, direct `vfs.build`, per-file `statSync`.
- use `ctx.modtree.ensure`, `ctx.gameview.get/withMods`, `ctx.runTool` (async child, killed on cancel).
- work over about 2 s = a `bg` job with a `/status` or `/progress` poll route (those names keep polls off the job list).
- loops: hoist invariants, read each file once per job, `withFileTypes` not a stat per entry, never one child process per item (PERF L1-L5).

## Per request (PERF R2)
Resolve `ctx.game()`, `ctx.curDir()`, `ctx.gohDir()`, `ctx.gameId()`, `ctx.exe()`, `ctx.kind()` once at the top and pass down.

## Around the route
- never start the game from an ext route; launch commands live in `contract.js` with `launch:` and need `allowLaunch`.
- a new route is closed to LAN Remote devices until listed in `tools/gui/remote.js` `ALLOW` (view-only GETs only).
- a new window-setting prefix must be in the `KEY` pattern of `tools/gui/settings.js`, else it stays in localStorage and is lost when the port changes; no name with token, secret, passw, key, cookie.
- colours are tokens: `var(--x)` from the `:root` blocks of `page.js`, no colour literal; canvas code reads `cssv('--x')` and redraws in `onTheme(fn, key)`.

## Per game
Read the game from `ctx`, never assume as64. A game the route cannot serve: answer `na` with a worded reason; AS64 argument lists stay as they were.

## What goes wrong
- every job's seconds freeze: a sync walk or `spawnSync` on the route.
- the route works locally, 403 from a phone: not in `ALLOW` (correct unless it is a view-only GET).
- a poll route named without `status` / `progress`: it floods the job list.
- a setting lost after a port change: its prefix is not in `KEY`.

## After
`node tools/mcp/gui.js --gen`, `node tools/mcp/catalog.js`, `node .claude/skills/arsenal-gui-use/refresh-pages.js` when a route was added, renamed or removed (`new-page.md`).

## Check
The ext's `test.js`, `test-remote.js`, `test-games.js` when it reads the game, `test-jobsrv.js` when it spawns or runs in the background.
