// modtree: areas, signatures, ensure/touch/maxAge, abort, the store hook; on a fixture mod under the temp folder. node modtree.test.js
// Author: Imperator_Aug (ARSENAL, ia-1bcb30f6)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'modtree-'));
process.env.ARSENAL_CACHE = path.join(root, 'cache');       // a real cachestore, when there is one, stays out of the user's cache
const mt = require('../modtree');

let n = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); n++; } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); } };
const T0 = 1700000000;
const put = (mod, rel, text = 'x', sec = T0) => { const f = path.join(mod, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); fs.utimesSync(f, sec, sec); };
const FILES = ['mod.info', 'resource/set/a.set', 'resource/entity/tank/t.def', 'resource/map/m1/map.mi', 'resource/properties/p.ext',
  'resource/interface/text/ui.lng', 'resource/script/s.lua', 'resource/other.txt', 'localization/desc.lng', 'extra/names.LNG',
  'resource/set/Deep/B.inc', 'resource/gamelogic.pak', 'resource/set/in.PAK', 'localization/l.pak', '1.pat', 'docs/9.pat'];
function mkmod(name) { const mod = path.join(root, name); for (const f of FILES) put(mod, f); return mod; }
const diff = (a, b) => mt.AREAS.filter(k => a.areas[k] !== b.areas[k]);

(async () => {
  await t('areaOf: each area, pak first, case ignored', () => {
    const want = { 'resource/set/a.set': 'set', 'resource/entity/tank/t.def': 'entity', 'resource/map/m1/map.mi': 'map', 'resource/properties/p.ext': 'properties',
      'resource/interface/text/ui.lng': 'interface', 'resource/script/s.lua': 'script', 'localization/desc.lng': 'text', 'extra/names.LNG': 'text',
      'RESOURCE/Set/Deep/b.inc': 'set', 'resource/gamelogic.pak': 'pak', 'resource/set/in.PAK': 'pak', 'localization/l.pak': 'pak', '1.pat': 'pak',
      'docs/9.pat': 'other', 'mod.info': 'other', 'resource/other.txt': 'other', 'resource/set': 'other', 'resource/settings/x.set': 'other' };
    for (const k in want) assert.equal(mt.areaOf(k), want[k], k);
  });

  const mod = mkmod('m');
  // left out of the walk
  put(mod, '.git/objects/aa', 'g'); put(mod, 'resource/node_modules/x.js', 'n'); put(mod, '.arsenal/backup/z', 'z'); put(mod, 'resource/.SVN/e', 's');
  let linked = false;
  try { fs.mkdirSync(path.join(root, 'outside')); put(path.join(root, 'outside'), 'far.set'); fs.symlinkSync(path.join(root, 'outside'), path.join(mod, 'resource', 'set', 'link'), 'junction'); linked = true; } catch (e) { /* no links here */ }

  let A;
  await t('scan: shape, counts, rel case kept, skips', async () => {
    A = await mt.scan(mod);
    assert.equal(A.dir, path.resolve(mod)); assert.equal(A.count, FILES.length); assert.equal(A.files.length, FILES.length);
    assert.equal(A.bytes, FILES.length); assert.ok(A.at <= Date.now() && A.at > Date.now() - 60000);
    assert.deepEqual(Object.keys(A.areas), mt.AREAS);
    for (const k of mt.AREAS) assert.match(A.areas[k], /^[0-9a-f]{40}$/); assert.match(A.all, /^[0-9a-f]{40}$/);
    const rels = A.files.map(f => f[0]);
    assert.deepEqual(rels.slice().sort(), FILES.slice().sort());
    assert.ok(rels.includes('resource/set/Deep/B.inc') && rels.includes('extra/names.LNG'));
    const row = A.files.find(f => f[0] === 'mod.info'); assert.equal(row[1], 1); assert.equal(row[2], T0 * 1000);
    assert.ok(!rels.some(r => /\.git|node_modules|\.arsenal|\.svn|link/i.test(r)), 'skipped folders and links stay out' + (linked ? '' : ' (no link made)'));
  });
  await t('signature = sha1 of the sorted rows', () => {
    const sha = rows => require('crypto').createHash('sha1').update(rows.map(r => r + '\n').join('')).digest('hex');
    const rows = A.files.map(f => f.join('|'));
    assert.deepEqual(rows, rows.slice().sort());
    assert.equal(A.all, sha(rows));
    assert.equal(A.areas.map, sha(rows.filter(r => mt.areaOf(r.split('|')[0]) === 'map')));
  });
  await t('same tree twice: equal; a copy made in another order: equal', async () => {
    const B = await mt.scan(mod);
    assert.equal(B.all, A.all); assert.deepEqual(B.areas, A.areas); assert.deepEqual(B.files, A.files);
    const m2 = path.join(root, 'm2'); for (const f of FILES.slice().reverse()) put(m2, f);
    const C = await mt.scan(m2);
    assert.equal(C.all, A.all); assert.deepEqual(C.areas, A.areas);
  });
  await t('edit under resource/map: areas.map and all only', async () => {
    put(mod, 'resource/map/m1/map.mi', 'xy'); let B = await mt.scan(mod);
    assert.deepEqual(diff(A, B), ['map']); assert.notEqual(B.all, A.all);
    put(mod, 'resource/map/m1/map.mi', 'x', T0 + 5); B = await mt.scan(mod);      // same size, other time
    assert.deepEqual(diff(A, B), ['map']);
    put(mod, 'resource/map/m1/map.mi'); B = await mt.scan(mod);
    assert.equal(B.all, A.all);
  });
  await t('add, delete, rename: the right area', async () => {
    put(mod, 'resource/entity/new.def'); let B = await mt.scan(mod);
    assert.deepEqual(diff(A, B), ['entity']); assert.equal(B.count, A.count + 1);
    fs.unlinkSync(path.join(mod, 'resource', 'entity', 'new.def')); B = await mt.scan(mod);
    assert.equal(B.all, A.all);
    fs.unlinkSync(path.join(mod, 'resource', 'script', 's.lua')); B = await mt.scan(mod);
    assert.deepEqual(diff(A, B), ['script']); put(mod, 'resource/script/s.lua');
    fs.renameSync(path.join(mod, 'resource', 'set', 'a.set'), path.join(mod, 'resource', 'set', 'a2.set')); B = await mt.scan(mod);
    assert.deepEqual(diff(A, B), ['set']); assert.equal(B.count, A.count);
    fs.renameSync(path.join(mod, 'resource', 'set', 'a2.set'), path.join(mod, 'resource', 'properties', 'a.set')); B = await mt.scan(mod);   // across areas
    assert.deepEqual(diff(A, B), ['set', 'properties']);
    fs.renameSync(path.join(mod, 'resource', 'properties', 'a.set'), path.join(mod, 'resource', 'set', 'a.set'));
    put(mod, 'resource/new.pak'); B = await mt.scan(mod); assert.deepEqual(diff(A, B), ['pak']); fs.unlinkSync(path.join(mod, 'resource', 'new.pak'));
    put(mod, 'readme.md'); B = await mt.scan(mod); assert.deepEqual(diff(A, B), ['other']); fs.unlinkSync(path.join(mod, 'readme.md'));
    put(mod, 'notes/a.lng'); B = await mt.scan(mod); assert.deepEqual(diff(A, B), ['text']); fs.rmSync(path.join(mod, 'notes'), { recursive: true });
    assert.equal((await mt.scan(mod)).all, A.all);
  });
  await t('stamps', () => {
    assert.deepEqual(mt.stamps(A, ['set', 'map']), { 'mod:set': A.areas.set, 'mod:map': A.areas.map });
    assert.deepEqual(mt.stamps(A), { 'mod:all': A.all }); assert.deepEqual(mt.stamps(A, []), {});
    assert.deepEqual(mt.stamps(null, ['set', 'all']), { 'mod:set': '', 'mod:all': '' });
    assert.throws(() => mt.stamps(A, ['sets']), /unknown area/);
  });
  await t('restore points: .arsenal-undo left out (any depth, any case) unless restorePoints; such a scan is not kept', async () => {
    const m3 = mkmod('m3');
    put(m3, '.arsenal-undo/t1/files/resource/set/a.set', 'u'); put(m3, 'resource/set/.Arsenal-Undo/x.set', 'u');
    mt._reset({ store: null });
    const D = await mt.scan(m3);
    assert.equal(D.count, FILES.length); assert.equal(D.all, A.all, 'same signature as the mod without restore points');
    assert.ok(D.left.includes('.arsenal-undo') && D.left.includes('resource/set/.Arsenal-Undo'), 'in left: ' + D.left.join(','));
    assert.ok(!D.files.some(f => /arsenal-undo/i.test(f[0])));
    assert.ok(mt.fresh(m3) === D);
    const R = await mt.scan(m3, { restorePoints: true });
    assert.equal(R.count, FILES.length + 2); assert.ok(R.files.some(f => f[0] === '.arsenal-undo/t1/files/resource/set/a.set'));
    assert.ok(!R.left.some(l => /arsenal-undo/i.test(l))); assert.notEqual(R.all, D.all);
    assert.ok(mt.fresh(m3) === D && mt.last(m3) === D, 'the restorePoints scan is not kept');
  });
  await t('names only: same names, no sizes, rel-only signature, not kept', async () => {
    const m4 = mkmod('m4'); put(m4, '.arsenal-undo/p/q.set', 'u'); put(m4, '.git/x', 'g');
    mt._reset({ store: null });
    const S = await mt.scan(m4), N = await mt.scan(m4, { names: true, conc: 3 });
    assert.equal(N.names, true); assert.equal(S.names, undefined);
    assert.equal(N.count, S.count); assert.equal(N.bytes, 0);
    assert.deepEqual(N.files.map(f => f[0]), S.files.map(f => f[0]).sort());
    assert.ok(N.files.every(f => f[1] === -1 && f[2] === -1));
    assert.deepEqual(N.left, S.left);
    const sha = rows => require('crypto').createHash('sha1').update(rows.map(r => r + '\n').join('')).digest('hex');
    assert.equal(N.all, sha(N.files.map(f => f[0])));
    assert.ok(mt.fresh(m4) === S, 'the names scan is not kept');
    put(m4, 'resource/set/a.set', 'longer text'); assert.equal((await mt.scan(m4, { names: true })).all, N.all, 'size change: names signature stands');
    const R = await mt.scan(m4, { names: true, restorePoints: true }); assert.equal(R.count, N.count + 1);
  });
  await t('missing folder rejects; last of an unknown mod is null', async () => {
    await assert.rejects(mt.scan(path.join(root, 'nope')), /ENOENT/);
    await assert.rejects(mt.ensure(path.join(root, 'nope')), /ENOENT/);
    mt._reset({ store: null });
    assert.equal(mt.last(path.join(root, 'never')), null); assert.equal(mt.last(null), null);
  });

  // ---- ensure: a big enough tree that a scan takes several loop turns
  const big = path.join(root, 'big');
  for (let d = 0; d < 12; d++) for (let i = 0; i < 100; i++) put(big, 'resource/set/d' + d + '/f' + i + '.set');
  await t('ensure: concurrent callers share one scan; then the last one is served', async () => {
    mt._reset({ store: null });
    let turns = 0; const prog = [];
    const [x, y, z] = await Promise.all([mt.ensure(big, { onProgress: p => { turns++; prog.push(p.count); } }), mt.ensure(big), mt.ensure(big.toUpperCase())]);
    assert.ok(x === y && y === z, 'one T for all three'); assert.equal(x.count, 1200);
    assert.ok(turns >= 5, 'progress now and then: ' + turns); assert.equal(prog[prog.length - 1], 1200);
    assert.deepEqual(prog, prog.slice().sort((a, b) => a - b));
    assert.ok((await mt.ensure(big)) === x, 'young: no new scan'); assert.ok(mt.last(big) === x);
  });
  await t('ensure: rescans after touch and after maxAge', async () => {
    const x = mt.last(big);
    mt.touch(big); const y = await mt.ensure(big);
    assert.ok(y !== x && y.all === x.all); assert.ok((await mt.ensure(big)) === y);
    await new Promise(r => setTimeout(r, 60));
    assert.ok((await mt.ensure(big, { maxAgeMs: 100000 })) === y);
    const z = await mt.ensure(big, { maxAgeMs: 30 });
    assert.ok(z !== y && mt.last(big) === z);
    put(big, 'resource/set/d0/f0.set', 'changed'); mt.touch(big);
    const w = await mt.ensure(big); assert.notEqual(w.areas.set, z.areas.set); assert.equal(w.areas.map, z.areas.map);
  });
  await t('touch while a scan runs: the next ensure starts its own', async () => {
    mt._reset({ store: null });
    const p1 = mt.ensure(big); mt.touch(big); const p2 = mt.ensure(big);
    const [a, b] = await Promise.all([p1, p2]);
    assert.ok(a !== b); assert.ok(mt.last(big) === b);
  });
  await t('the scan does not hold the loop', async () => {
    let ticks = 0; const iv = setInterval(() => ticks++, 1);
    await mt.scan(big); clearInterval(iv);
    assert.ok(ticks >= 2, 'timers ran during the scan: ' + ticks);
  });
  await t('abort stops the scan', async () => {
    mt._reset({ store: null });
    const pre = new AbortController(); pre.abort();
    await assert.rejects(mt.scan(big, { signal: pre.signal }), e => e.name === 'AbortError' && e.code === 'ABORT_ERR');
    const c = new AbortController(); let seen = 0;
    const p = mt.scan(big, { signal: c.signal, onProgress: q => { seen = q.count; if (q.count >= 200) c.abort(); } });
    await assert.rejects(p, e => e.name === 'AbortError');
    assert.ok(seen >= 200 && seen < 1200, 'stopped part way: ' + seen); assert.equal(mt.last(big), null);
    // ensure: one of two callers leaves, the scan goes on; both leave, it stops
    const c1 = new AbortController(), p1 = mt.ensure(big, { signal: c1.signal }), p2 = mt.ensure(big);
    c1.abort(); await assert.rejects(p1, e => e.name === 'AbortError'); assert.equal((await p2).count, 1200);
    mt._reset({ store: null });
    const c3 = new AbortController(), c4 = new AbortController(); let after = 0;
    const p3 = mt.ensure(big, { signal: c3.signal, onProgress: () => after++ }), p4 = mt.ensure(big, { signal: c4.signal });
    c3.abort(); c4.abort();
    await assert.rejects(p3, e => e.name === 'AbortError'); await assert.rejects(p4, e => e.name === 'AbortError');
    const was = after; await new Promise(r => setTimeout(r, 40));
    assert.equal(after, was); assert.equal(mt.last(big), null);
    assert.equal((await mt.ensure(big)).count, 1200, 'a new ensure after the stop scans');
  });
  await t('store: kept once per signature, known after a restart, never taken as fresh', async () => {
    const mem = new Map(); let puts = 0, boom = false;
    const S = { get: (s, v, parts) => { if (boom) throw new Error('boom'); const e = mem.get(s + v + JSON.stringify(parts)); return e ? { value: JSON.parse(e), at: 0, bytes: e.length } : null; },
      put: (s, v, parts, stamps, value) => { if (boom) throw new Error('boom'); puts++; mem.set(s + v + JSON.stringify(parts), JSON.stringify(value)); return { bytes: 1 }; } };
    mt._reset({ store: S });
    const x = await mt.ensure(big); assert.equal(puts, 1);
    mt.touch(big); await mt.ensure(big); assert.equal(puts, 1, 'same signature: not written again');
    mt._reset({ store: S });                                   // "restart"
    const k = mt.last(big); assert.ok(k && k.all === x.all && k.count === 1200 && k.files.length === 1200);
    const y = await mt.ensure(big); assert.ok(y !== k, 'a kept T is not fresh'); assert.equal(puts, 1);
    put(big, 'resource/set/d1/f1.set', 'more'); mt.touch(big); await mt.ensure(big); assert.equal(puts, 2);
    boom = true; mt._reset({ store: S });
    assert.equal(mt.last(big), null); assert.equal((await mt.ensure(big)).count, 1200, 'a throwing store = memory only');
    mt._reset();                                               // the real store (or none): must work either way
    const z = await mt.ensure(big); assert.equal(z.count, 1200); assert.ok(mt.last(big) === z);
  });
  await t('adopt: a scan from elsewhere becomes fresh; names-only, sizeless and older ones refused; never stored', async () => {
    let puts = 0; mt._reset({ store: { get: () => null, put: () => { puts++; return { bytes: 1 }; } } });
    const T = JSON.parse(JSON.stringify(await mt.scan(big)));   // as read back from a --listing file
    puts = 0; mt._reset({ store: { get: () => null, put: () => { puts++; return { bytes: 1 }; } } });
    assert.equal(mt.fresh(big), null);
    assert.equal(mt.adopt({ ...T, names: true }), false, 'names-only');
    assert.equal(mt.adopt({ ...T, files: T.files.map(r => [r[0]]) }), false, 'rows without sizes');
    assert.equal(mt.adopt({ dir: T.dir, files: T.files, left: [] }), false, 'not a scan (no signatures)');
    assert.equal(mt.fresh(big), null);
    assert.equal(mt.adopt(T), true); assert.ok(mt.fresh(big) === T); assert.ok(mt.last(big) === T); assert.equal(puts, 0, 'not written to the store');
    assert.ok((await mt.ensure(big)) === T, 'ensure takes it while young');
    const N = await mt.scan(big); assert.equal(mt.adopt({ ...T, at: N.at - 1 }), false, 'an older one does not replace a newer own scan');
    assert.ok(mt.fresh(big) === N);
  });

  mt._reset({ store: null });
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  console.log((failed ? 'FAIL ' : 'PASS ') + n + (failed ? ' passed, ' + failed + ' failed' : ''));
  process.exit(failed ? 1 : 0);
})();
