# arsenal-gui-use: Quick Guided Task
When: the user wants to be led step by step (new unit, skin, flag, bots buy a unit, text, fix a mod, release), or asks what the row above the tabs is.

## What it is
The row above the tabs. A task = a recipe: a few questions, a plan (what will be written and where), a write into the picked mod, a check. Guide chapter p17 lists every task: `mow_guide {chapter: "p17"}`.

## Steps (MCP)
1. List: `gui_call {route: "GET /api/x/task/catalogue", game: "as64"}`.
2. One recipe and its questions: `GET /api/x/task/recipe` (fields: `gui_routes {route: "GET /api/x/task/recipe"}`).
3. Plan: `POST /api/x/task/plan` with the answers -> files and changes. Show it to the user.
4. Write: `POST /api/x/task/write` (marked `?`: read `gui_routes {route: "POST /api/x/task/write"}` first; it writes into the picked mod).
5. Check: `POST /api/x/task/check`.
Drafts (`task/drafts`, `task/draft/save`) keep half-filled answers.

## Steps (user)
Open the Quick Guided Task row > pick a task > answer > Preview > Write > Check. Each task names the page that does the same job in full.

## CLI
No single CLI; each recipe runs the tools of its page (`node tools/gen/gen.js`, `node tools/botrecipe/botrecipe.js`, ...). Find them: `mow_tools {find: "<words>"}`.

## Per game
The row is on all three game tabs; a recipe a game cannot run says so. The GoH unit recipes (`task/r/gohunit/*`) need a GoH install folder set in the window.

## What goes wrong
- no mod picked: the task cannot write; pick one on Mods.
- the plan names a file in the game folder: stop, that is a bug; writes go to the mod only.
- answers lost on live reload (`--dev`): use drafts.

## Check
`task/check` passes; then the change in game (`mow-mod-test`).
