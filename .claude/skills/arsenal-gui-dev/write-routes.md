# arsenal-gui-dev: a route that writes into a mod
When: a route creates, changes or deletes files.

## Hard rules
- writes go only into the mod the user picked: pass `lib/writeguard`. Never the game install, vanilla, paks, Workshop downloads or the GoH install.
- text data CRLF; string values UTF-8, identifiers ASCII; vanilla comments may be cp1251 (keep bytes).

## Preview then write
- a write route answers a plan unless `body.write` is true: same body, same code path (`newCtx(..., !body.write)` style).
- the page's Write refuses a body that differs from the last clean preview (`units.previewFirst`): the page uses the `flow(url, body, box, after, o)` button pair.
- before writing: `ctx.job.writes = true` (the job row then asks twice before Cancel).
- after writing: `ctx.modtree.touch(mod)` and drop memory memos (PERF R3), so caches and Prepare see the change.
- return what was written (file list) and an undo where the page offers one.

## Steps
1. Build the plan from the body (no file touched).
2. `if (!body.write) return plan`.
3. Guard every target path, set `ctx.job.writes`, write, `ctx.modtree.touch(mod)`.
4. Answer `{written: [...], undo: ...}`.
5. Client: `flow(...)`, then refresh the cards the write changes.

## Per game
- GoH: the mod must sit outside the GoH install; the guard looks the GoH folder up from `ctx.gohDir()`.
- a write a game cannot take (for example armour simulator edits on GoH): `na` on the card, the route answers `na`.

## What goes wrong
- preview and write take different code paths: the preview lies. One path, one flag.
- no `touch`: the page shows old data, Prepare says ready for stale data.
- write flag named otherwise (`apply`, `confirm`, `dry`): the registry marks it, but prefer `write` for new routes; a `dry` flag that writes by default is a trap.
- LF written into game text data: keep CRLF.

## Check
The ext's `test.js` (plan = write result, guard refuses the install); one real write on a scratch mod in a scratch folder (env ARSENAL_TMP); then verified in game + game.log read, or tagged [T] with a row: `node tools/notes/notes.js add <area> "- what | where | how to check"`.
