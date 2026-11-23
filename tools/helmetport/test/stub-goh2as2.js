// stub goh2as2 for tools/helmetport/test/exe.js: appends its argv (one line, space joined) to HELMETPORT_TEST_ARGS and says it wrote nothing.
// Author: c-port3 (game parity batch)
// Author: Imperator_Aug (ARSENAL, ia-0172e59e)
'use strict';
const fs = require('fs');
if (process.env.HELMETPORT_TEST_ARGS) fs.appendFileSync(process.env.HELMETPORT_TEST_ARGS, process.argv.slice(2).join(' ') + '\n');
console.log('wrote 0 files (stub)');
console.log('0 findings');
