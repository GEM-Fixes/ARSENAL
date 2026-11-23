// entityindex buildAsync case (made-up game folder + loose mod folder, and a folder-only index): the loose files are read ahead of
//   the parser through the thread pool; the cache file is the same, byte for byte (but meta.built), as build's: cold, warm, after
//   a change (the old record's includes are read ahead too), with a tiny window and a tiny byte limit, and when a read-ahead
//   fails (the file is then read as build reads it). A file that cannot be read fails both builds the same way. Nothing is
//   held after the build. lib/sdlset readAhead on its own: the bytes held stay under the limit plus one window, drop and close let go.
//   usage: node ahead.js <workdir>   (run.sh gives its temp dir; nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-8f073b4f)
const fs = require('fs'), path = require('path'), os = require('os');
const W = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'eiahead-'));
const GAME = path.join(W, 'aheadgame'), FOLD = path.join(W, 'aheadfolder'), TC = path.join(W, 'tca');
process.env.ARSENAL_CACHE = TC; process.env.AS2_NO_STEAM = '1';
for (const d of [GAME, FOLD, TC]) fs.rmSync(d, { recursive: true, force: true });
const put = (g, k, t) => { const p = path.join(g, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); return p; };
const N = 90;   // more than two windows of files
put(GAME, 'mowas_2.exe', 'MZ');
put(GAME, 'resource/properties/shared.ext', '{boarder {anm "d" {forward {begin "anm_game"}}}}\r\n');
for (let i = 0; i < 6; i++) put(GAME, `resource/entity/g${i}.def`, `{game_entity\r\n\t(include "/properties/shared.ext")\r\n\t{Extension "g${i}.mdl"}\r\n}\r\n`);
for (let i = 0; i < 6; i++) put(GAME, `resource/entity/g${i}.mdl`, `{skeleton {bone "body" {VolumeView "g${i}.ply"}}}\r\n`);
const INC = put(FOLD, 'resource/properties/mine.ext', '{boarder {anm "d" {forward {begin "anm_mine"}}}}\r\n');
for (let i = 0; i < N; i++) {
  put(FOLD, `resource/entity/m${i}.def`, `{game_entity\r\n\t(include "/properties/mine.ext")\r\n\t(include "/properties/shared.ext")\r\n\t{Extension "m${i}.mdl"}\r\n\t{Weaponry {weapon "w${i % 4}"}}\r\n}\r\n`);
  put(FOLD, `resource/entity/m${i}.mdl`, `{skeleton {bone "body" {VolumeView "m${i}.ply"}}}\r\n`);
  if (i % 3 === 0) put(FOLD, `resource/entity/m${i}.mtl`, `{material simple {diffuse "$/tex${i}"}}\r\n`);
}
put(FOLD, 'resource/entity/empty.def', '');
put(FOLD, 'resource/set/stuff/gun/.presets', '{presetblock {tag "p"}}\r\n');
for (let i = 0; i < 4; i++) put(FOLD, `resource/set/stuff/gun/w${i}`, '(include "/properties/mine.ext")\r\n{from "pattern base" {entity "m0"}}\r\n');

const ix = require('../index'), sdlset = require('../../lib/sdlset');
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const text = c => { const d = JSON.parse(fs.readFileSync(c, 'utf8')); d.meta.built = ''; return JSON.stringify(d); };
const tables = r => JSON.stringify([r.idx.entities, r.idx.stuff, r.idx.models, r.idx.aux]);
const AUX = () => ({ props: { select: k => k.startsWith('resource/properties/'), extract: (b, k) => b.length, raw: true } });
// sync reads of loose files, counted
const reads = new Map(), rfs = fs.readFileSync;
fs.readFileSync = function (p) { if (typeof p === 'string') { const k = path.resolve(p).toLowerCase(); reads.set(k, (reads.get(k) || 0) + 1); } return rfs.apply(fs, arguments); };
const syncReadsUnder = d => { let n = 0; const D = path.resolve(d).toLowerCase(); for (const [k, v] of reads) if (k.startsWith(D) && !k.endsWith('.json')) n += v; return n; };

(async () => {
  // 1. game + folder: cold, warm, changed
  for (const [name, opt] of [['default', {}], ['window 2, 1 byte held', { aheadWindow: 2, aheadBytes: 1 }], ['no read-ahead', { readAhead: false }], ['no byte memo', { byteMemo: false }]]) {
    const cS = path.join(W, 'ahead-s.json'), cA = path.join(W, 'ahead-a.json');
    for (const f of [cS, cA]) fs.rmSync(f, { force: true });
    const base = { gameDir: GAME, folder: FOLD, aux: AUX() };
    const a = ix.build({ ...base, cache: cS, byteMemo: opt.byteMemo });
    reads.clear();
    const b = await ix.buildAsync({ ...base, ...opt, cache: cA });
    const nSync = syncReadsUnder(FOLD);
    if (text(cS) !== text(cA)) fail(name + ': cold cache differs between build and buildAsync');
    if (tables(a) !== tables(b)) fail(name + ': cold index object differs');
    for (const k of ['entities', 'stuff', 'models', 'parsed', 'reused', 'auxParsed', 'auxReused', 'checkpoints']) if (a.stats[k] !== b.stats[k]) fail(name + ': stats.' + k + ' ' + a.stats[k] + ' / ' + b.stats[k]);
    if (b.src.bytes !== null) fail(name + ': nothing is kept after buildAsync returns');
    if (opt.readAhead === false) { if (b.stats.ahead) fail(name + ': no read-ahead asked, yet stats.ahead'); }
    else {
      const s = b.stats.ahead;
      if (!s || s.taken < 2 * N) fail(name + ': the loose files come from the read-ahead: ' + JSON.stringify(s));
      if (name === 'default' && nSync > 8) fail(name + ': files read one by one although read ahead: ' + nSync);
      if (opt.aheadBytes === 1 && s.peak > 4096) fail(name + ': bytes held over the limit: ' + s.peak);
    }
    // warm: nothing parsed, nothing read ahead
    const w = await ix.buildAsync({ ...base, ...opt, cache: cA });
    if (w.stats.parsed !== 0 || w.stats.auxParsed !== 0 || (w.stats.ahead && w.stats.ahead.added !== 0)) fail(name + ': warm buildAsync parses or reads: ' + JSON.stringify(w.stats));
    if (text(cS) !== text(cA)) fail(name + ': warm cache differs');
    // an include changes: the files that name it are parsed again by both, the same
    fs.writeFileSync(INC, '{boarder {anm "d" {forward {begin "anm_' + name.length + '"}}}}\r\n');
    const t = new Date(Date.now() + 5000 + 2000 * name.length); fs.utimesSync(INC, t, t);
    const a2 = ix.build({ ...base, cache: cS, byteMemo: opt.byteMemo }), b2 = await ix.buildAsync({ ...base, ...opt, cache: cA });
    if (a2.stats.parsed !== N + 4 || b2.stats.parsed !== a2.stats.parsed) fail(name + ': after the change both parse the same files: ' + a2.stats.parsed + ' / ' + b2.stats.parsed);
    if (text(cS) !== text(cA) || tables(a2) !== tables(b2)) fail(name + ': after the change the cache differs');
  }
  // 2. folder-only index (lib/sdlset source: its own get/open take from the read-ahead)
  {
    const cS = path.join(W, 'aheadf-s.json'), cA = path.join(W, 'aheadf-a.json');
    const a = ix.build({ folder: FOLD, cache: cS }), b = await ix.buildAsync({ folder: FOLD, cache: cA });
    if (text(cS) !== text(cA) || tables(a) !== tables(b)) fail('folder only: cache differs');
    if (!b.stats.ahead || b.stats.ahead.taken < 2 * N) fail('folder only: the loose files come from the read-ahead: ' + JSON.stringify(b.stats.ahead));
  }
  // 3. a read-ahead that fails (every async read of a .def errors): each such file is read as build reads it, same cache
  {
    const rf = fs.readFile; let failed = 0;
    fs.readFile = function (p, cb) { if (/\.def$/.test(String(p))) { failed++; return setImmediate(() => cb(Object.assign(new Error('EIO: made up'), { code: 'EIO' }))); } return rf.apply(fs, arguments); };
    const cS = path.join(W, 'aheade-s.json'), cA = path.join(W, 'aheade-a.json');
    try {
      const a = ix.build({ gameDir: GAME, folder: FOLD, cache: cS }), b = await ix.buildAsync({ gameDir: GAME, folder: FOLD, cache: cA });
      if (text(cS) !== text(cA) || tables(a) !== tables(b)) fail('failed read-ahead: cache differs');
      if (failed < N || b.stats.ahead.failed < N) fail('failed read-ahead: the case did not run: ' + failed + ' ' + JSON.stringify(b.stats.ahead));
    } finally { fs.readFile = rf; }
  }
  // 4. a file that is gone when it is read (listed, then deleted): both builds stop with the same error
  {
    const gone = path.resolve(path.join(FOLD, 'resource/entity/m7.def')).toLowerCase();
    const rf = fs.readFile, rs = fs.readFileSync;
    const enoent = p => Object.assign(new Error("ENOENT: no such file or directory, open '" + p + "'"), { code: 'ENOENT' });
    fs.readFile = function (p, cb) { if (path.resolve(String(p)).toLowerCase() === gone) return setImmediate(() => cb(enoent(p))); return rf.apply(fs, arguments); };
    fs.readFileSync = function (p) { if (typeof p === 'string' && path.resolve(p).toLowerCase() === gone) throw enoent(p); return rs.apply(fs, arguments); };
    let e1 = null, e2 = null;
    try {
      try { ix.build({ gameDir: GAME, folder: FOLD, cache: path.join(W, 'aheadg-s.json') }); } catch (e) { e1 = e; }
      try { await ix.buildAsync({ gameDir: GAME, folder: FOLD, cache: path.join(W, 'aheadg-a.json') }); } catch (e) { e2 = e; }
    } finally { fs.readFile = rf; fs.readFileSync = rs; }
    if (!e1 || !e2 || e1.code !== 'ENOENT' || e2.code !== e1.code || e2.message !== e1.message) fail('a file gone: build and buildAsync fail the same way: ' + (e1 && e1.message) + ' / ' + (e2 && e2.message));
    if (fs.existsSync(path.join(W, 'aheadg-a.json')) !== fs.existsSync(path.join(W, 'aheadg-s.json'))) fail('a file gone: one build wrote a cache, the other did not');
    const src = ix.openSource({ gameDir: GAME, folder: FOLD });
    if (src.bytes !== null || src.ahead(null) !== null) fail('a new source holds nothing');
  }
  // 5. readAhead alone: the limit, drop, close
  {
    const D = path.join(W, 'aheadfiles'); fs.mkdirSync(D, { recursive: true });
    const files = []; for (let i = 0; i < 200; i++) { const p = path.join(D, 'f' + i + '.bin'); fs.writeFileSync(p, Buffer.alloc(1000, i % 251)); files.push(p); }
    const ra = sdlset.readAhead({ window: 8, maxBytes: 10000 });
    files.forEach((p, i) => ra.add('k' + i, p));
    ra.add('nofile', path.join(D, 'missing.bin'));
    let wrong = 0, early = 0;
    for (let i = 0; i < 200; i++) {
      const w = ra.wait('k' + i); if (w) await w;
      if (i % 10 === 9) { ra.drop('k' + i); continue; }               // passed without taking
      const b = ra.take('k' + i);
      if (!b) early++; else if (b.length !== 1000 || b[0] !== i % 251) wrong++;
      if (ra.take('k' + i) !== undefined) wrong++;                     // once only
    }
    const w = ra.wait('nofile'); if (w) await w;
    if (ra.take('nofile') !== undefined) fail('readAhead: a file that cannot be read gives undefined');
    if (wrong || early) fail('readAhead: wrong bytes ' + wrong + ', not there after wait ' + early);
    if (ra.stats.peak > 10000 + 8 * 1000) fail('readAhead: held ' + ra.stats.peak + ' bytes, over the limit plus one window');
    if (ra.stats.taken !== 180 || ra.stats.failed !== 1) fail('readAhead: counts ' + JSON.stringify(ra.stats));
    if (ra.wait('never added') !== null || ra.take('never added') !== undefined) fail('readAhead: an unknown key is nothing');
    const rb = sdlset.readAhead({ window: 4 }); files.slice(0, 20).forEach((p, i) => rb.add('k' + i, p));
    rb.close();
    await new Promise(r => setTimeout(r, 50));
    if (rb.take('k0') !== undefined || rb.wait('k1') !== null) fail('readAhead: close lets everything go');
  }
  // 6. lib/sdlset source: prefetch fills the memo (memo on only), the later reads take the same bytes without asking the disk
  {
    const s = sdlset.createSource({ folder: FOLD });
    const ks = [...s.local.keys()].filter(k => k.endsWith('.def')).concat(['resource/entity/not-there.def']);
    if (await s.prefetch(ks) !== 0) fail('prefetch: memo off keeps nothing');
    s.memo(true);
    const n = await s.prefetch(ks);
    reads.clear();
    let same = 0; for (const k of ks.slice(0, -1)) if (s.get(k).equals(rfs(s.local.get(k)))) same++;
    reads.clear();
    for (const k of ks.slice(0, -1)) s.get(k);
    if (n !== N + 1 || same !== N + 1 || syncReadsUnder(FOLD) !== 0) fail('prefetch: ' + n + ' files kept, ' + same + ' equal, ' + syncReadsUnder(FOLD) + ' read again');
    if (await s.prefetch(ks) !== 0) fail('prefetch: a file the memo holds is not read again');
    s.memo(false); reads.clear(); s.get(ks[0]);
    if (syncReadsUnder(FOLD) !== 1) fail('prefetch: memo off, the disk is asked again');
    s.memo(true); const p = s.prefetch(ks, { window: 2, maxBytes: 1 }); s.memo(false);
    if (await p > 2) fail('prefetch: memo switched off meanwhile keeps nothing more');
  }
  fs.readFileSync = rfs;
  if (bad) { console.log('ahead.js FAIL ' + bad); process.exit(1); }
  console.log('ahead.js ok');
})().catch(e => { console.log('ahead.js FAIL ' + (e && e.stack || e)); process.exit(1); });
