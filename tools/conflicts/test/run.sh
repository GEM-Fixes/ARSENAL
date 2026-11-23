#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-b6c37705)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../conflicts.js --game fixture/game --mods ma,mb --itm --keys > out.txt
rm -rf clean; node ../conflicts.js --game fixture/game --mods ma,mb --clean ma --out clean > clean.txt || { echo "FAIL: clean"; exit 1; }
cat out.txt
grep -v '^#' truth.md | sed 's/^info: //' | sort > want.txt
grep -v 'findings$\|^by code\|shared files$' out.txt | sed 's/^info: //' | awk '{ f=$1; sub(/:[0-9]*:?$/,"",f); sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
[ ! -e clean/resource/set/d.def ] && [ -e clean/resource/set/a.def ] && [ -e clean/mod.info ] || { echo "FAIL: clean copy content"; exit 1; }
grep -q CLEAN_REPARSE clean.txt && { echo "FAIL: reparse"; exit 1; }
node ../conflicts.js --game fixture/game --mods ma,mb --clean ma --out fixture/game/mods/ma/x >/dev/null 2>&1 && { echo "FAIL: in-place clean allowed"; exit 1; }
(sh ../../binhdr/test/rcwire.sh node ../conflicts.js --game fixture/game --mods ma,mb --itm) || exit 1
# many keys in one file: first ones listed, the rest counted; --keys lists all
node - <<'JS' || exit 1
const fs=require('fs'),p='fixture/game/';
const put=(f,v)=>{fs.mkdirSync(require('path').dirname(p+f),{recursive:true});fs.writeFileSync(p+f,'{e1\r\n'+Array.from({length:9},(_,i)=>' {k'+i+' '+v+'}').join('\r\n')+'\r\n}\r\n','latin1');};
put('resource/set/big.def',1);put('mods/ma/resource/set/big.def',2);put('mods/mb/resource/set/big.def',3);
JS
node ../conflicts.js --game fixture/game --mods ma,mb --file resource/set/big.def > roll.txt
[ "$(grep -c 'WARN_CONFLICT_MOD_MOD' roll.txt | head -1)" -ge 1 ] && grep -q WARN_CONFLICT_FILE_KEYS roll.txt && [ "$(grep -c ' WARN_CONFLICT_MOD_MOD ' roll.txt)" = 3 ] || { echo "FAIL: rollup"; cat roll.txt; exit 1; }
node ../conflicts.js --game fixture/game --mods ma,mb --file resource/set/big.def --keys > roll.txt
[ "$(grep -c ' WARN_CONFLICT_MOD_MOD ' roll.txt)" = 9 ] && ! grep -q WARN_CONFLICT_FILE_KEYS roll.txt || { echo "FAIL: --keys"; cat roll.txt; exit 1; }
rm -f roll.txt
# unknown mod name: plain 'mod not found', exit 2, nothing else
node ../conflicts.js --game fixture/game --mods ma,nosuchmod > nf.txt 2>&1; [ $? = 2 ] && grep -q '^mod not found: nosuchmod' nf.txt || { echo "FAIL: unknown mod"; cat nf.txt; exit 1; }
rm -f nf.txt
# VFS-15 clean twin: mb lists ma as {Require} -> ordered, no MOD_ORDER_UNDECLARED (the seeded pair above fired exactly once)
[ "$(grep -c ' MOD_ORDER_UNDECLARED ' out.txt)" = 1 ] || { echo "FAIL: VFS-15 seeded"; exit 1; }
printf '{mod\r\n {Name "mb"}\r\n {Require "ma"}\r\n}\r\n' > fixture/game/mods/mb/mod.info
node ../conflicts.js --game fixture/game --mods ma,mb > req.txt
grep -q MOD_ORDER_UNDECLARED req.txt && { echo "FAIL: VFS-15 clean twin flagged"; cat req.txt; exit 1; }
rm -f req.txt
node exe-test.js > /dev/null || { node exe-test.js | grep -v '^OK '; echo "FAIL: --exe (game parity)"; exit 1; }
# seeded clash kinds + the patch mod (mkseed.js, seed-truth.md), in a temp folder
node seed-test.js > seed.txt || { grep -v '^OK ' seed.txt; echo "FAIL: seeded kinds / patch mod"; exit 1; }
rm -f seed.txt
echo PASS
