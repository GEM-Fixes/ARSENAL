// fixture: prints a temp path relative to the cwd (must fail, cause path); absolute: the clean twin (root replaced by <TMP>)
// Author: Imperator_Aug (ARSENAL, ia-acca3471)
const path = require('path');
const p = process.argv[2];
console.log(process.argv[3] === '--abs' ? path.resolve(p) : path.relative(process.cwd(), p));
