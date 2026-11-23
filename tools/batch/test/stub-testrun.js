// stub testrun for batch tests: --lint -> real testrun; --queue -> fake report; logs its argv to $BATCH_STUB_LOG
// Author: Imperator_Aug (ARSENAL, ia-4a66fd95)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const a = process.argv.slice(2);
if (process.env.BATCH_STUB_LOG) fs.appendFileSync(process.env.BATCH_STUB_LOG, a.join(' ') + '\n');
if (a.includes('--lint')) { const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'testrun', 'testrun.js'), ...a], { encoding: 'utf8' }); process.stdout.write(r.stdout); process.exit(r.status); }
const q = a[a.indexOf('--queue') + 1].split(',').filter(Boolean), out = a[a.indexOf('--out') + 1];
const queue = q.map((f, i) => {
  const sc = JSON.parse(fs.readFileSync(f, 'utf8')), name = sc.name;
  if (sc.manual) return { file: f, name, status: 'MANUAL', manual: sc.manual };
  const fail = name === 'zz-02';
  return { file: f, name, status: fail ? 'FAIL' : 'PASS', launch: i + 1, ms: 10, reasons: fail ? ['no reply'] : undefined, verdicts: [{ pass: !fail, desc: `log matches /${name}/`, row: sc.rows[0] }], rows: sc.rows.map(r => ({ id: r, pass: !fail })) };
});
fs.writeFileSync(out, JSON.stringify({ tool: 'testrun', queue, launches: queue.length, workers: +a[a.indexOf('--workers') + 1] }));
process.exit(queue.some(x => x.status === 'FAIL') ? 1 : 0);
