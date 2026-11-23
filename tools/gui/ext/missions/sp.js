// GUI-EXT missions, server side of the card "Make a single-player mission": the spmis tool (tools/spmis) called as a library.
// Readers on the request's game view (spmis.openGame: the game folder + the header's mod, exe as64 | mowas_2): the maps that have a
// `map` file (game and mod) with the name the game shows (interface/text/mission.lng for multiplayer maps, mission/single/<c>/<m>.lng
// "name" for single-player ones), the named places of a map (spmis.baseIndex: zones, map points, waypoints) with a readable label made
// from the name (flag_b02 = flag B2, flag_playerbase = player base; else the words of the name, else kind + number), the soldiers
// (set/breed/mp/<army>/*.set) and vehicles and guns (the cards of set/multiplayer/units/vehicles_<army>.set that name an entity .def) of
// an army, with their in-game names (desc/human/<breed>, desc/entity/<name> of the .lng files; the game has one language, LOC-17).
// Preview = spmis generate --dry-run with the same replace flag Write uses, so every file's state (new, replaced, same, kept) and bytes
// are the ones Write puts down. Write = generate into the mod (only a mod folder: maps safeMod + spmis lib/writeguard) after a snapshot
// of every file it touches; the snapshot is kept in memory under a token for Undo (exact bytes back, or refused when a file changed
// since), then spmis check (no milint) and the Maps page's milint run (mission codes of this mission's folder). Generated missions carry
// spmis.json (spec + what was made): list, reopen, remove. The in-game proof flag is tools/spmis/proven.json.
// GoH (2026-11-23, read and preview only, nothing of it tried in game [T]): the same readers on the GoH view (spmis.openGame exe goh:
// the GoH paks and localizations): maps with a `map` file and the names of the .pot texts (mission/<single|multi>/../name), the
// places of spmis.baseIndex (zones f1.. read as flags), the units of an army from set/breed/mp/<army>/<period>/* (soldiers) and the
// "vehicle" cards of set/multiplayer/units/<period>/units_<army>.set (crew from the card's crew(<breed>:<n>)), names from desc/human
// and desc/entity of the .pot texts; armies ger rus usa eng fin. sp/start hands the kinds with a GoH map and GoH units (gohTemplates;
// places are set again by the page when the map's places are read). Preview = spmis.plan on the GoH view (where every unit and goal
// stands, as data and as plain text) and the files the GoH writer (spgoh.js: the stock GoH forms, its header) would put down, each with
// its state. Write = spgoh.js through lib/modwrite (guard, a restore point per file, then the files) after the same Undo snapshot as AS2;
// then the mission is read back through a fresh GoH view of game + mod and compared with the plan (spgoh.readBack: its findings are the
// check lines). Undo = the AS2 Undo (every file guarded first). Remove = spgoh.remove (manifest exe goh: the localizations/ texts too).
// Player army: ger rus usa eng fin and any army of the game or mod with units (gohArmies); eng and mod armies have no stock campaign
// side, the menu picture and text are noted when missing. Write then runs milint --exe goh. Nothing of it was tried in the game [T]. The mod folder is read through
// maps safeMod (read: <GoH>/mods/<name>).
// A phone (LAN Remote): Write, Undo, Remove refused.
// Routes: GET sp/start, GET sp/maps, GET sp/places, GET sp/units, GET sp/mods, POST sp/preview, POST sp/write, POST sp/undo,
// GET sp/undo-ok, GET sp/mine, POST sp/remove.
// Author: Imperator_Aug (ARSENAL, ia-acd64866)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SP = require('../../../spmis/spmis');
const MP = require('../maps')._t;
const GOH = require('./spgoh');

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const ARMIES = ['usa', 'ger', 'rus', 'eng', 'jap'];
const GOH_ARMIES = ['ger', 'rus', 'usa', 'eng', 'fin'];   // the armies with set/multiplayer/units/<period>/units_<army>.set in GoH
const GOH_PERIODS = ['late', 'mid', 'early'];
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const clean = s => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const sha = b => crypto.createHash('sha1').update(b).digest('hex');
const PROVEN = path.join(__dirname, '..', '..', '..', 'spmis', 'proven.json');

// ---- one game view per game folder, exe and mod. Opening it reads the whole mod (half a minute on a mod of ~1400 unit cards), so it is
// kept while the card uses it: 2 min after the last use, 10 min at most (a file changed in the mod shows after that, or after a restart)
const VIEWS = new Map();
function view(g, mod) {
  const k = [g.dir, g.exe, mod || ''].join('|'), now = Date.now(), hit = VIEWS.get(k);
  if (hit && now - hit.used < 120000 && now - hit.t < 600000) { hit.used = now; return hit.v; }
  const v = SP.openGame({ game: g.dir, exe: g.exe }, mod || undefined);
  if (VIEWS.size > 4) VIEWS.clear();
  VIEWS.set(k, { t: now, used: now, v });
  return v;
}
// the units of an army per game folder, exe and mod: read once, kept 10 min (the step-3 boxes and the summary ask often)
const UNITS = new Map();
function unitsCached(g, mod, army) {
  const k = [g.dir, g.exe, mod || '', army].join('|'), now = Date.now(), hit = UNITS.get(k);
  if (hit && now - hit.t < 600000) return hit.v;
  const v = g.kind === 'goh' ? unitsOfGoh(view(g, mod), army) : unitsOf(view(g, mod), mod, army, mod ? view(g, '') : null);
  if (UNITS.size > 20) UNITS.clear();
  UNITS.set(k, { t: now, v });
  return v;
}
// the request's game (AS2, AS64 or GoH; GoH writes go through spgoh.js)
function asGame(gameOf, ctx) { return gameOf(ctx); }
const isGoh = (gameOf, ctx) => { try { return gameOf(ctx).kind === 'goh'; } catch (e) { return false; } };
// the mod folder as the page sends it: the folder itself, never a path that climbs with ".." (a path such as <mod>/../.. is another
// folder: refused before it is resolved), then the Maps page's own rules (maps safeMod)
function noClimb(p) { if (typeof p === 'string' && p.split(/[\\/]+/).some(s => s.trim() === '..')) throw bad('missions.e.modpath'); return p; }
// is the file <mod>/<rel> inside the mod folder: its resolved path starts with the resolved mod folder and a separator
function inMod(mod, rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) return false;
  const root = path.resolve(mod), f = path.resolve(root, rel);
  return f.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}
// read: a route that only reads the mod (maps safeMod: under GoH <GoH>/mods/<name> passes; AS64 and MoW:AS2 do not look at it)
const modOk = (p, ctx, read) => MP.safeMod(noClimb(p), ctx, read);
const modOpt = (p, ctx) => { if (!p) return ''; try { return modOk(p, ctx, true); } catch (e) { return ''; } };
// a mod folder the game can turn on is <game>/mods/<name> (the game lists only that folder)
function inMods(g, mod) {
  if (!mod || !g || !g.dir) return false;
  const r = path.relative(path.resolve(g.dir, 'mods'), path.resolve(mod));
  return !!r && !r.startsWith('..') && !path.isAbsolute(r) && !/[\\/]/.test(r);
}
// kinds: template kinds played to their ends; untried: parts no run showed yet (the card names them in words)
function proven() {
  try {
    const j = JSON.parse(fs.readFileSync(PROVEN, 'utf8')), kinds = {};
    for (const [k, v] of Object.entries(j.kinds || {})) if (/^[a-z0-9_-]+$/.test(k)) kinds[k] = v === true;
    // tries: each run, on which game build (as64 | mowas2) and how it was started (direct | menu); kindsOn: kind -> the builds it ran on
    const tries = (Array.isArray(j.tries) ? j.tries : []).filter(t => t && /^(as64|mowas2)$/.test(t.exe) && /^(direct|menu)$/.test(t.how))
      .map(t => ({ date: String(t.date || ''), exe: t.exe, how: t.how, kinds: (Array.isArray(t.kinds) ? t.kinds : []).filter(k => /^[a-z0-9_-]+$/.test(k)) }));
    const kindsOn = {}; for (const t of tries) for (const k of t.kinds) { kindsOn[k] = kindsOn[k] || []; if (!kindsOn[k].includes(t.exe)) kindsOn[k].push(t.exe); }
    return { inGame: j.inGame === true, date: String(j.date || ''), kinds, tries, kindsOn, menuTried: tries.some(t => t.how === 'menu'), untried: (Array.isArray(j.untried) ? j.untried : []).filter(x => /^[a-z]+$/.test(x)) };
  } catch (e) { return { inGame: false, date: '', kinds: {}, tries: [], kindsOn: {}, menuTried: false, untried: [] }; }
}

// ---- in-game names: desc/human/<breed>, desc/entity/<name>. The game's own .lng first (a game-only view), then the request's view (the mod
// may replace a .lng), then the mod's localization .lng; (include "...") parts expanded as the engine does (lib/lnginc, LOC-21: a mod
// that splits desc.lng into .inc parts still gives names), a later name wins (LOC-04). So a soldier the mod leaves alone keeps the game's name.
const NAMES = new Map();
function namesOf(v, mod, base) {
  const k = v.gameDir + '|' + (mod || '');
  if (NAMES.has(k)) return NAMES.get(k);
  const inc = require('../../../lib/lnginc'), out = new Map(), T = 'resource/interface/text/';
  const take = (buf, rel, open) => { let m; try { m = inc.readLngKeys(buf, rel, { open, onError() {} }); } catch (e) { return; } for (const [key, o] of m) if (/^desc\/(human|entity)\//.test(key) && clean(o.txt)) out.set(key, clean(o.txt)); };
  const fromView = w => { const open = vk => { const lk = vk.toLowerCase(); return w.files.has(lk) ? { buf: w.read(lk), file: lk } : null; };
    for (const key of w.files.keys()) if (/^resource\/interface\/text\/[^/]+\.lng$/.test(key)) { try { take(w.read(key), key.slice(T.length), open); } catch (e) { /* unreadable */ } } };
  if (base && base !== v) fromView(base);
  fromView(v);
  const ld = mod ? path.join(mod, 'localization') : null;
  if (ld && fs.existsSync(ld)) {
    const open = vk => { const lk = vk.toLowerCase(); if (!lk.startsWith(T)) return null; const f = path.join(ld, vk.slice(T.length)); try { return fs.statSync(f).isFile() ? { buf: fs.readFileSync(f), file: f } : null; } catch (e) { return null; } };
    for (const f of fs.readdirSync(ld).filter(n => /\.lng$/i.test(n)).sort()) { try { take(fs.readFileSync(path.join(ld, f)), f, open); } catch (e) { /* unreadable */ } }
  }
  if (NAMES.size > 4) NAMES.clear();
  NAMES.set(k, out);
  return out;
}

// ---- maps with a `map` file, game and mod, with the name the game shows
// GoH texts are .pot files (msgctxt = the key, msgid = the English text, GHLOC-01): key (lower case) -> text, for the keys want passes
function potKeys(v, want, fileRe) {
  const out = new Map();
  for (const k of v.files.keys()) {
    if (!/^resource\/interface\/text\/.+\.pot$/.test(k) || (fileRe && !fileRe.test(k))) continue;
    let t = ''; try { t = v.read(k).toString('utf8'); } catch (e) { continue; }
    for (const m of t.matchAll(/^msgctxt\s+"((?:[^"\\]|\\.)*)"\s*\r?\nmsgid\s+"((?:[^"\\]|\\.)*)"/gm)) if (want.test(m[1]) && clean(m[2])) out.set(m[1].toLowerCase(), clean(m[2]));
  }
  return out;
}
function mapTitles(v, goh) {
  const t = {};
  if (goh) {
    for (const [k, txt] of potKeys(v, /^mission\/(single|multi)\/.+\/name$/i, /\/mission/)) {
      const m = /^mission\/(single|multi)\/(.+)\/name$/.exec(k);
      if (m[1] === 'single') t['single:' + m[2]] = txt; else t['multi:' + m[2].split('/').pop()] = txt;
    }
    return t;
  }
  const rd = k => { try { return v.read(k).toString('utf8'); } catch (e) { return ''; } };
  if (v.has('resource/interface/text/mission.lng'))
    for (const m of rd('resource/interface/text/mission.lng').matchAll(/\{\s*"([^"]+)"\s*\{\s*"name"\s*"((?:[^"\\]|\\.)*)"/g)) t['multi:' + m[1].toLowerCase()] = clean(m[2]);
  for (const k of v.files.keys()) {
    const m = /^resource\/interface\/text\/mission\/(single|multi)\/(.+)\.lng$/.exec(k); if (!m || /\/campaign$/.test(m[2])) continue;
    const n = /\{\s*"name"\s*"((?:[^"\\]|\\.)*)"/.exec(rd(k)); if (n && clean(n[1])) t[m[1] + ':' + m[2].toLowerCase()] = clean(n[1]);
  }
  return t;
}
const fromFolder = f => { const m = /^(\d)v(\d)_(.*)$/.exec(f); return (m ? m[3] : f).replace(/^\d+[-_]?/, '').replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase()).trim() || f; };
function mapList(v, mod, goh) {
  const out = [], seen = new Set(), T = mapTitles(v, goh);
  for (const k of v.files.keys()) {
    const m = /^resource\/(map\/(single|multi)\/(.+))\/map$/.exec(k); if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const parts = m[3].split('/'), own = !!mod && fs.existsSync(path.join(mod, 'resource', ...m[1].split('/'), 'map'));
    if (own && fs.existsSync(path.join(mod, 'resource', ...m[1].split('/'), SP.MANIFEST))) continue;   // a mission this card made is no base map
    const folder = parts[parts.length - 1];
    const title = m[2] === 'single' ? T['single:' + m[3].toLowerCase()] : T['multi:' + folder.toLowerCase()];
    out.push({ key: m[1], name: title || fromFolder(folder), folder, kind: m[2], group: m[2] === 'single' && parts.length > 1 ? parts[0] : m[2], mine: own });
  }
  return out.sort((a, b) => (a.mine === b.mine ? 0 : a.mine ? -1 : 1) || (a.kind < b.kind ? 1 : a.kind > b.kind ? -1 : 0) || a.name.localeCompare(b.name, 'en', { numeric: true }) || (a.key < b.key ? -1 : 1));
}

// ---- named places of a map (spmis's own reader, so a name offered here is one spmis takes), each with a readable label
const words = s => String(s).replace(/[_\-:]+/g, ' ').replace(/\s+/g, ' ').trim();
// goh: a GoH battle zone f1, f2 .. (the zone a map point's zoneId names, GHMAP-03) is a flag too
function labelOf(name, kind, goh) {
  const s = String(name).toLowerCase();
  if (kind === 'path') {
    // the waypoints "player" 0, 1 ...: the player's start (the spmis start place), said as such
    const ps = /^player\/(\d+)$/i.exec(name); if (ps) return { k: 'pstart', n: +ps[1] ? String(+ps[1] + 1) : '' };
    const i = name.lastIndexOf('/'); return { k: 'path', n: words(name.slice(0, i) + ' ' + name.slice(i + 1)) };
  }
  if (/^flag_?playerbase$|(^|_)player_?base$|^(player|my)_?(base|start)$/.test(s)) return { k: 'pbase' };
  if (/^flag_?enemybase$|(^|_)enemy_?base$|^flag_?aibase$|(^|_)ai_?base$/.test(s)) return { k: 'ebase' };
  let m;
  // multiplayer maps: start points a1 b2 (side A or B), flag points f1, the capture flag
  if (kind === 'point' && (m = /^([ab])0*(\d+)$/.exec(s))) return { k: 'mpstart', t: m[1].toUpperCase(), n: m[2] };
  if ((kind === 'point' || (goh && kind === 'zone')) && (m = /^f0*(\d+)$/.exec(s))) return { k: 'flag', n: m[1] };
  if (/^capture_?flag(_?[ab])?$/.test(s)) return { k: 'cflag', n: (/([ab])$/.exec(s.replace(/^capture_?flag/, '')) || ['', ''])[1].toUpperCase() };
  if ((m = /^gamezone(?:_(.+))?$/.exec(s))) return { k: 'gz', n: m[1] ? words(m[1]) : '' };
  if ((m = /^paradrop(?:_(.+))?$/.exec(s))) return { k: 'drop', n: m[1] ? words(m[1]) : '' };
  m = /^flag_?([a-z])_?0*(\d+)$/.exec(s); if (m) return { k: 'flag', n: m[1].toUpperCase() + m[2] };
  if ((m = /^flag_?0*(\d+)$/.exec(s))) return { k: 'flag', n: m[1] };
  if ((m = /^flag_?(.+)$/.exec(s))) return { k: 'flag', n: words(m[1]) };
  const w = words(s);
  if (!/[a-z]/.test(w)) return { k: kind === 'point' ? 'pointn' : 'arean', n: w };
  return { k: kind === 'point' ? 'point' : 'area', n: w };
}
function placesOf(v, key, goh) {
  const b = SP.baseIndex(v, key), out = [], names = new Set([...b.points.keys()].map(n => n.toLowerCase()));
  for (const [name, p] of b.points) {
    if (/^\d+$/.test(name)) continue;
    if (p.from === 'waypoint' && !name.includes('/')) continue;   // a waypoint is offered by its block/id name only
    const kind = p.from === 'zone' ? 'zone' : p.from === 'map_point' ? 'point' : 'path';
    // a zone X_capture next to a zone X is the same spot (the capture area of a flag): kept for a name the spec has, never listed
    const dup = /_capture$/i.test(name) && names.has(name.toLowerCase().replace(/_capture$/, ''));
    out.push({ name, kind, dup, lab: labelOf(name, kind, goh), x: Math.round(p.x), y: Math.round(p.y) });
  }
  const rank = { zone: 0, point: 1, path: 2 };
  out.sort((a, b2) => rank[a.kind] - rank[b2.kind] || a.name.localeCompare(b2.name, 'en', { numeric: true }));
  return { key: b.rel, places: out.slice(0, 800), more: Math.max(0, out.length - 800), start: b.points.has('player/0') ? 'player/0' : null, bounds: b.bounds };
}

// ---- the units of an army: soldiers (breeds) and vehicles / guns (cards naming an entity), in-game names
function unitsOf(v, mod, army, base) {
  if (!ARMIES.includes(army)) throw bad('missions.e.army');
  const names = namesOf(v, mod, base), defs = SP.defIndex(v), soldiers = [], vehicles = [];
  const re = new RegExp('^resource/set/breed/(mp/' + army + '/[^/]+)\\.set$');
  for (const k of v.files.keys()) { const m = re.exec(k); if (m) soldiers.push({ def: m[1], name: names.get('desc/human/' + m[1]) || m[1].split('/').pop().replace(/_/g, ' ') }); }
  soldiers.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.def < b.def ? -1 : 1));
  const has = d => defs.breed.has(d);
  const pick = (...res) => { for (const r of res) { const s = soldiers.find(x => r.test(x.def.split('/').pop())); if (s) return s.def; } return soldiers.length ? soldiers[0].def : null; };
  const tankCrew = pick(/^tankman2$/, /^tankman/, /crew/, /^rifle$/), gunCrew = pick(/^rifle$/, /crew/, /^tankman/);
  // the class of a vehicle or gun: the first folder under entity/ that is no '-group' (tank_medium, armored_car, cannon ...), for the
  // page's army switch (closest of the same class)
  const clsOf = id => { const sg = String(defs.ent.get(id) || '').split('/').slice(2, -1); if (sg.length && sg[sg.length - 1].toLowerCase() === id) sg.pop(); return (sg.find(x => x[0] !== '-') || '').toLowerCase(); };
  const seen = new Set();
  for (const k of v.files.keys()) {
    if (!new RegExp('^resource/set/multiplayer/units/vehicles_' + army + '\\.set$').test(k)) continue;
    const t = v.read(k).toString('latin1');
    for (const m of t.matchAll(/^\s*\{"([^"]+)"\s*\((.*)$/gm)) {
      const id = m[1].toLowerCase(); if (seen.has(id) || !defs.ent.has(id)) continue;
      seen.add(id);
      const gun = /\bt\([^)]*\b(cannon|artillery)\b/.test(m[2]) && !/\bn1\(/.test(m[2]);
      const crew = gun ? gunCrew : tankCrew;
      vehicles.push({ def: id, name: names.get('desc/entity/' + id) || id, kind: gun ? 'gun' : 'vehicle', cls: clsOf(id), crew: crew && has(crew) ? { def: crew, count: gun ? 2 : 3 } : null });
    }
  }
  vehicles.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'vehicle' ? -1 : 1) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { army, soldiers, vehicles };
}

// ---- GoH units of an army (header: GoH). Names: desc/human/<breed>, desc/entity/<id> of the .pot texts (game and mod alike: the vfs
// mounts both); a soldier's name carries its period (one role has a breed per period). Same shape as unitsOf
const GNAMES = new Map();
function gohNames(v) {
  if (GNAMES.has(v)) return GNAMES.get(v);
  const n = potKeys(v, /^desc\/(human|entity)\//i, /\/desc/);
  if (GNAMES.size > 4) GNAMES.clear();
  GNAMES.set(v, n);
  return n;
}
// the GoH armies of a view: the stock five, then every other army word with a unit card file (set/multiplayer/units/<period>/
// units_<army>.set) or soldiers (set/breed/mp/<army>/), a mod's own army too (spgoh.js header: side)
const GARM = new WeakMap();
function gohArmies(v) {
  if (GARM.has(v)) return GARM.get(v);
  const more = new Set();
  for (const k of v.files.keys()) {
    const m = /^resource\/set\/multiplayer\/units\/[^/]+\/units_([a-z][a-z0-9_]{0,31})\.set$/.exec(k) || /^resource\/set\/breed\/mp\/([a-z][a-z0-9_]{0,31})\/[^/]+\//.exec(k);
    if (m && !GOH_ARMIES.includes(m[1])) more.add(m[1]);
  }
  const out = GOH_ARMIES.concat([...more].sort());
  GARM.set(v, out);
  return out;
}
function unitsOfGoh(v, army) {
  if (!gohArmies(v).includes(army)) throw bad('missions.e.army');
  const names = gohNames(v), defs = SP.defIndex(v), soldiers = [], vehicles = [];
  const pre = 'mp/' + army + '/';
  for (const b of defs.breed) {
    if (!b.startsWith(pre)) continue;
    const parts = b.split('/'), period = parts.length > 3 ? parts[2] : '';
    const nm = names.get('desc/human/' + b) || parts[parts.length - 1].replace(/_/g, ' ');
    soldiers.push({ def: b, name: period ? nm + ' (' + period + ')' : nm, period });
  }
  const prank = p => (GOH_PERIODS.indexOf(p) < 0 ? 9 : GOH_PERIODS.indexOf(p));
  soldiers.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : prank(a.period) - prank(b.period) || (a.def < b.def ? -1 : 1)));
  const seen = new Set(), re = new RegExp('^resource/set/multiplayer/units/([^/]+)/units_' + army + '\\.set$');
  const files = [...v.files.keys()].map(k => [k, re.exec(k)]).filter(x => x[1]).sort((a, b) => prank(a[1][1]) - prank(b[1][1]) || (a[0] < b[0] ? -1 : 1));
  for (const [k, m] of files) {
    const period = m[1];
    let t = ''; try { t = v.read(k).toString('latin1'); } catch (e) { continue; }
    // a card: {"<id>" ("vehicle"|"vehicle2"|"vehicle3" period(..) t(<tags>) side(..) crew(<breed>:<n>)|crew1(..) crew2(..) .. cost(N)) }
    for (const chunk of t.split(/^\s*\{"/m).slice(1)) {
      const c = /^([^"]+)"\s*\(\s*"vehicle\d?"/.exec(chunk); if (!c) continue;
      const id = c[1].toLowerCase(); if (seen.has(id) || !defs.ent.has(id)) continue;
      seen.add(id);
      const body = chunk.slice(0, 2000), tags = ((/\bt\(([^)]*)\)/.exec(body) || [])[1] || '').toLowerCase().split(/\s+/).filter(x => x && x !== 'doctrineonly');
      const gun = tags.some(x => /^(cannon|artillery|heavyart|mortar|howitzer)$/.test(x));
      const cm = /\bcrew1?\(([A-Za-z0-9_]+):(\d+)\)/.exec(body);
      let crew = null;
      if (cm) for (const p of [period].concat(GOH_PERIODS)) { const d = pre + p + '/' + cm[1].toLowerCase(); if (defs.breed.has(d)) { crew = { def: d, count: Math.max(1, Math.min(8, +cm[2] || 1)) }; break; } }
      vehicles.push({ def: id, name: names.get('desc/entity/' + id) || id, kind: gun ? 'gun' : 'vehicle', cls: tags[0] || '', crew, period });
    }
  }
  vehicles.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'vehicle' ? -1 : 1) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { army, soldiers, vehicles };
}
// the kinds (spmis templates) for GoH: a GoH map and, per group, a GoH unit of the same role (an AS2 def GoH has is kept). The places
// stay the template's names: the page sets them again on the map once its places are read (fixPlaces), as for a map picked by hand
const GOH_MAPS = ['map/multi/1v1_crossing', 'map/multi/2v2_crossing'];
const ROLES = [[/leader|officer|sergeant|commander/, [/^officer$/, /^platoon_officer$/, /^nco$/, /_sl$/, /officer|_sl_|nco/]],
  [/^rifle/, [/^rifleman_1$/, /^rifle$/, /^[a-z]+_rifle$/, /rifle/]], [/mgun|^mg/, [/^mgun_1$/, /^mg_crew$/, /^[a-z]+_mg$/, /mg/]],
  [/smg/, [/^smg_1$/, /^[a-z]+_smg$/, /smg/]], [/bazook|antitank|piat|panzer/, [/^antitank_1$/, /^antitank_m1a1$/, /^antitank/, /_at$/]],
  [/tankman|crew/, [/^tankman$/, /^tank_crew$/, /tankman/, /crew/]]];
function gohRole(U, def) {
  const leaf = String(def).split('/').pop().toLowerCase(), r = ROLES.find(x => x[0].test(leaf)) || ROLES[1];
  for (const p of GOH_PERIODS) for (const want of r[1]) { const s = U.soldiers.find(x => x.period === p && want.test(x.def.split('/').pop())); if (s) return s.def; }
  return U.soldiers.length ? U.soldiers[0].def : def;
}
function gohUnit(U, defs, def, crew) {
  const d = String(def || '').toLowerCase();
  if (defs.breed.has(d)) return d;
  if (/^mp\//.test(d) || d.includes('/')) return gohRole(U, d);
  if (defs.ent.has(d)) return d;
  const gun = /pak|gun|flak|howitzer|cannon|zis|qf/.test(d) || (crew && crew.count && crew.count <= 2);
  const c = U.vehicles.filter(x => x.kind === (gun ? 'gun' : 'vehicle'));
  const v = (gun ? c : c.filter(x => /^(tank|medium|heavy)$/.test(x.cls)))[0] || c[0] || U.vehicles[0];
  return v ? v.def : d;
}
function gohTemplates(g) {
  const v = view(g, ''), defs = SP.defIndex(v), U = {};
  const unitsAt = a => U[a] || (U[a] = unitsOfGoh(v, a));
  const keys = new Set([...v.files.keys()].filter(k => /^resource\/map\/(single|multi)\/.+\/map$/.test(k)).map(k => k.slice('resource/'.length, -'/map'.length)));
  const map = GOH_MAPS.find(m => keys.has(m)) || [...keys].filter(k => k.startsWith('map/multi/')).sort()[0] || [...keys].sort()[0] || '';
  const armyOf = a => (GOH_ARMIES.includes(a) ? a : a === 'jap' ? 'usa' : 'ger');
  const swap = (grp, army) => { if (!grp || typeof grp !== 'object') return; const A = unitsAt(army);
    grp.def = gohUnit(A, defs, grp.def, grp.crew);
    if (grp.crew && typeof grp.crew === 'object') { const own = (A.vehicles.find(x => x.def === grp.def) || {}).crew; grp.crew = own ? { def: own.def, count: Math.min(own.count, 4) } : { def: gohRole(A, grp.crew.def || 'tankman'), count: grp.crew.count || 3 }; } };
  return SP.templates().map(t => {
    const s = JSON.parse(JSON.stringify(t.spec));
    s.map = map;
    delete s.environment;
    s.player = s.player || {}; s.enemy = s.enemy || {};
    s.player.army = armyOf(s.player.army || 'usa'); s.enemy.army = armyOf(s.enemy.army || 'ger');
    (s.player.units || []).concat(s.reinforcements || []).forEach(x => swap(x, s.player.army));
    (s.enemy.defenders || []).concat(s.enemy.patrols || [], s.enemy.waves || []).forEach(x => swap(x, s.enemy.army));
    return { name: t.name, title: s.title, spec: s, goals: (s.objectives || []).map(o => o.type) };
  });
}
// GoH Preview: spmis.plan on the GoH view (no file is made): every group and goal where it stands, as data and as plain text
const xy = p => (p ? Math.round(p.x) + ',' + Math.round(p.y) : '-');
function gohPlan(v, spec) {
  let P;
  try { P = SP.plan(spec, v, { vehOut: true }); } catch (e) { return { ok: false, refusal: refusal(e, spec) }; }
  const groups = P.groups.map(G => ({ name: G.name, side: G.side, role: G.role, def: G.def || ((G.units[0] || {}).def) || '', kind: G.kind, units: G.units.filter(u => !u.crewOf).length,
    crew: G.crew ? { def: G.crew.def, count: G.crew.count } : null, hidden: G.hidden, difficulty: G.difficulty || '', at: xy(G.center) }));
  const t = ['map ' + P.base.rel, 'start ' + xy(P.start), 'environment ' + P.environment];
  for (const G of groups) t.push('group ' + G.name + ' side ' + G.side + ' role ' + G.role + ' def ' + G.def + ' x' + G.units + ' at ' + G.at + (G.crew ? ' crew ' + G.crew.def + ' x' + G.crew.count : '') + (G.difficulty ? ' from ' + G.difficulty : '') + (G.hidden ? ' hidden' : ''));
  for (const o of P.objs) t.push('goal ' + o.id + ' ' + o.type + (o.z ? ' zone ' + o.z.name + ' at ' + xy(o.z) : '') + (o.targets ? ' target ' + o.targets.map(G => G.name).join(',') : '') + (o.minutes ? ' minutes ' + o.minutes : '') + (o.prev ? ' after ' + o.prev.id : ''));
  for (const p of P.patrols) t.push('patrol ' + p.group.name + ' route ' + p.route.map(xy).join(' '));
  for (const w of P.waves) t.push('wave ' + w.group.name + ' at ' + w.time + ' s to ' + xy(w.to));
  for (const r of P.reinf) t.push('reinforcement ' + r.group.name + (r.after ? ' after ' + r.after : ' at ' + r.time + ' s'));
  t.push('lose ' + [P.lose.allDead ? 'allDead' : '', P.lose.unit ? 'unit ' + P.lose.unit : '', P.lose.minutes ? 'minutes ' + P.lose.minutes : ''].filter(Boolean).join(', '));
  for (const m of P.moved) t.push('moved ' + m.what + ' ' + m.from.join(',') + ' to ' + m.to.join(','));
  t.push('Gates of Hell form; not tested in game [T]');
  return { ok: true, P: { campaign: P.campaign, name: P.name, texts: { name: P.texts.name }, campaignTitle: P.campaignTitle },
    plan: { groups: groups.length, units: groups.reduce((n, G) => n + G.units + (G.crew ? G.crew.count * G.units : 0), 0), goals: P.objs.length, moved: P.moved.length, unitsMoved: P.unitsMoved, area: !!P.base.area },
    groups, text: t.join('\r\n') };
}

// ---- a refusal of spmis: its code, its words, and the part of the spec it names (the page marks that field and offers its step)
function fieldOf(spec, msg) {
  const m = String(msg || '');
  let r;
  if ((r = /^player\.start/.exec(m))) return { f: 'start' };
  if ((r = /^(player|enemy)\.army/.exec(m))) return { f: r[1] === 'player' ? 'parmy' : 'earmy' };
  if ((r = /^(player\.units|enemy\.defenders|enemy\.patrols|enemy\.waves|player\.reinforcements|reinforcements)(?:\[(\d+)\](?:\.(\w+))?)?/.exec(m))) {
    const list = { 'player.units': 'pu', 'enemy.defenders': 'ed', 'enemy.patrols': 'ep', 'enemy.waves': 'ew', 'player.reinforcements': 'rf', reinforcements: 'rf' }[r[1]];
    return r[2] == null ? { f: list } : { f: list + '.' + r[2], sub: r[3] || '' };
  }
  if ((r = /^objectives\[(\d+)\]/.exec(m))) return { f: 'ob.' + r[1] };
  if ((r = /^objective id "([^"]*)"/.exec(m)) || (r = /^objective ([A-Za-z0-9_-]+)/.exec(m))) {
    const id = r[1].replace(/"/g, ''), objs = (spec && Array.isArray(spec.objectives) ? spec.objectives : []);
    const i = objs.findIndex((o, j) => (o && o.id ? o.id : 'obj_' + (j + 1)) === id);
    return { f: i < 0 ? 'ob' : 'ob.' + i };
  }
  if (/^objectives/.test(m)) return { f: 'ob' };
  if (/^lose/.test(m)) return { f: 'lose' };
  if (/^name /.test(m)) return { f: 'name' };
  if (/^campaign/.test(m)) return { f: 'campaign' };
  if (/^(map|environment|banner|music)\b/.test(m)) return { f: 'map' };
  if (/^--out\b/.test(m)) return { f: 'mod' };
  return { f: '' };
}
function refusal(e, spec) {
  if (!(e instanceof SP.Refuse)) throw e;
  const fo = e.code === 'SPMIS_NO_MAP' ? { f: 'map' } : e.code === 'SPMIS_EXISTS' ? { f: 'name' } : e.code === 'SPMIS_IN_INSTALL' ? { f: 'mod' } : fieldOf(spec, e.message);
  const w = whyOf(e.code, String(e.message || ''));
  if (w === 'nogoals') fo.f = 'ob';
  if (w === 'nohuman') fo.f = fo.f || 'lose';
  return { code: e.code, msg: String(e.message).slice(0, 600), field: fo.f, sub: fo.sub || '', why: w };
}
// the kind of a SPMIS_SPEC / SPMIS_POINT refusal, so the page says it in its own sentence (missions.sp.c.spec.<why>)
const WHY = [
  ['nogoals', /^objectives: at least one/], ['nounits', /^player\.units: at least one/], ['nohuman', /^lose\.allDead needs a human/],
  ['noplace', /: "auto" has no point/], ['badplace', /is not a name, \[x,y\]/], ['count', /: count .*: 1 to 60/], ['gname', /: name ".*" must be unique/],
  ['level', /: difficulty ".*": the lowest level/], ['crew', /: crew is for an entity def/], ['nodef', /: needs def \(a breed/], ['army', /army ".*": an army word/],
  ['route', /\.route: two or more points/], ['wavetime', /\.time: seconds after the start/], ['goalid', /^objective id ".*": letters/], ['goaltype', /: type ".*", one of/],
  ['escortwho', /: unit ".*" is no player group name/], ['minutes', /^objective .*: minutes, a number over 0/], ['notarget', /: target, an enemy group name/],
  ['target', /: target ".*" is no enemy group/], ['emptytarget', /is an empty vehicle; it reads "not moveable"/], ['targetlevel', /is a vehicle group that is left out below/],
  ['after', /: after ".*" is no earlier objective/], ['rfafter', /^reinforcements\[\d+\]\.after: /], ['rftime', /^reinforcements\[\d+\]: time \(seconds\) or after/],
  ['loseunit', /^lose\.unit ".*" is no player group/], ['loseminutes', /^lose\.minutes: a number over 0/], ['name', /^name .*: letters, digits/], ['campaign', /^campaign .*: letters, digits/],
  ['map', /^map: the base map folder/], ['env', /^environment .*: a set\/environment name/], ['spec', /^spec: a JSON object/]];
function whyOf(code, msg) { if (code !== 'SPMIS_SPEC' && code !== 'SPMIS_POINT') return ''; for (const [k, re] of WHY) if (re.test(msg)) return k; return ''; }
function collector() {
  const add = [], info = [];
  return { add(rel, line, code, msg) { add.push({ rel, line: line || 0, code, msg: String(msg).slice(0, 400) }); }, info(rel, line, code, msg) { info.push({ rel, line: line || 0, code, msg: String(msg).slice(0, 400) }); }, get count() { return add.length; }, list: add, infos: info };
}
function specOk(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw bad('missions.e.spec');
  if (JSON.stringify(spec).length > 200000) throw bad('missions.e.spec');
  return spec;
}
const missionDir = (mod, c, m) => path.join(mod, 'resource', 'map', 'single', c, m);
const campOf = spec => (spec && ID.test(String(spec.campaign || '')) ? spec.campaign : 'spmis_custom');
const readOr = f => { try { return fs.readFileSync(f); } catch (e) { return null; } };
const same = (a, b) => (a === null || b === null ? a === b : a.equals(b));

// one generate run (dry or write) with the request's game; refusals come back as data, not as an error. planned = the bytes per file
function run(g, mod, spec, write, force, v) {
  const rep = collector();
  try {
    const r = SP.generate({ game: g.dir, exe: g.exe, out: mod, specObj: spec, dryRun: !write, force: !!force, view: v || undefined }, rep);
    const files = rep.infos.filter(x => x.code === (write ? 'SPMIS_WROTE' : 'SPMIS_PLAN')).map(x => ({ rel: x.rel, kept: /^kept/.test(x.msg), copied: /\(copied from/.test(x.msg), bytes: +(/^(\d+) bytes/.exec(x.msg) || [0, 0])[1] }));
    const notes = rep.infos.filter(x => !['SPMIS_PLAN', 'SPMIS_WROTE', 'SPMIS_HOWTO'].includes(x.code)).map(x => ({ code: x.code, rel: x.rel, msg: x.msg }));
    return { ok: true, P: r.P, files, notes, bytes: r.bytes, planned: r.files };
  } catch (e) { return { ok: false, refusal: refusal(e, spec) }; }
}
// the note of a kept campaign file that names another side than the player's army (the menu lists the campaign under that side)
const campNote = (c, side, army) => ({ code: 'SPGOH_CAMP_SIDE', rel: `resource/map/single/${c}/interface.set`, msg: `the campaign file (kept) names side ${side}`, p: { side, army } });
// GoH: the card's plan (gohPlan: data and text) and the GoH writer's files with their bytes (spgoh.plan); refusals as data
function gohRun(v, spec) {
  const pv = gohPlan(v, spec);
  if (!pv.ok) return pv;
  let r; try { r = GOH.plan(v, spec); } catch (e) { return { ok: false, refusal: refusal(e, spec) }; }
  return Object.assign(pv, { files: r.files.map(f => ({ rel: f.rel, buf: f.buf, shared: !!f.shared, copied: !!f.copied })), X: GOH.expect(r.P, r.mi), area: !!r.P.base.area, gnotes: r.notes || [], text: pv.text.replace(/^environment .*$/m, 'environment ' + r.P.environment + (r.P.music ? '\r\nmusic ' + r.P.music : '')) });
}
const gbufs = r => { if (r && r.ok && r.files) for (const f of r.files) f.buf = Buffer.from(f.buf); return r; };
// each GoH file as it stands in the mod now (states() for AS2): a campaign file that is there is kept unless the mission is rewritten
function gohStates(mod, r, force) {
  const out = r.files.map(f => {
    const now = readOr(path.join(mod, f.rel)), kept = f.shared && now !== null && !force;
    return { rel: f.rel, state: kept ? 'kept' : now === null ? 'new' : now.equals(f.buf) ? 'same' : 'replace', copied: f.copied, voice: false, bytes: f.buf.length, sha: kept ? null : sha(f.buf) };
  });
  const man = GOH.MAN(r.X.campaign, r.X.name);
  out.push({ rel: man, state: fs.existsSync(path.join(mod, man)) ? 'replace' : 'new', record: true, copied: false, bytes: 0, sha: null });
  return out;
}
function where(mod, spec) {
  const c = campOf(spec), m = spec && ID.test(String(spec.name || '')) ? spec.name : '';
  if (!m) return { exists: false, generated: false };
  const d = missionDir(mod, c, m);
  return { exists: fs.existsSync(d), generated: !!SP.readManifest(d) };
}
// each file of a plan as it stands in the mod now: new, replace (other bytes), same (equal bytes), kept (a campaign file left alone)
function states(mod, r) {
  const buf = new Map(r.planned.map(f => [f.rel, f.buf]));
  const out = r.files.map(f => {
    const now = readOr(path.join(mod, f.rel)), b = buf.get(f.rel);
    const state = f.kept ? 'kept' : now === null ? 'new' : b && now.equals(b) ? 'same' : 'replace';
    return { rel: f.rel, state, copied: f.copied, voice: /^sound\//.test(f.rel), bytes: b ? b.length : f.bytes, sha: b && !f.kept ? sha(b) : null };
  });
  const man = `resource/map/single/${r.P.campaign}/${r.P.name}/${SP.MANIFEST}`;
  out.push({ rel: man, state: fs.existsSync(path.join(mod, man)) ? 'replace' : 'new', record: true, copied: false, bytes: 0, sha: null });
  return out;
}
// folders a list of files needs that are not there yet (deepest last)
function newDirs(mod, rels) {
  const d = new Set();
  for (const rel of rels) for (let p = path.posix.dirname(rel); p && p !== '.'; p = path.posix.dirname(p)) if (!fs.existsSync(path.join(mod, p))) d.add(p);
  return [...d].sort((a, b) => a.length - b.length);
}

// ---- Undo: the bytes before a Write, per token (memory only: Undo lasts while ARSENAL runs)
const UNDO = new Map();
function snapshot(mod, rels) { return rels.map(rel => ({ rel, before: readOr(path.join(mod, rel)), after: null })); }

// ---- the heavy reads in a worker thread. Opening a large loose mod (RobZ: 112k files) takes about a minute and the server answers one
// request at a time, so the maps, places and units, Preview, Write and the check after it run in the worker; sp/start, sp/mine, sp/mods,
// Undo and Remove answer at once meanwhile. The worker keeps its views (view(): 2 min after the last use, 10 min at most) and the units.
// No worker (it cannot start, or it stopped): the same calls inline, as before.
const OPS = {
  // GoH: also the army words, light sets and music of game + mod (the card's army list and the GoH look boxes; spgoh.js lists)
  maps: a => { const v = view(a.g, a.mod), o = { maps: mapList(v, a.mod, a.g.kind === 'goh') }; if (a.g.kind === 'goh') { const L = GOH.lists(v); Object.assign(o, { armies: gohArmies(v), envs: L.envs, music: L.music }); } return o; },
  places: a => { try { return placesOf(view(a.g, a.mod), a.key, a.g.kind === 'goh'); } catch (e) { if (e instanceof SP.Refuse) throw bad('missions.e.nomap'); throw e; } },
  units: a => unitsCached(a.g, a.mod, a.army),
  gohTpl: a => ({ templates: gohTemplates(a.g), armies: gohArmies(view(a.g, '')) }),
  gohPlan: a => gohPlan(view(a.g, a.mod), a.spec),
  gohRun: a => gohRun(view(a.g, a.mod), a.spec),
  // the read-back after a GoH Write: a fresh view of game + mod (the kept one predates the write), then spgoh.readBack
  gohBack: a => { VIEWS.delete([a.g.dir, a.g.exe, a.mod || ''].join('|')); return { list: GOH.readBack(view(a.g, a.mod), a.X, { potKeys }) }; },
  run: a => { const r = run(a.g, a.mod, a.spec, a.write, a.force, view(a.g, a.mod)); if (!r.ok) return r;
    return { ok: true, P: { campaign: r.P.campaign, name: r.P.name, texts: { name: r.P.texts.name }, campaignTitle: r.P.campaignTitle }, files: r.files, notes: r.notes, bytes: r.bytes, planned: r.planned.map(f => ({ rel: f.rel, buf: f.buf })) }; },
  check: a => { const rep = collector(); try { SP.check({ check: a.mod, mission: a.m, game: a.g.dir, exe: a.g.exe, noMilint: true, view: view(a.g, a.mod) }, rep); } catch (e) { if (!(e instanceof SP.Refuse)) throw e; rep.add('', 0, e.code, e.message); } return { list: rep.list }; },
  stats: () => ({ views: VIEWS.size, units: UNITS.size }),
  nap: a => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(60000, +a.ms || 0)); return { ok: true }; },   // the tests: a call that takes a.ms
};
// JOBS: the worker takes one call at a time, so the calls wait here (WQ, first in first out) and RUN is the one on the worker now.
// A call can be stopped (stopCall): a waiting one leaves the queue; the running one ends with its worker, and a fresh worker takes the
// next call (the views and units the old one kept are read again). A worker that stops by itself fails only the call it was on.
let WK = null, WN = 0, RUN = null;
const WQ = [];
const stopErr = () => Object.assign(new Error('stopped'), { cancelled: true, status: 499 });
function worker() {
  if (WK) return WK;
  let WT; try { WT = require('worker_threads'); } catch (e) { return null; }
  try { WK = new WT.Worker(__filename, { workerData: { spWorker: true } }); } catch (e) { WK = null; return null; }
  const w = WK; w.unref();
  w.on('message', m => { const q = RUN; if (!q || q.w !== w || q.id !== m.id) return; RUN = null;
    if (m.err) q.settle(Object.assign(new Error(m.err.message), m.err.status ? { status: m.err.status } : {})); else q.settle(null, m.r);
    pump(); if (!RUN) w.unref(); });
  const down = e => { if (WK === w) WK = null; if (RUN && RUN.w === w) { const q = RUN; RUN = null; q.settle(e); } pump(); };
  w.on('error', e => down(e instanceof Error ? e : new Error(String(e))));
  w.on('exit', c => down(new Error('the missions reader stopped (' + c + ')')));
  return w;
}
function pump() {
  if (RUN || !WQ.length) return;
  const w = worker();
  // no worker (it cannot start again): the waiting calls inline, as before
  if (!w) { for (const q of WQ.splice(0)) Promise.resolve().then(() => OPS[q.op](q.a)).then(r => q.settle(null, r), e => q.settle(e)); return; }
  const q = RUN = WQ.shift(); q.w = w; w.ref(); w.postMessage({ id: q.id, op: q.op, a: q.a });
}
// stop one call: resolves once nothing of it runs any more (the old worker has ended)
function stopCall(q) {
  const i = WQ.indexOf(q);
  if (i >= 0) { WQ.splice(i, 1); q.settle(stopErr()); return Promise.resolve(); }
  if (RUN !== q) return Promise.resolve();
  const w = q.w; RUN = null; if (WK === w) WK = null;
  q.settle(stopErr());
  let gone; try { gone = Promise.resolve(w.terminate()).then(() => {}, () => {}); } catch (e) { gone = Promise.resolve(); }
  pump();
  return gone;
}
// the stop state of one request (ctx.job): its call on or waiting for the worker, whether Cancel was pressed, and the promise of the stop
const STOPS = new WeakMap();
function stopOf(ctx) {
  const job = ctx && ctx.job;
  if (!job || typeof job.onCancel !== 'function') return null;
  let st = STOPS.get(job);
  if (!st) { st = { job, call: null, stopped: false, gone: Promise.resolve() }; STOPS.set(job, st);
    job.onCancel(() => { st.stopped = true; if (st.call) st.gone = stopCall(st.call); return st.gone; }); }
  return st;
}
// ctx (optional): the request the call belongs to. While the call waits or runs, the request can be stopped from the job list
function heavy(op, a, ctx) {
  const w = worker();
  if (!w) return Promise.resolve().then(() => OPS[op](a));
  const st = stopOf(ctx);
  if (st && st.stopped) return Promise.reject(stopErr());
  return new Promise((resolve, reject) => {
    const q = { id: ++WN, op, a, w: null, settle(e, r) { if (st && st.call === q) { st.call = null; st.job.canCancel = false; } if (e) reject(e); else resolve(r); } };
    if (st) { st.call = q; st.job.canCancel = true; }
    WQ.push(q); pump();
  });
}
// put the files of a Write back as they were before it (a file it made is deleted, a folder it made goes when empty). now(s) = the
// bytes a file has now; a file that already has its old bytes is left alone
function putBack(mod, files, dirs, now) {
  let n = 0, removed = 0, restored = 0;
  for (const s of files) {
    if (same(s.before, now(s))) continue;
    const f = path.join(mod, s.rel); n++;
    if (s.before === null) { fs.rmSync(f, { force: true }); removed++; } else { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s.before); restored++; }
  }
  let d = 0;
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) { try { const p = path.join(mod, dir); if (fs.readdirSync(p).length === 0) { fs.rmdirSync(p); d++; } } catch (e) { /* gone or not empty */ } }
  return { n, removed, restored, d };
}
// a plan from the worker: its bytes as Buffers again (they cross as Uint8Array)
const bufs = r => (r && r.ok && r.planned ? Object.assign(r, { planned: r.planned.map(f => ({ rel: f.rel, buf: f.buf == null ? f.buf : Buffer.from(f.buf) })) }) : r);

module.exports = gameOf => {
  async function start(url, body, ctx) {
    let goh = false; try { goh = gameOf(ctx).kind === 'goh'; } catch (e) { goh = false; }
    // GoH: the kinds with a GoH map and units (read on the worker: the GoH view opens there); Write through spgoh.js, not tried in game
    if (goh) { const g = gameOf(ctx), r = await heavy('gohTpl', { g }, ctx);
      return { goh: true, write: true, tested: false, armies: r.armies || GOH_ARMIES, types: SP.OBJ_TYPES, levels: SP.LEVELS, proven: proven(), templates: r.templates }; }
    return { goh: false, armies: ARMIES, types: SP.OBJ_TYPES, levels: SP.LEVELS, proven: proven(),
      templates: SP.templates().map(t => ({ name: t.name, title: t.spec.title, spec: t.spec, goals: t.spec.objectives.map(o => o.type) })) };
  }
  async function maps(url, body, ctx) {
    const g = asGame(gameOf, ctx), mod = modOpt(url.searchParams.get('mod'), ctx);
    return Object.assign(await heavy('maps', { g, mod }, ctx), { game: g.id });
  }
  async function places(url, body, ctx) {
    const g = asGame(gameOf, ctx), mod = modOpt(url.searchParams.get('mod'), ctx), key = MP.mapKeyOk(url.searchParams.get('map'));
    return Object.assign(await heavy('places', { g, mod, key }, ctx), { game: g.id });
  }
  async function units(url, body, ctx) {
    const g = asGame(gameOf, ctx), mod = modOpt(url.searchParams.get('mod'), ctx);
    const army = String(url.searchParams.get('army') || '');
    if (!(g.kind === 'goh' ? /^[a-z][a-z0-9_]{0,31}$/.test(army) : ARMIES.includes(army))) throw bad('missions.e.army');   // GoH: the view decides (gohArmies)
    return Object.assign({}, await heavy('units', { g, mod, army }, ctx), { game: g.id });
  }
  // the mods of <game>/mods (the folders the game lists), and where the asked mod stands
  async function mods(url, body, ctx) {
    const g = asGame(gameOf, ctx), dir = path.join(g.dir, 'mods'), list = [];
    let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort((a, b) => a.localeCompare(b)); } catch (e) { names = []; }
    for (const n of names.slice(0, 300)) list.push({ path: path.join(dir, n), name: n, modInfo: fs.existsSync(path.join(dir, n, 'mod.info')) });
    const asked = String(url.searchParams.get('mod') || ''), m = modOpt(asked, ctx);
    // gone: the folder is not there (moved, renamed, deleted): the card says so with its own next step
    return { dir, mods: list, cur: asked ? { path: asked, ok: !!m, gone: !m && !fs.existsSync(path.resolve(asked)), inMods: !!m && inMods(g, m), modInfo: !!m && fs.existsSync(path.join(m, 'mod.info')) } : null };
  }
  async function preview(url, body, ctx) {
    body = body || {};
    const g = asGame(gameOf, ctx), goh = g.kind === 'goh', mod = modOk(body.mod, ctx, goh), spec = specOk(body.spec);
    const w = where(mod, spec);
    // GoH: the plan as data and text, and the files the GoH writer puts down with their states (header: GoH); never tested in game
    if (goh) {
      const o = { ok: false, goh: true, write: true, tested: false, mod, game: g.id, modInfo: fs.existsSync(path.join(mod, 'mod.info')), inMods: inMods(g, mod), exists: w.exists, generated: w.generated };
      if (w.exists && !w.generated) return Object.assign(o, { refusal: { code: 'SPMIS_EXISTS', msg: 'a folder of that name that this card did not make', field: 'name', sub: '' } });
      if (ctx.job) ctx.job.set({ what: 'job.w.spmis' });
      const r = gbufs(await heavy('gohRun', { g, mod, spec }, ctx));
      if (!r.ok) return Object.assign(o, { refusal: r.refusal });
      const files = gohStates(mod, r, w.exists), side = GOH.campaignSide(mod, r.P.campaign), camp = files.find(f => f.state === 'kept' && /\/interface\.set$/.test(f.rel));
      // a campaign file that stays (kept) and names another side: said before the write too (SPGOH_CAMP_SIDE)
      const notes = (r.area ? [] : [{ code: 'SPMIS_AREA_UNKNOWN', rel: '', msg: SP.AREA_UNKNOWN }]).concat(r.gnotes || [], camp && side && side !== r.X.army ? [campNote(r.P.campaign, side, r.X.army)] : []);
      return Object.assign(o, { ok: true, files, dirs: newDirs(mod, files.filter(f => f.state === 'new').map(f => f.rel)).length, notes,
        plan: r.plan, groups: r.groups, text: r.text, campaign: r.P.campaign, mission: r.P.name, title: r.P.texts.name, campaignTitle: r.P.campaignTitle });
    }
    const out = { ok: false, mod, game: g.id, modInfo: fs.existsSync(path.join(mod, 'mod.info')), inMods: inMods(g, mod), exists: w.exists, generated: w.generated };
    if (w.exists && !w.generated) return Object.assign(out, { refusal: { code: 'SPMIS_EXISTS', msg: 'a folder of that name that this card did not make', field: 'name', sub: '' } });
    // the same replace flag as Write: a rewrite of a mission this card made puts its campaign files down again
    if (ctx.job) ctx.job.set({ what: 'job.w.spmis' });
    const r = bufs(await heavy('run', { g, mod, spec, write: false, force: w.exists }, ctx));
    if (!r.ok) return Object.assign(out, { refusal: r.refusal });
    const files = states(mod, r);
    return Object.assign(out, { ok: true, files, dirs: newDirs(mod, files.filter(f => f.state === 'new').map(f => f.rel)).length, notes: r.notes,
      campaign: r.P.campaign, mission: r.P.name, title: r.P.texts.name, campaignTitle: r.P.campaignTitle });
  }
  async function write(url, body, ctx) {
    body = body || {};
    if (ctx.session && ctx.session.remote) throw bad('missions.e.spphone');
    const g = asGame(gameOf, ctx, true), mod = modOk(body.mod, ctx), spec = specOk(body.spec);
    const w = where(mod, spec);
    // a folder of that name: replaced only when this card made it (its spmis.json) and the page said so (body.replace)
    if (w.exists && (!w.generated || !body.replace)) return { ok: false, mod, exists: true, generated: w.generated, refusal: { code: 'SPMIS_EXISTS', msg: 'exists', field: 'name', sub: '' } };
    // JOBS: a Write can be stopped from the job list at any point, and a stopped Write leaves the mod as it was. Before the first file
    // (the plan): the call ends, nothing was written. From the first file on (the write call on the worker, the check, milint): the
    // worker is ended first, then every file of the plan gets its bytes from before (the Undo snapshot; putBack), new folders go, and
    // no Undo token is kept. The request then ends as stopped (499), never as written. A write call that fails by itself is put back too.
    if (ctx.job) { ctx.job.set({ what: 'job.w.spmis' }); ctx.job.writes = true; }
    const st = stopOf(ctx), halted = () => !!(st && st.stopped);
    if (g.kind === 'goh') return gohWrite(g, mod, spec, w, st, halted, ctx);
    const plan = bufs(await heavy('run', { g, mod, spec, write: false, force: w.exists }, ctx));
    if (!plan.ok) return { ok: false, mod, refusal: plan.refusal };
    const rels = states(mod, plan).map(f => f.rel);
    // every file of the plan lies inside the mod folder, else nothing is written
    const off = rels.find(rel => !inMod(mod, rel));
    if (off) return { ok: false, mod, refusal: { code: 'SP_OUTSIDE_MOD', msg: String(off).slice(0, 200), field: 'mod', sub: '' } };
    const dirs = newDirs(mod, rels), snap = snapshot(mod, rels);
    let token = '';
    // CACHE: after anything that wrote into the mod (the write, a put-back) the shared walk of the mod reads it again (lib/modtree touch)
    const touch = () => { try { (ctx.modtree || require('../../../lib/modtree')).touch(mod); } catch (e) { /* nothing kept */ } };
    const back = async () => { if (st) await st.gone; if (token) UNDO.delete(token); putBack(mod, snap, dirs, s => readOr(path.join(mod, s.rel))); touch(); };
    let r; try { r = await heavy('run', { g, mod, spec, write: true, force: w.exists }, ctx); } catch (e) { await back(); throw e; } finally { touch(); }
    if (!r.ok) return { ok: false, mod, refusal: r.refusal };
    for (const s of snap) s.after = readOr(path.join(mod, s.rel));
    token = crypto.randomBytes(12).toString('hex');
    UNDO.set(token, { mod, files: snap, dirs, mission: r.P.name, at: Date.now() });
    if (UNDO.size > 40) UNDO.delete(UNDO.keys().next().value);
    const c = r.P.campaign, m = r.P.name;
    let rep; try { rep = await heavy('check', { g, mod, m }, ctx); } catch (e) { if (halted()) await back(); throw e; }
    let lint = null;
    try {
      lint = await MP.lintMod(ctx, g.dir, mod, 'missions');
      const low = ('/' + m + '/').toLowerCase();
      if (lint && lint.findings) { lint.findings = lint.findings.filter(f => String(f.where || '').replace(/\\/g, '/').toLowerCase().includes(low)); lint.count = lint.findings.filter(f => f.sev !== 'info').length; }
    } catch (e) { lint = { ran: false, count: 0, findings: [] }; }
    if (halted()) { await back(); throw stopErr(); }
    const changed = snap.filter(s => !same(s.before, s.after));
    return { ok: true, mod, game: g.id, files: r.files, written: changed.length, dirs: dirs.length, undo: token, notes: r.notes, campaign: c, mission: m, title: r.P.texts.name, campaignTitle: r.P.campaignTitle,
      check: { count: rep.list.length, findings: rep.list.slice(0, 40) }, lint, link: 'ide:resource/map/single/' + c + '/' + m + '/0.mi',
      modInfo: fs.existsSync(path.join(mod, 'mod.info')), inMods: inMods(g, mod), proven: proven() };
  }
  // GoH Write (spgoh.js): the plan on the worker, the Undo snapshot, then spgoh.write through lib/modwrite (every target guarded, a
  // restore point per file, then the files), then the read-back through a fresh GoH view (its findings are the check lines). A stop or
  // a failed write puts every file back as for AS2. Then milint (--exe goh) on the mod, its mission codes of this mission's folder
  async function gohWrite(g, mod, spec, w, st, halted, ctx) {
    const force = w.exists, r = gbufs(await heavy('gohRun', { g, mod, spec }, ctx));
    if (!r.ok) return { ok: false, mod, goh: true, refusal: r.refusal };
    const rels = GOH.filesToWrite(mod, r, force).map(f => f.rel).concat([GOH.MAN(r.X.campaign, r.X.name)]);
    const off = rels.find(rel => !inMod(mod, rel));
    if (off) return { ok: false, mod, goh: true, refusal: { code: 'SP_OUTSIDE_MOD', msg: String(off).slice(0, 200), field: 'mod', sub: '' } };
    const states0 = gohStates(mod, r, force), dirs = newDirs(mod, rels), snap = snapshot(mod, rels);
    let token = '';
    const touch = () => { try { (ctx.modtree || require('../../../lib/modtree')).touch(mod); } catch (e) { /* nothing kept */ } };
    const back = async () => { if (st) await st.gone; if (token) UNDO.delete(token); putBack(mod, snap, dirs, s => readOr(path.join(mod, s.rel))); touch(); };
    let res;
    try { res = GOH.write(mod, r, spec, force, { game: g.dir }); } catch (e) {
      await back();
      if (e && e.code === 'MOD_WRITE_OUTSIDE') return { ok: false, mod, goh: true, refusal: { code: 'SP_OUTSIDE_MOD', msg: String(e.message).slice(0, 300), field: 'mod', sub: '' } };
      throw e;
    } finally { touch(); }
    for (const s of snap) s.after = readOr(path.join(mod, s.rel));
    token = crypto.randomBytes(12).toString('hex');
    UNDO.set(token, { mod, files: snap, dirs, mission: r.P.name, at: Date.now(), goh: true });
    if (UNDO.size > 40) UNDO.delete(UNDO.keys().next().value);
    let rb; try { rb = await heavy('gohBack', { g, mod, X: r.X }, ctx); } catch (e) { if (halted()) await back(); throw e; }
    if (halted()) { await back(); throw stopErr(); }
    const c = r.P.campaign, m = r.P.name, changed = snap.filter(s => !same(s.before, s.after)), side = GOH.campaignSide(mod, c);
    const notes = (r.gnotes || []).concat(side && side !== r.X.army ? [campNote(c, side, r.X.army)] : []);
    // milint on GoH (its GoH tables give no finding on the game's own files): the mission codes of this mission's folder, as for AS2
    let lint = null;
    try {
      lint = await MP.lintMod(ctx, g.dir, mod, 'missions');
      const low = ('/' + m + '/').toLowerCase();
      if (lint && lint.findings) { lint.findings = lint.findings.filter(f => String(f.where || '').replace(/\\/g, '/').toLowerCase().includes(low)); lint.count = lint.findings.filter(f => f.sev !== 'info').length; }
    } catch (e) { lint = { ran: false, count: 0, findings: [] }; }
    if (halted()) { await back(); throw stopErr(); }
    return { ok: true, goh: true, tested: false, mod, game: g.id, files: states0.map(f => ({ rel: f.rel, kept: f.state === 'kept', copied: f.copied, bytes: f.bytes })), written: changed.length, dirs: dirs.length,
      points: res.points, undo: token, notes, campaign: c, mission: m, title: r.P.texts.name, campaignTitle: r.P.campaignTitle,
      check: { count: rb.list.length, findings: rb.list.slice(0, 40) }, lint, link: 'ide:resource/map/single/' + c + '/' + m + '/0.mi',
      modInfo: fs.existsSync(path.join(mod, 'mod.info')), inMods: inMods(g, mod), proven: proven() };
  }
  // Undo of one Write: every file it touched gets its bytes from before (a file it made is deleted, a folder it made goes when empty);
  // refused, with nothing changed, when any of those files differs from what the Write left (changed by hand or by another Write)
  async function undo(url, body, ctx) {
    body = body || {};
    if (ctx.session && ctx.session.remote) throw bad('missions.e.spphone');
    const u = UNDO.get(String(body.token || ''));
    if (!u) return { ok: false, code: 'SP_UNDO_GONE' };
    const mod = modOk(body.mod, ctx);
    if (path.resolve(mod) !== path.resolve(u.mod)) return { ok: false, code: 'SP_UNDO_GONE' };
    if (u.files.some(s => !inMod(mod, s.rel))) return { ok: false, code: 'SP_UNDO_GONE' };
    // a GoH Write (spgoh.js): every file guarded by lib/modwrite before one is put back
    if (u.goh) { const MW = require('../../../lib/modwrite'); if (u.files.some(s => MW.fileWhy(mod, path.join(path.resolve(mod), ...s.rel.split('/'))))) return { ok: false, code: 'SP_UNDO_GONE' }; }
    const changed = u.files.filter(s => !same(readOr(path.join(mod, s.rel)), s.after)).map(s => s.rel);
    if (changed.length) return { ok: false, code: 'SP_UNDO_CHANGED', files: changed.slice(0, 20) };
    const b = putBack(mod, u.files, u.dirs, s => s.after), n = b.n, removed = b.removed, restored = b.restored, d = b.d;
    UNDO.delete(String(body.token));
    (ctx.modtree || require('../../../lib/modtree')).touch(mod);   // CACHE: files of the mod were put back
    return { ok: true, files: n, removed, restored, dirs: d, mission: u.mission };
  }
  // is an Undo token still held (ARSENAL restarted = gone): the page greys its Undo button with the plain sentence
  async function undoOk(url) { return { ok: UNDO.has(String(url.searchParams.get('token') || '')) }; }
  async function mine(url, body, ctx) {
    const mod = modOpt(url.searchParams.get('mod'), ctx);
    if (!mod) return { missions: [] };
    const goh = isGoh(gameOf, ctx);   // the missions of this game's form (manifest exe goh on GoH, the others on AS2 / AS64)
    return { missions: SP.generated(mod).filter(x => (x.exe === 'goh') === goh).slice(0, 200).map(x => ({ campaign: x.campaign, mission: x.mission, title: x.title, map: x.map, spec: x.spec, link: 'ide:resource/map/single/' + x.campaign + '/' + x.mission + '/0.mi' })) };
  }
  async function remove(url, body, ctx) {
    body = body || {};
    if (ctx.session && ctx.session.remote) throw bad('missions.e.spphone');
    const mod = modOk(body.mod, ctx), m = String(body.mission || '');
    if (!ID.test(m)) throw bad('missions.e.spec');
    // GoH: spgoh.remove (the manifest's files, localizations/ texts too, a restore point per file first)
    if (isGoh(gameOf, ctx)) {
      let r; try { r = GOH.remove(mod, m, { game: gameOf(ctx).dir }); } catch (e) {
        if (e && e.code === 'MOD_WRITE_OUTSIDE') return { ok: false, refusal: { code: 'SP_OUTSIDE_MOD', msg: String(e.message).slice(0, 300), field: '', sub: '' } };
        if (!(e instanceof SP.Refuse)) throw e;
        const root = path.join(mod, 'resource', 'map', 'single'); let there = false;
        try { there = fs.readdirSync(root, { withFileTypes: true }).some(d => d.isDirectory() && fs.existsSync(path.join(root, d.name, m))); } catch (x) { there = false; }
        return { ok: false, refusal: { code: e.code === 'SPMIS_NOT_GENERATED' && !there ? 'SP_GONE' : e.code, msg: e.message, field: '', sub: '' } };
      }
      (ctx.modtree || require('../../../lib/modtree')).touch(mod);   // CACHE: files of the mod were removed
      return { ok: true, goh: true, files: r.files, dirs: r.dirs, removed: r.files + r.dirs, kept: r.kept };
    }
    const rep = collector();
    try { SP.remove({ remove: mod, mission: m }, rep); } catch (e) {
      if (!(e instanceof SP.Refuse)) throw e;
      // no folder of that name in any campaign of the mod: it was removed already (a second Remove), said as such
      const root = path.join(mod, 'resource', 'map', 'single'); let there = false;
      try { there = fs.readdirSync(root, { withFileTypes: true }).some(d => d.isDirectory() && fs.existsSync(path.join(root, d.name, m))); } catch (x) { there = false; }
      return { ok: false, refusal: { code: e.code === 'SPMIS_NOT_GENERATED' && !there ? 'SP_GONE' : e.code, msg: e.message, field: '', sub: '' } };
    }
    (ctx.modtree || require('../../../lib/modtree')).touch(mod);   // CACHE: files of the mod were removed
    const rm = rep.infos.filter(x => x.code === 'SPMIS_REMOVED');
    return { ok: true, files: rm.filter(x => !/folder/.test(x.msg)).length, dirs: rm.filter(x => /folder/.test(x.msg)).length, removed: rm.length, kept: rep.infos.filter(x => x.code === 'SPMIS_KEPT').map(x => x.rel) };
  }
  return {
    'GET /api/x/missions/sp/start': start,
    'GET /api/x/missions/sp/maps': maps,
    'GET /api/x/missions/sp/places': places,
    'GET /api/x/missions/sp/units': units,
    'GET /api/x/missions/sp/mods': mods,
    'POST /api/x/missions/sp/preview': preview,
    'POST /api/x/missions/sp/write': write,
    'POST /api/x/missions/sp/undo': undo,
    'GET /api/x/missions/sp/undo-ok': undoOk,
    'GET /api/x/missions/sp/mine': mine,
    'POST /api/x/missions/sp/remove': remove,
  };
};
module.exports.guard = { noClimb, inMod };
module.exports._t = { noClimb, inMod, fieldOf, placesOf, unitsOf, unitsOfGoh, gohTemplates, gohPlan, potKeys, GOH_ARMIES, gohArmies, mapList, labelOf, inMods, ARMIES, UNDO, whyOf, WHY, proven, UNITS, VIEWS, heavy, queue: () => ({ waiting: WQ.length, running: RUN ? RUN.op : '' }) };

// the worker thread (see heavy()): one call at a time, answers by id
{
  let WT = null; try { WT = require('worker_threads'); } catch (e) { WT = null; }
  if (WT && !WT.isMainThread && WT.workerData && WT.workerData.spWorker) {
    WT.parentPort.on('message', m => {
      try { WT.parentPort.postMessage({ id: m.id, r: OPS[m.op](m.a) }); } catch (e) { WT.parentPort.postMessage({ id: m.id, err: { message: String((e && e.message) || e), status: (e && e.status) || 0 } }); }
    });
  }
}
