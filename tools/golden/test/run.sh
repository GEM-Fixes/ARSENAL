#!/bin/sh
# fake tool runs: --update writes counts; same → exit 0; changed count → exit 1 with code diff; info lines not counted
# Author: Imperator_Aug (ARSENAL, ia-8a303d33)
cd "$(dirname "$0")"; rm -rf fx; mkdir fx; fail=0; g="node ../golden.js --out fx/golden.json --config fx/runs.json"
mk() { printf '{"a": ["../fake.js", "%s"], "b": ["../fake.js", "0"]}\n' "$1" > fx/runs.json; }
mk 2; $g --update > /dev/null || { echo "FAIL: update"; fail=1; }
grep -q '"A_ONE": 2' fx/golden.json && grep -q '"WARN_TWO": 1' fx/golden.json || { echo "FAIL: counts $(cat fx/golden.json)"; fail=1; }
grep -q B_INFO fx/golden.json && { echo "FAIL: info counted"; fail=1; }
$g > /dev/null || { echo "FAIL: same counts should pass"; fail=1; }
mk 3; out=$($g) && { echo "FAIL: changed counts should exit 1"; fail=1; }
echo "$out" | grep -qF 'a: 3→4 | A_ONE 2→3' || { echo "FAIL: diff line: $out"; fail=1; }
echo "$out" | grep -qF 'b: 1 same' || { echo "FAIL: unchanged run: $out"; fail=1; }
# --exe: ${EXE} becomes the vfs exe (mowas2 -> mowas_2, goh -> goh); no --exe -> as64; a bad --exe exits 2 (own temp folder: fx/ keeps the result above)
X=$(mktemp -d); X=$(cd "$X" && { pwd -W 2>/dev/null || pwd; }); FK=$(pwd -W 2>/dev/null || pwd)/fake.js
e="node ../golden.js --out $X/golden.json --config $X/runs.json"
printf '{"e": ["%s", "0", "${EXE}"]}\n' "$FK" > $X/runs.json
$e --exe mowas2 --update > /dev/null && grep -q '"EXE_MOWAS_2": 1' $X/golden.json || { echo "FAIL: --exe mowas2 not handed over: $(cat $X/golden.json)"; fail=1; }
$e --exe goh --game "$X" --update > /dev/null && grep -q '"EXE_GOH": 1' $X/golden.json || { echo "FAIL: --exe goh not handed over: $(cat $X/golden.json)"; fail=1; }
$e --update > /dev/null && grep -q '"EXE_AS64": 1' $X/golden.json || { echo "FAIL: no --exe should hand over as64: $(cat $X/golden.json)"; fail=1; }
$e --exe nope > /dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: bad --exe should exit 2"; fail=1; }
rm -rf "$X"
# the game run files: every run of runs.mowas2.json names --exe ${EXE}; runs.goh.json reads the GoH install only
node -e "const r=require('../runs.mowas2.json');const bad=Object.entries(r).filter(([n,a])=>a[0]!=='packer'&&!a.includes('\${EXE}'));if(bad.length){console.log('FAIL: no --exe in '+bad.map(b=>b[0]));process.exit(1)}" || fail=1
node -e "const r=require('../runs.goh.json');if(!Object.keys(r).length||Object.values(r).some(a=>!a.includes('\${EXE}')&&a[0]!=='packer')){console.log('FAIL: runs.goh.json');process.exit(1)}" || fail=1
[ $fail = 0 ] && echo PASS || echo FAIL
