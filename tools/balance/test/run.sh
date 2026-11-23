#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-59df12a6)
d=$(cd "$(dirname "$0")" && pwd)
w=$(mktemp -d) && w=$(cd "$w" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$w"' EXIT   # per-run work dir: parallel runs never share it
node "$d/test.js" "$w" > "$w/out.txt" 2>&1; rc=$?
# game parity (--exe as64 | mowas_2 | goh, --target) on made-up installs
node "$d/games.js" "$w/games" > "$w/games.txt" 2>&1 || rc=1
grep -v '^OK ' "$w/out.txt"; grep -v '^OK \|^PASS$' "$w/games.txt"
[ $rc -eq 0 ] && echo PASS || echo FAIL
exit $rc
