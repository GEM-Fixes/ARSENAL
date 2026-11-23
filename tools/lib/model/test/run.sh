#!/bin/sh
# lib/model tests: the game variants (goh.test.js, made-up fixtures) and the model suites in tools/lib/test (model-*, picture).
# Last line PASS on success.
# Author: Imperator_Aug (ARSENAL, ia-775bd977)
cd "$(dirname "$0")" || exit 1
st=0
node goh.test.js || st=1
for t in ../../test/model-*.test.js ../../test/picture.test.js; do
  node "$t" > /dev/null 2>&1 || { echo "FAIL $t"; st=1; }
done
if [ $st -ne 0 ]; then echo FAIL; exit 1; fi
echo PASS
