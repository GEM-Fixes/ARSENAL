#!/bin/sh
# pricecalc regression: fixture mod + sheet + model built by test.js (scratch dir), defects in truth.md; last line PASS on success
# Author: Imperator_Aug (ARSENAL, ia-5f3953c2)
d=$(dirname "$0")
# lib/sdlset memo and packed walk, and pricecalc's read-only memo phase (same session with and without it)
node "$d/memo.test.js" || { echo FAIL; exit 1; }
node "$d/test.js" || { echo FAIL; exit 1; }
node "$d/goh.test.js" || { echo FAIL; exit 1; }
