#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-1c2a96f7)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../overdiff.js fixture/game/mods/m > out.txt
cat out.txt
grep -v '^#' truth.md | sed 's/^info: //; s/: / /' | sort > want.txt
grep -v 'findings$\|^by code\| files$' out.txt | sed 's/^info: //' | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
(sh ../../binhdr/test/rcwire.sh node ../overdiff.js fixture/game/mods/m) || exit 1
node exe-test.js > /dev/null || { node exe-test.js | grep -v '^OK '; echo "FAIL: --exe (game parity)"; exit 1; }
echo PASS
