#!/bin/sh
# covlint: 13 check linters each catch one seeded fault (vanilla paks, no game launch; about 60 s)
# Author: Imperator_Aug (ARSENAL, ia-890703af)
cd "$(dirname "$0")/../../.."
T=$(mktemp -d)
node tools/covlint/covlint.js --out "$T" > "$T/.got" 2>&1
r=$?
tail -n 3 "$T/.got" | cut -c1-120
rm -rf "$T"
[ $r -eq 0 ] && echo PASS || { echo FAIL; exit 1; }
