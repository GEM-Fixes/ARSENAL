#!/bin/sh
# lnglayout regression (fixture game + clean and seeded split mods in test/tmp, cases in truth.md); last line PASS on success
# Author: Imperator_Aug (ARSENAL, ia-6dfab2bb)
d=$(dirname "$0")
node "$d/test.js"
