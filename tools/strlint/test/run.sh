#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-b2bb89c0)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture, truth and outputs never touch tracked files
node mkfixture.js || exit 1
node ../strlint.js "$W/fixture/mod" -q > "$W/out.txt"
cat "$W/out.txt"
grep -v '^#' "$W/truth.md" | sed 's/: / /' | sort > "$W/want.txt"
grep -v 'findings$\|^by code\| files$' "$W/out.txt" | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > "$W/got.txt"
diff "$W/want.txt" "$W/got.txt" || { echo "FAIL: findings differ from truth.md"; exit 1; }
(sh ../../binhdr/test/rcwire.sh node ../strlint.js "$W/fixture/mod") || exit 1
node gohfix.js || { echo "FAIL: game branches (gohfix.js)"; exit 1; }
node exedata.js ../strlint.js "$W/fixture/mod" --no-rc || { echo "FAIL: --exe reaches the data (exedata.js)"; exit 1; }
echo PASS
