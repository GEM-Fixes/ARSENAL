#!/bin/sh
# helpcheck: every tools/<t>/<t>.js + dist/sea.js answers --help and -h with usage, exit 0, no files written (test.js header)
# Author: Imperator_Aug (ARSENAL, ia-0555ce97)
cd "$(dirname "$0")"
node test.js "$@"
