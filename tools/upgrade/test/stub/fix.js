// test stub for tools/fix: records argv, writes one file into --out, json like the real one
const fs = require('fs'), path = require('path'), a = process.argv.slice(2), at = k => a[a.indexOf(k) + 1];
fs.appendFileSync(process.env.UPGRADE_STUB_LOG, 'fix ' + a.join(' ') + '\n');
fs.mkdirSync(at('--out'), { recursive: true }); fs.writeFileSync(path.join(at('--out'), 'mod.info'), '{Mod}\r\n');
fs.writeFileSync(at('--json'), JSON.stringify({ changed: ['a', 'b'], cant: ['c'], reverted: [], verdict: 'static clean, untested' }));
console.log('VERDICT: static clean, untested');
