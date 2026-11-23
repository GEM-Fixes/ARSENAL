// GUI ext bots: server side. Reads bot.data.lua, bots_generic.inc and the multiplayer presets (mod copy first, else the game's own via vfs, read only),
// lists their numbers, and writes a changed COPY into the user's mod folder (never into the game).
// Game (game parity): every read goes to the request's game (ctx.gameId/exe/kind/curDir). AS64 and MoW:AS2 share the AS2 install, so the
// vfs gets exe mowas_2 under MoW:AS2 (no as64/core); AS64 names no exe, as before. GoH reads the GoH install: its start presets sit at
// set/multiplayer/games/presets/*.inc and its bot difficulty at presets/global_parameters/bots_generic.inc (cp mpStart mpFinish payback
// chargeDelay charge unitScore) [I]; GOH_FILES and scan per kind. GoH has no bot.data.lua
// (GHMIS-66): the shopping list reads its purchase lists instead (gohBuys, tools/botrecipe/gohbuys); add-a-unit writes a row into the mod copy of one list (gohAddUnit, botrecipe --exe goh, [T]). Caches are keyed by game id.
// CACHE (gui README, contract 1): the game's files come from the one shared view (lib/gameview), never a view built here; what is read
// from it is kept in memory only while the game stamp stands. The game's buy cards (gameScan) are kept in the shared store, section
// 'bots.gamecards' (parts {game, gid}, stamp game). Every write passes checkWrite, which notes the mod; the routes (index.js) then call
// touchWrites so the shared mod listing (lib/modtree) is walked again.
// Author: Imperator_Aug (ARSENAL, ia-106364f5)
const fs = require('fs'), path = require('path');
const luatable = require('../../../botrecipe/luatable');
const PLAIN = require('../../../botrecipe/plain');
const STG = require('../../../botrecipe/stages'), stagesOf = STG.stagesOf;   // purchase stages by place, not by the stock comments
const games = require('../../../lib/games');
const gameview = require('../../../lib/gameview');

const GAMES = 'set/multiplayer/games/';
const BOTDATA = 'script/multiplayer/bot.data.lua';
const FILES = ['bots_generic.inc', 'presets_competitive.inc', 'presets_all.inc', 'presets_user.inc', 'presets_test.inc'];
// GoH: paths under set/multiplayer/games/ ([V] listing of the GoH install through lib/vfs exe goh)
const GOH_BOTS = 'presets/global_parameters/bots_generic.inc';
const GOH_FILES = [GOH_BOTS].concat(['preset', 'frontlines', 'laststand', 'preset_test'].flatMap(k => ['early', 'mid', 'late'].map(p => 'presets/' + k + '_' + p + '.inc')));
const NO_BOTDATA = 'GoH has no script/multiplayer/bot.data.lua: its bots buy in bot.main.lua and modes/*.lua';

// an error the page words itself (S6/S9): key = a bots.e.* string in four languages (lang.js), params = its slots; the English message
// stays for logs and the tests. gui.js sends {error, key, params}; page.js api() gives the page e.text = tx(key, params)
const bad = (msg, status, key, params) => Object.assign(new Error(msg), { status: status || 400 }, key ? { key, params: params || {} } : {});
const inside = (p, root) => { const r = path.relative(root, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

// the request's game: {id, kind, exe (for the vfs; none under AS64, as before), dir (the install: GoH folder under GoH, else the AS2 one)}
function gameOf(ctx) {
  const id = (ctx && ctx.gameId && ctx.gameId()) || 'as64', kind = games.kindOf(id) || 'as2';
  let dir = null;
  try { dir = kind === 'goh' ? (ctx.curDir ? ctx.curDir() : ctx.gohDir && ctx.gohDir()) : (ctx.game && ctx.game()); } catch (e) { /* no game */ }
  return { id, kind, exe: id === 'as64' ? undefined : games.exeOf(id), dir: dir || null };
}
const filesOf = ctx => (gameOf(ctx).kind === 'goh' ? GOH_FILES : FILES);
const noGoh = (ctx, what) => { if (gameOf(ctx).kind === 'goh') throw bad(games.notFor(what, 'goh', NO_BOTDATA, 'GHMIS-66'), 400, 'bots.e.goh'); };

// the mod folder the user picked: must exist, and may not be the game install (except <game>/mods/<mod>)
function checkMod(ctx, mod) {
  if (!mod || typeof mod !== 'string') throw bad('Pick a mod folder first (the Mods page).', 400, 'bots.e.pickMod');
  const p = path.resolve(mod);
  let st = null; try { st = fs.statSync(p); } catch (e) { /* missing */ }
  if (!st || !st.isDirectory()) throw bad('That mod folder does not exist: ' + mod, 400, 'bots.e.noMod', { mod });
  const g = gameOf(ctx).dir;
  if (g) {
    const G = path.resolve(g), M = path.join(G, 'mods');
    if (inside(p, G) && !(inside(p, M) && p !== M)) throw bad('Refused: that folder is part of the game install. Pick a folder of your own mod.', 400, 'bots.e.inGame');
  }
  return p;
}
// I-9: a write needs the game folder set (else the copy would be built from the mod alone and the game check is skipped), and the mod folder
// must pass the shared write guard (any AS2 install, GoH, Workshop by content, whatever game is set)
// THE WRITE GUARD (every writing, undoing and removing route of /api/x/bots goes through it): the mod path is normalised first (so
// "<mod>/../.." is judged as the folder it really is), then it must be an existing folder that holds mod.info (a plain folder is no mod),
// not the game folder, its resource or its mods root, and pass the shared write guard. rels (paths under resource/) are each held to
// safeFile. Returns the normalised mod folder.
function checkWrite(ctx, mod, rels) {
  if (!mod || typeof mod !== 'string') throw bad('Pick a mod folder first (the Mods page).', 400, 'bots.e.pickMod');
  mod = checkMod(ctx, path.resolve(mod));
  const g = gameOf(ctx).dir;
  if (!g) throw bad('Refused: the game folder is not set, so ARSENAL cannot check this mod folder is safe to write or read the game\'s own numbers. Press "Game folder..." in the top bar, then save again.', 400, 'bots.e.noGameDir');
  let info = null; try { info = fs.statSync(path.join(mod, 'mod.info')); } catch (e) { /* none */ }
  if (!info || !info.isFile()) throw bad('Refused: ' + mod + ' is not a mod folder (there is no mod.info in it). Pick the folder of your own mod.', 400, 'bots.e.notMod', { mod });
  for (const r of rels || []) safeFile(mod, r);
  const why = require('../../../lib/writeguard').refuseWrite(mod, { game: g, purpose: 'save bot settings' });
  if (why) throw bad(why, 400, 'bots.e.guard', { why });
  // JOBS (gui README): every writing route passes here with its ctx, so this is where the request is marked as one that writes into a
  // mod (the job list asks twice before it stops such a request)
  if (ctx && ctx.job) ctx.job.writes = true;
  if (ctx && typeof ctx === 'object') { let s = WROTE.get(ctx); if (!s) WROTE.set(ctx, s = new Set()); s.add(mod); }
  return mod;
}
// the mods a request passed through checkWrite: touchWrites(ctx, mod?) tells the shared mod listing to walk them again (called after
// the route's work, so a walk that read the folder before the write is not taken as fresh)
const WROTE = new WeakMap();
function touchWrites(ctx, mod) {
  if (!ctx || typeof ctx !== 'object') return 0;
  const s = WROTE.get(ctx), list = s ? [...s] : [];
  if (s) s.clear();
  if (mod && !list.includes(mod)) list.push(mod);
  let n = 0;
  if (ctx.modtree && typeof ctx.modtree.touch === 'function') for (const m of list) { try { ctx.modtree.touch(m); n++; } catch (e) { /* no listing kept */ } }
  return n;
}

// the game's own files: the one shared view of the request's game (lib/gameview: AS64 no exe, MoW:AS2 mowas_2, GoH goh, as before);
// null = no game folder, or a game that cannot be read. gameStamp = what that view was built from (paks + exe version)
function gameView(ctx, G) {
  G = G || gameOf(ctx);
  if (!G.dir) return null;
  try { return gameview.get({ gameDir: G.dir, gid: G.id }); } catch (e) { return null; }
}
function gameStamp(ctx, G) { G = G || gameOf(ctx); if (!G.dir) return ''; try { return gameview.stamp({ gameDir: G.dir, gid: G.id }); } catch (e) { return ''; } }
const gameKey = G => G.id + '|' + lowc(path.resolve(G.dir));
// the shared store of the request (ctx.cache); none (a caller with no server around it) = memory only
const storeOf = ctx => (ctx && ctx.cache && typeof ctx.cache.get === 'function' ? ctx.cache : null);
// vanilla file text (latin1, bytes kept) from the shared game view; kept per game, folder and file while the game stamp stands
const GCACHE = new Map();
function gameText(ctx, rel) {
  const G = gameOf(ctx);
  if (!G.dir) return null;
  const key = gameKey(G) + '|' + rel, st = gameStamp(ctx, G), c = GCACHE.get(key);
  if (c && c.stamp === st) return c.text;
  const v = gameView(ctx, G), t = v ? gameview.text(v, rel) : null;
  GCACHE.set(key, { stamp: st, text: t });
  return t;
}
// p strictly inside root: both resolved, compared with a trailing separator (so <mod>2 is not inside <mod>)
const lowc = s => (process.platform === 'win32' ? s.toLowerCase() : s);
const under = (p, root) => lowc(path.resolve(p)).startsWith(lowc(path.resolve(root)).replace(/[\\/]+$/, '') + path.sep);
// the path with links followed, for the part that exists (the rest is kept as written)
function realOf(p) {
  let d = path.resolve(p); const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(d), ...tail); } catch (e) { /* missing: one up */ }
    const up = path.dirname(d); if (up === d) return path.resolve(p);
    tail.unshift(path.basename(d)); d = up;
  }
}
// a file path under resource/ as a request may name it: no drive, no leading slash, no "." or ".." or empty part
function safeRel(rel) {
  const r = String(rel == null ? '' : rel).replace(/\\/g, '/');
  if (!r || r.startsWith('/') || /^[a-z]:/i.test(r) || r.includes('\0') || r.split('/').some(s => !s || s === '.' || s === '..')) throw bad('Refused: bad file path: ' + r, 400, 'bots.e.badPath', { file: r });
  return r;
}
// an absolute target must sit inside the mod folder, as written and with links followed; returns it
function guardFile(mod, p) {
  if (!under(p, mod) || !under(realOf(p), realOf(mod))) throw bad('Refused: ' + p + ' is outside the mod folder.', 400, 'bots.e.outside', { file: String(p) });
  return p;
}
// where a write of rel (under resource/) lands, checked: the one way a write target is made
const safeFile = (mod, rel) => guardFile(mod, path.join(path.resolve(mod), 'resource', ...safeRel(rel).split('/')));
// the mod's copy of rel (reads and writes): a rel that climbs out of <mod>/resource is refused
const modPath = (mod, rel) => {
  const root = path.join(mod, 'resource'), p = path.join(root, ...String(rel).split('/'));
  if (path.resolve(p) !== path.resolve(root) && !under(p, root)) throw bad('Refused: bad file path: ' + rel, 400, 'bots.e.badPath', { file: String(rel) });
  return p;
};
function modText(mod, rel) { const p = modPath(mod, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'latin1') : null; }
// effective = the mod's own copy, else the game's
function effective(ctx, mod, rel) {
  const m = modText(mod, rel);
  if (m != null) return { text: m, from: 'mod', vanilla: gameText(ctx, rel) };
  const g = gameText(ctx, rel);
  return { text: g, from: g == null ? null : 'game', vanilla: g };
}

// ---------- bot shopping list ----------
// GoH (GHMIS-66): no bot.data.lua; the lists are script/multiplayer/units/<army>/<list>.<army>.lua (tools/botrecipe/gohbuys, [I] read of the
// vanilla files, [T] in a match). Same reply shape as AS2 (stages -> armies -> {unit, cls, priority}) for ONE list (early, mid, late,
// conquest...): list = the asked one, lists = all found. Per army: repeats {army: Repeat}, files {army: {rel, from}}. A conquest row has
// no priority: availability (its weight), grade, tags. notRead = what the reader did not read, with file and line; modes = lobby mode ->
// which list its bot loads (bot.main.lua + modes/*.lua). Mod copies (loose) win over the game's, file by file.
function gohBuys(ctx, mod, want) {
  const GB = require('../../../botrecipe/gohbuys');
  const rels = new Set(), v = gameView(ctx);
  if (v) for (const k of v.files.keys()) { const r = k.replace(/^resource\//, ''); if (GB.fileOf(r) || r === GB.MAIN || new RegExp('^' + GB.MODES + '[a-z0-9_]+\\.lua$', 'i').test(r)) rels.add(r); }
  const walk = (d, rel) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const r = rel + '/' + e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else if (GB.fileOf(r)) rels.add(r); } };
  walk(modPath(mod, 'script/multiplayer/units'), 'script/multiplayer/units');
  for (const r of [GB.MAIN].concat(fs.existsSync(modPath(mod, 'script/multiplayer/modes')) ? fs.readdirSync(modPath(mod, 'script/multiplayer/modes')).filter(f => /\.lua$/i.test(f)).map(f => GB.MODES + f) : [])) rels.add(r);
  const lists = GB.sortLists([...rels].map(GB.fileOf).filter(Boolean).map(f => f.list));
  if (!lists.length) throw bad('No bot purchase lists found (script/multiplayer/units/<army>/<list>.<army>.lua). Press "Game folder..." in the top bar.', 404, 'bots.e.noGohList');
  const list = lists.includes(String(want || '').toLowerCase()) ? String(want).toLowerCase() : lists[0];
  const stages = [], files = {}, notRead = [], order = [];
  let fromMod = false;
  for (const rel of [...rels].sort()) {
    const f = GB.fileOf(rel); if (!f || f.list !== list) continue;
    const e = effective(ctx, mod, rel); if (e.text == null) continue;
    const r = GB.readList(e.text, rel);
    files[f.army] = { rel, from: e.from }; if (e.from === 'mod') fromMod = true;
    if (!order.includes(f.army)) order.push(f.army);
    for (const x of r.notRead) notRead.push(Object.assign({ from: e.from }, x));
    r.stages.forEach((s, i) => {
      if (!stages[i]) { stages[i] = { n: i + 1, repeat: s.repeat, repeats: {}, armies: {} }; }
      stages[i].repeats[f.army] = s.repeat;
      stages[i].armies[f.army] = s.units.map(u => ({ unit: u.unit, cls: u.cls, priority: u.priority, availability: u.availability, grade: u.grade, tags: u.tags, line: u.line }));
    });
  }
  const texts = {};
  for (const rel of rels) if (!GB.fileOf(rel)) { const e = effective(ctx, mod, rel); if (e.text != null) texts[rel] = e.text; }
  const M = GB.modesOf(texts);
  for (const x of M.notRead) notRead.push(x);
  const labels = {}, lobby = armyNames(ctx, mod, order);
  for (const a of order) labels[a] = lobby[a] || ARMY_NAMES[a] || a;
  const all = new Set(); for (const s of stages) if (s) for (const a of Object.keys(s.armies)) for (const r of s.armies[a]) if (r.unit) all.add(r.unit);
  return { game: 'goh', from: fromMod ? 'mod' : 'game', list, lists, armies: order, labels, stages: stages.filter(Boolean), files, modes: M.modes, notRead, cards: [], classes: [], compared: true, ownBot: false, names: namesOf(ctx, mod, [...all]) };
}

function buys(ctx, mod, list) {
  if (gameOf(ctx).kind === 'goh') return gohBuys(ctx, mod, list);
  noGoh(ctx, 'bots: what bots buy');
  const e = effective(ctx, mod, BOTDATA);
  if (e.text == null) throw bad('No bot shopping list found. Press "Game folder..." in the top bar, or put script/multiplayer/bot.data.lua in your mod.', 404, 'bots.e.noList');
  let t;
  try { t = luatable.parse(e.text); } catch (err) { throw bad('The bot list could not be read: ' + err.message, 400, 'bots.e.badList', { m: err.message, from: e.from }); }
  const P = t.globals.Purchases;
  const stages = (P && P.arr || []).map((s, i) => {
    const U = s.hash.Units && s.hash.Units.hash || {}, armies = {};
    for (const a of Object.keys(U)) armies[a] = (U[a].arr || []).map(r => ({ unit: r.hash.unit, cls: r.hash.class && r.hash.class.ref ? r.hash.class.ref.replace(/^UnitClass\./, '') : String(r.hash.class), priority: r.hash.priority }));
    return { n: i + 1, repeat: s.hash.Repeat, armies };
  });
  // every army of every stage, in list order; its in-game name from the list's comment, else the game list's, else the stock name (S11)
  const order = [];
  for (const s of stages) for (const a of Object.keys(s.armies)) if (!order.includes(a)) order.push(a);
  const own = labelsIn(e.text), van = e.vanilla && e.vanilla !== e.text ? labelsIn(e.vanilla) : {}, labels = {};
  const lobby = armyNames(ctx, mod);
  for (const a of order) labels[a] = lobby[a] || nameLike(own[a]) || nameLike(van[a]) || ARMY_NAMES[a] || shortName(own[a]) || a;
  const listed = new Set();
  for (const s of stages) for (const a of Object.keys(s.armies)) for (const r of s.armies[a]) listed.add(a + '|' + r.unit);
  // buy cards the mod ADDS or CHANGES that no bot list names (GT-14). A card is the mod's when the game's own units sets
  // have no card of that unit, or have it with a different line. A copied game file adds nothing by itself.
  // the army of a card is its own s(<army>) (a squad: side(<army>)), never the file name: helper files (vehicles_x.set, vehicles_xnotanks.set:
  // heroes, off-map support, crews) hold cards no bot can buy and are left out (fix3 T1, S17)
  const cards = [], vc = gameCards(ctx), known = sArmies(modScan(mod), gameScan(ctx));   // the real armies: once, not per file
  for (const rel of unitsFiles(mod)) {
    if (!/\.(?:set|inc)$/i.test(rel)) continue;
    let txt; try { txt = fs.readFileSync(modPath(mod, rel), 'latin1'); } catch (e) { continue; }
    const f = rel.replace(/^set\/multiplayer\/units\//, '');
    for (const c of resolve([[rel, cardsIn(txt)]], known)) {
      if (!c.army) continue;
      let how = 'new';
      if (vc) { const v = vc.get(c.unit); if (v) { if (v.has(c.norm)) continue; how = 'changed'; } }
      if (!labels[c.army]) labels[c.army] = lobby[c.army] || ARMY_NAMES[c.army] || c.army;
      cards.push({ unit: c.unit, army: c.army, file: f, how: vc ? how : null, listed: listed.has(c.army + '|' + c.unit) || stages.some(s => Object.values(s.armies).some(l => l.some(r => r.unit === c.unit))) });
    }
  }
  const all = new Set(cards.map(c => c.unit));
  for (const s of stages) for (const a of Object.keys(s.armies)) for (const r of s.armies[a]) if (r.unit) all.add(r.unit);
  return { from: e.from, armies: order, labels, stages, cards, classes: classesIn(e.text), compared: !!vc, ownBot: fs.existsSync(modPath(mod, 'script/multiplayer/bot.lua')), names: namesOf(ctx, mod, [...all]) };
}

// the in-game army names of the stock MoW:AS2 / AS64 bot list ([V] its ["army"] = {--Name comments, chainn3 stock copy): the name when a
// mod's own list has no comments. armyName(code) for the other routes (unit index hints)
// ger_ss, rus_guard, axis_minor: the lobby names of RobZ Realism 1.31.0 (#dlg_mp.lng {"army" ...}) without their year range [V]
// These are the English names (logs, CLI, the fallback). The page words an army in the window language from its CODE (kit.army, lang keys
// bots.army.<code>, one per code here: test.js checks it), so every reply that names an army carries the code too: buys labels {code: name},
// units [].army + armies {code: name}, error params armyCode / homeCodes beside army / home
const ARMY_NAMES = { eng: 'Commonwealth', ger: 'Germany', ger2: 'Ostfront Veteranen', usa: 'USA', rus: 'Soviet Union', jap: 'Japan', ita: 'Italy', fin: 'Finland', hun: 'Hungary', fra: 'France', pol: 'Poland', rom: 'Romania', chi: 'China',
  ger_ss: 'Waffen-SS', rus_guard: 'Guards Army', axis_minor: 'Axis Minors' };
// a long name (a list comment can be a sentence) is cut at a word end, never mid-word: "...captured German heavies). Whole" -> "Germany 1940-45…"
function shortName(s, max, whole) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); max = max || 32;
  if (!s) return '';
  const first = whole ? s : s.split(/\s+--\s*|[.;:!?](?:\s|$)|\s\(/)[0].trim();
  if (first && first.length <= max) return first;
  const cut = s.slice(0, max + 1), i = cut.lastIndexOf(' ');
  return (i > 8 ? cut.slice(0, i) : s.slice(0, max)).replace(/[\s,;:(\-]+$/, '') + '…';
}
// a list comment used as a name only when it reads like one (short, no sentence): --Soviets yes, a note about the roster no
function nameLike(s) { s = String(s == null ? '' : s).trim(); return s && s.length <= 32 && !/[.;:!?](?:s|$)|s--|[()]/.test(s) ? s : ''; }
// every army code -> its name: the lobby names of the mod and the game ({"army" ...} of the .lng texts, via the stages part), else the
// stock names above, else the code. Asked lazily: a missing part gives the stock names only
// GoH: the lobby names of its .pot texts (gohtext.js: armies/<code>.set title, worded by task/recipes/army.goh textOf)
function armyNames(ctx, mod, codes) {
  let lobby = {};
  if (gameOf(ctx).kind === 'goh') { try { lobby = require('./gohtext').armyNames(ctx, mod, codes) || {}; } catch (e) { lobby = {}; } }
  else try { const c = require('./parts/stages/cards'); if (c && typeof c.armyNamesOf === 'function') lobby = c.armyNamesOf(ctx, mod) || {}; } catch (e) { lobby = {}; }
  const out = {};
  for (const [a, v] of Object.entries(lobby)) { const s = shortName(String(v).replace(/\s*\(\d{4}\s*-\s*\d{4}\)\s*$/, ''), 32, true); if (s) out[a] = s; }
  return out;
}
// the unit classes the list defines (UnitClass = { Infantry = "infantry", ... }), stock eight when it has none
const CLASSES = ['Infantry', 'ATInfantry', 'Vehicle', 'Tank', 'AATank', 'ATTank', 'HeavyTank', 'ArtilleryTank'];
function classesIn(text) {
  const m = /\bUnitClass\s*=\s*\{([^}]*)\}/.exec(String(text || ''));
  const ks = m ? [...m[1].matchAll(/\b([A-Za-z]\w*)\s*=/g)].map(x => x[1]) : [];
  return ks.length ? ks : CLASSES.slice();
}
function labelsIn(text) { const o = {}; for (const m of String(text || '').matchAll(/\[\s*"(\w+)"\s*\]\s*=\s*\{\s*--([^\r\n]*)/g)) { const v = m[2].trim(); if (v && !o[m[1]]) o[m[1]] = v; } return o; }
const armyName = a => ARMY_NAMES[a] || a;

// in-game names {unit: text} (desc/entity/<unit>, else desc/squad/<unit>, mod text over the game's): the stages part reads them already
// (parts/stages/cards.js namesOf, [V] there); asked lazily so a missing or changed part leaves the names out, never breaks the frame.
// GoH: from its .pot texts (gohtext.js: desc/squad/<card>, else desc/entity/<card>, the keys pricecalc/goh names() uses)
function namesOf(ctx, mod, units) {
  if (!units || !units.length) return {};
  if (gameOf(ctx).kind === 'goh') { try { return require('./gohtext').namesOf(ctx, mod, units) || {}; } catch (e) { return {}; } }
  try {
    const c = require('./parts/stages/cards');
    if (c && typeof c.namesOf === 'function') return c.namesOf(ctx, mod, units) || {};
  } catch (e) { /* no names */ }
  return {};
}

// one buy card per line: {"unit" (...) {level N} ...}. norm = the line without comment and with spacing collapsed, so a re-indented copy still matches
function cardLines(txt) {
  const out = [];
  for (const m of txt.matchAll(/^[ \t]*\{"([^"]+)"[^\r\n]*/gm)) out.push({ unit: m[1], norm: m[0].replace(/;.*$/, '').replace(/\s+/g, ' ').trim() });
  return out;
}
// the buy cards of one units set with their real army: [{unit, army|null, norm}]. A card {"unit" ("vs" ... s(<army>) ...)} names its army in
// s(); a squad is made by a line ("squad_withNtypes" side(<army>) name(<name>) ...) and is bought as "<name>(<army>)" ([V] stock squads.set).
// A card with no s() (vehicles_x.set heroes and off-map support "extra", crews "mp/rus/tankman" side(rus)) has no army: no bot buys it
function cardsIn(txt) {
  const out = [];
  for (const m of String(txt).matchAll(/^[ \t]*\{"([^"%]+)"[^\r\n]*/gm)) {
    const s = /\bs\(([A-Za-z0-9_]+)\)/.exec(m[0]);
    out.push({ unit: m[1], army: s ? s[1].toLowerCase() : null, norm: m[0].replace(/;.*$/, '').replace(/\s+/g, ' ').trim() });
  }
  for (const m of String(txt).matchAll(/^[ \t]*\("\w+"[^\r\n]*/gm)) {
    const sd = /\bside\(([A-Za-z0-9_]+)\)/.exec(m[0]), nm = /\bname\(([A-Za-z0-9_]+)\)/.exec(m[0]);
    if (sd && nm) out.push({ unit: nm[1] + '(' + sd[1] + ')', army: sd[1].toLowerCase(), norm: m[0].replace(/;.*$/, '').replace(/\s+/g, ' ').trim() });
  }
  return out;
}
// the game's own buy cards: unit -> Set of normalized lines, from every units set the game has (null when the game folder is not set or unreadable)
const VCACHE = new Map();   // game id|folder -> {stamp, res}: the scan in memory while the game stamp stands
const CARDS_SECTION = 'bots.gamecards', CARDS_VER = 1;
const cardsParts = G => ({ game: lowc(path.resolve(G.dir)).replace(/\\/g, '/'), gid: G.id });
const packScan = s => ({ cards: [...s.cards].map(([u, v]) => [u, [...v]]), armies: [...s.armies].map(([u, v]) => [u, [...v]]), sides: [...s.sides] });
const unpackScan = v => ({ cards: new Map(v.cards.map(([u, l]) => [u, new Set(l)])), armies: new Map(v.armies.map(([u, l]) => [u, new Set(l)])), sides: new Set(v.sides) });
function gameCards(ctx) { const s = gameScan(ctx); return s ? s.cards : null; }
// the scan made now, from the shared game view (no store): null = the game cannot be read
function gameScanFresh(ctx, G) {
  G = G || gameOf(ctx);
  try {
    const vfs = require('../../../lib/vfs'), v = gameView(ctx, G), cards = new Map(), armies = new Map(), files = [], sides = new Set();
    if (!v) return null;
    try {
      for (const [k, r] of v.files) {
        if (!/^resource\/set\/multiplayer\/units\/.+\.(?:set|inc)$/i.test(k)) continue;
        const list = cardsIn(vfs.readRec(r).toString('latin1')); files.push([k, list]); for (const c of list) if (c.army) sides.add(c.army);
      }
    } finally { if (vfs.closeRecs) vfs.closeRecs(); }
    addCards(resolve(files, sArmies({ sides })), cards, armies);
    return { cards, armies, sides };
  } catch (e) { return null; }
}
// {cards: unit -> Set of normalized lines, armies: unit -> Set of real armies} of every units set the game has (subfolders too); null = no game.
// Kept in the shared store as plain lists (stamp game), so a restart does not read the units sets again
function gameScan(ctx) {
  const G = gameOf(ctx);
  if (!G.dir) return null;
  const key = gameKey(G), st = gameStamp(ctx, G), c = VCACHE.get(key);
  if (c && c.stamp === st) return c.res;
  const S = storeOf(ctx), stamps = { game: st };
  let res = null, hit = null;
  try { hit = S && S.get(CARDS_SECTION, CARDS_VER, cardsParts(G), stamps); } catch (e) { hit = null; }
  if (hit && hit.value && Array.isArray(hit.value.cards)) { try { res = unpackScan(hit.value); } catch (e) { res = null; } }
  if (!res) {
    res = gameScanFresh(ctx, G);
    if (res && S) { try { S.put(CARDS_SECTION, CARDS_VER, cardsParts(G), stamps, packScan(res)); } catch (e) { /* best effort */ } }
  }
  VCACHE.set(key, { stamp: st, res });
  return res;
}
// what is held in memory is dropped (the Prepare screen's Clear, and its run when the store has lost an entry): the next ask reads the
// store or the game again
function forget() { GCACHE.clear(); VCACHE.clear(); GU_MEMO.clear(); try { require('./gohtext').forget(); } catch (e) { /* none */ } try { require('./parts/buycheck/gohcards').forget(); } catch (e) { /* none */ } }
// for the Prepare section: is the game's card scan in the store (no read of the value)
function gameScanState(ctx) {
  const G = gameOf(ctx), S = storeOf(ctx);
  if (!G.dir || !S) return { state: 'none', why: [] };
  return S.state(CARDS_SECTION, CARDS_VER, cardsParts(G), { game: gameStamp(ctx, G) });
}
// the army a file or folder name gives: units/ger_ss/vehicles_41.set -> ger_ss, vehicles_ger.set -> ger, vehicles_xnotanks.set -> none
function fileArmy(rel, known) {
  const parts = String(rel).replace(/\\/g, '/').split('/'), base = parts.pop().replace(/\.(?:set|inc)$/i, '').toLowerCase(), dir = (parts.pop() || '').toLowerCase();
  if (known.has(dir)) return dir;
  const w = base.split('_');
  for (let i = 1; i < w.length; i++) { const a = w.slice(i).join('_'); if (known.has(a)) return a; }
  return null;
}
// [[rel, cards]] -> cards with army filled from the file name where the card has no s() (known = the real armies)
function resolve(files, known) {
  const out = [];
  // helper files (vehicles_x.set heroes, vehicles_xnotanks.set crews and support; a mod's units_x.set) hold no army's cards, even with s()
  for (const [rel, list] of files) { const fa = fileArmy(rel, known); if (/_x[a-z]*.(?:set|inc)$/i.test(rel)) { for (const c of list) out.push(Object.assign({}, c, { army: null })); continue; } for (const c of list) out.push(c.army || !fa || c.unit.includes('%') ? c : Object.assign({}, c, { army: fa })); }
  return out;
}
const sArmies = (...scans) => { const k = new Set(Object.keys(ARMY_NAMES)); for (const s of scans) if (s && s.sides) for (const a of s.sides) k.add(a); return k; };
function addCards(list, cards, armies) {
  for (const c of list) {
    if (!cards.has(c.unit)) cards.set(c.unit, new Set()); cards.get(c.unit).add(c.norm);
    if (!armies.has(c.unit)) armies.set(c.unit, new Set()); if (c.army) armies.get(c.unit).add(c.army);
  }
}
// the same for the mod's own units sets (read on each ask: a small folder)
function modScan(mod) {
  const cards = new Map(), armies = new Map(), files = [], sides = new Set();
  if (mod) for (const rel of unitsFiles(mod)) {
    if (!/\.(?:set|inc)$/i.test(rel)) continue;
    try { const list = cardsIn(fs.readFileSync(modPath(mod, rel), 'latin1')); files.push([rel, list]); for (const c of list) if (c.army) sides.add(c.army); } catch (e) { /* unreadable */ }
  }
  addCards(resolve(files, sArmies({ sides })), cards, armies);
  return { cards, armies, sides };
}
// unitArmy(ctx, mod, unit) -> {card: true|false|null (null = no game to ask), armies: [real armies]} (the buy check part uses it too)
function unitArmy(ctx, mod, unit) {
  const m = modScan(mod), g = gameScan(ctx), set = new Set();
  for (const s of [m, g]) if (s && s.armies.has(unit)) for (const a of s.armies.get(unit)) set.add(a);
  const card = m.cards.has(unit) || (g ? g.cards.has(unit) : false);
  return { card: card ? true : (g && g.cards.size ? false : null), armies: [...set] };
}

// the unit names a buy card can name, for the searchKit index and Browse of the "unit" and "copy the card of" boxes (owner 2026-11-19):
// every buy card in the game's units sets (vfs, army from the file name _<army>.set) and in the mod's own units folder, by army.
// GoH: the units its purchase lists name (gohUnits; no buy cards read there, GHMIS-66). Game part: gameScan (shared store); the mod part
// is read on each ask (a small folder)
function unitList(ctx, mod) {
  if (gameOf(ctx).kind === 'goh') { const none = e => { if (e.status === 404) return { units: [], cannot: [], goh: true, armies: {}, lists: [], kinds: [] }; throw e; }; try { return gohUnitsCached(ctx, mod).catch(none); } catch (e) { return none(e); } }
  // units = the buyable ones, one row per real army (S17); cannot = cards with no army (heroes, off-map support, crews: why 'noArmy'),
  // shown only under "Show units that bots cannot buy". cls = the unit's kind in the bot list (a squad: Infantry), for the add form
  const seen = new Set(), units = [], cannot = [], g = gameScan(ctx), m = modScan(mod), lobby = armyNames(ctx, mod);
  const put = (unit, army, src) => { const k = army + '|' + unit; if (!unit || seen.has(k)) return; seen.add(k); units.push({ unit, army, src }); };
  const noArmy = new Map();
  for (const [s, src] of [[g, 'game'], [m, 'mod']]) if (s) for (const [u, as] of s.armies) {
    if (as.size) for (const a of as) put(u, a, src); else if (!noArmy.has(u)) noArmy.set(u, src);
  }
  // soldier and crew cards (mp/<army>/tankman) are parts of squads and vehicles, not units anyone picks: left out of both lists
  for (const [u, src] of noArmy) if (!u.includes('/') &&!units.some(x => x.unit === u)) cannot.push({ unit: u, army: null, src, why: 'noArmy' });
  const cls = {}; try { const e = effective(ctx, mod, BOTDATA); for (const x of String(e && e.text || '').matchAll(/\bclass\s*=\s*UnitClass\.(\w+)[^\r\n{}]*?\bunit\s*=\s*"([^"]+)"/g)) if (!cls[x[2]]) cls[x[2]] = x[1]; } catch (e) { /* no list */ }
  const names = namesOf(ctx, mod, [...new Set(units.concat(cannot).map(u => u.unit))]);
  for (const u of units.concat(cannot)) {
    if (names[u.unit]) u.name = names[u.unit];
    if (u.army) u.armyName = lobby[u.army] || armyName(u.army);
    u.cls = cls[u.unit] || (/\(\w+\)$/.test(u.unit) ? 'Infantry' : null);
  }
  return { units, cannot, armies: Object.assign({}, ...[...new Set(units.map(u => u.army))].map(a => ({ [a]: lobby[a] || armyName(a) }))) };
}

// ---------- editable numbers (difficulty + start presets) ----------
// scan(file, text) -> [{id, group, field, kind, value, a, b}] ; a..b = char range of the value in text. id is meaning based, so mod copy and vanilla line up.
function scan(file, text) {
  if (file === GOH_BOTS) return scanGohBots(file, text);
  if (/^presets\//.test(file)) return scanGohPresets(file, text);
  const out = [];
  const add = (id, group, field, kind, ix) => out.push({ id: file + '|' + id, group, field, kind, value: text.slice(ix[0], ix[1]), a: ix[0], b: ix[1] });
  if (file === 'bots_generic.inc') {
    for (const m of text.matchAll(/\{(\w+)\s*\r?\n\s*\{balancingFactorBonus\s+\{cp\s+([\d.]+)\}\s*\{mp\s+([\d.]+)\}\s*\{payback\s+([\d.]+)\}/gd)) {
      add(m[1] + '|cp', m[1], 'botCp', 'num', m.indices[2]); add(m[1] + '|mp', m[1], 'botMp', 'num', m.indices[3]); add(m[1] + '|payback', m[1], 'botPayback', 'num', m.indices[4]);
    }
    return out;
  }
  // presets: ("define_name" start(N) finish(N) cp(N)) under {"s:key" ...}
  const heads = [...text.matchAll(/^\s*\{"([^"]+)"/gm)].map(m => ({ i: m.index, k: m[1] }));
  for (const m of text.matchAll(/\(\s*"(\w+)"\s+start\((\d+)\)\s+finish\((\d+)\)\s+cp\((\d+)\)\)/gd)) {
    const h = heads.filter(x => x.i < m.index).pop(), key = h ? h.k : m[1];
    add(key + '|start', key, 'start', 'int', m.indices[2]); add(key + '|finish', key, 'finish', 'int', m.indices[3]); add(key + '|cp', key, 'cp', 'int', m.indices[4]);
  }
  // define blocks: growTime, balancing cp/mp, payback rows (first of each inside the block)
  const defs = [...text.matchAll(/^\(define\s+"(\w+)"/gm)], pe = text.indexOf('{presets');
  defs.forEach((d, i) => {
    const from = d.index, to = i + 1 < defs.length ? defs[i + 1].index : (pe > from ? pe : text.length), blk = text.slice(from, to), nm = d[1];
    const sh = ix => [ix[0] + from, ix[1] + from];
    let m = /\{growTime\s+(\d+)\}/d.exec(blk); if (m) add(nm + '|growTime', nm, 'growTime', 'int', sh(m.indices[1]));
    m = /\{balancingFactorBonus\s+\{cp\s+([\d.]+)\}\s*\{mp\s+([\d.]+)\}/d.exec(blk);
    if (m) { add(nm + '|bonusCp', nm, 'bonusCp', 'num', sh(m.indices[1])); add(nm + '|bonusMp', nm, 'bonusMp', 'num', sh(m.indices[2])); }
    m = /\{payback\s+\{cp\s+"([^"]*)"\}[^{]*\{restore\s+"([^"]*)"\}/d.exec(blk);
    if (m) { add(nm + '|paybackCp', nm, 'paybackCp', 'row', sh(m.indices[1])); add(nm + '|paybackRestore', nm, 'paybackRestore', 'row', sh(m.indices[2])); }
  });
  return out;
}

// ---- GoH forms. live(): comments (; to line end, outside quotes) blanked to spaces, so offsets stay those of the text
function live(s) {
  let o = '', q = false;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '"' || c === '\n') q = false; o += c; continue; }
    if (c === '"') { q = true; o += c; continue; }
    if (c === ';') { while (j < s.length && s[j] !== '\n' && s[j] !== '\r') { o += ' '; j++; } j--; continue; }
    o += c;
  }
  return o;
}
// GoH presets/global_parameters/bots_generic.inc: {<difficulty> {unitset ..} {balancingFactorBonus {cp N} {mpStart N} {mpFinish N} {payback N}
// {chargeDelay N} {charge N}} {unitScore N}} [V vanilla GoH file]. cp and payback keep the AS2 field ids (botCp, botPayback)
const GOH_BOT_FIELDS = [['cp', 'botCp'], ['mpStart', 'mpStart'], ['mpFinish', 'mpFinish'], ['payback', 'botPayback'], ['chargeDelay', 'chargeDelay'], ['charge', 'charge'], ['unitScore', 'unitScore']];
function scanGohBots(file, text) {
  const out = [], t = live(text), heads = [...t.matchAll(/^\{(\w+)[ \t]*$/gm)];
  heads.forEach((h, i) => {
    const from = h.index, to = i + 1 < heads.length ? heads[i + 1].index : t.length, blk = t.slice(from, to);
    for (const [k, f] of GOH_BOT_FIELDS) {
      const m = new RegExp('\\{' + k + '\\s+([\\d.]+)\\s*\\}', 'd').exec(blk);
      if (m) { const a = from + m.indices[1][0], b = from + m.indices[1][1]; out.push({ id: file + '|' + h[1] + '|' + k, group: h[1], field: f, kind: 'num', value: text.slice(a, b), a, b }); }
    }
  });
  return out;
}
// GoH presets/*.inc: under {presets {"s:key" ... ("define" start(N) finish(N) doctrine(N) cp(0:100,900:150))}}; frontlines and last stand
// name each side (start_a, cp_b ...). Every name(value) of the call is a row: whole numbers 'int', time:value steps 'steps' [V vanilla GoH files]
function scanGohPresets(file, text) {
  const out = [], t = live(text), pe = t.search(/\{presets\b/);
  if (pe < 0) return out;
  const heads = [...t.matchAll(/^\s*\{"([^"]+)"/gm)].map(m => ({ i: m.index, k: m[1] }));
  const seen = new Set();
  for (const m of t.matchAll(/\(\s*"(\w+)"([^()\r\n]*(?:\([^()\r\n]*\)[^()\r\n]*)+)\)/gd)) {
    if (m.index < pe) continue;
    const h = heads.filter(x => x.i < m.index).pop(), key = h ? h.k : m[1], at = m.indices[2][0];
    for (const p of m[2].matchAll(/(\w+)\(\s*([^()]*?)\s*\)/gd)) {
      const v = p[2], kind = /^\d+$/.test(v) ? 'int' : /^\d+:\d+(,\d+:\d+)*$/.test(v) ? 'steps' : null;
      const id = file + '|' + key + '|' + p[1];
      if (!kind || seen.has(id)) continue;
      seen.add(id);
      const a = at + p.indices[2][0], b = at + p.indices[2][1];
      out.push({ id, group: key, field: p[1], kind, part: 'preset', value: text.slice(a, b), a, b });
    }
  }
  return out;
}

// value errors: params g (the row's group), f (its field id; the page shows the field's name), v (what was typed), n (the count to keep)
function checkValue(it, v) {
  const s = String(v).trim(), P = n => ({ g: it.group, f: it.field, v: s, n });
  if (it.kind === 'steps') {
    if (!/^\d+(:\d+)?(,\d+:\d+)*$/.test(s)) throw bad(it.group + ' ' + it.field + ': use time:value steps separated by commas, for example 0:100,900:150.', 400, 'bots.e.val.steps', P());
    if (s.split(',').length !== it.value.trim().split(',').length) throw bad(it.group + ' ' + it.field + ': keep the same count of steps (' + it.value.trim().split(',').length + ').', 400, 'bots.e.val.stepsN', P(it.value.trim().split(',').length));
    return s;
  }
  if (it.kind === 'int') { if (!/^\d+$/.test(s) || Number(s) > 1e7) throw bad(it.group + ' ' + it.field + ': use a whole number (0 to 10000000).', 400, 'bots.e.val.int', P()); return String(Number(s)); }
  if (it.kind === 'num') { if (!/^\d+(\.\d+)?$/.test(s) || Number(s) > 100) throw bad(it.group + ' ' + it.field + ': use a number from 0 to 100, for example 1.25.', 400, 'bots.e.val.num', P()); return s; }
  if (!/^\d+(\.\d+)?([ \t]+\d+(\.\d+)?)*$/.test(s)) throw bad(it.group + ' ' + it.field + ': use numbers separated by spaces.', 400, 'bots.e.val.row', P());
  if (s.split(/\s+/).length !== it.value.trim().split(/\s+/).length) throw bad(it.group + ' ' + it.field + ': keep the same count of numbers (' + it.value.trim().split(/\s+/).length + ').', 400, 'bots.e.val.rowN', P(it.value.trim().split(/\s+/).length));
  return s;
}
const unknownFile = file => bad('Unknown file: ' + file, 400, 'bots.e.file', { file: String(file) });
const cannotRead = file => bad('Cannot read ' + file + '. Press "Game folder..." in the top bar.', 404, 'bots.e.read', { file: String(file) });

function table(ctx, mod, file) {
  if (!filesOf(ctx).includes(file)) throw unknownFile(file);
  const e = effective(ctx, mod, GAMES + file);
  if (e.text == null) throw cannotRead(file);
  const cur = scan(file, e.text), van = new Map(scan(file, e.vanilla == null ? e.text : e.vanilla).map(i => [i.id, i.value]));
  return { file, from: e.from, rows: cur.map(i => Object.assign({ id: i.id, group: i.group, field: i.field, kind: i.kind, vanilla: van.has(i.id) ? van.get(i.id) : i.value, current: i.value }, i.part ? { part: i.part } : {})) };
}

// apply {id: value} to the effective text. dry = no write. Returns the change list; writes a full copy into the mod (CRLF and bytes kept).
function edit(ctx, mod, file, changes, write) {
  if (!filesOf(ctx).includes(file)) throw unknownFile(file);
  if (write) checkWrite(ctx, mod, [GAMES + file]);
  const e = effective(ctx, mod, GAMES + file);
  if (e.text == null) throw cannotRead(file);
  const items = scan(file, e.text), byId = new Map(items.map(i => [i.id, i]));
  const list = [];
  for (const id of Object.keys(changes || {})) {
    const it = byId.get(id); if (!it) throw bad('Unknown setting: ' + id, 400, 'bots.e.setting', { id });
    const nv = checkValue(it, changes[id]);
    if (nv !== it.value.trim()) list.push({ it, nv });
  }
  list.sort((x, y) => y.it.a - x.it.a);
  let t = e.text;
  for (const c of list) t = t.slice(0, c.it.a) + c.nv + t.slice(c.it.b);
  const res = { file, changes: list.map(c => ({ id: c.it.id, group: c.it.group, field: c.it.field, was: c.it.value, now: c.nv })).reverse(), written: false, target: modPath(mod, GAMES + file), copiesWholeFile: e.from !== 'mod' };
  if (write && list.length) {
    checkWrite(ctx, mod);
    const u = undo.save(ctx, mod, GAMES + file);
    const p = modPath(mod, GAMES + file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'latin1'); res.written = true;
    res.undo = [u.commit()];
  }
  return res;
}

// "back to vanilla": remove the mod's copy of one of these files (undoable: the copy's bytes are kept for Undo)
function reset(ctx, mod, file, write) {
  if (!filesOf(ctx).includes(file)) throw unknownFile(file);
  if (write) checkWrite(ctx, mod, [GAMES + file]);
  const p = modPath(mod, GAMES + file), have = fs.existsSync(p);
  let un = null;
  if (write && have) { checkWrite(ctx, mod); const u = undo.save(ctx, mod, GAMES + file); fs.unlinkSync(p); un = [u.commit()]; }
  return Object.assign({ file, target: p, had: have, removed: write && have }, un ? { undo: un } : {});
}

// ---------- undo (S4, S13): the before-bytes of each write, kept outside the mod, put back exactly, a stack per file ----------
// lib.undo.save(ctx, mod, rel, before?, dirs?) BEFORE a write (rel = the path under resource/, as modPath takes it) -> ticket {rel, id, commit(), drop()}:
// a new entry on top of that file's stack (at most undo.MAX, the oldest dropped). It notes the folders the write will make (the missing
// ones above the file now; dirs = that list when before is given after the write). ticket.commit() AFTER the write records what the write
// left (its hash, or "absent") and returns {rel, id} for the page. lib.undo.restore(ctx, mod, rel, id?) puts the top entry's bytes back
// (or removes a file the write made, then the folders it made when empty) and pops it, so the next Undo goes one more step back. It refuses
// (bots.e.undoChanged) when the file is no longer what the write left, or when id names an older write of the same file (undo the later
// one first); bots.e.undoNone when the stack is empty. With no commit it restores anyway (no change check). lib.undo.state(ctx, mod, rel)
// = {rel, n, id, ok, key} for the page (Undo greyed until ok). Kept under ctx.tmpRoot/bots-undo/<hash of mod|rel>/ (stack.json + before-<id>).
const crypto = require('crypto'), os = require('os');
const UNDO_MAX = 20;
const sha = b => crypto.createHash('sha1').update(b).digest('hex');
const undoRoot = ctx => path.join((ctx && ctx.tmpRoot) || path.join(os.tmpdir(), 'arsenal-gui'), 'bots-undo');
const undoDir = (ctx, mod, rel) => path.join(undoRoot(ctx), sha(path.resolve(mod).toLowerCase() + '|' + rel.toLowerCase()).slice(0, 24));
function cleanRel(rel) {
  const r = String(rel == null ? '' : rel).replace(/\\/g, '/');
  if (!r || r.startsWith('/') || /^[a-z]:/i.test(r) || r.includes('\0') || r.split('/').some(s => !s || s === '.' || s === '..')) throw bad('Bad file for undo: ' + r, 400, 'bots.e.undoBad', { file: r });
  return r;
}
function readStack(d) {
  try { const s = JSON.parse(fs.readFileSync(path.join(d, 'stack.json'), 'utf8')); if (Array.isArray(s)) return s; } catch (e) { /* none */ }
  try { const m = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')); if (m && m.id) return [Object.assign({ dirs: [] }, m)]; } catch (e) { /* none */ }   // an entry of the one-step undo
  return [];
}
function writeStack(d, s) {
  if (!s.length) { fs.rmSync(d, { recursive: true, force: true }); return; }
  fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'stack.json'), JSON.stringify(s)); fs.rmSync(path.join(d, 'meta.json'), { force: true });
}
const beforeOf = (d, e) => path.join(d, fs.existsSync(path.join(d, 'before-' + e.id)) ? 'before-' + e.id : 'before');
// the folders above p (up to the mod folder) that do not exist now, deepest first
function missingDirs(mod, p) {
  const root = path.resolve(mod), out = [];
  for (let d = path.dirname(path.resolve(p)); d.startsWith(root + path.sep) && !fs.existsSync(d); d = path.dirname(d)) out.push(d);
  return out;
}
const undo = {
  MAX: UNDO_MAX,
  // before: the bytes to put back (Buffer) or null = the file did not exist; omitted = the file as it is now
  save(ctx, mod, rel, before, dirs) {
    rel = cleanRel(rel);
    const p = safeFile(mod, rel), d = undoDir(ctx, mod, rel);
    const b = before !== undefined ? before : (fs.existsSync(p) ? fs.readFileSync(p) : null);
    const made = Array.isArray(dirs) ? dirs.map(x => path.resolve(x)) : (before === undefined && !b ? missingDirs(mod, p) : []);
    const s = readStack(d).filter(e => e.after != null);   // an entry never committed (its write failed) is dropped
    const id = crypto.randomBytes(6).toString('hex');
    fs.mkdirSync(d, { recursive: true });
    if (b) fs.writeFileSync(path.join(d, 'before-' + id), b);
    s.push({ mod: path.resolve(mod), rel, had: !!b, id, after: null, at: Date.now(), dirs: made });
    while (s.length > UNDO_MAX) { const o = s.shift(); fs.rmSync(path.join(d, 'before-' + o.id), { force: true }); }
    writeStack(d, s);
    return { rel, id, commit: () => undo.commit(ctx, mod, rel, id), drop: () => undo.drop(ctx, mod, rel, id) };
  },
  commit(ctx, mod, rel, id) {
    rel = cleanRel(rel);
    const d = undoDir(ctx, mod, rel), s = readStack(d), m = id ? s.find(e => e.id === id) : s[s.length - 1]; if (!m) return null;
    const p = modPath(mod, rel);
    m.after = fs.existsSync(p) ? sha(fs.readFileSync(p)) : 'absent';
    writeStack(d, s);
    return { rel, id: m.id };
  },
  // drop(ctx, mod, rel, id): that entry (a write that did not happen); with no id the whole stack of the file
  drop(ctx, mod, rel, id) {
    rel = cleanRel(rel); const d = undoDir(ctx, mod, rel);
    if (!id) { fs.rmSync(d, { recursive: true, force: true }); return; }
    const s = readStack(d), k = s.findIndex(e => e.id === id); if (k < 0) return;
    fs.rmSync(path.join(d, 'before-' + id), { force: true }); s.splice(k, 1); writeStack(d, s);
  },
  has(ctx, mod, rel) { return readStack(undoDir(ctx, mod, cleanRel(rel))).length > 0; },
  // throws the plain refusal when restore would not put back the exact state; returns the top entry
  check(ctx, mod, rel, id) {
    rel = cleanRel(rel);
    const s = readStack(undoDir(ctx, mod, rel)), m = s[s.length - 1];
    if (!m || (id && !s.some(e => e.id === id))) throw bad('Nothing to undo for ' + rel + ': it was undone already, or ARSENAL was restarted since.', 409, 'bots.e.undoNone', { file: rel });
    if (id && m.id !== id) throw bad(rel + ' was written again since; undo that later change first.', 409, 'bots.e.undoChanged', { file: rel });
    if (m.after) {
      const p = modPath(mod, rel), now = fs.existsSync(p) ? sha(fs.readFileSync(p)) : 'absent';
      if (now !== m.after) throw bad(rel + ' was changed since this write, so Undo would lose that change. Nothing was put back.', 409, 'bots.e.undoChanged', { file: rel });
    }
    return m;
  },
  // what the page needs to grey or offer Undo: n = steps kept, id = the newest, ok = Undo would work now (key = why not)
  state(ctx, mod, rel) {
    rel = cleanRel(rel);
    const s = readStack(undoDir(ctx, mod, rel)), top = s[s.length - 1];
    let ok = !!top, key = top ? null : 'bots.e.undoNone';
    if (top) try { undo.check(ctx, mod, rel); } catch (e) { ok = false; key = e.key || 'bots.e.undoChanged'; }
    return { rel, n: s.length, id: top ? top.id : null, ok, key };
  },
  restore(ctx, mod, rel, id) {
    rel = cleanRel(rel);
    const m = undo.check(ctx, mod, rel, id), d = undoDir(ctx, mod, rel), p = safeFile(mod, rel);
    let dirsRemoved = 0;
    if (m.had) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, fs.readFileSync(beforeOf(d, m))); }
    else {
      if (fs.existsSync(p)) fs.unlinkSync(p);
      const root = path.resolve(mod);
      for (const x of (m.dirs || []).slice().sort((a, b) => b.length - a.length)) {
        if (!path.resolve(x).startsWith(root + path.sep)) continue;
        try { if (fs.readdirSync(x).length === 0) { fs.rmdirSync(x); dirsRemoved++; } } catch (e) { /* gone or not empty */ }
      }
      // a folder another write made earlier is not in this record: the file's own empty parents go too, up to (not including) the mod folder
      for (let x = path.dirname(path.resolve(p)); x.startsWith(root + path.sep); x = path.dirname(x)) {
        try { if (fs.readdirSync(x).length) break; fs.rmdirSync(x); dirsRemoved++; } catch (e) { if (e.code !== 'ENOENT') break; }
      }
    }
    const s = readStack(d); s.pop(); fs.rmSync(path.join(d, 'before-' + m.id), { force: true }); fs.rmSync(path.join(d, 'before'), { force: true }); writeStack(d, s);
    return { rel, restored: true, removed: !m.had, dirsRemoved, left: s.length };
  },
};
// the undo route: every file is checked first, then all are put back (one refused = none touched). An entry with no id = the newest write
function undoRoute(ctx, b) {
  const mod = checkMod(ctx, b && b.mod);
  const list = Array.isArray(b && b.undo) ? b.undo : [];
  if (!list.length) throw bad('Nothing to undo.', 400, 'bots.e.undoNone', { file: '' });
  const items = list.map(x => ({ rel: cleanRel(x && x.rel), id: x && x.id ? String(x.id) : '' }));
  checkWrite(ctx, mod, items.map(x => x.rel));
  for (const x of items) undo.check(ctx, mod, x.rel, x.id);
  return { restored: items.map(x => undo.restore(ctx, mod, x.rel, x.id)) };
}
// GET undo?mod=&rel=..&rel=..: undo.state of each file (the page greys Undo until ok)
function undoState(ctx, mod, rels) {
  mod = checkMod(ctx, mod);
  return { files: (rels || []).filter(Boolean).slice(0, 50).map(r => undo.state(ctx, mod, r)) };
}

// ---------- buy first / add unit (botrecipe) ----------
const UNIT = /^[A-Za-z0-9_()]+$/;
// GoH (GHMIS-66): a row is added to the purchase list script/multiplayer/units/<army>/<list>.<army>.lua of the mod by botrecipe --exe goh
// (gohBuyFirst there: a copy of the first active row of the asked kind, --class, with unit = U and --priority P when given, CRLF kept).
// {mod, unit, army, list, cls?, priority?, write}. Already in the list = noChange, nothing run or written (no unchanged copy of the
// game's list). Write: the shared guard (never the GoH install), the roster's bytes before the run kept for Undo. [T]: no GoH match played.
const GOH_WORD = /^[a-z0-9_]+$/i;
async function gohAddUnit(ctx, b) {
  const GB = require('../../../botrecipe/gohbuys');
  const mod = checkMod(ctx, b.mod);
  if (!b.unit || !UNIT.test(b.unit)) throw bad('Type the unit name as it appears in the unit lists, for example panzer4j (letters, digits, _ and brackets only).', 400, 'bots.e.unit', { unit: String(b.unit || '') });
  const army = String(b.army || '').toLowerCase(), list = String(b.list || '').toLowerCase();
  if (!GOH_WORD.test(army)) throw bad('Pick the army.', 400, 'bots.e.gohArmy');
  if (!GOH_WORD.test(list)) throw bad('Pick the purchase list.', 400, 'bots.e.gohList');
  const cls = b.cls ? String(b.cls) : '';
  if (cls && !/^\w+$/.test(cls)) throw bad('Unknown unit class: ' + cls, 400, 'bots.e.cls', { cls });
  const p = b.priority == null ? '' : String(b.priority).trim();
  if (p && (!/^\d+(\.\d+)?$/.test(p) || Number(p) > 1e4)) throw bad('Priority: a number from 0 up, for example 1.5.', 400, 'bots.e.gohPrio');
  const rel = GB.UNITS + army + '/' + list + '.' + army + '.lua';
  const G = gameOf(ctx), e = effective(ctx, mod, rel);
  if (e.text == null) throw bad('There is no purchase list ' + rel + ' in your mod or the game.', 404, 'bots.e.gohNoFile', { file: rel });
  if (b.write) checkWrite(ctx, mod, [rel]);
  const pri = p || null, base = { rel, from: e.from, name: '', likeName: '', pri, army, list };
  const r0 = GB.readList(e.text, rel);
  if (r0.stages.some(s => s.units.some(u => u.unit === b.unit))) return Object.assign(base, { ok: true, noChange: true, wrote: false, placed: null, code: null, plain: null, say: ['buy-first ' + b.unit + ': already in ' + rel] });
  const args = [mod, '--out', mod, '--exe', 'goh', '--buy-first', b.unit, '--army', army, '--stage', list];
  if (G.dir) args.push('--game', G.dir);
  if (cls) args.push('--class', cls);
  if (pri) args.push('--priority', pri);
  if (b.after) { if (!UNIT.test(b.after)) throw bad('Bad "after" unit.', 400, 'bots.e.unit', { unit: String(b.after) }); args.push('--after', b.after); }
  if (!b.write) args.push('--dry-run');
  const file = modPath(mod, rel), was = b.write && fs.existsSync(file) ? fs.readFileSync(file) : null, dirs = b.write ? missingDirs(mod, file) : [];
  const r = await ctx.runTool('botrecipe', 'botrecipe/botrecipe.js', args, { timeoutMs: 120000 });
  const now = () => (fs.existsSync(file) ? fs.readFileSync(file) : null), same = (x, y) => (x == null && y == null) || (x && y && x.equals(y));
  if (r.cancelled || (ctx.job && ctx.job.cancelled)) {
    const put = [], left = [];
    if (b.write && !same(now(), was)) { try { if (was == null) fs.unlinkSync(file); else fs.writeFileSync(file, was); put.push(rel); } catch (x) { left.push(rel); } }
    for (const d of dirs) { try { if (fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch (x) { /* gone or not empty */ } }
    return Object.assign(base, { ok: false, cancelled: true, wrote: false, say: [], put, left });
  }
  const codeM = /\b(BOT_[A-Z_]+)\b/.exec(r.stderr || '');
  const say = (r.stdout + '\n' + r.stderr).trim().split(/\r?\n/).filter(Boolean);
  const pm = /after (\S+) in (\S+) \(GoH roster/.exec(r.stdout || ''), placed = pm ? { after: pm[1], army } : null;
  const wrote = !!b.write && r.code === 0 && !same(now(), was);
  const out = Object.assign(base, { ok: r.code === 0, noChange: false, wrote, placed, say, code: codeM ? codeM[1] : null, plain: codeM ? PLAIN.of((r.stderr || '').split(/\r?\n/).find(l => l.includes(codeM[1])) || codeM[1]) || null : null });
  if (wrote) { const tk = undo.save(ctx, mod, rel, was, was == null ? dirs : []); out.undo = [tk.commit()]; }
  return out;
}
// the GoH add card's unit index: every unit of every purchase list (game and mod), by army, with its kind and the lists it is in
// PERF R1: 1.5-2.5 s of sync reads cold (the GoH game view, every list): the loop gets a turn after the view and after each list
const turn = () => new Promise(r => setImmediate(r));
async function gohUnits(ctx, mod) {
  gameView(ctx); await turn();
  const first = gohBuys(ctx, mod, ''), by = new Map(), kinds = new Set(), armies = {};
  for (const l of first.lists) {
    await turn();
    const r = l === first.list ? first : gohBuys(ctx, mod, l);
    Object.assign(armies, r.labels);
    for (const s of r.stages) for (const a of Object.keys(s.armies)) for (const u of s.armies[a]) {
      const k = a + '|' + u.unit; if (u.cls) kinds.add(u.cls);
      if (!by.has(k)) by.set(k, { unit: u.unit, army: a, src: r.files[a] && r.files[a].from === 'mod' ? 'mod' : 'game', cls: u.cls, lists: [] });
      const x = by.get(k); if (!x.lists.includes(l)) x.lists.push(l);
    }
  }
  return { goh: true, units: [...by.values()], cannot: [], armies, lists: first.lists, kinds: [...kinds].sort() };
}
// CACHE (PERF part 1, C1-C5): gohUnits reads every purchase list of the game and the mod (1.5-2.5 s on the real GoH). Kept in the
// shared store, section 'bots.gohunits', parts {game, gid, mod}, stamps {game (gameview stamp), mod:script (lib/modtree)}: the lists,
// modes and bot.main.lua are all under resource/script; the mod is read loose only (no pak). The army labels (lobby names, which read
// other areas and the mods it requires) are not stored: made again on each ask from the stored army order (one armyNames call, cheap).
// In front: the last answers in memory (GU_MEMO) and one build for equal asks in flight (GU_RUN). No store, no ctx.modtree, or a link
// under the mod's resource/script (the walk does not see behind it, PERF C7): built fresh, as before. A write into the mod's lists
// (gohAddUnit, touchWrites -> modtree.touch) makes the next walk give a new mod:script stamp.
const GU_SECTION = 'bots.gohunits', GU_VER = 1, GU_MEMO = new Map(), GU_RUN = new Map(), GU_MAX = 4;
function gohUnitsPack(r) { return JSON.parse(JSON.stringify({ units: r.units, lists: r.lists, kinds: r.kinds, order: Object.keys(r.armies) })); }
function gohUnitsOut(ctx, mod, v) {
  const lobby = armyNames(ctx, mod, v.order), armies = {};
  for (const a of v.order) armies[a] = lobby[a] || ARMY_NAMES[a] || a;
  // in-game names (gohtext, memory only): new rows, the stored value is never changed (PERF C5)
  const names = namesOf(ctx, mod, [...new Set(v.units.map(u => u.unit))]);
  const units = v.units.map(u => (names[u.unit] ? Object.assign({}, u, { name: names[u.unit] }) : u));
  return { goh: true, units, cannot: [], armies, lists: v.lists, kinds: v.kinds };
}
async function gohUnitsCached(ctx, mod) {
  const G = gameOf(ctx), S = storeOf(ctx), MT = ctx && ctx.modtree;
  if (!S || !MT || typeof MT.ensure !== 'function' || !G.dir) return gohUnits(ctx, mod);
  const T = await MT.ensure(mod);
  if ((T.left || []).some(l => /^resource(\/script(\/|$)|$)/i.test(String(l).replace(/\\/g, '/')))) return gohUnits(ctx, mod);
  const parts = { game: lowc(path.resolve(G.dir)), gid: G.id, mod: lowc(path.resolve(mod)) }, stamps = Object.assign({ game: gameStamp(ctx, G) }, MT.stamps(T, ['script']));
  const key = JSON.stringify([parts, stamps]);
  let p = GU_MEMO.get(key) || GU_RUN.get(key);
  if (!p) {
    p = S.wrap(GU_SECTION, GU_VER, parts, stamps, async () => gohUnitsPack(await gohUnits(ctx, mod)))
      .then(v => { GU_MEMO.delete(key); GU_MEMO.set(key, Promise.resolve(v)); while (GU_MEMO.size > GU_MAX) GU_MEMO.delete(GU_MEMO.keys().next().value); return v; });
    GU_RUN.set(key, p); p.then(() => GU_RUN.delete(key), () => GU_RUN.delete(key));
  }
  return gohUnitsOut(ctx, mod, await p);
}
// for the Prepare section bots.gohunits (index.js): is the mod's unit index in the store (no walk, no read of the value). A mod whose
// resource/script sits behind a link is never stored (built fresh on each ask): na with a note
function gohUnitsState(ctx, mod) {
  const G = gameOf(ctx), S = storeOf(ctx), MT = ctx && ctx.modtree;
  if (G.kind !== 'goh' || !G.dir || !mod) return { state: 'na', why: [] };
  if (!S || !MT || typeof MT.last !== 'function') return { state: 'none', why: [] };
  const T = MT.last(mod);
  if (!T) return { state: 'none', why: ['mod'] };
  if ((T.left || []).some(l => /^resource(\/script(\/|$)|$)/i.test(String(l).replace(/\\/g, '/')))) return { state: 'na', why: [], note: 'bots.prep.gohunitsLink' };
  const parts = { game: lowc(path.resolve(G.dir)), gid: G.id, mod: lowc(path.resolve(mod)) }, stamps = Object.assign({ game: gameStamp(ctx, G) }, MT.stamps(T, ['script']));
  return S.state(GU_SECTION, GU_VER, parts, stamps);
}

async function buyFirst(ctx, b) {
  if (gameOf(ctx).kind === 'goh') return gohAddUnit(ctx, b);
  noGoh(ctx, 'bots: add a unit to the bot list');
  const mod = checkMod(ctx, b.mod);
  if (!b.unit || !UNIT.test(b.unit)) throw bad('Type the unit name as it appears in the unit lists, for example panzer4j (letters, digits, _ and brackets only).', 400, 'bots.e.unit', { unit: String(b.unit || '') });
  let army = String(b.army || ''); if (army && !/^[a-z0-9_]+$/i.test(army)) throw bad('Bad army id.', 400, 'bots.e.army', { army });
  const cls = b.cls || 'Tank';
  if (!classesIn((effective(ctx, mod, BOTDATA) || {}).text).includes(cls)) throw bad('Unknown unit class: ' + cls, 400, 'bots.e.cls', { cls: String(cls) });
  const pri = b.first ? '1000.0' : (Number(b.priority) > 0 ? String(Number(b.priority)) : '1.0');
  const args = [mod, '--out', mod, '--buy-first', b.unit, '--class', cls, '--priority', pri];
  if (army) args.push('--army', army);   // no army given: the card's own one is added below (a unit of one army only)
  // the stage: a place in the list's Purchases table (botrecipe/stages.js, comments or not); the real count goes into the refusal
  if (b.stage) {
    // no stage read (no list, Lua code) = no count to hold it to: botrecipe answers BOT_NO_STAGE with what it finds
    const st = stagesOf((effective(ctx, mod, BOTDATA) || {}).text), n = st && st.length ? st.length : 0;
    if (!/^\d{1,2}$/.test(String(b.stage)) || Number(b.stage) < 1 || (n && Number(b.stage) > n)) throw bad('Stage is a number from 1 to ' + (n || 8) + '.', 400, 'bots.e.stage', { n: String(n || 8) });
    args.push('--stage', String(Number(b.stage)));
  }
  // S16: a unit with no buy card is refused before anything runs (a bot can only buy what a buy card offers), unless its card is copied
  if (!b.cardLike && !hasCard(ctx, mod, b.unit)) throw bad(b.unit + ' has no buy card in the mod or the game, so a bot could never buy it.', 400, 'bots.e.noCard', { unit: b.unit, name: namesOf(ctx, mod, [b.unit])[b.unit] || b.unit });
  // S17: a card with no army (a hero, off-map support, a crew) is never bought; a unit of another army is not bought by this army's bot
  if (!b.cardLike) {
    const ua = unitArmy(ctx, mod, b.unit), nm = () => namesOf(ctx, mod, [b.unit])[b.unit] || b.unit;
    if (ua.card && !ua.armies.length) throw bad(b.unit + ' cannot be bought by bots: its buy card names no army (a hero, off-map support or a crew card).', 400, 'bots.e.noArmy', { unit: b.unit, name: nm() });
    if (army && ua.armies.length && !ua.armies.includes(army.toLowerCase())) throw bad(b.unit + ' is a unit of ' + ua.armies.map(armyName).join(', ') + ': the ' + armyName(army) + ' bot cannot buy it.', 400, 'bots.e.wrongArmy', { unit: b.unit, name: nm(), army: armyName(army), home: ua.armies.map(armyName).join(', '), armyCode: army.toLowerCase(), homeCodes: ua.armies.slice() });
    if (!army && ua.armies.length === 1) { army = ua.armies[0]; args.push('--army', army); }
  }
  if (b.after) { if (!UNIT.test(b.after)) throw bad('Bad "after" unit.', 400, 'bots.e.unit', { unit: String(b.after) }); args.push('--after', b.after); }
  if (b.cheap) args.push('--cheap');
  if (b.cardLike) { if (!UNIT.test(b.cardLike)) throw bad('Bad "copy card of" unit.', 400, 'bots.e.unit', { unit: String(b.cardLike) }); args.push('--card-like', b.cardLike); }
  // min_income / min_team on the unit's line and Repeat of its stage: the same field names as the gen bots op (min_income min_team);
  // checked before anything runs, applied to the mod's bot.data.lua after botrecipe wrote the line
  const extra = extraOf(b);
  if (extra.repeat !== undefined) {
    if (!b.stage) throw bad('Repeat belongs to one purchase stage: pick the stage too.', 400, 'bots.e.repeatStage');
    const e = effective(ctx, mod, BOTDATA);
    if (e.text != null && stageAt(e.text, b.stage) === null) throw bad('No purchase stage ' + b.stage + ' with a Repeat line in the bot list.', 400, 'bots.e.noStage', { n: String(b.stage) });
  }
  let g = null; try { g = ctx.game(); } catch (e) { /* none */ }
  if (b.write) checkWrite(ctx, mod);
  if (g) args.push('--game', g);
  const G = gameOf(ctx); if (G.exe) args.push('--exe', G.exe);   // MoW:AS2: botrecipe reads the mowas_2 view of the shared install; AS64 as before
  if (!b.write) args.push('--dry-run');
  if (Object.keys(extra).length) args.push('--keep-copy');   // the line fields are set on the mod's own copy after the run, also for a unit the list already has
  // undo: the bytes of every file botrecipe may write (the bot list, the mod's units sets) before the run; after it, each one that changed
  // or appeared gets an undo entry with those bytes
  const snap = b.write ? undoSnap(mod) : null;
  const r = await ctx.runTool('botrecipe', 'botrecipe/botrecipe.js', args, { timeoutMs: 120000 });
  // JOBS: stopped from the job list (botrecipe was killed). Nothing more is done: no line fields, no undo entry. A write that was cut
  // short is taken back from the bytes kept before the run, so the mod is as it was (put = what was put back; left = what could not be)
  if (r.cancelled || (ctx.job && ctx.job.cancelled)) return Object.assign({ ok: false, cancelled: true, wrote: false, say: [], pri }, snap ? undoPutBack(mod, snap) : { put: [], left: [] });
  const text = (r.stdout + '\n' + r.stderr).trim();
  const codeM = /\b(BOT_[A-Z_]+)\b/.exec(r.stderr || '');
  const say = text.split(/\r?\n/).filter(l => l && !/^\s*in plain words/.test(l));
  // every step the tool names says "already" and no line field was asked: the bots buy this unit as it is, nothing to change. The tool
  // wrote nothing then (no copy of the game's list into the mod), so there is no undo entry either
  const steps = r.code === 0 ? String((r.stdout || '').split(/\r?\n/)[0] || '').split('; ').filter(Boolean) : [];
  const noChange = steps.length > 0 && steps.every(s => /: already\b/.test(s)) && /(^|; )buy-first \S+: already/.test(steps.join('; ')) && !Object.keys(extra).length;
  let wrote = !!b.write && r.code === 0 && !noChange;
  // where botrecipe put the line: 'buy-first U after X (["army"] list, card in F)'
  const pm = /after (\S+) \(\["(\w+)"\] list/.exec(r.stdout || ''), placed = pm ? { after: pm[1], army: pm[2] } : null;
  const name = namesOf(ctx, mod, [b.unit])[b.unit] || '', likeName = b.cardLike ? namesOf(ctx, mod, [b.cardLike])[b.cardLike] || '' : '';
  const out = o => Object.assign(o, { placed, name, likeName, noChange }, snap ? { undo: undoSeal(ctx, mod, snap) } : {});
  if (r.code === 0 && Object.keys(extra).length) {
    const x = applyExtra(ctx, mod, b, cls, extra, wrote);
    say.push(...x.say);
    if (x.err) return out({ ok: false, wrote, code: 'BOT_EXTRA_LINE_MISSING', plain: x.err, say, pri });
  }
  return out({ ok: r.code === 0, wrote, code: codeM ? codeM[1] : null, plain: codeM ? PLAIN.of((r.stderr || '').split(/\r?\n/).find(l => l.includes(codeM[1])) || codeM[1]) || null : null, stages: codeM && codeM[1] === 'BOT_NO_STAGE' ? PLAIN.stagesIn(r.stderr) : null, say, pri });
}
// does any buy card name the unit: the mod's units sets, else the game's (true when the game's cards cannot be read: no refusal on a guess)
function hasCard(ctx, mod, unit) {
  if (modScan(mod).cards.has(unit)) return true;
  const g = gameCards(ctx);
  if (!g || !g.size) return true;
  return g.has(unit);
}
// rel (under resource/) -> bytes or null, for the bot list and every file of the mod's set/multiplayer/units
function undoSnap(mod) {
  const snap = new Map(), put = rel => { const p = modPath(mod, rel); snap.set(rel, fs.existsSync(p) ? fs.readFileSync(p) : null); };
  put(BOTDATA);
  for (const rel of unitsFiles(mod)) put(rel);
  // the folders a run may make (the bot list's and the units folder's, up to the mod): Undo removes the ones that were not there
  snap.missing = missingDirs(mod, modPath(mod, BOTDATA)).concat(missingDirs(mod, path.join(modPath(mod, 'set/multiplayer/units'), 'x')));
  return snap;
}
function unitsFiles(mod) {
  const root = path.join(mod, 'resource'), out = [];
  const walk = d => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(root, p).replace(/\\/g, '/')); } };
  walk(modPath(mod, 'set/multiplayer/units'));
  return out;
}
// a run that was stopped half way: every file of the snap that changed or appeared goes back to its bytes before the run (a new file
// is deleted, then the folders the run made, when empty). Only files this run could write. -> {put: [rel], left: [rel]}
function undoPutBack(mod, snap) {
  const put = [], left = [];
  for (const rel of new Set([...snap.keys(), ...unitsFiles(mod)])) {
    const p = modPath(mod, rel), was = snap.has(rel) ? snap.get(rel) : null;
    try {
      const now = fs.existsSync(p) ? fs.readFileSync(p) : null;
      if ((now == null && was == null) || (now && was && now.equals(was))) continue;
      if (was == null) fs.unlinkSync(p); else fs.writeFileSync(p, was);
      put.push(rel);
    } catch (e) { left.push(rel); }
  }
  for (const d of (snap.missing || []).slice().sort((a, b) => b.length - a.length)) { try { if (fs.readdirSync(d).length === 0) fs.rmdirSync(d); } catch (e) { /* gone or not empty */ } }
  return { put, left };
}
// after the run: an undo entry for each file that changed or appeared -> [{rel, id}]
function undoSeal(ctx, mod, snap) {
  const out = [];
  for (const rel of new Set([...snap.keys(), ...unitsFiles(mod)])) {
    const p = modPath(mod, rel), now = fs.existsSync(p) ? fs.readFileSync(p) : null, was = snap.has(rel) ? snap.get(rel) : null;
    if ((now == null && was == null) || (now && was && now.equals(was))) continue;
    const tk = undo.save(ctx, mod, rel, was, was == null ? (snap.missing || []).filter(d => path.resolve(p).startsWith(d + path.sep)) : []);
    out.push(tk.commit());
  }
  return out;
}
// {minIncome, minTeam, repeat} of the body: numbers checked here (400 before any run)
function extraOf(b) {
  const o = {};
  for (const [k, f] of [['minIncome', 'min_income'], ['minTeam', 'min_team']]) {
    if (b[k] === undefined || b[k] === null || b[k] === '') continue;
    if (!/^\d+(\.\d+)?$/.test(String(b[k]).trim()) || Number(b[k]) > 1e7) throw bad(f + ': use a number from 0 up, for example 300.', 400, 'bots.e.extra', { f });
    o[f] = String(Number(b[k]));
  }
  if (b.repeat !== undefined && b.repeat !== null && b.repeat !== '') {
    if (!/^\d+$/.test(String(b.repeat).trim()) || Number(b.repeat) < 1 || Number(b.repeat) > 1000) throw bad('Repeat: a whole number from 1 to 1000 (how many times the bot runs this stage).', 400, 'bots.e.repeat');
    o.repeat = String(Number(b.repeat));
  }
  return o;
}
// char range of the "Repeat = N" number of stage n ({--purchase n), or null
function stageAt(t, n) { const s = stagesOf(t), k = Number(n); return s && k >= 1 && k <= s.length ? s[k - 1].rep : null; }
// the unit's line(s) in the chosen stage (or every stage) get min_income / min_team (replaced, else added before the closing brace);
// the stage gets Repeat. write=false: say only what would change
function applyExtra(ctx, mod, b, cls, extra, write) {
  const say = [], fields = Object.entries(extra).filter(([k]) => k !== 'repeat');
  const e = effective(ctx, mod, BOTDATA);
  let t = e.text;
  if (t == null) return { say, err: 'No bot list to set ' + Object.keys(extra).join(', ') + ' in.' };
  if (fields.length) {
    if (!write) say.push(`would set ${fields.map(([k, v]) => k + ' = ' + v).join(', ')} on the ${b.unit} line`);
    else {
      let s0 = 0, s1 = t.length;
      if (b.stage) { const rg = STG.rangeOf(t, b.stage); if (rg) { s0 = rg[0]; s1 = rg[1]; } }
      const re = new RegExp('\\{priority = [^}\\r\\n]*unit = "' + b.unit.replace(/[()]/g, '\\$&') + '"[^}\\r\\n]*\\}', 'g');
      let n = 0;
      const seg = t.slice(s0, s1).replace(re, line => {
        n++;
        let l = line;
        for (const [k, v] of fields) { const kr = new RegExp('(\\b' + k + '\\s*=\\s*)[\\d.]+'); l = kr.test(l) ? l.replace(kr, '$1' + v) : l.replace(/\s*\}$/, `, ${k} = ${v}}`); }
        return l;
      });
      if (!n) return { say, err: `The ${b.unit} line was not found in the bot list${b.stage ? ' stage ' + b.stage : ''}, so ${fields.map(f => f[0]).join(' and ')} could not be set.` };
      t = t.slice(0, s0) + seg + t.slice(s1);
      say.push(`set ${fields.map(([k, v]) => k + ' = ' + v).join(', ')} on ${n} ${b.unit} line(s)`);
    }
  }
  if (extra.repeat !== undefined) {
    const at = stageAt(t, b.stage);
    if (!at) return { say, err: 'No purchase stage ' + b.stage + ' with a Repeat line in the bot list.' };
    const was = t.slice(at[0], at[1]);
    say.push(`${write ? '' : 'would set '}stage ${b.stage} Repeat ${was} -> ${extra.repeat}`);
    t = t.slice(0, at[0]) + extra.repeat + t.slice(at[1]);
  }
  if (write && t !== e.text) { const p = modPath(mod, BOTDATA); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'latin1'); }
  return { say };
}

// parts (parts/<id>) require this file read only: gameText(ctx, rel) = the game's file (vfs, latin1, cached), modText(mod, rel) = the mod's copy or null,
// modPath(mod, rel) = where the mod's copy sits; rel is the path under resource/ (e.g. script/multiplayer/bot.data.lua)
// undo = {save, commit, drop, has, check, restore} (above); bad(msg, status, key, params) = an error the page words from a bots.e.* key
module.exports = { GU_SECTION, gohUnitsCached, gohUnitsState, gameView, gameStamp, storeOf, touchWrites, forget, gameScan, gameScanFresh, gameScanState, CARDS_SECTION, undoSnap, undoPutBack, FILES, GOH_FILES, GOH_BOTS, gameOf, filesOf, live, checkMod, checkWrite, safeRel, safeFile, guardFile, buys, gohBuys, table, edit, reset, buyFirst, scan, effective, cardLines, gameCards, unitList, gameText, modText, modPath, BOTDATA, undo, undoRoute, undoState, namesOf, bad, CLASSES, ARMY_NAMES, armyName, armyNames, shortName, hasCard, unitArmy, cardsIn, classesIn };
