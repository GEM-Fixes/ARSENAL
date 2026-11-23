// Bots part "mission" (group E, Map scripts for AI): map scripts that give bot units orders the bot Lua cannot give (it has only buy, go to a
// flag and chat, MIS-08). The in-game proof showed a map's <mode>.mi reaches units a bot bought (move
// board a placed vehicle, spawn then give to the bot's side [V]) and that the bot's side number is NOT fixed (5/6/7 once, 1/2/3 four times),
// so every addition finds the side at run time in the team's start area (mi.js, recipes.js).
// Card "orders" (first): five recipes put into the mod's copy of the map's <mode>.mi: plain preview, write (asks first), Undo, milint after
// a write; this page lists and takes out its own additions. Card "teams" (last, folded): how each team's bot is found, under Details.
// Modes: facts says per mode whether bots can join (joinInfo: {enableBots}, not combat) and opens on one they can; add refuses combat.
// Crews: a crewed reinforcement gets men of each vehicle's own army (crewTable: its buy card, else the army's basic infantry).
// proof.json: {proven, scriptPlacedOnly, note}, read on every request.
// Routes (mod in the query or body, the game in the request headers as on the whole page):
//   GET  mission/maps                        the Maps page's map list (its job and cache) + loose maps of the mod; only maps with a mission
//   GET  mission/facts?map&mode&from         places, start areas, this page's additions, recipes on/off, OrderRotationPeriod
//   GET  mission/units                       vehicles and other single units of the MP buy lists with their in-game names (not squads)
//   POST mission/add {map, mode, items:[{recipe, p}], write}   preview (write false) or write (+ undo token), then milint on the mod
//   POST mission/remove {map, mode, id, write}                 the mod copy is deleted when it is the game's file again
//   POST mission/undo {map, mode, undo:{ids, after, copied}}   the bytes from before the write, refused when the file changed since
// Games: AS64 and MoW:AS2 alike (the missions page's readers on the request's game view). GoH: read only (2026-11-23): maps, facts (places,
// start areas, this page's additions) and units read the GoH file set like the Missions page does (its GoH readers); add, remove and undo
// are refused with one plain line (bots.mission.e.goh): the five recipes are proven in AS2/AS64 matches only
// bot-trigger-proof.md), and a GoH bot re-orders every squad of its own each OrderRotationPeriod unless the squad is tagged _lua_mi
// (GoH modes/battlezones.lua IsSquadInScript [V file]), which these recipes do not do; GoH host runs triggers (GHCMD-06).
// Writes: only <mod>/resource/<map>/<mode>.mi (a copy of the game's file when the mod has none), through the shared write guard.
// Author: Imperator_Aug (ARSENAL, ia-4c81aeac)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MI = require('./mi');
const { RECIPES, crewPick } = require('./recipes');

let PROOF = path.join(__dirname, 'proof.json');   // _t.proofAt(file): the test points it at a scratch copy
// a refusal the page words: "<lang key>" or "<lang key> {json}"
const bad = (msg, params, status) => { const p = params && typeof params === 'object' && Object.keys(params).length ? params : null;
  return Object.assign(new Error(msg + (p ? ' ' + JSON.stringify(p) : '')), { status: status || 400, key: msg, params: p || {} }); };
const q = (url, k) => (url && url.searchParams && url.searchParams.get(k)) || '';
const MODE = /^[a-z0-9_]{1,40}$/;
const lib = () => require('../../lib');
const MP = () => require('../../../maps')._t;
const MS = () => require('../../../missions')._t;
const sha = b => crypto.createHash('sha1').update(b).digest('hex');
const MAXITEMS = Object.keys(RECIPES).length;

function proof() {
  let j = {}; try { j = JSON.parse(fs.readFileSync(PROOF, 'utf8')); } catch (e) { /* missing: not proven */ }
  return { proven: j.proven === true, scriptPlacedOnly: j.scriptPlacedOnly === true, note: typeof j.note === 'string' ? j.note.slice(0, 400) : '' };
}
// which recipes the page offers: all five; scriptPlacedOnly = only the ones that do not order bot units (c spawns, d shells)
const placedOnly = r => r === 'c' || r === 'd';
function recipesOn(pf) {
  return Object.keys(RECIPES).map(r => ({ id: r, key: RECIPES[r].key, move: !!RECIPES[r].move, bot: !!RECIPES[r].bot, src: RECIPES[r].src,
    off: pf.scriptPlacedOnly && !placedOnly(r) ? 'bots.mission.offScript' : '' }));
}
// the request's game; write = a route that changes the mod: GoH is refused there with its plain line (reads go on, see the head)
function gameOf(ctx, write) {
  const g = MS().gameOf(ctx);
  if (write && g.kind === 'goh') throw bad('bots.mission.e.goh');
  return g;
}
const miKey = (key, mode) => 'resource/' + key + '/' + mode + '.mi';
const modFile = (mod, key, mode) => path.join(mod, 'resource', ...key.split('/'), mode + '.mi');
function modeOk(m) { m = String(m || '').toLowerCase(); if (!MODE.test(m)) throw bad('bots.mission.e.mode'); return m; }
// the bot's re-order period from the mod's bot.data.lua (else the game's): ms, from 'mod'|'game'
function rotation(ctx, mod) {
  let e = null; try { e = lib().effective(ctx, mod, 'script/multiplayer/bot.data.lua'); } catch (x) { /* unreadable */ }
  const m = e && e.text ? /^\s*OrderRotationPeriod\s*=\s*([0-9.\s*]+)/m.exec(e.text) : null;
  if (!m) return { ms: null, from: e && e.from };
  const ms = m[1].split('*').map(s => Number(s.trim())).reduce((a, b) => a * b, 1);
  return { ms: isFinite(ms) ? ms : null, text: m[1].trim(), from: e.from };
}
// the mission text the page works on: the mod's own copy, else the game's (vfs with the map's source mods)
function mission(ctx, g, mod, key, mode, mods) {
  const f = mod ? modFile(mod, key, mode) : '', own = !!f && fs.existsSync(f);
  const buf = own ? fs.readFileSync(f) : MS().readerOf(g).readKey('', miKey(key, mode), mods);
  return { buf, own, file: f };
}
// the map's ground height (map.net, the mod's loose copy first) -> fn(x, y) or null; heights are map units [V: the report's dest 3600,1300 = 111]
function groundOf(ctx, g, mod, key, mods) {
  let buf = null;
  try { const f = path.join(mod, 'resource', ...key.split('/'), 'map.net'); buf = fs.existsSync(f) ? fs.readFileSync(f) : MS().readerOf(g).readKey('', 'resource/' + key + '/map.net', mods); } catch (e) { buf = null; }
  if (!buf) return null;
  const mn = require('../../../../../lib/mapnet'), m = mn.parse(buf);
  if (m.problems.some(p => p.code !== 'NET_VERSION') || !m.cell) return null;
  return (x, y) => { const c = mn.cellAt(m, Math.floor((x + m.offX) / m.cell), Math.floor((y + m.offY) / m.cell)); return c ? c.height : null; };
}
function placesWithGround(buf, ground) { const p = MI.placesOf(buf); p.ground = ground; return p; }

// can bots join each mode? The Game Modes page's own reading of set/multiplayer/games/<mode>.set (mod copy first): {enableBots} on and the
// class not combat (MIS-65: combat has no flags, the bot has nothing to go for; MIS-71). -> {mode: {join: true|false|null, why: ok|off|combat|
// unknown}}; null = no card found (not judged). The page also asks GET modeready/botmodes when that route is there.
function joinInfo(ctx, mod, modes) {
  const out = {}; let MD = null, g = null;
  try { MD = require('../../../modes')._t; g = MD.gameOf(ctx); } catch (e) { MD = null; }
  for (const m of modes) {
    let r = null; try { r = MD && g && g.dir ? MD.rowOf(g, mod || '', m) : null; } catch (e) { r = null; }
    out[m] = !r ? { join: null, why: 'unknown' } : r.cls === 'combat' ? { join: false, why: 'combat' } : r.bots ? { join: true, why: 'ok' } : { join: false, why: 'off' };
  }
  return out;
}
// the mode the page opens with: the first one bots can play, else one not judged, else the first
const firstMode = (modes, info) => modes.find(m => info[m] && info[m].join === true) || modes.find(m => !info[m] || info[m].join == null) || modes[0];

// the crew of a vehicle (recipes.crewPick): its buy card in the mod's own unit sets and the game's (lib.gameCards, all unit sets), the army
// of the buy lists it is in (lib.unitList), the breeds the unit sets know. -> fn(unit) -> {breed, army, from} | null
function crewTable(ctx, mod) {
  const L = lib(), lines = new Map(), add = (u, l) => { if (!lines.has(u)) lines.set(u, []); lines.get(u).push(l); };
  const ud = mod ? L.modPath(mod, 'set/multiplayer/units') : '';
  let fl = []; try { fl = ud ? fs.readdirSync(ud).filter(f => /\.(set|inc)$/i.test(f)).sort() : []; } catch (e) { fl = []; }
  for (const f of fl) {
    const fa = ((/_([a-z0-9]+)\.(?:set|inc)$/i.exec(f) || [])[1] || '').toLowerCase();
    let txt = ''; try { txt = fs.readFileSync(path.join(ud, f), 'latin1'); } catch (e) { continue; }
    for (const c of L.cardLines(txt)) add(c.unit, { norm: c.norm, army: fa });
  }
  let gc = null; try { gc = L.gameCards(ctx); } catch (e) { gc = null; }
  if (gc) for (const [u, set] of gc) for (const n of set) add(u, { norm: n, army: '' });
  const armies = new Map();
  try { for (const u of L.unitList(ctx, mod).units || []) { if (!armies.has(u.unit)) armies.set(u.unit, []); if (armies.get(u.unit).indexOf(u.army) < 0) armies.get(u.unit).push(u.army); } } catch (e) { /* none */ }
  const known = new Set([...lines.keys()].filter(k => /^mp\/[A-Za-z0-9_]+\/[^/\s]+$/.test(k)));
  return unit => crewPick(unit, lines.get(unit) || [], armies.get(unit) || [], known);
}

// the mods a listed map may come from on this page: the picked mod and the mods it requires (mod.info Require closure, buycheck/deps),
// by folder name and id; a map that only another mod of the install has is not offered (it would not load with this mod)
const normId = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
function modSet(ctx, mod) {
  const out = { ids: new Set(), dirs: [] };
  if (!mod) return out;
  out.ids.add(normId(path.basename(path.resolve(mod)))); out.dirs.push(mod);
  try { for (const d of require('../buycheck/deps').depsOf(ctx, mod).list || []) { if (d.dir) { out.ids.add(normId(path.basename(d.dir))); out.dirs.push(d.dir); } if (d.id) out.ids.add(normId(d.id)); } } catch (e) { /* no deps */ }
  return out;
}
// map names a mod gives its own maps (resource/interface/text/mission.lng, the form the Maps page reads from the game): folder -> name
function modTitles(dirs) {
  const out = {};
  for (const d of dirs) {
    let t = ''; try { t = fs.readFileSync(path.join(d, 'resource', 'interface', 'text', 'mission.lng'), 'utf8'); } catch (e) { continue; }
    for (const m of t.matchAll(/\{\s*"([^"]+)"\s*\{\s*"name"\s*"((?:[^"\\]|\\.)*)"/g)) { const v = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); if (v && !out[m[1].toLowerCase()]) out[m[1].toLowerCase()] = v; }
  }
  return out;
}
async function mapsRoute(url, body, ctx) {
  gameOf(ctx);
  const r = await require('../../../maps').routes['GET /api/x/maps/list'](url, body, ctx);
  if (!r || r.state !== 'done') return { state: (r && r.state) || 'error', elapsed: r && r.elapsed, error: r && r.error };
  let mine = []; try { mine = (await require('../../../missions').routes['GET /api/x/missions/mine'](url, body, ctx)).maps || []; } catch (e) { /* no mod */ }
  let mod = ''; try { mod = lib().checkMod(ctx, q(url, 'mod')); } catch (e) { mod = ''; }
  const allow = modSet(ctx, mod), titles = modTitles(allow.dirs);
  const seen = new Set(), maps = [], gameMap = new Map((r.maps || []).map(m => [m && m.key, m]));
  let other = 0;
  for (const m of mine.concat(r.maps || [])) { if (!m || !m.key || seen.has(m.key)) continue; seen.add(m.key);
    try { MP().mapKeyOk(m.key); } catch (e) { continue; }   // a folder name the map routes refuse (a space in it): nothing this page could open
    const gm = gameMap.get(m.key) || {};   // a map of the mod that the game has too: the game's name (as the game shows it) and its modes
    const mods = m.mods && m.mods.length ? m.mods : gm.mods || [];
    if (!m.mine && mods.some(x => !allow.ids.has(normId(x)))) { other++; continue; }
    const modes = [...new Set((m.modes || []).concat(gm.modes || []).map(x => String(x).toLowerCase()).filter(x => MODE.test(x)))].sort();
    if (!modes.length) continue;   // no mission file for any mode: nothing this page can add to
    const folder = m.key.split('/').pop(), name = String(titles[folder.toLowerCase()] || gm.name || m.title || m.name || folder);
    // the words the map box searches: the name the game (or the mod) shows, the folder, the folder with spaces, the game's name when the mod renames it
    const words = [name, folder, folder.replace(/_/g, ' '), gm.name || ''].join(' ').toLowerCase();
    maps.push({ key: m.key, folder, name, words, modes, players: m.players || gm.players || 0, mods: mods.join(','), mine: !!m.mine }); }
  return { state: 'done', maps, other };
}

async function factsRoute(url, body, ctx) {
  const pf = proof(), g = gameOf(ctx), mod = lib().checkMod(ctx, q(url, 'mod')), key = MP().mapKeyOk(q(url, 'map'));
  const info = MP().mapInfo(ctx, g.dir, key, q(url, 'from'));
  const f = MS().factsOf(g.dir, mod, key, info.mods, null, g);
  const modes = f.modes.filter(m => m.mi).map(m => m.mode), modeInfo = joinInfo(ctx, mod, modes);
  const mode = q(url, 'mode') ? modeOk(q(url, 'mode')) : firstMode(modes, modeInfo);
  const out = { map: key, mode: mode || '', modes, modeInfo, players: f.players, mods: info.mods, proof: pf, recipes: recipesOn(pf), rotation: rotation(ctx, mod), game: g.id, readOnly: g.kind === 'goh' };
  if (!mode) return Object.assign(out, { none: 'bots.mission.e.nomodes' });
  const m = mission(ctx, g, mod, key, mode, info.mods);
  if (!m.buf) return Object.assign(out, { none: 'bots.mission.e.nomi' });
  const text = m.buf.toString('latin1'), ground = groundOf(ctx, g, mod, key, info.mods), places = MI.placesOf(m.buf), sp = MI.spots(text);
  return Object.assign(out, { own: m.own, file: miKey(key, mode), places, areas: MI.startAreas(places, ground), ground: !!ground, added: MI.added(text),
    canAdd: sp.ok ? '' : sp.why, includes: MI.includesOf(text) });
}

// vehicles and other single units of the MP buy lists, with their in-game names; squads (name(N) side(S) cards, desc/squad only) left out
async function unitsRoute(url, body, ctx) {
  gameOf(ctx);
  const mod = lib().checkMod(ctx, q(url, 'mod')), all = (lib().unitList(ctx, mod).units || []);
  let names = {}, lng = null;
  try { const C = require('../stages/cards'); names = C.namesOf(ctx, mod, all.map(u => u.unit)); const gd = C.gameData(ctx); lng = gd && gd.lng; } catch (e) { /* names stay empty */ }
  const A = armies(ctx, mod), seen = new Map();
  for (const u of all) {
    const k = String(u.unit).toLowerCase();
    if (/[()]/.test(u.unit) || (lng && lng.has('desc/squad/' + k) && !lng.has('desc/entity/' + k))) continue;
    if (!A.real(u.army)) continue;   // S17: a helper units file (x, xnotanks) is no army; a unit only there is not offered
    const s = seen.get(u.unit) || { unit: u.unit, name: names[u.unit] || '', armies: [], armyNames: [] };
    if (s.armies.indexOf(u.army) < 0) { s.armies.push(u.army); s.armyNames.push(A.name(u.army)); }
    seen.set(u.unit, s);
  }
  return { units: [...seen.values()].sort((a, b) => ((a.name || a.unit).toLowerCase() < (b.name || b.unit).toLowerCase() ? -1 : 1)) };
}
// the armies of the buy lists by their lobby names (buycheck: armies/<id>.set title in the game's texts), else the stock names (lib); real =
// one that has a name (when the game's names cannot be read: any code but the x helper files). lib.unitArmy is used when the frame has it
function armies(ctx, mod) {
  let AN = {}; try { AN = require('../stages/cards').armyNamesOf(ctx, mod) || {}; } catch (e) { AN = {}; }
  const L = lib(), known = Object.keys(AN).length > 0, stock = L.ARMY_NAMES || {};
  const name = a => AN[a] || (typeof L.armyName === 'function' ? L.armyName(a) : stock[a]) || a;
  return { name, real: a => !!a && (!!AN[a] || !!stock[a] || (!known && !/^x/i.test(a))) };
}

// milint on the mod, only the findings of this mission file, in the words the page shows
async function lint(ctx, g, mod, key, mode) {
  let r; try { r = await MP().lintMod(ctx, g.dir, mod, 'missions'); } catch (e) { return { ran: false, why: String(e.message || e).slice(0, 300), findings: [] }; }
  const want = (key + '/' + mode + '.mi').toLowerCase();
  const findings = (r.findings || []).filter(x => String(x.where || '').replace(/\\/g, '/').toLowerCase().indexOf(want) >= 0);
  return { ran: r.ran !== false, na: r.na || null, count: findings.filter(x => x.sev !== 'info').length, findings };
}

async function addRoute(url, body, ctx) {
  body = body || {};
  const pf = proof(), g = gameOf(ctx, true), write = !!body.write;
  let mod = lib().checkMod(ctx, body.mod);
  if (write) mod = lib().checkWrite(ctx, mod);
  const key = MP().mapKeyOk(body.map), mode = modeOk(body.mode), info = MP().mapInfo(ctx, g.dir, key, body.from);
  const items = Array.isArray(body.items) ? body.items.slice(0, MAXITEMS) : [];
  if (!items.length) throw bad('bots.mission.e.none');
  // S16: a mode bots cannot play is refused before anything is built (combat); one with bots off is said in the answer (join)
  const join = joinInfo(ctx, mod, [mode])[mode];
  if (join.why === 'combat') throw bad('bots.mission.e.combat', { mode });
  const m = mission(ctx, g, mod, key, mode, info.mods);
  if (!m.buf) throw bad('bots.mission.e.nomi');
  const before = m.buf.toString('latin1'), errBefore = MI.parse(before).errors.length, ground = groundOf(ctx, g, mod, key, info.mods);
  let text = before, CT = null; const done = [], seenR = new Set();
  const opt = { crewOf: u => (CT = CT || crewTable(ctx, mod))(u) };
  let AR = null;
  for (const it of items) {
    const r = String((it && it.recipe) || '');
    if (!RECIPES[r] || seenR.has(r)) throw bad('bots.mission.e.recipe'); seenR.add(r);
    if (pf.scriptPlacedOnly && !placedOnly(r)) throw bad('bots.mission.offScript');
    // S17: a vehicle with no buy card in the mod or the game is no real unit: refused at Preview, before anything is built
    const p0 = (it && it.p) || {}, want = r === 'c' ? (Array.isArray(p0.units) ? p0.units : []).map(u => u && u.unit) : r === 'e' ? [p0.unit] : [];
    for (const u of want) if (u && /^[\w.\-]+$/.test(String(u)) && !lib().hasCard(ctx, mod, String(u))) throw bad('bots.mission.e.nocard', { v: String(u) });
    const b = MI.build(r, p0, placesWithGround(text, ground), text, opt), ins = MI.insert(text, b);
    const crew = b.crew ? b.crew.map(g => Object.assign({}, g, { armyName: (AR = AR || armies(ctx, mod)).name(g.army) })) : b.crew;
    text = ins.text; done.push({ id: b.id, recipe: r, summary: b.summary, p: b.p, text: ins.added, made: b.made, crew });
  }
  // parse after: the result must read with no more complaints than the file had (sdlx, the engine's reader rules)
  const after = MI.parse(text);
  if (!after.top || after.errors.length > errBefore) return { ok: false, write: false, say: [{ k: 'bots.mission.e.parse', p: { m: after.errors.slice(0, 3).map(e => 'line ' + e.line + ' ' + e.code).join('; ') } }] };
  const out = { ok: true, write, map: key, mode, join, target: write ? lib().guardFile(mod, modFile(mod, key, mode)) : modFile(mod, key, mode), rel: miKey(key, mode), copies: !m.own, items: done,
    includes: MI.includesOf(before), proof: pf };
  if (!write) return out;
  const bytes = Buffer.from(text, 'latin1');
  // the topmost folder this write makes (Undo takes it away again when it is empty), '' when the folder is there already
  let made = ''; for (let d = path.dirname(path.resolve(out.target)); !fs.existsSync(d) && d.startsWith(path.resolve(mod) + path.sep); d = path.dirname(d)) made = path.relative(mod, d).replace(/\\/g, '/');
  fs.mkdirSync(path.dirname(out.target), { recursive: true });
  fs.writeFileSync(out.target, bytes);
  out.undo = { ids: done.map(d => d.id), after: sha(bytes), before: sha(m.buf), copied: !m.own, made };
  out.lint = await lint(ctx, g, mod, key, mode);
  return out;
}

// the mod's copy is the game's file again: delete it and the folders it leaves empty (up to <mod>/resource)
function dropCopy(mod, f) {
  fs.unlinkSync(f);
  const stop = path.resolve(mod, 'resource');
  for (let d = path.dirname(path.resolve(f)); d.length > stop.length && d.startsWith(stop); d = path.dirname(d)) { try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch (e) { break; } }
}
function gameBytes(ctx, g, key, mode, from) {
  const info = MP().mapInfo(ctx, g.dir, key, from);
  return MS().readerOf(g).readKey('', miKey(key, mode), info.mods);
}

async function removeRoute(url, body, ctx) {
  body = body || {};
  const g = gameOf(ctx, true), write = !!body.write;
  let mod = lib().checkMod(ctx, body.mod);
  if (write) mod = lib().checkWrite(ctx, mod);
  const key = MP().mapKeyOk(body.map), mode = modeOk(body.mode), id = String(body.id || '');
  if (!/^[a-e]\d{1,4}$/.test(id)) throw bad('bots.mission.e.noid');
  const f = write ? lib().guardFile(mod, modFile(mod, key, mode)) : modFile(mod, key, mode);
  if (!fs.existsSync(f)) throw bad('bots.mission.e.noid');
  const text = fs.readFileSync(f).toString('latin1'), r = MI.remove(text, id);
  if (!r.removed) throw bad('bots.mission.e.noid');
  const game = gameBytes(ctx, g, key, mode, body.from), now = Buffer.from(r.text, 'latin1');
  const out = { ok: true, write, id, removedLines: text.split('\n').length - r.text.split('\n').length, removed: r.gone, sameAsGame: !!game && now.equals(game), deleted: false, target: f };
  if (write) { if (out.sameAsGame) { dropCopy(mod, f); out.deleted = true; } else fs.writeFileSync(f, now); }
  return out;
}

// Undo of the last write: the file must still be what that write left (sha1 `after`); the additions come out again and the result must be
// the very bytes from before the write (sha1 `before`). A copy that write made is deleted with the folders it made (when empty), so the
// mod is byte for byte and folder for folder as before
async function undoRoute(url, body, ctx) {
  body = body || {};
  gameOf(ctx, true);
  const mod = lib().checkWrite(ctx, lib().checkMod(ctx, body.mod));
  const key = MP().mapKeyOk(body.map), mode = modeOk(body.mode), u = body.undo || {};
  const ids = Array.isArray(u.ids) ? u.ids.map(String) : [], hex = x => /^[0-9a-f]{40}$/.test(String(x || ''));
  if (!ids.length || ids.length > MAXITEMS || ids.some(id => !/^[a-e]\d{1,4}$/.test(id)) || !hex(u.after) || !hex(u.before)) throw bad('bots.mission.e.noundo');
  const f = lib().guardFile(mod, modFile(mod, key, mode));
  if (!fs.existsSync(f)) throw bad('bots.mission.e.changed');
  const buf = fs.readFileSync(f);
  if (sha(buf) !== u.after) throw bad('bots.mission.e.changed');
  let text = buf.toString('latin1');
  for (const id of ids) { const r = MI.remove(text, id); if (!r.removed) throw bad('bots.mission.e.changed'); text = r.text; }
  const now = Buffer.from(text, 'latin1');
  if (sha(now) !== u.before) throw bad('bots.mission.e.changed');
  if (!u.copied) { fs.writeFileSync(f, now); return { ok: true, deleted: false, target: f }; }
  fs.unlinkSync(f);
  // the folders the write made: only an ancestor of the file inside the mod, each one only when empty
  const top = u.made ? path.resolve(mod, String(u.made)) : '', dirs = [];
  if (top && top.startsWith(path.resolve(mod) + path.sep) && path.resolve(f).startsWith(top + path.sep))
    for (let d = path.dirname(path.resolve(f)); d.length >= top.length; d = path.dirname(d)) dirs.push(d);
  for (const d of dirs) { try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch (e) { break; } }
  return { ok: true, deleted: true, target: f };
}

module.exports = {
  id: 'mission', group: 'E', order: 10,
  routes: {
    'GET /api/x/bots/mission/maps': mapsRoute,
    'GET /api/x/bots/mission/facts': factsRoute,
    // SPEED: the shared mod scan waited for first (stages/cards warm): the unit names and army names read the mounted view
    'GET /api/x/bots/mission/units': async (url, body, ctx) => require('../stages/cards').route(unitsRoute)(url, body, ctx),
    'POST /api/x/bots/mission/add': async (url, body, ctx) => require('../stages/cards').route(addRoute)(url, body, ctx),
    'POST /api/x/bots/mission/remove': removeRoute,
    'POST /api/x/bots/mission/undo': undoRoute,
  },
  lang: require('./lang'),
  script: require('./client'),
  _t: { proof, recipesOn, rotation, groundOf, joinInfo, firstMode, crewTable, proofAt: f => { PROOF = f; } },
};
