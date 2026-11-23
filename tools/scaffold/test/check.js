// scaffold test: scaffold 'demo' into tmp/ (tmp/lib shims → real tools/lib), run its test → PASS; re-scaffold refused
// Author: Imperator_Aug (ARSENAL, ia-df94b6ff)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { scaffold } = require('../scaffold.js');

const tmp = path.join(__dirname, 'tmp');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
for (const m of ['sdlset', 'report', 'games']) fs.writeFileSync(path.join(tmp, 'lib', m + '.js'), `module.exports = require(${JSON.stringify(path.join(__dirname, '..', '..', 'lib', m))});\n`);

let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const files = scaffold('demo', ['UI-03'], { root: tmp });
if (files.length !== 5) fail(`wrote ${files.length} files`);
try {
  const r = JSON.parse(fs.readFileSync(path.join(tmp, 'demo', 'REPORT.json'), 'utf8'));
  if (r.tool !== 'demo' || r.rows[0] !== 'UI-03' || r.tests !== 'FAIL' || !Array.isArray(r.specIssues) || typeof r.tags !== 'object') fail('REPORT.json stub shape');
} catch (e) { fail('REPORT.json stub: ' + e.message); }
if (!/rows UI-03/.test(fs.readFileSync(path.join(tmp, 'demo', 'demo.js'), 'utf8'))) fail('row IDs not in header');
try { scaffold('demo', [], { root: tmp }); fail('existing dir not refused'); } catch (e) { /* expected */ }
try { scaffold('Bad Name', [], { root: tmp }); fail('bad name not refused'); } catch (e) { /* expected */ }
let out = '';
try { out = execFileSync('sh', [path.join(tmp, 'demo', 'test', 'run.sh')], { encoding: 'utf8' }); }
catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
if (!/^0 findings$/m.test(out)) fail('stub not 0 findings:\n' + out);
if (!/PASS\s*$/.test(out)) fail('generated test not PASS:\n' + out);
// --exe: the generated tool hands the game to sdlset.createSource (recording shim), checks the word, and says it in its header
{
  const demo = path.join(tmp, 'demo', 'demo.js'), text = fs.readFileSync(demo, 'utf8');
  if (!/--exe as64\|mowas_2\|mowas2\|goh/.test(text)) fail('generated header lists no --exe');
  const real = require(path.join(__dirname, '..', '..', 'lib', 'sdlset'));
  const sdlShim = require.resolve(path.join(tmp, 'lib', 'sdlset.js'));
  const seen = [];
  require.cache[sdlShim] = { id: sdlShim, filename: sdlShim, loaded: true, exports: { ...real, createSource(o) { seen.push(o.exe); return real.createSource(o); } } };
  const { check } = require(demo);
  const mod = path.join(tmp, 'mod'); fs.mkdirSync(path.join(mod, 'resource', 'set'), { recursive: true });
  fs.writeFileSync(path.join(mod, 'resource', 'set', 'a.set'), '{x 1}\r\n');
  check({ folder: mod, exe: 'mowas_2' }); check({ folder: mod });
  if (seen[0] !== 'mowas_2' || seen[1] !== undefined) fail('createSource exe: ' + JSON.stringify(seen));
  const bad = require('child_process').spawnSync(process.execPath, [demo, mod, '--exe', 'nope'], { encoding: 'utf8' });
  if (bad.status !== 2 || !/--exe must be one of/.test(bad.stderr)) fail('bad --exe not refused: ' + bad.status);
  const ok = require('child_process').spawnSync(process.execPath, [demo, mod, '--exe', 'mowas2', '-q'], { encoding: 'utf8' });
  if (ok.status !== 0 || !/^1 files$/m.test(ok.stdout)) fail('--exe mowas2 run: ' + ok.status + ' ' + ok.stdout + ok.stderr);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? 'FAIL' : 'PASS');
process.exit(bad ? 1 : 0);
