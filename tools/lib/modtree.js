// modtree: one walk of a mod folder for everybody (gui README, CACHE contract 1). Every page that asks "did the mod change?"
// takes its answer from here instead of walking the mod itself (units modSig, balance modSig, soedit treeSig, buycheck sig).
//   scan(modDir, {onProgress, signal, names, conc, restorePoints}) -> Promise<T>   a walk that starts now. Async: folders are listed and files stat'ed
//     through the thread pool, 32 at a time, so the loop only takes the answers; the sort and the hashing give the loop a turn
//     (setImmediate) every few thousand rows. onProgress({count}) every 200 files and at the end; signal (AbortSignal) rejects
//     with an AbortError (code ABORT_ERR). A missing or unreadable modDir rejects; an unreadable folder below it, or a file
//     gone meanwhile, is left out.
//     T = {dir, at, count, bytes, all, areas: {set, entity, map, properties, interface, script, text, pak, other}, files, left}
//     files: [rel, size, mtimeMs] rows, forward slashes, case as on disk, sorted by their `rel|size|mtimeMs` text. Each area
//     value and `all` is the sha1 of those sorted rows (joined with \n) of that area / of every file: the same tree gives the
//     same signatures in any walk order and in any run.
//     left: sorted rel paths the walk saw and did not list: the folders it does not enter (see "Left out"), every symbolic
//     link or junction, anything that is neither file nor folder. Not part of any signature. For lib/vfs, which mounts some of
//     them (a node_modules or .arsenal folder under resource/, a linked folder) and reads just those from disk.
//   areaOf(rel) -> area. One area per file, first match, letter case ignored: *.pak anywhere and a root N.pat -> pak;
//     resource/set/** set, resource/entity/** entity, resource/map/** map, resource/properties/** properties,
//     resource/interface/** interface, resource/script/** script; *.lng and localization/** -> text; the rest other.
//     (N.pat is not in the contract text: it is a pak the game mounts, so it is counted with them, not in other.)
//   Left out of the walk: folders .git, .svn, .arsenal, node_modules, .arsenal-undo (restore points, never mounted) (any depth,
//     any case) and every symbolic link or junction (never followed, never listed). The old walkers skip at most .git/.svn/.arsenal,
//     so nothing they see as mod data is lost. A left-out folder is in `left`, so lib/vfs and lib/sdlset still read it from disk.
//   scan opts (both off by default; such a T is returned only: never kept, never given by ensure, fresh or last):
//     restorePoints: true  .arsenal-undo is walked too
//     names: true          names only: folders listed N at a time (conc, default 32), no stat per file. files rows are
//       [rel, -1, -1], bytes 0, the signatures hash the sorted rel names, T.names = true. No sizes: not for lib/vfs listings
//       (record sizes); fine for lib/sdlset createSource o.listing (names only).
//   ensure(modDir, {maxAgeMs = 15000, onProgress, signal}) -> Promise<T>   the last scan when younger than maxAgeMs and not
//     touched since, else one scan; callers at the same time share it. A caller's signal takes only that caller out: the
//     shared scan stops when every caller that waits for it has stopped.
//   fresh(modDir, maxAgeMs = Infinity) -> T | null   sync: the scan of this process when nothing touched the mod since and it
//     is younger than maxAgeMs; never the one kept in the store. For sync callers that cannot await ensure (gameview.withModsSync).
//   last(modDir) -> T | null   sync, whatever is known: the last scan of this process, else the one kept in the store
//     (a kept one is never taken as fresh: the first ensure walks again).
//   adopt(T) -> bool   T (a full scan made by another thread or the parent process of this run) becomes this process's fresh
//     scan of T.dir, unless this process has a newer one; names-only T refused. Not stored.
//   touch(modDir)   the next ensure scans again, also when a scan is running now (it may have read the folder before the
//     write). Call after any write into the mod.
//   stamps(T, areas) -> {'mod:set': sig, ...}   for lib/cachestore. areas: area names and/or 'all'; none given = {'mod:all'};
//     [] = {} (game only); T null = '' values.
//   Store: the last T of each mod is kept in lib/cachestore (section 'modtree', parts {mod}), written only when `all` moved.
//     cachestore is required inside a try: missing or throwing = memory only. A test process (and what it starts) gets a
//     scratch store, never the user's (cachestore open).
//   Native listing: on Windows, when tools/scan/bin/arscan.exe is built (node tools/scan/build.js), the listing comes from it
//     (one FindFirstFileExW per folder, no stat per file), same rows, so T is the same byte for byte; on any failure of it the
//     node walk runs. Names-only scans always walk with node (no stat to save). ARSENAL_NATIVE_SCAN=0 = the node walk only.
//     The node walk starts first and hands over at 3000 files (ARSENAL_NATIVE_MIN, 0 = native at once): starting the helper costs
//     about 30 ms, more than a whole small mod's walk.
//   AREAS, VER; _reset({store}) for tests (store: null = memory only, an object = that store, absent = the real one again).
// Author: Imperator_Aug (ARSENAL, ia-f2171acf)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const AREAS = ['set', 'entity', 'map', 'properties', 'interface', 'script', 'text', 'pak', 'other'];
const RES = new Set(['set', 'entity', 'map', 'properties', 'interface', 'script']);
const SKIP_DIR = new Set(['.git', '.svn', '.arsenal', 'node_modules']), UNDO = '.arsenal-undo';
const VER = 1, SECTION = 'modtree', MAX_DEPTH = 64, RUN_N = 200, CONC = 32, NATIVE_MIN = 3000;
// loaded here, not at the first store use: a test process then names its scratch store (cachestore testRoot) before it starts
// any child, so no child writes a T into the user's store. Still inside a try: missing or throwing = memory only.
try { require('./cachestore'); } catch (e) { /* memory only */ }

function areaOf(rel) {
  const l = String(rel).toLowerCase();
  if (l.endsWith('.pak') || /^\d+\.pat$/.test(l)) return 'pak';
  if (l.startsWith('resource/')) { const i = l.indexOf('/', 9); if (i > 0 && RES.has(l.slice(9, i))) return l.slice(9, i); }
  if (l.endsWith('.lng') || l.startsWith('localization/')) return 'text';
  return 'other';
}

const turn = () => new Promise(r => setImmediate(r));
const abortErr = () => Object.assign(new Error('modtree: scan stopped'), { name: 'AbortError', code: 'ABORT_ERR' });
const sha = () => crypto.createHash('sha1');

// list + stat through the thread pool, CONC at a time (stat is the slow part on Windows: 112k files took 10 s one by one on
// the loop, 3.4 s this way, and the loop stays free). rows: [row text, [rel, size, mtimeMs]] in arrival order.
// o.names: no stat, a file is a row as soon as its folder is listed; o.conc: reads at a time; o.restorePoints: walk .arsenal-undo
function collect(dir, signal, onProgress, o = {}) {
  const conc = Math.max(1, Number(o.conc) || CONC), names = !!o.names, rp = !!o.restorePoints;
  return new Promise((res, rej) => {
    const rows = [], dirs = [['', 0]], files = []; rows.left = [];
    let live = 0, done = false, count = 0, since = 0;
    const end = (err) => { if (done) return; done = true; if (signal) signal.removeEventListener('abort', onAbort); if (err) rej(err); else res(rows); };
    const onAbort = () => end(abortErr());
    const skip = nm => { const l = nm.toLowerCase(); return SKIP_DIR.has(l) || (!rp && l === UNDO); };
    const pump = () => {
      while (!done && live < conc) {
        if (files.length) {
          const rel = files.pop(); live++;
          fs.stat(path.join(dir, rel), (err, st) => {
            live--; if (done) return;
            if (!err) { rows.push([rel + '|' + st.size + '|' + st.mtimeMs, [rel, st.size, st.mtimeMs]]); count++; if (++since >= RUN_N) { since = 0; if (onProgress) onProgress({ count }); } }
            pump();                                   // gone meanwhile: left out
          });
        } else if (dirs.length) {
          const [rd, depth] = dirs.pop(); live++;
          fs.readdir(rd ? path.join(dir, rd) : dir, { withFileTypes: true }, (err, es) => {
            live--; if (done) return;
            if (err) { if (!rd) return end(err); return pump(); }
            for (const e of es) {
              const rel = rd ? rd + '/' + e.name : e.name;
              if (e.isSymbolicLink()) { rows.left.push(rel); continue; }
              if (e.isDirectory()) { if (!skip(e.name) && depth < MAX_DEPTH) dirs.push([rel, depth + 1]); else rows.left.push(rel); }
              else if (e.isFile()) {
                if (!names) files.push(rel);
                else { rows.push([rel, [rel, -1, -1]]); count++; if (++since >= RUN_N) { since = 0; if (onProgress) onProgress({ count }); } }
              } else rows.left.push(rel);
            }
            pump();
          });
        } else break;
      }
      if (!done && !live && !files.length && !dirs.length) end();
    };
    if (signal) { if (signal.aborted) return end(abortErr()); signal.addEventListener('abort', onAbort); }
    pump();
  });
}

// the listing: tools/scan's native lister (Windows, when built) gives the same rows as collect; any failure of it = collect.
// ARSENAL_NATIVE_SCAN=0 = collect only. Progress counts never go back when the node walk takes over part way.
let NATIVE;
function native() { if (NATIVE === undefined) { try { NATIVE = require('../scan/native.js'); } catch (e) { NATIVE = null; } } return NATIVE; }
async function list(dir, signal, onProgress, o) {
  const nat = native();
  let top = 0;
  const prog = onProgress && (p => { if (p.count >= top) { top = p.count; onProgress(p); } });
  if (!(nat && !o.names && nat.available())) return collect(dir, signal, prog, o);   // names only: no stat to save, the node walk is faster
  // the node walk first: a small tree is done before a child program would have started (about 1.5 ms against 30 ms for a few
  // files); a tree past NATIVE_MIN files stops it and lists again with the native lister. ARSENAL_NATIVE_MIN=<n>, 0 = native at once
  const min = /^\d+$/.test(process.env.ARSENAL_NATIVE_MIN || '') ? +process.env.ARSENAL_NATIVE_MIN : NATIVE_MIN;
  if (min > 0) {
    if (signal && signal.aborted) throw abortErr();
    const ac = new AbortController(), outer = () => ac.abort();
    let big = false;
    if (signal) signal.addEventListener('abort', outer);
    try {
      return await collect(dir, ac.signal, p => { if (prog) prog(p); if (!big && p.count >= min) { big = true; ac.abort(); } }, o);
    } catch (e) {
      if (!big || (signal && signal.aborted)) throw e;
    } finally { if (signal) signal.removeEventListener('abort', outer); }
  }
  try { const rows = await nat.collect(dir, { signal, onProgress: prog, names: o.names, restorePoints: o.restorePoints, maxDepth: MAX_DEPTH, runN: RUN_N, abortErr }); nat.stats.native++; return rows; }
  catch (e) { if (e && e.code === 'ABORT_ERR') throw e; nat.stats.fallback++; nat.stats.why = String(e && e.message || e); }
  return collect(dir, signal, prog, o);
}

async function walk(dir, o) {
  const signal = o.signal, onProgress = typeof o.onProgress === 'function' ? o.onProgress : null;
  const stop = () => { if (signal && signal.aborted) throw abortErr(); };
  const step = async () => { await turn(); stop(); };
  const rows = await list(dir, signal, onProgress, o);
  const count = rows.length; let bytes = 0;
  if (!o.names) for (const r of rows) bytes += r[1][1];
  // sort in slices (a 100k-row sort in one go holds the loop too long), then merge them
  const SL = 4096, parts = [];
  for (let i = 0; i < rows.length; i += SL) { parts.push(rows.slice(i, i + SL).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))); await step(); }
  while (parts.length > 1) {
    const next = [];
    for (let i = 0; i < parts.length; i += 2) {
      const a = parts[i], b = parts[i + 1];
      if (!b) { next.push(a); continue; }
      const m = new Array(a.length + b.length); let x = 0, y = 0, k = 0;
      while (x < a.length && y < b.length) {
        m[k++] = a[x][0] <= b[y][0] ? a[x++] : b[y++];
        if ((k & 8191) === 0) await step();
      }
      while (x < a.length) m[k++] = a[x++];
      while (y < b.length) m[k++] = b[y++];
      next.push(m);
    }
    parts.splice(0, parts.length, ...next);
  }
  const sorted = parts[0] || [], all = sha(), hs = {}, files = new Array(sorted.length);
  for (const a of AREAS) hs[a] = sha();
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i][0] + '\n';
    all.update(row); hs[areaOf(sorted[i][1][0])].update(row); files[i] = sorted[i][1];
    if ((i & 4095) === 4095) await step();
  }
  const areas = {};
  for (const a of AREAS) areas[a] = hs[a].digest('hex');
  if (onProgress) onProgress({ count });
  const T = { dir, at: Date.now(), count, bytes, all: all.digest('hex'), areas, files, left: rows.left.sort() };
  if (o.names) T.names = true;
  return T;
}

// ---------- what is known per mod
const MODS = new Map();     // key -> {dir, key, t, tGen, gen, run, kept, loaded}
const keyOf = d => { const p = path.resolve(String(d)).replace(/\\/g, '/'); return process.platform === 'win32' ? p.toLowerCase() : p; };
function ent(modDir) {
  if (!modDir) throw new Error('modtree: no mod folder given');
  const key = keyOf(modDir);
  let e = MODS.get(key);
  if (!e) MODS.set(key, e = { dir: path.resolve(String(modDir)), key, t: null, tGen: -1, gen: 0, run: null, kept: null, loaded: false });
  return e;
}

let STORE, FIXED = false;   // undefined = not asked yet, null = none
function store() {
  if (STORE === undefined && !FIXED) { try { STORE = require('./cachestore').open(); } catch (e) { STORE = null; } }
  return STORE || null;
}
const isT = v => !!v && typeof v === 'object' && typeof v.all === 'string' && !!v.areas && Array.isArray(v.files);
function load(e) {
  if (e.loaded) return;
  e.loaded = true;
  try { const S = store(), r = S && S.get(SECTION, VER, { mod: e.key }, {}); if (r && isT(r.value)) { e.kept = r.value.all; if (!e.t) e.t = r.value; } } catch (x) { /* memory only */ }
}
function keep(e, T, gen) {
  if (gen < e.tGen) return;                 // an older walk that ended late
  load(e);
  e.t = T; e.tGen = gen;
  if (e.kept === T.all) return;
  try { const S = store(); if (S) { S.put(SECTION, VER, { mod: e.key }, {}, T); e.kept = T.all; } } catch (x) { /* memory only */ }
}

async function scan(modDir, o = {}) {
  const e = ent(modDir), gen = e.gen;
  const T = await walk(e.dir, o);
  if (!o.names && !o.restorePoints) keep(e, T, gen);   // another shape than ensure's: not kept
  return T;
}

function ensure(modDir, o = {}) {
  let e; try { e = ent(modDir); } catch (x) { return Promise.reject(x); }
  const maxAge = o.maxAgeMs === undefined ? 15000 : Number(o.maxAgeMs) || 0;
  if (e.t && e.tGen === e.gen && Date.now() - e.t.at < maxAge) return Promise.resolve(e.t);
  let r = e.run;
  if (!r || r.gen !== e.gen) {
    const ctl = new AbortController(), gen = e.gen, cbs = new Set();
    r = e.run = { gen, ctl, cbs, waiters: 0, promise: null };
    const run = r;
    r.promise = walk(e.dir, { signal: ctl.signal, onProgress: p => { for (const f of cbs) { try { f(p); } catch (x) { /* a caller's own fault */ } } } })
      .then(T => { keep(e, T, gen); return T; })
      .finally(() => { if (e.run === run) e.run = null; });
  }
  const run = r, cb = typeof o.onProgress === 'function' ? o.onProgress : null, signal = o.signal;
  if (signal && signal.aborted) { run.promise.catch(() => {}); if (!run.waiters) run.ctl.abort(); return Promise.reject(abortErr()); }
  run.waiters++;
  if (cb) run.cbs.add(cb);
  return new Promise((res, rej) => {
    let left = false;
    const leave = () => { if (left) return; left = true; run.waiters--; if (cb) run.cbs.delete(cb); if (signal) signal.removeEventListener('abort', onAbort); };
    const onAbort = () => { leave(); if (!run.waiters) run.ctl.abort(); rej(abortErr()); };
    if (signal) signal.addEventListener('abort', onAbort);
    run.promise.then(T => { leave(); res(T); }, err => { leave(); rej(err); });
  });
}

function last(modDir) {
  if (!modDir) return null;
  const e = ent(modDir);
  if (!e.t) load(e);
  return e.t;
}
function fresh(modDir, maxAgeMs = Infinity) {
  if (!modDir) return null;
  const e = MODS.get(keyOf(modDir));
  return e && e.t && e.tGen === e.gen && Date.now() - e.t.at < maxAgeMs ? e.t : null;
}
function touch(modDir) { if (modDir) ent(modDir).gen++; }
// a scan made elsewhere in the same run (another thread or a parent process that scanned the folder just before, e.g. a
// lib/sdlset o.listing, a --listing file) taken as this process's fresh scan of T.dir, so fresh() and gameview find it
// instead of walking again. A names-only T is refused (no sizes); a newer scan of this process is kept. Never stored.
function adopt(T) {
  if (!T || typeof T !== 'object' || !T.dir || T.names || !isT(T) || !Array.isArray(T.left)) return false;
  if (!T.files.every(r => Array.isArray(r) && typeof r[1] === 'number' && r[1] >= 0)) return false;   // a names-only shape without the flag
  const e = ent(T.dir);
  if (e.t && e.tGen === e.gen && e.t.at > T.at) return false;
  e.t = T; e.tGen = e.gen;
  return true;
}

function stamps(T, areas) {
  const out = {};
  for (const a of areas === undefined ? ['all'] : areas) {
    if (a !== 'all' && !AREAS.includes(a)) throw new Error('modtree: unknown area ' + a + ' (' + AREAS.join(', ') + ', all)');
    out['mod:' + a] = T ? (a === 'all' ? T.all : T.areas[a]) : '';
  }
  return out;
}

function _reset(o = {}) {
  for (const e of MODS.values()) if (e.run) { e.run.promise.catch(() => {}); e.run.ctl.abort(); }
  MODS.clear();
  if ('store' in o) { STORE = o.store; FIXED = true; } else { STORE = undefined; FIXED = false; }
}

module.exports = { scan, ensure, last, fresh, touch, adopt, stamps, areaOf, AREAS, VER, _reset };
