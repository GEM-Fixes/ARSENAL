#!/bin/sh
# shared .lintrc wiring test: rcwire.sh <tool cmd + args that yield >=1 finding>
# 1) take the first finding's code, ignore it via --rc -> 'N suppressed' line appears and findings drop
# 2) --no-rc restores the original output byte for byte  3) --format json with rc carries suppressedCount
# Author: Imperator_Aug (ARSENAL, ia-2019b6d4)
tmp=$(mktemp -d)
out=$("$@" -q) || true
code=$(echo "$out" | grep -E '^[^ ]*: [A-Z]' | head -1 | cut -d' ' -f2)
n0=$(echo "$out" | grep ' findings$' | cut -d' ' -f1)
[ -n "$code" ] && [ "${n0:-0}" -gt 0 ] || { echo "FAIL: rcwire: no finding to suppress ($*)"; rm -rf "$tmp"; exit 1; }
printf '{"ignore":[{"code":"%s","reason":"test"}]}\n' "$code" > "$tmp/.lintrc"
o2=$("$@" -q --rc "$tmp/.lintrc")
n1=$(echo "$o2" | grep ' findings$' | cut -d' ' -f1)
s1=$(echo "$o2" | grep ' suppressed$' | cut -d' ' -f1)
[ -n "$s1" ] && [ "$s1" -gt 0 ] && [ "$n1" -lt "$n0" ] || { echo "FAIL: rcwire: suppression ($* code $code: $n0 -> $n1, suppressed '$s1')"; rm -rf "$tmp"; exit 1; }
o3=$("$@" -q --no-rc --rc "$tmp/.lintrc")
[ "$o3" = "$out" ] || { echo "FAIL: rcwire: --no-rc differs ($*)"; rm -rf "$tmp"; exit 1; }
"$@" -q --rc "$tmp/.lintrc" --format json | grep -q '"suppressedCount"' || { echo "FAIL: rcwire: json suppressedCount ($*)"; rm -rf "$tmp"; exit 1; }
rm -rf "$tmp"
