#!/bin/sh
# wpn test: GoH weapon to AS2 weapon table, swap or import, seeded cases
# Author: Imperator_Aug (ARSENAL, ia-e844ad1d)
cd "$(dirname "$0")/.."
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node test.js > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
echo PASS
