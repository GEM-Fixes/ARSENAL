#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-47098b43)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node check.js > out.txt
cat out.txt
grep -v '^#' truth.md | sort > want.txt
grep -v 'ASSERT' out.txt | sort > got.txt
grep -q ASSERT out.txt && { echo "FAIL: assertions"; exit 1; }
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
node exe-test.js > exe.out || { grep -v '^OK ' exe.out; echo "FAIL: --exe / GoH (game parity)"; exit 1; }
echo PASS
