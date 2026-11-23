#!/bin/sh
# cardrename regression (fixture game + mod in test/tmp, cases in truth.md); last line PASS on success
# Author: Imperator_Aug (ARSENAL, ia-76475112)
d=$(dirname "$0")
node "$d/test.js"
