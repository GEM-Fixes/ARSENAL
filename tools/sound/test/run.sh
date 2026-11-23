#!/bin/sh
# sound tests: every tools/sound/test/*.test.js plus tools/lib/test/wav.test.js, with a scratch dir; each prints PASS as its last line.
# Author: Imperator_Aug (ARSENAL, ia-c9bdf51d)
cd "$(dirname "$0")/../../.." || exit 2
W="${1:-${TMPDIR:-/tmp}/sound-test-$$}"
mkdir -p "$W"
bad=0; n=0
for t in tools/sound/test/*.test.js tools/lib/test/wav.test.js; do
  [ -f "$t" ] || continue
  n=$((n+1))
  b=$(basename "$t" .test.js)
  out=$(node "$t" "$W/$b" 2>&1); rc=$?
  last=$(printf '%s\n' "$out" | tail -n 1)
  if [ $rc -ne 0 ] || [ "$last" != "PASS" ]; then bad=$((bad+1)); echo "FAIL $b"; printf '%s\n' "$out" | tail -n 15; else echo "ok $b"; fi
done
if [ $n -eq 0 ]; then echo "no tests"; echo FAIL; exit 1; fi
if [ $bad -ne 0 ]; then echo "$bad of $n failed"; echo FAIL; exit 1; fi
echo PASS
