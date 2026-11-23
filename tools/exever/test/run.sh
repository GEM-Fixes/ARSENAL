#!/bin/sh
# seeded: known exe passes, changed bytes and unknown Steam build are reported
# Author: Imperator_Aug (ARSENAL, ia-97ca8067)
cd "$(dirname "$0")"
node check.js || { echo "FAIL: see above"; exit 1; }
echo PASS
