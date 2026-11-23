#!/bin/sh
# nativepass tests: engine cases, then test/rules/*.json (or only <name>.json). Last line PASS or FAIL.
#   sh tools/nativepass/test/run.sh [name]
# Author: Imperator_Aug (ARSENAL, ia-c8eba484)
cd "$(dirname "$0")/../../.." || exit 1
node tools/nativepass/test/engine/run.js "$@"
