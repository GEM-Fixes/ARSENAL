#!/bin/sh
# regression: expect 8 findings on bad/ (one per truth.md line), 2 on warn/. info lines not counted
# Author: Imperator_Aug (ARSENAL, ia-fcdc2ba4)
d=$(dirname "$0")
n() { node "$d/../lnglint.js" "$1" | tail -2 | head -1 | cut -d' ' -f1; }
b=$(n "$d/bad"); w=$(n "$d/warn")
echo "bad $b/8 warn $w/2"
# vanilla compare (--game): fixture game dir with loose localization/
o=$(node "$d/../lnglint.js" "$d/vc/mod" --game "$d/vc/game")
c() { echo "$o" | grep -c "$1"; }
sh=$(c 'desc.lng:1: WARN_LNG_FILE_SHADOWS_VANILLA.*drops 1 of 5.*: desc/b$')
pm=$(c 'WARN_LNG_PARAM_MISMATCH "desc/c"'); pe=$(c 'WARN_LNG_PARAM_MISMATCH "desc/e"')
ov=$(c 'desc.lng:2: LNG_OVERRIDES_VANILLA 3 key'); ov2=$(c '#dlg.lng:2: LNG_OVERRIDES_VANILLA 1 key'); nw=$(c 'LNG_KEY_NEW 1 key')
tot=$(echo "$o" | tail -2 | head -1 | cut -d' ' -f1)
echo "vc shadow $sh param c$pm e$pe over $ov/$ov2 new $nw total $tot/3"
x=$(node "$d/../lnglint.js" "$d/vc/mod" --game "$d/vc/game" --exe mowas_2 | tail -2 | head -1 | cut -d" " -f1); echo "exe flag total $x/3"
# --no-game: no vanilla compare even with an install named (the GUI text task's child run): the 3 compare findings are gone
ng=$(node "$d/../lnglint.js" "$d/vc/mod" --game "$d/vc/game" --no-game | tail -2 | head -1 | cut -d" " -f1); echo "no-game total $ng/0"
# GLYPH: U+2013/2018/2019 are used by vanilla text and not flagged (UI-1); U+2014 still is (fixture glyph/: 1 line)
gl=$(node "$d/../lnglint.js" "$d/glyph" | grep -c 'GLYPH U+2014'); ga=$(node "$d/../lnglint.js" "$d/glyph" | grep -c 'GLYPH')
echo "glyph u2014 $gl/1 all $ga/1"
p=$(node "$d/po.test.js"); echo "$p"   # GoH .po/.pot loose and in a pak (GOHMOD-3)
g=$(node "$d/vcgoh.test.js"); echo "$g"   # GoH vanilla compare: .pot keys (msgctxt) in the base set, --exe goh (GHLOC-01, GHLOC-06)
i=$(node "$d/inc.test.js"); echo "$i"   # (include "p") expanded before keys are read (LOC-21): split mod parent + parts
[ "$i" = "inc ok" ] && [ "$g" = "vcgoh ok" ] && [ "$p" = "po ok" ] && [ "$gl" = 1 ] && [ "$ga" = 1 ] && [ "$x" = 3 ] && [ "$ng" = 0 ] && [ "$b" = 8 ] && [ "$w" = 2 ] && [ "$sh" = 1 ] && [ "$pm" = 1 ] && [ "$pe" = 1 ] && [ "$ov" = 1 ] && [ "$ov2" = 1 ] && [ "$nw" = 1 ] && [ "$tot" = 3 ] && echo PASS
