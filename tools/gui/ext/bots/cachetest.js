// GUI-EXT bots: the shared store, the shared game view and the shared mod listing (gui README, CACHE contract 1) on a seeded game and a
// seeded mod in the scratch folder. For each kept thing: the kept answer equals one made now; a change in the area it reads makes it
// again; a change in an area it does not read leaves the kept entry alone. Also: no view is built here (the routes use the one of
// lib/gameview), a write tells the mod listing, the Prepare section bots.data goes none -> ready -> stale. Called from test.js:
// run(work, ok) -> number of checks.
// Author: Imperator_Aug (ARSENAL, ia-ef401336)
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');

module.exports = async function run(work, ok) {
  const T = path.join(__dirname, '..', '..', '..'), FX = path.join(T, 'botrecipe', 'test', 'chainn3');
  const cachestore = require(path.join(T, 'lib', 'cachestore')), modtree = require(path.join(T, 'lib', 'modtree')), gameview = require(path.join(T, 'lib', 'gameview'));
  const X = require('./index'), lib = require('./lib'), C = require('./parts/stages/cards'), BF = require('./parts/brain/brainfile'), MODES = require('../modes');
  const R = X.routes;
  let n = 0; const t = (c, m) => { n++; ok(c, 'cache: ' + m); };
  const same = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch (e) { return false; } };
  const W = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'latin1'); };
  const root = path.join(work, 'cache'), game = path.join(root, 'game'), mod = path.join(root, 'mods', 'mymod');
  fs.rmSync(root, { recursive: true, force: true });

  // ---- seeded game (loose files, no paks) and mod
  fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'as64.exe'), '');
  const GR = (...p) => path.join(game, 'resource', ...p), MR = (...p) => path.join(mod, 'resource', ...p);
  W(GR('set', 'multiplayer', 'units', 'vehicles_ger.set'), '{"pz4h" ("vt" s(ger) c(400))}\r\n{"tiger" ("vt" s(ger) c(900))}\r\n');
  W(GR('set', 'multiplayer', 'games', 'battle_zones.set'), '{game\r\n\t{settings\r\n\t\t{enableBots}\r\n\t}\r\n}\r\n');
  W(GR('set', 'multiplayer', 'games', 'captureflag.set'), '{game\r\n\t{teammatch}\r\n}\r\n');
  W(GR('set', 'stuff', 'gun', 'mg42.weapon'), '{weapon\r\n\t{AimingTolerance 2}\r\n}\r\n');
  W(GR('set', 'stuff', 'gun', 'kwk40.weapon'), '{weapon\r\n\t{aimingtolerance 1}\r\n}\r\n');
  W(GR('set', 'target', 'select.set'), '{include "tank.inc"}\r\n');
  W(GR('set', 'target', 'tank.inc'), '');
  W(GR('set', 'target', 'ammo.set'), '');
  fs.cpSync(path.join(FX, 'mod'), mod, { recursive: true });
  fs.cpSync(path.join(FX, 'stock', 'script'), MR('script'), { recursive: true });
  fs.rmSync(MR('script', 'multiplayer', 'bot.lua'), { force: true });
  W(path.join(mod, 'mod.info'), '{mod\r\n\t{name "mymod"}\r\n}\r\n');
  W(MR('set', 'multiplayer', 'games', 'bots_generic.inc'), '{easy\r\n\t{balancingFactorBonus {cp 0.75} {mp 0.75} {payback 0.75} }\r\n}\r\n');
  W(MR('set', 'stuff', 'gun', 'b_gun.weapon'), '{weapon\r\n\t{AimingTolerance 3}\r\n}\r\n');
  W(MR('set', 'stuff', 'gun', 'B_sub', 'x.weapon'), '{weapon\r\n\t{AimingTolerance 4}\r\n}\r\n');
  W(MR('set', 'stuff', 'gun', 'a_gun.weapon'), '{weapon\r\n\t{AimingTolerance 5}\r\n}\r\n');
  W(MR('set', 'stuff', 'gun', 'mg42.weapon'), '{weapon\r\n\t{AimingTolerance 6}\r\n}\r\n');   // replaces the game's file of that path
  W(MR('entity', 'x.def'), '{entity}\r\n');
  const gunKey = (BF.CAT.guns[0] || {}).key || 'AimingTolerance';
  for (const f of [GR('set', 'stuff', 'gun', 'mg42.weapon'), GR('set', 'stuff', 'gun', 'kwk40.weapon'), MR('set', 'stuff', 'gun', 'b_gun.weapon'), MR('set', 'stuff', 'gun', 'B_sub', 'x.weapon'), MR('set', 'stuff', 'gun', 'a_gun.weapon'), MR('set', 'stuff', 'gun', 'mg42.weapon')])
    fs.writeFileSync(f, fs.readFileSync(f, 'latin1').replace(/aimingtolerance/i, gunKey), 'latin1');

  const store = cachestore.open({ root: path.join(root, 'store') });
  modtree._reset({ store });
  gameview.drop();
  const plain = { game: () => game, gamedir: game, tools: T, tmpRoot: path.join(root, 'tmp'), allowLaunch: false };   // no store, no listing: all made now
  const ctx = Object.assign({}, plain, { cache: store, modtree, gameview });
  const U = (q) => ({ searchParams: new URLSearchParams(q) }), QM = 'mod=' + encodeURIComponent(mod);
  const entry = (section, parts) => { try { return JSON.parse(fs.readFileSync(path.join(store.root, 'e', store.key(section, parts), 'meta.json'), 'utf8')); } catch (e) { return null; } };
  const lowp = p => path.resolve(p).replace(/\\/g, '/').toLowerCase();
  const pack = s => s && { cards: [...s.cards].map(([u, v]) => [u, [...v]]), armies: [...s.armies].map(([u, v]) => [u, [...v]]), sides: [...s.sides] };
  const nextGame = () => { gameview.drop(game); };   // the game stamp is asked again (a test cannot wait 5 s)
  const walked = async () => { modtree.touch(mod); return modtree.ensure(mod); };

  // ---- the one shared game view: nothing here builds its own
  {
    const vfs = require(path.join(T, 'lib', 'vfs')), build = vfs.build; let builds = 0;
    vfs.build = function () { builds++; return build.apply(this, arguments); };
    try {
      await R['GET /api/x/bots/targets/state'](U(QM), null, ctx);
      await R['GET /api/x/bots/brain/guns'](U(QM), null, ctx);
      await R['GET /api/x/bots/modeready/botmodes'](U(QM), null, ctx);
      await MODES.routes['GET /api/x/modes/list'](U(QM), null, ctx);
      lib.gameScan(ctx); lib.gameText(ctx, 'set/target/select.set'); C.gameData(ctx);
    } finally { vfs.build = build; }
    t(builds === 1, 'targets, guns, bot modes, the modes list, the card scan and the game texts share one game view (' + builds + ' built)');
    t(lib.gameView(ctx) === gameview.get({ gameDir: game, gid: 'as64' }) && MODES._t.viewOf(MODES._t.gameOf(ctx)) === lib.gameView(ctx), 'bots and modes hand out the view of lib/gameview');
    t(lib.gameText(ctx, 'set/target/select.set') === '{include "tank.inc"}\r\n' && lib.gameText(ctx, 'set/none.set') === null, 'gameText: the bytes of the game file, null for a missing one');
  }

  // ---- the game's buy cards (bots.gamecards, stamp game)
  {
    const parts = { game: lowp(game), gid: 'as64' };
    const a = pack(lib.gameScan(ctx)), f = pack(lib.gameScanFresh(ctx)), e1 = entry('bots.gamecards', parts);
    t(a && same(a, f) && a.cards.some(c => c[0] === 'tiger'), 'game cards: the kept scan equals one made now');
    t(e1 && same(store.get('bots.gamecards', 1, parts, { game: lib.gameStamp(ctx) }).value, f), 'game cards: kept in the store as plain lists under the game stamp');
    t(lib.gameScanState(ctx).state === 'ready' && same(pack(lib.gameScan(plain)), f), 'game cards: state ready; a caller with no store gets the same');
    W(GR('set', 'multiplayer', 'units', 'vehicles_ger.set'), '{"pz4h" ("vt" s(ger) c(400))}\r\n{"tiger" ("vt" s(ger) c(900))}\r\n{"panther" ("vt" s(ger) c(800))}\r\n');
    W(GR('zz.txt'), 'x');   // a file directly in resource/ moves the game stamp, as a changed pak does
    const st0 = lib.gameStamp(ctx); nextGame();
    t(lib.gameStamp(ctx) !== st0 && lib.gameScanState(ctx).state === 'stale' && lib.gameScanState(ctx).why.includes('game'), 'game cards: a changed game is stale, why game');
    const b = pack(lib.gameScan(ctx));
    t(b.cards.some(c => c[0] === 'panther') && same(b, pack(lib.gameScanFresh(ctx))) && lib.gameScanState(ctx).state === 'ready', 'game cards: made again after the game changed');
  }

  // ---- guns (bots.guns.game stamp game, bots.guns.mod stamp mod:set)
  {
    const G = 'GET /api/x/bots/brain/guns', gp = { mod: lowp(mod) };
    const a = await R[G](U(QM), null, ctx), f = await R[G](U(QM), null, plain);
    const row = a.rows.find(r => r.key === gunKey);
    t(same(a, f) && row && row.count === 5 && row.hits.map(h => h.from).join() === 'mod,mod,mod,mod,game', 'guns: the kept answer equals one made now (mod files first, in folder order; the mod file replaces the game one)');
    const e1 = entry('bots.guns.mod', gp), g1 = entry('bots.guns.game', { game: lowp(game), gid: 'as64' });
    t(e1 && g1 && Object.keys(e1.stamps).join() === 'mod:set' && Object.keys(g1.stamps).join() === 'game', 'guns: mod part under mod:set, game part under game');
    t(same(await R[G](U(QM), null, ctx), f), 'guns: asked again, the same');
    W(MR('entity', 'x.def'), '{entity}\r\n; changed\r\n'); await walked();
    const b = await R[G](U(QM), null, ctx), e2 = entry('bots.guns.mod', gp);
    t(same(b, f) && e2 && e2.at === e1.at && e2.sum === e1.sum, 'guns: a change under resource/entity leaves the kept mod part alone');
    W(MR('set', 'stuff', 'gun', 'c_gun.weapon'), '{weapon\r\n\t{' + gunKey + ' 9}\r\n}\r\n'); await walked();
    const c = await R[G](U(QM), null, ctx), f2 = await R[G](U(QM), null, plain), e3 = entry('bots.guns.mod', gp);
    t(same(c, f2) && c.rows.find(r => r.key === gunKey).count === 6 && e3.sum !== e1.sum, 'guns: a new file under resource/set/stuff makes the mod part again');
    t(BF.gunsState(ctx, mod).every(s => s.state === 'ready'), 'guns: state ready for both parts');
  }

  // ---- unit names and army names of the stage card (bots.names)
  {
    const SR = 'GET /api/x/bots/stages/read', np = { game: lowp(game), gid: 'as64', mod: lowp(mod) };
    // the texts sit in resource/localization (area text): the mount keeps its own view in memory and looks at that folder for changes
    const unit = (/unit\s*=\s*"([^"]+)"/.exec(lib.effective(plain, mod, 'script/multiplayer/bot.data.lua').text) || [])[1];
    t(!!unit, 'names: the seeded bot list names a unit (' + unit + ')');
    W(MR('localization', 'desc.lng'), '{"entity" {"' + unit + '" "First Name"}}\r\n'); await walked();
    const f = await R[SR](U(QM), null, plain), o1 = await C.openData(ctx, mod), a = await R[SR](U(QM), null, ctx), o2 = await C.openData(ctx, mod);
    t(f.names[unit] === 'First Name' && same(a, f), 'names: the stage card with the store equals the one made now');
    t(o1.cached === false && o2.cached === true && o2.lng.get('desc/entity/' + unit.toLowerCase()) === 'First Name', 'names: made once, then taken from the store');
    const e1 = entry('bots.names', np);
    t(e1 && ['game', 'pool', 'mod:set', 'mod:script', 'mod:interface', 'mod:text', 'mod:pak', 'mod:other'].every(k => k in e1.stamps) && !('mod:entity' in e1.stamps), 'names: stamps game, pool and the areas it reads');
    t(C.openState(ctx, mod).state === 'ready', 'names: state ready');
    W(MR('entity', 'x.def'), '{entity}\r\n; changed twice\r\n'); await walked();
    const o3 = await C.openData(ctx, mod), e2 = entry('bots.names', np);
    t(o3.cached === true && e2.at === e1.at && e2.sum === e1.sum, 'names: a change under resource/entity leaves the kept entry alone');
    W(MR('localization', 'desc.lng'), '{"entity" {"' + unit + '" "Second Name"}}\r\n'); await walked();
    t(C.openState(ctx, mod).state === 'stale' && C.openState(ctx, mod).why.includes('mod'), 'names: a changed text is stale, why mod');
    const o4 = await C.openData(ctx, mod), a2 = await R[SR](U(QM), null, ctx), f2 = await R[SR](U(QM), null, plain);
    t(o4.cached === false && a2.names[unit] === 'Second Name' && same(a2, f2), 'names: a changed .lng of the mod makes them again');
    const o5 = await C.openData(Object.assign({}, ctx, { gameId: () => 'mowas2' }), mod);
    t(o5.cached === false, 'names: another game id is another entry');
  }

  // ---- a write tells the shared mod listing; a preview does not
  {
    const seen = [], mt = { touch: m => seen.push(path.resolve(m)), ensure: modtree.ensure, last: modtree.last, stamps: modtree.stamps };
    const wctx = Object.assign({}, ctx, { modtree: mt });
    const tb = await R['GET /api/x/bots/table'](U(QM + '&file=bots_generic.inc'), null, wctx), id = tb.rows[0].id;
    await R['POST /api/x/bots/edit'](null, { mod, file: 'bots_generic.inc', changes: { [id]: '0.5' }, write: false }, wctx);
    t(seen.length === 0, 'touch: a preview tells nothing');
    const wr = await R['POST /api/x/bots/edit'](null, { mod, file: 'bots_generic.inc', changes: { [id]: '0.5' }, write: true }, wctx);
    t(wr.written === true && seen.length === 1 && seen[0] === path.resolve(mod), 'touch: a write tells the mod listing once (' + seen.join(' ') + ')');
    await R['POST /api/x/bots/undo'](null, { mod, undo: wr.undo }, wctx);
    t(seen.length === 2, 'touch: Undo tells it too');
    let e = null; try { await R['POST /api/x/bots/edit'](null, { mod: game, file: 'bots_generic.inc', changes: { [id]: '0.5' }, write: true }, wctx); } catch (x) { e = x; }
    t(e && seen.length === 2, 'touch: a refused write tells nothing');
    t(Object.keys(R).filter(k => /^POST /.test(k)).every(k => typeof R[k].inner === 'function'), 'touch: every POST route of the page is wrapped');
    const m0 = await MODES.routes['POST /api/x/modes/bots'](null, { mod, mode: 'captureflag', write: false }, wctx);
    t(m0.state === 'added' && seen.length === 2, 'touch: the Game Modes preview tells nothing');
    const m1 = await R['POST /api/x/bots/modeready/allow'](null, { mod, mode: 'captureflag', write: true }, wctx);
    t(m1.ok && seen.length >= 3 && seen.slice(2).every(s => s === path.resolve(mod)), 'touch: allow bots in a mode (the Game Modes write) tells the mod listing');
  }

  // ---- the Prepare section
  {
    const P = X.prep[0], q = { mod, game: { id: 'as64', dir: game } };
    const collect = require('../prep/collect'), col = collect([X, { id: 'prep', prep: [{ id: 'game.view', title: 'x', state() {}, run() {} }, { id: 'mod.tree', title: 'x', state() {}, run() {} }] }]);
    t(P.id === 'bots.data' && same(P.needs, ['game.view', 'mod.tree']) && col.problems.length === 0 && col.prep[0].titles.zh === X.lang.zh['bots.prep.data'] && ['en', 'ru', 'uk', 'zh'].every(c => X.lang[c]['bots.prep.data']), 'prep: bots.data is a well formed section with a title in four languages ' + col.problems.join('; '));
    const store2 = cachestore.open({ root: path.join(root, 'store2') }), c2 = Object.assign({}, plain, { cache: store2, modtree, gameview });
    t(P.state(c2, q).state === 'none', 'prep: nothing kept yet is none');
    t(P.state(c2, { mod, game: { id: 'as64', dir: null } }).state === 'na' || P.state(Object.assign({}, c2, { game: () => null }), { mod, game: { id: 'as64' } }).state === 'na', 'prep: no game folder is na');
    const sets = [], before = fs.readdirSync(mod, { recursive: true }).length;
    const r = await P.run(c2, q, { cancelled: false, set: s => sets.push(s) });
    t(r.ok && sets.length >= 4 && sets.every(s => typeof s.stage === 'string' && s.total === r.steps) && sets[sets.length - 1].done === r.steps, 'prep: run reports its steps');
    t(P.state(c2, q).state === 'ready' && P.state(c2, q).bytes > 0 && fs.readdirSync(mod, { recursive: true }).length === before, 'prep: after run the state is ready and nothing was written into the mod');
    const o = await C.openData(c2, mod);
    t(o.cached === true, 'prep: the page then takes the names from the store');
    const st = await P.run(c2, q, { cancelled: true, set() {} });
    t(st.cancelled === true && st.steps === 0, 'prep: a cancelled job stops before the next step');
    store2.clear(); P.clear(c2, q);
    t(P.state(c2, q).state === 'none' && (await P.run(c2, q, { set() {} })).ok && P.state(c2, q).state === 'ready', 'prep: after Clear a run fills the store again');
    W(MR('set', 'stuff', 'gun', 'd_gun.weapon'), '{weapon\r\n\t{' + gunKey + ' 1}\r\n}\r\n'); await walked();
    const s2 = P.state(c2, q);
    t(s2.state === 'stale' && s2.why.includes('mod'), 'prep: a changed mod is stale, why mod');
    const g = P.state(Object.assign({}, c2, { gameId: () => 'goh' }), { mod, game: { id: 'mowas2', dir: game } });
    t(g.state === 'none' || g.state === 'stale', 'prep: the section answers for the game it is asked for');
  }
  // ---- SPEED: a server route waits for the shared scan first (stages/cards warm): no walk of the mod by lib/vfs, the same answer
  {
    const vfs = require(path.join(T, 'lib', 'vfs')), build = vfs.build, M = require('./parts/buycheck/mount'); let walks = 0;
    const routes = ['GET /api/x/bots/buys', 'GET /api/x/bots/units', 'GET /api/x/bots/stages/cards', 'GET /api/x/bots/recipes/units', 'GET /api/x/bots/botmatch/form', 'GET /api/x/bots/buycheck/cards'];
    const ask = async (k, c) => { try { return await R[k](U(QM), null, c); } catch (e) { return { threw: String(e && e.message) }; } };
    const strip = v => JSON.parse(JSON.stringify(v, (k, x) => (k === 'job' ? undefined : x)));
    vfs.build = function (o) { if (o && o.modDirs && o.modDirs.length && !(o.listings && o.listings.length)) walks++; return build.apply(this, arguments); };
    try {
      for (const k of routes) {
        W(MR('set', 'multiplayer', 'units', 'speed_ger.set'), '{"speedcard_' + routes.indexOf(k) + '" ("vt" s(ger) c(1))}\r\n');   // a changed units set
        modtree.touch(mod);                                                      // and no scan of this process that stands
        const f = await ask(k, plain);                                           // the old way: lib/vfs walks the mod
        t(!modtree.fresh(mod) && walks > 0, 'speed: ' + k + ' with no server: no scan of the mod, a walk (' + walks + ')');
        walks = 0;
        const a = await ask(k, ctx);
        t(!!modtree.fresh(mod) && walks === 0, 'speed: ' + k + ' waited for the shared scan, no walk of the mod (' + walks + ')');
        t(!a.threw && same(strip(a), strip(f)), 'speed: ' + k + ' answers as the walked view does');
      }
      const before = walks; modtree.touch(mod);
      await ask(routes[0], plain);
      t(!modtree.fresh(mod), 'speed: a caller with no ctx.modtree starts no scan (the old way)');
      await M.warm(plain, mod, []); t(!modtree.fresh(mod), 'speed: mount.warm does nothing with no ctx.modtree');
      await M.warm(ctx, mod, [{ dir: path.join(root, 'no-such-mod') }]); t(!!modtree.fresh(mod), 'speed: mount.warm scans the mod and does not reject on a missing folder');
      await C.warm(ctx, path.join(root, 'no-such-mod')); await C.warm(null, mod); t(true, 'speed: cards.warm never throws');
      walks = before;
    } finally { vfs.build = build; fs.rmSync(MR('set', 'multiplayer', 'units', 'speed_ger.set'), { force: true }); modtree.touch(mod); }
    // one buys call reads each units set of the mod a bounded number of times (it was once per file per file: N squared)
    const US = MR('set', 'multiplayer', 'units'), N = 12, rf = fs.readFileSync; let reads = 0;
    for (let i = 0; i < N; i++) W(path.join(US, 'sq' + i + '_ger.set'), '{"sq' + i + '" ("vt" s(ger) c(1))}\r\n');
    fs.readFileSync = function (p) { if (typeof p === 'string' && p.startsWith(US)) reads++; return rf.apply(this, arguments); };
    let b = null;
    try { b = lib.buys(plain, mod); } finally { fs.readFileSync = rf; }
    t(b.cards.filter(c => /^sq\d+$/.test(c.unit)).length === N && reads <= 3 * fs.readdirSync(US, { recursive: true }).length, 'speed: buys reads the mod units sets a few times each, not once per file per file (' + reads + ' reads of ' + N + ' files)');
    for (let i = 0; i < N; i++) fs.rmSync(path.join(US, 'sq' + i + '_ger.set'), { force: true });
    modtree.touch(mod);
  }
  modtree._reset();
  return { n };
};
