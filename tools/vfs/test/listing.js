// lib/vfs opts.listings + opts.base: a view built from lib/modtree scans equals the walked one (files, order, winners, sizes,
// shadows, problems), and the mod folders are not listed or stat'ed file by file. run by run.sh (scratch under the OS temp folder)
// Author: Imperator_Aug (ARSENAL, ia-1bb6067c)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const vfs = require('../../lib/vfs'), modtree = require('../../lib/modtree'), { zip } = require('../../lib/zipwrite');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfs-listing-')), game = path.join(root, 'game'), out = path.join(root, 'outside mod');
const put = (base, rel, data) => { const f = path.join(base, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const INFO = '{mod\r\n\t{name "m"}\r\n\t{minGameVersion "3.000.0"}\r\n\t{maxGameVersion "3.999.9"}\r\n\t{Delete "resource/set/gone.set"}\r\n}\r\n';
// game: loose files, a pak, a patch
put(game, 'resource/set/x.set', 'base x'); put(game, 'resource/set/gone.set', 'gone'); put(game, 'resource/set/keep.set', 'keep');
put(game, 'resource/gamelogic.pak', zip([['set/packed.set', Buffer.from('base packed'), false], ['entity/t.def', Buffer.from('{e}'), true]]));
put(game, 'localization.pak', zip([['desc.lng', Buffer.from('{tags}'), false]]));
// mod in <game>/mods: loose files in mixed case, a pak beside loose files of the same key, a root resource.pak, a N.pat with a
// delete, localization/, names the engine skips, folders modtree does not enter (.git .svn .arsenal node_modules), a junction
const m = path.join(game, 'mods', 'ModL');
put(m, 'mod.info', INFO);
put(m, 'Resource/Set/X.SET', 'mod x!'); put(m, 'Resource/Set/Sub/Deep.Set', 'deep'); put(m, 'Resource/set/packed.set', 'loose over pak');
put(m, 'Resource/Entity/e.pak', zip([['Tank/T.def', Buffer.from('{tank}'), false], ['zz.def', Buffer.from('z'), false]]));
put(m, 'Resource/Entity/tank/t.def', 'loose after pak? no: pak e.pak sorts before tank/');
put(m, 'Resource/Entity/a.def', 'before the pak'); put(m, 'Resource/Entity/zz.def', 'after the pak');
put(m, 'resource.pak', zip([['set/packed.set', Buffer.from('mod root pak'), false], ['set/only_rootpak.set', Buffer.from('r'), false]]));
put(m, '1.pat', zip([['a.patch', Buffer.from('{patch\r\n\t{id 1}\r\n\t{delete "set/keep.set"}\r\n}\r\n'), false], ['set/patched.set', Buffer.from('p'), false]]));
put(m, 'localization/desc.lng', '{tags {a "b"}}'); put(m, 'localization/Sub/more.LNG', 'x');
put(m, 'Resource/set/readme.txt', 'skipped'); put(m, 'Resource/set/.gitignore', 'skipped'); put(m, 'Resource/set/a.temp', 'skipped');
put(m, 'Resource/.git/config', 'no'); put(m, 'Resource/set/.svn/entries', 'no');
put(m, 'Resource/.arsenal/note.set', 'mounted by the walk'); put(m, 'Resource/set/node_modules/pkg/index.set', 'mounted by the walk');
put(m, 'notes.md', 'root file'); put(m, '3.pat', 'gap');
put(root, 'linked/in_link.set', 'through the link'); put(root, 'linked/sub/deeper.set', 'd');
let linked = false;
try { fs.symlinkSync(path.join(root, 'linked'), path.join(m, 'Resource', 'set', 'zlink'), 'junction'); linked = true; } catch (e) { /* no links here */ }
// a second mod, outside the game, mounted by path
put(out, 'mod.info', '{mod {name "o"} {Delete "resource/entity/t.def"}}\r\n');
put(out, 'resource/set/X.set', 'outside wins'); put(out, 'resource/New/n.inc', 'n'); put(out, 'resource/p.pak', zip([['set/from_out_pak.set', Buffer.from('o'), false]]));
put(out, 'localization.pak', zip([['desc.lng', Buffer.from('{tags {o}}'), false]])); fs.mkdirSync(path.join(out, 'resource', 'empty'), { recursive: true });

const recS = r => (r ? (r.deleted ? 'DEL|' + r.layer + '|' + r.how : [r.source, r.container, r.entry, r.layer, r.size, r.ent ? r.ent.name + ':' + r.ent.size : ''].join('|')) : 'null');
const dump = v => ({
  files: [...v.files].map(([k, r]) => k + ' = ' + recS(r)), shadows: v.shadows.map(s => s.key + ' : ' + recS(s.by) + ' over ' + recS(s.over)),
  problems: v.problems, mods: v.mods, modDirs: v.modDirs, exe: v.exe, mode: v.mode, gameDir: v.gameDir,
});
// an fs seam that counts what is asked about paths inside the two mods' data folders
const counted = () => {
  const n = { readdir: 0, stat: 0 }, inData = p => /[\\/](resource|localization)[\\/]/i.test(String(p).slice(game.length)) && (String(p).startsWith(m) || String(p).startsWith(out));
  const inDir = p => inData(String(p) + path.sep);
  return { n, fs: { readdirSync: (p, o) => { if (inDir(p)) n.readdir++; return fs.readdirSync(p, o); }, statSync: (p, o) => { if (inData(p)) n.stat++; return fs.statSync(p, o); }, readFileSync: fs.readFileSync } };
};

(async () => {
  modtree._reset({ store: null });
  const Tm = await modtree.scan(m), To = await modtree.scan(out);
  assert.deepEqual(Tm.left, ['Resource/.arsenal', 'Resource/.git', 'Resource/Set/.svn', 'Resource/Set/node_modules'].concat(linked ? ['Resource/Set/zlink'] : []).sort(), 'modtree.left: what the scan did not enter');
  const opts = { gameDir: game, mods: ['modl:1'], modDirs: [{ dir: out, id: 'top' }] };
  const cw = counted(), walk = vfs.build(Object.assign({ fs: cw.fs }, opts));
  const cl = counted(), list = vfs.build(Object.assign({ fs: cl.fs, listings: [Tm, To] }, opts));
  assert.deepEqual(dump(list), dump(walk), 'listing view = walked view');
  // what the fixture is meant to show, on the walked view
  const w = k => walk.files.get(k);
  assert.deepEqual(walk.mods, ['modl']); assert.deepEqual(walk.modDirs.map(d => d.id), ['top']);
  assert.equal(w('resource/set/x.set').layer, 'top'); assert.equal(w('resource/set/x.set').entry, 'set/X.set');
  assert.equal(w('resource/set/sub/deep.set').entry, 'Set/Sub/Deep.Set'); assert.equal(w('resource/set/sub/deep.set').size, 4);
  assert.equal(w('resource/set/packed.set').source, 'loose'); assert.equal(w('resource/set/only_rootpak.set').source, 'pak');
  assert.equal(w('resource/entity/tank/t.def').source, 'loose', 'tank/ sorts after e.pak: the loose file wins');
  assert.equal(w('resource/entity/zz.def').source, 'loose'); assert.equal(w('resource/entity/a.def').source, 'loose');
  assert.ok(!w('resource/set/gone.set') && !w('resource/set/keep.set') && !w('resource/entity/t.def'), 'mod.info Delete and .patch delete');
  assert.ok(w('resource/set/patched.set') && w('resource/set/patched.set').layer === 'modl patch 1');
  assert.equal(w('resource/interface/text/desc.lng').layer, 'top'); assert.equal(w('resource/interface/text/sub/more.lng').entry, 'Sub/more.LNG');
  assert.ok(!w('resource/set/readme.txt') && !w('resource/set/.gitignore') && !w('resource/.git/config') && !w('resource/set/.svn/entries'));
  assert.ok(w('resource/.arsenal/note.set') && w('resource/set/node_modules/pkg/index.set'), 'folders modtree leaves out are mounted all the same');
  if (linked) assert.ok(w('resource/set/zlink/in_link.set') && w('resource/set/zlink/sub/deeper.set'), 'a junction is followed');
  assert.ok(w('resource/set/from_out_pak.set') && w('resource/new/n.inc'));
  for (const c of ['SKIPPED_EXT', 'MOD_ROOT_IGNORED', 'PAT_GAP']) assert.ok(walk.problems.some(p => p.code === c), c);
  // the listing spares the per-file calls: only the left-out names and what is under them are asked
  assert.ok(cw.n.stat > 25 && cw.n.readdir > 12, 'the walk asks per file (' + cw.n.stat + ' stat, ' + cw.n.readdir + ' readdir)');
  const lim = linked ? 12 : 8;
  assert.ok(cl.n.stat <= lim + 8 && cl.n.readdir <= lim, 'the listing asks only about left-out names (' + cl.n.stat + ' stat, ' + cl.n.readdir + ' readdir)');
  // only one folder listed: the other is walked; a scan without `left` is not used
  assert.deepEqual(dump(vfs.build(Object.assign({ listings: [To] }, opts))), dump(walk));
  const cn = counted(); assert.deepEqual(dump(vfs.build(Object.assign({ fs: cn.fs, listings: [{ dir: m, files: Tm.files }, { dir: out, files: To.files }] }, opts))), dump(walk));
  assert.equal(cn.n.stat, cw.n.stat, 'no left array: walked');
  // opts.base: the game layers from a game-only view
  const base = vfs.build({ gameDir: game, mods: [] });
  const withBase = vfs.build(Object.assign({ base, listings: [Tm, To] }, opts));
  assert.deepEqual(dump(withBase), dump(walk), 'base + listings = walked view');
  assert.ok(withBase.files.get('resource/set/packed.set') !== base.files.get('resource/set/packed.set') && withBase.files.get('resource/entity/t.def') === undefined && base.files.get('resource/entity/t.def'), 'the base view is not changed');
  assert.deepEqual(dump(vfs.build({ gameDir: game, mods: [] })), dump(base));
  assert.deepEqual(dump(vfs.build(Object.assign({ base: vfs.build({ gameDir: game, mods: [], exe: 'goh' }) }, opts))), dump(walk), 'a base of another exe is not used');
  // listed(): the installed mods a list names
  assert.deepEqual(vfs.listed({ gameDir: game, mods: ['modl:1', 'nope', 'modl'] }).map(x => [x.id, path.basename(x.dir)]), [['modl', 'ModL']]);
  // a stale listing shows what it lists (the caller keeps it fresh): a file added after the scan is not there, a rescan has it
  put(m, 'Resource/set/later.set', 'later');
  assert.ok(!vfs.build(Object.assign({ listings: [Tm, To] }, opts)).files.has('resource/set/later.set'));
  const T2 = await modtree.scan(m);
  assert.deepEqual(dump(vfs.build(Object.assign({ listings: [T2, To] }, opts))), dump(vfs.build(opts)));
  vfs.closeRecs(); modtree._reset();
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  console.log('listing ok');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
