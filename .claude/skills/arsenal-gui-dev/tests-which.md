# arsenal-gui-dev: what to run after which change
Rule: test only what changed, plus suites that reach the changed file (`sh tools/test-all.sh --changed`). Full `sh tools/test-all.sh` only when the user asks. Scratch: a scratch folder (env ARSENAL_TMP). Files and what each guards: `tests-files.md`. Run one: `node tools/gui/test/<file> [scratch]`.

| changed | run |
|---|---|
| one ext's client script or strings | `node tools/gui/ext/<id>/test.js <scratch>`, `test-ext.js` (slow: runs every ext test), `test-blocks.js`, `test-lazy.js`, `test-lang.js` |
| one ext's routes / server | `ext/<id>/test.js`, `test-remote.js` (new route closed to remote devices), `test-games.js` when it reads the game, `test-jobsrv.js` when it spawns or runs in the background; `node tools/mcp/catalog.js` + `tools/mcp/test/run.sh` + `test-mcp.js` when a route was added, renamed or removed |
| `page.js` shared parts | `test-gui2.js`, `test-lang.js`, `test-blocks.js`, `test-lazy.js`, `test-header.js`, `test-jumps.js`, `test-jobs.js`, `test-theme.js`, `test-searchkit.js` (kit, picker, forms), `test-ask.js` (askDo, loading, result), then `run.sh` |
| a search or filter box | `test-searchkit.js`, the ext's `test.js` |
| core strings `lang/*.json` | `test-lang.js` |
| colours, CSS | `test-theme.js` |
| `groups.js` (tabs, sub-tabs, a page added or moved) | `test-tabs.js`, `test-lazy.js` (add the id to `LAZY`), `test-jumps.js`, `test-lang.js`, `node tools/mcp/catalog.js`, `test-mcp.js` |
| `contract.js` | `test.js`, `test-pages.js`, `test-gui2.js`, `test-tabs.js` |
| `gui.js` (dispatcher, ctx, send) | `test-gui2.js`, `test-jobsrv.js`, `test-games.js`, `test-wire.js`, `test-remote.js`, `test-settings.js`, `test-live.js` |
| `joblist.js`, job code in `page.js` | `test-jobs.js`, `test-jobsrv.js` |
| `live.js` | `test-live.js` |
| `remote.js`, `qr.js` | `test-remote.js` |
| `settings.js` or a new setting name | `test-settings.js` |
| a cached answer (`ctx.cache.wrap`), a `prep` section | the ext's cache test (cached = fresh, rebuilt after a relevant edit, not after an unrelated one: PERF.md T2), `node tools/gui/ext/prep/test.js` |
| the page files of skill `arsenal-gui-use` | `node .claude/skills/arsenal-gui-use/refresh-pages.js --check`, `test-mcp.js` |
| anything, before calling it done | `sh tools/gui/test/run.sh`, plus `test-jobs.js` and `test-jobsrv.js` by hand |

## Writing a test
- a test gets a scratch store by its file name (`test.js`, `test-x.js`, `x.test.js`, `guardtest.js`, `cachetest.js`, `testgames.js`, or under a `test/` folder); a test with another name must export `ARSENAL_TEST_STORE` (PERF.md T1).
- no single-tick assertion against an async read: wait for the condition (`until`, `waitFor`, `settle`; PERF.md T3).
- count requests at page start when the page fetches (PERF.md T4; `test-lazy.js --calls`).
- no test starts a game or writes into a game folder or the real user config.

## Per game
A page change: also the ext's game test and `test-tabs.js`, so MoW:AS2 and GoH stay equal to AS64.

## What goes wrong
- `run.sh` stops at the first FAIL and prints its last lines: fix that one, run the single file, then `run.sh` again.
- `test-ext.js` is slow because it runs every ext's test: while iterating run only your ext's `test.js`.
- a pass with a stale server on screen: tests do not restart your window (`restart-and-look.md`).
