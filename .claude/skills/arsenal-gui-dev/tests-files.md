# arsenal-gui-dev: which test file guards what
All under `tools/gui/test/` unless a path is given. Run one: `node tools/gui/test/<file> [<scratch folder>]`. No test starts a game. Last line PASS (or `N passed, 0 failed`). What to run after which change: `tests-which.md`.

| file | guards | in run.sh |
|---|---|---|
| `test.js` | server in process: every contract command against the same CLI run (exit code, stdout, stderr, result); install only into a fake game dir; `--slow` adds fix apply, upgrade, full check | yes |
| `test-gui2.js` | what the server serves, how the page calls it (fake DOM + real server): cancel, timeout, 409 lock, prove argv; children replaced by a spawn hook | yes |
| `test-settings.js` | window settings on the server (`settings.js`, `/api/settings`): survive a restart on another port, bad file moved aside, names outside the allowed ones refused, foreign Host refused | yes |
| `test-pages.js` | `contract.PAGES`: the 5 core pages, each action a contract command with its front-door word; page actions byte-equal to `node tools/as2/as2.js <word>` | yes |
| `test-lang.js` | core strings `lang/{en,ru,uk,zh}.json`: same key set, same `{slots}`, no empty value, every key `page.js` uses exists, NO UNUSED KEY; the page built once per language shows no raw key | yes |
| `test-ext.js` | every ext: id `^[a-z][a-z0-9]*$`, script has no backtick / dollar-brace / `.innerHTML =` / `insertAdjacentHTML` / `document.write`, sets `EXT_SCREENS.<id>` (unless `tab:false`), nav key in its en strings, every en key in ru uk zh, every `tx('key')` defined, routes match `^(GET|POST) /api/x/[a-z0-9/_-]+$`, commands merged; the page parses; then runs every `ext/<id>/test.js` | yes |
| `test-wizard.js` | guided fix on Check: finding cards, ticked subset reaches the fix argv, patch folder never inside the source mod | yes |
| `test-limit.js` | `GET /api/limit` and the limits column, filter and count on the Check result | yes |
| `test-theme.js` | the three `:root` token blocks agree, every `var(--x)` is a token, contrast 4.5:1 (hint 3:1), no colour literal or named colour outside the token blocks in the swept files (`page.js`, `ext/models/sub/armor.client.js`), `onTheme` / `cssv` | yes |
| `test-header.js` | header: game folder warning only when wrong, mod pill, Quick Guided Task fold, row lines | yes |
| `test-ask.js` | `loading`, `result`, `askDo` (the shared "do it?" box) | yes |
| `test-searchkit.js` | searchKit contract: missing options refused, history order / dedupe / cap / forget, index rows + "Show more", stale answers dropped, keys, token mode, Browse = always the picker, data view and its fall back; every core search box uses the kit | yes |
| `test-jumps.js` | jump back bar: page / view / game / scroll jumps kept and walked back, `JUMPS.mark/back/clear/size`, 30 at most | yes |
| `test-lazy.js` | a page asks the server only at first show (list `LAZY`), one refresh per show, a mod or game change refreshes only the page on screen, one `/api/mod` at start; `--calls` prints the start requests | yes |
| `test-blocks.js` + `blockcheck.js` | blocks: every control and text in a leaf block, ids well formed and unique per screen, a block sits in a container or the screen, a leaf holds no blocks, a control / table / heading / label is never a block; Arrange (move, hide, profiles, import / export) | yes |
| `test-remote.js` | LAN Remote: key, cookie, lockout, Host / Origin, EVERY route not on `remote.js` `ALLOW` answers 403 to a remote device (walks the route table), token never leaves the PC | yes |
| `test-wire.js` | bytes on the wire: loopback answers unchanged, gzip only for a non-loopback socket, `__json` answers byte-equal | yes |
| `test-games.js` | the server learns the page's game: `ctx.gameId/exe/kind/gohDir/curDir` from query, body, header; GoH folder refusals for remote devices; core routes under goh | yes |
| `test-live.js` | `--dev`: stream, one reload per burst, server code -> restart, page / strings / client scripts -> rebuild + reload, supervisor keeps port and token | yes |
| `test-tabs.js` | game parity: `groups.js` lists for MoW:AS2 and GoH every tab, sub-tab and page of AS64 in the same order; `na` keys worded in 4 languages; contract `--target` fields; writeguard GoH lookup | yes |
| `ext/task/recipes/*.test.js`, `ext/task/lib/*.test.js` | guided task recipes and the task core | yes |
| `test-jobs.js` | job list, page half: 0.6 s rule, names, header id, Cancel, two clicks for a writing job, greyed when not stoppable | NO: run by hand |
| `test-jobsrv.js` | job list, server half: `joblist.js`, `req` and `bg` jobs, cancel kills the child tree, 499, one registry read per request | NO: run by hand |
| `test-exe.js` | the packaged exe from a clean folder with no node on PATH (needs a built exe) | NO: needs `<exe> <cleanRoot>` |
| `test-mcp.js` | `tools/mcp/gui/registry.json` equals the GUI code; the page files of skill `arsenal-gui-use` are fresh (`refresh-pages.js --check`) | own suite, with `tools/mcp/test/run.sh` |
| `fakedom.js`, `mock-xlate.js` | helpers (fake DOM; goh2as2 question mock), not tests | - |
| `ext/<id>/test.js` | that page: routes with a fake ctx, its script in a fake DOM, block check through `blockcheck`, game parity (`test-games.js` / `testgames.js` beside it), cache sameness (`cachetest.js`, `test-cache.js`) | through `test-ext.js` |

Per game: `test-tabs.js` and `test-games.js` are the two that hold the three game tabs equal.
