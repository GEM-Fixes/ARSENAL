#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-97eb8a1e)
cd "$(dirname "$0")"
node mkfixture.js
out=$(node ../modinfo.js fixture/mods)
echo "$out"
echo "$out" | tail -1 | grep -qx "19 findings" || { echo "FAIL: expected 19 findings"; exit 1; }
# VFS-59: seeded modern_future (Min 3.302) fires VER_CRASH; clean twin modern_ok (Min 3.301) and legacy mods do not
[ "$(echo "$out" | grep -c ' VER_CRASH ')" = 1 ] && echo "$out" | grep -q 'modern_future/mod.info:4: VER_CRASH' || { echo "FAIL: VER_CRASH seeded"; exit 1; }
echo "$out" | grep -v '^info:' | grep -q 'mods/ok/mod.info' && { echo "FAIL: ok flagged"; exit 1; }
echo "$out" | grep -q 'parse_quote/mod.info:3: MODINFO_PARSE' || { echo "FAIL: parse_quote"; exit 1; }
echo "$out" | grep -v '^info:' | grep -q 'modern_ok' && { echo "FAIL: modern_ok flagged"; exit 1; }
all=$(node ../modinfo.js --all fixture/mods -q)
echo "$all" | tail -1 | grep -qx "6 findings" || { echo "FAIL: --all expected 6 fatal (3 SYNTAX,2 MODINFO_PARSE,1 ENC_BOM)"; echo "$all"; exit 1; }
g=$(node ../modinfo.js fixture/mods/ok --game-version 1.066)
echo "$g" | grep -q 'GoH 1.066 < minGameVersion' || { echo "FAIL: --game 1.066 on a 3.262 mod gave no VER_RANGE"; echo "$g"; exit 1; }
g=$(node ../modinfo.js fixture/mods/ok --game-version 3.262)
echo "$g" | grep -q 'VER_RANGE' && { echo "FAIL: --game 3.262 flagged ok"; exit 1; }
# GoH mod.info (template form): tags key known, Max absent = open bound (info), 0 findings
t=$(mktemp -d); mkdir -p "$t/gm"
printf '{mod\r\n\t{name "gm"}\r\n\t{tags "no_delete"}\r\n\t{desc "x"}\r\n\t{minGameVersion "1.060"}\r\n}\r\n' > "$t/gm/mod.info"
g=$(node ../modinfo.js "$t/gm" --goh --game-version 1.067)
echo "$g" | tail -1 | grep -qx "0 findings" && echo "$g" | grep -q WARN_GOH_OPEN_BOUND || { echo "FAIL: GoH mod.info"; echo "$g"; rm -rf "$t"; exit 1; }
g=$(node ../modinfo.js "$t/gm")
echo "$g" | grep -q 'UNKNOWN_KEY unknown key "tags"' || { echo "FAIL: AS2 must still flag tags"; echo "$g"; rm -rf "$t"; exit 1; }
# game parity: --exe goh = GoH rules; develop tag lifts the version check (GHVFS-02); --exe mowas_2 = legacy range for a modern mod
printf '{mod\r\n\t{name "gd"}\r\n\t{tags "develop"}\r\n\t{minGameVersion "1.900"}\r\n\t{maxGameVersion "1.900"}\r\n}\r\n' > "$t/gm/mod.info"
g=$(node ../modinfo.js "$t/gm" --exe goh --game-version 1.067)
echo "$g" | grep -q GOH_DEVELOP && echo "$g" | tail -1 | grep -qx "0 findings" || { echo "FAIL: GoH develop tag"; echo "$g"; rm -rf "$t"; exit 1; }
printf '{mod\r\n\t{name "gd"}\r\n\t{minGameVersion "1.900"}\r\n}\r\n' > "$t/gm/mod.info"
node ../modinfo.js "$t/gm" --exe goh --game-version 1.067 | grep -q 'VER_RANGE' || { echo "FAIL: --exe goh range"; rm -rf "$t"; exit 1; }
# GoH: no bounds at all = open (vfs/goh-modinfo-version-rule [V]), not VER_MISSING; {priority N} known, a word is flagged
printf '{mod\r\n\t{name "gm"}\r\n\t{priority 3}\r\n}\r\n' > "$t/gm/mod.info"
g=$(node ../modinfo.js "$t/gm" --exe goh --game-version 1.067)
echo "$g" | tail -1 | grep -qx "0 findings" && echo "$g" | grep -q 'WARN_GOH_OPEN_BOUND' || { echo "FAIL: GoH no bounds / priority"; echo "$g"; rm -rf "$t"; exit 1; }
printf '{mod\r\n\t{name "gm"}\r\n\t{priority "high"}\r\n}\r\n' > "$t/gm/mod.info"
node ../modinfo.js "$t/gm" --exe goh --game-version 1.067 | grep -q 'WARN_GOH_PRIORITY' || { echo "FAIL: GoH bad priority"; rm -rf "$t"; exit 1; }
node ../modinfo.js "$t/gm" | grep -q 'UNKNOWN_KEY unknown key "priority"' || { echo "FAIL: AS2 must still flag priority"; rm -rf "$t"; exit 1; }
# a GoH 1.x range under the AS2 rules: VER_RANGE says to check it with --exe goh; with --exe goh at 1.067 it is clean
printf '{mod\r\n\t{name "gm"}\r\n\t{minGameVersion "1.067"}\r\n\t{maxGameVersion "1.067"}\r\n}\r\n' > "$t/gm/mod.info"
node ../modinfo.js "$t/gm" | grep -q 'VER_RANGE .*check it with --exe goh' || { echo "FAIL: GoH range hint"; rm -rf "$t"; exit 1; }
node ../modinfo.js "$t/gm" --exe goh --game-version 1.067 | tail -1 | grep -qx "0 findings" || { echo "FAIL: GoH 1.067 range"; rm -rf "$t"; exit 1; }
g=$(node ../modinfo.js fixture/mods/modern_ok --exe mowas_2)
echo "$g" | grep -q 'VER_RANGE' && echo "$g" | grep -q 'VER_MISSING' || { echo "FAIL: mowas_2 modern mod"; echo "$g"; rm -rf "$t"; exit 1; }
g=$(node ../modinfo.js fixture/mods/modern_ok --exe as64)
echo "$g" | grep -v '^info:' | grep -q 'VER_' && { echo "FAIL: as64 modern mod flagged"; rm -rf "$t"; exit 1; }
node ../modinfo.js fixture/mods/ok --exe mowas2 | tail -1 | grep -qx "0 findings" || { echo "FAIL: mowas2 legacy ok"; rm -rf "$t"; exit 1; }
rm -rf "$t"
echo PASS
