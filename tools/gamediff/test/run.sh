#!/bin/sh
# seeded two-game fixture: selected output lines must equal truth.md exactly
# Author: Imperator_Aug (ARSENAL, ia-16ad0a87)
d=$(dirname "$0")
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node "$d/mkfixture.js" || { echo FAIL: mkfixture; exit 1; }
node "$d/../gamediff.js" --as2 "$d/fixture/as2" --goh "$d/fixture/goh" --min 1 --top 20 --sample 5 | grep -E '^(top-folder|ext only|root only|include target|kind (def|weapon|map.mi|map.materials) |bin \.ply|lng |modinfo|mapdirs)' | sed 's/ sample .*$//' | sort > "$G/.got"
grep -vE '^#' "$d/truth.md" | sort > "$G/.want"
cmp -s "$G/.got" "$G/.want" || { diff "$G/.got" "$G/.want"; echo FAIL; exit 1; }
# --exe: as64 reads the as64/core layer (its key shows on the AS2 side); mowas2 and no --exe do not; goh is refused for the AS2 side
R="node $d/../gamediff.js --as2 $d/fixture/as2 --goh $d/fixture/goh --min 1 --top 20 --sample 5"
$R --exe as64 > "$G/.a"; $R --exe mowas_2 > "$G/.m"; $R > "$G/.n"
grep -q '^kind def .*only as2 .*zz_core_key' "$G/.a" || { echo "FAIL: --exe as64 misses the as64/core key"; exit 1; }
grep -q 'zz_core_key' "$G/.m" && { echo "FAIL: --exe mowas_2 read as64/core"; exit 1; }
cmp -s "$G/.m" "$G/.n" || { echo "FAIL: --exe mowas_2 differs from no --exe"; exit 1; }
$R --exe goh >/dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: --exe goh not refused"; exit 1; }
echo PASS
rm -f "$G/.got" "$G/.want" "$G/.a" "$G/.m" "$G/.n"
