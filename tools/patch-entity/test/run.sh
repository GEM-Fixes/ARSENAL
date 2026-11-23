#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-15434a0c)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node check.js > out.txt
cat out.txt
grep -v '^#' truth.md | sort > want.txt
grep -v 'ASSERT' out.txt | sort > got.txt
grep -q ASSERT out.txt && { echo "FAIL: assertions"; exit 1; }
node multi-test.js || { echo "FAIL: multi-value set"; exit 1; }
node fixmix-test.js || { echo "FAIL: ambiguous path / root add"; exit 1; }
node shadow-test.js || { echo "FAIL: shadowed file effective compare"; exit 1; }
node add-test.js >/dev/null || { node add-test.js | grep -v '^OK '; echo "FAIL: add on existing names / append / macro-set key"; exit 1; }
node exe-test.js > /dev/null || { node exe-test.js | grep -v '^OK '; echo "FAIL: --exe (game parity)"; exit 1; }
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
echo PASS
