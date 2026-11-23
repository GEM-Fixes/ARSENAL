#!/bin/sh
# prove: seeded logs for scoring, seeded map pak for --plan. no game launched
# Author: Imperator_Aug (ARSENAL, ia-a042f7cc)
cd "$(dirname "$0")/../../.." || exit 1
t=$(mktemp -d); ok=1
# --dir: fixture + scenario go to a temp dir, the repo's tools/testrun/scenarios stays untouched
D="--dir $t/sc"; rdir=tools/testrun/scenarios/mods/prove9; rjson=tools/testrun/scenarios/prove9-run.json
had=0; [ -e "$rdir" ] || [ -e "$rjson" ] && had=1
P="node tools/prove/prove.js --game $t/game --unit t34_0 --army rus --inst 9 $D"
all='route target_placed control_placed seen far_from_goal ordered moved fire_ordered fire_position foe_not_moveable'
for m in $all; do echo "PROVE $m"; done > "$t/pass.log"
$P --score "$t/pass.log" > "$t/o" || { echo "all markers should pass: $(head -3 "$t/o")"; ok=0; }
grep -v foe_not_moveable "$t/pass.log" > "$t/nokill.log"
$P --score "$t/nokill.log" > "$t/o" && { echo "no kill passed"; ok=0; }
# moved before far_from_goal: the goal was already in range, nothing moved
{ echo "PROVE moved"; grep -v 'PROVE moved' "$t/pass.log"; } > "$t/order.log"
$P --score "$t/order.log" > "$t/o" && { echo "out of order passed"; ok=0; }
{ cat "$t/pass.log"; echo '***** Exception *****'; } > "$t/ex.log"
$P --score "$t/ex.log" > "$t/o" && { echo "exception passed"; ok=0; }
{ cat "$t/pass.log"; echo 'PROVE control_dead'; } > "$t/ctl.log"
$P --score "$t/ctl.log" > "$t/o" && { echo "dead control passed"; ok=0; }
# control run: fake card, route only is the pass; a seen marker means the tool lies
echo 'PROVE route' > "$t/c.log"
$P --control fake --score "$t/c.log" > "$t/o" || { echo "control route only should pass"; ok=0; }
$P --control fake --score "$t/pass.log" > "$t/o" && { echo "control with seen passed"; ok=0; }
# plan: mission built from a stock mission in the map pak
mkdir -p "$t/m/resource/map/multi/x" "$t/game/resource"
printf '{Mod\n}\n' > "$t/m/mod.info"
printf '{mission\n{Entity "map_point" 0x1\n{Position 100 100}\n{name "a1"}\n}\n{Entity "map_point" 0x2\n{Position 900 900}\n{name "b1"}\n}\n{Helpers\n{triggers\n}\n}\n}\n' > "$t/m/resource/map/multi/x/combat.mi"
node tools/packer/packer.js "$t/m" --out "$t/game/resource" -q > "$t/pk" 2>&1 || { echo "pack: $(tail -2 "$t/pk")"; ok=0; }
$P --map multi/x:combat --plan > "$t/o" 2>&1 || { echo "plan failed: $(tail -3 "$t/o")"; ok=0; }
fx=$t/sc/mods/prove9/resource
mi=$fx/map/multi/x/combat.mi
for w in 'PROVE route' 'PROVE foe_not_moveable' '{"2.near"' '"901"'; do grep -qF "$w" "$mi" || { echo "mission lacks $w"; ok=0; }; done
grep -q 'armySelectionMode team' "$fx/set/multiplayer/games/combat.set" || { echo "game set not team mode"; ok=0; }
grep -q 'mp_host {map} 4' "$t/sc/prove9-run.json" || { echo "scenario not 4 slots"; ok=0; }
# batch: one row per card, a crash names the open slot, slots after it stay unreached
B="node tools/prove/prove.js --game $t/game --army rus --inst 9 --units aa,bb:human,cc --depth spawn $D"
for k in 0 1 2; do echo "PROVE s$k open"; echo "PROVE bot bought s$k x"; echo "PROVE s$k seen"; done > "$t/b.log"; echo 'PROVE route' >> "$t/b.log"; echo 'PROVE done' >> "$t/b.log"
$B --score "$t/b.log" > "$t/o" || { echo "batch all pass failed: $(cat "$t/o")"; ok=0; }
grep -v 'PROVE s1 seen' "$t/b.log" > "$t/b1.log"
$B --score "$t/b1.log" > "$t/o" && { echo "batch missing unit passed"; ok=0; }
grep -q '^FAIL bb' "$t/o" || { echo "batch did not name bb: $(cat "$t/o")"; ok=0; }
grep -q '^pass aa' "$t/o" || { echo "batch failed good unit aa"; ok=0; }
{ for k in 0 1; do echo "PROVE s$k open"; echo "PROVE bot bought s$k x"; done; echo 'PROVE s0 seen'; echo '***** Exception *****'; } > "$t/b2.log"
$B --score "$t/b2.log" > "$t/o" && { echo "batch crash passed"; ok=0; }
grep -q '"suspect":"bb"' "$t/o" || { echo "crash suspect not bb: $(cat "$t/o")"; ok=0; }
grep -q '^FAIL cc.*not reached' "$t/o" || { echo "cc should be not reached"; ok=0; }
$B --map multi/x:combat --plan > "$t/o" 2>&1 || { echo "batch plan failed: $(tail -3 "$t/o")"; ok=0; }
for w in 'PROVE s2 open' 'pv_clk3' 'PROVE done'; do grep -qF "$w" "$mi" || { echo "batch mission lacks $w"; ok=0; }; done
grep -q 'presets_test.inc' "$fx/set/multiplayer/games/combat.set" || { echo "batch set not test preset"; ok=0; }
grep -q '"aa", "bb", "cc"' "$fx/script/multiplayer/bot.main.lua" || { echo "batch bot lacks cards"; ok=0; }
# fire depth: tanks get a crewed truck read by not moveable, men get men read by dead
node tools/prove/prove.js --game "$t/game" --army rus --inst 9 --units aa,bb:human --depth fire $D --map multi/x:combat --plan > "$t/o" 2>&1 || { echo "fire plan failed: $(tail -3 "$t/o")"; ok=0; }
grep -q '"gmc", "riflemans2(usa)"' "$fx/script/multiplayer/bot.main.lua" || { echo "foes not per kind"; ok=0; }
grep -qF 'state "not moveable"' "$mi" || { echo "no vehicle kill state"; ok=0; }
grep -qF '{state dead}' "$mi" || { echo "no human kill state"; ok=0; }
# the keeper holds a unit so the team never empties; its selector needs type human or actor_state crashes (MIS-40, MIS-45)
grep -qF 'pv_keep' "$mi" || { echo "no keeper trigger"; ok=0; }
grep -qF '{type human}} {fire_mode hold}' "$mi" || { echo "keeper selector lacks type human"; ok=0; }
grep -qF 'keeper' "$fx/script/multiplayer/bot.main.lua" || { echo "bot lacks keeper"; ok=0; }
# fire orders: the unit gets an actor_fire once at the goal with its foe on the map
grep -qF 'pv_s0_fire' "$mi" || { echo "no fire order"; ok=0; }
# kill credit: a bought unit's feed line in the slot's own stretch of log counts, a placed entity's or another slot's does not
F="node tools/prove/prove.js --game $t/game --army rus --inst 9 --units aa --depth fire $D"
base='PROVE s0 open\nPROVE bot bought s0 x\nPROVE s0 seen\nPROVE s0 far\nPROVE s0 moved\nPROVE s0 foe\nPROVE route\n'
printf "$base"'AI Player: Normal {T-34/76} AI Player: Normal GMC CCKWPROVE s0 kill\nPROVE done\n' > "$t/k.log"
$F --score "$t/k.log" > "$t/o" || { echo "credited kill failed: $(cat "$t/o")"; ok=0; }
grep -qF 'by T-34/76' "$t/o" || { echo "shooter not named: $(cat "$t/o")"; ok=0; }
printf "$base"'enemy {GAZ-67B} AI Player: Normal riflemanPROVE s0 kill\nPROVE done\n' > "$t/k2.log"
$F --score "$t/k2.log" > "$t/o" && { echo "placed entity kill passed"; ok=0; }
grep -qF 'kill not by a bought unit' "$t/o" || { echo "wrong why: $(cat "$t/o")"; ok=0; }
printf 'AI Player: Normal {T-34/76} AI Player: Normal x\n'"$base"'PROVE s0 kill\nPROVE done\n' > "$t/k3.log"
$F --score "$t/k3.log" > "$t/o" && { echo "feed line before the slot passed"; ok=0; }
printf "$base"'AI Player: Normal {T-34/76} AI Player: Normal x
enemy {GAZ-67B} AI Player: Normal yPROVE s0 kill
PROVE done
' > "$t/k4.log"
$F --score "$t/k4.log" > "$t/o" && { echo "earlier feed line took the credit"; ok=0; }
# damage-in: no walking, a default shooter fires at the unit, the unit's own state is the kill
$F --damage-in --map multi/x:combat --plan > "$t/o" 2>&1 || { echo "damage-in plan failed: $(tail -3 "$t/o")"; ok=0; }
grep -qF '{enemies {player "4"} {type vehicle}' "$mi" || { echo "shooter not aimed at the unit"; ok=0; }
grep -qF 'pv_s0_moved' "$mi" && { echo "damage-in still walks"; ok=0; }
grep -qF '"t34_0"' "$fx/script/multiplayer/bot.main.lua" || { echo "no default shooter"; ok=0; }
printf 'PROVE s0 open\nPROVE bot bought s0 x\nPROVE s0 seen\nPROVE s0 foe\nPROVE route\nAI Player: Normal {T-34/76} AI Player: Normal xPROVE s0 kill\nPROVE done\n' > "$t/d.log"
$F --damage-in --score "$t/d.log" > "$t/o" || { echo "damage-in pass failed: $(cat "$t/o")"; ok=0; }
# refused order: the boarded-crew warning in the slot gives its own why; a clean run with the same markers passes
M="node tools/prove/prove.js --game $t/game --army rus --inst 9 --units aa:human --depth move $D"
mv='PROVE s0 open\nPROVE bot bought s0 x\nPROVE s0 seen\nPROVE s0 far\nPROVE s0 ordered\nPROVE s0 moved\nPROVE route\nPROVE done\n'
printf "$mv" > "$t/r0.log"
$M --score "$t/r0.log" > "$t/o" || { echo "clean move failed: $(cat "$t/o")"; ok=0; }
printf 'PROVE s0 open\nPROVE bot bought s0 x\nPROVE s0 seen\nPROVE s0 far\nActorToWaypoint for linked actor human[21/22:mp/rus/vehicle_supporter]\nPROVE s0 ordered\nPROVE s0 moved\nPROVE route\nPROVE done\n' > "$t/r1.log"
$M --score "$t/r1.log" > "$t/o" && { echo "refused order passed"; ok=0; }
grep -qF 'order refused: boarded crew' "$t/o" || { echo "refusal has no own why: $(cat "$t/o")"; ok=0; }
printf 'PROVE s0 open\nPROVE bot bought s0 x\nPROVE s0 seen\nPROVE s0 far\nPROVE s0 ordered\nPROVE route\nPROVE done\n' > "$t/r2.log"
$M --score "$t/r2.log" > "$t/o" && { echo "unmoved passed"; ok=0; }
grep -qF 'did not reach goal' "$t/o" || { echo "unmoved lost its why: $(cat "$t/o")"; ok=0; }
# gun crew: watched as humans, ordered through {type vehicle}; a plain human is ordered as a human
B2="node tools/prove/prove.js --game $t/game --army rus --inst 9 --units aa:gun,bb:human --depth move $D --map multi/x:combat --plan"
$B2 > "$t/o" 2>&1 || { echo "gun plan failed: $(tail -3 "$t/o")"; ok=0; }
grep -qF '"pv_s0_seen"' "$mi" || { echo "gun mission lacks slot 0"; ok=0; }
grep -qF '{"actor_to_waypoint" {selector {player "4"} {type vehicle}} {waypoint "900"}}' "$mi" || { echo "gun not ordered as vehicle"; ok=0; }
grep -qF '{"actor_to_waypoint" {selector {player "4"} {type human}} {waypoint "900"}}' "$mi" || { echo "human order lost"; ok=0; }
grep -qF '{"3.entities" {selector {player "4"} {type human}}' "$mi" || { echo "gun crew not watched as humans"; ok=0; }
# control rep must be sold by the army under test: refuse at plan stage and name a valid one; a sold control goes through
mkdir -p "$t/game/resource/set/multiplayer/units"
printf '{"willysmb" ("vs" s(usa))}\r\n{"m4a3_75" ("vs" s(usa))}\r\n{"hero1_usa" ("vs" s(usa))}\r\n' > "$t/game/resource/set/multiplayer/units/vehicles_usa.set"
C="node tools/prove/prove.js --game $t/game --army usa --inst 9 --units willysmb --depth spawn --games 2 $D --map multi/x:combat --plan"
$C --control-rep t34_0 > "$t/o" 2>&1 && { echo "rus control passed on usa"; ok=0; }
grep -qF 'PROVE_CONTROL_NOT_SOLD' "$t/o" || { echo "no refusal: $(tail -3 "$t/o")"; ok=0; }
grep -qF 'use --control-rep m4a3_75' "$t/o" || { echo "valid usa control not named: $(tail -3 "$t/o")"; ok=0; }
$C --control-rep m4a3_75 > "$t/o" 2>&1 || { echo "sold usa control refused: $(tail -3 "$t/o")"; ok=0; }
# KILLPROOF batch parent: fake child (no game, PROVE_CHILD), no stagger. a failed control voids the game, a stale result.json never stands in
cat > "$t/child.js" <<'JS'
const fs = require('fs'), path = require('path'), a = process.argv, at = k => a[a.indexOf(k) + 1];
const out = at('--out'), cards = at('--units').split(',').map(s => s.split(':')), cnt = path.join(process.env.FAKE_DIR, 'n');
const n = fs.existsSync(cnt) ? +fs.readFileSync(cnt, 'utf8') : 0; fs.writeFileSync(cnt, String(n + 1));
const mode = process.env.FAKE_MODE; if (mode === 'none') process.exit(0);
const ctlOk = mode === 'ok' || (mode === 'once' && n > 0);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ done: true, rows: cards.map(([card, kind], i) => ({ card, kind, ran: true, pass: i ? true : ctlOk, why: i || ctlOk ? '' : 'not seen' })) }));
JS
F="node tools/prove/prove.js --game $t/game --army usa --inst 9 --units willysmb --depth spawn --games 1 --map multi/x:combat --control-rep m4a3_75 --out $t/bo"
pf() { rm -rf "$t/bo" "$t/fk"; mkdir -p "$t/fk"; PROVE_CHILD="$t/child.js" PROVE_STAGGER_MS=0 FAKE_DIR="$t/fk" FAKE_MODE=$1 $F > "$t/o" 2>&1; }
pf fail && { echo "failed control gave exit 0"; ok=0; }
grep -q '^VERDICT VOID' "$t/o" || { echo "failed control not VOID: $(tail -2 "$t/o")"; ok=0; }
grep -q '^void willysmb' "$t/o" || { echo "unit not void: $(head -2 "$t/o")"; ok=0; }
grep -q '"pass": null' "$t/bo/report.json" || { echo "report row not pass null"; ok=0; }
[ "$(cat "$t/fk/n")" = 4 ] || { echo "void game not rerun 4 rounds: $(cat "$t/fk/n")"; ok=0; }
pf once || { echo "control failing once then passing: $(tail -3 "$t/o")"; ok=0; }
grep -q '^VERDICT PASS' "$t/o" || { echo "rerun after void not PASS: $(tail -2 "$t/o")"; ok=0; }
pf ok || { echo "fake all pass failed: $(tail -3 "$t/o")"; ok=0; }
# stale: an old passing result.json in the child dir, the child dies writing nothing -> must not PASS
mkdir -p "$t/bo/r0g1"; printf '{"done":true,"rows":[{"card":"m4a3_75","kind":"vehicle","ran":true,"pass":true},{"card":"willysmb","kind":"vehicle","ran":true,"pass":true}]}' > "$t/bo/r0g1/result.json"
mkdir -p "$t/fk2"; PROVE_CHILD="$t/child.js" PROVE_STAGGER_MS=0 FAKE_DIR="$t/fk2" FAKE_MODE=none $F > "$t/o" 2>&1 && { echo "stale result.json passed"; ok=0; }
grep -q '^FAIL willysmb .*never ran' "$t/o" || { echo "stale: unit not never ran: $(head -2 "$t/o")"; ok=0; }
# --dir seeded: every plan above used it, so the repo fixture dir must not have been written
[ $had = 0 ] && { [ -e "$rdir" ] || [ -e "$rjson" ]; } && { echo "--dir ignored: repo fixture written"; ok=0; }
[ -f "$t/sc/mods/prove9/mod.info" ] || { echo "--dir: no fixture mod.info"; ok=0; }
# bad --inst / --games refused before any write
$P --inst .. --plan > "$t/o" 2>&1; [ $? = 2 ] && grep -q PROVE_BAD_INST "$t/o" || { echo "bad inst not refused"; ok=0; }
$B --games 9 > "$t/o" 2>&1; [ $? = 2 ] && grep -q PROVE_BAD_GAMES "$t/o" || { echo "games 9 not refused"; ok=0; }
# pure helpers: void rows pass null, a FAIL beats VOID
node -e "
const p = require('./tools/prove/prove.js'), B = [{ card: 'a', kind: 'vehicle' }, { card: 'b', kind: 'vehicle' }], ctl = { card: 'c' };
let st = p.newState(B); st.queue = []; p.takeResult(st, [B[0]], { done: true, rows: [{ card: 'c', pass: false, why: 'x' }, { card: 'a', ran: true, pass: true }] }, ctl, B);
p.takeResult(st, [B[1]], { done: true, rows: [{ card: 'c', pass: true }, { card: 'b', ran: true, pass: false, why: 'no' }] }, ctl, B);
const r = p.finalOf(st, B, ctl);
if (r.rows[0].pass !== null || !/^void: control failed/.test(r.rows[0].why) || r.verdict !== 'FAIL' || st.queue.length !== 1) { console.log(JSON.stringify(r)); process.exit(1); }
st = p.newState(B); p.takeResult(st, B, { done: true, rows: [{ card: 'c', pass: false }] }, ctl, B);
if (p.finalOf(st, B, ctl).verdict !== 'VOID') process.exit(1);
" || { echo "prove helpers: void/fail verdict wrong"; ok=0; }
# F11: with --names the kill must go to the slot card's names; a keeper/sentinel name never takes it; no names keeps the old any-bot rule
F="node tools/prove/prove.js --game $t/game --army rus --inst 9 --units aa --depth fire $D"
$F --names 'aa=T-34/76' --score "$t/k.log" > "$t/o" || { echo "F11 named kill failed: $(cat "$t/o")"; ok=0; }
$F --names 'aa=KV-1|KV-1 crew' --score "$t/k.log" > "$t/o" && { echo "F11 kill by another name passed"; ok=0; }
grep -qF 'kill credited to T-34/76, not this card' "$t/o" || { echo "F11 wrong why: $(cat "$t/o")"; ok=0; }
printf "$base"'AI Player: Normal {Rifleman} AI Player: Normal GMC CCKWPROVE s0 kill\nPROVE done\n' > "$t/k5.log"
$F --score "$t/k5.log" > "$t/o" || { echo "F11 no-names rule changed: $(cat "$t/o")"; ok=0; }
$F --not-shooters 'Rifleman' --score "$t/k5.log" > "$t/o" && { echo "F11 keeper kill passed"; ok=0; }
grep -qF '(keeper or sentinel)' "$t/o" || { echo "F11 keeper why: $(cat "$t/o")"; ok=0; }
# F12: vehicle gate reads "immobilised"; the wreck marker is written and scored beside it, not gated
$P --map multi/x:combat --plan > "$t/o" 2>&1 || { echo "F12 plan failed: $(tail -3 "$t/o")"; ok=0; }
grep -qF 'PROVE foe_wrecked' "$mi" || { echo "F12 no wreck marker"; ok=0; }
grep -qF '{destroyed_components {masks "body"}}' "$mi" || { echo "F12 no body term"; ok=0; }
$P --score "$t/pass.log" > "$t/o" || { echo "F12 pass changed"; ok=0; }
grep -qF '"immobilised": true' "$t/o" && grep -qF '"killed": false' "$t/o" || { echo "F12 immobilised/killed not split: $(head -c 300 "$t/o")"; ok=0; }
grep -qF 'enemy immobilised' "$t/o" || { echo "F12 label not renamed"; ok=0; }
{ cat "$t/pass.log"; echo 'PROVE foe_wrecked'; } > "$t/wk.log"
$P --score "$t/wk.log" > "$t/o"; grep -qF '"killed": true' "$t/o" || { echo "F12 wreck not read as killed"; ok=0; }
# game parity: the game comes from --exe. as64 (none) as before; mowas_2.exe: plan + score only, no as64+, 3.262 mod.info; GoH: score only
$P --map multi/x:combat --plan > "$t/o" 2>&1 || { echo "parity as64 plan failed"; ok=0; }
grep -qF 'MinGameVersion "3.301"' "$fx/../mod.info" && ! grep -qF 'MaxGameVersion' "$fx/../mod.info" || { echo "parity as64 mod.info changed"; ok=0; }
grep -qF '"as64+"' "$t/sc/prove9-run.json" || { echo "parity as64 lost its as64+ default"; ok=0; }
for x in mowas_2.exe "$t/game/mowas_2.exe" mowas2; do
  $P --exe "$x" --map multi/x:combat --plan > "$t/o" 2>&1 || { echo "parity mowas2 plan ($x) failed: $(tail -3 "$t/o")"; ok=0; }
  grep -qF '"mods":[]' "$t/o" || { echo "parity mowas2 ($x) mods not empty: $(head -c 300 "$t/o")"; ok=0; }
  grep -qF 'MinGameVersion "3.262.0"' "$fx/../mod.info" && grep -qF 'MaxGameVersion "3.262.1"' "$fx/../mod.info" || { echo "parity mowas2 mod.info not 3.262"; ok=0; }
  grep -qF '"as64+"' "$t/sc/prove9-run.json" && { echo "parity mowas2 scenario names as64+"; ok=0; }
  grep -qF 'PROVE route' "$mi" || { echo "parity mowas2 mission lacks markers"; ok=0; }
done
# wave 3: the MoW:AS2 plan prints the uidrive host lines (no game started); as64 prints none
$P --exe mowas_2.exe --map multi/x:combat --plan > "$t/o" 2>&1 || { echo "parity mowas2 host plan failed"; ok=0; }
grep -qF 'PROVE_HOST [T]: node tools/uidrive/uidrive.js play mowas2 boot,lobby_gazala,army_b_rus,bot_start --game' "$t/o" || { echo "parity mowas2 no host line: $(cat "$t/o")"; ok=0; }
grep -qF 'uidrive.js where mowas2' "$t/o" && grep -qF 'mount e2e_test in the profile' "$t/o" || { echo "parity mowas2 host log/mods lines: $(cat "$t/o")"; ok=0; }
grep -q '^PROVE_HOST stage: copy ".*/sc/mods/prove9" to ".*/game/mods/e2e_test" ' "$t/o" || { echo "parity mowas2 host stage line: $(cat "$t/o")"; ok=0; }
grep -qF 'mount prove9' "$t/o" && { echo "parity mowas2 mounts the unstaged fixture name"; ok=0; }
grep -qF -- '--map multi/1v1_gazala:battle_zones --mods <the RobZ mod' "$t/o" || { echo "parity mowas2 map hint lacks the mod"; ok=0; }
$P --exe mowas_2.exe --stage-as e2e_test5 --map multi/x:combat --plan > "$t/o2" 2>&1; grep -qF 'mount e2e_test5 in the profile' "$t/o2" && grep -qF 'mods/e2e_test5"' "$t/o2" || { echo "parity mowas2 --stage-as not in host lines: $(cat "$t/o2")"; ok=0; }
$P --exe mowas_2.exe --stage-as zz --map multi/x:combat --plan > "$t/o2" 2>&1; grep -qF 'stage-as zz is not an approved folder' "$t/o2" && grep -qF 'mount e2e_test in the profile' "$t/o2" || { echo "parity mowas2 unapproved stage not warned: $(cat "$t/o2")"; ok=0; }
# a mod map with no --mods: one plain PROVE_NO_MAP line, exit 2, no stack
$P --exe mowas_2.exe --map multi/1v1_gazala:battle_zones --plan > "$t/o2" 2>&1; [ $? -eq 2 ] || { echo "parity mowas2 missing map not exit 2"; ok=0; }
grep -q '^PROVE_NO_MAP: not in resource/map.pak nor on the mowas_2 mount of --mods (none): map/multi/1v1_gazala/battle_zones.mi$' "$t/o2" && ! grep -q '    at ' "$t/o2" || { echo "parity mowas2 missing map line: $(cat "$t/o2")"; ok=0; }
grep -qF 'hosts multi/1v1_gazala:battle_zones; this fixture overrides multi/x:combat' "$t/o" || { echo "parity mowas2 map warn missing"; ok=0; }
$P --map multi/x:combat --plan > "$t/o" 2>&1; grep -qF PROVE_HOST "$t/o" && { echo "parity as64 plan prints host lines"; ok=0; }
# a mod map (not in map.pak) is read on the mowas_2 mount of --mods: the gazala route's map, no warn
mkdir -p "$t/game/mods/zmap/resource/map/multi/1v1_gazala"; printf '{Mod\n}\n' > "$t/game/mods/zmap/mod.info"
cp "$t/m/resource/map/multi/x/combat.mi" "$t/game/mods/zmap/resource/map/multi/1v1_gazala/battle_zones.mi"
node tools/prove/prove.js --game $t/game --unit t34_0 --army usa --inst 9 $D --exe mowas_2.exe --mods zmap --map multi/1v1_gazala:battle_zones --plan > "$t/o" 2>&1 || { echo "parity mowas2 mod map plan failed: $(tail -3 "$t/o")"; ok=0; }
grep -qF 'PROVE route' "$fx/map/multi/1v1_gazala/battle_zones.mi" || { echo "parity mowas2 mod map mission not built"; ok=0; }
grep -qF 'this fixture overrides' "$t/o" && { echo "parity mowas2 gazala map warned"; ok=0; }
grep -qF 'boot,lobby_gazala,bot_start' "$t/o" && grep -qF 'no lobby route sets army usa' "$t/o" || { echo "parity mowas2 usa routes: $(cat "$t/o")"; ok=0; }
node tools/prove/prove.js --game $t/game --unit t34_0 --army usa --inst 9 $D --map multi/1v1_gazala:battle_zones --plan > "$t/o" 2>&1 && { echo "parity as64 read a mod map outside map.pak"; ok=0; }
rm -rf "$t/game/mods/zmap"
$P --exe mowas_2.exe --map multi/x:combat > "$t/o" 2>&1; [ $? -eq 2 ] || { echo "parity mowas2 live run not refused"; ok=0; }
grep -q '^prove: not available for MoW:AS2: the match is hosted over the control pipe.*(TST-19)$' "$t/o" || { echo "parity mowas2 refusal line: $(cat "$t/o")"; ok=0; }
B3="node tools/prove/prove.js --game $t/game --army rus --inst 9 --units aa,bb --depth spawn --games 2 $D --exe mowas_2.exe"
$B3 > "$t/o" 2>&1; [ $? -eq 2 ] && grep -qF 'not available for MoW:AS2' "$t/o" || { echo "parity mowas2 batch parent not refused: $(cat "$t/o")"; ok=0; }
$P --exe mowas_2.exe --score "$t/pass.log" > "$t/o" || { echo "parity mowas2 score failed"; ok=0; }
$P --exe binaries/x64/call_to_arms.exe --map multi/x:combat --plan > "$t/o" 2>&1; [ $? -eq 2 ] || { echo "parity goh plan not refused"; ok=0; }
grep -q '^prove: not available for GoH: .*(modweb/testing/goh-drive.md, GHMIS-66)$' "$t/o" || { echo "parity goh refusal line: $(cat "$t/o")"; ok=0; }
$P --exe goh --score "$t/pass.log" > "$t/o" || { echo "parity goh score failed: $(cat "$t/o")"; ok=0; }
$P --exe goh --score "$t/nokill.log" > "$t/o" && { echo "parity goh score no kill passed"; ok=0; }
# GoH with no --game: --score runs (the install comes from games.install('goh') or is not needed), other runs get the GoH refusal, not the usage line
NG="node tools/prove/prove.js --unit t34_0 --army rus --inst 9 $D --exe goh"
$NG --score "$t/pass.log" > "$t/o" 2>&1 || { echo "parity goh score without --game failed: $(cat "$t/o")"; ok=0; }
$NG --score "$t/nokill.log" > "$t/o" 2>&1 && { echo "parity goh score without --game no kill passed"; ok=0; }
$NG --map multi/x:combat --plan > "$t/o" 2>&1; [ $? -eq 2 ] && grep -q '^prove: not available for GoH: .*(modweb/testing/goh-drive.md, GHMIS-66)$' "$t/o" || { echo "parity goh no --game plan not refused: $(cat "$t/o")"; ok=0; }
node tools/prove/prove.js --unit t34_0 --army rus --score "$t/pass.log" > "$t/o" 2>&1; [ $? -eq 2 ] && grep -qF 'usage:' "$t/o" || { echo "parity as64 without --game lost its usage line"; ok=0; }
$P --exe nosuch --score "$t/pass.log" > "$t/o" 2>&1; [ $? -eq 2 ] && grep -qF PROVE_BAD_EXE "$t/o" || { echo "parity bad exe word not refused"; ok=0; }
$P --exe my_build.exe --map multi/x:combat --plan > "$t/o" 2>&1 || { echo "parity renamed exe plan failed: $(tail -3 "$t/o")"; ok=0; }
grep -qF '"as64+"' "$t/sc/prove9-run.json" && grep -qF 'MinGameVersion "3.301"' "$fx/../mod.info" || { echo "parity renamed exe not as64"; ok=0; }
# GoH game.log stamps every line '[hh:mm:ss] ' (GHLOG-07): the score reads the markers through the stamp
sed 's/^/[00:00:01] /' "$t/pass.log" > "$t/gpass.log"; sed 's/^/[00:00:01] /' "$t/nokill.log" > "$t/gnokill.log"
$P --exe goh --score "$t/gpass.log" > "$t/o" || { echo "parity goh stamped score failed: $(cat "$t/o")"; ok=0; }
$P --exe goh --score "$t/gnokill.log" > "$t/o" && { echo "parity goh stamped no kill passed"; ok=0; }
{ echo "[00:00:01] PROVE moved"; grep -v 'PROVE moved' "$t/gpass.log"; } > "$t/gorder.log"
$P --exe goh --score "$t/gorder.log" > "$t/o" && { echo "parity goh stamped out of order passed"; ok=0; }
# the MoW:AS2 vfs reads (--control-rep and --add-cards) use the mowas_2 view: as64/core holds a vehicles_usa.set without m4a3_75, base has it
printf 'MZ' > "$t/game/as64.exe"; mkdir -p "$t/game/as64/core/resource/set/multiplayer/units"
printf '{"willysmb" ("vs" s(usa))}\r\n{"corecard" ("vs" s(usa))}\r\n' > "$t/game/as64/core/resource/set/multiplayer/units/vehicles_usa.set"
$C --control-rep m4a3_75 > "$t/o" 2>&1 && { echo "parity as64 control-rep did not read the as64/core view"; ok=0; }
grep -qF 'PROVE_CONTROL_NOT_SOLD' "$t/o" || { echo "parity as64 control-rep: $(tail -3 "$t/o")"; ok=0; }
$C --exe mowas_2.exe --control-rep m4a3_75 > "$t/o" 2>&1 || { echo "parity mowas2 control-rep read the as64/core view: $(tail -3 "$t/o")"; ok=0; }
vs="$fx/set/multiplayer/units/vehicles_usa.set"
node tools/prove/prove.js --game $t/game --army usa --inst 9 --units newcard --depth spawn $D --map multi/x:combat --plan --add-cards --exe mowas_2.exe > "$t/o" 2>&1 || { echo "parity mowas2 add-cards failed: $(tail -3 "$t/o")"; ok=0; }
grep -qF '{"m4a3_75"' "$vs" && ! grep -qF 'corecard' "$vs" && grep -qF 'newcard' "$vs" || { echo "parity mowas2 add-cards staged the wrong view: $(cat "$vs")"; ok=0; }
node tools/prove/prove.js --game $t/game --army usa --inst 9 --units newcard --depth spawn $D --map multi/x:combat --plan --add-cards > "$t/o" 2>&1 || { echo "parity as64 add-cards failed: $(tail -3 "$t/o")"; ok=0; }
grep -qF 'corecard' "$vs" || { echo "parity as64 add-cards lost the as64/core view: $(cat "$vs")"; ok=0; }
rm -rf "$t"
[ $ok = 1 ] && echo PASS || { echo FAIL; exit 1; }
