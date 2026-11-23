// T-BOOTFIX: edrun prepends as64+ on an as64 exe when --mods lacks it (editor build crashes at load otherwise). No game.
// Author: Imperator_Aug (ARSENAL, ia-dcbd542c)
const assert = require('assert'), path = require('path'), cp = require('child_process');
const e = require('../edrun.js');
let r = e.withAs64Plus(['review_1'], 'as64_ed.exe');
assert.deepStrictEqual(r.list, ['as64+', 'review_1']); assert.ok(/^NOTE: .*as64\+ prepended/.test(r.note));
r = e.withAs64Plus(['x', 'as64+'], 'as64_ed.exe'); assert.deepStrictEqual(r.list, ['x', 'as64+']); assert.strictEqual(r.note, null);
r = e.withAs64Plus(['x', 'AS64+:123'], 'as64.exe'); assert.strictEqual(r.note, null);
r = e.withAs64Plus([], 'as64_ed.exe'); assert.deepStrictEqual(r.list, ['as64+']);
r = e.withAs64Plus(['x'], 'mowas_2_ed.exe'); assert.deepStrictEqual(r.list, ['x']); assert.strictEqual(r.note, null);   // Classic: untouched
// CLI: dry run prints the NOTE
const out = path.resolve(__dirname, '../../../../run/waves/w6/T-BOOTFIX/dry');
require('fs').mkdirSync(out, { recursive: true });
const run = extra => cp.spawnSync('node', [path.join(__dirname, '../edrun.js'), '--pairs', path.join(__dirname, 'old-pairs.json'), '--dry', '--no-check', '--out', out].concat(extra), { encoding: 'latin1' });
let p = run(['--mods', 'review_1']); assert.strictEqual(p.status, 0, p.stderr);
assert.ok(/NOTE: --mods lacks as64\+/.test(p.stdout), 'note printed');
p = run(['--mods', 'as64+,review_1']); assert.strictEqual(p.status, 0); assert.ok(!/NOTE\x3a/.test(p.stdout), 'no note');
console.log('PASS as64plus');
