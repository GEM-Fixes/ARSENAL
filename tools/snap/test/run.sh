#!/bin/sh
# seeded install: changed/added/removed loose files + reading a real zip central directory; game dir never written
# Author: Imperator_Aug (ARSENAL, ia-ad1c5f7e)
d=$(dirname "$0"); w="$d/work"; rm -rf "$w"; mkdir -p "$w/a/mods/x" "$w/b" "$w/out"
node "$d/check.js" "$w" && echo PASS; rc=$?
rm -rf "$w"; exit $rc
