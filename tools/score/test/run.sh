#!/bin/sh
# scoreboard test on invented rows, no game
# Author: Imperator_Aug (ARSENAL, ia-5d3ce564)
cd "$(dirname "$0")"
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node test.js > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
node passline.js > "$G/.got" 2>&1 || { tail -n 12 "$G/.got"; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
node runs.js > "$G/.got" 2>&1 || { grep FAIL "$G/.got" | head -n 8; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
node classify.js > "$G/.got" 2>&1 || { grep FAIL "$G/.got" | head -n 8; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
node ttest.js > "$G/.got" 2>&1 || { grep FAIL "$G/.got" | head -n 8; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
node results.js > "$G/.got" 2>&1 || { grep FAIL "$G/.got" | head -n 8; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
node rows.js > "$G/.got" 2>&1 || { grep FAIL "$G/.got" | head -n 8; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
echo PASS
