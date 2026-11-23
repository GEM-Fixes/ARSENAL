#!/bin/sh
# botrecipe: loose bot.lua patched; packed bot.lua patched; missing anchor refused; already-fixed no-op; out==mod refused; games.js: --exe, GoH
# Author: Imperator_Aug (ARSENAL, ia-9d293c99)
cd "$(dirname "$0")"
B=../botrecipe.js; F=fixture
rm -rf $F; mkdir -p $F/loose/resource/script/multiplayer $F/noanchor/resource/script/multiplayer
node -e "
const fs=require('fs'),zw=require('../../lib/zipwrite');
const lua='local function f(txt)\r\n\tfor m in string.gmatch(txt, \"Loading map \'([^\']+)\'\") do last = m end\r\n\treturn last\r\nend\r\nlocal function g(txt, name)\r\n\tif string.find(txt, \"Not found - \" .. name, 1, true) then return \"missing\" end\r\nend\r\n';
fs.writeFileSync('$F/loose/resource/script/multiplayer/bot.lua',lua);
fs.writeFileSync('$F/noanchor/resource/script/multiplayer/bot.lua','local x = 1\r\n');
fs.mkdirSync('$F/packed/resource',{recursive:true});zw.writeZip('$F/packed/resource/gamelogic.pak',[['script/multiplayer/bot.lua',Buffer.from(lua)]]);
" || exit 1
node $B $F/loose --out $F/o1 >/dev/null || { echo "FAIL: loose"; exit 1; }
node $B $F/packed --out $F/o2 >/dev/null || { echo "FAIL: packed"; exit 1; }
cmp $F/o1/resource/script/multiplayer/bot.lua $F/o2/resource/script/multiplayer/bot.lua || { echo "FAIL: loose/packed differ"; exit 1; }
grep -q 'Starting' $F/o1/resource/script/multiplayer/bot.lua && grep -q 'S.logWorks = true' $F/o1/resource/script/multiplayer/bot.lua || { echo "FAIL: edits missing"; exit 1; }
node -e "process.exit(/(^|[^\r])\n/.test(require('fs').readFileSync('$F/o1/resource/script/multiplayer/bot.lua','latin1'))?1:0)" || { echo "FAIL: CRLF"; exit 1; }
node $B $F/noanchor --out $F/o3 2>&1 | grep -q BOT_ANCHOR_MISSING || { echo "FAIL: no refusal"; exit 1; }
[ -e $F/o3 ] && { echo "FAIL: wrote on refusal"; exit 1; }
node $B $F/o1 --out $F/o4 | grep -q 'nothing to patch' || { echo "FAIL: idempotence"; exit 1; }
node $B $F/loose --out $F/loose/sub 2>&1 | grep -q BOT_OUT_IS_SOURCE || { echo "FAIL: out==src"; exit 1; }
# widened anchor: a bot that parses the Starting line itself (map done) and has no log-based buy check (n/a) must not refuse; fails on the old tool with BOT_ANCHOR_MISSING
mkdir -p $F/own/resource/script/multiplayer $F/nolog/resource/script/multiplayer $F/near/resource/script/multiplayer
printf 'function P(t) return t:match(%s) end\r\nBotApi.Events:Subscribe(BotApi.Events.Quant, P)\r\n' "'Starting \"multi/([^:\"]+)'" > $F/own/resource/script/multiplayer/bot.lua
printf 'local x = 1\r\nBotApi.Events:Subscribe(BotApi.Events.Quant, x)\r\n' > $F/nolog/resource/script/multiplayer/bot.lua
printf 'BotApi.Events:Subscribe(BotApi.Events.Quant, x)\r\nfor m in string.gmatch(txt, "Loading map \\"(.-)\\"") do last = m end\r\n' > $F/near/resource/script/multiplayer/bot.lua
node $B $F/own --out $F/o5 2>&1 | grep -q 'not-applicable \[buy-NotFound-proves-log\]' || { echo "FAIL: own-parse bot refused"; exit 1; }
node $B $F/nolog --out $F/o6 --copy >/dev/null || { echo "FAIL: nolog bot refused"; exit 1; }
cmp $F/nolog/resource/script/multiplayer/bot.lua $F/o6/resource/script/multiplayer/bot.lua || { echo "FAIL: --copy not identical"; exit 1; }
node $B $F/near --out $F/o7 2>&1 | grep -q BOT_ANCHOR_MISSING || { echo "FAIL: near-miss anchor patched or passed"; exit 1; }
# C2 data mode = run/chainn3/bot.js (copy: chainn3/bot.js.orig): same bytes as the script wrote into chainn3_t (chainn3/want)
C=chainn3; rm -rf $F/c2 $F/c2ip; cp -r $C/mod $F/c2ip
node $B $C/mod --out $F/c2 --buy-first chainn3_cromwell --stock $C/stock --cheap --team-mode chainn3_zones --bot-main $C/bot.main.lua >/dev/null || { echo "FAIL: data mode"; exit 1; }
for f in script/multiplayer/bot.data.lua script/multiplayer/bot.main.lua set/multiplayer/units/vehicles_eng.set set/multiplayer/games/chainn3_zones.set; do
  cmp -s $F/c2/resource/$f $C/want/resource/$f || { echo "FAIL: data mode $f differs from bot.js output"; exit 1; }
done
# in place (as bot.js did) twice: idempotent, same bytes
for i in 1 2; do node $B $F/c2ip --out $F/c2ip --buy-first chainn3_cromwell --stock $C/stock --cheap --team-mode chainn3_zones --bot-main $C/bot.main.lua >/dev/null || { echo "FAIL: in place $i"; exit 1; }; done
node -e "const fs=require('fs');process.exit(fs.readFileSync('$F/c2ip/resource/script/multiplayer/bot.data.lua').equals(fs.readFileSync('$C/want/resource/script/multiplayer/bot.data.lua'))&&fs.readFileSync('$F/c2ip/resource/set/multiplayer/units/vehicles_eng.set').equals(fs.readFileSync('$C/want/resource/set/multiplayer/units/vehicles_eng.set'))?0:1)" || { echo "FAIL: in place not idempotent"; exit 1; }
# seeded: wrong --after refuses and writes nothing; a units set without the card refuses
node $B $C/mod --out $F/c2x --buy-first chainn3_cromwell --stock $C/stock --after nosuch 2>&1 | grep -q BOT_ANCHOR_MISSING || { echo "FAIL: bad --after not refused"; exit 1; }
[ -e $F/c2x ] && { echo "FAIL: wrote on refusal"; exit 1; }
node $B $C/mod --out $F/c2y --buy-first nosuch_tank --stock $C/stock --cheap 2>&1 | grep -q BOT_NO_CARD || { echo "FAIL: missing card not refused"; exit 1; }
# C2b --card-like: mod without the chainn3 card gets it as a copy of cromwell_mk_vii right after it; --cheap then = want except {cost} (gen set 50)
rm -rf $F/c2c; mkdir -p $F/c2c/resource/set/multiplayer/units
node -e "const fs=require('fs');fs.writeFileSync('$F/c2c/resource/set/multiplayer/units/vehicles_eng.set',fs.readFileSync('$C/mod/resource/set/multiplayer/units/vehicles_eng.set','latin1').replace(/\{\"chainn3_cromwell\"[^\r\n]*\r\n/,''),'latin1')"
node $B $F/c2c --out $F/c2c --buy-first chainn3_cromwell --stock $C/stock --card-like cromwell_mk_vii --cheap >/dev/null || { echo "FAIL: card-like"; exit 1; }
node -e "const fs=require('fs');const a=fs.readFileSync('$F/c2c/resource/set/multiplayer/units/vehicles_eng.set','latin1'),b=fs.readFileSync('$C/want/resource/set/multiplayer/units/vehicles_eng.set','latin1').replace(/(\"chainn3_cromwell\"[^\r\n]*)\{cost 50\}/,'\$1{cost 350}');process.exit(a===b?0:1)" || { echo "FAIL: card-like line differs"; exit 1; }
node $B $F/c2c --out $F/c2c --buy-first chainn3_cromwell --stock $C/stock --card-like cromwell_mk_vii --cheap | grep -q 'card chainn3_cromwell: already' || { echo "FAIL: card-like rerun"; exit 1; }
node $B $F/c2c --out $F/c2z --buy-first x_tank --stock $C/stock --card-like nosuch 2>&1 | grep -q BOT_NO_CARD || { echo "FAIL: card-like bad base not refused"; exit 1; }
# COV-C13 (a) PORT-48: mod.info range follows the source (old tool wrote Min 3.301, no Max, for any source: TESTRUN_MODE_MIX / "Unsupported game version")
MI() { node -e "const b=require('fs').readFileSync('$1');const s=b.toString('latin1');process.exit(/MinGameVersion \"$2\"/.test(s)&&('$3'?/MaxGameVersion \"$3\"/.test(s):!/MaxGameVersion/.test(s))&&require('../../lib/modinfotext').isCrlf(b)?0:1)"; }
rm -rf $F/mi1 $F/mi2 $F/mi3 $F/mi4 $F/milg $F/mimd
cp -r $F/nolog $F/milg; printf '{Mod\r\n\t{Name "x"}\r\n\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n' > $F/milg/mod.info
cp -r $F/nolog $F/mimd; printf '{Mod\r\n\t{Name "x"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n' > $F/mimd/mod.info
node $B $F/milg --out $F/mi1 --copy >/dev/null && MI $F/mi1/mod.info 3.262.0 3.262.1 || { echo "FAIL: legacy source got no legacy range (PORT-48)"; exit 1; }
node $B $F/mimd --out $F/mi2 --copy >/dev/null && MI $F/mi2/mod.info 3.301 '' || { echo "FAIL: modern source not as64 range"; exit 1; }
node $B $F/nolog --out $F/mi3 --copy >/dev/null && MI $F/mi3/mod.info 3.262.0 3.262.1 || { echo "FAIL: no source mod.info not mowas2 default"; exit 1; }
node $B $F/milg --out $F/mi4 --copy --target as64 | grep -q 'mod.info as64 (--target)' && MI $F/mi4/mod.info 3.301 '' || { echo "FAIL: --target as64"; exit 1; }
node $B $F/milg --out $F/mi4 --copy --target goh 2>&1 | grep -q -- '--target as64|mowas2' || { echo "FAIL: bad --target not refused"; exit 1; }
# data mode to a new folder gets one too; in place never writes the mod's mod.info
node $B $C/mod --out $F/mi5 --buy-first chainn3_cromwell --stock $C/stock >/dev/null && [ -f $F/mi5/mod.info ] || { echo "FAIL: data mode out has no mod.info"; exit 1; }
rm -rf $F/c2d; mkdir -p $F/c2d; cp -r $C/mod/resource $F/c2d/; node $B $F/c2d --out $F/c2d --buy-first chainn3_cromwell --stock $C/stock >/dev/null; [ -e $F/c2d/mod.info ] && { echo "FAIL: in place wrote mod.info"; exit 1; }
# T-CHAINFIX seeded (G-CHAIN2): a German card (vehicles_ger.set) with --after mk7 (an ["eng"] unit) is refused, nothing written; without --after the line
# lands in the ["ger"] list after its first Tank row (pz2l); an ["eng"] card (chainn3, above) keeps mk7
rm -rf $F/ga $F/gb $F/gm; mkdir -p $F/gm/resource/set/multiplayer/units
printf '{"pz4h" {cost 300}}\r\n{"panzer4j" {cost 300}}\r\n' > $F/gm/resource/set/multiplayer/units/vehicles_ger.set
node $B $F/gm --out $F/ga --buy-first panzer4j --after mk7 --stock $C/stock 2>&1 | grep -q 'BOT_ARMY_MISMATCH.*\["eng"\].*army ger' || { echo "FAIL: German card after mk7 not refused"; exit 1; }
[ -e $F/ga ] && { echo "FAIL: wrote on army refusal"; exit 1; }
# in place, the unit is in the game's list already and the mod has no list of its own: nothing to change, nothing written (no unchanged copy)
rm -rf $F/c2n; mkdir -p $F/c2n/resource
node $B $F/c2n --out $F/c2n --buy-first cromwell_mk_vii --stock $C/stock > $F/c2n.out 2>&1 || { echo "FAIL: already in place: not exit 0"; cat $F/c2n.out; exit 1; }
grep -q 'buy-first cromwell_mk_vii: already' $F/c2n.out && grep -q 'nothing to change' $F/c2n.out || { echo "FAIL: already in place: not said"; cat $F/c2n.out; exit 1; }
[ -e $F/c2n/resource/script ] && { echo "FAIL: already in place: copied the unchanged list into the mod"; exit 1; }
node $B $F/c2n --out $F/c2n --buy-first cromwell_mk_vii --stock $C/stock --keep-copy >/dev/null && [ -f $F/c2n/resource/script/multiplayer/bot.data.lua ] || { echo "FAIL: --keep-copy did not copy"; exit 1; }
rm -rf $F/c2n $F/c2n.out
node $B $F/gm --out $F/gb --buy-first panzer4j --stock $C/stock | grep -q 'after pz2l (\["ger"\] list' || { echo "FAIL: no ger anchor"; exit 1; }
node -e "const s=require('fs').readFileSync('$F/gb/resource/script/multiplayer/bot.data.lua','latin1');const i=s.indexOf('unit = \"panzer4j\"'),h=[...s.slice(0,i).matchAll(/\[\"(\w+)\"\] = \{/g)].pop()[1];process.exit(h==='ger'&&/unit = \"pz2l\"\},\r\n\t+\{priority = 1000.0, class = UnitClass.Tank, unit = \"panzer4j\"\},\r\n/.test(s)&&!/(^|[^\r])\n/.test(s)?0:1)" || { echo "FAIL: panzer4j not in the ger list after pz2l"; exit 1; }
node $B $F/gm --out $F/gb --buy-first panzer4j --after pz4h --stock $F/gb 2>&1 | grep -q 'already' || { echo "FAIL: ger rerun not idempotent"; exit 1; }
rm -rf $F/ga $F/gb $F/gm
rm -rf $F/c2 $F/c2ip $F/c2c $F/c2d $F/mi1 $F/mi2 $F/mi3 $F/mi4 $F/mi5 $F/milg $F/mimd
# GX bots: --stage N + --army (no card in the mod): the line lands in that stage only; bad stage refused with a plain line
rm -rf $F/st; mkdir -p $F/st/resource
node $B $F/st --out $F/st --buy-first zz_unit --army eng --stage 3 --class Tank --priority 2.0 --stock $C/stock >/dev/null || { echo "FAIL: --stage"; exit 1; }
node -e "const s=require('fs').readFileSync('$F/st/resource/script/multiplayer/bot.data.lua','latin1');const i=s.indexOf('unit = \"zz_unit\"'),a=s.indexOf('{--purchase 3'),b=s.indexOf('{--purchase 4');process.exit(i>a&&i<b&&s.split('zz_unit').length===2?0:1)" || { echo "FAIL: --stage 3 misplaced"; exit 1; }
node $B $F/st --out $F/st --buy-first zz_two --army eng --stage 99 --stock $C/stock 2>&1 | grep -q 'in plain words' || { echo "FAIL: no plain line"; exit 1; }
rm -rf $F/st
# fix2: a stock list with every Lua comment stripped (no {--purchase N}): --stage finds stages by table position; past the end names the real count
rm -rf $F/nc $F/ncs; mkdir -p $F/nc/resource; cp -r $C/stock $F/ncs
node -e "const f='$F/ncs/script/multiplayer/bot.data.lua',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'latin1').replace(/--[^\r\n]*/g,''),'latin1')"
grep -q -- '--purchase' $F/ncs/script/multiplayer/bot.data.lua && { echo "FAIL: comments not stripped"; exit 1; }
node $B $F/nc --out $F/nc --buy-first zz_nc --army eng --stage 2 --class Tank --stock $F/ncs >/dev/null || { echo "FAIL: --stage 2 on a list with no comments"; exit 1; }
grep -q 'unit = "zz_nc"' $F/nc/resource/script/multiplayer/bot.data.lua || { echo "FAIL: zz_nc not written"; exit 1; }
N=$(node -e "console.log(require('../stages').stagesOf(require('fs').readFileSync('$F/ncs/script/multiplayer/bot.data.lua','latin1')).length)")
[ "$N" -ge 2 ] || { echo "FAIL: stages of a list with no comments: $N"; exit 1; }
node $B $F/nc --out $F/nc --buy-first zz_nc2 --army eng --stage 99 --stock $F/ncs 2>&1 | grep -q "the list has $N stages" || { echo "FAIL: stage 99 does not name the real count ($N)"; exit 1; }
node -e "const p=require('../plain');process.exit(/has $N purchase stages: pick a stage from 1 to $N/.test(p.of('BOT_NO_STAGE: no purchase stage 99 in x (the list has $N stages)'))?0:1)" || { echo "FAIL: plain.js does not give the real stage count"; exit 1; }
rm -rf $F/nc $F/ncs
# fix3 T3: a list in the shape of a real mod ("ai spawn improved for robz"): no spaces around =, fields after unit, a comma inside the
# braces, a "-- note" after a row, one stage. --army ger --stage 1 lands in ["ger"] of stage 1; --after keeps the note on its own row
rm -rf $F/rm; mkdir -p $F/rm/resource/script/multiplayer
printf 'Purchases = {\r\n\t{--single full roster\r\n\t\tRepeat = 0,\r\n\t\tUnits = {\r\n\t\t\t["eng"] = {\r\n\t\t\t\t{priority=2.0, class=UnitClass.Infantry,   unit="riflemans(eng)", line=true, inf="rifle",},\r\n\t\t\t\t{priority=1.0, class=UnitClass.MG      ,   unit="stormtrooper6(eng)",}, -- SAS Bren LMG team\r\n\t\t\t\t{priority=1.5, class=UnitClass.Tank,       unit="mk7",                min_income=1.0, unlock=300,},\r\n\t\t\t},\r\n\t\t\t["ger"] = {\r\n\t\t\t\t{priority=2.0, class=UnitClass.Infantry,   unit="volksgrens(ger)", line=true,},\r\n\t\t\t\t{priority=1.5, class=UnitClass.Tank,       unit="pz2l",               min_income=1.0, unlock=420,},\r\n\t\t\t},\r\n\t\t},\r\n\t},\r\n}\r\n' > $F/rm/resource/script/multiplayer/bot.data.lua
node $B $F/rm --out $F/rm --buy-first zz_rm --army ger --stage 1 --class Tank >/dev/null || { node $B $F/rm --out $F/rm --buy-first zz_rm --army ger --stage 1 --class Tank; echo "FAIL: real-mod shape: --army ger --stage 1"; exit 1; }
node -e "const s=require('fs').readFileSync('$F/rm/resource/script/multiplayer/bot.data.lua','latin1');process.exit(/unit=\"pz2l\",[^\r\n]*\r\n\t+\{priority = 1000.0, class = UnitClass.Tank, unit = \"zz_rm\"\},\r\n/.test(s)&&s.indexOf('zz_rm')>s.indexOf('[\"ger\"]')?0:1)" || { echo "FAIL: real-mod shape: zz_rm not after pz2l in the ger list"; exit 1; }
node $B $F/rm --out $F/rm --buy-first zz_rm --army ger --stage 1 --class Tank | grep -q "zz_rm: already" || { echo "FAIL: real-mod shape: rerun not idempotent"; exit 1; }
node $B $F/rm --out $F/rm --buy-first zz_n --after "stormtrooper6(eng)" >/dev/null || { echo "FAIL: real-mod shape: --after a row with a note"; exit 1; }
grep -q 'unit="stormtrooper6(eng)",}, -- SAS Bren LMG team' $F/rm/resource/script/multiplayer/bot.data.lua || { echo "FAIL: real-mod shape: the note left its row"; exit 1; }
node $B $F/rm --out $F/rm --buy-first zz_s2 --army ger --stage 2 2>&1 | grep -q "the list has 1 stages\|the list has 1 stage" || { echo "FAIL: real-mod shape: stage 2 of a 1-stage list"; exit 1; }
# the real file, when that mod is installed here (read only: copied first)
RM="/f/SteamLibrary/steamapps/common/Men of War Assault Squad 2/mods/ai spawn improved for robz 1.30.x/resource/script/multiplayer/bot.data.lua"
if [ -f "$RM" ]; then rm -rf $F/rm2; mkdir -p $F/rm2/resource/script/multiplayer; cp "$RM" $F/rm2/resource/script/multiplayer/; for A in eng ger ger_ss rus_guard axis_minor; do node $B $F/rm2 --out $F/rm2o --buy-first zz_$A --army $A --stage 1 --class Tank >/dev/null 2>&1 || { echo "FAIL: real mod list: --army $A --stage 1"; exit 1; }; done; rm -rf $F/rm2 $F/rm2o; fi
rm -rf $F/rm
node check.js >/dev/null || { node check.js; echo "FAIL: --check (test/check.js)"; exit 1; }
# game parity: --exe as64|mowas_2 on a made-up shared AS2 install; GoH buy lists (units/<army>/<stage>.<army>.lua) and the GoH refusals
node games.js >/dev/null || { node games.js; echo "FAIL: games (test/games.js)"; exit 1; }
# GoH purchase-list reader (gohbuys.js: what GoH bots buy, read only) and luatable Name["key"] = v
node gohbuys.js >/dev/null || { node gohbuys.js; echo "FAIL: gohbuys (test/gohbuys.js)"; exit 1; }
echo PASS
