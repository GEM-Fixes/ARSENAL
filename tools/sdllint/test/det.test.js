// DET-SDL: same input, same stdout bytes. Runs the CLI twice on bad/ and compares; the duration shows only with --time
// Author: Imperator_Aug (ARSENAL, ia-de2b9e56)
const { spawnSync } = require('child_process'), path = require('path');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const tool = path.join(__dirname, '..', 'sdllint.js'), fx = path.join(__dirname, 'bad');
const runOnce = extra => spawnSync(process.execPath, [tool, fx].concat(extra || []), { encoding: 'buffer' });
const a = runOnce(), b = runOnce();
ok(a.stdout.length > 0, 'no stdout');
ok(a.status === b.status, 'exit code differs: ' + a.status + ' vs ' + b.status);
ok(a.stdout.equals(b.stdout), 'stdout differs between two runs on the same input');
ok(!/ in \d+ ms/.test(a.stdout.toString('latin1')), 'duration in default stdout');
ok(/\d+ files \(\d+ binary skipped\)\r?\n$/.test(a.stdout.toString('latin1')), 'totals line missing or changed');
ok(/ in \d+ ms\r?\n$/.test(runOnce(['--time']).stdout.toString('latin1')), '--time does not print the duration');
if (!bad) console.log('det ok');
process.exit(bad ? 1 : 0);
