#!/bin/sh
# seeded fixtures (temp dirs): renames, one-to-one, CRC rename, key counts, snap input; game dirs never written
# Author: Imperator_Aug (ARSENAL, ia-18638a2c)
d=$(dirname "$0"); w="$d/work"; rm -rf "$w"; mkdir -p "$w/a" "$w/b" "$w/out"
node "$d/check.js" "$w"; rc=$?
# game parity: made-up GoH installs (sub-folder paks, localizations/Default.pak)
mkdir -p "$w/goh"; node "$d/goh.js" "$w/goh" || rc=1
rm -rf "$w"
[ $rc = 0 ] && echo PASS || echo FAIL
exit $rc
