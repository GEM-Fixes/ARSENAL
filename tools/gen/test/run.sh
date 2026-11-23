#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-b93ee654)
d=$(cd "$(dirname "$0")" && pwd)
w=$(mktemp -d) && w=$(cd "$w" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$w"' EXIT   # per-run work dir, not test/work: parallel runs never share it
node "$d/mkfixture.js" "$w" >/dev/null || { echo "FAIL: fixture"; exit 1; }
node "$d/check.js" "$w" > "$w/out.txt" 2>&1; rc=$?
grep -v '^OK ' "$w/out.txt"
node "$d/gold.js" "$w" > "$w/gold.txt" 2>&1; rg=$?   # gold-update.txt holding 1 makes it rewrite test/gold/ (review the diff, set it back to 0)
grep -v '^OK ' "$w/gold.txt"
node "$d/spec.js" "$w" > "$w/spec.txt" 2>&1; rs=$?   # GEN-SPEC: schema drift, samples pass --check-spec, seeded bad specs (no game needed)
grep -v '^OK ' "$w/spec.txt"
node "$d/describe.js" "$w" > "$w/desc.txt" 2>&1; rd=$?   # GEN-DESCRIBE: words -> spec, vet, AI path against a local stand-in (no game, no network)
grep -v '^OK ' "$w/desc.txt"
node "$d/ops-unit.js" "$w" > "$w/unit.txt" 2>&1; ru=$?   # GEN-OPS-UNIT: iblock macro preset army kit, card list, breed del/decl, squad block/order/remove (own fixture)
grep -v '^OK ' "$w/unit.txt"
node "$d/ops-asset.js" "$w" > "$w/asset.txt" 2>&1; ra=$?   # GEN-OPS-ASSET: gun class fields, shell item sound soundclass voice skin stuffmodel mapinfo (own fixture)
grep -v '^OK ' "$w/asset.txt"
node "$d/fix2.js" "$w" > "$w/fix2.txt" 2>&1; rf=$?   # GEN-FIX2: roster new army, weapon outside gun/, set add, plan clone, shell tags/damage, no_bots, voice resample, burst seconds, task-path wrecks (own fixture)
grep -v '^OK ' "$w/fix2.txt"
node "$d/fix3.js" "$w" > "$w/fix3.txt" 2>&1; rf3=$?   # GEN-FIX3: #dlg_mp text, preset add, card/roster tags+flags, squad change, veterancy rename, mission/map-clone files in --plan (own fixture)
grep -v '^OK ' "$w/fix3.txt" | grep -v '^fix3: all ok$'
node "$d/armyprice.js" "$w" > "$w/ap.txt" 2>&1; rp=$?   # GEN-FIX2: units army price on every stock army of the real game, plan (SKIP without the game)
grep -v '^OK ' "$w/ap.txt"
node "$d/parity.js" "$w" > "$w/par.txt" 2>&1; rq=$?   # game parity: mowas2 vfs/--exe, GoH gun shell item soundclass weapon, AS2-only stops, describe on GoH (own fixture)
grep -v '^OK ' "$w/par.txt" | grep -v '^parity: all ok$'
[ $rq -eq 0 ] || rc=1
[ $rc -eq 0 ] && [ $rg -eq 0 ] && [ $rs -eq 0 ] && [ $rd -eq 0 ] && [ $ru -eq 0 ] && [ $ra -eq 0 ] && [ $rp -eq 0 ] && [ $rf -eq 0 ] && [ $rf3 -eq 0 ] && echo PASS || echo FAIL
[ $rg -eq 0 ] || rc=1
[ $rs -eq 0 ] || rc=1
[ $rd -eq 0 ] || rc=1
[ $ru -eq 0 ] || rc=1
[ $ra -eq 0 ] || rc=1
[ $rp -eq 0 ] || rc=1
[ $rf -eq 0 ] || rc=1
[ $rf3 -eq 0 ] || rc=1
exit $rc
