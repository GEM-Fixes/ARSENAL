#!/bin/sh
# statsheet test: seeded fixture (;@CODE markers) -> exact finding set; clean part stays quiet; sheet golden
# Author: Imperator_Aug (ARSENAL, ia-5a00a39b)
cd "$(dirname "$0")"
node mkfixture.js >/dev/null || { echo FAIL: mkfixture; exit 1; }
node ../statsheet.js - --folder fx --cache fx.cache.json -q > out.txt 2>&1
sed -n 's/^\([^:]*\):\([0-9]*\): \([A-Z_0-9]*\) .*/\1:\2 \3/p' out.txt | sort > got.txt
sort truth.txt > want.txt
if ! diff --strip-trailing-cr want.txt got.txt > diff.txt; then cat diff.txt; echo FAIL; exit 1; fi
node ../statsheet.js - --folder fx --cache fx.cache.json --sheet weapons,armor --filter 'g1|bad' > sheet.out 2>&1
if ! diff --strip-trailing-cr sheet.want sheet.out > sheet.diff; then cat sheet.diff; echo FAIL: sheet; exit 1; fi
# {from} chain (TST-38): rifle and clone rows inherited from the pattern
node ../statsheet.js - --folder fx --cache fx.cache.json --sheet weapons --filter 'rf|rifle' > from.out 2>&1
diff --strip-trailing-cr from.want from.out >/dev/null || { diff --strip-trailing-cr from.want from.out; echo FAIL: from chain; exit 1; }
node fmtcheck.js ../statsheet.js ARMOR_VOLUME_SHADOWED - --folder fx --cache fx.cache.json || exit 1
# --paths: every row names its source file
node ../statsheet.js - --folder fx --cache fx.cache.json --paths > paths.out 2>&1
[ "$(grep "^| " paths.out | grep -vc "source file |$")" = "$(grep -c "resource/\(entity\|set\)/" paths.out)" ] || { echo FAIL: paths; exit 1; }
grep -q "g1 | (default).*resource/set/stuff/gun/g1 |" paths.out || { echo FAIL: paths g1; exit 1; }
# --roster-insert: dry = no write; real = one new line, CRLF + cp1251 bytes kept; seeded refusals
cp roster/units_a.set roster/u.set
node ../statsheet.js --roster-insert roster/u.set newguy --dry > ro.out; cmp -s roster/u.set roster/units_a.set || { echo FAIL: dry wrote; exit 1; }
grep -q '^+.*{"newguy" {cost 20}' ro.out || { echo FAIL: dry diff; exit 1; }
node ../statsheet.js --roster-insert roster/u.set newguy > ro.out || { echo FAIL: insert; exit 1; }
node rocheck.js || { echo FAIL: bytes; exit 1; }
node ../statsheet.js --roster-insert roster/u.set newguy | grep -q ROSTER_EXISTS || { echo FAIL: exists; exit 1; }
node ../statsheet.js --roster-insert roster/empty.set x | grep -q ROSTER_NO_TEMPLATE || { echo FAIL: no template; exit 1; }
node ../statsheet.js --roster-insert roster/nope.set x | grep -q ROSTER_FILE_MISSING || { echo FAIL: missing; exit 1; }
node ../statsheet.js --game roster --roster-insert roster/u.set other | grep -q ROSTER_VANILLA || { echo FAIL: vanilla guard; exit 1; }
# --units-json: JSON catalogue (no unit list in this fixture: a warning, not a crash); -i in --filter accepted (S13)
node ../statsheet.js - --folder fx --cache fx.cache.json --units-json | grep -q '"kind":"units"' || { echo FAIL: units-json; exit 1; }
node ../statsheet.js - --folder fx --cache fx.cache.json --sheet weapons --filter -i G1 | grep -q "^| g1 " || { echo FAIL: filter -i; exit 1; }
# main gun of a card whose gun file only inherits ({from ..}): numbers from the chain (units.js gunFromChain)
node gunchain.js > /dev/null || { node gunchain.js; echo FAIL: gun chain; exit 1; }
# game parity (--exe as64 | mowas_2 | goh) on made-up installs in a per-run work dir
gw=$(mktemp -d) && gw=$(cd "$gw" && { pwd -W 2>/dev/null || pwd; }) || exit 1
node games.js "$gw" > "$gw.out" 2>&1 || { grep -v '^OK ' "$gw.out"; rm -rf "$gw" "$gw.out"; echo FAIL: games; exit 1; }
rm -rf "$gw" "$gw.out"
echo PASS
