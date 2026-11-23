#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-b3c303cd)
cd "$(dirname "$0")"
node check.js || exit 1
# per-row regression for coverage rows settled [I] by shape or copy-only (B4, tools/score/itests.json)
node rows.js > /dev/null || exit 1
echo PASS
