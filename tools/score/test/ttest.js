#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-0dba6d23)
'use strict';
// Test for tools/score/ttest.js and board row T (T-SCORE): seeded caps.json + last.json in a temp folder (pass, fail, missing, stale, not run),
// one real ttest run over fixture tests, and Complete MP met. Run: node tools/score/test/ttest.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const TT = require('../ttest.js');
const S = require('../score.js');

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const R = fs.mkdtempSync(path.join(os.tmpdir(), 'ttest-'));
const put = (rel, text) => { const f = path.join(R, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
put('tools/aa/aa.js', '// aa\n');
put('tools/aa/test/run.sh', 'echo PASS\n');
put('tools/bb/bb.js', '// bb\n');
put('tools/bb/test/t.js', 'console.log("FAIL"); process.exit(1);\n');
put('tools/dd/dd.js', '// dd v1\n');
put('tools/dd/test/t.js', 'console.log("PASS");\n');
put('tools/ee/main.js', '// ee\n');
put('tools/ee/test/t.js', 'console.log("PASS");\n');
const caps = put('caps.json', JSON.stringify({ caps: [
  { id: 'a', cap: 'pass', cmd: 'aa', kind: 'GOLD', test: 'tools/aa/test/run.sh' },
  { id: 'b', cap: 'fail', cmd: 'bb', kind: 'SEED', test: 'tools/bb/test/t.js' },
  { id: 'c', cap: 'file gone', cmd: 'cc', kind: 'GOLD', test: 'tools/cc/test/run.sh' },
  { id: 'n', cap: 'no test yet', cmd: 'nn', kind: 'BOOT', test: null, report: null },
  { id: 'd', cap: 'stale', cmd: 'dd', kind: 'RT', test: 'tools/dd/test/t.js' },
  { id: 'e', cap: 'src given, two tests', cmd: 'ee', kind: 'GOLD', test: ['tools/ee/test/t.js', 'tools/aa/test/run.sh'], src: ['tools/ee/main.js', 'tools/aa/aa.js'] },
] }));
const out = path.join(R, 'out', 'last.json');

// ---- 1. one real run over the fixture tests ----
const log = console.log; console.log = () => {};
let res; try { res = TT.run({ caps, out, root: R, date: '2026-11-09T00:00:00.000Z' }); } finally { console.log = log; }
const L = JSON.parse(fs.readFileSync(out, 'utf8'));
eq(Object.keys(L.tests).sort(), ['tools/aa/test/run.sh', 'tools/bb/test/t.js', 'tools/cc/test/run.sh', 'tools/dd/test/t.js', 'tools/ee/test/t.js'], 'each listed test recorded once (aa listed twice runs once), null test runs nothing');
eq(L.tests['tools/aa/test/run.sh'].result, 'pass', 'run.sh ending PASS passes');
eq(L.tests['tools/bb/test/t.js'].result, 'fail', 'exit 1 fails');
eq(L.tests['tools/cc/test/run.sh'].result, 'missing', 'a test file not found is missing, not failed');
eq(L.tests['tools/dd/test/t.js'].src, 'tools/dd/dd.js', 'main source defaults to tools/<dir>/<dir>.js');
eq(L.tests['tools/ee/test/t.js'].src, 'tools/ee/main.js', 'caps src overrides the default');
eq(L.tests['tools/aa/test/run.sh'].sha, TT.shaOf(path.join(R, 'tools/aa/aa.js')), 'sha recorded is the source sha');
eq(TT.shaOf(path.join(R, 'tools/aa/aa.js')), require('crypto').createHash('sha1').update('blob 6\0// aa\n').digest('hex'), 'sha = git blob sha1 of the source');
ok(/^[0-9a-f]{40}$/.test(L.tests['tools/aa/test/run.sh'].sha), 'sha is a 40-hex git blob sha');
eq(L.date, '2026-11-09T00:00:00.000Z', 'date recorded');

// ---- 2. row T from that last.json; then the dd source changes: stale ----
put('tools/dd/dd.js', '// dd v2\n');
const t1 = TT.scoreT({ caps, last: out, root: R });
eq(t1.per.map(p => p.id + ':' + p.state), ['a:pass', 'b:fail', 'c:missing', 'n:missing', 'd:stale', 'e:pass'], 'states per capability');
eq([t1.n, t1.of, t1.missing.length, t1.stale.length], [2, 6, 2, 1], '2 of 6 pass, 2 missing, 1 stale');
ok(/^2 of 6 capabilities pass \(2 missing, 1 stale\)/.test(t1.text), 'row text: ' + t1.text);

// ---- 3. seeded last.json, nothing run: score reads files only ----
const seeded = path.join(R, 'seeded.json');
const sha = f => TT.shaOf(path.join(R, f));
fs.writeFileSync(seeded, JSON.stringify({ date: 'x', tests: {
  'tools/aa/test/run.sh': { result: 'pass', src: 'tools/aa/aa.js', sha: sha('tools/aa/aa.js') },
  'tools/bb/test/t.js': { result: 'pass', src: 'tools/bb/bb.js', sha: sha('tools/bb/bb.js') },   // would fail if run: score must not run it
  'tools/dd/test/t.js': { result: 'pass', src: 'tools/dd/dd.js', sha: 'old' },
} }));
const t2 = TT.scoreT({ caps, last: seeded, root: R });
eq(t2.per.map(p => p.id + ':' + p.state), ['a:pass', 'b:pass', 'c:missing', 'n:missing', 'd:stale', 'e:not run'], 'seeded: score takes the recorded result, never reruns');
ok(/^2 of 6 capabilities pass \(2 missing, 1 stale\); not run: 1; no test: c n$/.test(t2.text), 'seeded text: ' + t2.text);
const t3 = TT.scoreT({ caps, last: path.join(R, 'none.json'), root: R });
ok(/^0 of 6 capabilities pass \(2 missing, 0 stale\); not run: 4 \(no \.\.\/run\/tests\/last\.json/.test(t3.text), 'no last.json: nothing passes, says how to fill it: ' + t3.text);

// ---- 4. the board prints row T and Complete with T, MP met ----
const none = path.join(R, 'no-coverage.md');
const st = { Complete: { MP: { status: 'met', note: 'met on the user\'s word' }, M5: { status: 'pass', n: 1, of: 1, bar: 1 } } };
const bd = S.board({ rowsObj: [], stateObj: st, coverage: none, caps, tlast: seeded, troot: R });
const txt = S.render(bd, {});
ok(/^T Tests +2 of 6 capabilities pass \(2 missing, 1 stale\)/m.test(txt), 'board row T');
eq(bd.complete.items.map(i => i.id + ':' + i.status), ['T:open', 'D:not measured', 'C:not measured', 'port exam:open', 'MP:met', 'M5:pass', 'M6:open'], 'Complete items as PLAN ## Complete');
ok(/^Complete: +2 of 7 \| T open \(2 of 6 pass\);.* MP met \(met on the user's word\)/m.test(txt), 'MP met counts done: ' + txt.split('\n').find(l => /^Complete/.test(l)));
const real = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'state.json'), 'utf8'));
eq(real.Complete.MP.status, 'met', 'state.json: MP met (plan/decisions.md 2026-11-09)');
const rc = TT.readCaps(path.join(__dirname, '..', 'caps.json'));
ok(rc.length === 18 && rc.every(c => c.id && c.cap && c.cmd && c.kind && 'test' in c), 'repo caps.json: 18 rows, each {id, cap, cmd, kind, test}');
ok(rc.every(c => !/\b(BOOT|SPAWN)\b/.test(c.kind) || 'report' in c), 'game kinds carry a report field');

fs.rmSync(R, { recursive: true, force: true });
console.log(n + ' checks, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
