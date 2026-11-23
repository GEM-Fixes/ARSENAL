#!/usr/bin/env node
'use strict';
// SPEED-B2 seeded test: classify.js classes + triage-first stop + forward-only count-short, score.js passLine count-short,
// scoreE settled = G + L + I-with-test, Complete line. Invented report.json / game0.log in a temp dir; real ../run sets checked when present.
// Author: Imperator_Aug (ARSENAL, ia-48fbf595)
const fs = require('fs'), path = require('path'), os = require('os');
const C = require('../classify.js'), S = require('../score.js');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-test-'));
const quiet = f => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return f(); } finally { console.log = l; console.error = e; } };

const ctl = { name: 'ctl', control: true, shooter: 'pz6bh', verdict: 'PASS', counted: true, shots: 2, hits: 1 };
const kill = (name, shooter) => ({ name, shooter, verdict: 'PASS', counted: true, shots: 3, hits: 1 });
function game(dir, name, pairs, extra, log) {
  const d = path.join(dir, name); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'report.json'), JSON.stringify(Object.assign({ games: [{ crash: false, errors: [] }], pairs: [ctl].concat(pairs) }, extra || {})));
  if (log) fs.writeFileSync(path.join(d, 'game0.log'), log);
}
// ---- 1. one class per failed group ----
const A = path.join(T, 'newset', 'runs');
const pairsOf = () => [
  kill('pA', 'unita'),                                                                   // 3 of 3 kills: count-short
  { name: 'pB', shooter: 'unitb', verdict: 'NOKILL', counted: false, shots: 0, hits: 0 }, // never-fires
  { name: 'pC', shooter: 'unitc', verdict: 'NOKILL', counted: false, shots: 10, hits: 0 }, // fires-no-hit
  { name: 'pD', shooter: 'unitd', verdict: 'NOKILL', counted: false, shots: 5, hits: 0 }, // HEALTH hit in log: hits-no-kill
  { name: 'pE', shooter: 'unite', verdict: 'NOKILL', counted: false, shots: null, shotsRead: false, hits: 0, noBlast: true }, // MG: fire-unproven
  { name: 'pF', shooter: 'unitf', verdict: 'NOKILL', counted: false, shots: 4, hits: 0 }, // bone line: unit-fault
  { name: 'pG', shooter: 'unitg', verdict: 'NOKILL', counted: false, shots: 0, hits: 0, preflight: { status: 'WARN', notes: ['def lists no weapon'] } }, // unit-fault
  { name: 'pH', shooter: 'unith', verdict: 'NOKILL', counted: false, shots: 0, hits: 0, preflight: { status: 'WARN', notes: ['weapon searchlight not found'] } }, // unit-fault light
];
const LOG = [
  'BLAST[0.2/1]: unitd[5]/gun',
  'HEALTH human[7:crew] : -1750',
  'BLAST[0.2/1]: unitc[6]/gun',
  'HEALTH human[8:crew] : -40',          // small: the shooter's own crew, not a hit
  'HEALTH human[9:x] : -1750',           // not right after a muzzle block: not counted
  "Can't find bone shooter00 in entity unitf[23]",
].join('\r\n');
for (const g of ['r1-g1', 'r2-g1', 'r3-g1']) game(A, g, pairsOf(), null, LOG);
const r = C.classify([A], {});
eq([r.games, r.valid, r.badGames.length, r.stop], [3, 3, 0, null], 'clean set: 3 valid games, no stop');
const cls = Object.fromEntries(r.groups.map(x => [x.pair, x.pass ? 'PASS' : x.class]));
eq(cls, { pA: 'count-short', pB: 'never-fires', pC: 'fires-no-hit', pD: 'hits-no-kill', pE: 'fire-unproven', pF: 'unit-fault', pG: 'unit-fault', pH: 'unit-fault' }, 'one class per group, old rule');
const gD = r.groups.find(x => x.pair === 'pD');
eq(gD.healthHits, 3, 'pD: one HEALTH -1750 right after its muzzle, per game');
eq(r.groups.find(x => x.pair === 'pC').healthHits, 0, 'pC: own-crew -40 and a later line are not hits');
ok(/shooter00/.test(r.groups.find(x => x.pair === 'pF').why), 'pF why names the bone');
ok(/searchlight/.test(r.groups.find(x => x.pair === 'pH').why), 'pH why names the light weapon');
eq(C.classify([A], { noHealth: true }).groups.find(x => x.pair === 'pD').class, 'fires-no-hit', '--no-health: BLAST only, pD reads no hit');
// ---- 2. forward-only count-short ----
const rf = C.classify([A], { countShort: true, setDate: '2026-11-10' });
const pA = rf.groups.find(x => x.pair === 'pA');
eq([pA.pass, pA.tag], [true, '[I] count-short'], 'count-short on a 2026-11-10 set: 3 of 3 passes, tagged [I]');
eq(rf.pass, 1, 'count-short changes nothing else');
eq(C.classify([A], { countShort: true, setDate: '2026-11-08' }).groups.find(x => x.pair === 'pA').pass, false, 'set before 2026-11-09 keeps the old rule');
const OLD = path.join(T, 'C39T', 'runs');
for (const g of ['r1-g1', 'r2-g1', 'r3-g1']) game(OLD, g, [kill('pA', 'unita')]);
eq(C.classify([OLD], { countShort: true, setDate: '2026-11-10' }).groups[0].pass, false, 'a set named C39T keeps the old rule');
eq([S.countShortApplies('x/C39R/runs', Date.parse('2026-11-12T00:00:00')), S.countShortApplies('x/EXAM-N', Date.parse('2026-11-09T00:00:00')), S.countShortApplies('x/EXAM-N', Date.parse('2026-11-08T23:00:00'))], [false, true, false], 'countShortApplies: name and date gate');
// ---- 3. triage-first stop ----
const B = path.join(T, 'stopset', 'runs');
for (let i = 1; i <= 8; i++) game(B, 'r1-g' + i, [kill('p' + i, 'u' + i)]);
for (const i of [9, 10]) game(B, 'r1-g' + i, [kill('p' + i, 'u' + i)], { games: [{ crash: true, errors: ['[01:02:03] unexpected token (eresource.cpp, 62)'] }] });
const rs = C.classify([B], {});
ok(rs.stop && rs.stop.n === 2 && rs.stop.of === 10 && rs.stop.sig === 'unexpected token (eresource.cpp, 62)', 'stop: 2 of 10 crash with one signature (over 10%)');
eq(rs.badGames.map(b => b.class), ['crash-offset', 'crash-offset'], 'crash games read as crash-offset');
eq(quiet(() => C.main([B])), 3, 'main exits 3 on stop');
eq(quiet(() => C.main(['--no-stop', B])), 0, '--no-stop classes anyway, exit 0');
ok(/^stop: one cause unexpected token \(eresource\.cpp, 62\) \(2 games of 10\)$/m.test(C.render(rs)), 'prints the stop line');
fs.rmSync(path.join(B, 'r1-g10'), { recursive: true });
for (let i = 11; i <= 12; i++) game(B, 'r1-g' + i, [kill('p' + i, 'u' + i)]);
eq(C.classify([B], {}).stop, null, '1 crash of 11 is under the bar: no stop');
// void control and rerun replacement
game(B, 'r1-g13', [kill('p13', 'u13')], { pairs: [Object.assign({}, ctl, { verdict: 'NOKILL', counted: false }), kill('p13', 'u13')] });
const rv = C.classify([B], {});
eq(rv.badGames.find(b => b.id === 'r1-g13').class, 'void-control', 'control NOKILL game is void-control');
game(B, 'r1-g13-rerun', [kill('p13', 'u13')]);
eq(C.classify([B], {}).badGames.some(b => b.id === 'r1-g13'), false, 'a valid -rerun replaces the void game');
// ---- 4. score.js passLine count-short ----
const head = 'class,unit,foe,dist,runs,kills,raw_PASS,kills_with_fire_proof,screened_out,noorder,fired,fired_first,mg_muzzles,cannon_muzzles,hits,state,moved,donor,d_dist,d_runs,d_kills,d_raw,d_proof,d_noorder,d_fired,d_mg,d_cannon,d_hits,d_moved,outcome\n';
const cells = S.parseCells(head + 'tank,three,f,300,3,3,3,3,0,0,3,3,0,3,3,,3/3,d,300,3,3,3,3,0,3,0,3,3,3/3,\ntank,four,f,300,4,2,2,2,0,0,4,4,0,4,2,,4/4,d,300,4,2,2,2,0,4,0,4,2,4/4,\n');
const p0 = S.passLine(cells, { crashed: [] }), p1 = S.passLine(cells, { crashed: [], countShort: true });
eq([p0.cells.find(c => c.unit === 'three').pass, p0.countShort.length], [false, 0], 'passLine default: 3 of 3 is short, a fail');
eq([p1.cells.find(c => c.unit === 'three').pass, p1.countShort], [true, ['three']], 'passLine countShort: 3 of 3 passes, listed');
eq(p1.cells.find(c => c.unit === 'four').pass, p0.cells.find(c => c.unit === 'four').pass, 'the 4-run rule is unchanged');
// ---- 5. scoreE settled + Complete ----
const cov = path.join(T, 'coverage.md'), it = path.join(T, 'itests.json');
fs.writeFileSync(cov, '| # | ability | data | tools | now | proven by |\n|---|---|---|---|---|---|\n| C01 | a | d | t | G | x |\n| C02 | b | d | t | I | x |\n| C03 | c | d | t | I | x |\n| C04 | d | d | t | L | x |\n| C05 | e | d | t | F | x |\n\n');
const E0 = S.scoreE(cov, path.join(T, 'none.json'));
eq([E0.n, E0.settled], [2, 2], 'no itests.json: settled = G + L');
ok(/no tools\/score\/itests.json yet/.test(E0.text), 'says itests.json is missing');
fs.writeFileSync(it, JSON.stringify({ C02: { file: 'tools/score/test/classify.js', case: 'x' }, C03: { file: 'tools/score/test/nope.js', case: 'y' } }));
const E1 = S.scoreE(cov, it);
eq([E1.settled, E1.iTest, E1.iNoTest], [3, ['C02'], ['C03']], 'I row counts only when its test file exists');
ok(/settled = G 1 \+ L 1 \+ I-with-test 1 = 3 of 5/.test(E1.text), 'prints settled = G + L + I-with-test');
fs.writeFileSync(it, JSON.stringify({ rows: [{ row: 'C02', file: 'tools/score/test/classify.js' }, { id: 'C03', file: 'tools/score/score.js' }] }));
eq(S.scoreE(cov, it).settled, 4, 'rows-array shape read too');
const K = S.scoreComplete({ Complete: { M5: { status: 'pass', n: 49, of: 59, bar: 48 }, MP: { status: 'open' } } }, E1, S.scoreC({}), S.scoreD({}));
eq(K.items.map(i => i.id + ':' + i.status), ['T:not measured', 'D:not measured', 'C:not measured', 'port exam:open', 'MP:open', 'M5:pass', 'M6:open'], 'Complete: one state per PLAN.md item (T, D, C, port exam, MP, M5, M6)');
const bd = S.board({ rowsObj: [], stateObj: {}, coverage: cov, itests: it, caps: path.join(T, 'none-caps.json') });
ok(/^Complete: +0 of 7/m.test(S.render(bd)), 'board prints a Complete: line');
const real = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'state.json'), 'utf8'));
ok(real.Complete && real.Complete.M5 && 'evidence' in real.C.steps.unit && 'run' in real.D.checks[0], 'state.json has Complete and C/D evidence fields');
// ---- 6. real sets, when present (C39T cause list, reproof3 stop) ----
const RUN = path.resolve(__dirname, '..', '..', '..', '..', 'run');
if (fs.existsSync(path.join(RUN, 'C39T', 'runs')) && fs.existsSync(path.join(RUN, 'reproof3', 'c39', 'pick.json'))) {
  const R = C.classify([path.join(RUN, 'reproof3', 'c39'), path.join(RUN, 'C39R'), path.join(RUN, 'C39T')], {});
  eq([R.pass, R.groups.length], [49, 58], 'C39 merged: 49 of 58 picked groups (c39t.md 49/59)');
  eq(Object.fromEntries(R.groups.filter(x => !x.pass).map(x => [String(x.g).split(':')[0], x.class])), { g12: 'hits-no-kill', g14: 'fire-unproven', g19: 'fire-unproven', g33: 'hits-no-kill', g34: 'unit-fault', g40: 'unit-fault', g41: 'unit-fault', g51: 'fires-no-hit', g52: 'fire-unproven' }, 'C39 fail classes (c39t.md + c39f.md)');
  const R3 = C.classify([path.join(RUN, 'reproof3', 'c39')], {});
  ok(R3.stop && /eresource\.cpp, 62/.test(R3.stop.sig), 'reproof3 c39 alone stops on eresource.cpp, 62');
  eq(C.classify([path.join(RUN, 'reproof3', 'c39'), path.join(RUN, 'C39R'), path.join(RUN, 'C39T')], { countShort: true }).pass, 49, 'C39 with --count-short stays 49 (old sets keep the old rule)');
} else console.log('skip: ../run C39 sets not present');
fs.rmSync(T, { recursive: true, force: true });
console.log((fails ? 'FAIL ' : 'PASS ') + (n - fails) + ' of ' + n);
process.exitCode = fails ? 1 : 0;
