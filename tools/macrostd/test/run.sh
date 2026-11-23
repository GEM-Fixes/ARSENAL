#!/bin/sh
# macrostd regression (fixture game + mod built by test.js in a temp dir, defects in truth.md); last line PASS on success
# test.js = core + fmt/indent/dead/names; each further step has its own test/<step>.test.js (same fixture style, exit 1 on failure)
# Author: Imperator_Aug (ARSENAL, ia-1a65e6c7)
d=$(dirname "$0")
rc=0
node "$d/test.js" > "$d/.core.out" 2>&1 || rc=1
grep -v '^PASS$' "$d/.core.out"; rm -f "$d/.core.out"
for t in "$d"/*.test.js; do
	[ -f "$t" ] || continue
	echo "== $(basename "$t")"
	node "$t" || rc=1
done
if [ $rc = 0 ]; then echo PASS; else echo FAIL; exit 1; fi
