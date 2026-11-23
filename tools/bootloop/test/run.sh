#!/bin/sh
# seeded fixture: crash logs and a small text tree, temp dir only. never launches the game
# Author: Imperator_Aug (ARSENAL, ia-f84f0340)
d=$(cd "$(dirname "$0")" && pwd); t=$(mktemp -d); ok=1
P="node $d/../bootloop.js"
crash() { printf '[00:01:00] start\r\n\r\n***************** Exception *****************\r\n%s\r\n' "$2" > "$t/$1"; }
crash a.log 'unexpected token (, 380) @ [main_loop]'
printf '> file "/entity/x/a.def"\r\n> file "define '"'"'m'"'"'"\r\n' >> "$t/a.log"
printf '   {\357\277\275bogus 1}\r\n   #02 abc \r\n' >> "$t/a.log"
$P parse "$t/a.log" > "$t/o"
grep -q '^file /entity/x/a.def' "$t/o" || { echo "parse: macro frame taken for the file"; ok=0; }
grep -q '^bad bogus' "$t/o" || { echo "parse: mark"; ok=0; }
grep -q '^act drop' "$t/o" || { echo "decide: not drop"; ok=0; }
crash b.log 'Unknown condition term : "engine" (, 617)'
$P parse "$t/b.log" | grep -q '^act stop crash names no file' || { echo "decide: no file should stop"; ok=0; }
crash c.log 'define not found'
printf '> file "/set/multiplayer/x.set"\r\n' >> "$t/c.log"
$P parse "$t/c.log" | grep -q '^act stop set/multiplayer/x.set set file' || { echo "decide: set must stop"; ok=0; }
crash e.log 'Multiply definition (x.cpp, 1)'
printf '> file "/entity/fx/f.def"\r\n' >> "$t/e.log"
$P parse "$t/e.log" | grep -q '^act stop entity/fx/f.def needs a look' || { echo "decide: non-token entity must stop"; ok=0; }
crash f.log 'no file (, 2)'
printf '> file "/ui/z.ini"\r\n' >> "$t/f.log"
$P parse "$t/f.log" | grep -q '^act swap' || { echo "decide: other file should swap"; ok=0; }
printf 'clean log\r\n' > "$t/n.log"
$P parse "$t/n.log" | grep -q '^no exception' || { echo "parse: clean log"; ok=0; }
# drop: both layers, one file or everywhere
X="$t/mod/resource"; mkdir -p "$X/entity/x" "$X/properties" "$t/fix" "$t/run"
printf '{a 1}\r\n{bogus 2}\r\n{c {bogus 3} 4}\r\n' > "$X/entity/x/a.def"
printf '{bogus 5}\r\n{d 6}\r\n' > "$X/properties/p.ext"
$P drop --text "$X" --fix "$t/fix" --run "$t/run" --file entity/x/a.def bogus | grep -q 'changed 1 .*"bogus":2' || { echo "drop: file count"; ok=0; }
grep -q bogus "$X/entity/x/a.def" && { echo "drop: key left"; ok=0; }
grep -q 'a 1' "$X/entity/x/a.def" || { echo "drop: too much"; ok=0; }
grep -q bogus "$X/properties/p.ext" || { echo "drop: --file leaked"; ok=0; }
[ -f "$t/fix/entity/x/a.def" ] || { echo "drop: fix layer missing"; ok=0; }
$P drop --text "$X" --run "$t/run" bogus | grep -q 'ALL changed 1' || { echo "drop: everywhere"; ok=0; }
grep -q bogus "$X/properties/p.ext" && { echo "drop: everywhere left one"; ok=0; }
grep -q 'drop ALL' "$t/run/dropped.txt" || { echo "drop: not logged"; ok=0; }
# instance 0 refused before anything starts
$P boot --mods m --game "$t" --text "$X" --run "$t/run" --log "$t/n.log" --inst 0 2>&1 | grep -q 'instance 0' || { echo "boot: instance 0 allowed"; ok=0; }
# sweep score: two entities with one fault share a cause, names and numbers out
mkdir -p "$t/s"
printf '{"verdict":"CRASHED","crash":true,"entities":[{"name":"Ok1","status":"NO_ERROR"},{"name":"miss1","status":"FAILED","how":"cant_preload"},{"name":"bad1","status":"FAILED","how":"crash","why":"w"}]}' > "$t/r1.json"
printf '{"verdict":"CRASHED","crash":true,"entities":[{"name":"bad2","status":"FAILED","how":"crash","why":"w"}]}' > "$t/r2.json"
crash s1.log 'Unknown thing "aa" 12 (x.cpp, 5) @ [m]'
crash s2.log 'Unknown thing "bb" 99 (x.cpp, 5) @ [m]'
$P ingest "$t/r1.json" "$t/s1.log" --run "$t/s" | grep -q '"crashed":"bad1".*"loaded":1,"missing":1' || { echo "ingest: counts"; ok=0; }
$P ingest "$t/r2.json" "$t/s2.log" --run "$t/s" > /dev/null
grep -q '"n": 2' "$t/s/sweep-state.json" || { echo "ingest: same fault must share a cause"; ok=0; }
grep -q '"ok1"' "$t/s/sweep-state.json" || { echo "ingest: names lowercase"; ok=0; }
$P sweep --mods m --target x --game "$t" --text "$X" --run "$t/s" --log "$t/n.log" --inst 0 2>&1 | grep -q 'instance 0' || { echo "sweep: instance 0 allowed"; ok=0; }
# games: MoW:AS2 and GoH refused before anything starts (one line, exit 2); nothing written to --run
$P boot --mods m --game "$t" --text "$X" --run "$t/r9" --log "$t/n.log" --exe mowas2 2> "$t/g"; rc=$?
[ $rc = 2 ] && grep -q '^bootloop boot: not available for MoW:AS2: every boot is a testrun pipe run.*(limits TST-19)$' "$t/g" || { echo "boot: mowas2 word not refused ($rc)"; ok=0; }
[ -e "$t/r9" ] && { echo "boot: refused run wrote files"; ok=0; }
$P boot --mods m --game "$t" --text "$X" --run "$t/r9" --log "$t/n.log" --exe "$t/mowas_2.exe" 2> "$t/g"; [ $? = 2 ] && grep -q 'not available for MoW:AS2' "$t/g" || { echo "boot: mowas_2.exe file not refused"; ok=0; }
mkdir -p "$t/mow" && : > "$t/mow/mowas_2.exe"
$P sweep --mods m --target x --game "$t/mow" --text "$X" --run "$t/r9" --log "$t/n.log" 2> "$t/g"; [ $? = 2 ] && grep -q '^bootloop sweep: not available for MoW:AS2' "$t/g" || { echo "sweep: mowas_2-only install not refused"; ok=0; }
mkdir -p "$t/goh/binaries/x64" && : > "$t/goh/binaries/x64/call_to_arms.exe"
$P sweep --mods m --target x --game "$t/goh" --text "$X" --run "$t/r9" --log "$t/n.log" 2> "$t/g"; [ $? = 2 ] && grep -q '^bootloop sweep: not available for GoH: GoH has no control pipe.*(modweb/testing/goh-drive.md)$' "$t/g" || { echo "sweep: GoH install not refused"; ok=0; }
$P boot --mods m --game "$t" --text "$X" --run "$t/r9" --log "$t/n.log" --exe goh 2> "$t/g"; [ $? = 2 ] && grep -q 'not available for GoH' "$t/g" || { echo "boot: goh word not refused"; ok=0; }
rm -rf "$t"
[ $ok = 1 ] && echo PASS || echo FAIL
