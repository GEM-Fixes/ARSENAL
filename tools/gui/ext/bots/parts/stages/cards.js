// Bots page part "stages": which buy cards each army has (the "unit" box and the refusal of a unit not in that army) and the in-game names.
// Cards: every resource/set/multiplayer/units/**.set|.inc the game sees with this mod on: the game, the mods it is built on (mod.info
// Require, or the sibling mod its title names when it really holds the bot list's units: buycheck/deps.js + check.js setup) and the mod,
// each mounted with its paks and N.pat (buycheck/mount.js), so cards that live only in a pak count. A card line {"name" ...} belongs to the
// army of its s(<army>) argument, else of the file name _<army>.set; a squad macro line name(N) side(S) is the card "N(S)" of army S
// (botcheck cardNames form). A card marked {not_for_sale} is left out (milint rule). Every unit the stock 3.262 bot.data.lua names is found
// this way [V: 0 misses over 6 armies].
// Names: desc/entity/<card>, else desc/squad/<card>, from the same mount's resource/interface/text/*.lng (file name = first key part) with
// each layer's resource/localization/*.lng over them (cardrename and pricecalc use the same keys); tags like <c(..)> dropped.
// gameData(ctx): the game alone (sets + lng), for parts that want only the stock texts; read from the one shared game view (lib/gameview
// through bots/lib gameView), kept in memory while the game stamp stands.
// CACHE (gui README, contract 1): openData(ctx, mod) -> Promise {lng: Map of the desc/entity and desc/squad texts, armyNames, cached}: what
// the stage card shows at page open (unit names, lobby army names). Kept in the shared store, section 'bots.names' ver NAMES_VER, parts
// {game, gid, mod}, stamps game + mod:set, script, interface, text, pak, other (units and armies sets, the bot list, the .lng texts, paks,
// mod.info) + pool (the mods the game knows: a mod this one is built on may appear). The value also holds the mods it was built on and
// their signature (depSig, the same areas of each through lib/modtree): another signature is a miss. A caller with no store or no mod
// listing (ctx.cache / ctx.modtree) gets the answer made now, as before. openState(ctx, mod): the store state, no walk and no mount.
// Author: Imperator_Aug (ARSENAL, ia-83ba758a)
'use strict';
const path = require('path'), crypto = require('crypto');
const lib = require('../../lib');

const GAME = new Map();   // game id|dir -> {stamp, out: {sets: Map rel -> text, lng: Map key -> text}}
function gameData(ctx) {
  const G = lib.gameOf(ctx);
  if (!G.dir) return null;
  const key = G.id + '|' + path.resolve(G.dir), st = lib.gameStamp(ctx, G), c = GAME.get(key);
  if (c && c.stamp === st) return c.out;
  const out = { sets: new Map(), lng: new Map() };
  try {
    const vfs = require('../../../../../lib/vfs'), v = lib.gameView(ctx, G);
    if (v) try {
      for (const [k, r] of v.files) {
        if (/^resource\/set\/multiplayer\/units\/.+\.(?:set|inc)$/i.test(k)) out.sets.set(k.slice(9).toLowerCase(), vfs.readRec(r).toString('latin1'));
        else if (/^resource\/interface\/text\/[^/]+\.lng$/i.test(k)) { const f = k.slice(k.lastIndexOf('/') + 1); lngLeaves(vfs.readRec(r).toString('utf8'), /^#/.test(f) ? [] : [f.slice(0, -4).toLowerCase()], out.lng); }
      }
    } finally { if (vfs.closeRecs) vfs.closeRecs(); }
  } catch (e) { /* unreadable game: nothing from it */ }
  GAME.set(key, { stamp: st, out });
  return out;
}

// helper files are not armies (S17): vehicles_x.set / vehicles_xnotanks.set hold hero cards with no price or button [V: the game's sets,
// "extra" macro = score only], so no army can buy from them. The frame's list wins when it has one (lib.PSEUDO_ARMIES / lib.isArmy)
function pseudo(a) {
  a = String(a || '').toLowerCase();
  try { if (typeof lib.isArmy === 'function') return !lib.isArmy(a); } catch (e) { /* own list */ }
  const l = Array.isArray(lib.PSEUDO_ARMIES) ? lib.PSEUDO_ARMIES : ['x', 'xnotanks'];
  return l.map(x => String(x).toLowerCase()).includes(a);
}
// one line per card: army from s(..) or the file name; squad macros name(N) side(S); a helper file's card belongs to no army
function indexSets(sets) {
  const by = new Map(), put = (a, u, src) => { if (!u || /[%/]/.test(u) || (a !== '*' && pseudo(a))) return; if (!by.has(a)) by.set(a, new Map()); if (!by.get(a).has(u)) by.get(a).set(u, src); };
  for (const [rel, { text, src }] of sets) {
    const fa = (/_([a-z0-9]+)\.(?:set|inc)$/i.exec(rel) || [])[1];
    for (const raw of text.split(/\r?\n/)) {
      const l = raw.replace(/;.*$/, ''), c = /^\s*\{"([^"]+)"/.exec(l);
      if (c) { const s = /(?:^|[\s(])s\((\w+)\)/.exec(l); put(((s && s[1]) || fa || '*').toLowerCase(), c[1], src); }
      const n = /\bname\(([^)\s]+)\)/.exec(l), sd = /\bside\(([^)\s]+)\)/.exec(l);
      if (n && sd) put(sd[1].toLowerCase(), n[1] + '(' + sd[1] + ')', src);
    }
  }
  return by;
}
// the layers over the game: Require closure; with no Require, the sibling the buy check proves (its own bot list's units decide)
// -> {deps: [{id, dir, title}], missing: [id], base: {how, title, folder} | null}
function layersOf(ctx, mod) {
  const DEP = require('../buycheck/deps'), D = DEP.depsOf(ctx, mod);
  if (D.list.length || D.missing.length || !lib.gameOf(ctx).dir) return { deps: D.list, missing: D.missing, base: D.list.length ? { how: 'require', title: D.list.map(d => d.title).join(', ') } : null };
  let wanted = null;
  try {
    const e = lib.effective(ctx, mod, 'script/multiplayer/bot.data.lua');
    if (e.text) wanted = [...new Set([...e.text.matchAll(/unit\s*=\s*"([^"]+)"/g)].map(m => m[1]))];
  } catch (e) { /* no list */ }
  const S = require('../buycheck/check').setup(ctx, mod, wanted);
  return { deps: S.deps || [], missing: [], base: S.base || null };
}
// SPEED: for a route of a server (ctx.modtree) that can wait and reads cards or names right after. warm(ctx, mod) waits for the shared,
// non-blocking scan (lib/modtree through mount.warm) of the mod and of every folder layersOf mounts over the game (Require closure, or
// the one or two sibling mods check.setup tries), only where a folder has no scan of this process; the sync readers below then find the
// view by listing instead of walking the folders (13-18 s blocked on a big mod). Same view, same answer. Never throws: a scan that fails,
// a bad mod, no game = the readers go the old way and say what is wrong. GoH: nothing (no bot list there).
// route(fn) = fn with that wait in front (mod = ?mod= or body.mod, checked by lib.checkMod first: a refused folder is not scanned)
const WARM = new Map();   // game + mod -> the folders last waited for
async function warm(ctx, mod) {
  try {
    if (!ctx || !ctx.modtree || !mod) return;
    const G = lib.gameOf(ctx);
    if (G.kind === 'goh') return;
    const M = require('../buycheck/mount'), key = G.id + '|' + (G.dir ? lowp(G.dir) : '') + '|' + lowp(mod), had = WARM.get(key);
    if (had && M.scanned(had)) return;
    const D = require('../buycheck/deps').depsOf(ctx, mod);
    await M.warm(ctx, mod, D.list);
    let deps = D.list;
    if (!D.list.length && !D.missing.length && G.dir) {
      let wanted = null;
      try { const e = lib.effective(ctx, mod, 'script/multiplayer/bot.data.lua'); if (e.text) wanted = [...new Set([...e.text.matchAll(/units*=s*"([^"]+)"/g)].map(m => m[1]))]; } catch (e) { /* no list */ }
      deps = require('../buycheck/check').guessed(ctx, mod, wanted, D);
      await M.warm(ctx, mod, deps);
    }
    if (WARM.size > 16) WARM.clear();
    WARM.set(key, [mod].concat(deps.map(d => d.dir)));
  } catch (e) { /* the readers say it */ }
}
const route = fn => async (url, body, ctx) => {
  let mod = null;
  try { mod = lib.checkMod(ctx, (url && url.searchParams && url.searchParams.get('mod')) || (body && body.mod) || ''); } catch (e) { mod = null; }
  if (mod) await warm(ctx, mod);
  return fn(url, body, ctx);
};
// -> {cards: Map army -> Set, list: {army: [{unit, src}]}, known: bool (false = no units set at all), missing: [mod id], base, lng}
function cardsOf(ctx, mod) {
  const M = require('../buycheck/mount'), BC = require('../buycheck/check');
  const L = layersOf(ctx, mod), V = M.view(ctx, mod, L.deps), nfs = BC.cardsFrom(V).nfs, sets = new Map();
  for (const f of V.sets) sets.set(f.rel.toLowerCase(), { text: f.text, src: f.src });
  const by = indexSets(sets), cards = new Map(), list = {};
  for (const [a, m] of by) {
    for (const u of [...m.keys()]) if (nfs.has(u)) m.delete(u);
    cards.set(a, new Set(m.keys()));
    list[a] = [...m].map(([unit, src]) => ({ unit, src })).sort((x, y) => (x.unit < y.unit ? -1 : x.unit > y.unit ? 1 : 0));
  }
  return { cards: sets.size ? cards : null, list, known: sets.size > 0, missing: L.missing, base: L.base, lng: V.lng, armyNames: V.armyNames || {} };
}

// army names as the lobby shows them ({eng: "Commonwealth"}): the armies/<id>.set titles worded by the .lng texts of the game, deps and mod
// GoH: the lobby names from its .pot texts (bots/gohtext.js; GoH has no .lng)
function armyNamesOf(ctx, mod) {
  if (lib.gameOf(ctx).kind === 'goh') { try { return require('../../gohtext').armyNames(ctx, mod) || {}; } catch (e) { return {}; } }
  try { return require('../buycheck/mount').view(ctx, mod, layersOf(ctx, mod).deps).armyNames || {}; } catch (e) { return {}; }
}
// {"key" "text"} leaves of a .lng text into out (lower key -> text); {tags ..} is the root, not a key part
function lngLeaves(text, pre, out) {
  const re = /"((?:[^"\\]|\\.)*)"|[{}]|[^\s{}"]+/g, stack = [];
  let m, open = false, cur = null;
  text = text.replace(/^﻿/, '');
  while ((m = re.exec(text))) {
    const t = m[0];
    if (t === '{') { open = true; cur = { name: null, vals: [] }; stack.push(cur); continue; }
    if (t === '}') {
      const b = stack.pop();
      if (b && b.name != null && b.vals.length === 1 && b.leaf !== false) out.set(pre.concat(stack.map(x => x.name).filter(x => x != null && x.toLowerCase() !== 'tags'), b.name).join('/').toLowerCase(), b.vals[0]);
      if (stack.length) stack[stack.length - 1].leaf = false;
      cur = stack[stack.length - 1] || null; continue;
    }
    if (!cur) continue;
    const v = m[1] !== undefined ? m[1].replace(/\\"/g, '"') : t;
    if (open) { cur.name = v; open = false; } else cur.vals.push(v);
  }
  return out;
}
// in-game names of the given units: {unit: text}; units with no text are left out. lng: a cardsOf result's lng (else mounted here)
// GoH (no lng given): desc/squad and desc/entity of its .pot texts (bots/gohtext.js)
function namesOf(ctx, mod, units, lng) {
  if (!lng && lib.gameOf(ctx).kind === 'goh') { try { return require('../../gohtext').namesOf(ctx, mod, units) || {}; } catch (e) { return {}; } }
  let m = lng;
  if (!m) { try { const M = require('../buycheck/mount'); m = M.view(ctx, mod, layersOf(ctx, mod).deps).lng; } catch (e) { const g = gameData(ctx); m = new Map(g ? g.lng : []); } }
  const out = {};
  for (const u of units) {
    const k = String(u).toLowerCase(), t = m.get('desc/entity/' + k) || m.get('desc/squad/' + k);
    const c = t ? t.replace(/<[^<>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
    if (c) out[u] = c;
  }
  return out;
}


// ---- what the stage card reads at page open, kept in the shared store (header: CACHE)
const NAMES_SECTION = 'bots.names', NAMES_VER = 1, NAMES_AREAS = ['set', 'script', 'interface', 'text', 'pak', 'other'];
const lowp = p => { const r = path.resolve(String(p)).replace(/\\/g, '/'); return process.platform === 'win32' ? r.toLowerCase() : r; };
const sha1 = s => crypto.createHash('sha1').update(s).digest('hex');
const isName = k => k.startsWith('desc/entity/') || k.startsWith('desc/squad/');
// made now, the way namesOf and armyNamesOf do it: the mount of the game, the mods it is built on and the mod; a mount that throws
// gives the game's own texts and no army names (failed: not kept)
function openFresh(ctx, mod) {
  try {
    const deps = layersOf(ctx, mod).deps || [], V = require('../buycheck/mount').view(ctx, mod, deps);
    return { names: [...V.lng].filter(([k]) => isName(k)), armyNames: V.armyNames || {}, deps: deps.map(d => d.dir), failed: false };
  } catch (e) {
    const g = gameData(ctx);
    return { names: [...(g ? g.lng : [])].filter(([k]) => isName(k)), armyNames: {}, deps: [], failed: true };
  }
}
// the mods the game knows (and the ones beside the mod): a new or changed one can change what the mod is built on. Asked at most every 5 s
const POOL = new Map();
function poolStamp(ctx, mod) {
  const G = lib.gameOf(ctx), key = G.id + '|' + (G.dir ? lowp(G.dir) : '') + '|' + lowp(mod), c = POOL.get(key), now = Date.now();
  if (c && now - c.at < 5000) return c.stamp;
  let stamp = '';
  try { stamp = sha1([...require('../buycheck/deps').pool(ctx, mod).values()].map(m => m.id + '|' + lowp(m.dir) + '|' + (m.requires || []).join(',')).sort().join('\n')); } catch (e) { stamp = ''; }
  POOL.set(key, { stamp, at: now });
  return stamp;
}
const namesParts = (ctx, mod) => { const G = lib.gameOf(ctx); return { game: G.dir ? lowp(G.dir) : '', gid: G.id, mod: lowp(mod) }; };
const namesStamps = (ctx, mod, T) => Object.assign({ game: lib.gameStamp(ctx), pool: poolStamp(ctx, mod) }, ctx.modtree.stamps(T, NAMES_AREAS));
async function depSig(ctx, dirs) {
  const rows = [];
  for (const d of dirs || []) { let s = 'unreadable'; try { s = JSON.stringify(ctx.modtree.stamps(await ctx.modtree.ensure(d), NAMES_AREAS)); } catch (e) { /* gone */ } rows.push(lowp(d) + '=' + s); }
  return rows.length ? sha1(rows.join('\n')) : '';
}
const okValue = v => !!v && Array.isArray(v.names) && !!v.armyNames && typeof v.armyNames === 'object' && Array.isArray(v.deps) && typeof v.depSig === 'string';
const OPEN = new Map(), FLIGHT = new Map();   // identity -> {sig, value} (memory, in front of the store); identity + stamps -> the make that runs
async function openData(ctx, mod) {
  const S = lib.storeOf(ctx), MT = ctx && ctx.modtree;
  const give = (v, cached) => ({ lng: new Map(v.names), armyNames: v.armyNames, cached });
  if (!S || !MT || typeof MT.ensure !== 'function') return give(openFresh(ctx, mod), false);
  const T = await MT.ensure(mod), parts = namesParts(ctx, mod), stamps = namesStamps(ctx, mod, T), id = JSON.stringify(parts), sig = JSON.stringify(stamps);
  const fresh = async v => okValue(v) && (await depSig(ctx, v.deps)) === v.depSig;
  const m = OPEN.get(id);
  if (m && m.sig === sig && await fresh(m.value)) return give(m.value, true);
  let hit = null; try { hit = S.get(NAMES_SECTION, NAMES_VER, parts, stamps); } catch (e) { hit = null; }
  if (hit && await fresh(hit.value)) { OPEN.set(id, { sig, value: hit.value }); return give(hit.value, true); }
  const fk = id + sig;
  if (!FLIGHT.has(fk)) FLIGHT.set(fk, (async () => {
    const F = openFresh(ctx, mod), value = { names: F.names, armyNames: F.armyNames, deps: F.deps, depSig: await depSig(ctx, F.deps) };
    if (!F.failed) { OPEN.set(id, { sig, value }); try { S.put(NAMES_SECTION, NAMES_VER, parts, stamps, value); } catch (e) { /* best effort */ } }
    return value;
  })().finally(() => FLIGHT.delete(fk)));
  return give(await FLIGHT.get(fk), false);
}
const forget = () => { OPEN.clear(); GAME.clear(); POOL.clear(); };   // drop what is held in memory (the Prepare screen's Clear)
// the store state of openData for the Prepare screen: the last known listing of the mod, no walk, no mount
function openState(ctx, mod) {
  const S = lib.storeOf(ctx), MT = ctx && ctx.modtree, T = MT && typeof MT.last === 'function' ? MT.last(mod) : null;
  if (!S || !T) return { state: 'none', why: T ? [] : ['mod'] };
  return S.state(NAMES_SECTION, NAMES_VER, namesParts(ctx, mod), namesStamps(ctx, mod, T));
}

module.exports = { cardsOf, namesOf, armyNamesOf, indexSets, lngLeaves, gameData, layersOf, pseudo, warm, route, openData, openFresh, openState, forget, NAMES_SECTION, NAMES_AREAS };
