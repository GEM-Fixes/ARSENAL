#!/bin/sh
# mapgen: fixture map written, read back, seeded breaks caught. No install, no game.
# Author: Imperator_Aug (ARSENAL, ia-e9c344d6)
cd "$(dirname "$0")/../../.." || exit 1
node tools/mapgen/test/test.js
