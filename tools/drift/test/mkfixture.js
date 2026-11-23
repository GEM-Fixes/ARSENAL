// drift fixture. phase 1 (default): vanilla v1 + mod m (+ mod n, never stamped). phase "update": vanilla changes upstream.
// writes truth.md (check output after update): `[info: ]rel[:line]: CODE`
// Author: Imperator_Aug (ARSENAL, ia-685a6d65)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture'), phase = process.argv[2] || 'v1';
function put(rel, lines, raw) {
  const f = path.join(dir, 'game', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, raw ? lines : lines.join('\r\n') + '\r\n', 'latin1');
}
if (phase === 'v1') {
  fs.rmSync(dir, { recursive: true, force: true });
  put('mods/m/mod.info', ['{mod', ' {Name "m"}', '}']);
  put('mods/n/mod.info', ['{mod', ' {Name "n"}', '}']);
  put('mods/n/resource/set/b.def', ['{e2 {k 1}}']);
  put('resource/set/a.def', ['{e1', ' {hp 10}', ' {speed 5}', ' {armor 3}', '}']);
  put('mods/m/resource/set/a.def', ['{e1', ' {hp 20}', ' {speed 5}', ' {armor 4}', '}']);
  put('resource/set/b.def', ['{e2 {k 1}}']);
  put('mods/m/resource/set/b.def', ['{e2 {k 1}}']);
  put('resource/set/c.def', ['{e3 {k 1}}']);
  put('mods/m/resource/set/c.def', ['{e3 {k 2}}']);
  put('resource/set/d.bin', 'abc', true);
  put('mods/m/resource/set/d.bin', 'abcdef', true);
  put('mods/m/resource/set/e.def', ['{e5 {k 1}}']);           // mod-only: not stamped
} else {
  // a.def: hp changed both ways (conflict), speed upstream only, armor mod only
  put('resource/set/a.def', ['{e1', ' {hp 12}', ' {speed 6}', ' {armor 3}', '}']);
  fs.rmSync(path.join(dir, 'game/resource/set/c.def'));        // removed upstream
  put('resource/set/d.bin', 'abcxyz', true);                   // opaque change
}
if (phase !== 'v1') {
  const t = ['# [info: ]file[:line]: CODE (seeded; diffed by run.sh)',
    'resource/set/a.def: VANILLA_CHANGED',
    'resource/set/a.def:2: WARN_DRIFT_KEY_BOTH',
    'info: resource/set/a.def:3: DRIFT_KEY_UPSTREAM_ONLY',
    'resource/set/c.def: VANILLA_REMOVED',
    'resource/set/d.bin: VANILLA_CHANGED',
    'info: resource/set/d.bin: DRIFT_OPAQUE_CHANGED',
    'info: release.json: VANILLA_SAME'];
  fs.writeFileSync(path.join(__dirname, 'truth.md'), t.join('\n') + '\n');
}
