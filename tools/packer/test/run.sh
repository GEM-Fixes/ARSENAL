#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-bb2f37f4)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../packer.js fixture/mod -q > out.txt
cat out.txt
# truth lines "rel: CODE" / "rel:line: CODE" -> compare "rel[:line] CODE"
grep -v '^#' truth.md | sed 's/: / /' | sort > want.txt
grep -v 'findings$\|^by code' out.txt | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
# default writes nothing; --out writes paks that round-trip; game-install --out refused
rm -rf fixture/out
node ../packer.js fixture/mod -q > /dev/null
[ ! -e fixture/out ] || { echo "FAIL: dry run wrote"; exit 1; }
node ../packer.js fixture/mod --out fixture/out > out2.txt || { echo "FAIL: pack"; exit 1; }
grep -q 'PACK_ROUNDTRIP' out2.txt && { echo "FAIL: roundtrip"; exit 1; }
node check.js || exit 1
g=$(node guard.js) || { echo "$g"; echo "FAIL: GoH guard (guard.js)"; exit 1; }
g=$(node goh.js) || { echo "$g"; echo "FAIL: GoH mod (goh.js)"; exit 1; }
g=$(node speed.js) || { echo "$g"; echo "FAIL: speed layout (speed.js)"; exit 1; }
echo PASS
