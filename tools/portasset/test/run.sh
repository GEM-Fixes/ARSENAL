#!/bin/sh
# portasset test: seeded bad mod == truth.md, clean twin 0 findings, --all reports the byte-equal vanilla dead ref, json total, same bytes twice
# Author: Imperator_Aug (ARSENAL, ia-68af79db)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../portasset.js fixture/bad --game fixture/game -q > out.txt
cat out.txt
grep -v '^#' truth.md | sed 's/: / /' | sort > want.txt
grep -v 'findings$\|^by code\| files, ' out.txt | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
node ../portasset.js fixture/bad --game fixture/game -q > out2.txt
cmp -s out.txt out2.txt || { echo "FAIL: output not deterministic"; exit 1; }
node ../portasset.js fixture/clean --game fixture/game -q > clean.txt
grep -q '^0 findings$' clean.txt || { cat clean.txt; echo "FAIL: clean twin has findings"; exit 1; }
node ../portasset.js fixture/clean --game fixture/game -q --all > all.txt
grep -q '^resource/entity/van/dead.mtl:2: PORTA_TEXTURE_MISSING ' all.txt || { cat all.txt; echo "FAIL: --all misses the vanilla dead ref"; exit 1; }
grep -q '^1 findings$' all.txt || { cat all.txt; echo "FAIL: --all count"; exit 1; }
node ../portasset.js fixture/bad --game fixture/game --format json > out.json
n=$(grep -vc '^#' truth.md)
grep -qE "\"total\": $n([^0-9]|\$)" out.json || { echo "FAIL: json total != $n"; exit 1; }
node ../portasset.js fixture/bad > /dev/null 2>&1
[ $? -eq 2 ] || { echo "FAIL: missing --game is not a usage error"; exit 1; }
node exe.js > exe.out 2>&1 || { tail -n 8 exe.out; rm -f exe.out; echo "FAIL: --exe (exe.js)"; exit 1; }
rm -f exe.out
echo PASS
