// bootcheck test helper: node expect.js <out.json> <label> <js expression over r>; exit 1 with the label when false.
// Author: Imperator_Aug (ARSENAL, ia-4ad20e2e)
const fs = require('fs');
const [, , file, label, expr] = process.argv;
const r = JSON.parse(fs.readFileSync(file, 'utf8'));
let ok = false;
try { ok = !!Function('r', 'return (' + expr + ');')(r); } catch (e) { console.log('error in ' + label + ': ' + e.message); }
if (!ok) { console.log('FAIL: ' + label + '\n  expected: ' + expr + '\n  got: ' + JSON.stringify(r).slice(0, 600)); process.exit(1); }
console.log('ok ' + label);
