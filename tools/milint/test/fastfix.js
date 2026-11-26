// speed-ups (X6,: the fixture mod (mkfixture.js, $TEST_WORK/fixture/mod) checked with MILINT_FAST on (default)
// and off gives the same output bytes, with info lines too; a file whose checks throw with the speed-ups on (MILINT_TEST_FAULT = its
// key) is checked again the old way, same output. Exit 1 on a difference
// Author: Imperator_Aug (ARSENAL, ia-7bb07129)
const path = require('path'), { spawnSync } = require('child_process');
const mod = path.join(process.env.TEST_WORK || path.join(__dirname, 'work'), 'fixture', 'mod'), tool = path.join(__dirname, '..', 'milint.js');
const run = env => { const r = spawnSync(process.execPath, [tool, mod], { encoding: 'utf8', env: { ...process.env, MILINT_FAST: '', MILINT_TEST_FAULT: '', ...env } }); return r.status + '\n' + r.stdout + r.stderr; };
let bad = 0;
const on = run({}), off = run({ MILINT_FAST: '0' });
if (on !== off) { console.log('FAIL: MILINT_FAST on/off differ'); bad++; }
if (!/MI_MAP_POINT_MISSING|MIS_BOT_NO_FLAGS|WARN_MI_/.test(on)) { console.log('FAIL: fixture output lacks the mission findings'); bad++; }
for (const k of ['resource/map/multi/m9/combat.mi', 'resource/map/multi/m9/map', 'resource/script/multiplayer/bot.data.lua']) {
  const f = run({ MILINT_TEST_FAULT: k });
  if (f !== off) { console.log('FAIL: fault in ' + k + ': output differs from the old way'); bad++; }
}
console.log(bad ? 'FAST-BAD' : 'FAST-OK');
process.exit(bad ? 1 : 0);
