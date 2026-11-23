// Author: Imperator_Aug (ARSENAL, ia-a3db8a18)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'exever-'));
const as2 = path.join(T, 'lib/steamapps/common/as2'), goh = path.join(T, 'lib/steamapps/common/goh');
fs.mkdirSync(as2, { recursive: true }); fs.mkdirSync(path.join(goh, 'binaries/x64'), { recursive: true });
fs.writeFileSync(path.join(as2, 'as64.exe'), 'one'); fs.writeFileSync(path.join(as2, 'mowas_2.exe'), 'two');
fs.writeFileSync(path.join(goh, 'binaries/x64/call_to_arms.exe'), 'three');
fs.writeFileSync(path.join(T, 'lib/steamapps/appmanifest_244450.acf'), '"buildid"\t\t"111"');
fs.writeFileSync(path.join(T, 'lib/steamapps/appmanifest_400750.acf'), '"buildid"\t\t"222"');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const log = path.join(T, 'log.md');
// mowas_2 as a shortened history row, the others in full
fs.writeFileSync(log, `| ${sha('one')} |\n| ${sha('two').slice(0, 8)}... |\n| ${sha('three')} |\n| AS2 | 244450 | 111 | x |\n| GoH | 400750 | 222 | x |\n`);
const run = () => cp.spawnSync(process.execPath, [path.join(__dirname, '../exever.js'), '--as2', as2, '--goh', goh, '--log', log], { encoding: 'utf8' });
const fail = m => { console.log(m); process.exit(1); };
let r = run();
if (r.status !== 0 || !/^0 findings/m.test(r.stdout)) fail('clean run: ' + r.stdout);
fs.writeFileSync(path.join(as2, 'as64.exe'), 'changed');
r = run();
if (r.status !== 1 || !/^EXE_NEW_BUILD as64\.exe/m.test(r.stdout)) fail('changed exe: ' + r.stdout);
fs.writeFileSync(path.join(as2, 'as64.exe'), 'one');
fs.writeFileSync(path.join(T, 'lib/steamapps/appmanifest_400750.acf'), '"buildid"\t\t"333"');
r = run();
if (r.status !== 1 || !/^EXE_NEW_STEAM_BUILD GoH/m.test(r.stdout)) fail('steam build: ' + r.stdout);
fs.rmSync(T, { recursive: true, force: true });
