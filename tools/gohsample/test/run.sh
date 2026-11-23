#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-6486211a)
cd "$(dirname "$0")"
node mkfixture.js >/dev/null || { echo "FAIL: mkfixture"; exit 1; }
node check.js || { rm -rf fx; echo "FAIL: see above"; exit 1; }
node parity.js || { rm -rf fx; echo "FAIL: parity, see above"; exit 1; }   # game parity: --exe mowas_2 through plan/build/predict/sweep/boot
rm -rf fx
echo PASS
