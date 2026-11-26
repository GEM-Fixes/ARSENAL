#!/bin/sh
# regression: bad/ findings (file:line: CODE) must equal truth.md exactly; ok/ must have 0
# Author: Imperator_Aug (ARSENAL, ia-4079ff1e)
d=$(dirname "$0")
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node "$d/mkfixture.js"
node "$d/../sdllint.js" "$d/bad" -q | grep -E '^[a-z]+\.def:[0-9]+: ' | cut -d' ' -f1,2 | sort > "$G/.got"
grep -E '^[a-z]+\.def:' "$d/truth.md" | sort > "$G/.want"
if cmp -s "$G/.got" "$G/.want"; then b=ok; else b=BAD; diff "$G/.got" "$G/.want"; fi
o=$(node "$d/../sdllint.js" "$d/ok" -q | tail -3 | head -1 | cut -d' ' -f1)
echo "bad $b ok-findings $o"; rm -f "$G/.got" "$G/.want"
node "$d/noise.test.js" || exit 1
node "$d/vfs.test.js" || exit 1
node "$d/false.test.js" || exit 1
node "$d/chk.test.js" || exit 1
node "$d/det.test.js" || exit 1
node "$d/exe.test.js" || exit 1
node "$d/undo.test.js" || exit 1
node "$d/par.test.js" || exit 1
node "$d/listing.test.js" || exit 1
node "$d/filecache.test.js" || exit 1
[ "$b" = ok ] && [ "$o" = 0 ] && echo PASS
