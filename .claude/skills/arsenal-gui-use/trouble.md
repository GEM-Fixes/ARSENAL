# arsenal-gui-use: the GUI refuses, hangs or says not available
When: a call fails, the window shows an error, "the GUI does nothing".

## First
`gui_status {}` (is it up, which port, which game and mod) and `gui_jobs {}` (is something blocking).

## Symptom -> cause -> next step
| sees | cause | do |
|---|---|---|
| `gui_status`: not running | no server, or another port | `gui_start`, or `node tools/gui/gui.js --port 47811`; pass `port` |
| `gui_start` refused | env `ARSENAL_ALLOW_LAUNCH=1` not set for the MCP server | the user starts it by hand |
| 403 | foreign Host / Origin, or a LAN Remote device calling a route not on the allow list | call from this PC with `127.0.0.1:PORT` |
| 415 | POST without JSON content type | send `content-type: application/json` |
| 409 on a run | another run holds the lock, or `job.e.nostop` on cancel | wait for the job; `gui_jobs` |
| 499 "Stopped" | the request was cancelled | not an error; run again if wanted |
| "Not available in <game>" | the page or card cannot run for that game tab | read the reason; use the AS64 tab or the CLI column |
| launch refused | the window may not start the game | the user starts it with `--allow-launch` or the Settings switch; do not switch it yourself |
| write refused, `units.previewFirst` | body differs from the last preview | preview again, then the same body with `write: true` |
| write refused: path outside the mod | write guard: game install, vanilla, pak, Workshop item or GoH install | pick a mod folder outside the install |
| page stays empty | no mod picked, or first show still loading (job row) | pick the mod on Mods; wait for the job |
| every job's seconds stop | one route blocks the single server thread | wait; no more calls |
| old numbers after a write | page not refreshed | refresh the page / reopen the card |
| "Reconnecting" | server restarted (`--dev` after a code change, or it died) | wait; if it stays, read the server's console |
| Advanced page missing | Advanced is off | Tools & Settings > Settings > Advanced |
| raw key on screen (`units.x.y`) | a missing string: a GUI bug | report it (skill `arsenal-gui-dev`) |

## Per game
- GoH tab with no GoH folder set: pages say so; the folder is set on Settings (the user's choice).
- MoW:AS2 and GoH: Play and live test runs are not available; `dry` works.

## Check
The same call answers 200 with the fields `gui_routes` named; `gui_jobs {}` is empty.
