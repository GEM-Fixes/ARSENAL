#!/bin/sh
# misgen: fixture map from mapgen, mission written and read back, seeded defects caught. No install, no game.
# Author: Imperator_Aug (ARSENAL, ia-672628f9)
cd "$(dirname "$0")/../../.." || exit 1
node tools/misgen/test/test.js
