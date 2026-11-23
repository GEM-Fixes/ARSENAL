#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-27065908)
cd "$(dirname "$0")"
node check.js || { echo "FAIL: see above"; exit 1; }
echo PASS
