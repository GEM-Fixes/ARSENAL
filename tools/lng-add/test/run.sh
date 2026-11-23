#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-ccad1da7)
d=$(dirname "$0")
node "$d/test.js" && echo PASS
