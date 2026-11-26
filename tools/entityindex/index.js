// entityindex/index: JSON cache of entities (+ stuff, models) over the VFS. module API for refcheck / q -e.
//   const ix = require('./index');
//   const idx = ix.build({ gameDir?, mods?, modDirs?, folder?, cache?, force?, allowUnmounted?, exe? })   build or refresh cache (only changed files re-parsed)
//     exe: 'as64' | 'mowas_2' (alias 'mowas2') | 'goh' -> the vfs view of that game (sdlset.createSource / vfs.build exe); none = the vfs
//       default (as64 when as64.exe is in gameDir). Unknown exe throws code BAD_EXE. One cache per exe: exe mowas_2 / goh write and read
//       <cache>.<exe>.json (ix.cachePath); no exe and exe as64 keep the given name (no exe over a GoH game folder counts as exe goh). meta.exe = the exe the vfs used; a cache whose
//       meta.exe differs from this run's is never reused (rebuilt cold), and load(file, exe) refuses it.
//     game folder: meta.game = the resolved gameDir. A cache built for another game folder is never reused (rebuilt cold). In the
//       shared cache folder (toolcache dir('entityindex')) the plain name belongs to the installed game (lib/games install); another
//       game folder gets <cache>[.<exe>].f<8 hex>.json (ix.cachePath(file, exe, gameDir)), so a fixture never overwrites it.
//       The stock index (<shared>/vanilla.json, no mod, no folder) is keyed by the game instead: an overlay game folder (tools/check
//       check-ov-*) maps to its real install, another install gets vanilla[.<exe>].<fingerprint 12 hex>.json (see "the stock index"
//       below: ix.realGame, ix.gameFp); stats.twin = the other AS2 exe's stock file written by the same build (writeTwin), or null.
//       The first build into the shared folder in a process removes stock files of check overlays that no longer exist (sweepOverlays).
//       No local stock index that fits: the shipped one (shipped/vanilla.<exe>.<fp12>.json.gz, ship.js) is taken or seeds the build
//       (findShipped below); stats.shipped = { file, exact } or null. load() writes out an exact shipped one when the cache is missing.
//     modDirs: mod folders by path laid over game + mods as layers (lib/vfs.js modDirs), active in the game or not; their paks count
//     throws Error code MOD_NOT_MOUNTED (.unmounted=[{name,why}]) when a named mod is not active in the vfs, unless allowUnmounted
//     checkpoint (o.checkpointEvery parsed files, default 2000, at most every o.checkpointMs, default 60000; 0 = none): the records so
//       far are written to the cache as meta.partial, so a build stopped half way (GUI time limit) is not lost: the next build reuses
//       them. load() refuses a partial cache. Every cache write goes to <file>.<pid>.part and is renamed in.
//     seed (shared cache folder, o.seed !== false): a cache with no usable file of its own (a mods-/folder- index) starts from the
//       vanilla cache of the same exe and game folder; records are dh-checked against this run's view, so changed ones are parsed again
//     a build with no gameDir and no folder never writes into the shared cache folder
//     bytes: with a gameDir, a file that other files include is read once per build (kept only until build returns; the index
//       is the same as with o.byteMemo: false, which reads it for every file that includes it, as before)
//     -> { idx, stats:{ entities, parsed, reused, ms, seeded: file|null, checkpoints } }   idx = Index (below)
//   ix.buildAsync(o) -> Promise<the same>   the same build (one code path: same order, same records, same cache file) for a caller
//     that can await: the loose files it is going to parse (and the includes an old record names) are read through the thread pool
//     ahead of the parser (lib/sdlset readAhead: 32 at a time, at most o.aheadBytes, default 64 MB, held), and the loop gets a turn
//     every 200 files. A file the read-ahead did not bring (not loose, failed, gone) is read as in build. o.readAhead: false =
//     no read-ahead (only the turns). stats.ahead = the read-ahead's counts
//   const idx = ix.load(cacheFile, exe?, gameDir?)         read a cache written by build (no VFS needed); exe picks that exe's cache file,
//       gameDir that folder's; a cache built for another game folder (meta.game) throws 'bad cache ...' (without gameDir: in the
//       shared cache folder, a cache not built for the installed AS2 game, built for exe goh with no exe named, or built with no
//       source at all, throws); a checkpoint (meta.partial) always throws
//   ix.normExe(x) -> 'as64'|'mowas_2'|'goh'|undefined     ix.cachePath(file, exe?, gameDir?) -> the cache file build/load use
//   ix.staleness(src, data) -> { stale:[key], added:[key], removed:[key] }   what --check prints
//   Index:  .meta  .entities{defKey:rec} .stuff{key:rec} .models{mdlKey:rec}
//     .byName(name) -> [rec]       entity records with that basename (case-insens.); engine name = basename of any .def
//     .usersOf(kind, value) -> [{ entity:rec, ref }]   reverse lookup; value compared case-insensitively
//     .tagsOf(stuffKey) -> Set     filename tags + {tag} strings + tags of stuff picked by {from} (recursive)
//     .stuffMatch(tagString) -> [stuffKey]   stuff whose tag set holds every word (tag -> stuff inverted index, built once)
//     .stuffHas(tagString) -> bool           any stuff matches (memoized per string)
//       NOTE: tagsOf/stuffMatch/stuffHas are a superset of the engine: FindStuff matches file-name tags only [V]
//     .stuffFind(tagString, withPatterns=false) -> [stuffKey]   engine-accurate lookup: file-name tags only, 'pattern' files skipped unless withPatterns
//     .fileTagsOf(stuffKey) -> Set file-name '.' tokens (engine tags)
//     .aux[name][key] = { deps, dh, data }   per-file facts computed by a caller extractor (build o.aux, below), stale-checked like records
//   build o.aux = { name: { select(key)->bool, extract(tree,key)->json, raw?:true (extract(buf,key)) } }  tables of other names kept as-is
//   entity rec: { key, name, layer, source:'vanilla'|'mod', inherits:[key], extenders:[name], extl:[[name,file,line]], etype:[word,file,line]|null (ENG-02), model:key|null,
//                 refs:[ [kind, value, file, line] ], ev:[ [kind,file,line,data,chassisId?] ] chassis facts, deps:[key], dh }
//     kinds: model weapon ammo item anim vision      (value = raw string; resolved at check time)
//   stuff rec:  { key, name, tags:[], from:string|null, refs:[...kind entity|sound...], deps, dh }
//   model rec:  { key, refs:[ [kind,value,file,line] ] kinds ply vol anm texture, deps, dh }
//   dh = hash of the signatures of every file the record was derived from (includes tried and missing) -> cache validity.
// Author: Imperator_Aug (ARSENAL, ia-279e19d9)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const cachewrite = require('../lib/cachewrite'), toolcache = require('../lib/toolcache');
// cache files: a path inside tools/entityindex/cache (the old default every caller builds) goes to the per-user cache folder
// (lib/toolcache: old file copied over once, read-only install folder works); any other --cache path is used as given
const LEGACY_CACHE = path.join(__dirname, 'cache'), cacheFile = f => toolcache.redirect('entityindex', f, LEGACY_CACHE);
// game exe (vfs names). A local map until tools/lib/games.js lands; undefined/'' = no exe named (vfs default)
const EXES = { as64: 'as64', mowas_2: 'mowas_2', mowas2: 'mowas_2', goh: 'goh' };
function normExe(x) {
  if (x === undefined || x === null || x === '') return undefined;
  const e = EXES[String(x).toLowerCase()];
  if (!e) { const err = new Error(`entityindex: unknown exe '${x}' (as64, mowas_2, mowas2, goh)`); err.code = 'BAD_EXE'; throw err; }
  return e;
}
// one cache per exe: mowas_2 / goh get '.<exe>' before the extension; no exe and as64 keep today's name.
// one cache per game folder in the shared cache folder (toolcache dir('entityindex'), or the old tools/entityindex/cache): there the
// plain name belongs to the installed game of that exe (lib/games install: as64/mowas_2 = the AS2 install, goh = the GoH install, no exe
// = the AS2 install; a GoH folder with no exe is keyed goh); any other game folder (a test fixture, a second copy of the game) gets '.f<8 hex of the folder>' before the extension, so
// it never overwrites the installed game's cache. A cache path outside the shared folder is the caller's and is used as given.
const sameDir = (a, b) => { const A = path.resolve(String(a)), B = path.resolve(String(b)); return process.platform === 'win32' ? A.toLowerCase() === B.toLowerCase() : A === B; };
const inside = (d, f) => { const r = path.relative(path.resolve(d), path.resolve(f)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const inShared = f => [toolcache.dir('entityindex'), LEGACY_CACHE].some(d => inside(d, f));
let HOMES = null;   // { at, as2, goh } the installed games, looked up at most every 30 s (gamedir may ask the registry)
function homeDirs(e) {
  if (!HOMES || Date.now() - HOMES.at > 30000) {
    const games = require('../lib/games'), one = id => { try { return games.install(id).dir || null; } catch (x) { return null; } };
    HOMES = { at: Date.now(), as2: one('as64'), goh: one('goh') };
  }
  return (e === 'goh' ? [HOMES.goh] : [HOMES.as2]).filter(Boolean);   // no exe = the AS2 install (a GoH folder is keyed goh, below)
}
const dirKey = d => crypto.createHash('md5').update(process.platform === 'win32' ? path.resolve(d).toLowerCase() : path.resolve(d)).digest('hex').slice(0, 8);
const addPart = (c, part) => { const ext = path.extname(c); return ext ? c.slice(0, -ext.length) + '.' + part + ext : c + '.' + part; };
// no exe named and a GoH game folder (lib/games detect): keyed as exe goh, so it writes the same <cache>.goh.json as --exe goh and never
// the plain name of the AS2 install. An AS2 folder with no exe keeps the plain name (as before).
const exeFor = (exe, gameDir) => normExe(exe) || (gameDir && gameDir !== '-' && require('../lib/games').detect(gameDir) === 'goh' ? 'goh' : undefined);
// ---- the stock index (vanilla.json: the game's own data, no mod, no folder) is keyed by the game, not by the folder.
// tools/check checks a mod outside <game>/mods in an overlay game folder Temp/check-ov-<random>/game (check.js overlay(): the
// install's folders junctioned, its root exes/paks copied). Keyed by that folder, no later run found the stock index (a 7 min build
// per game build, 31 MB left in the shared cache each run). Now:
//   realGame(dir): the install behind a game folder: the parent of the real path of its resource/ folder when that is a link to
//     another game folder (one that holds as64.exe, mowas_2.exe or binaries/x64/call_to_arms.exe), else the folder itself.
//   gameFp(real, exe): sha1 of name|size|mtime of every pak the view mounts (the lib/gameview stamp() rows: resource.pak,
//     localization.pak, N.pat at the root; *.pak at any depth and every file directly under resource/, localization/,
//     localizations/; the same under as64/core for the as64 view), read on the real install. null when the folder has no pak at
//     all (a loose test fixture): such a folder keeps a folder key. Unlike gameview.stamp it leaves the exe version out (the
//     records self-check by dh anyway) and follows links. Asked at most every 5 s per folder + view.
//   cachePath(<shared>/vanilla.json, exe, gameDir): the installed game (gameDir or its realGame) keeps the plain name as before;
//     any other game folder gets vanilla[.<exe>].<fp 12 hex>.json, or vanilla[.<exe>].f<8 hex of the real folder>.json with no
//     pak. An overlay and its install give the same file. Mod and folder indexes (mods-*, folder-*, ...) keep the f<8 hex of the
//     folder given>. meta.game of a stock index = the real install (display and the cleanup below), meta.fp = its fingerprint.
const isStock = c => path.basename(String(c)).toLowerCase() === 'vanilla.json';
const GAME_EXES = ['as64.exe', 'mowas_2.exe', 'binaries/x64/call_to_arms.exe'];
function realGame(d) {
  const R = path.resolve(String(d));
  try {
    const r = fs.realpathSync(path.join(R, 'resource'));
    if (path.basename(r).toLowerCase() !== 'resource') return R;
    const p = path.dirname(r);
    if (sameDir(p, R)) return R;
    return GAME_EXES.some(x => fs.existsSync(path.join(p, x))) ? p : R;
  } catch (e) { return R; }
}
const ROOT_PAK = /^(?:resource\.pak|localization\.pak|\d+\.pat)$/i, DATA_DIR = /^(?:resource|localization|localizations)$/i, SKIP_DIR = /^\.(?:git|svn)$/i;
function pakRows(root, tag, rows) {
  const list = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return []; } };
  const st = p => { try { return fs.statSync(p); } catch (e) { return null; } };
  const row = (rel, s) => rows.push(tag + rel + '|' + s.size + '|' + s.mtimeMs);
  const deep = (dir, rel, top, n) => {
    if (n > 32) return;
    for (const e of list(dir)) {
      const p = path.join(dir, e.name), r = rel + '/' + e.name.toLowerCase(), s = e.isSymbolicLink() ? st(p) : null;
      const isDir = s ? s.isDirectory() : e.isDirectory();
      if (isDir) { if (!SKIP_DIR.test(e.name)) deep(p, r, false, n + 1); }
      else if (top || /\.pak$/i.test(e.name)) { const t = s || st(p); if (t) row(r, t); }
    }
  };
  for (const e of list(root)) {
    const p = path.join(root, e.name), s = e.isSymbolicLink() ? st(p) : null, isDir = s ? s.isDirectory() : e.isDirectory();
    if (isDir) { if (DATA_DIR.test(e.name)) deep(p, e.name.toLowerCase(), true, 0); }
    else if (ROOT_PAK.test(e.name)) { const t = s || st(p); if (t) row(e.name.toLowerCase(), t); }
  }
}
const FPS = new Map(), FP_MS = 5000;
function fpRows(real, e) {
  const as64 = e === 'as64' || (!e && fs.existsSync(path.join(real, 'as64.exe')));
  const rows = [];
  pakRows(real, '', rows);
  if (as64) pakRows(path.join(real, 'as64', 'core'), 'as64/core/', rows);
  return rows.sort();
}
function gameFp(real, e) {
  const as64 = e === 'as64' || (!e && fs.existsSync(path.join(real, 'as64.exe')));
  const k = path.resolve(real).toLowerCase() + '|' + (as64 ? 'as64' : ''), c = FPS.get(k), now = Date.now();
  if (c && now - c.at < FP_MS) return c.fp;
  const rows = fpRows(real, e);
  const fp = rows.some(r => /\.(pak|pat)\|/.test(r)) ? crypto.createHash('sha1').update(rows.join('\n')).digest('hex') : null;
  if (FPS.size > 64) FPS.clear();
  FPS.set(k, { fp, at: now });
  return fp;
}
function cachePath(f, exe, gameDir) {
  const e = exeFor(exe, gameDir);
  let c = cacheFile(f);
  const stock = isStock(c);
  if (e && e !== 'as64') c = addPart(c, e);
  if (gameDir && gameDir !== '-' && inShared(c)) {
    if (stock) {
      const real = realGame(gameDir);
      if (!homeDirs(e).some(h => sameDir(h, real))) { const fp = gameFp(real, e); c = addPart(c, fp ? fp.slice(0, 12) : 'f' + dirKey(real)); }
    } else if (!homeDirs(e).some(h => sameDir(h, gameDir))) c = addPart(c, 'f' + dirKey(gameDir));
  }
  return c;
}
// the game folder a cache was built for matches this one (both none = a folder-only index): the same folder, the same real install
// (an overlay of it), or for a stock index the same fingerprint (fp: this run's, or null)
const sameGame = (meta, gameDir, fp) => (!meta.game && !gameDir) || (!!meta.game && !!gameDir && (sameDir(meta.game, gameDir) ||
  sameDir(realGame(meta.game), realGame(gameDir)) || (!!fp && meta.fp === fp)));
// the meta of a cache file from its first bytes (pack writes meta first), without parsing a 31 MB file; null = not readable
function metaHead(f) {
  let fd = null;
  try {
    fd = fs.openSync(f, 'r');
    const b = Buffer.alloc(16384), n = fs.readSync(fd, b, 0, b.length, 0);
    return metaOf(b.toString('utf8', 0, n));
  } catch (e) { return null; } finally { if (fd !== null) try { fs.closeSync(fd); } catch (e) { /* closed */ } }
}
function metaOf(s) {
  if (!s.startsWith('{"meta":{')) return null;
  let q = false;
  for (let i = 9; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '\\') i++; else if (ch === '"') q = false; }
    else if (ch === '"') q = true;
    else if (ch === '{') return null;
    else if (ch === '}') { try { return JSON.parse(s.slice(8, i + 1)); } catch (e) { return null; } }
  }
  return null;
}
// ---- the shipped stock index 6): <tools>/entityindex/shipped/vanilla.<exe>.<fp 12 hex>.json.gz, made
// ship.js on the publisher's install: the stock cache gzipped, meta.game dropped, meta.paks = name|size of every row the fingerprint
// reads (no file times). Used only when no local stock index fits:
//   - same exe and the same fingerprint: written out under the normal cache name (meta.game = this install) and used as it is
//   - else a file of the same game (as64 and mowas_2 count as one) whose meta.paks shares at least half its rows with this install
//     (the same game with other file times, or a small update): its records seed the build; a record whose signatures (dh) differ
//     is parsed again, as with any seed
//   - anything else (another game, another index version) is ignored
// Also a mods-/folder- index with no stock cache to seed from seeds from it. env ARSENAL_SHIPPED_INDEX = another folder (tests).
const SHIP_RE = /^vanilla\.(as64|mowas_2|goh)\.([0-9a-f]{12})\.json\.gz$/;
const shippedDir = () => process.env.ARSENAL_SHIPPED_INDEX || path.join(__dirname, 'shipped');
const pakList = (real, e) => fpRows(real, e).map(r => r.slice(0, r.lastIndexOf('|')));
function gzMeta(f) {
  try {
    const fd = fs.openSync(f, 'r'), b = Buffer.alloc(1 << 18);
    let n; try { n = fs.readSync(fd, b, 0, b.length, 0); } finally { fs.closeSync(fd); }
    const zlib = require('zlib'), s = zlib.gunzipSync(b.subarray(0, n), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('utf8');
    return metaOf(s);
  } catch (e) { return null; }
}
function readShipped(f) {
  try { const d = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(f)).toString('utf8')); return d && d.meta && d.entities ? d : null; } catch (e) { return null; }
}
// -> { file, exact } or null. exe = the exe of this run, fp = this install's fingerprint, real = the install
function findShipped(exe, fp, real) {
  if (!exe || !fp) return null;
  const dir = shippedDir();
  let names; try { names = fs.readdirSync(dir); } catch (e) { return null; }
  const pair = exe === 'goh' ? ['goh'] : ['as64', 'mowas_2'];
  const cands = names.map(n => SHIP_RE.exec(n)).filter(m => m && pair.includes(m[1])).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const ex = cands.find(m => m[1] === exe && m[2] === fp.slice(0, 12));
  if (ex) { const f = path.join(dir, ex[0]), m = gzMeta(f); if (m && m.version === VERSION && m.exe === exe && m.fp === fp && !m.partial && !m.game) return { file: f, exact: true }; }
  let mine = null, best = null;
  for (const c of cands) {
    const f = path.join(dir, c[0]), m = gzMeta(f);
    if (!m || m.version !== VERSION || m.partial || m.game || !Array.isArray(m.paks) || !m.paks.length) continue;
    if (!mine) mine = new Set(pakList(real, exe));
    const score = m.paks.filter(r => mine.has(r)).length / Math.max(mine.size, m.paks.length);
    if (score >= 0.5 && (!best || score > best.score || (score === best.score && c[1] === exe))) best = { file: f, exact: false, score };
  }
  return best;
}
// the exact shipped file for the stock cache file (cachePath name) of this install: written out there, -> the data (packed form)
function unship(file, s, real) {
  const d = readShipped(s.file);
  if (!d) return null;
  d.meta.game = real; delete d.meta.paks;
  writeCache(file, JSON.stringify(d));   // read-only cache folder: used for this run only
  return d;
}
// cleanup (once per process, on the first build into the shared cache folder): stock index files (vanilla*.json) whose meta.game
// is a tools/check overlay folder (.../check-ov-<random>/game) that no longer exists are removed. Cache files only: nothing else is
// touched, and only in the shared entityindex cache folder. Before the fingerprint key every check of a mod outside <game>/mods
// left one there (31 MB per game build).
let SWEPT = false;
const OV_GAME = /[\\/]check-ov-[^\\/]+[\\/]game[\\/]?$/i;
function sweepOverlays() {
  if (SWEPT) return 0;
  SWEPT = true;
  const dir = toolcache.dir('entityindex');
  let names = [], n = 0;
  try { names = fs.readdirSync(dir); } catch (e) { return 0; }
  for (const nm of names) {
    if (!/^vanilla(\.[^.]+)*\.json$/i.test(nm)) continue;
    const f = path.join(dir, nm), m = metaHead(f);
    if (!m || typeof m.game !== 'string' || !OV_GAME.test(m.game) || fs.existsSync(m.game)) continue;
    try { fs.rmSync(f); n++; } catch (e) { /* in use: next time */ }
  }
  return n;
}
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx'), vfs = require('../lib/vfs'), { relPath } = require('../lib/report');

const VERSION = 8;   // 8: stuff from/tags/refs read from the stuff's own first block, not the .presets/include block ahead of it

// ---------- source / signatures ----------
// sdlset.get/open re-open the pak for every entry (open+close ~35% of a cold run): read vfs records through vfs.readRec (fd kept open)
// named mods that did not mount: [{ name, why:[msg] }]. v.mods = ordered active ids; v.problems says why (MOD_UNKNOWN/MOD_MODE/MOD_VERSION/...)
function unmounted(o, v) {
  const out = [], active = new Set(v.mods.map(m => String(m).toLowerCase()));
  for (const text of o.mods || []) {
    const name = text.split(':')[0];
    if (active.has(name.toLowerCase())) continue;
    const why = v.problems.filter(p => p.level === 'error' && (p.where === text || p.msg.includes(`'${text}'`) || p.msg.includes(`"${name}`) || p.code === 'DEP_CYCLE' || p.code === 'MODS_WIPED_VERSION')).map(p => `${p.code}: ${p.msg}`);
    out.push({ name: text, why: why.length ? why : ['not in the active mod list (no matching problem reported by vfs)'] });
  }
  return out;
}
function openSource(o) {
  // o.modDirs (mod folders by path, vfs.build modDirs): the vfs is built here with them as layers on top, then given to the source
  // o.exe: the game whose vfs view is built (normExe); none = vfs default
  const dirs = o.gameDir && o.modDirs && o.modDirs.length ? o.modDirs : null, exe = normExe(o.exe);
  const src = sdlset.createSource({ gameDir: dirs ? undefined : o.gameDir, mods: o.mods, folder: o.folder, exe });
  if (dirs) {
    src.v = vfs.build({ gameDir: o.gameDir, mods: o.mods, modDirs: dirs, exe });
    const pre = src.preInclude;   // the source's own .presets lookup did not see this vfs
    src.preInclude = key => {
      const r = pre(key);
      if (r.length || !key.startsWith('resource/set/stuff/') || key.endsWith('/.presets') || key.endsWith('.fsm')) return r;
      const pk = key.slice(0, key.lastIndexOf('/') + 1) + '.presets';
      return src.v.files.has(pk) ? [pk] : [];
    };
  }
  const v = src.v;
  if (!v) return src;
  if (o.mods && o.mods.length && !o.allowUnmounted) {
    const bad = unmounted(o, v);
    if (bad.length) {
      const e = new Error('entityindex: named mod(s) did not mount, refusing to index vanilla instead:\n' + bad.map(b => `  ${b.name}\n` + b.why.map(w => '    ' + w).join('\n')).join('\n'));
      e.code = 'MOD_NOT_MOUNTED'; e.unmounted = bad; throw e;
    }
  }
  // src.bytes: null, or a Map key -> Buffer | null that build() sets for the time of one build and takes away at its end: the same
  // included file (a property file, a .presets, a macro file) is read once per build, not once per file that names it (the big mod:
  // 23,000 loose reads for 10,688 files, 35,744 pak reads for 19,849 entries). Nothing outlives the build, so no read after it
  // can be an old one. The Buffers are shared between the readers of one build: they are read, never written.
  src.bytes = null;
  // src.ahead(ra): a lib/sdlset readAhead the loose files are taken from when it holds them (buildAsync sets it for the time of
  // one build); none, or a file it does not hold: read from the disk as before. src.loosePath(key) = the file raw() reads, or null
  let ahead = null;
  src.ahead = ra => { const was = ahead; ahead = ra || null; return was; };
  src.loosePath = key => { if (src.local.has(key)) return src.local.get(key); const r = v.files.get(key); return r && r.source === 'loose' ? path.join(r.container, r.entry) : null; };
  const early = key => ahead ? ahead.take(key) : undefined;
  // src.pakAhead(keys) -> generator: the pak entries of keys (vfs records, not a folder file, not kept yet) read now in pak offset order
  // (vfs.readRecsOrdered), each taken once by the next read of its key; src.pakDrop() drops what is left. A cold GoH index read its
  // 32k pak entries in key order, 74k small reads (61 of 75 s of one run with disk misses, 6.6 ms a read; reported 17-45 min on a busy
  // USB disk); in offset order 8.7k reads. Same bytes, same index (compared), other order; only buildAsync uses it
  let pakB = null;
  src.pakDrop = () => { pakB = null; };
  src.pakAhead = function* (keys) {
    const items = [];
    for (const k of new Set(keys)) { if (src.local.has(k) || (pakB && pakB.has(k)) || (src.bytes && src.bytes.has(k))) continue; const r = v.files.get(k); if (r && r.source === 'pak') items.push({ key: k, rec: r }); }
    if (!items.length) return;
    if (!pakB) pakB = new Map();
    const m = pakB;
    yield* vfs.readRecsOrdered(items, (it, b) => m.set(it.key, b));
  };
  const rd = key => { const r = v.files.get(key); if (!r) return null; if (r.source === 'loose') { const b = early(key); if (b !== undefined) return b; } else if (pakB) { const b = pakB.get(key); if (b !== undefined) { pakB.delete(key); return b; } } return vfs.readRec(r); };
  const loose = key => { const b = early(key); return b !== undefined ? b : fs.readFileSync(src.local.get(key)); }, raw = key => src.local.has(key) ? loose(key) : rd(key);
  const one = (key, keep) => { const m = src.bytes; if (!m) return raw(key); let b = m.get(key); if (b === undefined) { b = raw(key); if (keep) m.set(key, b); } return b; };
  src.get = key => one(key, false);   // a file read for itself is read once anyway: only included files are kept
  src.open = (r, from) => {
    src.included.add(r.key);
    if (r.kind === 'fs') { const p = path.join(o.gameDir || '.', r.key); return fs.existsSync(p) ? { buf: fs.readFileSync(p), file: r.key, key: r.key } : null; }
    if (r.kind === 'user') return null;
    if (src.local.has(r.key)) return { buf: one(r.key, true), file: relPath(src.folder, src.local.get(r.key)), key: r.key };
    const b = one(r.key, true);
    return b ? { buf: b, file: r.key, key: r.key } : null;
  };
  return src;
}
function allKeys(src) {
  const s = new Set(src.local.keys());
  if (src.v) for (const k of src.v.files.keys()) s.add(k);
  return s;
}
function makeSig(src) {
  const memo = new Map();
  return key => {
    let s = memo.get(key);
    if (s !== undefined) return s;
    if (src.local.has(key)) {
      try { const st = fs.statSync(src.local.get(key)); s = 'l' + st.size + ':' + Math.round(st.mtimeMs); } catch (e) { s = '-'; }
    } else {
      const r = src.v && src.v.files.get(key);
      if (!r) s = '-';
      else if (r.source === 'pak') s = 'p' + path.basename(r.container) + ':' + r.ent.off + ':' + r.ent.size + ':' + r.ent.time;
      else { try { const st = fs.statSync(path.join(r.container, r.entry)); s = 'l' + st.size + ':' + Math.round(st.mtimeMs); } catch (e) { s = '-'; } }
    }
    memo.set(key, s);
    return s;
  };
}
const hashDeps = (keys, sig) => crypto.createHash('md5').update(keys.map(k => k + '=' + sig(k)).join('\n')).digest('hex').slice(0, 12);
const sourceOf = (src, key) => {
  if (src.local.has(key)) return { layer: 'folder', source: 'mod' };
  const r = src.v && src.v.files.get(key);
  const layer = r ? r.layer : '?';
  return { layer, source: layer === 'base' || /^patch [0-9]+$/.test(layer) ? 'vanilla' : 'mod' };
};

// ---------- tree helpers ----------
function* kidsOf(b) { for (const it of b.items) { if (it.k === 'BLOCK') yield it; else if (it.k === 'MOD') yield* kidsOf(it); } }
// array variant; enabledOnly drops children flagged .disabled
const kids = (b, o) => { const a = [...kidsOf(b)]; return o && o.enabledOnly ? a.filter(k => !k.disabled) : a; };
const nameOf = b => { const f = b.items[0]; return f && f.k === 'IDENT' ? f.text : f && f.k === 'STRING' ? f.value : null; };
const argsOf = b => b.items.slice(1).filter(t => t.k !== 'BLOCK' && t.k !== 'MOD');
const str0 = b => { const a = argsOf(b)[0]; return a && a.k === 'STRING' ? a.value : null; };
const hasKid = (b, n) => { for (const c of kidsOf(b)) if ((nameOf(c) || '').toLowerCase() === n) return true; return false; };
const ref = (kind, value, node) => [kind, value, node.file, node.line];

// parse key with include tracking → { tree, deps:[key] } | null (binary)
function parseKey(src, key) {
  const deps = new Set([key]);
  const open = (r, from) => { if (r.kind === 'virtual') deps.add(r.key); return src.open(r, from); };
  const buf = src.get(key);
  if (!buf) return null;
  const pre = src.preInclude(key);
  for (const p of pre) deps.add(p);
  const res = sdlx.read(buf, { file: key, key, open, onError: () => {}, preInclude: pre });
  return { tree: res.root, deps: [...deps], includes: [...deps].filter(k => k !== key && !pre.includes(k)) };
}

// ---------- extraction ----------
function extractEntity(root) {
  const refs = [], extenders = [], ev = [], extl = [];
  let etype = null;
  { const top = kidsOf(root).next().value;   // ReadEntity: first word, or the second when it is also an identifier
    if (top && top.items[0] && top.items[0].k === 'IDENT') { const t1 = top.items[1]; etype = [t1 && t1.k === 'IDENT' ? t1.text : top.items[0].text, top.file, top.line]; } }
  (function walk(b, stack) {
    for (const c of kidsOf(b)) {
      if (c.disabled) { if (/^#+on$/i.test(c.tag || '')) ev.push(['dison', c.file, c.line, c.tag || '']); continue; }
      if ((nameOf(c) || '').toLowerCase() === 'chassis') chassisFacts(c, ev);
      const n = (nameOf(c) || '').toLowerCase(), s0 = str0(c);
      let push = n;
      if (n === 'extender' && s0) { extenders.push(s0.toLowerCase()); extl.push([s0.toLowerCase(), c.file, c.line]); push = 'extender:' + s0.toLowerCase(); }
      const inWeaponry = stack.includes('weaponry'), inBoarder = stack.includes('boarder');
      if (n === 'extension' && s0) refs.push(ref('model', s0, c));
      else if (inWeaponry && n === 'weapon' && s0 && !hasKid(c, 'mask')) {
        refs.push(ref('weapon', s0, c));
        const a = argsOf(c);   // {weapon "x" filling "ammo tags" N}
        for (let i = 1; i + 1 < a.length; i++) if (a[i].k === 'IDENT' && a[i].text.toLowerCase() === 'filling' && a[i + 1].k === 'STRING') refs.push(ref('ammo', a[i + 1].value, c));
      }
      else if (inWeaponry && n === 'filling' && s0) refs.push(ref('ammo', s0, c));
      else if (n === 'item' && s0 && stack.includes('extender:inventory')) refs.push(ref('item', s0, c));
      else if (inBoarder && (n === 'begin' || n === 'end') && s0 && !s0.includes('%')) refs.push(ref('anim', s0, c));
      else if (n === 'vision' && s0 && stack.includes('visor')) refs.push(ref('vision', s0, c));
      stack.push(push); walk(c, stack); stack.pop();
    }
  })(root, []);
  return { refs, extenders, ev, extl, etype };
}

// chassis facts (range checks MOV-03/04/07/24, HUM-36): ev = [ [kind, file, line, data] ] in file order
//   loco [hasTurnTime]  speed [[name, value]]  strafe [entries]  dison [tag] ({##on disabled block, DMG-16)  foot [rowName, missing[]] (Chassis "foot" Run/Crawl/Swim)
const num = t => t && (t.k === 'INTEGER' || t.k === 'FLOAT') ? t.value : null;
function chassisFacts(ch, ev) {
  const cid = ch.file + ':' + ch.line;
  const foot = String(str0(ch) || '').toLowerCase() === 'foot';
  for (const c of kidsOf(ch)) {
    if (c.disabled) continue;
    const n = (nameOf(c) || '').toLowerCase();
    const sub = kids(c, { enabledOnly: true });
    if (n === 'locomotion') ev.push(['loco', c.file, c.line, sub.some(k => (nameOf(k) || '').toLowerCase() === 'turntime') ? 1 : 0, cid]);
    else if (n === 'speed' && sub.length) ev.push(['speed', c.file, c.line, sub.map(k => [(nameOf(k) || '').toLowerCase(), num(argsOf(k)[0])]), cid]);
    else if (n === 'strafe') ev.push(['strafe', c.file, c.line, sub.length]);
    else if (foot && (n === 'run' || n === 'crawl' || n === 'swim')) {
      const have = new Set(sub.map(k => (nameOf(k) || '').toLowerCase()));
      ev.push(['foot', c.file, c.line, [n, ['slow', 'normal', 'fast'].filter(x => !have.has(x))]]);
    }
  }
}

const SOUND_KEYS = new Set(['firesound', 'reloadsound']);
// the stuff's own block: the loader pre-includes the dir's .presets and the file may start with {include}, so blocks from other
// files come first in the tree. pick the first block written in this file (node.file === key), else one a macro of this file
// expanded (via chain reaches key), else the first block (old behaviour, e.g. key unknown)
const viaHas = (n, key) => { for (let v = n.via; v; v = v.via) if (v.file === key) return true; return false; };
function ownTop(root, key) {
  const all = [...kidsOf(root)];
  if (key == null) return all[0];
  return all.find(c => c.file === key && !c.via) || all.find(c => c.file === key) || all.find(c => viaHas(c, key)) || all[0];
}
function extractStuff(root, key) {
  const refs = []; let tags = [], from = null;
  const top = ownTop(root, key);
  if (top) {
    if ((nameOf(top) || '').toLowerCase() === 'from') from = str0(top);
    for (const c of kidsOf(top)) {
      if (c.disabled) continue;
      const n = (nameOf(c) || '').toLowerCase();
      if (n === 'tag') for (const t of argsOf(c)) if (t.k === 'STRING') tags.push(...t.value.toLowerCase().split(/\s+/).filter(Boolean));
    }
    (function walk(b) {
      for (const c of kidsOf(b)) {
        if (c.disabled) continue;
        const n = (nameOf(c) || '').toLowerCase(), s0 = str0(c);
        if (n === 'entity' && s0) refs.push(ref('entity', s0, c));
        else if (n === 'fsm' && s0) refs.push(ref('fsm', s0, c));
        else if (SOUND_KEYS.has(n) && s0) refs.push(ref(n === 'firesound' ? 'fire_sound' : 'reload_sound', s0, c));
        walk(c);
      }
    })(top);
  }
  return { tags, from, refs };
}

const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
function extractModel(root) {
  const refs = [];
  (function walk(b) {
    for (const c of kidsOf(b)) {
      if (c.disabled) continue;
      const n = (nameOf(c) || '').toLowerCase(), s0 = str0(c);
      if (n === 'volumeview' && s0) refs.push(ref('ply', s0, c));
      else if (n === 'polyhedron' && s0) refs.push(ref('vol', s0, c));
      else if (n === 'file' && s0 && /\.anm$/i.test(s0)) refs.push(ref('anm', s0, c));
      walk(c);
    }
  })(root);
  return refs;
}
const TEX_KEYS = new Set(['diffuse', 'diffuse1', 'bump', 'specular', 'mask', 'envmap']);
function extractMtl(root) {
  const refs = [];
  (function walk(b) {
    for (const c of kidsOf(b)) {
      if (c.disabled) continue;
      const n = (nameOf(c) || '').toLowerCase(), s0 = str0(c);
      if (TEX_KEYS.has(n) && s0) refs.push(ref('texture', s0, c));
      walk(c);
    }
  })(root);
  return refs;
}

// entity Extension value -> mdl key: next to the def, under entity/, from root
function resolveModel(has, defKey, v, refDir) {
  const l = v.toLowerCase().replace(/\\/g, '/');
  const c = [dirOf(defKey) + l, 'resource/entity/' + l, 'resource/' + l.replace(/^\//, '')].concat(refDir ? [refDir + l] : []).map(x => path.posix.normalize(x));
  return c.find(has) || null;
}
// mtl files belonging to a mdl: <base>.mtl and <base>#N.mtl
const mtlCandidates = mdlKey => { const b = mdlKey.replace(/\.mdl$/, ''); const c = [b + '.mtl']; for (let i = 1; i <= 9; i++) c.push(b + '#' + i + '.mtl'); return c; };

// ---------- index object ----------
function makeIndex(data) {
  const idx = { meta: data.meta, entities: data.entities, stuff: data.stuff, models: data.models, aux: data.aux || {} };
  let names = null, users = null;
  idx.byName = n => {
    if (!names) { names = new Map(); for (const r of Object.values(data.entities)) { const l = names.get(r.name) || []; l.push(r); names.set(r.name, l); } }
    return names.get(String(n).toLowerCase()) || [];
  };
  idx.usersOf = (kind, value) => {
    if (!users) {
      users = new Map();
      for (const r of Object.values(data.entities)) for (const f of r.refs) { const k = f[0] + '\0' + f[1].toLowerCase(); (users.get(k) || users.set(k, []).get(k)).push({ entity: r, ref: f }); }
    }
    return users.get(kind + '\0' + String(value).toLowerCase()) || [];
  };
  // tag -> stuff inverted index: {from} resolution only visits stuff carrying the rarest wanted tag
  const stuffKeys = Object.keys(data.stuff), ownTags = new Map(), byTag = new Map(), tagMemo = new Map();
  for (const k of stuffKeys) {
    const t = new Set(data.stuff[k].tags); ownTags.set(k, t);
    for (const x of t) { let l = byTag.get(x); if (!l) byTag.set(x, l = []); l.push(k); }
  }
  const words = str => String(str).toLowerCase().split(/\s+/).filter(Boolean);
  const tagsOf = (key, seen) => {
    if (tagMemo.has(key)) return tagMemo.get(key);
    const r = data.stuff[key]; const out = new Set();
    if (!r) return out;
    seen.add(key);
    for (const t of r.tags) out.add(t);
    if (r.from) {
      const want = words(r.from);
      let cand = stuffKeys;
      for (const w of want) { const l = byTag.get(w); if (!l) { cand = []; break; } if (l.length < cand.length) cand = l; }
      for (const k of cand) {
        if (seen.has(k)) continue;
        if (want.every(w => ownTags.get(k).has(w))) for (const t of tagsOf(k, new Set(seen))) out.add(t);
      }
    }
    if (seen.size === 1) tagMemo.set(key, out);
    return out;
  };
  idx.tagsOf = key => tagsOf(key, new Set());
  let eff = null, hasMemo = new Map();   // effective-tag inverted index (built on first stuffMatch)
  idx.stuffMatch = tagString => {
    if (!eff) { eff = new Map(); for (const k of stuffKeys) for (const t of tagsOf(k, new Set())) { let l = eff.get(t); if (!l) eff.set(t, l = []); l.push(k); } }
    const want = words(tagString);
    if (!want.length) return stuffKeys.slice();
    let cand = null;
    for (const w of want) { const l = eff.get(w); if (!l) return []; if (!cand || l.length < cand.length) cand = l; }
    return want.length === 1 ? cand.slice() : cand.filter(k => { const t = tagsOf(k, new Set()); return want.every(w => t.has(w)); });
  };
  idx.stuffHas = tagString => { const k = String(tagString).toLowerCase(); let r = hasMemo.get(k); if (r === undefined) hasMemo.set(k, r = idx.stuffMatch(k).length > 0); return r; };
  // engine lookup (FindStuff): tags = file-name '.' tokens only (LoadStuff );
  // {tag} goes to extraTags/allTags and {from} copies the base's extra tags, neither is searched. withPatterns false skips 'pattern' files (GetStuff)
  const fileTags = k => { const n = data.stuff[k].name || k.split('/').pop(); return new Set(n.toLowerCase().split('.').filter(Boolean)); };
  idx.fileTagsOf = key => data.stuff[key] ? fileTags(key) : new Set();
  idx.stuffFind = (tagString, withPatterns = false) => {
    const want = words(tagString); if (!want.length) return [];
    let cand = null;
    for (const w of want) { const l = byTag.get(w); if (!l) return []; if (!cand || l.length < cand.length) cand = l; }
    return cand.filter(k => { const t = fileTags(k); return want.every(w => t.has(w)) && (withPatterns || !t.has('pattern')); });
  };
  return idx;
}

// ---------- build ----------
const stuffKey = k => k.startsWith('resource/set/stuff/') && !k.endsWith('/.presets') && !/\/_settings\//.test(k) &&
  !/\.(fsm|hand)$/.test(k);   // engine: any file in set/stuff except .fsm/.presets is a stuff, whatever its extension ( LoadStuff)

function build(o) {
  const t0 = Date.now();
  const given = o.cache ? cacheFile(o.cache) : null;
  if (o.cache) o = { ...o, cache: cachePath(o.cache, o.exe, o.gameDir) };
  if (o.cache && inShared(o.cache)) sweepOverlays();
  const src = openSource(o), sig = makeSig(src), keys = allKeys(src);
  if ('bytes' in src && o.byteMemo !== false) src.bytes = new Map();   // one read per included file for this build (openSource), dropped before it returns
  try { const it = build1(o, src, sig, keys, t0, given, null); let r; while (!(r = it.next()).done); return r.value; } finally { if (src.bytes) src.bytes = null; }
}
// the same build for a caller that can await (header): build1 hands out a promise where it is about to read a file that is being
// read ahead, and one every 200 files; nothing else differs from build
async function buildAsync(o) {
  const t0 = Date.now();
  const given = o.cache ? cacheFile(o.cache) : null;
  if (o.cache) o = { ...o, cache: cachePath(o.cache, o.exe, o.gameDir) };
  if (o.cache && inShared(o.cache)) sweepOverlays();
  const src = openSource(o), sig = makeSig(src), keys = allKeys(src);
  if ('bytes' in src && o.byteMemo !== false) src.bytes = new Map();
  const ra = o.readAhead !== false && typeof src.ahead === 'function' && typeof src.loosePath === 'function' ? sdlset.readAhead({ window: o.aheadWindow, maxBytes: o.aheadBytes }) : null;
  if (ra) src.ahead(ra);
  try {
    const it = build1(o, src, sig, keys, t0, given, { ra });
    let r; while (!(r = it.next()).done) if (r.value) await r.value;
    if (ra) r.value.stats.ahead = { ...ra.stats };
    return r.value;
  } finally { if (ra) { src.ahead(null); ra.close(); } if (src.pakDrop) src.pakDrop(); if (src.bytes) src.bytes = null; }
}
// A = null (build) | { ra } (buildAsync). A yield = a promise buildAsync awaits; build never gets one (A null: no yield at all)
function* build1(o, src, sig, keys, t0, given, A) {
  const has = k => keys.has(k);
  const exe = src.v ? src.v.exe : (normExe(o.exe) || null);   // the exe the vfs used (a folder-only index: the one named, else null)
  let prev = o.cache && !o.force && fs.existsSync(o.cache) ? safeJson(o.cache) : null;
  const game = o.gameDir && o.gameDir !== '-' ? path.resolve(o.gameDir) : null;
  // the stock index (given name vanilla.json, no mod, no folder): keyed by the game (cachePath header); meta.game = the real install,
  // meta.fp = its fingerprint (null: no pak, keyed by the real folder)
  const stock = !!(given && isStock(given) && game && src.v && !o.folder && !(o.mods && o.mods.length) && !(o.modDirs && o.modDirs.length));
  const real = game ? realGame(game) : null, fp = stock ? gameFp(real, exe) : null;
  // a cache made for another exe or another game folder is never reused (rebuilt cold and written over); caches from before meta.exe
  // have none: default name, kept as before. An overlay of the same install, or a stock index of the same fingerprint, is the same game
  const fits = d => d && d.meta && d.meta.version === VERSION && (d.meta.exe === undefined || d.meta.exe === exe) && sameGame(d.meta, game, fp);
  let old = fits(prev) ? prev : { entities: {}, stuff: {}, models: {} }, seeded = null, shipped = null;
  // no local stock index fits: the shipped one (findShipped above). exact = taken as the cache; near = its records seed this build
  if (old !== prev && stock && fp && o.shipped !== false && inShared(o.cache)) {
    const s = findShipped(exe, fp, real);
    if (s && s.exact) {
      const d = unship(o.cache, s, real);
      if (d && fits(unpack(d))) { prev = old = d; shipped = { file: s.file, exact: true }; }
    } else if (s) {
      const d = readShipped(s.file);
      if (d) { unpack(d); old = { entities: d.entities || {}, stuff: d.stuff || {}, models: d.models || {}, aux: d.aux || {} }; shipped = { file: s.file, exact: false }; }
    }
  }
  // seed (shared cache folder only, o.seed !== false): a mods-/folder- index with no usable cache of its own starts from the game's
  // vanilla cache of the same exe and game folder (cachePath(<shared>/vanilla.json, exe, gameDir), also a checkpoint of it). Records
  // are self-checking (dh = the signatures of every file they came from, in this run's vfs view): a file the mod or folder replaces,
  // or adds where a vanilla record looked, changes the signature and is parsed again; the others are reused as they are.
  if (old !== prev && o.seed !== false && o.cache && game && src.v && inShared(o.cache)) {
    const sf = cachePath(path.join(path.dirname(given), 'vanilla.json'), exe, game);
    const sd = !sameDir(sf, o.cache) && fs.existsSync(sf) ? safeJson(sf) : null;
    if (fits(sd)) { old = { entities: sd.entities || {}, stuff: sd.stuff || {}, models: sd.models || {} }; seeded = sf; }
    else if (!stock && o.shipped !== false) {   // no stock cache yet: the shipped stock index of this game, if one is near enough
      const rg = realGame(game), s = findShipped(exe, gameFp(rg, exe), rg), d = s ? readShipped(s.file) : null;
      if (d) { unpack(d); old = { entities: d.entities || {}, stuff: d.stuff || {}, models: d.models || {} }; seeded = s.file; }
    }
  }
  let parsed = 0, reused = 0;
  const data = { meta: { version: VERSION, game: stock ? real : game, folder: o.folder || null, mods: src.v ? src.v.mods : [], exe, built: new Date().toISOString() }, entities: {}, stuff: {}, models: {} };
  if (stock) data.meta.fp = fp;
  // a build with no game folder and no folder (0 entities) never writes the shared folder: its plain name is the installed game's
  const sourceless = !game && !o.folder && !src.v;
  const writes = !!o.cache && !(sourceless && inShared(o.cache));

  // checkpoint: every o.checkpointEvery parsed files (default 2000), at most every o.checkpointMs (default 60 s), the records so far
  // (plus the reusable records of the old cache not reached yet) go to the cache file as meta.partial, written beside it and renamed in.
  // A build stopped half way (the GUI time limit, a closed window) leaves that file: the next build reuses its records (dh-checked as
  // always) and parses only the rest; load() refuses a partial cache. o.onCheckpoint(file, n) is called after each (tests).
  const cpEvery = o.checkpointEvery === undefined ? 2000 : o.checkpointEvery, cpMs = o.checkpointMs === undefined ? 60000 : o.checkpointMs;
  let cpAt = 0, cpT = Date.now(), cps = 0;
  const checkpoint = () => {
    if (!writes || !cpEvery || parsed - cpAt < cpEvery || Date.now() - cpT < cpMs) return;
    cpAt = parsed; cpT = Date.now(); cps++;
    const part = { meta: { ...data.meta, partial: true }, aux: old.aux || {} };
    for (const t of ['entities', 'stuff', 'models']) part[t] = { ...old[t], ...data[t] };
    writeCache(o.cache, JSON.stringify(pack(part)));
    if (o.onCheckpoint) o.onCheckpoint(o.cache, cps);
  };

  // a seeded entity record also keeps its layer (a mod copy of a vanilla pak would have the same signatures but another layer)
  const keep = (tbl, key) => { const r = old[tbl][key]; if (r && hashDeps(r.deps, sig) === r.dh && !((seeded || (shipped && !shipped.exact)) && tbl === 'entities' && r.layer !== sourceOf(src, key).layer)) { reused++; return r; } return null; };
  const finish = (rec, deps) => { rec.deps = deps; rec.dh = hashDeps(deps, sig); parsed++; return rec; };

  // buildAsync only (A): which files will be parsed is decided before the loop (the same keep() test, each record once), so their
  // loose files can be read ahead in the order the loop takes them. plan(key, oldRec, more): the file, then more (a model's .mtl
  // files), then the files the old record was made from (its includes; a wrong guess is dropped unread after the parse).
  // got(key) before a parse waits for those reads; turn() gives the loop a turn every 200 files.
  const ra = A && A.ra, order = [...keys].sort(), plans = new Map(), planned = new Set();
  // pakWant: the pak entries of the same files (and the stuff .presets), read in pak offset order by paks() before the loop takes them
  let pakWant = [];
  const plan = (key, oldRec, more) => {
    const l = [];
    if (src.pakAhead && typeof src.preInclude === 'function') for (const k of src.preInclude(key)) if (!src.loosePath(k)) pakWant.push(k);
    for (const k of [key].concat(more || [], (oldRec && Array.isArray(oldRec.deps)) ? oldRec.deps : [])) {
      if (planned.has(k)) continue;
      const f = src.loosePath(k); if (!f) { if (src.pakAhead) pakWant.push(k); continue; }
      sig(k);   // signature first, then the read (the order build has for a changed file): a file written in between is parsed again next time
      planned.add(k); l.push(k); ra.add(k, f);
    }
    if (l.length) plans.set(key, l);
  };
  function* paks() { if (!pakWant.length) return; const w = pakWant; pakWant = []; let n = 0; for (const _ of src.pakAhead(w)) if (++n % 16 === 0) yield new Promise(r => setImmediate(r)); }
  function* got(key) { const l = plans.get(key); if (l) for (const k of l) { const w = ra.wait(k); if (w) yield w; } }
  // a file passed may be planned again by a later step (a .def read for its entity, then by a refcheck aux table): read ahead again
  // then, not read one by one on the loop (11 s of sync reads in a refcheck of a 94k-file mod)
  const passed = key => { const l = plans.get(key); if (l) { for (const k of l) { ra.drop(k); planned.delete(k); } plans.delete(key); } };
  let turns = 0;
  function* turn() { if (A && ++turns % 200 === 0) yield new Promise(r => setImmediate(r)); }
  const isDefKey = key => key.startsWith('resource/entity/') && key.endsWith('.def');
  let pre = null;   // key -> the record kept, or null = parse it
  if (ra) {
    pre = new Map();
    for (const key of order) {
      const tbl = isDefKey(key) ? 'entities' : stuffKey(key) ? 'stuff' : null;
      if (!tbl) continue;
      const rec = keep(tbl, key); pre.set(key, rec);
      if (!rec) plan(key, old[tbl][key]);
      yield* turn();
    }
    yield* paks();
  }

  for (const key of order) {
    const isDef = isDefKey(key);
    if (isDef) {
      let rec = pre ? pre.get(key) : keep('entities', key);
      if (!rec) {
        if (ra) yield* got(key);
        const p = parseKey(src, key);
        if (ra) passed(key);
        const base = { key, name: key.slice(key.lastIndexOf('/') + 1, -4).toLowerCase(), ...sourceOf(src, key) };
        if (!p) rec = finish({ ...base, inherits: [], extenders: [], refs: [], ev: [], broken: 'binary' }, [key]);
        else { const x = extractEntity(p.tree); rec = finish({ ...base, inherits: p.includes, extenders: x.extenders, extl: x.extl, etype: x.etype, refs: x.refs, ev: x.ev }, p.deps); }
      }
      data.entities[key] = rec; checkpoint(); yield* turn();
    } else if (stuffKey(key)) {
      let rec = pre ? pre.get(key) : keep('stuff', key);
      if (!rec) {
        if (ra) yield* got(key);
        const p = parseKey(src, key);
        if (ra) passed(key);
        const name = key.slice(key.lastIndexOf('/') + 1).toLowerCase();
        if (!p) rec = finish({ key, name, tags: name.split('.'), from: null, refs: [] }, [key]);
        else { const x = extractStuff(p.tree, key); rec = finish({ key, name, tags: [...new Set([...name.split('.'), ...x.tags])], from: x.from, refs: x.refs }, p.deps); }
      }
      data.stuff[key] = rec; checkpoint(); yield* turn();
    }
  }
  // models: the mdl (+ mtl variants) each entity's Extension resolves to
  if (ra) {   // the same walk first, to read the models ahead (pre: mdl key -> the record kept, or null)
    pre = new Map();
    for (const e of Object.values(data.entities)) {
      const f = e.refs.find(r => r[0] === 'model'), mk = f ? resolveModel(has, e.key, f[1]) : null;
      if (!mk || !mk.endsWith('.mdl') || pre.has(mk)) continue;
      const rec = keep('models', mk); pre.set(mk, rec);
      if (!rec) plan(mk, old.models[mk], mtlCandidates(mk).filter(has));
      yield* turn();
    }
    yield* paks();
  }
  for (const e of Object.values(data.entities)) {
    const f = e.refs.find(r => r[0] === 'model');
    e.model = f ? resolveModel(has, e.key, f[1]) : null;
    if (!e.model || !e.model.endsWith('.mdl') || data.models[e.model]) continue;
    const mk = e.model;
    let rec = ra ? pre.get(mk) : keep('models', mk);
    if (!rec) {
      if (ra) yield* got(mk);
      const refs = [], deps = new Set([mk]);
      const p = parseKey(src, mk);
      if (p) { for (const d of p.deps) deps.add(d); refs.push(...extractModel(p.tree)); }
      for (const m of mtlCandidates(mk)) {
        deps.add(m);
        if (!has(m)) continue;
        const q = parseKey(src, m);
        if (q) { for (const d of q.deps) deps.add(d); refs.push(...extractMtl(q.tree)); }
      }
      rec = finish({ key: mk, refs }, [...deps]);
      if (ra) passed(mk);
    }
    data.models[mk] = rec; checkpoint(); yield* turn();
  }
  // aux: per-file facts from caller extractors (refcheck set/properties scans), reused while the file + includes are unchanged
  data.aux = {};
  for (const [nm, tbl] of Object.entries(old.aux || {})) if (!(o.aux && o.aux[nm])) data.aux[nm] = tbl;   // other callers' tables survive
  let auxParsed = 0, auxReused = 0;
  for (const [nm, spec] of Object.entries(o.aux || {})) {
    const out = data.aux[nm] = {}, prevT = (old.aux && old.aux[nm]) || {};
    let picked = null, okAux = null;   // buildAsync: the selected keys (select asked once per key, as in build) and the ones still good
    if (ra) {
      picked = order.filter(k => spec.select(k)); okAux = new Set();
      for (const key of picked) { const r = prevT[key]; if (r && hashDeps(r.deps, sig) === r.dh) okAux.add(key); else plan(key, r); yield* turn(); }
      yield* paks();
    }
    for (const key of picked || order) {
      if (!picked && !spec.select(key)) continue;
      const r = prevT[key];
      if (okAux ? okAux.has(key) : r && hashDeps(r.deps, sig) === r.dh) { out[key] = r; auxReused++; continue; }
      if (ra) yield* got(key);
      let deps = [key], d = null;
      try {
        if (spec.raw) { const b = src.get(key); d = b ? spec.extract(b, key) : null; }
        else { const p = parseKey(src, key); if (p) { deps = p.deps; d = spec.extract(p.tree, key); } }
      } catch (e) { d = null; }
      out[key] = { deps, dh: hashDeps(deps, sig), data: d === undefined ? null : d };
      auxParsed++;
      if (ra) passed(key);
      yield* turn();
    }
  }
  if (src.v) vfs.closeRecs();
  const cnt = t => Object.keys(t || {}).length;
  const same = prev && old === prev && !prev.meta.partial && !parsed && !auxParsed && ['entities', 'stuff', 'models'].every(t => cnt(old[t]) === cnt(data[t])) &&
    Object.keys(data.aux).length === Object.keys(old.aux || {}).length && Object.keys(data.aux).every(n => cnt(data.aux[n]) === cnt((old.aux || {})[n]));
  let text = null;
  if (writes && !same) writeCache(o.cache, text = JSON.stringify(pack(data)));   // read-only folder: one stderr line, the run goes on
  const twin = writes && stock ? writeTwin(o, given, src, data, text, game, real) : null;
  return { idx: makeIndex(data), stats: { entities: Object.keys(data.entities).length, stuff: Object.keys(data.stuff).length, models: Object.keys(data.models).length, parsed, reused, auxParsed, auxReused, ms: Date.now() - t0, seeded, shipped, checkpoints: cps, twin }, src, keys };
}
// one stock build serves both AS2 exes: the as64 view is the mowas_2 view plus the as64/core layer (lib/vfs 3c), and a record
// carries the signatures (dh) of every file it came from, so a record that touches no as64/core file is the same in both views.
// The stock index is written under the other AS2 exe's name too (meta.exe = that exe): whole when the as64/core layer holds nothing
// the index reads (no core file among the records' files, none under resource/entity/ or resource/set/stuff/, no .mdl/.mtl); else
// without the records that touch a core file and marked meta.partial (a checkpoint: load() refuses it, the next build of that exe
// reuses it and parses only the rest). Written only when that file is missing, a checkpoint, or of another fingerprint.
// -> the file written, or null
function writeTwin(o, given, src, data, text, game, real) {
  const exe = data.meta.exe, other = exe === 'as64' ? 'mowas_2' : exe === 'mowas_2' ? 'as64' : null;
  if (!other || !inShared(o.cache) || data.meta.partial) return null;
  if (!fs.existsSync(path.join(game, other === 'as64' ? 'as64.exe' : 'mowas_2.exe'))) return null;
  const tf = cachePath(given, other, game);
  if (sameDir(tf, o.cache)) return null;
  // the twin carries the OTHER exe's fingerprint: the two exes mount other paks (as64/core), so their fingerprints differ
  const ofp = data.meta.fp ? gameFp(real, other) : data.meta.fp;
  const m = fs.existsSync(tf) ? metaHead(tf) : null;
  if (m && !m.partial && m.version === VERSION && m.exe === other && (ofp ? m.fp === ofp : sameDir(m.game || '', data.meta.game || ''))) return null;
  // the as64/core keys of the as64 view (this build's view, or one built now: the game paks are listed, nothing is read)
  let v64 = src.v;
  if (exe !== 'as64') {
    if (!fs.existsSync(path.join(real, 'as64', 'core'))) v64 = null;
    else { try { v64 = vfs.build({ gameDir: game, mods: [], exe: 'as64' }); vfs.closeRecs(); } catch (e) { return null; } }
  }
  const core = new Set();
  if (v64) for (const [k, r] of v64.files) if (String(r.layer).startsWith('as64/core')) core.add(k);
  const meta = { ...data.meta, exe: other, fp: ofp };
  if (!core.size) {
    if (text === null) text = JSON.stringify(pack(data));
    const head = '{"meta":' + JSON.stringify(data.meta);
    if (!text.startsWith(head)) return null;
    return writeCache(tf, '{"meta":' + JSON.stringify(meta) + text.slice(head.length)) ? tf : null;
  }
  let dropped = [...core].some(k => k.startsWith('resource/entity/') || k.startsWith('resource/set/stuff/') || /\.(mdl|mtl)$/.test(k));
  const touches = r => !r || !Array.isArray(r.deps) || r.deps.some(k => core.has(k));
  const out = { meta, aux: {} };
  for (const t of ['entities', 'stuff', 'models']) {
    out[t] = {};
    for (const [k, r] of Object.entries(data[t])) { if (core.has(k) || touches(r)) dropped = true; else out[t][k] = r; }
  }
  for (const [n, tbl] of Object.entries(data.aux || {})) {
    out.aux[n] = {};
    for (const [k, r] of Object.entries(tbl)) { if (core.has(k) || touches(r)) dropped = true; else out.aux[n][k] = r; }
  }
  if (dropped) meta.partial = true;
  return writeCache(tf, JSON.stringify(pack(out))) ? tf : null;
}

// cache file write: <file>.<pid>.part beside it, then renamed over it, so a run stopped while writing never leaves a cut JSON
// (a cut file read back as no cache: the whole build again). Unwritable folder: cachewrite's one stderr line, the run goes on
function writeCache(file, text) {
  const tmp = file + '.' + process.pid + '.part';
  if (!cachewrite.write(tmp, text)) return false;
  try { fs.renameSync(tmp, file); return true; } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch (x) {} return cachewrite.write(file, text); }   // rename refused (a busy file): written in place as before
}

// cache size: ref file paths are interned (ints) on disk
function pack(data) {
  const files = [], at = new Map(), out = { meta: data.meta, files, aux: data.aux };
  const id = f => { let i = at.get(f); if (i === undefined) { i = files.length; files.push(f); at.set(f, i); } return i; };
  for (const tbl of ['entities', 'stuff', 'models']) {
    out[tbl] = {};
    for (const [k, r] of Object.entries(data[tbl])) out[tbl][k] = { ...r, refs: r.refs.map(f => [f[0], f[1], id(f[2]), f[3]]) };
  }
  return out;
}
function unpack(d) {
  for (const tbl of ['entities', 'stuff', 'models']) for (const r of Object.values(d[tbl] || {})) r.refs = r.refs.map(f => [f[0], f[1], typeof f[2] === 'number' ? d.files[f[2]] : f[2], f[3]]);
  return d;
}
function safeJson(f) { try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return d && d.files ? unpack(d) : d; } catch (e) { return null; } }
// load(file, exe?, gameDir?): with gameDir, that folder's cache (cachePath) and it must have been built for that folder; without it, a
// cache in the shared folder must have been built for the installed game (when one is found), else it is refused as another folder's
function load(file, exe, gameDir) {
  const e = exeFor(exe, gameDir);
  const stockGiven = isStock(cacheFile(file));
  file = cachePath(file, e, gameDir);
  // no stock cache yet: the shipped one of the same exe and fingerprint is written out first (only an exact one: load checks no record)
  if (stockGiven && inShared(file) && !fs.existsSync(file)) {
    const real = gameDir && gameDir !== '-' ? realGame(gameDir) : homeDirs(e)[0];
    const ex = real ? e || (fs.existsSync(path.join(real, 'as64.exe')) ? 'as64' : 'mowas_2') : null, s = ex ? findShipped(ex, gameFp(real, ex), real) : null;
    if (s && s.exact) unship(file, s, real);
  }
  const d = safeJson(file); if (!d || !d.meta) throw new Error('bad cache ' + file);
  if (e && d.meta.exe && d.meta.exe !== e) throw new Error(`bad cache ${file}: built for exe ${d.meta.exe}, not ${e}`);
  // no exe and no game folder: the shared plain name is the AS2 install's; a GoH cache there (an old no-exe GoH build) is refused
  if (!e && !gameDir && inShared(file) && d.meta.exe === 'goh') throw new Error(`bad cache ${file}: built for exe goh, not the AS2 install; rebuild it with entityindex <gameDir>, or load it with exe goh`);
  // a sourceless index (no game folder, no folder, no exe: 0 entities) is never the installed game's shared cache
  if (!e && !gameDir && inShared(file) && !d.meta.exe && !d.meta.game && !d.meta.folder) throw new Error(`bad cache ${file}: built with no game folder and no folder; rebuild it with entityindex <gameDir>`);
  // a checkpoint of a build that was stopped (meta.partial): its records only seed the next build, it is not an index to answer from
  if (d.meta.partial) throw new Error(`bad cache ${file}: a checkpoint of a build that did not finish; run entityindex <gameDir> to finish it`);
  if (d.meta.game) {
    if (gameDir && gameDir !== '-' && !sameGame(d.meta, path.resolve(gameDir), d.meta.fp ? gameFp(realGame(gameDir), e || d.meta.exe) : null)) throw new Error(`bad cache ${file}: built for the game folder ${d.meta.game}, not ${path.resolve(gameDir)}`);
    if (!gameDir && inShared(file)) { const h = homeDirs(e); if (h.length && !h.some(x => sameDir(x, d.meta.game))) throw new Error(`bad cache ${file}: built for the game folder ${d.meta.game}, not the installed game (${h.join(', ')}); rebuild it with entityindex <gameDir>`); }
  }
  return makeIndex(d);
}

// stale = cached record whose dependency signatures changed; added = new def/stuff not in cache; removed = cached key gone
function staleness(src, data) {
  const sig = makeSig(src), keys = allKeys(src), r = { stale: [], added: [], removed: [] };
  for (const tbl of ['entities', 'stuff', 'models']) {
    for (const [k, rec] of Object.entries(data[tbl])) {
      if (!keys.has(k)) r.removed.push(k);
      else if (hashDeps(rec.deps, sig) !== rec.dh) r.stale.push(k);
    }
  }
  for (const k of keys) {
    if (k.startsWith('resource/entity/') && k.endsWith('.def') && !data.entities[k]) r.added.push(k);
    else if (stuffKey(k) && !data.stuff[k]) r.added.push(k);
  }
  return r;
}

module.exports = { build, buildAsync, load, cacheFile, cachePath, normExe, realGame, gameFp, pakList, findShipped, shippedDir, fpForget: () => FPS.clear(), metaHead, sweepOverlays, staleness, openSource, makeSig, resolveModel, mtlCandidates, VERSION, kidsOf, kids, nameOf, argsOf, str0, hasKid, parseKey };
