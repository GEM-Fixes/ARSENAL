// Author: Imperator_Aug (ARSENAL, ia-43eedbf3)
const fs = require('fs');
const a = fs.readFileSync(__dirname + '/roster/u.set'), b = fs.readFileSync(__dirname + '/roster/units_a.set'), t = a.toString('latin1');
const card = t.split('\r\n')[3];
if (!t.includes('{"newguy" {cost 20}') || /[^\r]\n/.test(t) || !a.includes(0xcf) || a.length !== b.length + card.length + 2) { console.error('roster bytes differ'); process.exit(1); }
