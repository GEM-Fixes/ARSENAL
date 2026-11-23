#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-6293ff89)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
M="node ../mapview.js"
{ $M fixture --width 4 --legend --entities; echo "-- height"; $M fixture --width 4 --layer height --legend
  echo "-- material"; $M fixture/map.net --width 2 --layer material; echo "-- bad"; $M fixture/bad.net
  echo "-- svg"; $M fixture --width 4 --svg fixture/o.svg -q >/dev/null; grep -c '<rect' fixture/o.svg
  echo "-- args"; $M fixture --layer bogus; } > got.txt 2>&1
diff --strip-trailing-cr want.txt got.txt || { echo "FAIL: output differs from want.txt"; exit 1; }
# T-MAPS: svg stable (no date in it): header line + size, rerun same bytes; --help exit 0; error has no stack
[ "$(head -1 fixture/o.svg)" = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">' ] || { echo "FAIL: svg header"; exit 1; }
[ "$(wc -c < fixture/o.svg | tr -d ' ')" = 511 ] || { echo "FAIL: svg size"; exit 1; }
cp fixture/o.svg fixture/o1.svg; $M fixture --width 4 --svg fixture/o.svg -q >/dev/null; cmp fixture/o.svg fixture/o1.svg || { echo "FAIL: svg not stable"; exit 1; }
node ../mapview.js --help > fixture/h.txt 2>&1 || { echo "FAIL: --help exit"; exit 1; }; grep -q '^usage: ARSENAL mapview' fixture/h.txt || { echo "FAIL: --help usage"; exit 1; }
node ../mapview.js fixture/nope.net > fixture/e.txt 2>&1; grep -q MAPVIEW_NO_MAP fixture/e.txt && ! grep -q '    at ' fixture/e.txt || { echo "FAIL: error text"; exit 1; }
# game parity: --exe picks the file set of the shared install (as64: as64/core 4x4 wins; mowas_2: base 8x8; none = as64)
$M --game fixture/game --map multi/t --width 4 -q > fixture/x0.txt 2>&1; grep -q ': 4x4 cells' fixture/x0.txt || { echo "FAIL: no --exe should read as64 view"; cat fixture/x0.txt; exit 1; }
$M --game fixture/game --exe as64 --map multi/t --width 4 -q > fixture/x1.txt 2>&1; grep -q ': 4x4 cells' fixture/x1.txt || { echo "FAIL: --exe as64"; cat fixture/x1.txt; exit 1; }
$M --game fixture/game --exe mowas_2 --map multi/t --width 4 -q > fixture/x2.txt 2>&1; grep -q ': 8x8 cells' fixture/x2.txt || { echo "FAIL: --exe mowas_2"; cat fixture/x2.txt; exit 1; }
$M --game fixture/game --exe mowas2 --map multi/t --width 4 -q > fixture/x3.txt 2>&1; grep -q ': 8x8 cells' fixture/x3.txt || { echo "FAIL: --exe mowas2"; cat fixture/x3.txt; exit 1; }
# --exe and no --game, AS2_GAME unset, no as2.json above the cwd: the install comes from lib/games install (stubbed to fixture/game)
T=$(node -e "console.log(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'mapview-')))")
H=$(pwd)
(cd "$T" && env -u AS2_GAME node "$H/stubinstall.js" --exe mowas_2 --map multi/t --width 4 -q) > fixture/x4.txt 2>&1
rm -rf "$T"
grep -q '^install mowas_2$' fixture/x4.txt && grep -q ': 8x8 cells' fixture/x4.txt || { echo "FAIL: --exe with no --game should use games.install"; cat fixture/x4.txt; exit 1; }
echo PASS
