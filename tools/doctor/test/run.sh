#!/bin/sh
# fixture game: a requires b (mounted b then a), c requires missing zz (DEP_MISSING); binhdr fixture mod → per-tool lines
# Author: Imperator_Aug (ARSENAL, ia-e5d5c751)
cd "$(dirname "$0")"; fail=0
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fx, rel and the binhdr fixture are built here, never in the tree
X="$W/fx"
mi() { mkdir -p "$X/game/mods/$1/resource"; printf '{Mod\n {Name "%s"}\n {MinGameVersion "3.262"}\n {MaxGameVersion "3.262"}\n%s}\n' "$1" "$2" > "$X/game/mods/$1/mod.info"; }
mkdir -p "$X/game/resource"; mi a ' {Require "b"}\n'; mi b ''; mi c ' {Require "zz"}\n'
out=$(node ../doctor.js "$X/game/mods/a" --only vfs,modinfo --out "$X/out")
echo "$out" | grep -qF 'mounted: b, a)' || { echo "FAIL: dep order: $out"; fail=1; }
echo "$out" | grep -qE '^vfs +0 ' || { echo "FAIL: vfs line: $out"; fail=1; }
[ -f "$X/out/vfs.txt" ] || { echo "FAIL: full output file"; fail=1; }
out=$(node ../doctor.js "$X/game/mods/c" --only vfs --out "$X/out")
echo "$out" | grep -qF 'DEP_MISSING c requires "zz"' || { echo "FAIL: missing dep note: $out"; fail=1; }
# L7-CLEAN: modern mod (Min 3.301, no Max) on an as64 game mounts with as64+ first; before, refcheck exited 3 (MOD_NOT_MOUNTED) and vfs gave MOD_MODE
mkdir -p "$X/g64/resource" "$X/g64/as64/plus" "$X/g64/as64/core" "$X/g64/mods/d/resource/entity"; : > "$X/g64/as64.exe"
for f in "$X/g64/as64/plus" "$X/g64/mods/d"; do printf '{Mod\n {Name "x"}\n {MinGameVersion "3.301"}\n}\n' > "$f/mod.info"; done; printf '{game_entity\n}\n' > "$X/g64/mods/d/resource/entity/x.def"
out=$(node ../doctor.js "$X/g64/mods/d" --only vfs,refcheck --out "$X/out")
echo "$out" | grep -qF 'mounted: as64+, d)' || { echo "FAIL: modern mod without as64+: $out"; fail=1; }
echo "$out" | grep -qE 'ERROR|MOD_MODE' && { echo "FAIL: modern mod refcheck/vfs: $out"; fail=1; }
# GT-01: the same modern mod (no MaxGameVersion) on as64 is not "dropped by the game" (that rule is for legacy mods and mowas_2 only)
echo "$out" | grep -q 'NOT_MOUNTED' && { echo "FAIL: modern mod on as64 called dropped: $out"; fail=1; }
mkdir -p "$X/g32/resource" "$X/g32/mods/d/resource"; : > "$X/g32/mowas_2.exe"; printf '{Mod\n {Name "x"}\n {MinGameVersion "3.301"}\n}\n' > "$X/g32/mods/d/mod.info"
out=$(node ../doctor.js "$X/g32/mods/d" --only modinfo --out "$X/out")
echo "$out" | grep -qF 'NOT_MOUNTED "d": no MaxGameVersion' || { echo "FAIL: modern mod without Max on mowas_2 must still be dropped: $out"; fail=1; }
node ../../binhdr/test/mkfixture.js > /dev/null || { echo "FAIL: binhdr fixture"; fail=1; }
B="$W/fixture/game/mods/m1"
out=$(node ../doctor.js "$B" --out "$X/out")
for t in modinfo sdllint keylint ialint uilint milint binhdr refcheck vfs strlint humlint movlint fxlint expcheck mpsync; do echo "$out" | grep -qE "^$t " || { echo "FAIL: no $t line"; fail=1; }; done
echo "$out" | grep -q ERROR && { echo "FAIL: tool error: $(echo "$out" | grep ERROR)"; fail=1; }
echo "$out" | grep -qE '^binhdr +[1-9]' || { echo "FAIL: binhdr found nothing in fixture mod"; fail=1; }
# GUI-LOC: --locs keeps file:line samples per code (cap N), --progress lines on stderr, OOM (exit 134) reruns alone once
out=$(node ../doctor.js "$B" --only sdllint,binhdr --locs 2 --locs-json "$X/locs.json" --progress --out "$X/out" 2>"$X/prog.txt")
node -e "const j=require(process.argv[1]),t=j.tools;let n=0,cap=1;for(const k in t)for(const c in t[k].samples){const a=t[k].samples[c];n+=a.length;if(a.length>2)cap=0;if(!a.every(s=>s.file&&'msg' in s))cap=0}
if(!n)throw 'no samples';if(!cap)throw 'cap or shape';if(!Object.values(t).some(x=>Object.values(x.samples).flat().some(s=>s.line>0)))throw 'no line numbers'" "$X/locs.json" || { echo "FAIL: --locs samples: $(cat "$X/locs.json")"; fail=1; }
grep -q '^PROGRESS start sdllint' "$X/prog.txt" && grep -q '^PROGRESS done binhdr' "$X/prog.txt" || { echo "FAIL: --progress: $(cat "$X/prog.txt")"; fail=1; }
out=$(DOCTOR_TEST_OOM=binhdr node ../doctor.js "$B" --only binhdr,modinfo --locs 5 --locs-json "$X/locs2.json" --out "$X/out")
echo "$out" | grep -qF 'RERAN binhdr alone after exit 134 (out of memory): ok' || { echo "FAIL: OOM rerun note: $out"; fail=1; }
echo "$out" | grep -qE '^binhdr +[1-9]' || { echo "FAIL: rerun findings missing: $out"; fail=1; }
out=$(DOCTOR_TEST_OOM='binhdr!' node ../doctor.js "$B" --only binhdr --out "$X/out")
echo "$out" | grep -qF 'failed again' && echo "$out" | grep -qF 'binhdr    ERROR out of memory also when run alone' || { echo "FAIL: OOM twice: $out"; fail=1; }
node mkrelease.js; out=$(node ../doctor.js "$W/rel/m" --release)
for p in '\.git/: REL_STRAY_FILE' 'Thumbs\.db: REL_STRAY_FILE' 'a\.bak: REL_STRAY_FILE' 'b\.orig: REL_STRAY_FILE' 'hero\.psd: WARN_REL_STRAY_FILE' 'notes\.txt: WARN_REL_STRAY_FILE' 'dup\.def: WARN_REL_PAK_LOOSE_DUP' 'REL_NET_SIZE_ONLY 4 files.*\.mtl×1 \.ply×1 \.anm×1 \.vol×1' 'resource/empty/: REL_EMPTY_DIR' '^7 findings'; do
  echo "$out" | grep -qE "$p" || { echo "FAIL: release $p"; fail=1; }
done
# DET-FIX: two runs, same stdout bytes; the second reads directories in reverse order (determ shim), which gave `.ply×1 .mtl×1` before the walk was sorted
node ../doctor.js "$W/rel/m" --release > "$W/rel1.txt"; DETERM_ORDER=1 node -r ../../determ/shim.js ../doctor.js "$W/rel/m" --release > "$W/rel2.txt"
[ -s "$W/rel1.txt" ] && cmp -s "$W/rel1.txt" "$W/rel2.txt" || { echo "FAIL: release two runs differ: $(diff "$W/rel1.txt" "$W/rel2.txt")"; fail=1; }
outq=$(node ../doctor.js "$W/rel/m" --release -q)
echo "$outq" | grep -q REL_NET_SIZE_ONLY && { echo "FAIL: -q shows info"; fail=1; }
echo "$outq" | grep -qE '^7 findings' || { echo "FAIL: -q findings count"; fail=1; }
out=$(node ../doctor.js "$B" -q --only vfs --out "$X/out"); echo "$out" | grep -qE '^vfs ' || { echo "FAIL: -q normal mode"; fail=1; }
(sh ../../binhdr/test/rcwire.sh node ../doctor.js "$W/rel/m" --release) || fail=1
sh env.sh | tail -1 | grep -q PASS || { echo "FAIL: env.sh"; sh env.sh; fail=1; }
# game parity: --exe mowas_2 / goh, GoH install detected, GAME_SKIP, --exe forwarded, envcheck + --release per game (games-test.js)
g=$(node games-test.js 2>&1); echo "$g" | tail -1 | grep -q PASS || { echo "FAIL: games-test"; echo "$g"; fail=1; }
[ $fail = 0 ] && echo PASS || echo FAIL
