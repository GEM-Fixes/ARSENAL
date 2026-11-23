#!/bin/sh
# rzsys tests: seeded fixtures (made up), one case per rule
# Author: Imperator_Aug (ARSENAL, ia-16e7a263)
cd "$(dirname "$0")/../../.." && node tools/rzsys/test/test.js && echo PASS
