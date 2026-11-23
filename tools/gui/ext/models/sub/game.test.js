// Models page, game parity test: the page under AS64, MoW:AS2 and Gates of Hell, on a made-up AS2
// install (tools/soedit/test/mkfixture.js make, plus as64.exe and an as64/core layer that changes tank1.mdl and body.mtl and adds
// tank9, a model only in as64/core):
//   (1) ../game.js: the game from ctx.gameId() or body.exe, exeOpt/exeArgs empty under AS64, an unknown word refused
//   (2) argv: soedit stage and check, armorsim table/shot/map/effects/edit and soedit index get --exe mowas_2 under MoW:AS2 right after
//       --game; under AS64 the argument lists are byte for byte those of a request that names no game
//   (3) in process under MoW:AS2: find (index build), viewer/scene, file/source read without as64/core; under AS64 with it; the kept
//       model, index and source never mix the two games; doc/open, the armour reads, folder lists and the index signature hand
//       exe 'mowas_2' to their libs
//   (4) Gates of Hell (SOEdit and the model editing work with GoH, owner 2026-11-15): the routes read the GoH install (ctx.curDir, the
//       page's AS2 folder ignored) with --exe goh; a mod folder inside the GoH install is refused; only the armour routes answer the
//       plain line (the armour simulator reads the AS2 damage model); nothing is written into either game
// usage: node game.test.js <scratch dir>     last line: PASS models game (N)
// Author: Imperator_Aug (ARSENAL, ia-b73cab7b)
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-game-test'));
const root = path.join(scratch, 'game-test');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
process.env.ARSENAL_CACHE = path.join(root, 'cache');   // index and entity caches stay in the scratch folder
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const TOOLS = path.resolve(__dirname, '..', '..', '..', '..');
const G = require('../game');

delete process.env.ARSENAL_ADVANCED;   // the Advanced switch of the app: off unless a step sets it
(async () => {
  // ---------- the made-up install: AS64 and MoW:AS2 in one folder ----------
  const M = require(path.join(TOOLS, 'soedit', 'test', 'mkfixture'));
  const fx = M.make(path.join(root, 'fx')), { game, mod, T } = fx;
  const put = (rel, buf) => { const p = path.join(game, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
  const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');
  put('as64.exe', Buffer.from('MZ fake'));
  const base = fs.readFileSync(path.join(game, ...(T + 'tank1.mdl').split('/')), 'latin1');
  put('as64/core/' + T + 'tank1.mdl', crlf(base.replace('{bone "ghost"', '{bone "coreonly"}\n\t\t\t{bone "ghost"')));
  put('as64/core/' + T + 'body.mtl', crlf('{material simple\n\t{diffuse "tank1_core"}\n}\n'));
  put('as64/core/resource/entity/vehicle/tank9/tank9.def', crlf('{game_entity\n\t{Extension "tank9.mdl"}\n}\n'));
  put('as64/core/resource/entity/vehicle/tank9/tank9.mdl', crlf('{Skeleton\n\t{bone "basis"}\n}\n'));
  const snap = d => fs.readdirSync(d, { recursive: true }).sort().map(x => { const s = fs.statSync(path.join(d, x)); return x + ':' + (s.isFile() ? s.size + ':' + s.mtimeMs : 'd'); }).join('|');
  const before = { game: snap(game), mod: snap(mod) };

  let calls = [];
  const mk = (gid, extra) => Object.assign({ game: () => game, tmpRoot: path.join(root, 'tmp'), runTool: async (tool, entry, args) => { calls.push({ tool, entry, args }); return { code: 1, stdout: '', stderr: 'stub' }; } },
    gid ? { gameId: () => gid } : {}, extra || {});
  // a made-up Gates of Hell install next to it (call_to_arms.exe is what marks it)
  const gh = path.join(root, 'ghgame');
  for (const [rel, buf] of [['binaries/x64/call_to_arms.exe', 'MZ fake'], ['resource/entity/vehicle/gt/gt.def', crlf('{game_entity\n\t{Extension "gt.mdl"}\n}\n')], ['resource/entity/vehicle/gt/gt.mdl', crlf('{Skeleton\n\t{bone "basis"}\n}\n')]]) {
    const p = path.join(gh, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf);
  }
  fs.mkdirSync(path.join(gh, 'mods', 'inmod'), { recursive: true });
  const none = mk(null), as64 = mk('as64'), as2 = mk('mowas2'), goh = mk('goh', { curDir: () => gh, gohDir: () => gh });

  // ---------- (1) the game of a route ----------
  assert.deepStrictEqual([G.idOf(none, {}), G.exeOpt(none, {}), G.exeArgs(none, {})], ['as64', undefined, []]);
  assert.deepStrictEqual([G.idOf(as64, {}), G.exeOpt(as64, {}), G.exeArgs(as64, {})], ['as64', undefined, []]);
  assert.deepStrictEqual([G.idOf(as2, {}), G.exeOpt(as2, {}), G.exeArgs(as2, {})], ['mowas2', 'mowas_2', ['--exe', 'mowas_2']]);
  assert.deepStrictEqual([G.idOf(none, { exe: 'mowas_2' }), G.idOf(as2, { exe: 'as64' }), G.idOf(none, { exe: 'MOWAS2' })], ['mowas2', 'as64', 'mowas2']);
  assert.throws(() => G.idOf(none, { exe: 'mow3' }), e => e.status === 400 && /Unknown game/.test(e.message));
  assert.throws(() => G.noGohArmour(goh, {}), e => e.status === 400 && e.message === G.NA_GOH_ARMOUR && e.na === 'models.armor.goh');
  assert.throws(() => G.noGohArmour(none, { exe: 'goh' }), e => e.message === G.NA_GOH_ARMOUR);
  G.noGohArmour(as2, {}); G.noGohArmour(none, {});
  assert.deepStrictEqual([G.idOf(goh, {}), G.exeOpt(goh, {}), G.exeArgs(goh, {})], ['goh', 'goh', ['--exe', 'goh']]);
  assert.deepStrictEqual([G.gameDir(none, {}), G.gameDir(as2, {}), G.gameDir(goh, {}), G.gameDir(goh, { game })], [path.resolve(game), path.resolve(game), path.resolve(gh), path.resolve(gh)]);
  ok('game.js: no game and AS64 add nothing, MoW:AS2 gives exe mowas_2, GoH gives exe goh and its own install, body.exe wins, an unknown word is refused, GoH armour gets the plain line');

  // ---------- (2) argv ----------
  const ext = require('../index');
  const S = require('../server');
  fs.mkdirSync(path.join(mod, 'resource', ...T.split('/').slice(1).filter(Boolean)), { recursive: true });
  const stArgs = async ctx => { calls = []; try { await S.routes['POST /api/x/models/stage']('/x', { mod, target: 'tank1', dry: true }, ctx); } catch (e) { /* stub tool fails */ } return calls[0].args; };
  const plain = await stArgs(none), a64 = await stArgs(as64), m2 = await stArgs(as2);
  const noJson = a => a.slice(0, -1);
  assert.deepStrictEqual(noJson(a64), noJson(plain), 'AS64 stage argv = no game named');
  assert.deepStrictEqual(noJson(plain), ['stage', 'tank1', '--out', path.resolve(mod), '--game', path.resolve(game), '--dry', '--json']);
  assert.deepStrictEqual(noJson(m2), ['stage', 'tank1', '--out', path.resolve(mod), '--game', path.resolve(game), '--exe', 'mowas_2', '--dry', '--json']);
  put('../mods_src/mymod/' + T + 'tank1.mdl', Buffer.from('x'));
  const ckArgs = async ctx => { calls = []; try { await S.routes['POST /api/x/models/check']('/x', { mod, mdl: T + 'tank1.mdl' }, ctx); } catch (e) { /* stub */ } return noJson(calls[0].args); };
  assert.deepStrictEqual(await ckArgs(as64), await ckArgs(none));
  assert.deepStrictEqual(await ckArgs(as2), ['check', path.join(path.resolve(mod), ...T.split('/'), 'tank1.mdl'), '--game', path.resolve(game), '--exe', 'mowas_2', '--json']);
  fs.rmSync(path.join(mod, 'resource'), { recursive: true, force: true });
  ok('soedit stage and check: --exe mowas_2 after --game under MoW:AS2; AS64 argv equal to a request naming no game');

  const A = require('./armor.server'), shotB = { target: 'tank1', weapon: 'gun1', range: 100 };
  for (const [name, fn, b] of [['table', A._t.tableArgs, { target: 'tank1' }], ['shot', A._t.shotArgs, shotB], ['map', A._t.mapArgs, Object.assign({ view: 'front' }, shotB)],
    ['effects', A._t.effectsArgs, shotB], ['edit', A._t.editArgs, { target: 'tank1', volume: 'body', side: 'front', mm: 40 }]]) {
    const p = fn(none, b, mod), q = fn(as64, b, mod), r = fn(as2, b, mod);
    assert.deepStrictEqual(q, p, name + ': AS64 argv = no game named');
    const gi = r.indexOf('--game');
    assert.ok(gi > 0 && r[gi + 2] === '--exe' && r[gi + 3] === 'mowas_2', name + ' ' + JSON.stringify(r));
    assert.deepStrictEqual(r.filter((x, i) => i !== gi + 2 && i !== gi + 3), p, name + ': only --exe mowas_2 added');
  }
  ok('armorsim table, shot, map, effects, edit: --exe mowas_2 under MoW:AS2 (so the table and map cache keys differ), AS64 argv unchanged');

  // ---------- (3) in process ----------
  const F = require('./find.server');
  const find = (ctx, q) => F.routes['POST /api/x/models/find']('/x', { mod, q }, Object.assign({}, ctx, { runTool: undefined, findWaitMs: 60000 }));
  const f64 = await find(as64, 'tank9'), fm2 = await find(as2, 'tank9'), f1 = await find(as2, 'tank1');
  assert.deepStrictEqual([f64.building, f64.total], [false, 1], 'AS64 sees tank9 of as64/core ' + JSON.stringify(f64));
  assert.deepStrictEqual([fm2.building, fm2.total], [false, 0], 'MoW:AS2 does not ' + JSON.stringify(fm2));
  assert.ok(f1.total >= 1, 'MoW:AS2 finds the base tank1');
  assert.notStrictEqual(F._t.entry(path.resolve(game), path.resolve(mod)), F._t.entry(path.resolve(game), path.resolve(mod), 'mowas_2'), 'two memory entries');
  assert.notStrictEqual(F._t.cacheOf(game, mod), F._t.cacheOf(game, mod, 'mowas_2'), 'two cache files');
  // the index child process under MoW:AS2 gets --exe and writes the MoW:AS2 cache file
  F._t.MEM.clear(); require('../../units/server').lib.storeOf(as2).clear('models.list'); calls = [];   // memory and store empty: the child builds
  await F.routes['POST /api/x/models/find']('/x', { mod, q: 'tank1' }, Object.assign({}, as2, { findWaitMs: 50 }));
  const ia = calls[0].args;
  assert.deepStrictEqual(ia.slice(0, 7), ['index', '--game', path.resolve(game), '--mod', path.resolve(mod), '--exe', 'mowas_2']);
  assert.strictEqual(ia[ia.indexOf('--out') + 1], F._t.cacheOf(path.resolve(game), path.resolve(mod), 'mowas_2'));
  F._t.MEM.clear(); require('../../units/server').lib.storeOf(as2).clear('models.list'); calls = [];   // memory and store empty: the child builds
  await F.routes['POST /api/x/models/find']('/x', { mod, q: 'tank1' }, Object.assign({}, as64, { findWaitMs: 50 }));
  assert.ok(!calls.length || !calls[0].args.includes('--exe'), 'AS64 index argv has no --exe');
  ok('find: MoW:AS2 lists no model of as64/core (tank9), AS64 does; own memory entry and cache file; soedit index gets --exe mowas_2');

  // the folder list and the store stamps: exe 'mowas_2' reaches modelindex.listFolder and modelindex.stamps, no exe under AS64
  const MIx = require(path.join(TOOLS, 'soedit', 'modelindex'));
  const lf = [], sg = [], lf0 = MIx.listFolder, sg0 = MIx.stamps;
  MIx.listFolder = o => { lf.push(o); return { path: o.path, total: 0, results: [], truncated: false }; };
  MIx.stamps = (...a) => { sg.push(a); return sg0(...a); };
  try {
    for (const ctx of [as64, as2]) {
      await F.routes['POST /api/x/models/folder']('/x', { mod, path: path.join(path.resolve(game), 'resource') }, ctx);
      F._t.MEM.clear(); await F.routes['POST /api/x/models/find']('/x', { mod, q: 'tank1' }, Object.assign({}, ctx, { runTool: undefined, findWaitMs: 60000 }));
    }
  } finally { MIx.listFolder = lf0; MIx.stamps = sg0; }
  assert.deepStrictEqual(lf.map(o => ['exe' in o, o.exe]), [[false, undefined], [true, 'mowas_2']], 'listFolder exe');
  assert.deepStrictEqual([sg[0][2], sg[sg.length - 1][2]], [undefined, 'mowas_2'], 'stamps: AS64 no exe, MoW:AS2 exe mowas_2');
  assert.deepStrictEqual([MIx.parts(game, mod).exe, MIx.parts(game, mod, 'mowas_2').exe], ['', 'mowas_2'], 'the two games have their own store entry');
  ok('folder and stamps: exe mowas_2 reaches modelindex.listFolder and modelindex.stamps under MoW:AS2, the AS64 calls are as before');

  const V = require('./viewer.server');
  const scene = async ctx => { const j = await V.routes['POST /api/x/models/viewer/scene']('/x', { mod, target: 'tank1', meshes: false }, ctx); assert.ok(j.ok, JSON.stringify(j).slice(0, 300)); return j.scene.bones.map(b => b.name); };
  const b64 = await scene(as64), bm2 = await scene(as2), b64b = await scene(as64);
  assert.ok(b64.includes('coreonly') && !bm2.includes('coreonly') && b64b.includes('coreonly'), JSON.stringify([b64, bm2]));
  ok('viewer/scene: MoW:AS2 shows the base tank1.mdl, AS64 the as64/core one; the kept model is per game (AS64, MoW:AS2, AS64 again)');

  const FS = require('./file.server');
  const src = async ctx => { const j = await FS.routes['POST /api/x/models/file/source']('/x', { mod, from: T + 'body.mtl' }, ctx); assert.ok(j.ok, JSON.stringify(j)); return Buffer.from(j.data, 'base64').toString('latin1'); };
  const s64 = await src(as64), sm2 = await src(as2);
  assert.ok(/tank1_core/.test(s64) && /\{diffuse "tank1"\}/.test(sm2), JSON.stringify([s64, sm2]));
  ok('file/source: a game path reads the as64/core body.mtl under AS64 and the base one under MoW:AS2');

  // doc/open and the armour reads: the option reaches the lib (exe 'mowas_2' under MoW:AS2, no exe key under AS64)
  const core = require(path.join(TOOLS, 'lib', 'model', 'edit', 'core'));
  const seen = [], open0 = core.open;
  core.open = o => { seen.push(o); throw Object.assign(new Error('stub'), { status: 400 }); };
  const D = require('./doc.server');
  for (const ctx of [as64, as2]) { try { await D.routes['POST /api/x/models/doc/open']('/x', { mod, target: T + 'tank1.mdl' }, ctx); } catch (e) { /* stub */ } }
  core.open = open0;
  assert.deepStrictEqual(seen.map(o => [o.game, 'exe' in o, o.exe]), [[path.resolve(game), false, undefined], [path.resolve(game), true, 'mowas_2']]);
  const AD = require(path.join(TOOLS, 'armorsim', 'armordata'));
  const got = [], os0 = AD.openSource;
  AD.openSource = o => { got.push(o); throw Object.assign(new Error('stub'), { status: 400 }); };
  for (const ctx of [as64, as2]) { try { await A.routes['POST /api/x/models/armor/guns']('/x', { q: 'x' }, ctx); } catch (e) { /* stub */ } }
  AD.openSource = os0;
  assert.deepStrictEqual(got.map(o => ['exe' in o, o.exe]), [[false, undefined], [true, 'mowas_2']]);
  ok('doc/open and armor/guns: exe mowas_2 reaches core.open and armordata.openSource under MoW:AS2, nothing added under AS64');

  // ---------- (4) Gates of Hell ----------
  const ghBefore = snap(gh);
  const gArgs = await stArgs(goh);
  assert.deepStrictEqual(gArgs.slice(gArgs.indexOf('--game'), gArgs.indexOf('--game') + 4), ['--game', path.resolve(gh), '--exe', 'goh'], gArgs.join(' '));
  ok('GoH: stage is started on the GoH install with --exe goh (not refused)');
  const inmod = path.join(gh, 'mods', 'inmod');
  calls = [];
  await assert.rejects(() => S.routes['POST /api/x/models/stage']('/x', { mod: inmod, target: 'gt' }, goh), e => e.status === 400 && !/Not available in GoH/.test(e.message));
  await assert.rejects(() => D.routes['POST /api/x/models/doc/open']('/x', { mod: inmod, target: 'gt' }, goh), e => e.status === 400);
  assert.strictEqual(calls.length, 0, 'no tool started for a mod inside the GoH install');
  ok('GoH: an existing mod inside the GoH install is refused before anything runs (Advanced off)');
  process.env.ARSENAL_ADVANCED = '1'; calls = [];
  try { await S.routes['POST /api/x/models/stage']('/x', { mod: inmod, target: 'gt' }, goh); } catch (e) { /* stub tool fails */ }
  delete process.env.ARSENAL_ADVANCED;
  assert.deepStrictEqual(calls.map(c => c.args[0]), ['stage'], 'Advanced on: stage is started for a mod inside <GoH>/mods');
  ok('GoH: with Advanced on a mod inside <GoH>/mods is written directly (owner 2026-11-15)');
  const seenG = []; core.open = o => { seenG.push(o); throw Object.assign(new Error('stub'), { status: 400 }); };
  try { await D.routes['POST /api/x/models/doc/open']('/x', { mod, target: 'gt' }, goh); } catch (e) { /* stub */ }
  core.open = open0;
  assert.deepStrictEqual(seenG.map(o => [o.game, o.exe]), [[path.resolve(gh), 'goh']]);
  ok('GoH: doc/open hands the GoH install and exe goh to the edit core');
  const routes = Object.keys(ext.routes), armour = routes.filter(k => k.includes('/models/armor/'));
  assert.ok(routes.length >= 30 && armour.length >= 3, 'routes ' + routes.length + ', armour ' + armour.length);
  calls = [];
  for (const k of armour) {
    const [verb, url] = k.split(' ');
    let res = null, err = null;
    try { res = await ext.routes[k](verb === 'GET' ? new URL('http://127.0.0.1' + url) : url, verb === 'GET' ? null : { mod, target: 'tank1' }, goh); } catch (e) { err = e; }
    // every armour route but nothit answers by GoH's own rules (sub/armorgoh.js, tools/armorsim/goh.js): guns lists the GoH guns, the
    // rest have no tank1.def or no gun in this GoH folder -> their own line; nothit keeps the plain line
    if (/\/armor\/guns$/.test(k)) { assert.ok(!err && res && Array.isArray(res.guns), k + ' -> ' + (err ? err.message : JSON.stringify(res))); continue; }
    if (!/\/armor\/nothit$/.test(k)) { assert.ok(err && err.status === 400 && err.message !== G.NA_GOH_ARMOUR, k + ' -> ' + (err ? err.message : JSON.stringify(res))); continue; }
    assert.strictEqual(err ? err.message : res && res.error, G.NA_GOH_ARMOUR, k + ' -> ' + (err ? err.message : JSON.stringify(res)));
  }
  assert.strictEqual(calls.length, 0, 'no armour tool started under GoH');
  for (const l of ['en', 'ru', 'uk', 'zh']) assert.ok(!('na.models.goh' in ext.lang[l]), l);
  assert.strictEqual(snap(gh), ghBefore, 'GoH install unchanged');
  ok('GoH: the ' + armour.length + ' armour routes answer by GoH rules (nothit the plain line), no tool started; the GoH install is unchanged');

  // nothing written into the game; the mod only holds what this test put there itself (removed above)
  assert.strictEqual(snap(game), before.game, 'game unchanged');
  ok('nothing written into the made-up game');
  console.log('PASS models game (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models game'); process.exit(1); });
