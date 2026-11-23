// --format json + .lintrc check: node fmtcheck.js <script.js> <CODE> [args...]
// Author: Imperator_Aug (ARSENAL, ia-e7e5af07)
const { spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const [script, code, ...args] = process.argv.slice(2);
const run = extra => spawnSync('node', [script, ...args, '-q', ...extra], { encoding: 'utf8' });
const fail = m => { console.log('FAIL: ' + m); process.exit(1); };
const t = run([]).stdout, m = /^([0-9]+) findings/m.exec(t);
if (!m || !+m[1] || !t.includes(code)) fail('text run lacks ' + code);
const j = JSON.parse(run(['--format', 'json']).stdout);
if (j.total !== +m[1] || !(j.counts[code] > 0) || j.findings.length !== j.total) fail('json total/counts differ from text');
const rcf = path.join(os.tmpdir(), 'fmtcheck-' + process.pid + '.lintrc');
fs.writeFileSync(rcf, JSON.stringify({ ignore: [{ code }] }));
const k = JSON.parse(run(['--format', 'json', '--rc', rcf]).stdout);
fs.unlinkSync(rcf);
if (k.counts[code] || k.total >= j.total) fail('.lintrc did not suppress ' + code);
console.log('fmtcheck ok ' + code);
