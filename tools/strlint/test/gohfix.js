// strlint game branch test: made-up colliders.set copies linted as GoH (--exe goh), AS64 and MoW:AS2. GoH needs the profiles
// tpc_camera (GHDC-41) and human_tpc (GHDC-49); AS2 rules do not ask for them. Exits 1 on a difference.
// Author: Imperator_Aug (ARSENAL, ia-0b377810)
const fs = require('fs'), path = require('path');
const { check } = require('../strlint');
const W = process.env.TEST_WORK || path.join(__dirname, 'fixture');
const put = (dir, rel, lines) => { const f = path.join(dir, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n'); };
const a = path.join(W, 'goh-a'), b = path.join(W, 'goh-b');
for (const d of [a, b]) fs.rmSync(d, { recursive: true, force: true });
put(a, 'resource/set/colliders.set', [';SDL', '{Colliders', '\t{"nothing" {ColliderId "nothing"} {NoContactsAtAll}}', '\t{"human" {ColliderId "human"}}', '\t{"human_tpc" from "human"}', '}']);
put(b, 'resource/set/colliders.set', [';SDL', '{Colliders', '\t{"nothing" {ColliderId "nothing"}}', '\t{"human" {ColliderId "human"}}', '\t{"human_tpc" from "human"}', '\t{"tpc_camera" {ColliderId "tpc_camera"}}', '}']);
const codes = (folder, exe) => check({ folder, exe }).rep.toJSON().findings.map(f => f.code).sort();
let bad = 0;
const eq = (what, got, want) => { const x = JSON.stringify(got), y = JSON.stringify(want); if (x !== y) { bad++; console.log(`FAIL ${what}: ${x} want ${y}`); } else console.log('ok ' + what); };
eq('goh, no tpc_camera', codes(a, 'goh'), ['STR_COLLIDER_PROFILE_GOH']);
eq('goh, both profiles', codes(b, 'goh'), []);
eq('as64, no tpc_camera', codes(a, 'as64'), []);
eq('mowas_2, no tpc_camera', codes(a, 'mowas_2'), []);
eq('no --exe, no tpc_camera', codes(a), []);
const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'strlint.js'), a, '--exe', 'bogus'], { encoding: 'utf8' });
eq('--exe bogus exit', r.status, 2);
process.exit(bad ? 1 : 0);
