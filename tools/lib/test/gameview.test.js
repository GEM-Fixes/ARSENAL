// gameview: one shared view per game folder + exe, stamp from paks and version, text(); on a small fake game. node gameview.test.js
// Author: Imperator_Aug (ARSENAL, ia-eac6ad87)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const gv = require('../gameview'), { zip } = require('../zipwrite');

let n = 0, failed = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); } };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gameview-')), game = path.join(root, 'game');
const T0 = 1700000000;
const put = (rel, data, sec = T0) => { const f = path.join(game, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); fs.utimesSync(f, sec, sec); return f; };
const pakA = put('resource/gamelogic.pak', zip([['set/stuff/gun.set', Buffer.from('{gun "mp40"}\r\n'), true], ['set/latin.set', Buffer.from([0x7B, 0xCF, 0xF0, 0x7D]), false]]));
put('resource/entity/e.pak', zip([['tank/t.def', Buffer.from('{entity}'), false]]));
put('localization.pak', zip([['desc.lng', Buffer.from('{tags}'), false]]));
put('resource/set/loose.set', 'loose');
put('version.txt', '3.262.0\r\n');
const o = { gameDir: game };

t('get: two calls, one object; exe from the game id', () => {
  const a = gv.get(o), b = gv.get({ gameDir: game + path.sep, gid: 'as64' }), c = gv.get({ gameDir: game.toUpperCase() });
  assert.ok(a && a === b && a === c);
  assert.equal(a.exe, 'mowas_2'); assert.deepEqual(a.mods, []);
  assert.ok(a.files.has('resource/set/stuff/gun.set') && a.files.has('resource/entity/tank/t.def') && a.files.has('resource/interface/text/desc.lng') && a.files.has('resource/set/loose.set'));
  const m = gv.get({ gameDir: game, gid: 'mowas2' });
  assert.ok(m !== a && m === gv.get({ gameDir: game, exe: 'mowas_2' }) && m === gv.get({ gameDir: game, exe: 'mowas2' }), 'one view per folder + exe');
  assert.equal(gv.get({ gameDir: game, gid: 'goh' }).exe, 'goh');
  assert.equal(gv.get({}), null); assert.equal(gv.get(null), null);
});
t('text: reads a file, bytes kept, any spelling; null when absent', () => {
  const v = gv.get(o);
  assert.equal(gv.text(v, 'set/stuff/gun.set'), '{gun "mp40"}\r\n');
  assert.equal(gv.text(v, 'Resource\\Set\\Stuff\\GUN.set'), '{gun "mp40"}\r\n');
  assert.equal(gv.text(v, 'set/loose.set'), 'loose');
  assert.equal(Buffer.from(gv.text(v, 'set/latin.set'), 'latin1').length, 4);
  assert.equal(gv.text(v, 'set/latin.set', 'utf8').length, 4);          // 2 bad bytes -> 2 U+FFFD
  assert.equal(gv.text(v, 'set/none.set'), null); assert.equal(gv.text(null, 'set/x'), null); assert.equal(gv.text(v, ''), null);
});
t('stamp: sha1, steady, asked at most every 5 s', () => {
  const s = gv.stamp(o); assert.match(s, /^[0-9a-f]{40}$/);
  assert.equal(gv.stamp(o, { force: true }), s);
  assert.equal(gv.stamp({}), '');
  const v = gv.get(o);
  fs.utimesSync(pakA, T0 + 10, T0 + 10);
  assert.equal(gv.stamp(o), s, 'inside the 5 s window: the last answer'); assert.ok(gv.get(o) === v);
  fs.utimesSync(pakA, T0, T0);
});
t('a pak mtime change moves the stamp and rebuilds', () => {
  const s = gv.stamp(o, { force: true }), v = gv.get(o);
  fs.utimesSync(pakA, T0 + 10, T0 + 10);
  const s2 = gv.stamp(o, { force: true }); assert.notEqual(s2, s);
  const v2 = gv.get(o); assert.ok(v2 !== v && v2 === gv.get(o));
  fs.utimesSync(pakA, T0, T0); assert.equal(gv.stamp(o, { force: true }), s, 'back to the old tree = the old stamp');
  assert.ok(gv.get(o) !== v2);
});
t('stamp follows pak content, new paks, deep paks, top-level loose files and the version; not deep loose files', () => {
  const s = gv.stamp(o, { force: true }), moved = (what, back) => { const x = gv.stamp(o, { force: true }); assert.notEqual(x, s, what); back(); assert.equal(gv.stamp(o, { force: true }), s, what + ' undone'); };
  put('resource/gamelogic.pak', zip([['set/stuff/gun.set', Buffer.from('{gun "mp44"}\r\n{more}'), true]]));
  gv.stamp(o, { force: true });
  assert.equal(gv.text(gv.get(o), 'set/stuff/gun.set'), '{gun "mp44"}\r\n{more}', 'the rebuilt view reads the new pak');
  moved('pak size', () => put('resource/gamelogic.pak', zip([['set/stuff/gun.set', Buffer.from('{gun "mp40"}\r\n'), true], ['set/latin.set', Buffer.from([0x7B, 0xCF, 0xF0, 0x7D]), false]])));
  const np = put('resource/new.pak', zip([['a.txt', Buffer.from('a'), false]])); moved('new pak', () => fs.unlinkSync(np));
  fs.utimesSync(path.join(game, 'resource', 'entity', 'e.pak'), T0 + 3, T0 + 3); moved('deep pak', () => fs.utimesSync(path.join(game, 'resource', 'entity', 'e.pak'), T0, T0));
  fs.utimesSync(path.join(game, 'localization.pak'), T0 + 3, T0 + 3); moved('root pak', () => fs.utimesSync(path.join(game, 'localization.pak'), T0, T0));
  const pat = put('1.pat', zip([['x.patch', Buffer.from('{patch {id 1}}'), false]])); moved('N.pat', () => fs.unlinkSync(pat));
  const top = put('resource/top.inc', 'x'); moved('top-level loose file', () => fs.unlinkSync(top));
  put('version.txt', '3.262.1\r\n'); moved('version', () => put('version.txt', '3.262.0\r\n'));
  put('resource/set/loose.set', 'other'); assert.equal(gv.stamp(o, { force: true }), s, 'a deep loose file is not part of the stamp');
  assert.notEqual(gv.stamp({ gameDir: game, gid: 'goh' }, { force: true }), '');
});
t('drop forgets', () => {
  const v = gv.get(o); gv.drop(game); assert.ok(gv.get(o) !== v);
  const w = gv.get(o); gv.drop(); assert.ok(gv.get(o) !== w);
});

// ---------- withMods / withModsSync: game + mods from the shared mod scans (lib/modtree), kept by signature
const vfs = require('../vfs'), modtree = require('../modtree');
const ta = async (name, fn) => { try { await fn(); n++; } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); } };
const recS = r => (r ? (r.deleted ? 'DEL|' + r.layer + '|' + r.how : [r.source, r.container, r.entry, r.layer, r.size, r.ent ? r.ent.name : ''].join('|')) : 'null');
const dump = v => ({ files: [...v.files].map(([k, r]) => k + ' = ' + recS(r)), shadows: v.shadows.map(x => x.key + ' : ' + recS(x.by) + ' over ' + recS(x.over)), problems: v.problems, mods: v.mods, modDirs: v.modDirs, exe: v.exe, mode: v.mode });
const INFO = '{mod\r\n\t{name "m"}\r\n\t{minGameVersion "3.000.0"}\r\n\t{maxGameVersion "3.999.9"}\r\n}\r\n';
const inMods = path.join(game, 'mods', 'ModA'), outA = path.join(root, 'out a'), outB = path.join(root, 'out b');
const putIn = (base, rel, data) => { const f = path.join(base, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
putIn(inMods, 'mod.info', INFO); putIn(inMods, 'resource/set/Loose.SET', 'from moda'); putIn(inMods, 'resource/set/a_only.set', 'a');
putIn(inMods, 'resource/entity/m.pak', zip([['tank/t.def', Buffer.from('{moda tank}'), false]])); putIn(inMods, '1.pat', zip([['p.patch', Buffer.from('{patch {id 1}}'), false], ['set/patched.set', Buffer.from('p'), false]]));
putIn(outA, 'mod.info', INFO); putIn(outA, 'resource/set/loose.set', 'from out a'); putIn(outA, 'resource/.arsenal/x.set', 'x'); putIn(outA, 'localization/desc.lng', '{tags {a}}');
putIn(outB, 'resource/set/b.set', 'b');
const W = { gameDir: game, list: ['moda:1'], mods: [{ dir: outA, id: 'top' }], disableVersionControl: true };
const plain = () => vfs.build({ gameDir: game, mods: ['moda:1'], modDirs: [{ dir: outA, id: 'top' }], disableVersionControl: true });

(async () => {
  modtree._reset({ store: null });   // nothing of this test goes to the real store
  gv.drop();
  await ta('withMods = lib/vfs build of the same options; kept: the same object', async () => {
    const v = await gv.withMods(W);
    assert.deepEqual(dump(v), dump(plain()));
    assert.deepEqual(v.mods, ['moda']); assert.equal(gv.text(v, 'set/loose.set'), 'from out a'); assert.equal(gv.text(v, 'entity/tank/t.def'), '{moda tank}');
    assert.ok(v.files.has('resource/.arsenal/x.set') && v.files.has('resource/set/patched.set'));
    assert.ok(v === await gv.withMods(W) && v === await gv.withMods(Object.assign({}, W, { gid: 'as64', gameDir: game + path.sep })), 'memo hit');
    assert.ok(v === gv.withModsSync(W) && v === gv.withModsSync(W, { noAge: true }), 'the sync call finds it by the scans of this process');
    assert.ok(v !== gv.get(o) && gv.get(o).files.get('resource/set/loose.set').layer === 'base', 'the game view is not changed');
    assert.ok(await gv.withMods({ gameDir: game }) === gv.get(o) && gv.withModsSync({ gameDir: game, list: [], mods: [], disableVersionControl: true }) === gv.get(o), 'no mods: the game view itself');
    assert.equal(await gv.withMods({}), null); assert.equal(gv.withModsSync(null), null);
  });
  await ta('withMods: the loop gets a turn between the game build and the mod build, the view is the same', async () => {
    const before = dump(await gv.withMods(W));
    gv.drop(); assert.ok(!gv.has(o));
    let seen = false, done = false;
    const poll = () => { if (done) return; if (gv.has(o)) seen = true; setImmediate(poll); };
    poll();
    const v = await gv.withMods(W); done = true;
    assert.ok(seen, 'a loop turn ran with the game view built and the mod view not yet given');
    assert.deepEqual(dump(v), before); assert.deepEqual(dump(v), dump(plain()));
    assert.ok(v === await gv.withMods(W) && gv.has(o), 'kept');
    let turns = 0; const iv = setImmediate(() => turns++);
    assert.ok(v === await gv.withMods(W)); clearImmediate(iv);
    assert.equal(turns, 0, 'a kept view comes back without a loop turn');
  });
  await ta('an edit + touch rebuilds; an edit seen by a new scan rebuilds; no change keeps', async () => {
    const v = await gv.withMods(W);
    putIn(outA, 'resource/set/loose.set', 'edited in out a'); putIn(outA, 'resource/set/new.set', 'n');
    assert.ok(v === gv.withModsSync(W), 'not touched, no new scan: the kept one');
    modtree.touch(outA);
    const v2 = await gv.withMods(W);
    assert.ok(v2 !== v && v2.files.has('resource/set/new.set') && v2.files.get('resource/set/loose.set').size === 15);
    assert.deepEqual(dump(v2), dump(plain()));
    assert.ok(v2 === await gv.withMods(W));
    putIn(inMods, 'resource/set/a_only.set', 'a changed'); fs.utimesSync(path.join(inMods, 'resource', 'set', 'a_only.set'), T0 + 50, T0 + 50);
    const v3 = await gv.withMods(Object.assign({ maxAgeMs: 0 }, W));   // no touch: the scan is asked again and sees it
    assert.ok(v3 !== v2 && v3.files.get('resource/set/a_only.set').size === 9);
    assert.ok(v3 === await gv.withMods(Object.assign({ maxAgeMs: 0 }, W)), 'a new scan with the same signature keeps the view');
  });
  await ta('the game stamp is part of it', async () => {
    const v = await gv.withMods(W);
    fs.utimesSync(pakA, T0 + 20, T0 + 20); gv.stamp(o, { force: true });
    const v2 = await gv.withMods(W); assert.ok(v2 !== v); assert.deepEqual(dump(v2), dump(plain()));
    fs.utimesSync(pakA, T0, T0); gv.stamp(o, { force: true });
  });
  await ta('one view per list, folders and options; at most 3 kept', async () => {
    const a = await gv.withMods(W), b = await gv.withMods({ gameDir: game, mods: [outA] }), c = await gv.withMods({ gameDir: game, mods: [outB, outA] }), d = await gv.withMods({ gameDir: game, mods: [outA, outB] });
    assert.ok(a !== b && b !== c && c !== d); assert.deepEqual(c.modDirs.map(x => x.id), ['out b', 'out a']);
    assert.equal(b.files.get('resource/set/loose.set').layer, 'out a');
    assert.ok(d === await gv.withMods({ gameDir: game, mods: [outA, outB] }) && c === await gv.withMods({ gameDir: game, mods: [outB, outA] }) && b === await gv.withMods({ gameDir: game, mods: [outA] }));
    assert.ok(a !== await gv.withMods(W), 'the fourth view pushed the oldest out');
    const g1 = await gv.withMods({ gameDir: game, gid: 'goh', mods: [outB], lang: 'en' }); assert.equal(g1.exe, 'goh');
    assert.deepEqual(dump(g1), dump(vfs.build({ gameDir: game, exe: 'goh', mods: [], modDirs: [outB], lang: 'en' })));
  });
  await ta('a folder that is not there is left to lib/vfs and that view is not kept', async () => {
    const q = { gameDir: game, mods: [path.join(root, 'nope'), outB] }, v = await gv.withMods(q);
    assert.ok(v.problems.some(p => p.code === 'MODDIR_MISSING') && v.files.has('resource/set/b.set')); assert.ok(v !== await gv.withMods(q));
  });
  await ta('withModsSync with no scan: the old walk, kept by age; fresh walks again; noAge never keeps', async () => {
    modtree._reset({ store: null }); gv.drop();
    const v = gv.withModsSync(W);
    assert.deepEqual(dump(v), dump(plain()));
    assert.equal(modtree.fresh(outA), null, 'no scan was started (not a server)');
    putIn(outA, 'resource/set/sync.set', 's');
    assert.ok(v === gv.withModsSync(W), 'kept 60 s');
    const n1 = gv.withModsSync(W, { noAge: true }), n2 = gv.withModsSync(W, { noAge: true });
    assert.ok(n1 !== v && n1 !== n2 && n1.files.has('resource/set/sync.set'), 'noAge: the disk as it is, each time');
    assert.ok(v === gv.withModsSync(W), 'a noAge view replaces nothing');
    const v2 = gv.withModsSync(W, { fresh: true });
    assert.ok(v2 !== v && v2.files.has('resource/set/sync.set') && v2 === gv.withModsSync(W));
    const v3 = await gv.withMods(W);   // scans exist from now on: by signature
    assert.ok(v3 !== v2 && v3 === gv.withModsSync(W)); assert.deepEqual(dump(v3), dump(v2));
    modtree.touch(outA);
    assert.ok(v3 === gv.withModsSync(W), 'touched, no scan yet: the kept view for its 60 s');
    assert.ok(v3 !== gv.withModsSync(W, { noAge: true }));
  });
  await ta('revalidate starts the scan in the background', async () => {
    modtree._reset({ store: null }); gv.drop();
    const v = gv.withModsSync(W, { revalidate: true });
    assert.equal(modtree.fresh(outA), null);
    await modtree.ensure(outA); await modtree.ensure(inMods);     // joins the scans that were started
    assert.ok(modtree.fresh(outA) && modtree.fresh(inMods));
    const v2 = gv.withModsSync(W, { revalidate: true }); assert.ok(v2 !== v, 'now by signature'); assert.deepEqual(dump(v2), dump(v));
    assert.ok(v2 === gv.withModsSync(W, { revalidate: true }));
  });
  await ta('lib/sdlset: the shared game view; a folder with a scan gives the same source as a walked one', async () => {
    modtree._reset({ store: null }); gv.drop();
    const sdlset = require('../sdlset');
    putIn(outA, 'resource/set/pk.pak', zip([['stuff/in_pak.set', Buffer.from('{pak}'), false], ['zz_late.set', Buffer.from('pak late'), false]]));
    putIn(outA, 'resource/set/zz_late.set', 'loose late'); putIn(outA, 'resource/set/aa_early.set', 'e'); putIn(outA, 'resource/node_modules/n.set', 'n');
    putIn(outA, 'resource.pak', zip([['set/rootpak.set', Buffer.from('r'), false]]));
    const snap = src => {
      const keys = [...new Set([...src.local.keys(), ...src.packed().keys(), ...(src.v ? src.v.files.keys() : [])])];
      return { local: [...src.local], packed: [...src.packed()].map(([k, r]) => k + ' ' + r.file + ' ' + r.seq), hasRes: src.hasRes,
        win: keys.map(k => k + ' ' + src.winner(k) + ' ' + (src.get(k) || '').toString('latin1')), items: src.folderItems().map(i => i.key + ' ' + i.file) };
    };
    const walked = sdlset.createSource({ gameDir: game, folder: outA });
    assert.ok(walked.v === gv.get(o), 'no mods: the one game view');
    assert.equal(walked.winner('resource/set/zz_late.set'), 'local'); assert.equal(walked.winner('resource/set/stuff/in_pak.set'), 'pak'); assert.equal(walked.winner('resource/set/stuff/gun.set'), 'vfs');
    const A = snap(walked);
    await modtree.ensure(outA);
    const listed = sdlset.createSource({ gameDir: game, folder: outA });
    assert.deepEqual(snap(listed), A);
    assert.deepEqual(snap(sdlset.createSource({ folder: outA })), snap((modtree.touch(outA), sdlset.createSource({ folder: outA }))), 'no game: listed = walked');
    // listed mods: the same view as lib/vfs builds, never by age
    const opt = { gameDir: game, mods: ['moda:1'], disableVersionControl: true };
    assert.deepEqual(dump(sdlset.createSource(opt).v), dump(vfs.build(opt)));
    putIn(inMods, 'resource/set/sdl_new.set', 'x');
    assert.ok(sdlset.createSource(opt).v.files.has('resource/set/sdl_new.set'), 'no scan of the mod: walked each time');
    await modtree.ensure(inMods);
    const s1 = sdlset.createSource(opt).v; assert.ok(s1 === sdlset.createSource(opt).v, 'with a scan: by signature'); assert.deepEqual(dump(s1), dump(vfs.build(opt)));
    assert.equal(sdlset.createSource({ gameDir: game, exe: 'as64' }).v.exe, 'as64', 'as64 named for a folder without as64.exe: built as before');
    for (const x of ['listed', 'walked']) for (const r of (x === 'listed' ? listed : walked).packed().values()) { try { fs.closeSync(r.l.fd); } catch (e) { /* closed */ } r.l.fd = -1; }
  });
  gv.drop(); modtree._reset();
  try { require('../vfs').closeRecs(); fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  console.log((failed ? 'FAIL ' : 'PASS ') + n + (failed ? ' passed, ' + failed + ' failed' : ''));
  process.exit(failed ? 1 : 0);
})();
