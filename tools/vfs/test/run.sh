#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-0e3a768f)
cd "$(dirname "$0")"
node mkfixture.js || { echo FAIL: mkfixture; exit 1; }
node check.js || { echo FAIL; exit 1; }
node listing.js || { echo FAIL: listing; exit 1; }
node ahead.js || { echo FAIL: ahead; exit 1; }
echo PASS
