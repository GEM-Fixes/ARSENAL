#!/bin/sh
# check test: runs check.js on the fix fixture's loose mod (m1) and packed mod (m2); asserts read counts, severity order, verdict line
# + outside <game>/mods (overlay) gives the same findings as in place; --with <patch> merges source + patch
# Author: Imperator_Aug (ARSENAL, ia-d537fab2)
cd "$(dirname "$0")"
# the tests below check a real run each time: whole-check reuse (X1) off here; reuse-test.js (last) turns it on and tests it
export ARSENAL_CHECK_REUSE=0
node ../../fix/test/mkfixture.js "$PWD/fx" >/dev/null || { echo "FAIL: mkfixture"; exit 1; }
G=fx/game
node ../check.js $G/mods/m1 --game $G --exe mowas2 > out1.txt 2>&1
node ../check.js $G/mods/m2 --game $G --exe mowas2 --json out2.json > out2.txt 2>&1
cat out1.txt out2.txt | head -60
fail() { echo "FAIL: $1"; exit 1; }
grep -q "^READ mowas2: 8 mod files + 0 paks" out1.txt || fail "m1 read line"
grep -q "^READ mowas2: .* + 2 paks (2 read)" out2.txt || fail "m2 packed read line (paks must be read, not skipped)"
grep -q "^VERDICT mowas2: LOADS_STATIC" out2.txt || fail "verdict line"
grep -q "^COSMETIC .*" out2.txt && grep -q "REF_TEXTURE_MISSING x" out2.txt || fail "REF_TEXTURE_MISSING not listed under cosmetic"
# order: CRASH before SILENT before COSMETIC
node -e "
const t=require('fs').readFileSync('out1.txt','utf8');const i=s=>t.indexOf('\n'+s+' (');
if(!(i('CRASH')>0&&i('CRASH')<i('SILENT')&&i('SILENT')<i('COSMETIC')))process.exit(1)" || fail "severity order"
grep -q '"verdicts"' out2.json || fail "json"
tail -1 out2.txt | grep -q "^[0-9]* findings$" || fail "last line is not N findings"
# GUI-LOC: --json samples {file,line,msg,path} per code; packed m2: path is the virtual path of a pak entry that lib/locate reads back;
# PROGRESS lines stream; --locs 1 caps; the CLI e.g. shows file:line
node -e "
const R=require('./out2.json'),L=require('../../lib/locate'),fs=require('fs');let n=0,pk=0,ln=0;
for(const f of R.findings)for(const s of f.samples||[]){if(typeof s!=='object'||!('file' in s)||!('msg' in s))throw 'shape '+JSON.stringify(s);n++;if(s.line)ln++;
 if(s.path&&!fs.existsSync(s.path)){const b=L.read(s.path);if(!b||!b.length)throw 'pak entry unreadable '+s.path;pk++}}
if(!n)throw 'no samples';if(!pk)throw 'no sample inside a pak';if(!ln)throw 'no line numbers';if(R.locs!==50)throw 'locs';" || fail "samples / pak paths in json"
grep -q '^PROGRESS done ' out2.txt || fail "no PROGRESS lines"
grep -q '^PROGRESS start wouldload:sdllint:' out2.txt && grep -q '^PROGRESS done wouldload:refcheck:' out2.txt || fail "no PROGRESS lines of wouldload's passes"
grep -q '^PROGRESS done wouldload:sdllint:mowas2 [0-9]*s [0-9]* files parsed' out2.txt || fail "the pass does not say how many files it parsed"
# a pass that hangs: no limit by default, so --pass-limit ends it here; while it hangs the still-running line says so
WOULDLOAD_TEST_HANG=sdllint node ../check.js $G/mods/m1 --game $G --exe mowas2 --pass-limit 3 > out8.txt 2>&1
grep -q 'ERROR sdllint ended without a findings line (killed after 3s timeout)' out8.txt || fail "the PROGRESS line does not name the stopped pass"
# --no-load-check: wouldload does not run, the check says so and still ends with its findings
node ../check.js $G/mods/m1 --game $G --exe mowas2 --no-load-check --json out9.json > out9.txt 2>&1
grep -q '^wouldload: SKIPPED (--no-load-check)' out9.txt && grep -q 'LOAD_CHECK_SKIPPED' out9.txt || fail "--no-load-check does not say the load check was skipped"
grep -q 'wouldload' out9.txt && ! grep -q 'PROGRESS start wouldload' out9.txt || fail "--no-load-check still ran wouldload"
grep -q '^PROGRESS done ' out9.txt && tail -1 out9.txt | grep -q '^[0-9]* findings$' || fail "--no-load-check: no linters or no findings line"
grep -q '"loadSkipped": true' out9.json || fail "--no-load-check: json lacks loadSkipped"
grep -q 'did not finish' out9.txt && fail "--no-load-check: the report says the check did not finish"
grep -q 'The load check was skipped' out9.txt || fail "--no-load-check: the words do not say it was skipped"
# wave 2a: the full check takes sdllint + refcheck from wouldload's run (wouldload --keep-out, doctor --reuse-dir), the same findings as
# doctor's own run (--no-load-check: doctor runs them); a pass that did not finish: doctor runs that one itself (REUSE_MISS)
rm -rf ta; CHECK_TEST_ARGS="$PWD/ta" node ../check.js $G/mods/m5 --game $G --exe mowas2 --json outr1.json > outr1.txt 2>&1
grep -q '"--reuse-dir"' ta/doctor.args && grep -q '"--keep-out"' ta/wouldload.args || fail "full check: doctor not given --reuse-dir / wouldload not given --keep-out"
grep -q "^NOTE REUSED sdllint, refcheck: findings from the load check's run" outr1.txt || { cat outr1.txt; fail "full check: sdllint/refcheck not taken from the load check"; }
rm -rf ta; CHECK_TEST_ARGS="$PWD/ta" node ../check.js $G/mods/m5 --game $G --exe mowas2 --no-load-check --json outr2.json > outr2.txt 2>&1
grep -q 'reuse-dir' ta/doctor.args && fail "--no-load-check: doctor given --reuse-dir"
grep -q 'REUSE' outr2.txt && fail "--no-load-check: a REUSE note"
WOULDLOAD_TEST_HANG=sdllint node ../check.js $G/mods/m5 --game $G --exe mowas2 --pass-limit 3 --json outr3.json > outr3.txt 2>&1
grep -q "^NOTE REUSE_MISS sdllint: the load check's run did not finish" outr3.txt && grep -q '^NOTE REUSED refcheck:' outr3.txt || { cat outr3.txt; fail "stopped sdllint pass: doctor did not run sdllint itself"; }
WOULDLOAD_TEST_HANG=refcheck node ../check.js $G/mods/m5 --game $G --exe mowas2 --pass-limit 3 --json outr4.json > outr4.txt 2>&1
grep -q "^NOTE REUSE_MISS refcheck: the load check's run did not finish" outr4.txt && grep -q '^NOTE REUSED sdllint:' outr4.txt || { cat outr4.txt; fail "stopped refcheck pass: doctor did not run refcheck itself"; }
node -e "
const s=f=>JSON.stringify(require('./'+f).findings.filter(x=>/^(sdllint|refcheck)$/.test(x.tool)));const a=s('outr1.json');
if(!a.includes('sdllint')||!a.includes('refcheck'))throw 'fixture m5 lost its sdllint/refcheck findings';
if(a!==s('outr3.json'))throw 'sdllint: reused differs from doctor own run';if(a!==s('outr4.json'))throw 'refcheck: reused differs from doctor own run'" || fail "sdllint/refcheck findings: reused vs doctor's own run (same reach gate)"
rm -rf ta outr1.json outr2.json outr3.json outr4.json outr1.txt outr2.txt outr3.txt outr4.txt
node ../check.js $G/mods/m2 --game $G --exe mowas2 --locs 1 --json out2b.json > /dev/null 2>&1
node -e "const R=require('./out2b.json');if(!R.findings.some(f=>f.n>1&&f.tool!=='preflight'))process.exit(0);if(R.findings.some(f=>f.tool!=='preflight'&&(f.samples||[]).length>1))process.exit(1)" || fail "--locs 1 cap"
grep -qE '^  [A-Z_]+ x[0-9]+  \[[a-z]+\] e\.g\. [^ ]+:[0-9]+' out1.txt || fail "CLI e.g. has no file:line"
rm -f out2b.json

# outside <game>/mods: a copy of m1 elsewhere gives the same findings as in place and says which way it was read
rm -rf outside patch; mkdir -p outside patch/localization
cp -r $G/mods/m1 outside/m1
node ../check.js outside/m1 --game $G --exe mowas2 > out3.txt 2>&1
grep -q '^MODE outside-mods: overlay' out3.txt || fail "outside: no MODE line"
grep -q '^MODE in-place' out1.txt || fail "in place: no MODE line"
grep -E '^  [A-Z_]+ x[0-9]+' out1.txt | sort > f1.txt
grep -E '^  [A-Z_]+ x[0-9]+' out3.txt | sort > f3.txt
cmp -s f1.txt f3.txt || { diff f1.txt f3.txt; fail "outside copy differs from in place"; }
tail -1 out3.txt | grep -q '^6 findings$' || fail "outside: finding count"
# GUI-LOC: an overlay run's sample paths point at the real folder, not the deleted temp overlay
node ../check.js outside/m1 --game $G --exe mowas2 --json out3.json > /dev/null 2>&1
node -e "const R=require('./out3.json'),fs=require('fs');const ps=R.findings.flatMap(f=>(f.samples||[]).map(s=>s.path)).filter(Boolean);
if(!ps.length)throw 'no paths';const bad=ps.filter(p=>/check-ov-/.test(p)||!fs.existsSync(p));if(bad.length)throw 'temp/missing paths '+bad.join(' ')" || fail "overlay sample paths"
rm -f out3.json
# --with <patch>: source + patch merged, patch wins at the same path, neither folder written
node -e "require('fs').writeFileSync('patch/localization/desc.lng','{tags\r\n\t{\"entity\" {\"ok\" \"A\"}}\r\n\t{\"entity\" {\"ok\" \"B\"}}\r\n}\r\n')"
node ../check.js outside/m1 --with patch --game $G --exe mowas2 > out4.txt 2>&1
grep -q 'source + patch merged' out4.txt || fail "with: no merged line"
grep -q 'DUP_KEY' out4.txt || fail "with: patch file not seen"
grep -q 'DUP_KEY' out3.txt && fail "with: patch leaked into the plain run"
cmp -s outside/m1/localization/desc.lng $G/mods/m1/localization/desc.lng || fail "with: source was written"
[ -z "$(ls $G/mods | grep -v '^m[0-9]$')" ] || fail "game mods dir changed"
# fix output re-checked straight away: fix apply -> check --with shows the repoint (REF_TEXTURE_MISSING 2 -> 1), and no self-Require from the patch mod.info
rm -rf pf; node ../../fix/fix.js $G/mods/m1 apply --out pf --game $G >/dev/null 2>&1
node ../check.js $G/mods/m1 --with pf --game $G --exe mowas2 > out5.txt 2>&1
grep -q 'REF_TEXTURE_MISSING x1 ' out5.txt || { cat out5.txt; fail "fix --with: repoint not seen"; }
grep -q 'DEP_CYCLE' out5.txt && fail "fix --with: patch mod.info leaked"
# a patch's mod.info Delete reaches the source: the deleted .ply no longer reports
rm -rf pd; mkdir pd; printf '{Mod\r\n\t{Name "pd"}\r\n\t{Delete "resource/entity/m1/a.ply"}\r\n}\r\n' > pd/mod.info
node ../check.js $G/mods/m1 --with pd --game $G --exe mowas2 > out6.txt 2>&1
grep -q 'PLY_BAD_MAGIC' out3.txt || fail "delete: fixture lost its .ply finding"
grep -q 'PLY_BAD_MAGIC' out6.txt && { cat out6.txt; fail "with: mod.info Delete not applied"; }
grep -q '1 mod.info Delete' out6.txt || fail "with: Delete count not stated"
# --fast: SKIPPED line per skipped tool, says it is not a full run, same verdict as the full run
node ../check.js $G/mods/m2 --game $G --exe mowas2 --fast > out7.txt 2>&1
for t in keylint milint binhdr humlint expcheck sdllint refcheck; do grep -q "^SKIPPED $t: " out7.txt || fail "fast: no SKIPPED line for $t"; done
grep -q '^MODE fast' out7.txt || fail "fast: no MODE fast line"
grep -q '^VERDICT mowas2: ' out7.txt || fail "fast: no verdict line"
[ "$(grep '^VERDICT' out7.txt)" = "$(grep '^VERDICT' out2.txt)" ] || fail "fast: verdict differs from full"
grep -q '^SKIPPED' out2.txt && fail "full run printed SKIPPED"
tail -1 out7.txt | grep -q "^[0-9]* findings$" || fail "fast: last line is not N findings"
# preflight.js (review-severity warnings, never in a verdict): seeded case per rule + clean cases that must stay silent
grep -q 'PREFLIGHT_' out1.txt out2.txt out3.txt out4.txt out5.txt out6.txt && fail "preflight: fired on a clean fixture or clean patch"
rm -rf pfs pfc pfp; mkdir -p pfs/resource/map/multi/t pfc/resource/map/multi/t pfp/resource/set pfp/entity
cp $G/mods/m1/mod.info pfs/; cp $G/mods/m1/mod.info pfc/
printf '{mission\r\n\t{"actions"\r\n\t\t{"spawn" {waypoint "1"}}\r\n\t\t{"spawn" {entity ""} {waypoint "2"}}\r\n\t}\r\n}\r\n' > pfs/resource/map/multi/t/combat.mi
printf '{mission\r\n\t{"actions"\r\n\t\t{"spawn" {entity "x"} {waypoint "1"}}{"delay" {time 1}}\r\n\t}\r\n\t{map_point {allow {spawn tags}{capture tags}}}\r\n}\r\n' > pfc/resource/map/multi/t/combat.mi
node ../check.js pfs --game $G --exe mowas2 --only modinfo > outp1.txt 2>&1
grep -q '^  PREFLIGHT_SPAWN_NO_ENTITY x2  \[preflight\]' outp1.txt || { cat outp1.txt; fail "preflight: spawn without entity not found (2 seeded)"; }
node ../check.js pfc --game $G --exe mowas2 --only modinfo > outp2.txt 2>&1
grep -q 'PREFLIGHT_' outp2.txt && { cat outp2.txt; fail "preflight: clean spawn/glued blocks/allow {spawn} flagged"; }
grep -q '^REVIEW' outp1.txt || fail "preflight: not listed under review"
grep -q '^VERDICT mowas2: LOADS_STATIC' outp1.txt || fail "preflight: changed the verdict"
printf '{set}\r\n' > pfp/resource/set/a.set; printf '{def}\r\n' > pfp/entity/x.def
node ../check.js pfc --with pfp --game $G --exe mowas2 --only modinfo > outp3.txt 2>&1
grep -q '^  PREFLIGHT_PATCH_UNMOUNTED x1  \[preflight\] e.g. entity/x.def' outp3.txt || { cat outp3.txt; fail "preflight: patch file outside resource/ not found"; }
# packed: the same seeded .mi inside resource.pak (1 bad) and 1.pat (1 bad + 1 clean) is found; clean packed stays silent
rm -rf pfk; mkdir pfk; cp $G/mods/m1/mod.info pfk/
node -e "
const z=require('../../lib/zipwrite'),fs=require('fs');
const bad='{mission\r\n\t{\"actions\"\r\n\t\t{\"spawn\" {waypoint \"1\"}}\r\n\t}\r\n}\r\n',ok='{mission\r\n\t{\"actions\"\r\n\t\t{\"spawn\" {entity \"x\"}}\r\n\t}\r\n}\r\n';
fs.writeFileSync('pfk/resource.pak',z.zip([['map/multi/t/combat.mi',Buffer.from(bad)],['map/multi/t/ok.mi',Buffer.from(ok)]]));
fs.writeFileSync('pfk/1.pat',z.zip([['map/multi/u/combat.mi',Buffer.from(bad)]]))"
node ../check.js pfk --game $G --exe mowas2 --only modinfo > outp4.txt 2>&1
grep -q '^  PREFLIGHT_SPAWN_NO_ENTITY x2  \[preflight\]' outp4.txt || { cat outp4.txt; fail "preflight: packed spawn without entity not found (2 seeded: pak + pat)"; }
rm -rf pfs pfc pfp pfk outp1.txt outp2.txt outp3.txt outp4.txt
# bare folder (no mod.info): a real verdict, not REFUSED; binhdr/refcheck read the folder; mpsync is one clean skip, no stack
rm -rf bare; mkdir bare; cp -r $G/mods/m1 bare/b; rm bare/b/mod.info
node ../check.js bare/b --game $G --exe mowas2 > outb1.txt 2>&1
grep -q '^VERDICT mowas2: REFUSED' outb1.txt && { cat outb1.txt; fail "bare: still REFUSED"; }
grep -q '^VERDICT mowas2: ' outb1.txt || { cat outb1.txt; fail "bare: no verdict"; }
grep -q 'BARE folder' outb1.txt || fail "bare: synthetic mod.info not stated"
grep -q 'PLY_BAD_MAGIC' outb1.txt || fail "bare: sdllint/binhdr/refcheck finding of the seeded .ply missing"
grep -qE 'at .*\.js:[0-9]+|uncaught|^ERROR: .*mpsync' outb1.txt && { cat outb1.txt; fail "bare: stack or mpsync error in output"; }
node ../../doctor/doctor.js bare/b --game $G > outb2.txt 2>&1
grep -q '^NOT_MOUNTED "b"' outb2.txt || fail "doctor bare: no NOT_MOUNTED note"
grep -q '^binhdr .*PLY_' outb2.txt || { cat outb2.txt; fail "doctor bare: binhdr findings (loose folder) missing"; }
grep -qE '^mpsync +ERROR' outb2.txt && fail "doctor bare: mpsync ERROR"
# FileId of an installed Workshop item: warn naming both paths (seeded: workshop/content/244450/777 beside the fixture game)
rm -rf workshop; mkdir -p workshop/content/244450/777 ws; cp -r $G/mods/m1 ws/m1; printf '{Mod\r\n\t{Name "m1"}\r\n\t{MinGameVersion "3.262"}\r\n\t{MaxGameVersion "3.262"}\r\n\t{FileId "777"}\r\n}\r\n' > ws/m1/mod.info
node ../check.js ws/m1 --game $G --exe mowas2 --only modinfo > outw.txt 2>&1
grep -q '^WARN WORKSHOP_COPY: .*777.*workshop/content/244450/777.*ws/m1' outw.txt || { cat outw.txt; fail "FileId: no workshop warning naming both paths"; }
grep -q 'WORKSHOP_COPY' out3.txt && fail "FileId: warning on a mod without FileId"
rm -rf workshop ws bare outb1.txt outb2.txt outw.txt
rm -rf outside patch pf pd f1.txt f3.txt
# stackchecks.js (CHK-1): {weapon X filled} with no filling, and one def stem on two root classes. fixtures are written here (fx/ is wiped by mkfixture)
rm -rf pws pwc; mkdir -p pws/resource/set/stuff/mgun pws/resource/entity/pw/tank pws/resource/entity/pw/k1 pws/resource/entity/pw/k2 pws/resource/entity/pw/s1 pws/resource/entity/pw/s2
mkdir -p pwc/resource/set/stuff/mgun pwc/resource/entity/pw/tank pwc/resource/entity/pw/s1 pwc/resource/entity/pw/s2
cp $G/mods/m1/mod.info pws/; cp $G/mods/m1/mod.info pwc/
for d in pws pwc; do
  printf '{weapon_bullet\r\n\t{tag "weapon"}\r\n}\r\n' > $d/resource/set/stuff/mgun/mg_nofill
  printf '{weapon_bullet\r\n\t{tag "weapon"}\r\n\t{filling "ammo mgun" 50}\r\n}\r\n' > $d/resource/set/stuff/mgun/mg_fill
  printf '{weapon_bullet\r\n\t{filling "ammo pmg" 10}\r\n}\r\n' > $d/resource/set/stuff/mgun/pmg.pattern
  printf '{from "pattern pmg"\r\n\t{fireSound "x"}\r\n}\r\n' > $d/resource/set/stuff/mgun/mg_via
  printf '{game_entity\r\n}\r\n' > $d/resource/entity/pw/s1/same.def
  printf '{game_entity\r\n}\r\n' > $d/resource/entity/pw/s2/same.def
done
# seeded: tank has one bad site (filled, no filling) + clean ones (own filling, filling via pattern, no `filled`); k.def is game_entity in k1 and actor in k2
printf '{game_entity\r\n\t{place "a" {weapon "mg_nofill" filled}}\r\n\t{place "b" {weapon "mg_fill" filled}}\r\n\t{place "c" {weapon "mg_via" filled}}\r\n\t{place "d" {weapon "mg_nofill"}}\r\n}\r\n' > pws/resource/entity/pw/tank/tank.def
printf '{game_entity\r\n}\r\n' > pws/resource/entity/pw/k1/k.def
printf '{actor\r\n}\r\n' > pws/resource/entity/pw/k2/k.def
printf '{game_entity\r\n\t{place "b" {weapon "mg_fill" filled}}\r\n\t{place "c" {weapon "mg_via" filled}}\r\n\t{place "d" {weapon "mg_nofill"}}\r\n}\r\n' > pwc/resource/entity/pw/tank/tank.def
node ../check.js pws --game $G --exe mowas2 --only modinfo > outk1.txt 2>&1
grep -q '^  PREFLIGHT_WEAPON_FILLED_NO_FILLING x1  \[preflight\]' outk1.txt || { cat outk1.txt; fail "stackchecks: filled weapon without filling not found (1 seeded site)"; }
grep -q 'mg_nofill has no filling' outk1.txt || fail "stackchecks: weapon row does not name the stuff"
grep -q '^  PREFLIGHT_STEM_TWO_CLASSES x1  \[preflight\]' outk1.txt || { cat outk1.txt; fail "stackchecks: one stem on two classes not found (1 seeded: k)"; }
grep -q '^VERDICT mowas2: LOADS_STATIC' outk1.txt || fail "stackchecks: changed the verdict"
node ../check.js pwc --game $G --exe mowas2 --only modinfo > outk2.txt 2>&1
grep -q 'PREFLIGHT_WEAPON_FILLED\|PREFLIGHT_STEM' outk2.txt && { cat outk2.txt; fail "stackchecks: clean fixture flagged (own filling, filling via pattern, no filled, same-class dup stem)"; }
rm -rf pws pwc outk1.txt outk2.txt
# TOOLFIX (REV-TOOLS 3, 4): junctioned dep + game dir seen from outside, exit codes 0/1/2, --help 0 (temp dir under os.tmpdir())
# DET-FIX: two runs, same stdout bytes (PROGRESS is stderr only; no seconds in the report)
node ../check.js $G/mods/m1 --game $G --exe mowas2 --only modinfo,lnglint,ialint > det1.txt 2>/dev/null
node ../check.js $G/mods/m1 --game $G --exe mowas2 --only modinfo,lnglint,ialint > det2.txt 2>/dev/null
cmp -s det1.txt det2.txt && [ -s det1.txt ] || fail "check: two runs differ in stdout"
! grep -q '^PROGRESS ' det1.txt || fail "check: PROGRESS on stdout"
rm -f det1.txt det2.txt
# 1C: no --exe = wouldload gets --exe <target> (m1: Max 3.262 = mowas2); --all-games = no --exe (every build); --restore-points reaches
# wouldload and doctor (argument lists via CHECK_TEST_ARGS; the children's own handling is theirs). plain says the others were not checked
rm -rf ta0 ta1 ta2
CHECK_TEST_ARGS=ta0 node ../check.js $G/mods/m1 --game $G --only modinfo --plain > outg0.txt 2>&1
node -e "const a=JSON.parse(require('fs').readFileSync('ta0/wouldload.args','utf8')),i=a.indexOf('--exe');if(i<0||a[i+1]!=='mowas2')process.exit(1);if(a.includes('--restore-points')||JSON.parse(require('fs').readFileSync('ta0/doctor.args','utf8')).includes('--restore-points'))process.exit(1)" || fail "default: wouldload did not get --exe mowas2 (or got --restore-points)"
grep -q '^Only the original 32-bit game was checked; the other game builds were not\.' outg0.txt || { cat outg0.txt; fail "default: plain does not say the other builds were not checked"; }
CHECK_TEST_ARGS=ta1 node ../check.js $G/mods/m1 --game $G --only modinfo --all-games --restore-points > outg1.txt 2>&1
node -e "const a=JSON.parse(require('fs').readFileSync('ta1/wouldload.args','utf8'));if(a.includes('--exe')||!a.includes('--restore-points')||!JSON.parse(require('fs').readFileSync('ta1/doctor.args','utf8')).includes('--restore-points'))process.exit(1)" || fail "--all-games / --restore-points: wrong child arguments"
grep -q 'GAMES target only' outg1.txt && fail "--all-games: still says target only"
CHECK_TEST_ARGS=ta2 node ../check.js $G/mods/m1 --game $G --exe as64,mowas2 --only modinfo > /dev/null 2>&1
node -e "const a=JSON.parse(require('fs').readFileSync('ta2/wouldload.args','utf8')),i=a.indexOf('--exe');if(a[i+1]!=='as64,mowas2')process.exit(1)" || fail "--exe given: the user's list must win"
# restore points inside the mod: left out by default with a NOTE + plain line; not with --restore-points
mkdir -p $G/mods/m1/.arsenal-undo/t1
node ../check.js $G/mods/m1 --game $G --exe mowas2 --only modinfo --plain --raw > outg3.txt 2>&1
node ../check.js $G/mods/m1 --game $G --exe mowas2 --only modinfo --restore-points > outg4.txt 2>&1
rm -rf $G/mods/m1/.arsenal-undo
grep -q '^NOTE RESTORE_POINTS left out' outg3.txt && grep -q '^Restore points kept inside the mod were not checked\.' outg3.txt || { cat outg3.txt; fail "restore points: no left-out note"; }
grep -q 'RESTORE_POINTS' outg4.txt && fail "--restore-points: still says left out"
rm -rf ta0 ta1 ta2 outg0.txt outg1.txt outg3.txt outg4.txt
node toolfix.js || fail "toolfix"
# T-CRASH: one of each known crash / silent-disable cause seeded (mkcrash.js), exactly those codes; verdict in words; plain errors
node crash-test.js || fail "crash-test"
# check-false: seeded false/repeated crashes gate to review or merge; the one real crash stays (mkfalse.js, gate.js units)
node false-test.js || fail "false-test"
# W5 G5: GT-01 a "mods" folder that is not a game's is overlaid on the real game; GT-02 overall result; GT-18 --plain / --raw; GT-04 vfs dropReason
node verdict-test.js || fail "verdict-test"
# game parity: the target game reaches doctor (mowas2 = --exe mowas_2, goh = GoH install in place or overlaid), default target goh
node games-test.js || fail "games-test"
# X1 whole-check reuse: replay of an unchanged mod; a changed mod file / pak / game / required mod / argument / env runs again
ARSENAL_CHECK_REUSE= node reuse-test.js || fail "reuse-test"
echo PASS
