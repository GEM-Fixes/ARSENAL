// Models page part `find` (sub/README.md): pick any model by search or by folder. Reads only: writes nothing but its own index cache.
// CACHE (gui README, contract 1): the model list is kept in the shared store, section 'models.list' (modelindex SECTION, VERSION,
// parts, stamps): stamps = the game (lib/gameview) and the mod's areas entity, set, interface, text, pak, other from the one shared walk
// (lib/modtree; the last walk while younger than 15 s, ctx.modAgeMs for another age). This part walks nothing itself. The child
// build writes a scratch file next to the command line's cache file; it is put into the store and removed.
//   POST /api/x/models/find   { q, mod, game?, kind?, limit? } -> { total, results: [row], didYouMean: [row], building, note }
//        every model of the game with the mod folder laid on top (its loose files and its own paks, active in the game or not):
//        entities of every kind, breeds, and .mdl files no definition names. kind: all (default) | vehicle | human | object |
//        breed | model; limit 40 (at most 200). Every word must be in the name, the game path or the in-game display name
//        (case-blind; the display name also through the Units page's common-name folding): exact name first, then names that
//        start with the words, then display names (exact, a word starting with the text), names holding them, display names
//        holding them (modelindex.search). A row found by its display name has title and byTitle: the page shows "title (name)".
//        didYouMean: close names (display names too) when nothing matches.
//   POST /api/x/models/folder { path, mod, game? } -> { path, total, results: [row], truncated }   at most 20000 rows
//        the models in a folder anywhere on disk (recursive, also inside the .pak files it holds), in one .pak given by path, or
//        in a folder inside a pak: <pak path>!<folder> (a mod whose entities are only in its entity.pak: <mod>/resource/entity.pak!entity/-vehicle),
//        or one model file (a .mdl, .def or breed .set on disk, or pak:<pak>!<entry>): listed alone, its model found next to it or
//        through the mod and the game.
//   row = { target, name, kind, key, where, pak, model, title?, byTitle? } (tools/soedit/modelindex.js): `target` goes unchanged to every route of
//        the page (stage, doc/open, viewer/scene, ...): a def key, breed:<key>, an .mdl key, a disk path or pak:<pak>!<entry>.
// The index (tools/soedit/modelindex.js build, about 2 s for the game + a large mod) is kept in memory and in the per-user cache file,
// keyed by game + mod folder + what changed there (modelindex.sig, checked at most every SIG_MS). A new index is built by
// `soedit index` through ctx.runTool (a child process, so the server keeps answering); a search waits for it up to WAIT_MS
// (ctx.findWaitMs in tests), then answers { building: true } and the next search picks the finished index up.
// Refusals: status 400 with a plain sentence. The mod check is the Units page's modOf (the mod is optional for both routes).
// Game (../game.js): under MoW:AS2 the index is built with --exe mowas_2 (in process: exe 'mowas_2'), folder lists read with that exe,
// and the memory entry and the cache file carry the game, so AS64 and MoW:AS2 (one shared install) never share a list. Under AS64 the
// argument list, the memory key and the cache file stay as they were. Under Gates of Hell both routes read the GoH install (exe goh, its own cache file).
// Author: Imperator_Aug (ARSENAL, ia-f586d2d7)
'use strict';
const fs = require('fs'), path = require('path');
const MI = () => require('../../../../soedit/modelindex');
const G = require('../game');

const bad = msg => { throw Object.assign(new Error(msg), { status: 400 }); };
const WAIT_MS = 3000, BUILD_MS = 300000, FOLDER_MAX = 20000;   // the page keeps the whole list and filters inside it (it draws 200 rows at a time)
const gameOpt = (ctx, b) => G.gameDir(ctx, b);   // the open game's own install (GoH: the GoH folder)
function modOpt(ctx, b, game) { return require('../../units/server').lib.modOf(b, game, false); }
function gameNeed(ctx, b) {
  const g = gameOpt(ctx, b);
  if (!g) bad('No game folder is set. Pick the game folder at the top of the page.');
  return g;
}

// ---------- the index ----------
const UL = () => require('../../units/server').lib;
const MEM = new Map();   // game|mod (|exe under MoW:AS2) -> { sig (the stamps of ix, as text), ix, job, error }
function entry(game, mod, exe) {
  const id = (game + '|' + (mod || '') + (exe ? '|' + exe : '')).toLowerCase();
  if (!MEM.has(id)) MEM.set(id, { sig: null, ix: null, job: null, error: null });
  return MEM.get(id);
}
// the scratch file a child build of game + mod writes (next to the command line's cache file, never that file itself); another
// game than AS64 gets its own (modelindex.cacheFile hashes the exe in)
function cacheOf(game, mod, exe) { return (exe ? MI().cacheFile(game, mod, [], exe) : MI().cacheFile(game, mod, [])).replace(/\.json$/, '') + '.gui-' + process.pid + '.json'; }
// what names and dates the list of game + mod in the store; T = the mod's tree (null without a mod)
function identOf(game, mod, exe, T) {
  const stamps = MI().stamps(game, T, exe, mod);
  return { parts: MI().parts(game, mod, exe), stamps, sig: JSON.stringify(stamps) };
}
const storeOf = ctx => UL().storeOf(ctx);
const keep = (ctx, id, ix) => { try { storeOf(ctx).put(MI().SECTION, MI().VERSION, id.parts, id.stamps, ix); } catch (e) { /* best effort: the list stays in memory */ } };
// build in a child process (soedit index --out <cache file>), or in process when the page runs without ctx.runTool
function startBuild(ctx, e, game, mod, id, exe) {
  const file = cacheOf(game, mod, exe), sg = require('crypto').createHash('sha1').update(id.sig).digest('hex');
  // JOBS: the build outlives the search request that started it (the search answers "being built" after WAIT_MS), so it is a
  // background job of its own: listed in the footer by name, stoppable there, and not killed when that one request ends or is stopped
  const h = ctx.runTool && ctx.jobs && typeof ctx.jobs.add === 'function'
    ? ctx.jobs.add({ kind: 'bg', what: 'models.job.index', page: 'models', game: typeof ctx.gameId === 'function' ? ctx.gameId() : '', cancel() { /* the child is attached below */ } }) : null;
  const end = st => { if (h) h.end(h.cancelled ? 'cancelled' : st); };
  const run = ctx.runTool
    ? ctx.runTool('soedit', 'soedit/soedit.js', ['index', '--game', game].concat(mod ? ['--mod', mod] : [], exe ? ['--exe', exe] : [], ['--out', file, '--sig', sg]), Object.assign({ timeoutMs: BUILD_MS }, h ? { job: h } : {}))
      .then(r => {
        if (r && r.cancelled) throw new Error('The model list build was stopped. Search again to build it.');
        const ix = MI().load(file);
        try { fs.rmSync(file, { force: true }); } catch (x) { /* scratch file stays */ }
        if (!ix) throw new Error(((r && (r.stdout || r.stderr)) || '').trim().split('\n').pop() || 'The model list could not be built.');
        return ix;
      })
    : new Promise(res => setImmediate(res)).then(() => MI().build(Object.assign({ game, mods: [], modDir: mod, sig: sg }, exe ? { exe } : {})));
  e.job = run.then(ix => { end('done'); keep(ctx, id, ix); e.ix = ix; e.sig = id.sig; e.error = null; e.job = null; return ix; },
    err => { end('failed'); e.error = String((err && err.message) || err).split('\n')[0]; e.job = null; return null; });
  return e.job;
}
// the index for game + mod: { ix } ready, or { building } while a build runs past the wait
// fast (the search box): the mod's last known tree is taken while a new walk runs (units lib modTree), so a search never waits
// for a walk it has already seen once; the walk's answer serves the next search. Prepare asks without fast.
async function indexFor(ctx, game, mod, exe, fast) {
  const e = entry(game, mod, exe);
  const id = identOf(game, mod, exe, mod ? await UL().modTree(ctx, mod, !!fast) : null);
  if (e.ix && e.sig === id.sig) return { ix: e.ix };
  if (!e.job) {
    const hit = storeOf(ctx).get(MI().SECTION, MI().VERSION, id.parts, id.stamps), disk = hit && hit.value;
    if (disk && disk.meta && Array.isArray(disk.rows)) { e.ix = disk; e.sig = id.sig; return { ix: disk }; }
    // the list of an older state of the mod, kept in the store from an earlier run: the search answers from it while the new one is built
    if (fast && !e.ix) { try { const old = storeOf(ctx).getLast(MI().SECTION, MI().VERSION, id.parts), v = old && old.value; if (v && v.meta && Array.isArray(v.rows)) e.old = v; } catch (x) { /* no last list */ } }
    e.error = null;
    startBuild(ctx, e, game, mod, id, exe);
  }
  // the search box never waits for a build when an older list can answer (the page shows it marked and asks again)
  if (fast && (e.ix || e.old)) return { building: true, stale: e.ix || e.old };
  const wait = ctx.findWaitMs != null ? ctx.findWaitMs : WAIT_MS;
  const ix = await Promise.race([e.job, new Promise(r => setTimeout(() => r(undefined), wait))]);
  if (ix) return { ix };
  if (ix === null) return { error: e.error || 'The model list could not be built.' };
  return { building: true, stale: e.ix || e.old || null };
}

function kindOf(v) {
  const k = String(v == null || v === '' ? 'all' : v).trim().toLowerCase();
  if (!MI().KINDS.includes(k)) bad('The kind must be all, vehicle, human, object, breed or model.');
  return k;
}
// the Units page's common-name folding ("Panzer IV H" = "PzKpfw IV Ausf.H"), so a display name is found the way Units finds it.
// modelindex.search drops a folded query under 4 letters and matches it only from a word start of the display name.
// TODO: canon belongs in a shared lib (tools/lib), not in the Units server's test export
function canonOf() { try { return require('../../units/server')._t.canon || null; } catch (e) { return null; } }
function limitOf(v) {
  if (v == null || v === '') return 40;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) bad('The limit must be a number from 1 to 200.');
  return Math.min(200, Math.floor(n));
}

async function find(ctx, b) {
  const game = gameNeed(ctx, b), mod = modOpt(ctx, b, game);
  const q = String(b.q == null ? '' : b.q).trim();
  if (!q) bad('Type part of a name to search for.');
  if (q.length > 200 || /[\x00-\x1f]/.test(q)) bad('The search text is too long or holds control characters.');
  const kind = kindOf(b.kind), limit = limitOf(b.limit);
  const got = await indexFor(ctx, game, mod, G.exeOpt(ctx, b), true);
  if (got.error) return { total: 0, results: [], didYouMean: [], building: false, note: got.error };
  if (got.building && !got.stale) return { total: 0, results: [], didYouMean: [], building: true, note: 'The model list is being built (a few seconds the first time). Search again in a moment.' };
  const r = MI().search((got.ix || got.stale).rows, q, { kind, limit, canon: canonOf() });
  return { total: r.total, results: r.results, didYouMean: r.didYouMean, building: !!got.building,
    note: got.building ? 'Files changed: the model list is being rebuilt, these results are from the last list.' : '' };
}

// the page is shown: start (or find) the model list now, so the first typed word does not pay for it. Never waits for a build
async function warm(ctx, b) {
  let game; try { game = gameNeed(ctx, b); } catch (e) { return { state: 'na' }; }
  const mod = modOpt(ctx, b, game), c = Object.create(ctx); c.findWaitMs = 0;
  const got = await indexFor(c, game, mod, G.exeOpt(ctx, b), true);
  return { state: got.error ? 'failed' : got.building ? 'building' : 'ready' };
}

async function folder(ctx, b) {
  const game = gameOpt(ctx, b), mod = modOpt(ctx, b, game);
  const p = String(b.path == null ? '' : b.path).trim();
  if (!p) bad('Type the folder (or .pak file) to list.');
  if (/[\x00-\x1f]/.test(p)) bad('The folder name holds control characters.');
  if (!path.isAbsolute(p.replace(/^pak:/i, ''))) bad('Give the full path of the folder, for example C:/mods/mymod/resource/entity.');
  const exe = G.exeOpt(ctx, b);
  const r = MI().listFolder(Object.assign({ path: p, game, mods: [], modDir: mod, max: FOLDER_MAX }, exe ? { exe } : {}));
  if (r.error) bad(r.error);
  return r;
}

// Prepare section models.list (gui README, "Prepare sections"): the model list of the game with the mod laid on top
function prepWhere(ctx, q) {
  const g = (q && q.game) || {}, c = Object.create(ctx || {});
  if (g.id) c.gameId = () => g.id;
  if (g.dir) { c.game = () => g.dir; c.curDir = () => g.dir; }
  const game = gameNeed(c, {}), mod = q && q.mod ? path.resolve(String(q.mod)) : null;
  return { c, game, mod, exe: G.exeOpt(c, {}) };
}
function prepState(ctx, q) {
  let w; try { w = prepWhere(ctx, q); } catch (e) { return { state: 'na', why: [], note: e.message }; }
  const T = w.mod ? ((w.c.modtree || require('../../../../lib/modtree')).last(w.mod)) : null;
  if (w.mod && !T) return { state: 'none', why: ['mod'] };
  const id = identOf(w.game, w.mod, w.exe, T);
  return storeOf(w.c).state(MI().SECTION, MI().VERSION, id.parts, id.stamps);
}
async function prepRun(ctx, q, job) {
  const w = prepWhere(ctx, q), set = o => { if (job && typeof job.set === 'function') job.set(o); };
  set({ stage: 'list', done: 0, total: 1 });
  for (let i = 0; i < 4; i++) {   // a build that began for an older state of the mod ends first, then the one for this state
    const got = await indexFor(w.c, w.game, w.mod, w.exe);
    if (got.error) throw new Error(got.error);
    if (got.ix) break;
    const e = entry(w.game, w.mod, w.exe);
    if (e.job) await e.job;
    if (job && job.cancelled) return;
  }
  set({ stage: 'done', done: 1, total: 1 });
}
const prep = [{ id: 'models.list', title: 'models.prep.list', needs: ['mod.tree'], areas: ['entity', 'set', 'interface', 'text', 'pak', 'other'], state: prepState, run: prepRun }];

const wrap = fn => async (url, body, ctx) => fn(ctx || {}, body || {});
module.exports = {
  routes: { 'POST /api/x/models/find': wrap(find), 'POST /api/x/models/folder': wrap(folder), 'POST /api/x/models/warm': wrap(warm) },
  prep,
  _t: { MEM, indexFor, entry, cacheOf },
};
