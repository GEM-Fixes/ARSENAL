#!/bin/sh
# mapport: seeded GoH map + grass, fixes land as as64 forms, text bytes kept outside the drops, idempotent
# Author: Imperator_Aug (ARSENAL, ia-0bf50eb7)
cd "$(dirname "$0")/../../.." || exit 1
t=$(mktemp -d)
node tools/mapport/test/seed.js "$t" || { echo FAIL; rm -rf "$t"; exit 1; }
P="node tools/mapport/mapport.js"
ok=1
# filled with a count; saved weapon state
node -e "const {filterMap}=require('./tools/mapport/mapport.js');const r=filterMap('{map\n{Entity \"a\"\n{Item \"d\" filled 50}\n{Weaponry\n{State \"mgun2\" {AccuracyByMotion {value 1}}}\n}\n{Item \"e\" 2 filled 9}\n}\n}\n').text;if(/filled 50|filled 9/.test(r)||/Weaponry/.test(r)||!/\"d\" filled/.test(r))process.exit(1)" || { echo "filled or weaponry state"; ok=0; }
$P "$t/src" --out "$t/out" > "$t/r" || ok=0
grep -q 'map files 1, changed 1; grs 2, converted 1, already as64 form 1, bad 0' "$t/r" || { echo "counts: $(head -1 "$t/r")"; ok=0; }
node tools/mapport/test/verify.js "$t" || ok=0
[ -f "$t/out/map/multi/a2/map.grs" ] && { echo "as64 form grass was rewritten"; ok=0; }
# the result needs no more work
$P "$t/out" --out "$t/out2" > "$t/r2"
grep -q 'changed 0; grs 1, converted 0, already as64 form 1' "$t/r2" || { echo "not idempotent: $(head -1 "$t/r2")"; ok=0; }
$P --check "$t/src" > "$t/c1"; [ $? = 1 ] || { echo "check missed GoH form"; ok=0; }
$P --check "$t/out" > "$t/c2"; [ $? = 0 ] || { echo "check flagged a clean tree"; ok=0; }
# CHK-MIXB: --check names PORT-72 (GoH grs header) and PORT-73 (GoH-only keys) as codes; the clean twin has none; grs is flagged once (a2 is as64 form)
grep -q 'map/multi/a/map\.grs: MAP_GRS_GOH_FORM' "$t/c1" || { echo "MAP_GRS_GOH_FORM missed"; ok=0; }
[ "$(grep -c MAP_GRS_GOH_FORM "$t/c1")" = 1 ] || { echo "MAP_GRS_GOH_FORM count"; ok=0; }
for k in 'map/haze' 'map/globaltexture' 'map/entity/component/health'; do grep -q "MAP_KEY_GOH_ONLY GoH-only key $k x" "$t/c1" || { echo "MAP_KEY_GOH_ONLY $k missed"; ok=0; }; done
grep -qE 'MAP_GRS_GOH_FORM|MAP_KEY_GOH_ONLY' "$t/c2" && { echo "clean twin flagged by new codes"; ok=0; }
# item filling second count
node -e "const {filterMap}=require('./tools/mapport/mapport.js');const r=filterMap('{map {Entity \"a\" {Item \"d\" filling \"m\" \"drum\" 50 50}{Item \"e\" filling \"m\" 7}{Item \"f\" 2}}}');if(!r.text.includes('\"drum\" 50}')||!r.text.includes('\"m\" 7}')||!r.text.includes('\"f\" 2}'))process.exit(1)" || { echo "filling"; ok=0; }
# cell-5 -> cell-10 rebuild: net decimation, name merge, omask header
node tools/mapport/rebuild.js --self-test | grep -q '^PASS' || { echo "rebuild self-test"; ok=0; }
node tools/mapport/test/cell-test.js | grep -q "^PASS cell" || { echo "cell resample test"; ok=0; }
# --carry: textures, .ebm redirect, {bitmap} .ebm frames, AS2 key skipped, mtl, env preset filtered (output in ../run/mapcarry/test)
node tools/mapport/test/carry-test.js > "$t/ct" && grep -q '^PASS carry' "$t/ct" && grep -q '^PASS tga' "$t/ct" && grep -q '^PASS envnames' "$t/ct" && grep -q '^PASS unclosed quote' "$t/ct" || { echo "carry test"; ok=0; }
# units: map defs the stack lacks -> scenery keys / donor rows / raw keys + forced props / blocked (DCGDEFS)
node tools/mapport/test/units-test.js | grep -q "^PASS units" || { echo "units test"; ok=0; }
# units --exe (game parity): as64 / mowas_2 stack view, goh refused
node tools/mapport/test/units-exe-test.js | grep -q "^PASS units exe" || { echo "units exe test"; ok=0; }
rm -rf "$t"
[ $ok = 1 ] && echo PASS || { echo FAIL; exit 1; }
