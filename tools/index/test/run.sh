#!/bin/sh
# tools/index test: the router line checker (check.js) on a made-up router, then on the real tools/index + tools/INDEX.md
# Author: Imperator_Aug (ARSENAL, ia-e5bb6cb6)
cd "$(dirname "$0")/../../.." || exit 1
node tools/index/test/test.js || exit 1
