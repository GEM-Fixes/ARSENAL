#!/bin/sh
# envcheck seeded defects (env-truth.md): VFS-13 not installed x2, VFS-33 overlay shadows own file x2 (a loose, b pak), MAP-27 loose map vs own pak (info)
# Author: Imperator_Aug (ARSENAL, ia-3ce951c7)
cd "$(dirname "$0")"; fail=0
# work dir: the caller's TEST_WORK (doctor run.sh) or an own temp dir; fx/env is never written in the tree
if [ -z "$TEST_WORK" ]; then W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"; fi
X="$TEST_WORK/fx"; rm -rf "$X/env"; node mkenv.js || exit 1
node ../doctor.js "$X/env/game/mods/m" --only envcheck --mods-list "m:1,Zed:1,ghost:2" --out "$X/out" > "$X/env.out"; full=$(cat "$X/out/envcheck.txt")
for p in 'mods list: DOC_MOD_NOT_INSTALLED "Zed:1"' 'DOC_MOD_NOT_INSTALLED "ghost:2"' 'mod/entity/a\.def: DOC_MAPMOD_SHADOWS .*loose' 'mod/entity/b\.def: DOC_MAPMOD_SHADOWS .*pak own\.pak' 'mod/: DOC_MAPMOD_OVERLAY' 'mm/map: DOC_MAP_LOOSE_SHADOWS_PAK'; do
  echo "$full" | grep -qE "$p" || { echo "FAIL: env $p"; fail=1; }
done
echo "$full" | grep -qE 'c\.def: DOC_MAPMOD_SHADOWS' && { echo "FAIL: c.def has no own copy"; fail=1; }
grep -qE '^4 findings' "$X/env.out" || { echo "FAIL: count 4"; fail=1; }
grep -q 'info DOC_MAP_LOOSE' "$X/env.out" || { echo "FAIL: info shown"; fail=1; }
node ../doctor.js "$X/env/game/mods/m" --only envcheck -q --out "$X/out" | grep -q 'info ' && { echo "FAIL: -q info"; fail=1; }
# MIXB: TST-87 root set/, TST-94 common.set lacking stock includes, TST-95 army id 6..99 + level 2 card; clean twin ok
M="$X/mixb/game/mods"; rm -rf "$X/mixb"
for n in bad ok; do mkdir -p "$M/$n/resource/set/multiplayer/units" "$M/$n/resource/set/multiplayer/armies"; mkdir -p "$X/mixb/game/resource"
  printf '{Mod\n {Name "%s"}\n {MinGameVersion "3.262"}\n {MaxGameVersion "3.262"}\n}\n' "$n" > "$M/$n/mod.info"
  printf '{army\r\n\t{id 6}\r\n\t{title "mp/army/fin"}\r\n}\r\n' > "$M/$n/resource/set/multiplayer/armies/fin.set"; done
mkdir -p "$M/bad/set/x"; : > "$M/bad/set/x/a.set"; mkdir -p "$M/ok/resource/entity"
printf '{units\r\n\t(include "soldiers.set")\r\n}\r\n' > "$M/bad/resource/set/multiplayer/units/common.set"
printf '{units\r\n\t(include "soldiers.set")\r\n\t(include "squads.set")\r\n\t(include "vehicles.set")\r\n\t(include "fin.set")\r\n}\r\n' > "$M/ok/resource/set/multiplayer/units/common.set"
printf '{units\r\n{"a_fin" ("vs" c(60) t(all) s(fin) n(2) b(v1)) {level 3} {cost 80}}\r\n}\r\n' > "$M/bad/resource/set/multiplayer/units/fin.set"
printf '{units\r\n{"a_fin" ("vs" c(60) t(all) s(fin) n(2) b(v1)) {level 1} {cost 80}}\r\n}\r\n' > "$M/ok/resource/set/multiplayer/units/fin.set"
node ../doctor.js "$M/bad" --only envcheck --out "$X/out" > "$X/mb.out"; full=$(cat "$X/out/envcheck.txt")
for p in 'set/: MOD_ROOT_DATA_UNMOUNTED' 'common\.set: WARN_UNITS_SET_STOCK_INCLUDES.*squads\.set.*vehicles\.set' 'units/fin\.set: WARN_ARMY_RANK_LEVEL'; do echo "$full" | grep -qE "$p" || { echo "FAIL: mixb $p: $full"; fail=1; }; done
grep -qE '^3 findings' "$X/mb.out" || { echo "FAIL: mixb bad count 3: $(cat "$X/mb.out")"; fail=1; }
node ../doctor.js "$M/ok" --only envcheck --out "$X/out" > "$X/mo.out"
grep -qE 'MOD_ROOT_DATA|WARN_UNITS_SET|WARN_ARMY_RANK' "$X/out/envcheck.txt" && { echo "FAIL: mixb clean twin flagged"; fail=1; }
[ $fail = 0 ] && echo PASS || echo FAIL
