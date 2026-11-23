#!/bin/sh
# gui: guided fix (test-wizard.js) + lib/explain cards; back end contract against the CLIs (test.js) and the page + routes + cancel/timeout/409/prove argv (test-gui2.js). No game launch.
# Author: Imperator_Aug (ARSENAL, ia-c9213349)
cd "$(dirname "$0")"
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
T=$(mktemp -d)
node test.js "$T" > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-gui2.js "$T/g2" > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-settings.js "$T/set" > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-pages.js "$T/pg" > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-lang.js "$T/lang" > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-ext.js "$T/ext" > "$G/.got" 2>&1 || { tail -n 20 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-wizard.js "$T/wz" > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-limit.js "$T/lim" > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-theme.js > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-header.js > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }   # the header: game folder warning + Settings card, mod pill, Quick Guided Task fold, row lines
node test-ask.js > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-searchkit.js > "$G/.got" 2>&1 || { tail -n 20 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }   # searchKit: browse, indexed search and history on every search box (README.md)
node test-jumps.js > "$G/.got" 2>&1 || { tail -n 20 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }   # JUMPS: the jump back bar (page and position jumps, back in order, README.md)
node test-lazy.js > "$G/.got" 2>&1 || { tail -n 20 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }   # lazy pages: a page asks the server at its first show, a mod or game change refreshes the page on screen only
node test-blocks.js > "$G/.got" 2>&1 || { tail -n 30 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-mcp.js > "$G/.got" 2>&1 || { tail -n 34 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }   # MCP: tools/mcp/gui/registry.json matches the routes and pages (stale -> node tools/mcp/gui.js --gen)
node test-remote.js "$T/remote" > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-wire.js "$T/wire" > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-games.js "$T/games" > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node test-live.js "$T/live" > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
for t in ../ext/task/recipes/*.test.js; do [ -f "$t" ] || continue; node "$t" "$T/task-$(basename "$t" .test.js)" > "$G/.got" 2>&1 || { echo "$t"; tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }; done   # guided task recipes (ext/task/README.md Tests)
for t in ../ext/task/lib/*.test.js; do [ -f "$t" ] || continue; node "$t" "$T/tasklib-$(basename "$t" .test.js)" > "$G/.got" 2>&1 || { echo "$t"; tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }; done   # task core libraries (lib/game.test.js: the task's game)
node test-tabs.js "$T/tabs" > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }   # game parity: groups.js tabs of the three games, na keys, contract fix fields, writeguard GoH lookup
node ../../lib/test/explain.test.js > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
node ../../lib/test/pakpatch.test.js "$T/pakpatch" > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; rm -rf "$T"; echo FAIL; exit 1; }
rm -f "$G/.got"; rm -rf "$T"
echo PASS
