// MAP-CARRY: edrun --env names the mission's Environment; without it the mission is unchanged. No game. node env-test.js
// scratch output goes to ../run/mapcarry (never a game folder)
// Author: Imperator_Aug (ARSENAL, ia-682b9799)
const assert = require('assert'), fs = require('fs'), path = require('path'), cp = require('child_process');
const e = require('../edrun.js');
const pairs = JSON.parse(fs.readFileSync(path.join(__dirname, 'old-pairs.json'), 'utf8'));
const plain = e.buildMission(pairs, 'rX', {});
assert.ok(plain.includes('{Environment "multi/multi_01"}'), 'fixture default');
assert.strictEqual(e.buildMission(pairs, 'rX', { env: undefined }), plain, 'no env = byte identical');
const m = e.buildMission(pairs, 'rX', { env: 'goh/multi/1v1_ladoga/var1' });
assert.ok(m.includes('{Environment "goh/multi/1v1_ladoga/var1"}') && !m.includes('multi/multi_01"'), 'env named');
assert.strictEqual(m.replace('goh/multi/1v1_ladoga/var1', 'multi/multi_01'), plain, 'only that line changes');
// CLI: --dry writes combat0.mi under ../run/mapcarry
const out = path.resolve(__dirname, '../../../../run/mapcarry/edrun-env');
fs.mkdirSync(out, { recursive: true });
const run = extra => cp.spawnSync('node', [path.join(__dirname, '../edrun.js'), '--pairs', path.join(__dirname, 'old-pairs.json'), '--dry', '--no-check', '--out', out].concat(extra), { encoding: 'latin1' });
let r = run([]); assert.strictEqual(r.status, 0, 'dry plain');
const a = fs.readFileSync(path.join(out, 'combat0.mi'), 'latin1');
r = run(['--env', 'goh/multi/1v1_ladoga/var1']); assert.strictEqual(r.status, 0, 'dry env');
const b = fs.readFileSync(path.join(out, 'combat0.mi'), 'latin1');
assert.ok(a.includes('"multi/multi_01"') && b.includes('"goh/multi/1v1_ladoga/var1"'), 'cli env');
r = run(['--env', 'bad name"x']); assert.strictEqual(r.status, 2, 'bad env refused');
console.log('PASS env');
