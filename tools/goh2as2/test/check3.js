// --base case: node check3.js <out-with-base> <report-with-base> <out-without-base> <report-without-base>
// Author: Imperator_Aug (ARSENAL, ia-ca91d984)
const fs = require('fs'), path = require('path');
const [outW, repW, outN, repN] = process.argv.slice(2);
const tw = fs.readFileSync(repW, 'utf8'), tn = fs.readFileSync(repN, 'utf8');
let bad = 0;
const ck = (c, m) => { if (!c) { console.log('FAIL ' + m); bad++; } };
const has = (o, r) => fs.existsSync(path.join(o, 'resource', r));
const miss = t => t.split(/\r?\n/).filter(l => /WARN_PORT_CLOSURE_MISSING/.test(l));
for (const r of ['entity/bs/bsunit.def', 'entity/bs/bsunit.mdl', 'entity/bs/start.anm', 'entity/basefold/ext.anm', 'entity/bs/body.ply', 'entity/bs/mat/deep.mtl', 'texture/common/bs/skin.dds'])
  ck(has(outW, r), 'with --base pulled ' + r);
for (const r of ['entity/bs/other.def', 'entity/bs/other.ply', 'entity/bs/other.mtl']) ck(!has(outW, r), 'with --base did not pull ' + r);
ck(has(outW, 'entity/bs/v1.vol'), 'with --base pulled v1.vol ({polyhedron "v1.vol"})');
ck(miss(tw).length === 3 && /nope\.anm/.test(miss(tw).join('\n')) && /v2\.vol/.test(miss(tw).join('\n')) && /gone\.vol/.test(miss(tw).join('\n')), 'with --base exactly 3 missing: nope.anm, v2.vol ({Polyhedron}), gone.vol (unknown key) (got ' + miss(tw).length + ')');
ck(!/tank\.heavy/.test(tw), 'collider name "tank.heavy" is not a file');
ck(!has(outN, 'entity/bs/start.anm') && !has(outN, 'entity/bs/body.ply'), 'without --base the base files are absent');
ck(miss(tn).some(l => /start\.anm/.test(l)), 'without --base start.anm reported missing');
process.exit(bad ? 1 : 0);
