// as-read rules added to fix/lib/textfix.js: repeated key, stray ')', ricochet row, thunder with no sound. Rules run on lines in memory.
// usage: node tools/fix/test/asread2.test.js
// Author: Imperator_Aug (ARSENAL, ia-9dc9c398)
const { RULES } = require('../lib/textfix');
let n = 0, bad = 0;
const ok = (c, m, x) => { n++; if (!c) { bad++; console.log('FAIL ' + m + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };
const run = (code, msg, lines, line, key = 'resource/entity/x.def') => { const p = RULES[code].parse(msg); return p ? RULES[code].fix(p, lines[line - 1], { key, line, work: lines }) : p; };

// ---- KEY_REPEAT
const KR = '{totalparticles} repeated in one block; vanilla never repeats it (867 uses); scalar: last wins (SDL-46)';
const gen = ['{generator', '\t{totalparticles 8}', '\t{emissionarea', '\t\t{totalparticles 5}', '\t}', '\t{axisz}', '\t{totalparticles 2} ; later', '}'];
let r = run('KEY_REPEAT', KR, gen, 7);
ok(r.blank && r.blank.length === 1 && r.blank[0] === 2 && /later line/.test(r.why), 'earlier copy in the same block is the one emptied; the nested one is passed over', r);
r = run('KEY_REPEAT', KR, ['{a', '\t{totalparticles 8}', '}', '{b', '\t{totalparticles 2}', '}'], 5);
ok(r.no === 'ambiguous', 'a copy in another block is not taken', r);
r = run('KEY_REPEAT', KR, ['{g', '\t{totalparticles 8}', '\t{totalparticles 4}', '\t{totalparticles 2}', '}'], 4);
ok(r.no === 'ambiguous', 'two earlier copies: refused', r);
r = run('KEY_REPEAT', KR, ['{g', '\t{totalparticles 8} {x 1}', '\t{totalparticles 2}', '}'], 3);
ok(r.no === 'ambiguous', 'earlier copy sharing its line: refused', r);
r = run('KEY_REPEAT', KR, ['{g', '\t{totalparticles 8}', '\t{totalparticles 2} {x}', '}'], 3);
ok(r.no === 'not_on_line', 'finding line with other text: refused', r);
const ENV = '{environment} repeated in one block; vanilla never repeats it (216 uses); scalar: last wins (SDL-46)';
r = run('KEY_REPEAT', ENV, ['{mission', '\t{Environment "multi/a"}', '\t{Tags "x" {0x1 "}"}}', '\t{Environment "multi/b"}', '}'], 4, 'resource/map/multi/m/0.mi');
ok(r.no === 'ambiguous' && /mission file/.test(r.msg), 'mission file, different values: refused', r);
r = run('KEY_REPEAT', ENV, ['{mission', '\t{Environment "multi/a"}', '\t{Tags "x" {0x1 "}"}}', '\t{Environment  "multi/a"}', '}'], 4, 'resource/map/multi/m/0.mi');
ok(r.blank && r.blank[0] === 2 && /the same/.test(r.why), 'mission file, same value: emptied (a brace inside a string does not count)', r);

// ---- PAREN_STRAY
const PS = "stray ')' silently dropped by the engine (hides mis-nesting)";
r = run('PAREN_STRAY', PS, ['{a 1}', '\t)\r', '{b 2}'], 2);
ok(r.blank && r.blank[0] === 2, 'a line with only the bracket is emptied', r);
r = run('PAREN_STRAY', PS, ['{a 1})'], 1);
ok(r.no === 'not_on_line', 'a bracket after other text: refused', r);

// ---- RICOCHET_CLAMP
const RC = 'ricochet angle row {10 20}: out > in: engine logs WARNING Invalid ricochet angle and clamps out = in';
r = run('RICOCHET_CLAMP', RC, ['\t\t\t\t{10\t20}'], 1);
ok(r.L === '\t\t\t\t{10\t10}', 'out written as in', r);
r = run('RICOCHET_CLAMP', RC, ['{10 20} {10 20}'], 1);
ok(r.no === 'not_on_line', 'two such rows on a line: refused', r);
r = run('RICOCHET_CLAMP', RC, ['{10 200}'], 1);
ok(r.no === 'not_on_line', 'another number that starts the same: refused', r);

// ---- THUNDER_NO_SOUND
const TH = 'thunder is enabled but has no/empty {sound}: it never strikes (VIS-14)';
r = run('THUNDER_NO_SOUND', TH, ['\t{thunder\r', '\t\t{enable}\r', '\t\t{color 0xff686c73}\r', '\t}\r', '\t{grain\r', '\t\t{enable}\r', '\t}\r'], 1);
ok(r.blank && r.blank.length === 1 && r.blank[0] === 2, 'only the {enable} of the thunder block', r);
r = run('THUNDER_NO_SOUND', TH, ['{thunder {enable}}'], 1);
ok(r.no === 'not_on_line', 'one-line thunder block: refused', r);
r = run('THUNDER_NO_SOUND', TH, ['{thunder', '\t{color 1} {enable}', '}'], 1);
ok(r.no === 'ambiguous', '{enable} sharing its line: refused', r);

console.log(bad ? bad + ' of ' + n + ' failed' : 'asread2 ' + n + ' PASS');
process.exit(bad ? 1 : 0);
