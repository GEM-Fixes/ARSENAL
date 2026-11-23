---
name: arsenal-gui-dev
description: Rules for CHANGING the ARSENAL GUI of this repo (tools/gui/**: gui.js, page.js, groups.js, contract.js, lang/*.json, each page folder under ext/ with its client script, routes, strings, tests), the window that serves the game tabs MoW:AS2 (Men of War Assault Squad 2, mowas2), AS64 (as64) and GoH (Gates of Hell, goh). Load before adding or editing a GUI page, card, button, search or filter box, string, translation, API route (/api/x/...), cached answer, Prepare section, tab or sub-tab, colour or theme, job or progress row, and before running or fixing GUI tests ("test-ext fails", "test-blocks fails", "raw key on screen", "page is slow", "route blocks the server"). Covers client rules, blocks, strings in four languages, searchKit, server routes, caches, every game tab the same turn, tests, restart and live reload, keeping the MCP catalog and skills current. Not for using the GUI to do a mod task (arsenal-gui-use).
---

# arsenal-gui-dev: changing the GUI (router)
Read ONE sub-file per kind of change. Sources they point at: `tools/gui/PERF.md` part 1 (speed rules), `tools/gui/README.md` (kit contracts), `tools/gui/ext/index.js` and `tools/gui/groups.js` headers. Pattern to copy: `tools/gui/ext/units/`.

## Always
1. Every game tab the same turn: a page change is made for MoW:AS2, AS64 and GoH, or the page says `na` with a reason; one-game-only = say why (`game-tabs.md`).
2. Client script: ES5 inside `String.raw`, no backtick, no dollar-brace, no `innerHTML`; every control and text in a leaf block; no text literal, four languages.
3. Every search or filter box is the shared `searchKit` (index + Browse + History).
4. Server is one thread: nothing heavy and sync on a route; writes preview first and go only into the picked mod.
5. Test only what changed (`tests-which.md`); scratch in a scratch folder (env ARSENAL_TMP); full `sh tools/test-all.sh` only when the user asks.
6. Keep things current, same turn: a GUI page or route added, renamed or removed, or a task path changed -> `node tools/mcp/gui.js --gen`, `node tools/mcp/catalog.js` (GUI MCP tool list + CATALOG.md), `node .claude/skills/arsenal-gui-use/refresh-pages.js` and the hand row in the `pages-<tab>.md` of skill `arsenal-gui-use`; a new rule -> this skill. Guard: `tools/gui/test/test-mcp.js`. Contract: `tools/mcp/README.md`.

## Sub-task -> file -> tools
| sub-task | read | tools / tests |
|---|---|---|
| how the GUI is built: server, page string, ext folder, core pages | `shape.md` | `node tools/gui/gui.js --dev` |
| write or change a client script (ES5, kit helpers, late answers) | `client-script.md` | `test-ext.js`, `test-lazy.js` |
| add a card, button, field: blocks and Arrange | `blocks.md` | `test-blocks.js` |
| add or change a string, a translation, an `na` reason | `strings.md` | `test-lang.js`, `test-ext.js` |
| add a search or filter box | `search-boxes.md` | `test-searchkit.js` |
| add or change an API route (read side, jobs, remote, settings, colours) | `routes.md` | `test-remote.js`, `test-jobsrv.js` |
| a route that writes into a mod: preview, guard, undo | `write-routes.md` | ext `test.js` |
| a cached answer, a Prepare section | `cache-and-prepare.md` | `ext/prep/test.js` |
| the same change on every game tab, `na` | `game-tabs.md` | `test-tabs.js`, `test-games.js` |
| add, rename or remove a page, tab or sub-tab (and keep MCP + skills current) | `new-page.md` | `catalog.js`, `refresh-pages.js`, `test-mcp.js` |
| which test file guards what | `tests-files.md` | `tools/gui/test/*` |
| what to run after which change | `tests-which.md` | `sh tools/gui/test/run.sh` |
| restart, live reload, look at the result | `restart-and-look.md` | `gui.js --dev` |
| the list to walk before calling a GUI change done | `done-checklist.md` | - |

## Other pages built by others
- page "Claude" (ext `claude`: downloads and install of skills and MCP pieces): its pack list is built by `tools/mcp/pack/pack.js` from `.claude/skills` and the server groups, so a new skill or MCP group shows there by itself; no list to edit.

## Do not
- start the game from an ext route (launch commands live in `contract.js` with `launch:`).
- write a file outside the picked mod, or read the game folder into a write.
- rename a block id or a history key without need: the user's saved layout and history are keyed by them.
