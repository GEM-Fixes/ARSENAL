#!/bin/sh
# newmod regression (cases in truth.md)
# Author: Imperator_Aug (ARSENAL, ia-f1cf8ad4)
d=$(cd "$(dirname "$0")" && pwd); t="$d/../newmod.js"
w=$(mktemp -d) && w=$(cd "$w" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$w"' EXIT   # per-run work dir, never test/work
rm -rf "$w"; mkdir -p "$w"
fail() { echo "FAIL: $1"; exit 1; }
# 1 create: 0 findings, files present
out=$(node "$t" "$w/my mod" --name "My Mod" --lang english,russian) || fail "create"   # GX S11: the space in the folder name becomes an underscore
echo "$out" | grep -q '^note: mod folder name "my mod" became "my_mod"' || { echo "$out"; fail "1 rename note"; }
[ -e "$w/my mod" ] && fail "1 folder with a space made"
echo "$out" | grep -q '^0 findings$' || { echo "$out"; fail "1 not clean"; }
for f in mod.info readme.txt .gitignore "localization/#my_mod.lng" resource/entity resource/set resource/interface; do [ -e "$w/my_mod/$f" ] || fail "1 missing $f"; done
# 2 mod.info bytes: CRLF, expected keys
grep -q 'Name "My Mod"' "$w/my_mod/mod.info" || fail "2 name"
# T-SURFACE: default target is as64 (Min 3.301, no Max); --target mowas2 keeps the 3.262.x range
grep -q 'MinGameVersion "3.301"' "$w/my_mod/mod.info" && ! grep -q MaxGameVersion "$w/my_mod/mod.info" || fail "2 default as64 range"
grep -q 'for as64' "$w/my_mod/readme.txt" || fail "2 readme as64"
node "$t" "$w/old" --name Old --target mowas2 >/dev/null; grep -q 'MinGameVersion "3.262.0"' "$w/old/mod.info" && grep -q 'MaxGameVersion "3.262.1"' "$w/old/mod.info" || fail "2 mowas2 range"
for f in mod.info "localization/#my_mod.lng"; do node -e "const b=require('fs').readFileSync(process.argv[1],'latin1');process.exit(/(^|[^\r])\n/.test(b)?1:0)" "$w/my_mod/$f" || fail "2 LF in $f"; done
# 1x GX S11: unsafe characters refused (exit 2, one plain line, nothing written); dry run says the new name too
node "$t" "$w/bad?name" --name X > "$w/bad.txt" 2>&1; [ $? = 2 ] || fail "1x bad char not refused"
grep -q "has characters a folder cannot have" "$w/bad.txt" || fail "1x bad char message"
node "$t" "$w/dry run" --name X --dry-run | grep -q 'became "dry_run"' || fail "1x dry note"
[ -e "$w/dry_run" ] && fail "1x dry wrote"
# 3 refuse non-empty
node "$t" "$w/my_mod" --name X >/dev/null 2>&1 && fail "3 non-empty not refused"
# 4 empty existing dir ok; deps + cyrillic name written UTF-8 (ENCFIX)
mkdir "$w/emp"
out=$(node "$t" "$w/emp" --name "Мод" --deps nothere) || fail "4 create"
echo "$out" | grep -q 'SELFCHECK_MODINFO.*REQ_MISSING' || { echo "$out"; fail "4 REQ_MISSING not surfaced"; }
node -e "const b=require('fs').readFileSync(process.argv[1]);process.exit(b.includes(Buffer.from('Мод','utf8'))&&!b.includes(Buffer.from([0xCC,0xEE,0xE4]))?0:1)" "$w/emp/mod.info" || fail "4 utf8"
# 5 any Unicode name is written UTF-8 (« » and CJK were '?' or refused under cp1251)
node "$t" "$w/uni2" --name "$(node -e 'process.stdout.write("a中«»")')" >/dev/null 2>&1 || fail "5 refused"
node -e "const b=require('fs').readFileSync(process.argv[1]);process.exit(b.includes(Buffer.from('a中«»','utf8'))?0:1)" "$w/uni2/mod.info" || fail "5 not utf8"
# 6 dry-run writes nothing
node "$t" "$w/dry" --name D --dry-run >/dev/null || fail "6"
[ -e "$w/dry" ] && fail "6 wrote"
# 7 missing --name -> usage exit 2
node "$t" "$w/x" >/dev/null 2>&1 && fail "7"
# 8 lng-add into the new mod keeps lnglint clean
node "$d/../../lng-add/lng-add.js" "$w/my_mod" --file '#my_mod.lng' --key desc/entity/zz --text 'ZZ' -q | tail -1 | grep -q '^0 findings$' || fail "8 lng-add"
node "$d/../../lnglint/lnglint.js" "$w/my_mod" -q | grep -q '^0 findings$' || fail "8 lint"
# 9 --target: as64 no max, goh the given version, bad target refused
node "$t" "$w/t64" --name T --target as64 >/dev/null; grep -q 'MinGameVersion "3.301"' "$w/t64/mod.info" && ! grep -q MaxGameVersion "$w/t64/mod.info" || fail "9 as64"
node "$t" "$w/tgoh" --name T --target goh --game-version 1.067 >/dev/null; grep -q 'MinGameVersion "1.067"' "$w/tgoh/mod.info" && grep -q 'MaxGameVersion "1.067"' "$w/tgoh/mod.info" || fail "9 goh"
node "$t" "$w/tx" --name T --target nope >/dev/null 2>&1 && fail "9 bad"
# 9g game parity, GoH: text in localizations/default/interface/text/<slug>.pot (GHVFS-04, GHLOC-01/06), no root localization/,
#   self-check modinfo --goh clean, GHVFS-27 folder name rule
out=$(node "$t" "$w/tgoh" --name T --target goh --game-version 1.067 2>&1); echo "$out" | grep -q '^0 findings$' 2>/dev/null
[ -d "$w/tgoh/localization" ] && fail "9g root localization/ made for goh"
[ -f "$w/tgoh/localizations/default/interface/text/tgoh.pot" ] || fail "9g pot missing"
head -3 "$w/tgoh/localizations/default/interface/text/tgoh.pot" | tr -d '\r' | tr '\n' '|' | grep -q '^#, fuzzy|msgid ""|msgstr ""|$' || fail "9g pot header"
node -e "const b=require('fs').readFileSync(process.argv[1],'latin1');process.exit(/(^|[^\r])\n/.test(b)?1:0)" "$w/tgoh/localizations/default/interface/text/tgoh.pot" || fail "9g pot CRLF"
out=$(node "$t" "$w/tgoh2" --name 'G "q"' --target goh --game-version 1.067) || fail "9g create"
echo "$out" | grep -q '^0 findings$' || { echo "$out"; fail "9g self-check not clean"; }
node "$t" "$w/my-goh" --name X --target goh --game-version 1.067 > "$w/r.txt" 2>&1; [ $? = 2 ] || fail "9g dash name not refused"
grep -q 'GHVFS-27' "$w/r.txt" && grep -q 'e.g. my_goh' "$w/r.txt" || { cat "$w/r.txt"; fail "9g name message"; }
[ -e "$w/my-goh" ] && fail "9g refused name written"
node "$t" "$w/my-as2" --name X --target mowas2 >/dev/null || fail "9g dash name still fine on AS2"
node "$t" "$w/gdry" --name X --target goh --game-version 1.067 --dry-run | grep -q '^dir  localizations/default/interface/text$' || fail "9g dry dirs"
# 10 --deps as64+ writes the as64 range (TOOLFIX-MIX); lib/vfs must not report MOD_MODE for [as64+,mod]
node "$t" "$w/dp" --name DP --deps as64+ >/dev/null; grep -q 'MinGameVersion "3.301"' "$w/dp/mod.info" && ! grep -q MaxGameVersion "$w/dp/mod.info" || fail "10 as64+ range"
node "$t" "$w/dp2" --name DP --deps as64+ --target mowas2 >/dev/null; grep -q 'MaxGameVersion "3.262.1"' "$w/dp2/mod.info" || fail "10 explicit target kept"
# 11 writeguard + input (I-7, I-15..I-17, I-26, I-27): game resource/ and GoH by content, reserved and long names, newline desc, bad deps, bad game, parents made
mkdir -p "$w/fg/resource" "$w/fg/mods" "$w/goh/binaries/x64"; : > "$w/fg/as64.exe"; : > "$w/goh/binaries/x64/call_to_arms.exe"
for p in "$w/fg/resource/inner" "$w/goh/resource/m" "$w/steamapps/workshop/content/1/m"; do node "$t" "$p" --name X > "$w/r.txt" 2>&1; [ $? = 2 ] || fail "11 not refused $p"; grep -q "refused: ARSENAL will not make the new mod" "$w/r.txt" || { cat "$w/r.txt"; fail "11 message $p"; }; [ -e "$p" ] && fail "11 wrote $p"; done
node "$t" "$w/fg/mods/okmod" --name X --game "$w/fg" >/dev/null || fail "11 game/mods/new refused"
for n in con AUX nul.txt COM1; do node "$t" "$w/$n" --name X > "$w/r.txt" 2>&1; [ $? = 2 ] || fail "11 reserved $n"; grep -q "Windows keeps for itself" "$w/r.txt" || fail "11 reserved msg $n"; done
node "$t" "$w/$(node -e 'process.stdout.write("a".repeat(150))')" --name X > "$w/r.txt" 2>&1; [ $? = 2 ] && grep -q "characters long" "$w/r.txt" || fail "11 long folder"
node "$t" "$w/ln" --name X --desc "$(printf 'line1
line2 "q"')" >/dev/null || fail "11 newline desc"
grep -q "Desc \"line1 line2 'q'\"" "$w/ln/mod.info" || { cat "$w/ln/mod.info"; fail "11 desc not one clean line"; }
node "$t" "$w/dps" --name X --deps "a,b;c" > "$w/r.txt" 2>&1; [ $? = 2 ] && grep -q 'dependency "b;c"' "$w/r.txt" || fail "11 deps ;"
node "$t" "$w/lt" --name "$(node -e 'process.stdout.write("n".repeat(5000))')" > "$w/r.txt" 2>&1; [ $? = 2 ] || fail "11 long title"
node "$t" "$w/bg" --name X --game "$w/nothere" > "$w/r.txt" 2>&1; [ $? = 2 ] && grep -q "does not exist" "$w/r.txt" || fail "11 bad game"
node "$t" "$w/deep/er/m1" --name X | grep -q WARN_PARENT_MADE || fail "11 parent warn"
echo PASS
