// GUI-EXT maps: the Maps page. List the game's multiplayer maps, clone one into the current mod (name, lobby title, game mode, bots),
// place one object in metres, check the result with milint. Tools run through ctx.runTool; writes go only to the mod folder the user picked.
// Routes: GET list (background job + cache), GET picture, POST clone {write}, GET clone/status, POST place {write}, POST check.
// JOBS (gui README "JOBS"): the list scan is a 'bg' job (what job.w.mapslist, page maps): Cancel kills mission-clone (AS2) or stops the
//   GoH walk at its next pause; the list then answers {state:'error', error:'maps.e.stopped', stopped:true} until a refresh (callers that
//   know only running/error/done show the worded line; the Maps page shows it as a plain stopped state). clone and place set
//   ctx.job.writes before a write; every route returns at once when its tool was stopped (r.cancelled) and writes nothing after it.
//   A stopped clone write removes what this request made itself (the new map folder, the new title file) and nothing else; what it did
//   is kept for GET clone/status {state: nothing|removed|left|complete, left}. A stopped picture drops its half-written cache file.
// Game parity (2026-11-14): every route works for the page's game (ctx.gameId: as64 | mowas2 | goh; nothing sent = as64, as before).
//   MoW:AS2: the same as AS64 on the shared AS2 install; the tools get --exe mowas_2 (vfs view without as64/core), caches and jobs carry
//     the game id. AS64 argument lists and caches are unchanged.
//   GoH: the folder is the GoH install (ctx.curDir()); the list is read from the GoH file set (lib/vfs exe goh): <mode>.info per map (no
//     map.info), titles from interface/text/*.pot (GHLOC-06) [V 224 of 224 multi maps]; picture mapview --exe goh [V]; copy map-clone
//     --target goh [V plan run]; lobby title = a .pot entry (msgctxt "mission/<map>/name") in the mod, written by lng-add --exe goh [I]; bots = {settings {enableBots}}
//     of the GoH mode card [V form]; the mod folder must lie outside the GoH install (lib/writeguard line). A mode the map lacks: mission-clone
//     --exe goh --from <a mode of the map> --to <GoH mode> (GoH to GoH [I]; flags of a non battle_zones pair = MC_NEEDS_MANUAL, GHMAP-03);
//     check = milint --exe goh. A tool that refuses a game (games.refuse, exit 2, "<tool>: not available for <game>: ...") is shown as that
//     plain line (say maps.s.na). A new GoH title file is CRLF as map-clone writes it. mod.info Min/Max on GoH: map-clone reads
//     binaries/x64/call_to_arms.exe itself (no --game-version sent); when it cannot, its WARN_MAPCLONE_GOH_VERSION reaches the page.
// CACHE (gui README contract 1): the list and the pictures live in the shared store (ctx.cache), not in the temp folder.
//   maps.list  ver LIST_VER, parts {game, gid}, stamps {game: gameview.stamp, mods: modsSig (AS2 only)}. No age rule: a stamp that
//     moved is a miss, ?refresh=1 still forces a scan. GoH lists vanilla only, so its stamps are {game} alone.
//   maps.pic   ver PIC_VER, parts {game, gid, map, mods}, stamps {game, map: the files of the map folder in each named mod}.
//   maps.ents  ver ENTS_VER, parts {game, gid, mod}, stamps {game, mod:entity, mod:pak, mod:other} (lib/modtree; other = mod.info Delete).
//   The game's own file view is the shared lib/gameview one (enrich, the GoH walk, the bots card).
// Author: Imperator_Aug (ARSENAL, ia-0b2824f3)
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const LANG = require('./lang.json');
const cipath = require('../../../lib/cipath');
const games = require('../../../lib/games');
const cachestore = require('../../../lib/cachestore'), gameview = require('../../../lib/gameview'), modtreeLib = require('../../../lib/modtree');
// the shared store: the server's (ctx.cache); a ctx without it (tests, callers that build their own ctx) keeps one under its temp folder
const storeOf = ctx => (ctx && ctx.cache) || cachestore.open({ root: path.join((ctx && ctx.tmpRoot) || os.tmpdir(), 'cache', 'store') });
const lowDir = d => String(path.resolve(String(d))).replace(/\\/g, '/').toLowerCase();
// the game's own file view (no mod), shared: exe = the vfs exe ('mowas_2' | 'goh') or none for as64, as the pages passed it to vfs.build
const gameView = (game, exe) => gameview.get(exe ? { gameDir: game, exe } : { gameDir: game });
const LIST_VER = 1, PIC_VER = 1, ENTS_VER = 1;
// root + rel ignoring letter case as the game does (Linux/macOS); exact path first, so Windows gets the plain join. Fresh listings (server)
const ciJoin = (root, rel, fsx) => cipath.resolve(root, rel, { cache: new Map(), fs: fsx }) || path.join(root, rel);

const MODES = ['combat', 'battle_zones', 'captureflag'];
// GoH mode cards under set/multiplayer/games ([V] vfs exe goh: these six); GoH has no combat (frontlines, gohweb mission/goh-game-mode-registry)
const MODES_GOH = ['frontlines', 'battle_zones', 'campaign_capture_the_flag', 'ammunition', 'evacuation', 'cooperative'];
// world scale: 20 map units = 1 m (reference-world-scale). GoH the same [I] (2026-11-23, two ways: vehicle hulls in model units against
// their real size, Pz IV D 111.9 x 56.9 for 5.92 x 2.84 m, T-34/76 107.7 x 59.5 for 5.92 x 3.0 m, Willys 65.7 x 31.1 for 3.36 x 1.57 m;
// and the GoH exe read in gohweb: g_unitsPerMeter 20, g_speedFromUser 0.02 = 20 / 1000 ms, a 1.5 m land margin where AS2 has 30); in game [T]
const UNITS_PER_M = 20;
// the page's game: ctx.gameId() (gui.js); a ctx without it (tests, older callers) = as64
const gidOf = ctx => (ctx && typeof ctx.gameId === 'function' && games.idOf(ctx.gameId())) || 'as64';
const exeOf = ctx => games.exeOf(gidOf(ctx));
const isGoh = ctx => games.kindOf(gidOf(ctx)) === 'goh';
const exeArgs = ctx => (gidOf(ctx) === 'as64' ? [] : ['--exe', exeOf(ctx)]);   // AS64 argument lists stay as they were
const modesFor = ctx => (isGoh(ctx) ? MODES_GOH : MODES);
// job and cache key: the game folder, plus the game id for MoW:AS2 and GoH (the AS2 install is shared by AS64 and MoW:AS2)
const keyOf = (ctx, game) => (gidOf(ctx) === 'as64' ? sha(game) : sha(gidOf(ctx) + '|' + game));
// a tool that cannot serve the game says so in one line (lib/games refuse: exit 2) -> that line, else null
const naLine = r => { if (!r || r.code !== 2) return null; const m = /[^\r\n:]+: not available for [^\r\n]+/.exec(String(r.stderr || '') + '\n' + String(r.stdout || '')); return m ? m[0].trim() : null; };
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const fwd = p => String(p).replace(/\\/g, '/');
const tmpDir = ctx => { const d = path.join(ctx.tmpRoot || os.tmpdir(), 'as2gui-maps'); fs.mkdirSync(d, { recursive: true }); return d; };
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
// JOBS: the server's registry (ctx.jobs); a ctx without it (tests, callers that build their own ctx) gets a private one, so the code is the same
const OWNJOBS = require('../../joblist').create({ keepMs: 0 });
const jobsOf = ctx => (ctx && ctx.jobs && typeof ctx.jobs.add === 'function' ? ctx.jobs : OWNJOBS);
// this request was stopped from the job list: the tool result says so, or the request's own handle does
const gone = (ctx, r) => !!(r && r.cancelled) || !!(ctx && ctx.job && ctx.job.cancelled);
const writesNow = ctx => { if (ctx && ctx.job) ctx.job.writes = true; };
const tick = () => new Promise(r => setImmediate(r));

// ---- safety: only a mod folder the user picked. Never the game root, vanilla data, GoH, Workshop.
function safeMod(p, ctx, read) {   // read: the check route (reads only): <GoH>/mods/<name> passes under GoH
  if (typeof p !== 'string' || !p.trim()) throw bad('maps.e.nomod');
  const abs = path.resolve(p.trim());
  let st; try { st = fs.statSync(abs); } catch (e) { throw bad('maps.e.nofolder'); }
  if (!st.isDirectory()) throw bad('maps.e.notfolder');
  const low = fwd(abs).toLowerCase();
  if (isGoh(ctx)) {
    // GoH: a GoH mod folder outside the GoH install (settled 2026-11-14); inside it, the Workshop or another game folder the guard's plain line
    // the shared guard decides (owner 2026-11-15): <GoH>/mods/<name> for a copy ARSENAL made or a new folder, another mod there or a Workshop item only with Advanced on
    const gd = ctx.gohDir && ctx.gohDir();
    if (read && gd) { const gl = fwd(path.resolve(gd)).toLowerCase().replace(/\/$/, ''); if (/^mods\/[^/]+$/.test(low.slice(gl.length + 1)) && low.startsWith(gl + '/')) return abs; }
    const why = require('../../../lib/writeguard').refuseWrite(abs, { game: gd || undefined });
    if (why && /\/steamapps\/workshop\//.test(low)) throw bad('maps.e.gohws');
    if (why && gd) { const gl = fwd(path.resolve(gd)).toLowerCase().replace(/\/$/, ''); if (low === gl || low.startsWith(gl + '/')) throw bad('maps.e.gohinstall'); }
    if (why) throw bad(why);
    return abs;
  }
  if ((/\/steamapps\/workshop\//.test(low) && require('../../../lib/writeguard').refuseWrite(abs, { game: (ctx.game && ctx.game()) || undefined })) || /gates of hell|call to arms|\/goh\b/.test(low)) throw bad('maps.e.gohws');
  const g = ctx.game && ctx.game();
  if (g) {
    const gl = fwd(path.resolve(g)).toLowerCase().replace(/\/$/, '');
    if (low === gl) throw bad('maps.e.gameroot');
    if (low.startsWith(gl + '/') && !/^mods\/[^/]+$/.test(low.slice(gl.length + 1))) throw bad('maps.e.ingame');
  }
  return abs;
}
function needGame(ctx) { if (isGoh(ctx)) { const d = ctx.curDir ? ctx.curDir() : ctx.gohDir && ctx.gohDir(); if (!d) throw bad('maps.e.nogoh'); return d; } const g = ctx.game && ctx.game(); if (!g) throw bad('The game folder was not found. Set it on the Mods page first.'); return g; }
function mapKeyOk(m) {
  const k = String(m || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!/^map\/(multi|single)\/[a-z0-9_\-./]+$/.test(k) || k.includes('..')) throw bad('maps.e.pickmap');
  return k;
}
const nameOk = n => { if (!/^[A-Za-z0-9_]{1,40}$/.test(String(n || ''))) throw bad('maps.e.name'); return String(n).toLowerCase(); };

// ---- tool output -> findings [{sev, code, where, msg}] + did-you-mean list
function parse(out) {
  const f = [];
  for (const raw of String(out || '').split(/\r?\n/)) {
    const m2 = /^(info: )?(.*?): ((?:WARN_)?[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)(?: (.*))?$/.exec(raw);
    if (!m2) continue;
    const info = !!m2[1], code = m2[3];
    f.push({ sev: info ? 'info' : /^WARN_/.test(code) ? 'warn' : 'error', code, where: m2[2], msg: m2[4] || '' });
  }
  return f;
}
function suggest(findings) {
  for (const x of findings) { const m = /Did you mean: (.+?)\?$/.exec(x.msg); if (m) return m[1].split(/,\s*/).filter(Boolean); }
  return [];
}
const errors = f => f.filter(x => x.sev === 'error');
const pub = f => f.filter(x => x.sev !== 'info' || /^(MAPCLONE_LOC_KEY|MC_NEEDS_MANUAL|PLACE_UID)/.test(x.code)).slice(0, 40).map(x => ({ sev: x.sev, code: x.code, msg: x.msg.slice(0, 400) }));

// ---- list: mission-clone --list through runTool, enriched with names + player counts from the game's own data. Job + disk cache.
const JOBS = new Map();
function nameFromFolder(folder) {
  const m = /^(\d)v(\d)_(.*)$/.exec(folder);
  const base = (m ? m[3] : folder).replace(/_/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase());
  return base;
}
function enrich(game, maps, exe) {
  let files = null, readRec = null;
  try { const vfs = require('../../../lib/vfs'); const v = gameView(game, exe); files = v.files; readRec = vfs.readRec; } catch (e) { /* names stay folder-based */ }
  const titles = {};
  if (files) {
    for (const [k, rec] of files) {
      if (!/^resource\/interface\/text\/(mission\.lng|mission\/multi\/.+\.lng)$/.test(k)) continue;
      let t; try { t = readRec(rec).toString('utf8'); } catch (e) { continue; }
      for (const m of t.matchAll(/\{\s*"([^"]+)"\s*\{\s*"name"\s*"((?:[^"\\]|\\.)*)"/g)) titles[m[1].toLowerCase()] = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
  }
  for (const m of maps) {
    const folder = m.key.split('/').pop();
    m.folder = folder;
    m.name = titles[folder] || nameFromFolder(folder);
    let players = 0;
    if (files) {
      const rec = files.get('resource/' + m.key + '/map.info');
      if (rec) { try { const t = readRec(rec).toString('latin1'); const g = /\{\s*maxPlayers\s+(\d+)/i.exec(t); if (g) players = +g[1]; } catch (e) { /* none */ } }
    }
    if (!players) { const g = /^(\d+)v(\d+)_/.exec(folder); if (g) players = +g[1] + +g[2]; }
    m.players = players;
    // GT-07: a map tagged [mod: x] may live only in that mod (map-clone then needs --mods x), and some mods ship only the mode
    // files of a map without its map.net (gohfull_pak frontlines): such a map cannot be copied at all.
    m.mods = m.mod ? m.mod.split(/,\s*/).filter(Boolean) : [];
    m.copy = hasNet(game, files, m.key, m.mods);
  }
  return maps;
}
const MODPAKS = new Map();
function modKeys(game, id) {
  const d = ciJoin(game, 'mods/' + id + '/resource');
  if (!MODPAKS.has(d)) { let ks = new Set(); try { ks = new Set(require('../../../lib/pakset').open(d, null).entries.map(e => e.key)); } catch (e) { /* no paks */ } MODPAKS.set(d, ks); }
  return MODPAKS.get(d);
}
function hasNet(game, files, key, mods) {
  if (files ? files.has('resource/' + key + '/map.net') : fs.existsSync(ciJoin(game, 'resource/' + key + '/map.net'))) return true;
  for (const id of mods) {
    if (fs.existsSync(ciJoin(game, 'mods/' + id + '/resource/' + key + '/map.net'))) return true;
    if (modKeys(game, id).has(key + '/map.net')) return true;
  }
  return !files && !mods.length;   // without the game index a vanilla map is taken as copyable; map-clone still says so if not
}
// ---- GoH: the map list from the GoH file set (lib/vfs exe goh), not mission-clone (whose own index sees only the top-level paks).
// A map = a folder under map/multi with a map.net; modes = its <mode>.info that have a <mode>.mi (GoH has no map.info); players =
// {maxPlayers N} of a mode .info; title = msgctxt "mission/<map>/name" in any interface/text .pot (GHLOC-06; msgstr when set, else msgid).
// Vanilla only: maps that live only in a GoH mod are not listed. o.v = a built vfs (tests); o.only = one map key (modes of one map).
function potTitles(text, into) {
  for (const m of String(text).matchAll(/msgctxt\s+"mission\/((?:multi|single)\/[^"]+)\/name"\s*\r?\n\s*msgid\s+"((?:[^"\\]|\\.)*)"(?:\s*\r?\n\s*msgstr\s+"((?:[^"\\]|\\.)*)")?/g)) {
    const t = (m[3] || m[2]).replace(/\\(.)/g, '$1').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (t) into['map/' + m[1].toLowerCase()] = t;
  }
  return into;
}
// gohScan: the walk in two parts (feed one file, done -> the list), so the list job can pause between files and be stopped
function gohScan(o, readRec) {
  const per = new Map(), titles = {};
  const feed = (k, rec) => {
    const m = /^resource\/(map\/multi\/.+)\/([^/]+)$/.exec(k);
    if (m) {
      if (o.only && m[1] !== o.only) return;
      let e = per.get(m[1]); if (!e) per.set(m[1], e = { net: false, info: new Map(), mi: new Set() });
      if (m[2] === 'map.net') e.net = true;
      else if (/\.info$/.test(m[2])) e.info.set(m[2].slice(0, -5), rec);
      else if (/\.mi$/.test(m[2])) e.mi.add(m[2].slice(0, -3));
      return;
    }
    if (!o.only && /^resource\/interface\/text\/.+\.pot$/.test(k)) { try { potTitles(readRec(rec).toString('utf8'), titles); } catch (e) { /* skip */ } }
  };
  return { feed, done: () => gohMaps(per, titles, readRec) };
}
function listGoh(game, o = {}) {
  const vfs = require('../../../lib/vfs');
  const v = o.v || gameView(game, 'goh'), sc = gohScan(o, o.readRec || vfs.readRec);
  for (const [k, rec] of v.files) sc.feed(k, rec);
  return sc.done();
}
// the same list for the list job: a pause every 2000 files, where stop() is asked (true = give up, null comes back). The file set itself
// (the shared lib/gameview one; about a second when nobody built it yet) is one step that cannot be interrupted. o.v, o.readRec, o.every (tests)
async function listGohJob(game, stop, o = {}) {
  const vfs = require('../../../lib/vfs');
  await tick(); if (stop()) return null;
  const v = o.v || gameView(game, 'goh'), sc = gohScan(o, o.readRec || vfs.readRec), every = o.every || 2000;
  let n = 0;
  for (const [k, rec] of v.files) { sc.feed(k, rec); if (++n % every === 0) { await tick(); if (stop()) return null; } }
  await tick(); if (stop()) return null;
  return sc.done();
}
function gohMaps(per, titles, readRec) {
  const maps = [];
  for (const [key, e] of per) {
    if (!e.net) continue;
    const all = [...e.info.keys()].sort(), withMi = all.filter(n => e.mi.has(n)), modes = withMi.length ? withMi : all;
    let players = 0;
    for (const n of modes) { try { const g = /\{\s*maxPlayers\s+(\d+)/i.exec(readRec(e.info.get(n)).toString('latin1')); if (g) { players = +g[1]; break; } } catch (x) { /* none */ } }
    const folder = key.split('/').pop();
    if (!players) { const g = /^(\d+)v(\d+)_/.exec(folder); if (g) players = +g[1] + +g[2]; }
    maps.push({ key, modes, mod: '', folder, name: titles[key] || nameFromFolder(folder), players, mods: [], copy: true });
  }
  return maps.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
// the mods a listed map needs (from the list job or its cache); else the page's hint, checked against <game>/mods
function listed(ctx, game) {
  const c = listGet(ctx, game, listStamps(ctx, game));
  return c ? c.maps : null;
}
function mapInfo(ctx, game, key, hint) {
  const l = listed(ctx, game), m = l && l.find(x => x.key === key);
  if (m) return { mods: m.mods || [], copy: m.copy !== false };
  const ids = (Array.isArray(hint) ? hint : String(hint || '').split(',')).map(s => String(s).trim()).filter(Boolean);
  for (const id of ids) if (/[\\/:*?"<>|,]|^\.+$/.test(id) || !fs.existsSync(ciJoin(game, 'mods/' + id))) throw bad('maps.e.badmod');
  return { mods: ids, copy: true };
}
function parseList(text) {
  const maps = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = /^(map\/[^:]+): (.*?)(?:\s+\[mod: (.*)\])?\s*$/.exec(raw);
    if (!m) continue;
    maps.push({ key: m[1], modes: m[2].split(/\s+/).filter(Boolean), mod: m[3] || '' });
  }
  return maps;
}
// modsSig: what the AS2 list reads outside the game's own paks (those are the game stamp). mission-clone --list reads the paks directly
// in <game>/mods/<id>/resource of every installed mod (the [mod: x] tag) and the game's loose resource files; enrich (hasNet) asks for
// <game>/mods/<id>/resource/<map key>/map.net and the paks of a tagged mod. So: per installed mod the name, size and mtime of the paks
// directly in resource/ and of every pak in resource/map (3 folders deep), plus name and mtime of every folder there (a map.net
// added or removed moves its folder's mtime); the same folder rows for the game's own loose resource/map. A few hundred stats, no
// whole-mod walk (a mod's map folders are read through lib/modtree only by the pages that work on one mod). Not seen: a pak deeper in
// a mod than resource/ and resource/map/** (it can only change the copy flag of a map tagged with that mod). Kept 5 s per game folder.
const MSIG = new Map(), MSIG_MS = 5000;
function modsSig(game, force) {
  const k = lowDir(game), c = MSIG.get(k), now = Date.now();
  if (c && !force && now - c.at < MSIG_MS) return c.sig;
  const rows = [], st = p => { try { return fs.statSync(p); } catch (e) { return null; } };
  const ls = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return []; } };
  const mapDirs = (d, tag, depth) => {
    for (const e of ls(d)) {
      const p = path.join(d, e.name), n = tag + '/' + e.name.toLowerCase();
      if (e.isDirectory()) { const s = st(p); rows.push('d|' + n + '|' + (s ? Math.floor(s.mtimeMs) : 0)); if (depth < 3) mapDirs(p, n, depth + 1); }
      else if (/\.pak$/i.test(e.name)) { const s = st(p); if (s) rows.push('p|' + n + '|' + s.size + '|' + Math.floor(s.mtimeMs)); }
    }
  };
  const root = (res, tag) => {
    for (const e of ls(res)) {
      if (e.isDirectory()) { if (e.name.toLowerCase() === 'map') mapDirs(path.join(res, e.name), tag + '/map', 1); }
      else if (/\.pak$/i.test(e.name)) { const s = st(path.join(res, e.name)); if (s) rows.push('p|' + tag + '/' + e.name.toLowerCase() + '|' + s.size + '|' + Math.floor(s.mtimeMs)); }
    }
  };
  const gres = ciJoin(game, 'resource');
  for (const e of ls(gres)) if (e.isDirectory() && e.name.toLowerCase() === 'map') mapDirs(path.join(gres, e.name), 'game/map', 1);
  const md = ciJoin(game, 'mods');
  for (const e of ls(md)) {
    if (!e.isDirectory()) continue;
    const tag = 'mod:' + e.name.toLowerCase(); rows.push('m|' + tag);
    for (const r of ls(path.join(md, e.name))) if (r.isDirectory() && r.name.toLowerCase() === 'resource') root(path.join(md, e.name, r.name), tag);
  }
  rows.sort();
  const sig = crypto.createHash('sha1').update(rows.join('\n')).digest('hex');
  MSIG.set(k, { sig, at: now });
  return sig;
}
// the list's identity and stamps; a short memory in front of the store (the list is asked per picture and by other pages)
const listParts = (ctx, game) => ({ game: lowDir(game), gid: gidOf(ctx) });
function listStamps(ctx, game, force) {
  const gid = gidOf(ctx), st = { game: gameview.stamp({ gameDir: game, gid }, force ? { force: true } : {}) };
  if (!isGoh(ctx)) st.mods = modsSig(game, force);
  return st;
}
const same = (a, b) => JSON.stringify(cachestore.canon(a)) === JSON.stringify(cachestore.canon(b));
const LMEM = new Map();   // store root + game key -> {stamps, at, maps}
function listGet(ctx, game, st) {
  const S = storeOf(ctx), k = S.root + '|' + keyOf(ctx, game), m = LMEM.get(k);
  if (m && same(m.stamps, st)) return m;
  let c = null; try { c = S.get('maps.list', LIST_VER, listParts(ctx, game), st); } catch (e) { c = null; }
  if (c && c.value && Array.isArray(c.value.maps)) { const v = { stamps: st, at: c.value.at, maps: c.value.maps }; LMEM.set(k, v); return v; }
  const job = JOBS.get(keyOf(ctx, game));   // the store could not be written: the finished scan of this run, while its stamps still hold
  if (job && job.state === 'done' && same(job.stamps, st)) return job;
  return null;
}
async function listRoute(url, body, ctx) {
  const game = needGame(ctx), id = keyOf(ctx, game);
  const refresh = url.searchParams.get('refresh') === '1';
  let job = JOBS.get(id);
  if (job && job.state === 'running') return { state: 'running', elapsed: Math.round((Date.now() - job.t0) / 1000) };
  const stamps = listStamps(ctx, game, refresh);   // taken before the scan: a change while it runs is a miss the next time
  if (!refresh) {
    const c = listGet(ctx, game, stamps);
    if (c) return { state: 'done', cached: true, at: c.at, maps: c.maps };
    // stopped from the job list: no list and no new scan until a refresh; 'error' + a worded key for callers that know three states
    if (job && job.state === 'stopped') return { state: 'error', error: 'maps.e.stopped', stopped: true, detail: '' };
    if (job && job.state === 'error') return { state: 'error', error: job.error, detail: job.detail || '' };
  }
  job = { state: 'running', t0: Date.now(), stop: false, stamps };
  JOBS.set(id, job);
  // JOBS: the scan outlives this request, so it is a background job; the tool belongs to it ({job: h}), not to the request
  const mine = job, h = jobsOf(ctx).add({ kind: 'bg', what: 'job.w.mapslist', page: 'maps', game: gidOf(ctx), cancel() { mine.stop = true; } });
  const stopped = () => mine.stop || h.cancelled, STOP = new Error('stopped');
  const goh = isGoh(ctx), xa = exeArgs(ctx), exe = gidOf(ctx) === 'as64' ? null : exeOf(ctx);
  (async () => {
    let end = 'done';
    try {
      let maps;
      if (goh) { maps = await listGohJob(game, stopped); if (!maps) throw STOP; }
      else {
        const r = await ctx.runTool('mission-clone', 'mission-clone/mission-clone.js', ['--game', game, '--list'].concat(xa), { timeoutMs: 600000, job: h });
        if (r.cancelled || stopped()) throw STOP;
        if (r.timedOut) throw new Error('maps.e.timeout');
        MODPAKS.clear();
        maps = enrich(game, parseList(r.stdout), exe);
        if (!maps.length) mine.detail = (r.stderr || '').slice(0, 200);
      }
      if (stopped()) throw STOP;   // nothing is kept or cached after a stop
      if (!maps.length) throw new Error('maps.e.nomaps');
      mine.maps = maps; mine.at = Date.now(); mine.state = 'done';
      LMEM.delete(storeOf(ctx).root + '|' + id);
      try { storeOf(ctx).put('maps.list', LIST_VER, listParts(ctx, game), stamps, { at: mine.at, maps }); } catch (e) { /* the store is best effort */ }
    } catch (e) {
      if (e === STOP || stopped()) { mine.state = 'stopped'; end = 'cancelled'; }
      else { mine.state = 'error'; mine.error = /^maps\.e\./.test(e.message) ? e.message : 'maps.e.listcrash'; mine.detail = mine.detail || String(e.message || e).slice(0, 200); end = mine.error === 'maps.e.timeout' ? 'timeout' : 'failed'; }
    } finally { h.end(end); }   // every path: a job that is not ended is listed forever
  })();
  return { state: 'running', elapsed: 0 };
}

// ---- picture: mapview --svg (cached). A map that lives only in a mod has none.
async function pictureRoute(url, body, ctx) {
  const game = needGame(ctx), key = mapKeyOk(url.searchParams.get('map'));
  const info = mapInfo(ctx, game, key, url.searchParams.get('from'));
  if (!info.copy) return { svg: null };
  // the store keeps the picture: the game stamp for a map of the game, plus the files of the map's folder in each mod it is read from
  const S = storeOf(ctx), parts = { game: lowDir(game), gid: gidOf(ctx), map: key, mods: info.mods.map(m => String(m).toLowerCase()) };
  const stamps = { game: gameview.stamp({ gameDir: game, gid: gidOf(ctx) }), map: picSig(game, key, info.mods) };
  let hit = null; try { hit = S.get('maps.pic', PIC_VER, parts, stamps); } catch (e) { hit = null; }
  if (hit && typeof hit.value === 'string') return { svg: hit.value };
  // mapview writes a file: a scratch name in the temp folder (not a cache), read into the store and removed
  const rel = key.replace(/^map\//, ''), file = path.join(tmpDir(ctx), 'pic-' + sha(S.key('maps.pic', parts)) + '-' + process.pid + '-' + (++PICN) + '.svg');
  {
    const a = ['--game', game, '--map', rel, '--width', '70', '--svg', file, '-q'].concat(exeArgs(ctx));
    if (info.mods.length) a.push('--mods', info.mods.join(','));
    const r = await ctx.runTool('mapview', 'mapview/mapview.js', a, { timeoutMs: 90000 });
    // a killed mapview (stopped, or out of time) may leave half a picture: dropped, or it would be served from the cache from then on
    if (gone(ctx, r) || r.timedOut) { try { fs.rmSync(file, { force: true }); } catch (e) { /* not there */ } return { svg: null, cancelled: gone(ctx, r) }; }
    if (r.code !== 0 || !fs.existsSync(file)) { try { fs.rmSync(file, { force: true }); } catch (e) { /* not there */ } return { svg: null }; }
  }
  const svg = fs.readFileSync(file, 'utf8');
  try { fs.rmSync(file, { force: true }); } catch (e) { /* stays in the temp folder */ }
  try { S.put('maps.pic', PIC_VER, parts, stamps, svg); } catch (e) { /* the store is best effort */ }
  return { svg };
}
let PICN = 0;
// name, size and mtime of the files directly in <game>/mods/<id>/resource/<map key> for each named mod, and of the paks directly in
// that mod's resource folder (they may hold the map). A map of the game alone: ''
function picSig(game, key, mods) {
  const rows = [];
  for (const id of mods) {
    const tag = String(id).toLowerCase(), d = ciJoin(game, 'mods/' + id + '/resource/' + key), res = ciJoin(game, 'mods/' + id + '/resource');
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { es = []; }
    for (const e of es) { if (!e.isFile()) continue; try { const s = fs.statSync(path.join(d, e.name)); rows.push(tag + '|' + e.name.toLowerCase() + '|' + s.size + '|' + Math.floor(s.mtimeMs)); } catch (x) { /* gone */ } }
    let ps = []; try { ps = fs.readdirSync(res); } catch (e) { ps = []; }
    for (const n of ps) { if (!/\.pak$/i.test(n)) continue; try { const s = fs.statSync(path.join(res, n)); rows.push(tag + '|pak|' + n.toLowerCase() + '|' + s.size + '|' + Math.floor(s.mtimeMs)); } catch (x) { /* gone */ } }
  }
  return rows.length ? crypto.createHash('sha1').update(rows.sort().join('\n')).digest('hex') : '';
}

// ---- {enableBots} in a mode card (set/multiplayer/games/<mode>.set): same insertion as mission-clone --with-mode (TST-03)
function live(s) {
  let o = '', q = false;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '"' || c === '\n') q = false; o += c; continue; }
    if (c === '"') { q = true; o += c; continue; }
    if (c === ';') { while (j < s.length && s[j] !== '\r' && s[j] !== '\n') { o += ' '; j++; } j--; continue; }
    o += c;
  }
  return o;
}
function blockEnd(lv, i) {
  let d = 0, q = false;
  for (let j = i; j < lv.length; j++) { const c = lv[j]; if (q) { if (c === '"' || c === '\n') q = false; continue; } if (c === '"') q = true; else if (c === '{') d++; else if (c === '}' && --d === 0) return j; }
  return -1;
}
function addBots(text) {   // -> {text, state:'added'|'present'|'fail'}
  const e = text.includes('\r\n') ? '\r\n' : '\n', lv = live(text);
  if (/\{\s*enableBots\b/i.test(lv)) return { text, state: 'present' };
  const sm = /\{\s*settings\b/i.exec(lv), end = sm ? blockEnd(lv, sm.index) : -1;
  if (end > 0) {
    const ls = text.lastIndexOf('\n', end - 1) + 1, pre = /^[ \t]*$/.test(text.slice(ls, end)) ? ls : end;
    return { text: text.slice(0, pre) + (pre === end ? ' {enableBots}' : '\t\t{enableBots}' + e) + text.slice(pre), state: 'added' };
  }
  const last = text.lastIndexOf('}');
  if (last < 0) return { text, state: 'fail' };
  return { text: text.slice(0, last) + '\t{settings' + e + '\t\t{enableBots}' + e + '\t}' + e + text.slice(last), state: 'added' };
}
// exe = the vfs exe of the game ('as64' | 'mowas_2' | 'goh'); none = as before (as64 first), and 'goh' when game is a GoH install.
// The GoH mode card has the same {settings {enableBots}} form ([V] battle_zones.set, gohweb gameplay/goh-session-settings).
function botsFor(game, mod, modes, write, exe) {
  const res = [];
  let vf = null;
  if (!exe && games.detect(game) === 'goh') exe = 'goh';
  for (const m of modes) {
    const rel = 'resource/set/multiplayer/games/' + m + '.set', dst = path.join(mod, ...rel.split('/'));
    let buf = null;
    if (fs.existsSync(dst)) buf = fs.readFileSync(dst);
    else { try { if (!vf) { const vfs = require('../../../lib/vfs'); vf = { v: gameView(game, exe), r: vfs.readRec }; } const rec = vf.v.files.get(rel); if (rec) buf = vf.r(rec); } catch (e) { /* none */ } }
    if (!buf) { res.push({ mode: m, state: 'nocard' }); continue; }
    const r = addBots(buf.toString('latin1'));
    if (r.state === 'added' && write) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, Buffer.from(r.text, 'latin1')); }
    res.push({ mode: m, state: r.state });
  }
  return res;
}

// ---- milint on the mod -> {count, findings}; only 'missions' keeps the mission codes (MI_, MIS_, MC_) before the count and the cut
const MIS_CODE = /^(WARN_)?(MI|MIS|MC)_/;
async function lintMod(ctx, game, mod, only) {
  const r = await ctx.runTool('milint', 'milint/milint.js', [mod, '--game', game].concat(exeArgs(ctx)), { timeoutMs: 300000 });
  if (gone(ctx, r)) return { ran: false, cancelled: true, count: 0, findings: [] };   // stopped from the job list
  const na = naLine(r);
  if (na) return { ran: false, na, count: 0, findings: [] };   // milint refuses this game: its one plain line
  let f = parse(r.stdout).filter(x => x.sev !== 'info' || /^MAP_|^MI_|^MIS_/.test(x.code));
  if (only === 'missions') f = f.filter(x => MIS_CODE.test(x.code));
  const hard = f.filter(x => x.sev !== 'info');
  return { ran: !r.timedOut, count: hard.length, findings: f.slice(0, 40).map(x => ({ sev: x.sev, code: x.code, where: (x.where || '').replace(/^resource\//, ''), msg: x.msg.slice(0, 300) })) };
}

async function modesOf(ctx, game, mapKey) {
  if (isGoh(ctx)) {   // GoH: from the list (job or cache), else the map's own <mode>.info in the GoH file set
    const l = listed(ctx, game), m = l && l.find(x => x.key === mapKey);
    if (m) return m.modes;
    const one = listGoh(game, { only: mapKey })[0];
    return one ? one.modes : [];
  }
  const r = await ctx.runTool('mission-clone', 'mission-clone/mission-clone.js', ['--game', game, '--map', mapKey, '--list'].concat(exeArgs(ctx)), { timeoutMs: 120000 });
  const l = parseList(r.stdout).find(m => m.key === mapKey);
  return l ? l.modes : [];
}

// ---- a game mode the map does not have, derived with mission-clone (the clone route and the Missions page both use it).
// o = {game, mod, map, srcMap, from, to, flags, modes, mods, write}: map = the map the mode file goes to; srcMap = the map to read it
// from when map is a map-clone output in the mod (write only). A preview is a dry run on the source map. -> {ok, from, say, findings}
// o.gid (Missions page): the game the caller names; none = the route ctx's game. GoH: mission-clone --exe goh derives a GoH mode
// (GoH to GoH [I]: the battle_zones family is the file as is, another pair is a verbatim copy + MC_NEEDS_MANUAL for the GHMAP-03 flags;
// combat and frontline are refused by the tool with its one plain line); GoH has no --flags (AS2 flag count), so none is sent.
async function addMode(ctx, o) {
  const { game, mod, to, write } = o, modes = o.modes || [], mods = o.mods || [], src = o.srcMap || o.map;
  const gid = (o.gid && games.idOf(o.gid)) || gidOf(ctx), goh = games.kindOf(gid) === 'goh';
  const xa = gid === 'as64' ? [] : ['--exe', games.exeOf(gid)];
  const out = { ok: true, from: null, say: [], findings: [] };
  const from = o.from || (goh ? MODES_GOH : ['combat', 'battle_zones', 'captureflag']).find(m => modes.includes(m)) || modes[0];
  if (!from) { out.ok = false; out.say.push({ k: 'maps.s.nomodes' }); return out; }
  out.from = from;
  let flags = null;
  if (!goh && to === 'battle_zones' && o.flags != null && String(o.flags).trim() !== '') { flags = Number(o.flags); if (!Number.isInteger(flags) || flags < 1 || flags > 31) throw bad('maps.e.flags'); }
  // MIS-62: captureflag on a map without the clips captureflaga and captureflagb crashes the game when the mode starts (refused here,
  // as the mission recipe does; mission-clone says MC_NO_CAPTURE_CLIPS too, this answers before it runs)
  // map.recipe readKey reads the game's own view: no exe for AS64 (as before), the vfs exe for MoW:AS2 (no as64/core). captureflag is
  // an AS2 mode only (GoH has campaign_capture_the_flag, refused above by the mode list)
  if (to === 'captureflag' && !goh) {
    let t = null; try { const b = require('../task/recipes/map.recipe')._t.readKey(game, mod, 'resource/' + src + '/map', mods, gid === 'as64' ? undefined : games.exeOf(gid)); t = b ? b.toString('latin1') : null; } catch (e) { /* not read: mission-clone decides */ }
    if (t != null && (!/"captureflaga"/i.test(t) || !/"captureflagb"/i.test(t))) { out.ok = false; out.findings.push({ sev: 'error', code: 'MC_NO_CAPTURE_CLIPS', msg: '' }); out.say.push({ k: 'maps.s.modefail', p: { mode: to } }); return out; }
  }
  const a2 = ['--game', game, '--from', from, '--to', to, '--out', mod, '--no-lint', '--no-modinfo', '-q'].concat(mods.length ? ['--mods', mods.join(',')] : [], xa);
  if (flags != null) a2.push('--flags', String(flags));
  if (write) { a2.push('--map', o.map); if (o.srcMap) a2.push('--src-map', o.srcMap); } else a2.push('--map', src, '--dry-run');
  const r2 = await ctx.runTool('mission-clone', 'mission-clone/mission-clone.js', a2, { timeoutMs: 300000 });
  if (gone(ctx, r2)) { out.ok = false; out.cancelled = true; return out; }   // stopped: the caller decides what to clear
  const na2 = naLine(r2); if (na2) { out.ok = false; out.say.push({ k: 'maps.s.na', p: { why: na2 } }); return out; }
  const f2 = parse(r2.stdout + '\n' + r2.stderr);
  out.findings.push(...pub(f2));
  // GoH, a pair outside the battle_zones family: mission-clone copies the mode file verbatim and exits 1 with MC_NEEDS_MANUAL only (the
  // flags are the user's, GHMAP-03). The mode file is made, so the copy goes on (title, bots, check) with the manual step said plainly.
  const manualOnly = goh && r2.code === 1 && errors(f2).length > 0 && errors(f2).every(x => x.code === 'MC_NEEDS_MANUAL');
  // the manual step is a warning on the page, not an error line under the green "plan OK" / "done" (the route answers ok)
  if (manualOnly) { out.findings = out.findings.map(x => (x.code === 'MC_NEEDS_MANUAL' && x.sev === 'error' ? Object.assign({}, x, { sev: 'warn' }) : x)); out.say.push({ k: write ? 'maps.s.gohmodemade' : 'maps.s.gohwillmode', p: { mode: to, from } }); return out; }
  if (r2.code !== 0 || errors(f2).length) { out.ok = false; out.say.push({ k: 'maps.s.modefail', p: { mode: to } }); return out; }
  out.say.push({ k: write ? 'maps.s.modemade' : 'maps.s.willmode', p: { mode: to, from } });
  return out;
}

// ---- lobby title: lng-add writes it (one text writer in the toolkit). AS2: --file mission/<rel>.lng (MoW:AS2 with --exe mowas_2 --game G).
// GoH: lng-add --exe goh --game <GoH> --file mission/<rel>.pot = <mod>/localizations/default/interface/text/mission/<rel>.pot, one gettext
// entry msgctxt "mission/<rel>/name" + msgid <title> + msgstr "" (GHLOC-01, GHLOC-06 [V]); map-clone --target goh writes its "[clone]
// <name>" entry to this same file, so --force replaces that entry; a file already there keeps its line ends and BOM, a new one is CRLF.
// lng-add refuses a folder inside the GoH install (writeguard, exit 2): its line is shown. That GoH shows it in the lobby is [T] (fix row).
function titleArgs(ctx, game, mod, rel, title) {
  const key = 'mission/' + rel + '/name', gid = gidOf(ctx);
  const a = [mod, '--file', 'mission/' + rel + (isGoh(ctx) ? '.pot' : '.lng'), '--key', key, '--text', title, '--force'];
  return gid === 'as64' ? a : a.concat(['--exe', exeOf(ctx), '--game', game]);   // the AS64 argument list stays as it was
}

// ---- clone: plan (write false) or write
// A stop (job list Cancel): the route returns at its next step and the dispatcher answers 499. What the stop left is kept per game + mod
// for GET clone/status: 'nothing' (a preview, or stopped before the copy began), 'removed' (the write was stopped while the copy, the
// mode file or the title was being made: the map folder and the title file are removed when this request made them; map-clone refuses a
// folder that is already there, so a folder that existed before is never this request's), 'left' (a removal failed: left = paths under
// the mod), 'complete' (only the final check was stopped: the copy is whole and stays). Not put back: mod.info when map-clone made it
// (a mod folder needs one anyway) and empty parent folders.
const CLONESTOP = new Map();
const inDir = (p, root) => path.resolve(p).toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep);
async function cloneStatusRoute(url, body, ctx) {
  const game = needGame(ctx), mod = path.resolve(String(url.searchParams.get('mod') || ''));
  return CLONESTOP.get(keyOf(ctx, game) + '|' + mod.toLowerCase()) || { state: 'none', left: [] };
}
// a write route's last step, on every way out: the shared walk of the mod reads the folder again (README CACHE: touch after a write)
const touchMod = (ctx, mod) => { try { ((ctx && ctx.modtree) || modtreeLib).touch(mod); } catch (e) { /* nothing to forget */ } };
async function cloneRoute(url, body, ctx) {
  const write = !!(body && body.write);
  try { return await cloneRoute0(url, body, ctx); } finally { if (write && body && typeof body.mod === 'string' && body.mod.trim()) touchMod(ctx, path.resolve(body.mod.trim())); }
}
async function cloneRoute0(url, body, ctx) {
  body = body || {};
  const game = needGame(ctx), mod = safeMod(body.mod, ctx), src = mapKeyOk(body.map), name = nameOk(body.name), write = !!body.write;
  const mode = body.mode && body.mode !== 'keep' ? String(body.mode) : 'keep', goh = isGoh(ctx), xa = exeArgs(ctx);
  if (mode !== 'keep' && !modesFor(ctx).includes(mode)) throw bad('maps.e.mode');
  const title = String(body.title || '').trim() || body.name, bots = !!body.bots;
  if (title.length > 120 || /[\r\n]/.test(title)) throw bad('maps.e.title');
  const parent = src.split('/').slice(0, -1).join('/'), newKey = parent + '/' + name, rel = newKey.replace(/^map\//, '');
  const info = mapInfo(ctx, game, src, body.from), modsArg = info.mods.length ? ['--mods', info.mods.join(',')] : [];
  if (!info.copy) return { write, mod, newKey, newName: name, ok: false, say: [{ k: 'maps.s.nocopy' }], findings: [], sources: src };
  if (write) writesNow(ctx);   // JOBS: the job list asks twice before it stops a write
  // what this request may make: the map folder (map-clone) and the title file (map-clone, then lng-add); true = not there before
  const destDir = path.join(mod, 'resource', ...newKey.split('/'));
  const titleFile = path.join(mod, ...(goh ? ['localizations', 'default', 'interface', 'text'] : ['localization']), 'mission', ...rel.split('/')) + (goh ? '.pot' : '.lng');
  const fresh = { dir: !fs.existsSync(destDir), title: !fs.existsSync(titleFile) };
  const stopKey = keyOf(ctx, game) + '|' + path.resolve(mod).toLowerCase();
  CLONESTOP.delete(stopKey);
  let stage = 'before';   // before | copy (files of this request may be half made) | complete (only the check is left)
  const modes = await modesOf(ctx, game, src);
  const out = { write, mod, newKey, newName: name, modesSrc: modes, say: [], findings: [], ok: true, sources: src, mods: info.mods };
  const stopOut = () => {
    const st = { newKey, write, state: 'nothing', left: [] };
    if (write && stage === 'complete') st.state = 'complete';
    else if (write && stage === 'copy') {
      st.state = 'removed';
      for (const [was, p, dir] of [[fresh.dir, destDir, true], [fresh.title, titleFile, false]]) {
        if (!was || !inDir(p, mod) || !fs.existsSync(p)) continue;   // only what this request made, only inside the mod
        try { fs.rmSync(p, { recursive: dir, force: true, maxRetries: 5, retryDelay: 100 }); } catch (e) { /* said below */ }
        if (fs.existsSync(p)) { st.state = 'left'; st.left.push(fwd(path.relative(mod, p))); }
      }
    }
    CLONESTOP.set(stopKey, st);
    out.ok = false; out.cancelled = true; out.stop = st;
    return out;
  };
  if (gone(ctx)) return stopOut();
  const hasMode = mode === 'keep' || modes.includes(mode);
  // 1) the map copy (a map from a mod: read from that mod too, GT-07)
  // the game the copy is for: the page sends its current game (curGame().target); map-clone takes as64 or mowas2 on the AS2 install and
  // goh on the GoH install (a map.net of the other game is refused there, MAPCLONE_GAME_MISMATCH)
  const target = goh ? 'goh' : body.target === 'mowas2' || (body.target == null && gidOf(ctx) === 'mowas2') ? 'mowas2' : 'as64';
  const args = ['--game', game, '--map', src, '--name', name, '--out', mod, '--target', target].concat(modsArg, xa);
  if (!write) args.push('--plan');
  if (mode !== 'keep' && hasMode) args.push('--only-mode', mode);
  if (write) stage = 'copy';
  const r1 = await ctx.runTool('map-clone', 'map-clone/map-clone.js', args, { timeoutMs: 300000 });
  if (gone(ctx, r1)) return stopOut();
  const na1 = naLine(r1); if (na1) { out.ok = false; out.say.push({ k: 'maps.s.na', p: { why: na1 } }); return out; }
  const f1 = parse(r1.stdout + '\n' + r1.stderr);
  out.findings.push(...pub(f1));
  const sg = suggest(f1); if (sg.length) out.suggest = sg;
  if (r1.code !== 0 || errors(f1).length) { out.ok = false; out.say.push({ k: 'maps.s.copyfail' }); return out; }
  const nfiles = (/(\d+) files (?:planned|written)/.exec(r1.stdout) || [])[1];
  out.say.push({ k: write ? 'maps.s.copied' : 'maps.s.willcopy', p: { files: nfiles || '?', key: newKey } });
  // 2) a game mode the map does not have: derive it with mission-clone
  let finalModes = mode === 'keep' ? modes : [mode];
  if (!hasMode) {
    // the dry run of the source map is enough for a preview; a write reads the source map and writes into the copy
    const am = await addMode(ctx, { game, mod, map: write ? newKey : src, srcMap: write ? src : null, to: mode, modes, mods: info.mods, write });
    if (am.cancelled || gone(ctx)) return stopOut();
    out.findings.push(...am.findings); out.say.push(...am.say);
    if (!am.ok) { out.ok = false; return out; }
    finalModes = [mode];
  } else if (mode !== 'keep') out.say.push({ k: 'maps.s.modekeep', p: { mode } });
  // 3) lobby title
  const key = 'mission/' + rel + '/name';
  if (write) {   // GoH text is .pot (GHLOC-01, GHLOC-06), AS2 text .lng: lng-add writes either (titleArgs)
    const r3 = await ctx.runTool('lng-add', 'lng-add/lng-add.js', titleArgs(ctx, game, mod, rel, title), { timeoutMs: 60000 });
    if (gone(ctx, r3)) return stopOut();
    const first = String((r3.stderr || '') + '\n' + (r3.stdout || '')).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (goh && r3.code === 2 && first.length) { out.ok = false; out.say.push({ k: 'maps.s.na', p: { why: first[0] } }); return out; }   // a refusal (writeguard): its line
    if (r3.code !== 0) { out.ok = false; out.findings.push({ sev: 'error', code: 'LNG_FAIL', msg: (r3.stdout + r3.stderr).trim().split(/\r?\n/)[0] }); out.say.push({ k: 'maps.s.titlefail' }); return out; }
  }
  out.say.push({ k: write ? 'maps.s.title' : 'maps.s.willtitle', p: { title, key } });
  // 4) bots
  if (bots) {
    out.bots = botsFor(game, mod, finalModes.filter(m => modesFor(ctx).includes(m)), write, gidOf(ctx) === 'as64' ? undefined : exeOf(ctx));
    out.say.push({ k: write ? 'maps.s.bots' : 'maps.s.willbots', p: { modes: out.bots.map(b => b.mode).join(', ') } });
  }
  // 5) after a write: milint
  if (write) { stage = 'complete'; out.check = await lintMod(ctx, game, mod); if (out.check.cancelled || gone(ctx)) return stopOut(); out.needsTest = true; }
  return out;
}

// ---- place one static object, metres in, map units out
// A stop: place-entity reads for most of its time and writes its files in one go at the end, so a stop nearly always leaves the mod as it
// was; the route returns at once, runs no check and confirms nothing (the page says so and points at the check).
async function placeRoute(url, body, ctx) {
  const write = !!(body && body.write);
  try { return await placeRoute0(url, body, ctx); } finally { if (write && body && typeof body.mod === 'string' && body.mod.trim()) touchMod(ctx, path.resolve(body.mod.trim())); }
}
async function placeRoute0(url, body, ctx) {
  body = body || {};
  const game = needGame(ctx), mod = safeMod(body.mod, ctx), write = !!body.write;
  const key = mapKeyOk(body.map), rel = key.replace(/^map\//, '');
  const entity = String(body.entity || '').trim();
  if (!/^[A-Za-z0-9_.\-/]{1,80}$/.test(entity)) throw bad('maps.e.entity');
  const n = v => { const x = Number(String(v).replace(',', '.')); if (!isFinite(x)) throw bad('maps.e.number'); return x; };
  const xm = n(body.x), ym = n(body.y), zm = body.z === '' || body.z == null ? null : n(body.z);
  const pos = [Math.round(xm * UNITS_PER_M), Math.round(ym * UNITS_PER_M)]; if (zm != null) pos.push(Math.round(zm * UNITS_PER_M));
  // GoH: the same scale [I] (UNITS_PER_M), said in a line; the tool writes through lib/modwrite (restore point first) and reads the map back
  const args = [mod, '--game', game, '--map', rel, '--entity', entity, '--pos', pos.join(',')].concat(exeArgs(ctx));
  if (body.dir !== '' && body.dir != null) args.push('--dir', String(n(body.dir)));
  if (!write) args.push('--dry-run'); else writesNow(ctx);
  // the entity index build on a cold cache with many jobs running passes 120 s (real run on the AS2 install), so 300 s as the clone
  const r = await ctx.runTool('place-entity', 'place-entity/place-entity.js', args, { timeoutMs: 300000 });
  if (gone(ctx, r)) return { write, units: pos, findings: [], ok: false, cancelled: true, say: [] };
  if (r.timedOut) return { write, units: pos, findings: [], ok: false, say: [{ k: 'maps.s.placetimeout' }] };
  const na = naLine(r); if (na) return { write, units: pos, findings: [], ok: false, say: [{ k: 'maps.s.na', p: { why: na } }] };
  const f = parse(r.stdout + '\n' + r.stderr);
  const out = { write, units: pos, findings: pub(f), ok: r.code === 0 && !errors(f).length, say: isGoh(ctx) ? [{ k: 'maps.s.gohscale' }] : [] };
  const rp = /restore point (\S+?)\)/.exec(r.stdout || ''); if (rp && write) { out.restore = rp[1]; out.say.push({ k: 'maps.s.gohundo', p: { id: rp[1] } }); }   // GoH: the tool's restore point (Files page)
  if (out.ok) { out.say.push({ k: write ? 'maps.s.placed' : 'maps.s.willplace', p: { x: xm, y: ym, ux: pos[0], uy: pos[1], entity } }); if (write) { out.check = await lintMod(ctx, game, mod); out.needsTest = true; } }
  return out;
}

// GET /api/x/maps/entities?mod= -> {entities: [{name, group}]}: the entity names place-entity takes (.def basenames under resource/entity/,
// group = the folder under it), from the game's file set plus the mod folder. Kept in the store (maps.ents) per game + mod under the
// stamps {game, mod:entity, mod:pak, mod:other} of lib/modtree (the shared walk; other holds mod.info, whose Delete lines can hide a
// name), so a restart or a second ask builds nothing and an edit of another area (a map, a set file) leaves it. No mod: the shared game
// view. With a mod a miss takes the shared layered view (lib/gameview withMods: mod.info Delete, the mod's paks and N.pat decide the
// names; built from the shared walk's listing), once per change of those areas. Read only; the index of the place card's entity box (searchKit)
function entsOf(v) {
  const seen = new Map();
  for (const f of v.files.keys()) {
    if (!f.startsWith('resource/entity/') || !f.endsWith('.def')) continue;
    const p = f.split('/'), name = p[p.length - 1].slice(0, -4);
    if (name && !seen.has(name)) seen.set(name, { name, group: p.length > 3 ? p[2] : '' });
  }
  return { entities: [...seen.values()].sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : a.name < b.name ? -1 : 1)) };
}
// the mod folder the entity list is asked for: '' when none is named or it is no folder
function entsMod(m) { let mod = String(m || '').trim(); try { if (!mod || !fs.statSync(mod).isDirectory()) mod = ''; } catch (e) { mod = ''; } return mod; }
async function entitiesRoute(url, body, ctx) {
  const game = needGame(ctx), q = url.searchParams, gid = gidOf(ctx);
  const mod = entsMod(q.get('mod'));
  const mt = (ctx && ctx.modtree) || modtreeLib;
  let T = null; if (mod) { try { T = await mt.ensure(mod); } catch (e) { T = null; } }
  const stamps = Object.assign({ game: gameview.stamp({ gameDir: game, gid }) }, mod ? mt.stamps(T, ['entity', 'pak', 'other']) : {});
  // the layered view is the shared one too (lib/gameview withMods: built from the walk's listing on top of the game view, no walk here)
  const make = async () => entsOf(mod ? await gameview.withMods({ gameDir: game, exe: exeOf(ctx), mods: [mod] }) : gameview.get({ gameDir: game, gid }));
  if (mod && !T) return make();   // the mod could not be walked: nothing to stamp it with, so nothing is kept
  return storeOf(ctx).wrap('maps.ents', ENTS_VER, { game: lowDir(game), gid, mod: mod ? lowDir(mod) : '' }, stamps, make);
}
async function checkRoute(url, body, ctx) {
  body = body || {};
  const game = needGame(ctx), mod = safeMod(body.mod, ctx, true);
  return { check: await lintMod(ctx, game, mod, body.only === 'missions' ? 'missions' : null) };
}

// ---- Prepare (gui README "Prepare sections"): the map list. q = {mod, game: {id, dir, exe}}; the route's own code on a ctx that names
// q's game, so the Maps page then finds the list in the store. Game only (areas []): the list does not read the current mod.
function prepCtx(ctx, q) {
  const g = (q && q.game) || {}, c = Object.create(ctx || null);
  if (g.id) c.gameId = () => g.id;
  if (g.dir) { c.game = () => g.dir; c.curDir = () => g.dir; if (games.kindOf(games.idOf(g.id) || 'as64') === 'goh') c.gohDir = () => g.dir; }
  return c;
}
const PREP = [{
  id: 'maps.list', title: 'maps.prep.list', needs: ['game.view'], areas: [],
  state(ctx, q) {
    const c = prepCtx(ctx, q); let game; try { game = needGame(c); } catch (e) { return { state: 'na', why: [] }; }
    return storeOf(c).state('maps.list', LIST_VER, listParts(c, game), listStamps(c, game));
  },
  async run(ctx, q, job) {
    const c = prepCtx(ctx, q), game = needGame(c), id = keyOf(c, game), U = { searchParams: new URLSearchParams('') };
    if (job && job.set) job.set({ stage: 'maps.prep.list', done: 0, total: 1 });
    let r = await listRoute(U, null, c);
    // a stopped or failed scan of before does not answer for this run: ask once more for a new one
    if (r.state === 'error') r = await listRoute({ searchParams: new URLSearchParams('refresh=1') }, null, c);
    while (r.state === 'running') {
      if (job && job.cancelled) { const j = JOBS.get(id); if (j) j.stop = true; return { cancelled: true }; }
      await new Promise(res => setTimeout(res, 150));
      r = await listRoute(U, null, c);
    }
    if (r.state !== 'done') throw new Error(r.error || 'maps.e.listcrash');
    if (job && job.set) job.set({ stage: 'maps.prep.list', done: 1, total: 1 });
    return { maps: r.maps.length };
  },
}, {
  // the entity names of the place card (maps.ents): the route's own code, so the page then finds them in the store. No mod (or one
  // that is no folder): the game's own names, as the route answers then. state reads no file of the mod (modtree.last).
  id: 'maps.ents', title: 'maps.prep.ents', needs: ['game.view', 'mod.tree'], areas: ['entity', 'pak', 'other'],
  state(ctx, q) {
    const c = prepCtx(ctx, q); let game; try { game = needGame(c); } catch (e) { return { state: 'na', why: [] }; }
    const mod = entsMod(q && q.mod), gid = gidOf(c), mt = (c && c.modtree) || modtreeLib, T = mod ? mt.last(mod) : null;
    if (mod && !T) return { state: 'none', why: [] };
    return storeOf(c).state('maps.ents', ENTS_VER, { game: lowDir(game), gid, mod: mod ? lowDir(mod) : '' },
      Object.assign({ game: gameview.stamp({ gameDir: game, gid }) }, mod ? mt.stamps(T, ['entity', 'pak', 'other']) : {}));
  },
  async run(ctx, q, job) {
    const c = prepCtx(ctx, q), mod = entsMod(q && q.mod);
    if (job && job.set) job.set({ stage: 'maps.prep.ents', done: 0, total: 1 });
    const r = await entitiesRoute({ searchParams: new URLSearchParams(mod ? { mod } : {}) }, null, c);
    if (job && job.set) job.set({ stage: 'maps.prep.ents', done: 1, total: 1 });
    return { entities: r.entities.length };
  },
}];

module.exports = {
  id: 'maps', nav: 'maps.nav', adv: false,
  prep: PREP,
  script: require('./client'),
  lang: LANG,
  commands: {},
  routes: {
    'GET /api/x/maps/list': listRoute,
    'GET /api/x/maps/picture': pictureRoute,
    'POST /api/x/maps/clone': cloneRoute,
    'GET /api/x/maps/clone/status': cloneStatusRoute,
    'POST /api/x/maps/place': placeRoute,
    'POST /api/x/maps/check': checkRoute,
    'GET /api/x/maps/entities': entitiesRoute,
  },
  // the Missions page (ext/missions) and the Game Modes page use addMode, lintMod, botsFor and the guards
  _t: { parse, parseList, addBots, botsFor, addMode, lintMod, safeMod, needGame, mapKeyOk, suggest, mapInfo, enrich, pub, errors, MODES, MIS_CODE, UNITS_PER_M,
    MODES_GOH, modesFor, gidOf, exeArgs, naLine, listGoh, listGohJob, potTitles, titleArgs, modesOf, JOBS, CLONESTOP,
    modsSig, listStamps, listParts, storeOf, picSig, LIST_VER, PIC_VER, ENTS_VER, drop: () => { LMEM.clear(); MSIG.clear(); } },
};
