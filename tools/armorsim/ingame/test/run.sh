#!/bin/sh
# armorsim/ingame test: shottable plan -> fake game.log -> compare on a synthetic unit tree (temp dir or $ARMORSIM_SCRATCH)
# Author: Imperator_Aug (ARSENAL, ia-90274f20)
cd "$(dirname "$0")"
node test.js
st=$?
if [ $st -ne 0 ]; then echo FAIL; exit 1; fi
echo PASS
