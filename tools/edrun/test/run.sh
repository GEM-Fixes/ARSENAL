#!/bin/sh
# edrun seeded test, no game: mission text, log parsing, false-kill case, usage codes.
# Author: Imperator_Aug (ARSENAL, ia-4c584630)
cd "$(dirname "$0")"
node check.js || { echo FAIL; exit 1; }
node pack-test.js || { echo FAIL; exit 1; }
node cov-test.js || { echo FAIL; exit 1; }
node edrun3-test.js || { echo FAIL; exit 1; }
node silent1f-test.js || { echo FAIL; exit 1; }
node env-test.js >/dev/null || { echo FAIL; exit 1; }
node close-test.js >/dev/null || { echo FAIL; exit 1; }
node test2.js >/dev/null || { echo FAIL; exit 1; }
node retry-test.js >/dev/null || { echo FAIL; exit 1; }
node mindist.js >/dev/null || { echo FAIL; exit 1; }
node hold-test.js >/dev/null || { echo FAIL; exit 1; }
node share-test.js >/dev/null || { echo FAIL share-test; exit 1; }
node ff-test.js >/dev/null || { echo FAIL ff-test; exit 1; }
node killproof-test.js >/dev/null || { echo FAIL killproof-test; exit 1; }
node mgproof-test.js >/dev/null || { echo FAIL mgproof-test; exit 1; }
node revharness-test.js >/dev/null 2>&1 || { echo FAIL revharness-test; exit 1; }
node r1-test.js >/dev/null 2>&1 || { echo FAIL r1-test; exit 1; }
node terrain-test.js >/dev/null || { echo FAIL terrain-test; exit 1; }
node as64plus-test.js >/dev/null || { echo FAIL as64plus-test; exit 1; }
node parity-test.js >/dev/null 2>&1 || { node parity-test.js 2>/dev/null | grep FAIL; echo FAIL parity-test; exit 1; }
node ../edrun.js --pairs nosuch.json >/dev/null 2>&1
[ $? -eq 2 ] || { echo "FAIL: missing pairs file should exit 2"; exit 1; }
node ../edrun.js --pairs pairs.json --inst 0 >/dev/null 2>&1
[ $? -eq 2 ] || { echo "FAIL: --inst 0 must be refused"; exit 1; }
node ../edrun.js --pairs pairs.json --inst 2 --dry >/dev/null 2>&1
[ $? -eq 0 ] || { echo "FAIL: --inst 2 --dry should pass"; exit 1; }
node ../edrun.js --pairs pairs.json --secs 900 --dry >/dev/null 2>&1
[ $? -eq 2 ] || { echo "FAIL: over-long --secs should exit 2"; exit 1; }
node ../edrun.js --pairs pairs.json --map 1v1_reloading_point --dry >/dev/null 2>&1
[ $? -eq 2 ] || { echo "FAIL: --map without --game should exit 2"; exit 1; }
GD="$(node -e "process.stdout.write(require('../../lib/gamedir').resolve().dir||'')")"
if [ -n "$GD" ] && [ -f "$GD/resource/map.pak" ]; then
  node ../edrun.js --game "$GD" --pairs pairs.json --map no_such_map --dry >/dev/null 2>&1
  [ $? -eq 3 ] || { echo "FAIL: unknown --map should exit 3 (map refuses)"; exit 1; }
  node ../edrun.js --game "$GD" --pairs pairs.json --map 1v1_reloading_point --dry --out "${TMPDIR:-/tmp}/edrun-map-test" >/dev/null 2>&1
  [ $? -eq 0 ] || { echo "FAIL: --map 1v1_reloading_point --dry should pass"; exit 1; }
fi
node runlist-test.js > /dev/null || { echo "FAIL: runlist"; exit 1; }
node fixedrun-test.js > /dev/null || { echo "FAIL: fixedrun"; exit 1; }
node speedb3-test.js 2>/dev/null || { echo "FAIL: speedb3"; exit 1; }
node covc06-test.js 2>/dev/null || { echo "FAIL: covc06"; exit 1; }
echo PASS
