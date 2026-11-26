#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-e17e1733)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture built here, never in test/fixture
export ARSENAL_CACHE="${ARSENAL_CACHE:-$W/cache}"   # binhdr's header cache: never the user's
node mkfixture.js || { echo FAIL: mkfixture; exit 1; }
node check.js || { echo FAIL; exit 1; }
node game.js || { echo FAIL: game; exit 1; }
node sparse.js || { echo FAIL: sparse; exit 1; }
node cache.js || { echo FAIL: cache; exit 1; }
(sh ../../binhdr/test/rcwire.sh node ../binhdr.js "$W/fixture/game" --mods m1 --strict) || exit 1
echo PASS
