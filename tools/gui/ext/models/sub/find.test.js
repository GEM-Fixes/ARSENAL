// Models page part `find` test, on a synthetic game (tools/soedit/test/mkfixture.js make + makeHuman: a game pak holding the shared
// human.mdl only there, a skin, a breed in gamelogic.pak, a mod with its own entity.pak holding a vehicle and a skin, a mod breed,
// a .def outside any resource tree):
//   (1) find: building answer while the index job runs past the wait, then the finished index (built by the real `soedit index`
//       child process through a ctx.runTool stub); exact / prefix / substring order, every word must match, kinds, limit, mod
//       rows with their pak name, didYouMean, the cache file reused by a fresh server state, a change in the mod rebuilds; refusals
//   (2) folder: a mod folder (loose files + the paks inside it), one .pak by path, a folder outside any resource tree, refusals
//   (3) every row's target opens: viewer/scene (mod-pak-only vehicle by name, a breed with the shared human clips, a pak entry,
//       a loose .def), doc/open of a model only in the mod's pak, and nothing is written into the mod or the game
// usage: node find.test.js <scratch dir>     last line: PASS models find (N)
// Author: Imperator_Aug (ARSENAL, ia-3188a6f2)
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert'), cp = require('child_process');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-find-test'));
const root = path.join(scratch, 'find-test');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
process.env.ARSENAL_CACHE = path.join(root, 'cache');   // the index cache stays in the scratch folder
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const TOOLS = path.resolve(__dirname, '..', '..', '..', '..');

(async () => {
  const M = require(path.join(TOOLS, 'soedit', 'test', 'mkfixture'));
  const fx = M.make(path.join(root, 'fx')), h = M.makeHuman(fx, path.join(root, 'fx'));
  const { game, mod } = fx;
  // display names (.lng): the game's desc.lng names t99 "Old Name" and ger_officer "Barrel Captain"; the mod's copy of desc.lng
  // (it replaces the game's file) names t99 "Tiger Nine"; the mod's own #mymod.lng names its breed mp/rus/rifleman "Rifle Guard";
  // barrel and the rest have none
  const lng = (file, body) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '﻿{tags\r\n' + body + '}\r\n'); };
  lng(path.join(game, 'resource', 'interface', 'text', 'desc.lng'), '\t{"entity"\r\n\t\t{"t99" "Old Name"}\r\n\t\t{"ger_officer" "<c(c3baae)>Barrel Captain"}\r\n\t}\r\n');
  lng(path.join(mod, 'localization', 'desc.lng'), '\t{"entity"\r\n\t\t{"t99" "Tiger Nine"}\r\n\t\t{"ger_officer" "<c(c3baae)>Barrel Captain"}\r\n\t}\r\n');
  lng(path.join(mod, 'localization', '#mymod.lng'), '\t{"desc"\r\n\t\t{"human"\r\n\t\t\t{"mp"\r\n\t\t\t\t{"rus"\r\n\t\t\t\t\t{"rifleman" "Rifle Guard"}\r\n\t\t\t\t}\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n');
  const snap = d => fs.readdirSync(d, { recursive: true }).sort().map(x => { const s = fs.statSync(path.join(d, x)); return x + ':' + (s.isFile() ? s.size + ':' + s.mtimeMs : 'd'); }).join('|');
  const before = { game: snap(game), mod: snap(mod) };
  const srv = require('./find.server');
  const R = srv.routes;
  let calls = 0, gate = null;
  const runTool = (tool, entry, args, o) => new Promise(res => {
    calls++;
    assert.strictEqual(tool, 'soedit'); assert.strictEqual(entry, 'soedit/soedit.js'); assert.ok(o && o.timeoutMs > 0, 'timeout given');
    const go = () => cp.execFile(process.execPath, [path.join(TOOLS, entry), ...args], { encoding: 'utf8', env: process.env }, (err, stdout, stderr) => res({ code: err ? err.code || 1 : 0, stdout, stderr }));
    if (gate) gate.then(go); else go();
  });
  const ctx = { game: () => game, runTool, findWaitMs: 20, modAgeMs: 0 };   // modAgeMs 0: the mod is walked for every request (lib/modtree)
  const find = b => R['POST /api/x/models/find']('/api/x/models/find', Object.assign({ mod }, b), ctx);
  const folder = b => R['POST /api/x/models/folder']('/api/x/models/folder', Object.assign({ mod }, b), ctx);
  const refuses = async (fn, b, re) => { let e = null; try { await fn(b); } catch (x) { e = x; } assert.ok(e && e.status === 400 && re.test(e.message) && !/\n\s+at /.test(e.message), JSON.stringify(b) + ' -> ' + (e && e.message)); };

  // ---------- (1) find ----------
  let release; gate = new Promise(r => { release = r; });
  let j = await find({ q: 't99' });
  assert.deepStrictEqual([j.building, j.total, j.results.length, typeof j.note], [true, 0, 0, 'string'], 'building answer ' + JSON.stringify(j));
  assert.ok(j.note.length > 10);
  release(); gate = null;
  const job = srv._t.entry(game, mod).job; assert.ok(job, 'a job runs'); await job;
  j = await find({ q: 't99' });
  assert.strictEqual(j.building, false); assert.strictEqual(calls, 1, 'one build');
  assert.deepStrictEqual(j.results.map(r => [r.target, r.name, r.kind, r.where, r.pak, r.model]),
    [['resource/entity/-vehicle/t99/t99.def', 't99', 'vehicle', 'mod', 'entity.pak', 'resource/entity/-vehicle/t99/t99.mdl']]);
  for (const k of ['target', 'name', 'kind', 'key', 'where', 'pak', 'model']) assert.ok(k in j.results[0], 'row has ' + k);
  ok('find: { building: true } while the index job runs past the wait, then the finished index; a vehicle only in the mod\'s pak, its pak named');

  j = await find({ q: 'ger' });
  assert.deepStrictEqual(j.results.map(r => r.name), ['ger_officer', 'mp/ger/admiral'], 'prefix before substring ' + JSON.stringify(j.results.map(r => r.name)));
  j = await find({ q: 'admiral' });
  assert.deepStrictEqual(j.results.map(r => [r.target, r.kind, r.where, r.pak, r.model]), [['breed:mp/ger/admiral', 'breed', 'game', 'gamelogic.pak', 'resource/entity/humanskin/ger_officer/ger_officer.mdl']]);
  j = await find({ q: 'RUS rif' });
  assert.deepStrictEqual(j.results.map(r => r.name).sort(), ['mp/rus/rifleman', 'rus_rifle'], 'every word, case-blind');
  j = await find({ q: 'rifle', kind: 'human' });
  assert.deepStrictEqual(j.results.map(r => [r.name, r.kind]), [['rus_rifle', 'human']]);
  j = await find({ q: 'human', kind: 'human' });
  assert.ok(j.results[0].name === 'human' && j.results[0].pak === 'e2.pak' && j.results[0].where === 'game', 'exact name first, the shared human model from the game pak');
  j = await find({ q: 'barrel', kind: 'object' });
  assert.deepStrictEqual(j.results.map(r => [r.name, r.kind, r.pak]), [['barrel', 'object', '']]);
  j = await find({ q: 'e', limit: 2 });
  assert.ok(j.total > 2 && j.results.length === 2, 'limit');
  j = await find({ q: 'admrial' });
  assert.ok(j.total === 0 && j.results.length === 0 && j.didYouMean.length && j.didYouMean[0].name === 'mp/ger/admiral', 'didYouMean ' + JSON.stringify(j));
  ok('find: prefix before substring, every word must match (case-blind), kinds human / object, limit, the exact name first, didYouMean when nothing matches');

  // display names: found by the name on the buy card, shown as "title (name)" (byTitle); the id still finds it plainly
  const tv = r => [r.name, r.title || '', !!r.byTitle];
  j = await find({ q: 'Tiger' });
  assert.deepStrictEqual(j.results.map(tv), [['t99', 'Tiger Nine', true]], 'display name, the mod\'s .lng wins ' + JSON.stringify(j.results));
  assert.strictEqual(j.results[0].target, 'resource/entity/-vehicle/t99/t99.def', 'the same target as by id');
  j = await find({ q: 'tiger nine' });
  assert.deepStrictEqual(j.results.map(tv), [['t99', 'Tiger Nine', true]], 'every word of the display name');
  j = await find({ q: 'old name' });
  assert.strictEqual(j.total, 0, 'the game\'s name lost to the mod\'s');
  j = await find({ q: 't99' });
  assert.deepStrictEqual(j.results.map(tv), [['t99', 'Tiger Nine', false]], 'an id query still works, not marked as found by the display name');
  j = await find({ q: 'rifle guard' });
  assert.deepStrictEqual(j.results.map(r => [r.target, r.title, !!r.byTitle]), [['breed:mp/rus/rifleman', 'Rifle Guard', true]], 'a breed by its desc/human name');
  j = await find({ q: 'barrel' });
  assert.deepStrictEqual(j.results.map(tv), [['barrel', '', false], ['ger_officer', 'Barrel Captain', true]], 'the file name first, then the display name (markup cut) ' + JSON.stringify(j.results.map(tv)));
  j = await find({ q: 'barrel', kind: 'object' });
  assert.ok(j.results.length === 1 && !j.results[0].byTitle && !j.results[0].title, 'no display name matches: the file name finds it');
  j = await find({ q: 'admiral' });
  assert.ok(j.results.length === 1 && j.results[0].target === 'breed:mp/ger/admiral' && !j.results[0].byTitle, 'a name no .lng holds falls back to file names');
  j = await find({ q: 'tigr' });
  assert.ok(j.total === 0 && j.didYouMean.some(r => r.name === 't99' && r.byTitle), 'didYouMean knows display names ' + JSON.stringify(j.didYouMean));
  ok('find: a display name (.lng, the mod\'s wins, markup cut) finds the unit with its id (byTitle), an id query still works, a name no .lng holds falls back to file names, file names before display names');
  // the soedit CLI find prints the display name at the end of the row (its own cache folder, so the server's cache stays as it is)
  const cl = cp.spawnSync(process.execPath, [path.join(TOOLS, 'soedit', 'soedit.js'), 'find', 'tiger', '--game', game, '--mod', mod],
    { encoding: 'utf8', env: Object.assign({}, process.env, { ARSENAL_CACHE: path.join(root, 'cache-cli') }) });
  assert.ok(cl.status === 0 && /^1 found/.test(cl.stdout) && /t99\.def {2}in game: "Tiger Nine"/.test(cl.stdout), 'CLI find: ' + cl.stdout + cl.stderr);
  ok('soedit find (CLI) prints the display name: in game: "Tiger Nine"');

  // a fresh server state reads the list from the shared store; a change in the mod rebuilds; a file the list does not read keeps it
  srv._t.MEM.clear(); calls = 0;
  const kept = await find({ q: 't99' });
  j = kept;
  assert.ok(!j.building && j.total === 1 && calls === 0, 'store entry reused');
  const MIt = require(path.join(TOOLS, 'soedit', 'modelindex')), CS = require(path.join(TOOLS, 'lib', 'cachestore')).open();
  assert.strictEqual(CS.stats().sections[MIt.SECTION].entries, 1, 'one models.list entry in the store');
  assert.ok(!fs.readdirSync(path.dirname(srv._t.cacheOf(game, mod))).some(f => /\.gui-\d+\.json$/.test(f)), 'the child build\'s scratch file is gone');
  const far = [path.join(mod, 'resource', 'map', 'm1', 'note.txt'), path.join(mod, 'resource', 'properties', 'note.txt')];
  for (const p of far) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'x'); }
  const forgetTree = () => require('../../units/server')._t._forget();   // the search takes the last tree it saw while a walk runs: forget it, so this search waits for the walk
  forgetTree(); j = await find({ q: 't99' }); assert.ok(!j.building && calls === 0, 'a map file and a properties file: no rebuild');
  srv._t.MEM.clear(); forgetTree(); assert.deepStrictEqual(await find({ q: 't99' }), kept, 'the stored list answers as the built one'); assert.strictEqual(calls, 0);
  for (const p of far) fs.rmSync(p, { force: true });
  fs.rmSync(path.join(mod, 'resource', 'map'), { recursive: true, force: true }); fs.rmSync(path.join(mod, 'resource', 'properties'), { recursive: true, force: true });
  // Prepare section models.list: ready now; stale (why mod) after a new def and a walk; run builds; the page then hits it
  const PL = srv.prep.find(p => p.id === 'models.list'), q = { mod, game: { id: 'as64', dir: game } }, MTL = require(path.join(TOOLS, 'lib', 'modtree'));
  assert.deepStrictEqual([PL.needs, typeof require('../lang.json').en[PL.title]], [['mod.tree'], 'string']);
  await MTL.ensure(mod, { maxAgeMs: 0 }); assert.strictEqual(PL.state(ctx, q).state, 'ready', JSON.stringify(PL.state(ctx, q)));
  const extra = path.join(mod, 'resource', 'entity', 'props', 'crate9', 'crate9.def');
  fs.mkdirSync(path.dirname(extra), { recursive: true });
  fs.writeFileSync(extra, '{entity\r\n\t{Extension "crate9.mdl"}\r\n}\r\n'); fs.writeFileSync(extra.replace(/\.def$/, '.mdl'), '{Skeleton\r\n\t{bone "basis"}\r\n}\r\n');
  await MTL.ensure(mod, { maxAgeMs: 0 }); const ps = PL.state(ctx, q); assert.deepStrictEqual([ps.state, ps.why], ['stale', ['mod']], JSON.stringify(ps));
  const stages = []; await PL.run(ctx, q, { set: o => stages.push(o.stage), cancelled: false });
  assert.deepStrictEqual([calls, stages, PL.state(ctx, q).state], [1, ['list', 'done'], 'ready'], 'Prepare built the list');
  j = await find({ q: 'crate9' });
  assert.ok(!j.building && j.total === 1 && j.results[0].where === 'mod' && calls === 1, 'rebuilt after a change, the page hits what Prepare made ' + JSON.stringify(j));
  fs.rmSync(path.join(mod, 'resource', 'entity'), { recursive: true, force: true });
  ok('find: the shared store serves a fresh server state without a build; a new def in the mod rebuilds the list, a file in another area does not; Prepare section models.list');

  await refuses(find, { q: '' }, /Type part of a name/);
  await refuses(find, { q: 'x', kind: 'tank' }, /kind must be/);
  await refuses(find, { q: 'x', limit: 'lots' }, /limit must be/);
  await refuses(find, { q: 'x', mod: game }, /game install/);
  await refuses(b => R['POST /api/x/models/find']('', Object.assign({ q: 'x' }, b), { runTool }), { game: path.join(root, 'nogame') }, /No game folder/);
  j = await find({ q: 'x', limit: 9999 }); assert.ok(j.results.length <= 200);
  ok('find: empty text, unknown kind, bad limit, the game as mod, no game folder: status 400 sentences; limit capped at 200');

  // ---------- (2) folder ----------
  j = await folder({ path: mod });
  assert.deepStrictEqual(j.results.map(r => [r.name, r.kind, r.pak, r.where]),
    [['t99', 'vehicle', 'entity.pak', 'mod'], ['rus_rifle', 'human', 'entity.pak', 'mod'], ['mp/rus/rifleman', 'breed', '', 'mod']], JSON.stringify(j));
  assert.ok(j.results[0].target === 'pak:' + h.entityPak + '!entity/-vehicle/t99/t99.def' && j.total === 3 && j.truncated === false);
  assert.strictEqual(j.results[2].model, 'resource/entity/humanskin/rus_rifle/rus_rifle.mdl', 'a breed names its skin model');
  j = await folder({ path: h.gamePak });
  assert.deepStrictEqual(j.results.map(r => [r.name, r.kind, r.where, r.pak]), [['ger_officer', 'human', 'game', 'e2.pak'], ['human', 'human', 'game', 'e2.pak']]);
  j = await folder({ path: h.entityPak + '!entity/humanskin' });
  assert.deepStrictEqual([j.path.endsWith('entity.pak!entity/humanskin'), j.results.map(r => [r.name, r.kind])], [true, [['rus_rifle', 'human']]], 'a folder inside a pak ' + JSON.stringify(j));
  j = await folder({ path: 'pak:' + h.entityPak + '!/Entity/-vehicle/' });
  assert.deepStrictEqual(j.results.map(r => r.name), ['t99'], 'pak: form, case-blind folder');
  await refuses(folder, { path: h.entityPak + '!../x' }, /cannot contain/);
  // one file: a .def outside any resource tree (its model next to it), a breed .set, a pak entry
  j = await folder({ path: path.join(h.loose, 'lone.def') });
  assert.deepStrictEqual(j.results.map(r => [r.name, r.model]), [['lone', 'resource/lone.mdl']], 'one .def ' + JSON.stringify(j));
  j = await folder({ path: path.join(mod, 'resource', 'set', 'breed', 'mp', 'rus', 'rifleman.set') });
  assert.deepStrictEqual(j.results.map(r => [r.name, r.kind, r.model]), [['mp/rus/rifleman', 'breed', 'resource/entity/humanskin/rus_rifle/rus_rifle.mdl']]);
  j = await folder({ path: 'pak:' + h.entityPak + '!entity/-vehicle/t99/t99.def' });
  assert.deepStrictEqual(j.results.map(r => [r.name, r.model]), [['t99', 'resource/entity/-vehicle/t99/t99.mdl']], 'one pak entry');
  j = await folder({ path: h.loose });
  assert.deepStrictEqual(j.results.map(r => [r.target, r.name, r.kind]), [[path.join(h.loose, 'lone.def'), 'lone', 'object']]);
  await refuses(folder, { path: '' }, /Type the folder/);
  await refuses(folder, { path: 'relative/dir' }, /full path/);
  await refuses(folder, { path: path.join(root, 'nope') }, /was not found/);
  await refuses(folder, { path: path.join(h.loose, 'lone.ply') }, /is a file/);
  ok('folder: a mod folder (its loose breed and the entries of its pak as pak:<pak>!<entry>), one game .pak by path, a folder outside any resource tree; refusals');

  // ---------- (3) each target opens ----------
  const V = require('./viewer.server').routes['POST /api/x/models/viewer/scene'];
  const vctx = { game: () => game };
  j = await V('', { mod, target: 't99', meshes: false }, vctx);
  assert.ok(j.ok && j.model === 'resource/entity/-vehicle/t99/t99.mdl' && !j.human, 'mod-pak-only vehicle by name ' + JSON.stringify(j).slice(0, 300));
  j = await V('', { mod, target: 'breed:mp/ger/admiral', meshes: false }, vctx);
  assert.ok(j.ok && j.human && j.model === 'resource/entity/humanskin/ger_officer/ger_officer.mdl', 'breed ' + JSON.stringify(j).slice(0, 300));
  assert.deepStrictEqual(j.anmList.map(a => [a.name, a.key]), [['walk', 'resource/properties/animation/human/walk.anm']], 'the shared human clips that exist');
  const anm = j.anmList[0].file;
  j = await V('', { mod, target: 'breed:mp/ger/admiral', anm, frame: 1, meshes: false }, vctx);
  assert.ok(j.ok && j.frames === 2 && j.anm === anm, 'a human clip plays on the skin ' + JSON.stringify(j).slice(0, 300));
  j = await V('', { mod, target: 'pak:' + h.entityPak + '!entity/humanskin/rus_rifle/rus_rifle.def' }, vctx);
  assert.ok(j.ok && j.human && j.scene && JSON.stringify(j.scene).includes('skin.ply'), 'pak entry ' + JSON.stringify(j).slice(0, 300));
  j = await V('', { mod, target: path.join(h.loose, 'lone.def') }, vctx);
  assert.ok(j.ok && j.model === 'resource/lone.mdl', 'a .def outside any resource tree ' + JSON.stringify(j).slice(0, 300));
  j = await V('', { mod, target: 'breed:mp/none/x' }, vctx);
  assert.ok(j.ok === false && /No breed mp\/none\/x/.test(j.error));
  require('./viewer.server')._t.drop();
  const D = require('./doc.server').routes['POST /api/x/models/doc/open'];
  j = await D('', { mod, target: 't99' }, vctx);
  assert.ok(j.mdl === 'resource/entity/-vehicle/t99/t99.mdl' && j.files.some(f => /hull\.ply$/.test(f.rel)), 'doc open of a model in the mod pak only ' + JSON.stringify(j).slice(0, 300));
  require('../../../../lib/model/edit/core').close(j.doc);
  j = await D('', { mod, target: 'breed:mp/ger/admiral' }, vctx);
  assert.ok(j.mdl === 'resource/entity/humanskin/ger_officer/ger_officer.mdl', 'doc open of a breed ' + JSON.stringify(j).slice(0, 300));
  require('../../../../lib/model/edit/core').close(j.doc);
  assert.deepStrictEqual({ game: snap(game), mod: snap(mod) }, before, 'nothing written into the game or the mod');
  ok('targets open: viewer scene of a mod-pak-only vehicle by name, a breed (human clips of the shared human.mdl, a clip posed), a pak entry, a loose .def; doc open of the mod-pak vehicle and the breed; nothing written');

  console.log('PASS models find (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models find'); process.exit(1); });
