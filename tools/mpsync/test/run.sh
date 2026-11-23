#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-90973ce4)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../mpsync.js --game fixture/A --export fixture/a.json >/dev/null || exit 1
node ../mpsync.js --game fixture/B --export fixture/b.json >/dev/null || exit 1
node ../mpsync.js --compare fixture/a.json fixture/b.json > out.txt
cat out.txt
grep -v '^#' truth.md | sort > want.txt
grep -E ': MPSYNC_|: WARN_MPSYNC' out.txt | grep -v MPSYNC_TREES | sed 's/^info: //' | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: compare differs from truth.md"; exit 1; }
grep -q 'ResCRC' out.txt || { echo "FAIL: no tree crc line"; exit 1; }
node ../mpsync.js --mod fixture/A/mods/m --game fixture/A > outmod.txt
cat outmod.txt
grep -v '^#' truth_mod.md | sort > want2.txt
grep -E ': MPSYNC_|: WARN_MPSYNC' outmod.txt | sed 's/^info: //' | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got2.txt
diff want2.txt got2.txt || { echo "FAIL: --mod differs"; exit 1; }
node ../mpsync.js --mod fixture/C/mods/en --game fixture/C 2>&1 | grep -q "mod \"en\": 1 files content-CRC" || { echo "FAIL: Enhanced mod not mounted with as64+"; exit 1; }
node ../mpsync.js --mod fixture/A --game fixture/A > outskip.txt 2>&1 || { echo "FAIL: unmounted --mod must exit 0"; cat outskip.txt; exit 1; }
[ "$(grep -c . outskip.txt)" = 1 ] && grep -q '^mpsync: SKIPPED, mod "A" not mounted' outskip.txt || { echo "FAIL: unmounted --mod not one clean skip line"; cat outskip.txt; exit 1; }
(sh ../../binhdr/test/rcwire.sh node ../mpsync.js --compare fixture/a.json fixture/b.json) || exit 1
node unit.js || { echo "FAIL: unit.js"; exit 1; }
node pakcrc-test.js || { echo "FAIL: pakcrc-test.js (pak entry engine CRC)"; exit 1; }
node exe-test.js > /dev/null || { node exe-test.js | grep -v '^OK '; echo "FAIL: --exe (game parity)"; exit 1; }
echo PASS
