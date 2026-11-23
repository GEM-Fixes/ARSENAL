// as64 fixture: game dir with as64.exe + as64/core/localization/as64/en.lng + one base lng; checks --exe changes the .lng set (LOC-23)
// Author: Imperator_Aug (ARSENAL, ia-68825ac4)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
if (!process.env.TEST_WORK) { console.error('mkas64: TEST_WORK not set (run.sh sets it); a direct run would write into the tracked test/fixture'); process.exit(2); }
const g = path.join(process.env.TEST_WORK, 'fixture', 'game64');
fs.mkdirSync(path.join(g, 'as64', 'core', 'localization', 'as64'), { recursive: true });
fs.mkdirSync(path.join(g, 'localization'), { recursive: true });
fs.writeFileSync(path.join(g, 'as64.exe'), '');
fs.writeFileSync(path.join(g, 'as64', 'core', 'localization', 'as64', 'en.lng'), '{tags\r\n\t{as64 {hello "Hi"}}\r\n}\r\n');
fs.writeFileSync(path.join(g, 'localization', 'desc.lng'), '{tags\r\n\t{desc {x "X"}}\r\n}\r\n');
const n = exe => +/(\d+) lng files/.exec(execFileSync('node', [path.join(__dirname, '..', 'loccover.js'), '--vfs', '--game', g, '--exe', exe, '-q'], { encoding: 'utf8' }))[1];
const a = n('as64'), m = n('mowas_2');
if (a !== m + 1) { console.error(`FAIL: as64 lng files ${a}, mowas_2 ${m} (want +1)`); process.exit(1); }
