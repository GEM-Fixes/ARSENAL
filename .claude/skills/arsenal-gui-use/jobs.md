# arsenal-gui-use: long jobs, the job list, cancel
When: a call takes long, "what is running", "stop it", a route answers `pending` / `running` / `queued`.

## Steps
1. `gui_jobs {}` -> jobs running in the GUI and calls started from here: `{id, kind: run|req|bg, what, page, game, state, stage, done, total, canCancel, writes}` (raw: `GET /api/jobs`).
2. A `gui_call` that outlives `waitMs` comes back with a job id: `gui_jobs {id}` gives its state and, once ended, its answer.
3. Background builds (`bg`): the route answers at once, then poll its `/status` or `/progress` route (those never show as jobs), not the heavy route again. Examples: `maps/list`, `testplan/plan` + `testplan/status`, `prep/run` + `prep/state`, `guides/update/start` + `update/progress`, `maps/clone` + `maps/clone/status`.
4. Stop: `gui_jobs {id, stop: true}` (raw `POST /api/cancel {id}`). A job with `writes: true` asks twice on the page: ask the user before you stop one.

## What the user sees
A request slower than 0.6 s shows in the footer job button (newest job, seconds or progress, `+N`); the list above it has one row per job with Cancel.

## Answers that are not errors
- 499 `job.cancelled` ("Stopped"): the request was stopped.
- 409 `job.e.nostop`: this job cannot be stopped; wait.
- `pending` / `running` / `queued`: poll the status route.

## Per game
Same in all three tabs. Launch jobs (play, probe, prove, edrun, `bots/botmatch/start`) run on AS64 only and need the window's launch switch.

## What goes wrong
- every row's seconds stop at once: the server is one thread and a route is blocking. Wait; do not fire more calls.
- polling the heavy route instead of its status route starts the work again.
- a job list that never empties after a server restart: the page shows "Reconnecting"; `gui_status` again.

## Check
`gui_jobs {}` is empty (or only what the user started) before you report done.
