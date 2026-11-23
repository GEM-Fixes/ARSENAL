#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-145f95e3)
cd "$(dirname "$0")"
node mkfixture.js >/dev/null || exit 1
node check.js || { echo "FAIL: see above"; exit 1; }
node pak.test.js || { echo "FAIL: pak"; exit 1; }
node units.test.js || { echo "FAIL: units"; exit 1; }
echo PASS
