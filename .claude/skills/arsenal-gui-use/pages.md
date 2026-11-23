# arsenal-gui-use: page index
Which file holds which tab. Read this, then ONLY the file of the tab the task is in. Each `pages-<tab>.md` = hand-written "I want to" rows (page > card -> route -> CLI) + a generated block (sub-tabs, pages, every route of the tab with its write mark).
- generated blocks (between the two `gen:pages` marker lines of each file): made by `node .claude/skills/arsenal-gui-use/refresh-pages.js` from `tools/mcp/gui/registry.json` (`node tools/mcp/gui.js --gen` makes that from the GUI code). Never edit inside the markers. `--check` = exit 1 when any file is stale (`tools/gui/test/test-mcp.js` runs it); it also names pages and routes no hand row covers.
- hand-written rows: above the block of each file. A page or route in a block and in no row = add a row there; a row naming something that left = fix or drop it. A new top tab gets its file by itself (empty row table): fill it and name it in SKILL.md.
- find by word instead of reading: `gui_pages {word}` (what each page is for), `gui_routes {page | word}` (fields of a route).
- all three game tabs hold the same tabs and pages; only `goh` (GoH unit) is GoH only.

## Tabs and files (generated)
<!-- gen:pages -->
registry sig 58a557fd8c410eb876fa3fccb81441e14bf1b5af · 31 pages · 447 routes · 23 commands

### Tab -> file (read only the file of the tab the task is in)
- above the tabs (guided task, file viewers, jobs, core routes, `/api/run` commands) -> `pages-top.md`
- **Help & Docs** (tab `help`, Alt+1) -> `pages-help.md`: `help/first` `help/around` `help/lookup` `prep` `docs/arsenal` `docs/modding` `docs/engine` `docs/project` [Advanced] `guides` `claude` `docs/history`
- **Mods** (tab `mods`, Alt+2) -> `pages-mods.md`: `mods` `upgrade` `files` [Advanced] `check` `logs`
- **IDE** (tab `ide`, Alt+3) -> `pages-ide.md`: `ide`
- **Models & Sim** (tab `models`, Alt+4) -> `pages-models.md`: `models` `art`
- **Maps & Missions** (tab `maps`, Alt+5) -> `pages-maps.md`: `maps` `mapviz` `missions`
- **Game Modes & AI** (tab `bots`, Alt+6) -> `pages-bots.md`: `modes` `bots` `doctrine` `unitai` `mapai`
- **Units & Balance** (tab `units`, Alt+7) -> `pages-units.md`: `units/make` `goh` [GoH only] `balance` `units/tune`
- **Test, Share & Play** (tab `share`, Alt+8) -> `pages-share.md`: `testplan` `test` `share` `play`
- **Tools & Settings** (tab `tools`, Alt+9) -> `pages-tools.md`: `make` `pro` [Advanced] `settings`
<!-- /gen:pages -->
