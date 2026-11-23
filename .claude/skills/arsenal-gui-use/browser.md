# arsenal-gui-use: drive the page in a browser
When: no MCP server and the user wants to watch, or a check needs what is drawn on screen.

## Prefer routes over clicks
`window.__as2in.api(url, body)` sends the game headers and the job id like the page does. Click only when the drawn result matters.

## Hooks (page.js)
- `window.__as2gui` = page state `S` (`S.cur` page id, `S.mod`, `S.view`, `S.screens`, `S.health`), set only when the page finished building: wait for it first.
- `window.__as2in`: `show(id, view)`, `setMod(path)`, `refreshAll()`, `api`, `streamRun(cmd, input, onEvent)`, `gameFor(id)`, `GAMES`, `NA`.
- `window.as2Link('page:units/tune')`, `window.JOBS.list()` / `.cancel(id)` / `.sync()`, `window.JUMPS.back()`, `window.IDE`, `window.VIEW`, `window.TASK`.

## Steps
1. Wait for `window.__as2gui`.
2. Game tab: click `#games button[data-game="goh"]` (no hook switches game by id).
3. `__as2in.show('units', 'make')`, then read: a page fetches only at first show.
4. Find controls by block id: `[data-blk="<id>"]` inside the page's section. Search boxes `span.sk[data-sk="<history key>"]`; run buttons `[data-run]`; job rows `[data-job]`, `button[data-jcancel]`.
5. After a POST wait on `JOBS.list()` being empty, not on a fixed sleep (a POST becomes a job after 0.6 s).

## What goes wrong
- text or position as selector: text is translated (4 languages) and the user may have rearranged blocks. Use block ids.
- live reload cuts scripts: with `gui.js --dev` every code or string change reloads every open page; a running script dies, typed text is lost. Keep each script short and idempotent, re-check `window.__as2gui` after each step.
- hidden pane stalls frames: a tab that is not shown gets no animation frame, so lists, results and job rows are not drawn and polls stop. Front the tab before reading the DOM, or read the answer of `__as2in.api`. Screenshots of a hidden pane are stale.
- server restart shows "Reconnecting": wait, then start the step again.

## Do not
Type into the game-folder buttons (`[data-gamechg]`) or Settings unless the user asked: they are the user's window settings, kept on the server and shared by every window.

## Per game
Same hooks in all three tabs; `S.gameId` says which is on.

## Check
`S.cur` is the page you meant; the answer of `__as2in.api` matches what is drawn.
