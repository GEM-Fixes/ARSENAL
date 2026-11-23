#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-a0063a68)
'use strict';
// Test for rows N (distinct units, newest wins), P, L, R of score.js with fixture records in a temp dir. No game.
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../score.js');

let fails = 0;
const eq = (a, b, msg) => { if (a !== b) { fails++; console.log('FAIL: ' + msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'score-rows-'));
const w = (rel, obj, t) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj)); if (t) fs.utimesSync(f, t, t); return f; };

// N: unit a is in two records, the newer one wins (clean), b only in the old one (1 finding), c skipped
w('native/old.json', { form: 'native/1', units: [{ unit: 'a', findings: 5 }, { unit: 'b', findings: 1 }] }, 1000);
w('native/new.json', { form: 'native/1', units: [{ unit: 'a', findings: 0 }, { unit: 'c', skipped: true }] }, 2000);
w('native/junk.json', { form: 'other', units: [{ unit: 'z', findings: 0 }] }, 3000);
let n = S.scoreN(path.join(tmp, 'native'));
eq(n.of, 2, 'N distinct units'); eq(n.n, 1, 'N native'); eq(n.skipped, 1, 'N skipped'); eq(n.records, 4, 'N records seen');
eq(S.scoreN(path.join(tmp, 'nope')).measured, false, 'N absent');

// P: two units, one native; census present / absent
w('verdict/v.json', { form: 'verdict/1', mod: 'm', units: [{ unit: 'u1', native: true }, { unit: 'u2', native: false }], counts: {} });
const cen = w('census/census.json', { form: 'census/1', asked: 50, done: 30, native: 12 });
let p = S.scoreP(path.join(tmp, 'verdict'), cen);
eq(p.n, 1, 'P native'); eq(p.of, 2, 'P of'); eq(/census: 12 native of 30 done of 50 asked/.test(p.text), true, 'P census text');
p = S.scoreP(path.join(tmp, 'verdict'), path.join(tmp, 'none.json'));
eq(/census: no record/.test(p.text), true, 'P census absent');
p = S.scoreP(path.join(tmp, 'nodir'), null);
eq(p.measured, false, 'P absent'); eq(/^no record/.test(p.text), true, 'P absent text');

// L: codes dup across parts (done wins), kind tool counts, lim null does not; rows classed, dead left
w('lm/a.json', { form: 'limmap/1', codes: { A: { lim: ['X-1'] }, B: { kind: 'tool' }, C: { lim: null }, D: { new: {} } } });
w('lm/b.json', { form: 'limmap/1', codes: { C: { lim: ['X-2'] }, E: { open: 'x' } } });
w('lc/X.json', { form: 'limclass/1', rows: { 'X-1': { chk: 'built', class: 'crash' }, 'X-2': { chk: null, class: null }, 'X-3': { chk: 'never', class: 'info' } }, dead: [{ row: 'X-1', fix: null }, { row: 'X-3', fix: { code: 'Q' } }] });
let l = S.scoreL(path.join(tmp, 'lm'), path.join(tmp, 'lc'));
eq(l.codes.mapped, 3, 'L mapped'); eq(l.codes.of, 5, 'L codes'); eq(l.rows.classed, 2, 'L classed'); eq(l.rows.of, 3, 'L rows'); eq(l.dead, 1, 'L dead');
eq(S.scoreL(path.join(tmp, 'x1'), path.join(tmp, 'x2')).measured, false, 'L absent');

// R
const d = w('determ/determ.json', { form: 'determ/1', commands: [{ id: 'c1', tool: 't', same: true }, { id: 'c2', tool: 't', same: false }], counts: { all: 2, same: 1 } });
let r = S.scoreR(d);
eq(r.n, 1, 'R same'); eq(r.of, 2, 'R all'); eq(/differ: c2/.test(r.text), true, 'R differ');
r = S.scoreR(path.join(tmp, 'none.json'));
eq(r.measured, false, 'R absent'); eq(/no record/.test(r.text), true, 'R absent text');

// the board prints with every input absent
const bd = S.board({ rowsObj: [], stateObj: {}, nativeDir: path.join(tmp, 'zz'), verdictDir: path.join(tmp, 'zz'), census: path.join(tmp, 'zz.json'), limmapDir: path.join(tmp, 'zz'), limclassDir: path.join(tmp, 'zz'), determ: path.join(tmp, 'zz.json') });
const out = S.render(bd, {});
for (const k of ['N Native', 'P Port verdict', 'L Limits', 'R Determinism']) eq(out.includes(k), true, 'board has ' + k);
eq(/P Port verdict no record/.test(out), true, 'board P no record');

fs.rmSync(tmp, { recursive: true, force: true });
if (fails) { console.log(fails + ' FAIL'); process.exit(1); }
console.log('rows: ok');
