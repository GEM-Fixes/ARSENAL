#!/bin/sh
# entityindex test: build over a loose fixture, cache reuse, staleness via include change, API answers (check.js)
# each run works in its own temp dir: nothing written beside the test, safe under parallel test-all
# Author: Imperator_Aug (ARSENAL, ia-eb001937)
T="$(cd "$(dirname "$0")" && pwd)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
cd "$W"
export EI_FX="$W/fx" EI_CACHE="$W/fx.cache.json"
fail() { echo "$1"; echo FAIL; exit 1; }
node "$T/mkfixture.js" || fail mkfixture
E="node $T/../entityindex.js - --folder fx --cache fx.cache.json"
$E > o1.txt || fail build1
grep -q "reused 0" o1.txt || fail "cold build should reuse nothing: $(cat o1.txt)"
$E > o2.txt || fail build2
grep -q "parsed 0, reused" o2.txt || fail "warm build should parse nothing: $(cat o2.txt)"
$E --check | grep -q "up to date" || fail "check should be up to date"
node "$T/check.js" || fail check.js
# X3: cache dir that cannot be created (under an existing FILE): run still succeeds, one stderr line, no throw
node "$T/../entityindex.js" - --folder fx --cache fx.cache.json/sub/c.json > o6.txt 2> e6.txt || fail "unwritable cache must not fail the run: $(cat e6.txt)"
grep -q "entities" o6.txt || fail "unwritable cache: no build summary: $(cat o6.txt)"
[ "$(grep -c '^cache not written (' e6.txt)" = 1 ] || fail "want exactly one 'cache not written' line: $(cat e6.txt)"
sleep 1; node "$T/mkfixture.js" edit
$E --check > o3.txt; grep -q "stale: resource/entity/a.def" o3.txt || fail "include change must make a.def stale: $(cat o3.txt)"
grep -q "stale: resource/entity/b.def" o3.txt && fail "b.def does not include p.ext"
$E > o4.txt || fail build3
grep -q "parsed 1," o4.txt || fail "only a.def should be re-parsed: $(cat o4.txt)"
$E --check | grep -q "up to date" || fail "up to date after rebuild"
for M in oldmod nomod; do
  node "$T/../entityindex.js" "$W/game" --mods $M --cache "$W/g.json" > o5.txt 2> e5.txt; rc=$?
  [ $rc -eq 3 ] || fail "--mods $M must refuse with exit 3, got $rc: $(cat o5.txt e5.txt)"
  grep -q "did not mount" e5.txt || fail "refusal text missing for $M: $(cat e5.txt)"
  [ -e "$W/g.json" ] && fail "refused run must not write a cache"
done
grep -q "MOD_VERSION" e5.txt && fail "nomod reason should be MOD_UNKNOWN"
node "$T/../entityindex.js" "$W/game" --mods oldmod --cache "$W/g.json" 2>&1 | grep -q "MOD_VERSION" || fail "oldmod reason should be MOD_VERSION"
# exe: as64 view sees as64/core, mowas_2 view does not; one cache per exe; CLI --exe
node "$T/exe.js" "$W" || fail exe.js
# game folder: a cache is tied to the folder it was built for; a fixture never overwrites the installed game's shared cache
node "$T/folder.js" "$W" || fail folder.js
# foundation (lib/vfs GoH mounts and version gate, lib/cli --exe case, lib/registry exe flags): made-up GoH and AS2 installs
node "$T/found.js" "$W" || fail found.js
# checkpoint during a build (a stopped build is resumed) and seeding a mods/folder index from vanilla.<exe>.json of the same exe
node "$T/seed.js" "$W" || fail seed.js
# stock index keyed by the game: two check-style overlays of one install share one vanilla file, the second build parses nothing;
# the as64/mowas_2 twin; a mods index on an overlay seeds from it; stock files of gone check overlays are removed
node "$T/overlay.js" "$W" || fail overlay.js
# shipped stock index (ship.js): a file of the same fingerprint is used as the cache (nothing parsed), another game's is ignored,
# a near one seeds the build; a mods index seeds from it
node "$T/ship.js" "$W" || fail ship.js
# byte memo: an included file is read once per build, the cache is the same as without it, nothing is kept after the build
node "$T/memo.js" "$W" || fail memo.js
# buildAsync: loose files read ahead of the parser, the cache is the same as build's; a failed or missing read ends as in build
node "$T/ahead.js" "$W" || fail ahead.js
echo PASS
