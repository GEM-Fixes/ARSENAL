#!/bin/sh
# dist: SEA exe parity with node + action steps run locally -> valid merged SARIF
# Author: Imperator_Aug (ARSENAL, ia-21b87056)
d=$(cd "$(dirname "$0")" && pwd); t="$d/../.."; w="$d/work"
rm -rf "$w"; mkdir -p "$w/repo/mymod/resource/entity/x" "$w/tmp"
fail() { echo "FAIL: $1"; exit 1; }
printf '{a1 # comment}\r\n{a2 (mod "bogus" 1)}\r\n' > "$w/repo/mymod/resource/entity/x/x.def"
# 1 SEA build + parity
node "$t/dist/sea.js" --out "$w/out" >/dev/null || fail "1 build"
exe="$w/out/ARSENAL.exe"; [ -f "$exe" ] || exe="$w/out/ARSENAL"; [ -f "$exe" ] || fail "1 no exe"
node -e "const m=require(process.argv[1]);const b=m.filter(k=>/(^|\/)(REPORT\.json|_retired|test|cache)(\/|$)/.test(k));if(b.length||!m.includes('INDEX.md')){console.log(b.join(' '));process.exit(1)}" "$w/out/manifest.json" || fail "1 manifest embeds dev/private files"
node "$t/as2/as2.js" help > "$w/h.node"; "$exe" help > "$w/h.exe" || fail "1 help rc"
cmp -s "$w/h.node" "$w/h.exe" || { diff "$w/h.node" "$w/h.exe" | head -5; fail "1 help differs"; }
node "$t/as2/as2.js" sdllint "$w/repo/mymod" > "$w/s.node" 2>/dev/null; rn=$?
"$exe" sdllint "$w/repo/mymod" > "$w/s.exe" 2>/dev/null; re=$?
[ $rn = $re ] || fail "1 rc differs"
sed -i "s/ in [0-9]* ms//" "$w/s.node" "$w/s.exe"; cmp -s "$w/s.node" "$w/s.exe" || { diff "$w/s.node" "$w/s.exe" | head -5; fail "1 sdllint differs"; }
grep -q 'HASH_COMMENT' "$w/s.exe" || fail "1 fixture finds nothing"
"$exe" nope >/dev/null 2>&1; [ $? = 2 ] || fail "1 unknown rc"
"$exe" q Foo >/dev/null 2>&1; [ $? = 2 ] || fail "1 dev tool rc"
# L7-CLEAN: prove --plan reads an embedded .set; `ARSENAL game` runs in the exe (no spawn)
grep -q 'testrun/scenarios/mods/mis-08/resource/set/multiplayer/games/combat.set' "$w/out/manifest.json" || fail "1 prove stock combat.set not embedded"
"$exe" game --game "$w/repo" > "$w/g.exe" 2>&1 || { cat "$w/g.exe"; fail "1 game rc in exe"; }
grep -qF "(arg)" "$w/g.exe" || { cat "$w/g.exe"; fail "1 game output"; }
"$exe" status >"$w/st.exe" 2>&1; [ $? = 1 ] || fail "1 status rc (no plan/ in exe must exit 1)"
grep -q 'ARSENAL status: no plan/PLAN.md' "$w/st.exe" || fail "1 status message"
printf '# P\n\n## Milestones\n\n| name | pass test | state |\n|---|---|---|\n| M1 | it runs | done |\n' > "$w/PLAN.md"
node "$t/as2/as2.js" status --plan "$w/PLAN.md" > "$w/p.node"; "$exe" status --plan "$w/PLAN.md" > "$w/p.exe" || fail "1 status --plan rc"
cmp -s "$w/p.node" "$w/p.exe" || fail "1 status --plan differs"
grep -q '^M1' "$w/p.exe" || fail "1 status shows no milestone"
# HELPFIX: every front-door tool answers --help in the exe too (exit 0, "usage: ARSENAL <tool>")
node "$t/as2/test/helpdoor.js" "$exe" > "$w/helpdoor.txt" || { cat "$w/helpdoor.txt"; fail "1 helpdoor in exe"; }
# 2 yaml structure
node "$d/yamlcheck.js" "$t/dist/action/action.yml" --runs "$w/steps" || fail "2 action.yml"
node "$d/yamlcheck.js" "$t/dist/action/example-workflow.yml" || fail "2 workflow"
node "$d/yamlcheck.js" "$t/dist/ci/test.yml" || fail "2 ci/test.yml"
# 3 run the action's shell step locally (expressions substituted)
ap=$(cd "$t/dist/action" && pwd)
sed -e "s#\${{ github.action_path }}#$ap#g" -e 's#\${{ inputs.path }}#mymod#g' -e 's#\${{ inputs.tools }}#sdllint keylint#g' -e 's#\${{ inputs.fail-on }}#error#g' "$w/steps/run1.sh" > "$w/step.sh"
grep -q '\${{' "$w/step.sh" && fail "3 unsubstituted expr"
(cd "$w/repo" && RUNNER_TEMP="$w/tmp" GITHUB_OUTPUT="$w/gho" bash "$w/step.sh" >"$w/step.out" 2>"$w/step.err"); rc=$?
[ $rc = 1 ] || { cat "$w/step.err"; fail "3 expected rc 1 on ERROR findings, got $rc"; }
grep -q '^sarif=' "$w/gho" || fail "3 output"
node "$d/check-sarif.js" "$w/tmp/as2-sarif/merged.sarif" 1 mymod || fail "3 sarif"
# 4 fail-on none passes; clean folder passes
sed -e 's#--fail-on "error"#--fail-on "none"#' "$w/step.sh" > "$w/step2.sh"
(cd "$w/repo" && RUNNER_TEMP="$w/tmp" bash "$w/step2.sh" >/dev/null 2>&1) || fail "4 fail-on none"
mkdir -p "$w/repo/clean"; sed -e 's#mymod#clean#g' "$w/step.sh" > "$w/step3.sh"
(cd "$w/repo" && RUNNER_TEMP="$w/tmp" bash "$w/step3.sh" >/dev/null 2>&1) || fail "4 clean"
node "$d/check-sarif.js" "$w/tmp/as2-sarif/merged.sarif" 0 || fail "4 clean sarif"
node "$d/zip-test.js" || fail "5 zip.js release gate"
node "$d/modules.js" || fail "6 release drop list / module-only build"
node "$d/docrun.js" || fail "7 docrun: a doc ARSENAL line fails on the unzipped release"
node "$d/small-test.js" || fail "8 small package: launcher gate rule, file set, 0755"
node "$d/small-e2e.js" || fail "9 small package launchers end to end (Windows cmd + Git Bash sh; fixture server on 127.0.0.1)"
rm -rf "$w"
echo PASS
