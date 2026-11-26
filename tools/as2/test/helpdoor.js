#!/usr/bin/env node
// HELPFIX: every front-door tool answers `as2 <tool> --help` with exit 0 and a usage line naming the exe form `usage: as2 <tool>`.
// front door = menu.js FRONT + MAIN, every `as2 <x>` / `as2.exe <x>` / `node tools/<x>/<x>.js` named in tools/QUICKSTART.md, workflow cmds.
// arg: [exe] = run the SEA build (as2.exe) instead of node as2.js (tools/dist/test/run.sh)
// PENDING: tools other sessions own; a miss there prints PENDING, not FAIL (drop the name here once its session lands the fix).
// Author: Imperator_Aug (ARSENAL, ia-b750c9ce)
const fs = require('fs'), path = require('path'), os = require('os'), Wt = require('../../lib/test/wait');
const T = path.join(__dirname, '..', '..'), AS2 = path.join(T, 'as2', 'as2.js');
const { entry } = require(AS2), { FRONT, MAIN } = require('../menu'), { CMDS } = require('../flow');
const PENDING = new Set(['edrun', 'goh2as2', 'mission-clone']);
// refcheck, testrun: named bare in QUICKSTART / run by check and probe (l7-clean.md)
const names = new Set([...FRONT, ...MAIN.map(m => m[0]), ...CMDS, 'refcheck', 'testrun']);
const qs = fs.readFileSync(path.join(T, 'QUICKSTART.md'), 'utf8');
for (const r of qs.matchAll(/\b(?:ARSENAL|as2)(?:\.exe|-gui\.exe|gui\.exe)? ([a-z][a-z0-9-]*)/g)) names.add(r[1]);
for (const r of qs.matchAll(/node tools\/([a-z0-9-]+)\/([a-z0-9-]+)\.js/g)) if (r[1] === r[2]) names.add(r[1]);
names.delete('as2'); names.delete('ARSENAL');
const doors = [...names].filter(n => entry(n) || CMDS.has(n) || n === 'status').sort();
const EXE = process.argv[2] ? path.resolve(process.argv[2]) : null;
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'helpdoor-'));
let fail = 0, pend = 0;
for (const n of doors) {
  const r = Wt.spawnSync(EXE || process.execPath, [...(EXE ? [] : [AS2]), n, '--help'], { cwd, encoding: 'utf8', env: { ...process.env, AS2_NO_STEAM: '1' } }, 'as2 helpdoor ' + n);
  const ok = r.status === 0 && new RegExp('^usage: (?:ARSENAL|as2) ' + n + '(\\s|$)', 'm').test(r.stdout || '');
  const why = ok ? '' : ` rc=${r.status} ${((r.stdout || '') + (r.stderr || '')).split(/\r?\n/)[0].slice(0, 100)}`;
  if (ok) console.log('ok      ' + n);
  else if (PENDING.has(n)) { pend++; console.log('PENDING ' + n + why); }
  else { fail++; console.log('FAIL    ' + n + why); }
}
fs.rmSync(cwd, { recursive: true, force: true });
if (doors.length < 15) { console.log('FAIL    front-door list too short: ' + doors.join(' ')); fail++; }
console.log(`${doors.length} front-door tools${EXE ? ' (exe)' : ''}, ${fail} failed, ${pend} pending (other sessions)`);
console.log(fail ? 'FAIL' : 'PASS');
process.exitCode = fail ? 1 : 0;
