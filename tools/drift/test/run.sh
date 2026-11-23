#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-7cab3755)
cd "$(dirname "$0")"
node mkfixture.js v1 || exit 1
node ../drift.js stamp fixture/game/mods/m --keep-base > stamp.txt || exit 1
cat stamp.txt
grep -q '"resource/set/a.def"' fixture/game/mods/m/release.json || { echo "FAIL: a.def not stamped"; exit 1; }
grep -q 'e.def' fixture/game/mods/m/release.json && { echo "FAIL: mod-only file stamped"; exit 1; }
[ -f fixture/game/mods/m/.as2base/resource/set/a.def ] || { echo "FAIL: no .as2base copy"; exit 1; }
node ../drift.js stamp fixture/game/mods/n --dry-run | grep -q 'would stamp 1 files' || { echo "FAIL: dry-run"; exit 1; }
[ -f fixture/game/mods/n/release.json ] && { echo "FAIL: dry-run wrote"; exit 1; }
node ../drift.js check fixture/game/mods/n | grep -q '^release.json: NO_STAMP' || { echo "FAIL: NO_STAMP"; exit 1; }
node ../drift.js stamp fixture/game/mods/zz 2>/dev/null && { echo "FAIL: missing mod accepted"; exit 1; }
node mkfixture.js update || exit 1
node ../drift.js check fixture/game/mods/m > out.txt
cat out.txt
grep -v '^#' truth.md | sed 's/^info: //; s/: / /' | sort > want.txt
grep -v 'findings$\|^by code\| files$\|^  ' out.txt | sed 's/^info: //' | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
node exe.js || { echo "FAIL: --exe (vfs/gamever hand-over, GoH, mod outside mods/)"; exit 1; }
echo PASS
