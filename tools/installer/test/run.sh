#!/bin/sh
# installer: build.js checks + the installer of this system built from a made-up payload and run into scratch (install, reinstall, uninstall)
# Author: Imperator_Aug (ARSENAL, ia-f511096a)
d=$(cd "$(dirname "$0")" && pwd)
node "$d/test.js"
