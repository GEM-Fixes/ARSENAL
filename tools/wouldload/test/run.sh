#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-02d0c417)
cd "$(dirname "$0")"
node mkfixture.js >/dev/null || { echo "FAIL: mkfixture"; exit 1; }
node check.js || { echo "FAIL: see above"; exit 1; }
node reach.test.js || { echo "FAIL: reach.test.js"; exit 1; }
rm -rf fx
echo PASS
