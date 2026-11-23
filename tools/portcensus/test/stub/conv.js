// stub goh2as2 for the portcensus test: --entity <key>.. / --entity-list F, --out <dir>. A run holding unit "bad" fails (exit 3);
// unit "lost" writes no gaps file. Logs one line per call to PORTCENSUS_TEST_LOG.
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), arg = n => a[a.indexOf(n) + 1];
if (process.env.PORTCENSUS_TEST_ARGS) fs.appendFileSync(process.env.PORTCENSUS_TEST_ARGS, 'conv ' + (a.includes('--exe') ? '--exe ' + arg('--exe') : '-') + '\n');   // game parity: the build each step was given
const keys = [];
a.forEach((x, i) => { if (x === '--entity') keys.push(a[i + 1]); if (x === '--entity-list') keys.push(...fs.readFileSync(a[i + 1], 'utf8').split(/\r?\n/).filter(Boolean)); });
const stems = keys.map(k => path.posix.basename(k.replace(/\\/g, '/'), '.def')), out = arg('--out');
if (process.env.PORTCENSUS_TEST_LOG) fs.appendFileSync(process.env.PORTCENSUS_TEST_LOG, 'conv ' + stems.join(',') + '\n');
if (process.env.PORTCENSUS_TEST_RMV) fs.rmSync(process.env.PORTCENSUS_TEST_RMV, { recursive: true, force: true });   // test: the census v/ folder goes missing mid-run
if (!a.includes('--text-only')) { console.error('no --text-only'); process.exit(2); }
if (stems.includes('bad')) { console.error('stub: cannot convert ' + path.resolve(out)); process.exit(3); }
fs.mkdirSync(path.join(out, 'gaps'), { recursive: true });
for (const s of stems) if (s !== 'lost') fs.writeFileSync(path.join(out, 'gaps', s + '.gaps.json'), '{}\n');
