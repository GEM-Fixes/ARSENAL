// GUI-LOC (OBS-I2b rows): fix's verdict is never "static clean" while crash-class findings stay, and the refcheck findings fix
// leaves alone are counted after the "N findings" line. seeded R objects through finish(); no game needed.
// Author: Imperator_Aug (ARSENAL, ia-61cb27d1)
const assert = require('assert'), path = require('path'), os = require('os');
const { finish } = require('../fix'), { createReport } = require('../../lib/report');
const run = R => { const lines = [], orig = console.log; console.log = (...a) => lines.push(a.join(' ')); try { finish(createReport(), R, { mode: 'plan', out: path.join(os.tmpdir(), 'fixv') }, {}); } finally { console.log = orig; } return lines; };
const base = () => ({ changed: [], cant: [], reverted: [] });

// 46 crash-class refcheck findings left (the MB-R6 case): verdict names them, last lines count them
let R = Object.assign(base(), { refLeft: { REF_WEAPON_UNKNOWN: 40, REF_AMMO_UNKNOWN: 6 } });
let out = run(R);
assert.match(R.verdict, /^46 crash findings left, not fixable here, untested$/, R.verdict);
assert.ok(out.includes('VERDICT: ' + R.verdict));
assert.ok(out.includes('0 findings'), out.join('\n'));
assert.match(out[out.length - 1], /^46 refcheck findings left unfixed \(46 crash-class\), not in the count above$/);
// only non-crash left: clean
const sev = require('../../lib/registry').severity, quiet = Object.keys(require('../../lib/registry').codes || {}).find(c => sev(c) === 'cosmetic') || 'WARN_X_COSMETIC';
R = Object.assign(base(), { refLeft: sev(quiet) === 'crash' ? {} : { [quiet]: 3 } });
out = run(R);
assert.strictEqual(R.verdict, 'static clean, untested');
// nothing left, nothing refused
R = base(); out = run(R);
assert.strictEqual(R.verdict, 'static clean, untested');
assert.ok(!out.some(l => /left unfixed/.test(l)));
// refused fixes stay "partial"
R = Object.assign(base(), { cant: [{ key: 'a.def', line: 3, code: 'FIX_REPOINT_NOT_ON_LINE', msg: 'x' }] }); run(R);
assert.strictEqual(R.verdict, 'partial, untested');
console.log('verdict assertions held');
