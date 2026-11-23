#!/bin/sh
# bootcheck SEED test: fixtures are line extracts of recorded runs (sources.
# Each case runs twice; the two outputs must be byte-equal. Then the verdict and the planted keys are checked.
# Author: Imperator_Aug (ARSENAL, ia-eae71b4e)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"
B="node ../bootcheck.js"; X="node expect.js"; F=fx

# run <name> <expected exit> <args...>: twice, byte compare, exit code
run() {
  n=$1; want=$2; shift 2
  $B "$@" -o "$W/$n.json" > "$W/$n.out" 2>&1; c=$?
  $B "$@" -o "$W/$n.2.json" > /dev/null 2>&1
  [ "$c" = "$want" ] || { echo "FAIL: $n exit $c, want $want"; cat "$W/$n.out"; exit 1; }
  cmp -s "$W/$n.json" "$W/$n.2.json" || { echo "FAIL: $n differs between two runs"; exit 1; }
  echo "ok $n exit $c, twice byte-equal"
}

# BOOT: baseline (to the clock) from the as64+ chaint_t run
run base 0 base $F/base.log --to-clock
$X "$W/base.json" base-shape 'r.kind==="base" && r.window==="to-clock" && r.reachedClock && r.errorLines===0 && r.warningLines===27' || exit 1
run base-all 0 base $F/base.log
$X "$W/base-all.json" base-all-window 'r.window==="all"' || exit 1

# same config again: 0 new error lines, clock reached, mod active from the log mod_set line
run clean 0 mod $F/clean.log --base "$W/base.json" --to-clock --mod chaint_t
$X "$W/clean.json" clean-pass 'r.verdict==="PASS" && r.newErrors.length===0 && r.reachedClock===true && r.modActive===true && r.modSource==="log mod_set" && r.clockLine===38' || exit 1

# same, mod list from options.set
run clean-opt 0 mod $F/clean.log --base "$W/base.json" --to-clock --mod chaint_t --options $F/options.set
$X "$W/clean-opt.json" options-active 'r.verdict==="PASS" && r.modActive===true && r.modSource==="options.set"' || exit 1

# mod not in options.set: FAIL even with 0 new errors
run inactive 1 mod $F/clean.log --base "$W/base.json" --to-clock --mod b9o_t --options $F/options.set
$X "$W/inactive.json" options-inactive 'r.verdict==="FAIL" && r.newErrors.length===0 && r.modActive===false' || exit 1

# edrun run: no options.set, no mod_set line; the mod list is in report.json beside the log (shape of a recorded edrun review_1 run)
run edrun-base 0 base $F/edrun/game0.log
run edrun-sib 0 mod $F/edrun/game0.log --base "$W/edrun-base.json" --mod review_1
$X "$W/edrun-sib.json" edrun-sibling 'r.verdict==="PASS" && r.modActive===true && r.modSource==="edrun report.json" && r.clockLine===5' || exit 1
run edrun-rep 0 mod $F/edrun/game0.log --base "$W/edrun-base.json" --mod review_1 --report $F/edrun/report.json
$X "$W/edrun-rep.json" edrun-report 'r.verdict==="PASS" && r.modActive===true' || exit 1
run edrun-not 1 mod $F/edrun/game0.log --base "$W/edrun-base.json" --mod b9o_t --report $F/edrun/report.json
$X "$W/edrun-not.json" edrun-inactive 'r.verdict==="FAIL" && r.modActive===false && r.modSource==="edrun report.json"' || exit 1
# no report anywhere (log alone, no mod_set): still FAIL with the old reason
run edrun-none 1 mod $F/noclock.log --base "$W/base.json" --to-clock --mod x
$X "$W/edrun-none.json" edrun-none 'r.modActive===null && r.reasons.some(s=>/no options.set/.test(s))' || exit 1

# b9o_t added: exactly these 2 new error keys, nothing else
run newerr 1 mod $F/newerr.log --base "$W/base.json" --to-clock --mod b9o_t
$X "$W/newerr.json" newerr-keys 'r.verdict==="FAIL" && r.reachedClock && r.modActive===true && r.clockLine===39 && JSON.stringify(r.newErrors.map(e=>e.key).sort())===JSON.stringify(["Unknown props : \"destructable\" @ /entity/construction/_road_work/electrical_posts/standard_wood_rural/standard_wood_rural.def","unknown sound file '"'"'fire/loops/medium'"'"'"].sort())' || exit 1
$X "$W/newerr.json" newerr-lines 'r.newErrors.every(e=>e.base===0 && e.run===1 && e.new===1 && e.line>0)' || exit 1

# crash before the clock: CRASH key, no clock
run crash 1 mod $F/crash.log --base "$W/base.json" --to-clock
$X "$W/crash.json" crash 'r.verdict==="FAIL" && r.crash===true && r.reachedClock===false && r.newErrors.some(e=>/^CRASH\|EXCEPTION_ACCESS_VIOLATION.* at $/.test(e.key))' || exit 1

# boot stalled: no new errors, but no clock
run noclock 1 mod $F/noclock.log --base "$W/base.json" --to-clock
$X "$W/noclock.json" noclock 'r.verdict==="FAIL" && r.newErrors.length===0 && r.reachedClock===false && r.crash===false' || exit 1

# window mismatch: an all-lines base against a to-clock run
run window 1 mod $F/clean.log --base "$W/base-all.json" --to-clock
$X "$W/window.json" window-mismatch 'r.verdict==="FAIL" && r.reasons.some(s=>/window/.test(s))' || exit 1

# SPAWN: edrun report.json, uk-staghound never spawned -> 2 of 3
run spawn-rep 1 spawn $F/spawn-report.json --list $F/units-edrun.txt
$X "$W/spawn-rep.json" spawn-report 'r.verdict==="FAIL" && r.spawned===2 && r.of===3 && JSON.stringify(r.missing)==="[\"uk-staghound\"]" && /can.t spawn entity uk-staghound/.test(r.units[2].reason)' || exit 1

# SPAWN: edrun game log (pair/role names) -> 3 of 4, di_stag/foe missing; arm is not evidence
run spawn-log 1 spawn $F/spawn-edrun.log --list $F/units-edrunlog.txt
$X "$W/spawn-log.json" spawn-edrunlog 'r.verdict==="FAIL" && r.spawned===3 && r.of===4 && JSON.stringify(r.missing)==="[\"di_stag/foe\"]"' || exit 1

# SPAWN: MP roster lines -> 4 of 4
run spawn-mp 0 spawn $F/newerr.log --list $F/units-mp.txt
$X "$W/spawn-mp.json" spawn-mp 'r.verdict==="PASS" && r.spawned===4 && r.of===4 && r.missing.length===0' || exit 1

# AS64 base keeps its old shape: no "game" key
$X "$W/base.json" as64-no-game '!("game" in r)' || exit 1

# GoH (made-up logs in the vanilla GoH form, fx/goh): stamp cut, clock GameThreadStart, mod from "Mod: activate mod" (GHLOG-16)
run goh-base 0 base $F/goh/base.log --to-clock
$X "$W/goh-base.json" goh-base 'r.game==="goh" && r.reachedClock && r.errorLines===0 && r.warningLines===2' || exit 1
run goh-clean 0 mod $F/goh/clean.log --base "$W/goh-base.json" --to-clock --mod fixmod
$X "$W/goh-clean.json" goh-clean 'r.verdict==="PASS" && r.modActive===true && r.modSource==="log Mod: activate mod" && r.clockLine===17' || exit 1
run goh-inactive 1 mod $F/goh/base.log --base "$W/goh-base.json" --to-clock --mod fixmod
$X "$W/goh-inactive.json" goh-inactive 'r.verdict==="FAIL" && r.modActive===false && r.newErrors.length===0' || exit 1
run goh-newerr 1 mod $F/goh/newerr.log --base "$W/goh-base.json" --to-clock --mod fixmod
$X "$W/goh-newerr.json" goh-newerr 'r.verdict==="FAIL" && r.newErrors.length===2 && r.newErrors.some(e=>/^Resource not found - \/entity\/fixmod\/gone\.mdl$/.test(e.key)) && !r.newErrors.some(e=>/late_only/.test(e.key))' || exit 1
# a base of another game: FAIL with the plain reason
run goh-vs-as64 1 mod $F/goh/clean.log --base "$W/base.json" --to-clock --mod fixmod
$X "$W/goh-vs-as64.json" goh-other-base 'r.verdict==="FAIL" && r.reasons.some(s=>/^base recorded on AS64, run on GoH: record a base for this game/.test(s))' || exit 1
# GoH spawn: bot purchase lines -> 2 of 3
run goh-spawn 1 spawn $F/goh/clean.log --list $F/goh/units.txt
$X "$W/goh-spawn.json" goh-spawn 'r.spawned===2 && r.of===3 && JSON.stringify(r.missing)==="[\"fixmod_tank\"]" && /bot spawned single_rifle\(fin\)/.test(r.units[0].line)' || exit 1

# MoW:AS2 (fx/mowas: CMD mowas_2.exe, no mod_set line): --exe mowas2 names the game; own base, mod list from --options (ENG-19)
run mw-base 0 base $F/mowas/clean.log --to-clock --exe mowas2
$X "$W/mw-base.json" mowas-base 'r.game==="mowas2" && r.reachedClock' || exit 1
run mw-noopt 1 mod $F/mowas/clean.log --base "$W/mw-base.json" --to-clock --mod chaint_t --exe mowas2
$X "$W/mw-noopt.json" mowas-no-options 'r.verdict==="FAIL" && r.modActive===null && r.reasons.some(s=>/MoW:AS2 has no control pipe.*ENG-19.*--options/.test(s))' || exit 1
run mw-opt 0 mod $F/mowas/clean.log --base "$W/mw-base.json" --to-clock --mod chaint_t --options $F/mowas/options.set --exe mowas2
$X "$W/mw-opt.json" mowas-options 'r.verdict==="PASS" && r.modActive===true && r.modSource==="options.set"' || exit 1
run mw-vs-as64 1 mod $F/mowas/clean.log --base "$W/base.json" --to-clock --mod chaint_t --options $F/mowas/options.set --exe mowas2
$X "$W/mw-vs-as64.json" mowas-other-base 'r.reasons.some(s=>/^base recorded on AS64, run on MoW:AS2/.test(s))' || exit 1
# --exe names the game of a log with no CMD line
run mw-exe 0 base $F/noclock.log --exe mowas_2
$X "$W/mw-exe.json" exe-flag 'r.game==="mowas2"' || exit 1
# no --exe: an AS2-form log is AS64, as before, even when its CMD names mowas_2.exe (the game is not read from the CMD line)
run mw-noexe-base 0 base $F/mowas/clean.log --to-clock
$X "$W/mw-noexe-base.json" noexe-base-as64 'r.game===undefined' || exit 1
run mw-noexe-mod 0 mod $F/mowas/clean.log --base "$W/base.json" --to-clock --mod chaint_t --options $F/mowas/options.set
$X "$W/mw-noexe-mod.json" noexe-mod-as64 '!r.reasons.some(s=>/^base recorded on/.test(s)) && !r.reasons.some(s=>/MoW:AS2/.test(s))' || exit 1
run mw-noexe-base2 1 mod $F/clean.log --base "$W/mw-base.json" --to-clock --mod chaint_t
$X "$W/mw-noexe-base2.json" noexe-vs-mowas-base 'r.reasons.some(s=>/^base recorded on MoW:AS2, run on AS64/.test(s))' || exit 1
$B spawn $F/mowas/clean.log --list $F/units-mp.txt > "$W/mw-noexe-spawn.out" 2>&1; c=$?
[ $c != 2 ] && grep -q '"verdict"' "$W/mw-noexe-spawn.out" || { echo "FAIL: no --exe spawn on a mowas_2 log refused (exit $c)"; cat "$W/mw-noexe-spawn.out"; exit 1; }
# MoW:AS2 spawn: refused with the plain line (ENG-19, MIS-12)
$B spawn $F/mowas/clean.log --list $F/units-mp.txt --exe mowas2 > "$W/mw-spawn.out" 2>&1; c=$?
[ $c = 2 ] && grep -q '^bootcheck spawn: not available for MoW:AS2: .*(ENG-19, MIS-12)$' "$W/mw-spawn.out" || { echo "FAIL: mowas2 spawn refusal (exit $c)"; cat "$W/mw-spawn.out"; exit 1; }
$B --exe mowas2 spawn $F/newerr.log --list $F/units-mp.txt > /dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: --exe mowas2 spawn not refused"; exit 1; }
$B --exe nope base $F/base.log > /dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: bad --exe"; exit 1; }
echo "ok goh and mowas2 cases"

# usage errors: exit 2
$B > /dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: no args should exit 2"; exit 1; }
$B mod $F/clean.log > /dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: mod without --base should exit 2"; exit 1; }
$B spawn $F/newerr.log > /dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: spawn without --list should exit 2"; exit 1; }
$B --help > /dev/null 2>&1; [ $? = 0 ] || { echo "FAIL: --help should exit 0"; exit 1; }
echo "ok usage exits"

echo PASS
