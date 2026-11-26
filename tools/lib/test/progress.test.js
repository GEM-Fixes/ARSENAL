// lib/progress: PROGRESS at <n> <bytes> <name>\tthread=<id>, n per thread; parse reads the new and the old form; an old reader
// (wouldload: split on spaces, rest = name) still gets n and bytes. node progress.test.js (exit 1 on failure)
// Author: Imperator_Aug (ARSENAL, ia-2edbcf37)
const path = require('path'), { spawnSync } = require('child_process');
const progress = require('../progress');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const lib = JSON.stringify(path.join(__dirname, '..', 'progress.js'));
const code = `const p = require(${lib}), { Worker } = require('worker_threads');
p.file('a b.def', 10); p.file('x\\ty\\r\\nz.def', 20);
const w = new Worker('const p = require(' + JSON.stringify(${lib}) + '); p.file("w1.def", 5); p.file("w2.def", 6);', { eval: true });
w.on('exit', () => p.file('c.def', 30));`;
const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: Object.assign({}, process.env, { ARSENAL_PROGRESS: '1' }) });
const ls = r.stderr.split('\n').filter(l => l.startsWith('PROGRESS at '));
const ps = ls.map(progress.parse);
ok(ls.length === 5 && ps.every(Boolean), 'five lines, all parse: ' + JSON.stringify(r.stderr));
const main = ps.filter(p => p && p.thread === 0), wk = ps.filter(p => p && p.thread > 0);
ok(JSON.stringify(main.map(p => [p.n, p.bytes, p.file])) === JSON.stringify([[1, 10, 'a b.def'], [2, 20, 'x y  z.def'], [3, 30, 'c.def']]), 'main thread lines: ' + JSON.stringify(main));
ok(wk.length === 2 && wk[0].n === 1 && wk[1].n === 2 && wk[0].thread === wk[1].thread && wk[0].file === 'w1.def', 'worker n counts from 1 on its own thread: ' + JSON.stringify(wk));
ok(ls.every(l => (l.match(/\t/g) || []).length === 1 && /\tthread=\d+$/.test(l)), 'one tab, thread field last');
// the old reader (tools/wouldload runAsync): n and bytes unchanged
const old = l => { const m = l.slice(12).trimEnd().split(' '); return { n: +m[0], bytes: +m[1], file: m.slice(2).join(' ') }; };
ok(ls.every((l, i) => old(l).n === ps[i].n && old(l).bytes === ps[i].bytes && old(l).file.startsWith(ps[i].file)), 'old reader: n, bytes, name prefix');
// the old form (no thread field) still parses; junk does not
ok(JSON.stringify(progress.parse('PROGRESS at 7 99 resource/a b.def')) === JSON.stringify({ n: 7, bytes: 99, file: 'resource/a b.def', thread: null }), 'old form parses');
ok(progress.parse('PROGRESS start x') === null && progress.parse('PROGRESS at x y z') === null, 'non-records are null');
if (!bad) console.log('progress ok');
process.exit(bad ? 1 : 0);
