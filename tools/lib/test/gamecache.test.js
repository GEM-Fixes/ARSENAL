// gamecache: the game layers of lib/vfs build kept on disk by the game's fingerprint. On a small fake game: the view from the cache is
// the view of a fresh mount (records, order, shared objects, problems), for as64, mowas_2 and goh; a tools/check style overlay
// (junctions + copied root files) takes the same entry with its own paths; any change to what the mount reads makes a miss; off
// switch, fs seam, covering listing and a damaged entry fall back to the mount. node gamecache.test.js (ARSENAL_CACHE = a scratch store)
// Author: Imperator_Aug (ARSENAL, ia-a9ae760e)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const vfs = require('../vfs'), gc = require('../gamecache'), { zip } = require('../zipwrite');

let n = 0, failed = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); } };
const root = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'gamecache-')), game = path.join(root, 'game');
process.env.ARSENAL_CACHE = path.join(root, 'cache');   // a store of its own: every run starts empty
const T0 = 1700000000;
const B = s => Buffer.from(s, 'latin1');
const put = (g, rel, data, sec = T0) => { const f = path.join(g, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); fs.utimesSync(f, sec, sec); return f; };
const patch = body => '{Patch\r\n' + body + '}\r\n';
function mkGame(g) {
  put(g, 'as64.exe', 'MZ');
  put(g, 'resource/a.pak', zip([['set/x.set', B('pak-x')], ['Set/Upper/Mixed.SET', B('mixed')], ['set/y.set', B('y')], ['set/rm.set', B('rm')], ['gone/one.x', B('1')], ['dir/', B('')]]));
  put(g, 'resource/entity/e1.pak', zip([['-vehicle/t.def', B('def')]]));
  put(g, 'resource/set/x.set', 'loose-x');
  put(g, 'resource/set/Loose Case.SET', 'lc');
  put(g, 'resource/set/note.txt', 'skipped');                    // SKIPPED_EXT, where = a game path
  put(g, '1.pat', zip([['1.patch', B(patch(' {id 1}\r\n {delete "set/y.set"}\r\n {delete "gone/"}\r\n {remap "set/rm.set" "set/rm2.set"}\r\n'))]]));
  put(g, 'localization.pak', zip([['desc.lng', B('base-desc')]]));
  put(g, 'localization/extra.lng', 'x');
  put(g, 'as64/core/resource/set/core.set', 'core');
  put(g, 'as64/core/resource/set/x.set', 'core-x');
  put(g, 'as64/core/localization/core.lng', 'c');
  put(g, 'mods/m1/mod.info', '{Mod\r\n {Name "m1"}\r\n {MinGameVersion "3.262"}\r\n {MaxGameVersion "3.262"}\r\n}\r\n');
  put(g, 'mods/m1/resource/set/x.set', 'mod-x');
}
mkGame(game);
const H = path.join(root, 'goh');
put(H, 'resource/a.pak', zip([['set/g.set', B('g')]], { zip64: true }));
put(H, 'resource/entity/humanskin.pak', zip([['humanskin/x.def', B('x')]]));
put(H, 'localizations/default.pak', zip([['default/interface/text/a.pot', B('a')]]));
put(H, 'localizations/english/interface/text/b.pot', 'b');

const OPT = [{ gameDir: game, mods: [] }, { gameDir: game, mods: [], exe: 'mowas_2' }, { gameDir: game, mods: ['m1'] }, { gameDir: H, mods: [], exe: 'goh' }, { gameDir: H, mods: [], exe: 'goh', lang: 'english' }];
const env = v => { if (v === undefined) delete process.env.ARSENAL_GAME_CACHE; else process.env.ARSENAL_GAME_CACHE = v; };
const off = o => { env('0'); try { return vfs.build(o); } finally { env(undefined); } };
// a view as plain data (no times), and the record sharing through gamecache's own compare
const dump = v => JSON.stringify({ files: [...v.files], shadows: v.shadows, problems: v.problems, mods: v.mods, modDirs: v.modDirs, exe: v.exe, mode: v.mode, gameDir: v.gameDir });
const same = (a, b, what) => { assert.equal(dump(a), dump(b), what + ': views differ'); assert.ok(gc._same(a, b), what + ': records or their sharing differ'); };
const delta = (f, k) => { const a = gc.stats()[k]; f(); return gc.stats()[k] - a; };

t('first build mounts and stores, the next one takes it: same view as the mount, every game and option', () => {
  OPT.forEach((o, i) => {
    const ref = off(o);
    // (m1 on top of the as64 game: the game layers of the first build)
    assert.equal(delta(() => same(vfs.build(o), ref, 'first ' + JSON.stringify(o)), 'hit'), i === 2 ? 1 : 0, 'first build of a game is a miss');
    assert.equal(delta(() => same(vfs.build(o), ref, 'second ' + JSON.stringify(o)), 'hit'), 1, 'second build takes the cache');
  });
  const v = vfs.build({ gameDir: game, mods: [] });
  assert.ok(v.problems.some(p => p.code === 'SKIPPED_EXT' && p.where.startsWith(game.replace(/\\/g, '/'))), 'a problem where in the game');
  assert.equal(v.files.get('resource/set/upper/mixed.set').entry, 'Set/Upper/Mixed.SET');
  assert.ok(!v.files.has('resource/set/y.set') && v.files.has('resource/set/rm2.set'), 'patch delete + remap');
  assert.equal(gc.stats().refused, 0, gc.stats().why);
});

t('encode / decode: 32-bit and 64-bit columns, a big offset, a delete record, the same objects shared', () => {
  const ent = { name: 'A/B.def', method: 8, csize: 5e9, size: 6e9, off: 2 ** 40, crc: 0xFFFFFFF0, time: 0x5A5A5A5A };
  const P = 'C:/g', r1 = { source: 'pak', container: P + '/resource/x.pak', entry: 'A/B.def', layer: 'base', size: 6e9, ent };
  const r2 = Object.assign({}, r1, { layer: 'patch 1' }), r3 = { source: 'loose', container: P + '/resource', entry: 'set/l.set', layer: 'base', size: 3 };
  const L = { files: new Map([['resource/a/b.def', r1], ['resource/c.def', r2], ['resource/set/l.set', r3]]),
    shadows: [{ key: 'resource/c.def', by: r2, over: null }, { key: 'resource/gone', by: { deleted: true, layer: 'patch 1', how: '.patch delete' }, over: r3 }],
    problems: [{ code: 'X', msg: 'm', where: P + '/1.pat', level: 'error' }, { code: 'Y', msg: 'n', where: '', level: 'info' }] };
  for (const big of [true, false]) {
    if (!big) Object.assign(ent, { csize: 5, size: 6, off: 7 }), r1.size = r2.size = 6;
    const buf = gc._encode(L, 'C:\\g'), back = gc._decode(buf, 'C:\\g');
    assert.ok(gc._same(L, back), 'round trip ' + big);
    assert.equal(back.files.get('resource/a/b.def').ent, back.files.get('resource/c.def').ent, 'ent shared');
    assert.equal(back.shadows[0].by, back.files.get('resource/c.def'), 'record shared');
    const moved = gc._decode(buf, 'D:\\other\\g');
    assert.equal(moved.files.get('resource/set/l.set').container, 'D:/other/g/resource');
    assert.equal(moved.problems[0].where, 'D:/other/g/1.pat'); assert.equal(moved.problems[1].where, '');
  }
  for (const nm of ['set/ü.set', 'set/中.set']) {   // latin1 and UTF-8 string tables
    const M = { files: new Map([['resource/' + nm, Object.assign({}, r3, { entry: nm })]]), shadows: [], problems: [] };
    assert.ok(gc._same(M, gc._decode(gc._encode(M, P), P)), nm);
  }
  assert.throws(() => gc._encode({ files: new Map([['k', Object.assign({}, r3, { container: 'E:/elsewhere' })]]), shadows: [], problems: [] }, 'C:/g'), /outside/);
  assert.throws(() => gc._encode({ files: new Map([['k', Object.assign({}, r3, { extra: 1 })]]), shadows: [], problems: [] }, 'C:/g'), /shape/);
  assert.throws(() => gc._encode({ files: new Map([['k\0x', r3]]), shadows: [], problems: [] }, 'C:/g'), /storable/);
  assert.throws(() => gc._encode({ files: new Map(), shadows: [], problems: [{ code: 'Z', msg: 'see C:/g/x', where: '', level: 'info' }] }, 'C:/g'), /game path/);
});

t('an overlay of the game (folders linked, root files copied with new times) takes the same entry with its own paths', () => {
  const ov = path.join(root, 'ov', 'game');
  fs.mkdirSync(path.join(ov, 'mods'), { recursive: true });
  for (const e of fs.readdirSync(game, { withFileTypes: true })) {
    if (e.name === 'mods') continue;
    if (e.isDirectory()) fs.symlinkSync(path.join(game, e.name), path.join(ov, e.name), 'junction');
    else fs.copyFileSync(path.join(game, e.name), path.join(ov, e.name));
  }
  fs.symlinkSync(path.join(game, 'mods', 'm1'), path.join(ov, 'mods', 'm1'), 'junction');
  for (const o of [{ gameDir: ov, mods: [] }, { gameDir: ov, mods: ['m1'] }]) {
    const ref = off(o);
    assert.equal(delta(() => same(vfs.build(o), ref, 'overlay'), 'hit'), 1, 'overlay hits the game entry');
  }
  assert.ok(vfs.build({ gameDir: ov, mods: [] }).files.get('resource/set/x.set').container.startsWith(ov.replace(/\\/g, '/')));
});

t('a change to anything the mount reads is a miss, and the new view is the mount\'s', () => {
  const g = path.join(root, 'scratch');
  mkGame(g);
  const o = { gameDir: g, mods: [] }, step = (what, change, hits = 0) => {
    if (change) change();
    const ref = off(o);
    assert.equal(delta(() => same(vfs.build(o), ref, what), 'hit'), hits, what + (hits ? ': hit' : ': miss'));
    if (!hits) assert.equal(delta(() => same(vfs.build(o), ref, what + ' again'), 'hit'), 1, what + ': stored after the miss');
  };
  step('a copy of the game (same names and times, new ctimes): a miss, not a wrong hit', null);
  step('loose file size', () => put(g, 'resource/set/x.set', 'loose-x-longer'));
  step('loose file, same size, new time', () => put(g, 'resource/set/x.set', 'loose-y-longer', T0 + 5));
  step('pak rewritten, same size and time put back (ctime moves)', () => { const f = path.join(g, 'resource/entity/e1.pak'), s = fs.statSync(f).size; put(g, 'resource/entity/e1.pak', zip([['-vehicle/u.def', B('def')]]), T0); assert.equal(fs.statSync(f).size, s); });
  step('root patch, same size and time, other content', () => { const b = fs.readFileSync(path.join(g, '1.pat')); put(g, '1.pat', zip([['1.patch', B(patch(' {id 1}\r\n {delete "set/x.set"}\r\n {delete "gone/"}\r\n {remap "set/rm.set" "set/rm3.set"}\r\n'))]]), T0); assert.equal(fs.statSync(path.join(g, '1.pat')).size, b.length); });
  step('new file in a mounted folder', () => put(g, 'resource/set/new.set', 'n'));
  step('new 2.pat', () => put(g, '2.pat', zip([['2.patch', B(patch(' {id 2}\r\n'))]])));
  step('file in as64/core', () => put(g, 'as64/core/resource/set/core2.set', 'c2'));
  step('file removed', () => fs.unlinkSync(path.join(g, 'resource/set/new.set')));
  step('a folder .git appears below resource', () => put(g, 'resource/.git/HEAD', 'ref'));
  step('a file inside .git (not read): no miss', () => put(g, 'resource/.git/ORIG_HEAD', 'ref'), 1);
  step('a mod changed: game layers still taken', () => put(g, 'mods/m1/resource/set/z.set', 'z'), 1);
});

t('off switch, fs seam and a listing over a game folder: mounted, nothing stored', () => {
  const S = require('../cachestore').open(), count = () => (S.stats().sections.gamecache || { entries: 0 }).entries;
  const g = path.join(root, 'offgame'); mkGame(g); put(g, 'resource/set/only-here.set', 'o');
  const c0 = count();
  env('0'); const a = vfs.build({ gameDir: g, mods: [] }); vfs.build({ gameDir: g, mods: [] }); env(undefined);
  assert.equal(count(), c0, 'nothing stored with ARSENAL_GAME_CACHE=0');
  assert.equal(delta(() => vfs.build({ gameDir: g, mods: [], fs }), 'hit') + delta(() => vfs.build({ gameDir: g, mods: [], fs }), 'miss'), 0, 'fs seam: no lookup');
  assert.equal(count(), c0, 'nothing stored with an fs seam');
  const T = { dir: g, files: [['resource/set/x.set', 7]], left: [] };
  assert.equal(delta(() => vfs.build({ gameDir: g, mods: [], listings: [T] }), 'refused'), 1, 'listing over resource/: refused');
  assert.equal(count(), c0, 'nothing stored under a listing');
  same(vfs.build({ gameDir: g, mods: [] }), a, 'after all that');
});

t('one writer at a time: a held lock leaves the store to its holder, an old one is taken over', () => {
  const g = path.join(root, 'lockgame'); mkGame(g); put(g, 'resource/set/lock.set', 'l');
  const o = { gameDir: g, mods: [] }, ref = off(o), S = require('../cachestore').open();
  const c = { gameDir: path.resolve(g), exe: 'as64', isGoh: false, langs: ['default'], coreDir: path.join(path.resolve(g), 'as64', 'core'), ci: (d, r) => require('../cipath').resolve(d, r, { cache: new Map() }), exists: p => { try { return fs.statSync(p); } catch (e) { return null; } } };
  const lk = path.join(S.root, 'gamecache-lock', S.key('gamecache', gc._parts(c)));
  fs.mkdirSync(lk, { recursive: true });
  assert.equal(delta(() => same(vfs.build(o), ref, 'locked'), 'saved'), 0, 'another process holds the lock: not stored');
  assert.ok(fs.existsSync(lk), 'the other process\'s lock is left alone');
  fs.utimesSync(lk, T0, T0);
  assert.equal(delta(() => same(vfs.build(o), ref, 'stale lock'), 'saved'), 1, 'a lock of a dead process is taken over');
  assert.ok(!fs.existsSync(lk), 'lock released');
  assert.equal(delta(() => same(vfs.build(o), ref, 'after'), 'hit'), 1);
});

t('a damaged entry or one that does not decode: the mount, as before', () => {
  const o = { gameDir: game, mods: [] }, ref = off(o);
  const c = { gameDir: path.resolve(game), exe: 'as64', isGoh: false, langs: ['default'], coreDir: path.join(path.resolve(game), 'as64', 'core'), ci: (d, r) => require('../cipath').resolve(d, r, { cache: new Map() }), exists: p => { try { return fs.statSync(p); } catch (e) { return null; } } };
  const S = require('../cachestore').open(), parts = gc._parts(c);
  assert.ok(S.getRaw('gamecache', 1, parts, {}), 'the test finds the entry vfs stored');
  S.put('gamecache', 1, parts, {}, Buffer.from('not a cache'));
  assert.equal(delta(() => same(vfs.build(o), ref, 'garbage entry'), 'refused'), 1);
  const dir = path.join(S.root, 'e', S.key('gamecache', parts));
  assert.equal(delta(() => same(vfs.build(o), ref, 'rebuilt after garbage'), 'hit'), 1, 'the mount after a bad entry stored a good one');
  fs.writeFileSync(path.join(dir, 'value.bin'), Buffer.alloc(fs.statSync(path.join(dir, 'value.bin')).size, 1));
  assert.equal(delta(() => same(vfs.build(o), ref, 'bytes changed under the meta'), 'hit'), 0, 'the store refuses a value that is not its sum');
});

try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* junctions on a busy disk */ }
console.log(failed ? `${failed} failed, ${n} passed` : `${n} passed`);
process.exit(failed ? 1 : 0);
