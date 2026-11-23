#!/bin/sh
# seeded two-game fixture: finding lines (file: CODE kind key) must equal truth.md exactly
# Author: Imperator_Aug (ARSENAL, ia-a3cd97da)
d=$(dirname "$0")
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node "$d/mkfixture.js" || { echo FAIL: mkfixture; exit 1; }
node "$d/../portdiff.js" --as2 "$d/fixture/as2" --goh "$d/fixture/goh" --min 1 --no-cache -q | grep -E '^[^=].*: [A-Z0-9_]+ ' | sed 's/ n=[0-9]*$//; s/ x[0-9]*$//; s/ (.* errors)$//' | sort > "$G/.got"
grep -vE '^#' "$d/truth.md" | sort > "$G/.want"
if cmp -s "$G/.got" "$G/.want"; then echo PASS; else diff "$G/.got" "$G/.want"; echo FAIL; fi
rm -f "$G/.got" "$G/.want" "$d/out.txt"
