// recipe "look at a thing" (explore): a unit, a gun, a map, a sound, a model or a picture. What kind; find it by words or browse; then
// one screen per question: what it looks or sounds like (the viewers), its numbers in plain words (units/stats, armor/shells,
// maps/list, view sound/plan, picture/info, model/owner), side by side with another (units, guns), what a gun can pierce, what stands
// on a map, the files it is made of (art/unit, art/sound, ide/vdir), where it is used (ide/refs, model/owner), which file wins and why
// (files/which, ide/copies), what a mod changed (ide/copies, units/compare), a unit's price in its army and the guns' table
// (POST /api/x/balance/table, read only). It ends with "make one like this" and "change this": the
// matching make/change task opens with the base filled in (that task's own base lookup). Reads only: nothing is ever written.
// Own lookups: gun (armor/guns), picture (pictures and fonts of the game view). Own route: the objects on a map (the mapview reader).
// Contract: ../README.md.
// Author: Imperator_Aug (ARSENAL, ia-5eaa2904)
'use strict';
const fs = require('fs'), path = require('path');

const PIC = ['dds', 'tga', 'png', 'bmp', 'jpg', 'fnt'];
const wordsOf = s => String(s || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
const gameOf = ctx => (ctx && typeof ctx.game === 'function' ? ctx.game() : (ctx && (ctx.gameDir || ctx.gamedir))) || '';

// a list empty for a reason says why and what to do (README Changes 53): no game folder, or no name has these words
const NOGAME = { results: [], why: 'task.x-thing.k.why.noGame', do: 'task.x-thing.k.do.noGame' };
const nothing = w => (String(w || '').trim() ? { results: [], why: 'task.x-thing.k.why.noWords', do: 'task.x-thing.k.do.noWords' } : { results: [], why: 'task.x-thing.k.why.empty', do: 'task.x-thing.k.do.noGame' });
// gun: the weapons of the game view (models armor/guns: stuff files with a shell list)
async function lookGun(ctx, words, opt) {
  const A = require('../../models/sub/armor.server');
  if (!gameOf(ctx)) return NOGAME;
  const r = await A.routes['POST /api/x/models/armor/guns'](null, { q: String(words || ''), limit: 200, mod: (opt && opt.mod) || undefined }, ctx);
  if (!(r.guns || []).length) return nothing(words);
  return (r.guns || []).map(g => ({ id: g.name, name: g.name, where: g.group || '', ref: { key: 'resource/set/stuff/' + (g.group || 'gun') + '/' + g.name }, sub: g.group || '' }));
}
// picture: pictures and fonts of the game view, short keys first
function lookPicture(ctx, words, opt) {
  const L = require('../../files/lib'), vf = L.vfsFor(ctx, (opt && opt.mod) || '');
  if (!vf.v) return NOGAME;
  const ws = wordsOf(words), out = [];
  for (const [key, rec] of vf.v.files) {
    const e = key.slice(key.lastIndexOf('.') + 1);
    if (PIC.indexOf(e) < 0 || (ws.length && !ws.every(w => key.includes(w)))) continue;
    out.push({ id: key, name: key.split('/').pop(), where: rec.layer || '', ref: { key }, sub: e === 'fnt' ? 'font' : key.slice(9, key.lastIndexOf('/')) });
    if (out.length >= 3000) break;
  }
  if (!out.length) return nothing(words);
  return out.sort((a, c) => a.id.length - c.id.length || (a.id < c.id ? -1 : 1));
}

// GET /api/x/task/r/x-thing/entities?map=map/multi/<folder>&mod= -> {map, total, files: [names], defs: [{def, n}] (most first, 60 at
// most), more}. The map's files (map and *.mi) from the game view of the mod; a map only a mod has (maps/list mods) from that mod.
// the request's game: ?game=, else ctx.task (a recipe step), else the route's ctx.gameId() (gui.js); nothing = as64. exe: the vfs exe,
// undefined for as64 (the vfs picks as64.exe first, as before), 'mowas_2' for MoW:AS2 (no as64/core, no as64+ modes)
function gidOf(ctx, g) {
  if (g) return String(g);
  if (ctx && ctx.task && ctx.task.id) return String(ctx.task.id);
  try { const x = ctx && ctx.gameId; return String((typeof x === 'function' ? x.call(ctx) : x) || 'as64'); } catch (e) { return 'as64'; }
}
function exeFor(ctx, g) { const id = gidOf(ctx, g); return id === 'as64' ? undefined : (require('../../../../lib/games').exeOf(id) || undefined); }
// the view is the shared one of tools/lib/gameview (PERF A2: no copy kept here; a moved game or mod is seen by stamp and signature,
// not after two minutes). mapViewAsync awaits the mods' shared scan (the route); mapView is the same answer for a caller that cannot
// wait. AS64 only: a mod made for Enhanced mode is applied only with as64+ in the list (vfs MOD_MODE): the game turns it on that way
const mvOpt = (game, mods, exe) => (exe ? { gameDir: game, exe, list: mods } : { gameDir: game, list: mods });
const mvMode = (b, mods, exe) => !exe && mods.length && b.mods.length < mods.length && (b.problems || []).some(p => p.code === 'MOD_MODE');
async function mapViewAsync(game, mods, exe) {
  const GV = require('../../../../lib/gameview');
  const b = await GV.withMods(mvOpt(game, mods, exe));
  return mvMode(b, mods, exe) ? GV.withMods({ gameDir: game, list: ['as64+'].concat(mods) }) : b;
}
function mapView(game, mods, exe) {
  const GV = require('../../../../lib/gameview');
  const b = GV.withModsSync(mvOpt(game, mods, exe), { revalidate: true });
  return mvMode(b, mods, exe) ? GV.withModsSync({ gameDir: game, list: ['as64+'].concat(mods) }, { revalidate: true }) : b;
}
async function entities(url, body, ctx) {
  const key = String(url.searchParams.get('map') || '').replace(/\\/g, '/').toLowerCase().replace(/^resource\//, '').replace(/\/+$/, '');
  if (!/^map\/(multi|single)\/[a-z0-9_\-./ ]+$/.test(key) || key.split('/').includes('..')) throw Object.assign(new Error('map: a map key like map/multi/2v2_bastogne is needed'), { status: 400 });
  const game = gameOf(ctx); if (!game) throw Object.assign(new Error('No game folder is set'), { status: 400 });
  const pre = 'resource/' + key + '/', vfs = require('../../../../lib/vfs'), MV = require('../../../../mapview/mapview');
  const L = require('../../files/lib'), mod = url.searchParams.get('mod') || '';
  let v = null;
  try { if (typeof L.vfsWarm === 'function') await L.vfsWarm(ctx, mod); } catch (e) { /* vfsFor says it */ }   // SPEED: the mod's shared scan first, so vfsFor does not walk the mod
  try { const vf = L.vfsFor(ctx, mod); if (vf.v && vf.v.files.has(pre + 'map')) v = vf.v; } catch (e) { v = null; }
  if (!v) {
    let mods = [];
    try {
      const M = require('../../maps'), l = await M.routes['GET /api/x/maps/list'](new URL('http://127.0.0.1/api/x/maps/list'), null, ctx);
      const m = l && l.maps && l.maps.find(x => x.key === key); if (m) mods = (m.mods || []).filter(x => /^[^\\/:*?"<>|,]+$/.test(x) && fs.existsSync(path.join(game, 'mods', x)));
    } catch (e) { mods = []; }
    v = await mapViewAsync(game, mods, exeFor(ctx, url.searchParams.get('game')));
  }
  const files = new Map();
  for (const [k, r] of v.files) if (k.startsWith(pre) && !k.slice(pre.length).includes('/') && (/\.mi$/.test(k) || k === pre + 'map')) files.set(k.slice(pre.length), vfs.readRec(r));
  if (!files.size) return { map: key, total: 0, files: [], defs: [], more: false, found: false };
  const by = new Map(), ents = MV.readEnts(files, 'all');
  for (const e of ents) by.set(e.def, (by.get(e.def) || 0) + 1);
  const defs = [...by].map(([def, n]) => ({ def, n })).sort((a, c) => c.n - a.n || (a.def < c.def ? -1 : 1));
  return { map: key, total: ents.length, files: [...files.keys()].sort(), defs: defs.slice(0, 60), kinds: defs.length, more: defs.length > 60, found: true };
}

module.exports = {
  id: 'x-thing',
  verbs: ['explore'],
  games: ['as64', 'mowas2'],
  // Gates of Hell: not offered; the row greys with this plain line (game parity, kind b left open: see the lang row)
  na: { goh: 'task.x-thing.na.goh' },
  // no mod needed: with no mod picked every screen reads the game as it ships (files/lib readMod); only what a mod changed and the
  // make/change tasks that write into a mod ask for one
  needs: [],
  order: 240,
  title: 'task.x-thing.t',
  census: 'explore',
  groups: [
    { id: 'what', title: 'task.x-thing.g.what', essential: true, q: [
      { id: 'kind', kind: 'xt-kind', ask: 'task.x-thing.q.kind', help: 'task.x-thing.h.kind', limits: { values: ['unit', 'gun', 'map', 'sound', 'model', 'picture'] } },
      { id: 'thing', kind: 'xt-find', ask: 'task.x-thing.q.thing', help: 'task.x-thing.h.thing', covers: ['unit.name_lookup'] },
    ] },
    { id: 'see', title: 'task.x-thing.g.see', essential: true, q: [
      { id: 'look', kind: 'xt-look', ask: 'task.x-thing.q.look', help: 'task.x-thing.h.look', covers: ['map.picture', 'sound.play', 'sound.weapon', 'model.open', 'picture.view', 'picture.font'] },
      { id: 'numbers', kind: 'xt-numbers', ask: 'task.x-thing.q.numbers', help: 'task.x-thing.h.numbers', covers: ['unit.stats', 'map.list'] },
      { id: 'compare', kind: 'xt-compare', ask: 'task.x-thing.q.compare', help: 'task.x-thing.h.compare', covers: ['unit.compare'], when: { kind: ['unit', 'gun'] } },
      { id: 'price', kind: 'xt-price', ask: 'task.x-thing.q.price', help: 'task.x-thing.h.price', covers: ['unit.price'], when: { kind: 'unit' } },
      { id: 'balance', kind: 'xt-balance', ask: 'task.x-thing.q.balance', help: 'task.x-thing.h.balance', covers: ['gun.balance'], when: { kind: 'gun' } },
      { id: 'pierce', kind: 'xt-pierce', ask: 'task.x-thing.q.pierce', help: 'task.x-thing.h.pierce', covers: ['gun.armor'], when: { kind: 'gun' } },
      { id: 'onmap', kind: 'xt-onmap', ask: 'task.x-thing.q.onmap', help: 'task.x-thing.h.onmap', covers: ['map.entities'], when: { kind: 'map' } },
    ] },
    { id: 'made', title: 'task.x-thing.g.made', essential: true, q: [
      { id: 'files', kind: 'xt-files', ask: 'task.x-thing.q.files', help: 'task.x-thing.h.files' },
      { id: 'used', kind: 'xt-used', ask: 'task.x-thing.q.used', help: 'task.x-thing.h.used', covers: ['unit.refs', 'model.owner'] },
      { id: 'wins', kind: 'xt-wins', ask: 'task.x-thing.q.wins', help: 'task.x-thing.h.wins', covers: ['unit.find'] },
      { id: 'modchg', kind: 'xt-modchg', ask: 'task.x-thing.q.modchg', help: 'task.x-thing.h.modchg' },
    ] },
    { id: 'then', title: 'task.x-thing.g.then', essential: true, q: [
      { id: 'next', kind: 'xt-next', ask: 'task.x-thing.q.next', help: 'task.x-thing.h.next' },
    ] },
  ],
  // every explore.json key: asked here (covers), or covered by another explore recipe (named), or a named gap
  kept: [
    ['mod.files', 'covered by x-mod (the changes screen)'],
    ['mod.diff', 'covered by x-mod (the changes screen)'],
    ['mod.conflicts', 'covered by x-mod (the clash screen)'],
    ['mod.search', 'covered by x-mod (the search screen)'],
    ['log.read', 'covered by x-log (the errors screen)'],
    ['limits.search', 'covered by x-limits (the limits screen)'],
    ['limits.guides', 'covered by x-limits (the guides screen)'],
    ['limits.glossary', 'covered by x-limits (the words screen)'],
    ['log.exe_compare', 'gap: no page reads the GoH and AS64 exe side by side (q.js -g reads internal notes that are not shipped); a modder acts on the limits row of an error instead'],
  ],
  lookups: { gun: lookGun, picture: async (ctx, w, o) => lookPicture(ctx, w, o) },
  routes: { 'GET /api/x/task/r/x-thing/entities': entities },
  _t: { lookGun, lookPicture, entities, mapView, mapViewAsync, gidOf, exeFor },
};
