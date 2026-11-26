// reach.js: the async scan gives the answers of the sync one; sameScan lets annotate take a --reach-all memo only where a scan of
// its own would answer the same (the regex over plain and dashed names together can hide a name: a-b behind a); walkAsync = C.walk
// Author: Imperator_Aug (ARSENAL, ia-6cf4d2d3)
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const R = require('../reach'), W = require('../wouldload'), C = require('../../modmove/lib/common');
const w = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'wl-reach-'));
let n = 0, bad = 0;
const t = async (name, fn) => { try { await fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); } };
const put = (rel, s) => { const f = path.join(w, 'm', ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
// a hand-made view: every file loose on layer m (the mod), plus one vanilla def
function view() {
  const files = new Map(), root = path.join(w, 'm').replace(/\\/g, '/');
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else files.set(r.toLowerCase(), { source: 'loose', container: root, entry: r, layer: 'm', size: fs.statSync(path.join(d, e.name)).size }); } };
  walk(path.join(w, 'm'), '');
  files.set('resource/entity/v/van.def', { source: 'loose', container: root, entry: 'resource/entity/a/a.def', layer: 'base', size: 1 });
  return { files, shadows: [] };
}
(async () => {
  try {
    // 130 defs (so --reach-all takes the token loop), a plain name a, a dashed a-b, an orphan, names in a .mi, an interaction selector
    for (let i = 0; i < 130; i++) put(`resource/entity/u/u${i}.def`, '{game_entity}\r\n');
    for (const d of ['a', 'a-b', 'lone', 'sel', 'x_y']) put(`resource/entity/${d}/${d}.def`, '{game_entity}\r\n');
    put('resource/map/m.mi', '{spawn "a-b"}\r\n{spawn u7}\r\n{"u9.mdl"}\r\n');
    put('resource/set/interaction/i.set', '{"sel" {on spawn}}\r\n');
    put('resource/set/x.set', 'x_y\r\n');
    const v = view();
    await t('reachabilityAsync = reachability, any name set', async () => {
      for (const names of [['a'], ['a-b'], ['a', 'a-b'], ['lone', 'sel', 'x_y', 'van', 'nope'], [...Array(130).keys()].map(i => 'u' + i)]) {
        const a = R.reachability(v, 'm', new Set(names), {}), b = await R.reachabilityAsync(v, 'm', new Set(names), {}, {}, { window: 3 });
        assert.deepEqual([...b], [...a], names.join(','));
      }
      assert.deepEqual(await R.reachAllAsync(v, 'm', {}, { window: 2 }), R.reachAll(v, 'm', {}));
    });
    await t('the regex over a + a-b hides a-b (why sameScan exists)', () => {
      assert.equal(R.reachability(v, 'm', new Set(['a-b']), {}).get('a-b').reach, 'REACHABLE');
      assert.equal(R.reachability(v, 'm', new Set(['a', 'a-b']), {}).get('a-b').reach, 'ORPHAN');
    });
    await t('sameScan: the reach-all memo answers exactly as a fresh scan where it says so', () => {
      const M = {}; R.reachAll(v, 'm', M);
      assert.equal(M.index.exact, true);
      assert.equal(R.sameScan(M, new Set(['a', 'a-b'])), false, 'mixed set under 121 names');
      for (const names of [['a'], ['a-b'], ['lone'], ['sel', 'x_y', 'van', 'nope'], [...Array(130).keys()].map(i => 'u' + i).concat(['a', 'a-b'])]) {
        assert.equal(R.sameScan(M, new Set(names)), true, names.join(','));
        assert.deepEqual([...R.reachability(v, 'm', new Set(names), M)], [...R.reachability(v, 'm', new Set(names), {})], names.join(','));
      }
      const S = {}; R.reachability(v, 'm', new Set(['a', 'a-b']), S);
      assert.equal(S.index.exact, false); assert.equal(R.sameScan(S, new Set(['a'])), false, 'a memo with an inexact scan');
      assert.equal(R.sameScan({}, new Set(['a'])), false, 'no scan yet');
      const P = {}; R.reachability(v, 'm', new Set(['a']), P); assert.equal(R.sameScan(P, new Set(['lone'])), false, 'a name it did not scan');
    });
    // ---- reach cache (reachcache.js, job X2): facts per file give the very answers of the text loop / regex, any name set
    const RC = require('../reachcache'), vfs = require('../../lib/vfs');
    const memCache = () => { const m = new Map(); return { key: k => k, get: s => m.get(s) || null, put: (s, f) => m.set(s, f), m }; };
    const viewOf = root => {
      const files = new Map(), r0 = root.replace(/\\/g, '/');
      const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else files.set(r.toLowerCase(), { source: 'loose', container: r0, entry: r, layer: 'm', size: fs.statSync(path.join(d, e.name)).size }); } };
      walk(root, ''); return { files, shadows: [] };
    };
    let seed = 12345; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const NAMES = ['a', 'ab', 'b', 'a-b', 'b-c', 'a-b-c', 'x_y', 'a1', 'c', 'q-', 'z9-z'];
    const BITS = [...NAMES, ...NAMES.map(s => s.toUpperCase()), '-', '-', '_', '.', '"', '.dds"', '.DDS"', '.mdl', '.ply ', 'x.mdl', ' ', ' ', '\r\n', '{', '}', '"', '; c\n', 'zz', '\xe9', '\xc0', '0', 'k'];
    const FZ = path.join(w, 'fz');
    for (const n of NAMES) fs.mkdirSync(path.join(FZ, 'resource', 'entity', 'n'), { recursive: true });
    const txt = len => { let s = ''; for (let i = 0; i < len; i++) s += BITS[rnd(BITS.length)]; return s; };
    for (const n of NAMES) fs.writeFileSync(path.join(FZ, 'resource', 'entity', 'n', n + '.def'), Buffer.from(txt(6), 'latin1'));
    for (let i = 0; i < 40; i++) { const d = path.join(FZ, 'resource', i % 5 ? 'map' : 'set/interaction', 'f' + i + '.set'); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, Buffer.from(txt(3 + rnd(30)), 'latin1')); }
    for (let i = 0; i < 6; i++) { fs.mkdirSync(path.join(FZ, 'resource', 'entity', 'm' + i), { recursive: true }); fs.writeFileSync(path.join(FZ, 'resource', 'entity', 'm' + i, (i % 2 ? 'a' : 'x' + i) + '.mdl'), 'm'); }
    const VZ = viewOf(FZ);
    await t('reach cache: facts give the answers of the text scan, every mode (fuzz)', () => {
      const sets = [];
      for (let i = 0; i < 300; i++) { const s = new Set(); const k = 1 + rnd(5); for (let j = 0; j < k; j++) s.add(NAMES[rnd(NAMES.length)]); sets.push(s); }
      sets.push(new Set(NAMES.filter(n => !n.includes('-'))), new Set(NAMES.filter(n => n.includes('-'))), new Set(NAMES));
      const mc = memCache();
      let mixed = 0;
      for (const s of sets) {
        const a = R.reachability(VZ, 'm', s, {}), b = R.reachability(VZ, 'm', s, { cache: mc }), c = R.reachability(VZ, 'm', s, { cache: memCache() });
        assert.deepEqual([...b], [...a], [...s].join(','));
        assert.deepEqual([...c], [...a], [...s].join(',') + ' (facts made fresh)');
        if ([...s].some(n => n.includes('-')) && [...s].some(n => !n.includes('-'))) mixed++;
      }
      assert.ok(mixed > 50, 'mixed regex sets tried: ' + mixed);
      // one short text file at a time beside empty defs: each name's answer is "hit in that file", so every hit counts
      const F1 = path.join(w, 'f1'), T1 = path.join(F1, 'resource', 'map', 't.set');
      for (const n of NAMES) { const d = path.join(F1, 'resource', 'entity', 'n', n + '.def'); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, ''); }
      fs.mkdirSync(path.dirname(T1), { recursive: true });
      let hits = 0;
      const STEMMY = [...NAMES, ...NAMES, '-', '.dds"', '.dds"', '.Tga"', ' ', '.', '"', '_'];
      for (let i = 0; i < 4000; i++) {
        let s1 = ''; const len = 1 + rnd(6); for (let j = 0; j < len; j++) s1 += (i % 2 ? STEMMY : BITS)[rnd(i % 2 ? STEMMY.length : BITS.length)];
        fs.writeFileSync(T1, Buffer.from(s1, 'latin1'));
        const V1 = viewOf(F1), s = sets[rnd(sets.length)];
        const a = R.reachability(V1, 'm', s, {}), b = R.reachability(V1, 'm', s, { cache: memCache() });
        assert.deepEqual([...b], [...a], [...s].join(',') + ' in ' + JSON.stringify(fs.readFileSync(T1, 'latin1')));
        for (const x of a.values()) if (x.reach === 'REACHABLE') hits++;
      }
      assert.ok(hits > 300, 'hits seen: ' + hits);
      assert.deepEqual(R.reachAll(VZ, 'm', { cache: mc }), R.reachAll(VZ, 'm', {}));
      assert.deepEqual(R.reachAll(v, 'm', { cache: memCache() }), R.reachAll(v, 'm', {}));
      // many names (the token loop): 130 u-defs + all
      const big = new Set([...Array(130).keys()].map(i => 'u' + i).concat(['a', 'a-b', 'lone', 'sel', 'x_y']));
      assert.deepEqual([...R.reachability(v, 'm', big, { cache: memCache() })], [...R.reachability(v, 'm', big, {})]);
    });
    await t('reach cache: factsOf + applyFacts by hand (stems, parts, mixed)', () => {
      const fx = R.factsOf('{spawn "a-b.dds"} A-b x-Ab "ab.mdl"');
      const got = (want, mx) => { const o = []; R.applyFacts(fx, new Set(want), mx, x => o.push(x)); return o.sort(); };
      assert.deepEqual(got(['a-b', 'a', 'b', 'ab']), ['a', 'a-b', 'ab', 'b']);
      assert.deepEqual(got(['a', 'a-b'], { P: new Set(['a']), D: new Set(['a-b']) }), ['a']);
      assert.deepEqual(R.factsOf('"ab.mdl"').b, 'ab');
      assert.deepEqual(R.factsOf('"ab.mdl"').f, 'ab.mdl');
    });
    // a real cache file on disk: hits, no reads, invalidation by size / mtime / content, new files, other rules, a junction
    const reads = () => { let n = 0; const o = vfs.readRec; vfs.readRec = rec => { n++; return o(rec); }; return () => { vfs.readRec = o; return n; }; };
    const CD = path.join(w, 'rcache'), MT = require('../../lib/modtree');
    const scanRC = async (dir, T) => { const c = RC.open({ dir: CD, modDir: dir, T: T === undefined ? await MT.scan(dir) : T }); const stop = reads(), m = { cache: c }, r = R.reachAll(viewOf(dir), 'm', m); return { r, n: stop(), c, s: c.save() }; };
    await t('reach cache file: second run reads nothing, same answers; an edit is read again', async () => {
      const D = path.join(w, 'cp'); fs.cpSync(path.join(w, 'm'), D, { recursive: true });
      const fresh = () => R.reachAll(viewOf(D), 'm', {});
      const nText = [...viewOf(D).files.keys()].filter(k => !/\.(db|lng|tex|dds|ply)$/.test(k)).length;
      const a = await scanRC(D);
      assert.equal(a.n, nText, 'first run reads every text file'); assert.deepEqual(a.r, fresh()); assert.ok(a.s && a.s.entries === nText && a.s.bytes > 0);
      const b = await scanRC(D);
      assert.equal(b.n, 0, 'second run reads none'); assert.equal(b.c.stats.hits, nText); assert.deepEqual(b.r, a.r); assert.equal(b.s.bytes, 0, 'nothing new: not written');
      const c0 = await scanRC(D, null);   // no listing: one stat per file, same signatures
      assert.equal(c0.n, 0, 'stat signatures = listing signatures');
      // same size, new content, new mtime: lone is named now
      const f = path.join(D, 'resource', 'set', 'x.set'), old = fs.readFileSync(f, 'latin1');
      assert.equal(a.r.defs['resource/entity/lone/lone.def'], 'ORPHAN');
      assert.equal(old, 'x_y\r\n'); fs.writeFileSync(f, 'lone\n');
      const t1 = new Date(Date.now() + 5000); fs.utimesSync(f, t1, t1);
      const d = await scanRC(D);
      assert.equal(d.n, 1, 'only the edited file read'); assert.deepEqual(d.r, fresh()); assert.equal(d.r.defs['resource/entity/lone/lone.def'], 'REACHABLE');
      // a new file and a removed one
      fs.writeFileSync(path.join(D, 'resource', 'map', 'new.mi'), '{spawn sel}\r\n'); fs.rmSync(f);
      const e = await scanRC(D);
      assert.equal(e.n, 1, 'only the new file read'); assert.deepEqual(e.r, fresh()); assert.equal(e.r.defs['resource/entity/lone/lone.def'], 'ORPHAN'); assert.equal(e.s.entries, nText);
      // size change with the old mtime kept: read again
      const g = path.join(D, 'resource', 'map', 'm.mi'), st = fs.statSync(g); fs.appendFileSync(g, ' lone'); fs.utimesSync(g, st.atime, st.mtime);
      const h = await scanRC(D); assert.equal(h.n, 1, 'size change read'); assert.deepEqual(h.r, fresh());
      // another rule version or a cut file: empty cache, all read, no throw
      const cf = h.c.file, body = fs.readFileSync(cf, 'utf8');
      fs.writeFileSync(cf, body.replace(/"v":"[0-9a-f]+"/, '"v":"old"'));
      assert.equal((await scanRC(D)).n, nText, 'other RULES: all read');
      fs.writeFileSync(cf, fs.readFileSync(cf, 'utf8').slice(0, -3));
      const k = await scanRC(D); assert.equal(k.n, nText, 'cut file: all read'); assert.deepEqual(k.r, fresh());
      // through a junction (tools/check overlay): the same cache file, all hits
      const J = path.join(w, 'ov-mod'); fs.symlinkSync(D, J, 'junction');
      const j = await scanRC(J); assert.equal(j.c.file, k.c.file); assert.equal(j.n, 0, 'junction: no reads'); assert.deepEqual(j.r, k.r);
      fs.rmdirSync(J);
    });
    await t('reach cache key: pak entry by pak size+mtime and entry crc; interaction mark; unknown = null', () => {
      const P = path.join(w, 'p.pak'); fs.writeFileSync(P, 'xx');
      const c = RC.open({ dir: CD, modDir: P + '.d', T: null });
      const ent = { size: 3, csize: 2, off: 10, crc: 7 }, rec = { source: 'pak', container: P, entry: 'set/a.set', ent, size: 3 };
      const k1 = c.key('resource/set/a.set', rec), k2 = c.key('resource/set/a.set', { ...rec, ent: { ...ent, crc: 8 } });
      assert.ok(k1 && k2 && k1 !== k2);
      assert.ok(/\|I$/.test(c.key('resource/set/interaction/a.set', rec)));
      assert.equal(c.key('resource/x', { source: 'loose', container: w, entry: 'nope', size: 1 }), null);
      const c2 = RC.open({ dir: CD, modDir: P + '.d', T: null }); fs.appendFileSync(P, 'y');
      assert.notEqual(c2.key('resource/set/a.set', rec), k1, 'pak changed: new signature');
      assert.equal(RC.offWhy({ noReachCache: true }), '--no-reach-cache'); assert.equal(RC.offWhy({}, { ARSENAL_REACH_CACHE: '0' }), 'ARSENAL_REACH_CACHE=0'); assert.equal(RC.offWhy({}, {}), null);
    });
    await t('walkAsync = C.walk (order, links as files)', async () => {
      put('resource/Z/b.txt', 'b'); put('resource/z2/A.txt', 'a'); put('.arsenal-undo/t1/x.def', 'x');
      try { fs.symlinkSync(path.join(w, 'm', 'resource', 'map'), path.join(w, 'm', 'resource', 'link'), 'junction'); } catch (e) { /* no links here */ }
      assert.deepEqual(await W.walkAsync(path.join(w, 'm')), C.walk(path.join(w, 'm')));
      await assert.rejects(W.walkAsync(path.join(w, 'nope')));
    });
  } finally { fs.rmSync(w, { recursive: true, force: true }); }
  console.log(bad ? `FAIL reach ${bad}` : `reach ok ${n}`);
  process.exit(bad ? 1 : 0);
})();
