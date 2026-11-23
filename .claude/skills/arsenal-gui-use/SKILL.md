---
name: arsenal-gui-use
description: Do a modding task THROUGH the ARSENAL GUI (the local web window of this repo, node tools/gui/gui.js, game tabs MoW:AS2 / AS64 / GoH for Men of War Assault Squad 2, its 64-bit build and Gates of Hell) or guide the user through it. Load when the user says "in the GUI", "in ARSENAL", "which page / tab / card do I use for X", "open the page for X", "click it for me", "show me where", "what does this button do", "the GUI is slow", "the page says not available", "Quick Guided Task", "Prepare", "job will not stop", asks for a link to a page, or when you are about to call an `arsenal-gui` MCP tool (gui_status, gui_start, gui_pages, gui_routes, gui_call, gui_jobs, gui_open, gui_lang) or drive the GUI in a browser. Not for changing the GUI's own code (arsenal-gui-dev).
---

# arsenal-gui-use: a task through the GUI (router)
Read ONE sub-file for the sub-task, and ONE `pages-<tab>.md` for the tab. Game facts and modding steps: the `mow-mod-*` skills; this skill is only how to work the window.

## Always
1. `gui_status` first (running? port, game tab, picked mod, may it start the game). Not running -> `gui_start` (needs env `ARSENAL_ALLOW_LAUNCH=1`) or tell the user `node tools/gui/gui.js --port 47811`.
2. Every call names the game tab: `game` = `as64` (default) | `mowas2` | `goh`. Not AS64 -> skill `mow-games` first.
3. The mod is the ONE mod of the window (header pill). Ask the user for the folder when none is picked; never guess one.
4. Read routes: call freely. Write routes: preview, show the user, then write (`write.md`). Game installs and vanilla data stay read-only.
5. Never start the game, switch `--allow-launch` / LAN Remote on, or stop a writing job without the user's word.
6. A data change is done only when seen in game and game.log read (skill `mow-mod-test`).

## Sub-task -> file -> tools
| sub-task | read | tools |
|---|---|---|
| start the GUI, pick game and mod, find the page for a task | `start-and-find.md` | `gui_status`, `gui_start`, `gui_pages`, `gui_routes` |
| call a route that changes files: preview, marks, undo | `write.md` | `gui_call`, `gui_routes` |
| slow answers, the job list, cancel, background builds | `jobs.md` | `gui_jobs`, `gui_call` |
| a page is slow on first open: Prepare ahead | `prepare.md` | `gui_call` (`prep/*`) |
| be led step by step: Quick Guided Task | `guided-task.md` | `gui_call` (`task/*`) |
| tell the user where it is on screen, give a link, exact labels | `screen-and-links.md` | `gui_open`, `gui_lang` |
| no MCP server: raw HTTP to the GUI | `http.md` | curl |
| no MCP server: drive the page in a browser | `browser.md` | browser tools |
| the GUI refuses, hangs, shows "Not available", 403 / 409 / 415 / 499 | `trouble.md` | `gui_status`, `gui_jobs` |
| which tab holds what (index of the page files) | `pages.md` | `gui_pages` |

## Page files (one per top tab: rows "I want to" -> page > card -> route -> CLI, then every route)
| tab | file | holds |
|---|---|---|
| above the tabs | `pages-top.md` | guided task, file viewers, jobs, core routes, `/api/run` commands |
| Help & Docs | `pages-help.md` | Start Here, Prepare, Docs, Guides, Historical Sources |
| Mods | `pages-mods.md` | mod list, new, upgrade / port, files, Check & Fix, Read Game.log |
| IDE | `pages-ide.md` | Editor, hover, usages, which file wins, Notepad++ |
| Models & Sim | `pages-models.md` | models, animation, armour shots, skins, Look & Sound |
| Maps & Missions | `pages-maps.md` | maps, Map Viewer, missions, single-player mission |
| Game Modes & AI | `pages-bots.md` | modes, bots, bot doctrine, unit AI, map scripts for AI |
| Units & Balance | `pages-units.md` | units, equipment, skins, balance sheet, prices, GoH unit |
| Test, Share & Play | `pages-share.md` | test plan, test run, share, Workshop, play together, play |
| Tools & Settings | `pages-tools.md` | Generator, Expert Tools, Settings |
Generated blocks: `node .claude/skills/arsenal-gui-use/refresh-pages.js` (`--check`); never edit between the `gen:pages` markers.

## Do not
- write through `files/save` or `ide` routes what a page route can do with a preview.
- quote unit names, prices or lists from memory: read them (`units/index`, `balance/table`).
- trust a `?` route's write behaviour: read `tools/gui/ext/<id>/` first.
