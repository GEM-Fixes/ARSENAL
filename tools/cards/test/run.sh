#!/bin/sh
# cards test: GoH card to AS2 card, dp to hero budget, seeded wrong budgets are caught
# Author: Imperator_Aug (ARSENAL, ia-ca2683ad)
cd "$(dirname "$0")/.."
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node cards.test.js > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
echo PASS
