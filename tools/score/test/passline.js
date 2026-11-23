#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-44f78dc2)
'use strict';
// pass line (REASSESS-9) against a copy of VOL-1's cells.csv. Expected, (a): 23 of 56 all drawn, 23 of 47 both-fail apart (150mm_type_97 crash kept).
const fs = require('fs'), path = require('path');
const S = require('../score.js');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const HERE = __dirname, csv = fs.readFileSync(path.join(HERE, 'vol1-cells.csv'), 'utf8');
const orig = path.join(HERE, '..', '..', '..', '..', 'run', 'vol1', 'result', 'cells.csv');   // the run folder beside the checkout, when there
if (fs.existsSync(orig)) ok(fs.readFileSync(orig, 'utf8').replace(/\r\n/g, '\n') === csv.replace(/\r\n/g, '\n'), 'the test copy is the VOL-1 cells.csv');
const crashed = JSON.parse(fs.readFileSync(path.join(HERE, 'vol1-crashed.json'), 'utf8'));

const rows = S.parseCells(csv);
eq(rows.length, 56, 'rows');
const A = S.passLine(rows, { crashed });
eq([A.all.pass, A.all.of], [23, 56], 'all drawn');
eq([A.apart.pass, A.apart.of], [23, 47], 'both-fail apart');
eq([A.armed.pass, A.armed.of], [19, 52], 'armed only');
eq([A.armedApart.pass, A.armedApart.of], [19, 43], 'armed only, both-fail apart');
eq(A.bothFail.length, 9, 'both-fail cells apart');
ok(!A.bothFail.includes('150mm_type_97'), 'the crash stays in');
eq(A.unarmed.sort(), ['botond', 'dodge_pol', 'fiat626_fuel', 'renault_fuel'], 'unarmed listed');
eq(A.pick.row, '40 to 70%', 'row picked on both-fail apart'); ok(/both-fail apart/.test(A.pick.on), 'says which count picks it');
eq(A.unfit, false, 'test fit: 9 of 56 is under 1 in 5');
ok(A.short.includes('uk-bl7_2-inch') === false && !A.short.includes('cannone_10528'), 'a cell with no runs is a fail, not short');
ok(A.noProof.length > 0, 'passes without fire proof are listed');
eq(A.mismatch, [], 'the rule gives the same U+/U- and D+/D- as the outcome column of cells.csv');
// the unit decides alone, so a donor column is not needed to pass or fail
eq(A.cells.find(c => c.unit === '3ro').pass, true, '3ro 3 of 6 moved');
eq(A.cells.find(c => c.unit === 'cromwell_mk_i_pol').pass, false, 'no valid move row fails');
eq(A.cells.find(c => c.unit === '37mm_type_94').pass, false, '2 of 5 is under half');
// without the crash list the crash is counted apart: the number moves, and it says so
const B = S.passLine(rows, {});
eq([B.apart.pass, B.apart.of], [23, 46], 'no crash list');
ok(B.warnings.some(w => /crash/.test(w)), 'warns that no crash list was given');
// texture input: a unit listed as missing diffuse fails
const T = S.passLine(rows, { crashed, missingDiffuse: ['us-m2a4', 'm8_fr'] });
eq([T.all.pass, T.all.of], [21, 56], 'two passing units with a missing diffuse fail');
eq([T.apart.pass, T.apart.of], [21, 47], 'a texture fail is not apart');
eq(T.texFail.sort(), ['m8_fr', 'us-m2a4'], 'listed');
const T2 = S.passLine(rows, { crashed, missingDiffuse: ['vickers_6t_b'] });
eq([T2.apart.pass, T2.apart.of], [23, 48], 'a both-fail unit with a missing diffuse fails and is not apart');
// short cells are listed, never dropped
const s = S.passLine(S.parseCells(csv.replace('gun,105mm_wz29,gaz67b,100,5,3,', 'gun,105mm_wz29,gaz67b,100,3,2,')), { crashed });
ok(s.short.includes('105mm_wz29'), 'under 4 valid runs is short'); eq(s.all.of, 56, 'short stays in the draw'); eq(s.all.pass, 22, 'short is not a pass');
// the board prints A from the file
const bd = S.board({ stateObj: {}, rowsObj: [], cellsFile: path.join(HERE, 'vol1-cells.csv'), crashedFile: path.join(HERE, 'vol1-crashed.json'), coverage: '/nonexistent' });
ok(/23 of 56/.test(bd.A.text) && /23 of 47/.test(bd.A.text) && /19 of 52/.test(bd.A.text), 'board A text: ' + bd.A.text);
ok(/40 to 70/.test(bd.A.text), 'board A names the row');
const none = S.board({ stateObj: {}, rowsObj: [], cellsFile: '/nonexistent/cells.csv', coverage: '/nonexistent' });
ok(/not measured/.test(none.A.text), 'no cells file: not measured');
console.log(fails ? fails + ' FAILED of ' + n : 'passline ' + n + ' ok');
process.exit(fails ? 1 : 0);
