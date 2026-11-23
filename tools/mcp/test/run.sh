#!/bin/sh
# mcp regression: every test/*.test.js (framework and knowledge here; mod, play, gui ... add test/<group>.test.js), then the catalog.
# A test file is a node script: prints "<name>: N passed[, M FAILED]", exit code not 0 on a failure. Helper: test/rpc.js.
#   sh tools/mcp/test/run.sh              all
#   sh tools/mcp/test/run.sh knowledge    only test/knowledge.test.js (the catalog check still runs)
# Author: Imperator_Aug (ARSENAL, ia-be031f6e)
d=$(cd "$(dirname "$0")" && pwd)
# Skill line limits (SKILL.md 60 lines, a sub-file 80): the catalog check names the files over the limit on every run and fails on
# them only with this switch. Off while the skills are being split; the coordinator turns it on by removing the '#'.
export ARSENAL_SKILL_LIMITS=1
fail=0; n=0
for f in "$d"/*.test.js; do
  [ -f "$f" ] || continue
  b=$(basename "$f" .test.js)
  if [ -n "$1" ] && [ "$1" != "$b" ]; then continue; fi
  n=$((n + 1))
  node "$f" || { echo "FAIL: $b.test.js"; fail=1; }
done
[ "$n" -gt 0 ] || { echo "FAIL: no test file ran"; fail=1; }
node "$d/../catalog.js" --check || fail=1
[ "$fail" = 0 ] || { echo FAIL; exit 1; }
echo PASS
