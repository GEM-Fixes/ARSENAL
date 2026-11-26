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
# 1B: restore points (<mod>/.arsenal-undo) are never read by default and change nothing with --restore-points (no entity key
# lives there); read window 0 (one by one) gives the same report as the read-ahead
mkdir -p "$W/fxu/.arsenal-undo/t1" && cp -r "$W/fx/resource" "$W/fxu/" && cp -r "$W/fx/resource" "$W/fxu/.arsenal-undo/t1/"
node ../refcheck.js - --folder "$W/fxu" --cache "$W/fxu.cache.json" -q > "$W/outu.txt" 2>&1
cmp -s "$W/out.txt" "$W/outu.txt" || { diff "$W/out.txt" "$W/outu.txt" | head; echo "FAIL: .arsenal-undo changed the report"; exit 1; }
node ../refcheck.js - --folder "$W/fxu" --cache "$W/fxu.cache.json" -q --restore-points > "$W/outr.txt" 2>&1
cmp -s "$W/out.txt" "$W/outr.txt" || { echo "FAIL: --restore-points"; exit 1; }
ARSENAL_READ_WINDOW=0 node ../refcheck.js - --folder "$W/fxu" --cache "$W/fxu0.cache.json" -q > "$W/out0.txt" 2>&1
cmp -s "$W/out.txt" "$W/out0.txt" || { echo "FAIL: ARSENAL_READ_WINDOW=0"; exit 1; }
# --listing f (wouldload's scan of the folder): the same report; a file that does not read is ignored
node -e "require('../../lib/modtree').scan(process.argv[1]).then(T => require('fs').writeFileSync(process.argv[2], JSON.stringify(T)))" "$W/fxu" "$W/L.json"
node ../refcheck.js - --folder "$W/fxu" --cache "$W/fxuL.cache.json" -q --listing "$W/L.json" > "$W/outL.txt" 2>&1
cmp -s "$W/out.txt" "$W/outL.txt" || { echo "FAIL: --listing"; exit 1; }
node ../refcheck.js - --folder "$W/fxu" --cache "$W/fxuB.cache.json" -q --listing "$W/none.json" > "$W/outB.txt" 2>&1
cmp -s "$W/out.txt" "$W/outB.txt" || { echo "FAIL: --listing of a missing file"; exit 1; }
REFCHECK_TIME=1 node ../refcheck.js - --folder "$W/fxu" --cache "$W/fxu1.cache.json" -q 2>&1 >/dev/null | grep -q 'read ahead [1-9]' || { echo "FAIL: no read-ahead"; exit 1; }
# game parity: --exe as64|mowas_2|goh (made-up install + the fixture under goh)
node exe.js "$W" || { echo FAIL; exit 1; }
# file cache: slot per mod across new --cache files (overlay runs) + card1 table; same stdout as --no-file-cache after each edit
node slot.js "$W" || { echo FAIL; exit 1; }
echo PASS
