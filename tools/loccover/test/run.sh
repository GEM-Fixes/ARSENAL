#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-c987a087)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture, truth and outputs never touch tracked files
node mkfixture.js || exit 1
node ../loccover.js "$W/fixture/game/mods/m" -q > "$W/out.txt"
cat "$W/out.txt"
grep -v '^#' "$W/truth.md" | sed 's/: / /' | sort > "$W/want.txt"
grep -v 'findings$\|^by code\| lng files$' "$W/out.txt" | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > "$W/got.txt"
diff "$W/want.txt" "$W/got.txt" || { echo "FAIL: findings differ from truth.md"; exit 1; }
(sh ../../binhdr/test/rcwire.sh node ../loccover.js "$W/fixture/game/mods/m") || exit 1
node mkas64.js || exit 1
node mkgoh.js || { echo "FAIL: GoH text branch (mkgoh.js)"; exit 1; }
node ../loccover.js "$W/fixture/game/mods/m" --no-rc 2>&1 | grep -q 'not defined in any .lng' || { echo "FAIL: AS2 wording changed"; exit 1; }
i=$(node inc.test.js); echo "$i"; [ "$i" = "inc ok" ] || { echo "FAIL: (include) in a mod .lng (LOC-21)"; exit 1; }
echo PASS
