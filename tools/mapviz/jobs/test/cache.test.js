// jobs cache test: key (golden, key fields, non-key fields, defaults), the needs line (golden l0, a bump of a needed part
// changes only the jobs below it), canon refusals, part versions, commit and manifest,
// the stat check (mtime, size, missing input, dep made later), atomic commit, corrupt manifest and index (seeded defects),
// eviction order, the cap with fake sizes, locks taken over after the stale time with a faked clock, clear all and map.
// usage: node tools/mapviz/jobs/test/cache.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-8bfaeaad)
'use strict';
const fs = require('fs'), path = require('path');
const h = require('./harness')('jobs-cache');
const cache = require('../cache');
const mv = require('../../mapviz');
const { W, ok, eq, throwsCode } = h;

const MIN = 60 * 1000;
const G = process.platform === 'win32' ? '//fxhost/share/Game' : '/fxhost/share/Game';
const base = { what: 'grids', target: 'mowas2', game: G, mods: ['a', 'b:1'], modDirs: [], map: 'multi/1v1_road', mode: 'combat', version: 1 };
const key = o => cache.entryKey(Object.assign({}, base, o));

// ---- 1. key ----
{
  const c = cache.canon(base);
  const lines = cache.keyLines(c, 'mapkit', 1);
  const gameLine = process.platform === 'win32' ? '//fxhost/share/game' : '/fxhost/share/game';
  eq(lines, ['mapviz/' + mv.CONTRACT, 'mapkit@1', 'grids', 'mowas2', gameLine, 'a,b:1', '', 'multi/1v1_road', '{"mode":"combat"}'], 'key lines of the fixed request');
  // sha1 of the lines above, first 16 hex, per contract version ([win32, other]); a new contract changes every key (README 8.2)
  const GOLDENS = { 3: ['63646d0340d96575', 'a53bf671ac7a11d2'], 4: ['03bc4e1295f409cc', '617f81c6713ed7e2'] };
  ok(!!GOLDENS[mv.CONTRACT], 'a golden key is known for contract ' + mv.CONTRACT);
  const GOLDEN = (GOLDENS[mv.CONTRACT] || [])[process.platform === 'win32' ? 0 : 1];
  eq(key({}), GOLDEN, 'golden key of the fixed request');
  ok(/^[0-9a-f]{16}$/.test(key({})), 'key is 16 hex');
  ok(key({}) === key({}), 'key is stable');
  const k0 = key({});
  const changes = { what: { what: 'grids', version: 2 }, target: { target: 'as64' }, game: { game: G + '2' }, mods: { mods: ['a'] },
    modsOrder: { mods: ['b:1', 'a'] }, modDirs: { modDirs: [path.join(W, 'mod1')] }, map: { map: 'multi/1v1_other' }, mode: { mode: 'battle_zones' },
    modeNull: { mode: null }, version: { version: 2 } };
  for (const [n, ch] of Object.entries(changes)) ok(key(ch) !== k0, 'key changes with ' + n);
  ok(key({ what: 'doc', mode: undefined }) !== key({ what: 'doc', mode: undefined, version: 2 }), 'key changes with the part version');
  ok(cache.entryKey(Object.assign({}, base, { what: 'doc', version: 1 })) !== k0, 'key changes with what');
  for (const [n, ch] of Object.entries({ kind: { kind: 'tank' }, side: { side: 'a' }, size: { size: 1024 }, phase: { phase: 2 } }))
    ok(key(ch) === k0, 'key does not change with the non-key field ' + n + ' (grids keys mode only)');
  ok(key({ game: G.toUpperCase() }) === k0 || process.platform !== 'win32', 'game folder enters lower case');
  ok(key({ mode: null }) === key({ mode: undefined }) && key({ mode: '' }) === key({ mode: null }), 'mode default null is filled');
  const pk = o => cache.entryKey(Object.assign({}, base, { what: 'pass' }, o));
  ok(pk({}) === pk({ kind: 'inf' }), 'pass: kind default inf is filled');
  ok(pk({ kind: 'tank' }) !== pk({}), 'pass: kind is a key field');
  ok(pk({ args: { kind: 'tank' } }) === pk({ kind: 'tank' }), 'args fields land on the same key');
  const mk = o => cache.entryKey(Object.assign({}, base, { what: 'maps' }, o));
  ok(mk({ map: 'multi/a' }) === mk({ map: 'multi/b' }) && mk({ map: undefined }) === mk({}), 'maps: the map does not enter the key');
  const l1 = o => cache.entryKey(Object.assign({}, base, { what: 'l1' }, o));
  ok(l1({}) === l1({ size: 2048 }), 'l1: size default 2048 is filled');
  ok(cache.canon(cache.canon(base)).game === cache.canon(base).game && key(cache.canon(base)) === k0, 'canon is idempotent');
  const c2 = cache.canon(Object.assign({}, base, { mods: 'a, b:1' }));
  eq(c2.mods, ['a', 'b:1'], 'mods as a comma string');
}

// ---- 1b. the parts below a job enter its key (README 8.2): a needs line, golden; a bump of a needed part only ----
{
  const V = { mapkit: 2, raster: 3, water: 2, pass: 2, render: 2, entcat: 1 };
  const reader = over => p => (Object.prototype.hasOwnProperty.call(over || {}, p) ? over[p] : V[p]);
  const vk = (what, over) => cache.entryKey(Object.assign({}, base, { what, version: undefined, versionOf: reader(over) }));
  const T = require('../table').JOBS;
  eq(cache.needParts(T.l0), ['mapkit', 'raster', 'water'], 'needParts of l0: doc, grids, terrain, water followed down, sorted, each part once');
  eq([T.maps, T.doc, T.grids].map(r => cache.needParts(r)), [[], [], []], 'maps, doc and grids have no needs');
  eq(cache.needParts(T.c0), ['mapkit', 'render'], 'c0 (needs l1, l1 needs doc): the own part counts when a need runs it');
  eq(cache.needParts(T.pass), ['mapkit', 'raster'], 'pass: grids and terrain (terrain needs grids again: mapkit once)');
  const c = cache.canon(Object.assign({}, base, { what: 'l0' }));
  const lines = cache.keyLines(c, 'render', 2, cache.needVersions(T.l0, null, reader()));
  const gameLine = process.platform === 'win32' ? '//fxhost/share/game' : '/fxhost/share/game';
  eq(lines, ['mapviz/' + mv.CONTRACT, 'render@2', 'needs:mapkit@2,raster@3,water@2', 'l0', 'mowas2', gameLine, 'a,b:1', '', 'multi/1v1_road', '{"mode":"combat","size":null}'], 'key lines of l0: the needs line follows the part line');
  const GOLDENS_L0 = { 3: ['224e32b588fee3a7', '6f894737115f6cbf'], 4: ['816e9f5ad34989cb', '3511d5180a823f45'] };   // versions V; contract 3 before the needs line: b13ddb6c6d97c8c5 (win32)
  const GOLDEN_L0 = (GOLDENS_L0[mv.CONTRACT] || [])[process.platform === 'win32' ? 0 : 1];
  eq(vk('l0'), GOLDEN_L0, 'golden key of l0 with its needs');
  eq(cache.keyLines(cache.canon(base), 'mapkit', 1, {}), cache.keyLines(cache.canon(base), 'mapkit', 1), 'no needs: the key lines stay as they were');
  ok(vk('grids') === cache.entryKey(Object.assign({}, base, { version: 2 })), 'grids (no needs): the key is the old one, read through the version reader');
  // bump a needed part: the jobs that need it change, the others do not
  for (const [p, changed, same] of [
    ['mapkit', ['terrain', 'topo', 'water', 'pass', 'entcat', 'l0', 'l1', 'c0', 'grids', 'doc', 'maps'], []],
    ['raster', ['terrain', 'topo', 'pass', 'l0'], ['grids', 'doc', 'water', 'entcat', 'l1', 'c0', 'maps']],
    ['water', ['water', 'l0'], ['grids', 'terrain', 'topo', 'pass', 'l1', 'c0']],
    ['render', ['l0', 'l1', 'c0'], ['grids', 'terrain', 'water', 'pass', 'topo']]]) {
    const bump = { [p]: V[p] + 1 };
    for (const w of changed) ok(vk(w, bump) !== vk(w), 'a bump of ' + p + ' changes the key of ' + w + (T[w].part === p ? ' (its own part)' : ' (needs it)'));
    for (const w of same) ok(vk(w, bump) === vk(w), 'a bump of ' + p + ' leaves the key of ' + w + ' (does not need it)');
  }
  // the bump reaches the key through the parts table too (the runner's reader), and a reader giving no integer is a fault
  const fakeParts = over => Object.keys(V).map(p => ({ part: p, id: 'MV-' + p, wave: 'A', dir: p, load: () => ({ run() { return 0; }, version: (over || {})[p] || V[p] }) }));
  const pk2 = (what, over) => cache.entryKey(Object.assign({}, base, { what, version: undefined, parts: fakeParts(over) }));
  ok(pk2('water', { mapkit: 9 }) !== pk2('water') && pk2('grids', { raster: 9 }) === pk2('grids'), 'parts table: a mapkit bump changes water, a raster bump leaves grids');
  ok(pk2('l0') === vk('l0'), 'parts table and version reader give the same key');
  throwsCode(() => vk('water', { mapkit: 'x' }), 'MV_FAULT', 'a needed part whose version is not an integer is broken');
  ok(cache.entryKey(Object.assign({}, base, { what: 'l0', version: 2, needVersions: { water: 2, raster: 3, mapkit: 2 } })) === GOLDEN_L0, 'needVersions given (the runner) = read ones, any order');
  // a need that is not a job is left out; a need cycle is walked once
  const bad = { a: { part: 'pa', needs: ['b', 'nope'] }, b: { part: 'pb', needs: ['a'] } };
  eq(cache.needParts(bad.a, bad), ['pa', 'pb'], 'needParts: an unknown need is left out, a cycle ends');
}

// ---- 2. canon refusals ----
for (const [n, bad, code] of [
  ['unknown what', { what: 'nope' }, 'MV_USAGE'], ['bad target', { target: 'mow' }, 'MV_USAGE'], ['map with ..', { map: 'multi/../x' }, 'MV_USAGE'],
  ['map with map/ prefix', { map: 'map/multi/x' }, 'MV_USAGE'], ['no map', { map: undefined }, 'MV_USAGE'], ['bad size', { size: 3 }, 'MV_USAGE'],
  ['size not whole', { size: 100.5 }, 'MV_USAGE'], ['bad kind', { kind: 'heli' }, 'MV_USAGE'], ['bad side', { side: 'c' }, 'MV_USAGE'],
  ['bad mode', { mode: 'a b' }, 'MV_USAGE'], ['args with an unknown field', { args: { colour: 1 } }, 'MV_USAGE'],
  ['args and field disagree', { mode: 'a', args: { mode: 'b' } }, 'MV_USAGE'], ['bad mod name', { mods: ['a/b'] }, 'MV_USAGE'],
  ['modDirs not a list', { modDirs: 5 }, 'MV_USAGE']])
  throwsCode(() => key(bad), code, 'canon refuses ' + n);
throwsCode(() => cache.canon(null), 'MV_USAGE', 'canon refuses a request that is not an object');

// ---- 3. part versions ----
{
  const P = [{ part: 'nb', id: 'MV-NB', wave: 'A', dir: 'nb', load: () => null },
    { part: 'br', id: 'MV-BR', wave: 'A', dir: 'br', load: () => ({ run() { return 0; }, version: 'x' }) },
    { part: 'th', id: 'MV-TH', wave: 'A', dir: 'th', load: () => { throw new Error('boom'); } },
    { part: 'gd', id: 'MV-GD', wave: 'A', dir: 'gd', load: () => ({ run() { return 0; }, version: 4 }) }];
  throwsCode(() => cache.partVersion('nb', P), 'MV_NOT_BUILT', 'a part that is not built has no key');
  throwsCode(() => cache.partVersion('br', P), 'MV_FAULT', 'a cli without an integer version is broken');
  throwsCode(() => cache.partVersion('th', P), 'MV_FAULT', 'a cli that throws is broken');
  throwsCode(() => cache.partVersion('zz', P), 'MV_FAULT', 'a part missing from the table');
  eq(cache.partVersion('gd', P), 4, 'version of a built part');
  const row = { part: 'gd', cmd: 'x', heavy: false, timeoutS: 1, needs: [], keys: [], products: ['x'] };
  const kv = cache.entryKey({ what: 'zz', row, parts: P, target: 'goh', game: G, map: 'multi/x' });
  ok(kv === cache.entryKey({ what: 'zz', row, version: 4, target: 'goh', game: G, map: 'multi/x' }), 'entryKey reads the version from the parts table');
}

// ---- 4. commit, manifest, open, the stat check ----
const R = path.join(W, 'c1');
let clock = 1e12;
const C = cache.at(R, { now: () => clock });
function mkOut(name, files) {
  const d = path.join(W, 'out-' + name);
  fs.rmSync(d, { recursive: true, force: true });
  for (const [f, n] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), Buffer.alloc(n, 7)); }
  return d;
}
function input(file) { const st = fs.statSync(file); return { kind: 'loose', file, size: st.size, mtimeMs: st.mtimeMs }; }
const inA = path.join(W, 'inA.txt'), inB = path.join(W, 'inB.txt');
fs.writeFileSync(inA, 'aaaa'); fs.writeFileSync(inB, 'bbbbbb');
const K1 = 'aaaaaaaaaaaaaa01', K2 = 'aaaaaaaaaaaaaa02', K3 = 'aaaaaaaaaaaaaa03';
{
  const out = mkOut('k1', { 'height.mvg': 100, 'tiles/topo/0/0_0.png': 20, 'manifest.json': 3 });
  const dir = C.commit(K1, out, { part: 'mapkit', partVersion: 1, what: 'grids', target: 'mowas2', game: G, map: 'multi/x', variant: { mode: null }, inputs: [input(inA)], deps: [] });
  ok(dir === path.join(R, 'e', K1) && fs.existsSync(dir) && !fs.existsSync(out), 'commit renames out into e/<key>');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  eq(Object.keys(m), ['v', 'part', 'partVersion', 'needVersions', 'contract', 'what', 'variant', 'target', 'game', 'mods', 'modDirs', 'map', 'made', 'inputs', 'deps', 'files', 'notes', 'complete'], 'manifest fields in README 8.2 order');
  eq(m.files, [{ name: 'height.mvg', bytes: 100 }, { name: 'tiles/topo/0/0_0.png', bytes: 20 }], 'manifest files: every product with its bytes, a manifest from out dropped');
  ok(m.complete === true && m.made === clock && m.contract === mv.CONTRACT, 'manifest complete, made, contract');
  const idx = JSON.parse(fs.readFileSync(path.join(R, 'index.json'), 'utf8'));
  eq(idx.entries[K1], { what: 'grids', part: 'mapkit', target: 'mowas2', map: 'multi/x', bytes: 120, made: clock, used: clock }, 'index entry');
  ok(idx.v === 1 && idx.cap === cache.CAP, 'index v and cap');
  ok(C.open(K1) && C.open(K1).manifest.what === 'grids', 'open finds a fresh entry');
  clock += 10;
  C.open(K1);
  ok(C.readIndex().entries[K1].used === clock, 'open marks the entry used');
  C.open(K1, { touch: false });
  ok(C.size() === 120, 'size sums the entries');
  // dep: K2 depends on K1
  clock += 10;
  const d2 = C.commit(K2, mkOut('k2', { 'slopecls.mvg': 50 }), { what: 'terrain', part: 'raster', inputs: [input(inB)], deps: [{ what: 'grids', key: K1, made: C.readManifest(K1).made }] });
  ok(fs.existsSync(d2) && C.open(K2), 'an entry with a fresh dep is fresh');
  // input mtime changed
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(inB, t, t);
  ok(C.open(K2) === null, 'stale when an input mtime changes');
  fs.writeFileSync(inB, 'bbbbbb'); fs.utimesSync(inB, t, t);
  C.commit(K2, mkOut('k2b', { 'slopecls.mvg': 50 }), { what: 'terrain', part: 'raster', inputs: [input(inB)], deps: [{ what: 'grids', key: K1, made: C.readManifest(K1).made }] });
  ok(C.open(K2), 'fresh again after a re-commit');
  fs.writeFileSync(inB, 'bbbbbbb'); fs.utimesSync(inB, t, t);
  ok(C.open(K2) === null, 'stale when an input size changes (same mtime)');
  fs.writeFileSync(inB, 'bbbbbb'); fs.utimesSync(inB, t, t);
  ok(C.open(K2), 'fresh when size and mtime are back');
  fs.renameSync(inB, inB + '.away');
  ok(C.open(K2) === null, 'stale when an input is missing');
  fs.renameSync(inB + '.away', inB); fs.utimesSync(inB, t, t);
  ok(C.open(K2), 'fresh when the input is back');
  // dep made later
  clock += 10;
  C.commit(K1, mkOut('k1b', { 'height.mvg': 100 }), { what: 'grids', part: 'mapkit', target: 'mowas2', map: 'multi/x', inputs: [input(inA)], deps: [] });
  ok(!fs.existsSync(path.join(R, 'e', K1, 'tiles')), 'a re-commit replaces the old entry (old files gone)');
  ok(C.open(K1) && C.open(K2) === null, 'stale when a dep was made later');
  ok(!fs.readdirSync(path.join(R, 'e')).some(n => /^\.old-/.test(n)), 'no old folder left after a replace');
  ok(C.fresh(C.readManifest(K1)) && !C.fresh(C.readManifest(K2)), 'fresh(manifest)');
  ok(!C.fresh(null) && !C.fresh({ v: 1 }) && !C.fresh(Object.assign({}, C.readManifest(K1), { complete: false })), 'fresh refuses an incomplete manifest');
  // a dep that is gone
  C.commit(K3, mkOut('k3', { 'x.mvg': 5 }), { what: 'x', deps: [{ what: 'gone', key: 'ffffffffffffffff', made: 1 }] });
  ok(C.open(K3) === null, 'stale when a dep entry is gone');
  // a removed product
  C.commit(K3, mkOut('k3b', { 'x.mvg': 5 }), { what: 'x' });
  fs.rmSync(path.join(R, 'e', K3, 'x.mvg'));
  ok(C.open(K3) === null, 'not served when a product file is gone');
  ok(C.open('../x') === null && C.open('ABC') === null, 'open refuses a key that is not 16 hex');
  throwsCode(() => C.commit('../x', W, {}), 'MV_FAULT', 'commit refuses a key that is not 16 hex');
  throwsCode(() => C.commit(K3, path.join(W, 'nope'), {}), 'MV_FAULT', 'commit refuses a missing out folder');
}

// ---- 5. atomic commit, seeded defects ----
{
  const K = 'bbbbbbbbbbbbbb01';
  const half = path.join(R, 'e', K);
  fs.mkdirSync(half, { recursive: true });
  fs.writeFileSync(path.join(half, 'height.mvg'), 'x');
  ok(C.open(K) === null, 'an entry folder without manifest.json is not an entry (commit not finished)');
  fs.writeFileSync(path.join(half, 'manifest.json'), '{"v":1,"complete":tr');
  ok(C.open(K) === null, 'seeded defect: a corrupt manifest is not an entry');
  const dir = C.commit(K, mkOut('kb', { 'height.mvg': 9 }), { what: 'grids' });
  ok(C.open(K) && fs.readFileSync(path.join(dir, 'height.mvg')).length === 9, 'a commit over a corrupt entry replaces it');
  fs.writeFileSync(path.join(R, 'index.json'), 'not json');
  const s = C.stats();
  ok(s.entries >= 3 && s.v === 1 && s.root === R && s.cap === cache.CAP, 'seeded defect: a corrupt index.json is rebuilt from the manifests (' + s.entries + ' entries)');
  eq(Object.keys(s), ['v', 'root', 'bytes', 'cap', 'entries', 'jobs'], 'stats shape (GET cache)');
}

// ---- 6. eviction order, cap, locks ----
{
  const R2 = path.join(W, 'c2');
  let t = 1000;
  const C2 = cache.at(R2, { now: () => t });
  const k = n => 'cccccccccccccc0' + n;
  for (const n of [1, 2, 3]) { t = n * 1000; C2.commit(k(n), mkOut('e' + n, { 'a.mvg': 100 }), { what: 'w' + n }); }
  t = 4000; C2.use(k(1));
  eq(C2.evict(250), [k(2)], 'evict removes the least recently used first, until under the cap');
  ok(C2.open(k(1), { touch: false }) && C2.open(k(3), { touch: false }) && !fs.existsSync(path.join(R2, 'e', k(2))), 'the others stay');
  const lk = C2.lock(k(3), { what: 'w3', map: 'multi/a' });
  ok(lk && fs.existsSync(path.join(R2, 'locks', k(3), 'owner.json')), 'lock a key');
  eq(C2.evict(50), [k(1)], 'evict never removes a locked entry');
  ok(fs.existsSync(path.join(R2, 'e', k(3))), 'the locked entry stays over the cap');
  lk.release();
  ok(!fs.existsSync(path.join(R2, 'locks', k(3))), 'release removes the lock');
  // cap with fake sizes
  const idx = C2.readIndex();
  for (const n of [4, 5, 6]) idx.entries[k(n)] = { what: 'f', part: 'p', target: 'goh', map: 'multi/f', bytes: 1024 * 1024 * 1024, made: n, used: n };
  C2.writeIndex(idx);
  ok(C2.size() > cache.CAP, 'fake sizes put the cache over 2 GB');
  const ev = C2.evict(cache.CAP);
  ok(C2.size() <= cache.CAP && ev.join() === [k(4), k(5)].join(), 'evict brings fake sizes under the 2 GB cap, oldest first (' + ev.join(',') + ')');
  // commit evicts by the index cap, never the new entry
  const R3 = path.join(W, 'c3');
  const C3 = cache.at(R3, { cap: 250, now: () => t });
  for (const n of [1, 2, 3, 4]) { t = 10000 + n; C3.commit(k(n), mkOut('f' + n, { 'a.mvg': 100 }), { what: 'v' }); }
  ok(C3.size() <= 250 && C3.open(k(4), { touch: false }) && !C3.open(k(1), { touch: false }), 'commit keeps the cache under its cap and keeps the new entry');
  // locks and the faked clock
  const C4 = cache.at(R2, { now: () => Date.now() });
  const h1 = C4.lock('heavy', { what: 'x' });
  ok(h1 && C4.lock('heavy') === null && C4.locked('heavy'), 'the heavy slot is one mkdir lock');
  const later = cache.at(R2, { now: () => Date.now() + 5 * MIN });
  ok(later.lock('heavy') === null, 'a lock 5 minutes old is held');
  const much = cache.at(R2, { now: () => Date.now() + 11 * MIN });
  ok(!much.locked('heavy'), 'a lock 11 minutes old is stale');
  const h2 = much.lock('heavy', { what: 'y' });
  ok(h2 && JSON.parse(fs.readFileSync(path.join(R2, 'locks', 'heavy', 'owner.json'), 'utf8')).what === 'y', 'a stale lock is taken over');
  h1.release();
  ok(fs.existsSync(path.join(R2, 'locks', 'heavy')), 'the old owner releasing does not remove the new lock');
  h2.release();
  ok(!fs.existsSync(path.join(R2, 'locks', 'heavy')), 'the new owner releases it');
  throwsCode(() => C4.lock('../x'), 'MV_FAULT', 'a lock name that is not heavy or a key is refused');
}

// ---- 7. clear ----
{
  const R5 = path.join(W, 'c5');
  const C5 = cache.at(R5);
  const k = n => 'dddddddddddddd0' + n;
  C5.commit(k(1), mkOut('g1', { 'a.mvg': 10 }), { what: 'grids', target: 'mowas2', map: 'multi/a' });
  C5.commit(k(2), mkOut('g2', { 'a.mvg': 20 }), { what: 'grids', target: 'mowas2', map: 'multi/b' });
  C5.commit(k(3), mkOut('g3', { 'a.mvg': 30 }), { what: 'grids', target: 'goh', map: 'multi/a' });
  C5.commit(k(4), mkOut('g4', { 'maps.json': 40 }), { what: 'maps', target: 'mowas2', map: null });
  const lb = C5.lock(k(9), { what: 'water', target: 'mowas2', map: 'multi/b' });
  throwsCode(() => C5.clear({ scope: 'map', map: 'multi/b' }), 'MV_BUSY', 'clear map refuses while a job holds a lock on that map');
  eq(C5.clear({ scope: 'map', map: 'multi/a', target: 'mowas2' }), { removed: 1, bytes: 10 }, 'clear map with a target removes that map of that target');
  ok(!C5.open(k(1), { touch: false }) && C5.open(k(3), { touch: false }) && C5.open(k(2), { touch: false }) && C5.open(k(4), { touch: false }), 'other maps, targets and the map list stay');
  eq(C5.clear({ scope: 'map', map: 'multi/a' }), { removed: 1, bytes: 30 }, 'clear map without a target removes it in every target');
  throwsCode(() => C5.clear('all'), 'MV_BUSY', 'clear all refuses while a job holds a key lock');
  // job folders: one finished, one running (state running + its key lock)
  fs.mkdirSync(path.join(R5, 'jobs', 'jdone'), { recursive: true });
  fs.writeFileSync(path.join(R5, 'jobs', 'jdone', 'job.json'), JSON.stringify({ state: 'done', key: k(2) }));
  fs.mkdirSync(path.join(R5, 'runs', 'r1'), { recursive: true });
  fs.writeFileSync(path.join(R5, 'runs', 'r1', 'x.txt'), 'x');
  lb.release();
  const heavy = C5.lock('heavy', { what: 'x' });
  const r = C5.clear('all');
  ok(r.removed === 2 && r.bytes === 60, 'clear all counts what it removed (' + JSON.stringify(r) + ')');
  ok(!fs.existsSync(path.join(R5, 'e')) && !fs.existsSync(path.join(R5, 'index.json')), 'clear all removes e/ and index.json');
  ok(!fs.existsSync(path.join(R5, 'jobs', 'jdone')), 'clear all removes finished job folders');
  ok(fs.existsSync(path.join(R5, 'runs', 'r1', 'x.txt')), 'clear all keeps runs/');
  heavy.release();
  throwsCode(() => C5.clear('some'), 'MV_USAGE', 'clear refuses an unknown scope');
  throwsCode(() => C5.clear({ scope: 'map' }), 'MV_USAGE', 'clear map needs a map');
  eq(C5.stats().entries, 0, 'empty after clear all');
}

// ---- 7b. index.json between processes: an entry the index lacks; 2 children committing at once ----
{
  const R6 = path.join(W, 'c6');
  const C6 = cache.at(R6);
  const k = n => 'abababababab' + String(n).padStart(4, '0');
  C6.commit(k(1), mkOut('h1', { 'a.mvg': 10 }), { what: 'grids', target: 'mowas2', map: 'multi/q' });
  C6.commit(k(2), mkOut('h2', { 'a.mvg': 20 }), { what: 'grids', target: 'mowas2', map: 'multi/q' });
  const idx = C6.readIndex();
  delete idx.entries[k(2)];
  C6.writeIndex(idx);
  ok(!C6.readIndex().entries[k(2)] && C6.stats().entries === 2 && C6.size() === 30, 'seeded defect: an entry missing from index.json is still counted by stats and size');
  eq(C6.evict(1).sort(), [k(1), k(2)], 'evict removes an entry that index.json lacks');
  ok(!fs.existsSync(path.join(R6, 'e', k(2))) && C6.stats().entries === 0, 'that entry is gone from disk');
  C6.commit(k(3), mkOut('h3', { 'a.mvg': 30 }), { what: 'grids', target: 'mowas2', map: 'multi/r' });
  const i3 = C6.readIndex(); delete i3.entries[k(3)]; C6.writeIndex(i3);
  eq(C6.clear({ scope: 'map', map: 'multi/r' }), { removed: 1, bytes: 30 }, 'clear map removes an entry that index.json lacks');
  ok(!fs.existsSync(path.join(R6, 'e', k(3))), 'that entry is gone from disk');
  C6.commit(k(4), mkOut('h4', { 'a.mvg': 5 }), { what: 'grids', target: 'mowas2', map: 'multi/r' });
  const i4 = C6.readIndex(); delete i4.entries[k(4)]; C6.writeIndex(i4);
  ok(C6.open(k(4)) && C6.readIndex().entries[k(4)] && C6.readIndex().entries[k(4)].bytes === 5, 'open puts an entry the index lacks back into it');
  // a held index lock: an update waits, then runs anyway; a stale one is taken over at once
  fs.mkdirSync(path.join(R6, 'locks', 'index'), { recursive: true });
  const t0 = Date.now();
  ok(C6.use(k(4)) === true && Date.now() - t0 >= 1500, 'a held index lock makes an update wait about 2 s, then it runs (' + (Date.now() - t0) + ' ms)');
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(path.join(R6, 'locks', 'index'), old, old);
  const t1 = Date.now();
  ok(C6.use(k(4)) === true && Date.now() - t1 < 1000 && !fs.existsSync(path.join(R6, 'locks', 'index')), 'a stale index lock is taken over and released (' + (Date.now() - t1) + ' ms)');
  ok(C6.use('ffffffffffffff99') === false, 'use of an absent key answers false');
}

// ---- 8. module-level functions use toolcache root (ARSENAL_CACHE) ----
{
  ok(cache.root() === path.join(process.env.ARSENAL_CACHE, 'mapviz'), 'root = toolcache.dir(mapviz) under ARSENAL_CACHE');
  const K = 'eeeeeeeeeeeeee01';
  cache.commit(K, mkOut('m1', { 'a.json': 5 }), { what: 'maps' });
  ok(cache.open(K) && cache.size() >= 5 && cache.stats().entries >= 1, 'module-level commit, open, size, stats');
  ok(cache.fresh(cache.open(K).manifest), 'module-level fresh');
  ok(cache.clear('all').removed >= 1 && cache.open(K) === null, 'module-level clear');
}

// ---- 9. two child processes commit into one root at once (index.json under locks/index) ----
(async () => {
  const R7 = path.join(W, 'c7');
  const N = 50;
  const code = [
    "const fs = require('fs'), path = require('path');",
    'const cache = require(process.env.CACHE_JS);',
    'const C = cache.at(process.env.ROOT), tag = process.env.TAG, n = Number(process.env.N);',
    'for (let i = 0; i < n; i++) {',
    "  const key = (tag + 'f'.repeat(12) + i.toString(16).padStart(3, '0')).slice(-16);",
    "  const o = path.join(process.env.SCR, tag + '-' + i);",
    "  fs.mkdirSync(o, { recursive: true }); fs.writeFileSync(path.join(o, 'a.mvg'), 'x'.repeat(i + 1));",
    "  C.commit(key, o, { what: 'grids', target: 'mowas2', map: 'multi/p' + tag });",
    '  if (!C.open(key)) { process.stderr.write("no entry " + key + "\\n"); process.exit(9); }',
    '  C.stats();',
    '}',
  ].join('\n');
  const cp = require('child_process');
  const kid = tag => new Promise(res => {
    const env = Object.assign({}, process.env, { CACHE_JS: path.join(__dirname, '..', 'cache.js'), ROOT: R7, TAG: tag, N: String(N), SCR: path.join(W, 'kids') });
    const c = cp.spawn(process.execPath, ['-e', code], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    c.stderr.on('data', d => { err += d; });
    c.on('close', st => res({ st, err }));
  });
  const t0 = Date.now();
  const rs = await Promise.all([kid('a'), kid('b')]);
  ok(rs.every(r => r.st === 0 && !r.err.trim()), 'two processes committing ' + N + ' entries each at once: no throw (' + rs.map(r => r.st + ' ' + r.err.trim().split('\n')[0]).join(' | ') + ')');
  const C7 = cache.at(R7);
  const onDisk = fs.readdirSync(path.join(R7, 'e')).filter(n => cache.KEY_RE.test(n) && fs.existsSync(path.join(R7, 'e', n, 'manifest.json')));
  const inIdx = Object.keys(C7.readIndex().entries);
  eq([onDisk.length, inIdx.length], [2 * N, 2 * N], 'index.json lists every entry on disk after the race (' + (Date.now() - t0) + ' ms)');
  ok(onDisk.every(k => C7.readIndex().entries[k]), 'the same keys');
  ok(!fs.existsSync(path.join(R7, 'locks', 'index')) && !fs.readdirSync(R7).some(n => /^index\.json\.tmp/.test(n)), 'no index lock and no tmp file left');
  h.end();
})().catch(e => { console.log('FAIL mapviz jobs-cache: ' + (e && e.stack || e)); process.exit(1); });
