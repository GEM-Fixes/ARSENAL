#!/bin/sh
# wholedoc: house look tokens in sync with the GUI, whole-document contract on atlas, guide and engine HTML, atlas matcher
# (fixture counts, --check, seeded bad pack pages exit 2), meaning colour contrast, build-pdf.js both books. No network, no game.
# Author: Imperator_Aug (ARSENAL, ia-c78dae4d)
cd "$(dirname "$0")"
node test.js || { echo "FAIL: wholedoc"; exit 1; }
echo PASS
