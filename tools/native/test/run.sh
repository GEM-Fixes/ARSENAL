#!/bin/sh
# native: seed test on a fixture ported def, no game
# Author: Imperator_Aug (ARSENAL, ia-5b69d309)
cd "$(dirname "$0")"
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node test.js > "$G/.got" 2>&1 || { grep FAIL "$G/.got" | head -n 8; tail -n 4 "$G/.got"; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
echo PASS
