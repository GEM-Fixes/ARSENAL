#!/bin/sh
# roundtrip test: fixtures -> exact summary (want.json); same run twice = same summary; --type filter; single file
# Author: Imperator_Aug (ARSENAL, ia-502cef3d)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../roundtrip.js fixture -q -o got.json > out.txt
tr -d '\r' < got.json > got.lf
tr -d '\r' < want.json > want.lf
diff want.lf got.lf || { echo "FAIL: summary differs from want.json"; exit 1; }
node ../roundtrip.js fixture -q -o got2.json > out2.txt
cmp got.json got2.json || { echo "FAIL: second run differs"; exit 1; }
node ../roundtrip.js fixture --type def -q -o got3.json > out3.txt
grep -q '"total": 4,' got3.json || { echo "FAIL: --type def should scan 4 files"; exit 1; }
node ../roundtrip.js fixture/a.def -o got4.json > out4.txt
grep -q '^equal   a.def' out4.txt || { echo "FAIL: single file a.def not equal"; exit 1; }
grep -q 'fail BRACES' out.txt || { echo "FAIL: fail lines missing"; exit 1; }
# --exe: a made-up game with as64.exe and as64/core: as64 (and no --exe) mounts as64/core, mowas_2 does not; bogus exits 2
node mkexe.js || exit 1
node ../roundtrip.js --vfs --game fixture-exe -q | grep -q '"total":2,' || { echo "FAIL: no --exe should mount as64/core"; exit 1; }
node ../roundtrip.js --vfs --game fixture-exe --exe as64 -q | grep -q '"total":2,' || { echo "FAIL: --exe as64 should mount as64/core"; exit 1; }
node ../roundtrip.js --vfs --game fixture-exe --exe mowas_2 -q | grep -q '"total":1,' || { echo "FAIL: --exe mowas_2 should not mount as64/core"; exit 1; }
node ../roundtrip.js --vfs --game fixture-exe --exe bogus 2>/dev/null; [ $? = 2 ] || { echo "FAIL: --exe bogus"; exit 1; }
rm -rf fixture-exe
echo PASS
