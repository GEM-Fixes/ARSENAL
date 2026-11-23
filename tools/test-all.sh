#!/bin/sh
# run every tool's regression test + lib unit tests. exit 1 if any fails
#   sh test-all.sh             everything, TEST_JOBS suites at once (default 6)
#   sh test-all.sh --changed [--since REF]   only suites whose tool source reaches a file changed against HEAD (or REF), found by sessions/testdeps.js; everything if dist or this file changed; prints the chosen suites
#   per-suite wall seconds are appended to ../../run/testall-times.csv (date,suite,seconds; suite TOTAL = whole run)
#   --wait                     wait for another test-all on this checkout instead of exiting 3
# one test-all per checkout at a time: a lock dir under the OS temp dir (pid inside, stale lock of a dead pid is taken over)
# Author: Imperator_Aug (ARSENAL, ia-5dc32b31)
cd "$(dirname "$0")"; fail=0
waitlock=0; changed=0; since=""; prev=""; for a in "$@"; do case "$a" in --wait) waitlock=1;; --changed) changed=1;; esac; [ "$prev" = --since ] && since=$a; prev=$a; done
lock="${TMPDIR:-/tmp}/test-all-$( (pwd -W 2>/dev/null || pwd) | tr -c 'A-Za-z0-9' _).lock"
while ! mkdir "$lock" 2>/dev/null; do
  op=$(cat "$lock/pid" 2>/dev/null)
  if [ -n "$op" ] && ! kill -0 "$op" 2>/dev/null; then echo "test-all: stale lock of dead pid $op taken over"; rm -rf "$lock"; continue; fi
  [ -z "$op" ] && sleep 1 && [ ! -f "$lock/pid" ] && [ -d "$lock" ] && { echo "test-all: lock without pid, taken over: $lock"; rm -rf "$lock"; continue; }
  [ $waitlock = 1 ] || { echo "test-all: another test-all (pid ${op:-?}) holds $lock on this checkout; rerun with --wait, or remove the dir if that run is gone"; exit 3; }
  sleep 5
done
echo $$ > "$lock/pid"; trap 'rm -rf "$lock"' EXIT; trap 'exit 130' INT TERM
# OneDrive locks just-written fixtures for a moment: retry sync fs writes in every node child
NODE_OPTIONS="--require \"$(pwd -W 2>/dev/null || pwd)/lib/fsretry.js\""; export NODE_OPTIONS
jobs=${TEST_JOBS:-6}
tests=$(ls */test/run.sh | grep -v '^lib/test/run.sh$')
whole=1
if [ $changed = 1 ]; then
  # reverse-dependency walk (sessions/testdeps.js): a suite runs when its tool source reaches a changed file through require/relative paths.
  # MODE ALL (dist/ or this file changed, or the walk failed): everything. MODE LIB: also lib unit tests + sarif-all. --since REF: compare with REF instead of HEAD.
  dep=$(node sessions/testdeps.js ${since:+--since "$since"} 2>/dev/null)
  mode=$(echo "$dep" | sed -n 's/^MODE //p')
  case "$mode" in
    SOME|LIB)
      [ "$mode" = SOME ] && whole=0
      tests=$(echo "$dep" | grep -E '/test/run\.sh$' | tr '\n' ' ')
      echo "test-all: --changed${since:+ since $since}: mode $mode, $(echo $tests | wc -w | tr -d ' ') of $(ls */test/run.sh | grep -vc '^lib/test/run.sh$') suites: $tests"
      echo "$dep" | grep '^# ' | sed 's/^/test-all:   /' ;;
    *) echo "test-all: --changed: mode ${mode:-unknown}, running everything" ;;
  esac
fi
t0=$(date +%s); tm=$(mktemp -d); tdate=$(date +%Y-%m-%dT%H:%M)
# every suite and the tools it spawns use a scratch cache store, never the user's (lib/cachestore)
ARSENAL_TEST_STORE="$tm/store"; export ARSENAL_TEST_STORE
if [ $whole = 1 ]; then s=$(date +%s); node lib/test/test.js || fail=1; echo "lib-test,$(($(date +%s)-s))" > "$tm/lib_test"; s=$(date +%s); node lib/test/gamewatch.test.js || fail=1; for t in cachestore modtree gameview; do [ -f lib/test/$t.test.js ] || continue; node lib/test/$t.test.js || fail=1; done; echo "lib-gamewatch,$(($(date +%s)-s))" > "$tm/lib_gamewatch"; fi
# suites sharing fixtures or global state stay serial: they run after the parallel set
# prove writes tools/testrun/scenarios/mods/prove9 (prove.js has no dir option yet), so it runs beside testrun, not with it
serial='^(modmove|testrun|gamewatch|inplay|uidrive|prove)/'
out=$(mktemp -d)
run1() { s=$(date +%s); r=$(sh "$1" 2>&1 | tail -1); echo "${1%%/*}: $r" > "$out/$(echo "$1" | tr '/' '_')"; echo "${1%%/*},$(($(date +%s)-s))" > "$tm/$(echo "$1" | tr '/' '_')"; }
n=0
for t in $tests; do
  echo "$t" | grep -qE "$serial" && continue
  run1 "$t" & n=$((n+1)); [ $((n % jobs)) = 0 ] && wait
done
wait
for t in $tests; do echo "$t" | grep -qE "$serial" && run1 "$t"; done
cat "$out"/* 2>/dev/null
for f in "$out"/*; do [ -f "$f" ] || continue; case "$(cat "$f")" in *": PASS"|*": PASS "*) ;; *": SKIP"|*": SKIP"[:\ ]*) skip=$((${skip:-0}+1));; *) fail=1; echo "FAILED: $(cat "$f")";; esac; done
# a suite's last line: "PASS", "PASS <detail>" (exexref: PASS x86) = passed; "SKIP..." (covanm without its add-on) = not run, not a failure
[ "${skip:-0}" = 0 ] || echo "skipped: $skip"
rm -rf "$out"
if [ $whole = 1 ]; then
  echo "== sarif-all (registry linters: --format sarif --no-rc)"
  node dist/test/sarif-all.js || { echo "sarif-all: FAIL"; fail=1; }
fi
mkdir -p ../../run 2>/dev/null; { for f in "$tm"/*; do [ -f "$f" ] && echo "$tdate,$(cat "$f")"; done; echo "$tdate,TOTAL,$(($(date +%s)-t0))"; } >> ../../run/testall-times.csv 2>/dev/null; rm -rf "$tm"
[ $fail = 0 ] && echo ALL PASS || { echo SOME FAILED; exit 1; }
