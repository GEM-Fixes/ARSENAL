#!/bin/sh
# lngsplit regression (fixture mod + fixture vanilla in test/tmp, cases in truth.md); last line PASS on success
# Author: Imperator_Aug (ARSENAL, ia-29d5cd0f)
d=$(dirname "$0")
node "$d/test.js"
