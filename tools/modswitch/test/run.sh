#!/bin/sh
# fixture game dir (3 mods, b has 2 patches) + profile; checks dry run, set, missing mod, insert w/o block, restore
# Author: Imperator_Aug (ARSENAL, ia-eb31b44e)
cd "$(dirname "$0")"; T=fixture; rm -rf $T; mkdir -p $T/game/mods/a $T/game/mods/b $T/game/mods/c $T/prof
for m in a b c; do printf '{Mod\r\n{Name "%s"}\r\n}\r\n' $m > $T/game/mods/$m/mod.info; done
touch $T/game/mods/b/1.pat $T/game/mods/b/2.pat
printf '{options\r\n\t{video\r\n\t\t{w 1280}\r\n\t}\r\n\t{mods\r\n\t\t"a:0"\r\n\t\t"Gone:0"\r\n\t}\r\n}\r\n' > $T/prof/options.set
printf '{lastGameVersion "3.262.1"}\r\n' > $T/prof/settings.set
cp $T/prof/options.set $T/orig
M="node ../modswitch.js --game $T/game --profile $T/prof/options.set --no-proc"
fail() { echo "FAIL: $1"; exit 1; }
$M | grep -q 'MOD_NOT_INSTALLED "Gone:0"' || fail "stale line not flagged"
$M --set c,B | grep -q 'plan:    c:0 b:2' || fail "plan"
cmp -s $T/orig $T/prof/options.set || fail "dry run wrote"
$M --set nope >/dev/null && fail "missing mod accepted"
$M --set c,B --write | grep -q '^wrote' || fail "write"
grep -q '"b:2"' $T/prof/options.set && grep -q '{w 1280}' $T/prof/options.set || fail "content"
[ "$(grep -c $'\r$' $T/prof/options.set)" = "$(wc -l < $T/prof/options.set)" ] || fail "CRLF lost"
cmp -s $T/orig $T/prof/options.set.modswitch.bak || fail "backup"
$M --restore --write >/dev/null; cmp -s $T/orig $T/prof/options.set || fail "restore"
# --bak (relative = profile dir): per-run snapshot of the state just before --set (not the keep-first .modswitch.bak)
$M --set c --write >/dev/null; cp $T/prof/options.set $T/mid
$M --set a --write --bak snap >/dev/null; cmp -s $T/mid $T/prof/snap || fail "bak snapshot"
$M --restore --write --bak snap >/dev/null; cmp -s $T/mid $T/prof/options.set || fail "bak restore"
cmp -s $T/orig $T/prof/options.set.modswitch.bak || fail "bak left keep-first backup alone"
printf '{options\r\n\t{video\r\n\t}\r\n}\r\n' > $T/prof/options.set
$M --set a --write >/dev/null || fail "insert"
$M | grep -q 'active:  a:0' || fail "inserted block not read back"
# built-in as64+ (as64/plus/mod.info) is not "not installed"
mkdir -p $T/game/as64/plus; cp $T/game/mods/a/mod.info $T/game/as64/plus/mod.info
printf "{options
	{mods
		\"as64+:0\"
	}
}
" > $T/prof/options.set
$M | grep -q MOD_NOT_INSTALLED && fail "as64+ flagged"
# --set accepts built-in as64+ ; VFS-48 mode warnings (legacy a + as64+, modern m without as64+)
printf '{Mod
{Name "a"}
{MinGameVersion "3.262"}
{MaxGameVersion "3.262"}
}
' > $T/game/mods/a/mod.info
mkdir -p $T/game/mods/m; printf '{Mod
{Name "m"}
{MinGameVersion "3.301"}
}
' > $T/game/mods/m/mod.info
$M --set "as64+,m" > $T/o.txt || fail "set as64+"
grep -q 'plan:    as64+:0 m:0' $T/o.txt || fail "as64+ plan"
grep -q "MOD_MODE" $T/o.txt && fail "spurious mode warn"
$M --set "as64+,a" | grep -q 'MOD_MODE_LEGACY "a"' || fail "legacy+as64+ warn"
$M --set "m" | grep -q 'MOD_MODE_CLASSIC "m"' || fail "modern w/o as64+ warn"
cp $T/prof/options.set $T/pre
$M --set "as64+,a" --write > $T/o.txt && fail "mismatch written"
grep -q "ERROR MOD_MODE 1" $T/o.txt || fail "mismatch refuse msg"
cmp -s $T/pre $T/prof/options.set || fail "refused set changed profile"
$M --set "as64+,a" --write --force | grep -q "^wrote" || fail "force write"
# export / import
printf '{Mod\r\n{Name "c"}\r\n{Version "1.5"}\r\n}\r\n' > $T/game/mods/c/mod.info
$M --set c,b --write >/dev/null || fail "pre-export set"
cp $T/prof/options.set $T/pre
$M --export $T/x.json | grep -q 'exported 2' || fail "export"
grep -q '"gameVersion": "3.262.1"' $T/x.json && grep -q '"version": "1.5"' $T/x.json && grep -q '"present": true' $T/x.json || fail "export content"
grep -qE '"sha1": "[0-9a-f]{40}"' $T/x.json || fail "export sha1"
cmp -s $T/pre $T/prof/options.set || fail "export wrote profile"
$M --set a --write >/dev/null
cp $T/prof/options.set $T/pre
$M --import $T/x.json > $T/imp.txt || fail "import dry"
grep -q 'plan:    c:0 b:2' $T/imp.txt || fail "import plan"
grep -q 'VERSION_DIFF' $T/imp.txt && fail "spurious version diff"
cmp -s $T/pre $T/prof/options.set || fail "import dry wrote"
printf '{Mod\r\n{Name "c"}\r\n{Version "2.0"}\r\n}\r\n' > $T/game/mods/c/mod.info
$M --import $T/x.json | grep -q 'WARN_MODSW_VERSION_DIFF "c"' || fail "version diff"
printf '{x}\r\n' >> $T/game/mods/b/mod.info
$M --import $T/x.json | grep -q 'WARN_MODSW_INFO_DIFF "b"' || fail "info sha1 diff"
sed 's/"name": "b"/"name": "zz"/' $T/x.json > $T/y.json
$M --import $T/y.json --write > $T/imp.txt && fail "missing import accepted"
grep -q 'MODSW_MISSING_MOD "zz"' $T/imp.txt || fail "missing flag"
cmp -s $T/pre $T/prof/options.set || fail "missing import wrote"
$M --import $T/x.json --write >/dev/null || fail "import write"
$M | grep -q 'active:  c:0 b:2' || fail "import applied"
# TST-22: --inst N / --seed N on a fake home (AS2_HOME); instance 0 profile never written
H="$PWD/$T/home"; U="$H/Documents/my games/men of war - assault squad 2"; U1="$U - instance 1"
mkdir -p "$U/profiles/p1"; printf '{options\r\n\t{mods\r\n\t\t"a:0"\r\n\t}\r\n}\r\n' > "$U/profiles/p1/options.set"
cp "$U/profiles/p1/options.set" $T/home0
MH="node ../modswitch.js --game $T/game --no-proc"
AS2_HOME="$H" $MH --inst 1 >/dev/null 2>$T/e.txt && fail "inst 1 without profile accepted"
grep -q 'run --seed 1' $T/e.txt || fail "inst hint"
AS2_HOME="$H" node ../modswitch.js --seed 1 --mods c:0,b:2 | grep -q '^seeded' || fail "seed"
AS2_HOME="$H" $MH --inst 1 | grep -q 'active:  c:0 b:2' || fail "inst 1 mods"
AS2_HOME="$H" $MH --inst 1 --set a --write >/dev/null || fail "inst 1 write"
grep -q '"a:0"' "$U1/profiles/p1/options.set" || fail "inst 1 written"
cmp -s $T/home0 "$U/profiles/p1/options.set" || fail "instance 0 profile touched"
AS2_HOME="$H" node ../modswitch.js --seed 0 >/dev/null 2>&1 && fail "seed 0 accepted"
# game parity: GoH profile from the GoH user dir (GHVFS-13), GoH exe list + app id, folder name rule (GHVFS-27), no instances
G=$T/goh; mkdir -p $G/binaries/x64 $G/mods/good $G/mods/bad-name; printf 'MZ' > $G/binaries/x64/call_to_arms.exe
for m in good bad-name; do printf '{mod\r\n\t{name "%s"}\r\n\t{minGameVersion "1.050"}\r\n}\r\n' $m > $G/mods/$m/mod.info; done
GU="$H/Documents/My Games/Gates of Hell/profiles/77"; mkdir -p "$GU"
printf '{options\r\n\t{mods\r\n\t\t"good:0"\r\n\t\t"bad-name:0"\r\n\t}\r\n}\r\n' > "$GU/options.set"
printf '{lastGameVersion "1.067.0"}\r\n' > "$GU/settings.set"
cp "$GU/options.set" $T/goh0
AS2_HOME="$H" node ../modswitch.js --game $G --exe goh --no-proc > $T/g.txt || fail "goh show"
grep -q "profile: .*Gates of Hell.profiles.77.options.set" $T/g.txt || fail "goh profile from GoH user dir"
grep -q 'active:  good:0 bad-name:0' $T/g.txt || fail "goh list read (no wipe at same version)"
grep -q 'MOD_NAME_GOH "bad-name:0"' $T/g.txt || fail "goh name rule on the list"
grep -q 'rungameid/400750' $T/g.txt || fail "goh launch line"
grep -q 'MOD_MODE' $T/g.txt && fail "as64 mode warn on goh"
AS2_HOME="$H" node ../modswitch.js --game $G --no-proc | grep -q 'rungameid/400750' || fail "goh found from call_to_arms.exe without --exe"
AS2_HOME="$H" node ../modswitch.js --game $G --exe goh --no-proc --set good,bad-name > $T/g.txt && fail "goh bad name accepted"
grep -q 'ERROR MOD_NAME_GOH "bad-name"' $T/g.txt || fail "goh bad name refuse msg"
AS2_HOME="$H" node ../modswitch.js --game $G --exe goh --no-proc --set as64+,good > $T/g.txt && fail "as64+ accepted on goh"
AS2_HOME="$H" node ../modswitch.js --game $G --exe goh --no-proc --set good --write | grep -q '^wrote' || fail "goh write"
AS2_HOME="$H" node ../modswitch.js --game $G --exe goh --no-proc | grep -q 'active:  good:0' || fail "goh written list read back"
AS2_HOME="$H" node ../modswitch.js --game $G --exe goh --no-proc --restore --write >/dev/null; cmp -s $T/goh0 "$GU/options.set" || fail "goh restore"
AS2_HOME="$H" node ../modswitch.js --game $G --exe goh --inst 1 --no-proc 2>$T/e.txt; [ $? = 2 ] || fail "goh --inst not refused with exit 2"
grep -q '^modswitch: not available for GoH: .*(GHVFS-13)$' $T/e.txt || fail "goh --inst plain line"
AS2_HOME="$H" node ../modswitch.js --exe goh --seed 1 2>$T/e.txt; [ $? = 2 ] && grep -q '(GHVFS-13)' $T/e.txt || fail "goh --seed refused"
# MoW:AS2 (--exe mowas_2 / mowas2): no as64+, no modes, no instance (TST-19); AS2 profile as AS64
printf '{options\r\n\t{mods\r\n\t\t"as64+:0"\r\n\t\t"m:0"\r\n\t}\r\n}\r\n' > $T/prof/options.set
$M --exe mowas_2 > $T/w.txt || fail "mowas2 show"
grep -q 'WARN_MOWAS2_NO_PLUS "as64+:0"' $T/w.txt || fail "mowas2 as64+ warn"
grep -q 'WARN_MOWAS2_VERSION "m"' $T/w.txt || fail "mowas2 version warn"
grep -q 'MOD_MODE' $T/w.txt && fail "as64 mode warn under mowas2"
grep -q 'rungameid/244450' $T/w.txt || fail "mowas2 launch line"
$M --exe mowas2 --set as64+,c >/dev/null && fail "as64+ accepted under mowas2"
$M --exe mowas2 --set m,c --write | grep -q '^wrote' || fail "mowas2 write (no mode refusal)"
$M --set m,c > $T/w.txt; grep -q 'MOD_MODE_CLASSIC "m"' $T/w.txt || fail "as64 default unchanged (mode warn)"
AS2_HOME="$H" $MH --exe mowas_2 --inst 1 2>$T/e.txt; [ $? = 2 ] && grep -q '^modswitch: not available for MoW:AS2: .*(TST-19)$' $T/e.txt || fail "mowas2 --inst refused"
node ../modswitch.js --exe bogus --game $T/game 2>/dev/null; [ $? = 2 ] || fail "bad --exe"
# --json: one JSON line, a folder with a space stays one entry; a missing one is installed:false
mkdir -p "$T/game/mods/my mod"; printf '{Mod\r\n{Name "my mod"}\r\n}\r\n' > "$T/game/mods/my mod/mod.info"
printf '{options\r\n\t{mods\r\n\t\t"my mod:0"\r\n\t\t"no mod:0"\r\n\t\t"a:0"\r\n\t}\r\n}\r\n' > $T/prof/options.set
$M --json > $T/j.txt || fail "json show"
[ "$(wc -l < $T/j.txt)" = 1 ] || fail "json is one line"
node -e '
const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const a = j.active.map(m => m.folder + "=" + m.installed).join();
if (a !== "my mod=true,no mod=false,a=true" || j.game !== "as64" || !j.problems.some(p => p.code === "MOD_NOT_INSTALLED")) throw a;
' $T/j.txt || fail "json content"
$M --exe mowas_2 --json | grep -q '"game":"mowas2"' || fail "json mowas2"
# --json carries the game warnings of the text output: mowas_2 version skip, as64 modes, GoH folder name rule
printf '{options\r\n\t{mods\r\n\t\t"m:0"\r\n\t}\r\n}\r\n' > $T/prof/options.set
$M --exe mowas_2 --json | grep -q '"code":"WARN_MOWAS2_VERSION"' || fail "json mowas2 version warn"
$M --json | grep -q '"code":"MOD_MODE_CLASSIC"' || fail "json as64 mode warn"
mkdir -p "$G/mods/a b"; printf '{Mod\r\n{Name "a b"}\r\n}\r\n' > "$G/mods/a b/mod.info"
printf '{options\r\n\t{mods\r\n\t\t"a b:0"\r\n\t\t"good:0"\r\n\t}\r\n}\r\n' > "$GU/options.set"
AS2_HOME="$H" node ../modswitch.js --game $G --exe goh --json > $T/j.txt || fail "json goh"
node -e '
const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const a = j.active.map(m => m.folder + "=" + m.installed).join();
if (a !== "a b=false,good=true" || j.game !== "goh" || !j.problems.some(p => p.code === "MOD_NAME_GOH" && /"a b:0"/.test(p.msg))) throw a;
' $T/j.txt || fail "json goh name rule"
$M --json --set a 2>/dev/null; [ $? = 2 ] || fail "json with --set refused"
# lib/userdir per game (forGame, profilesFor, logDirFor; GoH inst >= 1 none)
node -e '
const u = require("../../lib/userdir"), path = require("path"), h = process.argv[1];
const o = { home: h, env: { LOCALAPPDATA: path.join(h, "AppData", "Local") } };
const g = u.forGame("goh", 0, o); if (!/Gates of Hell$/.test(g.dir) || g.kind !== "goh") throw "forGame goh " + g.dir;
if (u.forGame("goh", 1, o).dir !== null || !/GHVFS-13/.test(u.forGame("goh", 1, o).why)) throw "goh inst";
if (u.profilesFor("goh", 0, o).length !== 1 || u.profilesFor("goh", 1, o).length) throw "goh profiles";
if (u.logDirFor("goh", 0, o) !== path.join(g.dir, "log") || u.gohLogDir(o) !== path.join(g.dir, "log")) throw "goh log";
const a = u.forGame("mowas2", 1, o), b = u.forGame(null, 1, o);
if (a.dir !== b.dir || !/instance 1$/.test(a.dir) || a.kind !== "as2") throw "as2 per game " + a.dir;
if (u.profilesFor("as64", 0, o).join() !== u.profiles(0, o).join()) throw "as2 profiles";
' "$H" || fail "userdir per game"
# lib/userdir gohFind: opt.home without opt.env takes LocalAppData under that home, never this process's %LOCALAPPDATA%
mkdir -p "$T/decoy/digitalmindsoft/gates of hell" "$T/h2/AppData/Local/digitalmindsoft/gates of hell"
LOCALAPPDATA="$T/decoy" node -e '
const u = require("../../lib/userdir"), path = require("path"), h = path.resolve(process.argv[1]);
const r = u.gohFind({ platform: "win32", home: h, readReg: () => null });
if (r.dir !== path.join(h, "AppData", "Local", "digitalmindsoft", "gates of hell")) throw "home lost to LOCALAPPDATA: " + r.dir;
const e = u.gohFind({ platform: "win32", home: h, readReg: () => null, env: { LOCALAPPDATA: path.resolve(process.argv[2]) } });
if (e.dir !== path.join(path.resolve(process.argv[2]), "digitalmindsoft", "gates of hell")) throw "opt.env not kept: " + e.dir;
' "$T/h2" "$T/decoy" || fail "userdir gohFind home over LOCALAPPDATA"
rm -rf $T; echo PASS
