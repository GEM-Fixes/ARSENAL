#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-94cd45b3)
'use strict';
// Test for tools/score/score.js with invented rows (no real report.json read). Run: node tools/score/test/test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../score.js');

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

// ---- invented report builder, goes through the real addRun ----
let seq = 0;
function report(mods, pairs, o) {
  o = o || {};
  return {
    mods: ['as64+'].concat(mods),
    games: [{ void: !!o.void, crash: !!o.crash, errors: o.errors || [], pipe: ['{"output":["Built  : 2026.01.01 10:00 - 0xABCD"]}'] }],
    pairs: [{ name: 'ctlpz', class: 'vehicle', shooter: 'pz6bh', foe: 't34_0', verdict: o.ctl || 'PASS', control: true }].concat(pairs),
  };
}
const pair = (cell, rep, verdict) => cell === 'fo'
  ? { name: 'fo_' + rep, class: 'vehicle', shooter: rep, foe: 'gaz67b', verdict }
  : { name: 'di_' + rep, class: 'vehicle', shooter: 'pz6bh', foe: rep, verdict };
function mk(runs) { // runs: [{w, s, r, mods, pairs, opts}]
  const rows = [];
  for (const x of runs) S.addRun(rows, report(x.mods, x.pairs, x.opts), x.w || 'w1', x.s || 'S', x.r || ('r' + (++seq)), 'invented/' + (x.r || seq));
  return rows;
}

// ---- 1. the contradiction: 27 reps, two rule sets, one count each, named ----
const reps = Array.from({ length: 27 }, (_, i) => 'unit' + String(i + 1).padStart(2, '0'));
const runs = [];
// 22 tool-built reps (unit01..unit22) pass fire-out and damage-in, twice each
for (const rep of reps.slice(0, 22)) {
  runs.push({ mods: ['b8r4_x'], r: 'r1', pairs: [pair('fo', rep, 'PASS'), pair('di', rep, 'PASS')] });
  runs.push({ mods: ['b8r4_x'], r: 'r2', pairs: [pair('fo', rep, 'PASS'), pair('di', rep, 'PASS')] });
}
// unit23..25 pass fire-out on a hand-fit build only; unit26, 27 fail fire-out everywhere
for (const rep of reps.slice(22, 25)) runs.push({ mods: ['b8t_hand'], r: 'r3', pairs: [pair('fo', rep, 'PASS')] });
for (const rep of reps.slice(25)) runs.push({ mods: ['b8r4_x'], r: 'r3', pairs: [pair('fo', rep, 'NOKILL')] });
const rows = mk(runs);
const state = { B: { reps, wrongGun: ['unit01', 'unit02', 'unit03'] }, C: { steps: {} }, D: { checks: [] } };
const none = path.join(os.tmpdir(), 'score-test-no-such-file.md');
const bd = S.board({ rowsObj: rows, stateObj: state, coverage: none });
const byId = {}; for (const r of bd.B) byId[r.rule.id] = r;
eq(byId['fire-out-any/all-builds'].pass, 25, 'fire-out-any/all-builds passes 25 (22 tool + 3 hand)');
eq(byId['fire-out-any/all-builds'].measured, 27, 'fire-out-any/all-builds measures 27');
eq(byId['fire-out-any/all-builds'].hand, 3, 'three of the 25 are hand only');
eq(byId['both-any/tool'].pass, 22, 'both-any/tool passes 22');
eq(byId['both-latest/tool'].measured, 22, 'both-latest/tool measured 22 (the 5 without damage-in rows are unmeasured, not failed)');
eq(byId['both-latest+gun+clean/tool'].pass, 19, 'gun rule: 22 less 3 wrong gun = 19');
eq(byId['both-latest+gun+clean/tool'].measured, 22, 'gun rule measured 22');
ok(new Set(bd.B.map(r => r.rule.id)).size === bd.B.length, 'every rule set has its own name');
// same reports, same answer, run twice
const again = S.board({ rowsObj: rows, stateObj: state, coverage: none });
eq(JSON.stringify(again.B.map(r => [r.rule.id, r.pass, r.measured])), JSON.stringify(bd.B.map(r => [r.rule.id, r.pass, r.measured])), 'two runs over the same rows give the same counts');
const text = S.render(bd, {});
ok(/25 of 27 measured/.test(text) && /19 of 22 measured/.test(text), 'render prints 25 of 27 and 19 of 22, each beside its rule set');
ok(/fire-out-any\/all-builds\s+25 of 27/.test(text) && /both-latest\+gun\+clean\/tool\s+19 of 22/.test(text), 'each count sits on its own rule-set line');

// ---- 2. one run only ----
const single = byId['both-latest/tool'].single;
eq(single.length, 2, 'only unit26 and unit27 (one fire-out run each) rest on one run; the two-run reps are not listed');
ok(single.every(s => /^unit2[67] fo/.test(s)), 'the listed cells are those two');
const rows2 = mk([{ mods: ['b8r4_x'], pairs: [pair('fo', 'solo', 'PASS'), pair('di', 'solo', 'PASS')] }]);
const b2 = S.board({ rowsObj: rows2, stateObj: { B: { reps: ['solo'] } }, coverage: none });
eq(b2.B[2].single.length, 2, 'both cells of a one-run rep are listed');
ok(/solo fo/.test(S.render(b2, {})) && /solo di/.test(S.render(b2, {})), 'render lists the one-run cells');

// ---- 3. latest vs any ----
const rows3 = mk([
  { mods: ['b8r3_x'], w: 'w1', pairs: [pair('fo', 'up', 'NOKILL'), pair('di', 'up', 'PASS'), pair('fo', 'down', 'PASS'), pair('di', 'down', 'PASS')] },
  { mods: ['b8r3_x'], w: 'w2', pairs: [pair('fo', 'up', 'PASS'), pair('fo', 'down', 'NOKILL')] },
]);
const b3 = S.board({ rowsObj: rows3, stateObj: { B: { reps: ['up', 'down'] } }, coverage: none });
const m3 = {}; for (const r of b3.B) m3[r.rule.id] = r;
eq(m3['both-any/tool'].pass, 2, 'any: both reps have a pass in each cell');
eq(m3['both-latest/tool'].pass, 1, 'latest: only the rep whose last run passed');
eq(m3['both-latest/tool'].per.find(p => p.rep === 'down').status, 'fail', 'down fails on its latest run');

// ---- 4. invalid runs do not count: control failed, void game, ERROR verdict ----
const rows4 = mk([
  { mods: ['b8r4_x'], pairs: [pair('fo', 'v', 'PASS'), pair('di', 'v', 'PASS')], opts: { ctl: 'NOKILL' } },
  { mods: ['b8r4_x'], pairs: [pair('fo', 'w', 'PASS'), pair('di', 'w', 'ERROR')] },
  { mods: ['b8r4_x'], pairs: [pair('fo', 'x', 'PASS'), pair('di', 'x', 'PASS')], opts: { void: true } },
]);
const b4 = S.board({ rowsObj: rows4, stateObj: { B: { reps: ['v', 'w', 'x'] } }, coverage: none });
eq(b4.B[2].measured, 0, 'no valid cell pair: measured 0');
ok(/B Regression\s+not measured/.test(S.render(b4, {})), 'score with no valid data prints "not measured"');
ok(!/\b0 of 0\b/.test(S.render(b4, {})) && !/B Regression\s+0 of/.test(S.render(b4, {})), 'never prints a zero count for no data');

// ---- 5. name variants, load-clean ----
ok(!S.isVariant('fo_us_m8_grayhound_2', 'us-m8_grayhound_2'), 'rep name ending _2 is not a distance variant');
ok(S.isVariant('fo_us_m8_grayhound_2_t34', 'us-m8_grayhound_2'), 'foe suffix _t34 is a variant');
ok(S.isVariant('fo_cckw_inf', 'cckw_m33'), 'suffix _inf is a variant');
ok(S.loadClean({ errors: ['[00:00:19] no "pivot_front" bones in x'] }), 'a warning line keeps a game load-clean');
ok(!S.loadClean({ errors: ['ERROR: cannot open x'] }), 'an ERROR line breaks load-clean');
ok(!S.loadClean({ crash: true, errors: [] }), 'a crash breaks load-clean');
const rows5 = mk([{ mods: ['b8r4_x'], pairs: [pair('fo', 'c', 'PASS'), pair('di', 'c', 'PASS')], opts: { errors: ['FATAL x'] } }]);
const b5 = S.board({ rowsObj: rows5, stateObj: { B: { reps: ['c'] } }, coverage: none });
eq(b5.B[2].pass, 1, 'both-latest/tool passes a rep with an error line');
eq(b5.B[3].pass, 0, 'gun+clean rule fails it, and measured is 1 so the zero is real');
eq(b5.B[3].measured, 1, 'measured 1');
eq(rows5[0].build.indexOf('0xABCD') >= 0, true, 'build tag carries the exe stamp');

// ---- 6. C, D, E ----
ok(/^not measured/.test(S.scoreC({ C: { steps: { unit: { status: 'first-look' } } } }).text), 'C with first looks only is not measured');
eq(S.scoreC({ C: { steps: { unit: { status: 'pass' }, map: { status: 'pass' }, bot: { status: 'fail' } } } }).n, 2, 'C counts 2 passed steps');
ok(/2 of 6/.test(S.scoreC({ C: { steps: { unit: { status: 'pass' }, map: { status: 'pass' } } } }).text), 'C text says 2 of 6');
ok(/^not measured/.test(S.scoreD({ D: { checks: [{ name: 'a', status: 'open' }] } }).text), 'D with all checks open is not measured');
eq(S.scoreD({ D: { checks: [{ name: 'a', status: 'pass' }, { name: 'b', status: 'open' }] } }).n, 1, 'D counts one pass');
const cov = path.join(os.tmpdir(), 'score-test-coverage.md');
const head = '| # | ability | data | tools | now | proven by |\n|---|---|---|---|---|---|\n';
fs.writeFileSync(cov, head + '| C01 | a | d | t | G | x |\n| C02 | b | d | t | F | x |\n| C03 | c | d | t | L | x |\n| C04 | d | d | t | R | x |\n\ntext\n');
const e1 = S.scoreE(cov);
eq(e1.n, 2, 'E: one G and one limit row make 2 proven'); eq(e1.of, 4, 'E: 4 ability rows');
fs.writeFileSync(cov, head + '| C01 | a | d | t | F | x |\n| C02 | b | d | t | N | x |\n\n');
ok(/^not measured/.test(S.scoreE(cov).text), 'E with no G rows is not measured, not zero');
ok(/^not measured/.test(S.scoreE(none).text), 'E with no file is not measured');
fs.unlinkSync(cov);

// ---- 7. board with nothing: A and N never print a number ----
ok(/^not measured/.test(bd.A.text) && /^not measured/.test(bd.N.text), 'A and N print not measured');

// ---- 8. ZSHOT-1: a kill with 0 shots never counts ----
const kr = (counted, shots) => ({ name: 'x_seed', verdict: 'PASS', counted, shots });
eq(S.countKills([kr(true, 0)]), 0, 'seeded 0-shot kill does not count');
eq(S.countKills([kr(true, 5)]), 1, 'a kill with shots counts');
eq(S.countKills([kr(true, null), kr(true, undefined)]), 2, 'shots not read (null) is not a zero: the kill stays');
// SILENT-1F: edrun now writes shots null + noBlast for a gun with no muzzle blast. null is unknown: it never drops the kill, an old 0 still does
eq(S.countKills([{ ...kr(true, null), noBlast: 'muzzle_zenite' }]), 1, 'a no-blast gun with a kill counts');
ok(!S.zeroShot({ shots: null, noBlast: 'muzzle_minimum' }), 'a no-blast gun is not a zero-shot row');
eq(S.countKills([{ ...kr(true, 0), mgShots: 0, cannonShots: 0 }]), 0, 'an old report row with its old fields scores as before');
eq(S.countKills([kr(false, 5)]), 0, 'edrun did not count it: still not counted');
eq(S.countKills([kr(true, 0), kr(true, 3), kr(true, 0), kr(false, 0)]), 1, 'mixed rows: only the shot kill counts');
ok(!S.zeroShot({ shots: 0, shotsRead: false }) && S.countKills([{ ...kr(true, 0), shotsRead: false }]) === 1, 'VOL-FX: an unread 0 (shotsRead false) is not a zero');
ok(S.zeroShot({ shots: 0 }) && !S.zeroShot({ shots: 1 }) && !S.zeroShot({ shots: null }) && !S.zeroShot({}), 'zeroShot reads a measured 0 only');
// through the pass line: the cells row a result step writes with the zero-shot kills left out
const zh = 'class,unit,runs,kills,kills_with_fire_proof,screened_out,noorder,fired,state,moved,outcome\n';
const zc = S.parseCells(zh + 'light,seed,6,2,2,zeroshot:4,0,Y,mixed,1/1,U-D-\nlight,seed2,6,4,4,,0,Y,mixed,1/1,U-D-\n');
const zp = S.passLine(zc, { crashed: [] });
eq(zp.cells[0].pass, false, 'seed: 2 of 6 after the zero-shot kills left out is a fail');
eq(zp.cells[1].pass, true, 'seed2: 4 of 6 passes');
ok(zp.zeroShot.length === 1 && /^seed zeroshot:4/.test(zp.zeroShot[0]), 'the zero-shot drops are listed');

console.log(n + ' checks, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
