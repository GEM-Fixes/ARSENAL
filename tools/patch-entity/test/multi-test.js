// --set without #N and several values replaces the whole run of plain values (COV-SHAPE SHAPE_ARITY); #N keeps per-value edits
// Author: Imperator_Aug (ARSENAL, ia-64470973)
const p = require('../patch-entity.js'), set = (s, path, v) => p.applyEdit(Buffer.from(s, 'latin1'), { op: 'set', path, value: v }).buf.toString();
const cases = [
  ['{blow {opponent {damage 50 0.5}}}', 'blow/opponent/damage', '70 0.75', '{blow {opponent {damage 70 0.75}}}'],
  ['{a {b 50 0.5 0.2 {x 1}}}', 'a/b', '70 0.75', '{a {b 70 0.75 {x 1}}}'],
  ['{a {b 1 2 3}}', 'a/b#2', '9 8', '{a {b 1 9 8 3}}'],
  ['{a {b 1 2 3}}', 'a/b', '9', '{a {b 9 2 3}}'],
  ['{a {b 1}}', 'a/b', '4 5 6', '{a {b 4 5 6}}']];
let bad = 0;
for (const [s, k, v, want] of cases) { const got = set(s, k, v); if (got !== want) { bad++; console.log('FAIL', k, v, got); } }
console.log(bad ? 'multi FAIL' : 'multi ok'); process.exit(bad ? 1 : 0);
