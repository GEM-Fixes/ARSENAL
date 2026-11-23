#!/bin/sh
# workshop tests: fixture game folders in a temp dir; nothing started, no real game folder touched. last line PASS on success.
# Author: Imperator_Aug (ARSENAL, ia-272613f3)
cd "$(dirname "$0")" || exit 1
node test.js || { echo FAIL; exit 1; }
echo PASS
