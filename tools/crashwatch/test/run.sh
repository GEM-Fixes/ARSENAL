#!/bin/sh
# crashwatch test: no game, no attach. A stand-in process (node, sleeping) is found with -Plan by -Pid and by -Inst 0; MoW:AS2 and GoH
# -Inst N >= 1 are refused with the plain line; a missing process exits 2 with one line. Windows only (PowerShell); skipped elsewhere.
# Author: Imperator_Aug (ARSENAL, ia-6809f40c)
cd "$(dirname "$0")"
command -v powershell >/dev/null 2>&1 || { echo "SKIP: no powershell"; echo PASS; exit 0; }
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1
P="powershell -NoProfile -ExecutionPolicy Bypass -File ../crashwatch.ps1"
node -e "setTimeout(() => {}, 60000)" & SP=$!
trap 'kill $SP 2>/dev/null; rm -rf "$W"' EXIT
WP=$(ps -p $SP 2>/dev/null | awk 'NR==2 {print $4}')   # Git Bash ps: column 4 = the Windows pid
[ -n "$WP" ] || WP=$SP
fail() { echo "FAIL: $1"; [ -f "$2" ] && cat "$2"; exit 1; }

# -Pid + -Plan: the stand-in is found, nothing attached, the missing pdb is named
$P -Pid "$WP" -Exe node.exe -Plan -Out "$W/p1.txt" -Wait 5 > "$W/p1.out" 2>&1 || fail "-Pid -Plan exit $?" "$W/p1.out"
grep -q "^plan: would watch pid $WP (node.exe); no pdb beside node.exe: addresses (rva) only" "$W/p1.out" || fail "-Pid plan line" "$W/p1.out"
grep -q "^plan: would watch pid $WP" "$W/p1.txt" || fail "-Pid plan in -Out" "$W/p1.txt"
echo "ok -Pid -Plan"
# -Inst 0: any process of that name
$P -Inst 0 -Exe node.exe -Plan -Out "$W/p2.txt" -Wait 5 > "$W/p2.out" 2>&1 || fail "-Inst 0 exit" "$W/p2.out"
grep -q '^plan: would watch pid [0-9]* (node.exe); ' "$W/p2.out" || fail "-Inst 0 plan line" "$W/p2.out"
echo "ok -Inst 0"
# -Pid with another name: not that process
$P -Pid "$WP" -Exe as64.exe -Plan -Out "$W/p3.txt" -Wait 1 > /dev/null 2>&1; [ $? = 2 ] || fail "-Pid with another -Exe accepted"
grep -q "no process $WP named as64.exe in 1 s" "$W/p3.txt" || fail "-Pid name line" "$W/p3.txt"
echo "ok -Pid name check"
# MoW:AS2 / GoH: no numbered instances -> the plain line, exit 2
$P -Game mowas2 -Inst 2 -Out "$W/r1.txt" -Wait 1 > "$W/r1.out" 2>&1; [ $? = 2 ] || fail "mowas2 -Inst 2 not refused" "$W/r1.out"
grep -q '^crashwatch: not available for MoW:AS2: .*(TST-19)$' "$W/r1.out" || fail "mowas2 refusal line" "$W/r1.out"
$P -Exe mowas_2.exe -Out "$W/r2.txt" -Wait 1 > "$W/r2.out" 2>&1; [ $? = 2 ] && grep -q 'not available for MoW:AS2' "$W/r2.out" || fail "mowas_2.exe with default -Inst 1 not refused" "$W/r2.out"
$P -Game goh -Inst 1 -Out "$W/r3.txt" -Wait 1 > "$W/r3.out" 2>&1; [ $? = 2 ] && grep -q '^crashwatch: not available for GoH: ' "$W/r3.out" || fail "goh -Inst 1 not refused" "$W/r3.out"
echo "ok refusals"
# -Game sets the exe and -Inst 0; no such process -> exit 2, one line
$P -Game goh -Out "$W/n1.txt" -Wait 1 > /dev/null 2>&1; [ $? = 2 ] || fail "goh none exit"
grep -q 'no call_to_arms.exe running in 1 s' "$W/n1.txt" || fail "goh none line" "$W/n1.txt"
$P -Game mowas2 -Out "$W/n2.txt" -Wait 1 > /dev/null 2>&1; grep -q 'no mowas_2.exe running in 1 s' "$W/n2.txt" || fail "mowas2 none line" "$W/n2.txt"
# AS64 default unchanged: -Inst 1 as64.exe, the old line
$P -Out "$W/n3.txt" -Wait 1 > /dev/null 2>&1; [ $? = 2 ] && grep -q 'no as64.exe with -instance 1 in 1 s' "$W/n3.txt" || fail "as64 default line" "$W/n3.txt"
$P -Game nope -Out "$W/n4.txt" -Wait 1 > "$W/n4.out" 2>&1; [ $? = 2 ] || fail "bad -Game accepted" "$W/n4.out"
echo "ok no-process lines"
# real attach to a stand-in (node, read only; standin.js exits once the watcher wrote "attached pid", which ends the run):
# -Pid writes the note as its first line; the AS64 form (-Inst N >= 1, no -Game, no -Pid; here -Exe node.exe with "-instance 7")
# writes no note, as before
# wait until the stand-in wrote its pid file (up to 10 s: node starts slowly on a loaded machine)
waitpid() { i=0; while [ ! -s "$1" ] && [ $i -lt 100 ]; do node -e "setTimeout(() => {}, 100)"; i=$((i+1)); done; [ -s "$1" ] || fail "stand-in wrote no pid file $1"; }
node standin.js "$W/a1.pid" "$W/a1.txt" > /dev/null 2>&1 &
waitpid "$W/a1.pid"
$P -Pid "$(cat "$W/a1.pid")" -Exe node.exe -Out "$W/a1.txt" -Wait 20 > /dev/null 2>&1
node standin.js "$W/a2.pid" "$W/a2.txt" -instance 7 > /dev/null 2>&1 &
waitpid "$W/a2.pid"
$P -Inst 7 -Exe node.exe -Out "$W/a2.txt" -Wait 20 > /dev/null 2>&1
head -1 "$W/a1.txt" | grep -q ' note: no pdb beside node.exe: addresses (rva) only' || fail "-Pid attach: note not first" "$W/a1.txt"
grep -q ' attached pid ' "$W/a2.txt" || fail "-Inst 7 attach" "$W/a2.txt"
grep -q 'note:' "$W/a2.txt" && fail "AS64 form attach wrote a note line" "$W/a2.txt"
echo "ok attach note"
echo PASS
