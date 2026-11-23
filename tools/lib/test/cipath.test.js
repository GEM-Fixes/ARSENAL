// cipath: case-blind loose lookups, proven on Windows against an in-memory file system that is strict about case
// (what Linux / a case-sensitive macOS volume does). run: node tools/lib/test/cipath.test.js
// Author: Imperator_Aug (ARSENAL, ia-bfa71b57)
const assert = require('assert'), path = require('path');
const cp = require('../cipath');
let n = 0, failed = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); } };

// strict fake: exact-case names only; paths compared with '/' and no drive (path.join on Windows makes '\r\a')
const norm = p => String(p).replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '') || '/';
function fakeFs(list) {
  const dirs = new Map(), files = new Set(), calls = { readdir: 0, stat: 0 };
  const addDir = d => { if (!dirs.has(d)) { dirs.set(d, new Set()); const p = path.posix.dirname(d); if (p !== d) { addDir(p); dirs.get(p).add(path.posix.basename(d)); } } };
  for (const f of list) {
    if (f.endsWith('/')) { addDir(norm(f)); continue; }
    const p = norm(f); addDir(path.posix.dirname(p)); dirs.get(path.posix.dirname(p)).add(path.posix.basename(p)); files.add(p);
  }
  const enoent = p => Object.assign(new Error('ENOENT ' + p), { code: 'ENOENT' });
  return {
    calls,
    statSync(p) { calls.stat++; const k = norm(p); if (dirs.has(k)) return { isDirectory: () => true }; if (files.has(k)) return { isDirectory: () => false }; throw enoent(p); },
    readdirSync(p) { calls.readdir++; const k = norm(p); if (!dirs.has(k)) throw enoent(p); return [...dirs.get(k)]; },
  };
}
const R = '/r';
const real = p => p === null ? null : norm(p);

t('fast path: exact path, no listing read', () => {
  const F = fakeFs(['/r/entity/vehicle/tank.def']), o = { fs: F, cache: new Map() };
  assert.equal(real(cp.resolve(R, 'entity/vehicle/tank.def', o)), '/r/entity/vehicle/tank.def');
  assert.equal(F.calls.readdir, 0);
});
t('mixed-case segments resolve to the real names, both separators', () => {
  const F = fakeFs(['/r/entity/vehicle/tank.def', '/r/Set/Stuff/A.Set']), o = { fs: F, cache: new Map() };
  assert.equal(real(cp.resolve(R, 'Entity/Vehicle/Tank.DEF', o)), '/r/entity/vehicle/tank.def');
  assert.equal(real(cp.resolve(R, 'set\\stuff\\a.set', o)), '/r/Set/Stuff/A.Set');
  assert.equal(real(cp.resolve(R, 'SET//./STUFF/', o)), '/r/Set/Stuff');
  assert.ok(cp.exists(R, 'ENTITY', o));
  const before = F.calls.readdir; cp.resolve(R, 'Entity/Vehicle/TANK.def', o);
  assert.equal(F.calls.readdir, before, 'listings cached per run');
  cp.clear(o); cp.resolve(R, 'Entity/Vehicle/TANK.def', o);
  assert.ok(F.calls.readdir > before, 'clear() drops the cache');
});
t('missing: whole path, middle segment, below a file', () => {
  const F = fakeFs(['/r/a/b.txt']), o = { fs: F, cache: new Map() };
  assert.equal(cp.resolve(R, 'A/c.txt', o), null);
  assert.equal(cp.resolve(R, 'X/b.txt', o), null);
  assert.equal(cp.resolve(R, 'A/B.TXT/more', o), null);
  assert.equal(cp.exists(R, 'nope', o), false);
  assert.equal(cp.resolve('/gone', 'a', o), null);
});
t('refused: .., absolute, drive letter, UNC', () => {
  const F = fakeFs(['/r/a/b.txt', '/x/secret']), o = { fs: F, cache: new Map() };
  for (const bad of ['../x/secret', 'a/../../x/secret', 'a/..', '/x/secret', '\\x\\secret', 'C:/x/secret', 'c:secret', '\\\\srv\\share\\f'])
    assert.equal(cp.resolve(R, bad, o), null, bad);
  assert.equal(F.calls.readdir + F.calls.stat, 0, 'refused before any fs call');
});
t('clash: exact case wins, else sorted first; reported once by callback and clashes()', () => {
  const F = fakeFs(['/r/Data/x.set', '/r/data/y.set', '/r/DATA/z.set']), seen = [];
  const o = { fs: F, cache: new Map(), onClash: c => seen.push(c) };
  assert.equal(real(cp.resolve(R, 'data/y.set', o)), '/r/data/y.set');        // exact (fast path)
  assert.equal(real(cp.resolve(R, 'Data/X.SET', o)), '/r/Data/x.set');        // exact folder case kept in the walk
  assert.equal(real(cp.resolve(R, 'dAtA/z.set', o)), '/r/DATA/z.set');        // no exact: sorted first = DATA
  assert.equal(cp.resolve(R, 'dAtA/y.set', o), null);                         // DATA has no y.set
  assert.equal(seen.length, 1); assert.deepEqual(seen[0].names, ['DATA', 'Data', 'data']);
  const c = cp.clashes(R, o); assert.equal(c.length, 1); assert.equal(c[0].chosen, 'DATA');
  assert.deepEqual(cp.clashes('/elsewhere', o), []);
});
t('readdirCI: find and group', () => {
  const F = fakeFs(['/r/Tank.DEF', '/r/b.set']), o = { fs: F, cache: new Map() };
  const L = cp.readdirCI(R, o);
  assert.deepEqual(L.names.sort(), ['Tank.DEF', 'b.set']);
  assert.equal(L.find('tank.def'), 'Tank.DEF'); assert.equal(L.find('B.SET'), 'b.set'); assert.equal(L.find('c'), null);
  assert.equal(cp.readdirCI('/none', o), null);
});
t('fold: Unicode simple case (Cyrillic, accented), not the multi-letter ß -> SS', () => {
  const F = fakeFs(['/r/Танк/Ärger.def', '/r/straße.set']), o = { fs: F, cache: new Map() };
  assert.equal(real(cp.resolve(R, 'тАНК/äRGER.DEF', o)), '/r/Танк/Ärger.def');
  assert.equal(real(cp.resolve(R, 'STRAßE.SET', o)), '/r/straße.set');
  assert.equal(cp.resolve(R, 'STRASSE.SET', o), null);
});
t('real fs (this OS): exact and case-changed lookups of this file', () => {
  const dir = path.dirname(__dirname), o = { cache: new Map() };
  assert.equal(cp.resolve(dir, 'test/cipath.test.js', o), path.join(dir, 'test', 'cipath.test.js'));
  assert.ok(cp.exists(dir, 'TEST/CIPATH.TEST.JS', o));
});

console.log(failed ? `${failed} FAILED, ${n} passed` : `${n} passed`);
if (failed) process.exitCode = 1;
