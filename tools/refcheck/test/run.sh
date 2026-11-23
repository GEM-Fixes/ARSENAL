#!/bin/sh
# refcheck test: seeded fixture (;@CODE markers) -> exact finding set; clean part must stay quiet
# Author: Imperator_Aug (ARSENAL, ia-1f043241)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture (CRLF), truth and outputs never touch tracked files
node mkfixture.js >/dev/null || { echo FAIL: mkfixture; exit 1; }
# the fixture is game text data: every SDL file CRLF, no bare LF
node -e "const b=require('fs').readFileSync(process.argv[1],'latin1');process.exit(/(^|[^\r])\n/.test(b)?1:0)" "$W/fx/resource/entity/ok/ok.def" || { echo "FAIL: fixture .def not CRLF"; exit 1; }
node ../refcheck.js - --folder "$W/fx" --cache "$W/fx.cache.json" -q > "$W/out.txt" 2>&1
sed -n 's/^\([^:]*\):\([0-9]*\): \([A-Z_0-9]*\) .*/\1:\2 \3/p' "$W/out.txt" | sort > "$W/got.txt"
sort "$W/truth.txt" > "$W/want.txt"
if ! diff "$W/want.txt" "$W/got.txt" > "$W/diff.txt"; then cat "$W/diff.txt"; echo FAIL; exit 1; fi
for n in shr1 shr2 shr3 shr4; do grep 'nogun_shared' "$W/out.txt" | grep -q "$n" || { echo "FAIL: shared bad ref does not name $n"; exit 1; }; done
# CHK-REF VIS-27 twin: the sound.set finding names the missing "default" + "no_such_loud", never the present "shoot loud"
L=$(grep 'SOUND_LOUDNESS_MISSING' "$W/out.txt"); case "$L" in *'"default"'*'"no_such_loud"'*) ;; *) echo "FAIL: SOUND_LOUDNESS_MISSING names"; exit 1;; esac
case "$L" in *'shoot loud'*) echo "FAIL: SOUND_LOUDNESS_MISSING names a present row"; exit 1;; esac
(sh ../../binhdr/test/rcwire.sh node ../refcheck.js - --folder "$W/fx" --cache "$W/fx.cache.json") || { echo FAIL; exit 1; }
node ../refcheck.js - --folder "$W/fx" --cache "$W/fx.cache.json" -q --format json -o "$W/fmt.json" >/dev/null 2>&1 && grep -q '"findings"\|"code"' "$W/fmt.json" || { echo "FAIL: --format json"; exit 1; }
# game parity: --exe as64|mowas_2|goh (made-up install + the fixture under goh)
node exe.js "$W" || { echo FAIL; exit 1; }
echo PASS
