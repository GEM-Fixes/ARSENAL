# arsenal-gui-use: no MCP server, raw HTTP
When: the `arsenal-gui` server is not connected but a GUI runs (or can be started with `node tools/gui/gui.js --port 47811`).

## Steps
1. Port: 47811 by contract; else the `gui:` line the server printed, or `%LOCALAPPDATA%\ARSENAL\gui.json` (`port`, `pid`; it also holds a session token: never print or send it).
2. GET: `curl -s "http://127.0.0.1:PORT/api/x/units/status?mod=<urlencoded path>&gid=as64"`.
3. POST: `curl -s -H "content-type: application/json" -d @body.json http://127.0.0.1:PORT/api/x/units/search` (body.json in the scratch folder).
4. Game: header `x-arsenal-game: as64|mowas2|goh` or `gid` in query / body. GoH folder: header `x-arsenal-goh` (URI-encoded) or `goh`.
5. Routes and fields: `tools/mcp/gui/registry.json` (`routes[].body`, `.query`, `.writes`; grep the path, do not read the file whole), or the ext's `tools/gui/ext/<id>/index.js` header.
6. Jobs: `GET /api/jobs`, stop `POST /api/cancel {id}`. Contract commands: `GET /api/commands`, run `POST /api/run {cmd, input}`.
7. Writes: same preview-then-write rule as with MCP: send the body without `write`, show the plan, send it again with `write: true`.

## No GUI at all
The CLI column of the page file (`node tools/<t>/<t>.js --help`; front door `node tools/as2/as2.js`).

## Per game
Same routes for all three; a route that cannot serve a game answers `na` and the reason.

## What goes wrong
- 415: POST without `content-type: application/json`.
- 403: a foreign Host or Origin; use `127.0.0.1:PORT` or `localhost:PORT`.
- body over 8 MB is refused.
- the session token in `gui.json`: never print it, never send it anywhere.

## Check
`curl -s http://127.0.0.1:PORT/api/health` answers; the write answer names the files.
