#!/bin/sh
# testplan test: every *.test.js of this folder, each with its own scratch dir (argv[2]); no game install needed.
# Scratch: $TESTPLAN_SCRATCH when set (a big drive), else a temp dir; removed at the end. Caches go there too (ARSENAL_CACHE).
# Author: Imperator_Aug (ARSENAL, ia-db20c48d)
T="$(cd "$(dirname "$0")" && pwd)"
if [ -n "$TESTPLAN_SCRATCH" ]; then W="$TESTPLAN_SCRATCH/run-$$"; mkdir -p "$W" || exit 1; else W="$(mktemp -d)" || exit 1; fi
W="$(cd "$W" && { pwd -W 2>/dev/null || pwd; })"
trap 'rm -rf "$W"' EXIT
export ARSENAL_CACHE="$W/cache" AS2_NO_STEAM=1
unset AS2_GAME GOH_GAME
cd "$T" || exit 1
bad=0; n=0
for t in *.test.js; do
  [ -f "$t" ] || continue
  n=$((n + 1))
  node "$t" "$W/${t%.test.js}" > "$W/$t.out" 2>&1; c=$?
  tail -n 1 "$W/$t.out" | sed "s/^/$t: /"
  if [ $c -ne 0 ]; then bad=$((bad + 1)); grep -v '^ok ' "$W/$t.out" | head -n 60; fi
done
[ $n -gt 0 ] || { echo "FAIL: no *.test.js"; exit 1; }
[ $bad -eq 0 ] || { echo "FAIL: $bad of $n test files"; exit 1; }
echo PASS
