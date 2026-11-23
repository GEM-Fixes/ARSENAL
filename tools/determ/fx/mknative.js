// Author: Imperator_Aug (ARSENAL, ia-e1b33125)
'use strict';
// builds <out>/game, <out>/mod, <out>/table.json for the native command (same shape as tools/native/test/test.js: 4 peers, 1 seeded unit, 1 clean twin)
const fs = require('fs'), path = require('path');
// the out folder is required: with no argument this once wrote game/resource, mod/ and table.json into the folder it was started from
if (!process.argv[2] || process.argv[2].startsWith('-')) { console.error('usage: node tools/determ/fx/mknative.js <out dir>'); process.exit(2); }
const out = path.resolve(process.argv[2]);
const w = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t.replace(/\n/g, '\r\n')); };
const def = (speed, extra) => `{entity\n {mass 20000}\n {chassis {locomotion {maxspeed ${speed}} {turntime 5}} {fuelbag {volume 300}}}\n {props "vehicle" "tank"}\n {boarder {seat 1}}\n${extra}}\n`;
const G = path.join(out, 'game');
for (const s of ['pa', 'pb', 'pc', 'pd']) w(path.join(G, 'resource', 'entity', '-vehicle', 'tank_medium', s, s + '.def'), def(32, ' {collider "c"}\n {targetclass "tank"}\n'));
fs.writeFileSync(path.join(out, 'table.json'), JSON.stringify({ classes: { tank_medium: { units: { goh: 0, as2: 4 }, keys: {}, curated: { speed: { as2: { n: 5, min: 20, max: 60 } }, mass: { as2: { n: 5, min: 10000, max: 40000 } } } } } }));
const M = path.join(out, 'mod');
w(path.join(M, 'resource', 'entity', 'seed1', 'seed1.def'), def(400, ' {zzextra 1}\n'));
w(path.join(M, 'resource', 'entity', 'good1', 'good1.def'), def(40, ' {collider "c"}\n {targetclass "tank"}\n'));
