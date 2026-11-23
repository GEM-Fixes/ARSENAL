// ext task: routes under /api/x/task/ (contract: ./README.md "Server"). GET routes read only and are open to LAN Remote (the list is
// index.js `remote`); every POST refuses a request from another device on the network (ctx.session.remote) on top of remote.js.
// Writes go only through lib/compile.js (picked mod only, restore point first). Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-27497e94)
'use strict';
const fs = require('fs'), path = require('path');
const D = require('./lib/draft'), RC = require('./lib/recipe'), CP = require('./lib/compile'), GM = require('./lib/game');

// every task of section 3; a recipe file that exists overrides its row (verbs, games, needs, order)
const PLANNED = [
  ['mod', ['make'], ['as64', 'mowas2', 'goh']], ['vehicle', ['make', 'change'], ['as64', 'mowas2']], ['soldier', ['make', 'change'], ['as64', 'mowas2']],
  ['squad', ['make', 'change'], ['as64', 'mowas2']], ['gun', ['make', 'change'], ['as64', 'mowas2']], ['ammo', ['make', 'change'], ['as64', 'mowas2']],
  ['item', ['make', 'change'], ['as64', 'mowas2']], ['skin', ['make', 'change'], ['as64', 'mowas2']], ['icon', ['make', 'change'], ['as64', 'mowas2']],
  ['sound', ['make', 'change'], ['as64', 'mowas2']], ['voice', ['make', 'change'], ['as64', 'mowas2']], ['army', ['make', 'change'], ['as64', 'mowas2']],
  ['map', ['make', 'change'], ['as64', 'mowas2']], ['mission', ['make', 'change'], ['as64', 'mowas2']], ['bots', ['make', 'change'], ['as64', 'mowas2']],
  ['text', ['make', 'change'], ['as64', 'mowas2']], ['model', ['make', 'change'], ['as64', 'mowas2']], ['prices', ['change'], ['as64', 'mowas2']],
  ['armour', ['change'], ['as64', 'mowas2']], ['upgrade', ['change'], ['as64', 'mowas2', 'goh']], ['gohunit', ['make'], ['as64', 'mowas2', 'goh']],
  ['fixmod', ['change'], ['as64', 'mowas2', 'goh']], ['release', ['make'], ['as64', 'mowas2']], ['x-thing', ['explore'], ['as64', 'mowas2']],
  ['x-mod', ['explore'], ['as64', 'mowas2', 'goh']], ['x-log', ['explore'], ['as64', 'mowas2', 'goh']], ['x-limits', ['explore'], ['as64', 'mowas2', 'goh']],
].map((r, i) => ({ id: r[0], verbs: r[1], games: r[2], needs: [], order: (i + 1) * 10, title: 'task.cat.' + r[0] }));

// picker kind -> the type codes (view/server guess) a staged file may have
const FILE_TYPES = {
  sound: ['wav', 'ogg'], texture: ['dds', 'tga', 'png', 'jpg', 'bmp'], picture: ['dds', 'tga', 'png', 'jpg', 'bmp', 'psd', 'gif'],
  model: ['ply', 'anm', 'vol'], text: ['text', 'utf16'], video: ['avi'], font: ['bmfont'], any: null,
};
// lookup kind -> file extensions over the game's view (game plus mods)
const FILE_EXTS = { sound: ['wav', 'ogg'], texture: ['dds', 'tga', 'png'], model: ['mdl', 'ply'], icon: ['dds', 'tga', 'png'], text: ['lng', 'txt', 'xml'] };
const UPLOAD_MAX = 64 << 20, CHUNK_MAX = 6 << 20;

let RECIPES = {}, ROUTES = {}, FAULTS = {};
// list: the recipes that loaded; faults: [{id, error}] recipes that failed to load (index.js), shown greyed in the catalogue. A recipe
// whose route name is wrong is not taken (it joins the faults, logged). Every recipe POST route refuses LAN Remote before it runs.
function setRecipes(list, faults) {
  RECIPES = {}; ROUTES = {}; FAULTS = {};
  for (const x of faults || []) if (x && x.id) FAULTS[x.id] = String(x.error || 'fault');
  for (const r of list) {
    if (!r || !r.id) continue;
    const own = {};
    let fault = null;
    for (const [k, f] of Object.entries(r.routes || {})) {
      if (!new RegExp('^(GET|POST) /api/x/task/r/' + r.id + '/[a-z0-9/_-]+$').test(k)) { fault = 'route ' + k + ' must be under /api/x/task/r/' + r.id + '/'; break; }
      if (typeof f !== 'function') { fault = 'route ' + k + ' is not a function'; break; }
      own[k] = k.startsWith('POST ') ? guardPost(withTask(f), f) : withTask(f);
    }
    if (fault) { FAULTS[r.id] = fault; console.error('ext task: recipe ' + r.id + ' skipped: ' + fault); continue; }
    RECIPES[r.id] = r; Object.assign(ROUTES, own);
  }
  return Object.keys(FAULTS);
}
function guardPost(f, raw) { const g = async (u, b, ctx) => { noRemote(ctx); return f(u, b, ctx); }; g.raw = raw || f; return g; }
// a recipe's own route gets the task's game (README "The game of a task"): the draft named by body.draft or ?draft=, else ?game=,
// else the request's: ctx.task and ctx.routeCtx(), with gameId() exe() kind() curDir() answering for that game
function withTask(f) {
  const g = async (u, b, ctx) => {
    let d = null; const id = (b && typeof b === 'object' && b.draft) || q(u, 'draft');
    if (id && typeof id === 'string') { try { d = D.load(ctx, id); } catch { d = null; } }
    return f(u, b, GM.lookCtx(ctx, GM.of(ctx, d && d.game ? d.game : q(u, 'game') || null)));
  };
  g.raw = f; return g;
}
// the game of a lookup or a values call: the draft's (?draft=), else ?game=, else the request's (the page's game header)
function gameOfReq(ctx, u) {
  let d = null; const id = q(u, 'draft');
  if (id) { try { d = D.load(ctx, id); } catch { d = null; } }
  return GM.of(ctx, d && d.game ? d.game : q(u, 'game') || null);
}
// SPEED: a lookup, a value read, a plan, a write and a check read the game view of the task's game + mod (lib/game.js view) through
// sync code. warm waits for the mod's shared scan first (GM.warm: not blocking), so that view is not made by a walk of the mod.
// mod and game: ?mod= / ?game=, else the draft's. Never throws: the route itself says what is wrong.
async function warm(ctx, u, b) {
  try {
    let d = null; const id = q(u, 'draft') || (b && typeof b.draft === 'string' ? b.draft : '');
    if (id) { try { d = D.load(ctx, id); } catch { d = null; } }
    const mod = q(u, 'mod') || (d && typeof d.mod === 'string' ? d.mod : '');
    if (mod) await GM.warm(ctx, GM.of(ctx, d && d.game ? d.game : q(u, 'game') || null), mod);
  } catch { /* the route says it */ }
}
const warmed = fn => async (u, b, ctx) => { await warm(ctx, u, b); return fn(u, b, ctx); };
const faults = () => Object.assign({}, FAULTS);
const recipes = () => RECIPES;

const bad = (m, s) => D.bad(m, s);
const q = (u, k) => (u && u.searchParams ? u.searchParams.get(k) || '' : '');
function noRemote(ctx) { if (ctx && ctx.session && ctx.session.remote) throw Object.assign(bad('view only on this device', 403), { key: 'rmt.viewOnly' }); }
function recipeOf(id) { const r = RECIPES[id]; if (!r) throw D.badK(FAULTS[id] ? 'task.e.fault' : 'task.e.notBuilt', FAULTS[id] ? 'The task ' + id + ' has a fault: ' + FAULTS[id] : 'The task ' + id + ' is not built yet.', 404); return r; }
function findQ(recipe, qid) { for (const g of recipe.groups || []) for (const x of g.q || []) if (x.id === qid) return x; return null; }

function catalogue(u, b, ctx) {
  const game = q(u, 'game');
  // the plan's order always (a planned row keeps its place whatever order its recipe says); a loaded recipe is built: true, so the
  // drop-down shows it at once; a recipe outside the plan goes after the planned rows, by its own order
  const rows = PLANNED.map(p => {
    const r = RECIPES[p.id];
    const o = r ? Object.assign({ id: r.id, verbs: r.verbs, games: r.games, needs: r.needs || [], order: p.order, title: RC.titleKey(r), titles: RC.titles(r), built: true }, r.na ? { na: Object.assign({}, r.na) } : {})
      : Object.assign({}, p, { built: false }, FAULTS[p.id] ? { fault: FAULTS[p.id] } : {});
    o.forGame = !game || o.games.includes(game);
    return o;
  });
  const last = PLANNED.length * 10;
  for (const r of Object.values(RECIPES)) if (!rows.some(x => x.id === r.id)) rows.push(Object.assign({ id: r.id, verbs: r.verbs, games: r.games, needs: r.needs || [], order: last + 1 + (typeof r.order === 'number' ? Math.max(0, r.order) : 999), title: RC.titleKey(r), titles: RC.titles(r), built: true, forGame: !game || r.games.includes(game) }, r.na ? { na: Object.assign({}, r.na) } : {}));
  for (const [id, why] of Object.entries(FAULTS)) if (!rows.some(x => x.id === id)) rows.push({ id, verbs: [], games: [], needs: [], order: last + 2000, title: 'task.cat.' + id, built: false, fault: why, forGame: true });
  // a single-player mission: no recipe, a page row (the single-player card on Maps & Missions > Missions), right after the mission task
  const mo = rows.find(x => x.id === 'mission'), spG = ['as64', 'mowas2'];
  rows.push({ id: 'spmission', verbs: ['make'], games: spG, needs: [], order: (mo ? mo.order : last) + 0.5, title: 'task.cat.spmission', built: true, page: { tab: 'missions', flag: 'missionsSp' }, forGame: !game || spG.includes(game) });
  rows.sort((a, c) => a.order - c.order);
  let drafts = 0; try { drafts = D.list(ctx).length; } catch { /* no folder */ }
  return { verbs: RC.VERBS, recipes: rows, drafts };
}

function recipeRoute(u) {
  const r = recipeOf(q(u, 'id'));
  return RC.forPage(r);
}

// ---------- lookups
const LOOKMAX = 5000;
async function lookup(u, b, ctx) {
  // limit: 50 when not asked, at most LOOKMAX (total says the rest)
  const kind = q(u, 'kind'), words = q(u, 'q').trim(), mod = q(u, 'mod'), recipe = q(u, 'recipe'), limit = Math.min(LOOKMAX, Math.max(1, Number(q(u, 'limit')) || 50));
  const res = (results, extra) => Object.assign({ kind, q: words, results: results.slice(0, limit), total: results.length, more: results.length > limit }, extra || {});
  const filter = filterOf(q(u, 'filter')), tg = gameOfReq(ctx, u);
  if (recipe && RECIPES[recipe] && RECIPES[recipe].lookups && typeof RECIPES[recipe].lookups[kind] === 'function') {
    // a recipe lookup returns a list, or {results, state ('running' while it still reads the game files: the page waits and asks
    // again), exact, why, ...}; opt carries the question's in (the answer of the question picker.in names) and filter (picker.filter)
    // ctx: the route ctx of the task's game + {mod, task, routeCtx()}; opt.game = the task's game id
    const call = w => RECIPES[recipe].lookups[kind](GM.lookCtx(ctx, tg, { mod }), w, { mod, in: q(u, 'in'), filter, limit, game: tg.id, q: w, draft: q(u, 'draft') });
    const r = await call(words);
    let list = Array.isArray(r) ? r : r && Array.isArray(r.results) ? r.results : [];
    const extra = r && !Array.isArray(r) && typeof r === 'object' ? Object.assign({}, r) : {};
    delete extra.results;
    if (extra.exact == null) extra.exact = list.some(x => x && String(x.id).toLowerCase() === words.toLowerCase());
    // a result with only an id gets the name a player sees from the game texts (textName); the words then match that name too: the
    // lookup is asked once more with no words and its unnamed results are kept when every word is in the id, the name or the place
    const T = (list.some(unnamed) || (words && !list.length)) && extra.state !== 'running' ? await textNames(ctx, mod, tg) : new Map();
    if (T.size) {
      list = list.map(x => named(x, T));
      const ws = words.toLowerCase().split(/[\s,]+/).filter(Boolean);
      if (ws.length) {
        let all = []; try { const ra = await call(''); all = Array.isArray(ra) ? ra : ra && Array.isArray(ra.results) ? ra.results : []; } catch { /* the first answer stands */ }
        const have = new Set(list.map(x => x && String(x.id)));
        for (const x of all.slice(0, 20000)) {
          if (!x || have.has(String(x.id)) || !unnamed(x)) continue;
          const y = named(x, T), hay = [y.id, y.name, y.where, y.sub].map(v => String(v == null ? '' : v).toLowerCase()).join(' | ');
          if (y.name !== x.name && ws.every(w => hay.includes(w))) { list.push(y); have.add(String(x.id)); }
        }
      }
    }
    return res(list, extra);
  }
  if (kind === 'modfolder') return modfolder(ctx, u, words, res, tg);
  if (kind === 'entity') return entity(GM.routeCtx(ctx, tg), mod, words, res, filter);
  if (kind === 'map') return maps(GM.routeCtx(ctx, tg), u, words, res);
  if (kind === 'file' || FILE_EXTS[kind]) {
    let exts = kind === 'file' ? q(u, 'ext').toLowerCase().split(',').map(s => s.trim().replace(/^\./, '')).filter(Boolean) : FILE_EXTS[kind];
    if (kind === 'text' && tg.kind === 'goh') exts = exts.concat(['pot', 'po']);   // GoH texts are gettext files (GHLOC-01)
    return files(ctx, mod, words, exts, res, tg);
  }
  throw bad('No lookup ' + kind, 404);
}
// ---------- names a player sees, for lookup results that carry only an id
// The key forms tried, in order (modweb localization/keys.md [V]): the result's own `text` (a key), then desc/entity/<id> (vehicles,
// guns), desc/human/mp/<id> (soldiers), desc/squad/<id> (squad cards), desc/weapon/<id>, desc/stuff/<id>, desc/ammo/<id> (stuff tags)
const TEXT_FORMS = ['desc/entity/', 'desc/human/mp/', 'desc/squad/', 'desc/weapon/', 'desc/stuff/', 'desc/ammo/'];
const unnamed = x => !!x && (x.name == null || x.name === '' || String(x.name) === String(x.id));
function textName(T, x) {
  if (!x) return '';
  const id = String(x.id == null ? '' : x.id).toLowerCase();
  const ks = (typeof x.text === 'string' && x.text ? [x.text.toLowerCase()] : []).concat(id ? TEXT_FORMS.map(f => f + id) : []);
  for (const k of ks) { const t = T.get(k); if (t) return t; }
  return '';
}
const named = (x, T) => { if (!unnamed(x)) return x; const n = textName(T, x); return n ? Object.assign({}, x, { name: n }) : x; };
// key (lower case) -> first line of the text, from the .lng files of the game view (the mod's view when a mod is given): '#' files
// first, plain ones after (they win, LOC-19 [I]); only desc/ keys. Cached per view; a phone reads only what remoteRead allows.
// tg: the task's game (lib/game.js); its view. GoH has no .lng: its texts are .pot files under the same folder, key = msgctxt in
// lower case, the msgid shown (an empty msgstr shows the msgid, GHLOC-06 [V]; the default language layer, GHLOC-01 [V])
const _texts = new WeakMap();
async function textNames(ctx, mod, tg) {
  const out = new Map();
  tg = tg || GM.of(ctx, null);
  let L, vf; try { L = require('../files/lib'); vf = await GM.viewAsync(ctx, tg, mod ? L.readMod(GM.routeCtx(ctx, tg), mod) : null); } catch { return out; }
  if (!vf || !vf.v || !vf.v.files) return out;
  if (!L.isRemote(ctx) && _texts.has(vf.v)) return _texts.get(vf.v);
  let lp, V; try { lp = require('../../../upgrade/lib/lngpot'); V = require('../../../lib/vfs'); } catch { return out; }
  const pre = 'resource/interface/text/', ks = [], pot = tg.kind === 'goh', ext = pot ? /\.pot$/ : /\.lng$/;
  for (const k of vf.v.files.keys()) if (k.startsWith(pre) && ext.test(k)) ks.push(k);
  const rel = k => k.slice(pre.length), hash = k => (rel(k).split('/').pop().startsWith('#') ? 0 : 1);
  ks.sort((a, c) => hash(a) - hash(c) || (a < c ? -1 : 1));
  for (const k of ks) {
    const rec = vf.v.files.get(k);
    if (!rec || rec.deleted || (rec.size || 0) > (16 << 20)) continue;
    let kv; try { L.remoteRead(ctx, L.recFile(rec)); kv = pot ? potTexts(lp, V.readRec(rec)) : lp.lngKeys(V.readRec(rec), rel(k)); } catch { continue; }
    for (const [key, t] of kv) if (/^desc\//i.test(key)) { const s = String(t).replace(/<[^>]*>/g, '').replace(/\\n/g, '\n').split('\n')[0].trim(); if (s) out.set(key.toLowerCase(), s); }
  }
  if (!L.isRemote(ctx)) _texts.set(vf.v, out);
  return out;
}
// a .pot file -> [[key, text]]: the msgid unescaped (lngpot potKeys keeps the escapes raw); a UTF-8 BOM is skipped
function potTexts(lp, buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3);
  return lp.potKeys(buf.toString('utf8')).map(([k, t]) => [k, String(t).replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))]);
}
// picker.filter / base.filter as the page sends it (JSON in the query); a bad one reads as none
function filterOf(s) { if (!s) return null; try { const o = JSON.parse(s); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; } }
function modfolder(ctx, u, words, res, tg) {
  // the mods folder of the task's game: the AS2 install's, or the GoH install's under goh (read only: listing it writes nothing)
  const g = tg ? tg.dir : ctx.game && ctx.game(), dir = q(u, 'in') || (g ? path.join(g, 'mods') : '');
  if (!dir || !path.isAbsolute(dir)) return res([], { exact: false, in: dir });
  if (ctx.pathOk && !ctx.pathOk(path.resolve(dir))) throw Object.assign(bad('view only on this device', 403), { key: 'rmt.viewOnly' });
  let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { /* not there yet */ }
  const lw = words.toLowerCase(), hit = names.filter(n => !lw || n.toLowerCase().includes(lw)).sort();
  return res(hit.map(n => ({ id: n, name: n, where: dir, ref: { path: path.join(dir, n) }, sub: '' })), { exact: names.some(n => n.toLowerCase() === lw), in: dir });
}
// filter: {kind, army} (a value or a list each) keeps only the units that match
async function entity(ctx, mod, words, res, filter) {
  const U = require('../units/server');
  const r = await U.routes['POST /api/x/units/search'](null, { q: words, mod: mod || undefined, all: true, limit: 200 }, ctx);
  const fit = (x, k) => { if (!filter || filter[k] == null) return true; const w = [].concat(filter[k]).map(v => String(v).toLowerCase()); return w.includes(String(x[k] || '').toLowerCase()); };
  const out = (r.results || []).filter(x => fit(x, 'kind') && fit(x, 'army')).map(x => ({ id: x.id, name: x.name || x.id, where: x.army || '', ref: { entity: x.id }, sub: [x.kind, x.cost != null ? x.cost : ''].filter(v => v !== '' && v != null).join(' ') }));
  return res(out, { exact: out.some(x => String(x.id).toLowerCase() === words.toLowerCase()), didYouMean: r.didYouMean || null });
}
// GET /api/x/maps/list -> {state: 'running', elapsed} | {state: 'error', error, detail} | {state: 'done', cached, at, maps: [{key
// ('map/multi/2v2_bastogne'), modes, mod (the mod that has it, '' = the game), folder, name (the title from mission.lng, else from the
// folder), players, mods: [ids], copy (false: lives only in a mod pak, map-clone cannot copy it)}]}; it throws when no game folder is set
async function maps(ctx, u, words, res) {
  const M = require('../maps');
  let r; try { r = await M.routes['GET /api/x/maps/list'](new URL('http://127.0.0.1/api/x/maps/list'), null, ctx); }
  catch (e) { return res([], { state: 'nogame', exact: false, why: e.message }); }
  if (!r || r.state === 'running') return res([], { state: 'running', exact: false });
  if (r.state !== 'done') return res([], { state: 'error', exact: false, why: (r && (r.error || r.detail)) || '' });
  const ws = words.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const hay = m => [m.key, m.name, m.folder].map(x => String(x || '').toLowerCase()).join(' ');
  const out = (r.maps || []).filter(m => m && m.key && ws.every(w => hay(m).includes(w))).map(m => {
    const folder = m.folder || String(m.key).split('/').pop(), where = (m.mods && m.mods.length ? m.mods.join(', ') : m.mod) || 'game';
    return { id: m.key, name: m.name || folder, where, ref: { key: 'resource/' + m.key + '/map.info' },
      sub: [folder, (m.modes || []).join(' '), m.players ? m.players + 'p' : ''].filter(Boolean).join('  '), players: m.players || 0, modes: m.modes || [], copy: m.copy !== false };
  });
  const lw = words.trim().toLowerCase();
  return res(out, { state: 'done', exact: !!lw && (r.maps || []).some(m => String(m.key).toLowerCase() === lw || String(m.folder || '').toLowerCase() === lw) });
}
async function files(ctx, mod, words, exts, res, tg) {
  const vf = await GM.viewAsync(ctx, tg || GM.of(ctx, null), mod || '');
  if (!vf.v) return res([], { state: 'nogame' });
  const ws = words.toLowerCase().split(/[\s,]+/).filter(Boolean), out = [];
  for (const [key, rec] of vf.v.files) {
    const e = key.slice(key.lastIndexOf('.') + 1);
    if (exts.length && !exts.includes(e)) continue;
    if (ws.length && !ws.every(w => key.includes(w))) continue;
    out.push({ id: key, name: key.split('/').pop(), where: rec.layer || '', ref: { key }, sub: key });
    if (out.length > 5000) break;
  }
  out.sort((a, c) => a.id.length - c.id.length || (a.id < c.id ? -1 : 1));
  return res(out, { exact: out.some(x => x.id === words.toLowerCase()) });
}

async function values(u, b, ctx) {
  const id = q(u, 'draft');
  const d = id ? D.load(ctx, id) : { recipe: q(u, 'recipe'), mod: q(u, 'mod'), game: q(u, 'game'), base: { id: q(u, 'base') } };
  const r = recipeOf(d.recipe);
  return { values: await CP.valuesOf(ctx, r, d) };
}

// ---------- drafts
function draftNew(u, b, ctx) {
  noRemote(ctx);
  const r = recipeOf(String(b.recipe || ''));
  const verb = r.verbs.includes(b.verb) ? b.verb : r.verbs[0];
  return { draft: D.save(ctx, { id: D.newId(r.id), recipe: r.id, verb, game: String(b.game || (ctx && typeof ctx.gameId === 'function' ? GM.of(ctx, null).id : '')), mod: String(b.mod || ''), base: b.base || null, answers: {}, kept: [], mode: b.mode === 'all' ? 'all' : 'quick', asked: [], state: 'open' }) };
}
function draftSave(u, b, ctx) {
  noRemote(ctx);
  const d = b && b.draft;
  if (!d || !d.id) throw bad('Nothing to save.');
  recipeOf(String(d.recipe || ''));
  if (d.parent && d.parent.draft && !D.exists(ctx, d.parent.draft)) throw D.badK('task.e.parentGone', 'The task this branch belongs to is gone.', 404);
  return { draft: D.save(ctx, d) };
}
function draftGet(u, b, ctx) {
  const d = D.load(ctx, q(u, 'id'));
  return { draft: d, children: D.childrenOf(ctx, d.id).map(c => ({ id: c.id, recipe: c.recipe, q: c.parent && c.parent.q, state: c.state, title: c.title || '' })) };
}
// Throw away: what an outside program saved into the mod still gets its restore points (the copy kept before it opened)
function draftDelete(u, b, ctx) { noRemote(ctx); const id = String(b && b.id || ''); let g = null; try { g = CP.extGuardClose(ctx, D.checkId(id)); } catch { /* none */ } return Object.assign({ gone: D.remove(ctx, id) }, g && g.restore.length ? { restore: g.restore } : {}); }
async function draftChild(u, b, ctx) {
  noRemote(ctx);
  const p = D.load(ctx, String(b.parent || '')), pr = recipeOf(p.recipe), qq = findQ(pr, String(b.q || ''));
  if (!qq) throw bad('No question ' + b.q + ' in ' + pr.id);
  // picker.branch: one recipe id or a list (the page sends the kind the user picked as body.recipe); a recipe outside the list is refused
  const ids = RC.branchIds(qq.picker);
  if (!ids.length) throw bad('The question ' + qq.id + ' opens no branch.');
  let want;
  if (b.recipe != null && b.recipe !== '') {
    want = String(b.recipe);
    if (!ids.includes(want)) throw D.badK('task.e.kindNot', 'The question ' + qq.id + ' does not open a ' + want.slice(0, 40) + ' task (it opens ' + ids.join(', ') + ').');
  } else if (ids.length === 1) want = ids[0];
  else throw D.badK('task.e.kindFirst', 'Pick what kind of task to open first (' + ids.join(', ') + ').');
  recipeOf(want);
  // what goes to the child: picker.pass (fixed; picker.pass.by[<kind>] over it), then the page's pass (body.pass), then the parent
  // recipe's pass() (it wins); {for, keys, base, answers, verb}; line: the list line the branch answers. A list of kinds adds
  // recipe: the kind picked (recipe.pass gets it as opt.recipe)
  const line = Number.isInteger(b.line) && b.line >= 0 ? b.line : undefined;
  const fixed = Object.assign({}, qq.picker.pass || {}), by = fixed.by; delete fixed.by;
  const pass = Object.assign(fixed, by && by[want] && typeof by[want] === 'object' ? by[want] : {}, b.pass && typeof b.pass === 'object' && !Array.isArray(b.pass) ? b.pass : {});
  if (typeof pr.pass === 'function') {
    const more = await pr.pass(p, qq.id, CP.lookupCtx(ctx, p), { line, page: b.pass || null, recipe: want });
    if (more && typeof more === 'object') Object.assign(pass, more);
  }
  if (Array.isArray(qq.picker.branch)) pass.recipe = want;
  return { draft: D.child(ctx, p.id, qq.id, want, { line, pass: Object.keys(pass).length ? pass : null }) };
}

// ---------- the recipe's own check: recipe.check(draft, ctx) -> [{title, lines, level}] | {cards}; it runs after the built-in check
async function checkRoute(u, b, ctx) {
  noRemote(ctx);
  const d = D.load(ctx, String(b.draft || '')), r = recipeOf(d.recipe);
  if (typeof r.check !== 'function') return { cards: [], none: true };
  const j = CP.jobOf(ctx); if (j) j.set({ what: 'job.w.task', whatP: { name: CP.jobTitle(d) } });   // JOBS: the row's name (a stop: the dispatcher answers 499)
  let got;
  try { got = await r.check(d, CP.lookupCtx(ctx, d)); }
  catch (e) { return { cards: [{ title: r.id, lines: [String(e && e.message || e)], level: 'error' }], failed: true }; }
  const list = Array.isArray(got) ? got : got && Array.isArray(got.cards) ? got.cards : [];
  return { cards: list.filter(c => c && typeof c === 'object').slice(0, 100).map(c => ({ title: String(c.title || ''), lines: [].concat(c.lines || []).map(String).slice(0, 200), level: ['error', 'warn', 'info', 'ok'].includes(c.level) ? c.level : 'info' })) };
}

// ---------- upload: JSON chunks {draft, q, name, off, b64, last}; the type comes from the bytes, checked against the question's kinds
async function upload(u, b, ctx) {
  noRemote(ctx);
  const d = D.load(ctx, String(b.draft || '')), r = recipeOf(d.recipe), qq = findQ(r, String(b.q || ''));
  if (!qq || !qq.picker || !(qq.picker.sources || []).includes('file')) throw D.badK('task.e.noFile', 'This question takes no file.');
  // name: the staged name: 'a.wav'; a path inside staging ('pics/a.dds') when the question says multi (several files or a folder);
  // a list line's file goes under line<n>/
  const nm = D.stagedName(b.name);
  if (nm.includes('/') && !qq.multi && !(qq.kind === 'list' && /^line\d+\/[^/]+$/.test(nm))) throw D.badK('task.e.oneFile', 'This question takes one file, not a folder.');
  const f = D.stagedPath(ctx, d.id, nm), off = Number(b.off) || 0, buf = Buffer.from(String(b.b64 || ''), 'base64');
  if (buf.length > CHUNK_MAX) throw bad('A chunk is too big.', 413);
  if (off + buf.length > UPLOAD_MAX) { try { fs.unlinkSync(f + '.part'); } catch { /* none */ } throw D.badK('task.up.big', 'The file is over 64 MB.', 413); }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const part = f + '.part';
  if (off === 0) fs.writeFileSync(part, buf);
  else {
    let have = -1; try { have = fs.statSync(part).size; } catch { /* none */ }
    if (have !== off) throw D.badK('task.e.lost', 'The upload lost its place; send the file again.', 409);
    fs.appendFileSync(part, buf);
  }
  if (!b.last) return { name: nm, got: off + buf.length, done: false };
  fs.renameSync(part, f);
  const all = fs.readFileSync(f), check = sniff(all, path.basename(f), qq.picker.kinds || ['any']);
  // a recipe's own content check for kinds the core does not know: picker.check({name, type, size, bytes, facts}) gives nothing
  // when the file is fine, else a reason (a lang key of the recipe, {key, params}, or plain words); it runs only on files the core took
  if (check.ok && typeof qq.picker.check === 'function') {
    let got = null;
    try { got = await qq.picker.check({ name: path.basename(f), type: check.type, size: all.length, bytes: all, facts: check.facts }); }
    catch (e) { got = String(e && e.message || e); }
    if (got) {
      check.ok = false;
      if (typeof got === 'object' && got.key) { check.whyKey = String(got.key); check.whyParams = got.params || {}; check.why = String(got.why || got.key); }
      else if (typeof got === 'string' && /^[a-z][\w-]*(\.[\w-]+)+$/.test(got)) { check.whyKey = got; check.whyParams = {}; check.why = got; }
      else check.why = String(got && got.why || got);
    }
  }
  if (!check.ok) { try { fs.unlinkSync(f); } catch { /* gone */ } }
  return Object.assign({ name: nm, size: all.length, done: true }, check);
}
// kinds: picker kinds ('sound', 'model', ...) and file extensions ('.vol', '.mdl'): an extension entry takes a file by its name, since
// some game files have no mark in their bytes (a .vol reads as data); a model kind also takes .vol/.anm/.ply by name when the bytes say data
const BY_NAME = { model: ['vol', 'anm', 'ply', 'mdl'] };
// extensions whose bytes carry a mark the core knows: a file named so must hold that type (an MP3 or OGG renamed .wav is refused at once)
const SIGNED = { wav: 'wav', png: 'png', dds: 'dds', bmp: 'bmp', tga: 'tga', jpg: 'jpg', jpeg: 'jpg', ogg: 'ogg', mp3: 'mp3', psd: 'psd', gif: 'gif', avi: 'avi' };
// what to do, by the name the file has: key under task.up.do.*
const DO_BY = { wav: 'wav', ogg: 'sound', mp3: 'sound', png: 'pic', dds: 'dds', bmp: 'pic', tga: 'pic', jpg: 'pic', jpeg: 'pic', psd: 'pic', gif: 'pic', avi: 'video' };
function sniff(buf, name, kinds) {
  const V = require('../view/server');
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  let type = V.guess(buf, ext);
  // an MP3 with no ID3 tag starts with a frame sync; view's guess knows it only by the .mp3 name
  if ((type === 'data' || type === 'text') && buf.length > 3 && buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0 && (buf[1] & 0x06) !== 0) type = 'mp3';
  const exts = kinds.filter(k => /^\.[a-z0-9]{1,10}$/i.test(k)).map(k => k.slice(1).toLowerCase()), named = kinds.filter(k => !/^\./.test(k));
  const allowed = named.includes('any') ? null : [...new Set([].concat(...named.map(k => FILE_TYPES[k] || [])))];
  const byName = exts.includes(ext) || ((type === 'data' || type === 'text') && named.some(k => (BY_NAME[k] || []).includes(ext)));
  const out = { type, ok: !allowed || allowed.includes(type) || byName, facts: null, why: null, kinds };
  if (named.length === 0 && exts.length) out.ok = byName;
  const want = (allowed || []).concat(exts.map(e => '.' + e)).join(', ');
  if (!out.ok) { out.why = 'The file is ' + type + '; this step takes ' + want + '.'; out.whyKey = 'task.up.notKind'; out.whyParams = { t: type, k: want }; }
  if (SIGNED[ext] && type !== SIGNED[ext]) {
    out.ok = false; out.why = 'The file is named .' + ext + ' but inside it is ' + type + '.';
    out.whyKey = 'task.up.really'; out.whyParams = { e: ext, t: type, d: 'task.up.do.' + DO_BY[ext] };
    return out;
  }
  try {
    if (type === 'wav') { const w = require('../../../lib/wav').parse(buf); out.facts = { codec: w.fmt && w.fmt.codec, channels: w.fmt && w.fmt.channels, rate: w.fmt && w.fmt.rate, bits: w.fmt && w.fmt.bits, seconds: w.seconds, notes: (w.notes || []).slice(0, 6) }; if (!w.ok) { out.ok = false; out.why = 'The wav file could not be read.'; } }
    else if (['dds', 'png', 'jpg', 'tga', 'bmp', 'psd'].includes(type)) { const p = require('../../../lib/model/picture').facts(type, buf); out.facts = p; if (p && p.error) { out.ok = false; out.why = String(p.error); } }
  } catch (e) { out.facts = { error: e.message }; }
  return out;
}

// ---------- plan / write
async function planRoute(u, b, ctx) {
  noRemote(ctx);
  const p = await CP.plan(ctx, String(b.draft || ''), RECIPES);
  delete p.raw;
  return p;
}
// JOBS: a stopped write is answered 499 by the dispatcher whatever this returns, so what was done is kept in the draft, where the
// page reads it (GET task/draft, also after Continue): draft.stopped = {at, steps: [{name, kind, state}], changed, points, unguarded}
// and the restore points join draft.restore. The next write of the draft that is not stopped clears it.
async function writeRoute(u, b, ctx) {
  noRemote(ctx);
  const id = String(b.draft || ''), w = await CP.write(ctx, id, RECIPES);
  delete w.raw;
  if (w.written) {
    const d = D.load(ctx, id);
    d.state = 'written'; d.mod = w.mod; d.restore = (d.restore || []).concat(w.restore); delete d.stopped;
    D.save(ctx, d);
  } else {
    let d = null; try { d = D.load(ctx, id); } catch { d = null; }
    if (d && w.stopped) {
      d.restore = (d.restore || []).concat(w.restore || []);
      d.stopped = { at: new Date().toISOString(), steps: w.steps || [], changed: !!w.partial, points: (w.restore || []).length, unguarded: (w.unguarded || []).slice(0, 30) };
      D.save(ctx, d);
    } else if (d && d.stopped) { delete d.stopped; D.save(ctx, d); }
  }
  return w;
}

const routes = {
  'GET /api/x/task/catalogue': async (u, b, ctx) => catalogue(u, b, ctx),
  'GET /api/x/task/recipe': async u => recipeRoute(u),
  'GET /api/x/task/drafts': async (u, b, ctx) => ({ drafts: D.list(ctx) }),
  'GET /api/x/task/draft': async (u, b, ctx) => draftGet(u, b, ctx),
  'GET /api/x/task/lookup': warmed(lookup),
  'GET /api/x/task/values': warmed(values),
  'POST /api/x/task/draft/new': async (u, b, ctx) => draftNew(u, b || {}, ctx),
  'POST /api/x/task/draft/save': async (u, b, ctx) => draftSave(u, b || {}, ctx),
  'POST /api/x/task/draft/delete': async (u, b, ctx) => draftDelete(u, b || {}, ctx),
  'POST /api/x/task/draft/child': async (u, b, ctx) => draftChild(u, b || {}, ctx),
  'POST /api/x/task/upload': async (u, b, ctx) => upload(u, b || {}, ctx),
  'POST /api/x/task/plan': warmed(planRoute),
  'POST /api/x/task/write': warmed(writeRoute),
  'POST /api/x/task/check': warmed(async (u, b, ctx) => checkRoute(u, b || {}, ctx)),
};
// outside programs (external.js): the list (GET, read only; a phone gets no paths) and open (POST, PC only, plan then confirm)
Object.assign(routes, require('./external').routes);
// recipe routes go in through a dispatcher entry per route (index.js merges ROUTES after setRecipes)
module.exports = { routes, setRecipes, recipes, faults, recipeRoutes: () => ROUTES, filterOf, PLANNED, FILE_TYPES, FILE_EXTS, sniff, catalogue, UPLOAD_MAX, noRemote };
