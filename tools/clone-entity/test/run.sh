#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-63a896c1)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture + outputs never touch tracked files
node mkfixture.js || exit 1
node check.js > "$W/out.txt"
cat "$W/out.txt"
grep -v '^#' truth.md | sort > "$W/want.txt"
grep -v 'ASSERT' "$W/out.txt" | sort > "$W/got.txt"
grep -q ASSERT "$W/out.txt" && { echo "FAIL: assertions"; exit 1; }
node breed-test.js || { echo "FAIL: breed mode"; exit 1; }
node asset-test.js || { echo "FAIL: asset mode"; exit 1; }
node exe-test.js > "$W/exe.out" || { grep -v '^OK ' "$W/exe.out"; echo "FAIL: --exe / GoH (game parity)"; exit 1; }
diff "$W/want.txt" "$W/got.txt" || { echo "FAIL: findings differ from truth.md"; exit 1; }
echo PASS
