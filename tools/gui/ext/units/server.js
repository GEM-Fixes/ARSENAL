// GUI-EXT units: server side. Unit catalogue (statsheet --units-json through ctx.runTool, kept in the shared store), search with
// "did you mean", stats in plain words, change wizard (price, name, armour, unlock, rank), add a unit (clone + card + wreck + bots),
// balance (mod vs vanilla, whole-army price change, price hints) and two recipes (bigger squad, longer rifle range).
// Edits run gen's own ops in-process (gen/lib/ops + Ctx) with the user's mod folder as the base, so nothing outside the
// edited files is touched: preview = plan (nothing written), write = same ops + flush into the mod folder.
// Games (lib/games ids): the request's game is body.gid, else the page's game (ctx.gameId, sent by api()), else 'goh' for a GoH
// install folder, else as64. AS64 and MoW:AS2 share the install: the game goes to statsheet (--exe, only when not as64), into the
// catalogue cache key and into gen's Ctx target, so MoW:AS2 sees its own file set (no as64/core). AS64 runs as before. MoW:AS2 and
// GoH read through the shared entity index of their exe (no --cache: entityindex cachePath per exe); a cold GoH index takes 1-3 min, then 10-25 s.
// Gates of Hell: the GoH install (ctx.curDir) is the game folder; the catalogue gets army and period from the card file
// (units/<period>/units_<army>.set); cards are {"id" (macro .. cost(N) ci(N)) ..} blocks: price = cost, unlock = ci (or cool on a
// doctrine card) [I]; GoH reads no level and no fore (GHMIS-85) and has no bot.data.lua (GHMIS-66); names go to the mod's
// localizations/default/interface/text/<mod>.pot (msgctxt = key, GHLOC-01 [V], same writer as gen); add copies the card block
// (period pick) and clones the entity only for a card that buys the entity of its own name. Writes go only to a GoH mod folder
// outside the GoH install (lib/writeguard). GoH armour change: ./goharmour (tools/lib/goharmour); describe in words: describeGoh.
// GoH: one id has a card in each period list, so the page sends the picked card (u.card = id@card file@period); a squad a macro
// builds is edited and copied on its call line in units/<period>/units_<army>.set (gohCall); compare pairs the same card.
// Author: Imperator_Aug (ARSENAL, ia-8f1b2d0a)
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const os = require('os');
const bad = msg => { throw Object.assign(new Error(msg), { status: 400 }); };
const lc = s => String(s == null ? '' : s).toLowerCase();
const norm = s => lc(s).replace(/[^a-z0-9Ѐ-ӿ一-鿿]+/g, '');
const md5 = s => crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 10);
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// lazy requires (literal paths so the single-exe bundler keeps them)
let G = null;
function gen() {
  if (!G) G = { ops: require('../../../gen/lib/ops'), Ctx: require('../../../gen/lib/ctx').Ctx || require('../../../gen/lib/ctx'),
    describe: require('../../../gen/lib/describe'), ai: require('../../../gen/lib/ai'), genMain: require('../../../gen/gen'),
    vfs: require('../../../lib/vfs'), patch: require('../../../patch-entity/patch-entity'), lngAdd: require('../../../lng-add/lng-add') };
  return G;
}

// ---------- games ----------
let GM = null;
const games = () => GM || (GM = require('../../../lib/games'));
const isGohDir = d => { try { return !!d && fs.statSync(path.join(d, 'binaries', 'x64', 'call_to_arms.exe')).isFile(); } catch (e) { return false; } };
// the request's game id: body.gid, else the page's game (ctx.gameId), else goh for a GoH install folder, else as64
function gidOf(ctx, body, game) {
  const g = (body && body.gid) || (ctx && typeof ctx.gameId === 'function' && ctx.gameId()) || null;
  if (g) { const id = games().idOf(g); if (!id) bad('Unknown game "' + g + '" (as64, mowas2 or goh).'); return id; }
  return isGohDir(game) ? 'goh' : 'as64';
}
const gameName = gid => (games().get(gid) || {}).name || gid;
// one plain line for a part that cannot exist in a game (the page shows it as it is)
const notIn = (gid, why, row) => bad('Not available in ' + gameName(gid) + ': ' + why + (row ? ' (' + row + ')' : '') + '.');
// GoH writes: only a mod folder outside the GoH install (lib/writeguard refusal as one plain line)
function guardWrite(gid, game, mod, body) {
  if (gid !== 'goh' || !body || !body.write || !mod) return;
  const why = require('../../../lib/writeguard').refuseWrite(mod, { game });
  if (why) bad(String(why).replace(/^refused:\s*/, ''));
}

// ---------- paths and guards ----------
function gameOf(ctx, body) {
  if (gidOf(ctx, body) === 'goh') {
    const g = (body && body.game) || (ctx.curDir && ctx.curDir()) || (ctx.gohDir && ctx.gohDir()) || null;
    if (!g || !fs.existsSync(g)) bad('No Gates of Hell folder found. Set the Gates of Hell folder on the Start page first.');
    return path.resolve(g);
  }
  const g = (body && body.game) || (ctx.game && ctx.game()) || null;
  if (!g || !fs.existsSync(g)) bad('No game folder found. Set the Men of War: Assault Squad 2 folder on the Start page first.');
  return path.resolve(g);
}
function inside(a, b) { const r = path.relative(b, a); return !!r && !r.startsWith('..') && !path.isAbsolute(r); }
// a folder the user picked: never the game install (only <game>/mods/<mod>), GoH (for an AS2 game) or Workshop.
// Under GoH (game = the GoH install) a GoH mod folder is read; writing there is refused by guardWrite
function modOf(body, game, need) {
  const p = body && body.mod;
  if (!p) { if (need) bad('Pick your mod folder first (the Mod button at the top of the page). Changes are written only there.'); return null; }
  const a = path.resolve(String(p));
  if (!fs.existsSync(a) || !fs.statSync(a).isDirectory()) bad('The mod folder was not found: ' + a);
  // a Workshop item: only with Advanced on under Tools & Settings (lib/writeguard, owner 2026-11-15), for every game
  if (/[\\/]steamapps[\\/]workshop[\\/]/i.test(a) && require('../../../lib/writeguard').refuseWrite(a, { game: game || undefined })) bad('That folder is a Steam Workshop download. Copy it to your own mod folder first, or switch on Advanced under Tools & Settings to write straight into it.');
  if (/gates of hell|call to arms/i.test(a) && !isGohDir(game)) bad('That folder belongs to Gates of Hell. This page edits Assault Squad 2 mods only.');
  if (game) {
    const mods = path.join(game, 'mods');
    const rm = path.relative(mods, a);
    if (path.resolve(a) === path.resolve(game) || (inside(a, game) && (!inside(a, mods) || /[\\/]/.test(rm))))
      bad('That folder is the game install itself. Pick a mod folder (inside <game>/mods/<your mod>, or anywhere outside the game).');
  }
  return a;
}
// CACHE (gui README, contract 1): the mod's signature comes from the one shared walk (lib/modtree), the game's from lib/gameview
// stamp, and the finished catalogue lives in the shared store (lib/cachestore), so a restart does not read the game again.
// A caller without a GUI ctx (tools/balance CLI, tests) gets the same modules; its store sits under its tmpRoot when it names one.
const MT = ctx => (ctx && ctx.modtree) || require('../../../lib/modtree');
const GV = ctx => (ctx && ctx.gameview) || require('../../../lib/gameview');
function storeOf(ctx) {
  if (ctx && ctx.cache) return ctx.cache;
  const CS = require('../../../lib/cachestore');
  return CS.open(ctx && ctx.tmpRoot ? { root: path.join(ctx.tmpRoot, 'cache', 'store') } : {});
}
// modTree: the mod's file list and area signatures. A big mod (RobZ Realism, 112k files) takes about 4 s to walk (async, shared by
// every page). ensure() gives the last walk while it is younger than 15 s and no page wrote into the mod since (modtree.touch);
// ctx.modAgeMs sets another age (tests: 0 = a walk per request). fast: a read-only list of the page (search, index, stats, weapons)
// takes the last walk this page saw when a new one is still running, so a keystroke never waits; the new one serves the next request.
// A write of this page forgets the folder (finish), so the request after a write always waits for the walk that saw it.
const SEEN = new Map();
async function modTree(ctx, mod, fast) {
  if (!mod) return null;
  const k = path.resolve(mod), age = ctx && ctx.modAgeMs != null ? { maxAgeMs: ctx.modAgeMs } : {};
  const p = MT(ctx).ensure(k, age);
  if (fast && SEEN.has(k)) {
    const now = await Promise.race([p, Promise.resolve(null)]);   // p first: an answer it already has wins
    if (now) { SEEN.set(k, now); return now; }
    p.then(T => { if (SEEN.has(k)) SEEN.set(k, T); }, () => {});
    return SEEN.get(k);
  }
  const T = await p; SEEN.set(k, T); return T;
}
// the old name, kept for callers that only want "did the mod change": the signature of every file of the mod
async function modSig(mod, fast, ctx) { if (!mod) return 'none'; return (await modTree(ctx, mod, fast)).all; }
const forgetSig = mod => { if (mod) { SEEN.delete(path.resolve(mod)); require('../../../lib/modtree').touch(mod); } };

// ---------- catalogue ----------
// Store entry 'units.catalogue': parts {game, gid, mod}, stamps {game, mod:<CAT_AREAS>}. The game-only catalogue has no mod stamp,
// so every mod shares it. CAT_AREAS = what statsheet --units-json reads of a mod: the card lists and stuff (set), the entities and
// the property files they include (entity, properties), bot.data.lua (script), the texts (text; a mod's resource/interface/text is
// area interface) and its paks. Maps and files outside resource/ (other) are not read.
const CAT_VER = 3, CAT_SECTION = 'units.catalogue', CAT_AREAS = ['set', 'entity', 'properties', 'script', 'interface', 'text', 'pak'];
// the maker's version per game: GoH is 3 since statsheet fills u.bots from the GoH purchase lists (the AS2 games keep their entries)
const catVer = gid => gid === 'goh' ? 4 : CAT_VER;
const catParts = (game, gid, mod) => ({ game: path.resolve(game), gid, mod: mod ? path.resolve(mod) : '' });
const catStamps = (ctx, game, gid, mod, T) => Object.assign({ game: GV(ctx).stamp({ gameDir: game, gid }) }, mod ? MT(ctx).stamps(T, CAT_AREAS) : {});
const MEM = new Map(), MEM_MAX = 2;   // the game's catalogue and the mod's one, both asked for by every request (both)
async function catalogue(ctx, game, mod, fast) {
  const gid = gidOf(ctx, null, game), S = storeOf(ctx);
  const T = await modTree(ctx, mod, fast);
  const parts = catParts(game, gid, mod), stamps = catStamps(ctx, game, gid, mod, T);
  const key = md5(JSON.stringify([parts, stamps]));
  if (MEM.has(key)) return MEM.get(key);
  const raw = await S.wrap(CAT_SECTION, catVer(gid), parts, stamps, async () => {
    // the child writes the list to a scratch file; it goes into the store when the child ended well, then the file is removed
    const dir = path.join(ctx.tmpRoot || os.tmpdir(), 'units'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'cat-' + key + '-' + process.pid + '.json');
    // AS64: the page's own entity index file (statsheet --cache; self-checking, each record carries the signatures of the files it
    // came from), kept next to the store, not in the OS temp folder. Another game: no --cache, so statsheet uses the shared entity
    // index of that exe (entityindex cachePath: vanilla.<exe>.json, folder-<hash>.<exe>.json), the one the other tools build too
    const args = [game, '--units-json', '-o', file, '-q'];
    if (gid === 'as64') {
      const ixDir = path.join(path.dirname(S.root), 'units'); fs.mkdirSync(ixDir, { recursive: true });
      args.push('--cache', path.join(ixDir, 'ix-' + md5(game + '|' + (mod || '')) + '.json'));
    }
    if (mod) args.push('--folder', mod);
    if (gid !== 'as64') args.push('--exe', games().exeOf(gid));   // the AS64 argument list stays as it was
    // every game gets 10 minutes: a cold GoH index (every file of the GoH install) now takes 1-3 minutes, a warm read 10-25 s
    // (was 17-30 min before the entity index was made faster). A stopped run keeps no index, so a retry starts from zero again
    const mins = 10;
    try {
      const r = await ctx.runTool('statsheet', 'statsheet/statsheet.js', args, { timeoutMs: mins * 60000 });
      // JOBS: stopped from the footer. Thrown (the dispatcher answers 499), so no route goes on to its write; nothing is stored
      if (r.cancelled) throw Object.assign(new Error('Stopped.'), { status: 499, cancelled: true });
      if (r.timedOut) bad('Reading the game data took longer than ' + mins + ' minutes and was stopped; nothing of that read was kept. The first read of a game (or of a new mod folder) builds an index of every file; try again when the computer is less busy. Once one read has finished, the next ones are fast.');
      if (r.code !== 0 || !fs.existsSync(file)) bad('Could not read the unit list: ' + String(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' '));
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } finally { try { fs.rmSync(file, { force: true }); } catch (e) { /* not written */ } }
  });
  if (MEM.has(key)) return MEM.get(key);   // two requests shared the read: one object for both
  const cat = raw;
  if (gid === 'goh') gohPlaces(cat);
  cat.byId = new Map(cat.units.map(u => [lc(u.id), u])); cat._key = key; cat._gid = gid;
  if (gid === 'goh') cat.byCard = new Map(cat.units.map(u => [u.card, u]));   // one id has a card in each period list
  MEM.delete(key); MEM.set(key, cat);
  while (MEM.size > MEM_MAX) MEM.delete(MEM.keys().next().value);
  return cat;
}
// Prepare section units.catalogue (gui README, "Prepare sections"): the game's catalogue and, with a mod, the mod's
function prepCtx(ctx, q) {
  const c = Object.create(ctx || {}), g = (q && q.game) || {};
  if (g.id) c.gameId = () => g.id;
  if (g.dir) { c.game = () => g.dir; c.curDir = () => g.dir; }
  return c;
}
function prepWhere(ctx, q) {
  const c = prepCtx(ctx, q), game = gameOf(c, null), gid = gidOf(c, null, game);
  return { c, game, gid, mod: q && q.mod ? path.resolve(String(q.mod)) : null };
}
// the worse of several store states, as one answer (none before stale before ready)
function worst(list) {
  const rank = { none: 0, stale: 1, ready: 2 }, out = { state: 'ready', why: [], at: 0, bytes: 0 };
  for (const s of list) {
    if (rank[s.state] < rank[out.state]) out.state = s.state;
    for (const w of s.why || []) if (!out.why.includes(w)) out.why.push(w);
    out.at = Math.max(out.at, s.at || 0); out.bytes += s.bytes || 0;
  }
  return out;
}
function catState(ctx, q) {
  let w; try { w = prepWhere(ctx, q); } catch (e) { return { state: 'na', why: [], note: e.message }; }
  const S = storeOf(w.c), list = [S.state(CAT_SECTION, catVer(w.gid), catParts(w.game, w.gid, null), catStamps(w.c, w.game, w.gid, null, null))];
  if (w.mod) {
    const T = MT(w.c).last(w.mod);
    if (!T) return Object.assign(worst(list), { state: 'none', why: ['mod'] });
    list.push(S.state(CAT_SECTION, catVer(w.gid), catParts(w.game, w.gid, w.mod), catStamps(w.c, w.game, w.gid, w.mod, T)));
  }
  return worst(list);
}
async function catRun(ctx, q, job) {
  const w = prepWhere(ctx, q), total = w.mod ? 2 : 1, set = o => { if (job && typeof job.set === 'function') job.set(o); };
  set({ stage: 'game', done: 0, total });
  await catalogue(w.c, w.game, null);
  if (job && job.cancelled) return;
  if (w.mod) { set({ stage: 'mod', done: 1, total }); await catalogue(w.c, w.game, w.mod); }
  set({ stage: 'done', done: total, total });
}
// Prepare section units.kit: what the Equipment card reads before it can show one soldier: the item table (every file of set/stuff,
// kitData) and the items' names as the game shows them (kitNames, in the language the game or the page gives). Game alone, then game + mod.
function kitPrepState(ctx, q) {
  let w; try { w = prepWhere(ctx, q); } catch (e) { return { state: 'na', why: [], note: e.message }; }
  const S = storeOf(w.c), g = { game: GV(w.c).stamp({ gameDir: w.game, gid: w.gid }) }, list = [];
  const both = (mod, T) => {
    const parts = catParts(w.game, w.gid, mod);
    list.push(S.state(KIT_SECTION, KIT_VER, parts, Object.assign({}, g, mod ? MT(w.c).stamps(T, KIT_AREAS) : {})));
    list.push(S.state(KIT_NAMES, KIT_NAMES_VER, Object.assign({}, parts, { lang: '' }), Object.assign({}, g, mod ? MT(w.c).stamps(T, KIT_NAME_AREAS) : {})));
  };
  if (!w.mod) both(null, null);
  else {
    const T = MT(w.c).last(w.mod);
    if (!T) return { state: 'none', why: ['mod'] };
    both(w.mod, T);
  }
  return worst(list);
}
async function kitPrepRun(ctx, q, job) {
  const w = prepWhere(ctx, q), set = o => { if (job && typeof job.set === 'function') job.set(o); };
  set({ stage: 'items', done: 0, total: 2 });
  const D = await kitData(w.c, w.game, w.gid, w.mod);
  if (job && job.cancelled) return;
  set({ stage: 'names', done: 1, total: 2 });
  await kitNames(w.c, w.game, w.gid, w.mod, '', D);
  set({ stage: 'done', done: 2, total: 2 });
}
const prep = [{ id: 'units.catalogue', title: 'units.prep.catalogue', needs: ['game.view', 'mod.tree'], areas: CAT_AREAS, state: catState, run: catRun },
  { id: 'units.kit', title: 'units.prep.kit', needs: ['game.view', 'mod.tree'], areas: ['set', 'properties', 'text', 'pak'], store: ['units.kit.stuff', 'units.kit.names'], state: kitPrepState, run: kitPrepRun }];
// GoH lists are per period and army: units/<period>/units_<army>.set (vehicles, squads) and inf_<army>.set (soldiers). The army and
// period of a card come from its file (the card's own army field can carry the period word); members drop the period prefix.
// One id has a card in each period list (352 of 2158 buyable ids on the real install), so a GoH card is picked by u.card =
// id@card file@period (a squad a macro builds has the define file settings.set as its card file in every period)
const GOH_LIST = /\/units\/([a-z0-9_]+)\/(?:units|inf)_([a-z0-9]+)\.set$/;
const cardKey = u => lc(u.id) + '@' + lc(u.cardFile || '') + '@' + lc(u.period || '');
function gohPlaces(cat) {
  for (const u of cat.units) {
    const m = GOH_LIST.exec(lc(u.cardFile || ''));
    if (m) { u.period = u.period || m[1]; u.army = m[2]; }
    u.card = cardKey(u);
  }
}
const tailOf = b => String(b || '').split('/').pop();
// fast: a read-only list of the page (search, index, stats, weapons): the mod signature may be up to SIG_TTL old (modSig)
async function both(ctx, game, mod, fast) {
  const van = await catalogue(ctx, game, null);
  const vanCopy = { units: van.units, byId: van.byId, byCard: van.byCard, botFile: van.botFile };
  const cur = mod ? await catalogue(ctx, game, mod, fast) : van;
  stamp(van, game, null, ctx.tmpRoot); if (cur !== van) stamp(cur, game, mod, ctx.tmpRoot);
  return { van: vanCopy, cur };
}
// what each buy button is paid with (manpower, special points, a mod's own points) and the cooldown factors of the game
// presets: the same reading the Balance sheet uses (tools/balance/lib economy). Kept per catalogue key; a preset that cannot
// be read leaves manpower and factor 1.
const ECO = new Map();
function stamp(cat, game, mod, tmpRoot) {
  if (cat._eco !== undefined) return;
  const k = cat._key || (game + '|' + (mod || ''));
  if (!ECO.has(k)) {
    let e = null;
    try { e = require('../../../balance/balance').readEconomy(newCtx(game, mod || path.join(tmpRoot || require('os').tmpdir(), 'units-none'), true, cat._gid), cat._gid); } catch (err) { e = null; }
    if (ECO.size > 6) ECO.clear(); ECO.set(k, e);
  }
  const eco = ECO.get(k), B = require('../../../balance/lib'); cat._eco = eco;
  for (const u of cat.units) if (u.buyable) { u.res = B.resOf(u, eco); u.factor = B.factorOf(u, eco); }
}
// card: the GoH card key the page got with the unit (brief/stats u.card); the id alone reaches the last copy of that id
function unitOf(cat, id, card) {
  if (card && cat.byCard) { const c = cat.byCard.get(String(card)); if (c && lc(c.id) === lc(id)) return c; }
  const u = cat.byId.get(lc(id)); if (!u) bad('No unit with the id "' + id + '". Search for it first and pick it from the list.'); return u; }

// ---------- search ----------
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const d = []; for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function armourLine(u) {
  // the macro line ("armor_heavy" turret(f s r t) body(..)) is what the hull really gets; else areas; else the thickest volumes
  let mp = null;
  for (const m of u.armorMacro || []) for (const p of m.parts) if (p.values.length === 4 && (!mp || p.values[0] > mp.front)) mp = { front: p.values[0], side: p.values[1], rear: p.values[2], top: p.values[3] };
  const a = mp || (u.armorAreas && u.armorAreas.length ? u.armorAreas.reduce((m, x) => x.front > m.front ? x : m) : u.armorMax || null);
  return a ? { front: a.front, side: a.side, rear: a.rear, top: a.top } : null;
}
// a group buy: a vehicle card whose content brings more than one thing beside the crews in ( ) ("t34m ( .. ) t34m ( .. ) mp/rus/rifle:6";
// one vehicle with its crew, "* ( .. )" or GoH "panzer4d ( .. )", is not one). The engine spawns every content word, count after ":".
const contentWords = u => String(u.content || '').replace(/[()]/g, ' $& ').trim().split(/\s+/).filter(Boolean);
const cnt = (w, i) => { if (i <= 0) return 1; const c = parseInt(w.slice(i + 1), 10); return c >= 0 ? c : 1; };   // ":0" is written in the game data: none of that one
function manyOf(u) {
  // the catalogue calls a card named "name(army)" a squad, so a group is told by its content: a vehicle word outside ( ), and more than one thing
  if (!u || u.kind === 'soldier' || !u.content) return 0;
  let n = 0, deep = 0, veh = 0;
  for (const w of contentWords(u)) { if (w === '(') deep++; else if (w === ')') deep = Math.max(0, deep - 1); else if (!deep) { const i = w.lastIndexOf(':'); const c = cnt(w, i); n += c; if (c && !/^mp\//i.test(w)) veh++; } }
  return n > 1 && veh ? 1 : 0;
}
// what a group buy brings: {parts [{kind, id, name, n, crew? [{id, name, n}]}] vehicles first, vehicles, men (crews counted)}; null = not a group
const BRINGS = new WeakMap();
function bringsOf(cur, u) {
  if (!manyOf(u)) return null;
  if (BRINGS.has(u)) return BRINGS.get(u);
  const army = lc(u.army || ''), per = u.period ? lc(u.period) + '/' : '';
  const sol = name => cur.byId.get(lc(name)) || (/\//.test(name) ? null : cur.byId.get('mp/' + army + '/' + per + lc(name)) || cur.byId.get('mp/' + army + '/' + lc(name)));
  const veh = name => { const c = cur.byId.get(lc(name)) || cur.byId.get(lc(name) + '(' + army + ')'); if (c && c.kind !== 'soldier') return c; if (!cur._byVeh) { cur._byVeh = new Map(); for (const x of cur.units) if (x.kind === 'vehicle' && x.name) { const k = lc(x.vehicle || String(x.id).replace(/\(.*$/, '')); if (!cur._byVeh.has(k)) cur._byVeh.set(k, x); } } return cur._byVeh.get(lc(name)) || null; };
  const parts = []; let last = null, deep = 0;
  for (const w of contentWords(u)) {
    if (w === '(') { deep++; continue; } if (w === ')') { deep = Math.max(0, deep - 1); continue; }
    const i = w.lastIndexOf(':'), raw = i > 0 ? w.slice(0, i) : w, n = cnt(w, i);
    if (!n) continue;
    const s = raw === '*' ? null : sol(raw), isSol = raw !== '*' && (/^mp\//i.test(raw) || !!(s && s.kind === 'soldier'));
    if (isSol) { const o = { kind: 'soldier', id: s ? s.id : raw, name: (s && s.name) || tailOf(raw), n }; if (deep && last) last.crew.push(o); else parts.push(o); continue; }
    if (deep) continue;   // a vehicle named inside ( ): not a form the game data uses
    const id = raw === '*' ? (u.vehicle || String(u.id).replace(/\(.*$/, '')) : raw, c = raw === '*' ? u : veh(raw);
    for (let k = 0; k < n; k++) { last = { kind: 'vehicle', id, name: (c && c !== u && c.name) || (raw === '*' ? u.name : '') || id, n: 1, crew: [] }; parts.push(last); }
  }
  // the same vehicle with the same crew is one line with a count; the same soldier is one line
  const merged = [], sig = p => p.kind + '|' + lc(p.id) + '|' + (p.crew || []).map(c => lc(c.id) + ':' + c.n).join(',');
  for (const p of parts) { const m = merged.find(x => sig(x) === sig(p)); if (m) m.n += p.n; else merged.push(p); }
  for (const p of merged) if (p.crew) { const cm = []; for (const c of p.crew) { const m = cm.find(x => lc(x.id) === lc(c.id)); if (m) m.n += c.n; else cm.push({ id: c.id, name: c.name, n: c.n }); } p.crew = cm; }
  merged.sort((a, b) => (a.kind === 'vehicle' ? 0 : 1) - (b.kind === 'vehicle' ? 0 : 1));
  const out = { parts: merged.map(p => p.kind === 'vehicle' ? { kind: p.kind, id: p.id, name: p.name, n: p.n, crew: p.crew } : { kind: p.kind, id: p.id, name: p.name, n: p.n }),
    vehicles: merged.reduce((t, p) => t + (p.kind === 'vehicle' ? p.n : 0), 0), men: merged.reduce((t, p) => t + (p.kind === 'vehicle' ? p.n * p.crew.reduce((a, c) => a + c.n, 0) : p.n), 0) };
  BRINGS.set(u, out); return out;
}
// cur given: a group buy also carries what it brings
function brief(u, cur) {
  const o = { id: u.id, name: u.name || '', army: u.army, kind: u.kind, cost: u.cost, res: u.buyable ? u.res || 'mp' : null, level: u.level, armor: armourLine(u), buyable: !!u.buyable, mod: !!(u.cardMod || u.defMod) };
  if (u.period) o.period = u.period;   // GoH
  if (u.card) o.card = u.card;         // GoH: which period copy (unitOf)
  if (manyOf(u)) { o.many = 1; if (cur) o.brings = bringsOf(cur, u); }
  return o;
}
// GT-12: common names. "Panzer IV H" / "Panzer 4 H" find "PzKpfw IV Ausf.H": words are folded to one spelling (armour = armor,
// panzer = pzkpfw = pz, "Ausf." dropped, 1..10 = I..X) on both sides before the plain rules run a second time
const SPELL = [[/armour/g, 'armor'], [/colour/g, 'color'], [/calibre/g, 'caliber'], [/ü/g, 'u']];
const fold = s => SPELL.reduce((t, r) => t.replace(r[0], r[1]), lc(s));
const ALIAS = { panzerkampfwagen: 'pz', panzer: 'pz', pzkpfw: 'pz', pzkw: 'pz', pzkfw: 'pz', kpfw: 'pz', ausf: '', ausfuhrung: '' };
const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const cwords = s => fold(s).split(/[^a-z0-9Ѐ-ӿ一-鿿]+/).filter(Boolean).map(w => w in ALIAS ? ALIAS[w] : /^([1-9]|10)$/.test(w) ? ROMAN[+w] : w).filter(Boolean);
const canon = s => cwords(s).join('');
// the search words of every unit, worked out once per catalogue (they were made again for each unit on every request: 50 to 120 ms
// a search on a 5,700 unit GoH mod)
function sxOf(cat) {
  if (cat._sx && cat._sx.n === cat.units.length) return cat._sx;
  const a = cat.units.map(u => { const fn = fold(u.name);
    return { nid: norm(u.id), nn: norm(fn), cn: canon(u.name), cnw: cwords(u.name), fw: fn.split(/[^a-z0-9Ѐ-ӿ]+/).filter(Boolean).map(norm), hay: fn + ' ' + lc(u.id) + ' ' + lc(u.army), la: lc(u.army),
      toks: [norm(u.id)].concat(lc(u.name).split(/[\s/()-]+/).map(norm)).filter(t => t.length > 1) }; });
  a.n = cat.units.length; a.armies = [...new Set(cat.units.filter(u => u.buyable).map(u => u.army))].sort();
  return (cat._sx = a);
}
function search(cat, q, o) {
  const nq = norm(fold(q)), words = fold(q).split(/[\s,]+/).filter(Boolean), cq = canon(q), cw = cwords(q), SX = sxOf(cat), la = o.army ? lc(o.army) : '';
  const pool = [];
  cat.units.forEach((u, i) => { if ((o.all || u.buyable) && (!o.kind || u.kind === o.kind) && (!la || SX[i].la === la)) pool.push(i); });
  const scored = [];
  for (const i of pool) {
    const u = cat.units[i], x = SX[i], nid = x.nid, nn = x.nn, cn = x.cn, cnw = x.cnw;
    let s = 0;
    if (!nq) s = 1;
    else if (nid === nq || nn === nq) s = 100;
    else if (cq && cn === cq) s = 95;
    else if (nid.startsWith(nq)) s = 80;
    else if (cq && cn.startsWith(cq)) s = 75;
    else if (x.fw.some(w => w.startsWith(nq))) s = 70;
    else if (cw.length > 1 && cw.every(w => cnw.some(x => x === w || (w.length > 1 && x.startsWith(w))))) s = 60;
    else if (nn.includes(nq) || nid.includes(nq)) s = 50;
    else if (cq && cn.includes(cq)) s = 45;
    else if (words.length > 1 && words.every(w => x.hay.includes(w))) s = 40;
    if (s) scored.push({ s, u });
  }
  scored.sort((a, b) => b.s - a.s || (a.u.army > b.u.army ? 1 : a.u.army < b.u.army ? -1 : 0) || (a.u.cost || 0) - (b.u.cost || 0));
  const res = { q, total: scored.length, results: scored.slice(0, o.limit || 60).map(x => brief(x.u, cat)), didYouMean: [],
    armies: SX.armies.slice() };
  if (nq && scored.length < 3) {
    const cand = new Map();
    for (const i of pool) {
      const u = cat.units[i], toks = SX[i].toks;
      let best = 9; for (const t of toks) best = Math.min(best, lev(nq, t), t.length > nq.length ? lev(nq, t.slice(0, nq.length)) + 1 : 9);
      const lim = Math.max(1, Math.floor(nq.length / 3));
      if (best <= lim) { const k = u.name || u.id; if (!cand.has(k) || cand.get(k).d > best) cand.set(k, { d: best, id: u.id, name: u.name || u.id }); }
    }
    res.didYouMean = [...cand.values()].sort((a, b) => a.d - b.d).slice(0, 6).map(x => ({ id: x.id, name: x.name }));
  }
  return res;
}

// ---------- stats in plain words ----------
function unlockOf(u) {
  // wait at the start = cooldown x factor x (1 - head start), never below 0; after a buy = cooldown x factor (tools/balance/lib waitOf)
  const c = u.charge == null ? null : u.charge, k = u.factor == null ? 1 : u.factor;
  return { charge: c, fore: u.fore, level: u.level, factor: k, res: u.res || 'mp', startWait: require('../../../balance/lib').waitOf(c, u.fore, k), afterBuy: c == null ? null : Math.round(c * k * 10) / 10 };
}
// GT-13: the main gun in the same numbers the Balance page shows (tools/balance/lib.js rows): penetration at 100 m, damage, reload.
// The catalogue has them only for guns its weapon table reads; a gun that inherits its file ({from ..}, names like
// 75mm_kwk40(L48)) is read through the gun file chain (gen gunFacts), the same fallback Balance uses.
const num = v => v == null || v === '' || !isFinite(+v) ? null : +v;
const penAt = (s, m) => { const r = new RegExp('(?:^|\\s)' + m + 'm:([\\d.]+)').exec(String(s || '')); return r ? +r[1] : null; };
function gunLine(g, facts) {
  if (!g || !g.weapon) return null;
  const range = g.range ? String(g.range) : null;
  const out = { weapon: g.weapon, place: g.place, range, damage: num(g.damage), pen: penAt(g.pen, 100), reload: num(g.recharge) };
  if (out.damage == null || out.pen == null || out.reload == null) {
    let x = null; try { x = facts ? facts(g.weapon) : null; } catch (e) { x = null; }
    if (x && x.found) {
      if (out.damage == null) out.damage = num(x.damage);
      if (out.pen == null && x.pen) out.pen = num(x.pen[3]);
      if (out.reload == null) out.reload = num(x.recharge);
    }
  }
  return out;
}
function gunFactsOf(cat, game, mod, tmpRoot) {
  // one read-only view of game + mod per catalogue (building it reads the whole game index, so it is kept with the catalogue)
  if (!cat._gun) {
    const memo = new Map(); let pctx = null;
    cat._gun = n => {
      const k = lc(n); if (memo.has(k)) return memo.get(k);
      if (!pctx) pctx = newCtx(game, mod || path.join(tmpRoot || os.tmpdir(), 'units-none'), true, cat._gid);
      const f = gen().ops.gunFacts(pctx, n); memo.set(k, f); return f;
    };
  }
  return cat._gun;
}
// the vanilla card of a catalogue card: GoH pairs the same id, card file and period (vanCard), else the id
const vanOf = (van, u) => (u.card && van.byCard && van.byCard.get(u.card)) || van.byId.get(lc(u.id)) || null;
function stats(cur, van, id, facts, card) {
  const u = unitOf(cur, id, card), v = vanOf(van, u);
  const out = Object.assign({}, u, { unlock: unlockOf(u), armor: armourLine(u), vanilla: v ? { cost: v.cost, res: v.res || 'mp', level: v.level, charge: v.charge, fore: v.fore, name: v.name, armor: armourLine(v), armorMacro: v.armorMacro } : null, isNew: !v });
  if (manyOf(u)) { out.many = 1; out.brings = bringsOf(cur, u); }
  out.gun = gunLine(u.gun, facts);
  out.where = whereInGame(u);
  return out;
}
function whereInGame(u) {
  if (!u.buyable) return { panel: false };
  return { panel: true, army: u.army, button: u.button, group: u.group, rank: u.level, tooltip: u.nameKey };
}

// ---------- gen ops in-process ----------
// gid: the game (as64 | mowas2 | goh, or a vfs exe); none given: goh for a GoH install folder, else as64 (as before).
// Ctx target = the game id (gen: mowas2 builds the vfs with exe mowas_2; goh = the GoH install as root, GoH card and period forms)
function newCtx(game, mod, plan, gid) {
  const { Ctx } = gen();
  const id = (gid && games().idOf(gid)) || (isGohDir(game) ? 'goh' : 'as64');
  const ctx = id === 'goh' ? new Ctx({ target: 'goh', goh: game, out: mod, plan, deps: [] }) : new Ctx({ target: id, game, out: mod, plan, deps: [] });
  return ctx;
}
function findings(ctx) {
  const j = ctx.rep.toJSON({ tool: 'gen' });
  const errs = j.findings.filter(f => !/^WARN_/.test(f.code)), warns = j.findings.filter(f => /^WARN_/.test(f.code));
  return { errors: errs.map(f => ({ code: f.code, msg: plainMsg(f), raw: f.msg })), warnings: warns.map(f => ({ code: f.code, msg: plainMsg(f), raw: f.msg })), info: j.info.map(f => ({ code: f.code, msg: f.msg })) };
}
const PLAIN = {
  GEN_FIELD_UNKNOWN: 'This unit\'s card line does not have that field, so it cannot be changed here.',
  GEN_ROSTER_LIKE_MISSING: 'The unit you copy has no card in that army\'s list. Pick a unit of the same army.',
  GEN_ROSTER_EXISTS: 'A card with that new id already exists in that army. Pick another id.',
  GEN_ARMOR_NO_MACRO: 'This unit has no short armour line; its armour is set per part.',
  GEN_ARMOR_ARGC: 'Give the same count of numbers the armour part already has.',
  GEN_ARMOR_ARG_MISSING: 'That armour part was not found on this unit.',
  GEN_CLONE_ARGS: 'The copy needs an existing unit and a new id.',
  GEN_SET_ENTITY_UNKNOWN: 'The game file for this unit was not found.',
  GEN_SQUAD_LIKE_MISSING: 'The squad you copy was not found for that army.',
  GEN_SQUAD_EXISTS: 'A squad with that name already exists for that army.',
};
function plainMsg(f) { return PLAIN[f.code] ? PLAIN[f.code] + ' (' + f.msg + ')' : f.msg; }
function oldBytes(ctx, key) {
  const { vfs } = gen();
  if (ctx.scanDisk().has(key)) return fs.readFileSync(ctx.disk(key));
  try { const r = ctx.vfs().files.get(key); return r ? vfs.readRec(r) : null; } catch (e) { return null; }
}
function diffs(ctx) {
  const { patch } = gen(), out = [];
  for (const [k, b] of ctx.dirty) {
    const o = oldBytes(ctx, k), inMod = ctx.scanDisk().has(k);
    const lines = patch.lineDiff(o ? o.toString('latin1') : '', b.toString('latin1'));
    out.push({ file: k, inMod, isNew: !o, copiedFromGame: !inMod && !!o, lines: lines.slice(0, 40).map(l => Buffer.from(l, 'latin1').toString('utf8')), more: Math.max(0, lines.length - 40) });
  }
  return out;
}
// GoH squads a macro builds (915 of 983 buyable squads on the real install): the catalogue's card file is the define in
// settings.set ({"%name(%side)" ..}); the card itself is the call line ("single_with1type" side(ger) name(single_rifle)
// period(early) cd(0) ci(3) .. c1(rifleman_1:1) ..) in units/<period>/units_<army>.set [I: real lists]. Its price is the members'
// cost x scf (GHGPL-10), so it has no cost(N) of its own; members cN(breed:n), unlock ci(N) are edited there. {.., call: macro}
function gohCall(ctx, u) {
  const m = /^(.*)\(([^()]+)\)$/.exec(u.id); if (!m || !u.period) return null;
  // the army's own list first; a side kept in another army's list (side(can) in units_eng.set) is found in the other lists of the period
  const dir = 'resource/set/multiplayer/units/' + lc(u.period) + '/', own = dir + 'units_' + lc(m[2]) + '.set';
  const nr = new RegExp('(?:^|[\\s(])name\\(' + reEsc(m[1]) + '\\)', 'i'), sr = new RegExp('(?:^|[\\s(])side\\(' + reEsc(m[2]) + '\\)', 'i'), pr = /(?:^|[\s(])period\(([^()]*)\)/i;
  let more = null;
  const others = () => more || (more = (() => { try { return typeof ctx.keys === 'function' ? ctx.keys(new RegExp('^' + reEsc(dir) + 'units_[^/]+\\.set$')).filter(k => k !== own).sort() : []; } catch (e) { return []; } })());
  let key = null, lines = null, eol = '\n', i = -1;
  for (let n = 0; i < 0; n++) {
    const k = n === 0 ? own : others()[n - 1]; if (!k) return null;
    const b = ctx.read(k); if (!b) continue;
    const s = b.toString('latin1'), ls = s.split(/\r?\n/);
    const at = ls.findIndex(l => !/^\s*;/.test(l) && nr.test(l) && sr.test(l) && (!pr.test(l) || lc(pr.exec(l)[1].trim()) === lc(u.period)));
    if (at >= 0) { key = k; lines = ls; eol = s.includes('\r\n') ? '\r\n' : '\n'; i = at; }
  }
  let d = 0, j = i;
  for (; j < lines.length; j++) { const t = lines[j].replace(/"[^"]*"/g, '').replace(/;.*$/, ''); for (const ch of t) { if (ch === '(') d++; else if (ch === ')') d--; } if (d <= 0) break; }
  return { key, lines, eol, i, j, text: lines.slice(i, j + 1).join('\n'), call: (/^\s*\(\s*"([^"]+)"/.exec(lines[i]) || [])[1] || '?' };
}
// card block of a unit in its units file (ctx view): {key, lines, eol, i, j, text}; noCall: the GoH block only (no call-line search)
function cardBlock(ctx, u, noCall) {
  const key = lc(u.cardFile || ''); if (!key) return ctx.goh && !noCall ? gohCall(ctx, u) : null;
  const b = ctx.read(key); if (!b) return ctx.goh && !noCall ? gohCall(ctx, u) : null;
  const s = b.toString('latin1'), eol = s.includes('\r\n') ? '\r\n' : '\n', lines = s.split(/\r?\n/);
  if (ctx.goh) {
    // GoH: every card (vehicle, squad, soldier) is a {"<id>" ..} block; the id may end the line
    const re = new RegExp('^\\s*\\{\\s*"' + reEsc(u.id) + '"(\\s|\\(|$)', 'i');
    const i = lines.findIndex(l => re.test(l)); if (i < 0) return noCall ? null : gohCall(ctx, u);
    let d = 0, j = i;
    for (; j < lines.length; j++) { const t = lines[j].replace(/"[^"]*"/g, '').replace(/;.*$/, ''); for (const ch of t) { if (ch === '{' || ch === '(') d++; else if (ch === '}' || ch === ')') d--; } if (d <= 0) break; }
    return { key, lines, eol, i, j, text: lines.slice(i, j + 1).join('\n') };
  }
  if (u.kind === 'squad') {
    const m = /^(.*)\(([^)]+)\)\s*$/.exec(u.id); if (!m) return null;
    const re = new RegExp('\\bname\\(' + reEsc(m[1]) + '\\)', 'i'), sr = new RegExp('\\bside\\(' + reEsc(m[2]) + '\\)', 'i');
    const i = lines.findIndex(l => re.test(l) && sr.test(l) && !/^\s*;/.test(l));
    return i < 0 ? null : { key, lines, eol, i, j: i, text: lines[i] };
  }
  const re = new RegExp('^\\s*\\{\\s*"' + reEsc(u.id) + '"(\\s|\\()', 'i');
  const i = lines.findIndex(l => re.test(l)); if (i < 0) return null;
  let d = 0, j = i;
  for (; j < lines.length; j++) { const t = lines[j].replace(/"[^"]*"/g, '').replace(/;.*$/, ''); for (const ch of t) { if (ch === '{' || ch === '(') d++; else if (ch === '}' || ch === ')') d--; } if (d <= 0) break; }
  return { key, lines, eol, i, j, text: lines.slice(i, j + 1).join('\n') };
}
const FIELD_KEYS = { cost: ['cost'], level: ['level'], fore: ['fore', 'f'], charge: ['c', 'charge'] };
function hasField(text, k) { return new RegExp('\\{\\s*' + reEsc(k) + '\\s+', 'i').test(text) || new RegExp('(?:^|[\\s(])' + reEsc(k) + '\\(', 'i').test(text); }
function setField(text, k, v) {
  const a = new RegExp('(\\{\\s*' + reEsc(k) + '\\s+)[^{}]*(\\})', 'i'), b = new RegExp('((?:^|[\\s(])' + reEsc(k) + '\\()[^()]*(\\))', 'i');
  if (a.test(text)) return text.replace(a, (m, p, q) => p + v + q);
  if (b.test(text)) return text.replace(b, (m, p, q) => p + v + q);
  return null;
}
function fieldOf(text, k) {
  const a = new RegExp('\\{\\s*' + reEsc(k) + '\\s+([^{}]*)\\}', 'i').exec(text) || new RegExp('(?:^|[\\s(])' + reEsc(k) + '\\(([^()]*)\\)', 'i').exec(text);
  return a ? a[1].trim() : null;
}
// edit one card's price fields (vehicle {k v}/k(v) card or squad line) on the ctx; returns rows [{what, old, new}]
// GoH card fields [I: names from the vanilla lines, gameplay/goh-unit-card-cost]: price = cost(N); unlock = ci(N) (the cooldown
// argument of the vehicle macros, cd = start delay), cool(N) on doctrine cards. level and fore are not read by GoH (GHMIS-85)
const GOH_KEYS = { cost: ['cost'], charge: ['ci', 'cool'] };
function editGohCard(ctx, u, fields, c) {
  const rows = [];
  let t = c.text;
  for (const [k, v] of Object.entries(fields)) {
    const mm = /^member:(.+)$/.exec(k);
    if (mm) {
      const re = new RegExp('(\\b(?:c\\d+|crew\\w*)\\(' + reEsc(tailOf(mm[1])) + ':)(\\d+)(\\))', 'i'), m = re.exec(t);
      if (!m) { ctx.err('UNITS_NO_MEMBER', `card ${u.id} has no member "${tailOf(mm[1])}" with a count`, u.id); continue; }
      rows.push({ field: k, old: m[2], new: String(v) }); t = t.replace(re, (x, a, b, d) => a + v + d); continue;
    }
    const kk = (GOH_KEYS[k] || []).find(x => hasField(t, x));
    if (!kk && c.call && k === 'cost') { ctx.err('UNITS_GOH_COST_FROM_MEMBERS', `${u.id} is built by the macro "${c.call}" in ${c.key}: its price is every member's cost x squad_cost_factor scf(..) (GHGPL-10), there is no cost(..) to change; change the member count or the members' own cost`, u.id); continue; }
    if (!kk) { ctx.err('GEN_FIELD_UNKNOWN', `the GoH card of ${u.id} has no ${(GOH_KEYS[k] || [k]).join(' or ')}(..) field`, u.id); continue; }
    rows.push({ field: k, old: fieldOf(t, kk), new: String(v) }); t = setField(t, kk, v);
  }
  if (t !== c.text) { const lines = c.lines.slice(); lines.splice(c.i, c.j - c.i + 1, ...t.split('\n')); ctx.write(c.key, lines.join(c.eol)); }
  return rows;
}
function editCard(ctx, u, fields) {
  const rows = [];
  const c = cardBlock(ctx, u);
  if (!c) { ctx.err('UNITS_NO_CARD', `no card line for ${u.id} in ${u.cardFile}` + (ctx.goh && u.period ? ` or units/${u.period}/units_${u.army}.set` : ''), u.id); return rows; }
  if (ctx.goh) return editGohCard(ctx, u, fields, c);
  if (u.kind !== 'squad') {
    // gen card op for vehicles (it also checks the file is loaded); field names picked from what the line carries
    const f2 = {};
    for (const [k, v] of Object.entries(fields)) {
      const kk = (FIELD_KEYS[k] || [k]).find(x => hasField(c.text, x));
      if (!kk) { ctx.err('GEN_FIELD_UNKNOWN', `card has no field "${k}"`, 'card ' + u.id); continue; }
      f2[kk] = v; rows.push({ field: k, old: fieldOf(c.text, kk), new: String(v) });
    }
    // the army gen's op looks in: the card's own list vehicles_<x>.set when its name is not the side (pz3m_ger2: s(ger) in
    // vehicles_ger2.set -> ger2, as balance/apply.js listArmy); vehicles_x*.set and other lists keep the side
    const lm = /\/vehicles_([a-z0-9_]+)\.set$/.exec(lc(u.cardFile || ''));
    const army = lm && lm[1] !== lc(u.army) && !/^x/.test(lm[1]) ? lm[1] : u.army;
    if (Object.keys(f2).length) gen().ops.opCard(ctx, { op: 'card', unit: u.id, army, fields: f2 });
    return rows;
  }
  let t = c.text;
  for (const [k, v] of Object.entries(fields)) {
    let kk = k === 'charge' ? 'c' : k === 'fore' ? 'f' : k;
    const mm = /^member:(.+)$/.exec(k);
    if (mm) {
      const re = new RegExp('(\\bc\\d\\(' + reEsc(mm[1]) + ':)(\\d+)(\\))', 'i'), m = re.exec(t);
      if (!m) { ctx.err('UNITS_NO_MEMBER', `squad ${u.id} has no member "${mm[1]}" with a count`, u.id); continue; }
      rows.push({ field: k, old: m[2], new: String(v) }); t = t.replace(re, (x, a, b, d) => a + v + d); continue;
    }
    const old = fieldOf(t, kk), nt = old == null ? null : setField(t, kk, v);
    if (nt == null) { ctx.err('GEN_FIELD_UNKNOWN', `squad line has no ${kk}(..) field`, u.id); continue; }
    rows.push({ field: k, old, new: String(v) }); t = nt;
  }
  if (t !== c.text) { const lines = c.lines.slice(); lines[c.i] = t; ctx.write(c.key, lines.join(c.eol)); }
  return rows;
}

// ---------- names (.lng) ----------
function modSlug(mod) { return path.basename(mod).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'mod'; }
function namePlan(mod, u, key, text) {
  // a key vanilla desc.lng defines must go into a mod copy of desc.lng (vanilla beats a '#' file, LOC-19); new keys into #<mod>.lng
  // a key that already lives in some .lng goes into the mod copy of that same file (vanilla bytes copied first when the mod has none)
  const vf = u && u.nameFile && /\.lng$/i.test(u.nameFile) ? u.nameFile.split('/').pop() : null;
  return { key, text, file: vf || ('#' + modSlug(mod) + '.lng'), copyVanilla: !!vf && !fs.existsSync(path.join(mod, 'localization', vf)), vanillaKey: u ? u.nameFile : null };
}
// GoH: texts are gettext .pot under localizations/<lang>/interface/text/, msgctxt = the key (GHLOC-01 [V]); the default language
// folder is the fallback every language reads. One file per mod, LF like the vanilla .pot, same writer as gen (upgrade/lib/lngpot)
const GOH_TEXT = 'localizations/default/interface/text/';
function gohNamePlan(mod, key, text) { return { key, text, file: GOH_TEXT + modSlug(mod) + '.pot', pot: true, copyVanilla: false, vanillaKey: null }; }
// a true merge (lngpot.potMerge: header, comments, msgstr, other keys and line endings kept), guarded, with a restore point (restored: ids)
function writeGohName(mod, np, game, restored) {
  const P = require('../../../upgrade/lib/lngpot'), MW = require('../../../lib/modwrite'), f = path.join(mod, np.file);
  let old = null;
  try { if (fs.existsSync(f)) old = fs.readFileSync(f); } catch (e) { return { ok: false, msg: 'the text file ' + np.file + ' could not be read' }; }
  const mg = P.potMerge(old, [[np.key, String(np.text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')]], modSlug(mod));
  if (old && mg.buf.equals(old)) return { ok: true, file: np.file };
  const gopt = game ? { game } : {};
  try { MW.guardFile(mod, f, gopt); const ids = MW.restorePoints(mod, [np.file], 'units-goh-name', gopt); if (restored) restored.push(...ids); }
  catch (e) { return { ok: false, msg: e.message }; }
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, mg.buf);
  return { ok: true, file: np.file };
}
function writeName(ctx, game, mod, np) {
  if (np.pot) return writeGohName(mod, np, ctx.root, ctx.restored);
  const { lngAdd } = gen();
  if (np.copyVanilla) {
    const b = np.vanillaKey ? oldBytes(ctx, lc(np.vanillaKey)) : null;
    if (b) { const dst = path.join(mod, 'localization', np.file); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, b); }
  }
  const r = lngAdd.run({ dir: mod, file: np.file, key: np.key, text: np.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'), game, force: true });
  const j = r.rep.toJSON({ tool: 'lng-add' });
  if (r.fail) return { ok: false, msg: (j.findings[0] && j.findings[0].msg) || 'the name could not be written' };
  fs.mkdirSync(path.dirname(r.abs), { recursive: true }); fs.writeFileSync(r.abs, r.newBuf);
  return { ok: true, file: path.relative(mod, r.abs).replace(/\\/g, '/') };
}

// ---------- change wizard ----------
const NUM = { cost: { min: 0, max: 100000, int: false }, level: { min: 0, max: 100, int: true }, charge: { min: 0, max: 36000, int: true }, fore: { min: 0, max: 1, int: false } };
function numVal(field, v) {
  const s = String(v == null ? '' : v).trim().replace(',', '.'), n = Number(s), r = NUM[field];
  if (!s || !isFinite(n)) bad('Type a number.');
  if (n < r.min || n > r.max) bad(`The number must be between ${r.min} and ${r.max}.`);
  if (r.int && !Number.isInteger(n)) bad('This field takes a whole number (the game crashes on 3.0 or 3.5 here).');
  return r.int ? String(n) : (Number.isInteger(n) && field === 'cost' ? String(n) : String(n).includes('.') ? String(n) : n.toFixed(1));
}
function armorJob(u, part, value) {
  const vals = String(value || '').trim().split(/[\s,;/]+/).filter(Boolean);
  if (!vals.length || vals.some(x => x !== '_' && !(isFinite(+x) && +x >= 0 && +x <= 2000))) bad('Type armour as numbers in millimetres: front side rear top (for example 80 60 40 20). Use _ to keep one.');
  const macros = u.armorMacro || [];
  if (macros.length) {
    let hit = null;
    for (const m of macros) for (const p of m.parts) if (!part || lc(m.macro + '/' + p.name) === lc(part) || (lc(p.name) === lc(part) && !hit)) hit = hit || { m, p };
    if (!hit) bad('Pick which armour part to change.');
    if (vals.length !== hit.p.values.length) bad(`The part "${hit.p.name}" has ${hit.p.values.length} number(s) (now ${hit.p.values.join(' ')}). Type exactly ${hit.p.values.length}.`);
    const nv = vals.map((x, i) => x === '_' ? hit.p.values[i] : +x);
    return { form: 'macro', macro: hit.m.macro, part: hit.p.name, old: hit.p.values.join(' '), new: nv.join(' '),
      op: { op: 'armor', entity: u.id, macro: hit.m.macro, value: hit.p.name === 'args' ? nv.join(' ') : hit.p.name + ' ' + nv.join(' ') } };
  }
  if (u.armorVolumes && u.armorVolumes.length) {
    const vi = u.armorVolumes.findIndex(v => lc(v.name) === lc(part));
    if (vi < 0) bad('Pick which armour part (volume) to change.');
    if (vals.length !== 1 || vals[0] === '_') bad('This unit sets armour per part as one number (mm). Type one number.');
    const v = u.armorVolumes[vi];
    return { form: 'volume', part: v.name, old: String(v.front), new: vals[0], volumeIndex: vi };
  }
  bad('This unit\'s armour is written in a form this page cannot change yet. Open its file in a text editor.');
}
function volumeRow(ctx, u, job) {
  // patch-entity path game_entity/volume[n]/thickness: n = index among the def's own {volume ..} blocks (raw text)
  const b = ctx.read(lc(u.def)); if (!b) return null;
  const t = b.toString('latin1'), root = (/^\s*\{\s*([A-Za-z_]\w*)/m.exec(t.replace(/^\s*;.*$/gm, '')) || [])[1] || 'game_entity';
  const re = /\{\s*volume\s+"([^"]+)"/gi; let m, n = 0, idx = -1;
  while ((m = re.exec(t))) { if (lc(m[1]) === lc(job.part)) { idx = n; break; } n++; }
  if (idx < 0) return null;
  return { entity: u.id, path: `${root}/volume[${idx}]/thickness`, value: job.new, op: 'add' };
}
async function change(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, true), gid = gidOf(ctx0, body, game);
  guardWrite(gid, game, mod, body);
  const { cur } = await both(ctx0, game, mod);
  const u = unitOf(cur, body.id, body.card), field = String(body.field || '');
  if (gid === 'goh' && (field === 'level' || field === 'fore')) notIn(gid, 'the game reads neither the rank lock nor the head start of a card', 'GHMIS-85');
  if (gid === 'goh' && field === 'armor') return require('./goharmour').change({ game, mod, u, body, where: whereInGame(u) });   // GoH part armour and top speed
  const ctx = newCtx(game, mod, !body.write, gid), rows = [], names = [];
  let job = null;
  if (['cost', 'level', 'charge', 'fore'].includes(field)) {
    if (!u.buyable) bad('This unit has no price card, so it is not in the buy panel.');
    rows.push(...editCard(ctx, u, { [field]: numVal(field, body.value) }));
    if (ctx.goh && field === 'cost' && u.members && u.members.length) ctx.info('UNITS_GOH_OWN_COST', `GoH: this changes the card's own cost(N); the buy price adds every member's cost x squad_cost_factor (GHGPL-10), now ${u.cost}`, u.id);
  } else if (field === 'name') {
    const text = String(body.value || '').trim();
    if (!text || text.length > 80) bad('Type a name of 1 to 80 characters.');
    const np = gid === 'goh' ? gohNamePlan(mod, u.nameKey || 'desc/entity/' + lc(u.id), text) : namePlan(mod, u, u.nameKey, text); names.push(np);
    rows.push({ field: 'name', old: u.name || '(none)', new: text });
  } else if (field === 'armor') {
    if (u.kind !== 'vehicle' || !u.def) bad('Only vehicles and guns have armour.');
    job = armorJob(u, body.part, body.value);
    if (job.form === 'macro') gen().ops.opArmor(ctx, job.op);
    else { const r = volumeRow(ctx, u, job); if (!r) bad('The armour part was not found in the unit file (it may come from a shared file).'); gen().ops.opSet(ctx, { op: 'set', rows: [r] }, ctx.out); }
    rows.push({ field: 'armor', part: job.part, old: job.old, new: job.new });
  } else bad('Pick what to change: price, name, armour, unlock time, rank or head start.');
  return finish(ctx, game, mod, body, { unit: brief(u), rows, names, job, where: whereInGame(u) });
}
// shared tail: findings, diff, then (write) flush + names
function finish(ctx, game, mod, body, res) {
  const f = findings(ctx);
  res.errors = f.errors; res.warnings = f.warnings; res.info = f.info.slice(0, 20);
  res.files = diffs(ctx);
  res.names = (res.names || []).map(n => Object.assign({}, n));
  // names the gen ops queued (squad name/info copied from the template squad); an explicit name from the page wins
  for (const t of ctx.texts || []) if (!res.names.some(n => lc(n.key) === lc(t.key))) res.names.push(ctx.goh ? gohNamePlan(mod, t.key, t.text) : namePlan(mod, null, t.key, t.text));
  res.written = false;
  res.hasModInfo = fs.existsSync(path.join(mod, 'mod.info'));
  if (!body.write || f.errors.length) return res;
  if (ctx.goh) guardWrite('goh', ctx.root, mod, body);   // the routes check first; this keeps every caller (Balance) behind the guard
  // GoH: a restore point of every file before it is written (Files page form, lib/modwrite: <mod>/.arsenal/undo for a mod in the game's
  // mods folder). AS2/AS64 keep their path as it was (no restore point there either; noted
  if (ctx.goh) ctx.restoreAction = ctx.restoreAction || 'units-goh';
  try { ctx.flush(); }
  catch (e) { if (e.code !== 'MOD_WRITE_OUTSIDE') throw e; res.errors.push({ code: 'UNITS_WRITE_REFUSED', msg: e.message }); return res; }
  for (const n of res.names) { const r = writeName(ctx, game, mod, n); n.result = r; if (!r.ok) res.errors.push({ code: 'UNITS_NAME', msg: 'The name was not written: ' + r.msg }); }
  if (ctx.goh) { res.restore = ctx.restored.slice(); res.undo = require('../../../lib/modwrite').restoreRoot(mod); }
  res.written = true;
  MEM.clear(); forgetSig(mod);
  return res;
}

// ---------- bots for a copied vehicle ----------
const BOTKEY = 'resource/script/multiplayer/bot.data.lua';
function vehicleBots(ctx, like, id, army) {
  const b = ctx.read(BOTKEY);
  if (!b) { ctx.err('WARN_GEN_BOTS_LIKE_ABSENT', 'no ' + BOTKEY + ' in the game data; bots will not buy ' + id, id); return; }
  const s = b.toString('latin1'), eol = s.includes('\r\n') ? '\r\n' : '\n', lines = s.split(/\r?\n/), out = [];
  const re = new RegExp('(\\bunit\\s*=\\s*")' + reEsc(like) + '(\\(' + reEsc(army) + '\\))?(")', 'i');
  let cur = null, n = 0;
  for (const l of lines) {
    const a = /^\s*\[\s*"([^"]+)"\s*\]\s*=/.exec(l); if (a) cur = a[1];
    const m = re.exec(l);
    if (!m || /^\s*--/.test(l) || (!m[2] && lc(cur) !== lc(army))) { out.push(l); continue; }
    const nl = l.replace(re, (x, p, ar, q) => p + id + (ar || '') + q);
    if (/\}\s*$/.test(l.replace(/--.*$/, ''))) { out.push(l.replace(/\}(\s*)(--.*)?$/, (x, w, c) => '},' + w + (c || ''))); out.push(nl); }
    else out.push(l, nl);
    n++;
  }
  if (!n) { ctx.err('WARN_GEN_BOTS_LIKE_ABSENT', 'bots: no "' + like + '" row for ' + army + ' in ' + BOTKEY + '; bots do not buy ' + like + ' either, so ' + id + ' was not added', id); return; }
  if (!ctx.inMod(BOTKEY)) ctx.info('GEN_ROSTER_REPLACES', BOTKEY + ': the mod copy replaces the whole game file (other mods\' bot edits are shadowed)', BOTKEY);
  ctx.write(BOTKEY, out.join(eol));
}

// ---------- add a unit ----------
async function add(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, true), gid = gidOf(ctx0, body, game);
  guardWrite(gid, game, mod, body);
  const { cur } = await both(ctx0, game, mod);
  const like = unitOf(cur, body.like, body.card), id = String(body.id || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(id)) bad('The new id must be lower-case letters, digits and _ only, starting with a letter (for example t34_custom).');
  if (/_x+$/.test(id)) bad('Do not end the new id with _x: that name is kept for the wreck.');
  if (cur.byId.has(id) || cur.byId.has(id + '(' + lc(like.army) + ')')) bad('A unit with the id "' + id + '" already exists. Pick another id.');
  if (!like.buyable) bad('Pick a unit that is in the buy panel to copy.');
  const name = String(body.name || '').trim();
  const price = body.price === '' || body.price == null ? null : numVal('cost', body.price);
  const ctx = newCtx(game, mod, !body.write, gid), rows = [], names = [], notes = [];
  if (gid === 'goh') return gohBots(ctx0, game, mod, body, like, gohAdd(ctx, game, mod, body, cur, like, id, name, price));
  const O = gen().ops;
  let newUnit;
  // bots: AS2 bots buy only what bot.data.lua lists (C05). gen's bots key copies every row of the copied unit in that army.
  const brow = (like.bots || []).find(b => lc(b.army) === lc(like.army));
  const botSpec = body.bots ? (brow && brow.priority != null ? String(brow.priority) : true) : undefined;
  if (like.kind === 'vehicle') {
    O.opClone(ctx, { op: 'clone', entity: like.id, as: id });
    if (body.wreck !== false && like.wreck) {
      O.opClone(ctx, { op: 'clone', entity: like.id + '_x', as: id + '_x' });
      notes.push('wreck');
      // gen's FIX-PORT: the _x wreck goes on to _xx by name
      try { if (ctx.keys(new RegExp('/' + reEsc(lc(like.id)) + '_xx\\.def$')).length) O.opClone(ctx, { op: 'clone', entity: like.id + '_xx', as: id + '_xx' }); } catch (e) { /* no vfs */ }
    } else if (like.wreck) notes.push('nowreck');
    const fields = {}; if (price != null) fields.cost = price;
    // vehicle rows in bot.data.lua are unit = "t34_0" inside the ["rus"] block (no "(army)"), which gen's bots key does not match: copy them here
    O.opRoster(ctx, { op: 'roster', unit: id, like: like.id, army: like.army, fields, bots: botSpec === undefined ? undefined : false });
    if (botSpec !== undefined) vehicleBots(ctx, like.id, id, like.army);
    newUnit = { id, kind: 'vehicle', army: like.army };
    if (name) names.push(namePlan(mod, null, 'desc/entity/' + id, name));
  } else if (like.kind === 'squad') {
    const m = /^(.*)\(([^)]+)\)$/.exec(like.id);
    const fields = {}; if (price != null) fields.cost = price;
    O.opSquad(ctx, { op: 'squad', name: id, like: m[1], army: m[2], members: like.members.map(x => x.breed + ':' + x.n), fields, display: name || undefined, bots: botSpec });
    newUnit = { id: id + '(' + m[2] + ')', kind: 'squad', army: m[2] };
  } else bad('Only vehicles, guns and squads can be copied here.');
  rows.push({ field: 'id', old: like.id, new: newUnit.id }, { field: 'army', old: like.army, new: newUnit.army }, { field: 'cost', old: like.cost, new: price != null ? price : like.cost });
  if (name) rows.push({ field: 'name', old: like.name || '', new: name });
  const res = finish(ctx, game, mod, body, { unit: newUnit, like: brief(like), rows, names, notes, where: { panel: true, army: newUnit.army, button: like.button, group: like.group, rank: like.level } });
  // plain bot verdict: 'added' (rows copied), 'never' (bots do not buy the copied unit either), 'missed' (bots buy the copied unit but not this one)
  const codes = res.warnings.map(w => w.code);
  res.bots = { asked: !!body.bots, likeListed: !!brow, army: like.army, row: brow || null,
    state: body.bots ? (brow && !codes.includes('WARN_GEN_BOTS_LIKE_ABSENT') ? 'added' : 'never') : (brow ? 'missed' : 'never') };
  return res;
}

// GoH add: the copied card block goes, under the new id, into units/<period>/units_<army>.set (period = the pick, else the copied
// card's). A card that names its parts (vehicle(..), cannon(..), squads with c1(..)) buys the same parts under a new card; a card
// with none of them buys the entity of its own name, so that entity (and its _x wreck) is cloned to the new id first.
// Bots: GoH has no bot.data.lua (GHMIS-66); its purchase lists get a row through gohBots (Add and Buy). Members of another period are checked against inf_<army>.set
const GOH_PERIODS = ['early', 'mid', 'late', 'conquest'];
function hasDef(dir, name, depth) {
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return false; }
  for (const e of es) if (e.isFile() ? lc(e.name) === name : e.isDirectory() && (depth || 0) < 10 && hasDef(path.join(dir, e.name), name, (depth || 0) + 1)) return true;
  return false;
}
function gohAdd(ctx, game, mod, body, cur, like, id, name, price, opt) {
  const O = gen().ops, rows = [], names = [], notes = [], members = (opt && opt.members) || null;
  const army = lc(like.army), period = lc(body.period || like.period || '');
  if (like.kind !== 'vehicle' && like.kind !== 'squad') bad('Only vehicles, guns and squads can be copied here.');
  if (!GOH_PERIODS.includes(period)) bad('Pick the period of the new card: early, mid, late or conquest.');
  const src = cardBlock(ctx, like);
  if (!src) bad('The card of ' + like.id + ' was not found in ' + (like.cardFile || 'the unit lists') + '.');
  // a call line goes to the list that holds the copied one (side(can) lives in units_eng.set), in the picked period
  const key = src.call ? src.key.replace(/\/units\/[^/]+\/(units_[^/]+\.set)$/, (m, f) => '/units/' + period + '/' + f) : 'resource/set/multiplayer/units/' + period + '/units_' + army + '.set';
  if (!ctx.exists(key)) bad('Army ' + army + ' has no ' + period + ' list (' + key + '). Pick another period.');
  const side = /\(([^()]+)\)$/.exec(like.id), newId = side ? id + '(' + side[1] + ')' : id;
  if (cur.byId.has(lc(newId))) bad('A unit with the id "' + newId + '" already exists. Pick another id.');
  // a block card gets the new id; a macro call line (gohCall) gets name(<new id>) and keeps its side(..)
  let blk = src.call ? src.text.replace(/((?:^|[\s(])name\()[^()]*(\))/i, (m, a, b) => a + id + b) : src.text.replace(/^(\s*\{\s*")[^"]+(")/, (m, a, b) => a + newId + b);
  if (src.call && price != null) bad('A squad built by the macro "' + src.call + '" has no price of its own: the game adds up its members\' cost x squad_cost_factor (GHGPL-10). Leave the price empty.');
  if (period !== lc(like.period || '')) blk = blk.replace(/\bperiod\([^()]*\)/i, 'period(' + period + ')');
  if (price != null) { const t = setField(blk, 'cost', price); if (t == null) ctx.err('GEN_FIELD_UNKNOWN', `the GoH card of ${like.id} has no cost(..) field`, like.id); else blk = t; }
  // describe (men count): the card's member counts cN(<breed>:n), a bare <breed> = 1
  for (const m of members || []) {
    const [t, n] = String(m).split(':'), re = new RegExp('([\\s(]' + reEsc(t) + ')(?::\\d+)?(?=[\\s)])', 'i');
    if (re.test(blk)) blk = blk.replace(re, '$1:' + (+n || 1)); else ctx.err('UNITS_GOH_MEMBER_COUNT', `member ${t}: not named in the card of ${like.id}; its count was left as it is`, like.id);
  }
  // the catalogue's vehicle = first word of the card's content (statsheet gohCard); none read: no vehicle(..)/cannon(..) part named
  const ownEntity = like.kind === 'vehicle' && (like.vehicle ? lc(like.vehicle) === lc(like.id) : !/(?:^|[\s(])(vehicle\d*|cannon|v\d+)\(/i.test(blk));
  if (ownEntity) {
    O.opClone(ctx, { op: 'clone', entity: like.id, as: id });
    if (body.wreck !== false && like.wreck) { O.opClone(ctx, { op: 'clone', entity: like.id + '_x', as: id + '_x' }); notes.push('wreck'); }
    else if (like.wreck) notes.push('nowreck');
  }
  if (opt && (opt.armor || opt.speed)) require('./goharmour').onCopy(ctx, ownEntity ? id : null, opt, rows);   // describe: GoH armour / speed of the copy
  if (opt && opt.gun) require('./gohgun-copy').onCopy(ctx, ownEntity ? id : null, opt, rows);   // describe: GoH gun words on the copy
  if (period !== lc(like.period || '')) {
    const inf = ctx.readStr('resource/set/multiplayer/units/' + period + '/inf_' + army + '.set') || '';
    for (const m of like.members || []) {
      const t = tailOf(m.breed);
      if (!new RegExp('\\{\\s*"mp/' + reEsc(army) + '/' + reEsc(period) + '/' + reEsc(t) + '"', 'i').test(inf)) ctx.err('WARN_UNITS_GOH_MEMBER', `member ${t}: no "mp/${army}/${period}/${t}" soldier in units/${period}/inf_${army}.set; the card buys a soldier that this period does not declare [I]`, newId);
    }
  }
  const b = ctx.read(key), s = b.toString('latin1'), eol = s.includes('\r\n') ? '\r\n' : '\n', lines = s.split(/\r?\n/);
  const at = src.key === key ? src.j + 1 : (() => { let n = lines.length; while (n > 0 && lines[n - 1].trim() === '') n--; return n; })();
  lines.splice(at, 0, ...blk.split('\n'));
  ctx.write(key, lines.join(eol));
  if (!ctx.scanDisk().has(key)) ctx.info('GEN_ROSTER_REPLACES', key + ': the mod copy replaces the whole game file (other mods\' edits of it are shadowed)', key);
  const nk = like.nameKey ? like.nameKey.replace(new RegExp(reEsc(like.id) + '$', 'i'), newId) : (like.kind === 'squad' ? 'desc/squad/' : 'desc/entity/') + newId;
  if (name) names.push(gohNamePlan(mod, nk, name));
  const kind = like.kind === 'squad' ? 'squad' : 'vehicle';
  rows.push({ field: 'id', old: like.id, new: newId }, { field: 'army', old: like.army, new: army }, { field: 'period', old: like.period || '', new: period }, { field: 'cost', old: like.ownCost != null ? like.ownCost : like.cost, new: price != null ? price : (like.ownCost != null ? like.ownCost : like.cost) });
  if (name) rows.push({ field: 'name', old: like.name || '', new: name });
  if (members) rows.push({ field: 'members', old: (like.members || []).map(x => tailOf(x.breed) + ':' + x.n).join(' '), new: members.join(' ') });
  const res = finish(ctx, game, mod, body, { unit: { id: newId, kind, army, period }, like: brief(like), rows, names, notes, card: !ownEntity ? 'parts' : 'entity', file: key,
    where: { panel: true, army, button: like.button, group: like.group, rank: null } });
  // bots: gohBots (below) adds the purchase list row when asked; not asked = the plain "left off" line
  res.bots = { asked: !!body.bots, likeListed: false, army, row: null, state: body.bots ? 'goh' : 'gohoff' };
  // a card that buys its own entity needs <id>.def in the mod: a copy step that stopped without a word (a killed child tool)
  // would leave a card that buys a missing unit, so the write is checked on disk
  if (ownEntity && res.written && !hasDef(path.join(mod, 'resource', 'entity'), lc(id) + '.def'))
    res.errors.push({ code: 'UNITS_GOH_NO_ENTITY', msg: 'The card was written, but the copy of the unit file ' + id + '.def is not in the mod folder, so the card would buy a missing unit. Delete the new card or press Write again.' });
  return res;
}
// GoH add, bots (GHMIS-66: no bot.data.lua): a row for the new card goes into the army's purchase list of the card's period,
// script/multiplayer/units/<army>/<period>.<army>.lua, through the Bots page's GoH add-a-unit (bots/lib buyFirst -> gohAddUnit,
// botrecipe --exe goh; called, not copied). The row is a copy of the copied card's own row when that list has it (same kind and
// priority), else of the first row of the same kind. Preview = its dry run; write = after the card is written, its undo token handed
// back (POST /api/x/bots/undo puts the list back byte for byte). The list file joins res.files, so the guided task's restore point
// covers it. [T]: no GoH match played.
const GOH_BOT_KIND = { inf1: 'Squad', inf2: 'Squad', empl: 'Cannon', vehicles: 'Vehicle', tanks: 'Tank', tank: 'Tank' };
async function gohBots(ctx0, game, mod, body, like, res) {
  if (!body.bots || !res || !res.unit) return res;
  const army = lc(res.unit.army), list = lc(res.unit.period), unit = res.unit.id;
  const out = res.bots = { asked: true, likeListed: false, army, row: null, state: 'gohadd', list, file: null, say: [], undo: null };
  if (res.errors.length || (body.write && !res.written)) { out.state = 'gohskip'; return res; }
  const B = require('../bots/lib'), GB = require('../../../botrecipe/gohbuys');
  // the Bots page reads the game of its ctx: this request is a GoH one whatever page sent it (the guided task sends gid goh)
  const bctx = Object.create(ctx0); bctx.gameId = () => 'goh'; bctx.curDir = () => game; bctx.gohDir = () => game;
  const rel = GB.UNITS + army + '/' + list + '.' + army + '.lua';
  let after = null;
  try {
    const e = B.effective(bctx, mod, rel);
    if (e.text != null) for (const s of GB.readList(e.text, rel).stages) for (const u of s.units) if (!after && lc(u.unit) === lc(like.id)) after = u.unit;
  } catch (e) { /* not read: the kind picks the row */ }
  out.likeListed = !!after;
  const b = { mod, unit, army, list, write: !!body.write };
  if (after && /^[A-Za-z0-9_()]+$/.test(after)) b.after = after;
  else b.cls = like.kind === 'squad' ? 'Squad' : GOH_BOT_KIND[lc(like.button)] || 'Tank';
  let r;
  try { r = await B.buyFirst(bctx, b); }
  catch (e) { out.state = 'gohfail'; out.why = e.message; out.key = e.key || null; return res; }
  finally { if (body.write) B.touchWrites(bctx); }
  out.file = 'resource/' + r.rel; out.say = r.say || []; out.placed = r.placed || null;
  if (r.cancelled) { out.state = 'gohfail'; out.why = 'stopped'; return res; }
  if (!r.ok) { out.state = 'gohfail'; out.why = r.plain || (r.say || []).slice(-1)[0] || r.code || ''; return res; }
  if (r.noChange) { out.state = 'gohhas'; return res; }
  out.state = 'gohadd'; out.undo = r.undo || null; out.wrote = !!r.wrote;
  res.files.push({ file: out.file, inMod: r.from === 'mod', isNew: !r.from, copiedFromGame: r.from === 'game', lines: out.say.slice(0, 40), more: 0 });
  return res;
}

// ---------- build a buy: a squad of picked soldiers, or a group of vehicles with crews ----------
// The engine spawns a card's {content}: "name[:count]" words; the words in ( ) after a vehicle are its crew; a trailer in ( )
// after a tractor is hooked to it [V] SpawnUnit. A count on a vehicle makes N of them but only the
// last gets the ( ) crew, so a group repeats "vehicle ( crew )" once per vehicle. Every vehicle must exist (MIS-50: crash on buy).
// The card is placed like an existing squad of the army (button, group, cooldown, tags); <= 4 soldier types and no vehicle stay a
// macro line (gen opSquad), anything else is written as a card block (gen opSquadX, content).
// body {id, name, army, like?, period?, parts [{id, card?, n, crew? [{id, n}]}], price, level, bots, write}
function buyParts(cur, body, army) {
  const list = Array.isArray(body.parts) ? body.parts : [];
  if (!list.length) bad('Add at least one soldier or vehicle to the buy.');
  if (list.length > 16) bad('A buy takes at most 16 rows. Put more of the same unit in one row with a higher count.');
  const whole = (v, lo, hi, what) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) bad('Type a whole number between ' + lo + ' and ' + hi + ' for ' + what + '.'); return n; };
  const parts = [];
  for (const p of list) {
    const u = unitOf(cur, String((p && p.id) || ''), p && p.card), label = u.name || u.id;
    if (u.kind === 'squad') bad(label + ' is a squad. Add its soldiers one by one (the stats panel lists them).');
    if (u.kind === 'soldier') {
      const one = parts.find(x => x.kind === 'soldier' && lc(x.u.id) === lc(u.id));
      const n = whole(p.n == null ? 1 : p.n, 1, 30, 'the count of ' + label);
      if (one) one.n += n; else parts.push({ kind: 'soldier', u, n });
      continue;
    }
    const n = whole(p.n == null ? 1 : p.n, 1, 8, 'the count of ' + label);
    let crew;
    if (Array.isArray(p.crew)) crew = p.crew.map(c => { const s = unitOf(cur, String((c && c.id) || '')); if (s.kind !== 'soldier') bad('The crew of ' + label + ' must be soldiers; ' + (s.name || s.id) + ' is not one.'); return { u: s, n: whole(c.n == null ? 1 : c.n, 1, 20, 'the crew count of ' + label) }; });
    else crew = (u.members || []).map(m => { const pre = 'mp/' + lc(u.army || army) + '/' + (u.period ? lc(u.period) + '/' : ''); const s = cur.byId.get(pre + lc(tailOf(m.breed))) || cur.byId.get('mp/' + lc(u.army || army) + '/' + lc(m.breed)); return { u: s || { id: pre + tailOf(m.breed), kind: 'soldier', name: '', cost: null, cp: null }, n: m.n }; });
    parts.push({ kind: 'vehicle', u, n, crew });
  }
  return parts;
}
// the squad a new buy is placed like: the one named, else the army's squad whose price is nearest (then the nearest head count)
// plain(u): the squad is one macro line in the army's squad list (a card written out as a block, like a gun with its crew, cannot be the pattern)
function buyLike(cur, body, army, period, near, men, plain) {
  if (body.like) {
    const u = unitOf(cur, String(body.like), body.likeCard); if (u.kind !== 'squad' || lc(u.army) !== army) bad('Place it like a squad of the same army (' + army + '). ' + (u.name || u.id) + ' is not one.');
    if (!plain(u)) bad((u.name || u.id) + ' is not a plain squad of soldiers, so it cannot be the pattern. Pick an infantry squad, or leave the box empty.');
    return u;
  }
  const pool = cur.units.filter(u => u.kind === 'squad' && u.buyable && lc(u.army) === army && (!period || lc(u.period || '') === period));
  if (!pool.length) bad('Army ' + army + (period ? ' (' + period + ')' : '') + ' has no squad in the buy panel to place the new buy like. Pick another army.');
  const size = u => Math.abs((u.members || []).reduce((s, m) => s + m.n, 0) - men);
  const lone = u => (lc(u.id).startsWith('single') || (u.members || []).reduce((s, m) => s + m.n, 0) === 1) !== (men === 1) ? 1 : 0;   // a one-man buy is no pattern for a squad
  const sorted = pool.slice().sort((a, b) => lone(a) - lone(b) || (near == null ? 0 : Math.abs((a.cost || 0) - near) - Math.abs((b.cost || 0) - near)) || size(a) - size(b));
  // a squad no doctrine locks comes before a doctrine one (GoH d(..) lines)
  return sorted.find(u => plain(u) === 2) || sorted.find(u => plain(u))
    || bad('Army ' + army + ' has no plain infantry squad to place the new buy like. Pick another army.');
}
async function buy(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, true), gid = gidOf(ctx0, body, game), goh = gid === 'goh';
  guardWrite(gid, game, mod, body);
  const { cur } = await both(ctx0, game, mod);
  const id = String(body.id || '').trim().toLowerCase(), army = lc(String(body.army || '').trim()), period = goh ? lc(body.period || '') : '';
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(id)) bad('The new id must be lower-case letters, digits and _ only, starting with a letter (for example assault_group).');
  if (!army || !cur.units.some(u => lc(u.army) === army)) bad('Pick the army that buys it.');
  if (goh && !GOH_PERIODS.includes(period)) bad('Pick the period of the new buy: early, mid, late or conquest.');
  if (cur.byId.has(id + '(' + army + ')') || cur.byId.has(id)) bad('A unit with the id "' + id + '" already exists. Pick another id.');
  const parts = buyParts(cur, body, army);
  const vehicles = parts.filter(p => p.kind === 'vehicle'), soldiers = parts.filter(p => p.kind === 'soldier');
  if (goh && vehicles.length) bad('Not available in Gates of Hell yet: a buy with vehicles. GoH squad lists are macro lines of soldiers only; a vehicle card there is copied with "Add a unit (copy)". Make this buy with soldiers only.');
  const men = soldiers.reduce((s, p) => s + p.n, 0) + vehicles.reduce((s, p) => s + p.n * p.crew.reduce((a, c) => a + c.n, 0), 0);
  if (men > 80) bad('This buy has ' + men + ' soldiers. Keep it at 80 or fewer.');
  const name = String(body.name || '').trim();
  const price = body.price === '' || body.price == null ? null : numVal('cost', body.price);
  const level = body.level === '' || body.level == null ? null : numVal('level', body.level);
  // what the parts cost on their own cards (a soldier card often has no price: then the sum is a lower bound, said so)
  let sum = 0, cp = 0; const unknown = [], listed = [];
  const tally = (u, n) => { if (u.cost != null) sum += u.cost * n; else if (!unknown.includes(u.name || u.id)) unknown.push(u.name || u.id); if (u.cp != null) cp += u.cp * n; };
  for (const p of parts) {
    tally(p.u, p.n);
    if (p.kind === 'vehicle') for (const c of p.crew) tally(c.u, c.n * p.n);
    listed.push({ id: p.u.id, name: p.u.name || '', kind: p.kind, n: p.n, cost: p.u.cost, crew: p.kind === 'vehicle' ? p.crew.map(c => ({ id: c.u.id, name: c.u.name || '', n: c.n })) : undefined });
  }
  const ctx = newCtx(game, mod, !body.write, gid), O = gen().ops, notes = [];
  let sq = null;
  const plainSquad = u => {
    if (!sq) sq = O.H.unitFiles(ctx, army, period, 'squad').map(k => { const b = ctx.read(k); return b ? b.toString('latin1').split(/\r?\n/) : []; });
    const re = new RegExp('^\\s*\\(\\s*"(squad|single)_with\\w*"[^\\n]*\\bname\\(' + reEsc(u.id.replace(/\(.*$/, '')) + '\\)', 'i'), sre = new RegExp('\\bside\\(' + reEsc(army) + '\\)', 'i');
    let rank = 0;
    for (const ls of sq) for (const l of ls) if (re.test(l) && (goh || sre.test(l))) rank = Math.max(rank, /_doc"|\bd\([^()]*\)/i.test(l) ? 1 : 2);
    return rank;   // 0 no macro line, 1 a doctrine squad line, 2 a plain squad line
  };
  const like = buyLike(cur, body, army, period, price != null ? price : sum || null, men, plainSquad);
  const lm = /^(.*)\(([^)]+)\)$/.exec(like.id), likeName = lm ? lm[1] : like.id;
  const brow = (like.bots || []).find(b => lc(b.army) === army);
  const botSpec = goh ? undefined : body.bots ? (brow && brow.priority != null ? String(brow.priority) : true) : false;
  const fields = {}; if (price != null && !goh) fields.cost = price; if (level != null && !goh) fields.level = level;
  if (goh && price != null) bad('A Gates of Hell squad has no price of its own: the game adds up its soldiers\' prices (GHGPL-10). Leave the price empty.');
  if (goh && level != null) bad('Gates of Hell has no rank lock on a buy. Leave the rank empty.');
  const foreign = soldiers.filter(p => !new RegExp('^mp/' + reEsc(army) + '/', 'i').test(p.u.id));
  const plain = !vehicles.length && soldiers.length <= 4 && !foreign.length;
  let content, seat = like;
  if (plain) {
    content = soldiers.map(p => p.u.id + ':' + p.n).join(' ');
    O.opSquad(ctx, { op: 'squad', name: id, like: likeName, army, period: period || undefined, members: soldiers.map(p => tailOf(p.u.id) + ':' + p.n), fields, display: name || undefined, bots: botSpec });
  } else {
    const words = [];
    for (const p of soldiers) words.push(p.u.id + ':' + p.n);
    for (const p of vehicles) {
      // a buy that is itself a group (its card names another vehicle and who rides in it, e.g. a halftrack with a squad): its own content goes in
      const own = String(p.u.content || '').replace(/[()]/g, ' $& ').trim().split(/\s+/).filter(Boolean);
      if (own.length && own[0] !== '*') { for (let i = 0; i < p.n; i++) words.push(own.map(w => w === '*' ? p.u.id : w).join(' ')); continue; }
      if (!p.u.def && !goh) ctx.err('WARN_UNITS_BUY_NO_ENTITY', `${p.u.id}: no unit file was found for it; a buy whose vehicle cannot be made crashes the match when bought (MIS-50)`, id);
      for (let i = 0; i < p.n; i++) { words.push(p.u.id); if (p.crew.length) words.push('( ' + p.crew.map(c => c.u.id + ':' + c.n).join(' ') + ' )'); }
    }
    content = words.join(' ');
    // a group with vehicles is no infantry buy: unless a squad to place it like was picked, it takes the buy button, cooldown group
    // and tags of its dearest vehicle, so it sits with the vehicles and infantry-only modes leave it out
    const top = vehicles.slice().sort((a, b) => (b.u.cost || 0) - (a.u.cost || 0))[0];
    if (top && !body.like && !goh) { if (top.u.tags) fields.tags = top.u.tags; if (top.u.group) fields.group = top.u.group; if (top.u.button) fields.button = top.u.button;
      if (level == null && top.u.level != null) fields.level = top.u.level; if (top.u.charge != null) fields.charge = top.u.charge; if (top.u.fore != null) fields.fore = top.u.fore; seat = top.u; }
    O.opSquad(ctx, { op: 'squad', name: id, like: likeName, army, period: period || undefined, content, fields, display: name || undefined, bots: botSpec });
    if (vehicles.length) notes.push('group');
  }
  const newId = id + '(' + army + ')';
  const rows = [{ field: 'id', old: '', new: newId }, { field: 'army', old: '', new: army }, { field: 'content', old: '', new: content }];
  if (!goh) rows.push({ field: 'cost', old: '', new: price != null ? price : like.cost });   // GoH: no price of its own (GHGPL-10)
  if (level != null) rows.push({ field: 'level', old: '', new: level });
  if (name) rows.push({ field: 'name', old: '', new: name });
  const res = finish(ctx, game, mod, body, { unit: { id: newId, kind: 'squad', army, period: period || undefined }, like: brief(like), rows, names: [], notes,
    where: { panel: true, army, button: seat.button, group: seat.group, rank: level != null ? level : seat.level } });
  res.buy = { seat: seat === like ? null : { id: seat.id, name: seat.name || '' }, content, parts: listed, men, vehicles: vehicles.reduce((s, p) => s + p.n, 0), sum, unknown, cp: cp || null, placedLike: { id: like.id, name: like.name || '', picked: !!body.like } };
  const codes = res.warnings.map(w => w.code);
  // GoH: no bot.data.lua; the bots buy from script/multiplayer/units/<army>/<period>.<army>.lua, so a ticked "bots buy it" adds a
  // row there through gohBots (the same path as the Add step), placed after the row of the squad it is placed like [T]
  if (goh) { res.bots = { asked: !!body.bots, likeListed: false, army, row: null, state: body.bots ? 'goh' : 'gohoff' }; return gohBots(ctx0, game, mod, body, like, res); }
  res.bots = { asked: !!body.bots, likeListed: !!brow, army, row: brow || null, state: body.bots ? (brow && !codes.includes('WARN_GEN_BOTS_LIKE_ABSENT') ? 'added' : 'never') : (brow ? 'missed' : 'never') };
  return res;
}

// ---------- the models of a buy (the 3D line-up of the page) ----------
// body {id, card} (a unit of the lists) or {parts, army} (the buy being built): every model the game spawns for it, once each with
// its count, vehicles first. target = what the Models 3D view opens (tools/soedit/target.js): an entity name, or breed:<soldier id>
// (a soldier card "mp/<army>/[<period>/]<name>" is the breed file set/breed/<that>.set, gen breedKey).
function buyModels(cur, body) {
  const out = new Map();
  const put = (kind, target, id, name, n) => { const k = lc(target), o = out.get(k); if (o) o.n += n; else out.set(k, { kind, target, id, name: name || '', n }); };
  const soldier = (id, n) => { const s = cur.byId.get(lc(id)); put('soldier', 'breed:' + lc(id), id, s ? s.name : '', n); };
  const entity = (id, n) => { const v = cur.byId.get(lc(id)); put('vehicle', id, id, v ? v.name : '', n); };
  const expand = (u, n) => {
    if (u.kind === 'soldier') return soldier(u.id, n);
    const words = String(u.content || '').replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      // no content read: a squad a macro builds (members), a GoH card (its vehicle word), else the entity of the card's own name
      if (u.kind === 'squad') { for (const m of u.members || []) soldier('mp/' + lc(u.army) + '/' + (u.period ? lc(u.period) + '/' : '') + tailOf(m.breed), m.n * n); return; }
      return entity(u.vehicle || u.id, n);
    }
    for (const w of words) {
      const i = w.lastIndexOf(':'), name = i > 0 ? w.slice(0, i) : w, c = i > 0 ? Math.max(1, parseInt(w.slice(i + 1), 10) || 1) : 1;
      if (name === '*') entity(u.vehicle || u.id.replace(/\(.*$/, ''), n * c);
      else if (/^mp\//i.test(name) || (cur.byId.get(lc(name)) || {}).kind === 'soldier') soldier(name, n * c);
      else entity(name, n * c);
    }
  };
  if (Array.isArray(body.parts)) {
    for (const p of buyParts(cur, body, lc(body.army || ''))) {
      if (p.kind === 'vehicle' && Array.isArray((body.parts.find(x => lc(x.id) === lc(p.u.id)) || {}).crew)) { entity(p.u.vehicle || p.u.id, p.n); for (const c of p.crew) soldier(c.u.id, c.n * p.n); }
      else expand(p.u, p.n);
    }
  } else expand(unitOf(cur, String(body.id || ''), body.card), 1);
  const models = [...out.values()].sort((a, b) => (a.kind === 'vehicle' ? 0 : 1) - (b.kind === 'vehicle' ? 0 : 1));
  return { models, vehicles: models.filter(m => m.kind === 'vehicle').reduce((s, m) => s + m.n, 0), men: models.filter(m => m.kind === 'soldier').reduce((s, m) => s + m.n, 0) };
}

// ---------- equipment: a soldier's inventory as the game's grid of cells (the Equipment card) ----------
// Engine facts with their source lines: ./kit.js (box size, item cells, item line forms, fill order, in_hands, names, pictures).
// The stuff table (every file under set/stuff with its cells, weight, kind, model and name key) and the human's box are read once
// per game + mod and kept in the shared store: section 'units.kit.stuff', parts {game, gid, mod}, stamps {game, mod: set + properties + pak}.
const KIT_VER = 2, KIT_SECTION = 'units.kit.stuff', KIT_AREAS = ['set', 'properties', 'pak'];
let KITLIB = null;
const kitLib = () => KITLIB || (KITLIB = require('./kit'));
const KMEM = new Map();
const noMod = ctx0 => path.join((ctx0 && ctx0.tmpRoot) || os.tmpdir(), 'units-none');
async function kitData(ctx0, game, gid, mod) {
  const S = storeOf(ctx0), T = await modTree(ctx0, mod, true);
  const parts = catParts(game, gid, mod), stamps = Object.assign({ game: GV(ctx0).stamp({ gameDir: game, gid }) }, mod ? MT(ctx0).stamps(T, KIT_AREAS) : {});
  const key = md5(JSON.stringify([parts, stamps]));
  if (KMEM.has(key)) return KMEM.get(key);
  const d = await S.wrap(KIT_SECTION, KIT_VER, parts, stamps, async () => {
    const K = kitLib(), c = newCtx(game, mod || noMod(ctx0), true, gid);
    const table = await K.buildTable(c.keys(/^resource\/set\/stuff\//), k => c.readStr(k), () => new Promise(r => setImmediate(r)));
    return { table, box: K.boxOf(c.readStr(K.BOX_FILE), gid) };
  });
  if (KMEM.size > 3) KMEM.clear();
  KMEM.set(key, d);
  return d;
}
// The items' names as the game shows them (the inventory tooltip, -> ): the text
// of each stuff's name key (kit.js nameKeys), mod over game. Store section 'units.kit.names', parts {game, gid, mod, lang}, stamps
// {game, mod: set + text + pak}. -> {names: {stuff name: text}, lang: 'game' | 'en' | <page language>}
// - Assault Squad 2 / AS64: the .lng files of interface/text (the one language the game is installed in: lang 'game'), then the
//   mod's localization/*.lng, includes expanded (lib/lnginc)
// - Gates of Hell: the .pot files of interface/text (msgid = the English text: lang 'en'), then .lng files of localizations/default,
//   then of localizations/<page language> when a mod has that folder [I]
const KIT_NAMES_VER = 1, KIT_NAMES = 'units.kit.names', KIT_NAME_AREAS = ['set', 'text', 'pak'];
const NMEM = new Map();
async function kitNames(ctx0, game, gid, mod, lang, D) {
  const goh = gid === 'goh', lg = goh && /^[a-z]{2}$/.test(lc(lang)) && lc(lang) !== 'en' ? lc(lang) : '';
  const S = storeOf(ctx0), T = await modTree(ctx0, mod, true);
  const parts = Object.assign(catParts(game, gid, mod), { lang: lg }), stamps = Object.assign({ game: GV(ctx0).stamp({ gameDir: game, gid }) }, mod ? MT(ctx0).stamps(T, KIT_NAME_AREAS) : {});
  const key = md5(JSON.stringify([parts, stamps]));
  if (NMEM.has(key)) return NMEM.get(key);
  const d = await S.wrap(KIT_NAMES, KIT_NAMES_VER, parts, stamps, async () => {
    const K = kitLib(), c = newCtx(game, mod || noMod(ctx0), true, gid), lnginc = require('../../../lib/lnginc'), lngpot = require('../../../upgrade/lib/lngpot');
    const mine = c.scanDisk(), all = new Map(), TEXT = 'resource/interface/text/';
    const langOf = k => { const m = /(^|\/)localizations\/([^/]+)\//i.exec(k); return m ? lc(m[2]) : ''; };
    let files = c.keys(/\.(lng|pot)$/i).filter(k => /(^|\/)(interface\/text|localizations?)\//i.test(k) && !/\/mission\//i.test(k));
    if (goh) files = files.filter(k => { const l = langOf(k); return !l || l === 'default' || (lg && (l === lg || l.startsWith(lg))); });
    else files = files.filter(k => !/\.pot$/i.test(k));
    // later wins: .pot, then .lng; game before mod; the page language last
    const rank = k => (/\.pot$/i.test(k) ? 0 : 4) + (mine.has(k) ? 2 : 0) + (goh && lg && langOf(k) !== '' && langOf(k) !== 'default' ? 8 : 0);
    files.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
    const rel = k => /(^|\/)interface\/text\//i.test(k) ? k.replace(/^(.*?\/)?interface\/text\//i, '') : k.replace(/^.*?localizations?\/(?:[^/]+\/(?=.*\/))?/i, '');
    const open = v => { let b = c.read(v); if (!b && lc(v).startsWith(TEXT)) b = c.read('localization/' + v.slice(TEXT.length)); return b ? { buf: b, file: v } : null; };
    let own = false, n = 0;
    for (const k of files) {
      if (++n % 8 === 0) await new Promise(r => setImmediate(r));
      try {
        const b = c.read(k); if (!b) continue;
        if (/\.pot$/i.test(k)) for (const [key, t] of lngpot.potKeys(b.toString('utf8').replace(/^﻿/, ''))) all.set(lc(key), String(t).replace(/\\n/g, ' ').replace(/\\(.)/g, '$1'));
        else { const hit = rank(k) >= 8; for (const [low, v] of lnginc.readLngKeys(b, rel(k), { open, onError() {} })) { all.set(low, String(v.txt)); if (hit && /^desc\//.test(low)) own = true; } }
      } catch (e) { /* a text file this reader cannot read: its names stay file names */ }
    }
    const names = {};
    for (const st of D.table) {
      if (st.pattern) continue;
      for (const k of K.nameKeys(st)) { const t = all.get(lc(k)); if (t != null) { const s = String(t).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); if (s) { names[st.name] = s; break; } } }
    }
    return { names, lang: goh ? (own ? lg : 'en') : 'game' };
  });
  if (NMEM.size > 6) NMEM.clear();
  NMEM.set(key, d);
  return d;
}
// one read-only view of game + mod per catalogue (building it reads the game's file index; the catalogue is replaced when the mod changes)
// a soldier file as the game reads it: includes and macro calls written out (tools/lib/breedflat), supplied lines marked.
// -> text | null (no such file). into.partial: an include or a macro was not found
function kitFlat(c, key, into) {
  const text = c.readStr(key); if (text == null) return null;
  const f = require('../../../lib/breedflat').flat(text, key, k => c.read(k), { mark: true });
  if (into) into.partial = f.partial;
  return f.text;
}
function kitCtx(cat, ctx0, game, mod, gid) { return cat._kitCtx || (cat._kitCtx = newCtx(game, mod || noMod(ctx0), true, gid)); }
// the soldier file a request names: body.breed ("rus/smg", GoH "ger/early/rifleman_1", or a bare name with army and period) or the
// soldier's id of the unit lists ("mp/rus/smg"). Only mp soldiers: gen's kit op edits set/breed/mp/<army>/[<period>/]<name>.set
function kitBreed(body, gid, id) {
  const goh = gid === 'goh';
  const p = lc(String(body.breed || id || '').trim()).replace(/\\/g, '/').replace(/^mp\//, '').replace(/\.set$/, '').split('/').filter(Boolean);
  let army = lc(body.army || ''), period = lc(body.period || ''), name = '';
  if (goh && p.length === 3) [army, period, name] = p; else if (p.length === 2 && !goh) [army, name] = p; else if (p.length === 2 && goh) { [army, name] = p; } else if (p.length === 1) name = p[0];
  if (!/^[a-z0-9_]+$/.test(name) || !/^[a-z0-9_]+$/.test(army)) bad('Pick a soldier of a multiplayer army (for example the rifleman of a squad). Other soldier files are not edited here.');
  if (goh && !GOH_PERIODS.includes(period)) bad('Pick the period of the soldier: early, mid, late or conquest.');
  return { army, period: goh ? period : '', name, spec: [army, goh ? period : '', name].filter(Boolean).join('/'), key: 'resource/set/breed/mp/' + army + '/' + (goh ? period + '/' : '') + name + '.set' };
}
// the rounds a loaded weapon starts with: filling "x" n = n; filled = the stuff's own filling at its max; filled N = N cut to whole
// magazines ( [V])
function kitRounds(it, st) {
  if (it.filling) return it.filling.count;
  if (!it.filled || !st || !st.filling) return null;
  const mag = st.filling.mag || 1;
  return it.filledN != null ? it.filledN - it.filledN % mag : (st.filling.max != null ? st.filling.max - st.filling.max % mag : mag);
}
// N = the names of kitNames ({stuff name: text}) or null. Each item: item = the name in the file, name = the game's name ('' = none
// found), n / spread = the line's count and spread as written, count = the centre, min..max = what the game can give (varies =
// they differ), loaded: '' | 'own' (filled) | 'ammo' (filling), ammo / ammoName = the named ammunition, own / ownName = the
// ammunition the weapon takes by itself, ownRounds = how much of it a full load is, rounds, roundsSet = the N of "filled N" (null = full)
function kitView(D, list, N) {
  const K = kitLib(), f = K.fill(D.box, D.table, list.items), nm = st => (N && st && N[st.name]) || '';
  const items = list.items.map((it, i) => {
    const st = K.findItem(D.table, it.item), r = f.rows[i], own = st && st.filling ? st.filling.tags.join(' ') : '';
    return { index: i, item: it.item, name: nm(st), n: it.n === undefined ? 1 : it.n, count: it.count, spread: it.dev || 0, min: it.min, max: it.max, varies: !!it.varies, chance: it.chance == null ? null : Math.round(it.chance * 100),
      filled: !!it.filled, loaded: it.filling ? 'ammo' : it.filled ? 'own' : '', ammo: it.filling ? it.filling.tags : '', ammoName: it.filling ? nm(K.findItem(D.table, it.filling.tags)) : '',
      own, ownName: own ? nm(K.findItem(D.table, own)) : '', ownRounds: kitRounds({ filled: true, filledN: null }, st), rounds: kitRounds(it, st), roundsSet: it.filled ? it.filledN : null, inHands: i === list.inHands,
      w: r.w, h: r.h, x: r.cells.length ? r.cells[0].x : null, y: r.cells.length ? r.cells[0].y : null, cells: r.cells, placed: r.placed, left: r.left,
      kind: st ? st.kind : 'other', known: !!st, sized: st ? st.sized : false, stackable: !!(st && st.stackable), perStack: st && st.weight > 0 ? Math.floor(D.box.weight / st.weight) : null,
      model: (st && st.entity) || null, icon: null, isNew: !!it.isNew, macro: !!it.macro };
  });
  return { grid: { w: D.box.w, h: D.box.h, cellWeight: D.box.weight, file: D.box.file }, items,
    pieces: f.pieces.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, count: p.count, items: p.items })),
    notFit: f.left.map(l => ({ index: l.index, item: items[l.index].item, name: items[l.index].name, count: l.count })),
    // pictures: the game has no icon file per item, it draws the model (kit.js). 'model' = the page renders each item's model once
    // (the 3D view's snapshot, ext/models/sub/README.md) and keeps the picture for the page session
    pictures: 'model' };
}
const kitKind = D => item => { const st = kitLib().findItem(D.table, item); return st ? st.kind : 'other'; };
const kitHandover = (h, N, D) => { if (!h) return undefined; const nm = i => { const st = i ? kitLib().findItem(D.table, i) : null; return (N && st && N[st.name]) || ''; }; return { from: h.from, fromName: nm(h.from), to: h.to, toName: nm(h.to) }; };
// body {id, card} | {breed, army?, period?}, pending? {add, del, inHands}, lang? (the page language, for the names): the inventory
// as the game lays it out; with pending, as it would be after that edit (the page's live "fits / does not fit"). A squad or
// vehicle answers its soldiers to pick from. handover {from, to}: the held item is removed and the hands go to the next weapon
async function kitRead(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, false), gid = gidOf(ctx0, body, game);
  const { cur } = await both(ctx0, game, mod, true);
  let unit = null;
  if (body.id && !body.breed) {
    const u = unitOf(cur, String(body.id), body.card);
    unit = { id: u.id, name: u.name || '', kind: u.kind, army: u.army };
    if (u.kind !== 'soldier') {
      // a squad answers its soldiers to pick from; a vehicle answers its own box and weapon slots too, with its crew to pick from
      const m = buyModels(cur, { id: u.id, card: body.card });
      const group = { unit, soldiers: m.models.filter(x => x.kind === 'soldier').map(x => ({ id: x.id, name: x.name, n: x.n })), vehicles: m.vehicles, men: m.men };
      const veh = body.entity || m.models.some(x => x.kind === 'vehicle') ? await vehRead(ctx0, body, cur, game, mod, gid, unit) : null;
      return veh ? Object.assign(group, veh) : group;
    }
  } else if (body.entity && !body.breed) return vehRead(ctx0, body, cur, game, mod, gid, null);
  const b = kitBreed(body, gid, unit && unit.id), K = kitLib();
  const D = await kitData(ctx0, game, gid, mod), c = kitCtx(cur, ctx0, game, mod, gid), N = await kitNames(ctx0, game, gid, mod, body.lang, D);
  const fl = {}, text = kitFlat(c, b.key, fl);
  if (text == null) bad('No soldier file was found for ' + b.spec + ' (' + b.key + ').');
  const br = K.readBreed(text);
  if (!br.found) bad('The file ' + b.key + ' is not a soldier file the game reads (no {breed} block).');
  let list = br;
  if (body.pending && typeof body.pending === 'object') { list = K.applyPending(br, body.pending, kitKind(D)); if (list.why) bad(list.why); }
  if (!unit) { const s = cur.byId.get('mp/' + b.spec); unit = { id: 'mp/' + b.spec, name: s ? s.name || '' : '', kind: 'soldier', army: b.army }; }
  return Object.assign({ unit, breed: b.spec, army: b.army, period: b.period || undefined, file: b.key, from: c.scanDisk().has(b.key) ? 'mod' : 'game',
    pending: list !== br, otherLines: br.calls || !!fl.partial, macroItems: br.items.filter(x => x.macro).length, hasInventory: br.hasInventory, nameLang: N.lang, handover: kitHandover(list.handover, N.names, D) }, kitView(D, list, N.names),
    { slots: soldierSlots(c, D, N.names, text) });
}

// ---------- equipment of a vehicle: its own box and its weapon slots ----------
// Engine facts with their source lines: ./kit.js (readVehicle: the box, the holders and their masks, the weapon places).
// A slot = one weapon place of the vehicle (and a holder that has no place). kind:
//   fixed  the vehicle file names the weapon of the place ({place {weapon ..}}): no mask is asked, any weapon can be written there
//   mask   the place has a holder with a mask: it takes an item that has every tag of the mask; what is mounted is a box line
//          with {user "<slot>"}
//   closed a holder with an empty mask, a place with no holder and no weapon, or a holder with no weapon place of its name (the
//          engine asks only the holders of weapon places, kit.js): nothing goes in. why: nomask | noholder | noplace
// what counts as a weapon for a fixed place: the stuff folders of weapons, or the tag weapon [I: the engine takes whatever item the
// line names; a thing that is no weapon gives a place that cannot fire]
const isWeaponStuff = st => !!st && !st.pattern && (st.kind === 'weapon' || st.top === 'gun' || st.all.includes('weapon'));
// the plain reason an item does not go into a slot ('' = it goes)
function slotRefusal(D, slot, item) {
  const K = kitLib(), st = K.findItem(D.table, item);
  if (!st) return 'The game has no item named "' + item + '". Pick one from the list of the slot.';
  if (slot.fixed) return isWeaponStuff(st) ? '' : '"' + item + '" is not a weapon, so it cannot be the weapon of the slot "' + slot.name + '".';
  if (!slot.mask || !slot.mask.length) return 'The slot "' + slot.name + '" takes nothing: its list of accepted items is empty.';
  const miss = slot.mask.filter(t => !st.all.includes(t));
  return miss.length ? '"' + item + '" does not go into the slot "' + slot.name + '". The slot takes only items marked ' + slot.mask.join(' + ') + '; this one is not marked ' + miss.join(', ') + '.' : '';
}
const vehAccepts = D => (slot, item) => slotRefusal(D, slot, item);
// the vehicle entity a request names: body.entity (a def name), else the first vehicle the unit's buy spawns
function vehEntity(cur, body) {
  if (body.entity) { const e = lc(String(body.entity).trim()); if (!/^[a-z0-9_][a-z0-9_().-]*$/.test(e)) bad('Pick a vehicle from the list.'); return e; }
  const m = buyModels(cur, { id: body.id, card: body.card }).models.find(x => x.kind === 'vehicle');
  return m ? lc(m.target) : null;
}
function vehKey(c, ent) {
  const hits = c.keys(new RegExp('^resource/entity/.*/' + reEsc(ent) + '\\.def$')), mine = hits.filter(k => c.inMod(k));
  return mine[0] || hits.sort()[0] || null;
}
// one weapon of a slot in the page's words
function slotWeapon(D, N, w) {
  if (!w) return null;
  const K = kitLib(), st = K.findItem(D.table, w.item), nm = s => (N && s && N[s.name]) || '';
  const am = w.filling ? K.findItem(D.table, w.filling.tags) : st && st.filling ? K.findItem(D.table, st.filling.tags.join(' ')) : null;
  return { item: w.item, name: nm(st), known: !!st, model: (st && st.entity) || null, w: st ? st.w : 2, h: st ? st.h : 2, kind: st ? st.kind : 'other',
    loaded: w.filling ? 'ammo' : w.filled ? 'own' : '', ammo: w.filling ? w.filling.tags : st && st.filling ? st.filling.tags.join(' ') : '', ammoName: nm(am),
    rounds: w.filling ? w.filling.count : w.filled && st && st.filling ? st.filling.mag || 1 : null };
}
function countTakes(D, slot) {
  const K = kitLib(); let n = 0;
  for (const st of D.table) if (slot.kind === 'fixed' ? isWeaponStuff(st) : K.maskTakes(slot.mask, st)) n++;
  return n;
}
// V = kit.readVehicle answer (or the list after a pending edit: items + places), holders from the file
function vehSlots(D, N, V, holders) {
  const out = [], seen = new Set(), rel = f => String(f || '').replace(/^resource\//, '');
  const one = (name, place, h) => {
    const mounted = V.items.find(x => x.user === name) || null;
    const s = { name, type: (place && place.type) || '', holder: h ? h.type : '', kind: place && place.weapon ? 'fixed' : place && h && h.mask.length ? 'mask' : 'closed', mask: h ? h.mask.slice() : [],
      maskFile: h && h.mask.length ? rel(h.file) + ':' + h.line : '', weapon: null, canChange: true, why: '' };
    if (s.kind === 'fixed') { s.weapon = slotWeapon(D, N, place.weapon); s.file = rel(place.file) + ':' + place.line; if (!place.own) { s.canChange = false; s.why = 'shared'; s.shared = rel(place.file); } }
    else if (s.kind === 'mask') { s.weapon = mounted ? slotWeapon(D, N, mounted) : null; if (mounted && !mounted.own) { s.canChange = false; s.why = 'shared'; s.shared = rel(mounted.file); } }
    else { s.canChange = false; s.why = !place ? 'noplace' : h ? 'nomask' : 'noholder'; s.weapon = mounted ? slotWeapon(D, N, mounted) : null; }
    s.accepts = s.kind === 'closed' ? 0 : countTakes(D, s);
    out.push(s);
  };
  for (const p of V.places) { seen.add(p.name); one(p.name, p, holders.find(h => h.name === p.name) || null); }
  for (const h of holders) if (!seen.has(h.name) && h.type === 'weapon') one(h.name, null, h);
  return out;
}
// a soldier's holders with a mask (human.ext: armor "head", armor "body", GoH also "accessories") and what the soldier file puts
// into them ({armors {head <item>} {body <item>}}; kit.js). Shown, not edited here
function soldierSlots(c, D, N, breedText) {
  const K = kitLib();
  let H = null; try { H = K.readVehicle(k => c.read(k), K.BOX_FILE); } catch (e) { H = null; }
  if (!H || !H.found) return [];
  const br = K.parse(breedText).kids.find(k => k.name === 'breed'), arm = br ? br.kids.find(k => k.name === 'armors') : null, out = [];
  for (const h of H.holders) {
    if (!h.mask.length) continue;
    const line = arm ? arm.kids.find(k => k.name === h.name) : null, item = line && line.args.length ? lc(line.args.join(' ')).trim() : '';
    const s = { name: h.name, type: '', holder: h.type, kind: 'mask', mask: h.mask.slice(), maskFile: String(h.file).replace(/^resource\//, '') + ':' + h.line,
      weapon: item ? slotWeapon(D, N, { item, filled: false, filling: null }) : null, canChange: false, why: 'soldier' };
    s.accepts = countTakes(D, s);
    out.push(s);
  }
  return out;
}
// the vehicle's box as kitView draws it. list = {items (kit.readVehicle / applyVehicle form), places}
function vehView(D, N, V, list, holders) {
  const K = kitLib(), Dv = { table: D.table, box: { w: V.box.w, h: V.box.h, weight: V.box.weight || 1, file: V.box.file } };
  const items = list.items.map(x => Object.assign({}, x, { n: x.count, dev: 0, min: x.count, max: x.count, varies: false, filledN: null }));
  const view = kitView(Dv, { items, inHands: null }, N);
  view.items.forEach((it, i) => {
    const src = list.items[i], st = K.findItem(D.table, it.item);
    it.slot = src.user || ''; it.own = !!src.own; it.from = String(src.file || '').replace(/^resource\//, '');
    if (it.loaded === 'own') { it.rounds = st && st.filling ? st.filling.mag || 1 : null; it.ownRounds = it.rounds; }
  });
  view.slots = vehSlots(D, N, { items: list.items, places: list.places }, holders);
  return view;
}
// body {id, card} | {entity}, pending? {add, del, slots}: the vehicle's inventory and weapon slots (null = the unit has no vehicle)
async function vehRead(ctx0, body, cur, game, mod, gid, unit) {
  const ent = vehEntity(cur, body); if (!ent) return null;
  const K = kitLib(), D = await kitData(ctx0, game, gid, mod), c = kitCtx(cur, ctx0, game, mod, gid), N = await kitNames(ctx0, game, gid, mod, body.lang, D);
  const key = vehKey(c, ent);
  if (!key) bad('No vehicle file was found for "' + ent + '" (entity/../' + ent + '.def).');
  const V = K.readVehicle(k => c.read(k), key);
  if (!V.found) bad('The file ' + key + ' could not be read.');
  let list = V;
  if (body.pending && typeof body.pending === 'object') { list = K.applyVehicle(V, body.pending, vehAccepts(D)); if (list.why) bad(list.why); }
  const u = cur.byId.get(ent);
  return Object.assign({ unit: unit || { id: ent, name: u ? u.name || '' : '', kind: 'vehicle', army: u ? u.army : '' }, kind: 'vehicle', entity: ent, entityName: u ? u.name || '' : '',
    file: key, from: c.scanDisk().has(key) ? 'mod' : 'game', pending: list !== V, hasInventory: V.hasBox, nameLang: N.lang }, vehView(D, N.names, V, list, V.holders));
}
// body {id, card | entity | breed}, slot, lang: what goes into one slot, as rows of the equipment browser (kitItems row form).
// A masked slot: every item that has all the tags of the mask. A fixed place: every weapon
async function kitSlot(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, false), gid = gidOf(ctx0, body, game);
  const { cur } = await both(ctx0, game, mod, true);
  const K = kitLib(), D = await kitData(ctx0, game, gid, mod), c = kitCtx(cur, ctx0, game, mod, gid), N = await kitNames(ctx0, game, gid, mod, body.lang, D);
  const name = lc(String(body.slot || '').trim());
  let slots = null;
  const u = body.id && !body.breed && !body.entity ? unitOf(cur, String(body.id), body.card) : null;
  if (body.breed || (u && u.kind === 'soldier')) {
    const b = kitBreed(body, gid, u && u.id), text = kitFlat(c, b.key);
    if (text == null) bad('No soldier file was found for ' + b.spec + ' (' + b.key + ').');
    slots = soldierSlots(c, D, N.names, text);
  } else {
    const ent = vehEntity(cur, body); if (!ent) bad('This unit has no vehicle. Pick a vehicle first.');
    const key = vehKey(c, ent); if (!key) bad('No vehicle file was found for "' + ent + '".');
    const V = K.readVehicle(k => c.read(k), key);
    slots = vehSlots(D, N.names, V, V.holders);
  }
  const slot = slots.find(s => s.name === name);
  if (!slot) bad('There is no slot named "' + name + '" here (slots: ' + (slots.map(s => s.name).join(', ') || 'none') + ').');
  const count = {}, items = [];
  if (slot.kind !== 'closed') for (const x of D.table) {
    if (!(slot.kind === 'fixed' ? isWeaponStuff(x) : K.maskTakes(slot.mask, x))) continue;
    const row = kitRow(D, N, x); count[row.heading] = (count[row.heading] || 0) + 1; items.push(row);
  }
  return { slot, nameLang: N.lang, items, groups: K.HEADINGS.filter(h => count[h]).map(h => ({ id: h, n: count[h] })) };
}
// the items the Add box offers: what a soldier can carry (vehicle guns, shells, air bombs and liquids are left out), with kind,
// cells and the game's name (name: '' = the game has no text for it). The equipment browser of the page reads the same answer:
// - each item: heading = the id of the heading it stands under (kit.js headingOf: rifle, smg, mgun, pistol, antitank, flame, heavy,
//   melee, weapon, grenade, explosive, ammo, medical, tools, headgear, gear, container, other), group = its folder under set/stuff,
//   sub = the folders under that ('' = none), file = the item file from resource/ on, model = the entity the game draws it from
//   (the picture target; null = the files name none), ammo / ammoName / mag = the ammunition a weapon loads by itself, its game
//   name and the rounds of one load (ammo '' = the files name none)
// - groups [{id, n}]: the headings that hold an item, in page order
// Made from the two stored answers (stuff table, names) and kept beside them while they are the ones in memory (KIMEM)
const KIMEM = new WeakMap();
async function kitItems(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, false), gid = gidOf(ctx0, body, game);
  const D = await kitData(ctx0, game, gid, mod), K = kitLib(), N = await kitNames(ctx0, game, gid, mod, body.lang, D);
  // body.vehicle: what a vehicle's box can hold = the same list plus vehicle guns and shells (kit.js NOT_VEHICLE stays out)
  const veh = !!body.vehicle, had = KIMEM.get(D); if (had && had.N === N && had[veh ? 'veh' : 'out']) return had[veh ? 'veh' : 'out'];
  const count = {}, items = [], skip = veh ? K.NOT_VEHICLE : K.NOT_CARRIED;
  for (const x of D.table) {
    if (x.pattern || !x.top || skip.includes(x.top)) continue;
    const row = kitRow(D, N, x); count[row.heading] = (count[row.heading] || 0) + 1; items.push(row);
  }
  const out = { nameLang: N.lang, items, groups: K.HEADINGS.filter(h => count[h]).map(h => ({ id: h, n: count[h] })) };
  const keep = had && had.N === N ? had : { N }; keep[veh ? 'veh' : 'out'] = out;
  KIMEM.set(D, keep);
  return out;
}
// one row of the Add box / the equipment browser / a slot's list
function kitRow(D, N, x) {
  const K = kitLib(), rel = x.key.slice(K.STUFF.length).split('/'), am = x.filling ? K.findItem(D.table, x.filling.tags.join(' ')) : null;
  return { item: x.name, name: N.names[x.name] || '', kind: x.kind, w: x.w, h: x.h, loads: !!x.filling, group: x.top, heading: K.headingOf(x), sub: rel.slice(1, -1).join('/'),
    file: x.key.replace(/^resource\//, ''), model: x.entity || null, ammo: x.filling ? (am ? am.name : x.filling.tags.join(' ')) : '', ammoName: (am && N.names[am.name]) || '', mag: x.filling ? x.filling.mag : null };
}
// body {id, card} | {breed ..}, add [{item, count?, spread?, filled?, rounds?, filling?}], del [item], inHands? item | false, lang?,
// showNames? (rows name items as the game does), write: gen's kit op on a mod copy of the soldier file. Refused in plain words
// before gen runs: an item the game does not know, an edit that does not fit the grid
const KIT_PLAIN = { GEN_KIT_HANDS_GONE: 'The item in the soldier\'s hands is removed.', GEN_KIT_ITEM_UNKNOWN: 'The game has no item of that name.',
  GEN_KIT_ITEM_EXISTS: 'The soldier already carries that item. Change its count instead.', GEN_KIT_BREED_UNKNOWN: 'The soldier file was not found.' };
async function kitSet(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, true), gid = gidOf(ctx0, body, game);
  guardWrite(gid, game, mod, body);
  const { cur } = await both(ctx0, game, mod);
  let unit = null;
  if (body.entity && !body.breed) return vehSet(ctx0, body, cur, game, mod, gid, null);
  if (body.id && !body.breed) {
    const u = unitOf(cur, String(body.id), body.card);
    unit = { id: u.id, name: u.name || '', kind: u.kind, army: u.army };
    if (u.kind !== 'soldier') {
      if (!vehEntity(cur, body)) bad((u.name || u.id) + ' is not one soldier. Pick one of its soldiers first.');
      return vehSet(ctx0, body, cur, game, mod, gid, unit);
    }
  }
  const b = kitBreed(body, gid, unit && unit.id), K = kitLib(), D = await kitData(ctx0, game, gid, mod), N = await kitNames(ctx0, game, gid, mod, body.lang, D);
  const ctx = newCtx(game, mod, !body.write, gid), text = kitFlat(ctx, b.key);
  if (text == null) bad('No soldier file was found for ' + b.spec + ' (' + b.key + ').');
  const br = K.readBreed(text);
  if (!br.found) bad('The file ' + b.key + ' is not a soldier file the game reads (no {breed} block).');
  const pend = K.applyPending(br, { add: body.add, del: body.del, inHands: body.inHands }, kitKind(D));
  if (pend.why) bad(pend.why);
  if (!pend.spec.add.length && !pend.spec.del.length && pend.spec.in_hands === undefined) bad('Nothing to change: the soldier already carries exactly this.');
  for (const a of pend.spec.add) {
    if (!K.findItem(D.table, a.item)) bad('The game has no item named "' + a.item + '". Pick one from the list of the Add box (a missing item makes the game warn and may crash it).');
    const o = br.items.find(x => x.item === a.item);
    if (a.filling && !(o && o.filling && o.filling.tags === a.filling) && !K.findItem(D.table, a.filling)) bad('The game has no ammunition named "' + a.filling + '". Pick one from the list.');
  }
  const after = kitView(D, pend, N.names);
  for (const l of after.notFit) if (pend.touched.includes(l.item))
    bad('"' + l.item + '" does not fit: ' + l.count + ' of ' + after.items[l.index].max + ' find no free place in the ' + D.box.w + ' x ' + D.box.h + ' grid, and the game drops what does not fit without a word. Remove something first, or lower the count.');
  const before = kitView(D, br, N.names), rows = [];
  const label = it => (body.showNames && it && it.name) || (it && it.item) || '', cnt = it => !it ? '0' : it.varies ? it.min + ' - ' + it.max : String(it.max);
  const load = it => !it || !it.loaded ? '0' : (it.rounds == null ? '?' : String(it.rounds)) + (it.loaded === 'ammo' ? ' x ' + ((body.showNames && it.ammoName) || it.ammo) : '');
  for (const d of pend.spec.del) if (!pend.spec.add.some(a => a.item === d)) { const o = before.items.find(x => x.item === d); rows.push({ field: 'item', part: label(o) || d, old: cnt(o), new: '0' }); }
  for (const a of pend.spec.add) {
    const o = before.items.find(x => x.item === a.item), n = after.items.find(x => x.item === a.item);
    if (cnt(o) !== cnt(n)) rows.push({ field: 'item', part: label(n), old: cnt(o), new: cnt(n) });
    if (o && o.spread !== n.spread) rows.push({ field: 'spread', part: label(n), old: String(o.spread), new: String(n.spread) });
    // loaded or not, as a row of its own: the words for it are the page's (units.f.loaded), the values are rounds (? = loaded, the
    // files do not say how many), with the ammunition when the line names it
    if (load(o) !== load(n)) rows.push({ field: 'loaded', part: label(n), old: load(o), new: load(n) });
  }
  const h0 = before.items.find(x => x.inHands), h1 = after.items.find(x => x.inHands);
  if ((h0 && h0.item) !== (h1 && h1.item)) rows.push({ field: pend.handover ? 'handover' : 'hands', old: h0 ? label(h0) : '-', new: h1 ? label(h1) : '-' });
  const spec = { op: 'kit', breed: b.spec, add: pend.spec.add, del: pend.spec.del };
  if (pend.spec.in_hands !== undefined) spec.in_hands = pend.spec.in_hands;
  gen().ops.opKit(ctx, spec);
  if (!unit) { const s = cur.byId.get('mp/' + b.spec); unit = { id: 'mp/' + b.spec, name: s ? s.name || '' : '', kind: 'soldier', army: b.army }; }
  const res = finish(ctx, game, mod, body, { unit, breed: b.spec, file: b.key, rows, names: [], kit: after, nameLang: N.lang, handover: kitHandover(pend.handover, N.names, D) });
  for (const e of res.errors) if (KIT_PLAIN[e.code]) e.msg = KIT_PLAIN[e.code] + ' (' + e.raw + ')';
  // lines of the inventory that do not fit and were not part of this edit: said, not refused (the game file may already be so)
  for (const l of after.notFit) res.warnings.push({ code: 'WARN_UNITS_KIT_NOFIT', msg: '"' + l.item + '": ' + l.count + ' find no free place in the grid; the game drops them.', raw: '' });
  if (res.written) KMEM.clear();
  return res;
}
// body {id, card} | {entity}, add [{item, count?, filled?, filling?, rounds?}], del [item], slots {<slot>: item | false}, write:
// a vehicle's box lines and masked slots through gen's vehkit op, a fixed place's weapon through gen's weapon op, on a mod copy of
// the vehicle file. Refused in plain words before gen runs: an unknown item, an item the slot does not take, a line a shared file
// gives, an edit that does not fit the grid
const VEH_PLAIN = { GEN_VEHKIT_ITEM_UNKNOWN: 'The game has no item of that name.', GEN_VEHKIT_ITEM_ABSENT: 'That item is not written in the vehicle\'s own file, so it cannot be removed here.',
  GEN_VEHKIT_ITEM_EXISTS: 'The vehicle already carries that item. Change its count instead.', GEN_VEHKIT_SLOT_EMPTY: 'Nothing is mounted in that slot by the vehicle\'s own file.',
  GEN_VEHKIT_MOUNT_COUNT: 'A mounted weapon is one item. Set its count to 1 first.', GEN_VEHKIT_NOT_SDL: 'The vehicle file could not be read as game text.',
  GEN_VEHKIT_NO_ENTITY: 'The vehicle file has no block to put the inventory in.', GEN_WEAPON_MISSING: 'The game has no weapon of that name.',
  GEN_WEAPON_AMBIGUOUS: 'More than one weapon file has that name. Pick the weapon from the list of the slot.', GEN_WEAPON_NO_PLACE: 'The vehicle file has no such weapon slot.',
  GEN_SET_ENTITY_UNKNOWN: 'The vehicle file was not found.' };
async function vehSet(ctx0, body, cur, game, mod, gid, unit) {
  const ent = vehEntity(cur, body); if (!ent) bad('This unit has no vehicle. Pick a vehicle first.');
  const K = kitLib(), D = await kitData(ctx0, game, gid, mod), N = await kitNames(ctx0, game, gid, mod, body.lang, D);
  const ctx = newCtx(game, mod, !body.write, gid), key = vehKey(ctx, ent);
  if (!key) bad('No vehicle file was found for "' + ent + '" (entity/../' + ent + '.def).');
  const V = K.readVehicle(k => ctx.read(k), key);
  if (!V.found) bad('The file ' + key + ' could not be read.');
  const pend = K.applyVehicle(V, { add: body.add, del: body.del, slots: body.slots }, vehAccepts(D));
  if (pend.why) bad(pend.why);
  const sp = pend.spec, box = sp.add.length || sp.del.length || Object.keys(sp.mount).length, fixed = Object.keys(sp.weapons);
  if (!box && !fixed.length) bad('Nothing to change: the vehicle already carries exactly this.');
  if ((sp.add.length || Object.values(sp.mount).some(Boolean)) && !(V.hasBox && V.box.w > 0 && V.box.h > 0))
    bad('This vehicle has no inventory (its files give it no box), so nothing can be put into it. The weapons fixed in its slots can still be swapped.');
  for (const a of sp.add) {
    if (!K.findItem(D.table, a.item)) bad('The game has no item named "' + a.item + '". Pick one from the list of the Add box (a missing item makes the game warn and may crash it).');
    const o = V.items.find(x => x.item === a.item);
    if (a.filling && !(o && o.filling && o.filling.tags === a.filling) && !K.findItem(D.table, a.filling)) bad('The game has no ammunition named "' + a.filling + '". Pick one from the list.');
  }
  const before = vehView(D, N.names, V, V, V.holders), after = vehView(D, N.names, V, pend, V.holders), rows = [];
  for (const l of after.notFit) if (pend.touched.includes(l.item))
    bad('"' + l.item + '" does not fit: ' + l.count + ' of ' + after.items[l.index].max + ' find no free place in the ' + V.box.w + ' x ' + V.box.h + ' grid, and the game drops what does not fit without a word. Remove something first, or lower the count.');
  const label = it => (body.showNames && it && it.name) || (it && it.item) || '', cnt = it => !it ? '0' : String(it.max);
  const load = it => !it || !it.loaded ? '0' : (it.rounds == null ? '?' : String(it.rounds)) + (it.loaded === 'ammo' ? ' x ' + ((body.showNames && it.ammoName) || it.ammo) : '');
  for (const d of sp.del) if (!sp.add.some(a => a.item === d)) { const o = before.items.find(x => x.item === d); rows.push({ field: 'item', part: label(o) || d, old: cnt(o), new: '0' }); }
  for (const a of sp.add) {
    const o = before.items.find(x => x.item === a.item), n = after.items.find(x => x.item === a.item);
    if (cnt(o) !== cnt(n)) rows.push({ field: 'item', part: label(n), old: cnt(o), new: cnt(n) });
    if (load(o) !== load(n)) rows.push({ field: 'loaded', part: label(n), old: load(o), new: load(n) });
  }
  for (const s of after.slots) {
    const o = before.slots.find(x => x.name === s.name), a = o && o.weapon, b = s.weapon;
    if ((a && a.item) !== (b && b.item)) rows.push({ field: 'slot', part: s.name, old: a ? label(a) : '-', new: b ? label(b) : '-' });
  }
  const entity = 'file:' + key;
  if (box) gen().ops.opVehKit(ctx, { entity, add: sp.add, del: sp.del, mount: sp.mount });
  for (const p of fixed) gen().ops.opWeapon(ctx, { entity, weapon: sp.weapons[p], place: p });
  const u = cur.byId.get(ent);
  const res = finish(ctx, game, mod, body, { unit: unit || { id: ent, name: u ? u.name || '' : '', kind: 'vehicle', army: u ? u.army : '' }, kind: 'vehicle', entity: ent, file: key, rows, names: [], kit: after, nameLang: N.lang });
  for (const e of res.errors) if (VEH_PLAIN[e.code]) e.msg = VEH_PLAIN[e.code] + ' (' + e.raw + ')';
  for (const l of after.notFit) res.warnings.push({ code: 'WARN_UNITS_KIT_NOFIT', msg: '"' + l.item + '": ' + l.count + ' find no free place in the grid; the game drops them.', raw: '' });
  if (res.written) KMEM.clear();
  return res;
}

// ---------- the look: the skin a soldier wears and the texture variant ("texmod") a model shows ----------
// Engine facts with their source lines: ./look.js. In short: a soldier wears the entity his file names with {skin "x"}; a model
// shows the texture files "<texture>#<variant>" when its def says {texmod "variant"}; a soldier has no such line of his own, he
// takes the one of his skin's def; in a multiplayer match the map's own variant replaces it when the model has files of that name.
// why codes (the page has the words, units.look.why.*): nobreed | many | inherited | form (the soldier file's skin line);
//   goh (a GoH soldier has no texmod line) | noskin | nodef | list (the def sets textures one by one) | manyLines | nomodel
const lookLib = () => require('./look');
const LOOK_ID = /^[a-z0-9_][a-z0-9_\-().]*$/;
// who a request is about, as kitRead reads it: -> { unit, b (a soldier file) | ent (a vehicle def name) | group (a squad: its soldiers) }
function lookWho(cur, body, gid) {
  let unit = null;
  if (body.id && !body.breed) {
    const u = unitOf(cur, String(body.id), body.card);
    unit = { id: u.id, name: u.name || '', kind: u.kind, army: u.army };
    if (u.kind !== 'soldier') {
      const ent = vehEntity(cur, body);
      if (ent) return { unit, ent };
      const m = buyModels(cur, { id: u.id, card: body.card });
      return { unit, group: m.models.filter(x => x.kind === 'soldier').map(x => ({ id: x.id, name: x.name, n: x.n })) };
    }
  } else if (body.entity && !body.breed) return { unit: null, ent: vehEntity(cur, body) };
  const b = kitBreed(body, gid, unit && unit.id);
  if (!unit) { const s = cur.byId.get('mp/' + b.spec); unit = { id: 'mp/' + b.spec, name: s ? s.name || '' : '', kind: 'soldier', army: b.army }; }
  return { unit, b };
}
function lookVariants(L, c, key, goh, D) { const v = L.variantsOf(c, key, goh, D); return { model: v.mdl, textures: v.textures, variants: v.variants }; }
// the texmod part of a def for the page: current, the variants its model's files have, whether this page changes it
function lookTexmod(L, c, key, goh) {
  const D = L.defLook(c, key);
  if (!D.found) return { supported: true, current: '', variants: [], canChange: false, why: 'nodef' };
  const V = lookVariants(L, c, key, goh, D);
  const why = D.lines > 1 ? 'manyLines' : D.form === 'list' ? 'list' : !D.extension ? 'nomodel' : '';
  return Object.assign({ supported: true, current: D.texmod, hasLine: D.lines > 0, aliases: D.aliases, canChange: !why, why, calls: D.calls,
    known: !D.texmod || V.variants.some(v => v.name === D.texmod) }, V);
}
// body {id, card} | {breed, army?, period?} | {entity}: what decides the look of that soldier or vehicle
//   a soldier -> { unit, kind 'soldier', breed, file, from, target, skin {name, known, file, group, sub, wornBy, canChange, why},
//                  texmod {supported, current, variants [{name, textures, meshes}], canChange, why, sharedWith} }
//   a vehicle -> { unit, kind 'vehicle', entity, file, from, target, texmod {.., aliases [[name, variant]] of its {TexMods}} }
//   a squad   -> { unit, soldiers } (pick one)
async function lookRead(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, false), gid = gidOf(ctx0, body, game), goh = gid === 'goh';
  const { cur } = await both(ctx0, game, mod, true);
  const w = lookWho(cur, body, gid), L = lookLib(), c = kitCtx(cur, ctx0, game, mod, gid);
  if (w.group) return { unit: w.unit, soldiers: w.group };
  if (w.ent) {
    const key = vehKey(c, w.ent);
    if (!key) bad('No vehicle file was found for "' + w.ent + '" (entity/../' + w.ent + '.def).');
    const u = cur.byId.get(w.ent);
    return { unit: w.unit || { id: w.ent, name: u ? u.name || '' : '', kind: 'vehicle', army: u ? u.army : '' }, kind: 'vehicle', entity: w.ent, target: w.ent, file: key,
      from: c.scanDisk().has(key) ? 'mod' : 'game', goh, texmod: lookTexmod(L, c, key, goh) };
  }
  const b = w.b, text = c.readStr(b.key);
  if (text == null) bad('No soldier file was found for ' + b.spec + ' (' + b.key + ').');
  const bs = L.breedSkin(text);
  // the skin line comes from an include or a macro call: shown (and its textures with it), changed in the shared file only
  if (bs.why === 'inherited') { const fs2 = L.breedSkin(kitFlat(c, b.key) || ''); if (fs2.skin) bs.skin = fs2.skin; }
  const sk = bs.skin ? L.skinList(c).byName.get(bs.skin) : null;
  const users = bs.skin && !goh ? (L.skinUsers(c).get(bs.skin) || []) : null;
  const skin = { name: bs.skin, known: !!sk, file: sk ? sk.file : null, group: sk ? sk.group : '', sub: sk ? sk.sub : '', wornBy: users ? users.length : null, canChange: bs.canChange, why: bs.why };
  let texmod;
  // GoH as the AS2 games: the {texmod} line of the skin's def (a copy beside it in the mod; vanilla GoH skins have none, look.js [I][T]),
  // plus the seasons the multiplayer maps give (map/multi/<map>/<mode>.info {texMod x}, look.js gohSeasons [V data])
  if (!bs.skin) texmod = { supported: true, current: '', variants: [], canChange: false, why: 'noskin' };
  else if (!sk) texmod = { supported: true, current: '', variants: [], canChange: false, why: 'nodef' };
  else { texmod = lookTexmod(L, c, sk.file, goh); if (!bs.canChange) { texmod.canChange = false; texmod.why = texmod.why || bs.why; } }
  if (goh) texmod.season = L.gohSeasons(c);
  return { unit: w.unit, kind: 'soldier', breed: b.spec, army: b.army, period: b.period || undefined, file: b.key, from: c.scanDisk().has(b.key) ? 'mod' : 'game',
    target: 'breed:mp/' + b.spec, goh, skin, texmod };
}
// body {lang?}: every skin a soldier can wear -> { skins [{skin, group, sub, file, texmod, worn, by}], groups [{group, n}] }
//   texmod = the variant the skin's def names ('' = none); worn = how many multiplayer soldiers wear it; by = the first three
//   of them [{id (path under set/breed/mp), name (the game's name, '' = none)}]. Kept per catalogue
async function lookSkins(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, false), gid = gidOf(ctx0, body, game);
  const { cur } = await both(ctx0, game, mod, true);
  if (cur._lookSkins) return cur._lookSkins;
  const L = lookLib(), c = kitCtx(cur, ctx0, game, mod, gid), S = L.skinList(c), U = L.skinUsers(c);
  const skins = S.skins.map(s => {
    const u = U.get(s.skin) || [], by = u.slice(0, 3).map(p => { const x = cur.byId.get('mp/' + p); return { id: p, name: (x && x.name) || '' }; });
    // GoH has thousands of skins and no vanilla one carries a texmod line (look.js): only the mod's own defs are opened
    return { skin: s.skin, group: s.group, sub: s.sub, file: s.file, texmod: gid === 'goh' && !c.inMod(s.file) ? '' : (L.defLook(c, s.file).texmod || ''), worn: u.length, by };
  });
  return (cur._lookSkins = { skins, groups: S.groups, total: skins.length });
}
const LOOK_PLAIN = { GEN_WEAR_INHERITED: 'This soldier file takes its lines from another file and has no skin line of its own, so the skin is not changed here.',
  GEN_WEAR_UNKNOWN: 'The game has no skin of that name.', GEN_WEAR_MANY: 'The soldier file has more than one skin line. Leave one in the file first.',
  GEN_WEAR_BREED_UNKNOWN: 'The soldier file was not found.', GEN_TEXMOD_NO_EXTENSION: 'The file does not name its model itself, so the texture variant line cannot be placed in it.',
  GEN_TEXMOD_FORM: 'The file sets its textures one by one. That form is not changed here.', GEN_TEXMOD_MANY: 'The file has more than one texture variant line. Leave one in the file first.',
  GEN_TEXMOD_ABSENT: 'The file has no texture variant line of its own to take out.', GEN_TEXMOD_EXISTS: 'A file of that name exists already.' };
const LOOK_WHY = { nobreed: 'The file is not a soldier file the game reads (no {breed} block).', many: LOOK_PLAIN.GEN_WEAR_MANY, inherited: LOOK_PLAIN.GEN_WEAR_INHERITED,
  form: 'The skin line of the soldier file names no skin.', list: LOOK_PLAIN.GEN_TEXMOD_FORM, manyLines: LOOK_PLAIN.GEN_TEXMOD_MANY, nomodel: LOOK_PLAIN.GEN_TEXMOD_NO_EXTENSION };
// body {id, card} | {breed} | {entity}, skin? (a skin name), texmod? (a variant name, or false / '' for none), write:
//   a soldier: the {skin} line of his file through gen's wear op. A texture variant is a line of the skin's def, and that def is
//     worn by other soldiers too, so it is never edited: the soldier is pointed to a def of the same model that shows the variant
//     (one that exists, as vanilla ger2_officer beside ger_officer; else a new def beside it through gen's texmod op, as: name)
//   a vehicle: the {texmod} line of its own def (a mod copy) through gen's texmod op
// Refused in plain words before gen runs: an unknown skin, a variant the model has no texture files for, a shared line
async function lookSet(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, true), gid = gidOf(ctx0, body, game), goh = gid === 'goh';
  guardWrite(gid, game, mod, body);
  const { cur } = await both(ctx0, game, mod);
  const w = lookWho(cur, body, gid), L = lookLib();
  if (w.group) bad((w.unit.name || w.unit.id) + ' is not one soldier. Pick one of its soldiers first.');
  const wantSkin = body.skin == null || String(body.skin).trim() === '' ? null : lc(String(body.skin).trim());
  const wantTex = body.texmod === undefined || body.texmod === null ? undefined : (body.texmod === false || /^(|none|-)$/i.test(String(body.texmod).trim()) ? '' : lc(String(body.texmod).trim()));
  if (wantSkin == null && wantTex === undefined) bad('Nothing to change. Pick another skin or another texture variant first.');
  if (wantSkin != null && !LOOK_ID.test(wantSkin)) bad('Pick a skin from the list.');
  if (wantTex && !/^[a-z0-9_][a-z0-9_.\-]*$/.test(wantTex)) bad('Pick a texture variant from the list.');
  const ctx = newCtx(game, mod, !body.write, gid), rows = [];
  const has = (key, D, v) => { const V = L.variantsOf(ctx, key, goh, D).variants; if (!V.some(x => x.name === v)) bad('The model has no texture files for "' + v + '"' + (V.length ? '. It has: ' + V.map(x => x.name).join(', ') + '.' : ' and no other variant either.') + ' The game drops a variant the model has no files for.'); };
  let out;
  if (w.ent) {
    if (wantSkin != null) bad('A vehicle wears no skin. Only its texture variant can be changed here.');
    const key = vehKey(ctx, w.ent);
    if (!key) bad('No vehicle file was found for "' + w.ent + '" (entity/../' + w.ent + '.def).');
    const D = L.defLook(ctx, key);
    if (!D.found) bad('The file ' + key + ' could not be read.');
    if (D.lines > 1) bad(LOOK_WHY.manyLines); if (D.form === 'list') bad(LOOK_WHY.list);
    if (wantTex === D.texmod) bad('Nothing to change: the vehicle already shows ' + (wantTex ? '"' + wantTex + '"' : 'its plain textures') + '.');
    if (wantTex) has(key, D, wantTex);
    if (wantTex && !D.lines && !D.extension) bad(LOOK_WHY.nomodel);
    rows.push({ field: 'texmod', old: D.texmod || '-', new: wantTex || '-' });
    gen().ops.opTexmod(ctx, { entity: 'file:' + key, variant: wantTex || false });
    const u = cur.byId.get(w.ent);
    out = { unit: w.unit || { id: w.ent, name: u ? u.name || '' : '', kind: 'vehicle', army: u ? u.army : '' }, kind: 'vehicle', entity: w.ent, file: key, rows, names: [], look: { texmod: wantTex } };
  } else {
    const b = w.b, text = ctx.readStr(b.key);
    if (text == null) bad('No soldier file was found for ' + b.spec + ' (' + b.key + ').');
    const bs = L.breedSkin(text);
    if (!bs.canChange) bad(LOOK_WHY[bs.why] || 'The skin line of this soldier file is not changed here.');
    let target = wantSkin || bs.skin, newDef = null, tex;
    if (wantSkin && !L.skinKey(ctx, wantSkin)) bad('The game has no skin named "' + wantSkin + '" (no entity/humanskin/../' + wantSkin + '.def). Pick one from the list: a missing skin leaves the soldier a bare skeleton.');
    if (wantTex !== undefined) {
      if (!target) bad('This soldier has no skin. Pick a skin first.');
      const key = L.skinKey(ctx, target);
      if (!key) bad('The skin "' + target + '" has no file in the game data, so its texture variant cannot be read.');
      const D = L.defLook(ctx, key);
      if (D.lines > 1) bad(LOOK_WHY.manyLines); if (D.form === 'list') bad(LOOK_WHY.list);
      tex = D.texmod;
      if (wantTex !== D.texmod) {
        if (wantTex) has(key, D, wantTex);
        const sib = L.siblingWith(ctx, key, D, wantTex);
        if (sib) target = sib;
        else {
          if (!D.extension) bad(LOOK_WHY.nomodel);
          newDef = L.freeName(ctx, key.slice(key.lastIndexOf('/') + 1, -4), D.texmod, wantTex);
          gen().ops.opTexmod(ctx, { entity: 'file:' + key, variant: wantTex || false, as: newDef });
          target = newDef;
        }
        rows.push({ field: 'texmod', old: D.texmod || '-', new: wantTex || '-' });
        tex = wantTex;
      }
    }
    if (target !== bs.skin) { rows.unshift({ field: 'skin', old: bs.skin || '-', new: target }); gen().ops.opWear(ctx, { breed: b.spec, skin: target }); }
    if (!rows.length) bad('Nothing to change: the soldier already looks like this.');
    out = { unit: w.unit, kind: 'soldier', breed: b.spec, file: b.key, rows, names: [], look: { skin: target, texmod: tex }, newDef };
  }
  const res = finish(ctx, game, mod, body, out);
  for (const e of res.errors) if (LOOK_PLAIN[e.code]) e.msg = LOOK_PLAIN[e.code] + ' (' + e.raw + ')';
  if (res.written) KMEM.clear();
  return res;
}

// ---------- the line-up picture of a buy (every soldier and vehicle in one 3D scene) ----------
// same body as /models; ./lineup (built apart from this file) lays the models out: -> {scene, figures, notes}
async function lineupOf(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, false), gid = gidOf(ctx0, body, game);
  const { cur } = await both(ctx0, game, mod, true);
  // look.only: one model alone, which need not be a card of the buy lists (a soldier opened by his file on the Equipment card)
  const only = body.look && typeof body.look === 'object' && body.look.only && /^(breed:)?[a-z0-9_ .()/-]+$/i.test(String(body.look.of || '')) ? String(body.look.of) : '';
  let m;
  try { m = buyModels(cur, body); } catch (e) { if (!only || !e || e.status !== 400) throw e; m = { models: [], vehicles: 0, men: 0 }; }
  // look {skin?, variant? (a name, or false = none), of?, only?, kind?}: the picture with another skin on the soldiers and a texture variant on the models (of = the id of
  // the one model it goes on; absent = every model of the buy). The Equipment card's look part asks it for what is picked
  const lk = body.look && typeof body.look === 'object' ? body.look : null;
  if (lk) {
    const skin = LOOK_ID.test(lc(lk.skin || '')) ? lc(lk.skin) : '', of = lc(lk.of || '');
    // variant false or '-' = shown with no variant, whatever the def says
    const variant = lk.variant === false || lk.variant === '-' ? '-' : /^[a-z0-9_][a-z0-9_.\-]*$/.test(lc(lk.variant || '')) ? lc(lk.variant) : '';
    m.models = m.models.map(x => (of && lc(x.id) !== of && lc(x.target) !== of ? x : Object.assign({}, x, x.kind === 'soldier' && skin ? { skin } : {}, variant ? { variant } : {})));
    // only: the picture of that one model alone, once (the 3D view in the Equipment card's look part)
    if (only) {
      let one = m.models.filter(x => lc(x.id) === of || lc(x.target) === of).slice(0, 1).map(x => Object.assign({}, x, { n: 1 }));
      if (!one.length) { const man = /^breed:/i.test(only) || lk.kind === 'soldier'; one = [Object.assign({ kind: man ? 'soldier' : 'vehicle', target: only, id: only, name: only.split('/').pop(), n: 1 }, man && skin ? { skin } : {}, variant ? { variant } : {})]; }
      m.models = one; m.men = one[0].kind === 'soldier' ? 1 : 0; m.vehicles = 1 - m.men;
    }
  }
  let L = null;
  try { L = require('./lineup'); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND' && /lineup/.test(String(e.message))) L = null; else throw e; }
  if (!L || typeof L.lineup !== 'function') bad('The picture of the whole buy is not part of this build yet. The list below still shows every model.');
  const r = (await L.lineup({ game, gid, mod, models: m.models, max: 40 })) || {};
  // brief: the page's own second ask (notes and which figure is which model); the picture itself went to the viewer
  return { scene: body.brief ? null : r.scene || null, figures: r.figures || [], notes: r.notes || [], vehicles: m.vehicles, men: m.men };
}

// ---------- describe a new unit in plain words ----------
// preview: words -> spec (built-in reader, or AI when asked and a key is set) -> gen ops in plan mode. write: the spec the preview
// returned comes back in the body, is checked again (allowed ops, real unit ids, schema) and run for real. The AI is never asked twice.
async function describeUnit(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, true), gid = gidOf(ctx0, body, game);
  // GoH: the reader picks from the GoH catalogue and the plan is one card copy (gohAdd); gun, armour, speed and turret words are
  // refused pieces with a plain reason each (describe.js gohPlan)
  if (gid === 'goh') return describeGoh(ctx0, body, game, mod, gid);
  const { cur, van } = await both(ctx0, game, mod);
  const { describe, ai, ops: O } = gen(), schema = gen().genMain.schema();
  const text = String(body.text || '').trim();
  if (text.length < 3) bad('Describe the unit in a few words, for example: fast Soviet heavy tank with a big gun, cost 900.');
  if (text.length > 600) bad('Keep the description under 600 characters.');
  const wantId = lc(body.id || '').trim();
  if (wantId && (!/^[a-z][a-z0-9_]{1,27}$/.test(wantId) || /_x+$/.test(wantId))) bad('The new id must be lower-case letters, digits and _, 2 to 28 characters, start with a letter and not end in _x.');
  const pctx = newCtx(game, mod, true, gid), gunFacts = n => O.gunFacts(pctx, n);
  let spec, plan, understood = [], assumed = [], by = 'offline', aiNote = null, model = null;
  if (body.write) {
    spec = body.spec;
    const why = ai.vet(spec, cur, schema, gid);
    if (why.length) bad('Press Preview again: the plan to write is not valid any more (' + why[0] + ').');
    plan = ai.planOf(spec, cur);
  } else {
    let r = null;
    if (body.ai) {
      const a = await ai.aiDescribe(text, cur, { schema, target: gid, gunFacts, id: wantId || undefined });
      if (a.ok) { r = a; by = 'ai'; model = a.model; } else aiNote = a.error;
    }
    if (!r) r = describe.describe(text, cur, { gunFacts, id: wantId || undefined });
    if (!r.ok) bad(r.error);
    const why = ai.vet(r.spec, cur, schema, gid);
    if (why.length) bad('That description could not be turned into a valid plan (' + why[0] + '). Try other words, or name the unit to start from.');
    spec = r.spec; plan = r.plan || ai.planOf(spec, cur); understood = r.understood; assumed = r.assumed;
  }
  if (!plan) bad('That description gave no new unit. Name a kind of unit (tank, gun, squad ..) or a unit to start from.');
  const cl = spec.ops.find(s => s.op === 'clone'), sq = spec.ops.find(s => s.op === 'squad');
  const like = cur.byId.get(lc(cl ? cl.entity : sq.like + '(' + sq.army + ')'));
  const brow = like && (like.bots || []).find(b => lc(b.army) === lc(like.army));
  const run = ctx => {
    const names = [], notes = [];
    for (const s of spec.ops) {
      if (findings(ctx).errors.length) break;   // a refused step: later steps would edit a unit that is not there
      if (s.op === 'clone') {
        O.opClone(ctx, { op: 'clone', entity: s.entity, as: s.as, copy_assets: true });
        if (like && like.wreck) {
          O.opClone(ctx, { op: 'clone', entity: s.entity + '_x', as: s.as + '_x' }); notes.push('wreck');
          try { if (ctx.keys(new RegExp('/' + reEsc(lc(s.entity)) + '_xx\.def$')).length) O.opClone(ctx, { op: 'clone', entity: s.entity + '_xx', as: s.as + '_xx' }); } catch (e) { /* no vfs */ }
        }
        if (s.name) names.push(namePlan(mod, null, 'desc/entity/' + lc(s.as), String(s.name)));
      } else if (s.op === 'gun') O.opGun(ctx, s);
      else if (s.op === 'weapon') O.opWeapon(ctx, s);
      else if (s.op === 'kitbash') O.opKitbash(ctx, s);
      else if (s.op === 'armor') O.opArmor(ctx, s);
      else if (s.op === 'set') O.opSet(ctx, s, ctx.out);
      else if (s.op === 'text') O.opText(ctx, s, { name: spec.name });
      else if (s.op === 'roster') { O.opRoster(ctx, Object.assign({}, s, { bots: body.bots ? false : undefined })); if (body.bots) vehicleBots(ctx, s.like, s.unit || s.entity, s.army); }
      else if (s.op === 'squad') O.opSquad(ctx, Object.assign({}, s, { bots: body.bots ? (brow && brow.priority != null ? String(brow.priority) : true) : undefined }));
    }
    return { names, notes };
  };
  // rehearsal: the whole plan runs for real into a throw-away folder first (the mod is read, not written). A plan run alone cannot
  // check edits on the unit the plan itself creates, and the copy step writes files at once: a late refusal would leave half a unit
  const stage = path.join(ctx0.tmpRoot || os.tmpdir(), 'units-describe-' + process.pid + '-' + Date.now());
  let stageErr = [];
  // the trial folder sees the game files only: a plan that starts from a unit the mod itself added is not rehearsed
  const inGame = spec.ops.every(s => (s.op !== 'clone' || van.byId.has(lc(s.entity))) && (s.op !== 'kitbash' || van.byId.has(lc(s.turret_from))));
  if (inGame) try {
    fs.mkdirSync(stage, { recursive: true });
    const sc = newCtx(game, stage, false, gid);
    run(sc); stageErr = findings(sc).errors;
  } catch (e) { stageErr = [{ code: 'UNITS_DESCRIBE_STAGE', msg: 'The trial run stopped: ' + e.message, raw: e.message }]; }
  finally { try { fs.rmSync(stage, { recursive: true, force: true }); } catch (e) { /* temp folder stays */ } }
  const ctx = newCtx(game, mod, !body.write || !!stageErr.length, gid);
  const { names, notes } = run(ctx);
  const F = { gun: 'gun', turret: 'turret', price: 'cost', men: 'members', 'top speed': 'speed' };
  const rows = [{ field: 'id', old: plan.base.id, new: plan.id }].concat((plan.changes || []).map(c => ({ field: /^armour/.test(c.what) ? 'armor' : F[c.what] || c.what, old: c.old, new: c.new })));
  const res = finish(ctx, game, mod, stageErr.length ? Object.assign({}, body, { write: false }) : body, { unit: { id: plan.id, kind: plan.kind, army: plan.base.army }, like: like ? brief(like) : null, rows, names, notes,
    where: { panel: true, army: plan.base.army, button: like && like.button, group: like && like.group, rank: like && like.level } });
  for (const e of stageErr) if (!res.errors.some(x => x.code === e.code && x.msg === e.msg)) res.errors.push(e);
  const codes = res.warnings.map(w => w.code);
  res.bots = { asked: !!body.bots, likeListed: !!brow, army: plan.base.army, row: brow || null, state: body.bots ? (brow && !codes.includes('WARN_GEN_BOTS_LIKE_ABSENT') ? 'added' : 'never') : (brow ? 'missed' : 'never') };
  if (cl) res.info = res.info.filter(i => i.code !== 'CLONE_MODEL_REF');   // the described unit gets its own model copy; that line is about the wreck copies
  res.rehearsed = inGame;
  res.described = { by, model, aiNote, understood, assumed, plan, kitbash: spec.ops.some(s => s.op === 'kitbash'), vehicle: !!cl };
  res.spec = spec;
  return res;
}

// GoH describe: words -> one card copy over the GoH catalogue (preview, then the same spec written; it is checked again at write).
// The built-in reader only: the AI path knows the AS2 ops. Writes go through gohAdd, so the write guard and card rules are the Add ones [T]
async function describeGoh(ctx0, body, game, mod, gid) {
  if (body.write) guardWrite(gid, game, mod, body);
  const { cur } = await both(ctx0, game, mod);
  const text = String(body.text || '').trim();
  if (text.length < 3) bad('Describe the unit in a few words, for example: German medium tank, cost 300, called Panzer Custom.');
  if (text.length > 600) bad('Keep the description under 600 characters.');
  const wantId = lc(body.id || '').trim();
  if (wantId && (!/^[a-z][a-z0-9_]{1,27}$/.test(wantId) || /_x+$/.test(wantId))) bad('The new id must be lower-case letters, digits and _, 2 to 28 characters, start with a letter and not end in _x.');
  let spec, plan, understood = [], assumed = [], refused = [];
  if (body.write) {
    spec = body.spec;
    const op = spec && spec.goh && Array.isArray(spec.ops) && spec.ops.length === 1 ? spec.ops[0] : null;
    const ok = op && op.op === 'gohcard' && cur.byId.has(lc(op.like)) && /^[a-z][a-z0-9_]{1,40}$/.test(String(op.id || '')) && GOH_PERIODS.includes(lc(op.period))
      && (op.price == null || (Number.isFinite(+op.price) && +op.price >= 0)) && (!op.members || (Array.isArray(op.members) && op.members.every(m => /^[a-z0-9_]+:\d{1,2}$/i.test(String(m)))));
    if (!ok) bad('Press Preview again: the plan to write is not valid any more (not one Gates of Hell card copy of a game unit).');
    plan = null;
  } else {
    if (body.ai) assumed.push('the AI reader knows the Assault Squad 2 plan form only: the built-in reader was used');
    const r = gen().describe.describe(text, cur, { goh: true, id: wantId || undefined, gunFacts: require('../../../gen/lib/describe-gohgun').factsOf(newCtx(game, mod, true, gid)) });
    if (!r.ok) bad(r.error);
    spec = r.spec; plan = r.plan; understood = r.understood; assumed = assumed.concat(r.assumed); refused = r.refused || [];
  }
  const op = spec.ops[0], like = unitOf(cur, op.like, op.card);
  if (!like.buyable) bad('Pick a unit that is in the buy panel to copy.');
  const ctx = newCtx(game, mod, !body.write, gid);
  const res = await gohBots(ctx0, game, mod, body, like, gohAdd(ctx, game, mod, Object.assign({}, body, { period: op.period, bots: !!body.bots }), cur, like, op.id, op.name ? String(op.name) : '', op.price == null ? null : +op.price, { members: op.members, armor: op.armor, speed: op.speed, gun: op.gun, refused }));
  res.described = { by: 'offline', model: null, aiNote: null, understood, assumed, plan, refused, goh: true, kitbash: false, vehicle: false };
  res.rehearsed = false;
  res.spec = spec;
  return res;
}

// ---------- balance ----------
async function compare(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, true);
  const { van, cur } = await both(ctx0, game, mod);
  const rows = [];
  for (const u of cur.units) {
    if (!u.buyable) continue;
    const v = vanOf(van, u);   // GoH: the same period card, not the last copy of the id
    const G = manyOf(u) ? { many: 1, brings: bringsOf(cur, u) } : {};
    if (!v) { rows.push({ id: u.id, ...(u.card ? { card: u.card } : {}), name: u.name, army: u.army, kind: u.kind, status: 'new', cost: [null, u.cost], level: [null, u.level], charge: [null, u.charge], fore: [null, u.fore], armor: [null, armourLine(u)], ...G }); continue; }
    const A = armourLine(u), B = armourLine(v), aj = JSON.stringify(A) !== JSON.stringify(B);
    const ch = ['cost', 'level', 'charge', 'fore'].some(k => u[k] !== v[k]) || aj || (u.name || '') !== (v.name || '') || u.crew !== v.crew;
    if (ch) rows.push({ id: u.id, ...(u.card ? { card: u.card } : {}), name: u.name, oldName: v.name !== u.name ? v.name : undefined, army: u.army, kind: u.kind, status: 'changed', cost: [v.cost, u.cost], level: [v.level, u.level], charge: [v.charge, u.charge], fore: [v.fore, u.fore], armor: [B, A], crew: [v.crew, u.crew], ...G });
  }
  return { rows, modUnits: cur.units.filter(u => u.buyable).length, vanillaUnits: van.units.filter(u => u.buyable).length };
}
async function armyPrice(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, true), gid = gidOf(ctx0, body, game);
  guardWrite(gid, game, mod, body);
  const { cur } = await both(ctx0, game, mod);
  const p = Number(body.percent);
  if (!isFinite(p) || p < -90 || p > 500 || p === 0) bad('Type a percent between -90 and 500 (for example 10 for 10% more expensive, -20 for 20% cheaper).');
  const army = lc(body.army || ''), kind = body.kind || 'all';
  const pick = cur.units.filter(u => u.buyable && u.cost != null && lc(u.army) === army && (kind === 'all' || u.kind === kind));
  if (!pick.length) bad('No units with a price for that army and kind.');
  const ctx = newCtx(game, mod, !body.write, gid), rows = [], skipped = [];
  // the price is edited in place on the card's own line(s), not through the gen card op: stock cards sit where that op
  // does not look (storm_mech_<army> in squads.set, pz3m_ger2 with s(ger) in vehicles_ger2.set) and the catalogue's
  // cardFile of a call card (how_a(rus) ...) is the define in vehicles.set, while the priced call line is in
  // vehicles_<army>.set. So: the card file first, then every units/*.set, first block or line that has a cost field.
  // GoH: the lists sit in period folders (units/<period>/units_<army>.set), so those are walked too
  const unitKeys = ctx.keys(ctx.goh ? /^resource\/set\/multiplayer\/units\/(?:[^/]+\/)?[^/]+\.set$/ : /^resource\/set\/multiplayer\/units\/[^/]+\.set$/);
  const locate = u => {
    for (const key of [lc(u.cardFile || ''), ...unitKeys]) {
      if (!key) continue;
      const c = cardBlock(ctx, Object.assign({}, u, { cardFile: key }), key !== lc(u.cardFile || ''));
      if (c && hasField(c.text, 'cost')) return c;
    }
    return null;
  };
  for (const u of pick) {
    // GoH: u.cost is the buy price (own cost + members, GHGPL-10); the card holds only its own cost(N), which is what changes
    const base = ctx.goh && u.ownCost != null ? u.ownCost : u.cost;
    const st = (u.res || 'mp') === 'mp' ? 5 : 1, nv = Math.max(0, Math.round(base * (1 + p / 100) / st) * st);   // special points are small numbers: whole points, not fives
    if (nv === base) continue;
    const c = locate(u), t = c && setField(c.text.split('\n').join(c.eol), 'cost', String(nv));
    if (!t) { skipped.push(u.id); ctx.err('WARN_UNITS_PRICE_SKIPPED', `no card with a cost field for ${u.id} (looked in ${u.cardFile || '?'} and every units/*.set); its price is left as it is`, u.id); continue; }
    c.lines.splice(c.i, c.j - c.i + 1, ...t.split(c.eol));
    ctx.write(c.key, c.lines.join(c.eol));
    rows.push({ id: u.id, name: u.name, kind: u.kind, res: u.res || 'mp', old: base, new: nv });
  }
  if (ctx.goh && rows.length) ctx.info('UNITS_GOH_OWN_COST', 'GoH: the percent changes each card\'s own cost(N); a squad\'s buy price also adds its members (GHGPL-10)', army);
  return finish(ctx, game, mod, body, { army, kind, percent: p, rows, count: rows.length, skipped });
}
async function hints(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, false);
  const { cur } = await both(ctx0, game, mod);
  const u = unitOf(cur, body.id, body.card), A = armourLine(u), dmg = u.gun && +u.gun.damage;
  const pool = cur.units.filter(x => x.buyable && x.cost != null && x.kind === u.kind && x.id !== u.id && (x.res || 'mp') === (u.res || 'mp'));   // prices in another resource are on another scale
  const dist = x => {
    if (u.kind === 'squad') return Math.abs((x.crew || 0) - (u.crew || 0)) * 10 + (lc(x.army) === lc(u.army) ? 0 : 3);
    const B = armourLine(x); let d = 0;
    d += A && B ? Math.abs(A.front - B.front) + Math.abs(A.side - B.side) / 2 : 50;
    d += dmg && x.gun && +x.gun.damage ? Math.abs(dmg - x.gun.damage) / 2 : 20;
    d += lc(x.army) === lc(u.army) ? 0 : 5;
    return d;
  };
  const near = pool.map(x => ({ x, d: dist(x) })).sort((a, b) => a.d - b.d).slice(0, 6).map(o => Object.assign(brief(o.x, cur), { damage: o.x.gun ? o.x.gun.damage : null, crew: o.x.crew }));
  const costs = near.map(n => n.cost).sort((a, b) => a - b);
  const med = costs.length ? costs[Math.floor(costs.length / 2)] : null;
  return { unit: Object.assign(brief(u, cur), { damage: dmg || null, crew: u.crew }), similar: near, low: costs[0] == null ? null : costs[0], high: costs.length ? costs[costs.length - 1] : null, median: med };
}

// ---------- recipes ----------
async function recipe(ctx0, body) {
  const game = gameOf(ctx0, body), mod = modOf(body, game, true), gid = gidOf(ctx0, body, game);
  guardWrite(gid, game, mod, body);
  const { cur } = await both(ctx0, game, mod);
  const ctx = newCtx(game, mod, !body.write, gid);
  if (body.recipe === 'squad') {
    const u = unitOf(cur, body.id, body.card);
    if (u.kind !== 'squad') bad('Pick a squad (an infantry group), not a vehicle.');
    const mem = u.members.find(m => lc(m.breed) === lc(body.breed) || lc(tailOf(m.breed)) === lc(tailOf(body.breed))) || u.members.find(m => m.n > 1) || u.members[0];
    if (!mem) bad('This squad has no members to count.');
    const n = Number(body.count);
    if (!Number.isInteger(n) || n < 1 || n > 30) bad('Type a whole number of soldiers between 1 and 30.');
    const rows = editCard(ctx, u, { ['member:' + mem.breed]: String(n) });
    if (ctx.goh) {
      // GoH squad price = own cost + count x member cost x squad_cost_factor (GHGPL-10 [V]): more men, dearer squad
      const sold = cur.byId.get(lc('mp/' + u.army + '/' + (u.period ? u.period + '/' : '') + tailOf(mem.breed)));
      ctx.info('UNITS_GOH_SQUAD_PRICE', `GoH: the squad's price is its own cost(${u.cost == null ? '?' : u.cost}) plus every member's cost x squad_cost_factor (GHGPL-10); each added ${tailOf(mem.breed)} adds ${sold && sold.cost != null ? sold.cost : '?'} x squad_cost_factor`, u.id);
    }
    const gc = ctx.goh ? cardBlock(ctx, u) : null;
    const key = ctx.goh ? 'c?(' + tailOf(mem.breed) + ':N) in ' + (gc && gc.call ? '("' + gc.call + '" name(' + u.id.replace(/\(.*$/, '') + ') side(' + u.army + ') period(' + u.period + ')) in ' + gc.key : '{"' + u.id + '" ..}') :'c?(' + mem.breed + ':N) in name(' + u.id.replace(/\(.*$/, '') + ') side(' + u.army + ')';
    return finish(ctx, game, mod, body, { recipe: 'squad', unit: brief(u), file: gc && gc.call ? gc.key : u.cardFile, key, members: u.members, rows: rows.map(r => Object.assign(r, { field: 'members ' + (ctx.goh ? tailOf(mem.breed) : mem.breed) })), where: whereInGame(u) });
  }
  if (body.recipe === 'range') {
    const w = String(body.weapon || '').trim().toLowerCase();
    if (!/^[a-z0-9_ .-]+$/.test(w)) bad('Type the weapon name (for example mosin).');
    let keys = []; try { keys = ctx.keys(new RegExp('^resource/set/stuff/.*/' + reEsc(w) + '$')); } catch (e) { bad(e.message); }
    if (!keys.length) bad('No weapon file named "' + w + '" was found (look in the stats panel: Main gun or the soldier\'s rifle).');
    const key = keys[0], text = ctx.read(key).toString('latin1');
    const vals = String(body.range || '').trim().split(/[\s,;/]+/).filter(Boolean).map(Number);
    if (!vals.length || vals.length > 2 || vals.some(v => !(v > 0 && v < 2000))) bad('Type the range as one or two numbers (for example 80 90).');
    const root = (/^\s*\{\s*([A-Za-z_]\w*)/m.exec(text.replace(/^\s*;.*$/gm, '')) || [])[1];
    const own = /\{\s*range\s+([^{}]*)\}/i.exec(text);
    let old = own ? own[1].trim() : null, from = own ? key : null;
    if (!own) { // inherited: {from "pattern rifle"} -> rifle.pattern
      const pf = /\{\s*from\s+"pattern\s+([^"]+)"/i.exec(text);
      if (pf) { try { const pk = ctx.keys(new RegExp('/' + reEsc(lc(pf[1])) + '\\.pattern$'))[0]; const pt = pk && ctx.read(pk).toString('latin1'); const m = pt && /\{\s*range\s+([^{}]*)\}/i.exec(pt); if (m) { old = m[1].trim(); from = pk; } } catch (e) { /* keep */ } }
    }
    gen().ops.opSet(ctx, { op: 'set', rows: [{ entity: 'file:' + key, path: (root || 'from') + '/range', value: vals.join(' '), op: 'add' }] }, ctx.out);
    return finish(ctx, game, mod, body, { recipe: 'range', weapon: w, file: key, key: '{range ' + vals.join(' ') + '}', inheritedFrom: from && from !== key ? from : null, rows: [{ field: 'range', old: old || '?', new: vals.join(' ') }] });
  }
  bad('Unknown recipe.');
}

// ---------- routes ----------
async function status(url, body, ctx) {
  const q = new URL(url, 'http://x').searchParams;
  const gid = gidOf(ctx, null), g = gid === 'goh' ? ((ctx.curDir && ctx.curDir()) || null) : ((ctx.game && ctx.game()) || null);
  let mod = q.get('mod') || '', modOk = false, why = '';
  if (mod) { try { modOf({ mod }, g, true); modOk = true; } catch (e) { why = e.message; } }
  let ai = { ok: false, why: '' }; try { ai = gen().ai.available(); } catch (e) { ai.why = e.message; }
  const out = { ai, game: g, mod, modOk, why, hasModInfo: modOk && fs.existsSync(path.join(path.resolve(mod), 'mod.info')) };
  if (gid !== 'as64') out.gid = gid;   // as64 answers as before
  if (gid === 'goh' && modOk) { const w = require('../../../lib/writeguard').refuseWrite(path.resolve(mod), { game: g }); if (w) out.readOnly = String(w).replace(/^refused:\s*/, ''); }
  return out;
}
// JOBS: a request that writes into the mod (write: true) says so: the footer asks twice before stopping it
const wrap = fn => async (url, body, ctx) => { if (body && body.write && ctx && ctx.job) ctx.job.writes = true; return fn(ctx, body || {}); };
// the page's search index (searchKit of the search box): every unit of the catalogue in a few fields, made once per catalogue
function unitIndex(cat) {
  if (cat._ix) return cat._ix;
  const units = cat.units.map(u => { const o = { id: u.id, name: u.name || '', army: u.army || '', kind: u.kind || '' }; if (u.buyable) o.buyable = true; if (u.card) o.card = u.card; if (u.period) o.period = u.period; return o; });
  return (cat._ix = { units, armies: sxOf(cat).armies.slice() });
}
// the weapon files the range recipe can change (resource/set/stuff/<folder>/../<name>, no .pattern): name and its stuff folder, made once
// per catalogue from the same read-only view of game + mod as the gun numbers
function weaponIndex(cat, game, mod, tmpRoot) {
  if (cat._weap) return cat._weap;
  const pctx = newCtx(game, mod || path.join(tmpRoot || os.tmpdir(), 'units-none'), true, cat._gid), seen = new Map();
  for (const k of pctx.keys(/^resource\/set\/stuff\//)) {
    const name = k.split('/').pop(); if (!/^[a-z0-9_ .-]+$/.test(name) || /\.pattern$/.test(name)) continue;
    if (!seen.has(name)) seen.set(name, { name, group: k.split('/')[3] || '' });
  }
  return (cat._weap = { weapons: [...seen.values()].sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : a.name < b.name ? -1 : 1)) });
}
module.exports = {
  routes: {
    'GET /api/x/units/status': status,
    'POST /api/x/units/search': wrap(async (ctx, b) => { const game = gameOf(ctx, b), mod = modOf(b, game, false); const { cur } = await both(ctx, game, mod, true); return search(cur, String(b.q || ''), { kind: b.kind, army: b.army, all: !!b.all, limit: b.limit }); }),
    'POST /api/x/units/index': wrap(async (ctx, b) => { const game = gameOf(ctx, b), mod = modOf(b, game, false); const { cur } = await both(ctx, game, mod, true); return unitIndex(cur); }),
    'POST /api/x/units/weapons': wrap(async (ctx, b) => { const game = gameOf(ctx, b), mod = modOf(b, game, false); const { cur } = await both(ctx, game, mod, true); return weaponIndex(cur, game, mod, ctx.tmpRoot); }),
    'POST /api/x/units/stats': wrap(async (ctx, b) => { const game = gameOf(ctx, b), mod = modOf(b, game, false); const { van, cur } = await both(ctx, game, mod, true); return stats(cur, van, b.id, gunFactsOf(cur, game, mod, ctx.tmpRoot), b.card); }),
    'POST /api/x/units/change': wrap(change),
    'POST /api/x/units/add': wrap(add),
    'POST /api/x/units/buy': wrap(buy),
    'POST /api/x/units/models': wrap(async (ctx, b) => { const game = gameOf(ctx, b), mod = modOf(b, game, false); const { cur } = await both(ctx, game, mod, true); return buyModels(cur, b); }),
    'POST /api/x/units/lineup': wrap(lineupOf),
    'POST /api/x/units/kit': wrap(kitRead),
    'POST /api/x/units/kit/items': wrap(kitItems),
    'POST /api/x/units/kit/set': wrap(kitSet),
    'POST /api/x/units/kit/slot': wrap(kitSlot),
    'POST /api/x/units/look': wrap(lookRead),
    'POST /api/x/units/look/skins': wrap(lookSkins),
    'POST /api/x/units/look/set': wrap(lookSet),
    'POST /api/x/units/describe': wrap(describeUnit),
    'POST /api/x/units/compare': wrap(compare),
    'POST /api/x/units/armyprice': wrap(armyPrice),
    'POST /api/x/units/hints': wrap(hints),
    'POST /api/x/units/recipe': wrap(recipe),
  },
  // _forget(): what this page keeps in memory goes (a restart, for tests); the store keeps its entries
  _t: { _forget() { MEM.clear(); SEEN.clear(); ECO.clear(); KMEM.clear(); }, search, unitIndex, weaponIndex, modSig, forgetSig, norm, lev, numVal, armorJob, modOf, namePlan, gunLine, canon, gidOf, gohPlaces, cardBlock },
  // shared with tools/balance (bulk change): the same guards, catalogue and edit helpers as this page.
  // gidOf(ctx, body, game) = the game id; newCtx(game, mod, plan, gid) (gid absent: goh for a GoH folder, else as64); guardWrite
  prep,
  wrap,
  lib: { lineupOf, kitCtx, lookSkins, texvar: () => require('./texvar'), modTree, storeOf, prepWhere, worst, CAT_AREAS, gen, gameOf, modOf, both, catalogue, newCtx, finish, findings, editCard, armorJob, brief, reEsc, bad, gidOf, guardWrite, notIn },
};
