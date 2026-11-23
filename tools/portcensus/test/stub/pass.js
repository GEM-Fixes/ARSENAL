// stub nativepass: <mod> --out <dir> --json f. copies gaps/.
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), arg = n => a[a.indexOf(n) + 1];
if (process.env.PORTCENSUS_TEST_ARGS) fs.appendFileSync(process.env.PORTCENSUS_TEST_ARGS, 'pass ' + (a.includes('--exe') ? '--exe ' + arg('--exe') : '-') + '\n');   // game parity: the build each step was given
const mod = a[0], out = arg('--out');
fs.mkdirSync(path.join(out, 'gaps'), { recursive: true });
for (const f of fs.readdirSync(path.join(mod, 'gaps'))) fs.copyFileSync(path.join(mod, 'gaps', f), path.join(out, 'gaps', f));
fs.writeFileSync(arg('--json'), JSON.stringify({ form: 'nativepass/1', units: [] }) + '\n');
