// Author: Imperator_Aug (ARSENAL, ia-a10fb7e1)
'use strict';
// seeded test for runs.js (SCOREA): newest valid run per unit, void games never count, attributed vs proven, source named. Temp dir, no game.
const fs = require('fs'), path = require('path'), os = require('os');
const R = require('../runs.js'), S = require('../score.js');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } else console.log('ok   ' + m); };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scorea-'));
const w = (f, d) => { const p = path.join(root, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof d === 'string' ? d : JSON.stringify(d)); };
const kill = (name, x) => Object.assign({ name, verdict: 'PASS', counted: true, proof: 'muzzle', shots: 3, kill: 5, order: 1 }, x || {});
const miss = name => ({ name, verdict: 'FAIL', counted: false, shots: 3, kill: null, order: 1 });
const ctl = (v) => ({ name: 'ctl', control: true, verdict: v || 'PASS' });
const game = (rows, o) => ({ games: [Object.assign({ void: false }, o && o.game)], pairs: [ctl(o && o.ctl)].concat(rows) });
const n = (k, f) => Array.from({ length: k }, (_, i) => f(i));

w('base/cells.csv', 'unit,class,state,fired,moved,d_fired,d_moved\r\nu1,tank,ok,yes,-,yes,-\r\nu2,tank,ok,yes,-,yes,-\r\nu3,tank,ok,yes,-,yes,-\r\nu4,tank,ok,yes,-,yes,-\r\nu5,tank,ok,yes,-,yes,-\r\n');
w('units.json', { units: ['u1', 'u2', 'u3', 'u4', 'u5'].map(u => ({ rep: u, examPair: 'x_' + u, donorPair: 'd_' + u })) });
w('base/crashed.json', ['u3']);
// old exam stage: u1 kills 4/4 (muzzle), u2 hp kills 4/4, u3 crashed, u4 misses 4/4, u5 misses 4/4; donors all kill
const donors = ['u1', 'u2', 'u3', 'u4', 'u5'].map(u => n(4, () => kill('d_' + u)));
w('old/s/g1/report.json', game([].concat(n(4, () => kill('x_u1')), n(4, () => kill('x_u2', { proof: 'hp', shots: null, shotsRead: false })), n(4, () => miss('x_u4')), n(4, () => miss('x_u5')), ...donors)));
// newer stage: u1 now misses 4/4 (newer valid run wins over the older kills); u4 kills 4/4 in a valid game
w('new/s/g1/report.json', game([].concat(n(4, () => miss('x_u1')), n(4, () => kill('x_u4')))));
// newest stages: u4 misses in a void game (void true), u5 kills in a game whose control failed: neither may count; u1 kills in 2 valid rows (short: skipped)
w('void/s/g1/report.json', game(n(4, () => miss('x_u4')), { game: { void: true } }));
w('void/s/g2/report.json', game(n(4, () => kill('x_u5')), { ctl: 'FAIL' }));
w('short/s/g1/report.json', game(n(2, () => kill('x_u1'))));
const cfg = { exams: [{ id: 'T', units: 'units.json', base: 'base/cells.csv', crashed: 'base/crashed.json', diffuse: 'none.txt', stages: [
  { id: 'old', dirs: ['old/s'], mode: 'order', at: '2026-01-01T00:00Z', exam: true },
  { id: 'new', dirs: ['new/s'], mode: 'order', at: '2026-02-01T00:00Z' },
  { id: 'void', dirs: ['void/s'], mode: 'order', at: '2026-03-01T00:00Z' },
  { id: 'short', dirs: ['short/s'], mode: 'order', at: '2026-04-01T00:00Z' },
  { id: 'ff', dirs: ['old/s'], mode: 'freefire', at: '2026-05-01T00:00Z' },
] }] };
const res = R.scoreRuns({ cfg, runRoot: root });
const ex = res.head, A = ex.rules.attributed, P = ex.rules.proven;
const cell = (rule, u) => rule.passLine.cells.find(c => c.unit === u), src = (rule, u) => rule.src.find(s => s.unit === u);
ok(res.measured && ex.id === 'T', 'measured, head exam named');
ok(!cell(A, 'u1').pass && src(A, 'u1').U.stage === 'new', 'older kills never override a newer valid run (u1 from new: ' + src(A, 'u1').U.stage + ')');
ok(src(A, 'u1').skipU.some(t => /^short \(2 valid\)/.test(t)), 'a newer stage under 4 valid rows is skipped and listed: ' + src(A, 'u1').skipU.join('; '));
ok(cell(A, 'u4').pass && src(A, 'u4').U.stage === 'new', 'a void game (void true) never overrides: u4 stays on new');
ok(src(A, 'u4').skipU.some(t => /^void \(0 valid, 4 in void games\)/.test(t)), 'void rows are listed, not counted');
ok(!cell(A, 'u5').pass && src(A, 'u5').U.stage === 'old', 'a game whose control failed never counts: u5 kills there ignored');
ok(!cell(A, 'u2').pass && cell(P, 'u2').pass, 'hp-only kills: proven yes, attributed no');
ok(cell(A, 'u3').why === 'crash', 'exam crash stands while no newer stage ran the unit');
ok(src(A, 'u1').D.stage === 'old' && src(A, 'u1').D.kills === 4, 'donor side named with its stage');
ok(ex.stages.find(s => s.id === 'void').void === 2, 'void stage counts its 2 void games');
ok(!ex.rules.proven.src.some(s => (s.U && s.U.stage === 'ff') || (s.D && s.D.stage === 'ff')), 'free-fire stage never picked');
ok(ex.examOnly.cells.find(c => c.unit === 'u1').pass, 'exam-only line reads the exam stage only (u1 passes there)');
ok(R.srcTable(ex, 'attributed').some(l => /^u1 \| tank \| fail \| .* \| new 0\/4 \| old 4\/4/.test(l)), 'source table names the run per cell');
// the board prints it as A, keeps the legacy line
const bd = S.board({ stateObj: {}, rowsObj: [], runsCfg: cfg, runRoot: root, coverage: '/nonexistent' });
const txt = S.render(bd, { runsDetail: true, allRules: true });
const txt1 = S.render(bd, { runsDetail: true });
ok(!/ legacy  /.test(txt1) && !/^ +proven  /m.test(txt1) && !/exam only/.test(txt1) && /^  T +attributed  /m.test(txt1), 'default A: attributed only; proven, exam only, legacy behind --all-rules');
ok(/^ +proven  /m.test(txt) && /exam only/.test(txt), '--all-rules prints proven and exam only');
ok(txt1.split('\n').filter(l => /attributed  /.test(l)).join() === txt.split('\n').filter(l => /attributed  /.test(l)).join(), 'attributed lines are the same with and without --all-rules');
ok(/A Port\s+1 of 5 .*\[T, newest valid run per unit/.test(txt), 'board A Port from runs: ' + txt.split('\n').find(l => /A Port/.test(l)));
ok(/ legacy  not measured/.test(txt) && /A sources T \(attributed\)/.test(txt), 'legacy line and sources printed');
fs.rmSync(root, { recursive: true, force: true });
if (bad) { console.log(bad + ' FAIL'); process.exit(1); }
console.log('runs: all ok');
