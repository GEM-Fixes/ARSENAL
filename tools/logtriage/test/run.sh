#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-488f077c)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture, truth and outputs never touch tracked files
node mkfixture.js || exit 1
F="$W/fixture"; O="$W"
node ../logtriage.js "$F/log" --mod "$F/mod" -q > "$O/out.txt"
cat "$O/out.txt" | cut -c1-260
grep -v '^#' "$W/truth.md" | sed 's/: / /' | sort > "$O/want.txt"
grep -v 'findings$\|^by code' "$O/out.txt" | awk 'match($0, /: LOG_[A-Z_]+ /) { f=substr($0,1,RSTART-1); c=substr($0,RSTART+2,RLENGTH-3); print f" "c }' | sort > "$O/got.txt"
diff "$O/want.txt" "$O/got.txt" || { echo "FAIL: findings differ from truth.md"; exit 1; }
grep -q 'mod supplies resource/entity/x/tank.mdl' "$O/out.txt" || { echo "FAIL: mod-supply mark missing"; exit 1; }
grep -q 'mod does NOT supply it: add <mod>/resource/entity/x/gone.mdl' "$O/out.txt" || { echo "FAIL: mod-missing mark missing"; exit 1; }
grep -q 'No Stuff found for tags .* x2' "$O/out.txt" || { echo "FAIL: duplicate collapse"; exit 1; }
node ../logtriage.js "$F/log" -q --since 2099-01-01 > "$O/since.txt"; grep -q 'minidumps\|oos/' "$O/since.txt" && { echo "FAIL: --since kept old dumps/oos"; exit 1; }
grep -q 'oos/\|minidumps/' "$O/out.txt" || { echo "FAIL: fixture has no dumps/oos to filter"; exit 1; }
node ../logtriage.js "$F/log" --json > "$O/json.txt" && grep -q '"groups"' "$O/json.txt" || { echo "FAIL: json"; exit 1; }
(sh ../../binhdr/test/rcwire.sh node ../logtriage.js "$F/log" --mod "$F/mod") || exit 1
node ../logtriage.js "$F/log" > "$O/full.txt"
grep -q 'LOG_MOD_SHADOWED.*wsmod' "$O/full.txt" || { echo "FAIL: LOG-17 shadow note"; exit 1; }
[ "$(grep -c 'LOG_MOD_SHADOWED.*wsmod' "$O/full.txt")" = 1 ] && grep -q "LOG_MOD_SHADOWED.*wsmod' x2" "$O/full.txt" || { echo "FAIL: shadow not grouped"; exit 1; }
grep -q 'LOG_BENIGN.*music stream did not open' "$O/full.txt" && grep -q 'LOG_BENIGN.*No active entity' "$O/full.txt" || { echo "FAIL: real-log benign classes"; exit 1; }
grep -q 'LOG_EXE_SWITCH.*mowas_2.exe.*as64.exe' "$O/full.txt" || { echo "FAIL: LOG-20 exe switch"; exit 1; }
grep -q 'LOG_LUA.*bot lua loaded' "$O/full.txt" && grep -q 'LOG_LUA.*bot spawned' "$O/full.txt" || { echo "FAIL: lua info"; exit 1; }
grep -q 'LOG_LUA.*DBG' "$O/full.txt" && { echo "FAIL: DBG lua not noise"; exit 1; }
node ../logtriage.js "$F/log" --lua > "$O/lua.txt"; [ "$(grep -cF '[LUA] ' "$O/lua.txt")" = 5 ] && grep -qF '4 [LUA] lines (2 DBG' "$O/lua.txt" || { echo "FAIL: --lua"; exit 1; }
node ../logtriage.js "$F/log2" | grep -q LOG_PREV_LOST || { echo "FAIL: LOG-19"; exit 1; }
# TST-22: --inst N / --all-instances over a fake home (AS2_HOME): inst 0 = fixture/log, inst 1 = fixture/log2, inst 3 has no log dir
H="$F/home"; U="$H/Documents/my games/men of war - assault squad 2"
mkdir -p "$U/log" "$U - instance 1/log" "$U - instance 3"
cp "$F/log/game.log" "$U/log/"; cp "$F"/log2/* "$U - instance 1/log/" 2>/dev/null
AS2_HOME="$H" node ../logtriage.js --all-instances > "$O/inst.txt" || { echo "FAIL: all-instances rc"; exit 1; }
grep -q '^=== instance 0: ' "$O/inst.txt" && grep -q '^=== instance 1: ' "$O/inst.txt" && grep -q '^=== merged: 2 instance' "$O/inst.txt" || { echo "FAIL: all-instances headers"; exit 1; }
grep -q 'instance 3' "$O/inst.txt" && { echo "FAIL: instance without log dir listed"; exit 1; }
grep -q 'LOG_PREV_LOST' "$O/inst.txt" || { echo "FAIL: instance 1 log not triaged"; exit 1; }
AS2_HOME="$H" node ../logtriage.js --inst 1 > "$O/inst1.txt"; grep -q '^=== ' "$O/inst1.txt" && { echo "FAIL: --inst printed headers"; exit 1; }
grep -q 'LOG_PREV_LOST' "$O/inst1.txt" || { echo "FAIL: --inst 1"; exit 1; }
AS2_HOME="$H" node ../logtriage.js --inst 3 >/dev/null 2>&1 && { echo "FAIL: --inst 3 accepted"; exit 1; }
AS2_HOME="$H" node ../logtriage.js "$F/log2" --inst 1 | grep -q 'LOG_PREV_LOST' || { echo "FAIL: path given"; exit 1; }
# --exe: MoW:AS2 names a log another exe wrote (shared log folder, LOG-20); AS64 output unchanged with --exe as64 on an as64 log
node ../logtriage.js "$F/log" --exe mowas_2 | grep -q 'LOG_NOTE this log was written by as64.exe, not mowas_2.exe' || { echo "FAIL: mowas_2 other-exe note"; exit 1; }
node ../logtriage.js "$F/log" --exe as64 > "$O/as64x.txt"; node ../logtriage.js "$F/log" > "$O/as64d.txt"; cmp -s "$O/as64x.txt" "$O/as64d.txt" || { echo "FAIL: --exe as64 changed the as64 output"; exit 1; }
AS2_HOME="$H" node ../logtriage.js --all-instances --exe mowas2 2>"$O/ref.txt"; [ $? = 2 ] && grep -q 'not available for MoW:AS2: .*(TST-19)' "$O/ref.txt" || { echo "FAIL: mowas2 instances refusal"; exit 1; }
node ../logtriage.js --exe nope 2>/dev/null; [ $? = 2 ] || { echo "FAIL: bad --exe"; exit 1; }
# GoH: made-up log in the vanilla form (gohfix.js): stamp cut, header + mods read, status lines out, findings = truth
node gohfix.js || exit 1
G="$W/goh"; GL="$G/la/digitalmindsoft/gates of hell/log"
node ../logtriage.js "$GL/game.log" --mod "$G/mod" > "$O/goh.txt"   # no flag: read as GoH from the log's own marks
grep -q '^# game.log: Gates of Hell log, 38 lines' "$O/goh.txt" && grep -q 'mods activated (1): fixmod (Mod: activate mod, GHLOG-16)' "$O/goh.txt" && grep -q '3 available, 2 packages mounted' "$O/goh.txt" || { echo "FAIL: goh header"; cat "$O/goh.txt"; exit 1; }
grep -q 'CALL TO ARMS - GATES OF HELL - v1.067.0' "$O/goh.txt" && grep -q 'phases: Loading... 1439ms' "$O/goh.txt" || { echo "FAIL: goh product/phase"; exit 1; }
grep -v '^#\|findings$\|^by code\|^info' "$O/goh.txt" | awk 'match($0, /: LOG_[A-Z_]+ /) { f=substr($0,1,RSTART-1); c=substr($0,RSTART+2,RLENGTH-3); print f" "c }' | sort > "$O/goh-got.txt"
diff "$G/truth.txt" "$O/goh-got.txt" || { echo "FAIL: goh findings differ from truth"; exit 1; }
grep -q 'No Stuff found for tags .* x2' "$O/goh.txt" || { echo "FAIL: goh duplicate collapse"; exit 1; }
grep -q 'Resource not found - /entity/x/gone.mdl (eiorepository.cpp:242).*engine emitter eiorepository.cpp:242 of the GoH build 2026.09.23.*mod does NOT supply' "$O/goh.txt" || { echo "FAIL: goh engine form / mod note"; exit 1; }
grep -q 'tank.mdl.*mod supplies resource/entity/x/tank.mdl' "$O/goh.txt" || { echo "FAIL: goh mod supply"; exit 1; }
grep -q 'LOG_CRASH GoH error code 0x0bad0007: DirectX error' "$O/goh.txt" || { echo "FAIL: goh 0x0bad code"; exit 1; }
grep -q 'LOG_BENIGN.*Skipping broken shader' "$O/goh.txt" && grep -q "LOG_BENIGN.*Incorrect color.*2 lines" "$O/goh.txt" || { echo "FAIL: goh benign"; exit 1; }
grep -q 'LOG_UNCLASSIFIED Something brand new happened' "$O/goh.txt" || { echo "FAIL: goh unclassified"; exit 1; }
grep -v '^#' "$O/goh.txt" | grep -q 'GUI: Show page\|Mount package\|LOG_UNCLASSIFIED.*EVT' && { echo "FAIL: goh status lines became messages"; exit 1; }
grep -q 'LOG_LUA \[LUA\] Print: fixture bot ready' "$O/goh.txt" || { echo "FAIL: goh lua"; exit 1; }
# default log dir from the GoH user dir (fake LOCALAPPDATA, fake home), --json carries the game
AS2_HOME="$H" LOCALAPPDATA="$G/la" node ../logtriage.js --goh --json > "$O/gohj.txt" || { echo "FAIL: goh default dir"; exit 1; }
grep -q '"game": "goh"' "$O/gohj.txt" && grep -q 'LOG_NO_STUFF' "$O/gohj.txt" || { echo "FAIL: goh json"; exit 1; }
grep -q '"game"' "$O/json.txt" && { echo "FAIL: as64 json gained a game key"; exit 1; }
AS2_HOME="$H" LOCALAPPDATA="$W/none" node ../logtriage.js --exe goh 2>"$O/gohnone.txt"; [ $? = 2 ] && grep -q 'no Gates of Hell user folder' "$O/gohnone.txt" || { echo "FAIL: goh no user dir"; exit 1; }
node ../logtriage.js --goh --inst 1 2>"$O/gohinst.txt"; [ $? = 2 ] && grep -q 'not available for GoH: .*(LOG-22)' "$O/gohinst.txt" || { echo "FAIL: goh --inst refusal"; exit 1; }
# in-process check({target, keep: 1, exe}) as the GUI routes call it: exe id or vfs exe, AS2 and GoH
node api.js "$F/log" "$GL/game.log" || exit 1
# --goh on an AS2 log (CMD names as64.exe): read in the AS2 form with a note, not labelled a Gates of Hell log
node ../logtriage.js "$F/log/game.log" --goh > "$O/gohas2.txt"
grep -q 'Gates of Hell log' "$O/gohas2.txt" && { echo "FAIL: --goh labelled an AS2 log GoH"; exit 1; }
grep -q 'LOG_NOTE this log was written by as64.exe, not call_to_arms.exe: read with the AS2 form' "$O/gohas2.txt" || { echo "FAIL: --goh on AS2 log note"; cat "$O/gohas2.txt"; exit 1; }
echo PASS
