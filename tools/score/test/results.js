#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-4763d309)
'use strict';
// Test for the recorded results of tools/score/score.js (T-BOARD): C, D and the port exam read from results/*.json.
// SEED: invented score-result/1 files in a temp folder (met, open, below 70%, source missing, duplicate). GOLD: the repo's own
// tools/score/results files give the board lines below. Reads files only, runs no test and no game. Run: node tools/score/test/results.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../score.js');
const TT = require('../ttest.js');

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'score-results-'));
const put = (rel, obj) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };
put('plan/reports/rep.md', '# seeded report\n');
const none = path.join(tmp, 'no-coverage.md');
const state = { B: { reps: [] }, C: { steps: { map: { status: 'pass' } } }, D: { checks: [{ name: 'old', status: 'open' }] }, Complete: { portExam: { status: 'open' } } };
const exam = (o) => Object.assign({ form: 'score-result/1', item: 'portExam', source: 'plan/reports/rep.md', run: 'SEED-1', units: 4,
  gapLists: { n: 4, of: 4 }, spawn: { n: 4, of: 4 }, sanity: { cells: { n: 5, of: 8 }, out: { n: 3, of: 4 }, in: { n: 2, of: 4 }, bar: 70 } }, o);
const board = dir => S.board({ rowsObj: [], stateObj: state, coverage: none, results: dir, resultsRoot: tmp, caps: path.join(tmp, 'nocaps.json') });
const pe = bd => bd.complete.items.find(i => i.id === 'port exam');

// ---- 1. SEED: port exam met below 70% (listed, not open) ----
const d1 = path.join(tmp, 'r1');
put('r1/a-chain.json', { form: 'score-result/1', item: 'C', source: 'plan/reports/rep.md', steps: { unit: { status: 'pass' }, map: { status: 'pass' }, mission: { status: 'pass' }, bot: { status: 'fail' }, text: { status: 'pass' }, model: { status: 'open' } } });
put('r1/b-door.json', { form: 'score-result/1', item: 'D', source: 'plan/reports/rep.md', checks: [{ name: 'scripted', status: 'pass' }, { name: 'fresh user', status: 'open', who: 'user' }, { name: 'GUI look', status: 'open', who: 'user' }] });
put('r1/c-exam.json', exam());
const b1 = board(d1);
eq(b1.results.files, ['a-chain.json', 'b-door.json', 'c-exam.json'], 'three results read in name order');
eq([b1.C.n, b1.C.of, b1.C.open, b1.C.failed], [4, 6, ['model'], ['bot']], 'C from results: 4 of 6, bot failed, model open (state.json map-only ignored)');
eq([b1.D.n, b1.D.of], [1, 3], 'D from results: 1 of 3');
ok(/^1 of 3 door checks pass \(scripted\); open: fresh user \[user\], GUI look \[user\] \[results\/b-door\.json <- plan\/reports\/rep\.md\]$/.test(b1.D.text), 'D text: ' + b1.D.text);
eq(pe(b1).status, 'met', 'port exam 5 of 8 (63%) with gap lists and spawn N of N is met');
ok(/^run SEED-1: SANITY cells 5 of 8 \(63%, below 70%: a listed result\), out 3\/4, in 2\/4, spawn 4 of 4, gap lists 4 of 4 \[results\/c-exam\.json/.test(pe(b1).text), 'port exam text: ' + pe(b1).text);
const t1 = S.render(b1, {});
ok(/^C Chain +4 of 6 built by one script \(unit, map, mission, text\); failed: bot; open: model \[results\/a-chain\.json/m.test(t1), 'board row C');
ok(/^Complete: .*port exam met \(run SEED-1/m.test(t1) && /D open \(1 of 3 checks\)/.test(t1) && /C open \(4 of 6\)/.test(t1), 'Complete line: port exam met, D and C open');
ok(/3 recorded results\)/.test(t1.split('\n')[0]), 'header counts the recorded results');
eq(S.render(board(d1), {}), t1, 'same files, same board, twice');

// ---- 2. SEED: what keeps the port exam open ----
eq(S.portExamOf(exam({ spawn: { n: 3, of: 4 } })).missing, ['spawn 3 of 4'], 'spawn short of N: open');
eq(S.portExamOf(exam({ gapLists: { n: 2, of: 4 } })).missing, ['gap lists 2 of 4'], 'a unit with no gap list: open');
eq(S.portExamOf(exam({ sanity: null })).missing, ['no SANITY cells'], 'no SANITY cells: open');
eq(S.portExamOf(exam({ run: null })).status, 'open', 'no run: open');
const hi = S.portExamOf(exam({ sanity: { cells: { n: 6, of: 8 } } }));
ok(hi.status === 'met' && /SANITY cells 6 of 8 \(75%\),/.test(hi.text) && !/below/.test(hi.text), 'at or above 70%: met, no below note: ' + hi.text);

// ---- 3. SEED: source missing, duplicate item, not a result ----
const d3 = path.join(tmp, 'r3');
put('r3/a.json', exam({ source: 'plan/reports/nosuch.md' }));
put('r3/b.json', exam({ run: 'SEED-B' }));
put('r3/c.json', exam({ run: 'SEED-C' }));
put('r3/d.json', { item: 'C' });
const b3 = board(d3);
eq(b3.results.files, ['b.json'], 'only the file with a real source and first for its item is used');
eq(b3.results.skipped, ['a.json (source plan/reports/nosuch.md not found)', 'c.json (second result for portExam)', 'd.json (not score-result/1)'], 'skipped files and why');
ok(/^run SEED-B/.test(pe(b3).text), 'port exam from b.json');
ok(/^not measured/.test(b3.D.text) && /1 of 6 steps passed \(map\)/.test(b3.C.text), 'no C/D result: state.json as before');

// ---- 4. no results: state.json as before ----
const b4 = S.board({ rowsObj: [], stateObj: state, coverage: none, caps: path.join(tmp, 'nocaps.json') });
eq([b4.results.files, pe(b4).status, pe(b4).text], [[], 'open', 'not run'], 'invented-row board reads no results unless given');

// ---- 5. GOLD: the repo's own results files ----
const R = S.readResults(S.RESULTS_DIR);
eq(R.files, ['chain.json', 'door.json', 'port-exam.json'], 'repo results: chain, door, port exam');
eq(R.skipped, [], 'repo results: none skipped (each source report is there)');
const g = S.board({ rowsObj: [], stateObj: state, coverage: none, results: S.RESULTS_DIR, caps: path.join(tmp, 'nocaps.json') });
const gt = S.render(g, {});
const GOLD = [
  'C Chain       5 of 6 built by one script (unit, map, mission, bot, text); open: model [results/chain.json <- plan/reports/g-chain3.md]',
  'D Door        1 of 3 door checks pass (scripted door); open: fresh Windows user [user], GUI look [user] [results/door.json <- plan/reports/G-DOOR.md]',
];
for (const l of GOLD) ok(gt.split('\n').includes(l), 'GOLD line: ' + l);
eq([pe(g).status, pe(g).exam.n, pe(g).exam.of, Math.round(pe(g).exam.pct)], ['met', 24, 40, 60], 'GOLD port exam: met, 24 of 40 (60%)');
ok(/port exam met \(run G-PORT6: SANITY cells 24 of 40 \(60%, below 70%: a listed result\), out 13\/20, in 11\/20, spawn 20 of 20, gap lists 20 of 20 \[results\/port-exam\.json <- plan\/reports\/G-PORT6\.md\]\)/.test(gt), 'GOLD Complete port exam text');

// ---- 6. row T: play, maps, docs point at existing tests ----
const caps = TT.readCaps(TT.DEF_CAPS), SRC = path.resolve(__dirname, '..', '..', '..');
for (const id of ['play', 'maps', 'docs']) {
  const c = caps.find(x => x.id === id), ts = c && (Array.isArray(c.test) ? c.test : [c.test]);
  ok(c && ts.length && ts.every(t => t && fs.existsSync(path.join(SRC, t))), id + ': every listed test file exists');
  ok(c && ts.every((t, i) => fs.existsSync(path.join(SRC, TT.srcOf(c, i, SRC)))), id + ': every source file exists');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(n + ' checks, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
