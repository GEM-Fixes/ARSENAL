#!/bin/sh
# regression: bad/ (+bad2/ with test/vocab-mini.json) findings (file:line: CODE) must equal truth.md exactly; ok/ must have 0
# Author: Imperator_Aug (ARSENAL, ia-04f24eac)
d=$(dirname "$0")
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
{ node "$d/../keylint.js" "$d/bad" -q | grep -E '^[.a-z][^ ]*: [A-Z_]+ ' | cut -d' ' -f1,2
  node "$d/../keylint.js" "$d/bad2" --vocab "$d/vocab-mini.json" -q | grep -E '^[a-z][^ ]*: [A-Z_]+ ' | cut -d' ' -f1,2 | sed 's/^/bad2: /'
} | sort > "$G/.got"
grep -vE '^#' "$d/truth.md" | sort > "$G/.want"
if cmp -s "$G/.got" "$G/.want"; then b=ok; else b=BAD; diff "$G/.got" "$G/.want"; fi
o=$(node "$d/../keylint.js" "$d/ok" -q | grep ' findings$' | cut -d' ' -f1)
p=$(node "$d/pick.js")   # GoH exe in the game dir picks vocab.goh.json; AS2/no dir does not; explicit --vocab wins
k=$(node "$d/pak.test.js")   # GoH pak mod outside <game>/mods read through its paks; AS2 dir unchanged (GOHMOD-3)
bl=$(node "$d/blow.test.js")   # set/blow keys judged against  (TOOLFIX-MIX)
ex=$(node "$d/exe.test.js")   # --exe: mowas_2 mount without as64/core, vocab.mowas2.json, GoH field table fields.goh.json
# DET-KEY: same input twice -> same stdout bytes (no clock value in default output; elapsed ms only with --time)
node "$d/../keylint.js" "$d/bad" > "$G/.run1"; node "$d/../keylint.js" "$d/bad" > "$G/.run2"
if [ -s "$G/.run1" ] && cmp -s "$G/.run1" "$G/.run2" && ! grep -qE ' in [0-9]+ ms$' "$G/.run1"; then t=TWICE-OK; else t=TWICE-BAD; diff "$G/.run1" "$G/.run2" | head -5; fi
echo "bad $b ok-findings $o $p $k $bl $ex $t"; rm -f "$G/.got" "$G/.want" "$G/.run1" "$G/.run2"
[ "$b" = ok ] && [ "$o" = 0 ] && [ "$p" = PICK-OK ] && [ "$k" = PAK-OK ] && [ "$bl" = BLOW-OK ] && [ "$ex" = EXE-OK ] && [ "$t" = TWICE-OK ] && echo PASS
