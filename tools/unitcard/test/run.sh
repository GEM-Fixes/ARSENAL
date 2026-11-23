#!/bin/sh
# unitcard: seeded test on a fixture game and mod made by the test (no vanilla art). Scratch: $UC_TMP, else the OS temp.
# Author: Imperator_Aug (ARSENAL, ia-8972de5a)
cd "$(dirname "$0")" || exit 1
node test.js || { echo FAIL; exit 1; }
node render.test.js || { echo FAIL; exit 1; }
echo PASS
