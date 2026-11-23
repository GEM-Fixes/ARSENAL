#!/usr/bin/env node
// ialint on the invented fixture shape/ (invented text in the shape of vanilla set/interaction_entity: entity.set + includes, define/call, if/else chains).
// clean copy: 0 findings with the 3 files read (asserted by the seeded copy below catching INT_EVENT_DUP in the same tree); seeded copy: covlint case ialint-invented.
// Author: Imperator_Aug (ARSENAL, ia-70a089d1)
const cp = require('child_process'), path = require('path'), os = require('os');
const ia = path.join(__dirname, '..', 'ialint.js'), shape = path.join(__dirname, 'shape');
const r = cp.spawnSync(process.execPath, [ia, shape, '-q'], { encoding: 'utf8' });
const clean = (r.stdout.match(/^(\d+) findings/m) || [])[1];
const c = cp.spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'covlint', 'covlint.js'), '--only', 'ialint-invented', '--out', path.join(os.tmpdir(), 'covlint-ialint')], { encoding: 'utf8' });
const caught = /^CAUGHT ialint-invented/m.test(c.stdout);
console.log(`shape clean findings ${clean}; seeded INT_EVENT_DUP ${caught ? 'caught' : 'MISSED'}`);
if (clean !== '0' || !caught) { console.log(r.stdout, c.stdout); process.exit(1); }
console.log('PASS');
