#!/bin/sh
# mapviz tests: tools/mapviz/test/*.test.js, then every part's test/*.test.js (../*/test, ../lib/*/test, ../rules/*/test,
# ../paint/*/test). Each test runs alone with a scratch dir and ARSENAL_CACHE inside it; it passes when it exits 0 and
# its last line starts with "PASS mapviz". Parts not built yet have no tests and are simply not found.
# usage: sh tools/mapviz/test/run.sh [scratch dir]
# Author: Imperator_Aug (ARSENAL, ia-94e92189)
cd "$(dirname "$0")/.." || exit 2
W="$1"
if [ -z "$W" ]; then
  W=$(node -e "const fs=require('fs'),p=require('path'),o=require('os');process.stdout.write(fs.mkdtempSync(p.join(o.tmpdir(),'mapviz-test-')))") || exit 2
  own=1
fi
bad=0; n=0
for t in test/*.test.js */test/*.test.js lib/*/test/*.test.js rules/*/test/*.test.js paint/*/test/*.test.js; do
  [ -f "$t" ] || continue
  n=$((n+1))
  name=$(printf '%s' "$t" | sed -e 's#/test/#/#' -e 's#\.test\.js$##')
  s=$(printf '%s' "$name" | tr '/' '_')
  out=$(ARSENAL_CACHE="$W/$s/cache" node "$t" "$W/$s" 2>&1); rc=$?
  last=$(printf '%s\n' "$out" | tail -n 1)
  case "$last" in
    "PASS mapviz"*) ok=1 ;;
    *) ok=0 ;;
  esac
  if [ $rc -ne 0 ] || [ $ok -ne 1 ]; then bad=$((bad+1)); echo "FAIL $name"; printf '%s\n' "$out" | tail -n 15; else echo "ok $name: $last"; fi
done
if [ $n -eq 0 ]; then echo "no tests"; echo FAIL; exit 1; fi
if [ $bad -ne 0 ]; then echo "$bad of $n failed"; echo FAIL; exit 1; fi
if [ -n "$own" ]; then node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true})" "$W"; fi
echo PASS
