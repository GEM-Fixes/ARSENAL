// test stub for tools/check: no args = usage (with --fast when UPGRADE_STUB_FAST=1), else records argv and prints a verdict line
const fs = require('fs'), a = process.argv.slice(2);
if (!a.length) { console.error('usage: check <mod> [--exe x]' + (process.env.UPGRADE_STUB_FAST ? ' [--fast]' : '')); process.exit(2); }
fs.appendFileSync(process.env.UPGRADE_STUB_LOG, 'check ' + a.join(' ') + '\n');
console.log('VERDICT ' + a[a.indexOf('--exe') + 1] + ': LOADS_STATIC: stub');
