#!/bin/sh
# regression: fixture findings (file:line: CODE) must equal truth.md; ok.mdl clean; info-only codes (LOD_LINKED, mirror) hidden by -q
# Author: Imperator_Aug (ARSENAL, ia-7ec744a7)
cd "$(dirname "$0")" || exit 1
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node mkfixture.js || { echo FAIL: mkfixture; exit 1; }
node ../expcheck.js fixture/game --mods m1 -q | grep -E '^[a-z][^ ]*: [A-Z_]+ ' | cut -d' ' -f1,2 | sort > "$G/.got"
grep -vE '^#' truth.md | sort > "$G/.want"
if cmp -s "$G/.got" "$G/.want"; then echo "fixture ok"; else diff "$G/.got" "$G/.want"; rm -f "$G/.got" "$G/.want"; echo FAIL; exit 1; fi
rm -f "$G/.got" "$G/.want"
node ../expcheck.js fixture/game --mods m1 | grep -q 'WARN_EXP_LOD_LINKED' && node ../expcheck.js fixture/game --mods m1 | grep -q 'nc.vol.*WARN_EXP_VOL_CONVEX' || { echo "FAIL: LOD/convex info missing"; exit 1; }
node ../expcheck.js fixture/game --mods m1 -q | grep -q 'ok.mdl' && { echo "FAIL: ok.mdl flagged"; exit 1; }
(sh ../../binhdr/test/rcwire.sh node ../expcheck.js fixture/game --mods m1) || exit 1
node exe.js || { echo "FAIL: --exe branches (exe.js)"; exit 1; }
node exedata.js ../expcheck.js fixture/game/mods/m1 --no-rc || { echo "FAIL: --exe reaches the data (exedata.js)"; exit 1; }
echo PASS
