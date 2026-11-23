#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-dbb1946c)
cd "$(dirname "$0")"
node mkfixture.js || exit 1
rm -f got.txt out.txt; : > got.txt
while IFS='|' read -r spec _; do
  name=${spec%% *}; a=${spec#* }
  rm -rf fixture/out_$name fixture/out_wm
  node ../mission-clone.js --game fixture/game --out fixture/out_$name $a -q > fixture/o_$name.txt </dev/null
  cat fixture/o_$name.txt >> out.txt
  grep -v '^info:' fixture/o_$name.txt | grep -oE ': (WARN_)?MC_[A-Z_]+' | sed "s/^: /$name /" >> got.txt
done < scenarios.txt
grep -v '^#' truth.md | sort > want.txt
sort got.txt -o got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
chk() { grep -q "$2" "$1" || { echo "FAIL: $1 lacks $2"; exit 1; }; }
nochk() { grep -q "$2" "$1" && { echo "FAIL: $1 has $2"; exit 1; }; true; }
O=fixture/out_bz_add/resource/map/multi/m1/battle_zones.mi
chk $O 'flag_point_3'; nochk $O 'flag_point_4'; chk $O '{MID 5}'; chk $O '{Position 0 100}'
# CRLF preserved everywhere
node -e "const b=require('fs').readFileSync(process.argv[1],'latin1');process.exit(/(^|[^\r])\n/.test(b)?1:0)" $O || { echo "FAIL: CRLF not preserved"; exit 1; }
O=fixture/out_bz_strip/resource/map/multi/m2/combat.mi
nochk $O 'flag_point'; chk $O 'name a1'; chk $O 'name b1'
O=fixture/out_cf_add/resource/map/multi/m1/captureflag.mi
chk $O 'flag_point_frontlines'; chk $O 'flag_ring'
[ -f fixture/out_frontline/resource/map/multi/m1/frontline.mi ] || { echo "FAIL: frontline copy missing"; exit 1; }
[ -f fixture/out_nosrc/resource/map/multi/m1/combat.mi ] && { echo "FAIL: nosrc wrote output"; exit 1; }
# includes: --src pak include copied (with its nested one), missing one commented out
O=fixture/out_inc/resource/map/multi/m4/combat.mi
chk $O '(include "../bz_here.inc")'; chk $O '; (include "../bz_gone.inc") ; dropped'
[ -f fixture/out_inc/resource/map/multi/bz_here.inc ] && [ -f fixture/out_inc/resource/map/multi/bz_inner.inc ] || { echo "FAIL: include not copied"; exit 1; }
grep -q "^resource/map/multi/bz_here.inc	" fixture/out_inc/GOH-ORIGIN.tsv || { echo "FAIL: PORTREV GoH-origin ledger misses the copied include"; exit 1; }
node -e "const b=require('fs').readFileSync(process.argv[1],'latin1');process.exit(/dropped by mission-clone: file not found\r\n/.test(b)?0:1)" $O || { echo "FAIL: PORTREV dropped include comment not ended by CRLF"; exit 1; }
# GoH flag zones (chain-n3, n4): f1 radius from its GoH poly (10 m), f2 no poly -> 12, vanilla flag not doubled, spawn point with zoneId "" untouched
O=fixture/out_gohzone/resource/map/multi/m5/nosuchmode.mi
[ "$(grep -c '{zoneA 12}' $O)" = 2 ] && [ "$(grep -c '{zoneA 10}' $O)" = 1 ] || { echo "FAIL: gohzone zoneA count"; exit 1; }
[ "$(grep -c '{zoneB 12}' $O)" = 2 ] && [ "$(grep -c '{zoneB 10}' $O)" = 1 ] || { echo "FAIL: gohzone zoneB count"; exit 1; }
node -e "const s=require('fs').readFileSync(process.argv[1],'latin1');const i=s.indexOf('name a2');process.exit(/zoneA/.test(s.slice(i,s.indexOf('MID 9')))?1:0)" $O || { echo "FAIL: gohzone touched spawn point"; exit 1; }
node -e "const b=require('fs').readFileSync(process.argv[1],'latin1');process.exit(/(^|[^\r])\n/.test(b)?1:0)" $O || { echo "FAIL: gohzone CRLF"; exit 1; }
grep -q '2 GoH flag zones -> zoneA/zoneB (1 from poly, 1 at 12)' fixture/o_gohzone.txt || { echo "FAIL: gohzone info"; exit 1; }
node ../mission-clone.js --game fixture/game --out fixture/out_gz15 --map map/multi/m5 --from battle_zones --to nosuchmode --flag-zone 15 --no-lint -q > /dev/null
[ "$(grep -c '{zoneA 15}' fixture/out_gz15/resource/map/multi/m5/nosuchmode.mi)" = 1 ] || { echo "FAIL: --flag-zone"; exit 1; }
# --dry-run writes nothing; --list shows modes
node ../mission-clone.js --game fixture/game --out fixture/out_dry --map map/multi/m1 --from combat --to battle_zones --dry-run -q > /dev/null
[ -e fixture/out_dry ] && { echo "FAIL: dry-run wrote"; exit 1; }
node ../mission-clone.js --game fixture/game --list | grep -q 'map/multi/m2: battle_zones$' || { echo "FAIL: --list"; exit 1; }
# --with-mode
node ../mission-clone.js --game fixture/game --out fixture/out_wm --map map/multi/m1 --from combat --with-mode mymode --title "My Mode" -q > fixture/o_wm.txt
[ -f fixture/out_wm/resource/map/multi/m1/mymode.mi ] || { echo "FAIL: wm .mi"; exit 1; }
chk fixture/out_wm/resource/set/multiplayer/games/mymode.set '{class combat}'
[ -f fixture/out_wm/resource/map/multi/m1/mymode.info ] || { echo "FAIL: wm .info"; exit 1; }
chk fixture/out_wm/localization/#mymode.lng 'My Mode'
grep -q 'MC_NO_MODE_SET' fixture/o_wm.txt && { echo "FAIL: wm reported NO_MODE_SET"; exit 1; }
node ../mission-clone.js --game fixture/game --out fixture/out_wmd --map map/multi/m1 --from combat --with-mode mymode --dry-run -q | grep -q 'plan: .*mymode.set' || { echo "FAIL: wm dry plan"; exit 1; }
[ -e fixture/out_wmd ] && { echo "FAIL: wm dry wrote"; exit 1; }
# --src fills only what the game lacks: the mode .set comes from the game, not GoH (chain-n2)
node ../mission-clone.js --game fixture/game --out fixture/out_wms --map map/multi/m1 --from combat --with-mode mymode --src fixture/goh -q > /dev/null
grep -q 'goh_only' fixture/out_wms/resource/set/multiplayer/games/mymode.set && { echo "FAIL: --src shadowed the game mode .set"; exit 1; }
chk fixture/out_wms/resource/set/multiplayer/games/mymode.set '{teammatch}'
# --obs-fix = run/chainn3/obsfix.js (copy: obs/obsfix.js.orig) on the vanilla obstacles.reg: same bytes as the script wrote (obs/want)
rm -rf fixture/out_obs fixture/out_obs2
node ../mission-clone.js --game obs/game --out fixture/out_obs --obs-fix -q > /dev/null || { echo "FAIL: obs-fix"; exit 1; }
cmp -s fixture/out_obs/resource/set/registry/obstacles.reg obs/want/resource/set/registry/obstacles.reg || { echo "FAIL: obs-fix differs from obsfix.js output"; exit 1; }
node ../mission-clone.js --game obs/game --out fixture/out_obs --obs-fix -q | grep -q 'added \[\] already \[small_building_vaultable unbreakable_vaultable construction_vaultable post\]' || { echo "FAIL: obs-fix rerun not idempotent"; exit 1; }
cmp -s fixture/out_obs/resource/set/registry/obstacles.reg obs/want/resource/set/registry/obstacles.reg || { echo "FAIL: obs-fix rerun changed the file"; exit 1; }
# seeded: unknown base refuses and writes nothing
node ../mission-clone.js --game obs/game --out fixture/out_obs2 --obs-fix x_vaultable=nosuch -q | grep -q MC_OBS_NO_BLOCK || { echo "FAIL: obs-fix bad base not refused"; exit 1; }
[ -e fixture/out_obs2 ] && { echo "FAIL: obs-fix wrote on refusal"; exit 1; }
# T-MAPS: --list golden (whole text on the fixture), --help exit 0, no-arg = one usage line no stack, --with-mode rerun same bytes
node ../mission-clone.js --game fixture/game --list > fixture/list.txt
tr -d '\r' < list.golden | cmp fixture/list.txt - || { echo "FAIL: --list text differs from list.golden"; exit 1; }
node ../mission-clone.js --help > fixture/h.txt 2>&1 || { echo "FAIL: --help exit"; exit 1; }; chk fixture/h.txt 'usage: node tools/mission-clone'
node ../mission-clone.js --game fixture/game > fixture/e.txt 2>&1; [ $? = 2 ] || { echo "FAIL: no-arg exit"; exit 1; }; [ "$(wc -l < fixture/e.txt | tr -d ' ')" -le 1 ] && chk fixture/e.txt '^need --map' && nochk fixture/e.txt '    at ' || { echo "FAIL: no-arg msg"; exit 1; }
node ../mission-clone.js --game fixture/game --out fixture/out_wm2 --map map/multi/m1 --from combat --with-mode mymode --title "My Mode" -q > /dev/null
cmp fixture/out_wm/resource/map/multi/m1/mymode.mi fixture/out_wm2/resource/map/multi/m1/mymode.mi && cmp fixture/out_wm/resource/set/multiplayer/games/mymode.set fixture/out_wm2/resource/set/multiplayer/games/mymode.set || { echo "FAIL: --with-mode rerun differs"; exit 1; }
# T-CLONEFIX: mod.info written (Classic range on a fixture with no as64.exe), same bytes on rerun, as64.exe/--target as64 -> 3.301, --no-modinfo/--dry-run write none
chk fixture/out_wm/mod.info 'MinGameVersion "3.262.0"'; chk fixture/out_wm/mod.info 'Name "mode mymode"'; cmp fixture/out_wm/mod.info fixture/out_wm2/mod.info || { echo "FAIL: mod.info rerun differs"; exit 1; }
[ -f fixture/out_bz_add/mod.info ] || { echo "FAIL: plain clone wrote no mod.info"; exit 1; }
rm -rf fixture/out_t64; node ../mission-clone.js --game fixture/game --out fixture/out_t64 --map map/multi/m1 --from combat --to battle_zones --target as64 --no-lint -q > /dev/null; chk fixture/out_t64/mod.info 'MinGameVersion "3.301"'; nochk fixture/out_t64/mod.info MaxGameVersion
: > fixture/game/as64.exe; rm -rf fixture/out_t64b; node ../mission-clone.js --game fixture/game --out fixture/out_t64b --map map/multi/m1 --from combat --to battle_zones --no-lint -q > /dev/null; rm -f fixture/game/as64.exe; chk fixture/out_t64b/mod.info 'MinGameVersion "3.301"'
rm -rf fixture/out_nmi; node ../mission-clone.js --game fixture/game --out fixture/out_nmi --map map/multi/m1 --from combat --to battle_zones --no-modinfo --no-lint -q > /dev/null; [ -e fixture/out_nmi/mod.info ] && { echo "FAIL: --no-modinfo wrote"; exit 1; }; [ -f fixture/out_nmi/resource/map/multi/m1/battle_zones.mi ] || { echo "FAIL: --no-modinfo lost mode"; exit 1; }
# T-MCFIX: --with-mode on its own base = nothing manual, exit 0; --src-map reads m1's combat.mi, writes onto the mod's own map m1x (found via out)
node ../mission-clone.js --game fixture/game --out fixture/out_wm --map map/multi/m1 --from combat --with-mode mymode -q > fixture/o_wm3.txt; [ $? = 0 ] || { echo "FAIL: wm exit not 0"; exit 1; }
nochk fixture/o_wm3.txt MC_NEEDS_MANUAL
rm -rf fixture/out_sm; mkdir -p fixture/out_sm/resource/map/multi/m1x; : > fixture/out_sm/resource/map/multi/m1x/map.info
node ../mission-clone.js --game fixture/game --out fixture/out_sm --map map/multi/m1x --src-map map/multi/m1 --from combat --with-mode mymode --no-lint -q > fixture/o_sm.txt; [ $? = 0 ] || { echo "FAIL: src-map exit not 0"; exit 1; }
[ -f fixture/out_sm/resource/map/multi/m1x/mymode.mi ] && [ ! -e fixture/out_sm/resource/map/multi/m1/mymode.mi ] || { echo "FAIL: src-map target"; exit 1; }
node ../mission-clone.js --game fixture/game --out fixture/out_sm2 --map map/multi/nosuchmap --src-map map/multi/m1 --from combat --with-mode mymode --no-lint -q > fixture/o_sm2.txt; [ $? = 1 ] || { echo "FAIL: src-map missing target exit"; exit 1; }
chk fixture/o_sm2.txt MC_NO_TARGET_MAP
# T-CHAINFIX (TST-03): the cloned mode .set has {enableBots}. SEED base sets: no {settings} (fixture combat), a {settings} block with a commented-out
# ;{enableBots} and a ; inside a string, one that has it live (kept once); --no-bots writes the base verbatim
S=fixture/out_wm/resource/set/multiplayer/games/mymode.set
chk $S '{enableBots}'; chk $S '{settings'
G=fixture/game/resource/set/multiplayer/games
printf '{game\r\n\t{parameters "a=1;b=2"}\r\n\t{settings\r\n\t\t{scoreMin 50}\r\n\t\t;{enableBots}\r\n\t}\r\n\t(include "presets.inc")\r\n}\r\n' > $G/botoff.set
printf '{game\r\n\t{settings\r\n\t\t{enableBots}\r\n\t}\r\n}\r\n' > $G/boton.set
rm -rf fixture/out_b1 fixture/out_b2 fixture/out_b3
node ../mission-clone.js --game fixture/game --out fixture/out_b1 --map map/multi/m1 --from combat --from-mode botoff --with-mode bm1 --no-lint -q > /dev/null
S=fixture/out_b1/resource/set/multiplayer/games/bm1.set
node -e "const s=require('fs').readFileSync(process.argv[1],'latin1');const i=s.indexOf('{settings'),j=s.indexOf('(include');const live=s.slice(i,j).split('\r\n').filter(l=>/^\s*\{enableBots\}/.test(l));process.exit(live.length===1&&/;\{enableBots\}\r\n\t\t\{enableBots\}\r\n\t\}\r\n/.test(s)&&/\"a=1;b=2\"/.test(s)&&!/(^|[^\r])\n/.test(s)?0:1)" $S || { echo "FAIL: enableBots not added inside {settings} (CRLF)"; cat $S; exit 1; }
node ../mission-clone.js --game fixture/game --out fixture/out_b2 --map map/multi/m1 --from combat --from-mode boton --with-mode bm2 --no-lint -q > /dev/null
[ "$(grep -c enableBots fixture/out_b2/resource/set/multiplayer/games/bm2.set)" = 1 ] || { echo "FAIL: enableBots not kept once"; exit 1; }
node ../mission-clone.js --game fixture/game --out fixture/out_b3 --map map/multi/m1 --from combat --from-mode botoff --with-mode bm3 --no-bots --no-lint -q > /dev/null
S=fixture/out_b3/resource/set/multiplayer/games/bm3.set
nochk $S '^	*{enableBots}'; chk $S ';{enableBots}'
# did-you-mean on a misspelled map (exit code stays 1)
node ../mission-clone.js --game fixture/game --out fixture/out_dym --map map/multi/mm1 --from combat --to battle_zones -q > fixture/o_dym.txt 2>&1; [ $? = 1 ] || { echo "FAIL: dym exit"; exit 1; }
chk fixture/o_dym.txt 'Did you mean: map/multi/m1'
# --exe (as64, mowas_2, goh) on made-up installs: tools/mission-clone/test/exe.test.js
node exe.test.js | tail -1 | grep -q "^PASS" || { node exe.test.js; echo "FAIL: exe.test.js"; exit 1; }
echo PASS
