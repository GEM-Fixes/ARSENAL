// GUI-EXT missions: the Missions page (Maps & Missions > Missions; AS64, MoW:AS2 and GoH, see Games below). A mission is a map's <mode>.mi file: its flags, start points
// and triggers. Pick a map (the Maps page's list job and cache), see each mode's flags, start points and bots, add a mode to a map in
// my mod (maps addMode: preview, then write, then milint), see what my mod changed in its missions (misdiff, read only), check (milint
// mission codes on the Maps check route). Facts come from the map and mission recipes' readers; writes go only to the mod folder picked.
// Routes: GET facts, GET mine, POST add {write}, POST diff; sp/* = the card 'Make a single-player mission' (sp.js: spmis as a library).
// Games (the request's game: ctx.gameId/exe/kind/curDir; nothing sent = AS64, everything as before):
//   as64     the readers of the map recipe (one vfs cache per AS2 folder, as64 first), misdiff with no --exe
//   mowas2   the same pages and forms (the AS2 install, shared); the map recipe's readers on the view {dir, exe mowas_2} (no as64/core,
//            a 3.301 mod left out as mowas_2.exe leaves it out; the recipe's cache is keyed by exe); misdiff --exe mowas_2
//   goh      the GoH install (ctx.curDir); the map recipe's readers on {dir, exe goh}. GoH maps have no map.info [V]: players per mode from <mode>.info
//            {maxPlayers}; flags = map points shown on the map (visor MapPoint; each names its zone polygon by zoneId, GHMAP-03) [I];
//            start points = visor SpawnPoint as in AS2; modes sorted by the GoH registry (gohweb mission/goh-game-mode-registry [V]);
//            no MAP-23 / MIS-65 / MIS-62 warnings (AS2 rows). Mod folder: anywhere but the GoH root, Workshop, or inside the GoH
//            install outside <GoH>/mods (gohMod). Add a mode: gohmode.js (gohAdd): a mode of the same engine class copied byte for
//            byte (battle_zones armored_warfare battle_zones_8x8 combined_arms heroes), its card when the view has none, zones the template
//            has re-shaped by numbers; any other kind refused with what its mission holds; written through lib/modwrite, read back
//            with factsOf. misdiff --game <GoH> --exe goh: a mod in <GoH>/mods by its name, a mod elsewhere by its path (--mod-dir); read only.
//   all      misdiff names a mod in <game>/mods by its folder in lower case (VFS-12: the engine's list text)
// Author: Imperator_Aug (ARSENAL, ia-9cfd88ab)
const fs = require('fs'), path = require('path');
const LANG = require('./lang.json');
const MP = require('../maps')._t;
const R = require('../task/recipes/map.recipe')._t;
const games = require('../../../lib/games');
const SPR_OF = require('./sp');

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const fwd = p => String(p).replace(/\\/g, '/');
const MODE_RE = /^[a-z0-9_]{1,40}$/;
const MOD_ID = /^[^\\/:*?"<>|,]+$/;
// GoH multiplayer mode names, vanilla first in the order of their map counts, then the other registered ones (goh-game-mode-registry)
const GOH_MODES = ['battle_zones', 'ammunition', 'campaign_capture_the_flag', 'evacuation', 'frontlines', 'koth', 'heroes', 'guerrilla', 'captureflag',
  'cooperative', 'armored_warfare', 'battle_zones_8x8', 'combined_arms'];

// ---- the request's game: {id, exe, kind, dir}. dir = the AS2 install (as64, mowas2) or the GoH install (goh)
function gameOf(ctx) {
  const id = (typeof ctx.gameId === 'function' && games.idOf(ctx.gameId())) || games.DEFAULT, g = games.get(id);
  if (g.kind === 'goh') {
    const d = (typeof ctx.curDir === 'function' && ctx.curDir()) || (typeof ctx.gohDir === 'function' && ctx.gohDir()) || null;
    if (!d) throw bad('missions.e.nogoh');
    return { id, exe: g.exe, kind: 'goh', dir: d };
  }
  return { id, exe: g.exe, kind: 'as2', dir: MP.needGame(ctx) };
}
// a GoH mod folder: read only here. Not the GoH root, not the Workshop, inside the GoH install only <GoH>/mods/<name>
function gohMod(p, g) {
  if (typeof p !== 'string' || !p.trim()) throw bad('maps.e.nomod');
  const abs = path.resolve(p.trim());
  let st; try { st = fs.statSync(abs); } catch (e) { throw bad('maps.e.nofolder'); }
  if (!st.isDirectory()) throw bad('maps.e.notfolder');
  const low = fwd(abs).toLowerCase(), gl = fwd(path.resolve(g.dir)).toLowerCase().replace(/\/$/, '');
  if (/\/steamapps\/workshop\//.test(low)) throw bad('missions.e.gohmod');
  if (low === gl) throw bad('maps.e.gameroot');
  if (low.startsWith(gl + '/') && !/^mods\/[^/]+$/.test(low.slice(gl.length + 1))) throw bad('missions.e.gohmod');
  return abs;
}
// a mod path that climbs with ".." is refused before it is resolved (sp.js noClimb): <mod>/../.. is another folder
const modOf = (p, ctx, g) => (g.kind === 'goh' ? gohMod(SPR_OF.guard.noClimb(p), g) : MP.safeMod(SPR_OF.guard.noClimb(p), ctx));
// the mod folder, if one was given and it is allowed; a refused one leaves the facts on the game alone and says why
function modOpt(p, ctx, g) { if (!p) return { mod: '', why: null }; try { return { mod: modOf(p, ctx, g || { kind: 'as2' }), why: null }; } catch (e) { return { mod: '', why: e.message }; } }

// ---- readers per game: the map recipe's own, on its game view {dir, exe, gid} (R.gameView's shape). AS64: the folder alone, as before
// (the vfs picks as64 first); MoW:AS2 and GoH: the game's exe, so the recipe's vfs cache (keyed by folder, exe and source mods) never
// hands one game's view to another
const viewOf = g => (g.id === games.DEFAULT ? g.dir : { dir: g.dir, exe: g.exe, gid: g.id });
const vfsOf = (g, mods) => R.vfsOf(viewOf(g), mods);
function readerOf(g) {
  const v = viewOf(g);
  if (g.kind !== 'goh') return { readKey: (mod, k, mods) => R.readKey(v, mod, k, mods), modesOf: (mod, key, mods) => R.modesOf(v, mod, key, mods), cardBots: (mod, m) => R.cardBots(v, mod, m) };
  // GoH: the recipe sorts by the AS2 stock modes; GoH modes go in the order of the GoH registry
  const rank = m => (GOH_MODES.indexOf(m) < 0 ? 99 : GOH_MODES.indexOf(m));
  return { readKey: (mod, k, mods) => R.readKey(v, mod, k, mods), modesOf: (mod, key, mods) => R.modesOf(v, mod, key, mods).sort((a, b) => rank(a) - rank(b)), cardBots: (mod, m) => R.cardBots(v, mod, m) };
}

// ---- facts: per mode of the map, its flags, spawn-marked start points and the bots switch of its mode card, with the MAP-23 and
// MIS-65 warnings of the map and mission recipes' check
// ok (a phone: ctx.pathOk): a mod file it refuses is read as if the mod had none (the game's copy)
// g (optional, the request's game from gameOf): no g = AS64 on the folder game, as before
function factsOf(game, mod, key, mods, ok, g) {
  g = g || { id: games.DEFAULT, exe: 'as64', kind: 'as2', dir: game };
  const rd = readerOf(g), goh = g.kind === 'goh';
  const rk = k => { const f = mod ? path.join(mod, ...k.split('/')) : ''; return rd.readKey(mod && ok && fs.existsSync(f) && !ok(f) ? '' : mod, k, mods); };
  const inf = R.infoOf(rk('resource/' + key + '/map.info'));
  let players = inf.maxPlayers || null;
  const mp = goh ? null : rk('resource/' + key + '/map'), mt = mp ? mp.toString('latin1') : null;
  const clips = mt == null ? null : /"captureflaga"/i.test(mt) && /"captureflagb"/i.test(mt);   // MIS-62 (AS2)
  const modes = [], warn = [];
  for (const m of rd.modesOf(mod, key, mods)) {
    const mi = rk('resource/' + key + '/' + m + '.mi'), t = mi ? R.live(mi.toString('latin1')) : '';
    const flags = goh ? (t.match(/\{\s*visor\s+"?MapPoint"?\s*\}/gi) || []).length : (t.match(/"flag_point[^"]*"/gi) || []).length;
    const spawns = R.spawnsOf(mi), bots = rd.cardBots(mod, m);
    const own = !!mod && fs.existsSync(path.join(mod, 'resource', ...key.split('/'), m + '.mi'));
    const row = { mode: m, flags, spawns, bots, own, mi: !!mi };
    if (goh) { row.players = R.infoOf(rk('resource/' + key + '/' + m + '.info')).maxPlayers || null; if (row.players && row.players > (players || 0)) players = row.players; }
    modes.push(row);
    if (goh) continue;
    if (spawns && players && spawns < players) warn.push({ k: 'missions.w.spawns', p: { mode: m, n: spawns, players } });   // MAP-23
    if (mi && bots && !flags) warn.push({ k: 'missions.w.botsflags', p: { mode: m } });   // MIS-65
  }
  return { key, players, clips, modes, warn, game: g.id };
}
// A phone (LAN Remote, ctx.pathOk): the mod's map folder and its mode cards folder must have their real path under a root the PC page
// shows, else the facts are the game's alone (modWhy missions.e.phone); each mod file read is asked again (factsOf ok). Not asked per file:
// the mode names (R.modesOf lists the map folder checked here; links inside it are not followed), the mode card read by R.cardBots (its
// folder is checked here, a link file inside it is not), and the game view (lib/vfs: the game folder and its mods, as maps/list reads it).
async function factsRoute(url, body, ctx) {
  const g = gameOf(ctx), game = g.dir, key = MP.mapKeyOk(url.searchParams.get('map'));
  let mo = modOpt(url.searchParams.get('mod'), ctx, g);
  const ok = typeof ctx.pathOk === 'function' ? ctx.pathOk : null;
  if (mo.mod && ok && ![path.join(mo.mod, 'resource', ...key.split('/')), path.join(mo.mod, 'resource', 'set', 'multiplayer', 'games')].every(d => ok(d))) mo = { mod: '', why: 'missions.e.phone' };
  const info = MP.mapInfo(ctx, game, key, url.searchParams.get('from'));
  return Object.assign(factsOf(game, mo.mod, key, info.mods, ok, g), { mods: info.mods, modWhy: mo.why });
}

// ---- mine: maps that sit as loose folders in my mod (a map copied on the Maps page is in no list until the mod is in <game>/mods).
// Up to two folders deep under resource/map/multi, at most 200 (the page says so: missions.pick.limits). A phone (ctx.pathOk): each
// walked folder's real path must lie under a root the PC page shows, else it is skipped (a junction out of the mod lists nothing).
// CACHE (gui README contract 1): the folders are not walked here; the file rows come from the shared walk of the mod (lib/modtree
// ensure: its last scan when young, else one async scan every page shares; a write route of the GUI touches it). mineOf turns the
// rows under resource/map/multi into the same list in the same order the folder walk gave (folders in the file system's name order).
async function mineRoute(url, body, ctx) {
  let g; try { g = gameOf(ctx); } catch (e) { g = { kind: 'as2' }; }   // no game folder: the mod is checked as before
  const mo = modOpt(url.searchParams.get('mod'), ctx, g); if (!mo.mod) return { maps: [] };
  let T; try { T = await (ctx.modtree || require('../../../lib/modtree')).ensure(mo.mod); } catch (e) { return { maps: [] }; }
  return { maps: mineOf(mo.mod, linked(T) ? diskRows(mo.mod) : T.files, typeof ctx.pathOk === 'function' ? ctx.pathOk : null) };
}
// The shared walk never follows a link (T.left names them). A mod whose resource, map or multi folder, or a folder under multi, is
// a link or junction was listed by the old folder walk, so for such a mod the two levels under resource/map/multi are read from
// disk as before (a few folders, links followed).
const MULTI = 'resource/map/multi';
function linked(T) { return (T.left || []).some(r => { r = String(r).toLowerCase(); return MULTI === r || MULTI.startsWith(r + '/') || r.startsWith(MULTI + '/'); }); }
function diskRows(mod) {
  const rows = [], ls = d => { try { return fs.readdirSync(d); } catch (e) { return []; } }, isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
  const root = path.join(mod, 'resource', 'map', 'multi');
  for (const a of ls(root)) { const pa = path.join(root, a); if (!isDir(pa)) continue;
    for (const b of ls(pa)) { const pb = path.join(pa, b); if (!isDir(pb)) { rows.push([MULTI + '/' + a + '/' + b, 0, 0]); continue; }
      for (const c of ls(pb)) if (!isDir(path.join(pb, c))) rows.push([MULTI + '/' + a + '/' + b + '/' + c, 0, 0]); } }
  return rows;
}
// files: lib/modtree rows [rel, size, mtimeMs]. A folder one or two deep under resource/map/multi is a map when it holds a .mi, or a
// file map, map.info or map.net; a map folder is not looked into further. Links are in no row (modtree never follows one), as before.
function mineOf(mod, files, ok) {
  const top = new Map(), node = (m, n) => { let x = m.get(n); if (!x) m.set(n, x = { name: n, files: [], kids: new Map() }); return x; };
  for (const row of files || []) {
    const p = String(row[0]).split('/');
    if (p.length < 5 || p[0].toLowerCase() !== 'resource' || p[1].toLowerCase() !== 'map' || p[2].toLowerCase() !== 'multi') continue;
    const a = node(top, p[3]);
    if (p.length === 5) { a.files.push(p[4]); continue; }
    const b = node(a.kids, p[4]);
    if (p.length === 6) b.files.push(p[5]);
  }
  const out = [], root = path.join(mod, 'resource', 'map', 'multi');
  // the order a folder listing gives on Windows: by name, letter case ignored (upper case code points)
  const sorted = m => [...m.values()].sort((x, y) => { const a = x.name.toUpperCase(), b = y.name.toUpperCase(); return a < b ? -1 : a > b ? 1 : 0; });
  const visit = (d, rel, n, depth) => {
    if (ok && !ok(d)) return;
    const modes = n.files.filter(f => /\.mi$/i.test(f)).map(f => f.slice(0, -3).toLowerCase());
    if (modes.length || n.files.some(f => /^map(\.info|\.net)?$/i.test(f))) {
      const key = ('map/multi/' + rel).toLowerCase();
      if (/^map\/multi\/[a-z0-9_\-./]+$/.test(key)) out.push({ key, folder: rel.split('/').pop().toLowerCase(), name: rel.split('/').pop(), players: 0, modes: modes.sort(), mod: '', mods: [], copy: true, mine: true });
      return;
    }
    if (depth < 2) for (const k of sorted(n.kids)) visit(path.join(d, k.name), rel + '/' + k.name, k, depth + 1);
  };
  if (!ok || ok(root)) for (const a of sorted(top)) visit(path.join(root, a.name), a.name, a, 1);
  return out.slice(0, 200);
}

// ---- add a mode to a map in my mod: preview (dry run), then write; milint after a write
async function addRoute(url, body, ctx) {
  body = body || {};
  const g = gameOf(ctx);
  // GoH: gohmode.js (a mode of the same engine class copied, zones re-shaped by numbers; other kinds refused with what they need)
  if (g.kind === 'goh') return gohAdd(body, ctx, g);
  const game = g.dir, mod = modOf(body.mod, ctx, g), key = MP.mapKeyOk(body.map), write = !!body.write;
  const to = String(body.to || ''), from = body.from ? String(body.from) : '';
  if (!MP.MODES.includes(to)) throw bad('maps.e.mode');
  if (from && !MODE_RE.test(from)) throw bad('maps.e.mode');
  const info = MP.mapInfo(ctx, game, key, body.mods), modes = readerOf(g).modesOf(mod, key, info.mods);
  const out = { write, mod, key, to, ok: true, say: [], findings: [] };
  if (!modes.length) { out.ok = false; out.say.push({ k: 'maps.s.nomodes' }); return out; }
  if (modes.includes(to)) { out.ok = false; out.say.push({ k: 'missions.s.hasmode', p: { mode: to } }); return out; }
  if (from && !modes.includes(from)) throw bad('missions.e.from');
  // JOBS: a write is marked (the job list asks twice before stopping it). Stopped (ctx.job.cancelled): the answer is {cancelled} and
  // nothing more is written or checked. A stop that killed mission-clone while it wrote can leave a cut-off mode file: the map had no
  // such mode in my mod before (refused above), so that file is deleted again when it was not there before the run.
  const stopped = () => !!(ctx.job && ctx.job.cancelled);
  if (ctx.job && write) ctx.job.writes = true;
  if (stopped()) return Object.assign(out, { ok: false, cancelled: true });
  const modeFile = path.join(mod, 'resource', ...key.split('/'), to + '.mi'), hadFile = fs.existsSync(modeFile);
  // exe and gid ride along for MoW:AS2 (maps addMode hands --exe to mission-clone when it is not as64; ctx.exe() says the same)
  let am;
  try { am = await MP.addMode(ctx, Object.assign({ game, mod, map: key, from, to, flags: body.flags, modes, mods: info.mods, write }, g.id === games.DEFAULT ? {} : { exe: g.exe, gid: g.id })); }
  finally { if (write) (ctx.modtree || require('../../../lib/modtree')).touch(mod); }   // CACHE: the shared walk reads the mod again after a write
  if (stopped()) { if (write && !hadFile) { try { fs.rmSync(modeFile, { force: true }); } catch (e) { /* not there */ } (ctx.modtree || require('../../../lib/modtree')).touch(mod); } return Object.assign(out, { ok: false, cancelled: true, from: am.from }); }
  Object.assign(out, { ok: am.ok, from: am.from }); out.say.push(...am.say); out.findings.push(...am.findings);
  if (am.ok && write) { out.check = await MP.lintMod(ctx, game, mod, 'missions'); out.needsTest = true; }
  return out;
}

// ---- GoH: add a mode to a map in my mod (gohmode.js plan: same class copy, modes built from a battle zones mode, card when the view
// has none, zones and new flags by numbers; edit = new flags and outlines in a mode the map has). Preview =
// the files it would write and why; Write = lib/modwrite (guard each file, restore points, write), then the facts read back.
// A refusal is ok:false with one plain line naming what is missing (say), not an error.
async function gohAdd(body, ctx, g) {
  const GM = require('./gohmode'), MW = require('../../../lib/modwrite');
  const mod = modOf(body.mod, ctx, g), key = MP.mapKeyOk(body.map), write = !!body.write, to = String(body.to || ''), from = body.from ? String(body.from) : '';
  if (from && !MODE_RE.test(from)) throw bad('maps.e.mode');
  const why = require('../../../lib/writeguard').refuseWrite(mod, { game: g.dir, purpose: 'add a game mode' });
  if (why) throw bad(why);
  const info = MP.mapInfo(ctx, g.dir, key, body.mods), modes = readerOf(g).modesOf(mod, key, info.mods), v = viewOf(g);
  const out = { write, mod, key, to, ok: false, say: [], findings: [] };
  if (!modes.length) { out.say.push({ k: 'maps.s.nomodes' }); return out; }
  const p = GM.plan({ read: rel => R.readKey(v, mod, rel, info.mods), srcKey: key, modes, from, to, zones: body.zones, edit: !!body.edit });
  Object.assign(out, { ok: p.ok, from: p.from, files: p.files.map(f => f[0]) }); out.say.push(...p.say);
  if (!p.ok) return out;
  for (const [rel] of p.files) MW.guardFile(mod, path.join(mod, ...rel.split('/')), { game: g.dir });
  if (!write) return out;
  if (ctx.job && ctx.job.cancelled) return Object.assign(out, { ok: false, cancelled: true });
  if (ctx.job) ctx.job.writes = true;
  const rels = p.files.map(f => f[0]);
  out.restore = MW.restorePoints(mod, rels, 'missions-goh-add', { game: g.dir });
  try { MW.writeFiles(mod, p.files, { game: g.dir }); } finally { (ctx.modtree || require('../../../lib/modtree')).touch(mod); }
  // read back with the page's own GoH reader: the new mode's map points, start points and players against the mode it came from
  const rb = GM.readBack(factsOf(g.dir, mod, key, info.mods, null, g), p.from, to, p.expect);
  out.say.push(rb.say); out.back = rb.ok; out.ok = rb.ok; out.needsTest = true;
  return out;
}

// ---- what my mod changed in this map's missions: misdiff --game G --mods <mod> --map <name> (the game alone vs the game with the mod).
// AS64, MoW:AS2: misdiff names mods by their folder in <game>/mods, so a mod elsewhere is not compared: the page says to install it
// with Play first. GoH: a mod elsewhere goes by its path (--mod-dir), since nothing here writes into the GoH install.
const ROW = /^MIS_DIFF_([A-Z]+)_([A-Z_]+)$/;
// misdiff's drop line: a findings entry WARN_MISDIFF_MOD_DROPPED (the older MIS_DIFF_MOD_DROPPED info line is read the same way)
const DROP_CODES = new Set(['WARN_MISDIFF_MOD_DROPPED', 'MIS_DIFF_MOD_DROPPED']);
// the mod a vfs drop line names: mod "x" / mod "x:2" (MOD_VER_GATE) / Mod 'x' (MOD_UNKNOWN), lower case
const dropName = msg => { const m = /\bmod ["']([^"':]+)/i.exec(String(msg || '')); return m ? m[1].toLowerCase() : null; };
// A phone (LAN Remote) runs one diff at a time: a second ask while one runs is refused (missions.e.busy, 429). The route's ctx carries no
// device id, so this is one running diff for all remote devices together. The PC is not limited.
let phoneDiff = false;
async function diffRoute(url, body, ctx) {
  body = body || {};
  const g = gameOf(ctx), game = g.dir, mod = modOf(body.mod, ctx, g), key = MP.mapKeyOk(body.map), goh = g.kind === 'goh';
  // the mod list names a mod by its folder in lower case (VFS-12: other text is "Not installed"), so a folder with capitals is named lower
  const gm = fwd(path.resolve(game, 'mods')).toLowerCase().replace(/\/$/, ''), ml = fwd(path.resolve(mod)).toLowerCase(), name = path.basename(mod).toLowerCase();
  // GoH: a mod folder outside <GoH>/mods (where a GoH mod of this toolkit lives: no write into the GoH install) is mounted by its path
  // (misdiff --mod-dir); AS64 and MoW:AS2 keep the rule of the page: the mod must sit in <game>/mods
  const inMods = path.posix.dirname(ml) === gm && MOD_ID.test(name);
  if (!inMods && !goh) return { ok: false, installed: false, say: [{ k: 'missions.s.notinstalled' }] };
  // misdiff splits --mod-dir on commas, so a folder path with a comma would become two folders
  if (!inMods && mod.includes(',')) throw bad('missions.e.comma');
  const info = MP.mapInfo(ctx, game, key, body.mods), base = info.mods.filter(m => m.toLowerCase() !== name.toLowerCase());
  const args = ['--game', game].concat(inMods ? ['--mods', base.concat(name).join(',')] : base.length ? ['--mods', base.join(',')] : [], ['--map', key.replace(/^map\//, ''), '--format', 'json']);
  if (!inMods) args.push('--mod-dir', mod);
  if (base.length) args.push('--mods-a', base.join(','));
  if (g.id !== games.DEFAULT) args.push('--exe', g.exe);   // MoW:AS2: mowas_2 view of the mods; GoH: the GoH view
  const phone = !!(ctx.session && ctx.session.remote);
  if (phone && phoneDiff) throw bad('missions.e.busy', 429);
  if (phone) phoneDiff = true;
  let r;
  // GoH: a whole GoH mod mounted on the GoH paks takes minutes (a real run: 23 changes, far past 180 s on a busy machine), so 600 s there
  const limitMs = goh ? 600000 : 180000;
  try { r = await ctx.runTool('misdiff', 'misdiff/misdiff.js', args, { timeoutMs: limitMs }); } finally { if (phone) phoneDiff = false; }
  // JOBS: stopped from the job list: no report, said as stopped (the dispatcher answers 499)
  if (r.cancelled || (ctx.job && ctx.job.cancelled)) return { ok: false, installed: true, name, cancelled: true, say: [] };
  // stopped at the time limit: say so in plain words (the tool printed nothing, so 'could not be compared' with no detail told nothing)
  if (r.timedOut) return { ok: false, installed: true, name, timedOut: true, say: [{ k: 'missions.s.difftimeout', p: { s: limitMs / 1000 } }] };
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* the tool stopped before its report */ }
  if (!j) {
    const line = String(r.stderr || r.stdout || '').trim().split(/\r?\n/)[0], detail = line.slice(0, 300);
    // a map that only my mod holds while the game leaves my mod out: misdiff stops with '...; MOD_<WHY> mod "<name>" ...' (no report).
    // The whole line is searched: misdiff writes every drop (mods-a side first, my mod last), so mine may lie past the 300-character cut
    const why = (line.split('; ').slice(1).find(s => /^MOD_[A-Z_]+ /.test(s) && dropName(s) === name) || '').slice(0, 300);
    if (why) return { ok: false, installed: true, name, say: [{ k: 'missions.s.dropped', p: { why } }], detail };
    return { ok: false, installed: true, name, say: [{ k: 'missions.s.difffail' }], detail };
  }
  // a mod the vfs leaves out (misdiff WARN_MISDIFF_MOD_DROPPED, file mods or mods-a; msg 'MOD_<WHY> mod "<name>" ...' from vfs.dropped).
  // The user's own mod left out on the mods side: nothing is compared, the page says why. Another mod of the list: one plain line each.
  const isDrop = x => DROP_CODES.has(x.code), all = (j.info || []).concat(j.findings || []);
  const own = all.find(x => isDrop(x) && x.file !== 'mods-a' && dropName(x.msg) === name);
  if (own) return { ok: false, installed: true, name, say: [{ k: 'missions.s.dropped', p: { why: String(own.msg || '').slice(0, 300) } }] };
  const dropped = [...new Set(all.filter(isDrop).map(x => String(x.msg || '').slice(0, 300)))];
  const chg = (j.info || []).filter(x => !isDrop(x));   // the change lines only
  const groups = new Map(), details = [];
  for (const x of chg) {
    const m = ROW.exec(x.code || ''), g = (x.file || '') + '|' + x.code;
    if (!groups.has(g)) groups.set(g, { file: x.file || '', code: x.code, thing: m ? m[1].toLowerCase() : '', act: m ? m[2].toLowerCase() : '', n: 0 });
    groups.get(g).n++;
    if (details.length < 80) details.push({ file: x.file || '', code: x.code, msg: String(x.msg || '').slice(0, 300) });
  }
  const findings = (j.findings || []).filter(x => !isDrop(x)).slice(0, 40).map(x => ({ sev: 'warn', code: x.code, file: x.file || '', msg: String(x.msg || '').slice(0, 300) }));
  return { ok: true, installed: true, name, base, rows: [...groups.values()], details, findings, dropped, total: chg.length };
}

const SPR = SPR_OF(gameOf);
module.exports = {
  id: 'missions', nav: 'missions.nav', adv: false, after: 'maps',
  script: require('./client'),
  lang: LANG,
  commands: {},
  routes: {
    'GET /api/x/missions/facts': factsRoute,
    'GET /api/x/missions/mine': mineRoute,
    'POST /api/x/missions/add': addRoute,
    'POST /api/x/missions/diff': diffRoute,
    ...SPR,
  },
  _t: { mineOf, factsOf, ROW, gameOf, gohMod, readerOf, GOH_MODES, vfsOf, viewOf, gohAdd, sp: SPR_OF._t },
};
