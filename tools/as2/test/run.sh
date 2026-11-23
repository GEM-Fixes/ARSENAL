#!/bin/sh
# as2 dispatcher regression
# Author: Imperator_Aug (ARSENAL, ia-3239c510)
d=$(cd "$(dirname "$0")" && pwd); t="$d/../as2.js"; w="${AS2_TEST_WORK:-$d/work}"   # AS2_TEST_WORK: own work folder when another run of this suite may share the checkout
rm -rf "$w"; mkdir -p "$w"
# the work folder holds local drive paths: remove it on every exit, a failed run too (fail prints what it needs first)
trap 'rm -rf "$w"' EXIT
fail() { echo "FAIL: $1"; exit 1; }
# goldens may be checked out with CRLF (core.autocrlf): compare text, not line ends
diff() { command diff --strip-trailing-cr "$@"; }
# 1 help lists mod + dev sections, every tools/<n>/<n>.js present
out=$(node "$t") || fail "1 help exit"
# T-SURFACE: the front door lists exactly these commands, in this order, each with an example line
n9=$(echo "$out" | sed -n 's/^  \([a-z]\+\)  .*/\1/p' | tr '\n' ' ')
[ "$n9" = "new gen check fix upgrade install uninstall play maps " ] || fail "1 front door commands: $n9"
[ "$(echo "$out" | grep -c '^             e\.g\. ARSENAL ')" = 9 ] || fail "1 one example per command"
echo "$out" | grep -q 'every tool: ARSENAL --all' || fail "1 no --all line"
# 1a DOOR-CLEAN: --help on the front-door tools = exit 0 + "usage: ARSENAL <tool>"
for n in upgrade fix refcheck check gen; do
  h=$(node "$t" $n --help 2>&1); [ $? = 0 ] || fail "1a $n --help rc"
  echo "$h" | grep -q "usage: ARSENAL $n" || fail "1a $n --help text"
done
# 1c DOOR-A: no game dir anywhere (no --game, AS2_GAME unset, no as2.json, Steam probe off) = one line + exit 2, no TypeError
mkdir -p "$w/nog/m/resource"; printf '{Mod\r\n\t{Name "m"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n' > "$w/nog/m/mod.info"   # a real mod folder: check refuses a non-mod folder before it looks for the game
printf 'name: x\nops:\n  - op: mod\n    title: X\n' > "$w/nog/spec.yaml"
for c in "check m --fast -q" "refcheck --folder m" "gen spec.yaml --target as64 --plan --out o" "covlint --out cl" "fix m plan --out p"; do
  ( cd "$w/nog" && env -u AS2_GAME AS2_NO_STEAM=1 node "$t" $c ) > "$w/nog.txt" 2>&1; rc=$?
  [ $rc = 2 ] || { cat "$w/nog.txt"; fail "1c $c rc=$rc"; }
  grep -q 'no game dir found' "$w/nog.txt" || { cat "$w/nog.txt"; fail "1c $c message"; }
  grep -q 'TypeError' "$w/nog.txt" && fail "1c $c TypeError"
done
node "$d/helpdoor.js" > "$w/helpdoor.txt" || { cat "$w/helpdoor.txt"; fail "1d helpdoor"; }
all=$(node "$t" --all)
echo "$all" | grep -q '^dev tools' || fail "1 no dev section in --all"
for n in doctor newmod lnglint; do echo "$all" | grep -q "^  $n " || fail "1 missing $n in --all"; done
echo "$out" | grep -q '^  as2 ' && fail "1 lists itself"
# 1b golden: main-path block of help (static text); stopped tools hidden by default, shown by --all, still run when named
node "$t" > "$w/help.txt"
diff "$w/help.txt" "$d/help.golden.txt" >/dev/null || { diff "$w/help.txt" "$d/help.golden.txt"; fail "1b help golden"; }
node "$t" help | diff - "$d/help.golden.txt" >/dev/null || fail "1b help == no args"
node "$t" advanced > "$w/adv.txt" || fail "1b advanced rc"
diff "$w/adv.txt" "$d/advanced.golden.txt" >/dev/null || { diff "$w/adv.txt" "$d/advanced.golden.txt"; fail "1b advanced golden"; }
# every tool named in advanced exists and is callable by name
for n in $(sed -n 's/^  \([a-z0-9-]\+\)  .*/\1/p' "$w/adv.txt" | grep -v '^linters$\|^workflow$') $(sed -n 's/^  linters .*one at a time: //p' "$w/adv.txt"); do
  node -e "process.exit(require(process.argv[1]).entry(process.argv[2])?0:1)" "$t" "$n" || fail "1b advanced names a missing tool $n"
done
for n in rows2scn dist spotsheet rows mcp lsp wave probekit spotcheck cvarcheck; do echo "$out" | grep -q "^  $n " && fail "1b stopped $n listed"; done
all=$(node "$t" --all); for n in rows2scn spotsheet rows; do echo "$all" | grep -q "^  $n " || fail "1b --all misses $n"; done
echo "$all" | grep -q '^advanced:' || fail "1b no advanced in --all"
node "$t" rows2scn >/dev/null 2>&1; [ $? = 2 ] && node "$t" rows2scn 2>&1 | grep -q "unknown tool" && fail "1b stopped tool refused when named"
# 2 dispatch: output + exit code pass through (newmod refuses w/o --name → 2; creates → 0)
node "$t" newmod "$w/x" >/dev/null 2>&1; [ $? = 2 ] || fail "2 exit code not passed"
node "$t" newmod "$w/m" --name M | grep -q '^0 findings$' || fail "2 newmod via as2"
node "$t" lnglint "$w/m" -q | grep -q '^0 findings$' || fail "2 lnglint via as2"
# 3 dev split: dev tool needs `dev`, mod tool refused under `dev`
node "$t" q Foo >/dev/null 2>&1; [ $? = 2 ] || fail "3 dev tool at top level"
node "$t" dev doctor >/dev/null 2>&1; [ $? = 2 ] || fail "3 mod tool under dev"
node "$t" dev fieldtypes --help >/dev/null 2>&1; [ $? = 2 ] && fail "3 fieldtypes entry"
# 4 unknown / path tricks refused
node "$t" nope >/dev/null 2>&1; [ $? = 2 ] || fail "4 unknown"
node "$t" ../tools >/dev/null 2>&1; [ $? = 2 ] || fail "4 path"
node "$t" lib >/dev/null 2>&1; [ $? = 2 ] || fail "4 lib"
# 4b status: reads the Milestones table at run time; absent -> plain message, exit 1
node "$t" status --plan "$d/fixture/plan.fixture.md" > "$w/st.txt"; [ $? = 0 ] || fail "4b status exit"
grep -q '^M1 harness$' "$w/st.txt" && grep -q 'state: every group has a kill; a | b' "$w/st.txt" && grep -q '^M5 coverage$' "$w/st.txt" || fail "4b status rows"
grep -q 'Gates\|^X$' "$w/st.txt" && fail "4b status leaked another section"
node "$t" status --plan "$w/none.md" > "$w/st2.txt"; [ $? = 1 ] || fail "4b status absent rc"
grep -q 'not shipped' "$w/st2.txt" || fail "4b status absent text"
mkdir -p "$w/ship/tools/as2"; cp "$d/../status.js" "$w/ship/tools/as2/"
( cd "$w/ship/tools/as2" && node -e "process.exitCode=require('./status.js').main([])" ) > "$w/st3.txt"; [ $? = 1 ] || fail "4b no plan/ rc"
grep -q 'not shipped' "$w/st3.txt" || fail "4b no plan/ text"
printf '## Other\n' > "$w/nom.md"; node "$t" status --plan "$w/nom.md" | grep -q 'no "## Milestones" table' || fail "4b no section"
node "$t" status --bogus >/dev/null 2>&1; [ $? = 2 ] || fail "4b usage rc"
# 5 flow: golden --dry chains (relative paths, fixed logdir)
cp -r "$d/fixture" "$w/f"; cd "$w/f" || fail "5 cd"
unset AS2_GAME
{ node "$t" e2e mymod --map m1 --game game --logdir L --dry; echo "rc=$?"
  node "$t" dev-loop mymod --map m1 --game game --logdir L --name nm --dry; echo "rc=$?"
  node "$t" probe --game game --dry; echo "rc=$?"
  node "$t" install mymod --game game --link --dry; echo "rc=$?"; } > "$w/dry.txt" 2>&1
diff "$w/dry.txt" "$d/dry.golden.txt" >/dev/null || { diff "$w/dry.txt" "$d/dry.golden.txt"; fail "5 dry golden"; }
# 5a T-PLAY: play --dry golden (backslashes -> /), writes nothing; instance 0 refused
{ node "$t" play mymod --game game --logdir L --dry; echo "rc=$?"; } 2>&1 | sed 's#\\#/#g' > "$w/play-dry.txt"
diff "$w/play-dry.txt" "$d/play-dry.golden.txt" >/dev/null || { diff "$w/play-dry.txt" "$d/play-dry.golden.txt"; fail "5a play dry golden"; }
[ -e game/mods/mymod ] && fail "5a play --dry installed"
node "$t" play mymod --game game --logdir L --map multi/m2:combat --inst 3 --dry | grep -q 'testrun.js --map multi/m2:combat --logdir L --inst 3' || fail "5a play map/inst"
node "$t" play mymod --game game --inst 0 --dry >/dev/null 2>&1; [ $? = 2 ] || fail "5a play inst 0 not refused"
# 5a2 T-PLAYFIX: a bare name that is a mod already in <game>/mods (no folder of that name here) = played in place, no install step
mkdir -p game/mods/inplace; cp mymod/mod.info game/mods/inplace/
{ node "$t" play inplace --game game --logdir L --dry; echo "rc=$?"; } 2>&1 | sed 's#\\#/#g' > "$w/play-inplace.txt"
diff "$w/play-inplace.txt" "$d/play-inplace.golden.txt" >/dev/null || { diff "$w/play-inplace.txt" "$d/play-inplace.golden.txt"; fail "5a2 play in place golden"; }
grep -q 'ARSENAL install' "$w/play-inplace.txt" && fail "5a2 in place ran an install step"
node "$t" play nosuchmod --game game --dry >/dev/null 2>&1; [ $? = 2 ] || fail "5a2 unknown bare name not refused"
rm -rf game/mods/inplace
# 5b modern mod.info (MinGameVersion >= 3.301) -> e2e --set lists as64+ first (VFS-48)
mkdir -p modern; printf '{\r\n  Name "m"\r\n  {MinGameVersion "3.301"}\r\n}\r\n' > modern/mod.info
node "$t" e2e modern --map m1 --game game --logdir L --dry 2>&1 | grep -q -- '--set as64+,modern --write --bak' || fail "5b modern as64+"
# 5c TST-22: --inst N forwards to modswitch/testrun, default logdir = that instance's log dir (fake home AS2_HOME)
H="$w/home"; mkdir -p "$H/Documents/my games/men of war - assault squad 2/log"
AS2_HOME="$H" node "$t" e2e mymod --map m1 --game game --inst 2 --dry > "$w/inst.txt" 2>&1
grep -q 'modswitch.js --game game --inst 2 --set mymod' "$w/inst.txt" || fail "5c modswitch inst"
grep -q 'testrun.js --map m1 --logdir .*instance 2.log" --inst 2' "$w/inst.txt" || fail "5c testrun inst/logdir"
grep -q 'logtriage.js .*instance 2.log" --mod' "$w/inst.txt" || fail "5c logtriage logdir"
AS2_HOME="$H" node "$t" e2e mymod --map m1 --game game --dry 2>&1 | grep -q 'testrun.js --map m1 --logdir .*assault squad 2.log"* *$' || fail "5c inst0 logdir"
# 6 game: arg and env
mkdir -p X; node "$t" game --game X | grep -q '^X  (arg)$' || fail "6 game arg"
node "$t" game --game nosuch_dir 2>&1 | grep -q 'not a folder: nosuch_dir' || fail "6 game arg missing refused"
AS2_GAME="$w/f/game" node "$t" game | grep -q '(env)$' || fail "6 game env"
# 7 install copy + marker, reinstall ok, foreign refused (I-8: the game folder must hold the exe)
: > game/as64.exe
node "$t" install mymod --game game >/dev/null || fail "7 install"
[ -f game/mods/mymod/resource/readme.txt ] && [ -f game/mods/mymod/.as2-installed ] || fail "7 copy/marker"
node "$t" install mymod --game game >/dev/null || fail "7 reinstall own"
mkdir -p mymod2; cp mymod/mod.info mymod2/; node "$t" install mymod2 --name foreign --game game >/dev/null 2>&1; [ $? = 2 ] || fail "7 foreign overwrite"
[ -f game/mods/foreign/keep.txt ] || fail "7 foreign touched"
# I-10: --force never deletes a hand-made folder (no marker): refused, kept
node "$t" install mymod2 --name foreign --game game --force > "$w/force.txt" 2>&1; [ $? = 2 ] || fail "7 force over hand-made not refused"
grep -q 'may hold your own work' "$w/force.txt" || { cat "$w/force.txt"; fail "7 force message"; }
[ -f game/mods/foreign/keep.txt ] || fail "7 force deleted a hand-made folder"
# I-8: game without the exe, a GoH folder (by content), a file: refused, no mods/ made
mkdir -p emptyg gohg/binaries/x64; : > gohg/binaries/x64/call_to_arms.exe; : > gohg/as64.exe
for g in emptyg gohg; do node "$t" install mymod --game $g > "$w/g.txt" 2>&1; [ $? = 2 ] || fail "7 game $g not refused"; [ -e $g/mods ] && fail "7 mods/ made in $g"; done
node "$t" install mymod --game emptyg 2>&1 | grep -q 'no as64.exe or mowas_2.exe' || fail "7 no-exe message"
node "$t" install mymod --game gohg 2>&1 | grep -q 'Gates of Hell' || fail "7 GoH message"
# I-15/I-17: long and reserved names
node "$t" install mymod --name "$(node -e 'process.stdout.write("n".repeat(300))')" --game game > "$w/g.txt" 2>&1; [ $? = 2 ] && grep -q 'characters long' "$w/g.txt" || fail "7 long name"
node "$t" install mymod --name con --game game > "$w/g.txt" 2>&1; [ $? = 2 ] && grep -q 'Windows keeps' "$w/g.txt" || fail "7 reserved name"
# 8 uninstall: needs --yes, marker only
node "$t" uninstall mymod --game game >/dev/null; [ $? = 1 ] || fail "8 no --yes rc"
[ -d game/mods/mymod ] || fail "8 removed without --yes"
node "$t" uninstall mymod --game game --yes >/dev/null || fail "8 uninstall"
[ -d game/mods/mymod ] && fail "8 still there"
mkdir -p game/mods/plain; node "$t" uninstall plain --game game --yes >/dev/null 2>&1; [ $? = 2 ] || fail "8 unmarked rc"
[ -d game/mods/plain ] || fail "8 unmarked removed"
node "$t" uninstall ../x --game game --yes >/dev/null 2>&1; [ $? = 2 ] || fail "8 bad name"
# 9 junction install/uninstall leaves the source intact
node "$t" install mymod --game game --link >/dev/null || fail "9 link"
[ -f game/mods/mymod/resource/readme.txt ] || fail "9 link content"
[ -e mymod/.as2-installed ] && fail "9 link wrote a marker into the SOURCE mod (I-10)"
node "$t" install mymod --game game --link >/dev/null || fail "9 relink over own junction"
node "$t" uninstall mymod --game game --yes >/dev/null || fail "9 unlink"
[ -f mymod/resource/readme.txt ] || fail "9 source deleted"
# 10 TOOLFIX (REV-TOOLS 1): installing a mod that already sits in mods/ (src == dest, other case too) or a parent of mods/ is refused, nothing deleted
node "$t" install mymod --name same --game game >/dev/null || fail "10 setup"
# GX G2: src == dest is no error: "already in the game's mods folder, nothing to copy", exit 0, nothing deleted, no marker added to a folder ARSENAL did not install
node "$t" install game/mods/same --game game --force > "$w/same.txt" 2>&1 || fail "10 src==dest not accepted"
grep -q "already in the game's mods folder, nothing to copy" "$w/same.txt" || fail "10 src==dest message"
node "$t" install GAME/MODS/SAME --name same --game game --force >/dev/null 2>&1 || fail "10 src==dest (case) not accepted"
mkdir -p game/mods/hand2; cp mymod/mod.info game/mods/hand2/; node "$t" install game/mods/hand2 --game game >/dev/null || fail "10 hand2"
[ -e game/mods/hand2/.as2-installed ] && fail "10 marker written on in-place mod"
node "$t" uninstall hand2 --game game --yes >/dev/null 2>&1; [ $? = 2 ] || fail "10 in-place mod uninstall not refused"
# play on the folder path inside mods/: no install step
mkdir -p game/mods/hand3; cp mymod/mod.info game/mods/hand3/; node "$t" play game/mods/hand3 --game game --logdir L --dry > "$w/play-path.txt" 2>&1 || fail "10 play in-place path"
grep -q 'ARSENAL install' "$w/play-path.txt" && fail "10 play path ran an install step"
grep -q 'played in place' "$w/play-path.txt" || fail "10 play path not in place"
rm -rf game/mods/hand2 game/mods/hand3
[ -f game/mods/same/resource/readme.txt ] || fail "10 source deleted"
node "$t" install game/mods --name mods --game game --force >/dev/null 2>&1; [ $? = 2 ] || fail "10 dest inside src not refused"
ls game/mods | grep -q 'as2tmp' && fail "10 temp copy left in mods/"
# 11 DOOR-B5: install/uninstall are pure fs: no node on PATH (the exe has node inside, nothing else). node is called by absolute path with PATH emptied
NODE=$(node -p process.execPath)
mkdir -p nonode/gm/mods; : > nonode/gm/as64.exe; cp -r mymod nonode/src
( cd nonode && PATH=/nonexistent "$NODE" "$t" install src --name nn --game gm ) > "$w/nonode.txt" 2>&1 || { cat "$w/nonode.txt"; fail "11 install without node on PATH"; }
[ -f nonode/gm/mods/nn/resource/readme.txt ] && [ -f nonode/gm/mods/nn/.as2-installed ] || fail "11 copy/marker without node"
( cd nonode && PATH=/nonexistent "$NODE" "$t" uninstall nn --game gm --yes ) >/dev/null 2>&1 || fail "11 uninstall without node"
[ -d nonode/gm/mods/nn ] && fail "11 uninstall left folder"
# the exe build routes exactly flow.EXE_OK to flow.main (sea-main.js); the spawning flows must not be in it
"$NODE" -e "const e=require(process.argv[1]).EXE_OK;process.exit(['game','install','uninstall'].every(c=>e.has(c))&&!['e2e','probe','dev-loop'].some(c=>e.has(c))?0:1)" "$d/../flow.js" || fail "11 EXE_OK set"
node "$t" install --help | grep -q 'repo only' && fail "11 install help says repo only"
node "$t" e2e --help | grep -q 'repo only' || fail "11 e2e help lost repo only"
# 12 T-SURFACE: new (as64, lowercase folder), play placeholder, maps dispatch, plain game-not-found text
mkdir -p "$w/door" && cd "$w/door" || fail "12 cd"
mkdir -p "$w/door/nogame/sub/x" && printf '{Mod\r\n}\r\n' > "$w/door/nogame/sub/x/mod.info"
node "$t" new My_Mod --dry-run > new-dry.txt 2>&1 || { cat new-dry.txt; fail "12 new --dry-run rc"; }
diff new-dry.txt "$d/new-dry.golden.txt" >/dev/null || { diff new-dry.txt "$d/new-dry.golden.txt"; fail "12 new --dry-run golden"; }
[ -e my_mod ] || [ -e My_Mod ] && fail "12 dry-run wrote"
node "$t" new Some_Mod --name "Some Mod" >/dev/null || fail "12 new rc"
[ -f some_mod/mod.info ] && ls | grep -q '^Some_Mod$' && fail "12 capital folder made"
grep -q 'MinGameVersion "3.301"' some_mod/mod.info && ! grep -q MaxGameVersion some_mod/mod.info && grep -q 'Name "Some Mod"' some_mod/mod.info || fail "12 new as64 mod.info"
# GX S11/C10: spaces become underscores (with the reason in one line), unsafe characters refused
node "$t" new "Big Mod" > bigmod.txt 2>&1 || { cat bigmod.txt; fail "12 new with a space"; }
grep -q '^note: the mod folder is "big_mod", not "Big Mod": .*spaces became underscores' bigmod.txt || { cat bigmod.txt; fail "12 new space note"; }
[ -f big_mod/mod.info ] && grep -q 'Name "Big Mod"' big_mod/mod.info || fail "12 new space result"
node "$t" new "a?b" > badname.txt 2>&1; [ $? = 2 ] && grep -q "has characters a folder cannot have" badname.txt || fail "12 new unsafe name"
mkdir -p nogame/sub gj/g; printf '{"game": "g"}' > gj/as2.json
{ echo '$ ARSENAL game   (no game anywhere)'; ( cd nogame/sub && env -u AS2_GAME AS2_NO_STEAM=1 node "$t" game ); echo "rc=$?"
  echo '$ ARSENAL game   (AS2_GAME set to a missing folder)'; ( cd nogame/sub && AS2_GAME=nosuch_game AS2_NO_STEAM=1 node "$t" game ); echo "rc=$?"
  echo '$ ARSENAL maps list   (no game)'; ( cd nogame/sub && env -u AS2_GAME AS2_NO_STEAM=1 node "$t" maps list ); echo "rc=$?"
  echo '$ ARSENAL install x   (no game)'; mkdir -p nogame/sub/x; ( cd nogame/sub && env -u AS2_GAME AS2_NO_STEAM=1 node "$t" install x ); echo "rc=$?"
  echo '$ ARSENAL play x --dry   (no game)'; ( cd nogame/sub && env -u AS2_GAME AS2_NO_STEAM=1 node "$t" play x --dry ); echo "rc=$?"
  echo '$ ARSENAL play x --inst 0   (instance 0)'; ( cd nogame/sub && env -u AS2_GAME AS2_NO_STEAM=1 node "$t" play x --inst 0 ); echo "rc=$?"
  echo '$ ARSENAL play nosuch'; ( cd nogame/sub && env -u AS2_GAME AS2_NO_STEAM=1 node "$t" play nosuch ); echo "rc=$?"
  echo '$ ARSENAL play'; node "$t" play; echo "rc=$?"
  echo '$ ARSENAL new'; node "$t" new; echo "rc=$?"
  echo '$ ARSENAL new m --target nosuch'; node "$t" new m --target nosuch; echo "rc=$?"
  echo '$ ARSENAL maps nope'; node "$t" maps nope; echo "rc=$?"
} 2>&1 | sed 's/none in .* or any folder above it/none in <cwd> or any folder above it/' > errors.txt
diff errors.txt "$d/errors.golden.txt" >/dev/null || { diff errors.txt "$d/errors.golden.txt"; fail "12 error texts golden"; }
# bad AS2_GAME with a good as2.json: warned as ignored, as2.json wins
( cd gj && AS2_GAME=nosuch_game AS2_NO_STEAM=1 node "$t" game ) > gj.txt 2>&1 || { cat gj.txt; fail "12 as2.json after bad AS2_GAME rc"; }
grep -q '^warning: AS2_GAME=nosuch_game is ignored: no folder there' gj.txt && grep -q '(as2.json)$' gj.txt || { cat gj.txt; fail "12 bad AS2_GAME warning"; }
# maps: --game is filled in (as2.json here); clone gets --target as64; view without --map needs no game
( cd gj && AS2_NO_STEAM=1 node "$t" maps clone --map map/multi/none --name n2 --out o --plan ) > mc.txt 2>&1
grep -q 'MAPCLONE_NO_MAP\|no map' mc.txt || { cat mc.txt; fail "12 maps clone did not reach map-clone"; }
grep -q 'no game folder found' mc.txt && fail "12 maps clone lost the game"
node "$t" maps view --help | grep -q '^usage: ARSENAL mapview' || fail "12 maps view --help"
# 13 T-PLAY/T-INSTALL: install/uninstall transcript on a fake game folder in a temp dir (copy + link, marker, refuse cases, exe route same text)
node "$d/instgold.js" > "$w/inst.txt" 2>&1 || { cat "$w/inst.txt"; fail "13 instgold rc"; }
# golden-install.txt: the old name install.golden.txt matched .gitignore tools/*/test/inst*.txt and was never committed
diff "$w/inst.txt" "$d/golden-install.txt" >/dev/null || { diff "$w/inst.txt" "$d/golden-install.txt"; fail "13 install golden"; }
# 14 game parity: --target as64|mowas2|goh, --exe game word, game --kind, the mod.info range (temp folders, nothing started)
node "$d/gameword.js" > "$w/gw.txt" 2>&1 || { grep -v '^ok' "$w/gw.txt"; fail "14 game word"; }
cd "$d"
rm -rf "$w"
echo PASS
