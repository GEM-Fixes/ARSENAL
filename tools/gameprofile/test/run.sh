#!/bin/sh
# gameprofile: profiles well-formed, every src resolves, diff/show/wired behave
# Author: Imperator_Aug (ARSENAL, ia-d1fbf3e1)
cd "$(dirname "$0")"
node test.js || { echo "FAIL: see above"; exit 1; }
echo PASS
