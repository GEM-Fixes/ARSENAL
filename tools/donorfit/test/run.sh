#!/bin/sh
# donorfit test: invented fixture, one seeded miss per key + a clean def + unresolved-include case
# Author: Imperator_Aug (ARSENAL, ia-04132b35)
cd "$(dirname "$0")/../../.." && node tools/donorfit/test/test.js
