// GUI-EXT bots: the Bots page (Game Modes & AI > Bots). Groups A What bots buy, B How bots think, C Match setup, F Test and limits; the
// page's own cards (what bots buy, add a unit to the bot list (botrecipe), bot difficulty numbers) plus the parts in parts/<id>/.
// Groups D (ext/unitai, Unit AI) and E (ext/mapai, Map scripts for AI) are drawn by those pages with the same BOTS_UI.drawGroups; every
// part's routes (/api/x/bots/<part>/...), strings and client script live here, so those two pages hold no routes of their own.
// Reads bot.data.lua / bots_generic.inc / presets through the vfs (read only). Writes only a copy into the mod folder the user picked; every
// write reply carries undo [{rel, id}] and POST undo puts the exact bytes back (lib.undo, shared with the parts). Errors carry a bots.e.* key.
// Games: AS64 and MoW:AS2 alike (the vfs view of the request's game, lib.js gameOf); GoH: buys reads the purchase lists units/<army>/<list>.<army>.lua (lib gohBuys, [T]), buyfirst adds a row to one of them in the mod (lib gohAddUnit: botrecipe --exe goh, [T]; no bot.data.lua, GHMIS-66), units = the units those lists name, table/edit/reset serve the GoH presets and bots_generic.inc (lib.js GOH_FILES).
// CACHE (gui README, contract 1): every POST route ends with lib.touchWrites(ctx), so a write (each passes lib.checkWrite, which notes the
// mod) makes the shared mod listing walk again. prep: the Prepare section bots.data = what the Bots, Unit AI and Map Scripts pages read
// at open and is kept in the shared store: the game's buy cards (lib gameScan, 'bots.gamecards'), where the gun aiming keys sit
// (brainfile guns, 'bots.guns.game' + 'bots.guns.mod'), unit names and lobby army names (stages/cards openData, 'bots.names'); its run
// then reads the open routes once (targets, soldier settings, stages, bot modes) so their game texts are in memory. The Game Modes list
// (ext/modes) needs the shared game view alone and keeps nothing, so it has no section of its own.
// GoH: section bots.gohunits keeps the units the purchase lists name (lib gohUnitsCached), per mod.
// Script order: script.head (BOTS_PARTS=[], BOTS_UI and its kit) + each part's client in its own function + script.screen (EXT_SCREENS.bots).
// Author: Imperator_Aug (ARSENAL, ia-cba03914)
const lib = require('./lib');
const S = require('./script');
const lang = require('./lang');
const PARTS = require('./parts');

const q = (url, k) => (url && url.searchParams && url.searchParams.get(k)) || '';
const C = require('./parts/stages/cards'), BF = require('./parts/brain/brainfile');

const routes = {
  // SPEED: C.route = the route with the shared mod scan waited for first (stages/cards warm), so the sync readers do not walk the mod
  'GET /api/x/bots/buys': C.route(async (url, body, ctx) => lib.buys(ctx, lib.checkMod(ctx, q(url, 'mod')), q(url, 'list'))),   // list: GoH only (early, mid, late, conquest)
  'GET /api/x/bots/units': C.route(async (url, body, ctx) => lib.unitList(ctx, lib.checkMod(ctx, q(url, 'mod')))),
  'GET /api/x/bots/table': async (url, body, ctx) => lib.table(ctx, lib.checkMod(ctx, q(url, 'mod')), q(url, 'file')),
  'POST /api/x/bots/edit': async (url, body, ctx) => { body = body || {}; return lib.edit(ctx, lib.checkMod(ctx, body.mod), body.file, body.changes || {}, !!body.write); },
  'POST /api/x/bots/reset': async (url, body, ctx) => { body = body || {}; return lib.reset(ctx, lib.checkMod(ctx, body.mod), body.file, !!body.write); },
  'POST /api/x/bots/buyfirst': C.route(async (url, body, ctx) => lib.buyFirst(ctx, body || {})),
  // {mod, undo: [{rel, id}]} (what a write reply's undo said): puts the exact bytes back, or refuses plainly (lib.undo)
  'POST /api/x/bots/undo': async (url, body, ctx) => lib.undoRoute(ctx, body || {}),
  // ?mod=&rel=..&rel=..: for each file {rel, n (steps kept, up to lib.undo.MAX), id (the newest), ok (Undo would work now), key (why not)}
  'GET /api/x/bots/undo': async (url, body, ctx) => lib.undoState(ctx, q(url, 'mod'), url && url.searchParams ? url.searchParams.getAll('rel') : []),
};

// parts: routes and strings merged (a clash with a page route or string is left out with a warning), scripts each in a function of
// their own with a guard, so a part that throws at load time is skipped and the page still draws
const merged = { en: {}, ru: {}, uk: {}, zh: {} };
for (const c of Object.keys(merged)) Object.assign(merged[c], lang[c]);
const partScripts = [];
for (const p of PARTS) {
  for (const k of Object.keys(p.routes || {})) {
    if (routes[k]) { console.warn('bots part ' + p.id + ': route ' + k + ' is taken, left out'); continue; }
    routes[k] = p.routes[k];
  }
  for (const r of p.lang || []) {
    if (merged.en[r[0]] != null) { console.warn('bots part ' + p.id + ': string ' + r[0] + ' is taken, left out'); continue; }
    merged.en[r[0]] = r[1]; merged.ru[r[0]] = r[2]; merged.uk[r[0]] = r[3]; merged.zh[r[0]] = r[4];
  }
  if (p.script) partScripts.push('// bots part ' + p.id + '\n(function(){try{\n' + p.script + '\n}catch(e){try{console.warn(\'bots part ' + p.id + ' skipped\',e)}catch(x){}}})();');
}

// CACHE: a route that wrote into the mod tells the shared mod listing (after its work, also when it threw half way)
for (const k of Object.keys(routes)) {
  if (!k.startsWith('POST ')) continue;
  const fn = routes[k];
  routes[k] = Object.assign(async (url, body, ctx) => { try { return await fn(url, body, ctx); } finally { lib.touchWrites(ctx); } }, { inner: fn });
}

// ---- Prepare section (gui README, "Prepare sections")
// the request's game as the section is asked for it: q = {mod, game: {id, dir, exe}}
function prepCtx(ctx, pq) {
  const g = (pq && pq.game) || {};
  if (!g.id) return ctx || {};
  const dir = g.dir || null;
  return Object.assign({}, ctx, { gameId: () => g.id }, dir ? { game: () => dir, curDir: () => dir, gohDir: () => dir } : {});
}
const PREP_STORE = [lib.CARDS_SECTION, BF.GUNS_GAME, BF.GUNS_MOD, C.NAMES_SECTION];
function prepMod(c, pq) { try { return pq && pq.mod ? lib.checkMod(c, pq.mod) : null; } catch (e) { return null; } }
function prepState(ctx, pq) {
  const c = prepCtx(ctx, pq), G = lib.gameOf(c), mod = prepMod(c, pq), list = [];
  if (!lib.storeOf(c)) return { state: 'none', why: [] };
  if (!G.dir) return { state: 'na', why: [] };
  const add = f => { try { for (const s of [].concat(f())) list.push(s); } catch (e) { list.push({ state: 'none', why: [] }); } };
  if (G.kind !== 'goh') add(() => lib.gameScanState(c));
  add(() => BF.gunsState(c, mod));
  if (G.kind !== 'goh' && mod) add(() => C.openState(c, mod));
  const why = [], out = { state: list.every(s => s.state === 'ready') ? 'ready' : list.some(s => s.state === 'stale') ? 'stale' : 'none', why, at: 0, bytes: 0 };
  for (const s of list) { for (const w of s.why || []) if (!why.includes(w)) why.push(w); if (s.at > out.at) out.at = s.at; out.bytes += s.bytes || 0; }
  if (!out.at) delete out.at;
  return out;
}
// what the three files hold in memory, dropped: the next ask goes to the store, and makes again what is not there
function prepClear() { lib.forget(); BF.forget(); C.forget(); }
async function prepRun(ctx, pq, job) {
  if (prepState(ctx, pq).state !== 'ready') prepClear();   // an entry the store lost (Clear, the size cap) is not answered from memory
  const c = prepCtx(ctx, pq), G = lib.gameOf(c), mod = prepMod(c, pq), as2 = G.kind !== 'goh';
  const U = p => new URL('http://x/api/x/bots/' + p + (mod ? '?mod=' + encodeURIComponent(mod) : ''));
  const open = p => async () => { try { await routes['GET /api/x/bots/' + p](U(p), null, c); } catch (e) { /* a page says so itself */ } };
  const steps = [];
  if (!G.dir) return { ok: true, steps: 0 };
  if (as2) steps.push(['cards', async () => { lib.gameScan(c); }]);
  steps.push(['guns', async () => { await BF.guns(c, mod); }]);
  if (as2 && mod) steps.push(['names', async () => { await C.openData(c, mod); }]);
  if (mod) for (const p of ['targets/state', 'brain/values', 'stages/read', 'modeready/botmodes']) steps.push([p, open(p)]);
  for (let i = 0; i < steps.length; i++) {
    if (job && job.cancelled) return { ok: false, cancelled: true, steps: i };
    if (job && typeof job.set === 'function') job.set({ stage: steps[i][0], done: i, total: steps.length });
    await steps[i][1]();
    await new Promise(r => setImmediate(r));   // a turn for the server between the steps
  }
  if (job && typeof job.set === 'function') job.set({ stage: 'done', done: steps.length, total: steps.length });
  return { ok: true, steps: steps.length };
}
// GoH only: the buy cards the bot check (buycheck run, cards) compares with the purchase lists (buycheck/gohcards, store section
// 'bots.gohcards', stamps game + mod:set, pak); run reads them through the same code, so the check then hits the entry
const GC = () => require('./parts/buycheck/gohcards');
function gcState(ctx, pq) { const c = prepCtx(ctx, pq); return GC().state(c, prepMod(c, pq)); }
async function gcRun(ctx, pq, job) {
  const c = prepCtx(ctx, pq), mod = prepMod(c, pq), set = o => { if (job && typeof job.set === 'function') job.set(o); };
  if (lib.gameOf(c).kind !== 'goh' || !mod) return { ok: true, steps: 0 };
  set({ stage: 'cards', done: 0, total: 1 });
  await GC().cardsOf(c, mod);
  set({ stage: 'done', done: 1, total: 1 });
  return { ok: true, steps: 1 };
}
// GoH only: the units the bot purchase lists name (lib gohUnitsCached, store section 'bots.gohunits', stamps game + mod:script), what
// GET units (the add form's unit box) answers; run goes through that route's code, so the page then hits the entry
function guState(ctx, pq) { const c = prepCtx(ctx, pq); return lib.gohUnitsState(c, prepMod(c, pq)); }
async function guRun(ctx, pq, job) {
  const c = prepCtx(ctx, pq), mod = prepMod(c, pq), set = o => { if (job && typeof job.set === 'function') job.set(o); };
  if (lib.gameOf(c).kind !== 'goh' || !mod) return { ok: true, steps: 0 };
  set({ stage: 'units', done: 0, total: 1 });
  await lib.unitList(c, mod);
  set({ stage: 'done', done: 1, total: 1 });
  return { ok: true, steps: 1 };
}
const prep = [{ id: 'bots.data', title: 'bots.prep.data', needs: ['game.view', 'mod.tree'], areas: C.NAMES_AREAS.slice(), store: PREP_STORE, state: prepState, run: prepRun, clear: prepClear },
  { id: 'bots.gohunits', title: 'bots.prep.gohunits', needs: ['game.view', 'mod.tree'], areas: ['script'], games: ['goh'], store: [lib.GU_SECTION], state: guState, run: guRun, clear: ctx => { lib.forget(); return ctx && ctx.cache ? ctx.cache.clear(lib.GU_SECTION) : null; } },
  { id: 'bots.gohcards', title: 'bots.prep.gohcards', needs: ['game.view', 'mod.tree'], areas: GC().AREAS.slice(), games: ['goh'], store: [GC().SECTION], state: gcState, run: gcRun, clear: ctx => { GC().forget(); return ctx && ctx.cache ? ctx.cache.clear(GC().SECTION) : null; } }];

module.exports = {
  id: 'bots',
  nav: 'bots.nav',
  adv: false,
  after: 'maps',
  script: S.head + '\n' + partScripts.join('\n') + '\n' + S.screen,
  lang: merged,
  commands: {},
  routes,
  parts: PARTS,
  prep,
};
