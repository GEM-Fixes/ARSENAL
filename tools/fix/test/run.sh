#!/bin/sh
# fix test: seeded fixture (loose mod, packed mod, lng replacing vanilla, 1 and 2 repoint candidates, gate refusal, source untouched)
# Author: Imperator_Aug (ARSENAL, ia-8ef09011)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fx + out.txt never touch tracked files (check.js reads TEST_WORK/fx)
node mkfixture.js "$W/fx" >/dev/null || { echo "FAIL: mkfixture"; exit 1; }
node check.js > "$W/out.txt" 2>&1
cat "$W/out.txt"
grep -q ASSERT "$W/out.txt" && { echo "FAIL: assertions"; exit 1; }
grep -q "all assertions held" "$W/out.txt" || { echo "FAIL: check.js did not finish"; exit 1; }
# TOOLFIX: staged base reads top-level paks, junction dirs/mods seen, exit codes, no-change rerun keeps the patch (temp dir, not fx/)
node toolfix.js || { echo "FAIL: toolfix"; exit 1; }
# GUI-LOC: verdict not "static clean" with crash findings left; refLeft counted after the findings line
node verdict.js || { echo "FAIL: verdict"; exit 1; }
# GOLD + RT: plan without --out, apply byte-equal to gold/expected, plan on source+patch empty, apply twice same
node gold.js "$W" || { echo "FAIL: gold"; exit 1; }
# tidy fixers (botkeys, lngdup) on text in memory
node tidy.test.js || { echo "FAIL: tidy"; exit 1; }
# as-read rules for repeated key, stray bracket, ricochet row, thunder with no sound
node asread2.test.js || { echo "FAIL: asread2"; exit 1; }
# the three games: MoW:AS2 view (no as64/core, staged without as64.exe), GoH mod.info range, folder name, .pot merge
node games.test.js || { echo "FAIL: games"; exit 1; }
echo PASS
