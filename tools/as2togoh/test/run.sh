#!/bin/sh
# seeded AS2 mod -> GoH: finding lines (file:line: CODE) must equal truth.md; output checked by check.js (incl. modmove assetRules)
# Author: Imperator_Aug (ARSENAL, ia-fd2b630d)
d=$(dirname "$0")
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture + outputs never touch tracked files
F="$W/fixture"
node "$d/mkfixture.js" || { echo FAIL: mkfixture; exit 1; }
ok=1
strip() { grep -E '^[^ ]+: [A-Z0-9_]+ ' | sed 's/^\([^ ]*: [A-Z0-9_]*\) .*/\1/' | sort; }
node "$d/../as2togoh.js" "$F/mod" --out "$F/out" --goh "$F/goh" --goh-version 1.067 -q | strip > "$W/.got"
sort "$d/truth.md" > "$W/.want"
cmp -s "$W/.got" "$W/.want" || { diff "$W/.got" "$W/.want"; ok=0; }
# --donor by name: kubel (class car, no donor in class) takes t34
node "$d/../as2togoh.js" "$F/mod" --out "$F/out2" --goh "$F/goh" --goh-version 1.067 --donor t34 -q | strip | grep -c VEHICLE_DONOR | grep -qx 2 || { echo "FAIL: --donor"; ok=0; }
node "$d/check.js" || ok=0
# exe not readable: says so, range left alone
node "$d/../as2togoh.js" "$F/mod" --out "$F/out4" --goh "$F/goh" -q | grep -q WARN_AS2TOGOH_VERSION_UNKNOWN || { echo "FAIL: unknown version not warned"; ok=0; }
# no --goh: both vehicles warn VEHICLE_DEF
n=$(node "$d/../as2togoh.js" "$F/mod" --out "$F/out3" --goh-version 1.067 -q | grep -c 'WARN_AS2TOGOH_VEHICLE_DEF')
[ "$n" = 2 ] || { echo "FAIL: no-goh vehicle warns $n"; ok=0; }
# refusals + dry
node "$d/../as2togoh.js" "$F/mod" --out "D:/Steam/steamapps/common/Call to Arms - Gates of Hell/mods/port" -q >/dev/null 2>&1 && { echo "FAIL: out inside install accepted"; ok=0; }
node "$d/../as2togoh.js" "$F/mod" --out "$F/mod/sub" -q >/dev/null 2>&1 && { echo "FAIL: out inside mod accepted"; ok=0; }
node "$d/../as2togoh.js" "$F/mod" --out "$F/dry" --dry -q >/dev/null; [ -e "$F/dry" ] && { echo "FAIL: dry wrote"; ok=0; }
[ $ok = 1 ] && echo PASS || { echo FAIL; exit 1; }
