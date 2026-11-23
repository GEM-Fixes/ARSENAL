#!/bin/sh
# mapscen: seeded fake map + GoH defs built in code; counts, class by folder, as64 same/near/no, variants, coverage
# Author: Imperator_Aug (ARSENAL, ia-708ed0d5)
cd "$(dirname "$0")/../../.." || exit 1
node tools/mapscen/test.js
