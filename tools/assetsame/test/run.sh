#!/bin/sh
# assetsame test: fixtures built in code, no game data.
# Author: Imperator_Aug (ARSENAL, ia-0a55388c)
cd "$(dirname "$0")/../../.."
node tools/assetsame/test.js || exit 1
echo PASS
