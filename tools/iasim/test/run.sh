#!/bin/sh
# iasim test: the script evaluator is tested together with the engine stage on the synthetic tree of tools/armorsim/test/after.test.js,
# and its cause tracking (triggers, tag log, blasts) through armorsim effects groups in tools/armorsim/test/groups.test.js
# Author: Imperator_Aug (ARSENAL, ia-3ecb34b7)
cd "$(dirname "$0")"
node ../../armorsim/test/after.test.js > out.txt 2>&1
st=$?
node ../../armorsim/test/groups.test.js >> out.txt 2>&1
st2=$?
cat out.txt
if [ $st -ne 0 ] || [ $st2 -ne 0 ]; then echo FAIL; exit 1; fi
echo PASS
