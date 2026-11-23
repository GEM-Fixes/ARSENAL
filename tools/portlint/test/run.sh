#!/bin/sh
# portlint test: seeded fixture (one defect + clean twin per code) diffed against truth.md, json form parses, output stable
# Author: Imperator_Aug (ARSENAL, ia-1d461e08)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../portlint.js fixture/mod --base fixture/base -q > out.txt
cat out.txt
grep -v '^#' truth.md | sed 's/: / /' | sort > want.txt
grep -v 'findings$\|^by code\| files$' out.txt | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
node ../portlint.js fixture/mod --base fixture/base -q > out2.txt
cmp -s out.txt out2.txt || { echo "FAIL: output not deterministic"; exit 1; }
node ../portlint.js fixture/mod --base fixture/base -q --format json > out.json
node -e "const j=JSON.parse(require('fs').readFileSync('out.json','utf8'));if(j.tool!=='portlint'||j.total!==$(grep -vc '^#' truth.md))process.exit(1)" || { echo "FAIL: json form"; exit 1; }
node exe.js > exe.out 2>&1 || { tail -n 8 exe.out; rm -f exe.out; echo "FAIL: --exe (exe.js)"; exit 1; }
rm -f exe.out
echo PASS
