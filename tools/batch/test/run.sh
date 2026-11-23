#!/bin/sh
# batch test: plan (real rows2scn + real lint), run (stub testrun/logtriage/rows), no-workers refusal, ceiling (real testrun --mock)
# Author: Imperator_Aug (ARSENAL, ia-4e9991ce)
cd "$(dirname "$0")"
B=../batch.js
fail() { echo "FAIL: $1"; exit 1; }
node mkfixture.js || exit 1
rm -rf w w2 w3
# text outputs and the stub log go to a per-run temp folder: no tracked file in test/ (e.txt, plan.txt) gets this checkout's path
O=$(mktemp -d) && O=$(cd "$O" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$O"' EXIT
export BATCH_STUB_LOG="$O/stub.log"
: > $O/stub.log
STUBS="--testrun-bin stub-testrun.js --logtriage-bin stub-logtriage.js --rows-bin stub-rows.js"

# 1. plan: counts, drafts merged, bad draft removed from queue
node $B plan --limits fixture/limits --drafts fixture/drafts --work w --testrun-bin stub-testrun.js > $O/plan.txt || fail "plan exit"
cat $O/plan.txt
grep -q '^plan: runnable 4, manual 1 ' $O/plan.txt || fail "plan counts"
grep -q 'lint-fail 1, launches needed 4 (4 with overlap), stage folders needed 1 at once' $O/plan.txt || fail "plan launches/stage"
grep -q '^LINT_FAIL zd-bad: LINT_NEGATIVE_ONLY' $O/plan.txt || fail "lint fail line"
[ -f w/scn/mods/zd-01/mod.info ] || fail "draft mod not copied"
node -e "
const q=JSON.parse(require('fs').readFileSync('w/queue/queue.json','utf8'));
const n=q.queue.map(x=>x.name).join();
if(n!=='zz-01,zz-02,zz-04,zd-01,zd-man')throw new Error('queue '+n);
if(q.queueArg.split(',').length!==5||q.queueArg.includes('zd-bad'))throw new Error('queueArg');
if(q.queue[0].launch!==1||q.queue[1].launch!==1||q.queue[2].launch!==2)throw new Error('launch grouping');
" || fail "queue.json"

# 2. run: stubbed testrun; report, verbs, findings, no --apply
node $B run --work w --workers 2 --game fixture --stage e2e_test,e2e_test2 $STUBS --testrun-arg --mock > $O/run.txt || fail "run exit"
cat $O/run.txt
for f in batch-report.md batch-report.json report.json; do [ -f w/$f ] || fail "missing $f"; done
grep -q -- '--workers 2' $O/stub.log || fail "workers not passed"
grep -q -- '--stage-as e2e_test,e2e_test2' $O/stub.log || fail "stage-as not passed"
grep -q -- '--backup' $O/stub.log || fail "backup not passed"
grep -q -- '--all-instances' $O/stub.log || fail "all-instances not used"
grep -q -- '--apply' $O/stub.log && fail "--apply must never be passed"
grep -q -- '--apply' w/batch-report.md || fail "report must print the apply command"
grep -q 'verdicts .*--apply' w/batch-report.md || fail "apply command shape"
node -e "
const j=JSON.parse(require('fs').readFileSync('w/batch-report.json','utf8'));
const t=j.totals;
if(t.scenarios!==5||t.byStatus.PASS!==3||t.byStatus.FAIL!==1||t.byStatus.MANUAL!==1)throw new Error('status '+JSON.stringify(t));
if(t.verdictVerbs.PASS!==3||t.verdictVerbs.FAIL!==1||t.verdictVerbs.MANUAL!==1)throw new Error('verbs '+JSON.stringify(t.verdictVerbs));
if(t.newLogFindings!==1||j.logFindings[0].code!=='LOG_EXCEPTION')throw new Error('findings');
if(typeof j.wallMs!=='number')throw new Error('wall');
" || fail "batch-report.json"
grep -q 'ZZ-02 | FAIL' w/batch-report.md || fail "md verdict table"

# 2b. instance base, same-fail stop, rerun pass through; folder allowlist and instance range enforced
: > $O/stub.log
node $B run --work w --workers 2 --inst-from 3 --max-same-fail 2 --rerun w/report.json --game fixture --stage e2e_test5,e2e_test8 $STUBS --testrun-arg --mock > /dev/null || fail "run2b exit"
grep -q -- '--inst 3' $O/stub.log || fail "inst-from not passed"
grep -q -- '--max-same-fail 2' $O/stub.log || fail "max-same-fail not passed"
grep -q -- '--rerun' $O/stub.log || fail "rerun not passed"
grep -q -- '--stage-as e2e_test5,e2e_test8' $O/stub.log || fail "stage-as e2e_test8"
node $B run --work w --workers 2 --stage e2e_test,e2e_test9 $STUBS 2> $O/e2.txt; [ $? -ne 0 ] && grep -q e2e_test9 $O/e2.txt || fail "e2e_test9 must be refused"
node $B run --work w --workers 3 --inst-from 8 $STUBS 2> $O/e2.txt; [ $? -ne 0 ] && grep -q 'instances 1..9' $O/e2.txt || fail "instance range"
rm -f $O/e2.txt

# 3. testrun without --workers: clear refusal
mkdir -p nw && echo "// no workers here" > nw/testrun.js
node $B run --work w --workers 2 --testrun-bin nw/testrun.js > /dev/null 2>$O/nw.txt; rc=$?
[ $rc -eq 0 ] && fail "stub-less bin should have run"   # explicit --testrun-bin skips the source probe by design
rm -rf nw $O/nw.txt
node $B run --work w2 --workers 2 2> $O/e.txt; [ $? -ne 0 ] && grep -q 'run plan first' $O/e.txt || fail "missing queue message"

# 4. ceiling with the real testrun mock (ids offset above 9: real instance dirs untouched)
node $B ceiling --max 3 --work w3 --testrun-arg --mock --testrun-arg --logdir --testrun-arg "$(pwd)/w3/lg" --testrun-arg --archive --testrun-arg "$(pwd)/w3/ar" --inst-offset 4810 > $O/ce.txt || fail "ceiling exit"
cat $O/ce.txt
grep -q '^ceiling: ' $O/ce.txt || fail "ceiling line"
node -e "
const c=JSON.parse(require('fs').readFileSync('w3/ceiling.json','utf8'));
if(c.steps.length<1||c.steps[0].instances!==1||typeof c.steps[0].freeMemMB!=='number')throw new Error('steps');
if(c.maxOk<1)throw new Error('maxOk '+JSON.stringify(c));
const s=JSON.parse(require('fs').readFileSync('w3/ceiling-hello.json','utf8'));
if(s.steps.length||s.mods.length||s.verdict[0].reply!=='mp_state')throw new Error('scenario');
" || fail "ceiling.json"
node ../../testrun/testrun.js --lint w3/ceiling-hello.json | grep -q '^0 findings' || fail "ceiling scenario lint"

# 5. MoW:AS2 and GoH: run and ceiling refuse at the start, one line, exit 2, nothing started (stub log stays empty)
: > $O/stub.log
node $B run --work w --workers 1 --exe mowas2 $STUBS 2> $O/g.txt; rc=$?
[ $rc -eq 2 ] && grep -q '^batch: not available for MoW:AS2: mowas_2.exe has no -control and no -instance.*(limits TST-19, TST-130)$' $O/g.txt || fail "mowas2 word refusal ($rc): $(cat $O/g.txt)"
node $B ceiling --exe fixture/x/mowas_2.exe --game fixture 2> $O/g.txt; [ $? -eq 2 ] && grep -q 'not available for MoW:AS2' $O/g.txt || fail "mowas_2.exe file refusal"
mkdir -p gohfx/binaries/x64 && echo x > gohfx/binaries/x64/call_to_arms.exe
node $B ceiling --game gohfx --max 1 --work w3 2> $O/g.txt; [ $? -eq 2 ] && grep -q '^batch: not available for GoH: GoH has no control pipe.*(modweb/testing/goh-drive.md)$' $O/g.txt || fail "goh install refusal: $(cat $O/g.txt)"
node $B run --work w --workers 1 --exe goh $STUBS 2> $O/g.txt; [ $? -eq 2 ] && grep -q 'not available for GoH' $O/g.txt || fail "goh word refusal"
mkdir -p mowfx && echo x > mowfx/mowas_2.exe
node $B run --work w --workers 1 --game mowfx $STUBS 2> $O/g.txt; [ $? -eq 2 ] && grep -q 'not available for MoW:AS2' $O/g.txt || fail "mowas_2-only install refusal"
[ -s $O/stub.log ] && fail "a refused run started a stub"
rm -rf gohfx mowfx $O/g.txt

echo PASS
