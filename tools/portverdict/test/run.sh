#!/bin/sh
# portverdict test: prints PASS or FAIL as its last line
# Author: Imperator_Aug (ARSENAL, ia-fdd179d6)
cd "$(dirname "$0")/../../.." || exit 2
node tools/portverdict/test/test.js
