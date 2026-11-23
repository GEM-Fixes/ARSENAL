#!/bin/sh
# seeded fake GoH tree: finding lines (file:line: CODE) must equal truth.md; output files checked by check.js; --out-in-install refused
# Author: Imperator_Aug (ARSENAL, ia-e1dc8bb4)
d=$(dirname "$0")
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
# PORTREV: goh2as2 now resolves a default AS2 dir (Steam) when --game is absent; keep the no---game fixtures hermetic
unset AS2_GAME; AS2_NO_STEAM=1; export AS2_NO_STEAM
node "$d/mkfixture.js" || { echo FAIL: mkfixture; exit 1; }
node "$d/../goh2as2.js" --goh "$d/fixture/goh" --entity tank --keys "$d/fixture/keys.txt" --out "$d/fixture/out" --no-keylint --no-rc -q | grep -E '^[^ ]+: [A-Z0-9_]+ ' | sed 's/^\([^ ]*: [A-Z0-9_]*\) .*/\1/' | sort > "$G/.got"
grep -vE '^#' "$d/truth.md" | sort > "$G/.want"
ok=1
cmp -s "$G/.got" "$G/.want" || { diff "$G/.got" "$G/.want"; ok=0; }
node "$d/check.js" "$d/fixture/out" || ok=0
node "$d/../goh2as2.js" --goh "$d/fixture/goh" --entity tank --out "$d/fixture/goh/inside" --no-keylint >/dev/null 2>&1 && { echo "FAIL: out inside install accepted"; ok=0; }
node "$d/../goh2as2.js" --goh "$d/fixture/goh" --entity tank --out "$d/fixture/dry" --dry-run --no-keylint -q >/dev/null; [ -e "$d/fixture/dry" ] && { echo "FAIL: dry-run wrote"; ok=0; }
node "$d/../goh2as2.js" --goh "$d/fixture/goh" --entity tank --mod "$d/fixture/modout" --no-keylint --no-rc -q >/dev/null
node "$d/checkmod.js" "$d/fixture/modout" || { echo "FAIL: mod.info"; ok=0; }
node "$d/../goh2as2.js" --goh "$d/fixture/goh" --entity tank --mod "$d/fixture/moddry" --dry-run --no-keylint -q >/dev/null; [ -e "$d/fixture/moddry" ] && { echo "FAIL: --mod dry-run wrote"; ok=0; }
node "$d/../goh2as2.js" --goh "$d/fixture/goh" --entity pcopy --game "$d/fixture/as2" --out "$d/fixture/out2" --no-keylint --no-rc > "$G/.rep2"
node "$d/check2.js" "$d/fixture/out2" "$G/.rep2" || ok=0
node "$d/../goh2as2.js" --goh "$d/fixture/goh" --entity pcopy --out "$d/fixture/out3" --no-keylint --no-rc -q >/dev/null
[ -e "$d/fixture/out3/resource/properties" ] && { echo "FAIL: props copied without --game"; ok=0; }
node "$d/../goh2as2.js" --goh "$d/fixture/goh" --entity digitref --out "$d/fixture/out4" --no-keylint --no-rc -q >/dev/null
[ -e "$d/fixture/out4/resource/entity/dg/105mm_gun.mdl" ] && [ -e "$d/fixture/out4/resource/entity/dg/7_barrel.ply" ] || { echo "FAIL: digit-named reference not followed"; ok=0; }
node "$d/../goh2as2.js" --goh "$d/fixture/goh2" --base "$d/fixture/base" --entity bsunit --out "$d/fixture/out5" --no-keylint --no-rc > "$G/.rep5"
node "$d/../goh2as2.js" --goh "$d/fixture/goh2" --entity bsunit --out "$d/fixture/out6" --no-keylint --no-rc > "$G/.rep6"
node "$d/check3.js" "$d/fixture/out5" "$G/.rep5" "$d/fixture/out6" "$G/.rep6" || ok=0
node "$d/inf.js" || ok=0
node "$d/donor.js" || ok=0
node "$d/xlate2.js" > /dev/null || ok=0
node "$d/xlate5.js" || ok=0
node "$d/mdlkey.js" || ok=0
node "$d/seatmap.js" || ok=0
node "$d/asset1.js" || ok=0
node "$d/fxe2.js" || ok=0
node "$d/scenfix.js" || ok=0
node "$d/gohfix.js" || ok=0
node "$d/build6.js" || ok=0
node "$d/texcheck2.js" || ok=0
node "$d/vol4f.js" || ok=0
node "$d/lamp186.js" > /dev/null || ok=0
node "$d/lim1.js" > /dev/null || ok=0
node "$d/c2d.js" > /dev/null || { echo "FAIL: c2d"; ok=0; }
node "$d/c40.js" > /dev/null || { echo "FAIL: c40"; ok=0; }
node "$d/unitname.js" || ok=0
node "$d/gohfx.js" > /dev/null || { node "$d/gohfx.js" | grep FAIL; ok=0; }
node "$d/stuffport.js" > /dev/null || { node "$d/stuffport.js" | grep FAIL; ok=0; }
node "$d/portrev.js" > /dev/null || { node "$d/portrev.js" | grep FAIL; ok=0; }
node "$d/portrev2.js" > /dev/null || { node "$d/portrev2.js" | grep FAIL; ok=0; }
node "$d/gold.js" > /dev/null || { node "$d/gold.js" | grep FAIL; ok=0; }      # T-PORTGAP: byte-equal output across two folders/cwds
node "$d/portgap.js" > /dev/null || { node "$d/portgap.js" | grep FAIL; ok=0; } # T-PORTGAP: SEED + diff tests of gaps/*.gaps.json
node "$d/incl.js" > /dev/null || { node "$d/incl.js" | grep -A20 FAIL; ok=0; }   # T-PORTINC: include chain, shadowed relative include, missing-include WARN
node "$d/pather.js" > /dev/null || { node "$d/pather.js" | grep FAIL; ok=0; }   # T-PATHER: unknown GoH PatherID mapped + gap entry, known kept
node "$d/stuff.js" > /dev/null || { node "$d/stuff.js" | grep FAIL; ok=0; }   # T-STUFF: weapon/ammo/item tags -> kept / pulled / WARN_PORT_STUFF_MISSING; bare weapon shared with ammo quoted
node "$d/donorfit.js" > /dev/null || { node "$d/donorfit.js" | grep FAIL; ok=0; }   # T-DONORFIT: weapon place without a mdl bone -> {LinkBone} by role / hand gap + exit 1; shield volume dropped
node "$d/portload.js" > /dev/null || { node "$d/portload.js" | grep FAIL; ok=0; }   # T-PORTLOAD: pulled stuff curve/cursor names vs as64; def ammo mapped onto the gun's filling family
node "$d/textonly.js" > /dev/null || { node "$d/textonly.js" | grep FAIL; ok=0; }   # NAT-CONV: --text-only writes no binary, tsv lists them, text equal
node "$d/natgap.js" > /dev/null || { node "$d/natgap.js" | grep FAIL; ok=0; }   # NAT-GAP: burst/spreading kept as as64 form; stuff name drops are gap entries
node "$d/parity.js" > /dev/null || { node "$d/parity.js" | grep FAIL; ok=0; }   # game parity: --exe mowas_2 (stuff view, mod.info range, keylint), --exe goh refused, stuffport --exe
rm -f "$G/.got" "$G/.want" "$G/.rep2" "$G/.rep5" "$G/.rep6" "$G/.full"
[ $ok = 1 ] && echo PASS || echo FAIL
