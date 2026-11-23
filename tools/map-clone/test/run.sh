#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-e59f6944)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture + outputs never touch tracked files
node mkfixture.js || exit 1
M=../map-clone.js; F="$W/fixture"; G="$W/got.txt"; : > "$G"
chk() { grep -qF -- "$2" "$1" || { echo "FAIL: $1 lacks $2"; exit 1; }; }
nochk() { grep -qF -- "$2" "$1" && { echo "FAIL: $1 has $2"; exit 1; }; true; }
run() { node $M "$@" > "$F/o.txt" 2>&1; grep -oE ': [A-Z_]+' "$F/o.txt" | sed 's/^: //' | grep -v '^MAPCLONE_\(REF_CHANGED\|COPIED\|LOC_ADDED\|BINARY_REF\)$' >> "$G"; }
run --game $F/game --map map/multi/a1 --name b1 --out $F/out1 -q
run --game $F/game --map map/multi/a2 --name b2 --out $F/out2 -q
run --game $F/game --map map/multi/a1 --name a2 --out $F/out3 -q
run --game $F/game --map map/multi/a1 --name b1 --target goh --out $F/out4 -q
run --game $F/goh --map map/multi/g1 --name h1 --target as64 --out $F/out5 -q
run --game $F/goh --map map/multi/g1 --name h1 --target goh --out $F/out6 -q
run --game $F/game --map map/multi/nope --name b3 --out $F/out7 -q
run --game $F/game --map map/multi/a1 --name 'b 4' --out $F/out8 -q
run --game $F/game --map map/multi/a1 --name b1 --out $F/out1 -q
# chain-n: source map only in a mod: --mods id (vfs), --mod dir; without them MAPCLONE_NO_MAP
run --game $F/game --map map/multi/m9 --name n9 --out $F/out11 --mods mm_t -q
run --game $F/game --map map/multi/d9 --name n8 --out $F/out12 --mod $F/loose_mod -q
run --game $F/game --map map/multi/m9 --name n7 --out $F/out13 -q
run --game $F/game --map map/single/sub/s1 --name s2 --out $F/out14 -q
run --game $F/game --map map/multi/a1 --name b15 --out $F/out15 --no-modinfo -q
run --game $F/game --map map/multi/a1 --name b16 --out $F/out16 --target as64 --game-version 3.301,3.302 -q
run --game $F/game --map map/multi/a1 --name b17 --out $F/out17 --game-version 3.x -q
# game parity, GoH branch: --game-version range on a GoH clone (no finding); --out in the GoH game files refused (writeguard)
run --game $F/goh --map map/multi/g1 --name h2 --target goh --game-version 1.067,1.067 --out $F/out22 -q
run --game $F/goh --map map/multi/g1 --name h3 --target goh --out $F/goh/resource/h3 -q
# C2c: mode with a missing include warns (old tool: silent); --only-mode copies one mode, no warn; unknown mode refused
run --game $F/game --map map/multi/i1 --name j1 --out $F/out18 -q
run --game $F/game --map map/multi/i1 --name j2 --out $F/out19 --only-mode combat -q
run --game $F/game --map map/multi/i1 --name j3 --out $F/out20 --only-mode nosuch -q
grep -v '^#' truth.md | sort > "$W/want.txt"; sort "$G" -o "$G"
d=$(diff "$W/want.txt" "$G") || { echo "FAIL: findings differ from truth.md: $(printf '%s' "$d" | tr '\r\n' '  ')"; exit 1; }
O=$F/out1/resource/map/multi/b1
chk $O/combat.mi 'map/multi/b1/combat'; chk $O/combat.mi '{Same "b1"}'; chk $O/combat.mi '"a1_b"'; chk $O/combat.mi '; a1'
cmp $O/map.net $F/game/resource/map/multi/a1/map.net || { echo "FAIL: map.net edited"; exit 1; }
cmp $O/map.ply $F/game/resource/map/multi/a1/map.ply || { echo "FAIL: map.ply edited"; exit 1; }
[ -f $F/out2/resource/map/multi/b2/map.net ] || { echo "FAIL: packed map not copied"; exit 1; }
chk $F/out2/resource/map/multi/b2/combat.mi 'map/multi/b2/combat'
chk $F/out1/localization/mission/multi/b1.lng '"name" "b1"'
[ -e $F/out5 ] && { echo "FAIL: mismatch wrote"; exit 1; }
[ -f $F/out6/resource/map/multi/h1/map.net ] || { echo "FAIL: goh clone"; exit 1; }
[ -e $F/out6/localization ] && { echo "FAIL: goh loc written"; exit 1; }
# GoH lobby name: own .pot (not a shadow of vanilla mission.pot), msgctxt of the clone, vanilla name (continued, escaped) carried
P=$F/out6/localizations/default/interface/text/mission/multi/h1.pot; [ -f $P ] || { echo "FAIL: goh .pot not at $P"; exit 1; }
chk $P 'msgctxt "mission/multi/h1/name"'; chk $P 'msgid "[clone] G \"One\" Field"'; [ -e $F/out6/localizations/default/interface/text/mission.pot ] && { echo "FAIL: shadows mission.pot"; exit 1; }
nochk $F/out6/mod.info GameVersion; chk $F/out22/mod.info 'MinGameVersion "1.067"'; chk $F/out22/mod.info 'MaxGameVersion "1.067"'
[ -e $F/goh/mods/h3 ] && { echo "FAIL: wrote into the GoH install"; exit 1; }
# GoH exe version read from a PE (no --game-version): Min = Max = 1.067, no warning; the empty exe (out6) warns; tab and line break stay escaped in the .pot
node $M --game $F/goh2 --map map/multi/g1 --name h4 --target goh --out $F/out23 > $F/o23.txt 2>&1
chk $F/out23/mod.info 'MinGameVersion "1.067"'; chk $F/out23/mod.info 'MaxGameVersion "1.067"'; nochk $F/o23.txt WARN_MAPCLONE_GOH_VERSION
chk $F/out23/localizations/default/interface/text/mission/multi/h4.pot 'msgid "[clone] A\tB\nC"'
node $M --game $F/goh --map map/multi/g1 --name h5 --target goh --out $F/out24 > $F/o24.txt 2>&1; chk $F/o24.txt WARN_MAPCLONE_GOH_VERSION
node $M --game $F/game --map map/multi/a1 --name b9 --out $F/out9 --plan -q > /dev/null; [ -e $F/out9 ] && { echo "FAIL: plan wrote"; exit 1; }
rm -rf $F/out10; node $M --game $F/game --map map/multi/a1 --name b10 --out $F/out10 --no-mission > $F/o10.txt 2>&1; [ -e $F/out10/resource/map/multi/b10/combat.mi ] && { echo "FAIL: --no-mission copied combat.mi"; exit 1; }; [ -f $F/out10/resource/map/multi/b10/map.net ] || { echo "FAIL: --no-mission lost map.net"; exit 1; }; chk $F/o10.txt MAPCLONE_MISSION_SKIPPED
chk $F/out11/resource/map/multi/n9/combat.mi '{Same "n9"}'; [ -f $F/out12/resource/map/multi/n8/map.net ] || { echo "FAIL: --mod clone"; exit 1; }
L=$F/out14/localization/mission/single/sub/s2.lng; [ -f $L ] || { echo "FAIL: sub-folder loc not at $L"; exit 1; }; chk $F/out14/resource/map/single/sub/s2/combat.mi "map/single/sub/s2/combat"
[ -e $F/out15/mod.info ] && { echo "FAIL: --no-modinfo wrote mod.info"; exit 1; }; chk $F/out1/mod.info 'MinGameVersion "3.262.0"'
chk $F/out16/mod.info 'MinGameVersion "3.301"'; chk $F/out16/mod.info 'MaxGameVersion "3.302"'; [ -e $F/out17 ] && { echo "FAIL: bad --game-version wrote"; exit 1; }
chk $F/o.txt MAPCLONE_NO_MODE; [ -e $F/out20 ] && { echo "FAIL: --only-mode nosuch wrote"; exit 1; }
[ -f $F/out18/resource/map/multi/j1/assault.mi ] || { echo "FAIL: j1 lost assault.mi"; exit 1; }
O=$F/out19/resource/map/multi/j2; [ -f $O/combat.mi ] && [ -f $O/map.info ] && [ ! -e $O/assault.mi ] && [ ! -e $O/assault.info ] || { echo "FAIL: --only-mode files"; exit 1; }
node $M --game $F/game --map map/multi/i1 --name j4 --out $F/out21 --only-mode combat > $F/o21.txt 2>&1; chk $F/o21.txt MAPCLONE_MODE_SKIPPED
# T-MAPS: GOLD byte checks. every source file is in the clone; terrain (non .mi/.info) byte-identical; a fresh second clone = same bytes as the first
node $M --game $F/game --map map/multi/a1 --name b1 --out $F/out1b -q > /dev/null
cmp $F/out1/resource/map/multi/b1/map.net $F/out1b/resource/map/multi/b1/map.net && cmp $F/out1/resource/map/multi/b1/combat.mi $F/out1b/resource/map/multi/b1/combat.mi && cmp $F/out1/resource/map/multi/b1/map.info $F/out1b/resource/map/multi/b1/map.info && cmp $F/out1/localization/mission/multi/b1.lng $F/out1b/localization/mission/multi/b1.lng && cmp $F/out1/mod.info $F/out1b/mod.info || { echo "FAIL: second clone differs from first"; exit 1; }
for f in $F/game/resource/map/multi/a1/*; do b=$(basename $f); [ -f $F/out1b/resource/map/multi/b1/$b ] || { echo "FAIL: clone lacks $b"; exit 1; }; case $b in *.mi|*.info) ;; *) cmp $f $F/out1b/resource/map/multi/b1/$b || { echo "FAIL: terrain file $b not byte-identical"; exit 1; } ;; esac; done
# T-CLONEFIX: default target follows the install (as64.exe beside resource/ -> 3.301, no Max); --target mowas2 still wins; no exe -> Classic (out1 above)
: > $F/game/as64.exe; node $M --game $F/game --map map/multi/a1 --name b30 --out $F/out30 -q > /dev/null; node $M --game $F/game --map map/multi/a1 --name b31 --out $F/out31 --target mowas2 -q > /dev/null; node $M --game $F/game --map map/multi/a1 --name b32 --out $F/out32 --exe mowas_2 -q > /dev/null; rm -f $F/game/as64.exe
chk $F/out30/mod.info 'MinGameVersion "3.301"'; nochk $F/out30/mod.info MaxGameVersion; chk $F/out31/mod.info 'MinGameVersion "3.262.0"'; nochk $F/out1/mod.info '3.301'
# game parity: --exe mowas_2 is the same as --target mowas2 on the shared install (Classic range, not the as64 default)
chk $F/out32/mod.info 'MinGameVersion "3.262.0"'; chk $F/out32/mod.info 'MaxGameVersion "3.262.1"'
# --help: exit 0, usage line; bad args: finding line, no stack
node $M --help > $F/h.txt 2>&1 || { echo "FAIL: --help exit"; exit 1; }; chk $F/h.txt 'usage: ARSENAL map-clone'
node $M --game $F/game --map map/multi/nope --name z --out $F/outz > $F/e.txt 2>&1; chk $F/e.txt MAPCLONE_NO_MAP; nochk $F/e.txt '    at '
# did-you-mean on a misspelled map (exit code stays 1)
node $M --game $F/game --map map/multi/aa1 --name z2 --out $F/outz2 > $F/e2.txt 2>&1; [ $? = 1 ] || { echo "FAIL: dym exit"; exit 1; }; chk $F/e2.txt 'Did you mean: map/multi/a1'
echo PASS
