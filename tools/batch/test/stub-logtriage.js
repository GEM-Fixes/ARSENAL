// stub logtriage: prints a fixed finding block; echoes args to $BATCH_STUB_LOG
// Author: Imperator_Aug (ARSENAL, ia-b7ddffc4)
const fs = require('fs');
if (process.env.BATCH_STUB_LOG) fs.appendFileSync(process.env.BATCH_STUB_LOG, 'logtriage ' + process.argv.slice(2).join(' ') + '\n');
console.log('=== instance 1: x ===');
console.log('game.log:12: LOG_EXCEPTION exception in mod');
console.log('=== merged: 1 instance(s), 1 findings ===');
console.log('by code: {"LOG_EXCEPTION":1}');
