#!/bin/sh
# seeded fake GoH + AS2 trees: finding lines (run file: CODE) must equal truth.md; outputs checked by check.js; dry-run + out-in-install guards
# Author: Imperator_Aug (ARSENAL, ia-fe3c26a4)
d=$(dirname "$0"); W="$d/work"; T="$d/../helmetport.js"
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node "$d/mkfixture.js" || { echo FAIL: mkfixture; exit 1; }
hp() { n=$1; shift; node "$T" --goh "$W/goh" --game "$W/as2" --no-rc -q "$@" | grep -E '^[^ ]+: [A-Z0-9_]+ ' | sed "s/^\([^ ]*: [A-Z0-9_]*\) .*/$n \1/"; }
{
hp 1 --out "$W/out1" --item helm_a --item helm_b --item cap_a --item mask_x --item chain_b --item bad_from --item armor_v --item radio_p --item clash1 --item macro_m
hp 2 --out "$W/out2" --no-model --breed sold --as set/breed/mp/ger/hp.set --as-from set/breed/mp/ger/rifle.set
hp 3 --out "$W/out3" --no-model --breed sold --as set/breed/x/hp2.set --as-from set/breed/mp/ger/rifle.set | grep REL_INCLUDE
hp 4 --out "$W/out4" --item ghost
hp 7 --out "$W/out7" --item helm_a --item helm_c --item cap_c --fit auto --tone auto
node "$T" --goh "$W/goh" --no-rc -q --out "$W/out8" --item helm_c --fit auto | grep -E '^[^ ]+: [A-Z0-9_]+ ' | sed "s/^\([^ ]*: [A-Z0-9_]*\) .*/8 \1/"
hp 9 --out "$W/out9" --item cap_c --item helm_c --fit auto --tone auto --cap-tone 2 --cap-spec ref
node "$T" --goh "$W/goh" --no-rc -q --out "$W/out10" --item cap_c --cap-spec ref | grep -E '^[^ ]+: [A-Z0-9_]+ ' | sed "s/^\([^ ]*: [A-Z0-9_]*\) .*/10 \1/"
hp 11 --out "$W/out11" --item cap_c --cap-tone screen
} | sort > "$G/.got"
grep -vE '^#' "$d/truth.md" | sort > "$G/.want"
ok=1
cmp -s "$G/.got" "$G/.want" || { diff "$G/.got" "$G/.want"; ok=0; }
node "$T" --goh "$W/goh" --game "$W/as2" --no-rc -q --out "$W/out4" --item ghost >/dev/null; [ $? = 1 ] || { echo "FAIL: not found exit != 1"; ok=0; }
node "$T" --goh "$W/goh" --game "$W/as2" --no-rc -q --out "$W/out5" --no-model --keep-light-armor --item cap_a >/dev/null
node "$T" --goh "$W/goh" --game "$W/as2" --no-rc -q --out "$W/out6" --no-model --breed hel --as set/breed/mp/ger/hp3.set --as-from set/breed/mp/ger/at.set >/dev/null
node "$d/check.js" || ok=0
node "$T" --goh "$W/goh" --game "$W/as2" --no-rc -q --out "$W/dry" --dry-run --item helm_a --breed sold --as set/breed/mp/ger/hp.set --as-from set/breed/mp/ger/rifle.set >/dev/null
[ -e "$W/dry" ] && { echo "FAIL: dry-run wrote"; ok=0; }
node "$T" --goh "$W/goh" --game "$W/as2" --no-rc -q --out "$W/goh/inside" --item helm_a >/dev/null 2>&1 && { echo "FAIL: out inside GoH accepted"; ok=0; }
[ -e "$W/goh/inside" ] && { echo "FAIL: wrote inside GoH"; ok=0; }
node "$T" --goh "$W/goh" --game "$W/as2" --list | grep -q '^ *5  head from "pattern heavy_headgear"' || { echo "FAIL: --list counts"; ok=0; }
node "$d/exe.js" > "$G/.exe" 2>&1 || { tail -n 8 "$G/.exe"; echo "FAIL: exe.js"; ok=0; }
rm -rf "$W" "$G/.got" "$G/.want" "$G/.exe"
[ $ok = 1 ] && echo PASS || echo FAIL
