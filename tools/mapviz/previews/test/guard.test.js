// previews guard test (MV-PRV): the write guard on fake installs of both forms (previews.md 6, 14), the path rule, the lock.
// Every folder is made under the scratch dir; nothing is written into an install or the repo.
// usage: node tools/mapviz/previews/test/guard.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-399d7f19)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-prv-guard-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz previews: ' + what); } }

const G = require('../guard'), C = require('../commit');
const fx = require('../../test/fxmake');
const mv = require('../../mapviz');

const as2 = fx.make(path.join(W, 'a'), { form: 'as2' }), goh = fx.make(path.join(W, 'g'), { form: 'goh' });
const mkMod = (d, info) => { fs.mkdirSync(d, { recursive: true }); if (info !== false) fs.writeFileSync(path.join(d, 'mod.info'), '{mod {name "x"}}\r\n'); return d; };
const code = r => (r ? r.code : 'ok');

// AS2 form (mowas2 and as64: one rule)
for (const target of ['mowas2', 'as64']) {
  const game = as2.gameDir;
  ok(G.guard(as2.modDirs[0], target, { game }) === null, target + ': <dir>/mods/mvfx (outside every install) ok');
  const x = mkMod(path.join(game, 'mods', 'x'));
  ok(G.guard(x, target, { game }) === null, target + ': <dir>/as2/mods/x ok');
  for (const [p, want] of [[game, 'PRV_MOD_REFUSED'], [path.join(game, 'resource'), 'PRV_MOD_REFUSED'], [path.join(game, 'mods'), 'PRV_MOD_REFUSED'], [path.join(x, 'resource'), 'PRV_MOD_REFUSED']]) {
    fs.mkdirSync(p, { recursive: true });
    const r = G.guard(p, target, { game });
    ok(code(r) === want, target + ': ' + path.relative(W, p).replace(/\\/g, '/') + ' refused ' + want + ', got ' + code(r));
  }
}
// GoH form
{
  const game = goh.gameDir;
  ok(G.guard(goh.modDirs[0], 'goh', { game }) === null, 'goh: <dir>/mods/mvfx (outside) ok');
  const x = mkMod(path.join(game, 'mods', 'x'));
  ok(G.guard(x, 'goh', { game }) === null, 'goh: <dir>/goh/mods/x ok');
  const ws = mkMod(path.join(game, 'mods', 'mod_123456'));
  ok(code(G.guard(ws, 'goh', { game })) === 'PRV_GOH_WORKSHOP_ID', 'goh: mods/mod_123456 refused PRV_GOH_WORKSHOP_ID');
  for (const p of [game, path.join(game, 'resource'), path.join(game, 'mods'), path.join(x, 'resource'), path.join(game, 'binaries')]) {
    fs.mkdirSync(p, { recursive: true });
    const r = G.guard(p, 'goh', { game });
    ok(code(r) === 'PRV_GOH_PATH', 'goh: ' + path.relative(W, p).replace(/\\/g, '/') + ' refused PRV_GOH_PATH, got ' + code(r));
  }
  // GoH folder name rule [V gohweb vfs/goh-modinfo-version-rule]: '-', space, other banned characters, non-ASCII refused
  for (const nm of ['my-mod', 'my mod', 'as64+', 'mod(1)', 'mé']) {
    const d = mkMod(path.join(game, 'mods', nm));
    ok(code(G.guard(d, 'goh', { game })) === 'PRV_GOH_FOLDER_NAME', 'goh: mods/' + nm + ' refused PRV_GOH_FOLDER_NAME, got ' + code(G.guard(d, 'goh', { game })));
  }
  ok(code(G.guard(mkMod(path.join(game, 'mods', 'my_mod.v2')), 'goh', { game })) === 'ok', 'goh: mods/my_mod.v2 ok');
  // the same names on AS2 pass (no such check there)
  ok(code(G.guard(mkMod(path.join(as2.gameDir, 'mods', 'my-mod')), 'mowas2', { game: as2.gameDir })) === 'ok', 'mowas2: mods/my-mod ok (no folder name rule)');
  // a goh target into the MoW:AS2 install: PRV_AS2_PATH
  ok(code(G.guard(path.join(as2.gameDir, 'mods', 'x'), 'goh', { game })) === 'PRV_AS2_PATH', 'goh target into <AS2>/mods/x refused PRV_AS2_PATH, got ' + code(G.guard(path.join(as2.gameDir, 'mods', 'x'), 'goh', { game })));
  ok(code(G.guard(path.join(as2.gameDir, 'mods'), 'goh', { game })) === 'PRV_AS2_PATH', 'goh target into <AS2>/mods refused PRV_AS2_PATH');
  // a GoH mod folder given with an AS2 target: refused
  ok(code(G.guard(x, 'mowas2', { game: as2.gameDir })) === 'PRV_GOH_PATH', 'mowas2 target into a GoH mod refused');
  // mod.info version gate and the root resource.pak (GoH only)
  ok(G.gohVersionOff('{mod {name "x"} {minGameVersion "3.262"}}') === 'MinGameVersion 3.262', 'goh: AS2 MinGameVersion 3.262 -> version note');
  ok(G.gohVersionOff('{mod {minGameVersion "1.035"} {maxGameVersion "1.99"}}') === null, 'goh: 1.035..1.99 ok');
  ok(G.gohVersionOff('{mod {minGameVersion "3.262"} {tags "develop"}}') === null, 'goh: develop tag opens every version');
  ok(G.gohVersionOff('{mod {MaxGameVersion "0.9"}}') === 'MaxGameVersion 0.9', 'goh: MaxGameVersion 0.9 -> version note');
  const vm = mkMod(path.join(game, 'mods', 'old'));
  fs.writeFileSync(path.join(vm, 'mod.info'), '{mod\r\n\t{name "old"}\r\n\t{minGameVersion "3.262"}\r\n}\r\n');
  fs.writeFileSync(path.join(vm, 'resource.pak'), 'not a pak');
  const vf = G.modFacts(vm, 'multi/mv_fixture', 'goh'), af = G.modFacts(vm, 'multi/mv_fixture', 'mowas2');
  ok(vf.gohVersionOff === 'MinGameVersion 3.262' && vf.gohRootPak === true && vf.pak === false, 'goh modFacts: version off, root pak left out of the pak test: ' + JSON.stringify(vf));
  ok(af.gohVersionOff === null && af.gohRootPak === false && af.pak === true, 'mowas2 modFacts: the root resource.pak counts (unreadable -> pak true): ' + JSON.stringify(af));
  // mod.info absent: the plan notes it (PRV_GOH_NO_MODINFO), the guard passes on resource/
  const bare = path.join(game, 'mods', 'bare'); fs.mkdirSync(path.join(bare, 'resource'), { recursive: true });
  ok(G.guard(bare, 'goh', { game }) === null && G.modFacts(bare).modInfo === false, 'goh: a mod with resource/ and no mod.info passes, modInfo false');
}
// every form: workshop, '..', missing, not a mod, junction
for (const [target, game] of [['mowas2', as2.gameDir], ['as64', as2.gameDir], ['goh', goh.gameDir]]) {
  const ws = mkMod(path.join(W, 'lib', 'steamapps', 'workshop', 'content', '1', 'x'));
  ok(code(G.guard(ws, target, { game })) === 'PRV_WORKSHOP', target + ': workshop/content refused');
  ok(code(G.guard(path.join(W, 'mods', '..', 'mods', 'mvfx'), target, { game })) === 'PRV_WORKSHOP' || code(G.guard(W + '/a/mods/../mods/mvfx', target, { game })) === 'PRV_WORKSHOP', target + ': a path with .. refused');
  ok(code(G.guard(W + '/a/mods/../mods/mvfx', target, { game })) === 'PRV_WORKSHOP', target + ': raw ".." segment refused');
  ok(code(G.guard(path.join(W, 'nothere'), target, { game })) === 'PRV_MOD_MISSING', target + ': missing folder PRV_MOD_MISSING');
  const empty = path.join(W, 'empty'); fs.mkdirSync(empty, { recursive: true });
  ok(code(G.guard(empty, target, { game })) === 'PRV_NOT_A_MOD', target + ': folder with no mod.info and no resource/ PRV_NOT_A_MOD');
}
{
  // a junction outside the install pointing into the AS2 resource folder: refused on its real path
  const j = path.join(W, 'junc');
  let made = false;
  try { fs.symlinkSync(path.join(as2.gameDir, 'resource'), j, 'junction'); made = true; } catch (e) { made = false; }
  if (made) {
    ok(code(G.guard(j, 'mowas2', { game: as2.gameDir })) === 'PRV_MOD_REFUSED', 'junction into <game>/resource refused');
    const jg = path.join(W, 'juncg');
    fs.symlinkSync(path.join(goh.gameDir, 'resource'), jg, 'junction');
    ok(code(G.guard(jg, 'goh', { game: goh.gameDir })) === 'PRV_GOH_PATH', 'junction into <GoH>/resource refused');
  } else console.log('skip junction: cannot make one here');
}
// path rule
{
  const m = as2.modDirs[0], k = 'multi/mv_fixture';
  ok(G.pathOk(m, 'resource/map/multi/mv_fixture/preview.dds', k) === null, 'pathOk: a map file');
  ok(G.pathOk(m, '.mapviz-backup/resource/map/multi/mv_fixture/preview.dds', k) === null, 'pathOk: a backup');
  ok(code(G.pathOk(m, 'resource/map/multi/other/preview.dds', k)) === 'PRV_PATH', 'seeded: another map folder PRV_PATH');
  ok(code(G.pathOk(m, 'resource/map/multi/mv_fixture/../../x.dds', k)) === 'PRV_PATH', 'seeded: .. in a file path PRV_PATH');
  ok(code(G.pathOk(m, 'resource/map/multi/mv_fixture/sub/preview.dds', k)) === 'PRV_PATH', 'seeded: a subfolder of the map PRV_PATH');
  ok(code(G.pathOk(m, 'mod.info', k)) === 'PRV_PATH', 'seeded: mod.info PRV_PATH');
}
// place and facts
ok(G.place(as2.modDirs[0], 'mowas2', { game: as2.gameDir }).place === 'outside', 'place outside');
ok(G.place(path.join(as2.gameDir, 'mods', 'x'), 'mowas2', { game: as2.gameDir }).place === 'game-mods', 'place game-mods (as2)');
ok(G.place(path.join(goh.gameDir, 'mods', 'x'), 'goh', { game: goh.gameDir }).place === 'game-mods', 'place game-mods (goh)');
// lock: held by a live process -> MV_BUSY; a stale lock (dead pid) is taken over
{
  const m = mkMod(path.join(W, 'lockmod'));
  const rel = C.lock(m);
  let busy = null;
  fs.writeFileSync(path.join(m, '.mapviz-backup', 'lock'), JSON.stringify({ pid: process.ppid || 4, time: 'x' }));
  try { C.lock(m); } catch (e) { busy = e; }
  ok(busy instanceof mv.MvError && busy.code === 'MV_BUSY', 'lock held by another live process -> MV_BUSY');
  fs.writeFileSync(path.join(m, '.mapviz-backup', 'lock'), JSON.stringify({ pid: 999999, time: 'x' }));
  let took = false; try { C.lock(m)(); took = true; } catch (e) { took = false; }
  ok(took && !fs.existsSync(path.join(m, '.mapviz-backup', 'lock')), 'stale lock (dead pid) taken over and released');
  void rel;
}

if (fail) { console.log(fail + ' failed, ' + pass + ' passed'); process.exit(1); }
if (!process.argv[2]) try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ }
console.log('PASS mapviz previews guard (' + pass + ')');
