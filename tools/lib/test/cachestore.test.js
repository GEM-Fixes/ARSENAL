// cachestore: seeded defects against the shared store (tools/gui/README.md "CACHE", contract 1). Stand-alone:
//   node tools/lib/test/cachestore.test.js   (exit 1 on a failure, last line PASS n / FAIL k of n)
// Every root is a fresh folder under the temp folder (TEMP/TMP/TMPDIR), never the real cache; release always comes
// from open({release}). `child <root> <who> <n>` is the writer the two-process case starts twice.
// Author: Imperator_Aug (ARSENAL, ia-9f6f9db3)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), assert = require('assert');
const cs = require('../cachestore'), cw = require('../cachewrite');

const REL = 'ARSENAL test-1';
const RACE = { parts: { game: 'g:/game', n: 1 }, stamps: { game: 'G1' } };

if (process.argv[2] === 'child') {
  const S = cs.open({ root: process.argv[3], release: REL }), who = process.argv[4], n = +process.argv[5];
  let miss = 0;
  for (let i = 0; i < n; i++) {
    const r = S.put('race', 1, RACE.parts, RACE.stamps, { who, i, pad: who.repeat(20000 + i) });
    if (!r.bytes) { console.error('child ' + who + ': put ' + i + ' not written'); process.exit(2); }
    const g = S.get('race', 1, RACE.parts, RACE.stamps);
    if (!g) miss++;
    else if (g.value.pad !== g.value.who.repeat(20000 + g.value.i)) { console.error('child ' + who + ': torn value'); process.exit(3); }
  }
  console.log(JSON.stringify({ who, miss }));
  process.exit(0);
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cachestore-'));
let rootN = 0;
const newRoot = () => path.join(base, 'r' + (++rootN));
const open = (o = {}) => cs.open(Object.assign({ root: newRoot(), release: REL }, o));
const entryDir = (S, section, parts) => path.join(S.root, 'e', S.key(section, parts));
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const P = { game: 'c:/games/as2', exe: 'mowas_2.exe', gid: 'as2', mod: 'e:/mods/x', q: { page: 2 } };
const ST = { game: 'G1', 'mod:set': 'S1', 'mod:entity': 'E1', rules: 'R1' };

t('hit returns the saved JSON value, at and bytes', () => {
  let clock = 5000;
  const S = open({ now: () => clock });
  const v = { rows: [1, 2, { a: 'ю' }], name: 'x' };
  const r = S.put('balance.prices', 3, P, ST, v);
  assert.equal(r.bytes, Buffer.byteLength(JSON.stringify(v)));
  clock = 9000;
  const g = S.get('balance.prices', 3, P, ST);
  assert.deepEqual(g, { value: v, at: 5000, bytes: r.bytes });
  // key order of parts and stamps is not part of the identity
  const P2 = { q: { page: 2 }, mod: P.mod, gid: P.gid, exe: P.exe, game: P.game };
  assert.deepEqual(S.get('balance.prices', 3, P2, { rules: 'R1', 'mod:entity': 'E1', 'mod:set': 'S1', game: 'G1' }).value, v);
  assert.deepEqual(S.state('balance.prices', 3, P, ST), { state: 'ready', why: [], at: 5000, bytes: r.bytes });
  for (const f of ['meta.json', 'value.json']) assert.ok(fs.existsSync(path.join(entryDir(S, 'balance.prices', P), f)), f);
  assert.deepEqual(fs.readdirSync(path.join(S.root, 't')), [], 'temp files left');
  assert.deepEqual(fs.readdirSync(path.join(S.root, 'l')), [], 'locks left');
});

t('hit returns the saved Buffer; a put replaces the entry and its kind', () => {
  const S = open();
  const b = Buffer.from([0, 1, 2, 255, 254, 10, 13, 0]);
  assert.equal(S.put('art.thumb', 1, P, ST, b).bytes, 8);
  const g = S.get('art.thumb', 1, P, ST);
  assert.ok(Buffer.isBuffer(g.value) && g.value.equals(b));
  const d = entryDir(S, 'art.thumb', P);
  assert.ok(fs.existsSync(path.join(d, 'value.bin')) && !fs.existsSync(path.join(d, 'value.json')));
  S.put('art.thumb', 1, P, ST, { now: 'json' });
  assert.deepEqual(S.get('art.thumb', 1, P, ST).value, { now: 'json' });
  assert.ok(!fs.existsSync(path.join(d, 'value.bin')), 'old value.bin kept');
  assert.equal(S.stats().entries, 1);
});

t('none when absent; other parts or section are other entries', () => {
  const S = open();
  assert.equal(S.get('a.b', 1, P, ST), null);
  assert.deepEqual(S.state('a.b', 1, P, ST), { state: 'none', why: [], at: null, bytes: 0 });
  S.put('a.b', 1, P, ST, 1);
  assert.equal(S.get('a.b', 1, Object.assign({}, P, { mod: 'e:/mods/y' }), ST), null);
  assert.equal(S.get('a.c', 1, P, ST), null);
  assert.equal(S.state('a.c', 1, P, ST).state, 'none');
  assert.throws(() => S.get('Bad Name', 1, P, ST), TypeError);
});

t('changed stamp, ver or release is a miss and state says why', () => {
  const S = open();
  S.put('doc.x', 2, P, ST, { v: 1 });
  const why = (ver, st) => { assert.equal(S.get('doc.x', ver, P, st), null); const s = S.state('doc.x', ver, P, st); assert.equal(s.state, 'stale'); return s.why; };
  assert.deepEqual(why(2, Object.assign({}, ST, { 'mod:set': 'S2' })), ['mod']);
  assert.deepEqual(why(2, Object.assign({}, ST, { 'mod:set': 'S2', 'mod:entity': 'E2' })), ['mod']);
  assert.deepEqual(why(2, Object.assign({}, ST, { game: 'G2' })), ['game']);
  assert.deepEqual(why(3, ST), ['version']);
  assert.deepEqual(why(3, Object.assign({}, ST, { game: 'G2', 'mod:set': 'S2', rules: 'R2' })), ['version', 'game', 'mod', 'rules']);
  // a stamp name on one side only differs too
  const less = Object.assign({}, ST); delete less.rules;
  assert.deepEqual(why(2, less), ['rules']);
  assert.deepEqual(why(2, Object.assign({}, ST, { lang: 'L1' })), ['lang']);
  // nothing above removed the entry
  assert.deepEqual(S.get('doc.x', 2, P, ST).value, { v: 1 });
  // another release on the same root
  cs._reset();
  const S2 = cs.open({ root: S.root, release: 'ARSENAL test-2' });
  assert.notEqual(S2, S);
  assert.equal(S2.get('doc.x', 2, P, ST), null);
  assert.deepEqual(S2.state('doc.x', 2, P, ST).why, ['release']);
  assert.deepEqual(S2.state('doc.x', 3, P, Object.assign({}, ST, { game: 'G2' })).why, ['release', 'version', 'game']);
});

t('open memoises one store per root', () => {
  const root = newRoot();
  const A = cs.open({ root, release: REL }), B = cs.open({ root: root + path.sep, release: 'other', cap: 5 });
  assert.equal(A, B);
  assert.equal(B.release, REL);
  assert.equal(A.cap, cs.CAP);
});

t('a damaged meta or value is dropped, not served', () => {
  const S = open();
  const cases = {
    'meta cut short': d => fs.writeFileSync(path.join(d, 'meta.json'), fs.readFileSync(path.join(d, 'meta.json'), 'utf8').slice(0, 40)),
    'meta not JSON': d => fs.writeFileSync(path.join(d, 'meta.json'), 'garbage'),
    'meta of another identity': d => { const m = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')); m.parts = { other: 1 }; fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(m)); },
    'meta missing (half written)': d => fs.unlinkSync(path.join(d, 'meta.json')),
    'value cut short': d => fs.writeFileSync(path.join(d, 'value.json'), fs.readFileSync(path.join(d, 'value.json'), 'utf8').slice(0, 10)),
    'value changed, same length': d => fs.writeFileSync(path.join(d, 'value.json'), fs.readFileSync(path.join(d, 'value.json'), 'utf8').replace('secret', 'SECRET')),
    'value missing (half written)': d => fs.unlinkSync(path.join(d, 'value.json')),
  };
  let n = 0;
  for (const name of Object.keys(cases)) {
    const parts = { c: ++n }, d = entryDir(S, 'dmg', parts);
    S.put('dmg', 1, parts, ST, { word: 'secret', pad: 'p'.repeat(200) });
    assert.ok(S.get('dmg', 1, parts, ST), name + ': not readable before the damage');
    cases[name](d);
    assert.equal(S.get('dmg', 1, parts, ST), null, name + ': served');
    assert.ok(!fs.existsSync(d), name + ': not removed');
    assert.equal(S.state('dmg', 1, parts, ST).state, 'none', name);
    // state alone drops a damaged meta too
    S.put('dmg', 1, parts, ST, { word: 'secret' });
    if (/^meta|value missing/.test(name)) {
      cases[name](d);
      assert.equal(S.state('dmg', 1, parts, ST).state, 'none', name + ': state');
      assert.ok(!fs.existsSync(d), name + ': state did not remove');
    }
  }
  // a damaged Buffer value
  const b = Buffer.alloc(64, 7), d = entryDir(S, 'dmg', { bin: 1 });
  S.put('dmg', 1, { bin: 1 }, ST, b);
  fs.writeFileSync(path.join(d, 'value.bin'), Buffer.alloc(64, 8));
  assert.equal(S.get('dmg', 1, { bin: 1 }, ST), null);
  assert.ok(!fs.existsSync(d));
  // stats does not count what is left of the damaged ones
  assert.equal(S.stats().entries, Object.keys(cases).filter(k => !/^meta|value missing/.test(k)).length);
});

t('wrap shares one make between two concurrent calls', async () => {
  const S = open();
  let made = 0;
  const make = async () => { made++; await new Promise(r => setTimeout(r, 30)); return { made }; };
  const [a, b] = await Promise.all([S.wrap('w.x', 1, P, ST, make), S.wrap('w.x', 1, P, ST, make)]);
  assert.equal(made, 1);
  assert.deepEqual(a, { made: 1 }); assert.deepEqual(b, { made: 1 });
  assert.deepEqual(await S.wrap('w.x', 1, P, ST, make), { made: 1 });      // now from the store
  assert.equal(made, 1);
  assert.deepEqual(await S.wrap('w.x', 1, P, Object.assign({}, ST, { game: 'G2' }), make), { made: 2 });   // other stamps: made again
  assert.deepEqual(S.get('w.x', 1, P, Object.assign({}, ST, { game: 'G2' })).value, { made: 2 });
  assert.equal(S.get('w.x', 1, P, ST), null);
});

t('wrap stores nothing when make throws', async () => {
  const S = open();
  let made = 0;
  const boom = async () => { made++; await new Promise(r => setTimeout(r, 10)); throw new Error('boom'); };
  const r = await Promise.allSettled([S.wrap('w.y', 1, P, ST, boom), S.wrap('w.y', 1, P, ST, boom)]);
  assert.deepEqual(r.map(x => x.status + ':' + (x.reason && x.reason.message)), ['rejected:boom', 'rejected:boom']);
  assert.equal(made, 1);
  await assert.rejects(S.wrap('w.y', 1, P, ST, () => { throw new Error('sync boom'); }), /sync boom/);
  assert.equal(S.state('w.y', 1, P, ST).state, 'none');
  assert.equal(S.stats().entries, 0);
  assert.equal(await S.wrap('w.y', 1, P, ST, () => 'ok'), 'ok');           // the failed make is not remembered
  assert.equal(S.get('w.y', 1, P, ST).value, 'ok');
});

t('clear(section) leaves other sections; clear() takes all', () => {
  const S = open();
  const b1 = S.put('one', 1, { n: 1 }, ST, 'aaaa').bytes, b2 = S.put('one', 1, { n: 2 }, ST, 'bbbbbb').bytes;
  S.put('one.two', 1, { n: 1 }, ST, 'c'); S.put('two', 1, { n: 1 }, ST, Buffer.alloc(10));
  assert.deepEqual(S.clear('one'), { removed: 2, bytes: b1 + b2 });
  assert.equal(S.get('one', 1, { n: 1 }, ST), null);
  assert.equal(S.get('one.two', 1, { n: 1 }, ST).value, 'c');
  assert.equal(S.get('two', 1, { n: 1 }, ST).value.length, 10);
  assert.deepEqual(Object.keys(S.stats().sections).sort(), ['one.two', 'two']);
  assert.deepEqual(S.clear('nope'), { removed: 0, bytes: 0 });
  assert.equal(S.clear().removed, 2);
  assert.deepEqual(S.stats().sections, {});
});

t('sweep removes only other releases', () => {
  const root = newRoot();
  const A = cs.open({ root, release: 'ARSENAL 1.0.0' });
  A.put('s', 1, { n: 1 }, ST, 'old1'); A.put('s', 1, { n: 2 }, ST, 'old2'); A.put('t', 1, { n: 1 }, ST, 'old3');
  assert.deepEqual(A.sweep(), { removed: 0 });
  cs._reset();
  const B = cs.open({ root, release: 'ARSENAL 1.1.0' });
  B.put('s', 1, { n: 2 }, ST, 'new2'); B.put('u', 1, { n: 1 }, ST, 'new4');     // replaces one old entry, adds one
  assert.deepEqual(B.sweep(), { removed: 2 });
  assert.equal(B.get('s', 1, { n: 2 }, ST).value, 'new2');
  assert.equal(B.get('u', 1, { n: 1 }, ST).value, 'new4');
  assert.equal(B.state('s', 1, { n: 1 }, ST).state, 'none');
  assert.equal(B.state('t', 1, { n: 1 }, ST).state, 'none');
  assert.equal(B.stats().entries, 2);
  assert.deepEqual(B.sweep(), { removed: 0 });
});

t('eviction: least recently used first, never the entry just written', () => {
  let clock = 1000000;
  const S = open({ cap: 350, now: () => clock });
  const put = n => { clock += 1000; return S.put('ev', 1, { n }, ST, Buffer.alloc(100, n)); };
  const has = n => S.state('ev', 1, { n }, ST).state === 'ready';
  put(1); put(2); put(3);
  assert.deepEqual([1, 2, 3].map(has), [true, true, true]);
  clock += 5000; assert.ok(S.get('ev', 1, { n: 1 }, ST));      // 1 is the oldest write, now the most recent use
  assert.ok(S.get('ev', 1, { n: 1 }, ST));                     // a second get within the minute: no new touch needed
  put(4);                                                      // 400 > 350: one must go, and it is 2
  assert.deepEqual([1, 2, 3, 4].map(has), [true, false, true, true]);
  assert.equal(S.stats().bytes, 300);
  put(5);                                                      // next oldest use is 3
  assert.deepEqual([1, 3, 4, 5].map(has), [true, false, true, true]);
  clock += 120000; assert.ok(S.get('ev', 1, { n: 4 }, ST));
  put(6);                                                      // 1 (used before 4 and 5's write) goes
  assert.deepEqual([1, 4, 5, 6].map(has), [false, true, true, true]);
  // an entry larger than the whole cap still stays while it is the newest
  const T = open({ cap: 50, now: () => clock });
  clock += 1000; T.put('ev', 1, { n: 'x' }, ST, Buffer.alloc(100));
  assert.equal(T.state('ev', 1, { n: 'x' }, ST).state, 'ready');
  clock += 1000; T.put('ev', 1, { n: 'y' }, ST, Buffer.alloc(100));
  assert.equal(T.state('ev', 1, { n: 'x' }, ST).state, 'none');
  assert.equal(T.state('ev', 1, { n: 'y' }, ST).state, 'ready');
  assert.deepEqual(T.evict(), { removed: 1, bytes: 100 });     // asked by hand, nothing is protected
  assert.equal(T.stats().entries, 0);
});

t('stats numbers match and read no value', () => {
  const S = open();
  const vals = [['a', { n: 1 }, { x: 'one' }], ['a', { n: 2 }, [1, 2, 3, 4]], ['b.c', { n: 1 }, Buffer.alloc(77)], ['b.c', { n: 2 }, 'str'], ['d', {}, null]];
  const want = { bytes: 0, entries: 0, cap: cs.CAP, root: S.root, sections: {} };
  for (const [sec, parts, v] of vals) {
    const b = S.put(sec, 1, parts, ST, v).bytes;
    assert.equal(b, Buffer.isBuffer(v) ? v.length : Buffer.byteLength(JSON.stringify(v)));
    const s = want.sections[sec] || (want.sections[sec] = { bytes: 0, entries: 0 });
    s.bytes += b; s.entries++; want.bytes += b; want.entries++;
  }
  assert.deepEqual(S.stats(), want);
  assert.equal(S.get('d', 1, {}, ST).value, null);             // a stored null is a hit, not a miss
  // values are not opened: a value file that cannot be read as a file does not disturb the numbers
  const d = entryDir(S, 'a', { n: 1 });
  fs.unlinkSync(path.join(d, 'value.json')); fs.mkdirSync(path.join(d, 'value.json'));
  S.put('zz', 1, {}, ST, 'x');                                 // a write drops the cached answer
  want.sections.zz = { bytes: 3, entries: 1 }; want.bytes += 3; want.entries++;
  assert.deepEqual(S.stats(), want);
  const got = S.stats(); got.sections.a.bytes = -1;            // the caller's copy is its own
  assert.deepEqual(S.stats(), want);
});

t('a failed write warns once and returns {bytes: 0}', () => {
  const f = path.join(base, 'a-file'); fs.writeFileSync(f, 'x');
  const S = cs.open({ root: path.join(f, 'store'), release: REL });
  const errs = [], ce = console.error; console.error = m => errs.push(String(m));
  cw._reset();
  try {
    assert.deepEqual(S.put('x', 1, P, ST, { a: 1 }), { bytes: 0 });
    assert.deepEqual(S.put('x', 1, P, ST, { a: 2 }), { bytes: 0 });
    assert.equal(S.get('x', 1, P, ST), null);
    assert.deepEqual(S.stats().entries, 0);
  } finally { console.error = ce; cw._reset(); }
  assert.equal(errs.length, 1);
  assert.ok(/^cache not written \(/.test(errs[0]), errs[0]);
  const T = open();
  assert.deepEqual(T.put('x', 1, P, ST, undefined), { bytes: 0 });   // JSON cannot hold it
  assert.equal(T.state('x', 1, P, ST).state, 'none');
});

t('two processes writing one identity 50 times each leave a readable entry', async () => {
  const root = newRoot();
  const run = who => new Promise((res, rej) => {
    const ch = cp.spawn(process.execPath, [__filename, 'child', root, who, '50'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    ch.stdout.on('data', d => { out += d; }); ch.stderr.on('data', d => { err += d; });
    // watchdog 5 min (WAIT line): a stuck child ends the step as failed, never a hang (no rerun: the two children must race together)
    const dog = setTimeout(() => { require('./wait').say('cachestore test', 'writer child ' + who, 300000); ch.kill(); }, 300000);
    ch.on('error', rej);
    ch.on('close', code => clearTimeout(dog));
    ch.on('close', code => code === 0 ? res(JSON.parse(out.trim().split('\n').pop())) : rej(new Error('child ' + who + ' exit ' + code + ': ' + err)));
  });
  let [a, b] = await Promise.all([run('A'), run('B')]);
  // a get that lands in the other writer's rename window can miss on a busy PC (a miss is only a cache miss): race once more before failing
  if (a.miss + b.miss) { require('./wait').say('cachestore test', 'a race without a missed get ('+ JSON.stringify([a, b]) + '), races once more', 0); [a, b] = await Promise.all([run('A'), run('B')]); }
  assert.equal(a.miss + b.miss, 0, 'a get between the writes missed: ' + JSON.stringify([a, b]));
  const S = cs.open({ root, release: REL });
  const g = S.get('race', 1, RACE.parts, RACE.stamps);
  assert.ok(g, 'the entry is not readable');
  assert.ok(g.value.who === 'A' || g.value.who === 'B');
  assert.equal(g.value.i, 49);
  assert.equal(g.value.pad, g.value.who.repeat(20049));
  assert.deepEqual(S.stats().sections, { race: { bytes: g.bytes, entries: 1 } });
  assert.deepEqual(fs.readdirSync(path.join(root, 't')), [], 'temp files left');
  assert.deepEqual(fs.readdirSync(path.join(root, 'l')), [], 'locks left');
});

const bruteStats = S => {
  const v = { bytes: 0, entries: 0, cap: S.cap, root: S.root, sections: {} };
  let names = []; try { names = fs.readdirSync(path.join(S.root, 'e')); } catch (e) { /* none */ }
  for (const key of names) {
    const m = S._meta(key); if (m.st !== 'ok') continue;
    const s = v.sections[m.meta.section] || (v.sections[m.meta.section] = { bytes: 0, entries: 0 });
    s.bytes += m.meta.bytes; s.entries++; v.bytes += m.meta.bytes; v.entries++;
  }
  return v;
};
const metaReads = (S, fn) => { const real = S._meta; let n = 0; S._meta = k => { n++; return real.call(S, k); }; try { fn(); } finally { delete S._meta; } return n; };

t('index: the whole-store numbers are those of every meta, read from index.json + j.log', () => {
  const root = newRoot();
  let S = cs.open({ root, release: REL });
  for (let i = 0; i < 60; i++) S.put(i % 2 ? 'ix.a' : 'ix.b', 1, { i }, ST, { i, pad: 'p'.repeat(i) });
  S.put('ix.a', 1, { i: 1 }, ST, 'replaced');                    // a second write of one identity
  S.clear('nope');
  assert.deepEqual(S.stats(), bruteStats(S));
  assert.ok(fs.existsSync(path.join(root, 'j.log')), 'journal');
  // a new process: rows from the journal (and the index once saved), at most 8 metas opened to check
  cs._reset(); S = cs.open({ root, release: REL });
  let got; const n1 = metaReads(S, () => { got = S.stats(); });
  assert.ok(n1 <= 8, 'metas read by a scan: ' + n1);
  assert.deepEqual(got, bruteStats(S));
  // an entry another tool removed by hand, and one it added without the journal: the folder listing wins
  const gone = entryDir(S, 'ix.b', { i: 0 });
  fs.rmSync(gone, { recursive: true, force: true });
  const jl = fs.readFileSync(path.join(root, 'j.log'));
  S.put('ix.c', 1, { added: 1 }, ST, 'new');
  fs.writeFileSync(path.join(root, 'j.log'), jl);                 // its journal line is lost
  S._dirty(); assert.deepEqual(S.stats(), bruteStats(S)); assert.equal(S.stats().sections['ix.c'].entries, 1);
  // a foreign folder with a key-like name is not counted and goes
  const alien = path.join(root, 'e', 'f'.repeat(40)); fs.mkdirSync(alien); fs.writeFileSync(path.join(alien, 'meta.json'), '{"section":"ix.a","bytes":5}');
  S._dirty(); assert.deepEqual(S.stats(), bruteStats(S)); assert.ok(!fs.existsSync(alien), 'foreign folder left');
  // rows that are wrong (written by something else) are put right in turn: 8 per scan
  const idxFile = path.join(root, 'index.json');
  S._saveIndex();
  const o = JSON.parse(fs.readFileSync(idxFile, 'utf8')), keys = Object.keys(o.e);
  assert.equal(keys.length, S.stats().entries);
  for (const k of keys) o.e[k][1] = 999999;
  o.j = 0; fs.writeFileSync(idxFile, JSON.stringify(o)); fs.writeFileSync(path.join(root, 'j.log'), '');
  cs._reset(); S = cs.open({ root, release: REL });
  assert.notDeepEqual(S.stats(), bruteStats(S));                 // the index is believed for what the listing has
  for (let i = 0; i < Math.ceil(keys.length / 8); i++) { S._dirty(); S.stats(); }
  S._dirty(); assert.deepEqual(S.stats(), bruteStats(S));
  // and never for serving: get reads the entry itself
  assert.deepEqual(S.get('ix.a', 1, { i: 1 }, ST).value, 'replaced');
  const d = entryDir(S, 'ix.a', { i: 3 }); fs.writeFileSync(path.join(d, 'value.json'), '"other"');
  assert.equal(S.get('ix.a', 1, { i: 3 }, ST), null); assert.ok(!fs.existsSync(d));
  // a broken index.json and journal: back to the metas, same numbers
  fs.writeFileSync(idxFile, '{not json'); fs.writeFileSync(path.join(root, 'j.log'), 'garbage\n["zz"]\n[1,2,3]\n');
  cs._reset(); S = cs.open({ root, release: REL });
  assert.deepEqual(S.stats(), bruteStats(S));
  cs._reset(); S = cs.open({ root, release: REL });
  assert.ok(metaReads(S, () => S.stats()) <= 8, 'the index was written again');
  // a long journal is folded into the index
  fs.appendFileSync(path.join(root, 'j.log'), (JSON.stringify([S.key('ix.a', { i: 1 }), 'ix.a', 10, REL, 1]) + '\n').repeat(9000));
  S.put('ix.a', 1, { i: 1 }, ST, 'replaced');
  S._dirty(); assert.deepEqual(S.stats(), bruteStats(S));
  assert.equal(fs.statSync(path.join(root, 'j.log')).size, 0, 'journal not folded');
  cs._reset(); S = cs.open({ root, release: REL });
  assert.deepEqual(S.stats(), bruteStats(S));
});

t('sweep drops a modtree entry whose mod folder is gone', () => {
  const S = open(), here = path.join(base, 'mod-here'), gone = path.join(base, 'mod-gone');
  fs.mkdirSync(here, { recursive: true });
  const k = d => d.replace(/\\/g, '/').toLowerCase();
  S.put('modtree', 1, { mod: k(here) }, {}, { all: 'a' });
  S.put('modtree', 1, { mod: k(gone) }, {}, { all: 'b' });
  S.put('modtree', 1, { mod: 'not/absolute' }, {}, { all: 'c' });
  S.put('modtree', 1, { other: 1 }, {}, { all: 'd' });
  S.put('other', 1, { mod: k(gone) }, {}, 'not a mod walk');
  assert.deepEqual(S.sweep(), { removed: 1 });
  assert.equal(S.get('modtree', 1, { mod: k(gone) }, {}), null);
  assert.ok(S.get('modtree', 1, { mod: k(here) }, {}) && S.get('modtree', 1, { mod: 'not/absolute' }, {}) && S.get('modtree', 1, { other: 1 }, {}) && S.get('other', 1, { mod: k(gone) }, {}));
  cs._reset();                                                   // a new process: the mod folder comes from the index row
  const T = cs.open({ root: S.root, release: REL });
  fs.rmSync(here, { recursive: true, force: true });
  assert.deepEqual(T.sweep(), { removed: 1 });
  assert.equal(T.stats().entries, 3);
});

t('a test process never opens the user store', () => {
  const T = path.resolve(__dirname, '..', '..');
  for (const f of ['gui/ext/units/test.js', 'gui/ext/logs/test-games.js', 'gui/ext/bots/guardtest.js', 'gui/ext/bots/cachetest.js', 'gui/ext/units/testgames.js',
    'gui/ext/mapviz/sub/base.test.js', 'gen/test/armyprice.js', 'lib/test/x.js', 'brief/test/check.js']) assert.ok(cs.isTestMain(path.join(T, f)), f);
  for (const f of ['gui/gui.js', 'testrun/testrun.js', 'sessions/testdeps.js', 'lib/testfolders.js', 'testmap/testmap.js', 'as2/as2.js', 'score/ttest.js']) assert.ok(!cs.isTestMain(path.join(T, f)), f);
  assert.ok(!cs.isTestMain(path.join(path.parse(T).root, 'test', 'arsenal', 'tools', 'gui', 'gui.js')), 'an install below a folder named test');
  assert.ok(!cs.isTestMain(''));
  const env = Object.assign({}, process.env); delete env.ARSENAL_CACHE; delete env.ARSENAL_TEST_STORE;
  const real = path.resolve(require('../toolcache').dir('store', { env }));
  const ask = (script, e) => require('./wait').spawnSync(process.execPath, [script], { encoding: 'utf8', env: e, windowsHide: true }, 'cachestore test').stdout.trim();
  const body = 'const cs = require(' + JSON.stringify(path.resolve(__dirname, '..', 'cachestore.js')) + '); console.log(cs.open().root);';
  const plainJs = path.join(base, 'tool.js'), testJs = path.join(base, 'test.js'), parentJs = path.join(base, 'x.test.js');
  fs.writeFileSync(plainJs, body); fs.writeFileSync(testJs, body);
  fs.writeFileSync(parentJs, 'require(' + JSON.stringify(path.resolve(__dirname, '..', 'modtree.js')) + '); const r = require("child_process").spawnSync(process.execPath, [' + JSON.stringify(plainJs) + '], { encoding: "utf8" }); console.log(r.stdout.trim());');
  assert.equal(ask(plainJs, env), real, 'a tool opens the user store');
  const tr = ask(testJs, env);
  assert.ok(tr && tr !== real && path.basename(tr).startsWith('arsenal-test-store-') && path.dirname(tr) === path.resolve(os.tmpdir()), 'a test opens a scratch store: ' + tr);
  assert.ok(!fs.existsSync(tr), 'the scratch store is gone when the test ends');
  const ch = ask(parentJs, env);
  assert.ok(ch && ch !== real && path.basename(ch).startsWith('arsenal-test-store-'), 'a tool started by a test (which loaded modtree) shares its scratch store: ' + ch);
  assert.equal(ask(testJs, Object.assign({}, env, { ARSENAL_CACHE: path.join(base, 'ac') })), path.join(base, 'ac', 'store'), 'ARSENAL_CACHE wins');
  assert.equal(ask(plainJs, Object.assign({}, env, { ARSENAL_TEST_STORE: path.join(base, 'ts') })), path.join(base, 'ts'), 'ARSENAL_TEST_STORE alone');
});

t('getLast: the entry of the parts whatever its stamps; another version or other parts is none', () => {
  const S = open();
  S.put('last', 1, P, ST, { rows: [1, 2] });
  const other = Object.assign({}, ST, { 'mod:zz': 'changed' });
  assert.equal(S.get('last', 1, P, other), null, 'get: changed stamps are a miss');
  assert.deepEqual(S.getLast('last', 1, P).value, { rows: [1, 2] });
  assert.equal(S.getLast('last', 2, P), null);
  assert.equal(S.getLast('last', 1, Object.assign({}, P, { zz: 1 })), null);
});
t('getRaw: the stored bytes are JSON.stringify of the value, misses as get', () => {
  const S = open();
  const v = { b: [1, 'h\u00e9 \u0434\u0430', { z: null }], a: 'x', n: 1.5 };
  S.put('raw', 1, P, ST, v);
  const r = S.getRaw('raw', 1, P, ST), g = S.get('raw', 1, P, ST);
  assert.ok(Buffer.isBuffer(r.buf) && r.raw === false);
  assert.ok(r.buf.equals(Buffer.from(JSON.stringify(v), 'utf8')), 'bytes = JSON.stringify(value)');
  assert.deepEqual(JSON.parse(r.buf.toString('utf8')), g.value);
  assert.deepEqual([r.at, r.bytes], [g.at, g.bytes]);
  assert.equal(S.getRaw('raw', 2, P, ST), null);
  assert.equal(S.getRaw('raw', 1, P, Object.assign({}, ST, { game: 'G2' })), null);
  assert.equal(S.getRaw('raw', 1, { other: 1 }, ST), null);
  S.put('raw', 1, { bin: 1 }, ST, Buffer.from([0, 1, 2, 255]));
  const b = S.getRaw('raw', 1, { bin: 1 }, ST);
  assert.ok(b.raw === true && b.buf.equals(Buffer.from([0, 1, 2, 255])));
  fs.writeFileSync(path.join(entryDir(S, 'raw', P), 'value.json'), '{"torn":');
  assert.equal(S.getRaw('raw', 1, P, ST), null);               // damaged: a miss, and the entry is removed
  assert.equal(fs.existsSync(entryDir(S, 'raw', P)), false);
});

t('eviction: same entries as a stat of every use file, without one', () => {
  // the old rule, spelled out: every entry's last use = the newer of at and the use file's mtime; oldest first, then key
  const N = 60;
  const build = () => {
    let clock = 1000000;
    const S = open({ cap: 1e9, now: () => clock });
    for (let i = 0; i < N; i++) { if (i % 4) clock += 1000; S.put('ev', 1, { i }, ST, Buffer.alloc(10 + (i % 7))); }   // i % 4 === 0: same at as the one before
    for (const i of [0, 1, 5, 17, 30, 59]) { clock += 70000; assert.ok(S.get('ev', 1, { i }, ST)); }                   // old writes, used late
    clock += 70000; assert.ok(S.get('ev', 1, { i: 3 }, ST));
    return S;
  };
  const want = (S, cap, keep) => {
    const rows = [];
    let total = 0;
    for (const key of fs.readdirSync(path.join(S.root, 'e'))) {
      const m = JSON.parse(fs.readFileSync(path.join(S.root, 'e', key, 'meta.json'), 'utf8'));
      let use = m.at;
      try { use = Math.max(use, fs.statSync(path.join(S.root, 'e', key, 'use')).mtimeMs); } catch (e) { /* never read */ }
      rows.push({ key, use, bytes: m.bytes }); total += m.bytes;
    }
    rows.sort((a, b) => a.use - b.use || (a.key < b.key ? -1 : 1));
    const gone = [];
    for (const e of rows) { if (total <= cap) break; if (e.key === keep) continue; total -= e.bytes; gone.push(e.key); }
    return gone.sort();
  };
  const left = S => new Set(fs.readdirSync(path.join(S.root, 'e')));
  const sizeOf = S => S.stats().bytes;
  for (const [drop, keepI] of [[1, null], [25, null], [200, 3], [420, 0], [1e6, 17]]) {
    const S = build(), all = [...left(S)], cap = Math.max(0, sizeOf(S) - drop);
    const keep = keepI === null ? undefined : S.key('ev', { i: keepI });
    const exp = want(S, cap, keep);
    S.cap = cap;
    const realStat = fs.statSync;
    let stats = 0;
    fs.statSync = function (p) { if (/[\\/]use$/.test(String(p))) stats++; return realStat.apply(fs, arguments); };
    let r;
    try { r = S.evict(keep); } finally { fs.statSync = realStat; }
    const now = left(S), gone = all.filter(k => !now.has(k)).sort();
    assert.deepEqual(gone, exp, 'drop ' + drop + ': the removed entries');
    assert.equal(r.removed, exp.length);
    if (drop <= 25) assert.ok(stats < N / 2, 'drop ' + drop + ': ' + stats + ' use files looked at of ' + N);
  }
});

t('a store without an index: put does not read every meta, warm reads them in slices, same numbers as a scan', async () => {
  const N = 450, root = newRoot();
  let S = open({ root });
  let bytes = 0;
  for (let i = 0; i < N; i++) bytes += S.put(i % 3 ? 'w.a' : 'w.b', 1, { i }, ST, { i, pad: 'x'.repeat(i % 50) }).bytes;
  const full = S.stats();
  assert.deepEqual([full.entries, full.bytes], [N, bytes]);
  const wipe = () => { for (const n of ['index.json', 'j.log']) fs.rmSync(path.join(root, n), { force: true }); cs._reset(); };
  const realRead = fs.readFileSync;
  let metas = 0;
  fs.readFileSync = function (p) { if (/meta\.json$/.test(String(p))) metas++; return realRead.apply(fs, arguments); };
  try {
    // 1. a put on the store with no index: no blocking pass, the size check waits
    wipe(); S = open({ root });
    const nb = S.put('w.c', 1, { n: 'new' }, ST, { hello: 1 }).bytes;
    assert.ok(nb > 0);
    assert.equal(metas, 0, 'the put read ' + metas + ' metas');
    assert.equal(S._est, null);
    let turns = 0, most = 0, seen = 0;
    const iv = setInterval(() => { turns++; most = Math.max(most, metas - seen); seen = metas; }, 0);
    const w = await S.warm();
    clearInterval(iv);
    assert.deepEqual(w, { bytes: bytes + nb, entries: N + 1 });
    assert.ok(metas >= N && metas <= N + 40, 'metas read once: ' + metas);
    assert.ok(turns >= 2, 'the loop ran between the slices (' + turns + ' turns)');
    assert.equal(S._est, bytes + nb);
    const st = S.stats();
    assert.deepEqual([st.entries, st.bytes, st.sections['w.a'].entries, st.sections['w.b'].entries], [N + 1, bytes + nb, full.sections['w.a'].entries, full.sections['w.b'].entries]);
    // the index it wrote = the index a blocking scan writes
    const idxA = JSON.parse(realRead(path.join(root, 'index.json'), 'utf8')).e;
    wipe(); S = open({ root });
    const st2 = S.stats();                                       // the blocking pass
    const idxB = JSON.parse(realRead(path.join(root, 'index.json'), 'utf8')).e;
    assert.deepEqual(idxA, idxB);
    assert.deepEqual([st2.entries, st2.bytes], [st.entries, st.bytes]);
    // 2. stats asked while the slices run: complete at once, and warm still ends with the same numbers
    wipe(); S = open({ root });
    const p = S.warm();
    const mid = S.stats();
    assert.deepEqual([mid.entries, mid.bytes], [N + 1, bytes + nb]);
    assert.deepEqual(await p, { bytes: bytes + nb, entries: N + 1 });
    // 3. over the cap: nothing is removed by the put, the check runs when the total is known
    wipe(); S = open({ root, cap: Math.floor(bytes / 2) });
    S.put('w.c', 1, { n: 'new2' }, ST, { hello: 2 });
    assert.equal(fs.readdirSync(path.join(root, 'e')).length, N + 2);
    await S.warm();
    const after = S.stats();
    assert.ok(after.bytes <= S.cap && after.entries < N + 2 && after.entries > 0, JSON.stringify([after.bytes, S.cap, after.entries]));
    // 4. a small store (up to one slice missing) is scanned at once, as before
    const T = open(); for (let i = 0; i < 20; i++) T.put('s', 1, { i }, ST, i);
    for (const n of ['index.json', 'j.log']) fs.rmSync(path.join(T.root, n), { force: true });
    cs._reset();
    const T2 = open({ root: T.root });
    T2.put('s', 1, { i: 'z' }, ST, 1);
    assert.ok(T2._est > 0 && T2._fill === null);
  } finally { fs.readFileSync = realRead; }
});

t('warm ends over the cap: the entry put while the index was built is not the one removed', async () => {
  const N = 120, root = newRoot(), big = { pad: 'y'.repeat(4000) };
  let S = open({ root });
  let bytes = 0;
  for (let i = 0; i < N; i++) bytes += S.put('k.a', 1, { i }, ST, { i, pad: 'x'.repeat(20) }).bytes;
  const wipe = () => { for (const n of ['index.json', 'j.log']) fs.rmSync(path.join(root, n), { force: true }); cs._reset(); };
  // 1. the put that starts the index build, alone larger than the cap: a put on a store with an index keeps such an entry
  //    (evict(keep)), so the check that runs when the build ends keeps it too
  wipe(); S = open({ root, cap: 1000 });
  assert.ok(S.put('k.new', 1, { n: 1 }, ST, big).bytes > S.cap);
  assert.ok(S._fill, 'the index build runs');
  await S.warm();
  assert.ok(S.get('k.new', 1, { n: 1 }, ST), 'the entry just written was removed when the index build ended');
  assert.equal(S.stats().entries, 1, 'everything else went: the store is still over its cap');
  // 2. warm asked first, two puts while it runs: the last one is kept, the cap is met by the others
  S.clear(); cs._reset(); S = open({ root });
  for (let i = 0; i < N; i++) S.put('k.a', 1, { i }, ST, { i, pad: 'x'.repeat(20) });
  wipe(); S = open({ root, cap: 1000 });
  const p = S.warm();
  assert.ok(S._fill, 'the index build runs');
  S.put('k.new', 1, { n: 2 }, ST, big);
  S.put('k.new', 1, { n: 3 }, ST, big);
  await p;
  assert.ok(S.get('k.new', 1, { n: 3 }, ST), 'the last entry written was removed when the index build ended');
  assert.equal(S.get('k.new', 1, { n: 2 }, ST), null);
  assert.equal(S.stats().entries, 1);
});

(async () => {
  let pass = 0;
  const bad = [];
  for (const [name, fn] of tests) {
    cs._reset();
    try { await fn(); pass++; console.log('ok   ' + name); } catch (e) { bad.push(name); console.log('FAIL ' + name + '\n' + ((e && e.stack) || e)); }
  }
  try { fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch (e) { /* the temp folder is cleaned by its owner */ }
  if (bad.length) { console.log('cachestore FAIL ' + bad.length + ' of ' + tests.length); process.exit(1); }
  console.log('cachestore PASS ' + pass + '/' + tests.length);
})();
