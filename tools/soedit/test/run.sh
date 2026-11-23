#!/bin/sh
# soedit tests: synthetic game + mod in a temp dir (mkfixture.js); no window, no build. last line PASS on success.
# Author: Imperator_Aug (ARSENAL, ia-36409114)
cd "$(dirname "$0")" || exit 1
node test.js || { echo FAIL; exit 1; }
node install.test.js || { echo FAIL; exit 1; }
node exe.test.js || { echo FAIL; exit 1; }
node view.test.js || { echo FAIL; exit 1; }
node ../ops/test/anim.test.js || { echo FAIL; exit 1; }
node ../ops/test/ply.test.js || { echo FAIL; exit 1; }
echo PASS
