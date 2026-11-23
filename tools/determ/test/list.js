// fixture: lists a folder in readdir order, unsorted (must fail, cause order); --sorted: the clean twin
// Author: Imperator_Aug (ARSENAL, ia-6f8bb0d2)
const fs = require('fs');
const names = fs.readdirSync(process.argv[2]);
if (process.argv[3] === '--sorted') names.sort();
for (const n of names) console.log(n);
