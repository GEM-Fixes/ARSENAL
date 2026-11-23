// stub rows: verdicts <report> [--dry] -> same line shape as rows.js; echoes args to $BATCH_STUB_LOG
// Author: Imperator_Aug (ARSENAL, ia-25c2cc83)
const fs = require('fs');
const a = process.argv.slice(2);
if (process.env.BATCH_STUB_LOG) fs.appendFileSync(process.env.BATCH_STUB_LOG, 'rows ' + a.join(' ') + '\n');
const rep = JSON.parse(fs.readFileSync(a[1], 'utf8'));
for (const it of rep.queue) for (const r of it.rows || [{ id: it.rows }]) {
  if (it.status === 'MANUAL') console.log(`ZZ-99 MANUAL T -> T  ${it.name}: ${it.manual}`);
  else if (r.pass) console.log(`${r.id} PASS V -> V  ${it.name}: ${it.verdicts[0].desc}`); else console.log(`${r.id} FAIL T -> T (note only)  ${it.name}: no reply`);
}
