# arsenal-gui-use: start the GUI, pick game and mod, find the page
When: first GUI step of any task; "which page do I use for X"; "is the GUI running".

## Steps
1. `gui_status {}` -> running or not, port, link, game tab, picked mod, game folder, whether it may start the game, jobs.
2. Not running:
   - MCP: `gui_start {port: 47811}` (refused unless env `ARSENAL_ALLOW_LAUNCH=1`).
   - CLI: `node tools/gui/gui.js --port 47811` (no `--port` = a free port; the line `gui: http://127.0.0.1:PORT/` names it; `--open` opens the user's browser). Never pass `--allow-launch` or `--remote` unless the user asked.
3. Game tab: `as64` (default) | `mowas2` | `goh`. MCP: `game` on `gui_call`. Raw HTTP: header `x-arsenal-game`, or `gid` in query / body; GoH folder: header `x-arsenal-goh` (URI-encoded) or `goh`.
4. Mod: routes take `mod` = full folder path (query for GET, body for POST); `gui_call` sends the picked mod by default. None picked -> ask the user for the folder. Never take one from `/api/mods` by guess.
5. Find the page:
   - by word: `gui_pages {word: "armour"}` (names and intros); one page in full: `gui_pages {page: "units"}`.
   - by tab: `pages.md` index -> the one `pages-<tab>.md`.
6. Find the route and its fields: `gui_routes {page: "units"}` or `gui_routes {word: "price"}`; one in full: `gui_routes {route: "POST /api/x/units/change"}`. `partial` in the answer = the scan missed fields: read the handler in `tools/gui/ext/<id>/`.
7. Read routes (GET, and POST marked no-write): `gui_call {route: "POST /api/x/units/search", body: {q: "tiger"}, game: "as64"}`.

## Per game
- AS64 and MoW:AS2 share one install folder and one profile; GoH has its own install. The game folder is a window setting (Settings page): do not change it unless asked.
- Every tab and page exists in all three game tabs; only `goh` (GoH unit) is GoH only. A page a game cannot run shows "Not available in <game>: <reason>".
- Pages marked Advanced (`files`, `pro`, `docs/project`) show only with Advanced on (Tools & Settings > Settings).

## What goes wrong
- two GUIs on two ports: `gui_status` finds the one in `%LOCALAPPDATA%\ARSENAL\gui.json`; pass `port` to reach the other.
- a call without `game` goes to the page's current tab, which the user may have switched: always pass `game`.
- wrong mod: the header pill shows only the last folder name; the full path is in `gui_status`.
- no page for the task: use the CLI column of the page file, or `mow_tools {find: "<words>"}` on the `arsenal` server.

## Check
`gui_status` answers with the port and the mod you expect; `gui_pages {page}` names tab > sub-tab for the page you will send the user to.
