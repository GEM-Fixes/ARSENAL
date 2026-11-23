#!/bin/sh
# portcensus test: stub steps, no GoH, no game. Prints PASS or FAIL.
# Author: Imperator_Aug (ARSENAL, ia-ff30b74e)
cd "$(dirname "$0")/../../.." || exit 1
if node tools/portcensus/test/check.js; then echo PASS; else echo FAIL; exit 1; fi
