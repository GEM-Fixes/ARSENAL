#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-fdcaebab)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture, truth and outputs never touch tracked files
node mkfixture.js || exit 1
M="$W/fixture/mod"
node ../defcheck.js "$M" -q > "$W/out.txt"
cat "$W/out.txt"
grep -v '^#' "$W/truth.md" | sed 's/: / /' | sort > "$W/want.txt"
grep -v 'findings$\|^by code\| files$' "$W/out.txt" | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > "$W/got.txt"
diff "$W/want.txt" "$W/got.txt" || { echo "FAIL: findings differ from truth.md"; exit 1; }
node ../defcheck.js "$M" -q > "$W/out2.txt"
cmp -s "$W/out.txt" "$W/out2.txt" || { echo "FAIL: output not deterministic"; exit 1; }
node ../defcheck.js "$M" --format json > "$W/out.json"
grep -q '"tool": "defcheck"' "$W/out.json" || { echo "FAIL: --format json"; exit 1; }
node ../defcheck.js "$M" -q --exe as64 > "$W/out3.txt"; cmp -s "$W/out.txt" "$W/out3.txt" || { echo "FAIL: --exe as64 differs"; exit 1; }
node ../defcheck.js "$M" -q --exe mowas_2 > "$W/out3.txt"; cmp -s "$W/out.txt" "$W/out3.txt" || { echo "FAIL: --exe mowas_2 differs"; exit 1; }
node ../defcheck.js "$M" -q --no-rc > "$W/out3.txt"; cmp -s "$W/out.txt" "$W/out3.txt" || { echo "FAIL: --no-rc differs"; exit 1; }
node ../defcheck.js --no-rc "$M" -q > "$W/out3.txt"; cmp -s "$W/out.txt" "$W/out3.txt" || { echo "FAIL: --no-rc first differs"; exit 1; }
node ../defcheck.js "$M" --bogus-opt > "$W/out3.txt" 2> "$W/err.txt"; [ $? = 2 ] && grep -q "unknown option --bogus-opt" "$W/err.txt" && [ "$(wc -l < "$W/err.txt")" = 1 ] || { echo "FAIL: unknown option not a usage line"; exit 1; }
node ../defcheck.js "$W/no-such-mod" > "$W/out3.txt" 2> "$W/err.txt"; [ $? = 2 ] && grep -q "mod folder not found" "$W/err.txt" || { echo "FAIL: missing folder not a usage line"; exit 1; }
node ../defcheck.js "$M" --exe goh > "$W/out3.txt" 2> "$W/err.txt"; [ $? = 2 ] && grep -q "PORT-171" "$W/err.txt" || { echo "FAIL: --exe goh refusal"; exit 1; }
node ../defcheck.js "$M" --exe bogus 2> "$W/err.txt"; [ $? = 2 ] && grep -q "PORT-171" "$W/err.txt" || { echo "FAIL: --exe bogus"; exit 1; }
mkdir -p "$W/gohgame/binaries/x64" && : > "$W/gohgame/binaries/x64/call_to_arms.exe"   # a GoH game folder with no --exe: refused too
node ../defcheck.js "$M" --game "$W/gohgame" > "$W/out3.txt" 2> "$W/err.txt"; [ $? = 2 ] && grep -q "PORT-171" "$W/err.txt" || { echo "FAIL: GoH --game refusal"; exit 1; }
node exedata.js ../defcheck.js "$M" || { echo "FAIL: --exe reaches the data (exedata.js)"; exit 1; }
echo PASS
