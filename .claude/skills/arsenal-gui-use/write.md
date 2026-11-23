# arsenal-gui-use: call a route that changes files
When: any `gui_call` to a route marked as writing; "do it for me in the GUI".

## Hard rules
- game installs and vanilla data are read-only; writes go only into the mod folder the user named; GoH mods only outside the GoH install.
- show the preview's diff or plan to the user before the write unless they already approved that exact change.

## Steps
1. Read the route: `gui_routes {route: "POST /api/x/units/change"}` -> body fields and the write class.
2. Preview: `gui_call {route: "POST /api/x/units/change", body: {...}, game: "as64"}` (no `write`). The answer is the plan: files, old and new values.
3. Write: the SAME body again with `write: true`, and `confirm_write: true` on `gui_call`. The page refuses a Write whose body differs from the last clean preview (`units.previewFirst`).
4. Say what was written (the answer names the files) and how to undo.
5. The window follows your write only on its next refresh: tell the user to press the page's refresh, reopen the card, or change page and back.

## Marks in the page files (`pages-<tab>.md`, generated block)
| mark | meaning |
|---|---|
| `+write` / `+apply` / `+confirm` | previews unless that body field is true |
| `+dry` | WRITES unless `dry: true` |
| `!` | always writes; its preview is another route (`bots/stages/preview` then `stages/write`, `missions/sp/preview` then `sp/write`, `balance/prices/plan` then `prices/apply`) |
| `^` | starts the game: refused unless the window was started with `--allow-launch` or the user switched it on |
| `#` | refused |
| `?` | unknown to the scan: read `tools/gui/ext/<id>/` before calling |

## Contract commands
`POST /api/run {cmd, input}` runs one (`GET /api/commands` lists the fields). Preview forms: `fix` with `mode: "plan"`, `upgrade` / `gen` with `plan: true`, `install` / `play` with `dry: true`. `install` writes into the game's `mods/` folder: ask first.

## Undo
Most write routes have one: `bots/undo`, `files/restore`, `balance/prices/undo`, `missions/sp/undo`, `mapviz/previews/undo`. `check` > guided fix writes a patch folder, never the source mod.

## Per game
- GoH tab: writes must land outside the GoH install; a route that cannot serve GoH answers `na` with the reason.
- MoW:AS2 tab: same routes as AS64; launch routes refuse a live run there.

## What goes wrong
- `units.previewFirst`: the write body differs from the preview. Send the preview again, then the same body with `write: true`.
- nothing changed on screen: the page has not refreshed.
- wrote through `files/save` what a page route could do: no preview, no undo list. Use the page route.

## Check
The answer lists the files; `GET /api/x/files/which` or the page shows the new value; then in game (`mow-mod-test`).
