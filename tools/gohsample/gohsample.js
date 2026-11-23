#!/usr/bin/env node
// gohsample: calibrate the static crash predictions with a real sample of Gates of Hell entities converted for as64.
//   gohsample plan    [--goh H] [--as2 G] --out D [--max 100] [--per-code 2] [--per-kind 2] [--seed n]    pick a deterministic sample -> sample.json, uncovered.txt
//   gohsample build   --plan D/sample.json --out D [-j 4]                                                convert each entity with goh2as2 -> D/mod, build.json, names.txt
//   gohsample predict --plan D/sample.json --game G --out D [--linters a,b|none] [--wl-json f]           wouldload + linters on D/mod (overlay) -> predictions.json
//   gohsample sweep   --plan D/sample.json --out D [--game G] [--good def] [--no-plan]                   preloadsweep plan + RUN.md (nothing installed, nothing launched)
//   gohsample compare --predictions f --read <preloadsweep read output|results json> [--bisect-log dir] --out D     calibration.md/json
//   gohsample boot    --out D [--result clean|crash]                                                     boot-load bisect over part B set/ files (step by step, nothing launched)
//   gohsample all     [--goh H] [--as2 G] --out D [--max N ...]                                          plan, build, predict, sweep
//   --exe as64|mowas_2|mowas2 (every step): the AS2 build the sample is for. plan records it (sample.json meta.exe), later steps take it from
//     there when not given. mowas_2: goh2as2 --exe mowas_2, mod.info 3.262.0..3.262.1, wouldload --exe mowas_2, preloadsweep --exe mowas_2,
//     RUN.md with mowas_2.exe, no as64+, no testrun line (mowas_2.exe has no -control/-instance, TST-19 [I]: matches and boots by hand) [T].
//     No --exe: the plan's meta.exe, else the install as goh2as2 reads it (as64.exe present -> as64 as before; no as64.exe -> mowas_2).
//     --exe goh is refused (exit 2): GoH is the source of the sample.
//   --limits dir (plan): limits/ folder with PORT*.md rows; else env AS64_LIMITS, else the repo limits/ (a release copy ships none)
// LOCAL ONLY: the output holds converted GoH game data. Never publish, never commit. --out inside a game install is refused.
// predicted LOAD/CRASH/UNKNOWN per entity; ORPHAN wouldload findings count as CRASH (a preload list names each entity directly).
// Everything inferred is [I]/[T]: the sample selection (closure estimate mirrors goh2as2), the "entity crashes when its own def has a SPAWN-class
// finding" rule, and the preload reading in preloadsweep. Not exit-coded by findings: exit 0 unless usage error (2).
// Author: Imperator_Aug (ARSENAL, ia-70fce072)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const path = require('path');
const C = require('./common');

const VALUES = ['goh', 'as2', 'out', 'max', 'per-code', 'per-kind', 'max-b', 'boot-state', 'wl-json-b', 'result', 'seed', 'plan', 'game', 'linters', 'wl-json', 'build', 'good', 'predictions', 'read', 'bisect-log', 'j', 'limits', 'exe'];
const FLAGS = ['no-plan', 'help'];

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === '--help' || cmd === 'help' || !['plan', 'build', 'predict', 'sweep', 'compare', 'boot', 'all'].includes(cmd)) {
    console.error('usage: gohsample plan|build|predict|sweep|compare|boot|all  (see the header of tools/gohsample/gohsample.js)');
    process.exit(2);
  }
  const o = C.parseArgs(argv.slice(1), VALUES, FLAGS);
  if (!o.out) C.die('--out <dir> required');
  if (o.exe) o.exe = C.target(o).exe;   // checked at the start: goh -> exit 2 with the plain line, a bad word -> exit 2
  const out = path.resolve(o.out);
  const times = {};
  const step = async (name, fn) => { const t = Date.now(); const r = await fn(); times[name] = Date.now() - t; return r; };
  const planFile = o.plan || path.join(out, 'sample.json');
  if (cmd === 'plan') await require('./plan').plan(o);
  else if (cmd === 'build') await require('./build').build(Object.assign({}, o, { plan: planFile }));
  else if (cmd === 'predict') await require('./predict').predict(Object.assign({}, o, { plan: planFile }));
  else if (cmd === 'sweep') await require('./sweep').sweep(Object.assign({}, o, { plan: planFile }));
  else if (cmd === 'boot') require('./boot').boot(o);
  else if (cmd === 'compare') { if (!o.predictions) o.predictions = path.join(out, 'predictions.json'); require('./compare').compare(o); }
  else {
    await step('plan', () => require('./plan').plan(o));
    const o2 = Object.assign({}, o, { plan: planFile });
    await step('build', () => require('./build').build(o2));
    await step('predict', () => require('./predict').predict(Object.assign({}, o2, { game: o.game || o.as2 })));
    await step('sweep', () => require('./sweep').sweep(Object.assign({}, o2, { game: o.game || o.as2 })));
    C.writeJson(path.join(out, 'times.json'), times);
    console.log('step times (ms): ' + JSON.stringify(times));
  }
}
main().catch(e => {
  if (e instanceof C.UsageError) { console.error('error: ' + e.message); process.exit(2); }
  console.error(e.stack); process.exit(2);
});
