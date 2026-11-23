#!/bin/sh
# armorsim test: pen.js hand-computed engine cases + armordata on a synthetic folder (temp dir)
#   then after.test.js: after / effects / origin + tools/iasim (engine events, scripts, mod over vanilla)
#   then sim.test.js: table/shot/map/edit + CLI on a synthetic game + mod tree (temp dir, or $ARMORSIM_SCRATCH)
#   then blast.test.js: blast.js (fall-off, once per part, wounds, parts) + the shell's own burst in after.js
#   then groups.test.js: effects causes / groups / jets / fires / origin layer + rel (also run by tools/iasim/test)
#   then modpak.test.js: a mod folder's own paks over the game in mount order; its HEAT shell listed, resolved, jet flown
#   then ground.test.js: ray.ground (RULES 49): the shell ends and bursts on the ground, CLI --ground, the GUI routes' ground field
#   then exe.test.js: --exe (as64 / mowas_2 view of one install, GoH refused) for armordata, sim, edit, the CLI and shottable
#   then goh.test.js: goh.js, GoH's own armour rules (formulas, shells, shot, map, part HP, refusals) on a synthetic GoH folder
# Author: Imperator_Aug (ARSENAL, ia-54076cf4)
cd "$(dirname "$0")"
node test.js > out.txt 2>&1
st=$?
node sim.test.js >> out.txt 2>&1
st2=$?
node after.test.js >> out.txt 2>&1
st3=$?
node blast.test.js >> out.txt 2>&1
st4=$?
node groups.test.js >> out.txt 2>&1
st5=$?
node modpak.test.js >> out.txt 2>&1
st6=$?
node exe.test.js >> out.txt 2>&1
st7=$?
node ground.test.js >> out.txt 2>&1
st8=$?
node goh.test.js >> out.txt 2>&1
st9=$?
cat out.txt
if [ $st -ne 0 ] || [ $st2 -ne 0 ] || [ $st3 -ne 0 ] || [ $st4 -ne 0 ] || [ $st5 -ne 0 ] || [ $st6 -ne 0 ] || [ $st7 -ne 0 ] || [ $st8 -ne 0 ] || [ $st9 -ne 0 ]; then echo FAIL; exit 1; fi
echo PASS
