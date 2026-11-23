#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-4b7cbde0)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
F=fixture
C="node ../chains.js --chains-dir $F/chains --tools-dir $F/tools --game $F/game"
fail() { echo "FAIL: $1"; exit 1; }

# 1. dry validation: seeded defects (a dry run of defective chains exits 1)
$C --all --mod e2e_test --dry -q > out.txt
cat out.txt
grep -v '^#' truth.md | sed 's/: / /' | sort > want.txt
grep -E '^chains/' out.txt | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || fail "dry findings differ from truth.md"
grep -q 'chain d_clean: DRY-OK 2/2' out.txt || fail "d_clean not DRY-OK"

# 2. run: stop at first failing step, record it, continue with the next chain
R="node ../chains.js --chains-dir $F/runchains --tools-dir $F/tools --game $F/game"
$R --all --mod e2e_test --reset --out rep.json -q > run.txt; ec=$?
cat run.txt
[ $ec -eq 1 ] || fail "run with failing chains must exit 1 (got $ec)"
grep -q 'chain r_a_pass: PASS 2/2' run.txt || fail "r_a_pass"
grep -q 'chain r_b_fail: FAIL 1/3 steps - failed at step 2' run.txt || fail "r_b_fail stop point"
grep -q 'chain r_c_exit: FAIL 1/2 steps - failed at step 2' run.txt || fail "r_c_exit regex step"
grep -q 'chain r_d_after: PASS 1/1' run.txt || fail "chain after a failure must still run"
node -e "
const r=require('./rep.json'), b=r.chains.find(c=>c.name==='r_b_fail'), a=r.chains.find(c=>c.name==='r_a_pass');
if(r.chains.length!==4||b.failedStep!==2||b.steps[2].status!=='skip'||!/boom ran/.test(b.steps[1].tail)||b.steps[1].exit!==3||a.status!=='pass') process.exit(1)" || fail "rep.json content"
[ -f $F/game/mods/e2e_test/stray.txt ] && fail "--reset left stray.txt"

# 3. guard: mod folders other than e2e_test/e2e_test2 under the game are refused (exit 2); outside the game is allowed
$R r_a_pass --mod other > g.txt 2>&1; [ $? -eq 2 ] || fail "guard: --mod other must exit 2"
grep -q 'refusing' g.txt || fail "guard message"
$R r_a_pass --mod "$(pwd)/free_mod" -q > /dev/null || fail "mod outside game must be allowed"

# 4. real chains: dry-valid against the real tools (0 findings = every tool and flag exists)
node ../chains.js --all --mod e2e_test2 --dry -q > real.txt 2> real.err; ec=$?
tail -3 real.txt
[ $ec -eq 0 ] || { cat real.err; fail "real chains dry validation exit $ec"; }
grep -q '^0 findings' real.txt || fail "real chains dry findings"
n=$(grep -c 'DRY-OK' real.txt); [ "$n" -eq 6 ] || fail "expected 6 DRY-OK chains, got $n"
grep -q 'chain goh-mod: N/A - chains: not available for AS64' real.txt || fail "goh-mod must be N/A on as64"
# 4b. --target (game parity): vars, option tokens, n/a steps with the plain line, GoH --mod rules
node targets.js || fail "targets"
# 5. --workers: stubbed runner (no folder shared, --inst per worker, failing chain isolated)
node workers.js || fail "workers"
# 6. --dry assignment
$C --all --workers 2 --dry -q > wd.txt; grep -q "worker 1 -> mods/e2e_test inst 1: d_clean, d_def, d_missing" wd.txt || fail "dry assignment"
grep -q "worker 2 -> mods/e2e_test2 inst 2: d_copy, d_flag, d_write" wd.txt || fail "dry assignment w2"
node ../chains.js --all --workers 2 --mod e2e_test2 --dry -q | grep -E "worker [12] ->"
node ../chains.js --all --workers 2 --dry -q | grep -q "inst 2" || fail "real dry assign"
$C --all --workers 3 --dry -q | grep -q "worker 3 -> mods/e2e_test3 inst 3" || fail "workers 3 assignment"
node ../chains.js --all --workers 9 --dry >/dev/null 2>&1; [ $? -eq 2 ] || fail "workers 9 must exit 2"
echo PASS
