// Author: Imperator_Aug (ARSENAL, ia-303c92b9)
'use strict';
// tools/index/test/test.js: check.js on a made-up router (tools/index/test/work, rebuilt each run), then on the real one.
// usage: node tools/index/test/test.js
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = path.join(__dirname, 'work'), CHECK = path.join(__dirname, 'check.js');
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL ' + m); } };
const put = (rel, text) => { const p = path.join(W, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const run = root => { const r = cp.spawnSync(process.execPath, [CHECK, root], { encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
const crlf = ls => ls.join('\r\n') + '\r\n';

function fixture(lines, extra) {
  fs.rmSync(W, { recursive: true, force: true });
  put('tools/INDEX.md', crlf(['# router', '', 'group | holds | tools', 'run | runs | alpha beta gamma', '- gamma — a bullet note']));
  // alpha takes --exe through a sibling it requires; beta takes it itself; nogo takes none
  put('tools/alpha/alpha.js', "const g = require('./games');\n");
  put('tools/alpha/games.js', "// --exe as64|mowas_2|goh\n");
  put('tools/beta/beta.js', "// usage: beta [--exe as64|mowas_2|mowas2|goh]\n");
  put('tools/nogo/nogo.js', "// usage: nogo <dir>\n");
  put('tools/index/run.md', extra ? extra : crlf(lines));
}
const good = [
  'alpha | node tools/alpha/alpha.js <dir> [--exe as64\\|mowas_2\\|goh] | ROW-01 | the alpha check; goh refused',
  'beta  | node tools/beta/beta.js [--exe as64\\|mowas_2\\|mowas2\\|goh] \\| --vfs | - | beta; MoW:AS2 view without as64/core',
  'beta sub | node tools/beta/beta.js sub | - | a sub-entry files under beta after the main line',
];

// 1. a clean router passes, a sub-entry is not a duplicate, a group name with a bullet counts as listed
fixture(good);
let r = run(W);
ok(r.code === 0 && /PASS 2 tool lines, 0 info/.test(r.out), 'clean router passes:\n' + r.out);

// 2. each fault is named
fixture(good.concat([
  'alpha | node tools/alpha/alpha.js again | - | second main line',                 // IDX_DUP
  'nogo | node tools/nogo/nogo.js <dir> [--exe as64] | - | promises --exe',          // IDX_EXE_SRC
  'thin | node tools/thin/thin.js | only three fields',                              // IDX_FIELDS
  'pathy | node tools/pathy/pathy.js --out C:/run/x | - | a drive path',             // IDX_PATH
  'mixed | node tools/beta/beta.js [--exe goh]; node tools/nogo/nogo.js [--exe goh] | - | second tool lacks it', // IDX_EXE_SRC (nogo only)
]));
r = run(W);
ok(r.code === 1, 'faults exit 1');
ok(/IDX_DUP index\/run\.md:4: alpha also at index\/run\.md:1/.test(r.out), 'IDX_DUP named:\n' + r.out);
ok(/IDX_EXE_SRC index\/run\.md:5: nogo: tools\/nogo\/nogo\.js has no --exe/.test(r.out), 'IDX_EXE_SRC named');
ok(/IDX_FIELDS index\/run\.md:6: thin: 3 fields/.test(r.out), 'IDX_FIELDS named');
ok(/IDX_PATH index\/run\.md:7: pathy/.test(r.out), 'IDX_PATH named');
ok(/IDX_EXE_SRC index\/run\.md:8: mixed: tools\/nogo\/nogo\.js/.test(r.out) && !/index\/run\.md:8: mixed: tools\/beta/.test(r.out), 'IDX_EXE_SRC picks the nearest tool before each --exe');
ok(/info IDX_GROUP run: alpha/.test(r.out) === false, 'alpha is listed');

// 3. LF line endings and a group tool with no line
fixture(null, good.join('\n') + '\n');
put('tools/INDEX.md', crlf(['group | holds | tools', 'run | runs | alpha beta lost']));
r = run(W);
ok(r.code === 1 && /IDX_CRLF index\/run\.md:1/.test(r.out), 'IDX_CRLF named');
ok(/info IDX_GROUP run: lost has no line/.test(r.out), 'IDX_GROUP info for a tool with no line');

// 4. the real router of this checkout
r = run(path.join(__dirname, '..', '..', '..'));
ok(r.code === 0 && /^PASS \d+ tool lines/m.test(r.out), 'real tools/index passes:\n' + r.out);

fs.rmSync(W, { recursive: true, force: true });
console.log(fail ? 'FAIL ' + fail + ' of ' + n : 'PASS ' + n + ' checks');
process.exit(fail ? 1 : 0);
