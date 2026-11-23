#!/bin/sh
# preloadsweep regression (cases in truth.md). fake install + fake logs, no game needed
# Author: Imperator_Aug (ARSENAL, ia-a42bd2f9)
d=$(cd "$(dirname "$0")" && pwd)
node "$d/mkfixture.js" >/dev/null || { echo "FAIL: fixture"; exit 1; }
node "$d/cases.js"
