// ext task, game parity: the one way a task learns its game (lib/game.js) and what the core does with it: compile ctx, values ctx,
// lookups (names from .lng or GoH .pot, mods folder, the game view), recipe routes, command and tool arguments, the gen Ctx view,
// depsOf, the catalogue's na line, the Make the mod step and the game editor hand-off. Made-up fixtures only (a scratch AS2 install
// with as64.exe and as64/core, a scratch GoH install); nothing is started and no real install is written.
// node lib/game.test.js <scratch dir>; last line PASS. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-8258d889)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const GM = require('./game'), CP = require('./compile'), D = require('./draft'), RC = require('./recipe');
const S = require('../server'), E = require('../external'), CL = require('../client');

// a fresh folder of its own inside the scratch folder it is given: nothing else in that folder is touched
const scratchBase = path.resolve(process.argv[2] || os.tmpdir()); fs.mkdirSync(scratchBase, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchBase, 'task-game-'));
let passes = 0, fails = 0;
const ok = (c, name, more) => { if (c) passes++; else { fails++; console.log('FAIL ' + name); if (more !== undefined) console.log('  ' + String(more).slice(0, 600)); } };
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const info = (min, max, req) => '{mod\r\n\t{name "x"}\r\n\t{minGameVersion "' + min + '"}\r\n' + (max ? '\t{maxGameVersion "' + max + '"}\r\n' : '') + (req || []).map(r => '\t{require "' + r + '"}\r\n').join('') + '}\r\n';

// ---------- fixtures: an AS2 install (AS64 + MoW:AS2 share it) and a GoH install
const as2 = path.join(scratch, 'as2'), goh = path.join(scratch, 'goh');
w(path.join(as2, 'as64.exe'), 'x'); w(path.join(as2, 'mowas_2.exe'), 'x'); w(path.join(as2, 'mowas_2_ed.exe'), 'x'); w(path.join(as2, 'as64_ed.exe'), 'x');
w(path.join(as2, 'resource', 'set', 'a.set'), 'base');
w(path.join(as2, 'as64', 'core', 'resource', 'set', 'core_only.set'), 'core');
w(path.join(as2, 'as64', 'plus', 'mod.info'), info('3.301'));
w(path.join(as2, 'localization', 'desc.lng'), '﻿{tags\r\n\t{"desc"\r\n\t\t{"entity"\r\n\t\t\t{"willys" "Jeep AS2"}\r\n\t\t}\r\n\t}\r\n}\r\n');
w(path.join(as2, 'mods', 'dep', 'mod.info'), info('3.262.0', '3.262.1'));
w(path.join(as2, 'mods', 'mine', 'mod.info'), info('3.262.0', '3.262.1', ['dep', 'as64+']));
w(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'x'); w(path.join(goh, 'binaries', 'x64', 'call_to_arms_ed.exe'), 'x');
w(path.join(goh, 'resource', 'set', 'g.set'), 'goh');
w(path.join(goh, 'resource', 'interface', 'text', 'desc', 'desc_vehicles_x.pot'), '#, fuzzy\nmsgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgctxt "desc/entity/willys_goh"\nmsgid "Willys MB"\nmsgstr ""\n\nmsgctxt "info/special/willys_goh"\nmsgid "Transport"\nmsgstr ""\n');
w(path.join(goh, 'mods', 'gohmod', 'mod.info'), '{mod\r\n\t{name "g"}\r\n}\r\n');
const outside = path.join(scratch, 'gohmods', 'mymod'); fs.mkdirSync(outside, { recursive: true });

// a ctx like gui.js gives a route (game parity functions included)
function mkCtx(id, o) {
  o = o || {};
  const G = require('../../../../lib/games').get(id || 'as64');
  return { tools: path.resolve(__dirname, '..', '..', '..', '..'), tmpRoot: path.join(scratch, 'tmp'), taskDir: path.join(scratch, 'tasks'), session: { remote: false },
    game: () => as2, gameId: () => G.id, exe: () => G.exe, kind: () => G.kind, gohDir: () => (o.noGoh ? null : goh), curDir: () => (G.kind === 'goh' ? goh : as2),
    runTool: o.runTool || (async () => ({ code: 0, stdout: '', stderr: '' })) };
}

(async () => {
  // ---------- 1. of(): the draft's game first, then the request's, then as64
  {
    const c = mkCtx('mowas2');
    const a = GM.of(c, { game: 'goh' }), b = GM.of(c, { game: '' }), n = GM.of({}, null), x = GM.of(c, 'mowas_2');
    ok(a.id === 'goh' && a.exe === 'goh' && a.kind === 'goh' && a.dir === goh && a.as2Dir === as2 && a.target === 'goh', 'a goh draft: its game, exe, kind, GoH folder', JSON.stringify(a));
    ok(b.id === 'mowas2' && b.exe === 'mowas_2' && b.dir === as2, 'a draft with no game takes the request\'s (MoW:AS2 tab)', JSON.stringify(b));
    ok(n.id === 'as64' && n.exe === 'as64' && n.dir === null, 'nothing named: as64 (no game folder in that ctx)', JSON.stringify(n));
    ok(x.id === 'mowas2', 'a vfs exe names the game too');
    ok(GM.of({ gohDir: goh }, 'goh').dir === goh, 'a string gohDir (recipe tests) is the GoH folder');
    ok(JSON.stringify(GM.exeArgs(GM.of(c, 'as64'))) === '[]' && GM.exeArgs(a).join(' ') === '--exe goh' && GM.exeArgs(b).join(' ') === '--exe mowas_2', 'exeArgs: none for as64, --exe for the others');
  }
  // ---------- 2. the recipe ctx and the route ctx
  {
    const c = mkCtx('as64'), rc = GM.recipeCtx(c, { game: 'mowas2', mod: 'M' }), rt = rc.routeCtx();
    ok(rc.gameId === 'mowas2' && rc.task.id === 'mowas2' && rc.mod === 'M' && rc.exe() === 'mowas_2' && rc.kind() === 'as2' && rc.curDir() === as2 && rc.game() === as2, 'recipe ctx: gameId string, task, route functions for the draft\'s game, game() the AS2 install');
    ok(rt.gameId() === 'mowas2' && rt.exe() === 'mowas_2' && rt.curDir() === as2, 'routeCtx() answers gameId() for the draft\'s game (an in-process route call)');
    const g = GM.recipeCtx(c, { game: 'goh' });
    ok(g.task.dir === goh && g.curDir() === goh && g.kind() === 'goh' && typeof g.gohDir === 'function', 'goh recipe ctx: curDir the GoH install; gohDir kept as the caller had it');
    const lk = GM.lookCtx(c, GM.of(c, 'goh'), { mod: 'X' });
    ok(lk.gameId() === 'goh' && lk.task.id === 'goh' && lk.mod === 'X', 'lookup ctx: gameId() a function for the task\'s game');
  }
  // ---------- 3. compile ctx (c), values ctx
  {
    const rec = { id: 'zg', verbs: ['make'], games: ['as64', 'mowas2', 'goh'], groups: [], values: async (ctx, base, opt) => ({ seen: [ctx.gameId, ctx.task.id, ctx.task.exe, opt.game, ctx.task.dir] }) };
    for (const [id, exe, target, dir] of [['as64', 'as64', 'as64', as2], ['mowas2', 'mowas_2', 'mowas2', as2], ['goh', 'goh', 'goh', goh]]) {
      const c = mkCtx('as64'), d = { id: 'zg-1', recipe: 'zg', game: id, mod: '', answers: {} };
      const cc = CP.makeCctx(c, d, {}, rec, null);
      ok(cc.game === id && cc.target === target && cc.exe === exe && cc.gameDir === dir && cc.task.id === id, 'compile ctx of a ' + id + ' draft: game, target, exe, gameDir', JSON.stringify([cc.game, cc.target, cc.exe, cc.gameDir]));
      const v = await CP.valuesOf(c, rec, d, null);
      ok(JSON.stringify(v.seen) === JSON.stringify([id, id, exe, id, dir]), 'values of a ' + id + ' draft see its game', JSON.stringify(v.seen));
    }
    const cc0 = CP.makeCctx(mkCtx('as64'), { id: 'zg-2', recipe: 'zg', game: 'as64', mod: '' }, {}, rec, null);
    ok(cc0.target === 'as64' && cc0.gameDir === as2, 'as64 compile ctx as before');
  }
  // ---------- 4. commands and tools get the game's arguments; as64 stays as it was
  {
    const runs = [], runTool = async (t, e, a) => { runs.push(a.slice()); return { code: 0, stdout: '', stderr: '' }; };
    const mod = path.join(scratch, 'mk', 'newone');
    for (const id of ['as64', 'mowas2', 'goh']) {
      runs.length = 0;
      const c = mkCtx(id, { runTool }), tg = GM.of(c, id);
      await CP.runCall(c, mod, { cmd: 'new', input: { dir: mod, name: 'n' } }, false, {}, tg);
      await CP.runCall(c, mod, { tool: 'newmod', args: [mod, '--name', 'n'] }, false, {}, tg);
      await CP.runCall(c, mod, { cmd: 'check', input: { mod } }, false, {}, tg);
      const [nw, nm, ck] = runs.map(a => a.join(' '));
      if (id === 'as64') ok(!/--target/.test(nw) && !/--target/.test(nm) && !/--exe/.test(ck) && !/--goh/.test(ck), 'as64: no --target and no --exe added', JSON.stringify(runs));
      if (id === 'mowas2') ok(/--target mowas2/.test(nw) && /--target mowas2/.test(nm) && /--exe mowas2/.test(ck) && nw.includes('--game ' + as2), 'mowas2: new and newmod get --target mowas2, check --exe mowas2', JSON.stringify(runs));
      if (id === 'goh') ok(/--target goh/.test(nw) && nw.includes('--game ' + goh) && /--target goh/.test(nm) && nm.includes('--game ' + goh) && /--exe goh/.test(ck) && ck.includes('--goh ' + goh), 'goh: new and newmod --target goh with --game the GoH install; check --exe goh --goh', JSON.stringify(runs));
    }
    runs.length = 0;
    const c = mkCtx('goh', { runTool });
    await CP.runCall(c, mod, { cmd: 'new', input: { dir: mod, name: 'n', target: 'as64' } }, false, {}, GM.of(c, 'goh'));
    ok(/--target as64/.test(runs[0].join(' ')) && !/--target goh/.test(runs[0].join(' ')), 'a target the recipe names stays');
    // gohport's exe is the AS2 view (as64|mowas_2): a MoW:AS2 draft gets mowas_2, a GoH draft none (never 'mowas2' or 'goh');
    // fix on a GoH draft gets --game the GoH install (fix.js refuses an AS2 folder with --target goh)
    for (const id of ['as64', 'mowas2', 'goh']) {
      runs.length = 0;
      const c2 = mkCtx(id, { runTool }), tg = GM.of(c2, id);
      let thrown = null;
      try { await CP.runCall(c2, mod, { cmd: 'goh2as2', input: { entity: 'x', donor: 'y', goh: goh, out: mod } }, false, {}, tg); } catch (e) { thrown = e; }
      const gp = runs.length ? runs[0].join(' ') : '';
      ok(!thrown && gp, id + ': goh2as2 builds its arguments', thrown && (thrown.msg || thrown.message));
      if (id === 'mowas2') ok(/--exe mowas_2/.test(gp), 'mowas2: goh2as2 --exe mowas_2', gp);
      else ok(!/--exe/.test(gp), id + ': goh2as2 gets no --exe', gp);
      runs.length = 0;
      await CP.runCall(c2, mod, { cmd: 'fix', input: { mod, out: path.join(mod, 'fixed') } }, false, {}, tg);
      const fx = runs.length ? runs[0].join(' ') : '';
      if (id === 'goh') ok(/--target goh/.test(fx) && fx.includes('--game ' + goh) && !fx.includes('--game ' + as2), 'goh: fix --target goh --game the GoH install', fx);
      else ok(!fx.includes('--game ' + goh), id + ': fix keeps the AS2 install', fx);
    }
    // a route call gets the route ctx of the draft's game
    let seen = null;
    const recs = { zr: { id: 'zr', routes: { 'POST /api/x/task/r/zr/go': async (u, b, ctx) => { seen = [ctx.gameId(), ctx.exe(), ctx.curDir()]; return { ok: true }; } } } };
    const call = { route: 'POST /api/x/task/r/zr/go', body: {}, dryFlag: 'read' }; Object.defineProperty(call, '_recipe', { value: 'zr' });
    await CP.runCall(mkCtx('as64'), mod, call, false, recs, GM.of(mkCtx('as64'), 'goh'));
    ok(seen && seen.join('|') === 'goh|goh|' + goh, 'a route call reads the draft\'s game through its ctx', JSON.stringify(seen));
  }
  // ---------- 5. depsOf: as64+ only for as64
  {
    const mine = path.join(as2, 'mods', 'mine');
    const a = CP.depsOf(as2, mine), b = CP.depsOf(as2, mine, 'as64'), m = CP.depsOf(as2, mine, 'mowas_2');
    ok(a.includes('as64+') && a.includes('dep') && JSON.stringify(a) === JSON.stringify(b), 'as64 (or no exe): deps with the as64+ built-in, as before', JSON.stringify([a, b]));
    ok(m.includes('dep') && !m.includes('as64+'), 'mowas2: no as64+ in the deps', JSON.stringify(m));
  }
  // ---------- 6. the gen Ctx view of a MoW:AS2 draft has no as64/core; GoH reads the GoH install
  {
    const mod = path.join(as2, 'mods', 'mine');
    const g64 = CP.genRun(mkCtx('as64'), { id: 'zg-3', game: 'as64' }, mod, [], true, [], null);
    const gm = CP.genRun(mkCtx('as64'), { id: 'zg-4', game: 'mowas2' }, mod, [], true, [], null);
    ok(g64.vfs().exe === 'as64' && g64.vfs().files.has('resource/set/core_only.set'), 'as64 gen view: as64/core mounted (unchanged)');
    ok(gm.vfs().exe === 'mowas_2' && !gm.vfs().files.has('resource/set/core_only.set') && gm.vfs().files.has('resource/set/a.set'), 'mowas2 gen view: the MoW:AS2 set, no as64/core', gm.vfs().exe);
    ok(gm.target === 'mowas2', 'mowas2 gen target');
    const gg = CP.genRun(mkCtx('as64'), { id: 'zg-5', game: 'goh' }, outside, [], true, [], null);
    ok(gg.goh && gg.root === goh && gg.vfs().files.has('resource/set/g.set'), 'goh gen Ctx: target goh, root the GoH install', JSON.stringify([gg.target, gg.root]));
    let why = ''; try { CP.genRun(mkCtx('as64', { noGoh: true }), { id: 'zg-6', game: 'goh' }, outside, [], true, [], null); } catch (e) { why = e.message; }
    ok(/Gates of Hell folder/.test(why) || GM.of(mkCtx('as64', { noGoh: true }), 'goh').dir, 'goh with no GoH folder: a plain line', why);
  }
  // ---------- 7. the game view, names from texts, mods folder
  {
    const vm = GM.view(mkCtx('as64'), GM.of(mkCtx('as64'), 'mowas2'), '');
    ok(vm.v && vm.v.exe === 'mowas_2' && !vm.v.files.has('resource/set/core_only.set'), 'mowas2 view: built with exe mowas_2 (no as64/core)', vm.v && vm.v.exe);
    const v64 = GM.view(mkCtx('as64'), GM.of(mkCtx('as64'), 'as64'), '');
    ok(!v64.v || v64.v.exe === 'as64', 'as64 view: files/lib as before');
    const vg = GM.view(mkCtx('goh'), GM.of(mkCtx('goh'), 'goh'), '');
    ok(vg.v && vg.v.exe === 'goh' && vg.v.files.has('resource/interface/text/desc/desc_vehicles_x.pot'), 'goh view: the GoH install with its .pot texts', vg.v && vg.v.exe);
    // a recipe lookup that gives only ids: named from the game texts of the task's game
    let got = null;
    const zl = { id: 'zl', verbs: ['make'], games: ['as64', 'mowas2', 'goh'], groups: [], title: 'task.zl.t',
      lookups: { thing: async (ctx, words, opt) => { got = [ctx.task.id, ctx.gameId(), opt.game]; return [{ id: 'willys_goh' }, { id: 'willys' }]; } } };
    S.setRecipes([zl]);
    const L = S.routes['GET /api/x/task/lookup'];
    const r = await L(new URL('http://127.0.0.1/api/x/task/lookup?kind=thing&recipe=zl&q='), null, mkCtx('goh'));
    ok(got && got.join('|') === 'goh|goh|goh', 'a recipe lookup on the GoH tab gets the GoH game', JSON.stringify(got));
    const wg = r.results.find(x => x.id === 'willys_goh');
    ok(wg && wg.name === 'Willys MB', 'GoH names come from the .pot texts (msgctxt key, msgid shown)', JSON.stringify(r.results));
    // a draft's game wins over the tab's
    const c64 = mkCtx('as64'); D.save(c64, { id: 'zl-1', recipe: 'zl', verb: 'make', game: 'mowas2', mod: '', answers: {}, kept: [], state: 'open' });
    await L(new URL('http://127.0.0.1/api/x/task/lookup?kind=thing&recipe=zl&q=&draft=zl-1'), null, c64);
    ok(got && got[0] === 'mowas2' && got[2] === 'mowas2', 'the draft\'s game wins over the tab', JSON.stringify(got));
    const mf = await L(new URL('http://127.0.0.1/api/x/task/lookup?kind=modfolder&q='), null, mkCtx('goh'));
    ok(mf.in === path.join(goh, 'mods') && mf.results.some(x => x.id === 'gohmod'), 'modfolder on the GoH tab lists the GoH mods folder', JSON.stringify(mf));
    const ma = await L(new URL('http://127.0.0.1/api/x/task/lookup?kind=modfolder&q='), null, mkCtx('as64'));
    ok(ma.in === path.join(as2, 'mods') && ma.results.some(x => x.id === 'mine'), 'modfolder on the AS64 tab: the AS2 mods folder, as before');
    const tf = await L(new URL('http://127.0.0.1/api/x/task/lookup?kind=text&q=vehicles'), null, mkCtx('goh'));
    ok(tf.results.some(x => /desc_vehicles_x\.pot$/.test(x.id)), 'a text file lookup on GoH finds .pot files', JSON.stringify(tf.results.map(x => x.id)));
    // recipe routes get the task's game from body.draft
    let rseen = null;
    const zp = { id: 'zp', verbs: ['make'], games: ['as64', 'goh'], groups: [], title: 'task.zp.t', routes: { 'POST /api/x/task/r/zp/x': async (u, b, ctx) => { rseen = [ctx.task.id, ctx.gameId()]; return {}; } } };
    S.setRecipes([zl, zp]);
    D.save(c64, { id: 'zp-1', recipe: 'zp', verb: 'make', game: 'goh', mod: '', answers: {}, kept: [], state: 'open' });
    await S.recipeRoutes()['POST /api/x/task/r/zp/x'](null, { draft: 'zp-1' }, c64);
    ok(rseen && rseen.join('|') === 'goh|goh', 'a recipe route gets the draft\'s game (body.draft)', JSON.stringify(rseen));
    ok(typeof S.recipeRoutes()['POST /api/x/task/r/zp/x'].raw === 'function', 'the raw route is still there for tests');
  }
  // ---------- 8. catalogue na and recipe validate of na
  {
    const zn = { id: 'zn', verbs: ['make'], games: ['as64', 'mowas2'], na: { goh: 'task.zn.na.goh' }, groups: [], title: 'task.zn.t', compile: () => ({}) };
    S.setRecipes([zn]);
    const cat = await S.routes['GET /api/x/task/catalogue'](new URL('http://127.0.0.1/api/x/task/catalogue?game=goh'), null, mkCtx('goh'));
    const row = cat.recipes.find(x => x.id === 'zn');
    ok(row && row.forGame === false && row.na && row.na.goh === 'task.zn.na.goh', 'the catalogue row carries the na line', JSON.stringify(row));
    ok(!RC.validate(zn, null, {}).some(x => x.level === 'error' && /na/.test(x.msg)), 'na on a game left out validates');
    ok(RC.validate(Object.assign({}, zn, { na: { mowas2: 'task.zn.x' } }), null, {}).some(x => /na: mowas2 is in games/.test(x.msg)), 'na on a game in games is refused');
    ok(RC.validate(Object.assign({}, zn, { na: { goh: 'task.other.x' } }), null, {}).some(x => /starting with task\.zn\./.test(x.msg)), 'na key outside the prefix is refused');
    ok(RC.keysOf(zn).includes('task.zn.na.goh') && RC.forPage(zn).na.goh === 'task.zn.na.goh', 'keysOf and forPage name the na key');
    const pl = S.PLANNED.reduce((o, r) => (o[r.id] = r.games, o), {});
    ok(pl.mod.includes('goh') && pl.map.includes('mowas2') && pl.mission.includes('mowas2') && pl.bots.includes('mowas2') && !pl.bots.includes('goh') && pl.upgrade.includes('goh') && pl.gohunit.includes('mowas2'), 'PLANNED rows: mod goh, map mission bots mowas2, upgrade goh, gohunit mowas2', JSON.stringify(pl));
  }
  // ---------- 9. writes: a goh mod inside the GoH install is refused (the guard's plain line); outside it is taken
  {
    const c = mkCtx('goh');
    let why = ''; try { CP.modOf(c, { game: 'goh', mod: path.join(goh, 'mods', 'gohmod') }, {}); } catch (e) { why = e.message; }
    ok(/Gates of Hell|GoH|game/i.test(why), 'a GoH mod inside the GoH install: refused with the guard\'s line', why);
    let ok2 = null; try { ok2 = CP.modOf(c, { game: 'goh', mod: outside }, {}); } catch (e) { ok2 = e.message; }
    ok(ok2 === path.resolve(outside), 'a GoH mod folder outside the install is taken', ok2);
  }
  // ---------- 10. the game editor hand-off by the draft's game; never started
  {
    E._hooks({ game: as2, goh, platform: 'linux' });
    const list = id => E.listRoute(new URL('http://127.0.0.1/api/x/task/external?ids=game-editor&game=' + id), null, mkCtx(id)).programs[0];
    const pg = list('goh'), pm = list('mowas2'), pa = list('as64');
    ok(pg.found && pg.path === path.join(goh, 'binaries', 'x64', 'call_to_arms_ed.exe') && pg.exe === 'call_to_arms_ed.exe', 'GoH: the editor found in the GoH install', JSON.stringify(pg));
    ok(pm.found && pm.path === path.join(as2, 'mowas_2_ed.exe') && pa.path === path.join(as2, 'as64_ed.exe'), 'MoW:AS2 and AS64: their own editor in the AS2 install', JSON.stringify([pm.path, pa.path]));
    ok(!pg.can.start && !pg.can.file && pg.can.reveal, 'the GoH editor is never started from here (Show in folder only)');
    ok(E.GAME_EXES.includes('call_to_arms_ed.exe') && E.GAME_EXES.includes('call_to_arms.exe'), 'GoH exes are game exes');
    // the steps of the game's tab: GoH says the mod is put where GoH reads it by hand (no write into the GoH install); AS2 as before
    ok(pg.steps[0] === 'task.prog.game-editor.goh.s1' && pg.steps.length === 3 && pm.steps[0] === 'task.prog.game-editor.s1' && pa.steps[0] === 'task.prog.game-editor.s1', 'GoH: its own first editor step; AS64 and MoW:AS2 keep theirs', JSON.stringify([pg.steps, pa.steps]));
    const LG = require('../lang'), keyOf = new Set(LG.map(r => r[0])), row = LG.find(r => r[0] === 'task.prog.game-editor.goh.s1');
    ok(pg.steps.every(k => keyOf.has(k)) && row && row.length === 5 && row.every(x => x && !/[–—]/.test(x)) && row.slice(1).every(x => x.includes('{exe}') && x.includes('binaries/x64')), 'GoH editor steps: lang rows in four languages, {exe} and binaries/x64 named');
    ok(E.checkEntry(Object.assign({}, E.byId('game-editor'), { stepsFor: { coh: ['task.prog.game-editor.s1'] } })).some(m => /stepsFor/.test(m)) && E.checkEntry(Object.assign({}, E.byId('game-editor'), { stepsFor: { goh: ['task.other.s1'] } })).some(m => /stepsFor/.test(m)) && !E.checkEntry(E.byId('game-editor')).length, 'seeded defect: stepsFor with an unknown game or a key outside task.prog.<id>. is refused');
    const c = mkCtx('as64'); D.save(c, { id: 'ze-1', recipe: 'zn', verb: 'make', game: 'goh', mod: outside, answers: {}, kept: [], state: 'open' });
    let why = ''; try { E.planOf(c, { id: 'game-editor', draft: 'ze-1', action: 'start' }); } catch (e) { why = e.message; }
    ok(/only through ARSENAL/.test(why), 'start of the GoH editor is refused', why);
    const rv = E.planOf(c, { id: 'game-editor', draft: 'ze-1', action: 'reveal' });
    ok(rv.target === path.join(goh, 'binaries', 'x64', 'call_to_arms_ed.exe'), 'a goh draft reveals the GoH editor on the AS64 tab too', rv.target);
    E._hooks({ goh: null });
    ok(!list('goh').found, 'no GoH install: the editor is not found (no AS2 editor offered for GoH)');
    E._reset();
  }
  // ---------- 11. the page: Make the mod runs new with the tab's target; lookups send the game
  {
    const src = CL.script('');
    let parse = true; try { new Function(src); } catch (e) { parse = false; }
    ok(parse, 'the client script parses');
    ok(/inp\.target=tg/.test(src) && /inp\.game=gohDir\(\)/.test(src) && /streamRun\('new',inp/.test(src), 'Make the mod: new with target mowas2|goh and the GoH --game');
    ok(/game:TK\.d\.game\|\|GID/.test(src), 'lookups send the task\'s game');
    ok(/gd=goh\?\(typeof gohDir==='function'\?gohDir\(\):''\):gameDir\(\)/.test(src) && /var dir=gd\?join\(gd,'mods'\):''/.test(src) && !/var dir=curFolder\(\)/.test(src), 'Make the mod: the mods folder is the draft\'s game\'s, not the open tab\'s');
    ok(/r\.na&&r\.na\[GID\]/.test(src), 'a greyed row says its own na line');
    ok(src.includes("tx(goh?'task.mstep.newHintGoh':'task.mstep.newHint')"), 'Make the mod: on GoH the hint asks a full path outside the GoH install');
    const LH = require('../lang').find(r => r[0] === 'task.mstep.newHintGoh');
    ok(LH && LH.length === 5 && LH.every(Boolean) && /outside the Gates of Hell folder/.test(LH[1]), 'task.mstep.newHintGoh in four languages');
    ok(!/[`]/.test(src) && !/\$\{/.test(src), 'no backtick or dollar-brace in the page script');
    ok(/TK\.rec\.writes\[tg\]\)tg=TK\.rec\.writes\[tg\]/.test(src), 'Make the mod: the game a recipe writes for (recipe writes) picks the mods folder');
  }
  // ---------- 12. genGame: a recipe that writes for another game (gohunit on the GoH tab makes an AS2 unit)
  {
    const zw = { id: 'zw', verbs: ['make'], games: ['as64', 'mowas2', 'goh'], groups: [], title: 'task.zw.t', genGame: d => (d.game === 'mowas2' ? 'mowas2' : 'as64'),
      compile: (d, c) => ({ notes: ['game ' + c.game], gen: { ops: [] } }) };
    const R = { zw, zn: { id: 'zn', verbs: ['make'], games: ['as64'], groups: [], title: 'task.zn.t' } };
    const mod = path.join(as2, 'mods', 'mine'), dg = { id: 'zw-1', recipe: 'zw', game: 'goh', mod }, wd = CP.writeDraft(dg, R);
    ok(wd !== dg && wd.game === 'as64' && dg.game === 'goh' && wd.id === 'zw-1', 'writeDraft: a goh draft of a genGame recipe writes for as64 (the draft itself unchanged)', JSON.stringify(wd));
    ok(CP.writeDraft({ id: 'zw-2', recipe: 'zw', game: 'mowas2' }, R).game === 'mowas2', 'writeDraft: the same game gives the draft back');
    const dn = { id: 'zn-9', recipe: 'zn', game: 'goh' };
    ok(CP.writeDraft(dn, R) === dn, 'writeDraft: a recipe with no genGame keeps the draft\'s game');
    ok(CP.writeDraft({ recipe: 'zx', game: 'goh' }, Object.assign({}, R, { zx: { genGame: () => 'coh' } })).game === 'goh', 'writeDraft: an unknown game word is ignored');
    // a draft saved with no game: read as the page's game first (the stage target and the mod step use it), so '' on the MoW:AS2 tab
    // writes for mowas2; '' on the GoH tab and with no ctx stay as64
    ok(CP.writeDraft({ recipe: 'zw', game: '' }, R, mkCtx('mowas2')).game === 'mowas2', 'writeDraft: a draft with game \'\' on the MoW:AS2 tab writes for mowas2');
    ok(CP.writeDraft({ recipe: 'zw', game: '' }, R, mkCtx('goh')).game === 'as64', 'writeDraft: a draft with game \'\' on the GoH tab writes for as64');
    ok(CP.writeDraft({ recipe: 'zw', game: '' }, R).game === 'as64', 'writeDraft: a draft with game \'\' and no ctx writes for as64 (as before)');
    const de = { recipe: 'zw', game: '' }; CP.writeDraft(de, R, mkCtx('mowas2')); ok(de.game === '', 'writeDraft: the saved draft itself keeps game \'\'');
    // genRun with the write draft: target as64, the AS2 view (as64/core mounted), no GoH root
    const g = CP.genRun(mkCtx('goh'), wd, mod, [], true, [], null);
    ok(g.target === 'as64' && !g.goh && g.vfs().exe === 'as64' && g.vfs().files.has('resource/set/a.set'), 'genRun of a goh gohunit-like draft: an AS64 gen Ctx on the AS2 install', JSON.stringify([g.target, g.root]));
    // the mod guard of the write game: an AS2 mod is taken for a goh draft of such a recipe
    ok(CP.modOf(mkCtx('goh'), wd, {}) === path.resolve(mod), 'modOf with the write draft: an AS2 mod is taken');
    // plan: the whole path (compile with the draft's game, gen and guard with the write game)
    const c = mkCtx('goh'); D.save(c, { id: 'zw-3', recipe: 'zw', verb: 'make', game: 'goh', mod, answers: {}, kept: [], state: 'open' });
    const p = await CP.plan(c, 'zw-3', R);
    ok(p.mod === path.resolve(mod) && !p.errors.length && p.notes.includes('game goh'), 'plan: the recipe compile sees goh, the AS2 mod is planned with no error', JSON.stringify([p.mod, p.errors, p.notes]));
    // the page learns it: forPage writes
    const fp = RC.forPage(zw);
    ok(fp.writes && fp.writes.goh === 'as64' && !('as64' in fp.writes) && !('mowas2' in fp.writes), 'forPage writes: goh -> as64 only', JSON.stringify(fp.writes));
    ok(RC.forPage(R.zn).writes === null, 'forPage writes: null without genGame');
    ok(RC.validate(Object.assign({}, zw, { genGame: 'as64' }), null, {}).some(x => /genGame must be a function/.test(x.msg)), 'validate: genGame not a function is refused');
  }
  console.log(passes + ' passed, ' + fails + ' failed');
  console.log(fails ? 'FAIL' : 'PASS');
  if (fails) process.exitCode = 1;
})().catch(e => { console.log(e.stack); console.log('FAIL'); process.exitCode = 1; });
