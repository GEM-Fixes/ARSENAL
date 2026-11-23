#!/bin/sh
# regression: bad/ findings (file:line: CODE) must equal truth.md exactly; ok/ must have 0
# Author: Imperator_Aug (ARSENAL, ia-8d4d3f05)
d=$(dirname "$0")
G=$(mktemp -d) && G=$(cd "$G" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$G"' EXIT   # per-run scratch: two runs at once do not share files
node "$d/../uilint.js" "$d/bad" -q | grep -E '^[a-z][^ ]*: [A-Z0-9_]+ ' | cut -d' ' -f1,2 | sort > "$G/.got"
grep -vE '^#' "$d/truth.md" | sort > "$G/.want"
if cmp -s "$G/.got" "$G/.want"; then b=ok; else b=BAD; diff "$G/.got" "$G/.want"; fi
o=$(node "$d/../uilint.js" "$d/ok" -q | grep ' findings$' | cut -d' ' -f1)
echo "bad $b ok-findings $o"; rm -f "$G/.got" "$G/.want"
# CHK-MIXC: UI-18 / UI-05 seeded + clean twin (mini game dir holds stock.set only)
mb=$(node "$d/../uilint.js" "$d/mixc/bad" --game "$d/mixc/game" -q | grep -E ': WARN_(SETTINGS_SET_IGNORED|ACTION_SET_MP_MISMATCH) ' | cut -d' ' -f1,2 | sort | tr '\n' ' ')
mo=$(node "$d/../uilint.js" "$d/mixc/ok" --game "$d/mixc/game" -q | grep -cE ': WARN_(SETTINGS_SET_IGNORED|ACTION_SET_MP_MISMATCH) ')
[ "$mb" = "resource/interface/action/newact.set: WARN_ACTION_SET_MP_MISMATCH resource/interface/profiles/default/settings.set: WARN_SETTINGS_SET_IGNORED " ] && [ "$mo" = 0 ] && m=ok || m=BAD
echo "mixc $m"; [ "$m" = ok ] || b=BAD
# game parity: goh/ is invented GoH-form data (GoH item types, fortify.set actions, GoH instructions, `-tag`, key category, plant).
# --exe goh: GoH tables, only hedgehog (no hard-coded AS2 fortification in GoH) and plant (GHINT-11) are findings, medic is info;
# no --exe (AS64) and --exe mowas_2 (same AS2 tables): 13 findings, the same output
gg=$(AS2_NO_STEAM=1 GOH_GAME= node "$d/../uilint.js" "$d/goh" --exe goh |grep -E '^(info: )?[a-z][^ ]*: [A-Z0-9_]+ ' | cut -d' ' -f1-3 | sed 's/^\([a-z][^ ]*:\) \([A-Z0-9_]*\) .*/\1 \2/' | sort | tr '\n' ' ')
ga=$(node "$d/../uilint.js" "$d/goh" -q); gm=$(node "$d/../uilint.js" "$d/goh" --exe mowas_2 -q)
node "$d/../uilint.js" "$d/goh" --exe nope >/dev/null 2>&1; rc=$?
want='info: resource/interface/action/fortify.set:3: PICTURE_MISSING info: resource/interface/profiles/default/keys.set: KEYS_PROFILE_OVERRIDE info: resource/set/panel_control/right_main.set:13: PANEL_CONDITION_TAG resource/interface/action/fortify.set:10: WARN_PLANT_NOOP resource/set/panel_control/right_main.set:18: PANEL_ITEM_UNKNOWN '
# KEYS_CATEGORY_IGNORED (GHUI-251): info on the AS2 games, not on GoH
kc=$(node "$d/../uilint.js" "$d/goh" 2>/dev/null | grep -c 'keys.set:4: KEYS_CATEGORY_IGNORED'); kg=$(AS2_NO_STEAM=1 GOH_GAME= node "$d/../uilint.js" "$d/goh" --exe goh 2>/dev/null | grep -c 'KEYS_CATEGORY_IGNORED')
[ "$kc" = 1 ] && [ "$kg" = 0 ] || gg="category: as2 $kc goh $kg"
# --exe goh with no --game takes the GoH install (games.install) in folder mode too: gohgame/ (mini GoH install) makes hedgehog a known action
gd=$(cd "$d/gohgame" && { pwd -W 2>/dev/null || pwd; })
hf=$(AS2_NO_STEAM=1 GOH_GAME="$gd" node "$d/../uilint.js" "$d/goh" --exe goh -q 2>/dev/null | grep -c 'PANEL_ITEM_UNKNOWN'); [ "$hf" = 0 ] || gg="fallback: hedgehog $hf"
if [ "$gg" = "$want" ] && [ "$ga" = "$gm" ] && echo "$ga" | grep -q '^13 findings' && [ "$rc" = 2 ]; then g=ok; else g=BAD; echo "got: $gg"; echo "$ga" | tail -3; fi
echo "game $g"; [ "$g" = ok ] || b=BAD
# 0-UI-files hint follows the mods check() mounted: a folder under <GoH>/mods (install found for --exe goh) is mounted, so no
# "mount it" hint; a folder elsewhere gets it without '--game <dir>' (the install came from games.install); --vfs --exe goh with no install says so
cp -r "$d/gohgame" "$G/gi" && mkdir -p "$G/gi/mods/em" "$G/em2" && printf 'x' > "$G/gi/mods/em/mod.info" && printf 'x' > "$G/em2/mod.info"
h1=$(AS2_NO_STEAM=1 GOH_GAME="$G/gi" node "$d/../uilint.js" "$G/gi/mods/em" --exe goh -q 2>&1 >/dev/null | grep -c 'mount it')
h2=$(AS2_NO_STEAM=1 GOH_GAME="$G/gi" node "$d/../uilint.js" "$G/em2" --exe goh -q 2>&1 >/dev/null | grep -o 'mount it: .*')
h3=$(AS2_NO_STEAM=1 GOH_GAME= node "$d/../uilint.js" --vfs --exe goh 2>&1 >/dev/null | head -1); h3rc=$(AS2_NO_STEAM=1 GOH_GAME= node "$d/../uilint.js" --vfs --exe goh >/dev/null 2>&1; echo $?)
if [ "$h1" = 0 ] && [ "$h2" = 'mount it: --exe goh --mods em2' ] && [ "$h3" = 'uilint: no GoH install found (set GOH_GAME or give --game)' ] && [ "$h3rc" = 2 ]; then h=ok; else h=BAD; b=BAD; echo "hint: [$h1] [$h2] [$h3] rc $h3rc"; fi
echo "hint $h"
(cd "$d" && sh ../../binhdr/test/rcwire.sh node ../uilint.js bad) || exit 1
[ "$b" = ok ] && [ "$o" = 0 ] && echo PASS
