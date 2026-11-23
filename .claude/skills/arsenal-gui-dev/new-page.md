# arsenal-gui-dev: add, rename or remove a page, tab or sub-tab
When: a new ext, a page moved in the tabs, a page or route renamed or removed.

## Add a page
1. Copy the shape of `tools/gui/ext/units/` into `tools/gui/ext/<id>/` (id `^[a-z][a-z0-9]*$`): `index.js`, `client.js`, `server.js`, `lang.json`, `test.js`.
2. `index.js` exports `{id, nav, adv, after?, script, lang, commands, routes, prep?}`.
3. Add the literal `require('./<id>')` to `tools/gui/ext/index.js`.
4. Place it in `tools/gui/groups.js` for AS64, MoW:AS2 and GoH (same order; `na` where a game cannot run it).
5. Add the id to `LAZY` in `tools/gui/test/test-lazy.js` (it must ask the server only at first show).
6. Strings in en, ru, uk, zh; blocks; searchKit boxes (their own sub-files).
7. Decide `remote.js` `ALLOW` for each new GET.

## Keep things current (same turn; project hard rule)
- `node tools/mcp/gui.js --gen` (the registry `tools/mcp/gui/registry.json` from the GUI code).
- `node tools/mcp/catalog.js` (GUI MCP tool list + `tools/mcp/CATALOG.md`).
- `node .claude/skills/arsenal-gui-use/refresh-pages.js` (the generated blocks of `arsenal-gui-use/pages.md` and each `pages-<tab>.md` there; a new top tab gets its file by itself), then add or fix the hand-written "I want to" row in that tab's file and, for a new tab, its line in `arsenal-gui-use/SKILL.md`.
- a new rule for GUI code -> this skill (`arsenal-gui-dev`), in the sub-file it belongs to.
- a new CLI tool or game fact the page needs -> `tools/mcp` tools module + the `mow-*` skill covering that task (skills point at the webs, no copied facts).
- guard: `tools/gui/test/test-mcp.js` (fails on drift; it runs `refresh-pages.js --check`), `tools/mcp/test/run.sh`. Contract: `tools/mcp/README.md`.
- page "Claude" (ext `claude`): its pack list is built by `tools/mcp/pack/pack.js` from `.claude/skills` and the server groups, so a new skill or group shows there by itself.

## Rename or remove
- a page id or route name is part of saved layouts, history keys, links (`#go=page:<ref>`) and skills: rename only with need; then fix the rows in `arsenal-gui-use/pages-<tab>.md` and any `mow-mod-*` skill naming the page (grep the old ref in `.claude/skills`).
- remove: drop the `require`, the `groups.js` entries for all three games, the `LAZY` id, unused strings, the hand rows.

## Per game
A page is listed for all three games or `test-tabs.js` fails; GoH-only pages (like `goh`) are the one exception, marked in `groups.js`.

## What goes wrong
- `test-mcp.js` FAIL "registry.json differs" or "page list ... is stale": run the three commands above.
- the page shows in dev, not in the packaged exe: the `require` is not literal.
- `refresh-pages.js` prints "no hand-written row names: page x": add the row.

## Check
`node tools/gui/test/test-mcp.js`, `test-tabs.js`, `test-lazy.js`, `test-jumps.js`, `test-lang.js`, `test-ext.js`; `node .claude/skills/arsenal-gui-use/refresh-pages.js --check` exits 0.
