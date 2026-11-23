#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-71aa3fcd)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../fxlint.js fixture/mod -q > out.txt
cat out.txt
grep -v '^#' truth.md | sed 's/: / /' | sort > want.txt
grep -v 'findings$\|^by code\| files$' out.txt | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
sh ../../binhdr/test/rcwire.sh node ../fxlint.js fixture/mod || exit 1
node fmtcheck.js ../fxlint.js THUNDER_NO_SOUND fixture/mod || exit 1
# game parity: --exe as64|mowas_2|goh and the GoH action list on made-up installs (temp dir, removed after)
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT
node exe.js "$W" || exit 1
echo PASS
