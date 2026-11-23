// shapecheck regression: seeded defects fail, vanilla-like files pass. live part (one vanilla .def from paks) when the game is found.
// Author: Imperator_Aug (ARSENAL, ia-d36a5f76)
const path = require('path'), fs = require('fs'), sc = require('../shapecheck');
const ref = path.join(__dirname, 'ref'), seed = path.join(__dirname, 'seed');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const run = (file, extra = []) => {
  const log = console.log, out = [];
  console.log = s => out.push(String(s));
  let code; try { code = sc.main([file, '--ref', ref, '--json', ...extra]); } finally { console.log = log; }
  return { code, r: code === 2 ? null : JSON.parse(out.join('\n')) };
};
const codes = r => r.findings.map(f => f.code + ' ' + f.path).sort().join(', ');

let x = run(path.join(ref, 'entity', 'a', 'a.def'));
ok(x.code === 0 && x.r.result === 'PASS' && x.r.vanillaFiles === 2, 'reference file passes against its own set (2 .def files): ' + codes(x.r));
x = run(path.join(seed, 'unknown_key.def'));
ok(x.code === 1 && codes(x.r) === 'SHAPE_PATH /game_entity/volume/thicknes', 'unknown key fails: ' + codes(x.r));
x = run(path.join(seed, 'wrong_kind.def'));
ok(x.code === 1 && codes(x.r) === 'SHAPE_KIND /game_entity/volume/thickness', 'wrong value kind fails: ' + codes(x.r));
x = run(path.join(seed, 'wrong_parent.def'));
ok(x.code === 1 && codes(x.r) === 'SHAPE_PARENT /game_entity/thickness' && /game_entity\/volume/.test(x.r.findings[0].msg), 'block in wrong parent fails, names the right parent: ' + codes(x.r));
x = run(path.join(seed, 'ok_variants.def'));
ok(x.code === 0 && codes(x.r) === 'SHAPE_ARITY /game_entity/damage', 'mod-block key, disabled block, float slot: pass; fixed-count drift warns: ' + codes(x.r));
x = run(path.join(seed, 'x.lng'));
ok(x.code === 0 && x.r.vanillaFiles === 1, '.lng keys are wildcards (free ids): ' + codes(x.r));
x = run(path.join(seed, 'wrong_kind.def'), ['--under', 'set/']);
ok(x.code === 2, 'no vanilla files of the type → exit 2');
x = run(path.join(seed, 'no_such_file.def'));
ok(x.code === 1 && codes(x.r) === 'SHAPE_FILE_UNREADABLE ' + path.join(seed, 'no_such_file.def'), 'missing input file is a FAIL finding, not a throw: ' + codes(x.r));
ok(sc.collapse(['I', 'F', 'F', 'S', 'S']) === 'NS', 'collapse merges int/float and runs');

// live: one vanilla construction .def must pass against all vanilla .def (skipped without the game)
let G = null;
try { G = require('../../lib/gamedir').resolve({}).dir; } catch (e) {}
if (G && fs.existsSync(path.join(G, 'resource', 'entity'))) {
  const pakset = require('../../lib/pakset'), ps = pakset.open(path.join(G, 'resource'), null);
  const e = ps.entries.find(e => /^entity\/construction\/.*\.def$/.test(e.key)), buf = e && pakset.read(e);
  ps.close();
  const db = sc.vanillaDb({ game: G }, '.def', ''), f = sc.check(sc.shapeOf(buf, e.key), db).filter(x => x.level === 'error');
  ok(db.files > 1000 && f.length === 0, `live: vanilla ${e.key} passes against ${db.files} vanilla .def`);
} else console.log('skip live: game not found');

console.log(bad ? `FAIL ${bad}` : 'PASS');
process.exitCode = bad ? 1 : 0;
