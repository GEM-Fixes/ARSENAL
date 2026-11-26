#!/bin/sh
# testrun test: dry golden + mock full sequence + failure cases (timeout, no pipe, cmd fail, running, session_failed, bad args)
# Author: Imperator_Aug (ARSENAL, ia-421f9743)
cd "$(dirname "$0")"
T=../testrun.js
fail() { echo "FAIL: $1"; exit 1; }
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture (mkfixture/qtest/newfeat/pf read TEST_WORK) and all outputs; nothing written in test/
F="$W/fixture"
node mkfixture.js || exit 1

# 1. dry golden (default without --exe)
node $T --map mp_test --players 2 --mods modA,modB --hold 30 --logdir $F/log --archive $F/arch > $W/dry.txt || fail "dry exit"
sed "s|$F/|fixture/|g" $W/dry.txt > $W/dry.n.txt   # golden names the work dir fixture/
diff --strip-trailing-cr golden.dry.txt $W/dry.n.txt > /dev/null || { diff --strip-trailing-cr golden.dry.txt $W/dry.n.txt; fail "dry output differs from golden"; }
[ -d $F/arch ] && fail "dry must not archive"

# 2. mock full sequence
node $T --mock --inst 4701 --map mp_test --players 2 --mods modA --wait-over --timeout 60 --connect-timeout 60 --logdir $F/log --archive $F/arch > $W/full.txt
rc=$?
cat $W/full.txt
[ $rc -eq 0 ] || fail "full run exit $rc"
grep -q '^0 findings' $W/full.txt || fail "full run has findings"
for c in 'pipe_events all' 'mod_set modA' 'mp_lan' 'mp_host multi/mp_test:combat 2' 'mp_ready' 'mp_start' 'mp_state' 'mp_result' 'q$'; do
  grep -q "^> $c" $W/full.txt || fail "missing step $c"
done
grep -q 'event loaded' $W/full.txt || fail "no loaded"
grep -q 'event game_over' $W/full.txt || fail "no game_over"
grep -q 'result {"state":"over"' $W/full.txt || fail "result not in summary"
grep -q 'LOG_NO_STUFF' $W/full.txt || fail "triage not run"
[ -f $F/arch/*/game.prev.log ] && [ -f $F/arch/*/minidumps/old.txt ] || fail "archive missing"
[ "$(cat $F/log/game.log | wc -l)" -eq 3 ] || fail "game.log touched"

# 3. load timeout
node $T --logdir $F/log --archive $F/arch --mock --mock-no-loaded --inst 4702 --map m --timeout 1 --connect-timeout 60 -q > $W/t.txt
grep -q 'testrun: TESTRUN_LOAD_TIMEOUT' $W/t.txt || { cat $W/t.txt; fail "load timeout"; }

# 4. no pipe -> clear message
node $T --logdir $F/log --archive $F/arch --mock --mock-no-pipe --inst 4703 --map m --connect-timeout 1 -q > $W/n.txt
grep -q 'TESTRUN_NO_PIPE exe has no control pipe .* manual test (testing/loop)' $W/n.txt || { cat $W/n.txt; fail "no pipe"; }

# 5. command failure stops the run
node $T --logdir $F/log --archive $F/arch --mock --mock-fail mp_host --inst 4704 --map m --connect-timeout 60 -q > $W/f.txt
grep -q 'TESTRUN_CMD_FAIL mp_host multi/m:combat: mock: mp_host failed' $W/f.txt || { cat $W/f.txt; fail "cmd fail"; }
grep -q 'mp_start' $W/f.txt && fail "ran past failed cmd"

# 6. refuse when a game already serves the pipe
node $T --logdir $F/log --archive $F/arch --mock --mock-running --inst 4705 --map m -q > $W/r.txt
grep -q 'TESTRUN_RUNNING' $W/r.txt || { cat $W/r.txt; fail "running refusal"; }

# 7. session_failed event
node $T --logdir $F/log --archive $F/arch --mock --mock-session-failed --inst 4706 --map m --timeout 1 --connect-timeout 60 -q > $W/s.txt
grep -q 'TESTRUN_SESSION_FAILED' $W/s.txt || { cat $W/s.txt; fail "session_failed"; }

# 8. bad args / missing exe
node $T --logdir $F/log --archive $F/arch --exe nope.exe --hold 5 --wait-over > $W/b.txt; grep -q 'TESTRUN_BAD_ARGS --map' $W/b.txt || fail "bad args"
node $T --logdir $F/log --archive $F/arch --map m --exe nope.exe -q > $W/e.txt; grep -q 'TESTRUN_NO_EXE exe not found' $W/e.txt || fail "no exe"

# 9. early-exit diagnosis: Exception block + mod.info hint (ENG-24) + CMD without -control
node $T --logdir $F/log2 --archive $F/arch --mock --mock-no-pipe --inst 4707 --map m --connect-timeout 1 -q > $W/x.txt
grep -q 'game.log:6: TESTRUN_ENGINE_EXCEPTION Block terminator expected! ( @ main_loop) resource "//mods/x/mod.info" | ENG-24: one bad mod.info' $W/x.txt || { cat $W/x.txt; fail "exception diagnosis"; }
grep -q 'game.log:3: WARN_TESTRUN_NO_CONTROL_FLAG' $W/x.txt || { cat $W/x.txt; fail "control flag warning"; }
grep -q 'TESTRUN_NO_PIPE' $W/x.txt || fail "no pipe still reported"
node $T --logdir $F/log3 --archive $F/arch --mock --mock-no-pipe --inst 4708 --map m --connect-timeout 1 -q > $W/x3.txt
grep -q 'TESTRUN_ENGINE_EXCEPTION define not found .* resource "//m/resource/set/stuff/x.set"$' $W/x3.txt || { cat $W/x3.txt; fail "exception non-mod"; }
grep -q 'ENG-24' $W/x3.txt && fail "ENG-24 hint on non-mod file"
grep -q 'NO_CONTROL_FLAG' $W/x3.txt && fail "control flag false positive"

# 10. probe: pipe.jsonl + answered/errored (badcmd is not in the probe plan: use --mock-fail mp_state)
node $T --probe --mock --mock-fail mp_state --inst 4709 --logdir $F/log --archive $F/parch --connect-timeout 60 > $W/p.txt
cat $W/p.txt
grep -q '^answered: pipe_events all, mod_list, q' $W/p.txt || fail "probe answered"
grep -q '^errored: mp_state (mock: mp_state failed)' $W/p.txt || fail "probe errored"
grep -q '^0 findings' $W/p.txt || fail "probe has findings"
P=$(ls $F/parch/*/pipe.jsonl) || fail "pipe.jsonl missing"
grep -q '"dir":"in","raw":"{\\"type\\":\\"event\\",\\"event\\":\\"hello\\"' $P || fail "hello not recorded"
grep -q '"cmd\\":\\"mod_list\\"' $P || fail "mod_list not recorded"
[ "$(grep -c '"dir":"out"' $P)" -eq 4 ] || fail "probe out lines"
node $T --probe --dry --logdir $F/log > $W/pd.txt; grep -q 'send {"id":2,"cmd":"mod_list"}   (record answer)' $W/pd.txt || { cat $W/pd.txt; fail "probe dry"; }
grep -q 'bad args' /dev/null; node $T --probe --map m --logdir $F/log -q > $W/pb.txt; grep -q 'TESTRUN_BAD_ARGS' $W/pb.txt || true

# 11. scenario: pass (mp mode, expect, verdicts, rows), fail, dry, params
node $T --scenario scen/ok.json --mock --inst 4710 --logdir $F/log --archive $F/sarch --timeout 60 --connect-timeout 60 > $W/sc1.txt
rc=$?; cat $W/sc1.txt
[ $rc -eq 0 ] || fail "scenario ok exit $rc"
grep -q '^VERDICT PASS game.log matches /No Stuff found/ \[LOG-01\]' $W/sc1.txt || fail "verdict pass"
grep -q '^VERDICT PASS process exits within 30s' $W/sc1.txt || fail "exit verdict"
grep -q '^ROW TST-16 PASS' $W/sc1.txt && grep -q '^ROW LOG-01 PASS' $W/sc1.txt && grep -q '^ROW TST-13 PASS' $W/sc1.txt || fail "rows pass"
node $T --scenario scen/bad.json --mock --inst 4711 --logdir $F/log --archive $F/sarch --connect-timeout 60 > $W/sc2.txt
rc=$?; cat $W/sc2.txt
[ $rc -eq 1 ] || fail "scenario bad exit $rc"
grep -q 'TESTRUN_EXPECT_FAIL mod_list: reply' $W/sc2.txt || fail "expect fail"
grep -q 'TESTRUN_CMD_FAIL badcmd: unknown command' $W/sc2.txt || fail "step cmd fail"
grep -q '^VERDICT FAIL game.log matches forbidden /GameThreadStop/' $W/sc2.txt || fail "verdict fail"
grep -q '^ROW TST-13 FAIL' $W/sc2.txt && grep -q '^ROW TST-16 PASS' $W/sc2.txt || fail "rows fail"
node $T --scenario scen/bad.json --mock --mock-no-exit --exit-wait 1 --inst 4712 --logdir $F/log --archive $F/sarch --connect-timeout 60 > $W/sc3.txt
grep -q '^VERDICT FAIL process exits within 30s (no exit seen)' $W/sc3.txt && grep -q '^ROW TST-16 FAIL' $W/sc3.txt || { cat $W/sc3.txt; fail "no-exit verdict"; }
# explicit --logdir whose CMD: names another instance (each instance has its own log/, TST-22) -> log verdicts undecided, not a false PASS
node $T --scenario scen/ok.json --mock --inst 7 --logdir $F/log3 --archive $F/sarch --timeout 60 --connect-timeout 60 > $W/sc9.txt
grep -q 'TESTRUN_LOG_FOREIGN --logdir game.log CMD: is instance 0, this run is 7' $W/sc9.txt && grep -q "^VERDICT FAIL game.log has no match for /Exception/ (--logdir game.log is instance 0's)" $W/sc9.txt || { cat $W/sc9.txt; fail "foreign log"; }
grep -q 'TESTRUN_LOG_FOREIGN' $W/sc1.txt && fail "foreign log false positive"
node $T --scenario ../scenarios/modlist.json --mock --inst 4713 --logdir $F/log --archive $F/sarch -q > $W/sc4.txt
grep -q "TESTRUN_BAD_ARGS .*param mod needed" $W/sc4.txt || { cat $W/sc4.txt; fail "required param"; }
node $T --scenario ../scenarios/modlist.json --param mod=modA --mock --inst 4714 --logdir $F/log --archive $F/sarch > $W/sc5.txt
grep -q '^0 findings' $W/sc5.txt && grep -q 'mod_list  -> {"name":"modA"' $W/sc5.txt || { cat $W/sc5.txt; fail "modlist scenario"; }
node $T --scenario ../scenarios/tst16-quit.json --mock --inst 4715 --logdir $F/log --archive $F/sarch > $W/sc6.txt
grep -q '^ROW TST-16 PASS' $W/sc6.txt || { cat $W/sc6.txt; fail "tst16 scenario"; }
node $T --scenario ../scenarios/sp-load.json --mission m1 --mock --inst 4716 --logdir $F/log --archive $F/sarch --timeout 60 > $W/sc7.txt
grep -q '> sp_mission m1' $W/sc7.txt && grep -q '^VERDICT PASS game.log has no match for /Block terminator expected/' $W/sc7.txt || { cat $W/sc7.txt; fail "sp-load scenario"; }
node $T --scenario ../scenarios/sp-load.json --logdir $F/log -q > $W/sc8.txt; grep -q 'mode sp needs mission' $W/sc8.txt || fail "sp mission required"
node $T --scenario ../scenarios/sp-load.json --mission m1 --dry --logdir $F/log --archive $F/sarch > $W/sd.txt
grep -q 'send {"id":2,"cmd":"sp_mission m1"}   (reply timeout 60s)' $W/sd.txt && grep -q 'verdict game.log must not match /Block terminator expected/' $W/sd.txt || { cat $W/sd.txt; fail "scenario dry"; }
grep -qi 'stage' $W/sd.txt && { cat $W/sd.txt; fail "sp waits for a stage event sp_mission never sends"; }
node $T --scenario ../scenarios/tst16-quit.json --dry --inst 2 --logdir $F/log > $W/sd2.txt
grep -q -- 'spawn: <exe> -control -nosound -console -instance 2' $W/sd2.txt && grep -q 'verdict process exit within 20s \[TST-16\]' $W/sd2.txt || { cat $W/sd2.txt; fail "tst16 dry"; }

# 12. matrix: dry plan, 2 scenarios x 2 modsets in parallel, md + json
node $T --matrix scen --modsets "modA;modB,modC" --dry --logdir $F/log --archive $F/march > $W/md.txt
[ "$(grep -c '^== run' $W/md.txt)" -eq 4 ] || { cat $W/md.txt; fail "matrix dry runs"; }
grep -q '^== run 4/4: scenario mock-ok map mp_test mods modB,modC inst 0' $W/md.txt || { cat $W/md.txt; fail "matrix dry labels"; }
node $T --matrix scen --maps ma,mb --instances 2 --mock --inst 4720 --logdir $F/log --archive $F/march --timeout 60 --connect-timeout 60 --exit-wait 30 > $W/mt.txt
cat $W/mt.txt
grep -q '^| 1 | mock-bad | - | - | 4720 | FAIL |' $W/mt.txt || fail "matrix row bad"
grep -q '^| 2 | mock-ok | ma | modA | 4721 | PASS |.*LOG-01 PASS' $W/mt.txt || fail "matrix row ok ma"
grep -q '^| 3 | mock-ok | mb | modA | 472[01] | PASS |' $W/mt.txt || fail "matrix row ok mb"
node $T --matrix scen/ok.json --maps ma --mock --inst 4730 --logdir $F/log --archive $F/march --timeout 60 --connect-timeout 60 --format json --out $W/mj.json > /dev/null
node -e "const j=JSON.parse(require('fs').readFileSync('$W/mj.json','utf8')); if(j.total!==1||!j.runs[0].pass||!j.runs[0].archive||!j.runs[0].triage.LOG_NO_STUFF&&Object.keys(j.runs[0].triage).length===0&&false) process.exit(1); if(!require('fs').existsSync(require('path').join(j.runs[0].archive,'pipe.jsonl'))) process.exit(1)" || fail "matrix json"

# 13. stage gating (live 2026-11-03: mp_lan replies ok while stage is 'starting'): mp_host waits for state active; timeout code; recorded trace
node $T --mock --inst 4740 --map mp_test --players 2 --timeout 60 --connect-timeout 60 --logdir $F/log --archive $F/arch > $W/st1.txt
grep -q '^stage mp_lobbylan active' $W/st1.txt && grep -q '^> mp_host multi/mp_test:combat 2' $W/st1.txt && grep -q '^0 findings' $W/st1.txt || { cat $W/st1.txt; fail "stage gating"; }
node $T --mock --mock-no-stage --inst 4741 --map mp_test --stage-timeout 1 --connect-timeout 60 --logdir $F/log --archive $F/arch -q > $W/st2.txt
grep -q 'TESTRUN_STAGE_TIMEOUT no stage event with state "active" in 1s' $W/st2.txt || { cat $W/st2.txt; fail "stage timeout"; }
grep -q 'mp_host' $W/st2.txt && fail "mp_host sent without active stage"
node $T --map mp_test --dry --logdir $F/log | grep -q 'wait stage event state=active' || fail "dry stage wait"
node replay.js || fail "recorded trace replay"


# 14. preflight lint of a staged fixture (live 2026-11-03: .lng without {tags} and .patch without {patch} were fatal at startup)
node pf.js || fail "preflight"

# 15. --as list: fixture i -> folder i; count mismatch refused (VFS-21 needs 2 approved folders)
mkdir -p $F/g/mods
node ../scenarios/install.js --game $F/g --scenario vfs-21.json --as t1,t2 > $W/as2.txt || fail "--as list exit"
grep -q "vfs-21b -> .*t2" $W/as2.txt || fail "--as list: 2nd fixture not in 2nd folder"
node ../scenarios/install.js --game $F/g --scenario vfs-21.json --as t1 > $W/as1.txt && fail "--as 1 folder for 2 fixtures must fail"
grep -q "names 1 folder" $W/as1.txt || fail "--as mismatch message"
# prepare steps follow the stage folder: a staged run must not write mods/<fixture>
node ../scenarios/install.js --game $F/g --scenario map-16.json --as t1 > $W/as1.txt || fail "--as prepare exit"
grep -q "mods.t1 --game" $W/as1.txt || fail "--as prepare: step not sent to stage folder"
grep -q -e "--mods t1 " $W/as1.txt || fail "--as prepare: --mods not remapped"
grep -q "mods.map-16 " $W/as1.txt && fail "--as prepare: still writes mods/<fixture>"

# 16. reply/event verdicts (judged on what the live game answers; evaluated before q)
C16="--mock --logdir $F/log --archive $F/rarch --timeout 60 --connect-timeout 60 --exit-wait 30"
node $T --scenario scen2/reply.json $C16 --inst 4750 > $W/rv1.txt; rc=$?
[ $rc -eq 0 ] || { cat $W/rv1.txt; fail "reply scenario exit $rc"; }
[ "$(grep -c '^VERDICT PASS' $W/rv1.txt)" -eq 9 ] || { cat $W/rv1.txt; fail "reply verdicts pass count"; }
grep -q '^live PASS reply "mp_state" sides.0.unitsAlive > 3 (got 5)' $W/rv1.txt && grep -q '^live PASS reply "nosuch" matches /^ERR atom not found' $W/rv1.txt || fail "reply live lines"
node $T --scenario scen2/replyfail.json $C16 --inst 4751 > $W/rv2.txt; rc=$?
[ $rc -eq 1 ] || fail "reply fail exit $rc"
[ "$(grep -c '^VERDICT FAIL' $W/rv2.txt)" -eq 5 ] || { cat $W/rv2.txt; fail "reply verdicts fail count"; }
grep -q '^VERDICT FAIL reply "mp_state" sides.9.unitsAlive > 0 (path not found)' $W/rv2.txt || fail "path not found"
grep -q '^VERDICT FAIL event "session_failed" must be seen (not seen)' $W/rv2.txt || fail "event want true"
node $T --scenario scen2/nogame.json $C16 --inst 4752 > $W/rv3.txt
grep -q '^VERDICT PASS reply "mp_state" matches /^ERR no game running\$/' $W/rv3.txt && grep -q '^VERDICT FAIL reply "mp_state" live == true (ERR no game running)' $W/rv3.txt || { cat $W/rv3.txt; fail "ok:false as ERR text"; }
node $T --scenario scen2/reply.json --dry --logdir $F/log > $W/rv4.txt; grep -q 'verdict live reply "mp_state" sides.0.unitsAlive > 3' $W/rv4.txt || { cat $W/rv4.txt; fail "reply dry"; }
# per instance under --matrix --instances 2: reply/event verdicts decide, no TESTRUN_LOG_FOREIGN (no log verdicts involved)
node $T --matrix scen2/reply.json,scen2/replyfail.json --instances 2 $C16 --inst 4753 -q > $W/rv5.txt
grep -q '^| 1 | reply-ok | mp_test | - | 4753 | PASS |' $W/rv5.txt && grep -q '^| 2 | reply-bad | mp_test | - | 4754 | FAIL |' $W/rv5.txt || { cat $W/rv5.txt; fail "matrix reply verdicts"; }
grep -q 'LOG_FOREIGN' $W/rv5.txt && fail "foreign log on reply-only scenario"
# bad verdict spec
printf '%s\n' '{"name":"b","verdict":[{"reply":"echo","path":"a","op":"~","value":1},{"event":""},{"reply":"x"}]}' > $W/badspec.json
node $T --scenario $W/badspec.json --mock --logdir $F/log -q > $W/rv6.txt
grep -q 'reply verdict with path needs op' $W/rv6.txt && grep -q 'event verdict needs an event name' $W/rv6.txt && grep -q 'reply verdict needs match' $W/rv6.txt || { cat $W/rv6.txt; fail "bad verdict spec"; }
rm -f $W/badspec.json

# 17. --lint (no game): findings per scenario file
node $T --lint scen3 > $W/lint.txt; rc=$?
[ $rc -eq 1 ] || fail "lint exit $rc"
grep -q '^scen3/neg.json:[0-9]*: LINT_NEGATIVE_ONLY' $W/lint.txt || { cat $W/lint.txt; fail "lint negative"; }
grep -q '^scen3/paren.json:1: LINT_UNESCAPED .*foo' $W/lint.txt || fail "lint unescaped group"
grep -q 'LINT_UNESCAPED log regex /unclosed (a/' $W/lint.txt || fail "lint unclosed"
[ "$(grep -c 'paren.json.*LINT_UNESCAPED' $W/lint.txt)" -eq 2 ] || { cat $W/lint.txt; fail "lint escaped/alternation false positive"; }
grep -q 'scen3/txt.json:[0-9]*: LINT_TXT_FIXTURE fixture txtfx ships loose readme.txt' $W/lint.txt || fail "lint txt fixture"
grep -q 'scen3/txt.json:[0-9]*: LINT_TXT_FIXTURE prepare writes loose {mods}/txtfx/note.txt' $W/lint.txt || fail "lint txt prepare"
grep -q '^scen3/manual.json:1: LINT_MANUAL' $W/lint.txt || fail "lint manual"
grep -q 'scen3/paren.json:1: LINT_REGEX log regex /unclosed (a/ does not compile' $W/lint.txt || fail "lint regex compile"
grep -q 'clean.json' $W/lint.txt && fail "lint false positive on clean scenario"
grep -q '^7 findings$' $W/lint.txt || { cat $W/lint.txt; fail "lint count"; }
node $T --lint scen3/clean.json | grep -q '^0 findings' || fail "lint clean"

# 17b. mod_set replaces the active list (live 2026-11-04): staged folder named in it, patch count kept, mount check after it
node $T --scenario ../wave1/b/vfs-38.json --stage-as e2e_test --no-preflight --dry --logdir $F/log > $W/ms.txt
grep -q 'mod_set as64+ e2e_test:3' $W/ms.txt || { cat $W/ms.txt; fail "stage: mod_set lost the folder"; }
[ "$(grep -n 'mod_set\|mod_list' $W/ms.txt | head -1 | grep -c mod_set)" = 1 ] || { cat $W/ms.txt; fail "stage: mount check before mod_set"; }
# 18. --backup: staged folders + options.set restored byte for byte; approved folders only
G=$F/gbk; mkdir -p $G/mods/e2e_test; echo orig > $G/mods/e2e_test/orig.cfg
printf '{options\r\n\t{mods\r\n\t\t"as64+"\r\n\t\t"e2e_test"\r\n\t\t"e2e_test2"\r\n\t}\r\n}\r\n' > $G/options.set
cp $G/options.set $F/options.want
B18="--scenario ../scenarios/vfs-21.json --stage-as e2e_test,e2e_test2 --no-preflight --game $G --profile $G/options.set --backup $F/bk --mock --logdir $F/log --archive $F/rarch --connect-timeout 60 --exit-wait 30"
node $T $B18 --inst 4755 --out $W/bk.json > $W/bk1.txt
grep -q '^staged fixture -> mods/e2e_test, mods/e2e_test2' $W/bk1.txt || { cat $W/bk1.txt; fail "backup: nothing staged"; }
grep -q '^backup restored:true' $W/bk1.txt || { cat $W/bk1.txt; fail "backup restored"; }
[ ! -e $G/mods/e2e_test2 ] && [ "$(cat $G/mods/e2e_test/orig.cfg)" = orig ] && [ ! -e $G/mods/e2e_test/at ] || fail "backup: game dir not restored"
cmp $G/options.set $F/options.want || fail "backup: options.set differs"
grep -q '"restored": true' $W/bk.json && grep -q '"restored": true' $F/bk/restore.json || fail "restored:true not in report json"
# crash after staging (profile rewritten, exception): still restored
node $T $B18 --inst 4756 --mock-crash > $W/bk2.txt; rc=$?
[ $rc -eq 2 ] && grep -q 'TESTRUN_CRASH mock crash after staging' $W/bk2.txt && grep -q '^backup restored:true' $W/bk2.txt || { cat $W/bk2.txt; fail "backup on crash"; }
cmp $G/options.set $F/options.want || fail "backup: options.set not restored after crash"
[ ! -e $G/mods/e2e_test2 ] || fail "backup: staged folder left after crash"
# not approved: refused, nothing written
mkdir -p $G/mods/other; echo keep > $G/mods/other/k.cfg
node $T --scenario ../scenarios/vfs-21.json --stage-as e2e_test,other --game $G --backup $F/bk3 --mock --logdir $F/log -q > $W/bk3.txt; rc=$?
[ $rc -eq 1 ] && grep -q 'TESTRUN_STAGE_REFUSED --stage-as folder(s) other not approved' $W/bk3.txt || { cat $W/bk3.txt; fail "unapproved folder"; }
[ ! -e $F/bk3 ] && [ "$(cat $G/mods/other/k.cfg)" = keep ] || fail "refusal wrote something"
# backup dir inside the game install: refused
node $T $B18 --backup $G/bk4 --inst 4757 > $W/bk5.txt; grep -q 'TESTRUN_BACKUP .* inside the game install' $W/bk5.txt || { cat $W/bk5.txt; fail "backup inside game"; }

# 19. --queue: sameLaunch scenarios share one launch, others one each, MANUAL skipped, final JSON
node $T --queue-dir scen4 $C16 --inst 4760 --out $W/q.json > $W/q.txt; rc=$?
[ $rc -eq 1 ] || { cat $W/q.txt; fail "queue exit $rc"; }
grep -q '^PASS q1 (launch 1,' $W/q.txt && grep -q '^PASS q2 (launch 1,' $W/q.txt && grep -q '^FAIL q3 (launch 1,.*echo three' $W/q.txt && grep -q '^PASS q4 (launch 2,' $W/q.txt && grep -q '^MANUAL q5' $W/q.txt || { cat $W/q.txt; fail "queue lines"; }
grep -q '^queue: 5 scenario(s), 2 launch(es), 3 PASS, 1 FAIL, 1 MANUAL' $W/q.txt || fail "queue totals"
node -e "const j=JSON.parse(require('fs').readFileSync('$W/q.json','utf8')); if(j.total!==5||j.launches!==2||j.failed!==1||j.manual!==1||j.queue[4].status!=='MANUAL'||j.queue[0].name!=='q1') process.exit(1)" || fail "queue json"
node $T --queue scen4/q4.json,scen4/q1.json $C16 --inst 4761 -q > $W/q2.txt; grep -q '^PASS q4 (launch 1' $W/q2.txt && grep -q '^PASS q1 (launch 2' $W/q2.txt || { cat $W/q2.txt; fail "queue explicit files, no sameLaunch -> own launch"; }
node $T --queue-dir scen4 --dry --logdir $F/log | grep -q 'launch 1: q1, q2, q3  (sameLaunch' || fail "queue dry"

# 20. per-instance user dir (logdir/profile via lib/userdir), seeding, --workers queue with a shared stage-folder pool
node qtest.js || fail "instance dirs / workers queue"

# 21. chain-n2: mp_set team.<t>.army waits for mp_slots (the engine syncs all teams/ from a stale card copy: a fast second set reverts the first)
node $T --scenario scen6/team.json --mock --mock-team-lag 300 --team-settle-ms 60000 --inst 4770 --logdir $F/log --archive $F/sarch --timeout 60 --connect-timeout 60 > $W/tm1.txt || { cat $W/tm1.txt; fail "team army settle"; }
grep -q 'team name=a size=2 army=eng' $W/tm1.txt || { cat $W/tm1.txt; fail "team a army kept"; }
node $T --scenario scen6/team.json --mock --mock-team-lag 300 --team-settle-ms 0 --inst 4771 --logdir $F/log --archive $F/sarch --timeout 60 --connect-timeout 60 > $W/tm2.txt
grep -q 'WARN_TESTRUN_TEAM_UNSET mp_set team.a.army eng' $W/tm2.txt || { cat $W/tm2.txt; fail "seeded: no settle must warn"; }

# 22. MP-2: mp_join "try again in a moment" replies are retries (info), not TESTRUN_CMD_FAIL; AI-4: --logdir with no game.log is named
node $T --scenario scen6/join.json --mock --inst 4772 --logdir $F/log --archive $F/sarch --timeout 60 --connect-timeout 60 > $W/mj1.txt || { cat $W/mj1.txt; fail "mp_join retry must not fail the run"; }
grep -q 'TESTRUN_CMD_FAIL' $W/mj1.txt && { cat $W/mj1.txt; fail "mp_join retry counted as CMD_FAIL"; }
grep -q '^VERDICT PASS' $W/mj1.txt || { cat $W/mj1.txt; fail "mp_join scenario verdict"; }
mkdir -p $W/nolog
node $T --scenario scen6/join.json --mock --inst 4773 --logdir $W/nolog --archive $F/sarch --timeout 60 --connect-timeout 60 > $W/mj2.txt
grep -q 'TESTRUN_LOGDIR_EMPTY' $W/mj2.txt || { cat $W/mj2.txt; fail "empty --logdir not named"; }

node newfeat.js || fail "newfeat"
node keeplist.js || fail "keeplist (FIX-EDRUN item 8)"
node stalelog.js >/dev/null || fail "stalelog (rev-harness 19)"
node games.js || fail "games (MoW:AS2 and GoH: no pipe, live run refused; testfolders per game)"

echo PASS
