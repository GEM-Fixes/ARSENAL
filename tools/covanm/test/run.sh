#!/bin/sh
# covanm test: one vanilla .anm edited through the GEM2 add-on, render compare. Skips without Blender or without the add-on (COVANM_ADDON).
# Author: Imperator_Aug (ARSENAL, ia-63ef70a8)
cd "$(dirname "$0")/../../.."
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node tools/covanm/test/test.js > "$G/.games" 2>&1 || { tail -n 8 "$G/.games"; echo FAIL; exit 1; }   # games (--exe, --parse), no Blender
if ! node -e "process.exit(require('./tools/lib/platform').findBlender() ? 0 : 1)"; then echo "PASS (no Blender, skipped)"; exit 0; fi
node tools/covanm/covanm.js --check-addon > /dev/null || { echo "SKIP: GEM2 Blender add-on not found; set COVANM_ADDON to the gem2_engine_tools folder"; exit 0; }
node tools/covanm/covanm.js --case rigid > "$G/.got" 2>&1 || { tail -n 8 "$G/.got"; rm -f "$G/.got"; echo FAIL; exit 1; }
grep -q PASS "$G/.got" || { tail -n 8 "$G/.got"; rm -f "$G/.got"; echo FAIL; exit 1; }
rm -f "$G/.got"
echo PASS
