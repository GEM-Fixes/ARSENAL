#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-975bf14a)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../misdiff.js fixture/a fixture/b > out.txt
cat out.txt
# identical folders -> no change lines
node ../misdiff.js fixture/a fixture/a > same.txt
grep -q 'MIS_DIFF' same.txt && { echo "FAIL: identical dirs produced changes"; exit 1; }
# json format parses
node ../misdiff.js fixture/a fixture/b --format json | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.exit(j.info.length>10&&j.total===4?0:1)' || { echo "FAIL: json"; exit 1; }
grep -v '^#' truth.md | sed 's/: / /' | sort > want.txt
grep -v 'findings$\|^by code\|^[0-9]* files differ' out.txt | sed 's/^info: //' | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: output differs from truth.md"; exit 1; }
node exe.test.js | tail -1 | grep -q "^PASS" || { node exe.test.js; echo "FAIL: exe.test.js (--exe, --mod-dir)"; exit 1; }
echo PASS
