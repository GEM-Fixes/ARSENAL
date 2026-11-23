#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-87928c22)
d=$(dirname "$0")
w=$(mktemp -d) && w=$(cd "$w" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$w"' EXIT   # per-run work dir, not test/work: parallel runs never share it
node "$d/check.js" "$w" && node "$d/warn.js" "$w/warn" && node "$d/carry.js" "$w/carry" && node "$d/chain.js" "$w/chain" && node "$d/randsync.js" "$w/randsync" && node "$d/gold.js" "$w/gold" && node "$d/gx.js" "$w/gx" && echo PASS
