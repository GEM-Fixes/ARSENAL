#!/bin/sh
# regression: bad/ findings (file:line: CODE) must equal truth.md; ok/ 0; overflow fixtures generated (129 flags, 33 ables)
# Author: Imperator_Aug (ARSENAL, ia-27d801e1)
d=$(dirname "$0")
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
o="$G/.ovf"; rm -rf "$o"; mkdir -p "$o/set/interaction_entity"
node -e '
let s="{entities\n {\"x\"\n  {on spawn\n";
for(let i=0;i<129;i++) s+="   {set \"f"+i+"\"}\n";
s+="   {able";
for(let i=0;i<33;i++) s+=" a"+i+" 1";
s+="}\n  }\n }\n}\n";
require("fs").writeFileSync(process.argv[1]+"/set/interaction_entity/entity.set",s)' "$o"
{ node "$d/../ialint.js" "$d/bad" -q | grep -E '^[a-z][^ ]*: [A-Z_]+ ' | cut -d' ' -f1,2
  node "$d/../ialint.js" "$o" -q | grep -E '^[a-z][^ ]*: [A-Z_]+ ' | cut -d' ' -f1,2 | sed 's/^/ovf: /'
} | sort > "$G/.got"
grep -vE '^#' "$d/truth.md" | sort > "$G/.want"
if cmp -s "$G/.got" "$G/.want"; then b=ok; else b=BAD; diff "$G/.got" "$G/.want"; fi
n=$(node "$d/../ialint.js" "$d/ok" -q | grep ' findings$' | cut -d' ' -f1)
echo "bad $b ok-findings $n"; rm -rf "$G/.got" "$G/.want" "$o"
# game parity: goh/ is invented GoH-form data with the 4 events GoH adds (GHINT-17, GHINT-45): 0 findings with --exe goh;
# AS64 (no --exe) and MoW:AS2 (--exe mowas_2, mowas2) refuse all 4 with INT_EVENT_UNKNOWN, the same output; a bad --exe exits 2
gg=$(AS2_NO_STEAM=1 GOH_GAME= node "$d/../ialint.js" "$d/goh" --exe goh -q 2>/dev/null | grep ' findings$')   # no GoH install found: no place check
# --exe goh with no --game takes the GoH install (games.install) in folder mode too: gohgame/ (mini GoH install, place gun_main) flags gun_goh
gd=$(cd "$d/gohgame" && { pwd -W 2>/dev/null || pwd; })
gf=$(AS2_NO_STEAM=1 GOH_GAME="$gd" node "$d/../ialint.js" "$d/goh" --exe goh -q 2>/dev/null | grep -E ': WARN_FIRE_PLACE |findings$' | cut -d' ' -f1,2 | tr '\n' ' ')
[ "$gf" = "set/interaction_entity/entity.set:16: WARN_FIRE_PLACE 1 findings " ] || { gg="fallback: $gf"; }
# the GoH-only note names the break hint only on destroy
nd=$(node "$d/../ialint.js" "$d/goh" 2>/dev/null | grep -c 'break also runs'); [ "$nd" = 1 ] || gg="destroy hint on $nd lines"
ga=$(node "$d/../ialint.js" "$d/goh" -q 2>/dev/null); gm=$(node "$d/../ialint.js" "$d/goh" --exe mowas_2 -q 2>/dev/null); gm2=$(node "$d/../ialint.js" "$d/goh" --exe mowas2 -q 2>/dev/null)
node "$d/../ialint.js" "$d/goh" --exe nope >/dev/null 2>&1; rc=$?
nu=$(echo "$ga" | grep -c ': INT_EVENT_UNKNOWN .*GoH-only event')
if [ "$gg" = "0 findings" ] && [ "$nu" = 4 ] && [ "$ga" = "$gm" ] && [ "$ga" = "$gm2" ] && [ "$rc" = 2 ]; then g=ok; else g=BAD; b=BAD; echo "goh: [$gg] as2 unknown $nu rc $rc"; fi
echo "game $g"
# --vfs --exe goh with no --game and no GoH install found: one line says so, then the usage, exit 2
nl=$(AS2_NO_STEAM=1 GOH_GAME= node "$d/../ialint.js" --vfs --exe goh 2>&1 >/dev/null | head -1); nrc=$(AS2_NO_STEAM=1 GOH_GAME= node "$d/../ialint.js" --vfs --exe goh >/dev/null 2>&1; echo $?)
if [ "$nl" = 'ialint: no GoH install found (set GOH_GAME or give --game)' ] && [ "$nrc" = 2 ]; then echo "noinstall ok"; else b=BAD; echo "noinstall BAD [$nl] rc $nrc"; fi
# restore points: a place named only in <mod>/.arsenal-undo is not read by default (WARN_FIRE_PLACE), read with --restore-points
u="$G/rpmod"; mkdir -p "$u/resource/set/interaction_entity" "$u/.arsenal-undo/t1/resource/entity"
printf '{entities\r\n {"x"\r\n  {on fire "rp_gun"\r\n   {con "x"}\r\n  }\r\n }\r\n}\r\n' > "$u/resource/set/interaction_entity/entity.set"
printf '{place "rp_gun"}\r\n' > "$u/.arsenal-undo/t1/resource/entity/x.def"
r1=$(node "$d/../ialint.js" "$u" -q 2>/dev/null | grep -c ': WARN_FIRE_PLACE '); r2=$(node "$d/../ialint.js" "$u" -q --restore-points 2>/dev/null | grep -c ': WARN_FIRE_PLACE ')
if [ "$r1" = 1 ] && [ "$r2" = 0 ]; then echo "restore-points ok"; else b=BAD; echo "restore-points BAD default $r1 with flag $r2"; fi
(cd "$d" && sh ../../binhdr/test/rcwire.sh node ../ialint.js bad) || exit 1
node "$d/shape.js" > /dev/null || { echo "shape FAIL"; exit 1; }
[ "$b" = ok ] && [ "$n" = 0 ] && echo PASS
