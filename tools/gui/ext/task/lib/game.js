// ext task: the one way a task learns its game (game parity). Contract: ../README.md "The game of a task".
//   of(ctx, draftOrGame) -> tg = {id, exe, kind, name, target, exeFile, dir, as2Dir, gohDir}
//     id      'as64' | 'mowas2' | 'goh': the draft's game (draft.game), else the given id, else the request's (ctx.gameId()), else as64
//     exe     the vfs exe ('as64' | 'mowas_2' | 'goh'), kind 'as2' | 'goh', name as tools/lib/games.js; target = id (gen --target,
//             newmod --target, upgrade --to, fix --target words); exeFile = the game exe under its install
//     dir     the install of that game: the GoH install under goh, else the AS2 install; null when none is found
//     as2Dir  ctx.game() (the AS2 install, AS64 and MoW:AS2 share it); gohDir the GoH install (ctx.gohDir(), or a string ctx.gohDir in
//             tests, else tools/lib/gamedir goh()), null when none
//   routeCtx(ctx, tg) -> the route ctx with gameId(), exe(), kind(), gohDir(), curDir() answering for tg: pass it to another ext route
//     called in process so that route reads the task's game, not the tab's
//   recipeCtx(ctx, draft, extra) -> route ctx + {mod, gameId (the id as a string, the recipe contract since wave 1), task: tg,
//     routeCtx()} with exe(), kind(), curDir() for tg; game() stays the AS2 install
//   lookCtx(ctx, tg, extra) -> route ctx for tg + {task, routeCtx()} + extra: what a recipe lookup gets (gameId() stays a function there)
//   In both, gohDir stays as the caller's ctx had it; the GoH folder of the task is task.gohDir.
//   exeArgs(tg) -> [] for as64 (an AS64 argument list stays as it was), else ['--exe', tg.exe]
//   view(ctx, tg, mod) -> {v, notes}: the game view of that game (see below); viewAsync: the same, awaited
//   warm(ctx, tg, mod) -> Promise: wait for the mod's shared scan before view (see below)
// No IO at require time; a GoH install is looked up once per call of of() only when the game is goh or ctx carries none.
// Author: Imperator_Aug (ARSENAL, ia-7877547b)
'use strict';
const G = require('../../../../lib/games');

const fnOr = (v, d) => { try { return typeof v === 'function' ? v() : (v == null ? d : v); } catch { return d; } };

function of(ctx, x) {
  ctx = ctx || {};
  const want = x && typeof x === 'object' ? x.game : x;
  const g = G.get(want) || G.get(fnOr(ctx.gameId, null)) || G.get(G.DEFAULT);
  const as2Dir = fnOr(ctx.game, null) || null;
  let goh;
  const gohOf = () => {
    if (goh !== undefined) return goh;
    goh = fnOr(ctx.gohDir, null) || null;
    if (!goh && g.kind === 'goh') { try { goh = require('../../../../lib/gamedir').goh() || null; } catch { goh = null; } }
    return goh;
  };
  const tg = { id: g.id, exe: g.exe, kind: g.kind, name: g.name, target: g.id, exeFile: g.file, as2Dir };
  Object.defineProperty(tg, 'gohDir', { enumerable: true, get: gohOf });
  Object.defineProperty(tg, 'dir', { enumerable: true, get: () => (g.kind === 'goh' ? gohOf() : as2Dir) });
  return tg;
}

function routeCtx(ctx, tg) {
  return Object.assign({}, ctx, { gameId: () => tg.id, exe: () => tg.exe, kind: () => tg.kind, gohDir: () => tg.gohDir, curDir: () => tg.dir });
}

// gohDir stays what the caller's ctx had (a function in the GUI, a string in some recipe tests): recipes read the folder from task.gohDir
function keepGoh(rc, ctx) { delete rc.gohDir; if (ctx && 'gohDir' in ctx) rc.gohDir = ctx.gohDir; return rc; }
function recipeCtx(ctx, draft, extra) {
  const tg = of(ctx, draft);
  return Object.assign(keepGoh(routeCtx(ctx, tg), ctx), { mod: (draft && draft.mod) || '', gameId: tg.id, task: tg, routeCtx: () => routeCtx(ctx, tg) }, extra || {});
}

function lookCtx(ctx, tg, extra) {
  return Object.assign(keepGoh(routeCtx(ctx, tg), ctx), { task: tg, routeCtx: () => routeCtx(ctx, tg) }, extra || {});
}

const exeArgs = tg => (!tg || tg.id === 'as64' ? [] : ['--exe', tg.exe]);

// view(ctx, tg, mod) -> {v, notes} the game view a task reads (lookups, names, the plan's copy/new marks): files/lib vfsFor with the
// task's route ctx (mod: a mod folder or ''). as64: exactly that, as before. Another game: that view when its exe is the task's;
// else (files/lib still built the AS64 set, or none) the game's own view, built here with exe: MoW:AS2 = the same mods without the
// as64+ built-in (no as64/core layer); GoH = the GoH install as it ships. The own view is the shared one of tools/lib/gameview
// (PERF A2: no copy kept here, no walk of an installed mod once its scan is there; a moved game or mod is seen by stamp and
// signature, not by age).
//   view       sync, for a caller that cannot wait (gameview withModsSync, revalidate: the scan starts in the background)
//   viewAsync  the same answer, awaited (gameview withMods): the server thread is not held while a listed mod is scanned
function viewPre(ctx, tg, mod) {
  let vf = { v: null, notes: [] };
  try { const L = require('../../files/lib'); vf = L.vfsFor(routeCtx(ctx, tg), mod || '') || vf; } catch (e) { vf = { v: null, notes: ['vfs-failed'], error: e.message }; }
  if (tg.id === 'as64' || (vf.v && vf.v.exe === tg.exe)) return { done: vf };
  const dir = tg.dir;
  if (!dir) return { done: { v: null, notes: ['no-game'] } };
  const mods = tg.kind === 'goh' ? [] : ((vf.v && vf.v.mods) || []).filter(m => String(m).split(':')[0].toLowerCase() !== 'as64+');
  return { vf, dir, o: { gameDir: dir, exe: tg.exe, list: mods, disableVersionControl: true } };
}
const viewOwn = (p, v) => ({ v, notes: (p.vf.notes || []).concat(['own-view']), game: p.dir });
const viewBad = e => ({ v: null, notes: ['vfs-failed'], error: e.message });
function view(ctx, tg, mod) {
  const p = viewPre(ctx, tg, mod);
  if (p.done) return p.done;
  let v; try { v = require('../../../../lib/gameview').withModsSync(p.o, { revalidate: true }); } catch (e) { return viewBad(e); }
  return viewOwn(p, v);
}
async function viewAsync(ctx, tg, mod) {
  const p = viewPre(ctx, tg, mod);
  if (p.done) return p.done;
  let v; try { v = await require('../../../../lib/gameview').withMods(p.o); } catch (e) { return viewBad(e); }
  return viewOwn(p, v);
}

// SPEED: for a route that can wait and calls view(ctx, tg, mod) right after: files/lib vfsWarm with the task's route ctx (the shared
// scan of the mod's folders, not blocking, so vfsFor does not walk the mod). Never throws; no mod: nothing.
async function warm(ctx, tg, mod) {
  try { const L = require('../../files/lib'); if (mod && typeof L.vfsWarm === 'function') await L.vfsWarm(routeCtx(ctx, tg), mod); } catch (e) { /* view says it */ }
}

module.exports = { of, routeCtx, recipeCtx, lookCtx, exeArgs, view, viewAsync, warm };
