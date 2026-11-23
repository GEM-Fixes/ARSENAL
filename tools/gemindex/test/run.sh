#!/bin/sh
# gemindex regression: made-up fixture (mkfixture.js), plus the real index counts when it is present locally;
# then the scraper against a local 127.0.0.1 fixture server only (test-scrape.js; test mode refuses any other host)
# Author: Imperator_Aug (ARSENAL, ia-e6198f3f)
d=$(cd "$(dirname "$0")" && pwd)
w=$(mktemp -d) && w=$(cd "$w" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$w"' EXIT
node "$d/test.js" "$w/t" || { echo "FAIL: gemindex"; exit 1; }
node "$d/test-history.js" "$w/h" || { echo "FAIL: gemindex history"; exit 1; }
node "$d/test-scrape.js" "$w/s" || { echo "FAIL: gemindex scrape"; exit 1; }
node "$d/test-parts.js" "$w/p" || { echo "FAIL: gemindex parts"; exit 1; }
echo "PASS"
