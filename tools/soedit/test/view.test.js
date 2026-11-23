// soedit view test: stage.openSource reads game + mod folder through lib/gameview (the shared game view as the base, the mod laid
// on from this process's walk of it when there is one). The view must be the one lib/vfs build gives for the same options:
// the same keys in the same order, each key from the same layer, container and entry, with the same bytes; with no walk of
// the mod (the command line), with a walk (the GUI server), and after the mod changed. modelindex.build gives the same rows
// either way, and buildAsync (walks first) the same as build.
// Synthetic files only (mkfixture.js), in a temp dir; the walk's store is a scratch one.
// Author: Imperator_Aug (ARSENAL, ia-4943ab2c)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soedit-view-test-'));
process.env.ARSENAL_CACHE = path.join(root, 'store'); process.env.AS2_NO_STEAM = '1';
const { make, makeHuman } = require('./mkfixture');
const S = require('../stage'), MI = require('../modelindex'), vfs = require('../../lib/vfs'), modtree = require('../../lib/modtree'), gameview = require('../../lib/gameview');

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL ' + msg); } };
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');
// a view as text: every key in order with where it comes from and its bytes
const dump = v => {
  const out = [];
  for (const [k, r] of v.files) out.push([k, r.layer, r.source, String(r.container).replace(/\\/g, '/').toLowerCase(), r.entry, vfs.readRec(r).toString('base64')]);
  vfs.closeRecs();
  return JSON.stringify({ exe: v.exe, mods: v.mods, modDirs: v.modDirs, files: out, shadows: v.shadows.length, problems: v.problems });
};
const rowsOf = ix => JSON.stringify([ix.rows, ix.meta.counts]);

(async () => {
  try { modtree._reset({ store: null }); } catch (e) { /* the scratch store then */ }
  const fx = make(path.join(root, 'fx')); makeHuman(fx, path.join(root, 'fx'));
  const { game, mod } = fx;
  const put = (base, rel, buf) => { const p = path.join(base, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
  put(mod, 'resource/entity/vehicle/modtank/modtank.def', crlf('{game_entity\n\t{Extension "modtank.mdl"}\n}\n'));
  put(mod, 'resource/entity/vehicle/modtank/modtank.mdl', crlf('{Skeleton\n\t{bone "basis"}\n}\n'));
  put(mod, '.arsenal/note.txt', 'x');

  for (const exe of [undefined, 'mowas_2']) {
    const tag = ' (exe ' + exe + ')', bo = Object.assign({ gameDir: game, mods: [], modDirs: [mod] }, exe ? { exe } : {});
    const direct = () => dump(vfs.build(bo));
    const open = () => { const src = S.openSource({ game, mods: [], modDirs: [mod], noInfer: true, exe }); const d = dump(src.v), keys = [...src.allKeys()]; src.close(); return { d, keys }; };

    // 1. no walk of the mod in this process (a command line run)
    ok(modtree.fresh(mod) === null, 'no walk of the mod yet' + tag);
    const a = open();
    ok(a.d === direct(), 'no walk: the view is the one lib/vfs build gives' + tag);
    ok(a.keys.some(k => /modtank\.mdl$/.test(k)), 'the mod folder is a layer' + tag);
    const ixA = MI.build({ game, mods: [], modDir: mod, sig: 's', exe });

    // 2. with a walk (the GUI server): laid on from the listing
    await modtree.ensure(mod);
    ok(!!modtree.fresh(mod), 'the mod is walked' + tag);
    const b = open();
    ok(b.d === a.d && b.d === direct(), 'walked: the same view, key for key and byte for byte' + tag);
    ok(rowsOf(MI.build({ game, mods: [], modDir: mod, sig: 's', exe })) === rowsOf(ixA), 'modelindex rows: the same with and without a walk' + tag);
    ok(ixA.rows.some(r => r.name === 'modtank' && r.where === 'mod') && ixA.rows.some(r => r.where === 'game'), 'modelindex lists mod and game models' + tag);

    // 3. the game alone and a folder with no mod: the shared game view
    const g = S.openSource({ game, exe }); const dg = dump(g.v); g.close();
    ok(dg === dump(vfs.build(Object.assign({ gameDir: game, mods: [], modDirs: [] }, exe ? { exe } : {}))), 'game only: the same view' + tag);

    // 4. the mod changes: a write marked with modtree.touch is seen at once (the folder is read from the disk)
    put(mod, 'resource/entity/vehicle/modtank/added' + (exe || '') + '.mdl', crlf('{Skeleton\n\t{bone "basis"}\n}\n'));
    modtree.touch(mod);
    const c = open();
    ok(c.keys.some(k => k.endsWith('/added' + (exe || '') + '.mdl')) && c.d === direct(), 'after a touch the new file is in the view' + tag);
    const ixC = await MI.buildAsync({ game, mods: [], modDir: mod, sig: 's', exe });
    ok(!!modtree.fresh(mod), 'buildAsync walks the mod' + tag);
    ok(rowsOf(ixC) === rowsOf(MI.build({ game, mods: [], modDir: mod, sig: 's', exe })) && ixC.rows.length === ixA.rows.length + 1, 'buildAsync: the rows of build' + tag);
    modtree.touch(mod);
  }
  // an exe word the shared view would read another way is built directly, as before
  const odd = S.openSource({ game, modDirs: [mod], noInfer: true, exe: 'as64' });   // no as64.exe in this fixture game
  ok(dump(odd.v) === dump(vfs.build({ gameDir: game, mods: [], modDirs: [mod], exe: 'as64' })), 'exe as64 named for a folder without as64.exe: built directly');
  odd.close();
  // no game: no view
  const none = S.openSource({}); ok(none.v === null && [...none.allKeys()].length === 0, 'no game: no view'); none.close();
})().catch(e => { fails++; console.log('FAIL ' + (e && e.stack || e)); }).then(() => {
  try { gameview.drop(); } catch (e) { /* nothing kept */ }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* scratch stays */ }
  console.log(fails ? `view.test FAIL ${fails} of ${n}` : `view.test ok ${n}`);
  process.exit(fails ? 1 : 0);
});
