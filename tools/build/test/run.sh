#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-5050465a)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
fail=0
J='const j=JSON.parse(require("fs").readFileSync(0,"utf8"));'
# bad: every seeded stage fires, pack blocked, exit 1
node ../build.js fixture/bad --json > bad.json; rc=$?
[ $rc = 1 ] || { echo "FAIL: bad exit $rc"; fail=1; }
node -e "$J for(const s of j.stages)for(const f of s.findings)console.log(s.tool+' '+f.code)" < bad.json > got.txt
echo "packer WARN_TEXT_NOT_CRLF" >> got.txt
node ../build.js fixture/bad --stages pack --json | node -e "$J if(j.stages[0].findings[0].code!=='WARN_TEXT_NOT_CRLF')process.exit(1)" || { echo "FAIL: pack-only"; fail=1; }
grep -v '^#' truth.md | sort > want.txt; sort got.txt -o got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; fail=1; }
node -e "$J const p=j.stages.find(s=>s.tool==='packer');if(!p.skipped||j.packed)process.exit(1)" < bad.json || { echo "FAIL: pack not blocked"; fail=1; }
# strict: warn-only run (keylint warn) blocks pack; non-strict does not
node ../build.js fixture/bad --stages keylint,packer -q > s0.txt; [ $? = 1 ] && { echo "FAIL: warn-only should pass"; fail=1; }
node ../build.js fixture/bad --stages keylint,packer --strict -q > s1.txt; [ $? = 1 ] || { echo "FAIL: --strict should fail"; fail=1; }
# clean: reaches pack dry, exit 0, nothing written
node ../build.js fixture/clean --json > clean.json || { echo "FAIL: clean exit"; fail=1; }
node -e "$J const p=j.stages.find(s=>s.tool==='packer');if(p.skipped||!j.packed||!j.dry||j.errors||j.warns)process.exit(1)" < clean.json || { echo "FAIL: clean did not reach dry pack"; fail=1; }
# clean --out writes paks
rm -rf fixture/out; node ../build.js fixture/clean --out fixture/out -q > o.txt || { echo "FAIL: clean --out"; fail=1; }
ls fixture/out/*.pak > /dev/null 2>&1 || { echo "FAIL: no paks written"; fail=1; }
# unknown stage / bad usage exit 2
node ../build.js fixture/clean --stages nope > /dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: unknown stage"; fail=1; }
# workspace: topo order, missing + cycle reported, cycle mods not built
node ../build.js --workspace fixture/ws --stages modinfo -q > ws.txt; [ $? = 1 ] || { echo "FAIL: ws exit"; fail=1; }
grep -q "build order wb, wa, wc" ws.txt || { echo "FAIL: ws order"; fail=1; }
grep -o "BUILD_REQUIRE_[A-Z]*" ws.txt | sort > ws.got; printf "BUILD_REQUIRE_CYCLE
BUILD_REQUIRE_MISSING
" > ws.want
diff ws.want ws.got || { echo "FAIL: ws codes"; fail=1; }
! grep -q "^=== w[de]" ws.txt || { echo "FAIL: cycle mod built"; fail=1; }
# game parity: --exe reaches the stages that take a game; GoH: modinfo --game --goh, loccover skipped, packer --goh (--print-plan runs nothing)
gw=$(mktemp -d); mkdir -p "$gw/goh/binaries/x64" "$gw/as2"; : > "$gw/goh/binaries/x64/call_to_arms.exe"; : > "$gw/as2/as64.exe"
P='const j=JSON.parse(require("fs").readFileSync(0,"utf8"));const a=k=>JSON.stringify(j[k]);'
node ../build.js fixture/clean --game "$gw/as2" --exe mowas2 --print-plan | node -e "$P
if(!/\"--exe\",\"mowas_2\"/.test(a('sdllint'))||!/\"--exe\",\"mowas_2\"/.test(a('refcheck'))||!/\"--exe\",\"mowas_2\"/.test(a('expcheck'))||!/\"--exe\",\"mowas_2\"/.test(a('modinfo')))process.exit(1);
if(/--exe/.test(a('lnglint'))||/--goh/.test(a('packer'))||j.loccover.skipped)process.exit(1)" || { echo "FAIL: mowas2 --exe not forwarded"; fail=1; }
node ../build.js fixture/clean --game "$gw/as2" --print-plan | node -e "$P if(/--exe/.test(JSON.stringify(j)))process.exit(1)" || { echo "FAIL: --exe added with no --exe"; fail=1; }
node ../build.js fixture/clean --game "$gw/goh" --exe goh --print-plan | node -e "$P
if(!/\"--goh\"/.test(a('modinfo'))||!/\"--game\"/.test(a('modinfo'))||!/GHLOC-01/.test(a('loccover'))||!/\"--goh\"/.test(a('packer'))||!/\"--exe\",\"goh\"/.test(a('sdllint')))process.exit(1)" || { echo "FAIL: goh plan"; fail=1; }
node ../build.js fixture/clean --game "$gw/goh" --print-plan | node -e "$P if(!/\"--goh\"/.test(a('modinfo'))||!j.loccover.skipped||/--exe/.test(a('sdllint')))process.exit(1)" || { echo "FAIL: goh from call_to_arms.exe"; fail=1; }
node ../build.js fixture/clean --exe bogus > /dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: bad --exe"; fail=1; }
# GoH mod.info (Min/Max 1.067) through the real modinfo stage: no VER_RANGE with --exe goh, VER_RANGE at the AS2 3.262 without
mkdir -p "$gw/gm"; printf '{mod\r\n\t{name "g"}\r\n\t{minGameVersion "1.067"}\r\n\t{maxGameVersion "1.067"}\r\n}\r\n' > "$gw/gm/mod.info"
node ../build.js "$gw/gm" --stages modinfo --game "$gw/goh" --exe goh --json | node -e "$J if(!j.ok||j.errors)process.exit(1)" || { echo "FAIL: goh modinfo stage"; fail=1; }
node ../build.js "$gw/gm" --stages modinfo --json | node -e "$J if(!JSON.stringify(j).includes('VER_RANGE'))process.exit(1)" || { echo "FAIL: AS2 default modinfo changed"; fail=1; }
rm -rf "$gw"
[ $fail = 0 ] && echo PASS || echo FAIL
