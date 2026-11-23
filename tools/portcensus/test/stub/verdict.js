// stub portverdict: <mod> --json f. One unit per gaps file. A unit whose name starts with "n" is native; cc_late has good keys but a value out of range (bar true, native false); others miss/extra keys by name.
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), arg = n => a[a.indexOf(n) + 1];
if (process.env.PORTCENSUS_TEST_ARGS) fs.appendFileSync(process.env.PORTCENSUS_TEST_ARGS, 'verdict ' + (a.includes('--exe') ? '--exe ' + arg('--exe') : '-') + '\n');   // game parity: the build each step was given
const stems = fs.readdirSync(path.join(a[0], 'gaps')).map(f => f.replace(/\.gaps\.json$/, '')).sort();
const units = stems.map(stem => {
  const nat = stem.startsWith('n'), vonly = stem === 'cc_late', kok = nat || vonly;
  const missing = kok ? [] : ['entity/volume/thickness/front', ...(stem.length > 2 ? ['entity/a/b'] : [])];
  const extra = kok ? [] : ['entity/extender:smokescreen/cooldown'];
  const out = nat ? [] : [{ key: 'entity/speed', value: 9, min: 1, max: 2 }, { key: 'entity/speed', value: 8, min: 1, max: 2 }];
  return { unit: stem, class: 'tank_medium', keys: { ok: kok, missing, extra }, values: { ok: nat, out }, syntax: { ok: true, n: 0 }, refs: { ok: true, n: 0, first: [] }, scale: { ok: null, why: '' }, gaps: { hand: 0, unexplained: 0 }, bar: kok, native: nat };
});
fs.writeFileSync(arg('--json'), JSON.stringify({ form: 'verdict/1', mod: 'x', units, counts: {} }) + '\n');
