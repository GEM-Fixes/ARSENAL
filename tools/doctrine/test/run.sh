#!/bin/sh
# doctrine: list/show/voice/profile; gen preview writes nothing; gen robz (loose and packed base) exact gold; CRLF and cp1251 bytes kept;
# re-gen uses the [doctrine was] originals; universal persona restores the base byte for byte; vanilla 3 keys; robz on a vanilla file refused;
# check finds range and missing-key problems; game install refused; plain errors exit 2; games.js: GoH conquest profile, --exe. No game.
# Author: Imperator_Aug (ARSENAL, ia-cfe60ea8)
cd "$(dirname "$0")"
D=../doctrine.js; F=fx; W=work; V=../../botrecipe/test/chainn3/stock/script/multiplayer/bot.data.lua
R=resource/script/multiplayer/bot.data.lua
rm -rf $W; mkdir -p $W/m1 $W/m2 $W/m3 $W/packed/resource $W/game/resource $W/game/mods/gm
fail() { echo "FAIL: $1"; exit 1; }
[ "$(node $D list personas --json | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(0)).length))")" = 9 ] || fail "9 personas"
[ "$(node $D list rules --json | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(0)).length))")" = 38 ] || fail "38 rules"
node $D list missions | grep -q '^hedgerow' || fail "missions"
node $D show tac.smoke | grep -q 'Fit in the game' || fail "show rule"
node $D show hedgerow | grep -q 'Teaches' || fail "show mission briefing"
node $D show su-1941-rifle | grep -q 'deliberate period flaw' || fail "show persona"
[ "$(node $D voice su-1941-rifle contact 0)" = "$(node $D voice su-1941-rifle contact 0)" ] || fail "voice deterministic"
node $D voice us-1944-rifle nosuch 2>&1 | grep -q 'No chat line' || fail "voice bad event"
node $D profile robz | grep -q 'DirAttackRatio' || fail "profile robz (old id still accepted)"
node $D profile botconfig | grep -q 'DirAttackRatio' || fail "profile botconfig"
# help, profile and check texts describe the larger bot without naming another person's mod
for c in "--help" "profile botconfig" "profile vanilla" "check $F/botconfig.lua" "check $F/botconfig.lua --profile vanilla" "list profiles"; do
  node $D $c 2>&1 | grep -qi 'robz\|godny' && fail "names another mod: $c"; done
node $D gen --persona su-1941-rifle --plan 2>&1 | grep -qi 'robz\|godny' && fail "names another mod: no-file error"
node $D gen --persona su-1941-rifle --profile botconfig --base $V --plan 2>&1 | grep -qi 'godny' && fail "names another mod: mismatch error"
node $D check $F/botconfig.lua --json | node -e "const r=JSON.parse(require('fs').readFileSync(0));process.exit(r.profile==='botconfig'&&r.problems.every(p=>p.t&&p.a)?0:1)" || fail "check json: public profile name, text key per problem"
node $D profile vanilla | grep -q 'only these 3 settings' || fail "profile vanilla"
# preview writes nothing
node $D gen --persona su-1941-rifle --base $F/botconfig.lua --out $W/m1 --plan | grep -q 'Preview only' || fail "plan text"
[ -e $W/m1/resource ] && fail "plan wrote"
# write: gold values, CRLF, bytes
node $D gen --persona su-1941-rifle --base $F/botconfig.lua --out $W/m1 >/dev/null || fail "gen robz"
O=$W/m1/$R
head -1 $O | grep -q '^-- doctrine: persona su-1941-rifle on botconfig, scale 1' || fail "stamp"
grep -q 'DirAttackRatio = 1.06, -- \[doctrine was DirAttackRatio=1.4\]' $O || fail "DirAttackRatio gold"
grep -q 'GatherMax      = 112,' $O || fail "GatherMax gold"
grep -q 'HoldMaxShare   = 0.32,' $O || fail "HoldMaxShare gold"
grep -q 'SameUnitGap    = { light = 150, tank = 90 },' $O || fail "table left alone"
node -e "const t=require('fs').readFileSync('$O','latin1');process.exit(/(^|[^\r])\n/.test(t)||!t.includes('\xe0\xe1')?1:0)" || fail "CRLF or bytes"
# packed base gives the same file
node -e "require('../../lib/zipwrite').writeZip('$W/packed/resource/gamelogic.pak',[['script/multiplayer/bot.data.lua',require('fs').readFileSync('$F/botconfig.lua')]])" || fail "make pak"
node $D gen --persona su-1941-rifle --base $W/packed --out $W/m3 >/dev/null || fail "gen packed"
cmp $O $W/m3/$R || fail "packed differs from loose"
# re-gen from the mod's own (marked) copy uses the originals; universal restores the base exactly
node $D gen --persona uk-1944-infantry --out $W/m1 --json | grep -q '"was": "1.06"' || fail "regen reads current"
grep -q 'DirAttackRatio = 1.48, -- \[doctrine was DirAttackRatio=1.4\]' $O || fail "regen from original"
node $D gen --persona universal --out $W/m1 >/dev/null || fail "gen universal"
cmp $O $F/botconfig.lua || fail "universal did not restore the base"
node $D gen --persona su-1941-rifle --base $F/botconfig.lua --out $W/m1 --scale 0 | grep -q 'No setting changes' || fail "scale 0"
# vanilla
node $D gen --persona jp-1942-infantry --base $V --out $W/m2 >/dev/null || fail "gen vanilla"
grep -q 'FlagPriority = { Captured = 0.6, Enemy = 3, Neutral = 3.2 }' $W/m2/$R || fail "FlagPriority gold"
grep -q 'OrderRotationPeriod = 165600 ' $W/m2/$R || fail "OrderRotationPeriod gold"
node $D check $W/m2 | grep -q 'No errors' || fail "check vanilla ok"
node $D gen --persona universal --out $W/m2 >/dev/null; cmp $W/m2/$R $V || fail "vanilla restore"
node $D gen --persona su-1941-rifle --profile robz --base $V --plan 2>&1 | grep -q 'no BotConfig table' || fail "robz on vanilla refused"
# check problems
node $D check $F/botconfig.lua | grep -q 'No errors' || fail "check robz ok"
node $D check $F/botconfig-bad.lua > $W/bad.txt; [ $? = 1 ] || fail "check bad exit 1"
grep -q 'DOC_RANGE: HoldMaxShare' $W/bad.txt && grep -q 'DOC_KEY_MISSING: DirAttackRatio' $W/bad.txt || fail "check bad codes"
node $D check $F/botconfig.lua --profile vanilla | grep -q 'DOC_PROFILE_MISMATCH' || fail "check mismatch"
printf 'x = function() end\r\n' > $W/fn.lua; node $D check $W/fn.lua | grep -q DOC_PARSE || fail "check parse"
# game install refused, game/mods/<mod> allowed
node $D gen --persona su-1941-rifle --base $F/botconfig.lua --out $W/game/resource --game $W/game 2>&1 | grep -q 'inside the game folder' || fail "game refused"
# by content, with no --game or another one: a GoH folder, another AS2 install's resource/ (writeguard)
mkdir -p $W/goh/binaries/x64 $W/goh/mods/g1 $W/gameB/resource $W/plain; : > $W/goh/binaries/x64/call_to_arms.exe; : > $W/gameB/as64.exe
node $D gen --persona su-1941-rifle --base $F/botconfig.lua --out $W/goh/mods/g1 2>&1 | grep -q 'Gates of Hell' || fail "GoH refused with no --game"
node $D gen --persona su-1941-rifle --base $F/botconfig.lua --out $W/gameB/resource --game $W/plain 2>&1 | grep -q 'refused' || fail "other game resource refused"
[ -z "$(find $W/goh/mods $W/gameB/resource -type f)" ] || fail "nothing written into GoH or the other game"
node $D gen --persona su-1941-rifle --base $F/botconfig.lua --out $W/game/mods/gm --game $W/game >/dev/null || fail "game/mods allowed"
# plain errors
node $D gen --persona nobody --base $F/botconfig.lua --plan 2>&1 | grep -q 'Unknown persona' || fail "bad persona"
node $D gen --persona su-1941-rifle --base $F/botconfig.lua --plan --scale 5 2>&1 | grep -q 'Scale must be' || fail "bad scale"
node $D list nothing 2>/dev/null; [ $? = 2 ] || fail "exit 2"
node $D --help | grep -q 'gen --persona' || fail "--help"
node $D gen -h >/dev/null || fail "-h exit 0"
rm -rf $W
# game parity: GoH profile conquest (ConquestConfig form) and --exe as64|mowas_2 on a made-up shared AS2 install
node games.js >/dev/null || { node games.js; fail "games (test/games.js)"; }
echo "PASS"
