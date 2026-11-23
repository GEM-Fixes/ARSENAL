#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-736567de)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../lngstd.js fixture/mod --out fixture/out --report fixture/report.tsv --spelling fixture/spelling.tsv -q > out.txt || { cat out.txt; echo "FAIL: tool exit"; exit 1; }
cat out.txt
grep -v '^#' truth.md | sed 's/: / /' | sort > want.txt
grep -E '^[^ ]+:[0-9]+: [A-Z_]+ ' out.txt | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
node check.js || { echo "FAIL: check.js"; exit 1; }
echo PASS
